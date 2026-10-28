#!/usr/bin/env python3
"""Entry-watch records check (read-only, no network).

Companion to entry_watch_replay.py: verifies the receipt/window/drift
arithmetic from the recorded fields in canonical-entered.json alone.

  - entered checkpoints: print inside [decisionAt, entryExpiresAt],
    receipt <= entryExpiresAt, receipt age <= 900s bound;
  - void_first_print_missed checkpoints: receipt age printed and banded
    (the v2.1.0-era bound was 300s; v2.1.1+ is 900s — a void in the
    (300, 900] band with an Oct 16-20 decision is the old bound's
    population, matching the handler's prospective-widening note);
  - joined candidates: issued => drift <= cap; abstained with
    entry_outside_drift_zone => drift > cap (drift from the recorded
    first print, whose identity entry_watch_replay.py proved against
    primary venue data).
"""
import json
from datetime import datetime

CANONICAL = "/home/hatch/workspace/goals/research-terminal/paper-signals/pilot/monitoring/canonical-entered.json"


def ms(iso):
    return int(datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp() * 1000)


def main():
    with open(CANONICAL, encoding="utf-8") as fh:
        data = json.load(fh)
    candidates = {c["id"]: c for c in data.get("candidates") or []}
    checkpoints = data.get("checkpoints") or []
    problems = []

    entered = [c for c in checkpoints if c["contractState"] == "entered"]
    for cp in entered:
        cj = json.loads(cp["checkpointJson"])
        fp = cj.get("firstPrint")
        if not fp:
            problems.append(f"entered {cp['candidateId']}: no first print")
            continue
        if not (ms(cj["decisionAt"]) <= ms(fp["observedAt"]) <= ms(cj["entryWindowExpiresAt"])):
            problems.append(f"entered {cp['candidateId']}: print outside window")
        if ms(cp["receiptAt"]) > ms(cj["entryWindowExpiresAt"]):
            problems.append(f"entered {cp['candidateId']}: receipt after window")
        age = (ms(cp["receiptAt"]) - ms(fp["observedAt"])) / 1000
        if age > 900:
            problems.append(f"entered {cp['candidateId']}: receipt age {age:.1f}s > 900s")
    print(f"entered: {len(entered)} checked, all window/receipt rules hold"
          if not problems else f"entered problems: {problems}")

    missed = [c for c in checkpoints if c["contractState"] == "void_first_print_missed"]
    for cp in missed:
        cj = json.loads(cp["checkpointJson"])
        fp = cj.get("firstPrint")
        age = (ms(cp["receiptAt"]) - ms(fp["observedAt"])) / 1000
        band = "(300,900] old-bound band" if 300 < age <= 900 else "OUTSIDE expected band"
        print(f"missed cand {cp['candidateId']}: receipt age {age:.1f}s — {band} — decision {cj['decisionAt']}")
        if band.startswith("OUTSIDE"):
            problems.append(f"missed {cp['candidateId']}: age {age:.1f}s outside (300,900]")

    cp_by_cand = {cp["candidateId"]: cp for cp in checkpoints}
    checked = 0
    for cid, cand in candidates.items():
        cp = cp_by_cand.get(cid)
        if not cp:
            continue
        fp = json.loads(cp["checkpointJson"]).get("firstPrint")
        ref = cand.get("decisionReferencePrice")
        cap = cand.get("permittedDriftBps") or 50
        if not fp or not ref:
            continue
        drift = abs(fp["price"] - ref) / ref * 10_000
        checked += 1
        if cand.get("state") == "issued" and drift > cap:
            problems.append(f"issued {cid}: drift {drift:.1f} > cap {cap}")
        if cand.get("reasonCode") == "entry_outside_drift_zone" and drift <= cap:
            problems.append(f"drift-abstained {cid}: drift {drift:.1f} <= cap {cap}")
    print(f"drift: {checked} joined candidates checked")

    pending = [c for c in checkpoints if c["contractState"] == "pending"]
    joined_states = {}
    for cp in pending:
        cand = candidates.get(cp["candidateId"])
        key = cand.get("state") if cand else "not_in_file"
        joined_states[key] = joined_states.get(key, 0) + 1
    print(f"pending checkpoints: {len(pending)}; joined candidate states: {joined_states}")

    print("PROBLEMS:", problems if problems else "none")
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
