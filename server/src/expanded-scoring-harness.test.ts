import { describe, expect, test } from "bun:test";
import {
  HARNESS_SCORING_BUDGET_MS,
  PROVISIONAL_BINANCE_SPOT_29,
  ProductionWriteAttemptError,
  REHEARSAL_PER_CANDIDATE_EVIDENCE_DEADLINE_MS,
  WritesDisabledGuard,
  proveZeroProductionWrites,
  runExpandedScoringHarness,
  runLiveScoringRehearsal,
  type HarnessDeps,
  type HarnessDimension,
  type LiveRehearsalDeps,
} from "./expanded-scoring-harness";
import { buildInputFreshnessRecord, DECISION_INPUT_MAX_AGE_MS } from "./input-freshness";

// Q2 acceptance (expert direction 2026-10-25): the expanded scoring path
// runs in the harness before any activation, issuance and production
// writes disabled and PROVEN, per-asset timing/call/cache measurement
// recorded, velocity time separate from scoring time, duplicate scoring
// a failure, per-asset evaluated/not-evaluated reasons recorded.
// PAPER ONLY — no threshold, score, gate, or admission behaviour changes;
// the scorer injected here is a test double for the production rule.

const T0 = Date.parse("2026-10-25T17:00:00.000Z");

function fakeClock(stepMs = 5) {
  let t = 1_000_000;
  return () => { t += stepMs; return t; };
}

function dims(score: number): HarnessDimension[] {
  return [{ name: "Trend", status: "pass", contribution: score }];
}

function freshRecord(input: string) {
  return buildInputFreshnessRecord({
    input, requirement: "required", sourceTimeMs: T0 - 60_000, fetchTimeMs: T0, maxAgeMs: DECISION_INPUT_MAX_AGE_MS,
  });
}
function staleRecord(input: string) {
  return buildInputFreshnessRecord({
    input, requirement: "required", sourceTimeMs: T0 - 45 * 60_000, fetchTimeMs: T0, maxAgeMs: DECISION_INPUT_MAX_AGE_MS,
  });
}

/** A miniature catalog: BTC/ETH/SOL present and scorable, ADA present but
 * freshness-deferred, ZEC present with no ledger; the other 24 of the 29
 * absent. Tier-chart set is the full 208-asset tier set containing 3 of
 * the 29; history cache covers 2 of the 29. */
function makeDeps(overrides: Partial<HarnessDeps> = {}): HarnessDeps {
  const tierSet = new Set<string>();
  for (let i = 0; i < 205; i++) tierSet.add(`TIERONLY${i}`);
  tierSet.add("BTC"); tierSet.add("ETH"); tierSet.add("SOL"); // 208 total, 3 of the 29
  return {
    now: fakeClock(),
    guard: new WritesDisabledGuard(),
    catalogSymbols: new Set(["BTC", "ETH", "SOL", "ADA", "ZEC"]),
    tierChartSymbols: tierSet,
    tierSetSize: 208,
    historySymbols: new Set(["BTC", "ETH"]),
    runVelocityStage: async () => {},
    score: (dimensions) => {
      const production = dimensions.reduce((s, d) => s + d.contribution, 0);
      return { production, productionDecision: production >= 60 ? "trade" : "abstain" };
    },
    loadEvidence: async (symbol, recordCall) => {
      recordCall({ provider: "stored-snapshot", endpoint: "discovery_signals.dimensions" });
      if (symbol === "ADA") return { freshnessRecords: [staleRecord("catalog price")], dimensions: dims(70), direction: "long" };
      if (symbol === "ZEC") return { freshnessRecords: [freshRecord("catalog price")], dimensions: null, direction: "long" };
      if (symbol === "SOL") return { freshnessRecords: [freshRecord("catalog price")], dimensions: dims(40), direction: "short" };
      return { freshnessRecords: [freshRecord("catalog price")], dimensions: dims(70), direction: "long" };
    },
    ...overrides,
  };
}

describe("Q2 expanded-scoring harness — writes disabled and proven", () => {
  test("guard throws on every production write kind and counts the attempts", () => {
    const guard = new WritesDisabledGuard();
    const surface = guard.writeSurface();
    for (const kind of ["paper_signal_run", "paper_candidate_intake", "notification", "monitoring_enrollment", "production_decision"] as const) {
      expect(() => surface[kind]("test attempt")).toThrow(ProductionWriteAttemptError);
    }
    expect(guard.attempts).toBe(5);
    expect(guard.attemptLog).toHaveLength(5);
  });

  test("a full harness run creates zero production rows — proven by before/after counts", async () => {
    // Simulated production tables: the harness has no handle that can
    // write them; counts taken around the run must be identical.
    const tables = { paperSignalRuns: 143, paperCandidateIntake: 96, notifications: 12, monitoringEnrollments: 13 };
    const before = { ...tables };
    const report = await runExpandedScoringHarness(makeDeps());
    const proof = proveZeroProductionWrites(before, { ...tables });
    expect(report.status).toBe("complete");
    expect(proof.proven).toBe(true);
    expect(proof.created).toEqual({ paperSignalRuns: 0, paperCandidateIntake: 0, notifications: 0, monitoringEnrollments: 0 });
    expect(proof.detail).toContain("zero paper_signal_runs rows");
    expect(report.guard.installed).toBe(true);
    expect(report.guard.attempts).toBe(0); // scoring never even attempted a write
    // The proof itself detects a leak when counts move.
    const leaked = proveZeroProductionWrites(before, { ...tables, paperSignalRuns: tables.paperSignalRuns + 1 });
    expect(leaked.proven).toBe(false);
    expect(leaked.created.paperSignalRuns).toBe(1);
  });

  test("a scorer that tries to write through the guard fails the attempt, not the run silently", async () => {
    const guard = new WritesDisabledGuard();
    const deps = makeDeps({
      guard,
      score: (dimensions) => {
        expect(() => guard.writeSurface().paper_signal_run("issuance attempt")).toThrow(ProductionWriteAttemptError);
        const production = dimensions.reduce((s, d) => s + d.contribution, 0);
        return { production, productionDecision: "abstain" as const };
      },
    });
    const report = await runExpandedScoringHarness(deps);
    expect(report.guard.attempts).toBeGreaterThan(0);
    expect(report.guard.attemptLog[0]?.kind).toBe("paper_signal_run");
  });
});

describe("Q2 expanded-scoring harness — measurement", () => {
  test("per-asset timing and provider-call measurement are recorded; totals are consistent", async () => {
    const report = await runExpandedScoringHarness(makeDeps());
    expect(report.requestedCount).toBe(29);
    expect(report.assets).toHaveLength(29);
    for (const asset of report.assets) {
      expect(asset.evidenceLoadMs).toBeGreaterThanOrEqual(0);
      expect(asset.scoringMs).toBeGreaterThanOrEqual(0);
    }
    const evaluated = report.assets.filter((a) => a.evaluated);
    expect(evaluated.length).toBe(3); // BTC, ETH (would trade), SOL (would abstain)
    expect(evaluated.every((a) => a.scoringMs > 0)).toBe(true);
    expect(report.scoringMs).toBeGreaterThan(0);
    expect(report.evidenceLoadMs).toBeGreaterThan(0);
    expect(report.evidenceLoadMs).toBe(report.assets.reduce((s, a) => s + a.evidenceLoadMs, 0));
    // Provider calls aggregated by provider + endpoint: one stored-evidence
    // read per catalog-present asset (5), zero external provider calls.
    expect(report.providerCallTotal).toBe(5);
    expect(report.providerCalls).toEqual([{ provider: "stored-snapshot", endpoint: "discovery_signals.dimensions", count: 5 }]);
    expect(report.sharedSnapshotLoads).toEqual({ catalog: 1, tierCharts: 1, history: 1 });
  });

  test("velocity stage time is reported separately from scoring stage time", async () => {
    let t = 0;
    const deps = makeDeps({
      now: () => { t += 10; return t; },
      runVelocityStage: async () => { t += 5_000; }, // velocity work advances the clock 5s
    });
    const report = await runExpandedScoringHarness(deps);
    expect(report.velocityMs).toBeGreaterThanOrEqual(5_000);
    // Scoring time must NOT include the velocity stage's 5 seconds.
    expect(report.scoringMs).toBeLessThan(5_000);
    expect(report.scoringMs).not.toBe(report.velocityMs);
  });

  test("scoring budget is the existing 120s and is never raised by the harness", () => {
    expect(HARNESS_SCORING_BUDGET_MS).toBe(120_000);
  });
});

describe("Q2 expanded-scoring harness — cache reuse and tier overlap", () => {
  test("cache hits/misses measured for catalog, tier charts, and history, including the 29-vs-208 overlap", async () => {
    const report = await runExpandedScoringHarness(makeDeps());
    expect(report.cache.catalog).toEqual({ hits: 5, misses: 24 });
    expect(report.cache.tierCharts.tierSetSize).toBe(208);
    expect(report.cache.tierCharts.overlapOf29).toBe(3); // BTC, ETH, SOL of the 29
    expect(report.cache.tierCharts.hits).toBe(3);
    expect(report.cache.tierCharts.misses).toBe(26);
    expect(report.cache.history).toEqual({ hits: 2, misses: 27 });
    const btc = report.assets.find((a) => a.symbol === "BTC");
    expect(btc?.cache).toEqual({ catalog: "hit", tierChart: "hit", history: "hit" });
    const zec = report.assets.find((a) => a.symbol === "ZEC");
    expect(zec?.cache).toEqual({ catalog: "hit", tierChart: "miss", history: "miss" });
  });

  test("the provisional list is exactly the named 29 Binance Spot USDT instruments", () => {
    expect(PROVISIONAL_BINANCE_SPOT_29).toHaveLength(29);
    expect(PROVISIONAL_BINANCE_SPOT_29.map((r) => r.symbol)).toEqual([
      "ALT", "AMP", "AVAX", "BAT", "BEAMX", "BTC", "ADA", "LINK", "COMP", "CVX",
      "CRV", "DOGE", "ENA", "ETH", "ZRO", "NEAR", "PEPE", "PROM", "PUMP", "PYTH",
      "RAY", "XRP", "SOL", "SUI", "A", "WLD", "W", "ZAMA", "ZEC",
    ]);
    expect(PROVISIONAL_BINANCE_SPOT_29.every((r) => r.instrument === `${r.symbol}USDT`)).toBe(true);
  });
});

describe("Q2 expanded-scoring harness — duplicate scoring and per-asset reasons", () => {
  test("duplicate scoring of one asset in one run is detected as a failure", async () => {
    const requested = [
      { symbol: "BTC", instrument: "BTCUSDT" },
      { symbol: "BTC", instrument: "BTCUSDT" },
    ];
    const report = await runExpandedScoringHarness(makeDeps({ requested }));
    expect(report.duplicateScoringDetected).toBe(true);
    expect(report.scoringCounts.BTC).toBe(2);
    expect(report.status).toBe("failed");
    expect(report.failureReasons.join(" ")).toContain("duplicate scoring detected for BTC");
  });

  test("no duplicates in a normal run: duplicate flag stays false and every asset is scored at most once", async () => {
    const report = await runExpandedScoringHarness(makeDeps());
    expect(report.duplicateScoringDetected).toBe(false);
    expect(Object.values(report.scoringCounts).every((c) => c === 1)).toBe(true);
  });

  test("per-asset evaluated / not-evaluated reasons are recorded, including the Q1 freshness deferral", async () => {
    const report = await runExpandedScoringHarness(makeDeps());
    const bySymbol = new Map(report.assets.map((a) => [a.symbol, a]));
    // Evaluated with harness verdicts only.
    expect(bySymbol.get("BTC")?.evaluated).toBe(true);
    expect(bySymbol.get("BTC")?.harnessVerdict).toBe("would_trade");
    expect(bySymbol.get("BTC")?.productionScore).toBe(70);
    expect(bySymbol.get("SOL")?.harnessVerdict).toBe("would_abstain");
    // Q1 freshness deferral: exact reason carried through.
    const ada = bySymbol.get("ADA");
    expect(ada?.evaluated).toBe(false);
    expect(ada?.notEvaluatedReason).toContain("deferred — required input stale (catalog price)");
    expect(ada?.harnessVerdict).toBeNull();
    expect(ada?.freshnessRecords[0]?.status).toBe("stale");
    // No ledger.
    expect(bySymbol.get("ZEC")?.notEvaluatedReason).toContain("no dimension ledger");
    // Absent from catalog.
    const wld = bySymbol.get("WLD");
    expect(wld?.presentInCatalog).toBe(false);
    expect(wld?.notEvaluatedReason).toContain("not present in the harness catalog");
    // Every not-evaluated asset carries a reason; every evaluated asset carries none.
    for (const asset of report.assets) {
      if (asset.evaluated) expect(asset.notEvaluatedReason).toBeNull();
      else expect(asset.notEvaluatedReason).toBeTruthy();
    }
    expect(report.evaluatedCount + report.notEvaluatedCount).toBe(29);
  });
});

// Live workload rehearsal (expert direction 2026-10-26): the production
// scorer + provider adapters over the verified set, writes disabled,
// isolated cache; external calls counted separately from stored reads;
// fetch/evidence, scoring and total time separate; evidence inside the
// scoring scope counts against the budget; the actual paper-path
// freshness gate decides deferrals.
describe("live scoring rehearsal", () => {
  const DECISION = T0;
  function rehearsalDeps(overrides: Partial<LiveRehearsalDeps> = {}): { deps: LiveRehearsalDeps; advance: (ms: number) => void } {
    let t = DECISION;
    const deps: LiveRehearsalDeps = {
      now: () => t,
      guard: new WritesDisabledGuard(),
      requested: [
        { symbol: "AAA", instrument: "AAAUSDT", coinId: "aaa" },
        { symbol: "BBB", instrument: "BBBUSDT", coinId: "bbb" },
      ],
      catalogSymbols: new Set(["AAA", "BBB"]),
      decisionAtMs: DECISION,
      frozenAtMs: DECISION - 86_400_000,
      loadStoredDimensions: async (_symbol, record) => {
        record({ source: "discovery_signals.dimensions" });
        return { dimensions: dims(70), direction: "long" as const };
      },
      fetchEvidence: async (_entry, _deadline, record) => {
        record({ provider: "binance-spot", endpoint: "klines/1d" });
        record({ provider: "coingecko", endpoint: "coins/markets (batch)" });
        t += 1_000;
        return { sourceTimeMs: DECISION - 60_000, klines: { barCount: 35, lastCompletedCloseMs: DECISION - 3_600_000 }, trades: { printCount: 4 } };
      },
      score: (dimensions) => ({ production: dimensions[0]!.contribution, productionDecision: "trade" as const }),
      ...overrides,
    };
    return { deps, advance: (ms: number) => { t += ms; } };
  }

  test("external calls and stored reads are counted separately; stage times stay separate", async () => {
    const { deps } = rehearsalDeps();
    const report = await runLiveScoringRehearsal(deps);
    expect(report.mode).toBe("live-rehearsal");
    expect(report.status).toBe("complete");
    expect(report.evaluatedCount).toBe(2);
    expect(report.externalCallTotal).toBe(4);
    expect(report.externalCalls.find((c) => c.endpoint === "klines/1d")?.count).toBe(2);
    expect(report.storedReadTotal).toBe(2);
    expect(report.storedReads[0]?.source).toBe("discovery_signals.dimensions");
    expect(report.fetchEvidenceMs).toBe(2_000);
    expect(report.scoringMs).toBe(0);
    expect(report.totalMs).toBeGreaterThanOrEqual(report.fetchEvidenceMs);
    expect(report.timeoutScopes.scoringStageBudgetMs).toBe(HARNESS_SCORING_BUDGET_MS);
    expect(report.timeoutScopes.perCandidateEvidenceDeadlineMs).toBe(REHEARSAL_PER_CANDIDATE_EVIDENCE_DEADLINE_MS);
  });

  test("stale live evidence defers through the actual paper-path gate (stale_decision_inputs)", async () => {
    const { deps } = rehearsalDeps({
      fetchEvidence: async () => ({ sourceTimeMs: DECISION - DECISION_INPUT_MAX_AGE_MS - 1, klines: null, trades: null }),
    });
    const report = await runLiveScoringRehearsal(deps);
    expect(report.evaluatedCount).toBe(0);
    expect(report.deferredCount).toBe(2);
    for (const asset of report.assets) {
      expect(asset.freshnessGate).toBe("stale_decision_inputs");
      expect(asset.notEvaluatedReason).toContain("stale_decision_inputs");
    }
  });

  test("missing live evidence timestamp defers as decision_input_unverified", async () => {
    const { deps } = rehearsalDeps({
      fetchEvidence: async () => ({ sourceTimeMs: null, klines: null, trades: null }),
    });
    const report = await runLiveScoringRehearsal(deps);
    expect(report.assets.every((a) => a.freshnessGate === "decision_input_unverified")).toBe(true);
  });

  test("an evidence load past the per-candidate deadline defers that candidate, explicitly", async () => {
    let t = DECISION;
    const { deps } = rehearsalDeps({
      now: () => t,
      fetchEvidence: async () => { t += REHEARSAL_PER_CANDIDATE_EVIDENCE_DEADLINE_MS + 1; return { sourceTimeMs: DECISION, klines: null, trades: null }; },
    });
    const report = await runLiveScoringRehearsal(deps);
    expect(report.evaluatedCount).toBe(0);
    expect(report.assets[0]?.notEvaluatedReason).toContain("per-candidate deadline");
  });

  test("evidence time inside the scoring scope counts against the budget: later candidates defer explicitly, never silently", async () => {
    let t = DECISION;
    const { deps } = rehearsalDeps({
      now: () => t,
      requested: [
        { symbol: "AAA", instrument: "AAAUSDT", coinId: "aaa" },
        { symbol: "BBB", instrument: "BBBUSDT", coinId: "bbb" },
        { symbol: "CCC", instrument: "CCCUSDT", coinId: "ccc" },
      ],
      catalogSymbols: new Set(["AAA", "BBB", "CCC"]),
      fetchEvidence: async () => { t += 50_000; return { sourceTimeMs: DECISION - 60_000, klines: null, trades: null }; },
    });
    const report = await runLiveScoringRehearsal(deps);
    // 50s + 50s of evidence inside the scope; the third candidate starts
    // after 100s and its evidence pushes the scope past 120s mid-flight,
    // so a fourth would defer — here the third still evaluates, and the
    // scope overrun is reported as a failed budget, not hidden.
    expect(report.assets.filter((a) => a.evaluated).length).toBe(3);
    expect(report.overScoringBudget).toBe(true);
    expect(report.status).toBe("failed");
  });

  test("budget exhaustion before a candidate starts defers it with the budget reason", async () => {
    let t = DECISION;
    const { deps } = rehearsalDeps({
      now: () => t,
      requested: [
        { symbol: "AAA", instrument: "AAAUSDT", coinId: "aaa" },
        { symbol: "BBB", instrument: "BBBUSDT", coinId: "bbb" },
        { symbol: "CCC", instrument: "CCCUSDT", coinId: "ccc" },
      ],
      catalogSymbols: new Set(["AAA", "BBB", "CCC"]),
      fetchEvidence: async () => { t += 70_000; return { sourceTimeMs: DECISION - 60_000, klines: null, trades: null }; },
    });
    const report = await runLiveScoringRehearsal(deps);
    const deferred = report.assets.filter((a) => !a.evaluated);
    expect(deferred.length).toBeGreaterThan(0);
    expect(deferred.some((a) => (a.notEvaluatedReason ?? "").includes("scoring budget exhausted"))).toBe(true);
  });
});
