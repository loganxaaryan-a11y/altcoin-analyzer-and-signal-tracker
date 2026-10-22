# BTC Issuance Runtime — expert correction 2 (2026-10-14)

## VERDICT: sandbox-only — the successful BTC issuance cited in the acceptance report ran entirely in a local sandbox, NOT on the deployed altcoin terminal artifact

The acceptance report's sequence was: (1) a deployed `runpapersignalcycle` completion with zero discovery candidates (run ID 2) on the live altcoin terminal artifact, followed by (2) a successful BTC issuance. Event (2) is the v2.1.0 acceptance run in `comparison/acceptance-run-v2.1.0/acceptance-run.ts`, which declares in its own header, verbatim: **"SANDBOX ONLY. No production issuance, no live trading, no brokerage."** This matches the 2026-10-14 ~05:00 UTC correction already recorded in the daily log: "the successful BTC issuance cited in the acceptance report was a sandbox/repaired-handler acceptance run on a retrospective candidate, not a successful deployed-artifact issuance. Deployed evidence so far is only clean abstention." [Correction 2026-10-14: the daily log's "clean abstention" was inaccurate — the deployed runs evaluated zero candidates (per-run counts: `comparison/deployed-run-counts-2026-10-14.json`), so there was nothing to abstain on; the accurate record is "three completed runs, zero opportunities". The quoted text is left verbatim as a historical record.]

Nothing about the successful issuance touched the deployed artifact. The deployed issuance branch has not naturally fired.

---

## 1. Successful BTC issuance — runtime evidence (SANDBOX-ONLY)

**Runtime:** Local Node.js process on this VM (not the deployed artifact). Proven by:
- Driver file header `comparison/acceptance-run-v2.1.0/acceptance-run.ts` line 1–3: "SANDBOX ONLY. No production issuance, no live trading, no brokerage."
- Manual clock pinned to the real decision instant (`manualClock(decisionMs)`), not a live clock.
- Store is `DbStore(":memory:")` — no durable records anywhere; the in-memory DB was discarded when the process exited.
- Alert transport is a sandbox hook (`deliveryMode: "simulated"`, destination `"awaiting-user-choice"`); the log says "entry alert appended to sandbox-feed". Acks were simulated.
- Market data was REAL (Binance.US BTCUSDT spot aggTrades + 1m/daily klines, venue label `binance-spot`), replayed at run time — real data, sandbox execution.

### Identifier table

| Field | Value | Where found |
|---|---|---|
| Run label | `v2.1.0 final acceptance (Decision 3 consolidation)` / driver tag `"acceptance-v2.1.0"` | `evidence/acceptance-run-evidence.json` `run`; `acceptance-run.ts` (`integratedManualIssue(deps, candidate, "acceptance-v2.1.0")`) |
| Action invocation ID / run ID | **None — this was a `node acceptance-run.ts` script on the VM, not an artifact action invocation. No invocation ID exists.** | — |
| Acceptance run wall-clock time | `2026-10-14T04:59:59.307Z` (replayed decision-time instants below; actual script execution was 2026-10-14 ~05:00 UTC) | `evidence/acceptance-run-evidence.json` `ran_at_utc` |
| Candidate ID | `crypto:31` (row_id), `candidate_id: "31"` | `data/signal31_row.json` |
| Asset | BTC (Bitcoin), `asset_id: "bitcoin"` | `data/signal31_row.json` |
| Strategy | `crypto-dossier-factor-agreement` / `2.0.0-measurement-contract`, direction long, long_score 56 / short_score 44 | `data/signal31_row.json`, evidence `model_run` |
| Contract ID | **MISSING — not recorded.** The log lists the outcome detail keys (`vetoSummary, contractId, entryEventId, polls, postEntryInvalidation, postEntryReason`) but never prints the contract ID value; the evidence JSON has no `contractId` field. | Searched `evidence/acceptance-run-evidence.json`, `evidence/acceptance-run-log.md`, `data/` — absent everywhere |
| entryEventId | **MISSING — key listed in log line `[outcome] detail keys`, value never printed or persisted.** | Same as above |
| Signal ID | `sig_d19df4ddba2acbf45dc1ab57` | `evidence/acceptance-run-evidence.json` `delivery.alerts[].signalId`; log `[tracker] signalId=sig_d19df4ddba2acbf45dc1ab57` |
| Alert IDs | setup `setup_d19df4ddba2acbf45dc1ab57`, entry `entry_sig_d19df4ddba2acbf45dc1ab57` | `evidence/acceptance-run-evidence.json` `delivery.alerts` |

### Timestamp table (replayed decision-time instants on the manual clock — NOT wall-clock times of the script run)

| Step | Timestamp | Source |
|---|---|---|
| Qualification (integrated handler path: ingest → min-score → freshness → regime gate → repaired veto) | **No per-step persisted timestamp.** Step sequence confirmed in log, timestamps not recorded per step. | log `[run]` line |
| Contract build | **No persisted timestamp; contract ID also missing (see above).** | — |
| Entry observation | `2026-10-10T01:52:09.514Z` | evidence `issuance_path.entry_observed_at`; log `[outcome] reason: ... entered 2026-10-10T01:52:09.514Z` |
| Waiting-interval veto check | **No persisted timestamp.** Ran between entry observation and issuance; the log's gate-check confirms the deciding gate was "issued (all repaired gates passed)" and the superseded historical veto decided nothing, but no veto timestamp was recorded. | log `[gate-check]` line |
| Issuance (signal issued) | `2026-10-10T01:52:23.436Z` | log `[tracker] ... issuedAt=2026-10-10T01:52:23.436Z` |
| Setup alert enqueued | `2026-10-10T01:51:23.436Z` | log `[delivery]`; evidence `setup_alert_at` |
| Entry alert enqueued | `2026-10-10T01:52:23.436Z` | log `[delivery]`; evidence `delivery.alerts[1].enqueuedAt` |
| Delivery destination | `awaiting-user-choice` (Logan has not chosen a destination; simulated hook, not a real channel) | `acceptance-run.ts` (`destination: "awaiting-user-choice"`, `deliveryMode: "simulated"`) |

Note on timestamps: every timestamp above is a **replay instant** — the driver froze a manual clock at the real 2026-10-10 decision instant and advanced it through the scripted feed. They reproduce the real retrospective decision timing but were generated during the sandbox run at 2026-10-14 ~05:00 UTC. The candidate's own provenance is RETROSPECTIVE (decision pre-dates all freezes; `applicable_freeze: none-predates-freeze`).

### Build / freeze identifiers the run executed under

- Freeze manifest: `comparison/freeze-manifest-v2.1.0.json`, `manifest_version: 2.1.0`, `frozen_at_utc: 2026-10-14T04:57:00Z`, `frozen_by: workstream v2.1.0 consolidation subagent (Decision 3)`.
- Function identity (runtime-recomputed at script start, matched against manifest): `orchestrator/src/issuance/handler.ts` sha256 `b43a788047ebb234d3c996595a9612cda60f1acd69adba25eb8bf8d8746b393b` — MATCH.
- Supporting frozen sources (from the v2.1.0 manifest): entry-v1 contract `15853721301ccd13893f99e9c5e6751fb448aeadb7da6141dab7bad7c18cca42`, entry-rules `9874a0810b02c90ec457f88f4fcccb427ce47caa377f1c0279314d06f932eb53`, feed `68b5558eb67fcecd2a0ab6d91173e3911b272c94214ba7f6f65bdd415b974784`, levels `5bd21b1d71d9fae5443cce6ad10bcb1fe3e0ff868baa94c6523bb872cce528bb`, pending `5624a9b1ffee8e7071ef0340e2f8b4aa1e75f74f8fbd44179a45c47d503da3ac1`, watcher `b27d715d7054386d85daf349a71468c7e1dfa2dca69c340f65a53435a912b07`, veto `ae38b6b1ddb933033dfa70e7bf375e403d134e24f75e9b57e60ff6b78a3ae478`, waiting-interval `4035f95c8a02f66d2e69fb942969b2daa11154903fd7ee169333e803cd9f3c40`.
- The script ran against the compiled `dist` build of the same frozen source.

---

## 2. Related but DISTINCT sandbox issuance — pilot dryrun-1 / restart-demo (not the acceptance-report one)

For completeness, the workspace contains a second successful sandbox BTC issuance with different identifiers. **This is NOT the acceptance report's "successful BTC issuance"** (different candidate, different signal, different driver):

- Runtime: local Node pilot process on this VM (`pilot/src/pilot.ts`), local sqlite (`pilot/data/paper-pilot-dryrun.sqlite`, `paper-pilot.sqlite`), sandbox-file-outbox transport, simulated acks. Sandbox-only.
- Candidate ID: `53bb2a86d2e0fee1f36648122134e684` (BTCUSD, long, entry 83438.92 dryrun / 83472.56 restart-demo).
- Contract ID: `ct_53bb2a86d2e0fee1f36648122134e684` (recorded here — unlike the acceptance run).
- Signal ID: `sig_53bb2a86d2e0fee1f3664812`.
- Dryrun cycle `dryrun-1`: candidate-ingested 2026-10-14T02:48:45.302Z, setupAlertAt 2026-10-14T02:48:45.322Z, entryObservedAt 2026-10-14T02:48:53.405Z, entry alert enqueued 2026-10-14T02:49:11.343Z, final state `issued` 2026-10-14T02:49:11.364Z (detection→alert 28.5s).
- Restart-demo: mid-hold kill and process restart, resumed from persisted DB row, re-issued; evidence `pilot/evidence/restart-demo-2026-10-13.jsonl`, `restart-resume-2026-10-13.log`.
- The third pilot evidence item (`terminal-runtime-demo-2026-10-14/issuance-result.json`) is also sandbox: its own provenance block states `"runtime": "node 24 + shimmed Ctx (local sqlite via terminal's own drizzle migrations); NOT the deployed artifact runtime"`, invocationId `paper-shim-65a38544-4581-42cb-925a-5ad29c4042aa`, result `suppressed` (clean abstention via born-dead veto) at `2026-10-14T04:09:00.371Z`.

---

## 3. Deployed `runpapersignalcycle` run — run ID 2, zero candidates, not an abstention (live altcoin terminal)

- **Runtime: the deployed artifact runtime** — the live altcoin terminal artifact (`altcoin-analyzer-and-signal-tracker`), invoked through its deployed action surface (`runpapersignalcycle` paper-only action). This is the only one of the three events that ran on the deployed artifact.
- What happened (from the ~05:00 UTC 2026-10-14 coordinator handoff recorded in the daily log): two deployed cycles completed with zero discovery candidates — zero opportunities, not abstentions (an abstention requires a candidate); existing tracked signals stayed 31 before/after (no rows written, no issuance). The deployed issuance branch had not naturally fired.
- **Timestamps: per-run counts now on record.** The deployed snapshot `comparison/live-paper-status-2026-10-14.json` (exported 2026-10-14T05:41:30Z) records run IDs, startedAt/completedAt, and counts per run; the distilled per-run table is `comparison/deployed-run-counts-2026-10-14.json` (run 2: startedAt 2026-10-14T04:54:56.233Z, completedAt 2026-10-14T04:54:56.285Z, candidateCount 0, issuedCount 0, abstainedCount 0). Per-step times and the full action-result payload remain in the deployed artifact's segregated paper tables and the coordinator/parent's action-invocation transcript.
- Where its records live: (a) the live artifact's segregated paper tables (per the coordinator handoff: paper action writes only segregated paper tables, does not delegate to legacy `analyzeCoin`); (b) the parent/coordinator's invocation transcript for run ID 2. Not in this workspace.

---

## Summary for the expert

1. The acceptance report's successful BTC issuance is **sandbox-only**: local VM node script, `:memory:` DB, simulated alert transport, manual clock replaying 2026-10-10 instants. No artifact action was invoked; there is no action invocation ID. Signal `sig_d19df4ddba2acbf45dc1ab57`; candidate `crypto:31`; **contract ID and entryEventId were never recorded — missing**; per-step timestamps exist only for setup alert (`2026-10-10T01:51:23.436Z`), entry observation (`2026-10-10T01:52:09.514Z`), and issuance/entry alert (`2026-10-10T01:52:23.436Z`) — qualification, contract build, and veto-check steps have no persisted timestamps. Build identity: freeze manifest v2.1.0 (`frozen_at_utc 2026-10-14T04:57:00Z`), handler sha256 `b43a788047ebb234d3c996595a9612cda60f1acd69adba25eb8bf8d8746b393b` (runtime-verified match).
2. The deployed `runpapersignalcycle` completion (run ID 2, zero candidates — not an abstention) is genuinely deployed-artifact runtime — the only deployed event.
3. Do not conflate the pilot dryrun issuance (`sig_53bb2a86d2e0fee1f3664812`, candidate `53bb2a86d2e0fee1f36648122134e684`) with the acceptance-report issuance — different candidate, signal, contract, and driver.
