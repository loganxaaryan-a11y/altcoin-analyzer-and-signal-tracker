#!/usr/bin/env python3
"""Tests for the workstream-C comparison harness (freeze manifest v1.0.0).

All expectations are hand-computed from the frozen formulas; no live data,
no production access. Run: python3 run_tests.py (or pytest).
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import harness
import metrics
from harness import (score_crypto_production, score_crypto_challenger,
                     score_equity_production, mirror_levels, born_dead_check,
                     short_regime_gate, score_pair, score_batch, write_rows_csv,
                     read_rows_csv, load_manifest, ROW_COLUMNS, REASON,
                     LookaheadError, MANIFEST_VERSION, _ledger_completeness)

MANIFEST = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        "freeze-manifest-v2.0.0.json")
# v2.0.0 (2026-10-14): the manifest-consistency tests target the CURRENT
# freeze. freeze-manifest-v1.0.0.json stays immutable on disk; its rows
# (rows/comparison-rows-2026-10-13.csv) are quarantined, not re-scored.


def f(label, score, weight, as_of=None):
    d = {"label": label, "score": score, "weight": weight,
         "contribution": score * weight}
    if as_of:
        d["asOf"] = as_of
    return d


# Hand-computed fixture A:
# net = 2.5+1.5+1.5-1.75+1.0+0+0.625+2.0+0+1.5+0 = 8.875 on 17.0
# long = round(50 + (8.875/17)*42) = round(71.9265) = 72 -> long
FIX_A = [
    f("Trend cluster", 1, 2.5), f("Momentum", 1, 1.5), f("MACD", 1, 1.5),
    f("Perp funding crowding", -1, 1.75), f("Open interest", 1, 1.0),
    f("Binance futures positioning", 0, 1.0),
    f("Cross-venue taker imbalance", 0.5, 1.25), f("TVL trend", 1, 2.0),
    f("Revenue linkage", 0, 1.5), f("Developer velocity", 1, 1.5),
    f("Supply-overhang penalty", 0, 1.5),
]

# Fixture B: production short (49), challenger long (53) -> flip.
# others net = -2.5+1.75+2.0 = +1.25; with momentum -1.5 -> -0.25 on 17.0
# long = round(50 - 0.6176) = 49 -> short
# C-2: 1.25/15.5 -> round(50 + 3.387) = 53 -> long
FIX_B = [
    f("Trend cluster", -1, 2.5), f("Momentum", -1, 1.5), f("MACD", 0, 1.5),
    f("Perp funding crowding", 1, 1.75), f("Open interest", 0, 1.0),
    f("Binance futures positioning", 0, 1.0),
    f("Cross-venue taker imbalance", 0, 1.25), f("TVL trend", 1, 2.0),
    f("Revenue linkage", 0, 1.5), f("Developer velocity", 0, 1.5),
    f("Supply-overhang penalty", 0, 1.5),
]

# Fixture C: production long (51), challenger short (47) -> flip to short.
# others net = 2.5-1.75-2.0 = -1.25; with momentum +1.5 -> +0.25 on 17.0
# long = round(50 + 0.6176) = 51 -> long
# C-2: -1.25/15.5 -> round(50 - 3.387) = 47 -> short
FIX_C = [
    f("Trend cluster", 1, 2.5), f("Momentum", 1, 1.5), f("MACD", 0, 1.5),
    f("Perp funding crowding", -1, 1.75), f("Open interest", 0, 1.0),
    f("Binance futures positioning", 0, 1.0),
    f("Cross-venue taker imbalance", 0, 1.25), f("TVL trend", -1, 2.0),
    f("Revenue linkage", 0, 1.5), f("Developer velocity", 0, 1.5),
    f("Supply-overhang penalty", 0, 1.5),
]


def cand(factors, **kw):
    base = {"candidate_id": "t1", "terminal": "crypto", "symbol": "TST",
            "asset_id": "tst", "decision_at": "2026-10-13T12:00:00Z",
            "production_recorded": {"direction": "long", "score": 72},
            "production_decision": "issued", "eligibility": "passed",
            "entry": 100.0, "atr14": 8.0, "row_origin": "sandbox-seeded"}
    base["factors"] = factors
    base.update(kw)
    return base


class TestManifest(unittest.TestCase):
    def test_manifest_loads_and_version_matches(self):
        m = load_manifest(MANIFEST)
        self.assertEqual(m["manifest_version"], MANIFEST_VERSION)
        self.assertEqual(m["immutability_rule"][:4], "This")

    def test_manifest_factor_totals_match_harness(self):
        m = load_manifest(MANIFEST)
        by_name = {x["model_name"]: x for x in m["models"]}
        prod = by_name["crypto-dossier-factor-agreement"]
        c2 = by_name["crypto-dossier-minus-momentum"]
        eq = by_name["equity-factor-agreement"]
        self.assertAlmostEqual(sum(x["weight"] for x in prod["factors"]), 17.0)
        self.assertAlmostEqual(sum(x["weight"] for x in c2["factors"]), 15.5)
        self.assertEqual(sum(x["weight"] for x in eq["factors"]), 90)  # 6+8+8+20+8+20+20
        self.assertEqual(len(prod["factors"]), 11)
        self.assertEqual(len(c2["factors"]), 10)
        self.assertEqual(len(eq["factors"]), 7)
        labels = [x["label"] for x in prod["factors"]]
        self.assertNotIn("Momentum", [x["label"] for x in c2["factors"]])
        self.assertIn("Momentum", labels)
        for x in prod["source_files"]:
            self.assertRegex(x["sha256"], r"^[0-9a-f]{64}$")


class TestCryptoScoring(unittest.TestCase):
    def test_production_hand_computed(self):
        r = score_crypto_production(FIX_A)
        self.assertEqual(r["long_score"], 72)
        self.assertEqual(r["short_score"], 28)
        self.assertEqual(r["direction"], "long")
        self.assertAlmostEqual(r["weighted_net"], 8.875)
        self.assertAlmostEqual(r["total_weight"], 17.0)

    def test_challenger_hand_computed(self):
        r = score_crypto_challenger(FIX_A)
        # net 7.375 / 15.5 -> round(69.9839) = 70
        self.assertEqual(r["long_score"], 70)
        self.assertEqual(r["short_score"], 30)
        self.assertEqual(r["direction"], "long")
        self.assertEqual(r["momentum_dropped"], 1)
        self.assertAlmostEqual(r["total_weight"], 15.5)

    def test_flip_b(self):
        p = score_crypto_production(FIX_B)
        c = score_crypto_challenger(FIX_B)
        self.assertEqual((p["long_score"], p["direction"]), (49, "short"))
        self.assertEqual((c["long_score"], c["direction"]), (53, "long"))

    def test_flip_c(self):
        p = score_crypto_production(FIX_C)
        c = score_crypto_challenger(FIX_C)
        self.assertEqual((p["long_score"], p["direction"]), (51, "long"))
        self.assertEqual((c["long_score"], c["direction"]), (47, "short"))

    def test_legacy_walkforward_excluded(self):
        with_wf = FIX_A + [f("Walk-forward base rate", 1, 1.0)]
        r = score_crypto_production(with_wf)
        self.assertEqual(r["long_score"], 72)  # not 73
        self.assertAlmostEqual(r["total_weight"], 17.0)

    def test_no_data_zero_never_estimated(self):
        zeroed = [dict(x, score=0, contribution=0.0) for x in FIX_A]
        r = score_crypto_production(zeroed)
        self.assertEqual(r["long_score"], 50)
        self.assertEqual(r["direction"], "long")  # 50 >= 50


class TestEquityScoring(unittest.TestCase):
    def ef(self, id_, score):
        return {"id": id_, "score": score, "weight": harness.EQUITY_WEIGHTS[id_]}

    def test_unanimous_plus_redundancy(self):
        facs = [self.ef(i, 1) for i in harness.EQUITY_WEIGHTS]
        r = score_equity_production(facs)
        self.assertEqual(r["raw_score"], 100)
        self.assertEqual(r["redundancy_adjustment"], -5)
        self.assertEqual(r["final_score"], 95)
        self.assertEqual(r["direction"], "long")

    def test_mixed(self):
        facs = [self.ef("price_vs_sma20", 1), self.ef("price_vs_sma50", -1),
                self.ef("price_vs_sma200", 1), self.ef("rsi14_wilder", 0),
                self.ef("macd_12_26", -1), self.ef("volume_direction_z", 0),
                self.ef("atr_adjusted_trend30", 0)]
        r = score_equity_production(facs)
        # num = 6-8+8-8 = -2; raw = round(-200/110) = -2; mixed
        self.assertEqual(r["raw_score"], -2)
        self.assertEqual(r["redundancy_adjustment"], 0)
        self.assertEqual(r["final_score"], -2)
        self.assertEqual(r["direction"], "mixed")


class TestLevelsAndGates(unittest.TestCase):
    def test_mirror_levels_long(self):
        lv = mirror_levels(100.0, 8.0, "long", 1.25)
        self.assertEqual((lv["invalidation"], lv["target1"], lv["target2"],
                          lv["risk_per_unit"]), (90.0, 115.0, 125.0, 10.0))

    def test_mirror_levels_short(self):
        lv = mirror_levels(100.0, 8.0, "short", 1.25)
        self.assertEqual((lv["invalidation"], lv["target1"], lv["target2"]),
                         (110.0, 85.0, 75.0))

    def test_mirror_levels_missing(self):
        self.assertIsNone(mirror_levels(None, 8.0, "long"))
        self.assertIsNone(mirror_levels(100.0, None, "long"))

    def test_born_dead_long(self):
        v, reason = born_dead_check("long", 90.0, 112.0, 89.0)
        self.assertEqual(v, "suppressed")
        self.assertIn("born-dead LONG: signal-day low 89.0 <= invalidation 90.0", reason)
        v, _ = born_dead_check("long", 90.0, 112.0, 91.0)
        self.assertEqual(v, "passed")

    def test_born_dead_short(self):
        v, reason = born_dead_check("short", 110.0, 111.0, 95.0)
        self.assertEqual(v, "suppressed")
        self.assertIn("born-dead SHORT", reason)
        v, _ = born_dead_check("short", 110.0, 105.0, 95.0)
        self.assertEqual(v, "passed")

    def test_born_dead_unverifiable(self):
        self.assertEqual(born_dead_check("long", 90.0, None, None)[0], "unverifiable")

    def test_short_regime_gate(self):
        self.assertEqual(short_regime_gate(True, True, False)[0], "allowed")
        self.assertEqual(short_regime_gate(True, False, True)[0], "allowed")
        self.assertEqual(short_regime_gate(True, False, False)[0], "suppressed")
        self.assertEqual(short_regime_gate(False, True, True)[0], "suppressed")
        self.assertEqual(short_regime_gate(None, True, True)[0], "unverifiable")


class TestScorePair(unittest.TestCase):
    def test_nonflipped_inherits_issuance(self):
        row = score_pair(cand(FIX_A))
        self.assertEqual(row["prod_disposition"], "issued")
        self.assertEqual(row["c2_disposition"], "issued")
        self.assertFalse(row["direction_flipped"])
        self.assertEqual(row["levels_mode"], "inherited-identical (non-flipped)")
        self.assertEqual(row["c2_invalidation"], 90.0)
        self.assertEqual(row["born_dead_mirror"], "passed")

    def test_flipped_to_long_issues(self):
        row = score_pair(cand(
            FIX_B,
            production_recorded={"direction": "short", "score": 51},
            signal_day={"day": "2026-10-12", "high": 112.0, "low": 95.0}))
        self.assertTrue(row["direction_flipped"])
        self.assertEqual(row["c2_direction"], "long")
        self.assertEqual(row["c2_disposition"], "issued")
        self.assertEqual(row["c2_invalidation"], 90.0)
        self.assertEqual(row["born_dead_mirror"], "passed")
        self.assertEqual(row["short_regime_gate_mirror"], "allowed")

    def test_flipped_born_dead_fires(self):
        row = score_pair(cand(
            FIX_B,
            production_recorded={"direction": "short", "score": 51},
            signal_day={"day": "2026-10-12", "high": 112.0, "low": 89.0}))
        self.assertEqual(row["c2_disposition"], "abstain")
        self.assertEqual(row["c2_disposition_reason"], REASON["born-dead-mirror"])
        self.assertEqual(row["born_dead_mirror"], "suppressed")

    def test_flipped_short_unverifiable_regime_abstains(self):
        row = score_pair(cand(
            FIX_C,
            production_recorded={"direction": "long", "score": 51},
            signal_day={"day": "2026-10-12", "high": 105.0, "low": 95.0}))
        # challenger short: inv=110, high 105 < 110 -> passed; regime unknown
        self.assertTrue(row["direction_flipped"])
        self.assertEqual(row["c2_direction"], "short")
        self.assertEqual(row["born_dead_mirror"], "passed")
        self.assertEqual(row["short_regime_gate_mirror"], "unverifiable")
        self.assertEqual(row["c2_disposition"], "abstain")
        self.assertEqual(row["c2_disposition_reason"], REASON["gate-inputs-unverifiable"])

    def test_flipped_levels_uncomputable(self):
        row = score_pair(cand(
            FIX_C, entry=None, atr14=None,
            production_recorded={"direction": "long", "score": 51}))
        self.assertEqual(row["c2_disposition"], "unscored")
        self.assertEqual(row["c2_disposition_reason"], REASON["levels-uncomputable"])

    def test_no_ledger_suppressed_candidate_retained(self):
        row = score_pair(cand(
            None,
            production_decision="suppressed",
            production_suppression_reason="born-dead LONG: signal-day low 0.03 <= invalidation 0.032"))
        self.assertEqual(row["prod_disposition"], "abstain")
        self.assertEqual(row["prod_disposition_reason"], REASON["born-dead"])
        self.assertEqual(row["c2_disposition"], "unscored")
        self.assertEqual(row["c2_disposition_reason"], REASON["no-factor-ledger"])

    def test_issuance_unavailable_classification(self):
        row = score_pair(cand(
            None,
            production_decision="suppressed",
            production_suppression_reason="issuance-validation unavailable: completed signal-day OHLC missing"))
        self.assertEqual(row["prod_disposition_reason"], REASON["issuance-unavailable"])
        row2 = score_pair(cand(
            None,
            production_decision="suppressed",
            production_suppression_reason="short-regime: bearish daily structure gate not met"))
        self.assertEqual(row2["prod_disposition_reason"], REASON["short-regime"])

    def test_production_unreproduced_kills_challenger(self):
        row = score_pair(cand(
            FIX_A,
            production_recorded={"direction": "short", "score": 51}))
        self.assertEqual(row["prod_disposition"], "unscored")
        self.assertEqual(row["prod_disposition_reason"], REASON["production-unreproduced"])
        self.assertEqual(row["c2_disposition"], "unscored")
        self.assertEqual(row["c2_disposition_reason"], REASON["production-unreproduced"])

    def test_suppressed_with_ledger_no_recorded_score(self):
        # Workstream-B amendment: suppressed before score persistence. The
        # recorded suppression (decision + reason) is the production data;
        # the challenger IS computed from the ledger. FIX_A is non-flipped,
        # so the challenger inherits the suppression as abstain.
        row = score_pair(cand(
            FIX_A,
            production_recorded=None,
            production_decision="suppressed",
            production_suppression_reason="born-dead LONG: signal-day low 0.03 <= invalidation 0.032"))
        self.assertEqual(row["prod_disposition"], "abstain")
        self.assertEqual(row["prod_disposition_reason"], REASON["born-dead"])
        self.assertFalse(row["direction_flipped"])
        self.assertEqual(row["c2_disposition"], "abstain")
        self.assertEqual(row["c2_disposition_reason"], REASON["born-dead"])

    def test_suppressed_recorded_mismatch_still_unreproduced(self):
        # A RECORDED score that mismatches the ledger keeps the fidelity
        # check: both arms unscored:production-unreproduced.
        row = score_pair(cand(
            FIX_A,
            production_recorded={"direction": "short", "score": 51},
            production_decision="suppressed",
            production_suppression_reason="born-dead LONG: signal-day low 0.03 <= invalidation 0.032"))
        self.assertEqual(row["prod_disposition"], "unscored")
        self.assertEqual(row["prod_disposition_reason"], REASON["production-unreproduced"])
        self.assertEqual(row["c2_disposition"], "unscored")
        self.assertEqual(row["c2_disposition_reason"], REASON["production-unreproduced"])

    def test_equity_challenger_not_applicable(self):
        facs = [{"id": i, "label": i, "score": 1, "weight": harness.EQUITY_WEIGHTS[i],
                 "contribution": harness.EQUITY_WEIGHTS[i]}
                for i in harness.EQUITY_WEIGHTS]
        row = score_pair(cand(facs, terminal="equity", production_decision="issued"))
        self.assertEqual(row["c2_disposition"], "not-applicable")
        self.assertEqual(row["c2_disposition_reason"], REASON["no-challenger"])
        self.assertEqual(row["prod_direction"], "long")

    def test_decision_time_strict_raises(self):
        late = [dict(x, asOf="2026-10-14T12:00:00Z") for x in FIX_A]
        with self.assertRaises(LookaheadError):
            score_pair(cand(late), strict=True)
        row = score_pair(cand(late), strict=False)
        self.assertFalse(row["decision_time_verified"])
        self.assertIn("dated after decisionAt", row["decision_time_note"])

    def test_batch_never_silently_drops(self):
        cands = [
            cand(FIX_A),
            cand(FIX_B, production_recorded={"direction": "short", "score": 51},
                 signal_day={"day": "2026-10-12", "high": 112.0, "low": 95.0}),
            cand(None, production_decision="suppressed",
                 production_suppression_reason="short-regime: bearish daily structure gate not met"),
            cand(None),  # unknown decision, no ledger
        ]
        rows = score_batch(cands)
        self.assertEqual(len(rows), len(cands))
        for r in rows:
            self.assertIn(r["prod_disposition"], harness.DISPOSITIONS)
            self.assertIn(r["c2_disposition"], harness.DISPOSITIONS)
            self.assertTrue(r["prod_disposition_reason"])
            self.assertTrue(r["c2_disposition_reason"])

    def test_row_schema_exact(self):
        row = score_pair(cand(FIX_A))
        self.assertEqual(list(row.keys()), ROW_COLUMNS)


class TestCsvRoundtrip(unittest.TestCase):
    def test_roundtrip(self):
        import tempfile
        rows = score_batch([cand(FIX_A), cand(None)])
        with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as t:
            path = t.name
        write_rows_csv(rows, path)
        back = read_rows_csv(path)
        self.assertEqual(len(back), 2)
        self.assertEqual(back[0]["row_id"], "crypto:t1")
        self.assertEqual(back[0]["c2_disposition"], "issued")
        self.assertEqual(back[1]["c2_disposition"], "unscored")
        os.unlink(path)


class TestMetrics(unittest.TestCase):
    def test_wilson_edges(self):
        self.assertIsNone(metrics.wilson(0, 0))
        lo, hi = metrics.wilson(10, 10)
        self.assertLessEqual(lo, 1.0)
        self.assertEqual(hi, 1.0)
        s = metrics.rate_summary(5, 3)
        self.assertEqual(s["n_label"], "small-n")

    def test_empty_rows_metrics(self):
        rows = score_batch([cand(FIX_A)])
        m = metrics.model_metrics(rows, "prod")
        self.assertEqual(m["target_before_stop"]["n"], 0)
        self.assertIsNone(m["net_r"]["mean"])
        self.assertEqual(m["coverage"]["issued"], 1)
        rep = metrics.compare(rows)
        self.assertEqual(rep["n_paired_issued"], 1)

    def test_graded_rows_metrics(self):
        rows = score_batch([cand(FIX_A, candidate_id="g1"),
                            cand(FIX_A, candidate_id="g2")])
        for i, r in enumerate(rows):
            r["prod_barrier_outcome"] = "target" if i == 0 else "invalidated"
            r["c2_barrier_outcome"] = "target" if i == 0 else "invalidated"
            r["prod_net_r"] = "1.5" if i == 0 else "-1.0"
            r["c2_net_r"] = "1.5" if i == 0 else "-1.0"
            r["prod_dir_d5"] = "hit"; r["c2_dir_d5"] = "hit"
        m = metrics.model_metrics(rows, "prod")
        self.assertEqual(m["target_before_stop"]["rate"], 0.5)
        self.assertEqual(m["directional_accuracy"]["d5"]["rate"], 1.0)
        self.assertAlmostEqual(m["net_r"]["mean"], 0.25)
        self.assertEqual(m["directional_accuracy"]["d30"]["n"], 0)


class TestClusterRobust(unittest.TestCase):
    def crow(self, rid, symbol, issued_at, direction):
        return {"row_id": rid, "symbol": symbol, "issued_at": issued_at,
                "prod_direction": direction}

    def test_grouping_rule(self):
        rows = [
            self.crow("a", "BTC", "2026-11-01T00:00:00Z", "long"),
            # same symbol, far apart, opposite direction -> same cluster (rule 1)
            self.crow("b", "BTC", "2026-12-20T00:00:00Z", "short"),
            # different symbol, same direction, issued 2d apart -> same cluster (rule 2)
            self.crow("c", "ETH", "2026-11-03T00:00:00Z", "long"),
            # different symbol AND different direction from a/c; too far from b
            # for rule 2 (47d > 7d) -> own cluster
            self.crow("d", "XRP", "2026-11-03T00:00:00Z", "short"),
            # no issued_at -> singleton
            self.crow("e", "SOL", None, "long"),
        ]
        cl = metrics.assign_clusters(rows)
        self.assertEqual(cl["a"], cl["b"])
        self.assertEqual(cl["a"], cl["c"])
        self.assertNotEqual(cl["a"], cl["d"])
        self.assertNotEqual(cl["a"], cl["e"])
        self.assertNotEqual(cl["d"], cl["e"])
        self.assertEqual(len(set(cl.values())), 3)

    def test_grouping_uses_decision_time_fields_only(self):
        # same outcome values cannot create a link
        r1 = self.crow("a", "BTC", "2026-11-01T00:00:00Z", "long")
        r2 = self.crow("b", "ETH", "2026-12-25T00:00:00Z", "short")
        r1["prod_net_r"] = "1.5"
        r2["prod_net_r"] = "1.5"
        cl = metrics.assign_clusters([r1, r2])
        self.assertNotEqual(cl["a"], cl["b"])

    def test_t975_table(self):
        self.assertEqual(metrics.t975(9), 2.262)
        self.assertEqual(metrics.t975(1), 12.706)
        self.assertEqual(metrics.t975(100), 1.96)
        with self.assertRaises(ValueError):
            metrics.t975(0)

    def test_cluster_interval_hand_computed(self):
        # 10 singleton clusters, values 1..10:
        # mean 5.5; sum_g S_g^2 = 82.5; Var = (10/9)*(82.5/100) = 0.916667
        pairs = [(float(v), v - 1) for v in range(1, 11)]
        s = metrics.cluster_mean_interval(pairs)
        self.assertEqual(s["n"], 10)
        self.assertEqual(s["G"], 10)
        self.assertAlmostEqual(s["mean"], 5.5)
        self.assertAlmostEqual(s["se"], 0.9574271, places=6)
        self.assertEqual(s["verdict"], "reported")
        lo, hi = s["ci95"]
        self.assertAlmostEqual(lo, 5.5 - 2.262 * s["se"], places=6)
        self.assertAlmostEqual(hi, 5.5 + 2.262 * s["se"], places=6)

    def test_cluster_interval_below_minimum_inconclusive(self):
        # 4 clusters -> INCONCLUSIVE: point estimate shown, NO interval
        pairs = [(1.0, 0), (2.0, 0), (3.0, 1), (4.0, 1),
                 (5.0, 2), (6.0, 3)]
        s = metrics.cluster_mean_interval(pairs)
        self.assertEqual(s["G"], 4)
        self.assertAlmostEqual(s["mean"], 3.5)
        self.assertIsNone(s["ci95"])
        self.assertIn("INCONCLUSIVE", s["verdict"])

    def test_cluster_interval_empty(self):
        s = metrics.cluster_mean_interval([])
        self.assertEqual(s["n"], 0)
        self.assertIsNone(s["mean"])
        self.assertIsNone(s["ci95"])

    def test_direction_disagreement(self):
        agree = cand(FIX_A, candidate_id="a1")  # non-flipped: same direction
        disagree = cand(FIX_B, candidate_id="d1",
                        production_recorded={"direction": "short", "score": 51},
                        signal_day={"day": "2026-10-12", "high": 112.0, "low": 95.0})
        rows = score_batch([agree, disagree])
        dd = metrics.direction_disagreement(rows)
        self.assertEqual(dd["n_paired_issued"], 2)
        self.assertEqual(dd["n_both_directed"], 2)
        self.assertEqual(dd["n_disagree"], 1)
        self.assertAlmostEqual(dd["fraction"], 0.5)
        self.assertTrue(dd["audit_trigger"])
        self.assertIsNotNone(dd["audit_note"])

    def test_direction_disagreement_no_trigger(self):
        rows = score_batch([cand(FIX_A, candidate_id="a1"),
                            cand(FIX_A, candidate_id="a2")])
        dd = metrics.direction_disagreement(rows)
        self.assertEqual(dd["fraction"], 0.0)
        self.assertFalse(dd["audit_trigger"])
        self.assertIsNone(dd["audit_note"])

    def test_compare_no_target_n_logic(self):
        rows = score_batch([cand(FIX_A, candidate_id="a1"),
                            cand(FIX_A, candidate_id="a2")])
        rep = metrics.compare(rows)
        self.assertNotIn("n>=30", rep["readout_note"])
        self.assertNotIn("30 paired", rep["readout_note"])
        self.assertIn("REGARDLESS of N", rep["readout_note"])
        self.assertIn("direction_disagreement", rep)
        self.assertIn("paired_cluster", rep)
        self.assertEqual(rep["n_paired_issued"], 2)
        # nothing graded yet -> paired intervals read n=0, not an error
        self.assertEqual(rep["paired_cluster"]["net_r_gap"]["n"], 0)
        self.assertIsNone(rep["paired_cluster"]["net_r_gap"]["ci95"])


class TestPrimaryAccounting(unittest.TestCase):
    """The audit's primary economic comparison (MEASUREMENT-GAPS-2026-10-14,
    section (d)): genuine abstention = 0.000 R real zero; never-evaluated /
    ungraded = UNKNOWN (counted, labeled, excluded -- never 0, never dropped).
    Primary = mean per-opportunity paired difference over non-UNKNOWN
    opportunities with the cluster-robust interval; both-issued-only is the
    secondary sensitivity check.
    """

    def _row(self, rid, symbol, prod_disp, prod_net, c2_disp, c2_net,
             terminal="crypto"):
        r = score_pair(cand(FIX_A, candidate_id=rid, terminal=terminal,
                            symbol=symbol))
        r["prod_disposition"] = prod_disp
        r["prod_net_r"] = prod_net
        r["c2_disposition"] = c2_disp
        r["c2_net_r"] = c2_net
        return r

    def test_arm_contribution_accounting(self):
        r = self._row("c1", "T1", "issued", "1.5", "issued", "1.0")
        self.assertAlmostEqual(metrics.arm_contribution(r, "prod"), 1.5)
        self.assertAlmostEqual(metrics.arm_contribution(r, "c2"), 1.0)
        # issued but outcome not graded -> UNKNOWN (not 0)
        r2 = self._row("c2", "T2", "issued", None, "issued", None)
        self.assertIsNone(metrics.arm_contribution(r2, "prod"))
        self.assertIsNone(metrics.arm_contribution(r2, "c2"))
        # genuine abstention -> real zero
        r3 = self._row("c3", "T3", "issued", "2.0", "abstain", None)
        r3["c2_disposition_reason"] = "abstain:born-dead"
        self.assertAlmostEqual(metrics.arm_contribution(r3, "c2"), 0.0)
        # never evaluated -> UNKNOWN (never 0)
        r4 = self._row("c4", "T4", "unscored", None, "not-applicable", None)
        r4["prod_disposition_reason"] = "unscored:production-not-issued"
        r4["c2_disposition_reason"] = "not-applicable:no-challenger-frozen"
        self.assertIsNone(metrics.arm_contribution(r4, "prod"))
        self.assertIsNone(metrics.arm_contribution(r4, "c2"))

    def test_primary_paired_difference_abstain_zero_participates(self):
        rows = [
            # both issued + graded: d = 1.0 - 1.5 = -0.5
            self._row("p1", "A", "issued", "1.5", "issued", "1.0"),
            # prod issued + graded, c2 genuine abstention: d = 0.0 - 2.0 = -2.0
            self._row("p2", "B", "issued", "2.0", "abstain", None),
            # prod never evaluated, c2 no counterpart -> UNKNOWN, excluded
            self._row("p3", "C", "unscored", None, "not-applicable", None),
            # both issued, outcomes pending -> UNKNOWN, excluded
            self._row("p4", "D", "issued", None, "issued", None),
        ]
        rows[1]["c2_disposition_reason"] = "abstain:short-regime-gate"
        rows[2]["prod_disposition_reason"] = "unscored:production-not-issued"
        rows[2]["c2_disposition_reason"] = "not-applicable:no-challenger-frozen"
        pr = metrics.compare_primary(rows, "crypto")
        self.assertEqual(pr["n_opportunities"], 4)
        # only p1 and p2 enter the primary set; p3/p4 are UNKNOWN
        self.assertEqual(pr["n_primary"], 2)
        self.assertEqual(pr["accounting"]["prod"]["n_unknown"], 2)   # p3, p4
        self.assertEqual(pr["accounting"]["c2"]["n_unknown"], 2)     # p3, p4
        self.assertEqual(pr["accounting"]["c2"]["n_abstain_zero"], 1)  # p2
        self.assertEqual(pr["accounting"]["prod"]["n_graded"], 2)
        # mean of d = (-0.5 + -2.0) / 2 = -1.25
        self.assertAlmostEqual(pr["net_r_gap_primary"]["mean"], -1.25)
        # 2 clusters < 10 -> INCONCLUSIVE, no interval
        self.assertIsNone(pr["net_r_gap_primary"]["ci95"])
        self.assertIn("INCONCLUSIVE", pr["net_r_gap_primary"]["verdict"])

    def test_primary_all_unknown_reads_n0(self):
        # the worked example from the audit: 10/10 both-issued but all
        # outcomes not-graded -> primary set is empty; counts labeled
        rows = [self._row(f"u{i}", f"S{i}", "issued", None, "issued", None)
                for i in range(3)]
        pr = metrics.compare_primary(rows, "crypto")
        self.assertEqual(pr["n_opportunities"], 3)
        self.assertEqual(pr["n_primary"], 0)
        self.assertIsNone(pr["net_r_gap_primary"]["mean"])
        self.assertEqual(pr["accounting"]["prod"]["n_unknown"], 3)

    def test_primary_interval_reported_at_g10(self):
        # 10 distinct symbols -> 10 singleton clusters -> G=10: interval
        # reported (t_9 critical value).
        rows = [self._row(f"g{i}", f"SYM{i}", "issued", "1.0", "issued", "0.5")
                for i in range(10)]
        pr = metrics.compare_primary(rows, "crypto")
        self.assertEqual(pr["n_primary"], 10)
        gap = pr["net_r_gap_primary"]
        self.assertEqual(gap["G"], 10)
        self.assertAlmostEqual(gap["mean"], -0.5)
        self.assertIsNotNone(gap["ci95"])
        self.assertEqual(gap["verdict"], "reported")

    def test_equity_single_arm_primary(self):
        rows = [
            self._row("e1", "AAPL", "issued", "1.2", "not-applicable", None,
                      terminal="equity"),
            self._row("e2", "MSFT", "abstain", None, "not-applicable", None,
                      terminal="equity"),
            self._row("e3", "GOOG", "unscored", None, "not-applicable", None,
                      terminal="equity"),
        ]
        rows[1]["prod_disposition_reason"] = "abstain:short-regime-gate"
        rows[2]["prod_disposition_reason"] = "unscored:production-not-issued"
        pr = metrics.compare_primary(rows, "equity")
        self.assertEqual(pr["n_opportunities"], 3)
        # e1 graded 1.2 + e2 abstention 0.0; e3 UNKNOWN excluded
        self.assertEqual(pr["n_primary"], 2)
        self.assertAlmostEqual(pr["prod_contribution_primary"]["mean"], 0.6)
        self.assertEqual(pr["accounting"]["prod"]["n_unknown"], 1)
        self.assertEqual(pr["accounting"]["prod"]["n_abstain_zero"], 1)
        self.assertIn("production-only", pr["single_arm"])

    def test_compare_carries_primary_and_secondary(self):
        rows = score_batch([cand(FIX_A, candidate_id="a1"),
                            cand(FIX_A, candidate_id="a2")])
        rep = metrics.compare(rows)
        self.assertIn("primary", rep)
        self.assertTrue(rep["primary"]["primary"])
        self.assertIn("SECONDARY", rep["paired_cluster"]["role"])
        # the audit's worked example: nothing graded yet -> primary set empty
        self.assertEqual(rep["primary"]["n_primary"], 0)
        self.assertEqual(rep["primary"]["accounting"]["prod"]["n_unknown"], 2)


class TestAssertedRules(unittest.TestCase):
    """The four asserted harness semantics (2026-10-14), pinned as tests.

    RULE 1: recorded suppression -> abstain even with no recorded score.
    RULE 2: missing scores alone never -> abstain (stays unscored).
    RULE 3: missing score recomputed from the COMPLETE ledger (both arms);
            incomplete ledger -> unscored, never guessed.
    RULE 4: C-2 evaluated independently -- production abstain never implies
            C-2 abstain; C-2 abstain/unscored only on its own evidence.
    """

    # incomplete-ledger fixture: FIX_A minus three frozen factors
    PARTIAL_A = [x for x in FIX_A
                 if x["label"] not in ("MACD", "TVL trend",
                                       "Developer velocity")]
    # corner fixture: ledger missing ONLY Momentum (production incomplete,
    # challenger complete on its own 10-factor set)
    NO_MOMENTUM_A = [x for x in FIX_A if x["label"] != "Momentum"]

    def test_rule1_recorded_suppression_no_score_no_ledger_abstains(self):
        # (a) recorded suppression + no score + no ledger -> abstain.
        # Recorded decision > missing number.
        row = score_pair(cand(
            None,
            production_recorded=None,
            production_decision="suppressed",
            production_suppression_reason=(
                "born-dead LONG: signal-day low 0.03 <= invalidation 0.032")))
        self.assertEqual(row["prod_disposition"], "abstain")
        self.assertEqual(row["prod_disposition_reason"], REASON["born-dead"])
        self.assertIsNone(row["prod_long_score"])  # no score, still abstain

    def test_rule1_recorded_suppression_no_score_with_ledger_abstains(self):
        # (a) recorded suppression + no score + complete ledger -> abstain
        # (workstream-B amendment, generalized by RULE 1).
        row = score_pair(cand(
            FIX_A,
            production_recorded=None,
            production_decision="suppressed",
            production_suppression_reason=(
                "born-dead LONG: signal-day low 0.03 <= invalidation 0.032")))
        self.assertEqual(row["prod_disposition"], "abstain")
        self.assertEqual(row["prod_disposition_reason"], REASON["born-dead"])

    def test_rule1_recorded_suppression_beats_incomplete_ledger(self):
        # RULE 1 holds even when the ledger is incomplete: the recorded
        # suppression is the data; no score is needed for it.
        row = score_pair(cand(
            self.PARTIAL_A,
            production_recorded=None,
            production_decision="suppressed",
            production_suppression_reason=(
                "born-dead LONG: signal-day low 0.03 <= invalidation 0.032")))
        self.assertEqual(row["prod_disposition"], "abstain")
        self.assertEqual(row["prod_disposition_reason"], REASON["born-dead"])

    def test_rule1_suppression_with_unverifiable_recorded_score_abstains(self):
        # Documented tension (ii): suppressed + incomplete ledger + a RECORDED
        # (but unverifiable) score -> abstain. Only a PROVEN mismatch on a
        # complete ledger overturns a recorded suppression.
        row = score_pair(cand(
            self.PARTIAL_A,
            production_recorded={"direction": "long", "score": 72},
            production_decision="suppressed",
            production_suppression_reason=(
                "born-dead LONG: signal-day low 0.03 <= invalidation 0.032")))
        self.assertEqual(row["prod_disposition"], "abstain")
        self.assertEqual(row["prod_disposition_reason"], REASON["born-dead"])

    def test_rule2_no_score_no_suppression_never_abstains(self):
        # (b) no score + no suppression record -> unscored, NEVER abstain.
        row = score_pair(cand(
            FIX_A,
            production_recorded=None,
            production_decision="issued"))
        self.assertEqual(row["prod_disposition"], "unscored")
        self.assertNotEqual(row["prod_disposition"], "abstain")
        self.assertEqual(row["prod_disposition_reason"],
                         REASON["production-unreproduced"])
        # and with no ledger and no decision at all:
        row2 = score_pair(cand(None, production_recorded=None,
                               production_decision=None))
        self.assertEqual(row2["prod_disposition"], "unscored")
        self.assertNotEqual(row2["prod_disposition"], "abstain")
        self.assertEqual(row2["prod_disposition_reason"],
                         REASON["no-factor-ledger"])

    def test_rule3_complete_ledger_no_score_recomputed_both_arms(self):
        # (c) complete ledger + no recorded score -> the score IS recomputed
        # from the ledger and written (both arms), even though the production
        # disposition stays unscored per RULE 2.
        row = score_pair(cand(
            FIX_A,
            production_recorded=None,
            production_decision="issued"))
        self.assertEqual(row["prod_long_score"], 72)   # recomputed, not None
        self.assertEqual(row["prod_short_score"], 28)
        self.assertEqual(row["prod_direction"], "long")
        self.assertEqual(row["c2_long_score"], 70)     # challenger recomputed
        self.assertEqual(row["c2_short_score"], 30)
        self.assertEqual(row["c2_direction"], "long")

    def test_rule3_incomplete_ledger_no_score_stays_unscored(self):
        # (d) incomplete ledger + no score -> unscored for both arms; no
        # score is guessed from the partial ledger.
        row = score_pair(cand(
            self.PARTIAL_A,
            production_recorded=None,
            production_decision="issued"))
        self.assertEqual(row["prod_disposition"], "unscored")
        self.assertEqual(row["prod_disposition_reason"],
                         REASON["incomplete-ledger"])
        self.assertIsNone(row["prod_long_score"])  # not guessed
        self.assertIsNone(row["prod_direction"])
        self.assertEqual(row["c2_disposition"], "unscored")
        self.assertEqual(row["c2_disposition_reason"],
                         REASON["incomplete-ledger"])
        self.assertIsNone(row["c2_long_score"])

    def test_rule4_production_abstain_challenger_scored_independently(self):
        # (e) production abstains (suppressed, no recorded score) but the
        # challenger flips and passes its OWN mirrored gates -> C-2 issued,
        # NOT abstain. Production abstain does not imply C-2 abstain.
        row = score_pair(cand(
            FIX_C,  # prod long 51, C-2 short 47 -> flipped
            production_recorded=None,
            production_decision="suppressed",
            production_suppression_reason=(
                "born-dead LONG: signal-day low 89.0 <= invalidation 90.0"),
            signal_day={"day": "2026-10-12", "high": 105.0, "low": 95.0},
            short_regime_inputs={"price_below_sma50": True,
                                 "lower_highs": True,
                                 "trend20_negative": False}))
        self.assertEqual(row["prod_disposition"], "abstain")
        self.assertEqual(row["prod_disposition_reason"], REASON["born-dead"])
        self.assertTrue(row["direction_flipped"])
        self.assertEqual(row["c2_direction"], "short")
        self.assertEqual(row["c2_disposition"], "issued")  # not abstain
        self.assertNotEqual(row["c2_disposition"], "abstain")
        self.assertEqual(row["c2_disposition_reason"], REASON["ok"])
        self.assertEqual(row["born_dead_mirror"], "passed")  # own gate

    def test_rule4_production_abstain_challenger_no_evidence_unscored(self):
        # (f) production abstains + C-2 has no ledger -> C-2 unscored on its
        # own missing evidence, NOT an inherited abstain.
        row = score_pair(cand(
            None,
            production_recorded=None,
            production_decision="suppressed",
            production_suppression_reason=(
                "born-dead LONG: signal-day low 0.03 <= invalidation 0.032")))
        self.assertEqual(row["prod_disposition"], "abstain")
        self.assertEqual(row["c2_disposition"], "unscored")
        self.assertNotEqual(row["c2_disposition"], "abstain")
        self.assertEqual(row["c2_disposition_reason"],
                         REASON["no-factor-ledger"])

    def test_rule4_nonflipped_shared_evidence_not_inheritance(self):
        # Non-flipped + production suppressed: the challenger records abstain
        # with the same reason code because the direction/levels/gate inputs
        # are shared BY CONSTRUCTION -- framed as shared-evidence agreement,
        # never as inheritance of production's decision.
        row = score_pair(cand(
            FIX_A,
            production_recorded=None,
            production_decision="suppressed",
            production_suppression_reason=(
                "born-dead LONG: signal-day low 0.03 <= invalidation 0.032")))
        self.assertFalse(row["direction_flipped"])
        self.assertEqual(row["c2_disposition"], "abstain")
        self.assertEqual(row["c2_disposition_reason"], REASON["born-dead"])
        self.assertNotIn("inherits",
                         row["born_dead_mirror_reason"].lower())

    def test_rule4_challenger_scored_when_production_has_no_recorded_score(self):
        # Issued + complete ledger + nothing recorded: production is unscored
        # (RULE 2) but the challenger is scored from its own complete ledger
        # (RULE 3 + RULE 4) -- the missing production recording is not the
        # challenger's evidence.
        row = score_pair(cand(
            FIX_A,
            production_recorded=None,
            production_decision="issued"))
        self.assertEqual(row["prod_disposition"], "unscored")
        self.assertEqual(row["c2_disposition"], "issued")
        self.assertEqual(row["c2_long_score"], 70)

    def test_rule3_challenger_own_ledger_complete_scores_without_prod(self):
        # Corner: ledger missing ONLY Momentum. Production cannot recompute
        # (incomplete -> unscored, not guessed) but the challenger's own
        # 10-factor set IS complete -> its scores are written; the pair
        # comparison can't be formed, so no disposition is guessed either.
        row = score_pair(cand(
            self.NO_MOMENTUM_A,
            production_recorded=None,
            production_decision="issued"))
        self.assertEqual(row["prod_disposition"], "unscored")
        self.assertEqual(row["prod_disposition_reason"],
                         REASON["incomplete-ledger"])
        self.assertIsNone(row["prod_long_score"])
        self.assertEqual(row["c2_long_score"], 70)  # scored on own evidence
        self.assertEqual(row["c2_direction"], "long")
        self.assertIsNone(row["direction_flipped"])
        self.assertEqual(row["c2_disposition"], "unscored")
        self.assertNotEqual(row["c2_disposition"], "abstain")

    def test_ledger_completeness_helper(self):
        ok, _ = _ledger_completeness("crypto", FIX_A)
        self.assertTrue(ok)
        ok, note = _ledger_completeness("crypto", self.PARTIAL_A)
        self.assertFalse(ok)
        self.assertIn("MACD", note)
        # challenger's own set: complete without Momentum...
        ok, _ = _ledger_completeness("crypto", self.NO_MOMENTUM_A,
                                     for_challenger=True)
        self.assertTrue(ok)
        # ...but production's set is not.
        ok, _ = _ledger_completeness("crypto", self.NO_MOMENTUM_A)
        self.assertFalse(ok)
        # non-finite contribution / zero weight -> unusable -> incomplete
        bad = [dict(x) for x in FIX_A]
        bad[0] = dict(bad[0], contribution=float("nan"))
        ok, _ = _ledger_completeness("crypto", bad)
        self.assertFalse(ok)
        bad2 = [dict(x) for x in FIX_A]
        bad2[1] = dict(bad2[1], weight=0)
        ok, _ = _ledger_completeness("crypto", bad2)
        self.assertFalse(ok)
        # legacy walk-forward factor is excluded, never counted as missing
        with_wf = FIX_A + [f("Walk-forward base rate", 1, 1.0)]
        ok, _ = _ledger_completeness("crypto", with_wf)
        self.assertTrue(ok)
        # pipeline-persisted label variant: "Supply-overhang penalty
        # (negative-only)" is the same frozen factor (trailing parenthetical
        # annotation stripped by _canon_label) -- all 10 pilot crypto rows
        # carry this label and reproduce 10/10.
        annotated = [dict(x) for x in FIX_A]
        annotated[-1] = dict(annotated[-1],
                             label="Supply-overhang penalty (negative-only)")
        ok, _ = _ledger_completeness("crypto", annotated)
        self.assertTrue(ok)
        # equity: 7 ids
        efacs = [{"id": i, "label": i, "score": 1,
                  "weight": harness.EQUITY_WEIGHTS[i],
                  "contribution": harness.EQUITY_WEIGHTS[i]}
                 for i in harness.EQUITY_WEIGHTS]
        ok, _ = _ledger_completeness("equity", efacs)
        self.assertTrue(ok)
        ok, _ = _ledger_completeness("equity", efacs[:-1])
        self.assertFalse(ok)


if __name__ == "__main__":
    unittest.main(verbosity=2)
