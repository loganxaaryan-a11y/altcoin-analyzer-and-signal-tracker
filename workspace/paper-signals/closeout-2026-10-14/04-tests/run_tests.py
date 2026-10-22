#!/usr/bin/env python3
"""Run the comparison-harness test suite."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import test_harness  # noqa: F401  (registers the test cases)
import test_collector  # noqa: F401  (workstream-B collector tests)
import test_receipt_expiry_parity  # noqa: F401  (ITEM 2 dual-path parity)
import test_live_adapter_full  # noqa: F401  (ITEM 1 adapter full-record regression)
import test_metrics_exclusion  # noqa: F401  (measurement exclusion: fixtures/replays)

if __name__ == "__main__":
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    suite.addTests(loader.loadTestsFromModule(test_harness))
    suite.addTests(loader.loadTestsFromModule(test_collector))
    suite.addTests(loader.loadTestsFromModule(test_receipt_expiry_parity))
    suite.addTests(loader.loadTestsFromModule(test_live_adapter_full))
    suite.addTests(loader.loadTestsFromModule(test_metrics_exclusion))
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)
