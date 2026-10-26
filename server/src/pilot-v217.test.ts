import { describe, expect, test } from "bun:test";
import {
  admissionLaneFor,
  buildPilotRunRecord,
  isPilotOnlyAdmission,
  PILOT_V217_BINANCE_UNIVERSE,
  PILOT_V217_EXCLUSIONS,
  PILOT_V217_VERSION,
  summarizePilotReview,
  type PilotRunRecord,
} from "./pilot-v217";

// paper-pilot-v2.1.7 activation contract tests (pure, deterministic):
// the frozen universe is the verified present set of 28 (BEAMX absent),
// the lane logic adds exactly one lane, every admitted candidate is
// evaluated or explicitly deferred, and the first-three-runs review
// fails loudly on unexplained omissions instead of hiding them.

describe("frozen v2.1.7 pilot universe", () => {
  test("is exactly the 28 verified present Binance instruments", () => {
    expect(PILOT_V217_BINANCE_UNIVERSE.length).toBe(28);
    const symbols = PILOT_V217_BINANCE_UNIVERSE.map((entry) => entry.symbol);
    expect(new Set(symbols).size).toBe(28);
    expect(symbols).not.toContain("BEAMX");
    expect(symbols).not.toContain("HYPE");
    expect(symbols).not.toContain("QNT");
    expect(symbols).not.toContain("GRASS");
    for (const entry of PILOT_V217_BINANCE_UNIVERSE) {
      expect(entry.instrument).toBe(`${entry.symbol}USDT`);
      expect(entry.coinId.length).toBeGreaterThan(0);
    }
  });

  test("vaulta maps by identity to AUSDT, never a ticker guess", () => {
    const vaulta = PILOT_V217_BINANCE_UNIVERSE.find((entry) => entry.coinId === "vaulta");
    expect(vaulta).toEqual({ coinId: "vaulta", symbol: "A", instrument: "AUSDT" });
  });

  test("exclusions record BEAMX, QNT and GRASS with their reasons", () => {
    const bySymbol = new Map(PILOT_V217_EXCLUSIONS.map((row) => [row.symbol, row.reason]));
    expect(bySymbol.get("BEAMX")).toContain("absent from the catalog");
    expect(bySymbol.get("QNT")).toContain("separate versioned mapping change");
    expect(bySymbol.get("GRASS")).toContain("not mapped");
  });
});

describe("admission lane", () => {
  const empty = new Set<string>();
  test("pilot-only admission is the sole new lane", () => {
    expect(admissionLaneFor({ coinId: "zcash", tier1Ids: empty, velocityIds: empty })).toBe("binance_pilot");
    expect(isPilotOnlyAdmission({ coinId: "zcash", tier1Ids: empty, velocityIds: empty })).toBe(true);
  });
  test("T1 and velocity keep their v2.1.6 meanings and combine honestly", () => {
    const t1 = new Set(["bitcoin"]);
    const velocity = new Set(["solana"]);
    expect(admissionLaneFor({ coinId: "bitcoin", tier1Ids: t1, velocityIds: empty })).toBe("t1+binance_pilot");
    expect(admissionLaneFor({ coinId: "solana", tier1Ids: empty, velocityIds: velocity })).toBe("velocity+binance_pilot");
    expect(admissionLaneFor({ coinId: "quant-network", tier1Ids: empty, velocityIds: empty })).toBe("none");
    expect(isPilotOnlyAdmission({ coinId: "bitcoin", tier1Ids: t1, velocityIds: empty })).toBe(false);
  });
});

describe("per-run pilot record", () => {
  test("absent members are explicitly deferred, never dropped", () => {
    const catalog = new Set(PILOT_V217_BINANCE_UNIVERSE.map((entry) => entry.coinId));
    catalog.delete("beam-2");
    catalog.delete("zcash");
    const dispositions = new Map<string, { status: string; stage: string; reason: string }>();
    for (const coinId of catalog) dispositions.set(coinId, { status: "excluded", stage: "strategy_eligibility", reason: "evaluated; eligibility not satisfied" });
    const record = buildPilotRunRecord({ catalogCoinIds: catalog, tier1Ids: new Set(), velocityIds: new Set(), scanDispositionByCoinId: dispositions });
    expect(record.version).toBe(PILOT_V217_VERSION);
    expect(record.universeCount).toBe(28);
    expect(record.missingDeferredSymbols).toEqual(["ZEC"]);
    expect(record.deferredCount).toBe(1);
    expect(record.evaluatedCount).toBe(27);
    expect(record.unexplainedOmissions).toBe(0);
    const zec = record.dispositions.find((row) => row.symbol === "ZEC");
    expect(zec?.disposition).toBe("deferred_not_in_catalog");
  });

  test("a present member with no scan disposition is an unexplained omission", () => {
    const catalog = new Set(PILOT_V217_BINANCE_UNIVERSE.map((entry) => entry.coinId));
    const record = buildPilotRunRecord({ catalogCoinIds: catalog, tier1Ids: new Set(), velocityIds: new Set(), scanDispositionByCoinId: new Map() });
    expect(record.unexplainedOmissions).toBe(28);
    expect(record.evaluatedCount).toBe(0);
  });
});

describe("first-three-runs review", () => {
  const fullRecord = (overrides: Partial<PilotRunRecord> = {}): PilotRunRecord => ({
    version: PILOT_V217_VERSION,
    activatedAt: "2026-10-26T19:06:00Z",
    universe: [...PILOT_V217_BINANCE_UNIVERSE],
    universeCount: 28,
    presentSymbols: [],
    missingDeferredSymbols: [],
    pilotOnlyAdmittedSymbols: [],
    evaluatedCount: 28,
    deferredCount: 0,
    unexplainedOmissions: 0,
    dispositions: [],
    ...overrides,
  });

  test("zero-issue runs with full accounting pass the review", () => {
    const review = summarizePilotReview([
      { runId: 201, status: "complete", record: fullRecord(), issuedCount: 0 },
      { runId: 202, status: "degraded", record: fullRecord({ evaluatedCount: 22, deferredCount: 6 }), issuedCount: 0 },
      { runId: 203, status: "complete", record: fullRecord(), issuedCount: 0 },
    ]);
    expect(review.reviewComplete).toBe(true);
    expect(review.totalIssued).toBe(0);
    expect(review.totalUnexplainedOmissions).toBe(0);
    expect(review.verdict).toContain("zero-issue outcome");
  });

  test("unexplained omissions fail the review verdict", () => {
    const review = summarizePilotReview([
      { runId: 201, status: "complete", record: fullRecord({ unexplainedOmissions: 2 }), issuedCount: 0 },
      { runId: 202, status: "complete", record: fullRecord(), issuedCount: 0 },
      { runId: 203, status: "complete", record: fullRecord(), issuedCount: 0 },
    ]);
    expect(review.reviewComplete).toBe(true);
    expect(review.verdict).toContain("NOT a pass");
  });

  test("fewer than three runs is pending, not complete", () => {
    const review = summarizePilotReview([{ runId: 201, status: "complete", record: fullRecord(), issuedCount: 0 }]);
    expect(review.reviewComplete).toBe(false);
    expect(review.completedRuns).toBe(1);
  });
});
