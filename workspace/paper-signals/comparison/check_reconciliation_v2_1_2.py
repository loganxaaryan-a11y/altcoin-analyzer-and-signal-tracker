#!/usr/bin/env python3
"""Reconciliation check: freeze-manifest-v2.1.2.json (executable-path amendment)
<-> freeze-manifest-v2.1.1.json (immutable) <-> freeze-manifest-v2.1.0.json
(immutable, executable core) <-> harness.py <-> collect_pilot_rows.py <->
ACTIVE_MANIFEST marker.

Asserts, MECHANICALLY:
  1. v2.1.0 and v2.1.1 bytes are untouched (sha256 matches what v2.1.2 records);
  2. v2.1.2 records the CURRENT harness.py + collect_pilot_rows.py (+ tests +
     this script) sha256 -- the freeze binds the exact bytes;
  3. ACTIVE_MANIFEST names freeze-manifest-v2.1.2.json, and the harness's
     EXPECTED_ACTIVE_VERSION / ACTIVE_FREEZE_VERSION are "2.1.2";
  4. no prediction-weight drift: the harness's frozen scoring constants match
     the v2.1.0 executable core;
  5. the superseded born-dead gate is statically unreachable from harness.py
     (no born_dead_check definition or call);
  6. the collector targets the prospective vessel, stamps the active
     version, and enforces the post-freeze cutoff read from the manifest;
  7. v2.1.2's changed_fields documents the harness + collector changes.

Exit 0 = all green. Any failure raises AssertionError with the mismatch.
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


v212 = json.load(open(V212_PATH))
v210 = json.load(open(V210_PATH))

print("== [1] frozen manifests untouched ==")
check("v2.1.2 records a v2.1.0 sha256",
      re.fullmatch(r"[0-9a-f]{64}", v212.get("v210_executable_core_sha256") or "") is not None)
check("v2.1.0 bytes untouched (hash matches v2.1.2 record)",
      sha(V210_PATH) == v212["v210_executable_core_sha256"],
      f"disk={sha(V210_PATH)[:16]}... recorded={v212['v210_executable_core_sha256'][:16]}...")
check("v2.1.2 records a v2.1.1 sha256",
      re.fullmatch(r"[0-9a-f]{64}", v212.get("v211_sha256") or "") is not None)
check("v2.1.1 bytes untouched (hash matches v2.1.2 record)",
      sha(V211_PATH) == v212["v211_sha256"])
check("v2.1.2 supersedes v2.1.1 (chain marked)",
      v212["supersedes"]["manifest"] == "freeze-manifest-v2.1.1.json")
check("v2.1.2 carries v2.1.1's date fields unchanged",
      v212["unchanged_fields_restated_for_completeness"]
          ["collection_window_equity_outcome_close"].startswith("2027-02-17"))

print("== [2] v2.1.2 binds the current executable bytes ==")
recorded = v212["executable_hashes"]
for rel in ("comparison/harness.py", "comparison/collect_pilot_rows.py",
            "comparison/tests/test_harness.py",
            "comparison/tests/test_collector.py",
            "comparison/tests/run_tests.py",
            "comparison/check_reconciliation_v2_1_2.py"):
    disk = sha(os.path.join(BASE, rel.split("comparison/")[1]))
    check(f"v2.1.2 records current sha256 for {rel}",
          recorded.get(rel) == disk,
          f"recorded={(recorded.get(rel) or '')[:16]}... disk={disk[:16]}...")

print("== [3] active-manifest binding ==")
marker = open(MARKER_PATH).read().strip()
check("ACTIVE_MANIFEST names freeze-manifest-v2.1.2.json",
      marker == "freeze-manifest-v2.1.2.json", f"marker={marker!r}")
import harness
check("harness EXPECTED_ACTIVE_VERSION == '2.1.2'",
      harness.EXPECTED_ACTIVE_VERSION == "2.1.2")
check("harness ACTIVE_FREEZE_VERSION == '2.1.2'",
      harness.ACTIVE_FREEZE_VERSION == "2.1.2")
check("harness loaded the active manifest (version matches file)",
      harness.ACTIVE_MANIFEST["manifest_version"] == "2.1.2")
check("no hardcoded MANIFEST_VERSION constant remains",
      not hasattr(harness, "MANIFEST_VERSION"))

print("== [4] no prediction-weight drift ==")
by_name = {x["model_name"]: x for x in v210["models"]}
prod = by_name["crypto-dossier-factor-agreement"]
c2 = by_name["crypto-dossier-minus-momentum"]
check("harness production total weight == 17.0",
      abs(harness.CRYPTO_PRODUCTION_TOTAL_WEIGHT - 17.0) < 1e-9)
check("harness C-2 total weight == 15.5",
      abs(harness.CRYPTO_C2_TOTAL_WEIGHT - 15.5) < 1e-9)
check("harness production labels == manifest factor labels",
      sorted(harness.CRYPTO_PRODUCTION_LABELS) ==
      sorted(x["label"] for x in prod["factors"]))
check("harness C-2 == production minus Momentum",
      sorted(harness.CRYPTO_C2_LABELS) ==
      sorted(x["label"] for x in c2["factors"]))
check("manifest weights unchanged (17.0 / 15.5)",
      abs(sum(x["weight"] for x in prod["factors"]) - 17.0) < 1e-9
      and abs(sum(x["weight"] for x in c2["factors"]) - 15.5) < 1e-9)

print("== [5] superseded born-dead gate statically unreachable ==")
src = open(HARNESS_PATH).read()
check("no born_dead_check definition in harness.py",
      "def born_dead_check" not in src)
check("no born_dead_check call in harness.py",
      re.findall(r"(?<!def )(?<!_)born_dead_check\s*\(", src) == [])
check("no born_dead_check attribute on the harness module",
      not hasattr(harness, "born_dead_check"))
check("repaired evaluator present",
      hasattr(harness, "operational_issuance_eval"))

print("== [6] collector targets vessel, stamps active version, cutoff ==")
import collect_pilot_rows as col
check("collector VESSEL_CSV is the prospective vessel",
      col.VESSEL_CSV.endswith(os.path.join("rows", "cohort-prospective-v2.csv")),
      col.VESSEL_CSV)
check("collector does not default to the pilot file",
      "comparison-rows-pilot" not in col.VESSEL_CSV)
check("collector stamps the active freeze version",
      col.ACTIVE_FREEZE_VERSION == "2.1.2")
check("collector post-freeze cutoff == v2.1.0 freeze time",
      col.POST_FREEZE_CUTOFF_UTC == "2026-10-14T04:57:00Z",
      col.POST_FREEZE_CUTOFF_UTC)
check("cutoff matches the manifest's prospective_collection",
      v212["prospective_collection"]["post_freeze_cutoff_utc"] ==
      col.POST_FREEZE_CUTOFF_UTC)
check("vessel schema is 69 columns",
      len(col.VESSEL_COLUMNS) == 69)
with open(col.VESSEL_CSV, newline="") as fh:
    import csv
    disk_header = next(csv.reader(fh))
check("on-disk vessel header matches VESSEL_COLUMNS",
      disk_header == col.VESSEL_COLUMNS)

print("== [7] v2.1.2 documents the executable changes ==")
fields = {f["field"] for f in v212.get("changed_fields", [])}
for needed in ("harness.issuance_path_gate", "harness.manifest_binding",
               "harness.suppression_taxonomy", "collector.target_vessel",
               "collector.freeze_stamp", "collector.post_freeze_cutoff"):
    check(f"changed_fields documents {needed}", needed in fields)
check("amendment_kind names executable-path",
      "executable" in v212["amendment_kind"])
check("scope disclaims prediction-weight changes",
      "prediction weights" in v212["scope"].lower() or
      "Nothing about prediction weights" in v212["scope"])

print(f"\nALL GREEN: {len(passed)} checks passed.")
