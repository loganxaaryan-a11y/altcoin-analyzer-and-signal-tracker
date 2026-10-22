# Live adapter field-coverage table (ITEM 1, 2026-10-14)

Adapter: `comparison/live_paper_stream.py` (ACTIVE_FREEZE_VERSION 2.1.4,
matching `comparison/ACTIVE_MANIFEST` -> `freeze-manifest-v2.1.4.json`).
Collector row path: `collect_pilot_rows.score_candidates` ->
`harness.score_pair` -> `collect_pilot_rows.stamp_trace` (+
`fold_full_record`, which folds the five nested blocks into the row's
`notes` as a `full_record=` JSON payload — no vessel schema change, the
frozen 69 columns are untouched).

Source audited: `orchestrator/src/issuance/handler.ts` (the repaired
issuance path), `entry-v1/src/contract.ts`, `entry-v1/src/pending.ts`,
`veto/src/waiting-interval.ts`, `entry-v1/src/levels.ts`,
`orchestrator/src/issuance/veto-input.ts`, `orchestrator/src/types.ts`.

Key conventions:
- Deployed status rows are read with camelCase (handler-persisted) +
  snake_case (serializer alias) tolerance. Absent -> None, never fabricated.
- `notes` = the row's `notes` column via the `full_record=` JSON payload.
- Derivations are labeled `derived:` with the rule they come from.
- Fields the handler does not persist per issuance are marked
  **unavailable in deployed response** (never silently dropped).

## 1. contract — the frozen ActionableEntryContract (contract.ts)

Sourced from the persisted contract JSON (`contract` block or
`contractJson`/`contract_json` string). Fallback tier (narrow, semantic):
`decision_at`, `invalidation_price`, `target1_price`, `target2_price` may
come from same-named row-level fields (identical decision-time meaning).
Entry/observation fields have NO row fallback — a proposed entry is not an
observed fill.

| handler field | adapter key | collector row column |
|---|---|---|
| contractVersion | contract.contract_version | notes |
| terminal | contract.terminal | notes |
| signalId | contract.signal_id | notes |
| strategyId | contract.strategy_id | notes |
| strategyVersion | contract.strategy_version | notes |
| parameterHash | contract.parameter_hash | notes |
| decisionAt | contract.decision_at | notes (+ row `decision_at` via candidate) |
| decisionClock | contract.decision_clock | notes |
| decisionPrice | contract.decision_price | notes |
| sourceObservedAt | contract.source_observed_at | notes |
| sourceObservationWindow | contract.source_observation_window | notes |
| observationDegraded | contract.observation_degraded | notes |
| entryRule | contract.entry_rule | notes |
| entryVenue | contract.entry_venue | notes |
| entryWindowOpensAt | contract.entry_window_opens_at | notes |
| entryWindowExpiresAt | contract.entry_window_expires_at | notes |
| entryPrice | contract.entry_price | notes |
| entryObservedAt | contract.entry_observed_at | notes (+ trace -> row `entry_observed_at`) |
| entryReceivedAt | contract.entry_received_at | notes |
| entryEvidence | contract.entry_evidence | notes |
| entryEvidenceReason | contract.entry_evidence_reason | notes |
| driftCapPct | contract.drift_cap_pct | notes |
| driftObservedPct | contract.drift_observed_pct | notes |
| entryState | contract.entry_state | notes |
| voidReason | contract.void_reason | notes |
| invalidationPrice | contract.invalidation_price | notes |
| target1Price | contract.target1_price | notes |
| target2Price | contract.target2_price | notes |
| riskPerUnit | contract.risk_per_unit | notes |
| horizonUnit | contract.horizon_unit | notes |
| primaryHorizon | contract.primary_horizon | notes |
| evaluatorCompatibility | contract.evaluator_compatibility | notes |
| supersedes | contract.supersedes | notes |
| issuedBy | contract.issued_by | notes |
| issuedAt | contract.issued_at | notes |
| cohortId | contract.cohort_id | notes |

## 2. entry_observation — EntryObservationEvent (pending.ts)

Strict: read only from the contract JSON. The handler persists the event's
id in `outcome.detail.entryEventId`; the full event has no persisted row.

| handler field | adapter key | collector row column |
|---|---|---|
| outcome.detail.entryEventId | entry_observation.event_id | notes |
| contract.entryPrice | entry_observation.entry_price | notes |
| contract.entryObservedAt (venue observation time) | entry_observation.entry_observed_at | notes |
| contract.entryReceivedAt (server receipt time) | entry_observation.entry_received_at | notes |
| eventRecordedAt | entry_observation.entry_recorded_at | **unavailable in deployed response** (pending.ts eventRecordedAt has no persisted row) |
| contract.entryVenue | entry_observation.venue_label | notes |
| receipt - observation (computed) | entry_observation.observation_age_ms | notes (computed from the two persisted timestamps, not stored) |
| maxObservationAgeMs | entry_observation.max_observation_age_ms | **unavailable in deployed response** (handler constant, entry-rules.ts `DEFAULT_UNGROUNDED_PARAMS.maxObservationAgeMs = 300000`, not per-issuance data) |
| contract.entryEvidence / entryEvidenceReason | entry_observation.entry_evidence / entry_observation.entry_evidence_reason | notes |
| contract.entryState / voidReason | entry_observation.entry_state / void_reason | notes |

## 3. frozen_levels — decision-time levels (levels.ts)

| handler field | adapter key | collector row column |
|---|---|---|
| contract.invalidationPrice | frozen_levels.invalidation_price | notes |
| contract.target1Price | frozen_levels.target1_price | notes |
| contract.target2Price | frozen_levels.target2_price | notes |
| contract.riskPerUnit | frozen_levels.risk_per_unit | notes |
| contract.decisionPrice (level basis) | frozen_levels.basis_price | notes |
| ATR-14 | frozen_levels.atr14 | **unavailable in deployed response** (not produced by the handler's contract path; carried only when the deployed signal row itself includes the legacy `atr14` field) |
| level-freeze policy | frozen_levels.level_freeze_policy | derived: `"freeze-at-decision"` when `contractVersion == "actionable-entry-v1"` (the documented v1 rule, entry-v1/levels.ts); None when the contract block is absent |
| contract.decisionAt | frozen_levels.frozen_at | notes |

## 4. gate_inputs — the gates the handler evaluated

| handler field | adapter key | collector row column |
|---|---|---|
| FreshInputs.asOf | gate_inputs.freshness.inputs_as_of | notes (from persisted candidate `inputs` when the deployed serializer includes them) |
| freshness window | gate_inputs.freshness.freshness_window_ms | **unavailable in deployed response** (handler constant `DEFAULT_CONFIG.freshnessMs = 1,800,000`, not per-issuance data) |
| freshness outcome | gate_inputs.freshness.verdict | derived: `"stale-inputs"` if `outcome.gate == "stale-inputs"`, `"passed"` if issued, else None |
| regime-gate inputs (currentPrice, historyCloses, historyHighs, signalDay, rawBars) | gate_inputs.regime_gate.inputs.* | notes (from persisted candidate `inputs`) |
| retained regime gate (shorts only) | gate_inputs.regime_gate.gate / .result | derived gate name (`"short-regime"` iff direction == short); result derived from outcome |
| entry-zone inputs (veto-input.ts) | gate_inputs.entry_zone.{direction, proposed_entry, reference_entry, entry_at} | notes; proposed_entry = `inputs.currentPrice ?? entryPrice` |
| drift limit | gate_inputs.entry_zone.drift_limit_bps | derived from terminal via the documented veto-input.ts rule (150 crypto / 50 equity) |
| veto expiry | gate_inputs.entry_zone.expires_at | None — no expiry is configured at the veto stage (veto-input.ts); the contract's entry window governs expiry |
| qualification summary | gate_inputs.veto.summary | notes (persisted `outcome.detail.vetoSummary`) |
| per-check results | gate_inputs.veto.checks | notes (persisted `outcome.detail.checks` on the reject path; **unavailable in deployed response** on the issued path — the handler keeps only the summary string) |
| pre-decision instant | gate_inputs.veto.pre_decision_at | notes (recorded `detectedAt`) |
| finest granularity | gate_inputs.veto.finest_granularity | derived from terminal (intraday crypto / session equity, veto-input.ts) |
| veto evidence bars | gate_inputs.veto.bars | notes (from `inputs.vetoBars` when present) |
| pipeline-order guard stops | gate_inputs.veto.pipeline_stops.{draft_stop, published_stop} | derived: draft == published == candidate invalidation on the integrated path (veto-input.ts) |
| duplicate pre-check | gate_inputs.duplicate_check.winning_signal_id | notes (persisted only on the duplicate path) |
| post-entry assessment | gate_inputs.post_entry.{verdict, entry_valid, intervening_invalidation, reason} | notes (persisted `outcome.detail.postEntryInvalidation` / `postEntryReason`, or the `postEntry` detail block) |

## 5. waiting_interval_evidence — the genuine decision->entry veto (waiting-interval.ts)

| handler field | adapter key | collector row column |
|---|---|---|
| [contract.decisionAt, entryObservedAt] | waiting_interval_evidence.interval | notes |
| direction | waiting_interval_evidence.direction | notes |
| contract.invalidationPrice (final published stop) | waiting_interval_evidence.final_stop | notes |
| detectedAt (pre-decision cutoff) | waiting_interval_evidence.pre_decision_at | notes |
| finest granularity | waiting_interval_evidence.finest_granularity | derived from terminal |
| allowEmptyInterval | waiting_interval_evidence.allow_empty_interval | derived from terminal (True for equity: the overnight gap has no bars by construction) |
| waiting-interval bars | waiting_interval_evidence.bars | **unavailable in deployed response** (not persisted per issuance) |
| per-bar verdicts | waiting_interval_evidence.per_bar_verdicts | **unavailable in deployed response** (the handler persists only the two check-level results) |
| checks (setup_history + setup_invalidation, separate entries) | waiting_interval_evidence.checks | notes (persisted `outcome.detail.waitingInterval.checks` on the invalidated path; None on the issued path) |
| final verdict | waiting_interval_evidence.final_verdict | persisted on the invalidated path; derived `"pass"` for issued rows (handler.ts step 9b fails closed on any non-pass verdict, so issuance implies pass) |
| reason | waiting_interval_evidence.reason | notes (persisted on the invalidated path) |

## 6. alert join (new in this revision)

The deployed status response carries `data.alerts[]`; the adapter now
joins setup/entry alert rows by deterministic id (`setup_<candidateId>` /
`entry_<signalId>`) with a kind fallback.

| deployed alert field | adapter key | collector row column |
|---|---|---|
| setup alert row | trace.setup_alert (nested block) | notes (inside trace; only the four flat trace columns reach row columns) |
| entry alert row | trace.entry_alert (nested block) | notes |
| entryAlert.enqueuedAt (fallback: signal row) | trace.alert_enqueued_at | row `alert_enqueued_at` |
| entryAlert.deliveredAt (fallback: signal row) | trace.alert_delivered_at | row `alert_delivered_at` |
| deliveryStatus / deliveryMode / ackId | trace.alert_delivery_status / alert_delivery_mode / alert_ack_id | notes (not vessel columns) |

## Regression

`comparison/tests/test_live_adapter_full.py` — synthetic deployed status
payload (one ISSUED + one SUPPRESSED record, both labeled synthetic, in
/tmp only): export -> ingest -> `score_candidates` (the collector's
row-building path), asserting every audited field above survives intact
into the prospective row dicts. The real prospective vessel is asserted
byte-identical before/after. Registered in `tests/run_tests.py`.
