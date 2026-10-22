#!/usr/bin/env python3
"""Run the comparison-harness test suite."""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import test_harness  # noqa: F401  (registers the test cases)
import test_collector  # noqa: F401  (workstream-B collector tests)

if __name__ == "__main__":
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()
    suite.addTests(loader.loadTestsFromModule(test_harness))
    suite.addTests(loader.loadTestsFromModule(test_collector))
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    sys.exit(0 if result.wasSuccessful() else 1)
