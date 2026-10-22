# Collection job spec — prospective comparison rows under freeze v2.1.0

**Status: SPEC ONLY — NOT INSTALLED.** Installing this job creates persistent
scheduler state. The worker that wrote this spec (2026-10-14) did NOT install
it, per the authorization rule: creating a scheduled job needs the user's
explicit approval. The parent can install it with `cron.add` using the exact
parameters in §3.

## 1. What this job does

Runs the prospective comparison-row collector
(`goals/research-terminal/paper-signals/comparison/collect_pilot_rows.py`)
on a recurring cadence through the v2.1.0 collection window
(2026-10-14 → 2026-12-31 UTC). Each run ingests the eligible stream —
crypto issued signals from the workspace DB copy
(`~/workspace/ts-spaces/altcoin-analyzer-and-signal-tracker/app.db`,
tables `generated_signals` + equity from `paper-signals/research/factor-ledgers-*.json`),
validates decision-time inputs per the harness strict rule, scores each
candidate under BOTH arms (production 11-factor + C-2 10-factor) via
`harness.score_batch`, and appends new rows idempotently (dedupe key
`(candidate_id, freeze_version)`). The collector never drops candidates,
never fabricates `asOf`, never touches the quarantined v1 file, and refuses
non-`pilot` row origins. The suppressed stream (`suppressed_signal_candidates`)
is deliberately NOT appended (parent/Logan's call still pending —
collection-run-log-2026-10-14.md open item #1); this job must not enable it.

As of spec-writing: **collection is manual only** (verified via
`cron.list` include_disabled=true, 2026-10-14 — no collection job exists),
and **no post-freeze opportunity has occurred yet**
(see `rows/first-post-freeze-opportunity-2026-10-14.json`).

## 2. Pre-install blockers — resolve BEFORE installing

These are genuine wire-ups the v2.1.0 consolidation left unresolved. The job
below assumes they are resolved as stated; if they are resolved differently,
update §3 accordingly.

1. **Target vessel.** `collect_pilot_rows.py` hardcodes
   `PILOT_CSV = rows/comparison-rows-pilot-2026-10-14.csv` (line 165), but
   COLLECTION-PLAN-2026-10-14.md §2 mandates `rows/cohort-prospective-v2.csv`
   (currently header-only) as the v2.1.0 prospective vessel: *"ONLY rows
   decided AFTER the v2.1.0 freeze timestamp… rows arrive via the collector,
   never by hand-edit."* No script currently writes to it. The `collect()`
   function accepts an alternate path, but the CLI `run_collection()` uses the
   hardcoded defaults. DECISION NEEDED: point the collector at
   `rows/cohort-prospective-v2.csv` (schema is identical, 69 cols) or
   formally designate the pilot file as the continuation vessel.
   The §3 body below runs the collector against the **prospective vessel** —
   adjust if the decision goes the other way.
2. **Freeze-version stamp.** `harness.MANIFEST_VERSION = "2.0.0"`; the collector
   stamps `freeze_version` from it (line 334) and dedupes on
   `(candidate_id, freeze_version)` (line 391). A row collected now would be
   stamped `2.0.0`, not `2.1.0`. DECISION NEEDED: bump the stamp for
   post-freeze rows (this is a versioned measurement change — needs the
   parent/expert's call, not a silent edit), and the §3 body instructs the
   worker to VERIFY the stamp before any append and abort to the parent if it
   still reads `2.0.0`.
3. **Suppressed ingest stays OFF.** The job body repeats the dry-run-only
   treatment of the suppressed stream. Enabling it is a parent/Logan decision
   with its own paper trail — not a cron-runner decision.

## 3. Exact `cron.add` parameters for the parent

```json
{
  "id": "paper-signal-comparison-collection",
  "title": "Paper-signal comparison collection (prospective v2.1.0)",
  "owner": "goal:research-terminal",
  "enabled": true,
  "mode": "task",
  "schedule": {
    "kind": "interval",
    "every": "6h",
    "timezone": "UTC",
    "flexible_time": true
  },
  "timeout_secs": 1800,
  "predicted_connector_permissions": []
}
```

Body (markdown, injected verbatim at each run):

> ## Paper-signal comparison collection — prospective rows under freeze v2.1.0
>
> You are a collection worker for the paper-signals program. Paper signals
> only. No brokerage. No production modifications. Holdouts locked.
> Work under `~/workspace/goals/research-terminal/paper-signals/comparison/`.
>
> 1. Run the collector: `cd ~/workspace/goals/research-terminal/paper-signals/comparison && python3 collect_pilot_rows.py`
>    (ingests issued crypto signals from the workspace DB copy + equity
>    radar-qualified candidates; validates decision-time inputs per the
>    harness rule; scores both arms; appends idempotently).
> 2. BEFORE trusting the run, verify `harness.MANIFEST_VERSION` stamps
>    post-freeze rows as `2.1.0`. If it still reads `2.0.0`, do NOT treat the
>    collection as v2.1.0-prospective: report the stamp mismatch as the run's
>    blocker and stop — do not hand-edit the stamp.
> 3. Verify the output vessel is the v2.1.0 prospective file
>    (`rows/cohort-prospective-v2.csv`) per COLLECTION-PLAN §2. If the
>    collector wrote elsewhere, report the vessel mismatch and stop.
> 4. Append a dated section to `collection-run-log-2026-10-14.md` with:
>    UTC run timestamp, candidates ingested, rows added, rows deduped,
>    decision-time verified/unverified split, per-arm disposition mix,
>    direction-disagreement fraction vs the 40% audit trigger, and
>    collection-window membership (2026-10-14 → 2026-12-31 UTC).
> 5. Do NOT enable suppressed-stream ingest (`ingest_suppressed_from_db`
>    stays dry-run only — parent/Logan's call pending). Do NOT hand-edit any
>    row. Do NOT touch `rows/comparison-rows-2026-10-13.csv` (quarantined v1).
> 6. If direction disagreement exceeds the 40% audit trigger, or any
>    post-freeze row's `freeze_version` is wrong, surface it prominently in
>    the run report.
>
> Report in your final message: rows added this run, deduped count, the
> disagreement fraction vs trigger, and any blocker from steps 2–3. A run
> that adds 0 rows is a normal, healthy result — say so plainly.

Install notes for the parent:

- 6-hour cadence mirrors `crypto-market-discovery` (interval@6h); the collector
  itself runs in ~0.1s (110ms measured on the 2026-10-14 dry run), so this is
  cheap. Daily would also be defensible given signal sparsity (10 issued
  crypto signals over 4 days) — 6h is chosen so the first post-freeze
  opportunity is caught promptly, which is the point of the expert's
  correction 3.
- Timezone UTC because the collection window is defined in UTC
  (`freeze-manifest-v2.1.0.json` `collection_window`).
- The collector's `run_collection()` also backfills operational-trace fields
  (`contract_id`, `issuance_outcome`, `freeze_version`) onto existing rows
  from REAL persisted values only — idempotent and audited in the run log.
- Window end: the plan fixes the readout regardless of N (no
  "collect-until-30" logic). When the window closes (2027-01-01 UTC), disable
  or remove this job — add a calendar reminder for that, do not rely on this
  spec remembering.
- First-run expectation after install: 0 rows added (no post-freeze
  opportunity exists as of 2026-10-14T05:08Z). The first real row will be the
  proof the expert asked for — the worker should export it to
  `rows/first-post-freeze-opportunity-2026-10-14.json` (replacing the current
  `none_yet` record) when it arrives.

## 4. Provenance

- Spec written 2026-10-14T05:08Z by paper-signals worker subagent
  (session 0be5268d-a5f4-433f-8829-ccb3c7e327e1), per parent task
  "PROVE COLLECTION IS CONNECTED (expert correction 3)".
- Based on: freeze-manifest-v2.1.0.json (`frozen_at_utc: 2026-10-14T04:57:00Z`),
  collect_pilot_rows.py (lines 161–200, 371, 625–631, 665–708),
  COLLECTION-PLAN-2026-10-14.md §2 + §10, collection-run-log-2026-10-14.md,
  and a live --dry-run of the collector at 2026-10-14T05:07Z
  (60 ingested / 0 added / 60 deduped).
- This spec creates NO persistent state. Nothing scheduled, nothing modified.
