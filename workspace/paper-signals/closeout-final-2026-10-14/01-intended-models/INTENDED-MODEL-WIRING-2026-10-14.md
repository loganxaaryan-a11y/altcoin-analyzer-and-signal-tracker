# Intended-model trial wiring — 2026-10-14

**Scope:** paper signals only. No brokerage. No model tuning, no production
inversion, no model replacement. The 8 discovery candidates remain their own
population (untouched); the deployed 7-factor pilot model was NOT substituted
into the frozen trial.

## What was connected

The frozen trial's ACTUAL named model functions, wired as faithful Python ports
in `comparison/intended_models.py` (TS Math.round half-up semantics; docstrings
cite exact source lines):

**Crypto production — `crypto-dossier-factor-agreement` 2.0.0-measurement-contract**
(parameter hash `sha256:4a098b4d389cb85293c78785c82e88a32fe6d96544a8dd84c341dce9fa0b7220`)
- `score_dossier_factors` ← `scoreDossierFactors` (`hidden_files/source-export-2026-10-13/crypto/server/src/signal-methodology.ts:47`) — 11 factors, 17.0 weight, 50+(net/17)×42 clamp 5..95
- `build_atr_levels` ← `buildAtrLevels` (same file:56) — 1.25×ATR, t1=1.5R, t2=2.5R
- `canonical_wilder_atr` ← `canonicalWilderAtr` (same file)

**Crypto challenger C-2 — `crypto-dossier-minus-momentum` 0.1.0-shadow**
- `c2_score_minus_momentum` — Momentum contribution AND weight 1.5 leave the formula; denominator 15.5; weights NOT rescaled (frozen manifest definition)

**Equity — `equity-factor-agreement` 3.1.0-measurement-closure**
(parameter hash `atr2-target1.5R-weights-6-8-8-20-8-20-20`)
- `normalize_signal_factors` / `factor_score_breakdown` / `signal_decision` / `build_frozen_levels`
  ← `normalizeSignalFactors` / `factorScoreBreakdown` (`hidden_files/source-export-2026-10-13/equity/server/src/actions.ts:143, ~347`) /
  `signalDecision` / `buildFrozenLevels` — 7 votes, weights 6/8/8/20/8/20/20,
  raw=round(100·Σw·s/Σw), ±5 trend-cluster redundancy, long ≥20 / short ≤−20 / else mixed, 2.00×ATR levels

**Wiring proof (pinned, not asserted):** 19/19 tests in
`comparison/tests/test_intended_models.py` reproduce deployed-recorded decisions:
BTC id43 → 52 long (prod), HYPE id40 → 56 short (prod), ETH id42 → 52 long (prod) /
57 long (C-2, score diverges, direction agrees), META equity id52 → 73 long
(raw 78, −5 redundancy). The 156-test harness suite still passes unchanged.

## Decision-time input persistence

`comparison/decision_time_store.py::persist_decision_time_inputs` writes one
bundle per opportunity to `comparison/decision-time-inputs/<opportunity_id>.json`:
every factor with its own asOf, entry/ATR/entry-evidence, provider metadata,
issuance key, provenance. **Never-backfill rule enforced:** the 3 no_data factors
(Binance futures positioning, Cross-venue taker imbalance, Revenue linkage) are
stored as `status: UNKNOWN` with the reason recorded — their consumed weight/score
are the decision-time fact, but the missing temporal anchor is never reconstructed.

## Demonstrated opportunity (natural, end to end)

**Opportunity ID:** `dossier-btc-id43-2026-10-14`
— BTC long issued 2026-10-14T13:00:21.555Z through the real dossier issuance path
by the actual 2.0.0 engine (issuance_key pins strategy id/version/hash).
Complete decision-time inputs persisted from the canonical input snapshot
`crypto-input-snapshot-v3-canonical-atr-window` (id 3775786275845128;
pipeline's own `replayAtIssuance`: reconstructed, 0 mismatches).

| Arm | Score | Direction | Disposition |
|---|---|---|---|
| Production (`crypto-dossier-factor-agreement` 2.0.0) | 52 (short 48) | long | **scored** — reproduces the recorded issuance exactly (52, long, levels to full float precision) |
| C-2 (`crypto-dossier-minus-momentum` 0.1.0-shadow) | 52 (short 48) | long | **scored, non-flipped** — C-2 levels recomputed exactly from its own entry inputs (verified-shared per RULE 5) |
| Paper-pipeline operational (both arms) | — | — | **UNKNOWN** — no entry-observation evidence under the frozen paper entry convention (Binance venue print / 15-min window / coverage attestation) exists for this dossier-path opportunity; RULE 6 — missing C-2 evidence is UNKNOWN, never filled from production |

Evidence: `comparison/wired-trial-evidence/dossier-btc-id43-2026-10-14.json`.
No comparison row was appended to any vessel — this is model-evaluation
evidence from the wired intended models, not a prospective trial row.

## Files

- `comparison/intended_models.py` — wired model functions
- `comparison/decision_time_store.py` — decision-time input store (+ `ledger_completeness` RULE 3 check)
- `comparison/evaluate_intended_opportunity.py` — demo runner (extract → persist → score both arms → evidence)
- `comparison/tests/test_intended_models.py` — 19 pinned tests (all pass)
- `comparison/decision-time-inputs/dossier-btc-id43-2026-10-14.json` — persisted decision-time inputs
- `comparison/wired-trial-evidence/dossier-btc-id43-2026-10-14.json` — both arms' scores/dispositions
- `comparison/INTENDED-MODEL-WIRING-2026-10-14.md` — this write-up

## Explicitly NOT touched

Deployed pilot (artifact actions), all frozen manifests
(`freeze-manifest-v2.1.x.json`), the 8 stored discovery-candidate rows
(`paper_model_comparisons` table + replay evidence), the prospective vessel,
the quarantined v1 rows. Future fresh opportunities can now flow through
`evaluate_intended_opportunity.py`'s pattern into the prospective vessel when
the parent authorizes collection.
