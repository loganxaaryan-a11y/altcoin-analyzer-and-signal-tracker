# Phase 2A crypto validation report

Generated: 2026-10-11T04:55:37.014Z
Spec hash: `90ba804cd8816517244a805086599c3f6c7a6a1a82372e234ba62804e1edfdd6`
Dataset manifest hash: `7342ff4d7c9d4330660290c1cdc23debaefb9e1ca6308b9042d70f935446846a`
Rows: 18,223 across 9 instruments

This is a survivor-sample exploratory OHLCV experiment. It is not a replay of the live dossier model, not a portfolio backtest, and not proof that shorts were executable.

| Hypothesis | Horizon | Issued | Assets | Hit rate | Mean gross | Mean net (18 bps) | Mean net (36 bps) | Difference vs best full-schedule directional baseline | Difference vs best matched baseline | Selection |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| trend_continuation | 5d | 4045 | 9 | 49.764% | 0.704% | 0.524% | 0.344% | -1.016% | -1.520% | not selected |
| trend_continuation | 30d | 3525 | 9 | 47.985% | 2.214% | 2.034% | 1.854% | -9.197% | -10.164% | not selected |
| breakout_volume | 5d | 319 | 9 | 57.053% | 3.563% | 3.383% | 3.203% | 1.843% | -0.368% | not selected |
| breakout_volume | 30d | 273 | 9 | 61.538% | 18.871% | 18.691% | 18.511% | 7.460% | -3.544% | not selected |

## Holdout

Locked: yes. 2025-01-01 through 2026-09-30. Feature-eligible rows counted without opening labels: 0. Performance opened: no.

## Selection decisions

- 5d: no qualified candidate. No candidate cleared the predeclared sample, positive net-return, and block-bootstrap baseline-difference checks.
- 30d: no qualified candidate. No candidate cleared the predeclared sample, positive net-return, and block-bootstrap baseline-difference checks.

## Limitations

- This is a new OHLCV-only strategy experiment, not a historical replay of the live dossier model.
- The fixed universe is a current-survivor sample; delisted assets and historical whole-market membership are unavailable from this source path.
- Short returns are directional hypotheticals. Borrow, funding, locate availability and execution feasibility are unsupported and not included.
- Signals overlap across assets and dates. Event returns are not summed or annualized as a portfolio.
- The engine rejects holdout-dated input before feature, label, or report generation; this result contains no holdout labels or performance.
