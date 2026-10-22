#!/usr/bin/env python3
"""Tests for structural measurement exclusion in metrics.py.

The audit (audit/exclusion-list-v2-2026-10-14.json) established 119
quarantined records (117 fabricated synthetic fixtures + 2 market-data
replay / sandbox dry-run copies, 48 distinct record IDs) that MUST NOT
contribute to any performance statistic: directional accuracy, net
returns, target-before-stop, or any count used in a denominator.

These tests prove the exclusion is STRUCTURAL: metrics entry points
consult the exclusion list (and the synthetic/replay classifiers) at
computation time, so a synthetic row and a replay row carrying graded
outcomes do not move any metric output, while legitimate rows -- including
the retrospective suppressed cohort with harness boilerplate text -- are
kept measurement-eligible.

Run: python3 run_tests.py (or pytest).
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import metrics


# Real excluded record IDs from the audit exclusion list (v2):
# class A = fabricated synthetic fixture; class B = market-data replay /
# sandbox dry-run copy (duplicate opportunity).
FIXTURE_ID = "sig_b25f5669d4194776005fccd0"   # class A, fabricated fixture
REPLAY_ID = "sig_53bb2a86d2e0fee1f3664812"    # class B, dryrun copy of the
                                              # same opportunity


def _row(row_id, contract_id, **kw):
    """A minimal comparison row carrying GRADED outcomes (the dangerous
    case: synthetic/replay rows with real-looking numbers)."""
    r = {
        "row_id": row_id,
        "terminal": "crypto",
        "symbol": "BTC",
        "asset_id": "BTC",
        "candidate_id": row_id.replace(":", "_"),
        "contract_id": contract_id,
        "row_origin": "pilot",
        "provenance_verdict": "PROSPECTIVE",
        "cohort_origin": "collect_pilot_rows.py",
        "prod_disposition": "issued",
        "c2_disposition": "issued",
        "prod_direction": "long",
        "c2_direction": "long",
        "prod_barrier_outcome": "target",
        "c2_barrier_outcome": "target",
        "prod_net_r": 2.500,
        "c2_net_r": 2.500,
        "prod_dir_d5": "hit",
        "prod_dir_d14": "hit",
        "prod_dir_d30": "hit",
        "c2_dir_d5": "hit",
        "c2_dir_d14": "hit",
        "c2_dir_d30": "hit",
        "alert_delay_hours": 0.5,
        "notes": "",
        "decision_time_note": "",
    }
    r.update(kw)
    return r


def _control_row(row_id, contract_id, net_r, dir_hit):
    return _row(row_id, contract_id,
                prod_net_r=net_r, c2_net_r=net_r,
                prod_dir_d5=("hit" if dir_hit else "miss"),
                c2_dir_d5=("hit" if dir_hit else "miss"),
                prod_dir_d14="not-graded", c2_dir_d14="not-graded",
                prod_dir_d30="not-graded", c2_dir_d30="not-graded",
                prod_barrier_outcome="time_exit",
                c2_barrier_outcome="time_exit")


class TestExclusionListLoads(unittest.TestCase):
    def test_real_ids_in_exclusion_set(self):
        ids = metrics.load_exclusion_ids()
        self.assertIn(FIXTURE_ID, ids)
        self.assertIn(REPLAY_ID, ids)
        self.assertEqual(len(ids), 48)  # 48 distinct record IDs in v2

    def test_default_path_resolves(self):
        self.assertTrue(os.path.isfile(metrics.default_exclusion_list_path()))


class TestSyntheticFixtureExclusion(unittest.TestCase):
    """A synthetic fixture row (exclusion-list ID, class A) with graded
    outcomes must not affect any metric output."""

    def test_fixture_row_does_not_move_metrics(self):
        control = _control_row("crypto:ctl-1", "sig_control00000000000001",
                               net_r=-1.0, dir_hit=False)
        fixture = _row("crypto:fixture-1", FIXTURE_ID)  # graded wins!
        base = metrics.compare([control], "crypto")
        with_fixture = metrics.compare([control, fixture], "crypto")

        self.assertEqual(with_fixture["measurement_exclusion"]["n_excluded"], 1)
        self.assertEqual(with_fixture["n_rows"], 1)
        for h in ("d5", "d14", "d30"):
            self.assertEqual(
                with_fixture["prod"]["directional_accuracy"][h],
                base["prod"]["directional_accuracy"][h])
            self.assertEqual(
                with_fixture["c2"]["directional_accuracy"][h],
                base["c2"]["directional_accuracy"][h])
        self.assertEqual(with_fixture["prod"]["net_r"], base["prod"]["net_r"])
        self.assertEqual(with_fixture["c2"]["net_r"], base["c2"]["net_r"])
        self.assertEqual(with_fixture["prod"]["target_before_stop"],
                         base["prod"]["target_before_stop"])
        self.assertEqual(with_fixture["prod"]["coverage"],
                         base["prod"]["coverage"])
        self.assertEqual(with_fixture["primary"]["n_opportunities"],
                         base["primary"]["n_opportunities"])
        self.assertEqual(with_fixture["primary"]["n_primary"],
                         base["primary"]["n_primary"])
        # the labeled reason names the exclusion list, never silent
        reason = with_fixture["measurement_exclusion"]["excluded"][0]["reason"]
        self.assertIn("exclusion-list match", reason)
        self.assertIn(FIXTURE_ID, reason)

    def test_fixture_row_alone_yields_empty_metrics(self):
        fixture = _row("crypto:fixture-1", FIXTURE_ID)
        rep = metrics.compare([fixture], "crypto")
        self.assertEqual(rep["n_rows"], 0)
        self.assertEqual(rep["prod"]["directional_accuracy"]["d5"]["n"], 0)
        self.assertIsNone(rep["prod"]["net_r"]["mean"])
        self.assertEqual(rep["primary"]["n_opportunities"], 0)


class TestReplayExclusion(unittest.TestCase):
    """A market-data replay row (exclusion-list ID, class B) with graded
    outcomes must not affect any metric output."""

    def test_replay_row_does_not_move_metrics(self):
        control = _control_row("crypto:ctl-1", "sig_control00000000000001",
                               net_r=-1.0, dir_hit=False)
        replay = _row("crypto:replay-1", REPLAY_ID)  # graded wins!
        base = metrics.compare([control], "crypto")
        with_replay = metrics.compare([control, replay], "crypto")

        self.assertEqual(with_replay["measurement_exclusion"]["n_excluded"], 1)
        self.assertEqual(with_replay["n_rows"], 1)
        for h in ("d5", "d14", "d30"):
            self.assertEqual(
                with_replay["prod"]["directional_accuracy"][h],
                base["prod"]["directional_accuracy"][h])
        self.assertEqual(with_replay["prod"]["net_r"], base["prod"]["net_r"])
        self.assertEqual(with_replay["prod"]["target_before_stop"],
                         base["prod"]["target_before_stop"])
        reason = with_replay["measurement_exclusion"]["excluded"][0]["reason"]
        self.assertIn("exclusion-list match", reason)
        self.assertIn(REPLAY_ID, reason)


class TestStructuralClassification(unittest.TestCase):
    """Rows classifiable as synthetic/replay WITHOUT an exclusion-list ID
    are excluded too (the 'or otherwise classifiable' rule)."""

    def test_sandbox_seeded_default_row_stays_eligible(self):
        """Precision guard: 'sandbox-seeded' is the harness DEFAULT
        row_origin for any constructed row (including its own regression
        rows), so it is NOT an exclusion marker. A sandbox-seeded row with
        no list ID and no provenance marker stays eligible."""
        control = _control_row("crypto:ctl-1", "sig_control00000000000001",
                               net_r=-1.0, dir_hit=False)
        sandbox = _row("crypto:sb-1", "sig_notinlist0000000000000000",
                       row_origin="sandbox-seeded")
        rep = metrics.compare([control, sandbox], "crypto")
        self.assertEqual(rep["measurement_exclusion"]["n_excluded"], 0)
        self.assertEqual(rep["n_rows"], 2)

    def test_provenance_marker_excluded(self):
        control = _control_row("crypto:ctl-1", "sig_control00000000000001",
                               net_r=-1.0, dir_hit=False)
        marked = _row("crypto:mk-1", "sig_notinlist0000000000000000",
                      notes="fabricated-synthetic-fixture per demo harness")
        rep = metrics.compare([control, marked], "crypto")
        self.assertEqual(rep["measurement_exclusion"]["n_excluded"], 1)
        self.assertEqual(rep["n_rows"], 1)

    def test_suppressed_cohort_boilerplate_stays_eligible(self):
        """Guard against over-exclusion: the legitimate retrospective
        suppressed cohort carries harness boilerplate ('sandbox-seeded
        rows carry no outcomes...') and cohort_origin
        'suppressed-dryrun-2026-10-14' -- both must stay eligible."""
        control = _control_row("crypto:ctl-1", "sig_control00000000000001",
                               net_r=-1.0, dir_hit=False)
        suppressed = _row("crypto:suppressed-3", "sig_notinlist0000000000001",
                          row_origin="pilot",
                          cohort_origin="suppressed-dryrun-2026-10-14",
                          outcome_note=("sandbox-seeded rows carry no "
                                        "outcomes; outcomes are graded forward "
                                        "under the frozen evaluator versions"),
                          prod_disposition="abstain",
                          c2_disposition="unscored")
        rep = metrics.compare([control, suppressed], "crypto")
        self.assertEqual(rep["measurement_exclusion"]["n_excluded"], 0)
        self.assertEqual(rep["n_rows"], 2)

    def test_exclusion_applies_to_entry_points_directly(self):
        fixture = _row("crypto:fixture-1", FIXTURE_ID)
        self.assertEqual(metrics.model_metrics([fixture], "prod")["n_rows"], 0)
        self.assertEqual(metrics.compare_primary([fixture])["n_opportunities"], 0)
        dd = metrics.direction_disagreement([fixture])
        self.assertEqual(dd["n_paired_issued"], 0)


class TestRealRetrospectiveRowsUnaffected(unittest.TestCase):
    """The 356-row retrospective cohort has no exclusion matches: running
    metrics on it must report 0 excluded and identical counts."""

    def test_retrospective_cohort_exclusion_count(self):
        path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
            "rows", "cohort-retrospective-v2.csv")
        rows = metrics.read_rows(path)
        rep_c = metrics.compare(rows, "crypto")
        rep_e = metrics.compare(rows, "equity")
        self.assertEqual(
            rep_c["measurement_exclusion"]["n_excluded"], 0)
        self.assertEqual(
            rep_e["measurement_exclusion"]["n_excluded"], 0)
        self.assertEqual(rep_c["n_rows"], 306)  # 10 issued + 296 suppressed
        self.assertEqual(rep_e["n_rows"], 50)


if __name__ == "__main__":
    unittest.main()
