#!/usr/bin/env python3
"""
Original-venue paper-entry monitor (paper-only).

Interval-based barrier monitoring for the five frozen paper entries against
their ORIGINAL venue (Binance Spot USDT), via the verified market-data route
data-api.binance.vision (verified 2026-10-19: 1m klines, 12-field schema,
60s-contiguous, trades>0).

Frozen barrier rules (corrected spec R8-R15, from workstreams 02/03/04):
  R8  TOUCH at exact barrier counts; exact equality counts; no tolerance band.
  R9  Wick OR close establishes touch (bar high/low used); closes don't undo wick touches.
  R10 Missing bars -> UNKNOWN, never interpolated.
  R11 (corrected) Proxy-venue data is context only, never settles a touch. This
      monitor uses the ORIGINAL venue, so its klines are venue evidence.
  R12 Both barriers touched with unknown order -> outcome UNRESOLVED, never
      presented as verified OPEN.
  R13 Historical recovery back to entry_observed_at allowed (findings are late
      observations, never new entries, never retroactive timely alerts).
  R14 Bars spanning the entry time are excluded from touch evidence (labeled spanning).
  R15 Positively observed touches stand despite other coverage gaps.

Lifecycle verdicts in the canonical records are NOT rewritten. Observations are
appended to observations.jsonl; a barrier touch is reported as what the frozen
evaluator rules imply (invalidation-first MISS / target1-first HIT /
same-bar double-touch UNRESOLVED) — as a late observation, not a decision edit.

Usage: python3 monitor.py [--recover] [--position <id>]
  Default: check each position over the interval since its last successful
  check (gap-verified). --recover forces historical recovery from
  entry_observed_at on the first run (default behavior when no state exists).
"""
import json, os, sys, time, urllib.request, urllib.parse
from datetime import datetime, timezone

BASE = os.path.dirname(os.path.abspath(__file__))
POSITIONS_FILE = os.path.join(BASE, "positions.json")
STATE_FILE = os.path.join(BASE, "state.json")
OBS_FILE = os.path.join(BASE, "observations.jsonl")
RUNS_DIR = os.path.join(BASE, "runs")
VISION = "https://data-api.binance.vision"
BAR_MS = 60_000


def utc_now_ms():
    return int(time.time() * 1000)


def iso(ms):
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_json(path, default):
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return default


FETCH_DEADLINE_MS = 120_000  # per-position overall fetch deadline (fail-fast)


def fetch_klines(symbol, start_ms, end_ms, deadline_ms=None):
    """Fetch 1m klines pages; returns list of parsed bars (completed only).

    Fail-fast (2026-10-22 repair): an overall per-position deadline bounds the
    whole paged fetch; exceeding it raises TimeoutError, the position is
    marked failed for this pass and its coverage checkpoint does NOT advance."""
    bars = []
    start = start_ms
    while True:
        if deadline_ms is not None and utc_now_ms() > deadline_ms:
            raise TimeoutError(
                f"fetch deadline ({FETCH_DEADLINE_MS}ms) exceeded for {symbol} "
                f"after {len(bars)} bars — checkpoint not advanced")
        q = urllib.parse.urlencode({
            "symbol": symbol, "interval": "1m",
            "startTime": start, "endTime": end_ms, "limit": 1000,
        })
        req = urllib.request.Request(VISION + "/api/v3/klines?" + q,
                                     headers={"User-Agent": "paper-venue-monitor/1.0"})
        with urllib.request.urlopen(req, timeout=30) as r:
            rows = json.load(r)
        if not rows:
            break
        for row in rows:
            bars.append({
                "open_ms": int(row[0]),
                "open": float(row[1]),
                "high": float(row[2]),
                "low": float(row[3]),
                "close": float(row[4]),
                "close_ms": int(row[6]),
                "trades": int(row[8]),
            })
        if len(rows) < 1000:
            break
        start = int(rows[-1][0]) + BAR_MS
        if start > end_ms:
            break
    # Completed bars only: exclude the forming bar.
    now_ms = utc_now_ms()
    bars = [b for b in bars if b["close_ms"] < now_ms]
    bars.sort(key=lambda b: b["open_ms"])
    return bars


def check_position(pos, state_entry, historical_recovery):
    symbol = pos["instrument"]
    entry_ms = int(datetime.fromisoformat(
        pos["entry_observed_at"].replace("Z", "+00:00")).timestamp() * 1000)
    if state_entry and state_entry.get("last_covered_bar_close_ms"):
        start_ms = state_entry["last_covered_bar_close_ms"] + 1
        fetch_start_ms = start_ms
    else:
        start_ms = entry_ms  # historical recovery back to entry_observed_at (R13)
        historical_recovery = True
        # Floor to the minute so the spanning bar is fetched, labeled (R14),
        # and excluded from touch evidence — not silently skipped.
        fetch_start_ms = (entry_ms // BAR_MS) * BAR_MS
    end_ms = utc_now_ms() - 1

    bars = fetch_klines(symbol, fetch_start_ms, end_ms,
                        deadline_ms=utc_now_ms() + FETCH_DEADLINE_MS)
    # Partial-fetch guard (2026-10-22 repair): a silently truncated fetch must
    # never advance the coverage checkpoint. The last completed bar closes
    # within one bar of end_ms on a complete fetch; if coverage ends earlier,
    # fail the position — its checkpoint stays at the last verified bar and
    # the missing interval is re-fetched next pass.
    if bars and end_ms - bars[-1]["close_ms"] > 2 * BAR_MS:
        raise RuntimeError(
            f"partial fetch suspected for {symbol}: coverage ends "
            f"{iso(bars[-1]['close_ms'])} but the window ends {iso(end_ms)} — "
            f"checkpoint not advanced")

    gaps, spanning, eligible = [], [], []
    touches = []
    prev_open = None
    for b in bars:
        # Gap chain continuity: track every fetched bar, even non-evidence ones.
        if prev_open is not None and b["open_ms"] != prev_open + BAR_MS:
            gaps.append({"from_ms": prev_open + BAR_MS,
                         "to_ms": b["open_ms"] - 1,
                         "from_utc": iso(prev_open + BAR_MS),
                         "to_utc": iso(b["open_ms"] - 1),
                         "missing_bars": (b["open_ms"] - prev_open) // BAR_MS - 1})
        prev_open = b["open_ms"]
        if b["close_ms"] <= entry_ms:
            continue  # fully before entry; not evidence
        if b["open_ms"] < entry_ms < b["close_ms"]:
            spanning.append({"bar_open_utc": iso(b["open_ms"]),
                             "bar_close_utc": iso(b["close_ms"]),
                             "label": "spanning bar — excluded from touch evidence (R14)"})
            continue
        eligible.append(b)
        # R8 exact touch; R9 wick-or-close via bar high/low.
        inv_hit = b["low"] <= pos["invalidation"]
        t1_hit = b["high"] >= pos["target1"]
        t2_hit = pos.get("target2") is not None and b["high"] >= pos["target2"]
        if inv_hit:
            touches.append({"bar_open_utc": iso(b["open_ms"]), "barrier": "invalidation",
                            "level": pos["invalidation"], "extreme": b["low"],
                            "side": "low"})
        if t1_hit:
            touches.append({"bar_open_utc": iso(b["open_ms"]), "barrier": "target1",
                            "level": pos["target1"], "extreme": b["high"],
                            "side": "high"})
        if t2_hit:
            touches.append({"bar_open_utc": iso(b["open_ms"]), "barrier": "target2",
                            "level": pos["target2"], "extreme": b["high"],
                            "side": "high"})

    # Outcome per frozen first-touch rules (invalidation-first MISS /
    # target1-first HIT / same-bar double-touch UNRESOLVED).
    inv_t = [t for t in touches if t["barrier"] == "invalidation"]
    t1_t = [t for t in touches if t["barrier"] == "target1"]
    outcome = "no_touch_observed"
    outcome_note = "No barrier touches in covered intervals."
    if not eligible and not bars:
        outcome = "unknown"
        outcome_note = "No coverage at all for this window — UNKNOWN, never interpolated (R10)."
    elif inv_t and t1_t:
        first_inv, first_t1 = inv_t[0]["bar_open_utc"], t1_t[0]["bar_open_utc"]
        if first_inv == first_t1:
            outcome = "unresolved"
            outcome_note = ("Both barriers touched within the same 1m bar — order "
                            "unknown; outcome UNRESOLVED (R12), never presented as verified OPEN.")
        elif first_inv < first_t1:
            outcome = "invalidation_touched"
            outcome_note = ("Invalidation touched first (bar %s) — under frozen evaluator "
                            "rules this establishes MISS. Late observation; canonical lifecycle "
                            "verdict NOT rewritten." % first_inv)
        else:
            outcome = "target1_touched"
            outcome_note = ("Target1 touched first (bar %s) — under frozen evaluator "
                            "rules this establishes HIT. Late observation; canonical lifecycle "
                            "verdict NOT rewritten." % first_t1)
    elif inv_t:
        outcome = "invalidation_touched"
        outcome_note = ("Invalidation touched (bar %s) — under frozen evaluator rules "
                        "this establishes MISS. Late observation; canonical lifecycle "
                        "verdict NOT rewritten." % inv_t[0]["bar_open_utc"])
    elif t1_t:
        outcome = "target1_touched"
        outcome_note = ("Target1 touched (bar %s) — under frozen evaluator rules this "
                        "establishes HIT. Late observation; canonical lifecycle "
                        "verdict NOT rewritten." % t1_t[0]["bar_open_utc"])
    # R15: positively observed touches stand despite other coverage gaps.

    obs = {
        "observed_at_utc": iso(utc_now_ms()),
        "position_id": pos["id"],
        "symbol": symbol,
        "venue": pos["venue"],
        "direction": pos["direction"],
        "window_from_utc": iso(start_ms),
        "window_to_utc": iso(end_ms),
        "historical_recovery": historical_recovery,
        "bars_fetched": len(bars),
        "bars_eligible": len(eligible),
        "gaps": gaps,
        "spanning_bars": spanning,
        "touches": touches,
        "outcome": outcome,
        "outcome_note": outcome_note,
        "lifecycle_note": ("Lifecycle verdict stays as recorded "
                           "('Entry recorded — current lifecycle unknown'); "
                           "this observation does not rewrite decisions."),
    }
    last_close = max((b["close_ms"] for b in bars), default=None)
    return obs, last_close, len(gaps)


def save_state(state):
    """Atomic state persist (tmp + rename): a killed pass preserves every
    position it completed and never leaves a torn state file (2026-10-22
    repair — previously state was written only at the end of the pass, so a
    timeout discarded all per-position progress)."""
    tmp = STATE_FILE + ".tmp"
    with open(tmp, "w") as f:
        json.dump(state, f, indent=1)
    os.replace(tmp, STATE_FILE)


def main():
    os.makedirs(RUNS_DIR, exist_ok=True)
    only = None
    args = sys.argv[1:]
    if "--position" in args:
        only = args[args.index("--position") + 1]
    positions = load_json(POSITIONS_FILE, [])
    state = load_json(STATE_FILE, {"positions": {}})
    run_ts = iso(utc_now_ms()).replace(":", "").replace("-", "")
    run = {"run_utc": iso(utc_now_ms()), "positions": []}

    for pos in positions:
        if only and pos["id"] != only:
            continue
        se = state["positions"].get(pos["id"], {})
        try:
            obs, last_close, n_gaps = check_position(pos, se, False)
            obs["fetch_ok"] = True
            with open(OBS_FILE, "a") as f:
                f.write(json.dumps(obs) + "\n")
            if last_close:
                se["last_covered_bar_close_ms"] = last_close
                se["last_covered_bar_close_utc"] = iso(last_close)
            se["last_check_utc"] = obs["observed_at_utc"]
            # 2026-10-22 merge repair: state.json last_outcome is the MERGED
            # outcome across all covered intervals (first touch governs, R15).
            # The per-interval obs["outcome"] above must NEVER downgrade an
            # established touch back to no_touch_observed/unknown — that
            # clobbered a settled PHAUSDT target1_touched to no_touch_observed
            # on run-20261022T074541Z. Established touches stand; only the
            # earliest-established touch governs a later touch on the same
            # position (checkpoints only advance forward, so a later-interval
            # touch is necessarily later in time).
            prior_outcome = se.get("last_outcome")
            if (prior_outcome in ("invalidation_touched", "target1_touched", "unresolved")
                    and obs["outcome"] != prior_outcome):
                se["last_outcome_note"] = (
                    "interval outcome %s did not overwrite established %s "
                    "(first-touch stands; merge repair 2026-10-22)" % (obs["outcome"], prior_outcome))
            else:
                se["last_outcome"] = obs["outcome"]
            se["total_gaps_seen"] = se.get("total_gaps_seen", 0) + n_gaps
            state["positions"][pos["id"]] = se
            save_state(state)  # checkpoint per position, not only at pass end
            run["positions"].append({"id": pos["id"], "ok": True,
                                     "outcome": obs["outcome"],
                                     "merged_outcome": se["last_outcome"],
                                     "bars": obs["bars_fetched"],
                                     "gaps": n_gaps,
                                     "touches": len(obs["touches"])})
            print(f"{pos['id']}: outcome={obs['outcome']} bars={obs['bars_fetched']} "
                  f"eligible={obs['bars_eligible']} gaps={n_gaps} touches={len(obs['touches'])}")
        except Exception as e:
            run["positions"].append({"id": pos["id"], "ok": False, "error": str(e)})
            print(f"{pos['id']}: FETCH FAILED: {e}", file=sys.stderr)

    save_state(state)
    run_path = os.path.join(RUNS_DIR, f"run-{run_ts}.json")
    with open(run_path, "w") as f:
        json.dump(run, f, indent=1)
    print("run log:", run_path)


if __name__ == "__main__":
    main()
