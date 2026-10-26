import { describe, expect, test } from "bun:test";
import { guardedWrite, settleFeedWithAbort, TimingRecorder } from "./fetch-timing";

// Q3 acceptance (expert direction 2026-10-25): per-fetch / per-checkpoint
// timing records (operation, startedAt, durationMs, timeoutMs, outcome,
// cancelled), cancellation verified where the transport supports
// AbortSignal and explicitly recorded as unsupported where it does not,
// and late writes after timeout/lease expiry skipped and recorded.
// Existing bounded deadlines (60s evidence, 120s scoring, 45s veto poll)
// are unchanged — these tests use millisecond stand-ins for the same
// code paths. PAPER ONLY.

describe("Q3 timing records and cancellation", () => {
  test("per-fetch timing is recorded: operation, startedAt, durationMs, timeoutMs, outcome", async () => {
    const recorder = new TimingRecorder();
    const settlement = await settleFeedWithAbort("veto quote poll", 1_000, async () => ({ rows: 3 }), recorder);
    expect(settlement.status).toBe("available");
    expect(recorder.records).toHaveLength(1);
    const record = recorder.records[0]!;
    expect(record.operation).toBe("veto quote poll");
    expect(typeof record.startedAt).toBe("string");
    expect(Number.isFinite(Date.parse(record.startedAt))).toBe(true);
    expect(record.timeoutMs).toBe(1_000);
    expect(record.durationMs).toBeGreaterThanOrEqual(0);
    expect(record.outcome).toBe("available");
    expect(record.cancelled).toBe(false);
    expect(record.cancellation).toBe("not_needed");
    expect(settlement.timing).toBe(record);
  });

  test("cancellation is verified where the transport supports AbortSignal", async () => {
    const recorder = new TimingRecorder();
    let abortObservedByTransport = false;
    const settlement = await settleFeedWithAbort("per-candidate evidence fetch", 60, (signal) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => {
        abortObservedByTransport = signal.aborted;
        const error = new Error("The operation was aborted");
        error.name = "AbortError";
        reject(error);
      });
    }), recorder);
    expect(settlement.status).toBe("unavailable");
    if (settlement.status === "unavailable") expect(settlement.reason).toContain("timeout:");
    expect(abortObservedByTransport).toBe(true);
    const record = recorder.records[0]!;
    expect(record.outcome).toBe("timeout");
    expect(record.cancelled).toBe(true);
    expect(record.cancellation).toBe("verified");
  });

  test("a transport that ignores AbortSignal is recorded explicitly as cancellation unsupported — never claimed cancelled", async () => {
    const recorder = new TimingRecorder();
    const neverSettles = new Promise<never>(() => { /* ignores the signal entirely */ });
    const settlement = await settleFeedWithAbort("legacy feed without signal support", 60, () => neverSettles, recorder, { verifyWindowMs: 30 });
    expect(settlement.status).toBe("unavailable");
    const record = recorder.records[0]!;
    expect(record.outcome).toBe("timeout");
    expect(record.cancelled).toBe(false);
    expect(record.cancellation).toBe("unsupported");
    expect(record.cancellationNote).toContain("ignored the AbortSignal");
  });

  test("a feed that throws inside its deadline settles unavailable with the failure recorded", async () => {
    const recorder = new TimingRecorder();
    const settlement = await settleFeedWithAbort("catalog page", 1_000, async () => { throw new Error("HTTP 429 from provider"); }, recorder);
    expect(settlement.status).toBe("unavailable");
    if (settlement.status === "unavailable") expect(settlement.reason).toContain("HTTP 429");
    expect(recorder.records[0]?.outcome).toBe("unavailable");
  });
});

describe("Q3 late-write prevention", () => {
  test("late write after the budget fired is skipped and the skip is recorded — nothing is written", async () => {
    const recorder = new TimingRecorder();
    let writes = 0;
    const result = await guardedWrite(recorder, { operation: "suppressed-signal write", timeoutMs: 120_000, state: { budgetFired: true, leaseFenced: false } }, async () => { writes++; });
    expect(result.written).toBe(false);
    expect(result.skipReason).toContain("budget already fired");
    expect(writes).toBe(0);
    expect(recorder.records).toHaveLength(1);
    expect(recorder.records[0]?.outcome).toBe("skipped_late_write");
  });

  test("late write after lease expiry is skipped and recorded; a live guard writes normally", async () => {
    const recorder = new TimingRecorder();
    let writes = 0;
    const fenced = await guardedWrite(recorder, { operation: "checkpoint write", timeoutMs: 120_000, state: { budgetFired: false, leaseFenced: true } }, async () => { writes++; });
    expect(fenced.written).toBe(false);
    expect(fenced.skipReason).toContain("lease fenced");
    expect(writes).toBe(0);
    const live = await guardedWrite(recorder, { operation: "checkpoint write", timeoutMs: 120_000, state: { budgetFired: false, leaseFenced: false } }, async () => { writes++; });
    expect(live).toEqual({ written: true, skipReason: null });
    expect(writes).toBe(1);
    // Only the skip is a timing record; the live write is not a skip.
    expect(recorder.records.filter((r) => r.outcome === "skipped_late_write")).toHaveLength(1);
  });
});
