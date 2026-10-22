# Proposed Phase 2A.2 timing-evaluation protocol — review only

**Version:** `crypto-timing-evaluation-protocol-v0-proposed`  
**Status:** proposed for expert review; not executed

## Question separation

1. **Directional value:** at the candidate's emitted timestamps, is its direction better than other directions under the same entry, exit, price basis, and cost scenario? The frozen matched-direction comparisons answer this. Because both frozen candidates are long above SMA-200 and short below SMA-200, candidate and matched SMA-200 returns must be identical. That equality is now an explicit passing sanity check.
2. **Timing/filter value:** conditional on the same asset, fold, and prior-information SMA direction, are emitted timestamps better opportunities than a predeclared alternative schedule? This is not answered by handing SMA the candidate's timestamps.
3. **Portfolio economics:** requires sizing, exposure caps, overlap, cash, financing, short feasibility, and portfolio costs. This protocol does not estimate it.

## Proposed comparator

For each candidate event, sample one comparator date without replacement from the same asset, validation fold, horizon, and prior-information SMA direction. Comparator dates must:

- be feature-eligible under the same 200-bar warm-up and exact UTC market clock;
- have their labels available at selection time;
- not use future returns, future volume, or later membership information;
- use the same entry, endpoint, venue, quote currency, and costs;
- be selected by a frozen deterministic seed before any timing outcomes are computed.

Repeat over a fixed, recorded seed set and report every seed. Equal-count matching estimates event-level selection value; it is not a tradable portfolio or an untouched confirmation test.

## Dependence and coverage

Use paired candidate-minus-comparator returns. Resample complete 30-date UTC blocks from the full scheduled grid, preserving the cross-asset panel and dates with no candidate emission. A short tail is not a complete block. Report complete block count and withhold intervals when fewer than two complete blocks exist. Report candidate coverage, comparator-pool size, unmatched events, asset/date concentration, and overlap.

## Review gate before execution

Execution requires expert approval of the comparator pool, matching variables, seed list, exclusion policy, and whether previously inspected 2023–2024 validation outcomes make this diagnostic exploratory only. It may not replace the frozen Phase 2A success rule retroactively. The original no-selection decision remains intact. The final 2025–2026 holdout remains closed.
