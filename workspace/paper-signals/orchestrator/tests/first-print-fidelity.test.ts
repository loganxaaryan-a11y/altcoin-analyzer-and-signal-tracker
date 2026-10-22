/**
 * First-print fidelity regressions (handler v2.1.7).
 *
 * The substitution defect: when the true first post-decision print was missed
 * (older than maxObservationAgeMs at receipt), observeEntryPhase skipped it
 * and silently entered on the NEXT print in the same batch under the original
 * "first-post-decision" contract. The repair:
 *   - the earliest eligible print in the served batch is the first-print
 *     candidate; a stale candidate voids as the NAMED non-entry
 *     `non-entry:first-print-missed` (never substituted);
 *   - an empty venue history at window close voids as the NAMED non-entry
 *     `non-entry:first-print-unverifiable` (fail closed);
 *   - every observation run persists a recovery checkpoint (highest
 *     durably-observed print ts + first-print identity) to the contract row;
 *     resumed runs continue FROM the checkpoint;
 *   - the entry alert releases only on complete entry evidence (venue trade
 *     id + observation time + receipt time).
 *
 * v2.1.8 (history-coverage proof): "the fetch returned N prints" never
 * establishes the first print's identity on its own. Every non-empty batch
 * must carry the feed adapter's coverage evidence
 * (VenueFeed.historyCoverage) establishing continuous history back to the
 * requested sinceTs, bound to the actual served response (venue, symbol,
 * requested range, receipt timestamp, raw-response hash,
 * pagination/completeness limits); absent or insufficient evidence fails
 * closed as non-entry:first-print-unverifiable, and an unproven batch never
 * advances the durable checkpoint.
 *
 * The honest claim is adapter-established coverage under documented
 * endpoint assumptions — not "venue-attested proof".
 *
 * All tests run the REAL integrated issuance handler end-to-end.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { manualClock } from "../src/clock.js";
import type { Clock } from "../src/clock.js";
import { DbStore } from "../src/persistence/db-store.js";
import {
  checkEntryEvidenceComplete,
  commitEnteredOutcome,
  firstPrintIdentity,
  integratedManualIssue,
  integratedTick,
  type CheckpointedContract,
  type EntryObservationFeed,
  type IntegratedDeps,
  type PostEntryEvidence,
} from "../src/issuance/handler.js";
import { ContractError } from "../../entry-v1/src/contract.js";
import { MutableClock, ScriptedFeed } from "../../entry-v1/src/feed.js";
import type { HistoryCoverage, VenueFeed } from "../../entry-v1/src/feed.js";
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

const T0 = Date.parse("2026-10-14T04:00:00.000Z"); // decision/handler run

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
    isClosed: true, granularity: "trade_print", source: "fpf-fixture", label,
  };
}

const cleanVetoBar = () =>
  h1Bar("2026-10-14T01:00:00.000Z", { open: 99.5, high: 100.5, low: 96, close: 100 }, "post-decision 1h (clean)");

/** Clean waiting-interval + post-entry evidence so nothing else vetoes the run. */
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

/**
 * Feed serving the missed-first-print scenario: the true first post-decision
 * print (print1 @ T0+10s) is observed only at the T0+8min receipt (7m50s
 * stale), alongside a later print (print2 @ T0+8min, fresh).
 */
function missedFirstFeed(print2Price: number): { feed: VenueFeed; clock: MutableClock } {
  const feedClock = new MutableClock(T0);
  const feed: VenueFeed = {
    latestPrints: async (_sinceTs: number) => {
      feedClock.advance(8 * 60_000 - (feedClock.nowMs() - T0)); // receipt at T0+8min
      return [
        { ts: T0 + 10_000, price: 100.05, venue: "binance-spot", venueTradeId: "agg-8001", venueSeq: 8001 },
        { ts: T0 + 8 * 60_000, price: print2Price, venue: "binance-spot", venueTradeId: "agg-8002", venueSeq: 8002 },
      ];
    },
    // Complete history by construction: the staleness under test is a
    // receipt-age property, not a coverage gap.
    historyCoverage: async (_sinceTs: number) => ({ historyStartMs: Number.NEGATIVE_INFINITY }),
  };
  return { feed, clock: feedClock };
}

function wireMissedFirst(ctx: Ctx, print2Price: number): void {
  const { feed, clock: feedClock } = missedFirstFeed(print2Price);
  ctx.deps.entryFeedFor = (): EntryObservationFeed => ({
    feed, clock: feedClock, pollIntervalMs: 60_000, maxPolls: 5000,
    advance: (ms: number) => { feedClock.advance(ms); ctx.clock.advance(ms); },
  });
  wireCleanEvidence(ctx, T0 + 8 * 60_000);
}

describe("first-print fidelity (v2.1.7)", () => {
  it("regression 1: missed first + later VALID print -> named non-entry:first-print-missed; no issuance, no entry alert", async () => {
    const ctx = makeCtx(T0);
    const input = integratedCryptoCandidate({ symbol: "FPF1", vetoBars: [cleanVetoBar()] });
    wireMissedFirst(ctx, 100.20); // print2 fresh AND valid (0.2% drift)
    const rec = await integratedManualIssue(ctx.deps, input, "fpf-reg1");
    assert.equal(rec.status, "invalidated");
    assert.equal(rec.outcome?.gate, "first-print-missed");
    assert.match(rec.outcome!.reason, /non-entry:first-print-missed/);
    assert.match(rec.outcome!.reason, /never substituted|no later print is substituted/i);
    assert.equal(ctx.store.listSignals().length, 0, "missed first print is a non-entry: no signal row");
    assert.equal(ctx.store.listAlerts().filter((a) => a.kind === "entry").length, 0, "no entry alert");
    assert.equal(ctx.store.listAlerts().filter((a) => a.kind === "setup").length, 1, "setup alert still fired once");
    assert.equal(ctx.store.getContract(rec.contractId!)?.state, "void_first_print_missed");
    // The voided contract names the evidence gap: first print ts, receipt ts, age bound.
    const voidReason = ctx.store.getContract(rec.contractId!)!;
    const cj = JSON.parse(voidReason.contractJson) as { voidReason: string };
    assert.match(cj.voidReason, /2026-10-14T04:00:10\.000Z/); // first print ts
    assert.match(cj.voidReason, /2026-10-14T04:08:00\.000Z/); // receipt ts
    assert.match(cj.voidReason, /300000/); // max observation age bound
    ctx.store.close();
  });

  it("regression 2: missed first + later INVALID (drift) print -> exact reason code first-print-missed, not a veto/drift pass-through", async () => {
    const ctx = makeCtx(T0);
    const input = integratedCryptoCandidate({ symbol: "FPF2", vetoBars: [cleanVetoBar()] });
    wireMissedFirst(ctx, 105.0); // print2 fresh but 5% drift -> would be void_drift IF entered
    const rec = await integratedManualIssue(ctx.deps, input, "fpf-reg2");
    // The missed-first void wins over the drift outcome: exact reason code.
    assert.equal(rec.status, "invalidated");
    assert.equal(rec.outcome?.gate, "first-print-missed", "must be the named non-entry, not entry-drift");
    assert.match(rec.outcome!.reason, /non-entry:first-print-missed/);
    assert.doesNotMatch(rec.outcome!.reason, /drift/i);
    assert.equal(ctx.store.listSignals().length, 0);
    assert.equal(ctx.store.listAlerts().filter((a) => a.kind === "entry").length, 0);
    assert.equal(ctx.store.getContract(rec.contractId!)?.state, "void_first_print_missed");
    ctx.store.close();
  });

  it("regression 3: restart resumes FROM the persisted checkpoint — no blind sinceTs reset, no re-entry, exactly-once", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "fpf-reg3-")), "store.db");
    const input = integratedCryptoCandidate({ symbol: "FPF3", vetoBars: [cleanVetoBar()] });
    const PRINT_TS = T0 + 90_000;

    // Phase 1: one bounded run observes a wrong-venue print, then the poll
    // budget is exhausted with the window still open -> checkpoint persisted.
    const store1 = new DbStore(path);
    const clock1 = manualClock(T0);
    const deps1: IntegratedDeps = {
      store: store1, clock: clock1,
      config: { freshnessMs: 24 * 3_600_000, retryBackoffMs: 60_000 },
    };
    // Feed clock starts AT the print ts so the skew guard (no future prints)
    // does not fire; the print is wrong-venue (ineligible) but served.
    const feedClock1 = new MutableClock(T0 + 30_000);
    const feed1 = new ScriptedFeed(
      [{ ts: T0 + 30_000, price: 100.2, venue: "coinbase-spot", availableAt: T0 + 30_000, venueTradeId: "agg-8003", venueSeq: 8003 }],
      feedClock1,
    );
    deps1.entryFeedFor = (): EntryObservationFeed => ({
      feed: feed1, clock: feedClock1, pollIntervalMs: 60_000, maxPolls: 1,
      advance: (ms: number) => { feedClock1.advance(ms); clock1.advance(ms); },
    });
    const rec1 = await integratedManualIssue(deps1, input, "fpf-reg3-phase1");
    assert.equal(rec1.status, "awaiting-entry");
    assert.equal(rec1.outcome?.gate, "poll-budget");
    const contractId = rec1.contractId!;
    const row1 = store1.getContract(contractId)!;
    assert.equal(row1.state, "pending");
    const cp1 = (JSON.parse(row1.contractJson) as CheckpointedContract).observationCheckpoint!;
    assert.equal(cp1.highWaterTs, T0 + 30_000, "checkpoint records the highest durably-observed print ts");
    assert.equal(cp1.firstPrint, null, "no eligible print seen yet");
    store1.close(); // process termination: all in-memory state dropped

    // Phase 2: a fresh process on the same DB file, resumed while the window
    // is still open (reassessment was scheduled 60s after phase 1's run).
    // The feed records every sinceTs it is asked for: the resumed run must
    // continue FROM the checkpoint (T0+30s), never reset to decisionMs - 1.
    const store2 = new DbStore(path);
    const clock2 = manualClock(T0 + 120_000);
    const deps2: IntegratedDeps = { store: store2, clock: clock2, config: { freshnessMs: 24 * 3_600_000 } };
    const feedClock2 = new MutableClock(T0 + 120_000);
    const seenSinceTs: number[] = [];
    const feed2: VenueFeed = {
      latestPrints: async (sinceTs: number) => {
        seenSinceTs.push(sinceTs);
        if (feedClock2.nowMs() < PRINT_TS) return [];
        return sinceTs < PRINT_TS ? [{ ts: PRINT_TS, price: 100.2, venue: "binance-spot", venueTradeId: "agg-8004", venueSeq: 8004 }] : [];
      },
      // Complete history by construction (scripted venue): the resumed run
      // must be able to establish the first print's identity.
      historyCoverage: async (_sinceTs: number) => ({ historyStartMs: Number.NEGATIVE_INFINITY }),
    };
    deps2.entryFeedFor = (): EntryObservationFeed => ({
      feed: feed2, clock: feedClock2, pollIntervalMs: 60_000, maxPolls: 5000,
      advance: (ms: number) => { feedClock2.advance(ms); clock2.advance(ms); },
    });
    deps2.waitingIntervalEvidenceFor = () =>
      [pointPrint(T0 + 10_000, 100.1, "waiting-interval point (clean)")];
    deps2.postEntryEvidenceFor = (): PostEntryEvidence => ({
      bars: [h1Bar(new Date(PRINT_TS).toISOString(),
        { open: 100, high: 101, low: 97, close: 100.5 }, "post-entry 1h (clean)")],
      nowAt: PRINT_TS + 3_600_000,
    });

    const report = await integratedTick(deps2);
    assert.deepEqual(report.issued, [rec1.candidateId], "resumed run issued");
    assert.ok(seenSinceTs.length > 0, "the venue feed was polled on resume");
    assert.equal(seenSinceTs[0], T0 + 30_000,
      `resumed run continued FROM the checkpoint (T0+30s), not decisionMs - 1 (saw ${seenSinceTs[0]})`);
    const rec2 = store2.getCandidate(rec1.candidateId)!;
    assert.equal(rec2.status, "issued");
    // Exactly-once: one signal, one entry alert, entry on the correct print.
    assert.equal(store2.listSignals().length, 1);
    assert.equal(store2.listAlerts().filter((a) => a.kind === "entry").length, 1);
    assert.equal(rec2.entryObservedAt, new Date(PRINT_TS).toISOString());
    // The entered contract persists the venue trade id + checkpoint.
    const row2 = store2.getContract(contractId)!;
    assert.equal(row2.state, "entered");
    const enteredJson = JSON.parse(row2.contractJson) as CheckpointedContract;
    assert.equal(
      enteredJson.observationCheckpoint?.firstPrint?.venueTradeId,
      "agg-8004",
      "entered contract carries the REAL venue trade id of the established first print (verbatim from the feed)",
    );
    assert.equal(enteredJson.observationCheckpoint?.firstPrint?.venueSeq, 8004);
    assert.equal(enteredJson.observationCheckpoint?.firstPrint?.ts, PRINT_TS);
    // A further tick issues nothing (exactly-once preserved across restarts).
    const report2 = await integratedTick(deps2);
    assert.deepEqual(report2.issued, [], "second tick must not re-issue");
    assert.equal(store2.listSignals().length, 1);
    store2.close();
  });

  it("regression 4: venue serves nothing for the window -> explicit uncertainty non-entry:first-print-unverifiable, fail closed", async () => {
    const ctx = makeCtx(T0);
    const input = integratedCryptoCandidate({ symbol: "FPF4", vetoBars: [cleanVetoBar()] });
    const emptyClock = new MutableClock(T0);
    const emptyFeed = new ScriptedFeed([], emptyClock);
    ctx.deps.entryFeedFor = (): EntryObservationFeed => ({
      feed: emptyFeed, clock: emptyClock, pollIntervalMs: 60_000, maxPolls: 30,
      advance: (ms: number) => { emptyClock.advance(ms); ctx.clock.advance(ms); },
    });
    wireCleanEvidence(ctx, T0);
    const rec = await integratedManualIssue(ctx.deps, input, "fpf-reg4");
    assert.equal(rec.status, "invalidated");
    assert.equal(rec.outcome?.gate, "first-print-unverifiable");
    assert.match(rec.outcome!.reason, /non-entry:first-print-unverifiable/);
    assert.match(rec.outcome!.reason, /fail closed/);
    assert.equal(ctx.store.listSignals().length, 0, "unverifiable first print is a non-entry: never scored");
    assert.equal(ctx.store.listAlerts().filter((a) => a.kind === "entry").length, 0, "no entry alert");
    assert.equal(ctx.store.getContract(rec.contractId!)?.state, "void_first_print_unverifiable");
    ctx.store.close();
  });

  it("regression 5: uninterrupted valid entry works exactly as before (happy path)", async () => {
    const ctx = makeCtx(T0);
    const input = integratedCryptoCandidate({ symbol: "FPF5", vetoBars: [cleanVetoBar()] });
    const setup = cryptoPrintFeed(T0, 30_000, 100.2); // +0.2%: timely first print, within the drift cap
    ctx.deps.entryFeedFor = (): EntryObservationFeed => ({
      feed: setup.feed, clock: setup.clock, pollIntervalMs: 60_000, maxPolls: 5000,
      advance: (ms: number) => { setup.clock.advance(ms); ctx.clock.advance(ms); },
    });
    wireCleanEvidence(ctx, setup.printTs);
    const rec = await integratedManualIssue(ctx.deps, input, "fpf-reg5");
    assert.equal(rec.status, "issued");
    assert.equal(rec.entryObservedAt, new Date(setup.printTs).toISOString(), "entered on the first print");
    assert.equal(ctx.store.listSignals().length, 1);
    assert.equal(ctx.store.listAlerts().filter((a) => a.kind === "entry").length, 1, "entry alert released");
    assert.equal(ctx.store.listAlerts().filter((a) => a.kind === "setup").length, 1);
    // The entered contract carries complete entry evidence: venue trade id +
    // observation time + receipt time, first-print identity matching the entry.
    const row = ctx.store.getContract(rec.contractId!)!;
    assert.equal(row.state, "entered");
    const enteredJson = JSON.parse(row.contractJson) as CheckpointedContract;
    assert.deepEqual(enteredJson.observationCheckpoint?.firstPrint, firstPrintIdentity({
      ts: setup.printTs, price: 100.2, venue: "binance-spot", venueTradeId: "agg-7001", venueSeq: 7001,
    }));
    assert.equal(checkEntryEvidenceComplete(enteredJson).ok, true, "entry evidence complete -> alert gate passes");
    ctx.store.close();
  });
});

describe("history-coverage proof (v2.1.8)", () => {
  /**
   * Feed serving a TIMELY eligible print but attesting INCOMPLETE history
   * coverage: the venue's served history starts at T0+5s, AFTER the
   * decision instant T0. The interval (T0-1, T0+5s) is uncovered — a print
   * in it would be the true first print and the venue cannot rule that out.
   */
  function incompleteCoverageFeed(): { feed: VenueFeed; clock: MutableClock } {
    const feedClock = new MutableClock(T0);
    const feed: VenueFeed = {
      latestPrints: async (_sinceTs: number) => {
        feedClock.advance(30_000 - (feedClock.nowMs() - T0)); // receipt at T0+30s
        return [{ ts: T0 + 10_000, price: 100.05, venue: "binance-spot", venueTradeId: "agg-8005", venueSeq: 8005 }];
      },
      historyCoverage: async (_sinceTs: number) => ({ historyStartMs: T0 + 5_000 }),
    };
    return { feed, clock: feedClock };
  }

  function wireFeed(ctx: Ctx, feed: VenueFeed, clock: MutableClock): void {
    ctx.deps.entryFeedFor = (): EntryObservationFeed => ({
      feed, clock, pollIntervalMs: 60_000, maxPolls: 5000,
      advance: (ms: number) => { clock.advance(ms); ctx.clock.advance(ms); },
    });
  }

  it("regression 6: prints served but venue history starts AFTER the decision instant -> explicit uncertainty non-entry:first-print-unverifiable, NOT an entry", async () => {
    const ctx = makeCtx(T0);
    const input = integratedCryptoCandidate({ symbol: "FPF6", vetoBars: [cleanVetoBar()] });
    const { feed, clock: feedClock } = incompleteCoverageFeed();
    wireFeed(ctx, feed, feedClock);
    wireCleanEvidence(ctx, T0 + 10_000);
    const rec = await integratedManualIssue(ctx.deps, input, "fpf-reg6");
    // The served print is timely and eligible — the happy path would enter
    // on it. But its identity as the TRUE first print is unproven: the
    // venue's history starts after the decision instant. Fail closed.
    assert.equal(rec.status, "invalidated");
    assert.equal(rec.outcome?.gate, "first-print-unverifiable");
    assert.match(rec.outcome!.reason, /non-entry:first-print-unverifiable/);
    assert.match(rec.outcome!.reason, /cannot prove complete history coverage/);
    assert.equal(ctx.store.listSignals().length, 0, "unproven first print is a non-entry: never scored");
    assert.equal(ctx.store.listAlerts().filter((a) => a.kind === "entry").length, 0, "no entry alert");
    const row = ctx.store.getContract(rec.contractId!)!;
    assert.equal(row.state, "void_first_print_unverifiable");
    // The unproven batch must not advance the durable checkpoint: a resumed
    // run inherits only coverage its predecessors proved.
    const cp = (JSON.parse(row.contractJson) as CheckpointedContract).observationCheckpoint!;
    assert.equal(cp.highWaterTs, T0 - 1, "unproven batch never advances the checkpoint");
    assert.equal(cp.firstPrint, null, "no first print established");
    ctx.store.close();
  });

  it("regression 7: feed serves prints with NO coverage attestation at all -> fail closed as non-entry:first-print-unverifiable", async () => {
    const ctx = makeCtx(T0);
    const input = integratedCryptoCandidate({ symbol: "FPF7", vetoBars: [cleanVetoBar()] });
    const feedClock = new MutableClock(T0);
    const feed: VenueFeed = {
      latestPrints: async (_sinceTs: number) => {
        feedClock.advance(30_000 - (feedClock.nowMs() - T0)); // receipt at T0+30s
        return [{ ts: T0 + 10_000, price: 100.05, venue: "binance-spot", venueTradeId: "agg-8006", venueSeq: 8006 }];
      },
      // Deliberately no historyCoverage: the handler cannot distinguish
      // "complete history" from "truncated history" and must fail closed.
    };
    wireFeed(ctx, feed, feedClock);
    wireCleanEvidence(ctx, T0 + 10_000);
    const rec = await integratedManualIssue(ctx.deps, input, "fpf-reg7");
    assert.equal(rec.status, "invalidated");
    assert.equal(rec.outcome?.gate, "first-print-unverifiable");
    assert.match(rec.outcome!.reason, /non-entry:first-print-unverifiable/);
    assert.match(rec.outcome!.reason, /no history-coverage attestation/);
    assert.equal(ctx.store.listSignals().length, 0);
    assert.equal(ctx.store.listAlerts().filter((a) => a.kind === "entry").length, 0);
    assert.equal(ctx.store.getContract(rec.contractId!)?.state, "void_first_print_unverifiable");
    ctx.store.close();
  });

  it("regression 7b: feed whose coverage attestation THROWS -> fail closed as non-entry:first-print-unverifiable (named non-entry, not a tick crash)", async () => {
    const ctx = makeCtx(T0);
    const input = integratedCryptoCandidate({ symbol: "FPF7B", vetoBars: [cleanVetoBar()] });
    const feedClock = new MutableClock(T0);
    const feed: VenueFeed = {
      latestPrints: async (_sinceTs: number) => {
        feedClock.advance(30_000 - (feedClock.nowMs() - T0)); // receipt at T0+30s
        return [{ ts: T0 + 10_000, price: 100.05, venue: "binance-spot", venueTradeId: "agg-8007", venueSeq: 8007 }];
      },
      historyCoverage: async (_sinceTs: number): Promise<{ historyStartMs: number }> => {
        throw new Error("venue history endpoint down");
      },
    };
    wireFeed(ctx, feed, feedClock);
    wireCleanEvidence(ctx, T0 + 10_000);
    const rec = await integratedManualIssue(ctx.deps, input, "fpf-reg7b");
    assert.equal(rec.status, "invalidated");
    assert.equal(rec.outcome?.gate, "first-print-unverifiable");
    assert.match(rec.outcome!.reason, /non-entry:first-print-unverifiable/);
    assert.match(rec.outcome!.reason, /attestation threw/);
    assert.equal(ctx.store.listSignals().length, 0);
    assert.equal(ctx.store.listAlerts().filter((a) => a.kind === "entry").length, 0);
    assert.equal(ctx.store.getContract(rec.contractId!)?.state, "void_first_print_unverifiable");
    ctx.store.close();
  });

  it("checkpoint schema: the persisted checkpoint records WHICH print was established as first-eligible (venue trade id)", async () => {
    const ctx = makeCtx(T0);
    const input = integratedCryptoCandidate({ symbol: "FPF8", vetoBars: [cleanVetoBar()] });
    const setup = cryptoPrintFeed(T0, 30_000, 100.2);
    ctx.deps.entryFeedFor = (): EntryObservationFeed => ({
      feed: setup.feed, clock: setup.clock, pollIntervalMs: 60_000, maxPolls: 5000,
      advance: (ms: number) => { setup.clock.advance(ms); ctx.clock.advance(ms); },
    });
    wireCleanEvidence(ctx, setup.printTs);
    const rec = await integratedManualIssue(ctx.deps, input, "fpf-reg8");
    assert.equal(rec.status, "issued");
    const row = ctx.store.getContract(rec.contractId!)!;
    const cp = (JSON.parse(row.contractJson) as CheckpointedContract).observationCheckpoint!;
    // Schema shape: version, high-water, first-print identity, receipt, polls.
    assert.equal(cp.v, 1);
    assert.equal(cp.highWaterTs, setup.printTs);
    assert.ok(cp.firstPrint !== null, "firstPrint identity established");
    assert.deepEqual(Object.keys(cp.firstPrint!).sort(), ["price", "ts", "venue", "venueSeq", "venueTradeId"]);
    assert.equal(cp.firstPrint!.venueTradeId, "agg-7001", "checkpoint carries the real venue-assigned trade id");
    assert.equal(cp.firstPrint!.venueSeq, 7001);
    assert.equal(cp.firstPrint!.ts, setup.printTs);
    assert.equal(cp.firstPrint!.price, 100.2);
    assert.equal(cp.firstPrint!.venue, "binance-spot");
    assert.ok(typeof cp.lastReceiptAt === "string" && Number.isFinite(Date.parse(cp.lastReceiptAt)));
    assert.ok(typeof cp.polls === "number");
    // The established identity matches the entered print exactly.
    assert.equal(cp.firstPrint!.ts, Date.parse(rec.entryObservedAt!));
    ctx.store.close();
  });

  it("coverage evidence binding: the persisted checkpoint carries the six evidence fields bound to the actual served batch", async () => {
    const ctx = makeCtx(T0);
    const input = integratedCryptoCandidate({ symbol: "FPF9", vetoBars: [cleanVetoBar()] });
    const feedClock = new MutableClock(T0);
    const printTs = T0 + 30_000;
    const seenLatestSinceTs: number[] = [];
    const seenCoverageSinceTs: number[] = [];
    // The "raw response" this adapter's batch is served from; the evidence
    // hash must bind to THESE bytes.
    const rawText = JSON.stringify([{ a: 4242, p: "100.20", q: "0.5", T: printTs }]);
    const expectedHash = createHash("sha256").update(rawText, "utf8").digest("hex");
    let boundEvidence: HistoryCoverage | null = null;
    const feed: VenueFeed = {
      latestPrints: async (sinceTs: number) => {
        seenLatestSinceTs.push(sinceTs);
        feedClock.advance(35_000 - (feedClock.nowMs() - T0)); // receipt at T0+35s
        // The adapter binds its evidence to THIS batch's actual fields.
        boundEvidence = {
          historyStartMs: sinceTs,
          venue: "binance-spot",
          symbol: "FPF9",
          requestedRange: { sinceTs, toTs: printTs },
          receiptMs: feedClock.nowMs(),
          rawResponseHash: expectedHash,
          pagination: { maxResultsPerRequest: 1000, paginationExhausted: true },
        };
        return [{ ts: printTs, price: 100.2, venue: "binance-spot", venueTradeId: "4242", venueSeq: 4242 }];
      },
      historyCoverage: async (sinceTs: number) => {
        seenCoverageSinceTs.push(sinceTs);
        assert.equal(
          sinceTs, seenLatestSinceTs[seenLatestSinceTs.length - 1],
          "coverage evidence is requested for the batch just served",
        );
        return { ...boundEvidence! };
      },
    };
    wireFeed(ctx, feed, feedClock);
    wireCleanEvidence(ctx, printTs);
    const rec = await integratedManualIssue(ctx.deps, input, "fpf-reg9");
    assert.equal(rec.status, "issued");
    assert.ok(seenCoverageSinceTs.length > 0, "the coverage check ran on the served batch");
    const row = ctx.store.getContract(rec.contractId!)!;
    assert.equal(row.state, "entered");
    const cp = (JSON.parse(row.contractJson) as CheckpointedContract).observationCheckpoint!;
    const ev = cp.coverageEvidence!;
    assert.ok(ev, "coverage evidence persisted on the durable checkpoint");
    // Structural binding: all six fields present, bound to the actual batch.
    assert.equal(ev.historyStartMs, seenLatestSinceTs[0]);
    assert.equal(ev.venue, "binance-spot");
    assert.equal(ev.symbol, "FPF9");
    assert.deepEqual(ev.requestedRange, { sinceTs: seenLatestSinceTs[0], toTs: printTs });
    assert.equal(ev.receiptMs, T0 + 35_000);
    assert.equal(ev.rawResponseHash, expectedHash,
      "the hash binds the evidence to the actual raw response bytes");
    assert.deepEqual(ev.pagination, { maxResultsPerRequest: 1000, paginationExhausted: true });
    // The persisted evidence is the evidence of the batch that established
    // the first print — and it is sufficient, not assumed.
    assert.equal(cp.firstPrint!.ts, printTs);
    assert.ok(ev.historyStartMs <= seenLatestSinceTs[0],
      "coverage starts at or before the requested sinceTs");
    ctx.store.close();
  });
});

describe("entry-alert evidence gate (v2.1.7)", () => {
  it("checkEntryEvidenceComplete: missing venue trade id / times / price, or ts mismatch -> not ok", async () => {
    const base = {
      entryState: "entered",
      entryObservedAt: new Date(T0 + 30_000).toISOString(),
      entryReceivedAt: new Date(T0 + 60_000).toISOString(),
      entryPrice: 100.2,
      observationCheckpoint: {
        v: 1 as const,
        highWaterTs: T0 + 30_000,
        firstPrint: firstPrintIdentity({ ts: T0 + 30_000, price: 100.2, venue: "binance-spot", venueTradeId: "agg-8008", venueSeq: 8008 }),
        lastReceiptAt: new Date(T0 + 60_000).toISOString(),
        polls: 2,
      },
    } as CheckpointedContract;
    assert.equal(checkEntryEvidenceComplete(base).ok, true);

    const noCheckpoint = { ...base, observationCheckpoint: undefined };
    assert.equal(checkEntryEvidenceComplete(noCheckpoint).ok, false, "venue trade id missing");

    const noObservedAt = { ...base, entryObservedAt: null };
    assert.equal(checkEntryEvidenceComplete(noObservedAt).ok, false, "observation time missing");

    const noReceivedAt = { ...base, entryReceivedAt: null };
    assert.equal(checkEntryEvidenceComplete(noReceivedAt).ok, false, "receipt time missing");

    const badPrice = { ...base, entryPrice: 0 };
    assert.equal(checkEntryEvidenceComplete(badPrice).ok, false, "entry price invalid");

    const tsMismatch = {
      ...base,
      observationCheckpoint: {
        ...base.observationCheckpoint!,
        firstPrint: firstPrintIdentity({ ts: T0 + 31_000, price: 100.2, venue: "binance-spot", venueTradeId: "agg-8009", venueSeq: 8009 }),
      },
    };
    const mismatchResult = checkEntryEvidenceComplete(tsMismatch);
    assert.equal(mismatchResult.ok, false, "first-print identity must match the entered print");
    if (!mismatchResult.ok) assert.match(mismatchResult.reason, /does not match entryObservedAt/);
  });

  it("commitEnteredOutcome refuses to enqueue an entry alert without complete entry evidence", async () => {
    const ctx = makeCtx(T0);
    const enteredNoEvidence = {
      entryState: "entered",
      entryObservedAt: new Date(T0 + 30_000).toISOString(),
      entryReceivedAt: new Date(T0 + 60_000).toISOString(),
      entryPrice: 100.2,
      // no observationCheckpoint: the venue trade id is missing
    } as unknown as CheckpointedContract;
    const awaiting = { candidateId: "fpf-gate-dummy" } as never;
    const postAssessment = {
      invalidated: false, gate: "", reason: "stub",
      result: {
        check: "post_entry_invalidation", entryValid: "pass", entryReason: "stub",
        interveningInvalidation: "no_invalidation_observed", invalidationReason: "stub",
        verdict: "pass", reason: "stub",
      },
    } as unknown as Parameters<typeof commitEnteredOutcome>[9];
    await assert.rejects(
      () => commitEnteredOutcome(ctx.deps, awaiting, enteredNoEvidence, null,
        "sig_fpf_gate", "ct_fpf_gate", "identity_fpf_gate", "inv-fpf-gate",
        "stub summary", postAssessment, "manual"),
      (error: unknown) =>
        error instanceof ContractError && /entry alert gated/.test(error.message),
      "entry alert must not be enqueued without complete entry evidence",
    );
    assert.equal(ctx.store.listAlerts().filter((a) => a.kind === "entry").length, 0);
    ctx.store.close();
  });
});
