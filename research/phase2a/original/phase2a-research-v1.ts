export const PHASE2A_VERSION = "crypto-phase2a-ohlcv-research-v1";
export const PHASE2A_COHORT = "phase2a-offline-crypto-direction-forecast";
export const DAY_MS = 86_400_000;
export const BAR_AVAILABILITY_LAG_MS = 5 * 60_000;

export type ResearchDirection = "long" | "short" | "abstain";
export type HypothesisId = "trend_continuation" | "breakout_volume";
export type Horizon = 5 | 30;
export type FoldId = "validation_1" | "validation_2" | "validation_3";

export type ResearchBar = {
  instrumentId: string;
  symbol: string;
  venue: "Binance Spot";
  quoteCurrency: "USDT";
  exchangeCalendar: "24/7 UTC";
  source: "Binance market-data-only API";
  interval: "1d";
  eventTime: number;
  endTime: number;
  availableAt: number;
  retrievedAt: number;
  adjustmentBasis: "unadjusted venue spot";
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type FrozenCryptoResearchSpec = {
  version: typeof PHASE2A_VERSION;
  cohort: typeof PHASE2A_COHORT;
  market: "crypto";
  universe: ReadonlyArray<{ instrumentId: string; symbol: string; venue: "Binance Spot"; quoteCurrency: "USDT" }>;
  dateRange: { start: string; validationEnd: string; holdoutStart: string; holdoutEnd: string };
  folds: ReadonlyArray<{ id: FoldId; start: string; end: string }>;
  horizons: readonly [5, 30];
  timing: { interval: "1d"; calendar: "24/7 UTC"; availabilityLagMs: number; entry: string; exit: string };
  hypotheses: ReadonlyArray<{ id: HypothesisId; parameters: Readonly<Record<string, number | string>> }>;
  costs: { centralRoundTripBps: number; stressedRoundTripBps: number; shortFunding: "unsupported"; executionStatus: "hypothetical" };
  baselines: readonly ["always_long", "always_short", "sma200_direction", "cash"];
  selection: { objective: string; minimumIssued: number; minimumAssets: number; minimumDecisionDates: number; requiredLowerBoundVsBestDirectionalBaseline: number; tieBreak: "trend_continuation" };
  uncertainty: { method: string; blockDays: 30; resamples: 500; seed: number };
  holdout: { locked: true; normalCommandMayEvaluate: false };
  sampleQualification: "survivor-sample exploratory";
};

export const FROZEN_CRYPTO_SPEC: FrozenCryptoResearchSpec = {
  version: PHASE2A_VERSION,
  cohort: PHASE2A_COHORT,
  market: "crypto",
  universe: [
    { instrumentId: "BTCUSDT", symbol: "BTC", venue: "Binance Spot", quoteCurrency: "USDT" },
    { instrumentId: "ETHUSDT", symbol: "ETH", venue: "Binance Spot", quoteCurrency: "USDT" },
    { instrumentId: "SOLUSDT", symbol: "SOL", venue: "Binance Spot", quoteCurrency: "USDT" },
    { instrumentId: "LINKUSDT", symbol: "LINK", venue: "Binance Spot", quoteCurrency: "USDT" },
    { instrumentId: "DOGEUSDT", symbol: "DOGE", venue: "Binance Spot", quoteCurrency: "USDT" },
    { instrumentId: "XRPUSDT", symbol: "XRP", venue: "Binance Spot", quoteCurrency: "USDT" },
    { instrumentId: "AVAXUSDT", symbol: "AVAX", venue: "Binance Spot", quoteCurrency: "USDT" },
    { instrumentId: "ADAUSDT", symbol: "ADA", venue: "Binance Spot", quoteCurrency: "USDT" },
    { instrumentId: "SUIUSDT", symbol: "SUI", venue: "Binance Spot", quoteCurrency: "USDT" },
  ],
  dateRange: { start: "2019-01-01", validationEnd: "2024-12-31", holdoutStart: "2025-01-01", holdoutEnd: "2026-09-30" },
  folds: [
    { id: "validation_1", start: "2023-01-01", end: "2023-06-30" },
    { id: "validation_2", start: "2023-07-01", end: "2023-12-31" },
    { id: "validation_3", start: "2024-01-01", end: "2024-12-31" },
  ],
  horizons: [5, 30],
  timing: {
    interval: "1d",
    calendar: "24/7 UTC",
    availabilityLagMs: BAR_AVAILABILITY_LAG_MS,
    entry: "first Binance daily open whose event time is not earlier than the completed feature bar's inferred availability time",
    exit: "terminal Binance close after H complete 24-hour intervals beginning at the eligible entry open",
  },
  hypotheses: [
    { id: "trend_continuation", parameters: { smaBars: 200, returnBars: 20, equality: "abstain" } },
    { id: "breakout_volume", parameters: { smaBars: 200, breakoutBars: 20, volumeMedianBars: 20, volumeMultiple: 1.5, currentBarExcludedFromReferences: "true" } },
  ],
  costs: { centralRoundTripBps: 18, stressedRoundTripBps: 36, shortFunding: "unsupported", executionStatus: "hypothetical" },
  baselines: ["always_long", "always_short", "sma200_direction", "cash"],
  selection: { objective: "pooled out-of-fold mean modeled signed return under central costs", minimumIssued: 100, minimumAssets: 3, minimumDecisionDates: 30, requiredLowerBoundVsBestDirectionalBaseline: 0, tieBreak: "trend_continuation" },
  uncertainty: { method: "deterministic UTC decision-date moving-block bootstrap preserving the cross-asset panel", blockDays: 30, resamples: 500, seed: 20261009 },
  holdout: { locked: true, normalCommandMayEvaluate: false },
  sampleQualification: "survivor-sample exploratory",
};

export type ExclusionReason = "warmup" | "incoherent_ohlcv" | "gap_in_feature_window" | "missing_or_zero_volume" | "entry_unavailable" | "horizon_unmatured" | "gap_in_label_window" | "outside_validation" | "holdout_locked";
export type ResearchObservation = {
  cohort: typeof PHASE2A_COHORT;
  strategy: HypothesisId;
  horizon: Horizon;
  fold: FoldId | "holdout_locked" | "outside_validation";
  instrumentId: string;
  symbol: string;
  direction: Exclude<ResearchDirection, "abstain">;
  featureCutoff: number;
  decisionTime: number;
  entryTime: number;
  entryPrice: number;
  horizonEnd: number;
  labelAvailableAt: number;
  exitPrice: number;
  grossSignedReturn: number;
  centralNetSignedReturn: number;
  stressedNetSignedReturn: number;
  hit: boolean;
  flat: boolean;
  sma200: number;
  baselineReturns: { alwaysLong: number; alwaysShort: number; sma200Direction: number; cash: 0 };
};

interface FullScheduleBaselineRow { decisionTime: number; alwaysLong: number; alwaysShort: number; sma200Direction: number }
type DirectionalBaselineId = "always_long" | "always_short" | "sma200_direction";

export type CandidateFoldReport = {
  strategy: HypothesisId;
  horizon: Horizon;
  fold: FoldId | "pooled";
  eligibleObservations: number;
  issuedDecisions: number;
  abstentions: number;
  exclusions: Record<ExclusionReason, number>;
  maturedLabels: number;
  pendingLabels: number;
  unverifiedLabels: number;
  long: number;
  short: number;
  hits: number;
  flat: number;
  directionalHitRate: number | null;
  meanGrossSignedReturn: number | null;
  medianGrossSignedReturn: number | null;
  meanCentralNetSignedReturn: number | null;
  meanStressedNetSignedReturn: number | null;
  downsideP05: number | null;
  standardDeviation: number | null;
  uniqueAssets: number;
  uniqueDecisionDates: number;
  overlappingExposureCount: number;
  matchedBaselines: { alwaysLongMean: number | null; alwaysShortMean: number | null; sma200DirectionMean: number | null; cashMean: 0; bestDirectional: "always_long" | "always_short" | "sma200_direction" | null; differenceVsBestDirectional: number | null };
  fullScheduleBaselines: { eligibleLabeledRows: number; alwaysLongMean: number | null; alwaysShortMean: number | null; sma200DirectionMean: number | null; cashMean: 0; bestDirectional: "always_long" | "always_short" | "sma200_direction" | null; differenceVsBestDirectional: number | null };
  uncertainty: { meanCentralNet: [number, number] | null; differenceVsBestDirectional: [number, number] | null; method: string; blocks: number };
};

export type Phase2AResult = {
  version: typeof PHASE2A_VERSION;
  cohort: typeof PHASE2A_COHORT;
  generatedAt: string;
  specHash: string;
  datasetManifestHash: string;
  dataset: {
    source: "Binance market-data-only API";
    venue: "Binance Spot";
    quoteCurrency: "USDT";
    sampleQualification: "survivor-sample exploratory";
    instruments: Array<{ instrumentId: string; symbol: string; rows: number; firstEventTime: number | null; lastEventTime: number | null; gaps: number; duplicates: number; incoherent: number; rawHash: string }>;
    totalRows: number;
    retrievedAt: number | null;
    exclusions: Record<ExclusionReason, number>;
  };
  reports: CandidateFoldReport[];
  selection: Array<{ horizon: Horizon; selected: HypothesisId | null; qualified: boolean; reason: string; candidates: Array<{ strategy: HypothesisId; meanCentralNet: number | null; lowerBoundVsBestDirectional: number | null; issued: number; uniqueAssets: number; uniqueDecisionDates: number }> }>;
  holdout: { locked: true; start: string; end: string; featureEligibleRows: number; issuedWithoutLabels: Record<string, number>; datasetManifestHash: string; performanceOpened: false };
  observations: ResearchObservation[];
  notes: string[];
};

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

export async function sha256(value: unknown): Promise<string> {
  const encoded = new TextEncoder().encode(typeof value === "string" ? value : stableJson(value));
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function dateMs(value: string): number { return Date.parse(`${value}T00:00:00.000Z`); }
function utcDay(ts: number): string { return new Date(ts).toISOString().slice(0, 10); }
function finitePositive(value: number): boolean { return Number.isFinite(value) && value > 0; }
function coherent(bar: ResearchBar): boolean {
  return finitePositive(bar.open) && finitePositive(bar.high) && finitePositive(bar.low) && finitePositive(bar.close) && Number.isFinite(bar.volume) && bar.volume >= 0
    && bar.high >= Math.max(bar.open, bar.close, bar.low) && bar.low <= Math.min(bar.open, bar.close, bar.high)
    && bar.endTime - bar.eventTime === DAY_MS && bar.availableAt >= bar.endTime;
}
function average(values: number[]): number | null { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; }
function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); const value = sorted[middle];
  if (value === undefined) return null;
  if (sorted.length % 2 === 1) return value;
  const prior = sorted[middle - 1]; return prior === undefined ? null : (prior + value) / 2;
}
function percentile(values: number[], fraction: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b); const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(fraction * (sorted.length - 1))));
  return sorted[index] ?? null;
}
function stdev(values: number[]): number | null {
  const mean = average(values); if (mean === null || values.length < 2) return null;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1));
}
function contiguous(bars: ResearchBar[]): boolean {
  for (let index = 1; index < bars.length; index++) { const row = bars[index]; const prior = bars[index - 1]; if (!row || !prior || row.eventTime - prior.eventTime !== DAY_MS) return false; }
  return true;
}
function sma(bars: ResearchBar[], endIndex: number, length: number): number | null {
  const start = endIndex - length + 1; if (start < 0) return null;
  const window = bars.slice(start, endIndex + 1); if (window.length !== length || !contiguous(window)) return null;
  return average(window.map((bar) => bar.close));
}
function foldFor(decisionTime: number): FoldId | "holdout_locked" | "outside_validation" {
  if (decisionTime >= dateMs(FROZEN_CRYPTO_SPEC.dateRange.holdoutStart) && decisionTime <= dateMs(FROZEN_CRYPTO_SPEC.dateRange.holdoutEnd) + DAY_MS - 1) return "holdout_locked";
  for (const fold of FROZEN_CRYPTO_SPEC.folds) if (decisionTime >= dateMs(fold.start) && decisionTime <= dateMs(fold.end) + DAY_MS - 1) return fold.id;
  return "outside_validation";
}
function directionFor(strategy: HypothesisId, bars: ResearchBar[], index: number, latestSma: number): ResearchDirection {
  const current = bars[index]; const returnReference = bars[index - 20]; if (!current || !returnReference) return "abstain";
  if (strategy === "trend_continuation") {
    const return20 = current.close / returnReference.close - 1;
    if (current.close > latestSma && return20 > 0) return "long";
    if (current.close < latestSma && return20 < 0) return "short";
    return "abstain";
  }
  const prior = bars.slice(index - 20, index); if (prior.length !== 20 || !contiguous(prior)) return "abstain";
  const volumeReference = median(prior.map((bar) => bar.volume));
  if (volumeReference === null || !(volumeReference > 0) || !(current.volume > 0) || current.volume < 1.5 * volumeReference) return "abstain";
  const priorHigh = Math.max(...prior.map((bar) => bar.high)); const priorLow = Math.min(...prior.map((bar) => bar.low));
  if (current.close > priorHigh && current.close > latestSma) return "long";
  if (current.close < priorLow && current.close < latestSma) return "short";
  return "abstain";
}
function signedReturn(direction: Exclude<ResearchDirection, "abstain">, entry: number, exit: number): number { return direction === "long" ? (exit - entry) / entry : (entry - exit) / entry; }
function emptyExclusions(): Record<ExclusionReason, number> { return { warmup: 0, incoherent_ohlcv: 0, gap_in_feature_window: 0, missing_or_zero_volume: 0, entry_unavailable: 0, horizon_unmatured: 0, gap_in_label_window: 0, outside_validation: 0, holdout_locked: 0 }; }
function addExclusion(target: Record<ExclusionReason, number>, reason: ExclusionReason): void { target[reason] += 1; }

function xorshift(seed: number): () => number { let state = seed >>> 0 || 1; return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4_294_967_296; }; }
function bootstrapInterval(rows: ResearchObservation[], selector: (row: ResearchObservation) => number, seedOffset: number): { interval: [number, number] | null; blocks: number } {
  const byDate = new Map<string, ResearchObservation[]>(); for (const row of rows) { const key = utcDay(row.decisionTime); const list = byDate.get(key) ?? []; list.push(row); byDate.set(key, list); }
  const dates = [...byDate.keys()].sort(); if (!dates.length) return { interval: null, blocks: 0 };
  const blocks: string[][] = []; for (let index = 0; index < dates.length; index += FROZEN_CRYPTO_SPEC.uncertainty.blockDays) blocks.push(dates.slice(index, index + FROZEN_CRYPTO_SPEC.uncertainty.blockDays));
  if (blocks.length < 2) return { interval: null, blocks: blocks.length };
  const random = xorshift(FROZEN_CRYPTO_SPEC.uncertainty.seed + seedOffset); const estimates: number[] = [];
  for (let iteration = 0; iteration < FROZEN_CRYPTO_SPEC.uncertainty.resamples; iteration++) {
    const sample: ResearchObservation[] = [];
    for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) { const chosen = blocks[Math.floor(random() * blocks.length)]; if (!chosen) continue; for (const date of chosen) sample.push(...(byDate.get(date) ?? [])); }
    const estimate = average(sample.map(selector)); if (estimate !== null) estimates.push(estimate);
  }
  const low = percentile(estimates, 0.025); const high = percentile(estimates, 0.975); return { interval: low === null || high === null ? null : [low, high], blocks: blocks.length };
}

function bestDirectional(means: Record<DirectionalBaselineId, number | null>): { id: DirectionalBaselineId | null; mean: number | null } {
  const ranked = (Object.entries(means) as Array<[DirectionalBaselineId, number | null]>).filter((entry): entry is [DirectionalBaselineId, number] => entry[1] !== null).sort((a, b) => b[1] - a[1]);
  return ranked[0] ? { id: ranked[0][0], mean: ranked[0][1] } : { id: null, mean: null };
}
function summarize(strategy: HypothesisId, horizon: Horizon, fold: FoldId | "pooled", rows: ResearchObservation[], fullScheduleRows: FullScheduleBaselineRow[], eligible: number, abstentions: number, exclusions: Record<ExclusionReason, number>): CandidateFoldReport {
  const gross = rows.map((row) => row.grossSignedReturn); const central = rows.map((row) => row.centralNetSignedReturn); const stressed = rows.map((row) => row.stressedNetSignedReturn); const candidateMean = average(central);
  const matchedMeans = { always_long: average(rows.map((row) => row.baselineReturns.alwaysLong)), always_short: average(rows.map((row) => row.baselineReturns.alwaysShort)), sma200_direction: average(rows.map((row) => row.baselineReturns.sma200Direction)) }; const matchedBest = bestDirectional(matchedMeans);
  const fullMeans = { always_long: average(fullScheduleRows.map((row) => row.alwaysLong)), always_short: average(fullScheduleRows.map((row) => row.alwaysShort)), sma200_direction: average(fullScheduleRows.map((row) => row.sma200Direction)) }; const fullBest = bestDirectional(fullMeans);
  const dateCounts = new Map<string, number>(); for (const row of rows) { const key = utcDay(row.decisionTime); dateCounts.set(key, (dateCounts.get(key) ?? 0) + 1); }
  const netInterval = bootstrapInterval(rows, (row) => row.centralNetSignedReturn, horizon * 17 + (strategy === "trend_continuation" ? 1 : 2));
  const diffInterval = matchedBest.id ? bootstrapInterval(rows, (row) => row.centralNetSignedReturn - (matchedBest.id === "always_long" ? row.baselineReturns.alwaysLong : matchedBest.id === "always_short" ? row.baselineReturns.alwaysShort : row.baselineReturns.sma200Direction), horizon * 31 + (strategy === "trend_continuation" ? 3 : 4)) : { interval: null, blocks: 0 };
  const nonFlat = rows.filter((row) => !row.flat);
  return {
    strategy, horizon, fold, eligibleObservations: eligible, issuedDecisions: rows.length, abstentions, exclusions: { ...exclusions }, maturedLabels: rows.length, pendingLabels: exclusions.horizon_unmatured, unverifiedLabels: exclusions.gap_in_label_window,
    long: rows.filter((row) => row.direction === "long").length, short: rows.filter((row) => row.direction === "short").length, hits: rows.filter((row) => row.hit).length, flat: rows.filter((row) => row.flat).length,
    directionalHitRate: nonFlat.length ? nonFlat.filter((row) => row.hit).length / nonFlat.length : null,
    meanGrossSignedReturn: average(gross), medianGrossSignedReturn: median(gross), meanCentralNetSignedReturn: candidateMean, meanStressedNetSignedReturn: average(stressed), downsideP05: percentile(central, 0.05), standardDeviation: stdev(central),
    uniqueAssets: new Set(rows.map((row) => row.instrumentId)).size, uniqueDecisionDates: dateCounts.size, overlappingExposureCount: [...dateCounts.values()].filter((count) => count > 1).reduce((sum, count) => sum + count, 0),
    matchedBaselines: { alwaysLongMean: matchedMeans.always_long, alwaysShortMean: matchedMeans.always_short, sma200DirectionMean: matchedMeans.sma200_direction, cashMean: 0, bestDirectional: matchedBest.id, differenceVsBestDirectional: candidateMean === null || matchedBest.mean === null ? null : candidateMean - matchedBest.mean },
    fullScheduleBaselines: { eligibleLabeledRows: fullScheduleRows.length, alwaysLongMean: fullMeans.always_long, alwaysShortMean: fullMeans.always_short, sma200DirectionMean: fullMeans.sma200_direction, cashMean: 0, bestDirectional: fullBest.id, differenceVsBestDirectional: candidateMean === null || fullBest.mean === null ? null : candidateMean - fullBest.mean },
    uncertainty: { meanCentralNet: netInterval.interval, differenceVsBestDirectional: diffInterval.interval, method: `${FROZEN_CRYPTO_SPEC.uncertainty.method}; candidate minus best preselected matched emitted-timestamp directional baseline`, blocks: Math.min(netInterval.blocks, diffInterval.blocks) },
  };
}

export async function runPhase2AResearch(inputBars: ResearchBar[], options: { allowHoldout?: boolean } = {}): Promise<Phase2AResult> {
  if (options.allowHoldout) throw new Error("LOCKED_HOLDOUT: the Phase 2A validation command cannot evaluate final holdout performance.");
  const specHash = await sha256(FROZEN_CRYPTO_SPEC);
  const datasetExclusions = emptyExclusions(); const byInstrument = new Map<string, ResearchBar[]>();
  const allowed = new Set(FROZEN_CRYPTO_SPEC.universe.map((row) => row.instrumentId));
  for (const bar of inputBars) if (allowed.has(bar.instrumentId) && bar.venue === "Binance Spot" && bar.quoteCurrency === "USDT" && bar.source === "Binance market-data-only API") { const list = byInstrument.get(bar.instrumentId) ?? []; list.push(bar); byInstrument.set(bar.instrumentId, list); }
  const manifestInstruments: Phase2AResult["dataset"]["instruments"] = []; const canonicalBars: ResearchBar[] = [];
  for (const member of FROZEN_CRYPTO_SPEC.universe) {
    const sourceRows = [...(byInstrument.get(member.instrumentId) ?? [])].sort((a, b) => a.eventTime - b.eventTime); const rows: ResearchBar[] = []; let duplicates = 0; let incoherent = 0; let gaps = 0; let priorTime: number | null = null;
    for (const row of sourceRows) {
      if (!coherent(row)) { incoherent++; addExclusion(datasetExclusions, "incoherent_ohlcv"); continue; }
      if (priorTime === row.eventTime) { duplicates++; continue; }
      if (priorTime !== null && row.eventTime - priorTime !== DAY_MS) gaps++;
      rows.push(row); priorTime = row.eventTime;
    }
    canonicalBars.push(...rows);
    manifestInstruments.push({ instrumentId: member.instrumentId, symbol: member.symbol, rows: rows.length, firstEventTime: rows[0]?.eventTime ?? null, lastEventTime: rows.at(-1)?.eventTime ?? null, gaps, duplicates, incoherent, rawHash: await sha256(rows) });
  }
  canonicalBars.sort((a, b) => a.instrumentId.localeCompare(b.instrumentId) || a.eventTime - b.eventTime);
  const datasetManifest = { version: PHASE2A_VERSION, specHash, source: "Binance market-data-only API", instruments: manifestInstruments, totalRows: canonicalBars.length };
  const datasetManifestHash = await sha256(datasetManifest);
  const observations: ResearchObservation[] = []; const reportInputs = new Map<string, { eligible: number; abstentions: number; exclusions: Record<ExclusionReason, number> }>(); const holdoutIssued: Record<string, number> = {}; let holdoutFeatureEligibleRows = 0;
  const reportKey = (strategy: HypothesisId, horizon: Horizon, fold: FoldId | "pooled") => `${strategy}|${horizon}|${fold}`;
  const ensureInput = (key: string) => { const existing = reportInputs.get(key); if (existing) return existing; const created = { eligible: 0, abstentions: 0, exclusions: emptyExclusions() }; reportInputs.set(key, created); return created; };

  for (const member of FROZEN_CRYPTO_SPEC.universe) {
    const bars = canonicalBars.filter((bar) => bar.instrumentId === member.instrumentId);
    for (let index = 0; index < bars.length; index++) {
      const current = bars[index]; if (!current) continue;
      const fold = foldFor(current.availableAt);
      const featureWindow = bars.slice(index - 199, index + 1);
      const latestSma = sma(bars, index, 200);
      for (const strategyRow of FROZEN_CRYPTO_SPEC.hypotheses) for (const horizon of FROZEN_CRYPTO_SPEC.horizons) {
        const strategy = strategyRow.id; const foldInput = fold === "validation_1" || fold === "validation_2" || fold === "validation_3" ? ensureInput(reportKey(strategy, horizon, fold)) : null;
        const pooledInput = ensureInput(reportKey(strategy, horizon, "pooled"));
        const recordExclusion = (reason: ExclusionReason) => { if (foldInput) addExclusion(foldInput.exclusions, reason); addExclusion(pooledInput.exclusions, reason); addExclusion(datasetExclusions, reason); };
        if (latestSma === null || featureWindow.length !== 200) { if (foldInput) recordExclusion("warmup"); continue; }
        if (!contiguous(featureWindow)) { if (foldInput) recordExclusion("gap_in_feature_window"); continue; }
        if (strategy === "breakout_volume" && (current.volume <= 0 || bars.slice(index - 20, index).some((bar) => bar.volume <= 0))) { if (foldInput) recordExclusion("missing_or_zero_volume"); continue; }
        if (fold === "outside_validation") { addExclusion(datasetExclusions, "outside_validation"); continue; }
        if (foldInput) { foldInput.eligible++; pooledInput.eligible++; }
        const direction = directionFor(strategy, bars, index, latestSma);
        if (fold === "holdout_locked") {
          holdoutFeatureEligibleRows++;
          if (direction !== "abstain") holdoutIssued[`${strategy}|${horizon}`] = (holdoutIssued[`${strategy}|${horizon}`] ?? 0) + 1;
          addExclusion(datasetExclusions, "holdout_locked");
          continue;
        }
        if (!foldInput) continue;
        if (direction === "abstain") { foldInput.abstentions++; pooledInput.abstentions++; continue; }
        let entryIndex = index + 1; while (entryIndex < bars.length && (bars[entryIndex]?.eventTime ?? Number.POSITIVE_INFINITY) < current.availableAt) entryIndex++;
        const entryBar = bars[entryIndex]; if (!entryBar) { recordExclusion("entry_unavailable"); continue; }
        const exitIndex = entryIndex + horizon - 1; const exitBar = bars[exitIndex]; if (!exitBar) { recordExclusion("horizon_unmatured"); continue; }
        const labelWindow = bars.slice(entryIndex, exitIndex + 1); if (labelWindow.length !== horizon || !contiguous(labelWindow)) { recordExclusion("gap_in_label_window"); continue; }
        const foldDefinition = FROZEN_CRYPTO_SPEC.folds.find((row) => row.id === fold); if (!foldDefinition || exitBar.availableAt > dateMs(foldDefinition.end) + DAY_MS) { recordExclusion("horizon_unmatured"); continue; }
        const gross = signedReturn(direction, entryBar.open, exitBar.close); const central = gross - FROZEN_CRYPTO_SPEC.costs.centralRoundTripBps / 10_000; const stressed = gross - FROZEN_CRYPTO_SPEC.costs.stressedRoundTripBps / 10_000;
        const alwaysLong = signedReturn("long", entryBar.open, exitBar.close) - FROZEN_CRYPTO_SPEC.costs.centralRoundTripBps / 10_000; const alwaysShort = signedReturn("short", entryBar.open, exitBar.close) - FROZEN_CRYPTO_SPEC.costs.centralRoundTripBps / 10_000; const baselineDirection: "long" | "short" = current.close >= latestSma ? "long" : "short";
        observations.push({ cohort: PHASE2A_COHORT, strategy, horizon, fold, instrumentId: member.instrumentId, symbol: member.symbol, direction, featureCutoff: current.endTime, decisionTime: current.availableAt, entryTime: entryBar.eventTime, entryPrice: entryBar.open, horizonEnd: exitBar.endTime, labelAvailableAt: exitBar.availableAt, exitPrice: exitBar.close, grossSignedReturn: gross, centralNetSignedReturn: central, stressedNetSignedReturn: stressed, hit: gross > 0, flat: gross === 0, sma200: latestSma, baselineReturns: { alwaysLong, alwaysShort, sma200Direction: baselineDirection === "long" ? alwaysLong : alwaysShort, cash: 0 } });
      }
    }
  }

  const fullScheduleRows: Array<FullScheduleBaselineRow & { horizon: Horizon; fold: FoldId }> = [];
  for (const member of FROZEN_CRYPTO_SPEC.universe) {
    const bars = canonicalBars.filter((bar) => bar.instrumentId === member.instrumentId);
    for (let index = 0; index < bars.length; index++) {
      const current = bars[index]; if (!current) continue; const fold = foldFor(current.availableAt); if (fold !== "validation_1" && fold !== "validation_2" && fold !== "validation_3") continue;
      const latestSma = sma(bars, index, 200); const featureWindow = bars.slice(index - 199, index + 1); if (latestSma === null || featureWindow.length !== 200 || !contiguous(featureWindow)) continue;
      let entryIndex = index + 1; while (entryIndex < bars.length && (bars[entryIndex]?.eventTime ?? Number.POSITIVE_INFINITY) < current.availableAt) entryIndex++; const entryBar = bars[entryIndex]; if (!entryBar) continue;
      for (const horizon of FROZEN_CRYPTO_SPEC.horizons) { const exitIndex = entryIndex + horizon - 1; const exitBar = bars[exitIndex]; if (!exitBar) continue; const labelWindow = bars.slice(entryIndex, exitIndex + 1); if (labelWindow.length !== horizon || !contiguous(labelWindow)) continue; const foldDefinition = FROZEN_CRYPTO_SPEC.folds.find((row) => row.id === fold); if (!foldDefinition || exitBar.availableAt > dateMs(foldDefinition.end) + DAY_MS) continue;
        const fee = FROZEN_CRYPTO_SPEC.costs.centralRoundTripBps / 10_000; const alwaysLong = signedReturn("long", entryBar.open, exitBar.close) - fee; const alwaysShort = signedReturn("short", entryBar.open, exitBar.close) - fee; fullScheduleRows.push({ horizon, fold, decisionTime: current.availableAt, alwaysLong, alwaysShort, sma200Direction: current.close >= latestSma ? alwaysLong : alwaysShort });
      }
    }
  }
  const reports: CandidateFoldReport[] = [];
  for (const hypothesis of FROZEN_CRYPTO_SPEC.hypotheses) for (const horizon of FROZEN_CRYPTO_SPEC.horizons) {
    for (const fold of FROZEN_CRYPTO_SPEC.folds) { const key = reportKey(hypothesis.id, horizon, fold.id); const input = ensureInput(key); reports.push(summarize(hypothesis.id, horizon, fold.id, observations.filter((row) => row.strategy === hypothesis.id && row.horizon === horizon && row.fold === fold.id), fullScheduleRows.filter((row) => row.horizon === horizon && row.fold === fold.id), input.eligible, input.abstentions, input.exclusions)); }
    const pooled = ensureInput(reportKey(hypothesis.id, horizon, "pooled")); reports.push(summarize(hypothesis.id, horizon, "pooled", observations.filter((row) => row.strategy === hypothesis.id && row.horizon === horizon), fullScheduleRows.filter((row) => row.horizon === horizon), pooled.eligible, pooled.abstentions, pooled.exclusions));
  }
  const selection = FROZEN_CRYPTO_SPEC.horizons.map((horizon) => {
    const candidates = FROZEN_CRYPTO_SPEC.hypotheses.map((hypothesis) => reports.find((report) => report.strategy === hypothesis.id && report.horizon === horizon && report.fold === "pooled")).filter((report): report is CandidateFoldReport => Boolean(report)).map((report) => ({ strategy: report.strategy, meanCentralNet: report.meanCentralNetSignedReturn, lowerBoundVsBestDirectional: report.uncertainty.differenceVsBestDirectional?.[0] ?? null, issued: report.issuedDecisions, uniqueAssets: report.uniqueAssets, uniqueDecisionDates: report.uniqueDecisionDates }));
    const qualified = candidates.filter((row) => row.meanCentralNet !== null && row.meanCentralNet > 0 && row.lowerBoundVsBestDirectional !== null && row.lowerBoundVsBestDirectional > FROZEN_CRYPTO_SPEC.selection.requiredLowerBoundVsBestDirectionalBaseline && row.issued >= FROZEN_CRYPTO_SPEC.selection.minimumIssued && row.uniqueAssets >= FROZEN_CRYPTO_SPEC.selection.minimumAssets && row.uniqueDecisionDates >= FROZEN_CRYPTO_SPEC.selection.minimumDecisionDates).sort((a, b) => (b.meanCentralNet ?? -Infinity) - (a.meanCentralNet ?? -Infinity) || (a.strategy === FROZEN_CRYPTO_SPEC.selection.tieBreak ? -1 : 1));
    const winner = qualified[0] ?? null;
    return { horizon, selected: winner?.strategy ?? null, qualified: Boolean(winner), reason: winner ? "Predeclared validation rule passed; this qualifies only for holdout review, not promotion." : "No candidate cleared the predeclared sample, positive net-return, and block-bootstrap baseline-difference checks.", candidates };
  });
  const retrievedTimes = canonicalBars.map((bar) => bar.retrievedAt).filter(Number.isFinite);
  return {
    version: PHASE2A_VERSION, cohort: PHASE2A_COHORT, generatedAt: new Date().toISOString(), specHash, datasetManifestHash,
    dataset: { source: "Binance market-data-only API", venue: "Binance Spot", quoteCurrency: "USDT", sampleQualification: "survivor-sample exploratory", instruments: manifestInstruments, totalRows: canonicalBars.length, retrievedAt: retrievedTimes.length ? Math.max(...retrievedTimes) : null, exclusions: datasetExclusions },
    reports, selection,
    holdout: { locked: true, start: FROZEN_CRYPTO_SPEC.dateRange.holdoutStart, end: FROZEN_CRYPTO_SPEC.dateRange.holdoutEnd, featureEligibleRows: holdoutFeatureEligibleRows, issuedWithoutLabels: holdoutIssued, datasetManifestHash, performanceOpened: false },
    observations,
    notes: [
      "This is a new OHLCV-only strategy experiment, not a historical replay of the live dossier model.",
      "The fixed universe is a current-survivor sample; delisted assets and historical whole-market membership are unavailable from this source path.",
      "Short returns are directional hypotheticals. Borrow, funding, locate availability and execution feasibility are unsupported and not included.",
      "Signals overlap across assets and dates. Event returns are not summed or annualized as a portfolio.",
      "The final chronological holdout remains locked; this result contains no holdout labels or performance.",
    ],
  };
}

export function phase2AResultWithoutObservations(result: Phase2AResult): Omit<Phase2AResult, "observations"> & { observationCount: number } {
  const { observations, ...summary } = result; return { ...summary, observationCount: observations.length };
}
