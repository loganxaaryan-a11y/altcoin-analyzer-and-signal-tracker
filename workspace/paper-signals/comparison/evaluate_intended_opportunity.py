#!/usr/bin/env python3
"""Demonstrate the wired intended-model trial on one natural opportunity.

Sandbox/research only. Paper signals only. No brokerage. Read-only against
the workspace DB copies. No writes to the deployed pilot, the frozen
manifests, or any comparison vessel (this demo APPENDS NO ROW anywhere --
it writes decision-time input bundles and evaluation evidence to new files
under comparison/decision-time-inputs/ and comparison/wired-trial-evidence/).

Opportunity: dossier-btc-id43-2026-10-14
  - BTC long issued 2026-10-14T13:00:21.555Z through the dossier issuance path
    (getCryptoAnalysis -> issueGeneratedSignalCandidate) by
    crypto-dossier-factor-agreement 2.0.0-measurement-contract
    (issuance_key pins strategy id / version / parameter hash
    sha256:4a098b4d389cb85293c78785c82e88a32fe6d96544a8dd84c341dce9fa0b7220).
  - Canonical decision-time input snapshot 3775786275845128
    (crypto-input-snapshot-v3-canonical-atr-window, replayAtIssuance:
    reconstructed, 0 mismatches).

The demo:
  1. Extracts the complete decision-time inputs (every factor with its asOf,
     the ATR bar window, entry evidence, provider metadata) from the
     read-only workspace DB copy.
  2. Persists them via decision_time_store.persist_decision_time_inputs
     (never-backfill rule: missing inputs -> UNKNOWN, never reconstructed).
  3. Scores BOTH frozen arms from the persisted bundle through
     intended_models (the wired model functions):
       prod: score_dossier_factors  (crypto-dossier-factor-agreement 2.0.0)
       C-2:  c2_score_minus_momentum (crypto-dossier-minus-momentum 0.1.0-shadow)
  4. Writes comparison/wired-trial-evidence/dossier-btc-id43-2026-10-14.json
     with both arms' scores, directions, level verification, and honest
     dispositions (ABSTAIN/UNKNOWN where evidence is missing).
"""

import datetime
import json
import os
import sqlite3
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import decision_time_store as store
import intended_models as models

CRYPTO_DB = os.path.expanduser(
    "~/workspace/ts-spaces/altcoin-analyzer-and-signal-tracker/app.db"
)
SIGNAL_ID = 43
SNAPSHOT_ID = 3775786275845128
OPPORTUNITY_ID = "dossier-btc-id43-2026-10-14"


def _iso(ms) -> str | None:
    if ms is None:
        return None
    return datetime.datetime.fromtimestamp(ms / 1000, datetime.timezone.utc).isoformat(
        timespec="milliseconds"
    )


def extract_bundle() -> dict:
    con = sqlite3.connect(f"file:{CRYPTO_DB}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row

    row = con.execute(
        "SELECT id, coin_id, name, symbol, direction, confidence, setup_type, entry,"
        " invalidation, target1, target2, funding, oi_usd, oi_change, created_at,"
        " factors_json, source_as_of, atr14, risk_multiplier, risk_method,"
        " issuance_key FROM generated_signals WHERE id = ?", (SIGNAL_ID,)
    ).fetchone()
    if row is None:
        raise SystemExit(f"signal {SIGNAL_ID} not found in workspace DB copy")

    snap = con.execute(
        "SELECT id, snapshot_version, provider_metadata_json, payload_json,"
        " captured_at, available_at, created_at FROM signal_input_snapshots"
        " WHERE id = ?", (SNAPSHOT_ID,)
    ).fetchone()
    if snap is None:
        raise SystemExit(f"snapshot {SNAPSHOT_ID} not found")
    con.close()

    payload = json.loads(snap["payload_json"])
    provider_metadata = json.loads(snap["provider_metadata_json"])
    signal = dict(row)
    factors = json.loads(signal["factors_json"])
    raw_inputs = payload["rawDecisionInputs"]

    return {
        "opportunity_id": OPPORTUNITY_ID,
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
            "source_db": CRYPTO_DB,
            "source_db_role": "local workspace copy; read-only open (mode=ro); not a dump of the deployed runtime",
            "signal_table": "generated_signals",
            "signal_id": signal["id"],
            "snapshot_table": "signal_input_snapshots",
            "snapshot_id": snap["id"],
            "extracted_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="milliseconds"),
        },
    }


def evaluate(bundle: dict) -> dict:
    """Score both frozen arms from the persisted bundle. Returns evidence."""
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

    def arm_disposition(scored, complete, missing, arm):
        if not complete:
            return {"disposition": "unscored", "reason": "unscored:incomplete-factor-ledger", "missing": missing}
        return {"disposition": "scored", "reason": None, "missing": missing}

    evidence = {
        "opportunity_id": OPPORTUNITY_ID,
        "evaluated_at": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="milliseconds"),
        "input_bundle": f"comparison/decision-time-inputs/{OPPORTUNITY_ID}.json",
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
            "arm_disposition": arm_disposition(prod, prod_complete, prod_missing, "prod"),
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
            "arm_disposition": arm_disposition(c2, c2_complete, c2_missing, "c2"),
        },
    }

    # Recorded-issuance fidelity check (the pipeline's own decision is the
    # ground truth for the prod arm here): recomputed long score must equal
    # the recorded confidence, direction must match, and build_atr_levels
    # must reproduce the recorded levels to full float precision.
    if prod:
        recomputed_levels = models.build_atr_levels(
            prod["direction"], entry_ctx["entry_price"], entry_ctx["atr14"],
            entry_ctx["risk_multiplier"],
        )
        recorded_confidence, recorded_direction = bundle_recorded_decision()
        evidence["prod"]["recorded_fidelity"] = {
            "recorded_confidence": recorded_confidence,
            "recomputed_matches_recorded_confidence": prod["longScore"] == recorded_confidence,
            "recorded_direction": recorded_direction,
            "recomputed_matches_recorded_direction": prod["direction"] == recorded_direction,
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
    # attestation, drift caps) have NO evidence for this opportunity -- the
    # dossier entry convention (CoinGecko provider quote) is a different
    # evidence standard. RULE 6: missing C-2 evidence is UNKNOWN, never filled.
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


def bundle_recorded_decision():
    con = sqlite3.connect(f"file:{CRYPTO_DB}?mode=ro", uri=True)
    row = con.execute(
        "SELECT confidence, direction FROM generated_signals WHERE id = ?", (SIGNAL_ID,)
    ).fetchone()
    con.close()
    return int(row[0]), row[1]


def main() -> None:
    bundle = extract_bundle()
    store_path = store.persist_decision_time_inputs(bundle)
    evidence = evaluate(bundle)

    evidence_dir = os.path.join(HERE, "wired-trial-evidence")
    os.makedirs(evidence_dir, exist_ok=True)
    evidence_path = os.path.join(evidence_dir, f"{OPPORTUNITY_ID}.json")
    with open(evidence_path, "w") as handle:
        json.dump(evidence, handle, indent=2, sort_keys=True)
        handle.write("\n")

    print(f"bundle persisted: {store_path}")
    print(f"evidence written: {evidence_path}")
    print(f"prod: score={evidence['prod']['score']} dir={evidence['prod']['direction']} "
          f"disp={evidence['prod']['arm_disposition']['disposition']}")
    print(f"C-2 : score={evidence['c2']['score']} dir={evidence['c2']['direction']} "
          f"leg={evidence['c2'].get('leg')} disp={evidence['c2']['arm_disposition']['disposition']}")
    print(f"prod fidelity vs recorded: {evidence['prod']['recorded_fidelity']}")
    print(f"operational: prod={evidence['operational_dispositions']['prod_paper_issuance']['disposition']} "
          f"c2={evidence['operational_dispositions']['c2_paper_issuance']['disposition']}")


if __name__ == "__main__":
    main()
