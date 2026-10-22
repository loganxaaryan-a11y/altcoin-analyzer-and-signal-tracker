#!/usr/bin/env python3
"""Regression test: delayed-sweep SETUP_PENDING suppression (§6a guard).

Covers the exact 2026-10-16 defect: the sweep-fallback delivered
pending_50/SETUP_PENDING (BTC) and pending_51/SETUP_PENDING (NEAR) AFTER their
entry windows expired (13:12:44.557Z) and AFTER both setups had entered
(ENTRY_CONFIRMED channel-acked 13:11:06Z).

The guard decision table below MIRRORS the §6a prose in the
paper-signal-alert-delivery cron body, check for check, in the same order:
  (a) setup entered  -> suppress, reason "setup_entered"
  (b) entry window expired -> suppress, reason "entry_window_expired"
  (c) setup voided -> suppress, reason "setup_voided"
Suppressed keys get a terminal "suppressed" ledger entry with reason + evidence;
they are never pre-committed as awaiting-ack and never emitted.

Synthetic fixtures only — no artifact, no network, no filesystem writes.
Exit 0 on pass, non-zero on fail.
"""

from datetime import datetime, timezone, timedelta

ENTRY_WINDOW = timedelta(minutes=15)

# ---- Observed facts from handoff 14 (discovery run 79), 2026-10-16 ----
DECISION_AT = datetime(2026, 10, 16, 12, 57, 44, 557000, tzinfo=timezone.utc)
WINDOW_CLOSE = DECISION_AT + ENTRY_WINDOW            # 13:12:44.557Z
ISSUED_AT = datetime(2026, 10, 16, 12, 59, 55, tzinfo=timezone.utc)
ENTRY_CONFIRMED_ACK = datetime(2026, 10, 16, 13, 11, 6, tzinfo=timezone.utc)
SWEEP_EVAL_AT = datetime(2026, 10, 16, 13, 19, 36, tzinfo=timezone.utc)  # the late sweep


def guard(signal_id, alert_type, now, alerts_visible, ledger, signal_row):
    """Mirror of §6a. Returns (action, reason, evidence).

    action: "dispatch" | "suppress" | "passthrough" (guard does not apply)
    """
    if alert_type != "SETUP_PENDING":
        return ("passthrough", None, {"note": "guard applies to SETUP_PENDING only"})
    s = signal_id
    # (a) setup entered
    entry_key = f"{s}/ENTRY_CONFIRMED"
    if entry_key in alerts_visible:
        return ("suppress", "setup_entered",
                {"check": "(a)", "entry_confirmed_row": entry_key})
    leg = ledger.get(entry_key)
    if leg and leg.get("delivery_status") in ("delivered", "awaiting-ack"):
        return ("suppress", "setup_entered",
                {"check": "(a)", "entry_confirmed_ledger_status": leg["delivery_status"]})
    # (b) entry window expired
    decision_at = signal_row.get("decisionAt")
    evidence = {"check": "(b)"}
    if decision_at is None:
        window_close = signal_row["issued_at"] + ENTRY_WINDOW
        evidence["decision_at_unavailable"] = True
    else:
        window_close = decision_at + ENTRY_WINDOW
    evidence["window_close_utc"] = window_close.isoformat()
    evidence["now_utc"] = now.isoformat()
    if now > window_close:
        return ("suppress", "entry_window_expired", evidence)
    # (c) setup voided
    lifecycle = signal_row.get("lifecycle_state")
    if lifecycle in ("void_first_print_missed", "voided", "expired"):
        return ("suppress", "setup_voided",
                {"check": "(c)", "lifecycle_state": lifecycle})
    return ("dispatch", None, {"window_close_utc": window_close.isoformat()})


def history_entry(signal_id, alert_type, reason, evidence, now):
    """The retained history record for a suppressed key (never awaiting-ack)."""
    return {
        "signal_id": signal_id,
        "alert_type": alert_type,
        "delivery_status": "suppressed",
        "suppression_reason": reason,
        "suppressed_at_utc": now.isoformat(),
        "guard_evidence": evidence,
    }


failures = []


def check(name, cond, detail=""):
    if cond:
        print(f"PASS: {name}")
    else:
        print(f"FAIL: {name} {detail}")
        failures.append(name)


# ---- Case 1: exact handoff-79 defect — both suppressed, entered takes precedence ----
alerts = {"pending_50/ENTRY_CONFIRMED", "pending_51/ENTRY_CONFIRMED",
          "pending_50/SETUP_PENDING", "pending_51/SETUP_PENDING"}
ledger = {
    "pending_50/ENTRY_CONFIRMED": {"delivery_status": "delivered"},
    "pending_51/ENTRY_CONFIRMED": {"delivery_status": "delivered"},
}
for sid in ("pending_50", "pending_51"):
    action, reason, ev = guard(
        sid, "SETUP_PENDING", SWEEP_EVAL_AT, alerts, ledger,
        {"decisionAt": DECISION_AT, "issued_at": ISSUED_AT})
    check(f"{sid} suppressed (delayed sweep)", action == "suppress", f"got {action}")
    check(f"{sid} reason is setup_entered (check (a) first)",
          reason == "setup_entered", f"got {reason}")
    h = history_entry(sid, "SETUP_PENDING", reason, ev, SWEEP_EVAL_AT)
    check(f"{sid} history entry terminal suppressed",
          h["delivery_status"] == "suppressed" and "suppression_reason" in h)
    check(f"{sid} never pre-committed as awaiting-ack",
          h["delivery_status"] != "awaiting-ack")

# ---- Case 2: expired, not entered — reason must be entry_window_expired ----
action, reason, ev = guard(
    "pending_99", "SETUP_PENDING", SWEEP_EVAL_AT, set(), {},
    {"decisionAt": DECISION_AT, "issued_at": ISSUED_AT})
check("expired-not-entered suppressed", action == "suppress")
check("expired-not-entered reason", reason == "entry_window_expired", f"got {reason}")
check("expiry evidence carries window_close vs now",
      ev.get("window_close_utc") == WINDOW_CLOSE.isoformat()
      and ev.get("now_utc") == SWEEP_EVAL_AT.isoformat(), str(ev))

# ---- Case 3: live setup inside window — dispatchable, guard does not suppress ----
live_now = DECISION_AT + timedelta(minutes=5)
action, reason, ev = guard(
    "pending_99", "SETUP_PENDING", live_now, set(), {},
    {"decisionAt": DECISION_AT, "issued_at": ISSUED_AT})
check("live setup dispatches", action == "dispatch", f"got {action}/{reason}")

# ---- Case 4: voided setup inside window — suppress with setup_voided ----
action, reason, ev = guard(
    "pending_99", "SETUP_PENDING", live_now, set(), {},
    {"decisionAt": DECISION_AT, "issued_at": ISSUED_AT,
     "lifecycle_state": "void_first_print_missed"})
check("voided setup suppressed", action == "suppress")
check("voided reason", reason == "setup_voided", f"got {reason}")

# ---- Case 5: ENTRY_CONFIRMED passes through the guard untouched ----
action, reason, ev = guard(
    "pending_50", "ENTRY_CONFIRMED", SWEEP_EVAL_AT, alerts, ledger,
    {"decisionAt": DECISION_AT, "issued_at": ISSUED_AT})
check("ENTRY_CONFIRMED passthrough", action == "passthrough", f"got {action}")

# ---- Case 6: decisionAt unavailable — falls back to issued_at + 15m with note ----
action, reason, ev = guard(
    "pending_99", "SETUP_PENDING",
    ISSUED_AT + timedelta(minutes=16), set(), {},
    {"decisionAt": None, "issued_at": ISSUED_AT})
check("decisionAt-fallback suppressed", action == "suppress")
check("decisionAt-fallback reason", reason == "entry_window_expired", f"got {reason}")
check("decisionAt-fallback noted",
      ev.get("decision_at_unavailable") is True, str(ev))

# ---- Case 7: entered via ledger awaiting-ack (not only delivered) ----
action, reason, ev = guard(
    "pending_99", "SETUP_PENDING", live_now, set(),
    {"pending_99/ENTRY_CONFIRMED": {"delivery_status": "awaiting-ack"}},
    {"decisionAt": DECISION_AT, "issued_at": ISSUED_AT})
check("awaiting-ack entry also suppresses setup",
      action == "suppress" and reason == "setup_entered", f"got {action}/{reason}")

print()
if failures:
    print(f"{len(failures)} FAILURE(S): {failures}")
    raise SystemExit(1)
print("All regression checks passed.")
