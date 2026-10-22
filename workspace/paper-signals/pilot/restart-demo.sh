#!/bin/bash
# Restart/resume demonstration (Workstream D, item 3) — PAPER ONLY.
# 1. Fresh DB. Start `pilot run` with a labeled 120s pre-observation hold.
# 2. While the candidate sits in awaiting-entry (qualification committed,
#    setup alert delivered, process sleeping in the hold), kill -9 the process.
# 3. Prove the DB still holds awaiting-entry + pending contract (no daemon).
# 4. Restart: `pilot tick` in a NEW process resumes from the persisted contract
#    row and completes entry inside the 15-min window; entry alert delivered.
set -u
PILOT="$HOME/workspace/goals/research-terminal/paper-signals/pilot"
LOG="$PILOT/evidence/restart-resume-2026-10-13.log"
DB="$PILOT/data/paper-pilot.sqlite"
CYCLE="restart-demo-2026-10-13"

ts() { date -u +"%Y-%m-%dT%H:%M:%S.%3NZ"; }
say() { echo "[$(ts)] $*" | tee -a "$LOG"; }

: > "$LOG"
say "RESTART/RESUME DEMO — paper pilot, no daemon, kill -9 mid-awaiting-entry"
say "DB: $DB (fresh) | cycle: $CYCLE"

rm -f "$DB" "$DB-wal" "$DB-shm" "$DB-journal"
say "fresh DB created (old removed)"

export PILOT_DB="$DB" PILOT_CYCLE_ID="$CYCLE" PILOT_PRE_OBSERVE_HOLD_MS=120000
cd "$PILOT"
say "starting: pilot run (ingest+tick) with 120s labeled pre-observation hold — backgrounded"
node dist/pilot.js run > "$PILOT/evidence/restart-run1-stdout.log" 2>&1 &
PID=$!
echo "$PID" > "$PILOT/evidence/restart-run1.pid"
say "pilot run PID=$PID"

say "waiting 35s for ingest + qualification commit (hold is 120s, kill window is wide)"
sleep 35

say "--- state BEFORE kill (fresh status probe, separate process) ---"
PILOT_PRE_OBSERVE_HOLD_MS=0 node dist/pilot.js status 2>&1 | tee -a "$LOG"
STATE=$(PILOT_PRE_OBSERVE_HOLD_MS=0 node dist/pilot.js status 2>/dev/null | grep -o 'status=[a-z-]*' | head -1)
say "candidate state before kill: $STATE"

if kill -0 "$PID" 2>/dev/null; then
  say "process $PID alive mid-hold -> sending kill -9"
  kill -9 "$PID"
  sleep 1
  if kill -0 "$PID" 2>/dev/null; then say "WARNING: process survived kill -9"; else say "process $PID dead (SIGKILL confirmed)"; fi
else
  say "WARNING: process $PID already exited before kill (state was: $STATE)"
fi

say "--- state AFTER kill, BEFORE restart (durable SQLite, no daemon running) ---"
PILOT_PRE_OBSERVE_HOLD_MS=0 node dist/pilot.js status 2>&1 | tee -a "$LOG"

say "restarting: NEW process 'pilot tick' (no hold) — the scheduled tick must resume awaiting-entry from the persisted contract row"
unset PILOT_PRE_OBSERVE_HOLD_MS
T0=$(date +%s)
node dist/pilot.js tick 2>&1 | tee -a "$LOG"
T1=$(date +%s)
say "restart tick completed in $((T1-T0))s"

say "--- FINAL state ---"
node dist/pilot.js status 2>&1 | tee -a "$LOG"
say "demo complete. Evidence: $PILOT/evidence/${CYCLE}.jsonl and alert outbox $PILOT/evidence/alert-outbox-${CYCLE}/"
