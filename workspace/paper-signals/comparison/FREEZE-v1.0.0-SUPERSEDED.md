# FREEZE v1.0.0 — SUPERSEDED by v2.0.0

**Status: SUPERSEDED on 2026-10-14 by `freeze-manifest-v2.0.0.json`.**

`freeze-manifest-v1.0.0.json` is **immutable and kept on disk** — it is not
edited, not deleted, and its rows are not re-scored.

## Why superseded

The operational rules changed after v1. The repaired pipeline introduced:

1. **actionable-entry-v1 contract** — decisionAt vs sourceObservedAt vs
   receipt-time separation, per-terminal entry rule, entry expiry window,
   drift caps (0.50 equity / 1.50 crypto), 5-minute observation-age limit,
   anti-fabrication evidence rule.
2. **waiting-interval veto** — setup-history filter (pre-decision extremes
   are features, never stop-outs) as a SEPARATE check from the genuine
   decision→entry invalidation over [contract.decisionAt, entryObservedAt];
   entry-straddling candle handling; "a touch is a touch".
3. **explicit venue mapping** — ENTRY_VENUE_ACCEPTED_PRINT_LABELS
   (consolidated-tape for equity, binance-spot for crypto); prints on the
   wrong venue are skipped, never entered.
4. **decision-time level immutability** — validatePublishedLevels fails
   loudly on any silent rebuild; the veto-tested stop must equal the
   published stop.
5. **corrected evaluator** — barrier semantics (invalidation-first MISS /
   target1-first HIT / same-block double-touch AMBIGUOUS), TIMING_UNVERIFIED
   for issuance-straddling touches and unknowable same-day touch order,
   uncertainty-terminal hard rule, 30-day cap, 18 bps roundtrip costs.

Model factor sets, weights, and scoring formulas are **unchanged** from v1
(crypto production 11 factors / 17.0, C-2 10 factors / 15.5, equity 7
factors / 90). Only the operational rules and evaluator changed — which is
exactly what a freeze version bump is for.

## Quarantine

Rows seeded under v1 — `rows/comparison-rows-2026-10-13.csv` (+ `.jsonl`
twin), 55 sandbox-seeded rows — are **quarantined from pilot statistics**.
They stay on disk for audit only. They are never re-scored under v2, never
merged into pilot metrics, and never presented as pilot data.

The live comparison dataset is `rows/comparison-rows-pilot-2026-10-14.csv`
(real candidates with persisted decision-time factor ledgers, scored under
freeze v2.0.0).
