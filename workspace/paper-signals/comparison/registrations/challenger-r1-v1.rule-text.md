# Challenger-R1 — registered rule text (registration challenger-r1-v1)

Registration id: challenger-r1-v1
Registered (frozen) at: 2026-10-21T06:00:00Z
Status: SHADOW ONLY. This registration changes nothing in production. The
frozen production model (paper-pilot-v2.1.3, handler 2.1.9) issues exactly as
before; its decisions are never altered, rescored, or relabelled by this
registration. Locked holdouts are untouched and unread. All scoring under
this registration is prospective: only candidates whose decision instant is
at or after the registration time above are scored. No candidate decided
before registration is ever backfilled.

Baseline arm: the production qualification pipeline exactly as deployed
(paper-pilot-v2.1.3 / handler 2.1.9), with its recorded dispositions as the
baseline treatment for every paired candidate.

Challenger arm: the same pipeline with ONLY the component changes R1, R2,
R4 below, plus the measurement-only recording R3. Everything not listed is
identical to the baseline: factor weights (Trend 20, Momentum 15,
Volatility 10, Volume 15, Positioning/funding 10, Network fundamentals 15,
Supply overhang 15; nominal total 100), the absolute qualification bar of
60, the -10 redundancy adjustment (applied when Trend and Momentum both
pass), venue mapping and its deferrals, the 900-second entry window, the
50 bps drift band size, settlement geometry (+/-1.5R / +/-2.5R, 18 bps,
first-touch TOUCH, 30-day cap), and every strict validity check.

## R1 — Drift reference re-anchor

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
  prints whose venue timestamp is <= the decision instant are admissible;
  every admissible print existed and was observable before the decision
  froze. The capture records: reference price, venue trade id, print
  timestamp, age of the print at the decision instant, the fetch window,
  and the response hash.
- If no print exists in the window, if the fetch fails, if the response
  page truncates the tail of the window so the last pre-decision print
  cannot be established, or if the mapped venue has no supported capture
  path, the drift component is UNVERIFIED for that candidate
  (component-level abstention). A later (post-decision) print is NEVER
  used as the reference, silently or otherwise; there is no fallback
  anchor.
- The drift test itself is unchanged in size and window: drift =
  |entry print - reference| / reference, band 50 bps (or the candidate's
  recorded permitted drift where the record carries one), entry window
  900 s. The entry print is the same first post-decision print the
  baseline used.
- The scan price remains recorded for provenance and for the score; it no
  longer anchors the challenger's drift test.
- Per candidate, the shadow record states whether a valid pre-freeze
  reference existed (reference_status: captured / unverified with the
  reason). Where the baseline never ran a drift test (candidate stopped
  before the print stage and not issued), the component is
  not_applicable and creates no divergence.

## R2 — Level provenance: malformed vs already-crossed

Current (baseline) rule: a wrong-sided frozen invalidation rejects under
the single reason code invalid_frozen_levels; the invalidation's
derivation (source, derivation window end, formula) is not recorded on the
candidate, and the reference's observation source differs from the
invalidation's derivation source without a recorded compatibility check.

Registered challenger rule:
- Strict rejection is preserved in full: a wrong-sided level rejects under
  the challenger exactly as under the baseline. No level is clamped,
  adjusted, moved, or given a tolerance band, ever.
- For every candidate carrying frozen levels, the shadow record carries a
  per-level provenance record: the invalidation level, the reference
  price, the reference's source-as-of, the level geometry verdict
  (correct_side / wrong_side against the reference, direction-aware), and
  a classification drawn from exactly these codes:
  - ok: geometry correct_side. (The record separately states whether the
    derivation was recorded; a correct-sided level with unrecorded
    derivation is classified ok with provenance_complete = false.)
  - malformed: geometry wrong_side AND the construction cannot be
    validated as sound — the derivation is missing (no recorded source,
    derivation window end, or formula id), or the recorded derivation is
    incompatible (derivation window end after the reference's
    source-as-of, or a derivation venue different from the reference
    venue), or no pre-decision price evidence shows the level was already
    crossed.
  - already_crossed: geometry wrong_side AND the derivation is recorded
    and compatible (source present, derivation window end <= reference
    source-as-of, same venue) AND pre-decision price evidence (the
    reference observation itself, observed at or before the decision
    instant) shows the price already beyond the level at decision time.
    Construction valid; the setup was already invalidated — a strategy
    outcome, not a construction defect.
  Construction validity is assessed BEFORE the crossed test: a level whose
  derivation is missing or incompatible can never be classified
  already_crossed under this registration, however the price behaved.
- R2 is disposition-neutral: malformed and already_crossed both reject,
  exactly as the baseline rejects. Its divergence kind is reason_split:
  where the baseline recorded invalid_frozen_levels, the challenger
  records which of the two codes applies, with the per-level inputs.
  Where the baseline did not reject on levels, R2 records provenance only.

## R3 — Attainable-score transparency (measurement only; no formula change)

- For every scored candidate the shadow record carries: the factor-sum,
  whether the -10 redundancy adjustment applied, the production score
  (recomputed and cross-checked against the recorded production score;
  any mismatch is flagged as a data-quality divergence, never silently
  overwritten), attainableScore, the list of dark factors, and the
  attainable-normalized score (production score / attainableScore).
- attainableScore definition (VERIFIED arithmetic, Section A of the
  registration): the sum of the weights of the factors that returned a
  measured reading for that candidate. A factor is dark only when its
  recorded status is "unavailable". A "neutral" reading is a measured
  reading (the factor observed its input and contributed zero); it counts
  toward attainable. Attainable is therefore per-candidate, not a single
  constant.
- The challenger's dispositions use the unchanged absolute bar of 60.
  Separately, as shadow data only, the record states the disposition that
  would result under attainable-normalized bars of 0.75 and 0.80. These
  normalized dispositions never affect the challenger's registered
  disposition.

## R4 — ATH gate: blanket exclusion to contextual evidence

Current (baseline) rule: the discovery chart gate hard-rejects an asset
trading >= 75% below its all-time high (no ATH date recorded); a +15%/48H
velocity burst independently bypasses the gate.

Registered challenger rule:
- The hard rejection is removed. athDistancePct and athDate are recorded
  as evidence on every scored candidate where the record carries them.
- A hard exclusion is retained ONLY for the conjunction: >= 75% below ATH
  AND price below its 50D SMA AND 20D trend negative (all three fields as
  computed on the candidate's discovery record). The velocity bypass is
  unchanged.
- Vessel limitation, stated at registration: the pilot candidate record
  carried into the comparison vessel does not currently contain ATH
  distance, ATH date, price-vs-50D-SMA, or 20D-trend fields. Until the
  discovery record is joined to the vessel feed, the R4 component records
  ath_component = unverified (reason: ath_fields_not_in_candidate_record)
  for every candidate and contributes NO divergences and NO would-issues.
  The rule above is registered in full so that the component activates
  exactly as written when the fields arrive; no rule-text change is
  needed or permitted at that point.

## Challenger disposition composition

For each candidate, the challenger disposition is derived component-wise
from the baseline disposition:
- Baseline model abstention (score below the unchanged bar of 60):
  challenger abstains identically. No component can resurrect a
  below-bar candidate; the normalized bars of R3 are data only.
- Baseline venue-mapping deferral: challenger defers identically. Venue
  mapping is an operations/coverage matter, not a challenger rule.
- Baseline issued: the challenger concurs UNLESS its drift component
  (where applicable) rejects against a captured pre-freeze reference, in
  which case the challenger records would_reject with the drift
  divergence. If the drift component is unverified, the challenger
  records concur_with_unverified_drift (not a would-issue, not a
  rejection).
- Baseline stopped at the drift test: if the challenger's drift component
  passes against a captured pre-freeze reference and all other components
  concur, the challenger records a would-issue with its would-be contract
  (entry = the baseline's first post-decision print where one exists;
  levels = the baseline's frozen levels where their geometry is ok;
  targets per the frozen geometry). If the drift component is
  unverified, the challenger records abstain_unverified_drift — never a
  would-issue on an unverified reference.
- Baseline stopped on levels (invalid_frozen_levels): the challenger
  rejects identically (R2 strictness), recording the reason_split
  divergence (malformed or already_crossed) with per-level inputs.
- Baseline stopped for any other recorded reason (first-print missed /
  operational): the challenger mirrors the baseline; components record
  their evidence where applicable.

## Component-level divergence recording (mandatory)

Every baseline-vs-challenger divergence — of disposition OR of reason —
is recorded with: the component that caused it (drift_reanchor /
levels_reason_split / ath_contextual / transparency_none), the kind
(disposition / reason_split), the baseline treatment, the challenger
treatment, and the per-component inputs (for drift: baseline reference,
challenger reference with its capture record, entry print, both drift
values in bps; for levels: level, reference, source-as-of, derivation
status, geometry, classification; for ATH: the recorded fields or the
named absence). transparency_none is the explicit marker that R3, being
measurement-only, caused no disposition divergence. There are no
unexplained divergences: a divergence without a complete component record
is a scorer defect and voids that candidate's shadow record (recorded as
such), never a silent pass.

## Matched-policy evaluation standard (replaces any numeric adoption rule)

- The baseline and the challenger are evaluated as MATCHED policies on
  the same candidates: only paired divergences (candidates where the two
  arms' dispositions differ) carry comparative information, and they are
  evaluated as pairs, never pooled with non-divergent candidates, legacy
  cohorts, or reconstructed rows.
- Costs are applied identically to both arms: the frozen 18 bps roundtrip
  clause of the settlement evaluator (crypto-evaluation-v5-corrected:
  first-touch TOUCH, +/-1.5R / +/-2.5R, 30-day cap) governs any matured
  outcome recorded for a challenger would-issue, exactly as for baseline
  issues.
- Dependence is handled, not assumed away: candidates sharing an asset or
  a discovery run are one cluster for inference. Every comparison report
  states raw divergence counts AND cluster counts (by asset and by
  discovery run), and any interval estimate is cluster-adjusted
  (cluster-robust or cluster-bootstrap over the asset/run clusters). Raw
  counts are never presented as independent samples.
- Checkpoints and deadline: 30 matured divergences and 8 weeks from
  registration are REVIEW CHECKPOINTS — points at which the comparison is
  reported with its uncertainty (paired effect with a cluster-adjusted
  interval). 12 weeks from registration is a REVIEW DEADLINE: the review
  happens then regardless of counts.
- Insufficient evidence at any checkpoint or at the deadline means the
  comparison is INCONCLUSIVE. Inconclusive never promotes the challenger,
  automatically or by default, and never extends the window silently.
- Promotion of Challenger-R1 toward production requires a separate
  explicit decision by Logan after a review. Nothing in this registration
  promotes anything.
- No retuning: no rule, threshold, band, or weight in this registration
  may be adjusted in response to individual outcomes or to the comparison
  as it accumulates. Any change to this rule text voids this registration;
  a changed challenger requires a new registration with a new id, a new
  hash, and a new freeze time.

## Section A — Verified attainable-score arithmetic (recomputed at registration)

Source: the factor ledgers of the 49 core prep-sample candidates
(discovery runs 132, 134, 135; live paper status pulled 2026-10-21T05:40Z),
recomputed factor by factor at registration time — not inherited from the
prep document.

- Factor weights (pilot ledger): Trend 20, Momentum 15, Volatility 10,
  Volume 15, Positioning/funding 10, Network fundamentals 15, Supply
  overhang 15. Nominal total: 100 (verified per candidate: weights sum to
  100 on 49/49).
- Score construction reproduces the recorded production score on 49/49:
  productionScore = factor-sum - 10 when Trend status = pass AND Momentum
  status = pass, else factor-sum. Zero mismatches.
- Dark factors: Network fundamentals status = unavailable on 49/49
  (weight 15 never measurable in the sample). Positioning/funding status
  = unavailable on 32/49 and NEUTRAL — a measured reading contributing
  zero — on 17/49. No other factor was unavailable on any candidate.
- Attainable maximum (sum of weights of factors returning a measured
  reading): 85 for the 17 candidates whose Positioning returned a neutral
  reading; 75 for the 32 candidates whose Positioning was also
  unavailable. There is no single attainable ceiling for the sample.
- The bar of 60 is therefore 70.6% of attainable for the 17
  Positioning-measured candidates and 80.0% of attainable for the 32
  doubly-dark candidates. The prep document's statement of a single
  attainable ceiling of 75 (bar = 80% of attainable) is CORRECTED by this
  registration: it treated Positioning's zero contribution as darkness on
  all 49, including the 17 where Positioning returned a measured neutral
  reading.
- Bar cross-check from dispositions: highest recorded score below the bar
  = 58 (abstained); lowest recorded score at or above the bar = 61. No
  candidate in the sample scored 59 or 60, so the bar's exact edge (60)
  remains an inference from the disposition split, as the prep document
  stated; R1-R4 do not depend on it.
