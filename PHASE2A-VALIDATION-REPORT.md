# Phase 2A crypto validation report

**Run:** 2026-10-09  
**Cohort:** `phase2a-offline-crypto-direction-forecast`  
**Dataset manifest:** `e40894eb8a40e0622423f145939fe42f0338cbe9c86441357184a70866516bda`  
**Holdout:** locked; no performance opened

## Decision

**No qualified candidate at either horizon.** Both fixed hypotheses produced positive pooled modeled net returns in the 2023–2024 validation window, but neither cleared the preregistered block-bootstrap lower-bound test against the best directional baseline on the same emitted timestamps. The fold results were also unstable. Phase 2A does not justify promotion or opening the final holdout.

This is the valid negative selection outcome. It does not say the hypotheses never work; it says this experiment did not establish an incremental edge at the declared bar, cost, baseline, and uncertainty contract.

## Pooled validation

Central/stressed returns subtract frozen 18/36 bps round-trip cost assumptions from each event. They are event-level directional returns, not observed fills, a portfolio, or annualized performance.

| Hypothesis | Horizon | Issued | Assets | Decision dates | Hit rate¹ | Mean gross | Mean net, 18 bps | Mean net, 36 bps | Best matched directional baseline | Selection |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| Trend continuation | 5d | 4,045 | 9 | 711 | 49.63% | 0.681% | 0.501% | 0.321% | Always long exceeded candidate | Not qualified |
| Breakout + volume | 5d | 319 | 9 | 167 | 57.05% | 3.563% | 3.383% | 3.203% | Always long exceeded candidate | Not qualified |
| Trend continuation | 30d | 3,525 | 9 | 636 | 47.99% | 2.214% | 2.034% | 1.854% | Always long exceeded candidate | Not qualified |
| Breakout + volume | 30d | 273 | 9 | 144 | 61.54% | 18.871% | 18.691% | 18.511% | Always long exceeded candidate | Not qualified |

¹ Flat outcomes are shown separately in the machine-readable report and excluded from the non-flat hit-rate denominator.

Both strategies require direction to agree with SMA-200, so their SMA-200 matched-baseline return is mechanically identical on emitted timestamps. The stricter breakout/volume rules change *when* the strategy emits, not the direction once it emits. Always-long was the stronger matched directional baseline in this validation sample, and each candidate's point estimate remained below it.

The machine-readable report also includes always-long, always-short, and SMA-200 baselines over the full eligible schedule, separately from emitted-timestamp baselines. Cash remains an economic baseline rather than a directional classifier.

## Fold sensitivity

Mean 18-bps modeled net signed return by chronological fold:

| Hypothesis | Horizon | 2023 H1 | 2023 H2 | 2024 |
|---|---:|---:|---:|---:|
| Trend continuation | 5d | −1.435% | 2.061% | 0.565% |
| Breakout + volume | 5d | 0.165% | 4.868% | 3.680% |
| Trend continuation | 30d | −7.015% | 10.592% | 1.844% |
| Breakout + volume | 30d | −5.294% | 26.265% | 21.793% |

The sign changes in both 2023 H1 30-day series and the wide magnitude swings are direct evidence of regime sensitivity. The 30-day breakout sample has only 273 pooled issued events across 144 dates; overlapping calls are not independent confirmations.

## Coverage and denominators

- Full validation rows with sufficient feature context: 6,257 per strategy/horizon before abstention and boundary maturity.
- Trend continuation pooled abstentions: 2,143; breakout + volume pooled abstentions: 5,936.
- Pending due to fold-end horizon maturity: 69 (trend 5d), 589 (trend 30d), 2 (breakout 5d), 48 (breakout 30d).
- Unverified labels due to missing label-path bars: 0 in this run.
- Flat matured outcomes: 5 (trend 5d), 1 (trend 30d), 0 in both breakout cohorts.
- Every candidate report includes long/short counts, downside fifth percentile, dispersion, overlapping exposure count, fold-level exclusions, and deterministic block intervals.

## Uncertainty

The harness uses 500 deterministic moving-block resamples over UTC decision dates, 30-date blocks, seed `20261009`. Each sampled date carries its entire cross-asset panel. The candidate-minus-baseline interval preselects the best baseline by pooled matched-schedule mean, then resamples that fixed difference. It does not choose the winning baseline separately for each event or resample.

No exact effective sample size is claimed. Folds with fewer than two 30-date blocks withhold an interval. A favorable hit rate or mean alone is not an acceptance criterion.

## Economics and interpretation

- Costs are modeled assumptions, not observed fees or slippage.
- Short returns omit borrow, locate, and funding; execution feasibility is unknown.
- Signals overlap. Returns are not added into a portfolio and are not annualized.
- The current sample is a fixed current-survivor universe, not a historical whole-market selection model.
- Existing dossier factors are not reconstructed; Phase 2A is a distinct OHLCV strategy.
- No strategy, live weight, issued contract, prospective cohort, or legacy score changed.
