#!/usr/bin/env python3
"""TraderSpy prospective caller-ledger pilot — snapshot collector.

Pulls the newest page of TraderSpy signals (GET /v1/signals?limit=50) and one
stats snapshot (GET /v1/signals/stats?period=7d) per run via the registered
connector helper, and appends to ledger.jsonl / stats-snapshots.jsonl:

- For every signal id never seen before: a `first_seen` record carrying OUR
  snapshot timestamp (the prospective anchor), the vendor's createdAt, entry
  price, frozen TP/SL levels (absolute prices computed from the vendor's
  percentages, raw percentages kept alongside), and the vendor fields exactly
  as observed.
- For a known signal whose vendor resolutionStatus changed since the last
  observation: an `observation` record. History is append-only; the
  first-seen record is never overwritten.

Idempotent: a re-run with no new signals and no status changes appends nothing
to the ledger (the stats snapshot is still appended once per run, by design).

Research only. Nothing here feeds issuance, scoring, or any pipeline gate.
"""
import json
import os
import subprocess
import sys
from datetime import datetime, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
HELPER = os.path.expanduser(
    "~/workspace/custom-connectors/custom.traderspy/bin/traderspy.py")
LEDGER = os.path.join(HERE, "ledger.jsonl")
STATS = os.path.join(HERE, "stats-snapshots.jsonl")
SIGNALS_PATH = "/v1/signals?limit=50"
STATS_PATH = "/v1/signals/stats?period=7d"
STATS_PERIOD = "7d"


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def api_get(path: str) -> dict:
    result = subprocess.run(
        ["python3", HELPER, path],
        capture_output=True, text=True, timeout=90)
    if result.returncode != 0:
        raise RuntimeError(
            f"helper failed for {path}: {result.stderr.strip()[:300]}")
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"non-JSON response for {path}: {exc}") from exc


def load_ledger():
    """Return (known_ids, latest_status_by_id) from ledger.jsonl."""
    known, latest = set(), {}
    if os.path.exists(LEDGER):
        with open(LEDGER) as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                rec = json.loads(line)
                sid = rec.get("signal_id")
                if rec.get("record_type") == "first_seen":
                    known.add(sid)
                    latest[sid] = rec.get("vendor_status_at_first_seen")
                elif rec.get("record_type") == "observation":
                    latest[sid] = rec.get("vendor_status")
    return known, latest


def levels_for(signal: dict) -> tuple[dict, dict]:
    """Absolute TP/SL prices from vendor percentages, side-aware.

    buy : TP above entry, SL below.  sell: TP below entry, SL above.
    Missing targets (some signals publish only TP1/TP2) stay None.
    """
    entry = float(signal["price"])
    action = signal["action"]
    pcts = {t["type"]: float(t["pct"]) for t in signal.get("targets", [])}
    levels, raw = {}, {}
    for key in ("tp1", "tp2", "tp3", "sl"):
        if key not in pcts:
            levels[key] = None
            raw[key] = None
            continue
        pct = pcts[key]
        raw[key] = pct
        if key == "sl":
            price = entry * (1 - pct / 100) if action == "buy" else entry * (1 + pct / 100)
        else:
            price = entry * (1 + pct / 100) if action == "buy" else entry * (1 - pct / 100)
        levels[key] = round(price, 12)
    return levels, raw


def append_jsonl(path: str, record: dict) -> None:
    with open(path, "a") as fh:
        fh.write(json.dumps(record) + "\n")


def main() -> int:
    snapshot_at = utcnow_iso()
    try:
        page = api_get(SIGNALS_PATH)
    except RuntimeError as exc:
        print(f"snapshot FAILED: {exc}", file=sys.stderr)
        return 1
    signals = page.get("data")
    if not isinstance(signals, list):
        print("snapshot FAILED: signals response has no data array", file=sys.stderr)
        return 1

    known, latest = load_ledger()
    new_count = 0
    obs_count = 0
    for sig in signals:
        sid = sig.get("id")
        if not sid:
            continue
        status = sig.get("resolutionStatus")
        if sid not in known:
            levels, raw_pcts = levels_for(sig)
            append_jsonl(LEDGER, {
                "record_type": "first_seen",
                "signal_id": sid,
                "symbol": sig.get("coin"),
                "side": sig.get("action"),
                "timeframe": sig.get("timeframe"),
                "importance": sig.get("importance"),
                "strategy_name": sig.get("strategyName"),
                "signal_strength": sig.get("signalStrength"),
                "vendor_created_at": sig.get("createdAt"),
                "snapshot_at": snapshot_at,
                "entry_price": sig.get("price"),
                "levels": levels,
                "levels_pct": raw_pcts,
                "triggered_conditions": sig.get("triggeredConditions"),
                "vendor_status_at_first_seen": status,
                "vendor_raw": sig,
            })
            known.add(sid)
            latest[sid] = status
            new_count += 1
        elif status != latest.get(sid):
            append_jsonl(LEDGER, {
                "record_type": "observation",
                "signal_id": sid,
                "snapshot_at": snapshot_at,
                "vendor_status": status,
                "vendor_raw": sig,
            })
            latest[sid] = status
            obs_count += 1

    # Vendor-claimed stats, tracked prospectively (one snapshot per run).
    try:
        stats = api_get(STATS_PATH)
        append_jsonl(STATS, {
            "snapshot_at": snapshot_at,
            "endpoint": "/v1/signals/stats",
            "period": STATS_PERIOD,
            "response": stats,
        })
        stats_note = "stats snapshot appended"
    except RuntimeError as exc:
        stats_note = f"stats snapshot FAILED ({exc})"

    print(f"snapshot ok at {snapshot_at}: {len(signals)} signals on page, "
          f"{new_count} new first-seen, {obs_count} status observations; "
          f"{stats_note}; ledger ids known: {len(known)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
