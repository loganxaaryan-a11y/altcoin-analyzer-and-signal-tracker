# Labeled TEST notification through the deployed transport — design + execution plan — 2026-10-14

Paper only. No brokerage. The live path stays UNPROVEN until a genuine
opportunity traverses it end-to-end; this document designs the TEST that
proves the transport without polluting measurement.

## A. Why a new test path is needed (not a repeat of the routing test)

1. The 2026-10-14 05:12 UTC routing test (delivery-config.json
   `routing_test`: channel-acked, 👍 18.8 s later) was a MANUAL send by the
   parent — it proved the side-chat channel, NOT the deployed transport.
   No alert of any kind has ever traversed endpoint → worker → outbox →
   chat. (DEPLOYED-REPAIR-VERIFICATION-2026-10-14.md §4: "Test notification
   — NOT SENT through the deployed transport (missing capability named)".)
2. The deployed bundle declares artifact-owned chat delivery NOT configured
   (`delivery.configured:false` — truthful; delivery lives in the workspace
   cron layer). The "deployed transport" for alerts is therefore:
   **deployed endpoint emits alert row → `paper-signal-alert-delivery`
   worker renders → runtime delivery subsystem → research side chat
   a685c3e7-c8be-4137-8900-4e899008bca7 → outbox ack reconciliation.**
3. Two missing capabilities block a supported test today:
   - Producer: the deployed `getPaperPilotStatus` has `request:
     z.object({})` — no affordance to emit a TEST alert row (by design).
   - Consumer: WORKER-SPEC-v2.2 §6 says "skip test payloads" — a test row
     in `data.alerts` would be silently skipped, not delivered.

## B. The supported test path (design)

**Producer affordance** — `getPaperPilotStatus` gains an optional request
arg `emitTestAlert` (default false). When true, the action appends EXACTLY
ONE synthetic TEST alert row to the returned `alerts` array. The row is
synthesized AT RESPONSE TIME and is NEVER persisted to `paper_alert_events`
(or any paper table) — the paper tables stay clean by construction.

The TEST row shape (full ALERT-SCHEMA-2026-10-14.md ENTRY_CONFIRMED +
deployed row columns):

```json
{
  "id": -1,
  "eventKey": "test_<uuid>",
  "paperSignalId": "sig_TEST_<uuid8>",
  "status": "enqueued",
  "transport": "test-probe",
  "destinationLabel": "research-side-chat",
  "payloadJson": {
    "schema_version": "2026-10-14", "paper": true, "label": "PAPER",
    "alert_type": "ENTRY_CONFIRMED", "signal_id": "sig_TEST_<uuid8>",
    "asset": "BTCUSD", "direction": "long",
    "setup_reason": "TEST ROUTING PROBE through the deployed transport — not a live signal, no real order",
    "entry_rule": "test probe: response-time synthesis, no venue print",
    "entry_price": 1.0,
    "invalidation": {"price": 0.9, "rule": "test probe"},
    "targets": {"t1": 1.1, "t2": 1.2},
    "horizon": "test probe",
    "data_timestamp": "<now-iso>", "issued_at": "<now-iso>",
    "destinations": ["research-side-chat", "terminal-tracker"],
    "test": true,
    "status": "confirmed",
    "entry_observed_at": "<now-iso>", "venue_print_ts": "<now-iso>",
    "waiting_interval_veto": "pass",
    "post_entry_check": "test probe"
  },
  "enqueuedAt": "<now-iso>", "acknowledgedAt": null,
  "attemptCount": 0, "lastError": null,
  "createdAt": "<now-iso>", "updatedAt": "<now-iso>"
}
```

Rules: `test:true` REQUIRED; `signal_id`/`eventKey` ALWAYS prefixed
`sig_TEST_` / `test_`; the payload is a probe (price 1.0, "test probe"
strings) so it can never be mistaken for a market event; `entry_observed_at`
is the probe instant, never a venue print.

**Consumer test branch** — worker spec amendment (v2.3 addendum, exact text
in §E2): §6's "skip test payloads" is REPLACED by "route `test:true` rows
to the TEST branch". The TEST branch:

- Validates against the REAL `alert-schema.json` (same as production;
  unrenderable → one-line blocker, never partial).
- Dedups on `test/<signal_id>/<alert_type>` — the `test/` prefix makes
  collision with a production key impossible.
- Books in a SEPARATE ledger, `pilot/delivery/alert-delivery-ledger-test.json`
  (never the production ledger). Ledger pre-commit ordering identical to §7.
- Renders with the TEST banner: opens `**TEST — PAPER — ENTRY CONFIRMED**
  (routing probe through the deployed transport — not a live signal, no
  real order)`, then the ALERT-SCHEMA fields, then the dedup trailer
  `dedup: test/<signal_id> / <alert_type>`.
- Reconciles via the SAME §5 outbox rule against the run's delivery_key.
- Logs timeliness to `pilot/delivery/entry-to-delivery-log-test.jsonl`
  (never the production log).
- Terminal states: `delivered` ONLY on real outbox ack
  (state='delivered' + delivered_at_utc); `unknown` where the channel can't
  confirm (surfaced once, never auto-retried — Logan's rule); `failed`
  after 6 attempts. Exactly-once is NEVER claimed.

## C. Quarantine design (test rows can never pollute measurement)

| Layer | Guard | Mechanism |
|---|---|---|
| Producer | never persisted | test row synthesized at response time only; zero writes to `paper_alert_events`, `paper_signals`, `paper_model_comparisons` (whose `plumbing_test` cohort exists but is never written by this path) |
| Producer | unmistakable identity | `sig_TEST_` / `test_` prefixes; probe price 1.0; "test probe" strings; `test:true` |
| Worker | separate books | `alert-delivery-ledger-test.json` + `entry-to-delivery-log-test.jsonl`; `test/`-prefixed dedup keys; TEST banner rendering |
| Collector | hard refusal | any candidate derived from a test row carries `row_origin="test"` → `collect_pilot_rows.validate_candidate` raises `QuarantineError`, NOTHING written (proven: regression case D). The adapter additionally skips rows whose alert payload has `test:true` before candidate mapping |
| Cohorts | no path in | test rows never reach `cohort-prospective-v2.csv`, `comparison-rows-pilot-2026-10-14.csv`, or any retrospective file; the post-freeze cutoff and quarantine guards both fire first |

## D. Terminal states for the live TEST

Per DELIVERY-SEMANTICS-2026-10-14.md, adapted for a probe:

- **acknowledged**: outbox row for the test run's delivery_key reaches
  `state='delivered'` with `delivered_at_utc` NOT NULL → ledger-test
  `delivered` with ack evidence. This proves the deployed transport
  end-to-end.
- **UNKNOWN**: outbox row exists but is neither delivered nor failed, or no
  outbox row past one interval → ledger-test `unknown`, exactly one
  surfacing line. Never auto-retried, never marked delivered without ack
  evidence. UNKNOWN is a truthful terminal state for the probe, not a
  failure to try.
- **failed**: 6 attempts exhausted → surfaced in chat + daily summary.
- Never claimed: exactly-once (the side chat does not dedupe on the key).

## E. EXACT execution plan for the coordinator

This seat cannot call artifact.* (depth 2/2). Execute in order; stop and
report at the first step that does not verify.

### E1. Producer edit — artifact builder session with deploy rights

File: `server/src/actions.ts`, action `getPaperPilotStatus` (~line 3106).

**Edit 1 — schema_version (STATUS-RESPONSE-SCHEMA-v1 §1):**
in the returned object literal, add as the first property:
```ts
schema_version: "paper-status/1",
```
(verbatim artifact.edit spec: `old_text`: `      return {\n        handler_version: ISSUANCE_HANDLER_VERSION,` →
`new_text`: `      return {\n        schema_version: "paper-status/1",\n        handler_version: ISSUANCE_HANDLER_VERSION,`)

**Edit 2 — test affordance:**
- `request: z.object({})` → `request: z.object({ emitTestAlert: z.boolean().default(false) }),`
- `async handler(ctx)` → `async handler(ctx, args)` and after the
  `Promise.all([...])` block, before `return {`, insert:
```ts
const testAlertRow = args.emitTestAlert ? [{
  id: -1,
  eventKey: `test_${randomUUID()}`,
  paperSignalId: `sig_TEST_${randomUUID().slice(0, 8)}`,
  status: "enqueued",
  transport: "test-probe",
  destinationLabel: "research-side-chat",
  payloadJson: {
    schema_version: "2026-10-14", paper: true, label: "PAPER",
    alert_type: "ENTRY_CONFIRMED",
    signal_id: `sig_TEST_${randomUUID().slice(0, 8)}`,
    asset: "BTCUSD", direction: "long",
    setup_reason: "TEST ROUTING PROBE through the deployed transport — not a live signal, no real order",
    entry_rule: "test probe: response-time synthesis, no venue print",
    entry_price: 1.0,
    invalidation: { price: 0.9, rule: "test probe" },
    targets: { t1: 1.1, t2: 1.2 },
    horizon: "test probe",
    data_timestamp: new Date().toISOString(),
    issued_at: new Date().toISOString(),
    destinations: ["research-side-chat", "terminal-tracker"],
    test: true, status: "confirmed",
    entry_observed_at: new Date().toISOString(),
    venue_print_ts: new Date().toISOString(),
    waiting_interval_veto: "pass",
    post_entry_check: "test probe",
  },
  enqueuedAt: new Date().toISOString(), acknowledgedAt: null,
  attemptCount: 0, lastError: null,
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
}] : [];
```
(`randomUUID` is already imported in actions.ts — verify at edit time; the
two `randomUUID()` calls for eventKey/paperSignalId/signal_id MUST resolve
to the same uuid per row: hoist `const probeId = randomUUID()` first and
reuse it.)
- In the return object: `alerts: alerts.map(...),` →
  `alerts: [...testAlertRow, ...alerts.map(...)],`
- Redeploy the artifact. Verify: new `current_build_id`/`updated_at` on
  `spaces.spaces`; post-deploy inspection shows the edit; then invoke:

```
invoke_action getPaperPilotStatus on altcoin-analyzer-and-signal-tracker
args: {"emitTestAlert": true}
```

VERIFY (all must hold, else stop):
  (a) `data.alerts[0].payloadJson.test === true`,
  (b) `data.alerts[0].eventKey` starts with `test_`,
  (c) `data.schema_version === "paper-status/1"`,
  (d) all of alerts/candidates/checkpoints/signals/comparisons/handoffRuns/runs
      present as arrays, handoff present (null|object),
  (e) `paper_alert_events` row count UNCHANGED (probe not persisted —
      re-invoke with `emitTestAlert:false` and diff the alerts array length).

### E2. Worker spec amendment — install via cron.update on paper-signal-alert-delivery

Append to the worker body (v2.3 addendum, exact text):

> ### 6b. TEST branch (labeled routing probes — added 2026-10-14)
> Rows with `payloadJson.test === true` (or top-level `test === true`) are
> TEST rows. They are NEVER handled by §6's normal path; they route here:
> - Validate against `pilot/delivery/alert-schema.json` (unrenderable →
>   one-line blocker naming the signal and field, never partial).
> - Dedup key `test/<signal_id>/<alert_type>`; book of record
>   `pilot/delivery/alert-delivery-ledger-test.json` (never the production
>   ledger). Ledger pre-commit ordering per §7.
> - Render opening `**TEST — PAPER — ENTRY CONFIRMED** (routing probe
>   through the deployed transport — not a live signal, no real order)`,
>   then the ALERT-SCHEMA fields, then dedup trailer
>   `dedup: test/<signal_id> / <alert_type>`.
> - Reconcile per §5 against this run's outbox delivery_key; terminal
>   states `delivered` (real ack only) / `unknown` (surfaced once, never
>   auto-retried) / `failed` (6 attempts). Timeliness →
>   `pilot/delivery/entry-to-delivery-log-test.jsonl`.
> - A test key can never collide with a production key (the `test/`
>   prefix). Exactly-once is never claimed.

### E3. Run the live TEST (coordinator executes)

1. `cron.run` on `paper-signal-alert-delivery` with reason
   `trigger:test/<probe-signal-id>/ENTRY_CONFIRMED issued_at=<ISO-8601-UTC>`
   (use the signal_id from E1's verify call).
2. Wait one interval (15 min) + grace; then read the run's outbox row:
   `scheduler.delivery_outbox` for delivery_key
   `cron-delivery:paper-signal-alert-delivery:<run_id>:side_chat:a685c3e7-c8be-4137-8900-4e899008bca7`.
3. Record the terminal state in `alert-delivery-ledger-test.json`:
   `delivered` (outbox state='delivered' + delivered_at_utc NOT NULL) or
   `unknown` (anything else — surfaced once, operator review).
4. **Quarantine verification** (same session, before reporting success):
   - Run the collector adapter against a fresh `getpaperpilotstatus`
     (emitTestAlert:false): `live_paper_stream.export_live_stream` →
     assert 0 candidates carry `row_origin="test"` and the prospective
     vessel is byte-identical before/after.
   - Assert `paper_alert_events` count unchanged vs pre-test.
   - Assert the production ledger `alert-delivery-ledger.json` has no
     `test/` keys.
5. Report to Logan: one line — TEST probe `delivered` (with delay seconds)
   or `UNKNOWN` — plus the quarantine verification results. Never claim
   exactly-once; never present the probe as a signal.

### E4. If the probe ends UNKNOWN

UNKNOWN is truthful, not a failure to attempt. Do NOT re-send the same probe
automatically (Logan's rule). Operator options: (a) accept UNKNOWN and keep
the sweep path (alerts still flow on genuine opportunities, reconciled the
same way); (b) one manual re-probe with a FRESH probe id (new uuid — never
reuse a key); (c) escalate to the runtime delivery subsystem. Record the
decision; do not loop probes.

## F. What this does NOT change

- No freeze change, no strategy change, no prediction-weight change.
- No production alert behavior change (the normal §6 path is untouched
  except that "skip test payloads" becomes "route to the TEST branch").
- `delivery.configured:false` stays as-is (truthful artifact-owned scope).
- The routing-test gate in delivery-config.json stays historical record;
  this probe is a NEW, separate verification of the automatic path.
