# Collection run log — 2026-10-14 (workstream B, first run)

Runner: `comparison/collect_pilot_rows.py` (freeze manifest v2.0.0).
Command: `python3 collect_pilot_rows.py` (plus a `--dry-run` suppressed-stream
preview and a repeat run for idempotency). Sandbox/research only.

## Outcome

- Candidates ingested: **60** (10 crypto issued from the workspace DB copy,
  50 equity radar-qualified from `research/factor-ledgers-2026-10-13.json`)
- Rows added: **0** — all 60 deduped against the existing pilot file
- Rows deduped: **60** (dedupe key `(candidate_id, freeze_version)`)
- Pilot rows total: **60** (unchanged count)

## Verification split (file totals)

- decision_time_verified = true: **50** (all equity; per-factor asOf ≤ decision_at)
- decision_time_verified = false: **10** (all crypto; the 11th factor
  "Cross-venue taker imbalance", score 0 / contribution 0 NO_DATA, carries no
  persisted asOf — flagged per the harness rule, never fabricated)

## Disposition mix

- crypto (n=10): prod `issued` 10/10; C-2 `issued` 10/10 (all non-flipped,
  levels/gates inherited-identical)
- equity (n=50): prod `unscored:production-not-issued` 50/50;
  C-2 `not-applicable:no-challenger-frozen` 50/50

## Direction disagreement vs the 40% audit trigger

- crypto: **0/10 = 0.0%** — audit trigger NOT fired.

## Collection-window membership (2026-10-14 → 2026-12-31 UTC, by decision_at)

- in_window: **1** (crypto id 40, 2026-10-14T02:23:07Z)
- out_of_window: **59** (crypto ids 31–39, 2026-10-10 → 2026-10-13; equity
  scan 2026-10-13T00:20:32Z — the workstream-A pilot predates the window)

Schema decision (for parent review): the collector does NOT drop
out-of-window candidates at ingest — dropping data at collection
contradicts the harness's never-silently-drop rule. Window membership is
reported per run; the readout-side window filter applies in analysis
(`metrics.py`), per COLLECTION-PLAN §2. Override available: gate in
`collect()` if the window should be enforced at ingest.

## Trace backfill (schema migration)

The pilot file migrated to the extended schema on this run (frozen
`ROW_COLUMNS` + 6 appended trace columns). Pre-migration backups:
`rows/comparison-rows-pilot-2026-10-14.csv.pre-extend-2026-10-14.bak`
(+ `.jsonl` twin).

Backfilled with REAL values only (60 rows, 130 cells):
- `contract_id`: 10/10 crypto rows from `signal_contracts.signal_id` by
  `legacy_signal_id` (e.g. id 31 → `sig_09f0c6ba9f733e8ec5ec0ed3`); equity
  null (never reached issuance — reason in row notes)
- `issuance_outcome`: crypto `issued` 10/10; equity
  `unscored:production-not-issued` 50/50 (from recorded production_decision)
- `freeze_version`: `2.0.0` on all 60 rows
- `entry_observed_at` / `alert_enqueued_at` / `alert_delivered_at`: null on
  all 60 rows — `entry_at == issued_at` in the DB copy is the entry-rule
  instant, not a post-decision print observation (no genuine
  entryObservedAt persisted); `alerts` + `alert_hits` tables are EMPTY in
  the workspace DB copy (no alert timestamps for these signals). Reasons
  recorded in the frozen note columns; nothing fabricated.

## Suppressed-stream dry-run preview (NOT appended this run)

`ingest_suppressed_from_db()` against the workspace DB copy, verification-run
artifacts excluded (`metadata_json` containing `verificationRun`):
**296 real suppressed candidates** (discovery/issuance path), all scoring
cleanly through the runner in dry-run:

- prod: `abstain` 296/296 — `abstain:born-dead` 218,
  `abstain:issuance-validation-unavailable` 76, `abstain:short-regime-gate` 2
- C-2: `unscored:no-factor-ledger` 296/296 (no factor ledger is persisted
  for suppressed candidates — the table carries entry/invalidation/OHLC
  but no `factors_json`)

Decision for parent/Logan: the suppressed stream is wired and tested but
NOT opened in this run — appending 296 born-dead rows would swamp the 10
issued crypto rows and change the dataset's character. That call is theirs.

## Quarantine verification

- The quarantined v1 file (`rows/comparison-rows-2026-10-13.csv`) was not
  read or written by this run (md5 `aefe7c82f02a81fc7314a5dd8339424b`,
  unchanged).
- Runner refuses non-`pilot` row origins and the v1 paths (covered by
  `tests/test_collector.py`).

## Idempotency verification

A second consecutive run ingested the same 60 candidates against the
extended-schema file: **0 added, 60 deduped** again. Byte-stable.

## Tests

`python3 tests/run_tests.py`: **67/67 pass** (42 pre-existing incl. the 33
v1-behavior + 9 cluster/audit tests, 2 new harness-amendment tests, 23 new
collector tests: quarantine, dedupe, suppressed handling, unverified-input
flagging, trace stamping, backfill guards).

## Open items / not wired

1. Suppressed stream (296 candidates) — implemented + dry-run verified, not
   appended; needs parent/Logan's call.
2. `entry_observed_at` / alert timestamps — no persisted source in the
   workspace DB copy; wire if the pipeline starts persisting them.
3. Equity trace beyond `issuance_outcome` — equity candidates never reach
   issuance/contract/alert stages by construction (scan-qualified only).
4. Window enforcement at ingest vs analysis — see schema decision above.
5. `harness.py` workstream-B amendment (suppressed-with-ledger carve-out) —
   disclosed in the harness docstring, README, and tests; no existing pilot
   row changes disposition. Confirm it stands or revert to strict
   `production-unreproduced` routing.

---

## Run 2 — live-stream collection under active freeze v2.1.4 (2026-10-14T05:41:30Z)

First execution after the five bounded fixes; verifies the live-stream
wiring end to end (status pull -> export -> collector -> stamp check).

### Step 1 — live paper stream

- Action `getpaperpilotstatus` on `altcoin-analyzer-and-signal-tracker`: **succeeded**.
- Saved to `live-paper-status-2026-10-14.json` (overwrites the 05:18 wiring
  snapshot; that snapshot showed the same empty state).
- Stream state: candidates 0, signals 0, alerts 0, comparisons 0.
- Deployed runs: 3 (ids 1, 2, 3), all `complete`, all candidateCount 0,
  issuedCount 0. Run 3 (manual, runKey `paper-pilot-v2.1.0:manual:5973183`,
  05:18:02Z) was not in the 05:18 snapshot but carries the same summary:
  "No directional discovery candidate was available for the explicit paper
  path; no signal was manufactured."

### Step 2 — live export

- `python3 live_paper_stream.py --status live-paper-status-2026-10-14.json
  --out live-paper-export-2026-10-14.json` -> 0 candidates,
  excluded_pre_freeze 0, cutoff 2026-10-14T04:57:00+00:00.
- NOTE (not a blocker): the export's `active_freeze_version` metadata field
  reads "2.1.1" — hardcoded in `live_paper_stream.py` (stale label). The
  collector does NOT use it (it stamps from `harness.ACTIVE_FREEZE_VERSION`).
  Wiring fix owed, not done in this run.

### Step 3 — collector

- `python3 collect_pilot_rows.py --live-export=live-paper-export-2026-10-14.json`
- Ingested: **50** (0 crypto from the deployed stream + 50 equity from the
  persisted factor ledgers).
- Rejected pre-freeze: **50** (all equity, decision_at 2026-10-13T00:20:32Z
  < cutoff 2026-10-14T04:57:00Z) — logged, never appended.
- Rows added: **0**. Rows deduped: **0**. Vessel rows total: **0**.

### Step 4 — verification

- (a) Stamp path: `harness.ACTIVE_FREEZE_VERSION` = **2.1.4** (fail-fast from
  `ACTIVE_MANIFEST` -> `freeze-manifest-v2.1.4.json`); collector summary
  confirms "active freeze v2.1.4". No new rows this run, so no stamp to
  inspect — no mismatch, no blocker.
- (b) Vessel written: `rows/cohort-prospective-v2.csv` (header-only, 1 line,
  unchanged).
- (c) No pre-freeze row appended: 50 pre-freeze candidates rejected at
  ingest; vessel remains empty.

### Verification split (this run)

- decision_time_verified: 0; decision_time_unverified: 0 (no rows this run).

### Disposition mix (this run)

- crypto: n=0; equity: n=0 (50 pre-freeze rejected before scoring).

### Direction disagreement vs the 40% audit trigger

- 0/0 = n/a (no paired issued rows with both directions) — audit trigger
  NOT fired.

### Collection-window membership (2026-10-14 -> 2026-12-31 UTC)

- in_window: 0 this run (no rows appended; 50 candidates rejected pre-freeze).

### First post-freeze row

- None yet. `rows/first-post-freeze-opportunity-2026-10-14.json` stays at
  `none_yet` (its v2.1.0-era caveats — vessel mismatch, stale stamp — are now
  resolved by the v2.1.2..v2.1.4 wiring; the record itself is left alone
  until the first real row lands).

### Quarantine check

- Quarantined v1 file untouched (md5 aefe7c82f02a81fc7314a5dd8339424b,
  unchanged). Legacy pilot file not written.

### Outcome

Normal, healthy 0-row run. The deployed paper path currently holds no
opportunities; the end-to-end live-stream collection wiring works under the
active freeze. Per the run rules: logged, staying quiet (no blockers, no
audit trigger, no first row).

---

## Run 3 — scheduled collection (2026-10-14T11:43:08Z)

### BLOCKER (per spec step 4a): schedule freeze contract is stale

- This schedule's body contracts active freeze **v2.1.4** ("stamps freeze_version
  from the ACTIVE manifest (must read 2.1.4)").
- Reality: `ACTIVE_MANIFEST` -> `freeze-manifest-v2.1.4.json` was superseded at
  2026-10-14T06:11:01Z. `harness.ACTIVE_FREEZE_VERSION` = **2.1.5** (verified at
  import; fail-fast from the marker).
- v2.1.5 = operational-verification executable amendment to v2.1.4 (frozen by the
  coordinator operational-verification round): harness receipt-expiry parity
  (received_at > window_end -> fail/abstain:entry-expired, matching the accepted
  issuance handler) + adapter full-record extension (five nested blocks per
  candidate dict). Executable core (v2.1.0), dates (v2.1.1), executable-path
  (v2.1.2), RULE 5/6 (v2.1.3), collector wiring (v2.1.4) all carried forward
  unchanged. The program's own machinery (harness, collector, live export) is
  self-consistent at 2.1.5; only this schedule's body text still expects 2.1.4.
- Consequence: had this run found any post-freeze candidate, the collector would
  have stamped it **2.1.5**, violating this run's contract. Per step 4(a) this is
  reported as a blocker. The vessel is unaffected (no rows were appended — see
  below), so no provenance repair is needed; the schedule body needs updating to
  the current active freeze (or to a freeze-agnostic contract) before the next
  run can collect under a matching stamp.

### Step 1 — live paper stream

- Action `getpaperpilotstatus` on `altcoin-analyzer-and-signal-tracker`: **succeeded**.
- Saved to `live-paper-status-2026-10-14.json` (fresh pull 2026-10-14T11:41:22Z,
  overwriting the 05:41 Run-2 snapshot).
- Stream state: candidates 0, signals 0, alerts 0, comparisons 0.
- Deployed runs: 5 (ids 1-5), all `complete`, all candidateCount 0, issuedCount 0.
  New since Run 2: run 4 (manual, 08:32:19Z) and run 5 (manual, 09:09:25Z), both
  discoveryRunId 57, both "No directional discovery candidate was available for
  the explicit paper path; no signal was manufactured."
- Delivery: still not configured (enqueue persistence only, not called delivery).

### Step 2 — live export

- `python3 live_paper_stream.py --status live-paper-status-2026-10-14.json
  --out live-paper-export-2026-10-14.json` -> **0 candidates**,
  excluded_pre_freeze 0, cutoff 2026-10-14T04:57:00+00:00 enforced.
- The export's `active_freeze_version` metadata now reads "2.1.5" (read live from
  the active manifest; the stale "2.1.1" hardcode noted in Run 2 is gone).

### Step 3 — collector

- `--dry-run` first: 50 ingested (0 crypto + 50 equity), 50 rejected pre-freeze,
  0 would-be rows. Then the real run:
  `python3 collect_pilot_rows.py --live-export=live-paper-export-2026-10-14.json`
- Ingested: **50** (0 crypto from the deployed stream + 50 equity from
  `paper-signals/research/factor-ledgers-2026-10-13.json`; no factor-ledger file
  newer than the 2026-10-14T04:57:00Z cutoff exists anywhere under
  goals/research-terminal).
- Rejected pre-freeze: **50** (all equity, decision_at 2026-10-13T00:20:32Z
  < cutoff) — logged, never appended.
- Rows added: **0**. Rows deduped: **0**. Vessel rows total: **0**.
- Collector summary header confirms the stamp source: "active freeze v2.1.5".

### Step 4 — verification

- (a) Stamp: **no new rows**, so no stamp to inspect — but the stamp SOURCE reads
  2.1.5 against this schedule's 2.1.4 contract: reported as the blocker above.
- (b) Vessel written: `rows/cohort-prospective-v2.csv` (header-only, 1 line,
  unchanged).
- (c) No pre-freeze row appended: 50 pre-freeze candidates rejected at ingest;
  vessel remains empty.

### Verification split (this run)

- decision_time_verified: 0; decision_time_unverified: 0 (no rows this run).

### Disposition mix (this run)

- crypto: n=0; equity: n=0 (50 pre-freeze rejected before scoring).

### Direction disagreement vs the 40% audit trigger

- 0/0 = n/a (no paired issued rows with both directions) — audit trigger
  NOT fired.

### Collection-window membership (2026-10-14 -> 2026-12-31 UTC)

- in_window: 0 this run (no rows appended; 50 candidates rejected pre-freeze).

### First post-freeze row

- None yet. `rows/first-post-freeze-opportunity-2026-10-14.json` stays at
  `none_yet` (record left alone until the first real row lands).

### Quarantine check

- Quarantined v1 file untouched (md5 aefe7c82f02a81fc7314a5dd8339424b,
  unchanged). Legacy pilot file not written (mtime still 04:18). Retrospective
  cohort untouched (mtime 04:48).

### Outcome

Healthy 0-row run on the data side — the deployed paper path holds no
opportunities and the cutoff enforcement works — but the run is NOT quiet per
the run rules: the freeze-contract mismatch is a spec-defined blocker and is
reported. No rows were written under any stamp, so nothing needs repair; the
schedule body must be updated to the current active freeze before the next run.

## Repair note — Run 3 blocker (2026-10-14 ~11:50 UTC, parent agent)
- Root cause: saved cron body `paper-signal-comparison-collection` still contracted freeze v2.1.4, but ACTIVE_MANIFEST points to v2.1.5 (frozen 2026-10-14T06:11:01Z; operational-verification amendment, no prediction changes).
- Verified: v2.1.5 manifest keeps `prospective_collection.post_freeze_cutoff_utc = 2026-10-14T04:57:00Z` (unchanged from v2.1.4); no rows were written by Run 3, so no provenance damage.
- Fix: updated the cron's saved body + title to v2.1.5 (chain extended, cutoff carried forward, stamp expectation 2.1.5), verified via cron.view. Next run 2026-10-14 17:40:19 UTC will collect under the active freeze.

---

## Run 4 — scheduled collection (2026-10-14T17:44Z)

This run's body contracts active freeze **v2.1.5** (Run 3's repair note confirmed
the cron body was updated to the active freeze before this run). Contract and
machinery now agree: no blocker.

### Step 1 — live paper stream

- Action `getpaperpilotstatus` on `altcoin-analyzer-and-signal-tracker`: **succeeded**.
- Saved to `live-paper-status-2026-10-14T1744Z.json` (timestamped filename; the
  date-only `live-paper-status-2026-10-14.json` from Run 3 at 11:42Z left intact).
- Stream state: candidates 0, signals 0, alerts 0, comparisons 0.
- Deployed runs: 6 (ids 1-6), all `complete`, all candidateCount 0, issuedCount 0.
  New since Run 3: run 6 (manual, runKey `paper-pilot-v2.1.0:manual:5973301`,
  15:09:25Z, discoveryRunId 58) — same summary: "No directional discovery
  candidate was available for the explicit paper path; no signal was
  manufactured."
- Delivery: still not configured (enqueue persistence only, not called delivery).

### Step 2 — live export

- `python3 live_paper_stream.py --status live-paper-status-2026-10-14T1744Z.json
  --out live-paper-export-2026-10-14T1744Z.json` -> **0 candidates**,
  excluded_pre_freeze 0, deployed runs seen 6, cutoff 2026-10-14T04:57:00+00:00
  enforced.
- Export's `active_freeze_version` metadata reads "2.1.5" (live from the active
  manifest).

### Step 3 — collector

- `python3 collect_pilot_rows.py --live-export=live-paper-export-2026-10-14T1744Z.json`
- Ingested: **50** (0 crypto from the deployed stream + 50 equity from the
  persisted factor ledgers; same 50-candidate eligible stream as Runs 2 and 3).
- Rejected pre-freeze: **50** (all equity, decision_at 2026-10-13T00:20:32Z
  < cutoff 2026-10-14T04:57:00Z) — logged, never appended.
- Rows added: **0**. Rows deduped: **0**. Vessel rows total: **0**.
- Collector summary header confirms: "active freeze v2.1.5".

### Step 4 — verification

- (a) Stamp: **no new rows**, so no stamp to inspect. Stamp SOURCE verified:
  `harness.ACTIVE_FREEZE_VERSION` = **2.1.5** (import-checked), matching this
  run's body contract and `ACTIVE_MANIFEST` -> `freeze-manifest-v2.1.5.json`.
  No mismatch, no blocker.
- (b) Vessel written: `rows/cohort-prospective-v2.csv` (header-only, 1 line,
  69 cols, md5 `fee47dad0b2d3dec4ed4043e78752425`, unchanged).
- (c) No pre-freeze row appended: 50 pre-freeze candidates rejected at ingest;
  vessel remains empty.

### Verification split (this run)

- decision_time_verified: 0; decision_time_unverified: 0 (no rows this run).

### Disposition mix (this run)

- crypto: n=0; equity: n=0 (50 pre-freeze rejected before scoring).

### Direction disagreement vs the 40% audit trigger

- 0/0 = n/a (no paired issued rows with both directions) — audit trigger
  NOT fired.

### Collection-window membership (2026-10-14 -> 2026-12-31 UTC)

- in_window: 0 this run (no rows appended; 50 candidates rejected pre-freeze).

### First post-freeze row

- None yet. `rows/first-post-freeze-opportunity-2026-10-14.json` stays at
  `none_yet` (record left alone until the first real row lands).

### Quarantine check

- Retrospective cohort not written. Legacy pilot file not written by this run.
  Quarantined v1 file untouched.

### Outcome

Normal, healthy 0-row run. The deployed paper path currently holds no
opportunities (latest deployed run 15:09:25Z, all runs 0 candidates); the
end-to-end live-stream collection wiring works under the active freeze v2.1.5,
and the freeze contract now matches the machinery. Per the run rules: logged,
staying quiet (no blockers, no audit trigger, no first row).

## Run 5 — scheduled collection (2026-10-14T23:40Z) — FIRST POST-FREEZE ROWS

### Step 1 — live paper stream

- Action `getpaperpilotstatus` on `altcoin-analyzer-and-signal-tracker`: **succeeded**.
- Saved to `live-paper-status-2026-10-14T2340Z.json` (full `{"data","ok"}` payload;
  prior timestamped status files left intact).
- Stream state: candidates **8**, signals 0, alerts 0, comparisons **8** —
  first non-empty deployed stream of the day. All 8 candidates carry
  `decisionAt` **2026-10-14T20:26:29.411Z** (discovery run 60, handoff run 2,
  handler v2.1.9, deployed freeze `paper-pilot-v2.1.0`) — **post-freeze**
  (cutoff 2026-10-14T04:57:00Z). Deployed paired comparisons all
  `cohort: prospective_suppressed` (eligibility ineligible/unknown;
  1 entry-window-expired BTC long, 7 unmapped-instrument). Deployed runs: 7
  (ids 1-7); run 7 (21:09:24Z, manual handoff) = 8 candidates, 0 issued,
  1 abstained/expired, 7 deferred.
- Deployed freeze hashes on the candidates: production
  `f259e73e...`, challenger `d88d5343...` (matches comparison freeze).

### Step 2 — live export

- `python3 live_paper_stream.py --status live-paper-status-2026-10-14T2340Z.json
  --out live-paper-export-2026-10-14T2340Z.json`
- **Adapter blocker found and repaired this run** (root-cause fix, local
  script only — no production, no rows, no quarantined files touched):
  `candidate_from_paper_signal` / `candidate_from_paper_candidate` extracted
  `decision_at` via snake_case keys only (`decision_at`/`decided_at`), but the
  deployed `getpaperpilotstatus` schema persists **`decisionAt`**. Every
  deployed candidate resolved to `decision_at=None`, `_after_cutoff(None)` =
  False, and all 8 were silently mislabeled "excluded pre-freeze: 8". This
  contradicted the adapter's own documented convention
  (LIVE-ADAPTER-FIELD-COVERAGE-2026-10-14.md: camelCase + snake_case tolerance)
  and would have produced a FALSE healthy 0-row run. Fix (2 lines): use the
  script's own `_pick(cand, "decisionAt", "decision_at", "decided_at")` on both
  paths — absent still -> None, never fabricated.
- After fix: **8 candidates exported, 0 excluded pre-freeze**, 7 deployed runs
  seen. Export metadata: `freeze_cutoff_iso` 2026-10-14T04:57:00+00:00,
  `active_freeze_version` 2.1.5.
- Known remaining gap (documented, NOT fixed this run — needs a deliberate
  mapping decision): `factorLedgerJson` / `operationalEvidenceJson` (present
  in the deployed payload, e.g. 1831/1200 chars for candidate 1) are not
  folded into the collector candidate dict, so the harness sees no factor
  ledger; likewise `comparisons[].cohort="prospective_suppressed"` is not
  mapped to `production_decision`. Both arms therefore land
  `unscored:no-factor-ledger` under RULE 3/RULE 6 (missing evidence ->
  unscored, never guessed) — honest, but less informative than the deployed
  evidence allows.

### Step 3 — collector

- `python3 collect_pilot_rows.py --live-export=live-paper-export-2026-10-14T2340Z.json`
- Ingested: **58** (8 crypto from the deployed stream + 50 equity from the
  persisted factor ledgers).
- Rejected pre-freeze: **50** (all equity, decision_at 2026-10-13T00:20:32Z
  < cutoff 2026-10-14T04:57:00Z) — logged, never appended.
- **Rows added: 8. Rows deduped: 0. Vessel rows total: 8** (was 0).
- Collector summary header confirms: "active freeze v2.1.5".

### Step 4 — verification

- (a) Stamp: **all 8 new rows `freeze_version=2.1.5`** (and
  `applicable_freeze=2.1.5`), sourced from `harness.ACTIVE_FREEZE_VERSION`
  (import-verified = 2.1.5, matching `ACTIVE_MANIFEST` ->
  `freeze-manifest-v2.1.5.json`). No mismatch, no blocker.
- (b) Vessel written: `rows/cohort-prospective-v2.csv` (69 cols; md5
  `fee47dad0b2d3dec4ed4043e78752425` -> `019ba0038b8793e367adb0551863f4d7`).
- (c) No pre-freeze row appended: all 8 rows
  `decision_at=2026-10-14T20:26:29.411Z` >= cutoff; 0 rows with
  decision_at < cutoff.

### Verification split (this run)

- decision_time_verified: **8**; decision_time_unverified: 0. (Verified is
  vacuous here: no factor inputs persisted, so "all factor inputs asOf <=
  decisionAt" holds trivially — recorded in the row's `decision_time_note`.)

### Disposition mix (this run)

- crypto: n=8; prod={'unscored': 8} (`unscored:no-factor-ledger`),
  c2={'unscored': 8} (`unscored:no-factor-ledger`). No scored arms yet — the
  deployed stream's evidence (factorLedgerJson, scores 25-60, directions)
  is preserved in `live-paper-status-2026-10-14T2340Z.json` for a future
  adapter-mapping pass.
- equity: n=0 (50 pre-freeze rejected before scoring).

### Direction disagreement vs the 40% audit trigger

- 0/0 = n/a (no paired issued rows with both directions — all arms
  unscored) — audit trigger NOT fired.

### Collection-window membership (2026-10-14 -> 2026-12-31 UTC)

- in_window: **8** this run (all 8 new rows; window membership confirmed by
  the collector summary).

### First post-freeze row

- **FIRST post-freeze rows collected.** `rows/first-post-freeze-opportunity-2026-10-14.json`
  updated: `status` `none_yet` -> `first_row_collected`, carrying the first
  row (`crypto:live-paper-cand-1`, BTC long, decisionAt 2026-10-14T20:26:29.411Z)
  with both deployed model scores (production 60 / challenger 60),
  input-availability evidence (factor_ledger_available=False in vessel;
  deployed factorLedgerJson/operationalEvidenceJson present in status file),
  and independent frozen-harness dispositions (prod unscored, c2 unscored).
  The 05:08Z `none_yet` record's TARGET-VESSEL/STALE-STAMP caveats are now
  stale (resolved by the v2.1.4 collector wiring + v2.1.5 amendment).

### Quarantine check

- Retrospective cohort (`cohort-retrospective-v2.csv`) not written. Legacy
  pilot file untouched. Quarantined v1 file untouched. 50 pre-freeze equity
  candidates logged as rejected, never appended.

### Outcome

- **Not a 0-row run: 8 prospective rows collected — the first under the
  active freeze v2.1.5.** The end-to-end deployed-stream collection path now
  works: live action -> export -> frozen-harness scoring -> 2.1.5-stamped
  vessel rows, with the deployed-schema timestamp mismatch repaired at the
  adapter (documented above). Remaining known work for a follow-up (not this
  run): map `factorLedgerJson`/`operationalEvidenceJson` and the deployed
  `prospective_suppressed` cohort into the candidate dict so arms can score
  instead of landing `unscored:no-factor-ledger`.
