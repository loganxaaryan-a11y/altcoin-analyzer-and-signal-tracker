# Timing evaluation protocol v3 — frozen for structural review only

Status: **performance unexecuted**. This does not replace the frozen Phase 2A criterion. Previously inspected validation data remain exploratory, and no holdout is opened.

## Question

Conditional on the prior market state and frozen SMA-200 side, did the candidate’s predeclared filter select better entry dates than an eligible alternative schedule? This is distinct from direction at the same timestamp and from portfolio economics.

## Frozen candidate and comparator rules

A candidate date is eligible only when every frozen feature input is available by decision time, the exact next-day entry exists, and the exact five- or 30-calendar-day endpoint fits inside its validation fold. No gap is filled and no endpoint moves.

Comparator dates match, in this order:

1. identical Binance Spot USDT instrument and validation fold;
2. identical frozen prior SMA-200 side;
3. identical horizon;
4. identical volatility bucket from 30 trailing decision-available daily close-to-close log returns, annualized by `sqrt(365)`;
5. within ±90 UTC calendar days.

Volatility buckets are fixed: **low <50%**, **medium 50% to <90%**, **high ≥90%** annualized. The candidate date itself is excluded. Other candidate dates may enter a comparator pool because eligibility is established without forward returns. A pool with fewer than 20 dates is unmatched; it is never widened after observing returns.

## Matching, reuse, and seeds

Seeds are fixed as `20261009, 20261010, 20261011, 20261012, 20261013`.

Candidates are processed in ascending instrument, fold, strategy, horizon and decision-time order. Inside a pool, a deterministic seeded hash orders comparator dates. Matching is without replacement within instrument/fold/SMA-side/horizon/volatility-bucket until every eligible date has been used once. After exhaustion, choose the least-used date; the seeded hash breaks ties. Every reuse is counted. No forward return enters eligibility, ordering, matching, or reuse.

## Dependence gate

The eventual point estimate and interval must use the same matched rows. Dependence components join rows that share a candidate date, share a comparator date, or have overlapping candidate/comparator forward windows. Whole components are the primary resampling unit inside a fold. Fewer than 20 components means descriptive output only: no qualification interval and no gate relaxation.

A two-way candidate-date/comparator-date cluster bootstrap is a sensitivity analysis only. Connected components do not eliminate every possible form of market dependence, and disagreement remains a limitation.

## Structural preflight

`research/phase2a1/closure-v3-real-market/timing-structural-preflight.json` records only:

- candidate and comparator pool counts;
- matched/unmatched counts;
- comparator reuse counts;
- component counts and full component-size lists;
- every structural candidate/comparator match for all five seeds;
- every dependency component with its member match IDs;
- whether the fixed 20-component feasibility gate is met.

It contains no candidate/comparator return, interval, qualification statistic, or promotion decision. The full matching and graph records reconstruct the reported counts without opening timing-return analysis. Timing performance remains unexecuted pending expert review.
