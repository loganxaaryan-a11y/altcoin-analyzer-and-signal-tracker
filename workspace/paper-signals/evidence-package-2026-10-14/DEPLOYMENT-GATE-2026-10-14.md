# Deployment integration gate — 2026-10-14 (~23:55 UTC / 19:55 EDT)

**Deployment under test:** `altcoin-analyzer-and-signal-tracker`,
build `d5a99259-1da4-4ce9-9180-aa78bcb4d255`
(`construction_status=succeeded`, `updated_at` 2026-10-14T20:18:45Z —
verified live via read-only `muse.db` SELECT on `spaces.spaces` at
~23:52 UTC). Deployed handler 2.1.9, freeze `paper-pilot-v2.1.0`.

**Gate spec:** `comparison/INTEGRATION-GATE-2026-10-14.md`;
reusable runner `comparison/integration_gate.py`.

**Build lineage today:** `c9bb1cad-…` (v2.1.0-era, pre-deploy) →
`c698a58b-…` (succeeded 18:44:32Z, served the counts-only status payload)
→ **`d5a99259-…` (succeeded 20:18:45Z, CURRENT — restored row exposure)**.
No workspace build notes exist for `d5a99259`; what it changed is inferred
from deployed evidence (row arrays restored, same handler/freeze versions).

**Seat limits (stated plainly):** this seat has no `artifact.invoke_action`
tool and no side-chat send. Deployed actions are verified via the raw
payloads persisted by the `paper-signal-alert-delivery` worker
(`pilot/delivery/worker-runs/status-*.json`), `spaces.spaces` (read-only),
and `scheduler.delivery_outbox` (read-only) — all genuine deployed/runtime
records, never sandbox executions.

## Verdict: GATE PASS (5/5), with two stated caveats

| Check | Result | Evidence |
|-------|--------|----------|
| G1 versioned row exposure | **PASS** | Deployed `getpaperpilotstatus` payload `pilot/delivery/worker-runs/status-2026-10-14T23-15-31Z.json` (fetched 23:15:31Z, current build): `schema_version="paper-status/1"`; required arrays all present as lists — `alerts` 0, `candidates` 8, `signals` 0, `comparisons` 8, `checkpoints` 0, `runs` 7, `handoffRuns` 2. Missing/non-list array → explicit `SchemaError` (verified behavior, G2 cases B/C/F) — never silent "no alerts". `handler_version="2.1.9"`; freeze `paper-pilot-v2.1.0` hash `a7d354a4…`; `handler.sourceHashes` match workspace (`handler.ts` `6a9aaf62…`, `qualify.ts` `25fb6ab2…`). |
| G2 worker consumption (actual parsers, actual deployed bytes) | **PASS 7/7** | `regression_producer_consumer_2026_10_14.py` re-run ~23:55 UTC: 7/7 passed (A full response, B missing candidates→SchemaError, C missing alerts→SchemaError, D quarantine refuses non-pilot origin, E unversioned flagged, F runs-as-int→SchemaError, G malformed row isolated). ADDITIONAL live demonstration: the **actual deployed bytes** (`status-2026-10-14T23-15-31Z.json`) run through the **actual code** — worker `worker_strict_parse` OK (flags: []), send sweep → nothing due / no blockers (genuine empty, not a schema failure); collector `live_paper_stream.export_live_stream` (unmodified) → 8 candidates exported, 7 deployed runs, legacy count 34. No mocks of either side in the live run. |
| G3 TEST through the real transport | **PASS — delivered (real outbox ack), record-verified, no re-send** | Labeled TEST `sig_TEST_26971b53` (BTCUSD long, `payloadJson.test===true`, `test/` dedup prefix; worker run `a1be8a82`, trigger `test/ENTRY_CONFIRMED` 19:49:35Z). Chain confirmed from the records: **enqueue 2026-10-14T19:50:57Z → runtime outbox `state='delivered'`, `delivered_at_utc=1792008505` (2026-10-14T20:08:25Z), `attempt_count=1`** — the outbox row independently re-verified via `muse.db` SELECT on `scheduler.delivery_outbox` this run. Test ledger key `test/sig_TEST_26971b53/ENTRY_CONFIRMED` → `delivery_status='delivered'` with the ack evidence; production ledger untouched (`entries: {}`). CAVEAT: the probe ran against build `c698a58b` (18:44Z), not the current `d5a99259` (20:18:45Z). The proven segment (worker → runtime outbox → side chat) is runtime-side and artifact-build-independent; no duplicate probe was sent per the parent's explicit instruction. If per-build freshness is required, a fresh `trigger:test/` probe must be dispatched from an eligible seat. |
| G4 callable evaluator | **PASS 3/3** | `evaluator_gate_fixtures.py` on the ACTUAL frozen `operational_issuance_eval` (imported unmodified from `comparison/harness.py`) with isolated fixtures: F1 clean entry → `pass/issued`; F2 post-decision stop touch → `fail/abstain:waiting-interval-invalidation`; F3 non-observable evidence → `uncertain/abstain:issuance-validation-unavailable` (fail-closed). Issuance leg only. The outcome leg (`paper-target-before-stop-v2.1.0` is a bare version string with no updater) remains SUSPENDED per the gate spec's standing notes — it is documented as suspended, not passed. |
| G5 legacy unchanged | **PASS 34/34 (seat-limited live invocation)** | Deployed `getpaperpilotstatus` on the CURRENT build (23:15:31Z): `segregation.legacyTrackedCount=34`, `legacyTable="generated_signals"`, note "The repaired paper action never writes generated_signals or signal_contracts." Last live `getsignaltracker` pull (`comparison/live-tracker-2026-10-14.json`, 20:04Z): 34 signal rows, ids **10–43 contiguous and unique**, `latestBrief.trackedCount==34`, latest row write `2026-10-14T13:00:21Z` (before BOTH rebuilds — no legacy writes during/after the deploys). Legacy fingerprint (id, coinId, createdAt, direction, confidence): `8583b2689585768c`. LIMIT: no live `getsignaltracker` invocation was possible against the current build from this seat (no `artifact.invoke_action`); the `--tracker` leg of the gate script was therefore verified from the last live pull + the current-build deployed segregation block. |

## Deployed runtime state at gate time

- 7 paper runs: ids 1–6 `complete` (all 0 candidates / 0 issued), run 7
  `partial` (discovery run 60 → 8 candidates, 0 issued, completed
  21:09:24Z). Handoff run 60 `complete` (directional 8, eligible 8).
- `signals: 0`, `alerts: 0` — no genuine signal has issued; nothing was
  manufactured. The 8 candidates' entry windows expired without observation
  (no first print), so nothing issued and nothing delivered.
- **The live PAPER path stays UNPROVEN** until a genuine opportunity
  traverses discovery → entry → alert → ack end-to-end.

## On failure — restoration paths (per gate spec)

- **G1 fail** (schema unversioned / missing arrays): the explicit-schema-error
  behavior is enforced consumer-side (in
  `regression_producer_consumer_2026_10_14.py` §5 rules), independent of the
  build — restore by reverting to the last known-good status shape or
  redeploying the build that passed this gate. Do not loosen the strict
  parser to make it pass.
- **G2 fail**: the regression runs in `/tmp`, never touches the real vessel;
  nothing to restore. Failure means producer or consumer code changed —
  bisect the change, do not skip cases.
- **G3 fail**: send a fresh `trigger:test/` probe via the worker cron and
  await the outbox ack (requires side-chat send + cron trigger capability —
  not this seat). `unknown` is a legitimate terminal state (never
  auto-retried), not a failure to hide.
- **G4 fail**: the frozen evaluator is pinned — do not change thresholds.
  Restore `comparison/harness.py` from the active freeze manifest and
  re-run the fixtures.
- **G5 fail** (legacy rows written/missing/duplicate): the gate FAILS the
  deployment. The legacy table is write-protected by design
  (`LEGACY_ISSUER_REACHABLE=false` + deployed guard); any write to
  `generated_signals` from the paper path is a deployment-blocking
  violation. No restore — investigate the write path.

## Notes for the next gate run

1. Re-invoke the deployed actions and re-save raw JSON:
   `getpaperpilotstatus {}` → `pilot/delivery/worker-runs/status-<date>.json`;
   `getsignaltracker {"limit": 200}` → `comparison/live-tracker-<date>.json`
   (requires a seat with `artifact.invoke_action`).
2. Run: `python3 comparison/integration_gate.py --status <status-file> --tracker <tracker-file>`,
   plus the live-bytes demonstration (`live_paper_stream.export_live_stream`
   on the actual status file + `worker_strict_parse`/`worker_send_sweep`).
3. G3: verify the test ledger key reached `delivered`/`unknown`; a fresh
   labeled probe per deployment is required by the spec — the parent may
   authorize record-verification instead, but record the probe's build
   freshness explicitly.
4. Record results here (`paper-signals/DEPLOYMENT-GATE-<date>.md`).

Paper signals only. No brokerage. Holdouts locked. No trading candidate was
manufactured at any point.
