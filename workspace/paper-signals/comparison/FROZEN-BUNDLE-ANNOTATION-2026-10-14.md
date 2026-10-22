# Frozen bundle annotation — delivery-status note (2026-10-14)

**Bundle is NOT edited.** This file is the correction/annotation record for
`review-bundle-v2.1.1-2026-10-14/` (directory + `review-bundle-v2.1.1-2026-10-14.zip`),
frozen 2026-10-14 ~05:11 UTC under comparison freeze **v2.1.1**.

## What the bundle's delivery-config copy says
`review-bundle-v2.1.1-2026-10-14/delivery/delivery-config.json`, `routing_test`:
```json
"status": "pending — parent must send (subagent cannot post to chat); live paper alerts gated on the test's channel ack"
```

## Why that status is in the bundle
The status was **truthful at freeze time**. Bundle mtimes are 2026-10-14
~05:11 UTC; the routing test was sent at 05:12:07Z and acked at 05:12:26Z.
At the frozen instant the test had not yet been sent, so `pending` was the
accurate record of the bundle's captured state. This is a frozen historical
record, not a live config, and must not be rewritten (frozen bytes are
evidence).

## What superseded it (live record, after the freeze)
The live config `pilot/delivery/delivery-config.json` now records:
- `routing_test.status`: **`channel-acked`**
- channel: Muse research side chat `a685c3e7-c8be-4137-8900-4e899008bca7`
- `test_message_id`: `assistant-msg-630a9f81-e589-1734-6ca4-040ba466fe2b`
- `sent_at_utc`: `2026-10-14T05:12:07.261Z`
- `ack.emoji`: 👍, `ack_at_utc`: `2026-10-14T05:12:26.05952Z` (18.8 s after send)
- `carrier_message_id`: `9d7a0ae5-669f-481a-bab8-fd5d02aa750b`, `carrier_message_at_utc`: `2026-10-14T05:12:26.142Z`
- `live_paper_alerts_gated`: `false` — gate passed, live paper alerts ungated on the routing test.
- Corroborated in `pilot/delivery/DELIVERY-SEMANTICS-2026-10-14.md` ("Routing test status: channel-acked (2026-10-14)… sent … and Logan acked it with a 👍 reaction 18.8 s later") and `pilot/delivery/routing-test-payload.json` (the exact sent payload: TEST + PAPER, ENTRY_CONFIRMED, BTCUSD long, sig_53bb2a86d2e0fee1f3664812, `"test": true`).

## Operational meaning
- **Live routing reads `pilot/delivery/delivery-config.json`**, not the bundle copy. The bundle's `pending` status applies only to the bundle's frozen instant and must not be used as a routing state.
- Anyone citing the bundle for delivery status must cite this annotation alongside it.
- The bundle's frozen manifest copy (`review-bundle-v2.1.1-2026-10-14/manifest/`) is freeze-manifest-v2.1.1.json (sha256 `96aa584b3bda36aec4cadf78ce9ed527ebddff55821838918281421254c37f52`) — superseded by v2.1.4 as the active comparison freeze; likewise historical, not to be edited.
- The bundle's frozen `plan/COLLECTION-JOB-SPEC-2026-10-14.md` copy is the same "SPEC ONLY — NOT INSTALLED" spec (v2.1.0-titled) — unchanged by this annotation; see `comparison/scheduler-executions-2026-10-14.json` for current execution records.
