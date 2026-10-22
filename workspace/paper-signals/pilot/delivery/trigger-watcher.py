#!/usr/bin/env python3
"""paper-entry-prompt-trigger watcher lane: fresh ENTRY_CONFIRMED key computation.
Reads snapshot (this run's getpaperpilotalerts), state, both ledgers (read-only).
Prints a JSON decision; NEVER fires cron itself (caller decides).
Writes state update + run log atomically. Prunes trigger-runs/ to last 20 by real UTC instant.
"""
import json, os, re, sys, glob
from datetime import datetime, timezone, timedelta

DELIVERY = os.path.expanduser("~/workspace/goals/research-terminal/paper-signals/pilot/delivery")
STATE_P = os.path.join(DELIVERY, "trigger-watcher-state.json")
RUNS_D = os.path.join(DELIVERY, "trigger-runs")
LEDGER_PROD = os.path.join(DELIVERY, "alert-delivery-ledger.json")
LEDGER_TEST = os.path.join(DELIVERY, "alert-delivery-ledger-test.json")

def iso(s):
    if not s:
        return None
    s = str(s).strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(s)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None

def utcnow():
    return datetime.now(timezone.utc)

def main():
    started = utcnow()
    snap_p, out = sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None
    snap = json.load(open(snap_p))
    alerts = snap.get("data", snap).get("alerts", [])
    state = json.load(open(STATE_P)) if os.path.exists(STATE_P) else None
    if state is None:
        state = {"watermark_issued_at": started.isoformat().replace("+00:00", "Z"),
                 "triggered_keys": [], "updated_at_utc": started.isoformat().replace("+00:00", "Z")}
        initialized = True
    else:
        initialized = False
    wm = iso(state["watermark_issued_at"])
    now = utcnow()

    led_prod = json.dumps(json.load(open(LEDGER_PROD))) if os.path.exists(LEDGER_PROD) else ""
    led_test = json.dumps(json.load(open(LEDGER_TEST))) if os.path.exists(LEDGER_TEST) else ""

    fresh_prod, fresh_test = [], []
    stale_skipped = []
    dispatch_skip = []
    max_issued = None

    for row in alerts:
        pj = {}
        try:
            pj = json.loads(row.get("payloadJson") or "{}")
        except Exception:
            pass
        signal_id = pj.get("signal_id") or row.get("paperSignalId")
        alert_type = pj.get("alert_type") or row.get("eventType")
        issued = iso(pj.get("issued_at") or row.get("enqueuedAt") or row.get("createdAt"))
        test = pj.get("test", row.get("test", False)) is True
        if issued and (max_issued is None or issued > max_issued):
            max_issued = issued
        if alert_type != "ENTRY_CONFIRMED" or not signal_id or not issued:
            continue
        key = f"{signal_id}/ENTRY_CONFIRMED"
        if issued <= wm:
            continue
        # fresh-candidate checks
        if issued > now + timedelta(seconds=60):
            stale_skipped.append(f"{key}: issued in future beyond skew guard")
            continue
        if (now - issued).total_seconds() > 900:
            stale_skipped.append(f"{key}: older than 900s freshness cap")
            continue
        if key in state["triggered_keys"]:
            continue
        if f'"{key}"' in led_prod or key in led_prod:
            continue
        if f'"test/{key}"' in led_test or f"test/{key}" in led_test:
            continue
        # 3b dispatchability: visible (by construction), ledger-terminal (covered above),
        # entry-window: subsumed by 900s cap (15-min entry window)
        (fresh_test if test else fresh_prod).append({"key": key, "issued_at": issued.isoformat().replace("+00:00", "Z")})

    fresh_prod.sort(key=lambda x: x["issued_at"])
    fresh_test.sort(key=lambda x: x["issued_at"])

    # state update
    cap = now + timedelta(seconds=60)
    if max_issued is not None:
        new_wm = max(wm, min(max_issued, cap))
    else:
        new_wm = wm
    fired = [k["key"] for k in fresh_prod] + [k["key"] for k in fresh_test]
    state["watermark_issued_at"] = new_wm.isoformat().replace("+00:00", "Z")
    state["triggered_keys"] = (state["triggered_keys"] + fired)[-200:]
    state["updated_at_utc"] = utcnow().isoformat().replace("+00:00", "Z")
    tmp = STATE_P + ".tmp"
    json.dump(state, open(tmp, "w"), indent=2)
    os.replace(tmp, STATE_P)

    finished = utcnow()
    status = "succeeded"
    trigger_reason = "no_fresh_keys"
    if fresh_prod or fresh_test:
        latest = max([k["issued_at"] for k in fresh_prod + fresh_test])
        reasons = []
        if fresh_prod:
            reasons.append("trigger:" + ",".join(k["key"] for k in fresh_prod) + f" issued_at={latest}")
        if fresh_test:
            reasons.append("trigger:" + ",".join("test/" + k["key"] for k in fresh_test) + f" issued_at={latest}")
        trigger_reason = reasons[0] if len(reasons) == 1 else reasons

    run = {
        "invocation_completed": {
            "run_ts_utc": finished.strftime("%Y%m%dT%H%M%SZ"),
            "started_utc": started.isoformat().replace("+00:00", "Z"),
            "finished_utc": finished.isoformat().replace("+00:00", "Z"),
            "status": status,
            "alerts_seen": len(alerts),
            "fresh_keys": {"production": [k["key"] for k in fresh_prod],
                           "test": [k["key"] for k in fresh_test]},
            "stale_fresh_keys_skipped": stale_skipped,
            "dispatchability_skipped": dispatch_skip,
            "trigger_fired": False,
            "trigger_reason": trigger_reason,
            "controller_status": "running — see cron.runs",
        },
        "scheduler_provenance": "origin_unverified",
    }
    os.makedirs(RUNS_D, exist_ok=True)
    rp = os.path.join(RUNS_D, f"run-{finished.strftime('%Y%m%dT%H%M%SZ')}.json")
    json.dump(run, open(rp, "w"), indent=2)

    # prune to last 20 by REAL UTC instant (compact & dashed conventions)
    def to_instant(p):
        b = os.path.basename(p)[:-5]
        m = re.search(r"(\d{8}T\d{6}Z|\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)", b)
        if not m:
            return datetime.min.replace(tzinfo=timezone.utc)
        return iso(m.group(1))
    files = sorted(glob.glob(os.path.join(RUNS_D, "*.json")), key=to_instant)
    for p in files[:-20]:
        os.remove(p)

    print(json.dumps({"initialized": initialized, "alerts_seen": len(alerts),
                      "fresh_production": [k["key"] for k in fresh_prod],
                      "fresh_test": [k["key"] for k in fresh_test],
                      "stale_skipped": len(stale_skipped),
                      "new_watermark": state["watermark_issued_at"],
                      "run_log": rp, "pruned": max(0, len(files) - 20)}))

if __name__ == "__main__":
    main()
