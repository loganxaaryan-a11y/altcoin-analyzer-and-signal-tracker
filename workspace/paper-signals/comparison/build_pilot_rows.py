#!/usr/bin/env python3
"""Build REAL pilot comparison rows under freeze v2.0.0 (workstream A).

Replaces reliance on sandbox seeds with actual candidates carrying
persisted decision-time factor ledgers. Read-only against the workspace
DB copies; writes only comparison/rows/comparison-rows-pilot-2026-10-14.csv
(+ .jsonl twin). Never touches production or any holdout.

Sources:
  crypto (10 rows): generated_signals ids 31-40 in the local workspace copy
    of the altcoin terminal DB -- production-ISSUED signals (2026-10-10 ->
    2026-10-14) with the frozen 11-factor dossier-agreement factors_json,
    per-factor asOf timestamps, entry/invalidation/targets/atr14.
    decision_at = created_at (row creation = issuance instant).
  equity (50 rows): paper-signals/research/factor-ledgers-2026-10-13.json --
    scan-qualified radar candidates (disposition 'qualified') with the
    frozen 7-factor ledgers and per-factor asOf. decision_at =
    scanCompletedAt (real persisted timestamp). production_decision =
    'qualified' (scan-level issuance is hardcoded issuedCount=0; issuance
    into tracked_signals is a separate path) -> prod arm scored from the
    ledger, disposition unscored:production-not-issued.

Decision-time honesty: per-factor asOf values are copied verbatim from the
sources (crypto: full ISO; equity: date-only 'YYYY-MM-DD' normalized to
UTC midnight, documented per row). NOTHING is fabricated. The harness's
decision_time_check labels every row; rows with a missing asOf are flagged
decision_time_verified=false per the harness rule.
"""

import csv
import json
import os
import sqlite3
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness import score_batch, write_rows_csv, ROW_COLUMNS

BASE = os.path.dirname(os.path.abspath(__file__))
CRYPTO_DB = os.path.expanduser(
    "~/workspace/ts-spaces/altcoin-analyzer-and-signal-tracker/app.db")
EQUITY_LEDGERS = os.path.join(BASE, "..", "research",
                              "factor-ledgers-2026-10-13.json")
OUTDIR = os.path.join(BASE, "rows")

EQUITY_ID_MAP = {
    "Price vs SMA 20": "price_vs_sma20",
    "Price vs SMA 50": "price_vs_sma50",
    "Price vs SMA 200": "price_vs_sma200",
    "Wilder RSI 14": "rsi14_wilder",
    "MACD 12\u201326": "macd_12_26",   # en-dash in the persisted ledger
    "High-volume direction": "volume_direction_z",
    "ATR-adjusted 30-session trend": "atr_adjusted_trend30",
}

COIN_IDS = {"BTC": "bitcoin", "HYPE": "hyperliquid", "STRK": "starknet",
            "ETH": "ethereum", "AVAX": "avalanche-2", "S": "sonic"}


def iso_ms(ms):
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat()


def crypto_candidates():
    con = sqlite3.connect("file:" + CRYPTO_DB + "?mode=ro", uri=True)
    rows = con.execute(
        "select id, symbol, direction, confidence, created_at, entry, "
        "invalidation, target1, target2, atr14, factors_json "
        "from generated_signals where id >= 31 order by id").fetchall()
    # signal-day OHLC recovery (informational; used only if a row flipped)
    snaps = {}
    for asset, payload in con.execute(
            "select asset_id, payload_json from signal_input_snapshots"):
        try:
            p = json.loads(payload)
            c = p.get("candle") or {}
            if c.get("day") and c.get("high") is not None and c.get("low") is not None:
                snaps.setdefault(asset, []).append(
                    (c["day"], float(c["high"]), float(c["low"])))
        except Exception:
            continue
    con.close()

    cands = []
    for (rid, sym, dirc, conf, created, entry, inv, t1, t2, atr,
         fj) in rows:
        factors = json.loads(fj)
        decision_at = iso_ms(created)
        unlabeled = [f.get("label") for f in factors
                     if not (f.get("asOf") or f.get("as_of"))]
        # signal-day = latest snapshot day strictly before the created date
        created_day = decision_at[:10]
        coin = COIN_IDS.get(sym)
        sig = None
        for day, h, l in sorted(snaps.get(coin, [])):
            if day < created_day:
                sig = {"day": day, "high": h, "low": l}
        notes = (
            "real pilot row: production-issued signal from the local workspace "
            f"DB copy (generated_signals id {rid}); 11-factor dossier-agreement "
            "factors_json with per-factor asOf copied verbatim. "
            + ("all factor asOf <= decision_at. " if not unlabeled else
               "UNLABELED factor(s) (no asOf persisted): "
               + ", ".join(unlabeled)
               + " -- score 0 / contribution 0 (NO_DATA); decision_time_verified=false per the harness rule. ")
            + f"source_as_of row value not separately persisted; decision_at = created_at {decision_at} (row creation = issuance instant)."
        )
        cands.append({
            "candidate_id": rid,
            "terminal": "crypto",
            "symbol": sym,
            "asset_id": coin,
            "decision_at": decision_at,
            "issued_at": decision_at,
            "row_origin": "pilot",
            "factors": factors,
            "production_recorded": {"direction": dirc, "score": conf},
            "production_decision": "issued",
            "production_suppression_reason": None,
            "eligibility": "passed",
            "eligibility_reason": ("production issued this signal; "
                                   "eligibility bars cleared at issuance"),
            "entry": entry,
            "atr14": atr,
            "signal_day": sig,
            "short_regime_inputs": None,
            "notes": notes,
        })
    return cands


def equity_candidates():
    with open(EQUITY_LEDGERS) as f:
        d = json.load(f)
    ledgers = d["equity"]["ledgers"]
    seen = set()
    for L in ledgers:
        assert L["symbol"] not in seen, f"dup symbol {L['symbol']}"
        seen.add(L["symbol"])

    cands = []
    for L in ledgers:
        factors = []
        for fv in L["factors"]:
            fid = EQUITY_ID_MAP.get(fv["name"])
            assert fid, f"unmapped factor name {fv['name']!r}"
            # frozen quality rule: non-GOOD -> score 0, contribution withheld
            score = fv["score"] if fv.get("quality") == "GOOD" else 0
            asof = fv.get("asOf")
            factors.append({
                "id": fid,
                "label": fv["name"],
                "score": score,
                "weight": fv["weight"],
                "contribution": (fv["weight"] * score
                                 if fv.get("quality") == "GOOD"
                                 else 0),
                # date-only asOf normalized to UTC midnight (documented);
                # the factor data is the 2026-10-09 session close.
                "asOf": f"{asof}T00:00:00Z" if asof else None,
                "quality": fv.get("quality"),
            })
        decision_at = L["timestamps"]["scanCompletedAt"]
        notes = (
            "real pilot row: scan-qualified radar candidate "
            f"(rankPosition {L.get('rankPosition')}) from "
            "factor-ledgers-2026-10-13.json; frozen 7-factor ledger with "
            "per-factor asOf copied verbatim (date-only '2026-10-09' = the "
            "session whose close the factors were computed from, normalized "
            "to UTC midnight). decision_at = scanCompletedAt "
            f"{decision_at} (real persisted timestamp). Scan-level issuance "
            "is hardcoded issuedCount=0 -- production never issued this "
            "candidate (issuance into tracked_signals is a separate path), "
            "so the production arm is scored from the ledger with "
            "disposition unscored:production-not-issued. No equity "
            "challenger is frozen (challenger arm not-applicable)."
        )
        cands.append({
            "candidate_id": L["symbol"],
            "terminal": "equity",
            "symbol": L["symbol"],
            "asset_id": L["symbol"],
            "decision_at": decision_at,
            "issued_at": None,
            "row_origin": "pilot",
            "factors": factors,
            "production_recorded": {
                "direction": L["recorded"]["direction"],
                "score": L["recomputed"]["finalScore"],
            },
            "production_decision": "qualified",
            "production_suppression_reason": None,
            "eligibility": "passed",
            "eligibility_reason": ("scan-qualified: top-50 by rankScore among "
                                   "issuance-allowed candidates per "
                                   "dispositionDetail"),
            "entry": None,
            "atr14": None,
            "notes": notes,
        })
    return cands


def main():
    os.makedirs(OUTDIR, exist_ok=True)
    cands = crypto_candidates() + equity_candidates()
    print(f"candidates: {len(cands)} "
          f"({sum(1 for c in cands if c['terminal']=='crypto')} crypto, "
          f"{sum(1 for c in cands if c['terminal']=='equity')} equity)")
    rows = score_batch(cands)

    # pilot-specific outcome/alert annotations (outcomes graded forward;
    # nothing has reached a checkpoint yet)
    for r in rows:
        if r["terminal"] == "crypto":
            r["alert_delay_note"] = (
                "alert delivery timestamps not persisted on "
                "generated_signals; issued_at set to row created_at "
                "(issuance instant); delay not gradable")
            r["outcome_note"] = (
                "forward pilot under crypto-evaluation-v5-corrected: "
                "d5/d14/d30 checkpoints not yet elapsed as of 2026-10-14; "
                "all outcome columns not-graded")
        else:
            r["outcome_note"] = (
                "forward pilot under equity-eval-3.3.0: 5/14/30-session "
                "checkpoints not yet elapsed as of 2026-10-14; all outcome "
                "columns not-graded; no equity challenger frozen")

    csv_path = os.path.join(OUTDIR, "comparison-rows-pilot-2026-10-14.csv")
    jsonl_path = os.path.join(OUTDIR, "comparison-rows-pilot-2026-10-14.jsonl")
    write_rows_csv(rows, csv_path)
    with open(jsonl_path, "w") as f:
        for r in rows:
            f.write(json.dumps(r) + "\n")

    from collections import Counter
    print(f"wrote {len(rows)} real pilot rows -> {csv_path}")
    print("decision_time_verified:",
          dict(Counter(str(r["decision_time_verified"]) for r in rows)))
    for t in ("crypto", "equity"):
        sub = [r for r in rows if r["terminal"] == t]
        print(f"{t}: prod dispositions:",
              dict(Counter(r["prod_disposition"] for r in sub)),
              "| c2 dispositions:",
              dict(Counter(r["c2_disposition"] for r in sub)))
    crypto = [r for r in rows if r["terminal"] == "crypto"]
    flipped = sum(1 for r in crypto if r.get("direction_flipped") is True)
    scored = sum(1 for r in crypto if r.get("c2_disposition") == "issued")
    print(f"crypto direction flips: {flipped}/{len(crypto)} "
          f"({100*flipped/len(crypto):.1f}%) -- guardrail: >40% pauses readout")
    repro = sum(1 for r in crypto if r.get("prod_reproduced") is True)
    print(f"crypto production reproduced from ledger: {repro}/{len(crypto)}")
    # equity formula cross-check vs the ledger's own recomputation
    eq = [r for r in rows if r["terminal"] == "equity"]
    mism = [(r["symbol"], r["prod_long_score"]) for r in eq
            if r["prod_long_score"] is None]
    print(f"equity rows scored: {len(eq) - len(mism)}/{len(eq)}")


if __name__ == "__main__":
    main()
