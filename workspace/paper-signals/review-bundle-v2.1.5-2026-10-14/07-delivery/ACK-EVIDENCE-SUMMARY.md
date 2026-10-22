# Ack Evidence Summary (builder-reported)

Source of truth: `delivery-config.json` (`routing_test` block), plus
`DELIVERY-AUDIT-2026-10-14.md` and `DELIVERY-SEMANTICS-2026-10-14.md` in this folder.

## Routing test — claimed `channel-acked`

- Test message id: `assistant-msg-630a9f81-e589-1734-6ca4-040ba466fe2b`
- Sent (UTC): 2026-10-14T05:12:07.261Z → research side chat
  (`a685c3e7-c8be-4137-8900-4e899008bca7`)
- Ack (UTC): 2026-10-14T05:12:26.05952Z — 👍 emoji reaction, 18.8s after send
- Carrier: system event "[User reaction received to a previous message]" quoting the
  test message (carrier message id `9d7a0ae5-669f-481a-bab8-fd5d02aa750b`)
- Record locator: `runtime.message_reactions` row for the test message id (PK is
  `message_id`; reaction row carries emoji + `updated_at`)
- Config says the status was derived from live conversation records
  (`muse.db`: `runtime.messages`, `runtime.events`, `runtime.message_reactions`),
  **not** hand-set.
- Gate effect: `live_paper_alerts_gated: false` — live paper alerts are ungated on
  this routing test. Paper-only, PAPER-labeled; pending-setup vs confirmed-entry
  distinct; deduped `(signal_id, alert_type)` retries; delivery rule: mark
  `delivered` ONLY after the chat channel acknowledges — sandbox sim-acks stay
  labeled `delivered-simulated` (96 historical rows relabeled per the delivery audit).

## Limits (read before trusting)

- The ack claim is **builder-reported**: derived by the assistant from runtime
  conversation records on 2026-10-14. It is independently checkable (the record
  locator is above; rerun via `muse.db` against `runtime.message_reactions`),
  but has not been independently rerun by the expert.
- The test was a fixture replay of dry-run signal `sig_53bb2a86d2e0fee1f3664812`
  (2026-10-14T02:48Z, entry observed on a real Binance.US print) — **not a live
  signal**, and must never be counted in measurement.
- Sandbox simulated acks are explicitly NOT delivery; only a real chat-channel
  ack earns `delivered`.
