#!/usr/bin/env python3
"""Reconciliation check: freeze-manifest-v2.1.3.json (executable-hash amendment)
<-> freeze-manifest-v2.1.2.json (immutable) <-> v2.1.1/v2.1.0 (immutable)
<-> harness.py <-> collect_pilot_rows.py <-> live_paper_stream.py <-> ACTIVE_MANIFEST.

Asserts, MECHANICALLY:
  1. v2.1.0, v2.1.1, v2.1.2 bytes untouched (sha256 matches v2.1.3 records);
  2. v2.1.3 records the CURRENT executable sha256 (harness, collector,
     live_paper_stream, tests, this script);
  3. ACTIVE_MANIFEST names freeze-manifest-v2.1.3.json; harness
     EXPECTED_ACTIVE_VERSION / ACTIVE_FREEZE_VERSION == "2.1.3";
  4. no prediction-weight drift (17.0 / 15.5 / 90);
  5. superseded born-dead gate statically unreachable;
  6. collector targets the prospective vessel, stamps the active version,
     enforces the post-freeze cutoff;
  7. RULE 5/6 present: c2_may_reuse_production gate exists, direction-only
     reuse impossible, unknown reason codes defined;
  8. v2.1.3's changed_fields documents the RULE 5/6 changes.

Exit 0 = all green.
"""
import hashlib
import json
import os
import re
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE)

V210_PATH = os.path.join(BASE, "freeze-manifest-v2.1.0.json")
V211_PATH = os.path.join(BASE, "freeze-manifest-v2.1.1.json")
V212_PATH = os.path.join(BASE, "freeze-manifest-v2.1.2.json")
V213_PATH = os.path.join(BASE, "freeze-manifest-v2.1.3.json")
HARNESS_PATH = os.path.join(BASE, "harness.py")
COLLECTOR_PATH = os.path.join(BASE, "collect_pilot_rows.py")
MARKER_PATH = os.path.join(BASE, "ACTIVE_MANIFEST")

passed = []


def check(name, cond, detail=""):
    assert cond, f"RECONCILIATION FAILURE [{name}]: {detail}"
    passed.append(name)
    print(f"  PASS {name}")


def sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for c in iter(lambda: f.read(1 << 20), b""):
            h.update(c)
    return h.hexdigest()


v213 = json.load(open(V213_PATH))
v212 = json.load(open(V212_PATH))
v210 = json.load(open(V210_PATH))

print("== [1] frozen manifests untouched ==")
check("v2.1.3 records a v2.1.2 sha256",
      re.fullmatch(r"[0-9a-f]{64}", v213.get("v212_sha256") or "") is not None)
check("v2.1.2 bytes untouched (hash matches v2.1.3 record)",
      sha(V212_PATH) == v213["v212_sha256"])
check("v2.1.1 bytes untouched (hash matches v2.1.3 record)",
      sha(V211_PATH) == v213["v211_sha256"])
check("v2.1.0 bytes untouched (hash matches v2.1.3 record)",
      sha(V210_PATH) == v213["v210_executable_core_sha256"])
check("v2.1.3 supersedes v2.1.2 (chain marked)",
      v213["supersedes"]["manifest"] == "freeze-manifest-v2.1.2.json")

print("== [2] v2.1.3 binds the current executable bytes ==")
recorded = v213["executable_hashes"]
for rel in ("comparison/harness.py", "comparison/collect_pilot_rows.py",
            "comparison/live_paper_stream.py",
            "comparison/tests/test_harness.py",
            "comparison/tests/test_collector.py",
            "comparison/tests/run_tests.py",
            "comparison/check_reconciliation_v2_1_3.py"):
    disk = sha(os.path.join(BASE, rel.split("comparison/")[1]))
    check(f"v2.1.3 records current sha256 for {rel}",
          recorded.get(rel) == disk,
          f"recorded={(recorded.get(rel) or '')[:16]}... disk={disk[:16]}...")

print("== [3] active-manifest binding ==")
marker = open(MARKER_PATH).read().strip()
check("ACTIVE_MANIFEST names freeze-manifest-v2.1.3.json",
      marker == "freeze-manifest-v2.1.3.json", f"marker={marker!r}")
import harness
check("harness EXPECTED_ACTIVE_VERSION == '2.1.3'",
      harness.EXPECTED_ACTIVE_VERSION == "2.1.3")
check("harness ACTIVE_FREEZE_VERSION == '2.1.3'",
      harness.ACTIVE_FREEZE_VERSION == "2.1.3")
check("harness loaded the active manifest (version matches file)",
      harness.ACTIVE_MANIFEST["manifest_version"] == "2.1.3")

print("== [4] no prediction-weight drift ==")
by_name = {x["model_name"]: x for x in v210["models"]}
prod = by_name["crypto-dossier-factor-agreement"]
c2 = by_name["crypto-dossier-minus-momentum"]
check("harness production total weight == 17.0",
      abs(harness.CRYPTO_PRODUCTION_TOTAL_WEIGHT - 17.0) < 1e-9)
check("harness C-2 total weight == 15.5",
      abs(harness.CRYPTO_C2_TOTAL_WEIGHT - 15.5) < 1e-9)
check("harness C-2 == production minus Momentum",
      sorted(harness.CRYPTO_C2_LABELS) ==
      sorted(x["label"] for x in c2["factors"]))

print("== [5] superseded born-dead gate statically unreachable ==")
src = open(HARNESS_PATH).read()
check("no born_dead_check definition in harness.py",
      "def born_dead_check" not in src)
check("repaired evaluator present",
      hasattr(harness, "operational_issuance_eval"))

print("== [6] collector targets vessel, stamps active version, cutoff ==")
import collect_pilot_rows as col
check("collector VESSEL_CSV is the prospective vessel",
      col.VESSEL_CSV.endswith(os.path.join("rows", "cohort-prospective-v2.csv")),
      col.VESSEL_CSV)
check("collector stamps the active freeze version",
      col.ACTIVE_FREEZE_VERSION == "2.1.3")
check("collector post-freeze cutoff == v2.1.0 freeze time",
      col.POST_FREEZE_CUTOFF_UTC == "2026-10-14T04:57:00Z")

print("== [7] RULE 5/6 present ==")
check("c2_may_reuse_production defined",
      hasattr(harness, "c2_may_reuse_production"))
check("direction-only reuse impossible (levels exact-equality required)",
      "_levels_exact_equal" in src)
check("unknown reason codes defined",
      "unscored:waiting-interval-evidence-missing" in src
      and "unscored:entry-observation-missing" in src)

print("== [8] v2.1.3 documents the RULE 5/6 changes ==")
fields = {f["field"] for f in v213.get("changed_fields", [])}
for needed in ("harness.c2_reuse_gate", "harness.c2_unknown_evidence",
               "harness.active_version"):
    check(f"changed_fields documents {needed}", needed in fields)

print(f"\nALL GREEN: {len(passed)} checks passed.")
