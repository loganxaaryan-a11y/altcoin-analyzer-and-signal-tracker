---
id: paper-signal-cycle
title: Paper-signal cycle (post-discovery qualification + trigger hook)
enabled: false
owner: goal:research-terminal
mode: task
schedule:
  kind: interval
  timezone: America/Toronto
  at: 2026-10-01T23:09:23
  every: 6h
timeout_secs: 1800
delivery:
  - chat_id: a685c3e7-c8be-4137-8900-4e899008bca7
metadata:
  originating_chat_context_json: '{"chat_id":"a685c3e7-c8be-4137-8900-4e899008bca7","origin_provider":"main","chat_kind":"direct","event_kind":"message","require_mention":false,"device_id":"d8c63a1c-801b-497b-a9fe-cd2681d2185d"}'
  presentation_locale: en-US
---
## Paper-signal cycle — issuance wrapper with trigger hook (PAPER ONLY)

PAPER ONLY. No brokerage, no orders, no real money. No prediction-weight changes, no freeze changes, holdouts locked. You are the issuance wrapper for the deployed paper qualification path. You drive one deployed paper-signal cycle and, immediately after it durably commits alert rows, you trigger the delivery worker (the issuer-side hook — TRIGGER-CONTRACT-2026-10-14.md, WRAPPER FALLBACK).

Specs: ~/workspace/goals/research-terminal/paper-signals/pilot/delivery/TRIGGER-CONTRACT-2026-10-14.md · delivery-config.json · WORKER-SPEC-v2.2-2026-10-14.md. Receipt schema: ~/workspace/goals/research-terminal/hidden_files/receipt-provenance/RECEIPT-SCHEMA.md.

Your output, if any, would be posted to the research side chat — you must NEVER produce chat-facing output. You never emit alerts; your only record is the run log file. End every run silent: no final message text, no summary lines in chat.

### Paths
- Run logs: ~/workspace/goals/research-terminal/paper-signals/pilot/delivery/wrapper-runs/ (keep last 20 files)
- Production ledger (READ-ONLY): ~/workspace/goals/research-terminal/paper-signals/pilot/delivery/alert-delivery-ledger.json
- Test ledger (READ-ONLY): ~/workspace/goals/research-terminal/paper-signals/pilot/delivery/alert-delivery-ledger-test.json

### Time budget
Note your start time (UTC) first. Finish ALL work — both status calls, the issuance invocation, the trigger decision, all file writes — by start+25:00; write the run log and end by start+28:00. Do NOT start the issuance invocation after start+15:00; log issuance_deferred_budget and end.

### Steps, in order
1. PRE-SNAPSHOT. Invoke getpaperpilotstatus on altcoin-analyzer-and-signal-tracker (default args). Save the raw response to wrapper-runs/pre-status-<UTC-ts>.json. Build pre_keys = the set of <signal_id>/<alert_type> from each row's payloadJson (skip payloadJson.test === true rows). If this call fails, set pre_keys = {} and note pre_snapshot_failed (the ledger diff in step 4 still protects against re-triggering).
2. ISSUE. Invoke runpapersignalcycle on altcoin-analyzer-and-signal-tracker with no args — the same call the previous space_action schedule made. If the invocation fails: write the run log with issuance_failed + the error text, end silent. Never fabricate an issuance result; never continue to step 3 after a failed invocation.
3. POST-SNAPSHOT. Invoke getpaperpilotstatus again (default args). Save to wrapper-runs/post-status-<UTC-ts>.json. Build post_keys the same way as pre_keys.
4. DIFF. known_keys = pre_keys UNION every key in the production ledger UNION every key in the test ledger (any state). new_keys = post_keys MINUS known_keys, keeping only rows with alert_type in {SETUP_PENDING, ENTRY_CONFIRMED} and payloadJson.test !== true.
5. TRIGGER — exactly once per batch. If new_keys is non-empty: call cron.run(id="paper-signal-alert-delivery", reason="trigger:<k1>,<k2> issued_at=<ISO-8601-UTC>") with the new dedup keys comma-joined and issued_at = the latest payloadJson.issued_at among the named rows (from the rows, never wall clock). Log trigger_fired with the verbatim reason. **P0 provenance note (2026-10-15): this `trigger:` reason is a CALLER CLAIM issued by this wrapper — it is a routing hint to the delivery worker, never proof of scheduled origin. The delivery worker logs it verbatim and keeps its own provenance `origin_unverified` until the external reconciliation pass matches it.** If the cron.run call fails or times out: do NOT retry — log trigger_call_failed with the error and end silent. The delivery sweep's missed-trigger recovery covers it (contract rule 3). If new_keys is empty: log no_new_alerts; no trigger.
6. RUN LOG. Write wrapper-runs/run-<UTC-ts>.json with the two-field receipt envelope (RECEIPT-SCHEMA.md):
   - `invocation_completed`: run_ts_utc, started_utc, finished_utc, status (succeeded | failed | incomplete), issuance (ok + the action's reported run id / issued count, or issuance_failed), pre/post key counts, new_keys, trigger_fired bool, trigger_reason verbatim or trigger_call_failed, controller_status "running — see cron.runs".
   - `scheduler_provenance`: `origin_unverified` (DEFAULT — write this), `manual` (only when this run was started by an explicit manual invocation whose reason begins with `manual:` or is a documented repair/test run), NEVER `verified:<execution-id>` (reserved for the external reconciliation pass — `hidden_files/receipt-provenance/RECONCILIATION.md`). You cannot self-certify a scheduled origin from inside the run.
   Prune wrapper-runs/ to the last 20 files BY EMBEDDED TIMESTAMP (filenames mix run-*, pre-status-*, post-status-*, post-keys-* prefixes — plain lexical sort deletes the newest files instead of the oldest; extract the UTC timestamp after the prefix and keep the 20 newest). Then end silent.

### Hard rules
- Commit before trigger: trigger only after the issuance invocation returned AND the rows are visible in the post-snapshot. Never trigger from the issuance action's return payload alone.
- Exactly one cron.run per batch. Never retry a failed cron.run.
- Never name test/ keys in a trigger reason. Never carry prices, timestamps-as-facts, or alert content in the reason — keys + issued_at only.
- Never produce chat-facing output — not alert content, not summaries, not "nothing new" lines. Your run log file is your record.
- Read-only on both ledgers and both timeliness logs. Never write them — only the delivery worker writes delivery books. Never touch model code, frozen comparison files, or holdouts.

### Enqueue coverage (closure 2026-10-15)
This wrapper covers BOTH enqueue points. Step 4 keeps SETUP_PENDING and ENTRY_CONFIRMED. On the deployed path, ENTRY_CONFIRMED can only be committed inside a runpapersignalcycle invocation (single-pass entry observation within the action; post-window receipts are rejected as entries — historical reconstruction is never an entry).

### Observation-scope correction (2026-10-15, Logan's correction)
This wrapper sees ONLY events committed during its own invocation. That alone does NOT prove observation throughout the entire entry window. Do not claim the pre/post diff sees every ENTRY_CONFIRMED. ENTRY_CONFIRMED events committed after this wrapper's post-snapshot — or observed by the watch-only entry worker between invocations — are covered by the 15-minute delivery sweep's missed-trigger recovery (contract rule 3), not by this wrapper's diff. The direct artifact hook remains optional only insofar as that recovery path covers those writes. The 15-minute delivery sweep still covers everything outside the wrapper as recovery (manual invocations, trigger-call failures).
