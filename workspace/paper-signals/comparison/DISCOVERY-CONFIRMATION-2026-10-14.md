# Discovery Confirmation — 2026-10-14 (workstream 3)

**Verdict: PARTIAL — no.** Scheduled discovery does NOT currently produce paper-eligible candidates automatically on the deployed artifact, and the exact per-run candidate counts are not verifiable from any workspace or scheduler record. An honest "not yet automatic" is the correct deliverable. The named gaps are in §4.

Checked 2026-10-14 ~06:15 UTC. Observation only — nothing installed, enabled, or modified.

---

## 1. Discovery schedule records (live scheduler, `cron.list` + `cron.status` + `cron.runs`)

### crypto-market-discovery — RUNNING, healthy
- **Name:** `crypto-market-discovery` · **Cadence:** `interval@6h` (America/Toronto) · **Owner:** `space:altcoin-analyzer-and-signal-tracker` · **Enabled:** yes · **Execution:** `space_action` → `altcoin-analyzer-and-signal-tracker.runmarketdiscovery` (definition file: `~/workspace/cron.d/hourly/crypto-market-discovery__interval@6h.md`).
- **Last 6 executions (all succeeded, no failures in window):**

| Local (EDT) | Status |
|---|---|
| Tue 2026-10-13 22:24:23 | succeeded |
| Tue 2026-10-13 16:24:23 | succeeded |
| Tue 2026-10-13 10:24:23 | succeeded |
| Tue 2026-10-13 04:24:23 | succeeded |
| Mon 2026-10-12 22:24:23 | succeeded |
| Mon 2026-10-12 16:24:23 | succeeded |

- Next run: Wed 2026-10-14 04:24:23 EDT. Consecutive failures: 0.
- **Candidate counts per run: NOT RECORDED.** The scheduler records for `space_action` jobs only log "invoked scheduled web artifact action ... directly" — no universe/signal/shortlist counts. The artifact writes per-run counts to its deployed `market_discovery_runs` table (`universeSize`, `shortlisted`, `signalCount`, `newsCount`, `theoryCount`), but the deployed artifact DB is not readable from this workspace (no artifact-action API on this subagent). **This is gap (a): per-run candidate counts are asserted by nothing on record.**

### crypto-theory-discovery — RUNNING, healthy (theories, not signals)
- **Name:** `crypto-theory-discovery` · **Cadence:** `interval@12h` · **Owner:** `space:altcoin-analyzer-and-signal-tracker` · **Enabled:** yes · **Execution:** `space_action` → `altcoin-analyzer-and-signal-tracker.runtheorydiscovery`.
- Last 6 executions all succeeded (latest Tue 2026-10-13 15:25:54 EDT). Produces machine theories for Theory Watch, not directional candidates — not a candidate source for the paper pipeline.

### equity-theory-discovery — ENABLED BUT EFFECTIVELY DEAD
- **Name:** `equity-theory-discovery` · **Cadence:** `interval@12h` · **Owner:** `space:equity-analyzer-and-signal-tracker` · **Enabled:** yes · **Execution:** `space_action` → `equity-analyzer-and-signal-tracker.runautomatedscan {universe:"sp100"}`.
- **Last 6 executions (all FAILED, identical error):** `space worker request timed out after 120000ms` — Tue 2026-10-13 15:23:59, Tue 2026-10-13 03:23:59, Mon 2026-10-12 15:23:59, Mon 2026-10-12 03:23:59, Sun 2026-10-11 15:23:59, Sun 2026-10-11 03:23:59 EDT.
- **Consecutive failures: 15. Last success: Tue 2026-10-06 03:25:51 EDT (8 days ago).**
- **Gap (b): no discovery schedule is currently producing equity candidates automatically.**

---

## 2. What scheduled discovery actually produces (audited source, 2026-10-13)

From `~/workspace/goals/research-terminal/hidden_files/source-export-2026-10-13/PIPELINE-TRACE.md` §2–3 (static audit of the exported source + live schedule→action mapping):

- **Crypto `runMarketDiscovery` (actions.ts:3592–3840):** computes issuance *validation* per candidate (`loadIssuanceSignalDayCandle`, `evaluateBornDead`, `evaluateShortRegimeGate`, failures → `suppressedSignalCandidates` with `issuancePath: "runMarketDiscovery → issuanceCheckedCandidates"`) but **there is no call to `issueGeneratedSignalCandidate` anywhere in the discovery path** — the only three call sites in the file are the manual dossier view (`:3411`) and the verification control (`:5091–5092`). Discovery persists to `discoverySignals` (radar) + `discoveryNews` + `theoryWatch` + `scanOperations`. `scanOperations.issuedCount` = `retainedSignals.length - watchedCount` — a count of directional **radar rows**, not issuance calls.
- **Equity `runAutomatedMarketScan` (actions.ts:2129–2280):** radar-only, **hardcodes `issuedCount: 0`**, zero call sites of `recordSignal` in the scan path.
- Crypto issuance is reachable only via manual `analyzeCoin` dossier view; equity issuance only via manual dossier/analyze path. **All 12 checked crons call nothing on the issuance path** (memory `memory/2026-10-13.md#L736`).
- The 296 suppressed candidates exist only because discovery computes the issuance *checks* and logs the *suppressions* — suppression rows are not opportunities the collector can track forward into issuance.

The "scheduled issuance" capability that would connect detection → issuance is **`scheduled-issuance-spec-draft-2026-10-13.md` — a draft spec, NOT approved, NOT deployed.** This is the central missing piece for the expert's confirmation.

---

## 3. The deployed paper path: `runpapersignalcycle`

- Two paper-only actions exist on the deployed artifact `altcoin-analyzer-and-signal-tracker`: `runpapersignalcycle` and `getpaperpilotstatus` (deployed ~2026-10-14 04:54 UTC; post-date the 2026-10-13 source export).
- **NO hatch schedule invokes `runpapersignalcycle`.** `cron.list` (include_disabled=true) shows no paper-cycle job. The three recorded deployed paper runs all reference **market discovery run id 56** (`getpaperpilotstatus` snapshot `live-paper-status-2026-10-14.json`, exported 2026-10-14T05:41:30Z):

| Run | Trigger | Started (UTC) | candidateCount | issuedCount | Result |
|---|---|---|---|---|---|
| 1 | `scheduled` (artifact self-report; no matching hatch cron exists) | 2026-10-14 04:54:12 | 0 | 0 | complete, zero opportunities |
| 2 | manual | 2026-10-14 04:54:56 | 0 | 0 | complete, zero opportunities |
| 3 | manual | 2026-10-14 05:18:02 | 0 | 0 | complete, zero opportunities |

All three summaries: "No directional discovery candidate was available for the explicit paper path; no signal was manufactured." `candidates=[]`, `signals=[]` in the live stream. Legacy 31 tracked signals intact.
- **Gap (c):** the paper cycle has no schedule — it runs only when someone (agent/operator) invokes it. Run 1's `trigger: "scheduled"` is the artifact's own self-reported label; there is no hatch cron behind it. The deployed issuance branch has never naturally fired.
- **Gap (d):** the only candidate-count evidence for the discovery side is **0 candidates per paper cycle against discovery run 56**. The counts on discovery run 56 itself (universeSize/signalCount/shortlisted) are not on record in the workspace.

---

## 4. Named gaps — why the answer is PARTIAL / NO, not YES

1. **(a) Per-run candidate counts are unverifiable from this workspace.** Scheduler run records for the discovery jobs carry no counts; the deployed `market_discovery_runs` table is not readable here. To name them, the parent must invoke a deployed artifact read (e.g. the discovery-read action or the discovery dashboard) and record `universeSize / shortlisted / signalCount` per run id.
2. **(b) No discovery schedule is producing equity candidates.** `equity-theory-discovery` has 15 consecutive timeouts; last success 2026-10-06. The equity arm of forward collection currently has no live candidate source.
3. **(c) The paper issuance cycle is not scheduled.** `runpapersignalcycle` exists but no cron invokes it; its only automatic-looking run (id 1) is artifact self-report with no matching hatch schedule. Automatic collection collects whatever the paper pipeline sees — and nothing feeds the paper pipeline on a schedule.
4. **(d) Scheduled discovery is radar-only by design.** Even when fully healthy, `crypto-market-discovery` emits radar rows and suppression logs, never issuance calls. The "scheduled issuance" step (detection → real issuance) exists only as an unapproved draft spec.
5. **(e) Live paper stream is empty post-freeze.** Three deployed paper cycles against discovery run 56: 0 candidates, 0 signals. The prospective vessel `rows/cohort-prospective-v2.csv` remains header-only. There is currently nothing for automatic collection to collect.

**Bottom line for the expert:** the collection job can only collect what the paper pipeline produces, and nothing produces paper candidates automatically today. Crypto discovery *scans* automatically every ~6h, but its outputs reach the paper path only via manual `runpapersignalcycle` invocation, and the three runs that did look found zero candidates. Until (i) a schedule drives `runpapersignalcycle` (or an equivalent detection→paper-issuance path), and (ii) the equity discovery failure streak is fixed, the "scheduled discovery produces candidates automatically" confirmation cannot be given.

---

## 5. Collection job status — confirmed still enabled

- **Job:** `paper-signal-comparison-collection` · `interval@6h` (UTC) · **owner:** `goal:research-terminal` · **enabled:** `true` · timeout 1800s · definition: `~/workspace/goals/research-terminal/crons/hourly/paper-signal-comparison-collection__interval@6h.md`.
- **Latest execution:** run `b95cb596-9b86-4379-8539-6fee399ed095`, scheduled Wed 2026-10-14 01:40:22 EDT, **succeeded** at 2026-10-14 05:43:29 UTC. Consecutive failures: 0. In flight: none. Queued: none.
  - Summary: live stream pulled (`getpaperpilotstatus`, 3 runs, all complete, 0 candidates) → export built → collector ran (50 ingested, 0 crypto + 50 equity, 50 rejected pre-freeze) → **0 rows added, 0 deduped**; vessel `rows/cohort-prospective-v2.csv` remains header-only; stamp check v2.1.4 passed; no audit trigger. Routine healthy 0-row run.
- **Next run:** Wed 2026-10-14 07:40:19 EDT (~06:00 EDT... scheduled ~5h58m out at check time).
- Note: the earlier `scheduler-executions-2026-10-14.json` recorded "installed: false" — that snapshot predates installation (spec was installed afterward with Logan's approval, 2026-10-14). The live scheduler now shows it enabled and run once.

---

## 6. Chat routing config — still armed

`paper-signals/pilot/delivery/delivery-config.json` (version 2026-10-14, decided by Logan):

- **Destination (armed):** research side chat `a685c3e7-c8be-4137-8900-4e899008bca7` ("Muse research side chat", chat notification path) **AND** terminal (`tracker-alert-feed`). Same signal, two views.
- Alert types: `SETUP_PENDING`, `ENTRY_CONFIRMED`. Labels: PAPER. Paper-only. Dedup key `(signal_id, alert_type)`; retries 60s/5m/15m/1h, max 6 attempts.
- Delivery rule: `delivered` only after chat channel acknowledges; abstentions stay terminal-only + compact daily chat summary.
- Routing test: status **`channel-acked`**, sent 2026-10-14T05:12:07Z, ack 18.8s later via message reaction. `live_paper_alerts_gated: false`.
- **Caveats (unchanged):** the ack is an assistant self-report from conversation records (no independent deployed evidence); the artifact's own in-artifact delivery config still reports `configured: false` — Logan's chosen destination is recorded in the workspace file, not yet wired as an artifact delivery action (see `LIVE-STREAM-WIRING-2026-10-14.md` known gap).

---

## 7. Recommended follow-ups (for parent/Logan — not taken)

1. **Fix or acknowledge `equity-theory-discovery`** (15 consecutive space-worker 120s timeouts since 2026-10-06). Equity forward collection has no live candidate source until this recovers.
2. **Decide the paper-cycle cadence.** Install a hatch schedule invoking `runpapersignalcycle` (or approve the `scheduled-issuance-spec-draft`) so detection→paper-issuance is automatic; today the cycle runs only on manual invocation.
3. **Recover per-run discovery counts.** Have a parent/agent with artifact access record `market_discovery_runs` counts (universeSize/shortlisted/signalCount) per run — this is the only way to answer "how many candidates per discovery run" with evidence.
4. Watch for the first post-freeze paper opportunity: the collection job will capture it once the pipeline sees one.
