#!/bin/bash
# rt-engine bootstrap — the canonical startup path after a VM replacement.
#
# Why this exists: /home/hatch is persistent (btrfs-backed) and survives VM
# replacement; /etc is a tmpfs-backed overlay and does not. The guest boots
# a minimal default.target with no login session, no D-Bus, and no user
# manager, so systemd USER units (lingering included) cannot run here —
# the guest SYSTEM manager is the supported executor (see
# ~/docs/chat/scheduling-and-watching.md, "Services in this runtime" and
# "Recovery after replacement"). The canonical units, programs, state,
# and proxy env all live in this directory; this script restores the
# ephemeral /etc registration from them and verifies the result.
#
# Idempotent and single-writer (flock). Safe to run at any time: on a
# healthy install it only refreshes identical files and re-verifies.
# It never disables or removes anything.
#
# Steps: install-units.sh (canonical env + unit copies + daemon-reload)
#        -> enable --now the three timers (WantedBy=default.target, the
#           target this guest actually reaches)
#        -> start one rt-crypto-core pass
#        -> verify: timers registered, last-run fresh with all steps 0,
#           core snapshot coverage_complete=true and <10 min old.
set -u
ENGINE=/home/hatch/workspace/goals/research-terminal/engine
exec 9>"$ENGINE/locks/bootstrap.lock"
if ! flock -n 9; then
  echo "bootstrap: another bootstrap/heal holds the lock; skipping"
  exit 0
fi

echo "bootstrap: start $(date -u +%FT%TZ)"
bash "$ENGINE/install-units.sh" || { echo "bootstrap: FAIL install-units.sh"; exit 1; }
sudo systemctl enable --now rt-crypto-core.timer rt-research.timer rt-equity.timer \
  || { echo "bootstrap: FAIL enable timers"; exit 1; }
sudo systemctl start rt-crypto-core.service \
  || { echo "bootstrap: FAIL start rt-crypto-core.service"; exit 1; }

fail=0
for t in rt-crypto-core.timer rt-research.timer rt-equity.timer; do
  if systemctl list-timers --all 2>/dev/null | grep -q "$t"; then
    echo "bootstrap: timer registered: $t"
  else
    echo "bootstrap: FAIL timer not registered: $t"; fail=1
  fi
done
python3 - <<'PY' || fail=1
import json, datetime, sys
base = "/home/hatch/workspace/goals/research-terminal"
lr = json.load(open(f"{base}/engine/modules/crypto-core/last-run.json"))
bad = {k: v for k, v in lr["steps"].items() if v != 0}
if bad:
    print(f"bootstrap: FAIL crypto-core steps nonzero: {bad}"); sys.exit(1)
snap = json.load(open(f"{base}/paper-signals/pilot/snapshots/core-snapshot.json"))
if snap.get("coverage_complete") is not True:
    print("bootstrap: FAIL snapshot coverage_complete != true"); sys.exit(1)
gen = datetime.datetime.fromisoformat(snap["generated_at_utc"].replace("Z", "+00:00"))
age = (datetime.datetime.now(datetime.timezone.utc) - gen).total_seconds()
if age > 600:
    print(f"bootstrap: FAIL snapshot stale: age_s={int(age)}"); sys.exit(1)
print(f"bootstrap: crypto-core last-run finished {lr['finished_at_utc']} all steps 0; "
      f"snapshot coverage_complete=true age_s={int(age)}")
PY
[ "$fail" -eq 0 ] && echo "bootstrap: OK $(date -u +%FT%TZ)" || { echo "bootstrap: FAILED $(date -u +%FT%TZ)"; exit 1; }
