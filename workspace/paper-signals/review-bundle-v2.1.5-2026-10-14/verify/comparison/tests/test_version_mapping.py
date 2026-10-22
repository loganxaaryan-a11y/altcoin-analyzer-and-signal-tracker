#!/usr/bin/env python3
"""Version-mapping regression test: paper-pilot-v2.1.0 <-> comparison v2.1.5.

Re-validates the mapping recorded in comparison/VERSION-MAPPING-2026-10-14.md
on every run:

  1. Hash re-verification: recompute sha256 for every recorded file from the
     workspace and compare against the recorded baseline. Any mismatch ->
     FAIL with `mapping-rejected:hash-mismatch:<relative-path>`.
  2. Operational-rule re-check: extract each rule's semantics from BOTH
     sides' actual source files (deployed-side TS sources from the 2026-10-13
     export area; comparison-side harness + frozen manifests) and assert they
     agree. Any drift -> FAIL with
     `mapping-rejected:rule-divergence:<rule-name>`.
  3. Version-chain wiring: ACTIVE_MANIFEST names freeze-manifest-v2.1.5.json,
     manifest_version == EXPECTED_ACTIVE_VERSION == ACTIVE_FREEZE_VERSION ==
     "2.1.5"; the deployed side self-reports paper-pilot-v2.1.0 and the two
     series are NOT unified.

Negative controls (non-vacuous): deliberately altered copies of the
recorded hash table and of a rule description MUST fail their checks.

Paper signals only. No brokerage, no strategy tuning, holdouts untouched.
"""

import hashlib
import json
import os
import re
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
COMPARISON = os.path.dirname(HERE)          # comparison/
PSIGNALS = os.path.dirname(COMPARISON)      # paper-signals/
sys.path.insert(0, COMPARISON)

import harness  # noqa: E402

# ---------------------------------------------------------------------------
# Recorded baseline (VERSION-MAPPING-2026-10-14.md §3). The test recomputes
# every hash from the workspace file; equality with this table is the pass
# condition. Deliberately NOT re-derived from the files themselves.
# ---------------------------------------------------------------------------
RECORDED_HASHES = {
    # Deployed-side operational sources (paper-pilot-v2.1.0 rule definitions)
    "entry-v1/src/contract.ts": "15853721301ccd13893f99e9c5e6751fb448aeadb7da6141dab7bad7c18cca42",
    "entry-v1/src/entry-rules.ts": "9874a0810b02c90ec457f88f4fcccb427ce47caa377f1c0279314d06f932eb53",
    "entry-v1/src/feed.ts": "68b5558eb67fcecd2a0ab6d91173e3911b272c94214ba7f6f65bdd415b974784",
    "entry-v1/src/legacy.ts": "adeb94b6b54dda33004cda8cdddc9fcd6f8212e1a0cd87ab65e2ee4c5e700792",
    "entry-v1/src/levels.ts": "5bd21b1d71d9fae5443cce6ad10bcb1fe3e0ff868baa94c6523bb872cce528bb",
    "entry-v1/src/pending.ts": "5624a9b1ffee8e7071ef0340e2f8b4aa1e75f74f8fbd44179a45c47d503da3c1",
    "entry-v1/src/watcher.ts": "b27d715d7054386d85daf349a71468c7e1dfa2d4ca69c340f65a53435a912b07",
    "veto/src/veto.ts": "ae38b6b1ddb933033dfa70e7bf375e403d134e24f75e9b57e60ff6b78a3ae478",
    "veto/src/waiting-interval.ts": "4035f95c8a02f66d2e69fb942969b2daa11154903fd7ee169333e803cd9f3c40",
    "orchestrator/src/issuance/handler.ts": "b43a788047ebb234d3c996595a9612cda60f1acd69adba25eb8bf8d8746b393b",
    # Comparison side (v2.1.5 executable_hashes)
    "comparison/harness.py": "229ca493e60d325237d16c23244583c44053c8558a72d76f6f4395cd7fdae147",
    "comparison/collect_pilot_rows.py": "af2cba2d4c180d6498ec39f40a1255b022017d57439027902eac269305123b0b",
    "comparison/live_paper_stream.py": "0f6393006d935c82d4b3d841aa23faec8adb18e860e006b16d4ab07a42b04836",
    "comparison/tests/test_harness.py": "d8a3e9bfbb91867a989e5caca630c8c054193affb97720175453a360c2f36990",
    "comparison/tests/test_collector.py": "c17a6a0de8b062b2c772a5e9c3cb4ceb00f5528fe4fb2f0845f8a7d7b2b4fd52",
    "comparison/tests/test_live_adapter_full.py": "477562e7c4f47df005a69057865a6f9aab2a811193770248f86e2aa96403a869",
    "comparison/tests/test_receipt_expiry_parity.py": "89de95f8cc49056a99695c954158e820add8cee5317e3e21cf6aa46ef853a144",
    "comparison/tests/run_tests.py": "d3a62c8c78c245692880fc67e27ed8a18189915b0f2e63d9d520d55825ed7cbd",
    "comparison/check_reconciliation_v2_1_5.py": "202a110125dc84f19f89e0b15a959d652372bd46783be4af53a503c66725a3eb",
    # Manifests / marker
    "comparison/freeze-manifest-v2.1.5.json": "829ec2e978d76f3d2bcda467c3ac6b74d22bfbc9ef0851403c2992dfc209dfcc",
    "comparison/freeze-manifest-v2.0.0.json": "30e661f8bf3781fc16ae8c8c9f3604dead4ce9baa2d778ac683570f547b567b9",
    "comparison/ACTIVE_MANIFEST": "16a488bb87afc477a0d6b270945ec13afd714a3cb1e708ff75294b8578267f95",
}

RULE_NAMES = (
    "entry-contract", "waiting-interval-veto", "venue-mapping",
    "level-construction", "evaluator-version", "receipt-expiry",
)


def _sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def _read(rel):
    with open(os.path.join(PSIGNALS, rel)) as f:
        return f.read()


def _norm(text):
    """Collapse whitespace so line-wrapped docstring phrases still match."""
    return re.sub(r"\s+", " ", text)


def _harness_src():
    """harness.py source with whitespace normalized (docstrings wrap lines)."""
    return _norm(_read("comparison/harness.py"))


def verify_hashes(recorded):
    """Return list of (relpath, expected, actual) for every mismatch."""
    bad = []
    for rel, expected in recorded.items():
        actual = _sha256(os.path.join(PSIGNALS, rel))
        if actual != expected:
            bad.append((rel, expected, actual))
    return bad


# ---------------------------------------------------------------------------
# Rule checks. Each returns (compatible: bool, evidence: str) and reads BOTH
# sides' live source files. The pure predicate helpers (e.g. _venue_compat)
# are what the negative control tampers with.
# ---------------------------------------------------------------------------

def _ts_params(text):
    """Extract UngroundedParams numbers from entry-rules.ts text."""
    out = {}
    for key in ("equityDriftCapPct", "cryptoDriftCapPct",
                "cryptoEntryWindowMinutes"):
        m = re.search(rf"{key}\s*:\s*([\d.]+)", text)
        if m:
            out[key] = float(m.group(1))
    m = re.search(r"maxObservationAgeMs\s*:\s*([^\n,]+),", text)
    if m:
        expr = m.group(1).replace(" ", "")
        out["maxObservationAgeMs"] = eval(expr)  # simple numeric literal expr
    return out


def _ts_venue_labels(text):
    """Extract ENTRY_VENUE_ACCEPTED_PRINT_LABELS from entry-rules.ts text."""
    m = re.search(r"ENTRY_VENUE_ACCEPTED_PRINT_LABELS[^=]*=\s*\{(.*?)\n\};",
                  text, re.S)
    block = m.group(1)
    rows = {}
    for rm in re.finditer(r'"([^"]+)"\s*:\s*\[([^\]]*)\]', block):
        rows[rm.group(1)] = tuple(sorted(re.findall(r'"([^"]+)"', rm.group(2))))
    return rows


def _ts_granularity_rank(text):
    m = re.search(r"const GRANULARITY_RANK[^=]*=\s*\{(.*?)\n\};", text, re.S)
    block = m.group(1)
    return {rm.group(1): int(rm.group(2))
            for rm in re.finditer(r"(\w+)\s*:\s*(\d+)", block)}


def _venue_compat(deployed_labels, comparison_labels):
    """Pure predicate: venue mapping identical row-for-row."""
    if set(deployed_labels) != set(comparison_labels):
        return False
    return all(tuple(sorted(deployed_labels[k])) == tuple(sorted(comparison_labels[k]))
                  for k in deployed_labels)


def _granularity_compat(deployed_rank, comparison_rank):
    return dict(deployed_rank) == dict(comparison_rank)


def check_entry_contract():
    contract_ts = _read("entry-v1/src/contract.ts")
    rules_ts = _read("entry-v1/src/entry-rules.ts")
    p = _ts_params(rules_ts)
    failures = []
    if 'CONTRACT_VERSION = "actionable-entry-v1"' not in contract_ts:
        failures.append("contract.ts CONTRACT_VERSION is not actionable-entry-v1")
    for rule in ("next-xnys-regular-session-open-print",
                 "first-post-decision-binance-spot-trade"):
        if rule not in contract_ts:
            failures.append(f"contract.ts missing EntryRule {rule!r}")
    if harness.OP_CRYPTO_ENTRY_WINDOW_MINUTES != int(p.get("cryptoEntryWindowMinutes", -1)):
        failures.append("crypto entry window minutes differ")
    if harness.OP_CRYPTO_DRIFT_CAP_PCT != p.get("cryptoDriftCapPct"):
        failures.append("crypto drift cap differs")
    if harness.OP_EQUITY_DRIFT_CAP_PCT != p.get("equityDriftCapPct"):
        failures.append("equity drift cap differs")
    if harness.OP_MAX_OBSERVATION_AGE_MS != p.get("maxObservationAgeMs"):
        failures.append("max observation age differs")
    if tuple(harness.OP_ENTRY_EVIDENCE_KINDS) != ("venue-trade", "cost-adjusted-quote"):
        failures.append("entry evidence kinds differ")
    # frozen carrier (carried forward into v2.1.5; v2.1.5 scope states no change)
    v200 = json.loads(_read("comparison/freeze-manifest-v2.0.0.json"))
    ec = v200["operational_rules"]["entry_contract"]
    if ec["contract_version"] != "actionable-entry-v1":
        failures.append("frozen entry_contract version drifted")
    return (not failures, "; ".join(failures) or "all entry-contract semantics agree")


def check_waiting_interval_veto():
    veto_ts = _read("veto/src/veto.ts")
    wi_ts = _read("veto/src/waiting-interval.ts")
    hsrc = _harness_src()
    failures = []
    if not _granularity_compat(_ts_granularity_rank(veto_ts), harness.OP_GRANULARITY_RANK):
        failures.append("GRANULARITY_RANK dict differs")
    if "checkWaitingInterval" not in wi_ts:
        failures.append("checkWaitingInterval missing from waiting-interval.ts")
    if "[decisionAt, entryObservedAt]" not in hsrc:
        failures.append("harness does not grade [decisionAt, entryObservedAt]")
    if "the FINAL published stop" not in hsrc:
        failures.append("harness does not grade against the final published stop")
    return (not failures, "; ".join(failures) or "waiting-interval semantics agree")


def check_venue_mapping():
    rules_ts = _read("entry-v1/src/entry-rules.ts")
    handler_ts = _read("orchestrator/src/issuance/handler.ts")
    failures = []
    deployed = _ts_venue_labels(rules_ts)
    comparison = {k: tuple(sorted(v))
                  for k, v in harness.OP_ENTRY_VENUE_ACCEPTED_PRINT_LABELS.items()}
    if not _venue_compat(deployed, comparison):
        failures.append(f"venue label mapping differs: {deployed} vs {comparison}")
    if "acceptedPrintVenues(pending.entryVenue)" not in handler_ts:
        failures.append("handler does not consume acceptedPrintVenues(entryVenue)")
    if "exact-label" not in rules_ts.lower() and "fail-closed" not in rules_ts.lower():
        failures.append("fallback fail-closed note missing in entry-rules.ts")
    return (not failures, "; ".join(failures) or "venue mapping identical row-for-row")


def check_level_construction():
    levels_ts = _read("entry-v1/src/levels.ts")
    failures = []
    if '"freeze-at-decision"' not in levels_ts:
        failures.append("levels.ts missing freeze-at-decision policy")
    if "validatePublishedLevels" not in levels_ts:
        failures.append("levels.ts missing validatePublishedLevels")
    v215 = json.loads(_read("comparison/freeze-manifest-v2.1.5.json"))
    if "level construction" not in v215["scope"]:
        failures.append("v2.1.5 scope does not attest level construction unchanged")
    v200 = json.loads(_read("comparison/freeze-manifest-v2.0.0.json"))
    if "freeze-at-decision" not in v200["operational_rules"]["level_construction"]["rebuild_policy"]:
        failures.append("frozen level_construction rebuild policy drifted")
    if "the FINAL published stop" not in _harness_src():
        failures.append("harness waiting-interval veto not graded on final published stop")
    return (not failures, "; ".join(failures) or "level construction / immutability agree")


def check_evaluator_version():
    v200 = json.loads(_read("comparison/freeze-manifest-v2.0.0.json"))
    v215 = json.loads(_read("comparison/freeze-manifest-v2.1.5.json"))
    failures = []
    ce = v200["operational_rules"]["corrected_evaluator"]
    if ce["crypto"]["evaluator_version"] != "crypto-evaluation-v5-corrected":
        failures.append("frozen crypto evaluator version drifted")
    if ce["equity"]["evaluator_version"] != "equity-eval-3.3.0":
        failures.append("frozen equity evaluator version drifted")
    if "evaluator version" not in v215["immutability_rule"]:
        failures.append("v2.1.5 immutability_rule no longer names evaluator version")
    for ch in v215["changed_fields"]:
        if "evaluator" in ch["field"].lower() and "no" not in ch.get("v2_1_5_value", "").lower():
            failures.append(f"v2.1.5 changed an evaluator field: {ch['field']}")
    if "frozen evaluator versions" not in _harness_src():
        failures.append("harness does not grade under the frozen evaluator versions")
    return (not failures, "; ".join(failures) or "evaluator versions agree")


def check_receipt_expiry():
    handler_ts = _read("orchestrator/src/issuance/handler.ts")
    hsrc = _harness_src()
    failures = []
    if "lateReceiptVoid" not in handler_ts:
        failures.append("handler.ts missing lateReceiptVoid")
    if "receiptMs > expiresMs" not in handler_ts:
        failures.append("handler.ts missing receiptMs > expiresMs gate")
    if 'entryState: "void_expired"' not in handler_ts:
        failures.append("handler.ts missing void_expired state")
    if "if received_at > window_end:" not in hsrc:
        failures.append("harness missing received_at > window_end gate")
    # Functional check on the harness path: canonical minute-14/minute-16
    # fixture must yield exactly ("fail", "abstain:entry-expired").
    cand = {
        "terminal": "crypto",
        "candidate_id": "version-mapping-canonical",
        "decision_at": "2026-10-14T04:00:00Z",
        "issued_at": "2026-10-14T04:00:01Z",
        "decision_price": 100.0,
        "entry_observation": {
            "price": 100.1,
            "observed_at": "2026-10-14T04:14:00Z",
            "received_at": "2026-10-14T04:16:00Z",
            "venue_label": "binance-spot",
            "evidence": "venue-trade",
        },
        "waiting_interval_bars": [],
    }
    verdict, reason, _note = harness.operational_issuance_eval("long", 95.0, cand)
    if (verdict, reason) != ("fail", "abstain:entry-expired"):
        failures.append(
            f"canonical fixture -> {(verdict, reason)}, expected ('fail', 'abstain:entry-expired')")
    v215 = json.loads(_read("comparison/freeze-manifest-v2.1.5.json"))
    if not any(ch["field"] == "harness.operational_issuance_eval.receipt_expiry"
               and "lateReceiptVoid" in ch["v2_1_5_value"]
               for ch in v215["changed_fields"]):
        failures.append("v2.1.5 manifest does not document receipt-expiry parity")
    return (not failures, "; ".join(failures) or "receipt-expiry rule agrees on both paths")


CHECKS = {
    "entry-contract": check_entry_contract,
    "waiting-interval-veto": check_waiting_interval_veto,
    "venue-mapping": check_venue_mapping,
    "level-construction": check_level_construction,
    "evaluator-version": check_evaluator_version,
    "receipt-expiry": check_receipt_expiry,
}


def check_version_chain():
    """ACTIVE_MANIFEST -> v2.1.5 wiring; deployed self-report; series not unified."""
    failures = []
    with open(os.path.join(COMPARISON, "ACTIVE_MANIFEST")) as f:
        marker = f.read().strip()
    if marker != "freeze-manifest-v2.1.5.json":
        failures.append(f"ACTIVE_MANIFEST names {marker!r}, not the v2.1.5 manifest")
    if harness.EXPECTED_ACTIVE_VERSION != "2.1.5":
        failures.append("harness EXPECTED_ACTIVE_VERSION != 2.1.5")
    if harness.ACTIVE_FREEZE_VERSION != "2.1.5":
        failures.append("harness ACTIVE_FREEZE_VERSION != 2.1.5")
    if harness.ACTIVE_FREEZE_VERSION == "paper-pilot-v2.1.0":
        failures.append("series illegally unified: collector stamps paper-pilot-v2.1.0")
    status = json.loads(_read("comparison/live-paper-status-2026-10-14.json"))
    freeze = status["data"]["freeze"]
    if freeze["version"] != "paper-pilot-v2.1.0":
        failures.append("deployed self-reported freeze version != paper-pilot-v2.1.0")
    if freeze["hash"] != "a7d354a4f8ad9b0af7d3d61986b049f822ee918d28f26f335401d72d24669f84":
        failures.append("deployed freezeHash mismatch")
    return (not failures, "; ".join(failures) or "version chain wired correctly")


# The RECORDED table above is the hand-recorded baseline; hashes recomputed
# from the workspace must equal it.


class TestVersionMapping(unittest.TestCase):
    def test_hashes_recompute(self):
        bad = verify_hashes(RECORDED_HASHES)
        self.assertEqual(
            bad, [],
            "mapping-rejected:hash-mismatch:" +
            ", ".join(f"{rel} (recorded {exp[:12]}…, actual {act[:12]}…)"
                      for rel, exp, act in bad))

    def test_version_chain(self):
        ok, evidence = check_version_chain()
        self.assertTrue(ok, f"version chain broken: {evidence}")

    def test_entry_contract(self):
        ok, evidence = check_entry_contract()
        self.assertTrue(ok, f"mapping-rejected:rule-divergence:entry-contract: {evidence}")

    def test_waiting_interval_veto(self):
        ok, evidence = check_waiting_interval_veto()
        self.assertTrue(ok, f"mapping-rejected:rule-divergence:waiting-interval-veto: {evidence}")

    def test_venue_mapping(self):
        ok, evidence = check_venue_mapping()
        self.assertTrue(ok, f"mapping-rejected:rule-divergence:venue-mapping: {evidence}")

    def test_level_construction(self):
        ok, evidence = check_level_construction()
        self.assertTrue(ok, f"mapping-rejected:rule-divergence:level-construction: {evidence}")

    def test_evaluator_version(self):
        ok, evidence = check_evaluator_version()
        self.assertTrue(ok, f"mapping-rejected:rule-divergence:evaluator-version: {evidence}")

    def test_receipt_expiry(self):
        ok, evidence = check_receipt_expiry()
        self.assertTrue(ok, f"mapping-rejected:rule-divergence:receipt-expiry: {evidence}")

    # ---- negative controls: the checks must not pass vacuously ----
    def test_negative_control_tampered_hash(self):
        tampered = dict(RECORDED_HASHES)
        first = sorted(tampered)[0]
        tampered[first] = "0" * 64
        bad = verify_hashes(tampered)
        self.assertTrue(
            any(rel == first for rel, _, _ in bad),
            "NEGATIVE CONTROL FAILED: an altered recorded hash must be flagged")

    def test_negative_control_tampered_rule(self):
        # Deliberately altered venue mapping (extra venue label) must fail.
        deployed = {"binance-spot": ("binance-spot",),
                    "primary-listing-consolidated-tape":
                    ("consolidated-tape", "primary-listing-consolidated-tape")}
        tampered = {"binance-spot": ("binance-spot", "kraken-spot"),
                    "primary-listing-consolidated-tape":
                    ("consolidated-tape", "primary-listing-consolidated-tape")}
        self.assertTrue(_venue_compat(deployed, deployed),
                        "sanity: identical mappings must be compatible")
        self.assertFalse(
            _venue_compat(deployed, tampered),
            "NEGATIVE CONTROL FAILED: an altered venue mapping must be DIVERGENT")
        # And the full mapping check would reject under the named reason.
        tampered_gran = {"session": 1, "intraday": 2, "forming_candle": 3,
                         "trade_print": 4, "quote": 99}
        self.assertFalse(
            _granularity_compat(dict(harness.OP_GRANULARITY_RANK), tampered_gran),
            "NEGATIVE CONTROL FAILED: an altered granularity rank must be DIVERGENT")


if __name__ == "__main__":
    unittest.main(verbosity=2)
