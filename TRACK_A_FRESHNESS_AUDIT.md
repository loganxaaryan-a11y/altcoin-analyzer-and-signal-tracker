# Track A — market-data freshness audit

## Scope and non-changes

This edit separates cheap market observations from expensive analysis and signal monitoring. It does **not** change strategy weights, Phase 2 research splits, holdout boundaries or access, execution rules, issued signal contracts, or legacy scoreboards.

## Before this edit

| Lane | Actual schedule / trigger | Data coupled to it | Consequence |
|---|---|---|---|
| Market discovery | Enabled every 6 hours (`crypto-market-discovery`) | CoinGecko market rows, derivatives context, signal scoring | Price/volume shown by scan surfaces could remain at the scan timestamp. |
| Theory discovery | Enabled every 12 hours | Expensive narrative/provider evidence | Independent, but not a market-price freshness path. |
| History cache | Enabled daily at 04:46 user time | Completed daily bars/funding cache | Correct for history, not for current marks. |
| Daily postmortem | Disabled | Signal evaluation and snapshots | No scheduled status monitoring. |
| Client dossier refresh | Manual/on-open | Full analysis stack | A cheap quote refresh still paid the cost and latency of broad analysis. |

The source already kept many factor timestamps, but current mark, chart row and volume refresh remained attached to broader fetch/scan paths. A successful broad refresh could not guarantee that every factor was equally current.

## After this edit

| Lane | Action | Configuration | Persistence / diagnostics |
|---|---|---|---|
| Market data | `refreshMarketData` | Five-minute server-shared polling; BTC, ETH, SOL by default; up to nine supported pairs manually | `market_data_observations`, `market_refresh_runs`; provider event time, receipt time, refresh time, state, source, venue, pair, quote and raw-field trace. |
| Expensive analysis | Existing discovery/theory/dossier actions | Existing 6-hour, 12-hour, daily and weekly schedules remain unchanged | Existing scan and source diagnostics remain unchanged. A disabled/throttled expensive scan does not affect the market-data action. |
| Signal monitoring | `refreshSignalStatuses` | Five-minute schedule, reading only the owned market cache | `signal_status_events`; idempotent quote-only status records. It never updates a contract or evaluation. |

## Freshness policy

- Quote and rolling 24-hour volume: stale after five minutes.
- Forming daily candle: stale after fifteen minutes.
- Completed daily candle: stale after twenty-six hours.
- Expensive factors retain their own timestamps and policies; a fresh price does not rewrite or freshen them.
- A provider response with an old event timestamp remains stale. Receipt time and last successful refresh are displayed separately.
- The latest Binance daily row is `forming` until its provider close time has passed. Forming volume is displayed as partial and excluded from completed-candle decision inputs.
- A changed payload for the same provider event time creates a new provider version linked to the prior row.

## Immutable decision boundary

`signal_contracts` and `signal_input_snapshots` are read-only in Track A. Monitoring appends `signal_status_events` that point to a market observation. Even if a quote is at or beyond an issued stop/target, `authoritative_settlement=false`; quote-only evidence cannot establish which barrier was touched first. Existing completed-path evaluators retain that authority.

Frequent market updates do not create a recommendation. Any future recommendation must go through the existing issuance path, receive a new `signalId`, and persist a separate decision-time snapshot.

## Provider and deployment choice

Bounded REST polling was chosen instead of WebSockets because the artifact host does not guarantee a durable socket. Binance Spot's public market-data-only host supports the current feed. Kraken's existing OHLC source remains unchanged; its final row is not treated as completed, and its 720-entry recent-data behavior is not misrepresented as arbitrary historical coverage.

## Equity

No entitled equity quote feed is configured in this crypto artifact. Diagnostics return `unavailable` and make no real-time claim. No crypto series is substituted for an equity.

## Open operational limits

- The integration tests prove application semantics with deterministic fixtures; they do not prove production database rollback or external incident recovery.
- Live diagnostics can prove provider reachability and persisted rows, but two consecutive scheduled recovery cycles remain pending until the new schedules have run in production.
- Existing production persistence-atomicity and incident-log evidence remain open as required by the prior signoff.
