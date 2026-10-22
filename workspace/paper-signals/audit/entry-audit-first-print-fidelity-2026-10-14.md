# Entry Audit — first-print substitution failure mode (2026-10-14)

**Auditor:** evidence-side subagent · **Run:** 2026-10-14 ~04:45 EDT (~08:45 UTC) · **Appendable:** yes — append new rows/rows-corrections at the end under a dated addendum; never rewrite existing rows.

## Subject
The issuance handler (`observeEntryPhase`) could silently enter on a later print when the true
first post-decision print was missed (stale-skipped), keeping the original "first-post-decision"
contract. This audit inspects every paper entry record for that failure-mode signature.

## Stores inspected (120 entry records, 48 unique signal IDs)
- `demo/evidence/integrated/*/store.db` — 96 files scanned; 74 contain 1 contract each
- `pilot/data/paper-pilot.sqlite` — 1 (live real row)
- `pilot/data/paper-pilot-dryrun.sqlite` — 1 (dryrun copy)
- `handoff/data/orchestrator-demo-2026-10-14.sqlite` — 1 (scripted demo)
- `handoff/data/orchestrator-56.sqlite` — 0 contracts
- `handoff/data/handoff.sqlite` — no contracts schema (discovery runs only; no entries)
- `handoff/inbox/*.json` — inbox docs, no entry records
- `pilot/evidence/terminal-runtime-demo-2026-10-14/shim.db` — `signal_contracts` empty
- `equity-discovery/handoff/handoff-store-2026-10-14.db` — 42
- `scheduling/watcher-demo/data/sched-demo.sqlite` — 1
- All sources treated read-only. Originals untouched.

## Verdict definitions
- **clean** — record evidence supports first-print fidelity: genuine venue feed, distinct timestamps, plausible ordering, no stale-skip trail.
- **affected** — record carries the failure-mode signature: scripted/fixture feed with fabricated print identity (identical timestamps across rows, round fixture prices, synthetic demo feeds).
- **unverifiable** — entry exists but first-print fidelity cannot be established from the record (no served-print log, no stale-skip trail, anomalous latency).

## Results

| cohort | records | verdict | why |
|---|---|---|---|
| demo equity (40 stores) | 40 | **affected** | Synthetic `equityOpenPrintFeed` per `demo/integrated-demos.ts`; `entryObservedAt` identically `2026-10-14T13:30:00.000Z` on all 40 rows; candidate source `itg-fixture` |
| demo crypto (28 stores, 1 signal `sig_e663920b936efbc5ebed4538`) | 28 | **affected** | Synthetic `cryptoPrintFeed`: fixed +30s offset prints; `decisionPrice=100.00`, `entryPrice=100.2` exactly, identical across all 28 rows |
| demo crypto (6 stores, 1 signal `sig_18102a0eb98eb79c61ecf6ce`) | 6 | **affected** | Crash→resume demo (demo10): `ScriptedFeed` with one scripted print at T+90s; entry `2026-10-14T04:01:30.000Z` identical across 6 rows |
| `pilot/data/paper-pilot.sqlite` BTC long `sig_53bb2a86d2e0fee1f3664812` | 1 | **clean** | Real Binance-spot feed: decision 83472.56, entry 83457.88 at 02:49:57.509Z (~21s post-decision, distinct ms), `observationDegraded=false`, no stale-skip trail. Kill-test resume happened mid-hold *after* entry was observed, so it cannot have reset entry observation. Caveat: no in-store print log exists to independently re-verify the served stream. |
| `pilot/data/paper-pilot-dryrun.sqlite` same signal (dryrun copy) | 1 | **clean** | Real prices (entry 83444.23 ~8.1s post-decision), dryrun evidence — not a live claim |
| `handoff/data/orchestrator-demo-2026-10-14.sqlite` `sig_c09dd0cf71db18324b937ddc` | 1 | **affected** | Inbox source `DEMO-SCRIPTED-DISCOVERY (not a real discovery run)`; round prices 100/94/106/112, drift 0.000%, `entryObservedAt==entryReceivedAt` |
| `equity-discovery/handoff/handoff-store-2026-10-14.db` (the equity 42) | 42 | **affected** | `entryObservedAt 2026-10-14T13:30:00.000Z` identical across all 42 rows while `entryReceivedAt` spans 13:30:14.530Z–13:30:15.1xxZ (run-time writes); `entryEvidence: venue-trade` asserted ~6h before the entry window opened — no genuine venue print observed. See quarantine record. |
| `scheduling/watcher-demo/data/sched-demo.sqlite` same contract id re-issued | 1 | **unverifiable** | Same `ct_53bb2a86d2e0fee1f36648122134e684` re-issued with decisionAt 06:44:43.646Z; entry at 06:54:59.237Z is **616s post-decision** on a `first-post-decision-binance-spot-trade` rule; real-price/distinct-ms observation but no stale-skip trail and no served-print log — first-print fidelity cannot be established |

**Totals: 120 inspected · 2 clean · 117 affected · 1 unverifiable · 118 excluded from definitive performance results.**

## Notes
- Demo-store signal IDs are duplicated across stores by design (fixture runs): 34 crypto rows collapse to 2 signal IDs. Each store row is still listed individually in the CSV.
- `entry-evidence` venue trade IDs: none of the affected rows carry a real venue trade ID; `entryEvidence: venue-trade` is asserted but backed by synthetic feeds.
- No in-store scan/skip logs (staleness skips, `sinceTs` resets) exist in any SQLite store; verdicts rest on print-identity evidence and timestamp analysis.
- Measurement files (hidden_files/signal-accuracy/*) predate the paper-entry program and do not count these rows. The one document that *claims* the 42 as "issued" is `equity-discovery/handoff/handoff-report-2026-10-14.md` ("Outcome mix: issued:42") — flagged in the quarantine record as superseded; do not let it feed measurement.

## Deliverables from this run
- Per-entry findings (120 rows): `audit/entry-audit-findings-2026-10-14.csv`
- Measurement exclusion list (118 rows): `audit/exclusion-first-print-fidelity-2026-10-14.csv`
- Quarantine copies (provenance): `quarantine/2026-10-14/quarantine-excluded-rows.jsonl`
- Equity-42 quarantine record + row copies: `quarantine/2026-10-14/quarantine-record-equity-42.md`, `quarantine-equity-42-rows.json`, `equity-42-id-table.csv`
- Updated 42 reclassification (v2): `reclass-42-longs-2026-10-14.v2.csv`
