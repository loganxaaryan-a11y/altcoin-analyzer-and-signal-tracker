import { BAR_AVAILABILITY_LAG_MS, DAY_MS, FROZEN_CRYPTO_SPEC, SYNTHETIC_CONTROL_COHORT, evaluateDatePanel, runPhase2AResearch, type ResearchBar } from "./phase2a-research";

export type SyntheticControlKind = "positive" | "negative";
export type SyntheticControlRow = {
  cohort: typeof SYNTHETIC_CONTROL_COHORT;
  control: SyntheticControlKind;
  seed: number;
  asset: string;
  featureTime: number;
  decisionTime: number;
  labelTime: number;
  preDecisionFeature: -1 | 1;
  direction: "long" | "short";
  laterAssetReturn: number;
  grossSignedReturn: number;
  centralNetSignedReturn: number;
  alwaysLongCentralNet: number;
  alwaysShortCentralNet: number;
};

export type SyntheticControlReport = {
  version: "phase2a1-synthetic-controls-v1";
  cohort: typeof SYNTHETIC_CONTROL_COHORT;
  generatedAt: string;
  design: {
    positive: string;
    negative: string;
    futureInformationUsed: false;
    separation: string;
    qualificationRule: string;
    matchedSmaQualificationLimitation: string;
  };
  positive: ControlSeedReport;
  negative: { seeds: number[]; reports: ControlSeedReport[]; falseQualifications: number; falseQualificationRate: number };
};

type ControlSeedReport = {
  control: SyntheticControlKind;
  seed: number;
  rows: number;
  uniqueAssets: number;
  uniqueDecisionDates: number;
  meanCentralNet: number;
  bestDirectionalBaseline: "always_long" | "always_short";
  bestDirectionalBaselineMean: number;
  meanDifference: number;
  differenceInterval95: [number, number] | null;
  completeBlocks: number;
  tailDatesExcluded: number;
  qualified: boolean;
};

const CONTROL_START = Date.parse("2020-01-01T00:00:00.000Z");
const ASSETS = ["SYNTH-A", "SYNTH-B", "SYNTH-C", "SYNTH-D"] as const;
const NEGATIVE_SEEDS = [7, 101, 809, 20261009, 424242] as const;

function rng(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4_294_967_296; };
}
function mean(values: number[]): number { return values.reduce((sum, value) => sum + value, 0) / values.length; }
function buildRows(control: SyntheticControlKind, seed: number): SyntheticControlRow[] {
  const featureRandom = rng(seed ^ 0x51f15e); const outcomeNoise = rng(seed ^ 0x91e10da5); const signalRandom = rng(seed ^ 0x4c11db7);
  const rows: SyntheticControlRow[] = [];
  for (let day = 0; day < 720; day++) {
    for (let assetIndex = 0; assetIndex < ASSETS.length; assetIndex++) {
      const asset = ASSETS[assetIndex]; if (!asset) continue;
      // The latent state is generated and recorded before decision. In the positive DGP the later outcome
      // is constructed from that state plus bounded noise; no future label is read by the feature.
      const latent: -1 | 1 = featureRandom() >= 0.5 ? 1 : -1;
      const preDecisionFeature: -1 | 1 = control === "positive" ? latent : signalRandom() >= 0.5 ? 1 : -1;
      const laterAssetReturn = latent * 0.02 + (outcomeNoise() - 0.5) * 0.004;
      const direction = preDecisionFeature === 1 ? "long" : "short";
      const grossSignedReturn = direction === "long" ? laterAssetReturn : -laterAssetReturn;
      const fee = FROZEN_CRYPTO_SPEC.costs.centralRoundTripBps / 10_000;
      const featureTime = CONTROL_START + day * DAY_MS + assetIndex;
      rows.push({ cohort: SYNTHETIC_CONTROL_COHORT, control, seed, asset, featureTime, decisionTime: featureTime + 1, labelTime: featureTime + 5 * DAY_MS, preDecisionFeature, direction, laterAssetReturn, grossSignedReturn, centralNetSignedReturn: grossSignedReturn - fee, alwaysLongCentralNet: laterAssetReturn - fee, alwaysShortCentralNet: -laterAssetReturn - fee });
    }
  }
  return rows;
}

function evaluate(rows: SyntheticControlRow[], control: SyntheticControlKind, seed: number): ControlSeedReport {
  const central = mean(rows.map((row) => row.centralNetSignedReturn));
  const alwaysLong = mean(rows.map((row) => row.alwaysLongCentralNet));
  const alwaysShort = mean(rows.map((row) => row.alwaysShortCentralNet));
  const bestId = alwaysLong >= alwaysShort ? "always_long" as const : "always_short" as const;
  const dateGrid = Array.from({ length: 720 }, (_, day) => new Date(CONTROL_START + day * DAY_MS).toISOString().slice(0, 10));
  const panel = evaluateDatePanel(rows.map((row) => ({ decisionTime: row.decisionTime, candidateReturn: row.centralNetSignedReturn, comparatorReturn: bestId === "always_long" ? row.alwaysLongCentralNet : row.alwaysShortCentralNet })), dateGrid, 30, 500, seed ^ 0x7f4a7c15);
  const uniqueDecisionDates = new Set(rows.map((row) => new Date(row.decisionTime).toISOString().slice(0, 10))).size;
  const interval = panel.differenceInterval95;
  const qualified = rows.length >= 100 && new Set(rows.map((row) => row.asset)).size >= 3 && uniqueDecisionDates >= 30 && central > 0 && interval !== null && interval[0] > 0;
  return { control, seed, rows: rows.length, uniqueAssets: new Set(rows.map((row) => row.asset)).size, uniqueDecisionDates, meanCentralNet: panel.candidateMean ?? central, bestDirectionalBaseline: bestId, bestDirectionalBaselineMean: panel.comparatorMean ?? Math.max(alwaysLong, alwaysShort), meanDifference: panel.differenceMean ?? 0, differenceInterval95: interval, completeBlocks: panel.completeBlocks, tailDatesExcluded: panel.tailDatesExcluded, qualified };
}

export function runSyntheticControls(generatedAt = new Date().toISOString()): { report: SyntheticControlReport; rows: SyntheticControlRow[] } {
  const positiveRows = buildRows("positive", 20261009); const positive = evaluate(positiveRows, "positive", 20261009);
  const negativeReports: ControlSeedReport[] = []; const negativeRows: SyntheticControlRow[] = [];
  for (const seed of NEGATIVE_SEEDS) { const rows = buildRows("negative", seed); negativeRows.push(...rows); negativeReports.push(evaluate(rows, "negative", seed)); }
  if (!positive.qualified) throw new Error("SYNTHETIC_POSITIVE_CONTROL_FAILED: the evaluation failed to detect a guaranteed pre-decision advantage.");
  const falseQualifications = negativeReports.filter((row) => row.qualified).length;
  return { report: { version: "phase2a1-synthetic-controls-v1", cohort: SYNTHETIC_CONTROL_COHORT, generatedAt, design: {
    positive: "A latent state is sampled and persisted before decision; the later return is generated from that state plus bounded independent noise. The signal reads only the pre-decision state.",
    negative: "Signal directions and later outcomes come from independently seeded generators. Fixed seeds are recorded in this report.",
    futureInformationUsed: false,
    separation: "Synthetic controls use synthetic identifiers, their own cohort, report, rows, and command. They are never accepted by the market-data research engine or merged with market evidence.",
    qualificationRule: "At least 100 rows, 3 assets, 30 dates, positive mean central-net return, and a positive 95% complete-date-block lower bound versus the best matched always-long/always-short baseline.",
    matchedSmaQualificationLimitation: "The frozen market rule compares each candidate with SMA-200 on the candidate's own timestamps. Because both frozen hypotheses choose the same direction as SMA-200, candidate and SMA returns are identical under equal costs. A strictly positive lower bound versus the best matched comparator is therefore impossible. That equality is retained as a sanity test, not misread as evidence against timing value. Synthetic controls use the appropriate non-identical always-long/always-short comparator so guaranteed directional information can pass.",
  }, positive, negative: { seeds: [...NEGATIVE_SEEDS], reports: negativeReports, falseQualifications, falseQualificationRate: falseQualifications / negativeReports.length } }, rows: [...positiveRows, ...negativeRows] };
}


export type PipelinePositiveControlReport = {
  version: "phase2a1-pipeline-positive-v1";
  cohort: typeof SYNTHETIC_CONTROL_COHORT;
  path: "actual feature/entry/label engine + shared date-panel evaluator";
  futureInformationUsed: false;
  observations: number;
  uniqueAssets: number;
  uniqueDecisionDates: number;
  comparator: "always_long" | "always_short";
  evaluation: ReturnType<typeof evaluateDatePanel>;
  detectedConstructedEffect: boolean;
};

function pipelineBars(instrumentId: "BTCUSDT" | "ETHUSDT" | "SOLUSDT", symbol: "BTC" | "ETH" | "SOL", phase: number): ResearchBar[] {
  const startAt = Date.parse("2022-04-01T00:00:00.000Z"); const retrievedAt = Date.parse("2026-10-09T20:00:00.000Z"); const rows: ResearchBar[] = [];
  for (let index = 0; index < 1000; index++) {
    const eventTime = startAt + index * DAY_MS;
    // The state is fully determined at feature time. Long, smooth 90-day waves make the frozen
    // 20-day trend feature informative about the next five days without reading future labels.
    const center = 150 + index * 0.01; const wave = 28 * Math.sin((index + phase) * Math.PI / 45); const close = center + wave; const prior = 150 + (index - 1) * 0.01 + 28 * Math.sin((index - 1 + phase) * Math.PI / 45); const open = index === 0 ? close : prior;
    rows.push({ instrumentId, symbol, venue: "Binance Spot", quoteCurrency: "USDT", exchangeCalendar: "24/7 UTC", source: "Binance market-data-only API", interval: "1d", eventTime, endTime: eventTime + DAY_MS, availableAt: eventTime + DAY_MS + BAR_AVAILABILITY_LAG_MS, retrievedAt, adjustmentBasis: "unadjusted venue spot", open, high: Math.max(open, close) + 0.4, low: Math.min(open, close) - 0.4, close, volume: 1000 + (index % 17) } satisfies ResearchBar);
  }
  return rows;
}

export async function runPipelinePositiveControl(): Promise<PipelinePositiveControlReport> {
  const bars = [...pipelineBars("BTCUSDT", "BTC", 0), ...pipelineBars("ETHUSDT", "ETH", 11), ...pipelineBars("SOLUSDT", "SOL", 23)];
  const result = await runPhase2AResearch(bars); const observations = result.observations.filter((row) => row.strategy === "trend_continuation" && row.horizon === 5);
  const alwaysLongMean = mean(observations.map((row) => row.baselineCentralNetReturns.alwaysLong)); const alwaysShortMean = mean(observations.map((row) => row.baselineCentralNetReturns.alwaysShort)); const comparator = alwaysLongMean >= alwaysShortMean ? "always_long" as const : "always_short" as const;
  const start = Date.parse("2023-01-01T00:00:00.000Z"); const end = Date.parse("2024-12-31T00:00:00.000Z"); const dateGrid: string[] = []; for (let cursor = start; cursor <= end; cursor += DAY_MS) dateGrid.push(new Date(cursor).toISOString().slice(0, 10));
  const evaluation = evaluateDatePanel(observations.map((row) => ({ decisionTime: row.decisionTime, candidateReturn: row.centralNetSignedReturn, comparatorReturn: comparator === "always_long" ? row.baselineCentralNetReturns.alwaysLong : row.baselineCentralNetReturns.alwaysShort })), dateGrid, 30, 500, 20261009);
  const uniqueDecisionDates = new Set(observations.map((row) => new Date(row.decisionTime).toISOString().slice(0, 10))).size; const detectedConstructedEffect = evaluation.candidateMean !== null && evaluation.candidateMean > 0 && evaluation.differenceInterval95 !== null && evaluation.differenceInterval95[0] > 0;
  return { version: "phase2a1-pipeline-positive-v1", cohort: SYNTHETIC_CONTROL_COHORT, path: "actual feature/entry/label engine + shared date-panel evaluator", futureInformationUsed: false, observations: observations.length, uniqueAssets: new Set(observations.map((row) => row.instrumentId)).size, uniqueDecisionDates, comparator, evaluation, detectedConstructedEffect };
}
