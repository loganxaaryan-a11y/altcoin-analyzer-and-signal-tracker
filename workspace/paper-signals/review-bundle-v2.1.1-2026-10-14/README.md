# Review bundle — paper signals v2.1.1 (2026-10-14)

Self-contained review package for the expert's final corrections. All files
SHA-256 listed in `SHA256SUMS`.

## Contents

- `manifest/` — `freeze-manifest-v2.1.0.json` (immutable; sha256
  `719aed7d19b7bc46e5cf0576359b1771fef235aadfcc8b565e0b7d442435ada4`)
  and `freeze-manifest-v2.1.1.json` (date-fields-only amendment: equity
  maturity computed from the frozen 30-XNYS-session rule; v2.1.0 bytes
  untouched).
- `harness/` — the executable comparison harness (`harness.py`,
  `metrics.py`, `collect_pilot_rows.py`), both reconciliation checks, the
  test suite, and `REGRESSION-RESULTS-2026-10-14.txt` (86/86 tests OK;
  v2.1.1 reconciliation 15/15 green; v2.1.0 check retained as historical —
  its plan-UNRESOLVED assertions are superseded by the v2.1.1 amendment).
- `plan/` — collection plan (conflict §9 RESOLVED by computation), the
  equity maturity schedule (latest cohort maturity 2027-02-17, readout by
  2027-02-24), measurement-gaps closure, BTC issuance runtime
  identification (VERDICT: sandbox-only), and the collection job spec
  (not installed — needs authorization).
- `evidence/` — terminal-runtime evidence (three classes separated).
- `delivery/` — Logan's alert routing spec: payload schema
  (SETUP_PENDING vs ENTRY_CONFIRMED), delivery semantics, delivery config
  (destination = research side chat a685c3e7-c8be-4137-8900-4e899008bca7 +
  terminal tracker), delivery audit (96 sim-ack rows relabeled
  delivered-simulated; zero bare-delivered remain), routing-test payload
  (prepared, send pending), daily-summary job spec.
- `rows/` — retrospective cohort (356 rows), prospective vessel
  (header-only, 0 rows), cohort rules, first-post-freeze-opportunity
  (`status: none_yet` with evidence), and the 60 real pilot rows.

## Relationship to the full source

This bundle carries the freeze, harness, plan, evidence, and data. The full
runnable source tree (entry-v1, veto, orchestrator, demos, TS suites) is the
separate reproducible package:

`~/workspace/goals/research-terminal/paper-signals/paper-signals-offline-export.zip`
(23 MB; one offline command `./build.sh` compiles, runs all suites and the
ten integrated demos; verified from a pristine no-network extraction).

## Open items (unchanged)

1. Routing-test notification: payload prepared; the send to the side chat is
   pending (subagents cannot post to chat).
2. Collection job spec written, not installed (persistent scheduling needs
   Logan's authorization).
3. Target-vessel mismatch: the collector hardcodes the pilot file while the
   plan mandates `cohort-prospective-v2.csv`; harness stamps
   `freeze_version` 2.0.0 instead of 2.1.0. Fix before the first row flows.
4. Deployed `runpapersignalcycle` timestamps/action records live only in the
   artifact's segregated tables (parent must pull from the live artifact).
