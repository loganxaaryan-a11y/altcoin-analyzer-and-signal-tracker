#!/usr/bin/env python3
"""paper-entry-prompt-trigger §3/§3b code-gated fire decision.

Inputs: this run's getpaperpilotalerts snapshot (tool-output JSON file),
trigger-watcher-state.json, and both ledgers (read-only).
Output: decision JSON on stdout (the SOLE authority for step 4),
plus performs steps 5 (state update) and 6 (run log + prune trigger-runs/).
"""
import json, os, re, sys, tempfile
from datetime import datetime, timedelta, timezone

DELIVERY_DIR = os.path.expanduser("~/workspace/goals/research-terminal/paper-signals/pilot/delivery")
STATE_PATH = os.path.join(DELIVERY_DIR, "trigger-watcher-state.json")
RUNS_DIR = os.path.join(DELIVERY_DIR, "trigger-runs")
PROD_LEDGER = os.path.join(DELIVERY_DIR, "alert-delivery-ledger.json")
TEST_LEDGER = os.path.join(DELIVERY_DIR, "alert-delivery-ledger-test.json")
TERMINAL = {"delivered", "suppressed", "failed", "unknown"}

def parse_dt(s):
    if not s:
        return None
    s = s.strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)

def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def atomic_write(path, obj):
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), prefix=".tmp-")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(obj, f, indent=1)
            f.write("\n")
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise

def main():
    started = datetime.now(timezone.utc)
    snap_path = sys.argv[1]
    snap = load_json(snap_path)
    alerts = (snap.get("data") or {}).get("alerts") or []
    state = load_json(STATE_PATH)
    watermark = parse_dt(state["watermark_issued_at"])
    triggered = set(state.get("triggered_keys") or [])
    prod = load_json(PROD_LEDGER).get("entries") or {}
    testl = load_json(TEST_LEDGER).get("entries") or {}
    now = datetime.now(timezone.utc)

    visible_signal_ids = set()
    rows = []
    max_issued_all = None
    for row in alerts:
        payload = {}
        pj = row.get("payloadJson")
        if isinstance(pj, str) and pj:
            try:
                payload = json.loads(pj)
            except ValueError:
                payload = {}
        signal_id = payload.get("signal_id") or row.get("paperSignalId")
        alert_type = payload.get("alert_type") or row.get("eventType")
        issued = parse_dt(payload.get("issued_at") or row.get("enqueuedAt") or row.get("createdAt"))
        test_flag = payload.get("test") if "test" in payload else row.get("test")
        if signal_id:
            visible_signal_ids.add(signal_id)
        rows.append({
            "signal_id": signal_id,
            "alert_type": alert_type,
            "issued_at": issued,
            "issued_at_str": (payload.get("issued_at") or row.get("enqueuedAt") or row.get("createdAt")),
            "test": bool(test_flag) if test_flag is not None else False,
        })
        if issued and (max_issued_all is None or issued > max_issued_all):
            max_issued_all = issued

    fresh, stale_skipped = [], []
    for r in rows:
        if r["alert_type"] != "ENTRY_CONFIRMED" or not r["signal_id"] or not r["issued_at"]:
            continue
        key = f'{r["signal_id"]}/ENTRY_CONFIRMED'
        if not (r["issued_at"] > watermark):
            continue
        if r["issued_at"] > now + timedelta(seconds=60):
            continue  # clock-skew guard: future row, not fresh
        if (now - r["issued_at"]) > timedelta(seconds=900):
            stale_skipped.append(key)
            continue
        if key in triggered:
            continue
        if key in prod:
            continue
        if f"test/{key}" in testl:
            continue
        fresh.append({**r, "key": key})

    # §3b dispatchability
    dispatchable = []
    dispatchability_skipped = []
    for r in fresh:
        key = r["key"]
        if r["signal_id"] not in visible_signal_ids:
            dispatchability_skipped.append(f"{key}: triggered_key_not_visible")
            continue
        e = prod.get(key)
        st = (e or {}).get("state") or (e or {}).get("status")
        if st in TERMINAL:
            dispatchability_skipped.append(f"{key}: terminal:{st}")
            continue
        # ENTRY_CONFIRMED is post-entry; no entry-window expiry applies.
        dispatchable.append(r)

    prod_batch = [r for r in dispatchable if not r["test"]]
    test_batch = [r for r in dispatchable if r["test"]]

    # Step 5: state update
    new_watermark = watermark
    if max_issued_all is not None:
        new_watermark = max(watermark, min(max_issued_all, now + timedelta(seconds=60)))
    new_triggered = list(state.get("triggered_keys") or []) + [r["key"] for r in dispatchable]
    new_triggered = new_triggered[-200:]
    finished = datetime.now(timezone.utc)
    state_out = {
        "watermark_issued_at": new_watermark.isoformat(),
        "triggered_keys": new_triggered,
        "updated_at_utc": finished.strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    atomic_write(STATE_PATH, state_out)

    # Step 6: run log
    trigger_fired = bool(prod_batch or test_batch)
    reasons = []
    latest_iso = None
    if prod_batch or test_batch:
        allk = prod_batch + test_batch
        latest = max(allk, key=lambda r: r["issued_at"])["issued_at"]
        latest_iso = latest.isoformat()
        if prod_batch:
            reasons.append("trigger:" + ",".join(r["key"] for r in prod_batch) + f" issued_at={latest_iso}")
        if test_batch:
            reasons.append("trigger:test/" + ",test/".join(r["key"] for r in test_batch) + f" issued_at={latest_iso}")
        trigger_reason = "; ".join(reasons)
    else:
        trigger_reason = "no_fresh_keys" if not fresh else "no_dispatchable_keys"

    ts = finished.strftime("%Y%m%dT%H%M%SZ")
    run_log = {
        "invocation_completed": {
            "run_ts_utc": ts,
            "started_utc": started.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "finished_utc": finished.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "status": "succeeded",
            "alerts_seen": len(alerts),
            "fresh_keys": {
                "production": [r["key"] for r in prod_batch],
                "test": [r["key"] for r in test_batch],
            },
            "stale_fresh_keys_skipped": stale_skipped,
            "dispatchability_skipped": dispatchability_skipped,
            "trigger_fired": trigger_fired,
            "trigger_reason": trigger_reason,
            "controller_status": "running — see cron.runs",
            "watermark_before": watermark.isoformat(),
            "watermark_after": new_watermark.isoformat(),
            "status_fetch_retry": True,
        },
        "scheduler_provenance": {"provenance": "origin_unverified"},
    }
    os.makedirs(RUNS_DIR, exist_ok=True)
    run_path = os.path.join(RUNS_DIR, f"run-{ts}.json")
    atomic_write(run_path, run_log)

    # Prune trigger-runs to last 20 by embedded timestamp parsed to real UTC instant.
    def ts_of(name):
        m1 = re.search(r"(\d{8}T\d{6})Z", name)          # compact run-20261019T164543Z
        m2 = re.search(r"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})Z", name)  # dashed
        try:
            if m1:
                return datetime.strptime(m1.group(1), "%Y%m%dT%H%M%S").replace(tzinfo=timezone.utc)
            if m2:
                return datetime.strptime(m2.group(1), "%Y-%m-%dT%H:%M:%S").replace(tzinfo=timezone.utc)
        except ValueError:
            pass
        return None
    files = [f for f in os.listdir(RUNS_DIR) if f.endswith(".json")]
    files.sort(key=lambda f: (ts_of(f) is None, ts_of(f) or datetime.min.replace(tzinfo=timezone.utc)))
    for f in files[:-20]:
        try:
            os.unlink(os.path.join(RUNS_DIR, f))
        except OSError:
            pass

    decision = {
        "dispatchable_production": [r["key"] for r in prod_batch],
        "dispatchable_test": [r["key"] for r in test_batch],
        "latest_issued_at": latest_iso,
        "trigger_fired": trigger_fired,
        "trigger_reason": trigger_reason,
        "alerts_seen": len(alerts),
        "fresh_total": len(fresh),
        "stale_fresh_keys_skipped": stale_skipped,
        "dispatchability_skipped": dispatchability_skipped,
        "run_log": run_path,
        "remaining_run_files": len([f for f in os.listdir(RUNS_DIR) if f.endswith(".json")]),
    }
    print(json.dumps(decision, indent=1))

if __name__ == "__main__":
    main()
