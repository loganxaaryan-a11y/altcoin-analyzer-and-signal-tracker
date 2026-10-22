#!/usr/bin/env python3
"""Paper entry prompt trigger — code-gated fresh-key + dispatchability decision (steps 3/3b/3c).
Read-only: snapshot, state, both ledgers. Prints JSON decision to stdout.
Usage: trigger-fresh-keys.py <snapshot_json> <state_json> <prod_ledger> <test_ledger>
"""
import json, sys, time
from datetime import datetime, timezone

TERMINAL = {"delivered", "suppressed", "failed", "unknown", "unrenderable"}
FRESH_CAP_S = 900
SKEW_S = 60

def parse_ts(s):
    if not s:
        return None
    try:
        return datetime.fromisoformat(str(s).replace("Z", "+00:00")).timestamp()
    except Exception:
        return None

def main():
    snap_p, state_p, prod_p, test_p = sys.argv[1:5]
    now = time.time()
    snap = json.load(open(snap_p))
    state = json.load(open(state_p))
    prod = json.load(open(prod_p)).get("entries", {})
    testl = json.load(open(test_p)).get("entries", {})
    alerts = snap["data"]["alerts"]
    watermark_ep = parse_ts(state["watermark_issued_at"])
    triggered = set(state.get("triggered_keys", []))
    visible_ids = set()

    rows = []
    max_issued_ep = None
    max_issued_iso = None
    for r in alerts:
        pj = r.get("payloadJson")
        if isinstance(pj, str):
            try:
                pj = json.loads(pj)
            except Exception:
                pj = {}
        pj = pj or {}
        signal_id = pj.get("signal_id") or r.get("paperSignalId")
        alert_type = pj.get("alert_type") or r.get("eventType")
        issued_iso = pj.get("issued_at") or r.get("enqueuedAt") or r.get("createdAt")
        issued_ep = parse_ts(issued_iso)
        is_test = pj.get("test", r.get("test", False)) is True
        if signal_id:
            visible_ids.add(signal_id)
        if issued_ep is not None and (max_issued_ep is None or issued_ep > max_issued_ep):
            max_issued_ep = issued_ep
            max_issued_iso = issued_iso
        rows.append({"signal_id": signal_id, "alert_type": alert_type,
                     "issued_iso": issued_iso, "issued_ep": issued_ep, "is_test": is_test})

    fresh, stale_skipped = [], []
    for row in rows:
        sid, atype, iep, iso = row["signal_id"], row["alert_type"], row["issued_ep"], row["issued_iso"]
        if atype != "ENTRY_CONFIRMED" or not sid or iep is None:
            continue
        if iep <= watermark_ep:
            continue
        if iep > now + SKEW_S:
            continue  # future-dated beyond skew guard: not fresh, not stale-counted
        if (now - iep) > FRESH_CAP_S:
            stale_skipped.append(f"{sid}/ENTRY_CONFIRMED")
            continue
        key = f"{sid}/ENTRY_CONFIRMED"
        tkey = f"test/{key}"
        if key in triggered or key in prod or tkey in testl:
            continue
        fresh.append({"key": key, "signal_id": sid, "issued_at": iso,
                      "issued_ep": iep, "test": row["is_test"]})

    dispatchable, disp_skipped = [], []
    for fk in fresh:
        key, sid, iep = fk["key"], fk["signal_id"], fk["issued_ep"]
        if sid not in visible_ids:
            disp_skipped.append(f"{key}: triggered_key_not_visible"); continue
        st = (prod.get(key) or {}).get("delivery_status")
        if st in TERMINAL:
            disp_skipped.append(f"{key}: terminal_in_ledger({st})"); continue
        if now > iep + FRESH_CAP_S:
            disp_skipped.append(f"{key}: skipped_expired"); continue
        dispatchable.append(fk)

    prod_batch = [d for d in dispatchable if not d["test"]]
    test_batch = [d for d in dispatchable if d["test"]]
    latest = max([d["issued_ep"] for d in dispatchable], default=None)

    def iso(ep):
        return datetime.fromtimestamp(ep, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ") if ep else None

    print(json.dumps({
        "alerts_seen": len(alerts),
        "fresh_keys": [f["key"] for f in fresh],
        "stale_fresh_keys_skipped": len(stale_skipped),
        "stale_keys": stale_skipped,
        "dispatchability_skipped": disp_skipped,
        "dispatchable_prod": [d["key"] for d in prod_batch],
        "dispatchable_test": [d["key"] for d in test_batch],
        "latest_dispatchable_issued_at": iso(latest),
        "max_issued_at_seen": max_issued_iso,
        "max_issued_ep_seen": max_issued_ep,
        "watermark_issued_at": state["watermark_issued_at"],
        "now_iso": iso(now),
    }))

main()
