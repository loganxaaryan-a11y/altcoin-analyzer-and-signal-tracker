# Prospective cohort file — collection rules (v2.1.0)

**File:** `rows/cohort-prospective-v2.csv` — schema-identical to
`cohort-retrospective-v2.csv` (69 columns), currently **header only**
(empty by design).

## What may go in this file

- ONLY rows whose `decision_at` is **after the v2.1.0 freeze timestamp**
  (`frozen_at_utc` from `freeze-manifest-v2.1.0.json`, to be published).
- ONLY rows decided **under the v2.1.0 freeze's executable rules**
  (model parameters + operational entry/veto/venue rules as frozen) —
  `applicable_freeze` must name the freeze in force at decision time and
  `provenance_verdict` must be `PROSPECTIVE`, never `RETROSPECTIVE`.
- Collection-window rows only; window membership checked at ingest.
- Rows arrive via the collector (`collect_pilot_rows.py` or its v2.1.0
  successor), never by hand-editing this file.

## What must NOT go in this file

- No retrospective rows: nothing decided before the v2.1.0 freeze belongs
  here — the retrospective cohort (`cohort-retrospective-v2.csv`) is the
  home for pre-freeze rows, and the two files must never be concatenated
  into a shared denominator.
- No `freeze_version` backfills: the stamp must be the freeze the row was
  actually decided under, verified at ingest.
- No rows with unresolved `decision_time_verified=false` provenance gaps
  unless explicitly labeled and quarantined per the audit rules.

## Status

Created 2026-10-14 as the empty forward-collection vessel for the v2.1.0
collection window. The v2.1.0 consolidation workstream owns the freeze,
the manifest, and the first append.
