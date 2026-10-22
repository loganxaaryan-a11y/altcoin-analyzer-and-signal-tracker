# Proposed timing evaluation protocol v2 — review only, not executed

This protocol does not replace the frozen Phase 2A criterion and has not been run. Previously inspected validation data are exploratory.

## Question

Conditional on the prior market state and frozen directional side, did the candidate's predeclared filter select better entry dates than an eligible alternative schedule? This is distinct from direction-at-the-same-timestamp and from portfolio economics.

## Candidate-date eligibility

A candidate date is eligible only when every frozen feature input, the exact next-day entry, and the exact five- or 30-calendar-day endpoint exist and were available by their prescribed times. The candidate date is fixed before any forward return is read. No gaps are filled and no endpoint moves.

## Comparator pool

For each candidate event, eligible comparator dates must match:

1. instrument and validation fold;
2. frozen prior SMA-200 direction;
3. horizon and required coverage;
4. a predeclared volatility bucket from trailing, decision-available returns;
5. a predeclared calendar window of ±90 UTC days, excluding the candidate date and any date whose forward window crosses a fold or holdout boundary.

If fewer than 20 dates survive, the candidate event is marked `unmatched`; it is not widened or rematched after seeing returns. Report unmatched counts and characteristics.

## Reuse and fixed randomness

Comparator sampling seeds are frozen as `20261009, 20261010, 20261011, 20261012, 20261013`. For each seed, sample one comparator per candidate without replacement within instrument/fold/SMA-side/window where feasible. Reuse is allowed only after a pool is exhausted and is recorded per comparator date. No forward return enters eligibility or sampling.

## Dependence and populations

Candidate and comparator returns are paired at the event level, but comparator dates can differ from candidate dates and return windows overlap. The point estimate and interval use the same matched rows. Resampling uses connected dependence components: construct a graph joining rows that share any candidate date, comparator date, or overlapping candidate/comparator forward-return window; resample whole components within fold. Preserve all assets and both sides inside a component. If fewer than 20 independent components survive, report the estimate descriptively without a qualification interval.

As a sensitivity only, also report a two-way cluster bootstrap by candidate UTC date and comparator UTC date. Disagreement between methods is a limitation, never a reason to choose the more favorable result.

## Outputs

- matched and unmatched event counts by asset/fold/side;
- pool sizes, reuse counts and exact seeds;
- candidate, comparator and paired-difference gross/central-net/stressed-net means;
- identical point/interval population hashes;
- dependence component count, size distribution and overlap diagnostics;
- no promotion decision from this exploratory protocol.
