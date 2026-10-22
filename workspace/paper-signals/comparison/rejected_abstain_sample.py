#!/usr/bin/env python3
"""Bounded prospective sample of PRODUCTION MODEL ABSTENTIONS.

Purpose (expert-reply implementation pass, 2026-10-21): Challenger-R1 does
not replace measuring the unchanged production model's abstentions. This
script retains a BOUNDED prospective sample of candidates the production
model abstained on (reasonCode == production_model_abstain), records their
frozen levels, and measures their forward outcomes under the existing
evaluation standard (crypto-evaluation-v5-corrected) by reusing the walk
in challenger_shadow_eval.py verbatim. It is MEASUREMENT ONLY:

- It never issues, never enrolls anything in any shadow book, and creates
  no position any lane can act on. Its only output is its own ledger
  (rows/rejected-abstain-sample.jsonl), which no production or challenger
  code reads.
- It is not a scorer and applies no model: selection is "the production
  model abstained", full stop.

Bound (explicit, hard-coded; changing it requires a new implementation
decision, not an edit in passing):
- Window: candidates with decisionAt in [2026-10-21T00:00:00Z,
  2026-11-18T23:59:59Z] (four weeks from the pass).
- Per-run cap: at most 5 NEW samples per invocation.
- Total cap: at most 50 samples, ever. Evaluation of already-sampled
  records continues until each resolves or hits its 30-day cap.

Conventions (stated on every record):
- Venue scope: Binance Spot only (the evaluator's bar source). MEXC Spot
  abstentions are counted and excluded — MEXC is research-only this phase.
- Entry (hypothetical, measurement only): the candidate's recorded
  decisionReferencePrice (the frozen scan reference the model scored
  against); the walk starts at the first complete 1m bar after the
  decision instant (entry-spanning bar excluded, per the evaluator).
- Invalidation: the candidate's recorded stopPrice (frozen level).
- Target1: DERIVED from the frozen settlement geometry (+1.5R long /
  -1.5R short), because production records no target for abstained
  candidates. The derivation reproduces the recorded targets of issued
  positions exactly (verified against run-108 CVX, run-111 PHA, and the
  challenger would-be contract for NEAR handoff-139) and is labeled
  `derived_frozen_geometry_1.5R` on every record — never presented as a
  recorded level.
- Costs: 18 bps round-trip; net R = gross R - 0.0018 * entry / risk
  (the same clause/conversion as the shadow evaluator).
- A candidate whose recorded invalidation is not strictly on the correct
  side of the reference (risk <= 0 or wrong-sided) is sampled as
  non_evaluable_geometry with the reason — levels are never clamped or
  repaired here.

Usage: python3 rejected_abstain_sample.py [--status live-paper-status-*.json]
       [--dry-run]
Run as a collection step AFTER the status pull (step 3d). Idempotent:
sampling dedupes on candidate id; outcomes dedupe on sample id.
"""

import glob
import json
import os
import sys
from datetime import datetime, timezone

BASE = os.path.dirname(os.path.abspath(__file__))
LEDGER_PATH = os.path.join(BASE, "rows", "rejected-abstain-sample.jsonl")
WINDOW_START_MS = int(datetime(2026, 10, 21, tzinfo=timezone.utc).timestamp() * 1000)
WINDOW_END_MS = int(datetime(2026, 11, 18, 23, 59, 59, tzinfo=timezone.utc).timestamp() * 1000)
PER_RUN_CAP = 5
TOTAL_CAP = 50

sys.path.insert(0, BASE)
from challenger_shadow_eval import fetch_klines, evaluate_position, net_r, parse_ts_ms, iso_ms, CAP_MS  # noqa: E402


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_ledger():
    samples, outcomes = {}, set()
    if os.path.exists(LEDGER_PATH):
        with open(LEDGER_PATH) as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                r = json.loads(line)
                if r.get("record_type") == "abstain_sample":
                    samples[r["sample_id"]] = r
                elif r.get("record_type") == "abstain_sample_outcome":
                    outcomes.add(r["sample_id"])
    return samples, outcomes


def newest_status():
    files = sorted(glob.glob(os.path.join(BASE, "live-paper-status-*.json")),
                   key=os.path.getmtime)
    return files[-1] if files else None


def main(argv):
    args = argv[1:]
    dry_run = "--dry-run" in args
    status_path = None
    if "--status" in args:
        status_path = args[args.index("--status") + 1]
    if status_path is None:
        status_path = newest_status()
    if not status_path or not os.path.exists(status_path):
        print(json.dumps({"error": "no status pull available", "status_path": status_path}))
        return 1
    with open(status_path) as f:
        status = json.load(f)
    data = status.get("data") or status
    candidates = data.get("candidates") or []

    samples, outcomes = load_ledger()
    now_ms = int(datetime.now(timezone.utc).timestamp() * 1000)

    # ---- sampling ------------------------------------------------------
    eligible, excluded = [], {"venue_mex_research_only": 0, "missing_levels": 0,
                              "outside_window": 0, "already_sampled": 0}
    for c in candidates:
        if c.get("reasonCode") != "production_model_abstain":
            continue
        decision_ms = parse_ts_ms(c.get("decisionAt"))
        if decision_ms is None or not (WINDOW_START_MS <= decision_ms <= WINDOW_END_MS):
            excluded["outside_window"] += 1
            continue
        sid = f"abstain-sample:{c.get('id')}"
        if sid in samples:
            excluded["already_sampled"] += 1
            continue
        if c.get("venue") != "Binance Spot":
            excluded["venue_mex_research_only"] += 1
            continue
        if c.get("decisionReferencePrice") is None or c.get("stopPrice") is None:
            excluded["missing_levels"] += 1
            continue
        eligible.append(c)
    eligible.sort(key=lambda c: parse_ts_ms(c.get("decisionAt")))
    room = max(0, TOTAL_CAP - len(samples))
    take = eligible[:min(PER_RUN_CAP, room)]

    new_records = []
    for c in take:
        entry = float(c["decisionReferencePrice"])
        stop = float(c["stopPrice"])
        direction = c.get("direction") or "long"
        risk = (entry - stop) if direction != "short" else (stop - entry)
        rec = {
            "record_type": "abstain_sample",
            "sample_id": f"abstain-sample:{c.get('id')}",
            "measurement_only": True,
            "record_label": ("MEASUREMENT ONLY — production model abstention sample; "
                             "never issued, never enrolled, not actionable"),
            "sampled_at": now_iso(),
            "candidate_id": c.get("id"),
            "candidate_key": c.get("candidateKey"),
            "symbol": c.get("symbol"),
            "coin_id": c.get("coinId"),
            "instrument": c.get("instrument"),
            "venue": c.get("venue"),
            "direction": direction,
            "decision_at": c.get("decisionAt"),
            "discovery_run_id": c.get("discoveryRunId"),
            "production_score": c.get("productionScore"),
            "baseline_disposition": "abstained:production_model_abstain",
            "entry_convention": "hypothetical entry at recorded decisionReferencePrice",
            "entry": entry,
            "entry_observed_at": c.get("decisionAt"),
            "invalidation": stop,
            "invalidation_basis": "recorded_candidate_stopPrice",
            "evaluator": "crypto-evaluation-v5-corrected",
            "costs": {"bps_round_trip": 18,
                      "clause": "18 bps round-trip modeled (crypto-evaluation-v5-corrected)"},
        }
        if risk <= 0:
            rec["evaluable"] = False
            rec["non_evaluable_reason"] = "wrong_sided_or_zero_risk_invalidation"
            rec["risk_distance"] = risk
        else:
            rec["evaluable"] = True
            rec["risk_distance"] = risk
            rec["target1"] = entry + 1.5 * risk if direction != "short" else entry - 1.5 * risk
            rec["target1_basis"] = "derived_frozen_geometry_1.5R"
            rec["target2"] = None
            rec["target2_note"] = "not recorded for abstained candidates; target1 settles first under first-touch"
        new_records.append(rec)
        samples[rec["sample_id"]] = rec

    # ---- evaluation of open samples ------------------------------------
    results = []
    for sid, rec in samples.items():
        if sid in outcomes or not rec.get("evaluable"):
            continue
        pos = {"entry": rec["entry"], "invalidation": rec["invalidation"],
               "target1": rec["target1"], "direction": rec["direction"],
               "entry_observed_at": rec["entry_observed_at"],
               "decision_at": rec["decision_at"]}
        entry_ms = parse_ts_ms(rec["decision_at"])
        end_ms = min(now_ms, entry_ms + CAP_MS + 3600_000)
        try:
            bars = fetch_klines(rec["instrument"], entry_ms, end_ms)
        except Exception as e:
            results.append({"sample_id": sid, "status": "fetch_failed",
                            "detail": str(e)[:160]})
            continue
        out = evaluate_position(pos, bars, now_ms)
        if out is None:
            results.append({"sample_id": sid, "status": "open_no_event"})
            continue
        outcome_rec = {
            "record_type": "abstain_sample_outcome",
            "measurement_only": True,
            "record_label": ("MEASUREMENT ONLY — forward outcome of a production model "
                             "abstention; not a position outcome"),
            "sample_id": sid,
            "candidate_id": rec["candidate_id"],
            "symbol": rec["symbol"],
            "coin_id": rec["coin_id"],
            "direction": rec["direction"],
            "venue": rec["venue"],
            "decision_at": rec["decision_at"],
            "entry_price": rec["entry"],
            "frozen_levels": {"invalidation": rec["invalidation"],
                              "target1": rec["target1"],
                              "target1_basis": rec["target1_basis"]},
            "barrier_rule": "TOUCH (bar high/low, completed 1m bars only)",
            "evaluator": "crypto-evaluation-v5-corrected",
            "costs": rec["costs"],
            "recorded_at_utc": now_iso(),
            **out,
        }
        if "gross_r" in out:
            outcome_rec["net_r"] = net_r(out["gross_r"], pos)
        results.append({"sample_id": sid, "status": "closed",
                        "outcome": out["outcome"], "gross_r": out.get("gross_r"),
                        "net_r": outcome_rec.get("net_r")})
        if not dry_run:
            with open(LEDGER_PATH, "a") as f:
                f.write(json.dumps(outcome_rec) + "\n")
            outcomes.add(sid)

    if not dry_run:
        with open(LEDGER_PATH, "a") as f:
            for rec in new_records:
                f.write(json.dumps(rec) + "\n")

    print(json.dumps({
        "ran_at": now_iso(),
        "status_pull": os.path.basename(status_path),
        "bound": {"window": ["2026-10-21T00:00:00Z", "2026-11-18T23:59:59Z"],
                  "per_run_cap": PER_RUN_CAP, "total_cap": TOTAL_CAP},
        "new_samples": [r["sample_id"] for r in new_records],
        "total_samples": len(samples),
        "excluded_counts": excluded,
        "evaluation_results": results,
        "dry_run": dry_run,
    }, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
