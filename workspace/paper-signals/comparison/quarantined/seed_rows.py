#!/usr/bin/env python3
"""PLUMBING TEST ONLY -- NOT pilot data. NOT real candidates.

This script exercises the comparison harness's scoring paths with
sandbox-seeded fixtures (configured direction/score/percentage levels from
c2-shadow-ledger-2026-10-13.csv and recent-scan-2026-10-13.json). It exists
to prove the plumbing works (row schema, mirrored levels/gates, reason
codes); its output must NEVER be confused with pilot rows.

  * row_origin is ALWAYS "plumbing-test" (never "pilot", never
    "sandbox-seeded" -- the old label is retired).
  * Output goes to rows/plumbing-test-rows-2026-10-13.csv (+ .jsonl twin).
    The older rows/comparison-rows-2026-10-13.csv is the QUARANTINED v1
    artifact (see FREEZE-v1.0.0-SUPERSEDED.md): this script no longer
    writes it and must never be re-run against it.
  * Real pilot rows are built by build_pilot_rows.py from persisted
    decision-time factor ledgers (row_origin "pilot").

Kept for plumbing verification only.
"""

import csv
import json
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness import (ROW_COLUMNS, REASON, mirror_levels, born_dead_check,
                     short_regime_gate, _finalize)

BASE = os.path.dirname(os.path.abspath(__file__))
LEDGER = os.path.join(BASE, "..", "research", "c2-shadow-ledger-2026-10-13.csv")
RECENT = os.path.join(BASE, "..", "..",
                      "hidden_files", "methodology-export-2026-10-13",
                      "recent-scan-2026-10-13.json")
OUTDIR = os.path.join(BASE, "rows")


def iso_ms(ms):
    if ms is None or ms == "":
        return None
    return datetime.fromtimestamp(float(ms) / 1000, tz=timezone.utc).isoformat()


def num(v):
    return None if v in (None, "") else float(v)


def blank():
    return {c: None for c in ROW_COLUMNS}


def seed_from_ledger():
    rows = []
    with open(LEDGER, newline="") as f:
        for L in csv.DictReader(f):
            r = blank()
            rid = L["id"]
            flipped = (L.get("direction_flipped") or "").strip().lower() == "true"
            reproduced = (L.get("prod_reproduced") or "").strip().lower() == "true"
            prod_long = num(L.get("prod_longScore"))
            c2_long = num(L.get("c2_longScore"))
            c2_short = num(L.get("c2_shortScore"))
            c2_dir = L.get("c2_direction") or None
            c2_inv = num(L.get("c2_invalidation"))

            r.update({
                "row_id": f"crypto:{rid}",
                "terminal": "crypto",
                "symbol": L.get("symbol"),
                "asset_id": L.get("coin_id"),
                "candidate_id": rid,
                "decision_at": None,  # not persisted historically
                "issued_at": iso_ms(L.get("created_at")),
                "row_origin": "plumbing-test",
                "decision_time_verified": False,
                "decision_time_note": ("decision_at not persisted historically; "
                                       "decision-time status labeled, not assumed"),
                "factor_ledger_available": True,
                "eligibility": "passed",
                "eligibility_reason": ("production issued this signal; "
                                       "eligibility bars cleared at issuance"),
                "prod_strategy_id": "crypto-dossier-factor-agreement",
                "prod_strategy_version": "2.0.0-measurement-contract",
                "prod_long_score": prod_long,
                "prod_short_score": (100 - prod_long) if prod_long is not None else None,
                "prod_direction": L.get("prod_direction") or None,
                "prod_reproduced": reproduced,
                "prod_decision": "issued",
                "prod_suppression_reason": None,
                "prod_disposition": "issued" if reproduced else "unscored",
                "prod_disposition_reason": (REASON["ok"] if reproduced
                                            else REASON["production-unreproduced"]),
                "prod_entry": num(L.get("c2_entry")),
                "prod_invalidation": None,  # see levels_mode note below
                "prod_target1": None,
                "prod_target2": None,
                "prod_atr14": None,
                "c2_strategy_id": "crypto-dossier-minus-momentum",
                "c2_strategy_version": "0.1.0-shadow",
                "c2_long_score": c2_long,
                "c2_short_score": c2_short,
                "c2_direction": c2_dir,
                "direction_flipped": flipped,
                "c2_entry": num(L.get("c2_entry")),
                "c2_invalidation": c2_inv,
                "c2_target1": num(L.get("c2_target1")),
                "c2_target2": num(L.get("c2_target2")),
                "short_regime_gate_mirror": "unverifiable",
                "short_regime_gate_mirror_reason": ("UNVERIFIABLE-HISTORICAL: "
                    "belowSma50/lowerHighs/trend20Negative not persisted per row"),
                "alert_delay_note": ("not gradable: decisionAt not persisted "
                                     "for historical rows"),
                "prod_barrier_outcome": "not-graded",
                "c2_barrier_outcome": "not-graded",
                "prod_dir_d5": "not-graded", "prod_dir_d14": "not-graded",
                "prod_dir_d30": "not-graded",
                "c2_dir_d5": "not-graded", "c2_dir_d14": "not-graded",
                "c2_dir_d30": "not-graded",
                "outcome_note": ("plumbing-test: no outcomes graded; forward "
                                 "pilot grades under crypto-evaluation-v4-cohort-contract"),
            })

            if not reproduced:
                r["c2_disposition"] = "unscored"
                r["c2_disposition_reason"] = REASON["production-unreproduced"]
                r["notes"] = (f"plumbing-test from c2-shadow-ledger-2026-10-13.csv "
                              f"row {rid}; production does not reproduce from ledger")
                rows.append(_finalize(r))
                continue

            bd_raw = (L.get("born_dead_mirror") or "").strip()
            if not flipped:
                r["levels_mode"] = "inherited-identical (non-flipped)"
                r["born_dead_mirror"] = "passed"
                r["born_dead_mirror_reason"] = ("non-flipped: invalidation identical "
                    "to production; veto cleared at issuance")
                r["short_regime_gate_mirror"] = "allowed"
                r["short_regime_gate_mirror_reason"] = ("non-flipped: gate cleared by "
                    "production on the identical direction")
                r["c2_disposition"] = "issued"
                r["c2_disposition_reason"] = REASON["ok"]
                r["notes"] = (f"plumbing-test from c2-shadow-ledger-2026-10-13.csv "
                    f"row {rid}; semantics per freeze v1.0.0 (non-flipped rows "
                    f"inherit production issuance)")
            else:
                r["levels_mode"] = "mirrored (flipped)"
                if bd_raw.startswith("SUPPRESSED"):
                    r["born_dead_mirror"] = "suppressed"
                    r["born_dead_mirror_reason"] = (
                        f"born-dead-mirror on challenger direction ({c2_dir}): "
                        f"signal-day extreme breached challenger invalidation {c2_inv}")
                    r["c2_disposition"] = "abstain"
                    r["c2_disposition_reason"] = REASON["born-dead-mirror"]
                    r["notes"] = (f"plumbing-test from c2-shadow-ledger-2026-10-13.csv "
                                  f"row {rid}; flipped; challenger born-dead veto fired")
                elif bd_raw == "UNRECOVERABLE":
                    r["born_dead_mirror"] = "unverifiable"
                    r["born_dead_mirror_reason"] = ("signal-day OHLC unrecoverable "
                        "historically; gate outcome unknown")
                    r["c2_disposition"] = "abstain"
                    r["c2_disposition_reason"] = REASON["gate-inputs-unverifiable"]
                    r["notes"] = (f"plumbing-test from c2-shadow-ledger-2026-10-13.csv "
                        f"row {rid}; flipped; gate outcome unknown -- never assumed passed")
                else:  # passed
                    r["born_dead_mirror"] = "passed"
                    r["born_dead_mirror_reason"] = (
                        f"born-dead mirror passed on challenger direction ({c2_dir}) "
                        f"from signal-day OHLC ({L.get('born_dead_mirror_day')})")
                    if c2_dir == "short":
                        r["c2_disposition"] = "abstain"
                        r["c2_disposition_reason"] = REASON["gate-inputs-unverifiable"]
                        r["notes"] = (f"plumbing-test from c2-shadow-ledger-2026-10-13.csv "
                            f"row {rid}; flipped to short; born-dead mirror passed but "
                            f"short-regime inputs UNVERIFIABLE-HISTORICAL -- abstain")
                    else:
                        r["short_regime_gate_mirror"] = "allowed"
                        r["short_regime_gate_mirror_reason"] = "no long-regime gate"
                        r["c2_disposition"] = "issued"
                        r["c2_disposition_reason"] = REASON["ok"]
                        r["notes"] = (f"plumbing-test from c2-shadow-ledger-2026-10-13.csv "
                            f"row {rid}; flipped; challenger leg issued")
            rows.append(_finalize(r))
    return rows


def seed_suppression_rows():
    """Production-suppressed candidates: prod arm known (abstain + reason);
    challenger arm explicitly unscored (no factor ledger persisted)."""
    rows = []
    with open(RECENT) as f:
        d = json.load(f)
    cands = d["terminal_crypto"]["candidates"]
    for x in cands:
        if x.get("rejectionReason") is None and not x.get("id") in (371, 372, 374, 375, 376):
            continue
        reason = x.get("rejectionReason") or ""
        if not reason:
            continue
        r = blank()
        rl = reason.lower()
        if rl.startswith("born-dead"):
            code = REASON["born-dead"]
        elif "short-regime" in rl:
            code = REASON["short-regime"]
        elif "issuance-validation unavailable" in rl:
            code = REASON["issuance-unavailable"]
        else:
            code = REASON["eligibility"]
        sig = (x.get("inputs") or {}).get("signalDayCandle") or {}
        r.update({
            "row_id": f"crypto:{x['id']}",
            "terminal": "crypto",
            "symbol": x.get("symbol"),
            "asset_id": x.get("coinId"),
            "candidate_id": x["id"],
            "decision_at": x.get("createdAt"),
            "issued_at": None,
            "row_origin": "plumbing-test",
            "decision_time_verified": False,
            "decision_time_note": ("suppression row: factor inputs asOf not recorded "
                                   "per factor; decision-time status labeled"),
            "factor_ledger_available": False,
            "eligibility": "unknown",
            "eligibility_reason": ("suppression rows persist the agreement score but "
                                  "eligibility bars were not evaluated (born-dead veto "
                                  "precedes eligibility in issuanceCheckedCandidates)"),
            "prod_strategy_id": "crypto-dossier-factor-agreement",
            "prod_strategy_version": "2.0.0-measurement-contract",
            "prod_long_score": None,
            "prod_short_score": None,
            "prod_direction": x.get("direction"),
            "prod_reproduced": None,
            "prod_decision": "suppressed",
            "prod_suppression_reason": reason,
            "prod_disposition": "abstain",
            "prod_disposition_reason": code,
            "c2_strategy_id": "crypto-dossier-minus-momentum",
            "c2_strategy_version": "0.1.0-shadow",
            "c2_direction": None,
            "direction_flipped": None,
            "levels_mode": None,
            "born_dead_mirror": None,
            "born_dead_mirror_reason": "challenger not scored (no factor ledger)",
            "short_regime_gate_mirror": None,
            "short_regime_gate_mirror_reason": "challenger not scored (no factor ledger)",
            "c2_disposition": "unscored",
            "c2_disposition_reason": REASON["no-factor-ledger"],
            "alert_delay_note": "suppressed: no issuance",
            "prod_barrier_outcome": "not-graded",
            "c2_barrier_outcome": "not-graded",
            "prod_dir_d5": "not-graded", "prod_dir_d14": "not-graded",
            "prod_dir_d30": "not-graded",
            "c2_dir_d5": "not-graded", "c2_dir_d14": "not-graded",
            "c2_dir_d30": "not-graded",
            "outcome_note": ("plumbing-test suppression row: recovered-opportunity "
                             "ledger is forward-only (spec S4); historical suppressed "
                             "rows cannot be challenger-scored"),
            "notes": (f"plumbing-test from recent-scan-2026-10-13.json candidate "
                      f"{x['id']}; signal-day candle present "
                      f"(high={sig.get('high')}, low={sig.get('low')}) for the "
                      f"forward pilot's mirror gates; per-factor ledger absent"),
        })
        rows.append(_finalize(r))
    return rows


def main():
    os.makedirs(OUTDIR, exist_ok=True)
    rows = seed_from_ledger() + seed_suppression_rows()
    csv_path = os.path.join(OUTDIR, "plumbing-test-rows-2026-10-13.csv")
    jsonl_path = os.path.join(OUTDIR, "plumbing-test-rows-2026-10-13.jsonl")
    with open(csv_path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=ROW_COLUMNS)
        w.writeheader()
        for r in rows:
            w.writerow({k: ("" if v is None else v) for k, v in r.items()})
    with open(jsonl_path, "w") as f:
        for r in rows:
            f.write(json.dumps(r) + "\n")
    from collections import Counter
    print(f"seeded {len(rows)} PLUMBING-TEST rows -> {csv_path}")
    print("prod dispositions:", dict(Counter(r["prod_disposition"] for r in rows)))
    print("c2 dispositions:  ", dict(Counter(r["c2_disposition"] for r in rows)))
    flipped = sum(1 for r in rows if r.get("direction_flipped") is True)
    scored = sum(1 for r in rows if r.get("c2_disposition") in ("issued", "abstain"))
    print(f"direction flipped: {flipped}/{scored} scored "
          f"({100 * flipped / scored:.1f}%) -- rule: >40% = AUDIT TRIGGER per "
          f"COLLECTION-PLAN-2026-10-14 (four-part audit + written finding; "
          f"not proof of a bug; does not change the freeze)")


if __name__ == "__main__":
    main()
