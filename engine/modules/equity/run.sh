#!/bin/bash
# rt-equity: OpenBB data-bundle refresh (deribit + equity bundles).
# Data layer only: overwrites the bundle files the equity terminal's
# read-only evidence reader consumes. Fail-soft per section inside
# openbb_layer.py — a failed fetcher records its error in the bundle.
# The equity paper BOOK (fills, outcomes, the bounded-restart cohort) lives
# in the artifact and stays artifact-side; this module never touches it.
set -u
. "$(dirname "$0")/../../lib.sh"

rt_lock equity

MD=$RT_BASE/paper-signals/pilot/marketdata
rt_step openbb 900 /home/hatch/workspace/tools/openbb-venv/bin/python "$MD/openbb_layer.py"
rt_step snapshot 60 python3 "$RT_ENGINE/modules/equity/snapshot.py"
rt_write_lastrun equity
echo "equity: done $(date -u +%FT%TZ)"
