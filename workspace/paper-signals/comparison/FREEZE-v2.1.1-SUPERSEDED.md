# FREEZE v2.1.1 — SUPERSEDED as the active manifest by v2.1.2

**Status: SUPERSEDED on 2026-10-14 by `freeze-manifest-v2.1.2.json` (fix 1 of 5).**

`freeze-manifest-v2.1.1.json` is **immutable and kept on disk** — it is not
edited, not deleted. Its five amended date fields
(`collection_window.equity_outcome_close`, `collection_window.readout_by`,
`operational_rules.corrected_evaluator.equity.horizon_calendar_rule`,
`equity_horizon.rule`, `equity_horizon.unresolved_conflict`) are carried
forward UNCHANGED into v2.1.2.

## Why superseded

v2.1.2 is an executable-path amendment (fix 1 of 5): it makes the
comparison harness's executable path match the active freeze's operational
rules and aligns the collector with the plan's prospective vessel. It is
NOT a change to prediction weights, factor sets, scoring formulas, level
construction, the four asserted harness rules, or the decision-time rule.

1. **Harness issuance-path gate**: the superseded historical born-dead gate
   (`born_dead_check` — pre-decision signal-day extremes graded as
   stop-outs; DELETED from `harness.py`) is replaced by the REPAIRED
   operational evaluator (`operational_issuance_eval`): the waiting-interval
   veto (`checkWaitingInterval` over the genuine `[decisionAt,
   entryObservedAt]`, setup-history filter, fail-closed), the
   actionable-entry-v1 contract gates (per-terminal entry rule, 15-min crypto
   window, drift caps 1.50 crypto / 0.50 equity, 5-min observation-age bound,
   timestamp ordering, anti-fabrication), and the venue mapping
   (`ENTRY_VENUE_ACCEPTED_PRINT_LABELS`). Identical for BOTH arms (production
   model and C-2); C-2's only difference remains Momentum removal (scoring).
2. **Harness manifest binding**: the hardcoded `MANIFEST_VERSION = "2.0.0"`
   constant is GONE. The harness loads THE active manifest explicitly at
   runtime (`comparison/ACTIVE_MANIFEST` names the file, resolved by path;
   `load_active_manifest()` fails loudly unless the loaded
   `manifest_version == EXPECTED_ACTIVE_VERSION`). The collector stamps rows
   from the loaded active version, never a hardcoded string.
3. **Suppression taxonomy**: recorded suppressions classify under the
   repaired evaluator's vocabulary (`abstain:waiting-interval-invalidation`,
   `abstain:entry-drift/expired/no-quote/venue`, `abstain:issuance-veto`).
   Historical pre-decision-extreme reasons keep `abstain:born-dead` (RULE 1).
4. **Collector target**: `rows/cohort-prospective-v2.csv` (the plan's
   vessel), not the legacy pilot file. 69-column vessel schema.
5. **Collector freeze stamp**: from the harness's ACTIVE manifest.
6. **Collector post-freeze cutoff**: `decision_at` before the v2.1.0 freeze
   time (2026-10-14T04:57:00Z) is REJECTED before scoring/appending, with a
   logged reason.

Carried forward unchanged from v2.1.1: the five amended date fields, the
collection window, and everything v2.1.1 carried forward from v2.1.0.

## Chain

- v2.1.0: executable-core freeze of record (models, weights, formulas,
  asserted rules) — bytes immutable.
- v2.1.1: date-fields-only amendment — bytes immutable, superseded as the
  ACTIVE manifest.
- v2.1.2: ACTIVE manifest.

## Quarantine

Rows scored under v2.1.0/v2.1.1 are not re-scored. The prospective vessel
(`rows/cohort-prospective-v2.csv`) accepts ONLY rows decided after the
v2.1.0 freeze timestamp, under the active freeze's executable rules, with
`provenance_verdict = PROSPECTIVE`.
