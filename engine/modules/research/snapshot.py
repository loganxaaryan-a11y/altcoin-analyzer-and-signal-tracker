#!/usr/bin/env python3
"""Publish the research snapshot: HL cache freshness + latest scanner run.

Reads only files the research steps wrote (marketdata/state.json, the
scanner's runs/ directory) and writes snapshots/research-snapshot.json
atomically (tmp + rename). Nothing is invented; missing inputs read as null.
"""
import datetime
import glob
import json
import os

BASE = "/home/hatch/workspace/goals/research-terminal/paper-signals/pilot"
MD = os.path.join(BASE, "marketdata")
SCANNER_RUNS = "/home/hatch/workspace/goals/research-terminal/hidden_files/workstreams-2026-10-19/07-worker4-scanner/runs"
OUT_DIR = os.path.join(BASE, "snapshots")
OUT = os.path.join(OUT_DIR, "research-snapshot.json")


def utc_now():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def iso_mtime(path):
    return datetime.datetime.fromtimestamp(
        os.path.getmtime(path), datetime.timezone.utc
    ).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_json(path, default):
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:
        return default


def main():
    state = load_json(os.path.join(MD, "state.json"), {})
    instruments = state.get("instruments")
    run_files = glob.glob(os.path.join(SCANNER_RUNS, "run-*.json"))
    latest_run = None
    if run_files:
        newest = max(run_files, key=os.path.getmtime)
        latest_run = {"file": os.path.basename(newest), "modified_utc": iso_mtime(newest)}

    snapshot = {
        "schema": "research-snapshot-v1",
        "generated_at_utc": utc_now(),
        "source": "rt-research (systemd, zero agent launches)",
        "hl_cache_last_refresh_utc": state.get("last_refresh_utc"),
        "hl_instruments_count": len(instruments) if isinstance(instruments, (list, dict)) else None,
        "scanner_latest_run": latest_run,
    }

    os.makedirs(OUT_DIR, exist_ok=True)
    tmp = OUT + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(snapshot, fh, indent=2, sort_keys=True)
        fh.write("\n")
    os.replace(tmp, OUT)
    print("snapshot written:", OUT)
    print(json.dumps(snapshot, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
