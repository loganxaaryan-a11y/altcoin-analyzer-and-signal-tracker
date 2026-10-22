# Phase 2A audit

## Implemented

- Standalone pure-calculation crypto engine for fixed 5- and 30-elapsed-day direction products.
- Frozen trend-continuation and breakout-plus-volume hypotheses with one parameter set each.
- Freeze-before-outcome documents, machine registry, and SHA-256 freeze record.
- Venue-pure Binance Spot USDT daily OHLCV ingestion from the existing cache; CoinGecko/CoinPaprika rows are rejected.
- Per-instrument raw hashes, coverage, gaps, duplicates, incoherent-row counts, retrieval timestamps, and dataset-manifest hash.
- Completed-bar features, five-minute inferred publication lag, first later eligible daily open, exact linear long/short return arithmetic, and 18/36 bps modeled round-trip costs.
- Three common-time chronological validation folds with label-availability purging and a locked 2025-01-01 through 2026-09-30 final holdout.
- Always-long, always-short, SMA-200, and cash baselines. Directional baselines are reported both over the full eligible schedule and on each candidate's emitted timestamps.
- Deterministic 30-date moving-block bootstrap preserving the cross-asset panel.
- Explicit observation, abstention, exclusion, maturity, direction, flat, overlap, and source denominators.
- Machine-readable observations and review summary exported as artifact-owned blobs.
- A normal offline command, native Bun tests, and a separate persisted Phase 2A status action.
- Hard separation from the legacy scoreboard, live weights, issued contracts, and prospective cohorts.

## Independently testable

- `bun test` runs the complete local suite: 44 passed, 0 failed, 139 assertions on Bun 1.4.2.
- `bun test server/src/phase2a-research.test.ts` runs 12 dedicated Phase 2A cases.
- `bun x tsc --noEmit -p server/tsconfig.json` passes.
- `web_artifacts.build` compiles the server/client bundles and publishes the two Phase 2A actions.
- `artifact.invoke_action runphase2aofflineresearch {"refresh":true}` exercises the real cache-to-research-to-blob-to-summary path against the isolated builder data workspace.
- The deliberate leakage, future-bar immutability, current-bar breakout exclusion, zero-volume, gap, label-boundary purge, date-panel bootstrap, cost-unit, long/short, deterministic-rerun, locked-holdout, and cohort-separation fixtures are executable without network access.

## Result

No candidate merits final-holdout evaluation under the frozen selection rule. Both horizons return **no qualified candidate**. Positive pooled means and higher breakout hit rates do not override the negative baseline-difference test, regime-sensitive folds, overlapping signals, modeled costs, survivor-universe limitation, or unsupported short execution.

## Unsupported

- Historical reconstruction of the live dossier's funding, open interest, news, fundamentals, social, or provider gates.
- Whole-market point-in-time crypto membership, delisted-asset coverage, and runner precision/recall.
- Historical observed provider receipt timestamps; bar availability uses the declared five-minute inference.
- Borrow, locate, funding, and real short execution.
- Observed fees/slippage, market impact, or net realized returns.
- A portfolio, position sizing, cash/exposure caps, overlap handling, annualization, or risk-adjusted performance.
- Probability calibration or any interpretation of agreement as win probability.
- Final-holdout performance.

## Pending

- Independent external review of the specification, observations, baseline implementation, intervals, and no-selection decision.
- Any decision to spend the final holdout. Phase 2A does not authorize it.
- Live prospective shadow evaluation under a newly approved phase, if one is ever authorized.
- Equity 5/30-session research. It was not included in this crypto-terminal edit.
- Production issuance/persistence/scheduler evidence listed in the operational appendix.

## Limits on evidence labels

The 44 tests are native Bun runs in this workspace. The real-data action invocation is a sandbox action test, not proof of production database rollback, live execution, or scheduled reliability. The earlier expert's 55-test Node-adapted signoff remains external Phase 1 evidence and is not relabeled as a native Phase 2A run.
