# Challenger-R1 — revised registration, exact diff vs the prep proposal, verified arithmetic, verification evidence

**Status: REGISTERED and WIRED as a shadow arm. Nothing in production changed.** The frozen production model (paper-pilot-v2.1.3 / handler 2.1.9) issues exactly as before; no old decision was altered, rescored, or relabelled; locked holdouts are untouched and unread.

- **Registration id:** `challenger-r1-v1`
- **Frozen at:** 2026-10-21T06:00:00Z (prospective only — candidates decided before this instant are refused, never backfilled)
- **Rule text:** `paper-signals/comparison/registrations/challenger-r1-v1.rule-text.md` — **sha256 `730b415a26f380884c1e828f148ed8b8e544cf3a51a1fb5357d4fb7a437c29a7`**
- **Registration record:** `registrations/challenger-r1-v1.registration.json` — file sha256 `dd4c02c8f0cd9bff6764e3b62e55726a07dc077390b21255283202c4d77bbca9`
- **Shadow scorer:** `paper-signals/comparison/challenger_r1.py` — sha256 `637ffd2d45a7ede9d80393e7c56ee6492143694084a43985fd4f118a54fff6ee`. It verifies the rule-text hash on every run and refuses to score on any mismatch: editing the rule text voids the registration mechanically, not just by convention.
- **Shadow ledger:** `paper-signals/comparison/rows/challenger-r1-shadow-v1.jsonl` (first record lands with the first post-registration candidate)
- **Wiring:** step 3b of the existing 6-hour comparison-collection cron (next run 2026-10-21T11:40:19Z), consuming the same live status pull as the frozen collector.

This document contains: (a) the full revised registration text, verbatim; (b) an exact diff against the prep document's proposal (workstream doc 37, §4–§5); (c) the verified attainable-score arithmetic; (d) the verification evidence.

---

## (a) The revised registration — full text

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

---

## (b) Exact diff vs the prep proposal (doc 37, §4–§5)

### REMOVED

1. **Doc 37 §5's numeric adoption rule — deleted in full.** The prep proposed: *"recommend adopting Challenger-R1 … iff all three hold: (i) matured divergences ≥ 30; (ii) challenger-only issues' mean net R > 0 and the lower bound of its 90% confidence interval is above −0.25R; (iii) the 24h-invalidation share of challenger-only issues ≤ baseline in-window share + 10 points."* No part of this survives. There is no numeric adoption rule in the registration. *(Logan correction 6.)*
2. **Doc 37 §5's window mechanics** — "runs until both (a) ≥30 matured divergences AND (b) ≥8 weeks … whichever is later; hard review at 12 weeks … the window is not silently extended" as an adoption-evaluation trigger — removed with the rule it served. The same numbers (30 / 8 weeks / 12 weeks) reappear only as review checkpoints and a review deadline (see Added §3).
3. **Doc 37 R1's fallback anchor** — *"fallback: the first print at/after the decision instant, flagged as such"* — removed. There is no fallback anchor under any flag. *(Logan correction 1.)*
4. **Doc 37's attainable figures** — *"the attainable ceiling was 75"*, *"60 is 80% of the attainable 75"* (doc 37 §2) — removed as incorrect for 17 of 49 candidates; corrected figures in (c) below and in Section A of the registration text. *(Logan correction 3.)*

### CHANGED

5. **R1 reference definition.** Doc 37: *"the last admissible venue trade print at or before the decision instant, taken from the same aggTrades fetch the handler already performs."* Two changes: (i) the capture is now defined explicitly — a mapped-venue aggTrades query over [decision − 900 s, decision], the admissible print being the greatest venue timestamp ≤ the decision instant, with the capture record (price, trade id, print timestamp, age at decision, fetch window, response hash) stored per candidate; (ii) the source cannot be "the same fetch the handler performs": the handler's recorded fetch window starts AT the decision instant (verified: checkpoint `requestedSinceMs` = decision ms), so it contains no pre-decision print. The challenger capture is a separate, timestamp-disciplined query for prints that existed before the freeze. Where no valid pre-freeze reference exists (no print in window, fetch failure, truncated tail, unsupported venue), the drift component is **UNVERIFIED** — a component-level abstention (`abstain_unverified_drift` against a drift-stopped baseline), never a silent re-anchor. *(Logan correction 1.)*
6. **R2 split precedence.** Doc 37's two clauses overlapped without an order (a level could be both "crossing visible" and "provenance incomplete" — PHA is exactly that case). The registration fixes a decision order: construction validity first (derivation recorded, window end ≤ reference source-as-of, same venue). Missing or incompatible derivation ⇒ **malformed**. **Already_crossed** is reachable only with a recorded, compatible derivation plus pre-decision crossing evidence. *(Logan correction 2.)*
7. **Divergence accounting.** Doc 37 counted divergences in aggregate ("divergence rate by rule"). The registration requires **every** divergence — disposition or reason — to carry a component record with per-component inputs, and defines an unexplained divergence as a scorer defect that voids that candidate's shadow record. *(Logan correction 5.)*
8. **Comparison framing.** Doc 37's metrics (divergence rate, matured net R, 24h-invalidation share, context metrics, R3 readout) are retained as the *contents of review reports* but stripped of all decision force; the comparison is now specified as matched policies on paired divergences only, identical 18 bps costs both arms, and cluster dependence (asset + discovery-run clusters) stated in every count and interval. *(Logan corrections 4 + 6.)*
9. **Vehicle mechanics.** Doc 37 assumed registration into "the artifact's existing comparisons vessel" with the registration to be recorded in "this document's successor registration". As implemented: the registration lives in the workspace comparison vessel (`paper-signals/comparison/`), as a standalone shadow scorer keyed to the same live candidate stream and paired with the frozen collector's rows by candidate id — deliberately NOT inside the hash-frozen harness/collector, whose executable hashes are pinned by freeze-manifest v2.1.5 and were verified undisturbed (see (d)).

### ADDED

10. **Registration identity + integrity.** Registration id `challenger-r1-v1`, freeze instant, full rule text stored with its sha256, scorer sha256 — none of which doc 37's proposal mechanized (it required rule text + hash "recorded" but defined no artifact). The scorer enforces the hash on every run.
11. **Review standard (replacing the adoption rule).** 30 matured divergences and 8 weeks are **review checkpoints**; 12 weeks (2027-01-13) is a **review deadline**. Reviews report the paired effect with a cluster-adjusted interval. Insufficient evidence ⇒ **INCONCLUSIVE**; inconclusive never promotes and never extends silently. Promotion requires a separate explicit decision by Logan after a review. *(Logan correction 6.)*
12. **Per-candidate reference status.** Every shadow record states whether a valid pre-freeze reference existed (`captured` / `unverified` + reason) — a field doc 37 did not define.
13. **R4 vessel limitation, stated at registration.** The pilot candidate record carried into the vessel contains no ATH distance/date, price-vs-50D-SMA, or 20D-trend fields (verified by key scan). Until the discovery record is joined, the R4 component records `unverified / ath_fields_not_in_candidate_record` per candidate and contributes no divergences. Doc 37 assumed the fields would simply be recorded; the registration names their absence instead of papering over it.
14. **Settlement scope note.** Doc 37 §5 assumed challenger would-issues "are enrolled in venue monitoring under a distinct arm label and settled by the same evaluator". As registered: would-be contracts are recorded in the shadow ledger with the frozen geometry and the registered evaluator/cost standard, but automated settlement enrollment of shadow positions is **not** part of this wiring step; every would-issue record is flagged `settlement_status: not_enrolled_shadow_bookkeeping_only` until that step is separately built.

### UNCHANGED from doc 37 (verified, not re-decided)

Factor weights; the absolute bar of 60; the −10 redundancy rule; venue mapping treated identically (operations, not a challenger rule); 900 s window; 50 bps band size; settlement geometry (±1.5R/±2.5R, 18 bps, TOUCH, 30-day cap); strict level rejection with **no clamping, no tolerance, no adjustment, ever**; R3's normalized bars (0.75 / 0.80) as shadow data only; doc 37's explicit no-change list; locked holdouts; research visibility of both arms' dispositions.

---

## (c) Verified attainable-score arithmetic (recomputed, not inherited)

Recomputed factor-by-factor from the recorded ledgers of the 49 core prep-sample candidates (discovery runs 132/134/135; live status pull 2026-10-21T05:40Z):

- **Weights (pilot ledger):** Trend 20 · Momentum 15 · Volatility 10 · Volume 15 · Positioning/funding 10 · Network fundamentals 15 · Supply overhang 15 — nominal total **100**, verified per candidate (49/49 sum to 100).
- **Score construction reproduces the recorded production score on 49/49** (zero mismatches): factor-sum − 10 iff Trend = pass AND Momentum = pass, else factor-sum.
- **Which factors can be dark:** Network fundamentals was `unavailable` on **49/49** (its 15 points were never measurable in the sample). Positioning/funding was `unavailable` on **32/49** and **neutral — a measured reading that contributes zero — on 17/49**. No other factor was ever unavailable.
- **The true attainable maximum is per-candidate:** **85** for the 17 candidates whose Positioning returned a measured neutral reading; **75** for the 32 whose Positioning was also unavailable. There is no single attainable ceiling.
- **What the bar of 60 is:** **70.6% of attainable** for the 17 Positioning-measured candidates; **80.0% of attainable** for the 32 doubly-dark candidates.
- **Verdict on doc 37's figures:** the "75 attainable / bar = 80%" statement is **wrong as a universal** — it treated Positioning's zero contribution as darkness on all 49, including the 17 where Positioning returned a measured reading. It holds only for the 32 doubly-dark candidates. The registration (Section A) uses the corrected, per-candidate figures, and the scorer computes attainable per candidate from statuses.
- **Why the correction is material, not cosmetic:** under doc 37's figure, ALT (run 132, score 58, attainable actually 85) would show a normalized score of 58/75 = 77.3% — passing R3's 0.75 shadow bar. With the verified attainable, it is 58/85 = 68.2% — it does not pass. The error would have manufactured shadow "would-passes".
- **Bar edge cross-check:** highest below-bar score 58 (abstained), lowest at-or-above-bar score 61; no candidate scored 59–60, so the bar's exact value (60) remains an inference from the disposition split — R1–R4 do not depend on it.

---

## (d) Verification evidence

**Which path:** the *test-harness path*. No candidate decided after the 2026-10-21T06:00:00Z registration freeze existed during implementation (the latest real candidate decision is 2026-10-21T04:39:59.798Z), so no live candidate could lawfully be scored. The first live shadow records are expected at the next collection run (2026-10-21T11:40:19Z), from candidates decided by the 0700 ET discovery slot.

1. **Unit/integration tests — `tests/test_challenger_r1.py`: 9/9 PASS.** Coverage: registration integrity (hash chain); attainable arithmetic on both real ledger shapes (85 vs 75); level classifications (ok / malformed-missing-derivation / malformed-incompatible-derivation / already_crossed, including the precedence case where a crossing is visible but the derivation is missing ⇒ malformed); drift pass against a stale scan reference ⇒ would_issue with a complete divergence record; unverified paths (fetch exception, empty window) ⇒ abstain_unverified_drift with no later-print anchoring; drift reject against an issued baseline ⇒ would_reject; MEXC venue ⇒ unverified; model-abstain ⇒ drift not_applicable; ATH component records its named absence; end-to-end prospective guard + idempotency.
2. **Dress rehearsal on the live status pull** (`live-paper-status-2026-10-21T0540Z.json`, dry run): 100 candidates seen, **100 refused as pre-registration, 0 scored, 0 written**, no shadow file created. The prospective guard holds against the real feed — including against run 135's candidates, which the prep used but the registration must not backfill.
3. **Live venue-capture mechanics proof** (on a pre-registration candidate, as a mechanics check only — **not** entered as a shadow record): the registered capture query for COMPUSDT over [decision − 900 s, decision] at run 135's decision instant returned 241 prints via the venue's public aggTrades route; the last pre-decision print is aggId **68824392**, price 25.76, 5.8 s before the decision — exactly one aggregate id before production's own first print (68824393). Under R1, that candidate's drift measures **0.0 bps** (vs production's −54.1 bps rejection against the 149-second-old scan reference) — the capture path works live, and doc 37 §3D's stale-reference diagnosis is confirmed on its sharpest case.
4. **Frozen-machinery integrity after wiring:** `harness.py` sha256 `229ca493e60d325237d16c23244583c44053c8558a72d76f6f4395cd7fdae147` — identical to the value pinned in freeze-manifest-v2.1.5 (untouched). The cohort vessel is byte-unchanged in row count (334 rows) and content scope; the only scheduled-job change is the added step 3b in the collection cron's body (verified by reading the saved job back).
5. **One pre-existing observation, flagged not fixed:** `collect_pilot_rows.py`'s current file hash differs from the value pinned in freeze-manifest-v2.1.5. That divergence predates this task (the file was not modified during it; the collector stamps from the active manifest at runtime regardless). It is recorded here so the registration's integrity claims are never read as covering it.
