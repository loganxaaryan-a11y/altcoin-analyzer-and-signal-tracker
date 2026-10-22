#!/usr/bin/env python3
"""
Shared research market-data cache — Hyperliquid public reads.

Sources (verified live 2026-10-19 from this runtime):
  - metaAndAssetCtxs: 234 instruments/contexts; field-complete for BTC/ETH/HYPE/SUI
    (markPx, midPx, oraclePx, funding, openInterest, premium, dayNtlVlm).
  - candleSnapshot: 169 contiguous 1h BTC candles over 7d, 3,600,000ms apart.
  - allMids: all perp mids.
  - fundingHistory: 47 hourly points (verified earlier).

What is cached per refresh: prices (mids), completed candles, volume, funding,
open interest. The FORMING bar is excluded from completed calculations and
labeled as forming. Deterministic completed-bar cadence: only bars whose
close time is strictly before the refresh receipt time count as completed.

Instrument identity is preserved end-to-end: perp vs spot, venue
(Hyperliquid perp), quote currency (USD/USDC), price type (mark/mid/oracle),
source observation time vs cache receipt time. This cache is NEVER spliced
into Binance spot settlement evidence for paper entries.

Funding/OI history: the series files begin at the FIRST collected snapshot.
They do not establish pre-collection trends and say so in their headers.

Usage: python3 hl_cache.py
"""
import http.client
import json, os, sys, time, urllib.request, urllib.error
from datetime import datetime, timezone

BASE = os.path.dirname(os.path.abspath(__file__))
SNAP_DIR = os.path.join(BASE, "snapshots")
SERIES_DIR = os.path.join(BASE, "series")
STATE_FILE = os.path.join(BASE, "state.json")
HL = "https://api.hyperliquid.xyz"

# Bounded instrument list: paper-relevant + majors. Perp coin names on Hyperliquid.
INSTRUMENTS = ["BTC", "ETH", "HYPE", "NEAR", "SOL", "SUI"]
CANDLE_INTERVAL = "1h"
CANDLE_LOOKBACK_MS = 7 * 24 * 3600 * 1000


def post(payload, retries=3):
    body = json.dumps(payload).encode()
    last_exc = None
    for attempt in range(retries):
        req = urllib.request.Request(
            HL + "/info", data=body,
            headers={"Content-Type": "application/json",
                     "User-Agent": "research-marketdata-cache/1.0",
                     "Connection": "close"})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.load(r)
        except (http.client.HTTPException, urllib.error.URLError) as e:
            # Transient transport failure: Hyperliquid intermittently closes
            # the connection early (IncompleteRead) or before responding.
            last_exc = e
            time.sleep(1)
    # Fallback: curl reliably completes this response from this environment.
    import subprocess
    try:
        out = subprocess.run(
            ["curl", "-s", "-m", "30", "-X", "POST", HL + "/info",
             "-H", "Content-Type: application/json",
             "-H", "Connection: close", "-d", body.decode("utf-8")],
            capture_output=True, timeout=40, check=True)
        return json.loads(out.stdout)
    except Exception as curl_exc:
        if last_exc is not None:
            raise last_exc from curl_exc
        raise


def iso(ms):
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def main():
    os.makedirs(SNAP_DIR, exist_ok=True)
    os.makedirs(SERIES_DIR, exist_ok=True)
    receipt_ms = int(time.time() * 1000)
    receipt_utc = iso(receipt_ms)
    ts = receipt_utc.replace(":", "").replace("-", "")

    # 1. metaAndAssetCtxs: full context table (one request), keyed by coin.
    meta, ctxs = post({"type": "metaAndAssetCtxs"})
    universe = meta.get("universe", [])
    contexts = {}
    for u, c in zip(universe, ctxs):
        contexts[u["name"]] = {
            "markPx": c.get("markPx"), "midPx": c.get("midPx"),
            "oraclePx": c.get("oraclePx"), "funding": c.get("funding"),
            "openInterest": c.get("openInterest"), "premium": c.get("premium"),
            "dayNtlVlm": c.get("dayNtlVlm"), "prevDayPx": c.get("prevDayPx"),
            "dayBaseVlm": c.get("dayBaseVlm"),
        }

    # 2. allMids: all perp mids (one request).
    mids = post({"type": "allMids"})

    snapshot = {
        "receipt_time_utc": receipt_utc,
        "source": "Hyperliquid public /info",
        "venue": "Hyperliquid",
        "market_type": "perp",
        "quote_currency": "USD",
        "note": ("Source observation time vs receipt time: Hyperliquid responses do "
                 "not carry per-field observation timestamps; the values are as of "
                 "the request. receipt_time_utc is when this cache fetched them."),
        "contexts": {k: contexts[k] for k in INSTRUMENTS if k in contexts},
        "mids": {k: mids.get(k) for k in INSTRUMENTS},
        "candles": {},
        "funding_history": {},
    }
    missing = [k for k in INSTRUMENTS if k not in contexts]
    if missing:
        snapshot["instruments_not_listed"] = missing

    for coin in INSTRUMENTS:
        if coin not in contexts:
            continue
        # 3. candleSnapshot: completed bars only; forming bar labeled, excluded.
        start_ms = receipt_ms - CANDLE_LOOKBACK_MS
        candles = post({"type": "candleSnapshot",
                        "req": {"coin": coin, "interval": CANDLE_INTERVAL,
                                "startTime": start_ms, "endTime": receipt_ms}})
        completed, forming = [], None
        for c in candles:
            bar = {"open_ms": c["t"], "open_utc": iso(c["t"]),
                   "open": c["o"], "high": c["h"], "low": c["l"],
                   "close": c["c"], "volume": c["v"]}
            if c["t"] + 3600_000 <= receipt_ms:
                completed.append(bar)
            else:
                forming = dict(bar, label="forming bar — excluded from completed calculations")
        snapshot["candles"][coin] = {
            "interval": CANDLE_INTERVAL,
            "completed_bars": len(completed),
            "completed": completed,
            "forming": forming,
        }
        # 4. fundingHistory: hourly points.
        fh = post({"type": "fundingHistory", "coin": coin,
                   "startTime": start_ms, "endTime": receipt_ms})
        snapshot["funding_history"][coin] = [
            {"time_utc": iso(p["time"]), "fundingRate": p.get("fundingRate"),
             "premium": p.get("premium")}
            for p in fh
        ]

    # Persist snapshot.
    snap_path = os.path.join(SNAP_DIR, f"snapshot-{ts}.json")
    with open(snap_path, "w") as f:
        json.dump(snapshot, f, indent=1)

    # 5. Append funding/OI series (history starts at first collected snapshot).
    prev_state = {}
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE) as f:
            prev_state = json.load(f)
    changes = {}
    for coin in INSTRUMENTS:
        if coin not in contexts:
            continue
        ctx = contexts[coin]
        for series, value in (("funding", ctx.get("funding")),
                              ("oi", ctx.get("openInterest"))):
            spath = os.path.join(SERIES_DIR, f"{series}-{coin}.jsonl")
            first = not os.path.exists(spath)
            with open(spath, "a") as f:
                if first:
                    f.write("# SERIES HISTORY STARTS AT FIRST COLLECTED SNAPSHOT. "
                            "These points do not establish pre-collection funding/OI trends.\n")
                f.write(json.dumps({"t_utc": receipt_utc, "value": value}) + "\n")
        pk = prev_state.get("prev", {}).get(coin, {})
        ch = {}
        for field in ("midPx", "markPx", "funding", "openInterest", "dayNtlVlm"):
            old, new = pk.get(field), ctx.get(field)
            if old != new:
                ch[field] = {"was": old, "now": new}
        if ch:
            changes[coin] = ch

    # 6. Wallet positioning (Batch 4b phase 2, additive): top traders from the
    # public leaderboard, their clearinghouseState positions in board coins.
    # Fail-soft: any failure is recorded honestly and never breaks the cache run.
    wallets_status = {"ok": False}
    try:
        lb_req = urllib.request.Request(
            "https://stats-data.hyperliquid.xyz/Mainnet/leaderboard",
            headers={"User-Agent": "research-marketdata-cache/1.0"})
        with urllib.request.urlopen(lb_req, timeout=30) as r:
            lb = json.load(r)
        rows = lb.get("leaderboardRows", [])

        def month_pnl(row):
            for name, perf in row.get("windowPerformances", []):
                if name == "month":
                    return float(perf.get("pnl") or 0)
            return 0.0

        rows.sort(key=month_pnl, reverse=True)
        traders = []
        for row in rows[:30]:
            addr = row.get("ethAddress")
            if not addr:
                continue
            try:
                st = post({"type": "clearinghouseState", "user": addr})
            except Exception:
                continue
            positions = []
            for ap in st.get("assetPositions", []):
                p = ap.get("position", {})
                coin = p.get("coin")
                if coin not in INSTRUMENTS:
                    continue
                lev = p.get("leverage") or {}
                positions.append({
                    "coin": coin, "szi": p.get("szi"),
                    "entryPx": p.get("entryPx"),
                    "liquidationPx": p.get("liquidationPx"),
                    "unrealizedPnl": p.get("unrealizedPnl"),
                    "positionValue": p.get("positionValue"),
                    "leverage": lev.get("value"), "leverageType": lev.get("type"),
                })
            traders.append({
                "address": addr,
                "displayName": row.get("displayName"),
                "accountValue": row.get("accountValue"),
                "monthPnl": month_pnl(row),
                "positions": positions,
            })
        wallets = {
            "receipt_time_utc": receipt_utc,
            "source": "Hyperliquid public leaderboard + clearinghouseState",
            "venue": "Hyperliquid",
            "note": ("Top 30 leaderboard wallets by trailing-month PnL at fetch "
                     "time; positions filtered to the board instruments. "
                     "Point-in-time snapshot; wallets enter/leave the top 30 "
                     "between snapshots."),
            "traders": traders,
        }
        wname = f"wallets-{ts}.json"
        with open(os.path.join(SNAP_DIR, wname), "w") as f:
            json.dump(wallets, f, indent=1)
        wallets_status = {"ok": True, "file": wname, "traders": len(traders),
                          "with_board_positions":
                          sum(1 for t in traders if t["positions"])}
        # Prune wallet snapshots on the same 96-file horizon as snapshots.
        wfiles = sorted(f for f in os.listdir(SNAP_DIR) if f.startswith("wallets-"))
        for old in wfiles[:-96]:
            os.remove(os.path.join(SNAP_DIR, old))
    except Exception as e:
        wallets_status = {"ok": False, "error": f"{type(e).__name__}: {e}"}
    state = {"last_refresh_utc": receipt_utc,
             "last_snapshot": os.path.basename(snap_path),
             "instruments": [k for k in INSTRUMENTS if k in contexts],
             "instruments_not_listed": missing,
             "wallet_positioning": wallets_status,
             "prev": {k: contexts[k] for k in INSTRUMENTS if k in contexts},
             "changes_since_last_refresh": changes}
    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=1)

    # Prune snapshots: keep last 96 (48h at 30m cadence).
    snaps = sorted(os.listdir(SNAP_DIR))
    for old in snaps[:-96]:
        os.remove(os.path.join(SNAP_DIR, old))

    summary = {
        "receipt_utc": receipt_utc, "snapshot": os.path.basename(snap_path),
        "instruments": state["instruments"], "not_listed": missing,
        "changes": {k: list(v) for k, v in changes.items()},
    }
    print(json.dumps(summary, indent=1))
    print("snapshot:", snap_path)

    # OpenBB parser-library ride-along (Batch 4b fold-in): fail-soft, and the
    # collector self-throttles to a 6h staleness window, so most ticks skip.
    try:
        import subprocess
        venv_py = os.path.expanduser("~/workspace/tools/openbb-venv/bin/python")
        layer = os.path.join(BASE, "openbb_layer.py")
        if os.path.exists(venv_py) and os.path.exists(layer):
            subprocess.run([venv_py, layer], capture_output=True, timeout=1500)
    except Exception:
        pass


if __name__ == "__main__":
    main()
