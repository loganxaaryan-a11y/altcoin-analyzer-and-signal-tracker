# Corrected born-dead / historical-extreme veto — WORK ITEM 2/5 (sandbox)

Spec: `~/workspace/goals/research-terminal/hidden_files/source-export-2026-10-13/VETO-AUDIT.md`
Source: `src/veto.ts` (TypeScript, runnable as-is via Node >= 22 type-stripping; `tsc --strict` clean)
Tests: `tests/veto.test.ts` — run with `node --test tests/veto.test.ts`
Correction-6 tests: `tests/veto-timing-c6.test.ts` — run with `node --test tests/veto-timing-c6.test.ts`
Holdout: `tests/holdout-veto-counterexample.test.mjs` — byte-identical copy of the
locked 5-case harness (sha256-verified against the original); no production code touched.

## The three explicit checks

| # | Check | Function | Temporal scope | Fails closed on |
|---|-------|----------|---------------|-----------------|
| (a) | **Setup invalidation** | `checkSetupInvalidation` | `[decisionAt, entryAt)` only | missing/incoherent post-decision OHLC; straddling candle that crossed the stop (portion unisolable); coarser-than-available evidence |
| (b) | **Entry zone** | `checkEntryZone` | the entry itself | entry past expiry, drift beyond limit, missing entry |
| (c) | **Outcomes** | `checkOutcomes` | `(entryAt, …]` only | non-closed/incoherent bar on the path; same-bar target+stop double touch; expiry-straddling touch; entry inside an equity session; wrong granularity |

Every check returns `{ check, verdict: pass | fail | uncertain, reason, detail? }`.
**Uncertain always fails closed**: `runIssuanceChecks` returns `fail_closed` unless
every check passes. Uncertainty handling is specified per ambiguous case, never silent.

## Corrected rules (from the audit)

- **Post-decision bars only.** `bar.endAt <= decisionAt` → pre-decision FEATURE,
  recorded in `detail.preDecisionFeatures`, never a stop-out. Yesterday's stop
  crossing cannot veto a new setup (proven: test a1).
- **Final published stop, not the draft.** The check takes `finalStop` only.
  `validatePipelineOrder()` rejects any run where `checkedStop !== publishedStop`
  ("move the veto after buildAtrLevels"). Proven both directions (tests d1–d3).
- **No waiting trap.** Forming candles are admitted (`provisional: true`); an
  immediate entry validates on quotes/trade prints/the forming candle — never a
  demand for a new completed candle (test a6).
- **Straddling candles.** A candle spanning `decisionAt` contributes only its
  post-decision portion. If the whole-bar extreme is safe, the portion is
  provably safe (definite pass, test a3). Otherwise the portion cannot be
  isolated from OHLC → UNCERTAIN, fail-closed (test a4). The pre-decision
  portion is never treated as a definite breach.
- **Evaluator-granularity fidelity (defect ii).** `checkOutcomes` requires
  evidence at exactly the evaluator's granularity — `"session"` for equity,
  `"intraday"` for crypto. Anything else → uncertain with reason. Equity keeps
  the evaluator's own rules mirrored: entry inside a session → uncertain;
  expiry-straddling / double-touch → uncertain; pre-entry bars (incl. the
  signal-day bar) ignored entirely. The equity born-dead condition therefore
  lives in check (c) as "first post-entry session crossing the stop" (test c7).

## Correction 6 — veto timing tightened (2026-10-13)

Existing signatures unchanged (`checkSetupInvalidation`, `checkOutcomes`,
`runIssuanceChecks` keep their frozen shapes); behavior extended, plus one new
standalone check. 13 tests in `tests/veto-timing-c6.test.ts`, all green.

- **(6a) Candles straddling ENTRY, not just decision.** `checkSetupInvalidation`
  now treats a candle whose interval contains `entryAt` exactly like a
  decision-straddling candle: whole-bar extreme safe → the pre-entry portion
  is provably safe (definite pass for that bar); otherwise UNCERTAIN,
  fail-closed — the pre-entry portion is never treated as a definite breach,
  and the post-entry portion belongs to the outcomes check. `checkOutcomes`
  gets the same rule for intraday bars (the equity session-entry rule already
  covered session bars). Reason strings name the straddled boundary
  (`decisionTime` / `entryTime` / both).
- **(6b) Time-ordering.** Only extremes timestamped strictly AFTER `entryAt`
  count against the entry — a later extreme must not invalidate an earlier
  entry. Pre-entry extremes (bars with `endAt <= entryAt`, points with
  `ts <= entryAt`) are pre-entry movement, ignored entirely, never stop-outs.
  An entry-straddling bar whose extreme crossed the stop is UNCERTAIN (the
  touch cannot be timestamped after `entryAt` from OHLC), never a definite
  fail — this changed two old fixtures, see below.
- **(6c) New check (d): `checkPostEntryInvalidation`.** Post-entry lifecycle
  stage (NOT part of `runIssuanceChecks`, which governs decision → entry).
  The result type carries the two questions SEPARATELY:
  - `entryValid` (`pass`/`fail`/`uncertain`): the entry print itself vs the
    stop — LONG `entryPrice <= stop` (SHORT `>=`) → fail, stopped at birth.
  - `interveningInvalidation`: `invalidation_observed` (a post-entry extreme
    timestamped after `entryAt` crossed the stop — genuine stop-out) |
    `no_invalidation_observed` (closed bars continuously cover
    `[entryAt, nowAt]`, no breach) | `insufficient_data` (coverage gaps or
    unisolable extremes — fail-closed on the invalidation question ONLY).
  - `verdict`: `fail` if either question fails; `uncertain` if the
    invalidation question is `insufficient_data` (entry validity still
    reported separately); `pass` only when both are clean.
  - Coverage rule: a safe CLOSED bar's extreme is the interval min/max, so it
    proves its interval safe; a safe POINT proves only the instant — one safe
    print cannot prove an entire interval was safe (regression iv). Forming
    (provisional) candles never contribute coverage; a provisional candle
    currently through the stop counts as `invalidation_observed` flagged
    `provisional: true` in `detail`.

**Fixture adjustments in `tests/veto.test.ts` (documented, not silent):** tests
(a2), (a2b), (d2) used a breaching bar `[09:00,10:00)` with `entryAt` 09:02 —
under correction 6(a) that bar straddles the entry event, so the corrected
verdict is UNCERTAIN, not a definite veto. The fixtures now set
`entryAt = 10:30` (bar fully inside the decision→entry window) so they still
prove genuine post-decision invalidation vetoes; the straddling-entry
uncertain case is covered by the new (6a1)/(6b1) tests.

## GAP-4 — veto timestamp alignment (2026-10-13)

The issuance veto built its input with `decisionAt = min(detectedAt, handlerStart)`
while the contract records handler-start as `contract.decisionAt`. The veto's
`[detectedAt, handlerStart]` window was therefore PRE-decision setup history,
and the real waiting interval `[contract.decisionAt, entryObservedAt]` was never
veto-checked. Repair (sandbox only; `src/waiting-interval.ts`):

- **Qualification time** (entry not yet observed): `runQualificationChecks`
  (same `IssuanceVetoInput` shape as `runIssuanceChecks`) — setup-history
  filter (pre-decision extremes are features, never stop-outs) +
  pipeline-order guard + entry-zone rules. NO decision→entry invalidation:
  the waiting interval does not exist yet.
- **Entry observation time**: `checkWaitingInterval` — the genuine
  `[contract.decisionAt, entryObservedAt]` window, reusing
  `checkSetupInvalidation` (straddles, granularity, fail-closed uncertainty
  inherited). `entryAt < decisionAt` throws (integrity). Empty interval +
  `allowEmptyInterval` (the equity overnight gap: session-close → next-open
  has no bars BY CONSTRUCTION) → pass with reason "no bars by construction";
  empty without it → uncertain, fail-closed ("no waiting-interval evidence").
- `orchestrator/src/issuance/veto-input.ts`: `decisionAt` is now the ACTUAL
  decision instant (the handler's run time — what the contract records), never
  `min(detectedAt, nowMs)`; `detectedAt` is recorded as `preDecisionAt` on the
  invalidation input so pre-decision bars classify as setup-history features.
- Tests/demo: `tests/waiting-interval.test.ts` — run
  `npm run test:waiting-interval` (compile step required: the module uses
  `./veto.js` specifiers so the tsc-built handler can import it). Includes the
  timestamped demo: confirmed breach → fail at the breach and REMAINS fail
  after recovery (a touch is a touch); provisional coarse breach → uncertain,
  then finer evidence exonerates → pass.
- `runIssuanceChecks` is retained unchanged (all its unit tests green) for the
  handler rewire to replace with `runQualificationChecks` at issuance and
  `checkWaitingInterval` at entry observation.

## Where this plugs into the terminals (implementation notes, sandbox only)

**Crypto** (`issueGeneratedSignalCandidate`, actions.ts:1976–1997):
1. Fetch the post-decision quote FIRST, run `buildAtrLevels`, get `levels.stop`.
2. Fetch fine post-decision OHLC for `[draft.createdAt, quoteReceivedAt]`
   (4h intervals with `intervalEnd > decisionAt`, or Binance klines).
3. Run `runIssuanceChecks({ invalidation: { finalStop: levels.stop, … }, entryZone, pipeline: { draftStop: draft.invalidation, publishedStop: levels.stop } })`.
4. Record the verdict in `gateResultsJson.issuanceValidation` alongside the
   published levels. Never fall back to the completed signal-day candle.

**Equity** (`signalIssuanceDecision` / `evaluateEquityIssuanceGate`):
- With the entry contract as-is (entry = signal-day close, no paper execution
  claimed), check (a) is a vacuous pass (no decision→entry interval) and the
  born-dead check moves into the evaluator as check (c): first post-entry
  session whose extreme crosses the stop → MISS / born-dead at evaluation time
  (audit §4 option a). The same-bar sweep is NOT a stop-out; if retained at
  issuance it must be a logged data-quality flag, never a suppression.

**Discovery path** (crypto :3755–3762): apply the same rule against
post-discovery evidence, or drop the veto there — its invalidation is itself a
recent-window extreme, making the check near-tautological.
