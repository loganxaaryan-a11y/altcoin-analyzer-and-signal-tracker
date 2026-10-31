import { describe, expect, test } from "bun:test";
import { runFailureRecordingSequence } from "./discovery-failure-isolation";
import { recordWriteFailure, type WriteFailureCaptureValues } from "./write-failure-capture";

// Mocked ctx.db: a tiny in-memory store with a row-status table and a
// snapshot/bookkeeping table, each independently failable.
function mockDb(opts: { failSnapshot?: boolean; failRowStatus?: boolean; failCapture?: boolean } = {}) {
  const state = { rowStatus: [] as Array<Record<string, unknown>>, snapshots: [] as Array<Record<string, unknown>>, captures: [] as WriteFailureCaptureValues[], order: [] as string[] };
  const captureInsert = async (values: WriteFailureCaptureValues): Promise<void> => {
    if (opts.failCapture) throw new Error("capture unavailable");
    state.captures.push(values);
  };
  const sequence = () => runFailureRecordingSequence({
    rowStatus: async () => {
      state.order.push("row-status");
      if (opts.failRowStatus) throw new Error(`row-status update failed ${"y".repeat(300)}`);
      state.rowStatus.push({ id: 7, status: "failed" });
    },
    snapshotBookkeeping: async () => {
      state.order.push("snapshot");
      if (opts.failSnapshot) throw new Error("snapshot write failed: disk I/O error on scan_operations");
      state.snapshots.push({ scanKey: "market-discovery:test" });
    },
    capture: async (error, stage) => recordWriteFailure(captureInsert, { lane: "discovery", tableName: stage === "row-status" ? "market_discovery_runs" : "scan_operations", statementKind: stage === "row-status" ? "update" : "insert", runId: 7, attemptedKey: "7", error, context: { stage } }),
  });
  return { state, sequence };
}

describe("discovery failure-recording isolation", () => {
  test("snapshot failure → row-status still commits (row-status FIRST, snapshot SECOND)", async () => {
    const { state, sequence } = mockDb({ failSnapshot: true });
    const result = await sequence();
    expect(result.rowStatusCommitted).toBe(true);
    expect(result.snapshotOk).toBe(false);
    expect(state.rowStatus).toEqual([{ id: 7, status: "failed" }]);
    expect(state.order).toEqual(["row-status", "snapshot"]);
    // The snapshot failure was captured, not silently swallowed.
    expect(state.captures).toHaveLength(1);
    expect(state.captures[0]!.tableName).toBe("scan_operations");
    expect(state.captures[0]!.errorText).toContain("snapshot write failed");
  });

  test("row-status failure is captured verbatim (>220 chars) and bookkeeping still runs best-effort", async () => {
    const { state, sequence } = mockDb({ failRowStatus: true });
    const result = await sequence();
    expect(result.rowStatusCommitted).toBe(false);
    expect(result.snapshotOk).toBe(true);
    expect(state.order).toEqual(["row-status", "snapshot"]);
    expect(state.captures).toHaveLength(1);
    expect(state.captures[0]!.tableName).toBe("market_discovery_runs");
    expect(state.captures[0]!.errorText.length).toBeGreaterThan(220);
    expect("id" in state.captures[0]!).toBe(false);
  });

  test("capture failure doesn't mask anything: sequence still completes and reports step outcomes", async () => {
    const { state, sequence } = mockDb({ failSnapshot: true, failCapture: true });
    const result = await sequence();
    expect(result).toEqual({ rowStatusCommitted: true, snapshotOk: false });
    expect(state.rowStatus).toHaveLength(1);
    expect(state.captures).toHaveLength(0);
  });

  test("clean path: both steps commit, no captures, decision payload unchanged", async () => {
    const { state, sequence } = mockDb();
    const result = await sequence();
    expect(result).toEqual({ rowStatusCommitted: true, snapshotOk: true });
    expect(state.captures).toHaveLength(0);
    expect(state.snapshots).toHaveLength(1);
  });
});
