#!/usr/bin/env bash
# Run the comparison-harness test suite (tests/run_tests.py).
#
# `set -o pipefail` is load-bearing here: the suite output is piped through
# `tail` for a compact summary, and without pipefail a FAILED suite would
# still exit 0 (tail's exit), silently hiding broken tests.
set -o pipefail
cd "$(dirname "$0")"

python3 run_tests.py 2>&1 | tail -n 30
status=${PIPESTATUS[0]}
echo "----"
echo "suite exit code: ${status}"
exit "${status}"
