#!/bin/bash
# rt-core: crypto position coverage core — monitor -> settle -> snapshot.
# Runs under systemd (zero agent launches). Single-writer guards:
#   - flock: only one rt-core run at a time
#   - pgrep: skip if the legacy agent lane's core scripts are mid-run
# Every step is hard time-boxed; a timed-out step is logged and the run continues.
set -u
BASE=/home/hatch/workspace/goals/research-terminal
MON=$BASE/paper-signals/pilot/monitoring

exec 9>"$BASE/engine/run-core.lock"
if ! flock -n 9; then
  echo "rt-core: another rt-core run holds the lock; skipping"
  exit 0
fi
if pgrep -f "monitoring/(monitor|settle|enroll)\.py" >/dev/null 2>&1; then
  echo "rt-core: legacy lane core script already running; skipping this firing"
  exit 0
fi

echo "rt-core: monitor start $(date -u +%FT%TZ)"
timeout 480 python3 "$MON/monitor.py"
echo "rt-core: monitor exit=$?"
echo "rt-core: settle start $(date -u +%FT%TZ)"
timeout 600 python3 "$MON/settle.py"
echo "rt-core: settle exit=$?"
python3 "$BASE/engine/snapshot.py"
echo "rt-core: snapshot exit=$?"
echo "rt-core: done $(date -u +%FT%TZ)"
