# Measurement definitions — legacy series, coverage gap — 2026-10-14

**Scope:** paper signals only, no trading. This note preserves measurement
definitions; it does not audit or rebuild anything.

## 1. The two legacy hit-rate series (distinct — never merged)

### Series A — 12/60 = 20.0% (headline baseline)
- **Snapshot date:** 2026-10-13 daily pass. Equity bars through 10-13 close;
  crypto 4h blocks through the 10-13 pull.
- **Population:** tracker-inclusive dossier legacy — 79 tracked rows
  (50 equity ids 3–52 + 29 crypto ids 10–38).
- **Numerator:** 12 HIT (crypto 3: ids 12, 14, 18; equity 9).
- **Denominator:** 60 definitive = 12 HIT + 48 MISS.
  - Crypto 3/22: ids 10–38 definitive (TIMING-UNVERIFIED ids 11, 13 and
    OPEN ids 31, 32, 33, 35, 38 excluded).
  - Equity 9/38: 34 v3-definitive (9 HIT + 25 MISS) **plus the 4 CE-002
    same-day rows counted as definitive MISS per tracker settlement**:
    id11 (MU), id14, id38 (COPL), id46 (INFY). AMBIGUOUS 2 excluded.
- **Evaluator:** independent first-touch walk (crypto: CoinGecko /ohlc 4h
  close-time-interval corr2 semantics + CE-003 issuance-boundary rule;
  equity: Yahoo daily bars + CE-002 same-day rule). **Not** the deployed
  `crypto-evaluation-v4-cohort-contract` and **not** `equity-eval-3.2.0` —
  `outcome=RECONSTRUCTED` for every row; the deployed v4 contract had
  settled 0 of these rows. Terms `FROZEN-CONTRACT`.
- **Fixtures/replays:** none present. Paper-cohort rows id39/id40 not in
  this file's crypto rows (ids stopped at 38).
- **Source:** `hidden_files/signal-accuracy/signal-accuracy-2026-10-13.md` §1.

### Series B — 13/58 = 22.4% (strict v3-definitive recount)
- **Snapshot date:** 2026-10-14 daily pass; crypto candles pulled 10-14
  ~08:00Z; equity bars through 10-13 close.
- **Population:** strict v3-definitive legacy/reconstructed — 58 definitive
  = 13 HIT + 45 MISS.
- **Numerator:** 13 HIT (crypto 3, unchanged; equity 10 — id17 AAPL closed
  HIT 2026-10-13).
- **Denominator:** 58 definitive.
  - Crypto 3/22 — same 22 rows, same 3 HITs as Series A. id39/id40 were
    added to the JSON but are **excluded as market-data replays** per the
    2026-10-14 reclassification.
  - Equity 10/36 — 10 HIT + 26 MISS. The 4 CE-002 rows (ids 11, 14, 38, 46)
    are now TIMING-UNVERIFIED and excluded (unlike Series A).
- **Evaluator:** same independent first-touch walk as Series A. Still not
  the deployed evaluators.
- **Source:** `hidden_files/signal-accuracy/signal-accuracy-2026-10-14.md`
  §1 (population rule 2026-10-14: legacy/reconstructed only).

### Record-level diff (Series A → Series B)
60 + 2 (ids 15 MISS, 17 HIT closed 10-13) − 4 (CE-002 rows to
TIMING-UNVERIFIED) = 58; numerator 12 + 1 = 13.
Full reconciliation: `comparison/PERFORMANCE-RECONCILIATION-2026-10-14.md` §1c.

### Canonical rule
Use **Series A (12/60 = 20.0%)** as the headline baseline (per
`comparison/dossier-cohort-v1/BASELINE-REFERENCE-2026-10-14.md`); Series B
is the current-day recount on the stricter population. If a single canonical
series is ever adopted, the record-level diff above is the ID-level
explanation — neither series may be overwritten by the other silently.

## 2. The 90% coverage gap — defined

`eligible_but_unsupported / eligible` = **9/10 = 90%**

- **Denominator (10):** eligible directional candidates from broad discovery
  run 59 (13 discovered → 10 eligible directional, 2026-10-14 18:41:58Z).
- **Numerator (9):** eligible candidates unpaperable on the venue
  (Binance Spot via Binance.US):
  - 7 UNSUPPORTED_LISTING (BTW, PRL, Q, PONS, UMXM, DEEP, TRUTH) — the venue
    has no instrument; not paperable under any mapping.
  - 2 UNSUPPORTED_VENUE (ZRO, WAL) — real global-Binance listings the
    observable venue cannot see; venue-mismatch is the binding constraint.
- The 1 eligible candidate NOT in the numerator is **BAT** — the sole
  supported eligible (SUPPORTED-pending-row, unwired; delisting risk on
  non-USDT quotes flagged).
- Computable from: `paper-signals/universe/SUPPORTED-UNIVERSE-v1.0.0.json`
  (10 supported rows, 11 exclusion rows) and
  `paper-signals/universe/DUAL-COVERAGE-REPORT-2026-10-14.md`
  ("Coverage-gap metric" section). The gap is structural, not a mapping bug.

## 3. Retired figure

**17.4% is retired.** It was the pooled crypto figure (4/23) with the paper
row id39 folded into the legacy denominator — superseded by the 2026-10-14
reclassification. Verified 2026-10-14: no active report uses 17.4% as a
measurement. The only remaining mentions are:
- `comparison/dossier-cohort-v1/BASELINE-REFERENCE-2026-10-14.md` —
  the retirement statement itself (correct usage).
- `paper-signals/REPORT-SPLIT-2026-10-14.md` — quoting the old figure to
  identify the pooling error in the 2026-10-14 accuracy file (historical
  reference, not a live claim).
