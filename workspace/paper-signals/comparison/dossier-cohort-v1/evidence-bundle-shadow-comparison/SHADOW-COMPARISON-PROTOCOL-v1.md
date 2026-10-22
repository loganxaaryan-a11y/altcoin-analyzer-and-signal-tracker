# Directional Shadow Comparison — Protocol v1 (FROZEN)

**Frozen:** 2026-10-14. **Collection window:** 2026-10-15T00:00:00Z →
2027-02-15T00:00:00Z. **Final readout:** 2027-02-25 (all 5D outcomes mature by
2027-02-20). Changes to any frozen element require a protocol version bump (v2+);
v1 rows are never re-graded under a new version.

Paper signals only. No brokerage. No model tuning. Shadow only — **nothing in
this protocol authorizes live inversion of any model.**

---

## 1. What this is

A dual-arm shadow comparison inside the dossier collector
(`dossier-cohort-v1`), testing whether the dossier direction vote's retrospective
inversion outperformance persists prospectively. Two arms are captured for every
eligible dossier recommendation:

- **Arm ORIG** — the model's direction and published levels, unchanged.
- **Arm INV** — the inverted direction with **mirrored levels** (see §3).

The original dossier records are preserved untouched; shadow rows live in a
separate file (`rows/dossier-shadow-comparison-v1.csv`) and link by
`dossier_row_id`.

## 2. Capture trigger

A shadow row pair is written when a `dossier-cohort-v1` row has a recorded entry
disposition (`entry_status_at_record` resolved: `entered`, `expired_non_entry`,
`void_drift`, or `void_no_quote`) **and** its `decision_at_utc` is at or after
the collection start (2026-10-15T00:00:00Z) — prospective only; the three
pre-window 09:00 ET seed rows are excluded. Decision-time evidence is copied
verbatim from the cohort row — both arms are captured from the **same decision
instant** with the **same evidence cutoff**. Capture is append-only; dedupe on
(`dossier_row_id`, `arm`).

## 3. Level mirroring (frozen convention)

Risk and reward distances are held constant; levels are mirrored around the
entry price. Identical numerical stop/target prices cannot serve opposite
directions — the mirror is computed explicitly:

- `risk = |entry − stop_orig|`, `reward = |target1_orig − entry|`
- Inverted long: `stop = entry − risk`, `target = entry + reward`
- Inverted short: `stop = entry + risk`, `target = entry − reward`
- The ORIG arm keeps the dossier's published `invalidation` / `target1` verbatim.

This is the same convention as the retrospective diagnostic (v7 `mirrored()`).

## 4. Entry convention (one, frozen, observable)

Both arms share the cohort row's entry observation under the frozen
`actionable-entry-v1` contract: the **first eligible verified post-decision venue
print** inside the 15-minute entry window is the shared entry price for both arms
(entry identity preserved; a stale first print → named non-entry, never a later
print substituted). If the cohort row is a non-entry, both arms are non-entries
with the same named reason. Entry evidence (venue, timestamps, print identity) is
referenced from the cohort row, not duplicated.

## 5. Five-day endpoint + calendar convention (frozen)

- **Endpoint:** `endpoint_ts = entry_ts + 5 × 24h` (elapsed calendar days; the
  cohort is crypto-terminal only — 24/7 markets, no session calendar needed).
- **Grading venue/data:** the same venue feed as the entry print. Grade
  first-touch of the arm's stop vs target on venue bars in `(entry_ts,
  endpoint_ts]`.
- **Barrier outcome per arm:** `HIT` (target touched first), `MISS` (stop touched
  first), `TIME_EXITED` (neither touched by endpoint — priced at the last venue
  close ≤ endpoint_ts), `UNKNOWN` (missing outcome evidence — never imputed).
- **Gross direction per arm:** endpoint close on the arm's side of entry
  (`yes` / `no` / `unknown`).
- **Net horizon return per arm:** first-touch net R multiple, **18 bps roundtrip
  modeled** (a modeled cost scenario, not verified execution cost); TIME_EXITED
  rows return to the time-exit price net of costs.
- Ambiguous bars (both levels touched in one bar without intrabar ordering):
  excluded as `UNKNOWN` with the bar identified.
- The three outcomes are recorded **separately** per arm — never collapsed into
  one score.

## 6. Hypothetical shorts

Any short arm on crypto spot (ORIG or INV) is a **hypothetical directional
benchmark** — no borrow or derivative execution model exists. Flagged in the
`hypothetical_short` column on every such row. This label travels with all
reports.

## 7. Unknown evidence

Missing entry evidence → named non-entry. Missing outcome evidence → `UNKNOWN`
outcome. Unknowns are counted and reported; they are never imputed, never scored
as zero, and never silently dropped.

## 8. Statistical rules (this protocol's own — not Challenger A's)

- **Dependence preserved:** report the decision-date structure with every readout
  (distinct decision dates, max rows on one date). Overlapping 5-day exposures
  across assets and dates are expected; the primary statistic is the **mean
  paired inv-minus-orig R difference** with a **decision-date block interval**
  (block = decision date; blocks never chain across dates).
- **INSUFFICIENT EVIDENCE is an allowed outcome** and the default when the
  interval is wide or the paired n is small.
- **Pre-registered read rule (final readout 2027-02-25):**
  - If mean paired R-diff ≥ +0.25 R with the block interval excluding zero →
    **warrants further testing** (a direction-model rebuild investigation is
    authorized; nothing more).
  - Otherwise (interval includes zero, favors ORIG, or paired n too small for a
    meaningful interval) → **INSUFFICIENT EVIDENCE**. Failure to prove inversion
    does **not** disprove it.
- **Success justifies further testing only.** It does not establish a permanent
  sign error, does not authorize live inversion, and does not change any frozen
  model.
- Monthly progress readouts are descriptive (counts, paired n, decision-date
  structure); no repeated promotion testing without a sequential rule — none is
  pre-registered here.

## 9. What this protocol does not do

- It does not change the dossier cohort, the frozen paper trial, any model, or
  any holdout.
- It does not grade before the endpoint elapses.
- It does not pool shadow arms with any other cohort's performance figures.
