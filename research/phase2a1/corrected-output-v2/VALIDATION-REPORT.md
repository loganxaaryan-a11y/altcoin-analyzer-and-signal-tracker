# Phase 2A crypto validation report

Generated: 2026-10-09T20:10:36.645Z
Spec hash: `90ba804cd8816517244a805086599c3f6c7a6a1a82372e234ba62804e1edfdd6`
Dataset manifest hash: `cb446bbb3363adec4f20bbdcdbab971f6424afe981a381251eb8a907c35146ef`
Rows: 1,940 across 2 instruments

This is a survivor-sample exploratory OHLCV experiment. It is not a replay of the live dossier model, not a portfolio backtest, and not proof that shorts were executable.

| Hypothesis | Horizon | Issued | Assets | Hit rate | Mean gross | Mean net (18 bps) | Mean net (36 bps) | Difference vs best full-schedule directional baseline | Difference vs best matched baseline | Selection |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| trend_continuation | 5d | 1266 | 2 | 94.471% | 0.306% | 0.126% | -0.054% | 0.043% | 0.000% | not selected |
| trend_continuation | 30d | 1118 | 2 | 93.560% | 2.176% | 1.996% | 1.816% | 0.361% | 0.000% | not selected |
| breakout_volume | 5d | 20 | 2 | 70.000% | 0.234% | 0.054% | -0.126% | -0.029% | 0.000% | not selected |
| breakout_volume | 30d | 16 | 2 | 75.000% | 1.524% | 1.344% | 1.164% | -0.291% | 0.000% | not selected |

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
