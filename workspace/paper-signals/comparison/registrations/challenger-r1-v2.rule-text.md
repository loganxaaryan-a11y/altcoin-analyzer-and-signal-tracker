# Challenger-R1 — registered rule text (registration challenger-r1-v2)

Registration id: challenger-r1-v2
Registered (frozen) at: 2026-10-21T07:08:55Z
Status: SHADOW ONLY. This registration changes nothing in production. The
frozen production model (paper-pilot lineage, handler 2.1.9) issues exactly
as before; its decisions are never altered, rescored, or relabelled by this
registration. Locked holdouts are untouched and unread. All scoring under
this registration is prospective: only candidates whose decision instant is
at or after the registration time above are scored. No candidate decided
before registration is ever backfilled.

## Relation to challenger-r1-v1 (preserved as history)

This registration SUPERSEDES challenger-r1-v1 (frozen 2026-10-21T06:00:00Z)
prospectively from the freeze time above. V1's rule text, registration
record, and any records are preserved exactly as written; nothing scored
under v1 is re-labeled or re-scored under v2. (At this freeze, v1's shadow
ledger holds zero records: no candidate decided at or after v1's freeze had
been collected before v2 superseded it. V1 accrual is closed.) The semantic
amendments in v2 — reference receipt labeling, the R2 UNVERIFIED code, the
completed R4, the corrected attainable-maximum arithmetic, per-pair version
records, pre-registered comparison math, and shadow-book evaluator
enrollment — exist because v1's text could not be amended: any rule-text
change voids a registration and requires a new one. This is that new one.

Baseline arm: the production qualification pipeline exactly as deployed at
each candidate's decision (its freeze version, mapping version, and
executable hashes are recorded per pair — see "Per-pair version records"),
with its recorded dispositions as the baseline treatment for every paired
candidate.

Challenger arm: the same pipeline with ONLY the component changes R1, R2,
R4 below, plus the measurement-only recording R3 and the shadow-book
evaluator enrollment. Everything not listed is identical to the baseline:
factor weights (Trend 20, Momentum 15, Volatility 10, Volume 15,
Positioning/funding 10, Network fundamentals 15, Supply overhang 15;
nominal total 100), the absolute qualification bar of 60, the -10 redundancy
adjustment (applied when Trend and Momentum both pass), venue mapping and
its deferrals, the 900-second entry window, the 50 bps drift band size,
settlement geometry (+/-1.5R / +/-2.5R, 18 bps, first-touch TOUCH, 30-day
cap), and every strict validity check.

## Component activation and eligibility (explicit)

| Component | Active under v1 from | Active under v2 from | Eligible population |
|---|---|---|---|
| R1 drift re-anchor | 2026-10-21T06:00:00Z | 2026-10-21T07:08:55Z | Candidates whose baseline ran a drift test (a venue checkpoint exists) or that the baseline issued; decision instant >= the active registration's freeze. |
| R2 level provenance | 2026-10-21T06:00:00Z | 2026-10-21T07:08:55Z | Every scored candidate carrying frozen levels (stopPrice / invalidation). |
| R3 score transparency | 2026-10-21T06:00:00Z | 2026-10-21T07:08:55Z | Every scored candidate carrying a factor ledger. |
| R4 ATH contextual | registered in v1 but INERT (fields absent; no divergences, no dispositions beyond per-candidate `unverified`) | 2026-10-21T07:08:55Z (fields joined; component live) | (a) every scored pilot candidate, and (b) the upstream population: every asset the discovery run evaluated at or after its chart stage that did NOT become a pilot candidate — explicitly including assets excluded upstream by the old ATH rule before pilot scoring (see R4). |

A component never applies to a candidate decided before its activation
under the registration doing the scoring. Eligibility is per candidate, not
per batch: a batch may contain candidates eligible for different components
only via the decision-instant guard, which is uniform (decision >= freeze).

## R1 — Drift reference re-anchor, with reference timing honesty

Current (baseline) rule: entry drift is measured against the discovery
scan's price observation (decisionReferencePrice, observed ~126-149 s
before the decision instant in the prep sample).

Registered challenger rule:
- The drift reference is the LAST admissible venue trade print at or
  before the decision instant, for the candidate's mapped instrument, on
  the candidate's mapped venue.
- Reference capture definition: an aggregate-trades query against the
  mapped venue's public aggTrades endpoint over the window
  [decision instant - 900 s, decision instant]. The reference is the print
  with the greatest venue timestamp that is <= the decision instant. Only
  prints whose venue timestamp is <= the decision instant are admissible.
- Reference timing record (mandatory, per candidate): the capture records
  reference price, venue trade id, print venue timestamp, age of the print
  at the decision instant, the fetch window, the response hash, AND the
  fetch's own timing: `fetch_started_at` and `fetch_received_at` (the
  scorer's wall clock when the query was issued and when the complete
  response was in hand).
- Receipt verification: `receipt_predecision_verified` is true ONLY when
  `fetch_received_at <= decision instant` — i.e., the reference data was
  actually in hand before the decision froze (a live capture from the live
  path). The record's `reference_basis` is then `live_capture`. In every
  other case the basis is `historical_reconstruction` and the record is
  labeled `reconstructed`: the prints themselves are pre-freeze venue data
  (their venue timestamps prove existence and observability before the
  freeze), but OUR receipt of them came after the decision.
- A reconstructed reference NEVER counts as a pre-freeze capture in the
  comparison. Drift divergences grounded on a reconstructed reference are
  recorded with divergence class `mechanics_proof_only`: they demonstrate
  the mechanism and mature in the shadow book (with the basis label carried
  into the outcome record), and they are reported separately from — never
  pooled with — live-capture divergences in every comparison report. Only
  live-capture drift divergences enter the paired-comparison divergence
  count for the drift component. (Operational fact, stated at
  registration: the vessel's collection runs hours after decisions, so
  drift evaluations under the current wiring are historical
  reconstructions until a live capture step is wired near decision time.
  The run-135 COMP dress rehearsal under v1 was likewise a reconstruction
  and is not, and was never entered as, prospective proof.)
- Independent entry-print selection: the challenger's entry print is
  selected by the challenger itself from venue data under this rule — the
  FIRST venue print with venue timestamp strictly after the decision
  instant and at or before decision instant + 900 s, from the same
  aggTrades source — never copied from the production checkpoint (the
  production print's id, price, and timestamp are recorded alongside for
  comparison; a difference between the two selections is recorded, not
  reconciled away). If no print exists in that window, the challenger's
  entry selection is `no_print_in_window` and the drift component mirrors
  the baseline's first-print outcome without a divergence. Drift =
  |challenger entry print - reference| / reference, band 50 bps (or the
  candidate's recorded permitted drift where the record carries one),
  entry window 900 s.
- If no admissible reference print exists in the capture window, if the
  fetch fails, if the response page truncates the tail of the window so
  the last pre-decision print cannot be established, or if the mapped
  venue has no supported capture path, the drift component is UNVERIFIED
  for that candidate (component-level abstention). A later (post-decision)
  print is NEVER used as the reference, silently or otherwise; there is no
  fallback anchor.
- The scan price remains recorded for provenance and for the score; it no
  longer anchors the challenger's drift test.
- Where the baseline never ran a drift test (candidate stopped before the
  print stage and not issued), the component is not_applicable and creates
  no divergence.

## R2 — Level provenance labeling (measures provenance only)

What R2 is, stated plainly: R2 MEASURES AND LABELS the provenance of the
frozen invalidation level. It does not validate the level's construction
beyond the recorded-derivation compatibility checks below, it does not
repair any level, and it never changes a disposition: strict rejection is
preserved in full — a wrong-sided level rejects under the challenger
exactly as under the baseline. No level is clamped, adjusted, moved, or
given a tolerance band, ever.

For every eligible candidate, the shadow record carries a per-level
provenance record: the invalidation level, the reference price, the
reference's source-as-of, the direction-aware geometry verdict
(correct_side / wrong_side against the reference), whether a derivation
(source, derivation window end, formula id) is recorded, whether a
recorded derivation is compatible (window end <= reference source-as-of,
same venue), and a classification drawn from exactly these codes, assessed
in this order:
- `malformed`: DEMONSTRATED invalid construction — a derivation IS
  recorded and is shown incompatible (derivation window end after the
  reference's source-as-of, or a derivation venue different from the
  reference venue). Reserved for demonstrated invalidity only.
- `unverified`: the derivation is MISSING (no recorded source, window end,
  or formula id), or the only crossing evidence was not observed at or
  before the decision instant. Missing derivation is UNVERIFIED, never
  malformed: absence of provenance is not proof of invalid construction.
- `already_crossed`: geometry wrong_side AND the derivation is recorded
  and compatible AND pre-decision price evidence (the reference
  observation itself, observed at or before the decision instant) shows
  the price already beyond the level at decision time. Construction
  evidenced as valid; the setup was already invalidated — a strategy
  outcome, not a construction defect.
- `ok`: geometry correct_side AND the derivation is recorded and
  compatible.
A correct_side level with missing derivation is classified `unverified`
(geometry recorded alongside); an ok/unverified distinction therefore
exists on both geometries. Divergence kind remains `reason_split` where
the baseline recorded invalid_frozen_levels: the challenger records which
code applies, with the per-level inputs. Where the baseline did not reject
on levels, R2 records provenance only. (V1's code set, in which missing
derivation was labeled `malformed`, is superseded by this section for all
v2 records; v1's text stands as written for v1.)

## R3 — Attainable-score transparency, corrected (measurement only)

For every scored candidate the shadow record carries: the factor-sum,
whether the -10 redundancy adjustment applied, the production score
(recomputed and cross-checked against the recorded production score; any
mismatch is flagged as a data-quality divergence, never silently
overwritten), `measured_weight_sum`, `attainable_max_score`, the list of
dark factors, and the attainable-normalized score (production score /
attainable_max_score).

Terminology, corrected: `measured_weight_sum` is the sum of the weights of
the factors that returned a measured reading for that candidate (a factor
is dark only when its recorded status is "unavailable"; a "neutral"
reading is measured). V1 called this quantity "attainableScore" and the
registration text called it the attainable maximum; that was a
mislabel — it ignores the scoring rules themselves. `attainable_max_score`
is the corrected quantity: the maximum production score reachable under
the scoring rules as implemented — factor contributions by status,
INCLUDING the -10 redundancy interaction — given exactly the candidate's
set of measured factors. It is computed over the registered
state-to-contribution map (Section A): each measured factor may take any
status in its map row; the maximum is taken over all joint states, with
the -10 applied exactly when Trend and Momentum both take `pass`. A
measured factor whose status on some candidate is absent from the
registered map contributes, for that candidate's computation only, its
own recorded contribution as its best state, and the new state is flagged
as a data-quality divergence (the map is never silently extended; adding
a state is a registration amendment).

Worked consequence (Section A, verified on the 49-candidate core sample):
with Trend and Momentum both measured, the pair's best joint contribution
is 28 (Trend pass 20 + Momentum mixed 8, no tax) — NOT 35 - 10 = 25, and
NOT the 35 the tax-free sum implies. With Network dark (15) and Volatility
/ Volume / Supply at pass, attainable_max_score = 28 + 10 + 15 + 15 +
(Positioning best measured contribution 0) = 68 for BOTH sample shapes
(Positioning measured-neutral and Positioning dark alike, because
Positioning's only observed measured state contributes 0). The bar of 60
is therefore 88.2% of the attainable maximum for every candidate in the
core sample. V1's figures (85 / 75; bar = 70.6% / 80.0%) are
measured-weight sums, retained per candidate as `measured_weight_sum`
for continuity, and are NOT attainable maxima.

The challenger's dispositions use the unchanged absolute bar of 60.
Separately, as shadow data only, the record states the disposition that
would result under attainable-normalized bars of 0.75 and 0.80 (normalized
against attainable_max_score). These normalized dispositions never affect
the challenger's registered disposition. No formula change.

## R4 — ATH gate: blanket exclusion to contextual evidence (completed)

Current (baseline) rule: the discovery chart gate hard-rejects an asset
trading >= 75% below its all-time high (no ATH date recorded); a +15%/48H
velocity burst independently bypasses the gate.

Registered challenger rule:
- The hard rejection is removed. For every member of the R4 population,
  the record carries athDistancePct, athDate, priceVsSma50 (relation and
  %), and trend20d (%), each with its source and as-of (below).
- A hard exclusion is retained ONLY for the conjunction: >= 75% below ATH
  AND price below its 50D SMA AND 20D trend negative. The velocity bypass
  is unchanged (it is a baseline property, recorded where the discovery
  record shows it).

Population (explicit): for each discovery run collected under this
registration, (a) every pilot candidate of that run, and (b) every asset
in the run's discovery observations that did NOT become a pilot candidate
— the upstream population, which includes assets the old ATH rule excluded
before pilot scoring whenever a per-asset record of them exists at or
after the run's chart stage. Residual blind spot, named rather than
hidden: an asset removed by the ATH gate with no velocity rescue and no
per-asset record exposed by any production read path cannot be enumerated
per-asset (the prep investigation established this unobservability); for
each run the feed records the funnel's ath_hard_gate removal count, when
the funnel read is available, as the size of that blind spot. Assets
removed before the chart stage (e.g. the S1 volume gate) never reach the
ATH check and are out of population by definition.

Required fields, sources, as-of discipline: fields are joined from
CoinGecko (the provider family the discovery catalog itself is built
from): `ath` and `ath_date` from the coin record; daily prices from the
coin's market_chart series. As-of discipline is by construction from
historical series, and is labeled as such: only daily price points with
timestamps at or before the decision instant are used; priceVsSma50
compares the last such close against the mean of the last 50 such closes;
trend20d compares the last such close against the close 20 daily points
earlier; athDistancePct compares the candidate's decision-time price
(the recorded decisionReferencePrice for pilot candidates; the discovery
record's price for upstream members) against the ATH in force at the
decision instant — CoinGecko's ATH when its ath_date is at or before the
decision instant, otherwise the maximum daily price at or before the
decision instant, with the basis recorded (`ath_basis`: coingecko_ath /
reconstructed_from_daily_prices). Every field-join records
`fields_fetched_at` and `fields_received_at` (scorer wall clock) and
`fields_basis: historical_series_asof_decision`. Fallback: if CoinGecko
cannot serve an asset, Binance daily klines (mapped assets only) supply
SMA/trend and an exchange-listed-history maximum in place of ATH, with
`ath_basis: binance_listed_history_max` recorded — a different ATH basis,
labeled, never silently substituted. If neither source serves the asset,
or fewer than 50 daily closes precede the decision, the member's R4
record is `unverified` with the reason — never silently absent.

Disposition path (explicit, per population member):
- Pilot candidates: R4 is a component of the paired shadow record. If the
  conjunction holds, the challenger disposition is
  `would_exclude_ath_conjunction` whenever the baseline disposition is
  `issued` or the candidate would otherwise would-issue under R1 (the
  upstream exclusion precedes the print stage), recorded as an
  ath_contextual disposition divergence with the field inputs. If the
  conjunction does not hold, the record states `pass_with_context` with
  the fields as evidence and R4 causes no divergence. If fields are
  unverified, the record states so and R4 causes no divergence.
- Upstream members (no pilot disposition exists): a standalone population
  record per member in the R4 population ledger, carrying the discovery
  context as the recorded baseline treatment
  (`excluded_upstream_pre_pilot_scoring` or the run's recorded context),
  and the R4 disposition: `hard_exclude_conjunction` /
  `pass_with_context` / `unverified` (with reason). These records make
  the gate's cost measurable prospectively; they are not paired
  divergences and never enter the paired comparison.

## Challenger disposition composition

For each pilot candidate, the challenger disposition is derived
component-wise from the baseline disposition, with R4's upstream
exclusion taking precedence over R1's print-stage outcomes:
- Baseline model abstention (score below the unchanged bar of 60):
  challenger abstains identically. No component can resurrect a below-bar
  candidate; the normalized bars of R3 are data only. (R4 does not
  override a score abstention: the candidate fails the unchanged bar
  under both arms.)
- Baseline venue-mapping deferral: challenger defers identically.
- Baseline issued: the challenger concurs UNLESS the R4 conjunction
  holds (would_exclude_ath_conjunction) or its drift component rejects
  against a verified reference (would_reject; class mechanics_proof_only
  when the reference basis is historical_reconstruction). If the drift
  component is unverified, the challenger records
  concur_with_unverified_drift.
- Baseline stopped at the drift test: if the R4 conjunction holds, the
  challenger records would_exclude_ath_conjunction. Else if the drift
  component passes against a verified reference and all other components
  concur, the challenger records a would-issue with its would-be contract
  (entry = the challenger's independently selected print; levels = the
  baseline's frozen levels where their geometry is ok; targets per the
  frozen geometry) and the contract is ENROLLED in the shadow book (see
  "Shadow book and evaluator enrollment"). If the drift component is
  unverified, the challenger records abstain_unverified_drift — never a
  would-issue on an unverified reference.
- Baseline stopped on levels (invalid_frozen_levels): the challenger
  rejects identically (R2 strictness), recording the reason_split
  divergence (unverified / malformed / already_crossed) with per-level
  inputs.
- Baseline stopped for any other recorded reason (first-print missed /
  operational): the challenger mirrors the baseline; components record
  their evidence where applicable.

## Component-level divergence recording (mandatory)

Every baseline-vs-challenger divergence — of disposition OR of reason —
is recorded with: the component that caused it (drift_reanchor /
levels_reason_split / ath_contextual / transparency_none), the kind
(disposition / reason_split), the divergence class (paired_comparison /
mechanics_proof_only — drift divergences on reconstructed references are
always the latter), the baseline treatment, the challenger treatment, and
the per-component inputs (for drift: baseline reference, challenger
reference with its full capture record incl. fetch/receipt times and
basis, challenger entry print with its selection record, production entry
print, both drift values in bps; for levels: level, reference,
source-as-of, derivation status, geometry, classification; for ATH: the
joined fields with sources and as-of, or the named unverified reason).
transparency_none is the explicit marker that R3, being measurement-only,
caused no disposition divergence. There are no unexplained divergences: a
divergence without a complete component record is a scorer defect and
voids that candidate's shadow record (recorded as such), never a silent
pass.

## Per-pair version records (mandatory)

Every paired shadow record carries a `versions` block recording the
actual versions it was produced under: the candidate's baseline freeze
version (candidate.freezeVersion), the baseline production hash
(candidate.productionHash), the vessel challenger hash on the candidate
(candidate.challengerHash), the handler version, the mapping version in
force in the status pull (the pull's freeze record, with the candidate's
own venue mapping row), the collection manifest identity (the active
freeze manifest version + the collector note reference where one exists),
and the challenger executable identity (this registration's id, rule-text
sha256, and the scorer file's own sha256, computed at run time). A pair
produced under mixed versions is therefore identifiable as such; no
record may imply a version it was not produced under.

## Shadow book and evaluator enrollment

Every would-issue with a complete would-be contract (challenger entry
print, invalidation, target1; target2 derived from the frozen geometry
and labeled derived) is enrolled in the shadow book AT SCORING TIME —
enrollment never waits for an outcome. The shadow book is isolated: its
own ledger (`rows/challenger-r1-shadow-book-v2.jsonl`) and its own
outcomes record (`rows/challenger-r1-shadow-outcomes-v2.jsonl`) under the
comparison vessel. Every shadow entry and every shadow outcome is labeled
`HYPOTHETICAL` (field `hypothetical: true`, label string on the record)
and is structurally distinct from issued positions: shadow records live
only in these two files, carry `shadow_book` identity on every line, and
never enter production positions, production monitoring, or any count of
issued work. Cost assumptions are explicit in every shadow record:
`costs: {bps_round_trip: 18, clause: "18 bps round-trip modeled
(crypto-evaluation-v5-corrected)"}` — stated, never implied.

Evaluation is automatic and isolated: the shadow evaluator
(`challenger_shadow_eval.py`, in the vessel) walks each open shadow
position over completed 1-minute bars from the position's own venue
(Binance Spot via the public data route), under the frozen evaluator
semantics (crypto-evaluation-v5-corrected): first-touch TOUCH; the walk
STOPS at the first touch-or-uncertainty event; both barriers touched
within one clean 4-hour block = AMBIGUOUS (excluded from hit rate and
from return inference, counted separately); a coverage gap before
resolution = UNKNOWN (counted separately, never resolved by assumption);
the entry-spanning bar is excluded; horizon cap 30 elapsed days, open
positions exit at the cap (time_exit). Outcomes are appended to the
shadow outcomes record with gross R, net R (comparison-math definition
below), the settling touch, and full coverage evidence. Baseline-arm
outcomes for pairs are NEVER produced by the shadow evaluator: where the
baseline issued, its return is taken from the production settlement
record when one exists (referenced by position id in the pair scaffold),
and the pair is immature until then.

## Pre-registered comparison math (frozen with this registration)

Defined now, before any v2 outcome is reviewed; outcomes reviewed later
must use these definitions as written.

- Pair: a candidate whose baseline and challenger dispositions differ
  (disposition divergence), OR a reason_split divergence (recorded, but
  its paired return difference is 0 by construction and it is excluded
  from return inference). Live-capture and reconstructed drift
  divergences are SEPARATE pair classes and are never pooled.
- Arm returns (net R): for an arm that takes the trade,
  gross R is the evaluator's: invalidation-first = -1R; target1-first =
  +1.5R; target2 is recorded when it is the settling barrier per the
  evaluator walk (target1 settles first under first-touch unless the
  walk's first touch is target2 — impossible under monotone barrier
  ordering for a single position; target2 therefore appears only as a
  post-settlement observation, exactly as in production settlements);
  time_exit gross R = (exit price - entry) / |entry - invalidation| with
  the long/short sign applied. Costs: net R = gross R - 0.0018 x
  entry / |entry - invalidation| (the frozen 18 bps round-trip clause
  converted to R units at the position's own risk distance; the clause's
  verbatim form, "Net R = gross R - 18 bps", is recorded on every
  outcome). For an arm that does not take the trade, its return is 0
  (flat). A pair whose contract lacks a usable invalidation (risk
  distance 0 or missing) is non-evaluable: excluded from return
  inference, counted with reason.
- Paired difference: d = net R (challenger) - net R (baseline), per
  matured pair (both arms' returns determined: a would-issue pair
  matures when its shadow outcome is written; a would-reject /
  would-exclude pair matures when the baseline's production settlement
  exists). AMBIGUOUS and UNKNOWN pairs are excluded from return
  inference and counted. Immature pairs are counted, never estimated.
- Inference: the effect estimate is the mean of d over matured pairs of a
  class. Uncertainty: cluster bootstrap over dependence clusters, where
  two pairs are in the same cluster if they share an asset (coinId) or a
  discovery run (transitively — connected components); 10,000 resamples
  of clusters with replacement, percentile 90% interval on the mean.
  Every report states: matured pairs, cluster count, excluded counts by
  reason (ambiguous / unknown / non-evaluable / immature), and the class
  split (live-capture vs reconstructed). Raw counts are never presented
  as independent samples.
- Checkpoints and deadline: 30 matured divergences (in a class) and 8
  weeks from registration (2026-10-21T07:08:55Z + 8 weeks) are REVIEW CHECKPOINTS
  for that class; 12 weeks from registration (2027-01-13T07:08:55Z) is the REVIEW
  DEADLINE for the comparison as a whole. At any review, if matured pairs
  < 30 or clusters < 10 in every class, the comparison is INCONCLUSIVE.
  Inconclusive never promotes the challenger, automatically or by
  default, and never extends the window silently. Promotion requires a
  separate explicit decision by Logan after a review. This standard
  replaces any numeric adoption rule; none exists in this registration.
- No retuning: no rule, threshold, band, weight, definition, or estimator
  in this registration may be adjusted in response to individual outcomes
  or to the comparison as it accumulates. Any change voids this
  registration; a changed challenger requires a new registration with a
  new id, a new hash, and a new freeze time.

## Collector-manifest relevance (summary)

The v2.1.5 freeze manifest pins collect_pilot_rows.py at sha256
af2cba2d...; the live file hashes cbcde433.... The manifest is preserved
as-is (append-only history). The full evidence, diff, and relevance
analysis are recorded in MANIFEST-NOTE-collector-drift-v2.1.5-2026-10-21.md
in this vessel. Verdict recorded there: the drift is one additive,
flag-gated dossier-capture mode from the intended-models wiring
(2026-10-14/15); the collector's default path — the only path the
collection cron invokes — is behavior-identical; and the collector is not
a registered input to this challenger (the challenger's registered input
is the live status pull). No registered input to this experiment changed.
Per-pair version records (above) carry the manifest identity so any
future change is visible on the records themselves.

## Section A — Corrected attainable-maximum arithmetic (recomputed at registration)

Source: the factor ledgers of all 100 candidates in the live paper status
pull of 2026-10-21T05:40Z (state map), and the 49 core prep-sample
candidates (discovery runs 132, 134, 135) for the per-shape figures —
recomputed at registration time.

Registered state-to-contribution map (observed across all 100 ledgers;
contribution is a deterministic function of status per factor):
- Trend (w20): pass 20, mixed 10. (fail unobserved; if it ever appears it
  contributes 0 and extends nothing — 0 is the floor state.)
- Momentum (w15): pass 15, mixed 8, fail 0.
- Volatility (w10): pass 10, mixed 5, fail 0.
- Volume (w15): pass 15, mixed 8, fail 0.
- Positioning / funding (w10): neutral 0, unavailable (dark). No other
  measured state observed in 100 ledgers.
- Network fundamentals (w15): unavailable (dark) on 100/100. No measured
  state observed.
- Supply overhang (w15): pass 15, mixed 8, fail 0.

Score construction reproduces the recorded production score on 49/49
core candidates (zero mismatches): productionScore = factor-sum - 10 iff
Trend status = pass AND Momentum status = pass, else factor-sum.

Attainable maximum under the rules (the R3 definition): maximize the
scoring function over the map's joint states for the candidate's measured
set. Trend+Momentum joint contributions: pass+pass = 20+15-10 = 25
(tax applies); pass+mixed = 20+8 = 28; pass+fail = 20; mixed+pass = 25;
mixed+mixed = 18; mixed+fail = 10. Best = 28. The joint state
(Trend pass, Momentum mixed) is genuinely reachable — it occurred on
19/49 core candidates — so a ceiling of sum-minus-10 (75 for the
Positioning-measured shape) would NOT be a maximum: states scoring above
it are reachable in principle (the pair alone contributes 28 > 25).
- Shape 1 (Network dark; Positioning measured-neutral; 17/49):
  measured_weight_sum = 85; attainable_max_score = 28 + 10 (Volatility
  pass) + 15 (Volume pass) + 15 (Supply pass) + 0 (Positioning best
  measured) = 68. Bar 60 = 88.2% of attainable max.
- Shape 2 (Network dark; Positioning dark; 32/49): measured_weight_sum =
  75; attainable_max_score = 68 identically (Positioning's best measured
  contribution is 0, so its darkness changes the weight sum but not the
  reachable maximum). Bar 60 = 88.2% of attainable max.
- ALT (altlayer, run 132; score 58; Shape 1): normalized = 58/68 = 85.3%
  (v1 said 68.2% against its mislabeled 85; the prep document said 77.3%
  against 75). Under R3's shadow bars, ALT passes both 0.75 and 0.80 as
  shadow data — dispositions unaffected (measurement only).
- If a future candidate measures Network fundamentals (no observed
  measured state), its attainable computation uses that candidate's own
  recorded Network contribution as the factor's best state and flags the
  unmapped state as a data-quality divergence, per R3. The map itself is
  amended only by a new registration.
