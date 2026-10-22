# SPEC A v4 → v5 Amendment Record (2026-10-14) — two bounded corrections

**Amends:** `challengers/SPEC-A-CHART-SETUP-v3-2026-10-14.md` (frozen) as
amended by `challengers/SPEC-A-CHART-SETUP-v4-AMENDMENT-2026-10-14.md`
(frozen). Neither is edited in place.
**Variant:** V0-v3 thresholds UNCHANGED — no detector threshold was touched by
any amendment below. This is a mechanics-corrections amendment, not a new
variant. Code: `challengers/spec-a/` (detector, collector, validation).
**Scope:** the two corrections requested 2026-10-14 (straddling-hour grading
honesty; frozen statistical amendment for the dependence structure). Nothing
else in v3/v4 is reopened.

---

## B1. §7b — Entry-straddling hour: finer evidence or UNKNOWN

**Problem.** v4 §7b excluded the entry-straddling 1h bar from barrier
evaluation and then declared later outcomes definitive — silently ignoring
the first hour of exposure. Concrete failure: the stop is touched inside the
straddling hour, price then rallies to the target; v4 grades TARGET1_HIT
"definitive". The first touch may have been the stop. That definitive is
fabricated.

**Amended rule (§7b v5).** The straddling hour is resolved, never skipped:
- The straddling bar is the 1h bar with
  `(bar_close − 1h) < entry_ts < bar_close` (strict — an entry exactly on a
  bar boundary does not straddle; the whole bar is post-entry and is
  evaluated normally). Its barrier-touch set
  `S ⊆ {stop, target1, target2}` is computed from its OHLC range
  (`detector/entry.py::straddle_touch_set`). A recorded touch may predate
  `entry_ts` within the hour — that is exactly what the rule below resolves.
- `S` empty → the hour provably could not touch any barrier; later outcomes
  stand as definitive (unchanged from v4).
- `S` non-empty → **finer evidence first**: 1m klines over the straddling
  window `(entry_ts, straddle_close]` (`detector/feeds.py::
  fetch_binance_us_klines_1m`; wired through
  `collector/pipeline.py::update_resolutions(finer_fetch=...)`, called only
  when a touching straddle exists). Coverage is proven bar-by-bar by the
  grader — complete bars, contiguous tiling, the first finer bar's open
  at/before `entry_ts`, the last finer close == the straddle close. Gapped
  or short finer series = no finer evidence, never partial-graded. Proven
  finer bars are graded in path order (stop → target1 → target2; both
  barriers in one finer bar → AMBIGUOUS); the first finer touch resolves;
  a clean hour (no post-entry touch) leaves the 1h grading definitive.
- **No finer evidence AND the hour could change the result →**
  **`STRADDLE_UNRESOLVED`** (new code, `detector/reason_codes.py`):
  terminally non-definitive — `complete=True` (the grading concluded; the row
  is not pending), no exit price, no R multiple, excluded from rate
  denominators exactly like AMBIGUOUS, never imputed. The 1h series'
  eventual outcome is computed but NOT declared.
- **Narrow entailed exception** (the only case the hour cannot change the
  *result*): eventual STOP_HIT, `S == {stop}`, and the eventual fill is the
  stop level exactly (no adverse gap-through claimed). Every consistent
  world then yields STOP_HIT at the stop level — a post-entry touch fills at
  the stop; a pre-entry touch leaves the later stop-level fill unchanged —
  so STOP_HIT stands with `resolution_ts` conservatively at the straddling
  bar's close and the timestamp ambiguity noted. Any gap-through fill, any
  target in `S`, any eventual TARGET hit / TIME_EXITED / AMBIGUOUS →
  STRADDLE_UNRESOLVED.

**Finer feed honesty.** The 1m fetch is best-effort. A failed, empty, or
gapped finer return is "no finer evidence" → the UNKNOWN branch above. A
missing finer feed NEVER restores the v4 silent-exclusion behavior.

**Equities:** unchanged — entry at session open is the bar's open, so no
straddle exists by construction (verified by test v5j).

**Code:** `detector/entry.py::grade_first_touch` rewritten around the v5 rule
(new `finer_bars` / `finer_interval_s` parameters; new helpers
`straddle_touch_set`, `_grade_straddle_finer`, `_apply_straddle_no_finer`,
`_grade_windowed`); `collector/pipeline.py::update_resolutions` takes
`finer_fetch(symbol, entry_ts, straddle_close_ts) -> list[Bar] | None` and
`_resolve_crypto` calls it only for touching straddles;
`detector/feeds.py::fetch_binance_us_klines_1m` (one call per straddle
window, 60 bars); `RC.STRADDLE_UNRESOLVED`; schema comment updated
(resolution_type TEXT — no migration needed).

**Budget update (§12 item 5, v5 addition):** one `klines?interval=1m&limit=60`
call (weight 10, documented) per crypto entry whose straddling hour touched
a barrier — expected rare; best-effort, absence never degrades to silent
exclusion.

**Regression:** `validation/test_v5_amendments.py` (33 checks, all pass):
(v5a) clean straddle → later TARGET1_HIT definitive; (v5b) stop-touch
straddle + later target hit, no finer → STRADDLE_UNRESOLVED (not a
fabricated TARGET1_HIT); (v5c) stop-touch straddle + eventual TIME_EXITED →
STRADDLE_UNRESOLVED; (v5d) the narrow entailed STOP_HIT exception stands
with conservative timestamp; (v5e) gap-through fill → STRADDLE_UNRESOLVED;
(v5f) finer 1m bars resolve a stop touch in-hour → STOP_HIT at finer
resolution; (v5g) clean finer hour → later outcome definitive; (v5h) gapped
finer series → STRADDLE_UNRESOLVED; (v5i) stop+target in one finer bar →
AMBIGUOUS; (v5j) boundary entry does not straddle; (v5k) pipeline wiring —
`_resolve_crypto` fetches finer only for the straddle window, honors
clean/resolving/absent finer feeds; (v5l) `straddle_touch_set` detection.
`test_v4_amendments.py` (42 pass): the two v4b cases asserting silent
exclusion are updated to the v5 rule with supersession notes; all other v4
cases unchanged and passing. Detector (35) and collector (49) synth suites
pass unchanged.

## B2. Statistical amendment (adopted)

Challenger A adopts the shared frozen statistical amendment
`paper-signals/comparison/STATISTICAL-AMENDMENT-v1-2026-10-14.md` (frozen
2026-10-14, pre-evaluation — zero detections and zero production resolutions
existed; no outcome data was inspected or used in choosing the method), with
the following protocol-specific bindings:

1. **Overlap diagnostics** (amendment §S1) are computed on the resolved
   opportunity set at every readout (monthly descriptive + final), from
   entry timestamps and window lengths only, and reported alongside — they
   never enter the interval.
2. **Dependence method** (amendment §S3): two-way Cameron–Gelbach–Miller
   cluster-robust SEs, frozen v4 §10a, stated explicitly —
   **Dimension A = asset × window chains**, where the dependence unit is the
   union of overlapping exposures on the same asset (two entries on the same
   asset whose outcome windows overlap, chained transitively);
   **Dimension B = decision-week blocks** (fixed 7-day blocks anchored
   2026-10-14T00:00Z — cannot chain by construction). The point estimator is
   the all-rows mean (each opportunity row counted exactly once);
   first-entry-only remains the pre-registered robustness check. Both
   dimensions are computable from entry timestamps, assets, and window
   lengths before outcomes are inspected.
3. **Estimand** (amendment §S4): the per-opportunity mean net R (and, for
   comparators, the difference of per-opportunity means). The all-rows
   primary counts each opportunity once — cluster/date means are never
   averaged equally (that targets the mean-of-cluster-means, a different
   estimand that upweights sparse clusters).
4. **Minimum data** (amendment §S5): the v4 gates (≥ 20 clusters in each
   dimension) PLUS ≥ 40 rows total. The row floor is new and strictly
   additional — it can only keep a verdict at INSUFFICIENT_EVIDENCE, never
   promote one. Below the requirement the outcome is
   **INSUFFICIENT_EVIDENCE** — never SUPPORT, never FAILURE_TO_MEET_CRITERION.
   The v4 extension contingency is unchanged; the bar is never lowered to
   manufacture a verdict.

---

## Withdrawn-claims ledger — v5 additions (§14 continued)

21. §7b v4: **"the 1h bar containing entry_ts ... is EXCLUDED from barrier
    evaluation" — WITHDRAWN.** Silent exclusion followed by a definitive
    later outcome fabricated certainty about the first hour. Replaced by
    finer-evidence-or-UNKNOWN (B1): finer 1m resolution where available;
    STRADDLE_UNRESOLVED where the hour could change the result.
