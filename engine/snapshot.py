#!/usr/bin/env python3
"""Publish a small core snapshot from the monitoring store.

Reads the canonical store files (positions.json, state.json, settle-state.json,
outcomes.jsonl, canonical-entered.json, runs/enroll-*.json) and writes the
snapshot atomically (tmp + rename). All fields are computed from the store at
generation time; nothing is invented. Freshness is the reader's job:
generated_at_utc is the fact, age is derived.

Health fields (Logan's enrollment clarification, 2026-10-22): the snapshot
must SHOW whether enrollment completed and whether every canonical open
position is covered — not merely that the engine finished. So it carries:
  - enrollment: latest enroll run (file, time, age, derived ids), whether
    every derived id is present in positions.json, the discrepancy count,
    and the canonical file's age vs enroll.py's own STALE_S bound (1200s) —
    past that bound enroll silently no-ops, so the age is published, not
    hidden;
  - coverage_complete / open_positions_uncovered: every open position must
    have a coverage checkpoint in state.json.

Env overrides (used by the isolated comparison runs):
  RT_SNAPSHOT_MON_DIR  monitoring store dir (default: production)
  RT_SNAPSHOT_OUT      snapshot output path (default: production)
  RT_SNAPSHOT_SOURCE   source label          (default: rt-core systemd)
"""
import datetime
import glob
import json
import os
import time

BASE = "/home/hatch/workspace/goals/research-terminal/paper-signals/pilot"
MON = os.environ.get("RT_SNAPSHOT_MON_DIR", os.path.join(BASE, "monitoring"))
OUT = os.environ.get("RT_SNAPSHOT_OUT", os.path.join(BASE, "snapshots", "core-snapshot.json"))
SOURCE = os.environ.get("RT_SNAPSHOT_SOURCE", "rt-core (systemd, zero agent launches)")
ENROLL_STALE_S = 1200  # enroll.py STALE_S: past this canonical age enroll no-ops
ENROLL_RUN_STALE_S = 2700  # 45 min, aligned with the terminal coverage-staleness rule


def utc_now():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def ms_to_iso(ms):
    return datetime.datetime.fromtimestamp(ms / 1000, datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


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


def enrollment_health(positions):
    """Enrollment completion + canonical coverage, computed from the store."""
    position_ids = {p.get("id") for p in positions}
    enroll_files = sorted(glob.glob(os.path.join(MON, "runs", "enroll-*.json")), key=os.path.getmtime)
    latest = None
    if enroll_files:
        path = enroll_files[-1]
        rec = load_json(path, {})
        derived = rec.get("derived_entered") or []
        latest = {
            "file": os.path.basename(path),
            "run_utc": rec.get("run_utc"),
            "age_s": round(time.time() - os.path.getmtime(path)),
            "stale": (time.time() - os.path.getmtime(path)) > ENROLL_RUN_STALE_S,
            "derived_entered_count": len(derived),
            "derived_missing_from_book": sorted(set(derived) - position_ids),
            "added_count": len(rec.get("added") or []),
            "discrepancies_count": len(rec.get("discrepancies") or []),
        }
    canonical_path = os.path.join(MON, "canonical-entered.json")
    canonical = {"file_age_s": None, "enroll_would_noop": None}
    if os.path.exists(canonical_path):
        age = round(time.time() - os.path.getmtime(canonical_path))
        canonical = {"file_age_s": age, "enroll_would_noop": age > ENROLL_STALE_S}
    return {"latest_run": latest, "canonical_file": canonical}


def main():
    positions = load_json(os.path.join(MON, "positions.json"), [])
    state = load_json(os.path.join(MON, "state.json"), {}).get("positions", {})
    settle_state = load_json(os.path.join(MON, "settle-state.json"), {}).get("positions", {})

    settled_ids = set()
    outcome_records = 0
    try:
        with open(os.path.join(MON, "outcomes.jsonl"), encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                outcome_records += 1
                try:
                    rec = json.loads(line)
                except Exception:
                    continue
                # Settlements are explicit: record_type == "settlement".
                # Observation records (first-touch notes) do NOT settle a position.
                pid = rec.get("position_id") or rec.get("positionId")
                rtype = str(rec.get("record_type") or rec.get("type") or "")
                if pid and rtype == "settlement":
                    settled_ids.add(pid)
    except FileNotFoundError:
        pass

    open_positions = []
    for pos in positions:
        pid = pos.get("id")
        if pid and pid not in settled_ids:
            open_positions.append(pos)

    coverage_values = []
    gaps_open_total = 0
    uncovered = []
    for pos in open_positions:
        chk = state.get(pos["id"], {})
        if chk.get("last_covered_bar_close_utc"):
            coverage_values.append(chk["last_covered_bar_close_utc"])
        else:
            uncovered.append(pos["id"])
        gaps_open_total += int(chk.get("total_gaps_seen") or 0)

    settle_watermarks = [
        v.get("last_verified_close_ms") for v in settle_state.values() if v.get("last_verified_close_ms")
    ]

    run_files = glob.glob(os.path.join(MON, "runs", "*.json"))
    latest_run = None
    if run_files:
        newest = max(run_files, key=os.path.getmtime)
        latest_run = {"file": os.path.basename(newest), "modified_utc": iso_mtime(newest)}

    snapshot = {
        "schema": "core-snapshot-v1",
        "generated_at_utc": utc_now(),
        "source": SOURCE,
        "positions_total": len(positions),
        "positions_settled": len(settled_ids),
        "positions_open": len(open_positions),
        "open_position_ids": sorted(p["id"] for p in open_positions),
        "coverage_through_utc": min(coverage_values) if coverage_values else None,
        "gaps_open_total": gaps_open_total,
        "coverage_complete": not uncovered,
        "open_positions_uncovered": sorted(uncovered),
        "settle_verified_through_utc": ms_to_iso(min(settle_watermarks)) if settle_watermarks else None,
        "outcome_records": outcome_records,
        "latest_monitoring_run": latest_run,
        "enrollment": enrollment_health(positions),
    }

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    tmp = OUT + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(snapshot, fh, indent=2, sort_keys=True)
        fh.write("\n")
    os.replace(tmp, OUT)
    print("snapshot written:", OUT)
    print(json.dumps(snapshot, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
