# Deployed-vs-sandbox capability table — paper pipeline (2026-10-14)

**Scope:** paper signals only, crypto terminal `altcoin-analyzer-and-signal-tracker`.
No brokerage. No prediction-weight, frozen-model, or holdout changes. No repeat audit of accepted components.

**Ground truth used:**
- Deployed executing code = the artifact's own server tree:
  `~/workspace/ts-spaces/altcoin-analyzer-and-signal-tracker/server/src/actions.ts`
  (5,424 lines; `runExplicitPaperCycle` at 3011-3100; built into the bundle 2026-10-14 18:39Z,
  source/bundle in sync per the strategy inventory) + `server/src/paper-v219.ts`
  (150 lines; `ISSUANCE_HANDLER_VERSION = "2.1.9"`, `fetchBinanceTradeHistory`, first-print identity).
- Live deployed evidence: `getpaperpilotstatus` post-deploy snapshot
  (`status-2026-10-14T18-57-02Z.json`) reporting `handler_version: "2.1.9"`;
  deployed paper runs 1–6 all empty (0 candidates); run 7 (builder probe-DB) 10 considered / 10 deferred.
- Sandbox reference = `~/workspace/goals/research-terminal/paper-signals/`:
  `orchestrator/src/issuance/handler.ts` (v2.1.9, 2,253 lines),
  `veto/src/{veto.ts,waiting-interval.ts}`, `entry-v1/src/{contract.ts,entry-rules.ts}`,
  `handoff/src/qualify.ts`, `orchestrator/src/types.ts`.
- **Hash-vs-behavior note (load-bearing):** `PAPER_SOURCE_HASHES` in the deployed
  `paper-v219.ts` pins the *sandbox* file hashes (orchestrator handler `6a9aaf62…`, etc.)
  as provenance reference. Those hashes do **not** prove the sandbox modules execute on the
  deployed path — the deployed path executes the artifact-native equivalents in
  `actions.ts` + `paper-v219.ts`. Parity below is judged on **behavior**, per control,
  never on hash equality. This matches the inventory's §9 warning.

---

## (a) Five-row capability table

### Control 1 — Qualification (pre-entry gates)

| | SANDBOX behavior | DEPLOYED behavior | PARITY |
|---|---|---|---|
| Where | `orchestrator/src/issuance/handler.ts` steps 1–6 (lines 2085-2122); `veto/src/waiting-interval.ts:262-292` (`runQualificationChecks`); `orchestrator/src/types.ts:226` (`duplicateWindowMs`, dup gate only — see Control 4) | `server/src/actions.ts`: handoff pre-filter `persistPaperHandoffSnapshot` (2944-2985); ordering guard `latestCompletedPaperHandoff` (2987-2994); 9-gate ladder in `runExplicitPaperCycle` (3046-3055) | **PARITY (functional)** — no integration |
| Gates | 1. min-score floor (vacuous at default `minScore=0`, documented "0 = disabled"; handler.ts:2085-2093). 2. Freshness-gated cheap refresh — stale → deferred (`refreshIfStale`, handler.ts:539; step 2 at 2096-2098). 3. Retained regime gate, shorts only (`retainedRegimeGate`, handler.ts:601-622). 4. `runQualificationChecks` = `validatePipelineOrder` (final published stop is the graded stop) + `checkSetupHistory` (pre-decision extremes → features, never stop-outs; never fails) + `checkEntryZone` (drift cap + expiry on the *proposed* entry) — verdict `pass`/`fail_closed` (waiting-interval.ts:262-292; called handler.ts:2103-2115). 5. Duplicate pre-check (see Control 4). | Direction must be long/short (else `direction_unqualified` → abstained). Then ordered: `pre_freeze_candidate` → deferred (3047); `decision_input_unverified` (incomplete dimension ledger via `hasDimensionLedger` = 5–8 dims, or missing source timestamp) → deferred (3048); `future_source_timestamp` (source > decision + 2,000 ms `PAPER_FUTURE_SKEW_MS`) → deferred (3049); `stale_decision_inputs` (decision − sourceObserved > 30 min) → deferred (3050); `venue_mapping_unavailable` (no explicit Binance Spot USDT pair in 11-entry `COVERAGE`, actions.ts:118-130 — only 9 live pairs) → deferred (3051); `invalid_frozen_levels` (stop missing or wrong side of decision reference) → abstained (3052); `min_score_strength_floor` (`|productionScore| < 0` — vacuous by construction, documented) → abstained (3053); `production_model_abstain` (`paperScores` production < 60 or >1 severe fail) → abstained (3054); `entry_window_expired_before_observation` → expired (3055). Handoff lane adds: directional + complete ledger → `eligible` (else `monitor_only` / `no_factor_ledger` / rejected); the paper cycle may consume only the handoff linked to the latest complete/degraded discovery run (anti-race ordering guard, 2987-2994). | The deployed 9-gate ladder covers every qualification-relevant sandbox semantic and adds freeze-gating, 2s future-skew, 30-min staleness, and venue/model gates the sandbox handler lacks. The three sandbox-only sub-checks need no integration: (i) **pipeline-order** — not applicable: the deployed path threads a single stop value (handoff `invalidationLevel` → candidate `stopPrice`); there is no draft/published/checked stop triple, so the guard is vacuous. (ii) **setup-history** — equivalent by construction: the deployed path never fetches pre-decision bars, so pre-decision extremes cannot veto — the exact outcome the filter guarantees. (iii) **entry-zone at qualification** — present at observation instead (50 bps drift cap + window-expiry, actions.ts:3079-3085); on a single-pass path the pre-commit check would be a no-op duplicate. Short-regime: applied upstream in discovery (`issuanceCheckedCandidates`, actions.ts:4003-4004 — regime-failing shorts get `suppressionReason` and never reach the handoff), so no paper-path gate is needed. |

### Control 2 — Waiting-interval veto (decision→entry invalidation)

| | SANDBOX behavior | DEPLOYED behavior | PARITY |
|---|---|---|---|
| Where | `checkWaitingInterval` (`veto/src/waiting-interval.ts:151-228`), called at handler.ts:1873-1901 (step 9b) over the REAL `[contract.decisionAt, entryObservedAt]` window using bars from `deps.waitingIntervalEvidenceFor(entered)`; verdict `fail` or `uncertain` fails closed → `invalidated`, reason `waiting-interval-invalidation`, no signal row. Empty evidence + `allowEmptyInterval=false` (crypto) → `uncertain` → fail-closed. | **No `checkWaitingInterval` call exists on the deployed path** (verified by grep over `server/src/`; the only waiting-window-adjacent checks are timestamp identity `first.ts < decisionAt` → invalidated at actions.ts:3080, and coverage fail-closed `non-entry:first-print-unverifiable` at 3077). | **NOT APPLICABLE IN SANDBOX FORM — protection ENTAILED. No integration (a check that cannot fail is not a control).** |
| Evidence | n/a | Proof sketch (all deployed lines): entry observation fetches prints `P` over `[decisionAt, min(now, windowEnd)]` (actions.ts:3067); `first = argmin(P)` by `(ts, venueSeq)` (paper-v219.ts:64-66, actions.ts:3071), so **no print in P precedes `first.ts`** — the waiting window `[decisionAt, first.ts)` contains zero prints *by the first-print identity*. Issuance additionally requires head-coverage attestation (3077, else invalidated), `first.ts ≥ decisionAt` (3080), and `risk = ±(first.price − stopPrice) > 0` (3088-3089, else `invalid_final_levels` → abstained). A stop breach in the waiting window requires a trade print crossing the stop; no such print can exist (first-print identity + attested head coverage); the entry print itself is on the favorable side of the stop (risk>0). **The sandbox veto's fail condition is unreachable on this path.** The sandbox's empty-evidence fail-closed is answered by the coverage attestation failing closed (`non-entry:first-print-unverifiable`) — on the deployed path the observation feed and the waiting-interval evidence are the *same* attested adapter response, so "empty" means "no trades occurred" (provable), not "evidence feed failed" (the case the sandbox guard is for). | **Residual assumption (named, not hidden):** the entailment rests on the documented endpoint assumption that Binance `aggTrades` returns prints in ascending `(ts, aggregate-trade-id)` order from `startTime` (paper-v219.ts:126-130). If the venue is dishonest/incomplete, every control on this path degrades together — the coverage attestation is the backstop, and it fails closed. Falsification probe for the coordinator: for every row in `getpaperpilotstatus` → `signals[]`, verify `entryPrice` is strictly on the favorable side of `stopPrice` and the matching `checkpoints[]` row has `coverageJson.headCoverageEstablished === true`. Any violation falsifies the entailment and re-opens a real waiting-interval integration. |

### Control 3 — Entry observation (first-print identity, window, coverage, drift)

| | SANDBOX behavior | DEPLOYED behavior | PARITY |
|---|---|---|---|
| Where | `orchestrator/src/issuance/handler.ts` step 9 (doc lines 88-125); entry contract `entry-v1/src/contract.ts:333` (`enterContract`), crypto leg `first-post-decision-binance-spot-trade` (`entry-v1/src/entry-rules.ts:447`); handler.ts:919-935 (`entryReceivedAt`/`entryObservedAt` ordering + first-print-ts identity); handler.ts:1212 (`entryObservedAt` set from first print ts) | `server/src/actions.ts:3066-3093`; `server/src/paper-v219.ts:64-66` (`comparePrintsByVenueOrder`), `paper-v219.ts:104-148` (`fetchBinanceTradeHistory` + coverage attestation) | **PARITY** — no integration |
| Behavior | 15-min window; first-print identity = earliest eligible print by `(ts, venueSeq)` using the real Binance aggregate-trade id `a` (v2.1.7); history-coverage proof per batch — absent/insufficient coverage → `non-entry:first-print-unverifiable` fail-closed (v2.1.8); max observation age 5 min → `non-entry:first-print-missed`, never substitute a later print; empty venue history at window close → un-verifiable fail-closed; late receipt (clock re-read after await, receipt past window) → `void_expired` ("historical reconstruction is not an entry"); drift > 50 bps → `void_drift`; wrong-venue prints skipped; per-run recovery checkpoint persisted; crashed `awaiting-entry` resumes from the persisted contract row. | 15-min window (`PAPER_ENTRY_WINDOW_MS`, actions.ts:2898); first-print identity = `prints[0]` sorted by `comparePrintsByVenueOrder` (`ts`, then `venueSeq` = real Binance `a`) — identical rule; `headCoverageEstablished` required (else `non-entry:first-print-unverifiable`, 3077); empty + window elapsed → `non-entry:first-print-unverifiable` fail-closed; receipt after window → `expired`/`entry_receipt_after_window` ("historical reconstruction is not an entry", 3079); `first.ts < decisionAt` → invalidated (3080, a superset of the sandbox's time-coherence checks); receipt − print.ts > 5 min → `non-entry:first-print-missed`, no substitution (3082); drift > 50 bps → `entry_outside_drift_zone` → abstained (3085; state label differs from sandbox `void_drift`, effect identical — no signal row); checkpoint persisted per candidate to `paperEntryCheckpoints` with `contractState` pending/entered/void_* (3074-3075); `awaiting_entry` resumes re-observation via candidateKey re-entry (3037-3038). Venue anti-cross rule structural: single venue `binance-spot`, prints constructed with that venue label. | Every named v2.1.7/v2.1.8/v2.1.9 entry control has a deployed equivalent with identical thresholds (15-min window, 5-min age, 50 bps drift, `(ts, venueSeq)` identity, head-coverage fail-closed). The poll-cadence/resume machinery of the sandbox collapses to single-pass + re-entrant `awaiting_entry` on the deployed path — a structural difference, not a gap: the deployed path reconstructs from one attested fetch rather than polling live, and both paths reject post-window receipts as entries. |

### Control 4 — Duplicate suppression (24h window)

| | SANDBOX behavior | DEPLOYED behavior | PARITY |
|---|---|---|---|
| Where | `findDuplicate` (handler.ts:628-640): same terminal + symbol + direction, different candidateId, issued within `config.duplicateWindowMs`; `duplicateWindowMs = 24 * 3_600_000` (24h, `orchestrator/src/types.ts:226`). Enforced as pre-check at step 6 (handler.ts:2116-2122) AND atomically inside the outcome transaction (`DuplicateIssuanceError` → clean `duplicate` rejection, handler.ts:1909-1925). | CandidateKey idempotency only (actions.ts:3036-3038): `candidateKey = ${PAPER_FREEZE_VERSION}:${handoffCandidate.candidateKey}`; an existing row in a non-`awaiting_entry` state is returned as-is, an `awaiting_entry` row resumes. **The handoff candidateKey embeds the discovery run id** (actions.ts:2971: `${PAPER_FREEZE_VERSION}:handoff:${discoveryRunId}:${coinId}`). | **GAP — CONFIRMED. Integration spec provided below (§b).** |
| Effect | A second issuance for the same symbol+direction within 24h of an issued signal is suppressed, regardless of candidate identity. | A new discovery run (every 6h) mints a *new* candidateKey for the same coin+direction, so the same symbol+direction can issue again hours after the first — e.g. a BTC long from handoff run N and another BTC long from handoff run N+1 within the same day. The deployed dedupe only stops retries of the *same* handoff candidate, never cross-run repeats. | Real behavioral divergence, not a labeling difference. The 24h window is a required control (named in the repair scope); the deployed path lacks it. |

### Control 5 — Evaluation (30d target-before-stop outcome grading)

| | SANDBOX behavior | DEPLOYED behavior | PARITY |
|---|---|---|---|
| Where | At-issuance: `checkOutcomes` (`veto/src/veto.ts:348`) grades post-entry target/stop per the frozen evaluation contract; the sandbox handler's step 10 (`assessPostEntry`, handler.ts:1282-1311) applies it immediately — "stopped at birth" → invalidated (no signal row); valid entry then stopped out → **signal persisted with the stop-out in detail** (never vanished). 30-day barrier outcomes: graded by the comparison program (`comparison/harness.py`) at maturity, never in the issuance path. | At-issuance: `invalid_final_levels` (risk ≤ 0 → abstained, actions.ts:3089) is the deployed "stopped at birth" equivalent — an entry print on/beyond the stop cannot issue. Issued rows stamp `evaluatorVersion: "paper-target-before-stop-v2.1.0"` (actions.ts:3092 — label only, no evaluator implementation behind it, as the inventory found) and write `paperModelComparisons` with `outcomeStatus: "pending"`, `outcomeJson: null` (actions.ts:3060; schema.ts:971). The frozen evaluation contract is declared, not executed, in-artifact: `PAPER_PRODUCTION_SPEC.evaluation = {primary: "target-before-stop", horizon: "30 elapsed days", costsBps: 18, ambiguity: "same-bar double touch or boundary-straddling evidence remains unknown"}` (actions.ts:2908). `getPaperPilotStatus` exposes `segregation.prospectiveCompletedOutcomes` (actions.ts:3127) — currently 0. 30-day grading happens in the workspace comparison program at maturity (readout 2027-02-06 per `PAPER_COLLECTION_PLAN`). | **PARITY (by design)** — no integration. Neither issuance path executes the 30-day evaluator; both keep every issued signal visible to measurement (sandbox: signal row + detail; deployed: `paperSignals` row + `paperModelComparisons` pending row). Building an in-artifact evaluator would be a rebuild, not a repair, and would touch the frozen measurement contract — out of scope. |

---

## (b) Integration spec — 24h duplicate suppression (the one real gap)

**Target file (deployed tree):** `~/workspace/ts-spaces/altcoin-analyzer-and-signal-tracker/server/src/actions.ts`,
inside `runExplicitPaperCycle`.

**Anchor (verbatim, currently actions.ts:3088):**
```ts
    const risk = direction === "long" ? first.price - stopPrice : stopPrice - first.price; const target = direction === "long" ? first.price + 1.5 * risk : first.price - 1.5 * risk;
```

**Change:** insert the following block **immediately before** that line (i.e. after the
`if (finalState !== "issued" || !first) { … continue; }` block closes, so it runs only when the
outcome ladder reached `issued` with a valid first print — the deployed analog of the sandbox's
atomic in-outcome-transaction re-check):

```ts
    // 24h duplicate suppression (sandbox parity: findDuplicate in
    // orchestrator/src/issuance/handler.ts:628-640, duplicateWindowMs = 24h in
    // orchestrator/src/types.ts:226). The candidateKey idempotency above only
    // dedupes retries of the same handoff candidate — the key embeds the
    // discovery run id (actions.ts:2971), so it cannot suppress a repeat
    // signal for the same symbol+direction from a later discovery run.
    const duplicateWindowStart = new Date(nowAfterFetch.getTime() - 24 * 60 * 60_000);
    const priorDuplicate = (await db.select({ paperSignalId: schema.paperSignals.paperSignalId })
      .from(schema.paperSignals)
      .where(and(
        eq(schema.paperSignals.symbol, symbol),
        eq(schema.paperSignals.direction, direction),
        gt(schema.paperSignals.issuedAt, duplicateWindowStart),
      ))
      .limit(1))[0];
    if (priorDuplicate) {
      const duplicateReason = `duplicate suppressed: ${symbol} ${direction} already issued as ${priorDuplicate.paperSignalId} within 24h`;
      await db.update(schema.paperSignalCandidates)
        .set({ state: "abstained", reasonCode: "duplicate_24h_suppression", reason: duplicateReason, entryObservedAt: new Date(first.ts), entryReceivedAt: nowAfterFetch, entryPrice: first.price, updatedAt: new Date() })
        .where(eq(schema.paperSignalCandidates.id, inserted.id));
      results.push({ candidateKey, symbol, state: "abstained", reasonCode: "duplicate_24h_suppression", reason: duplicateReason, paperSignalId: null });
      continue;
    }
```

**Second change (same file, line 2):** extend the drizzle import to include `gt`:
```ts
import { and, asc, desc, eq, gt, inArray, lt, sql } from "drizzle-orm";
```

**Why this placement:** the sandbox enforces the window twice — pre-check at qualification
(handler.ts:2116-2122) and atomically in the outcome transaction (handler.ts:1909-1925).
On the deployed single-pass path nothing can issue between the gate ladder and the issuance
batch within one invocation, so one pre-issuance check at the outcome point is the faithful
equivalent of the atomic re-check (the one that actually prevents the duplicate row).

**Schema compatibility (verified):** `paperSignals` has `symbol` (text), `direction`
(enum long/short), `issuedAt` (timestamp_ms), `paperSignalId` (unique text) — schema.ts:953-959.
`paperSignalCandidates.state` accepts `"abstained"`; `reasonCode`/`reason` are free text.
`runpapersignalcycle`'s response `results[]` accepts any `state` string and nullable
`reasonCode`. No migration needed. No prediction weights, frozen models, holdouts, or
`PAPER_SOURCE_HASHES` touched (the pinned hashes are sandbox-file provenance; this edit is
to the deployed tree only).

**Residual race (named):** two concurrent `runpapersignalcycle` invocations in different
5-minute cadence buckets could both pass the SELECT before either inserts. The existing
`runKey` cadence dedupe (actions.ts:3021-3028) already serializes same-bucket repeats; the
cross-bucket residual is bounded and matches the atomicity level of the rest of the path
(the issuance batch itself uses `onConflictDoNothing`, not a serializable transaction).
If the builder's runtime supports it, wrapping the SELECT + issuance batch in one
transaction closes it fully — optional, not required for parity.

**Not integrated (deliberate, with reasons):**
- *Waiting-interval veto as a code gate:* would be a check that cannot fail — audit theater.
  Protection entailed (§a Control 2). Optional documentation-only addition: persist
  `waitingInterval: {note: "window [decisionAt, first.ts) contains no prints by first-print identity under attested head coverage; stop-breach unreachable"}` into the checkpoint JSON. Not a gate; do not fail anything on it.
- *`runQualificationChecks` sub-checks / in-artifact 30d evaluator:* not applicable by design
  (§a Controls 1 and 5).

---

## (c) Verification plan

### For the integrated 24h duplicate suppression
1. **Deploy + rebuild.** Confirm the new build succeeds and `getpaperpilotstatus` still reports
   `handler_version: "2.1.9"` with unchanged freeze identifiers.
2. **Static deployed proof (sandbox-labeled):** the sibling's build workspace shows the string
   `duplicate_24h_suppression` in the built server bundle and `gt` in the drizzle import —
   proves the code shipped, not that it fired.
3. **Behavioral proof (deployed):** the gate fires only on a genuine duplicate attempt, so proof
   requires one. When it fires: `runpapersignalcycle` → `results[]` contains
   `{state: "abstained", reasonCode: "duplicate_24h_suppression", reason: "duplicate suppressed: …"}`
   and `getpaperpilotstatus` → `candidates[]` shows the same `reasonCode` on the suppressed
   candidate row. **Until such a row exists, the control is deployed-but-unfired — report it as such.**
4. **Negative control (ongoing):** query `getpaperpilotstatus` → `signals[]`; assert no two rows
   share `(symbol, direction)` with `issuedAt` within 24h of each other, for all rows issued
   after the deploy. A violation = the gate is not live.

### For the waiting-interval entailment (no code change — falsification probe)
- For every row in `getpaperpilotstatus` → `signals[]`: assert `entryPrice` is strictly on the
  favorable side of `stopPrice` (long: `entryPrice > stopPrice`; short: `entryPrice < stopPrice`)
  and the matching `checkpoints[]` row has `coverageJson.headCoverageEstablished === true`
  and `contractState === "entered"`. Any violation falsifies the entailment and re-opens a real
  waiting-interval integration (independent OHLC evidence + `checkWaitingInterval` port).

### For the no-change controls (qualification, entry observation, evaluation)
- No new verification needed beyond what the live path already exposes: qualification reason
  codes in `runpapersignalcycle` → `results[]` / `preFilterReasons[]`; entry-observation
  checkpoints in `getpaperpilotstatus` → `checkpoints[]` (coverage, first-print identity,
  contractState); evaluation via `comparisons[]` (`outcomeStatus: "pending"` → graded by the
  comparison program at 30d maturity). The live path stays UNPROVEN until a genuine
  opportunity traverses it end-to-end — unchanged by this table.

---

## Files referenced (evidence index)

- Deployed tree: `~/workspace/ts-spaces/altcoin-analyzer-and-signal-tracker/server/src/actions.ts`
  (gates 3046-3055; observation 3066-3093; dedupe 3036-3038; handoff 2944-2994; COVERAGE 118-130;
  `paperScores` 2928-2935; evaluation spec 2908; status payload 3106-3135),
  `server/src/paper-v219.ts` (identity 64-66; adapter + coverage 104-148),
  `server/src/schema.ts` (paperSignals 953-959; paperModelComparisons 971).
- Sandbox: `~/workspace/goals/research-terminal/paper-signals/orchestrator/src/issuance/handler.ts`
  (pipeline doc 1-140; regime 601-622; findDuplicate 628-640; waiting-interval 1873-1901;
  dup re-check 1909-1925; gates 2085-2122), `veto/src/waiting-interval.ts`
  (`checkWaitingInterval` 151-228; `runQualificationChecks` 262-292; `checkSetupHistory` 76-113),
  `veto/src/veto.ts` (`checkSetupInvalidation` 132-235; `checkOutcomes` 348),
  `orchestrator/src/types.ts:226` (24h window), `entry-v1/src/{contract.ts:333,entry-rules.ts:447}`,
  `handoff/src/qualify.ts` (cron-lane driver).
- Prior findings: `strategy-inventory/CRYPTO-INVENTORY-2026-10-14.md` (§5a, §5d, §9),
  `paper-signals/DEPLOYED-REPAIR-VERIFICATION-2026-10-14.md` (§3a hash list, §3d),
  `paper-signals/comparison/CANDIDATE-ROUTING-2026-10-14.md` (run-7 routing).
