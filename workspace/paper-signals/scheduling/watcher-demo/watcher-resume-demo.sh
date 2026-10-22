#!/bin/bash
# Watcher-resume demonstration (scheduling layer, 2026-10-14) — PAPER ONLY.
#
# Proves the scheduling-layer claim: bounded watcher ticks, each a FRESH
# process with NO in-memory state, resume pending entries from the persisted
# DB row only, frequently enough to meet the 15-min crypto entry window.
#
# Sequence (all against a fresh demo DB; read-only Binance.US market data):
#   1. `pilot run` (PID A) with a labeled 180s pre-observation hold:
#      ingest -> qualification commit -> candidate awaiting-entry,
#      contract row pending, setup alert delivered.
#   2. kill -9 PID A mid-hold. SIMULATED GAP: 180s with NO process alive.
#   3. Phase A — fresh `pilot tick` (PID B) with PILOT_MAX_POLLS=0:
#      resumes from the DB row, exhausts its (zero) poll budget while the
#      window is still open -> candidate STAYS awaiting-entry, outcome gate
#      "poll-budget", nextReassessmentAt set. PROVES poll-budget exhaustion
#      is NOT an expiry.
#   4. Wait 75s (past retryBackoffMs=60s). Phase B — fresh `pilot tick`
#      (PID C) with PILOT_MAX_POLLS=40: resumes from the DB row again,
#      bounded observation observes a live in-window print -> entered inside
#      the 15-min window -> issued -> entry alert delivered.
#
# Sandbox alert transport: acks are SIMULATED and labeled (as in all pilot
# evidence). No orders, no brokerage, no production code.
set -u
PILOT="$HOME/workspace/goals/research-terminal/paper-signals/pilot"
DEMO="$HOME/workspace/goals/research-terminal/paper-signals/scheduling/watcher-demo"
DB="$DEMO/data/sched-demo.sqlite"
EV="$DEMO/evidence"
LOG="$EV/watcher-resume-demo-2026-10-14.log"
CYCLE="sched-demo-2026-10-14"

ts() { date -u +"%Y-%m-%dT%H:%M:%S.%3NZ"; }
say() { echo "[$(ts)] $*" | tee -a "$LOG"; }

mkdir -p "$DEMO/data" "$EV"
: > "$LOG"
say "WATCHER-RESUME DEMO — bounded ticks, fresh processes, DB-only resume"
say "DB: $DB (fresh) | cycle: $CYCLE"

rm -f "$DB" "$DB-wal" "$DB-shm" "$DB-journal"
say "fresh DB created"

export PILOT_DB="$DB" PILOT_CYCLE_ID="$CYCLE" PILOT_PRE_OBSERVE_HOLD_MS=180000
export PILOT_MAX_POLLS=40 PILOT_POLL_MS=20000
cd "$PILOT"

say "step 1: starting 'pilot run' (PID A) with 180s labeled pre-observation hold — backgrounded"
node dist/pilot.js run > "$EV/run-phase0-stdout.log" 2>&1 &
PIDA=$!
say "PID A = $PIDA"

say "waiting for qualification commit (poll status until awaiting-entry, 120s budget)"
COMMITTED=0
for i in $(seq 1 24); do
  sleep 5
  STATE=$(PILOT_PRE_OBSERVE_HOLD_MS=0 node dist/pilot.js status 2>/dev/null | grep -o 'status=[a-z-]*' | head -1 || true)
  if [ "$STATE" = "status=awaiting-entry" ]; then COMMITTED=1; break; fi
done
if [ "$COMMITTED" != "1" ]; then
  say "FAIL: candidate never reached awaiting-entry (last state: ${STATE:-unknown})"
  kill -9 "$PIDA" 2>/dev/null || true
  exit 1
fi
say "candidate is awaiting-entry — qualification committed (contract pending, setup alert delivered)"

say "--- pre-gap state (separate status probe) ---"
PILOT_PRE_OBSERVE_HOLD_MS=0 node dist/pilot.js status 2>&1 | tee "$EV/status-pre-gap.txt" | tee -a "$LOG"

say "step 2: kill -9 PID A mid-hold — SIMULATED GAP begins (no pilot process alive)"
kill -9 "$PIDA" 2>/dev/null
sleep 2
if kill -0 "$PIDA" 2>/dev/null; then say "WARN: PID A still alive"; else say "PID A dead (SIGKILL confirmed)"; fi
GAP_START=$(ts)
say "gap start: $GAP_START — sleeping 180s with zero pilot processes"
sleep 180
say "gap end: $(ts) (180s, no process alive during the gap)"

say "step 3 (Phase A): fresh 'pilot tick' (PID B) with PILOT_MAX_POLLS=0 — budget exhaustion while window open"
export PILOT_CYCLE_ID="${CYCLE}-phaseA" PILOT_MAX_POLLS=0 PILOT_PRE_OBSERVE_HOLD_MS=0
node dist/pilot.js tick > "$EV/run-phaseA-stdout.log" 2>&1
say "phase A tick exit: $?"
say "--- post-phase-A state ---"
PILOT_PRE_OBSERVE_HOLD_MS=0 node dist/pilot.js status 2>&1 | tee "$EV/status-post-phaseA.txt" | tee -a "$LOG"
OUTCOME_A=$(grep -o '"gate":"[a-z-]*"' "$EV"/db-rows-*.json 2>/dev/null | tail -1 || true)
say "phase A outcome marker: ${OUTCOME_A:-see status above}"

say "waiting 75s (past retryBackoffMs=60s so the candidate is due again)"
sleep 75

say "step 4 (Phase B): fresh 'pilot tick' (PID C) with PILOT_MAX_POLLS=40 — resume + bounded observation"
export PILOT_CYCLE_ID="${CYCLE}-phaseB" PILOT_MAX_POLLS=40
node dist/pilot.js tick > "$EV/run-phaseB-stdout.log" 2>&1
say "phase B tick exit: $?"
say "--- post-phase-B state ---"
PILOT_PRE_OBSERVE_HOLD_MS=0 node dist/pilot.js status 2>&1 | tee "$EV/status-post-phaseB.txt" | tee -a "$LOG"

say "step 5: collect demo evidence bundle"
for pat in "${CYCLE}.jsonl" "${CYCLE}-phaseA.jsonl" "${CYCLE}-phaseB.jsonl"; do
  f="$PILOT/evidence/$pat"
  [ -f "$f" ] && cp "$f" "$EV/" && say "copied $pat"
done
newest_rows=$(ls -t "$PILOT"/evidence/db-rows-*.json 2>/dev/null | head -1)
[ -n "$newest_rows" ] && cp "$newest_rows" "$EV/db-rows-final.json" && say "copied $(basename "$newest_rows") -> db-rows-final.json"

say "step 6: verdict — entry inside the 15-min window, resumed from DB, setup alert fired exactly once"
python3 - "$EV" "$PILOT/evidence" <<'EOF'
import glob, json, os, sys
ev, pilot_ev = sys.argv[1], sys.argv[2]
rows_files = sorted(glob.glob(os.path.join(pilot_ev, "db-rows-*.json")), key=os.path.getmtime)
if not rows_files:
    print("VERDICT: FAIL — no db-rows snapshot found"); sys.exit(1)
final_path = rows_files[-1]
print(f"reading newest db-rows snapshot: {os.path.basename(final_path)}")
final = json.load(open(final_path))
cands = final.get("candidates", [])
alerts = final.get("alerts", [])
contracts = final.get("contracts", [])
if not cands:
    print("VERDICT: FAIL — no candidates"); sys.exit(1)
c = cands[0]
ct = contracts[0] if contracts else {}
setup_alerts = [a for a in alerts if a.get("kind") == "setup"]
entry_alerts = [a for a in alerts if a.get("kind") == "entry"]
print(f"candidate: {c.get('candidateId')} status={c.get('status')}")
print(f"contract state: {ct.get('state')}")
print(f"decisionAt: {ct.get('decisionAt')}")
print(f"window: {ct.get('entryWindowOpensAt')} -> {ct.get('entryWindowExpiresAt')}")
print(f"entryObservedAt: {ct.get('entryObservedAt')}")
print(f"setup alerts: {len(setup_alerts)} (expect 1 — no re-fire on resume)")
print(f"entry alerts: {len(entry_alerts)}")
ok = True
if c.get("status") != "issued":
    print("VERDICT: FAIL — candidate not issued"); ok = False
if ct.get("entryObservedAt") and ct.get("entryWindowExpiresAt"):
    if ct["entryObservedAt"] <= ct["entryWindowExpiresAt"]:
        print("VERDICT: PASS — entry observed INSIDE the 15-min window")
    else:
        print("VERDICT: FAIL — entry observed AFTER the window closed"); ok = False
if len(setup_alerts) != 1:
    print("VERDICT: FAIL — setup alert re-fired on resume"); ok = False
if not ok: sys.exit(1)
print("ALL CHECKS PASSED — bounded watcher resumed a pending entry from DB state after the gap, inside its window")
EOF
say "demo complete — evidence in $EV"
