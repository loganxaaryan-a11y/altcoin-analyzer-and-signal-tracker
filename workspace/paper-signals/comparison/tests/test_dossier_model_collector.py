#!/usr/bin/env python3
"""Tests for the automatic dual-arm dossier-model collector.

Paper only. No brokerage. All fixtures synthetic except the pinned
id40/id43 math, which mirrors tests/test_intended_models.py's pinned
deployed-recorded fixtures.
"""

import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import dossier_model_collector as dmc


def _f(label, weight, score):
    return {"label": label, "weight": weight, "score": score,
            "contribution": weight * score}


# Pinned fixture: generated_signals id 40 (HYPE short, recorded 56 short).
# Mirrors tests/test_intended_models.py HYPE_ID40 (longScore 44, short 56).
HYPE_ID40_FACTORS = [
    _f("Trend cluster", 2.5, 1),
    _f("Momentum", 1.5, -1),
    _f("MACD", 1.5, -1),
    _f("Perp funding crowding", 1.75, -1),
    _f("Open interest", 1, 0),
    _f("Binance futures positioning", 1, 0),
    _f("Cross-venue taker imbalance", 1.25, 0),
    _f("TVL trend", 2, 0),
    _f("Revenue linkage", 1, 0),
    _f("Developer velocity", 1.5, 0),
    _f("Supply-overhang penalty", 1, 0),
]


def _crypto_bundle(factors, opp_id="dossier-test-idsynth-2026-10-15",
                   decision_at="2026-10-15T01:00:00.000+00:00",
                   issuance_key="x|crypto-dossier-factor-agreement|2.0.0-measurement-contract",
                   snapshot=None):
    # decision_at defaults post-cutoff (2026-10-14T18:35:00Z) so the
    # auto-classified evidence_class is FRESH (capture correction 2026-10-15).
    # issuance_key defaults to the frozen crypto intended model; snapshot
    # defaults to None (unlinked) unless the caller passes one.
    return {
        "opportunity_id": opp_id,
        "terminal": "crypto",
        "model": {"strategy_id": "crypto-dossier-factor-agreement",
                  "strategy_version": "2.0.0-measurement-contract",
                  "parameter_hash": "sha256:test"},
        "decision_at": decision_at,
        "issuance_key": issuance_key,
        "snapshot": snapshot,
        "factors": factors,
        "entry_context": {
            "entry_price": 100.0, "atr14": 2.0, "risk_multiplier": 1.25,
            "levels_recorded": {"entry": 100.0, "invalidation": 97.5,
                                "target1": 103.75, "target2": 106.25},
        },
    }


def _linked_snapshot(snap_id=3775786275845128):
    return {"snapshot_id": snap_id,
            "snapshot_version": "crypto-input-snapshot-v3-canonical-atr-window"}


class TestSingleWritePath(unittest.TestCase):
    def test_capture_writes_inputs_and_both_arms_in_one_call(self):
        with tempfile.TemporaryDirectory() as tmp:
            rec = dmc.capture_dossier_evaluation(
                _crypto_bundle(HYPE_ID40_FACTORS),
                recorded={"confidence": 56, "direction": "short"},
                input_dir=os.path.join(tmp, "in"),
                evidence_dir=os.path.join(tmp, "ev"),
            )
            self.assertFalse(rec["skipped"])
            self.assertTrue(os.path.isfile(rec["input_path"]))
            self.assertTrue(os.path.isfile(rec["evidence_path"]))
            bundle = json.load(open(rec["input_path"]))
            self.assertIn("factors", bundle)
            self.assertEqual(len(bundle["factors"]), 11)
            ev = json.load(open(rec["evidence_path"]))
            self.assertEqual(ev["prod"]["score"], 44)
            self.assertEqual(ev["prod"]["direction"], "short")
            self.assertEqual(ev["c2"]["score"], 48)
            self.assertEqual(ev["c2"]["direction"], "short")
            self.assertEqual(ev["evidence_class"], "FRESH")

    def test_no_vessel_written(self):
        with tempfile.TemporaryDirectory() as tmp:
            dmc.capture_dossier_evaluation(
                _crypto_bundle(HYPE_ID40_FACTORS),
                recorded={"confidence": 56, "direction": "short"},
                input_dir=os.path.join(tmp, "in"),
                evidence_dir=os.path.join(tmp, "ev"),
            )
            leftovers = []
            for root, _, files in os.walk(tmp):
                leftovers += [f for f in files if f.endswith(".csv")]
            self.assertEqual(leftovers, [])


class TestNeverBackfill(unittest.TestCase):
    def test_missing_input_persisted_unknown_never_reconstructed(self):
        factors = [_f("Trend cluster", 2.5, 1), _f("Momentum", 1.5, 0)]
        factors[0]["asOf"] = "2026-10-14T12:00:00.000Z"
        factors[0]["quality"] = "live"
        factors[1]["asOf"] = None
        factors[1]["quality"] = "no_data"
        # pad to a complete ledger so arms score
        rest = [l for l in
                ("MACD", "Perp funding crowding", "Open interest",
                 "Binance futures positioning", "Cross-venue taker imbalance",
                 "TVL trend", "Revenue linkage", "Developer velocity",
                 "Supply-overhang penalty")]
        for l in rest:
            f = _f(l, 1.0, 0)
            f["asOf"] = "2026-10-14T12:00:00.000Z"
            f["quality"] = "live"
            factors.append(f)
        with tempfile.TemporaryDirectory() as tmp:
            rec = dmc.capture_dossier_evaluation(
                _crypto_bundle(factors, "dossier-test-unknown-2026-10-14"),
                recorded={"confidence": 60, "direction": "long"},
                input_dir=os.path.join(tmp, "in"),
                evidence_dir=os.path.join(tmp, "ev"),
            )
            bundle = json.load(open(rec["input_path"]))
            unknowns = [m["label"] for m in bundle["missing_inputs"]]
            self.assertEqual(unknowns, ["Momentum"])
            mom = [f for f in bundle["factors"] if f["label"] == "Momentum"][0]
            self.assertEqual(mom["status"], "UNKNOWN")
            self.assertIsNone(mom["asOf"])
            # the arm still scored from the consumed contribution (0)
            ev = json.load(open(rec["evidence_path"]))
            self.assertEqual(ev["prod"]["arm_disposition"]["disposition"], "scored")


class TestIdempotency(unittest.TestCase):
    def test_second_capture_skipped_never_overwrites(self):
        with tempfile.TemporaryDirectory() as tmp:
            kw = dict(recorded={"confidence": 56, "direction": "short"},
                      input_dir=os.path.join(tmp, "in"),
                      evidence_dir=os.path.join(tmp, "ev"))
            first = dmc.capture_dossier_evaluation(_crypto_bundle(HYPE_ID40_FACTORS), **kw)
            self.assertFalse(first["skipped"])
            with open(first["input_path"], "a") as h:
                h.write("# sentinel")
            second = dmc.capture_dossier_evaluation(_crypto_bundle(HYPE_ID40_FACTORS), **kw)
            self.assertTrue(second["skipped"])
            with open(first["input_path"]) as h:
                self.assertTrue(h.read().endswith("# sentinel"))


class TestReplayLabeling(unittest.TestCase):
    def test_replay_label_in_bundle_and_evidence(self):
        with tempfile.TemporaryDirectory() as tmp:
            rec = dmc.capture_dossier_evaluation(
                _crypto_bundle(HYPE_ID40_FACTORS, "dossier-btc-id43-2026-10-14"),
                recorded={"confidence": 56, "direction": "short"},
                evidence_class=dmc.EVIDENCE_CLASS_REPLAY,
                input_dir=os.path.join(tmp, "in"),
                evidence_dir=os.path.join(tmp, "ev"),
            )
            self.assertEqual(rec["evidence_class"], "REPLAY/REPRODUCTION")
            bundle = json.load(open(rec["input_path"]))
            ev = json.load(open(rec["evidence_path"]))
            self.assertEqual(bundle["evidence_class"], "REPLAY/REPRODUCTION")
            self.assertEqual(ev["evidence_class"], "REPLAY/REPRODUCTION")
            self.assertIn("replay_note", bundle)
            self.assertIn("replay_note", ev)


class TestEquityArm(unittest.TestCase):
    def test_equity_prod_scores_c2_not_applicable(self):
        names = ["Price vs SMA 20", "Price vs SMA 50", "Price vs SMA 200",
                 "MACD 12–26", "ATR-adjusted 30-session trend",
                 "rsi14", "volume_direction_z"]
        weights = [6, 8, 8, 20, 20, 8, 20]
        factors = [{"name": n, "weight": w, "score": 1,
                    "label": n, "contribution": w}
                   for n, w in zip(names, weights)]
        bundle = {
            "opportunity_id": "dossier-test-equity-2026-10-14",
            "terminal": "equity",
            "model": {"strategy_id": "equity-factor-agreement",
                      "strategy_version": "3.1.0-measurement-closure"},
            "decision_at": "2026-10-14T12:00:00.000+00:00",
            "factors": factors,
            "entry_context": {"entry_price": 100.0, "atr14": 2.0,
                              "risk_multiplier": 2.0, "levels_recorded": {}},
        }
        with tempfile.TemporaryDirectory() as tmp:
            rec = dmc.capture_dossier_evaluation(
                bundle, recorded={},
                input_dir=os.path.join(tmp, "in"),
                evidence_dir=os.path.join(tmp, "ev"),
            )
            ev = json.load(open(rec["evidence_path"]))
            self.assertEqual(ev["prod"]["direction"], "long")
            self.assertEqual(ev["c2"]["disposition"], "not-applicable")
            self.assertFalse(ev["c2"]["applicable"])


class TestCutoffClassification(unittest.TestCase):
    """Capture correction 2026-10-15: the frozen cutoff is applied to
    decision_at; capture time never qualifies a row as FRESH."""

    def test_pre_cutoff_auto_classifies_replay(self):
        cls, note = dmc.classify_evidence_class("2026-10-14T13:00:21.555+00:00")
        self.assertEqual(cls, dmc.EVIDENCE_CLASS_REPLAY)
        self.assertIn("2026-10-14T18:35:00", note)

    def test_post_cutoff_auto_classifies_fresh(self):
        cls, _ = dmc.classify_evidence_class("2026-10-15T01:00:00.000+00:00")
        self.assertEqual(cls, dmc.EVIDENCE_CLASS_FRESH)

    def test_boundary_instant_is_fresh(self):
        cls, _ = dmc.classify_evidence_class("2026-10-14T18:35:00+00:00")
        self.assertEqual(cls, dmc.EVIDENCE_CLASS_FRESH)

    def test_unparseable_decision_is_not_fresh(self):
        for bad in (None, "", "not-a-time"):
            cls, _ = dmc.classify_evidence_class(bad)
            self.assertEqual(cls, dmc.EVIDENCE_CLASS_REPLAY)

    def test_capture_defaults_to_cutoff_classification(self):
        with tempfile.TemporaryDirectory() as tmp:
            rec = dmc.capture_dossier_evaluation(
                _crypto_bundle(HYPE_ID40_FACTORS, "dossier-test-precut-2026-10-10",
                               decision_at="2026-10-10T01:51:23.436+00:00"),
                recorded={"confidence": 56, "direction": "short"},
                input_dir=os.path.join(tmp, "in"),
                evidence_dir=os.path.join(tmp, "ev"),
            )
            self.assertEqual(rec["evidence_class"], dmc.EVIDENCE_CLASS_REPLAY)
            ev = json.load(open(rec["evidence_path"]))
            self.assertEqual(ev["evidence_class"], dmc.EVIDENCE_CLASS_REPLAY)
            self.assertIn("replay_note", ev)

    def test_explicit_class_still_honored(self):
        with tempfile.TemporaryDirectory() as tmp:
            rec = dmc.capture_dossier_evaluation(
                _crypto_bundle(HYPE_ID40_FACTORS, "dossier-test-explicit-2026-10-15"),
                recorded={"confidence": 56, "direction": "short"},
                evidence_class=dmc.EVIDENCE_CLASS_FRESH,
                input_dir=os.path.join(tmp, "in"),
                evidence_dir=os.path.join(tmp, "ev"),
            )
            self.assertEqual(rec["evidence_class"], dmc.EVIDENCE_CLASS_FRESH)


class TestCaptureDecisionSeparation(unittest.TestCase):
    def test_captured_at_stamped_distinct_from_decision_at(self):
        with tempfile.TemporaryDirectory() as tmp:
            rec = dmc.capture_dossier_evaluation(
                _crypto_bundle(HYPE_ID40_FACTORS),
                recorded={"confidence": 56, "direction": "short"},
                input_dir=os.path.join(tmp, "in"),
                evidence_dir=os.path.join(tmp, "ev"),
            )
            bundle = json.load(open(rec["input_path"]))
            ev = json.load(open(rec["evidence_path"]))
            self.assertIn("captured_at", bundle)
            self.assertIn("captured_at", ev)
            self.assertNotEqual(bundle["captured_at"], bundle["decision_at"])
            self.assertEqual(ev["captured_at"], bundle["captured_at"])
            # captured_at is the collector run instant: not before decision_at
            self.assertGreaterEqual(bundle["captured_at"], bundle["decision_at"])


class TestFrozenEligibility(unittest.TestCase):
    KEY = "x|crypto-dossier-factor-agreement|2.0.0-measurement-contract"

    def test_post_cutoff_complete_snapshot_is_eligible(self):
        e = dmc.check_frozen_eligibility(
            decision_at_iso="2026-10-15T01:00:00+00:00", issuance_key=self.KEY,
            snapshot_linked=True, prod_complete=True, prod_missing=[])
        self.assertTrue(e["eligible_for_fresh"])
        self.assertEqual(e["cohort"], "fresh-eligible")

    def test_pre_cutoff_is_historical_reproduction(self):
        e = dmc.check_frozen_eligibility(
            decision_at_iso="2026-10-14T13:00:21.555+00:00", issuance_key=self.KEY,
            snapshot_linked=True, prod_complete=True, prod_missing=[])
        self.assertFalse(e["eligible_for_fresh"])
        self.assertEqual(e["cohort"], "historical-reproduction")

    def test_missing_snapshot_is_incompatible_cohort(self):
        e = dmc.check_frozen_eligibility(
            decision_at_iso="2026-10-15T01:00:00+00:00", issuance_key=self.KEY,
            snapshot_linked=False, prod_complete=False, prod_missing=["x"])
        self.assertFalse(e["eligible_for_fresh"])
        self.assertTrue(e["cohort"].startswith("incompatible:"))

    def test_incomplete_ledger_is_incompatible_cohort(self):
        e = dmc.check_frozen_eligibility(
            decision_at_iso="2026-10-15T01:00:00+00:00", issuance_key=self.KEY,
            snapshot_linked=True, prod_complete=False, prod_missing=["MACD"])
        self.assertFalse(e["eligible_for_fresh"])
        self.assertIn("incomplete-factor-ledger", e["cohort"])

    def test_unbound_issuance_key_is_incompatible_cohort(self):
        e = dmc.check_frozen_eligibility(
            decision_at_iso="2026-10-15T01:00:00+00:00", issuance_key="other-model|1.0",
            snapshot_linked=True, prod_complete=True, prod_missing=[])
        self.assertFalse(e["eligible_for_fresh"])
        self.assertIn("unbound-issuance-key", e["cohort"])


class TestDeployedSevenFactorField(unittest.TestCase):
    """The deployed 7-factor result travels ONLY in a separately labeled
    field -- it is never substituted into the frozen production/C-2 arms.
    All fixtures below are synthetic and labeled as such."""

    def _synthetic_status_export(self, tmp, candidates):
        path = os.path.join(tmp, "live-paper-status-SYNTHETIC.json")
        with open(path, "w") as h:
            json.dump({"ok": True, "data": {"candidates": candidates}}, h)
        return path

    def _synthetic_candidate(self, coin_id="bitcoin", direction="long",
                             decision_at="2026-10-15T01:05:00.000Z"):
        return {
            "candidateKey": "SYNTHETIC-VALIDATION:candidate:1",
            "coinId": coin_id, "direction": direction, "decisionAt": decision_at,
            "productionScore": 99, "challengerScore": 98,
            "discoveryRunId": -1, "note": "SYNTHETIC-VALIDATION fixture",
        }

    def test_match_found_carried_separately_arms_untouched(self):
        with tempfile.TemporaryDirectory() as tmp:
            export = self._synthetic_status_export(
                tmp, [self._synthetic_candidate()])
            seven = dmc.find_deployed_seven_factor_match(
                "bitcoin", "long", "2026-10-15T01:00:00.000+00:00", [export])
            self.assertTrue(seven["present"])
            self.assertIn("NOT the frozen trial", seven["model"])
            rec = dmc.capture_dossier_evaluation(
                _crypto_bundle(HYPE_ID40_FACTORS, "dossier-test-7f-2026-10-15"),
                recorded={"confidence": 56, "direction": "short"},
                input_dir=os.path.join(tmp, "in"),
                evidence_dir=os.path.join(tmp, "ev"),
                seven_factor=seven,
            )
            ev = json.load(open(rec["evidence_path"]))
            self.assertTrue(ev["deployed_seven_factor"]["present"])
            self.assertEqual(ev["deployed_seven_factor"]["production_score"], 99)
            # the frozen arms still carry the INTENDED-model scores, not 99/98
            self.assertEqual(ev["prod"]["score"], 44)
            self.assertEqual(ev["c2"]["score"], 48)
            self.assertNotIn("production_score", ev["prod"])
            self.assertNotIn("production_score", ev["c2"])

    def test_no_match_recorded_honestly(self):
        with tempfile.TemporaryDirectory() as tmp:
            export = self._synthetic_status_export(
                tmp, [self._synthetic_candidate(direction="short")])
            seven = dmc.find_deployed_seven_factor_match(
                "bitcoin", "long", "2026-10-15T01:00:00.000+00:00", [export])
            self.assertFalse(seven["present"])
            self.assertIn("reason", seven)

    def test_outside_match_window_is_no_match(self):
        with tempfile.TemporaryDirectory() as tmp:
            export = self._synthetic_status_export(
                tmp, [self._synthetic_candidate(
                    decision_at="2026-10-15T05:00:00.000Z")])
            seven = dmc.find_deployed_seven_factor_match(
                "bitcoin", "long", "2026-10-15T01:00:00.000+00:00", [export])
            self.assertFalse(seven["present"])

    def test_default_field_when_no_surface_consulted(self):
        with tempfile.TemporaryDirectory() as tmp:
            rec = dmc.capture_dossier_evaluation(
                _crypto_bundle(HYPE_ID40_FACTORS, "dossier-test-7fdef-2026-10-15"),
                recorded={"confidence": 56, "direction": "short"},
                input_dir=os.path.join(tmp, "in"),
                evidence_dir=os.path.join(tmp, "ev"),
            )
            ev = json.load(open(rec["evidence_path"]))
            self.assertFalse(ev["deployed_seven_factor"]["present"])
            self.assertIn("reason", ev["deployed_seven_factor"])


class TestWriteBoundaryEnforcement(unittest.TestCase):
    """Collector bypass findings 3a/3b (2026-10-15): the single write path
    is unbypassable. The evidence class is ALWAYS computed from the bundle's
    own decision_at (explicit may only downgrade, never upgrade); the FULL
    frozen eligibility gate ALWAYS runs from the bundle's own fields; a
    caller-supplied eligibility is recorded but never authoritative."""

    def _capture(self, tmp, bundle, **kw):
        kw.setdefault("recorded", {"confidence": 56, "direction": "short"})
        kw.setdefault("input_dir", os.path.join(tmp, "in"))
        kw.setdefault("evidence_dir", os.path.join(tmp, "ev"))
        return dmc.capture_dossier_evaluation(bundle, **kw)

    def test_explicit_fresh_on_pre_cutoff_cannot_upgrade(self):
        # (i) explicit evidence_class="FRESH" + pre-cutoff decision_at ->
        # REPLAY/REPRODUCTION, never FRESH; the upward disagreement is
        # recorded in the bundle note.
        with tempfile.TemporaryDirectory() as tmp:
            rec = self._capture(
                tmp, _crypto_bundle(HYPE_ID40_FACTORS, "dossier-test-bypass3a-1",
                                    decision_at="2026-10-10T01:51:23.436+00:00",
                                    snapshot=_linked_snapshot()),
                evidence_class=dmc.EVIDENCE_CLASS_FRESH)
            self.assertEqual(rec["evidence_class"], dmc.EVIDENCE_CLASS_REPLAY)
            bundle = json.load(open(rec["input_path"]))
            ev = json.load(open(rec["evidence_path"]))
            self.assertEqual(bundle["evidence_class"], dmc.EVIDENCE_CLASS_REPLAY)
            self.assertEqual(ev["evidence_class"], dmc.EVIDENCE_CLASS_REPLAY)
            self.assertIn("UPWARD", bundle["freshness_classification"]["note"])
            self.assertEqual(ev["eligibility"]["cohort"], "historical-reproduction")
            self.assertFalse(ev["eligibility"]["eligible_for_fresh"])

    def test_omitted_eligibility_still_runs_full_gate(self):
        # (ii) omitted eligibility + post-cutoff decision_at but no linked
        # snapshot -> cohort "incompatible:no-input-snapshot", NOT
        # fresh-eligible (never the old cutoff-only fallback).
        with tempfile.TemporaryDirectory() as tmp:
            rec = self._capture(
                tmp, _crypto_bundle(HYPE_ID40_FACTORS, "dossier-test-bypass3b-1"))
            ev = json.load(open(rec["evidence_path"]))
            self.assertEqual(ev["eligibility"]["cohort"],
                             "incompatible:no-input-snapshot")
            self.assertFalse(ev["eligibility"]["eligible_for_fresh"])
            self.assertIsNone(ev["eligibility_claimed_by_caller"])
            self.assertEqual(rec["eligibility"]["cohort"],
                             "incompatible:no-input-snapshot")

    def test_explicit_replay_downgrade_permitted(self):
        # (iii) explicit evidence_class="REPLAY/REPRODUCTION" + post-cutoff
        # decision_at stays REPLAY (downgrade toward less-fresh is allowed).
        with tempfile.TemporaryDirectory() as tmp:
            rec = self._capture(
                tmp, _crypto_bundle(HYPE_ID40_FACTORS, "dossier-test-bypass3a-2",
                                    snapshot=_linked_snapshot()),
                evidence_class=dmc.EVIDENCE_CLASS_REPLAY)
            self.assertEqual(rec["evidence_class"], dmc.EVIDENCE_CLASS_REPLAY)
            bundle = json.load(open(rec["input_path"]))
            self.assertIn("DOWNGRADED", bundle["freshness_classification"]["note"])

    def test_complete_valid_bundle_is_fresh_eligible(self):
        # (iv) bound issuance key + linked snapshot + complete factors +
        # post-cutoff decision_at -> fresh-eligible.
        with tempfile.TemporaryDirectory() as tmp:
            rec = self._capture(
                tmp, _crypto_bundle(HYPE_ID40_FACTORS, "dossier-test-bypass3-3",
                                    snapshot=_linked_snapshot()))
            ev = json.load(open(rec["evidence_path"]))
            self.assertEqual(rec["evidence_class"], dmc.EVIDENCE_CLASS_FRESH)
            self.assertTrue(ev["eligibility"]["eligible_for_fresh"])
            self.assertEqual(ev["eligibility"]["cohort"], "fresh-eligible")

    def test_explicit_fresh_with_incompatible_key_not_fresh_eligible(self):
        # (v) explicit evidence_class="FRESH" + incompatible issuance key ->
        # NOT fresh-eligible (the full gate still runs; the caller label
        # cannot force the cohort).
        with tempfile.TemporaryDirectory() as tmp:
            rec = self._capture(
                tmp, _crypto_bundle(HYPE_ID40_FACTORS, "dossier-test-bypass3b-2",
                                    issuance_key="other-model|1.0",
                                    snapshot=_linked_snapshot()),
                evidence_class=dmc.EVIDENCE_CLASS_FRESH)
            ev = json.load(open(rec["evidence_path"]))
            self.assertFalse(ev["eligibility"]["eligible_for_fresh"])
            self.assertIn("unbound-issuance-key", ev["eligibility"]["cohort"])

    def test_caller_eligibility_claim_recorded_but_not_authoritative(self):
        # The old 3b bypass let a caller pass eligibility=None (cutoff-only
        # fallback) or a fabricated eligibility; now the computed result
        # always decides the cohort while the claim is preserved for audit.
        with tempfile.TemporaryDirectory() as tmp:
            rec = self._capture(
                tmp, _crypto_bundle(HYPE_ID40_FACTORS, "dossier-test-bypass3b-3",
                                    decision_at="2026-10-10T01:51:23.436+00:00",
                                    snapshot=_linked_snapshot()),
                eligibility={"eligible_for_fresh": True,
                             "cohort": "fresh-eligible",
                             "reasons": [], "note": "caller claim"})
            ev = json.load(open(rec["evidence_path"]))
            self.assertEqual(ev["eligibility"]["cohort"], "historical-reproduction")
            self.assertFalse(ev["eligibility"]["eligible_for_fresh"])
            self.assertEqual(ev["eligibility_claimed_by_caller"]["cohort"],
                             "fresh-eligible")
            self.assertEqual(rec["eligibility"]["cohort"], "historical-reproduction")


if __name__ == "__main__":
    unittest.main()
