# Universe policy — FROZEN v1.0.0

**Version:** UNIVERSE-v1.0.0 · **Date:** 2026-10-14 · **Cohort:** paper-program prospectives (frozen paper-pilot cohort; the retrospective v2.1.x cohort is untouched by this policy)
**Venue:** Binance Spot, served via Binance.US public market data (venue label `binance-spot`). Rationale: the deployed artifact runs US-side; global `api.binance.com` is geo-blocked; the handler's entry-observation records and BTC issuance evidence carry the `binance-spot` label on Binance.US data. A pair is only in the universe if it is observable by the deployed program — not merely listed on global Binance.
**Applies to:** the repaired paper path (`venue_mapping_unavailable` gate) — nothing else. Paper signals only; no brokerage, no execution, no model/threshold tuning.

## The support rule (binding)

An asset is **supported** iff ALL of the following hold at verification time:

1. The exact USDT pair is listed on the selected venue's `exchangeInfo` with `status == TRADING` and `isSpotTradingAllowed == true`.
2. Candle coverage: `klines?interval=1d&limit=2` on that pair returns ≥ 1 bar (decision-time chart + history have a venue source).
3. Entry-print coverage: `aggTrades?limit=1` on that pair returns ≥ 1 print carrying a venue-assigned aggregate id (the first-print handler has a real observation source).

No exceptions, no ticker-only matching: identity is the CoinGecko coinId + chain/contract, and the row is keyed on coinId (the lookup is `coinId === coinId || symbol === symbol.toUpperCase()`).

## Addition rules

- A new COVERAGE row requires a fresh `exchangeInfo` pull on the selected venue — same-day, re-verified TRADING status at wiring time.
- **Delisting-risk flag:** if any sibling quote of the pair on the same venue is BREAK/delisted (BAT precedent: BATUSD, BATUSD4), the row ships with `delisting_risk_flag=true`, a same-day re-verification requirement, and the note that the handler does not re-check listing status at runtime.
- **Never substitute a similarly named token.** Q ≠ RichQUACK; BAT ≠ any bridged/wrapped BAT variant; one coinId, one contract set, verified via CoinGecko — or no row.
- **Never revive an expired candidate.** A candidate rejected by strategy eligibility, issuance controls, or the freeze rules stays rejected; adding a mapping later does not re-open it.
- ZRO/WAL precedent: an asset TRADING on a venue the program cannot reach (global Binance) is **UNSUPPORTED_VENUE**, not "a missing row" — do not wire a pair the program cannot observe.

## Exclusion rules

- Assets not on the selected venue: labeled `UNSUPPORTED_VENUE` (listed elsewhere) or `UNSUPPORTED_LISTING` (not on Binance Spot at all), with the exact verification date and source.
- COVERAGE precedent rows with `pair: null` (HYPE, MON): remain `UNSUPPORTED_VENUE_WIRED_PAIR_NULL` — known, deliberately unmapped, defer with `venue_mapping_unavailable`. Removing the `pair: null` precedent (to add a real mapping) requires the full addition-rule verification, including chain/contract identity confirmation against the venue's listing (see HYPEUSDT anomaly flag in the export).
- Broad-discovery candidates outside the universe are **visibly labeled as unsupported** in every report (dual-coverage format); they are never silently dropped.

## Versioning

- This policy is frozen. Any change to the rule, the venue, or the universe requires a new version (UNIVERSE-vN) with date, venue, verification evidence, and a changelog — and v1.0.0 remains readable.
- Universe membership for prospective measurement is pinned per candidate decision time: a candidate discovered while UNIVERSE-v1.0.0 was active is evaluated under v1.0.0 forever.
- The scheduled scan (separate step) consumes the universe read-only.

## Verification evidence for v1.0.0

- `SUPPORTED-UNIVERSE-v1.0.0.json` — the export (10 supported rows, 11 exclusion rows).
- `EVIDENCE-VERIFICATION-ZRO-BAT-WAL-2026-10-14.md` — ZRO/BAT/WAL verdicts against the actual venue.
- `evidence/binanceus-exchangeinfo-subset-2026-10-14.json` — raw symbol records (52 symbols covering all bases in scope).
- `evidence/venue-feed-checks-2026-10-14.json` — per-pair klines/aggTrades probes.
- `verify-universe.sh` — regenerates the exchangeInfo pull + all per-pair checks; exits non-zero on any failure (verified 10/10 pass on 2026-10-14).

## Open item (not resolved by this policy)

Deployed-side venue confirmation: `getpaperpilotstatus` / deployed config could not be invoked from this session. The venue here is derived from the deployed handler's own persisted records (`venue=Binance Spot`) and evidence docs. Parent to confirm the live terminal's deployed config agrees before any COVERAGE row ships.
