#!/usr/bin/env python3
"""Regression test: the live-adapter timestamp extraction bug (2026-10-14).

Failure mode (pre-fix): `live_paper_stream` extracted the decision instant
via snake_case only -- `cand.get("decision_at") or cand.get("decided_at")`.
The DEPLOYED `getpaperpilotstatus` schema persists the instant as camelCase
`decisionAt`. The old extraction returned None for every deployed record,
`_after_cutoff(None)` returned False, and all 8 post-freeze deployed
candidates were mislabeled "pre-freeze" and dropped (run-5 collection
2026-10-14T23:40Z ingested 58 candidates, collected 0, before the worker
repaired the adapter at 23:46Z).

Fix: `_pick(cand, "decisionAt", "decision_at", "decided_at")` on both the
signal and candidate paths; absent -> None, never fabricated.

This test:
  1. documents the old failure mode on the pre-fix extraction logic
     (a deployed-schema record yields None -> fails the cutoff);
  2. asserts the CURRENT adapter extracts decisionAt and retains the
     candidate through the post-freeze cutoff.

Run standalone: `python3 test_timestamp_adapter_regression.py`
(kept out of run_tests.py so the recorded executable hash of run_tests.py
under freeze-manifest-v2.1.5.json is untouched).
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from live_paper_stream import (  # noqa: E402
    FREEZE_CUTOFF_ISO,
    _after_cutoff,
    _pick,
    candidate_from_paper_candidate,
    candidate_from_paper_signal,
)

# The deployed decision instant shared by all 8 run-5 candidates.
DEPLOYED_DECISION_AT = "2026-10-14T20:26:29.411Z"


def deployed_candidate_fixture(cid=1):
    """A deployed-schema paper candidate row: camelCase only, like the
    getpaperpilotstatus response (no snake_case decision_at/decided_at)."""
    return {
        "id": cid,
        "candidateKey": f"paper-pilot-v2.1.0:paper-pilot-v2.1.0:handoff:60:bitcoin",
        "symbol": "BTC",
        "coinId": "bitcoin",
        "direction": "long",
        "decisionAt": DEPLOYED_DECISION_AT,
        "productionScore": 60,
        "challengerScore": 60,
        "productionHash": "f259e73e1af77c423dadde587e84430e704994afa484e3fedbf5aa6ecfef04cc",
        "challengerHash": "d88d534391d5214f5d3775274ea38c27cd1edc61449232c01c3084054313870d",
        "freezeVersion": "paper-pilot-v2.1.0",
        "state": "expired",
        "reason": "The original entry window expired before the deployed entry handler observed it.",
        "reasonCode": "entry_window_expired_before_observation",
    }


def _old_decision_at_snake_only(rec):
    """The PRE-FIX extraction logic (verbatim, 2026-10-14 23:40Z run-5)."""
    return rec.get("decision_at") or rec.get("decided_at")


class TestTimestampAdapterRegression(unittest.TestCase):
    def test_old_logic_fails_on_deployed_schema(self):
        """Demonstrates the pre-fix failure mode: snake_case-only extraction
        returns None for a deployed-schema record, so _after_cutoff drops it."""
        rec = deployed_candidate_fixture()
        self.assertNotIn("decision_at", rec)
        self.assertNotIn("decided_at", rec)
        extracted = _old_decision_at_snake_only(rec)
        self.assertIsNone(extracted,
                          "old logic must return None on deployed schema "
                          "(this is the failure mode, not the fix)")
        # The downstream consequence: the candidate is treated as pre-freeze
        # and EXCLUDED from collection.
        self.assertFalse(_after_cutoff(extracted),
                         "old extraction -> _after_cutoff(None) is False -> "
                         "post-freeze candidate mislabeled pre-freeze and dropped")

    def test_current_logic_extracts_decisionAt(self):
        """The fixed tolerance extracts the deployed camelCase timestamp."""
        rec = deployed_candidate_fixture()
        extracted = _pick(rec, "decisionAt", "decision_at", "decided_at")
        self.assertEqual(extracted, DEPLOYED_DECISION_AT)
        self.assertTrue(_after_cutoff(extracted),
                        "post-freeze decisionAt must survive the cutoff")

    def test_candidate_path_preserves_decision_timestamp(self):
        """End-to-end on the candidate builder: original decisionAt preserved
        verbatim (never shifted), candidate passes the cutoff."""
        rec = deployed_candidate_fixture()
        cand = candidate_from_paper_candidate(rec, {"segregation": {}, "freeze": {}})
        self.assertEqual(cand["decision_at"], DEPLOYED_DECISION_AT)
        self.assertTrue(_after_cutoff(cand["decision_at"]))

    def test_signal_path_extracts_decisionAt(self):
        """The signal path carries the same tolerance."""
        sig = {
            "id": 99,
            "symbol": "BTC",
            "direction": "long",
            "score": 60,
            "decisionAt": DEPLOYED_DECISION_AT,
        }
        cand = candidate_from_paper_signal(sig, {"segregation": {}, "freeze": {}})
        self.assertEqual(cand["decision_at"], DEPLOYED_DECISION_AT)

    def test_absent_timestamp_is_none_not_fabricated(self):
        """A record with no timestamp in any alias yields None, never a
        fabricated instant (and is therefore excluded by the cutoff)."""
        rec = {"id": 7, "symbol": "BTC"}
        extracted = _pick(rec, "decisionAt", "decision_at", "decided_at")
        self.assertIsNone(extracted)
        self.assertFalse(_after_cutoff(extracted))

    def test_cutoff_boundary(self):
        """Sanity on the cutoff itself (v2.1.0 post-freeze cutoff carried
        through v2.1.5)."""
        self.assertEqual(FREEZE_CUTOFF_ISO, "2026-10-14T04:57:00+00:00")
        self.assertTrue(_after_cutoff(DEPLOYED_DECISION_AT))
        self.assertFalse(_after_cutoff("2026-10-14T04:56:59.999Z"))


if __name__ == "__main__":
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(unittest.TestLoader().loadTestsFromModule(sys.modules[__name__]))
    sys.exit(0 if result.wasSuccessful() else 1)
