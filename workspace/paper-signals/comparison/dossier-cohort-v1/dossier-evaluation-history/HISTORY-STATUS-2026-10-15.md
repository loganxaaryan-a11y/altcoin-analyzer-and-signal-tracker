# Dossier evaluation history — status vs the expert's finding 6 (2026-10-15)

**Location:** `comparison/dossier-cohort-v1/dossier-evaluation-history/history.jsonl`
**Records:** 4 · all SEED · `verify_append_only()` OK · file untouched by this report (existing rows not modified)

## The 4 seed rows

| # | evaluation_id | asset | direction / score | provenance | screenshot-derived? |
|---|---|---|---|---|---|
| 1 | `dossier-btc-id43-2026-10-14` | BTC | LONG 52 | Terminal-persisted. Frozen decision-time inputs file `comparison/decision-time-inputs/dossier-btc-id43-2026-10-14.json` (workspace read-only DB copy of the altcoin terminal's app.db, signal_id 43, snapshot_id 3775786275845128); direction/score confirmed in `rows/dossier-cohort-v1.csv` row `dossier-v1:crypto:43`. Entry 82805.0, invalidation 80075.99, targets 86898.51 / 89627.52, source_as_of 2026-10-14T12:58:47Z. | No |
| 2 | `dossier-eth-id42-2026-10-14` | ETH | LONG 52 | Terminal-persisted. `comparison/decision-time-inputs/dossier-eth-id42-2026-10-14.json`; `dossier-v1:crypto:42`. Entry 2479.76, invalidation 2366.98, targets 2648.94 / 2761.72. | No |
| 3 | `dossier-sui-id41-2026-10-14` | SUI | LONG 52 | Terminal-persisted. `comparison/decision-time-inputs/dossier-sui-id41-2026-10-14.json`; `dossier-v1:crypto:41`. Entry 1.032, invalidation 0.9262, targets 1.1907 / 1.2965. | No |
| 4 | `dossier-btc-read-2026-10-15T04-10Z` | BTC | SHORT 52 | Screenshot-derived (replay row). 2026-10-15T00:10 EDT terminal screenshot (parent-orchestrator handoff); levels transcribed from the screenshot. `decision_at_precision: minute` — exact seconds and `source_as_of` were not visible on the screenshot and are recorded as null (never backfilled). Point entry null; entry zone 80411.51–81522.15, invalidation 83604.59. Recorded for diagnosis only: the LONG 52 (id43) → SHORT 52 flip between the two BTC rows. | Yes |

**SEED marking is preserved.** Every record's `note` field opens with `SEED.`: rows 1–3 note "SEED. Dossier-path issuance (not a confirmed-entry paper contract)." Row 4 notes "SEED. Uncalibrated dossier read (not an issued setup, not a paper contract). Direction change vs dossier-btc-id43-2026-10-14 recorded for diagnosis only." The store rule is append-only: corrections are new records with `supersedes`; no line is ever edited or deleted; unknown-at-record-time fields stay null, never backfilled.

## The explicit distinction the expert's finding requires

**These seed rows are history INITIALIZATION. They do NOT prove that automatic assessment-history capture is installed.**

The 4 records were written by hand (workspace-side, via `append_evaluation.py`, recorded_at 2026-10-15T04:43:52Z) to give the history store something real to hold. No automated process created them, and no automated process appends new records. Specifically:

- **Automatic capture (appending a record on every dossier read) is NOT installed.**
- `append_evaluation.py` exists workspace-side only. It is the sole write path, and nothing invokes it: no cron job references it (verified against every saved job definition in `~/workspace/cron.d/`, `~/workspace/goals/research-terminal/crons/`, and `~/workspace/system-cron.d/` — zero matches for `append_evaluation` or `dossier-evaluation-history` as of 2026-10-15), no background process imports it, and no other workspace code calls it.
- The read side is equally unwired: `get_previous_evaluation()` is a workspace-side helper, and the dossier card's "previous direction" line it would serve is described only in `UI-SPEC-previous-direction-line.md` — a spec document, not deployed code. The terminal UI shows only the current read; it cannot reach workspace files.

## What "installed" would require (description only — no build)

Automatic capture would be installed when an unattended process — a scheduled job or a terminal-side hook — fires on every dossier read, constructs an evaluation record from that read's actual direction, score, entry/invalidation/targets and honest provenance (nulls with a note for anything not visible, same never-backfill discipline), deduplicates against existing records (one record per decision instant, no record for unchanged repeat reads), and appends it via the store's write path; and when the dossier card's previous-direction line is actually drawn from `get_previous_evaluation()` in deployed code. Installation evidence would be records arriving in `history.jsonl` on their own, with `recorded_at` times matching scheduled runs — not records hand-written in a single seeding session. None of that exists today.
