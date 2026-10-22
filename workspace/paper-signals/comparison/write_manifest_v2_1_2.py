#!/usr/bin/env python3
"""Write comparison/freeze-manifest-v2.1.2.json (fix 1 of 5, 2026-10-14).

v2.1.2 is an EXECUTABLE-PATH amendment: it makes the comparison harness's
executable path match the active freeze's operational rules, and aligns the
collector with the plan's prospective vessel. It is NOT a change to
prediction weights, factor sets, scoring formulas, level construction, the
four asserted harness rules (RULES 1-4), or the decision-time rule -- all
carried forward unchanged from v2.1.0/v2.1.1.

Changes from v2.1.1:
  1. HARNESS ISSUANCE-PATH GATE: the superseded historical born-dead gate
     (born_dead_check -- pre-decision signal-day extremes graded as
     stop-outs; DELETED from harness.py) is replaced by the REPAIRED
     operational evaluator (operational_issuance_eval): the waiting-interval
     veto (checkWaitingInterval over the genuine [decisionAt,
     entryObservedAt], setup-history filter, fail-closed), the
     actionable-entry-v1 contract gates (per-terminal entry rule, 15-min
     crypto window, drift caps 1.50 crypto / 0.50 equity, 5-min
     observation-age bound, timestamp ordering, anti-fabrication), and the
     venue mapping (ENTRY_VENUE_ACCEPTED_PRINT_LABELS). Identical for BOTH
     arms; C-2's only difference remains Momentum removal (scoring).
  2. HARNESS MANIFEST BINDING: the hardcoded MANIFEST_VERSION = "2.0.0"
     constant is GONE. The harness loads THE active manifest explicitly at
     runtime: comparison/ACTIVE_MANIFEST names the file, resolved by path
     relative to harness.py; load_active_manifest() fails loudly unless the
     loaded manifest_version == EXPECTED_ACTIVE_VERSION ("2.1.2").
  3. HARNESS SUPPRESSION TAXONOMY: recorded suppressions now classify under
     the repaired evaluator's taxonomy (waiting-interval-invalidation,
     entry-drift/expired/no-quote/venue, issuance-veto). Historical
     pre-decision-extreme reasons keep abstain:born-dead (RULE 1).
  4. COLLECTOR TARGET: rows/cohort-prospective-v2.csv (the plan's vessel),
     not the legacy pilot file. 69-column vessel schema (63 extended + 4
     cohort columns).
  5. COLLECTOR FREEZE STAMP: freeze_version / applicable_freeze come from
     the harness's ACTIVE manifest -- never a hardcoded version string.
  6. COLLECTOR POST-FREEZE CUTOFF: candidates with decision_at before the
     v2.1.0 freeze time (2026-10-14T04:57:00Z, read from this manifest --
     never guessed) are REJECTED before scoring/appending, with a logged
     reason.

Supersession chain: v2.1.0 (executable-core freeze of record: models,
weights, formulas, asserted rules -- bytes immutable) <- v2.1.1
(date-fields-only amendment; superseded as the ACTIVE manifest) <- v2.1.2
(active). v2.1.1's date fields are carried forward unchanged.

Re-running this script re-mints v2.1.2 from the current file bytes (it is a
draft until the fix's tests + reconciliation are green; afterwards the file
is frozen and never edited in place).
"""
import json
import hashlib
import os
import datetime

BASE = os.path.dirname(os.path.abspath(__file__))
WS = os.path.expanduser("~/workspace")


def sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def sha_rel(rel):
    return sha(os.path.join(WS, rel))


CMP = "goals/research-terminal/paper-signals/comparison"

EXECUTABLES = {
    # the fixed executables (hashes recorded so the freeze binds the bytes)
    "comparison/harness.py": sha_rel(f"{CMP}/harness.py"),
    "comparison/collect_pilot_rows.py": sha_rel(f"{CMP}/collect_pilot_rows.py"),
    "comparison/tests/test_harness.py": sha_rel(f"{CMP}/tests/test_harness.py"),
    "comparison/tests/test_collector.py": sha_rel(f"{CMP}/tests/test_collector.py"),
    "comparison/tests/run_tests.py": sha_rel(f"{CMP}/tests/run_tests.py"),
    "comparison/check_reconciliation_v2_1_2.py": sha_rel(
        f"{CMP}/check_reconciliation_v2_1_2.py"),
}

V211 = "freeze-manifest-v2.1.1.json"
V210 = "freeze-manifest-v2.1.0.json"
v211_hash = sha(os.path.join(BASE, V211))
v210_hash = sha(os.path.join(BASE, V210))

# The v2.1.1-recorded v2.1.0 hash must match the bytes on disk (chain intact).
v211 = json.load(open(os.path.join(BASE, V211)))
import re
m = re.search(r"sha256\s+([0-9a-f]{64})", v211["amended_manifest"])
assert m and m.group(1) == v210_hash, "v2.1.0 bytes changed under v2.1.1!"

POST_FREEZE_CUTOFF_UTC = "2026-10-14T04:57:00Z"
assert json.load(open(os.path.join(BASE, V210)))["frozen_at_utc"] == POST_FREEZE_CUTOFF_UTC

manifest = {
    "manifest_version": "2.1.2",
    "frozen_at_utc": datetime.datetime.now(datetime.timezone.utc).strftime(
        "%Y-%m-%dT%H:%M:%SZ"),
    "frozen_by": ("fix-1-of-5 subagent (2026-10-14) -- executable-path alignment: "
                  "harness issuance-path gate + manifest binding + collector "
                  "vessel/stamp/cutoff"),
    "amended_manifest": f"{V211} (sha256 {v211_hash})",
    "v211_sha256": v211_hash,
    "v210_executable_core_sha256": v210_hash,
    "amendment_kind": ("executable-path amendment to freeze-manifest-v2.1.1.json "
                       "(fix 1 of 5, 2026-10-14)"),
    "supersedes": {
        "manifest": V211,
        "status": "SUPERSEDED as the active manifest",
        "marker": "goals/research-terminal/paper-signals/comparison/FREEZE-v2.1.1-SUPERSEDED.md",
        "scope": ("active-manifest status; the harness issuance-path gate semantics "
                  "(historical born-dead mirror -> repaired operational evaluator); "
                  "the harness manifest binding (hardcoded version -> runtime load); "
                  "the collector target/stamp/cutoff. v2.1.0 remains the "
                  "executable-core freeze of record (models, weights, formulas, "
                  "asserted rules); v2.1.1's date fields are carried forward unchanged."),
    },
    "immutability_rule": ("This manifest is immutable once frozen. ANY change to a model's "
                          "factor list, weights, scoring formula, level construction, gate "
                          "rules, entry rule, cost model, horizon, decision-time definition, "
                          "veto semantics, venue mapping, or evaluator version requires a NEW "
                          "manifest version (2.2.0 or 3.0.0). Never edit this file in place. "
                          "freeze-manifest-v2.1.0.json and freeze-manifest-v2.1.1.json are "
                          "IMMUTABLE and have not been edited (bytes verified above)."),
    "scope": ("This amendment changes the HARNESS and COLLECTOR executables to match "
              "the active freeze's operational rules. Nothing about prediction weights, "
              "factor sets, scoring formulas, level construction, the four asserted "
              "harness rules, the decision-time rule, the collection window, or any row "
              "data changes. v2.1.0 remains the freeze of record for the executable core; "
              "v2.1.1 remains the freeze of record for the amended date fields."),
    "changed_fields": [
        {
            "field": "harness.issuance_path_gate",
            "v2_1_1_value": ("born_dead_check mirror on challenger flipped legs "
                             "(pre-decision signal-day extremes graded as stop-outs); "
                             "documented as 'frozen comparison-row semantics'."),
            "v2_1_2_value": ("operational_issuance_eval (harness.py): the repaired "
                             "operational evaluator -- waiting-interval veto "
                             "(checkWaitingInterval over the genuine [decisionAt, "
                             "entryObservedAt], setup-history filter, fail-closed), "
                             "actionable-entry-v1 contract gates (per-terminal entry "
                             "rule, 15-min crypto window, drift caps 1.50 crypto / "
                             "0.50 equity, 5-min observation-age bound, timestamp "
                             "ordering, anti-fabrication), venue mapping "
                             "(ENTRY_VENUE_ACCEPTED_PRINT_LABELS). IDENTICAL for both "
                             "arms; C-2's only difference remains Momentum removal. "
                             "The historical born_dead_check function is DELETED "
                             "(unreachable, statically and behaviorally)."),
            "why": ("The active freeze's operational_rules (v2.1.0, carried by v2.1.1) "
                    "supersede the legacy born-dead veto on the issuance path; the "
                    "harness's executable path must match the freeze. Pre-decision "
                    "extremes are setup-history features, never stop-outs."),
        },
        {
            "field": "harness.manifest_binding",
            "v2_1_1_value": ("MANIFEST_VERSION = '2.0.0' hardcoded in harness.py; "
                             "load_manifest() required the v2.0.0 file (which the "
                             "active freeze had superseded)."),
            "v2_1_2_value": ("harness.py loads THE active manifest explicitly at runtime: "
                             "comparison/ACTIVE_MANIFEST names the file, resolved by path "
                             "relative to harness.py (resolve_active_manifest_path); "
                             "load_active_manifest() raises SchemaError unless the loaded "
                             "manifest_version == EXPECTED_ACTIVE_VERSION ('2.1.2'). "
                             "Import-time, fail-fast. The hardcoded version constant is gone; "
                             "ACTIVE_FREEZE_VERSION = ACTIVE_MANIFEST['manifest_version']."),
            "why": ("A hardcoded version string drifts from the active freeze; the "
                    "harness must fail loudly when its executable path does not match "
                    "the freeze it claims."),
        },
        {
            "field": "harness.suppression_taxonomy",
            "v2_1_1_value": ("_classify_suppression mapped recorded reasons starting "
                             "with 'born-dead' to abstain:born-dead; repaired-pipeline "
                             "reasons fell through to abstain:eligibility."),
            "v2_1_2_value": ("Repaired taxonomy: waiting-interval-invalidation, "
                             "entry-drift, entry-expired, entry-no-quote, entry-venue, "
                             "issuance-veto (new codes); historical pre-decision-extreme "
                             "reasons keep abstain:born-dead (RULE 1); the repaired "
                             "checkSetupInvalidation fail reason ('born-dead ...: "
                             "post-decision extreme crossed ...') classifies as "
                             "waiting-interval-invalidation."),
            "why": ("Post-freeze rows are decided by the repaired pipeline; their "
                    "recorded suppressions must classify under the repaired "
                    "evaluator's vocabulary, not the historical gate's."),
        },
        {
            "field": "harness.born_dead_mirror_columns",
            "v2_1_1_value": ("born_dead_mirror / born_dead_mirror_reason carried the "
                             "historical mirrored gate's verdict ('passed'/'suppressed')."),
            "v2_1_2_value": ("Always None under v2.1.2+: the historical mirrored gate no "
                             "longer runs. Columns retained (frozen schema: never renamed "
                             "or removed); reason codes abstain:born-dead(-mirror) retained "
                             "in the vocabulary for historical rows/reasons."),
            "why": "The gate is superseded; the columns must not carry a verdict from a gate that no longer runs.",
        },
        {
            "field": "collector.target_vessel",
            "v2_1_1_value": ("rows/comparison-rows-pilot-2026-10-14.csv (+ .jsonl twin) "
                             "hardcoded as PILOT_CSV/PILOT_JSONL."),
            "v2_1_2_value": ("rows/cohort-prospective-v2.csv (VESSEL_CSV) -- the plan's "
                             "vessel (COLLECTION-PLAN-2026-10-14.md sect. 2). 69-column "
                             "vessel schema (63 extended + 4 cohort columns), matching the "
                             "vessel header exactly. The legacy pilot file is not a "
                             "collection target anymore."),
            "why": ("Target-vessel mismatch (first-post-freeze-opportunity-2026-10-14.json "
                    "caveat): the plan mandates the prospective vessel; the collector "
                    "must write there."),
        },
        {
            "field": "collector.freeze_stamp",
            "v2_1_1_value": ("freeze_version stamped from harness.MANIFEST_VERSION "
                             "('2.0.0'); dedupe key (candidate_id, '2.0.0')."),
            "v2_1_2_value": ("freeze_version / applicable_freeze stamped from "
                             "harness.ACTIVE_FREEZE_VERSION (the loaded active manifest's "
                             "version); dedupe key (candidate_id, active version). "
                             "provenance_verdict='PROSPECTIVE', cohort_origin names the "
                             "collector."),
            "why": ("Stale freeze stamp (first-post-freeze-opportunity caveat): rows "
                    "collected now must be stamped with the ACTIVE version, never a "
                    "hardcoded string."),
        },
        {
            "field": "collector.post_freeze_cutoff",
            "v2_1_1_value": "none -- pre-freeze candidates were ingested and reported.",
            "v2_1_2_value": (f"Candidates with decision_at before {POST_FREEZE_CUTOFF_UTC} "
                             f"(v2.1.0 freeze time, read from this manifest's "
                             f"prospective_collection.post_freeze_cutoff_utc -- never "
                             f"guessed) are REJECTED before scoring/appending, with a "
                             f"logged reason. Pre-freeze rows belong in "
                             f"cohort-retrospective-v2.csv."),
            "why": ("The prospective vessel accepts ONLY rows decided after the freeze, "
                    "under its executable rules, with PROSPECTIVE provenance "
                    "(rows/README-cohort-prospective-v2.md)."),
        },
    ],
    "executable_hashes": EXECUTABLES,
    "prospective_collection": {
        "post_freeze_cutoff_utc": POST_FREEZE_CUTOFF_UTC,
        "post_freeze_cutoff_source": "freeze-manifest-v2.1.0.json frozen_at_utc (verified above)",
        "vessel": "goals/research-terminal/paper-signals/comparison/rows/cohort-prospective-v2.csv",
        "vessel_schema_columns": 69,
        "collector": "goals/research-terminal/paper-signals/comparison/collect_pilot_rows.py",
    },
    "prediction_weights_unchanged": {
        "statement": ("No prediction weight, factor set, scoring formula, level "
                      "construction, asserted rule, or decision-time rule changes in "
                      "v2.1.2. The harness's frozen scoring constants are byte-identical "
                      "in behavior to v2.1.0/v2.1.1 (pinned by "
                      "tests/test_harness.py::TestManifest::"
                      "test_active_manifest_executable_core_matches_harness)."),
        "crypto_production_total_weight": 17.0,
        "crypto_c2_total_weight": 15.5,
        "crypto_c2_difference": "Momentum (weight 1.5) removed; no rescale",
        "equity_total_weight": 90,
    },
    "unchanged_fields_restated_for_completeness": {
        "operational_rules": ("entry contract (actionable-entry-v1), waiting-interval "
                              "veto, venue mapping, level construction, corrected "
                              "evaluators -- all carried forward from v2.1.0/v2.1.1 "
                              "unchanged; the harness now EXECUTES them on the issuance "
                              "path instead of the superseded gate."),
        "collection_window": "2026-10-14 -> 2026-12-31 (inclusive, UTC) -- UNCHANGED",
        "collection_window_equity_outcome_close": "2027-02-17 (16:00 ET) -- v2.1.1, UNCHANGED",
        "collection_window_readout_by": "2027-02-24 -- v2.1.1, UNCHANGED",
        "asserted_rules": "RULES 1-4 -- UNCHANGED (see harness.py ASSERTED RULES banner)",
        "decision_time_rule": "UNCHANGED",
    },
    "provenance": {
        "parent_task": "Bounded fix 1 of 5: make the executable path match the active freeze",
        "constraints": ("Do NOT reopen the accepted recovery work (entry-v1, veto, "
                        "orchestrator sources untouched -- hashes in v2.1.0); do NOT "
                        "change prediction weights; paper signals only; holdouts locked."),
        "tests": ("comparison/tests/run_tests.py (updated: new assertions a-d; "
                  "superseded-gate tests replaced)"),
        "reconciliation": "comparison/check_reconciliation_v2_1_2.py",
    },
}

out = os.path.join(BASE, "freeze-manifest-v2.1.2.json")
with open(out, "w") as f:
    json.dump(manifest, f, indent=2)
    f.write("\n")
print(f"wrote {out}")
print(f"  v2.1.1 sha256: {v211_hash}")
print(f"  v2.1.0 sha256: {v210_hash}")
for name, h in EXECUTABLES.items():
    print(f"  {name}: {h}")
