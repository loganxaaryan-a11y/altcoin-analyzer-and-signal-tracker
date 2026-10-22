#!/usr/bin/env python3
"""Pinned tests for the wired intended-model trial connection.

These tests bind the Python wiring (comparison/intended_models.py) to the
exact deployed-recorded decisions of the actual model engines. If any
formula, constant, or label deviates from the frozen source, a test fails.
Hermetic: ledgers are embedded fixtures copied verbatim from the workspace
DB copies (generated_signals factors_json), no DB dependency.
"""

import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
CMP = os.path.dirname(HERE)
sys.path.insert(0, CMP)

import decision_time_store as store
import intended_models as m


def _f(label, weight, score, contribution):
    return {"label": label, "weight": weight, "score": score, "contribution": contribution}


# Fixtures: ledgers copied verbatim from generated_signals.factors_json.
# asOf/quality omitted (scoring uses label/weight/contribution only).

BTC_ID43 = [  # generated_signals id 43, 2026-10-14T13:00:21.555Z, recorded long 52
    _f("Trend cluster", 2.5, 1, 2.5),
    _f("Momentum", 1.5, 0, 0),
    _f("MACD", 1.5, -1, -1.5),
    _f("Perp funding crowding", 1.75, -1, -1.75),
    _f("Open interest", 1, 0, 0),
    _f("Binance futures positioning", 1, 0, 0),
    _f("Cross-venue taker imbalance", 1.25, 0, 0),
    _f("TVL trend", 2, 0, 0),
    _f("Revenue linkage", 1.5, 0, 0),
    _f("Developer velocity", 1.5, 1, 1.5),
    _f("Supply-overhang penalty (negative-only)", 1.5, 0, 0),
]

ETH_ID42 = [  # generated_signals id 42, recorded long 52
    _f("Trend cluster", 2.5, 1, 2.5),
    _f("Momentum", 1.5, -1, -1.5),
    _f("MACD", 1.5, -1, -1.5),
    _f("Perp funding crowding", 1.75, 0, 0),
    _f("Open interest", 1, 0, 0),
    _f("Binance futures positioning", 1, 0, 0),
    _f("Cross-venue taker imbalance", 1.25, 0, 0),
    _f("TVL trend", 2, 0, 0),
    _f("Revenue linkage", 1.5, 0, 0),
    _f("Developer velocity", 1.5, 1, 1.5),
    _f("Supply-overhang penalty (negative-only)", 1.5, 0, 0),
]

HYPE_ID40 = [  # generated_signals id 40, recorded short 56
    _f("Trend cluster", 2.5, 1, 2.5),
    _f("Momentum", 1.5, -1, -1.5),
    _f("MACD", 1.5, -1, -1.5),
    _f("Perp funding crowding", 1.75, -1, -1.75),
    _f("Open interest", 1, 0, 0),
    _f("Binance futures positioning", 1, 0, 0),
    _f("Cross-venue taker imbalance", 1.25, 0, 0),
    _f("TVL trend", 2, 0, 0),
    _f("Revenue linkage", 1.5, 1, 1.5),
    _f("Developer velocity", 1.5, 0, 0),
    _f("Supply-overhang penalty (negative-only)", 1.5, -1, -1.5),
]

# Equity fixture: tracked_signals id 52 (META, 2026-10-05), legacy-pre-phase1,
# recorded confidence 73 / long. Factor votes -1/0/+1 with weights 6/8/8/20/8/20/20.
META_EQ52 = [
    {"name": "Price vs SMA 20", "weight": 6, "score": 1},
    {"name": "Price vs SMA 50", "weight": 8, "score": 1},
    {"name": "Price vs SMA 200", "weight": 8, "score": 1},
    {"name": "Wilder RSI 14", "weight": 20, "score": 1},
    {"name": "MACD 12–26", "weight": 8, "score": 1},
    {"name": "High-volume direction", "weight": 20, "score": 0},
    {"name": "ATR-adjusted 30-session trend", "weight": 20, "score": 1},
]


class TestCryptoProductionWiring(unittest.TestCase):
    """crypto-dossier-factor-agreement 2.0.0 <- scoreDossierFactors."""

    def test_btc_id43_reproduces_recorded_52_long(self):
        r = m.score_dossier_factors(BTC_ID43)
        self.assertEqual(r["weightedNet"], 0.75)
        self.assertEqual(r["totalWeight"], 17.0)
        self.assertEqual(r["longScore"], 52)
        self.assertEqual(r["shortScore"], 48)
        self.assertEqual(r["direction"], "long")

    def test_eth_id42_reproduces_recorded_52_long(self):
        r = m.score_dossier_factors(ETH_ID42)
        self.assertEqual(r["longScore"], 52)
        self.assertEqual(r["direction"], "long")

    def test_hype_id40_reproduces_recorded_56_short(self):
        r = m.score_dossier_factors(HYPE_ID40)
        self.assertAlmostEqual(r["weightedNet"], -2.25)
        self.assertEqual(r["longScore"], 44)
        self.assertEqual(r["shortScore"], 56)
        self.assertEqual(r["direction"], "short")

    def test_btc_id43_levels_reproduce_exactly(self):
        lv = m.build_atr_levels("long", 82805, 2183.207762343296, 1.25)
        self.assertEqual(lv["stop"], 80075.99029707088)
        self.assertEqual(lv["target"], 86898.51455439368)
        self.assertEqual(lv["target2"], 89627.5242573228)


class TestC2Wiring(unittest.TestCase):
    """crypto-dossier-minus-momentum 0.1.0-shadow <- frozen C-2 formula."""

    def test_btc_id43_nonflipped_52(self):
        c2 = m.c2_score_minus_momentum(BTC_ID43)
        self.assertEqual(c2["challengerLong"], 52)
        self.assertEqual(c2["challengerDirection"], "long")
        self.assertEqual(c2["challengerTotalWeight"], 15.5)
        self.assertEqual(c2["momentumDropped"], 1)

    def test_eth_id42_c2_diverges_score_direction_agrees(self):
        # Momentum is -1 on ETH: removing it lifts the challenger score to 57
        # while direction stays long (non-flipped leg, scores differ).
        c2 = m.c2_score_minus_momentum(ETH_ID42)
        self.assertEqual(c2["challengerLong"], 57)
        self.assertEqual(c2["challengerDirection"], "long")

    def test_hype_id40_c2_stays_short(self):
        c2 = m.c2_score_minus_momentum(HYPE_ID40)
        self.assertEqual(c2["challengerLong"], 48)
        self.assertEqual(c2["challengerShort"], 52)
        self.assertEqual(c2["challengerDirection"], "short")

    def test_momentum_removal_is_not_rescaled(self):
        # Denominator must be 17.0 - 1.5 = 15.5, never renormalized to 17.
        self.assertEqual(m.C2_TOTAL_WEIGHT, 15.5)


class TestEquityWiring(unittest.TestCase):
    """equity-factor-agreement 3.1.0 <- factorScoreBreakdown / signalDecision."""

    def test_meta_id52_reproduces_recorded_73_long(self):
        b = m.factor_score_breakdown(META_EQ52)
        # weighted votes: (6+8+8+20+8+0+20)/90 = 70/90 -> raw 78; all five
        # trend-cluster factors +1 -> -5 toward zero -> 73.
        self.assertEqual(b["rawScore"], 78)
        self.assertEqual(b["redundancyAdjustment"], -5)
        self.assertEqual(b["score"], 73)
        self.assertEqual(m.signal_decision(b["score"]), "long")

    def test_signal_decision_thresholds(self):
        self.assertEqual(m.signal_decision(20), "long")
        self.assertEqual(m.signal_decision(-20), "short")
        self.assertEqual(m.signal_decision(19), "mixed")
        self.assertEqual(m.signal_decision(-19), "mixed")
        self.assertEqual(m.signal_decision(0), "mixed")

    def test_legacy_30_session_return_dropped_when_atr_trend_present(self):
        factors = META_EQ52 + [{"name": "30-session return", "weight": 20, "score": 1}]
        normalized = m.normalize_signal_factors(factors)
        self.assertFalse(any(f["name"] == "30-session return" for f in normalized))
        self.assertEqual(len(normalized), 7)


class TestIdentityAndConstants(unittest.TestCase):
    def test_strategy_identity(self):
        self.assertEqual(m.CRYPTO_STRATEGY_ID, "crypto-dossier-factor-agreement")
        self.assertEqual(m.CRYPTO_STRATEGY_VERSION, "2.0.0-measurement-contract")
        self.assertEqual(m.CRYPTO_PARAMETER_HASH,
                         "sha256:4a098b4d389cb85293c78785c82e88a32fe6d96544a8dd84c341dce9fa0b7220")
        self.assertEqual(m.EQUITY_STRATEGY_ID, "equity-factor-agreement")
        self.assertEqual(m.EQUITY_STRATEGY_VERSION, "3.1.0-measurement-closure")
        self.assertEqual(m.EQUITY_PARAMETER_HASH, "atr2-target1.5R-weights-6-8-8-20-8-20-20")

    def test_frozen_formula_constants(self):
        self.assertEqual(m.CRYPTO_FORMULA_SCALE, 42.0)
        self.assertEqual((m.CRYPTO_SCORE_FLOOR, m.CRYPTO_SCORE_CEIL), (5, 95))
        self.assertEqual(m.CRYPTO_TOTAL_WEIGHT, 17.0)
        self.assertEqual(m.C2_TOTAL_WEIGHT, 15.5)
        self.assertEqual(m.EQUITY_WEIGHTS, (6, 8, 8, 20, 8, 20, 20))
        self.assertEqual(len(m.CRYPTO_PRODUCTION_LABELS_FROZEN), 11)
        self.assertEqual(len(m.CRYPTO_C2_LABELS_FROZEN), 10)

    def test_canon_label_strips_annotation(self):
        self.assertEqual(m.canon_label("Supply-overhang penalty (negative-only)"),
                         "Supply-overhang penalty")
        self.assertEqual(m.canon_label("Trend cluster"), "Trend cluster")

    def test_ts_round_is_half_up(self):
        self.assertEqual(m.ts_round(52.5), 53)
        self.assertEqual(m.ts_round(51.85), 52)


class TestDecisionTimeStore(unittest.TestCase):
    def test_missing_input_marked_unknown_never_backfilled(self):
        rec = store.build_factor_record({
            "label": "Cross-venue taker imbalance", "weight": 1.25, "score": 0,
            "contribution": 0, "reading": "", "source": "Binance aggTrades + OKX spot trades",
            "quality": "no_data", "asOf": None, "value": None,
        })
        self.assertEqual(rec["status"], "UNKNOWN")
        self.assertIsNone(rec["asOf"])
        self.assertIsNone(rec["value"])
        # The consumed decision-time fact (weight/score/contribution) IS recorded;
        # only the missing temporal anchor is unknown -- nothing reconstructed.
        self.assertEqual(rec["weight"], 1.25)
        self.assertEqual(rec["score"], 0)

    def test_observed_input_kept(self):
        rec = store.build_factor_record({
            "label": "Trend cluster", "weight": 2.5, "score": 1, "contribution": 2.5,
            "reading": "50D: above", "source": "CoinGecko daily history",
            "quality": "live", "asOf": "2026-10-14T12:58:47.000Z", "value": "50D: above",
        })
        self.assertEqual(rec["status"], "observed")
        self.assertEqual(rec["asOf"], "2026-10-14T12:58:47.000Z")

    def test_persist_refuses_unidentified_bundle(self):
        with self.assertRaises(ValueError):
            store.persist_decision_time_inputs({
                "opportunity_id": "x", "terminal": "crypto",
                "model": {"strategy_id": "", "strategy_version": ""},
                "decision_at": "2026-10-14T00:00:00Z", "factors": [],
            })

    def test_ledger_completeness_both_arms(self):
        facs = [{"label": f["label"], "weight": f["weight"], "contribution": f["contribution"]}
                for f in BTC_ID43]
        complete_p, missing_p = store.ledger_completeness("crypto", facs, for_challenger=False)
        complete_c, missing_c = store.ledger_completeness("crypto", facs, for_challenger=True)
        self.assertTrue(complete_p, missing_p)
        self.assertTrue(complete_c, missing_c)
        facs2 = [f for f in facs if m.canon_label(f["label"]) != "TVL trend"]
        complete_p2, missing_p2 = store.ledger_completeness("crypto", facs2, for_challenger=False)
        self.assertFalse(complete_p2)
        self.assertIn("TVL trend", missing_p2)


if __name__ == "__main__":
    unittest.main(verbosity=2)
