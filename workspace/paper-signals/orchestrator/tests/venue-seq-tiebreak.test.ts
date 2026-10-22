/**
 * Venue trade id preservation + sequence-based tie-breaking (handler v2.1.9).
 *
 * Two defects repaired:
 *
 * 1. DROPPED / SYNTHESIZED VENUE TRADE ID. The real adapter
 *    (pilot/src/binance.ts BinanceVenueFeed) fetched Binance aggTrades —
 *    which carry the aggregate trade id `a` — and then DROPPED it in the
 *    map, emitting only { ts, price, venue }. Downstream,
 *    firstPrintIdentity() REPLACED the missing id with a synthesized
 *    `trade:${venue}:${ts}:${price}` stand-in. The chain
 *    feed -> checkpoint -> contract -> alert evidence now preserves the
 *    REAL venue-assigned id verbatim at every step; nothing synthesizes it.
 *
 * 2. PRICE TIEBREAK. observeEntryPhase sorted same-timestamp candidates by
 *    ascending PRICE. The rule is now: order by (venue timestamp, VENUE
 *    SEQUENCE) ascending — the venue's own monotonic ordering field
 *    (aggTrades `a`) is the authority on execution order within a
 *    millisecond. Price and arrival order are never tiebreakers.
 *
 * The adapter regression below runs against the ACTUAL feed adapter code
 * (BinanceVenueFeed.latestPrints with a stubbed transport returning a
 * canned venue response) — not a mock of the adapter. The handler
 * regression runs the REAL integrated issuance handler end-to-end.
 */
import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import { manualClock } from "../src/clock.js";
import type { Clock } from "../src/clock.js";
import { DbStore } from "../src/persistence/db-store.js";
import {
  comparePrintsByVenueOrder,
  integratedManualIssue,
  type CheckpointedContract,
  type EntryObservationFeed,
  type IntegratedDeps,
  type PostEntryEvidence,
} from "../src/issuance/handler.js";
import { MutableClock } from "../../entry-v1/src/feed.js";
import type { TradePrint, VenueFeed } from "../../entry-v1/src/feed.js";
import { BinanceVenueFeed } from "../../pilot/src/binance.js";
import { h1Bar, integratedCryptoCandidate } from "./fixtures.js";
import type { EvidenceBar } from "../../veto/src/veto.js";

type MutableTestClock = Clock & { advance(ms: number): void; set(ms: number): void };

interface Ctx {
  deps: IntegratedDeps;
  clock: MutableTestClock;
  store: DbStore;
}

const T0 = Date.parse("2026-10-14T04:00:00.000Z");

function makeCtx(startMs: number): Ctx {
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
    isClosed: true, granularity: "trade_print", source: "tiebreak-fixture", label,
  };
}

const cleanVetoBar = () =>
  h1Bar("2026-10-14T01:00:00.000Z", { open: 99.5, high: 100.5, low: 96, close: 100 }, "post-decision 1h (clean)");

function wireCleanEvidence(ctx: Ctx, entryTs: number): void {
  ctx.deps.waitingIntervalEvidenceFor = () =>
    [pointPrint(T0 + 10_000, 100.1, "waiting-interval point (clean)")];
  ctx.deps.postEntryEvidenceFor = (): PostEntryEvidence => ({
    bars: [
      h1Bar(new Date(entryTs).toISOString(),
        { open: 100, high: 101, low: 97, close: 100.5 }, "post-entry 1h (clean)"),
      h1Bar(new Date(entryTs + 3_600_000).toISOString(),
        { open: 100.5, high: 102, low: 98, close: 101 }, "post-entry 1h (clean)"),
    ],
    nowAt: entryTs + 2 * 3_600_000,
  });
}

// ---------------------------------------------------------------------------
// Part A — REAL adapter: BinanceVenueFeed against a canned venue response.
// ---------------------------------------------------------------------------

describe("real adapter: BinanceVenueFeed preserves the venue trade id and venue sequence", () => {
  const realFetch = globalThis.fetch;

  beforeEach(() => {
    // Canned Binance /api/v3/aggTrades response. All three prints share the
    // SAME venue timestamp T; the response order is scrambled and the price
    // order disagrees with the venue sequence order:
    //   - a=5003 served FIRST, highest price
    //   - a=5001 served second, middle price, LOWEST sequence -> the true first print
    //   - a=5002 served last, LOWEST price
    // A naive price-based selection picks a=5002; a naive arrival-order
    // selection picks a=5003. Only the venue sequence picks a=5001.
    const canned = [
      { a: 5003, p: "100.10", q: "0.500", f: 9001, l: 9001, T: 1728878400000, m: false, M: true },
      { a: 5001, p: "100.30", q: "0.200", f: 8999, l: 8999, T: 1728878400000, m: true, M: true },
      { a: 5002, p: "100.05", q: "0.300", f: 9000, l: 9000, T: 1728878400000, m: false, M: true },
    ];
    globalThis.fetch = (async () => ({
      ok: true,
      status: 200,
      json: async () => canned,
      text: async () => JSON.stringify(canned),
    })) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("latestPrints emits the real aggTrades `a` as venueTradeId/venueSeq, ordered by (ts, venueSeq)", async () => {
    const feed = new BinanceVenueFeed("BTCUSDT");
    const prints = await feed.latestPrints(1728878400000 - 1);
    assert.equal(prints.length, 3);
    // Venue sequence order, not arrival order (5003 was served first) and
    // not price order (5002 is cheapest).
    assert.deepEqual(
      prints.map((p) => p.venueSeq),
      [5001, 5002, 5003],
      "prints ordered by (venue ts, venue sequence)",
    );
    // The real venue trade id is preserved verbatim — never dropped, never
    // replaced by an internal id.
    assert.deepEqual(
      prints.map((p) => p.venueTradeId),
      ["5001", "5002", "5003"],
    );
    for (const p of prints) {
      assert.equal(p.venue, "binance-spot");
      assert.equal(p.ts, 1728878400000);
      assert.ok(p.price > 0);
    }
    assert.equal(prints[0]!.venueTradeId, "5001", "the true first print is the lowest-sequence print");
  });
});

// ---------------------------------------------------------------------------
// Part B — handler tiebreak through the real integrated issuance handler.
// ---------------------------------------------------------------------------

describe("handler: same-timestamp candidates resolve by venue sequence (v2.1.9)", () => {
  /**
   * Two eligible prints, SAME venue timestamp, served in one batch:
   *   - print A: LOWER price (100.05), served FIRST, HIGHER venue seq (9002)
   *   - print B: HIGHER price (100.20), served second, LOWER venue seq (9001)
   * Price-based selection picks A; arrival-order selection picks A; the
   * venue sequence says B executed first. Both are within the drift cap.
   */
  function tiebreakFeed(): { feed: VenueFeed; clock: MutableClock } {
    const feedClock = new MutableClock(T0);
    const PRINT_TS = T0 + 30_000;
    const prints: TradePrint[] = [
      { ts: PRINT_TS, price: 100.05, venue: "binance-spot", venueTradeId: "agg-9002", venueSeq: 9002 },
      { ts: PRINT_TS, price: 100.20, venue: "binance-spot", venueTradeId: "agg-9001", venueSeq: 9001 },
    ];
    const feed: VenueFeed = {
      latestPrints: async (_sinceTs: number) => {
        feedClock.set(PRINT_TS); // timely receipt at the print instant
        return [...prints]; // arrival order: the higher-seq print first
      },
      historyCoverage: async (_sinceTs: number) => ({ historyStartMs: Number.NEGATIVE_INFINITY }),
    };
    return { feed, clock: feedClock };
  }

  it("unit: comparePrintsByVenueOrder picks the lower-sequence print where a price tiebreak picks the wrong one", () => {
    const a: TradePrint = { ts: T0, price: 100.05, venue: "binance-spot", venueTradeId: "agg-9002", venueSeq: 9002 };
    const b: TradePrint = { ts: T0, price: 100.20, venue: "binance-spot", venueTradeId: "agg-9001", venueSeq: 9001 };
    const naivePrice = [a, b].sort((x, y) => x.ts - y.ts || x.price - y.price);
    const byVenue = [a, b].sort(comparePrintsByVenueOrder);
    assert.equal(naivePrice[0]!.venueTradeId, "agg-9002", "price tiebreak crowns the later-executed print");
    assert.equal(byVenue[0]!.venueTradeId, "agg-9001", "venue-sequence tiebreak crowns the earlier-executed print");
    assert.notEqual(
      naivePrice[0]!.venueTradeId, byVenue[0]!.venueTradeId,
      "the fixture discriminates: removing the tiebreak changes the selected print — this test fails without it",
    );
  });

  it("integrated: the handler enters on the lower-venue-sequence print and the checkpoint/alert evidence carry its REAL trade id", async () => {
    const ctx = makeCtx(T0);
    const input = integratedCryptoCandidate({ symbol: "TIE1", vetoBars: [cleanVetoBar()] });
    const { feed, clock: feedClock } = tiebreakFeed();
    ctx.deps.entryFeedFor = (): EntryObservationFeed => ({
      feed, clock: feedClock, pollIntervalMs: 60_000, maxPolls: 5000,
      advance: (ms: number) => { feedClock.advance(ms); ctx.clock.advance(ms); },
    });
    wireCleanEvidence(ctx, T0 + 30_000);
    const rec = await integratedManualIssue(ctx.deps, input, "tiebreak-reg1");
    assert.equal(rec.status, "issued");
    assert.equal(rec.entryObservedAt, new Date(T0 + 30_000).toISOString());
    // Entered at print B's price (100.20), NOT print A's (100.05).
    assert.equal(ctx.store.listSignals().length, 1);
    assert.equal(ctx.store.listSignals()[0]!.entryPrice, 100.20);
    // Checkpoint pins print B by its REAL venue trade id + sequence.
    const row = ctx.store.getContract(rec.contractId!)!;
    assert.equal(row.state, "entered");
    const enteredJson = JSON.parse(row.contractJson) as CheckpointedContract;
    const fp = enteredJson.observationCheckpoint?.firstPrint;
    assert.equal(fp?.venueTradeId, "agg-9001", "checkpoint carries the real venue trade id, verbatim");
    assert.equal(fp?.venueSeq, 9001, "checkpoint records the winning venue sequence");
    assert.equal(fp?.ts, T0 + 30_000);
    // Alert evidence names the real venue trade id.
    const signal = ctx.store.listSignals()[0]!;
    assert.match(signal.gateSummary, /venue trade agg-9001/, "gate summary names the real venue trade id");
    assert.match(signal.gateSummary, /seq 9001/);
    const outcome = rec.outcome as unknown as { detail: Record<string, unknown> };
    assert.equal(outcome.detail.entryVenueTradeId, "agg-9001");
    assert.equal(outcome.detail.entryVenueSeq, 9001);
    ctx.store.close();
  });

  it("integrated: a served print without a venue-assigned trade id fails closed as non-entry:first-print-unverifiable", async () => {
    const ctx = makeCtx(T0);
    const input = integratedCryptoCandidate({ symbol: "TIE2", vetoBars: [cleanVetoBar()] });
    const feedClock = new MutableClock(T0);
    const feed: VenueFeed = {
      latestPrints: async (_sinceTs: number) => {
        feedClock.set(T0 + 30_000);
        // A print the venue did not identify: no venueTradeId, no venueSeq.
        // The handler must not synthesize an id and must not enter on it.
        return [{ ts: T0 + 30_000, price: 100.2, venue: "binance-spot" } as unknown as TradePrint];
      },
      historyCoverage: async (_sinceTs: number) => ({ historyStartMs: Number.NEGATIVE_INFINITY }),
    };
    ctx.deps.entryFeedFor = (): EntryObservationFeed => ({
      feed, clock: feedClock, pollIntervalMs: 60_000, maxPolls: 5000,
      advance: (ms: number) => { feedClock.advance(ms); ctx.clock.advance(ms); },
    });
    wireCleanEvidence(ctx, T0 + 30_000);
    const rec = await integratedManualIssue(ctx.deps, input, "tiebreak-reg2");
    assert.equal(rec.status, "invalidated");
    assert.equal(rec.outcome?.gate, "first-print-unverifiable");
    assert.match(rec.outcome!.reason, /non-entry:first-print-unverifiable/);
    assert.match(rec.outcome!.reason, /venue-assigned trade id/);
    assert.equal(ctx.store.listSignals().length, 0, "no signal on an unidentifiable print");
    assert.equal(ctx.store.listAlerts().filter((a) => a.kind === "entry").length, 0, "no entry alert");
    ctx.store.close();
  });
});
