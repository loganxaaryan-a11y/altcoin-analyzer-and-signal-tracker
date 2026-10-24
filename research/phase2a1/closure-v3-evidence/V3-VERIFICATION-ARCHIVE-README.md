# Crypto Phase 2A.1 — v3 verification archive

Generated from the completed `altcoin-analyzer-and-signal-tracker` checkout on 2026-10-12. This is a verification package only. It does not change strategies, weights, candidate selection, timing gates, the locked holdout, or the no-promotion decision.

## Package scope

The archive contains the untruncated server and client source, schema and migrations, package manifests and lockfile, TypeScript/build configuration, all seven current test files (the six closure suites plus the later meme-risk regression suite), research CLI/helpers, frozen protocol/spec, normalized train/validation dataset and provenance, corrected reports, observation exports, timing structural records, command logs, and per-file byte/SHA-256 manifest.

The original real-market input is `research/phase2a1/real-market-input/normalized-train-validation-bars.jsonl`: 18,223 rows. The source manifest and provenance are beside it. Its SHA-256 is `d2d6230ed5b16fdb85a49f9e8bffcb05a31c99f3de59172542314ac24c1f1484`.

The reserved 2025-01-01 through 2026-09-30 holdout remains locked. No real holdout bars or labels are included. Holdout-lock metadata and synthetic boundary fixtures are included so the guard can be rerun.

## Executable freeze

`research/phase2a/executable-freeze.json` binds `server/src/phase2a-research.ts` to SHA-256 `09b8146145dbf8af8caa8629038bbdf713f2d96325be18e469cacef57dfb283d`. `review-manifest-v3.json` records the same packaged path and hash. The frozen research spec hash is `90ba804cd8816517244a805086599c3f6c7a6a1a82372e234ba62804e1edfdd6`.

## Exact rerun commands

Runtime used: Linux x86_64, Bun `1.4.2`. `package.json` declares Bun `1.3.10`; Bun 1.4.2 is the verified runtime. Install from the lockfile with `bun install --frozen-lockfile`.

```bash
bun test
bun run typecheck
bun research/phase2a/cli.ts \
  --input research/phase2a1/real-market-input/normalized-train-validation-bars.jsonl \
  --out research/phase2a1/closure-v3-real-market
bun run build:server
# Client/public artifact build is platform-owned and was run with web_artifacts.build.
```

The current test log records 85 passing tests across seven files and zero failures. The current typecheck log records exit 0. The CLI log records exit 0 and a locked, unopened holdout. The platform build record reports success; the manual client build refusal is preserved separately because the client build must be run through the platform builder.

## Timing structural preflight

`research/phase2a1/closure-v3-real-market/timing-structural-preflight.json` is structural-only. It contains every candidate/comparator match and every dependency component for all five frozen seeds, without candidate/comparator returns or timing-performance statistics. Each seed reports 8,162 candidates, 7,097 matches, 1,065 unmatched candidates, and component sizes 3,835 / 1,756 / 1,506. Three usable components fail the frozen minimum of twenty, so timing performance is not executed and no timing result is promoted.

## Shared evaluator

`server/src/phase2a-research.ts` defines `evaluateDatePanelWithSeeds`. Ordinary market evaluation, synthetic controls, and the pipeline positive fixture call that same evaluator. Source call sites and the positive-control test are included untruncated; the 85-test log records the shared-kernel and positive-fixture tests passing.

## Deployed evidence

Deployed scheduler/cadence, consecutive post-migration cycles, and controlled outage/recovery evidence are **PENDING**. None is fabricated from fixtures. Offline action/SQLite integration tests are included and pass, but they are not represented as deployed production proof.

## Review manifest

`review-manifest-v3.json` contains the archive-relative path, exact byte length, and SHA-256 digest for every included file, plus the freeze binding, dataset binding, holdout exclusion statement, command log locations, and deployed-evidence state. `SHA256SUMS.txt` provides a conventional checksum list. The zip checksum is written beside the archive and is not self-included.
