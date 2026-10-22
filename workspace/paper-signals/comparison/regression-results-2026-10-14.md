# Producer–consumer regression — results — 2026-10-14

Regression code:
`comparison/regression_producer_consumer_2026_10_14.py` (7/7 cases PASS,
2026-10-14 ~19:50 UTC).

Paper only. No brokerage. No deployed calls. Everything ran locally in
/tmp; the real prospective vessel was never touched (dry-run + temp vessel).

## What was exercised (no mocks of either side)

**Producer (synthetic, schema-faithful):** `build_realistic_response()`
builds a full `getpaperpilotstatus` response per
`comparison/STATUS-RESPONSE-SCHEMA-v1-2026-10-14.md` §4: 3 alert rows in the
DEPLOYED `paper_alert_events` shape (eventKey, paperSignalId, status,
transport, payloadJson as a JSON string — exactly as `actions.ts`
serializes it; payloads carry the full ALERT-SCHEMA fields):
SETUP_PENDING + ENTRY_CONFIRMED genuine, 1 clearly labeled TEST with
`test:true`. Plus 2 candidate rows (1 qualified/awaiting-entry with complete
factor ledger + discovery-run linkage + reason codes, 1 suppressed with
verbatim suppression reason), 1 signal row (frozen contract, venue trade id
`884210977`, venue seq, observation/receipt times, recovery checkpoint,
response-bound coverage evidence), 1 checkpoint row, empty comparisons,
handoff report + handoffRuns, 1 run record.

**Consumer 1 — worker parser (the actual rules):** the worker's parser IS
its spec prose. `worker_strict_parse()` implements schema §5 (the new
binding rule); `worker_send_sweep()` implements WORKER-SPEC-v2.2 §6
VERBATIM — extract the render payload from `payloadJson`, alert_type
filter, test-payload skip, validation against the REAL
`pilot/delivery/alert-schema.json` via jsonschema (the same file the worker
references), dedup on `<signal_id>/<alert_type>` against a ledger dict with
in-memory pre-commit mirroring the spec's ordering. A row whose payloadJson
is unparseable is unrenderable (named), never partially rendered.

**Consumer 2 — collector parser (the actual code):** imported unmodified —
`live_paper_stream.export_live_stream` → `ingest_live_paper_stream` →
`collect_pilot_rows.validate_candidate` → `check_post_freeze_cutoff` →
`score_candidates` (real frozen harness, active freeze 2.1.5) →
`stamp_trace`, dry-run against a temp vessel.

## Results

| Case | Result | What it proves |
|---|---|---|
| A: full response → worker + collector | PASS | Worker: 2 due (`sig_…/SETUP_PENDING`, `sig_…/ENTRY_CONFIRMED`), both schema-valid against the real alert-schema.json, pre-committed `awaiting-ack`; TEST alert skipped by the normal path with reason recorded; 0 blockers. Collector: adapter exported 3 candidates (1 signal + 2 candidates), all passed post-freeze cutoff, all scored by the real harness (dry-run, 0 written to the real vessel). TEST alert never became a candidate. |
| B: `candidates` key deleted | PASS | Strict parser raises explicit `SchemaError` naming the key. The pre-fix lenient pattern (`data.get("candidates") or []`) demonstrated on the same input: silently reads 0 candidates — the defect being fixed. |
| C: `alerts` key deleted | PASS | Worker raises `SchemaError` before any send logic — never "nothing due". |
| D: quarantine (`row_origin="test"`) | PASS | `validate_candidate` raises `QuarantineError`; `collect()` refuses before scoring; no vessel file created. |
| E: unversioned (no `schema_version`) | PASS | Parses under the v1 field set with explicit `unversioned-response` flag — strictness does not wait for the producer to add the version field. |
| F: `runs` as bare int (17:03 UTC anomaly) | PASS | Explicit `SchemaError`; a count is never coerced to a run list. |
| G: alert row with unparseable payloadJson | PASS | The ROW is rejected with its eventKey named; the response still parses and the other alert still delivers — row errors never sink the response. |

## Honest notes

- The harness labeled all 3 synthetic rows `decision_time_verified=False`
  with note "asOf not recorded on 11 factor input(s); decision-time status
  labeled, not assumed" — the synthetic factor rows carry no per-factor
  asOf, and the harness's strict=False labeling (not fabrication) behaved
  exactly as documented. A production-shaped row would carry per-factor
  asOf from the deployed serializer.
- The worker side of this regression is rule-faithful prose execution, not
  the cron agent itself: the worker body is a job prompt, so "the actual
  worker parser" is its §6 text + the real alert-schema.json, both used
  verbatim. The one behavioral delta the regression does NOT cover is the
  worker's outbox-ack reconciliation (§5) — that needs the live scheduler,
  which is the subject of the TEST-path design.
- Empty `comparisons:[]` parsed as a legitimate quiet value (not an error)
  — the distinction §5 draws between absent (error) and empty (quiet).
