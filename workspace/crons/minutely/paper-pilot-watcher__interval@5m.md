---
id: paper-pilot-watcher
title: Paper pilot watcher (VM reference watch)
enabled: true
owner: goal:research-terminal
mode: task
schedule:
  kind: interval
  timezone: America/Toronto
  at: 2026-10-20T16:29:11
  every: 5m
timeout_secs: 600
delivery:
  - chat_id: a685c3e7-c8be-4137-8900-4e899008bca7
metadata:
  originating_chat_context_json: '{"chat_id":"a685c3e7-c8be-4137-8900-4e899008bca7","origin_provider":"main","chat_kind":"direct","event_kind":"message","require_mention":false,"device_id":"d8c63a1c-801b-497b-a9fe-cd2681d2185d"}'
  presentation_locale: en-US
---
## Paper pilot watcher — VM reference lane, watch mode (PAPER ONLY)

You are the watcher worker for the paper-signals sandbox reference lane. Paper signals only. No brokerage. No production modifications. Holdouts locked. Do NOT change any code, config, or freeze.

Receipt schema: ~/workspace/goals/research-terminal/hidden_files/receipt-provenance/RECEIPT-SCHEMA.md.

1. Run ONE bounded watcher pass in watch mode (fresh process, DB-only resume):
   cd ~/workspace/goals/research-terminal/paper-signals/pilot && PILOT_DB="$HOME/workspace/goals/research-terminal/paper-signals/pilot/data/paper-pilot.sqlite" node dist/pilot.js watch
   This picks up due pending/deferred/awaiting-entry candidates from the durable SQLite store and runs bounded entry observation (poll 20s, maxPolls 40, 15-min crypto window). It resumes from persisted DB rows only — there is no in-memory registry to preserve.
2. Do NOT run ingest or run here — this job is watch-only; qualification is the deployed paper-signal-cycle job's remit. (The watch pass never ingests; it only processes existing rows.)
3. If the watch pass reports issued/expired candidates, note the candidate ids, outcome, and entry timing (decisionAt → entryObservedAt) in your final message. A pass that processes 0 candidates is a normal, healthy result — say so plainly.
4. Never treat poll-budget exhaustion as expiry: the handler keeps the candidate awaiting-entry with nextReassessmentAt set. If you see outcome gate poll-budget, report it as scheduled-resume, not a failure.

Tick log (append one JSON line to ~/workspace/goals/research-terminal/hidden_files/paper-pilot/watcher-ticks.log):
{"ts":"<ISO-8601 UTC>","cycleId":"<cycle id>","exitCode":<n>,"processed":<n>,"issued":[],"awaiting":[],"rejected":[],"expired":[],"deferred":[],"scheduler_provenance":"origin_unverified"}
- The tick line is a completion record only (what the pass did) — it asserts nothing about scheduled origin.
- `scheduler_provenance`: `origin_unverified` (DEFAULT — write this), `manual` (only when this pass was started by an explicit manual invocation whose reason begins with `manual:`), NEVER `verified:<execution-id>` (reserved for the external reconciliation pass — hidden_files/receipt-provenance/RECONCILIATION.md). You cannot self-certify a scheduled origin from inside the run.

### Verifier (Logan 2026-10-16 — added after the 08:07 mis-verification)
After the watch pass, VERIFY explicitly — do not rely on memory of what you ran:
1. Read the LAST line of watcher-ticks.log.
2. Confirm its `ts` is within the last 10 minutes of now. The tick's own timestamp is the evidence — never require it to match your run's scheduler timestamps (clocks can skew; the 08:07 run's tick was timestamped 12:07:15Z while the scheduler record said 12:08:17Z, and the old check wrongly failed).
3. Report TWO statuses separately in your final message:
   - `execution`: SUCCEEDED/FAILED — from the watcher process's actual exit code and output.
   - `verification`: CONFIRMED/UNCONFIRMED — from step 2's tick-line check.
   An exitCode-0 tick line within 10 minutes = execution SUCCEEDED and verification CONFIRMED, even if processed=0.
4. If the tick-line append itself fails: report `receipt_write_failed` as its own signal — the watch pass's execution status stands on its exit code alone. Receipt logging never invalidates executed work.

Report in your final message: candidates processed, outcomes (issued/expired/awaiting/deferred/rejected), execution status, verification status, and any error text. Keep it terse.
