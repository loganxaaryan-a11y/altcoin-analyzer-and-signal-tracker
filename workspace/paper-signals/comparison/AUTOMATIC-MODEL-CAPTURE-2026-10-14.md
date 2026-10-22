# Automatic model capture — intended dossier models wired into the collector (2026-10-14)

**Scope:** paper only, no brokerage, no execution. No model tuning, no model
replacement, no production inversion. Accepted work untouched (the demo
`evaluate_intended_opportunity.py` and its artifacts in
`decision-time-inputs/` / `wired-trial-evidence/` for id43 are not edited).

## What was wired

The intended dossier models are now wired into the EXISTING collector
(`collect_pilot_rows.py --dossier-capture`):

- **crypto production:** `crypto-dossier-factor-agreement`
  2.0.0-measurement-contract (`intended_models.score_dossier_factors` ←
  `signal-methodology.ts:47 scoreDossierFactors`)
- **crypto challenger C-2:** `crypto-dossier-minus-momentum` 0.1.0-shadow
  (`intended_models.c2_score_minus_momentum`; Momentum contribution AND
  weight 1.5 leave the formula, denominator 15.5, not rescaled)
- **equity production:** `equity-factor-agreement` 3.1.0-measurement-closure
  (`intended_models.factor_score_breakdown` + `signal_decision` ←
  `actions.ts`); C-2 not-applicable (no frozen equity challenger — recorded
  as such, never invented)

New code: `comparison/dossier_model_collector.py`. One function is the
entire write path — `capture_dossier_evaluation()`:

1. persists the complete decision-time inputs **verbatim, as received**
   (the snapshot's `rawDecisionInputs`: decisionAt, entryPrice,
   riskMultiplier, the 11 minimal factor records, the full ATR bar window;
   plus enriched factor annotations, entry evidence, candle, decision
   reference, provider metadata, provenance) via
   `decision_time_store.persist_decision_time_inputs` — missing inputs land
   **UNKNOWN**, never reconstructed afterward;
2. scores the production arm through `intended_models`;
3. scores the C-2 arm through `intended_models` (crypto only);
4. writes both arm results to one evidence file.

Automatically, in one call, no manual steps between. Idempotent: an
already-captured opportunity is skipped (the store never overwrites a
persisted bundle). Nothing is appended to any vessel — dossier captures are
model-evaluation evidence, not prospective trial rows. Default collector
behavior, quarantine guards, and vessel targets are unchanged.

Automatic scan: `capture_new_dossier_evaluations()` finds every
2.0.0-measurement-contract dossier-path issuance
(`issuance_key LIKE '%crypto-dossier-factor-agreement|2.0.0-measurement-contract%'`)
without a persisted bundle and captures each, linking the signal to its
decision-time input snapshot by `coin_id = asset_id` + latest
`captured_at <= created_at` (v3 canonical window; verified 13/13 with
`replayAtIssuance: reconstructed, 0 mismatches`).

## End-to-end evidence (this run)

**Replay:** `dossier_model_collector.py --replay-id43` captured the BTC id43
REPLAY/REPRODUCTION in one automatic run:
- `comparison/intended-models-genuine-inputs/btc-id43-genuine-inputs.json`
  — the genuine decision-time INPUT snapshot (104 KB: verbatim 720-bar ATR
  window, 11 minimal model-consumed factors, enriched annotations with
  3 no_data factors → UNKNOWN, entry evidence, timestamps, provenance).
  Fixes the known defect: the closeout package's
  `01-intended-models/decision-time-inputs-dossier-btc-id43-2026-10-14.json`
  duplicated the arm-results (output) JSON byte-for-byte.
- `comparison/intended-models-genuine-inputs/btc-id43-replay-evidence.json`
  — prod 52/long scored, C-2 52/long scored non-flipped; recorded fidelity
  all-true (confidence, direction, levels to full float precision);
  operational dispositions UNKNOWN per RULE 6. Labeled
  `evidence_class: "REPLAY/REPRODUCTION"` — this morning's dossier issuance
  (2026-10-14T13:00:21.555Z) reproduced through the intended models, NOT a
  fresh evaluation.

**Fresh automatic capture:** `collect_pilot_rows.py --dossier-capture`
captured 12 new dossier-path issuances (signals 31–42), each inputs +
both arms in one write path:
`comparison/decision-time-inputs/dossier-*.json` +
`comparison/wired-trial-evidence/dossier-*.json`, all `evidence_class:
FRESH`. Every recomputed direction-side score matches the recorded
confidence, directions match, levels reproduce exactly (12/12). BTC id43
was correctly skipped by the fresh scan (already captured by the accepted
demo); its replay lives only in the replay-labeled files above.

Note: two shorts (HYPE id33/id40) initially showed a false fidelity
mismatch — the recorded-confidence check compared `longScore` against a
short's recorded confidence. Fixed in the collector: the check now compares
the direction-side score (matches the pinned tests: id40 → long 44 / short
56; C-2 → long 48 / short 52, non-flipped). The accepted id43 demo file
(long case, already correct) was not touched.

## Replay/reproduction labeling

BTC id43 is labeled REPLAY/REPRODUCTION in: the collector module docstring
and `capture_id43_replay()`; the `evidence_class` + `replay_note` fields in
both replay files; the defect note in the genuine-inputs file; the
population-boundary doc; this doc. No new-capture artifact presents id43 as
a fresh evaluation.

## Equity

The equity arm is wired (`score_equity_arms`, tested), but no equity
dossier-path evaluation was captured in this run: the equity workspace DB
copy holds zero `signal_input_snapshots` rows. The branch is ready for the
first equity dossier-path issuance.

## Population boundary

The 8 discovery-run-60 rows (`rows/cohort-prospective-v2.csv`,
deployed paper-pilot stream, deployed 7-factor model) are a SEPARATE
population — see
`comparison/POPULATION-BOUNDARY-DISCOVERY-RUN60-2026-10-14.md`. They were
not re-scored, and no dossier capture was appended to any vessel.

## Tests

`comparison/tests/test_dossier_model_collector.py` — 6 tests: single write
path (inputs + both arms, pinned id40 math), no vessel writes,
missing→UNKNOWN never reconstructed, idempotency (never overwrites),
replay labeling, equity prod/C-2-n/a. Full suite: 162/162 pass
(`tests/run_tests.py`).

## Files

- `comparison/dossier_model_collector.py` — the wired automatic collector
- `comparison/tests/test_dossier_model_collector.py` — 6 new tests
- `comparison/tests/run_tests.py` — registers the new tests
- `comparison/collect_pilot_rows.py` — `--dossier-capture` flag (additive;
  default behavior unchanged)
- `comparison/decision_time_store.py` — `path_override` kwarg on
  `persist_decision_time_inputs` (backward compatible)
- `comparison/intended-models-genuine-inputs/btc-id43-genuine-inputs.json`
- `comparison/intended-models-genuine-inputs/btc-id43-replay-evidence.json`
- `comparison/decision-time-inputs/dossier-{…}-id{31..42}-*.json` (12 fresh input bundles)
- `comparison/wired-trial-evidence/dossier-{…}-id{31..42}-*.json` (12 fresh arm-results)
- `comparison/POPULATION-BOUNDARY-DISCOVERY-RUN60-2026-10-14.md`
- `comparison/AUTOMATIC-MODEL-CAPTURE-2026-10-14.md` (this file)
