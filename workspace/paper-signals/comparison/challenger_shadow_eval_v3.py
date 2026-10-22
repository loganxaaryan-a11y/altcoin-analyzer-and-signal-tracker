#!/usr/bin/env python3
"""Challenger-R1 shadow evaluator (registration challenger-r1-v3).

ISOLATED shadow evaluation: reads ONLY the shadow book
(rows/challenger-r1-shadow-book-v3.jsonl), evaluates open HYPOTHETICAL
shadow positions under the frozen evaluator semantics
(crypto-evaluation-v5-corrected), and appends closures to the shadow book
plus settlement records to rows/challenger-r1-shadow-outcomes-v3.jsonl.
It never reads or writes production positions, production monitoring, or
production outcomes, and never counts shadow work as issued work.

Evaluator semantics (frozen clause, as recorded in production settlements):
first-touch TOUCH on completed 1m bars (bar high/low) from the position's
own venue (Binance Spot, public data route); the walk STOPS at the first
touch-or-uncertainty event; both barriers touched within one clean 4-hour
block = AMBIGUOUS; a coverage gap before resolution = UNKNOWN; the
entry-spanning bar is excluded; horizon cap 30 elapsed days (time_exit at
the cap). Costs: 18 bps round-trip; net R per the v2 comparison math:
net R = gross R - 0.0018 x entry / |entry - invalidation|.

Usage: python3 challenger_shadow_eval.py [--book PATH] [--outcomes PATH]
       [--dry-run]
"""

import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone

BASE = os.path.dirname(os.path.abspath(__file__))
BOOK_PATH = os.path.join(BASE, "rows", "challenger-r1-shadow-book-v3.jsonl")
OUTCOMES_PATH = os.path.join(BASE, "rows", "challenger-r1-shadow-outcomes-v3.jsonl")
VISION = "https://data-api.binance.vision"
CAP_MS = 30 * 24 * 3600 * 1000
BLOCK_MS = 4 * 3600 * 1000


def parse_ts_ms(value):
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return int(value)
    s = str(value).strip()
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp() * 1000)


def iso_ms(ms):
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime(
        "%Y-%m-%dT%H:%M:%S.") + f"{int(ms) % 1000:03d}Z"


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def fetch_klines(symbol, start_ms, end_ms):
    """Completed 1m bars from the venue's public route. Returns list of
    (open_ms, high, low, close) sorted by open time."""
    bars = []
    start = start_ms
    while start <= end_ms:
        q = urllib.parse.urlencode({"symbol": symbol, "interval": "1m",
                                    "startTime": start, "endTime": end_ms,
                                    "limit": 1000})
        req = urllib.request.Request(
            VISION + "/api/v3/klines?" + q,
            headers={"User-Agent": "challenger-r1-shadow-evaluator/3.0"})
        with urllib.request.urlopen(req, timeout=30) as r:
            page = json.loads(r.read())
        if not page:
            break
        for row in page:
            bars.append((int(row[0]), float(row[2]), float(row[3]), float(row[4])))
        if len(page) < 1000:
            break
        start = int(page[-1][0]) + 60_000
    return bars


def evaluate_position(pos, bars, now_ms):
    """First-touch walk. bars: completed (open_ms, high, low, close).
    Returns an outcome dict or None (still open, no event yet)."""
    entry = float(pos["entry"])
    stop = float(pos["invalidation"])
    t1 = float(pos["target1"])
    direction = pos.get("direction") or "long"
    entry_ms = parse_ts_ms(pos["entry_observed_at"]) or parse_ts_ms(pos["decision_at"])
    cap_ms = entry_ms + CAP_MS
    horizon_end = min(now_ms, cap_ms)
    risk = abs(entry - stop)
    if risk <= 0:
        return {"outcome": "non_evaluable", "reason": "zero_risk_distance"}

    def touched(bar):
        _, hi, lo, _ = bar
        if direction == "short":
            return {"invalidation": hi >= stop, "target1": lo <= t1}
        return {"invalidation": lo <= stop, "target1": hi >= t1}

    # Eligible bars: open at/after the entry minute's next bar start
    # (entry-spanning bar excluded), open time < horizon_end, completed.
    eligible = [b for b in bars
                if b[0] >= (entry_ms // 60000 + 1) * 60000 and b[0] < horizon_end]
    eligible.sort(key=lambda b: b[0])
    if not eligible:
        return None
    # Coverage contiguity up to the deciding event: a missing minute before
    # any touch is an uncertainty event and stops the walk (UNKNOWN).
    deciding = None  # (block_start, {barrier: first_touch_bar})
    i = 0
    expected = eligible[0][0]
    while i < len(eligible):
        bar = eligible[i]
        if bar[0] != expected:
            return {"outcome": "unknown_gap",
                    "reason": "coverage_gap_before_resolution",
                    "gap_at": iso_ms(expected),
                    "coverage": {"from": iso_ms(eligible[0][0]),
                                 "bars": i, "gaps": 1}}
        block = (bar[0] // BLOCK_MS) * BLOCK_MS
        touches = {}
        j = i
        while j < len(eligible) and (eligible[j][0] // BLOCK_MS) * BLOCK_MS == block:
            if eligible[j][0] != expected:
                return {"outcome": "unknown_gap",
                        "reason": "coverage_gap_before_resolution",
                        "gap_at": iso_ms(expected),
                        "coverage": {"from": iso_ms(eligible[0][0]),
                                     "bars": j, "gaps": 1}}
            t = touched(eligible[j])
            for barrier, hit in t.items():
                if hit and barrier not in touches:
                    touches[barrier] = eligible[j]
            expected += 60000
            j += 1
        if touches:
            deciding = (block, touches)
            break
        i = j
    if deciding is None:
        if now_ms >= cap_ms:
            exit_bar = eligible[-1]
            gross = ((exit_bar[3] - entry) / risk) * (1 if direction != "short" else -1)
            return {"outcome": "time_exit", "gross_r": round(gross, 6),
                    "exit_price": exit_bar[3], "exit_at": iso_ms(exit_bar[0]),
                    "coverage": {"from": iso_ms(eligible[0][0]),
                                 "to": iso_ms(eligible[-1][0]), "bars": len(eligible),
                                 "gaps": 0}}
        return None
    block, touches = deciding
    def extreme_of(barrier, bar):
        # long: target touched by high, invalidation by low; short: inverse
        by_high = (barrier == "target1") if direction != "short" else (barrier == "invalidation")
        return (bar[1], "high") if by_high else (bar[2], "low")

    if len(touches) > 1:
        return {"outcome": "ambiguous",
                "reason": "both_barriers_touched_in_one_clean_4h_block",
                "block_open_utc": iso_ms(block),
                "first_touches": {k: {"bar_open_utc": iso_ms(v[0]),
                                      "extreme": extreme_of(k, v)[0],
                                      "side": extreme_of(k, v)[1]}
                                  for k, v in touches.items()},
                "coverage": {"from": iso_ms(eligible[0][0]), "gaps": 0}}
    barrier, bar = next(iter(touches.items()))
    gross = 1.5 if barrier == "target1" else -1.0
    ex, side = extreme_of(barrier, bar)
    return {"outcome": "target1_hit" if barrier == "target1" else "invalidated",
            "settled": True, "gross_r": gross,
            "settling_touch": {"barrier": barrier,
                               "level": t1 if barrier == "target1" else stop,
                               "bar_open_utc": iso_ms(bar[0]),
                               "extreme": ex,
                               "side": side},
            "coverage": {"from": iso_ms(eligible[0][0]), "to": iso_ms(bar[0]),
                         "gaps": 0}}


def net_r(gross, pos):
    entry = float(pos["entry"])
    risk = abs(entry - float(pos["invalidation"]))
    return round(gross - 0.0018 * entry / risk, 6)


def load_book(path):
    enrollments, closures = {}, set()
    if os.path.exists(path):
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                r = json.loads(line)
                if r.get("record_type") == "shadow_enrollment":
                    enrollments[r["enrollment_id"]] = r
                elif r.get("record_type") == "shadow_closure":
                    closures.add(r["enrollment_id"])
    return enrollments, closures


def main(argv):
    args = argv[1:]

    def opt(name, default):
        return args[args.index(name) + 1] if name in args else default

    book_path = opt("--book", BOOK_PATH)
    outcomes_path = opt("--outcomes", OUTCOMES_PATH)
    dry_run = "--dry-run" in args
    enrollments, closures = load_book(book_path)
    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    results = []
    for eid, pos in enrollments.items():
        if eid in closures:
            continue
        entry_ms = parse_ts_ms(pos["entry_observed_at"]) or parse_ts_ms(pos["decision_at"])
        end_ms = min(now_ms, entry_ms + CAP_MS + 3600_000)
        symbol = pos.get("instrument")
        try:
            bars = fetch_klines(symbol, entry_ms, end_ms)
        except Exception as e:
            results.append({"enrollment_id": eid, "status": "fetch_failed",
                            "detail": str(e)[:160]})
            continue
        out = evaluate_position(pos, bars, now_ms)
        if out is None:
            results.append({"enrollment_id": eid, "status": "open_no_event"})
            continue
        outcome_rec = {
            "record_type": "shadow_settlement",
            "shadow_book": "challenger-r1-shadow-book-v3",
            "hypothetical": True,
            "record_label": "HYPOTHETICAL — shadow outcome, never an issued position outcome",
            "enrollment_id": eid,
            "registration_id": pos.get("registration_id"),
            "candidate_id": pos.get("candidate_id"),
            "symbol": pos.get("symbol"),
            "coin_id": pos.get("coin_id"),
            "direction": pos.get("direction"),
            "venue": pos.get("venue"),
            "entry_price": pos.get("entry"),
            "entry_observed_at": pos.get("entry_observed_at"),
            "frozen_levels": {"invalidation": pos.get("invalidation"),
                              "target1": pos.get("target1"),
                              "target2": pos.get("target2")},
            "barrier_rule": "TOUCH (bar high/low, completed 1m bars only)",
            "evaluator": "crypto-evaluation-v5-corrected",
            "reference_basis": pos.get("reference_basis"),
            "divergence_class": pos.get("divergence_class"),
            "costs": pos.get("costs"),
            "recorded_at_utc": now_iso(),
            **out,
        }
        if "gross_r" in out:
            outcome_rec["net_r"] = net_r(out["gross_r"], pos)
            outcome_rec["costs_note"] = "Net R = gross R - 18 bps (frozen clause), " \
                "converted to R units at the position's own risk distance (v2 math)"
        closure = {"record_type": "shadow_closure", "shadow_book": "challenger-r1-shadow-book-v3",
                   "hypothetical": True, "enrollment_id": eid,
                   "closed_at": now_iso(), "outcome": out["outcome"]}
        if not dry_run:
            with open(book_path, "a") as f:
                f.write(json.dumps(closure) + "\n")
            with open(outcomes_path, "a") as f:
                f.write(json.dumps(outcome_rec) + "\n")
        results.append({"enrollment_id": eid, "status": "closed",
                        "outcome": out["outcome"],
                        "gross_r": out.get("gross_r"),
                        "net_r": outcome_rec.get("net_r")})
    print(json.dumps({"evaluated_at": now_iso(), "open_enrollments": len(enrollments),
                      "already_closed": len(closures), "results": results,
                      "dry_run": dry_run}, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
