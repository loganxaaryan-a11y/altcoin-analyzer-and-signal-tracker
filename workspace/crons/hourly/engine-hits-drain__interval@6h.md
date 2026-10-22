---
id: engine-hits-drain
title: Engine Hits drain → research side chat
enabled: false
owner: goal:research-terminal
mode: task
schedule:
  kind: interval
  timezone: America/Toronto
  at: 2026-10-20T04:58:07
  every: 6h
timeout_secs: 600
delivery:
  - chat_id: 7b75e732-f527-4d53-b40d-4aa036201d9b
metadata:
  tags: [cron:automatic-interval-anchor]
  originating_chat_context_json: '{"chat_id":"a685c3e7-c8be-4137-8900-4e899008bca7","origin_provider":"main","chat_kind":"direct","event_kind":"message","require_mention":false,"device_id":"d8c63a1c-801b-497b-a9fe-cd2681d2185d"}'
  presentation_locale: en-US
---
## Engine Hits drain → research side chat (every 30 min)

Delivers engine-hit notifications enqueued by the crypto terminal's Engine Hits dashboard to the research side chat. These are thesis observations (a machine theory just got evidence-backed support), never trade instructions.

Receipt schema: ~/workspace/goals/research-terminal/hidden_files/receipt-provenance/RECEIPT-SCHEMA.md.

### Paths
- Run logs: ~/workspace/goals/research-terminal/hidden_files/engine-hits/drain-runs/ (write run-<UTC-ts>.json each run; keep last 20)

### 0. Dependency guard (CRYPTO-3)
- Invoke getPendingHitNotifications on the altcoin-analyzer-and-signal-tracker artifact (read-only).
- If the action does not exist or the call errors as unknown: CRYPTO-3 has not been applied yet. Write the run log with `dependency_missing: "CRYPTO-3 engine_hit_notifications actions not yet applied to the crypto artifact"` and end. Stay silent (no chat-facing output). This is the expected state until the parent's builder-seat edit lands, not an error.

### 1. Fetch pending
- Call getPendingHitNotifications. If no pending rows → stay silent, write the run log noting nothing pending, end.

### 2. Cross-check each pending hit (no phantoms)
- Invoke listEngineHits on the artifact (limit 100). Confirm a matching engine_hits row for each pending notification's engine_hit_id.
- A pending notification with NO matching engine_hits row is a PHANTOM: do NOT deliver it, do NOT ack it. Record it in the run log as `phantom` with the notification id. Phantoms are surfaced via run logs only — never in chat.

### 3. Compose delivery blocks
- For each confirmed pending hit, compose one block:
  **ENGINE HIT — <symbol / thesis short>** — <triggeringEvent>
  engine score <N>/100 · tape <state> · <n> evidence sources · ripple chain <n> hops (<n> verified) · event <eventAt>
  one interpreted line about what this supports or challenges for the linked theory
  trailer: `Read-only alert — not a trade signal. From the Engine Hits dashboard.`
- This rendered text IS the send: the runtime posts this run's output to the research side chat.

### 4. Ack after composing
- For each hit included in the output, invoke ackHitNotification with the notification id.
- Ordering per run: cross-check all → compose all blocks → write run log → ack each → emit the final output message. Write the run log BEFORE acking, listing the exact notification ids accepted for delivery, so a kill between ack and output is visible in the log.
- Honest semantics: ack marks the notification "handed to the runtime delivery subsystem." Channel-delivery ack evidence (like the paper worker's outbox reconciliation) is not available on this path, so exactly-once is not claimed — at-most-one acceptance per pending row, no silent drops, kills visible in run logs.
- Phantom rows are never acked and never delivered.

### 5. Quiet
- Nothing pending (or only phantoms): emit no chat-facing output. Phantoms are logged only, never delivered.

### 6. Run log
- Write the run log BEFORE the final output message as the two-field receipt envelope (RECEIPT-SCHEMA.md):
  - `invocation_completed`: run_utc, started_utc, finished_utc, status (succeeded | failed | incomplete), fetched count, confirmed ids, phantom ids, acked ids, any action errors.
  - `scheduler_provenance`: `origin_unverified` (DEFAULT — write this), `manual` (only when this run was started by an explicit manual invocation whose reason begins with `manual:` or is a documented repair/test run), NEVER `verified:<execution-id>` (reserved for the external reconciliation pass — `hidden_files/receipt-provenance/RECONCILIATION.md`). You cannot self-certify a scheduled origin from inside the run.
- Prune drain-runs/ to the last 20 files.

### Hard rules
- Never invent hit fields. All text comes from listEngineHits rows and the linked theory row.
- Never deliver the same pending row twice: ack its row in the same run that renders it.
- Never treat a phantom as deliverable. Never render a hit you could not cross-check.
