# Phase 2A crypto research specification — frozen

**Version:** `crypto-phase2a-ohlcv-research-v1`  
**Frozen before outcome evaluation:** 2026-10-09T16:35:00Z  
**Status:** frozen for offline validation; final holdout locked

## Research question

Do either of two fixed daily OHLCV hypotheses predict 5-elapsed-day or 30-elapsed-day crypto direction, and do their event-level signed returns remain useful after frozen modeled round-trip costs? A valid result may reject both hypotheses.

This is a new OHLCV-only experiment. It is not a reconstruction of the live dossier model, whose historically unavailable funding, open interest, news, fundamentals, social, and provider-gate inputs remain unsupported for backfill.

## Products

- Crypto 5 elapsed days, daily Binance spot OHLCV.
- Crypto 30 elapsed days, daily Binance spot OHLCV.
- Direction forecasts and fixed-horizon modeled returns only. Existing first-touch trade setups remain a separate product and are not used for candidate selection.

## Frozen survivor-sample universe

`BTCUSDT`, `ETHUSDT`, `SOLUSDT`, `LINKUSDT`, `DOGEUSDT`, `XRPUSDT`, `AVAXUSDT`, `ADAUSDT`, `SUIUSDT` on **Binance Spot**, quote currency **USDT**.

This is a current-survivor sample chosen before strategy outcomes. The source path does not supply historically point-in-time whole-market membership or reliable delisted-asset coverage. Results must be labeled exploratory and cannot establish runner recall or historical whole-market selection.

## Data contract

Each bar retains instrument, symbol, venue, quote currency, 24/7 UTC calendar, source, 1d interval, event/start time, end time, inferred availability time, retrieval time, adjustment basis, OHLC, and base-asset volume. Feature and label prices must come from the same Binance spot series; no CoinGecko aggregate or other venue may be spliced in.

Bars are coherent only when OHLC are positive, high/low bound open and close, volume is non-negative, interval length is exactly 24 hours, and availability is no earlier than bar end. Duplicates are reported and removed. Missing bars remain gaps; no flat bars or zero volume are synthesized. Every rolling feature and label window must be contiguous.

## Availability, decision, entry, and labels

A completed bar is inferred available five minutes after its interval end. This is a schedule assumption, not an observed historical provider receipt timestamp. The decision occurs at that availability time. Entry is the first later Binance daily open whose event time is not before the decision. Because the adjacent UTC open precedes the five-minute availability assumption, it is skipped rather than backdated.

For horizon H, exit is the terminal close after H complete 24-hour intervals beginning at the eligible entry open. Label availability is five minutes after that terminal bar end. At fold boundaries, an observation enters a validation report only when the actual label availability time is inside that fold. Forward bars are labels only and never enter feature, universe, or selection construction.

Returns use entry notional:

- long: `(exit - entry) / entry`
- short: `(entry - exit) / entry`
- zero is flat and excluded from the non-flat hit-rate denominator, while the flat count stays explicit.

## Frozen hypotheses

### A — trend continuation

- SMA length: 200 completed bars.
- Return lookback: 20 bars.
- Long when latest eligible close is strictly above SMA-200 and its 20-bar close return is strictly positive.
- Short when close is strictly below SMA-200 and 20-bar return is strictly negative.
- Equality, zero return, missing warm-up, or a gap causes abstention/exclusion as appropriate.

### B — breakout with volume confirmation

- Prior breakout window: 20 bars, excluding current bar.
- SMA length: 200 completed bars.
- Volume reference: median volume of the preceding 20 bars, excluding current bar.
- Volume multiple: at least 1.5× the reference median.
- Long when current close strictly exceeds prior maximum high, is above SMA-200, and volume passes.
- Short when current close is strictly below prior minimum low, is below SMA-200, and volume passes.
- Missing, invalid, or zero reference volume cannot pass.

Each hypothesis has exactly one parameter set shared by both horizons. No thresholds, weights, lookbacks, or ticker subsets may be tuned in Phase 2A. Every attempted configuration belongs in `trial-registry.json`.

## Dates and chronological validation

Feasible requested range: 2019-01-01 through 2026-09-30, limited by each instrument's actual listing and source coverage.

- Development context: before 2023-01-01. Fixed hypotheses need no fitting; development rows are not included in the pooled validation objective.
- Validation fold 1: 2023-01-01 through 2023-06-30.
- Validation fold 2: 2023-07-01 through 2023-12-31.
- Validation fold 3: 2024-01-01 through 2024-12-31.
- Final locked holdout: 2025-01-01 through 2026-09-30.

Splits use common UTC market time across all assets. Feature warm-up may cross a split boundary because no fitted transform is learned. Labels may not. The normal command refuses holdout evaluation and returns only the holdout date range, feature/signal counts without labels, and dataset-manifest hash. Any earlier human exposure to real market outcomes cannot be erased; the lock controls only harness access.

## Baselines and economics

At identical instrument, decision, entry, exit, horizon, and price basis:

- always long;
- always short;
- SMA-200 direction (long at/above SMA, otherwise short);
- cash/no-position, as an economic rather than directional classifier.

Central modeled round-trip fee and slippage: 18 bps. Stressed modeled round trip: 36 bps. These are frozen assumptions, not observed execution costs. Spot short borrow, locate, funding, and executable availability are unsupported; all short economics remain hypothetical. Event-level returns are not summed or annualized as a portfolio.

## Accuracy report and uncertainty

For every candidate, horizon, and fold report eligible rows, decisions, abstentions, exclusions, matured/pending/unverified labels, direction split, hit/flat counts, gross and modeled-net return distribution, matched-baseline differences, assets, decision dates, and overlap counts.

Uncertainty uses a deterministic moving-block bootstrap over UTC decision dates. Each sampled date keeps the entire cross-asset panel. Blocks are 30 decision dates, at least as long as the maximum horizon, with 500 resamples and seed `20261009`. If fewer than two blocks exist, interval output is withheld. No exact effective sample size is invented.

## Selection rule

At most one hypothesis per horizon may qualify. Maximize pooled out-of-fold mean central-cost net signed return, subject to all of:

- at least 100 issued decisions;
- at least 3 unique assets;
- at least 30 unique decision dates;
- positive pooled mean central-cost net signed return;
- 95% block-bootstrap lower bound of the difference versus the best matched directional baseline is strictly above zero.

Ties prefer trend continuation. Passing only qualifies a candidate for independent holdout review; it does not authorize live promotion. If none pass, select none.

## Separation and stopping rule

Every row is labeled cohort `phase2a-offline-crypto-direction-forecast`. No Phase 2 table, export, or read path writes to or merges with the legacy signal scoreboard, live prospective cohorts, issued contracts, or live weights.

Phase 2A stops after development/validation outputs and the locked holdout manifest. It does not open holdout performance, self-certify edge, promote a strategy, trade, or proceed to Phase 2B.
