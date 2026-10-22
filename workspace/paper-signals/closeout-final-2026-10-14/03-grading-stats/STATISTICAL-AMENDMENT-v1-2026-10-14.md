# Statistical Amendment v1 (2026-10-14) — FROZEN

**Applies to:** (P1) the directional shadow comparison
(`paper-signals/comparison/dossier-cohort-v1/`, protocol v1 as amended by v2);
(P2) Challenger A chart setup
(`challengers/spec-a/`, SPEC v3 as amended by v4/v5).

**What this is:** the frozen statistical rules both protocols were missing or
left vague — overlap diagnostics, an explicit dependence method per protocol,
a pinned estimand, and an explicit minimum-data rule. It changes no read-rule
threshold, no verdict label, no scope cap, no cost scenario, and no detector
threshold. Where it supersedes a frozen computation it says so explicitly;
thresholds and caps are restated unchanged.

---

## Freeze attestation (pre-outcome-inspection)

Frozen 2026-10-14. **No outcome data existed or was inspected in choosing
any method below** — the methods were chosen from the exposure-window
structure alone:

- P1: collection starts 2026-10-15T00:00:00Z. Verified 2026-10-14: zero
  prospective shadow rows existed (no `dossier-shadow-comparison-v1.csv`;
  `rows/` held only the three pre-window cohort seed rows this protocol
  excludes).
- P2: zero detections and zero production resolutions existed (first
  possible crypto detections 2026-11-11 UTC, equities 2026-11-27; README:
  "No evaluation runs yet — specify before evaluation").

Every block, cluster, and diagnostic definition in this amendment uses
**entry/decision timestamps (and asset identity for P2 dimension A) only** —
all computable before outcomes are inspected, so the freeze cannot have been
informed by results.

---

## §S1 Overlap diagnostics — both protocols (diagnostics ONLY)

For an observation set of n opportunities with exposure windows
`W_i = [entry_ts_i, horizon_end_i]` (P1: `horizon_end = entry + 5×24h`; P2
crypto: `entry + 720h`; P2 equities: the 30th session close), report at every
readout (monthly descriptive and final):

- **D1 — overlap incidence:** fraction of opportunities whose window overlaps
  at least one other opportunity's window.
- **D2 — pairwise overlap rate:** `|{(i<j) : W_i ∩ W_j ≠ ∅}| / C(n,2)`.
- **D3 — overlap-length distribution:** among overlapping pairs, the
  intersection length `|W_i ∩ W_j|` in hours — min / p25 / median / p75 / max.
- **D4 — concurrency:** the maximum and the mean number of simultaneously
  open exposure windows over calendar days.
- **D5 — overlap components:** union-find on positive window overlap → the
  component count K, the distribution of component sizes (opportunities per
  component), and the longest calendar span merged into one component.

These are **diagnostics only: they are reported alongside the interval and
never enter it.** They exist so a reader can see how much dependence the
interval had to absorb — not to adjust, shrink, or "correct" the interval.

**Planned-set expectation (pre-registered, not data).** P1 with ~daily
dossiers and 5-day windows → D1 ≈ 1: nearly every pair overlaps a neighbor,
and components will merge multi-week decision runs into single blocks. P2
crypto with 30-day windows → the same, more so. This expectation changes
nothing about the method; it states up front why the effective
independent-unit count is small **by construction**, so a wide interval at
readout is the honest measurement, not a surprise.

---

## §S2 P1 dependence method — block bootstrap over overlap-connected components

Binds P1. **Supersedes** the v1 §8.3 decision-date-block interval
*computation*. The §8.5 read-rule thresholds (+0.25 R screen, interval
excluding zero), the §8.5 scope cap ("warrants further testing" only — never
an improvement claim, never live inversion, never a model change), and the
§8.7 INSUFFICIENT EVIDENCE named outcome are **unchanged**.

1. **Blocks.** Union-find the n paired rows on positive 5-day
   exposure-window overlap (`W_i = [entry_ts_i, entry_ts_i + 5×24h]`) →
   components `C_1 … C_K`. Each component is the **union of overlapping
   exposures** — the dependence unit. Defined from entry timestamps only.
2. **Point estimate.** `d̄ = (1/n) Σ d_i`, where `d_i` is the paired
   inv-minus-orig **`barrier_exit_return_r`** difference (paired set: rows
   definitive in both arms; v2-pinned primary endpoint).
3. **Bootstrap.** B = 10,000 replicates. Each replicate draws K blocks with
   replacement; the replicate statistic is the **opportunity-weighted**
   mean: `(Σ d_i over pairs in the resampled blocks) / (pair count in the
   resampled blocks)`. The 95% interval is the percentile interval
   `(q_0.025, q_0.975)` of the replicate statistics — reported as an
   **approximate interval** (residual regime dependence across non-overlapping
   windows is real and unmodeled, which is exactly why the affirmative
   verdict stays capped at "warrants further testing").
4. **Blocks are resampling units, not weighting units.** The statistic inside
   every replicate is pair-weighted (§S4).
5. **Chaining honesty.** Components merge any run of decisions spaced < 5
   days apart. With daily decisions this yields few, large blocks and a wide
   interval. That width is the honest consequence of the dependence — it is
   not repaired by redefining blocks to be smaller.

**Reference implementation (stdlib only — implementable now, no outcomes needed):**

```python
import random
from datetime import timedelta

def overlap_blocks(entry_ts_list, horizon_h):
    # entry_ts_list: list of datetime (tz-aware); returns block id per row
    n = len(entry_ts_list)
    parent = list(range(n))
    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]; a = parent[a]
        return a
    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb: parent[ra] = rb
    H = timedelta(hours=horizon_h)
    for i in range(n):
        for j in range(i + 1, n):
            si, sj = entry_ts_list[i], entry_ts_list[j]
            if si < sj + H and sj < si + H:  # positive overlap
                union(i, j)
    return [find(i) for i in range(n)]

def block_bootstrap_interval(diffs, block_ids, B=10000, seed=20261014):
    # diffs: per-pair d_i; block_ids: block per pair (from timestamps only)
    rng = random.Random(seed)
    blocks = {}
    for d, b in zip(diffs, block_ids):
        blocks.setdefault(b, []).append(d)
    blist = list(blocks.values()); K = len(blist)
    stats = []
    for _ in range(B):
        samp = [rng.choice(blist) for _ in range(K)]
        vals = [d for blk in samp for d in blk]
        stats.append(sum(vals) / len(vals))
    stats.sort()
    return stats[int(0.025 * B)], stats[int(0.975 * B)]
```

---

## §S3 P2 dependence method — two-way cluster-robust SEs (dimensions stated)

Binds P2. Restates the frozen v4 §10a method with the dependence units
defined explicitly (no computation changes):

- **Dimension A — asset × window chains.** The dependence unit is the
  **union of overlapping exposures on the same asset**: two challenger
  entries on the same asset whose outcome windows overlap belong to the same
  unit, chained transitively. This absorbs repeated same-asset signals and
  same-asset shock exposure.
- **Dimension B — decision-week blocks.** Fixed 7-day blocks anchored
  `2026-10-14T00:00Z` — non-overlapping by construction, cannot chain.
- **Estimator.** All-rows OLS mean of net R with two-way
  Cameron–Gelbach–Miller cluster-robust variance
  (`V = V_A + V_B − V_{A∩B}`); the reported 95% CI is the two-way
  cluster-robust interval. **First-entry-only** remains the pre-registered
  robustness check.
- Both dimensions are computable from entry timestamps, asset identity, and
  window lengths **before outcomes are inspected**.

---

## §S4 Estimand — the per-opportunity mean (both protocols)

- **P1:** `μ = E[d_i]`, the per-opportunity mean paired inv-minus-orig
  `barrier_exit_return_r` difference over the prospective opportunity
  process (eligible dossier recommendations entering collection).
- **P2:** `μ = E[netR_i]`, the per-opportunity mean net R; comparator Δs are
  differences of per-opportunity means.

**Weighting (both):** every opportunity counts **exactly once** in the point
estimate and in every bootstrap replicate (P1) / in the OLS moment
conditions (P2). Blocks and clusters are resampling and variance units —
never weighting units.

**Explicitly rejected:** averaging decision-date means (or cluster means)
equally. That targets `E[date-mean]` — a different estimand that upweights
dates/clusters with few opportunities. The P1 v1 §8.3 phrase "computed over
block-level paired-mean differences" is clarified accordingly: blocks are
resampled; the statistic is pair-weighted.

---

## §S5 Minimum data — INSUFFICIENT DATA stays INCONCLUSIVE (both protocols)

- **P1:** the §8.5 read rule is evaluated at the final readout only when
  **paired n ≥ 20 AND K (overlap-component blocks) ≥ 5**. (Component count ≤
  decision-date count, so this is strictly stronger than v1 §8.6's "≥ 5
  decision-date blocks", which it supersedes; the n ≥ 20 floor is unchanged.)
  With K < 2 the interval is undefined. Below the requirement the outcome is
  **INSUFFICIENT EVIDENCE** (§8.7).
- **P2:** the frozen v4 gates (**≥ 20 clusters in each dimension**) **PLUS
  ≥ 40 rows total**. The row floor is new and strictly additional — it can
  only hold a verdict at INSUFFICIENT_EVIDENCE, never promote one. Below the
  requirement the outcome is **INSUFFICIENT_EVIDENCE**. The v4 extension
  contingency is unchanged.

**INSUFFICIENT DATA is INCONCLUSIVE.** It is not evidence for the model, not
evidence against it, and it is never upgraded to support or failure by a
small sample. The bar is never lowered to manufacture a verdict. No repeated
promotion testing without a pre-registered sequential rule — none is
pre-registered in either protocol (P1 §8.6 monthly readouts stay descriptive
only).

---

## What this amendment does not do

It does not change any read-rule threshold, any verdict label, any scope
cap, any cost scenario, any detector threshold, any entry/grading
convention, or any collection window. It pins, before any outcomes existed,
exactly how dependence is handled, what the interval targets, and when
there is too little data to say anything at all.
