# SPEC A v3 → v4 Amendment Record (2026-10-14) — three bounded corrections

**Amends:** `challengers/SPEC-A-CHART-SETUP-v3-2026-10-14.md` (frozen).
**Variant:** V0-v3 thresholds UNCHANGED — no detector threshold was touched by
any amendment below. This is a mechanics-corrections amendment, not a new
variant. Code: `challengers/spec-a/` (detector, collector, validation).
**Scope:** the three corrections requested 2026-10-14 (first-print fidelity,
horizon consistency, statistical feasibility) + the four routine choices.
Nothing else in v3 is reopened.

---

## A1. §6a — First-print fidelity (the substitution bug, repaired)

**Problem.** v3 §6a said "stale prints are skipped, not eligible; waiting
continues for the next print," and `wait_for_entry_print` implemented exactly
that: the FIRST post-decision print, if stale at receipt, was skipped and a
LATER print accepted. That restores the substitution problem the program
already repaired on the paper path (v2.1.7: stale first print → void
`first-print-missed`, never substituted).

**Amended rule (§6a v4).** The FIRST post-decision print's identity is
preserved. Its evidence is checked once, immediately:
- receipt latency ≤ `FRESHNESS_MAX_S` (120s) → entered with THAT print;
- receipt latency > `FRESHNESS_MAX_S` → **`NONENTRY_FIRST_PRINT_STALE`**
  (new named non-entry reason code);
- coverage of the decision instant unprovable, or unresolvable aggId gap →
  `NONENTRY_NO_PRINT`.

The waiter NEVER advances to a later print under this contract. The v3 §6a
sentence "stale prints are skipped, not eligible; waiting continues for the
next print" is WITHDRAWN (ledger item 15).

**Coverage proof (new).** Either an explicit `decision_checkpoint` (last aggId
observed at/before `decision_ts`, new optional parameter) with no gap to the
first returned trade, or the first poll returning ≥1 trade with
`exchange_ts ≤ decision_ts` (the window provably covers the decision instant).
Otherwise the "first" print's identity is unverifiable → `NONENTRY_NO_PRINT`.

**Verified against the actual handler** (`detector/entry.py::wait_for_entry_print`):
the stale-skip branch is gone; the first post-decision trade terminates the
wait in all cases (entered / NONENTRY_FIRST_PRINT_STALE); the pre-decision
skip (`ex_dt < decision_dt → continue`) is retained and is NOT a substitution
— pre-decision prints were never entry candidates.

**Regression:** `validation/test_v4_amendments.py` (v4a1–v4a5): stale first
print → `NONENTRY_FIRST_PRINT_STALE` with no later-print substitution (42/42
pass); fresh first print entered with its own id; uncovered decision instant →
`NONENTRY_NO_PRINT`; checkpoint gap → `NONENTRY_NO_PRINT`; continuous
checkpoint → normal entry.

---

## A2. §7b — Horizon consistency (one endpoint)

**Problem.** v3 §7b stopped barrier evaluation at `entry_ts + 720h` but booked
the time-exit price from the first daily-bar close AFTER the deadline — an
interval where price changes affected returns while stop/target touches were
ignored.

**Amended rule (§7b v4).** ONE endpoint, used consistently for barrier
evaluation AND time-exit pricing:
- **Crypto:** outcome series = Binance.US spot klines **1h**
  (`detector/feeds.py::fetch_binance_us_klines_1h`; one call covers a 720h
  window). Deadline D = `entry_ts + 720h`. **Endpoint = the last 1h-bar close
  ≤ D.** The evaluated set is exactly the 1h bars with
  `entry_ts < bar_close_ts ≤ endpoint`; the time-exit price is the endpoint
  bar's close.
- **Entry-straddling bar:** the 1h bar with
  `(bar_close − 1h) < entry_ts < bar_close` is EXCLUDED from barrier evaluation
  — its intrabar path relative to entry_ts is unknowable from OHLC (explicit).
- **Deadline-straddling:** handled by construction — no evaluated bar has
  `bar_close > endpoint`.
- **Missing evidence:** any missing hour in `(entry_ts, D]`, or a missing
  endpoint bar with no earlier barrier touch → **`EVIDENCE_UNKNOWN`**, never
  imputed (`_crypto_endpoint_and_coverage` proves coverage bar-by-bar).
- **Equities (§7c):** already consistent — entry at session open (no straddle),
  30 session bars, endpoint = the 30th-session bar's own close timestamp
  (resolved from the series, not assumed). Stated explicitly; no change needed.

**Code:** `detector/entry.py::grade_first_touch` rewritten (signature:
`bars, endpoint_ts, entry_model, bar_interval_s`; the `exit_obs_bar`
parameter is gone); `collector/pipeline.py::update_resolutions` takes an
`outcome_fetch(symbol, entry_ts)` callable for the 1h series;
`_exit_observation_bar` removed; re-grades append revision flags
(`store.append_revision`, new `row_revisions` table) instead of silently
overwriting; `resolutions.outcome_granularity_s` added (3600 / 23400).

**Regression:** (v4b–v4b5): straddling-bar stop touch → no phantom STOP_HIT;
post-deadline touch ignored with exit still at the endpoint close; genuine
in-window touch → STOP_HIT; missing endpoint bar → incomplete/unknown;
1h coverage gap → unknown. (v4d): pipeline records EVIDENCE_UNKNOWN when no
1h feed is supplied, with granularity recorded and a revision flag appended
on re-grade.

**Budget update (§12 item 5):** outcome collection now prices honestly — one
`klines?interval=1h&limit=720` call (weight 10, documented) per crypto entry
at/after maturity, plus the monthly readout refresh. The "folded into the
daily feed" wording is superseded for crypto (daily klines cannot supply the
1h endpoint).

---

## A3. §10 — Statistical feasibility (attainability + partition)

**Problem 1: chaining.** v3 §10a dimension B used connected components of the
shock-linkage graph. Simulation (seeded, 40 reps; collection window
2026-10-14→2027-06-30 = 259 days; 30-day outcome windows):

| signals/day | E[n] | B (v3 components) | B (week blocks) | A |
|---|---|---|---|---|
| 0.1 | 25 | 20.5 | 17.6 | 24.4 |
| 0.2 | 51 | 29.3 | 28.1 | 48.5 |
| 0.3 | 78 | 23.6 | 32.7 | 73.2 |
| 0.5 | 131 | **7.6** | 36.0 | 117.1 |
| 1.0 | 262 | **2.2** | 36.9 | 207.9 |

The v3 rule collapses to 7.6 / 2.2 components exactly when the most data
exists — the ≥20 gate was perversely hardest to meet with abundant signals.
A trial using it is structurally destined to be inconclusive.

**Amended rule (§10a v4).** Dimension B = **decision-week blocks**: 7-day
blocks anchored `2026-10-14T00:00Z` (`collector/analysis.py::
decision_week_block`). Fixed, non-overlapping — cannot chain by construction.
Maximum 38 blocks in the window. Attainability: ≥20 active weeks is expected
at ≥0.2 signals/day (one signal per 5 days across 111 assets — modest);
at 0.1/day the expectation is 17.6, i.e. the trial would honestly lack data,
not be structurally blocked.

**Extension contingency (pre-registered, v4).** If week-clusters < 20 at
2027-06-30, collection extends ONE 3-month block (to 2027-09-30), final
readout moves to 2027-11-15. No second extension is pre-registered — two
extensions without 20 active weeks means the method fires too rarely to
validate: report INSUFFICIENT EVIDENCE with the run-rate stated. **The bar is
never lowered to manufacture a verdict.**

**Problem 2: dead zone.** v3 §10b left CIs entirely inside (−0.25R, +0.25R)
(e.g. (−0.10, +0.20)) fitting NONE of the three outcomes.

**Amended partition (§10b v4)** — covers the whole real line (frozen in code,
`collector/analysis.py::classify_outcome`):
- **SUPPORT:** every comparator's 95% CI lower bound > +0.25R, AND ≥20
  clusters in each dimension, AND target-before-stop ≥ 40%.
- **FAILURE TO MEET CRITERION:** the 95% CI of Δ vs the **dossier comparator**
  lies entirely below 0 (upper bound < 0), gates met. (v3 used −0.25R vs "best
  comparator"; v4 uses 0 vs the dossier comparator: failure = evidence the
  setup adds no value vs the production engine, not evidence of a large
  negative edge. Rationale recorded; the change is explicit.)
- **INSUFFICIENT EVIDENCE:** every other case — gates unmet, or any CI
  intersecting [0, +0.25R], or too wide to decide.

Partition proof: for the dossier CI, exactly one of (a) lo > +0.25,
(b) hi < 0, (c) neither (CI intersects [0, +0.25R]) holds → (a)+gates+guard =
SUPPORT, (b)+gates = FAILURE, else INSUFFICIENT. Nothing is unclassified.

**Regression:** (v4c1–v4c5): dead-zone CI → INSUFFICIENT_EVIDENCE; all-CI-above-margin → SUPPORT;
TBS guard blocks SUPPORT; dossier-CI-below-zero → FAILURE_TO_MEET_CRITERION;
gates unmet → INSUFFICIENT despite strong CI; week blocks non-chaining and
bounded (max 38); extension iff B gate unmet.

---

## A4. §9 — Comparator semantics (resolved from source, not inferred)

The v3 §15.3 open dependency ("confirm the exact production decision semantics
to replay") is CLOSED from the source exports — no expert-loop inference needed:

- **Crypto** (`crypto-dossier-factor-agreement` 2.0.0): `analyzeCoin` →
  `issueGeneratedSignalCandidate` (actions.ts:1977). Entry convention
  `first-post-decision-provider-quote`: a timestamped post-decision CoinGecko
  markets quote (`quoteReceivedAt ≥ createdAt`); entry re-leveled onto that
  quote via `buildAtrLevels`; no quote → suppressed. Qualification: complete
  factor ledger, Wilder ATR-14, non-null levels, no same-day same-direction
  (`hasToday`), born-dead veto, short-regime gate, idempotent coin|day key.
  Horizon 30 elapsed days; `evaluateTradeSetup` on daily candles. No
  minimum-confidence threshold. Comparator rows replay with THESE semantics at
  the same `decision_ts`; `comparator_replay: confirmed-from-source`.
  (Source: `paper-signals/comparison/DOSSIER-VS-PAPER-ENGINE-2026-10-14.md`,
  itself code-verified.)
- **Equities** (`equity-factor-agreement` 3.1.0): `analyze()` → `recordSignal()`.
  Entry = signal-day adjusted close, explicitly "paper execution is not
  claimed." The program's own evaluator REFUSES these as trade setups
  (`evaluateEquityTradeSetup` → `UNVERIFIED / research_only_entry`,
  measurement.ts:129-163). Therefore the equity comparator is graded as a
  **directional-call benchmark**: first-touch mechanics on the dossier's own
  levels (stop = entry ∓ 2.00×ATR-14, targets 1.5R/2.5R, 30 XNYS sessions,
  entry = signal-day close), labeled
  `comparator_grading: directional-benchmark` — derived from the real
  functions, not invented.

**Routine choice (§15.5) CONFIRMED:** all-rows with two-way clustering is
primary; first-entry-only is the robustness check.

---

## A5. §11 — Report fields (v4 additions)

Add to every readout: `NONENTRY_FIRST_PRINT_STALE` with counts (report fields
list); `endpoint_ts` per resolved row (== `horizon_end`); `outcome_granularity_s`
(3600 crypto / 23400 equities); `decision_week_block` per row; n_A / n_B
cluster counts (week blocks for B); the extension-contingency status at the
final readout.

## A6. Universe (routine choice)

The verified supported universe `paper-signals/universe/SUPPORTED-UNIVERSE-v1.0.0.json`
is the challenger universe (frozen v1.0.0). Assets outside it are
`EXCLUDED_NO_VERIFIED_FEED`, never silently dropped.

---

## Withdrawn-claims ledger — v4 additions (§14 continued)

15. §6a v3: **"stale prints are skipped, not eligible; waiting continues for
    the next print" — WITHDRAWN.** It restored the substitution bug. Replaced
    by first-print fidelity + `NONENTRY_FIRST_PRINT_STALE` (A1).
16. §7b v3: **"exit = first venue daily-bar close at or after the deadline"
    — WITHDRAWN** as inconsistent with barrier evaluation stopping at the
    deadline. Replaced by the single-endpoint rule on 1h bars (A2).
17. §10a v3: **shock-linkage connected components for dimension B —
    WITHDRAWN.** Simulation proved perverse collapse (2.2 components at 262
    signals). Replaced by decision-week blocks (A3).
18. §10b v3: **FAILURE defined as CI entirely below −0.25R vs "best
    comparator" — REPLACED** by CI entirely below 0 vs the dossier comparator
    (A3); the dead-zone gap in the three outcomes is closed by the new
    partition.
19. §12 item 5 v3: **"outcome collection folded into the daily feed" —
    SUPERSEDED for crypto** by priced 1h outcome calls (A2).
20. §15.3: **comparator semantics "to be confirmed via expert loop" —
    CLOSED** from the source exports (A4). §15.5 primary-vs-robustness —
    CONFIRMED as all-rows primary / first-entry-only robustness.

## Open questions (§15) — v4 status

- #3 (production same-timestamp replay): **CLOSED** (A4).
- #5 (primary vs robustness): **CONFIRMED** (A4).
- #7 (Yahoo revision at entry session): unchanged, still open.
- #8 (Binance.US pair availability): unchanged, still open.

---

## Regression evidence (this amendment)

- `challengers/spec-a/validation/test_v4_amendments.py` — **42/42 pass**
  (first-print fidelity ×5, single-endpoint grading ×5, coverage ×2,
  partition ×5, pipeline EVIDENCE_UNKNOWN + revision flags ×7).
- `validation/test_detector_synth.py` — 35/35 pass (no regressions).
- `validation/test_collector_synth.py` — 49/49 pass (one expectation updated
  to the v4 single-endpoint rule: horizon_end = the endpoint bar's own close).
- `validation/smoke_run.py` — clean (3 evaluations, 0 qualifications, as
  predicted with 9–13 bars).
- Total: **126/126 pass.**
- Evidence logs: `challengers/spec-a/validation/evidence/`.

## Files changed (v4)

- `challengers/spec-a/detector/entry.py` — first-print fidelity rewrite;
  single-endpoint grader rewrite.
- `challengers/spec-a/detector/feeds.py` — `fetch_binance_us_klines_1h`.
- `challengers/spec-a/detector/reason_codes.py` — `NONENTRY_FIRST_PRINT_STALE`.
- `challengers/spec-a/detector/__init__.py` — export the 1h fetcher.
- `challengers/spec-a/collector/pipeline.py` — `update_resolutions` with
  `outcome_fetch`; `_crypto_endpoint_and_coverage`; `_resolve_crypto` /
  `_resolve_equity`; revision flags on re-grade; `_exit_observation_bar`
  removed.
- `challengers/spec-a/collector/store.py` — `row_revisions` support,
  `outcome_granularity_s` migration.
- `challengers/spec-a/collector/schema.py` — `row_revisions` table,
  `outcome_granularity_s` column.
- `challengers/spec-a/collector/analysis.py` — NEW: pre-registered decision
  rule (week blocks, partition, extension contingency) as code.
- `challengers/spec-a/validation/test_v4_amendments.py` — NEW: 42 regressions.
- `challengers/spec-a/validation/test_collector_synth.py` — one expectation
  updated to the v4 endpoint rule.

**Thresholds:** none changed. Variant remains V0-v3 for detection; the
amendment is recorded as `v4-amendment-2026-10-14` on mechanics only.
