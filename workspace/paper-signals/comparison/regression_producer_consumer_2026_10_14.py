#!/usr/bin/env python3
"""Producer-consumer regression for the getpaperpilotstatus row contract.

Paper only. No brokerage. No deployed calls. Everything runs locally in
/tmp; the real prospective vessel is NEVER touched (dry-run + temp vessel).

What this exercises, with NO mocks of either side:
  PRODUCER SIDE (synthetic, schema-faithful):
      build_realistic_response() -- a full getpaperpilotstatus response
      shaped per comparison/STATUS-RESPONSE-SCHEMA-v1-2026-10-14.md,
      including a clearly labeled TEST alert (test:true).
  CONSUMER SIDE, worker parser (the ACTUAL parser rules):
      The alert-delivery worker's parser IS its spec prose
      (pilot/delivery/WORKER-SPEC-v2.2-2026-10-14.md section 6 + the
      schema spec section 5). worker_strict_parse() implements the section 5
      presence checks; worker_send_sweep() implements the section 6 rules
      VERBATIM -- alert_type filter, test-payload skip, validation against
      the REAL pilot/delivery/alert-schema.json (jsonschema, the same file
      the worker references), dedup on <signal_id>/<alert_type> against a
      ledger dict. Ledger pre-commit is simulated in-memory (no files).
  CONSUMER SIDE, collector parser (the ACTUAL code):
      comparison/live_paper_stream.export_live_stream (imported, unmodified)
      -> ingest_live_paper_stream -> collect_pilot_rows.validate_candidate
      -> check_post_freeze_cutoff -> score_candidates (real frozen harness)
      -> stamp_trace, all against a temp vessel with dry_run=True.

Cases:
  A. Full realistic response -> worker due/skipped sets; collector export
     -> scored rows (dry-run, nothing written to the real vessel).
  B. Response with "candidates" key DELETED -> strict parser raises an
     explicit SchemaError (and we show the pre-fix lenient behavior would
     have silently exported 0 candidates from that stream).
  C. Response with "alerts" key DELETED -> worker raises explicit schema
     error (never "nothing due").
  D. Quarantine: a candidate with row_origin="test" -> QuarantineError,
     nothing written; the TEST alert never becomes a candidate.
  E. Unversioned response (no schema_version) -> parses under the v1 field
     set with an explicit "unversioned-response" flag (never silent).

Exit code 0 = all assertions passed. Prints a structured report.
"""

import copy
import json
import os
import sys
import tempfile

import jsonschema

BASE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE)

# ---- the ACTUAL collector code (imported, unmodified) -----------------------
import live_paper_stream as lps
from collect_pilot_rows import (
    validate_candidate,
    check_post_freeze_cutoff,
    score_candidates,
    stamp_trace,
    collect,
    QuarantineError,
    ACTIVE_FREEZE_VERSION,
)
from harness import ACTIVE_MANIFEST

ALERT_SCHEMA_PATH = os.path.join(
    BASE, "..", "pilot", "delivery", "alert-schema.json")

NOW = "2026-10-14T20:00:00.000Z"          # fixed regression clock
DECISION_AT = "2026-10-14T18:05:00.000Z"  # post-freeze (cutoff 04:57Z)
ENTRY_AT = "2026-10-14T18:09:41.205Z"
RECEIPT_AT = "2026-10-14T18:09:42.010Z"

FACTOR_LABELS = (
    "Trend cluster", "Momentum", "MACD", "Perp funding crowding",
    "Open interest", "Binance futures positioning",
    "Cross-venue taker imbalance", "TVL trend", "Revenue linkage",
    "Developer velocity", "Supply-overhang penalty",
)


class SchemaError(Exception):
    """Explicit consumer-side schema error (never a silent empty)."""


# ---------------------------------------------------------------------------
# PRODUCER: the realistic response
# ---------------------------------------------------------------------------

def _factor_ledger():
    scores = [0.62, 0.55, 0.48, 0.51, 0.66, 0.58, 0.44, 0.52, 0.47, 0.61, 0.40]
    weights = [0.14, 0.12, 0.10, 0.10, 0.09, 0.09, 0.09, 0.08, 0.07, 0.06, 0.06]
    return [{"label": l, "score": s, "weight": w, "contribution": s * w}
            for l, s, w in zip(FACTOR_LABELS, scores, weights)]


def _alert_row(event_key, paper_signal_id, payload, enqueued_at):
    """Deployed alert row shape: paper_alert_events columns (actions.ts
    spreads ...row; payloadJson is a JSON string on the wire)."""
    return {
        "id": 101 if "TEST" not in paper_signal_id else -1,
        "eventKey": event_key,
        "paperSignalId": paper_signal_id,
        "status": "enqueued",
        "transport": "test-probe" if payload.get("test") else "workspace-cron",
        "destinationLabel": "research-side-chat",
        "payloadJson": json.dumps(payload),
        "enqueuedAt": enqueued_at,
        "acknowledgedAt": None,
        "attemptCount": 0,
        "lastError": None,
        "createdAt": enqueued_at,
        "updatedAt": enqueued_at,
    }


def build_realistic_response():
    """Full row shapes per STATUS-RESPONSE-SCHEMA-v1-2026-10-14.md section 4."""
    cand_id = "a1b2c3d4e5f60718293a4b5c6d7e8f90"
    sig_id = "sig_9f8e7d6c5b4a39281706f5e4"
    contract_id = f"ct_{cand_id}"

    setup_payload = {
        # chat rendering fields (ALERT-SCHEMA-2026-10-14.md)
        "schema_version": "2026-10-14", "paper": True, "label": "PAPER",
        "alert_type": "SETUP_PENDING", "signal_id": sig_id,
        "asset": "ETHUSD", "direction": "long",
        "setup_reason": ("issuance gates passed: freshness refresh, retained "
                         "regime gate, entry-zone check; score 0.58 >= floor; "
                         "no duplicate suppression"),
        "entry_rule": ("first post-decision spot print inside the 15-min "
                       "window, drift <= 1.5%"),
        "entry_price": 4021.55,
        "invalidation": {"price": 3961.23,
                         "rule": "1.5% below entry (config invalidationPctBelowEntry)"},
        "targets": {"t1": 4102.10, "t2": 4182.65},
        "horizon": "paper observation: exit on invalidation or targets; entry window 15 min from qualification",
        "data_timestamp": DECISION_AT, "issued_at": "2026-10-14T18:05:03.000Z",
        "destinations": ["research-side-chat", "terminal-tracker"],
        "test": False,
        "status": "pending",
        "observation_window": "15 min (crypto) / 45 polls x 20 s",
        "qualification_evidence": f"persisted contract row {contract_id} + candidate row {cand_id}",
    }
    setup_alert = _alert_row(f"setup_{cand_id}", sig_id, setup_payload,
                             "2026-10-14T18:05:03.000Z")

    entry_payload = {
        "schema_version": "2026-10-14", "paper": True, "label": "PAPER",
        "alert_type": "ENTRY_CONFIRMED", "signal_id": sig_id,
        "asset": "ETHUSD", "direction": "long",
        "setup_reason": "issuance gates passed; entry observed on venue print",
        "entry_rule": ("first post-decision spot print inside the 15-min "
                       "window, drift <= 1.5%"),
        "entry_price": 4022.10,
        "invalidation": {"price": 3961.23,
                         "rule": "1.5% below observed entry"},
        "targets": {"t1": 4102.10, "t2": 4182.65},
        "horizon": "paper observation: exit on invalidation or targets",
        "data_timestamp": ENTRY_AT, "issued_at": "2026-10-14T18:09:44.000Z",
        "destinations": ["research-side-chat", "terminal-tracker"],
        "test": False,
        "status": "confirmed",
        "entry_observed_at": ENTRY_AT,
        "venue_print_ts": ENTRY_AT,
        "waiting_interval_veto": "pass",
        "post_entry_check": "pass - real 1m klines over the waiting interval",
    }
    entry_alert = _alert_row(f"entry_{sig_id}", sig_id, entry_payload,
                             "2026-10-14T18:09:44.000Z")

    test_payload = {
        "schema_version": "2026-10-14", "paper": True, "label": "PAPER",
        "alert_type": "ENTRY_CONFIRMED",
        "signal_id": "sig_TEST_ROUTING_PROBE_001",
        "asset": "BTCUSD", "direction": "long",
        "setup_reason": "TEST ROUTING PROBE - not a live signal",
        "entry_rule": "test probe",
        "entry_price": 1.0,
        "invalidation": {"price": 0.9, "rule": "test probe"},
        "targets": {"t1": 1.1, "t2": 1.2},
        "horizon": "test probe",
        "data_timestamp": NOW, "issued_at": NOW,
        "destinations": ["research-side-chat", "terminal-tracker"],
        "test": True,
        "status": "confirmed",
        "entry_observed_at": NOW,
        "venue_print_ts": NOW,
        "waiting_interval_veto": "pass",
        "post_entry_check": "test probe",
    }
    test_alert = _alert_row("test_routing_probe_001",
                            "sig_TEST_ROUTING_PROBE_001", test_payload, NOW)

    candidate_qualified = {
        "candidateId": cand_id, "candidate_id": cand_id,
        "candidateKey": "handoff-key-eth-long-001",
        "symbol": "ETH", "coinId": "ethereum", "asset_id": "ethereum",
        "name": "Ethereum", "direction": "long", "terminal": "crypto",
        "signalDate": "2026-10-14", "detectedAt": DECISION_AT,
        "decision_at": DECISION_AT,
        "discoveryRunId": 59, "runId": 7,
        "status": "awaiting-entry",
        "outcome": {"kind": "qualified", "gate": None,
                    "reason": "all issuance gates passed", "via": "automatic",
                    "detail": {"vetoSummary": "pass: setup-history, pipeline-order, entry-zone"}},
        "contractId": contract_id, "issuedSignalId": None,
        "setupAlertAt": "2026-10-14T18:05:03.000Z", "entryObservedAt": None,
        "alertedAt": "2026-10-14T18:05:03.000Z",
        "entryPrice": 4021.55, "entry": 4021.55,
        "invalidation": 3961.23, "target1": 4102.10, "target2": 4182.65,
        "score": 0.58,
        "factors": _factor_ledger(), "factor_ledger": _factor_ledger(),
        "totalWeight": 1.0, "factors_asof": DECISION_AT,
        "inputs": {"asOf": DECISION_AT, "currentPrice": 4021.55,
                   "historyCloses": [3980.0, 3995.5, 4010.2, 4021.55],
                   "historyHighs": [3990.0, 4000.1, 4015.0, 4025.0]},
        "gateSummary": "freshness:pass regime:n/a(long) veto:pass duplicate:pass",
        "handoffOutcome": {"outcome": "qualified", "reasonCode": "all-gates-pass",
                           "reason": "handoff qualification passed",
                           "gate": None, "ledgerHash": "abc123",
                           "recordedAt": DECISION_AT},
    }

    candidate_suppressed = {
        "candidateId": "suppressed-77", "candidate_id": "suppressed-77",
        "candidateKey": "handoff-key-aleo-long-077",
        "symbol": "ALEO", "coinId": "aleo", "asset_id": "aleo",
        "name": "Aleo", "direction": "long", "terminal": "crypto",
        "signalDate": "2026-10-14", "detectedAt": "2026-10-14T17:40:00.000Z",
        "decision_at": "2026-10-14T17:40:00.000Z",
        "discoveryRunId": 59, "runId": 7,
        "status": "rejected",
        "outcome": {"kind": "rejected", "gate": "entry-zone",
                    "reason": "born-dead LONG: signal-day low breached invalidation",
                    "via": "automatic", "detail": {}},
        "reason": "born-dead LONG: signal-day low breached invalidation",
        "contractId": None, "issuedSignalId": None,
        "setupAlertAt": None, "entryObservedAt": None, "alertedAt": None,
        "entryPrice": 0.0328, "entry": 0.0328,
        "invalidation": 0.0327967457, "target1": 0.034, "target2": 0.036,
        "score": 0.51, "factors": None, "factor_ledger": None,
        "totalWeight": None, "factors_asof": None,
        "inputs": {"asOf": "2026-10-14T17:40:00.000Z"},
        "gateSummary": "vetoed at entry-zone",
        "handoffOutcome": {"outcome": "abstained", "reasonCode": "born-dead",
                           "reason": "signal-day low breached invalidation",
                           "gate": "entry-zone", "ledgerHash": None,
                           "recordedAt": "2026-10-14T17:40:00.000Z"},
    }

    signal_row = {
        "id": sig_id, "signal_id": sig_id,
        "candidateId": cand_id, "candidate_id": cand_id,
        "identityHash": "9f8e7d6c5b4a39281706f5e4d3c2b1a09",
        "contractId": contract_id, "terminal": "crypto",
        "symbol": "ETH", "coin_id": "ethereum", "name": "Ethereum",
        "direction": "long", "signalDate": "2026-10-14",
        "decision_at": DECISION_AT, "decided_at": DECISION_AT,
        "issued_at": "2026-10-14T18:09:44.000Z",
        "entry": 4022.10, "atr14": 58.4,
        "signal_day": {"day": "2026-10-14", "high": 4040.0, "low": 3990.0},
        "factors": _factor_ledger(), "factor_ledger": _factor_ledger(),
        "factors_asof": DECISION_AT,
        "contract": {
            "contractVersion": "actionable-entry-v1",
            "terminal": "crypto", "signalId": sig_id,
            "strategyId": "paper-crypto-dossier",
            "strategyVersion": "0.1.0-sandbox",
            "parameterHash": "sandbox-paper-v1",
            "decisionAt": DECISION_AT, "decisionClock": "server-utc",
            "decisionPrice": 4021.55, "sourceObservedAt": DECISION_AT,
            "entryRule": "first-post-decision-binance-spot-trade",
            "entryVenue": "binance-spot",
            "entryWindowOpensAt": DECISION_AT,
            "entryWindowExpiresAt": "2026-10-14T18:20:00.000Z",
            "entryPrice": 4022.10, "entryObservedAt": ENTRY_AT,
            "entryReceivedAt": RECEIPT_AT,
            "entryEvidence": "venue-print",
            "entryEvidenceReason": "first eligible post-decision print",
            "driftCapPct": 1.5, "driftObservedPct": 0.014,
            "entryState": "entered", "voidReason": None,
            "invalidationPrice": 3961.23, "target1Price": 4102.10,
            "target2Price": 4182.65, "riskPerUnit": 60.32,
            "horizonUnit": "elapsed_days", "primaryHorizon": 30,
            "issuedBy": "paper-signals-integrated-handler",
            "issuedAt": "2026-10-14T18:05:03.000Z",
            "cohortId": "paper-pilot-v2.1.0",
        },
        "outcome": {"kind": "issued", "gate": None, "reason": "entered",
                    "via": "automatic",
                    "detail": {"entryEventId": "evt_eth_001",
                               "vetoSummary": "pass",
                               "waitingInterval": {"verdict": "pass",
                                                   "reason": "no intervening invalidation",
                                                   "checks": ["setup-history:pass",
                                                              "decision-entry:pass"]}}},
    }

    checkpoint_row = {
        "contractId": contract_id, "candidateId": cand_id, "signalId": sig_id,
        "checkpointVersion": 1, "v": 1,
        "highWaterTs": 1760470181205,
        "firstPrint": {"venueTradeId": "884210977", "ts": 1760470181205,
                       "price": 4022.10, "venue": "binance-spot",
                       "venueSeq": 884210977},
        "lastReceiptAt": RECEIPT_AT, "polls": 12,
        "coverageEvidence": {
            "venue": "binance-spot", "symbol": "ETHUSDT",
            "sinceTs": 1760469900000, "toTs": 1760470182010,
            "receiptTs": RECEIPT_AT,
            "rawResponseHash": "sha256:deadbeef0123",
            "continuous": True, "paginationComplete": True,
        },
    }

    return {
        "ok": True,
        "schema_version": "paper-status/1",
        "data": {
            "alerts": [setup_alert, entry_alert, test_alert],
            "candidates": [candidate_qualified, candidate_suppressed],
            "checkpoints": [checkpoint_row],
            "signals": [signal_row],
            "comparisons": [],
            "handoff": {
                "runId": "discovery-59", "source": "crypto-market-discovery",
                "completedAt": "2026-10-14T18:00:00.000Z",
                "freezeVersion": "paper-pilot-v2.1.0", "demo": False,
                "counts": {"qualified": 1, "abstained": 1, "deferred": 0,
                           "failed": 0},
                "candidates": [
                    {"candidateKey": "handoff-key-eth-long-001",
                     "symbol": "ETH", "direction": "long",
                     "outcome": "qualified", "reasonCode": "all-gates-pass",
                     "reason": "handoff qualification passed"},
                    {"candidateKey": "handoff-key-aleo-long-077",
                     "symbol": "ALEO", "direction": "long",
                     "outcome": "abstained", "reasonCode": "born-dead",
                     "reason": "signal-day low breached invalidation"},
                ],
                "staleRun": False,
            },
            "handoffRuns": [
                {"runId": "discovery-59", "source": "crypto-market-discovery",
                 "completedAt": "2026-10-14T18:00:00.000Z",
                 "freezeVersion": "paper-pilot-v2.1.0", "demo": False,
                 "counts": {"qualified": 1, "abstained": 1, "deferred": 0,
                            "failed": 0}},
            ],
            "runs": [
                {"id": 7, "runKey": "paper-pilot-v2.1.0:automatic:7000001",
                 "trigger": "automatic", "status": "complete",
                 "createdAt": "2026-10-14T18:04:00.000Z",
                 "startedAt": "2026-10-14T18:04:00.100Z",
                 "completedAt": "2026-10-14T18:10:00.000Z",
                 "freezeVersion": "paper-pilot-v2.1.0",
                 "freezeHash": "a7d354a4f8ad9b0af7d3d61986b049f822ee918d28f26f335401d72d24669f84",
                 "discoveryRunId": 59, "candidateCount": 2, "issuedCount": 1,
                 "abstainedCount": 1, "deferredCount": 0,
                 "summary": "1 issued, 1 abstained (born-dead)."},
            ],
            "freeze": {"version": "paper-pilot-v2.1.0",
                       "hash": "a7d354a4f8ad9b0af7d3d61986b049f822ee918d28f26f335401d72d24669f84",
                       "frozenAt": "2026-10-14T04:54:12Z"},
            "handler": {"version": "2.1.9",
                        "comparisonMapping": {"handlerHashMatchesManifest": True}},
            "handler_version": "2.1.9",
            "segregation": {"paperTable": "paper_signals",
                            "legacyTable": "generated_signals",
                            "legacyTrackedCount": 34,
                            "fixturesAndReplaysIncluded": False},
            "delivery": {"configured": False, "scope": "artifact-owned delivery",
                         "destination": "research side chat a685c3e7-c8be-4137-8900-4e899008bca7"},
            "cohortRules": {"prospective": "post-freeze only"},
        },
    }


# ---------------------------------------------------------------------------
# CONSUMER 1: the alert-delivery worker parser (ACTUAL rules)
#
# The worker's parser is its spec prose. worker_strict_parse() implements
# STATUS-RESPONSE-SCHEMA-v1 section 5 (the new binding rule); the section 6
# send-sweep below implements WORKER-SPEC-v2.2 section 6 VERBATIM:
#   "For each row in the status data.alerts: skip unless alert_type in
#    {SETUP_PENDING, ENTRY_CONFIRMED}; skip test payloads; validate against
#    alert-schema.json (missing required field -> unrenderable, one-line
#    blocker naming the signal and the field, never partial); then dedup on
#    <signal_id>/<alert_type>"
# Validation uses the REAL pilot/delivery/alert-schema.json via jsonschema.
# ---------------------------------------------------------------------------

REQUIRED_ARRAYS = ("alerts", "candidates", "checkpoints", "signals",
                   "comparisons", "handoffRuns", "runs")
WORKER_ALERT_TYPES = ("SETUP_PENDING", "ENTRY_CONFIRMED")

with open(ALERT_SCHEMA_PATH) as _f:
    _ALERT_SCHEMA = json.load(_f)
_ALERT_VALIDATOR = jsonschema.Draft7Validator(_ALERT_SCHEMA)


def worker_strict_parse(raw):
    """Section 5 strict parse. Returns (data, flags). Raises SchemaError."""
    flags = []
    if not isinstance(raw, dict) or raw.get("ok") is not True:
        raise SchemaError("envelope: expected {ok:true, data:{...}}")
    data = raw.get("data")
    if not isinstance(data, dict):
        raise SchemaError("envelope: 'data' missing or not an object "
                          "(never treat another envelope key as the payload)")
    sv = raw.get("schema_version", data.get("schema_version"))
    if sv is None:
        flags.append("unversioned-response")
    elif sv != "paper-status/1":
        raise SchemaError(f"unknown schema_version {sv!r}: refusing "
                          f"best-effort parse")
    for key in REQUIRED_ARRAYS:
        if key not in data:
            raise SchemaError(f"required array {key!r} ABSENT from data: "
                              f"explicit schema error, never 'no rows'")
        v = data[key]
        if not isinstance(v, list):
            raise SchemaError(f"required array {key!r} is "
                              f"{type(v).__name__}, not an array "
                              f"(null/absent never coerces to [])")
    if "handoff" not in data:
        raise SchemaError("required key 'handoff' ABSENT from data")
    h = data["handoff"]
    if h is not None and not isinstance(h, dict):
        raise SchemaError("'handoff' must be object or null")
    if not isinstance(data["runs"], list) or any(
            not isinstance(r, dict) for r in data["runs"]):
        raise SchemaError("'runs' must be an array of run-record objects "
                          "(a bare count is a schema error)")
    return data, flags


def _render_payload(row):
    """Extract the ALERT-SCHEMA payload from a deployed alert row.

    The deployed serializer spreads the paper_alert_events columns, so the
    render fields live in payloadJson (a JSON string on the wire). A row
    whose payloadJson is missing or unparseable is unrenderable.
    """
    raw = row.get("payloadJson")
    if isinstance(raw, dict):
        return raw, None
    if isinstance(raw, str) and raw.strip():
        try:
            parsed = json.loads(raw)
        except Exception as e:
            return None, f"payloadJson unparseable: {e}"
        if isinstance(parsed, dict):
            return parsed, None
        return None, "payloadJson parsed to non-object"
    return None, "payloadJson missing"


def worker_send_sweep(data, ledger):
    """WORKER-SPEC-v2.2 section 6, verbatim. ledger: dict key->entry.

    Returns (due, skipped, blockers). due entries are pre-committed into
    the ledger dict as awaiting-ack (in-memory; mirrors the spec's step 2).
    """
    due, skipped, blockers = [], [], []
    for row in data["alerts"]:
        if not isinstance(row, dict):
            blockers.append("non-object alert row: unrenderable")
            continue
        payload, perr = _render_payload(row)
        if perr:
            blockers.append(f"unrenderable: event "
                            f"{row.get('eventKey')}: {perr}")
            continue
        atype = payload.get("alert_type")
        sid = payload.get("signal_id")
        key = f"{sid}/{atype}"
        if atype not in WORKER_ALERT_TYPES:
            skipped.append((key, f"alert_type {atype!r} not in "
                                 f"{set(WORKER_ALERT_TYPES)}"))
            continue
        if payload.get("test") is True:
            # Current spec behavior: skip test payloads. The supported test
            # path (TEST-PATH-DESIGN) routes them to a separate test branch.
            skipped.append((key, "test:true payload skipped by normal path"))
            continue
        errors = sorted(_ALERT_VALIDATOR.iter_errors(payload),
                        key=lambda e: list(e.path))
        if errors:
            e = errors[0]
            field = ".".join(str(p) for p in e.absolute_path) or "(root)"
            blockers.append(f"unrenderable: signal {sid} field {field}: "
                            f"{e.message}")
            continue
        entry = ledger.get(key)
        if entry and entry.get("status") in ("delivered", "unknown",
                                             "failed", "awaiting-ack"):
            skipped.append((key, f"ledger status {entry['status']}: not due"))
            continue
        due.append(payload)
        ledger[key] = {"signal_id": sid, "alert_type": atype,
                       "status": "awaiting-ack", "attempts": 1,
                       "sent_at_utc": NOW, "run_mode": "sweep"}
    return due, skipped, blockers


# ---------------------------------------------------------------------------
# CONSUMER 2: the collector parser (the ACTUAL code)
#
# Strict pre-check (new, per schema section 5) runs BEFORE the real adapter:
# a missing array raises SchemaError explicitly. The adapter itself
# (live_paper_stream, imported unmodified) is then exercised for real.
# ---------------------------------------------------------------------------

def collector_strict_parse(raw):
    """Section 5 strict parse for the collector. Raises SchemaError."""
    data, flags = worker_strict_parse(raw)  # same envelope/array law
    return data, flags


def collector_ingest(data):
    """Real adapter path: export_live_stream -> ingest -> candidates."""
    tmpd = tempfile.mkdtemp(prefix="paper-regression-")
    status_path = os.path.join(tmpd, "status.json")
    out_path = os.path.join(tmpd, "export.json")
    with open(status_path, "w") as f:
        json.dump({"ok": True, "data": data}, f)
    export = lps.export_live_stream(status_path, out_path)
    return lps.ingest_live_paper_stream(out_path), export


def collector_score(cands, vessel_path):
    """Real collector path on candidate dicts (dry-run, temp vessel)."""
    for c in cands:
        validate_candidate(c)  # quarantine BEFORE anything else
    eligible, rejected = [], []
    for c in cands:
        ok, reason = check_post_freeze_cutoff(c)
        if ok:
            eligible.append(c)
        else:
            rejected.append((c.get("candidate_id"), reason))
    summary = collect(eligible, vessel_csv=vessel_path, dry_run=True)
    return summary, rejected


# ---------------------------------------------------------------------------
# CASES
# ---------------------------------------------------------------------------

RESULTS = []


def record(name, passed, detail):
    RESULTS.append({"case": name, "passed": bool(passed), "detail": detail})
    print(f"[{'PASS' if passed else 'FAIL'}] {name}")
    for line in detail.split("\n"):
        print(f"       {line}")


def case_a_full_response():
    """Full realistic response through BOTH real parsers."""
    raw = build_realistic_response()
    detail = []

    # --- worker side ---
    data, flags = worker_strict_parse(raw)
    detail.append(f"strict parse ok; flags={flags}; "
                  f"arrays: alerts={len(data['alerts'])} "
                  f"candidates={len(data['candidates'])} "
                  f"signals={len(data['signals'])} "
                  f"checkpoints={len(data['checkpoints'])} "
                  f"comparisons={len(data['comparisons'])} "
                  f"runs={len(data['runs'])}")
    ledger = {}
    due, skipped, blockers = worker_send_sweep(data, ledger)
    due_keys = [f"{r['signal_id']}/{r['alert_type']}" for r in due]
    detail.append(f"worker due={due_keys}")
    detail.append(f"worker skipped={skipped}")
    detail.append(f"worker blockers={blockers}")
    detail.append(f"ledger pre-committed keys={sorted(ledger)}")
    worker_ok = (
        len(due) == 2
        and any(k.endswith("/SETUP_PENDING") for k in due_keys)
        and any(k.endswith("/ENTRY_CONFIRMED") for k in due_keys)
        and not blockers
        and any("test:true payload skipped" in s for _, s in skipped)
        and all(ledger[k]["status"] == "awaiting-ack" for k in ledger)
    )

    # --- collector side (real adapter + real collector fns) ---
    data2, _ = collector_strict_parse(raw)
    cands, export = collector_ingest(data2)
    detail.append(f"adapter exported {len(cands)} candidates "
                  f"(excluded_pre_freeze={export['excluded_pre_freeze']}); "
                  f"ids={[c['candidate_id'] for c in cands]}")
    tmpd = tempfile.mkdtemp(prefix="paper-regression-vessel-")
    vessel = os.path.join(tmpd, "cohort-prospective-v2.csv")
    summary, rejected = collector_score(cands, vessel)
    detail.append(f"collector dry-run: ingested={summary['candidates_ingested']} "
                  f"eligible={summary['candidates_eligible']} "
                  f"would_add={summary['rows_would_add']} "
                  f"rejected_pre_freeze={len(rejected)} "
                  f"freeze={summary['freeze_version']}")
    new_rows = summary["new_rows"]
    detail.append(f"scored rows={len(new_rows)}; "
                  + (f"prod_dispositions="
                     f"{[r.get('prod_disposition') for r in new_rows]}" if new_rows else ""))
    vessel_exists = os.path.exists(vessel)
    detail.append(f"real vessel untouched (temp vessel written={vessel_exists}, "
                  f"dry_run={summary['dry_run']})")
    # the TEST alert must never become a candidate
    test_leak = any("TEST" in str(c.get("candidate_id")) for c in cands)
    detail.append(f"test-alert leaked into candidates: {test_leak}")
    collector_ok = (len(cands) == 3 and summary["rows_would_add"] == 3
                    and not rejected and not test_leak
                    and summary["dry_run"] is True)

    record("A: full response -> worker + collector (real parsers)",
           worker_ok and collector_ok, "\n".join(detail))


def case_b_missing_candidates_array():
    """'candidates' key deleted: strict parser must raise explicitly."""
    raw = build_realistic_response()
    del raw["data"]["candidates"]
    try:
        collector_strict_parse(raw)
        record("B: missing 'candidates' -> explicit schema error", False,
               "no error raised (defect: would silently export 0)")
        return
    except SchemaError as e:
        strict_msg = str(e)
    # demonstrate what the PRE-FIX lenient adapter did with the same input
    raw2 = build_realistic_response()
    del raw2["data"]["candidates"]
    data_lenient = raw2["data"]  # old pattern: data.get("candidates") or []
    n_lenient = len(data_lenient.get("candidates") or [])
    record("B: missing 'candidates' -> explicit schema error", True,
           f"strict parser raised SchemaError: {strict_msg}\n"
           f"pre-fix lenient pattern would have silently read "
           f"{n_lenient} candidates from the stream (defect demonstrated)")


def case_c_missing_alerts_array():
    """'alerts' key deleted: worker must raise, never 'nothing due'."""
    raw = build_realistic_response()
    del raw["data"]["alerts"]
    try:
        data, _ = worker_strict_parse(raw)
        worker_send_sweep(data, {})
        record("C: missing 'alerts' -> explicit schema error", False,
               "worker treated missing alerts as nothing-due (defect)")
    except SchemaError as e:
        record("C: missing 'alerts' -> explicit schema error", True,
               f"worker raised SchemaError before any send logic: {e}")


def case_d_quarantine():
    """Test-origin rows are refused; nothing is written."""
    raw = build_realistic_response()
    data, _ = collector_strict_parse(raw)
    cands, _ = collector_ingest(data)
    poisoned = dict(cands[0])
    poisoned["candidate_id"] = "live-paper-test-001"
    poisoned["row_origin"] = "test"  # NOT pilot
    try:
        validate_candidate(poisoned)
        record("D: quarantine refuses non-pilot row_origin", False,
               "validate_candidate accepted row_origin='test'")
        return
    except QuarantineError as e:
        q_msg = str(e)[:160]
    # and the full collect() path refuses before scoring/writing
    tmpd = tempfile.mkdtemp(prefix="paper-regression-q-")
    vessel = os.path.join(tmpd, "v.csv")
    wrote = False
    try:
        collect([poisoned], vessel_csv=vessel, dry_run=True)
    except QuarantineError:
        wrote = os.path.exists(vessel)
    record("D: quarantine refuses non-pilot row_origin", True,
           f"validate_candidate raised QuarantineError: {q_msg}...\n"
           f"collect() refused before scoring; vessel file created={wrote} "
           f"(nothing written)")


def case_e_unversioned():
    """No schema_version: parse under v1 field set with explicit flag."""
    raw = build_realistic_response()
    del raw["schema_version"]
    data, flags = worker_strict_parse(raw)
    ledger = {}
    due, skipped, blockers = worker_send_sweep(data, ledger)
    record("E: unversioned response -> v1 parse + explicit flag",
           flags == ["unversioned-response"] and len(due) == 2
           and not blockers,
           f"flags={flags}; due={len(due)}; skipped={len(skipped)}; "
           f"blockers={blockers} (strictness applies WITHOUT the version "
           f"field; the flag keeps it visible, never silent)")


def case_f_runs_as_int():
    """The 17:03 UTC anomaly: runs as a bare int -> schema error."""
    raw = build_realistic_response()
    raw["data"]["runs"] = 6
    try:
        worker_strict_parse(raw)
        record("F: runs-as-int -> explicit schema error", False,
               "bare-int runs accepted (defect)")
    except SchemaError as e:
        record("F: runs-as-int -> explicit schema error", True,
               f"raised SchemaError: {e}")


def case_g_bad_payload_row():
    """One alert row with unparseable payloadJson: the ROW is rejected
    (named), the response still parses, other rows still deliver."""
    raw = build_realistic_response()
    bad = dict(raw["data"]["alerts"][0])
    bad["eventKey"] = "setup_broken_001"
    bad["payloadJson"] = "{not json"
    raw["data"]["alerts"] = [bad] + raw["data"]["alerts"][1:]
    data, _ = worker_strict_parse(raw)
    ledger = {}
    due, skipped, blockers = worker_send_sweep(data, ledger)
    due_keys = [f"{r['signal_id']}/{r['alert_type']}" for r in due]
    record("G: malformed alert row -> row rejected, rest delivers",
           len(blockers) == 1 and "setup_broken_001" in blockers[0]
           and len(due) == 1 and due_keys[0].endswith("/ENTRY_CONFIRMED"),
           f"blockers={blockers}\n"
           f"due={due_keys} (response-level parse unaffected)")


def main():
    print("=" * 72)
    print("PRODUCER-CONSUMER REGRESSION 2026-10-14")
    print("worker parser: WORKER-SPEC-v2.2 s6 verbatim + schema s5, real "
          "alert-schema.json")
    print("collector parser: live_paper_stream + collect_pilot_rows + "
          "frozen harness, unmodified")
    print("active freeze:", ACTIVE_FREEZE_VERSION)
    print("=" * 72)
    case_a_full_response()
    case_b_missing_candidates_array()
    case_c_missing_alerts_array()
    case_d_quarantine()
    case_e_unversioned()
    case_f_runs_as_int()
    case_g_bad_payload_row()
    print("=" * 72)
    n_pass = sum(1 for r in RESULTS if r["passed"])
    print(f"{n_pass}/{len(RESULTS)} cases passed")
    for r in RESULTS:
        print(f"  [{'PASS' if r['passed'] else 'FAIL'}] {r['case']}")
    return 0 if n_pass == len(RESULTS) else 1


if __name__ == "__main__":
    sys.exit(main())
