#!/usr/bin/env python3
"""Write comparison/freeze-manifest-v2.1.5.json (operational-verification fixes, 2026-10-14).

v2.1.5 is an OPERATIONAL-VERIFICATION amendment covering two authorized
executable changes made after v2.1.4 was frozen:

  1. HARNESS RECEIPT-EXPIRY PARITY (item 2): comparison/harness.py's
     operational_issuance_eval now rejects receipt after entry-window
     expiry (received_at > window_end -> ("fail", "abstain:entry-expired")),
     exactly matching the accepted issuance handler's lateReceiptVoid
     (orchestrator/src/issuance/handler.ts -> void_expired). Dual-path
     agreement test (comparison/tests/test_receipt_expiry_parity.py +
     orchestrator/tests/receipt-expiry-probe.ts) proves both paths return
     identical (verdict, reason_code) on the canonical fixtures.
  2. ADAPTER FULL-RECORD EXTENSION (item 1): comparison/live_paper_stream.py
     now emits five nested blocks per candidate dict -- contract,
     entry_observation, frozen_levels, gate_inputs, waiting_interval_evidence
     -- preserving the full repaired-handler record; comparison/collect_pilot_rows.py
     gained fold_full_record() folding those blocks into the row notes as a
     full_record= JSON payload (69-column vessel schema untouched).

Additive/verification-only. NOT a change to prediction weights, factor sets,
scoring formulas, level construction, asserted rules 1-6, the operational
evaluator's other gates, the decision-time rule, the collection window,
row data, or the accepted recovery implementation.

Supersession chain: v2.1.0 (executable core) <- v2.1.1 (dates) <-
v2.1.2 (executable-path) <- v2.1.3 (RULE 5/6) <- v2.1.4 (collector wiring;
SUPERSEDED as active) <- v2.1.5 (active). All prior bytes verified
untouched below.
"""
import json
import hashlib
import os
import re
import datetime

BASE = os.path.dirname(os.path.abspath(__file__))
WS = os.path.expanduser("~/workspace")


def sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def sha_rel(rel):
    return sha(os.path.join(WS, rel))


CMP = "goals/research-terminal/paper-signals/comparison"

EXECUTABLES = {
    "comparison/harness.py": sha_rel(f"{CMP}/harness.py"),
    "comparison/collect_pilot_rows.py": sha_rel(f"{CMP}/collect_pilot_rows.py"),
    "comparison/live_paper_stream.py": sha_rel(f"{CMP}/live_paper_stream.py"),
    "comparison/tests/test_harness.py": sha_rel(f"{CMP}/tests/test_harness.py"),
    "comparison/tests/test_collector.py": sha_rel(f"{CMP}/tests/test_collector.py"),
    "comparison/tests/test_live_adapter_full.py": sha_rel(
        f"{CMP}/tests/test_live_adapter_full.py"),
    "comparison/tests/test_receipt_expiry_parity.py": sha_rel(
        f"{CMP}/tests/test_receipt_expiry_parity.py"),
    "comparison/tests/run_tests.py": sha_rel(f"{CMP}/tests/run_tests.py"),
    "comparison/check_reconciliation_v2_1_5.py": sha_rel(
        f"{CMP}/check_reconciliation_v2_1_5.py"),
}

V214 = "freeze-manifest-v2.1.4.json"
v214_hash = sha(os.path.join(BASE, V214))
v213_hash = sha(os.path.join(BASE, "freeze-manifest-v2.1.3.json"))
v212_hash = sha(os.path.join(BASE, "freeze-manifest-v2.1.2.json"))
v211_hash = sha(os.path.join(BASE, "freeze-manifest-v2.1.1.json"))
v210_hash = sha(os.path.join(BASE, "freeze-manifest-v2.1.0.json"))

v214 = json.load(open(os.path.join(BASE, V214)))
m = re.search(r"sha256\s+([0-9a-f]{64})", v214["amended_manifest"])
assert m and m.group(1) == v213_hash, "v2.1.3 bytes changed under v2.1.4!"
assert v214["v212_sha256"] == v212_hash, "v2.1.2 bytes changed!"
assert v214["v211_sha256"] == v211_hash, "v2.1.1 bytes changed!"
assert v214["v210_executable_core_sha256"] == v210_hash, "v2.1.0 bytes changed!"

POST_FREEZE_CUTOFF_UTC = "2026-10-14T04:57:00Z"
assert v214["prospective_collection"]["post_freeze_cutoff_utc"] == POST_FREEZE_CUTOFF_UTC

manifest = {
    "manifest_version": "2.1.5",
    "frozen_at_utc": datetime.datetime.now(datetime.timezone.utc).strftime(
        "%Y-%m-%dT%H:%M:%SZ"),
    "frozen_by": ("coordinator operational-verification round (2026-10-14) -- "
                  "harness receipt-expiry parity + adapter full-record extension"),
    "amended_manifest": f"{V214} (sha256 {v214_hash})",
    "v214_sha256": v214_hash,
    "v213_sha256": v213_hash,
    "v212_sha256": v212_hash,
    "v211_sha256": v211_hash,
    "v210_executable_core_sha256": v210_hash,
    "amendment_kind": "operational-verification executable amendment to freeze-manifest-v2.1.4.json",
    "supersedes": {
        "manifest": V214,
        "status": "SUPERSEDED as the active manifest",
        "marker": "goals/research-terminal/paper-signals/comparison/FREEZE-v2.1.4-SUPERSEDED.md",
        "scope": ("active-manifest status; the harness receipt-expiry parity "
                  "check and the adapter full-record extension. v2.1.4's "
                  "collector wiring, v2.1.3's RULE 5/6, v2.1.2's executable-path "
                  "alignment, v2.1.1's date fields, and v2.1.0's executable "
                  "core all carried forward unchanged."),
    },
    "immutability_rule": ("This manifest is immutable once frozen. ANY change to a model's "
                          "factor list, weights, scoring formula, level construction, gate "
                          "rules, entry rule, cost model, horizon, decision-time definition, "
                          "veto semantics, venue mapping, or evaluator version requires a NEW "
                          "manifest version. Never edit this file in place."),
    "scope": ("This amendment adds (a) the receipt-expiry parity check to the "
              "harness's operational evaluator and (b) the full-record extension "
              "to the live-stream adapter plus the collector's fold_full_record. "
              "Verification-only. Nothing about prediction weights, factor sets, "
              "scoring formulas, level construction, asserted rules 1-6, the "
              "operational evaluator's other gates, the decision-time rule, the "
              "collection window, row data, or the accepted recovery "
              "implementation changes."),
    "changed_fields": [
        {
            "field": "harness.operational_issuance_eval.receipt_expiry",
            "v2_1_4_value": "graded only observed_at > window_end; never compared receipt time against window expiry (proven divergence on the canonical fixture).",
            "v2_1_5_value": ("received_at > window_end -> ('fail', 'abstain:entry-expired'), "
                             "matching the issuance handler's lateReceiptVoid -> void_expired "
                             "(orchestrator/src/issuance/handler.ts). Dual-path agreement test "
                             "asserts identical (verdict, reason_code) on both paths."),
            "why": "The comparison harness must reject receipt after entry-window expiry exactly like the accepted issuance handler (expert item 2).",
        },
        {
            "field": "adapter.full_record",
            "v2_1_4_value": "candidate dicts carried IDs, scores, top-level entry/ATR14, and a thin trace block.",
            "v2_1_5_value": ("five nested blocks per candidate dict: contract, entry_observation, "
                             "frozen_levels, gate_inputs, waiting_interval_evidence; alerts joined "
                             "from data.alerts[] into trace.setup_alert/trace.entry_alert. Absent "
                             "fields are None, never fabricated. ACTIVE_FREEZE_VERSION 2.1.4 -> 2.1.5."),
            "why": "The adapter must preserve the full repaired-handler record through to the collector (expert item 1).",
        },
        {
            "field": "collector.fold_full_record",
            "v2_1_4_value": "row notes carried trace_note only.",
            "v2_1_5_value": ("fold_full_record() folds the adapter's five blocks into row notes as a "
                             "full_record= JSON payload; 69-column vessel schema untouched."),
            "why": "Full evidence must reach the prospective row without schema drift (expert item 1).",
        },
        {
            "field": "harness.active_version",
            "v2_1_4_value": "EXPECTED_ACTIVE_VERSION = '2.1.4'.",
            "v2_1_5_value": "EXPECTED_ACTIVE_VERSION = '2.1.5'; ACTIVE_MANIFEST names freeze-manifest-v2.1.5.json.",
            "why": "Executable change -> version bump + matching hashes, per the freeze discipline.",
        },
    ],
    "executable_hashes": EXECUTABLES,
    "prospective_collection": {
        "post_freeze_cutoff_utc": POST_FREEZE_CUTOFF_UTC,
        "post_freeze_cutoff_source": "freeze-manifest-v2.1.0.json frozen_at_utc (verified via chain)",
        "vessel": "goals/research-terminal/paper-signals/comparison/rows/cohort-prospective-v2.csv",
        "vessel_schema_columns": 69,
        "collector": "goals/research-terminal/paper-signals/comparison/collect_pilot_rows.py",
        "live_stream_adapter": "goals/research-terminal/paper-signals/comparison/live_paper_stream.py",
    },
    "prediction_weights_unchanged": {
        "statement": "No prediction weight, factor set, scoring formula, or asserted-rule changes in v2.1.5.",
        "crypto_production_total_weight": 17.0,
        "crypto_c2_total_weight": 15.5,
        "crypto_c2_difference": "Momentum (weight 1.5) removed; no rescale",
        "equity_total_weight": 90,
    },
    "provenance": {
        "parent_task": "Bounded integration fix: operational verification (items 1-2)",
        "constraints": "Do NOT reopen accepted recovery work; do NOT change prediction weights; paper only; holdouts locked.",
        "tests": "comparison/tests/run_tests.py",
        "reconciliation": "comparison/check_reconciliation_v2_1_5.py",
    },
}

out = os.path.join(BASE, "freeze-manifest-v2.1.5.json")
with open(out, "w") as f:
    json.dump(manifest, f, indent=2)
    f.write("\n")
print(f"wrote {out}")
for name, h in EXECUTABLES.items():
    print(f"  {name}: {h}")
