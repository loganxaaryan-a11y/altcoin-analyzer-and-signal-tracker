# Automatic chat delivery wiring — paper-signal alerts, 2026-10-14

PAPER ONLY. No brokerage, no orders, no prediction-weight changes, holdouts
locked. This document wires the research side chat through the SUPPORTED
automatic delivery path. It changes no executables and no freeze (config +
docs only).

## The supported path

Agent cron → runtime delivery subsystem → side chat. Concretely:

1. A scheduled agent worker (`paper-signal-alert-delivery`, interval 15 min,
   `delivery: - chat_id: a685c3e7-c8be-4137-8900-4e899008bca7`) runs the
   delivery sweep (spec: `~/workspace/goals/research-terminal/crons/hourly/paper-signal-alert-delivery__interval@15m.md`).
2. When an alert is due, the worker emits the rendered alert as its run
   output. The runtime posts that output to the research side chat
   automatically and records the send in `scheduler.delivery_outbox` with
   `delivery_key = cron-delivery:paper-signal-alert-delivery:<run_id>:side_chat:a685c3e7-c8be-4137-8900-4e899008bca7`.
3. This is the same mechanism already delivering `terminal-morning-brief`,
   `paste-trade-watch`, `signal-accuracy-test-week1`, and `x-smart-sweep`
   to the same side chat today (verified live in `scheduler.delivery_outbox`,
   2026-10-14).

No manual sends. No sandbox outbox. No webhook third party. No new
infrastructure beyond one cron.

## What each side owns

| Side | Owns | Truthful state |
|---|---|---|
| Deployed artifact (`altcoin-analyzer-and-signal-tracker`) | issuance, paper tables, `data.alerts` rows | in-artifact delivery `configured: false` — the artifact itself has no chat action and never claims otherwise |
| Workspace delivery layer (this wiring) | chat rendering, dedup, retry, ack bookkeeping | `pilot/delivery/alert-delivery-ledger.json` — the book of record for chat delivery |
| Terminal tracker/alert feed | second view of the same signal | automatic by construction: the signal row exists in the terminal's paper tables; the feed renders it |

## Ack handling — real channel ack only

- An alert is marked `delivered` in the ledger **only** when the worker
  observes, on a later run, the run's `delivery_key` in
  `scheduler.delivery_outbox` with `state = 'delivered'` AND
  `delivered_at_utc IS NOT NULL`. That row is the runtime's confirmed
  receipt of the message into the side chat — the "notification API's
  confirmed receipt" required by DELIVERY-SEMANTICS-2026-10-14.md.
- Verified 2026-10-14: this exact check passes against real outbox rows
  (e.g. `terminal-morning-brief` delivery
  `cron-delivery:terminal-morning-brief:52d12f9c-4975-4495-b824-e72d2ed79e55:side_chat:a685c3e7-…`,
  `state='delivered'`, `delivered_at_utc=1791897029`). The worker's ack
  query is demonstrated in `pilot/delivery/demo/ack-path-demo-2026-10-14.md`.
- The worker's own emission is NEVER an ack. Simulated acks stay labeled
  `delivered-simulated` and are never written to this ledger.
- Optional corroboration (not required): Logan's 👍 reaction on the alert
  message, as happened on the manual routing test
  (`runtime.message_reactions`, 18.8 s after send, independently re-verified
  2026-10-14 from live records).

## Retry with dedup — no duplicates, ever

- Dedup key: `(signal_id, alert_type)`. Ledger key format
  `<signal_id>/<alert_type>`, e.g. `sig_53bb…/ENTRY_CONFIRMED`.
- Exactly one emission per dedup key while undelivered. Before emitting, the
  worker checks the ledger: a `delivered` entry → skip, forever.
- After emitting, the entry becomes `awaiting-ack` with the run's sent_at.
  The next run links the outbox row (latest row for this job_id created
  after sent_at; one message per run max, so the link is unambiguous) and
  records its `delivery_key`.
- Re-emission happens ONLY when the linked outbox row is observed
  `failed`/errored, or is still missing after a full extra run of grace —
  and only when `next_attempt_at` (backoff: 60 s → 5 min → 15 min → 1 h →
  1 h → 1 h) has passed. Attempts increment on the same ledger entry.
- After 6 attempts: `failed`. The failure is surfaced in the worker's output
  (one line, with signal id) so it is visible in chat, and carried into the
  next compact daily summary. A failed alert is never silently dropped and
  never re-sent as a duplicate.

## What gets sent — and what never does

- Sent: `SETUP_PENDING` and `ENTRY_CONFIRMED` alerts from
  `getpaperpilotstatus` → `data.alerts`, validated against
  `pilot/delivery/alert-schema.json`, rendered per ALERT-SCHEMA-2026-10-14.md
  (label PAPER opens the message; pending vs confirmed visually distinct).
  Every emitted message ends each alert block with a machine trailer:
  `dedup: <signal_id> / <alert_type>`.
- NEVER sent: routine abstentions (vetoed, expired, below-threshold,
  no-qualifier ticks) — terminal only, per Logan's spec. The compact daily
  summary stays as specified in DAILY-SUMMARY-JOB-SPEC-2026-10-14.md
  (spec only; creating that scheduled job still needs Logan's explicit
  authorization — it is NOT created by this wiring).
- NEVER fabricated: if a required schema field (entry_price, invalidation,
  targets, data_timestamp, …) is absent from the artifact row and cannot be
  resolved from the status's `signals`/`candidates` rows, the alert is marked
  `unrenderable` in the ledger and surfaced as a one-line blocker. A partial
  or invented payload is never emitted. `test: true` payloads are never
  emitted by the worker (the one routing test already ran).
- Quiet runs: if no alert is due and no ack/failure needs surfacing, the
  worker stays silent — no "nothing new" messages (same convention as
  `paste-trade-watch`).

## Demonstration status (honest)

- `test-proven`: the manual routing test reached the side chat and was
  channel-acked (independently re-verified 2026-10-14 from
  `runtime.messages` + `runtime.message_reactions`).
- `auto-unproven`: no automatic alert has flowed yet — the deployed paper
  tables hold 0 alerts (three completed `runpapersignalcycle` runs, zero
  opportunities; nothing manufactured). The worker logic is demonstrated
  end-to-end against real inputs in `pilot/delivery/demo/` (decision logic
  on the live 0-alert status → quiet; render + dedup + ledger transitions
  on real historical dry-run rows, stopping before emission; ack query
  against a real outbox row). Nothing in the demo was sent anywhere.
- The pipeline is ARMED: the moment a genuine paper signal issues and its
  alert row appears in `getpaperpilotstatus`, the next worker run picks it
  up automatically.

## Exact gap — what the parent must do

1. Register the cron: `cron.add` with the definition at
   `~/workspace/goals/research-terminal/crons/hourly/paper-signal-alert-delivery__interval@15m.md`
   (complete frontmatter + worker task spec; ready to register unchanged).
   Creating persistent scheduled state was deliberately left to the parent:
   per the standing 2026-10-14 rule, scheduled jobs need Logan's explicit
   authorization — his routing approval covered destination/format/dedup/
   retry/ack, and this registration is the remaining step to confirm.
2. No artifact changes needed: the worker only READS `getpaperpilotstatus`.
   The in-artifact `delivery.configured: false` stays as-is (truthful).
3. First live proof: after registration, the next genuine signal's alert
   will flow issuance → worker emission → outbox `delivered` → ledger
   `delivered` with the delivery_key as ack evidence. Until then the ledger
   stays empty and the worker stays silent, which is itself the proof the
   quiet path works.

## Files

- `pilot/delivery/delivery-config.json` — updated with the `auto_delivery` block
- `pilot/delivery/alert-delivery-ledger.json` — the ledger (empty, armed)
- `pilot/delivery/AUTO-DELIVERY-WIRING-2026-10-14.md` — this file
- `pilot/delivery/demo/worker-logic-demo.py` + `worker-logic-demo-2026-10-14.md` — logic demonstration (nothing sent)
- `pilot/delivery/demo/ack-path-demo-2026-10-14.md` — ack-query demonstration against real outbox rows
- `~/workspace/goals/research-terminal/crons/hourly/paper-signal-alert-delivery__interval@15m.md` — the worker cron definition, ready to register
