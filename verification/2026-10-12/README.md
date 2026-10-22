# Verification evidence

Commands were run from the checkout root on 2026-10-12.

- `typecheck.log`: `bun run typecheck`, exit 0.
- `bun-test.log`: native `bun test`, 100 pass / 0 fail / 309 expectations, exit 0.
- `runtime.log`: available runtime versions.
- `SHA256SUMS` and `FILE-LENGTHS.tsv` are generated inside the deterministic archive by `scripts/package-integrity-closeout.sh`.

The managed Hatch SDK is resolved by the web-artifact runtime/build pipeline; the lockfile and package manifest are included. Local native validation requires Bun and package installation compatible with `bun.lock`. The standalone archive does not include `node_modules`, `app.db`, credentials, prior ZIPs, generated bundles, or the shell-owned icon.

These are builder/sandbox results, not an expert rerun and not deployed production evidence.
