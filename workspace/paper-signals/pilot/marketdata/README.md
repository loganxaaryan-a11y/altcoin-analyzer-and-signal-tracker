# Shared research market-data cache (Hyperliquid)

Reusable cached layer over the verified Hyperliquid public reads
(`https://api.hyperliquid.xyz/info`, no key, verified live 2026-10-19).

## What is cached per refresh
- Prices: perp mids (`allMids`) + full context table (`metaAndAssetCtxs`:
  markPx, midPx, oraclePx, funding, openInterest, premium, dayNtlVlm,
  prevDayPx, dayBaseVlm) for BTC, ETH, HYPE, NEAR, SOL, SUI.
- Completed candles: 1h `candleSnapshot` per instrument, 7d lookback.
  Deterministic completed-bar cadence — only bars with close time strictly
  before the refresh receipt time count as completed. The forming bar is
  labeled `forming` and EXCLUDED from completed calculations.
- Volume: candle `v` fields + `dayNtlVlm` / `dayBaseVlm`.
- Funding + OI: context fields per refresh; `fundingHistory` hourly points
  per instrument per snapshot.

## Identity preserved end-to-end
Every snapshot records: venue (Hyperliquid), market type (perp), quote
currency (USD), price type per field (mark/mid/oracle), and both the source
observation framing and the cache `receipt_time_utc`. This cache is NEVER
spliced into Binance spot settlement evidence for paper entries.

## Funding/OI history
`series/funding-<COIN>.jsonl` and `series/oi-<COIN>.jsonl` begin at the FIRST
collected snapshot (header says so). They do not establish pre-collection
trends. `state.json` carries `changes_since_last_refresh` per instrument for
the research display.

## Files
- `hl_cache.py` — refresh script (14 requests per refresh, bounded).
- `snapshots/snapshot-<UTC-ts>.json` — per-refresh snapshot (pruned to last 96).
- `series/` — funding/OI series, appended per refresh.
- `state.json` — last refresh time, instruments, per-field changes.

## Schedule
Refreshed by the same `paper-venue-monitor` cron (30m) that runs the venue
monitor — no additional job. On-demand: `python3 hl_cache.py`.
