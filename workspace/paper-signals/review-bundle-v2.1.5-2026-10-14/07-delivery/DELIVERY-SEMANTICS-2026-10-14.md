# Delivery semantics — paper-signal alerts, 2026-10-14

Logan's refined spec. PAPER ONLY. Collection continues under the frozen v2.1.0
rules; this file governs alert delivery, not issuance.

## Destinations (two views, one signal)

Every qualifying alert is delivered to BOTH:

1. **Research side chat** — chat_id `a685c3e7-c8be-4137-8900-4e899008bca7`,
   via the chat notification path. Decision recorded 2026-10-14 (Logan's choice;
   supersedes the earlier `awaiting-user-choice` placeholder — that string must
   not be written again for live routing).
2. **Terminal tracker/alert feed** — the same signal rendered in the terminal.
   Chat delivery and terminal display are two views of the SAME signal
   (same payload, same dedup key), not alternatives.

The historical `awaiting-user-choice` string survives ONLY inside the frozen
acceptance-run-v2.1.0 evidence (a truthful record of the state at that time);
it is superseded for all live routing by `pilot/delivery/delivery-config.json`.

## Send once per event

- Exactly one send per dedup key `(signal_id, alert_type)`.
- Before every send attempt, the sender checks the alert store for the dedup
  key. If a row exists with status `delivered` (channel-acked), the attempt is
  skipped — no second message, ever.
- A `SETUP_PENDING` and an `ENTRY_CONFIRMED` for the same signal are different
  events with different dedup keys; both may legitimately be sent (once each).

## Delivered ONLY on channel ack

- An alert is marked `delivered` **only after the chat channel acknowledges
  receipt** (a real acknowledgement from the channel — the notification API's
  confirmed receipt, not the sandbox outbox, not an HTTP 200 from a test
  endpoint, and never a simulated ack).
- Until the channel acks, the status stays `enqueued` (awaiting first attempt /
  awaiting ack) or `retrying` / `failed` after attempts.
- Sandbox simulated acks keep the label `delivered-simulated` and are NEVER
  presented as delivered. See DELIVERY-AUDIT-2026-10-14.md.

## Retry policy (idempotent)

- Retry a failed or unacked send on the same dedup key — never a new alert row,
  never a new chat message for an already-acked event.
- Backoff: 60 s → 5 min → 15 min, then 1 h; max 6 attempts.
- After the final attempt, status = `failed`; the failure is surfaced in the
  next daily summary (see DAILY-SUMMARY-JOB-SPEC-2026-10-14.md). A failed alert
  is never silently dropped and never re-sent as a duplicate.
- Retry attempts increment `delivery_attempts` on the same row.

## Status vocabulary

| Status | Meaning |
|---|---|
| `enqueued` | accepted for delivery, no successful channel ack yet |
| `retrying` | an attempt failed; more attempts scheduled |
| `delivered` | chat channel acknowledged receipt (real ack only) |
| `failed` | attempts exhausted; surfaced in daily summary |
| `delivered-simulated` | sandbox only; a simulated ack, NOT a real delivery |

## Abstentions

- Routine abstentions (vetoed, expired, below-threshold, no-qualifier ticks)
  stay in the terminal only. No chat noise.
- The chat receives a COMPACT daily summary instead
  (spec: DAILY-SUMMARY-JOB-SPEC-2026-10-14.md).

## Routing test (gate)

- Exactly ONE clearly labeled TEST notification is sent to the research side
  chat before live paper alerts flow. Payload:
  `pilot/delivery/routing-test-payload.json` (`"test": true`, labeled TEST + PAPER).
- Live paper alerts flow only after the test notification is channel-acked.
- **Routing test status: channel-acked (2026-10-14).** The ONE test notification
  was sent to the research side chat `a685c3e7-c8be-4137-8900-4e899008bca7`
  and Logan acked it with a 👍 reaction 18.8 s later. Evidence (exported from
  live conversation records via `muse.db`, not hand-written):
  - sent test message `assistant-msg-630a9f81-e589-1734-6ca4-040ba466fe2b`
    at 2026-10-14T05:12:07.261Z (01:12:07 EDT) —
    "TEST — PAPER — ENTRY CONFIRMED" for BTCUSD long · sig_53bb2a86d2e0fee1f3664812
  - 👍 reaction row in `runtime.message_reactions` for that message_id at
    2026-10-14T05:12:26.05952Z (01:12:26 EDT); corroborated by system carrier
    message `9d7a0ae5-669f-481a-bab8-fd5d02aa750b`
    ("[User reaction received to a previous message]").
  Gate passed: live paper alerts are ungated. Full record lives in
  `delivery-config.json` under `routing_test`.
- The test is a routing check, not a signal: its payload is a fixture built on
  a real dry-run signal and is marked as such.
