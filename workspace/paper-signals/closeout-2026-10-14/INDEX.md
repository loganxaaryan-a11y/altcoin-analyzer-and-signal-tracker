# Closeout staging index — 2026-10-14

Executable evidence package for the paper-signal collection pipeline under
freeze v2.1.5. Paper only; no trading, no model changes. Directory:
`paper-signals/closeout-2026-10-14/`.

| # | Contents | What it is | Claim it supports |
|---|----------|------------|-------------------|
| 01-adapter | `live_paper_stream.py`, `live-paper-export-2026-10-14T2340Z.json` | Deployed→collector adapter (action payload → export); the run-5 export artifact | The adapter consumed the real `getpaperpilotstatus` schema; after the timestamp fix it exported 8 candidates, 0 excluded pre-freeze |
| 02-collector-harness | `collect_pilot_rows.py`, `harness.py` | The prospective collection runner and the frozen v2.1.5 harness it invokes (scoring, cutoff gate, quarantine rules) | Rows were scored and stamped under the frozen rules, not live edits: all 8 rows carry `freeze_version=2.1.5` |
| 03-graders | `metrics.py`, `check_reconciliation_v2_1_5.py` | Comparison grader (wilson, rates, primary accounting, arm comparison) and the active-freeze reconciliation checker | Measurement plumbing is the frozen version's; the "0/0, audit trigger not fired" reading comes from this code |
| 04-tests | 8 test files + `run_tests.py` | Full test suite, incl. the timestamp-adapter regression tests and the vessel schema tests | 156 tests all pass; the fix extracts `decisionAt` on both paths; absent stays None (never fabricated). `test_collector.py` is the updated isolated-fixture version |
| 05-freeze-manifests | v1.0.0, v2.0.0, v2.1.0–v2.1.5 + `ACTIVE_MANIFEST` | The full manifest chain; v2.1.5 is active (cutoff 2026-10-14T04:57:00Z) | Run 5's rows fall after the freeze cutoff under recorded `executable_hashes`; v2.0.0 is superseded/preserved |
| 06-raw-action-responses | `live-paper-status-2026-10-14T2340Z.json` | The full saved `getpaperpilotstatus` response that collection run 5 consumed | 8 deployed candidates, all `decisionAt` 2026-10-14T20:26:29.411Z (post-freeze); deployed freeze `paper-pilot-v2.1.0` with production/challenger hashes matching the comparison freeze |
| 07-delivery | `alert-delivery-ledger-test.json`, `entry-to-delivery-log-test.jsonl` | TEST-branch alert delivery ledger and entry-to-delivery timeliness log (TEST probe chain only; test keys can never collide with production keys) | Routing probe chain: sig_TEST_26971b53 (event→ack 1114s, enqueue→ack 1048s) and sig_TEST_0c8ffb7f (event→ack 241s, enqueue→ack 130s), both acked from `scheduler.delivery_outbox`, never simulated |
| 08-hash-drift-amendment | `HASH-DRIFT-AMENDMENT-2026-10-14.md`, `live-paper-stream-decisionAt-fix.diff` | Amendment to `freeze-manifest-v2.1.5.json` `executable_hashes` (manifest left byte-identical) + the actual before/after unified diff (5 hunks) | The adapter's sha256 moved `0f639300…` → `f421b728…` because of the run-5 `decisionAt` fix — operational plumbing, no model change; drift is flagged, not hidden |
| 09-supporting-docs | collection run log, replay mapping, adapter field coverage, stream wiring, entry-to-delivery metric spec | Narrative records of run 5, the factor-ledger replay, the adapter's documented camelCase+snake_case convention, and the timeliness interval definitions | The false-healthy-0-row failure mode, the repair decision, the remaining known gap (factorLedgerJson mapping), and the interval discipline (event→ack vs enqueue→ack, never blended) |

`MANIFEST.json` (next to this index) carries sha256 for every staged file.

Changes made inside this task (per authorization): (a) `tests/test_collector.py` —
replaced the production-read empty-vessel assertion with an isolated fixture
test (staged copy is the updated file); (b) this staging directory and its two
new files (amendment + diff). Everything else is a byte copy of the source
files.
