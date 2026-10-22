/**
 * Recoverable alert delivery (workstream B, 2026-10-13) — behavioral tests.
 *
 * Proves, through the REAL DB path (DbStore over node:sqlite) and the full
 * integrated handler:
 *   1. A transport failure (hook throw) marks the alert failed — never
 *      delivered without an acknowledgement — and the recovery pass
 *      (recoverUndeliveredAlerts) redelivers it exactly once with the correct
 *      final state (delivered, delivery_mode, ack id, attempt count).
 *   2. A hook that returns void (sandbox default) records a SIMULATED
 *      acknowledgement — never labeled "live".
 *   3. An explicit live ack ({ mode: "live", ackId }) is persisted verbatim;
 *      duplicate acknowledgements are a no-op (first ack wins).
 *   4. { acknowledged: false } is a transport failure → recovery delivers
 *      once the transport is fixed.
 *   5. Claim-before-send: a delivered alert cannot be re-claimed; an empty
 *      recovery pass is a no-op.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { manualClock } from "../src/clock.js";
import type { Clock } from "../src/clock.js";
import { DbStore } from "../src/persistence/db-store.js";
import {
  integratedManualIssue,
  recoverUndeliveredAlerts,
  type EntryObservationFeed,
  type IntegratedDeps,
  type PostEntryEvidence,
} from "../src/issuance/handler.js";
import type { AlertRow } from "../src/types.js";
import {
  cryptoPrintFeed,
  h1Bar,
  integratedCryptoCandidate,
} from "./fixtures.js";
import type { EvidenceBar } from "../../veto/src/veto.js";

type MutableTestClock = Clock & { advance(ms: number): void; set(ms: number): void };

interface Ctx {
  deps: IntegratedDeps;
  clock: MutableTestClock;
  store: DbStore;
}

const T_CRYPTO = Date.parse("2026-10-14T04:00:00.000Z");

function makeCtx(startMs: number = T_CRYPTO): Ctx {
  const store = new DbStore(":memory:");
  const clock = manualClock(startMs);
  const deps: IntegratedDeps = {
    store,
    clock,
    config: { freshnessMs: 24 * 3_600_000 },
  };
  return { deps, clock, store };
}

function pointPrint(ts: number, price: number, label: string): EvidenceBar {
  return {
    startAt: ts, endAt: ts,
    open: price, high: price, low: price, close: price,
    isClosed: true, granularity: "trade_print", source: "itg-fixture", label,
  };
}

/** Wire a clean full path: print at +30s (within drift), clean waiting + post-entry evidence. */
function wireCleanPath(ctx: Ctx, printPrice = 100.2): number {
  const setup = cryptoPrintFeed(ctx.clock.now(), 30_000, printPrice);
  const { clock } = ctx;
  ctx.deps.entryFeedFor = (): EntryObservationFeed => ({
    feed: setup.feed,
    clock: setup.clock,
    pollIntervalMs: 60_000,
    maxPolls: 5000,
    advance: (ms: number) => {
      setup.clock.advance(ms);
      clock.advance(ms);
    },
  });
  ctx.deps.waitingIntervalEvidenceFor = () => [
    // Point strictly inside [decisionAt, entryAt) (half-open — the check
    // excludes the entry instant itself): clean price, above the stop.
    pointPrint(setup.printTs - 10_000, 100.1, "waiting-interval point (clean)"),
  ];
  ctx.deps.postEntryEvidenceFor = (): PostEntryEvidence => ({
    bars: [
      h1Bar(new Date(setup.printTs).toISOString(),
        { open: 100, high: 101, low: 97, close: 100.5 }, "post-entry 1h (clean)"),
    ],
    nowAt: setup.printTs + 3_600_000,
  });
  return setup.printTs;
}

function entryAlertOf(store: DbStore): AlertRow {
  return store.listAlerts().find((a) => a.kind === "entry")!;
}

describe("recoverable alert delivery", () => {
  it("transport failure marks the alert failed; recovery redelivers exactly once with correct final state", async () => {
    const ctx = makeCtx();
    const input = integratedCryptoCandidate({ symbol: "RECOV" });
    wireCleanPath(ctx);
    const transportCalls: string[] = [];
    ctx.deps.deliverAlert = async (alert: AlertRow) => {
      transportCalls.push(alert.id);
      if (alert.kind === "entry") throw new Error("transport down: connection refused");
    };

    const rec = await integratedManualIssue(ctx.deps, input, "invocation-recovery-1");
    assert.equal(rec.status, "issued", `expected issued, got ${rec.status}: ${rec.outcome?.reason}`);
    assert.equal(ctx.store.listSignals().length, 1, "signal issued exactly once");

    // The setup alert was acknowledged (void return = simulated ack); the
    // entry alert's transport failed — it must be FAILED, never delivered
    // without an acknowledgement.
    const setupAlert = ctx.store.listAlerts().find((a) => a.kind === "setup")!;
    assert.equal(setupAlert.deliveryStatus, "delivered");
    assert.equal(setupAlert.deliveryMode, "simulated", "sandbox void-return ack is labeled simulated");
    const entryAlert = entryAlertOf(ctx.store);
    assert.equal(entryAlert.deliveryStatus, "failed");
    assert.equal(entryAlert.deliveredAt, null, "no delivery recorded without an ack");
    assert.equal(entryAlert.deliveryMode, null);
    assert.equal(entryAlert.deliveryAttempts, 1, "one attempt: the failed send");
    assert.equal(transportCalls.length, 2, "setup + one failed entry attempt");

    // The transport recovers. The recovery pass redelivers the failed alert.
    ctx.deps.deliverAlert = async (alert: AlertRow) => {
      transportCalls.push(alert.id);
      return { acknowledged: true, mode: "live" as const, ackId: "ack-live-1" };
    };
    const report = await recoverUndeliveredAlerts(ctx.deps);
    assert.deepEqual(report.delivered, [entryAlert.id], "failed alert redelivered");
    assert.deepEqual(report.failed, []);
    assert.deepEqual(report.skipped, []);
    assert.equal(transportCalls.length, 3, "exactly one redelivery — no duplicate sends");

    const final = entryAlertOf(ctx.store);
    assert.equal(final.deliveryStatus, "delivered");
    assert.ok(final.deliveredAt !== null);
    assert.equal(final.deliveryMode, "live");
    assert.equal(final.ackId, "ack-live-1");
    assert.equal(final.deliveryAttempts, 2, "failed attempt + recovery attempt");
    assert.equal(ctx.store.listSignals().length, 1, "recovery never re-issues the signal");
    assert.equal(ctx.store.listAlerts().filter((a) => a.kind === "entry").length, 1, "no duplicate alert row");
    ctx.store.close();
  });

  it("no deliverAlert hook (sandbox default) records delivery as simulated", async () => {
    const ctx = makeCtx();
    wireCleanPath(ctx);
    const input = integratedCryptoCandidate({ symbol: "SIMDEF" });
    const rec = await integratedManualIssue(ctx.deps, input, "invocation-simdef-1");
    assert.equal(rec.status, "issued");
    for (const alert of ctx.store.listAlerts()) {
      assert.equal(alert.deliveryStatus, "delivered");
      assert.equal(alert.deliveryMode, "simulated", "default ack is explicitly simulated, never live");
      assert.ok(alert.deliveredAt !== null);
    }
    ctx.store.close();
  });

  it("explicit live ack with ack id is persisted; duplicate acknowledgement is a no-op", async () => {
    const ctx = makeCtx();
    wireCleanPath(ctx);
    ctx.deps.deliverAlert = async () => ({ acknowledged: true, mode: "live" as const, ackId: "ack-7" });
    const input = integratedCryptoCandidate({ symbol: "LIVEACK" });
    const rec = await integratedManualIssue(ctx.deps, input, "invocation-liveack-1");
    assert.equal(rec.status, "issued");
    const entryAlert = entryAlertOf(ctx.store);
    assert.equal(entryAlert.deliveryMode, "live");
    assert.equal(entryAlert.ackId, "ack-7");
    const deliveredAt = entryAlert.deliveredAt;

    // A duplicate acknowledgement (redelivery producing another ack) is a
    // no-op: the first acknowledgement wins, deliveredAt is unchanged.
    ctx.store.markAlertDelivered(entryAlert.id, "2099-01-01T00:00:00.000Z", { mode: "live", ackId: "ack-7-dup" });
    const after = entryAlertOf(ctx.store);
    assert.equal(after.deliveredAt, deliveredAt, "duplicate ack must not move deliveredAt");
    assert.equal(after.ackId, "ack-7", "first ack id wins");

    // A delivered alert cannot be re-claimed.
    assert.equal(ctx.store.claimAlertForDelivery(entryAlert.id, "claim-x"), false);
    // An empty recovery pass is a no-op.
    const report = await recoverUndeliveredAlerts(ctx.deps);
    assert.deepEqual(report.attempted, []);
    assert.deepEqual(report.delivered, []);
    ctx.store.close();
  });

  it("{ acknowledged: false } is a transport failure; recovery delivers once the transport is fixed", async () => {
    const ctx = makeCtx();
    wireCleanPath(ctx);
    let fixed = false;
    ctx.deps.deliverAlert = async (alert: AlertRow) => {
      if (fixed) return { acknowledged: true, mode: "simulated" as const, ackId: "ack-fixed" };
      if (alert.kind === "entry") return { acknowledged: false };
      return { acknowledged: true, mode: "simulated" as const };
    };
    const input = integratedCryptoCandidate({ symbol: "DECLINED" });
    const rec = await integratedManualIssue(ctx.deps, input, "invocation-declined-1");
    assert.equal(rec.status, "issued");
    const entryAlert = entryAlertOf(ctx.store);
    assert.equal(entryAlert.deliveryStatus, "failed", "declined ack = failed, not delivered");
    assert.equal(entryAlert.deliveredAt, null);

    fixed = true;
    const report = await recoverUndeliveredAlerts(ctx.deps);
    assert.deepEqual(report.delivered, [entryAlert.id]);
    const final = entryAlertOf(ctx.store);
    assert.equal(final.deliveryStatus, "delivered");
    assert.equal(final.deliveryMode, "simulated");
    assert.equal(final.ackId, "ack-fixed");
    ctx.store.close();
  });

  it("claim-before-send serializes senders: a 'sending' row is reclaimed by recovery, not double-sent", async () => {
    const ctx = makeCtx();
    const store = ctx.store;
    store.appendAlert({
      id: "alert_claim_1", kind: "setup", signalId: "sig_x", candidateId: "cand_x",
      symbol: "CLM", direction: "long", alertedAt: "2026-10-14T04:00:00.000Z", channel: "sandbox-feed",
      enqueuedAt: "2026-10-14T04:00:00.000Z", deliveredAt: null, deliveryStatus: "enqueued",
      deliveryMode: null, ackId: null, deliveryAttempts: 0,
    });
    // Sender A claims inside its transaction.
    const wonA = store.transact(() => store.claimAlertForDelivery("alert_claim_1", "claim-A"));
    assert.equal(wonA, true);
    assert.equal(store.listAlerts()[0]!.deliveryStatus, "sending");
    assert.equal(store.listAlerts()[0]!.deliveryAttempts, 1);

    // Sender A "crashes" before the ack: the row stays sending. Recovery
    // reclaims it (a live production sender would need a claim lease; the
    // sandbox reclaims deterministically).
    let sends = 0;
    ctx.deps.deliverAlert = async () => { sends += 1; };
    const report = await recoverUndeliveredAlerts(ctx.deps);
    assert.deepEqual(report.delivered, ["alert_claim_1"]);
    assert.equal(sends, 1, "reclaimed and sent exactly once");
    const final = store.listAlerts()[0]!;
    assert.equal(final.deliveryStatus, "delivered");
    assert.equal(final.deliveryAttempts, 2);
    ctx.store.close();
  });

  it("recovery of a 'sending' row never un-delivers a concurrently delivered alert", async () => {
    const ctx = makeCtx();
    const store = ctx.store;
    store.appendAlert({
      id: "alert_race_1", kind: "entry", signalId: "sig_y", candidateId: "cand_y",
      symbol: "RCE", direction: "long", alertedAt: "2026-10-14T04:00:00.000Z", channel: "sandbox-feed",
      enqueuedAt: "2026-10-14T04:00:00.000Z", deliveredAt: null, deliveryStatus: "enqueued",
      deliveryMode: null, ackId: null, deliveryAttempts: 0,
    });
    let sends = 0;
    ctx.deps.deliverAlert = async () => { sends += 1; };
    // Two overlapping recovery passes over the same row: the in-flight
    // registry serializes them — exactly one send, one delivery. (Which
    // pass wins the claim depends on interleaving; the loser either skips
    // or sees the already-delivered row, never sends.)
    const [r1, r2] = await Promise.all([
      recoverUndeliveredAlerts(ctx.deps),
      recoverUndeliveredAlerts(ctx.deps),
    ]);
    assert.equal(sends, 1, "concurrent recovery passes send exactly once");
    assert.equal(r1.delivered.length + r2.delivered.length, 1);
    for (const skipped of [...r1.skipped, ...r2.skipped]) {
      assert.equal(skipped, "alert_race_1", "only the raced alert may be skipped");
    }
    const final = store.listAlerts()[0]!;
    assert.equal(final.deliveryStatus, "delivered");
    assert.equal(final.deliveryAttempts, 1);
    ctx.store.close();
  });
});
