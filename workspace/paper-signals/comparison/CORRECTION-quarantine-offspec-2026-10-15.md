# Correction record — off-spec prospective-row quarantine (2026-10-15)

**Date:** 2026-10-15 (Thu) · **Scope:** `rows/cohort-prospective-v2.csv` · **Type:** append-only quarantine correction — extends (never contradicts) the incident note in `collection-run-log-2026-10-14.md` Run 8.

## What happened

Run 8 (2026-10-15T17:40Z) appended 5 rows to the prospective vessel via an
off-spec collector invocation: the worker ran `collect_pilot_rows.py --help`,
the script fell through to `run_collection()` with **no `--live-export`**,
ingesting the workspace DB copy (the non-deployed path). The 5 rows carry
integer `candidate_id`s **41–45** (SUI/ETH/BTC), `row_origin=pilot`,
`freeze_version=2.1.5`. The Run 8 incident note left them in place per the
"do NOT hand-edit any row" rule — this correction does not edit them either.

## Logan's requirement, executed

1. **Quarantined from the primary analysis.** All downstream measurement
   (harness runs, reconciliation checks, hit-rate tallies) must EXCLUDE
   `candidate_id IN (41,42,43,44,45)` — filter on that set, or on
   `row_origin=pilot AND candidate_id NOT LIKE 'live-paper-cand-%'`.
2. **Originals untouched.** `rows/cohort-prospective-v2.csv` was NOT
   modified: sha256 **3b4706513950ca19ea7d4578edb973cee589f6196c2fc0face926924f7df3560**
   (recorded before and after this correction — byte-identical).
3. **Export of the 5 rows:** `quarantine-offspec-rows-2026-10-15.csv`
   (same directory) — IDs, original decision times, capture times, source
   store, freeze versions, plus the re-admission verdict per row.
4. **Re-admission evaluated per row (below).** Rule applied: re-admit ONLY
   if the row meets the existing protocol's evidence requirements. The
   current protocol (Logan-approved repair) collects from **deployed paper
   records with the post-freeze cutoff**; `--live-export` is the in-spec
   path. A workspace copy is not automatically invalid — but stamps and
   labels alone (`freeze_version=2.1.5`, `row_origin=pilot`, post-cutoff)
   do not establish eligibility; deployed issuance evidence does.
5. **Dedup replayed.** See evidence section below.

## Per-row re-admission verdicts — all QUARANTINED (none re-admitted)

| id | symbol | decision_at | verdict | why |
|----|--------|-------------|---------|-----|
| 41 | SUI | 2026-10-14T13:00:09.354Z | QUARANTINED | post-freeze, valid 2.1.5 stamp — but source is the non-deployed DB-copy path (generated_signals id 41); NO matching candidate in the deployed live stream (`live-paper-status-2026-10-15T1740Z.json` carries only deployed candidates 1–22 from discovery runs 60/61/63); issuance_key records strategy `2.0.0-measurement-contract`, not the frozen-trial deployed pilot; `decision_time_verified=false` (1 factor input unlabeled: Cross-venue taker imbalance, NO_DATA); alert/entry-observation timestamps not persisted |
| 42 | ETH | 2026-10-14T13:00:10.056Z | QUARANTINED | same source-path failure: workspace DB copy (generated_signals id 42); no deployed-stream corroboration; issuance under `2.0.0-measurement-contract`; `decision_time_verified=false`; trace fields (alert delivery, entry observation) not persisted |
| 43 | BTC | 2026-10-14T13:00:21.555Z | QUARANTINED | same source-path failure: workspace DB copy (generated_signals id 43); no deployed-stream corroboration; issuance under `2.0.0-measurement-contract`; `decision_time_verified=false`; trace fields not persisted |
| 44 | BTC | 2026-10-15T04:56:13.195Z | QUARANTINED | same source-path failure: workspace DB copy (generated_signals id 44); no deployed-stream corroboration; issuance under `2.0.0-measurement-contract`; `decision_time_verified=false`; trace fields not persisted |
| 45 | ETH | 2026-10-15T04:56:13.857Z | QUARANTINED | same source-path failure: workspace DB copy (generated_signals id 45); no deployed-stream corroboration; issuance under `2.0.0-measurement-contract`; `decision_time_verified=false`; trace fields not persisted |

Common findings supporting the verdicts (verified 2026-10-15):

- **Source store confirmed real, but off-protocol:** the 5 rows exist in the
  workspace DB copy (`~/workspace/ts-spaces/altcoin-analyzer-and-signal-tracker/app.db`,
  `generated_signals` ids 41–45; created_at ms timestamps match the vessel's
  `decision_at` values exactly; directions all `long`; all carry
  `issuance_key` strategy `2.0.0-measurement-contract`).
- **No deployed issuance evidence:** the deployed live stream's candidate set
  is exactly ids 1–22 with decisionAt values 2026-10-14T20:26:29.411Z,
  2026-10-15T01:54:38.414Z, 2026-10-15T05:41:00.907Z. None of the 5 decision
  windows (13:00:09Z/10Z/21Z Oct 14; 04:56:13Z Oct 15) appears in the deployed
  stream. A row issued only on the DB copy cannot be validated as a frozen-
  trial issuance.
- Capture time: 2026-10-15T17:40Z Run 8 incident window (the ingest happened
  between Steps 2 and 3 of Run 8; not a persisted per-row capture field).
- Their correct labels (`post_freeze_cutoff` passed, `freeze_version=2.1.5`,
  `row_origin=pilot`) are distinguishable but — per Logan's rule — do not
  establish eligibility without the deployed-path evidence.

## Dedup replay — reconciled count: 22 legitimate + 5 quarantined = 27

Checked programmatically across the vessel (27 rows):

- `(symbol, decision_at)` intersection between the 22 `live-paper-cand-*`
  rows and the 5 quarantined rows: **empty set** (live decision windows are
  20:26:29.411Z Oct 14 / 01:54:38.414Z Oct 15 / 05:41:00.907Z Oct 15 —
  none coincide with the 5 rows' windows).
- `candidate_id` overlap: **none** (`live-paper-cand-1…22` vs `41–45` —
  separate namespaces, and dedupe key `(candidate_id, freeze_version)`
  keeps them distinct going forward).
- `row_id` overlap: **none** (`crypto:live-paper-cand-N` vs `crypto:41–45`).
- **No double-counting.** Primary-analysis population = **22** deployed-
  stream rows. Vessel physical total = **27**. Quarantined set = **5**.

## Effect on analysis

- The Run 8 disposition mix (prod={'unscored': 22, 'issued': 5}) is a vessel
  artifact, not a trial result: the 5 scored `issued` rows are the quarantined
  set. Post-quarantine, the primary prospective population has **0 scored
  rows** (the known factor-ledger mapping gap on the 22 deployed rows
  persists — unchanged by this correction).
- The 40%-audit disagreement figure (0/5) was computed on the quarantined
  set only and carries no trial weight.

## Files

- Correction record (this file): `CORRECTION-quarantine-offspec-2026-10-15.md`
- Quarantine export: `quarantine-offspec-rows-2026-10-15.csv`
- Vessel (untouched): `rows/cohort-prospective-v2.csv`
  (sha256 3b4706513950ca19ea7d4578edb973cee589f6196c2fc0face926924f7df3560)

No new strategy or spending decisions arise from this correction. If Logan
ever directs re-admission (e.g. deployed-stream evidence surfaces for one of
these decision windows), it lands here as a dated addendum — never as a
silent edit.
