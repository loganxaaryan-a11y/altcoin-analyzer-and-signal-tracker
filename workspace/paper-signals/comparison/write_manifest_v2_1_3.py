#!/usr/bin/env python3
"""Write comparison/freeze-manifest-v2.1.3.json (fix 2 of 5 follow-through, 2026-10-14).

v2.1.3 is an EXECUTABLE-HASH amendment: fix 2 (C-2 independent evaluation,
RULE 5/6) changed harness.py AFTER v2.1.2 was frozen, so v2.1.2's recorded
harness sha256 went stale. v2.1.3 records the new bytes and bumps the active
version. It is NOT a change to prediction weights, factor sets, scoring
formulas, level construction, RULES 1-4, the operational evaluator, the
decision-time rule, the collection window, or any row data.

Changes from v2.1.2:
  1. HARNESS C-2 REUSE GATE (RULE 5): c2_may_reuse_production(evidence) --
     a production result may be reused for C-2 ONLY on exact input+rule
     match (same decision-time ledger, direction, levels recomputed exactly
     via _levels_exact_equal, entry-eligibility inputs, waiting-interval
     evidence, operational gates, real issued/abstain verdict). A matching
     direction alone never suffices; any mismatch -> C-2 evaluated
     independently from its own 10-factor ledger through the repaired
     operational evaluator on C-2's own direction/stop.
  2. HARNESS UNKNOWN RULE (RULE 6): missing C-2 operational evidence ->
     unscored with reason codes unscored:waiting-interval-evidence-missing /
     unscored:entry-observation-missing / unscored:levels-uncomputable --
     never filled from production's values.
  3. ACTIVE VERSION: comparison/ACTIVE_MANIFEST now names
     freeze-manifest-v2.1.3.json; harness EXPECTED_ACTIVE_VERSION = "2.1.3".

Supersession chain: v2.1.0 (executable-core freeze of record) <- v2.1.1
(dates) <- v2.1.2 (executable-path alignment; SUPERSEDED as active) <-
v2.1.3 (active). All prior bytes verified untouched below.
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
    "comparison/check_reconciliation_v2_1_3.py": sha_rel(
        f"{CMP}/check_reconciliation_v2_1_3.py"),
}

V212 = "freeze-manifest-v2.1.2.json"
V211 = "freeze-manifest-v2.1.1.json"
V210 = "freeze-manifest-v2.1.0.json"
v212_hash = sha(os.path.join(BASE, V212))
v211_hash = sha(os.path.join(BASE, V211))
v210_hash = sha(os.path.join(BASE, V210))

# Chain intact: v2.1.2's records must match bytes on disk.
v212 = json.load(open(os.path.join(BASE, V212)))
m = re.search(r"sha256\s+([0-9a-f]{64})", v212["amended_manifest"])
assert m and m.group(1) == v211_hash, "v2.1.1 bytes changed under v2.1.2!"
assert v212["v210_executable_core_sha256"] == v210_hash, "v2.1.0 bytes changed!"

POST_FREEZE_CUTOFF_UTC = "2026-10-14T04:57:00Z"
assert v212["prospective_collection"]["post_freeze_cutoff_utc"] == POST_FREEZE_CUTOFF_UTC

manifest = {
    "manifest_version": "2.1.3",
    "frozen_at_utc": datetime.datetime.now(datetime.timezone.utc).strftime(
        "%Y-%m-%dT%H:%M:%SZ"),
    "frozen_by": ("coordinator fix-2 follow-through (2026-10-14) -- executable-hash "
                  "amendment: record fix 2's RULE 5/6 harness bytes"),
    "amended_manifest": f"{V212} (sha256 {v212_hash})",
    "v212_sha256": v212_hash,
    "v211_sha256": v211_hash,
    "v210_executable_core_sha256": v210_hash,
    "amendment_kind": "executable-hash amendment to freeze-manifest-v2.1.2.json",
    "supersedes": {
        "manifest": V212,
        "status": "SUPERSEDED as the active manifest",
        "marker": "goals/research-terminal/paper-signals/comparison/FREEZE-v2.1.2-SUPERSEDED.md",
        "scope": ("active-manifest status; the C-2 reuse gate (RULE 5) and "
                  "unknown-evidence rule (RULE 6). v2.1.2's executable-path "
                  "alignment, v2.1.1's date fields, and v2.1.0's executable "
                  "core all carried forward unchanged."),
    },
    "immutability_rule": ("This manifest is immutable once frozen. ANY change to a model's "
                          "factor list, weights, scoring formula, level construction, gate "
                          "rules, entry rule, cost model, horizon, decision-time definition, "
                          "veto semantics, venue mapping, or evaluator version requires a NEW "
                          "manifest version. Never edit this file in place."),
    "scope": ("This amendment records the harness bytes after fix 2 (C-2 independent "
              "evaluation, RULE 5/6) and bumps the active version. Nothing about "
              "prediction weights, factor sets, scoring formulas, level construction, "
              "RULES 1-4, the operational evaluator, the decision-time rule, the "
              "collection window, or any row data changes."),
    "changed_fields": [
        {
            "field": "harness.c2_reuse_gate",
            "v2_1_2_value": "non-flipped challenger legs inherited production's issuance via shared-evidence agreement (RULE 4); no exact-match gate.",
            "v2_1_3_value": ("RULE 5: c2_may_reuse_production(evidence) -> (bool, reason). "
                             "Reuse requires exact input+rule match (ledger, direction, "
                             "levels via _levels_exact_equal, entry-eligibility inputs, "
                             "waiting-interval evidence, operational gates, real verdict). "
                             "Direction-match alone never suffices; mismatch -> C-2 scored "
                             "independently from its own 10-factor ledger through "
                             "operational_issuance_eval on C-2's own direction/stop. "
                             "Verified reuse recorded as levels_mode='reused: exact input+rule match'."),
            "why": "A matching direction does not prove identical levels, entry eligibility, or waiting-interval evidence.",
        },
        {
            "field": "harness.c2_unknown_evidence",
            "v2_1_2_value": "no explicit unknown bucket for missing C-2 operational evidence.",
            "v2_1_3_value": ("RULE 6: missing C-2 operational evidence -> unscored with "
                             "unscored:waiting-interval-evidence-missing / "
                             "unscored:entry-observation-missing / "
                             "unscored:levels-uncomputable. Never filled from production's values."),
            "why": "Missing evidence remains unknown; metrics.py excludes unscored from accounting.",
        },
        {
            "field": "harness.active_version",
            "v2_1_2_value": "EXPECTED_ACTIVE_VERSION = '2.1.2'; ACTIVE_MANIFEST names freeze-manifest-v2.1.2.json.",
            "v2_1_3_value": "EXPECTED_ACTIVE_VERSION = '2.1.3'; ACTIVE_MANIFEST names freeze-manifest-v2.1.3.json.",
            "why": "Executable change -> version bump + matching hashes, per the freeze discipline.",
        },
    ],
    "executable_hashes": EXECUTABLES,
    "prospective_collection": {
        "post_freeze_cutoff_utc": POST_FREEZE_CUTOFF_UTC,
        "post_freeze_cutoff_source": "freeze-manifest-v2.1.0.json frozen_at_utc (verified via v2.1.2 chain)",
        "vessel": "goals/research-terminal/paper-signals/comparison/rows/cohort-prospective-v2.csv",
        "vessel_schema_columns": 69,
        "collector": "goals/research-terminal/paper-signals/comparison/collect_pilot_rows.py",
    },
    "prediction_weights_unchanged": {
        "statement": ("No prediction weight, factor set, scoring formula, level "
                      "construction, asserted rule (1-4), or decision-time rule changes in "
                      "v2.1.3. RULE 5/6 govern result REUSE/unknown-handling only."),
        "crypto_production_total_weight": 17.0,
        "crypto_c2_total_weight": 15.5,
        "crypto_c2_difference": "Momentum (weight 1.5) removed; no rescale",
        "equity_total_weight": 90,
    },
    "provenance": {
        "parent_task": "Bounded fix 2 of 5 follow-through: record fix 2's executable bytes",
        "constraints": "Do NOT reopen accepted recovery work; do NOT change prediction weights; paper only; holdouts locked.",
        "tests": "comparison/tests/run_tests.py (128 tests, incl. TestC2IndependentEvaluation)",
        "reconciliation": "comparison/check_reconciliation_v2_1_3.py",
    },
}

out = os.path.join(BASE, "freeze-manifest-v2.1.3.json")
with open(out, "w") as f:
    json.dump(manifest, f, indent=2)
    f.write("\n")
print(f"wrote {out}")
for name, h in EXECUTABLES.items():
    print(f"  {name}: {h}")
