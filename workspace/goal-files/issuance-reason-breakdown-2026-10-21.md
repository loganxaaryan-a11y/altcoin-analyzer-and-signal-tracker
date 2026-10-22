# Why is crypto paper issuance thin? — reason breakdown, issuance runs 113–116

Prepared 2026-10-21 (evening, EDT). Read-only analysis of `getpaperpilotstatus` on the crypto artifact (altcoin-analyzer-and-signal-tracker), pulled 2026-10-22T01:5xZ. PAPER ONLY — nothing was changed.

## Headline answer (latest cycle, run 116 — handoff 61 / discovery 145)

Run 116: 17 candidates, **0 issued / 5 abstained / 12 deferred** (run row: status "partial", completed 2026-10-22T01:21:00.909Z).

- **All 12 deferred are one bucket: (a) unsupported coverage** — every deferred row carries `venue_mapping_unavailable` ("No explicit venue instrument mapping exists (Binance Spot / MEXC Spot)").
- **Of the 5 abstained: 4 are (c) duplicate suppression** (`duplicate_24h_suppression` — the same long was already issued within 24h) and **1 is (d) genuine model rejection** (`production_model_abstain`, ALT).
- **Genuine model rejection accounts for exactly 1 of 17 candidates in the latest cycle.** Model strictness is not the dominant constraint in run 116: 12 of 17 never had a tradable instrument mapping, and 4 of 17 were repeats of positions already issued within the prior 24 hours.

## Bucket definitions (as applied)

- **(a) Unsupported coverage** — `venue_mapping_unavailable`: no explicit venue instrument mapping exists, so no Binance Spot entry can be constructed or settled.
- **(b) Missing inputs** — a required frozen input absent or invalid at decision time (`invalid_frozen_levels`).
- **(c) Operational mechanics** — `duplicate_24h_suppression` (deliberate dedupe rule; see caveats — in effect these are not lost opportunities).
- **(d) Genuine model rejection** — `production_model_abstain`: the frozen production model scored the opportunity and did not qualify it.
- **UNCLASSIFIED** — the recorded reason does not determine a bucket; raw reason quoted, never forced.

## Run 116 (17 candidates, 0 issued)

| Candidate | Disposition | reasonCode | Bucket |
|---|---|---|---|
| ZEC | abstained | duplicate_24h_suppression | (c) |
| NEAR | abstained | duplicate_24h_suppression | (c) |
| LIT | deferred | venue_mapping_unavailable | (a) |
| PEARL | deferred | venue_mapping_unavailable | (a) |
| COMP | abstained | duplicate_24h_suppression | (c) |
| VERSE | deferred | venue_mapping_unavailable | (a) |
| CVX | abstained | duplicate_24h_suppression | (c) |
| USELESS | deferred | venue_mapping_unavailable | (a) |
| HOODINU | deferred | venue_mapping_unavailable | (a) |
| KNTQ | deferred | venue_mapping_unavailable | (a) |
| EDGE | deferred | venue_mapping_unavailable | (a) |
| PROM | deferred | venue_mapping_unavailable | (a) |
| ALT | abstained | production_model_abstain | (d) |
| ARC | deferred | venue_mapping_unavailable | (a) |
| MAGMA | deferred | venue_mapping_unavailable | (a) |
| NOCK | deferred | venue_mapping_unavailable | (a) |
| MOOLAH | deferred | venue_mapping_unavailable | (a) |

Run 116 totals: (a) 12 · (b) 0 · (c) 4 · (d) 1 · unclassified 0 · issued 0.
The four (c) rows name the positions they duplicate: ZEC → paper_6aee1bb0…, NEAR → paper_6c3f666a…, COMP → paper_ae0ef8cd… (the run-115 COMP, issued ~2h earlier), CVX → paper_7d6b448a….

## Run 115 (23 candidates, 1 issued — COMP, candidate 435)

| Bucket | Count | Candidates (reasonCode) |
|---|---|---|
| (a) unsupported coverage | 15 | ENA, LIT, PEARL, GRX, A, HOODINU, KNTQ, VERSE, EDGE, PROM, ORE, MAGMA, NOCK, MOOLAH, IOST — all `venue_mapping_unavailable` |
| (b) missing inputs | 1 | ZRO — `invalid_frozen_levels` (see note 1) |
| (c) operational | 3 | ZEC, NEAR, CVX — `duplicate_24h_suppression` |
| (d) model rejection | 3 | PUMP, ALT (Binance Spot); CARDS (MEXC Spot) — `production_model_abstain` |
| issued | 1 | COMP |

## Run 114 (22 candidates, 0 issued)

| Bucket | Count | Candidates (reasonCode) |
|---|---|---|
| (a) unsupported coverage | 13 | ENA, LIT, GRASS, GRX, ZAMA, VERSE, KNTQ, PROM, AI, ORE, IOST, MAGMA, MOOLAH — all `venue_mapping_unavailable` |
| (c) operational | 4 | ZEC, NEAR, COMP, CVX — `duplicate_24h_suppression` |
| (d) model rejection | 5 | PUMP, ZRO, ALT (Binance Spot); CARDS, JCT (MEXC Spot) — `production_model_abstain` |

## Run 113 (19 candidates, 0 issued)

| Bucket | Count | Candidates (reasonCode) |
|---|---|---|
| (a) unsupported coverage | 11 | ENA, PEARL, A, KNTQ, PROM, W, AI, ORE, IOST, ARC, MOOLAH — all `venue_mapping_unavailable` |
| (c) operational | 3 | NEAR, COMP, CVX — `duplicate_24h_suppression` |
| (d) model rejection | 4 | ZRO, ALT (Binance Spot); CARDS, JCT (MEXC Spot) — `production_model_abstain` |
| UNCLASSIFIED | 1 | ZEC — `entry_outside_drift_zone`: "The actual first print moved more than 50 bps from the frozen decision reference." (see note 2) |

## Totals across runs 113–116

81 candidates · 1 issued · 80 non-issued:

| Bucket | 113 | 114 | 115 | 116 | Total | Share of non-issued |
|---|---|---|---|---|---|---|
| (a) unsupported coverage | 11 | 13 | 15 | 12 | **51** | 63.8% |
| (b) missing inputs | 0 | 0 | 1 | 0 | **1** | 1.3% |
| (c) operational (duplicate suppression) | 3 | 4 | 3 | 4 | **14** | 17.5% |
| (d) genuine model rejection | 4 | 5 | 3 | 1 | **13** | 16.3% |
| UNCLASSIFIED | 1 | 0 | 0 | 0 | **1** | 1.3% |

Candidate-level tallies match the run rows exactly (113: 0/8/11 · 114: 0/9/13 · 115: 1/7/15 · 116: 0/5/12, issued/abstained/deferred).

## Notes on individual records

1. **ZRO, run 115 (candidate 433), `invalid_frozen_levels`** — reason text: "Frozen invalidation is missing or on the wrong side of the decision reference price." The record's own fields disambiguate: direction long, decision reference 1.96, stopPrice **1.9891230282878496** — present, but above the reference for a long, i.e. wrong-sided frozen geometry. Classified (b): the required frozen input was invalid at decision time. Its drift capture exists (1 attempt, received 2026-10-21T23:25:11.835Z), so this was not a drift/data-fetch failure.
2. **ZEC, run 113 (candidate 386), `entry_outside_drift_zone`** — left UNCLASSIFIED. The data was present and the print verified; the price had simply moved >50 bps between the frozen decision reference and the first print, so the entry contract (50 bps drift zone) refused the entry. That is neither model scoring, nor missing data, nor a coverage gap, nor an operational defect — it is a staleness/timing refusal, and no bucket in the scheme honestly contains it.
3. **MEXC-venue model abstains** — CARDS (runs 113/114/115) and JCT (runs 113/114) carry venue "MEXC Spot" with `production_model_abstain`. They are classified (d) on their recorded reason. The record does not state whether the abstention was purely on model merits or whether the MEXC context contributed; MEXC is research-only this phase and would independently bar issuance, but that is not the recorded reason.
4. **Recurring names** — the same unmapped symbols reappear cycle after cycle (21 unique symbols across the four runs: A, AI, ARC, EDGE, ENA, GRASS, GRX, HOODINU, IOST, KNTQ, LIT, MAGMA, MOOLAH, NOCK, ORE, PEARL, PROM, USELESS, VERSE, W, ZAMA). Likewise the same four mapped names (ZEC, NEAR, COMP, CVX) generate the duplicate-suppression rows in every run — they are the standing open positions re-presented by each discovery cycle.

## What this does and does not establish

- **Deferred ≠ rejected.** In these records, "deferred" is a carry-forward state, not a verdict: every deferred row is a candidate that could not be evaluated for issuance because no venue instrument mapping exists, and the same symbols are re-presented in the next cycle's candidate set. The production model never scored them for issuance. A deferred row says nothing about the opportunity's quality — research visibility is unaffected.
- **Duplicate suppression ≠ failure.** Bucket (c) is a deliberate 24h dedupe rule working as recorded: each suppressed row names the already-issued position it duplicates. These candidates were not lost opportunities; the position already exists. Counting them as "the system failing to issue" would double-count the same trade once per cycle.
- **The thinness is mostly upstream of the model.** Across four cycles, 51 of 80 non-issued candidates (63.8%) never reached a tradable instrument. The venue mapping table carries 44 coinIds; discovery is surfacing a long tail of names outside it. Whether those names are uncoverable in principle (no Binance Spot pair exists) or merely unmapped (a pair exists, the table lacks the row) **cannot be determined from these records** — see instrumentation gaps.
- **Model strictness is a minority factor, and shrinking in the sample:** genuine model rejections were 4, 5, 3, 1 across runs 113–116 — 13 of 80 non-issued (16.3%), and only 1 of 17 in the latest cycle.
- **This does not establish that issuance *should* be higher.** It establishes where the funnel narrows. The (a) population is long-tail discovery output; nothing here grades those opportunities.

## Instrumentation gaps found

1. **`venue_mapping_unavailable` conflates two different facts.** The reason ("No explicit venue instrument mapping exists (Binance Spot / MEXC Spot)") cannot distinguish *asset has no Binance Spot pair at all* from *pair exists but the mapping row is missing*. Those have opposite remedies (none vs a mapping addition), and the payload records nothing — no pair-existence probe, no per-venue split — to separate them. (The candidate `venue` field is not evidence either: deferred rows carry venue "Binance Spot" while their reason states no mapping exists for Binance Spot or MEXC Spot.)
2. **`invalid_frozen_levels` conflates missing vs malformed.** One reasonCode covers "invalidation missing" and "invalidation on the wrong side"; only manual inspection of the raw stopPrice/decisionReferencePrice fields separated them for candidate 433.
3. **No reasonCode exists for the drift-zone refusal class.** `entry_outside_drift_zone` is recorded, but the four-bucket reporting scheme has no home for staleness refusals; a standing category (entry-contract timing) would be needed if these recur.
4. **MEXC model-abstain rows don't record venue influence.** For CARDS/JCT the payload cannot show whether `production_model_abstain` was venue-independent.
5. No phantom SETUP_PENDING or stranded-row dispositions appear in the candidate records for runs 113–116; bucket (c) in this window is entirely duplicate suppression. (The known stranded run-142 discovery rows live outside these issuance runs' candidate sets.)

*Sources: artifact action getpaperpilotstatus (candidates, runs, venueMappings), pulled 2026-10-22T01:5xZ; candidate ids 386–466; run rows 113–116.*

## Label corrections + probe resolution (appended 2026-10-21, late evening)

Three labels in this breakdown are corrected for all future reporting:

- **Duplicate suppression = deliberate deduplication.** Bucket (c) rows are the standing 24h dedupe rule working as designed — each names the already-issued position it duplicates. They are not lost opportunities and not failures; counting them as missed issuance double-counts the same trade once per cycle.
- **Drift refusal = entry-contract rejection.** The run-113 ZEC row (`entry_outside_drift_zone`, left UNCLASSIFIED above) belongs to a named class of its own: the frozen entry contract (actionable-entry-v1, 50 bps drift zone) rejected the entry because the first print had moved beyond the permitted drift from the decision reference. It is neither a model rejection nor an operational defect.
- **Absent mapping = coverage UNRESOLVED, not necessarily unsupported.** Bucket (a)'s label "unsupported coverage" overclaimed: at breakdown time the records could not distinguish "no pair exists" from "pair exists, table lacks the row" (instrumentation gap 1). The correct standing label is **coverage unresolved** until probed per-asset.

**The probe has now resolved the set** (`unmapped-assets-probe-2026-10-21.md`, probes 2026-10-22T02:15–02:17Z): the 51 bucket-(a) occurrences are **21 unique assets** (occurrences ≠ independent missed opportunities — the same assets are re-presented every cycle). Of the 21: **6 supported pair missing from our map** (vaulta, ethena, iostoken, prometeus, wormhole, zama — pair TRADING, aggTrades + 1m klines verified; mapping additions prepared, not deployed), **15 no supported pair** (including 2 ticker collisions resolved by contract: artificial-inu-3 and lighter), **0 pair inactive, 0 identity unresolved**. All 15 stay research-visible.
