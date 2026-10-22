#!/usr/bin/env python3
"""Automatic dual-arm capture for dossier evaluations (intended models).

Sandbox/research only. Paper signals only. No brokerage. No model tuning,
no production inversion, no model replacement. Read-only against the
workspace DB copies. Holdouts locked.

This is the wired collector for the intended dossier models:

  crypto production  crypto-dossier-factor-agreement 2.0.0-measurement-contract
  crypto challenger  crypto-dossier-minus-momentum 0.1.0-shadow (C-2)
  equity production  equity-factor-agreement 3.1.0-measurement-closure
                     (no frozen equity challenger exists: C-2 not applicable)

On each NEW dossier evaluation the collector runs ONE write path
(`capture_dossier_evaluation`):

  1. persists the COMPLETE decision-time inputs (verbatim, as received)
     via decision_time_store.persist_decision_time_inputs --
     missing inputs are stored UNKNOWN, never reconstructed afterward;
  2. scores the production arm through intended_models;
  3. scores the C-2 arm through intended_models (crypto only);
  4. writes both arm results to one evidence file.

No comparison row is appended to any vessel by this collector -- dossier
captures are model-evaluation evidence, not prospective trial rows. The 8
discovery-run-60 rows in rows/cohort-prospective-v2.csv are a SEPARATE
population (deployed paper-pilot stream, deployed 7-factor model) and are
never re-scored here; see POPULATION-BOUNDARY-DISCOVERY-RUN60-2026-10-14.md.

REPLAY/REPRODUCTION labeling: BTC id43 is this morning's dossier issuance
(2026-10-14T13:00:21.555Z) reproduced through the intended models -- NOT a
fresh evaluation. Every artifact this collector produces for a replayed
issuance carries evidence_class "REPLAY/REPRODUCTION" in the input bundle,
the evidence file, and the code paths below. Fresh captures carry "FRESH".

CAPTURE CORRECTION (2026-10-15): the 2026-10-14 automatic run captured
dossier signals 31-42 with evidence_class defaulted to FRESH, conflating
capture time with decision time. Correction applied in this module:
  - every bundle/evidence now carries explicit `captured_at` (the
    collector's capture instant) DISTINCT from `decision_at` (the model's
    decision instant);
  - the frozen dossier-cohort-v1 eligibility cutoff
    (2026-10-14T18:35:00Z; dossier-cohort-v1/COLLECTION-CONFIG-v1.md section 1)
    is applied by classify_evidence_class(): decision_at at/after the cutoff
    -> FRESH; before (or unverifiable) -> REPLAY/REPRODUCTION, i.e.
    historical reproduction, not fresh prospective evidence;
  - signals 31-42 (all decision_at < cutoff) were re-labeled
    REPLAY/REPRODUCTION in place (label correction only; the persisted
    decision-time inputs were not touched) with a capture_correction_note;
    see CAPTURE-CORRECTION-2026-10-15.md.
  - check_frozen_eligibility() is the admission gate: the frozen trial's
    eligibility rules are applied BEFORE any row is admitted as a FRESH
    intended-model evaluation; opportunities incompatible with the frozen
    models stay in a separate, labeled cohort -- never forced in.
  - the DEPLOYED paper pilot's 7-factor result is carried only in the
    separately labeled `deployed_seven_factor` evidence field (context,
    never substituted into the frozen production/C-2 arms -- population
    boundary rule 2).

Wiring: collect_pilot_rows.py --dossier-capture runs
capture_new_dossier_evaluations() -- the automatic scan for uncaptured
dossier-path issuances. The existing collector's default behavior, vessel
targets, and quarantine guards are unchanged.
"""

import copy
import datetime
import json
import os
import sqlite3
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import decision_time_store as store
import intended_models as models

# ---------------------------------------------------------------------------
# Evidence classes. REPLAY/REPRODUCTION = a recorded issuance reproduced
# through the intended models, NOT a fresh evaluation. BTC id43
# (2026-10-14T13:00:21.555Z) is the replay in this package.
# ---------------------------------------------------------------------------

EVIDENCE_CLASS_FRESH = "FRESH"
EVIDENCE_CLASS_REPLAY = "REPLAY/REPRODUCTION"

# Freshness order (least-fresh first). An explicitly passed evidence_class
# may only DOWNGRADE along this order (FRESH -> REPLAY/REPRODUCTION); it
# may NEVER upgrade. Unrecognized classes never outrank the computed one.
_FRESHNESS_ORDER = (EVIDENCE_CLASS_REPLAY, EVIDENCE_CLASS_FRESH)


def _freshness_rank(evidence_class):
    """Rank an evidence class by freshness (less-fresh first)."""
    try:
        return _FRESHNESS_ORDER.index(evidence_class)
    except ValueError:
        return -1

CRYPTO_DB = os.path.expanduser(
    "~/workspace/ts-spaces/altcoin-analyzer-and-signal-tracker/app.db"
)
CRYPTO_DOSSIER_ISSUANCE_LIKE = "%crypto-dossier-factor-agreement|2.0.0-measurement-contract%"
CRYPTO_SNAPSHOT_VERSION = "crypto-input-snapshot-v3-canonical-atr-window"

# Frozen dossier-cohort-v1 prospective cutoff
# (dossier-cohort-v1/COLLECTION-CONFIG-v1.md section 1): a dossier
# recommendation is prospective (FRESH) evidence only when its DECISION
# instant is at/after 2026-10-14T18:35:00Z. Capture time never qualifies a
# row -- captured_at vs decision_at are separate fields (capture correction
# 2026-10-15). The paper prospective vessel has its own post-freeze cutoff
# (2026-10-14T04:57:00Z, freeze-manifest-v2.1.5.json prospective_collection);
# that cutoff governs the vessel, not this collector.
DOSSIER_PROSPECTIVE_CUTOFF_ISO = "2026-10-14T18:35:00+00:00"

# Paper-pilot status exports consulted for the separately-labeled deployed
# 7-factor context field (newest first). These are point-in-time reads of the
# deployed pilot's own 7-factor stream -- context only, never trial input.
PILOT_STATUS_EXPORT_GLOB = os.path.join(HERE, "live-paper-status-*.json")

# Deployed-candidate match window around the dossier decision instant.
SEVEN_FACTOR_MATCH_WINDOW_MINUTES = 30

DEFAULT_INPUT_DIR = os.path.join(HERE, "decision-time-inputs")
DEFAULT_EVIDENCE_DIR = os.path.join(HERE, "wired-trial-evidence")
GENUINE_INPUTS_DIR = os.path.join(HERE, "intended-models-genuine-inputs")

# BTC id43 replay identity (this morning's dossier issuance, reproduced --
# not a fresh evaluation).
ID43_SIGNAL_ID = 43
ID43_SNAPSHOT_ID = 3775786275845128
ID43_ISSUED_AT_ISO = "2026-10-14T13:00:21.555+00:00"


def _utcnow_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="milliseconds")


def _iso(ms):
    if ms is None:
        return None
    return datetime.datetime.fromtimestamp(ms / 1000, datetime.timezone.utc).isoformat(
        timespec="milliseconds"
    )


def opportunity_id_for(symbol: str, signal_id: int, created_at_ms: int) -> str:
    day = datetime.datetime.fromtimestamp(
        created_at_ms / 1000, datetime.timezone.utc
    ).strftime("%Y-%m-%d")
    return f"dossier-{str(symbol).lower()}-id{signal_id}-{day}"


def _parse_iso(value):
    """Tolerant ISO-8601 parse -> aware UTC datetime, or None (never raises)."""
    if not value:
        return None
    try:
        text = str(value).strip().replace("Z", "+00:00")
        dt = datetime.datetime.fromisoformat(text)
    except (ValueError, TypeError):
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=datetime.timezone.utc)
    return dt.astimezone(datetime.timezone.utc)


def classify_evidence_class(decision_at_iso):
    """Apply the frozen eligibility cutoff to a decision instant.

    Returns (evidence_class, note). decision_at at/after
    DOSSIER_PROSPECTIVE_CUTOFF_ISO -> FRESH; before, missing, or
    unparseable -> REPLAY/REPRODUCTION (historical reproduction, not fresh
    prospective evidence -- capture time never qualifies a row).
    """
    cutoff = _parse_iso(DOSSIER_PROSPECTIVE_CUTOFF_ISO)
    decision = _parse_iso(decision_at_iso)
    if decision is None:
        return (EVIDENCE_CLASS_REPLAY, (
            "decision_at missing or unparseable; freshness against the frozen "
            f"cutoff {DOSSIER_PROSPECTIVE_CUTOFF_ISO} cannot be established -- "
            "treated as historical reproduction, not fresh evidence"
        ))
    if decision >= cutoff:
        return (EVIDENCE_CLASS_FRESH, (
            f"decision_at {decision.isoformat()} at/after frozen cutoff "
            f"{DOSSIER_PROSPECTIVE_CUTOFF_ISO}: prospective (FRESH) evidence"
        ))
    return (EVIDENCE_CLASS_REPLAY, (
        f"decision_at {decision.isoformat()} before frozen cutoff "
        f"{DOSSIER_PROSPECTIVE_CUTOFF_ISO}: historical reproduction, "
        "not fresh prospective evidence (capture time does not qualify)"
    ))


def check_frozen_eligibility(*, decision_at_iso, issuance_key, snapshot_linked,
                             prod_complete, prod_missing, terminal="crypto"):
    """Frozen-trial admission gate for an intended-model evaluation.

    The frozen eligibility rules are applied BEFORE any row is admitted as a
    FRESH intended-model evaluation. Returns
    {"eligible_for_fresh": bool, "cohort": str, "reasons": [str]}.
    Cohorts: "fresh-eligible" | "historical-reproduction" |
    "incompatible:<reason>" -- incompatible opportunities stay in their own
    labeled cohort and are never forced into the fresh evaluation.
    """
    reasons = []
    frozen_crypto = "crypto-dossier-factor-agreement|2.0.0-measurement-contract" in str(issuance_key or "")
    frozen_equity = terminal == "equity" and "equity-factor-agreement|3.1.0-measurement-closure" in str(issuance_key or "")
    if not (frozen_crypto or frozen_equity):
        reasons.append(
            "incompatible:unbound-issuance-key -- issuance key does not bind a "
            "frozen intended model (crypto 2.0.0-measurement-contract / equity "
            "3.1.0-measurement-closure)"
        )
    if not snapshot_linked:
        reasons.append(
            "incompatible:no-input-snapshot -- no v3 canonical decision-time "
            "snapshot linked; inputs are never reconstructed"
        )
    if not prod_complete:
        reasons.append(
            "incompatible:incomplete-factor-ledger -- frozen production factor "
            f"set incomplete, missing {list(prod_missing or [])}"
        )
    evidence_class, class_note = classify_evidence_class(decision_at_iso)
    if evidence_class != EVIDENCE_CLASS_FRESH:
        reasons.append(f"pre-cutoff -- {class_note}")

    incompat = [r for r in reasons if r.startswith("incompatible:")]
    if incompat:
        cohort = incompat[0].split(" -- ")[0]
    elif evidence_class != EVIDENCE_CLASS_FRESH:
        cohort = "historical-reproduction"
    else:
        cohort = "fresh-eligible"
    return {
        "eligible_for_fresh": cohort == "fresh-eligible",
        "cohort": cohort,
        "reasons": reasons,
        "cutoff_utc": DOSSIER_PROSPECTIVE_CUTOFF_ISO,
    }


def find_deployed_seven_factor_match(coin_id, direction, decision_at_iso,
                                     status_exports):
    """Look up the DEPLOYED paper pilot's 7-factor result -- context only.

    Matches a deployed candidate by (coin_id, direction, |decisionAt -
    decision_at| <= SEVEN_FACTOR_MATCH_WINDOW_MINUTES) across the given
    live-paper-status exports (newest first). Returns a separately labeled
    dict; the deployed 7-factor model is NOT the frozen trial and its
    score/direction are NEVER substituted into the frozen production or C-2
    arms (population boundary rule 2). No match -> present False with reason.
    """
    field = {
        "model": "deployed paper pilot 7-factor model -- NOT the frozen trial; "
                 "context only, never substituted into production/C-2 arms",
        "present": False,
    }
    decision = _parse_iso(decision_at_iso)
    consulted = [os.path.basename(p) for p in (status_exports or [])]
    field["exports_consulted"] = consulted
    if decision is None:
        field["reason"] = "decision_at unparseable; no match attempted"
        return field
    window = datetime.timedelta(minutes=SEVEN_FACTOR_MATCH_WINDOW_MINUTES)
    for path in (status_exports or []):
        try:
            with open(path) as handle:
                data = json.load(handle)
        except (OSError, ValueError):
            continue
        candidates = (data.get("data") or {}).get("candidates") or []
        for cand in candidates:
            if str(cand.get("coinId") or "").lower() != str(coin_id or "").lower():
                continue
            if str(cand.get("direction") or "").lower() != str(direction or "").lower():
                continue
            cand_decision = _parse_iso(cand.get("decisionAt"))
            if cand_decision is None:
                continue
            if abs(cand_decision - decision) > window:
                continue
            field.update({
                "present": True,
                "candidate_key": cand.get("candidateKey"),
                "decision_at": cand.get("decisionAt"),
                "direction": cand.get("direction"),
                "production_score": cand.get("productionScore"),
                "challenger_score": cand.get("challengerScore"),
                "discovery_run_id": cand.get("discoveryRunId"),
                "matched_export": os.path.basename(path),
                "reason": None,
            })
            return field
    field["reason"] = (
        f"no deployed paper-pilot candidate matched (coin_id={coin_id}, "
        f"direction={direction}, decision within "
        f"+/-{SEVEN_FACTOR_MATCH_WINDOW_MINUTES} min) in the consulted exports"
    )
    return field


def find_snapshot_for_signal(con: sqlite3.Connection, coin_id: str, created_at_ms: int):
    """Link a dossier-path signal to its decision-time input snapshot.

    Rule: same asset_id, snapshot captured_at <= signal created_at, latest
    such snapshot, v3 canonical window only. Verified for all 13 dossier-path
    2.0.0 signals (2026-10-14): each maps to the snapshot whose
    replayAtIssuance is "reconstructed" with 0 mismatches.
    """
    return con.execute(
        """SELECT id, snapshot_version, provider_metadata_json, payload_json,
                  captured_at, available_at, created_at
           FROM signal_input_snapshots
           WHERE asset_id = ? AND captured_at <= ?
             AND snapshot_version = ?
           ORDER BY captured_at DESC LIMIT 1""",
        (coin_id, created_at_ms, CRYPTO_SNAPSHOT_VERSION),
    ).fetchone()


def extract_crypto_dossier_bundle(sig: sqlite3.Row, snap: sqlite3.Row,
                                  db_path: str,
                                  evidence_class: str = EVIDENCE_CLASS_FRESH) -> dict:
    """Build the decision-time input bundle for one crypto dossier issuance.

    Extraction pattern follows evaluate_intended_opportunity.extract_bundle
    (the accepted demo). The model-consumed inputs are carried VERBATIM in
    `raw_decision_inputs` (the snapshot's rawDecisionInputs: decisionAt,
    entryPrice, riskMultiplier, the 11 minimal label/score/weight factor
    records, and the full ATR bar window). The enriched factor annotations
    (reading/source/quality/asOf/value) travel in `factors` and are
    normalized by the store -- the 3 no_data factors land UNKNOWN there,
    never reconstructed.

    For a replay (evidence_class=REPLAY/REPRODUCTION) the bundle carries the
    replay note and the defect note: the closeout package's
    01-intended-models/decision-time-inputs-dossier-btc-id43-2026-10-14.json
    duplicated the arm-results (output) JSON; this bundle is the genuine
    decision-time INPUT snapshot.
    """
    signal = dict(sig)
    payload = json.loads(snap["payload_json"])
    provider_metadata = json.loads(snap["provider_metadata_json"])
    factors = json.loads(signal["factors_json"])
    raw_inputs = payload["rawDecisionInputs"]

    bundle = {
        "opportunity_id": opportunity_id_for(
            signal["symbol"], signal["id"], signal["created_at"]
        ),
        "evidence_class": evidence_class,
        "terminal": "crypto",
        "model": {
            "strategy_id": models.CRYPTO_STRATEGY_ID,
            "strategy_version": models.CRYPTO_STRATEGY_VERSION,
            "parameter_hash": models.CRYPTO_PARAMETER_HASH,
            "evaluator_version": models.CRYPTO_EVALUATOR_VERSION,
            "snapshot_version": models.CRYPTO_SNAPSHOT_VERSION,
            "entry_convention": models.CRYPTO_ENTRY_CONVENTION,
            "price_convention": models.CRYPTO_PRICE_CONVENTION,
            "cost_scenario": models.CRYPTO_COST_SCENARIO_ID,
            "wiring": "comparison/intended_models.py (score_dossier_factors <- scoreDossierFactors, signal-methodology.ts:47)",
            "collector": "comparison/dossier_model_collector.py::capture_dossier_evaluation (single automatic write path)",
        },
        "decision_at": _iso(raw_inputs["decisionAt"]),
        "decision_at_ms": raw_inputs["decisionAt"],
        "issued_at": _iso(signal["created_at"]),
        "source_as_of": _iso(signal["source_as_of"]),
        "issuance_key": signal["issuance_key"],
        "issuance_path": payload["metadata"].get("issuancePath"),
        "snapshot": {
            "snapshot_id": snap["id"],
            "snapshot_version": snap["snapshot_version"],
            "captured_at": _iso(snap["captured_at"]),
            "available_at": _iso(snap["available_at"]),
            "replay_at_issuance": payload["replayAtIssuance"],
        },
        # The ACTUAL inputs the model consumed, verbatim as persisted at
        # decision time. Never edited, never reconstructed.
        "raw_decision_inputs": copy.deepcopy(raw_inputs),
        "factors": [
            {
                "label": f.get("label"),
                "weight": f.get("weight"),
                "score": f.get("score"),
                "contribution": f.get("contribution"),
                "reading": f.get("reading"),
                "source": f.get("source"),
                "quality": f.get("quality"),
                "asOf": f.get("asOf"),
                "value": f.get("value"),
            }
            for f in factors
        ],
        "entry_context": {
            "entry_price": signal["entry"],
            "atr14": signal["atr14"],
            "risk_multiplier": signal["risk_multiplier"],
            "risk_method": signal["risk_method"],
            "levels_recorded": {
                "entry": signal["entry"],
                "invalidation": signal["invalidation"],
                "target1": signal["target1"],
                "target2": signal["target2"],
            },
            "entry_evidence": payload["entryEvidence"],
            "signal_day_candle": payload["candle"],
            "decision_reference": payload["decisionReference"],
            "atr_bar_count": len(raw_inputs.get("atrBars", [])),
            "short_regime_check": payload["metadata"].get("shortRegime"),
            "validation_status": payload["metadata"].get("validationStatus"),
            "funding": signal["funding"],
            "oi_usd": signal["oi_usd"],
            "oi_change": signal["oi_change"],
        },
        "provider_metadata": {
            "buildId": provider_metadata.get("buildId"),
            "sourceAsOf": provider_metadata.get("sourceAsOf"),
            "providers": list(provider_metadata.get("providers", {}).keys()),
        },
        "provenance": {
            "source_db": db_path,
            "source_db_role": "local workspace copy; read-only open (mode=ro); not a dump of the deployed runtime",
            "signal_table": "generated_signals",
            "signal_id": signal["id"],
            "snapshot_table": "signal_input_snapshots",
            "snapshot_id": snap["id"],
            "extracted_at": _utcnow_iso(),
        },
    }

    if evidence_class == EVIDENCE_CLASS_REPLAY:
        bundle["replay_note"] = (
            "REPLAY/REPRODUCTION: this is the recorded dossier issuance of "
            f"{ID43_ISSUED_AT_ISO} (BTC id43) reproduced through the intended "
            "models (crypto-dossier-factor-agreement 2.0.0 / "
            "crypto-dossier-minus-momentum 0.1.0-shadow). NOT a fresh evaluation."
        )
        bundle["defect_note"] = (
            "Fixes the known defect in the closeout package: "
            "01-intended-models/decision-time-inputs-dossier-btc-id43-2026-10-14.json "
            "duplicated the arm-results (output) JSON byte-for-byte. This file is the "
            "genuine decision-time INPUT snapshot: the actual inputs the model consumed "
            "(factor evidence, prices, timestamps as persisted at decision time)."
        )
    return bundle


# ---------------------------------------------------------------------------
# Arm scoring (moved from evaluate_intended_opportunity.evaluate -- the
# accepted demo's evidence assembly, now inside the single write path).
# ---------------------------------------------------------------------------

def score_crypto_arms(bundle: dict, recorded: dict) -> dict:
    """Score production + C-2 from the bundle. Returns the evidence body."""
    scored_factors = [
        {"label": f["label"], "weight": f["weight"], "contribution": f["contribution"]}
        for f in bundle["factors"]
    ]

    prod_complete, prod_missing = store.ledger_completeness(
        "crypto", bundle["factors"], for_challenger=False
    )
    c2_complete, c2_missing = store.ledger_completeness(
        "crypto", bundle["factors"], for_challenger=True
    )

    prod = models.score_dossier_factors(scored_factors) if prod_complete else None
    c2 = models.c2_score_minus_momentum(scored_factors) if c2_complete else None

    entry_ctx = bundle["entry_context"]
    recorded_levels = entry_ctx["levels_recorded"]

    def arm_disposition(complete, missing):
        if not complete:
            return {"disposition": "unscored",
                    "reason": "unscored:incomplete-factor-ledger",
                    "missing": missing}
        return {"disposition": "scored", "reason": None, "missing": missing}

    evidence = {
        "prod": {
            "arm": "production",
            "strategy": f"{models.CRYPTO_STRATEGY_ID} {models.CRYPTO_STRATEGY_VERSION}",
            "wired_function": "intended_models.score_dossier_factors <- signal-methodology.ts:47 scoreDossierFactors",
            "ledger_complete": prod_complete,
            "score": prod["longScore"] if prod else None,
            "short_score": prod["shortScore"] if prod else None,
            "direction": prod["direction"] if prod else None,
            "weighted_net": prod["weightedNet"] if prod else None,
            "total_weight": prod["totalWeight"] if prod else None,
            "arm_disposition": arm_disposition(prod_complete, prod_missing),
        },
        "c2": {
            "arm": "challenger",
            "strategy": f"{models.C2_STRATEGY_ID} {models.C2_STRATEGY_VERSION}",
            "wired_function": "intended_models.c2_score_minus_momentum (Momentum contribution AND weight removed; denominator 15.5; not rescaled)",
            "ledger_complete": c2_complete,
            "score": c2["challengerLong"] if c2 else None,
            "short_score": c2["challengerShort"] if c2 else None,
            "direction": c2["challengerDirection"] if c2 else None,
            "weighted_net": c2["challengerWeightedNet"] if c2 else None,
            "total_weight": c2["challengerTotalWeight"] if c2 else None,
            "momentum_dropped": c2["momentumDropped"] if c2 else None,
            "arm_disposition": arm_disposition(c2_complete, c2_missing),
        },
    }

    # Recorded-issuance fidelity: the pipeline's own decision is ground truth
    # for the prod arm -- recomputed long score must equal the recorded
    # confidence, direction must match, build_atr_levels must reproduce the
    # recorded levels to full float precision.
    if prod:
        recomputed_levels = models.build_atr_levels(
            prod["direction"], entry_ctx["entry_price"], entry_ctx["atr14"],
            entry_ctx["risk_multiplier"],
        )
        # The pipeline records confidence on the DIRECTION side (longScore
        # for a long, shortScore for a short) -- e.g. HYPE id40 recorded
        # "56 short" = shortScore 56 (longScore 44). Comparing longScore
        # against a short's recorded confidence is a false mismatch.
        direction_score = (
            prod["longScore"] if prod["direction"] == "long" else prod["shortScore"]
        )
        evidence["prod"]["recorded_fidelity"] = {
            "recorded_confidence": recorded["confidence"],
            "recorded_confidence_side": prod["direction"],
            "recomputed_matches_recorded_confidence": (
                direction_score == int(recorded["confidence"])
            ),
            "recorded_direction": recorded["direction"],
            "recomputed_matches_recorded_direction": (
                prod["direction"] == recorded["direction"]
            ),
            "levels_recomputed_exact": (
                recomputed_levels is not None
                and recomputed_levels["entry"] == recorded_levels["entry"]
                and recomputed_levels["stop"] == recorded_levels["invalidation"]
                and recomputed_levels["target"] == recorded_levels["target1"]
                and recomputed_levels["target2"] == recorded_levels["target2"]
            ),
        }
    if c2 and prod:
        flipped = c2["challengerDirection"] != prod["direction"]
        c2_levels = models.build_atr_levels(
            c2["challengerDirection"], entry_ctx["entry_price"], entry_ctx["atr14"],
            entry_ctx["risk_multiplier"],
        )
        evidence["c2"]["leg"] = "flipped" if flipped else "non-flipped"
        evidence["c2"]["levels_mode"] = (
            "independent: challenger direction/levels evaluated from its own ledger"
            if flipped else
            "verified-shared: C-2 levels recomputed exactly from C-2's own entry inputs "
            "(direction matches; buildAtrLevels is direction-dependent); "
            "identical to production levels by construction, recorded per RULE 5"
        )
        if c2_levels:
            evidence["c2"]["levels_match_production"] = (
                c2_levels["stop"] == recorded_levels["invalidation"]
                and c2_levels["target"] == recorded_levels["target1"]
                and c2_levels["target2"] == recorded_levels["target2"]
            )

    # Honest operational dispositions: the dossier path's gates passed (the
    # issuance is recorded), but the frozen trial's paper-pipeline operational
    # gates (waiting-interval veto, 15-min Binance entry window, coverage
    # attestation, drift caps) have NO evidence for a dossier-path
    # opportunity -- the dossier entry convention (CoinGecko provider quote)
    # is a different evidence standard. RULE 6: missing C-2 evidence is
    # UNKNOWN, never filled from production.
    evidence["operational_dispositions"] = {
        "prod_paper_issuance": {
            "disposition": "UNKNOWN",
            "reason": "no paper-pipeline issuance record for this opportunity; "
                      "dossier-path issuance (recorded) uses a different entry "
                      "convention and does not establish the paper operational gates",
        },
        "c2_paper_issuance": {
            "disposition": "UNKNOWN",
            "reason": "no entry-observation evidence under the frozen paper entry "
                      "convention for C-2's independent evaluation; RULE 6 -- "
                      "missing C-2 evidence is UNKNOWN, never filled from production",
        },
    }
    return evidence


def score_equity_arms(bundle: dict, recorded: dict) -> dict:
    """Score the equity production arm (equity-factor-agreement 3.1.0).

    There is no frozen equity challenger: C-2 is recorded not-applicable,
    never invented.
    """
    factors = [
        {"name": f.get("name"), "weight": f.get("weight"), "score": f.get("score")}
        for f in bundle["factors"]
    ]
    breakdown = models.factor_score_breakdown(factors)
    if breakdown is None:
        direction = None
        disposition = {"disposition": "unscored",
                       "reason": "unscored:non-positive-total-weight", "missing": []}
    else:
        direction = models.signal_decision(breakdown["score"])
        disposition = {"disposition": "scored", "reason": None, "missing": []}

    evidence = {
        "prod": {
            "arm": "production",
            "strategy": f"{models.EQUITY_STRATEGY_ID} {models.EQUITY_STRATEGY_VERSION}",
            "wired_function": "intended_models.factor_score_breakdown + signal_decision <- actions.ts factorScoreBreakdown/signalDecision",
            "score": breakdown["score"] if breakdown else None,
            "raw_score": breakdown["rawScore"] if breakdown else None,
            "redundancy_adjustment": breakdown["redundancyAdjustment"] if breakdown else None,
            "direction": direction,
            "arm_disposition": disposition,
        },
        "c2": {
            "arm": "challenger",
            "applicable": False,
            "disposition": "not-applicable",
            "reason": "no frozen equity challenger exists; C-2 is defined for the crypto dossier model only",
        },
    }
    if breakdown and recorded.get("entry_price") and recorded.get("atr14") and direction:
        evidence["prod"]["levels"] = models.build_frozen_levels(
            recorded["entry_price"], recorded["atr14"], direction
        )
    return evidence


def _boundary_prod_completeness(terminal, factors):
    """Factor-ledger completeness for the frozen production arm, computed at
    the write boundary from the bundle's own factors.

    Crypto uses the frozen ledger check (store.ledger_completeness); equity
    uses the same gate its arm scoring uses (factor_score_breakdown returns
    None only when total weight is not positive). Never raises on empty
    factors -- returns (False, missing).
    """
    if terminal == "crypto":
        return store.ledger_completeness("crypto", factors or [], for_challenger=False)
    if terminal == "equity":
        normalized = [
            {"name": f.get("name") or f.get("label"),
             "weight": f.get("weight"), "score": f.get("score")}
            for f in (factors or [])
        ]
        if models.factor_score_breakdown(normalized) is None:
            return False, ["equity-factor-ledger: non-positive total weight"]
        return True, []
    raise ValueError(f"unknown terminal: {terminal!r}")


# ---------------------------------------------------------------------------
# THE single automatic write path.
# ---------------------------------------------------------------------------

def capture_dossier_evaluation(bundle: dict,
                               recorded: dict | None = None,
                               evidence_class: str | None = None,
                               input_dir: str | None = None,
                               evidence_dir: str | None = None,
                               input_filename: str | None = None,
                               evidence_filename: str | None = None,
                               seven_factor: dict | None = None,
                               eligibility: dict | None = None) -> dict:
    """Capture one dossier evaluation: inputs + both arm results, one write path.

    Steps (automatic, in order, no manual intervention between them):
      1. stamp captured_at (the collector's capture instant -- DISTINCT from
         the model's decision_at) and enforce the evidence class at the
         write boundary: ALWAYS computed from the bundle's own decision_at
         via classify_evidence_class(); an explicitly passed evidence_class
         may only DOWNGRADE toward less-fresh (FRESH -> REPLAY/REPRODUCTION),
         never upgrade -- an upward disagreement resolves in favor of the
         computed class and is recorded in the bundle note (write-boundary
         enforcement 2026-10-15: capture time never qualifies a row as
         FRESH, and neither does a caller-supplied label);
      1b. run the FULL frozen eligibility gate (check_frozen_eligibility)
         from the bundle's own fields -- issuance_key, snapshot linkage,
         factor-ledger completeness -- BEFORE persisting anything further;
         caller-supplied eligibility is recorded as
         eligibility_claimed_by_caller but is NEVER authoritative: the
         computed result alone decides the cohort label;
      2. persist the complete decision-time input bundle (verbatim) via the
         decision-time store -- missing inputs land UNKNOWN, never backfilled;
      3. score the production arm through intended_models;
      4. score the C-2 arm through intended_models (crypto only);
      5. write the arm-results evidence file, carrying the separately
         labeled deployed 7-factor context field (never trial input).

    Idempotency: if the input bundle file already exists the capture is
    SKIPPED (the store never overwrites a persisted bundle; a later
    correction is a new file). Nothing is appended to any vessel.

    Returns the capture record {opportunity_id, evidence_class, skipped,
    input_path, evidence_path, arms summary, eligibility}.
    """
    input_dir = input_dir or DEFAULT_INPUT_DIR
    evidence_dir = evidence_dir or DEFAULT_EVIDENCE_DIR
    bundle = copy.deepcopy(bundle)
    # Capture/decision separation (capture correction 2026-10-15):
    # captured_at is THIS run's instant; decision_at is the model's instant.
    bundle["captured_at"] = _utcnow_iso()
    # WRITE-BOUNDARY ENFORCEMENT (collector bypass finding 3a, 2026-10-15):
    # the evidence class is ALWAYS computed from the bundle's own
    # decision_at. An explicitly passed evidence_class may only DOWNGRADE
    # toward less-fresh (FRESH -> REPLAY/REPRODUCTION); it may NEVER
    # upgrade. A pre-cutoff row cannot be labeled FRESH through this path;
    # any upward disagreement is resolved in favor of the computed class
    # and recorded in the bundle note.
    computed_class, computed_note = classify_evidence_class(bundle.get("decision_at"))
    if evidence_class is None:
        evidence_class = computed_class
        freshness_note = computed_note
    elif evidence_class not in _FRESHNESS_ORDER:
        freshness_note = (
            f"explicit evidence_class {evidence_class!r} is not a recognized "
            f"class; computed classification {computed_class} wins; {computed_note}"
        )
        evidence_class = computed_class
    elif evidence_class == computed_class:
        freshness_note = (
            f"explicit evidence_class {evidence_class!r} agrees with the "
            f"cutoff classification; {computed_note}"
        )
    elif _freshness_rank(evidence_class) < _freshness_rank(computed_class):
        freshness_note = (
            f"explicit evidence_class {evidence_class!r} DOWNGRADED from the "
            f"computed class {computed_class}: explicit may only move toward "
            f"less-fresh, never upgrade; {computed_note}"
        )
    else:
        freshness_note = (
            f"explicit evidence_class {evidence_class!r} disagrees UPWARD with "
            f"the computed class {computed_class}: computed classification "
            f"wins and the disagreement is recorded here; {computed_note}"
        )
        evidence_class = computed_class
    bundle["evidence_class"] = evidence_class
    bundle["freshness_classification"] = {
        "cutoff_utc": DOSSIER_PROSPECTIVE_CUTOFF_ISO,
        "note": freshness_note,
    }
    # The single write path guarantees the REPLAY/REPRODUCTION label itself:
    # a replayed issuance is a recorded issuance reproduced through the
    # intended models, NOT a fresh evaluation. (extract_crypto_dossier_bundle
    # adds the id43-specific replay/defect notes; this generic note covers
    # any replay captured through this path.)
    if evidence_class == EVIDENCE_CLASS_REPLAY and "replay_note" not in bundle:
        bundle["replay_note"] = (
            "REPLAY/REPRODUCTION: this is a recorded dossier issuance "
            "reproduced through the intended models, NOT a fresh evaluation."
        )

    opp_id = bundle["opportunity_id"]
    input_filename = input_filename or f"{opp_id}.json"
    evidence_filename = evidence_filename or f"{opp_id}.json"
    input_path = os.path.join(input_dir, input_filename)

    if os.path.exists(input_path):
        return {
            "opportunity_id": opp_id,
            "evidence_class": evidence_class,
            "skipped": True,
            "reason": "already captured; the store never overwrites a persisted bundle",
            "input_path": input_path,
            "evidence_path": None,
        }

    # Step 1: persist decision-time inputs (store stamps persisted_at,
    # normalizes factors, marks missing inputs UNKNOWN).
    os.makedirs(input_dir, exist_ok=True)
    stored_path = store.persist_decision_time_inputs(bundle, path_override=input_path)

    # Steps 2-3: score both arms from the persisted bundle.
    with open(stored_path) as handle:
        persisted_bundle = json.load(handle)
    recorded = recorded or {}
    if bundle["terminal"] == "crypto":
        arms = score_crypto_arms(persisted_bundle, recorded)
    elif bundle["terminal"] == "equity":
        arms = score_equity_arms(persisted_bundle, recorded)
    else:
        raise ValueError(f"unknown terminal: {bundle['terminal']!r}")

    # Step 5: write the arm-results evidence file.
    os.makedirs(evidence_dir, exist_ok=True)
    if seven_factor is None:
        seven_factor = {
            "model": "deployed paper pilot 7-factor model -- NOT the frozen trial; "
                     "context only, never substituted into production/C-2 arms",
            "present": False,
            "reason": "no paper-pilot surface consulted for this capture",
        }
    # WRITE-BOUNDARY ENFORCEMENT (collector bypass finding 3b, 2026-10-15):
    # the FULL frozen eligibility gate ALWAYS runs here, computed from the
    # bundle's own fields (issuance_key, snapshot linkage, factor
    # completeness from the factor ledger) BEFORE anything else is
    # persisted. A caller-supplied `eligibility` is recorded as
    # `eligibility_claimed_by_caller` but is NEVER authoritative -- the
    # computed result alone decides the cohort label. A pre-cutoff or
    # incompatible row cannot be labeled fresh-eligible through this path.
    terminal = bundle.get("terminal") or "crypto"
    snapshot = bundle.get("snapshot") or {}
    prod_complete, prod_missing = _boundary_prod_completeness(
        terminal, bundle.get("factors")
    )
    eligibility_computed = check_frozen_eligibility(
        decision_at_iso=bundle.get("decision_at"),
        issuance_key=bundle.get("issuance_key"),
        snapshot_linked=snapshot.get("snapshot_id") is not None,
        prod_complete=prod_complete,
        prod_missing=prod_missing,
        terminal=terminal,
    )
    evidence = {
        "opportunity_id": opp_id,
        "evidence_class": evidence_class,
        "captured_at": bundle["captured_at"],
        "evaluated_at": _utcnow_iso(),
        "input_bundle": os.path.relpath(stored_path, HERE),
        "collector": "comparison/dossier_model_collector.py::capture_dossier_evaluation (single automatic write path)",
        "vessel_append": "none -- dossier captures are model-evaluation evidence, never prospective trial rows",
        "eligibility": eligibility_computed,
        "eligibility_claimed_by_caller": eligibility,
        "deployed_seven_factor": seven_factor,
    }
    if evidence_class == EVIDENCE_CLASS_REPLAY:
        evidence["replay_note"] = bundle.get("replay_note")
    evidence.update(arms)
    evidence_path = os.path.join(evidence_dir, evidence_filename)
    with open(evidence_path, "w") as handle:
        json.dump(evidence, handle, indent=2, sort_keys=True)
        handle.write("\n")

    def arm_summary(arm):
        return {
            "score": arm.get("score"),
            "direction": arm.get("direction"),
            "disposition": arm.get("arm_disposition", {}).get("disposition")
            or arm.get("disposition"),
        }

    return {
        "opportunity_id": opp_id,
        "evidence_class": evidence_class,
        "skipped": False,
        "input_path": stored_path,
        "evidence_path": evidence_path,
        "prod": arm_summary(arms["prod"]),
        "c2": arm_summary(arms["c2"]),
        "eligibility": eligibility_computed,
    }


# ---------------------------------------------------------------------------
# Automatic scan: find new dossier-path issuances and capture each.
# ---------------------------------------------------------------------------

def scan_new_dossier_evaluations(db_path: str = CRYPTO_DB,
                                 input_dir: str | None = None) -> list[dict]:
    """Find 2.0.0 dossier-path issued signals not yet captured.

    A signal is "new" when no input bundle exists for its opportunity_id in
    the input dir. BTC id43's bundle already exists in decision-time-inputs/
    (the accepted demo), so the automatic scan skips it; the id43 replay is
    captured explicitly with evidence_class=REPLAY/REPRODUCTION. Freshness
    is decided per issuance by classify_evidence_class() against the frozen
    cutoff -- the scan never defaults to FRESH (capture correction
    2026-10-15).
    """
    input_dir = input_dir or DEFAULT_INPUT_DIR
    con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    sigs = con.execute(
        """SELECT id, coin_id, name, symbol, direction, confidence, setup_type,
                  entry, invalidation, target1, target2, funding, oi_usd, oi_change,
                  created_at, factors_json, source_as_of, atr14, risk_multiplier,
                  risk_method, issuance_key
           FROM generated_signals
           WHERE issuance_key LIKE ?
           ORDER BY id""",
        (CRYPTO_DOSSIER_ISSUANCE_LIKE,),
    ).fetchall()
    new = []
    for sig in sigs:
        opp_id = opportunity_id_for(sig["symbol"], sig["id"], sig["created_at"])
        if os.path.exists(os.path.join(input_dir, f"{opp_id}.json")):
            continue
        snap = find_snapshot_for_signal(con, sig["coin_id"], sig["created_at"])
        new.append({"signal": dict(sig), "snapshot": dict(snap) if snap else None,
                    "opportunity_id": opp_id})
    con.close()
    return new


def capture_new_dossier_evaluations(db_path: str = CRYPTO_DB,
                                    evidence_class: str | None = None,
                                    input_dir: str | None = None,
                                    evidence_dir: str | None = None,
                                    pilot_status_exports: list | None = None) -> list[dict]:
    """Automatically capture every new dossier evaluation, end to end.

    Each new issuance goes through capture_dossier_evaluation's single write
    path (inputs persisted + both arms scored + evidence written). The frozen
    eligibility gate (check_frozen_eligibility) is applied BEFORE admission:
    evidence_class defaults to None so each issuance is classified against
    the frozen cutoff from its own decision_at (pre-cutoff issuances are
    captured as REPLAY/REPRODUCTION -- historical reproduction -- never
    defaulted to FRESH). Issuances with no decision-time snapshot are NOT
    captured and NOT reconstructed -- they are reported as skipped with
    reason "no-input-snapshot" and cohort "incompatible:no-input-snapshot"
    (UNKNOWN inputs are for inputs missing at capture time, not for a wholly
    absent issuance record). The deployed 7-factor result is looked up per
    issuance and carried only in the separately labeled evidence field.
    """
    import glob as _glob
    results = []
    if pilot_status_exports is None:
        pilot_status_exports = sorted(_glob.glob(PILOT_STATUS_EXPORT_GLOB), reverse=True)
    for item in scan_new_dossier_evaluations(db_path, input_dir):
        sig, snap = item["signal"], item["snapshot"]
        if snap is None:
            elig = check_frozen_eligibility(
                decision_at_iso=None, issuance_key=sig.get("issuance_key"),
                snapshot_linked=False, prod_complete=False,
                prod_missing=["unknown: no bundle extracted"], terminal="crypto")
            results.append({
                "opportunity_id": item["opportunity_id"],
                "evidence_class": None,
                "skipped": True,
                "reason": "no-input-snapshot: no v3 canonical decision-time snapshot linked; never reconstructed",
                "input_path": None,
                "evidence_path": None,
                "eligibility": elig,
            })
            continue
        con = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        con.row_factory = sqlite3.Row
        sig_row = con.execute(
            "SELECT * FROM generated_signals WHERE id = ?", (sig["id"],)).fetchone()
        snap_row = con.execute(
            "SELECT * FROM signal_input_snapshots WHERE id = ?", (snap["id"],)).fetchone()
        con.close()
        bundle = extract_crypto_dossier_bundle(sig_row, snap_row, db_path,
                                               evidence_class=evidence_class or EVIDENCE_CLASS_FRESH)
        # Frozen eligibility gate BEFORE admission: classify this issuance
        # against the cutoff from its own decision_at (capture correction
        # 2026-10-15 -- never default to FRESH).
        auto_class, _auto_note = classify_evidence_class(bundle.get("decision_at"))
        issuance_class = evidence_class or auto_class
        prod_complete, prod_missing = store.ledger_completeness(
            "crypto", bundle["factors"], for_challenger=False)
        elig = check_frozen_eligibility(
            decision_at_iso=bundle.get("decision_at"),
            issuance_key=bundle.get("issuance_key"),
            snapshot_linked=True, prod_complete=prod_complete,
            prod_missing=prod_missing, terminal="crypto")
        seven = find_deployed_seven_factor_match(
            sig_row["coin_id"], sig_row["direction"], bundle.get("decision_at"),
            pilot_status_exports)
        recorded = {"confidence": sig_row["confidence"], "direction": sig_row["direction"]}
        rec = capture_dossier_evaluation(
            bundle, recorded=recorded, evidence_class=issuance_class,
            input_dir=input_dir, evidence_dir=evidence_dir,
            seven_factor=seven, eligibility=elig)
        results.append(rec)
    return results


def capture_id43_replay() -> dict:
    """Capture the BTC id43 REPLAY/REPRODUCTION into intended-models-genuine-inputs/.

    BTC id43 is this morning's dossier issuance (2026-10-14T13:00:21.555Z)
    reproduced through the intended models -- NOT a fresh evaluation. The
    genuine decision-time input snapshot lands at
    comparison/intended-models-genuine-inputs/btc-id43-genuine-inputs.json
    (fixing the defect where the supplied input JSON duplicated the output
    JSON); both arm results land beside it as btc-id43-replay-evidence.json.
    The accepted demo files in decision-time-inputs/ and
    wired-trial-evidence/ are not touched.
    """
    os.makedirs(GENUINE_INPUTS_DIR, exist_ok=True)
    con = sqlite3.connect(f"file:{CRYPTO_DB}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    sig_row = con.execute(
        "SELECT * FROM generated_signals WHERE id = ?", (ID43_SIGNAL_ID,)).fetchone()
    snap_row = con.execute(
        "SELECT * FROM signal_input_snapshots WHERE id = ?", (ID43_SNAPSHOT_ID,)).fetchone()
    con.close()
    if sig_row is None or snap_row is None:
        raise SystemExit("BTC id43 signal/snapshot not found in workspace DB copy")
    bundle = extract_crypto_dossier_bundle(sig_row, snap_row, CRYPTO_DB,
                                           evidence_class=EVIDENCE_CLASS_REPLAY)
    recorded = {"confidence": sig_row["confidence"], "direction": sig_row["direction"]}
    return capture_dossier_evaluation(
        bundle, recorded=recorded, evidence_class=EVIDENCE_CLASS_REPLAY,
        input_dir=GENUINE_INPUTS_DIR, evidence_dir=GENUINE_INPUTS_DIR,
        input_filename="btc-id43-genuine-inputs.json",
        evidence_filename="btc-id43-replay-evidence.json",
    )


def main() -> None:
    import argparse
    parser = argparse.ArgumentParser(description="Automatic dual-arm dossier-model capture")
    parser.add_argument("--replay-id43", action="store_true",
                        help="capture the BTC id43 REPLAY/REPRODUCTION into intended-models-genuine-inputs/")
    parser.add_argument("--scan", action="store_true",
                        help="automatically capture all new (uncaptured) dossier evaluations")
    args = parser.parse_args()
    if args.replay_id43:
        rec = capture_id43_replay()
        print(json.dumps(rec, indent=2))
    elif args.scan:
        results = capture_new_dossier_evaluations()
        print(json.dumps(results, indent=2))
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
