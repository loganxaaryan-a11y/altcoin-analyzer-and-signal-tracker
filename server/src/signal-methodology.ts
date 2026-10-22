export const PHASE1_SOURCE_VERSION = "crypto-phase1-final-signoff-2026-10-09";
export const DOSSIER_STRATEGY_ID = "crypto-dossier-factor-agreement";
export const DOSSIER_STRATEGY_VERSION = "2.0.0-measurement-contract";
export const DOSSIER_PARAMETER_HASH = "sha256:4a098b4d389cb85293c78785c82e88a32fe6d96544a8dd84c341dce9fa0b7220";
export const EVALUATION_METHOD_VERSION = "crypto-evaluation-v4-cohort-contract";
export const SNAPSHOT_VERSION = "crypto-input-snapshot-v3-canonical-atr-window";
export const ENTRY_CONVENTION = "first-post-decision-provider-quote";
export const PRICE_CONVENTION = "usd-spot-reference";
export const COST_SCENARIO_ID = "modeled-roundtrip-18bps-funding-unverified-v1";
export const LEGACY_BASELINE_ID = "legacy-sma50-sma200-weekly-30d-v1";

export type ProspectiveCohortContract = { issuanceState: string; strategyId: string; strategyVersion: string; parameterHash: string; evaluatorVersion: string | null; primaryHorizon: number; horizonUnit: string; entryRule: string; priceBasis: string; validationStatus: string };
export function isCurrentProspectiveCohort(contract: ProspectiveCohortContract | undefined, costScenarioId: unknown): boolean {
  return Boolean(contract
    && contract.issuanceState === "complete"
    && contract.strategyId === DOSSIER_STRATEGY_ID
    && contract.strategyVersion === DOSSIER_STRATEGY_VERSION
    && contract.parameterHash === DOSSIER_PARAMETER_HASH
    && contract.evaluatorVersion === EVALUATION_METHOD_VERSION
    && contract.primaryHorizon === 30
    && contract.horizonUnit === "elapsed_days"
    && contract.entryRule === ENTRY_CONVENTION
    && contract.priceBasis === PRICE_CONVENTION
    && contract.validationStatus === "partially_testable"
    && costScenarioId === COST_SCENARIO_ID);
}

export type Direction = "long" | "short";
export type ScoredFactor = { score: number; weight: number; contribution: number };
export type FrozenLevels = { entry: number; stop: number; target: number; target2: number; riskPerUnit: number; riskMultiplier: number; payoffConvention: "linear-entry-notional" };

export function normalizeFundingRate(rate: number | null, nativePeriodHours: number | null, targetPeriodHours = 8): number | null {
  if (rate === null || nativePeriodHours === null || !Number.isFinite(rate) || !(nativePeriodHours > 0) || !(targetPeriodHours > 0)) return null;
  return rate * (targetPeriodHours / nativePeriodHours);
}

export function linearReturnPct(direction: Direction, entry: number, exit: number): number | null {
  if (!(entry > 0) || !Number.isFinite(exit)) return null;
  return (direction === "long" ? (exit - entry) / entry : (entry - exit) / entry) * 100;
}

export function modeledReturn(direction: Direction, entry: number, exit: number, feeAndSlippageBps: number | null): { grossReturnPct: number | null; netReturnPct: number | null } {
  const grossReturnPct = linearReturnPct(direction, entry, exit);
  return { grossReturnPct, netReturnPct: grossReturnPct === null || feeAndSlippageBps === null ? null : grossReturnPct - feeAndSlippageBps / 100 };
}

export function scoreDossierFactors(factors: ScoredFactor[]): { weightedNet: number; totalWeight: number; longScore: number; shortScore: number; direction: Direction } {
  const usable = factors.filter((factor) => Number.isFinite(factor.contribution) && Number.isFinite(factor.weight) && factor.weight > 0);
  const weightedNet = usable.reduce((sum, factor) => sum + factor.contribution, 0);
  const totalWeight = usable.reduce((sum, factor) => sum + factor.weight, 0);
  const longScore = Math.round(Math.max(5, Math.min(95, totalWeight > 0 ? 50 + (weightedNet / totalWeight) * 42 : 50)));
  const shortScore = 100 - longScore;
  return { weightedNet, totalWeight, longScore, shortScore, direction: longScore >= shortScore ? "long" : "short" };
}

export function buildAtrLevels(direction: Direction, entry: number, atr14: number, riskMultiplier = 1.25): FrozenLevels | null {
  if (!(entry > 0) || !(atr14 > 0) || !(riskMultiplier > 0)) return null;
  const riskPerUnit = atr14 * riskMultiplier;
  return {
    entry,
    stop: direction === "long" ? entry - riskPerUnit : entry + riskPerUnit,
    target: direction === "long" ? entry + riskPerUnit * 1.5 : entry - riskPerUnit * 1.5,
    target2: direction === "long" ? entry + riskPerUnit * 2.5 : entry - riskPerUnit * 2.5,
    riskPerUnit,
    riskMultiplier,
    payoffConvention: "linear-entry-notional",
  };
}

export type ReplayFactorInput = { label: string; score: number; weight: number };
export type ReplayAtrBar = { high: number; low: number; close: number; availableAt: number };
export type DossierReplayInput = {
  decisionAt: number;
  entryPrice: number;
  riskMultiplier: number;
  factors: ReplayFactorInput[];
  atrBars: ReplayAtrBar[];
};
export type ReconstructionStatus = { status: "reconstructed" | "partial" | "unverified"; reason: string };
export type DossierReplayOutput = {
  status: "reconstructed" | "partial";
  reason: string;
  scope: {
    scoredLedger: ReconstructionStatus;
    rawSourceFactors: ReconstructionStatus;
    gates: ReconstructionStatus;
    levels: ReconstructionStatus;
  };
  features: { factors: ScoredFactor[]; atr14: number | null };
  gates: { factorLedgerComplete: boolean; atrComplete: boolean };
  decision: ReturnType<typeof scoreDossierFactors> | null;
  levels: FrozenLevels | null;
};

/** Canonical Wilder ATR used by both live issuance and offline replay.
 * The complete ordered decision-time window is consumed: first TR starts at bar 2,
 * the first ATR is the arithmetic mean of the first `period` TRs, and all remaining
 * TRs are Wilder-smoothed. No tail truncation or tolerance widening is permitted.
 */
export function canonicalWilderAtr(bars: ReplayAtrBar[], decisionAt: number, period = 14): number | null {
  const eligible = bars
    .filter((bar) => bar.availableAt <= decisionAt && Number.isFinite(bar.high) && Number.isFinite(bar.low) && Number.isFinite(bar.close))
    .sort((left, right) => left.availableAt - right.availableAt);
  if (eligible.length < period + 1) return null;
  const ranges: number[] = [];
  for (let index = 1; index < eligible.length; index++) {
    const row = eligible[index]; const previous = eligible[index - 1];
    if (!row || !previous) return null;
    ranges.push(Math.max(row.high - row.low, Math.abs(row.high - previous.close), Math.abs(row.low - previous.close)));
  }
  if (ranges.length < period) return null;
  let atr = ranges.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  for (const range of ranges.slice(period)) atr = ((atr * (period - 1)) + range) / period;
  return atr;
}

export function replayDossierDecision(input: DossierReplayInput): DossierReplayOutput {
  const factorRows = input.factors
    .filter((factor) => Number.isFinite(factor.score) && Number.isFinite(factor.weight) && factor.weight > 0)
    .map((factor) => ({ score: factor.score, weight: factor.weight, contribution: factor.score * factor.weight }));
  const factorLedgerComplete = factorRows.length === input.factors.length && factorRows.length > 0;
  const eligibleBars = input.atrBars.filter((bar) => bar.availableAt <= input.decisionAt);
  const atr14 = canonicalWilderAtr(eligibleBars, input.decisionAt);
  const atrComplete = atr14 !== null;
  const scoredLedger: ReconstructionStatus = factorLedgerComplete
    ? { status: "reconstructed", reason: "The canonical scored ledger was recomputed from saved factor scores and weights." }
    : { status: "partial", reason: "The canonical scored-factor input ledger is incomplete." };
  const rawSourceFactors: ReconstructionStatus = { status: "partial", reason: "Upstream provider adapters and their raw source payloads are not replayed; saved scored inputs are the reconstruction boundary." };
  const gates: ReconstructionStatus = factorLedgerComplete && atrComplete
    ? { status: "partial", reason: "Ledger completeness and canonical ATR coverage gates were replayed; upstream provider freshness/anomaly gates remain outside replay scope." }
    : { status: "unverified", reason: "One or more canonical replay gates could not be reconstructed." };
  const levelsStatus: ReconstructionStatus = atrComplete
    ? { status: "reconstructed", reason: "Levels were recomputed with the canonical complete ATR window, seed, and smoothing policy." }
    : { status: "unverified", reason: "The decision-time raw OHLC window cannot reconstruct Wilder ATR-14." };
  const scope = { scoredLedger, rawSourceFactors, gates, levels: levelsStatus };
  if (!factorLedgerComplete || !atrComplete) return { status: "partial", reason: !factorLedgerComplete ? scoredLedger.reason : levelsStatus.reason, scope, features: { factors: factorRows, atr14 }, gates: { factorLedgerComplete, atrComplete }, decision: factorLedgerComplete ? scoreDossierFactors(factorRows) : null, levels: null };
  const decision = scoreDossierFactors(factorRows);
  return { status: "reconstructed", reason: "Scored ledger and frozen levels were recomputed from decision-time inputs without network access; provider-source reconstruction remains explicitly partial.", scope, features: { factors: factorRows, atr14 }, gates: { factorLedgerComplete, atrComplete }, decision, levels: buildAtrLevels(decision.direction, input.entryPrice, atr14, input.riskMultiplier) };
}

export function replayMismatches(reconstructed: DossierReplayOutput, saved: { direction: Direction; score: number; entry: number; stop: number; target: number; target2: number }): string[] {
  const mismatches: string[] = [];
  if (!reconstructed.decision || !reconstructed.levels) return [reconstructed.reason];
  if (reconstructed.decision.direction !== saved.direction) mismatches.push(`direction:${saved.direction}->${reconstructed.decision.direction}`);
  const score = Math.max(reconstructed.decision.longScore, reconstructed.decision.shortScore);
  if (Math.abs(score - saved.score) > 1e-9) mismatches.push(`score:${saved.score}->${score}`);
  for (const [key, actual, expected] of [["entry", reconstructed.levels.entry, saved.entry], ["stop", reconstructed.levels.stop, saved.stop], ["target", reconstructed.levels.target, saved.target], ["target2", reconstructed.levels.target2, saved.target2]] as const) if (Math.abs(actual - expected) > 1e-9) mismatches.push(`${key}:${expected}->${actual}`);
  return mismatches;
}

export type EvaluationBar = {
  startAt: number;
  endAt: number;
  open: number;
  high: number;
  low: number;
  close: number;
  isClosed: boolean;
  source: string;
};

export type SetupEvaluation = {
  outcome: "target" | "invalidated" | "time_exit" | "ambiguous" | "unverified" | "open";
  status: "resolved" | "ambiguous" | "unverified" | "open";
  exitAt: number | null;
  exitPrice: number | null;
  grossReturnPct: number | null;
  netReturnPct: number | null;
  grossR: number | null;
  netR: number | null;
  reason: string;
  uncertainty: { conservativeReturnPct: number | null; optimisticReturnPct: number | null; barStart: number | null; barEnd: number | null };
};

const emptyUncertainty = { conservativeReturnPct: null, optimisticReturnPct: null, barStart: null, barEnd: null };

function unverified(reason: string, barStart: number | null = null, barEnd: number | null = null): SetupEvaluation {
  return { outcome: "unverified", status: "unverified", exitAt: null, exitPrice: null, grossReturnPct: null, netReturnPct: null, grossR: null, netR: null, reason, uncertainty: { ...emptyUncertainty, barStart, barEnd } };
}

function coherentBar(bar: EvaluationBar): boolean {
  return Number.isFinite(bar.startAt) && Number.isFinite(bar.endAt) && bar.endAt > bar.startAt
    && Number.isFinite(bar.open) && Number.isFinite(bar.high) && Number.isFinite(bar.low) && Number.isFinite(bar.close)
    && bar.open > 0 && bar.close > 0 && bar.high >= Math.max(bar.open, bar.close, bar.low) && bar.low <= Math.min(bar.open, bar.close, bar.high);
}

export function evaluateTradeSetup(input: {
  direction: Direction;
  entryAt: number;
  expiresAt: number;
  entry: number;
  stop: number;
  target: number;
  bars: EvaluationBar[];
  nowAt: number;
  feeAndSlippageBps: number | null;
  expectedIntervalMs?: number | null;
  coverageToleranceMs?: number;
}): SetupEvaluation {
  const risk = Math.abs(input.entry - input.stop);
  if (!(input.entry > 0) || !(risk > 0) || !(input.target > 0) || !(input.expiresAt > input.entryAt)) return unverified("Invalid frozen entry, stop, target, or horizon.");
  const expected = input.expectedIntervalMs && input.expectedIntervalMs > 0 ? input.expectedIntervalMs : null;
  const tolerance = input.coverageToleranceMs ?? (expected === null ? 0 : expected * 0.1);
  const relevant = [...input.bars]
    .filter((bar) => bar.endAt > input.entryAt && bar.startAt < input.expiresAt && bar.startAt < input.nowAt)
    .sort((a, b) => a.startAt - b.startAt);
  let previousEnd = input.entryAt;
  let finalEligible: EvaluationBar | null = null;

  for (const bar of relevant) {
    if (bar.endAt > input.nowAt || !bar.isClosed) continue;
    if (!coherentBar(bar)) return unverified("A required candle has missing or incoherent OHLC evidence.", bar.startAt, bar.endAt);
    if (bar.startAt > previousEnd + tolerance) return unverified("A required candle interval is missing before settlement.", previousEnd, bar.startAt);

    const stopTouched = input.direction === "long" ? bar.low <= input.stop : bar.high >= input.stop;
    const targetTouched = input.direction === "long" ? bar.high >= input.target : bar.low <= input.target;
    const straddlesEntry = bar.startAt < input.entryAt && bar.endAt > input.entryAt;
    const straddlesExpiry = bar.startAt < input.expiresAt && bar.endAt > input.expiresAt;

    if (straddlesEntry && (stopTouched || targetTouched)) {
      const stopReturn = linearReturnPct(input.direction, input.entry, input.stop);
      const targetReturn = linearReturnPct(input.direction, input.entry, input.target);
      return { outcome: "ambiguous", status: "ambiguous", exitAt: null, exitPrice: null, grossReturnPct: null, netReturnPct: null, grossR: null, netR: null, reason: "The candle straddles execution; its extreme may have occurred before entry. Finer evidence is required.", uncertainty: { conservativeReturnPct: Math.min(stopReturn ?? 0, targetReturn ?? 0), optimisticReturnPct: Math.max(stopReturn ?? 0, targetReturn ?? 0), barStart: bar.startAt, barEnd: bar.endAt } };
    }
    if (straddlesExpiry && (stopTouched || targetTouched)) return unverified("The candle straddles expiry; its full-candle extreme cannot prove a pre-expiry touch.", bar.startAt, bar.endAt);

    const adverseGap = !straddlesEntry && (input.direction === "long" ? bar.open < input.stop : bar.open > input.stop);
    if (adverseGap) return resolvedSetup("invalidated", bar.open, bar.startAt, bar, input, risk, "The observed opening price was already beyond invalidation; the stop-market model used that adverse open before later intrabar extremes.");

    if (stopTouched && targetTouched) {
      const stopReturn = linearReturnPct(input.direction, input.entry, input.stop);
      const targetReturn = linearReturnPct(input.direction, input.entry, input.target);
      return { outcome: "ambiguous", status: "ambiguous", exitAt: null, exitPrice: null, grossReturnPct: null, netReturnPct: null, grossR: null, netR: null, reason: "Target and stop both touched inside one candle; order is unknowable without finer evidence.", uncertainty: { conservativeReturnPct: Math.min(stopReturn ?? 0, targetReturn ?? 0), optimisticReturnPct: Math.max(stopReturn ?? 0, targetReturn ?? 0), barStart: bar.startAt, barEnd: bar.endAt } };
    }
    if (stopTouched) return resolvedSetup("invalidated", input.stop, bar.endAt, bar, input, risk, "The frozen invalidation was the first unambiguous eligible touch after execution; execution time is known only to the candle interval.");
    if (targetTouched) return resolvedSetup("target", input.target, bar.endAt, bar, input, risk, "The frozen target was the first unambiguous eligible touch after execution; execution time is known only to the candle interval.");

    previousEnd = Math.max(previousEnd, Math.min(bar.endAt, input.expiresAt));
    if (bar.endAt <= input.expiresAt) finalEligible = bar;
    if (straddlesExpiry) return unverified("The expiry falls inside a candle; no exact horizon close is available for a time exit.", bar.startAt, bar.endAt);
  }

  if (input.nowAt < input.expiresAt) return { outcome: "open", status: "open", exitAt: null, exitPrice: null, grossReturnPct: null, netReturnPct: null, grossR: null, netR: null, reason: "The declared horizon has not expired and no eligible target/stop touch is resolved.", uncertainty: emptyUncertainty };
  if (previousEnd < input.expiresAt - tolerance) return unverified("Required candle coverage does not reach the declared expiry; a stale earlier close cannot stand in for the time exit.", previousEnd, input.expiresAt);
  if (!finalEligible || Math.abs(finalEligible.endAt - input.expiresAt) > tolerance) return unverified("No closed candle observes the declared expiry within the preregistered tolerance.", finalEligible?.endAt ?? null, input.expiresAt);
  return resolvedSetup("time_exit", finalEligible.close, finalEligible.endAt, finalEligible, input, risk, "The setup expired untouched and used the closed candle ending at the declared expiry within tolerance.");
}

function resolvedSetup(
  outcome: "target" | "invalidated" | "time_exit",
  exitPrice: number,
  exitAt: number,
  bar: EvaluationBar,
  input: { direction: Direction; entry: number; feeAndSlippageBps: number | null },
  risk: number,
  reason: string,
): SetupEvaluation {
  const returns = modeledReturn(input.direction, input.entry, exitPrice, input.feeAndSlippageBps);
  const grossR = input.direction === "long" ? (exitPrice - input.entry) / risk : (input.entry - exitPrice) / risk;
  const netR = returns.netReturnPct === null ? null : returns.netReturnPct / (risk / input.entry * 100);
  return { outcome, status: "resolved", exitAt, exitPrice, grossReturnPct: returns.grossReturnPct, netReturnPct: returns.netReturnPct, grossR, netR, reason, uncertainty: { ...emptyUncertainty, barStart: bar.startAt, barEnd: bar.endAt } };
}

export type EvaluationReadRow = {
  signalId: string;
  legacySignalId: number | null;
  methodVersion: string;
  product: "direction_forecast" | "trade_setup";
  horizon: number;
  horizonUnit: string;
  revision: number;
  verdict: string;
  status: "resolved" | "ambiguous" | "unverified" | "open";
  reason?: string;
  grossReturnPct: number | null;
  netReturnPct: number | null;
  grossR: number | null;
  netR: number | null;
  costModelJson: string;
  createdAt: Date;
};

export function selectCurrentEvaluationRevisions(rows: EvaluationReadRow[]): EvaluationReadRow[] {
  const current = new Map<string, EvaluationReadRow>();
  for (const row of rows) {
    const key = `${row.signalId}|${row.methodVersion}|${row.product}|${row.horizon}|${row.horizonUnit}`;
    const previous = current.get(key);
    if (!previous || row.revision > previous.revision || (row.revision === previous.revision && row.createdAt.getTime() > previous.createdAt.getTime())) current.set(key, row);
  }
  return [...current.values()];
}
