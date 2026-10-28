#!/bin/bash
# rt-research: Hyperliquid market-data cache refresh -> opportunity scanner.
# Research only: never touches positions, outcomes, scoring, thresholds, or
# gates. Runs independently of crypto core — a slow research step can never
# delay position coverage.
# NOT in this script, by design: the research-shortlist capture
# (getresearchshortlist) is an artifact action. Artifact actions stay
# artifact-side (scheduled space actions) or on the existing agent cron
# until cutover; scripts never call artifact actions.
set -u
. "$(dirname "$0")/../../lib.sh"

rt_lock research

MD=$RT_BASE/paper-signals/pilot/marketdata
SCANNER=$RT_BASE/hidden_files/workstreams-2026-10-19/07-worker4-scanner/scanner.py
# Scanner exit 3 = self-skip (its own lock held, or cache stale/failed its
# integrity checks). That is a logged skip, recorded as the step's exit code
# in last-run.json — not a module failure.
rt_step hl_cache 420 python3 "$MD/hl_cache.py"
rt_step scanner 420 python3 "$SCANNER"
rt_step snapshot 60 python3 "$RT_ENGINE/modules/research/snapshot.py"
rt_write_lastrun research
echo "research: done $(date -u +%FT%TZ)"
