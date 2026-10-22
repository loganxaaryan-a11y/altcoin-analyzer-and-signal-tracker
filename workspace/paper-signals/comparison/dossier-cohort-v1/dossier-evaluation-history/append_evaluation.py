#!/usr/bin/env python3
"""Append-only dossier evaluation history store (dossier-cohort-v1).

PAPER ONLY. This store records timestamped dossier evaluations per asset so
direction changes in uncalibrated reads can be diagnosed (recorded for
diagnosis only — no flip-alert lane, no whipsaw threshold, no notifications).

HARD RULE: reading or writing this store must NEVER issue a trade. This
module creates no paper contracts, no alerts, no entries, no signals. It
appends JSON records to a JSONL file and offers read-only lookups. Nothing
else. (Verified by static check: this file contains no imports or calls to
any issuance, alert, or contract-creation code path.)

Append-only discipline:
  - append_evaluation() opens the file in append mode only. There is no
    edit, delete, truncate, or overwrite path in this module.
  - evaluation_id must be unique; duplicates are refused.
  - recorded_at (write clock) is stamped by the module and must be
    monotonically non-decreasing across the file.
  - Corrections are new records that reference the earlier evaluation_id via
    `supersedes`; the original line is never touched.
  - Unknown-at-record-time fields are stored as null with a note, never
    backfilled later (same never-backfill discipline as decision_time_store).
"""

import datetime
import json
import os

HISTORY_DIR = os.path.dirname(os.path.abspath(__file__))
HISTORY_FILE = os.path.join(HISTORY_DIR, "history.jsonl")

DIRECTIONS = ("LONG", "SHORT")
TERMINALS = ("crypto", "equity")


def _utcnow_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")


def _read_all() -> list:
    records = []
    if not os.path.exists(HISTORY_FILE):
        return records
    with open(HISTORY_FILE, "r", encoding="utf-8") as fh:
        for lineno, line in enumerate(fh, 1):
            line = line.strip()
            if not line:
                continue
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError as exc:
                raise ValueError(f"history.jsonl line {lineno} is not valid JSON: {exc}")
    return records


def validate_record(rec: dict) -> list:
    """Return a list of validation errors (empty = valid)."""
    errors = []
    required = ["evaluation_id", "symbol", "coin_id", "terminal", "direction",
                "decision_at", "provenance"]
    for key in required:
        if rec.get(key) in (None, ""):
            errors.append(f"missing required field: {key}")
    if rec.get("direction") not in DIRECTIONS:
        errors.append(f"direction must be one of {DIRECTIONS}")
    if rec.get("terminal") not in TERMINALS:
        errors.append(f"terminal must be one of {TERMINALS}")
    entry = rec.get("entry")
    if entry is not None and not isinstance(entry, (int, float)):
        errors.append("entry must be a number or null")
    for key in ("entry_min", "entry_max", "invalidation", "target1", "target2", "score"):
        val = rec.get(key)
        if val is not None and not isinstance(val, (int, float)):
            errors.append(f"{key} must be a number or null")
    return errors


def append_evaluation(rec: dict) -> dict:
    """Append one evaluation record. Raises on invalid input or duplicate id.

    This is the ONLY write path. It opens the file in append mode; there is
    no code in this module that rewrites or deletes existing records.
    """
    errors = validate_record(rec)
    if errors:
        raise ValueError("invalid evaluation record: " + "; ".join(errors))

    existing = _read_all()
    seen_ids = {r.get("evaluation_id") for r in existing}
    if rec["evaluation_id"] in seen_ids:
        raise ValueError(f"duplicate evaluation_id refused (append-only): {rec['evaluation_id']}")

    record = dict(rec)
    record["recorded_at"] = _utcnow_iso()
    record["store_rule"] = ("append-only: a correction is a new record with "
                            "'supersedes' set; no line is ever edited or deleted; "
                            "unknown-at-record-time fields are null, never backfilled")

    with open(HISTORY_FILE, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(record, ensure_ascii=False) + "\n")
    return record


def get_previous_evaluation(symbol: str, before_decision_at: str) -> dict | None:
    """Read-only lookup for the dossier card: latest evaluation for `symbol`
    with decision_at strictly earlier than `before_decision_at`.

    Returns None when no prior evaluation exists. The caller renders the
    fallback text. Nothing is inferred or reconstructed here.
    """
    best = None
    for rec in _read_all():
        if str(rec.get("symbol", "")).upper() != str(symbol).upper():
            continue
        if rec.get("decision_at") is None or rec["decision_at"] >= before_decision_at:
            continue
        if best is None or rec["decision_at"] > best["decision_at"]:
            best = rec
    return best


def verify_append_only() -> dict:
    """Check structural append-only invariants. Returns a verdict dict."""
    records = _read_all()
    verdict = {"record_count": len(records), "checks": {}, "ok": True}
    ids = [r.get("evaluation_id") for r in records]
    recorded = [r.get("recorded_at") for r in records]
    checks = {
        "unique_evaluation_ids": len(ids) == len(set(ids)),
        "recorded_at_present": all(isinstance(r, str) for r in recorded),
        "recorded_at_monotonic": all(recorded[i] <= recorded[i + 1]
                                    for i in range(len(recorded) - 1)),
        "valid_directions": all(r.get("direction") in DIRECTIONS for r in records),
    }
    for rec in records:
        if validate_record(rec):
            checks.setdefault("all_records_validate", False)
            break
    else:
        checks["all_records_validate"] = True
    verdict["checks"] = checks
    verdict["ok"] = all(checks.values())
    return verdict


if __name__ == "__main__":
    v = verify_append_only()
    print(json.dumps(v, indent=2))
