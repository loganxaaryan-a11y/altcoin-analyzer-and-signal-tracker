# Workstream A/C — Prediction comparison freeze + harness

Freeze manifest **v2.1.0** (frozen 2026-10-14) is CURRENT — see
`freeze-manifest-v2.1.0.json`. Sandbox/research only. No production changes,
no threshold tuning, no strategy changes. `freeze-manifest-v2.0.0.json` is
SUPERSEDED — see `FREEZE-v2.0.0-SUPERSEDED.md`; `freeze-manifest-v1.0.0.json`
stays superseded under `FREEZE-v1.0.0-SUPERSEDED.md`. The v2.1.0 manifest
closes the measurement audit (MEASUREMENT-GAPS-2026-10-14.md, authoritative):
real parameter hashes, the audit's primary economic comparison
(`metrics.py::compare_primary`), the cohort reporting split, and the equity
maturity schedule (expert correction 1, 2026-10-14: the former +47-day
substitution and the 2027-01-30 vs 2027-02-16 conflict flag are superseded
by the computed calendar in EQUITY-MATURITY-SCHEDULE-2026-10-14.md and
encoded in `freeze-manifest-v2.1.1.json` — a calendar calculation, not a
decision; v2.1.0's bytes are untouched).

## What v2.0.0 freezes

`freeze-manifest-v2.0.0.json` matches the REPAIRED pipeline exactly:

- **actionable-entry-v1 contract** (`entry-v1/src/contract.ts`,
  `entry-rules.ts`, `watcher.ts`): decisionAt (information-cutoff commit
  instant) vs sourceObservedAt (provider observation instant) vs
  entryReceivedAt (server receipt); per-terminal entry rule (equity:
  next-xnys-regular-session-open-print; crypto:
  first-post-decision-binance-spot-trade); 15-min crypto expiry window;
  drift caps 0.50 equity / 1.50 crypto; 5-min observation-age limit
  (prints older are skipped, never entered); anti-fabrication evidence
  rule (no evidence ⇒ no fill price, ever).
- **waiting-interval veto** (`veto/src/waiting-interval.ts`, `veto.ts`):
  setup-history filter (pre-decision extremes are recorded features, never
  stop-outs) as a SEPARATE check from the genuine decision→entry
  invalidation over [contract.decisionAt, entryObservedAt]; entry-straddling
  candle handling; "a touch is a touch"; fail-closed uncertainty.
- **venue mapping** (`entry-rules.ts` ENTRY_VENUE_ACCEPTED_PRINT_LABELS,
  consumed at `orchestrator/src/issuance/handler.ts`): consolidated-tape
  for equity, binance-spot for crypto; wrong-venue prints are skipped.
- **level construction** (`entry-v1/src/levels.ts`): decision-time
  invalidation immutability; explicit rebuild policy (freeze-at-decision is
  the v2 rule); validatePublishedLevels fails loudly on mismatch; the
  veto-tested stop must equal the published stop.
- **corrected evaluator**: crypto `crypto-evaluation-v5-corrected`
  (first-touch barrier walk: invalidation-first MISS / target1-first HIT /
  same-block double-touch AMBIGUOUS; issuance-straddling touch ⇒
  TIMING_UNVERIFIED, terminal; uncertainty-terminal hard rule; 30-day cap;
  18 bps roundtrip, funding unverified); equity `equity-eval-3.3.0` (same
  barrier semantics on daily bars + CE-002 same-day TIMING_UNVERIFIED;
  30-session cap; equity-eval-3.2.0 cost convention).

**Both arms use IDENTICAL operational rules.** C-2's ONLY model difference
is removing Momentum (10 factors / weight 15.5 vs production's 11 / 17.0).
No equity challenger is frozen (none specified — inventing one would be a
strategy change).

Models:
- `crypto-dossier-factor-agreement` v2.0.0-measurement-contract — production, crypto (11 factors, total weight 17.0)
- `crypto-dossier-minus-momentum` v0.1.0-shadow — challenger C-2, crypto (10 factors, total weight 15.5; the ONE deliberate difference from production)
- `equity-factor-agreement` v3.1.0-measurement-closure — production, equity (7 factors, total weight 90; frozen for measurement integrity; NO equity challenger is frozen)

Every source file the freeze depends on is recorded with a SHA-256
re-hashed from the actual file at freeze time (see the manifest's
`operational_rules.source_files` and per-model `source_files`).

## Files

| File | Purpose |
|---|---|
| `freeze-manifest-v2.0.0.json` | The CURRENT frozen definitions (models + operational rules + evaluator) + source hashes |
| `FREEZE-v1.0.0-SUPERSEDED.md` | Why v1.0.0 is superseded; v1 rows quarantine notice |
| `freeze-manifest-v1.0.0.json` | SUPERSEDED manifest — immutable, kept for audit, never edited |
| `harness.py` | Scoring under both models from decision-time inputs; mirrored levels/gates; comparison-row schema (v2: +`qualified` decision branch, MANIFEST_VERSION 2.0.0; all formulas identical to v1; workstream-B amendment: suppressed-with-ledger-but-no-recorded-score routes production to abstain + scores the challenger — see docstring §3) |
| `metrics.py` | Per-model metrics with uncertainty (Wilson 95% CI; mean ± 1.96·SE) |
| `collect_pilot_rows.py` | **Workstream B**: prospective collection runner — validates, scores via the harness, appends to the pilot file with idempotency + quarantine guards; operational-trace schema extension; suppressed-candidate ingest |
| `build_pilot_rows.py` | Builds REAL pilot rows from persisted decision-time factor ledgers |
| `seed_rows.py` | PLUMBING TEST ONLY — exercises the harness on sandbox fixtures; row_origin always `plumbing-test`, never `pilot` |
| `tests/test_harness.py`, `tests/test_collector.py`, `tests/run_tests.py` | 67 unit tests, all passing (TestManifest targets the v2 freeze; collector tests cover quarantine, dedupe, suppressed candidates, unverified-input flagging) |
| `collection-run-log-2026-10-14.md` | Workstream-B collection run log (dedupe verification + trace backfill + suppressed-stream dry-run preview) |
| `rows/comparison-rows-pilot-2026-10-14.csv` / `.jsonl` | **60 real pilot rows** under v2.0.0 (10 crypto production-issued + 50 equity scan-qualified) |
| `rows/comparison-rows-2026-10-13.csv` / `.jsonl` | QUARANTINED v1 sandbox-seeded rows — audit only, excluded from pilot statistics |
| `rows/plumbing-test-rows-2026-10-13.csv` / `.jsonl` | Current plumbing-test output (regenerable; never pilot data) |

## How to run

```bash
cd ~/workspace/goals/research-terminal/paper-signals/comparison

# 1. Run the test suite (42 tests)
python3 tests/run_tests.py

# 2. Rebuild the REAL pilot rows (read-only vs workspace DB copies)
python3 build_pilot_rows.py
# -> rows/comparison-rows-pilot-2026-10-14.csv

# 3. Plumbing test only (never pilot data)
python3 seed_rows.py
# -> rows/plumbing-test-rows-2026-10-13.csv

# 4. Score new candidates (forward pilot) through the harness
python3 - <<'EOF'
import sys; sys.path.insert(0, '.')
from harness import score_batch, write_rows_csv
candidates = [...]  # candidate dicts; see harness.py docstring
rows = score_batch(candidates)          # strict=False labels lookahead; strict=True raises
write_rows_csv(rows, "rows/comparison-rows-pilot-YYYY-MM-DD.csv")
EOF

# 5. Metrics report (Wilson CIs; small-n labeled)
python3 metrics.py rows/comparison-rows-pilot-2026-10-14.csv

# 6. Prospective collection (workstream B) -- new candidates only
python3 collect_pilot_rows.py            # ingest eligible stream, dedupe, append, backfill trace, print summary
python3 collect_pilot_rows.py --dry-run  # report what WOULD be appended; writes nothing
```

## Workstream B — prospective collection runner (`collect_pilot_rows.py`)

Collects comparison rows prospectively from the eligible stream (crypto
issued/suppressed signals from the discovery/issuance path; equity
radar-qualified candidates), scores them through the frozen harness, and
appends them to `rows/comparison-rows-pilot-2026-10-14.csv` (+ `.jsonl`
twin). No brokerage, no strategy changes, holdouts locked.

- **Quarantine (hard guards):** every written row must have
  `row_origin == "pilot"` — anything else raises `QuarantineError` and
  nothing is written. The quarantined v1 file
  (`rows/comparison-rows-2026-10-13.csv`) can be neither input nor output;
  there is no code path that reads it.
- **Idempotency:** dedupe on `(candidate_id, freeze_version)`; re-runs
  append nothing. Rows predating the trace extension infer
  `freeze_version = "2.0.0"` (documented, logged). A future freeze version
  re-scores the same candidate into a NEW row (different measurement).
- **Suppressed candidates** are accepted as first-class data
  (`production_decision="suppressed"` + reason; exact input format in the
  module docstring). The production arm records abstain with the classified
  reason; the challenger is scored from the ledger where one was persisted,
  else `unscored:no-factor-ledger`. Live suppressed ingest
  (`ingest_suppressed_from_db`) excludes verification-run artifacts and is
  exercised via `--dry-run` until the stream is opened.
- **Operational-trace schema extension** (appended after the frozen
  columns; frozen order preserved): `issuance_outcome` (the pipeline's
  RECORDED outcome, not harness re-derivation), `entry_observed_at`,
  `alert_enqueued_at`, `alert_delivered_at`, `contract_id`, `freeze_version`.
  Null-with-reason: empty fields mean the stage was never reached; the
  reason lives in the frozen note columns — never fabricated. `decision_at` /
  `issued_at` were already frozen columns. The pilot file migrates to the
  extended header lazily on first append/backfill; `metrics.py` reads it
  fine (plain `DictReader`), while `harness.read_rows_csv` stays the strict
  frozen-schema reader (use `collect_pilot_rows.read_pilot_rows`).
- **Collection summary** (interim-safe, counts only): rows added, deduped,
  verified/unverified split, disposition mix per arm, direction-disagreement
  fraction vs the 40% audit trigger, collection-window membership. The
  collector does NOT drop out-of-window candidates at ingest (never
  silently drops data); the readout-side window filter applies in analysis.
- **Harness amendment (documented in `harness.py`):** a suppressed/rejected
  candidate WITH a ledger but WITHOUT a recorded pre-suppression score now
  routes production to abstain (the suppression is the recorded decision)
  and scores the challenger from the ledger. A RECORDED score that
  mismatches the ledger still kills both arms
  (`unscored:production-unreproduced`). No formulas, weights, gates, reason
  codes, or decision-time rules changed; no existing pilot row changes
  disposition.

## Candidate schema (harness input)

```python
{
  "candidate_id": "31", "terminal": "crypto", "symbol": "BTC",
  "asset_id": "bitcoin", "decision_at": "2026-10-10T01:51:23.436Z",  # info cutoff
  "issued_at": "2026-10-10T01:51:23.436Z",                           # or None
  "row_origin": "pilot",                                             # "pilot" | "plumbing-test"
  "factors": [  # decision-time factor ledger; None if not persisted
      {"label": "Momentum", "score": 1, "weight": 1.5,
       "contribution": 1.5, "asOf": "2026-10-10T01:49:56.000Z"}],
  "production_recorded": {"direction": "long", "score": 56},          # or None
  "production_decision": "issued",        # issued | suppressed | rejected | qualified
  "production_suppression_reason": None, # reason string if suppressed
  "eligibility": "passed", "eligibility_reason": None,
  "entry": 82636.0, "atr14": 2241.227,
  "signal_day": {"day": "2026-10-09", "high": 84068.42, "low": 80969.58},
  "short_regime_inputs": {"price_below_sma50": True, "lower_highs": False,
                          "trend20_negative": True},
}
```

`production_decision="qualified"` (v2): scan-qualified radar candidate that
production never issued (scan-level issuance is a separate path) — the
production arm is scored from the ledger, disposition
`unscored:production-not-issued`.

Decision-time rule: any factor `asOf` later than `decision_at` marks the row
`decision_time_verified=false` (default) or raises `LookaheadError`
(`strict=True`). Inputs without `asOf` are labeled, never assumed. Nothing
is fabricated: per-factor asOf values are copied verbatim from the source
ledgers (equity date-only `YYYY-MM-DD` values are normalized to UTC
midnight in the row builder and documented per row).

## Row dispositions (both arms)

`issued` / `abstain` / `unscored` / `not-applicable`, each with a
machine-readable reason code:

- `abstain:born-dead[-mirror]` — signal-day extreme breached the (mirrored) invalidation
- `abstain:short-regime-gate[-mirror]` — bearish-structure gate not met
- `abstain:eligibility` — eligibility bars failed
- `abstain:issuance-validation-unavailable` — signal-day OHLC missing
- `unscored:no-factor-ledger` — no persisted dossier ledger
- `unscored:incomplete-factor-ledger` — ledger persisted but incomplete for the arm's frozen factor set (RULE 3); never scored from, never guessed
- `unscored:production-unreproduced` — production does not reproduce from the ledger
- `unscored:production-not-issued` — (v2) scan-qualified radar candidate; production never issued it
- `unscored:levels-uncomputable` — entry/ATR-14 missing (C-2's levels cannot be recomputed from its own inputs)
- `unscored:gate-inputs-unverifiable` — flipped but mirror-gate inputs missing; outcome unknown, never assumed passed
- `unscored:waiting-interval-evidence-missing` — (fix 2, RULE 6) entry-observation stage evidenced but waiting-interval bars missing for C-2; disposition unknown, never filled from production's values
- `unscored:entry-observation-missing` — (fix 2, RULE 6) waiting-interval bars present but no entry observation for C-2; disposition unknown
- `not-applicable:no-challenger-frozen` — equity terminal (no equity challenger)

## What the pilot rows show (real, 2026-10-14, freeze v2.0.0)

60 rows: 10 crypto production-issued signals (ids 31–40, 2026-10-10 →
2026-10-14, full 11-factor ledgers with per-factor asOf) + 50 equity
scan-qualified radar candidates (full 7-factor ledgers, per-factor asOf).

- Production reproduction: **10/10** crypto rows reproduce from their
  persisted ledgers (walk-forward legacy factor excluded, as frozen).
- Direction flips: **0/10** (0.0%) — under the 40% guardrail. Dropping
  momentum never changed the direction call in this sample.
- Challenger coverage: issued 10/10 crypto (all non-flipped; levels/gates
  inherited-identical). Equity challenger: not-applicable (none frozen).
- Decision-time verification: **50/50 equity rows verified** (all 7 factor
  asOf ≤ decision_at). **0/10 crypto rows fully verified** — every row has
  10/11 factors with asOf ≤ decision_at; the 11th
  ("Cross-venue taker imbalance", score 0 / contribution 0, NO_DATA) carries
  no persisted asOf, so the harness rule flags the row
  `decision_time_verified=false` ("asOf not recorded on 1 factor input(s)").
  No asOf was fabricated; the gap is labeled per row.
- Outcomes: **n=0 evaluable** for target-before-stop, d5/d14/d30 accuracy,
  net R, and alert delay — no checkpoint has elapsed as of 2026-10-14.
  Outcomes grade forward under `crypto-evaluation-v5-corrected` (crypto) /
  `equity-eval-3.3.0` (equity), net of the modeled 18 bps roundtrip.

Caveats: the 58/118 exploratory result and the 0% flip observation above stay
exploratory — they are not validation. The comparison dataset is rows
collected under the v2.0.0 freeze.
