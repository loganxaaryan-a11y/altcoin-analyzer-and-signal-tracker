# Manifest note — first-print fidelity repair (handler v2.1.7)

Date: 2026-10-14. Paper signals only. No brokerage, no holdout touched.
Prediction weights UNCHANGED: crypto production 17.0, crypto C-2 15.5, equity 90.
No prediction-factor, level, gate, entry-rule, cost-model, or veto-semantics change.
The frozen evaluator is untouched. This supersedes handler v2.1.6 (min-score
|score| correction, 2026-10-14) — the v2.1.6 semantics are retained verbatim;
only the entry-observation layer changes, as described below.

## The defect (read at the actual gate)

Live gate: `paper-signals/orchestrator/src/issuance/handler.ts` —
`observeEntryPhase` (the integrated issuance path both handoffs run).

OLD logic (pre-repair), two parts:

1. In the poll loop, a print older than `maxObservationAgeMs` at receipt was
   skipped via `if (receiptMs - p.ts > maxAgeMs) continue;` — and the loop
   then entered on the NEXT (later) print in the same batch via
   `observeEntry(...)`, silently substituting a later print for the required
   first print under the original "first-post-decision" contract.
2. `let sinceTs = decisionMs - 1;` at every invocation meant the DB-resume
   path re-fetched full print history blindly, re-exposing every resumed
   watcher to (1).

Reproduced before the repair by
`orchestrator/tests/first-print-substitution-regression.ts` (verdict "fail":
entered on the T0+8min print after skipping the missed T0+10s true first
print, 7m50s stale).

## The repair (v2.1.7, handler only)

**First-print fidelity.** The earliest eligible print in the served batch, by
timestamp order, is the first-print candidate. A print is accepted ONLY if its
identity as the actual first eligible print is established AND it is timely
available:
- stale candidate (observation age exceeded) → the contract voids immediately
  as the NAMED non-entry `non-entry:first-print-missed`, with the evidence gap
  stated (first print ts, receipt ts, age bound). The loop NEVER continues to
  a later print. The contract's decision time and entry window are untouched —
  no re-baselining workaround.
- venue served nothing for the window (empty history at window close) → the
  NAMED non-entry `non-entry:first-print-unverifiable`, fail closed with the
  uncertainty stated explicitly. (A venue that served prints but none
  qualifying still voids as `void_expired`: its history IS established.)

New terminal entry states (additive, `entry-v1/src/contract.ts`):
`void_first_print_missed`, `void_first_print_unverifiable`; outcome gates
`first-print-missed` / `first-print-unverifiable` → status/kind `invalidated`
(logged non-entry, excluded from the accuracy cohort, never scored MISS, no
entry alert). The frozen comparison harness classifies these under its
`abstain:entry-venue` bucket (entry-rule failure, not a veto) via the existing
substring taxonomy — harness untouched.

**Recovery checkpoint.** Every observation run persists to the contract row
(`contractJson.observationCheckpoint`, additive — frozen contract fields
untouched): highest print ts durably observed (`highWaterTs`), the established
first-print identity (`firstPrint`: deterministic venue-trade id
`trade:{venue}:{ts}:{price}` — TradePrint carries no venue-assigned trade id,
so this is the sandbox's stand-in — plus ts/price/venue), last receipt time,
and poll count. Resumed runs continue FROM `highWaterTs`; a missing checkpoint
(pre-v2.1.7 row) re-fetches from `decisionMs - 1` and the first-print rule
re-applies to the full served history — safe now that a stale earliest print
voids instead of being skipped. Checkpoint writes are ownership-guarded (only a
still-pending row is touched). Persisted on: poll-budget exhaustion, clock-skew
deferral, entry, and every void.

**Alert gating.** `commitEnteredOutcome` now verifies `checkEntryEvidenceComplete`
before the outcome transaction: venue trade id + observation time + receipt
time present and valid, with the first-print identity's ts matching
`entryObservedAt`. A contract without complete entry evidence throws a loud
`ContractError` (integrity violation, never a business outcome) — no entry
alert is enqueued.

## Versioning / hashes

`ISSUANCE_HANDLER_VERSION = "2.1.7"` exported from
`orchestrator/src/issuance/handler.ts` (asserted by the updated regression test).

sha256:
```
fcda32c5c4a5d4e687f0f0b198b2761a0928979f677c2ae57dda07428781357a  orchestrator/src/issuance/handler.ts
c75aa0c22f38c1007946ae5945f4565c400d14d6d93a294fb6cbf41474bb4b54  entry-v1/src/contract.ts
8379d73c2a49f9654ea450c84af53662c0aa8dc73de245f55d0e71e1e7e2475a  orchestrator/tests/first-print-fidelity.test.ts
93fe9895c082cfb3629e9c3912cb1946229fb14000f410bf901e6bc95af18c37  orchestrator/tests/integrated-handler.test.ts
c44da9f2a0f15c9be13b480eca5ae594b5d18764f12bd212946d41cc91c0d85a  orchestrator/tests/min-score-abs-floor.test.ts
f99bfda168329702e8110764dd7234283eb307b6b1225385b69e8e2565a20af4  orchestrator/dist/paper-signals/orchestrator/src/issuance/handler.js (executable used by handoffs)
```

`npm run build` (tsc) is clean — no errors. The v2.1.6 note's pre-existing tsc
complaint in `tests/first-print-substitution-regression.ts` no longer occurs.

## Regressions

NEW `orchestrator/tests/first-print-fidelity.test.ts` — 7/7:
1. missed-first + later VALID print → `non-entry:first-print-missed` (exact
   gate), no issuance, no entry alert; void reason names first-print ts,
   receipt ts, and the 300000ms age bound.
2. missed-first + later INVALID (5% drift) print → exact gate
   `first-print-missed` (not a drift/veto pass-through; reason has no drift
   language).
3. restart with a persisted checkpoint → the resumed run's first
   `latestPrints` call used `sinceTs` = checkpoint highWaterTs (T0+30s), not
   decisionMs − 1; issued exactly once on the correct print; entered contract
   carries the venue trade id; a further tick issues nothing.
4. empty venue history at window close → `non-entry:first-print-unverifiable`
   (fail closed), no signal row, no entry alert.
5. uninterrupted valid entry → issued exactly as before; entered contract
   carries complete entry evidence (evidence gate passes).
6–7. `checkEntryEvidenceComplete` unit cases + `commitEnteredOutcome` refuses
   to enqueue an entry alert without complete entry evidence (loud
   ContractError).

EXISTING `orchestrator/tests/first-print-substitution-regression.ts` — verdict
now **"pass"** (status `invalidated`, contract `void_first_print_missed`; the
missed first print was not silently replaced).

FULL suite (`npm test`): **81/81 pass** — run.js, no-legacy-veto,
gate-decomposition, db-store, integrated-handler, alert-recovery, clock-skew,
first-print-fidelity. `npm run drift`: 3/3 (vendored gate sources unchanged).

## Pre-existing tests updated (intentional semantic changes, disclosed)

Three tests in `orchestrator/tests/integrated-handler.test.ts` pinned the
pre-repair semantics and were updated to the new named non-entries:
- "no qualifying print before the window closes -> entry-expired" (empty feed)
  → now asserts `invalidated` / `first-print-unverifiable` /
  `void_first_print_unverifiable` (regression 4's mandated behavior).
- "stale-but-in-window print → skipped → expired" → now asserts `invalidated` /
  `first-print-missed` / `void_first_print_missed` (this test pinned the
  defective skip-then-expire behavior).
- poll-budget resume past window close (empty feed) → now asserts
  `invalidated` / `first-print-unverifiable` (was `entry-expired`).
- `orchestrator/tests/min-score-abs-floor.test.ts`: version assertion 2.1.6 → 2.1.7.

Unchanged and still green: late-receipt → `void_expired` (minute-14/16 and
boundary tests), wrong-venue print → `void_expired` (history WAS served),
`void_no_quote`, `void_drift`, clock-skew deferral, alert recovery,
exactly-once/race guards, equity paths.

## Known non-goals / residual notes

- `entry-v1/src/watcher.ts` (research/record module, NOT on the issuance path)
  maps unknown void states to WatchOutcome "pending"; the two new void states
  would land there. Left untouched per the real-handler-only scope; no
  issuance behavior depends on it.
- Venue trade id is the deterministic sandbox stand-in
  `trade:{venue}:{ts}:{price}` — TradePrint carries no venue-assigned trade
  id. A live wiring with real trade ids would substitute the real id in
  `firstPrintIdentity` without changing the contract.
- The v2.1.6 min-score |score| correction is fully retained; nothing in the
  qualification path changed.
