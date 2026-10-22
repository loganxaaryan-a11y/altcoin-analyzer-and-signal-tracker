"""Integration gate check 4: paper evaluator fixtures.

Runs the ACTUAL frozen operational_issuance_eval from harness.py on isolated
synthetic fixtures (never the vessel, ledgers, or any deployed table).
Expected results are derived from the frozen v2.1.x semantics:

  F1 pass/issued        -- clean long entry, waiting interval clear
  F2 fail/veto          -- post-decision low touches the final published stop
  F3 uncertain/closed   -- non-observable evidence -> fail-closed, never guessed
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness import operational_issuance_eval, REASON


def base_candidate(**over):
    c = {
        "terminal": "crypto",
        "decision_at": "2026-10-14T12:00:00Z",
        "issued_at": "2026-10-14T12:00:30Z",
        "detected_at": "2026-10-14T11:55:00Z",
        "decision_price": 99500.0,
        "entry_venue": "binance-spot",
        "entry_observation": {
            "price": 100000.0,
            "observed_at": "2026-10-14T12:05:00Z",
            "received_at": "2026-10-14T12:05:30Z",
            "venue_label": "binance-spot",
            "evidence": "venue-trade",
        },
        "waiting_interval_bars": [
            {
                "start_at": "2026-10-14T12:01:00Z",
                "end_at": "2026-10-14T12:04:00Z",
                "open": 99800.0, "high": 100200.0,
                "low": 99600.0, "close": 99900.0,
                "granularity": "intraday",
                "label": "fixture-bar-1",
            }
        ],
    }
    c.update(over)
    return c


def run_evaluator_gate():
    """Returns (ok: bool, details: list of (name, passed, got))."""
    details = []

    v, rc, _ = operational_issuance_eval("long", 90000.0, base_candidate())
    details.append(("F1 pass/issued", v == "pass" and rc == REASON["ok"], (v, rc)))

    c2 = base_candidate()
    c2["waiting_interval_bars"][0]["low"] = 89500.0  # touches final stop 90000
    v, rc, _ = operational_issuance_eval("long", 90000.0, c2)
    details.append(("F2 fail/waiting-interval-veto",
                    v == "fail" and rc == REASON["waiting-interval-invalidation"], (v, rc)))

    c3 = base_candidate()
    c3["entry_observation"]["evidence"] = "model-estimate"  # not observable
    v, rc, _ = operational_issuance_eval("long", 90000.0, c3)
    details.append(("F3 uncertain/fail-closed",
                    v == "uncertain" and rc == REASON["issuance-unavailable"], (v, rc)))

    return all(p for _, p, _ in details), details


if __name__ == "__main__":
    ok, details = run_evaluator_gate()
    for name, passed, got in details:
        print(f"  [{'PASS' if passed else 'FAIL'}] {name}: got {got}")
    print("RESULT:", "PASS 3/3" if ok else "FAIL")
    sys.exit(0 if ok else 1)
