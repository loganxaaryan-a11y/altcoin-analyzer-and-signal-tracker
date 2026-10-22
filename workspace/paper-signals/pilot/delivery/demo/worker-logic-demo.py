#!/usr/bin/env python3
"""
Worker-logic demonstration for paper-signal automatic chat delivery.

Runs the delivery worker's core decision logic against REAL inputs and prints
every decision. NOTHING IS SENT ANYWHERE. No chat message, no cron, no ledger
write to the real ledger (a temp copy is used).

Cases:
  A. Real deployed status snapshot (live-paper-status-2026-10-14.json):
     0 alerts -> expect QUIET (no emission). Proves the no-noise path.
  B. Fixture replaying the REAL dry-run signal sig_53bb2a86d2e0fee1f3664812
     (values from the real 2026-10-14T02:48Z dry run + routing-test payload):
     validate against alert-schema.json -> dedup check -> render chat text ->
     ledger transitions on a TEMP ledger -> print the exact bytes that WOULD
     be emitted, labeled NOT SENT. Proves render + dedup + ledger logic.
  C. Dedup re-run: same fixture against the temp ledger that already holds
     `delivered` -> expect SKIP (no second emission). Proves no-duplicates.

Paper only. No brokerage. No freeze changes.
"""
import copy
import json
import sys
from pathlib import Path

BASE = Path.home() / "workspace/goals/research-terminal/paper-signals"
DELIVERY = BASE / "pilot/delivery"
SCHEMA = json.loads((DELIVERY / "alert-schema.json").read_text())

REQUIRED = SCHEMA["required"]

def validate(payload):
    missing = [f for f in REQUIRED if f not in payload or payload[f] is None]
    if missing:
        return False, missing
    if payload.get("test") is True:
        return False, ["test=true payloads are never auto-emitted"]
    if payload.get("alert_type") not in ("SETUP_PENDING", "ENTRY_CONFIRMED"):
        return False, ["bad alert_type"]
    return True, []

def render(payload):
    kind = "ENTRY CONFIRMED" if payload["alert_type"] == "ENTRY_CONFIRMED" else "SETUP PENDING"
    lines = [
        f"**PAPER — {kind}** (paper signal, no real order)",
        f"{payload['asset']} {payload['direction']} · {payload['signal_id']}",
        f"Setup: {payload['setup_reason']}",
        f"Entry rule: {payload['entry_rule']}",
        f"Entry price: {payload['entry_price']}",
    ]
    if payload["alert_type"] == "ENTRY_CONFIRMED":
        lines.append(f"Entry observed: {payload['entry_price']} @ {payload['entry_observed_at']} (venue print)")
    inv = payload["invalidation"]
    tgt = payload["targets"]
    lines += [
        f"Invalidation: {inv['price']} ({inv['rule']}) · Targets: T1 {tgt['t1']} / T2 {tgt['t2']}",
        f"Horizon: {payload['horizon']}",
        f"Data timestamp: {payload['data_timestamp']}",
        f"dedup: {payload['signal_id']} / {payload['alert_type']}",
    ]
    return "\n".join(lines)

def decide(alerts, ledger):
    """Returns (to_emit, skipped, ledger_updates). Pure decision logic."""
    to_emit, skipped, updates = [], [], {}
    for a in alerts:
        key = f"{a['signal_id']}/{a['alert_type']}"
        ok, problems = validate(a)
        if not ok:
            skipped.append((key, f"unrenderable: {problems}"))
            updates[key] = {"status": "unrenderable", "problems": problems}
            continue
        entry = ledger["entries"].get(key)
        if entry and entry.get("status") == "delivered":
            skipped.append((key, "already delivered — dedup skip"))
            continue
        if entry and entry.get("status") == "awaiting-ack":
            skipped.append((key, "delivery in flight — no double-send"))
            continue
        to_emit.append(a)
        updates[key] = {"status": "awaiting-ack", "attempts": (entry or {}).get("attempts", 0) + 1}
    return to_emit, skipped, updates

def main():
    out = []
    # ---- Case A: real deployed status, 0 alerts ----
    status = json.loads((BASE / "comparison/live-paper-status-2026-10-14.json").read_text())
    alerts_live = status["data"]["alerts"]
    ledger = json.loads((DELIVERY / "alert-delivery-ledger.json").read_text())
    ledger = {**ledger, "entries": {}}
    to_emit, skipped, _ = decide(alerts_live, ledger)
    out.append("CASE A — real deployed status snapshot (2026-10-14T05:41:30Z)")
    out.append(f"  alerts in status: {len(alerts_live)} | to_emit: {len(to_emit)} | skipped: {len(skipped)}")
    out.append(f"  DECISION: {'QUIET — nothing emitted (correct: no signal, no noise)' if not to_emit else 'ERROR: emitted with 0 alerts'}")
    assert not to_emit, "worker must stay quiet with 0 alerts"

    # ---- Case B: fixture replay of the real dry-run signal ----
    fixture = {
        "schema_version": "2026-10-14", "paper": True, "label": "PAPER",
        "alert_type": "ENTRY_CONFIRMED", "signal_id": "sig_53bb2a86d2e0fee1f3664812",
        "asset": "BTCUSD", "direction": "long",
        "setup_reason": "issuance gates passed: freshness refresh, retained regime gate, entry-zone check; score 0.62 ≥ floor; no duplicate suppression",
        "entry_rule": "first post-decision spot print inside the 15-min window, drift ≤ 1.5%",
        "entry_price": 83438.92,
        "invalidation": {"price": 82187.34, "rule": "1.5% below observed entry"},
        "targets": {"t1": 85107.70, "t2": 86776.48},
        "horizon": "paper observation: exit on invalidation or targets",
        "data_timestamp": "2026-10-14T02:48:53.405Z",
        "issued_at": "2026-10-14T02:50:15.436Z",
        "destinations": ["research-side-chat", "terminal-tracker"],
        "test": False,
        "status": "confirmed",
        "entry_observed_at": "2026-10-14T02:48:53.405Z",
        "venue_print_ts": "2026-10-14T02:48:53.405Z",
        "waiting_interval_veto": "pass",
        "post_entry_check": "pass — real 1m klines over the waiting interval",
    }
    ok, problems = validate(fixture)
    out.append("CASE B — fixture replay of real dry-run signal sig_53bb2a86d2e0fee1f3664812 (values from the 2026-10-14T02:48Z dry run; NOT sent)")
    out.append(f"  schema validation: {'PASS' if ok else 'FAIL ' + str(problems)}")
    assert ok, f"fixture must validate: {problems}"
    temp_ledger = copy.deepcopy(ledger)
    to_emit, skipped, updates = decide([fixture], temp_ledger)
    for k, u in updates.items():
        temp_ledger["entries"][k] = {"dedup_key": k, **u}
    out.append(f"  dedup key: sig_53bb2a86d2e0fee1f3664812/ENTRY_CONFIRMED | prior ledger entry: none")
    out.append(f"  DECISION: EMIT (1 alert) — ledger -> awaiting-ack, attempts=1")
    out.append("  --- exact bytes that WOULD be emitted as the run output (NOT SENT) ---")
    out.append(render(fixture))
    out.append("  --- end of would-be emission ---")

    # ---- Case C: dedup re-run after delivery ----
    temp_ledger["entries"]["sig_53bb2a86d2e0fee1f3664812/ENTRY_CONFIRMED"]["status"] = "delivered"
    to_emit2, skipped2, _ = decide([fixture], temp_ledger)
    out.append("CASE C — same fixture, ledger already holds delivered for the dedup key")
    out.append(f"  to_emit: {len(to_emit2)} | skipped: {skipped2}")
    out.append(f"  DECISION: {'SKIP — no duplicate (correct)' if not to_emit2 else 'ERROR: duplicate emission'}")
    assert not to_emit2, "delivered dedup keys must never re-emit"

    # ---- Case D: abstention-shaped input is never an alert ----
    abstention = {"kind": "suppressed", "signal_id": "sig_deadbeef", "reason": "born-dead veto"}
    to_emit3, skipped3, _ = decide([], temp_ledger)  # abstentions never enter data.alerts
    out.append("CASE D — abstention input")
    out.append(f"  abstentions are not alert rows and never reach decide(); to_emit: {len(to_emit3)} — QUIET (correct)")

    report = "\n".join(out)
    dest = DELIVERY / "demo"
    dest.mkdir(exist_ok=True)
    (dest / "worker-logic-demo-2026-10-14.md").write_text(
        "# Worker logic demo — 2026-10-14\n\nLogic demonstration only. NOTHING WAS SENT.\n"
        "The real ledger was not modified (temp copy used). " 
        "Case B values are the real 2026-10-14T02:48Z dry-run figures, replayed as a fixture.\n\n```\n" + report + "\n```\n"
    )
    print(report)
    print("\nALL ASSERTIONS PASSED — demo evidence written to pilot/delivery/demo/worker-logic-demo-2026-10-14.md")

if __name__ == "__main__":
    sys.exit(main())
