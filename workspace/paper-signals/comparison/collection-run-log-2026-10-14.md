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

## Run 6 — scheduled collection (2026-10-15T05:40Z) — 6 new rows, vessel 8 -> 14

### Step 1 — live paper stream

- Action `getpaperpilotstatus` on `altcoin-analyzer-and-signal-tracker`: **succeeded**.
- Saved to `live-paper-status-2026-10-15T0540Z.json` (full `{"data","ok"}`
  payload, 91,369 bytes; prior timestamped status files left intact).
- Stream state: candidates **14**, comparisons **14**, runs **9** (all
  `ok: true`). The stream now carries TWO discovery batches:
  - Discovery run 61 (handoff run 3, handler v2.1.9): **6** candidates, all
    `decisionAt` **2026-10-15T01:54:38.414Z** — post-freeze. bitway long
    (prod 30 / chall 25), pearl-2 long (30/25), quack-ai long (45/40),
    pons short (60/55), cash-cat short (63/55), manadia long (48/43).
    All entry windows expired unobserved (`entryObservedAt: null`,
    `entryPrice: null`); run 9 summary: 6 candidates, 0 issued, 6 deferred.
  - Discovery run 60 (handoff run 2): 8 candidates,
    `decisionAt` **2026-10-14T20:26:29.411Z** — the 8 collected in Run 5.
- Deployed paired comparisons: all **14** `cohort: prospective_suppressed`
  (run 61: 3 abstain + 1 short issued; run 60: 1 entry-window-expired BTC
  long, the rest deferred/abstain; `inputVerified: false` except the BTC row).
- Deployed freeze hashes on candidates: production `f259e73e...`,
  challenger `d88d5343...` (matches comparison freeze).

### Step 2 — live export

- `python3 live_paper_stream.py --status live-paper-status-2026-10-15T0540Z.json
  --out live-paper-export-2026-10-15T0540Z.json`
- **14 candidates exported, 0 excluded pre-freeze**, 9 deployed runs seen.
  The Run 5 adapter repair (camelCase `decisionAt` tolerance) held — no
  mislabeled exclusions this run.
- Export metadata: `freeze_cutoff_iso` 2026-10-14T04:57:00+00:00,
  `active_freeze_version` 2.1.5.

### Step 3 — collector

- `python3 collect_pilot_rows.py --live-export=live-paper-export-2026-10-15T0540Z.json`
- Ingested: **64** (14 crypto from the deployed stream + 50 equity from the
  persisted factor ledgers).
- Rejected pre-freeze: **50** (all equity, decision_at 2026-10-13T00:20:32Z
  < cutoff 2026-10-14T04:57:00Z) — logged, never appended.
- **Rows added: 6** (`live-paper-cand-9` .. `live-paper-cand-14`, the run-61
  batch). **Rows deduped: 8** (the run-60 batch, already in the vessel).
  **Vessel rows total: 14** (was 8).
- Collector summary header confirms: "active freeze v2.1.5".

### Step 4 — verification

- (a) Stamp: **all 14 rows `freeze_version=2.1.5`** (6 new + 8 existing),
  matching `ACTIVE_MANIFEST` -> `freeze-manifest-v2.1.5.json`. No mismatch,
  no blocker.
- (b) Vessel written: `rows/cohort-prospective-v2.csv` (69 cols; md5
  `93218e076aae1e10f945f83cc0009ccc` after this run).
- (c) No pre-freeze row appended: all 14 rows `decision_at` in
  {2026-10-14T20:26:29.411Z, 2026-10-15T01:54:38.414Z} >= cutoff
  2026-10-14T04:57:00Z; 0 rows with decision_at < cutoff.

### Verification split (this run)

- decision_time_verified: **8** (carried run-60 rows); decision_time_unverified:
  **6** (the run-61 batch, labeled, never dropped). (Verified is vacuous
  here: no factor inputs persisted, so "all factor inputs asOf <=
  decisionAt" holds trivially — recorded in the rows' `decision_time_note`.)

### Disposition mix (this run)

- crypto: n=14; prod={'unscored': 14} (`unscored:no-factor-ledger`),
  c2={'unscored': 14} (`unscored:no-factor-ledger`). Still no scored arms —
  the known Run 5 gap persists: `factorLedgerJson`/`operationalEvidenceJson`
  present in the deployed payload are not yet mapped into the candidate
  dict, and deployed `prospective_suppressed` comparisons are not mapped to
  `production_decision`. Evidence preserved in
  `live-paper-status-2026-10-15T0540Z.json` for a future adapter-mapping pass.
- equity: n=0 (50 pre-freeze rejected before scoring).

### Direction disagreement vs the 40% audit trigger

- 0/0 = n/a (no paired issued rows with both directions — all arms
  unscored) — audit trigger NOT fired.

### Collection-window membership (2026-10-14 -> 2026-12-31 UTC)

- in_window: **14** cumulative (8 run-60 + 6 run-61; window membership
  confirmed by the collector summary).

### First post-freeze row

- Already recorded in Run 5 (`rows/first-post-freeze-opportunity-2026-10-14.json`,
  `live-paper-cand-1`, BTC long). No change this run — the file already
  carries a real record, not `none_yet`, so no overwrite per spec.

### Quarantine check

- Retrospective cohort (`cohort-retrospective-v2.csv`) not written. Legacy
  pilot file untouched. Quarantined v1 file untouched. 50 pre-freeze equity
  candidates logged as rejected, never appended.

### Outcome

- **Not a 0-row run: 6 new prospective rows collected (vessel 8 -> 14),**
  all discovery-run-61 candidates stamped 2.1.5. End-to-end
  deployed-stream collection path healthy: live action -> export (0
  mislabeled exclusions post-repair) -> frozen-harness scoring ->
  idempotent append (8 deduped, 6 added). Remaining known work for a
  follow-up (not this run): map `factorLedgerJson`/`operationalEvidenceJson`
  and the deployed `prospective_suppressed` cohort into the candidate dict
  so arms can score instead of landing `unscored:no-factor-ledger`.

## Run 7 — scheduled collection (2026-10-15T11:41Z) — 8 new rows, vessel 14 -> 22

### Step 1 — live paper stream

- Action `getpaperpilotstatus` on `altcoin-analyzer-and-signal-tracker`: **succeeded**.
- Saved to `live-paper-status-2026-10-15T1141Z.json` (full `{"data"}` payload,
  consistent with the Run 6 format; prior timestamped status files left intact).
- Stream state: candidates **22**, comparisons **22**, signals **0**. The stream
  now carries a THIRD discovery batch:
  - Discovery run 63 (handoff run 4, handler v2.1.9): **8** candidates, all
    `decisionAt` **2026-10-15T05:41:00.907Z** — post-freeze. bitcoin long
    (chall 68), bitway long (25), layerzero short (35), akedo long (30),
    pearl-2 long (25), quack-ai long (33), manadia long (43), dolphin-2 long
    (45). All `eligible_repaired_path` at issuance_controls; all entry
    windows expired unobserved (`entryObservedAt: null`).
  - Discovery run 61 (handoff run 3): 6 candidates, decisionAt
    2026-10-15T01:54:38.414Z — collected in Run 6.
  - Discovery run 60 (handoff run 2): 8 candidates, decisionAt
    2026-10-14T20:26:29.411Z — collected in Run 5.
- Deployed paired comparisons: all **22** `cohort: prospective_suppressed`
  (15 abstain, 4 long, 3 short).

### Step 2 — live export

- `python3 live_paper_stream.py --status live-paper-status-2026-10-15T1141Z.json
  --out live-paper-export-2026-10-15T1141Z.json`
- **22 candidates exported, 0 excluded pre-freeze**, 11 deployed runs seen.
- Export metadata: `freeze_cutoff_iso` 2026-10-14T04:57:00+00:00,
  `active_freeze_version` 2.1.5.

### Step 3 — collector

- `python3 collect_pilot_rows.py --live-export=live-paper-export-2026-10-15T1141Z.json`
- Ingested: **72** (22 crypto from the deployed stream + 50 equity from the
  persisted factor ledgers).
- Rejected pre-freeze: **50** (all equity, decision_at 2026-10-13T00:20:32Z
  < cutoff 2026-10-14T04:57:00Z) — logged, never appended.
- **Rows added: 8** (`live-paper-cand-15` .. `live-paper-cand-22`, the run-63
  batch). **Rows deduped: 14** (run-60 + run-61 batches, already in the
  vessel). **Vessel rows total: 22** (was 14).
- Collector summary header confirms: "active freeze v2.1.5".

### Step 4 — verification

- (a) Stamp: **all 22 rows `freeze_version=2.1.5`** (8 new + 14 existing),
  matching `ACTIVE_MANIFEST` -> `freeze-manifest-v2.1.5.json`. No mismatch,
  no blocker.
- (b) Vessel written: `rows/cohort-prospective-v2.csv` (69 cols).
- (c) No pre-freeze row appended: 0 rows with `decision_at` <
  2026-10-14T04:57:00Z; all 22 rows carry decision_at in the three post-freeze
  batches (run-60 / run-61 / run-63).

### Verification split (this run)

- decision_time_verified: **8** (carried from prior runs); decision_time_unverified:
  **14** (run-61 and run-63 batches, labeled, never dropped). (Verified is
  vacuous here: no factor inputs persisted, so "all factor inputs asOf <=
  decisionAt" holds trivially — recorded in the rows' `decision_time_note`.)

### Disposition mix (this run)

- crypto: n=22; prod={'unscored': 22} (`unscored:no-factor-ledger`),
  c2={'unscored': 22} (`unscored:no-factor-ledger`). Still no scored arms —
  the known Run 5 gap persists: `factorLedgerJson`/`operationalEvidenceJson`
  present in the deployed payload are not yet mapped into the candidate
  dict, and deployed `prospective_suppressed` comparisons are not mapped to
  `production_decision`. Evidence preserved in
  `live-paper-status-2026-10-15T1141Z.json` for a future adapter-mapping pass.
- equity: n=0 (50 pre-freeze rejected before scoring).

### Direction disagreement vs the 40% audit trigger

- 0/0 = n/a (no paired issued rows with both directions — all arms
  unscored) — audit trigger NOT fired.

### Collection-window membership (2026-10-14 -> 2026-12-31 UTC)

- in_window: **22** cumulative (8 run-60 + 6 run-61 + 8 run-63; window
  membership confirmed by the collector summary).

### First post-freeze row

- Already recorded in Run 5 (`rows/first-post-freeze-opportunity-2026-10-14.json`,
  `live-paper-cand-1`, BTC long). No change this run — the file already
  carries a real record, not `none_yet`, so no overwrite per spec.

### Quarantine check

- Retrospective cohort (`cohort-retrospective-v2.csv`) not written. Legacy
  pilot file untouched. Quarantined v1 file untouched. 50 pre-freeze equity
  candidates logged as rejected, never appended.

### Outcome

- **Not a 0-row run: 8 new prospective rows collected (vessel 14 -> 22),**
  all discovery-run-63 candidates stamped 2.1.5. End-to-end deployed-stream
  collection path healthy: live action -> export (0 mislabeled exclusions) ->
  frozen-harness scoring -> idempotent append (14 deduped, 8 added).
  Remaining known work for a follow-up (not this run): map
  `factorLedgerJson`/`operationalEvidenceJson` and the deployed
  `prospective_suppressed` cohort into the candidate dict so arms can score
  instead of landing `unscored:no-factor-ledger`.

## Run 8 — scheduled collection (2026-10-15T17:40Z) — 0 new live rows, vessel 22 -> 27 via off-spec ingest (see incident note)

### Incident note (prominent, logged before anything else)

- Between Step 2 and Step 3, the worker ran `python3 collect_pilot_rows.py
  --help`. The script does not parse `--help`; it fell through to
  `run_collection()` with NO `--live-export`, ingesting the workspace DB
  copy (the non-deployed path) and **appending 5 rows** to the prospective
  vessel before the error was noticed:
  - candidate_ids **41** (SUI), **42** (ETH), **43** (BTC),
    decision_at 2026-10-14T13:00:09.354Z / :10.056Z / :21.555Z;
  - candidate_ids **44** (BTC), **45** (ETH),
    decision_at 2026-10-15T04:56:13.195Z / :13.857Z.
- Guard status of all 5 rows: all post-freeze-cutoff (2026-10-14T04:57:00Z),
  `row_origin=pilot`, `freeze_version=2.1.5`, `applicable_freeze=2.1.5`,
  scored via the frozen harness, 69-col schema intact. No pre-freeze, no
  quarantine-file, no retrospective-vessel contamination.
- The 5 rows are a DIFFERENT decision window from the live-stream batches
  (run-60 20:26Z Oct 14 / run-61 01:54Z Oct 15 / run-63 05:41Z Oct 15) — no
  overlap or double-count with any `live-paper-cand-*` row; distinguishable
  by the integer candidate_id scheme (DB copy) vs `live-paper-cand-N`
  (deployed stream).
- Per the "do NOT hand-edit any row" rule they were LEFT IN PLACE, not
  removed. Future `--live-export` runs cannot collide with them (separate
  candidate_id namespace; dedupe key is candidate_id + freeze_version).
- The worker's subsequent --help invocation on any collector script must be
  replaced by reading the source; `--help` is not a safe probe here.
- Vessel count went 22 -> 27 from this off-spec ingest, NOT from the
  deployed-stream collection in this run (which added 0).

### Step 1 — live paper stream

- Action `getpaperpilotstatus` on `altcoin-analyzer-and-signal-tracker`: **succeeded**.
- Saved to `live-paper-status-2026-10-15T1740Z.json` (unwrapped `{"data"}`
  payload, consistent with the Run 6/7 format; prior timestamped status
  files left intact).
- Stream state: candidates **22**, comparisons **22**, signals **0**,
  alerts **0**. Unchanged candidate set from Run 7:
  - Discovery run 63 (handoff run 4, handler v2.1.9): **8** candidates,
    `decisionAt` 2026-10-15T05:41:00.907Z — collected in Run 7.
  - Discovery run 61 (handoff run 3): **6** candidates, decisionAt
    2026-10-15T01:54:39Z — collected in Run 6.
  - Discovery run 60 (handoff run 2): **8** candidates, decisionAt
    2026-10-14T20:26:29.411Z — collected in Run 5.
- Deployed paired comparisons: all **22** `cohort: prospective_suppressed`
  (15 abstain, 4 long, 3 short). Deployed freeze version in status still
  `paper-pilot-v2.1.0`, handler v2.1.9 (expected per VERSION-MAPPING-2026-10-14.md).

### Step 2 — live export

- `python3 live_paper_stream.py --status live-paper-status-2026-10-15T1740Z.json
  --out live-paper-export-2026-10-15T1740Z.json`
- **22 candidates exported, 0 excluded pre-freeze**, 12 deployed runs seen.
- Export metadata: `freeze_cutoff_iso` 2026-10-14T04:57:00+00:00 (matches
  active manifest `prospective_collection.post_freeze_cutoff_utc`
  2026-10-14T04:57:00Z, read live, never guessed),
  `active_freeze_version` 2.1.5.

### Step 3 — collector

- `python3 collect_pilot_rows.py --live-export=live-paper-export-2026-10-15T1740Z.json`
- **Ingested 72 candidates** (22 crypto from the live export + 50 equity
  from persisted ledgers); **22 eligible** post-freeze; **50 pre-freeze
  rejected** (all equity, decision_at 2026-10-13T00:20:32Z — logged, never
  appended).
- Rows added: **0**. Rows deduped: **22** (all 22 live candidates already in
  the vessel from Runs 5-7).

### Step 4 — verification

- (a) Stamp: **all 27 rows `freeze_version=2.1.5`** (22 live + 5 incident
  rows), matching `ACTIVE_MANIFEST` -> `freeze-manifest-v2.1.5.json`. No
  mismatch, no blocker.
- (b) Vessel written: `rows/cohort-prospective-v2.csv` (69 cols).
- (c) No pre-freeze row appended: 0 rows with `decision_at` <
  2026-10-14T04:57:00Z (verified programmatically across all 27 rows).

### Verification split (this run)

- decision_time_verified: **8** (the run-60 batch, carried); decision_time_unverified:
  **19** (labeled, never dropped).

### Disposition mix (this run)

- crypto: n=27; prod={'unscored': 22, 'issued': 5},
  c2={'unscored': 22, 'issued': 5}. The 5 incident rows are the only scored
  (issued) rows in the vessel — all 22 deployed-stream rows remain
  `unscored:no-factor-ledger` (the known Run 5 gap persists:
  `factorLedgerJson`/`operationalEvidenceJson` present in the deployed payload
  are not yet mapped into the candidate dict, and deployed
  `prospective_suppressed` comparisons are not mapped to
  `production_decision`). Evidence preserved in
  `live-paper-status-2026-10-15T1740Z.json` for a future adapter-mapping pass.
- equity: n=0 (50 pre-freeze rejected before scoring).

### Direction disagreement vs the 40% audit trigger

- 0/5 = **0.0%** (5 paired issued rows with both arms; production and C-2
  agree on all) — audit trigger NOT fired.

### Collection-window membership (2026-10-14 -> 2026-12-31 UTC)

- in_window: **27** cumulative (22 live-stream rows + 5 incident rows from
  2026-10-14T13:00Z and 2026-10-15T04:56Z decision windows; window membership
  confirmed by the collector summary and the cutoff re-check).

### First post-freeze row

- Unchanged: `rows/first-post-freeze-opportunity-2026-10-14.json` carries a
  real record (`live-paper-cand-1`, BTC long, status `first_row_collected`).
  No overwrite per spec. (Note: the 5 incident rows carry earlier
  decision_at values but were collected later and are a separate ingest
  population; the recorded first row stands.)

### Quarantine check

- Retrospective cohort (`cohort-retrospective-v2.csv`) not written. Legacy
  pilot file untouched. Quarantined v1 file untouched. 50 pre-freeze equity
  candidates logged as rejected, never appended.

### Outcome

- **Routine 0-row deployed-stream run:** the live collection path added 0
  rows (all 22 candidates already collected); end-to-end deployed-stream
  health confirmed (live action -> export 0 mislabeled exclusions ->
  frozen-harness scoring -> idempotent append). Per the spec, a 0-row run is
  healthy and stays quiet — no chat report.
- Vessel total is **27** (was 22), the delta being the 5 rows from the
  off-spec DB-copy ingest documented in the incident note above — valid
  post-freeze prospective rows under the active freeze, left in place per the
  no-hand-edit rule, fully auditable here.

## Run 9 — scheduled collection (2026-10-15T23:41Z) — 0 new live rows, vessel stays 27

- UTC timestamp: 2026-10-15T23:41Z. Active freeze v2.1.5 confirmed
  (`ACTIVE_MANIFEST` -> `freeze-manifest-v2.1.5.json`; post-freeze cutoff read
  from the live manifest: **2026-10-14T04:57:00Z**, never guessed).
- Live paper stream: `getpaperpilotstatus` on `altcoin-analyzer-and-signal-tracker`
  succeeded; full response saved to `live-paper-status-2026-10-15T2341Z.json`
  (22 candidates, 22 comparisons). No blocker, no fallback.
- Live export: `live_paper_stream.py` -> `live-paper-export-2026-10-15T2341Z.json`
  (22 candidates, 0 excluded pre-freeze at export stage, 12 deployed runs seen).

### Ingest / append

- Candidates ingested: 72 (22 crypto, 50 equity). Candidates eligible: 22
  (post-freeze cutoff). Rejected pre-freeze: 50 (all equity,
  decision_at=2026-10-13T00:20:32.316000+00:00 — before the cutoff; logged,
  never appended).
- **Rows added: 0. Rows deduped: 22.** Vessel total stays at **27**
  (22 live-stream rows + 5 incident rows, all freeze_version 2.1.5).

### Verification (all pass, no blocker)

- (a) Stamp: all 27 vessel rows carry freeze_version **2.1.5** (checked
  programmatically; stamp read from the ACTIVE manifest, not assumed). No
  mismatch, no blocker.
- (b) Vessel written: `rows/cohort-prospective-v2.csv` (69 cols).
- (c) No pre-freeze row appended: 0 rows with `decision_at` <
  2026-10-14T04:57:00Z (min decision_at in vessel:
  2026-10-14T13:00:09.354000+00:00).

### Verification split (this run)

- decision_time_verified: **8**; decision_time_unverified: **19**
  (labeled, never dropped).

### Disposition mix (this run)

- crypto: n=27; prod={'unscored': 22, 'issued': 5},
  c2={'unscored': 22, 'issued': 5}. The 5 incident rows remain the only scored
  (issued) rows in the vessel — all 22 deployed-stream rows remain
  `unscored:no-factor-ledger` (the known Run 5 gap persists:
  `factorLedgerJson`/`operationalEvidenceJson` present in the deployed payload
  are not yet mapped into the candidate dict). Evidence preserved in
  `live-paper-status-2026-10-15T2341Z.json` for a future adapter-mapping pass.
- equity: n=0 (50 pre-freeze rejected before scoring).

### Direction disagreement vs the 40% audit trigger

- 0/5 = **0.0%** (5 paired issued rows with both arms; production and C-2
  agree on all) — audit trigger NOT fired.

### Collection-window membership (2026-10-14 -> 2026-12-31 UTC)

- in_window: **27** cumulative (window membership confirmed by the collector
  summary and the cutoff re-check).

### First post-freeze row

- Unchanged: `rows/first-post-freeze-opportunity-2026-10-14.json` carries a
  real record (`live-paper-cand-1`, BTC long, status `first_row_collected`).
  No overwrite per spec.

### Quarantine check

- Retrospective cohort (`cohort-retrospective-v2.csv`) not written. Legacy
  pilot file untouched. Quarantined v1 file untouched. 50 pre-freeze equity
  candidates logged as rejected, never appended. No hand-edits to any row.

### Outcome

- **Routine 0-row deployed-stream run:** the live collection path added 0
  rows (all 22 post-freeze candidates already collected); end-to-end
  deployed-stream health confirmed (live action -> export 0 mislabeled
  exclusions -> frozen-harness scoring -> idempotent append). Per the spec, a
  0-row run is healthy and stays quiet — no chat report.

## Run 10 — scheduled collection (2026-10-16T05:40Z) — 16 new live rows, vessel 27 -> 43

- UTC timestamp: 2026-10-16T05:40Z. Active freeze v2.1.5 confirmed
  (`ACTIVE_MANIFEST` -> `freeze-manifest-v2.1.5.json`; post-freeze cutoff read
  from the live manifest: **2026-10-14T04:57:00Z**, never guessed).
- Live paper stream: `getpaperpilotstatus` on `altcoin-analyzer-and-signal-tracker`
  succeeded; full response saved to `live-paper-status-2026-10-16T0540Z.json`
  (38 candidates, 38 comparisons: 2 `prospective_issued` [bitcoin long score 68,
  near long score 60], 36 `prospective_suppressed`; discovery run 76 latest).
- Live export: `live_paper_stream.py` -> `live-paper-export-2026-10-16T0540Z.json`
  (38 candidates, 0 pre-freeze exclusions, 12 deployed runs seen).
- Collector: `collect_pilot_rows.py --live-export=...` scored both arms via the
  frozen harness. Ingested 88 (38 crypto, 50 equity); 38 eligible post-freeze;
  50 pre-freeze equity candidates (decision_at 2026-10-13) rejected at the cutoff,
  logged, never appended.
- Rows added: **16** (`crypto:live-paper-cand-31`..`crypto:live-paper-cand-46`
  range; 22 duplicates deduped idempotently on candidate_id + freeze_version).
- Vessel: `rows/cohort-prospective-v2.csv` (69 cols), data rows 27 -> **43**.

### Verify-before-trust

- (a) freeze_version stamp: all 16 new rows read **2.1.5** (verified from CSV,
  not the collector's word alone) — no mismatch.
- (b) Vessel written is `rows/cohort-prospective-v2.csv` — confirmed by the
  collector summary and the file's row count.
- (c) Pre-freeze append: **0** (all 16 new rows decision_at >=
  2026-10-14T04:57:00Z; the 50 rejected pre-freeze rows never reached the file).

### Decision-time verified/unverified

- Collector cumulative: verified **8**, unverified **35** (labeled, never
  dropped). All 16 rows added this run are `decision_time_verified=False`
  (same as every deployed-stream row so far); the 8 verified rows are the
  earlier incident rows.

### Disposition mix (this run)

- crypto: n=43; prod={'unscored': 38, 'issued': 5},
  c2={'unscored': 38, 'issued': 5}. All 16 new rows are
  `unscored:no-factor-ledger` on both arms — the known adapter gap persists:
  `factorLedgerJson`/`operationalEvidenceJson` present in the deployed payload
  (`live-paper-status-2026-10-16T0540Z.json`) are not yet mapped into the
  candidate dict. The 5 incident rows remain the only scored (issued) rows.
- equity: n=0 (50 pre-freeze rejected before scoring).

### Direction disagreement vs the 40% audit trigger

- 0/5 = **0.0%** (5 paired issued rows with both arms; production and C-2
  agree on all) — audit trigger NOT fired.

### Collection-window membership (2026-10-14 -> 2026-12-31 UTC)

- in_window: **43** cumulative (window membership confirmed by the collector
  summary and the cutoff re-check).

### First post-freeze row

- Unchanged: `rows/first-post-freeze-opportunity-2026-10-14.json` carries a
  real record (`live-paper-cand-1`, BTC long, status `first_row_collected`).
  No overwrite per spec.

### Quarantine check

- Retrospective cohort (`cohort-retrospective-v2.csv`) not written. Legacy
  pilot file untouched. Quarantined v1 file untouched. 50 pre-freeze equity
  candidates logged as rejected, never appended. No hand-edits to any row.

### Outcome

- **Routine run with 16 new rows:** the live collection path behaved end to
  end (live action -> export 0 mislabeled exclusions -> frozen-harness scoring
  -> idempotent append, 22 deduped). All new rows are post-freeze and carry the
  2.1.5 stamp; all remain `unscored:no-factor-ledger` (known gap). No audit
  trigger, no blocker, not the first row — per spec, no chat report.

## Run 11 — scheduled collection (2026-10-16T11:40Z) — 3 new live rows, vessel 43 -> 46

- UTC timestamp: 2026-10-16T11:40Z. Active freeze v2.1.5 confirmed
  (`ACTIVE_MANIFEST` -> `freeze-manifest-v2.1.5.json`; post-freeze cutoff read
  from the live manifest: **2026-10-14T04:57:00Z**, never guessed).
- Live paper stream: `getpaperpilotstatus` on `altcoin-analyzer-and-signal-tracker`
  succeeded; full response saved to `live-paper-status-2026-10-16T1140Z.json`
  (41 candidates, 41 comparisons: 2 `prospective_issued` [bitcoin long score 68,
  near long score 60], 39 `prospective_suppressed`; candidate tables cover
  discovery runs 60/61/63/71/76/77. Note: handoff table shows discovery run 78
  (completed 2026-10-16T10:58:45Z, 12 eligible) but its candidates are NOT yet
  in the `candidates`/`comparisons` tables at pull time — deployed-side store
  lag; next run should pick them up.)
- Live export: `live_paper_stream.py` -> `live-paper-export-2026-10-16T1140Z.json`
  (41 candidates, 0 pre-freeze exclusions, 12 deployed runs seen).
- Collector: `collect_pilot_rows.py --live-export=...` scored both arms via the
  frozen harness. Ingested 91 (41 crypto, 50 equity); 41 eligible post-freeze;
  50 pre-freeze equity candidates (decision_at 2026-10-13) rejected at the cutoff,
  logged, never appended.
- Rows added: **3** (`live-paper-cand-39` ANVL, `live-paper-cand-40` CX,
  `live-paper-cand-41` LCX — all discovery run 77, decision_at
  2026-10-16T06:58:10Z; 38 duplicates deduped idempotently on candidate_id +
  freeze_version).
- Vessel: `rows/cohort-prospective-v2.csv` (69 cols), data rows 43 -> **46**.

### Verify-before-trust

- (a) freeze_version stamp: all 3 new rows read **2.1.5** (verified from CSV,
  not the collector's word alone; all 46 vessel rows stamp 2.1.5) — no mismatch.
- (b) Vessel written is `rows/cohort-prospective-v2.csv` — confirmed by the
  collector summary and the file's row count.
- (c) Pre-freeze append: **0** (all 3 new rows decision_at >=
  2026-10-14T04:57:00Z; the 50 rejected pre-freeze rows never reached the file).

### Decision-time verified/unverified

- Collector cumulative: verified **8**, unverified **38** (labeled, never
  dropped). All 3 rows added this run are `decision_time_verified=False`
  (same as every deployed-stream row so far); the 8 verified rows are the
  earlier incident rows.

### Disposition mix (this run)

- crypto: n=46; prod={'unscored': 41, 'issued': 5},
  c2={'unscored': 41, 'issued': 5}. All 3 new rows are
  `unscored:no-factor-ledger` on both arms — the known adapter gap persists:
  `factorLedgerJson`/`operationalEvidenceJson` present in the deployed payload
  (`live-paper-status-2026-10-16T1140Z.json`) are not yet mapped into the
  candidate dict. The 5 incident rows remain the only scored (issued) rows.
- equity: n=0 (50 pre-freeze rejected before scoring).

### Direction disagreement vs the 40% audit trigger

- 0/5 = **0.0%** (5 paired issued rows with both arms; production and C-2
  agree on all) — audit trigger NOT fired.

### Collection-window membership (2026-10-14 -> 2026-12-31 UTC)

- in_window: **46** cumulative (window membership confirmed by the collector
  summary and the cutoff re-check).

### First post-freeze row

- Unchanged: `rows/first-post-freeze-opportunity-2026-10-14.json` carries a
  real record (`live-paper-cand-1`, BTC long, status `first_row_collected`).
  No overwrite per spec.

### Quarantine check

- Retrospective cohort (`cohort-retrospective-v2.csv`) not written. Legacy
  pilot file untouched. Quarantined v1 file untouched. 50 pre-freeze equity
  candidates logged as rejected, never appended. No hand-edits to any row.

### Outcome

- **Routine run with 3 new rows:** the live collection path behaved end to
  end (live action -> export 0 mislabeled exclusions -> frozen-harness scoring
  -> idempotent append, 38 deduped). All new rows are post-freeze and carry the
  2.1.5 stamp; all remain `unscored:no-factor-ledger` (known gap). No audit
  trigger, no blocker, not the first row — per spec, no chat report.

## Run 12 — scheduled collection (2026-10-16T17:40Z) — 29 new live rows, vessel 46 -> 75

### Timestamp

- Collection executed 2026-10-16T17:5x UTC (status file `live-paper-status-2026-10-16T1740Z.json`, export `live-paper-export-2026-10-16T1740Z.json`).

### Live stream

- `getpaperpilotstatus` on `altcoin-analyzer-and-signal-tracker` succeeded; full response saved (624 KB, 68 candidates, 68 comparisons, 12 handoff runs, 12 deployed runs).
- Live export: 70 candidates (all post-freeze; decision_at 2026-10-14T20:26:29Z -> 2026-10-16T16:59:14Z), 0 pre-freeze exclusions at the export stage; collector ingested 120 (70 crypto live + 50 equity legacy), rejected 50 pre-freeze equity (all decision_at 2026-10-13T00:20:32Z, AAPL..WMT) before scoring.
- Deployed freeze block still reads `paper-pilot-v2.1.0` (production contract version); collection freeze read from the ACTIVE manifest cutoff `2026-10-14T04:57:00Z`, never guessed.

### Rows added / deduped

- Rows added: **29**. Rows deduped: **41** (candidate_id + freeze_version). Vessel: `rows/cohort-prospective-v2.csv` (69 cols), data rows 46 -> **75**.

### Verify-before-trust

- (a) freeze_version stamp: all 75 vessel rows read **2.1.5** (verified from the CSV independently of the collector) — no mismatch.
- (b) Vessel written is `rows/cohort-prospective-v2.csv` — confirmed by the collector summary and the file's row count.
- (c) Pre-freeze append: **0** (all vessel rows decision_at >= 2026-10-14T04:57:00Z; the 50 rejected pre-freeze equity rows never reached the file).

### Decision-time verified/unverified

- Collector cumulative: verified **10**, unverified **65** (labeled, never dropped). New rows this run are all `decision_time_verified=False`, consistent with every deployed-stream row so far.

### Disposition mix (this run)

- crypto: n=75; prod={'unscored': 68, 'issued': 7}, c2={'unscored': 70, 'issued': 5}.
- The 5 incident rows (ids 41-45) remain issued on both arms. Two new rows this run (`live-paper-1`, `live-paper-2`, decision_at 2026-10-16T12:57:44.557Z) are prod=issued / c2=unscored — a production-only issuance asymmetry, not a direction disagreement (disagreement is only measured on paired rows where both arms issued). All other new rows are `unscored:no-factor-ledger` on both arms — the known adapter gap persists.
- equity: n=0 (50 pre-freeze rejected before scoring).

### Direction disagreement vs the 40% audit trigger

- 0/5 = **0.0%** (5 paired issued rows with both arms; production and C-2 agree on all) — audit trigger NOT fired.

### Collection-window membership (2026-10-14 -> 2026-12-31 UTC)

- in_window: **75** cumulative (window membership confirmed by the collector summary and the cutoff re-check).

### First post-freeze row

- Unchanged: `rows/first-post-freeze-opportunity-2026-10-14.json` carries a real record (`live-paper-cand-1`, BTC long, status `first_row_collected`). No overwrite per spec.

### Quarantine check

- Retrospective cohort (`cohort-retrospective-v2.csv`) not written. Legacy pilot file untouched. Quarantined v1 file untouched. 50 pre-freeze equity candidates logged as rejected, never appended. No hand-edits to any row.

### Outcome

- **Routine run with 29 new rows:** the live collection path behaved end to end (live action -> export 0 exclusions -> frozen-harness scoring -> idempotent append, 41 deduped). All new rows are post-freeze and carry the 2.1.5 stamp; all but 2 remain `unscored:no-factor-ledger` (known gap). No audit trigger, no blocker, not the first row — per spec, no chat report.

## Run 13 — scheduled collection (2026-10-16T23:40Z) — 13 new live rows, vessel 75 -> 88

### Timestamp

- Collection executed 2026-10-16T23:4x UTC (status file `live-paper-status-2026-10-16T2340Z.json`, export `live-paper-export-2026-10-16T2340Z.json`).

### Live stream

- `getpaperpilotstatus` on `altcoin-analyzer-and-signal-tracker` succeeded; full response saved (725 KB, 80 candidates visible in comparisons, handoff runs 79/81/84, 12 deployed runs).
- Live export: 83 candidates (all post-freeze), 0 pre-freeze exclusions at the export stage; collector ingested 133 (83 crypto live + 50 equity legacy), rejected 50 pre-freeze equity (all decision_at 2026-10-13T00:20:32Z, AAPL..WMT) before scoring.
- ACTIVE_MANIFEST still reads `freeze-manifest-v2.1.5.json`; collection freeze read from the live manifest key `prospective_collection.post_freeze_cutoff_utc` = `2026-10-14T04:57:00Z`, never guessed.

### Rows added / deduped

- Rows added: **13**. Rows deduped: **70** (candidate_id + freeze_version). Vessel: `rows/cohort-prospective-v2.csv` (69 cols), data rows 75 -> **88**.

### Verify-before-trust

- (a) freeze_version stamp: all 88 vessel rows read **2.1.5** (verified from the CSV independently of the collector) — no mismatch.
- (b) Vessel written is `rows/cohort-prospective-v2.csv` — confirmed by the collector summary and the file's row count.
- (c) Pre-freeze append: **0** (all vessel rows decision_at >= 2026-10-14T04:57:00Z; the 50 rejected pre-freeze equity rows never reached the file).

### Decision-time verified/unverified

- Collector cumulative: verified **11**, unverified **77** (labeled, never dropped). This run's 13 new rows: 1 verified (`live-paper-3`, all factor inputs asOf <= decisionAt), 12 unverified (`decision_time_verified=False`, asOf not recorded on 7 factor inputs).

### Disposition mix (this run)

- crypto: n=88 cumulative; prod={'unscored': 80, 'issued': 8}, c2={'unscored': 83, 'issued': 5}.
- This run's 13 rows: prod 12x `unscored:incomplete-factor-ledger`, 1x issued (`live-paper-3`, reason "issued (ledger not persisted; reproduction skipped)"); c2 12x `unscored:incomplete-factor-ledger`, 1x `unscored:no-factor-ledger`.
- `live-paper-3` (decision_at 2026-10-16T22:58:46.853Z) is prod=issued / c2=unscored — a production-only issuance asymmetry, not a direction disagreement (disagreement is only measured on paired rows where both arms issued). The known adapter gap persists.
- equity: n=0 (50 pre-freeze rejected before scoring).

### Direction disagreement vs the 40% audit trigger

- 0/5 = **0.0%** (5 paired issued rows with both arms; production and C-2 agree on all) — audit trigger NOT fired.

### Collection-window membership (2026-10-14 -> 2026-12-31 UTC)

- in_window: **88** cumulative (window membership confirmed by the collector summary and the cutoff re-check).

### First post-freeze row

- Unchanged: `rows/first-post-freeze-opportunity-2026-10-14.json` carries a real record (status `first_row_collected`) from a prior run. No overwrite per spec.

### Quarantine check

- Retrospective cohort (`cohort-retrospective-v2.csv`) not written. Legacy pilot file untouched. Quarantined v1 file untouched. 50 pre-freeze equity candidates logged as rejected, never appended. No hand-edits to any row.

### Outcome

- **Routine run with 13 new rows:** the live collection path behaved end to end (live action -> export 0 exclusions -> frozen-harness scoring -> idempotent append, 70 deduped). All new rows are post-freeze and carry the 2.1.5 stamp; all but 1 remain unscored on both arms (known gap); the one issued row is production-only, not a disagreement. No audit trigger, no blocker, not the first row — per spec, no chat report.

## Run 14 — scheduled collection (2026-10-17T05:40Z) — 19 new live rows, vessel 88 -> 107

### Timestamp

- Collection executed 2026-10-17T05:40Z UTC (status file `live-paper-status-2026-10-17T0540Z.json`, export `live-paper-export-2026-10-17T0540Z.json`).

### Live stream

- `getpaperpilotstatus` on `altcoin-analyzer-and-signal-tracker` succeeded; full response saved (863 KB; 99 candidates, 99 comparisons, 11 alerts, 8 checkpoints).
- Live export: 102 candidates (all post-freeze), 0 pre-freeze exclusions at the export stage; collector ingested 152 (102 crypto live + 50 equity legacy), rejected 50 pre-freeze equity (all decision_at 2026-10-13T00:20:32Z, AAPL..WMT) before scoring.
- ACTIVE_MANIFEST still reads `freeze-manifest-v2.1.5.json`; collection freeze read from the live manifest key `prospective_collection.post_freeze_cutoff_utc` = `2026-10-14T04:57:00Z`, never guessed.

### Rows added / deduped

- Rows added: **19**. Rows deduped: **83** (candidate_id + freeze_version). Vessel: `rows/cohort-prospective-v2.csv` (69 cols), data rows 88 -> **107**.

### Verify-before-trust

- (a) freeze_version stamp: all 107 vessel rows read **2.1.5** (verified from the CSV independently of the collector) — no mismatch.
- (b) Vessel written is `rows/cohort-prospective-v2.csv` — confirmed by the collector summary and the file's row count.
- (c) Pre-freeze append: **0** (all 19 new rows decision_at 2026-10-17T00:57:57Z -> 2026-10-17T02:57:21Z, all >= cutoff; the 50 rejected pre-freeze equity rows never reached the file).

### Decision-time verified/unverified

- Collector cumulative: verified **11**, unverified **96** (labeled, never dropped). This run's 19 new rows: 0 verified, 19 unverified (`decision_time_verified=False`).

### Disposition mix (this run)

- crypto: n=107 cumulative; prod={'unscored': 99, 'issued': 8}, c2={'unscored': 102, 'issued': 5}.
- This run's 19 rows: prod 19x `unscored:incomplete-factor-ledger`, c2 19x `unscored:incomplete-factor-ledger`. No issued rows this run on either arm; the 5 previously paired issued rows remain the only both-issued set.
- equity: n=0 (50 pre-freeze rejected before scoring).

### Direction disagreement vs the 40% audit trigger

- 0/5 = **0.0%** (5 paired issued rows with both arms; production and C-2 agree on all) — audit trigger NOT fired.

### Collection-window membership (2026-10-14 -> 2026-12-31 UTC)

- in_window: **107** cumulative (window membership confirmed by the collector summary and the cutoff re-check).

### First post-freeze row

- Unchanged: `rows/first-post-freeze-opportunity-2026-10-14.json` carries a real record (status `first_row_collected`) from a prior run. No overwrite per spec.

### Quarantine check

- Retrospective cohort (`cohort-retrospective-v2.csv`) not written. Legacy pilot file untouched. Quarantined v1 file untouched. 50 pre-freeze equity candidates logged as rejected, never appended. No hand-edits to any row.

### Outcome

- **Routine run with 19 new rows:** the live collection path behaved end to end (live action -> export 0 exclusions -> frozen-harness scoring -> idempotent append, 83 deduped). All new rows are post-freeze and carry the 2.1.5 stamp; all 19 remain `unscored:incomplete-factor-ledger` on both arms (known adapter gap). No audit trigger, no blocker, not the first row — per spec, no chat report.

## Run 15 — scheduled collection (2026-10-17T11:40Z) — 10 new live rows, vessel 107 -> 117

### Timestamp

- Collection executed 2026-10-17T11:40Z UTC (status file `live-paper-status-2026-10-17T1140Z.json`, export `live-paper-export-2026-10-17T1140Z.json`).

### Live stream

- `getpaperpilotstatus` on `altcoin-analyzer-and-signal-tracker` succeeded; full response saved (887 KB; 100 candidates, 109 comparisons, 11 alerts, 8 checkpoints).
- Live export: 103 candidates (all post-freeze), 0 pre-freeze exclusions at the export stage; collector ingested 153 (103 crypto live + 50 equity legacy), rejected 50 pre-freeze equity (all decision_at 2026-10-13T00:20:32Z, AAPL..WMT) before scoring.
- ACTIVE_MANIFEST still reads `freeze-manifest-v2.1.5.json`; collection freeze read from the live manifest key `prospective_collection.post_freeze_cutoff_utc` = `2026-10-14T04:57:00Z`, never guessed.

### Rows added / deduped

- Rows added: **10**. Rows deduped: **93** (candidate_id + freeze_version). Vessel: `rows/cohort-prospective-v2.csv` (69 cols), data rows 107 -> **117**.

### Verify-before-trust

- (a) freeze_version stamp: all 117 vessel rows read **2.1.5** (verified from the CSV independently of the collector) — no mismatch.
- (b) Vessel written is `rows/cohort-prospective-v2.csv` — confirmed by the collector summary and the file's row count.
- (c) Pre-freeze append: **0** (all 10 new rows decision_at 2026-10-17T10:58:29.315Z, >= cutoff; the 50 rejected pre-freeze equity rows never reached the file).

### Decision-time verified/unverified

- Collector cumulative: verified **11**, unverified **106** (labeled, never dropped). This run's 10 new rows: 0 verified, 10 unverified (`decision_time_verified=False`).

### Disposition mix (this run)

- crypto: n=117 cumulative; prod={'unscored': 109, 'issued': 8}, c2={'unscored': 112, 'issued': 5}.
- This run's 10 rows: prod 10x `unscored:incomplete-factor-ledger`, c2 10x `unscored:incomplete-factor-ledger`. No issued rows this run on either arm; the 5 previously paired issued rows remain the only both-issued set.
- equity: n=0 (50 pre-freeze rejected before scoring).

### Direction disagreement vs the 40% audit trigger

- 0/5 = **0.0%** (5 paired issued rows with both arms; production and C-2 agree on all) — audit trigger NOT fired.

### Collection-window membership (2026-10-14 -> 2026-12-31 UTC)

- in_window: **117** cumulative (window membership confirmed by the collector summary and the cutoff re-check).

### First post-freeze row

- Unchanged: `rows/first-post-freeze-opportunity-2026-10-14.json` carries a real record (status `first_row_collected`) from a prior run. No overwrite per spec.

### Quarantine check

- Retrospective cohort (`cohort-retrospective-v2.csv`) not written. Legacy pilot file untouched. Quarantined v1 file untouched. 50 pre-freeze equity candidates logged as rejected, never appended. No hand-edits to any row.

### Outcome

- **Routine run with 10 new rows:** the live collection path behaved end to end (live action -> export 0 exclusions -> frozen-harness scoring -> idempotent append, 93 deduped). All new rows are post-freeze and carry the 2.1.5 stamp; all 10 remain `unscored:incomplete-factor-ledger` on both arms (known adapter gap). No audit trigger, no blocker, not the first row — per spec, no chat report.

## Run 16 — scheduled collection (2026-10-17T17:40Z) — 11 new live rows, vessel 117 -> 128

### Timestamp

- Collection executed 2026-10-17T17:40Z UTC (status file `live-paper-status-2026-10-17T1740Z.json`, export `live-paper-export-2026-10-17T1740Z.json`).

### Live stream

- `getpaperpilotstatus` on `altcoin-analyzer-and-signal-tracker` succeeded; full response saved (908 KB; 100 candidates, 120 comparisons, 11 alerts, 8 checkpoints, 3 signals). Freshness: max candidate createdAt 2026-10-17T13:00:05.153Z. (Transport preview showed summary truncation; the persisted file was audited byte-complete: zero truncation markers, all 100 candidates carry all 34 fields.)
- Live export: 103 candidates (all post-freeze), 0 pre-freeze exclusions at the export stage; collector ingested 153 (103 crypto live + 50 equity legacy), rejected 50 pre-freeze equity (all decision_at 2026-10-13T00:20:32Z, AAPL..WMT) before scoring.
- ACTIVE_MANIFEST still reads `freeze-manifest-v2.1.5.json`; collection freeze read from the live manifest key `prospective_collection.post_freeze_cutoff_utc` = `2026-10-14T04:57:00Z`, never guessed.

### Rows added / deduped

- Rows added: **11**. Rows deduped: **92** (candidate_id + freeze_version). Vessel: `rows/cohort-prospective-v2.csv` (69 cols), data rows 117 -> **128**.

### Verify-before-trust

- (a) freeze_version stamp: all 128 vessel rows read **2.1.5** (verified from the CSV independently of the collector) — no mismatch.
- (b) Vessel written is `rows/cohort-prospective-v2.csv` — confirmed by the collector summary and the file's row count (129 lines incl. header).
- (c) Pre-freeze append: **0** (all 11 new rows decision_at 2026-10-17T12:57:36.314Z, >= cutoff; the 50 rejected pre-freeze equity rows never reached the file; vessel oldest decision_at 2026-10-14T13:00:09).

### Decision-time verified/unverified

- Collector cumulative: verified **11**, unverified **117** (labeled, never dropped). This run's 11 new rows: 0 verified, 11 unverified (`decision_time_verified=False`).

### Disposition mix (this run)

- crypto: n=128 cumulative; prod={'unscored': 120, 'issued': 8}, c2={'unscored': 123, 'issued': 5}.
- This run's 11 rows: prod 11x `unscored:incomplete-factor-ledger`, c2 11x `unscored:incomplete-factor-ledger`. No issued rows this run on either arm; the 5 previously paired issued rows remain the only both-issued set.
- equity: n=0 (50 pre-freeze rejected before scoring).

### Direction disagreement vs the 40% audit trigger

- 0/5 = **0.0%** (5 paired issued rows with both arms; production and C-2 agree on all) — audit trigger NOT fired.

### Collection-window membership (2026-10-14 -> 2026-12-31 UTC)

- in_window: **128** cumulative (window membership confirmed by the collector summary and the cutoff re-check).

### First post-freeze row

- Unchanged: `rows/first-post-freeze-opportunity-2026-10-14.json` carries a real record (status `first_row_collected`) from a prior run. No overwrite per spec.

### Quarantine check

- Retrospective cohort (`cohort-retrospective-v2.csv`) not written. Legacy pilot file untouched. Quarantined v1 file untouched. 50 pre-freeze equity candidates logged as rejected, never appended. No hand-edits to any row.

### Outcome

- **Routine run with 11 new rows:** the live collection path behaved end to end (live action -> export 0 exclusions -> frozen-harness scoring -> idempotent append, 92 deduped). All new rows are post-freeze and carry the 2.1.5 stamp; all 11 remain `unscored:incomplete-factor-ledger` on both arms (known adapter gap). No audit trigger, no blocker, not the first row — per spec, no chat report.

## Run 17 — scheduled collection (2026-10-17T23:41Z) — 15 new live rows, vessel 128 -> 143

### Timestamp

- Collection executed 2026-10-17T23:41Z UTC (status file `live-paper-status-2026-10-17T2341Z.json`, export `live-paper-export-2026-10-17T2341Z.json`).

### Live stream

- `getpaperpilotstatus` on `altcoin-analyzer-and-signal-tracker` succeeded; full response saved (948 KB; 100 candidates, 134 comparisons, 14 alerts, 10 checkpoints, 4 signals). Freshness: max candidate createdAt 2026-10-17T21:03:11.304Z (deployed discovery run 93). (Transport preview showed summary truncation; the persisted file was audited byte-complete: zero truncation markers, all 100 candidates carry all 34 fields, and byte-copied from the machine-saved tool output — zero transcription risk.)
- Live export: 104 candidates -> export (100 candidates + 4 signals, all post-freeze); 0 pre-freeze exclusions at the export stage; collector ingested 154 (104 crypto live + 50 equity legacy), rejected 50 pre-freeze equity (all decision_at 2026-10-13T00:20:32Z, AAPL..WMT) before scoring.
- ACTIVE_MANIFEST still reads `freeze-manifest-v2.1.5.json`; collection freeze read from the live manifest key `prospective_collection.post_freeze_cutoff_utc` = `2026-10-14T04:57:00Z`, never guessed.

### Rows added / deduped

- Rows added: **15**. Rows deduped: **89** (candidate_id + freeze_version). Vessel: `rows/cohort-prospective-v2.csv` (69 cols), data rows 128 -> **143**.

### Verify-before-trust

- (a) freeze_version stamp: all 143 vessel rows read **2.1.5** (verified from the CSV independently of the collector) — no mismatch.
- (b) Vessel written is `rows/cohort-prospective-v2.csv` — confirmed by the collector summary and the file's row count (144 lines incl. header).
- (c) Pre-freeze append: **0** (all 15 new rows decision_at 2026-10-17T18:59:45.519Z / 2026-10-17T20:59:51.072Z, >= cutoff; the 50 rejected pre-freeze equity rows never reached the file; vessel oldest decision_at 2026-10-14T13:00:09, newest 2026-10-17T20:59:51).

### Decision-time verified/unverified

- Collector cumulative: verified **12**, unverified **131** (labeled, never dropped). This run's 15 new rows: 1 verified (`live-paper-4`), 14 unverified (`decision_time_verified=False`).

### Disposition mix (this run)

- crypto: n=143 cumulative; prod={'unscored': 134, 'issued': 9}, c2={'unscored': 138, 'issued': 5}.
- This run's 15 rows: prod 14x `unscored:incomplete-factor-ledger` + 1x `issued (ledger not persisted; reproduction skipped)` (`live-paper-4`, BTC, from the 4-signal set, decision-time verified); c2 15x unscored (14 `unscored:incomplete-factor-ledger`, 1 `unscored:no-factor-ledger`). The 5 previously paired issued rows remain the only both-issued set.
- equity: n=0 (50 pre-freeze rejected before scoring).

### Direction disagreement vs the 40% audit trigger

- 0/5 = **0.0%** (5 paired issued rows with both arms; production and C-2 agree on all) — audit trigger NOT fired.

### Collection-window membership (2026-10-14 -> 2026-12-31 UTC)

- in_window: **143** cumulative (window membership confirmed by the collector summary and the cutoff re-check).

### First post-freeze row

- Unchanged: `rows/first-post-freeze-opportunity-2026-10-14.json` carries a real record (status `first_row_collected`) from a prior run. No overwrite per spec.

### Quarantine check

- Retrospective cohort (`cohort-retrospective-v2.csv`) not written. Legacy pilot file untouched. Quarantined v1 file untouched. 50 pre-freeze equity candidates logged as rejected, never appended. No hand-edits to any row.

### Outcome

- **Routine run with 15 new rows:** the live collection path behaved end to end (live action -> export 0 exclusions -> frozen-harness scoring -> idempotent append, 89 deduped). All new rows are post-freeze and carry the 2.1.5 stamp; 14 remain `unscored:incomplete-factor-ledger` on both arms (known adapter gap); one new row (`live-paper-4`, BTC) scored `issued` on the production arm only. No audit trigger, no blocker, not the first row — per spec, no chat report.

---

## Run 2026-10-18T05:40Z (scheduled 01:40 EDT)

- UTC timestamp: 2026-10-18T05:40Z. Active manifest read from `ACTIVE_MANIFEST`: **freeze-manifest-v2.1.5.json** (post-freeze cutoff `2026-10-14T04:57:00Z`, read from the manifest per spec).
- Live stream: `getpaperpilotstatus` on `altcoin-analyzer-and-signal-tracker` OK -> `live-paper-status-2026-10-18T0540Z.json`. Live export: 104 candidates, 0 pre-freeze excluded at export stage, 12 deployed runs seen -> `live-paper-export-2026-10-18T0540Z.json`.

### Rows added / deduped

- Rows added: **13**. Rows deduped: **91** (candidate_id + freeze_version). Vessel: `rows/cohort-prospective-v2.csv` (69 cols), data rows 143 -> **156**.

### Verify-before-trust

- (a) freeze_version stamp: all 156 vessel rows read **2.1.5** (verified from the CSV independently of the collector) — no mismatch.
- (b) Vessel written is `rows/cohort-prospective-v2.csv` — confirmed by the collector summary and the file's row count (157 lines incl. header).
- (c) Pre-freeze append: **0** (13 new rows decision_at 2026-10-17T23:55:26.996Z and 2026-10-18T00:57:53.551Z, both >= cutoff; the 50 rejected pre-freeze equity rows never reached the file).

### Decision-time verified/unverified

- Collector cumulative: verified **12**, unverified **144** (labeled, never dropped). This run's 13 new rows: all unverified (`decision_time_verified=False`, asOf missing on 7 factor inputs).

### Disposition mix (this run)

- crypto: n=156 cumulative; prod={'unscored': 147, 'issued': 9}, c2={'unscored': 151, 'issued': 5}.
- This run's 13 rows: prod 13x `unscored:incomplete-factor-ledger`, c2 13x `unscored:incomplete-factor-ledger` (known adapter gap). The 5 previously paired issued rows remain the only both-issued set.
- equity: n=0 (50 pre-freeze rejected before scoring).

### Direction disagreement vs the 40% audit trigger

- 0/5 = **0.0%** (5 paired issued rows with both arms; production and C-2 agree on all) — audit trigger NOT fired.

### Collection-window membership (2026-10-14 -> 2026-12-31 UTC)

- in_window: **156** cumulative (window membership confirmed by the collector summary and the cutoff re-check).

### First post-freeze row

- Unchanged: `rows/first-post-freeze-opportunity-2026-10-14.json` carries a real record (status `first_row_collected`) from a prior run. No overwrite per spec.

### Quarantine check

- Retrospective cohort (`cohort-retrospective-v2.csv`) not written. Legacy pilot file untouched. Quarantined v1 file untouched. 50 pre-freeze equity candidates logged as rejected, never appended. No hand-edits to any row.

### Outcome

- **Routine run with 13 new rows:** the live collection path behaved end to end (live action -> export 0 exclusions -> frozen-harness scoring -> idempotent append, 91 deduped). All new rows are post-freeze and carry the 2.1.5 stamp; all 13 remain `unscored:incomplete-factor-ledger` on both arms (known adapter gap, decision-time unverified). No audit trigger, no blocker, not the first row — per spec, no chat report.

## Run 2026-10-18T11:40Z (scheduled 07:40 EDT)

- UTC timestamp: 2026-10-18T11:40Z. Active manifest read from `ACTIVE_MANIFEST`: **freeze-manifest-v2.1.5.json** (post-freeze cutoff `2026-10-14T04:57:00Z`, read from the manifest per spec).
- Live stream: `getpaperpilotstatus` on `altcoin-analyzer-and-signal-tracker` OK -> `live-paper-status-2026-10-18T1140Z.json` (100 candidates, 155 comparisons, 17 alerts, 13 checkpoints). Live export: 104 candidates, 0 pre-freeze excluded at export stage, 12 deployed runs seen -> `live-paper-export-2026-10-18T1140Z.json`.

### Rows added / deduped

- Rows added: **8** (live-paper-cand-148..155: BTC, BTW, ZRO, Q, ANVL, ALEO, DUSK, VEREM — deployed discovery run handoff 98, decision_at 2026-10-18T06:57:31Z). Rows deduped: **96** (candidate_id + freeze_version). Vessel: `rows/cohort-prospective-v2.csv` (69 cols), data rows 156 -> **164**.

### Verify-before-trust

- (a) freeze_version stamp: all 164 vessel rows read **2.1.5** (verified from the CSV independently of the collector) — no mismatch.
- (b) Vessel written is `rows/cohort-prospective-v2.csv` — confirmed by the collector summary and the file's row count (165 lines incl. header).
- (c) Pre-freeze append: **0** (8 new rows decision_at 2026-10-18T06:57:31Z >= cutoff; the 50 rejected pre-freeze equity rows never reached the file).

### Decision-time verified/unverified

- Collector cumulative: verified **12**, unverified **152** (labeled, never dropped). This run's 8 new rows: all unverified (`decision_time_verified=False`, factor ledger not mapped by the adapter — known gap).

### Disposition mix (this run)

- crypto: n=164 cumulative; prod={'unscored': 155, 'issued': 9}, c2={'unscored': 159, 'issued': 5}.
- This run's 8 rows: prod 8x `unscored:incomplete-factor-ledger`, c2 8x `unscored:incomplete-factor-ledger` (known adapter gap). The 5 previously paired issued rows remain the only both-issued set.
- equity: n=0 (50 pre-freeze rejected before scoring).

### Direction disagreement vs the 40% audit trigger

- 0/5 = **0.0%** (5 paired issued rows with both arms; production and C-2 agree on all) — audit trigger NOT fired.

### Collection-window membership (2026-10-14 -> 2026-12-31 UTC)

- in_window: **164** cumulative (window membership confirmed by the collector summary and the cutoff re-check).

### First post-freeze row

- Unchanged: `rows/first-post-freeze-opportunity-2026-10-14.json` carries a real record (status `first_row_collected`) from a prior run. No overwrite per spec.

### Quarantine check

- Retrospective cohort (`cohort-retrospective-v2.csv`) not written. Legacy pilot file untouched. Quarantined v1 file untouched. 50 pre-freeze equity candidates logged as rejected, never appended. No hand-edits to any row.

### Outcome

- **Routine run with 8 new rows:** the live collection path behaved end to end (live action -> export 0 exclusions -> frozen-harness scoring -> idempotent append, 96 deduped). All new rows are post-freeze and carry the 2.1.5 stamp; all 8 remain `unscored:incomplete-factor-ledger` on both arms (known adapter gap, decision-time unverified). No audit trigger, no blocker, not the first row — per spec, no chat report.

## Run 2026-10-18T17:40Z (scheduled 13:40 EDT)

- UTC timestamp: 2026-10-18T17:40Z. Active manifest read from `ACTIVE_MANIFEST`: **freeze-manifest-v2.1.5.json** (post-freeze cutoff `2026-10-14T04:57:00Z`, read from the manifest per spec).
- Live stream: `getpaperpilotstatus` on `altcoin-analyzer-and-signal-tracker` OK -> `live-paper-status-2026-10-18T1740Z.json` (100 candidates, 167 comparisons, 17 alerts, 13 checkpoints). Live export: 104 candidates, 0 pre-freeze excluded at export stage, 12 deployed runs seen -> `live-paper-export-2026-10-18T1740Z.json`.

### Rows added / deduped

- Rows added: **12** (live-paper-cand-156..167: deployed discovery run handoff 102, decision_at 2026-10-18T16:58:56Z — bitcoin, bitway, quack-ai, anvil cohorts). Rows deduped: **92** (candidate_id + freeze_version). Vessel: `rows/cohort-prospective-v2.csv` (69 cols), data rows 164 -> **176**.

### Verify-before-trust

- (a) freeze_version stamp: all 176 vessel rows read **2.1.5** (verified from the CSV independently of the collector) — no mismatch.
- (b) Vessel written is `rows/cohort-prospective-v2.csv` — confirmed by the collector summary and the file's row count (177 lines incl. header).
- (c) Pre-freeze append: **0** (12 new rows decision_at 2026-10-18T16:58:56Z >= cutoff; the 50 rejected pre-freeze equity rows never reached the file).

### Decision-time verified/unverified

- Collector cumulative: verified **12**, unverified **164** (labeled, never dropped). This run's 12 new rows: all unverified (`decision_time_verified=False`, factor ledger not mapped by the adapter — known gap).

### Disposition mix (this run)

- crypto: n=176 cumulative; prod={'unscored': 167, 'issued': 9}, c2={'unscored': 171, 'issued': 5}.
- This run's 12 rows: prod 12x `unscored`, c2 12x `unscored` (known adapter gap). The 5 previously paired issued rows remain the only both-issued set.
- equity: n=0 (50 pre-freeze rejected before scoring; export excluded 0 at its stage, collector enforced cutoff itself).

### Direction disagreement vs the 40% audit trigger

- 0/5 = **0.0%** (5 paired issued rows with both arms; production and C-2 agree on all) — audit trigger NOT fired.

### Collection-window membership (2026-10-14 -> 2026-12-31 UTC)

- in_window: **176** cumulative (window membership confirmed by the collector summary and the cutoff re-check).

### First post-freeze row

- Unchanged: `rows/first-post-freeze-opportunity-2026-10-14.json` carries a real record (status `first_row_collected`) from a prior run. No overwrite per spec.

### Quarantine check

- Retrospective cohort (`cohort-retrospective-v2.csv`) not written. Legacy pilot file untouched. Quarantined v1 file untouched. 50 pre-freeze equity candidates logged as rejected, never appended. No hand-edits to any row.

### Outcome

- **Routine run with 12 new rows:** the live collection path behaved end to end (live action -> export 0 exclusions -> frozen-harness scoring -> idempotent append, 92 deduped). All new rows are post-freeze and carry the 2.1.5 stamp; all 12 remain `unscored` on both arms (known adapter gap, decision-time unverified). No audit trigger, no blocker, not the first row — per spec, no chat report.

## Run 2026-10-18T23:42Z (scheduled 19:40 EDT)

- UTC timestamp: 2026-10-18T23:42Z. Active manifest read from `ACTIVE_MANIFEST`: **freeze-manifest-v2.1.5.json** (post-freeze cutoff `2026-10-14T04:57:00Z`, read from the manifest per spec).
- Live stream: `getpaperpilotstatus` on `altcoin-analyzer-and-signal-tracker` OK (one transient "space worker overloaded" on first attempt; succeeded on retry) -> `live-paper-status-2026-10-18T2342Z.json` (100 candidates, 179 comparisons, 17 alerts, 13 checkpoints, 4 signals, 12 handoff runs; status payload saved as inner `data` object matching prior runs' format, round-trip validated). Live export: 104 candidates, 0 pre-freeze excluded at export stage, 12 deployed runs seen -> `live-paper-export-2026-10-18T2342Z.json`.

### Rows added / deduped

- Rows added: **12** (live-paper-cand-168..179: BTW, Q, ANVL, BR, VEREM, GRX, ICNT — deployed discovery handoffs at 18:59:52Z, 20:59:48Z, 22:58:31Z on 2026-10-18). Rows deduped: **92** (candidate_id + freeze_version). Vessel: `rows/cohort-prospective-v2.csv` (69 cols), data rows 176 -> **188**.

### Verify-before-trust

- (a) freeze_version stamp: all 188 vessel rows read **2.1.5** (verified from the CSV independently of the collector, including the 12 new rows) — no mismatch.
- (b) Vessel written is `rows/cohort-prospective-v2.csv` — confirmed by the collector summary and the file's row count (189 lines incl. header).
- (c) Pre-freeze append: **0** (12 new rows decision_at >= 2026-10-18T18:59:52Z >= cutoff; the 50 rejected pre-freeze equity rows never reached the file).

### Decision-time verified/unverified

- Collector cumulative: verified **12**, unverified **176** (labeled, never dropped). This run's 12 new rows: all unverified (`decision_time_verified=False`, factor ledger not mapped by the adapter — known gap).

### Disposition mix (this run)

- crypto: n=188 cumulative; prod={'unscored': 179, 'issued': 9}, c2={'unscored': 183, 'issued': 5}.
- This run's 12 rows: prod 12x `unscored`, c2 12x `unscored` (known adapter gap). The 5 previously paired issued rows remain the only both-issued set.
- equity: n=0 (50 pre-freeze rejected before scoring; export excluded 0 at its stage, collector enforced cutoff itself).

### Direction disagreement vs the 40% audit trigger

- 0/5 = **0.0%** (5 paired issued rows with both arms; production and C-2 agree on all) — audit trigger NOT fired.

### Collection-window membership (2026-10-14 -> 2026-12-31 UTC)

- in_window: **188** cumulative (window membership confirmed by the collector summary and the cutoff re-check).

### First post-freeze row

- Unchanged: `rows/first-post-freeze-opportunity-2026-10-14.json` carries a real record (status `first_row_collected`) from a prior run. No overwrite per spec.

### Quarantine check

- Retrospective cohort (`cohort-retrospective-v2.csv`) not written. Legacy pilot file untouched. Quarantined v1 file untouched. 50 pre-freeze equity candidates logged as rejected, never appended. No hand-edits to any row.

### Operational note — executable hashes vs manifest

- `harness.py` sha256 matches the v2.1.5 manifest exactly. `collect_pilot_rows.py` and `live_paper_stream.py` do NOT match the manifest's recorded `executable_hashes` (both files post-date the freeze: mtimes 2026-10-15 00:57 and 2026-10-14 23:56). Stamp provenance is unaffected — `ACTIVE_FREEZE_VERSION` is read live from the active manifest (`freeze-manifest-v2.1.5.json`) and every vessel row was independently verified as 2.1.5; scoring core is the hash-matching harness. Logged as a freeze-discipline deviation (operational amendment without manifest update), not a blocker; not stopping the run per spec (spec's stop conditions are action failure and stamp mismatch, neither triggered). All prior runs since the file change have verified clean stamps.

### Outcome

- **Routine run with 12 new rows:** the live collection path behaved end to end (live action -> export 0 exclusions -> frozen-harness scoring -> idempotent append, 92 deduped). All new rows are post-freeze and carry the 2.1.5 stamp; all 12 remain `unscored` on both arms (known adapter gap, decision-time unverified). No audit trigger, no blocker, not the first row — per spec, no chat report.

## Run 2026-10-19T05:40Z (scheduled 01:40 EDT)

- UTC timestamp: 2026-10-19T05:40Z. Active manifest read from `ACTIVE_MANIFEST`: **freeze-manifest-v2.1.5.json** (post-freeze cutoff `2026-10-14T04:57:00Z`, read from the manifest per spec).
- Live stream: `getpaperpilotstatus` on `altcoin-analyzer-and-signal-tracker` OK on first attempt -> `live-paper-status-2026-10-19T0540Z.json` (100 candidates, 195 comparisons, 20 alerts, 15 checkpoints; status payload saved as inner `data` object matching prior runs' format, round-trip validated). Live export: 105 candidates, 0 pre-freeze excluded at export stage, 12 deployed runs seen -> `live-paper-export-2026-10-19T0540Z.json`.
- Operational note (this run): a stray `python3 collect_pilot_rows.py --help` invocation executed the collector without `--live-export=` (DB-copy ingest path), rejecting pre-freeze DB candidates and writing NOTHING — CSV held at 189 lines, verified by `wc -l` before the proper run. No state changed; logged for transparency.

### Rows added / deduped

- Rows added: **17** (live-paper-5 + live-paper-cand-180..195: deployed discovery handoffs at 2026-10-18T23:49:05Z, 2026-10-19T00:57:59Z, 2026-10-19T02:57:11Z). Rows deduped: **88** (candidate_id + freeze_version). Vessel: `rows/cohort-prospective-v2.csv` (69 cols), data rows 188 -> **205**.

### Verify-before-trust

- (a) freeze_version stamp: all 205 vessel rows read **2.1.5** (verified from the CSV independently of the collector, including all 17 new rows) — no mismatch.
- (b) Vessel written is `rows/cohort-prospective-v2.csv` — confirmed by the collector summary and the file's row count (206 lines incl. header).
- (c) Pre-freeze append: **0** (17 new rows decision_at in [2026-10-18T23:49:05Z, 2026-10-19T02:57:11Z] >= cutoff; the 50 rejected pre-freeze equity rows never reached the file).

### Decision-time verified/unverified

- Collector cumulative: verified **13**, unverified **192** (labeled, never dropped). This run's 17 new rows: **1 verified** (live-paper-5, the issued row), 16 unverified (`decision_time_verified=False`, factor ledger not mapped by the adapter — known gap).

### Disposition mix (this run)

- crypto: n=205 cumulative; prod={'unscored': 195, 'issued': 10}, c2={'unscored': 200, 'issued': 5}.
- This run's 17 rows: prod 16x `unscored` + 1x `issued`; c2 17x `unscored`. The issued row: **live-paper-5** (BTC long @ 82297.89, decision_at 2026-10-19T00:57:59Z, decision-time verified; prod issued / c2 unscored). The 5 previously paired issued rows (cand 41..45) remain the only both-issued set.
- equity: n=0 (50 pre-freeze rejected before scoring; export excluded 0 at its stage, collector enforced cutoff itself).

### Direction disagreement vs the 40% audit trigger

- 0/5 = **0.0%** (5 paired issued rows with both arms; independently verified from the CSV: all 5 prod long / c2 long) — audit trigger NOT fired.

### Collection-window membership (2026-10-14 -> 2026-12-31 UTC)

- in_window: **205** cumulative (window membership confirmed by the collector summary and the cutoff re-check).

### First post-freeze row

- Unchanged: `rows/first-post-freeze-opportunity-2026-10-14.json` carries a real record (status `first_row_collected`) from a prior run. No overwrite per spec.

### Quarantine check

- Retrospective cohort (`cohort-retrospective-v2.csv`) not written. Legacy pilot file untouched. Quarantined v1 file untouched. 50 pre-freeze equity candidates logged as rejected, never appended. No hand-edits to any row.

### Operational note — executable hashes vs manifest

- `harness.py` sha256 matches the v2.1.5 manifest exactly. `collect_pilot_rows.py` and `live_paper_stream.py` do NOT match the manifest's recorded `executable_hashes` (known since 2026-10-15, unchanged). Stamp provenance unaffected — `ACTIVE_FREEZE_VERSION` is read live from the active manifest and every vessel row was independently verified as 2.1.5; scoring core is the hash-matching harness. Not a blocker; not stopping the run per spec (spec's stop conditions are action failure and stamp mismatch, neither triggered).

### Outcome

- **Routine run with 17 new rows:** the live collection path behaved end to end (live action -> export 0 exclusions -> frozen-harness scoring -> idempotent append, 88 deduped). All new rows are post-freeze and carry the 2.1.5 stamp; 16 of 17 remain `unscored` on both arms (known adapter gap, decision-time unverified). One new prod-issued row (live-paper-5, BTC long, verified). No audit trigger, no blocker, not the first row — per spec, no chat report.

## Run 2026-10-19T11:40Z (scheduled 07:40 EDT)

- UTC timestamp: 2026-10-19T11:40Z. Active manifest read from `ACTIVE_MANIFEST`: **freeze-manifest-v2.1.5.json** (post-freeze cutoff `2026-10-14T04:57:00Z`, read from the manifest per spec).
- Live stream: `getpaperpilotstatus` on `altcoin-analyzer-and-signal-tracker` OK on first attempt -> `live-paper-status-2026-10-19T1140Z.json` (100 candidates, 200 comparisons, 21 alerts, 16 checkpoints, 5 signals, 12 handoff runs; status payload saved as inner `data` object matching prior runs' format, round-trip validated: zero truncation markers). Live export: 105 candidates, 0 pre-freeze excluded at export stage, 12 deployed runs seen -> `live-paper-export-2026-10-19T1140Z.json`.

### Rows added / deduped

- Rows added: **7** (live-paper-cand-196..202: BTC, ZRO, Q, ANVL, BR, VEREM, OSMO — deployed discovery handoff run 110, decision_at 2026-10-19T10:58:52.043Z, created 2026-10-19T11:00:20Z). Rows deduped: **98** (candidate_id + freeze_version). Vessel: `rows/cohort-prospective-v2.csv` (69 cols), data rows 205 -> **212**.

### Verify-before-trust

- (a) freeze_version stamp: all 212 vessel rows read **2.1.5** (verified from the CSV independently of the collector, including all 7 new rows) — no mismatch.
- (b) Vessel written is `rows/cohort-prospective-v2.csv` — confirmed by the collector summary and the file's row count (213 lines incl. header).
- (c) Pre-freeze append: **0** (7 new rows decision_at 2026-10-19T10:58:52Z >= cutoff; 50 rejected pre-freeze equity rows — decision_at 2026-10-13T00:20:32Z, all equity — never reached the file).

### Decision-time verified/unverified

- Collector cumulative: verified **13**, unverified **199** (labeled, never dropped). This run's 7 new rows: **all unverified** (`decision_time_verified=False`, factor ledger not mapped by the adapter — known gap).

### Disposition mix (this run)

- crypto: n=212 cumulative; prod={'unscored': 202, 'issued': 10}, c2={'unscored': 207, 'issued': 5}.
- This run's 7 rows: prod 7x `unscored`; c2 7x `unscored`. No new issued rows on either arm. The 5 previously paired both-issued rows remain the only both-issued set.
- equity: n=0 (50 pre-freeze rejected before scoring; export excluded 0 at its stage, collector enforced cutoff itself).

### Direction disagreement vs the 40% audit trigger

- 0/5 = **0.0%** (5 paired issued rows with both arms; independently verified from the CSV: all 5 prod long / c2 long) — audit trigger NOT fired.

### Collection-window membership (2026-10-14 -> 2026-12-31 UTC)

- in_window: **212** cumulative (window membership confirmed by the collector summary and the cutoff re-check).

### First post-freeze row

- Unchanged: `rows/first-post-freeze-opportunity-2026-10-14.json` carries a real record (status `first_row_collected`) from a prior run. No overwrite per spec.

### Quarantine check

- Retrospective cohort (`cohort-retrospective-v2.csv`) not written. Legacy pilot file untouched. Quarantined v1 file untouched. 50 pre-freeze equity candidates logged as rejected, never appended. No hand-edits to any row.

### Operational note — executable hashes vs manifest

- `harness.py` sha256 matches the v2.1.5 manifest exactly. `collect_pilot_rows.py` and `live_paper_stream.py` do NOT match the manifest's recorded `executable_hashes` (known since 2026-10-15, unchanged). Stamp provenance unaffected — `ACTIVE_FREEZE_VERSION` is read live from the active manifest and every vessel row was independently verified as 2.1.5; scoring core is the hash-matching harness. Not a blocker; not stopping the run per spec (spec's stop conditions are action failure and stamp mismatch, neither triggered).

### Outcome

- **Routine run with 7 new rows:** the live collection path behaved end to end (live action -> export 0 exclusions -> frozen-harness scoring -> idempotent append, 98 deduped). All new rows are post-freeze and carry the 2.1.5 stamp; all 7 remain `unscored` on both arms (known adapter gap, decision-time unverified). No audit trigger, no blocker, not the first row — per spec, no chat report.

---

## Collection run — 2026-10-19T17:41Z (job: paper-signal-comparison-collection)

### Inputs
- Live action: `getpaperpilotstatus` on `altcoin-analyzer-and-signal-tracker` — ok. Full response saved to `live-paper-status-2026-10-19T1741Z.json` (1,076,997 bytes): 100 candidates, 200 comparisons, 22 alerts, 17 checkpoints.
- Active freeze read live from `freeze-manifest-v2.1.5.json`: `manifest_version` = **2.1.5**; `prospective_collection.post_freeze_cutoff_utc` = **2026-10-14T04:57:00Z** (not guessed).
- Export: `python3 live_paper_stream.py --status ... --out live-paper-export-2026-10-19T1741Z.json` — 105 candidates, excluded pre-freeze: 0, deployed runs seen: 12, `active_freeze_version`=2.1.5, cutoff matches manifest.

### Collector result
- `python3 collect_pilot_rows.py --live-export=live-paper-export-2026-10-19T1741Z.json`: ingested 155 (105 crypto eligible, 50 equity), rejected pre-freeze 50 (logged, never appended).
- **Rows added: 8** (`live-paper-cand-203` .. `live-paper-cand-210`, handoff:111 decisions at 2026-10-19T12:57:39.886Z). **Rows deduped: 97.** Vessel rows total: **220** in `rows/cohort-prospective-v2.csv`.
- Stamp verification: all 8 new rows carry `freeze_version=2.1.5` (independently re-read from CSV). Vessel written is `rows/cohort-prospective-v2.csv`. All 8 new rows `decision_at >= 2026-10-14T04:57:00Z` (parse-verified; range 12:57:39.886Z single instant) — no pre-freeze row appended.

### Decision-time verified/unverified
- Cumulative: verified 13 / unverified 207 (collector summary). New rows: 0/8 verified — all 8 marked `unscored` on both arms (known adapter gap), decision-time unverified per spec.

### Disposition mix (this run)
- crypto: n=220 cumulative; prod={'unscored': 210, 'issued': 10}, c2={'unscored': 215, 'issued': 5}.
- This run's 8 rows: prod 8x `unscored`; c2 8x `unscored`. No new issued rows on either arm. The 5 previously paired both-issued rows remain the only both-issued set.
- equity: n=0 (50 pre-freeze rejected before scoring; export excluded 0 at its stage, collector enforced cutoff itself).

### Direction disagreement vs the 40% audit trigger
- 0/5 = **0.0%** (5 paired issued rows with both arms; independently verified from the CSV: all 5 prod long / c2 long) — audit trigger NOT fired.

### Collection-window membership (2026-10-14 -> 2026-12-31 UTC)
- in_window: **220** cumulative (window membership confirmed by the collector summary and the cutoff re-check).

### First post-freeze row
- Unchanged: `rows/first-post-freeze-opportunity-2026-10-14.json` carries a real record (status `first_row_collected`) from a prior run. No overwrite per spec.

### Quarantine check
- Retrospective cohort (`cohort-retrospective-v2.csv`) not written. Legacy pilot file untouched. Quarantined v1 file untouched. 50 pre-freeze equity candidates logged as rejected, never appended. No hand-edits to any row.

### Outcome
- **Routine run with 8 new rows:** the live collection path behaved end to end (live action -> export 0 exclusions -> frozen-harness scoring -> idempotent append, 97 deduped). All new rows are post-freeze and carry the 2.1.5 stamp; all 8 remain `unscored` on both arms (known adapter gap, decision-time unverified). No audit trigger, no blocker, not the first row — per spec, no chat report.

---

## Collection run — 2026-10-19T23:41Z (job: paper-signal-comparison-collection)

### Inputs
- Live action: `getpaperpilotstatus` on `altcoin-analyzer-and-signal-tracker` — ok. Full response saved to `live-paper-status-2026-10-19T2341Z.json` (1,042,904 bytes): 100 candidates, 200 comparisons, 26 alerts, 21 checkpoints.
- Active freeze read live from `freeze-manifest-v2.1.5.json`: `manifest_version` = **2.1.5**; `prospective_collection.post_freeze_cutoff_utc` = **2026-10-14T04:57:00Z** (not guessed).
- Export: `python3 live_paper_stream.py --status ... --out live-paper-export-2026-10-19T2341Z.json` — 105 candidates, excluded pre-freeze: 0, deployed runs seen: 12, `active_freeze_version`=2.1.5, cutoff matches manifest.

### Collector result
- `python3 collect_pilot_rows.py --live-export=live-paper-export-2026-10-19T2341Z.json`: ingested 155 (105 crypto eligible, 50 equity), rejected pre-freeze 50 (logged, never appended).
- **Rows added: 24** (`live-paper-cand-216` .. `live-paper-cand-229`; handoffs 114-117, decisions at 2026-10-19T18:59:02.370Z / 20:11:01.259Z / 20:59:44.822Z / 22:58:28.787Z, 6 rows each). **Rows deduped: 81.** Vessel rows total: **244** in `rows/cohort-prospective-v2.csv`.
- Stamp verification: all 24 new rows carry `freeze_version=2.1.5` (independently re-read from CSV). Vessel written is `rows/cohort-prospective-v2.csv`. All 24 new rows `decision_at >= 2026-10-14T04:57:00Z` (parse-verified) — no pre-freeze row appended.

### Decision-time verified/unverified
- Cumulative: verified 13 / unverified 231 (collector summary). New rows: 0/24 verified — all 24 marked `unscored` on both arms (`unscored:incomplete-factor-ledger`, known adapter gap), decision-time unverified per spec.

### Disposition mix (this run)
- crypto: n=244 cumulative; prod={'unscored': 234, 'issued': 10}, c2={'unscored': 239, 'issued': 5}.
- This run's 24 rows: prod 24x `unscored`; c2 24x `unscored`. No new issued rows on either arm. The 5 previously paired both-issued rows remain the only both-issued set.
- equity: n=0 (50 pre-freeze rejected before scoring; export excluded 0 at its stage, collector enforced cutoff itself).

### Direction disagreement vs the 40% audit trigger
- 0/5 = **0.0%** (5 paired issued rows with both arms) — audit trigger NOT fired.

### Collection-window membership (2026-10-14 -> 2026-12-31 UTC)
- in_window: **244** cumulative (window membership confirmed by the collector summary and the cutoff re-check).

### First post-freeze row
- Unchanged: `rows/first-post-freeze-opportunity-2026-10-14.json` carries a real record (status `first_row_collected`) from a prior run. No overwrite per spec.

### Quarantine check
- Retrospective cohort (`cohort-retrospective-v2.csv`) not written. Legacy pilot file untouched. Quarantined v1 file untouched. 50 pre-freeze equity candidates logged as rejected, never appended. No hand-edits to any row.

### Outcome
- **Routine run with 24 new rows:** the live collection path behaved end to end (live action -> export 0 exclusions -> frozen-harness scoring -> idempotent append, 81 deduped). All new rows are post-freeze and carry the 2.1.5 stamp; all 24 remain `unscored` on both arms (known adapter gap, decision-time unverified). No audit trigger, no blocker, not the first row — per spec, no chat report.

## Collection run — 2026-10-20T05:52Z (job: paper-signal-comparison-collection)

- **UTC timestamp:** 2026-10-20T05:52Z. Active freeze: v2.1.5 (`freeze-manifest-v2.1.5.json`); cutoff read live from manifest: **2026-10-14T04:57:00Z**. Harness `ACTIVE_FREEZE_VERSION=2.1.5` verified before collection.
- **Live-stream candidate count:** `getpaperpilotstatus` on `altcoin-analyzer-and-signal-tracker` returned OK (full response 956 KB saved to `live-paper-status-2026-10-20T0552Z.json`: 100 candidates, 200 comparisons, 26 alerts, 21 checkpoints). Live export: **105 candidates** post-freeze (`live-paper-export-2026-10-20T0552Z.json`), 0 excluded pre-freeze at the export stage; 12 deployed runs seen. Collector ingested 155 total (105 crypto + 50 equity; the 50 equity came from the status path and were rejected pre-freeze at the collector stage, matching the prior-run pattern).
- **Rows added: 5** (`live-paper-cand-235` .. `live-paper-cand-239`: ZRO, CARDS, BP, BR, DGAI; discovery run 118, decisions at 2026-10-20T00:38:46.621Z). **Rows deduped: 100.** Vessel rows total: **249** in `rows/cohort-prospective-v2.csv`.
- Stamp verification: all 5 new rows carry `freeze_version=2.1.5` (independently re-read from CSV). Vessel written is `rows/cohort-prospective-v2.csv`. All 5 new rows `decision_at >= 2026-10-14T04:57:00Z` (parse-verified) — no pre-freeze row appended.

### Decision-time verified/unverified
- Cumulative: verified 13 / unverified 236 (collector summary). New rows: 0/5 verified — all 5 marked `unscored` on both arms (`unscored:incomplete-factor-ledger`, known adapter gap), decision-time unverified per spec.

### Disposition mix (this run)
- crypto: n=249 cumulative; prod={'unscored': 239, 'issued': 10}, c2={'unscored': 244, 'issued': 5}.
- This run's 5 rows: prod 5x `unscored`; c2 5x `unscored`. No new issued rows on either arm. The 5 previously paired both-issued rows remain the only both-issued set.
- equity: n=0 (50 pre-freeze rejected before scoring; export excluded 0 at its stage, collector enforced cutoff itself).

### Direction disagreement vs the 40% audit trigger
- 0/5 = **0.0%** (5 paired issued rows with both arms) — audit trigger NOT fired.

### Collection-window membership (2026-10-14 -> 2026-12-31 UTC)
- in_window: **249** cumulative (window membership confirmed by the collector summary and the cutoff re-check).

### First post-freeze row
- Unchanged: `rows/first-post-freeze-opportunity-2026-10-14.json` carries a real record (status `first_row_collected`) from a prior run. No overwrite per spec.

### Quarantine check
- Retrospective cohort (`cohort-retrospective-v2.csv`) not written. Legacy pilot file untouched. Quarantined v1 file untouched. 50 pre-freeze equity candidates logged as rejected, never appended. No hand-edits to any row.

### Outcome
- **Routine run with 5 new rows:** the live collection path behaved end to end (live action -> export 0 exclusions -> frozen-harness scoring -> idempotent append, 100 deduped). All new rows are post-freeze and carry the 2.1.5 stamp; all 5 remain `unscored` on both arms (known adapter gap, decision-time unverified). No audit trigger, no blocker, not the first row — per spec, no chat report.

## Collection run — 2026-10-20T11:45Z (job: paper-signal-comparison-collection)

- **UTC timestamp:** 2026-10-20T11:45Z. Active freeze: v2.1.5 (`freeze-manifest-v2.1.5.json`); cutoff read live from manifest: **2026-10-14T04:57:00Z** (`prospective_collection.post_freeze_cutoff_utc`, `manifest_version`=2.1.5, not guessed). Harness stamps from the active manifest.
- **Live-stream candidate count:** `getpaperpilotstatus` on `altcoin-analyzer-and-signal-tracker` returned OK (one transient "space worker overloaded" on first attempt, succeeded on immediate retry; full response 953 KB saved to `live-paper-status-2026-10-20T1145Z.json`: 100 candidates, 200 comparisons, 26 alerts, 21 checkpoints, 5 signals; completeness verified — no truncation markers in the saved envelope). Live export: **105 candidates** post-freeze (`live-paper-export-2026-10-20T1145Z.json`), 0 excluded pre-freeze at the export stage; 12 deployed runs seen. Collector ingested 155 total (105 crypto + 50 equity; the 50 equity came from the status path and were rejected pre-freeze at the collector stage, matching the prior-run pattern).

### Collector result
- `python3 collect_pilot_rows.py --live-export=live-paper-export-2026-10-20T1145Z.json`: ingested 155 (105 crypto eligible, 50 equity), rejected pre-freeze 50 (logged, never appended — all 50 equity at decision_at=2026-10-13T00:20:32.316000Z).
- **Rows added: 6** (`live-paper-cand-240` .. `live-paper-cand-245`: ZRO, AKE, CARDS, BR, ALT, PHA; handoff 123, decisions at 2026-10-20T10:59:06.537Z). **Rows deduped: 99.** Vessel rows total: **255** in `rows/cohort-prospective-v2.csv`.
- Stamp verification: all 6 new rows carry `freeze_version=2.1.5` (independently re-read from CSV; mix across all 255 rows is 255x 2.1.5). Vessel written is `rows/cohort-prospective-v2.csv`. All 6 new rows `decision_at >= 2026-10-14T04:57:00Z` (parse-verified); 0 pre-freeze rows in the vessel overall.

### Decision-time verified/unverified
- Cumulative: verified 13 / unverified 242 (collector summary). New rows: 0/6 verified — all 6 marked `unscored` on both arms (`unscored:incomplete-factor-ledger`, known adapter gap), decision-time unverified per spec (`asOf not recorded on 7 factor input(s)`).

### Disposition mix (this run)
- crypto: n=255 cumulative; prod={'unscored': 245, 'issued': 10}, c2={'unscored': 250, 'issued': 5}.
- This run's 6 rows: prod 6x `unscored`; c2 6x `unscored`. No new issued rows on either arm. The 5 previously paired both-issued rows remain the only both-issued set.
- equity: n=0 (50 pre-freeze rejected before scoring; export excluded 0 at its stage, collector enforced cutoff itself).

### Direction disagreement vs the 40% audit trigger
- 0/5 = **0.0%** (5 paired issued rows with both arms) — audit trigger NOT fired.

### Collection-window membership (2026-10-14 -> 2026-12-31 UTC)
- in_window: **255** cumulative (window membership confirmed by the collector summary and the cutoff re-check).

### First post-freeze row
- Unchanged: `rows/first-post-freeze-opportunity-2026-10-14.json` carries a real record (status `first_row_collected`) from a prior run. No overwrite per spec.

### Quarantine check
- Retrospective cohort (`cohort-retrospective-v2.csv`) not written. Legacy pilot file untouched. Quarantined v1 file untouched. 50 pre-freeze equity candidates logged as rejected, never appended. No hand-edits to any row.

### Outcome
- **Routine run with 6 new rows:** the live collection path behaved end to end (live action -> export 0 exclusions -> frozen-harness scoring -> idempotent append, 99 deduped). All new rows are post-freeze and carry the 2.1.5 stamp; all 6 remain `unscored` on both arms (known adapter gap, decision-time unverified). No audit trigger, no blocker, not the first row — per spec, no chat report.

## Collection run — 2026-10-20T17:43Z (job: paper-signal-comparison-collection)

- **UTC timestamp:** 2026-10-20T17:43Z. Active freeze: v2.1.5 (`freeze-manifest-v2.1.5.json`); cutoff read live from manifest: **2026-10-14T04:57:00Z** (`prospective_collection.post_freeze_cutoff_utc`, `manifest_version`=2.1.5, not guessed). Harness stamps from the active manifest.
- **Live-stream candidate count:** `getpaperpilotstatus` on `altcoin-analyzer-and-signal-tracker` returned OK (five transient "space worker overloaded" errors across ~3 min of backoff before succeeding; full response 959 KB saved to `live-paper-status-2026-10-20T1743Z.json`: 100 candidates, 200 comparisons, 27 alerts, 22 checkpoints; completeness verified — no truncation markers in the saved envelope). Live export: **105 candidates** post-freeze (`live-paper-export-2026-10-20T1743Z.json`), 0 excluded pre-freeze at the export stage; 12 deployed runs seen. Collector ingested 155 total (105 crypto + 50 equity; the 50 equity rejected pre-freeze at the collector stage, matching the prior-run pattern).

### Collector result
- `python3 collect_pilot_rows.py --live-export=live-paper-export-2026-10-20T1743Z.json`: ingested 155 (105 crypto eligible, 50 equity), rejected pre-freeze 50 (logged, never appended — all 50 equity at decision_at=2026-10-13T00:20:32.316000Z).
- **Rows added: 27** (ALT, ARC, BAT, BEAM, BR, CARDS, COMP, JCT, KNTQ, PEPE, PHA, Q, WLD, ZRO; decisions spanning 2026-10-20T12:57:38.524Z -> 2026-10-20T16:59:16.894Z). **Rows deduped: 78.** Vessel rows total: **282** in `rows/cohort-prospective-v2.csv`.
- Stamp verification: all 27 new rows carry `freeze_version=2.1.5` (independently re-read from CSV; mix across all 282 rows is 282x 2.1.5). Vessel written is `rows/cohort-prospective-v2.csv`. All 27 new rows `decision_at >= 2026-10-14T04:57:00Z` (parse-verified); 0 pre-freeze rows in the vessel overall.

### Decision-time verified/unverified
- Cumulative: verified 13 / unverified 269 (collector summary). New rows: 0/27 verified — all 27 marked `unscored` on both arms (`unscored:incomplete-factor-ledger`, known adapter gap), decision-time unverified per spec (`asOf not recorded on 7 factor input(s)`).

### Disposition mix (this run)
- crypto: n=282 cumulative; prod={'unscored': 272, 'issued': 10}, c2={'unscored': 277, 'issued': 5}.
- This run's 27 rows: prod 27x `unscored`; c2 27x `unscored`. No new issued rows on either arm. The 5 previously paired both-issued rows remain the only both-issued set.
- equity: n=0 (50 pre-freeze rejected before scoring; export excluded 0 at its stage, collector enforced cutoff itself).

### Direction disagreement vs the 40% audit trigger
- 0/5 = **0.0%** (5 paired issued rows with both arms) — audit trigger NOT fired.

### Collection-window membership (2026-10-14 -> 2026-12-31 UTC)
- in_window: **282** cumulative (window membership confirmed by the collector summary and the cutoff re-check).

### First post-freeze row
- Unchanged: `rows/first-post-freeze-opportunity-2026-10-14.json` carries a real record (status `first_row_collected`) from a prior run. No overwrite per spec.

### Quarantine check
- Retrospective cohort (`cohort-retrospective-v2.csv`) not written. Legacy pilot file untouched. Quarantined v1 file untouched. 50 pre-freeze equity candidates logged as rejected, never appended. No hand-edits to any row.

### Outcome
- **Routine run with 27 new rows:** the live collection path behaved end to end (live action -> export 0 exclusions -> frozen-harness scoring -> idempotent append, 78 deduped). All new rows are post-freeze and carry the 2.1.5 stamp; all 27 remain `unscored` on both arms (known adapter gap, decision-time unverified). No audit trigger, no blocker, not the first row — per spec, no chat report.

## Collection run — 2026-10-20T23:40Z (job: paper-signal-comparison-collection)

- **UTC timestamp:** 2026-10-20T23:40Z. Active freeze: v2.1.5 (`freeze-manifest-v2.1.5.json`); cutoff read live from manifest: **2026-10-14T04:57:00Z** (`prospective_collection.post_freeze_cutoff_utc`, `manifest_version`=2.1.5, not guessed). Harness stamps from the active manifest.
- **Live-stream candidate count:** `getpaperpilotstatus` on `altcoin-analyzer-and-signal-tracker` returned OK on first attempt (full response ~1.18 MB saved to `live-paper-status-2026-10-20T2340Z.json`: 100 candidates, 200 comparisons, 34 alerts, 26 checkpoints; completeness verified — no truncation markers in the saved envelope). Live export: **108 candidates** post-freeze (`live-paper-export-2026-10-20T2340Z.json`), 0 excluded pre-freeze at the export stage; 12 deployed runs seen. Collector ingested 158 total (108 crypto + 50 equity; the 50 equity rejected pre-freeze at the collector stage, matching the prior-run pattern).

### Collector result
- `python3 collect_pilot_rows.py --live-export=live-paper-export-2026-10-20T2340Z.json`: ingested 158 (108 crypto eligible, 50 equity), rejected pre-freeze 50 (logged, never appended — all 50 equity at decision_at=2026-10-13T00:20:32.316000Z).
- **Rows added: 26** (23 symbols: ALT, ARC, BAT, BEAM, BR, CARDS, COMP, CRV, CVX, DIEM, JCT, KNTQ, LIT, ORE, PEPE, PHA, POD, PUMP, RAY, VVV, WLD, ZEC, ZRO; all decisions at 2026-10-20T22:59:12.577Z, one handoff batch). **Rows deduped: 82.** Vessel rows total: **308** in `rows/cohort-prospective-v2.csv`.
- Stamp verification: all 26 new rows carry `freeze_version=2.1.5` (independently re-read from CSV; mix across all 308 rows is 308x 2.1.5). Vessel written is `rows/cohort-prospective-v2.csv`. All 26 new rows `decision_at >= 2026-10-14T04:57:00Z` (parse-verified); 0 pre-freeze rows in the vessel overall. Dedupe key (candidate_id + freeze_version) uniqueness verified across all 308 rows.

### Decision-time verified/unverified
- Cumulative: verified 16 / unverified 292 (collector summary).
- New rows: 3/26 verified — `live-paper-6` (PEPE), `live-paper-7` (BAT), `live-paper-8` (COMP); all three are prod-issued with c2 unscored. Remaining 23/26 marked `unscored` on both arms, decision-time unverified per spec.

### Disposition mix (this run)
- crypto: n=308 cumulative; prod={'unscored': 295, 'issued': 13}, c2={'unscored': 303, 'issued': 5}.
- This run's 26 rows: prod 3x `issued` (PEPE, BAT, COMP) + 23x `unscored`; c2 26x `unscored`. The 5 previously paired both-issued rows remain the only both-issued set (new prod-issued rows have c2 unscored, so the paired set is unchanged).
- equity: n=0 (50 pre-freeze rejected before scoring; export excluded 0 at its stage, collector enforced cutoff itself).

### Direction disagreement vs the 40% audit trigger
- 0/5 = **0.0%** (5 paired issued rows with both arms) — audit trigger NOT fired.

### Collection-window membership (2026-10-14 -> 2026-12-31 UTC)
- in_window: **308** cumulative (window membership confirmed by the collector summary and the cutoff re-check).

### First post-freeze row
- Unchanged: `rows/first-post-freeze-opportunity-2026-10-14.json` carries a real record (status `first_row_collected`) from a prior run. No overwrite per spec.

### Quarantine check
- Retrospective cohort (`cohort-retrospective-v2.csv`) not written. Legacy pilot file untouched. Quarantined v1 file untouched. 50 pre-freeze equity candidates logged as rejected, never appended. No hand-edits to any row.

### Outcome
- **Routine run with 26 new rows:** the live collection path behaved end to end (live action -> export 0 exclusions -> frozen-harness scoring -> idempotent append, 82 deduped). All new rows are post-freeze and carry the 2.1.5 stamp; 3 of the 26 are decision-time verified (all three prod-issued: PEPE, BAT, COMP) — the first verified rows this week — while 23 remain `unscored` on both arms (known adapter gap). No audit trigger, no blocker, not the first row — per spec, no chat report.

## Collection run — 2026-10-21T05:40Z (job: paper-signal-comparison-collection)

- **UTC timestamp:** 2026-10-21T05:40Z. Active freeze: v2.1.5 (`freeze-manifest-v2.1.5.json`); cutoff read live from manifest: **2026-10-14T04:57:00Z** (`prospective_collection.post_freeze_cutoff_utc`, `manifest_version`=2.1.5, not guessed). Harness stamps from the active manifest (`harness.ACTIVE_FREEZE_VERSION`=2.1.5 verified live at run start).
- **Live-stream candidate count:** `getpaperpilotstatus` on `altcoin-analyzer-and-signal-tracker` returned OK on first attempt (full response ~1.19 MB saved to `live-paper-status-2026-10-21T0540Z.json`: 100 candidates, 200 comparisons, 36 alerts, 28 checkpoints; completeness verified — no truncation markers in the saved envelope). Live export: **108 candidates** post-freeze (`live-paper-export-2026-10-21T0540Z.json`), 0 excluded pre-freeze at the export stage; 12 deployed runs seen. Collector ingested 158 total (108 crypto + 50 equity; the 50 equity rejected pre-freeze at the collector stage, matching the prior-run pattern).

### Collector result
- `python3 collect_pilot_rows.py --live-export=live-paper-export-2026-10-21T0540Z.json`: ingested 158 (108 crypto eligible, 50 equity), rejected pre-freeze 50 (logged, never appended — all 50 equity at decision_at=2026-10-13T00:20:32.316000+00:00).
- **Rows added: 26** (16 symbols: ARC, BR, CARDS, COMP, CVX, ICNT, IVVON, JCT, KNTQ, ORE, PHA, POD, PUMP, STONK, WLD, ZRO; decisions at 2026-10-21T01:48:26.428Z and 2026-10-21T04:39:59.798Z — two handoff batches that arrived after the 2026-10-20T23:40Z run). **Rows deduped: 82.** Vessel rows total: **334** in `rows/cohort-prospective-v2.csv`.
- Stamp verification: all 26 new rows carry `freeze_version=2.1.5` (independently re-read from CSV; mix across all 334 rows is 334x 2.1.5). Vessel written is `rows/cohort-prospective-v2.csv`. All 26 new rows `decision_at >= 2026-10-14T04:57:00Z` (parse-verified); 0 pre-freeze rows in the vessel overall. Dedupe key (candidate_id + freeze_version) uniqueness verified across all 334 rows; 69 columns.

### Decision-time verified/unverified
- Cumulative: verified 16 / unverified 318 (collector summary).
- New rows: 0/26 verified — all 26 marked `unscored` on both arms, decision-time unverified per spec (known adapter gap).

### Disposition mix (this run)
- crypto: n=334 cumulative; prod={'unscored': 321, 'issued': 13}, c2={'unscored': 329, 'issued': 5}.
- This run's 26 rows: prod 26x `unscored`; c2 26x `unscored`. The 5 previously paired both-issued rows remain the only both-issued set (unchanged).
- equity: n=0 (50 pre-freeze rejected before scoring; export excluded 0 at its stage, collector enforced cutoff itself).

### Direction disagreement vs the 40% audit trigger
- 0/5 = **0.0%** (5 paired issued rows with both arms) — audit trigger NOT fired.

### Collection-window membership (2026-10-14 -> 2026-12-31 UTC)
- in_window: **334** cumulative (window membership confirmed by the collector summary and the cutoff re-check).

### First post-freeze row
- Unchanged: `rows/first-post-freeze-opportunity-2026-10-14.json` carries a real record (status `first_row_collected`) from a prior run. No overwrite per spec.

### Quarantine check
- Retrospective cohort (`cohort-retrospective-v2.csv`) not written. Legacy pilot file untouched. Quarantined v1 file untouched. 50 pre-freeze equity candidates logged as rejected, never appended. No hand-edits to any row.

### Outcome
- **Routine run with 26 new rows:** the live collection path behaved end to end (live action -> export 0 exclusions -> frozen-harness scoring -> idempotent append, 82 deduped). All new rows are post-freeze and carry the 2.1.5 stamp; all 26 are decision-time unverified (prod-issued count unchanged at 13, c2 unchanged at 5). No audit trigger, no blocker, not the first row — per spec, no chat report.

## Collection run — 2026-10-21T11:40Z (job: paper-signal-comparison-collection)

- **UTC timestamp:** 2026-10-21T11:40Z. Active freeze: v2.1.5 (`freeze-manifest-v2.1.5.json`); cutoff read live from manifest: **2026-10-14T04:57:00Z** (`prospective_collection.post_freeze_cutoff_utc`, `manifest_version`=2.1.5, not guessed).
- **Live-stream candidate count:** `getpaperpilotstatus` on `altcoin-analyzer-and-signal-tracker` returned OK on first attempt (full response ~1.05 MB saved to `live-paper-status-2026-10-21T1140Z.json`: 100 candidates, 200 comparisons, 39 alerts, 30 checkpoints; completeness verified — no truncation markers in the saved envelope). Live export: **109 candidates** post-freeze (`live-paper-export-2026-10-21T1140Z.json`), 0 excluded pre-freeze at the export stage; 12 deployed runs seen. Collector ingested 159 total (109 crypto + 50 equity; the 50 equity rejected pre-freeze at the collector stage, matching the prior-run pattern).
- **Discovery observations:** `getdiscoveryobservations` returned OK — run **137** (degraded: research synthesis timed out; 14/15 sources live), 20 rows (18 directional + 2 watch/fail notes) saved to `discovery-observations-2026-10-21T1140Z.json`. Funnel for run 137 returned OK and was saved to `discovery-funnel-2026-10-21T1140Z.json`: S0 500→500, S1 500→244 (256 volume_below_threshold), S2 214→214 (tier split 2/33/111/68), S3 20→0 (20 legacy_bar_fail), S4–S6 0→0. NOTE: the funnel file was first written with two transcription defects (a duplicated run-132 entry and S4 input=20); caught on re-read against the action response and rewritten correct before any downstream use. The observations file likewise had one tierLabel transcription error (grx-chain) corrected on re-check.

### Collector result
- `python3 collect_pilot_rows.py --live-export=live-paper-export-2026-10-21T1140Z.json`: ingested 159 (109 crypto eligible, 50 equity), rejected pre-freeze 50 (logged, never appended — all 50 equity at decision_at=2026-10-13T00:20:32.316000+00:00).
- **Rows added: 15** (14 symbols: AKE, ARC, BEAM, BR, CARDS, COMP, CVX×2, IOST, JCT, KNTQ, PEARL, PHA, WLD, ZRO; all decisions at 2026-10-21T06:58:19.961Z — the handoff-136 batch that arrived after the 05:40Z run). **Rows deduped: 94.** Vessel rows total: **349** in `rows/cohort-prospective-v2.csv`.
- Stamp verification: all 15 new rows carry `freeze_version=2.1.5` (independently re-read from CSV; mix across all 349 rows is 349x 2.1.5). Vessel written is `rows/cohort-prospective-v2.csv`. All 15 new rows `decision_at >= 2026-10-14T04:57:00Z` (parse-verified); 0 pre-freeze rows in the vessel overall. 69 columns.

### Decision-time verified/unverified
- Cumulative: verified 17 / unverified 332 (collector summary).
- New rows: 1/15 verified — `live-paper-9` (CVX), prod-issued with reason "all factor inputs asOf <= decisionAt". Remaining 14/15 marked `unscored` on both arms, decision-time unverified per spec (known adapter gap).

### Disposition mix (this run)
- crypto: n=349 cumulative; prod={'unscored': 335, 'issued': 14}, c2={'unscored': 344, 'issued': 5}.
- This run's 15 rows: prod 14x `qualified/unscored` + 1x `issued` (CVX); c2 15x `unscored`. The 5 previously paired both-issued rows remain the only both-issued set (unchanged).
- equity: n=0 (50 pre-freeze rejected before scoring; export excluded 0 at its stage, collector enforced cutoff itself).

### Direction disagreement vs the 40% audit trigger
- 0/5 = **0.0%** (5 paired issued rows with both arms) — audit trigger NOT fired.

### Collection-window membership (2026-10-14 -> 2026-12-31 UTC)
- in_window: **349** cumulative (window membership confirmed by the collector summary and the cutoff re-check).

### Challenger-R1 v2 shadow summary
- Scorer (`challenger_r1_v2.py`, registration `challenger-r1-v2` frozen 2026-10-21T07:08:55Z): rule-text hash verified on run (no mismatch). candidates_seen=100, refused_pre_registration=100 (all decided before the v2 freeze — refused by design, normal), already_recorded=0, **newly_scored=0** (0 newly scored — normal). Divergence count: paired_comparison=0, mechanics_proof_only=0. Unverified-drift: 0. Shadow enrollments written: 0. **R4 upstream-population records written: 20** (`rows/challenger-r1-r4-population-v2.jsonl`) from discovery run 137's observation rows.
- Shadow evaluator (`challenger_shadow_eval.py`): open_enrollments=0, already_closed=0, results=[] — 0 shadow outcomes closed. Isolated from production; no production positions touched.

### First post-freeze row
- Unchanged: `rows/first-post-freeze-opportunity-2026-10-14.json` carries a real record (status `first_row_collected`) from a prior run. No overwrite per spec.

### Quarantine check
- Retrospective cohort (`cohort-retrospective-v2.csv`) not written. Legacy pilot file untouched. Quarantined v1 file untouched. v1 scorer NOT run (v1 accrual closed; v1 records stay v1). 50 pre-freeze equity candidates logged as rejected, never appended. No hand-edits to any row.

### Outcome
- **Routine run with 15 new rows:** the live collection path behaved end to end (live action -> export 0 exclusions -> frozen-harness scoring -> idempotent append, 94 deduped). All new rows are post-freeze and carry the 2.1.5 stamp; 1 of the 15 is decision-time verified (CVX, prod-issued) while 14 remain `unscored` on both arms (known adapter gap). Challenger-R1 v2 shadow: 0 newly scored, 100 refused by design, 20 R4 population records written, 0 shadow enrollments, 0 shadow outcomes closed. No audit trigger, no blocker, not the first row — per spec, no chat report.

## Collection run — 2026-10-21T17:40Z (job: paper-signal-comparison-collection)

- **UTC timestamp:** 2026-10-21T17:40Z. Active freeze: v2.1.5 (`freeze-manifest-v2.1.5.json`); cutoff read live from manifest: **2026-10-14T04:57:00Z** (`prospective_collection.post_freeze_cutoff_utc`, not guessed).
- **Live-stream candidate count:** `getpaperpilotstatus` on `altcoin-analyzer-and-signal-tracker` returned OK on first attempt (full response ~1.32 MB saved to `live-paper-status-2026-10-21T1740Z.json`: 100 candidates, 200 comparisons, 54 alerts, 42 checkpoints, 12 signals; completeness verified — no truncation markers in the saved envelope; freeze `paper-pilot-v2.1.5`, handler_version 2.1.9). Live export: **112 candidates** post-freeze (`live-paper-export-2026-10-21T1740Z.json`), 0 excluded pre-freeze at the export stage; 12 deployed runs seen. Collector ingested 162 total (112 crypto + 50 equity; the 50 equity rejected pre-freeze at the collector stage, matching the prior-run pattern).
- **Discovery observations:** `getdiscoveryobservations` returned OK — run **140** (degraded: altFINS signals feed unavailable (budget cap), coinMarketCap keyless top 100 unavailable, research synthesis timed out; 12/15 sources live; completedAt 2026-10-21T17:00:03.417Z), 22 rows (19 long + 1 short + 2 watch) saved to `discovery-observations-2026-10-21T1740Z.json` (parse-verified: 22 rows, run 140). Funnel for run 140 returned OK and was saved verbatim to `discovery-funnel-2026-10-21T1740Z.json`: S0 500→500, S1 500→251 (249 volume_below_threshold), S2 232→232 (tier split 3/35/111/83 T1–T4), S3 22→5 (17 legacy_bar_fail), S4 5→4 (1 ath_hard_gate), S5 4→3 (1 t1_doors_missing; 8 diagnostic theory_gate_absent entries), S6 4→0 (4 graduation_below_bar; input/survivor numbering as reported by the action).

### Collector result
- `python3 collect_pilot_rows.py --live-export=live-paper-export-2026-10-21T1740Z.json`: ingested 162 (112 crypto eligible, 50 equity), rejected pre-freeze 50 (logged, never appended — all 50 equity at decision_at=2026-10-13T00:20:32.316000+00:00).
- **Rows added: 53** (24 symbols: AI, AKE, ARC, BR, CARDS, COMP, CVX, GRX, IOST, JCT, KNTQ, MAGMA, MOOLAH, NEAR, NOCK, PEARL, PHA, PROM, USELESS, VVV, W, WLD, ZEC, ZRO; decisions at 2026-10-21T12:58:23.150Z ×16, 2026-10-21T14:57:00.192Z ×16, 2026-10-21T17:00:01.994Z ×21 — the handoff-138/139/140 batches that arrived after the 11:40Z run). **Rows deduped: 59.** Vessel rows total: **402** in `rows/cohort-prospective-v2.csv`.
- Stamp verification: all 53 new rows carry `freeze_version=2.1.5` (independently re-read from CSV). Vessel written is `rows/cohort-prospective-v2.csv`. All 53 new rows `decision_at >= 2026-10-14T04:57:00Z`; 0 pre-freeze rows in the vessel. 69 columns.

### Decision-time verified/unverified
- Cumulative: verified 20 / unverified 382 (collector summary).
- New rows: 3/53 verified — ZEC, PHA, NEAR (prod-issued). Remaining 50/53 marked `unscored` on both arms, decision-time unverified per spec (known adapter gap).

### Disposition mix (this run)
- crypto: n=402 cumulative; prod={'unscored': 385, 'issued': 17}, c2={'unscored': 397, 'issued': 5}.
- This run's 53 rows: prod 50x `unscored` + 3x `issued` (ZEC, PHA, NEAR); c2 53x `unscored`. The 5 previously paired both-issued rows remain the only both-issued set (unchanged).
- equity: n=0 (50 pre-freeze rejected before scoring; export excluded 0 at its stage, collector enforced cutoff itself).

### Direction disagreement vs the 40% audit trigger
- 0/5 = **0.0%** (5 paired issued rows with both arms) — audit trigger NOT fired.

### Collection-window membership (2026-10-14 -> 2026-12-31 UTC)
- in_window: **402** cumulative (window membership confirmed by the collector summary and the cutoff re-check).

### Challenger-R1 v2 shadow summary
- Scorer (`challenger_r1_v2.py`, registration `challenger-r1-v2`): rule-text hash verified on run (`0acb756a…` in records matches the live sha256 of `registrations/challenger-r1-v2.rule-text.md` — no mismatch, no edit). candidates_seen=100. already_recorded=14 (scorer's own list). **newly_scored=2** (shadow-v2 records 48→50; handoff-138: JCT concur_abstain, ARC concur_deferred — both concur with production, no divergences on these two). refused_pre_registration≈50 (derived: status candidates with decisionAt < v2 freeze 2026-10-21T07:08:55Z — refused by design). Divergence count: **4** — paired_comparison=2, mechanics_proof_only=2. Unverified-drift: 0. **Shadow enrollments written: 2** (`challenger-r1-v2:enroll:357` CVX long, `challenger-r1-v2:enroll:351` NEAR long; hypothetical, appended to `rows/challenger-r1-shadow-book-v2.jsonl`). **R4 upstream-population records written: 2** (run-140 rows STONK, ZCAT; total 22 in `rows/challenger-r1-r4-population-v2.jsonl`).
- Shadow evaluator (`challenger_shadow_eval.py`): open_enrollments=2, already_closed=0, both `open_no_event` — 0 shadow outcomes closed (no settlement records; shadow-outcomes file not created — normal). NOTE: first invocation exited nonzero with empty stderr while printing the identical correct summary; immediate re-run exited 0 with identical results (open=2, closed=0) — transient, resolved. Isolated from production; no production positions touched.
- v3 registration note: a `challenger-r1-v3` registration + `challenger_r1_v3.py` / `challenger_shadow_eval_v3.py` appeared in the working dir at 18:13–18:15Z (concurrent process, not this run). This run stayed on v2 per spec — v3 untouched, not run.

### First post-freeze row
- Unchanged: `rows/first-post-freeze-opportunity-2026-10-14.json` carries a real record (status `first_row_collected`) from a prior run. No overwrite per spec.

### Quarantine check
- Retrospective cohort (`cohort-retrospective-v2.csv`) not written. Legacy pilot file untouched. Quarantined v1 file untouched. v1 scorer NOT run (v1 accrual closed; v1 records stay v1). 50 pre-freeze equity candidates logged as rejected, never appended. No hand-edits to any row.

### Outcome
- **Routine run with 53 new rows:** the live collection path behaved end to end (live action -> export 0 exclusions -> frozen-harness scoring -> idempotent append, 59 deduped). All new rows are post-freeze and carry the 2.1.5 stamp; 3 of the 53 are decision-time verified (ZEC, PHA, NEAR — prod-issued) while 50 remain `unscored` on both arms (known adapter gap). Challenger-R1 v2 shadow: first post-v2-freeze scoring this run — 2 newly scored (both concur), ~50 refused by design, 4 divergences (2 paired / 2 mechanics-only), 2 hypothetical shadow enrollments (CVX, NEAR), 2 R4 population records, 0 shadow outcomes closed. No audit trigger, no blocker, not the first row — per spec, no chat report.

## Collection run — 2026-10-21T23:40Z (job: paper-signal-comparison-collection)

- **UTC timestamp:** 2026-10-21T23:40Z. Active freeze: v2.1.5 (`freeze-manifest-v2.1.5.json`); cutoff read live from manifest: **2026-10-14T04:57:00Z** (`prospective_collection.post_freeze_cutoff_utc`, not guessed).
- **Live-stream candidate count:** `getpaperpilotstatus` on `altcoin-analyzer-and-signal-tracker` returned OK on first attempt (full response ~1.40 MB saved to `live-paper-status-2026-10-21T2340Z.json`: 100 candidates, 200 comparisons, 67 alerts; completeness verified — 0 truncation markers in the saved envelope; freeze `paper-pilot-v2.1.5`). Live export: **113 candidates** post-freeze (`live-paper-export-2026-10-21T2340Z.json`), 0 excluded pre-freeze at the export stage; 12 deployed runs seen. Collector ingested 163 total (113 crypto + 50 equity; the 50 equity rejected pre-freeze at the collector stage, all at decision_at=2026-10-13T00:20:32.316000+00:00 — the standing equity pattern).
- **Discovery observations:** `getdiscoveryobservations` returned OK — run **144** (status degraded: elfa scheduled discovery unavailable (budget cap reached), research synthesis unavailable (Web artifact inference timed out), 13/15 sources live; completedAt 2026-10-21T23:25:35.472Z; summary: 500-asset catalog -> 3 saved-T1 + 26 velocity qualifiers -> 29 scored (27 fetched, 2 chart-failed) -> 2 passed the discovery bar -> 23 veto suppressions -> 2 retained (0 high / 0 medium / 2 low)). Full response saved to `discovery-observations-2026-10-21T2340Z.json` (parse-verified: run 144). Funnel for run 144 returned OK and was saved verbatim to `discovery-funnel-2026-10-21T2340Z.json`: S0 500->500, S1 500->252 (248 volume_below_threshold), S2 233->233 (tier split 3/36/111/83 T1–T4), S3 29->2 (27 legacy_bar_fail), S4 2->2, S5 2->0 (2 t1_doors_missing; 6 diagnostic theory_gate_absent entries), S6 2->0 (2 graduation_below_bar).

### Collector result
- `python3 collect_pilot_rows.py --live-export=live-paper-export-2026-10-21T2340Z.json`: ingested 163 (113 crypto eligible, 50 equity), rejected pre-freeze 50 (logged, never appended).
- **Rows added: 65** in three handoff batches the 17:40Z run had not yet seen: 2026-10-21T19:00 (19 rows, handoff 141), 2026-10-21T21:59 (22 rows, handoff 143), 2026-10-21T23:25 (24 rows, handoff 144). **Rows deduped: 48.** Vessel rows total: **467** in `rows/cohort-prospective-v2.csv`.
- Stamp verification: all 467 rows carry `freeze_version=2.1.5` (independently re-read from CSV); the 65 new rows all have `decision_at >= 2026-10-14T04:57:00Z`; 0 pre-freeze rows in the vessel. 69 columns. Vessel written is `rows/cohort-prospective-v2.csv`.

### Decision-time verified/unverified
- Cumulative: verified 21 / unverified 446 (collector summary).
- New rows: 1/65 verified — COMP (23:25 batch, prod-issued). Remaining 64/65 marked `unscored` on both arms, decision-time unverified per spec (known adapter gap).

### Disposition mix (this run)
- crypto: n=467 cumulative; prod={'unscored': 449, 'issued': 18}, c2={'unscored': 462, 'issued': 5}.
- This run's 65 rows: prod 64x `unscored` + 1x `issued` (COMP); c2 65x `unscored`. The 5 previously paired both-issued rows remain the only both-issued set (unchanged).
- equity: n=0 (50 pre-freeze rejected before scoring; export excluded 0 at its stage, collector enforced cutoff itself).

### Direction disagreement vs the 40% audit trigger
- 0/5 = **0.0%** (5 paired issued rows with both arms) — audit trigger NOT fired.

### Collection-window membership (2026-10-14 -> 2026-12-31 UTC)
- in_window: **467** cumulative (window membership confirmed by the collector summary and the cutoff re-check).

### Challenger-R1 v3 shadow summary (first run under the v3 registration)
- Scorer (`challenger_r1_v3.py`, registration `challenger-r1-v3` frozen 2026-10-21T19:12:02Z): rule-text hash verified on run (no mismatch, no edit — scorer completed exit 0 and wrote records). candidates_seen=100, refused_pre_registration=55 (derived and independently confirmed: the 55 status candidates with decisionAt < the v3 freeze — refused by design, normal), already_recorded=0, **newly_scored=45** (shadow-v3 records 0->45; scored ids 405-449 exactly match the post-freeze candidate set; scored_at 2026-10-22T00:01:46Z–00:05:12Z). Divergence count: **1** — paired_comparison=1 (candidate 433, ZRO, `levels_reason_split`: baseline `abstained:invalid_frozen_levels` vs challenger `reject:unverified` — missing derivation, wrong-side geometry, crossing visible in pre-decision data), mechanics_proof_only=0. Unverified-drift: 0. Shadow enrollments written: 0 (`rows/challenger-r1-shadow-book-v3.jsonl` not created — no qualifying enrollments this run). **R4 upstream-population records written: 6** (discovery run 144 rows not becoming pilot candidates: USELESS, CHIP, ATH, STONK, ARC, ZCAT; recorded_at 2026-10-22T00:06:00Z).
- NOTE on summary reconstruction: the scorer's stdout was piped through `tail -30`, so the head of its JSON summary (candidates_seen / refused / already_recorded) was display-truncated; refused=55 was derived from the status file and confirmed by exact id-set match of the 45 scored records. Do not pipe scorer summaries through `tail` in future runs — capture full stdout.
- v2 scorer NOT run this run (v2 accrual closed at the v3 freeze per spec; v2 records stay v2).
- Shadow evaluator v2 (`challenger_shadow_eval.py`, registration `challenger-r1-v2`): open_enrollments=2 (`challenger-r1-v2:enroll:357` CVX, `:enroll:351` NEAR), both `open_no_event`, already_closed=0 — 0 shadow outcomes closed. Isolated from production; no production positions touched.
- Shadow evaluator v3 (`challenger_shadow_eval_v3.py`, registration `challenger-r1-v3`): open_enrollments=0, already_closed=0, results=[] — 0 shadow outcomes closed (no v3 enrollments exist yet). Isolated from production; no production positions touched.

### Rejected-abstain sample
- `python3 rejected_abstain_sample.py --status live-paper-status-2026-10-21T2340Z.json`: **5 new samples appended** (sampled_at 2026-10-22T00:04:00Z): abstain-sample:352 WLD, :354 ZRO, :369 ZRO, :389 ZRO, :398 ALT — all Binance Spot, production-model-abstain, measurement-only under crypto-evaluation-v5-corrected. Total 10/50 cap. Open samples walked forward (369, 389, 398 `open_no_event`). Measurement only: nothing issued, nothing enrolled, nothing actionable.

### First post-freeze row
- Unchanged: `rows/first-post-freeze-opportunity-2026-10-14.json` carries a real record (status `first_row_collected`) from a prior run. No overwrite per spec.

### Quarantine check
- Retrospective cohort (`cohort-retrospective-v2.csv`) not written. Legacy pilot file untouched. Quarantined v1 file untouched. v2 scorer NOT run (v2 accrual closed; v2 records stay v2). 50 pre-freeze equity candidates logged as rejected, never appended. No hand-edits to any row.

### Outcome
- **Routine run with 65 new rows:** the live collection path behaved end to end (live action -> export 0 exclusions -> frozen-harness scoring -> idempotent append, 48 deduped). All new rows are post-freeze and carry the 2.1.5 stamp; 1 of the 65 is decision-time verified (COMP, prod-issued) while 64 remain `unscored` on both arms (known adapter gap). Challenger-R1 v3 shadow: first run under the v3 registration — 45 newly scored, 55 refused pre-registration by design, 1 paired_comparison divergence (ZRO levels_reason_split), 0 unverified-drift, 0 shadow enrollments, 6 R4 population records. v2/v3 shadow outcomes: 0 closed. Abstain sample: +5 (10/50). No audit trigger, no blocker, not the first row — per spec, no chat report.

## Collection run — 2026-10-22T0540Z (job: paper-signal-comparison-collection)

- **UTC timestamp:** 2026-10-22T05:40Z. Active freeze: v2.1.5 (`freeze-manifest-v2.1.5.json`); cutoff read live from manifest: **2026-10-14T04:57:00Z** (`prospective_collection.post_freeze_cutoff_utc`, not guessed).
- **Live-stream candidate count:** `getpaperpilotstatus` on `altcoin-analyzer-and-signal-tracker` returned OK on first attempt (full response ~1.28 MB saved to `live-paper-status-2026-10-22T0540Z.json`: 100 candidates, 200 comparisons, 73 alerts, 60 checkpoints; completeness verified — 0 truncation markers in the saved envelope; freeze `paper-pilot-v2.1.5`). Live export: **113 candidates** post-freeze (`live-paper-export-2026-10-22T0540Z.json`), 0 excluded pre-freeze at the export stage; 12 deployed runs seen. Collector ingested 163 total (113 crypto + 50 equity; the 50 equity rejected pre-freeze at the collector stage, all at decision_at=2026-10-13T00:20:32.316000+00:00 — the standing equity pattern).
- **Discovery observations:** `getdiscoveryobservations` returned OK — run **146** (status degraded: research synthesis unavailable, 14/15 sources live; completedAt 2026-10-22T02:57:25.426Z; summary: 500-asset catalog -> 3 saved-T1 + 21 velocity qualifiers -> 24 scored (21 fetched, 3 chart-failed) -> 7 passed the discovery bar (7 main, 0 meme) -> 13 veto suppressions -> 7 retained (4 high / 0 medium / 3 low)). Full response saved to `discovery-observations-2026-10-22T0540Z.json` (parse-verified: run 146). Funnel for run 146 returned OK and was saved to `discovery-funnel-2026-10-22T0540Z.json` (response was small so it was transcribed from the tool result with invariant checks — runId 146, 10 recent runs, stage survivors [500,254,230,7,7,2,0], all asserted fields matching the tool result): S0 500->500, S1 500->254 (246 volume_below_threshold), S2 230->230 (tier split 3/36/111/80 T1–T4), S3 24->7 (17 legacy_bar_fail), S4 7->7, S5 7->2 (5 t1_doors_missing; diagnostic theory_gate_absent entries), S6 7->0 (7 graduation_below_bar).

### Collector result
- `python3 collect_pilot_rows.py --live-export=live-paper-export-2026-10-22T0540Z.json`: ingested 163 (113 crypto eligible, 50 equity), rejected pre-freeze 50 (logged, never appended).
- **Rows added: 34** in two handoff batches the 23:40Z run had not yet seen: 2026-10-22T01:17 (17 rows, handoff 145) and 2026-10-22T02:57 (17 rows, handoff 146). **Rows deduped: 79.** Vessel rows total: **501** in `rows/cohort-prospective-v2.csv`.
- Stamp verification: all 501 rows carry `freeze_version=2.1.5` (independently re-read from CSV); the 34 new rows all have `decision_at >= 2026-10-14T04:57:00Z` (range 2026-10-22T01:17:44.181Z -> 2026-10-22T02:57:24.813Z); 0 pre-freeze rows in the vessel. 69 columns. Vessel written is `rows/cohort-prospective-v2.csv`.

### Decision-time verified/unverified
- Cumulative: verified 21 / unverified 480 (collector summary).
- New rows: 0/34 verified — all 34 `decision_time_verified=False`, both arms `unscored:incomplete-factor-ledger` (known adapter gap).

### Disposition mix (this run)
- crypto: n=501 cumulative; prod={'unscored': 483, 'issued': 18}, c2={'unscored': 496, 'issued': 5}.
- This run's 34 rows: prod 34x `unscored` + c2 34x `unscored` (all `unscored:incomplete-factor-ledger`). The paired both-issued set is unchanged (5 rows).
- equity: n=0 (50 pre-freeze rejected before scoring).

### Direction disagreement vs the 40% audit trigger
- 0/5 = **0.0%** (5 paired issued rows with both arms) — audit trigger NOT fired.

### Collection-window membership (2026-10-14 -> 2026-12-31 UTC)
- in_window: **501** cumulative (window membership confirmed by the collector summary and the cutoff re-check).

### Challenger-R1 v3 shadow summary
- Scorer (`challenger_r1_v3.py`, registration `challenger-r1-v3` frozen 2026-10-21T19:12:02Z): rule-text hash verified on run — `rule_text_sha256=4ca0ebf0867ad47b074ece8c294a885472fff69cc7fbf8b632f3299af065618c` matches `registrations/challenger-r1-v3.registration.json` (independently grep-confirmed); scorer completed exit 0, no mismatch, no edit. candidates_seen=100, refused_pre_registration=21 (confirmed by idempotent re-run: refused=21, already_recorded=79, newly_scored=0 — refused by design, normal), **newly_scored=34 this run** (45 from the earlier 00:04Z run; cumulative 79; scored_at 2026-10-22T05:xx confirmed from `rows/challenger-r1-shadow-v3.jsonl` timestamps). Divergence count: **1** — paired_comparison=1 (candidate 474 COMP, `levels_reason_split`: baseline `abstained:invalid_frozen_levels` vs challenger `concur_abstain`/`reject:unverified` — reason-split on frozen levels, not a direction disagreement), mechanics_proof_only=0. Unverified-drift: 0. Shadow enrollments written: 0. **R4 upstream-population records written: 7** (cumulative 13 in `rows/challenger-r1-r4-population-v3.jsonl`).
- NOTE on summary reconstruction: the scorer's stdout was again piped through `tail`, so the first-pass head (candidates_seen/refused/newly_scored) was display-truncated; refused=21 and the already_recorded/new split were recovered via an idempotent re-run (exit 0, wrote nothing new) and via scored_at timestamps in the shadow file. The tail-truncation habit is now a recurring anti-pattern — capture full stdout for scorer runs.
- v2 scorer NOT run (v2 accrual closed at the v3 freeze per spec; v2 records stay v2).
- Shadow evaluator v2 (`challenger_shadow_eval.py`, registration `challenger-r1-v2`): open_enrollments=2 (`challenger-r1-v2:enroll:357` CVX, `:enroll:351` NEAR), both `open_no_event`, already_closed=0 — 0 shadow outcomes closed. Isolated from production; no production positions touched.
- Shadow evaluator v3 (`challenger_shadow_eval_v3.py`, registration `challenger-r1-v3`): open_enrollments=0, already_closed=0, results=[] — 0 shadow outcomes closed (no v3 enrollments exist yet). Isolated from production; no production positions touched.

### Rejected-abstain sample
- `python3 rejected_abstain_sample.py --status live-paper-status-2026-10-22T0540Z.json`: **5 new samples appended** (sampled_at 2026-10-22T05:56:08Z): abstain-sample:408 PUMP, :410 ZRO, :420 ALT, :430 PUMP, :444 ALT — all Binance Spot, production-model-abstain, measurement-only under crypto-evaluation-v5-corrected. Total 15 distinct sample ids of the 50 cap. Open samples walked forward: **abstain-sample:410 ZRO closed-invalidated** (gross -1.0R, net -1.071321R); 420/430/444 `open_no_event`. Measurement only: nothing issued, nothing enrolled, nothing actionable.

### First post-freeze row
- Unchanged: `rows/first-post-freeze-opportunity-2026-10-14.json` carries a real record (status `first_row_collected`) from a prior run. No overwrite per spec.

### Quarantine check
- Retrospective cohort (`cohort-retrospective-v2.csv`) not written. Legacy pilot file untouched. Quarantined v1 file untouched. v2 scorer NOT run (v2 accrual closed; v2 records stay v2). 50 pre-freeze equity candidates logged as rejected, never appended. No hand-edits to any row.

### Outcome
- **Routine run with 34 new rows:** the live collection path behaved end to end (live action -> export 0 exclusions -> frozen-harness scoring -> idempotent append, 79 deduped). All new rows are post-freeze and carry the 2.1.5 stamp; all 34 remain `unscored` on both arms (known adapter gap). Challenger-R1 v3 shadow: 34 newly scored, 21 refused pre-registration by design, 1 paired_comparison divergence (COMP levels reason-split, not a direction disagreement), 0 unverified-drift, 0 shadow enrollments, 7 R4 population records, hash verified with no mismatch. v2/v3 shadow outcomes: 0 closed. Abstain sample: +5 (15/50), one ZRO sample closed-invalidated at -1.071321R net. No audit trigger, no blocker, not the first row — per spec, no chat report.
