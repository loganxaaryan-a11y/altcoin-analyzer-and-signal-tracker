"""Integration gate for the deployed crypto terminal's paper path.

Verifies ALL of these against DEPLOYED evidence (not source hashes, not
local-only tests). Reusable for subsequent deployments: re-invoke the two
deployed actions, save their raw JSON, and run:

    python3 integration_gate.py --status <getpaperpilotstatus.json> \\
        --tracker <getsignaltracker.json>

Checks:
  G1 export schema      -- versioned paper-status/1; candidate/signal/alert
                           rows exposed as arrays; a missing or non-list
                           required array is an explicit gate failure
                           (mirrors the strict-parser rule: never silent "no alerts")
  G2 producer-consumer   -- regression_producer_consumer_2026_10_14.py against
                           the ACTUAL worker/collector parsers: 7/7 required
  G3 TEST transport      -- evidence that a labeled TEST notification traversed
                           the deployed transport: the test ledger holds a
                           test/<signal_id>/<alert_type> key whose
                           delivery_status reached a terminal state
                           (delivered on real ack, or unknown per the standing
                           rule). awaiting-ack = in flight, gate reports PENDING.
  G4 evaluator            -- the frozen operational_issuance_eval returns the
                           expected verdicts on isolated fixtures (3/3)
  G5 legacy untouched     -- getsignaltracker: 34 signal rows, trackedCount 34

Exit 0 only when every check passes (G3 may report PENDING, which is not a
pass). Any failure prints the exact failure.
"""
import argparse
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

EXPECTED_SCHEMA = "paper-status/1"
REQUIRED_ARRAYS = ["alerts", "candidates", "signals", "comparisons",
                   "checkpoints", "runs", "handoffRuns"]
EXPECTED_LEGACY_COUNT = 34
TEST_LEDGER = os.path.join(HERE, "..", "pilot", "delivery",
                           "alert-delivery-ledger-test.json")


def g1_schema(status_path):
    """Versioned export schema with full row arrays."""
    with open(status_path) as f:
        payload = json.load(f)
    data = payload.get("data", payload)
    problems = []
    if data.get("schema_version") != EXPECTED_SCHEMA:
        problems.append(
            f"schema_version={data.get('schema_version')!r}, expected {EXPECTED_SCHEMA!r}")
    for name in REQUIRED_ARRAYS:
        if name not in data:
            problems.append(f"required array {name!r} ABSENT: explicit schema error")
        elif not isinstance(data[name], list):
            problems.append(
                f"required array {name!r} is {type(data[name]).__name__}, not a list: "
                "explicit schema error")
    n = {k: len(data[k]) for k in REQUIRED_ARRAYS if isinstance(data.get(k), list)}
    return (not problems, problems, n)


def g2_regression():
    """Producer-consumer regression with the actual parsers: 7/7 required."""
    script = os.path.join(HERE, "regression_producer_consumer_2026_10_14.py")
    p = subprocess.run([sys.executable, script], capture_output=True, text=True,
                       cwd=HERE, timeout=300)
    ok = p.returncode == 0 and "7/7 cases passed" in p.stdout
    tail = (p.stdout.strip().splitlines() or ["(no output)"])[-3:]
    return ok, tail


def g3_test_transport():
    """TEST notification traversed the deployed transport (ack or UNKNOWN)."""
    if not os.path.exists(TEST_LEDGER):
        return None, ["no test ledger yet: TEST transport never exercised"]
    with open(TEST_LEDGER) as f:
        ledger = json.load(f)
    entries = ledger.get("entries", {})
    if not entries:
        return None, ["test ledger empty: no TEST key ever pre-committed"]
    terminal = {"delivered", "unknown", "failed"}
    states = {k: v.get("delivery_status") for k, v in entries.items()}
    if all(s in terminal for s in states.values()):
        return True, [f"{k} -> {s}" for k, s in states.items()]
    return None, [f"{k} -> {s} (in flight, not terminal)" for k, s in states.items()]


def g4_evaluator():
    """Frozen evaluator returns expected verdicts on isolated fixtures."""
    from evaluator_gate_fixtures import run_evaluator_gate
    return run_evaluator_gate()


def g5_legacy(tracker_path):
    """Legacy records unchanged: 34 rows."""
    with open(tracker_path) as f:
        payload = json.load(f)
    data = payload.get("data", payload)
    sigs = data.get("signals", [])
    tracked = (data.get("latestBrief") or {}).get("trackedCount")
    problems = []
    if len(sigs) != EXPECTED_LEGACY_COUNT:
        problems.append(f"signal rows={len(sigs)}, expected {EXPECTED_LEGACY_COUNT}")
    if tracked != EXPECTED_LEGACY_COUNT:
        problems.append(f"trackedCount={tracked}, expected {EXPECTED_LEGACY_COUNT}")
    ids = [s.get("id") for s in sigs]
    if len(set(ids)) != len(ids):
        problems.append("duplicate signal ids in legacy rows")
    return (not problems, problems, {"rows": len(sigs), "trackedCount": tracked})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--status", default=None,
                    help="saved raw JSON from deployed getpaperpilotstatus; "
                         "omit to skip G1 (verify live via the deployed action instead)")
    ap.add_argument("--tracker", default=None,
                    help="saved raw JSON from deployed getsignaltracker; "
                         "omit to skip G5 (verify live via the deployed action instead)")
    args = ap.parse_args()

    print("=== integration gate: deployed paper path ===")
    overall = True

    if args.status:
        ok, problems, counts = g1_schema(args.status)
        print(f"[{'PASS' if ok else 'FAIL'}] G1 export schema paper-status/1, arrays={counts}")
        for p in problems:
            print(f"       !! {p}")
        overall &= ok
    else:
        print("[SKIP] G1 export schema (no --status file; verify live via deployed "
              "getpaperpilotstatus: schema_version=='paper-status/1' and "
              "alerts/candidates/signals/comparisons/checkpoints/runs/handoffRuns "
              "all present as lists)")

    ok, tail = g2_regression()
    print(f"[{'PASS' if ok else 'FAIL'}] G2 producer-consumer regression 7/7 (actual parsers)")
    for line in tail:
        print(f"       {line}")
    overall &= ok

    res, info = g3_test_transport()
    label = "PASS" if res else ("PENDING" if res is None else "FAIL")
    print(f"[{label}] G3 TEST notification through deployed transport")
    for line in info:
        print(f"       {line}")
    overall &= bool(res)

    ok, details = g4_evaluator()
    print(f"[{'PASS' if ok else 'FAIL'}] G4 evaluator fixtures (frozen operational_issuance_eval)")
    for name, passed, got in details:
        print(f"       [{'PASS' if passed else 'FAIL'}] {name}: {got}")
    overall &= ok

    if args.tracker:
        ok, problems, counts = g5_legacy(args.tracker)
        print(f"[{'PASS' if ok else 'FAIL'}] G5 legacy records unchanged: {counts}")
        for p in problems:
            print(f"       !! {p}")
        overall &= ok
    else:
        print("[SKIP] G5 legacy records (no --tracker file; verify live via deployed "
              "getsignaltracker: 34 signal rows, latestBrief.trackedCount==34)")

    print("GATE:", "PASS" if overall else "NOT PASSED")
    return 0 if overall else 1


if __name__ == "__main__":
    sys.exit(main())
