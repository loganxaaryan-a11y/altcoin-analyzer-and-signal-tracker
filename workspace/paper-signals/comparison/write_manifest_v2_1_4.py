#!/usr/bin/env python3
"""Write comparison/freeze-manifest-v2.1.4.json (fix 3 wiring, 2026-10-14).

v2.1.4 is a COLLECTOR-WIRING amendment: collect_pilot_rows.py gained the
--live-export flag so the prospective collector ingests the DEPLOYED
artifact's segregated paper tables (via live_paper_stream.ingest_live_paper_stream)
instead of the workspace DB copy. Additive only; no scoring, gate, weight,
or rule changes.

Supersession chain: v2.1.0 (executable core) <- v2.1.1 (dates) <-
v2.1.2 (executable-path) <- v2.1.3 (RULE 5/6; SUPERSEDED as active) <-
v2.1.4 (active). All prior bytes verified untouched below.
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
    "comparison/tests/run_tests.py": sha_rel(f"{CMP}/tests/run_tests.py"),
    "comparison/check_reconciliation_v2_1_4.py": sha_rel(
        f"{CMP}/check_reconciliation_v2_1_4.py"),
}

V213 = "freeze-manifest-v2.1.3.json"
v213_hash = sha(os.path.join(BASE, V213))
v212_hash = sha(os.path.join(BASE, "freeze-manifest-v2.1.2.json"))
v211_hash = sha(os.path.join(BASE, "freeze-manifest-v2.1.1.json"))
v210_hash = sha(os.path.join(BASE, "freeze-manifest-v2.1.0.json"))

v213 = json.load(open(os.path.join(BASE, V213)))
m = re.search(r"sha256\s+([0-9a-f]{64})", v213["amended_manifest"])
assert m and m.group(1) == v212_hash, "v2.1.2 bytes changed under v2.1.3!"
assert v213["v211_sha256"] == v211_hash, "v2.1.1 bytes changed!"
assert v213["v210_executable_core_sha256"] == v210_hash, "v2.1.0 bytes changed!"

POST_FREEZE_CUTOFF_UTC = "2026-10-14T04:57:00Z"
assert v213["prospective_collection"]["post_freeze_cutoff_utc"] == POST_FREEZE_CUTOFF_UTC

manifest = {
    "manifest_version": "2.1.4",
    "frozen_at_utc": datetime.datetime.now(datetime.timezone.utc).strftime(
        "%Y-%m-%dT%H:%M:%SZ"),
    "frozen_by": ("coordinator fix-3 wiring (2026-10-14) -- collector --live-export "
                  "flag for the deployed paper stream"),
    "amended_manifest": f"{V213} (sha256 {v213_hash})",
    "v213_sha256": v213_hash,
    "v212_sha256": v212_hash,
    "v211_sha256": v211_hash,
    "v210_executable_core_sha256": v210_hash,
    "amendment_kind": "collector-wiring executable amendment to freeze-manifest-v2.1.3.json",
    "supersedes": {
        "manifest": V213,
        "status": "SUPERSEDED as the active manifest",
        "marker": "goals/research-terminal/paper-signals/comparison/FREEZE-v2.1.3-SUPERSEDED.md",
        "scope": ("active-manifest status; the collector --live-export wiring. "
                  "v2.1.3's RULE 5/6, v2.1.2's executable-path alignment, "
                  "v2.1.1's date fields, and v2.1.0's executable core all "
                  "carried forward unchanged."),
    },
    "immutability_rule": ("This manifest is immutable once frozen. ANY change to a model's "
                          "factor list, weights, scoring formula, level construction, gate "
                          "rules, entry rule, cost model, horizon, decision-time definition, "
                          "veto semantics, venue mapping, or evaluator version requires a NEW "
                          "manifest version. Never edit this file in place."),
    "scope": ("This amendment wires the collector to the deployed paper stream "
              "(--live-export flag -> live_paper_stream.ingest_live_paper_stream). "
              "Additive only. Nothing about prediction weights, factor sets, scoring "
              "formulas, level construction, asserted rules 1-6, the operational "
              "evaluator, the decision-time rule, the collection window, or any row "
              "data changes."),
    "changed_fields": [
        {
            "field": "collector.live_stream_wiring",
            "v2_1_3_value": "run_collection() ingested crypto candidates only from the workspace DB copy (ingest_crypto_issued).",
            "v2_1_4_value": ("run_collection(live_export=path) ingests the crypto eligible "
                             "stream from the DEPLOYED artifact's segregated paper tables "
                             "via live_paper_stream.ingest_live_paper_stream; CLI flag "
                             "--live-export=<export.json>. DB-copy ingest retained for "
                             "retrospective use only. Equity unchanged (persisted ledgers; "
                             "no deployed paper path exists)."),
            "why": "The prospective collector must prove ongoing deployed collection, not a static workspace copy (expert fix 3).",
        },
        {
            "field": "harness.active_version",
            "v2_1_3_value": "EXPECTED_ACTIVE_VERSION = '2.1.3'.",
            "v2_1_4_value": "EXPECTED_ACTIVE_VERSION = '2.1.4'; ACTIVE_MANIFEST names freeze-manifest-v2.1.4.json.",
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
        "statement": "No prediction weight, factor set, scoring formula, or asserted-rule changes in v2.1.4.",
        "crypto_production_total_weight": 17.0,
        "crypto_c2_total_weight": 15.5,
        "crypto_c2_difference": "Momentum (weight 1.5) removed; no rescale",
        "equity_total_weight": 90,
    },
    "provenance": {
        "parent_task": "Bounded fix 3 of 5: connect collection to deployed paper records",
        "constraints": "Do NOT reopen accepted recovery work; do NOT change prediction weights; paper only; holdouts locked.",
        "tests": "comparison/tests/run_tests.py",
        "reconciliation": "comparison/check_reconciliation_v2_1_4.py",
    },
}

out = os.path.join(BASE, "freeze-manifest-v2.1.4.json")
with open(out, "w") as f:
    json.dump(manifest, f, indent=2)
    f.write("\n")
print(f"wrote {out}")
for name, h in EXECUTABLES.items():
    print(f"  {name}: {h}")
