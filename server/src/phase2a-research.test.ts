import { describe, expect, test } from "bun:test";
import { BAR_AVAILABILITY_LAG_MS, DAY_MS, PHASE2A_COHORT, PHASE2A_VERSION, runPhase2AResearch, type ResearchBar } from "./phase2a-research";
import { runPipelinePositiveControl, runSyntheticControls } from "./phase2a-controls";

function barsFor(instrumentId: "BTCUSDT" | "ETHUSDT", symbol: "BTC" | "ETH", start: string, count: number, mutate?: (index: number, row: ResearchBar) => ResearchBar): ResearchBar[] {
  const startAt = Date.parse(`${start}T00:00:00.000Z`); const retrievedAt = Date.parse("2026-10-09T16:00:00.000Z"); const rows: ResearchBar[] = [];
  for (let index = 0; index < count; index++) {
    const eventTime = startAt + index * DAY_MS; const trend = index < 500 ? index * 0.16 : 80 - (index - 500) * 0.11; const pulse = index > 210 && index % 37 === 0 ? 4 : 0; const close = Math.max(10, 100 + trend + pulse); const open = Math.max(10, close - (index % 2 ? 0.3 : -0.2));
    let row: ResearchBar = { instrumentId, symbol, venue: "Binance Spot", quoteCurrency: "USDT", exchangeCalendar: "24/7 UTC", source: "Binance market-data-only API", interval: "1d", eventTime, endTime: eventTime + DAY_MS, availableAt: eventTime + DAY_MS + BAR_AVAILABILITY_LAG_MS, retrievedAt, adjustmentBasis: "unadjusted venue spot", open, high: Math.max(open, close) + 0.8, low: Math.min(open, close) - 0.8, close, volume: index > 210 && index % 37 === 0 ? 200 : 100 };
    if (mutate) row = mutate(index, row); rows.push(row);
  }
  return rows;
}

const longHistory = () => barsFor("BTCUSDT", "BTC", "2022-05-01", 970);

describe("Phase 2A frozen crypto research harness", () => {
  test("normal command keeps the final holdout locked", async () => {
    await expect(runPhase2AResearch(longHistory(), { allowHoldout: true })).rejects.toThrow("LOCKED_HOLDOUT");
    const result = await runPhase2AResearch(longHistory());
    expect(result.holdout.locked).toBe(true);
    expect(result.holdout.performanceOpened).toBe(false);
    expect(result.observations.every((row) => row.fold !== "holdout_locked")).toBe(true);
  });

  test("entry is the first open after inferred feature availability, never the adjacent unavailable open", async () => {
    const input = longHistory(); const result = await runPhase2AResearch(input); const observation = result.observations[0];
    expect(observation).toBeDefined();
    expect(observation!.entryTime).toBeGreaterThanOrEqual(observation!.decisionTime);
    expect(observation!.entryTime - observation!.featureCutoff).toBe(DAY_MS);
  });

  test("breakout references exclude the current bar and zero reference volume cannot pass", async () => {
    const zeroVolume = barsFor("BTCUSDT", "BTC", "2022-05-01", 970, (index, row) => index >= 190 && index <= 240 ? { ...row, volume: 0 } : row);
    const result = await runPhase2AResearch(zeroVolume);
    expect(result.dataset.exclusions.missing_or_zero_volume).toBeGreaterThan(0);
    expect(result.reports.find((row) => row.strategy === "breakout_volume" && row.fold === "pooled")?.issuedDecisions ?? 0).toBeLessThan(result.reports.find((row) => row.strategy === "trend_continuation" && row.fold === "pooled")?.issuedDecisions ?? 0);
  });

  test("future bars cannot change a previously issued feature decision", async () => {
    const base = longHistory(); const original = await runPhase2AResearch(base); const cutoff = Date.parse("2023-03-01T00:00:00.000Z");
    const mutated = base.map((row) => row.eventTime > cutoff ? { ...row, close: row.close * 50, open: row.open * 50, high: row.high * 50, low: row.low * 50 } : row);
    const changed = await runPhase2AResearch(mutated);
    const before = original.observations.filter((row) => row.decisionTime <= cutoff).map((row) => [row.strategy, row.horizon, row.instrumentId, row.decisionTime, row.direction]);
    const after = changed.observations.filter((row) => row.decisionTime <= cutoff).map((row) => [row.strategy, row.horizon, row.instrumentId, row.decisionTime, row.direction]);
    expect(after).toEqual(before);
  });

  test("deliberate leakage fixture would look profitable but cannot affect the feature side", async () => {
    const base = longHistory(); const decisionIndex = 250; const targetTime = base[decisionIndex]?.eventTime ?? 0; const futurePump = base.map((row, index) => index > decisionIndex && index < decisionIndex + 15 ? { ...row, open: row.open * 3, high: row.high * 3, low: row.low * 3, close: row.close * 3 } : row);
    const original = await runPhase2AResearch(base); const changed = await runPhase2AResearch(futurePump);
    const pick = (rows: typeof original.observations) => rows.find((row) => row.strategy === "trend_continuation" && row.horizon === 5 && row.featureCutoff === targetTime + DAY_MS)?.direction ?? null;
    expect(pick(changed.observations)).toBe(pick(original.observations));
  });

  test("fold-end labels are purged by actual availability, not signal-row count", async () => {
    const result = await runPhase2AResearch(longHistory()); const firstFold = result.reports.find((row) => row.strategy === "trend_continuation" && row.horizon === 30 && row.fold === "validation_1");
    expect(firstFold).toBeDefined();
    expect(firstFold!.pendingLabels).toBeGreaterThan(0);
    expect(result.observations.filter((row) => row.fold === "validation_1" && row.horizon === 30).every((row) => row.labelAvailableAt <= Date.parse("2023-07-01T00:00:00.000Z"))).toBe(true);
  });

  test("common-date panel remains together and block uncertainty uses date blocks", async () => {
    const panel = [...barsFor("BTCUSDT", "BTC", "2022-05-01", 970), ...barsFor("ETHUSDT", "ETH", "2022-05-01", 970)]; const result = await runPhase2AResearch(panel); const pooled = result.reports.find((row) => row.strategy === "trend_continuation" && row.horizon === 5 && row.fold === "pooled");
    expect(pooled?.uniqueAssets).toBe(2);
    expect(pooled?.overlappingExposureCount ?? 0).toBeGreaterThan(0);
    expect(pooled?.uncertainty.method).toContain("cross-asset panel");
    expect(pooled?.uncertainty.blocks ?? 0).toBeGreaterThan(1);
  });

  test("linear long and short arithmetic, matched baselines, and bps costs remain coherent", async () => {
    const result = await runPhase2AResearch(longHistory()); const rows = result.observations;
    const long = rows.find((row) => row.direction === "long"); const short = rows.find((row) => row.direction === "short");
    expect(long).toBeDefined(); expect(short).toBeDefined();
    expect(long!.grossSignedReturn).toBeCloseTo((long!.exitPrice - long!.entryPrice) / long!.entryPrice, 12);
    expect(short!.grossSignedReturn).toBeCloseTo((short!.entryPrice - short!.exitPrice) / short!.entryPrice, 12);
    expect(long!.centralNetSignedReturn).toBeCloseTo(long!.grossSignedReturn - 0.0018, 12);
    expect(long!.stressedNetSignedReturn).toBeCloseTo(long!.grossSignedReturn - 0.0036, 12);
    expect(long!.baselineReturns.alwaysLong).toBeCloseTo((long!.exitPrice - long!.entryPrice) / long!.entryPrice - 0.0018, 12);
    expect(long!.baselineReturns.alwaysShort).toBeCloseTo((long!.entryPrice - long!.exitPrice) / long!.entryPrice - 0.0018, 12);
  });

  test("reports separate full-schedule baselines from matched emitted-timestamp baselines", async () => {
    const result = await runPhase2AResearch(longHistory()); const pooled = result.reports.find((row) => row.strategy === "breakout_volume" && row.horizon === 5 && row.fold === "pooled");
    expect(pooled).toBeDefined(); expect(pooled!.fullScheduleBaselines.eligibleLabeledRows).toBeGreaterThan(pooled!.issuedDecisions);
    expect(pooled!.matchedBaselines.sma200DirectionMean).toBeCloseTo(pooled!.meanCentralNetSignedReturn ?? 0, 12);
    expect(pooled!.matchedBaselines.differenceVsBestDirectional ?? 0).toBeLessThanOrEqual(0);
    expect(pooled!.uncertainty.method).toContain("matched central-net directional baseline");
  });

  test("missing crypto calendar bars remain exclusions and are never synthesized", async () => {
    const withGap = longHistory().filter((_row, index) => index !== 430); const result = await runPhase2AResearch(withGap);
    expect(result.dataset.instruments.find((row) => row.instrumentId === "BTCUSDT")?.gaps).toBe(1);
    expect(result.dataset.exclusions.gap_in_feature_window + result.dataset.exclusions.gap_in_label_window).toBeGreaterThan(0);
    expect(result.dataset.totalRows).toBe(withGap.length);
  });

  test("reruns are deterministic apart from the report timestamp", async () => {
    const input = longHistory(); const left = await runPhase2AResearch(input); const right = await runPhase2AResearch(structuredClone(input));
    expect({ ...left, generatedAt: "x" }).toEqual({ ...right, generatedAt: "x" });
    expect(left.specHash).toBe(right.specHash); expect(left.datasetManifestHash).toBe(right.datasetManifestHash);
  });

  test("Phase 2A rows carry a separate cohort and cannot impersonate the legacy scoreboard", async () => {
    const result = await runPhase2AResearch(longHistory());
    expect(result.version).toBe(PHASE2A_VERSION); expect(result.cohort).toBe(PHASE2A_COHORT);
    expect(result.observations.every((row) => row.cohort === PHASE2A_COHORT)).toBe(true);
    expect(PHASE2A_COHORT).not.toContain("legacy");
  });

  test("direct engine invocation rejects reserved holdout-dated input before any report generation", async () => {
    const input = [...longHistory(), ...barsFor("BTCUSDT", "BTC", "2025-01-01", 1)];
    await expect(runPhase2AResearch(input)).rejects.toThrow("LOCKED_HOLDOUT_INPUT");
  });

  test("missing expected entry or endpoint is excluded and never stretches the elapsed-day clock", async () => {
    const base = longHistory(); const original = await runPhase2AResearch(base);
    const target = original.observations.find((row) => row.strategy === "trend_continuation" && row.horizon === 5 && row.fold === "validation_1");
    expect(target).toBeDefined();
    const withoutEndpoint = base.filter((bar) => bar.eventTime !== target!.horizonEnd - DAY_MS);
    const repaired = await runPhase2AResearch(withoutEndpoint);
    expect(repaired.observations.some((row) => row.strategy === target!.strategy && row.horizon === target!.horizon && row.decisionTime === target!.decisionTime)).toBe(false);
    expect(repaired.dataset.exclusions.gap_in_label_window).toBeGreaterThan(0);
    expect(repaired.observations.some((row) => row.decisionTime === target!.decisionTime && row.horizonEnd > target!.horizonEnd)).toBe(false);
  });

  test("identical candidate and matched SMA decisions have zero gross, central, and stressed cost differences", async () => {
    const result = await runPhase2AResearch(longHistory());
    const pooled = result.reports.find((row) => row.strategy === "trend_continuation" && row.horizon === 5 && row.fold === "pooled");
    expect(pooled).toBeDefined();
    expect(pooled!.matchedBaselines.gross.candidateMean).toBeCloseTo(pooled!.matchedBaselines.gross.sma200DirectionMean ?? 0, 12);
    expect(pooled!.matchedBaselines.centralNet.candidateMean).toBeCloseTo(pooled!.matchedBaselines.centralNet.sma200DirectionMean ?? 0, 12);
    expect(pooled!.matchedBaselines.stressedNet.candidateMean).toBeCloseTo(pooled!.matchedBaselines.stressedNet.sma200DirectionMean ?? 0, 12);
  });

  test("synthetic positive control qualifies while fixed-seed negative controls do not falsely qualify", () => {
    const { report, rows } = runSyntheticControls("2026-10-09T18:30:00.000Z");
    expect(report.positive.qualified).toBe(true);
    expect(report.positive.differenceInterval95?.[0] ?? 0).toBeGreaterThan(0);
    expect(report.negative.seeds).toEqual([7, 101, 809, 20261009, 424242]);
    expect(report.negative.falseQualifications).toBe(0);
    expect(rows.every((row) => row.cohort === "phase2a1-synthetic-controls-only" && row.featureTime < row.decisionTime && row.decisionTime < row.labelTime)).toBe(true);
  });

  test("a late revision is unavailable to the earlier decision but usable later", async () => {
    const base = longHistory(); const lateIndex = 260; const late = base[lateIndex]; expect(late).toBeDefined(); if (!late) return;
    const decisionAt = late.availableAt + DAY_MS;
    const make = (multiplier: number) => base.map((row, index) => index === lateIndex ? { ...row, open: row.open * multiplier, high: row.high * multiplier, low: row.low * multiplier, close: row.close * multiplier, availableAt: decisionAt + 10 * DAY_MS } : row);
    const low = await runPhase2AResearch(make(0.5)); const high = await runPhase2AResearch(make(2));
    const earlier = (result: typeof low) => result.observations.filter((row) => row.decisionTime === decisionAt && row.strategy === "trend_continuation");
    expect(earlier(low)).toEqual([]); expect(earlier(high)).toEqual([]);
    expect(low.dataset.exclusions.feature_unavailable_at_decision).toBeGreaterThan(0); expect(high.dataset.exclusions.feature_unavailable_at_decision).toBe(low.dataset.exclusions.feature_unavailable_at_decision);
    const laterCutoff = decisionAt + 11 * DAY_MS; expect(low.observations.some((row) => row.decisionTime >= laterCutoff)).toBe(true);
  });

  test("known positive control traverses actual feature, entry, label and shared evaluator code", async () => {
    const report = await runPipelinePositiveControl();
    expect(report.path).toContain("actual feature/entry/label engine"); expect(report.futureInformationUsed).toBe(false); expect(report.observations).toBeGreaterThan(100); expect(report.uniqueAssets).toBe(3); expect(report.detectedConstructedEffect).toBe(true);
  });

});
