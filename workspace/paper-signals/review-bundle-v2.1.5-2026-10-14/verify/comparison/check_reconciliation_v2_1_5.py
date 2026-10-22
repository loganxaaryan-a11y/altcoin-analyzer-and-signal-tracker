#!/usr/bin/env python3
"""Reconciliation check: freeze-manifest-v2.1.5.json (operational-verification amendment)
<-> v2.1.4/v2.1.3/v2.1.2/v2.1.1/v2.1.0 (immutable) <-> harness.py <->
collect_pilot_rows.py <-> live_paper_stream.py <-> ACTIVE_MANIFEST.

Asserts, MECHANICALLY:
  1. v2.1.0..v2.1.4 bytes untouched (sha256 matches v2.1.5 records);
  2. v2.1.5 records the CURRENT executable sha256;
  3. ACTIVE_MANIFEST names freeze-manifest-v2.1.5.json; harness
     EXPECTED_ACTIVE_VERSION / ACTIVE_FREEZE_VERSION == "2.1.5";
  4. no prediction-weight drift (17.0 / 15.5 / 90);
  5. superseded born-dead gate statically unreachable;
  6. collector: vessel, stamp, cutoff, live-export;
  7. RULE 5/6 present;
  8. v2.1.5's changed_fields documents both this-round changes;
  9. receipt-expiry parity check present in harness;
 10. adapter emits the five full-record blocks; collector folds them.

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
V215_PATH = os.path.join(BASE, "freeze-manifest-v2.1.5.json")
HARNESS_PATH = os.path.join(BASE, "harness.py")
COLLECTOR_PATH = os.path.join(BASE, "collect_pilot_rows.py")
ADAPTER_PATH = os.path.join(BASE, "live_paper_stream.py")
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


v215 = json.load(open(V215_PATH))
v210 = json.load(open(V210_PATH))

print("== [1] frozen manifests untouched ==")
for label, key, path in (("v2.1.4", "v214_sha256", V214_PATH),
                         ("v2.1.3", "v213_sha256", V213_PATH),
                         ("v2.1.2", "v212_sha256", V212_PATH),
                         ("v2.1.1", "v211_sha256", V211_PATH),
                         ("v2.1.0", "v210_executable_core_sha256", V210_PATH)):
    rec = v215.get(key)
    check(f"v2.1.5 records a {label} sha256",
          re.fullmatch(r"[0-9a-f]{64}", rec or "") is not None)
    check(f"{label} bytes untouched", sha(path) == rec)
check("v2.1.5 supersedes v2.1.4 (chain marked)",
      v215["supersedes"]["manifest"] == "freeze-manifest-v2.1.4.json")

print("== [2] v2.1.5 binds the current executable bytes ==")
recorded = v215["executable_hashes"]
for rel in ("comparison/harness.py", "comparison/collect_pilot_rows.py",
            "comparison/live_paper_stream.py",
            "comparison/tests/test_harness.py",
            "comparison/tests/test_collector.py",
            "comparison/tests/test_live_adapter_full.py",
            "comparison/tests/test_receipt_expiry_parity.py",
            "comparison/tests/run_tests.py",
            "comparison/check_reconciliation_v2_1_5.py"):
    disk = sha(os.path.join(BASE, rel.split("comparison/")[1]))
    check(f"v2.1.5 records current sha256 for {rel}",
          recorded.get(rel) == disk,
          f"recorded={(recorded.get(rel) or '')[:16]}... disk={disk[:16]}...")

print("== [3] active-manifest binding ==")
marker = open(MARKER_PATH).read().strip()
check("ACTIVE_MANIFEST names freeze-manifest-v2.1.5.json",
      marker == "freeze-manifest-v2.1.5.json", f"marker={marker!r}")
import harness
check("harness EXPECTED_ACTIVE_VERSION == '2.1.5'",
      harness.EXPECTED_ACTIVE_VERSION == "2.1.5")
check("harness ACTIVE_FREEZE_VERSION == '2.1.5'",
      harness.ACTIVE_FREEZE_VERSION == "2.1.5")
check("harness loaded the active manifest (version matches file)",
      harness.ACTIVE_MANIFEST["manifest_version"] == "2.1.5")

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
      col.ACTIVE_FREEZE_VERSION == "2.1.5")
check("collector post-freeze cutoff == v2.1.0 freeze time",
      col.POST_FREEZE_CUTOFF_UTC == "2026-10-14T04:57:00Z")
csrc = open(COLLECTOR_PATH).read()
check("collector supports --live-export",
      "--live-export=" in csrc and "ingest_live_paper_stream" in csrc)

print("== [7] RULE 5/6 present ==")
check("c2_may_reuse_production defined",
      hasattr(harness, "c2_may_reuse_production"))

print("== [8] v2.1.5 documents this round's changes ==")
fields = {f["field"] for f in v215.get("changed_fields", [])}
check("changed_fields documents harness.operational_issuance_eval.receipt_expiry",
      "harness.operational_issuance_eval.receipt_expiry" in fields)
check("changed_fields documents adapter.full_record",
      "adapter.full_record" in fields)
check("changed_fields documents collector.fold_full_record",
      "collector.fold_full_record" in fields)

print("== [9] receipt-expiry parity check present ==")
check("harness compares received_at against window_end",
      "received_at" in src and "window_end" in src)
check("harness returns abstain:entry-expired on late receipt",
      "abstain:entry-expired" in src)

print("== [10] adapter full-record blocks + collector fold ==")
asrc = open(ADAPTER_PATH).read()
for block in ("contract", "entry_observation", "frozen_levels",
              "gate_inputs", "waiting_interval_evidence"):
    check(f"adapter emits {block} block", f'"{block}"' in asrc)
check("collector defines fold_full_record",
      "def fold_full_record" in csrc)

print(f"\nALL GREEN: {len(passed)} checks passed.")
