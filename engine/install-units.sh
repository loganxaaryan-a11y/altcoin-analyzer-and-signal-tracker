#!/bin/bash
# Install the rt-engine systemd units and the shared egress-proxy env file.
#
# - The CANONICAL env file is $ENGINE/env, in persistent home storage
#   (/home/hatch survives VM replacement; /etc does not). It receives the
#   proxy variables from THIS shell's environment (values are never
#   printed), mode 600. If THIS shell carries no proxy variables but a
#   canonical file already exists, the canonical file is kept instead of
#   being overwritten with an empty one.
# - /etc/rt-engine/env is refreshed as a compatibility copy (same values).
# - The three module units are copied to /etc/systemd/system and the daemon
#   is reloaded. The canonical unit files stay in $ENGINE/systemd/.
# - Timers are NOT enabled here. Enabling a timer is the cutover step and
#   happens only after the comparison passes.
set -eu
ENGINE=/home/hatch/workspace/goals/research-terminal/engine

env_tmp=$(mktemp)
trap 'rm -f "$env_tmp"' EXIT
for v in http_proxy https_proxy HTTP_PROXY HTTPS_PROXY ALL_PROXY all_proxy no_proxy NO_PROXY; do
  if [ -n "${!v:-}" ]; then printf '%s=%s\n' "$v" "${!v}"; fi
done > "$env_tmp"
if [ -s "$env_tmp" ]; then
  cp "$env_tmp" "$ENGINE/env"
  chmod 600 "$ENGINE/env"
  echo "canonical env written: $ENGINE/env ($(wc -l < "$ENGINE/env") variables, values not shown)"
elif [ -f "$ENGINE/env" ]; then
  echo "this shell has no proxy variables; keeping existing canonical $ENGINE/env ($(wc -l < "$ENGINE/env") variables)"
else
  echo "WARNING: no proxy variables in this shell and no canonical env exists yet" >&2
fi
if [ -f "$ENGINE/env" ]; then
  sudo mkdir -p /etc/rt-engine
  sudo cp "$ENGINE/env" /etc/rt-engine/env
  sudo chmod 600 /etc/rt-engine/env
  echo "compat env refreshed: /etc/rt-engine/env"
fi

for u in rt-crypto-core rt-research rt-equity; do
  sudo cp "$ENGINE/systemd/$u.service" "$ENGINE/systemd/$u.timer" /etc/systemd/system/
done
sudo systemctl daemon-reload
echo "units installed; timers intentionally NOT enabled (cutover step)"
systemctl list-timers --all 2>/dev/null | grep -E "rt-(crypto-core|research|equity)" || echo "confirmed: no rt module timers enabled"
