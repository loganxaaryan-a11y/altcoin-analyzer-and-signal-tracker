import { describe, expect, test } from "bun:test";
import { decideIssuanceWork, monitoringHoldExplanation, summarizeIntakeStatuses, type HandoffProcessingState } from "./issuance-work-check";
import { isTerminalIntakeStatus } from "./paper-intake";

const isTerminal = (status: string) => isTerminalIntakeStatus(status as Parameters<typeof isTerminalIntakeStatus>[0]);

const base: HandoffProcessingState = {
  handoffId: 42,
  discoveryRunId: 7,
  eligibleCount: 3,
  latestRun: { id: 11, status: "complete", completedAt: "2026-10-20T23:01:00.000Z" },
  intakeTotal: 3,
  intakeTerminal: 3,
  intakePending: 0,
};

describe("bounded issuance-work check", () => {
  test("case 1 — a completed handoff skips expensive processing", () => {
    const decision = decideIssuanceWork(base);
    expect(decision.kind).toBe("skipped_completed");
    expect(decision.reason).toContain("run 11");
  });

  test("case 1b — a completed handoff with zero eligible candidates also skips", () => {
    const decision = decideIssuanceWork({ ...base, eligibleCount: 0, intakeTotal: 0, intakeTerminal: 0, intakePending: 0 });
    expect(decision.kind).toBe("skipped_completed");
  });

  test("case 2 — a new handoff (no committed run) processes once", () => {
    const decision = decideIssuanceWork({ ...base, latestRun: null, intakeTotal: 0, intakeTerminal: 0, intakePending: 0 });
    expect(decision.kind).toBe("processed_new");
  });

  test("case 3 — an interrupted handoff (partial run with work still pending) recovers", () => {
    const decision = decideIssuanceWork({ ...base, latestRun: { id: 11, status: "partial", completedAt: "2026-10-20T23:01:00.000Z" }, intakeTerminal: 2, intakePending: 1 });
    expect(decision.kind).toBe("recovered_incomplete");
  });

  test("a finished partial run (committed completion, every intake row terminal) skips — its deferred outcomes are committed dispositions, not unfinished work", () => {
    const decision = decideIssuanceWork({ ...base, latestRun: { id: 11, status: "partial", completedAt: "2026-10-20T23:01:00.000Z" } });
    expect(decision.kind).toBe("skipped_completed");
  });

  test("a partial run without a committed completion stamp is uncertain and recovers", () => {
    const decision = decideIssuanceWork({ ...base, latestRun: { id: 11, status: "partial", completedAt: null } });
    expect(decision.kind).toBe("recovered_incomplete");
  });

  test("case 3b — a failed run recovers even when every intake row looks terminal", () => {
    const decision = decideIssuanceWork({ ...base, latestRun: { id: 11, status: "failed", completedAt: "2026-10-20T23:01:00.000Z" } });
    expect(decision.kind).toBe("recovered_incomplete");
  });

  test("case 3c — a run left 'running' by a crashed invocation recovers", () => {
    const decision = decideIssuanceWork({ ...base, latestRun: { id: 11, status: "running", completedAt: null }, intakeTerminal: 1, intakePending: 2 });
    expect(decision.kind).toBe("recovered_incomplete");
  });

  test("a 'complete' label never suppresses non-terminal intake rows", () => {
    // The run label and the intake rows disagree: the committed per-candidate
    // state is authoritative, so the remainder is recovered.
    const decision = decideIssuanceWork({ ...base, intakeTerminal: 2, intakePending: 1 });
    expect(decision.kind).toBe("recovered_incomplete");
    expect(decision.reason).toContain("intake rows win");
  });

  test("missing intake coverage for eligible candidates is uncertain and recovers", () => {
    const decision = decideIssuanceWork({ ...base, intakeTotal: 1, intakeTerminal: 1, intakePending: 0 });
    expect(decision.kind).toBe("recovered_incomplete");
  });

  test("unreconciled intake accounting recovers rather than skips", () => {
    const decision = decideIssuanceWork({ ...base, intakeTerminal: 2, intakePending: 0 });
    expect(decision.kind).toBe("recovered_incomplete");
  });

  test("the decision has no last-triggered input: identical committed state decides identically", () => {
    // decideIssuanceWork accepts only committed processing state. Two
    // invocations minutes apart with the same committed state must reach the
    // same decision — recency of the last trigger is not representable.
    const a = decideIssuanceWork(base);
    const b = decideIssuanceWork({ ...base });
    expect(a).toEqual(b);
  });
});

describe("monitoringHoldExplanation", () => {
  // The 2026-10-23 episode, replayed from its recorded timestamps:
  // coverage stopped 03:42:59Z, the 45-minute bound was crossed 04:27:59Z,
  // and the lane was held by design until coverage recovered — while its
  // status recorded nothing and read as a dispatch failure.
  const held = monitoringHoldExplanation({
    coverageStatus: "stale",
    coverageBasis: "Coverage verified by scheduled recovery",
    lastSuccessfulCoverageUtc: "2026-10-23T03:42:59.000Z",
    staleAfterMs: 45 * 60_000,
    settlementRunUtc: "2026-10-23T03:43:30.000Z",
    automationLabel: "Scheduled recovery confirmed 2026-10-22T07:35:00Z",
    failingStage: "venue monitor — coverage stale",
    reasons: ["Last successful coverage 2026-10-23T03:42:59.000Z is older than the 45-minute staleness bound."],
    trigger: "manual",
  });

  test("names the hold as by design, never as a dispatch failure", () => {
    expect(held.reason).toContain("Held by design by the monitoring-health gate");
    expect(held.reason).toContain("not a dispatch failure");
    expect(held.reason).toContain("returned before any candidate processing");
    expect(held.reason).toContain("No candidate was processed and no entry was admitted");
  });

  test("computes the freshness-bound crossing from the last coverage, not by hand", () => {
    expect(held.staleBoundCrossedUtc).toBe("2026-10-23T04:27:59.000Z");
    expect(held.reason).toContain("the 45-minute freshness bound was crossed at 2026-10-23T04:27:59.000Z");
  });

  test("a 'manual' trigger label never reads as proof a person fired it", () => {
    expect(held.reason).toContain('recorded trigger label is "manual"');
    expect(held.reason).toContain('defaults to "manual"');
    expect(held.reason).toContain("does not establish that a person fired this invocation");
  });

  test("no successful coverage timestamp means no invented crossing time", () => {
    const unknown = monitoringHoldExplanation({
      coverageStatus: "unavailable",
      coverageBasis: "Coverage verified by directed recovery",
      lastSuccessfulCoverageUtc: null,
      staleAfterMs: 45 * 60_000,
      settlementRunUtc: null,
      automationLabel: "Scheduled recovery pending",
      failingStage: null,
      reasons: [],
      trigger: "scheduled",
    });
    expect(unknown.staleBoundCrossedUtc).toBeNull();
    expect(unknown.reason).toContain("last successful coverage unavailable");
    expect(unknown.reason).not.toContain("freshness bound was crossed at");
    expect(unknown.reason).toContain('recorded trigger label is "scheduled"');
  });
});

describe("summarizeIntakeStatuses", () => {
  test("partitions statuses into terminal and pending", () => {
    const summary = summarizeIntakeStatuses([
      { status: "processed", count: 2 },
      { status: "missed_processing", count: 1 },
      { status: "retryable_failure", count: 1 },
      { status: "queued", count: 3 },
    ], isTerminal);
    expect(summary).toEqual({ total: 7, terminal: 3, pending: 4 });
  });

  test("an unknown status counts as pending (uncertain never reads terminal)", () => {
    const summary = summarizeIntakeStatuses([{ status: "some_future_status", count: 1 }], isTerminal);
    expect(summary).toEqual({ total: 1, terminal: 0, pending: 1 });
  });
});
