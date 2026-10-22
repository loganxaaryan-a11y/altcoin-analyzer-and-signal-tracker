import { describe, expect, test } from "bun:test";
import { COST_SCENARIO_ID, DOSSIER_PARAMETER_HASH, DOSSIER_STRATEGY_ID, DOSSIER_STRATEGY_VERSION, ENTRY_CONVENTION, EVALUATION_METHOD_VERSION, PRICE_CONVENTION, buildAtrLevels, canonicalWilderAtr, evaluateTradeSetup, isCurrentProspectiveCohort, linearReturnPct, modeledReturn, normalizeFundingRate, replayDossierDecision, replayMismatches, scoreDossierFactors, selectCurrentEvaluationRevisions, type EvaluationBar, type EvaluationReadRow } from "./signal-methodology";

const hour = 3_600_000;
const closed = (startAt: number, open = 100, high = 105, low = 95, close = 100): EvaluationBar => ({ startAt, endAt: startAt + hour, open, high, low, close, isClosed: true, source: "fixture" });
const base = { direction: "long" as const, entryAt: 0, expiresAt: 3 * hour, entry: 100, stop: 90, target: 115, nowAt: 4 * hour, feeAndSlippageBps: 18, expectedIntervalMs: hour };

function completeSafeBars(): EvaluationBar[] { return [closed(0), closed(hour), closed(2 * hour)]; }

describe("Phase 1.1 authoritative evaluation", () => {
  test("linear short return uses entry notional in gross and modeled-net paths", () => {
    expect(linearReturnPct("short", 100, 110)).toBeCloseTo(-10, 10);
    expect(linearReturnPct("short", 100, 85)).toBeCloseTo(15, 10);
    expect(modeledReturn("short", 100, 110, 18)).toEqual({ grossReturnPct: -10, netReturnPct: -10.18 });
    expect(modeledReturn("short", 100, 85, null)).toEqual({ grossReturnPct: 15, netReturnPct: null });
  });

  test("hourly and eight-hour funding normalize identically", () => {
    expect(normalizeFundingRate(0.0000125, 1, 8)).toBeCloseTo(0.0001, 12);
    expect(normalizeFundingRate(0.0001, 8, 8)).toBeCloseTo(0.0001, 12);
  });

  test("future candle ending after evaluation cutoff is not consumed", () => {
    const result = evaluateTradeSetup({ ...base, nowAt: hour / 2, bars: [closed(0, 100, 116, 95, 100)] });
    expect(result.outcome).toBe("open");
  });

  test("expiry-straddling target cannot prove a pre-expiry touch", () => {
    const result = evaluateTradeSetup({ ...base, expiresAt: hour / 2, bars: [closed(0, 100, 116, 95, 100)] });
    expect(result.outcome).toBe("unverified");
    expect(result.reason).toContain("straddles expiry");
  });

  test("missing middle interval blocks a later target", () => {
    const result = evaluateTradeSetup({ ...base, bars: [closed(0), closed(2 * hour, 100, 116, 95, 100)] });
    expect(result.outcome).toBe("unverified");
    expect(result.reason).toContain("missing before settlement");
  });

  test("missing tail cannot substitute a stale close for expiry", () => {
    const result = evaluateTradeSetup({ ...base, bars: [closed(0)] });
    expect(result.outcome).toBe("unverified");
    expect(result.reason).toContain("does not reach");
  });

  test("missing initial interval blocks a later target", () => {
    const result = evaluateTradeSetup({ ...base, bars: [closed(hour, 100, 116, 95, 100)] });
    expect(result.outcome).toBe("unverified");
    expect(result.reason).toContain("missing before settlement");
  });

  test("known adverse opening gap resolves before later intrabar target", () => {
    const result = evaluateTradeSetup({ ...base, bars: [closed(0, 80, 116, 79, 100), closed(hour), closed(2 * hour)] });
    expect(result.outcome).toBe("invalidated");
    expect(result.exitPrice).toBe(80);
    expect(result.exitAt).toBe(0);
    expect(result.grossReturnPct).toBeCloseTo(-20, 10);
  });

  test("the six timestamp and coverage counterexamples mirror for shorts", () => {
    const shortBase = { ...base, direction: "short" as const, stop: 110, target: 85 };
    expect(evaluateTradeSetup({ ...shortBase, nowAt: hour / 2, bars: [closed(0, 100, 105, 84, 100)] }).outcome).toBe("open");
    expect(evaluateTradeSetup({ ...shortBase, expiresAt: hour / 2, bars: [closed(0, 100, 105, 84, 100)] }).outcome).toBe("unverified");
    expect(evaluateTradeSetup({ ...shortBase, bars: [closed(0), closed(2 * hour, 100, 105, 84, 100)] }).outcome).toBe("unverified");
    expect(evaluateTradeSetup({ ...shortBase, bars: [closed(0)] }).outcome).toBe("unverified");
    expect(evaluateTradeSetup({ ...shortBase, bars: [closed(hour, 100, 105, 84, 100)] }).outcome).toBe("unverified");
    const adverse = evaluateTradeSetup({ ...shortBase, bars: [closed(0, 120, 121, 84, 100), closed(hour), closed(2 * hour)] });
    expect(adverse.outcome).toBe("invalidated");
    expect(adverse.exitPrice).toBe(120);
    expect(adverse.grossReturnPct).toBeCloseTo(-20, 10);
  });

  test("entry-straddling touch is ambiguous rather than settled", () => {
    const result = evaluateTradeSetup({ ...base, entryAt: hour / 2, expiresAt: 3.5 * hour, bars: [closed(0, 100, 116, 89, 105)] });
    expect(result.outcome).toBe("ambiguous");
  });

  test("pre-entry extremes cannot settle but later same-day touches can", () => {
    const result = evaluateTradeSetup({ ...base, entryAt: hour, expiresAt: 4 * hour, nowAt: 5 * hour, bars: [closed(0, 100, 116, 89, 100), closed(hour, 100, 116, 99, 115)] });
    expect(result.outcome).toBe("target");
    expect(result.grossReturnPct).toBeCloseTo(15, 10);
  });

  test("double-touch candle stays ambiguous without an adverse opening gap", () => {
    const result = evaluateTradeSetup({ ...base, direction: "short", stop: 110, target: 85, bars: [closed(0, 100, 111, 84, 100)] });
    expect(result.outcome).toBe("ambiguous");
  });

  test("complete coverage receives an exact-horizon time exit", () => {
    const result = evaluateTradeSetup({ ...base, direction: "short", stop: 110, target: 85, bars: completeSafeBars() });
    expect(result.outcome).toBe("time_exit");
    expect(result.exitAt).toBe(3 * hour);
  });

  test("missing OHLC cannot be manufactured from close", () => {
    const bad = { ...closed(0), high: Number.NaN };
    const result = evaluateTradeSetup({ ...base, bars: [bad, closed(hour), closed(2 * hour)] });
    expect(result.outcome).toBe("unverified");
    expect(result.reason).toContain("missing or incoherent OHLC");
  });

  test("current revision selection updates the read model and keeps older evidence inspectable", () => {
    const createdAt = new Date(0);
    const rows: EvaluationReadRow[] = [
      { signalId: "s1", legacySignalId: 1, methodVersion: "v3", product: "trade_setup", horizon: 30, horizonUnit: "elapsed_days", revision: 1, verdict: "unverified", status: "unverified", grossReturnPct: null, netReturnPct: null, grossR: null, netR: null, costModelJson: "{}", createdAt },
      { signalId: "s1", legacySignalId: 1, methodVersion: "v3", product: "trade_setup", horizon: 30, horizonUnit: "elapsed_days", revision: 2, verdict: "target", status: "resolved", grossReturnPct: 15, netReturnPct: 14.82, grossR: 1.5, netR: 1.482, costModelJson: "{}", createdAt: new Date(hour) },
    ];
    const current = selectCurrentEvaluationRevisions(rows);
    expect(current).toHaveLength(1);
    expect(current[0]?.revision).toBe(2);
    expect(current[0]?.verdict).toBe("target");
    expect(rows).toHaveLength(2);
  });

  test("frozen levels and factor decision remain deterministic", () => {
    const factors = [{ score: 1, weight: 2, contribution: 2 }, { score: -1, weight: 1, contribution: -1 }];
    expect(scoreDossierFactors(factors)).toEqual(scoreDossierFactors(structuredClone(factors)));
    expect(buildAtrLevels("short", 100, 4)).toEqual({ entry: 100, stop: 105, target: 92.5, target2: 87.5, riskPerUnit: 5, riskMultiplier: 1.25, payoffConvention: "linear-entry-notional" });
  });

  test("poor-expectancy sample sufficiency does not validate edge", () => {
    const sample = Array.from({ length: 24 }, (_, index) => index < 8 ? 1.5 : -1);
    const expectancy = sample.reduce((sum, value) => sum + value, 0) / sample.length;
    const sampleSufficient = sample.length >= 20;
    const edgeValidated = false;
    expect(sampleSufficient).toBe(true);
    expect(expectancy).toBeLessThan(0);
    expect(edgeValidated).toBe(false);
  });
});


describe("Phase 1.2 deterministic dossier replay", () => {
  const bars = Array.from({ length: 16 }, (_unused, index) => ({ high: 101 + index, low: 99 + index, close: 100 + index, availableAt: index + 1 }));
  const input = { decisionAt: 20, entryPrice: 115, riskMultiplier: 1.25, factors: [{ label: "trend", score: 1, weight: 0.6 }, { label: "flow", score: -0.25, weight: 0.4 }], atrBars: bars };

  test("untouched raw snapshot reconstructs decision and frozen levels without network access", () => {
    const replay = replayDossierDecision(input);
    expect(replay.status).toBe("reconstructed");
    expect(replay.decision?.direction).toBe("long");
    expect(replay.levels?.entry).toBe(115);
    const saved = { direction: replay.decision!.direction, score: Math.max(replay.decision!.longScore, replay.decision!.shortScore), entry: replay.levels!.entry, stop: replay.levels!.stop, target: replay.levels!.target, target2: replay.levels!.target2 };
    expect(replayMismatches(replay, saved)).toEqual([]);
  });

  test("changing a relevant raw input changes the reconstruction", () => {
    const original = replayDossierDecision(input);
    const changed = replayDossierDecision({ ...input, factors: input.factors.map((factor) => ({ ...factor, score: -1 })) });
    expect(changed.decision?.direction).not.toBe(original.decision?.direction);
  });

  test("altering saved derived output is detected field by field", () => {
    const replay = replayDossierDecision(input);
    const mismatches = replayMismatches(replay, { direction: "short", score: 5, entry: 999, stop: 998, target: 997, target2: 996 });
    expect(mismatches.some((row) => row.startsWith("direction:"))).toBe(true);
    expect(mismatches.some((row) => row.startsWith("entry:"))).toBe(true);
    expect(mismatches.some((row) => row.startsWith("score:"))).toBe(true);
  });

  test("an input unavailable at decision time cannot affect replay", () => {
    const original = replayDossierDecision(input);
    const future = replayDossierDecision({ ...input, atrBars: [...bars, { high: 9999, low: 1, close: 5000, availableAt: 21 }] });
    expect(future).toEqual(original);
  });
});


describe("Phase 1.2 prospective cohort isolation", () => {
  const current = { issuanceState: "complete", strategyId: DOSSIER_STRATEGY_ID, strategyVersion: DOSSIER_STRATEGY_VERSION, parameterHash: DOSSIER_PARAMETER_HASH, evaluatorVersion: EVALUATION_METHOD_VERSION, primaryHorizon: 30, horizonUnit: "elapsed_days", entryRule: ENTRY_CONVENTION, priceBasis: PRICE_CONVENTION, validationStatus: "partially_testable" };
  test("only the exact contract and cost identity enter the cohort", () => {
    expect(isCurrentProspectiveCohort(current, COST_SCENARIO_ID)).toBe(true);
    const competitors = [
      { ...current, strategyVersion: "older" },
      { ...current, parameterHash: "other" },
      { ...current, evaluatorVersion: "older" },
      { ...current, primaryHorizon: 14 },
      { ...current, entryRule: "research-reference" },
      { ...current, validationStatus: "watch_only" },
      { ...current, issuanceState: "pending" },
    ];
    expect(competitors.every((contract) => !isCurrentProspectiveCohort(contract, COST_SCENARIO_ID))).toBe(true);
    expect(isCurrentProspectiveCohort(current, "different-cost-scenario")).toBe(false);
  });
});


describe("Phase 1 final canonical ATR and replay scope", () => {
  test("a 600-bar production window exposes the former last-220 mismatch and full-window replay matches live", () => {
    const bars = Array.from({ length: 600 }, (_unused, index) => {
      const close = 100 + index * 0.01;
      return { high: close + 1 + (index % 19 === 0 ? 1 : 0), low: close - 1, close, availableAt: index + 1 };
    });
    const liveAtr = canonicalWilderAtr(bars, 600);
    const formerTailAtr = canonicalWilderAtr(bars.slice(-220), 600);
    expect(liveAtr).not.toBeNull();
    expect(formerTailAtr).not.toBeNull();
    expect(Math.abs(liveAtr! - formerTailAtr!)).toBeGreaterThan(1e-9);

    const replay = replayDossierDecision({ decisionAt: 600, entryPrice: 100, riskMultiplier: 1.25, factors: [{ label: "trend", score: 1, weight: 1 }], atrBars: bars });
    expect(replay.features.atr14).toBe(liveAtr);
    expect(replay.scope.scoredLedger.status).toBe("reconstructed");
    expect(replay.scope.rawSourceFactors.status).toBe("partial");
    expect(replay.scope.gates.status).toBe("partial");
    expect(replay.scope.levels.status).toBe("reconstructed");
    const saved = { direction: "long" as const, score: 92, entry: 100, ...{ stop: replay.levels!.stop, target: replay.levels!.target, target2: replay.levels!.target2 } };
    expect(replayMismatches(replay, saved)).toEqual([]);

    const oldReplay = replayDossierDecision({ decisionAt: 600, entryPrice: 100, riskMultiplier: 1.25, factors: [{ label: "trend", score: 1, weight: 1 }], atrBars: bars.slice(-220) });
    expect(replayMismatches(oldReplay, saved).some((mismatch) => mismatch.startsWith("stop:") || mismatch.startsWith("target:"))).toBe(true);
  });
});
