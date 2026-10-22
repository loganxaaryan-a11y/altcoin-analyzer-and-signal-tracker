---
id: paper-pipeline-fault-observer
title: Paper pipeline fault observer
enabled: true
owner: goal:research-terminal
mode: task
schedule:
  kind: interval
  timezone: America/Toronto
  at: 2026-10-20T16:57:09
  every: 1h
delivery:
  - chat_id: a685c3e7-c8be-4137-8900-4e899008bca7
metadata:
  originating_chat_context_json: '{"chat_id":"a685c3e7-c8be-4137-8900-4e899008bca7","origin_provider":"main","chat_kind":"direct","event_kind":"message","require_mention":false,"device_id":"d8c63a1c-801b-497b-a9fe-cd2681d2185d"}'
  presentation_locale: en-US
---
## Paper pipeline fault observer (every 1 hour, PAPER ONLY)

Logan's instruction (2026-10-16): observe the paper-signal pipeline and learn where and what is faulty. This is a READ-ONLY diagnostic. Never change thresholds, models, gates, or holdouts. Never issue signals.

REPOINTED 2026-10-20 (terminal-first closeout, Step 5): the agent trigger/wrapper/delivery jobs are retired. Issuance runs on the deterministic `paper-issuance-cycle` space_action (5m, 0 agent launches) driving runpapersignalcycle; lifecycle records live in the artifact's notification store. This observer measures the chain from STORE timestamps only. The retired jobs' run logs and the workspace delivery ledger are frozen history — if you read the ledger at all, an entry's status lives ONLY in its `delivery_status` field (never `state`); the store is the live source.

### What to observe
1. **Paper cycle outcomes**: check the most recent runpapersignalcycle issuance runs (getpaperpilotstatus `runs` on altcoin-analyzer-and-signal-tracker). For each: issued count, abstained count, deferred count, and the abstention reasons. Compare against the previous observation — is the pattern changing? Also verify the bounded issuance-work check: a handoff whose intake rows are ALL completed (every row has completedAt + a recorded outcome) must NOT mint new issuance run rows across cycles; repeated run rows for a fully-accounted handoff are a fault to report. A handoff with incomplete intake rows (completedAt null / status queued) SHOULD be processed — that is recovery working, not a fault.
2. **New code paths**: is there evidence the new code is being exercised?
   - 1m venue kline observations in veto metadata (print IDs like `{venue}:{pair}:1m:{openTimeMs}`)
   - Alert rows carrying the full 2026-10-14 chat payload (vs the old thin unrenderable records)
   - Venue mappings resolving (no `missing_instrument_mapping` for mapped venues)
3. **Delivery chain (store-based)**: read getNotifications on the crypto artifact. New rows? eventAt → storedAt delay (terminal visibility), chatSentAt stamps from the 30m terminal-digest. Any urgent-class row (ENTRY_CONFIRMED / position-closing) whose chatSentAt lands after its expiresAt is a HISTORICAL notification, not an actionable entry — record it as such; never present a late chat send as an in-window delivery.
4. **Discovery**: latest discovery run candidate counts (qualified / abstained / suppressed). Any change in flow? Failed discovery slots stay recorded as coverage gaps — do not reopen exhausted P3 retries.
5. **Errors**: any action errors, timeouts, or overloads in the pipeline's recent runs (e.g. `auditTheoryIntegrity` timeouts, space worker overloads)? A "database is locked" failure must be traced before being assigned to the platform — check for our own overlapping writes (concurrent artifact writes in the same window) and say which the evidence supports.

### Execution vs receipt status (Logan 2026-10-16 — always separate)
For every job you report on, record TWO statuses, never one:
- `execution_status`: did the job's actual work run (real output, real side effects, tick lines, action invocations)?
- `receipt_status`: did the scheduler's receipt/audit write succeed (scheduler_invocation_receipts rows, tick-line appends, run logs)?
A job can be execution-SUCCEEDED + receipt-FAILED. Never let a receipt failure masquerade as a job failure, and never let a succeeded receipt hide failed work. Receipt logging must never be the thing that prevents a monitoring job from executing — if a receipt write fails, the work still counts; log the receipt failure as its own visible signal.

### Five-stage chain measurement (store timestamps only — repointed 2026-10-20)
For the first UNATTENDED handoff processed after 2026-10-16T12:15Z, assemble and record the full chain from evidence — never invented:
1. `t_discovery_complete` — the handoff's completedAt (getpaperpilotstatus handoffRuns)
2. `t_terminal_visibility` — when the resulting alert rows were committed to the artifact store (paperAlertEvents createdAt / getNotifications storedAt). This replaces the retired trigger-poll visibility stage.
3. `t_qualification` — issuance run completedAt (getpaperpilotstatus runs)
4. `t_first_observation` — first admissible observation (candidate entryObservedAt / checkpoint firstPrintObservedAt)
5. `t_chat_sent` — getNotifications chatSentAt (the digest's send stamp), recorded SEPARATELY from terminal visibility. If chatSentAt is after the row's expiresAt, the item is a historical notification — report the delay honestly, never as an in-window actionable delivery.
Report: each stage's elapsed time, the total discovery→qualification time, and whether qualification completed inside the candidate's 15-minute entry window. Qualification and provider latency consume the same window — measure them, don't assume. Report the chain the first time a full unattended handoff completes, then keep measuring silently (state file only) unless the chain breaks the window again.

### How to observe
- Use `artifact.invoke_action` (getpaperpilotstatus, getpaperpilothandoffs, getNotifications on altcoin-analyzer-and-signal-tracker), `muse.db` for scheduler/outbox tables if needed, and read the run logs under `~/workspace/goals/research-terminal/paper-signals/pilot/delivery/` and `~/workspace/goals/research-terminal/hidden_files/`.
- Keep a small state file at `~/workspace/goals/research-terminal/hidden_files/pipeline-fault-observer/state.json` recording the last observed counts/reasons so each run can detect CHANGE.

### Reporting rule (strict)
- **Silent by default.** Emit chat output ONLY when you find something genuinely new and diagnostic:
  - a fault with a traced mechanism (not just "X failed" — say WHERE in the pipeline and WHAT the evidence shows, e.g. "issuance abstains on NEAR because post-decision kline window is empty — the 1m fetch returned 0 closed klines for [decision, quote]")
  - the first successful issuance through a new code path (venue mapping / 1m observation / full payload)
  - a meaningful change in abstention pattern vs the previous run
  - the first measured five-stage chain for an unattended handoff (report the timings and the in-window verdict)
- No routine "all quiet" messages. No summaries of unchanged state. When silent, just update the state file and end with no output.
- When you do report: plain language, name the pipeline stage, cite the evidence (run IDs, row counts, timestamps). One fault per message, concise. Always give execution_status and receipt_status separately.

### Hard rules
- Read-only. No writes to the artifact, no cron changes, no ledger edits.
- Never invent pipeline behavior. If a read fails, note it in the state file and stay silent unless the failure itself is a new fault pattern.
- Do not duplicate the digest's job: this observes the PIPELINE (discovery → issuance → alert rows), not chat delivery acks.
