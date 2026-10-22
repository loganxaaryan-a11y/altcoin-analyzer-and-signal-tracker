# Alert-transport readiness — 2026-10-14T20:15Z (workstream 2, part 2)

**Scope:** paper-signal alert transport only. No brokerage, no execution.
**Seat limits:** no artifact-invoke — `getpaperpilotstatus` could not be called from this seat. Evidence below is from the worker-captured snapshots in `pilot/delivery/worker-runs/` and the deployed-verification record. Nothing is claimed beyond what those show.

## Verdict: NOT READY — deployed transport UNPROVEN

The row-exposure regression from the rebuild is **partially** reconciled (test-probe rows ARE exposed), but no genuine alert has ever traversed the deployed transport, and the worker's send sweep skips test rows by design. Do not claim working transport.

## Evidence

### 1. Status payload DOES expose an alert row — but only the TEST probe row

`pilot/delivery/worker-runs/status-2026-10-14T19-50-57Z.json` (`getpaperpilotstatus`, args `{"emitTestAlert": true}`):

- `data.alerts[0]` present, transcribed verbatim: `id: -1`, `eventKey: "test_26971b53-…"`, `paperSignalId: "sig_TEST_26971b53"`, `transport: "test-probe"`, `status: "enqueued"`, `attemptCount: 0`, `acknowledgedAt: null`, created `2026-10-14T19:49:51.472Z`.
- Payload flags: `payloadJson.test: true`, `alert_type: "ENTRY_CONFIRMED"`, `asset: "BTCUSD"`, `entry_price: 1` (probe values — not a real venue print), `setup_reason: "TEST ROUTING PROBE through the deployed transport — not a live signal, no real order"`.
- `delivery.configured: false` — "Artifact-owned chat delivery is not configured; the chosen research-side-chat destination is implemented by the workspace cron and runtime delivery subsystem."
- `schema_version: "paper-status/1"`, `handler_version: "2.1.9"`, freeze `paper-pilot-v2.1.0`.

Correction to the earlier §3d "counts-only" reading: with `emitTestAlert=true`, the rebuilt endpoint DOES expose `data.alerts[0]`. Row exposure for the test-probe path works.

### 2. The TEST row cannot traverse the deployed transport — by design

Per `DEPLOYED-REPAIR-VERIFICATION-2026-10-14.md` §4: the `paper-signal-alert-delivery` worker's send sweep **explicitly skips `test: true` payloads** and only emits genuine `SETUP_PENDING` / `ENTRY_CONFIRMED` rows. The exposed TEST row is therefore undeliverable through the deployed route by construction — it proves row *exposure*, not *delivery*.

The TEST row itself shows no delivery: `status: "enqueued"`, `attemptCount: 0`, `acknowledgedAt: null` ~66s after creation. The earlier labeled routing test (2026-10-14T05:12:07Z) went out as a **manual parent send**, not through the deployed transport; its channel ack was assistant self-report, no independent deployed evidence.

### 3. Genuine rows have never existed — transport unproven end to end

- Deployed paper runs 1–6: all `issuedCount: 0`. Prospective cohort is header-only (0 rows); `prospectiveVerifiedEntries: 0`.
- No genuine `SETUP_PENDING` or `ENTRY_CONFIRMED` alert row has ever appeared in any captured status payload. Genuine-row exposure is therefore **unproven** — there has been nothing genuine to expose.
- `data.candidates` / `data.signals` arrays: **not observed** in any captured extract available to this seat. Schema v1 (`comparison/STATUS-RESPONSE-SCHEMA-v1-2026-10-14.md`) requires them always present as arrays; compliance is `PARENT-VERIFY` via a raw-payload read.

### 4. Blockers (explicit)

1. **No genuine signal has ever issued** → no genuine alert row has ever existed → the full path (alert row → worker render → runtime delivery → outbox `delivered` → ledger `delivered`) is UNPROVEN. This is identical to the live path's proof requirement.
2. **Worker skips test rows by design** → the only row type ever exposed cannot traverse the route.
3. **Artifact-owned chat delivery not configured** (`delivery.configured: false`) → delivery depends on the workspace cron sweep + runtime delivery subsystem reading genuine rows from the status payload. Binding precondition: genuine rows present in `data.alerts`.
4. **Candidate/signal row exposure unverified** from this seat (no raw-payload read capability).

## What would prove it

A genuine paper signal issuing → `SETUP_PENDING`/`ENTRY_CONFIRMED` row in `data.alerts` → worker render → runtime delivery → outbox `delivered` → ledger `delivered`, each step with IDs. Until then: **transport NOT READY**.
