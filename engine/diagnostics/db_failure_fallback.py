"""Workspace-side diagnostic fallback for artifact database failures.

Purpose: when the artifact's own write-failure capture cannot land (its
capture table lives inside the failing database, and its in-memory fallback
does not survive an instance restart), this module records the diagnosis
OUTSIDE that database, in the workspace, so a failed capture insert cannot
erase the diagnosis.

Rules (from the 2026-10-27 repair instruction):
- Artifact DB failures and scheduler-receipt failures are recorded in
  SEPARATE sections and never merged.
- Bounded: error text capped at 8,000 chars with an explicit truncation
  marker; the JSONL file is pruned to the newest 200 lines.
- Redacted: authorization/cookie headers, api keys, tokens, secrets,
  passwords, credentials in URLs are replaced before storage, never stored
  even partially.
- A receipt failure alone never blocks monitoring execution; monitoring
  runs under its own lease/idempotency guards. This module records only;
  it never retries, replays, or reopens anything.
- No WAL / writer-queue decision is made here: neither is supported by
  captured driver evidence.
"""
import json
import re
from pathlib import Path

BASE = Path.home() / "workspace/goals/research-terminal/hidden_files/db-failure-fallback"
BASE.mkdir(parents=True, exist_ok=True)
DIAGNOSES = BASE / "diagnoses.jsonl"
MAX_ERROR_CHARS = 8000
MAX_LINES = 200

_SECRET_PATTERNS = [
    (re.compile(r"(authorization\s*[:=]\s*(?:bearer|basic|token)\s+)[^\s\"',;]+", re.I), r"\1[redacted]"),
    (re.compile(r"(authorization\s*[:=]\s*)[^\s\"',;]+", re.I), r"\1[redacted]"),
    (re.compile(r"((?:set-)?cookie\s*[:=]\s*)[^\n;]+", re.I), r"\1[redacted]"),
    (re.compile(r"([a-z][a-z0-9+.-]*:\/\/)[^/@\s:'\"]+:[^/@\s'\"]+@", re.I), r"\1[redacted]@"),
    (re.compile(r"((?:api[_-]?key|apikey|access[_-]?token|auth[_-]?token|token|secret|password|passwd|pwd|credential|private[_-]?key)\s*[\"']?\s*[:=]\s*[\"']?)[^\"'\s,;&}]+", re.I), r"\1[redacted]"),
    (re.compile(r"(bearer\s+)[A-Za-z0-9._~+/=-]{8,}", re.I), r"\1[redacted]"),
]


def redact(text: str) -> str:
    out = text
    for pattern, replacement in _SECRET_PATTERNS:
        out = pattern.sub(replacement, out)
    return out


def bound(text: str) -> str:
    if len(text) <= MAX_ERROR_CHARS:
        return text
    marker = f"…[truncated {len(text) - MAX_ERROR_CHARS} chars at the {MAX_ERROR_CHARS}-char capture bound]"
    return text[: max(0, MAX_ERROR_CHARS - len(marker))] + marker


def record_diagnosis(*, slot: str, artifact_db_failure: dict | None,
                     scheduler_receipt_failure: dict | None,
                     recorded_at_utc: str) -> dict:
    """Append one bounded, redacted diagnosis line. Returns the line written."""
    line = {
        "record_kind": "db_failure_diagnosis_fallback",
        "slot": slot,
        "artifact_db_failure": artifact_db_failure,
        "scheduler_receipt_failure": scheduler_receipt_failure,
        "recorded_at_utc": recorded_at_utc,
    }
    text = bound(redact(json.dumps(line, sort_keys=True)))
    line = json.loads(text)
    lines = DIAGNOSES.read_text().splitlines() if DIAGNOSES.exists() else []
    lines.append(json.dumps(line, sort_keys=True))
    DIAGNOSES.write_text("\n".join(lines[-MAX_LINES:]) + "\n")
    return line
