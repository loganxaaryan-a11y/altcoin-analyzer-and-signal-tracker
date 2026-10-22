#!/usr/bin/env python3
"""Tests for the workstream-C comparison harness (freeze manifest v1.0.0).

All expectations are hand-computed from the frozen formulas; no live data,
no production access. Run: python3 run_tests.py (or pytest).
"""

import hashlib
import json
import os
import re
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import harness
import metrics
from harness import (score_crypto_production, score_crypto_challenger,
                     score_equity_production, mirror_levels,
                     operational_issuance_eval,
                     short_regime_gate, score_pair, score_batch, write_rows_csv,
                     read_rows_csv, load_manifest, load_active_manifest,
                     resolve_active_manifest_path,
                     ACTIVE_MANIFEST, ACTIVE_FREEZE_VERSION,
                     EXPECTED_ACTIVE_VERSION,
                     c2_may_reuse_production, build_c2_reuse_evidence,
                     ROW_COLUMNS, REASON,
                     LookaheadError, _ledger_completeness)

def _comparison_dir():
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def resolve_active_manifest():
    """Resolve the ACTIVE freeze manifest from WITHIN the package tree.

    comparison/ACTIVE_MANIFEST names the single active freeze file; the
    path is resolved relative to this file's location -- no absolute
    workspace paths, no network. Active at build time: v2.1.4
    (executable-path amendment of v2.1.1; harness loads it at runtime and
    runs the repaired operational evaluator).
    """
    base = _comparison_dir()
    with open(os.path.join(base, "ACTIVE_MANIFEST")) as f:
        name = f.read().strip()
    path = os.path.join(base, name)
    if not os.path.isfile(path):
        raise AssertionError(
            f"active manifest {name!r} (from ACTIVE_MANIFEST) not found in "
            f"the package tree: {path}")
    return name, path


ACTIVE_MANIFEST_NAME, ACTIVE_MANIFEST_PATH = resolve_active_manifest()
# Pinned alongside ACTIVE_MANIFEST: a freeze mint updates this pin together
# with the marker. Deliberately NOT derived from the filename -- a version
# bump must be an explicit, reviewed edit. v2.1.3 (fix 2 of 5): the harness
# loads the active manifest at runtime, runs the repaired operational
# evaluator on the issuance path, and gates C-2 reuse on exact input+rule
# match (RULE 5/6).
ACTIVE_MANIFEST_VERSION = "2.1.5"


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


def op_evidence(direction="long", stop=90.0, bars="clear",
                decision_at="2026-10-13T12:00:00Z",
                price=100.0, decision_price=100.0,
                venue_label="binance-spot",
                observed_secs_after=60, received_secs_after=70):
    """Operational-evidence fixture for the repaired issuance evaluator.

    Returns {"entry_observation": ..., "decision_price": ...,
             "waiting_interval_bars": ...} that the evaluator grades.
    bars="clear": one post-decision 1-min bar whose adverse extreme is safe
      vs the stop -> evaluator passes (with a passing entry contract).
    bars="touch": the post-decision bar's adverse extreme touches the stop
      -> waiting-interval veto FAILS.
    bars="straddle-cross": the bar straddles decisionAt and its extreme
      crossed -> UNCERTAIN (fail-closed; the pre-decision portion is never
      a definite breach).
    bars="pre-only-cross": ONLY a pre-decision bar whose extreme crossed the
      stop -> setup-history FEATURE, never a stop-out; the evaluator is
      UNCERTAIN (no post-decision evidence), never "suppressed".
    bars=None: no bars at all -> UNCERTAIN (fail-closed).
    """
    from datetime import datetime, timezone, timedelta
    dec = datetime.fromisoformat(decision_at.replace("Z", "+00:00"))
    obs_at = dec + timedelta(seconds=observed_secs_after)
    rec_at = dec + timedelta(seconds=received_secs_after)
    iso = lambda d: d.astimezone(timezone.utc).isoformat()

    def bar(start, end, o, h, l, c):
        return {"start_at": iso(start), "end_at": iso(end),
                "open": o, "high": h, "low": l, "close": c,
                "granularity": "intraday", "source": "test",
                "label": "test-bar", "is_closed": True}

    adverse_safe = 95.0 if direction == "long" else 105.0
    adverse_cross = 89.0 if direction == "long" else 111.0
    if direction == "long":
        safe_ohlc = (100.0, 101.0, adverse_safe, 100.5)
        cross_ohlc = (100.0, 101.0, adverse_cross, 100.5)
    else:
        safe_ohlc = (100.0, adverse_safe, 99.0, 99.5)
        cross_ohlc = (100.0, adverse_cross, 99.0, 99.5)

    if bars == "clear":
        wb = [bar(dec, obs_at, *safe_ohlc)]
    elif bars == "touch":
        wb = [bar(dec, obs_at, *cross_ohlc)]
    elif bars == "straddle-cross":
        wb = [bar(dec - timedelta(minutes=1), obs_at, *cross_ohlc)]
    elif bars == "pre-only-cross":
        wb = [bar(dec - timedelta(minutes=2), dec - timedelta(minutes=1),
                  *cross_ohlc)]
    elif bars is None:
        wb = []
    else:
        raise ValueError(f"unknown bars fixture: {bars!r}")

    return {
        "decision_price": decision_price,
        "entry_observation": {
            "price": price,
            "observed_at": iso(obs_at),
            "received_at": iso(rec_at),
            "venue_label": venue_label,
            "evidence": "venue-trade",
        },
        "waiting_interval_bars": wb,
    }


class TestManifest(unittest.TestCase):
    def test_active_manifest_resolves_in_package(self):
        name, path = resolve_active_manifest()
        self.assertEqual(name, "freeze-manifest-v2.1.5.json")
        with open(path) as f:
            m = json.load(f)
        self.assertEqual(m["manifest_version"], ACTIVE_MANIFEST_VERSION)
        self.assertIn("executable", m["amendment_kind"])

    def test_harness_loads_active_manifest_at_runtime(self):
        # (fix 1, assertion a): the harness loads THE active manifest
        # explicitly at runtime -- resolved by path via the ACTIVE_MANIFEST
        # marker, not a hardcoded version string. The loaded version must
        # match the expected active version, and the collector's stamp must
        # be the loaded version.
        self.assertEqual(harness.ACTIVE_MANIFEST["manifest_version"],
                         EXPECTED_ACTIVE_VERSION)
        self.assertEqual(harness.ACTIVE_FREEZE_VERSION, EXPECTED_ACTIVE_VERSION)
        self.assertEqual(harness.ACTIVE_FREEZE_VERSION, ACTIVE_MANIFEST_VERSION)
        # the marker resolves to the same file the harness loaded
        self.assertEqual(
            os.path.abspath(harness.resolve_active_manifest_path()),
            os.path.abspath(ACTIVE_MANIFEST_PATH))

    def test_load_active_manifest_fails_loudly_on_version_mismatch(self):
        # A manifest whose version != the expected active version is
        # refused loudly -- the harness never runs against the wrong freeze.
        import tempfile
        with tempfile.NamedTemporaryFile("w", suffix=".json",
                                         delete=False) as tf:
            json.dump({"manifest_version": "9.9.9"}, tf)
            tmp = tf.name
        try:
            with self.assertRaises(harness.SchemaError):
                harness.load_active_manifest(tmp)
        finally:
            os.unlink(tmp)
        # and the plain loader enforces an expected version when given one
        with self.assertRaises(harness.SchemaError):
            harness.load_manifest(ACTIVE_MANIFEST_PATH,
                                  expected_version="9.9.9")
        m = harness.load_manifest(ACTIVE_MANIFEST_PATH,
                                  expected_version=ACTIVE_MANIFEST_VERSION)
        self.assertEqual(m["manifest_version"], ACTIVE_MANIFEST_VERSION)

    def test_active_manifest_executable_core_matches_harness(self):
        # v2.1.5 is an operational-verification amendment: its scope keeps v2.1.0 as
        # the freeze of record for the executable core (model factor
        # weights, scoring formulas, asserted rules) and carries v2.1.1's
        # date fields, v2.1.2's executable-path alignment, v2.1.3's
        # RULE 5/6, and v2.1.4's collector wiring forward unchanged. So the executable core (model factor
        # weights) is read from the v2.1.0 file -- verified byte-identical
        # to the sha256 v2.1.5 restates -- and must match what the harness
        # executes: no prediction-weight drift.
        with open(ACTIVE_MANIFEST_PATH) as f:
            m = json.load(f)
        self.assertEqual(m["supersedes"]["manifest"],
                         "freeze-manifest-v2.1.4.json")
        for label, recorded_key in (("v2.1.4", "v214_sha256"),
                                    ("v2.1.3", "v213_sha256"),
                                    ("v2.1.2", "v212_sha256"),
                                    ("v2.1.1", "v211_sha256"),
                                    ("v2.1.0", "v210_executable_core_sha256")):
            recorded = m.get(recorded_key)
            self.assertIsNotNone(recorded, f"v2.1.5 must record {recorded_key}")
            self.assertRegex(recorded, r"^[0-9a-f]{64}$")
            core_path = os.path.join(
                _comparison_dir(),
                f"freeze-manifest-{label}.json")
            with open(core_path, "rb") as f:
                disk_hash = hashlib.sha256(f.read()).hexdigest()
            self.assertEqual(disk_hash, recorded,
                             f"{label} bytes must be untouched in the package")
        with open(os.path.join(_comparison_dir(),
                               "freeze-manifest-v2.1.0.json")) as f:
            core = json.load(f)
        by_name = {x["model_name"]: x for x in core["models"]}
        prod = by_name["crypto-dossier-factor-agreement"]
        c2 = by_name["crypto-dossier-minus-momentum"]
        eq = by_name["equity-factor-agreement"]
        self.assertAlmostEqual(sum(x["weight"] for x in prod["factors"]), 17.0)
        self.assertAlmostEqual(sum(x["weight"] for x in c2["factors"]), 15.5)
        self.assertEqual(sum(x["weight"] for x in eq["factors"]), 90)  # 6+8+8+20+8+20+20
        # Factor-set shape is part of the frozen executable core: unchanged.
        self.assertEqual(len(prod["factors"]), 11)
        self.assertEqual(len(c2["factors"]), 10)
        self.assertEqual(len(eq["factors"]), 7)
        labels = [x["label"] for x in prod["factors"]]
        self.assertNotIn("Momentum", [x["label"] for x in c2["factors"]])
        self.assertIn("Momentum", labels)
        # The harness's frozen scoring constants match the manifest core.
        self.assertAlmostEqual(harness.CRYPTO_PRODUCTION_TOTAL_WEIGHT, 17.0)
        self.assertAlmostEqual(harness.CRYPTO_C2_TOTAL_WEIGHT, 15.5)
        self.assertEqual(
            sorted(harness.CRYPTO_PRODUCTION_LABELS), sorted(labels))


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

    def test_born_dead_gate_unreachable_static(self):
        # (fix 1, assertion b -- static): the superseded historical
        # born-dead gate is unreachable from the harness path. The function
        # is deleted, and no call site references it.
        self.assertFalse(hasattr(harness, "born_dead_check"),
                         "born_dead_check must not exist on the harness")
        src = open(os.path.join(_comparison_dir(), "harness.py")).read()
        calls = re.findall(r"(?<!def )(?<!_)born_dead_check\s*\(", src)
        self.assertEqual(calls, [],
                         f"no call site may reference born_dead_check: {calls}")

    def test_operational_evaluator_pass(self):
        v, reason, note = operational_issuance_eval(
            "long", 90.0, cand(FIX_A, **op_evidence("long", 90.0, "clear")))
        self.assertEqual(v, "pass")
        self.assertEqual(reason, REASON["ok"])
        self.assertIn("waiting interval clear", note)

    def test_operational_evaluator_waiting_interval_fail(self):
        v, reason, note = operational_issuance_eval(
            "long", 90.0, cand(FIX_A, **op_evidence("long", 90.0, "touch")))
        self.assertEqual(v, "fail")
        self.assertEqual(reason, REASON["waiting-interval-invalidation"])
        self.assertIn("post-decision extreme crossed", note)

    def test_operational_evaluator_no_bars_uncertain_fail_closed(self):
        v, reason, _ = operational_issuance_eval(
            "long", 90.0, cand(FIX_A, **op_evidence("long", 90.0, None)))
        self.assertEqual(v, "uncertain")
        self.assertEqual(reason, REASON["issuance-unavailable"])

    def test_operational_evaluator_pre_decision_extreme_never_vetoes(self):
        # (fix 1, assertion b -- behavioral): a pre-decision extreme that
        # crossed the stop is a setup-history FEATURE, never a stop-out.
        # The historical gate would have suppressed here; the repaired
        # evaluator is UNCERTAIN (no post-decision evidence) -- never "fail".
        v, reason, note = operational_issuance_eval(
            "long", 90.0,
            cand(FIX_A, **op_evidence("long", 90.0, "pre-only-cross")))
        self.assertEqual(v, "uncertain")
        self.assertNotEqual(reason, REASON["waiting-interval-invalidation"])
        self.assertNotIn("born-dead", (note or "").lower())

    def test_operational_evaluator_straddle_cross_uncertain(self):
        v, reason, _ = operational_issuance_eval(
            "long", 90.0,
            cand(FIX_A, **op_evidence("long", 90.0, "straddle-cross")))
        self.assertEqual(v, "uncertain")
        self.assertEqual(reason, REASON["issuance-unavailable"])

    def test_operational_evaluator_entry_drift_fails(self):
        v, reason, _ = operational_issuance_eval(
            "long", 90.0, cand(FIX_A, **op_evidence(
                "long", 90.0, "clear", price=102.0, decision_price=100.0)))
        self.assertEqual(v, "fail")
        self.assertEqual(reason, REASON["entry-drift"])

    def test_operational_evaluator_wrong_venue_fails(self):
        v, reason, _ = operational_issuance_eval(
            "long", 90.0, cand(FIX_A, **op_evidence(
                "long", 90.0, "clear", venue_label="coinbase-spot")))
        self.assertEqual(v, "fail")
        self.assertEqual(reason, REASON["entry-venue"])

    def test_operational_evaluator_expired_window_fails(self):
        v, reason, _ = operational_issuance_eval(
            "long", 90.0, cand(FIX_A, **op_evidence(
                "long", 90.0, "clear", observed_secs_after=901,
                received_secs_after=910)))
        self.assertEqual(v, "fail")
        self.assertEqual(reason, REASON["entry-expired"])

    def test_operational_evaluator_missing_observation_uncertain(self):
        v, reason, _ = operational_issuance_eval("long", 90.0, cand(FIX_A))
        self.assertEqual(v, "uncertain")
        self.assertEqual(reason, REASON["issuance-unavailable"])

    def test_operational_evaluator_anti_fabrication(self):
        ev = op_evidence("long", 90.0, "clear")
        ev["entry_observation"]["evidence"] = "unavailable"
        v, reason, _ = operational_issuance_eval("long", 90.0, cand(FIX_A, **ev))
        self.assertEqual(v, "uncertain")
        self.assertEqual(reason, REASON["issuance-unavailable"])


class TestReceiptExpiryParity(unittest.TestCase):
    """Receipt-expiry parity with the issuance handler (ITEM 2).

    The accepted issuance path (orchestrator/src/issuance/handler.ts,
    lateReceiptVoid) voids as void_expired when the RECEIPT time falls after
    the entry-window expiry -- even when the observation itself was inside
    the window. The harness's operational_issuance_eval must apply exactly
    the same rule from preserved evidence (observed_at / received_at),
    with the same verdict and the same reason code (REASON["entry-expired"],
    the harness mapping of the handler's void_expired).
    """

    def eval_fixture(self, observed_secs_after, received_secs_after):
        ev = op_evidence("long", 90.0, "clear",
                         observed_secs_after=observed_secs_after,
                         received_secs_after=received_secs_after)
        return operational_issuance_eval("long", 90.0, cand(FIX_A, **ev))

    def test_late_receipt_after_window_fails_with_entry_expired(self):
        # The expert's canonical counterexample: observation at minute 14
        # (inside the 15-min window), receipt at minute 16 (after expiry).
        v, reason, note = self.eval_fixture(14 * 60, 16 * 60)
        self.assertEqual(v, "fail")
        self.assertEqual(reason, REASON["entry-expired"])
        self.assertIn("historical reconstruction", note)

    def test_in_window_receipt_passes(self):
        # Boundary: observation at 14:59, receipt at 14:59:30 -- inside the
        # window, a live entry, not a reconstruction.
        v, reason, _ = self.eval_fixture(14 * 60 + 59, 14 * 60 + 59.5)
        self.assertEqual(v, "pass")
        self.assertEqual(reason, REASON["ok"])

    def test_receipt_just_past_window_fails_with_entry_expired(self):
        # Boundary: observation at 14:00, receipt at 15:01 -- receipt past
        # the window expiry voids, exactly like the issuance handler.
        v, reason, _ = self.eval_fixture(14 * 60, 15 * 60 + 1)
        self.assertEqual(v, "fail")
        self.assertEqual(reason, REASON["entry-expired"])

    def test_receipt_expiry_check_is_distinct_from_observation_check(self):
        # Observation at minute 14 is inside the window, so the old
        # observed_at-only check would pass this; only the receipt check
        # rejects it. If this fixture ever passes again, the parity fix has
        # regressed.
        v, reason, _ = self.eval_fixture(14 * 60, 16 * 60)
        self.assertNotEqual(v, "pass")
        self.assertEqual(reason, REASON["entry-expired"])


class TestRepairedSuppressionTaxonomy(unittest.TestCase):
    """v2.1.2: recorded suppressions classify under the repaired evaluator's
    taxonomy. Historical pre-decision-extreme reasons keep their recorded
    code (RULE 1: the recorded suppression stands)."""

    def test_historical_born_dead_reason_keeps_code(self):
        self.assertEqual(
            harness._classify_suppression(
                "born-dead LONG: signal-day low 0.03 <= invalidation 0.032"),
            REASON["born-dead"])

    def test_repaired_waiting_interval_reasons(self):
        self.assertEqual(
            harness._classify_suppression(
                "waiting-interval veto fail: setup invalidated in the waiting interval"),
            REASON["waiting-interval-invalidation"])
        # the repaired checkSetupInvalidation fail reason carries the
        # "born-dead" label but grades POST-decision evidence: it is the
        # waiting-interval veto, not the historical gate
        self.assertEqual(
            harness._classify_suppression(
                "born-dead LONG: post-decision extreme crossed the final "
                "published stop 90.0 (extreme 89.0 on test-bar)"),
            REASON["waiting-interval-invalidation"])

    def test_entry_contract_reasons(self):
        self.assertEqual(harness._classify_suppression("entry-drift"),
                         REASON["entry-drift"])
        self.assertEqual(harness._classify_suppression("entry-expired"),
                         REASON["entry-expired"])
        self.assertEqual(harness._classify_suppression("entry-no-quote"),
                         REASON["entry-no-quote"])
        self.assertEqual(
            harness._classify_suppression("wrong venue print skipped"),
            REASON["entry-venue"])
        self.assertEqual(harness._classify_suppression("issuance-veto"),
                         REASON["issuance-veto"])

    def test_production_suppressed_by_repaired_veto(self):
        # End-to-end: production suppressed by the repaired waiting-interval
        # veto -> abstain with the repaired code (RULE 1: recorded decision
        # governs; the taxonomy is the repaired one).
        row = score_pair(cand(
            FIX_A,
            production_recorded=None,
            production_decision="suppressed",
            production_suppression_reason=(
                "waiting-interval-invalidation: born-dead LONG: post-decision "
                "extreme crossed the final published stop")))
        self.assertEqual(row["prod_disposition"], "abstain")
        self.assertEqual(row["prod_disposition_reason"],
                         REASON["waiting-interval-invalidation"])
        # non-flipped challenger: shared-evidence agreement, same code
        self.assertFalse(row["direction_flipped"])
        self.assertEqual(row["c2_disposition"], "abstain")
        self.assertEqual(row["c2_disposition_reason"],
                         REASON["waiting-interval-invalidation"])

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
        # fix 2 (RULE 5): the former "inherited-identical (non-flipped)"
        # shortcut is now the verified reuse gate -- reuse is recorded as
        # reused WITH the match evidence, never as direction-match
        # inheritance.
        self.assertEqual(row["levels_mode"], "reused: exact input+rule match")
        self.assertEqual(row["c2_invalidation"], 90.0)
        self.assertIn("exact input+rule match", row["notes"])
        self.assertIn("reuses production result", row["notes"])
        # v2.1.2: the historical born-dead mirror no longer runs (superseded)
        self.assertIsNone(row["born_dead_mirror"])
        self.assertIsNone(row["born_dead_mirror_reason"])

    def test_flipped_to_long_issues_with_operational_evidence(self):
        # FIX_B: prod short 49, C-2 long 53 -> flipped. The challenger runs
        # the repaired operational evaluator on its own mirrored stop
        # (invalidation 90.0); the post-decision bar is clear -> issued.
        row = score_pair(cand(
            FIX_B,
            production_recorded={"direction": "short", "score": 51},
            signal_day={"day": "2026-10-12", "high": 112.0, "low": 95.0},
            **op_evidence("long", 90.0, "clear")))
        self.assertTrue(row["direction_flipped"])
        self.assertEqual(row["c2_direction"], "long")
        self.assertEqual(row["c2_disposition"], "issued")
        self.assertEqual(row["c2_invalidation"], 90.0)
        self.assertIsNone(row["born_dead_mirror"])
        self.assertEqual(row["short_regime_gate_mirror"], "allowed")

    def test_flipped_without_operational_evidence_fails_closed(self):
        # No waiting-interval bars and no entry observation -> the repaired
        # evaluator is UNCERTAIN (fail-closed): abstain with
        # abstain:issuance-validation-unavailable. Crucially, the
        # pre-decision signal-day low (89.0 <= invalidation 90.0) -- which
        # the SUPERSEDED gate would have graded as a stop-out -- does NOT
        # suppress: it is setup history, never a veto.
        row = score_pair(cand(
            FIX_B,
            production_recorded={"direction": "short", "score": 51},
            signal_day={"day": "2026-10-12", "high": 112.0, "low": 89.0}))
        self.assertTrue(row["direction_flipped"])
        self.assertEqual(row["c2_disposition"], "abstain")
        self.assertEqual(row["c2_disposition_reason"],
                         REASON["issuance-unavailable"])
        self.assertNotEqual(row["c2_disposition_reason"],
                            REASON["born-dead-mirror"])
        self.assertIsNone(row["born_dead_mirror"])

    def test_flipped_waiting_interval_touch_abstains(self):
        # The challenger's own mirrored stop IS touched by a post-decision
        # extreme in the genuine waiting interval -> the repaired veto fails:
        # abstain:waiting-interval-invalidation (identical code for both arms).
        row = score_pair(cand(
            FIX_B,
            production_recorded={"direction": "short", "score": 51},
            **op_evidence("long", 90.0, "touch")))
        self.assertTrue(row["direction_flipped"])
        self.assertEqual(row["c2_disposition"], "abstain")
        self.assertEqual(row["c2_disposition_reason"],
                         REASON["waiting-interval-invalidation"])

    def test_flipped_short_unverifiable_regime_abstains(self):
        row = score_pair(cand(
            FIX_C,
            production_recorded={"direction": "long", "score": 51},
            signal_day={"day": "2026-10-12", "high": 105.0, "low": 95.0}))
        # challenger short: pipeline order runs the retained short-regime
        # gate first; regime inputs unusable -> abstain on regime grounds.
        self.assertTrue(row["direction_flipped"])
        self.assertEqual(row["c2_direction"], "short")
        self.assertIsNone(row["born_dead_mirror"])
        self.assertEqual(row["short_regime_gate_mirror"], "unverifiable")
        self.assertEqual(row["c2_disposition"], "abstain")
        self.assertEqual(row["c2_disposition_reason"], REASON["gate-inputs-unverifiable"])

    def test_flipped_short_issues_with_evidence_and_regime(self):
        # FIX_C: prod long 51, C-2 short 47 -> flipped to short. Regime gate
        # passes on persisted inputs; the waiting interval is clear vs the
        # mirrored stop (110.0) -> issued.
        row = score_pair(cand(
            FIX_C,
            production_recorded={"direction": "long", "score": 51},
            short_regime_inputs={"price_below_sma50": True,
                                 "lower_highs": True,
                                 "trend20_negative": False},
            **op_evidence("short", 110.0, "clear")))
        self.assertTrue(row["direction_flipped"])
        self.assertEqual(row["c2_direction"], "short")
        self.assertEqual(row["short_regime_gate_mirror"], "allowed")
        self.assertEqual(row["c2_disposition"], "issued")
        self.assertEqual(row["c2_disposition_reason"], REASON["ok"])

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
                        signal_day={"day": "2026-10-12", "high": 112.0, "low": 95.0},
                        # v2.1.2: the flipped challenger needs persisted
                        # operational evidence to clear the repaired evaluator
                        **op_evidence("long", 90.0, "clear"))
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
        # challenger flips and passes its OWN gates under the repaired
        # operational evaluator -> C-2 issued, NOT abstain. Production abstain
        # does not imply C-2 abstain. (v2.1.2: the challenger's issuance runs
        # the repaired evaluator -- regime gate + waiting-interval veto +
        # entry contract -- on persisted operational evidence; the
        # pre-decision signal-day bar is setup history, never a veto.)
        row = score_pair(cand(
            FIX_C,  # prod long 51, C-2 short 47 -> flipped
            production_recorded=None,
            production_decision="suppressed",
            production_suppression_reason=(
                "born-dead LONG: signal-day low 89.0 <= invalidation 90.0"),
            signal_day={"day": "2026-10-12", "high": 105.0, "low": 95.0},
            short_regime_inputs={"price_below_sma50": True,
                                 "lower_highs": True,
                                 "trend20_negative": False},
            **op_evidence("short", 110.0, "clear")))
        self.assertEqual(row["prod_disposition"], "abstain")
        self.assertEqual(row["prod_disposition_reason"], REASON["born-dead"])
        self.assertTrue(row["direction_flipped"])
        self.assertEqual(row["c2_direction"], "short")
        self.assertEqual(row["c2_disposition"], "issued")  # not abstain
        self.assertNotEqual(row["c2_disposition"], "abstain")
        self.assertEqual(row["c2_disposition_reason"], REASON["ok"])
        self.assertIsNone(row["born_dead_mirror"])  # gate superseded

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
        # v2.1.2: the historical born-dead mirror no longer runs; the shared
        # verdict is production's recorded verdict under the repaired taxonomy
        self.assertIsNone(row["born_dead_mirror"])
        self.assertIsNone(row["born_dead_mirror_reason"])

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


class TestC2IndependentEvaluation(unittest.TestCase):
    """Bounded fix 2 (2026-10-14): C-2 independent evaluation.

    RULE 5 (c2_may_reuse_production): a production result is reused for C-2
    ONLY on exact input+rule match (same decision-time ledger, same
    direction, same levels recomputed exactly, same entry-eligibility
    inputs, same waiting-interval evidence, same operational gates). A
    matching direction alone never suffices.
    RULE 6: missing C-2 evidence -> disposition UNKNOWN (unscored with the
    reason recorded) -- never filled from production's values, never
    inferred.
    No prediction-weight changes: Momentum removal stays C-2's only model
    difference (pinned by TestCryptoScoring).
    """

    def _ev(self, **kw):
        base = {"ledger_identity_match": True, "direction_match": True,
                "levels_match": True, "entry_eligibility_match": True,
                "waiting_interval_match": True, "gates_match": True,
                "production_result_reusable": True,
                "production_result": "issued",
                "c2_missing_evidence": [],
                "c2_direction": "long", "prod_direction": "long"}
        base.update(kw)
        return base

    def _op_evidence_c2(self, price, decision_price, low):
        # Entry-observation + one waiting-interval bar, all passing vs the
        # C-2 stop. decision_at is the cand() default 2026-10-13T12:00:00Z.
        dec = "2026-10-13T12:00:00Z"
        obs = "2026-10-13T12:01:00Z"
        rec = "2026-10-13T12:01:10Z"
        return {
            "decision_price": decision_price,
            "entry_observation": {
                "price": price, "observed_at": obs, "received_at": rec,
                "venue_label": "binance-spot", "evidence": "venue-trade"},
            "waiting_interval_bars": [{
                "start_at": dec, "end_at": obs, "open": price,
                "high": price + 0.5, "low": low, "close": price,
                "granularity": "intraday", "source": "test", "label": "m1",
                "is_closed": True}],
        }

    # ---- the four required cases ----

    def test_a_direction_match_levels_differ_independent(self):
        # (fix 2a) direction matches but C-2's levels differ (divergent C-2
        # entry observation: c2_entry=105 vs entry=100) -> the reuse gate
        # denies; C-2 is evaluated independently through the identical
        # operational rules on its own inputs. Its own outcome (issued at
        # its own stop 95.0), not inherited from production's 90.0 levels.
        row = score_pair(cand(
            FIX_A,
            production_recorded={"direction": "long", "score": 72},
            production_decision="issued",
            c2_entry=105.0, c2_atr14=8.0,
            **self._op_evidence_c2(price=105.0, decision_price=104.0,
                                   low=96.0)))
        self.assertFalse(row["direction_flipped"])
        self.assertEqual(row["c2_direction"], "long")
        self.assertEqual(row["prod_disposition"], "issued")
        # C-2's own levels, not production's
        self.assertEqual(row["c2_invalidation"], 95.0)
        self.assertEqual(row["prod_invalidation"], 90.0)
        self.assertNotEqual(row["c2_invalidation"], row["prod_invalidation"])
        self.assertEqual(row["levels_mode"], "independent (non-flipped)")
        # C-2's own operational evaluation passes -> issued on its own
        # evidence (drift 0.96% <= 1.5% cap; bar low 96.0 > stop 95.0)
        self.assertEqual(row["c2_disposition"], "issued")
        self.assertEqual(row["c2_disposition_reason"], REASON["ok"])
        self.assertIn("independently", row["notes"])
        self.assertIn("reuse denied", row["notes"])

    def test_b_direction_match_waiting_interval_missing_unknown(self):
        # (fix 2b) direction matches but C-2's waiting-interval evidence is
        # missing (entry observed, no bars) -> disposition UNKNOWN with the
        # reason recorded -- never inferred from production's recorded
        # issuance.
        row = score_pair(cand(
            FIX_A,
            production_recorded={"direction": "long", "score": 72},
            production_decision="issued",
            decision_price=100.0,
            entry_observation={
                "price": 100.0, "observed_at": "2026-10-13T12:01:00Z",
                "received_at": "2026-10-13T12:01:10Z",
                "venue_label": "binance-spot", "evidence": "venue-trade"}))
        # note: no waiting_interval_bars
        self.assertFalse(row["direction_flipped"])
        self.assertEqual(row["prod_disposition"], "issued")
        self.assertEqual(row["c2_disposition"], "unscored")
        self.assertEqual(row["c2_disposition_reason"],
                         REASON["waiting-interval-evidence-missing"])
        self.assertNotEqual(row["c2_disposition"], "issued")
        self.assertIn("RULE 6", row["notes"])
        self.assertIn("waiting-interval evidence", row["notes"])

    def test_c_exact_match_reuse_allowed_and_recorded(self):
        # (fix 2c) exact input+rule match -> reuse allowed, recorded as
        # reused WITH the match evidence.
        row = score_pair(cand(
            FIX_A,
            production_recorded={"direction": "long", "score": 72},
            production_decision="issued",
            **op_evidence("long", 90.0, "clear")))
        self.assertFalse(row["direction_flipped"])
        self.assertEqual(row["levels_mode"], "reused: exact input+rule match")
        self.assertEqual(row["c2_disposition"], "issued")
        self.assertEqual(row["c2_disposition_reason"], REASON["ok"])
        self.assertEqual(row["c2_invalidation"], row["prod_invalidation"])
        self.assertIn("reuses production result", row["notes"])
        self.assertIn("exact input+rule match", row["notes"])

    def test_d_production_suppressed_c2_scored_independently(self):
        # (fix 2d) production suppressed + C-2 complete ledger -> C-2 scored
        # independently through the identical operational rules; it never
        # inherits the suppression. FIX_C flips (prod long, C-2 short);
        # C-2's own regime gate and operational evaluator pass -> issued
        # while production abstains.
        row = score_pair(cand(
            FIX_C,  # prod long 51, C-2 short 47 -> flipped
            production_recorded=None,
            production_decision="suppressed",
            production_suppression_reason=(
                "waiting-interval-invalidation: post-decision extreme "
                "crossed the final published stop"),
            short_regime_inputs={"price_below_sma50": True,
                                 "lower_highs": True,
                                 "trend20_negative": False},
            **op_evidence("short", 110.0, "clear")))
        self.assertEqual(row["prod_disposition"], "abstain")
        self.assertEqual(row["prod_disposition_reason"],
                         REASON["waiting-interval-invalidation"])
        self.assertTrue(row["direction_flipped"])
        self.assertEqual(row["c2_direction"], "short")
        # reuse denied (direction differs) -> independent path
        self.assertEqual(row["levels_mode"], "mirrored (flipped)")
        self.assertEqual(row["short_regime_gate_mirror"], "allowed")
        self.assertEqual(row["c2_disposition"], "issued")
        self.assertEqual(row["c2_disposition_reason"], REASON["ok"])
        self.assertIn("independently", row["notes"])
        self.assertIn("reuse denied", row["notes"])

    # ---- reuse-gate unit tests ----

    def test_reuse_gate_exact_match(self):
        may, reason = c2_may_reuse_production(self._ev())
        self.assertTrue(may)
        self.assertIn("exact input+rule match", reason)

    def test_reuse_gate_direction_match_levels_differ_denied(self):
        # A matching direction alone never proves identical levels.
        may, reason = c2_may_reuse_production(self._ev(levels_match=False))
        self.assertFalse(may)
        self.assertIn("levels_match", reason)
        self.assertIn("independently", reason)

    def test_reuse_gate_direction_mismatch_denied(self):
        may, reason = c2_may_reuse_production(
            self._ev(direction_match=False, c2_direction="short"))
        self.assertFalse(may)
        self.assertIn("direction_match", reason)

    def test_reuse_gate_waiting_interval_override_denied(self):
        may, reason = c2_may_reuse_production(
            self._ev(waiting_interval_match=False))
        self.assertFalse(may)
        self.assertIn("waiting_interval_match", reason)

    def test_reuse_gate_entry_eligibility_override_denied(self):
        may, reason = c2_may_reuse_production(
            self._ev(entry_eligibility_match=False))
        self.assertFalse(may)
        self.assertIn("entry_eligibility_match", reason)

    def test_reuse_gate_missing_evidence_unknown(self):
        may, reason = c2_may_reuse_production(
            self._ev(c2_missing_evidence=["waiting-interval evidence"]))
        self.assertFalse(may)
        self.assertIn("missing C-2 evidence", reason)
        self.assertIn("RULE 6", reason)

    def test_reuse_gate_production_unscored_denied(self):
        may, reason = c2_may_reuse_production(
            self._ev(production_result_reusable=False,
                     production_result=None))
        self.assertFalse(may)
        self.assertIn("not a reusable verdict", reason)

    # ---- evidence-builder tests ----

    def test_build_evidence_detects_divergent_c2_entry(self):
        c = cand(FIX_A, production_decision="issued",
                 production_recorded={"direction": "long", "score": 72},
                 c2_entry=105.0)
        prod_levels = harness.mirror_levels(100.0, 8.0, "long", 1.25)
        c2_levels = harness.mirror_levels(105.0, 8.0, "long", 1.25)
        ev = build_c2_reuse_evidence(
            c, prod_direction="long", prod_disposition="issued",
            prod_disposition_reason="issued", prod_decision_recorded="issued",
            c2_direction="long", prod_levels=prod_levels, c2_levels=c2_levels)
        self.assertTrue(ev["direction_match"])
        self.assertFalse(ev["levels_match"])
        may, reason = c2_may_reuse_production(ev)
        self.assertFalse(may)
        self.assertIn("levels_match", reason)

    def test_build_evidence_detects_missing_waiting_interval(self):
        c = cand(FIX_A, production_decision="issued",
                 production_recorded={"direction": "long", "score": 72},
                 decision_price=100.0,
                 entry_observation={
                     "price": 100.0, "observed_at": "2026-10-13T12:01:00Z",
                     "received_at": "2026-10-13T12:01:10Z",
                     "venue_label": "binance-spot", "evidence": "venue-trade"})
        lv = harness.mirror_levels(100.0, 8.0, "long", 1.25)
        ev = build_c2_reuse_evidence(
            c, prod_direction="long", prod_disposition="issued",
            prod_disposition_reason="issued", prod_decision_recorded="issued",
            c2_direction="long", prod_levels=lv, c2_levels=lv)
        self.assertTrue(ev["levels_match"])
        self.assertEqual(ev["c2_missing_evidence"], ["waiting-interval evidence"])
        may, reason = c2_may_reuse_production(ev)
        self.assertFalse(may)
        self.assertIn("missing C-2 evidence", reason)

    def test_build_evidence_no_operational_stage_no_missing(self):
        # No entry-observation stage evidenced at all -> nothing required;
        # the recorded production verdict governs via the reuse gate.
        c = cand(FIX_A, production_decision="issued",
                 production_recorded={"direction": "long", "score": 72})
        lv = harness.mirror_levels(100.0, 8.0, "long", 1.25)
        ev = build_c2_reuse_evidence(
            c, prod_direction="long", prod_disposition="issued",
            prod_disposition_reason="issued", prod_decision_recorded="issued",
            c2_direction="long", prod_levels=lv, c2_levels=lv)
        self.assertEqual(ev["c2_missing_evidence"], [])
        may, _ = c2_may_reuse_production(ev)
        self.assertTrue(may)


if __name__ == "__main__":
    unittest.main(verbosity=2)
