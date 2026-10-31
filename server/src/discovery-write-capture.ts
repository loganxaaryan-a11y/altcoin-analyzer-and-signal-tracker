// Discovery write-failure capture wiring (§A6 builder brief,
// repair-2026-10-27-consolidated.md; fixes-needed-2026-10-28 item 3).
//
// Three previously unwrapped failure points behind the null-id class:
//   - 205/208: the discovery-run commit at catalog-fetch (the checkpoint
//     batch that updates market_discovery_runs for the catalog-fetch stage)
//   - 209: the run-finalization update (market_discovery_runs status →
//     terminal) and persistPaperHandoffSnapshot's building→complete
//     transition (paper_handoff_runs status → complete)
//
// All other major call sites already wrap their writes in
// recordWriteFailure; these three had no capture call site, which is why
// getWriteFailureCaptures returned total 0 for this class.
//
// This module is the single wired path for those three points. It reuses
// the existing write-failure-capture module (via the caller-supplied
// capture function, which in actions.ts is the ctx-bound
// recordWriteFailure that inserts into write_failure_captures and prunes):
// lane is always "discovery", each point carries its own operation name,
// the run id is the correlation id, and the ORIGINAL error is rethrown
// unchanged after capture — capture never masks, replaces, or swallows
// it, and capture failure itself falls back to the independent sink
// inside recordWriteFailure (structured log + in-memory buffer).
//
// No model, gate, threshold, freeze, entry-contract, or cadence change:
// this module only observes writes that already happen.

import type { WriteFailureInput } from "./write-failure-capture";

export const DISCOVERY_CATALOG_FETCH_COMMIT_OPERATION = "discovery:catalog-fetch-commit";
export const DISCOVERY_RUN_FINALIZATION_OPERATION = "discovery:run-finalization";
export const DISCOVERY_HANDOFF_BUILDING_TO_COMPLETE_OPERATION = "discovery:handoff-building-to-complete";

export type DiscoveryCaptureFn = (input: WriteFailureInput) => Promise<{ captured: boolean }>;

async function withDiscoveryCapture<T>(
  capture: DiscoveryCaptureFn,
  spec: { tableName: string; statementKind: string; operation: string; runId: string | number; attemptedKey: string; context: Record<string, unknown> },
  work: () => Promise<T>,
): Promise<T> {
  try {
    return await work();
  } catch (error) {
    await capture({
      lane: "discovery",
      tableName: spec.tableName,
      statementKind: spec.statementKind,
      operation: spec.operation,
      runId: spec.runId,
      attemptedKey: spec.attemptedKey,
      error,
      context: spec.context,
    });
    throw error;
  }
}

/** The discovery-run commit at catalog-fetch: the checkpoint batch that
 * persists the catalog-fetch stage onto market_discovery_runs. */
export async function withCatalogFetchCommitCapture<T>(
  capture: DiscoveryCaptureFn,
  runId: string | number,
  work: () => Promise<T>,
  context: Record<string, unknown> = {},
): Promise<T> {
  return withDiscoveryCapture(
    capture,
    {
      tableName: "market_discovery_runs",
      statementKind: "update",
      operation: DISCOVERY_CATALOG_FETCH_COMMIT_OPERATION,
      runId,
      attemptedKey: String(runId),
      context: { stage: "catalog-fetch", ...context },
    },
    work,
  );
}

/** The run-finalization update: market_discovery_runs status → terminal
 * (complete / degraded / empty) with completedAt. */
export async function withRunFinalizationCapture<T>(
  capture: DiscoveryCaptureFn,
  runId: string | number,
  work: () => Promise<T>,
  context: Record<string, unknown> = {},
): Promise<T> {
  return withDiscoveryCapture(
    capture,
    {
      tableName: "market_discovery_runs",
      statementKind: "update",
      operation: DISCOVERY_RUN_FINALIZATION_OPERATION,
      runId,
      attemptedKey: String(runId),
      context: { stage: "run-finalization", ...context },
    },
    work,
  );
}

/** persistPaperHandoffSnapshot's building→complete transition:
 * paper_handoff_runs status "building" → "complete". */
export async function withHandoffBuildingToCompleteCapture<T>(
  capture: DiscoveryCaptureFn,
  args: { discoveryRunId: string | number; handoffRunId: string | number },
  work: () => Promise<T>,
  context: Record<string, unknown> = {},
): Promise<T> {
  return withDiscoveryCapture(
    capture,
    {
      tableName: "paper_handoff_runs",
      statementKind: "update",
      operation: DISCOVERY_HANDOFF_BUILDING_TO_COMPLETE_OPERATION,
      runId: args.discoveryRunId,
      attemptedKey: String(args.handoffRunId),
      context: { stage: "handoff-building-to-complete", handoffRunId: String(args.handoffRunId), ...context },
    },
    work,
  );
}

// ── Stage-boundary capture (run-239 class, 2026-10-30) ────────────────
//
// Run 239 finished scoring (22 candidates stored) and then died between
// scoring and the handoff with no run-level error text and no capture
// row: getWriteFailureCaptures stayed 0 because the death was not a
// database error at any wired point — it was a stage-transition failure
// (a throw or a hang) at a boundary no capture call site covered. The
// news and theory sections already isolate their failures in source
// status and checkpoints, but neither wrote a capture row; the tail
// persistence sequence (run-row update, rotation upsert, signal/news
// writes, cleanup, summary update) had no capture call site at all
// except scanOperations and the handoff transition itself.
//
// This is the generic form of the three §A6 helpers above, not a
// parallel system: same withDiscoveryCapture core, same lane
// ("discovery"), same run-id correlation, same never-throwing capture
// (recordWriteFailure's own fallback sink), same original-error-rethrown
// contract. Each boundary names the table its stage was writing when it
// failed, so a capture row identifies the failing boundary, not just
// the run. The tail-guarantee orchestrator (discovery-tail-guarantee.ts)
// and the actions.ts wiring call these helpers at every pipeline-stage
// transition; a boundary failure is therefore always a capture row
// first, and the run's outcome (degraded handoff or explicit failure
// record) second — never silence.
//
// Deliberately NOT covered here: the platform worker process itself
// being killed (no in-run code runs after that — see the tail-guarantee
// module header). What this covers is every failure mode in which
// JavaScript still executes: throws, rejections, and hangs converted to
// rejections by a stage budget.

export type DiscoveryStageBoundaryId =
  | "catalog-scoring-checkpoint"
  | "news-annotation"
  | "theory-synthesis"
  | "persistence-run-row"
  | "persistence-rotation"
  | "persistence-signals"
  | "persistence-news"
  | "persistence-cleanup"
  | "persistence-summary"
  // Section-level boundary for the persistence section AS A WHOLE, used
  // by the tail orchestrator when the section fails, times out, or
  // reads back incomplete without a single sub-step having failed (the
  // sub-steps carry their own boundaries above when they throw). Its
  // table is the handoff row itself: the section's terminal obligation
  // is minting that row, and a section-level failure is, by definition,
  // the handoff row not landing complete.
  | "persistence-handoff"
  // Pre-scoring checkpoint boundaries. A hang at charts/hyperliquid is
  // the same silent-gap shape as run 239, only earlier; these keep
  // fatal_core semantics (no handoff is minted for unscored work — the
  // existing catch still owns the run) and only add the capture row
  // plus the batch bound. catalog-fetch keeps its §A6 point
  // (discovery:catalog-fetch-commit) AND gains a checkpoint boundary:
  // a batch throw yields both rows (same error, different operations —
  // the §A6 row names the driver failure, the boundary row names the
  // checkpoint transition), while a batch hang yields the boundary row
  // alone, because the §A6 capture only fires when the batch itself
  // rejects and a hung batch never rejects.
  | "tier-freshness"
  | "api-budgets"
  | "catalog-fetch-checkpoint"
  | "velocity"
  | "charts"
  | "hyperliquid";

export function discoveryStageBoundaryOperation(boundary: DiscoveryStageBoundaryId): string {
  return `discovery:stage-boundary:${boundary}`;
}

const STAGE_BOUNDARY_TABLES: Record<DiscoveryStageBoundaryId, { tableName: string; statementKind: string }> = {
  "catalog-scoring-checkpoint": { tableName: "market_discovery_checkpoints", statementKind: "insert" },
  "news-annotation": { tableName: "market_discovery_checkpoints", statementKind: "insert" },
  "theory-synthesis": { tableName: "market_discovery_checkpoints", statementKind: "insert" },
  "persistence-run-row": { tableName: "market_discovery_runs", statementKind: "update" },
  "persistence-rotation": { tableName: "discovery_state", statementKind: "upsert" },
  "persistence-signals": { tableName: "discovery_signals", statementKind: "upsert" },
  "persistence-news": { tableName: "discovery_news", statementKind: "insert" },
  "persistence-cleanup": { tableName: "discovery_signals", statementKind: "delete" },
  "persistence-summary": { tableName: "market_discovery_runs", statementKind: "update" },
  "persistence-handoff": { tableName: "paper_handoff_runs", statementKind: "insert" },
  "tier-freshness": { tableName: "market_discovery_checkpoints", statementKind: "insert" },
  "api-budgets": { tableName: "market_discovery_checkpoints", statementKind: "insert" },
  "catalog-fetch-checkpoint": { tableName: "market_discovery_checkpoints", statementKind: "insert" },
  "velocity": { tableName: "market_discovery_checkpoints", statementKind: "insert" },
  "charts": { tableName: "market_discovery_checkpoints", statementKind: "insert" },
  "hyperliquid": { tableName: "market_discovery_checkpoints", statementKind: "insert" },
};

/** Map a discoveryCheckpoint stage name to its capture boundary.
 * Sub-stage checkpoints map to their pipeline stage's boundary
 * (scoring → catalog-scoring-checkpoint, synthesis →
 * theory-synthesis, persistence → persistence-handoff); the table is
 * market_discovery_checkpoints either way. catalog-fetch keeps its §A6
 * point and gains a checkpoint boundary (see the type comment for why
 * both rows exist). Unknown stages throw loudly: a checkpoint stage
 * with no boundary must surface at wiring time, never vanish into an
 * unmapped capture. */
export function discoveryCheckpointStageBoundary(stage: string): DiscoveryStageBoundaryId {
  switch (stage) {
    case "tier-freshness": return "tier-freshness";
    case "api-budgets": return "api-budgets";
    case "catalog-fetch": return "catalog-fetch-checkpoint";
    case "velocity": return "velocity";
    case "charts": return "charts";
    case "hyperliquid": return "hyperliquid";
    case "scoring": return "catalog-scoring-checkpoint";
    case "catalog-scoring": return "catalog-scoring-checkpoint";
    case "news-annotation": return "news-annotation";
    case "synthesis": return "theory-synthesis";
    case "theory-synthesis": return "theory-synthesis";
    case "persistence": return "persistence-handoff";
    case "persistence-handoff": return "persistence-handoff";
    default: throw new Error(`Unknown discovery checkpoint stage: ${stage}`);
  }
}

/** Capture-only form: record a stage-boundary failure without running
 * work. The tail orchestrator calls this for outcomes it already holds
 * (a timeout, a failed-with-detail result, a non-complete read-back).
 * Never throws in production (the ctx-bound recordWriteFailure never
 * throws); callers that cannot assume that guard it anyway. */
export async function captureStageBoundaryCapture(
  capture: DiscoveryCaptureFn,
  args: { runId: string | number; boundary: DiscoveryStageBoundaryId },
  error: unknown,
  context: Record<string, unknown> = {},
): Promise<{ captured: boolean }> {
  const table = STAGE_BOUNDARY_TABLES[args.boundary];
  // Loud failure, not a silent drop: bun test does not typecheck, so a
  // misspelled boundary must surface here rather than vanishing inside
  // a swallowed capture (that exact slip hid the tail orchestrator's
  // section-level capture during this patch's own test run).
  if (!table) throw new Error(`Unknown discovery stage boundary: ${args.boundary}`);
  return capture({
    lane: "discovery",
    tableName: table.tableName,
    statementKind: table.statementKind,
    operation: discoveryStageBoundaryOperation(args.boundary),
    runId: args.runId,
    attemptedKey: String(args.runId),
    error,
    context: { stage: args.boundary, boundary: args.boundary, ...context },
  });
}

/** Wrapping form, same contract as the three §A6 helpers: on work
 * failure, capture at the boundary, then rethrow the ORIGINAL error
 * unchanged. Capture failure itself falls back inside recordWriteFailure
 * and can never mask or replace the original error. */
export async function withStageBoundaryCapture<T>(
  capture: DiscoveryCaptureFn,
  args: { runId: string | number; boundary: DiscoveryStageBoundaryId },
  work: () => Promise<T>,
  context: Record<string, unknown> = {},
): Promise<T> {
  const table = STAGE_BOUNDARY_TABLES[args.boundary];
  if (!table) throw new Error(`Unknown discovery stage boundary: ${args.boundary}`);
  return withDiscoveryCapture(
    capture,
    {
      tableName: table.tableName,
      statementKind: table.statementKind,
      operation: discoveryStageBoundaryOperation(args.boundary),
      runId: args.runId,
      attemptedKey: String(args.runId),
      context: { stage: args.boundary, boundary: args.boundary, ...context },
    },
    work,
  );
}
