#!/usr/bin/env python3
"""Tests for challenger_r1.py (registration challenger-r1-v1).

Standalone: python3 tests/test_challenger_r1.py  (also pytest-compatible).
Hermetic: the venue fetcher is stubbed; no network; the only production
files read are the registration + rule text (integrity check). Fixtures
are synthetic candidates with decision instants AFTER the registration
freeze (2026-10-21T06:00:00Z), shaped on the real record schema; two
factor ledgers reuse the exact recorded ledgers of prep-sample candidates
313 (COMP) and 321 (PHA) as arithmetic fixtures — inputs to unit tests,
not shadow records.
"""

import json
import os
import sys
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import challenger_r1 as R1

DECISION = "2026-10-21T07:00:00.000Z"
DECISION_MS = R1.parse_ts_ms(DECISION)

LEDGER_COMP = [  # recorded ledger shape of candidate 313: sum 75, T&M pass -> 65
    {"name": "Trend", "contribution": 20, "weight": 20, "status": "pass"},
    {"name": "Momentum", "contribution": 15, "weight": 15, "status": "pass"},
    {"name": "Volatility", "contribution": 10, "weight": 10, "status": "pass"},
    {"name": "Volume", "contribution": 15, "weight": 15, "status": "pass"},
    {"name": "Positioning / funding", "contribution": 0, "weight": 10, "status": "neutral"},
    {"name": "Network fundamentals", "contribution": 0, "weight": 15, "status": "unavailable"},
    {"name": "Supply overhang", "contribution": 15, "weight": 15, "status": "pass"},
]
LEDGER_PHA = [  # recorded ledger shape of candidate 321: sum 68, Momentum mixed -> 68
    {"name": "Trend", "contribution": 20, "weight": 20, "status": "pass"},
    {"name": "Momentum", "contribution": 8, "weight": 15, "status": "mixed"},
    {"name": "Volatility", "contribution": 10, "weight": 10, "status": "pass"},
    {"name": "Volume", "contribution": 15, "weight": 15, "status": "pass"},
    {"name": "Positioning / funding", "contribution": 0, "weight": 10, "status": "unavailable"},
    {"name": "Network fundamentals", "contribution": 0, "weight": 15, "status": "unavailable"},
    {"name": "Supply overhang", "contribution": 15, "weight": 15, "status": "pass"},
]


def cand(**kw):
    base = {
        "id": 9001, "candidateKey": "test:9001", "symbol": "COMP",
        "coinId": "compound-governance-token", "direction": "long",
        "decisionAt": DECISION, "decisionReferencePrice": 25.90,
        "sourceObservedAt": "2026-10-21T06:57:54.000Z",
        "productionScore": 65, "state": "abstained",
        "reasonCode": "entry_outside_drift_zone",
        "factorLedgerJson": json.dumps(LEDGER_COMP),
        "operationalEvidenceJson": json.dumps({"source": {
            "sourceAsOf": "2026-10-21T06:57:54.000Z", "price": 25.90}}),
        "stopPrice": 24.10, "targetPrice": 29.20,
        "entryPrice": 25.76, "entryObservedAt": "2026-10-21T07:00:10.000Z",
        "instrument": "COMPUSDT", "venue": "Binance Spot",
        "discoveryRunId": 999, "permittedDriftBps": 50,
    }
    base.update(kw)
    return base


def checkpoint(venue="binance-spot"):
    return {"candidateId": 9001,
            "coverageJson": json.dumps({"venue": venue}),
            "firstPrintPrice": 25.76,
            "firstPrintObservedAt": "2026-10-21T07:00:10.000Z"}


def stub_fetcher(rows):
    def fetch(symbol, start_ms, end_ms):
        return rows, {"pages": 1, "returned_count": len(rows),
                      "response_sha256": "stub", "truncated": False}
    return fetch


def reg():
    return R1.load_registration()


def test_registration_integrity():
    r = reg()
    assert r["registration_id"] == "challenger-r1-v1"
    assert r["_frozen_ms"] == R1.parse_ts_ms("2026-10-21T06:00:00Z")


def test_attainable_arithmetic_verified_cases():
    t = R1.score_transparency(LEDGER_COMP, 65)
    assert t["factor_sum"] == 75 and t["redundancy_tax_applied"] is True
    assert t["recomputed_score"] == 65 and t["score_crosscheck_match"] is True
    # Positioning NEUTRAL is a measured reading: attainable 85, not 75.
    assert t["attainable_score"] == 85 and t["dark_factors"] == ["Network fundamentals"]
    assert abs(t["normalized_score"] - 65 / 85) < 1e-12
    t2 = R1.score_transparency(LEDGER_PHA, 68)
    assert t2["recomputed_score"] == 68 and t2["redundancy_tax_applied"] is False
    # Positioning UNAVAILABLE here: attainable 75.
    assert t2["attainable_score"] == 75
    assert t2["dark_factors"] == ["Positioning / funding", "Network fundamentals"]


def test_levels_ok_and_malformed_and_crossed():
    ok = R1.score_levels(cand(), None)
    assert ok["classification"] == "ok" and ok["provenance_complete"] is False
    # PHA-shaped: wrong side, no derivation recorded -> malformed (missing
    # derivation), even though the crossing is visible in pre-decision data.
    pha = cand(stopPrice=0.0572597, decisionReferencePrice=0.057116,
               sourceObservedAt="2026-10-21T06:57:54.000Z",
               operationalEvidenceJson=json.dumps({"source": {
                   "sourceAsOf": "2026-10-21T06:57:54.000Z",
                   "invalidationLevel": 0.0572597}}))
    lv = R1.score_levels(pha, {"sourceAsOf": "2026-10-21T06:57:54.000Z",
                               "invalidationLevel": 0.0572597})
    assert lv["classification"] == "malformed" and lv["reason"] == "missing_derivation"
    assert lv["crossing_visible_in_predecision_data"] is True
    # Same geometry WITH a recorded, compatible derivation -> already_crossed.
    src = {"sourceAsOf": "2026-10-21T06:57:54.000Z",
           "invalidationDerivation": {"source": "binance-daily-candles",
                                      "windowEnd": "2026-10-21T00:00:00.000Z",
                                      "formulaId": "trailing-low-v1"}}
    lv2 = R1.score_levels(pha, src)
    assert lv2["classification"] == "already_crossed"
    # Recorded but INCOMPATIBLE derivation (window ends after the reference
    # as-of) -> malformed, never already_crossed.
    src_bad = {"sourceAsOf": "2026-10-21T06:57:54.000Z",
               "invalidationDerivation": {"source": "binance-daily-candles",
                                          "windowEnd": "2026-10-21T07:30:00.000Z",
                                          "formulaId": "trailing-low-v1"}}
    lv3 = R1.score_levels(pha, src_bad)
    assert lv3["classification"] == "malformed" and lv3["reason"] == "incompatible_derivation"


def test_drift_pass_produces_would_issue_with_divergence():
    rows = [{"a": 101, "p": "25.90", "T": DECISION_MS - 60000},
            {"a": 102, "p": "25.76", "T": DECISION_MS - 5807}]
    rec = R1.score_candidate(cand(), checkpoint(), reg(), stub_fetcher(rows))
    assert rec["components"]["drift"]["verdict"] == "pass"
    assert rec["components"]["drift"]["reference"]["price"] == 25.76
    assert rec["challenger_disposition"] == "would_issue"
    div = [d for d in rec["divergences"] if d["component"] == "drift_reanchor"]
    assert len(div) == 1 and div[0]["kind"] == "disposition"
    assert div[0]["inputs"]["drift_bps_challenger"] == 0.0
    assert rec["would_be_contract"]["entry"] == 25.76


def test_drift_unverified_never_anchors_to_later_print():
    def boom(symbol, start_ms, end_ms):
        raise RuntimeError("venue down")
    rec = R1.score_candidate(cand(), checkpoint(), reg(), boom)
    assert rec["components"]["drift"]["verdict"] == "unverified"
    assert rec["challenger_disposition"] == "abstain_unverified_drift"
    rec2 = R1.score_candidate(cand(), checkpoint(), reg(), stub_fetcher([]))
    assert rec2["components"]["drift"]["reason"] == "no_predecision_print_in_window"
    assert rec2["challenger_disposition"] == "abstain_unverified_drift"


def test_drift_reject_against_issued_baseline():
    c = cand(state="issued", reasonCode=None)
    rows = [{"a": 101, "p": "24.00", "T": DECISION_MS - 5000}]  # ref far below entry print
    rec = R1.score_candidate(c, checkpoint(), reg(), stub_fetcher(rows))
    assert rec["components"]["drift"]["verdict"] == "reject"
    assert rec["challenger_disposition"] == "would_reject"


def test_drift_unsupported_venue_and_not_applicable():
    rec = R1.score_candidate(cand(), checkpoint(venue="mexc-spot"), reg(),
                             stub_fetcher([{"a": 1, "p": "1", "T": DECISION_MS - 1}]))
    assert rec["components"]["drift"]["reason"] == "reference_capture_unsupported_venue"
    c2 = cand(state="abstained", reasonCode="production_model_abstain",
              productionScore=58)
    rec2 = R1.score_candidate(c2, None, reg(), stub_fetcher([]))
    assert rec2["components"]["drift"]["verdict"] == "not_applicable"
    assert rec2["challenger_disposition"] == "concur_abstain"


def test_ath_component_records_named_absence():
    rec = R1.score_candidate(cand(), checkpoint(), reg(),
                             stub_fetcher([{"a": 1, "p": "25.76", "T": DECISION_MS - 1}]))
    assert rec["components"]["ath"]["ath_component"] == "unverified"
    assert rec["components"]["ath"]["reason"] == "ath_fields_not_in_candidate_record"


def test_prospective_guard_and_idempotency_end_to_end():
    post = cand(id=9101)
    pre = cand(id=9102, decisionAt="2026-10-21T04:39:59.798Z")
    status = {"data": {"candidates": [post, pre],
                       "checkpoints": [checkpoint()]}}
    # checkpoint candidateId must match post's id for the drift path
    status["data"]["checkpoints"][0]["candidateId"] = 9101
    old_fetch = R1.fetch_agg_trades
    R1.fetch_agg_trades = stub_fetcher(
        [{"a": 7, "p": "25.76", "T": DECISION_MS - 5807}])
    try:
        with tempfile.TemporaryDirectory() as td:
            sp = os.path.join(td, "status.json")
            out = os.path.join(td, "shadow.jsonl")
            with open(sp, "w") as f:
                json.dump(status, f)
            import io, contextlib
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                rc = R1.main(["challenger_r1.py", "--status", sp, "--out", out])
            assert rc == 0
            summary = json.loads(buf.getvalue())
            assert summary["refused_pre_registration"] == 1, summary
            assert summary["newly_scored"] == [9101], summary
            lines = open(out).read().strip().splitlines()
            assert len(lines) == 1
            rec = json.loads(lines[0])
            assert rec["challenger_disposition"] == "would_issue"
            assert rec["components"]["levels"]["classification"] == "ok"
            assert rec["components"]["transparency"]["attainable_score"] == 85
            assert rec["cluster"] == {"asset": "compound-governance-token",
                                      "discovery_run_id": 999}
            # second run: idempotent, nothing new
            buf = io.StringIO()
            with contextlib.redirect_stdout(buf):
                R1.main(["challenger_r1.py", "--status", sp, "--out", out])
            summary2 = json.loads(buf.getvalue())
            assert summary2["newly_scored"] == [] and summary2["already_recorded"] == 1
            assert len(open(out).read().strip().splitlines()) == 1
    finally:
        R1.fetch_agg_trades = old_fetch


def main():
    tests = [(n, f) for n, f in sorted(globals().items())
             if n.startswith("test_") and callable(f)]
    failed = 0
    for name, fn in tests:
        try:
            fn()
            print(f"PASS {name}")
        except Exception as e:
            failed += 1
            print(f"FAIL {name}: {type(e).__name__}: {e}")
    print(f"{len(tests) - failed}/{len(tests)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
