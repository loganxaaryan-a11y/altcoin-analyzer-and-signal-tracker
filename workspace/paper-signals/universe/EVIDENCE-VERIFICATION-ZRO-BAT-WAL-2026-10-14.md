# Verification evidence — ZRO / BAT / WAL against the ACTUAL paper-program venue (2026-10-14)

**Venue (verified):** Binance Spot, served via Binance.US public market data (venue label `binance-spot`).
Venue evidence chain:
- Deployed handler's own persisted deferral records: `reason="No explicit Binance Spot USDT instrument mapping exists."`, `instrument=unmapped`, `venue=Binance Spot` (paper run 7, builder-probe read of the deployed handler code replica; deployed-side confirmation via `getpaperpilotstatus` left to the parent — see limitation below).
- BTC issuance runtime doc: entry data was real Binance.US BTCUSDT spot aggTrades + klines under venue label `binance-spot`.
- The build VM is geo-blocked from global `api.binance.com`; the venue's market data the program can actually observe is Binance.US.

**Method:** live pulls from `https://api.binance.us/api/v3/exchangeInfo` (HTTP 200, 629 symbols, `serverTime` 2026-10-14T19:57:58Z), plus per-pair `klines?interval=1d&limit=2` and `aggTrades?limit=1` probes (~19:58–19:59Z). Raw evidence: `evidence/binanceus-exchangeinfo-subset-2026-10-14.json` and `evidence/venue-feed-checks-2026-10-14.json`.

## Verdicts (against the actual venue — Binance.US)

| Candidate | CoinGecko id / symbol | Chain/contract identity (CG, pulled 2026-10-14) | Binance.US status @ 2026-10-14 19:57Z | Verdict |
|---|---|---|---|---|
| ZRO | `layerzero` / ZRO | ETH OFT omnichain `0x6985884c4392d348587b19cb9eaaf157f13271cd` (same on ETH/Base/Polygon/BSC/Arbitrum/Optimism/Avalanche) | **NOT LISTED** — no ZRO pair under any quote on Binance.US | **UNSUPPORTED — do not wire.** TRADING on global Binance (ZROUSDT, verified via data-api.binance.vision) is irrelevant: the program cannot observe that venue (geo-blocked). Venue-mismatch, not a missing row. |
| BAT | `basic-attention-token` / BAT | ETH `0x0d8775f648430679a709e98d2b0cb6250d2887ef` (canonical; bridged variants exist) | **BATUSDT TRADING**, spot trading allowed; klines 1d return bars (last close 0.169), aggTrades return live prints (last id 1259746) | **WIRE-ABLE — with a delisting-risk flag.** BATUSD and BATUSD4 are both **BREAK** on Binance.US (delisted USD quotes); BATUSDT is the sole live BAT quote and must be re-verified TRADING at wiring time. Global Binance also shows BATUSDT TRADING (all other BAT quotes BREAK). |
| WAL | `walrus-2` / WAL | Sui `0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL` | **NOT LISTED** — no WAL pair under any quote on Binance.US | **UNSUPPORTED — do not wire.** Same venue-mismatch as ZRO: WALUSDT is TRADING on global Binance, unobservable by the program. |

## BAT delisting-risk flag (explicit, per task rule)

Do NOT wire BATUSDT blindly:
1. Binance.US has already delisted two BAT USD quotes (BATUSD → BREAK, BATUSD4 → BREAK). BATUSDT is the last live BAT quote.
2. On global Binance, every non-USDT BAT pair is BREAK as well — the USDT pair is the sole survivor on both venues.
3. Wiring requires a same-day `exchangeInfo` status re-check immediately before the row ships; the handler does not re-check listing status at runtime.

## What the task premise got wrong (and right)

- Right: ZRO, BAT, WAL are the only three run-59 deferrals whose assets are real, listed, TRADING USDT spot pairs *somewhere* (global Binance), needing only COVERAGE rows rather than venue support.
- Corrected here: the verification was against **global** Binance (`data-api.binance.vision` mirror). Against the **actual** paper-program venue (Binance.US), ZRO and WAL are not listed at all — they are venue-unsupported, not merely missing rows. Only BAT (BATUSDT) is TRADING on the actual venue.

## Limitation

Deployed-venue declaration from the deployed artifact itself (`getpaperpilotstatus` / deployed config) could not be invoked from this session (subagent has no artifact-invoke capability). The venue chain above is from the deployed handler's persisted records and docs. Parent should confirm `getpaperpilotstatus` on the live terminal agrees with "Binance Spot / binance-spot label via Binance.US market data".
