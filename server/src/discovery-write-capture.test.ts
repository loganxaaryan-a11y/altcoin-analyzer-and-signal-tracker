import { describe, expect, test } from "bun:test";
import {
DISCOVERY_CATALOG_FETCH_COMMIT_OPERATION,
DISCOVERY_HANDOFF_BUILDING_TO_COMPLETE_OPERATION,
DISCOVERY_RUN_FINALIZATION_OPERATION,
withCatalogFetchCommitCapture,
withHandoffBuildingToCompleteCapture,
withRunFinalizationCapture,
type DiscoveryCaptureFn,
} from "./discovery-write-capture";
import {
clearFallbackWriteFailures,
getFallbackWriteFailures,
recordWriteFailure as recordWriteFailureRow,
WRITE_FAILURE_SCHEMA_VERSION,
type WriteFailureCaptureValues,
} from "./write-failure-capture";

// Isolated proof for the §A6 wiring (fixes-needed-2026-10-28 item 3):
// the artifact's wired path — the exact helpers actions.ts calls at the
// catalog-fetch commit, the run-finalization update, and the handoff
// building→complete transition — emits the ORIGINAL driver error/code,
// operation, schema/migration version, and correlation (run) id verbatim
// through the existing write-failure-capture module. The capture function
// supplied here is the real recordWriteFailureRow over a mock insert,
// exactly as actions.ts supplies its ctx-bound recordWriteFailure.
// A workspace fallback test alone does not count; this exercises the
// artifact's own wired helpers.

function mockCaptureDb(failInsert = false) {
  const rows: WriteFailureCaptureValues[] = [];
  const insert = async (values: WriteFailureCaptureValues): Promise<void> => {
    if (failInsert) throw new Error("capture table unavailable");
    rows.push(values);
  };
  const capture: DiscoveryCaptureFn = (input) => recordWriteFailureRow(insert, input);
  return { rows, insert, capture };
}

// The 205/208 driver shape: SQLITE_BUSY with the commit detail, long
// enough that compactError's 220-char slice would have destroyed it.
const driverMessage =
  "SQLITE_BUSY: cannot commit transaction - SQL statements in progress (driver code SQLITE_BUSY, extended 5) while committing the discovery run at catalog-fetch — " +
  "x".repeat(300) +
  " end-of-driver-detail";
function driverError(): Error {
  const cause = new Error("driver cause: database is locked at page 1842, connection held by an open cursor");
  const err = new Error(driverMessage, { cause });
  (err as unknown as { code: string }).code = "SQLITE_BUSY";
  return err;
}

describe("§A6 discovery write capture — wired path", () => {
  test("catalog-fetch commit: original driver error/code, operation, schema version, and run id are emitted verbatim; original rethrown", async () => {
    const { rows, capture } = mockCaptureDb();
    const original = driverError();
    let thrown: unknown = null;
    try {
      await withCatalogFetchCommitCapture(capture, 205, async () => { throw original; });
    } catch (e) { thrown = e; }
    expect(thrown).toBe(original);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.lane).toBe("discovery");
    expect(row.operation).toBe(DISCOVERY_CATALOG_FETCH_COMMIT_OPERATION);
    expect(row.operation).toBe("discovery:catalog-fetch-commit");
    expect(row.tableName).toBe("market_discovery_runs");
    expect(row.statementKind).toBe("update");
    expect(row.schemaVersion).toBe(WRITE_FAILURE_SCHEMA_VERSION);
    expect(row.schemaVersion).toBe("0069");
    // Correlation id = the discovery run id, verbatim.
    expect(row.runId).toBe("205");
    expect(row.attemptedKey).toBe("205");
    // Verbatim driver error + code + cause chain, beyond the 220-char slice.
    expect(row.errorText.length).toBeGreaterThan(220);
    expect(row.errorText).toContain(driverMessage);
    expect(row.errorText).toContain("SQLITE_BUSY");
    expect(row.errorText).toContain("driver cause: database is locked at page 1842");
    expect(row.errorText).toContain("caused by:");
    expect(row.errorKind).toBe("Error");
    expect("id" in row).toBe(false);
    const ctx = JSON.parse(row.contextJson ?? "{}") as Record<string, unknown>;
    expect(ctx.stage).toBe("catalog-fetch");
  });

  test("run-finalization update: original driver error/code, operation, schema version, and run id are emitted verbatim; original rethrown", async () => {
    const { rows, capture } = mockCaptureDb();
    const original = driverError();
    let thrown: unknown = null;
    try {
      await withRunFinalizationCapture(capture, 209, async () => { throw original; });
    } catch (e) { thrown = e; }
    expect(thrown).toBe(original);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.lane).toBe("discovery");
    expect(row.operation).toBe(DISCOVERY_RUN_FINALIZATION_OPERATION);
    expect(row.operation).toBe("discovery:run-finalization");
    expect(row.tableName).toBe("market_discovery_runs");
    expect(row.schemaVersion).toBe(WRITE_FAILURE_SCHEMA_VERSION);
    expect(row.runId).toBe("209");
    expect(row.errorText).toContain(driverMessage);
    expect(row.errorText).toContain("SQLITE_BUSY");
    const ctx = JSON.parse(row.contextJson ?? "{}") as Record<string, unknown>;
    expect(ctx.stage).toBe("run-finalization");
  });

  test("handoff building→complete transition: original driver error/code, operation, schema version, and run id are emitted verbatim; original rethrown", async () => {
    const { rows, capture } = mockCaptureDb();
    const original = driverError();
    let thrown: unknown = null;
    try {
      await withHandoffBuildingToCompleteCapture(capture, { discoveryRunId: 209, handoffRunId: 114 }, async () => { throw original; });
    } catch (e) { thrown = e; }
    expect(thrown).toBe(original);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.lane).toBe("discovery");
    expect(row.operation).toBe(DISCOVERY_HANDOFF_BUILDING_TO_COMPLETE_OPERATION);
    expect(row.operation).toBe("discovery:handoff-building-to-complete");
    expect(row.tableName).toBe("paper_handoff_runs");
    expect(row.statementKind).toBe("update");
    expect(row.schemaVersion).toBe(WRITE_FAILURE_SCHEMA_VERSION);
    // Correlation id is the discovery run id; the handoff id is the attempted key.
    expect(row.runId).toBe("209");
    expect(row.attemptedKey).toBe("114");
    expect(row.errorText).toContain(driverMessage);
    expect(row.errorText).toContain("SQLITE_BUSY");
    const ctx = JSON.parse(row.contextJson ?? "{}") as Record<string, unknown>;
    expect(ctx.stage).toBe("handoff-building-to-complete");
    expect(ctx.handoffRunId).toBe("114");
  });

  test("success path: value passes through unchanged and nothing is captured at any of the three points", async () => {
    const { rows, capture } = mockCaptureDb();
    const payload = { ok: true, id: 42 };
    expect(await withCatalogFetchCommitCapture(capture, 205, async () => payload)).toBe(payload);
    expect(await withRunFinalizationCapture(capture, 205, async () => payload)).toBe(payload);
    expect(await withHandoffBuildingToCompleteCapture(capture, { discoveryRunId: 205, handoffRunId: 99 }, async () => payload)).toBe(payload);
    expect(rows).toHaveLength(0);
  });

  test("capture-insert failure: verbatim capture reaches the independent fallback and the original error is still rethrown", async () => {
    clearFallbackWriteFailures();
    const { capture } = mockCaptureDb(true);
    const original = driverError();
    let thrown: unknown = null;
    try {
      await withCatalogFetchCommitCapture(capture, 208, async () => { throw original; });
    } catch (e) { thrown = e; }
    expect(thrown).toBe(original);
    const fallback = getFallbackWriteFailures();
    expect(fallback).toHaveLength(1);
    expect(fallback[0]?.lane).toBe("discovery");
    expect(fallback[0]?.operation).toBe("discovery:catalog-fetch-commit");
    expect(fallback[0]?.runId).toBe("208");
    expect(fallback[0]?.schemaVersion).toBe(WRITE_FAILURE_SCHEMA_VERSION);
    expect(fallback[0]?.errorText).toContain("SQLITE_BUSY: cannot commit transaction");
    clearFallbackWriteFailures();
    expect(getFallbackWriteFailures()).toHaveLength(0);
  });
});
