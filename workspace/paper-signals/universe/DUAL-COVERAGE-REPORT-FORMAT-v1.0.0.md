# Dual-coverage reporting format — v1.0.0 (2026-10-14)

**Purpose:** every paper-program report must show broad-discovery coverage AND supported-universe coverage side by side, so that narrowing the universe can never conceal missed opportunities.

## The rule

1. **Two columns, always.** Every report on the paper program renders, for the same discovery window, both:
   - **(A) Broad-discovery coverage:** all discovery candidates (eligible directional + monitor-only), with their pipeline stage and outcome.
   - **(B) Supported-universe coverage:** the subset inside UNIVERSE-vN (the version active at each candidate's decision time).
2. **A universe-only view is forbidden** unless the broad-discovery column is rendered next to it.
3. **Unsupported assets are visibly labeled, never silently dropped.** Labels: `SUPPORTED`, `UNSUPPORTED_VENUE` (listed elsewhere but not on the venue), `UNSUPPORTED_LISTING` (not on Binance Spot at all), `UNSUPPORTED_VENUE_WIRED_PAIR_NULL` (pair:null precedent).
4. **The coverage-gap metric is always computed:** `eligible_but_unsupported / eligible` — the fraction of eligible candidates the universe could not paper.

## Canonical table (per reporting window)

```
# Dual coverage — <window label> (universe UNIVERSE-v1.0.0, venue Binance Spot via Binance.US)

| Candidate (coinId / symbol / dir) | Discovery outcome | Universe status            | Paper-path result            | Exclusion / note                     |
|---|---|---|---|---|
| bitway / BTW / long             | eligible → paper path | UNSUPPORTED_LISTING      | deferred (venue_mapping_unavailable) | not on Binance Spot at all           |
| layerzero / ZRO / short         | eligible → paper path | UNSUPPORTED_VENUE        | deferred (venue_mapping_unavailable) | TRADING on global Binance only; venue cannot observe |
| pearl-2 / PRL / long            | eligible → paper path | UNSUPPORTED_LISTING      | deferred (venue_mapping_unavailable) |                                      |
| basic-attention-token / BAT / long | eligible → paper path | SUPPORTED ⚠ delisting-risk | deferred (venue_mapping_unavailable) | BATUSDT TRADING; COVERAGE row not yet shipped; BATUSD/BATUSD4 BREAK |
| quack-ai / Q / long             | eligible → paper path | UNSUPPORTED_LISTING      | deferred (venue_mapping_unavailable) | ≠ RichQUACK — never substituted      |
| pons / PONS / short             | eligible → paper path | UNSUPPORTED_LISTING      | deferred (venue_mapping_unavailable) |                                      |
| walrus-2 / WAL / long           | eligible → paper path | UNSUPPORTED_VENUE        | deferred (venue_mapping_unavailable) | TRADING on global Binance only       |
| manadia / UMXM / long           | eligible → paper path | UNSUPPORTED_LISTING      | deferred (venue_mapping_unavailable) |                                      |
| deep / DEEP / long              | eligible → paper path | UNSUPPORTED_LISTING      | deferred (venue_mapping_unavailable) |                                      |
| swarm-network / TRUTH / long    | eligible → paper path | UNSUPPORTED_LISTING      | deferred (venue_mapping_unavailable) |                                      |
| bitcoin / BTC / watch           | monitor_only          | SUPPORTED (BTCUSDT)      | not routed (watch)           | —                                    |
| dusk-network / DUSK / watch     | rejected (strategy)   | —                        | not routed                   | —                                    |
| aleo / ALEO / watch             | rejected (strategy)   | —                        | not routed                   | —                                    |

Coverage gap: 9 of 10 eligible candidates outside the universe (90%).
  - 7 UNSUPPORTED_LISTING (venue has no instrument — not paperable here)
  - 2 UNSUPPORTED_VENUE (ZRO, WAL — real listings on global Binance; venue-mismatch; do not wire)
  - 1 SUPPORTED-pending-row (BAT — wire-able after delisting-risk re-check)
```

## Summary block (required in every report)

```
Broad discovery:      N candidates discovered → E eligible directional → R reached paper path
Supported universe:   S of E eligible are in UNIVERSE-vN (S/E %)
Coverage gap:         (E − S)/E % of eligible candidates unpaperable — by reason:
                        UNSUPPORTED_LISTING n · UNSUPPORTED_VENUE n · pending-row n
Papered:              P issued / A abstained / D deferred (with reason codes)
Missed-opportunity watch: list any UNSUPPORTED_VENUE / UNSUPPORTED_LISTING candidate
  that subsequently printed a qualifying move, as a visible "universe-blind" row.
```

## CSV schema (for machine consumers)

`universe_version, venue, discovery_run_id, candidate_coingecko_id, symbol, direction, discovery_outcome, universe_status, paper_path_result, reason_code, exclusion_note, decision_at`

One row per discovery candidate; `universe_status` ∈ {SUPPORTED, UNSUPPORTED_VENUE, UNSUPPORTED_LISTING, UNSUPPORTED_VENUE_WIRED_PAIR_NULL, OUT_OF_SCOPE}. `OUT_OF_SCOPE` only for candidates rejected before the universe applies (monitor_only/watch or strategy-rejected) — shown in (A), carried as a labeled row, never dropped.

## Anti-concealment checks

- If the broad-discovery count drops between reports with no strategy change, say so (universe narrowing cannot explain discovery shrinkage).
- If `UNSUPPORTED_VENUE` rows accumulate, that is a venue-coverage signal for the parent — report it, do not re-tune the freeze or the model.
- The `coverage gap` trend across runs must be plotted; a widening gap means the universe is drifting away from what discovery finds.
