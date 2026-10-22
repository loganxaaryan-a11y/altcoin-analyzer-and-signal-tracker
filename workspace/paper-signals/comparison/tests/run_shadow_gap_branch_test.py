#!/usr/bin/env python3
"""Gap-branch exercise for challenger_shadow_eval.py (companion to
run_shadow_closure_harness.py).

The evaluator's unknown_gap branch fires when a returned 1m series has
a missing minute before resolution. Binance Vision's public klines
route returns FULLY PADDED 1m series — verified 2026-10-21: 25 pairs
scanned over 7 days (10,080 bars each for every pair that returned
data), zero missing minutes — so the branch is not reachable end-to-end
through the CLI with real venue data. This test therefore drives the
evaluator's OWN evaluate_position() with a real BTCUSDT series from
which exactly one minute has been removed, barriers set far away so
no touch precedes the hole. Labeled in-process branch exercise; the
end-to-end CLI proof for target/invalidation/ambiguity/
missing-coverage/open lives in the closure harness.
"""
import importlib.util
import json
import os
import sys
from datetime import datetime, timezone

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location(
    "challenger_shadow_eval", os.path.join(BASE, "challenger_shadow_eval.py"))
EV = importlib.util.module_from_spec(spec)
spec.loader.exec_module(EV)


def iso(ms):
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime(
        "%Y-%m-%dT%H:%M:%S.") + f"{int(ms) % 1000:03d}Z"


def main():
    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    bars = EV.fetch_klines("BTCUSDT", now_ms - 6 * 3600 * 1000, now_ms)
    anchor = bars[60]
    entry = anchor[3]
    pos = {"entry": entry, "invalidation": entry * 0.92,
           "target1": entry * 1.08, "direction": "long",
           "entry_observed_at": iso(anchor[0]),
           "decision_at": iso(anchor[0])}
    # control: intact series, far barriers -> no event (still open)
    out_intact = EV.evaluate_position(pos, bars, now_ms)
    # remove the minute 30 bars after the anchor (well before any touch)
    victim = bars[90][0]
    gapped = [b for b in bars if b[0] != victim]
    out_gap = EV.evaluate_position(pos, gapped, now_ms)
    print(json.dumps({
        "test": "gap branch (unknown_gap), in-process via evaluate_position",
        "removed_minute_open_utc": iso(victim),
        "intact_series_outcome": None if out_intact is None else out_intact.get("outcome"),
        "gapped_series_outcome": None if out_gap is None else out_gap.get("outcome"),
        "gapped_detail": out_gap,
    }, indent=1))
    ok = (out_intact is None and out_gap is not None
          and out_gap.get("outcome") == "unknown_gap")
    print("GAP BRANCH OK" if ok else "GAP BRANCH MISMATCH")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
