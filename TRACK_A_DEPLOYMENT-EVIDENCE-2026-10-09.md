# Market refresh deployment evidence — 2026-10-09

## Registered jobs observed

| Job | Registration | Cadence | Enabled | Action |
|---|---|---:|---:|---|
| Market data | `crypto-market-data-refresh` | every 5 minutes | yes | `refreshmarketdata`, symbols BTC/ETH/SOL, trigger scheduled |
| Signal status monitor | `crypto-signal-status-monitor` | every 5 minutes | yes | `refreshsignalstatuses` |

Recent scheduler history inspected on 2026-10-09 showed consecutive successful cycles for both lanes between approximately 15:20 and 15:56 EDT. The market-data lane also recorded one failed cycle at approximately 15:50:58 EDT with an insert-query failure. That is genuine deployment evidence, not a fixture. It does not prove recovery of the new migration because this repair had not yet been deployed when those runs occurred.

## Automatic coverage and request accounting

Default automatic symbols are BTCUSDT, ETHUSDT and SOLUSDT on Binance Spot REST. The validated optional set is BTC, ETH, SOL, LINK, DOGE, XRP, AVAX, ADA and SUI, always USDT quoted. An empty validated set is rejected before any request.

At the default three-symbol set, one clean cycle costs the terminal's documented Binance request-weight estimate:

- one batched mini-ticker request: weight 2;
- three two-row daily kline requests: weight 2 each;
- total: weight 8 per cycle;
- 288 five-minute cycles/day: 2,304 weight/day;
- 30-day month: 69,120 weight/month.

With the configured maximum of two attempts, a pathological all-retry day would be up to 4,608 accounted weight/day. Actual retries count toward `request_weight`, `attempt_count`, and `rate_limit_count`; provider `Retry-After` is parsed and respected up to a 60-second bound, after which the cycle fails rather than sleeping indefinitely.

## Honest status

Post-repair consecutive-cycle and recovery evidence is pending deployment. Deterministic transport tests cover 429/retry recovery and terminal timeout; they are not presented as production observations.
