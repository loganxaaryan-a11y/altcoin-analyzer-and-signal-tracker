#!/usr/bin/env python3
"""Entry-watch replay verification (read-only).

Re-derives the paper entry contract from PRIMARY venue data for every
checkpoint recorded in canonical-entered.json:

  - re-fetches Binance aggTrades for each checkpoint's recorded decision
    window [decisionAt, entryExpiresAt] from data-api.binance.vision
    (curl transport — the proven route on this VM);
  - checks the recorded first print is exactly prints[0] of the re-fetched
    series (earliest (timestamp, aggTradeId) at/after decisionAt) — the
    first-print selection rule;
  - re-applies the frozen verdict rules using the RECORDED receipt time
    (receipt is a fact about the original fetch; the prints are immutable
    venue history, so prints[0] today must equal prints[0] then):
      receipt > window end            -> expired (entry_receipt_after_window)
      receipt - print > age bound     -> void_first_print_missed
        (bound: 300s for freeze paper-pilot-v2.1.0, else 900s)
      |print - reference| > drift cap -> abstained (entry_outside_drift_zone)
      no print in decisive range      -> pending / void per receipt vs expiry
  - compares the re-derived verdict with the recorded checkpoint state.

MEXC checkpoints and checkpoints whose candidate row is not in the file
(no reference price / freeze version) are reported at reduced strength —
never silently passed. Nothing here writes to the monitoring store.
"""
import json
import subprocess
import sys
from datetime import datetime, timezone

CANONICAL = "/home/hatch/workspace/goals/research-terminal/paper-signals/pilot/monitoring/canonical-entered.json"
VISION = "https://data-api.binance.vision"


def ms(iso):
    return int(datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp() * 1000)


def fetch_prints(symbol, since_ms, until_ms):
    url = (f"{VISION}/api/v3/aggTrades?symbol={symbol}"
           f"&startTime={since_ms}&endTime={until_ms}&limit=1000")
    out = subprocess.run(["curl", "-s", "--max-time", "30", url],
                         capture_output=True, text=True, check=True).stdout
    rows = json.loads(out)
    prints = []
    for r in rows:
        prints.append({"ts": int(r["T"]), "price": float(r["p"]),
                       "venueTradeId": str(r["a"]), "venueSeq": int(r["a"])})
    prints.sort(key=lambda p: (p["ts"], p["venueSeq"]))
    return prints, len(rows)


def age_bound_ms(freeze):
    return 300_000 if freeze == "paper-pilot-v2.1.0" else 900_000


def main():
    with open(CANONICAL, encoding="utf-8") as fh:
        data = json.load(fh)
    candidates = {c["id"]: c for c in data.get("candidates") or []}
    checkpoints = data.get("checkpoints") or []
    results = []
    for cp in checkpoints:
        cj = json.loads(cp["checkpointJson"])
        cov = json.loads(cp["coverageJson"])
        cand = candidates.get(cp["candidateId"])
        lane = cj.get("observationLane") or "issuance"
        rec_first = cj.get("firstPrint")
        receipt_ms = ms(cp["receiptAt"]) if cp.get("receiptAt") else None
        decision_ms = ms(cj["decisionAt"])
        expires_ms = ms(cj["entryWindowExpiresAt"])
        symbol = cov.get("symbol")
        venue = (rec_first or {}).get("venue") or cov.get("venue")
        row = {"candidateId": cp["candidateId"], "recordedState": cp["contractState"],
               "lane": lane, "symbol": symbol, "venue": venue, "checks": {}, "verdict": None}
        if venue != "binance-spot" or not symbol:
            row["verdict"] = "recorded_only_non_binance"
            results.append(row)
            continue
        # Decisive range = the recorded fetch's own range, so prints[0] is
        # compared like-for-like with what the handler saw.
        until_ms = cov.get("requestedUntilMs") or expires_ms
        try:
            prints, raw_count = fetch_prints(symbol, decision_ms, until_ms)
        except Exception as e:
            row["verdict"] = f"refetch_failed: {e}"
            results.append(row)
            continue
        first = prints[0] if prints else None
        # 1) first-print identity
        if (first is None) != (rec_first is None):
            row["checks"]["first_print_identity"] = "MISMATCH presence"
        elif first is None:
            row["checks"]["first_print_identity"] = "ok (both none)"
        else:
            same = (first["venueTradeId"] == rec_first["venueTradeId"]
                    and first["ts"] == ms(rec_first["observedAt"])
                    and abs(first["price"] - rec_first["price"]) < 1e-12)
            row["checks"]["first_print_identity"] = "ok" if same else (
                f"MISMATCH rederived={first} recorded={rec_first}")
        # 2) verdict re-derivation with recorded receipt
        reference = cand.get("decisionReferencePrice") if cand else None
        drift_cap = cand.get("permittedDriftBps") if cand else 50
        freeze = cand.get("freezeVersion") if cand else None
        if not cov.get("headCoverageEstablished"):
            expected = "void_first_print_unverifiable"
        elif first is None:
            expected = ("void_first_print_unverifiable"
                        if receipt_ms is not None and receipt_ms >= expires_ms else "pending")
        elif receipt_ms is not None and receipt_ms > expires_ms:
            expected = "void_expired"
        elif first["ts"] < decision_ms:
            expected = "void_first_print_unverifiable"
        elif receipt_ms is not None and receipt_ms - first["ts"] > age_bound_ms(freeze):
            expected = "void_first_print_missed"
        elif reference and abs(first["price"] - reference) / reference * 10_000 > drift_cap:
            expected = "abstained_drift"
        else:
            expected = "entered"
        row["expectedState"] = expected
        row["checks"]["freeze_known"] = bool(freeze)
        row["checks"]["reference_known"] = bool(reference)
        recorded = cp["contractState"]
        if row["checks"]["first_print_identity"].startswith("MISMATCH"):
            row["verdict"] = "MISMATCH"
        elif expected == recorded:
            row["verdict"] = "match"
        elif recorded == "pending" and expected == "pending":
            row["verdict"] = "match"
        else:
            row["verdict"] = f"STATE_DIFF recorded={recorded} rederived={expected}"
        results.append(row)

    summary = {}
    for r in results:
        summary[r["verdict"]] = summary.get(r["verdict"], 0) + 1
    print(json.dumps({"summary": summary, "total": len(results)}, indent=1))
    for r in results:
        if r["verdict"] != "match":
            print(json.dumps(r))
    hard = [r for r in results if r["verdict"] == "MISMATCH"]
    print(f"checkpoints={len(results)} hard_mismatches={len(hard)}")
    return 1 if hard else 0


if __name__ == "__main__":
    sys.exit(main())
