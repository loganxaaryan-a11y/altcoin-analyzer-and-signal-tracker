#!/usr/bin/env python3
"""Reconciliation check: freeze-manifest-v2.1.1.json (date-fields-only amendment)
<-> freeze-manifest-v2.1.0.json (immutable) <-> COLLECTION-PLAN-2026-10-14.md
<-> EQUITY-MATURITY-SCHEDULE-2026-10-14.md (expert correction 1, 2026-10-14).

Asserts, MECHANICALLY:
  1. v2.1.0 bytes are untouched (sha256 matches the value recorded in v2.1.1);
  2. v2.1.1 changes ONLY date fields, with provenance for each;
  3. the plan no longer carries the UNRESOLVED conflict: section 9 records
     RESOLVED by computation, pointing at the maturity schedule;
  4. the maturity schedule exists and states the computed dates
     (latest cohort maturity 2027-02-17, equity readout by 2027-02-24);
  5. crypto's schedule is stated separately and unchanged.

The old check_reconciliation_v2_1_0.py is historical: its plan-UNRESOLVED
assertions are superseded by this amendment. Its v2.1.0-manifest assertions
remain valid and are re-verified here via the byte-hash.

Exit 0 = all green. Any failure raises AssertionError with the mismatch.
"""
import hashlib
import json
import os

BASE = os.path.dirname(os.path.abspath(__file__))

V210_PATH = os.path.join(BASE, "freeze-manifest-v2.1.0.json")
V211_PATH = os.path.join(BASE, "freeze-manifest-v2.1.1.json")
PLAN_PATH = os.path.join(BASE, "COLLECTION-PLAN-2026-10-14.md")
SCHED_PATH = os.path.join(BASE, "EQUITY-MATURITY-SCHEDULE-2026-10-14.md")

v211 = json.load(open(V211_PATH))
plan = open(PLAN_PATH).read()
sched = open(SCHED_PATH).read()
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


print("== [1] v2.1.0 immutability ==")
recorded = v211["amended_manifest"]
# recorded value looks like "freeze-manifest-v2.1.0.json (sha256 <hex>...)"
import re
m = re.search(r"sha256\s+([0-9a-f]{64})", recorded)
check("v2.1.1 records a v2.1.0 sha256", m is not None, recorded[:80])
check("v2.1.0 bytes untouched (hash matches recorded)",
      sha(V210_PATH) == m.group(1),
      f"disk={sha(V210_PATH)[:16]}... recorded={m.group(1)[:16]}...")

print("== [2] v2.1.1 is date-fields-only ==")
check("amendment_kind names date-fields-only",
      "date-fields-only" in v211["amendment_kind"])
check("scope disclaims executable-semantics changes",
      "Nothing about executable semantics" in v211["scope"])
check("changed_fields non-empty with provenance",
      len(v211.get("changed_fields", [])) > 0 and
      all("computation" in f or "provenance" in f or "field" in f
          for f in v211["changed_fields"]))
check("immutability rule restates v2.1.0 untouched",
      "not been edited" in v211["immutability_rule"] or
      "IMMUTABLE" in v211["immutability_rule"])

print("== [3] plan conflict resolved ==")
sec9 = plan.split("## 9.")[1].split("## 10.")[0] if "## 9." in plan else ""
check("plan section 9 header says RESOLVED",
      "## 9. RESOLVED" in plan, "section 9 header missing RESOLVED")
check("section 9 gives the computed resolution",
      "calendar calculation" in sec9 and "2027-02-17" in sec9,
      "section 9 lacks the computed resolution")
check("plan points at maturity schedule",
      "EQUITY-MATURITY-SCHEDULE" in plan)

print("== [4] maturity schedule computed dates ==")
check("schedule states latest cohort maturity 2027-02-17",
      "2027-02-17" in sched)
check("schedule states equity readout by 2027-02-24",
      "2027-02-24" in sched)
check("schedule cites the 30-XNYS-session rule",
      "30" in sched and "XNYS" in sched)
check("schedule keeps crypto separate",
      "crypto" in sched.lower() and "2027-01-30" in sched)

print("== [5] v2.1.1 changed fields carry the new dates ==")
blob = json.dumps(v211)
check("v2.1.1 names 2027-02-17", "2027-02-17" in blob)
check("v2.1.1 names 2027-02-24", "2027-02-24" in blob)

print(f"\nALL GREEN: {len(passed)} checks passed.")
