#!/bin/bash
# rt-crypto-core: crypto position coverage.
#   monitor -> settle -> snapshot -> enroll -> snapshot
# The core snapshot publishes BEFORE enroll, so a slow enrollment can never
# delay the book view (that starvation was the 2026-10-21/22 lane failure);
# the second snapshot picks up whatever enrollment changed.
# Independent module: its own lock, its own timer, no dependency on the
# research or equity modules. PAPER ONLY — these are the existing proven
# scripts, unmodified; this runner only sequences them.
set -u
. "$(dirname "$0")/../../lib.sh"

rt_lock ${RT_LOCK_NAME:-crypto-core}

# Single-writer guard for THIS store: never run concurrently with another
# process operating on the same monitoring directory (pre-cutover that is
# the legacy agent lane, whose scripts live in the production store; an
# isolated comparison store has its own path and is unaffected).
MON=${RT_MON_DIR:-$RT_BASE/paper-signals/pilot/monitoring}
if pgrep -f "$MON/(monitor|settle|enroll)\.py" >/dev/null 2>&1; then
  echo "crypto-core: a core script for this store is already running; skipping this firing"
  exit 0
fi
rt_step monitor 480 python3 "$MON/monitor.py"
rt_step settle 600 python3 "$MON/settle.py"
rt_step snapshot 60 python3 "$RT_ENGINE/snapshot.py"
rt_step enroll 240 python3 "$MON/enroll.py"
rt_step snapshot_after_enroll 60 python3 "$RT_ENGINE/snapshot.py"
rt_write_lastrun crypto-core
echo "crypto-core: done $(date -u +%FT%TZ)"
