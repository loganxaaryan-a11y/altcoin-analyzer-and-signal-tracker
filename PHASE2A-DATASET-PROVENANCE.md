# Phase 2A dataset provenance and coverage

**Run:** 2026-10-09T16:58:48.405Z  
**Dataset manifest hash:** `e40894eb8a40e0622423f145939fe42f0338cbe9c86441357184a70866516bda`  
**Engine spec hash:** `90ba804cd8816517244a805086599c3f6c7a6a1a82372e234ba62804e1edfdd6`  
**Sample:** survivor-sample exploratory  
**Source:** Binance market-data-only API  
**Venue / quote / interval:** Binance Spot / USDT / 1d UTC  
**Adjustment basis:** unadjusted venue spot

## Retrieval recipe

1. Call Binance market-data-only daily klines at `https://data-api.binance.vision/api/v3/klines` with the fixed `{SYMBOL}USDT` pair, `interval=1d`, `limit=1000`, and paginated `startTime`.
2. Upsert raw rows through the artifact's existing `historical_daily_bars` cache with source `binance`; never substitute another provider for a missing Binance row.
3. Invoke `runphase2aofflineresearch` with `{ "refresh": true }`. The action accepts only Binance rows with complete OHLCV and retains the stored retrieval timestamp for each bar.
4. For an offline file run, supply the same normalized rows as JSON or JSONL to `bun research/phase2a/cli.ts --input <bars.json|bars.jsonl> --out research/phase2a/output`.

The sandbox action refresh completed without provider errors for all nine pairs. The maximum persisted per-row retrieval timestamp was `2026-10-02T08:46:13Z`; the run occurred on October 9. This distinction is retained rather than relabeling cached rows as newly retrieved.

## Coverage and raw hashes

| Pair | Rows | First bar | Last bar | Gaps | Duplicates | Incoherent | Raw SHA-256 |
|---|---:|---|---|---:|---:|---:|---|
| BTCUSDT | 3,332 | 2017-08-17 | 2026-09-30 | 0 | 0 | 0 | `af6f44111663025f63988f8554ca1f4bb8819b6f2feb28c726c777bd7570bae6` |
| ETHUSDT | 3,332 | 2017-08-17 | 2026-09-30 | 0 | 0 | 0 | `8516fc6efce8d2bed43ad6e8ca60fbd25684b6f6024635dadc55c82acf5b54a3` |
| SOLUSDT | 2,242 | 2020-08-11 | 2026-09-30 | 0 | 0 | 0 | `f1ceb2cb8859d9df7181213d65f7bbfcd02f570a8e06a1bb877de70c5839321c` |
| LINKUSDT | 2,815 | 2019-01-16 | 2026-09-30 | 0 | 0 | 0 | `c9ca31fb55a95a91c8f3af0b4ceef0608a703243b4eb24fb0702fed189f2ac73` |
| DOGEUSDT | 2,645 | 2019-07-05 | 2026-09-30 | 0 | 0 | 0 | `1e23d8de68da3856e41ef0188fc9223c76ccd170b6b7f33c5463e0dae32ea7ce` |
| XRPUSDT | 3,072 | 2018-05-04 | 2026-09-30 | 0 | 0 | 0 | `efa24fd8818c2932fcce41cef24b4239e42281be7d10cb7ff4da85805c16a5a3` |
| AVAXUSDT | 2,200 | 2020-09-22 | 2026-09-30 | 0 | 0 | 0 | `2fa949b4e4e085d66d970d592ff4ec0fee1179f6087bd87635148cafc5fc6893` |
| ADAUSDT | 3,089 | 2018-04-17 | 2026-09-30 | 0 | 0 | 0 | `432dfa1d27ade32f7a79659abde859546eed814a5959ec8a691604e3f754e9bf` |
| SUIUSDT | 1,247 | 2023-05-03 | 2026-09-30 | 0 | 0 | 0 | `cfc05ac1b52190f0243459bdc982cff7b02274614fdcaeaf260fd68561e19881` |

Total canonical rows: **23,974**.

## Exclusions and assumptions

- Missing bars are never filled. This run found no within-series daily gaps, duplicates, or incoherent OHLCV rows after source filtering.
- Warm-up, fold-boundary label maturity, and locked-holdout rows are counted separately from strategy abstentions.
- Availability is inferred as daily bar end plus five minutes. It is not an observed historical provider timestamp.
- The current fixed universe omits delisted/inactive assets and does not reconstruct point-in-time market membership. It cannot support whole-market runner recall.
- Spot short borrow, locate, funding, and executable availability are not in the dataset. Short returns are hypothetical directional estimands.
- The review package provides hashes and an exact retrieval recipe rather than redistributing Binance history.
