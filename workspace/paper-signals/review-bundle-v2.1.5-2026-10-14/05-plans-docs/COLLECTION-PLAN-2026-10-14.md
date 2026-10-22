# Prediction Comparison — Fixed Collection & Readout Plan

**Workstream C · 2026-10-14 · freeze manifest v2.1.0**
(`goals/research-terminal/paper-signals/comparison/freeze-manifest-v2.1.0.json`)

Sandbox/research only. Paper signals only. No brokerage. No strategy changes.
Holdouts locked. This plan changes NOTHING about the frozen models — it
governs how comparison rows are collected and read out. The measurement
audit `MEASUREMENT-GAPS-2026-10-14.md` is authoritative; its verdicts are
encoded in the v2.1.0 manifest and referenced here.

## 1. Fixed collection window (no target-N logic)

- **Collection window: 2026-10-14 → 2026-12-31 (inclusive, UTC).**
- **Crypto outcome windows close: 2027-01-30** (last issuance 2026-12-31 +
  30 elapsed days, the frozen crypto barrier-walk cap). Unchanged.
- **Equity outcome windows close: 2027-02-17 (16:00 ET)** — computed under
  the frozen equity evaluator's exact rule: the close of the 30th XNYS
  session after the latest possible entry session (signal date 2026-12-31
  → entry 2027-01-04 → 30th session 2027-02-17). Full derivation in
  EQUITY-MATURITY-SCHEDULE-2026-10-14.md; this computation (expert
  correction 1, 2026-10-14) replaces the audit's signal-date +47-calendar-
  day substitution and closes the former §9 conflict — a calendar
  calculation, not a decision.
- **Readout computed by: 2027-02-24** — after the final equity outcome is
  due (2027-02-17 16:00 ET), computed, not chosen. Computed floor
  2027-02-18; adopted buffer +7 calendar days (the plan's prior 7-day
  post-close convention; the buffer itself is the one stated judgment
  call, documented in the maturity schedule).
- **The window is FIXED. The readout happens REGARDLESS of N** — even N=0
  (in which case every metric reads n=0 / INCONCLUSIVE).
- There is NO "collect until 30 definitive rows qualify" logic anywhere in
  this program. The v2.0.0 manifest's target-N criteria (n>=30 gate,
  INCONCLUSIVE "continue collecting" clause) are REMOVED by the v2.1.0
  freeze itself — no plan-level supersession is needed anymore. See §8 for
  what was found and removed/replaced.

**Why these dates:** they mirror the H-2 trial window exactly (same program,
same 30-calendar-day evaluator horizon, same team cadence). The comparison
inherits H-2's timing rather than inventing a parallel calendar.

## 2. Row eligibility — the eligible stream

A comparison row enters the collection dataset iff ALL of:

1. **Prospective origin.** The candidate is scored by the paper pipeline
   through `comparison/harness.py` (`score_pair`/`score_batch`) during the
   collection window. `row_origin` marks provenance. Rows decided before the
   v2.1.0 freeze (`freeze-manifest-v2.1.0.json` `frozen_at_utc`) are
   RETROSPECTIVE: they live in `rows/cohort-retrospective-v2.csv` with
   retrospective accounting, and NEVER enter the prospective file. The
   prospective vessel is `rows/cohort-prospective-v2.csv` (header-only at
   freeze time); rows arrive via the collector, never by hand-edit.
2. **Both arms scored from decision-time inputs.** The row carries the
   persisted factor ledger; production's recorded direction/score is
   reproduced from that ledger by the harness (fidelity check); the C-2
   challenger is computed from the same ledger minus Momentum. Rows where
   production does not reproduce (`unscored:production-unreproduced`) or the
   ledger is absent (`unscored:no-factor-ledger`) are RETAINED with their
   reason codes — they count toward opportunity coverage (§4), never toward
   graded metrics.
3. **Decision-time status labeled.** `decision_time_verified` per the
   harness rule (any factor `asOf` later than `decision_at` →
   verified=false; missing `asOf` → labeled, never assumed). Under the
   strict rule, date-only/midnight-normalized `asOf` values do NOT count as
   verified decision-time evidence. Rows failing verification stay in the
   dataset with the flag visible; they are not silently dropped.
4. **Scope and cohort split.** The paired production-vs-C-2 comparison is
   **crypto-terminal only** (the freeze specifies no equity challenger;
   equity rows score `c2_disposition = not-applicable:no-challenger-frozen`).
   Equity rows may still be collected for production-side measurement but
   are outside the paired comparison. Reporting follows the cohort rule
   (§4): **Cohort P (crypto paired)** and **Cohort E (equity
   production-only)** are reported separately, never pooled into one N
   without the split alongside.

**Primary accounting** (per metric; the audit's primary economic comparison,
MEASUREMENT-GAPS-2026-10-14 §(d)): one opportunity = one comparison row.
Per-arm contribution: `issued` + graded → the arm's graded net R; `issued`
but ungraded/unverifiable (time_exit, ambiguous, unverified, open,
not-graded) → UNKNOWN; genuine abstention (`abstain:*` — the arm evaluated
the issuance decision and declined) → **0.000 R exactly, zero cost** (a real
zero that participates in the mean); never evaluated (`unscored:*`) or no
counterpart (`not-applicable:*`) → UNKNOWN. UNKNOWN is counted and labeled
per metric, excluded from that metric's interval — never scored as 0, never
silently dropped. The primary comparison is the mean of d = c(C-2) −
c(production) over opportunities where neither arm is UNKNOWN, with the §3
cluster-robust 95% interval. The both-issued-only comparison is the
SECONDARY sensitivity check.

**Entry contract:** `actionable-entry-v1` (freeze-manifest-v2.1.0.json
`operational_rules.entry_contract`) — decisionAt/sourceObservedAt/
entryObservedAt/receipt-time separation; per-terminal entry rule (crypto:
first-post-decision-binance-spot-trade; equity:
next-xnys-regular-session-open-print); 15-min crypto entry window; drift
caps 1.50 crypto / 0.50 equity; 5-min observation-age limit; venue mapping
(binance-spot for crypto); anti-fabrication rule (entryPrice only on a
subsequent observable venue trade or cost-adjusted quote).

**Issuance-path veto (repaired):** `runQualificationChecks` at qualification
(pipeline-order guard — the veto grades the FINAL published stop;
setup-history filter — pre-decision extremes are features, never stop-outs;
entry-zone rules) and `checkWaitingInterval` over the genuine
[contract.decisionAt, entryObservedAt] window at entry observation ("a touch
is a touch", fail-closed). The legacy born-dead veto (pre-decision
setup-history extremes graded as stop-outs) is SUPERSEDED on the issuance
path; it must not be read back in as a gate. (veto/src/waiting-interval.ts,
orchestrator/src/issuance/handler.ts — hashes in freeze-manifest-v2.1.0.)

**Assumptions:** the pilot's collection emits each signal event once (the
harness does not de-duplicate; clustering absorbs cross-row dependence but
repeat emissions of the same exposure would still weight the point
estimate); costs are the frozen 18 bps model; outcome grading runs under
the frozen evaluator versions named in the freeze.

## 3. Uncertainty method — cluster-robust (H-2-consistent)

Paired differences (C-2 minus production) are not independent — rows
sharing market exposure co-move. Comparison verdicts are read ONLY from
cluster-robust intervals:

- **Grouping rule** (adapted from H-2 §6; links use decision-time fields
  only — symbol, `issued_at`, production direction — NEVER outcomes):
  1. **same symbol → same cluster** (asset-specific exposure);
  2. **same production direction + `issued_at` within 7 days + 30-day
     outcome windows overlapping ≥ 20 days → same cluster** (shared
     market-regime exposure).

  Clusters are the connected components under these links (union-find).
  "Market period" for the comparison = the 30-calendar-day outcome window
  (`issued_at` → `issued_at` + 30d); the d5/d14 horizons nest inside it, so
  the rule is stated once for all metrics. Production direction is the
  grouping key — the challenger deviation is the treatment, not the
  exposure; using it keeps grouping outcome-independent by construction.
  Rows missing symbol or `issued_at` cannot be linked and form singleton
  clusters.

  (Note: for 30-day windows, "issued within 7 days" already implies
  overlap ≥ 23 days; the ≥ 20-day overlap clause is kept for fidelity with
  H-2 and robustness if the horizon ever changes under a new freeze.)

- **Interval (Liang–Zeger one-way cluster variance):**
  Var(dbar) = [G/(G−1)] · (1/n²) · Σ_g S_g², where S_g = Σ_{i∈g}(d_i − dbar),
  G = number of clusters, n = graded rows; SE = √Var;
  95% CI = dbar ± t_{G−1,0.975} · SE.
  Pairing already removes within-opportunity dependence (both arms evaluate
  the identical opportunity); clustering removes the identified
  cross-trade dependence.

- **Minimum G = 10 clusters for a reported interval.** With fewer clusters
  the SE is downward-biased and t critical values unstable. **Fewer than
  10 clusters → INCONCLUSIVE on that metric: no interval reported**
  (point estimate shown for reference only, labeled as such).

- **Assumptions:** clusters are approximately independent;
  within-cluster dependence is unrestricted.
- **Limitations:** cross-cluster market-wide co-movement remains unmodeled.
  Cluster-robust SEs correct the variance; they do not remove bias from
  repeat emissions of the same exposure (§2 assumption).

Implemented in `comparison/metrics.py`: `assign_clusters`,
`cluster_mean_interval`, `t975`, `direction_disagreement`,
`compare_primary`, `arm_contribution`. The per-arm Wilson 95% CIs in the
report are DESCRIPTIVE ONLY (within-arm, independence-assuming) — verdicts
are never read from them.

## 4. Metrics reported at readout (per-arm and paired)

**Cohort rule (mandatory):** every figure, table, or readout that touches
both cohorts displays the split — `Cohort P (crypto paired): n=...` and
`Cohort E (equity production-only): n=...` — with the cohort definitions. A
combined "n" may appear only as a dataset-size line, never as the
denominator of a metric, and never without the split adjacent. Rationale:
pooling would average a paired challenger comparison with a challenger-less
production-only cohort — a category error that inflates N and silently
dilutes the paired result.

Per arm (production, C-2) — descriptive:
- **Opportunity coverage:** issued / abstain / unscored fractions of the
  eligible stream, with reason-code breakdown (per §2, all dispositions
  retained).
- **Target-before-stop rate:** target-first fraction among barrier-resolved
  rows; barrier outcome counts reported separately.
- **Directional accuracy:** hit fraction among graded rows, per horizon
  d5 / d14 / d30.
- **Net R:** mean net R per issued row, 18 bps roundtrip modeled, with
  missing-outcome count.
- **Alert delay:** `issued_at − decision_at` distribution in hours, where
  both timestamps persisted (descriptive; not a decision metric).

**PRIMARY (Cohort P)** — cluster-robust 95% interval per §3, gated on
G ≥ 10:
- **Net R gap** — mean per-opportunity d = c(C-2) − c(production) over
  opportunities where neither arm is UNKNOWN (genuine abstentions as real
  zeros; UNKNOWN counted, labeled, excluded). This is the primary economic
  comparison.
- The both-issued-only net R gap is the SECONDARY sensitivity check,
  reported alongside.

Paired, descriptive/second-order (Cohort P) — cluster-robust 95% intervals
per §3, each gated on G ≥ 10:
- **Target-before-stop gap** (among barrier-resolved paired rows).
- **Directional accuracy gap**, per horizon d5 / d14 / d30.
- **Direction disagreement rate** with the §5 audit-trigger flag.

**Cohort E (equity)** — production-only: opportunity coverage, ledger-score
distributions, and the mean per-opportunity production contribution over
opportunities where production is not UNKNOWN (genuine abstentions as
zeros). No paired gap is computable; none is reported.

Verdict language: SUPPORT / REJECT / INCONCLUSIVE are read from the
PRIMARY paired cluster-robust interval only. Any metric with G < 10 reads
INCONCLUSIVE (no interval). N appears in every metric as a reported count
— never as a collection gate.

## 5. Direction-disagreement rule — audit trigger, not bug proof

If the two arms' direction calls disagree on **more than 40% of paired
issued rows with both directions present**, that is an **AUDIT TRIGGER** —
not proof of an implementation bug, not a strategy difference, and not a
freeze change. The trigger fires on direction calls (decision-time data),
so it may fire during collection without violating the no-peeking rule.

The audit examines, in order:

(a) **Factor-configuration concentration:** does disagreement concentrate
    in specific factor configurations (e.g. large |Momentum| contribution,
    near-threshold agreement scores, particular factor coalitions)? Report
    the configurations and their disagreement rates vs the rest.
(b) **Harness fidelity check:** does the harness reproduce production's
    recorded direction from the persisted ledger on the disagreement rows?
    (`prod_reproduced` field.) If reproduction fails on disagreement rows,
    the fault is in scoring/ledger plumbing, not in the models.
(c) **Shared market conditions:** do disagreement rows share market
    conditions (realized volatility, trend regime, BTC-dominance regime at
    issuance) that agreement rows do not? Report the condition
    distributions for disagree vs agree.
(d) **Definition drift from the freeze:** has either arm's direction
    definition drifted from freeze v2.1.0 (formula, factor set, weights,
    thresholds, level construction)? Re-derive both arms' directions from
    the manifest parameters on the disagreement rows and diff against the
    harness output.

The audit produces a **written finding** (which of (a)–(d) explains the
disagreement, with numbers). It does not change the freeze, the models, or
the collection window. If the audit finds an implementation bug, the fix
goes through a new freeze version — it is never patched into v2.1.0.

## 6. Interim reporting — counts only, no outcome peeking

During collection (2026-10-14 → 2026-12-31) the ONLY things that may be
reported:

- rows collected (n), disposition mix per arm, reason-code counts;
- direction disagreement fraction and audit-trigger status;
- `decision_time_verified` fraction; cluster formation counts (G so far,
  informational only).

**Forbidden during collection:** barrier outcomes, directional accuracy,
net R, or any market-graded summary of either arm — anything that grades
the arms against realized prices. Outcome columns stay `not-graded`/
`pending`/`open` until the window closes.

**No-tuning rule (explicit):** NOTHING observed during collection —
counts, disagreement rates, or (after the window) outcomes — may motivate
changes to model thresholds, weights, factors, gates, or costs. Any model
change requires a NEW freeze manifest version. The freeze is changed by
versioning, never by editing v2.1.0 in place, and never in response to
accumulating results.

## 7. Open items (not decided here)

- **CLOSED (2026-10-14, expert correction 1):** the former equity
  outcome-close conflict (plan's 2027-01-30 vs the audit's +47-derived
  2027-02-16) is resolved as a calendar computation, not a decision. The
  frozen evaluator's exact rule (entry-anchored; 30 XNYS sessions exclusive
  of the entry day) computes an equity close of **2027-02-17** and a
  readout-by of **2027-02-24**. See §9 and
  EQUITY-MATURITY-SCHEDULE-2026-10-14.md.
- Support/reject effect-size bars for the paired gaps (the v1.0.0 criteria
  named 10pp / 0.15 R bars under the old N-gate; their window-based
  restatement is parent's call at readout design).
- Whether the pilot's collection layer (outside this harness) de-duplicates
  repeat signal events (§2 assumption).
- Whether to backfill the 296 suppressed-stream candidates into a scored
  dataset (audit §(d) open data item): each would contribute a genuine-
  abstention zero on the production arm in the primary comparison. The
  retrospective cohort file already carries them with retrospective
  accounting; appending to the prospective file is a parent/Logan decision.

## 8. What "collect until N" logic was found and removed

1. `comparison/metrics.py` — `compare()`'s `readout_note` read
   "…needs n>=30 paired definitive rows with graded d30 outcomes".
   REPLACED with the fixed-window note (collection 2026-10-14 →
   2026-12-31 UTC, readout by 2027-02-06 regardless of N; verdicts from
   paired cluster-robust intervals, G ≥ 10 per metric). The paired
   cluster-robust readout (`paired_cluster`, `direction_disagreement`)
   was added in the same edit.
2. `comparison/seed_rows.py` — final console line read "guardrail: >40%
   pauses readout". REWORDED to the §5 audit-trigger semantics.
3. `freeze-manifest-v1.0.0.json` — `readout_criteria` (`n >= 30 …`,
   "…→ continue collecting") and `flip_guardrail` ("pause readout").
   NOT EDITED (immutable; self-hashing). SUPERSEDED by §§1 and 5 of this
   plan, stated explicitly here.
4. `comparison/harness.py` — no target-N logic found; untouched.
5. `comparison/README.md` — pointer to this plan added; guardrail wording
   aligned with §5.
6. **`freeze-manifest-v2.0.0.json` — superseded by v2.1.0 (2026-10-14).**
   The target-N criteria and the disagreement-as-bug `flip_guardrail`
   wording are REMOVED by the v2.1.0 freeze itself (see
   `FREEZE-v2.0.0-SUPERSEDED.md`); no plan-level supersession is needed
   anymore. The old born-dead issuance-path gate is removed from the model
   gates and restated as the repaired waiting-interval veto.
7. `comparison/metrics.py` (v2.1.0) — implements the audit's PRIMARY
   economic comparison (`compare_primary`, `arm_contribution`): genuine
   abstention = 0.000 R real zero, never-evaluated = UNKNOWN
   (counted/labeled/excluded); both-issued-only is now the secondary
   sensitivity check. Cohort split enforced in `compare()`.

Tests: `comparison/tests/run_tests.py` — 86/86 passing after the changes
(80 pre-existing incl. the four asserted RULES 1–4 tests + 6 new primary-
accounting tests).

## 9. RESOLVED — equity outcome close (computed 2026-10-14)

**The former conflict.** Earlier versions of this plan fixed "All outcome
windows close: 2027-01-30" — that date = last issuance 2026-12-31 + 30
calendar days, the frozen CRYPTO evaluator's cap
(`crypto-evaluation-v5-corrected`, 30 elapsed days). The audit's
signal-date +47-calendar-day substitution implied a 2027-02-16 equity
close. Both were recorded as UNRESOLVED here pending a decision.

**The resolution (expert correction 1): this is a calendar calculation,
not a decision.** The frozen EQUITY evaluator (`equity-eval-3.3.0`) does
not anchor on the signal date at all — `evaluateEquityTradeSetup` builds
`expectedXnysSessions(signal.entryAt, 30)`: the 30 XNYS sessions strictly
after the NY-calendar date of the entry instant, with the horizon closing
at the 30th session's close. Combined with the frozen entry rule
(`next-xnys-regular-session-open-print`; entry window expires at that
next session's close):

- latest signal date 2026-12-31 (Thu) → latest entry session 2027-01-04
  (Mon; 2027-01-01 holiday, 01-02/01-03 weekend) → 30th XNYS session
  **2027-02-17** (Wed, regular close 16:00 ET) — 48 calendar days from the
  signal date, one day later than the +47 backstop, because the backstop
  missed the entry rule's session-hop across the New Year weekend.
- **Equity outcome windows close: 2027-02-17 (16:00 ET).**
- **Readout by: 2027-02-24** — computed after the final outcome is due
  (floor 2027-02-18; +7-day buffer per the plan's prior convention, the
  one stated judgment call).

Full derivation, calendar provenance, and the per-row formula:
EQUITY-MATURITY-SCHEDULE-2026-10-14.md. The crypto close (2027-01-30) and
the crypto readout rule are untouched; the cohort-wide readout follows the
equity close as the binding constraint.

## 10. Quarantine — the retrospective file has no read path into pilot stats

`rows/cohort-retrospective-v2.csv` (356 rows: 60 pilot + 296 suppressed-
stream dry-run reproduction, with retrospective accounting per the audit
rules) has NO read path into pilot statistics or the prospective file:

- `collect_pilot_rows.py` reads exactly one input path, hardcoded as
  `PILOT_CSV = rows/comparison-rows-pilot-2026-10-14.csv`. It performs no
  globbing or directory discovery (no `glob`/`listdir` in the file —
  grepped 2026-10-14), and `validate_candidate` refuses non-`pilot` row
  origins and the v1 paths.
- `metrics.py::read_rows(path)` takes an explicit CSV path argument; no
  file is hardcoded, and nothing discovers `cohort-*` or `retrospective`
  paths.
- Nothing on disk currently names the retrospective file, so the only way
  it could enter pilot statistics is an explicit future code change.

The retrospective file is a separate readout dataset (retrospective
accounting per the rules above), never an input to collection or to pilot
metrics. If future work needs it fed anywhere, that is a named decision —
the v2.1.0 consolidation workstream enforces this boundary. No pipeline
code was rewritten in this step (per the task: noted, not changed).
