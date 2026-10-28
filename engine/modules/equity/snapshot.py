#!/usr/bin/env python3
"""Publish the equity data snapshot from the OpenBB bundle files.

Reads marketdata/openbb/equity.json and deribit.json (fetched_at stamps and
per-section presence) and writes snapshots/equity-snapshot.json atomically.
This describes the workspace-side DATA bundles only — the equity paper book
lives in the artifact and is not represented here.
"""
import ast
import datetime
import json
import os

BASE = "/home/hatch/workspace/goals/research-terminal/paper-signals/pilot"
OPENBB = os.path.join(BASE, "marketdata", "openbb")
OUT_DIR = os.path.join(BASE, "snapshots")
OUT = os.path.join(OUT_DIR, "equity-snapshot.json")


def utc_now():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_json(path, default):
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:
        return default


def clean_error(e):
    # Keep structured errors structured instead of Python-repr text. The
    # bundle writer stringifies its {key: message} dicts, so re-parse
    # those strings back into objects at this layer; anything else passes
    # through as a plain string.
    if isinstance(e, (dict, list)):
        return json.loads(json.dumps(e, default=str))
    if isinstance(e, str) and e.startswith("{"):
        try:
            parsed = ast.literal_eval(e)
        except (ValueError, SyntaxError):
            parsed = None
        if isinstance(parsed, dict):
            return json.loads(json.dumps(parsed, default=str))
    return str(e)[:200]


def main():
    equity = load_json(os.path.join(OPENBB, "equity.json"), {})
    deribit = load_json(os.path.join(OPENBB, "deribit.json"), {})
    sections = equity.get("sections") or {}
    section_status = {
        name: ("present" if value else "empty") for name, value in sections.items()
    }
    errors = equity.get("errors") or []
    if not isinstance(errors, list):
        errors = [str(errors)]

    snapshot = {
        "schema": "equity-snapshot-v1",
        "generated_at_utc": utc_now(),
        "source": "rt-equity (systemd, zero agent launches)",
        "equity_bundle_fetched_at_utc": equity.get("fetched_at_utc"),
        "deribit_bundle_fetched_at_utc": deribit.get("fetched_at_utc"),
        "equity_sections": section_status,
        "equity_errors": [clean_error(e) for e in errors[:5]],
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
