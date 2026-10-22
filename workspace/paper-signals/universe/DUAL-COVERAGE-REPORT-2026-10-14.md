# Dual coverage — discovery runs 56–59 + supported-universe scan 2026-10-14 (universe UNIVERSE-v1.0.0, venue Binance Spot via Binance.US)

**Window:** 2026-10-14 discovery runs 56–59; supported-universe scan `universe-scan-2026-10-14T2005Z`.
**Provenance note:** run 59 (13 candidates) exists ONLY in the builder's probe DB — confirmed absent from the deployed artifact DB. Deployed discovery runs 56–58; deployed paper runs 1–6 all `issuedCount: 0`. Column A renders both, labeled.

## Canonical table

| Candidate (coinId / symbol / dir) | Discovery outcome | Universe status | Paper-path result | Exclusion / note |
|---|---|---|---|---|
| bitway / BTW / long | eligible → paper path (run 59, probe) | UNSUPPORTED_LISTING | deferred (`venue_mapping_unavailable`) | not on Binance Spot at all |
| layerzero / ZRO / short | eligible → paper path (run 59, probe) | UNSUPPORTED_VENUE | deferred (`venue_mapping_unavailable`) | TRADING on global Binance only; venue cannot observe; ZROUSDT confirmed NOT LISTED on Binance.US this scan |
| pearl-2 / PRL / long | eligible → paper path (run 59, probe) | UNSUPPORTED_LISTING | deferred (`venue_mapping_unavailable`) | not on Binance Spot at all |
| basic-attention-token / BAT / long | eligible → paper path (run 59, probe) | SUPPORTED ⚠ pending-row (delisting-risk) | deferred (`venue_mapping_unavailable`) | BATUSDT TRADING (re-verified this scan 20:05Z); COVERAGE row not yet shipped; BATUSD/BATUSD4 BREAK |
| quack-ai / Q / long | eligible → paper path (run 59, probe) | UNSUPPORTED_LISTING | deferred (`venue_mapping_unavailable`) | ≠ RichQUACK — never substituted |
| pons / PONS / short | eligible → paper path (run 59, probe) | UNSUPPORTED_LISTING | deferred (`venue_mapping_unavailable`) | — |
| walrus-2 / WAL / long | eligible → paper path (run 59, probe) | UNSUPPORTED_VENUE | deferred (`venue_mapping_unavailable`) | TRADING on global Binance only; WALUSDT confirmed NOT LISTED on Binance.US this scan |
| manadia / UMXM / long | eligible → paper path (run 59, probe) | UNSUPPORTED_LISTING | deferred (`venue_mapping_unavailable`) | not on Binance Spot at all |
| deep / DEEP / long | eligible → paper path (run 59, probe) | UNSUPPORTED_LISTING | deferred (`venue_mapping_unavailable`) | — |
| swarm-network / TRUTH / long | eligible → paper path (run 59, probe) | UNSUPPORTED_LISTING | deferred (`venue_mapping_unavailable`) | — |
| bitcoin / BTC / watch | monitor_only (run 59, probe) | SUPPORTED (BTCUSDT) | not routed (watch) | — |
| dusk-network / DUSK / watch | rejected at strategy_eligibility (run 59, probe) | OUT_OF_SCOPE | not routed | freshness/liquidity/market-cap not satisfied |
| aleo / ALEO / watch | rejected at strategy_eligibility (run 59, probe) | OUT_OF_SCOPE | not routed | freshness/liquidity/market-cap not satisfied |
| ethereum / ETH / — | no discovery candidate (supported-universe scan) | SUPPORTED (ETHUSDT) | not routed (no candidate) | structural probe: venue-mapping gate PASS (live 20:05Z) |
| solana / SOL / — | no discovery candidate (supported-universe scan) | SUPPORTED (SOLUSDT) | not routed (no candidate) | structural probe: venue-mapping gate PASS (live 20:05Z) |
| chainlink / LINK / — | no discovery candidate (supported-universe scan) | SUPPORTED (LINKUSDT) | not routed (no candidate) | structural probe: venue-mapping gate PASS (live 20:05Z) |
| sui / SUI / — | no discovery candidate (supported-universe scan) | SUPPORTED (SUIUSDT) | not routed (no candidate) | structural probe: venue-mapping gate PASS (live 20:05Z) |
| dogecoin / DOGE / — | no discovery candidate (supported-universe scan) | SUPPORTED (DOGEUSDT) | not routed (no candidate) | structural probe: venue-mapping gate PASS (live 20:05Z) |
| ripple / XRP / — | no discovery candidate (supported-universe scan) | SUPPORTED (XRPUSDT) | not routed (no candidate) | structural probe: venue-mapping gate PASS (live 20:05Z) |
| avalanche-2 / AVAX / — | no discovery candidate (supported-universe scan) | SUPPORTED (AVAXUSDT) | not routed (no candidate) | structural probe: venue-mapping gate PASS (live 20:05Z) |
| cardano / ADA / — | no discovery candidate (supported-universe scan) | SUPPORTED (ADAUSDT) | not routed (no candidate) | structural probe: venue-mapping gate PASS (live 20:05Z) |
| basic-attention-token / BAT / — | no discovery candidate (supported-universe scan) | SUPPORTED ⚠ pending-row (delisting-risk) | deferred (`venue_mapping_unavailable`) | BATUSDT TRADING live; no COVERAGE row; wiring is the separate step |
| (deployed runs 56–58) | 0 directional candidates available → paper runs 1–6: 0 issued | — | 0 / 0 / 0 | "No directional discovery candidate was available for the explicit paper path; no signal was manufactured." |

## Summary block

```
Broad discovery:      13 candidates discovered (run 59, builder probe) → 10 eligible directional → 10 reached paper path (probe)
                      Deployed: runs 56–58 → 0 directional candidates → paper runs 1–6: 0 issued, 0 abstained, 0 deferred
Supported universe:   1 of 10 eligible in UNIVERSE-v1.0.0 (10%) — BAT, SUPPORTED-pending-row (unwired)
Coverage gap:         9/10 = 90% of eligible candidates unpaperable — by reason:
                        UNSUPPORTED_LISTING 7 · UNSUPPORTED_VENUE 2 · SUPPORTED-pending-row 1
Papered:              probe: 0 issued / 0 abstained / 10 deferred (venue_mapping_unavailable)
                      deployed: 0 issued / 0 abstained / 0 deferred
Supported-universe scan (this report): 0 issued / 0 abstained / 1 deferred (BAT, venue_mapping_unavailable) /
                      9 no-candidate (structurally clear at the venue-mapping gate, live-verified 20:05Z)
```

## Coverage-gap metric

`eligible_but_unsupported / eligible` = 9/10 = **90%** (unchanged from the v1.0.0 format baseline).

- 7 UNSUPPORTED_LISTING — the venue has no instrument; not paperable here under any mapping.
- 2 UNSUPPORTED_VENUE (ZRO, WAL) — real listings on global Binance; venue-mismatch is the binding constraint. **Venue-coverage signal for the parent:** both are TRADING where the program cannot observe. Do not re-tune the freeze or the model over this.
- 1 SUPPORTED-pending-row (BAT) — wire-able; delisting-risk re-verification completed in this scan (BATUSDT TRADING, BATUSD/BATUSD4 BREAK — flag current).

## Missed-opportunity watch (trailing-24h moves, CoinGecko, single source, ~20:10Z)

Caveat: run-59 decisions were stamped 18:41:58Z (~1.5h before this check); the 24h window includes pre-decision movement. Moves of this magnitude within a day of eligibility are material regardless.

| Candidate | dir | 24h move | Universe status | Read |
|---|---|---|---|---|
| manadia / UMXM | long | **+911.1%** | UNSUPPORTED_LISTING | universe-blind runner; not paperable on this venue under any mapping |
| walrus-2 / WAL | long | **+60.7%** | UNSUPPORTED_VENUE | universe-blind; real global-Binance listing the venue cannot observe |
| quack-ai / Q | long | +22.3% | UNSUPPORTED_LISTING | universe-blind |
| deep / DEEP | long | +16.5% | UNSUPPORTED_LISTING | universe-blind |
| swarm-network / TRUTH | long | +16.8% | UNSUPPORTED_LISTING | universe-blind |
| pons / PONS | short | +15.2% | UNSUPPORTED_LISTING | moved against the short; universe-blind either way |
| bitway / BTW | long | +13.4% | UNSUPPORTED_LISTING | universe-blind |
| pearl-2 / PRL | long | +9.8% | UNSUPPORTED_LISTING | universe-blind |
| layerzero / ZRO | short | −6.4% | UNSUPPORTED_VENUE | moved with the short; venue-mismatch kept it off the paper path |
| basic-attention-token / BAT | long | −16.8% | SUPPORTED-pending-row | the ONE supported eligible candidate moved **against** its direction — the deferral did not cost a gain |

## Anti-concealment checks

- Broad-discovery count across the window: run 58 = 0 candidates, run 59 = 13. This is discovery variance (empty run 58 was faithfully recorded), not universe narrowing — the universe did not change between them.
- UNSUPPORTED_VENUE rows (ZRO, WAL) persist across runs: venue-coverage signal, reported above; no freeze/model change proposed.
- The 90% coverage gap is structural (7 assets the venue never lists), not a mapping bug: only BAT's row can close any of it, and only via the governed wiring step.
- Nothing in column B conceals column A: every unsupported eligible candidate is a labeled row with its 24h move.

## Files

- Scan result (per-asset gate trace): `universe/SUPPORTED-UNIVERSE-SCAN-2026-10-14.md`
- Scan rows (CSV): `universe/SUPPORTED-UNIVERSE-SCAN-2026-10-14.csv`
- Live venue evidence: `universe/evidence/venue-feed-checks-2026-10-14T200510Z.json`, `universe/evidence/binanceus-exchangeinfo-2026-10-14T200510Z.json`
- Run-59 routing baseline: `comparison/CANDIDATE-ROUTING-2026-10-14.md`
