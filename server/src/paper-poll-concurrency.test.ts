import { describe, expect, test } from "bun:test";
import { paperAlertReadRow, type StoredPaperAlertRow } from "./paper-alert-read-model";
import {
evaluatePaperDeliveryDecision,
executePaperDelivery,
executePaperDeliveryPoll,
paperDeliveryKey,
type PaperDeliveryEvaluationContext,
type PaperDeliveryLedgerRecord,
} from "./paper-delivery-worker";
import { buildPaperPollLeaseAttempt, LEASE_CONSTRUCTION_INVALID_KIND, PaperPollLeaseConstructionError, runBoundedCoalescedPoll, type PaperPollClaim, type PaperPollLeaseStore } from "./paper-poll-concurrency";

type LeaseState<T> = {
  owner: string | null;
  generation: number;
  rerun: boolean;
  result: T | null;
};

function memoryLeaseStore<T>(state: LeaseState<T>, token: string): PaperPollLeaseStore<T> {
  return {
    async acquire() {
      if (state.owner !== null) {
        state.rerun = true;
        return { acquired: false as const, activeGeneration: state.generation };
      }
      state.owner = token;
      state.generation += 1;
      state.rerun = false;
      return { acquired: true as const, claim: { ownerToken: token, generation: state.generation } };
    },
    async claimFollowup(claim) {
      if (state.owner !== claim.ownerToken || state.generation !== claim.generation || !state.rerun) return null;
      state.rerun = false;
      state.generation += 1;
      return { ownerToken: claim.ownerToken, generation: state.generation };
    },
    async complete(claim, result) {
      if (state.owner !== claim.ownerToken || state.generation !== claim.generation) return false;
      state.owner = null;
      state.result = result;
      return true;
    },
    async fail(claim) {
      if (state.owner === claim.ownerToken && state.generation === claim.generation) state.owner = null;
    },
  };
}

function alert(id: number, signalId: string): ReturnType<typeof paperAlertReadRow> {
  const issuedAt = new Date("2026-10-16T15:59:00.000Z");
  const stored: StoredPaperAlertRow = {
    id,
    eventKey: `${signalId}:ENTRY_CONFIRMED:v1`,
    paperSignalId: signalId,
    contractId: `contract-${id}`,
    eventType: "ENTRY_CONFIRMED",
    eventVersion: 1,
    status: "enqueued",
    transport: "workspace-cron-read-model",
    destinationLabel: "research-side-chat",
    payloadJson: JSON.stringify({ signal_id: signalId, alert_type: "ENTRY_CONFIRMED", issued_at: issuedAt.toISOString(), test: false }),
    enqueuedAt: issuedAt,
    acknowledgedAt: null,
    attemptCount: 0,
    lastError: null,
    createdAt: issuedAt,
    updatedAt: issuedAt,
  };
  return paperAlertReadRow(stored);
}

function deliveryContext(now: Date, ledger: readonly PaperDeliveryLedgerRecord[]): PaperDeliveryEvaluationContext {
  return { now, scope: "production", maxAgeMsByAlertType: { SETUP_PENDING: 15 * 60_000, ENTRY_CONFIRMED: 60 * 60_000 }, ledger };
}

describe("paper poll lease construction validation", () => {
  const now = new Date("2026-10-21T19:00:00.000Z");

  test("a well-formed attempt carries the owner token and a strictly-future expiry", () => {
    const attempt = buildPaperPollLeaseAttempt({ lane: "issuance_cycle", ownerToken: "inv-1:issuance_cycle:uuid", ttlMs: 5 * 60_000, now });
    expect(attempt.ownerToken).toBe("inv-1:issuance_cycle:uuid");
    expect(attempt.leaseExpiresAt.getTime()).toBe(now.getTime() + 5 * 60_000);
    expect(attempt.leaseExpiresAt.getTime()).toBeGreaterThan(now.getTime());
  });

  test("an empty owner token is rejected as lease_construction_invalid", () => {
    let caught: unknown = null;
    try { buildPaperPollLeaseAttempt({ lane: "issuance_cycle", ownerToken: "", ttlMs: 5 * 60_000, now }); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(PaperPollLeaseConstructionError);
    expect((caught as PaperPollLeaseConstructionError).kind).toBe(LEASE_CONSTRUCTION_INVALID_KIND);
    expect((caught as Error).message).toContain("lease_construction_invalid");
  });

  test("a non-positive or non-finite TTL can never produce a valid expiry and is rejected", () => {
    for (const ttlMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      let caught: unknown = null;
      try { buildPaperPollLeaseAttempt({ lane: "entry_watch", ownerToken: "tok", ttlMs, now }); } catch (error) { caught = error; }
      expect(caught).toBeInstanceOf(PaperPollLeaseConstructionError);
      expect((caught as PaperPollLeaseConstructionError).kind).toBe(LEASE_CONSTRUCTION_INVALID_KIND);
    }
  });

  test("a construction-invalid acquisition attempt performs no store write and leaves lease state unchanged", async () => {
    const state: LeaseState<number> = { owner: "prior-owner", generation: 7, rerun: false, result: null };
    const before = JSON.stringify(state);
    let writes = 0;
    // Mirrors the deployed acquire ordering: construction validation runs
    // first; only a validated attempt may touch the store.
    const acquireLikeProduction = async (ownerToken: string, ttlMs: number) => {
      const attempt = buildPaperPollLeaseAttempt({ lane: "issuance_cycle", ownerToken, ttlMs, now: new Date() });
      writes += 1;
      state.owner = attempt.ownerToken;
      state.generation += 1;
      return attempt;
    };
    let caught: unknown = null;
    try { await acquireLikeProduction("", 5 * 60_000); } catch (error) { caught = error; }
    expect(caught).toBeInstanceOf(PaperPollLeaseConstructionError);
    expect(writes).toBe(0);
    expect(JSON.stringify(state)).toBe(before);
    // A valid attempt afterwards still acquires normally.
    const ok = await acquireLikeProduction("inv-2:issuance_cycle:uuid", 5 * 60_000);
    expect(ok.ownerToken).toBe("inv-2:issuance_cycle:uuid");
    expect(state.generation).toBe(8);
  });
});

describe("bounded paper poll concurrency", () => {
  test("coalesces overlapping polls into one worker and at most one bounded follow-up", async () => {
    const state: LeaseState<number> = { owner: null, generation: 0, rerun: false, result: null };
    let releaseFirst: () => void = () => undefined;
    const firstBlocked = new Promise<void>((resolve) => { releaseFirst = resolve; });
    let entered = 0;
    let active = 0;
    let maxActive = 0;
    const leader = runBoundedCoalescedPoll(memoryLeaseStore(state, "leader"), async () => {
      entered += 1;
      active += 1;
      maxActive = Math.max(maxActive, active);
      if (entered === 1) await firstBlocked;
      active -= 1;
      return entered;
    }, 2);

    await Promise.resolve();
    const overlaps = await Promise.all(Array.from({ length: 25 }, (_, index) => runBoundedCoalescedPoll(memoryLeaseStore(state, `follower-${index}`), async () => 99, 2)));
    expect(overlaps.every((result) => result.coalesced)).toBe(true);
    releaseFirst();
    const completed = await leader;
    expect(completed.coalesced).toBe(false);
    if (!completed.coalesced) expect(completed.passes).toBe(2);
    expect(entered).toBe(2);
    expect(maxActive).toBe(1);
    expect(state.owner).toBeNull();
    expect(state.result).toBe(2);
  });

  test("the delivery-worker entry point coalesces overlap and keeps total active delivery polls at one", async () => {
    const lease: LeaseState<{ examined: number; sent: number; suppressed: number; skipped: number }> = { owner: null, generation: 0, rerun: false, result: null };
    const rows = [alert(11, "sig-poll-a"), alert(12, "sig-poll-b")];
    const ledger = new Map<string, PaperDeliveryLedgerRecord>();
    let releaseTransport: () => void = () => undefined;
    const transportBlocked = new Promise<void>((resolve) => { releaseTransport = resolve; });
    let sends = 0;
    const now = new Date("2026-10-16T16:00:00.000Z");
    const deps = {
      workerToken: "delivery-leader",
      leaseMs: 60_000,
      async claimLedger(record: PaperDeliveryLedgerRecord, expected: PaperDeliveryLedgerRecord | null) {
        const key = `production:${record.signal_id}:${record.alert_type}`;
        const current = ledger.get(key) ?? null;
        if (expected === null ? current !== null : current !== expected) return false;
        ledger.set(key, { ...record });
        return true;
      },
      async writeLedger(record: PaperDeliveryLedgerRecord, owner: string) {
        const key = `production:${record.signal_id}:${record.alert_type}`;
        if (ledger.get(key)?.owner_token === owner) ledger.set(key, { ...record });
      },
      async render(payload: { signal_id: string }) { return payload.signal_id; },
      async send() { sends += 1; if (sends === 1) await transportBlocked; return { state: "delivered" as const, acknowledgedAtUtc: "2026-10-16T16:00:02.000Z" }; },
      now: () => now,
    };
    const context = deliveryContext(now, []);
    const leader = executePaperDeliveryPoll(memoryLeaseStore(lease, "delivery-leader"), rows, context, deps, 10, 2);
    await Promise.resolve();
    const overlap = await executePaperDeliveryPoll(memoryLeaseStore(lease, "delivery-follower"), rows, context, { ...deps, workerToken: "delivery-follower" }, 10, 2);
    expect(overlap.coalesced).toBe(true);
    releaseTransport();
    const completed = await leader;
    expect(completed.coalesced).toBe(false);
    if (!completed.coalesced) expect(completed.passes).toBe(2);
    expect(sends).toBe(2);
    expect([...ledger.values()].every((record) => record.state === "delivered")).toBe(true);
  });

  test("generation fencing prevents a stale worker from clobbering newer progress", async () => {
    const state: LeaseState<string> = { owner: "new-worker", generation: 7, rerun: false, result: "new-progress" };
    const store = memoryLeaseStore(state, "unused");
    const stale: PaperPollClaim = { ownerToken: "old-worker", generation: 6 };
    expect(await store.complete(stale, "stale-result")).toBe(false);
    expect(state).toEqual({ owner: "new-worker", generation: 7, rerun: false, result: "new-progress" });
  });

  test("overlapping delivery polls lose no alerts and atomically suppress duplicate sends", async () => {
    const rows = [alert(1, "sig-a"), alert(2, "sig-b")];
    const ledger = new Map<string, PaperDeliveryLedgerRecord>();
    const sends = new Map<string, number>();
    const now = new Date("2026-10-16T16:00:00.000Z");

    const executePoll = async (workerToken: string) => Promise.all(rows.map(async (row) => {
      const snapshot = [...ledger.values()];
      const decision = evaluatePaperDeliveryDecision(row, deliveryContext(now, snapshot));
      return executePaperDelivery(decision, "production", {
        workerToken,
        leaseMs: 60_000,
        async claimLedger(record, expected) {
          const key = paperDeliveryKey({ signal_id: record.signal_id, alert_type: record.alert_type, issued_at: record.issued_at, test: false }, record.scope);
          const current = ledger.get(key) ?? null;
          if (expected === null ? current !== null : current !== expected) return false;
          ledger.set(key, { ...record });
          return true;
        },
        async writeLedger(record, owner) {
          const key = paperDeliveryKey({ signal_id: record.signal_id, alert_type: record.alert_type, issued_at: record.issued_at, test: false }, record.scope);
          if (ledger.get(key)?.owner_token === owner) ledger.set(key, { ...record });
        },
        async render(payload) { return payload.signal_id; },
        async send(rendered) {
          sends.set(rendered, (sends.get(rendered) ?? 0) + 1);
          return { state: "delivered" as const, acknowledgedAtUtc: "2026-10-16T16:00:01.000Z" };
        },
        now: () => now,
      });
    }));

    await Promise.all([executePoll("worker-a"), executePoll("worker-b")]);
    expect([...sends.entries()].sort()).toEqual([["sig-a", 1], ["sig-b", 1]]);
    expect([...ledger.values()].every((record) => record.state === "delivered" && record.acknowledged_at_utc === "2026-10-16T16:00:01.000Z")).toBe(true);
  });

  test("a persisted send marker is surfaced as uncertain and never auto-retried", () => {
    const row = alert(30, "sig-unacked");
    const sentWithoutAck: PaperDeliveryLedgerRecord = {
      signal_id: "sig-unacked",
      alert_type: "ENTRY_CONFIRMED",
      issued_at: "2026-10-16T15:59:00.000Z",
      sent_at_utc: "2026-10-16T16:00:00.000Z",
      scope: "production",
      state: "committed",
      acknowledged_at_utc: null,
      unknown_surfaced_at_utc: null,
      owner_token: "worker-crashed-after-send-marker",
      lease_expires_at_utc: "2026-10-16T16:01:00.000Z",
    };
    const decision = evaluatePaperDeliveryDecision(row, deliveryContext(new Date("2026-10-16T16:02:00.000Z"), [sentWithoutAck]));
    expect(decision.decision).toBe("suppress");
    expect(decision.reason).toBe("sent_unacknowledged");
    expect(decision.surfaceUnknown).toBe(true);
  });

  test("a crash before transport resumes after the durable lease without duplicating an acknowledged send", async () => {
    const row = alert(3, "sig-recover");
    const ledger = new Map<string, PaperDeliveryLedgerRecord>();
    let now = new Date("2026-10-16T16:00:00.000Z");
    let sends = 0;
    const deps = (workerToken: string, failRender: boolean) => ({
      workerToken,
      leaseMs: 1_000,
      async claimLedger(record: PaperDeliveryLedgerRecord, expected: PaperDeliveryLedgerRecord | null) {
        const key = `production:${record.signal_id}:${record.alert_type}`;
        const current = ledger.get(key) ?? null;
        if (expected === null ? current !== null : current !== expected) return false;
        ledger.set(key, { ...record });
        return true;
      },
      async writeLedger(record: PaperDeliveryLedgerRecord, owner: string) {
        const key = `production:${record.signal_id}:${record.alert_type}`;
        if (ledger.get(key)?.owner_token === owner) ledger.set(key, { ...record });
      },
      async render() { if (failRender) throw new Error("render interrupted"); return "sig-recover"; },
      async send() { sends += 1; return { state: "delivered" as const, acknowledgedAtUtc: "2026-10-16T16:00:03.000Z" }; },
      now: () => now,
    });

    const first = evaluatePaperDeliveryDecision(row, deliveryContext(now, []));
    await expect(executePaperDelivery(first, "production", deps("worker-crashed", true))).rejects.toThrow("render interrupted");
    expect(sends).toBe(0);
    const committed = [...ledger.values()][0];
    expect(committed?.state).toBe("committed");

    now = new Date("2026-10-16T16:00:02.000Z");
    const retry = evaluatePaperDeliveryDecision(row, deliveryContext(now, [...ledger.values()]));
    expect(retry.reason).toBe("recoverable_commit");
    const delivered = await executePaperDelivery(retry, "production", deps("worker-recovery", false));
    expect(sends).toBe(1);
    expect(delivered?.state).toBe("delivered");
    expect(delivered?.acknowledged_at_utc).toBe("2026-10-16T16:00:03.000Z");

    const afterAck = evaluatePaperDeliveryDecision(row, deliveryContext(now, [...ledger.values()]));
    expect(afterAck.reason).toBe("already_delivered");
    expect(await executePaperDelivery(afterAck, "production", deps("worker-late", false))).toEqual(afterAck.ledger);
    expect(sends).toBe(1);
  });
});
