#!/usr/bin/env python3
"""
Automatic enrollment for the original-venue paper-entry monitor (paper-only).

Discovers ENTERED paper positions from the CANONICAL records — the crypto
artifact's getpaperpilotstatus response, saved verbatim by the venue-monitor
agent to canonical-entered.json immediately before this script runs — and
appends any entered Binance Spot position not yet in positions.json.

Canonical derivation (all cross-checked; any mismatch skips the position —
fail closed, never enroll inconsistent data):
  - checkpoints: contractState == "entered" selects the candidate
  - signals (joined by candidateId): venue, instrument, symbol, direction,
    entryPrice, entryAt, stopPrice (= invalidation), targetPrice (= target1)
  - alerts: the ENTRY_CONFIRMED alert (payloadJson, schema 2026-10-14) for the
    signal carries targets {t1, t2} at full precision, entry_price,
    entry_observed_at, invalidation.price — all must agree with the signal
    record and with the checkpoint's firstPrintObservedAt / firstPrintPrice.

Hard constraints:
  - APPEND-ONLY: existing positions.json entries are never modified or
    removed. (The one sanctioned exception — re-deriving the 2026-10-20
    manual run-88 entries through this path — was done by removing ONLY
    those entries first, then letting this script re-append the canonical
    values; see workstreams doc 34.)
  - Venue identity preserved: a position whose venue is not "Binance Spot"
    is NOT enrolled into the Binance monitor; it is logged as
    unsupported-venue (MEXC positions stay unenrolled until a MEXC monitor
    exists — Logan's ruling).
  - Positions already settled in outcomes.jsonl (settled == true) are not
    newly enrolled.
  - Idempotent: re-running with no new entered positions changes nothing
    (positions.json is only rewritten when additions > 0; atomic tmp+rename).
  - Stale or missing canonical file -> no-op (exit 0): enrollment never
    blocks monitoring. Freshness bound: file mtime within STALE_S seconds
    (--allow-stale overrides for one-time supervised re-derivation only).

Usage: python3 enroll.py [--allow-stale]
Writes runs/enroll-<UTC-ts>.json on every run that reads a canonical file.
"""
import json, os, sys, time
from datetime import datetime, timezone

BASE = os.path.dirname(os.path.abspath(__file__))
POSITIONS_FILE = os.path.join(BASE, "positions.json")
OUTCOMES_FILE = os.path.join(BASE, "outcomes.jsonl")
CANONICAL_FILE = os.path.join(BASE, "canonical-entered.json")
RUNS_DIR = os.path.join(BASE, "runs")
SUPPORTED_VENUE = "Binance Spot"
STALE_S = 1200  # 20 min; the lane runs every 30 min and saves immediately before
# Cross-record float tolerance: the same frozen level can serialize through
# different canonical records with last-bit differences (observed live:
# legacy BAT signal stopPrice 0.19271294067763944 vs its alert payload
# invalidation.price 0.19271294067763942 — relative diff ~1e-16). A mismatch
# within TOL_REL is logged as a warning and the SIGNAL record's value is used
# (the signal is the canonical position record); beyond it, the position is
# skipped as a real discrepancy. TOL_REL is ~7 orders of magnitude below the
# smallest economically meaningful level difference (50 bps drift = 5e-3).
TOL_REL = 1e-9


def _close(a, b):
    if a == b:
        return True
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return abs(a - b) <= TOL_REL * max(abs(a), abs(b), 1e-300)
    return False


def iso(ms):
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_json(path, default):
    if os.path.exists(path):
        with open(path) as f:
            return json.load(f)
    return default


def settled_ids():
    ids = set()
    if os.path.exists(OUTCOMES_FILE):
        with open(OUTCOMES_FILE) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    rec = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if rec.get("settled") is True and rec.get("position_id"):
                    ids.add(rec["position_id"])
    return ids


def derive_entered(data):
    """Return (derived_entries, unsupported, discrepancies, warnings)."""
    signals = {s["candidateId"]: s for s in data.get("signals", [])}
    alerts = {}
    for a in data.get("alerts", []):
        if a.get("eventType") == "ENTRY_CONFIRMED" and a.get("paperSignalId"):
            alerts[a["paperSignalId"]] = a
    derived, unsupported, discrepancies, warnings = [], [], [], []
    for chk in data.get("checkpoints", []):
        if chk.get("contractState") != "entered":
            continue
        cand = chk.get("candidateId")
        sig = signals.get(cand)
        if sig is None:
            discrepancies.append({"candidateId": cand, "reason": "entered checkpoint with no signal record"})
            continue
        pid = sig.get("paperSignalId")
        alert = alerts.get(pid)
        if alert is None:
            discrepancies.append({"candidateId": cand, "position_id": pid,
                                  "reason": "entered checkpoint with no ENTRY_CONFIRMED alert"})
            continue
        try:
            payload = json.loads(alert["payloadJson"])
        except (KeyError, json.JSONDecodeError) as e:
            discrepancies.append({"candidateId": cand, "position_id": pid,
                                  "reason": f"alert payloadJson unparsable: {e}"})
            continue
        if payload.get("test") is True:
            discrepancies.append({"candidateId": cand, "position_id": pid,
                                  "reason": "test alert — not a production position"})
            continue
        checks = [
            ("entryPrice vs alert entry_price", sig.get("entryPrice"), payload.get("entry_price")),
            ("entryAt vs alert entry_observed_at", sig.get("entryAt"), payload.get("entry_observed_at")),
            ("entryAt vs checkpoint firstPrintObservedAt", sig.get("entryAt"), chk.get("firstPrintObservedAt")),
            ("entryPrice vs checkpoint firstPrintPrice", sig.get("entryPrice"), chk.get("firstPrintPrice")),
            ("stopPrice vs alert invalidation.price", sig.get("stopPrice"),
             (payload.get("invalidation") or {}).get("price")),
            ("targetPrice vs alert targets.t1", sig.get("targetPrice"),
             (payload.get("targets") or {}).get("t1")),
        ]
        bad = [{"check": name, "signal": a, "other": b} for name, a, b in checks if not _close(a, b)]
        noisy = [{"check": name, "signal": a, "other": b} for name, a, b in checks
                 if a != b and _close(a, b)]
        if noisy:
            warnings.append({"candidateId": cand, "position_id": pid,
                             "reason": "cross-record float serialization differs within "
                                       "tolerance — signal record values used",
                             "fields": noisy})
        if bad:
            discrepancies.append({"candidateId": cand, "position_id": pid,
                                  "reason": "canonical cross-check mismatch", "mismatches": bad})
            continue
        entry = {
            "barrier_rule": "TOUCH",
            "direction": sig["direction"],
            "entry_observed_at": chk["firstPrintObservedAt"],
            "entry_price": sig["entryPrice"],
            "id": pid,
            "instrument": sig["instrument"],
            "invalidation": sig["stopPrice"],
            "symbol": sig["symbol"],
            "target1": (payload.get("targets") or {}).get("t1"),
            "target2": (payload.get("targets") or {}).get("t2"),
            "venue": sig["venue"],
        }
        if sig["venue"] != SUPPORTED_VENUE:
            unsupported.append({"position_id": pid, "venue": sig["venue"],
                                "instrument": sig["instrument"],
                                "reason": "unsupported-venue — not enrolled into the Binance Spot monitor"})
            continue
        derived.append(entry)
    return derived, unsupported, discrepancies, warnings


def main():
    allow_stale = "--allow-stale" in sys.argv[1:]
    run = {"run_utc": iso(int(time.time() * 1000)), "added": [], "already_enrolled": [],
           "unsupported_venue": [], "discrepancies": [], "warnings": [], "skipped_settled": []}

    if not os.path.exists(CANONICAL_FILE):
        print("enroll: canonical-entered.json missing — no-op (enrollment never blocks monitoring)")
        return 0
    age_s = time.time() - os.path.getmtime(CANONICAL_FILE)
    run["canonical_file_age_s"] = round(age_s, 1)
    if age_s > STALE_S and not allow_stale:
        print(f"enroll: canonical-entered.json stale ({age_s:.0f}s > {STALE_S}s) — no-op")
        return 0

    raw = load_json(CANONICAL_FILE, None)
    data = raw.get("data") if isinstance(raw, dict) and "data" in raw else raw
    if not isinstance(data, dict) or "signals" not in data or "checkpoints" not in data:
        print("enroll: canonical file has unexpected shape — no-op")
        return 0

    derived, unsupported, discrepancies, warnings = derive_entered(data)
    run["unsupported_venue"] = unsupported
    run["discrepancies"] = discrepancies
    run["warnings"] = warnings
    run["derived_entered"] = [e["id"] for e in derived]

    positions = load_json(POSITIONS_FILE, [])
    enrolled_ids = {p["id"] for p in positions}
    settled = settled_ids()
    additions = []
    for e in derived:
        if e["id"] in enrolled_ids:
            run["already_enrolled"].append(e["id"])
        elif e["id"] in settled:
            run["skipped_settled"].append(e["id"])
        else:
            additions.append(e)

    if additions:
        positions.extend(additions)
        tmp = POSITIONS_FILE + ".tmp"
        with open(tmp, "w") as f:
            json.dump(positions, f, indent=1, sort_keys=True)
            f.write("\n")
        os.rename(tmp, POSITIONS_FILE)
        run["added"] = [e["id"] for e in additions]

    os.makedirs(RUNS_DIR, exist_ok=True)
    run_ts = datetime.fromtimestamp(time.time(), tz=timezone.utc).strftime("%Y%m%dT%H%M%S%f")[:18] + "Z"
    run_path = os.path.join(RUNS_DIR, f"enroll-{run_ts}.json")
    with open(run_path, "w") as f:
        json.dump(run, f, indent=1)
    print(f"enroll: derived={len(derived)} added={len(run['added'])} "
          f"already={len(run['already_enrolled'])} unsupported={len(unsupported)} "
          f"discrepancies={len(discrepancies)} settled-skipped={len(run['skipped_settled'])}")
    for pid in run["added"]:
        print(f"enroll: ADDED {pid}")
    for u in unsupported:
        print(f"enroll: unsupported-venue {u['position_id']} venue={u['venue']} — NOT enrolled")
    for d in discrepancies:
        print(f"enroll: DISCREPANCY {d.get('position_id') or d.get('candidateId')}: {d['reason']}")
    print("enroll log:", run_path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
