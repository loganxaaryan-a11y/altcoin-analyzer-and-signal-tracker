import { describe, expect, test } from "bun:test";
import { classifyHandoffExpiry, decideIssuanceWork, EXPIRED_HANDOFF_BATCH_LIMIT, monitoringHoldExplanation, planHandoffAccounting, selectHandoffToAccount, summarizeHandoffCoverage, summarizeIntakeStatuses, type HandoffProcessingState } from "./issuance-work-check";
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

describe("missed-handoff repair — selection over every completed handoff", () => {
  // Replayed from the 2026-10-25 production record: handoff 93 (discovery
  // run 181) fully processed by run 137 with 8/8 intake rows terminal;
  // handoff 94 (discovery run 184) completed 12:58:27Z with 5 eligible
  // candidates whose intake rows stayed "queued" and no paper-cycle run,
  // because its discovery run ended "timeout" and single-handoff
  // selection (latest complete/degraded discovery run only) kept
  // returning 93 for checks 885–908, then jumped to 95.
  const h93: HandoffProcessingState = {
    handoffId: 93, discoveryRunId: 181, eligibleCount: 8,
    latestRun: { id: 137, status: "partial", completedAt: "2026-10-25T06:59:27.000Z" },
    intakeTotal: 8, intakeTerminal: 8, intakePending: 0,
  };
  const h94Missed: HandoffProcessingState = {
    handoffId: 94, discoveryRunId: 184, eligibleCount: 5,
    latestRun: null,
    intakeTotal: 5, intakeTerminal: 0, intakePending: 5,
  };
  const h95: HandoffProcessingState = {
    handoffId: 95, discoveryRunId: 185, eligibleCount: 5,
    latestRun: null,
    intakeTotal: 0, intakeTerminal: 0, intakePending: 0,
  };

  test("the missed handoff itself decides processed_new, never skip", () => {
    const decision = decideIssuanceWork(h94Missed);
    expect(decision.kind).toBe("processed_new");
  });

  test("selection targets the missed handoff even though a newer handoff exists", () => {
    const selection = selectHandoffToAccount([h93, h94Missed, h95]);
    expect(selection).toEqual({ targetIndex: 1, allAccounted: false });
  });

  test("selection never leapfrogs: the OLDEST unaccounted handoff goes first", () => {
    const selection = selectHandoffToAccount([h94Missed, h95]);
    expect(selection?.targetIndex).toBe(0);
    expect(selection?.allAccounted).toBe(false);
  });

  test("coverage accounting names the missed handoff instead of reading all-clear", () => {
    const coverage = summarizeHandoffCoverage([h93, h94Missed, h95]);
    expect(coverage.totalHandoffs).toBe(3);
    expect(coverage.allAccounted).toBe(false);
    expect(coverage.accountedHandoffs).toBe(1);
    expect(coverage.unaccounted.map((row) => row.handoffId)).toEqual([94, 95]);
    expect(coverage.unaccounted[0]?.decision).toBe("processed_new");
  });

  test("a coverage-gap closure (no run, every intake row terminal) accounts the handoff", () => {
    const h94Closed: HandoffProcessingState = { ...h94Missed, intakeTerminal: 5, intakePending: 0 };
    const decision = decideIssuanceWork(h94Closed);
    expect(decision.kind).toBe("skipped_completed");
    expect(decision.reason).toContain("without a paper-cycle run");
    const coverage = summarizeHandoffCoverage([h93, h94Closed]);
    expect(coverage.allAccounted).toBe(true);
  });

  test("a legitimate model abstention counts as successful processing", () => {
    // Run 138's shape for handoff 95: a committed "partial" run whose
    // candidates abstained/deferred through the frozen model, with every
    // intake row terminal. Abstention is a verdict, not missing work.
    const abstained: HandoffProcessingState = {
      handoffId: 95, discoveryRunId: 185, eligibleCount: 5,
      latestRun: { id: 138, status: "partial", completedAt: "2026-10-25T15:00:38.000Z" },
      intakeTotal: 5, intakeTerminal: 5, intakePending: 0,
    };
    expect(decideIssuanceWork(abstained).kind).toBe("skipped_completed");
    expect(summarizeHandoffCoverage([h93, abstained]).allAccounted).toBe(true);
  });

  test("when every handoff is accounted, selection reports the newest for the skip", () => {
    const selection = selectHandoffToAccount([h93, { ...h94Missed, intakeTerminal: 5, intakePending: 0 }]);
    expect(selection).toEqual({ targetIndex: 1, allAccounted: true });
  });

  test("no handoffs selects nothing", () => {
    expect(selectHandoffToAccount([])).toBeNull();
    expect(summarizeHandoffCoverage([]).allAccounted).toBe(true);
  });
});

describe("starvation prevention — unexpired first, expired accounted separately", () => {
  // The required case (2026-10-25): an expired backlog plus a fresh
  // eligible handoff. Under the first repair's oldest-first selection the
  // backlog consumed every cycle's single full pass while the fresh
  // handoff's 15-minute window burned — historical cleanup starving
  // current issuance. Times are fixed: "now" is 2026-10-25T17:00:00Z.
  const NOW = Date.parse("2026-10-25T17:00:00.000Z");
  const expiredBacklog: HandoffProcessingState[] = [63, 64, 65].map((id) => ({
    handoffId: id, discoveryRunId: 100 + id, eligibleCount: 4,
    latestRun: null,
    intakeTotal: 4, intakeTerminal: 0, intakePending: 4,
    earliestEntryExpiresAt: "2026-10-25T08:15:00.000Z",
    latestEntryExpiresAt: "2026-10-25T08:15:00.000Z",
  }));
  const fresh: HandoffProcessingState = {
    handoffId: 96, discoveryRunId: 186, eligibleCount: 3,
    latestRun: null,
    intakeTotal: 3, intakeTerminal: 0, intakePending: 3,
    earliestEntryExpiresAt: "2026-10-25T17:12:00.000Z",
    latestEntryExpiresAt: "2026-10-25T17:12:00.000Z",
  };
  const states = [...expiredBacklog, fresh];

  test("REQUIRED: the fresh eligible handoff is the primary target, ahead of the whole expired backlog", () => {
    const plan = planHandoffAccounting(states, NOW);
    expect(plan.primaryIndex).toBe(3);
    expect(states[plan.primaryIndex as number]?.handoffId).toBe(96);
    // Selection agrees: the cycle's target is the fresh handoff, so it is
    // processed inside its window (expires 17:12Z, now 17:00Z).
    const selection = selectHandoffToAccount(states, NOW);
    expect(selection).toEqual({ targetIndex: 3, allAccounted: false });
    // The pre-repair oldest-first rule (no clock) would have picked the
    // backlog head — the starvation this repair removes.
    expect(selectHandoffToAccount(states)?.targetIndex).toBe(0);
  });

  test("expired records receive dispositions without entries, in a bounded batch, from remaining capacity only", () => {
    const plan = planHandoffAccounting(states, NOW);
    // Bounded: the batch never exceeds the per-cycle limit, and the fresh
    // primary is never itself a disposition target (dispositions create
    // no entries; the fresh handoff must get the full pass instead).
    expect(plan.expiredDispositionIndices.length).toBe(EXPIRED_HANDOFF_BATCH_LIMIT);
    expect(plan.expiredDispositionIndices).toEqual([0, 1]);
    expect(plan.expiredDispositionIndices).not.toContain(plan.primaryIndex);
    // Disposition eligibility: never-run expired handoffs only.
    for (const index of plan.expiredDispositionIndices) {
      expect(states[index]?.latestRun).toBeNull();
      expect(classifyHandoffExpiry(states[index] as HandoffProcessingState, NOW)).toBe("expired");
    }
  });

  test("coverage reporting spans both groups — nothing disappears merely because it expired", () => {
    const coverage = summarizeHandoffCoverage(states, NOW);
    expect(coverage.totalHandoffs).toBe(4);
    expect(coverage.accountedHandoffs).toBe(0);
    expect(coverage.allAccounted).toBe(false);
    expect(coverage.groups).toEqual({ unexpiredUnaccounted: 1, expiredUnaccounted: 3 });
    // Every unaccounted handoff is named, with its group: the three
    // expired ones are still reported, not dropped from accounting.
    expect(coverage.unaccounted.map((row) => row.handoffId)).toEqual([63, 64, 65, 96]);
    expect(coverage.unaccounted.map((row) => row.expiryGroup)).toEqual(["expired", "expired", "expired", "unexpired"]);
  });

  test("unexpired handoffs order by earliest expiry, not by age", () => {
    const laterWindow: HandoffProcessingState = { ...fresh, handoffId: 97, earliestEntryExpiresAt: "2026-10-25T17:14:00.000Z", latestEntryExpiresAt: "2026-10-25T17:14:00.000Z" };
    const soonerWindow: HandoffProcessingState = { ...fresh, handoffId: 98, earliestEntryExpiresAt: "2026-10-25T17:09:00.000Z", latestEntryExpiresAt: "2026-10-25T17:09:00.000Z" };
    const plan = planHandoffAccounting([laterWindow, soonerWindow], NOW);
    expect(plan.primaryIndex).toBe(1);
  });

  test("with no unexpired work, selection falls to the oldest expired handoff for disposition", () => {
    const selection = selectHandoffToAccount(expiredBacklog, NOW);
    expect(selection).toEqual({ targetIndex: 0, allAccounted: false });
    const plan = planHandoffAccounting(expiredBacklog, NOW);
    expect(plan.primaryIndex).toBeNull();
    expect(plan.expiredUnaccountedIndices).toEqual([0, 1, 2]);
  });

  test("an expired handoff a cycle already ran is NOT disposition-eligible — its run keeps recovery semantics", () => {
    const ranExpired: HandoffProcessingState = { ...expiredBacklog[0] as HandoffProcessingState, latestRun: { id: 140, status: "failed", completedAt: null } };
    const plan = planHandoffAccounting([ranExpired], NOW);
    expect(plan.expiredDispositionIndices).toEqual([]);
    expect(plan.expiredUnaccountedIndices).toEqual([0]);
  });

  test("missing expiry evidence never demotes a handoff behind the expired backlog", () => {
    const unknownExpiry: HandoffProcessingState = { handoffId: 99, discoveryRunId: 190, eligibleCount: 2, latestRun: null, intakeTotal: 0, intakeTerminal: 0, intakePending: 0 };
    expect(classifyHandoffExpiry(unknownExpiry, NOW)).toBe("unexpired");
    const plan = planHandoffAccounting([...expiredBacklog, unknownExpiry], NOW);
    expect(plan.primaryIndex).toBe(3);
  });

  test("once the expired backlog is dispositioned terminal, coverage reads complete across both groups", () => {
    const closed = expiredBacklog.map((row) => ({ ...row, intakeTerminal: row.intakeTotal, intakePending: 0 }));
    const doneFresh: HandoffProcessingState = { ...fresh, latestRun: { id: 141, status: "partial", completedAt: "2026-10-25T17:05:00.000Z" }, intakeTerminal: 3, intakePending: 0 };
    const coverage = summarizeHandoffCoverage([...closed, doneFresh], NOW);
    expect(coverage.allAccounted).toBe(true);
    expect(coverage.groups).toEqual({ unexpiredUnaccounted: 0, expiredUnaccounted: 0 });
    expect(coverage.accountedHandoffs).toBe(4);
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
