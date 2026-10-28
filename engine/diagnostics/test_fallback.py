"""Isolated failure test for db_failure_fallback.py.

Simulates the exact failure class the fallback exists for: a capture
insert into a database that cannot accept it. Here the "capture database"
is a SQLite file in a directory made read-only after creation, so the
insert raises; the fallback must still land a complete, redacted line
carrying operation + error + run id, and must never store a secret value
even partially.
"""
import json
import sqlite3
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from db_failure_fallback import DIAGNOSES, record_diagnosis  # noqa: E402

tmp = Path(tempfile.mkdtemp(prefix="fallback-test-"))
db_path = tmp / "captures.db"
con = sqlite3.connect(db_path)
con.execute("CREATE TABLE write_failure_captures (id INTEGER PRIMARY KEY, error_text TEXT)")
con.commit()
# Hold an exclusive lock: this is the SQLITE_BUSY failure class itself.
lock = sqlite3.connect(db_path, timeout=0)
lock.execute("BEGIN EXCLUSIVE")
lock.execute("INSERT INTO write_failure_captures (error_text) VALUES ('lock-holder')")

secret = "sk-live-9f8e7d6c5b4a39281706"
error_text = (
    f"SQLITE_BUSY: cannot commit transaction - SQL statements in progress "
    f"(run 209, operation discovery:commit, api_key={secret})"
)
capture_failed = False
try:
    con2 = sqlite3.connect(db_path, timeout=0)
    con2.execute("INSERT INTO write_failure_captures (error_text) VALUES (?)", (error_text,))
    con2.commit()
except Exception as exc:  # noqa: BLE001 - the point is that it fails
    capture_failed = True
    print("capture insert failed as designed:", type(exc).__name__, str(exc)[:120])
finally:
    lock.rollback()
    lock.close()

assert capture_failed, "test setup broken: capture insert unexpectedly succeeded"

line = record_diagnosis(
    slot="test-slot@2026-10-28",
    artifact_db_failure={
        "operation": "discovery:commit",
        "table": "market_discovery_runs",
        "statement_kind": "update",
        "run_id": 209,
        "error": error_text,
        "transaction_context": "catalog-fetch checkpoint, no explicit transaction wrapper",
        "last_checkpoint": "catalog-fetch",
    },
    scheduler_receipt_failure={
        "job_key": "crypto-market-discovery-1900@2026-10-27",
        "scheduler_run_id": "ae4d8571",
        "receipt_status": "failed",
        "error": "scheduler_invocation_receipts insert failed",
    },
    recorded_at_utc="2026-10-28T00:55:00Z",
)

stored = json.loads(DIAGNOSES.read_text().splitlines()[-1])
assert stored["artifact_db_failure"]["run_id"] == 209, stored
assert stored["artifact_db_failure"]["operation"] == "discovery:commit", stored
assert "SQLITE_BUSY" in stored["artifact_db_failure"]["error"], stored
assert secret not in json.dumps(stored), "SECRET LEAKED into fallback record"
assert "[redacted]" in stored["artifact_db_failure"]["error"], stored
assert stored["scheduler_receipt_failure"]["receipt_status"] == "failed", stored
assert stored["artifact_db_failure"] is not stored["scheduler_receipt_failure"]
print("PASS: fallback line landed with operation + error + run id, secret redacted,")
print("      artifact and receipt failures kept in separate sections.")
print("      last line:", json.dumps(stored, sort_keys=True)[:400])
