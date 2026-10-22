# Track A — request budget

## Default scheduled lane

- Active instruments: BTCUSDT, ETHUSDT, SOLUSDT.
- Cadence: every 5 minutes = 288 runs/day.
- Per run: one batched `/api/v3/ticker/24hr?symbols=...&type=MINI` request (2 weight for 1–20 symbols) plus one `/api/v3/klines?interval=1d&limit=2` request per instrument (2 weight each).
- Per run: `2 + (3 × 2) = 8` weight.
- Per day: `8 × 288 = 2,304` weight.
- Per 30 days: `2,304 × 30 = 69,120` weight.

The budget is distributed across minutes; it is not a single burst. A one-minute lease and database key deduplicate concurrent scheduled/manual refreshes for the same symbol set. The browser reads the server-owned cache and does not poll Binance per viewer.

## Supported manual expansion

The allowlist is BTC, ETH, SOL, LINK, DOGE, XRP, AVAX, ADA and SUI. At nine instruments:

- Per run: `2 + (9 × 2) = 20` weight.
- Per day at an intentionally hypothetical five-minute cadence: `20 × 288 = 5,760` weight.
- Per 30 days: `172,800` weight.

Only the three-instrument default is scheduled. Manual requests are capped at nine symbols and reuse the one-minute lease.

## Incremental shape

The kline request is capped at two rows: enough to carry the last completed daily interval and the current forming interval. Track A does not re-download long history. Historical backfill remains the daily history-cache job.

## Failures and backoff

429 and 5xx responses receive one bounded retry after a short delay. The affected run is recorded as degraded or failed; last-known observations remain unchanged and age into `stale`. A 4xx other than 429 stops immediately. There is no unbounded retry loop and no paid plan.

## Source references

- Binance Spot REST market-data endpoints: https://developers.binance.com/docs/binance-spot-api-docs/rest-api/market-data-endpoints
- Binance Spot WebSocket market streams (reviewed, not selected): https://developers.binance.com/en/docs/catalog/core-trading-spot-trading/api/ws-streams/~
- Kraken OHLC: http://docs.kraken.com/api-reference/market-data/get-ohlc-data
