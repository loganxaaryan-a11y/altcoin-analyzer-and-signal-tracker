---
id: paper-signal-alert-delivery
title: Paper-signal alert delivery (slim alerts-only polling)
enabled: false
owner: goal:research-terminal
mode: task
schedule:
  kind: interval
  timezone: America/Toronto
  at: 2026-10-14T12:00:00
  every: 15m
timeout_secs: 600
delivery:
  - chat_id: 7b75e732-f527-4d53-b40d-4aa036201d9b
metadata:
  originating_chat_context_json: '{"chat_id":"a685c3e7-c8be-4137-8900-4e899008bca7","origin_provider":"main","chat_kind":"direct","event_kind":"message","require_mention":false,"device_id":"d8c63a1c-801b-497b-a9fe-cd2681d2185d"}'
  presentation_locale: en-US
---
## Paper-signal delivery worker — v2.3 slim-read

PAPER ONLY: no brokerage, orders, real money, prediction-weight changes, freeze changes, or holdout changes. When one or more alerts are due, your final run output is the chat notification. When nothing is due and there is no one-time UNKNOWN/failure surfacing, emit no chat-facing output.

### Durable files
- Config: `~/workspace/goals/research-terminal/paper-signals/pilot/delivery/delivery-config.json`
- Production ledger: `~/workspace/goals/research-terminal/paper-signals/pilot/delivery/alert-delivery-ledger.json`, keyed `<signal_id>/<alert_type>`
- Test ledger: `~/workspace/goals/research-terminal/paper-signals/pilot/delivery/alert-delivery-ledger-test.json`, keyed `test/<signal_id>/<alert_type>`; never mix with production
- Production timeliness log: `~/workspace/goals/research-terminal/paper-signals/pilot/delivery/entry-to-delivery-log.jsonl`
- Test timeliness log: `~/workspace/goals/research-terminal/paper-signals/pilot/delivery/entry-to-delivery-log-test.jsonl`; never mix with production
- Worker snapshots/logs: `~/workspace/goals/research-terminal/paper-signals/pilot/delivery/worker-runs/`; keep the latest 20
- Schema: `~/workspace/goals/research-terminal/paper-signals/pilot/delivery/alert-schema.json`
- Render contract: `~/workspace/goals/research-terminal/paper-signals/pilot/delivery/ALERT-SCHEMA-2026-10-14.md`
- Timeliness contract: `~/workspace/goals/research-terminal/paper-signals/pilot/delivery/ENTRY-TO-DELIVERY-METRIC-2026-10-14.md`

### 0. Provenance and mode
Record `worker_started_at_utc` immediately. Read config fields `discovery_mode` and `trigger_grace_s` (default 120). Read the run reason from execution context, using `cron.runs` only as a fallback.
- Reason beginning `trigger:` => TRIGGERED routing. Parse `trigger:<signal_id>/<alert_type>[,...] issued_at=<UTC ISO>`; test probes use `trigger:test/<signal_id>/<alert_type> issued_at=<UTC ISO>`.
- Any other or unreadable reason => SWEEP routing. If unreadable, log `provenance: undetermined — degraded to sweep`.
A trigger reason is a caller claim, not authoritative origin proof. Write `scheduler_provenance: origin_unverified`, except reasons beginning `manual:` and test-probe coordinator runs write `manual`. Never self-write `verified:<execution-id>`.

### 1. Bounded execution
Complete all snapshots, ledgers, timeliness entries, and run logs by start+12 minutes; stop new work then and end by start+13 minutes. Do not begin the alert read after start+9 minutes; log `alerts_fetch: deferred — budget` and end. All file work happens before final output.

### 2. Resume and ledger semantics
The ledgers are the resume state. Supplementary atomic checkpoint files may be used only as hints.
- `delivered`, `suppressed`, `failed`, and `unrenderable` are terminal and never re-sent.
- **Ledger field rule (2026-10-20 defect closure):** an entry's status lives ONLY in its `delivery_status` field. Read `delivery_status` — never `state` or any other guessed field name. An entry whose `delivery_status` is missing or unreadable is treated as EXISTING and BLOCKING (fail-closed): never as unledgered, never overwritten; surface it for operator review.
- **Terminal overwrite guard:** a terminal entry (`delivered`, `suppressed`, `failed`, `unrenderable`) is immutable. No section (§4a, §5, §6, §6a, §6c, §7) may overwrite, replace, or re-decide it. Every ledger write is conditional on the key being absent, or a §5/§7 transition of a non-terminal entry.
- `unknown` is never auto-retried and is surfaced at most once.
- `awaiting-ack` is reconciled before any send; never blindly re-send.
- Duplicate triggers must not duplicate notifications: all decisions dedup on `signal_id` + `alert_type` in the correct production or test ledger.
Reuse an alerts-only snapshot from the same 15-minute window if present.

### 3. Load state
Load config plus production and test ledgers. Keep the stores strictly separated.

### 4. Slim alerts-only read
Invoke `getpaperpilotalerts` on the `altcoin-analyzer-and-signal-tracker` artifact. Do not invoke `getpaperpilotstatus` from this worker, except for the §4a frozen-expiry candidate lookup and the §6c final dispatch check.
- Default args: `{}`.
- Test trigger exception: for a reason beginning `trigger:test/`, invoke `getpaperpilotalerts` with `{"emitTestAlert":true}`; it returns one labeled synthetic TEST row without persisting it.
Record `poll_started_at_utc`, `poll_finished_at_utc`, and `poll_duration_ms` around the action. Save only the raw alerts response as `worker-runs/alerts-<UTC-ts>.json`. If the action fails, record it and remain silent; never fabricate data and never fall back to the full status action.

The slim path must retain and validate the fields needed for all decisions:
- expiry: the candidate record's `entryExpiresAt` (frozen window close, resolved per §4a); payload `issued_at` retained for identity and timeliness
- lifecycle: top-level `eventType` and payload `alert_type`
- identity: top-level `paperSignalId` and payload `signal_id`
- reconciliation: ledger `signal_id`, `alert_type`, `issued_at`, and pre-commit `sent_at_utc`
Any top-level/payload identity mismatch is `unrenderable` and is never sent.

### 4a. IMMEDIATE expiry suppression (before slow work)
**This step runs immediately after §4, before ack reconciliation (§5) and before validation/classification (§6).**

For each row in the slim `data.alerts` array, perform ONLY the deterministic expiry check:
1. Parse `payloadJson` minimally to extract `signal_id`, `alert_type`, and `issued_at`.
2. If `alert_type` is `SETUP_PENDING`:
   - Resolve the frozen observation window from the candidate record (one read-only status call shared across all SETUP_PENDING rows in this batch): invoke `getpaperpilotstatus` on the `altcoin-analyzer-and-signal-tracker` artifact. This is the one other permitted status read in this worker — §4's prohibition is otherwise unchanged. Match each row by top-level `contractId` against `data.candidates[].candidateKey`, or by the `pending_<id>` numeric suffix of top-level `paperSignalId` against `data.candidates[].id` (platform `{ ok, data }` envelope; row `id` equals the candidate id). Read the candidate's `entryExpiresAt` — the frozen window close. Never compute `issued_at + 15 minutes`; never invent a window.
   - If the status call fails, the candidate row is not visible, or `entryExpiresAt` is absent: DEFER the key — write nothing to the ledger and leave it for the next sweep (fail-closed). Absence of candidate evidence is neither expiry evidence nor dispatch evidence.
   - If `now` is past the candidate's `entryExpiresAt`: write terminal `suppressed` with reason `entry_window_expired`, `window_close_utc` (the candidate's `entryExpiresAt`), and `now_utc` to the correct ledger (production or test based on `test` flag).
   - Use conditional idempotent write: if the key already exists in the ledger (any state), skip the write.
   - This write MUST complete before proceeding to §5.

This ensures that even if the worker times out during slow ack reconciliation or narrative work, expired alerts are already durably suppressed. The suppression resolves the frozen window from the candidate record via one bounded read-only status call shared across the batch; keys whose window cannot be resolved are deferred, never suppressed on a computed deadline.

Record `expiry_suppressions_written` in the run log.

### 5. Ack reconciliation before sends
For every non-terminal production and test ledger entry (`awaiting-ack`, `retrying`, `unknown`), reconcile only against its own ledger and the scheduler outbox. Match the entry run via `run_ts_utc` and the delivery key `cron-delivery:paper-signal-alert-delivery:<run_id>:side_chat:7b75e732-f527-4d53-b40d-4aa036201d9b`; if the entry lacks a delivery key, inspect the latest row created after its `sent_at_utc`.
- Outbox `state='delivered'` with non-null `delivered_at_utc`: mark `delivered`, preserve ack evidence, and never re-send. Append the correct production/test timeliness record, including `event_time_utc`, `event_time_source`, `ack_at_utc`, `event_to_delivery_delay_s`, `enqueue_to_ack_delay_s = ack_at_utc - sent_at_utc`, run source, and missed-trigger status. Never clamp a negative interval; record `clock_skew:true`.
- Explicit outbox `state='failed'`, no outbox row after a full 15-minute interval, or an outbox row in any ambiguous state (including stalled dispatching): the relay is UNKNOWN. Absence of an outbox row is never proof of no-send — not after 15 minutes, not ever. Mark `unknown`; it is not delivered, failed, or retryable. Surface exactly once: `<signal_id>: delivery unknown — operator review`; set `unknown_surfaced_at_utc`. Never auto-retry.
- Less than one interval old without decisive outbox evidence: leave `awaiting-ack`.
- Outbox-query failure: retry the reconciliation query on the documented backoff, not the alert send. Reconciliation query failures never become `failed` and never authorize a send. After six consecutive reconciliation failures the entry remains `unknown` (surface once); record the failures in the run log.
- No `recovered_unsent` flag exists and no automatic resend exists on any path. Missing receipts, query failures, and failed outbox states without affirmative no-send evidence remain `unknown`. Affirmative no-send evidence means an explicit worker-side record that the send was never attempted for that key — never absence of a row — and even affirmative evidence routes to operator review, never to an automatic resend.

### 6. Validate, classify, and dedup
For every row in the slim `data.alerts` array, parse `payloadJson`, validate against `alert-schema.json`, and require top-level `paperSignalId/eventType` to equal payload `signal_id/alert_type`. Missing or invalid required fields become one `unrenderable` ledger record and a one-line blocker; never partially render. Only `SETUP_PENDING` and `ENTRY_CONFIRMED` qualify. Route payloads with `test:true` to the test branch and test ledger only.

Dedup states:
- `delivered`, `unknown`, `suppressed`, `failed` => skip forever
- `awaiting-ack` => skip; reconcile via §5 before any send; never blindly re-send
- `retrying` => skip; reconcile via §5 before any send; never blindly re-send (no writer exists for this state)
Never send abstentions, vetoes, below-threshold states, or no-qualifier ticks.

For a key with no ledger entry:
- TRIGGERED: consider only keys named in the trigger reason. A named key not visible in the slim response is logged `triggered_key_not_visible` and skipped; never render from the reason string. Ignore un-named fresh keys.
- SWEEP + `trigger-only`: skip keys younger than `trigger_grace_s`; after grace, treat as missed-trigger recovery and record `missed_trigger:true`, `trigger_source:sweep`.
- SWEEP + `sweep-fallback`: consider fresh qualifying keys immediately.

### 6a. Lifecycle and expiry guard
Run before pre-commit for each due production `SETUP_PENDING` key S. Evaluate in order:
1. If an `ENTRY_CONFIRMED` row for S is visible in the same slim response, or the production ledger has `S/ENTRY_CONFIRMED` in `delivered` or `awaiting-ack`, write terminal `suppressed` with reason `setup_entered`.
2. If `now` is past the frozen observation window close — the candidate's `entryExpiresAt`, resolved per §4a from the candidate record, never `issued_at + 15 minutes` — write terminal `suppressed` with reason `entry_window_expired`, `window_close_utc` (the candidate's `entryExpiresAt`), and `now_utc`. If the window cannot be resolved, defer (fail-closed); do not suppress. (Note: §4a already handles this for the common case; this is the backstop for keys that arrive via other paths.)
3. If top-level and payload identity/lifecycle fields disagree, write `unrenderable` and never send.
Suppression is a durable history record and produces no chat output.

### 6b. Test isolation
A TEST row is never processed by the production branch. Use `test/<signal_id>/ENTRY_CONFIRMED` in the test ledger. Only a `trigger:test/` run may send it; sweeps and ordinary triggers skip it. Apply the same validation, pre-commit, dedup, ack reconciliation, UNKNOWN behavior, and timeliness calculation, but only in test files. Render a clear `TEST — PAPER — ENTRY CONFIRMED` banner. Never write a test key to production files or a production key to test files.

### 6c. Final dispatch eligibility check (duplicate-suppression)
For each due production `SETUP_PENDING` key S that survived §6–§6b, perform the final dispatch check BEFORE pre-commit (§7). Unknown eligibility DEFERS for retry — fail-closed:
1. Invoke `getpaperpilotstatus` on the `altcoin-analyzer-and-signal-tracker` artifact (read-only; this is one of the two permitted status reads in this worker — §4a and §6c — §4's prohibition is otherwise unchanged). If the call itself fails, log `dispatch_check_status_call_failed` and DEFER the key: do not render, do not write any ledger entry, preserve it for the next sweep, which re-runs this check.
2. Find the candidate: the slim alert payload carries no `candidateId` — never read one from the payload. Match by top-level `contractId` against `data.candidates[].candidateKey`, or by the `pending_<id>` numeric suffix of top-level `paperSignalId` against `data.candidates[].id` (platform `{ ok, data }` envelope; row `id` equals the candidate id). There is NO `paperSignalCandidates` field in the response — matching that name matches nothing and would let a duplicate-suppressed candidate look "not visible" and dispatch anyway.
3. If the candidate's `state` is `abstained` AND its `reasonCode` is `duplicate_24h_suppression`, write terminal `suppressed` with reason `duplicate_suppressed_at_dispatch` to the production ledger, recording the candidate key and its stored reason. Never render it.
4. If the candidate is not visible in the status response, log `dispatch_check_candidate_not_visible` and DEFER: do not render, do not mark the key terminal (no ledger entry), preserve it for the next sweep, which re-runs this check. Absence of status evidence is neither suppression evidence nor dispatch evidence. If the entry window expires while a key is deferred, §4a suppresses it as `entry_window_expired` — a separate terminal condition.

This is the final safety net for the phantom-alert defect (round 3): the issuance path now suppresses duplicates before enqueueing `SETUP_PENDING`, but any alert enqueued before that repair — or any future race — must be rejected here before dispatch. Already-delivered erroneous alerts (pending_83, pending_93) remain in history as delivered; this check governs only keys not yet dispatched.

### 7. Commit before render/send
ORDER IS THE MECHANISM:
1. Finish validation, routing, dedup, and lifecycle/expiry checks; determine the final due set.
2. Pre-commit each due key to its correct ledger as `awaiting-ack` with `attempts+1`, `signal_id`, `alert_type`, payload `issued_at`, `sent_at_utc` now, `run_ts_utc`, `run_mode`, `event_time_utc`, `event_time_source`, and `missed_trigger` where applicable. Write each ledger atomically. (No `recovered_unsent` flag exists — do not set, read, or clear one.)
3. Write the run log and checkpoint. All file work ends here.
4. Only now render final output from the validated row, with PAPER/TEST banner, asset, direction, signal id, setup reason, entry rule/price, invalidation, targets, horizon, data timestamp, and trailer `dedup: <signal_id> / <alert_type>` (test prefix for tests).

A committed alert remains recoverable through the ledger. If execution stops before render, the entry stays `awaiting-ack`; a later run does not send it automatically — §5 reconciliation applies, and without affirmative no-send evidence the entry becomes `unknown`, surfaced once, never auto-retried. Duplicate triggers see the ledger key and do not duplicate notifications. If a render/send is ambiguous, outbox reconciliation produces UNKNOWN, surfaces it once, and never auto-retries.

### 8. Run log and performance comparison
Before final output, write `worker-runs/run-<UTC-ts>.json` with:
- run mode, trigger keys, caller-claim provenance, discovery mode
- `poll_started_at_utc`, `poll_finished_at_utc`, `poll_duration_ms`
- `worker_started_at_utc`, `worker_finished_at_utc`, `worker_duration_ms`
- `expiry_suppressions_written` (from §4a)
- controller status and per-key delivery status kept separate
- alerts seen, sent, skipped with reasons, pre-commits, acks, UNKNOWN transitions, failures, missed-trigger recoveries, and suppressions
- for delivered keys, `event_to_delivery_delay_s` and `enqueue_to_ack_delay_s`
- comparison to the latest comparable earlier full-status worker run when one exists: actual poll duration, actual worker duration, and existing enqueue-to-ack latency. If a comparable value does not exist, write `comparison_unavailable` rather than estimating.
Prune worker-runs to 20 files only after the new run log is durable.

### 9. Hard semantics
- Exactly-once delivery is not claimed.
- Committed alerts remain recoverable via the ledger.
- Duplicate triggers must not duplicate notifications; dedup key is `signal_id` + `alert_type`, scope-separated for production/test.
- A real outbox acknowledgement is the only transition to `delivered`.
- Ambiguous sends become UNKNOWN, surface once, and are never auto-retried.
- Ledger pre-commit always precedes rendering.
- Never invent signal fields, prices, identifiers, or timestamps.
- Keep production and test ledgers/timeliness logs completely separate.
- If nothing is due and nothing changed that must surface, emit no chat-facing output.
