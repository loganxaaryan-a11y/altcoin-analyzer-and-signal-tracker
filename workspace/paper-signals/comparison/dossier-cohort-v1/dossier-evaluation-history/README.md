# Dossier evaluation history — append-only store (dossier-cohort-v1)

**Location:** `comparison/dossier-cohort-v1/dossier-evaluation-history/history.jsonl`
**Writer:** `append_evaluation.py` (only write path; append mode only)
**Status:** seeded 2026-10-15T04:43Z · 4 records · `verify_append_only()` OK

## Purpose

Records every dossier evaluation per asset (timestamped, with decision_at,
direction, score, entry/invalidation/targets, source_as_of) so that direction
changes in **uncalibrated** reads are visible for diagnosis. This store exists
because the BTC dossier flipped LONG 52 (2026-10-14T13:00:21Z, id43, entry
$82,805) → SHORT 52 (2026-10-15T04:10Z read, entry zone $80,411.51–$81,522.15,
invalidation $83,604.59) with no trace in the terminal UI — only the new read
is shown.

This is RECORDED FOR DIAGNOSIS ONLY: no flip-alert lane, no whipsaw threshold,
no notifications. Strictly separate from confirmed-entry alerts.

## HARD RULE — reading the dossier never issues a trade

Reading or writing this store must NEVER create a paper contract, alert,
entry, or signal. `append_evaluation.py` is write-only record keeping; the
read-only `get_previous_evaluation()` lookup is a display helper. Neither
imports nor calls any issuance, alert, or contract-creation code path.
(Verification: static check on 2026-10-15 — see section 3 of the report to
the parent orchestrator.)

## Record schema (one JSON object per line)

| field | meaning |
|---|---|
| `evaluation_id` | unique id, e.g. `dossier-btc-id43-2026-10-14` — duplicates refused |
| `symbol` / `coin_id` / `terminal` | asset identity (`BTC`/`bitcoin`/`crypto`) |
| `direction` | `LONG` or `SHORT` |
| `score` | uncalibrated factor agreement score (e.g. 52) or null |
| `decision_at` | UTC ISO instant of the dossier decision/read; `decision_at_precision` may be `minute` when exact seconds were not visible |
| `provenance` | exact provenance chain — which file, which DB row, which screenshot |
| `entry` / `entry_min` / `entry_max` | point entry (dossier-path issuance) or entry zone (read); unused side is null |
| `invalidation` / `target1` / `target2` | levels, or null when not stated |
| `source_as_of` | evidence cutoff UTC instant, or null when not visible (never backfilled) |
| `note` | record context (seed, diagnosis-only, etc.) |
| `recorded_at` | write clock, stamped by the module |
| `supersedes` | optional; a correction names the earlier `evaluation_id` it corrects |

## Append-only discipline

1. **No edit, delete, truncate, or overwrite path exists.** `append_evaluation()`
   is the only writer and opens the file in append mode.
2. `evaluation_id` uniqueness is enforced; a re-append with an existing id
   raises `ValueError`.
3. A correction is a NEW record with `supersedes` set; the original line is
   never touched.
4. Unknown-at-record-time fields are stored as null with a note and are never
   backfilled afterward (same never-backfill discipline as the decision-time
   input store).
5. `verify_append_only()` checks: unique ids, `recorded_at` present and
   monotonically non-decreasing, valid directions, all records validate.

## Seed provenance table

| evaluation_id | decision_at (UTC) | source record |
|---|---|---|
| `dossier-btc-id43-2026-10-14` | 2026-10-14T13:00:21Z | `comparison/decision-time-inputs/dossier-btc-id43-2026-10-14.json` (signal_id 43, snapshot_id 3775786275845128); direction/score confirmed in `rows/dossier-cohort-v1.csv` row `dossier-v1:crypto:43` |
| `dossier-eth-id42-2026-10-14` | 2026-10-14T13:00:10Z | `comparison/decision-time-inputs/dossier-eth-id42-2026-10-14.json`; `dossier-v1:crypto:42` |
| `dossier-sui-id41-2026-10-14` | 2026-10-14T13:00:09Z | `comparison/decision-time-inputs/dossier-sui-id41-2026-10-14.json`; `dossier-v1:crypto:41` |
| `dossier-btc-read-2026-10-15T04-10Z` | 2026-10-15T04:10:00Z (minute precision) | 2026-10-15T00:10 EDT terminal screenshot (parent-orchestrator handoff); exact seconds and `source_as_of` not visible — recorded null, never backfilled |

## UI consumer contract

The dossier card's "previous direction" line is drawn from
`get_previous_evaluation(symbol, before_decision_at)` ONLY — never inferred or
reconstructed. Spec: `UI-SPEC-previous-direction-line.md`.
