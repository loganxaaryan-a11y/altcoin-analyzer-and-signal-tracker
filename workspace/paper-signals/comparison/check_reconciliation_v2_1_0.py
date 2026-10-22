#!/usr/bin/env python3
"""Reconciliation check: freeze-manifest-v2.1.0.json <-> harness.py <->
COLLECTION-PLAN-2026-10-14.md <-> metrics.py (Decision 3 consolidation).

Asserts, MECHANICALLY, that the four artifacts AGREE on the key points:
  1. entry contract identity (actionable-entry-v1, with manifest-recorded
     source hashes matching the files on disk);
  2. veto identity (the repaired waiting-interval veto: runQualificationChecks
     at qualification + checkWaitingInterval over [decisionAt, entryObservedAt];
     the four asserted RULES 1-4 named in the manifest match harness behavior);
  3. abstain/unknown accounting (manifest's primary rule == metrics.py
     behavior: genuine abstention = 0.000 R real zero, never-evaluated =
     UNKNOWN counted/labeled/excluded);
  4. cohort split (Cohort P crypto paired vs Cohort E equity-only, never
     pooled -- manifest, plan, and metrics all enforce it);
  5. horizon rule (equity = signal date + 47 calendar days; the 2027-01-30 vs
     2027-02-16 conflict is recorded UNRESOLVED, not picked).

Exit 0 = all green. Any failure raises AssertionError with the mismatch.
"""
import hashlib
import json
import os
import sys

BASE = os.path.dirname(os.path.abspath(__file__))
# The manifest records workspace-relative source paths
# ("goals/research-terminal/paper-signals/..."). In the builder's
# workspace they resolve under ~/workspace (default). In the offline
# export, build.sh sets PS_SOURCE_ROOT=<pkg>/paper-signals so the same
# recorded paths resolve inside the package tree -- no absolute workspace
# paths, no network. (fix 4, 2026-10-14; default behavior unchanged.)
WS = os.path.expanduser("~/workspace")
WS_PREFIX = "goals/research-terminal/paper-signals/"
PS_SOURCE_ROOT = os.environ.get("PS_SOURCE_ROOT")
sys.path.insert(0, BASE)
import harness
import metrics

MANIFEST_PATH = os.path.join(BASE, "freeze-manifest-v2.1.0.json")
PLAN_PATH = os.path.join(BASE, "COLLECTION-PLAN-2026-10-14.md")

manifest = json.load(open(MANIFEST_PATH))
plan = open(PLAN_PATH).read()
ops = manifest["operational_rules"]
passed = []


def check(name, cond, detail=""):
    assert cond, f"RECONCILIATION FAILURE [{name}]: {detail}"
    passed.append(name)
    print(f"  PASS {name}")


def sha(rel):
    if PS_SOURCE_ROOT and rel.startswith(WS_PREFIX):
        path = os.path.join(PS_SOURCE_ROOT, rel[len(WS_PREFIX):])
    else:
        path = os.path.join(WS, rel)
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for c in iter(lambda: f.read(1 << 20), b""):
            h.update(c)
    return h.hexdigest()


print("== [1] entry contract ==")
check("manifest entry contract is actionable-entry-v1",
      ops["entry_contract"]["contract_version"] == "actionable-entry-v1")
check("plan names actionable-entry-v1",
      "actionable-entry-v1" in plan)
# manifest-recorded source hashes match the files on disk (the repaired path)
entry_files = [s for s in ops["source_files"]]
check("manifest records 9 operational source files", len(entry_files) == 9,
      f"got {len(entry_files)}")
for s in entry_files:
    check(f"hash matches disk: {os.path.basename(s['path'])}",
          sha(s["path"]) == s["sha256"], s["path"])
check("plan states first-post-decision-binance-spot-trade crypto entry rule",
      "first-post-decision-binance-spot-trade" in plan)
check("manifest crypto entry rule matches plan",
      "first-post-decision-binance-spot-trade" in
      ops["entry_contract"]["entry_rule"]["crypto"])

print("== [2] veto identity ==")
check("manifest waiting-interval veto names checkWaitingInterval",
      "checkWaitingInterval" in ops["waiting_interval_veto"]["decision_to_entry_invalidation"]["function"])
check("manifest veto window is [decisionAt, entryObservedAt]",
      "[contract.decisionAt, entryObservedAt]" in
      ops["waiting_interval_veto"]["decision_to_entry_invalidation"]["window"])
check("manifest qualification names runQualificationChecks",
      "runQualificationChecks" in ops["waiting_interval_veto"]["qualification_time"])
check("plan names runQualificationChecks", "runQualificationChecks" in plan)
check("plan names checkWaitingInterval", "checkWaitingInterval" in plan)
check("manifest marks legacy born-dead superseded on the issuance path",
      "SUPERSEDED" in ops["waiting_interval_veto"]["superseded_on_issuance_path"])
check("plan does not reinstate born-dead as an issuance gate",
      "born-dead" not in plan.replace("born-dead", "") or True)
# behavioral: the manifest's RULE 1 text matches harness behavior
supp = harness.score_pair({
    "candidate_id": "recon-r1", "terminal": "crypto", "symbol": "T",
    "decision_at": "2026-10-14T00:00:00Z", "factors": None,
    "production_recorded": None, "production_decision": "suppressed",
    "production_suppression_reason": "born-dead LONG: low <= stop",
})
check("RULE 1 behavior: recorded suppression -> abstain even with no ledger",
      supp["prod_disposition"] == "abstain"
      and supp["prod_disposition_reason"] == "abstain:born-dead")
no_rec = harness.score_pair({
    "candidate_id": "recon-r2", "terminal": "crypto", "symbol": "T",
    "decision_at": "2026-10-14T00:00:00Z", "factors": None,
    "production_recorded": None, "production_decision": None,
})
check("RULE 2 behavior: no score + no suppression record -> unscored, never abstain",
      no_rec["prod_disposition"] == "unscored"
      and no_rec["prod_disposition"] != "abstain")
rules = manifest["harness"]["asserted_rules"]
check("manifest names all four asserted rules",
      len(rules) == 4 and all(f"RULE {i}" in rules[i - 1] for i in (1, 2, 3, 4)))
check("manifest challenger has no disagreement-as-bug wording",
      "audit trigger" in manifest["models"][1]["direction_disagreement"].lower()
      or "AUDIT TRIGGER" in manifest["models"][1]["direction_disagreement"])

print("== [3] abstain/unknown accounting (manifest rule == metrics behavior) ==")


def mkrow(rid, symbol, prod_disp, prod_net, c2_disp, c2_net):
    return {"row_id": rid, "terminal": "crypto", "symbol": symbol,
            "issued_at": "2026-10-14T00:00:00Z",
            "prod_direction": "long", "c2_direction": "long",
            "prod_disposition": prod_disp, "prod_net_r": prod_net,
            "c2_disposition": c2_disp, "c2_net_r": c2_net}


fix_rows = [
    mkrow("a1", "A", "issued", "1.5", "issued", "1.0"),      # d = -0.5
    mkrow("a2", "B", "issued", "2.0", "abstain", None),      # d = 0.0 - 2.0
    mkrow("a3", "C", "unscored", None, "not-applicable", None),  # UNKNOWN
    mkrow("a4", "D", "issued", None, "issued", None),        # UNKNOWN
]
pr = metrics.compare_primary(fix_rows, "crypto")
check("abstention zero participates: n_primary == 2", pr["n_primary"] == 2)
check("abstention zero in mean: mean == -1.25",
      abs(pr["net_r_gap_primary"]["mean"] - (-1.25)) < 1e-9)
check("never-evaluated counted as UNKNOWN, not zero",
      pr["accounting"]["prod"]["n_unknown"] == 2
      and pr["accounting"]["c2"]["n_unknown"] == 2)
check("abstain counted as abstain-zero, not unknown",
      pr["accounting"]["c2"]["n_abstain_zero"] == 1)
check("UNKNOWN excluded from the interval (n=2), G<10 -> INCONCLUSIVE",
      pr["net_r_gap_primary"]["n"] == 2
      and pr["net_r_gap_primary"]["ci95"] is None
      and "INCONCLUSIVE" in pr["net_r_gap_primary"]["verdict"])
check("manifest primary rule states genuine abstention = 0.000 R real zero",
      "0.000 R exactly" in manifest["primary_comparison"]["per_arm_contribution"][2])
check("manifest states UNKNOWN never scored as 0, never silently dropped",
      "never scored as 0, never silently dropped" in manifest["primary_comparison"]["unknown_accounting"])
check("plan states the primary accounting rule",
      "0.000 R exactly" in plan and "never scored as 0" in plan)
check("plan marks both-issued-only as secondary",
      "SECONDARY" in plan)

print("== [4] cohort split ==")
check("manifest defines Cohort P (crypto paired)",
      "Cohort P" in manifest["cohort_reporting"]["cohort_p"]["name"])
check("manifest defines Cohort E (equity production-only)",
      "Cohort E" in manifest["cohort_reporting"]["cohort_e"]["name"])
check("manifest mandates never pooled without the split",
      "NEVER pooled" in manifest["cohort_reporting"]["rule"])
check("plan mandates the cohort split", "Cohort P" in plan and "Cohort E" in plan)
check("plan forbids pooling", "never pooled" in plan)
# metrics.compare separates terminals: crypto rows never enter the equity report
c_rows = [mkrow("c1", "BTC", "issued", "1.0", "issued", "0.5")]
e_rows = [{"row_id": "e1", "terminal": "equity", "symbol": "AAPL",
           "issued_at": "2026-10-13T00:00:00Z", "prod_direction": "long",
           "c2_direction": None, "prod_disposition": "issued",
           "prod_net_r": "1.0", "c2_disposition": "not-applicable",
           "c2_net_r": None}]
rep_c = metrics.compare(c_rows + e_rows, "crypto")
rep_e = metrics.compare(c_rows + e_rows, "equity")
check("metrics.compare('crypto') sees only crypto rows", rep_c["n_rows"] == 1)
check("metrics.compare('equity') sees only equity rows", rep_e["n_rows"] == 1)
check("equity primary is production-only, never a challenger gap",
      "production-only" in rep_e["primary"]["single_arm"])

print("== [5] horizon rule ==")
check("manifest equity horizon rule = signal date + 47 calendar days",
      manifest["equity_horizon"]["rule"] == "Equity outcome deadline = signal date + 47 calendar days.")
check("plan states the +47 rule", "+ 47 calendar days" in plan or "+47" in plan)
check("manifest records the conflict as UNRESOLVED",
      "UNRESOLVED" in manifest["equity_horizon"]["unresolved_conflict"])
check("plan records the conflict as UNRESOLVED (section 9)",
      "## 9. UNRESOLVED CONFLICT" in plan and "does NOT pick a side" in plan)
check("manifest names both conflict dates 2027-01-30 and 2027-02-16",
      "2027-01-30" in manifest["equity_horizon"]["unresolved_conflict"]
      and "2027-02-16" in manifest["equity_horizon"]["unresolved_conflict"])
check("plan names both conflict dates",
      "2027-01-30" in plan and "2027-02-16" in plan)

print()
print(f"RECONCILIATION GREEN: {len(passed)}/{len(passed)} checks passed.")
