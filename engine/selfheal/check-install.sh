#!/bin/bash
# rt-engine install checker — READ-ONLY. Prints exactly one verdict line:
#   MISSING: <what is missing>            (install state demonstrably gone)
#   STALE: snapshot_age_min=<n>           (install present, core snapshot old)
#   HEALTHY: snapshot_age_min=<n>         (install present, snapshot fresh)
# Used by the rt-engine-install-watchdog cron (bounded self-heal, 2026-10-23).
# A STALE verdict must trigger diagnosis only, never an automatic reinstall:
# a worker may be running. A MISSING verdict is the only heal trigger.
set -u
SNAP=/home/hatch/workspace/goals/research-terminal/paper-signals/pilot/snapshots/core-snapshot.json
missing=""
[ -f /etc/rt-engine/env ] || missing="$missing /etc/rt-engine/env"
for u in rt-crypto-core rt-research rt-equity; do
  [ -f "/etc/systemd/system/$u.service" ] || missing="$missing $u.service"
  [ -f "/etc/systemd/system/$u.timer" ] || missing="$missing $u.timer"
done
if [ -z "$missing" ]; then
  if ! systemctl list-timers --all 2>/dev/null | grep -q "rt-crypto-core.timer"; then
    missing="$missing rt-timers-not-registered"
  fi
fi
if [ -n "$missing" ]; then
  echo "MISSING:$missing"
  exit 0
fi
age_min=$(python3 - "$SNAP" <<'PY'
import json, sys, datetime
try:
    d = json.load(open(sys.argv[1]))
    gen = datetime.datetime.fromisoformat(d["generated_at_utc"].replace("Z", "+00:00"))
    now = datetime.datetime.now(datetime.timezone.utc)
    print(int((now - gen).total_seconds() // 60))
except Exception:
    print(99999)
PY
)
if [ "$age_min" -gt 40 ]; then
  echo "STALE: snapshot_age_min=$age_min"
else
  echo "HEALTHY: snapshot_age_min=$age_min"
fi
