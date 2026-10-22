#!/usr/bin/env python3
"""Tests for the Challenger-R1 v2 shadow scorer + shadow evaluator.

Standalone: python3 tests/test_challenger_r1_v2.py
Covers the Codex-correction surface: receipt timing + basis labels,
independent entry selection, R2 unverified-vs-malformed semantics,
corrected attainable-max arithmetic, R4 dispositions + upstream
population, per-pair versions, enrollment, evaluator semantics.
"""
import importlib.util
import json
import os
import sys
import tempfile

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE)


def load_mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


S = load_mod("challenger_r1_v2", os.path.join(BASE, "challenger_r1_v2.py"))
E = load_mod("challenger_shadow_eval", os.path.join(BASE, "challenger_shadow_eval.py"))

REG = S.load_registration()
DEC = "2026-10-21T09:00:00.000Z"
DEC_MS = S.parse_ts_ms(DEC)
PASS = 0
FAIL = 0


def check(name, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  ok  {name}")
    else:
        FAIL += 1
        print(f"FAIL  {name}  {detail}")


def factors(positioning_status):
    base = [
        {"name": "Trend", "weight": 20, "status": "pass", "contribution": 20},
        {"name": "Momentum", "weight": 15, "status": "pass", "contribution": 15},
        {"name": "Volatility", "weight": 10, "status": "pass", "contribution": 10},
        {"name": "Volume", "weight": 15, "status": "pass", "contribution": 15},
        {"name": "Network fundamentals", "weight": 15, "status": "unavailable", "contribution": 0},
        {"name": "Supply overhang", "weight": 15, "status": "pass", "contribution": 15},
    ]
    if positioning_status == "neutral":
        base.append({"name": "Positioning / funding", "weight": 10,
                     "status": "neutral", "contribution": 0})
    else:
        base.append({"name": "Positioning / funding", "weight": 10,
                     "status": "unavailable", "contribution": 0})
    return base


def cand(**kw):
    c = {
        "id": 999, "candidateKey": "test", "symbol": "TEST", "coinId": "test-coin",
        "direction": "long", "decisionAt": DEC,
        "decisionReferencePrice": 100.0, "sourceObservedAt": "2026-10-21T08:59:00.000Z",
        "venue": "Binance Spot", "instrument": "TESTUSDT",
        "freezeVersion": "paper-pilot-v2.1.4", "productionHash": "prodhash",
        "challengerHash": "chalhash", "discoveryRunId": 137,
        "factorLedgerJson": json.dumps(factors("neutral")),
        "productionScore": 68, "permittedDriftBps": 50,
        "stopPrice": 95.0, "targetPrice": 107.5,
        "state": "abstained", "reasonCode": "entry_outside_drift_zone",
        "entryPrice": None, "entryObservedAt": None,
    }
    c.update(kw)
    return c


STATUS = {"handler_version": "2.1.9", "freeze": json.dumps({"version": "paper-pilot-v2.1.4"}),
          "venueMappings": [{"coinId": "test-coin", "instrument": "TESTUSDT",
                             "venue": "Binance Spot"}]}
CKPT = {"candidateId": 999, "coverageJson": json.dumps({"venue": "Binance Spot"}),
        "firstPrintPrice": 100.9, "firstPrintObservedAt": "2026-10-21T09:00:05.000Z",
        "firstVenueTradeId": "111"}


def timed_fetcher(received_ms):
    def fetch(symbol, start_ms, end_ms):
        rows = [{"a": 1, "p": "100.0", "T": DEC_MS - 5000},
                {"a": 2, "p": "100.2", "T": DEC_MS + 4000},
                {"a": 3, "p": "100.3", "T": DEC_MS + 9000}]
        rows = [r for r in rows if start_ms <= r["T"] <= end_ms] or rows[:1]
        return rows, {"pages": 1, "returned_count": len(rows),
                      "response_sha256": "x", "truncated": False,
                      "fetch_started_at": S.iso_ms(received_ms - 100),
                      "fetch_received_at": S.iso_ms(received_ms),
                      "fetch_started_ms": received_ms - 100,
                      "fetch_received_ms": received_ms}
    return fetch


class FakeR4(S.R4Joiner):
    def __init__(self, mode):
        super().__init__(cg_fetcher=lambda path: (_ for _ in ()).throw(RuntimeError("off")))
        self.mode = mode

    def fields_for(self, coin_id, decision_ms, decision_price):
        if self.mode == "conjunction":
            return {"component": "ath", "ath_component": "evaluated",
                    "ath": 1000.0, "ath_date": "2021-01-01", "ath_basis": "coingecko_ath",
                    "ath_distance_pct": -90.0, "price_vs_sma50_pct": -5.0,
                    "price_below_sma50": True, "trend20d_pct": -3.0,
                    "trend20d_negative": True, "conjunction_hard_exclusion": True,
                    "fields_basis": "historical_series_asof_decision",
                    "fields_fetched_at": DEC, "fields_received_at": DEC}
        if self.mode == "clear":
            return {"component": "ath", "ath_component": "evaluated",
                    "ath": 120.0, "ath_date": "2021-01-01", "ath_basis": "coingecko_ath",
                    "ath_distance_pct": -20.0, "price_vs_sma50_pct": 4.0,
                    "price_below_sma50": False, "trend20d_pct": 6.0,
                    "trend20d_negative": False, "conjunction_hard_exclusion": False,
                    "fields_basis": "historical_series_asof_decision",
                    "fields_fetched_at": DEC, "fields_received_at": DEC}
        return {"component": "ath", "ath_component": "unverified",
                "reason": "coingecko_fetch_failed",
                "fields_basis": "historical_series_asof_decision"}


# 1. registration integrity
check("registration loads + hash verifies", REG["registration_id"] == "challenger-r1-v2")
check("freeze is after v1 freeze", REG["frozen_at_utc"] > "2026-10-21T06:00:00Z")

# 2. attainable arithmetic (correction 4)
t = S.score_transparency(factors("neutral"), 68)
check("measured_weight_sum 85 (neutral positioning)", t["measured_weight_sum"] == 85)
check("attainable_max 68 (85-shape)", t["attainable_max_score"] == 68, str(t["attainable_max_score"]))
t2 = S.score_transparency(factors("unavailable"), 68)
check("measured_weight_sum 75 (dark positioning)", t2["measured_weight_sum"] == 75)
check("attainable_max 68 (75-shape)", t2["attainable_max_score"] == 68, str(t2["attainable_max_score"]))
alt_factors = [
    {"name": "Trend", "weight": 20, "status": "mixed", "contribution": 10},
    {"name": "Momentum", "weight": 15, "status": "pass", "contribution": 15},
    {"name": "Volatility", "weight": 10, "status": "pass", "contribution": 10},
    {"name": "Volume", "weight": 15, "status": "pass", "contribution": 15},
    {"name": "Positioning / funding", "weight": 10, "status": "neutral", "contribution": 0},
    {"name": "Network fundamentals", "weight": 15, "status": "unavailable", "contribution": 0},
    {"name": "Supply overhang", "weight": 15, "status": "mixed", "contribution": 8},
]
alt = S.score_transparency(alt_factors, 58)
check("ALT-shape recomputes to 58", alt["recomputed_score"] == 58, str(alt["recomputed_score"]))
check("ALT-shape normalized 58/68 = 85.3%", abs(alt["normalized_score"] - 58 / 68) < 1e-9)

# 3. R2 semantics (correction 2)
lv = S.score_levels(cand(), None, DEC_MS)
check("missing derivation + correct side -> unverified",
      lv["classification"] == "unverified" and lv["geometry"] == "correct_side", str(lv))
bad = cand(stopPrice=105.0)
lv = S.score_levels(bad, None, DEC_MS)
check("missing derivation + wrong side -> unverified (NOT malformed)",
      lv["classification"] == "unverified", str(lv["classification"]))
src = {"invalidationDerivation": {"source": "daily", "windowEnd": "2026-10-21T09:30:00.000Z",
                                  "formulaId": "f1", "venue": "Binance Spot"}}
lv = S.score_levels(bad, src, DEC_MS)
check("incompatible derivation (windowEnd after as-of) -> malformed",
      lv["classification"] == "malformed", str(lv))
src2 = {"invalidationDerivation": {"source": "daily", "windowEnd": "2026-10-21T08:00:00.000Z",
                                   "formulaId": "f1", "venue": "Binance Spot"}}
lv = S.score_levels(bad, src2, DEC_MS)
check("valid derivation + wrong side + pre-decision evidence -> already_crossed",
      lv["classification"] == "already_crossed", str(lv))
lv = S.score_levels(cand(), src2, DEC_MS)
check("valid derivation + correct side -> ok", lv["classification"] == "ok", str(lv))

# 4. receipt timing + basis (correction 1, addendum 3)
cap = S.capture_reference("TESTUSDT", DEC_MS, timed_fetcher(DEC_MS + 3600_000))
check("late receipt -> historical_reconstruction",
      cap["reference_basis"] == "historical_reconstruction" and cap["labeled_reconstructed"])
check("late receipt -> receipt_predecision_verified False",
      cap["receipt_predecision_verified"] is False)
check("fetch/receipt stamps present", bool(cap["fetch_started_at"]) and bool(cap["fetch_received_at"]))
cap2 = S.capture_reference("TESTUSDT", DEC_MS, timed_fetcher(DEC_MS - 1000))
check("pre-decision receipt -> live_capture",
      cap2["reference_basis"] == "live_capture" and cap2["receipt_predecision_verified"] is True)

# 5. independent entry selection + would_issue + enrollment
rec = S.score_candidate(cand(), CKPT, STATUS, REG, timed_fetcher(DEC_MS + 3600_000), FakeR4("clear"))
check("challenger entry is its own first print (100.2, id 2)",
      rec["components"]["drift"]["entry_print"]["price"] == 100.2
      and rec["components"]["drift"]["entry_print"]["venue_trade_id"] == "2",
      str(rec["components"]["drift"].get("entry_print")))
check("drift-stopped baseline + pass -> would_issue",
      rec["challenger_disposition"] == "would_issue", rec["challenger_disposition"])
check("production print recorded separately (100.9 / id 111)",
      rec["components"]["drift"]["production_entry_print"]["price"] == 100.9)
div = [d for d in rec["divergences"] if d["component"] == "drift_reanchor"]
check("drift divergence class mechanics_proof_only on reconstruction",
      div and div[0]["divergence_class"] == "mechanics_proof_only", str(div))
enr = S.enrollment_for(rec)
check("enrollment produced", enr is not None)
check("enrollment HYPOTHETICAL + explicit costs",
      enr["hypothetical"] is True and enr["costs"]["bps_round_trip"] == 18)
check("enrollment carries basis + versions",
      enr["reference_basis"] == "historical_reconstruction"
      and enr["versions"]["baseline_freeze_version"] == "paper-pilot-v2.1.4")
check("versions block on record",
      rec["versions"]["challenger_registration_id"] == "challenger-r1-v2"
      and rec["versions"]["challenger_scorer_sha256"])

# 6. R4 dispositions (correction 3)
rec2 = S.score_candidate(cand(state="issued", reasonCode=None), CKPT, STATUS, REG,
                         timed_fetcher(DEC_MS + 3600_000), FakeR4("conjunction"))
check("R4 conjunction vs issued baseline -> would_exclude_ath_conjunction",
      rec2["challenger_disposition"] == "would_exclude_ath_conjunction", rec2["challenger_disposition"])
rec3 = S.score_candidate(cand(), CKPT, STATUS, REG, timed_fetcher(DEC_MS + 3600_000), FakeR4("unverified"))
check("R4 unverified -> no ATH divergence",
      all(d["component"] != "ath_contextual" for d in rec3["divergences"]))

# 7. real R4 joiner math on synthetic CG data
def fake_cg(path):
    if "market_chart" in path:
        pts = []
        base_ts = DEC_MS - 120 * 86400000
        for i in range(121):
            pts.append([base_ts + i * 86400000, 100.0 + i])  # rising series
        return {"prices": pts}
    return {"market_data": {"ath": {"usd": 1000.0}, "ath_date": {"usd": "2021-05-11T16:00:00.000Z"}}}

joiner = S.R4Joiner(cg_fetcher=fake_cg, sleeper=lambda s: None)
f = joiner.fields_for("test-coin", DEC_MS, 150.0)
check("R4 joiner evaluates", f["ath_component"] == "evaluated", str(f))
check("R4 joiner trend positive on rising series", f["trend20d_pct"] > 0)
check("R4 joiner ath distance vs decision price", abs(f["ath_distance_pct"] - (150 / 1000 - 1) * 100) < 0.01)

# 8. evaluator semantics
entry_ms = DEC_MS
pos = {"enrollment_id": "e1", "entry": 100.0, "invalidation": 95.0, "target1": 107.5,
       "direction": "long", "entry_observed_at": DEC, "decision_at": DEC,
       "registration_id": "challenger-r1-v2", "candidate_id": 1, "symbol": "TEST",
       "coin_id": "test-coin", "venue": "Binance Spot", "reference_basis": "historical_reconstruction",
       "divergence_class": "mechanics_proof_only",
       "costs": {"bps_round_trip": 18, "clause": "x"}}
start = (entry_ms // 60000 + 1) * 60000
bars = [(start + i * 60000, 100.5, 99.5, 100.0) for i in range(10)]
bars.append((start + 10 * 60000, 101.0, 94.0, 96.0))  # invalidation touch
out = E.evaluate_position(pos, bars, entry_ms + 3600_000)
check("evaluator invalidation settles -1R", out and out["outcome"] == "invalidated" and out["gross_r"] == -1.0, str(out))
check("net R formula", abs(E.net_r(-1.0, pos) - (-1.0 - 0.0018 * 100.0 / 5.0)) < 1e-9)
bars2 = [(start + i * 60000, 100.5, 99.5, 100.0) for i in range(10)]
bars2.append((start + 10 * 60000, 108.0, 94.0, 96.0))  # both barriers, same block
out2 = E.evaluate_position(pos, bars2, entry_ms + 3600_000)
check("both barriers in one 4h block -> ambiguous", out2 and out2["outcome"] == "ambiguous", str(out2))
bars3 = [(start + i * 60000, 100.5, 99.5, 100.0) for i in range(5)] + \
        [(start + 7 * 60000, 100.5, 99.5, 100.0)]  # gap at minute 5,6
out3 = E.evaluate_position(pos, bars3, entry_ms + 3600_000)
check("coverage gap -> unknown_gap", out3 and out3["outcome"] == "unknown_gap", str(out3))
out4 = E.evaluate_position(pos, bars[:5], entry_ms + 3600_000)
check("no event yet -> open (None)", out4 is None)

print(f"\n{PASS} passed, {FAIL} failed")
sys.exit(1 if FAIL else 0)
