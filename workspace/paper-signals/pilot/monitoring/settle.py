#!/usr/bin/env python3
"""
Standing settlement pass for the paper-pilot monitoring store (PAPER ONLY).

Authorized by Logan 2026-10-21 (expert decision relayed): settlement runs on
the existing 30-minute paper-venue-monitor lane. Until now every settlement in
outcomes.jsonl was appended by a one-off directed coordinator pass (F2 pass
2026-10-20, Z9 append 2026-10-21); this script is the standing equivalent.

What it does, per formally-open position in positions.json (a position is open
iff outcomes.jsonl holds NO {"record_type": "settlement"} record for it):

  1. Revalidates the position record: venue must be Binance Spot; level
     ordering must be sane for the direction; the frozen R arithmetic must
     hold (|target1-entry| = 1.50 x risk, |target2-entry| = 2.50 x risk when
     target2 is present, risk = |entry-invalidation|). Any failure -> HOLD,
     logged, nothing appended.
  2. Re-fetches the FULL 1m bar history from entry_observed_at on the original
     venue (data-api.binance.vision, completed bars only) and re-walks it:
     entry-spanning bar excluded (R14), exact TOUCH (R8), wick-or-close (R9).
  3. Coverage must be complete (zero missing bars) from entry through the
     settling bar (or through the 30-day cap for a time_exit). A gap inside
     that window -> settlement stays UNKNOWN: nothing appended, gap recorded
     in the pass log only. Gaps after the settling bar do not block (the walk
     has already stopped).
  4. First touch decides, per the frozen evaluator crypto-evaluation-v5-
     corrected (identical clause in every freeze of the lineage):
       invalidation-first -> invalidated / -1.00R gross
       target1-first      -> target1_hit / +1.50R gross
       (target2 cannot be touched before target1 on the same side; a target2
        touch after the target1 touch is a post-settlement observation.)
       both opposing levels in the SAME 1m bar -> ambiguous (gross R null,
        excluded from hit rate)
       first touch inside the entry-straddling 4h block -> timing_unverified
        (evaluator issuance_boundary clause: terminal, gross R null)
       no touch and now >= entry + 30 days -> time_exit at the cap (gross R
        from the close of the last bar closing at or before the cap instant)
     No second observation is required when the evidence is complete.
  5. Appends ONE settlement record to outcomes.jsonl in the exact field
     conventions of the F2/Z9 settlement records, fsyncs, and re-reads the
     file tail to confirm the durable commit. IDEMPOTENT: a position with a
     settlement record is never settled twice; a re-run appends nothing.

Incremental verification (2026-10-22 monitoring-outage repair): a complete,
gap-free, touch-free full walk records a per-position watermark in
settle-state.json. Later passes scan only the bars after the watermark
(fail-fast, 120s per-position fetch deadline); a clear scan advances the
watermark, a gap/partial/failed fetch holds it, and any detected event is
confirmed by the full-history walk above before a record is appended — so
settlement records and first-touch semantics are exactly unchanged, only
the common-case cost drops from ~50 paged requests to ~2-3 per pass.

Frozen-rule dispatch is per position record: the five pre-auto-enrollment
legacy positions are governed by paper-pilot-v2.1.0 (the F2 precedent);
auto-enrolled positions by the pilot freeze in force at their
entry_observed_at (freeze-v2.1.2/3/4/5.json frozenAt). The settlement
evaluator text is identical across the lineage (mapping-additions-only
deltas, productionHash unchanged), so dispatch changes the citation, never
the math.

Canonical lifecycle records are NEVER touched. This script writes only:
outcomes.jsonl (appends) and runs/settle-<UTC-ts>.json (its pass log).

Usage:
  python3 settle.py [--store-dir DIR] [--dry-run] [--position ID]
                    [--ignore-settled]   (test-only; requires --dry-run)
"""
import json, os, sys, time, urllib.request, urllib.parse
from datetime import datetime, timezone, timedelta

BASE = os.path.dirname(os.path.abspath(__file__))
PILOT_DIR = os.path.dirname(BASE)
BAR_MS = 60_000
BLOCK_MS = 4 * 3600 * 1000  # frozen evaluator's 4h interval semantics
CAP_DAYS = 30
VISION = "https://data-api.binance.vision"
SETTLER_TAG = ("Standing settler — settle.py, paper-venue-monitor lane "
               "(append-only; standing settlement authorized by Logan 2026-10-21)")

SETTLEMENT_RULE_VERBATIM = (
    "invalidation-first -> invalidated/MISS; target1-first -> target/HIT; "
    "both levels touched in one clean block -> AMBIGUOUS (excluded from hit rate). "
    "The walk STOPS at the first touch-or-uncertainty event. Horizon cap: 30 elapsed "
    "days primary; rows still open past the cap exit at the cap (time_exit). Costs: "
    "18 bps round-trip modeled; Net R = gross R - 18 bps.")
COSTS_TEXT = ("18 bps round-trip modeled per the frozen evaluator clause; the contract "
              "states Net R = gross R - 18 bps in its own units \u2014 no converted net "
              "figure asserted here.")
POSITION_TERMS = ("positions.json barrier_rule TOUCH \u2014 completed 1m bar high/low at "
                  "the frozen level counts (monitoring README R8/R9), original venue "
                  "Binance Spot only (R11).")
BARRIER_RULE_TEXT = "TOUCH (bar high/low, completed 1m bars only; R8/R9)"

# The five pre-auto-enrollment legacy positions (positions.json order 1-5),
# governed by paper-pilot-v2.1.0 per the F2 settlement records.
LEGACY_V210_IDS = {
    "paper_00e4b771faf0f29853c5675b",
    "paper_2fdab0335ac447d6baec41d8",
    "paper_2ab8ea0bd8feaa53ff17028d",
    "paper_4fc35efbcec0d6dd055b4b5f",
    "paper_c27656788f1742b9df78555f",
}
LEGACY_CONTRACT = {
    "freeze": ("paper-pilot-v2.1.0 (comparison/freeze-manifest-v2.1.0.json, "
               "frozen_at_utc 2026-10-14T04:57:00Z)"),
    "entry_contract": "actionable-entry-v1",
    "evaluator": ("crypto-evaluation-v5-corrected (freeze manifest "
                  "operational_rules.corrected_evaluator.crypto); pilot signal records "
                  "carry evaluatorVersion paper-target-before-stop-v2.1.0"),
    "settlement_rule_verbatim": SETTLEMENT_RULE_VERBATIM,
    "position_terms": POSITION_TERMS,
}


def iso(ms):
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def iso_frac(ms):
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime(
        "%Y-%m-%dT%H:%M:%S.") + f"{int(ms % 1000):03d}Z"


def parse_iso(s):
    return int(datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp() * 1000)


def load_json(path, default):
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return default


FETCH_DEADLINE_MS = 120_000  # per-position overall fetch deadline (fail-fast)


def fetch_klines(symbol, start_ms, end_ms, deadline_ms=None):
    """Completed 1m bars from data-api.binance.vision (same route as monitor.py).

    Fail-fast (2026-10-22 repair): an overall per-position deadline bounds the
    whole paged fetch; exceeding it raises TimeoutError and the caller HOLDS
    the position for this pass — a slow-dripping response can no longer stretch
    a walk indefinitely."""
    bars = []
    start = start_ms
    while True:
        if deadline_ms is not None and int(time.time() * 1000) > deadline_ms:
            raise TimeoutError(
                f"fetch deadline ({FETCH_DEADLINE_MS}ms) exceeded for {symbol} "
                f"after {len(bars)} bars — position held this pass")
        q = urllib.parse.urlencode({
            "symbol": symbol, "interval": "1m",
            "startTime": start, "endTime": end_ms, "limit": 1000,
        })
        req = urllib.request.Request(VISION + "/api/v3/klines?" + q,
                                     headers={"User-Agent": "paper-venue-settler/1.0"})
        with urllib.request.urlopen(req, timeout=30) as r:
            rows = json.load(r)
        if not rows:
            break
        for row in rows:
            bars.append({
                "open_ms": int(row[0]), "open": float(row[1]),
                "high": float(row[2]), "low": float(row[3]),
                "close": float(row[4]), "close_ms": int(row[6]),
                "trades": int(row[8]),
            })
        if len(rows) < 1000:
            break
        start = int(rows[-1][0]) + BAR_MS
        if start > end_ms:
            break
    now_ms = int(time.time() * 1000)
    bars = [b for b in bars if b["close_ms"] < now_ms]  # completed bars only
    bars.sort(key=lambda b: b["open_ms"])
    return bars


def pilot_freeze_contract(entry_ms):
    """Governing contract for an auto-enrolled position: the pilot freeze in
    force at entry_observed_at. Falls back to None if no freeze file matches."""
    best = None
    for v in ("2.1.2", "2.1.3", "2.1.4", "2.1.5"):
        path = os.path.join(PILOT_DIR, f"freeze-v{v}.json")
        m = load_json(path, None)
        if not m:
            continue
        f = m.get("freeze", m)
        frozen = f.get("frozenAt")
        if not frozen:
            continue
        if parse_iso(frozen) <= entry_ms:
            best = (v, f)
    if best is None:
        return None
    v, f = best
    return {
        "freeze": (f"paper-pilot-v{v} (paper-signals/pilot/freeze-v{v}.json, "
                   f"frozen_at_utc {f.get('frozenAt')}; mapping-additions-only delta "
                   f"over the v2.1.1/v2.1.0 lineage, productionHash "
                   f"b9b3ec39dc5a88f61a0a314ec5b54193a4ebf80529652d07b095269b73c1f979 "
                   f"identical across the lineage, strategy/gates/thresholds/handler "
                   f"2.1.9 and settlement evaluator unchanged)"),
        "entry_contract": "actionable-entry-v1",
        "evaluator": ("crypto-evaluation-v5-corrected (freeze lineage "
                      "operational_rules.corrected_evaluator.crypto, carried unchanged "
                      "from freeze-manifest-v2.1.0.json); pilot signal records carry "
                      "evaluatorVersion paper-target-before-stop-v2.1.0 and "
                      "contractVersion actionable-entry-v1"),
        "settlement_rule_verbatim": SETTLEMENT_RULE_VERBATIM,
        "position_terms": POSITION_TERMS,
    }


def validate_position(pos):
    """Internal-consistency revalidation of the stored record. Returns a list
    of problems (empty = valid)."""
    problems = []
    if pos.get("venue") != "Binance Spot":
        problems.append(f"venue is {pos.get('venue')!r}, not 'Binance Spot'")
    entry, inv = pos.get("entry_price"), pos.get("invalidation")
    t1, t2 = pos.get("target1"), pos.get("target2")
    direction = pos.get("direction")
    if None in (entry, inv, t1) or direction not in ("long", "short"):
        problems.append("missing entry/invalidation/target1 or unknown direction")
        return problems
    risk = abs(entry - inv)
    if risk <= 0:
        problems.append("non-positive risk (entry == invalidation)")
        return problems
    if direction == "long":
        if not (inv < entry < t1):
            problems.append("level ordering wrong for long (need inv < entry < target1)")
        if t2 is not None and not (t1 < t2):
            problems.append("level ordering wrong for long (need target1 < target2)")
    else:
        if not (inv > entry > t1):
            problems.append("level ordering wrong for short (need inv > entry > target1)")
        if t2 is not None and not (t1 > t2):
            problems.append("level ordering wrong for short (need target1 > target2)")
    def close_enough(a, b):
        return abs(a - b) <= 1e-6 * max(abs(a), abs(b), 1e-12)
    if not close_enough(abs(t1 - entry), 1.5 * risk):
        problems.append(f"target1 is not entry +/- 1.50R (|t1-entry|={abs(t1-entry)!r}, "
                        f"1.5R={1.5*risk!r})")
    if t2 is not None and not close_enough(abs(t2 - entry), 2.5 * risk):
        problems.append(f"target2 is not entry +/- 2.50R (|t2-entry|={abs(t2-entry)!r}, "
                        f"2.5R={2.5*risk!r})")
    return problems


def bar_hits(pos, b):
    """Barrier hits for one eligible bar, direction-aware. R8 exact, R9 high/low."""
    hits = set()
    if pos["direction"] == "long":
        if b["low"] <= pos["invalidation"]:
            hits.add("invalidation")
        if b["high"] >= pos["target1"]:
            hits.add("target1")
        if pos.get("target2") is not None and b["high"] >= pos["target2"]:
            hits.add("target2")
    else:
        if b["high"] >= pos["invalidation"]:
            hits.add("invalidation")
        if b["low"] <= pos["target1"]:
            hits.add("target1")
        if pos.get("target2") is not None and b["low"] <= pos["target2"]:
            hits.add("target2")
    return hits


def touch_obj(pos, barrier, b):
    level = pos[barrier]
    if pos["direction"] == "long":
        extreme, side = (b["low"], "low") if barrier == "invalidation" else (b["high"], "high")
    else:
        extreme, side = (b["high"], "high") if barrier == "invalidation" else (b["low"], "low")
    return {"barrier": barrier, "level": level, "bar_open_utc": iso(b["open_ms"]),
            "extreme": extreme, "side": side}


def walk_position(pos, bars, now_ms):
    """Full-history walk. Returns a verdict dict:
    {kind: settled|ambiguous|timing_unverified|time_exit|open|held_gap,
     ... evidence ...}. Pure function of (pos, bars, now_ms)."""
    entry_ms = parse_iso(pos["entry_observed_at"])
    cap_ms = entry_ms + CAP_DAYS * 86400 * 1000
    fetch_floor_ms = (entry_ms // BAR_MS) * BAR_MS

    # Coverage chain over ALL fetched bars (monitor.py semantics).
    gaps = []
    prev_open = None
    for b in bars:
        if prev_open is not None and b["open_ms"] != prev_open + BAR_MS:
            gaps.append({"from_utc": iso(prev_open + BAR_MS),
                         "to_utc": iso(b["open_ms"] - 1),
                         "missing_bars": (b["open_ms"] - prev_open) // BAR_MS - 1})
        prev_open = b["open_ms"]
    leading_gap = bool(bars) and bars[0]["open_ms"] != fetch_floor_ms
    if not bars:
        return {"kind": "held_gap", "reason": "no bars returned at all — no coverage",
                "gaps": gaps, "bars_fetched": 0, "bars_eligible": 0}
    if leading_gap:
        gaps.insert(0, {"from_utc": iso(fetch_floor_ms),
                        "to_utc": iso(bars[0]["open_ms"] - 1),
                        "missing_bars": (bars[0]["open_ms"] - fetch_floor_ms) // BAR_MS})

    eligible, spanning = [], []
    for b in bars:
        if b["close_ms"] <= entry_ms:
            continue  # fully before entry; not evidence
        if b["open_ms"] < entry_ms < b["close_ms"]:
            spanning.append(b)
            continue  # R14
        eligible.append(b)

    block_start = (entry_ms // BLOCK_MS) * BLOCK_MS  # entry-straddling 4h block
    first_touch = {}   # barrier -> (bar, touch_obj)
    event = None       # (bar, hits) of the first bar with any hit
    for b in eligible:
        hits = bar_hits(pos, b)
        for h in hits:
            if h not in first_touch:
                first_touch[h] = (b, touch_obj(pos, h, b))
        if hits and event is None:
            event = (b, hits)

    def gaps_before(end_ms_exclusive):
        """Gaps intersecting [entry, end) — these block a settlement decided at end."""
        out = []
        for g in gaps:
            if parse_iso(g["from_utc"]) < end_ms_exclusive:
                out.append(g)
        return out

    base = {"gaps": gaps, "bars_fetched": len(bars), "bars_eligible": len(eligible),
            "spanning_bar_utc": iso(spanning[0]["open_ms"]) if spanning else None,
            "first_touches": {k: v[1] for k, v in first_touch.items()},
            "cap_utc": iso_frac(cap_ms), "entry_ms": entry_ms, "cap_ms": cap_ms,
            "block_start_ms": block_start,
            "last_covered_close_ms": bars[-1]["close_ms"]}

    if event is not None:
        b, hits = event
        blocking = gaps_before(b["close_ms"])
        if blocking:
            return {**base, "kind": "held_gap",
                    "reason": f"{len(blocking)} coverage gap(s) between entry and the "
                              f"first-touch bar {iso(b['open_ms'])} — ordering cannot "
                              f"be certified; settlement stays UNKNOWN",
                    "event_bar_utc": iso(b["open_ms"])}
        if block_start <= b["open_ms"] < block_start + BLOCK_MS:
            return {**base, "kind": "timing_unverified",
                    "settling_touch": touch_obj(
                        pos, "invalidation" if "invalidation" in hits else "target1", b),
                    "event_bar_utc": iso(b["open_ms"])}
        if "invalidation" in hits and ("target1" in hits or "target2" in hits):
            return {**base, "kind": "ambiguous",
                    "double_touch": {
                        "bar_open_utc": iso(b["open_ms"]),
                        "invalidation": touch_obj(pos, "invalidation", b),
                        "target": touch_obj(
                            pos, "target1" if "target1" in hits else "target2", b)},
                    "settling_touch": touch_obj(pos, "invalidation", b),
                    "event_bar_utc": iso(b["open_ms"])}
        if "invalidation" in hits:
            return {**base, "kind": "settled", "settlement_outcome": "invalidated",
                    "gross_r": -1.0, "settling_touch": touch_obj(pos, "invalidation", b),
                    "event_bar_utc": iso(b["open_ms"])}
        # Same-side targets: target1 is always reached no later than target2.
        return {**base, "kind": "settled", "settlement_outcome": "target1_hit",
                "gross_r": 1.5, "settling_touch": touch_obj(pos, "target1", b),
                "event_bar_utc": iso(b["open_ms"])}

    # No touch anywhere in coverage.
    if now_ms >= cap_ms:
        blocking = gaps_before(cap_ms)
        if blocking:
            return {**base, "kind": "held_gap",
                    "reason": f"past the 30-day cap but {len(blocking)} coverage gap(s) "
                              f"before the cap — time_exit cannot be certified"}
        exit_bar = None
        for b in eligible:
            if b["close_ms"] <= cap_ms:
                exit_bar = b
            else:
                break
        if exit_bar is None:
            return {**base, "kind": "held_gap",
                    "reason": "past the cap but no eligible bar closes at or before it"}
        risk = abs(pos["entry_price"] - pos["invalidation"])
        sign = 1.0 if pos["direction"] == "long" else -1.0
        gross = sign * (exit_bar["close"] - pos["entry_price"]) / risk
        return {**base, "kind": "time_exit", "settlement_outcome": "time_exit",
                "gross_r": gross,
                "exit": {"reason": "horizon_cap_30d", "cap_utc": iso_frac(cap_ms),
                         "exit_price": exit_bar["close"],
                         "exit_bar_open_utc": iso(exit_bar["open_ms"])}}
    return {**base, "kind": "open",
            "coverage_complete": not gaps,
            "reason": "no barrier touch in coverage; horizon cap not reached"}


SETTLE_STATE_FILE = "settle-state.json"


def load_settle_state(store_dir):
    return load_json(os.path.join(store_dir, SETTLE_STATE_FILE), {"positions": {}})


def save_settle_state(store_dir, state):
    """Atomic persist (tmp + rename + fsync): a killed pass never leaves a
    torn watermark file, and a watermark exists on disk only if it was written
    after a complete, gap-free verified walk."""
    path = os.path.join(store_dir, SETTLE_STATE_FILE)
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(state, f, indent=1)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def incremental_scan(pos, watermark_ms, now_ms):
    """Incremental verification from a previously verified watermark
    (2026-10-22 repair). The watermark certifies: complete, gap-free coverage
    from entry through watermark_ms with NO barrier touch. This scan fetches
    only the bars after the watermark and returns one of:
      ("clear", last_close_ms, bars_fetched) — contiguous, gap-free, no touch,
          coverage current: the watermark may advance to last_close_ms.
      ("event", first_event_bar_open_ms) — a barrier was touched (or the
          30-day cap is now crossed with clear coverage): caller MUST confirm
          with the full-history walk before appending any record.
      ("held", reason) — gap, partial coverage, or fetch failure before the
          outcome could be certified: watermark must NOT advance.
    Pure detection layer: it never produces a settlement record itself."""
    entry_ms = parse_iso(pos["entry_observed_at"])
    cap_ms = entry_ms + CAP_DAYS * 86400 * 1000
    deadline = int(time.time() * 1000) + FETCH_DEADLINE_MS
    try:
        bars = fetch_klines(pos["instrument"], watermark_ms + 1, now_ms - 1,
                            deadline_ms=deadline)
    except Exception as e:
        return ("held", f"incremental fetch failed: {e}")
    if not bars:
        if now_ms - watermark_ms <= 120_000:
            # Watermark is current: no new bar has completed yet. Nothing to
            # verify — clear with the watermark unchanged (NOT a hold).
            return ("clear", watermark_ms, 0)
        return ("held", "incremental fetch returned no bars — coverage not advanced")
    if bars[0]["open_ms"] != watermark_ms + 1:
        return ("held", f"incremental coverage does not start at the watermark "
                        f"(first bar {iso(bars[0]['open_ms'])}, expected "
                        f"{iso(watermark_ms + 1)}) — watermark not advanced")
    prev_open = None
    for b in bars:
        if prev_open is not None and b["open_ms"] != prev_open + BAR_MS:
            return ("held", f"coverage gap in incremental window at "
                            f"{iso(prev_open + BAR_MS)} — watermark not advanced")
        prev_open = b["open_ms"]
        if bar_hits(pos, b):
            return ("event", b["open_ms"])
    last_close = bars[-1]["close_ms"]
    if now_ms - last_close > 180_000:
        return ("held", f"incremental coverage ends at {iso(last_close)}, more "
                        f"than 180s before now — partial fetch suspected; "
                        f"watermark not advanced")
    if now_ms >= cap_ms and last_close >= cap_ms - 1:
        return ("event", cap_ms)  # cap crossed on clear coverage — full walk decides time_exit
    return ("clear", last_close, len(bars))


def hours_between(a_ms, b_ms):
    return (b_ms - a_ms) / 3600000.0


def build_record(pos, verdict, contract, recorded_at):
    entry_ms = verdict["entry_ms"]
    risk = abs(pos["entry_price"] - pos["invalidation"])
    t1 = pos["target1"]
    t2 = pos.get("target2")
    arith = (f"target1 - entry = {abs(t1 - pos['entry_price'])!r} = 1.50 x "
             f"(risk = {risk!r})" if pos["direction"] == "long" else
             f"entry - target1 = {abs(t1 - pos['entry_price'])!r} = 1.50 x "
             f"(risk = {risk!r})")
    if t2 is not None:
        arith += f"; target2 at 2.50R = {abs(t2 - pos['entry_price'])!r}"
    else:
        arith += "; target2 is null for this position"
    cov = (f"gap-free original-venue coverage (standing settler full-history walk: "
           f"{verdict['bars_fetched']} bars fetched / {verdict['bars_eligible']} eligible "
           f"from entry_observed_at, 0 gaps between entry and the settling event"
           + (f", entry-spanning bar {verdict['spanning_bar_utc']} excluded per R14"
              if verdict["spanning_bar_utc"] else "") + ")")
    block_lo = iso(verdict["block_start_ms"])
    block_hi = iso(verdict["block_start_ms"] + BLOCK_MS)
    kind = verdict["kind"]
    rec = {
        "record_type": "settlement",
        "position_id": pos["id"],
        "symbol": pos["instrument"],
        "direction": pos["direction"],
        "venue": pos["venue"],
        "entry_price": pos["entry_price"],
        "entry_observed_at": pos["entry_observed_at"],
        "frozen_levels": {"invalidation": pos["invalidation"], "target1": t1,
                          "target2": t2},
        "barrier_rule": BARRIER_RULE_TEXT,
    }
    if kind == "settled":
        st = verdict["settling_touch"]
        rec["settlement_outcome"] = verdict["settlement_outcome"]
        rec["settled"] = True
        rec["settling_touch"] = st
        rec["governing_contract"] = contract
        rec["gross_r"] = verdict["gross_r"]
        rec["costs"] = COSTS_TEXT
        hrs = hours_between(entry_ms, parse_iso(st["bar_open_utc"] + ""))
        barrier_word = "Invalidation" if st["barrier"] == "invalidation" else "Target1"
        outcome_word = ("MISS" if st["barrier"] == "invalidation" else "HIT")
        later = []
        for other in ("invalidation", "target1", "target2"):
            ft = verdict["first_touches"].get(other)
            if ft and ft["bar_open_utc"] != st["bar_open_utc"]:
                later.append(f"{other} first touched after settlement "
                             f"(bar open {ft['bar_open_utc']})")
        later_txt = (" " + "; ".join(later) + " — post-settlement observation(s); the "
                     "walk stops at the first touch, so they do not convert the outcome."
                     if later else
                     " No other barrier was touched anywhere in coverage through "
                     f"{iso(verdict['last_covered_close_ms'])}.")
        t2_note = ""
        if pos.get("target2_source"):
            t2_note = (f" positions.json flags this position's target2 "
                       f"({t2!r}) via target2_source = {pos['target2_source']!r} "
                       f"(not in the canonical signal record); settlement does not "
                       f"depend on target2 — the walk stops at the first touch.")
        rec["note"] = (
            f"{barrier_word} touched FIRST (bar open {st['bar_open_utc']}, bar "
            f"{st['side']} {st['extreme']!r} vs frozen {st['barrier']} {st['level']!r}), "
            f"~{hrs:.2f}h after entry, on {cov}. First-touch rule: settled at "
            f"{st['barrier']} at that bar, {verdict['gross_r']:+.2f}R gross "
            f"(arithmetic verified from the canonical levels: {arith}).{later_txt} "
            f"No ambiguity: the settling bar is single-barrier, and under the frozen "
            f"evaluator's 4h interval semantics the touch sits in a clean post-entry "
            f"block; the entry-straddling block ({block_lo} to {block_hi}) contains "
            f"no touch in eligible coverage. Touch is inside the 30-day horizon cap "
            f"(cap {verdict['cap_utc']}).{t2_note}")
        rec["closure_status"] = (
            "SETTLED under the frozen first-touch evaluator rule, recorded in this "
            "outcomes ledger only (Logan's rule, 2026-10-20). Canonical lifecycle "
            "records are untouched; the earlier touch records in this file stay as "
            "written. Settlement appended by the standing settler (settle.py) under "
            "the 2026-10-21 standing-settlement authorization.")
    elif kind == "ambiguous":
        dt = verdict["double_touch"]
        rec["settlement_outcome"] = "ambiguous"
        rec["settled"] = True
        rec["settling_touch"] = verdict["settling_touch"]
        rec["double_touch"] = dt
        rec["governing_contract"] = contract
        rec["gross_r"] = None
        rec["costs"] = COSTS_TEXT
        rec["note"] = (
            f"Both opposing levels touched within the same 1m bar "
            f"(bar open {dt['bar_open_utc']}: invalidation {dt['invalidation']['level']!r} "
            f"via bar {dt['invalidation']['side']} {dt['invalidation']['extreme']!r}; "
            f"target {dt['target']['level']!r} via bar {dt['target']['side']} "
            f"{dt['target']['extreme']!r}) on {cov}. Intra-bar order is unknowable from "
            f"1m bars: AMBIGUOUS under the frozen evaluator (excluded from hit rate). "
            f"Arithmetic verified from the canonical levels: {arith}.")
        rec["closure_status"] = (
            "SETTLED as AMBIGUOUS under the frozen first-touch evaluator rule "
            "(excluded from hit rate), recorded in this outcomes ledger only "
            "(Logan's rule, 2026-10-20). Canonical lifecycle records are untouched. "
            "Settlement appended by the standing settler (settle.py) under the "
            "2026-10-21 standing-settlement authorization.")
    elif kind == "timing_unverified":
        st = verdict["settling_touch"]
        rec["settlement_outcome"] = "timing_unverified"
        rec["settled"] = True
        rec["settling_touch"] = st
        rec["governing_contract"] = contract
        rec["gross_r"] = None
        rec["costs"] = COSTS_TEXT
        rec["note"] = (
            f"First touch (bar open {st['bar_open_utc']}, {st['barrier']} "
            f"{st['level']!r}, bar {st['side']} {st['extreme']!r}) falls inside the "
            f"entry-straddling 4h block ({block_lo} to {block_hi}). Under the frozen "
            f"evaluator's issuance_boundary clause a touch inside the straddling block "
            f"is TIMING-UNVERIFIED (terminal — the touch cannot be ordered against "
            f"issuance from the evaluator's interval evidence), excluded from hit "
            f"rate. Coverage to the touch was {cov}. Arithmetic verified: {arith}.")
        rec["closure_status"] = (
            "SETTLED as TIMING-UNVERIFIED under the frozen evaluator rule (excluded "
            "from hit rate), recorded in this outcomes ledger only (Logan's rule, "
            "2026-10-20). Canonical lifecycle records are untouched. Settlement "
            "appended by the standing settler (settle.py) under the 2026-10-21 "
            "standing-settlement authorization.")
    elif kind == "time_exit":
        ex = verdict["exit"]
        rec["settlement_outcome"] = "time_exit"
        rec["settled"] = True
        rec["exit"] = ex
        rec["governing_contract"] = contract
        rec["gross_r"] = verdict["gross_r"]
        rec["costs"] = COSTS_TEXT
        rec["note"] = (
            f"No barrier touch in complete coverage from entry through the 30-day "
            f"horizon cap ({ex['cap_utc']}) — {verdict['bars_fetched']} bars fetched / "
            f"{verdict['bars_eligible']} eligible, 0 gaps. Per the frozen contract the "
            f"row exits at the cap (time_exit): exit price {ex['exit_price']!r} = close "
            f"of the last bar closing at or before the cap (bar open "
            f"{ex['exit_bar_open_utc']}); gross R = {verdict['gross_r']!r} from entry "
            f"{pos['entry_price']!r} and risk {risk!r}. Arithmetic verified: {arith}.")
        rec["closure_status"] = (
            "SETTLED as time_exit under the frozen first-touch evaluator rule, "
            "recorded in this outcomes ledger only (Logan's rule, 2026-10-20). "
            "Canonical lifecycle records are untouched. Settlement appended by the "
            "standing settler (settle.py) under the 2026-10-21 "
            "standing-settlement authorization.")
    rec["recorded_at_utc"] = recorded_at
    rec["recorded_by"] = SETTLER_TAG
    return rec


def main():
    args = sys.argv[1:]
    store_dir = BASE
    if "--store-dir" in args:
        store_dir = args[args.index("--store-dir") + 1]
    dry_run = "--dry-run" in args
    ignore_settled = "--ignore-settled" in args
    only = None
    if "--position" in args:
        only = args[args.index("--position") + 1]
    if ignore_settled and not dry_run:
        print("REFUSED: --ignore-settled is test-only and requires --dry-run",
              file=sys.stderr)
        return 2

    positions_path = os.path.join(store_dir, "positions.json")
    outcomes_path = os.path.join(store_dir, "outcomes.jsonl")
    positions = load_json(positions_path, [])
    settled_ids = set()
    if os.path.exists(outcomes_path):
        with open(outcomes_path) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                r = json.loads(line)
                if r.get("record_type") == "settlement" and r.get("position_id"):
                    settled_ids.add(r["position_id"])

    now_ms = int(time.time() * 1000)
    recorded_at = iso(now_ms)
    run = {"run_utc": recorded_at, "mode": "dry-run" if dry_run else "live",
           "store_dir": store_dir, "positions": [], "appended": []}
    settle_state = load_settle_state(store_dir)
    state_dirty = False

    for pos in positions:
        pid = pos["id"]
        if only and pid != only:
            continue
        entry_ms = parse_iso(pos["entry_observed_at"])
        if pid in settled_ids and not ignore_settled:
            run["positions"].append({"id": pid, "action": "already_settled"})
            print(f"{pid}: already settled — skipped (idempotent)")
            continue
        problems = validate_position(pos)
        if problems:
            run["positions"].append({"id": pid, "action": "held_validation",
                                     "problems": problems})
            print(f"{pid}: HELD (validation): {'; '.join(problems)}")
            continue
        contract = (LEGACY_CONTRACT if pid in LEGACY_V210_IDS
                    else pilot_freeze_contract(entry_ms))
        if contract is None:
            run["positions"].append({"id": pid, "action": "held_validation",
                                     "problems": ["no governing freeze found for entry time"]})
            print(f"{pid}: HELD (validation): no governing freeze for entry time")
            continue
        # Incremental fast path (2026-10-22 repair): if a verified watermark
        # exists beyond the entry-straddling 4h block, scan only the bars
        # after it. "clear" advances the watermark without a full re-walk;
        # "held" leaves the watermark untouched; a detected "event" falls
        # through to the full-history walk below, which alone appends records.
        wm = settle_state.get("positions", {}).get(pid, {}).get(
            "last_verified_close_ms")
        block_start = (entry_ms // BLOCK_MS) * BLOCK_MS
        if wm is not None and wm >= block_start + BLOCK_MS:
            scan = incremental_scan(pos, wm, now_ms)
            if scan[0] == "clear":
                _, last_close, n_bars = scan
                settle_state.setdefault("positions", {})[pid] = {
                    "last_verified_close_ms": last_close,
                    "updated_at_utc": recorded_at}
                state_dirty = True
                run["positions"].append({
                    "id": pid, "action": "open_no_touch",
                    "walk_mode": "incremental",
                    "coverage_complete": True, "gaps": 0,
                    "bars_fetched": n_bars,
                    "last_covered_close_utc": iso(last_close),
                    "watermark_advanced_from_utc": iso(wm)})
                print(f"{pid}: open — no touch (incremental, bars={n_bars}, "
                      f"watermark -> {iso(last_close)})")
                continue
            if scan[0] == "held":
                run["positions"].append({
                    "id": pid, "action": "held_fetch",
                    "walk_mode": "incremental", "reason": scan[1],
                    "watermark_utc": iso(wm)})
                print(f"{pid}: HELD (incremental): {scan[1]}")
                continue
            print(f"{pid}: incremental scan detected an event at "
                  f"{iso(scan[1])} — confirming with full-history walk")
        fetch_start = (entry_ms // BAR_MS) * BAR_MS
        try:
            bars = fetch_klines(pos["instrument"], fetch_start, now_ms - 1,
                                deadline_ms=int(time.time() * 1000)
                                + FETCH_DEADLINE_MS)
        except Exception as e:
            run["positions"].append({"id": pid, "action": "error", "error": str(e)})
            print(f"{pid}: FETCH FAILED: {e}", file=sys.stderr)
            continue
        verdict = walk_position(pos, bars, now_ms)
        kind = verdict["kind"]
        if kind == "open":
            if verdict["coverage_complete"]:
                settle_state.setdefault("positions", {})[pid] = {
                    "last_verified_close_ms": verdict["last_covered_close_ms"],
                    "updated_at_utc": recorded_at}
                state_dirty = True
            run["positions"].append({
                "id": pid, "action": "open_no_touch", "walk_mode": "full",
                "coverage_complete": verdict["coverage_complete"],
                "gaps": len(verdict["gaps"]),
                "bars_fetched": verdict["bars_fetched"],
                "last_covered_close_utc": iso(verdict["last_covered_close_ms"])})
            print(f"{pid}: open — no touch (bars={verdict['bars_fetched']}, "
                  f"gaps={len(verdict['gaps'])})")
            continue
        if kind == "held_gap":
            run["positions"].append({"id": pid, "action": "held_gap",
                                     "reason": verdict["reason"],
                                     "gaps": verdict["gaps"],
                                     "bars_fetched": verdict["bars_fetched"]})
            print(f"{pid}: HELD (gap): {verdict['reason']}")
            continue
        # Settlement-class verdict: build the record.
        rec = build_record(pos, verdict, contract, recorded_at)
        if dry_run:
            run["positions"].append({"id": pid, "action": "would_append",
                                     "settlement_outcome": rec["settlement_outcome"],
                                     "gross_r": rec["gross_r"],
                                     "record": rec})
            run["appended"].append(rec)
            print(f"{pid}: WOULD APPEND {rec['settlement_outcome']} "
                  f"gross_r={rec['gross_r']}")
            continue
        line = json.dumps(rec)
        with open(outcomes_path, "a") as f:
            f.write(line + "\n")
            f.flush()
            os.fsync(f.fileno())
        # Durable-commit verification: re-read the tail and parse it back.
        with open(outcomes_path) as f:
            tail = f.readlines()[-1]
        committed = json.loads(tail)
        assert committed["position_id"] == pid and \
            committed.get("record_type") == "settlement", "commit read-back mismatch"
        settled_ids.add(pid)
        run["positions"].append({"id": pid, "action": "appended",
                                 "settlement_outcome": rec["settlement_outcome"],
                                 "gross_r": rec["gross_r"],
                                 "settling_touch": rec.get("settling_touch"),
                                 "commit_verified": True})
        run["appended"].append(rec)
        print(f"{pid}: APPENDED {rec['settlement_outcome']} gross_r={rec['gross_r']} "
              f"(commit verified)")

    if state_dirty and not dry_run:
        save_settle_state(store_dir, settle_state)
    runs_dir = os.path.join(store_dir, "runs")
    os.makedirs(runs_dir, exist_ok=True)
    run_ts = recorded_at.replace(":", "").replace("-", "")
    log_path = os.path.join(runs_dir, f"settle-{run_ts}.json")
    if not dry_run:
        with open(log_path, "w") as f:
            json.dump(run, f, indent=1)
    print(f"settler pass complete: {len(run['appended'])} appended"
          + (" (dry-run)" if dry_run else f"; log: {log_path}"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
