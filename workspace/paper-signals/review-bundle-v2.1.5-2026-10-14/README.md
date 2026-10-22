# Paper Signals — Review Bundle v2.1.5 (2026-10-14)

## ⚠️ STATUS: BUILDER-REPORTED — INDEPENDENT RERUN REQUIRED

**The latest fixes (live-export adapter completeness, receipt-expiry parity, hash mapping,
delivery reconciliation — the v2.1.5 round) are BUILDER-REPORTED and remain so until
independently rerun by the expert.**

The test outputs, reconciliation results, and hashes in this bundle were produced by the
build environment on 2026-10-14. Nothing here constitutes deployed/expert-verified
evidence. Per the standing verification bar: deployed evidence (screenshots of the
actual UI, per-card traces, run IDs) or it isn't done; sandbox-only results get labeled
plainly.

---

## How to re-verify (expert)

From the bundle root — you need only Python 3 (stdlib) and this package:

```bash
# 1) Full comparison test suite (146 tests: harness, collector, receipt-expiry
#    parity incl. the node issuance-handler probe, live-adapter full-record)
cd verify && python3 comparison/tests/run_tests.py

# 2) Version-mapping regression (10 tests: explicit v2.1.0<->v2.1.5 mapping,
#    hash re-verification incl. deployed-side TS sources, negative controls)
cd verify/comparison/tests && python3 test_version_mapping.py

# 3) v2.1.5 reconciliation (44 checks: frozen-manifest chain, executable
#    binding, ACTIVE_MANIFEST, adapter blocks, receipt-expiry parity)
cd verify/comparison && python3 check_reconciliation_v2_1_5.py
```

`verify/` mirrors the `paper-signals/` layout (`comparison/`, `entry-v1/src/`,
`veto/src/`, `orchestrator/dist/…`) so every script runs verbatim — the checks
read relative paths and would fail in a flattened folder. All `verify/` content
is byte-identical copies of the reviewed sources; frozen files are copied, never
modified.

**What the mapping test checks** (`03-version-mapping/test_version_mapping.py`, 10 tests):
- `test_version_chain` — every version from v2.1.0 → v2.1.5 is explicitly mapped;
  no version in the chain is skipped or left implicit.
- `test_hashes_recompute` — parameter hashes recompute identically from the
  frozen manifests (hash+rule validated, not copy-pasted).
- `test_negative_control_tampered_hash` / `test_negative_control_tampered_rule` —
  negative controls: a tampered hash or tampered rule MUST fail validation
  (the check actually checks, it is not a tautology).
- `test_entry_contract`, `test_evaluator_version`, `test_level_construction`,
  `test_venue_mapping`, `test_waiting_interval_veto`, `test_receipt_expiry` —
  the frozen entry contract, evaluator version string, level construction rules,
  venue mapping, waiting-interval veto, and receipt-expiry semantics are bound
  between paper-pilot-v2.1.0 and v2.1.5.

## Contents

| Dir | Contents |
|---|---|
| `01-freeze/` | v2.1.5 freeze manifest (frozen, do not edit), `ACTIVE_MANIFEST` pointer, supersession notes v2.0.0 → v2.1.4 |
| `02-sources/` | Executable sources: `harness.py`, `collect_pilot_rows.py`, `live_paper_stream.py`, `metrics.py` (+ `SHA256SUMS`) |
| `03-version-mapping/` | `VERSION-MAPPING-2026-10-14.md` (explicit paper-pilot-v2.1.0 ↔ v2.1.5 mapping) + `test_version_mapping.py` |
| `04-reconciliation/` | `check_reconciliation_v2_1_5.py` + `REGRESSION-RESULTS-2026-10-14.txt` (real run output) |
| `05-plans-docs/` | Collection plan, equity maturity schedule, measurement-gaps doc, BTC-issuance-runtime doc, discovery-confirmation doc, hash-mapping doc (superseded-banner), deployed version note |
| `06-runs/` | `deployed-run-counts-2026-10-14.json` — three completed deployed runs, zero opportunities (corrected empty-run counts) |
| `07-delivery/` | Delivery config (channel-acked), alert schema, delivery semantics, delivery audit, daily-summary spec, `ACK-EVIDENCE-SUMMARY.md` |
| `08-cohorts/` | `cohort-retrospective-v2.csv` (356 rows: 10 crypto issued + 296 suppressed + 50 equity production-only), header-only `cohort-prospective-v2.csv`, cohort notes |
| `verify/` | Self-contained runnable tree mirroring `paper-signals/`: the full regression suite (`comparison/tests/` incl. version mapping), the reconciliation check, all sources + frozen manifests it reads, deployed-side TS sources + compiled node probe — the exact commands in "How to re-verify" run here |
| `FILE-MANIFEST.md` | sha256 of every file in this bundle |

## Key state

- Prospective file is **empty** — forward collection under the frozen v2.1.x rules is
  pending automatic collection from the repaired paper pipeline.
- Discovery confirmation verdict: **PARTIAL** — scheduled discovery does not yet produce
  paper candidates automatically (named gaps in `05-plans-docs/DISCOVERY-CONFIRMATION-2026-10-14.md`).
- Delivery: routing test status `channel-acked`; see `07-delivery/ACK-EVIDENCE-SUMMARY.md`
  for the evidence and its limits. Live alerts ungated on the routing test per the config.
- No source changes, no weight changes, no frozen-manifest edits were made in this round.
  This bundle only assembles; frozen files are untouched.

## Regression counts recorded (run during packaging, 2026-10-14)

- Full suite (`run_tests.py`): **146 tests, OK**
- Version mapping: **10 tests, OK** → **156 total, all passing**
- Reconciliation v2.1.5: **44/44 checks, ALL GREEN**
- Full output: `04-reconciliation/REGRESSION-RESULTS-2026-10-14.txt`
