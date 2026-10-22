# attemptEntryConfirmed() call-chain trace — expert finding 1 resolutions (2026-10-15)

PAPER ONLY. No brokerage, no orders, no model changes. The vendored
orchestrator handler (`orchestrator/dist/.../issuance/handler.js`, v2.1.9)
is READ-ONLY — verified against, never modified.

This doc resolves each sub-claim of the expert's watcher/outbox finding 1
with code evidence, and records a live TRACE of an entry alert flowing the
full installed path:

`watch → integratedTick → observeEntryPhase → observeEntry →
commitEnteredOutcome → attemptAlertDelivery → deliverAlert
(makeEntryOutboxDeliverAlert) → attemptEntryConfirmed`

---

## The chain (file:line, verified 2026-10-15)

| # | Hop | Location |
|---|-----|----------|
| 1 | `paper-pilot-watcher` cron (5m) → `node dist/pilot.js watch` | `crons/minutely/paper-pilot-watcher__interval@5m.md` |
| 2 | `cmdWatch` → `runWatchOnce({observedBy:"watcher"})` | `pilot/src/pilot.ts:183` |
| 3 | `runWatchOnce` → `integratedTick(deps)` | `pilot/src/entry-worker.ts:70` → `:90` |
| 4 | `integratedTick` → `processIntegratedCandidate` → `resumeAwaitingEntry` (awaiting-entry branch) | `handler.js:1691` → `:1562` |
| 5 | `resumeAwaitingEntry` → `observeAndSettle` → `observeEntryPhase` | `handler.js:1378` → `handler.js:626` |
| 6 | `observeEntryPhase` → `observeEntry` (vendored pending.js) | `handler.js:863` → `entry-v1/src/pending.js:108` |
| 7 | `observeAndSettle` → `commitEnteredOutcome` (signal+contract+candidate+entry-alert, ONE transaction) | `handler.js:953` |
| 8 | `commitEnteredOutcome` → `attemptAlertDelivery(deps, entryAlert)` | `handler.js:1101` |
| 9 | `attemptAlertDelivery` → `attemptAlertDeliveryClaimed` → `deps.deliverAlert?.(alert)` | `handler.js:1283` → `:1295` → `:1302` |
| 10 | pilot `deliverAlert` = `makeEntryOutboxDeliverAlert` (built by `buildDeps`) | `pilot/src/deps.ts:162` (dist `deps.js`) |
| 11 | `makeEntryOutboxDeliverAlert` → `attemptEntryConfirmed(outboxDbPath, obs)` | `pilot/src/deps.ts:209` → `pilot/src/entry-outbox.ts:240` |
| 12 | accepted → `dispatchPending` → `makePromptSendFn` (SIMULATED) | `entry-outbox.ts:333`, `deps.ts:81` |

The acknowledgment contract back to the vendored handler (handler.js:1302-1305):

```js
const raw = await deps.deliverAlert?.(alert);
const acknowledged = raw == null ? true : raw.acknowledged !== false;
if (!acknowledged)
    throw new Error("transport declined the acknowledgement");
```

`makeEntryOutboxDeliverAlert` returns **void** (= ack) only when the outbox
event is in a terminal delivered state (`delivered`/`delivered_simulated`,
deps.ts:225); otherwise it returns `{acknowledged:false}` — so the vendored
handler marks the alert **failed** (handler.js:1310-1314), never delivered,
on a refused/non-terminal transition. Proven by scenario e.3 below.

---

## Finding 1a — "declares Sandbox only": label inventory

Every delivery-adjacent label in the installed path says simulated/sandbox;
none implies real delivery. The reference-lane prompt sender is SIMULATED —
the real delivery channel is the 15-minute `paper-signal-alert-delivery`
sweep (cron `crons/minutely/paper-signal-alert-delivery__interval@15m.md`,
enabled, posts to the research side chat).

| Label | Location | Wording |
|---|---|---|
| `OutboxState` | `src/entry-outbox.ts` | `"delivered_simulated"` — "sandbox/simulated acknowledgement (labeled, never real)" |
| prompt sender doc | `src/deps.ts:73-78` | "returns a SIMULATED acknowledgement. Labeled everywhere as simulated — this is NOT a real delivery channel" |
| prompt-send evidence | `src/deps.ts` | `"SIMULATED ack — reference lane; no real delivery channel"` |
| prompt-send transport note | `src/deps.ts` | `"SIMULATED acknowledgement — reference-lane prompt sender; labeled, never real"` |
| `deliveryMode` | `src/deps.ts:353` | `"simulated"` — shim comment: "Labeled sandbox/test delivery mode for the vendored hook's fallback. Never 'live'." |
| setup-lane transport | `src/transport.ts` | `transport: "sandbox-file-outbox"`, `"SIMULATED acknowledgement — sandbox file outbox; no real delivery channel exists in the paper pilot"` |
| alert `channel` | `handler.js` (vendored) | `"sandbox-feed"` on both setup and entry alert rows |

No summary in the pilot docs, evidence logs, or reports describes the
prompt sender as real delivery. The 15m sweep (`paper-signal-alert-delivery`,
`AUTO-DELIVERY-WIRING-2026-10-14.md`) is the only path that reaches chat.

## Finding 1b — "does not call attemptEntryConfirmed()": REFUTED

The chain reaches it: `src/deps.ts:209` inside `makeEntryOutboxDeliverAlert`
(`src/deps.ts:162`), invoked by the vendored handler at `handler.js:1302`.

**Live TRACE** (2026-10-15, `test/outbox/fixture-tick-driver.mjs` —
real `integratedTick` through the vendored handler against a scratch pilot
DB; market data replaced by LABELED fixture stubs, all handler/deps/outbox
code real):

- seed: awaiting-entry candidate `cand_trace1` + pending contract
  `ct_cand_trace1` (built by the real vendored `buildPendingContract`),
  decision 2026-10-15T05:23:06.375Z, 15-min window.
- fixture feed serves one eligible print: ts +30s, price 100.05,
  `venueTradeId="TRACE-VENUE-TRADE-1"`, `venueSeq=42`, venue `binance-spot`,
  with adapter coverage evidence.
- `run watcher` → tick `processed=[cand_trace1] issued=[cand_trace1]` →
  candidate `issued`, contract `entered`,
  `observationCheckpoint.firstPrint = {venueTradeId:"TRACE-VENUE-TRADE-1",
  venueSeq:42}`.
- entry alert row `entry_sig_863e29432fe436d69b82673a`:
  `deliveryStatus=delivered`, `deliveryMode=simulated`.
- outbox: 1 event `evt_ct_cand_trace1_ENTRY_CONFIRMED_v1`,
  `observed_by=watcher`, `send_count=1`, state `delivered_simulated`;
  counters `{accepted:1, duplicates:0, sends:1}`.
- the outbox payload carried `entry_venue_trade_id="TRACE-VENUE-TRADE-1"`
  and `entry_venue_seq=42` (the finding-1d fix, proven end-to-end).

Raw run JSON: `/tmp/trace-final/run.json` (scratch; the committed
reproduction is the driver + `run-tests.sh` scenario e).

## Finding 1c — "sets receipt time from the clock sampled BEFORE awaiting the feed": REFUTED

Verified in the vendored handler (read-only):

- `handler.js:744`: `const prints = await feed.latestPrints(pollSinceTs);`
- `handler.js:749`: `const receiptMs = wclock.nowMs();` — sampled **AFTER**
  the await, under the `(a) LATE FETCH` comment block (lines 745-750):
  "re-read the clock AFTER the await. The fetch may have started inside the
  entry window while the clock advanced past it during the await
  (the expert's minute-16 counterexample)."
- Every receipt-time use derives from that post-await sample:
  `lateReceiptVoid` (725), first-print age check (857),
  `checkpoint.lastReceiptAt` (860), `observeEntry`'s `entryReceivedAt` (865)
  and its observation clock `() => new Date(receiptMs).toISOString()` (868).
- `grep nowMs()` over handler.js shows no other receipt-time sampling
  around a feed await; `observeEntry` (pending.js:108) takes the receipt
  time as a parameter — it never samples a clock itself.

**No path samples receipt time before awaiting the feed. No change needed;
reported as a finding, not a fix.**

## Finding 1d — "does not carry the venue trade ID into its entry observation": FIXED

handler.js v2.1.9 print-identity integrity REQUIRES `venueTradeId`+`venueSeq`
on every served print (lines 817-827) and persists the established identity
on the entered contract (`firstPrintIdentity` 515-522, checkpoint write 859,
`entryVenueTradeId`/`entryVenueSeq` into alert evidence 997-998, 1026-1027).
The outbox payload previously carried only `entry_observed_at`.

**Fix** (`src/deps.ts`, rebuilt to `dist/deps.js`): `makeEntryOutboxDeliverAlert`
now reads the entered contract row (`store.getContract(contractId)`,
available because the hook runs after `commitEnteredOutcome` persisted it,
handler.js:1101) and carries the real first-print identity into the payload:

- `entry_venue_trade_id` — `observationCheckpoint.firstPrint.venueTradeId`
- `entry_venue_seq` — `observationCheckpoint.firstPrint.venueSeq`

Nulls (never synthesized) when the row predates the evidence — an internal
id is not the venue's id. Proven end-to-end in the trace above and asserted
in tests d ("entry_venue_trade_id=HOOK-VENUE-TRADE-1 entry_venue_seq=7") and
e.1 ("entry_venue_trade_id=TRACE-VENUE-TRADE-1 entry_venue_seq=42").

### Preserved (no regressions)

- receipt-expiry (`lateReceiptVoid`, handler.js:725) — vendored, untouched
- first-print identity (`firstPrintIdentity`, `comparePrintsByVenueOrder`, handler.js:515/537) — vendored, untouched
- coverage protections (historyCoverage gate, handler.js:752-810) — vendored, untouched
- Full outbox suite after the change: **38/38 passed** (`run-tests.sh`,
  run 20261015T052321Z)

---

## Finding 2 — arbiter protocol demonstration (scenario e)

True single-transaction atomicity across the pilot DB and the outbox DB
(two different SQLite files) is impossible and is NOT claimed. What is
implemented and demonstrated (`test/outbox/competing-workers.mjs`,
scenario e in `run-tests.sh`):

- `attemptEntryConfirmed` is the atomic arbiter: one SQLite DB,
  `BEGIN IMMEDIATE`, `UNIQUE(contract_id, event_type, event_version)`;
  first observer wins, loser gets `accepted=false` with the existing row's
  state (entry-outbox.ts:240).
- e.1 (concurrent observation): two worker processes run the full fixture
  tick concurrently against the same DBs — exactly 1 accepted outbox row,
  exactly 1 send, the accepted lane's contract transitioned exactly once
  (1 signal row, candidate `issued`, contract `entered`), 1 entry alert row.
- e.2 (competing triggers): both lanes `deliverAlert` the same entry alert
  — both refused (`duplicates=2/2`, `accepted=0`), still 1 outbox event,
  still 1 send, both returned `void(ack)` reading the terminal state.
- e.3 (`{acknowledged:false}` determinism): against a non-terminal accepted
  row (state `claiming`, simulating an in-flight send), the refused lane
  returns `{acknowledged:false}`, attempts no send; the vendored handler's
  exact acknowledgment read (`handler.js:1302-1305`) yields
  `acknowledged=false` → the alert is marked **failed**, never delivered
  (proven with the real vendored `markAlertFailed`).

Incidental fix found by the race: `openOutboxDb` threw `SQLITE_BUSY`
(errcode 5) when a loser's open raced the winner's write transaction —
`PRAGMA journal_mode=WAL` needs exclusive access and doesn't honor
`busy_timeout`. Now sets `busy_timeout` first and retries the journal-mode
switch with backoff (entry-outbox.ts:169). 8/8 clean concurrent races after
the fix (previously reproduced the crash 1/6 runs).
