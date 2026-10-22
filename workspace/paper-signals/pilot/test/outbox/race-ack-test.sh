#!/bin/bash
# Entry-observation TEST exercise part 2 — PAPER ONLY, TEST records only.
# Scratch DBs under the given dir. Nothing touches the deployed artifact,
# the production ledger, or any metric cohort.
#
# f. TEST-LABELED RACE: two concurrent workers attempt the same
#    (TEST-contract, ENTRY_CONFIRMED, v1) -> exactly one accepted.
# g. TEST-LABELED REAL ACK PATH: attempt -> dispatch (noack) -> unknown
#    (never auto-retried, never auto-marked delivered) -> reconcile with
#    REAL (non-simulated) ack evidence -> delivered, still one send.
set -uo pipefail

PILOT="$HOME/workspace/goals/research-terminal/paper-signals/pilot"
T="${1:?usage: race-ack-test.sh <scratch-dir>}"
mkdir -p "$T"
OUTBOX="$PILOT/dist/entry-outbox-cli.js"
PASS=0; FAIL=0
check() { # $1 name $2 pass|fail $3 detail
  if [ "$2" = "pass" ]; then PASS=$((PASS+1)); else FAIL=$((FAIL+1)); fi
  echo "[$2] $1 — $3"
}
jget() { node -e "const d=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));const v=($2);console.log(typeof v==='object'?JSON.stringify(v):String(v));" "$1"; }
ev_state() { node "$OUTBOX" status --db "$1" | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>console.log(JSON.parse(s).events[0].state));"; }
ev_count() { node "$OUTBOX" status --db "$1" | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>console.log(JSON.parse(s).counts.events));"; }

echo "--- f. TEST-LABELED RACE: concurrent wrapper + watcher on TEST-ct_race1"
DB_F="$T/test-race.sqlite"
OBS_AT="2026-10-15T00:00:00.000Z"
node "$OUTBOX" attempt --db "$DB_F" --contract TEST-ct_race1 --signal TEST-sig_race1 --candidate TEST-cand_race1 \
  --observed-by wrapper --observed-at "$OBS_AT" --hold-ms 600 > "$T/f-wrapper.json" 2>"$T/f-wrapper.err" &
P1=$!; sleep 0.2
node "$OUTBOX" attempt --db "$DB_F" --contract TEST-ct_race1 --signal TEST-sig_race1 --candidate TEST-cand_race1 \
  --observed-by watcher --observed-at "$OBS_AT" --hold-ms 600 > "$T/f-watcher.json" 2>"$T/f-watcher.err" &
P2=$!; wait $P1; R1=$?; wait $P2; R2=$?
F_WR=$(jget "$T/f-wrapper.json" "d.accepted"); F_WA=$(jget "$T/f-watcher.json" "d.accepted")
F_N=$(ev_count "$DB_F"); F_ACC=0
[ "$F_WR" = "true" ] && F_ACC=$((F_ACC+1)); [ "$F_WA" = "true" ] && F_ACC=$((F_ACC+1))
check "f.race both workers exited 0" "$([ "$R1" = "0" ] && [ "$R2" = "0" ] && echo pass || echo fail)" "wrapper exit=$R1 watcher exit=$R2"
check "f.race exactly one accepted transition" "$([ "$F_ACC" = "1" ] && echo pass || echo fail)" "accepted: wrapper=$F_WR watcher=$F_WA"
check "f.race exactly one outbox event" "$([ "$F_N" = "1" ] && echo pass || echo fail)" "outbox rows=$F_N"
check "f.race TEST labels preserved" "$(node "$OUTBOX" status --db "$DB_F" | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{const j=JSON.parse(s);console.log(j.events[0].contract_id.startsWith('TEST-')?'pass':'fail');})")" "contract_id TEST- prefixed"

echo "--- g. TEST-LABELED REAL ACK PATH: noack -> unknown -> real ack -> delivered"
DB_G="$T/test-ack.sqlite"
EVT_G=""
node "$OUTBOX" attempt --db "$DB_G" --contract TEST-ct_ack1 --signal TEST-sig_ack1 --candidate TEST-cand_ack1 \
  --observed-by watcher --observed-at "$OBS_AT" > "$T/g-attempt.json" 2>/dev/null
G_ACC=$(jget "$T/g-attempt.json" "d.accepted"); EVT_G=$(jget "$T/g-attempt.json" "d.eventId")
check "g.ack transition accepted" "$([ "$G_ACC" = "true" ] && echo pass || echo fail)" "accepted=$G_ACC event=$EVT_G"
# dispatch with NO ack evidence -> unknown
node "$OUTBOX" dispatch --db "$DB_G" --sender-mode noack --sends-log "$T/sends-g.jsonl" > "$T/g-dispatch.json" 2>/dev/null
G_TRY=$(jget "$T/g-dispatch.json" "d.attempted")
G_SENDS=$(wc -l < "$T/sends-g.jsonl" | tr -d ' ')
G_STATE=$(ev_state "$DB_G")
check "g.ack send attempted once, no ack -> UNKNOWN" "$([ "$G_TRY" = "1" ] && [ "$G_STATE" = "unknown" ] && echo pass || echo fail)" "attempted=$G_TRY sends=$G_SENDS state=$G_STATE"
# re-dispatch must NOT retry unknown
node "$OUTBOX" dispatch --db "$DB_G" --sender-mode ack --sends-log "$T/sends-g.jsonl" > "$T/g-dispatch2.json" 2>/dev/null
G_TRY2=$(jget "$T/g-dispatch2.json" "d.attempted"); G_SENDS2=$(wc -l < "$T/sends-g.jsonl" | tr -d ' ')
check "g.ack unknown never auto-retried" "$([ "$G_TRY2" = "0" ] && [ "$G_SENDS2" = "1" ] && echo pass || echo fail)" "attempted=$G_TRY2 sends-log=$G_SENDS2"
# reconcile with REAL (non-simulated) ack evidence -> delivered
node -e "require('fs').writeFileSync(process.argv[1], JSON.stringify({[process.argv[2]]:{acked:true,simulated:false,ackId:'TEST-real-ack-1',ackAt:'2026-10-15T00:07:00.000Z'}}))" "$T/acks-g.json" "$EVT_G"
node "$OUTBOX" reconcile --db "$DB_G" --ack-store "$T/acks-g.json" > "$T/g-reconcile.json" 2>/dev/null
G_STATE2=$(ev_state "$DB_G")
G_ACKID=$(node "$OUTBOX" status --db "$DB_G" | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>console.log(JSON.parse(s).events[0].ack_id));")
G_SENDN=$(node "$OUTBOX" status --db "$DB_G" | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>console.log(JSON.parse(s).events[0].send_count));")
check "g.ack real ack evidence earns delivered (not simulated)" "$([ "$G_STATE2" = "delivered" ] && [ "$G_ACKID" = "TEST-real-ack-1" ] && echo pass || echo fail)" "state=$G_STATE2 ack_id=$G_ACKID"
check "g.ack still exactly one send on record" "$([ "$G_SENDN" = "1" ] && echo pass || echo fail)" "send_count=$G_SENDN"

echo "=== $PASS passed, $FAIL failed ==="
[ "$FAIL" = "0" ]
