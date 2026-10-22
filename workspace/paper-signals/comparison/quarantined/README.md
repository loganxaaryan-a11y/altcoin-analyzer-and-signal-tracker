# Quarantined scripts

## seed_rows.py (quarantined 2026-10-14)

Historical plumbing-test script. NEVER re-run.

Reason for quarantine: it does `from harness import (..., born_dead_check, ...)`
at import time, and `born_dead_check` was deleted from `harness.py` when the
superseded historical-extreme veto was removed from the executable path
(freeze v2.1.2, "superseded born-dead gate statically unreachable"). The
script therefore fails at import and cannot run.

It is preserved here (not deleted) for provenance: it documents the old
sandbox-seeded plumbing-test path whose output rows were relabeled
`row_origin="plumbing-test"`. Real pilot rows are built by
`build_pilot_rows.py`; prospective collection uses `collect_pilot_rows.py`.

No module, test, demo, or build script imports this file. Verified 2026-10-14:
`grep -r "seed_rows"` finds references only in docs and this note.
