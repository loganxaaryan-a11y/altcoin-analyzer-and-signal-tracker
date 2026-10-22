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
    MANIFEST_VERSION, validate_candidate, derive_issuance_outcome,
    stamp_trace, score_candidates, collect, read_pilot_rows,
    write_pilot_rows, existing_keys, backfill_trace,
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
            csv_path = os.path.join(td, "pilot.csv")
            jsonl_path = os.path.join(td, "pilot.jsonl")
            bad = issued_candidate(row_origin="sandbox-seeded")
            with self.assertRaises(QuarantineError):
                collect([bad], pilot_csv=csv_path, pilot_jsonl=jsonl_path)
            self.assertFalse(os.path.exists(csv_path))
            self.assertFalse(os.path.exists(jsonl_path))

    def test_refuses_v1_file_as_output(self):
        with tempfile.TemporaryDirectory() as td:
            v1 = os.path.join(td, "comparison-rows-2026-10-13.csv")
            with self.assertRaises(QuarantineError):
                collect([issued_candidate()], pilot_csv=v1,
                        pilot_jsonl=os.path.join(td, "x.jsonl"))

    def test_refuses_v1_file_as_input(self):
        with self.assertRaises(QuarantineError):
            read_pilot_rows("/tmp/comparison-rows-2026-10-13.csv")

    def test_refuses_v1_jsonl_as_output(self):
        with tempfile.TemporaryDirectory() as td:
            v1 = os.path.join(td, "comparison-rows-2026-10-13.jsonl")
            with self.assertRaises(QuarantineError):
                write_pilot_rows([], os.path.join(td, "ok.csv"), v1)

    def test_rejects_unknown_terminal(self):
        with self.assertRaises(CollectionError):
            validate_candidate(issued_candidate(terminal="forex"))

    def test_rejects_missing_candidate_id(self):
        c = issued_candidate()
        del c["candidate_id"]
        with self.assertRaises(CollectionError):
            validate_candidate(c)


class TestDedupe(unittest.TestCase):
    def _legacy_pilot_file(self, td):
        """Pilot file with the pre-extension frozen header (like the real one)."""
        csv_path = os.path.join(td, "pilot.csv")
        rows = col.score_candidates([issued_candidate()])
        write_rows_csv(rows, csv_path)  # frozen schema, no trace columns
        return csv_path, os.path.join(td, "pilot.jsonl")

    def test_rerun_dedupes_to_zero(self):
        with tempfile.TemporaryDirectory() as td:
            csv_path, jsonl_path = self._legacy_pilot_file(td)
            info = collect([issued_candidate()], pilot_csv=csv_path,
                           pilot_jsonl=jsonl_path)
            self.assertEqual(info["rows_added"], 0)
            self.assertEqual(info["rows_deduped"], 1)
            self.assertEqual(info["pilot_rows_total"], 1)
            # legacy rows infer freeze 2.0.0 for the dedupe key
            rows = read_pilot_rows(csv_path)
            self.assertEqual(len(rows), 1)
            self.assertEqual(existing_keys(rows), {("test-1", MANIFEST_VERSION)})

    def test_new_candidate_appends_with_extended_header(self):
        with tempfile.TemporaryDirectory() as td:
            csv_path, jsonl_path = self._legacy_pilot_file(td)
            info = collect([issued_candidate(cid="test-2")], pilot_csv=csv_path,
                           pilot_jsonl=jsonl_path)
            self.assertEqual(info["rows_added"], 1)
            self.assertEqual(info["pilot_rows_total"], 2)
            with open(csv_path, newline="") as fh:
                header = next(csv.reader(fh))
            self.assertEqual(header, EXTENDED_COLUMNS)
            rows = read_pilot_rows(csv_path)
            by_id = {r["candidate_id"]: r for r in rows}
            # migrated legacy row: extended fields null, freeze inferred
            self.assertIsNone(by_id["test-1"]["contract_id"])
            self.assertEqual(by_id["test-1"]["freeze_version"],
                             col.INFERRED_FREEZE_FOR_LEGACY_ROWS)
            # new row: stamped with the freeze it was scored under
            self.assertEqual(by_id["test-2"]["freeze_version"], MANIFEST_VERSION)
            self.assertEqual(by_id["test-2"]["issuance_outcome"], "issued")

    def test_same_candidate_new_freeze_version_appends(self):
        with tempfile.TemporaryDirectory() as td:
            csv_path = os.path.join(td, "pilot.csv")
            jsonl_path = os.path.join(td, "pilot.jsonl")
            rows = col.score_candidates([issued_candidate()])
            rows[0]["freeze_version"] = "1.0.0"  # prior measurement version
            write_pilot_rows(rows, csv_path, jsonl_path)
            info = collect([issued_candidate()], pilot_csv=csv_path,
                           pilot_jsonl=jsonl_path)
            self.assertEqual(info["rows_added"], 1)
            self.assertEqual(info["pilot_rows_total"], 2)

    def test_dry_run_writes_nothing(self):
        with tempfile.TemporaryDirectory() as td:
            csv_path = os.path.join(td, "pilot.csv")
            jsonl_path = os.path.join(td, "pilot.jsonl")
            info = collect([issued_candidate(cid="dry-1")], pilot_csv=csv_path,
                           pilot_jsonl=jsonl_path, dry_run=True)
            self.assertEqual(info["rows_added"], 0)
            self.assertEqual(info["rows_would_add"], 1)
            self.assertTrue(info["dry_run"])
            self.assertFalse(os.path.exists(csv_path))


class TestSuppressedCandidates(unittest.TestCase):
    def test_suppressed_with_ledger_non_flipped(self):
        rows = score_candidates(
            [suppressed_candidate(ledger=[dict(x) for x in LEDGER_LONG])])
        r = rows[0]
        self.assertEqual(r["prod_decision"], "suppressed")
        self.assertEqual(r["prod_disposition"], "abstain")
        self.assertEqual(r["prod_disposition_reason"], "abstain:born-dead")
        # challenger scored from the ledger; non-flipped inherits suppression
        self.assertEqual(r["c2_disposition"], "abstain")
        self.assertEqual(r["c2_disposition_reason"], "abstain:born-dead")
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
        self.assertEqual(r["freeze_version"], MANIFEST_VERSION)
        self.assertEqual(r["contract_id"], "sig_abc123")
        self.assertIn("test trace", r["notes"])
        self.assertIsNone(r["alert_delivered_at"])  # null, not fabricated

    def test_extended_schema_is_frozen_prefix_plus_trace(self):
        self.assertEqual(EXTENDED_COLUMNS[:len(ROW_COLUMNS)], ROW_COLUMNS)
        self.assertEqual(len(TRACE_COLUMNS), 6)

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


if __name__ == "__main__":
    unittest.main()
