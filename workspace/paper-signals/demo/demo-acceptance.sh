#!/usr/bin/env bash
#
# demo-acceptance.sh — acceptance demonstrations for the paper-signal build (WORK ITEM 4/5).
#
# SANDBOX ONLY. No production issuance, no live trading. Every demonstration runs
# end-to-end through the real compiled orchestrator (and the entry/veto modules
# where relevant), exercising the REAL imported/vendored production functions —
# the expert rejects transcribed fixtures as acceptance evidence, so each demo
# prints the exercised function's identity (module path + function name +
# source SHA-256 from hashes.txt) plus a runtime proof of that identity.
#
# Steps:
#   1. Build the orchestrator (tsc + postbuild, which stages measurement.cjs for the live import).
#   2. Run the drift check (re-hashes the exact vendored source ranges; FAILS on upstream drift).
#   3. Run the TypeScript acceptance driver directly with Node >= 22 type-stripping.
#   4. Leave the evidence bundle under demo/evidence/ + demo/demo-report.md.
#
set -euo pipefail

DEMO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PS_DIR="$(dirname "$DEMO_DIR")"
ORCH="$PS_DIR/orchestrator"
EVIDENCE="$DEMO_DIR/evidence"

echo "node: $(node --version)"
echo "demo dir: $DEMO_DIR"
echo

echo "=== [1/3] building orchestrator ==="
(cd "$ORCH" && npm run build)
echo

echo "=== [2/3] drift check (vendored ranges vs source) ==="
mkdir -p "$EVIDENCE"
set +e
(cd "$ORCH" && npm run drift) > "$EVIDENCE/drift-check.log" 2>&1
DRIFT_RC=$?
set -e
if [ $DRIFT_RC -eq 0 ]; then
  echo "PASS" > "$EVIDENCE/drift-check.status"
  echo "drift check: PASS (see evidence/drift-check.log)"
else
  echo "FAIL" > "$EVIDENCE/drift-check.status"
  echo "drift check: FAIL (see evidence/drift-check.log)"
fi
echo

echo "=== [3/3] acceptance demonstrations ==="
# Fresh bundle per run: demo stores persist between runs, and replaying against
# a stale store would test idempotency instead of the acceptance path.
rm -rf "$EVIDENCE/stores" "$EVIDENCE/demos"
node "$DEMO_DIR/driver.ts"
RC=$?

echo
echo "=== evidence bundle ==="
find "$EVIDENCE" -type f | sort
echo
echo "report: $DEMO_DIR/demo-report.md"
exit $RC
