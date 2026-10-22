#!/usr/bin/env python3
"""Dual-arm shadow capture for the directional shadow comparison (protocol v1,
as amended by v2 2026-10-14).

Reads dossier-cohort-v1 rows with a resolved entry disposition and appends two
shadow rows (arm=orig, arm=inv) per cohort row to
rows/dossier-shadow-comparison-v1.csv.

Frozen conventions (see SHADOW-COMPARISON-PROTOCOL-v1.md):
- Inverted arm mirrors levels around the entry price: risk and reward distances
  held constant. inv long: stop = entry - risk, target = entry + reward;
  inv short: stop = entry + risk, target = entry - reward.
- Both arms share the cohort row's entry observation (one frozen entry
  convention). Non-entry cohort rows -> both arms non-entry, same named reason.
- Crypto short arms are hypothetical directional benchmarks (no borrow model).
- Append-only. Dedupe on (dossier_row_id, arm). Original dossier records
  untouched.

Paper signals only. No brokerage. No model tuning.
"""

import csv
import os
import sys
from datetime import datetime, timezone

BASE = os.path.dirname(os.path.abspath(__file__))
COHORT_CSV = os.path.join(BASE, "rows", "dossier-cohort-v1.csv")
SHADOW_CSV = os.path.join(BASE, "rows", "dossier-shadow-comparison-v1.csv")

SHADOW_HEADER = [
    "shadow_row_id", "dossier_row_id", "decision_at_utc", "symbol", "coin_id",
    "arm", "direction", "entry_price", "entry_price_source",
    "stop", "target", "risk_distance", "reward_distance",
    "mirrored", "hypothetical_short",
    "entry_status", "entry_evidence_note",
    "outcome_rule",
    "gross_direction_5", "barrier_5",
    # v2 (2026-10-14): TWO separate return fields — never one overwritten by
    # the other. fixed_5d_return_r = net R at the fixed five-day endpoint
    # (endpoint close vs entry, net of 18 bps). barrier_exit_return_r = net R
    # at the barrier exit (first-touch: target/stop/time-exit, net of 18 bps).
    # The v1 column net_return_5_r is REMOVED (zero rows existed at amendment
    # time — no migration). See SHADOW-COMPARISON-PROTOCOL-v2.md.
    "fixed_5d_return_r", "barrier_exit_return_r", "outcome_note",
    "recorded_at_utc",
]

RESOLVED_ENTRY = {"entered", "expired_non_entry", "void_drift", "void_no_quote"}
PROTOCOL_VERSION = "shadow-comparison-v1"
# Prospective only: shadow rows for decisions at/after collection start.
COLLECTION_START_UTC = "2026-10-15T00:00:00Z"
OUTCOME_RULE = ("first-touch 5D vs stop/target, endpoint=entry+5x24h, "
                "18 bps roundtrip modeled; TWO return fields: fixed_5d_return "
                "(net R at the fixed 5-day endpoint) and barrier_exit_return "
                "(net R at the barrier exit: target/stop/time-exit, whichever "
                "resolved first); see SHADOW-COMPARISON-PROTOCOL-v2.md")


def mirror_levels(direction, entry, stop_orig, target_orig):
    """Return (stop, target) for the given direction holding risk/reward
    distances constant around entry. Identical numerical stop/target prices
    cannot serve opposite directions - the mirror is explicit."""
    risk = abs(entry - stop_orig)
    reward = abs(target_orig - entry)
    if direction == "long":
        return entry - risk, entry + reward
    return entry + risk, entry - reward


def now_utc():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_captured():
    captured = set()
    if os.path.exists(SHADOW_CSV):
        with open(SHADOW_CSV, newline="") as f:
            for row in csv.DictReader(f):
                captured.add((row["dossier_row_id"], row["arm"]))
    return captured


def fmt(x):
    if x is None or x == "":
        return ""
    try:
        return repr(float(x))
    except (TypeError, ValueError):
        return str(x)


def build_arms(cohort):
    """Build the two shadow arm dicts for one cohort row."""
    entry = float(cohort["entry"])
    stop_o = float(cohort["invalidation"])
    target_o = float(cohort["target1"])
    dirn_o = cohort["direction"].strip().lower()
    dirn_i = "short" if dirn_o == "long" else "long"
    stop_i, target_i = mirror_levels(dirn_i, entry, stop_o, target_o)

    risk_o = abs(entry - stop_o)
    reward_o = abs(target_o - entry)
    risk_i = abs(entry - stop_i)
    reward_i = abs(target_i - entry)
    assert abs(risk_o - risk_i) < 1e-9, "risk distance must be identical"
    assert abs(reward_o - reward_i) < 1e-9, "reward distance must be identical"

    entry_status = cohort["entry_status_at_record"]
    entered = entry_status == "entered"
    ev_note = ("shared entry observation under actionable-entry-v1; "
               "print identity in cohort row disposition evidence"
               if entered else
               "non-entry: " + cohort.get("disposition_reason", ""))

    base = {
        "dossier_row_id": cohort["dossier_row_id"],
        "decision_at_utc": cohort["decision_at_utc"],
        "symbol": cohort["symbol"],
        "coin_id": cohort["coin_id"],
        "entry_price": fmt(entry),
        "entry_price_source": ("cohort:entry (stated level; observed print "
                               "identity in cohort disposition evidence)"),
        "entry_status": entry_status,
        "entry_evidence_note": ev_note,
        "outcome_rule": OUTCOME_RULE,
        "gross_direction_5": "not-graded",
        "fixed_5d_return_r": "",
        "barrier_exit_return_r": "",
        "barrier_5": "not-graded",
        "outcome_note": "",
        "recorded_at_utc": now_utc(),
    }
    orig = dict(base,
                shadow_row_id=f"shadow:{PROTOCOL_VERSION}:{cohort['dossier_row_id']}:orig",
                arm="orig", direction=dirn_o,
                stop=fmt(stop_o), target=fmt(target_o),
                risk_distance=fmt(risk_o), reward_distance=fmt(reward_o),
                mirrored="false",
                hypothetical_short="true" if dirn_o == "short" else "false")
    inv = dict(base,
               shadow_row_id=f"shadow:{PROTOCOL_VERSION}:{cohort['dossier_row_id']}:inv",
               arm="inv", direction=dirn_i,
               stop=fmt(stop_i), target=fmt(target_i),
               risk_distance=fmt(risk_i), reward_distance=fmt(reward_i),
               mirrored="true",
               hypothetical_short="true" if dirn_i == "short" else "false")
    return orig, inv


def main():
    if not os.path.exists(COHORT_CSV):
        print("cohort csv not found:", COHORT_CSV)
        return 1
    captured = load_captured()
    new_rows = []
    with open(COHORT_CSV, newline="") as f:
        for cohort in csv.DictReader(f):
            if cohort.get("entry_status_at_record") not in RESOLVED_ENTRY:
                continue
            if (cohort.get("decision_at_utc") or "") < COLLECTION_START_UTC:
                continue  # prospective only; pre-window seed rows excluded
            for arm in ("orig", "inv"):
                if (cohort["dossier_row_id"], arm) in captured:
                    continue
                new_rows.append((arm, cohort))

    if not new_rows:
        print("nothing new: 0 shadow rows appended (honest zero)")
        return 0

    write_header = not os.path.exists(SHADOW_CSV)
    with open(SHADOW_CSV, "a", newline="") as f:
        w = csv.DictWriter(f, fieldnames=SHADOW_HEADER)
        if write_header:
            w.writeheader()
        for arm, cohort in new_rows:
            orig, inv = build_arms(cohort)
            w.writerow(orig if arm == "orig" else inv)
    print(f"appended {len(new_rows)} shadow rows "
          f"({len(new_rows)//2} cohort rows x 2 arms)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
