#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_INPUT="${1:-$ROOT/crypto-measurement-integrity-final-2026-10-12.zip}"
if [[ "$OUT_INPUT" = /* ]]; then OUT="$OUT_INPUT"; else OUT="$(pwd)/$OUT_INPUT"; fi
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
PKG="$TMP/altcoin-analyzer-and-signal-tracker"
mkdir -p "$PKG"
cd "$ROOT"

# Exact source-owned checkout only: no app.db, credentials, built bundles,
# node_modules, prior archives, shell-owned icon, or audit screenshots.
# The generated privileged contract is included because it is the compile-time
# @space/privileged module; the vendored SDK makes install paths portable.
for path in \
  AGENTS.md DATA-PLAN.md ACCEPTANCE-INTEGRITY-CLOSEOUT-2026-10-12.md BOUNDED-REPAIR-2026-10-12.md \
  package.json bun.lock bunfig.toml space.json tsconfig.base.json \
  client/build.mjs client/index.html client/tsconfig.json client/src \
  server/tsconfig.json server/src server/.generated/privileged.contract.ts \
  drizzle research scripts vendor/space-sdk-0.13.0.tgz \
  phase1-2-sanitized-fixture.json phase1-final-sanitized-fixture.json; do
  [[ -e "$path" ]] || { echo "missing required checkout path: $path" >&2; exit 2; }
  cp -R --parents "$path" "$PKG"
done
find "$PKG" -type f \( -name '*.tsbuildinfo*' -o -name '.DS_Store' \) -delete

mkdir -p "$PKG/verification/2026-10-12"
if [[ -d "$ROOT/verification/2026-10-12" ]]; then
  cp -R "$ROOT/verification/2026-10-12/." "$PKG/verification/2026-10-12/"
fi
(
  cd "$PKG"
  find . -type f ! -path './verification/2026-10-12/SHA256SUMS' ! -path './verification/2026-10-12/FILE-LENGTHS.tsv' -print0 | sort -z | xargs -0 sha256sum > verification/2026-10-12/SHA256SUMS
  { printf 'bytes\tpath\n'; find . -type f ! -path './verification/2026-10-12/FILE-LENGTHS.tsv' -printf '%s\t%p\n' | sort -t $'\t' -k2; } > verification/2026-10-12/FILE-LENGTHS.tsv
  find . -type f -exec touch -t 198001010000 {} +
  find . -type d -exec touch -t 198001010000 {} +
)
rm -f "$OUT" "$OUT.sha256"
(
  cd "$TMP"
  find altcoin-analyzer-and-signal-tracker -type f -print | LC_ALL=C sort | zip -X -q "$OUT" -@
)
sha256sum "$OUT" | tee "$OUT.sha256"
printf 'archive=%s\n' "$OUT"
printf 'files=%s\n' "$(unzip -Z1 "$OUT" | wc -l | tr -d ' ')"
