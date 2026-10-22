# Population boundary — discovery run 60 (2026-10-14)

**Status:** frozen boundary. The 8 discovery rows are a SEPARATE population
from the intended-dossier-model captures. Never pooled.

## Population A — deployed paper-pilot stream (discovery run 60)

- **What:** the 8 candidates from the deployed paper pilot's discovery run 60
  (`decisionAt` 2026-10-14T20:26:29.411Z, handoff run 2, handler v2.1.9),
  collected 2026-10-14T23:40Z via `live_paper_stream.py` +
  `collect_pilot_rows.py` into `rows/cohort-prospective-v2.csv`
  (`live-paper-cand-1` … `live-paper-cand-8`, `row_origin=pilot`,
  `freeze_version=2.1.5`).
- **Model:** the DEPLOYED pilot runs its own 7-factor model. The frozen
  trial's intended models are the 11-factor
  `crypto-dossier-factor-agreement` 2.0.0 (production) and the 10-factor
  `crypto-dossier-minus-momentum` 0.1.0-shadow (C-2). Deployed 7-factor ≠
  frozen 11/10-factor (closeout blocker #3 — the expert loop's call).
- **Arm state:** both arms `unscored:no-factor-ledger` — the live adapter
  does not yet fold the deployed `factorLedgerJson` into the collector
  candidate dict (documented gap, collection-run-log run 5), so the harness
  cannot score either arm. Missing evidence → unscored, never guessed.

## Population B — intended-dossier-model captures (automatic dual-arm capture)

- **What:** dossier-path issuances (`getCryptoAnalysis →
  issueGeneratedSignalCandidate`) scored through the wired intended models
  (`comparison/intended_models.py`) by
  `comparison/dossier_model_collector.py`'s single write path.
- **Writes:** `comparison/decision-time-inputs/<opportunity_id>.json`
  (complete decision-time inputs, verbatim; missing → UNKNOWN) and
  `comparison/wired-trial-evidence/<opportunity_id>.json` (production arm +
  C-2 arm results). The BTC id43 replay lives in
  `comparison/intended-models-genuine-inputs/` (see below).
- **Never appended to any vessel.** Dossier captures are model-evaluation
  evidence, not prospective trial rows.

## The id43 replay

BTC id43 (issued 2026-10-14T13:00:21.555Z) is this morning's dossier
issuance reproduced through the intended models — **NOT a fresh
evaluation**. Every artifact for it in the new capture work carries
`evidence_class: "REPLAY/REPRODUCTION"`:
`comparison/intended-models-genuine-inputs/btc-id43-genuine-inputs.json`
(the genuine decision-time input snapshot — fixes the defect where the
closeout package's input JSON duplicated the output evidence JSON) and
`btc-id43-replay-evidence.json` (both arm results).

## Boundary rules (frozen)

1. Never re-score Population A rows through `intended_models.py` to fill
   the vessel's arm columns.
2. Never substitute the deployed 7-factor model's scores/decisions into the
   frozen trial's production or C-2 arms.
3. Never append a dossier capture (Population B) to any vessel CSV.
4. Never pool legacy/reconstructed rows with prospective paper rows.
5. Replays are labeled REPLAY/REPRODUCTION; they are not fresh evaluations.
