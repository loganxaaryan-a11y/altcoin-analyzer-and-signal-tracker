import { describe, expect, test } from "bun:test";
import { runDurableIntake, type IntakeDisposition, type IntakeProcessResult } from "./paper-intake";

type CandidateTimestamps = {
  decisionAt: Date;
  sourceObservedAt: Date;
  entryExpiresAt: Date;
};

type Row = {
  key: string;
  expiresAt: Date;
  value: { ordinal: number; timestamps: CandidateTimestamps };
};

type Stored = IntakeDisposition & CandidateTimestamps & {
  attempts: number;
  outcome: string | null;
  expiredAgainstAt: Date | null;
};

type TimestampSnapshot = Record<string, {
  decisionAt: string;
  sourceObservedAt: string;
  entryExpiresAt: string;
}>;

function timestampSnapshot(store: Map<string, Stored>, keys: readonly string[]): TimestampSnapshot {
  const snapshot: TimestampSnapshot = {};
  for (const key of keys) {
    const row = store.get(key);
    if (!row) throw new Error(`missing timestamp fixture for ${key}`);
    snapshot[key] = {
      decisionAt: row.decisionAt.toISOString(),
      sourceObservedAt: row.sourceObservedAt.toISOString(),
      entryExpiresAt: row.entryExpiresAt.toISOString(),
    };
  }
  return snapshot;
}

function harness(count: number, failing = new Set<number>()) {
  const now = new Date("2026-10-16T15:20:00.000Z");
  const rows: Row[] = Array.from({ length: count }, (_, index) => {
    const ordinal = index + 1;
    const decisionAt = new Date(now.getTime() - ordinal * 1_000);
    const sourceObservedAt = new Date(decisionAt.getTime() - 30_000);
    const entryExpiresAt = new Date(decisionAt.getTime() + 15 * 60_000);
    return {
      key: `candidate-${ordinal}`,
      expiresAt: new Date(entryExpiresAt),
      value: {
        ordinal,
        timestamps: {
          decisionAt: new Date(decisionAt),
          sourceObservedAt: new Date(sourceObservedAt),
          entryExpiresAt: new Date(entryExpiresAt),
        },
      },
    };
  });
  const store = new Map<string, Stored>(rows.map((row) => [row.key, {
    status: "queued",
    leaseExpiresAt: null,
    attempts: 0,
    outcome: null,
    expiredAgainstAt: null,
    decisionAt: new Date(row.value.timestamps.decisionAt),
    sourceObservedAt: new Date(row.value.timestamps.sourceObservedAt),
    entryExpiresAt: new Date(row.value.timestamps.entryExpiresAt),
  }]));
  const issues = new Map<string, number>();
  const callbacks = {
    clock: () => now,
    load: async (item: Row): Promise<IntakeDisposition> => store.get(item.key) ?? { status: "queued", leaseExpiresAt: null },
    claim: async (item: Row, _at: Date, leaseExpiresAt: Date): Promise<boolean> => {
      const row = store.get(item.key);
      if (!row || row.status === "processed" || row.status === "processing_expired" || row.status === "missed_processing") return false;
      row.status = "processing";
      row.leaseExpiresAt = leaseExpiresAt;
      row.attempts++;
      return true;
    },
    handleItem: async (item: Row): Promise<IntakeProcessResult> => {
      if (failing.has(item.value.ordinal)) throw new Error(`failure-${item.value.ordinal}`);
      issues.set(item.key, (issues.get(item.key) ?? 0) + 1);
      return { outcome: "awaiting_entry", reasonCode: null, reason: null };
    },
    complete: async (item: Row, result: IntakeProcessResult) => {
      const row = store.get(item.key);
      if (!row) throw new Error("missing row");
      row.status = "processed";
      row.leaseExpiresAt = null;
      row.outcome = result.outcome;
    },
    expire: async (item: Row) => {
      const row = store.get(item.key);
      if (!row) throw new Error("missing row");
      row.status = "processing_expired";
      row.leaseExpiresAt = null;
      row.outcome = "processing-expired";
      row.expiredAgainstAt = new Date(item.expiresAt);
    },
    fail: async (item: Row) => {
      const row = store.get(item.key);
      if (!row) throw new Error("missing row");
      row.status = "retryable_failure";
      row.leaseExpiresAt = null;
    },
    overflow: async (item: Row) => {
      const row = store.get(item.key);
      if (!row) throw new Error("missing row");
      row.status = "overflow_deferred";
      row.leaseExpiresAt = null;
    },
  };
  return { now, rows, store, issues, callbacks };
}

describe("durable paper candidate intake", () => {
  test("preserves candidate timestamps while processing more than eight candidates through bounded batches", async () => {
    const { rows, store, callbacks } = harness(13);
    const keys = rows.map((row) => row.key);
    const before = timestampSnapshot(store, keys);

    const result = await runDurableIntake({ items: rows, batchSize: 4, maxItems: 200, ...callbacks });

    expect(result.processed).toBe(13);
    expect([...store.values()].filter((row) => row.status === "processed")).toHaveLength(13);
    expect(timestampSnapshot(store, keys)).toEqual(before);
  });

  test("preserves candidate timestamps across a partial-failure retry without duplicate issuance", async () => {
    const failing = new Set([6]);
    const { rows, store, issues, callbacks } = harness(13, failing);
    const keys = rows.map((row) => row.key);
    const before = timestampSnapshot(store, keys);

    const first = await runDurableIntake({ items: rows, batchSize: 5, maxItems: 200, ...callbacks });
    expect(first.processed).toBe(12);
    expect(first.failed).toBe(1);
    expect(store.get("candidate-6")?.status).toBe("retryable_failure");
    expect(timestampSnapshot(store, keys)).toEqual(before);

    failing.clear();
    const second = await runDurableIntake({ items: rows, batchSize: 5, maxItems: 200, ...callbacks });
    expect(second.processed).toBe(1);
    expect(store.get("candidate-6")?.status).toBe("processed");
    expect([...issues.values()].every((count) => count === 1)).toBe(true);
    expect(store.get("candidate-6")?.attempts).toBe(2);
    expect(timestampSnapshot(store, keys)).toEqual(before);
  });

  test("preserves candidate timestamps across an idempotent resume", async () => {
    const { rows, store, issues, callbacks } = harness(9);
    const keys = rows.map((row) => row.key);
    const before = timestampSnapshot(store, keys);

    const first = await runDurableIntake({ items: rows, batchSize: 3, maxItems: 200, ...callbacks });
    const afterFirst = timestampSnapshot(store, keys);
    const resumed = await runDurableIntake({ items: rows, batchSize: 3, maxItems: 200, ...callbacks });

    expect(first.processed).toBe(9);
    expect(resumed.processed).toBe(0);
    expect(resumed.skippedTerminal).toBe(9);
    expect([...issues.values()].every((count) => count === 1)).toBe(true);
    expect(afterFirst).toEqual(before);
    expect(timestampSnapshot(store, keys)).toEqual(before);
  });

  test("derives processing-expired from the original entryExpiresAt instead of a recomputed window", async () => {
    const { now, rows, store, callbacks } = harness(10);
    const expired = rows[8];
    if (!expired) throw new Error("missing fixture");
    const storedExpired = store.get(expired.key);
    if (!storedExpired) throw new Error("missing stored fixture");

    const originalDeadline = new Date(now.getTime() - 1);
    expired.expiresAt = new Date(originalDeadline);
    expired.value.timestamps.entryExpiresAt = new Date(originalDeadline);
    storedExpired.entryExpiresAt = new Date(originalDeadline);
    const recomputedDeadline = new Date(storedExpired.decisionAt.getTime() + 15 * 60_000);
    const before = timestampSnapshot(store, rows.map((row) => row.key));

    const result = await runDurableIntake({ items: rows, batchSize: 3, maxItems: 200, ...callbacks });

    expect(result.expired).toBe(1);
    expect(store.get(expired.key)?.status).toBe("processing_expired");
    expect(store.get(expired.key)?.outcome).toBe("processing-expired");
    expect(store.get(expired.key)?.expiredAgainstAt?.toISOString()).toBe(originalDeadline.toISOString());
    expect(store.get(expired.key)?.expiredAgainstAt?.toISOString()).not.toBe(recomputedDeadline.toISOString());
    expect(timestampSnapshot(store, rows.map((row) => row.key))).toEqual(before);
  });

  test("overflow is explicit, resumable, and timestamp preserving", async () => {
    const { rows, store, callbacks } = harness(12);
    const keys = rows.map((row) => row.key);
    const before = timestampSnapshot(store, keys);

    const first = await runDurableIntake({ items: rows, batchSize: 4, maxItems: 8, ...callbacks });
    expect(first.processed).toBe(8);
    expect(first.overflow).toBe(4);
    expect([...store.values()].filter((row) => row.status === "overflow_deferred")).toHaveLength(4);
    expect(timestampSnapshot(store, keys)).toEqual(before);

    const second = await runDurableIntake({ items: rows, batchSize: 4, maxItems: 8, ...callbacks });
    expect(second.processed).toBe(4);
    expect([...store.values()].filter((row) => row.status === "processed")).toHaveLength(12);
    expect(timestampSnapshot(store, keys)).toEqual(before);
  });
});
