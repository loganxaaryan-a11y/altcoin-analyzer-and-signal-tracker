#!/usr/bin/env python3
"""Tests for the workstream-B prospective collection runner.

Fixtures only -- no live data, no production access, no real pilot file
writes (all file IO goes to tmp dirs). Run: python3 run_tests.py (or pytest).
"""

import csv
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import collect_pilot_rows as col
from collect_pilot_rows import (
    QuarantineError, CollectionError, EXTENDED_COLUMNS, TRACE_COLUMNS,
    COHORT_COLUMNS, VESSEL_COLUMNS, VESSEL_CSV,
    ACTIVE_FREEZE_VERSION, POST_FREEZE_CUTOFF_UTC,
    validate_candidate, derive_issuance_outcome,
    stamp_trace, score_candidates, collect, read_pilot_rows,
    write_pilot_rows, read_vessel_rows, write_vessel_rows,
    existing_keys, backfill_trace, check_post_freeze_cutoff,
)
from harness import ROW_COLUMNS, write_rows_csv, REASON


def f(label, score, weight, as_of=None):
    d = {"label": label, "score": score, "weight": weight,
         "contribution": score * weight}
    if as_of:
        d["asOf"] = as_of
    return d


# All-long ledger: net = 1.5+2.5+1.5 = 5.5 on 17.0
# long = round(50 + (5.5/17)*42) = round(63.588) = 64 -> long (both arms)
LEDGER_LONG = [
    f("Trend cluster", 1, 2.5, "2026-10-14T11:00:00Z"),
    f("Momentum", 1, 1.5, "2026-10-14T11:00:00Z"),
    f("MACD", 1, 1.5, "2026-10-14T11:00:00Z"),
    f("Perp funding crowding", 0, 1.75, "2026-10-14T11:00:00Z"),
    f("Open interest", 0, 1.0, "2026-10-14T11:00:00Z"),
    f("Binance futures positioning", 0, 1.0, "2026-10-14T11:00:00Z"),
    f("Cross-venue taker imbalance", 0, 1.25, "2026-10-14T11:00:00Z"),
    f("TVL trend", 0, 2.0, "2026-10-14T11:00:00Z"),
    f("Revenue linkage", 0, 1.5, "2026-10-14T11:00:00Z"),
    f("Developer velocity", 0, 1.5, "2026-10-14T11:00:00Z"),
    f("Supply-overhang penalty", 0, 1.5, "2026-10-14T11:00:00Z"),
]

# Flip fixture: production long (net +0.25 -> 51), C-2 short (net -1.25 -> 47)
LEDGER_FLIP = [
    f("Trend cluster", -1, 2.5, "2026-10-14T11:00:00Z"),
    f("Momentum", 1, 1.5, "2026-10-14T11:00:00Z"),
    f("MACD", 1, 1.5, "2026-10-14T11:00:00Z"),
    f("Perp funding crowding", 1, 1.75, "2026-10-14T11:00:00Z"),
    f("Open interest", 0, 1.0, "2026-10-14T11:00:00Z"),
    f("Binance futures positioning", 0, 1.0, "2026-10-14T11:00:00Z"),
    f("Cross-venue taker imbalance", 0, 1.25, "2026-10-14T11:00:00Z"),
    f("TVL trend", -1, 2.0, "2026-10-14T11:00:00Z"),
    f("Revenue linkage", 0, 1.5, "2026-10-14T11:00:00Z"),
    f("Developer velocity", 0, 1.5, "2026-10-14T11:00:00Z"),
    f("Supply-overhang penalty", 0, 1.5, "2026-10-14T11:00:00Z"),
]

DECISION_AT = "2026-10-14T12:00:00Z"


def issued_candidate(cid="test-1", ledger=None, **over):
    c = {
        "candidate_id": cid,
        "terminal": "crypto",
        "symbol": "BTC",
        "asset_id": "bitcoin",
        "decision_at": DECISION_AT,
        "issued_at": DECISION_AT,
        "row_origin": "pilot",
        "factors": ledger if ledger is not None else [dict(x) for x in LEDGER_LONG],
        "production_recorded": {"direction": "long", "score": 64},
        "production_decision": "issued",
        "production_suppression_reason": None,
        "eligibility": "passed",
        "eligibility_reason": "test",
        "entry": 67000.0,
        "atr14": 1200.0,
        "signal_day": {"day": "2026-10-13", "high": 69000.0, "low": 66000.0},
        "short_regime_inputs": None,
        "notes": "test fixture",
    }
    c.update(over)
    return c


def suppressed_candidate(cid="suppressed-1", ledger=None, **over):
    c = {
        "candidate_id": cid,
        "terminal": "crypto",
        "symbol": "ALEO",
        "asset_id": "aleo",
        "decision_at": DECISION_AT,
        "issued_at": None,
        "row_origin": "pilot",
        "factors": ledger,
        "production_recorded": None,
        "production_decision": "suppressed",
        "production_suppression_reason":
            "born-dead LONG: signal-day low 0.03244645 <= invalidation 0.0327967457",
        "eligibility": "passed",
        "eligibility_reason": "reached issuance validation; suppressed there",
        "entry": 0.0328,
        "atr14": None,
        "signal_day": {"day": "2026-10-13", "high": 0.0331, "low": 0.03244645},
        "short_regime_inputs": None,
        "trace": {"issuance_outcome":
                  "abstain:born-dead LONG: signal-day low 0.03244645 <= invalidation 0.0327967457",
                  "trace_note": "suppressed before contract creation"},
        "notes": "test suppressed fixture",
    }
    c.update(over)
    return c


class TestQuarantine(unittest.TestCase):
    def test_rejects_sandbox_seeded_origin(self):
        c = issued_candidate(row_origin="sandbox-seeded")
        with self.assertRaises(QuarantineError):
            validate_candidate(c)

    def test_rejects_plumbing_test_origin(self):
        c = issued_candidate(row_origin="plumbing-test")
        with self.assertRaises(QuarantineError):
            validate_candidate(c)

    def test_rejects_missing_origin(self):
        c = issued_candidate()
        del c["row_origin"]
        with self.assertRaises(QuarantineError):
            validate_candidate(c)

    def test_collect_writes_nothing_on_quarantine_hit(self):
        with tempfile.TemporaryDirectory() as td:
            csv_path = os.path.join(td, "vessel.csv")
            bad = issued_candidate(row_origin="sandbox-seeded")
            with self.assertRaises(QuarantineError):
                collect([bad], vessel_csv=csv_path)
            self.assertFalse(os.path.exists(csv_path))

    def test_refuses_v1_file_as_output(self):
        with tempfile.TemporaryDirectory() as td:
            v1 = os.path.join(td, "comparison-rows-2026-10-13.csv")
            with self.assertRaises(QuarantineError):
                collect([issued_candidate()], vessel_csv=v1)

    def test_refuses_v1_file_as_input(self):
        with self.assertRaises(QuarantineError):
            read_pilot_rows("/tmp/comparison-rows-2026-10-13.csv")

    def test_refuses_v1_jsonl_as_output(self):
        with tempfile.TemporaryDirectory() as td:
            v1 = os.path.join(td, "comparison-rows-2026-10-13.jsonl")
            with self.assertRaises(QuarantineError):
                write_pilot_rows([], os.path.join(td, "ok.csv"), v1)

    def test_refuses_v1_as_vessel(self):
        with self.assertRaises(QuarantineError):
            read_vessel_rows("/tmp/comparison-rows-2026-10-13.csv")

    def test_rejects_unknown_terminal(self):
        with self.assertRaises(CollectionError):
            validate_candidate(issued_candidate(terminal="forex"))

    def test_rejects_missing_candidate_id(self):
        c = issued_candidate()
        del c["candidate_id"]
        with self.assertRaises(CollectionError):
            validate_candidate(c)


class TestPostFreezeCutoff(unittest.TestCase):
    """(fix 1, assertion c): the collector ENFORCES the post-freeze cutoff.

    Candidates with decision_at before the v2.1.0 freeze time
    (2026-10-14T04:57:00Z) are REJECTED before scoring/appending, with a
    logged reason. They belong in cohort-retrospective-v2.csv, never the
    prospective vessel.
    """

    def test_cutoff_comes_from_active_manifest(self):
        self.assertEqual(POST_FREEZE_CUTOFF_UTC, "2026-10-14T04:57:00Z")

    def test_rejects_pre_freeze_candidate(self):
        ok, reason = check_post_freeze_cutoff(
            issued_candidate(decision_at="2026-10-14T04:56:59Z"))
        self.assertFalse(ok)
        self.assertIn("before the post-freeze cutoff", reason)
        self.assertIn("cohort-retrospective-v2.csv", reason)

    def test_accepts_post_freeze_candidate(self):
        ok, reason = check_post_freeze_cutoff(
            issued_candidate(decision_at="2026-10-14T04:57:00Z"))
        self.assertTrue(ok)
        self.assertEqual(reason, "")

    def test_rejects_missing_decision_at(self):
        c = issued_candidate()
        del c["decision_at"]
        ok, reason = check_post_freeze_cutoff(c)
        self.assertFalse(ok)
        self.assertIn("cannot be verified", reason)

    def test_collect_rejects_pre_freeze_row_with_logged_reason(self):
        with tempfile.TemporaryDirectory() as td:
            vessel = os.path.join(td, "vessel.csv")
            pre = issued_candidate(cid="pre-freeze-1",
                                  decision_at="2026-10-14T02:23:07Z")
            post = issued_candidate(cid="post-freeze-1",
                                   decision_at="2026-10-14T12:00:00Z")
            info = collect([pre, post], vessel_csv=vessel)
            # the pre-freeze candidate is rejected: never scored, never appended
            self.assertEqual(len(info["rejected_pre_freeze"]), 1)
            rej = info["rejected_pre_freeze"][0]
            self.assertEqual(rej["candidate_id"], "pre-freeze-1")
            self.assertIn("before the post-freeze cutoff", rej["reason"])
            self.assertEqual(info["rows_added"], 1)
            self.assertEqual(info["candidates_eligible"], 1)
            rows = read_vessel_rows(vessel)
            self.assertEqual(len(rows), 1)
            self.assertEqual(rows[0]["candidate_id"], "post-freeze-1")

    def test_collect_all_pre_freeze_writes_nothing(self):
        with tempfile.TemporaryDirectory() as td:
            vessel = os.path.join(td, "vessel.csv")
            pre = issued_candidate(decision_at="2026-10-13T12:00:00Z")
            info = collect([pre], vessel_csv=vessel)
            self.assertEqual(info["rows_added"], 0)
            self.assertEqual(len(info["rejected_pre_freeze"]), 1)
            # vessel file is not created when nothing is appended
            self.assertFalse(os.path.exists(vessel))


class TestDedupe(unittest.TestCase):
    def test_rerun_dedupes_to_zero(self):
        with tempfile.TemporaryDirectory() as td:
            vessel = os.path.join(td, "vessel.csv")
            info = collect([issued_candidate()], vessel_csv=vessel)
            self.assertEqual(info["rows_added"], 1)
            info2 = collect([issued_candidate()], vessel_csv=vessel)
            self.assertEqual(info2["rows_added"], 0)
            self.assertEqual(info2["rows_deduped"], 1)
            self.assertEqual(info2["vessel_rows_total"], 1)
            rows = read_vessel_rows(vessel)
            self.assertEqual(len(rows), 1)
            # dedupe key is (candidate_id, ACTIVE freeze version)
            self.assertEqual(existing_keys(rows),
                             {("test-1", ACTIVE_FREEZE_VERSION)})

    def test_new_candidate_appends(self):
        with tempfile.TemporaryDirectory() as td:
            vessel = os.path.join(td, "vessel.csv")
            collect([issued_candidate(cid="test-1")], vessel_csv=vessel)
            info = collect([issued_candidate(cid="test-2")], vessel_csv=vessel)
            self.assertEqual(info["rows_added"], 1)
            self.assertEqual(info["vessel_rows_total"], 2)
            with open(vessel, newline="") as fh:
                header = next(csv.reader(fh))
            self.assertEqual(header, VESSEL_COLUMNS)
            self.assertEqual(len(header), 69)

    def test_same_candidate_new_freeze_version_appends(self):
        # A future freeze version re-scores the same candidate_id into a NEW
        # row (different measurement version). Simulate by backdating the
        # stamped version on the existing row.
        with tempfile.TemporaryDirectory() as td:
            vessel = os.path.join(td, "vessel.csv")
            collect([issued_candidate()], vessel_csv=vessel)
            rows = read_vessel_rows(vessel)
            rows[0]["freeze_version"] = "2.0.0"  # prior measurement version
            write_vessel_rows(rows, vessel)
            info = collect([issued_candidate()], vessel_csv=vessel)
            self.assertEqual(info["rows_added"], 1)
            self.assertEqual(info["vessel_rows_total"], 2)

    def test_dry_run_writes_nothing(self):
        with tempfile.TemporaryDirectory() as td:
            vessel = os.path.join(td, "vessel.csv")
            info = collect([issued_candidate(cid="dry-1")], vessel_csv=vessel,
                           dry_run=True)
            self.assertEqual(info["rows_added"], 0)
            self.assertEqual(info["rows_would_add"], 1)
            self.assertTrue(info["dry_run"])
            self.assertFalse(os.path.exists(vessel))


class TestSuppressedCandidates(unittest.TestCase):
    def test_suppressed_with_ledger_non_flipped(self):
        rows = score_candidates(
            [suppressed_candidate(ledger=[dict(x) for x in LEDGER_LONG])])
        r = rows[0]
        self.assertEqual(r["prod_decision"], "suppressed")
        self.assertEqual(r["prod_disposition"], "abstain")
        self.assertEqual(r["prod_disposition_reason"], "abstain:born-dead")
        # fix 2 (RULE 5/6): the fixture omits atr14 (as real suppressed
        # candidates do), so C-2's levels cannot be recomputed and the
        # reuse gate cannot verify identical levels -- the challenger is
        # unscored (unknown), never an inherited suppression. A suppressed
        # candidate WITH persisted atr14 reuses the recorded suppression
        # via the verified gate (see test_harness.py non-flipped tests).
        self.assertEqual(r["c2_disposition"], "unscored")
        self.assertEqual(r["c2_disposition_reason"],
                         "unscored:levels-uncomputable")
        self.assertFalse(r["direction_flipped"])
        self.assertEqual(
            r["issuance_outcome"],
            "abstain:born-dead LONG: signal-day low 0.03244645 <= invalidation 0.0327967457")

    def test_suppressed_without_ledger(self):
        rows = score_candidates([suppressed_candidate(ledger=None)])
        r = rows[0]
        # production arm still records the pipeline's suppression -- data kept
        self.assertEqual(r["prod_disposition"], "abstain")
        self.assertEqual(r["prod_disposition_reason"], "abstain:born-dead")
        # challenger cannot be computed without the ledger: correct code
        self.assertEqual(r["c2_disposition"], "unscored")
        self.assertEqual(r["c2_disposition_reason"],
                         "unscored:no-factor-ledger")

    def test_suppressed_flipped_without_levels(self):
        # flipped challenger but no entry/atr14 -> levels uncomputable
        rows = score_candidates(
            [suppressed_candidate(cid="suppressed-flip",
                                 ledger=[dict(x) for x in LEDGER_FLIP])])
        r = rows[0]
        self.assertTrue(r["direction_flipped"])
        self.assertEqual(r["c2_disposition"], "unscored")
        self.assertEqual(r["c2_disposition_reason"],
                         "unscored:levels-uncomputable")


class TestDecisionTimeValidation(unittest.TestCase):
    def test_late_asof_flagged_not_dropped(self):
        ledger = [dict(x) for x in LEDGER_LONG]
        ledger[0] = f("Trend cluster", 1, 2.5, "2026-10-14T13:00:00Z")  # after decision
        rows = score_candidates([issued_candidate(ledger=ledger)])
        r = rows[0]
        self.assertFalse(r["decision_time_verified"])
        self.assertIn("dated after decisionAt", r["decision_time_note"])
        # row is still collected -- flagged, never silently passed/dropped
        self.assertEqual(r["prod_disposition"], "issued")

    def test_strict_mode_raises_lookahead(self):
        ledger = [dict(x) for x in LEDGER_LONG]
        ledger[0] = f("Trend cluster", 1, 2.5, "2026-10-14T13:00:00Z")
        with self.assertRaises(col.LookaheadError):
            score_candidates([issued_candidate(ledger=ledger)], strict=True)

    def test_verified_row_passes(self):
        rows = score_candidates([issued_candidate()])
        self.assertTrue(rows[0]["decision_time_verified"])


class TestTraceStamping(unittest.TestCase):
    def test_issuance_outcome_mapping(self):
        self.assertEqual(derive_issuance_outcome({"production_decision": "issued"}),
                         "issued")
        self.assertEqual(
            derive_issuance_outcome({"production_decision": "rejected",
                                     "production_suppression_reason": "eligibility bars failed"}),
            "abstain:eligibility bars failed")
        self.assertEqual(
            derive_issuance_outcome({"production_decision": "qualified"}),
            REASON["production-not-issued"])
        self.assertIsNone(derive_issuance_outcome({"production_decision": None}))
        self.assertIsNone(derive_issuance_outcome({}))

    def test_stamp_trace_sets_freeze_and_contract(self):
        rows = score_candidates([issued_candidate(
            trace={"contract_id": "sig_abc123",
                   "trace_note": "test trace"})])
        r = rows[0]
        # stamped with the ACTIVE freeze version -- never a hardcoded string
        self.assertEqual(r["freeze_version"], ACTIVE_FREEZE_VERSION)
        self.assertEqual(r["applicable_freeze"], ACTIVE_FREEZE_VERSION)
        self.assertEqual(r["provenance_verdict"], "PROSPECTIVE")
        self.assertEqual(r["cohort_origin"], "collect_pilot_rows.py")
        self.assertEqual(r["decision_time_verified_reason"],
                         r["decision_time_note"])
        self.assertEqual(r["contract_id"], "sig_abc123")
        self.assertIn("test trace", r["notes"])
        self.assertIsNone(r["alert_delivered_at"])  # null, not fabricated

    def test_extended_schema_is_frozen_prefix_plus_trace(self):
        self.assertEqual(EXTENDED_COLUMNS[:len(ROW_COLUMNS)], ROW_COLUMNS)
        self.assertEqual(len(TRACE_COLUMNS), 6)

    def test_vessel_schema_is_69_columns(self):
        self.assertEqual(len(VESSEL_COLUMNS), 69)
        self.assertEqual(VESSEL_COLUMNS[:len(EXTENDED_COLUMNS)],
                         EXTENDED_COLUMNS)
        self.assertEqual(VESSEL_COLUMNS[-4:], COHORT_COLUMNS)
        # matches the real vessel header on disk exactly
        with open(VESSEL_CSV, newline="") as fh:
            disk_header = next(csv.reader(fh))
        self.assertEqual(disk_header, VESSEL_COLUMNS)

    def test_backfill_only_writes_trace_columns(self):
        with tempfile.TemporaryDirectory() as td:
            csv_path = os.path.join(td, "pilot.csv")
            jsonl_path = os.path.join(td, "pilot.jsonl")
            rows = score_candidates([issued_candidate()])
            write_pilot_rows(rows, csv_path, jsonl_path)
            with self.assertRaises(CollectionError):
                backfill_trace(csv_path, jsonl_path,
                               {"crypto:test-1": {"prod_direction": "short"}})
            # frozen columns untouched by a legal backfill
            res = backfill_trace(csv_path, jsonl_path,
                                 {"crypto:test-1": {"contract_id": "sig_x"}})
            self.assertEqual(res, {"rows_backfilled": 1, "cells_written": 1,
                                   "pilot_rows_total": 1})
            rows2 = read_pilot_rows(csv_path)
            self.assertEqual(rows2[0]["contract_id"], "sig_x")
            self.assertEqual(rows2[0]["prod_direction"], "long")


class TestVessel(unittest.TestCase):
    """(fix 1, assertion d): the collector targets the prospective vessel
    (rows/cohort-prospective-v2.csv -- the plan's vessel, not the pilot
    file) and stamps the ACTIVE freeze version."""

    def test_default_target_is_the_prospective_vessel(self):
        self.assertEqual(col.VESSEL_CSV, VESSEL_CSV)
        self.assertTrue(VESSEL_CSV.endswith(
            os.path.join("rows", "cohort-prospective-v2.csv")))
        self.assertNotIn("comparison-rows-pilot", VESSEL_CSV)

    def test_collect_writes_vessel_with_active_freeze_stamp(self):
        with tempfile.TemporaryDirectory() as td:
            vessel = os.path.join(td, "cohort-prospective-v2.csv")
            info = collect([issued_candidate(cid="v-1")], vessel_csv=vessel)
            self.assertEqual(info["rows_added"], 1)
            self.assertEqual(info["freeze_version"], ACTIVE_FREEZE_VERSION)
            self.assertEqual(info["vessel"], vessel)
            rows = read_vessel_rows(vessel)
            self.assertEqual(len(rows), 1)
            r = rows[0]
            # active freeze stamp -- never a hardcoded version string
            self.assertEqual(r["freeze_version"], ACTIVE_FREEZE_VERSION)
            self.assertEqual(r["applicable_freeze"], ACTIVE_FREEZE_VERSION)
            self.assertEqual(r["provenance_verdict"], "PROSPECTIVE")
            self.assertEqual(r["cohort_origin"], "collect_pilot_rows.py")
            # every vessel column present, none extra
            with open(vessel, newline="") as fh:
                header = next(csv.reader(fh))
            self.assertEqual(header, VESSEL_COLUMNS)
            self.assertEqual(len(header), 69)

    def test_vessel_header_mismatch_refused(self):
        with tempfile.TemporaryDirectory() as td:
            vessel = os.path.join(td, "vessel.csv")
            with open(vessel, "w", newline="") as fh:
                fh.write("wrong,header\n1,2\n")
            with self.assertRaises(CollectionError):
                read_vessel_rows(vessel)
            with self.assertRaises(CollectionError):
                # write path validates on read-back; direct write is fine,
                # but a second collect() over the corrupt file refuses
                collect([issued_candidate()], vessel_csv=vessel)

    def test_fixture_vessel_header_matches_schema(self):
        # Isolated fixture (replaces the production-read test that assumed
        # the vessel stays header-only): writes the 69-column schema to a
        # TEMP vessel, verifies the read path on it, and never touches the
        # production file. The production vessel legitimately holds
        # post-freeze rows (collection run 5, 2026-10-14), so no test may
        # depend on it being empty.
        with tempfile.TemporaryDirectory() as td:
            fixture = os.path.join(td, "fixture-vessel.csv")
            with open(fixture, "w", newline="") as fh:
                csv.writer(fh).writerow(VESSEL_COLUMNS)
            with open(fixture, newline="") as fh:
                disk_header = next(csv.reader(fh))
            self.assertEqual(disk_header, VESSEL_COLUMNS)
            self.assertEqual(len(disk_header), 69)
            self.assertEqual(disk_header[-4:], COHORT_COLUMNS)
            rows = read_vessel_rows(fixture)
            self.assertEqual(rows, [])  # header-only fixture -> zero rows


if __name__ == "__main__":
    unittest.main()
