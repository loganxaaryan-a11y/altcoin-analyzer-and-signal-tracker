#!/usr/bin/env python3
"""Regression: live deployed-paper adapter preserves the FULL issuance record.

Synthetic fixtures only -- no live data, no production access, nothing is
written to the real prospective vessel (all file IO goes to tmp dirs).

Chain under test:
    live_paper_stream.export_live_stream(status_json, export_json)
      -> live_paper_stream.ingest_live_paper_stream(export_json)
      -> collect_pilot_rows.score_candidates(...)   (collector row-building path)

Asserted field-by-field: every handler-produced field audited from
orchestrator/src/issuance/handler.ts, entry-v1/src/contract.ts,
entry-v1/src/pending.ts and veto/src/waiting-interval.ts survives intact
into the prospective row dict (inside the row's `notes` as the
`full_record=` JSON payload, which the collector folds without changing
the frozen 69-column vessel schema).

Run: python3 run_tests.py (or pytest).
"""

import json
import os
import sys
import tempfile
import unittest

COMPARISON_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, COMPARISON_DIR)

import live_paper_stream as lps  # noqa: E402
import collect_pilot_rows as col  # noqa: E402
from collect_pilot_rows import (  # noqa: E402
    VESSEL_CSV, score_candidates,
)

SYNTHETIC = "synthetic-fixture (adapter completeness regression -- not a real issuance)"


def f(label, score, weight, as_of=None):
    d = {"label": label, "score": score, "weight": weight,
         "contribution": score * weight}
    if as_of:
        d["asOf"] = as_of
    return d


LEDGER_LONG = [
    f("Trend cluster", 1, 2.5, "2026-10-14T11:00:00Z"),
    f("Momentum", 1, 1.5, "2026-10-14T11:00:00Z"),
    f("MACD", 1, 1.5, "2026-10-14T11:00:00Z"),
    f("Perp funding crowding", 0, 1.75, "2026-10-14T11:00:00Z"),
    f("Open interest", 0, 1.0, "2026-10-14T11:00:00Z"),
    f("Binance futures positioning", 0, 1.0, "2026-10-14T11:00:00Z"),
    f("Cross-venue taker imbalance", 0, 1.25, "2026-10-14T11:00:00Z"),
    f("TVL trend", 0, 2.0, "2026-10-14T11:00:00Z"),
    f("Revenue linkage", 0, 1.5, "2026-10-14T11:00:00Z"),
    f("Developer velocity", 0, 1.5, "2026-10-14T11:00:00Z"),
    f("Supply-overhang penalty", 0, 1.5, "2026-10-14T11:00:00Z"),
]

# The full frozen ActionableEntryContract the repaired handler produces
# (entry-v1/src/contract.ts) — persisted as the contract row's JSON.
CONTRACT_JSON = {
    "contractVersion": "actionable-entry-v1",
    "terminal": "crypto",
    "signalId": "sig_synthetic1",
    "strategyId": "paper-crypto-dossier",
    "strategyVersion": "0.1.0-sandbox",
    "parameterHash": "sandbox-paper-v1",
    "decisionAt": "2026-10-14T12:00:00.000Z",
    "decisionClock": "server-utc",
    "decisionPrice": 67200.0,
    "sourceObservedAt": "2026-10-14T11:58:00.000Z",
    "sourceObservationWindow": None,
    "entryRule": "first-post-decision-binance-spot-trade",
    "entryVenue": "binance-spot",
    "entryWindowOpensAt": "2026-10-14T12:00:00.000Z",
    "entryWindowExpiresAt": "2026-10-14T12:15:00.000Z",
    "entryPrice": 67210.0,
    "entryObservedAt": "2026-10-14T12:00:09.000Z",
    "entryReceivedAt": "2026-10-14T12:00:09.210Z",
    "observationDegraded": False,
    "driftCapPct": 1.5,
    "driftObservedPct": 0.0149,
    "entryState": "entered",
    "voidReason": None,
    "invalidationPrice": 66192.0,
    "target1Price": 68706.0,
    "target2Price": 69714.0,
    "riskPerUnit": 1008.0,
    "horizonUnit": "elapsed_days",
    "primaryHorizon": 30,
    "evaluatorCompatibility": "actionable-entry-v1 crypto: venue-stamped first post-decision trade print",
    "supersedes": None,
    "issuedBy": "paper-signals-integrated-handler",
    "issuedAt": "2026-10-14T12:00:00.100Z",
    "cohortId": "actionable-entry-v1:crypto:elapsed_days:30",
    "entryEvidence": "venue-trade",
    "entryEvidenceReason": None,
}

VETO_BARS = [
    {"startAt": 1728828000000, "endAt": 1728828060000,
     "open": 67190.0, "high": 67230.0, "low": 67180.0, "close": 67210.0,
     "isClosed": True, "granularity": "intraday",
     "source": "binance-spot", "label": "waiting-interval bar 1"},
    {"startAt": 1728828060000, "endAt": 1728828120000,
     "open": 67210.0, "high": 67250.0, "low": 67200.0, "close": 67240.0,
     "isClosed": True, "granularity": "intraday",
     "source": "binance-spot", "label": "waiting-interval bar 2"},
]

ISSUED_SIG = {
    "id": "synthetic-sig-1",
    "candidateId": "synthetic-cand-1",
    "terminal": "crypto",
    "symbol": "BTC",
    "coin_id": "bitcoin",
    "decision_at": "2026-10-14T12:00:00Z",
    "issued_at": "2026-10-14T12:01:10Z",
    "direction": "long",
    "score": 64,
    "entry": 67200.0,
    "atr14": 1200.0,
    "signal_day": {"day": "2026-10-13", "high": 69000.0, "low": 66000.0},
    "factors": [dict(x) for x in LEDGER_LONG],
    "factors_asof": "2026-10-14T11:00:00Z",
    # The contract row's persisted JSON (string form, as the handler saves it).
    "contractJson": json.dumps(CONTRACT_JSON),
    "detectedAt": "2026-10-14T11:55:00.000Z",
    "outcome": {
        "kind": "issued",
        "gate": None,
        "reason": "issued via integrated crypto path; entered 2026-10-14T12:00:09.000Z",
        "via": "automatic",
        "detail": {
            "vetoSummary": ("qualification checks pass: setup history classified as features; "
                            "final published stop graded; proposed entry inside the permitted zone"),
            "contractId": "ct_synthetic-cand-1",
            "entryEventId": "crypto:sig_synthetic1:2026-10-14T12:00:09.000Z",
            "postEntryInvalidation": "no_invalidation_observed",
            "postEntryReason": "post-entry evidence clean through 2026-10-14T12:01:00Z",
        },
    },
    "inputs": {
        "signalDay": {"day": "2026-10-14", "open": 66800.0, "high": 67300.0,
                      "low": 66700.0, "close": 67200.0, "source": "binance.us klines 1d"},
        "historyCloses": [66800.0, 66950.0, 67100.0, 67200.0],
        "historyHighs": [66900.0, 67050.0, 67200.0, 67300.0],
        "currentPrice": 67210.0,
        "asOf": "2026-10-14T11:58:00.000Z",
        "vetoBars": [dict(b) for b in VETO_BARS],
    },
}

SUPPRESSED_CAND = {
    "id": "synthetic-cand-2",
    "terminal": "crypto",
    "symbol": "ETH",
    "coin_id": "ethereum",
    "decision_at": "2026-10-14T12:05:00Z",
    "direction": "short",
    "score": 62,
    "entry": 2450.0,
    "invalidation": 2525.0,
    "target1": 2375.0,
    "target2": 2300.0,
    "signal_day": {"day": "2026-10-13", "high": 2500.0, "low": 2400.0},
    "status": "rejected",
    "reason": "issuance-veto: qualification suppressed (fail-closed): entry_zone=fail (drift exceeds cap)",
    "detectedAt": "2026-10-14T12:03:00.000Z",
    "factors": [dict(x) for x in LEDGER_LONG],
    "factors_asof": "2026-10-14T11:00:00Z",
    "outcome": {
        "kind": "rejected",
        "gate": "issuance-veto",
        "reason": "qualification suppressed (fail-closed): entry_zone=fail",
        "via": "automatic",
        "detail": {
            "vetoSummary": "qualification suppressed (fail-closed): entry_zone=fail (drift exceeds cap)",
            "checks": [
                {"check": "pipeline_order", "verdict": "pass", "reason": "final published stop graded"},
                {"check": "setup_history", "verdict": "pass", "reason": "pre-decision bars are features"},
                {"check": "entry_zone", "verdict": "fail", "reason": "drift exceeds cap"},
            ],
        },
    },
    "inputs": {
        "signalDay": {"day": "2026-10-14", "open": 2480.0, "high": 2490.0,
                      "low": 2440.0, "close": 2450.0, "source": "binance.us klines 1d"},
        "historyCloses": [2480.0, 2470.0, 2460.0, 2450.0],
        "historyHighs": [2490.0, 2485.0, 2475.0, 2470.0],
        "currentPrice": 2450.0,
        "asOf": "2026-10-14T12:04:00.000Z",
        "vetoBars": [dict(b) for b in VETO_BARS],
    },
}

ALERTS = [
    {"id": "setup_synthetic-cand-1", "kind": "setup", "signalId": "sig_synthetic1",
     "candidateId": "synthetic-cand-1", "symbol": "BTC", "direction": "long",
     "alertedAt": "2026-10-14T12:00:00.100Z", "channel": "sandbox-feed",
     "enqueuedAt": "2026-10-14T12:00:00.100Z",
     "deliveredAt": "2026-10-14T12:00:01.000Z",
     "deliveryStatus": "delivered", "deliveryMode": "simulated",
     "ackId": "ack-setup-synth-1", "deliveryAttempts": 1},
    {"id": "entry_sig_synthetic1", "kind": "entry", "signalId": "sig_synthetic1",
     "candidateId": "synthetic-cand-1", "symbol": "BTC", "direction": "long",
     "alertedAt": "2026-10-14T12:01:10.000Z", "channel": "sandbox-feed",
     "enqueuedAt": "2026-10-14T12:01:10.000Z",
     "deliveredAt": "2026-10-14T12:01:11.000Z",
     "deliveryStatus": "delivered", "deliveryMode": "simulated",
     "ackId": "ack-entry-synth-1", "deliveryAttempts": 1},
]

SYNTHETIC_STATUS = {
    "ok": True,
    "exported_at": "2026-10-14T13:00:00Z",
    "exported_by": "test_live_adapter_full.py",
    "source": "deployed-artifact:altcoin-analyzer-and-signal-tracker:getpaperpilotstatus",
    "synthetic_fixture": SYNTHETIC,
    "data": {
        "signals": [dict(ISSUED_SIG)],
        "candidates": [dict(SUPPRESSED_CAND)],
        "alerts": [dict(a) for a in ALERTS],
        "runs": [{"id": 99, "trigger": "manual", "status": "complete",
                  "candidateCount": 2, "issuedCount": 1,
                  "completedAt": "2026-10-14T12:06:00Z"}],
        "comparisons": [],
        "segregation": {"paperTable": "paper_signals",
                        "legacyTable": "generated_signals",
                        "legacyTrackedCount": 31},
        "freeze": {"version": "paper-pilot-v2.1.4"},
    },
}


def full_record_of(row):
    """Parse the full_record= JSON payload out of a prospective row's notes."""
    notes = row.get("notes") or ""
    assert "full_record=" in notes, "row notes carry no full_record payload"
    payload = notes.rsplit("full_record=", 1)[1]
    return json.loads(payload)


class TestLiveAdapterFullRecord(unittest.TestCase):
    maxDiff = None

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(prefix="live-adapter-full-")
        cls.status_path = os.path.join(cls.tmp, "synthetic-status.json")
        cls.export_path = os.path.join(cls.tmp, "synthetic-export.json")
        with open(cls.status_path, "w") as f:
            json.dump(SYNTHETIC_STATUS, f, indent=2)
        # The real prospective vessel must not move during this test.
        cls.vessel_before = (os.path.getmtime(VESSEL_CSV)
                             if os.path.exists(VESSEL_CSV) else None)
        cls.vessel_size_before = (os.path.getsize(VESSEL_CSV)
                                  if os.path.exists(VESSEL_CSV) else None)

        cls.export = lps.export_live_stream(cls.status_path, cls.export_path)
        cls.candidates = lps.ingest_live_paper_stream(cls.export_path)
        cls.rows = score_candidates(cls.candidates)

        cls.issued_cand = next(
            c for c in cls.candidates
            if c["candidate_id"] == "live-paper-synthetic-sig-1")
        cls.suppr_cand = next(
            c for c in cls.candidates
            if c["candidate_id"] == "live-paper-cand-synthetic-cand-2")
        cls.issued_row = next(
            r for r in cls.rows
            if r["candidate_id"] == "live-paper-synthetic-sig-1")
        cls.suppr_row = next(
            r for r in cls.rows
            if r["candidate_id"] == "live-paper-cand-synthetic-cand-2")

    def test_export_keeps_both_records_and_marks_freeze_version(self):
        self.assertEqual(self.export["n_candidates"], 2)
        self.assertEqual(self.export["excluded_pre_freeze"], 0)
        self.assertEqual(self.export["active_freeze_version"], "2.1.5")

    def test_candidate_dicts_carry_all_five_blocks(self):
        for cand in (self.issued_cand, self.suppr_cand):
            for block in ("contract", "entry_observation", "frozen_levels",
                          "gate_inputs", "waiting_interval_evidence"):
                self.assertIn(block, cand, f"{cand['candidate_id']}: missing {block}")
                self.assertIsInstance(cand[block], dict)

    def test_issued_contract_fields_survive(self):
        rec = full_record_of(self.issued_row)["contract"]
        # Every contract field from the audit, field-by-field.
        for adapter_key, contract_key, _aliases in lps.CONTRACT_FIELDS:
            self.assertIn(adapter_key, rec)
            self.assertEqual(rec[adapter_key], CONTRACT_JSON[contract_key],
                             f"contract field {adapter_key}")

    def test_issued_entry_observation_survives(self):
        rec = full_record_of(self.issued_row)["entry_observation"]
        self.assertEqual(rec["entry_price"], 67210.0)
        self.assertEqual(rec["entry_observed_at"], "2026-10-14T12:00:09.000Z")
        self.assertEqual(rec["entry_received_at"], "2026-10-14T12:00:09.210Z")
        self.assertEqual(rec["venue_label"], "binance-spot")
        # Observation age is computed from the two persisted timestamps.
        self.assertEqual(rec["observation_age_ms"], 210)
        self.assertEqual(rec["entry_evidence"], "venue-trade")
        self.assertIsNone(rec["entry_evidence_reason"])
        self.assertEqual(rec["entry_state"], "entered")
        self.assertIsNone(rec["void_reason"])
        # The full event's own recording instant is not persisted by the
        # handler: unavailable in the deployed response, never fabricated.
        self.assertIsNone(rec["entry_recorded_at"])
        self.assertEqual(rec["event_id"],
                         "crypto:sig_synthetic1:2026-10-14T12:00:09.000Z")

    def test_issued_frozen_levels_survive(self):
        rec = full_record_of(self.issued_row)["frozen_levels"]
        self.assertEqual(rec["invalidation_price"], 66192.0)
        self.assertEqual(rec["target1_price"], 68706.0)
        self.assertEqual(rec["target2_price"], 69714.0)
        self.assertEqual(rec["risk_per_unit"], 1008.0)
        self.assertEqual(rec["basis_price"], 67200.0)
        self.assertEqual(rec["atr14"], 1200.0)
        # v1 contract version -> the documented freeze-at-decision rule.
        self.assertEqual(rec["level_freeze_policy"], "freeze-at-decision")
        self.assertEqual(rec["frozen_at"], "2026-10-14T12:00:00.000Z")

    def test_issued_gate_inputs_survive(self):
        rec = full_record_of(self.issued_row)["gate_inputs"]
        fresh = rec["freshness"]
        self.assertEqual(fresh["inputs_as_of"], "2026-10-14T11:58:00.000Z")
        self.assertEqual(fresh["decision_at"], "2026-10-14T12:00:00.000Z")
        self.assertEqual(fresh["verdict"], "passed")
        self.assertIsNone(fresh["freshness_window_ms"])  # handler constant, not persisted

        regime = rec["regime_gate"]
        self.assertEqual(regime["direction"], "long")
        self.assertIsNone(regime["gate"])  # longs have no regime gate
        self.assertEqual(regime["result"], "passed")
        self.assertEqual(regime["inputs"]["current_price"], 67210.0)
        self.assertEqual(regime["inputs"]["history_closes"], [66800.0, 66950.0, 67100.0, 67200.0])
        self.assertEqual(regime["inputs"]["history_highs"], [66900.0, 67050.0, 67200.0, 67300.0])
        self.assertEqual(regime["inputs"]["signal_day"]["day"], "2026-10-14")

        zone = rec["entry_zone"]
        self.assertEqual(zone["direction"], "long")
        self.assertEqual(zone["proposed_entry"], 67210.0)
        self.assertEqual(zone["reference_entry"], 67210.0)
        self.assertEqual(zone["drift_limit_bps"], 150)  # crypto rule, veto-input.ts
        self.assertEqual(zone["entry_at"], "2026-10-14T12:00:00.000Z")
        self.assertIsNone(zone["expires_at"])

        veto = rec["veto"]
        self.assertEqual(veto["verdict"], "pass")
        self.assertIn("qualification checks pass", veto["summary"])
        self.assertIsNone(veto["checks"])  # checks only persisted on the reject path
        self.assertEqual(veto["finest_granularity"], "intraday")
        self.assertEqual(veto["pre_decision_at"], "2026-10-14T11:55:00.000Z")
        self.assertEqual(len(veto["bars"]), 2)
        self.assertEqual(veto["bars"][0]["label"], "waiting-interval bar 1")
        self.assertEqual(veto["pipeline_stops"],
                         {"draft_stop": 66192.0, "published_stop": 66192.0})

        self.assertIsNone(rec["duplicate_check"]["winning_signal_id"])
        post = rec["post_entry"]
        self.assertEqual(post["verdict"], "no_invalidation_observed")
        self.assertIn("post-entry evidence clean", post["reason"])

    def test_issued_waiting_interval_survives(self):
        rec = full_record_of(self.issued_row)["waiting_interval_evidence"]
        self.assertEqual(rec["interval"],
                         ["2026-10-14T12:00:00.000Z", "2026-10-14T12:00:09.000Z"])
        self.assertEqual(rec["direction"], "long")
        self.assertEqual(rec["final_stop"], 66192.0)
        self.assertEqual(rec["pre_decision_at"], "2026-10-14T11:55:00.000Z")
        self.assertEqual(rec["finest_granularity"], "intraday")
        self.assertFalse(rec["allow_empty_interval"])
        # Issuance implies a pass verdict (handler.ts step 9b fails closed
        # on any non-pass verdict); bars/per-bar verdicts are not persisted.
        self.assertEqual(rec["final_verdict"], "pass")
        self.assertIn("step 9b", rec["verdict_provenance"])
        self.assertIsNone(rec["bars"])
        self.assertIsNone(rec["per_bar_verdicts"])

    def test_issued_alert_join(self):
        trace = self.issued_cand["trace"]
        self.assertEqual(trace["contract_id"], "ct_synthetic-cand-1")
        self.assertEqual(trace["entry_observed_at"], "2026-10-14T12:00:09.000Z")
        self.assertEqual(trace["alert_enqueued_at"], "2026-10-14T12:01:10.000Z")
        self.assertEqual(trace["alert_delivered_at"], "2026-10-14T12:01:11.000Z")
        self.assertEqual(trace["alert_delivery_status"], "delivered")
        self.assertEqual(trace["alert_delivery_mode"], "simulated")
        self.assertEqual(trace["alert_ack_id"], "ack-entry-synth-1")
        self.assertEqual(trace["setup_alert"]["alert_id"], "setup_synthetic-cand-1")
        self.assertEqual(trace["entry_alert"]["alert_id"], "entry_sig_synthetic1")
        # The collector stamps the trace columns onto the row.
        self.assertEqual(self.issued_row["contract_id"], "ct_synthetic-cand-1")
        self.assertEqual(self.issued_row["entry_observed_at"], "2026-10-14T12:00:09.000Z")
        self.assertEqual(self.issued_row["alert_enqueued_at"], "2026-10-14T12:01:10.000Z")
        self.assertEqual(self.issued_row["alert_delivered_at"], "2026-10-14T12:01:11.000Z")
        self.assertEqual(self.issued_row["issuance_outcome"], "issued")
        self.assertEqual(self.issued_row["freeze_version"], "2.1.5")

    def test_suppressed_record_blocks(self):
        rec = full_record_of(self.suppr_row)
        # Suppressed candidates never reach contract creation: the contract
        # JSON is absent, so contract-only fields are None (never
        # fabricated); only the decision instant and decision-time levels
        # have a row-alias fallback tier (documented in the coverage table).
        row_alias_values = {
            "decision_at": "2026-10-14T12:05:00Z",
            "invalidation_price": 2525.0,
            "target1_price": 2375.0,
            "target2_price": 2300.0,
        }
        for adapter_key, _ck, _al in lps.CONTRACT_FIELDS:
            expected = row_alias_values.get(adapter_key)
            self.assertEqual(rec["contract"][adapter_key], expected,
                             f"suppressed contract field {adapter_key}")
        eo = rec["entry_observation"]
        self.assertIsNone(eo["entry_price"])
        self.assertIsNone(eo["entry_observed_at"])
        self.assertIsNone(eo["observation_age_ms"])
        # Frozen levels fall back to the candidate row's persisted levels.
        fl = rec["frozen_levels"]
        self.assertEqual(fl["invalidation_price"], 2525.0)
        self.assertEqual(fl["target1_price"], 2375.0)
        self.assertEqual(fl["target2_price"], 2300.0)
        self.assertIsNone(fl["atr14"])  # not persisted for suppressed rows
        self.assertIsNone(fl["level_freeze_policy"])  # no contract -> no policy
        # Gate inputs carry the persisted veto record.
        gi = rec["gate_inputs"]
        self.assertEqual(gi["veto"]["verdict"], "fail_closed")
        self.assertIn("fail-closed", gi["veto"]["summary"])
        self.assertEqual(len(gi["veto"]["checks"]), 3)
        self.assertEqual(gi["veto"]["checks"][2]["check"], "entry_zone")
        self.assertEqual(gi["regime_gate"]["gate"], "short-regime")
        self.assertEqual(gi["entry_zone"]["drift_limit_bps"], 150)
        self.assertIsNone(gi["post_entry"]["verdict"])
        # No waiting interval exists for a pre-observation suppression.
        wi = rec["waiting_interval_evidence"]
        self.assertIsNone(wi["final_verdict"])
        self.assertIsNone(wi["checks"])
        self.assertIsNone(wi["reason"])
        self.assertIsNone(self.suppr_row["contract_id"])
        self.assertIn("abstain:", self.suppr_row["issuance_outcome"])

    def test_missing_contract_json_yields_none_fields(self):
        # A deployed row without the contract JSON (or parsed block): every
        # contract field stays None, the block shape is still emitted.
        sig = dict(ISSUED_SIG)
        sig.pop("contractJson", None)
        sig["id"] = "synthetic-sig-nocontract"
        blocks = lps._full_record_blocks(sig, issued=True)
        # Only the decision instant and decision-time levels have a
        # row-alias fallback tier; every other contract field stays None.
        aliased = {"decision_at", "invalidation_price", "target1_price",
                   "target2_price"}
        for adapter_key, _ck, _al in lps.CONTRACT_FIELDS:
            if adapter_key in aliased:
                continue
            self.assertIsNone(blocks["contract"][adapter_key],
                              f"no-contract row: {adapter_key}")
        self.assertIsNone(blocks["entry_observation"]["entry_price"])
        self.assertIsNone(blocks["entry_observation"]["entry_observed_at"])

    def test_synthetic_labels_present(self):
        for cand in self.candidates:
            self.assertIn("synthetic", cand["candidate_id"],
                          "synthetic records must be labeled synthetic")
        with open(self.status_path) as f:
            status = json.load(f)
        self.assertIn("synthetic", status.get("synthetic_fixture", ""))

    def test_real_prospective_file_untouched(self):
        # score_candidates never writes; the real vessel must be byte-identical.
        if os.path.exists(VESSEL_CSV):
            self.assertEqual(os.path.getsize(VESSEL_CSV), self.vessel_size_before)
            self.assertEqual(os.path.getmtime(VESSEL_CSV), self.vessel_before)


if __name__ == "__main__":
    unittest.main()
