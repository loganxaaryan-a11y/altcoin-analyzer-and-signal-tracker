#!/usr/bin/env python3
"""Challenger-R1 shadow scorer (registration challenger-r1-v2).

Sandbox/research only. Paper signals only. No brokerage. SHADOW ONLY:
this scorer never touches production records, the frozen harness, the
prospective cohort vessel, production monitoring, or any holdout. It reads
the live paper status pull (the same file the collection cron saves in its
step 1) plus the discovery observations pull, and appends Challenger-R1 v2
shadow records to rows/challenger-r1-shadow-v2.jsonl, R4 population records
to rows/challenger-r1-r4-population-v2.jsonl, and shadow-book enrollments
to rows/challenger-r1-shadow-book-v2.jsonl.

Registration integrity: loads registrations/challenger-r1-v2.registration.json
and verifies the registered rule text's sha256 on every run. A mismatch
fails loudly and scores nothing — any rule-text change voids v2.

Prospective only: candidates with decisionAt before v2's frozen_at_utc are
REFUSED (counted and reported, never written). No backfilling, ever.

Idempotent: dedupe key (registration_id, deployed_candidate_id) for shadow
records; (registration_id, discovery_run_id, coin_id) for population
records; enrollment id for book records.

Usage:
  python3 challenger_r1_v2.py --status live-paper-status-<UTC>.json \
      [--observations discovery-observations-<UTC>.json] \
      [--funnel discovery-funnel-<UTC>.json] [--dry-run]
"""

import hashlib
import itertools
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

BASE = os.path.dirname(os.path.abspath(__file__))
REG_PATH = os.path.join(BASE, "registrations", "challenger-r1-v2.registration.json")
SHADOW_PATH = os.path.join(BASE, "rows", "challenger-r1-shadow-v2.jsonl")
POP_PATH = os.path.join(BASE, "rows", "challenger-r1-r4-population-v2.jsonl")
BOOK_PATH = os.path.join(BASE, "rows", "challenger-r1-shadow-book-v2.jsonl")
VISION = "https://data-api.binance.vision"
COINGECKO = "https://api.coingecko.com"
WINDOW_MS = 900_000  # mirrors the frozen 900 s entry window
MAX_PAGES = 10
CG_SLEEP_S = 1.6  # keyless rate-limit politeness

# Registered state-to-contribution map (v2 rule text, Section A). A factor's
# best state for the attainable-max computation; the map is frozen with the
# registration and is never extended at run time.
STATE_MAP = {
    "Trend": {"pass": 20, "mixed": 10, "fail": 0},
    "Momentum": {"pass": 15, "mixed": 8, "fail": 0},
    "Volatility": {"pass": 10, "mixed": 5, "fail": 0},
    "Volume": {"pass": 15, "mixed": 8, "fail": 0},
    "Positioning / funding": {"neutral": 0},
    "Network fundamentals": {},
    "Supply overhang": {"pass": 15, "mixed": 8, "fail": 0},
}


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
        "%Y-%m-%dT%H:%M:%S.") + f"{int(ms) % 1000:03d}Z"


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


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
    with open(os.path.abspath(__file__), "rb") as f:
        reg["_scorer_sha256"] = hashlib.sha256(f.read()).hexdigest()
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
# R3 — attainable-score transparency, corrected (measurement only)
# ---------------------------------------------------------------------------

def score_transparency(factors, recorded_score):
    """Recompute the production score; record measured_weight_sum and the
    corrected attainable_max_score (supremum of the scoring function over
    the registered state map, incl. the -10 Trend/Momentum interaction)."""
    total_weight = sum(float(f["weight"]) for f in factors)
    factor_sum = sum(float(f["contribution"]) for f in factors)
    by_name = {f["name"]: f for f in factors}
    tax = (by_name.get("Trend", {}).get("status") == "pass"
           and by_name.get("Momentum", {}).get("status") == "pass")
    recomputed = factor_sum - 10 if tax else factor_sum
    dark = [f["name"] for f in factors if f.get("status") == "unavailable"]
    measured = [f for f in factors if f.get("status") != "unavailable"]
    measured_weight_sum = sum(float(f["weight"]) for f in measured)
    # Attainable max: per measured factor, the best contribution in the
    # registered map; an unmapped factor/status contributes its own recorded
    # contribution as its only state and is flagged (map never extended).
    unmapped = []
    option_lists = []
    for f in measured:
        row = STATE_MAP.get(f["name"])
        if row is None or f.get("status") not in (row or {}):
            if f.get("status") not in (row or {}):
                unmapped.append({"factor": f["name"], "status": f.get("status"),
                                 "contribution": f.get("contribution")})
            contrib = float(f["contribution"])
            option_lists.append([(f["name"], contrib, contrib == float(f["weight"])
                                  and f.get("status") == "pass")])
        else:
            option_lists.append([(f["name"], float(v), s == "pass")
                                 for s, v in row.items()])
    best = None
    for combo in itertools.product(*option_lists):
        s = sum(c[1] for c in combo)
        passes = {c[0]: c[2] for c in combo}
        if passes.get("Trend") and passes.get("Momentum"):
            s -= 10
        best = s if best is None else max(best, s)
    attainable_max = best if best is not None else 0.0
    normalized = (recomputed / attainable_max) if attainable_max > 0 else None
    return {
        "factor_sum": factor_sum,
        "redundancy_tax_applied": tax,
        "recomputed_score": recomputed,
        "recorded_score": recorded_score,
        "score_crosscheck_match": (recorded_score is not None
                                   and float(recorded_score) == float(recomputed)),
        "nominal_total_weight": total_weight,
        "measured_weight_sum": measured_weight_sum,
        "attainable_max_score": attainable_max,
        "dark_factors": dark,
        "unmapped_states_flagged": unmapped,
        "normalized_score": normalized,
        "shadow_disposition_bar_0_75": (
            "would_pass" if (normalized is not None and normalized >= 0.75) else "would_abstain"),
        "shadow_disposition_bar_0_80": (
            "would_pass" if (normalized is not None and normalized >= 0.80) else "would_abstain"),
    }


# ---------------------------------------------------------------------------
# R2 — level provenance labeling (provenance measurement only)
# ---------------------------------------------------------------------------

def score_levels(candidate, source, decision_ms):
    """Codes, in assessment order: malformed = derivation RECORDED and shown
    incompatible; unverified = derivation missing or evidence not
    pre-decision; already_crossed = valid construction + pre-decision
    crossing; ok = correct side + valid derivation."""
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
    ref_asof_ms = parse_ts_ms(source_as_of)
    evidence_predecision = bool(ref_asof_ms is not None and decision_ms is not None
                                and ref_asof_ms <= decision_ms)
    crossing_visible = (geometry == "wrong_side") and evidence_predecision
    if derivation_recorded and compatible is False:
        classification = "malformed"
        reason = "derivation_recorded_and_demonstrated_incompatible"
    elif not derivation_recorded:
        classification = "unverified"
        reason = "missing_derivation"
    elif geometry == "wrong_side" and not evidence_predecision:
        classification = "unverified"
        reason = "crossing_evidence_not_predecision"
    elif geometry == "wrong_side":
        classification = "already_crossed"
        reason = "construction_valid_price_already_beyond_level"
    else:
        classification = "ok"
        reason = None
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
        "measures": "provenance_only_not_construction_validation",
    }


# ---------------------------------------------------------------------------
# Venue fetches (aggTrades) — timed, with fetch/receipt stamps
# ---------------------------------------------------------------------------

def fetch_agg_trades(symbol, start_ms, end_ms):
    """Page the venue's aggTrades for [start_ms, end_ms]. Returns
    (rows, meta) with meta carrying fetch_started_at / fetch_received_at
    (wall-clock ms) for the receipt verification."""
    started = time.time()
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
            headers={"User-Agent": "challenger-r1-shadow-scorer/2.0"})
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
        start = int(page[-1]["T"])
    received = time.time()
    seen, uniq = set(), []
    for row in rows:
        if row["a"] not in seen:
            seen.add(row["a"])
            uniq.append(row)
    uniq.sort(key=lambda r: int(r["T"]))
    return uniq, {"pages": pages, "returned_count": len(uniq),
                  "response_sha256": digest.hexdigest(), "truncated": truncated,
                  "fetch_started_at": iso_ms(int(started * 1000)),
                  "fetch_received_at": iso_ms(int(received * 1000)),
                  "fetch_started_ms": int(started * 1000),
                  "fetch_received_ms": int(received * 1000)}


def capture_reference(instrument, decision_ms, fetcher):
    """Last admissible print at or before the decision instant over
    [decision - 900 s, decision], with fetch/receipt timing and the
    live-vs-reconstructed basis determination."""
    start_ms = decision_ms - WINDOW_MS
    try:
        rows, meta = fetcher(instrument, start_ms, decision_ms)
    except Exception as e:
        return {"reference_status": "unverified", "reason": "fetch_failed",
                "detail": str(e)[:200]}
    admissible = [r for r in rows if int(r["T"]) <= decision_ms]
    timing = {"fetch_started_at": meta.get("fetch_started_at"),
              "fetch_received_at": meta.get("fetch_received_at")}
    if meta.get("truncated") and (not admissible
                                  or int(admissible[-1]["T"]) < decision_ms - 1000):
        return {"reference_status": "unverified", "reason": "tail_not_established",
                "fetch": meta, **timing}
    if not admissible:
        return {"reference_status": "unverified",
                "reason": "no_predecision_print_in_window", "fetch": meta, **timing}
    last = admissible[-1]
    received_ms = meta.get("fetch_received_ms")
    live = bool(received_ms is not None and received_ms <= decision_ms)
    return {
        "reference_status": "captured",
        "reference_basis": "live_capture" if live else "historical_reconstruction",
        "receipt_predecision_verified": live,
        "labeled_reconstructed": (not live),
        "price": float(last["p"]),
        "venue_trade_id": str(last["a"]),
        "print_ts": iso_ms(int(last["T"])),
        "age_ms_at_decision": decision_ms - int(last["T"]),
        "fetch": {"endpoint": "data-api.binance.vision/api/v3/aggTrades",
                  "symbol": instrument, "window_start_ms": start_ms,
                  "window_end_ms": decision_ms, **meta},
        **timing,
    }


def select_entry_print(instrument, decision_ms, fetcher):
    """The challenger's OWN entry print: first venue print strictly after
    the decision instant, at or before decision + 900 s. Independent of the
    production checkpoint's print."""
    end_ms = decision_ms + WINDOW_MS
    try:
        rows, meta = fetcher(instrument, decision_ms, end_ms)
    except Exception as e:
        return {"selection_status": "fetch_failed", "detail": str(e)[:200]}
    in_window = [r for r in rows if decision_ms < int(r["T"]) <= end_ms]
    if not in_window:
        return {"selection_status": "no_print_in_window", "fetch": meta}
    first = in_window[0]
    return {"selection_status": "selected",
            "price": float(first["p"]),
            "venue_trade_id": str(first["a"]),
            "print_ts": iso_ms(int(first["T"])),
            "age_ms_after_decision": int(first["T"]) - decision_ms,
            "fetch": meta}


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
    instrument = candidate.get("instrument")
    cap = capture_reference(instrument, decision_ms, fetcher)
    if cap["reference_status"] != "captured":
        return {"component": "drift", "verdict": "unverified", **cap}
    entry_sel = select_entry_print(instrument, decision_ms, fetcher)
    production_entry = None
    if checkpoint and checkpoint.get("firstPrintPrice") is not None:
        production_entry = {"price": checkpoint.get("firstPrintPrice"),
                            "observed_at": checkpoint.get("firstPrintObservedAt"),
                            "venue_trade_id": checkpoint.get("firstVenueTradeId")}
    elif candidate.get("entryPrice") is not None:
        production_entry = {"price": candidate.get("entryPrice"),
                            "observed_at": candidate.get("entryObservedAt"),
                            "venue_trade_id": None}
    base = {"component": "drift", "reference": cap,
            "baseline_reference": candidate.get("decisionReferencePrice"),
            "challenger_entry_selection": entry_sel,
            "production_entry_print": production_entry,
            "selection_matches_production": bool(
                entry_sel.get("venue_trade_id") is not None
                and production_entry is not None
                and production_entry.get("venue_trade_id") is not None
                and str(entry_sel["venue_trade_id"]) == str(production_entry["venue_trade_id"])),
            "reference_basis": cap.get("reference_basis")}
    if entry_sel.get("selection_status") != "selected":
        return {**base, "verdict": "no_entry_print",
                "reason": entry_sel.get("selection_status")}
    band = candidate.get("permittedDriftBps")
    band = float(band) if band is not None else 50.0
    drift_bps = abs(entry_sel["price"] - cap["price"]) / cap["price"] * 10000.0
    base_ref = candidate.get("decisionReferencePrice")
    baseline_drift_bps = None
    if base_ref and production_entry:
        baseline_drift_bps = (abs(float(production_entry["price"]) - float(base_ref))
                              / float(base_ref) * 10000.0)
    return {**base,
            "verdict": "pass" if drift_bps <= band else "reject",
            "entry_print": {"price": entry_sel["price"],
                            "observed_at": entry_sel["print_ts"],
                            "venue_trade_id": entry_sel["venue_trade_id"],
                            "selection": "challenger_independent"},
            "drift_bps_vs_decision_reference": round(drift_bps, 2),
            "drift_bps_vs_scan_reference": (round(baseline_drift_bps, 2)
                                            if baseline_drift_bps is not None else None),
            "band_bps": band}


# ---------------------------------------------------------------------------
# R4 — ATH contextual: CoinGecko field join + dispositions
# ---------------------------------------------------------------------------

def http_json(url, ua):
    req = urllib.request.Request(url, headers={"User-Agent": ua})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


class R4Joiner:
    """Joins ATH/SMA/trend fields from CoinGecko historical series, cut at
    the decision instant. Cached per coin per scorer run."""

    def __init__(self, cg_fetcher=None, kline_fetcher=None, sleeper=time.sleep):
        self.cg_fetcher = cg_fetcher or (
            lambda path: http_json(COINGECKO + path, "challenger-r1-shadow-scorer/2.0"))
        self.kline_fetcher = kline_fetcher
        self.sleeper = sleeper
        self.cache = {}

    def _cg_series(self, coin_id):
        if coin_id in self.cache:
            return self.cache[coin_id]
        started = time.time()
        coin = self.cg_fetcher(
            f"/api/v3/coins/{urllib.parse.quote(coin_id, safe='')}"
            "?localization=false&tickers=false&market_data=true"
            "&community_data=false&developer_data=false&sparkline=false")
        self.sleeper(CG_SLEEP_S)
        chart = self.cg_fetcher(
            f"/api/v3/coins/{urllib.parse.quote(coin_id, safe='')}/market_chart"
            "?vs_currency=usd&days=120&interval=daily")
        received = time.time()
        out = {"coin": coin, "chart": chart,
               "fields_fetched_at": iso_ms(int(started * 1000)),
               "fields_received_at": iso_ms(int(received * 1000))}
        self.cache[coin_id] = out
        return out

    def fields_for(self, coin_id, decision_ms, decision_price):
        base = {"component": "ath", "coin_id": coin_id,
                "fields_basis": "historical_series_asof_decision"}
        try:
            data = self._cg_series(coin_id)
        except Exception as e:
            return {**base, "ath_component": "unverified",
                    "reason": "coingecko_fetch_failed", "detail": str(e)[:160]}
        md = (data["coin"].get("market_data") or {})
        prices = [(int(ts), float(p)) for ts, p in
                  (data["chart"].get("prices") or []) if int(ts) <= decision_ms]
        timing = {"fields_fetched_at": data["fields_fetched_at"],
                  "fields_received_at": data["fields_received_at"]}
        if len(prices) < 51:
            return {**base, "ath_component": "unverified",
                    "reason": "insufficient_daily_history_pre_decision",
                    "daily_points_pre_decision": len(prices), **timing}
        closes = [p for _, p in prices]
        asof_close = closes[-1]
        sma50 = sum(closes[-50:]) / 50.0
        trend20 = (asof_close / closes[-21] - 1.0) * 100.0 if len(closes) >= 21 else None
        if trend20 is None:
            return {**base, "ath_component": "unverified",
                    "reason": "insufficient_daily_history_20d", **timing}
        ath_usd = (md.get("ath") or {}).get("usd")
        ath_date = (md.get("ath_date") or {}).get("usd")
        ath_basis = "coingecko_ath"
        ath_value = ath_usd
        if ath_usd is None:
            ath_value = max(closes)
            ath_basis = "reconstructed_from_daily_prices"
        elif ath_date is not None and parse_ts_ms(ath_date) and parse_ts_ms(ath_date) > decision_ms:
            ath_value = max(closes)
            ath_basis = "reconstructed_from_daily_prices"
        price_basis = decision_price if decision_price is not None else asof_close
        ath_dist = (price_basis / ath_value - 1.0) * 100.0 if ath_value else None
        vs_sma = (asof_close / sma50 - 1.0) * 100.0
        conjunction = bool(ath_dist is not None and ath_dist <= -75.0
                           and vs_sma < 0 and trend20 < 0)
        return {**base, "ath_component": "evaluated",
                "ath": ath_value, "ath_date": ath_date, "ath_basis": ath_basis,
                "ath_distance_pct": round(ath_dist, 3) if ath_dist is not None else None,
                "decision_price_basis": price_basis,
                "asof_close": asof_close, "asof_close_ts": iso_ms(prices[-1][0]),
                "sma50": sma50, "price_vs_sma50_pct": round(vs_sma, 3),
                "price_below_sma50": vs_sma < 0,
                "trend20d_pct": round(trend20, 3), "trend20d_negative": trend20 < 0,
                "conjunction_hard_exclusion": conjunction,
                "source": "coingecko:/coins/{id} + market_chart daily (<= decision)",
                **timing}


def ath_disposition(ath):
    if ath.get("ath_component") != "evaluated":
        return "unverified"
    return "hard_exclude_conjunction" if ath.get("conjunction_hard_exclusion") \
        else "pass_with_context"


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


def build_would_contract(candidate, drift, levels):
    """Complete only with the challenger's own entry print, the frozen
    invalidation, and geometry targets (T1 recorded or derived; T2 derived
    from the frozen geometry, labeled)."""
    entry = (drift.get("entry_print") or {}).get("price")
    stop = candidate.get("stopPrice")
    if entry is None or stop is None:
        return None
    if levels.get("classification") in ("malformed", "already_crossed"):
        return None
    if levels.get("geometry") == "wrong_side":
        return None
    direction = candidate.get("direction") or "long"
    risk = abs(float(entry) - float(stop))
    if risk <= 0:
        return None
    sign = 1.0 if direction != "short" else -1.0
    t1_recorded = candidate.get("targetPrice")
    t1_derived = float(entry) + sign * 1.5 * risk
    t2_derived = float(entry) + sign * 2.5 * risk
    return {
        "entry": entry,
        "entry_observed_at": (drift.get("entry_print") or {}).get("observed_at"),
        "entry_venue_trade_id": (drift.get("entry_print") or {}).get("venue_trade_id"),
        "entry_selection": "challenger_independent_first_print_after_decision",
        "invalidation": stop,
        "target1": t1_recorded if t1_recorded is not None else t1_derived,
        "target1_basis": "recorded" if t1_recorded is not None else "derived_frozen_geometry_1.5R",
        "target2": t2_derived,
        "target2_basis": "derived_frozen_geometry_2.5R",
        "risk_distance": risk,
        "contract_status": "complete",
        "settlement_evaluator": "crypto-evaluation-v5-corrected",
        "settlement_status": "enrolled_in_shadow_book",
    }


def compose(candidate, drift, levels, ath, reg):
    baseline = baseline_treatment(candidate)
    divergences = []
    div_class = ("mechanics_proof_only"
                 if drift.get("reference_basis") == "historical_reconstruction"
                 else "paired_comparison")

    def drift_div(kind, chal):
        return {"component": "drift_reanchor", "kind": kind,
                "divergence_class": div_class,
                "baseline_treatment": baseline, "challenger_treatment": chal,
                "inputs": {
                    "baseline_reference": drift.get("baseline_reference"),
                    "challenger_reference": (drift.get("reference") or {}).get("price"),
                    "reference_status": (drift.get("reference") or {}).get("reference_status")
                    if drift.get("reference") else drift.get("reference_status"),
                    "reference_basis": drift.get("reference_basis"),
                    "fetch_started_at": (drift.get("reference") or {}).get("fetch_started_at"),
                    "fetch_received_at": (drift.get("reference") or {}).get("fetch_received_at"),
                    "receipt_predecision_verified": (drift.get("reference") or {}).get(
                        "receipt_predecision_verified"),
                    "challenger_entry_print": drift.get("entry_print"),
                    "production_entry_print": drift.get("production_entry_print"),
                    "drift_bps_baseline": drift.get("drift_bps_vs_scan_reference"),
                    "drift_bps_challenger": drift.get("drift_bps_vs_decision_reference"),
                    "band_bps": drift.get("band_bps")}}

    def ath_div(chal):
        return {"component": "ath_contextual", "kind": "disposition",
                "divergence_class": "paired_comparison",
                "baseline_treatment": baseline, "challenger_treatment": chal,
                "inputs": {"ath_distance_pct": ath.get("ath_distance_pct"),
                           "ath_date": ath.get("ath_date"),
                           "ath_basis": ath.get("ath_basis"),
                           "price_vs_sma50_pct": ath.get("price_vs_sma50_pct"),
                           "trend20d_pct": ath.get("trend20d_pct"),
                           "conjunction_hard_exclusion": ath.get("conjunction_hard_exclusion"),
                           "fields_basis": ath.get("fields_basis"),
                           "fields_fetched_at": ath.get("fields_fetched_at"),
                           "fields_received_at": ath.get("fields_received_at")}}

    r4_excludes = (ath.get("ath_component") == "evaluated"
                   and ath.get("conjunction_hard_exclusion"))

    if baseline == "abstained:invalid_frozen_levels" and levels.get("classification") in (
            "malformed", "already_crossed", "unverified"):
        divergences.append({
            "component": "levels_reason_split", "kind": "reason_split",
            "divergence_class": "paired_comparison",
            "baseline_treatment": "abstained:invalid_frozen_levels",
            "challenger_treatment": f"reject:{levels['classification']}",
            "inputs": {"invalidation": levels.get("invalidation"),
                       "reference": levels.get("reference"),
                       "reference_source_as_of": levels.get("reference_source_as_of"),
                       "derivation_recorded": levels.get("derivation_recorded"),
                       "derivation_compatible": levels.get("derivation_compatible"),
                       "geometry": levels.get("geometry"),
                       "classification_reason": levels.get("reason"),
                       "crossing_visible_in_predecision_data":
                           levels.get("crossing_visible_in_predecision_data")}})

    if baseline.startswith("abstained") and "production_model_abstain" in baseline:
        return "concur_abstain", divergences, None
    if r4_excludes and baseline in ("issued", "abstained:entry_outside_drift_zone"):
        divergences.append(ath_div("would_exclude_ath_conjunction"))
        return "would_exclude_ath_conjunction", divergences, None

    if baseline == "issued":
        if drift.get("verdict") == "reject":
            divergences.append(drift_div("disposition", "would_reject"))
            return "would_reject", divergences, None
        if drift.get("verdict") == "unverified":
            return "concur_with_unverified_drift", divergences, None
        return "concur_issued", divergences, None

    if baseline == "abstained:entry_outside_drift_zone":
        if drift.get("verdict") == "pass":
            if levels.get("classification") in ("malformed", "already_crossed") \
                    or levels.get("geometry") == "wrong_side":
                return "abstain_levels_conflict", divergences, None
            contract = build_would_contract(candidate, drift, levels)
            if contract is None:
                return "abstain_contract_incomplete", divergences, None
            divergences.append(drift_div("disposition", "would_issue"))
            return "would_issue", divergences, contract
        if drift.get("verdict") == "unverified":
            divergences.append(drift_div("disposition", "abstain_unverified_drift"))
            return "abstain_unverified_drift", divergences, None
        return "concur_abstain", divergences, None

    if baseline.startswith("abstained"):
        return "concur_abstain", divergences, None
    if baseline.startswith("deferred"):
        return "concur_deferred", divergences, None
    return f"mirror:{baseline}", divergences, None


def versions_block(candidate, status_data, reg):
    freeze_raw = load_json_field(status_data.get("freeze")) or {}
    mappings = status_data.get("venueMappings") or []
    own_map = next((m for m in mappings if m.get("coinId") == candidate.get("coinId")), None)
    return {
        "baseline_freeze_version": candidate.get("freezeVersion"),
        "baseline_production_hash": candidate.get("productionHash"),
        "vessel_challenger_hash_on_candidate": candidate.get("challengerHash"),
        "handler_version": status_data.get("handler_version"),
        "mapping_freeze_version": (freeze_raw.get("version") or freeze_raw.get("freezeVersion")
                                   or freeze_raw.get("deployedSeries")),
        "mapping_status_freeze_challenger_hash": freeze_raw.get("challengerHash"),
        "candidate_venue_mapping": own_map,
        "collection_manifest": "freeze-manifest-v2.1.5 (+ MANIFEST-NOTE-collector-drift-v2.1.5-2026-10-21.md)",
        "challenger_registration_id": reg["registration_id"],
        "challenger_rule_text_sha256": reg["rule_text_sha256"],
        "challenger_scorer_sha256": reg.get("_scorer_sha256"),
    }


def score_candidate(candidate, checkpoint, status_data, reg, fetcher, r4):
    factors = load_json_field(candidate.get("factorLedgerJson")) or []
    source = None
    op = load_json_field(candidate.get("operationalEvidenceJson"))
    if isinstance(op, dict):
        source = op.get("source") if isinstance(op.get("source"), dict) else None
    decision_ms = parse_ts_ms(candidate.get("decisionAt"))
    transparency = score_transparency(factors, candidate.get("productionScore"))
    levels = score_levels(candidate, source, decision_ms)
    drift = score_drift(candidate, checkpoint, fetcher)
    ath = r4.fields_for(candidate.get("coinId"), decision_ms,
                        candidate.get("decisionReferencePrice"))
    disposition, divergences, contract = compose(candidate, drift, levels, ath, reg)
    if not transparency["score_crosscheck_match"]:
        divergences.append({
            "component": "transparency_none", "kind": "data_quality",
            "divergence_class": "paired_comparison",
            "baseline_treatment": baseline_treatment(candidate),
            "challenger_treatment": disposition,
            "inputs": {"recomputed_score": transparency["recomputed_score"],
                       "recorded_score": transparency["recorded_score"],
                       "note": "recomputed score from the factor ledger does not "
                               "match the recorded production score; flagged, "
                               "never overwritten"}})
    if transparency["unmapped_states_flagged"]:
        divergences.append({
            "component": "transparency_none", "kind": "data_quality",
            "divergence_class": "paired_comparison",
            "baseline_treatment": baseline_treatment(candidate),
            "challenger_treatment": disposition,
            "inputs": {"unmapped_states": transparency["unmapped_states_flagged"],
                       "note": "factor state absent from the registered state "
                               "map; attainable computed with the recorded "
                               "contribution as best state; map NOT extended"}})
    return {
        "registration_id": reg["registration_id"],
        "rule_text_sha256": reg["rule_text_sha256"],
        "hypothetical": True,
        "record_label": "HYPOTHETICAL — challenger shadow record, not an issued position",
        "scored_at": now_iso(),
        "deployed_candidate_id": candidate.get("id"),
        "shadow_key": f"live-paper-cand-{candidate.get('id')}",
        "candidate_key": candidate.get("candidateKey"),
        "symbol": candidate.get("symbol"),
        "coin_id": candidate.get("coinId"),
        "direction": candidate.get("direction"),
        "decision_at": candidate.get("decisionAt"),
        "cluster": {"asset": candidate.get("coinId"),
                    "discovery_run_id": candidate.get("discoveryRunId")},
        "versions": versions_block(candidate, status_data, reg),
        "baseline_disposition": baseline_treatment(candidate),
        "baseline_score": candidate.get("productionScore"),
        "challenger_disposition": disposition,
        "components": {"transparency": transparency, "levels": levels,
                       "drift": drift, "ath": ath},
        "divergences": divergences,
        "would_be_contract": contract,
    }


# ---------------------------------------------------------------------------
# Shadow-book enrollment
# ---------------------------------------------------------------------------

def enrollment_for(record):
    contract = record.get("would_be_contract")
    if record.get("challenger_disposition") != "would_issue" or not contract:
        return None
    eid = f"challenger-r1-v2:enroll:{record['deployed_candidate_id']}"
    drift = record["components"]["drift"]
    return {
        "record_type": "shadow_enrollment",
        "shadow_book": "challenger-r1-shadow-book-v2",
        "hypothetical": True,
        "record_label": "HYPOTHETICAL — shadow position, never an issued position",
        "enrollment_id": eid,
        "registration_id": record["registration_id"],
        "rule_text_sha256": record["rule_text_sha256"],
        "enrolled_at": now_iso(),
        "candidate_id": record["deployed_candidate_id"],
        "candidate_key": record.get("candidate_key"),
        "symbol": record.get("symbol"),
        "coin_id": record.get("coin_id"),
        "instrument": None,  # filled by caller from candidate
        "venue": "Binance Spot",
        "direction": record.get("direction"),
        "decision_at": record.get("decision_at"),
        "entry": contract["entry"],
        "entry_observed_at": contract["entry_observed_at"],
        "entry_venue_trade_id": contract["entry_venue_trade_id"],
        "invalidation": contract["invalidation"],
        "target1": contract["target1"],
        "target2": contract["target2"],
        "risk_distance": contract["risk_distance"],
        "reference_basis": drift.get("reference_basis"),
        "divergence_class": ("mechanics_proof_only"
                             if drift.get("reference_basis") == "historical_reconstruction"
                             else "paired_comparison"),
        "cluster": record.get("cluster"),
        "versions": record.get("versions"),
        "evaluator": "crypto-evaluation-v5-corrected",
        "costs": {"bps_round_trip": 18,
                  "clause": "18 bps round-trip modeled (crypto-evaluation-v5-corrected); "
                            "Net R = gross R - 18 bps, converted to R units at the "
                            "position's own risk distance per the v2 comparison math"},
        "status": "open",
    }


# ---------------------------------------------------------------------------
# Ledger helpers
# ---------------------------------------------------------------------------

def existing_keys(path, keyfn):
    keys = set()
    if os.path.exists(path):
        with open(path) as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        keys.add(keyfn(json.loads(line)))
                    except Exception:
                        pass
    return keys


def main(argv):
    args = argv[1:]

    def opt(name):
        return args[args.index(name) + 1] if name in args else None

    status_path = opt("--status")
    obs_path = opt("--observations")
    funnel_path = opt("--funnel")
    out_path = opt("--out") or SHADOW_PATH
    pop_out = opt("--population-out") or POP_PATH
    book_out = opt("--book-out") or BOOK_PATH
    dry_run = "--dry-run" in args
    if not status_path:
        print("usage: challenger_r1_v2.py --status <live-paper-status.json> "
              "[--observations <obs.json>] [--funnel <funnel.json>] [--dry-run]",
              file=sys.stderr)
        return 2
    reg = load_registration()
    with open(status_path) as f:
        status = json.load(f)
    data = status.get("data", status)
    candidates = data.get("candidates", [])
    checkpoints = {cp.get("candidateId"): cp for cp in data.get("checkpoints", [])}
    r4 = R4Joiner()
    keys = existing_keys(out_path, lambda r: (r["registration_id"], r["deployed_candidate_id"]))
    book_keys = existing_keys(book_out, lambda r: r.get("enrollment_id"))
    scored, refused, skipped = [], 0, 0
    records, enrollments = [], []
    batch_candidate_keys = set()
    for cand in candidates:
        decision_ms = parse_ts_ms(cand.get("decisionAt"))
        if decision_ms is None or decision_ms < reg["_frozen_ms"]:
            refused += 1
            continue
        key = (reg["registration_id"], cand.get("id"))
        if key in keys:
            skipped += 1
            continue
        rec = score_candidate(cand, checkpoints.get(cand.get("id")), data, reg,
                              fetch_agg_trades, r4)
        enr = enrollment_for(rec)
        if enr is not None:
            enr["instrument"] = cand.get("instrument")
            if enr["enrollment_id"] not in book_keys:
                enrollments.append(enr)
            rec["shadow_enrollment_id"] = enr["enrollment_id"]
        records.append(rec)
        scored.append(cand.get("id"))
        batch_candidate_keys.add((cand.get("discoveryRunId"), cand.get("coinId")))

    # R4 upstream population: discovery-observed assets of post-freeze runs
    # that did not become pilot candidates in this batch.
    pop_records = []
    if obs_path and os.path.exists(obs_path):
        with open(obs_path) as f:
            obs = json.load(f)
        odata = obs.get("data", obs)
        run = odata.get("run") or {}
        run_id = run.get("id")
        run_start_ms = parse_ts_ms(run.get("startedAt")) or parse_ts_ms(run.get("completedAt"))
        funnel_counts = {}
        if funnel_path and os.path.exists(funnel_path):
            with open(funnel_path) as f:
                fdata = json.load(f).get("data", {})
            for st in fdata.get("stages", []):
                for rem in st.get("removals", []):
                    funnel_counts[rem.get("reasonCode")] = rem.get("count")
        pop_keys = existing_keys(pop_out, lambda r: (r["registration_id"],
                                                     r["discovery_run_id"], r["coin_id"]))
        pilot_coin_ids = {c.get("coinId") for c in candidates
                            if c.get("discoveryRunId") == run_id}
        if run_start_ms is not None and run_start_ms >= reg["_frozen_ms"]:
            for row in odata.get("rows", []):
                cid = row.get("coinId")
                if cid in pilot_coin_ids:
                    continue
                pkey = (reg["registration_id"], run_id, cid)
                if pkey in pop_keys:
                    continue
                ath = r4.fields_for(cid, run_start_ms, None)
                pop_records.append({
                    "registration_id": reg["registration_id"],
                    "hypothetical": True,
                    "record_label": "HYPOTHETICAL — R4 upstream population record",
                    "recorded_at": now_iso(),
                    "discovery_run_id": run_id,
                    "coin_id": cid,
                    "symbol": row.get("symbol"),
                    "baseline_treatment": "excluded_upstream_pre_pilot_scoring",
                    "discovery_context": row.get("context"),
                    "decision_instant_basis": "discovery_run_started_at",
                    "decision_at": run.get("startedAt"),
                    "ath": ath,
                    "r4_disposition": ath_disposition(ath),
                    "ath_gate_funnel_counts_for_run": funnel_counts or None,
                    "versions": {"challenger_registration_id": reg["registration_id"],
                                 "challenger_rule_text_sha256": reg["rule_text_sha256"],
                                 "challenger_scorer_sha256": reg.get("_scorer_sha256")},
                })

    if not dry_run:
        if records:
            with open(out_path, "a") as f:
                for rec in records:
                    f.write(json.dumps(rec) + "\n")
        if enrollments:
            with open(book_out, "a") as f:
                for enr in enrollments:
                    f.write(json.dumps(enr) + "\n")
        if pop_records:
            with open(pop_out, "a") as f:
                for rec in pop_records:
                    f.write(json.dumps(rec) + "\n")
    summary = {
        "registration_id": reg["registration_id"],
        "rule_text_sha256": reg["rule_text_sha256"],
        "scorer_sha256": reg.get("_scorer_sha256"),
        "frozen_at_utc": reg["frozen_at_utc"],
        "candidates_seen": len(candidates),
        "refused_pre_registration": refused,
        "already_recorded": skipped,
        "newly_scored": scored,
        "divergences": sum(len(r["divergences"]) for r in records),
        "divergences_mechanics_proof_only": sum(
            1 for r in records for d in r["divergences"]
            if d.get("divergence_class") == "mechanics_proof_only"),
        "unverified_drift": sum(1 for r in records
                                if r["components"]["drift"].get("verdict") == "unverified"),
        "enrollments_written": [e["enrollment_id"] for e in enrollments],
        "population_records_written": len(pop_records),
        "dry_run": dry_run,
    }
    print(json.dumps(summary, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
