# Capture correction — 2026-10-15

**Scope:** paper only. No brokerage. No model tuning, no gate changes, frozen
trial v2.1.5 untouched. The persisted decision-time inputs and arm results
were not re-scored; this is a label correction plus collector hardening.

## What was wrong

The 2026-10-14 automatic run of `dossier_model_collector.py` captured dossier
signals 31–42 through `capture_new_dossier_evaluations()` with
`evidence_class` defaulted to **FRESH** for every issuance. That conflated
**capture time** (when the collector ran) with **decision time** (when the
model decided). All 12 issuances have `decision_at` between 2026-10-10 and
2026-10-14T13:00:10Z — every one **before** the frozen dossier-cohort-v1
prospective cutoff **2026-10-14T18:35:00Z**
(`dossier-cohort-v1/COLLECTION-CONFIG-v1.md` §1). They are historical
reproduction, not fresh prospective evidence.

## The fix (in `comparison/dossier_model_collector.py`)

1. **Explicit `captured_at` vs `decision_at`.** Every bundle and evidence file
   now carries `captured_at` (the collector's capture instant, stamped in
   `capture_dossier_evaluation`) distinct from `decision_at` (the model's
   decision instant from the decision-time inputs).
2. **Frozen cutoff applied by the collector.** New
   `classify_evidence_class(decision_at)`: decision_at at/after
   `2026-10-14T18:35:00Z` → FRESH; before, missing, or unparseable →
   REPLAY/REPRODUCTION (historical reproduction). `capture_dossier_evaluation`
   auto-classifies when the caller passes no explicit class; the automatic
   scan (`capture_new_dossier_evaluations`) classifies each issuance from
   its own decision_at — it never defaults to FRESH. An explicit class
   (e.g. the id43 replay) is still honored.
3. **Frozen eligibility gate before admission.** New
   `check_frozen_eligibility()`: issuance key binds a frozen intended model,
   decision_at at/after cutoff, v3 snapshot linked, frozen factor ledger
   complete per RULE 3. Incompatible opportunities stay in a separate labeled
   cohort (`incompatible:<reason>`) — never forced in. Results and evidence
   carry the `eligibility` record.
4. **Deployed 7-factor result in a separately labeled field.** New
   `find_deployed_seven_factor_match()` looks up the deployed paper pilot's
   7-factor candidate (coin_id + direction + ±30 min decision window) across
   the `live-paper-status-*.json` exports. It lands only in evidence field
   `deployed_seven_factor`, labeled as NOT the frozen trial — never
   substituted into the production/C-2 arms (population boundary rule 2).

## Re-labeling of signals 31–42

All 12 ids (31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42) re-labeled in
place, input bundle + evidence file each (24 files):
`evidence_class` FRESH → REPLAY/REPRODUCTION; `captured_at` added (from the
file's recorded `persisted_at`/`evaluated_at`); `capture_correction_note`
added; input bundles also gained `freshness_classification`; evidence files
gained `eligibility: {cohort: "historical-reproduction"}` and a `replay_note`.
The persisted decision-time inputs (factors, ATR bars, entry evidence) and the
arm scores were byte-identical apart from the label/note/captured_at fields —
verified by before/after sha256 (log below). No file was re-scored.

BTC id43's accepted demo files (`decision-time-inputs/dossier-btc-id43-2026-10-14.json`
and its evidence) were NOT touched: they carry no evidence_class (pre-dating
the classification scheme) and are the accepted demo, not part of this
correction. The id43 REPLAY/REPRODUCTION replay in
`intended-models-genuine-inputs/` was already correctly labeled.

### Post-correction verification record

`comparison/capture-correction-hashes-2026-10-15.json` carries the
programmatically verified after-state of all 24 files (sha256,
evidence_class, decision_at, captured_at, correction-note presence).
Verified: all 24 are REPLAY/REPRODUCTION; all 12 bundle decision_at values
predate the 2026-10-14T18:35:00Z cutoff; every file carries
`capture_correction_note` and a `captured_at` distinct from `decision_at`;
all 12 evidence files still carry scored prod + C-2 arm results (no
re-scoring, no data edits). The relabel script asserted each file was FRESH
before rewriting (it raised on anything else) -- the pre-correction
mislabeling is established by that gate, and the before-state digests were
logged in the relabel run output.

## Automatic-capture proof (genuinely new recommendation)

No genuinely new dossier recommendation exists: the workspace DB copy's max
signal id is 43 (2026-10-14T13:00:21Z, pre-cutoff); the automatic scan finds
0 new issuances (honest zero, verified via both
`dossier_model_collector.py --scan` and
`collect_pilot_rows.py --dossier-capture`).

The path is wired and proven by a **synthetic-but-labeled validation run**
through the real code path (`capture_dossier_evaluation`, every synthetic
field labeled `SYNTHETIC-VALIDATION`, scratch dirs only, no vessel writes,
scratch cleaned up): post-cutoff decision_at auto-classified FRESH,
captured_at stamped distinct from decision_at, prod 69/long + C-2 67/long
scored in shadow, eligibility `fresh-eligible`, deployed-7-factor field
present-but-unmatched (no deployed candidate within ±30 min — recorded
honestly). The same coverage is pinned in the test suite:
TestCutoffClassification, TestCaptureDecisionSeparation,
TestFrozenEligibility, TestDeployedSevenFactorField — 178/178 pass.

**Exact trigger condition for the first genuine FRESH capture:** a new
`generated_signals` row appears in the workspace DB copy with
`issuance_key LIKE '%crypto-dossier-factor-agreement|2.0.0-measurement-contract%'`
(or the equity 3.1.0 key), `rawDecisionInputs.decisionAt` ≥
2026-10-14T18:35:00Z, a linkable v3 canonical snapshot (same `asset_id`,
`captured_at` ≤ `created_at`), and no existing input bundle for its
opportunity_id. Then `collect_pilot_rows.py --dossier-capture` (or
`dossier_model_collector.py --scan`) captures it automatically — inputs
persisted verbatim (missing → UNKNOWN), prod 11-factor + C-2 10-factor
scored in shadow, deployed 7-factor result in the separately labeled field —
idempotently, with no vessel writes.

## Files changed/added (this stream)

- `comparison/dossier_model_collector.py` — cutoff classification,
  captured_at/decision_at separation, eligibility gate, deployed-7-factor
  field (not a manifest-pinned executable; frozen trial untouched)
- `comparison/tests/test_dossier_model_collector.py` — 16 new tests
  (cutoff, separation, eligibility, 7-factor field)
- `comparison/tests/run_all.sh` — NEW: suite runner with `set -o pipefail`
- `comparison/CAPTURE-CORRECTION-2026-10-15.md` — this record
- `comparison/INTENDED-MODEL-ELIGIBILITY-2026-10-15.md` — eligibility accounting
- 24 evidence JSONs re-labeled (31–42, input + evidence)
