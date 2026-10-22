---
id: paper-issuance-trigger
title: Paper issuance trigger (discovery → issuance, event-driven)
enabled: false
owner: goal:research-terminal
mode: task
schedule:
  kind: interval
  timezone: America/Toronto
  at: 2026-10-20T00:17:55
  every: 5m
timeout_secs: 300
delivery:
  - chat_id: a685c3e7-c8be-4137-8900-4e899008bca7
metadata:
  tags: [cron:automatic-interval-anchor]
  originating_chat_context_json: '{"chat_id":"a685c3e7-c8be-4137-8900-4e899008bca7","origin_provider":"main","chat_kind":"direct","event_kind":"message","require_mention":false,"device_id":"d8c63a1c-801b-497b-a9fe-cd2681d2185d"}'
  presentation_locale: en-US
---
PAPER ONLY. No brokerage, no orders, no real money. No threshold, model, gate, or holdout changes.

You are the issuance trigger for the crypto paper pipeline. The deployed entry window is 15 minutes (PAPER_ENTRY_WINDOW_MS), but the issuance wrapper (paper-signal-cycle) fires on a 6h schedule, so candidates discovered between firings age past their windows. Your job: when a NEW completed discovery handoff appears, fire the issuance wrapper promptly so candidates are processed inside their original windows.

Steps:
1. Invoke getpaperpilothandoffs on artifact `altcoin-analyzer-and-signal-tracker` (no args — slim handoff-runs-only read: `data.handoffRuns` projected to `id` + `completedAt` per entry; see hidden_files/calls-review-2026-10-18/part3b-polling.md). From `data.handoffRuns` take the entry with the highest `id` — the latest completed handoff (fields: id, completedAt). If the call fails, note the failure in the state file and end silent.
2. Read the state file at ~/workspace/goals/research-terminal/hidden_files/paper-issuance-trigger/state.json. If absent: initialize {"lastTriggeredHandoffId": <latest handoff id>, "updatedAtUtc": <now UTC ISO>} — do NOT fire on first run (no backfill from cold start; the 6h paper-signal-cycle remains the backstop). Write state atomically (tmp + rename), end silent.
3. If latest handoff id > lastTriggeredHandoffId: call cron.run(id="paper-signal-cycle", reason="trigger:issuance handoff=<id> completed_at=<completedAt ISO>"). The wrapper runs the full issuance + delivery trigger through the existing rules; the artifact action is idempotent per handoff (runKey + onConflictDoNothing). Update lastTriggeredHandoffId and updatedAtUtc in the state file (atomic tmp + rename). Append a run log to ~/workspace/goals/research-terminal/hidden_files/paper-issuance-trigger/runs/run-<UTC-ts>.json with handoff id, trigger reason, and the cron.run result. End silent.
4. If no newer handoff: update updatedAtUtc in the state file, end silent.

Measurement (Logan 2026-10-16): two-minute polling is not a measured delivery guarantee. Every run log MUST record the stage timestamps it owns so the full chain can be measured: t_handoff_completed (the handoff's completedAt), t_visibility (this run's UTC time when it first saw the new handoff id), t_trigger_start (UTC time of the cron.run call), t_trigger_returned (UTC time the cron.run call returned). Later stages (qualification completion, first admissible observation) come from the wrapper run log and candidate entryObservedAt — the pipeline observer assembles the five-stage chain. Never invent a stage timestamp you did not observe.

Hard rules:
- Final message EMPTY, always. Never emit chat-facing output; your state file + run logs are your only record.
- Never invoke runpapersignalcycle directly — always go through the paper-signal-cycle wrapper so the delivery trigger runs.
- Never change the schedule of any other job. Never write to ledgers, models, or frozen comparison files.
- If cron.run fails or times out: log it in the run log, update state, do NOT retry. The 6h paper-signal-cycle is the backstop.
