# Equity 42 — ID-level expiry reconciliation (2026-10-14)

Evaluated at 2026-10-14T20:20:00.000Z, after the frozen entry-window deadline
of 2026-10-14T20:00:00.000Z.

## Result

- 42 rows evaluated, **42 EXPIRED**, 0 pending, 0 entered.
- Named reason code (all 42): `expired:window-elapsed-no-genuine-entry`
- Meaning: each entry window (2026-10-14T13:30:00.000Z → 2026-10-14T20:00:00.000Z)
  elapsed with no genuine venue print observed.

## Persisted states read

- `db_state`: `entered` on all 42 rows — scripted stamps, quarantined per
  `quarantine-record-equity-42.md` (identical `entryObservedAt = 2026-10-14T13:30:00.000Z`
  on all rows; `entryReceivedAt` ~6h before the window opened). Never treated as entries.
- `reclassified` / `reclassified_v2`: `STILL-PENDING` on all 42 rows.

## Durable expiry terms (apply to all 42)

1. The scripted `entered` marks are not entries and confer no entry rights.
2. No genuine opening-print venue feed existed during the window; no entry could
   be observed. No entry is claimed, backfilled, or implied.
3. **No rollover**: these windows do not move to later sessions. Each setup's
   entry opportunity ended at 2026-10-14T20:00:00.000Z.
4. **No fabricated entries or prices**: the `entryPrice_claimed` values in the
   reclass file are scripted numbers, not observed prints. They are retained as
   quarantine evidence only, never as trade prices.
5. The quarantine remains active. These 42 rows are excluded from all
   performance measurement (exclusion list
   `audit/exclusion-first-print-fidelity-2026-10-14.csv`).

## Ambiguity check

No setup's persisted state was missing or ambiguous: all 42 rows had identical
window bounds, identical `db_state`, and identical reclassified states, verified
against `reclass-42-longs-2026-10-14.v2.csv` (42 rows) and
`quarantine-equity-42-rows.json` (42 rows). No inference was required.

## Files

- ID-level export: `equity-42-expiry-reconciliation-2026-10-14.v1.csv` (42 rows)
- This record: `equity-42-expiry-reconciliation-2026-10-14.v1.md`
- Prior state: `reclass-42-longs-2026-10-14.v2.csv`, `equity-42-window-export-2026-10-14.v1.csv`

## Addendum — v2 readback (post-write effective state)

The v1 CSV carried correct expiry decisions but exported the persisted
`entered` / `STILL-PENDING` fields unlabeled, and the expiry existed only in
this report. Closed as follows:

- Durable expiry events persisted append-only in
  `equity-42-expiry-events-2026-10-14.v1.jsonl` (42/42 events, post-write
  readback verified). Event IDs are deterministic:
  `expiry-2026-10-14-<signal_id>` (idempotent re-runs add nothing).
- Readback export: `equity-42-expiry-reconciliation-2026-10-14.v2.csv` —
  `effective_state=EXPIRED` on all 42 rows with `expiry_event_id` per row;
  historical fields explicitly labeled
  (`persisted_state_historical`, `reclassified_state_historical`,
  `scripted_entry_stamp_historical`, `entry_evidence_status_historical`).
- v1 files preserved untouched.
