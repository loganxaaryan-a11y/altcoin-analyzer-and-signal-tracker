# Directional Shadow Comparison — Protocol v1 (FROZEN)

**Frozen:** 2026-10-14. **Collection window:** 2026-10-15T00:00:00Z →
2027-02-15T00:00:00Z. **Final readout:** 2027-02-25 (all 5D outcomes mature by
2027-02-20). Changes to any frozen element require a protocol version bump (v2+);
v1 rows are never re-graded under a new version.
**Read-rule freeze (§8):** 2026-10-14, pre-collection — zero prospective shadow
rows existed at freeze time (verified; see §8 preamble). Collection end and
readout unchanged.

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

**Pre-collection freeze note (2026-10-14):** before freezing this section it was
verified that no prospective shadow rows existed: `rows/` contained only
`dossier-cohort-v1.csv` (3 cohort rows, all with decision dates 2026-10-14 — the
pre-window 09:00 ET seed rows this protocol excludes); no
`dossier-shadow-comparison-v1.csv` existed and no shadow rows carried decision
dates ≥ 2026-10-15. The read rule below is therefore frozen prospectively, not
retroactively.

### 8.1 Primary endpoint (frozen)

The **primary endpoint** is the **mean paired inv-minus-orig net R difference**
per row, computed over the paired set (rows definitive in both arms). Barrier
outcome, gross direction, and net return are recorded separately per arm (§5)
and may be reported descriptively, but the read rule (§8.5) applies to the
primary endpoint only.

### 8.2 Five-day calendar convention (frozen)

Elapsed calendar days: `endpoint_ts = entry_ts + 5 × 24h` (§5). Both arms of a
pair share the same entry instant and the same grading window `(entry_ts,
endpoint_ts]` on the entry venue's bars. No trading-session calendar is used
(crypto 24/7 markets). This convention is identical for every row — no per-row
or per-asset calendar discretion.

### 8.3 Block method (frozen)

The interval around the primary endpoint is a **decision-date block interval**:
each block is one UTC calendar decision date; every paired row belongs to
exactly one block by the UTC date of its `decision_at_utc`; blocks are never
merged, split, or chained across dates. The interval is computed over
block-level paired-mean differences.

**Blocks are an approximation, not an independence claim.** Rows decided on
adjacent dates carry overlapping 5-day exposure windows (a row decided on date D
is exposed over [D, D+5d]; a row decided on D+1 over [D+1, D+6d]) and share the
same market regime. Cross-block dependence is real, unmodeled, and reported —
never assumed away (see §8.4).

### 8.4 Cross-block dependence handling (frozen)

Every readout (monthly descriptive and final) must report, alongside the primary
endpoint and block interval:
1. Distinct decision dates, rows per date, max rows on one date.
2. The maximum number of concurrently open 5-day exposure windows on any
   calendar day.
3. The fraction of paired rows whose exposure window overlaps at least one
   paired row from a *different* decision date (cross-date exposure overlap).
4. The number of decision-date blocks.

Because residual cross-block dependence is unmodeled, the block interval is
reported as an **approximate interval**, and the read rule's affirmative verdict
is deliberately capped at "warrants further testing" (§8.5). This protocol
never claims to have measured an improvement of any size.

### 8.5 Pre-registered read rule (final readout 2027-02-25)

The read rule is evaluated **only** when the minimum-data requirement (§8.6) is
met.

- If mean paired R-diff ≥ **+0.25 R** with the block interval excluding zero →
  **WARRANTS FURTHER TESTING**: a direction-model rebuild *investigation* is
  authorized. Nothing more.
- Otherwise → **INSUFFICIENT EVIDENCE** (§8.7).

**Scope cap (frozen):** this read rule is acceptable ONLY for the verdict
"warrants further testing." It does **not** establish an improvement of at
least +0.25 R, does not establish a permanent sign error, does not estimate the
size of any effect, does not authorize live inversion, and does not change any
frozen model. The +0.25 R figure is a screening threshold on a noisy point
estimate from a small, correlated sample — not a measured effect size.

### 8.6 Minimum-data requirement (frozen)

The read rule (§8.5) is applied at the final readout only when **both** hold:
- paired n ≥ **20** (the same floor the dossier ledger uses for comparative
  claims);
- ≥ **5** distinct decision-date blocks.

With paired n < 20 or fewer than 5 blocks, the outcome is INSUFFICIENT EVIDENCE
regardless of the point estimate or interval. Monthly progress readouts are
descriptive only (counts, paired n, decision-date structure, the §8.4 dependence
diagnostics); no repeated promotion testing without a sequential rule — none is
pre-registered here.

### 8.7 INSUFFICIENT EVIDENCE — named outcome (frozen)

**INSUFFICIENT EVIDENCE** is a named, first-class trial outcome. Triggers (any
one suffices):
1. The minimum-data requirement (§8.6) is not met.
2. The block interval includes zero.
3. The paired point estimate favors ORIG, or is below the +0.25 R screen.
4. The block interval cannot be computed (fewer than 2 decision-date blocks).

Meaning: the trial provides no basis for a direction-model verdict. Failure to
prove inversion does **not** disprove it, and INSUFFICIENT EVIDENCE is not a
finding that the direction model is fine. No rebuild investigation is
authorized; the inversion hypothesis remains untested — neither retired nor
adopted.

## 9. What this protocol does not do

- It does not change the dossier cohort, the frozen paper trial, any model, or
  any holdout.
- It does not grade before the endpoint elapses.
- It does not pool shadow arms with any other cohort's performance figures.
