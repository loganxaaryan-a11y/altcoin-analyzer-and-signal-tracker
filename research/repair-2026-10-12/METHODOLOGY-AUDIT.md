# Methodology audit — frozen review map

Date: 2026-10-12. This is a source-grounded map for expert review, not a tuned replacement strategy. No thresholds, weights, holdouts, or issued contracts were changed.

## Candidate → evaluation map

1. **Candidate selection.** `resolveDiscoveryDirection` (`server/src/actions.ts`) converts measured 1H/24H/7D/14D/30D/200D returns into a weighted direction vote. `fiveDimensionGate` then assesses trend, momentum, realized volatility, size-aware spot turnover, positioning/funding, network fundamentals, and supply overhang. The source comments and evidence strings explicitly make volatility, network fundamentals, and supply overhang direction-agnostic quality/risk gates; they affect eligibility/ranking, not the sign of the direction vote.
2. **Dossier direction and factor scoring.** `scoreDossierFactors` (`server/src/signal-methodology.ts`) sums signed factor contributions and selects the side with the larger alignment score. `replayDossierDecision` reconstructs the decision from the frozen input snapshot without network access.
3. **Theory promotion.** `scoreTheoryLayers` keeps measured disagreement and insufficient evidence visible. `buildFactorAgreementLayer`, `smartMoneyVerification`, `buildDefiLlamaLayer`, `buildBinanceFuturesLayer`, and `buildCrowdPricingLayer` carry source keys or provenance text. The factor layer reuses price history (7D, 30D, SMA50); it must not be counted as independent of chart evidence. Open signals/theories influence discovery coverage reasons in `buildDiscoveryUniverse`, so coverage expansion can form a feedback loop; it does not itself change the fixed factor score.
4. **Issuance.** `issueSignalFromDossier` / the signal-contract path freezes entry, stop, targets, direction, input snapshot, evaluator version and build marker. `evaluateBornDead` can suppress a contract whose signal-day candle had already breached invalidation. Contracts and original generated rows remain immutable; corrections append to `signalEvaluationRevisions` and `signalOutcomeEvents`.
5. **Monitoring.** `refreshMarketData` stores provider event time separately from successful fetch time in `marketDataObservations` and `marketStreamHealth`. `getMarketFreshness` exposes both ages. A current quote is only a monitoring observation.
6. **Evaluation.** `evaluateTradeSetup` (`server/src/signal-methodology.ts`) evaluates first touch only after entry, marks double-touch/entry-straddling/coverage gaps ambiguous or unverified, and applies the declared gap rule. `computeDailySignalSnapshots` appends revisioned trade-setup results and separately appends fixed-horizon direction forecasts. The new `measurement_runs` / `measurement_run_items` checkpoint records freeze cohort membership, cursor, counts, reasons, source rows, failure IDs and retry state.

## Trace status

- **SOL:** the observed presentation defect was reproduced in UI code: a strong green direction could sit beside stale data and scanner-derived sizing language. Direction, eligibility, freshness, validation and cohort are now separate top-level fields; sizing language from the +1/−1 diagnostic is removed. Original issued direction/levels remain unchanged.
- **PLTR:** no persisted PLTR row is asserted by this crypto checkout. The presentation rule is applied generically: agreement score is labelled heuristic, edge unvalidated, research rows unvalidated, and legacy directional sample coverage is not signal validation. A PLTR-specific persisted trace remains an equity-checkout task.
- **STRK:** this checkout has a mover/velocity field in the discovery universe, but this audit did not establish a trustworthy persisted pre-move timestamp. Therefore no pre-move prediction credit is claimed. A post-move mover flag is detection, not prediction.

## Investigations and limits

- Smart-money, chart and factor witnesses can share the same underlying price/positioning observation. They are not independent merely because they appear in separate panels.
- Existing theory/open-signal rows expand full-engine coverage. This is a coverage feedback loop and must stay distinct from evidence that determines direction.
- The long-oriented drawdown/SMA gates and the independent velocity exception remain unchanged. No evidence in this repair justifies lowering the 75% drawdown gate or graduating velocity candidates.
- Runner-recall requires a separately frozen universe, threshold, horizon, detection deadline, qualification and deduplication rule. It remains separate from issued-call recall.

## Frozen next experiment proposal — not executed

Create a **velocity/reversal research cohort** with: closed daily-bar cutoff; next available executable venue quote after cutoff as entry; ATR-based invalidation fixed at entry; fixed 5D/14D expiry; minimum verified history, spot liquidity, timestamp and risk-data eligibility; 18 bps disclosed round-trip cost plus funding left unverified until observed; comparators of always-long BTC beta, seeded random entry and the frozen existing scanner; unmatched/missing cases retained as unverified; same-asset overlapping windows deduplicated; cross-asset dependence disclosed; every candidate and rejection logged prospectively; no promotion until the separately preregistered trial closes. Holdouts remain locked.
