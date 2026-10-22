# Entry Audit v2 — three-class accounting (2026-10-14)

**Auditor:** subagent (bounded accounting correction) · **Run:** 2026-10-14 ~09:00 EDT · **Read-only:** all original stores and v1 audit files untouched.
**Supersedes (accounting only):** `entry-audit-findings-2026-10-14.csv` (v1) and `exclusion-first-print-fidelity-2026-10-14.csv` (v1). No v1 row was altered; this is a new versioned file set.

## Subject
Rework the v1 audit's 120 inspected paper-entry records into three separate accounting classes, never pooled, with deduplicated counts for prediction statistics.

## Class definitions
- **CLASS A — synthetic fixtures:** fabricated timestamps/prints. Scripted feeds, demo fixtures, identical-timestamp rows. Not measurement-eligible by construction.
- **CLASS B — market-data replays:** real venue data (e.g. Binance prints), sandbox execution (kill-test demos, dryrun replays, demo-harness re-issues). Real prints, non-deployed execution; duplicates of the Class C opportunity are deduped for prediction statistics.
- **CLASS C — naturally issued deployed paper entries:** real data AND genuinely deployed-issued paper execution. Only class eligible for prediction measurement.

## Assignments (120 records, each exactly one class)

| cohort | rows | class | why |
|---|---|---|---|
| demo equity, `demo/evidence/integrated/*/store.db` (40 rows, 2 signal IDs: `sig_b25f5669d4194776005fccd0` ×30, `sig_b4d1ebcf62a37107dc95d899` ×10) | 40 | **A** | Scripted `equityOpenPrintFeed` per `demo/integrated-demos.ts`; fabricated open print at fixed `2026-10-14T13:30:00.000Z`; fixture candidate source `itg-fixture`; strategy `0.1.0-sandbox` / `parameterHash sandbox-paper-v1` |
| demo crypto, 28 rows, `sig_e663920b936efbc5ebed4538` | 28 | **A** | Scripted `cryptoPrintFeed`: fixed +30s offsets, `decisionPrice=100.00` / `entryPrice=100.2` identical across rows |
| demo crypto crash→resume, 6 rows, `sig_18102a0eb98eb79c61ecf6ce` (demo10) | 6 | **A** | `ScriptedFeed` one scripted print at T+90s; entry `2026-10-14T04:01:30.000Z` identical across rows |
| orchestrator demo, 1 row, `sig_c09dd0cf71db18324b937ddc` (`handoff/data/orchestrator-demo-2026-10-14.sqlite`) | 1 | **A** | Inbox source `DEMO-SCRIPTED-DISCOVERY (not a real discovery run)`; round prices 100/94/106/112; `entryObservedAt==entryReceivedAt` |
| equity-discovery, 42 rows (`equity-discovery/handoff/handoff-store-2026-10-14.db`, 42 unique signal IDs) | 42 | **A** | `entryObservedAt` identically `2026-10-14T13:30:00.000Z` on all 42 rows while `entryReceivedAt` spans 13:30:14.530Z–13:30:15.1xxZ (script run-time writes); `entryEvidence: venue-trade` asserted with no genuine venue print observed — fabricated entry stamps; separately quarantined in `quarantine/2026-10-14/quarantine-record-equity-42.md` |
| pilot dryrun, 1 row, `sig_53bb2a86d2e0fee1f3664812` (`pilot/data/paper-pilot-dryrun.sqlite`, contract `ct_53bb2a86d2e0fee1f36648122134e684`) | 1 | **B** | Same opportunity as the Class C record; sandbox replay of the deployed issuance path on real Binance prints (entry 83444.23, ~8.1s post-decision); dryrun evidence, not a deployed claim |
| watcher-demo re-issue, 1 row, `sig_53bb2a86d2e0fee1f3664812` (`scheduling/watcher-demo/data/sched-demo.sqlite`, same contract id re-issued) | 1 | **B** | Demo-harness re-issue in `watcher-demo`: real-price/distinct-ms observation (entry 83381.2) but entry 616s post-decision on a `first-post-decision` rule with no served-print log and no stale-skip trail; sandbox execution, duplicate opportunity |
| pilot live BTC long, 1 row, `sig_53bb2a86d2e0fee1f3664812` (`pilot/data/paper-pilot.sqlite`, contract `ct_53bb2a86d2e0fee1f36648122134e684`) | 1 | **C** | Genuinely deployed-issued paper entry: `issuedBy=paper-signals-integrated-handler`, real Binance-spot feed (decision 83472.56 → entry 83457.88 at 02:49:57.509Z, ~21s post-decision, distinct ms), `observationDegraded=false`; kill-test resume happened mid-hold *after* entry was observed, so it cannot have reset entry observation. Caveat (carried from v1): no in-store served-print log to independently re-verify the stream. |

**Class totals: A = 117 · B = 2 · C = 1 · 120 records assigned.**

## Dedup rule for prediction statistics
All three rows carrying `sig_53bb2a86d2e0fee1f3664812` (pilot live, dryrun copy, watcher-demo re-issue) are **one opportunity, not three**. For any prediction statistic, the live Class C record is the one eligible entry; the two Class B rows are on the exclusion list as duplicates/sandbox executions.

## Counts (definitions in `dedup-counts-v2-2026-10-14.json`)
- **unique opportunities** — distinct `signal_id` values (one trading idea; duplicate rows collapse).
- **valid entries** — records eligible for prediction measurement: real data AND genuinely deployed-issued (Class C only).
- **completed outcomes** — entries with a recorded outcome (close/exit/pnl). Verified: no `outcome`/`close`/`settle`/`exit`/`pnl` keys exist in any audited contract row across all stores.

| | records | unique opportunities | valid entries | completed outcomes |
|---|---|---|---|---|
| Class A | 117 | 47 | 0 | 0 |
| Class B | 2 | 1 | 0 | 0 |
| Class C | 1 | 1 | 1 | 0 |
| **Total (deduped)** | **120** | **48** | **1** | **0** |

Note: Class B and Class C share the same opportunity (`sig_53bb2a86d2e0fee1f3664812`), so total unique opportunities = 47 + 1 = 48.

## Deliverables (this v2 set)
- Per-entry classification (120 rows): `audit/entry-audit-v2-2026-10-14.csv`
- Deduplicated counts (machine-readable): `audit/dedup-counts-v2-2026-10-14.json`
- Measurement exclusion list (119 rows, machine-readable): `audit/exclusion-list-v2-2026-10-14.json`
- Metric-contribution report: `audit/metric-contribution-v2-2026-10-14.md`
- Quarantine originals + v1 audit files: untouched under `quarantine/2026-10-14/` and `audit/`.
