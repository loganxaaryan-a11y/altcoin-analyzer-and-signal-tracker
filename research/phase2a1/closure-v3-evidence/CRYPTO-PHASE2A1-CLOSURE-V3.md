# Crypto Phase 2A.1 closure v3 — evidence index

Date: 2026-10-11

Scope: the expert’s six bounded closure items only. The frozen holdout stayed closed; no strategy, weight, indicator, split, issued contract, exposure record, legacy score, or success rule changed. No timing-performance experiment was run.

## Finding to evidence

| Requirement | Repair | Regression / output | Result | Remaining limitation |
|---|---|---|---|---|
| Current immutable payload pointer + successful-fetch freshness | `market_stream_health.last_observation_key` is authoritative in `currentObservationsFromPointers`; UI/read model now derives fetch age from the pointer’s validated `last_success_at`, while point-provider age and candle interval end remain separate. Failed persistence is atomic through the existing DB batch. | `market-freshness.test.ts`: unchanged success, stopped polling, old provider content, A→B→A. `market-refresh-action.integration.test.ts`: action + isolated SQLite success/dedup/reversion/write-failure/recovery. | Passed offline deterministic tests. | Deployed migration/scheduler cycles were not observed in this run; production recovery remains pending. |
| Post-issuance quote eligibility | Monitor requires provider event and receipt at/after `max(decisionAt, issuedAt, entryAt)`; venue/instrument/USDT checks remain; emitted status remains explicitly non-authoritative. | Helper and actual monitor-action regression: decision 09:00, issue/entry 09:05, provider quote 09:04, receipt 09:06, monitor 09:07. | No barrier/status event appended; pre-issuance counter increments. | Does not establish authoritative first touch; existing evaluator/coverage still owns settlement. |
| Shared statistical kernel | Market `summarize` and synthetic controls now call `evaluateDatePanelWithSeeds`. Original market seed offsets and success criterion are unchanged. The old duplicate bootstrap implementation was removed. | Existing research and pipeline-positive tests; corrected 18,223-bar report under `closure-v3-real-market/`; executable freeze v3. | 8,162 observations reproduced; both selections remain empty; positive synthetic control remains diagnostic and separate. | Market data are exploratory overlapping event returns, not portfolio returns or predictive approval. |
| Real worker/action recovery | `runMarketDataRefresh` accepts injected provider/clock dependencies without changing production defaults. Integration suite runs the actual worker function and database writes. It covers unchanged payload, pointer updates, 429 accounting/retry instruction, terminal timeout, partial candle failure, DB write failure and subsequent recovery, concurrent triggers, and byte-for-byte immutable issued row checks. | `market-refresh-action.integration.test.ts`; full test log. | Passed offline deterministic tests with provider call counts and persisted accounting assertions. | No claim of deployed scheduler registration, migration application, consecutive production cycle, or production outage recovery. |
| Volume/source labels + cheap-data UI | Main current price, Binance Spot USDT quote volume and chart mark read the cheap market path. CoinGecko volume is explicitly labelled market-wide, USD, and as-of time, with a note that it is not directly comparable. Fetch/provider health labels are separate. | `client/src/App.tsx`; worker integration proves repeated cheap refreshes persist new marks without invoking an analysis action; source code keeps analysis query/action separate. | UI wiring updated; existing analysis timestamp remains independent. | Browser evidence is recorded only after the artifact audit; no production-feed timing claim is made here. |
| Frozen timing protocol + structural preflight | V3 freezes volatility buckets, pool eligibility, exact matching order, comparator reuse/exhaustion, candidate-date eligibility, five seeds, dependency edges and the 20-component gate. | `PHASE2A1-TIMING-EVALUATION-PROTOCOL-V3.md`; `closure-v3-real-market/timing-structural-preflight.json`. | 8,162 candidates; 5,901 eligible comparator dates; 7,097 matched and 1,065 unmatched per seed; only 3 dependency components (sizes 3,835 / 1,756 / 1,506), so the ≥20 gate fails and timing performance remains unexecuted. | Connected components do not prove all dependence is eliminated; gate was not relaxed. |

## Corrected real-market population

Input: `real-market-input/normalized-train-validation-bars.jsonl`

- Rows: **18,223**
- SHA-256: `d2d6230ed5b16fdb85a49f9e8bffcb05a31c99f3de59172542314ac24c1f1484`
- Dataset manifest hash reproduced by the engine: `7342ff4d7c9d4330660290c1cdc23debaefb9e1ca6308b9042d70f935446846a`
- 8,162-observation export SHA-256: `184c10e9bbfaf1a065dfc2a61c64e8a439d66e183eb4fc48a243ecef1da21bc0`, byte-identical to the archived prior real-market observation export.
- Prior real-market report/build metadata/source-run records remain under `research/phase2a1/prior-real-market/`; the corrected report is separately versioned under `closure-v3-real-market/`.
- Source/venue/cohort: Binance market-data-only API; Binance Spot USDT; survivor-sample exploratory.
- Holdout: 2025-01-01 through 2026-09-30, locked, zero opened performance rows.

| Pooled product | Emitted | Point-estimate rows | Tail rows excluded | Corrected central-net mean | Population identifier |
|---|---:|---:|---:|---:|---|
| 5-day trend | 4,045 | 4,032 | 13 | 0.524076% | `pooled|utc-grid-complete-blocks|block-days:30|dates:720|rows:4032` |
| 30-day trend | 3,525 | 3,525 | 0 | 2.034117% | `pooled|utc-grid-complete-blocks|block-days:30|dates:720|rows:3525` |
| 5-day breakout | 319 | 319 | 0 | 3.382867% | `pooled|utc-grid-complete-blocks|block-days:30|dates:720|rows:319` |
| 30-day breakout | 273 | 273 | 0 | 18.691118% | `pooled|utc-grid-complete-blocks|block-days:30|dates:720|rows:273` |

The 5-day trend difference is the intended population alignment: the earlier 4,045-row mean was 0.5010%; the shared complete-block population excludes 13 tail rows and yields 0.5241%. The other three pooled means are unchanged. No candidate passes the original rule.

## Reproduction

```bash
bun install
bun run typecheck
bun test
bun research/phase2a/cli.ts \
  --input research/phase2a1/real-market-input/normalized-train-validation-bars.jsonl \
  --out research/phase2a1/closure-v3-real-market
bun run build
```

Environment: Bun 1.4.x, TypeScript strict mode, SQLite via `bun:sqlite` for isolated action/database fixtures. No paid API, credential, holdout access, or live provider is needed for deterministic regression/research reproduction.

## Evidence status

- Offline source/tests/research reproduction: complete.
- Browser/client audit: passed in `audits/2026-10-11T05-04-14Z-831360842` after a successful 2026-10-11 build. Desktop and phone captures returned no console errors or broken assets; a live BTC dossier probe rendered the independent market-data lane with separately labelled Binance Spot current mark, 24-hour USDT quote volume, provider event time, latest successful fetch, and fetch/provider health.
- Deployed migration/scheduler/recovery: **pending**. No post-repair deployed consecutive-cycle or outage/recovery evidence was observed in this session.
- Equity: not part of this package. Continue from `EQUITY_PHASE2A1_REVIEW_AND_NEXT_PROMPT.md`; the old equity ZIP is not presented as new evidence.
