#!/usr/bin/env python3
"""Cross-language receipt-expiry parity agreement test (ITEM 2).

Runs BOTH paths on the same fixture and asserts identical
(verdict, reason_code):

  - harness path: comparison/harness.py operational_issuance_eval, graded
    from preserved evidence (entry_observation.observed_at / received_at).
  - issuance-handler path: the real integrated handler
    (orchestrator/tests/receipt-expiry-probe.js, compiled from
    orchestrator/tests/receipt-expiry-probe.ts), driven through node as a
    subprocess; its outcome is mapped into the harness taxonomy
    (void_expired <-> abstain:entry-expired; issued <-> issued).

Any divergence between the two paths is a test failure.

Shared fixtures (offsets are ms after the decision instant):
  canonical: observation at minute 14 (in-window), receipt at minute 16
             (after expiry) -> REJECT on both paths.
  boundary-accept: observation at 14:59, receipt at 14:59:30 (inside the
             window) -> ACCEPT on both paths.
  boundary-reject: observation at 14:00, receipt at 15:01 (after expiry)
             -> REJECT on both paths.
"""

import json
import os
import shutil
import subprocess
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from test_harness import cand, op_evidence, FIX_A  # noqa: E402
from harness import operational_issuance_eval  # noqa: E402

# The handler probe uses T_CRYPTO = 2026-10-14T04:00:00.000Z as its decision
# instant; the harness fixture must use the identical decision_at so both
# paths grade the same 15-min window [T, T+15min].
DECISION_AT = "2026-10-14T04:00:00Z"

FIXTURES = [
    # (name, observed_ms_after, receipt_ms_after, probe_accept_flag)
    ("canonical-obs14-rec16", 14 * 60_000, 16 * 60_000, "0"),
    ("boundary-obs14m59-rec14m59s30", 14 * 60_000 + 59_000, 14 * 60_000 + 59_500, "1"),
    ("boundary-obs14-rec15m01", 14 * 60_000, 15 * 60_000 + 1_000, "0"),
]


def _probe_path():
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.normpath(os.path.join(
        here, "..", "..", "orchestrator", "dist", "paper-signals", "orchestrator",
        "tests", "receipt-expiry-probe.js"))


def run_handler_path(name, observed_ms, receipt_ms, accept_flag):
    """Run the real issuance-handler path via the node probe.

    Returns (verdict, reason_code) in the harness taxonomy.
    """
    probe = _probe_path()
    if shutil.which("node") is None:
        raise unittest.SkipTest("node is not available; cannot run the issuance-handler path")
    if not os.path.isfile(probe):
        raise unittest.SkipTest(
            f"handler probe not built: {probe} -- run `npm run build` in orchestrator/ first")
    out = subprocess.run(
        ["node", probe, str(observed_ms), str(receipt_ms), accept_flag],
        capture_output=True, text=True, timeout=120)
    if out.returncode not in (0,):
        raise AssertionError(
            f"handler probe failed on fixture {name}: rc={out.returncode} "
            f"stderr={out.stderr[:500]}")
    try:
        payload = json.loads(out.stdout.strip().splitlines()[-1])
    except (json.JSONDecodeError, IndexError) as e:
        raise AssertionError(
            f"handler probe emitted no JSON on fixture {name}: {out.stdout[:500]!r}") from e
    if payload.get("verdict") == "unexpected":
        raise AssertionError(
            f"handler path took an unexpected branch on fixture {name}: "
            f"{payload.get('reason_code')} (handler_status={payload.get('handler_status')}, "
            f"contract_state={payload.get('contract_state')})")
    return payload["verdict"], payload["reason_code"], payload


def run_harness_path(observed_ms, receipt_ms):
    """Run the harness path from preserved evidence.

    Returns (verdict, reason_code) from operational_issuance_eval.
    """
    ev = op_evidence(
        "long", 90.0, "clear", decision_at=DECISION_AT,
        observed_secs_after=observed_ms / 1000,
        received_secs_after=receipt_ms / 1000)
    v, reason, note = operational_issuance_eval(
        "long", 90.0, cand(FIX_A, decision_at=DECISION_AT, **ev))
    return v, reason, note


class TestReceiptExpiryAgreement(unittest.TestCase):
    def test_dual_path_agreement(self):
        for name, observed_ms, receipt_ms, accept_flag in FIXTURES:
            with self.subTest(fixture=name):
                h_verdict, h_reason, _ = run_handler_path(
                    name, observed_ms, receipt_ms, accept_flag)
                e_verdict, e_reason, _ = run_harness_path(observed_ms, receipt_ms)
                self.assertEqual(
                    (e_verdict, e_reason), (h_verdict, h_reason),
                    f"DIVERGENCE on fixture {name}: harness path "
                    f"({e_verdict}, {e_reason}) != issuance-handler path "
                    f"({h_verdict}, {h_reason})")

    def test_agreement_expected_outcomes(self):
        # Pin the agreed outcomes: the two post-expiry receipts reject with
        # the shared reason code; the in-window receipt accepts.
        expected = {
            "canonical-obs14-rec16": ("fail", "abstain:entry-expired"),
            "boundary-obs14m59-rec14m59s30": ("pass", "issued"),
            "boundary-obs14-rec15m01": ("fail", "abstain:entry-expired"),
        }
        for name, observed_ms, receipt_ms, accept_flag in FIXTURES:
            with self.subTest(fixture=name):
                h_verdict, h_reason, payload = run_handler_path(
                    name, observed_ms, receipt_ms, accept_flag)
                self.assertEqual((h_verdict, h_reason), expected[name],
                                 f"issuance-handler path outcome changed on {name}: {payload}")
                e_verdict, e_reason, _ = run_harness_path(observed_ms, receipt_ms)
                self.assertEqual((e_verdict, e_reason), expected[name],
                                 f"harness path outcome changed on {name}")


if __name__ == "__main__":
    unittest.main()
