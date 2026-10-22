/**
 * Venue-clock-skew (workstream B, 2026-10-13) — regression tests.
 *
 * Proves, through the REAL DB path (DbStore over node:sqlite) and the full
 * integrated handler:
 *   1. A venue print timestamped in the FUTURE relative to our clock is
 *      DEFERRED with the named reason `deferred_clock_skew_future_observation`
 *      — the candidate stays awaiting-entry, the pending contract is intact,
 *      the timestamp is never clamped, and NO entry evidence is fabricated
 *      (no signal, no fill, no entryObservedAt).
 *   2. On a later tick, once the print's timestamp is no longer in the
 *      future (our clock caught up), the SAME print is consumed normally:
 *      the candidate issues with entryObservedAt == the print's original
 *      (unclamped) timestamp.
 *   3. Unit: skewGuardedFeed throws VenueClockSkewError on future prints
 *      (sync and async feeds) and passes through present prints untouched.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { manualClock } from "../src/clock.js";
import type { Clock } from "../src/clock.js";
import { DbStore } from "../src/persistence/db-store.js";
import {
  integratedManualIssue,
  skewGuardedFeed,
  VenueClockSkewError,
  type EntryObservationFeed,
  type IntegratedDeps,
  type PostEntryEvidence,
} from "../src/issuance/handler.js";
import type { AlertRow } from "../src/types.js";
import { MutableClock, ScriptedFeed } from "../../entry-v1/src/feed.js";
import type { TradePrint, VenueFeed } from "../../entry-v1/src/feed.js";
import {
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
// The provider-clock-ahead print: timestamped 60s in OUR future, but
// observable right now (availableAt == now) — the provider clock is ahead,
// not the feed.
const SKEW_PRINT_TS = T_CRYPTO + 60_000;

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

/** Wire the skewed feed: one print at SKEW_PRINT_TS, observable immediately. */
function wireSkewedFeed(ctx: Ctx): MutableClock {
  const feedClock = new MutableClock(ctx.clock.now());  const feed = new ScriptedFeed(
    [{ ts: SKEW_PRINT_TS, price: 100.2, venue: "binance-spot", availableAt: ctx.clock.now(), venueTradeId: "agg-8001", venueSeq: 8001 }],
    feedClock,
  );
  ctx.deps.entryFeedFor = (): EntryObservationFeed => ({
    feed,
    clock: feedClock,
    pollIntervalMs: 60_000,
    maxPolls: 5000,
    advance: (ms: number) => {
      feedClock.advance(ms);
      ctx.clock.advance(ms);
    },
  });
  ctx.deps.waitingIntervalEvidenceFor = () => [
    // Point strictly inside the decision→entry interval (mirrors the proven
    // crash-test shape): clean price, above the stop.
    pointPrint(SKEW_PRINT_TS - 30_000, 100.1, "waiting-interval point (clean)"),
  ];
  ctx.deps.postEntryEvidenceFor = (): PostEntryEvidence => ({
    bars: [
      h1Bar(new Date(SKEW_PRINT_TS).toISOString(),
        { open: 100, high: 101, low: 97, close: 100.5 }, "post-entry 1h (clean)"),
    ],
    nowAt: SKEW_PRINT_TS + 3_600_000,
  });
  return feedClock;
}

describe("venue-clock-skew: future print defers with the named reason, retries later", () => {
  it("regression: future-timestamped print -> deferred_clock_skew_future_observation; later tick accepts it unclamped", async () => {
    const ctx = makeCtx();
    const feedClock = wireSkewedFeed(ctx);
    const input = integratedCryptoCandidate({ symbol: "SKEW" });

    // Phase 1: our clock is 60s behind the print's timestamp. The print is
    // served (observable) but its timestamp is in the future -> DEFER.
    const deferred = await integratedManualIssue(ctx.deps, input, "invocation-skew-1");
    assert.equal(deferred.status, "awaiting-entry", "skew defers; it never issues, expires, or invalidates");
    assert.equal(deferred.outcome?.gate, "clock-skew");
    assert.ok(
      deferred.outcome?.reason.startsWith("deferred_clock_skew_future_observation"),
      `deferral reason must carry the named reason, got: ${deferred.outcome?.reason}`,
    );
    assert.ok(deferred.nextReassessmentAt !== null, "a later tick is scheduled");

    // NEVER fabricate entry evidence from the future print: no signal row,
    // the contract is still pending with empty entry fields, and the print's
    // timestamp was never clamped into an entry.
    assert.equal(ctx.store.listSignals().length, 0, "no signal from a future-timestamped print");
    const contractRow = ctx.store.getContract(deferred.contractId!)!;
    assert.equal(contractRow.state, "pending", "pending contract intact");
    const contractJson = JSON.parse(contractRow.contractJson) as { entryState: string; entryObservedAt: unknown };
    assert.equal(contractJson.entryState, "pending");
    assert.equal(contractJson.entryObservedAt, null, "no entry observed from the future print");
    assert.equal(deferred.entryObservedAt, null);

    // Phase 2: our clock catches up (print ts is now 1s in the past — inside
    // the tolerance). The SAME print is consumed normally on the resume.
    ctx.clock.set(T_CRYPTO + 61_000);
    feedClock.set(T_CRYPTO + 61_000);
    const rec = await integratedManualIssue(ctx.deps, input, "invocation-skew-2");
    assert.equal(rec.status, "issued", `expected issued after the skew clears, got ${rec.status}: ${rec.outcome?.reason}`);
    assert.equal(ctx.store.listSignals().length, 1);
    // The entry timestamp is the print's ORIGINAL timestamp — never clamped
    // to our clock.
    assert.equal(
      rec.entryObservedAt,
      new Date(SKEW_PRINT_TS).toISOString(),
      "entryObservedAt is the print's own timestamp, unclamped",
    );
    const signal = ctx.store.listSignals()[0]!;
    assert.equal(signal.entryPrice, 100.2);
    const entryAlert = ctx.store.listAlerts().find((a: AlertRow) => a.kind === "entry")!;
    assert.equal(entryAlert.deliveryStatus, "delivered");
    ctx.store.close();
  });

  it("a print timestamped exactly at our now is not skew (boundary: ts > now, strictly)", async () => {
    const ctx = makeCtx();
    const feedClock = new MutableClock(T_CRYPTO);
    const feed = new ScriptedFeed(
      [{ ts: T_CRYPTO, price: 100.2, venue: "binance-spot", availableAt: T_CRYPTO, venueTradeId: "agg-8002", venueSeq: 8002 }],
      feedClock,
    );
    ctx.deps.entryFeedFor = (): EntryObservationFeed => ({
      feed, clock: feedClock, pollIntervalMs: 60_000, maxPolls: 5000,
      advance: (ms: number) => { feedClock.advance(ms); ctx.clock.advance(ms); },
    });
    ctx.deps.waitingIntervalEvidenceFor = () => [pointPrint(T_CRYPTO, 100.1, "waiting-interval point (clean)")];
    ctx.deps.postEntryEvidenceFor = (): PostEntryEvidence => ({
      bars: [h1Bar(new Date(T_CRYPTO).toISOString(),
        { open: 100, high: 101, low: 97, close: 100.5 }, "post-entry 1h (clean)")],
      nowAt: T_CRYPTO + 3_600_000,
    });
    const input = integratedCryptoCandidate({ symbol: "ATNOW" });
    const rec = await integratedManualIssue(ctx.deps, input, "invocation-atnow-1");
    assert.equal(rec.status, "issued", `ts == now must not defer, got ${rec.status}: ${rec.outcome?.reason}`);
    assert.equal(rec.entryObservedAt, new Date(T_CRYPTO).toISOString());
    ctx.store.close();
  });
});

describe("skewGuardedFeed unit", () => {
  const prints: TradePrint[] = [
    { ts: 1_000, price: 100, venue: "binance-spot", venueTradeId: "agg-8003", venueSeq: 8003 },
    { ts: 8_000, price: 101, venue: "binance-spot", venueTradeId: "agg-8004", venueSeq: 8004 }, // future vs now=1_000 (tolerance 5_000)
  ];
  const syncFeed: VenueFeed = { latestPrints: () => [...prints] };

  it("passes present prints through untouched", () => {
    const guarded = skewGuardedFeed(syncFeed, () => 10_000);
    assert.deepEqual(guarded.latestPrints(0), prints);
  });

  it("throws VenueClockSkewError on a future print (never clamps)", () => {
    const guarded = skewGuardedFeed(syncFeed, () => 1_000);
    assert.throws(
      () => guarded.latestPrints(0),
      (e: unknown) => {
        assert.ok(e instanceof VenueClockSkewError);
        assert.equal(e.printTs, 8_000);
        assert.equal(e.nowMs, 1_000);
        assert.match(e.message, /^deferred_clock_skew_future_observation/);
        return true;
      },
    );
  });

  it("checks async feeds too", async () => {
    const asyncFeed: VenueFeed = { latestPrints: async () => [...prints] };
    const guarded = skewGuardedFeed(asyncFeed, () => 1_000);
    await assert.rejects(
      () => Promise.resolve(guarded.latestPrints(0)),
      (e: unknown) => e instanceof VenueClockSkewError,
    );
    const ok = skewGuardedFeed(asyncFeed, () => 10_000);
    assert.deepEqual(await ok.latestPrints(0), prints);
  });

  it("honours a custom tolerance", () => {
    const guarded = skewGuardedFeed(syncFeed, () => 7_500, 500);
    // ts 8000 is exactly at the boundary (7500 + 500): not > -> passes
    assert.deepEqual(guarded.latestPrints(0), prints);
    const strict = skewGuardedFeed(syncFeed, () => 7_499, 500);
    assert.throws(() => strict.latestPrints(0), VenueClockSkewError);
  });
});
