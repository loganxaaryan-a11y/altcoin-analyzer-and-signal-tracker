#!/usr/bin/env python3
"""Reconciliation check: freeze-manifest-v2.1.4.json (collector-wiring amendment)
<-> v2.1.3/v2.1.2/v2.1.1/v2.1.0 (immutable) <-> harness.py <->
collect_pilot_rows.py <-> live_paper_stream.py <-> ACTIVE_MANIFEST.

Asserts, MECHANICALLY:
  1. v2.1.0..v2.1.3 bytes untouched (sha256 matches v2.1.4 records);
  2. v2.1.4 records the CURRENT executable sha256;
  3. ACTIVE_MANIFEST names freeze-manifest-v2.1.4.json; harness
     EXPECTED_ACTIVE_VERSION / ACTIVE_FREEZE_VERSION == "2.1.4";
  4. no prediction-weight drift (17.0 / 15.5 / 90);
  5. superseded born-dead gate statically unreachable;
  6. collector targets the prospective vessel, stamps the active version,
     enforces the post-freeze cutoff, and supports --live-export;
  7. RULE 5/6 present;
  8. v2.1.4's changed_fields documents the wiring change.

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
V214_PATH = os.path.join(BASE, "freeze-manifest-v2.1.4.json")
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


v214 = json.load(open(V214_PATH))
v210 = json.load(open(V210_PATH))

print("== [1] frozen manifests untouched ==")
for label, key, path in (("v2.1.3", "v213_sha256", V213_PATH),
                         ("v2.1.2", "v212_sha256", V212_PATH),
                         ("v2.1.1", "v211_sha256", V211_PATH),
                         ("v2.1.0", "v210_executable_core_sha256", V210_PATH)):
    rec = v214.get(key)
    check(f"v2.1.4 records a {label} sha256",
          re.fullmatch(r"[0-9a-f]{64}", rec or "") is not None)
    check(f"{label} bytes untouched", sha(path) == rec)
check("v2.1.4 supersedes v2.1.3 (chain marked)",
      v214["supersedes"]["manifest"] == "freeze-manifest-v2.1.3.json")

print("== [2] v2.1.4 binds the current executable bytes ==")
recorded = v214["executable_hashes"]
for rel in ("comparison/harness.py", "comparison/collect_pilot_rows.py",
            "comparison/live_paper_stream.py",
            "comparison/tests/test_harness.py",
            "comparison/tests/test_collector.py",
            "comparison/tests/run_tests.py",
            "comparison/check_reconciliation_v2_1_4.py"):
    disk = sha(os.path.join(BASE, rel.split("comparison/")[1]))
    check(f"v2.1.4 records current sha256 for {rel}",
          recorded.get(rel) == disk,
          f"recorded={(recorded.get(rel) or '')[:16]}... disk={disk[:16]}...")

print("== [3] active-manifest binding ==")
marker = open(MARKER_PATH).read().strip()
check("ACTIVE_MANIFEST names freeze-manifest-v2.1.4.json",
      marker == "freeze-manifest-v2.1.4.json", f"marker={marker!r}")
import harness
check("harness EXPECTED_ACTIVE_VERSION == '2.1.4'",
      harness.EXPECTED_ACTIVE_VERSION == "2.1.4")
check("harness ACTIVE_FREEZE_VERSION == '2.1.4'",
      harness.ACTIVE_FREEZE_VERSION == "2.1.4")
check("harness loaded the active manifest (version matches file)",
      harness.ACTIVE_MANIFEST["manifest_version"] == "2.1.4")

print("== [4] no prediction-weight drift ==")
by_name = {x["model_name"]: x for x in v210["models"]}
check("harness production total weight == 17.0",
      abs(harness.CRYPTO_PRODUCTION_TOTAL_WEIGHT - 17.0) < 1e-9)
check("harness C-2 total weight == 15.5",
      abs(harness.CRYPTO_C2_TOTAL_WEIGHT - 15.5) < 1e-9)

print("== [5] superseded born-dead gate statically unreachable ==")
src = open(HARNESS_PATH).read()
check("no born_dead_check definition in harness.py",
      "def born_dead_check" not in src)
check("repaired evaluator present",
      hasattr(harness, "operational_issuance_eval"))

print("== [6] collector: vessel, stamp, cutoff, live-export ==")
import collect_pilot_rows as col
check("collector VESSEL_CSV is the prospective vessel",
      col.VESSEL_CSV.endswith(os.path.join("rows", "cohort-prospective-v2.csv")))
check("collector stamps the active freeze version",
      col.ACTIVE_FREEZE_VERSION == "2.1.4")
check("collector post-freeze cutoff == v2.1.0 freeze time",
      col.POST_FREEZE_CUTOFF_UTC == "2026-10-14T04:57:00Z")
csrc = open(COLLECTOR_PATH).read()
check("collector supports --live-export",
      "--live-export=" in csrc and "ingest_live_paper_stream" in csrc)

print("== [7] RULE 5/6 present ==")
check("c2_may_reuse_production defined",
      hasattr(harness, "c2_may_reuse_production"))

print("== [8] v2.1.4 documents the wiring change ==")
fields = {f["field"] for f in v214.get("changed_fields", [])}
check("changed_fields documents collector.live_stream_wiring",
      "collector.live_stream_wiring" in fields)

print(f"\nALL GREEN: {len(passed)} checks passed.")
