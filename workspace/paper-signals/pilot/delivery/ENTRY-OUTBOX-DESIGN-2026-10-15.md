# Shared entry-transition + durable outbox — 2026-10-15

PAPER ONLY. No brokerage, no orders, no real money. No model changes.
Local code + tests under `pilot/`; the deployed artifact is untouched.

## The problem

Two paths can originate ENTRY_CONFIRMED for the same contract:

- **(a) the issuance-wrapper lane** — `paper-signal-cycle` (kind=agent) invokes
  `runpapersignalcycle`, diffs pre/post alert snapshots, and fires one
  `cron.run` per batch naming the new keys;
- **(b) the watch-only entry-worker lane** — `paper-pilot-watcher` 5-min ticks
  (`node dist/pilot.js watch`) resume persisted awaiting-entry contracts from
  the durable SQLite store and observe entries live through the original
  15-min windows.

Whichever path observes the entry first must win, exactly once. Before this
change there was no single mechanism both lanes used: the vendored handler
had its own ownership/claim guards internally, and each lane's delivery
behavior was defined in prose (worker spec, trigger contract) rather than in
one shared, testable code path.

## The implementation (both lanes, one module, one store)

`pilot/src/entry-outbox.ts` — the ONLY entry-transition/outbox implementation
under `pilot/`. Both lanes call it; the CLI (`src/entry-outbox-cli.ts`)
exposes it for ops and tests.

- **One accepted transition = one outbox event.** The accepted transition and
  the outbox event are the SAME durable row: a single atomic INSERT both
  accepts the transition and enqueues the event. There is no separate
  transition table that could diverge from the outbox.
- **Uniqueness enforced on (contract_id, event_type, event_version)** — a
  SQLite UNIQUE constraint; the insert is `ON CONFLICT(...) DO NOTHING`
  inside `BEGIN IMMEDIATE` (SERIALIZABLE). The affected-row count tells the
  caller whether it won (`accepted: true`) or lost (`accepted: false`,
  duplicate of the existing row). Concurrent processes serialize on the
  SQLite RESERVED lock (WAL mode, 30 s busy timeout).
- **Event version** is the payload-schema version (`v1` today). A future
  schema revision is a distinct event triple; the same version dedups.
- **Claim-before-send**: `pending → claiming → sending` with claim id +
  attempt count stamped atomically. `sent_at` + `send_count` are recorded
  BEFORE the transport call, so a crash after send is on the record.
- **Delivered ONLY on ack evidence.** `delivered` (real ack) /
  `delivered_simulated` (labeled sandbox ack). A send with no ack →
  `unknown`. `unknown` is never auto-retried and never auto-marked delivered
  (Logan's rule). `failed` (transport threw) is retryable by a later run.
- **Restart reconciliation** (`reconcileAfterRestart`): `claiming`/`sending`
  rows consult the ack-evidence source first — ack found → delivered;
  otherwise → `unknown`. `unknown` rows with late-arriving ack evidence also
  flip to delivered (ack is the only thing that earns it). Reconciliation
  never calls the sender: it can never create a duplicate delivery attempt.
  `pending` rows are left for the next dispatch (exactly one send).

### Wiring (both lanes converge)

`src/deps.ts` `buildDeps` routes every **entry** alert through the shared
module (setup alerts keep the legacy sandbox file path, unchanged):

1. resolve `contractId` from the persisted candidate row;
2. `attemptEntryConfirmed()` on the shared outbox DB;
3. winner: prompt `dispatchPending()` (claim-before-send + send + outcome
   recording); loser: duplicate refusal logged, no new event, no send;
4. return contract to the vendored handler: void (= acknowledged) only when
   the event is in a delivered-ish state, `{acknowledged: false}` otherwise —
   so the vendored row is never marked delivered without the outbox agreeing.

`observed_by` tags the lane (`wrapper` | `watcher` | override via
`PILOT_OBSERVED_BY`); it is informational and NOT part of the dedup key.

The shared outbox lives at `pilot/delivery/entry-outbox.sqlite` (override:
`OUTBOX_DB`). Prompt-send records append to
`pilot/delivery/prompt-send-log.jsonl` (override: `PROMPT_SEND_LOG`). Neither
is the production ledger: `pilot/delivery/alert-delivery-ledger.json` remains
the delivery worker's book of record and is never written by these paths.

## Verification (2026-10-15)

`npm run test:outbox` → `pilot/test/outbox/run-tests.sh` (+
`test/outbox/hook-integration.mjs`). Latest run:
`pilot/delivery/outbox-tests/run-20261015T045141Z/results.json` —
**20 passed, 0 failed**:

| # | Test | Result (exact counts) |
|---|------|----------------------|
| a | RACE: wrapper + watcher `attempt` concurrently, 600 ms in-transaction overlap, same (ct_race1, ENTRY_CONFIRMED, v1) | exits 0/0; transitions accepted **1** (wrapper=true, watcher=false); outbox events **1**; a third attempt refused, still **1** event |
| b | RESTART AFTER ENQUEUE: crash after accept, before send | accepted **1**; pre-restart state `pending`; post-restart dispatch attempted **1**, sends-log lines **1**, state `delivered_simulated`; re-dispatch sends **0** new |
| c | RESTART AFTER SEND BEFORE ACK: crash after send, before ack | sends-log lines **1**, send_count **1**, state at crash `sending`; post-restart reconcile (no ack evidence) → state `unknown`, ack_at null; follow-up dispatch attempted **0**, sends still **1**; late ack evidence → `delivered`, sends still **1** |
| d | HOOK INTEGRATION: wrapper-lane + watcher-lane `buildDeps` against the same pilot DB + outbox DB, same entry alert | outbox rows **1**; wrapper accepted=1, watcher accepted=0/duplicates=1; sends **1**; state `delivered_simulated`; payload carries `idempotency_key=ct_hook1/ENTRY_CONFIRMED/v1`; watcher lane returned void (ack, no resend) |

## Delivery semantics — idempotency / UNKNOWN disclosure (binding)

> **Exactly-once delivery is NOT claimed.** The outbox guarantees, per
> accepted (contract_id, event_type, event_version) triple: exactly one
> outbox event, at most one send ATTEMPT from this worker (claim-before-send;
> `unknown` is never auto-retried), and honest UNKNOWN wherever the channel
> cannot confirm. It does not guarantee exactly-once delivery at the
> destination.

- **Destination idempotency:** every send payload carries
  `idempotency_key = <contract_id>/<event_type>/v<event_version>`
  (= the dedup key). Senders for channels that support destination
  idempotency MUST pass it through; on such a channel the key gives
  at-most-once delivery end to end.
- **The local reference-lane channel does NOT dedupe on the key.** It is a
  prompt-send log with simulated acks, labeled everywhere as simulated —
  not a real delivery channel and never the production ledger.
- **Consequence:** after an ambiguous send (recorded send, no ack), a future
  operator-driven manual re-send could produce a DUPLICATE delivery at the
  destination. That is precisely why the `unknown` state exists and why it is
  never auto-retried and never auto-marked delivered: the system surfaces
  the uncertainty instead of hiding it. Any future sender on a channel with
  real destination idempotency narrows this to at-most-once; until then the
  disclosure above stands.
- Simulated acks (`delivered_simulated`) are test/reference-lane artifacts
  only. They never touch `alert-delivery-ledger.json` or the scheduler
  outbox. Per the standing rule, TEST rows never touch production ledgers.
