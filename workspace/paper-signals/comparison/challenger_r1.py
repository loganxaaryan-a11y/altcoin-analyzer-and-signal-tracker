#!/usr/bin/env python3
"""Challenger-R1 shadow scorer (registration challenger-r1-v1).

Sandbox/research only. Paper signals only. No brokerage. SHADOW ONLY:
this scorer never touches production records, the frozen harness, the
prospective cohort vessel, or any holdout. It reads the live paper status
pull (the same file the collection cron saves in its step 1) and appends
Challenger-R1 shadow records to rows/challenger-r1-shadow-v1.jsonl.

Registration integrity: the scorer loads
registrations/challenger-r1-v1.registration.json and verifies the
registered rule text's sha256 against
registrations/challenger-r1-v1.rule-text.md on every run. A mismatch
fails loudly and scores nothing — any rule-text change voids the
registration (see the rule text, "No retuning").

Prospective only: candidates with decisionAt before the registration's
frozen_at_utc are REFUSED (counted and reported, never written). No
backfilling, ever.

Idempotent: dedupe key (registration_id, deployed_candidate_id).

Usage:
  python3 challenger_r1.py --status live-paper-status-<UTC>.json [--dry-run]
"""

import hashlib
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

BASE = os.path.dirname(os.path.abspath(__file__))
REG_PATH = os.path.join(BASE, "registrations", "challenger-r1-v1.registration.json")
SHADOW_PATH = os.path.join(BASE, "rows", "challenger-r1-shadow-v1.jsonl")
VISION = "https://data-api.binance.vision"
WINDOW_MS = 900_000  # mirrors the frozen 900 s entry window
MAX_PAGES = 10


class RegistrationError(Exception):
    pass


def parse_ts_ms(value):
    """ISO-8601 (Z or offset) -> epoch ms; None if unparseable."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return int(value)
    s = str(value).strip()
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return int(dt.timestamp() * 1000)


def iso_ms(ms):
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).strftime(
        "%Y-%m-%dT%H:%M:%S.") + f"{ms % 1000:03d}Z"


def load_registration():
    with open(REG_PATH) as f:
        reg = json.load(f)
    rule_path = os.path.join(BASE, reg["rule_text_path"])
    with open(rule_path, "rb") as f:
        digest = hashlib.sha256(f.read()).hexdigest()
    if digest != reg["rule_text_sha256"]:
        raise RegistrationError(
            "rule text hash mismatch: registered %s, file hashes %s — "
            "registration is void; refusing to score"
            % (reg["rule_text_sha256"], digest))
    reg["_frozen_ms"] = parse_ts_ms(reg["frozen_at_utc"])
    return reg


def load_json_field(value):
    if value is None:
        return None
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------------------
# R3 — attainable-score transparency (measurement only)
# ---------------------------------------------------------------------------

def score_transparency(factors, recorded_score):
    """Recompute the production score from the factor ledger and record the
    attainable arithmetic. A factor is dark iff status == 'unavailable';
    a 'neutral' reading is measured (contributes toward attainable)."""
    total_weight = sum(float(f["weight"]) for f in factors)
    factor_sum = sum(float(f["contribution"]) for f in factors)
    by_name = {f["name"]: f for f in factors}
    tax = (by_name.get("Trend", {}).get("status") == "pass"
           and by_name.get("Momentum", {}).get("status") == "pass")
    recomputed = factor_sum - 10 if tax else factor_sum
    dark = [f["name"] for f in factors if f.get("status") == "unavailable"]
    attainable = sum(float(f["weight"]) for f in factors
                     if f.get("status") != "unavailable")
    normalized = (recomputed / attainable) if attainable > 0 else None
    return {
        "factor_sum": factor_sum,
        "redundancy_tax_applied": tax,
        "recomputed_score": recomputed,
        "recorded_score": recorded_score,
        "score_crosscheck_match": (recorded_score is not None
                                   and float(recorded_score) == float(recomputed)),
        "nominal_total_weight": total_weight,
        "attainable_score": attainable,
        "dark_factors": dark,
        "normalized_score": normalized,
        "shadow_disposition_bar_0_75": (
            "would_pass" if (normalized is not None and normalized >= 0.75) else "would_abstain"),
        "shadow_disposition_bar_0_80": (
            "would_pass" if (normalized is not None and normalized >= 0.80) else "would_abstain"),
    }


# ---------------------------------------------------------------------------
# R2 — level provenance: malformed vs already-crossed
# ---------------------------------------------------------------------------

def score_levels(candidate, source):
    """Per-level provenance for the frozen invalidation. Strictness is
    unchanged: wrong_side rejects under both malformed and already_crossed.
    Construction validity (derivation recorded + compatible) is assessed
    BEFORE the crossed test, per the registered rule text."""
    stop = candidate.get("stopPrice")
    level_source_field = "candidate.stopPrice"
    if stop is None and source:
        stop = source.get("invalidationLevel")
        level_source_field = "source.invalidationLevel" if stop is not None else None
    reference = candidate.get("decisionReferencePrice")
    source_as_of = candidate.get("sourceObservedAt") or (
        source.get("sourceAsOf") if source else None)
    direction = candidate.get("direction")
    deriv = candidate.get("invalidationDerivation") or (
        source.get("invalidationDerivation") if source else None)
    derivation_recorded = bool(
        deriv and deriv.get("source") and deriv.get("windowEnd") and deriv.get("formulaId"))
    compatible = None
    if derivation_recorded:
        win_end = parse_ts_ms(deriv.get("windowEnd"))
        ref_asof = parse_ts_ms(source_as_of)
        same_venue = (not deriv.get("venue")) or (
            str(deriv.get("venue")).lower().replace(" ", "-")
            == str(candidate.get("venue") or "").lower().replace(" ", "-"))
        compatible = bool(win_end is not None and ref_asof is not None
                          and win_end <= ref_asof and same_venue)
    if stop is None or reference is None:
        return {
            "component": "levels",
            "classification": "not_applicable",
            "reason": "no_frozen_levels_on_record" if stop is None else "no_reference_on_record",
            "invalidation": stop, "reference": reference,
            "level_source_field": level_source_field,
        }
    if direction == "short":
        geometry = "correct_side" if float(stop) > float(reference) else "wrong_side"
    else:
        geometry = "correct_side" if float(stop) < float(reference) else "wrong_side"
    # Pre-decision price evidence: the reference observation itself (observed
    # at source_as_of <= decision instant) is beyond the level exactly when
    # the geometry against it is wrong_side.
    crossing_visible = (geometry == "wrong_side")
    if geometry == "correct_side":
        classification = "ok"
        reason = None
    elif derivation_recorded and compatible and crossing_visible:
        classification = "already_crossed"
        reason = "construction_valid_price_already_beyond_level"
    elif not derivation_recorded:
        classification = "malformed"
        reason = "missing_derivation"
    elif not compatible:
        classification = "malformed"
        reason = "incompatible_derivation"
    else:
        classification = "malformed"
        reason = "no_crossing_evidence"
    return {
        "component": "levels",
        "classification": classification,
        "reason": reason,
        "invalidation": stop,
        "reference": reference,
        "reference_source_as_of": source_as_of,
        "level_source_field": level_source_field,
        "geometry": geometry,
        "derivation_recorded": derivation_recorded,
        "derivation": deriv if derivation_recorded else None,
        "derivation_compatible": compatible,
        "provenance_complete": bool(derivation_recorded and compatible),
        "crossing_visible_in_predecision_data": crossing_visible,
    }


# ---------------------------------------------------------------------------
# R1 — drift reference capture + re-anchored drift test
# ---------------------------------------------------------------------------

def fetch_agg_trades(symbol, start_ms, end_ms):
    """Page the venue's aggTrades for [start_ms, end_ms]. Returns
    (rows, meta). Rows are the raw venue rows (a, p, T)."""
    rows, digest = [], hashlib.sha256()
    start = start_ms
    pages = 0
    truncated = False
    while True:
        pages += 1
        q = urllib.parse.urlencode({
            "symbol": symbol, "startTime": start, "endTime": end_ms, "limit": 1000})
        req = urllib.request.Request(
            VISION + "/api/v3/aggTrades?" + q,
            headers={"User-Agent": "challenger-r1-shadow-scorer/1.0"})
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
        digest.update(raw)
        page = json.loads(raw)
        if not page:
            break
        rows.extend(page)
        if len(page) < 1000:
            break
        if pages >= MAX_PAGES:
            truncated = True
            break
        start = int(page[-1]["T"])  # page forward; dedupe by agg id below
    seen, uniq = set(), []
    for row in rows:
        if row["a"] not in seen:
            seen.add(row["a"])
            uniq.append(row)
    uniq.sort(key=lambda r: int(r["T"]))
    return uniq, {"pages": pages, "returned_count": len(uniq),
                  "response_sha256": digest.hexdigest(), "truncated": truncated}


def capture_reference(instrument, decision_ms, fetcher):
    """The registered capture: last admissible print at or before the
    decision instant over [decision - 900 s, decision]. Only prints with
    venue timestamp <= decision instant are admissible."""
    start_ms = decision_ms - WINDOW_MS
    try:
        rows, meta = fetcher(instrument, start_ms, decision_ms)
    except Exception as e:  # fetch failure -> UNVERIFIED, never a later anchor
        return {"reference_status": "unverified", "reason": "fetch_failed",
                "detail": str(e)[:200]}
    admissible = [r for r in rows if int(r["T"]) <= decision_ms]
    if meta.get("truncated") and (not admissible
                                  or int(admissible[-1]["T"]) < decision_ms - 1000):
        return {"reference_status": "unverified", "reason": "tail_not_established",
                "fetch": meta}
    if not admissible:
        return {"reference_status": "unverified",
                "reason": "no_predecision_print_in_window", "fetch": meta}
    last = admissible[-1]
    return {
        "reference_status": "captured",
        "price": float(last["p"]),
        "venue_trade_id": str(last["a"]),
        "print_ts": iso_ms(int(last["T"])),
        "age_ms_at_decision": decision_ms - int(last["T"]),
        "fetch": {"endpoint": "data-api.binance.vision/api/v3/aggTrades",
                  "symbol": instrument, "window_start_ms": start_ms,
                  "window_end_ms": decision_ms, **meta},
    }


def score_drift(candidate, checkpoint, fetcher):
    baseline = baseline_treatment(candidate)
    decision_ms = parse_ts_ms(candidate.get("decisionAt"))
    has_checkpoint = checkpoint is not None
    applicable = has_checkpoint or baseline in (
        "issued", "abstained:entry_outside_drift_zone")
    if not applicable:
        return {"component": "drift", "verdict": "not_applicable",
                "reason": "baseline_never_ran_drift_test"}
    venue = None
    if checkpoint:
        cov = load_json_field(checkpoint.get("coverageJson")) or {}
        venue = cov.get("venue")
    if not venue:
        venue = candidate.get("venue")
    if str(venue or "").lower().replace(" ", "-") != "binance-spot":
        return {"component": "drift", "verdict": "unverified",
                "reason": "reference_capture_unsupported_venue", "venue": venue}
    cap = capture_reference(candidate.get("instrument"), decision_ms, fetcher)
    if cap["reference_status"] != "captured":
        return {"component": "drift", "verdict": "unverified", **cap}
    entry_price = candidate.get("entryPrice")
    entry_at = candidate.get("entryObservedAt")
    if entry_price is None and checkpoint:
        entry_price = checkpoint.get("firstPrintPrice")
        entry_at = checkpoint.get("firstPrintObservedAt")
    base = {"component": "drift", "reference": cap,
            "baseline_reference": candidate.get("decisionReferencePrice")}
    if entry_price is None:
        return {**base, "verdict": "no_entry_print",
                "reason": "baseline_fetched_no_print"}
    band = candidate.get("permittedDriftBps")
    band = float(band) if band is not None else 50.0
    drift_bps = abs(float(entry_price) - cap["price"]) / cap["price"] * 10000.0
    base_ref = candidate.get("decisionReferencePrice")
    baseline_drift_bps = (abs(float(entry_price) - float(base_ref)) / float(base_ref)
                          * 10000.0) if base_ref else None
    return {**base,
            "verdict": "pass" if drift_bps <= band else "reject",
            "entry_print": {"price": entry_price, "observed_at": entry_at},
            "drift_bps_vs_decision_reference": round(drift_bps, 2),
            "drift_bps_vs_scan_reference": (round(baseline_drift_bps, 2)
                                            if baseline_drift_bps is not None else None),
            "band_bps": band}


# ---------------------------------------------------------------------------
# R4 — ATH contextual component
# ---------------------------------------------------------------------------

def score_ath(candidate, source):
    fields = {}
    for key in ("athDistancePct", "athDate", "priceVsSma50", "trend20d"):
        if candidate.get(key) is not None:
            fields[key] = candidate.get(key)
        elif source and source.get(key) is not None:
            fields[key] = source.get(key)
    if len(fields) < 4:
        return {"component": "ath", "ath_component": "unverified",
                "reason": "ath_fields_not_in_candidate_record",
                "athDistancePct": fields.get("athDistancePct"),
                "athDate": fields.get("athDate")}
    conjunction = (float(fields["athDistancePct"]) <= -75.0
                   and float(fields["priceVsSma50"]) < 0
                   and float(fields["trend20d"]) < 0)
    return {"component": "ath", "ath_component": "evaluated",
            "athDistancePct": fields["athDistancePct"], "athDate": fields["athDate"],
            "conjunction_hard_exclusion": conjunction, "fields": fields}


# ---------------------------------------------------------------------------
# Composition
# ---------------------------------------------------------------------------

def baseline_treatment(candidate):
    state = candidate.get("state")
    reason = candidate.get("reasonCode")
    if state == "issued":
        return "issued"
    if reason:
        return f"{state}:{reason}"
    return str(state)


def build_would_contract(candidate, levels):
    if levels.get("classification") not in ("ok", None):
        return None
    return {
        "entry": candidate.get("entryPrice"),
        "entry_observed_at": candidate.get("entryObservedAt"),
        "invalidation": candidate.get("stopPrice"),
        "target1": candidate.get("targetPrice"),
        "contract_status": ("complete" if candidate.get("entryPrice") is not None
                            and candidate.get("stopPrice") is not None
                            else "incomplete_missing_fields"),
        "settlement_evaluator": "crypto-evaluation-v5-corrected",
        "settlement_status": "not_enrolled_shadow_bookkeeping_only",
    }


def compose(candidate, drift, levels, ath):
    baseline = baseline_treatment(candidate)
    divergences = []

    def drift_div(kind, chal):
        return {"component": "drift_reanchor", "kind": kind,
                "baseline_treatment": baseline, "challenger_treatment": chal,
                "inputs": {
                    "baseline_reference": drift.get("baseline_reference"),
                    "challenger_reference": (drift.get("reference") or {}).get("price"),
                    "reference_status": (drift.get("reference") or {}).get("reference_status")
                    if drift.get("reference") else drift.get("reference_status"),
                    "entry_print": drift.get("entry_print"),
                    "drift_bps_baseline": drift.get("drift_bps_vs_scan_reference"),
                    "drift_bps_challenger": drift.get("drift_bps_vs_decision_reference"),
                    "band_bps": drift.get("band_bps")}}

    if baseline == "abstained:invalid_frozen_levels" and levels.get("classification") in (
            "malformed", "already_crossed"):
        divergences.append({
            "component": "levels_reason_split", "kind": "reason_split",
            "baseline_treatment": "abstained:invalid_frozen_levels",
            "challenger_treatment": f"reject:{levels['classification']}",
            "inputs": {"invalidation": levels.get("invalidation"),
                       "reference": levels.get("reference"),
                       "reference_source_as_of": levels.get("reference_source_as_of"),
                       "derivation_recorded": levels.get("derivation_recorded"),
                       "geometry": levels.get("geometry"),
                       "classification_reason": levels.get("reason"),
                       "crossing_visible_in_predecision_data":
                           levels.get("crossing_visible_in_predecision_data")}})

    if baseline == "issued":
        if drift.get("verdict") == "reject":
            divergences.append(drift_div("disposition", "would_reject"))
            return "would_reject", divergences, None
        if drift.get("verdict") == "unverified":
            return "concur_with_unverified_drift", divergences, None
        return "concur_issued", divergences, None

    if baseline == "abstained:entry_outside_drift_zone":
        if drift.get("verdict") == "pass":
            if levels.get("classification") in ("malformed", "already_crossed"):
                return "abstain_levels_conflict", divergences, None
            divergences.append(drift_div("disposition", "would_issue"))
            return "would_issue", divergences, build_would_contract(candidate, levels)
        if drift.get("verdict") == "unverified":
            divergences.append(drift_div("disposition", "abstain_unverified_drift"))
            return "abstain_unverified_drift", divergences, None
        if drift.get("verdict") == "reject":
            return "concur_abstain", divergences, None
        return "concur_abstain", divergences, None  # no_entry_print mirrors baseline void

    if baseline.startswith("abstained"):
        return "concur_abstain", divergences, None
    if baseline.startswith("deferred"):
        return "concur_deferred", divergences, None
    return f"mirror:{baseline}", divergences, None


def score_candidate(candidate, checkpoint, reg, fetcher):
    factors = load_json_field(candidate.get("factorLedgerJson")) or []
    source = None
    op = load_json_field(candidate.get("operationalEvidenceJson"))
    if isinstance(op, dict):
        source = op.get("source") if isinstance(op.get("source"), dict) else None
    transparency = score_transparency(factors, candidate.get("productionScore"))
    levels = score_levels(candidate, source)
    drift = score_drift(candidate, checkpoint, fetcher)
    ath = score_ath(candidate, source)
    disposition, divergences, contract = compose(candidate, drift, levels, ath)
    if not transparency["score_crosscheck_match"]:
        divergences.append({
            "component": "transparency_none", "kind": "data_quality",
            "baseline_treatment": baseline_treatment(candidate),
            "challenger_treatment": disposition,
            "inputs": {"recomputed_score": transparency["recomputed_score"],
                       "recorded_score": transparency["recorded_score"],
                       "note": "recomputed score from the factor ledger does not "
                               "match the recorded production score; flagged, "
                               "never overwritten"}})
    return {
        "registration_id": reg["registration_id"],
        "rule_text_sha256": reg["rule_text_sha256"],
        "scored_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "deployed_candidate_id": candidate.get("id"),
        "shadow_key": f"live-paper-cand-{candidate.get('id')}",
        "candidate_key": candidate.get("candidateKey"),
        "symbol": candidate.get("symbol"),
        "coin_id": candidate.get("coinId"),
        "direction": candidate.get("direction"),
        "decision_at": candidate.get("decisionAt"),
        "cluster": {"asset": candidate.get("coinId"),
                    "discovery_run_id": candidate.get("discoveryRunId")},
        "baseline_disposition": baseline_treatment(candidate),
        "baseline_score": candidate.get("productionScore"),
        "challenger_disposition": disposition,
        "components": {"transparency": transparency, "levels": levels,
                       "drift": drift, "ath": ath},
        "divergences": divergences,
        "would_be_contract": contract,
    }


def existing_keys(path):
    keys = set()
    if os.path.exists(path):
        with open(path) as f:
            for line in f:
                line = line.strip()
                if line:
                    r = json.loads(line)
                    keys.add((r["registration_id"], r["deployed_candidate_id"]))
    return keys


def main(argv):
    args = argv[1:]
    status_path = args[args.index("--status") + 1] if "--status" in args else None
    out_path = args[args.index("--out") + 1] if "--out" in args else SHADOW_PATH
    dry_run = "--dry-run" in args
    if not status_path:
        print("usage: challenger_r1.py --status <live-paper-status.json> [--out PATH] [--dry-run]",
              file=sys.stderr)
        return 2
    reg = load_registration()
    with open(status_path) as f:
        status = json.load(f)
    data = status.get("data", status)
    candidates = data.get("candidates", [])
    checkpoints = {cp.get("candidateId"): cp for cp in data.get("checkpoints", [])}
    keys = existing_keys(out_path)
    scored, refused, skipped = [], 0, 0
    records = []
    for cand in candidates:
        decision_ms = parse_ts_ms(cand.get("decisionAt"))
        if decision_ms is None or decision_ms < reg["_frozen_ms"]:
            refused += 1
            continue
        key = (reg["registration_id"], cand.get("id"))
        if key in keys:
            skipped += 1
            continue
        rec = score_candidate(cand, checkpoints.get(cand.get("id")), reg,
                              fetch_agg_trades)
        records.append(rec)
        scored.append(cand.get("id"))
    if records and not dry_run:
        with open(out_path, "a") as f:
            for rec in records:
                f.write(json.dumps(rec) + "\n")
    summary = {
        "registration_id": reg["registration_id"],
        "rule_text_sha256": reg["rule_text_sha256"],
        "frozen_at_utc": reg["frozen_at_utc"],
        "candidates_seen": len(candidates),
        "refused_pre_registration": refused,
        "already_recorded": skipped,
        "newly_scored": scored,
        "divergences": sum(len(r["divergences"]) for r in records),
        "unverified_drift": sum(1 for r in records
                                 if r["components"]["drift"].get("verdict") == "unverified"),
        "dry_run": dry_run,
    }
    print(json.dumps(summary, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
