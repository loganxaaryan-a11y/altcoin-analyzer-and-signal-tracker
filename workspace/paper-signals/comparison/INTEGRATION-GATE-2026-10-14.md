# Integration gate — deployed paper path (reusable)

Acceptance criterion for every deployment pass on `altcoin-analyzer-and-signal-tracker`.
All checks verify DEPLOYED actions / deployed evidence — never source hashes, never
sandbox-only claims. Run after each deployment before declaring it successful.

## Procedure

1. Invoke the deployed actions and save their raw JSON:
   - `getpaperpilotstatus` `{}` → save as `live-status-<date>.json`
   - `getsignaltracker` `{"limit": 200}` → save as `live-tracker-<date>.json`
2. Run: `python3 comparison/integration_gate.py --status live-status-<date>.json --tracker live-tracker-<date>.json`
3. For G3 (TEST transport), a fresh labeled probe is required per deployment:
   `cron.run paper-signal-alert-delivery` with reason `trigger:test/ENTRY_CONFIRMED ...`,
   then wait 15 min + grace and confirm the test ledger key reached `delivered`
   (real outbox ack) or `unknown` (standing rule). The gate reads
   `pilot/delivery/alert-delivery-ledger-test.json`.
4. Record results in `comparison/integration-gate-results-<date>.md`.

## The five checks

| # | Check | How | Pass |
|---|-------|-----|------|
| G1 | Export schema | `schema_version == "paper-status/1"`; `alerts/candidates/signals/comparisons/checkpoints/runs/handoffRuns` all present as lists. A missing or non-list required array is an explicit failure — never silent "no alerts". | version + all arrays |
| G2 | Producer–consumer | `regression_producer_consumer_2026_10_14.py` — the ACTUAL worker/collector parsers, 7/7: full response, missing candidates/alerts → SchemaError, quarantine refuses non-pilot row_origin, unversioned flagged, runs-as-int → SchemaError, malformed row isolated | 7/7 |
| G3 | TEST transport | Labeled TEST (`payloadJson.test === true`, `test/` dedup prefix) traverses endpoint → worker → runtime outbox → side chat. Terminal states: `delivered` (outbox `state='delivered'` + `delivered_at_utc`, the ONLY acceptable ack) or `unknown` (channel cannot confirm; surfaced once, never auto-retried) | terminal state recorded |
| G4 | Evaluator | `evaluator_gate_fixtures.py` — the ACTUAL frozen `operational_issuance_eval` on isolated fixtures: clean entry → `pass/issued`; post-decision stop touch → `fail/abstain:waiting-interval-invalidation`; non-observable evidence → `uncertain/abstain:issuance-validation-unavailable` (fail-closed) | 3/3 |
| G5 | Legacy untouched | `getsignaltracker`: 34 signal rows, `latestBrief.trackedCount == 34`, unique ids | 34/34 |

## On failure

Report the exact failure (check, expected, observed). Restore the last working
affected path where possible — the pre-change state is documented in the dated
results file. Do not loosen gates, change thresholds, or manufacture rows to
make the gate pass.

## Standing notes

- Exactly-once delivery is never claimed (Logan's correction): `unknown` is a
  legitimate terminal state, not a failure to hide.
- `controller_status` and `delivery_status` are separate fields; a controller
  timeout never changes a delivery status.
- The outcome leg of the paper evaluator (`paper-target-before-stop-v2.1.0` is a
  bare version string; `outcomeStatus` write-once `pending` with no updater) is
  SUSPENDED pending the expert freeze decision — G4 covers the issuance leg only.
  Prospective performance claims stay suspended until the outcome leg is wired.
- The live PAPER path stays UNPROVEN until a genuine opportunity traverses
  discovery → entry → alert → ack end-to-end.
