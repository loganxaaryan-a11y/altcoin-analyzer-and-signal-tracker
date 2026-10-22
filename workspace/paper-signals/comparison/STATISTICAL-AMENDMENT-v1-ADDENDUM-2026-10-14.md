# ADDENDUM to Statistical Amendment v1 (2026-10-14) — UNRESOLVED FOR INFERENCE

**Amends nothing; rewrites nothing.** This is a dated addendum to
`STATISTICAL-AMENDMENT-v1-2026-10-14.md` (frozen 2026-10-14). The amendment
itself is left byte-identical. This addendum records two dependence problems
the amendment leaves unresolved, states their consequence for inference, and
states plainly what would be needed to resolve each — without implementing it.

**Status as of 2026-10-14: BOTH ITEMS BELOW ARE UNRESOLVED FOR INFERENCE.**
Evidence collection continues under the frozen rules. But **no statistical
acceptance may be claimed under these rules** — not a verdict, not a
"warrants further testing" screen pass, not a narrow interval — until each
item is resolved by a pre-registered, pre-outcome-inspection replacement.
An unresolved dependence structure means the interval's nominal coverage is
unknown in BOTH directions (it may be vacuous, or it may be overconfident),
and an unknown-coverage interval cannot support acceptance.

---

## U1. P1: daily five-day opportunities can collapse into ONE overlap component

**The problem.** Amendment §S2 builds dependence blocks by union-finding
opportunities on positive 5-day exposure-window overlap, chained
transitively. With ~daily decisions and 5-day windows, the amendment's own
pre-registered expectation (§S1: "components will merge multi-week decision
runs into single blocks") says the quiet part out loud: a run of decisions
spaced < 5 days apart chains into ONE block. At the limit — uninterrupted
daily collection — **K = 1: the entire prospective set is a single
overlap-connected component**, and the block bootstrap is undefined (there
is nothing to resample). Even short of the limit, K = 2 or 3 blocks makes
the interval degenerate: the bootstrap distribution is driven by a handful
of mega-blocks, and §S5's own floor (K ≥ 5) then forces INSUFFICIENT
EVIDENCE — not as a conservative verdict but as a permanent condition of
the collection cadence. The method, applied to the protocol's planned
daily cadence, is **inference-dead by construction**: it cannot ever reach
the data floor its own §S5 requires.

Worse, the failure mode is silent-adjacent: intermediate K values (say 4–8
huge blocks over months of collection) produce a nominal 95% interval whose
actual coverage rests on an independence-between-blocks assumption that
chaining has already falsified in spirit — blocks of 30–60 chained daily
decisions are not "independent units" in any sense a reader would
recognize, and the amendment's honesty clause (§S2.5, "chaining honesty")
admits the width without fixing the unit. A hard union-find threshold (any
positive overlap = same block) is the crudest possible dependence model:
it treats a 1-hour overlap the same as a 119-hour overlap, and it has no
vocabulary for dependence that decays with temporal distance.

**Consequence.** Recorded as UNRESOLVED FOR INFERENCE for P1. Collection
continues (rows are rows; the opportunity process is real), diagnostics
(§S1) continue to be reported, but no statistical acceptance — including
the capped "warrants further testing" scope — may be claimed under the
§S2 block bootstrap.

**What would resolve it (not implemented).** A dependence model that does
not chain: e.g. a kernel/HAC-style approach where block membership decays
with temporal distance instead of a hard transitive union (overlapping
windows contribute with weights, not binary membership); or a parametric
model of the decision process (e.g. modeling the opportunity arrival and
its autocorrelation directly); or a design change — spacing decisions so
exposure windows separate (which changes the protocol's cadence, not its
statistics, and would need its own pre-registered amendment). Any
replacement must be specified before outcomes are inspected, must keep the
§S4 per-opportunity estimand, and must survive the pre-registration test
the v1 freeze attestation sets: computable from entry timestamps alone,
chosen from the window structure, not from results.

---

## U2. P2 (Challenger A): weekly clusters miss shared shocks across assets AND across weeks

**The problem.** Amendment §S3 (adopted by Challenger A via the v5
amendment, binding B2) uses two-way cluster-robust SEs: Dimension A = same
asset × overlapping-window chains; Dimension B = fixed 7-day blocks
anchored 2026-10-14T00:00Z. This structure misses two real dependence
channels:

1. **Shared shocks across different assets.** A market-wide event (a BTC
   flush, a macro print, an exchange outage) hits many assets'
   simultaneously-open exposure windows at once. Dimension A clusters by
   asset, so a shock common to BTC, ETH, and SOL entries is treated as
   three independent pieces of evidence. Dimension B clusters by week, but
   only within-week: the cross-asset correlation is absorbed only insofar
   as same-week co-movement happens to be captured by the week block — and
   the two-way CGM formula (`V_A + V_B − V_{A∩B}`) assumes the two
   dimensions' intersection fully describes their joint structure, which a
   cross-asset shock does not respect. The direction of the error is
   **overconfidence**: SEs too small, intervals too narrow, acceptance too
   easy. This is the opposite failure from U1 (which errs toward vacuous
   width) and the more dangerous one for a challenger whose job is to avoid
   false promotion.
2. **Shared shocks across weeks.** Dimension B's fixed 7-day blocks "cannot
   chain by construction" — which is exactly the problem for a shock that
   doesn't respect the anchor. A regime that starts Thursday and runs into
   the following Wednesday is split across two week-blocks and treated as
   two independent clusters. The amendment chose the anchor
   (2026-10-14T00:00Z) pre-outcome, which is honest, but honesty about the
   anchor doesn't fix the boundary: dependence doesn't end at midnight
   Sunday because the block grid says so.

**Consequence.** Recorded as UNRESOLVED FOR INFERENCE for P2 / Challenger
A. Collection and grading continue (the first-touch machinery and the
finer-evidence rules are unaffected — this is purely about the inference
layer), the §S1 overlap diagnostics continue to be reported at every
readout, but no statistical acceptance — no SUPPORT, no
FAILURE_TO_MEET_CRITERION, and no "warrants further testing"-style
promotion — may be claimed under the §S3 two-way cluster intervals.

**What would resolve it (not implemented).** Cross-asset shock controls,
pre-registered before outcomes are inspected, e.g.: a third clustering
dimension on event-time (common-shock dates) or Driscoll–Kraay SEs, which
are robust to cross-sectional dependence and serial correlation by
construction; or market-factor residualization (regress each opportunity's
net R on a market factor first, then cluster the residuals — which moves
the common shock out of the error term instead of pretending the clusters
absorb it); or widening Dimension B to regime-aware blocks. Any
replacement must be chosen from the exposure-window structure and the
asset universe alone — not from observed cross-asset co-movement in the
outcome data — and must keep the §S4 per-opportunity estimand and the §S5
minimum-data floors (which can only hold a verdict at
INSUFFICIENT_EVIDENCE, never promote one).

---

## What this addendum does not do

It does not change any method, threshold, verdict label, scope cap, or
collection rule in the frozen amendment or in the protocols that adopt it.
It does not implement, specify, or pre-register any replacement method —
the "what would resolve it" paragraphs are requirements statements, not
designs, and none of them is authorized. It records, with today's date,
that two dependence problems are known, named, and unresolved, so that no
future readout can claim a statistical acceptance under rules whose
dependence handling was known-broken when the claim was made. Evidence
collection continues; inference waits.
