#!/bin/bash
# rt-crypto-core-compare: run the crypto-core module against the ISOLATED
# comparison store (paper-signals/pilot/monitoring-compare). Production is
# never written: the module's scripts operate on their own directory, and
# the snapshot lands in core-snapshot-compare.json.
#
# Freshness feed (documented in the comparison plan): enroll.py needs a
# canonical-entered.json no older than its STALE_S bound (1200s). The
# production file is refreshed by the legacy lane before its enroll step;
# the comparison copies that file in (read-only on production) before each
# run, modeling the artifact-side refresh the cutover design requires.
set -u
BASE=/home/hatch/workspace/goals/research-terminal
PROD=$BASE/paper-signals/pilot/monitoring
ISO=$BASE/paper-signals/pilot/monitoring-compare

cp "$PROD/canonical-entered.json" "$ISO/canonical-entered.json.tmp" \
  && mv "$ISO/canonical-entered.json.tmp" "$ISO/canonical-entered.json"

export RT_MON_DIR=$ISO
export RT_SNAPSHOT_MON_DIR=$ISO
export RT_SNAPSHOT_OUT=$BASE/paper-signals/pilot/snapshots/core-snapshot-compare.json
export RT_SNAPSHOT_SOURCE="rt-crypto-core-compare (isolated store, systemd, zero agent launches)"
export RT_LOCK_NAME=crypto-core-compare
exec "$BASE/engine/modules/crypto-core/run.sh"
