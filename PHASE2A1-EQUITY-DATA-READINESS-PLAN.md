# Equity longer-history readiness plan — no performance search

**Status:** planning only; no data purchased, no strategy run, existing reserved holdout unchanged

## Current evidence shortage

The existing bounded equity extract contains 259 daily rows each for KO, XOM, and JPM, with 246 physically separated train/validation rows and 13 locked rows per instrument. It is a current-survivor sample with unadjusted OHLCV, no split/dividend event table, and roughly one year of coverage. After 200-session warm-up, 30-session label maturity, and boundary purging, the existing validation folds cannot support the 30-session product.

## Feasible acquisition gate

Use only an existing lawful historical-data path already available to the equity terminal. Before ingesting data, verify and record:

- source, retrieval time, venue/calendar, entitlement and redistribution terms;
- adjusted versus unadjusted OHLC fields and whether dividends are included;
- split and dividend event support, delisted/inactive support, and revisions;
- provider publication/availability assumptions and XNYS session calendar support;
- point-in-time universe and liquidity limitations.

If the existing path cannot provide internally consistent adjusted OHLC plus corporate actions, retain price-return-only labeling and fail closed on unresolved split-like discontinuities. Never add dividends to an already total-return-adjusted series.

## Schedule feasibility before outcomes

Preserve the existing reserved holdout boundary and disclose that subsequent market outcomes may already be human-known; moving the boundary cannot make them unseen. Freeze a separate proposed schedule only after counting usable sessions per instrument:

`usable validation sessions = acquired sessions - 199 warm-up sessions - 30 endpoint-maturity sessions - labels purged at each fold boundary - missing/invalid/corporate-action exclusions`.

Each validation fold must exceed 30 eligible sessions after purging and should contain at least two complete 30-session uncertainty blocks. A proposed multi-year schedule should span distinct market states and use common XNYS dates across instruments. Export counts before any candidate returns are computed. If fewer than two complete blocks or no matured 30-session emissions remain, declare the fold underpowered rather than changing parameters or reclaiming holdout rows.

## Separation

The equity common-stock cohort remains separate from ETFs, leveraged instruments, and the crypto terminal's nine-pair Binance experiment. The earlier two-asset crypto sample in the shared equity harness remains separately labeled and must not be merged with this terminal's crypto evidence.
