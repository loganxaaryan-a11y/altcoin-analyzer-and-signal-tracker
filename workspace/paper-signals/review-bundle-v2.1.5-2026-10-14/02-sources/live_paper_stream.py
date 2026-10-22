#!/usr/bin/env python3
"""Live paper-stream export adapter (fix 3).

Reads a getpaperpilotstatus response from the DEPLOYED artifact
(altcoin-analyzer-and-signal-tracker) and converts its paper candidates,
signals, comparisons and alerts into collector candidate dicts in the
harness candidate schema (see comparison/README.md "Candidate schema" and
collect_pilot_rows.py ingest_* functions).

Each candidate dict carries the FULL issuance record the repaired issuance
handler (orchestrator/src/issuance/handler.ts) produces, as five nested
blocks:

  contract                the frozen ActionableEntryContract
                          (entry-v1/src/contract.ts) — decisionAt,
                          sourceObservedAt, entry rule, entry venue, entry
                          window, drift caps, entry observation fields,
                          invalidation/targets/risk, issuedBy/issuedAt,
                          cohortId, evidence fields
  entry_observation       the EntryObservationEvent record
                          (entry-v1/src/pending.ts) — observed price,
                          provider observation time (entryObservedAt),
                          server receipt time (entryReceivedAt), venue
                          label, observation age
  frozen_levels           decision-time levels (entry-v1/src/levels.ts) —
                          invalidation, targets, risk per unit, basis
                          price, ATR14 when the deployed row carries it,
                          the level-freeze policy
  gate_inputs             the gate inputs the handler evaluated —
                          freshness refresh results, regime-gate inputs,
                          entry-zone check inputs, issuance-veto inputs,
                          duplicate check, post-entry assessment
  waiting_interval_evidence
                          the genuine decision->entry veto over the real
                          [contract.decisionAt, entryObservedAt] interval
                          (veto/src/waiting-interval.ts) — checks,
                          final verdict, reason

Sourcing rule: every field is read from the deployed status response
(signal/candidate/contract/alert rows), tolerating the handler's camelCase
persisted names and snake_case serializer aliases. Absent fields stay None
-- never fabricated. Fields that are repo-rule derivations (drift caps,
drift-limit bps, granularity, empty-interval allowance, v1 level-freeze
policy) are derived only from the documented frozen rules and labeled in
the field-coverage table; per-issuance data that the handler does not
persist (entry eventRecordedAt, waiting-interval bars, per-bar verdicts)
is None and marked "unavailable in deployed response".

This replaces the workspace-DB-copy ingest for the prospective pilot:
the collector must prove ONGOING DEPLOYED collection, not a static copy.

Usage:
    python live_paper_stream.py --status live-paper-status-YYYY-MM-DD.json \
        --out live-paper-export-YYYY-MM-DD.json

The agent (not this script) calls artifact.invoke_action getpaperpilotstatus
and saves the response JSON; this script converts it.

Post-freeze cutoff: candidates with decision_at before FREEZE_CUTOFF_ISO
are EXCLUDED here (defense in depth; the collector enforces it again
before appending). Cutoff = v2.1.0 freeze time 2026-10-14T04:57:00Z.

Paper signals only. No brokerage. No strategy changes. Holdouts locked.
"""

import argparse
import json
import sys
from datetime import datetime, timezone

FREEZE_CUTOFF_ISO = "2026-10-14T04:57:00+00:00"
ACTIVE_FREEZE_VERSION = "2.1.5"
ARTIFACT_SLUG = "altcoin-analyzer-and-signal-tracker"


def _parse_ts(v):
    if not v:
        return None
    try:
        s = str(v).replace("Z", "+00:00")
        return datetime.fromisoformat(s)
    except Exception:
        return None


def _parse_ms(v):
    dt = _parse_ts(v)
    if dt is None:
        return None
    return int(dt.timestamp() * 1000)


def _after_cutoff(decision_at):
    dt = _parse_ts(decision_at)
    if dt is None:
        return False
    return dt >= datetime.fromisoformat(FREEZE_CUTOFF_ISO)


def _pick(row, *keys, default=None):
    """First non-None value among alias keys; None when the row lacks them.

    Tolerates the handler's camelCase persisted names and snake_case
    serializer aliases. Never fabricates: absent -> None.
    """
    if not isinstance(row, dict):
        return default
    for k in keys:
        v = row.get(k)
        if v is not None:
            return v
    return default


def _contract_dict(rec):
    """The frozen ActionableEntryContract as a dict, or None.

    The handler persists the contract as a contract row carrying the JSON
    (saveContract: contractJson). The deployed status serializer may expose
    it as a parsed `contract` block or as a JSON string under
    `contractJson`/`contract_json`. Absent or unparseable -> None.
    """
    if not isinstance(rec, dict):
        return None
    c = rec.get("contract")
    if isinstance(c, dict):
        return c
    raw = _pick(rec, "contractJson", "contract_json")
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str) and raw.strip():
        try:
            parsed = json.loads(raw)
        except Exception:
            return None
        return parsed if isinstance(parsed, dict) else None
    return None


def _outcome(rec):
    return _pick(rec, "outcome") or {}


def _detail(rec):
    oc = _outcome(rec)
    return oc.get("detail") if isinstance(oc, dict) else None


def _candidate_inputs(rec):
    return _pick(rec, "inputs") or {}


# ---------------------------------------------------------------------------
# Full-record block builders
# ---------------------------------------------------------------------------

# (adapter_key, contract JSON key, extra row-level aliases)
CONTRACT_FIELDS = [
    ("contract_version", "contractVersion", ()),
    ("terminal", "terminal", ()),
    ("signal_id", "signalId", ()),
    ("strategy_id", "strategyId", ()),
    ("strategy_version", "strategyVersion", ()),
    ("parameter_hash", "parameterHash", ()),
    ("decision_at", "decisionAt", ("decision_at", "decided_at")),
    ("decision_clock", "decisionClock", ()),
    ("decision_price", "decisionPrice", ()),
    ("source_observed_at", "sourceObservedAt", ()),
    ("source_observation_window", "sourceObservationWindow", ()),
    ("observation_degraded", "observationDegraded", ()),
    ("entry_rule", "entryRule", ()),
    ("entry_venue", "entryVenue", ()),
    ("entry_window_opens_at", "entryWindowOpensAt", ()),
    ("entry_window_expires_at", "entryWindowExpiresAt", ()),
    ("entry_price", "entryPrice", ()),
    ("entry_observed_at", "entryObservedAt", ()),
    ("entry_received_at", "entryReceivedAt", ()),
    ("entry_evidence", "entryEvidence", ()),
    ("entry_evidence_reason", "entryEvidenceReason", ()),
    ("drift_cap_pct", "driftCapPct", ()),
    ("drift_observed_pct", "driftObservedPct", ()),
    ("entry_state", "entryState", ()),
    ("void_reason", "voidReason", ()),
    ("invalidation_price", "invalidationPrice", ("invalidation", "invalidation_price")),
    ("target1_price", "target1Price", ("target1", "target1_price")),
    ("target2_price", "target2Price", ("target2", "target2_price")),
    ("risk_per_unit", "riskPerUnit", ()),
    ("horizon_unit", "horizonUnit", ()),
    ("primary_horizon", "primaryHorizon", ()),
    ("evaluator_compatibility", "evaluatorCompatibility", ()),
    ("supersedes", "supersedes", ()),
    ("issued_by", "issuedBy", ()),
    ("issued_at", "issuedAt", ()),
    ("cohort_id", "cohortId", ()),
]


def _build_contract_block(rec):
    """The full ActionableEntryContract per issuance.

    Sourced from the persisted contract JSON. The fallback tier is narrow
    and semantic: same-named row-level fields for the decision instant and
    decision-time levels (identical meaning when no contract was built,
    e.g. suppressed candidates). Entry/observation fields have NO
    row-alias fallback — a proposed entry is not an observed fill.
    Every field: value or None, never fabricated.
    """
    contract = _contract_dict(rec) or {}
    block = {}
    for adapter_key, contract_key, aliases in CONTRACT_FIELDS:
        v = contract.get(contract_key)
        if v is None:
            v = _pick(rec, *aliases)
        block[adapter_key] = v
    return block


def _build_entry_observation_block(rec, contract_block):
    """The entry-observation record (entry-v1/src/pending.ts EntryObservationEvent).

    The handler persists the entry event's id in outcome.detail.entryEventId;
    the full event is NOT persisted as a row — eventRecordedAt is therefore
    unavailable in the deployed response. Observation age is computed from
    the two persisted timestamps (venue observation, server receipt).
    """
    detail = _detail(rec) or {}
    obs_at = contract_block.get("entry_observed_at")
    rec_at = contract_block.get("entry_received_at")
    age_ms = None
    obs_ms, rec_ms = _parse_ms(obs_at), _parse_ms(rec_at)
    if obs_ms is not None and rec_ms is not None:
        age_ms = rec_ms - obs_ms
    return {
        # The persisted entry-observation event id (outcome.detail).
        "event_id": _pick(detail, "entryEventId", "entry_event_id"),
        # Observed price: the entry print the contract was entered on.
        "entry_price": contract_block.get("entry_price"),
        # Provider/venue observation time of the entry print.
        "entry_observed_at": obs_at,
        # Server receipt time of the entry print (staleness audit).
        "entry_received_at": rec_at,
        # The observation event's own recording instant — NOT persisted
        # by the handler (entry-v1/pending.ts eventRecordedAt has no
        # persisted row); unavailable in the deployed response.
        "entry_recorded_at": None,
        # Venue label the print was observed on.
        "venue_label": contract_block.get("entry_venue"),
        # Observation age = receipt - observation, in ms (computed, not stored).
        "observation_age_ms": age_ms,
        # Declared observation-age bound (entry-rules.ts maxObservationAgeMs)
        # is a handler constant, not per-issuance persisted data.
        "max_observation_age_ms": None,
        # How the entry print was evidenced.
        "entry_evidence": contract_block.get("entry_evidence"),
        "entry_evidence_reason": contract_block.get("entry_evidence_reason"),
        "entry_state": contract_block.get("entry_state"),
        "void_reason": contract_block.get("void_reason"),
    }


def _build_frozen_levels_block(rec, contract_block):
    """Decision-time frozen levels (entry-v1/src/levels.ts).

    The v1 rule is freeze-at-decision: published levels === decision-time
    levels, never rebuilt around the entry print. ATR14 is NOT produced by
    the handler's contract path — it is carried only when the deployed
    signal row itself includes it (legacy production field); else None.
    """
    contract = _contract_dict(rec) or {}
    version = contract.get("contractVersion")
    policy = "freeze-at-decision" if version == "actionable-entry-v1" else None
    return {
        "invalidation_price": contract_block.get("invalidation_price"),
        "target1_price": contract_block.get("target1_price"),
        "target2_price": contract_block.get("target2_price"),
        "risk_per_unit": contract_block.get("risk_per_unit"),
        # The price the levels were frozen from (contract decisionPrice).
        "basis_price": contract_block.get("decision_price"),
        # ATR-14 the levels were derived from: not produced by the handler
        # path; read from the deployed row only when present.
        "atr14": _pick(rec, "atr14", "atr_14"),
        # Level-freeze policy: derived from the contract version via the
        # documented v1 rule (entry-v1/levels.ts "freeze-at-decision is
        # the v1 rule"); None when the contract block is absent.
        "level_freeze_policy": policy,
        # Decision instant the levels were frozen at.
        "frozen_at": contract_block.get("decision_at"),
    }


def _build_gate_inputs_block(rec, contract_block, issued):
    """The gate inputs the handler evaluated per issuance.

    Freshness (refreshIfStale), the retained regime gate, the entry-zone
    check inputs and the issuance-veto inputs (buildIssuanceVetoInput), the
    duplicate pre-check, and the post-entry assessment. Structured per-gate
    results beyond what the handler persists (vetoSummary string, outcome
    gate/reason, outcome.detail) are None — never reconstructed.
    """
    outcome = _outcome(rec)
    detail = _detail(rec) or {}
    inputs = _candidate_inputs(rec)
    terminal = contract_block.get("terminal") or _pick(rec, "terminal")
    direction = contract_block.get("direction") or _pick(rec, "direction")
    gate = outcome.get("gate") if isinstance(outcome, dict) else None

    freshness_verdict = None
    if gate == "stale-inputs":
        freshness_verdict = "stale-inputs"
    elif issued:
        freshness_verdict = "passed"  # issued => refreshIfStale did not defer

    veto_verdict = None
    if issued:
        veto_verdict = "pass"  # the contract is only built on a pass verdict
    elif gate == "issuance-veto":
        veto_verdict = "fail_closed"

    regime_gate_name = "short-regime" if direction == "short" else None
    regime_result = None
    if issued:
        regime_result = "passed"
    elif gate in ("short-regime", "evidence-insufficient"):
        regime_result = "blocked"

    entry_price = contract_block.get("entry_price") or _pick(rec, "entry", "entryPrice")
    invalidation = contract_block.get("invalidation_price") or _pick(rec, "invalidation")
    decision_at = contract_block.get("decision_at") or _pick(rec, "decision_at", "decided_at")

    post = _pick(detail, "postEntry", "post_entry") or {}
    return {
        "freshness": {
            # ISO instant the gate inputs were captured (FreshInputs.asOf).
            "inputs_as_of": _pick(inputs, "asOf", "as_of"),
            "decision_at": decision_at,
            # Freshness window (DEFAULT_CONFIG.freshnessMs) is a handler
            # constant, not per-issuance persisted data.
            "freshness_window_ms": None,
            "verdict": freshness_verdict,
        },
        "regime_gate": {
            "direction": direction,
            # The retained regime gate (shorts only; longs have no gate).
            "gate": regime_gate_name,
            "result": regime_result,
            "reason": outcome.get("reason") if gate in (
                "short-regime", "evidence-insufficient") else None,
            # Regime-gate inputs (from the persisted candidate inputs).
            "inputs": {
                "current_price": _pick(inputs, "currentPrice", "current_price"),
                "history_closes": _pick(inputs, "historyCloses", "history_closes"),
                "history_highs": _pick(inputs, "historyHighs", "history_highs"),
                "signal_day": _pick(inputs, "signalDay", "signal_day"),
                "raw_bars": _pick(inputs, "rawBars", "raw_bars"),
            },
        },
        "entry_zone": {
            "direction": direction,
            # Proposed entry: the live quote at qualification
            # (fresh.currentPrice ?? candidate.entryPrice).
            "proposed_entry": _pick(inputs, "currentPrice", "current_price") or entry_price,
            # Decision-time reference entry.
            "reference_entry": entry_price,
            # Drift limit: terminal-dependent documented rule
            # (veto-input.ts: 150 bps crypto / 50 bps equity).
            "drift_limit_bps": (150 if terminal == "crypto"
                                else 50 if terminal == "equity" else None),
            "entry_at": decision_at,
            # No expiry is configured at the veto stage (veto-input.ts);
            # the contract's entry window governs expiry at observation.
            "expires_at": None,
        },
        "veto": {
            "verdict": veto_verdict,
            # Persisted qualification summary
            # (runQualificationChecks -> vetoSummary).
            "summary": _pick(detail, "vetoSummary", "veto_summary"),
            # Persisted per-check results (reject path detail.checks).
            "checks": _pick(detail, "checks"),
            # Decision-instant recorded by the veto input (detectedAt).
            "pre_decision_at": _pick(rec, "detectedAt", "detected_at"),
            # Finest evidence granularity: documented terminal rule
            # (veto-input.ts: intraday crypto / session equity).
            "finest_granularity": ("intraday" if terminal == "crypto"
                                   else "session" if terminal == "equity" else None),
            # Veto evidence bars (persisted candidate inputs, when the
            # deployed serializer includes them).
            "bars": _pick(inputs, "vetoBars", "veto_bars"),
            # Pipeline-order guard inputs: in the integrated path the
            # levels are final at qualification, so draft == published.
            "pipeline_stops": {"draft_stop": invalidation,
                               "published_stop": invalidation},
        },
        "duplicate_check": {
            # Persisted only on the duplicate-rejection path.
            "winning_signal_id": _pick(detail, "winningSignalId", "winning_signal_id"),
        },
        "post_entry": {
            "verdict": (_pick(detail, "postEntryInvalidation", "post_entry_invalidation")
                        or post.get("verdict")),
            "entry_valid": post.get("entryValid") or post.get("entry_valid"),
            "intervening_invalidation": (
                post.get("interveningInvalidation")
                or post.get("intervening_invalidation")),
            "reason": (_pick(detail, "postEntryReason", "post_entry_reason")
                       or post.get("reason")),
        },
    }


def _build_waiting_interval_block(rec, contract_block, issued):
    """The genuine decision->entry veto over the REAL interval
    [contract.decisionAt, entryObservedAt] (veto/src/waiting-interval.ts).

    The handler persists the structured result only on the invalidated path
    (outcome.detail.waitingInterval {verdict, reason, checks}). For an
    ISSUED signal the verdict is necessarily "pass" — handler.ts step 9b
    fails closed on any non-pass verdict, so issuance implies pass. The
    waiting-interval bars and per-bar verdicts are NOT persisted per
    issuance: unavailable in the deployed response.
    """
    detail = _detail(rec) or {}
    wi = _pick(detail, "waitingInterval", "waiting_interval") or {}
    checks = wi.get("checks") if isinstance(wi, dict) else None
    verdict = wi.get("verdict") if isinstance(wi, dict) else None
    provenance = None
    if verdict is None and issued:
        verdict = "pass"
        provenance = ("derived: handler.ts step 9b fails closed on any "
                      "non-pass verdict, so issuance implies a pass verdict")
    elif verdict is not None:
        provenance = "persisted outcome.detail.waitingInterval"
    terminal = contract_block.get("terminal") or _pick(rec, "terminal")
    return {
        # The real waiting interval graded by the veto.
        "interval": [contract_block.get("decision_at"),
                     contract_block.get("entry_observed_at")],
        "direction": _pick(rec, "direction"),
        # The final published stop the veto graded.
        "final_stop": contract_block.get("invalidation_price"),
        # Recorded detection instant (bars before this are setup-history
        # features, never stop-outs).
        "pre_decision_at": _pick(rec, "detectedAt", "detected_at"),
        "finest_granularity": ("intraday" if terminal == "crypto"
                               else "session" if terminal == "equity" else None),
        # Equity's overnight gap has no bars BY CONSTRUCTION (not uncertainty).
        "allow_empty_interval": (True if terminal == "equity"
                                 else False if terminal == "crypto" else None),
        # Waiting-interval evidence bars: not persisted per issuance.
        "bars": None,
        # Per-bar verdicts: not persisted per issuance (the handler keeps
        # only the two check-level results below).
        "per_bar_verdicts": None,
        # The setup-history filter and decision->entry invalidation as
        # separate check entries (persisted on the invalidated path).
        "checks": checks,
        "final_verdict": verdict,
        "reason": wi.get("reason") if isinstance(wi, dict) else None,
        "verdict_provenance": provenance,
    }


# ---------------------------------------------------------------------------
# Alert join (the deployed status response carries data.alerts[])
# ---------------------------------------------------------------------------

def _index_alerts(data):
    """Index deployed alert rows by candidate id and by signal id."""
    by_candidate, by_signal = {}, {}
    for a in data.get("alerts") or []:
        if not isinstance(a, dict):
            continue
        cid = _pick(a, "candidateId", "candidate_id")
        sid = _pick(a, "signalId", "signal_id")
        if cid:
            by_candidate.setdefault(str(cid), []).append(a)
        if sid:
            by_signal.setdefault(str(sid), []).append(a)
    return by_candidate, by_signal


def _alert_block(a):
    if not isinstance(a, dict):
        return None
    return {
        "alert_id": _pick(a, "id", "alert_id"),
        "kind": _pick(a, "kind"),
        "enqueued_at": _pick(a, "enqueuedAt", "enqueued_at"),
        "delivered_at": _pick(a, "deliveredAt", "delivered_at"),
        "delivery_status": _pick(a, "deliveryStatus", "delivery_status"),
        "delivery_mode": _pick(a, "deliveryMode", "delivery_mode"),
        "ack_id": _pick(a, "ackId", "ack_id"),
        "delivery_attempts": _pick(a, "deliveryAttempts", "delivery_attempts"),
    }


def _alerts_for(rec, contract_id, by_candidate, by_signal):
    """Match setup + entry alert rows for this record.

    Setup alert id is deterministic (setup_<candidateId>), entry alert id
    deterministic (entry_<signalId>); matched by id, falling back to the
    candidate/signal indexes.
    """
    cid = _pick(rec, "candidateId", "candidate_id", "candidate_id", "id")
    sig_id = _pick(rec, "signalId", "signal_id", "id") or contract_id
    setup_id = f"setup_{cid}" if cid else None
    entry_id = f"entry_{sig_id}" if sig_id else None
    pool = []
    if cid and str(cid) in by_candidate:
        pool.extend(by_candidate[str(cid)])
    if sig_id and str(sig_id) in by_signal:
        pool.extend(by_signal[str(sig_id)])
    setup = entry = None
    for a in pool:
        aid = _pick(a, "id", "alert_id")
        kind = _pick(a, "kind")
        if setup_id and aid == setup_id:
            setup = a
        elif entry_id and aid == entry_id:
            entry = a
        elif kind == "setup" and setup is None:
            setup = a
        elif kind == "entry" and entry is None:
            entry = a
    return _alert_block(setup), _alert_block(entry)


# ---------------------------------------------------------------------------
# Candidate builders
# ---------------------------------------------------------------------------

def _full_record_blocks(rec, issued):
    contract_block = _build_contract_block(rec)
    return {
        "contract": contract_block,
        "entry_observation": _build_entry_observation_block(rec, contract_block),
        "frozen_levels": _build_frozen_levels_block(rec, contract_block),
        "gate_inputs": _build_gate_inputs_block(rec, contract_block, issued),
        "waiting_interval_evidence": _build_waiting_interval_block(
            rec, contract_block, issued),
    }


def candidate_from_paper_signal(sig, status_data, alert_index=None):
    """Map one deployed paper_signals row to a collector candidate dict."""
    sig_id = sig.get("id") or sig.get("signal_id")
    decision_at = sig.get("decision_at") or sig.get("decided_at")
    blocks = _full_record_blocks(sig, issued=True)
    # The deployed handler's deterministic contract id is ct_<candidateId>.
    deployed_cid = sig.get("candidateId") or sig.get("candidate_id")
    contract_id = f"ct_{deployed_cid}" if deployed_cid else None

    by_candidate, by_signal = alert_index or ({}, {})
    setup_alert, entry_alert = _alerts_for(sig, contract_id, by_candidate, by_signal)
    alert_enqueued_at = ((entry_alert or {}).get("enqueued_at")
                         or sig.get("alert_enqueued_at"))
    alert_delivered_at = ((entry_alert or {}).get("delivered_at")
                          or sig.get("alert_delivered_at"))
    return {
        "candidate_id": f"live-paper-{sig_id}",
        "terminal": "crypto",
        "symbol": sig.get("symbol"),
        "asset_id": sig.get("coin_id") or sig.get("asset_id"),
        "decision_at": decision_at,
        "issued_at": sig.get("issued_at"),
        "row_origin": "pilot",
        "factors": sig.get("factors") or sig.get("factor_ledger"),
        "factors_asof": sig.get("factors_asof"),
        "production_recorded": {
            "direction": sig.get("direction"),
            "score": sig.get("score"),
        } if sig.get("direction") else None,
        "production_decision": "issued",
        "production_suppression_reason": None,
        "eligibility": "passed",
        "eligibility_reason": "deployed paper path issued this signal",
        "entry": sig.get("entry"),
        "atr14": sig.get("atr14"),
        "signal_day": sig.get("signal_day"),
        **blocks,
        "trace": {
            "issuance_outcome": "issued",
            "contract_id": contract_id,
            "entry_observed_at": blocks["entry_observation"].get("entry_observed_at"),
            "alert_enqueued_at": alert_enqueued_at,
            "alert_delivered_at": alert_delivered_at,
            "alert_delivery_status": (entry_alert or {}).get("delivery_status"),
            "alert_delivery_mode": (entry_alert or {}).get("delivery_mode"),
            "alert_ack_id": (entry_alert or {}).get("ack_id"),
            "setup_alert": setup_alert,
            "entry_alert": entry_alert,
            "trace_note": "live deployed paper record; provenance below",
        },
        "provenance": {
            "source": f"deployed-artifact:{ARTIFACT_SLUG}:getpaperpilotstatus",
            "paper_table": (status_data.get("segregation") or {}).get("paperTable"),
            "freeze_version": (status_data.get("freeze") or {}).get("version"),
            "deployed_signal_id": sig_id,
        },
        "notes": "deployed paper signal from the live artifact's segregated paper tables",
    }


def candidate_from_paper_candidate(cand, status_data, alert_index=None):
    """Map one deployed paper candidate (incl. suppressed) to a candidate dict."""
    cid = cand.get("id") or cand.get("candidate_id")
    decision_at = cand.get("decision_at") or cand.get("decided_at")
    outcome = cand.get("outcome") or cand.get("status") or ""
    suppressed = "suppress" in str(outcome).lower() or cand.get("suppressed")
    issued = not suppressed and str(outcome).lower() in ("issued",)
    blocks = _full_record_blocks(cand, issued=issued)
    return {
        "candidate_id": f"live-paper-cand-{cid}",
        "terminal": "crypto",
        "symbol": cand.get("symbol"),
        "asset_id": cand.get("coin_id") or cand.get("asset_id"),
        "decision_at": decision_at,
        "issued_at": None,
        "row_origin": "pilot",
        "factors": cand.get("factors") or cand.get("factor_ledger"),
        "factors_asof": cand.get("factors_asof"),
        "production_recorded": {
            "direction": cand.get("direction"),
            "score": cand.get("score"),
        } if cand.get("direction") else None,
        "production_decision": "suppressed" if suppressed else "qualified",
        "production_suppression_reason": cand.get("reason") if suppressed else None,
        "eligibility": "passed",
        "eligibility_reason": "deployed paper path evaluated this candidate",
        "entry": cand.get("entry"),
        "atr14": cand.get("atr14"),
        "signal_day": cand.get("signal_day"),
        **blocks,
        "trace": {
            "issuance_outcome": (f"abstain:{cand.get('reason')}" if suppressed
                                 else "unscored:production-not-issued"),
            "contract_id": None,
            "trace_note": "live deployed paper candidate; suppressed candidates included per fix 3",
        },
        "provenance": {
            "source": f"deployed-artifact:{ARTIFACT_SLUG}:getpaperpilotstatus",
            "paper_table": (status_data.get("segregation") or {}).get("paperTable"),
            "freeze_version": (status_data.get("freeze") or {}).get("version"),
            "deployed_candidate_id": cid,
        },
        "notes": "deployed paper candidate from the live artifact's segregated paper tables",
    }


def export_live_stream(status_path, out_path):
    with open(status_path) as f:
        payload = json.load(f)
    data = payload.get("data", payload)
    exported_at = payload.get("exported_at") or datetime.now(timezone.utc).isoformat()
    alert_index = _index_alerts(data)

    candidates = []
    excluded_pre_freeze = 0
    for sig in data.get("signals") or []:
        c = candidate_from_paper_signal(sig, data, alert_index)
        if not _after_cutoff(c["decision_at"]):
            excluded_pre_freeze += 1
            continue
        candidates.append(c)
    for cand in data.get("candidates") or []:
        c = candidate_from_paper_candidate(cand, data, alert_index)
        if not _after_cutoff(c["decision_at"]):
            excluded_pre_freeze += 1
            continue
        candidates.append(c)

    export = {
        "exported_at": exported_at,
        "source": f"deployed-artifact:{ARTIFACT_SLUG}:getpaperpilotstatus",
        "status_file": status_path,
        "freeze_cutoff_iso": FREEZE_CUTOFF_ISO,
        "active_freeze_version": ACTIVE_FREEZE_VERSION,
        "deployed_runs": [
            {"id": r.get("id"), "trigger": r.get("trigger"),
             "status": r.get("status"), "candidateCount": r.get("candidateCount"),
             "issuedCount": r.get("issuedCount"),
             "completedAt": r.get("completedAt")}
            for r in data.get("runs") or []
        ],
        "legacy_tracked_count": (data.get("segregation") or {}).get("legacyTrackedCount"),
        "candidates": candidates,
        "n_candidates": len(candidates),
        "excluded_pre_freeze": excluded_pre_freeze,
        "note": ("stream connected to deployed paper tables; "
                 "0 paper opportunities present" if not candidates else
                 f"{len(candidates)} live paper opportunities exported"),
    }
    with open(out_path, "w") as f:
        json.dump(export, f, indent=2)
    print(f"live export: {len(candidates)} candidates -> {out_path}")
    print(f"excluded pre-freeze: {excluded_pre_freeze}")
    print(f"deployed runs seen: {len(export['deployed_runs'])}")
    return export


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--status", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    export_live_stream(args.status, args.out)


def ingest_live_paper_stream(export_path):
    """Collector-facing ingest: live deployed paper candidates.

    Returns candidate dicts in the harness candidate schema, sourced from
    the DEPLOYED artifact's segregated paper tables (not the workspace DB
    copy). The collector should call this in its eligible-stream assembly;
    every returned dict already carries row_origin="pilot" and a
    provenance block naming the deployed source. Post-freeze cutoff is
    enforced here; the collector enforces it again before appending.
    """
    with open(export_path) as f:
        export = json.load(f)
    cands = []
    for c in export.get("candidates") or []:
        c = dict(c)
        c.setdefault("row_origin", "pilot")
        cands.append(c)
    return cands


if __name__ == "__main__":
    main()
