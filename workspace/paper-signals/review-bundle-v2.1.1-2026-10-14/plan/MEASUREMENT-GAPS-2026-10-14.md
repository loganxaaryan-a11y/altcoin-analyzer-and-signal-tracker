# Measurement Gaps — closure report · 2026-10-14

**Workstream:** paper-signals comparison · **Auditor role:** measurement audit (read-only; no files outside this report were modified)
**Dataset:** `rows/comparison-rows-pilot-2026-10-14.csv` (+ `.jsonl` twin) — 60 rows: 10 crypto production-issued (ids 31–40), 50 equity radar-qualified.
**Sources read for this audit:** the pilot CSV/JSONL, `freeze-manifest-v1.0.0.json`, `freeze-manifest-v2.0.0.json`, `FREEZE-v1.0.0-SUPERSEDED.md`, `COLLECTION-PLAN-2026-10-14.md`, `collection-run-log-2026-10-14.md`, `harness.py`, `metrics.py`, `collect_pilot_rows.py`, `build_pilot_rows.py`, `research/factor-ledgers-2026-10-13.json`, and the workspace DB copy `~/workspace/ts-spaces/altcoin-analyzer-and-signal-tracker/app.db` (read-only) for verbatim factor `asOf` values.

**Bottom line up front:** (a) prospective provenance cannot be established for any of the 60 rows — every decision predates both freezes; (b) under the strict timestamp rule, 60/60 rows lack fully verified decision-time evidence (10 already flagged; 50 equity rows newly flagged — currently marked true in the file); (c) cohort split rule specified; (d) primary accounting rule specified with worked example — `metrics.py` does not yet implement it; (e) equity deadline rule = **computed per row: close of the 30th XNYS session after the entry instant's NY date** (expert correction 1, 2026-10-14 — a calendar calculation, not a decision; replaces the +47-day substitution and closes the former plan conflict). Latest possible cohort maturity: **2027-02-17**; readout by **2027-02-24**.

---

## (a) PROVENANCE — were rows decided after the applicable freeze, under its executable rules?

### Verification procedure
1. Extracted `decision_at` per row from the pilot CSV.
2. Read `frozen_at_utc` from both manifests: **v1.0.0 = `2026-10-14T02:42:57Z`**; **v2.0.0 = `2026-10-14T04:09:32Z`**.
3. Applicable freeze at decision time = the latest freeze with `frozen_at_utc <= decision_at`.
4. Checked the row's recorded `prod_strategy_version` / `c2_strategy_version` against each manifest's `models[].strategy_version` (executable-rules match), and checked operational-rule executability (entry contract, veto, venue mapping) against what was persisted at decision time (`entry_observed_at`, alert timestamps, entry convention).

### Freeze timeline (the tension, resolved)
| Event | UTC |
|---|---|
| Earliest decision — crypto:31 | 2026-10-10T01:51:23.436000Z |
| Equity scan — all 50 equity rows | 2026-10-13T00:20:32.316000Z |
| Latest decision — crypto:40 | 2026-10-14T02:23:07.604000Z |
| **v1.0.0 frozen** | **2026-10-14T02:42:57Z** |
| **v2.0.0 frozen** | **2026-10-14T04:09:32Z** |
| Collector run stamps `freeze_version=2.0.0` on all 60 rows (backfill) | 2026-10-14 ~04:10–04:18Z |

Every `decision_at` (max 2026-10-14T02:23:07Z) precedes v1.0.0 (02:42:57Z) and v2.0.0 (04:09:32Z). **The applicable freeze at every row's decision time is NONE — no freeze existed when any decision was made.** The `freeze_version=2.0.0` value on all 60 rows is a retrospective collection-time backfill (confirmed in `collection-run-log-2026-10-14.md`: "`freeze_version`: `2.0.0` on all 60 rows"), not prospective provenance. Note this goes further than the flagged tension: not only do crypto rows 31–39 (2026-10-10→10-13) predate v2.0.0 — **all 60 rows, including crypto:40 and all 50 equity rows, predate v1.0.0 as well.** Even the single in-collection-window row (crypto:40, 2026-10-14T02:23:07Z — inside the 2026-10-14→12-31 window) predates v1.0.0's freeze by ~20 minutes. Collection-window membership ≠ freeze precedence.

### Two-layer verdict (model rules vs operational rules)
- **Model layer — matches, but by reproduction, not prospective execution.** Row strategy versions (`crypto-dossier-factor-agreement` `2.0.0-measurement-contract`, `crypto-dossier-minus-momentum` `0.1.0-shadow`, `equity-factor-agreement` `3.1.0-measurement-closure`) are byte-identical to the `models[].strategy_version` entries in **both** manifests, and `FREEZE-v1.0.0-SUPERSEDED.md` confirms model factor sets/weights/formulas are unchanged v1→v2. `prod_reproduced=True` on all 10 crypto rows: the harness re-derived the recorded direction from the persisted decision-time ledger under the frozen scoring parameters. This is fidelity evidence that the frozen model rules describe what ran — it does **not** prove the decision was executed under a frozen manifest at decision time.
- **Operational layer (v2) — not executed at decision time.** v2.0.0 froze the actionable-entry-v1 contract, waiting-interval veto, explicit venue mapping, level immutability, and the corrected evaluator **after** all decisions. The rows cannot evidence v2 operational execution: `entry_observed_at` / `alert_enqueued_at` / `alert_delivered_at` are null on 60/60 rows (honestly labeled — alert tables are empty in the DB copy); the recorded `entry` is the issuance-instant price (v1 convention `first-post-decision-provider-quote`), not a post-decision venue print under actionable-entry-v1 (5-minute observation-age limit, drift caps). The v2 waiting-interval veto's interval `[decisionAt, entryObservedAt]` is unobservable for these rows.

### Per-row provenance table
Verdict key: **RETROSPECTIVE** = decided before any freeze; `freeze_version` stamp is a collection-time backfill; prospective provenance cannot be established.

| row_id | decision_at (UTC) | freeze in force at decision | freeze_version stamp | model-layer match | v2 operational rules executed? | provenance verdict |
|---|---|---|---|---|---|---|
| crypto:31 | 2026-10-10T01:51:23.436000Z | none (pre-v1) | 2.0.0 (backfill) | yes — versions match both manifests; prod_reproduced=True | no — v2 frozen 2026-10-14T04:09:32Z; no entryObservedAt/alert evidence | RETROSPECTIVE — not established |
| crypto:32 | 2026-10-11T09:56:46.741000Z | none (pre-v1) | 2.0.0 (backfill) | yes; prod_reproduced=True | no | RETROSPECTIVE — not established |
| crypto:33 | 2026-10-11T13:06:44.241000Z | none (pre-v1) | 2.0.0 (backfill) | yes; prod_reproduced=True | no | RETROSPECTIVE — not established |
| crypto:34 | 2026-10-12T05:55:57.672000Z | none (pre-v1) | 2.0.0 (backfill) | yes; prod_reproduced=True | no | RETROSPECTIVE — not established |
| crypto:35 | 2026-10-12T09:58:23.978000Z | none (pre-v1) | 2.0.0 (backfill) | yes; prod_reproduced=True | no | RETROSPECTIVE — not established |
| crypto:36 | 2026-10-12T09:59:06.313000Z | none (pre-v1) | 2.0.0 (backfill) | yes; prod_reproduced=True | no | RETROSPECTIVE — not established |
| crypto:37 | 2026-10-12T13:04:22.799000Z | none (pre-v1) | 2.0.0 (backfill) | yes; prod_reproduced=True | no | RETROSPECTIVE — not established |
| crypto:38 | 2026-10-13T04:58:03.071000Z | none (pre-v1) | 2.0.0 (backfill) | yes; prod_reproduced=True | no | RETROSPECTIVE — not established |
| crypto:39 | 2026-10-13T10:07:29.474000Z | none (pre-v1) | 2.0.0 (backfill) | yes; prod_reproduced=True | no | RETROSPECTIVE — not established |
| crypto:40 | 2026-10-14T02:23:07.604000Z | none (pre-v1; in collection window but pre-freeze) | 2.0.0 (backfill) | yes; prod_reproduced=True | no | RETROSPECTIVE — not established |
| equity:AAPL … equity:WMT (50 rows) | 2026-10-13T00:20:32.316000Z (all 50 identical — single scan run) | none (pre-v1) | 2.0.0 (backfill) | yes — versions match both manifests; scored from frozen 7-factor ledgers; prod_decision=qualified | no — v2 frozen after; scan never reached issuance (unscored:production-not-issued) | RETROSPECTIVE — not established |

**Verdict (a): PROVENANCE GAP CANNOT BE CLOSED with available data.** No row was decided after an applicable freeze. What *is* established: the frozen model parameters describe the rules that produced the recorded decisions (version match + harness reproduction on crypto; ledger-scored on equity). What is *not* established: prospective execution under a frozen manifest, and v2 operational-rule execution at decision time. The rows are usable as a retrospective pilot only if the readout labels them as such; they do not satisfy COLLECTION-PLAN §2's "prospective origin … scored by the paper pipeline through `comparison/harness.py` during the collection window" for the *decision* (only the harness re-scoring happened in-window). Whether retrospective rows may enter the collection dataset is a parent/Logan decision — the plan currently admits only rows with `decision_at`/`issued_at` inside the window *and* pilot origin, which 59/60 rows fail on the decision-time leg.

---

## (b) TIMESTAMPS — date-only / midnight audit of every timestamp field

### Procedure
Scanned every timestamp-bearing column in the 60 rows — `decision_at`, `issued_at`, `entry_observed_at`, `alert_enqueued_at`, `alert_delivered_at`, `alert_delay_hours` — plus the factor-level `asOf` availability evidence in the source ledgers (crypto: `factors_json` in the DB copy, read verbatim; equity: `research/factor-ledgers-2026-10-13.json`). Flagged: date-only values, midnight assignment (`T00:00:00`), and null/missing.

### Row-level timestamp fields

| Field | Finding (60 rows) |
|---|---|
| `decision_at` | 60/60 full ISO timestamps with time components; **0 at midnight**. Equity: identical `2026-10-13T00:20:32.316000Z` on all 50 — a real persisted scan timestamp (`scanCompletedAt`), not an assigned value; uniformity is expected from one scan run. |
| `issued_at` | Crypto 10/10 full (= `decision_at`, row creation = issuance instant). Equity 50/50 **empty** — legitimate never-issued state (`unscored:production-not-issued`), not a timestamp defect. |
| `entry_observed_at` | 60/60 **null** — no genuine post-decision print observation persisted (`entry_at == issued_at` in the DB copy is the entry-rule instant). Honest labeling; consequence: v2 actionable-entry-v1 entry timing is unevidenced for every row. |
| `alert_enqueued_at` / `alert_delivered_at` | 60/60 **null** — `alerts` + `alert_hits` tables are empty in the DB copy. `alert_delay_hours` empty 60/60 (not gradable). |
| Date-only or midnight `decision_at`/`issued_at` | **None.** No row has a date-only or midnight decision/issuance timestamp. |

### Factor-level `asOf` — the actual decision-time availability evidence
- **Crypto (10 rows × 11 factors, verbatim from DB):** 10 of 11 factors per row carry full-precision `asOf` ≤ `decision_at` (e.g. `2026-10-10T01:51:18.046Z`). Two defects:
  1. **Cross-venue taker imbalance: `asOf` missing on 10/10 rows** — already the reason for `decision_time_verified=false` (harness rule: missing asOf → labeled, never assumed).
  2. **Developer velocity: midnight-normalized `asOf` (`T00:00:00.000Z`) on 6/10 rows — with score=1 / contribution=1.5 (a scoring factor):** rows 31 (`2026-10-04T00:00:00.000Z`), 32, 35, 36, 37, 38 (`2026-10-11T00:00:00.000Z`). On rows 33, 34, 39, 40 it carries full `asOf` but score=0. Date-granular observation time for a scoring factor does not meet the strict rule.
- **Equity (50 rows × 7 factors = 350 cells):** **all 350 `asOf` are date-only `'2026-10-09'`**, normalized to `2026-10-09T00:00:00Z` in the rows (`build_pilot_rows.py`: `"asOf": f"{asof}T00:00:00Z"`). Under the strict rule these are midnight-assigned and do **not** count as verified decision-time evidence. (Upstream context, not row evidence: the source JSON holds per-ledger full-timestamp `sourceAsOf` — the Yahoo daily-bar pull time, e.g. `2026-10-12T20:00:01.000Z`, all ≤ `decision_at` — which is genuine ledger-level availability evidence, but it was **not** persisted into the row's evidence fields. That is the identified path to close this: persist ledger-level `sourceAsOf` into the row. Until then, the rows stay unverified.)

### Verdict (b)
Under the strict rule (date-only/midnight ≠ verified decision-time evidence; actual input-observation evidence required):

| Rows | Current file value | Strict-rule verdict | Reason |
|---|---|---|---|
| crypto:31 – crypto:40 (10) | `false` | **stay `false`** | 1 factor input (Cross-venue taker imbalance) has no persisted `asOf` on all 10 rows; additionally rows 31, 32, 35, 36, 37, 38 carry a *scoring* factor (Developer velocity, 1.5 contribution) with midnight-normalized `asOf`. No date-only/midnight `decision_at`/`issued_at` on any row. |
| equity:AAPL – equity:WMT (50) | `true` | **must move to `false`** (parent decision to relabel; this audit does not rewrite rows) | All 7 factor `asOf` per row are date-only (`2026-10-09`), midnight-normalized in the row; no per-input observation timestamps are row-persisted. Genuine availability evidence exists only upstream (per-ledger `sourceAsOf` pull timestamps in the source JSON) and is not in the row. |

**Result: 60/60 rows lack fully verified decision-time evidence under the strict rule** (10 confirmed false, 50 requiring relabel). No row has a date-only or midnight `decision_at`/`issued_at` — the defect is in the *input-availability* evidence (`asOf`), plus entirely missing entry/alert observation timestamps (60/60 null).

---

## (c) COHORT REPORTING — mandatory split

### The rule
Two cohorts exist in this dataset and they are **never pooled into one N without the split shown alongside**:

- **Cohort P — crypto paired (production vs C-2).** n=10 rows (ids 31–40). Both arms issued (`prod_disposition=issued` 10/10, `c2_disposition=issued` 10/10). This is the *only* cohort in which a paired production-vs-challenger comparison exists. Paired metrics use the §3 cluster-robust intervals.
- **Cohort E — equity production-only.** n=50 rows. **No C-2 counterpart exists**: `c2_disposition=not-applicable:no-challenger-frozen` on 50/50 rows (the freeze specifies no equity challenger; inventing one would be a strategy change). Production arm is `unscored:production-not-issued` 50/50 — scan-qualified candidates that never reached issuance. Reported as production-only descriptive metrics (opportunity coverage, ledger-score distributions); no paired gap is computable.

**Mandatory reporting format:** every figure, table, or readout that touches both cohorts displays the split — `Cohort P (crypto paired): n=10` and `Cohort E (equity production-only): n=50` — with the cohort definitions. A combined "n=60" may appear only as a dataset-size line, never as the denominator of a metric, and never without the split adjacent. Rationale: pooling would average a paired challenger comparison with a challenger-less production-only cohort — a category error that inflates N and silently dilutes the paired result.

### Caveat on the paired cohort (from (b))
Cohort P's 10/10 rows carry `decision_time_verified=false` (incomplete timestamp evidence: one factor input lacks persisted `asOf`; entry/alert observation timestamps absent). The paired cohort is therefore **entirely unverified on decision-time evidence**. Every Cohort P readout must carry this caveat and the verified/unverified split (currently 0/10 verified).

---

## (d) PRIMARY COMPARISON — exact accounting rule

### Status quo (why this gap exists)
`metrics.py` `compare()` restricts the paired comparison to **both-issued rows only** (`prod_disposition == "issued" and c2_disposition == "issued"`), and `model_metrics` averages net R over issued rows alone — abstentions appear only in coverage counts. The both-issued comparison is therefore the *current* implementation; per this gap-closure it becomes the **secondary** sensitivity check.

### The accounting rule (primary)
Work at the **opportunity** level: one opportunity = one comparison row (one candidate at one decision time).

**Per-arm contribution** `c(arm, row)`:
1. **Arm `issued` and outcome graded** → `c` = the arm's graded net R (crypto: net of the frozen 18 bps roundtrip, funding unverified per the frozen cost scenario; equity: per the `equity-eval-3.2.0` cost convention — the crypto 18 bps convention does not apply to equity rows).
2. **Arm `issued` but outcome not yet graded / unverifiable** (`time_exit`, `ambiguous`, `unverified`, `open`, `not-graded`) → `c` = **UNKNOWN**.
3. **Genuine abstention** — the arm *evaluated* the issuance decision and declined (`abstain:*`: `born-dead`, `issuance-validation-unavailable`, `short-regime-gate`) → `c` = **0.000 R exactly, zero cost**. A real zero: it participates in the mean.
4. **Never evaluated** (`unscored:*` — `production-not-issued`, `no-factor-ledger`, `production-unreproduced`) or **no counterpart** (`not-applicable:*`) → `c` = **UNKNOWN**.

**UNKNOWN is counted and labeled per metric, excluded from that metric's interval — never scored as 0, never silently dropped.** (Rationale: `unscored:production-not-issued` is not a decision to stay out; scoring it 0 would credit the arm with a costless correct abstention it never made.)

**Primary comparison:** over all opportunities in the cohort, `d = c(C-2) − c(production)`; the mean of `d` is taken over opportunities where **neither** arm is UNKNOWN, with the COLLECTION-PLAN §3 cluster-robust 95% interval (G ≥ 10). Abstention zeros participate as real zeros. The both-issued-only comparison is reported secondarily as a sensitivity check.

**Single-arm cohorts (equity):** no paired gap exists. Primary = mean per-opportunity production contribution over opportunities where production is not UNKNOWN (genuine abstentions as zeros); reported production-only, never as a challenger gap.

### Worked example — real row dispositions (outcomes all `not-graded` as of 2026-10-14; disposition-level accounting)
| Cohort | Row dispositions (real) | Primary-set classification |
|---|---|---|
| Crypto P (10 rows) | prod `issued` 10/10; C-2 `issued` 10/10; abstains 0; unscored 0 | 10/10 opportunities enter the primary set; per-row `d = netR_c2 − netR_prod` once graded. **Currently all 10 are UNKNOWN** (outcomes pending — checkpoints not yet elapsed), so no primary interval is computable yet; counts: 10 pending, 0 abstention-zeros, 0 unknown-disposition. (Here the primary set coincides with the both-issued set only because no abstentions exist in this slice.) |
| Equity E (50 rows) | prod `unscored:production-not-issued` 50/50; C-2 `not-applicable:no-challenger-frozen` 50/50 | **0 paired opportunities.** All 50 are UNKNOWN for economic purposes (never evaluated through issuance — *not* zeros). Production-only mean is over 0 non-UNKNOWN opportunities = undefined; report as n=50 opportunity-coverage rows, all UNKNOWN. |
| Forward illustration (rule application) | e.g. future row: prod `issued`, C-2 `abstain:born-dead` | `d = 0.000 − netR_prod` — the abstention is a real zero, included. |
| Forward illustration | e.g. future row: prod `unscored:no-factor-ledger`, C-2 `issued` | Row = UNKNOWN (excluded from interval, counted and labeled) — the missing ledger is not a zero. |

**Open implementation item:** `metrics.py` does not implement this rule (both-issued restriction + issued-only net R mean). Implementing the primary comparison is follow-up work, not done by this read-only audit. **Open data item:** the 296 suppressed-stream candidates (dry-run: prod `abstain` 296/296 — `born-dead` 218, `issuance-validation-unavailable` 76, `short-regime-gate` 2) were **not** appended (parent/Logan decision pending). If appended, each contributes a genuine-abstention zero on the production arm in the primary comparison — materially changing the primary set's character, which is exactly why the rule must be frozen before that decision.

---

## (e) HORIZON RECONCILIATION — 30 equity trading sessions → calendar-day deadline

### Frozen facts
- Equity evaluator (`equity-eval-3.3.0`, freeze v2.0.0): "First-touch barrier walk on Yahoo daily bars from the signal date"; **horizon cap = 30 trading sessions**; checkpoints 5/14/30 sessions. Equity model: `decision_clock = xnys-session-close`.
- Crypto evaluator: 30 elapsed calendar days — no calendar needed (24/7 market).
- **No exchange calendar is frozen in v2.0.0** (verified: zero hits for "calendar"/"holiday" in the manifest). The calendar below is therefore *nominated* by this audit, not frozen; freezing it is a manifest-amendment decision.

### Nominated calendar and source
**NYSE (XNYS)** — the frozen decision-clock/session reference (`xnys-session-close`, `next-xnys-regular-session-open-print`). Holiday schedule source: **NYSE Group official 2026/2027/2028 holiday and early-closings calendar announcement** (NYSE Group via ICE press release, 2026-12-23; corroborated by Nasdaq and Morningstar copies). Closures in the relevant span: Thanksgiving 2026-11-26 (Thu), Christmas 2026-12-25 (Fri), New Year's Day 2027-01-01 (Fri), MLK 2027-01-18 (Mon), Presidents Day 2027-02-15 (Mon), Good Friday 2027-03-26. Early closes (day after Thanksgiving, Christmas Eve) remain sessions — they do not remove a trading day.

### Computation
Enumerated every possible signal date in the collection window (2026-10-14 → 2026-12-31) under both session-counting anchors for "from the signal date":
- Anchor A (inclusive: session 1 = signal date if a session): worst span signal date → 30th session = **46** calendar days.
- Anchor B (exclusive: session 1 = first session after signal date): worst span = **47** calendar days — e.g. signal Wed 2026-11-18 → 30th session Mon 2027-01-04, absorbing Thanksgiving (Nov 26), Christmas (Dec 25), and New Year's Day (Jan 1): the maximum 3 weekday NYSE holidays any such window can contain.

Since the frozen evaluator's anchor ("from the signal date") is ambiguous between A and B, the fixed rule covers both.

### The exact rule
> **Equity outcome deadline (per row) = the close of the 30th XNYS session strictly after the NY-calendar date of the entry instant** (`expectedXnysSessions(entryAt, 30)[29]` at session close, 16:00 ET / 13:00 ET early-close) — the frozen evaluator's exact rule (`evaluateEquityTradeSetup`, `measurement.ts`).
> The entry rule (`next-xnys-regular-session-open-print`; entry window expires at the next session's close) fixes the anchor: entry always lands inside the next XNYS session after the signal date. Latest possible entry: signal 2026-12-31 → session **2027-01-04** → 30th session **2027-02-17**. Note the +47 substitution is one day short because it anchored on the signal date and missed the entry rule's session-hop across the New Year weekend.

Worked check on the actual rows: signal session 2026-10-09 (Fri; the session whose close produced the factors) → had a row entered at the next session open (2026-10-12, Mon), its 30th XNYS session = **2026-11-23** (span 45). The 50 retrospective equity rows are `unscored:production-not-issued` — no entry timestamps — so per-row due dates are the formula above, evaluated once prospective rows carry actual `entryAt` values. ✓

### Conflict resolved (2026-10-14, expert correction 1: a calendar calculation, not a decision)
The plan's **2027-01-30** date matches the *crypto* evaluator (30 elapsed days) only. The frozen equity evaluator's entry-anchored 30-session rule computes an equity outcome close of **2027-02-17** (16:00 ET) for the collection window, and a readout by **2027-02-24** (after the final outcome is due; floor 2027-02-18, +7-day buffer per the plan's prior convention — the one stated judgment call). Full derivation: EQUITY-MATURITY-SCHEDULE-2026-10-14.md; encoded in freeze-manifest-v2.1.1.json (v2.1.0's date fields superseded by pointer, bytes untouched).

---

## Summary of the five verdicts

| Gap | Verdict |
|---|---|
| (a) Provenance | **CANNOT CLOSE.** 0/60 rows decided after an applicable freeze — all decisions (2026-10-10T01:51:23Z → 2026-10-14T02:23:07Z) predate v1.0.0 (2026-10-14T02:42:57Z) and v2.0.0 (2026-10-14T04:09:32Z). `freeze_version=2.0.0` is a retrospective backfill. Established: frozen model parameters describe what ran (version match + harness reproduction). Not established: prospective execution; v2 operational-rule execution at decision time. Rows are retrospective-pilot only. |
| (b) Timestamps | **CLOSES AS: 60/60 rows lack fully verified decision-time evidence under the strict rule.** 10 crypto rows stay `false` (missing `asOf` on 1 factor; scoring factor with midnight `asOf` on 6 rows). 50 equity rows must move `true → false` (all 350 factor `asOf` date-only/midnight-normalized; no row-persisted observation timestamps) — relabel is a parent decision; identified fix: persist the upstream per-ledger `sourceAsOf` pull timestamps into the row. No date-only/midnight `decision_at`/`issued_at` anywhere; entry/alert observation timestamps null on 60/60. |
| (c) Cohort reporting | **CLOSED (rule specified).** Cohort P (crypto paired, n=10) reported separately from Cohort E (equity production-only, n=50, no challenger); never pooled into one N without the split alongside. Caveat: Cohort P is 10/10 `decision_time_verified=false`. |
| (d) Primary comparison | **CLOSED (rule specified + worked).** Genuine abstention = 0.000 R / zero cost (real zero); never-evaluated (`unscored:*`, `not-applicable:*`) and ungraded outcomes = UNKNOWN (counted, labeled, excluded from interval — never zeroed, never dropped). Primary = mean per-opportunity paired difference over non-UNKNOWN opportunities with cluster-robust intervals; both-issued-only becomes secondary. `metrics.py` does not yet implement this (follow-up). Worked on real dispositions: crypto 10/10 in primary set but all UNKNOWN pending outcomes; equity 50/50 UNKNOWN, 0 paired opportunities. |
| (e) Horizon reconciliation | **CLOSED (rule computed, 2026-10-14).** No calendar frozen in v2.0.0 — nominated NYSE (XNYS), sourced from the NYSE Group official calendar. **Equity outcome deadline = close of the 30th XNYS session after the entry instant's NY date** (frozen evaluator's exact, entry-anchored rule; the +47 signal-anchored substitution is superseded). **Former conflict CLOSED:** equity outcome close computed **2027-02-17** (16:00 ET), readout by **2027-02-24** — a calendar calculation, not a decision. Crypto close 2027-01-30 unchanged. |

### Gaps that cannot be closed with available data
1. **(a) Prospective provenance** — no freeze existed at any decision time; nothing on disk can retroactively make the decisions prospective. Missing: decisions actually executed under a frozen manifest (future collection only).
2. **(b) Equity decision-time evidence at row level** — the per-ledger `sourceAsOf` pull timestamps exist upstream in `research/factor-ledgers-2026-10-13.json` but are not persisted in any row; per-factor observation times were never recorded (date-only by construction). Missing: row-persisted full-timestamp availability evidence.
3. **(b)/(a) v2 operational execution evidence** — `entry_observed_at` and alert timestamps were never persisted by the pipeline (alert tables empty in the DB copy); the v2 entry contract and waiting-interval veto cannot be evidenced for these rows. Missing: pipeline persistence of entry observations and alert events.
4. **(e) Frozen exchange calendar** — none exists in v2.0.0; the NYSE calendar used here is audit-nominated. The former outcome-close conflict is CLOSED as a calendar computation (2026-10-14; equity close 2027-02-17, readout 2027-02-24). Still missing if ever required: a manifest amendment formally freezing the calendar itself.
5. **(d) Implementation** — `metrics.py` still implements both-issued-only; the primary rule needs code + tests. Missing: implementation (out of scope for this read-only audit).
