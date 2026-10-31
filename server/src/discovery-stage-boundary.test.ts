import { describe, expect, test } from "bun:test";
import {
DISCOVERY_PIPELINE_STAGE_BUDGET_MS,
DISCOVERY_PIPELINE_STAGES,
DISCOVERY_PIPELINE_TOTAL_BUDGET_MS,
DISCOVERY_TAIL_DB_STEP_BUDGET_MS,
pipelineStageDef,
} from "./discovery-pipeline";
import {
captureStageBoundaryCapture,
discoveryCheckpointStageBoundary,
discoveryStageBoundaryOperation,
withStageBoundaryCapture,
type DiscoveryCaptureFn,
type DiscoveryStageBoundaryId,
} from "./discovery-write-capture";
import {
runDiscoveryTail,
type DiscoveryTailGuaranteeOutcome,
type DiscoveryTailPersistenceResult,
type DiscoveryTailTheoryResult,
} from "./discovery-tail-guarantee";
import {
clearFallbackWriteFailures,
getFallbackWriteFailures,
recordWriteFailure as recordWriteFailureRow,
WRITE_FAILURE_SCHEMA_VERSION,
type WriteFailureCaptureValues,
} from "./write-failure-capture";

// ── Stage-boundary hardening (run-239 class, 2026-10-30) ──────────────
// Run 239 finished scoring and died between scoring and the handoff with
// no error text and no capture row. This suite proves the two new pieces:
//  (1) every stage-boundary failure is captured through the existing
//      never-throwing capture path (same module, same lane, same
//      run-id correlation, original error rethrown unchanged);
//  (2) the post-scoring tail always ends in a handoff, an explicit
//      failure record, or — only when the record write itself fails —
//      a capture-only outcome. There is no silent outcome in the type.

const BOUNDARIES: Array<{ id: DiscoveryStageBoundaryId; tableName: string; statementKind: string }> = [
  { id: "catalog-scoring-checkpoint", tableName: "market_discovery_checkpoints", statementKind: "insert" },
  { id: "news-annotation", tableName: "market_discovery_checkpoints", statementKind: "insert" },
  { id: "theory-synthesis", tableName: "market_discovery_checkpoints", statementKind: "insert" },
  { id: "persistence-run-row", tableName: "market_discovery_runs", statementKind: "update" },
  { id: "persistence-rotation", tableName: "discovery_state", statementKind: "upsert" },
  { id: "persistence-signals", tableName: "discovery_signals", statementKind: "upsert" },
  { id: "persistence-news", tableName: "discovery_news", statementKind: "insert" },
  { id: "persistence-cleanup", tableName: "discovery_signals", statementKind: "delete" },
  { id: "persistence-summary", tableName: "market_discovery_runs", statementKind: "update" },
  // Section-level boundary: the tail orchestrator's whole-section
  // failure/timeout/incomplete-read-back capture (see the module note
  // on why its table is the handoff row itself).
  { id: "persistence-handoff", tableName: "paper_handoff_runs", statementKind: "insert" },
  // Pre-scoring checkpoint boundaries (same table as every checkpoint).
  { id: "tier-freshness", tableName: "market_discovery_checkpoints", statementKind: "insert" },
  { id: "api-budgets", tableName: "market_discovery_checkpoints", statementKind: "insert" },
  { id: "catalog-fetch-checkpoint", tableName: "market_discovery_checkpoints", statementKind: "insert" },
  { id: "velocity", tableName: "market_discovery_checkpoints", statementKind: "insert" },
  { id: "charts", tableName: "market_discovery_checkpoints", statementKind: "insert" },
  { id: "hyperliquid", tableName: "market_discovery_checkpoints", statementKind: "insert" },
];

function mockCaptureDb(failInsert = false) {
  const rows: WriteFailureCaptureValues[] = [];
  const insert = async (values: WriteFailureCaptureValues): Promise<void> => {
    if (failInsert) throw new Error("capture table unavailable");
    rows.push(values);
  };
  const capture: DiscoveryCaptureFn = (input) => recordWriteFailureRow(insert, input);
  return { rows, capture };
}

describe("stage-boundary capture — every boundary", () => {
  for (const boundary of BOUNDARIES) {
    test(`${boundary.id}: throw is captured at the boundary and the original error is rethrown unchanged`, async () => {
      const { rows, capture } = mockCaptureDb();
      const original = new Error(`boom at ${boundary.id}`);
      let thrown: unknown = null;
      try {
        await withStageBoundaryCapture(capture, { runId: 239, boundary: boundary.id }, async () => { throw original; });
      } catch (e) { thrown = e; }
      expect(thrown).toBe(original);
      expect(rows).toHaveLength(1);
      const row = rows[0]!;
      expect(row.lane).toBe("discovery");
      expect(row.operation).toBe(`discovery:stage-boundary:${boundary.id}`);
      expect(row.operation).toBe(discoveryStageBoundaryOperation(boundary.id));
      expect(row.tableName).toBe(boundary.tableName);
      expect(row.statementKind).toBe(boundary.statementKind);
      expect(row.schemaVersion).toBe(WRITE_FAILURE_SCHEMA_VERSION);
      expect(row.runId).toBe("239");
      expect(row.attemptedKey).toBe("239");
      expect(row.errorText).toContain(`boom at ${boundary.id}`);
      expect("id" in row).toBe(false);
      const ctx = JSON.parse(row.contextJson ?? "{}") as Record<string, unknown>;
      expect(ctx.boundary).toBe(boundary.id);
      expect(ctx.stage).toBe(boundary.id);
    });
  }

  test("success path: value passes through unchanged and nothing is captured at any boundary", async () => {
    const { rows, capture } = mockCaptureDb();
    const payload = { ok: true };
    for (const boundary of BOUNDARIES) {
      expect(await withStageBoundaryCapture(capture, { runId: 239, boundary: boundary.id }, async () => payload)).toBe(payload);
    }
    expect(rows).toHaveLength(0);
  });

  test("capture-only form records the same row without running work", async () => {
    const { rows, capture } = mockCaptureDb();
    const result = await captureStageBoundaryCapture(capture, { runId: 239, boundary: "theory-synthesis" }, new Error("synthesis timed out"));
    expect(result).toEqual({ captured: true });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.operation).toBe("discovery:stage-boundary:theory-synthesis");
    expect(rows[0]!.errorText).toContain("synthesis timed out");
  });

  test("capture-insert failure: verbatim capture reaches the independent fallback and the original error is still rethrown", async () => {
    clearFallbackWriteFailures();
    const { capture } = mockCaptureDb(true);
    const original = new Error("SQLITE_BUSY: cannot commit transaction - database is locked");
    let thrown: unknown = null;
    try {
      await withStageBoundaryCapture(capture, { runId: 239, boundary: "persistence-signals" }, async () => { throw original; });
    } catch (e) { thrown = e; }
    expect(thrown).toBe(original);
    const fallback = getFallbackWriteFailures();
    expect(fallback).toHaveLength(1);
    expect(fallback[0]?.operation).toBe("discovery:stage-boundary:persistence-signals");
    expect(fallback[0]?.runId).toBe("239");
    expect(fallback[0]?.errorText).toContain("SQLITE_BUSY");
    clearFallbackWriteFailures();
  });

  test("unknown boundary id fails loudly instead of dropping the capture silently", async () => {
    const { capture } = mockCaptureDb();
    let thrown: unknown = null;
    try {
      await captureStageBoundaryCapture(
        capture,
        { runId: 239, boundary: "persistence-mystery" as DiscoveryStageBoundaryId },
        new Error("boom"),
      );
    } catch (e) { thrown = e; }
    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain("Unknown discovery stage boundary: persistence-mystery");
  });

  test("checkpoint-stage map is total over every discoveryCheckpoint stage the run uses", () => {
    // Every stage name passed to discoveryCheckpoint in
    // runMarketDiscovery, mapped to exactly one boundary.
    expect(discoveryCheckpointStageBoundary("tier-freshness")).toBe("tier-freshness");
    expect(discoveryCheckpointStageBoundary("api-budgets")).toBe("api-budgets");
    expect(discoveryCheckpointStageBoundary("catalog-fetch")).toBe("catalog-fetch-checkpoint");
    expect(discoveryCheckpointStageBoundary("velocity")).toBe("velocity");
    expect(discoveryCheckpointStageBoundary("charts")).toBe("charts");
    expect(discoveryCheckpointStageBoundary("hyperliquid")).toBe("hyperliquid");
    expect(discoveryCheckpointStageBoundary("scoring")).toBe("catalog-scoring-checkpoint");
    expect(discoveryCheckpointStageBoundary("catalog-scoring")).toBe("catalog-scoring-checkpoint");
    expect(discoveryCheckpointStageBoundary("news-annotation")).toBe("news-annotation");
    expect(discoveryCheckpointStageBoundary("synthesis")).toBe("theory-synthesis");
    expect(discoveryCheckpointStageBoundary("theory-synthesis")).toBe("theory-synthesis");
    expect(discoveryCheckpointStageBoundary("persistence")).toBe("persistence-handoff");
    expect(discoveryCheckpointStageBoundary("persistence-handoff")).toBe("persistence-handoff");
    expect(() => discoveryCheckpointStageBoundary("no-such-stage")).toThrow("Unknown discovery checkpoint stage: no-such-stage");
  });
});

// ── Tail guarantee matrix ───────────────────────────────────────────────

type CaptureCall = { operation: string; errorText: string };

function mockTailCapture() {
  const calls: CaptureCall[] = [];
  const capture: DiscoveryCaptureFn = async (input) => {
    calls.push({ operation: input.operation ?? "", errorText: input.error instanceof Error ? input.error.message : String(input.error) });
    return { captured: true };
  };
  return { calls, capture };
}

const okTheory = (): Promise<DiscoveryTailTheoryResult> => Promise.resolve({ status: "completed" });
const okPersistence = (handoffId = 141): Promise<DiscoveryTailPersistenceResult> =>
  Promise.resolve({ handoffId, handoffStatus: "complete" });
const okRecord = (id = 140) => async (_reason: string): Promise<number | null> => id;

async function runTail(overrides: {
  theory?: () => Promise<DiscoveryTailTheoryResult>;
  persistence?: () => Promise<DiscoveryTailPersistenceResult>;
  recordFailure?: (reason: string) => Promise<number | null>;
  capture?: DiscoveryCaptureFn;
  theoryBudgetMs?: number;
  persistenceBudgetMs?: number;
}): Promise<{ outcome: DiscoveryTailGuaranteeOutcome; captures: CaptureCall[]; recordReasons: string[] }> {
  const { calls, capture } = mockTailCapture();
  const recordReasons: string[] = [];
  const recordFailure = overrides.recordFailure ?? (async (reason: string) => { recordReasons.push(reason); return 140; });
  const outcome = await runDiscoveryTail({
    capture: overrides.capture ?? capture,
    runId: 239,
    theoryBudgetMs: overrides.theoryBudgetMs ?? 120_000,
    persistenceBudgetMs: overrides.persistenceBudgetMs ?? 120_000,
    theory: overrides.theory ?? okTheory,
    persistence: overrides.persistence ?? okPersistence,
    recordFailure,
  });
  return { outcome, captures: calls, recordReasons };
}

describe("tail guarantee — happy path and degraded handoff", () => {
  test("happy path: handoff, not degraded, no captures, no failure record", async () => {
    const { outcome, captures, recordReasons } = await runTail({});
    expect(outcome).toEqual({ outcome: "handoff", handoffId: 141, theoryStatus: "completed", degraded: false });
    expect(captures).toHaveLength(0);
    expect(recordReasons).toHaveLength(0);
  });

  test("theory throw: handoff still minted, degraded, theory boundary captured, persistence still ran", async () => {
    let persistenceRan = false;
    const { outcome, captures } = await runTail({
      theory: async () => { throw new Error("inference provider down"); },
      persistence: async () => { persistenceRan = true; return { handoffId: 141, handoffStatus: "complete" }; },
    });
    expect(outcome).toEqual({ outcome: "handoff", handoffId: 141, theoryStatus: "failed", degraded: true });
    expect(persistenceRan).toBe(true);
    expect(captures).toHaveLength(1);
    expect(captures[0]!.operation).toBe("discovery:stage-boundary:theory-synthesis");
    expect(captures[0]!.errorText).toContain("inference provider down");
  });

  test("theory failed-with-detail: handoff, degraded, detail captured verbatim", async () => {
    const { outcome, captures } = await runTail({
      theory: async () => ({ status: "failed", error: "theory synthesis exceeded 120s" }),
    });
    expect(outcome.outcome).toBe("handoff");
    if (outcome.outcome === "handoff") expect(outcome.degraded).toBe(true);
    expect(captures).toHaveLength(1);
    expect(captures[0]!.errorText).toContain("theory synthesis exceeded 120s");
  });

  test("theory deferred: handoff, degraded, no capture — deferral is a planned gate outcome, not a failure", async () => {
    const { outcome, captures } = await runTail({
      theory: async () => ({ status: "deferred" }),
    });
    expect(outcome).toEqual({ outcome: "handoff", handoffId: 141, theoryStatus: "deferred", degraded: true });
    expect(captures).toHaveLength(0);
  });

  test("theory timeout: hang becomes a timeout outcome, captured, handoff still minted degraded", async () => {
    const { outcome, captures } = await runTail({
      theory: () => new Promise<DiscoveryTailTheoryResult>(() => {}),
      theoryBudgetMs: 20,
    });
    expect(outcome.outcome).toBe("handoff");
    if (outcome.outcome === "handoff") expect(outcome.degraded).toBe(true);
    expect(captures).toHaveLength(1);
    expect(captures[0]!.errorText).toContain("timeout");
  });
});

describe("tail guarantee — persistence failure always ends in a record, never silence", () => {
  test("persistence throw: explicit failure record, capture at the persistence boundary, reason names the step", async () => {
    const { outcome, captures, recordReasons } = await runTail({
      persistence: async () => { throw new Error("SQLITE_BUSY: database is locked"); },
    });
    expect(outcome.outcome).toBe("explicit_failure_recorded");
    if (outcome.outcome === "explicit_failure_recorded") {
      expect(outcome.recordId).toBe(140);
      expect(outcome.failedStep).toBe("persistence_handoff");
    }
    expect(captures).toHaveLength(1);
    expect(captures[0]!.operation).toBe("discovery:stage-boundary:persistence-handoff");
    expect(captures[0]!.errorText).toContain("SQLITE_BUSY");
    expect(recordReasons).toHaveLength(1);
    expect(recordReasons[0]).toContain("persistence_handoff");
  });

  test("persistence hang: timeout becomes a failure record, not a frozen row (the 239 class)", async () => {
    const { outcome, captures, recordReasons } = await runTail({
      persistence: () => new Promise<DiscoveryTailPersistenceResult>(() => {}),
      persistenceBudgetMs: 20,
    });
    expect(outcome.outcome).toBe("explicit_failure_recorded");
    expect(captures).toHaveLength(1);
    expect(captures[0]!.errorText).toContain("timeout");
    expect(recordReasons).toHaveLength(1);
    expect(recordReasons[0]).toContain("timeout");
  });

  test("persistence slow work past the budget: same timeout outcome (race, not just never-settling)", async () => {
    const { outcome } = await runTail({
      persistence: () => new Promise<DiscoveryTailPersistenceResult>((resolve) => setTimeout(() => resolve({ handoffId: 141, handoffStatus: "complete" }), 200)),
      persistenceBudgetMs: 20,
    });
    expect(outcome.outcome).toBe("explicit_failure_recorded");
  });

  test("persistence completes without a complete handoff (read-back failed/building): failure record, not a handoff claim", async () => {
    for (const handoffStatus of ["failed", "building", null] as const) {
      const { outcome, captures } = await runTail({
        persistence: async () => ({ handoffId: null, handoffStatus }),
      });
      expect(outcome.outcome).toBe("explicit_failure_recorded");
      expect(captures).toHaveLength(1);
      expect(captures[0]!.operation).toBe("discovery:stage-boundary:persistence-handoff");
    }
  });

  test("record write itself throws: capture_only outcome — never throws, never silent (the genuinely-impossible case)", async () => {
    const { outcome, captures } = await runTail({
      persistence: async () => { throw new Error("handoff mint failed"); },
      recordFailure: async () => { throw new Error("failure-record table unavailable"); },
    });
    expect(outcome.outcome).toBe("capture_only");
    if (outcome.outcome === "capture_only") {
      expect(outcome.failedStep).toBe("persistence_handoff");
      expect(outcome.detail).toContain("could not be written");
    }
    expect(captures).toHaveLength(1);
  });

  test("record write returns null: capture_only outcome", async () => {
    const { outcome } = await runTail({
      persistence: async () => { throw new Error("handoff mint failed"); },
      recordFailure: async () => null,
    });
    expect(outcome.outcome).toBe("capture_only");
  });

  test("capture fn itself throws: outcome still returned — capture can never mask the guarantee", async () => {
    const throwingCapture: DiscoveryCaptureFn = async () => { throw new Error("capture down"); };
    const { outcome } = await runTail({
      persistence: async () => { throw new Error("mint failed"); },
      capture: throwingCapture,
    });
    expect(outcome.outcome).toBe("explicit_failure_recorded");
    const { outcome: happy } = await runTail({ capture: throwingCapture });
    expect(happy.outcome).toBe("handoff");
  });
});

describe("tail guarantee — exhaustive outcome matrix (no silent variant exists)", () => {
  test("every theory × persistence combination ends in handoff, failure record, or capture_only", async () => {
    const theories: Array<{ name: string; fn: () => Promise<DiscoveryTailTheoryResult>; budgetMs?: number }> = [
      { name: "completed", fn: okTheory },
      { name: "failed-detail", fn: async () => ({ status: "failed", error: "isolated failure" }) },
      { name: "deferred", fn: async () => ({ status: "deferred" }) },
      { name: "throw", fn: async () => { throw new Error("theory boom"); } },
      { name: "timeout", fn: () => new Promise<DiscoveryTailTheoryResult>(() => {}), budgetMs: 10 },
    ];
    const persistences: Array<{ name: string; fn: () => Promise<DiscoveryTailPersistenceResult>; budgetMs?: number }> = [
      { name: "complete", fn: okPersistence },
      { name: "failed-status", fn: async () => ({ handoffId: null, handoffStatus: "failed" as const }) },
      { name: "null-status", fn: async () => ({ handoffId: null, handoffStatus: null }) },
      { name: "throw", fn: async () => { throw new Error("persistence boom"); } },
      { name: "timeout", fn: () => new Promise<DiscoveryTailPersistenceResult>(() => {}), budgetMs: 10 },
    ];
    for (const theory of theories) {
      for (const persistence of persistences) {
        const { outcome } = await runTail({
          theory: theory.fn,
          theoryBudgetMs: theory.budgetMs ?? 120_000,
          persistence: persistence.fn,
          persistenceBudgetMs: persistence.budgetMs ?? 120_000,
        });
        expect(["handoff", "explicit_failure_recorded", "capture_only"]).toContain(outcome.outcome);
        // The handoff outcome is reachable ONLY via a complete read-back.
        if (outcome.outcome === "handoff") expect(persistence.name).toBe("complete");
        if (persistence.name === "complete") expect(outcome.outcome).toBe("handoff");
      }
    }
  });
});

// ── Unchanged behavior pins ─────────────────────────────────────────────
// The patch adds capture + bounds + the tail outcome. It moves no budget,
// no stage, no policy, no gate, no threshold, no freeze, no cadence.

describe("unchanged behavior pins", () => {
  test("exactly four pipeline stages, in the agreed order, with the agreed checkpoints", () => {
    expect(DISCOVERY_PIPELINE_STAGES.map((stage) => stage.id)).toEqual([
      "catalog_scoring",
      "news_annotation",
      "theory_synthesis",
      "persistence_handoff",
    ]);
    expect(DISCOVERY_PIPELINE_STAGES.map((stage) => stage.checkpointStage)).toEqual([
      "catalog-scoring",
      "news-annotation",
      "theory-synthesis",
      "persistence-handoff",
    ]);
  });

  test("stage budgets and total are pinned — the tail wiring passes these existing budgets, it invents none", () => {
    expect(DISCOVERY_PIPELINE_STAGE_BUDGET_MS.catalog_scoring).toBe(12 * 60_000);
    expect(DISCOVERY_PIPELINE_STAGE_BUDGET_MS.news_annotation).toBe(180_000);
    expect(DISCOVERY_PIPELINE_STAGE_BUDGET_MS.theory_synthesis).toBe(120_000);
    expect(DISCOVERY_PIPELINE_STAGE_BUDGET_MS.persistence_handoff).toBe(2 * 60_000);
    expect(DISCOVERY_PIPELINE_TOTAL_BUDGET_MS).toBe(12 * 60_000 + 180_000 + 120_000 + 2 * 60_000);
    expect(DISCOVERY_PIPELINE_TOTAL_BUDGET_MS).toBeLessThan(20 * 60_000);
    // The per-step tail bound is the patch's only new timing number:
    // 30 s against run 238's healthy ~6.2 s tail steps (~5x headroom).
    // It bounds awaits, never strategy, gates, or stage budgets.
    expect(DISCOVERY_TAIL_DB_STEP_BUDGET_MS).toBe(30_000);
    // The tail orchestrator takes budgets as arguments; the wiring
    // passes the pinned stage budgets above — no new budget numbers.
    expect(pipelineStageDef("theory_synthesis").failurePolicy).toBe("isolated");
    expect(pipelineStageDef("persistence_handoff").failurePolicy).toBe("must_leave_record");
    expect(pipelineStageDef("catalog_scoring").failurePolicy).toBe("fatal_core");
    expect(DISCOVERY_PIPELINE_STAGES.filter((stage) => stage.handoffDependency).map((stage) => stage.id)).toEqual(["catalog_scoring"]);
  });

  test("pre-scoring boundary failure still propagates (fatal_core preserved): capture names it, the catch still owns the run", async () => {
    // The boundary helper rethrows by contract — a core failure is
    // captured AND still fails the run; nothing here mints a handoff
    // for unscored work (the deliberate 222 narrowness, preserved).
    const { rows, capture } = mockCaptureDb();
    const original = new Error("catalog fetch failed");
    let thrown: unknown = null;
    try {
      await withStageBoundaryCapture(capture, { runId: 239, boundary: "catalog-scoring-checkpoint" }, async () => { throw original; });
    } catch (e) { thrown = e; }
    expect(thrown).toBe(original);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.operation).toBe("discovery:stage-boundary:catalog-scoring-checkpoint");
  });
});
