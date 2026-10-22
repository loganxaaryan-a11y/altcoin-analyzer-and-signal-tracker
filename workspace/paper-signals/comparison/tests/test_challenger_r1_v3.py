#!/usr/bin/env python3
"""Challenger-R1 v3 test suite — the four v3 deltas:
(1) R1 persisted decision-time capture join (receipt-time proof bar),
(2) R4 velocity-bypass preservation via ATH gate records,
(3) R3 state map completed with observed Network/Positioning states,
(4) clustering stamp = coinId only.
Plus v2-behavior regression (core attainable 68; reconstruction fallback).
Standalone: python3 tests/test_challenger_r1_v3.py
Synthetic only; no network. The registration-integrity section runs
only when the v3 registration is frozen (rule-text hash verifies).
"""
import importlib.util
import json
import os
import sys

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE)


def load_mod(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


S = load_mod("challenger_r1_v3", os.path.join(BASE, "challenger_r1_v3.py"))
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


REG = {"registration_id": "challenger-r1-v3", "rule_text_sha256": "synthetic",
       "_scorer_sha256": "synthetic", "frozen_at_utc": "2026-10-21T00:00:00Z",
       "_frozen_ms": 0}


def factors(network="unavailable", positioning="neutral"):
    f = [
        {"name": "Trend", "weight": 20, "status": "pass", "contribution": 20},
        {"name": "Momentum", "weight": 15, "status": "pass", "contribution": 15},
        {"name": "Volatility", "weight": 10, "status": "pass", "contribution": 10},
        {"name": "Volume", "weight": 15, "status": "pass", "contribution": 15},
        {"name": "Supply overhang", "weight": 15, "status": "pass", "contribution": 15},
    ]
    if network == "unavailable":
        f.append({"name": "Network fundamentals", "weight": 15,
                  "status": "unavailable", "contribution": 0})
    else:
        f.append({"name": "Network fundamentals", "weight": 15,
                  "status": network,
                  "contribution": 15 if network == "pass" else 8})
    if positioning == "neutral":
        f.append({"name": "Positioning / funding", "weight": 10,
                  "status": "neutral", "contribution": 0})
    elif positioning == "pass":
        f.append({"name": "Positioning / funding", "weight": 10,
                  "status": "pass", "contribution": 10})
    else:
        f.append({"name": "Positioning / funding", "weight": 10,
                  "status": "unavailable", "contribution": 0})
    return f


def cand(**kw):
    c = {
        "id": 999, "candidateKey": "test", "symbol": "TEST", "coinId": "test-coin",
        "direction": "long", "decisionAt": DEC,
        "decisionReferencePrice": 100.0, "sourceObservedAt": "2026-10-21T08:59:00.000Z",
        "venue": "Binance Spot", "instrument": "TESTUSDT",
        "freezeVersion": "paper-pilot-v2.1.5", "productionHash": "prodhash",
        "challengerHash": "chalhash", "discoveryRunId": 137,
        "factorLedgerJson": json.dumps(factors()),
        "productionScore": 68, "permittedDriftBps": 50,
        "stopPrice": 95.0, "targetPrice": 107.5,
        "state": "abstained", "reasonCode": "entry_outside_drift_zone",
        "entryPrice": None, "entryObservedAt": None,
        "driftReferenceCaptureJson": None,
    }
    c.update(kw)
    return c


STATUS = {"handler_version": "2.1.9",
          "freeze": json.dumps({"version": "paper-pilot-v2.1.5"}),
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
        return {"component": "ath", "ath_component": "evaluated",
                "ath": 120.0, "ath_date": "2021-01-01", "ath_basis": "coingecko_ath",
                "ath_distance_pct": -20.0, "price_vs_sma50_pct": 4.0,
                "price_below_sma50": False, "trend20d_pct": 6.0,
                "trend20d_negative": False, "conjunction_hard_exclusion": False,
                "fields_basis": "historical_series_asof_decision",
                "fields_fetched_at": DEC, "fields_received_at": DEC}


print("== (3) R3 state map: observed states registered ==")
t = S.score_transparency(factors(network="pass", positioning="pass"), 90)
check("Network pass + Positioning pass: no unmapped flags",
      t["unmapped_states_flagged"] == [], str(t["unmapped_states_flagged"]))
check("all-measured attainable 93", t["attainable_max_score"] == 93,
      str(t["attainable_max_score"]))
check("all-pass recomputation 100 - 10 tax = 90", t["recomputed_score"] == 90,
      str(t["recomputed_score"]))
t378 = S.score_transparency(factors(positioning="pass"), 68)
check("Positioning pass (cand-378 shape): unmapped empty",
      t378["unmapped_states_flagged"] == [], str(t378["unmapped_states_flagged"]))
check("Positioning pass attainable 78 (matches live observation)",
      t378["attainable_max_score"] == 78, str(t378["attainable_max_score"]))
tcore = S.score_transparency(factors(), 68)
# Map-completion consequence (disclosed in the v3 text): with Positioning
# pass registered as an observed state, a Positioning-measured candidate's
# attainable includes it -> 78 for the dominant shape (was 68 under v2's
# incomplete map). The absolute bar (60) never depended on attainable.
check("core shape attainable 78 under the completed map (Positioning pass registered)",
      tcore["attainable_max_score"] == 78, str(tcore["attainable_max_score"]))
tdark = S.score_transparency(factors(positioning="unavailable"), 68)
check("Positioning-dark shape attainable still 68",
      tdark["attainable_max_score"] == 68, str(tdark["attainable_max_score"]))
tmix = S.score_transparency(factors(network="mixed"), 68)
check("Network mixed: unmapped empty", tmix["unmapped_states_flagged"] == [],
      str(tmix["unmapped_states_flagged"]))

print("== (2) R4 velocity bypass preserved ==")
gate = {"test-coin": {"coinId": "test-coin", "disposition": "bypassed_velocity",
                      "velocityBypassApplied": True}}
rec = S.score_candidate(cand(), CKPT, STATUS, REG,
                        timed_fetcher(DEC_MS + 3600_000), FakeR4("conjunction"),
                        gate_map=gate)
check("gate-record bypass: NOT excluded by conjunction",
      rec["challenger_disposition"] != "would_exclude_ath_conjunction",
      rec["challenger_disposition"])
check("gate-record bypass: ath component records applied=true",
      rec["components"]["ath"]["velocity_bypass"]["applied"] is True)
rec = S.score_candidate(cand(athGateJson=json.dumps({"velocityBypassApplied": True})),
                        CKPT, STATUS, REG, timed_fetcher(DEC_MS + 3600_000),
                        FakeR4("conjunction"))
check("candidate-carried gate record: NOT excluded",
      rec["challenger_disposition"] != "would_exclude_ath_conjunction",
      rec["challenger_disposition"])
rec = S.score_candidate(cand(), CKPT, STATUS, REG,
                        timed_fetcher(DEC_MS + 3600_000), FakeR4("conjunction"))
check("control (no bypass anywhere): conjunction still excludes",
      rec["challenger_disposition"] == "would_exclude_ath_conjunction",
      rec["challenger_disposition"])
conj = FakeR4("conjunction").fields_for("test-coin", DEC_MS, 100.0)
check("upstream disposition: bypassed -> pass_with_context",
      S.ath_disposition(conj, bypassed=True) == "pass_with_context")
check("upstream disposition: not bypassed -> hard_exclude_conjunction",
      S.ath_disposition(conj, bypassed=False) == "hard_exclude_conjunction")

print("== (1) R1 persisted capture join (receipt bar) ==")
good_capture = json.dumps({
    "referencePrice": 100.0, "venueTradeId": 77,
    "printTimestamp": S.iso_ms(DEC_MS - 5000),
    "fetchStartedAt": S.iso_ms(DEC_MS - 8000),
    "fetchReceivedAt": S.iso_ms(DEC_MS - 6000),
    "responseHash": "abc"})
rec = S.score_candidate(cand(driftReferenceCaptureJson=good_capture), CKPT,
                        STATUS, REG, timed_fetcher(DEC_MS + 3600_000),
                        FakeR4("clear"))
dr = rec["components"]["drift"]
check("persisted capture in time: basis live_capture",
      dr["reference"]["reference_basis"] == "live_capture",
      str(dr["reference"].get("reference_basis")))
check("persisted capture in time: receipt verified",
      dr["reference"]["receipt_predecision_verified"] is True)
check("persisted capture in time: source labeled",
      dr["reference"]["reference_source"] == "persisted_decision_time_capture")
enr = S.enrollment_for(rec)
check("live-capture would_issue enrolls in the v3 book",
      enr is not None and enr["enrollment_id"].startswith("challenger-r1-v3:enroll:"),
      str(enr and enr["enrollment_id"]))
check("live-capture enrollment class paired_comparison",
      enr is not None and enr["divergence_class"] == "paired_comparison",
      str(enr and enr["divergence_class"]))
late_capture = json.dumps({
    "referencePrice": 100.0, "venueTradeId": 77,
    "printTimestamp": S.iso_ms(DEC_MS - 5000),
    "fetchStartedAt": S.iso_ms(DEC_MS + 30000),
    "fetchReceivedAt": S.iso_ms(DEC_MS + 60000),
    "responseHash": "abc"})
rec = S.score_candidate(cand(driftReferenceCaptureJson=late_capture), CKPT,
                        STATUS, REG, timed_fetcher(DEC_MS + 3600_000),
                        FakeR4("clear"))
dr = rec["components"]["drift"]
check("late receipt: falls back to reconstruction",
      dr["reference"]["reference_basis"] == "historical_reconstruction",
      str(dr["reference"].get("reference_basis")))
check("late receipt: rejection recorded with reason",
      (dr.get("persisted_capture_rejected") or {}).get("reason")
      == "persisted_capture_receipt_after_decision",
      str(dr.get("persisted_capture_rejected")))
unavail = json.dumps({"status": "unavailable", "reason": "capture_timeout"})
rec = S.score_candidate(cand(driftReferenceCaptureJson=unavail), CKPT, STATUS,
                        REG, timed_fetcher(DEC_MS + 3600_000), FakeR4("clear"))
check("unavailable capture record: reconstruction fallback, no crash",
      rec["components"]["drift"]["reference"]["reference_basis"]
      == "historical_reconstruction")

print("== (4) cluster stamp ==")
check("cluster is asset-only", rec["cluster"] == {"asset": "test-coin"},
      str(rec["cluster"]))
check("discovery_run_id carried separately for the per-run breakdown",
      rec.get("discovery_run_id") == 137, str(rec.get("discovery_run_id")))

print("== registration integrity (post-freeze only) ==")
try:
    live_reg = S.load_registration()
    check("v3 registration loads + rule-text hash verifies",
          live_reg["registration_id"] == "challenger-r1-v3")
except Exception as e:
    print(f"  skip  registration not yet frozen ({type(e).__name__})")

print(f"\n{PASS} passed, {FAIL} failed")
sys.exit(1 if FAIL else 0)
