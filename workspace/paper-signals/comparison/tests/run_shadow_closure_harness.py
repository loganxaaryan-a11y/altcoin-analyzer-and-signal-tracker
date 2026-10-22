#!/usr/bin/env python3
"""Shadow-closure harness for challenger_shadow_eval.py (expert order,
2026-10-21: test shadow closure SEPARATELY, do not wait for natural
CVX/NEAR outcomes).

Builds SYNTHETIC test enrollments in an ISOLATED test book
(rows/closure-test/test-shadow-book.jsonl) anchored on real Binance Spot
1m bars, pre-verifies each expected path with the evaluator's own
evaluate_position(), then runs the evaluator CLI with --book/--outcomes
pointed at the test files ONLY. The production shadow book and outcomes
files are never read or written by this harness (their hashes are
checked before/after).

Cases: target-hit, invalidation, ambiguity (both barriers in one clean
4h block), gap (real missing minute in an illiquid pair's klines ->
unknown_gap), missing coverage (nonexistent instrument -> fetch_failed),
plus an open control (no event yet). Every test record is labeled TEST
and excluded from all prospective counts.
"""
import hashlib
import importlib.util
import json
import os
import subprocess
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEST_DIR = os.path.join(BASE, "rows", "closure-test")
TEST_BOOK = os.path.join(TEST_DIR, "test-shadow-book.jsonl")
TEST_OUTCOMES = os.path.join(TEST_DIR, "test-shadow-outcomes.jsonl")
PROD_BOOK = os.path.join(BASE, "rows", "challenger-r1-shadow-book-v2.jsonl")
PROD_OUTCOMES = os.path.join(BASE, "rows", "challenger-r1-shadow-outcomes-v2.jsonl")
VISION = "https://data-api.binance.vision"

spec = importlib.util.spec_from_file_location(
    "challenger_shadow_eval", os.path.join(BASE, "challenger_shadow_eval.py"))
EV = importlib.util.module_from_spec(spec)
spec.loader.exec_module(EV)


def sha(path):
    if not os.path.exists(path):
        return "absent"
    with open(path, "rb") as f:
        return hashlib.sha256(f.read()).hexdigest()


def iso(ms):
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime(
        "%Y-%m-%dT%H:%M:%S.") + f"{int(ms) % 1000:03d}Z"


def enrollment(case, symbol, entry, stop, t1, entry_ms, direction="long"):
    risk = abs(entry - stop)
    t2 = entry + 2.5 * risk if direction == "long" else entry - 2.5 * risk
    return {
        "record_type": "shadow_enrollment",
        "shadow_book": "closure-test (isolated; NOT the production book)",
        "hypothetical": True,
        "test_record": True,
        "record_label": "TEST — synthetic closure-harness enrollment, "
                        "NOT a prospective record, excluded from all counts",
        "enrollment_id": f"challenger-r1-v2:test:closure-{case}",
        "registration_id": "challenger-r1-v2",
        "enrolled_at": iso(entry_ms),
        "candidate_id": None,
        "candidate_key": f"closure-test:{case}",
        "symbol": symbol.replace("USDT", ""),
        "coin_id": "closure-test",
        "instrument": symbol,
        "venue": "Binance Spot",
        "direction": direction,
        "decision_at": iso(entry_ms),
        "entry": entry,
        "entry_observed_at": iso(entry_ms),
        "entry_venue_trade_id": None,
        "invalidation": stop,
        "target1": t1,
        "target2": t2,
        "risk_distance": risk,
        "reference_basis": "closure_test_synthetic",
        "divergence_class": "closure_test",
        "cluster": {"asset": "closure-test"},
        "versions": {"note": "closure harness; no production versions"},
        "evaluator": "crypto-evaluation-v5-corrected",
        "costs": {"bps_round_trip": 18,
                  "clause": "18 bps round-trip modeled (crypto-evaluation-v5-corrected)"},
        "status": "open",
    }


def main():
    prod_before = (sha(PROD_BOOK), sha(PROD_OUTCOMES))
    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    # 72h of BTCUSDT 1m bars — plenty of room to anchor all BTC cases.
    bars = EV.fetch_klines("BTCUSDT", now_ms - 72 * 3600 * 1000, now_ms)
    if len(bars) < 4000:
        print(f"insufficient BTC bars: {len(bars)}")
        return 1
    by_open = {b[0]: b for b in bars}
    enrollments = []
    expectations = {}

    # --- case 1+2: target-hit and invalidation on the same calm anchor ---
    # Anchor 30h ago; look 6h ahead for realized extremes.
    anchor = bars[len(bars) // 2]
    a_ms, entry = anchor[0], anchor[3]
    ahead = [b for b in bars if a_ms < b[0] <= a_ms + 6 * 3600 * 1000]
    hi = max(b[1] for b in ahead)
    lo = min(b[2] for b in ahead)
    # target-hit: T1 just under the realized high; stop far below the low.
    e1 = enrollment("target-hit", "BTCUSDT", entry, lo * 0.995,
                    entry + 0.8 * (hi - entry), a_ms)
    # invalidation: stop just above the realized low; T1 far above the high.
    e2 = enrollment("invalidation", "BTCUSDT", entry, entry - 0.8 * (entry - lo),
                    hi * 1.005, a_ms)
    enrollments += [e1, e2]
    expectations[e1["enrollment_id"]] = "target1_hit"
    expectations[e2["enrollment_id"]] = "invalidated"

    # --- case 3: ambiguity — both barriers inside one clean 4h block ---
    found = None
    for i in range(0, len(bars) - 240, 60):
        blk = bars[i][0] // (4 * 3600 * 1000) * (4 * 3600 * 1000)
        block_bars = [b for b in bars if blk <= b[0] < blk + 4 * 3600 * 1000]
        if len(block_bars) < 200:
            continue
        e0 = block_bars[0][3]
        bhi = max(b[1] for b in block_bars)
        blo = min(b[2] for b in block_bars)
        if bhi - e0 > 0.004 * e0 and e0 - blo > 0.004 * e0:
            # anchor one bar before the block; barriers at 60% of the range
            prev = bars[i - 1] if i > 0 else block_bars[0]
            cand = enrollment("ambiguity", "BTCUSDT", prev[3],
                              prev[3] - 0.6 * (prev[3] - blo),
                              prev[3] + 0.6 * (bhi - prev[3]),
                              prev[0])
            out = EV.evaluate_position(cand, bars, now_ms)
            if out and out.get("outcome") == "ambiguous":
                found = cand
                break
    if found:
        enrollments.append(found)
        expectations[found["enrollment_id"]] = "ambiguous"

    # --- case 5: open control — anchor 20 min ago, barriers +-5% ---
    last = bars[-20]
    e5 = enrollment("open-control", "BTCUSDT", last[3], last[3] * 0.95,
                    last[3] * 1.05, last[0])
    enrollments.append(e5)
    expectations[e5["enrollment_id"]] = None  # stays open

    # --- case 6: missing coverage — nonexistent instrument ---
    e6 = enrollment("missing-coverage", "NOSUCHPAIRUSDT", 100.0, 95.0, 107.5,
                    now_ms - 3600 * 1000)
    enrollments.append(e6)
    expectations[e6["enrollment_id"]] = "fetch_failed"

    # Pre-verify every deterministic case with the evaluator's own walk.
    print("== pre-verification (evaluator's own evaluate_position) ==")
    for e in enrollments:
        eid = e["enrollment_id"]
        if eid.endswith("missing-coverage"):
            print(f"  {eid}: fetch path (no pre-verify)")
            continue
        bb = EV.fetch_klines(e["instrument"], EV.parse_ts_ms(e["entry_observed_at"]),
                             min(now_ms, EV.parse_ts_ms(e["entry_observed_at"]) + EV.CAP_MS + 3600_000))
        out = EV.evaluate_position(e, bb, now_ms)
        got = None if out is None else out.get("outcome")
        ok = got == expectations[eid]
        print(f"  {eid}: expected={expectations[eid]} got={got} {'OK' if ok else 'MISMATCH'}")
        if not ok:
            print("  ABORT: construction failed; not writing the test book")
            return 1

    # Case 4 (gap) needs an illiquid pair with a real missing minute.
    gap_candidates = ["BTTCUSDT", "BONDUSDT", "PUNDIXUSDT", "OXTUSDT",
                      "RADUSDT", "REQUSDT", "CVPUSDT", "MIRUSDT"]
    gap_enrollment = None
    for sym in gap_candidates:
        try:
            gb = EV.fetch_klines(sym, now_ms - 72 * 3600 * 1000, now_ms)
        except Exception:
            continue
        opens = [b[0] for b in gb]
        hole = None
        for k in range(1, len(opens)):
            if opens[k] - opens[k - 1] > 60000:
                hole = (opens[k - 1], opens[k])
                break
        if not hole:
            continue
        # anchor 30 min before the hole; barriers far away (+-8%)
        anchor_bar = [b for b in gb if b[0] <= hole[0] - 30 * 60000]
        if not anchor_bar:
            continue
        ab = anchor_bar[-1]
        cand = enrollment("gap", sym, ab[3], ab[3] * 0.92, ab[3] * 1.08, ab[0])
        out = EV.evaluate_position(cand, gb, now_ms)
        if out and out.get("outcome") == "unknown_gap":
            gap_enrollment = cand
            expectations[cand["enrollment_id"]] = "unknown_gap"
            print(f"  gap case: {sym} hole after {iso(hole[0])} -> unknown_gap OK")
            break
    if gap_enrollment:
        enrollments.append(gap_enrollment)
    else:
        print("  gap case: no illiquid pair with a usable real hole found "
              "(missing-coverage case still exercises the no-data path)")

    os.makedirs(TEST_DIR, exist_ok=True)
    with open(TEST_BOOK, "w") as f:
        for e in enrollments:
            f.write(json.dumps(e) + "\n")
    if os.path.exists(TEST_OUTCOMES):
        os.remove(TEST_OUTCOMES)

    print("== evaluator CLI run (test book/outcomes only) ==")
    r = subprocess.run(
        [sys.executable, os.path.join(BASE, "challenger_shadow_eval.py"),
         "--book", TEST_BOOK, "--outcomes", TEST_OUTCOMES],
        capture_output=True, text=True)
    print(r.stdout or r.stderr)
    result = json.loads(r.stdout)
    verdicts = {}
    for res in result["results"]:
        verdicts[res["enrollment_id"]] = res.get("outcome") or res.get("status")
    print("== verdicts ==")
    all_ok = True
    for eid, exp in expectations.items():
        got = verdicts.get(eid)
        ok = (got == exp) or (exp is None and got == "open_no_event")
        all_ok = all_ok and ok
        print(f"  {eid}: expected={exp or 'open_no_event'} got={got} {'OK' if ok else 'MISMATCH'}")

    prod_after = (sha(PROD_BOOK), sha(PROD_OUTCOMES))
    print("production book/outcomes untouched:", prod_before == prod_after)
    print("ALL OK" if all_ok and prod_before == prod_after else "PROBLEMS FOUND")
    return 0 if all_ok and prod_before == prod_after else 1


if __name__ == "__main__":
    sys.exit(main())
