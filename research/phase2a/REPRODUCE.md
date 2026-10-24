# Reproduce Phase 2A / Phase 2A.1 availability repair

## Environment

- Bun 1.4.2
- TypeScript 5.6.x under `server/tsconfig.json` and `client/tsconfig.json`
- Linux x86_64 web-artifact build runtime
- No paid API plan required

## Source and regression checks

```bash
bun run typecheck
bun test
```

Current captured output: `PHASE2A1-TEST-RESULTS-V2.txt`. The original Phase 2A and prior Phase 2A.1 outputs remain under `research/phase2a/original/` and `research/phase2a1/output/`.

## Offline review-fixture reproduction

```bash
bun research/phase2a/cli.ts \
  --input research/phase2a1/fixtures/synthetic-validation-bars.jsonl \
  --out research/phase2a1/corrected-output-v2
```

Fixture SHA-256: `8c81bf69c062e2c772378cc00f946be104204eb782cfe65089362266e6a4c400`.

This two-asset fixture is synthetic and exists only for deterministic regression review; it is not market evidence. Its corrected output stays separate from the runtime market-cache export. The JSONL input has one `ResearchBar` per line using the interface in `server/src/phase2a-research.ts`. The engine rejects any bar crossing the reserved 2025-01-01 holdout start before feature, label, or report generation. `--open-holdout` and `--evaluate-holdout` are rejected.

The CLI verifies `server/src/phase2a-research.ts` and the embedded executable specification against `research/phase2a/executable-freeze.json`, then writes:

- dataset/report hashes;
- validation observations;
- holdout-lock evidence with no performance;
- direct synthetic-control report and rows;
- actual-pipeline positive-control report;
- executable-freeze verification;
- Markdown report and exact command.

## Runtime market-data reproduction

After deployment:

- `runphase2aofflineresearch {"refresh": true}` refreshes the existing lawful Binance history cache, truncates input before the reserved holdout, runs the pure engine, and stores separate observation/review blobs.
- `exportphase2a1reviewpackage {"refresh": false}` exports current source, migrations, original/corrected reports, actual normalized train/validation rows from that cache, observations, controls, hashes and protocols.
- `getphase2aresearchstatus {}` returns the saved summary and owned export URLs.

The export path does not read or write the legacy scoreboard, strategy weights, issued contracts, prospective cohorts, or holdout outcomes.
