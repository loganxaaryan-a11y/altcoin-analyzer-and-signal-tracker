# Factor-ledger mapping finished + run-5 replay (2026-10-14)

Bounded item on the 8 first-post-freeze rows from collection run 5
(`paper-signal-comparison-collection`, 2026-10-14T23:40Z). Paper signals only;
no brokerage, no execution, no model tuning, no frozen-trial contact. Nothing
was restarted; this is additive. The real prospective vessel was NOT written
(scratch replay only).

## 1. Factor-ledger mapping (finished in the existing adapter)

**Path changed:** `paper-signals/comparison/live_paper_stream.py`
- New `_factor_ledger(rec)` builder: reads the deployed `factorLedgerJson`
  (camelCase JSON string, 1831 chars for BTC) plus `factor_ledger_json` /
  `factorLedger` / `factor_ledger` aliases; parses to a list; translates each
  entry to the harness factor schema with `label` = the deployed name
  VERBATIM (`Trend`, `Momentum`, `Volatility`, `Volume`,
  `Positioning / funding`, `Network fundamentals`, `Supply overhang`) --
  no renaming, no invented mapping to the frozen model's labels. Keeps
  `contribution`, `weight`, `evidence`, `reading`, `status`. Absent or
  unparseable -> `None`, never fabricated.
- Wired into both `candidate_from_paper_signal` and
  `candidate_from_paper_candidate` as
  `_factor_ledger(rec) or rec.get("factors") or rec.get("factor_ledger")`.
- Per-factor `asOf` is NOT persisted by the deployed path, so entries carry
  none: the frozen `decision_time_check` labels such rows
  "asOf not recorded on 7 factor input(s); decision-time status labeled, not
  assumed" (named UNKNOWN, never imputed). The deployed `sourceAsOf`
  (2026-10-14T20:22:57.000Z) was deliberately NOT copied onto factor entries.
- Original decision timestamp preserved verbatim on all 8 rows:
  `decisionAt = 2026-10-14T20:26:29.411Z` (never shifted).
- No retrieval used today's data: everything mapped comes from the persisted
  deployed status snapshot `live-paper-status-2026-10-14T2340Z.json`.

**Resulting dispositions (frozen harness rules, unchanged):** the deployed
ledger is a DIFFERENT 7-factor model than the frozen comparison production
set (11 labels) and C-2 set (10 labels). Exact label match: only `Momentum`.
RULE 3 (incomplete ledger -> unscored, never guessed) therefore gives, for
ALL 8 rows on BOTH arms:

- `factor_ledger_available`: `False` -> **`True`**
- prod arm: `unscored:no-factor-ledger` -> **`unscored:incomplete-factor-ledger`**
  (missing 10: Trend cluster, MACD, Perp funding crowding, Open interest,
  Binance futures positioning, Cross-venue taker imbalance, TVL trend,
  Revenue linkage, Developer velocity, Supply-overhang penalty)
- C-2 arm: `unscored:no-factor-ledger` -> **`unscored:incomplete-factor-ledger`**
  (same 10 missing; Momentum drops from the C-2 set but was the only match)
- `decision_time_verified`: `True` -> **`False`** with the explicit
  unlabeled-inputs note (more honest: run 5's `True` was vacuous -- no ledger
  was mapped at all).

The persisted evidence does NOT support scored dispositions under the frozen
rules, so the named-UNKNOWN dispositions stand -- now correctly named. The
run-5 vessel rows were left untouched (immutable trial record); the replay
below demonstrates the corrected mapping.

**Hash drift (flagged, not hidden):** `live_paper_stream.py` sha256 is now
`f421b72873f7ff8a0042f91d1185a9a6da0c451541ae276fbf4eec4ed385f4b2`,
vs `0f6393006d935c82...` recorded in `freeze-manifest-v2.1.5.json`
`executable_hashes`. `tests/test_version_mapping.py` will report this
mismatch. This is the direct consequence of the ordered adapter change (an
operational plumbing fix, not a model/weight/formula change). Whether to
amend the manifest is the parent's/expert's call -- not done here
("no frozen-trial contact").

## 2. Cohort verification (per row)

Freeze v2.1.5 (ACTIVE_MANIFEST -> freeze-manifest-v2.1.5.json, manifest_version
2.1.5); post-freeze cutoff 2026-10-14T04:57:00Z; deployed freeze
paper-pilot-v2.1.0 (frozenAt 2026-10-14T04:54:12.629Z,
freezeHash a7d354a4f8ad9b0af7d3d61986b049f822ee918d28f26f335401d72d24669f84,
productionHash f259e73e1af77c423dadde587e84430e704994afa484e3fedbf5aa6ecfef04cc,
challengerHash d88d534391d5214f5d3775274ea38c27cd1edc61449232c01c3084054313870d).

| candidate_id | sym | decisionAt >= cutoff | stamp 2.1.5 | deployed hashes match | source = deployed status | stage |
|---|---|---|---|---|---|---|
| live-paper-cand-1 | BTC | yes | yes | yes (prod+chall) | yes | discovery-candidate; deployed substate expired / entry_window_expired_before_observation |
| live-paper-cand-2 | BTW | yes | yes | yes | yes | discovery-candidate; deferred / venue_mapping_unavailable |
| live-paper-cand-3 | ZRO | yes | yes | yes | yes | discovery-candidate; deferred / venue_mapping_unavailable |
| live-paper-cand-4 | PRL | yes | yes | yes | yes | discovery-candidate; deferred / venue_mapping_unavailable |
| live-paper-cand-5 | Q | yes | yes | yes | yes | discovery-candidate; deferred / venue_mapping_unavailable |
| live-paper-cand-6 | PONS | yes | yes | yes | yes | discovery-candidate; deferred / venue_mapping_unavailable |
| live-paper-cand-7 | UMXM | yes | yes | yes | yes | discovery-candidate; deferred / venue_mapping_unavailable |
| live-paper-cand-8 | WAL | yes | yes | yes | yes | discovery-candidate; deferred / venue_mapping_unavailable |

Stage labels (explicit, per the "discovery candidates are NOT automatically
dossier recommendations or paper issuances" rule):

- **discovery-candidate: all 8.** Source `data.candidates[]` of the deployed
  status, discovery handoff run 60 (`candidateKey`
  `paper-pilot-v2.1.0:paper-pilot-v2.1.0:handoff:60:<coin>`), decisionAt
  2026-10-14T20:26:29.411Z > cutoff, provenance PROSPECTIVE.
- **dossier-recommendation: none of the 8.** The comparison production arm
  (`crypto-dossier-factor-agreement` 2.0.0-measurement-contract, 11-factor)
  never scored them (incomplete ledger, see §1). The deployed
  `productionScore` is the deployed paper pilot's own 7-factor model -- a
  different model, unverifiable code -- not a comparison-arm recommendation.
- **paper-issuance: none of the 8.** `data.signals[]` is empty in the export;
  no entry was observed (`entryObservedAt` null); deployed states are
  `expired` (BTC) / `deferred` (others). Zero paper signals issued from this
  batch.
- **Ambiguity reported:** row live-paper-cand-1 (BTC)'s
  `operationalEvidenceJson` carries a *hypothetical* note -- "Legacy path
  would have suppressed: born-dead LONG: signal-day low 81018 <=
  invalidation 81528.3816867277". It is not a recorded legacy suppression
  decision, so it does not change the stage label; recorded as ambiguity only.

Machine-readable per-row checks: `REPLAY-FACTOR-LEDGER-EVIDENCE-2026-10-14.json`
(`cohort_verification` array; all checks pass).

## 3. Replay evidence

Replay runner: `/tmp/replay_factor_ledger.py` (scratch; real vessel untouched).
Input: the SAME deployed status snapshot run 5 consumed
(`live-paper-status-2026-10-14T2340Z.json`); adapter re-exported to
`/tmp/replay-factor-ledger-2026-10-14/live-paper-export-replay-2026-10-14.json`;
`collect()` run against a scratch copy of the vessel.

- Adapter re-export: **8 candidates, 8 unique candidate_ids, 0 intra-batch
  duplicates**, 0 excluded pre-freeze, all `decision_at` preserved as
  `2026-10-14T20:26:29.411Z`.
- Collect #1 (empty scratch vessel): ingested 8, eligible 8, rejected 0,
  **rows_added 8, rows_deduped 0**, vessel total 8.
- Collect #2 (same scratch vessel): ingested 8, **rows_added 0,
  rows_deduped 8**, vessel total 8 -- idempotent dedupe on
  (candidate_id, freeze_version) confirmed.
- Per-ID scoring status + named missing inputs: all 8 rows
  `factor_ledger_available=True`, prod + C-2
  `unscored:incomplete-factor-ledger`, 10 missing frozen labels named per arm
  (see `per_id_scoring` in the evidence JSON).
- Real vessel untouched: `rows/cohort-prospective-v2.csv` still 8 rows,
  mtime 2026-10-14T23:46Z (run 5).

## 4. Timestamp regression test

**Path:** `paper-signals/comparison/tests/test_timestamp_adapter_regression.py`
(6 tests, all pass; run standalone -- `run_tests.py` left untouched so its
recorded manifest hash is preserved).

- `test_old_logic_fails_on_deployed_schema`: demonstrates the pre-fix failure
  mode -- snake_case-only extraction returns `None` on a deployed-schema
  record, `_after_cutoff(None)` is `False`, the post-freeze candidate is
  mislabeled pre-freeze and dropped.
- `test_current_logic_extracts_decisionAt`, `test_candidate_path_preserves_decision_timestamp`,
  `test_signal_path_extracts_decisionAt`: the fix extracts `decisionAt` on
  both paths and the candidate survives the cutoff with the timestamp intact.
- `test_absent_timestamp_is_none_not_fabricated`, `test_cutoff_boundary`:
  absent -> None (never fabricated); cutoff boundary behavior.

Pre-existing suite note: `tests/run_tests.py` shows 156 tests, 1 failure --
`test_collector.TestVessel.test_real_vessel_header_matches_schema` asserts the
real vessel is header-only ("pre-collection"), but run 5 already appended the
8 rows at 23:46Z. This failure predates this session and is unrelated to the
adapter change (it reads the vessel file directly).

## 5. Four separate counts (never blended)

- (a) **Candidates collected:** 8 (run 5; replay re-confirms 8 unique, 0 duplicates).
- (b) **Arms scored:** production arm -- **0 scored** (8 unscored:incomplete-factor-ledger);
  C-2 arm -- **0 scored** (8 unscored:incomplete-factor-ledger).
- (c) **Signals issued:** **0** (no issued paper signals in the batch; all 8
  expired/deferred at the deployed handler).
- (d) **Completed outcomes:** **0** (all rows outcome pending / not-graded;
  crypto horizon closes 2027-01-30).

## Paths

- Adapter (changed): `~/workspace/goals/research-terminal/paper-signals/comparison/live_paper_stream.py`
- Regression test: `~/workspace/goals/research-terminal/paper-signals/comparison/tests/test_timestamp_adapter_regression.py`
- Replay evidence (JSON): `~/workspace/goals/research-terminal/paper-signals/comparison/REPLAY-FACTOR-LEDGER-EVIDENCE-2026-10-14.json`
- This report: `~/workspace/goals/research-terminal/paper-signals/comparison/REPLAY-FACTOR-LEDGER-MAPPING-2026-10-14.md`
- Replay runner (scratch): `/tmp/replay_factor_ledger.py`
- Run-5 inputs (read-only): `~/workspace/goals/research-terminal/paper-signals/comparison/live-paper-status-2026-10-14T2340Z.json`,
  `~/workspace/goals/research-terminal/paper-signals/comparison/rows/first-post-freeze-opportunity-2026-10-14.json`
- Real vessel (untouched): `~/workspace/goals/research-terminal/paper-signals/comparison/rows/cohort-prospective-v2.csv`
