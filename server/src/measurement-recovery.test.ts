import { describe, expect, test } from "bun:test";
import { reconcileMeasurement, selectMeasurementBatch, stableEvaluationFingerprint, type FrozenMember, type ReconciliationItem } from "./measurement-recovery";

const members = (count: number): FrozenMember[] => Array.from({ length: count }, (_, ordinal) => ({ signalId: `legacy_${ordinal + 10}`, ordinal }));
const item = (signalId: string, membershipOrdinal: number, gradingState: ReconciliationItem["gradingState"] = "pending"): ReconciliationItem => ({ signalId, membershipOrdinal, gradingState, gradingReason: "measured reason", tradeState: "open", tradeStateReason: "no accepted terminal evaluation" });

describe("measurement restart and identity recovery", () => {
  test("repeats an interrupted durable cursor batch without skips", () => {
    const ids = members(28).map((row) => row.signalId);
    const first = selectMeasurementBatch(ids, 0, 4, []);
    const afterRestart = selectMeasurementBatch(ids, 0, 4, []);
    expect(afterRestart).toEqual(first);
    expect(selectMeasurementBatch(ids, 4, 4, []).signalIds).toEqual(ids.slice(4, 8));
  });

  test("retries failed IDs after forward completion without changing membership", () => {
    const ids = members(3).map((row) => row.signalId);
    expect(selectMeasurementBatch(ids, 3, 2, ["legacy_11", "legacy_11"])).toEqual({ signalIds: ["legacy_11"], startCursor: 3, nextCursor: 3, mode: "retry" });
  });

  test("reconciles exact identities, uniqueness, and ordinals", () => {
    const expected = members(3);
    const result = reconcileMeasurement(expected, [item("legacy_10", 0, "evaluated"), item("legacy_11", 1, "failed"), item("legacy_12", 2, "excluded")]);
    expect(result.balanced).toBe(true);
    expect(result.equation).toBe("3 frozen IDs = 1 evaluated + 0 pending/unresolved + 1 failed + 1 excluded");
  });

  test("duplicate rows can never balance a missing frozen ID", () => {
    const result = reconcileMeasurement(members(2), [item("legacy_10", 0), item("legacy_10", 0)]);
    expect(result.balanced).toBe(false);
    expect(result.missingIds).toEqual(["legacy_11"]);
    expect(result.duplicateIds).toEqual(["legacy_10"]);
  });

  test("unexpected IDs and ordinal corruption block closure", () => {
    const result = reconcileMeasurement(members(2), [item("legacy_10", 1), item("legacy_99", 9)]);
    expect(result.balanced).toBe(false);
    expect(result.unexpectedIds).toEqual(["legacy_99"]);
    expect(result.ordinalViolations[0]).toContain("legacy_10");
  });

  test("volatile worker timestamps do not rewrite identical evaluation history", () => {
    const before = stableEvaluationFingerprint({ verdict: "hit", sourceRows: [{ day: "2026-10-10", close: 100 }], evaluationCutoff: "2026-10-12T10:00:00Z" });
    const after = stableEvaluationFingerprint({ verdict: "hit", sourceRows: [{ day: "2026-10-10", close: 100 }], evaluationCutoff: "2026-10-12T10:05:00Z" });
    expect(after).toBe(before);
    expect(stableEvaluationFingerprint({ verdict: "miss", sourceRows: [{ day: "2026-10-10", close: 100 }] })).not.toBe(before);
  });
});
