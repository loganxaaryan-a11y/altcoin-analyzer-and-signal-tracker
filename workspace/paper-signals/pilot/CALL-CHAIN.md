# CALL-CHAIN.md — installed paper-pilot worker: entry observation → outbox

The full installed call chain for the paper-pilot watcher + outbox path,
with file paths, line numbers, and sha256 (first 12 hex chars) of each
file, verified 2026-10-15. The vendored orchestrator handler
(`orchestrator/dist/.../issuance/handler.js`, v2.1.9) is READ-ONLY —
verified against, never modified.

PAPER ONLY. No brokerage, no orders, no model changes.

## Topology

```
paper-pilot-watcher cron (5m)
  └─ node dist/pilot.js watch                      (pilot/dist/pilot.js)
       └─ cmdWatch                                 (pilot/src/pilot.ts:183)
            └─ runWatchOnce({observedBy:"watcher"}) (pilot/src/entry-worker.ts:70)
                 ├─ buildDeps(...)                  (pilot/src/deps.ts)
                 ├─ integratedTick(deps)            (vendored handler.js:1691, via pilot/src/vendor.ts)
                 │    └─ processIntegratedCandidate → resumeAwaitingEntry → observeAndSettle
                 │         └─ observeEntryPhase     (handler.js:626)
                 │              ├─ await feed.latestPrints(...)   (handler.js:744)
                 │              ├─ receiptMs = wclock.nowMs()     (handler.js:749, AFTER the await — LATE FETCH)
                 │              └─ observeEntry(...)             (handler.js:863 → entry-v1/src/pending.js:108)
                 │         └─ commitEnteredOutcome  (handler.js:953)
                 │              ├─ signal+contract+candidate+entry-alert in ONE transaction (handler.js:1036-1080)
                 │              └─ attemptAlertDelivery(deps, entryAlert)  (handler.js:1101)
                 │                   └─ attemptAlertDeliveryClaimed → deps.deliverAlert(alert)  (handler.js:1295 → :1302)
                 └─ deliverAlert = makeEntryOutboxDeliverAlert  (pilot/src/deps.ts:162)
                      ├─ "entry" → attemptEntryConfirmed(outboxDbPath, obs)  (deps.ts:209 → entry-outbox.ts:240)
                      │    └─ BEGIN IMMEDIATE + INSERT … ON CONFLICT DO NOTHING
                      │       on UNIQUE(contract_id, event_type, event_version) — the atomic arbiter
                      ├─ "setup" → makeSandboxTransport (legacy sandbox file outbox, unchanged)
                      └─ dispatchPending → makePromptSendFn  (entry-outbox.ts:333, deps.ts:81 — SIMULATED ack)
                 └─ end-of-run drain: dispatchPending (entry-worker.ts, orphans only)
```

## File inventory (sha256, first 12)

Pilot sources (`~/workspace/goals/research-terminal/paper-signals/pilot/`):

| sha256 (12) | File | Key symbols / lines |
|---|---|---|
| 94fca03a8ac6 | `src/pilot.ts` | `cmdWatch` :183 — `runWatchOnce({observedBy:"watcher"})` |
| 993205fa6e0d | `src/entry-worker.ts` | `runWatchOnce` :70; `integratedTick(deps)` :90; prompt drain after tick |
| 61e49cc2ffa2 | `src/vendor.ts` | re-exports `integratedTick`, `DbStore`, `systemClock` from the vendored dist (untouched bridge) |
| 68ba00ecf5e6 | `src/deps.ts` | `makePromptSendFn` :81 (SIMULATED); `makeEntryOutboxDeliverAlert` :162; `attemptEntryConfirmed(...)` call :209; `firstPrintIdentityOf` helper (venue trade id → payload); `buildDeps` wires `deliveryMode:"simulated"` |
| b784f48d6166 | `src/entry-outbox.ts` | `openOutboxDb` :169 (WAL + busy_timeout + journal-mode retry); `attemptEntryConfirmed` :240 (atomic arbiter); `dispatchPending` :333 (claim-before-send) |
| 23bfa29756d6 | `src/transport.ts` | `makeSandboxTransport` — setup-lane sandbox file outbox, `SIMULATED acknowledgement` |
| 227dae4ddb2b | `src/binance.ts` | `BinanceVenueFeed` (venue prints + `historyCoverage`), `systemWatchClock` |

Compiled pilot (`pilot/dist/`, from `npm run build` = `tsc`):

| sha256 (12) | File |
|---|---|
| 34b081570389 | `dist/pilot.js` |
| d325e5dc203a | `dist/entry-worker.js` |
| c1bef6ba214d | `dist/deps.js` |
| 989217e2bcfd | `dist/entry-outbox.js` |

Vendored orchestrator (READ-ONLY, `~/workspace/goals/research-terminal/paper-signals/orchestrator/dist/paper-signals/`):

| sha256 (12) | File | Key symbols / lines |
|---|---|---|
| db5fd1ab7125 | `orchestrator/src/issuance/handler.js` (v2.1.9) | `observeEntryPhase` :626; feed await :744; `receiptMs` post-await :749; `observeEntry` call :863; `commitEnteredOutcome` :953; `attemptAlertDelivery` in commit :1101; `attemptAlertDeliveryClaimed` :1295; `deps.deliverAlert` invocation + ack read :1302-1305; `integratedTick` :1691 |
| 025b25714492 | `entry-v1/src/pending.js` | `buildPendingContract` :54; `observeEntry` :108 |

## Databases

| Path | Holds |
|---|---|
| `pilot/data/paper-pilot.sqlite` | contracts, candidates, signals, alerts (vendored DbStore) |
| `pilot/delivery/entry-outbox.sqlite` | shared entry-transition outbox — `entry_delivery_outbox`, `UNIQUE(contract_id, event_type, event_version)` |

## Acknowledgment contract (vendored read, handler.js:1302-1305)

```js
const raw = await deps.deliverAlert?.(alert);
const acknowledged = raw == null ? true : raw.acknowledged !== false;
if (!acknowledged)
    throw new Error("transport declined the acknowledgement");
// catch → markAlertFailed (never markAlertDelivered without an ack)
```

`makeEntryOutboxDeliverAlert` returns void (ack) only when the outbox event
is `delivered`/`delivered_simulated`; otherwise `{acknowledged:false}`.

## Real vs simulated delivery

- Reference lane (this worker): `makePromptSendFn` — **SIMULATED** ack,
  labeled at every layer; never a real delivery channel.
- Real channel: the 15m `paper-signal-alert-delivery` sweep
  (`crons/minutely/paper-signal-alert-delivery__interval@15m.md`, enabled),
  which posts to the research side chat.

## Verification artifacts

- Trace doc: `pilot/delivery/ATTEMPT-ENTRY-CONFIRMED-TRACE-2026-10-15.md`
- Tests: `pilot/test/outbox/run-tests.sh` (scenarios a–e; 38/38 passing
  2026-10-15) — `fixture-tick-driver.mjs` (live chain trace),
  `hook-integration.mjs` (d), `competing-workers.mjs` (e: arbiter protocol)
