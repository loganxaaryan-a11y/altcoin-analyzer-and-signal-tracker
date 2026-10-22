# Automatic Paper-Signal Issuance — Implementation Spec (for expert review)

**Status:** SPEC ONLY. No implementation, no scheduler enabled, no production
changes. Prepared 2026-10-13/14 for expert review; build starts only after
sign-off. Sandbox package under review: `paper-signals-export-2026-10-13.zip`
(SHA-256 `10e05fdc40b23d72b99f6c027ac9dc922ab3c3dced9c14112b2f0fc5e2f81cb3`).

**Standing constraints:** no brokerage execution anywhere. Paper signals only.
Holdouts locked (Phase 2A: 2025-01-01–2026-09-30 UTC, manifest `e40894eb…`).
H-2 remains a separate shadow experiment. C-2 collects shadow scores only —
no promotion through this path.

Source base: `~/workspace/goals/research-terminal/paper-signals/` (sandbox).
Production sources referenced: `equity/server/src/actions.ts` (hash
`17eabf4d8d…`), `equity/server/src/measurement.ts` (`9109c826d8…`),
`crypto/server/src/actions.ts` (`301e270e72…`) — workspace copy;
deployed parity unverifiable from here (see HONEST-FLAGS.md).

---

## 1. Integration: veto + entry contract on the orchestrator's issuance path

### 1.1 Current state (what the sandbox proves)

`processCandidate` (orchestrator/src/orchestrator.ts) currently runs:
expiry → min-score → freshness-gated refresh → `qualifyCandidate` (vendored
`signalIssuanceDecision` / `evaluateBornDead` + `evaluateShortRegimeGate`) →
duplicate suppression → `issueCandidate` (sandbox issuer doubles) → alert.

The corrected three-way veto (`runIssuanceChecks`, veto/src/veto.ts) is NOT
on this path. Demos (f)–(h) prove the veto module, not its integration.
Import equality of the production gates is proven (demo-report.md); that
proves the orchestrator calls the real gate functions, not that the
corrected semantics govern issuance.

### 1.2 Implemented call sequence (2026-10-13 repair)

Implements `processIntegratedCandidate`
(orchestrator/src/issuance/handler.ts). The corrected order (correction 2):
the pending contract is built BEFORE any entry is validated — entry
validation happens only inside `observeEntry`, against a pending contract
reloaded from the database (no in-memory registry). The setup-history
filter runs at qualification; the genuine decision→entry veto runs AFTER
entry observation, over the real [contract.decisionAt, entryObservedAt]
interval (2026-10-13 repair). Neither ever produces a fill.

```
processIntegratedCandidate(deps, candidate, via, invocationId?)
  1. expiry / min-score                         (unchanged pipeline guards)
  2. freshness-gated cheap refresh               (stale -> deferred; never
                                                  issued on stale evidence;
                                                  defer/refresh writes guarded
                                                  to live candidates)
  3. RETAINED regime gate                        (equity: evaluateEquityShortRegime;
                                                  crypto: evaluateShortRegimeGate —
                                                  shorts only. The legacy
                                                  historical-extreme veto is
                                                  NOT on this path.)
  4. buildIssuanceVetoInput(candidate, fresh, now) -> IssuanceVetoInput
       - decisionAt = the ACTUAL decision instant (handler run time — the
         same instant the contract will record as contract.decisionAt),
         never min(detectedAt, nowMs). detectedAt is recorded as
         preDecisionAt: bars before it are setup-history FEATURES.
       - entryZone: EntryZoneInput {
           direction, entry /* live quote the entry WOULD be based on —
                               an executability sanity check, not a fill */,
           referenceEntry /* decision-time reference */,
           driftLimitBps /* 50 equity | 150 crypto */,
           entryAt, expiresAt /* null at this stage; the contract's entry
                                 window governs expiry at observation time */ }
       - pipeline: { draftStop, publishedStop }   /* pipeline-order guard */
  5. runQualificationChecks(input)  [veto/src/waiting-interval.ts]
       // setup-history filter + pipeline-order + entry-zone ONLY.
       // Pre-decision extremes are recorded as features, never stop-outs.
       // NO decision→entry invalidation — the entry has not been observed
       // yet. fail_closed -> reject gate "issuance-veto" (no contract
       // built, no alert); pass -> continue.
  6. duplicate suppression                       (pre-check; re-checked
                                                  atomically inside the
                                                  outcome transaction)
  7. buildPendingContract(candidate, qualification)
       [entry-v1/src/pending.ts]  (corrections 2+3)
       - entry fields EXPLICITLY null: entryPrice / entryObservedAt /
         entryReceivedAt / driftObservedPct = null,
         entryEvidence = "unavailable", entryState = "pending".
         A pending contract never carries a fill.
       - decisionAt = the ACTUAL decision instant (handler run time),
         threaded through verbatim — never backdated to a bar close;
         contractInput.decisionAt must equal qualification.decisionAt.
       - entryRule per terminal ("next-xnys-regular-session-open-print" |
         "first-post-decision-binance-spot-trade"); cross-field validation
         enforced by buildContract (throws on terminal/rule mismatch)
  8. QUALIFICATION COMMIT (one DB transaction, ownership-guarded):
       proceeds ONLY if the candidate is still pending/deferred. Contract
       row (pending) + candidate (awaiting-entry, contractId,
       setupAlertAt) + setup alert ENQUEUED. A concurrent race loser
       returns the accepted state unchanged — no observation, no write;
       liveness holds via tick resume of the winner's durable state.
       The alert is DELIVERED after the commit (separate timestamp).
       Timestamps: setupAlertAt (enqueue), setupDeliveredAt (delivery).
  9. entry observation — the SEPARATE entry step (correction 2).
       Injectable VenueFeed/WatchClock; poll cadence strictly finer than
       the entry window (correction 4). Each observation is a distinct
       persisted event with its OWN timestamp (eventRecordedAt — the
       recording instant), separate from the venue timestamp
       (entryObservedAt) and the server receipt time (entryReceivedAt).
       LATE FETCH: the clock is re-read after EVERY awaited feed call —
       receipt past the window voids as void_expired ("late receipt:
       historical reconstruction, not an actionable entry"). Prints older
       than maxObservationAgeMs are skipped; wrong-venue prints are
       skipped (explicit venue map). Poll-budget exhaustion with the
       window still open keeps awaiting-entry + schedules a reassessment
       — distinctly NOT an expiry. Business outcomes (entered | expired |
       invalidated) return; integrity violations throw ContractError —
       never recorded as outcomes.
 9b. checkWaitingInterval(...)  [veto/src/waiting-interval.ts] — the genuine
       decision→entry veto over the REAL [contract.decisionAt,
       entryObservedAt] interval, BEFORE the outcome commit. Setup-history
       (pre-preDecisionAt) is filtered as features; only post-decision
       extremes against the final published stop can invalidate. Verdict
       !== pass fails closed -> commitNonEntryOutcome, gate
       "waiting-interval-invalidation". Equity overnight gap (no bars by
       construction) passes with an explicit reason, never uncertain.
 10. checkPostEntryInvalidation(...)  [veto/src/veto.ts] — POST-ENTRY point
       (correction 6c): governs post-entry ONLY, never decision→entry.
       entryValid (entry print vs stop — stopped-at-birth) and
       interveningInvalidation carried separately. A post-entry stop-out
       AFTER a valid entry is a realized outcome: the signal IS persisted
       (issued) with the stop-out in detail — never vanished as a non-entry.
 11. OUTCOME COMMIT (one DB transaction — signal + contract + candidate +
     entry alert, atomic via the store's transaction controls, with the
     ownership/state guard INSIDE the transaction: the candidate must
     still be awaiting-entry AND the contract row still pending, else the
     transaction writes nothing and the loser returns the DB-accepted
     state):
       entered     -> signal row (claim-guarded) + contract (entered) +
                      candidate (issued) + entry alert (ENQUEUED, then
                      DELIVERED — separate timestamps). Timestamps:
                      entryObservedAt (venue), entryEnqueuedAt,
                      entryDeliveredAt.
       expired     -> contract (void_expired) + candidate (entry-expired).
                      Logged non-entry; never scored; no entry alert.
       invalidated -> void_drift / void_no_quote / void_expired-late-receipt /
                      waiting-interval-invalidation / stopped-at-birth:
                      contract + candidate (invalidated). No valid paper
                      entry occurred, so no signal row.
 12. return the final candidate record (tracker + alert event read off the store).

 Awaiting-entry resume: processIntegratedCandidate delegates
 awaiting-entry candidates to resumeAwaitingEntry (contract reloaded from
 the DB row, bounded observation run, no contract rebuild, no setup-alert
 re-fire). integratedTick picks up awaiting-entry candidates whose
 nextReassessmentAt is due. Crash-recovery = new store on the same DB file.
```

Exact signatures (frozen in the sandbox source):

- `runQualificationChecks(input: IssuanceVetoInput): IssuanceVetoResult`  [veto/src/waiting-interval.ts]
- `checkWaitingInterval(input: WaitingIntervalInput): WaitingIntervalResult`  [veto/src/waiting-interval.ts]
- `runIssuanceChecks(input: IssuanceVetoInput): IssuanceVetoResult`  (retained for veto unit tests; NOT on the integrated path)
- `checkSetupInvalidation(input: SetupInvalidationInput): CheckResult`
- `checkEntryZone(input: EntryZoneInput): CheckResult`
- `validatePipelineOrder(input: { draftStop: number|null; publishedStop: number; checkedStop: number }): CheckResult`
- `buildPendingContract(candidate: CandidateIdentity, qualification: PendingQualification): ActionableEntryContract`
- `observeEntry(pendingContract: ActionableEntryContract, observation: EntryObservation, clock?: ObservationClock): EntryObservationEvent`
- `checkPostEntryInvalidation(input: PostEntryInvalidationInput): PostEntryInvalidationResult`
- `buildContract(input: ContractInput): ActionableEntryContract`
- `enterContract(contract: ActionableEntryContract, obs: EntryObservation): ActionableEntryContract`
- `voidContract(contract: ActionableEntryContract, obs: VoidObservation): ActionableEntryContract`

### 1.3 Guard: the old historical-extreme veto cannot override the new semantics

The old veto lives in two places on the current path and must be removed
from it (not deleted from the codebase — preserved for provenance):

- crypto: `evaluateBornDead` imported in `orchestrator/src/gates/crypto-gates.ts`
  and called by `qualifyCandidate`.
- equity: the born-dead branch inside vendored `signalIssuanceDecision`
  (`orchestrator/src/gates/equity-gates.ts`).

Build requirement: `qualifyCandidate` is replaced by step 2–3 above. The
short-regime gate (`evaluateShortRegimeGate` / the short-regime branch) is
RETAINED — it is a regime filter, not the historical-extreme veto, and its
semantics are unchanged.

Acceptance tests (must both pass):
- **Static:** `tests/no-legacy-veto.test.ts` scans the orchestrator's module
  graph from `processCandidate`; fails if `evaluateBornDead` (crypto) is
  reachable, or if the born-dead reason-string prefix (`BORN_DEAD_REASON_PREFIX`
  / `"born-dead"`) is produced anywhere on the issue path except inside
  `runIssuanceChecks`' own reason strings. The equity gate file must export
  the short-regime check separately from the born-dead branch, or the
  orchestrator must call a decomposed entry point — builder's choice,
  test decides.
- **Behavioral:** fixture with a pre-decision stop crossing and a clean
  post-decision path → `processCandidate` issues (the old veto would have
  suppressed). Fixture with a genuine post-decision breach → suppressed
  with `setup_invalidation=fail`. Both through the integrated handler.

### 1.4 Reused persistence and recovery controls (named, not reinvented)

- `WriteStore` (`orchestrator/src/issuers/sandbox-store.ts`): `upsertCandidate`,
  `saveCandidate`, `getCandidate`, `listCandidates`, `appendSuppression`,
  `appendAlert`, `persistIssuedSignal`, `listSignals`. Atomic tmp+rename
  writes — partial writes impossible by construction.
- Content-hash identity: `candidateIdFor` (`orchestrator/src/orchestrator.ts`)
  over decision identity (terminal/symbol/direction/signalDate/params) —
  replay-safe ingest, exactly-once issuance.
- Injectable `Clock` (`orchestrator/src/clock.ts`) — deterministic tests.
- Drift policing: `tests/drift.ts` + `tests/drift-hashes.json` re-hash
  vendored source ranges; any upstream change fails the build.
- Outcome records: every candidate persists `issued` / `rejected` (gate +
  reason) / `deferred` (reason + `nextReassessmentAt`); expiry is a rejection
  with gate `"expiry"`.
- Crash recovery: store reload + `ingestCandidate` replay-safety (demo (e)
  verified: re-ingest after restart → still exactly one signal, issuer not
  re-entered).

The entry contract rows persist alongside the candidate record
(`contractId` on both); contract state transitions (`pending → entered |
void_drift | void_expired | void_no_quote`) are terminal and deep-frozen.

---

## 2. Equity state machine: qualified → awaiting entry → entered / expired / invalidated

### 2.1 States and transitions

```
qualified        contract built (buildPendingContract), entryState="pending".
                 Setup alert fires HERE (see §2.2).
      │ tick / entry-observer (resumeAwaitingEntry)
      ▼
awaiting entry   entry window open [entryWindowOpensAt, entryWindowExpiresAt].
      │── open print observed, |drift| ≤ cap ──▶ entered
      │── window expires, no acceptable print ─▶ expired  (void_expired)
      │── print outside drift cap ─────────────▶ invalidated (void_drift)
      │── setup invalidated in waiting interval ▶ invalidated
                                              (waiting-interval-invalidation)
```

- `entered`: `enterContract(contract, obs)` with the venue print;
  `entryPrice`, `entryObservedAt` (venue), `entryReceivedAt` (server),
  `driftObservedPct` persisted. Terminal.
- `expired`: `voidContract(contract, { entryState: "void_expired", … })`.
  Logged non-entry; excluded from the accuracy cohort, never scored MISS.
- `invalidated`: no valid paper entry occurred. From awaiting entry: print
  outside the drift cap (`void_drift`), no venue feed (`void_no_quote`),
  late receipt past the window (`void_expired` with "late receipt:
  historical reconstruction" reason), a setup invalidated in the waiting
  interval (`checkWaitingInterval` over [contract.decisionAt,
  entryObservedAt], gate `"waiting-interval-invalidation"`), or the entry
  print itself crossed the stop (stopped-at-birth, via
  `checkPostEntryInvalidation` entry validity). The qualification gate
  (`runQualificationChecks` at §1.2 step 5 — setup-history filter +
  pipeline-order + entry-zone) rejects the candidate outright (gate
  `"issuance-veto"`) and never produces an awaiting-entry contract.
  Distinct from `expired`: invalidated means the thesis broke or the entry
  was never valid; expired means the window lapsed.

### 2.2 Three timestamps (all persisted per signal — non-negotiable)

| Timestamp | Meaning | Set when |
|---|---|---|
| `setupAlertAt` | decision-time alert: "setup qualified, entry pending" | `buildContract` / qualification |
| `entryObservedAt` | venue timestamp of the entry print | `enterContract` |
| `alertDeliveredAt` | alert-feed write for the entered signal | alert append |

**Forbidden:** presenting the next-session open price as an entry the user
could already have taken. The open print becomes available AFTER that open;
the setup alert (`setupAlertAt` ≤ decision window) must strictly precede
`entryObservedAt`. Any display or log line showing `entryPrice` MUST also
show `entryObservedAt` and MUST NOT imply executability before that instant.
A test asserts `setupAlertAt < entryObservedAt` on every entered fixture.

### 2.3 Expiry and drift values (frozen v1)

- Equity: entry window = next XNYS regular session open (session-bounds end
  as decision time; early-close/Friday→Monday handling in
  `entry-v1/src/entry-rules.ts`); drift cap ±0.50%.
- Crypto: first post-decision Binance Spot trade print, venue timestamp ≥
  `decisionAt` required; window +15 min; drift cap ±1.50%.
- The five ungrounded params are explicit tunables (`UngroundedParams`),
  never hidden constants; changing any of them requires contract v2.

---

## 3. Scheduler spec

### 3.1 Trigger and cadence

- One cron per terminal invoking `tick(deps)` (orchestrator/src/orchestrator.ts).
- Default cadence **30 minutes**. Crypto: 24/7. Equity: tick gated to
  09:00–16:45 ET on XNYS sessions (pre-market staging allowed from 08:00 ET
  so candidates are qualified before the open print they will use).
- No cron wiring exists in the sandbox; the scheduler calls `tick()` on its
  own cadence. First enablement is paper-lane only (see rollout in the
  draft spec).

### 3.2 Candidate selection

`tick()` processes candidates with `status == "pending"` plus `"deferred"`
whose `nextReassessmentAt <= now`. Broad discovery scans keep their existing
cadence and remain radar-only (12h equity / 6h crypto); the scheduler never
rescans the universe — it reassesses watched/shortlisted candidates.

### 3.3 Reassessment frequency and cheap-refresh path

- Per-candidate freshness: inputs older than `freshnessMs` (default 30 min)
  trigger `quoteProvider.refresh(candidate, nowMs)` — a lightweight quote
  fetch (latest quote + any new bars since `inputs.asOf`), NOT a full
  dossier recompute.
- The cheap-refresh path runs inside `tick()` for due candidates only.
  Full factor recomputation happens only when the refresh returns
  materially new inputs (new bar closed or quote moved > 0.25% — tunable,
  default in config).
- Watched candidates between broad scans: reassessed on every tick while
  `pending`/`deferred-due`; each reassessment persists `lastReassessedAt`.

### 3.4 API budget (per-cycle caps)

| Resource | Cap per tick | Notes |
|---|---|---|
| quote refreshes | ≤ 50 candidates | due-first ordering; overflow rolls to next tick, never dropped |
| full dossier recompute | ≤ 10 candidates | only on materially-new inputs |
| 429 / provider error | exponential backoff, candidate deferred | never issue on failed refresh |

Caps are config (`maxRefreshPerTick`, `maxRecomputePerTick`), consistent
with existing rate limits (CoinGecko free tier, Yahoo). A tick that hits a
cap reports `budget_exhausted` with the carryover count — silent shedding
is a defect.

### 3.5 Expiry, duplicates, failure recovery

- Expiry: `candidateTtlMs` default 48h from `firstSeenAt` → rejected, gate
  `"expiry"`, suppression row persisted.
- Duplicate suppression: same instrument+direction issued within
  `duplicateWindowMs` (default 24h) → rejected, gate `"duplicate"`, names
  the winning signalId.
- Provider failure: `refresh()` returns null → candidate `deferred` with
  `nextReassessmentAt = now + retryBackoffMs` (default 15m). Never issued
  on stale evidence (demo (c) verified).
- Partial writes: impossible — atomic tmp+rename on every store write.
- Crash/restart: store reload + replay-safe `ingestCandidate` → at most one
  issuance per candidate (demo (e) verified).

---

## 4. Integrated demo plan (through the COMPLETE handler)

Each demo runs `processCandidate` (or `tick`/`manualIssue`) end-to-end with
the integrated path from §1.2: corrected veto → entry contract →
persistence → tracker view → alert event. Each demo states input, the
expected path, and assertions. Demos 1–8 mirror the sandbox acceptance
demos but through the integrated handler; demo 9 is new.

**Demo 1 — qualifying issuance exactly once.** Input: equity long fixture
with clean post-decision path. Path: tick → veto pass → contract built
(pending) → issuer records → entered on open print → tracker + alert.
Assertions: exactly one signal; `setupAlertAt < entryObservedAt`;
contractId on signal row; alert row references both; second tick issues
nothing.

**Demo 2 — clean abstention.** Input: crypto long with post-decision breach
of the final published stop. Path: tick → `runIssuanceChecks` fail_closed
(`setup_invalidation=fail`) → rejected, no contract built, no alert.
Assertions: zero signals; suppression row carries the exact reason string;
no entry contract exists for the candidate.

**Demo 3 — stale quote rejection.** Input: candidate with inputs older than
`freshnessMs`, quote provider returns null. Path: tick → deferred
(`stale-inputs`), `nextReassessmentAt` set. Assertions: no issuance, no
contract, no alert; re-tick after provider recovers → proceeds.

**Demo 4 — expired candidate.** Input: candidate with
`now - firstSeenAt > candidateTtlMs`. Path: tick → rejected gate `"expiry"`.
Assertions: issuer never entered; suppression row cites the TTL.

**Demo 5 — restart/replay.** Input: issue once, reload store from disk,
re-ingest same candidate, tick. Path: ingest resolves to existing record →
no-op. Assertions: still exactly one signal; issuer attempts unchanged;
same signalId and contractId.

**Demo 6 — pre-decision crossing.** Input: yesterday's bar crossed the
proposed stop; post-decision path clean. Path: tick → veto pass (crossing
recorded as setup feature, `detail.preDecisionFeatures`) → issued.
Assertions: issued; reason trail shows the pre-decision bar did NOT veto.
(This is the behavioral proof for §1.3's guard.)

**Demo 7 — genuine setup invalidation.** Input: post-decision 1h bar
breaches the final published stop. Path: tick → `setup_invalidation=fail`
→ rejected. Assertions: reason names the post-decision bar and the final
stop; `validatePipelineOrder` passes (checked stop == published stop).

**Demo 8 — straddling uncertainty.** Input: forming 4h candle straddles
`decisionAt`, extreme crossed the stop. Path: tick → uncertain →
fail_closed. Assertions: rejected with the straddle rule cited; pre-decision
portion never treated as a definite breach.

**Demo 9 — overlapping manual and scheduled calls → one issuance.**
Input: qualifying candidate; call `manualIssue` and `tick` concurrently
(interleaved, same store). Path: both resolve through `processCandidate`;
content-hash identity + issuer idempotency. Assertions: exactly one signal,
one contract, one alert; the loser returns the existing record (no error,
no duplicate); delays recorded once.

---

## 5. 58/118 research export — specification

### 5.1 What the claim is

Crypto discovery alignment ≥ 60 → 49.2% 5-day directional hit rate
(58/118) vs < 40 → 30.3% (27/89). Reproduced exactly from the workspace DB
copy (`~/workspace/ts-spaces/altcoin-analyzer-and-signal-tracker/app.db`,
read-only) — see `research/ranking-claim-60pct-recomputation-2026-10-13.md`.
**The entire result is EXPLORATORY until comparability is verified.**

### 5.2 Score definitions (both columns, never conflated)

| Column | Source | Scale | Meaning |
|---|---|---|---|
| `alignment` | `discovery_signals.alignment` | 0–100 | Σ(7 discovery-dimension contributions) − trend/momentum redundancy (−10 when both pass), floored at 0. **Confidence in the selected direction**; direction stored separately. Code: crypto `actions.ts:1028–1086`. **This is the column the claim uses.** |
| `dossier_signed_long` | `signal-methodology.ts` `scoreDossierFactors` | 5–95 | `round(clamp(50 + (weightedNet/totalWeight)×42, 5, 95))`. Signed long score; <50 favors short. |
| `dossier_confidence` | derived | 50–95 | `longScore` if direction=long else `100 − longScore`. Always ≥50. Verified 30/30 on `generated_signals` rows. |

### 5.3 Required export columns (per row)

`discovery_id, symbol, coin_id, first_seen_run_id, run_id,
first_seen_direction, current_direction, direction_mutated (bool),
alignment, dossier_signed_long (nullable — only for issued dossiers),
dossier_confidence (nullable), outcome_5, return_5_pct, first_seen_price,
outcome_price, first_seen_at_utc, outcome_at_utc,
methodology_version (inferred), horizon_days (=5),
excluded (bool), exclusion_reason, provenance (db path + query hash)`

### 5.4 Strategy versions and provenance

`discovery_signals` records NO per-row strategy version. Applicable
methodology is inferred from `first_seen_at` against `methodology_freezes`:
`v1` (frozen 2026-10-05), `crypto-phase1-1-measurement-closure-2026-10-09`,
`crypto-phase1-final-signoff-2026-10-09`. The 364 graded rows were first
seen in runs 1–5 (2026-10-01→02), i.e. **pre-freeze / v1-era** — the export
must state this; do not attribute v1+ semantics to pre-freeze rows.
Provenance per row: source DB path, table, row id, and the export query's
SHA-256. Outcome definition (verified in code, crypto `actions.ts`
~2463–2484): `outcome_5="hit"` iff directional 5-day return > 0 from
`first_seen_price` to the close nearest `first_seen_at + 5d`, flipped by
`first_seen_direction` (NOT current direction); `sign(return_5)>0 ⇔
outcome_5="hit"` verified 364/364.

### 5.5 Exclusions

Excluded from the 364: none — all rows with `outcome_5 IS NOT NULL` are
included. Rows with NULL `outcome_5` (< 5 days old at capture) are not
excluded by judgment; they are simply not yet gradable — count them
separately in the export header.

### 5.6 Caveats (prominent, not footnotes)

- **40.1% direction mutation** (146/364 rows have `current_direction ≠
  first_seen_direction`, mostly demotions to `watch`); mutated rows' mean
  alignment 37.8 vs 56.8 for non-flipped. The stored alignment reflects the
  LATEST appearance, not necessarily the graded one. The bucket math
  reproduces exactly, but this is directional evidence from a mutated
  table, not a clean backtest.
- **Comparability unverified:** the claim must stay EXPLORATORY until an
  independent re-run on frozen methodology reproduces the bucket ordering.
- **C-2 shadow rule:** C-2 (`crypto-dossier-minus-momentum`,
  `0.1.0-shadow`) collects shadow scores on the same candidate stream
  INCLUDING production rejects, per `research/c2-shadow-spec-2026-10-13.md`.
  No promotion. If C-2's direction flips vs production, levels are mirrored
  and the stated gates applied to C-2's direction. Horizon predictions are
  graded independently of barrier resolution; abstentions and missed
  opportunities are counted explicitly.

---

## Acceptance (expert's shape, unchanged)

Deployed evidence only: run IDs for ≥ 1 full tick cycle, per-candidate
traces (issued/rejected/deferred with gates), the 9 integrated demos green
against the integrated handler, named artifact versions, and the exact
missing capability if any. Sandbox tests/demos are supporting evidence,
not acceptance. No brokerage execution at any stage.
