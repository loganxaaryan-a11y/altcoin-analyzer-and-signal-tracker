#!/bin/bash
# Shared entry-transition + durable outbox: race + restart verification tests.
#
# PAPER ONLY. No brokerage, no execution. Local code + tests only — nothing
# here touches the deployed artifact, the production ledger, or the scheduler.
#
#   a. RACE: wrapper and watcher observe the same entry concurrently →
#      exactly one accepted transition, exactly one outbox event.
#   b. RESTART AFTER ENQUEUE: crash after enqueue before send → no duplicate,
#      exactly one send on restart.
#   c. RESTART AFTER SEND BEFORE ACK: crash after send before ack →
#      entry stays UNKNOWN (never auto-marked delivered), exactly one send
#      on record, no duplicate delivery attempt; a late ack still earns
#      delivered (ack evidence is the only thing that does).
set -uo pipefail

PILOT="$HOME/workspace/goals/research-terminal/paper-signals/pilot"
cd "$PILOT"
npm run build >/dev/null 2>&1 || { echo "BUILD FAILED"; exit 1; }

TS=$(date -u +%Y%m%dT%H%M%SZ)
T="$PILOT/delivery/outbox-tests/run-$TS"
mkdir -p "$T"
OUTBOX="$PILOT/dist/entry-outbox-cli.js"
RESULTS="$T/results.json"

PASS=0
FAIL=0
declare -a NOTES

note() { NOTES+=("$1"); }

check() { # $1 = test name, $2 = "pass"|"fail", $3 = detail
  if [ "$2" = "pass" ]; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); fi
  note "[$2] $1 — $3"
  echo "[$2] $1 — $3"
}

jget() { # $1 = file, $2 = node expression over `d` (parsed JSON)
  node -e "const d=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')); const v=($2); console.log(typeof v==='object'?JSON.stringify(v):String(v));" "$1"
}

sends_lines() { # $1 = sends log path
  if [ -f "$1" ]; then wc -l < "$1" | tr -d ' '; else echo 0; fi
}

event_state() { # $1 = db
  node "$OUTBOX" status --db "$1" | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{const j=JSON.parse(s);console.log(j.events[0].state);})"
}

events_count() { # $1 = db
  node "$OUTBOX" status --db "$1" | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{console.log(JSON.parse(s).counts.events);})"
}

echo "=== outbox tests run $TS ==="
echo "evidence dir: $T"

# ---------------------------------------------------------------- a. RACE
echo "--- a. RACE: concurrent wrapper + watcher attempt on the same (contract, ENTRY_CONFIRMED, v1)"
DB_A="$T/outbox-race.sqlite"
OBS_AT="2026-10-15T00:00:00.000Z"
node "$OUTBOX" attempt --db "$DB_A" --contract ct_race1 --signal sig_race1 --candidate cand_race1 \
  --observed-by wrapper --observed-at "$OBS_AT" --hold-ms 600 > "$T/a-wrapper.json" 2>"$T/a-wrapper.err" &
P1=$!
sleep 0.2
node "$OUTBOX" attempt --db "$DB_A" --contract ct_race1 --signal sig_race1 --candidate cand_race1 \
  --observed-by watcher --observed-at "$OBS_AT" --hold-ms 600 > "$T/a-watcher.json" 2>"$T/a-watcher.err" &
P2=$!
wait $P1; R1=$?
wait $P2; R2=$?
A_WR=$(jget "$T/a-wrapper.json" "d.accepted")
A_WA=$(jget "$T/a-watcher.json" "d.accepted")
A_N=$(events_count "$DB_A")
A_ACC=0; [ "$A_WR" = "true" ] && A_ACC=$((A_ACC+1)); [ "$A_WA" = "true" ] && A_ACC=$((A_ACC+1))
check "a.race both processes exited 0" "$([ "$R1" = "0" ] && [ "$R2" = "0" ] && echo pass || echo fail)" "wrapper exit=$R1 watcher exit=$R2"
check "a.race exactly one accepted transition" "$([ "$A_ACC" = "1" ] && echo pass || echo fail)" "accepted: wrapper=$A_WR watcher=$A_WA"
check "a.race exactly one outbox event" "$([ "$A_N" = "1" ] && echo pass || echo fail)" "outbox rows=$A_N"
# a third attempt with the same triple must also be refused (durability of the uniqueness)
node "$OUTBOX" attempt --db "$DB_A" --contract ct_race1 --signal sig_race1 --candidate cand_race1 \
  --observed-by watcher --observed-at "$OBS_AT" > "$T/a-third.json" 2>/dev/null
A_THIRD=$(jget "$T/a-third.json" "d.accepted")
A_N2=$(events_count "$DB_A")
check "a.race third attempt refused, still one event" "$([ "$A_THIRD" = "false" ] && [ "$A_N2" = "1" ] && echo pass || echo fail)" "third accepted=$A_THIRD rows=$A_N2"

# ------------------------------------------------- b. RESTART AFTER ENQUEUE
echo "--- b. RESTART AFTER ENQUEUE: crash after accept, before send"
DB_B="$T/outbox-enqueue.sqlite"
node "$OUTBOX" attempt --db "$DB_B" --contract ct_b1 --signal sig_b1 --candidate cand_b1 \
  --observed-by wrapper --observed-at "$OBS_AT" --crash-after-attempt > "$T/b-attempt.json" 2>"$T/b-attempt.err" || true
B_ACC=$(jget "$T/b-attempt.json" "d.accepted")
B_STATE0=$(event_state "$DB_B")
# "restart": a fresh process dispatches
node "$OUTBOX" dispatch --db "$DB_B" --sender-mode ack --sends-log "$T/sends-b.jsonl" > "$T/b-dispatch.json" 2>"$T/b-dispatch.err"
B_TRY=$(jget "$T/b-dispatch.json" "d.attempted")
B_SENDS=$(sends_lines "$T/sends-b.jsonl")
B_STATE=$(event_state "$DB_B")
B_N=$(events_count "$DB_B")
check "b.enqueue transition accepted before crash" "$([ "$B_ACC" = "true" ] && echo pass || echo fail)" "accepted=$B_ACC"
check "b.enqueue pre-restart state pending (nothing sent)" "$([ "$B_STATE0" = "pending" ] && echo pass || echo fail)" "state=$B_STATE0"
check "b.enqueue exactly one send after restart" "$([ "$B_TRY" = "1" ] && [ "$B_SENDS" = "1" ] && echo pass || echo fail)" "dispatch.attempted=$B_TRY sends-log lines=$B_SENDS"
check "b.enqueue one outbox event, terminal state labeled simulated" "$([ "$B_N" = "1" ] && [ "$B_STATE" = "delivered_simulated" ] && echo pass || echo fail)" "rows=$B_N state=$B_STATE"
# idempotent re-dispatch: no duplicate send
node "$OUTBOX" dispatch --db "$DB_B" --sender-mode ack --sends-log "$T/sends-b.jsonl" > "$T/b-dispatch2.json" 2>/dev/null
B_SENDS2=$(sends_lines "$T/sends-b.jsonl")
check "b.enqueue re-dispatch sends nothing new" "$([ "$B_SENDS2" = "1" ] && echo pass || echo fail)" "sends-log lines still=$B_SENDS2"

# ------------------------------------------- c. RESTART AFTER SEND BEFORE ACK
echo "--- c. RESTART AFTER SEND BEFORE ACK: crash after send, before ack"
DB_C="$T/outbox-send.sqlite"
node "$OUTBOX" attempt --db "$DB_C" --contract ct_c1 --signal sig_c1 --candidate cand_c1 \
  --observed-by watcher --observed-at "$OBS_AT" > "$T/c-attempt.json" 2>/dev/null
C_ACC=$(jget "$T/c-attempt.json" "d.accepted")
C_EVT=$(jget "$T/c-attempt.json" "d.eventId")
node "$OUTBOX" dispatch --db "$DB_C" --sender-mode crash-after-send --sends-log "$T/sends-c.jsonl" > "$T/c-dispatch.json" 2>"$T/c-dispatch.err" || true
C_SENDS=$(sends_lines "$T/sends-c.jsonl")
C_STATE_CRASH=$(event_state "$DB_C")
# "restart": reconcile with NO ack evidence
echo '{}' > "$T/acks-c.json"
node "$OUTBOX" reconcile --db "$DB_C" --ack-store "$T/acks-c.json" > "$T/c-reconcile.json" 2>/dev/null
C_STATE=$(event_state "$DB_C")
C_ACKAT=$(node "$OUTBOX" status --db "$DB_C" | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{console.log(JSON.parse(s).events[0].ack_at);})")
C_SENDN=$(node "$OUTBOX" status --db "$DB_C" | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{console.log(JSON.parse(s).events[0].send_count);})")
# a subsequent dispatch must NOT re-send (unknown is never auto-retried)
node "$OUTBOX" dispatch --db "$DB_C" --sender-mode ack --sends-log "$T/sends-c.jsonl" > "$T/c-dispatch2.json" 2>/dev/null
C_SENDS2=$(sends_lines "$T/sends-c.jsonl")
C_TRY2=$(jget "$T/c-dispatch2.json" "d.attempted")
check "c.send transition accepted" "$([ "$C_ACC" = "true" ] && echo pass || echo fail)" "accepted=$C_ACC"
check "c.send exactly one send on record (crash was after the send)" "$([ "$C_SENDS" = "1" ] && [ "$C_SENDN" = "1" ] && echo pass || echo fail)" "sends-log lines=$C_SENDS send_count=$C_SENDN (state at crash=$C_STATE_CRASH)"
check "c.send stays UNKNOWN after restart (never auto-marked delivered)" "$([ "$C_STATE" = "unknown" ] && [ "$C_ACKAT" = "null" ] && echo pass || echo fail)" "state=$C_STATE ack_at=$C_ACKAT"
check "c.send no duplicate delivery attempt after restart" "$([ "$C_SENDS2" = "1" ] && [ "$C_TRY2" = "0" ] && echo pass || echo fail)" "sends-log lines=$C_SENDS2 dispatch.attempted=$C_TRY2"
# late ack evidence still earns delivered — ack is the ONLY thing that does
node -e "require('fs').writeFileSync(process.argv[1], JSON.stringify({[process.argv[2]]:{acked:true,ackId:'real-ack-c1',ackAt:'2026-10-15T00:05:00.000Z'}}))" "$T/acks-c2.json" "$C_EVT"
node "$OUTBOX" reconcile --db "$DB_C" --ack-store "$T/acks-c2.json" > "$T/c-reconcile2.json" 2>/dev/null
C_STATE2=$(event_state "$DB_C")
C_SENDS3=$(sends_lines "$T/sends-c.jsonl")
check "c.send late ack evidence earns delivered, still one send" "$([ "$C_STATE2" = "delivered" ] && [ "$C_SENDS3" = "1" ] && echo pass || echo fail)" "state=$C_STATE2 sends-log lines=$C_SENDS3"

# --------------------------------- d. HOOK INTEGRATION (both lanes, one outbox)
echo "--- d. HOOK INTEGRATION: wrapper-lane + watcher-lane builds share one outbox"
node test/outbox/hook-integration.mjs "$T/hook" > "$T/d-hook.out" 2>"$T/d-hook.err" || true
tail -1 "$T/d-hook.out" > "$T/d-hook.json"
grep -E '^\[(pass|fail)\]' "$T/d-hook.out" || true
D_PASS=$(node -e "try{const j=require(process.argv[1]);console.log(j.pass)}catch(e){console.log('parse-error')}" "$T/d-hook.json")
if [ "$D_PASS" = "true" ]; then
  N=$(node -e "const j=require(process.argv[1]);console.log(j.results.length)" "$T/d-hook.json")
  PASS=$((PASS+N))
  note "[pass] d.hook integration — all $N hook checks passed (evidence: $T/d-hook.json)"
else
  FAIL=$((FAIL+1))
  note "[fail] d.hook integration — see $T/d-hook.json and $T/d-hook.err"
  echo "[fail] d.hook integration"
fi

# --------------------------------- e. COMPETING WORKERS (arbiter protocol)
echo "--- e. COMPETING WORKERS: two lanes race the same entry end-to-end"
node test/outbox/competing-workers.mjs "$T/competing" > "$T/e-workers.out" 2> "$T/e-workers.err" || true
grep -E '^\[(pass|fail)\]' "$T/e-workers.out" || true
E_JSON=$(tail -1 "$T/e-workers.out")
E_PASS=$(node -e "try{console.log(JSON.parse(process.argv[1]).pass)}catch(e){console.log('parse-error')}" "$E_JSON")
E_N=$(node -e "try{console.log(JSON.parse(process.argv[1]).results.length)}catch(e){console.log(0)}" "$E_JSON")
E_FAILN=$(node -e "try{console.log(JSON.parse(process.argv[1]).failed)}catch(e){console.log('?')}" "$E_JSON")
if [ "$E_PASS" = "true" ]; then
  PASS=$((PASS+E_N))
  note "[pass] e.competing-workers — all $E_N checks passed (evidence: $T/e-workers.out)"
else
  FAIL=$((FAIL+1))
  note "[fail] e.competing-workers — $E_FAILN failed (see $T/e-workers.out and $T/e-workers.err)"
  echo "[fail] e.competing-workers"
fi

# ------------------------------------------------------------- results
{
  echo "{"
  echo "  \"run\": \"$TS\","
  echo "  \"evidence_dir\": \"$T\","
  echo "  \"pass\": $PASS,"
  echo "  \"fail\": $FAIL,"
  echo "  \"notes\": ["
  for i in "${!NOTES[@]}"; do
    q=$(printf '%s' "${NOTES[$i]}" | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>console.log(JSON.stringify(s)))")
    if [ "$i" -lt $((${#NOTES[@]}-1)) ]; then echo "    $q,"; else echo "    $q"; fi
  done
  echo "  ]"
  echo "}"
} > "$RESULTS"

echo "=== $PASS passed, $FAIL failed ==="
echo "results: $RESULTS"
[ "$FAIL" = "0" ]
