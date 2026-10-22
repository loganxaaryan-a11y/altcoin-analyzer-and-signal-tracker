/**
 * Integrated issuance handler — behavioral tests (task workstream A).
 *
 * Every test runs the COMPLETE handler sequence end-to-end:
 *   processIntegratedCandidate -> buildIssuanceVetoInput -> runIssuanceChecks
 *   (corrected decision→entry veto) -> buildPendingContract -> setup alert ->
 *   entry observation (observeEntry) -> checkPostEntryInvalidation
 *   (post-entry point) -> entered | expired | invalidated -> DB persistence
 *   (atomic transactions) -> tracker + alert event.
 *
 * Through the REAL DB path (DbStore over node:sqlite) in every test.
 * Includes the behavioral old-veto guard: a fixture the legacy born-dead
 * veto would have killed passes through when the corrected veto passes.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { manualClock } from "../src/clock.js";
import type { Clock } from "../src/clock.js";
import { DbStore } from "../src/persistence/db-store.js";
import {
  ingestIntegratedCandidate,
  integratedManualIssue,
  integratedTick,
  issuanceIdentityFor,
  commitNonEntryOutcome,
  commitEnteredOutcome,
  contractIdFor,
  type EntryObservationFeed,
  type IntegratedDeps,
  type PostEntryEvidence,
} from "../src/issuance/handler.js";
import { trackerView, alertFeed } from "../src/readpath.js";
import { evaluateBornDead } from "../src/gates/crypto-gates.js";
import { MutableClock, ScriptedFeed } from "../../entry-v1/src/feed.js";
import type { VenueFeed } from "../../entry-v1/src/feed.js";
import type { ActionableEntryContract } from "../../entry-v1/src/contract.js";
import {
  cryptoPrintFeed,
  equityOpenPrintFeed,
  formingBar,
  h1Bar,
  integratedCryptoCandidate,
  integratedEquityCandidate,
  sessionBar,
  type ScriptedEntrySetup,
} from "./fixtures.js";
import type { EvidenceBar } from "../../veto/src/veto.js";

type MutableTestClock = Clock & { advance(ms: number): void; set(ms: number): void };

interface Ctx {
  deps: IntegratedDeps;
  clock: MutableTestClock;
  store: DbStore;
}

const T_CRYPTO = Date.parse("2026-10-14T04:00:00.000Z"); // handler run (crypto demos)
const T_EQUITY = Date.parse("2026-10-13T22:30:00.000Z"); // handler run (equity demos)

function makeCtx(startMs: number, config: Record<string, number> = {}): Ctx {
  const store = new DbStore(":memory:");
  const clock = manualClock(startMs);
  const deps: IntegratedDeps = {
    store,
    clock,
    config: { freshnessMs: 24 * 3_600_000, ...config },
  };
  return { deps, clock, store };
}

/** Wire an entry-observation feed + post-entry evidence onto the deps. */
function wireEntry(
  ctx: Ctx,
  setup: ScriptedEntrySetup,
  postEntry: PostEntryEvidence | null,
  pollIntervalMs = 60_000,
  maxPolls = 5000,
): void {
  const { clock } = ctx;
  ctx.deps.entryFeedFor = (): EntryObservationFeed => ({
    feed: setup.feed,
    clock: setup.clock,
    pollIntervalMs,
    maxPolls,
    advance: (ms: number) => {
      setup.clock.advance(ms);
      clock.advance(ms); // feed clock and handler clock advance together (both wall-clock in production)
    },
  });
  ctx.deps.postEntryEvidenceFor = () => postEntry;
}

/** Wire waiting-interval evidence (step 9b) onto the deps. */
function wireWaiting(ctx: Ctx, bars: EvidenceBar[] | null): void {
  ctx.deps.waitingIntervalEvidenceFor = () => bars;
}

/** Point print evidence (trade_print granularity) at a ms timestamp. */
function pointPrint(ts: number, price: number, label: string): EvidenceBar {
  return {
    startAt: ts, endAt: ts,
    open: price, high: price, low: price, close: price,
    isClosed: true, granularity: "trade_print", source: "itg-fixture", label,
  };
}

function wireEquityEntry(ctx: Ctx, price: number, postLow: number): void {
  const setup = equityOpenPrintFeed(ctx.clock.now(), "2026-10-13", price);
  const openTs = setup.printTs;
  const sessionEnd = openTs + 6.5 * 3_600_000; // 09:30 -> 16:00 ET
  wireEntry(ctx, setup, {
    bars: [
      sessionBar("2026-10-14",
        { open: price, high: price + 2, low: postLow, close: price + 1 },
        "2026-10-14 session (post-entry, clean)"),
    ],
    nowAt: sessionEnd,
  });
}

function wireCryptoEntry(ctx: Ctx, price: number, postBars: PostEntryEvidence["bars"], nowAt: number): void {
  const setup = cryptoPrintFeed(ctx.clock.now(), 30_000, price);
  wireEntry(ctx, setup, { bars: postBars, nowAt });
}

describe("integrated handler: qualifying issuance exactly once (equity)", () => {
  it("full path: veto pass -> pending contract -> setup alert -> entered -> atomic persist", async () => {
    const ctx = makeCtx(T_EQUITY);
    const input = integratedEquityCandidate();
    wireEquityEntry(ctx, 250.25, 249.5); // open print +0.1% (within 0.5% cap); post-entry clean

    const rec = await integratedManualIssue(ctx.deps, input, "invocation-eq-1");
    assert.equal(rec.status, "issued", `expected issued, got ${rec.status}: ${rec.outcome?.reason}`);
    assert.equal(rec.outcome?.kind, "issued");

    // Exactly one signal, one contract, two alerts (setup + entry).
    assert.equal(ctx.store.listSignals().length, 1);
    assert.equal(ctx.store.tableCount("contracts"), 1);
    const alerts = ctx.store.listAlerts();
    assert.equal(alerts.filter((a) => a.kind === "setup").length, 1);
    assert.equal(alerts.filter((a) => a.kind === "entry").length, 1);

    // Contract id persisted alongside the signal id (spec §1.2 step 5).
    const signal = ctx.store.listSignals()[0]!;
    assert.equal(signal.contractId, rec.contractId);
    assert.ok(rec.contractId?.startsWith("ct_"));
    const contractRow = ctx.store.getContract(rec.contractId!)!;
    assert.equal(contractRow.state, "entered");
    const contractJson = JSON.parse(contractRow.contractJson) as { entryState: string; entryPrice: number };
    assert.equal(contractJson.entryState, "entered");
    assert.equal(contractJson.entryPrice, 250.25);

    // Three persisted timestamps, strictly ordered (spec §2.2).
    assert.ok(rec.setupAlertAt! < rec.entryObservedAt!,
      `setupAlertAt (${rec.setupAlertAt}) must precede entryObservedAt (${rec.entryObservedAt})`);
    const entryAlert = alerts.find((a) => a.kind === "entry")!;
    assert.ok(rec.entryObservedAt! <= entryAlert.alertedAt,
      `entryObservedAt (${rec.entryObservedAt}) must not postdate alert delivery (${entryAlert.alertedAt})`);

    // Tracker + alert event read off the store.
    assert.equal(trackerView(ctx.store).length, 1);
    assert.equal(alertFeed(ctx.store).length, 2);

    // Second tick issues nothing (exactly-once).
    const r2 = await integratedTick(ctx.deps);
    assert.deepEqual(r2.issued.length, 0);
    assert.equal(ctx.store.listSignals().length, 1, "second tick must not re-issue");
    ctx.store.close();
  });
});

describe("integrated handler: corrected veto on the decision→entry window (crypto)", () => {
  const clean1h = (startIso: string, label: string) =>
    h1Bar(startIso, { open: 99.5, high: 100.5, low: 96, close: 100 }, label);

  it("genuine waiting-interval breach -> fail_closed, invalidated with gate waiting-interval-invalidation", async () => {
    // The decision→entry invalidation moved from step 5 (speculative) to the
    // waiting-interval veto at step 9b (real [decisionAt, entryAt] window).
    // The breach evidence now lives in the waiting interval.
    const ctx = makeCtx(T_CRYPTO);
    const breachInWindow: EvidenceBar = {
      startAt: T_CRYPTO, endAt: T_CRYPTO + 30_000, // fully inside [decisionAt, entryAt]
      open: 99, high: 99.5, low: 93.5, close: 98,
      isClosed: true, granularity: "intraday", source: "itg-fixture",
      label: "waiting-interval 30s bar (breach)",
    };
    const input = integratedCryptoCandidate({
      vetoBars: [clean1h("2026-10-14T01:00:00.000Z", "post-decision 1h (clean)")],
    });
    const setup = cryptoPrintFeed(T_CRYPTO, 30_000, 100.2); // +0.2%: enters (within the 1.5% cap)
    wireEntry(ctx, setup, null);
    wireWaiting(ctx, [breachInWindow]);
    const rec = await integratedManualIssue(ctx.deps, input, "invocation-veto-1");
    assert.equal(rec.status, "invalidated");
    assert.equal(rec.outcome?.gate, "waiting-interval-invalidation");
    assert.match(rec.outcome!.reason, /waiting-interval 30s bar \(breach\)/);
    assert.match(rec.outcome!.reason, /final published stop 94/);
    assert.equal(ctx.store.listSignals().length, 0, "no signal on waiting-interval fail");
    assert.equal(ctx.store.listAlerts().filter((a) => a.kind === "entry").length, 0, "no entry alert");
    // Qualification happened: the setup alert fired exactly once.
    assert.equal(ctx.store.listAlerts().filter((a) => a.kind === "setup").length, 1);
    ctx.store.close();
  });

  it("pre-decision crossing passes: the OLD veto would have killed this fixture", async () => {
    // The legacy born-dead veto tests the signal-day candle: low 93 <= stop 94 -> blocked.
    const oldVeto = evaluateBornDead("long", 94,
      { day: "2026-10-13", open: 99, high: 101, low: 93, close: 100, source: "t" });
    assert.equal(oldVeto.publish, false, "old veto must block this fixture (test premise)");
    assert.match(oldVeto.reason ?? "", /born-dead LONG/);

    const ctx = makeCtx(T_CRYPTO);
    const input = integratedCryptoCandidate({
      signalDayLow: 93, // pre-decision crossing: recorded as a setup feature, never a stop-out
      vetoBars: [
        clean1h("2026-10-14T01:00:00.000Z", "post-decision 1h (clean)"),
        clean1h("2026-10-14T02:00:00.000Z", "post-decision 1h (clean)"),
      ],
    });
    wireCryptoEntry(ctx, 100.2, [
      h1Bar(new Date(T_CRYPTO).toISOString(), { open: 100, high: 101, low: 97, close: 100.5 }, "post-entry 1h (clean)"),
      h1Bar(new Date(T_CRYPTO + 3_600_000).toISOString(), { open: 100.5, high: 102, low: 98, close: 101 }, "post-entry 1h (clean)"),
    ], T_CRYPTO + 2 * 3_600_000);
    // The waiting interval [decisionAt, entryAt] needs its own evidence: a
    // clean point print inside the window.
    wireWaiting(ctx, [pointPrint(T_CRYPTO + 10_000, 100.1, "waiting-interval point (clean)")]);

    const rec = await integratedManualIssue(ctx.deps, input, "invocation-veto-2");
    assert.equal(rec.status, "issued",
      `pre-decision crossing must NOT veto under corrected semantics: ${rec.outcome?.reason}`);
    assert.equal(ctx.store.listSignals().length, 1);
    ctx.store.close();
  });

  it("straddling uncertainty in the waiting interval -> uncertain/fail-closed with the straddle rule cited", async () => {
    const ctx = makeCtx(T_CRYPTO);
    // The straddler must straddle the REAL decision instant (the handler's
    // run time, T_CRYPTO) — not the old detectedAt-based window.
    const straddler = formingBar(
      "2026-10-14T03:30:00.000Z", "2026-10-14T04:30:00.000Z",
      { open: 99, high: 100, low: 93, close: 98.5 },
      "forming 1h (straddles decisionAt)",
    );
    const input = integratedCryptoCandidate({
      vetoBars: [clean1h("2026-10-14T01:00:00.000Z", "post-decision 1h (clean)")],
    });
    const setup = cryptoPrintFeed(T_CRYPTO, 30_000, 100.2);
    wireEntry(ctx, setup, null);
    wireWaiting(ctx, [straddler]);
    const rec = await integratedManualIssue(ctx.deps, input, "invocation-veto-3");
    assert.equal(rec.status, "invalidated");
    assert.equal(rec.outcome?.gate, "waiting-interval-invalidation");
    assert.match(rec.outcome!.reason, /uncertain/);
    assert.match(rec.outcome!.reason, /straddles/);
    assert.equal(ctx.store.listSignals().length, 0);
    ctx.store.close();
  });

  it("no waiting-interval evidence at all (crypto) -> uncertain/fail-closed (never silent)", async () => {
    const ctx = makeCtx(T_CRYPTO);
    const input = integratedCryptoCandidate({ vetoBars: [] }); // nothing post-decision
    const setup = cryptoPrintFeed(T_CRYPTO, 30_000, 100.2);
    wireEntry(ctx, setup, null);
    // No waiting-interval evidence wired: for crypto the empty interval is
    // NOT allowed by construction -> uncertain, fail-closed.
    const rec = await integratedManualIssue(ctx.deps, input, "invocation-veto-4");
    assert.equal(rec.status, "invalidated");
    assert.equal(rec.outcome?.gate, "waiting-interval-invalidation");
    assert.match(rec.outcome!.reason, /no waiting-interval evidence/);
    ctx.store.close();
  });
});

describe("integrated handler: pipeline guards", () => {
  it("stale quote -> deferred (never issued on stale evidence), then issues when fresh", async () => {
    const ctx = makeCtx(T_EQUITY, { freshnessMs: 30 * 60_000 });
    const staleAsOf = new Date(T_EQUITY - 2 * 3_600_000).toISOString();
    const input = integratedEquityCandidate({ asOf: staleAsOf });
    let calls = 0;
    ctx.deps.quoteProvider = {
      refresh: async (c) => {
        calls += 1;
        if (calls === 1) return null; // provider failure first
        return { ...c.inputs, asOf: new Date(ctx.clock.now()).toISOString() };
      },
    };
    await integratedManualIssue(ctx.deps, input, "invocation-stale-1");
    const deferred = ctx.store.getCandidate(issuanceIdentityFor(input))!;
    assert.equal(deferred.status, "deferred");
    assert.equal(deferred.outcome?.gate, "stale-inputs");
    assert.ok(deferred.nextReassessmentAt !== null);
    assert.equal(ctx.store.listSignals().length, 0);

    wireEquityEntry(ctx, 250.25, 249.5);
    ctx.clock.set(Date.parse(deferred.nextReassessmentAt!) + 1);
    const r2 = await integratedTick(ctx.deps);
    assert.deepEqual(r2.issued.length, 1);
    assert.equal(ctx.store.listSignals().length, 1);
    ctx.store.close();
  });

  it("expired candidate -> rejected with gate expiry, issuer never entered", async () => {
    const ctx = makeCtx(T_CRYPTO, { candidateTtlMs: 3_600_000 });
    const input = integratedCryptoCandidate({ detectedAt: "2026-10-14T01:00:00.000Z" }); // 3h old
    const rec = await integratedManualIssue(ctx.deps, input, "invocation-exp-1");
    assert.equal(rec.status, "expired");
    assert.equal(rec.outcome?.gate, "expiry");
    assert.equal(ctx.store.listSignals().length, 0);
    assert.equal(ctx.store.tableCount("contracts"), 0);
    ctx.store.close();
  });

  it("crypto short without bearish structure -> rejected by the RETAINED short-regime gate", async () => {
    const ctx = makeCtx(T_CRYPTO);
    const rising = Array.from({ length: 60 }, (_, i) => 80 + i * 0.5);
    const input = integratedCryptoCandidate({
      direction: "short",
      historyCloses: rising,
      historyHighs: rising.map((c) => c + 0.4),
    });
    const rec = await integratedManualIssue(ctx.deps, input, "invocation-reg-1");
    assert.equal(rec.status, "rejected");
    assert.equal(rec.outcome?.gate, "short-regime");
    assert.equal(ctx.store.listSignals().length, 0);
    ctx.store.close();
  });
});

describe("integrated handler: restart / replay and concurrency", () => {
  it("restart/replay: store reload + re-ingest -> still exactly one signal", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "itg-restart-")), "store.db");
    const mkDeps = (dbPath: string, startMs: number): Ctx => {
      const store = new DbStore(dbPath);
      const clock = manualClock(startMs);
      const deps: IntegratedDeps = {
        store, clock, config: { freshnessMs: 24 * 3_600_000 },
      };
      return { deps, clock, store };
    };
    const ctx1 = mkDeps(path, T_EQUITY);
    const input = integratedEquityCandidate();
    wireEquityEntry(ctx1, 250.25, 249.5);
    const first = await integratedManualIssue(ctx1.deps, input, "invocation-restart-1");
    assert.equal(first.status, "issued");
    assert.equal(ctx1.store.listSignals().length, 1);
    ctx1.store.close();

    // Simulate a restart: brand-new store over the same file.
    const ctx2 = mkDeps(path, T_EQUITY + 60_000);
    wireEquityEntry(ctx2, 250.25, 249.5);
    const replayed = await integratedManualIssue(ctx2.deps, input, "invocation-restart-2");
    assert.equal(replayed.status, "issued");
    assert.equal(ctx2.store.listSignals().length, 1, "reload + replay must not duplicate");
    assert.equal(replayed.issuedSignalId, first.issuedSignalId);
    assert.equal(replayed.contractId, first.contractId);
    await integratedTick(ctx2.deps);
    assert.equal(ctx2.store.listSignals().length, 1);
    ctx2.store.close();
  });

  it("overlapping manual + scheduled calls -> exactly one issuance", async () => {
    const ctx = makeCtx(T_EQUITY);
    const input = integratedEquityCandidate({ symbol: "CONC" });
    await ingestIntegratedCandidate(ctx.deps, input);
    // Fresh feed+clock per call (deterministic same print) — the two calls interleave.
    ctx.deps.entryFeedFor = (): EntryObservationFeed => {
      const setup = equityOpenPrintFeed(ctx.clock.now(), "2026-10-13", 250.25);
      return {
        feed: setup.feed, clock: setup.clock, pollIntervalMs: 60_000, maxPolls: 5000,
        advance: (ms: number) => {
          setup.clock.advance(ms);
          ctx.clock.advance(ms);
        },
      };
    };
    const openTs = Date.parse("2026-10-14T13:30:00.000Z");
    ctx.deps.postEntryEvidenceFor = (): PostEntryEvidence => ({
      bars: [sessionBar("2026-10-14",
        { open: 250.25, high: 252, low: 249.5, close: 251 }, "2026-10-14 session (post-entry, clean)")],
      nowAt: openTs + 6.5 * 3_600_000,
    });

    const [manualRec, tickReport] = await Promise.all([
      integratedManualIssue(ctx.deps, input, "invocation-conc-A"),
      integratedTick(ctx.deps),
    ]);
    void tickReport;
    // The qualification race has exactly one winner; the loser returns the
    // accepted state without writing (it may be awaiting-entry while the
    // winner is still observing — the DB converges to exactly-once).
    assert.ok(manualRec.status === "issued" || manualRec.status === "awaiting-entry",
      `loser returns the accepted state, no error: ${manualRec.status}`);
    assert.equal(ctx.store.tableCount("signals"), 1, "exactly one signal");
    assert.equal(ctx.store.tableCount("contracts"), 1, "exactly one contract");
    assert.equal(ctx.store.listAlerts().filter((a) => a.kind === "setup").length, 1, "exactly one setup alert");
    assert.equal(ctx.store.listAlerts().filter((a) => a.kind === "entry").length, 1, "exactly one entry alert");
    const ticked = ctx.store.getCandidate(issuanceIdentityFor(input))!;
    assert.equal(ticked.status, "issued", "final state is issued");
    assert.equal(ticked.issuedSignalId, ctx.store.listSignals()[0]!.signalId,
      "the single signal id is the accepted one");
    ctx.store.close();
  });
});

describe("integrated handler: entry outcomes and post-entry point", () => {
  it("print beyond the drift cap -> invalidated (void_drift), no signal", async () => {
    const ctx = makeCtx(T_CRYPTO);
    const input = integratedCryptoCandidate({
      vetoBars: [
        h1Bar("2026-10-14T01:00:00.000Z", { open: 99.5, high: 100.5, low: 96, close: 100 }, "post-decision 1h (clean)"),
      ],
    });
    const setup = cryptoPrintFeed(T_CRYPTO, 30_000, 102); // +2% drift > 1.5% cap
    wireEntry(ctx, setup, null);
    const rec = await integratedManualIssue(ctx.deps, input, "invocation-drift-1");
    assert.equal(rec.status, "invalidated");
    assert.equal(rec.outcome?.gate, "entry-drift");
    assert.equal(ctx.store.listSignals().length, 0, "drift-void is a non-entry");
    assert.equal(ctx.store.getContract(rec.contractId!)?.state, "void_drift");
    // Setup alert fired (qualification happened); no entry alert.
    assert.equal(ctx.store.listAlerts().filter((a) => a.kind === "setup").length, 1);
    assert.equal(ctx.store.listAlerts().filter((a) => a.kind === "entry").length, 0);
    ctx.store.close();
  });

  it("venue serves nothing for the window -> non-entry:first-print-unverifiable (fail closed, not an expiry)", async () => {
    const ctx = makeCtx(T_CRYPTO);
    const input = integratedCryptoCandidate({
      vetoBars: [
        h1Bar("2026-10-14T01:00:00.000Z", { open: 99.5, high: 100.5, low: 96, close: 100 }, "post-decision 1h (clean)"),
      ],
    });
    const emptyClock = new MutableClock(T_CRYPTO);
    const emptyFeed = new ScriptedFeed([], emptyClock);
    wireEntry(ctx, { feed: emptyFeed, clock: emptyClock, printTs: 0 }, null, 60_000, 30);
    const rec = await integratedManualIssue(ctx.deps, input, "invocation-expw-1");
    // v2.1.7: with no served history the first print cannot be established —
    // the explicit-uncertainty non-entry, fail closed (not entry-expired).
    assert.equal(rec.status, "invalidated");
    assert.equal(rec.outcome?.gate, "first-print-unverifiable");
    assert.match(rec.outcome!.reason, /non-entry:first-print-unverifiable/);
    assert.equal(ctx.store.listSignals().length, 0, "unverifiable first print is a non-entry, never scored");
    assert.equal(ctx.store.listAlerts().filter((a) => a.kind === "entry").length, 0, "no entry alert");
    assert.equal(ctx.store.getContract(rec.contractId!)?.state, "void_first_print_unverifiable");
    ctx.store.close();
  });

  it("post-entry stop-out after a valid entry -> signal persisted with the stop-out recorded", async () => {
    const ctx = makeCtx(T_CRYPTO);
    const input = integratedCryptoCandidate({
      vetoBars: [
        h1Bar("2026-10-14T01:00:00.000Z", { open: 99.5, high: 100.5, low: 96, close: 100 }, "post-decision 1h (clean)"),
      ],
    });
    const breachAt = T_CRYPTO + 3_600_000;
    wireCryptoEntry(ctx, 100.2, [
      h1Bar(new Date(T_CRYPTO).toISOString(),
        { open: 100, high: 101, low: 97, close: 100.5 }, "post-entry 1h (clean)"),
      h1Bar(new Date(breachAt).toISOString(),
        { open: 100.5, high: 101, low: 93, close: 94 }, "post-entry 1h (stop-out)"),
    ], breachAt + 3_600_000);
    // Waiting interval [decisionAt, entryAt] is clean: a point print inside
    // the window that never touches the stop.
    wireWaiting(ctx, [pointPrint(T_CRYPTO + 10_000, 100.1, "waiting-interval point (clean)")]);
    const rec = await integratedManualIssue(ctx.deps, input, "invocation-post-1");
    // Valid entry -> the signal EXISTS (a stop-out is a realized outcome, not a non-entry).
    assert.equal(rec.status, "issued");
    assert.equal(ctx.store.listSignals().length, 1);
    const signal = ctx.store.listSignals()[0]!;
    assert.match(signal.gateSummary, /invalidation_observed/);
    assert.equal(rec.outcome?.detail?.["postEntryInvalidation"], "invalidation_observed");
    ctx.store.close();
  });

  it("stopped at birth (entry print itself crossed the stop) -> invalidated, no signal", async () => {
    const ctx = makeCtx(T_CRYPTO);
    const input = integratedCryptoCandidate({
      entryPrice: 100,
      invalidation: 99.8, // tight stop
      vetoBars: [
        h1Bar("2026-10-14T01:00:00.000Z", { open: 100, high: 100.4, low: 99.9, close: 100.1 }, "post-decision 1h (clean)"),
      ],
    });
    // Print at 99.75: drift -0.25% (within the 1.5% cap) but <= stop 99.8.
    const setup = cryptoPrintFeed(T_CRYPTO, 30_000, 99.75);
    wireEntry(ctx, setup, null);
    // Waiting interval [decisionAt, entryAt] is clean (the stop-crossing
    // happens AT the entry print — the post-entry point's question).
    wireWaiting(ctx, [pointPrint(T_CRYPTO + 10_000, 100.1, "waiting-interval point (clean)")]);
    const rec = await integratedManualIssue(ctx.deps, input, "invocation-birth-1");
    assert.equal(rec.status, "invalidated");
    assert.equal(rec.outcome?.gate, "post-entry-invalidation");
    assert.match(rec.outcome!.reason, /stopped at birth/);
    assert.equal(ctx.store.listSignals().length, 0, "no valid entry -> no signal row");
    ctx.store.close();
  });
});

describe("item 2 parity: receipt-expiry rule (observation vs receipt time)", () => {
  const cleanVetoBar = () =>
    h1Bar("2026-10-14T01:00:00.000Z", { open: 99.5, high: 100.5, low: 96, close: 100 }, "post-decision 1h (clean)");

  /** Scripted feed: the fetch returns a print observed at startMs + observedOffsetMs
   *  but advances the clock to startMs + receiptOffsetMs DURING the await (the venue
   *  fetch latency), so the receipt instant is controlled independently of the
   *  observation instant. */
  function lateFeed(startMs: number, clock: MutableClock, observedOffsetMs: number, receiptOffsetMs: number): VenueFeed {
    return {
      latestPrints: async (_sinceTs: number) => {
        clock.advance(receiptOffsetMs);
        return [{ ts: startMs + observedOffsetMs, price: 100.2, venue: "binance-spot", venueTradeId: "agg-8001", venueSeq: 8001 }];
      },
      // Complete history by construction: the lateness under test is a
      // receipt-time property, not a coverage gap.
      historyCoverage: async (_sinceTs: number) => ({ historyStartMs: Number.NEGATIVE_INFINITY }),
    };
  }

  function wireLateFeed(ctx: Ctx, clock: MutableClock, observedOffsetMs: number, receiptOffsetMs: number): void {
    const feed = lateFeed(T_CRYPTO, clock, observedOffsetMs, receiptOffsetMs);
    ctx.deps.entryFeedFor = (): EntryObservationFeed => ({
      feed, clock, pollIntervalMs: 60_000, maxPolls: 5000,
      advance: (ms: number) => { clock.advance(ms); ctx.clock.advance(ms); },
    });
  }

  it("canonical counterexample: observed at minute 14 (in-window), received at minute 16 (after expiry) → void_expired", async () => {
    const ctx = makeCtx(T_CRYPTO);
    const input = integratedCryptoCandidate({ symbol: "PARITY", vetoBars: [cleanVetoBar()] });
    const clock = new MutableClock(T_CRYPTO);
    // Print observed at minute 14 — INSIDE the 15-min window. The receipt
    // time (minute 16, after expiry) is what voids: late receipt is
    // historical reconstruction, not an actionable entry.
    wireLateFeed(ctx, clock, 14 * 60_000, 16 * 60_000);
    const rec = await integratedManualIssue(ctx.deps, input, "invocation-parity-1");
    assert.equal(rec.status, "entry-expired");
    assert.equal(rec.outcome?.gate, "entry-expired");
    assert.match(rec.outcome!.reason, /late receipt: historical reconstruction, not an actionable entry/);
    assert.equal(ctx.store.listSignals().length, 0, "late receipt never issues");
    assert.equal(ctx.store.getContract(rec.contractId!)?.state, "void_expired");
    ctx.store.close();
  });

  it("boundary accept: observed at 14:59, received at 14:59:30 (inside the window) → issued", async () => {
    const ctx = makeCtx(T_CRYPTO);
    const input = integratedCryptoCandidate({ symbol: "PARITY-OK", vetoBars: [cleanVetoBar()] });
    const clock = new MutableClock(T_CRYPTO);
    // Observation at 14:59 with receipt 30s later is still inside the window:
    // a live entry, not a reconstruction.
    wireLateFeed(ctx, clock, 14 * 60_000 + 59_000, 14 * 60_000 + 59_500);
    // Post-entry evidence: clean 1h bars, no invalidation touch -> issued.
    ctx.deps.postEntryEvidenceFor = () => ({
      bars: [
        h1Bar(new Date(T_CRYPTO).toISOString(),
          { open: 100, high: 101, low: 97, close: 100.5 }, "post-entry 1h (clean)"),
        h1Bar(new Date(T_CRYPTO + 3_600_000).toISOString(),
          { open: 100.5, high: 102, low: 98, close: 101 }, "post-entry 1h (clean)"),
      ],
      nowAt: T_CRYPTO + 2 * 3_600_000,
    });
    // Waiting interval [decisionAt, entryAt] is clean: a point print inside
    // the window that never touches the stop.
    ctx.deps.waitingIntervalEvidenceFor = () =>
      [pointPrint(T_CRYPTO + 10_000, 100.1, "waiting-interval point (clean)")];
    const rec = await integratedManualIssue(ctx.deps, input, "invocation-parity-2");
    assert.equal(rec.status, "issued", `in-window receipt must enter, got ${rec.status}: ${rec.outcome?.reason}`);
    assert.equal(ctx.store.listSignals().length, 1);
    assert.equal(ctx.store.getContract(rec.contractId!)?.state, "entered");
    ctx.store.close();
  });

  it("boundary reject: observed at 14:00, received at 15:01 (after expiry) → void_expired", async () => {
    const ctx = makeCtx(T_CRYPTO);
    const input = integratedCryptoCandidate({ symbol: "PARITY-LATE", vetoBars: [cleanVetoBar()] });
    const clock = new MutableClock(T_CRYPTO);
    wireLateFeed(ctx, clock, 14 * 60_000, 15 * 60_000 + 1_000);
    const rec = await integratedManualIssue(ctx.deps, input, "invocation-parity-3");
    assert.equal(rec.status, "entry-expired");
    assert.equal(rec.outcome?.gate, "entry-expired");
    assert.match(rec.outcome!.reason, /late receipt: historical reconstruction, not an actionable entry/);
    assert.equal(ctx.store.listSignals().length, 0, "post-expiry receipt never issues");
    assert.equal(ctx.store.getContract(rec.contractId!)?.state, "void_expired");
    ctx.store.close();
  });
});

describe("item 1: concurrent corruption — loser-overwrites-winner is refused", () => {
  it("two DbStore instances on the same file (WAL): A issues, B's drift-invalid outcome attempt changes nothing", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "itg-item1-")), "store.db");
    // Worker A: the full pipeline through to issued.
    const storeA = new DbStore(path);
    const clockA = manualClock(T_CRYPTO);
    const depsA: IntegratedDeps = { store: storeA, clock: clockA, config: { freshnessMs: 24 * 3_600_000 } };
    const input = integratedCryptoCandidate({ symbol: "ITEM1" });
    const setupA = cryptoPrintFeed(T_CRYPTO, 30_000, 100.2);
    depsA.entryFeedFor = (): EntryObservationFeed => ({
      feed: setupA.feed, clock: setupA.clock, pollIntervalMs: 60_000, maxPolls: 5000,
      advance: (ms: number) => { setupA.clock.advance(ms); clockA.advance(ms); },
    });
    depsA.postEntryEvidenceFor = () => ({
      bars: [h1Bar(new Date(T_CRYPTO).toISOString(),
        { open: 100, high: 101, low: 97, close: 100.5 }, "post-entry 1h (clean)")],
      nowAt: T_CRYPTO + 3_600_000,
    });
    depsA.waitingIntervalEvidenceFor = () => [pointPrint(T_CRYPTO + 10_000, 100.1, "waiting-interval point (clean)")];
    const issuedA = await integratedManualIssue(depsA, input, "item1-A");
    assert.equal(issuedA.status, "issued");
    const candidateId = issuedA.candidateId;
    const contractId = issuedA.contractId!;
    // Snapshot A's issued state (deep copies — the assertions below compare
    // the FINAL rows against these).
    const candidateRowA = JSON.parse(JSON.stringify(storeA.getCandidate(candidateId)));
    const contractRowA = JSON.parse(JSON.stringify(storeA.getContract(contractId)));
    const signalsA = JSON.parse(JSON.stringify(storeA.listSignals()));
    assert.equal(signalsA.length, 1);

    // Worker B: a SEPARATE database connection on the same file (WAL mode).
    // The expert's counterexample: B's drift-invalid print arrives AFTER A
    // issued; B attempts the drift-invalid outcome with its stale view.
    // The in-transaction ownership/state guard must refuse: B writes nothing
    // and returns the accepted state unchanged.
    const storeB = new DbStore(path);
    const clockB = manualClock(T_CRYPTO + 120_000);
    const depsB: IntegratedDeps = { store: storeB, clock: clockB, config: { freshnessMs: 24 * 3_600_000 } };
    const parsedA = JSON.parse(contractRowA.contractJson) as ActionableEntryContract;
    const voidedByB: ActionableEntryContract = {
      ...parsedA, entryState: "void_drift", voidReason: "B: drift-invalid print arrived after issuance",
    };
    const staleAwaitingB = {
      ...candidateRowA, status: "awaiting-entry" as const,
      outcome: { kind: "awaiting-entry" as const, gate: null, reason: "B's stale pre-issuance view", via: "automatic" as const },
    };
    const returnedB = await commitNonEntryOutcome(
      depsB, staleAwaitingB, voidedByB, "sig_item1", contractId,
      "invalidated", "entry-drift", "B: drift-invalid print arrived after issuance", "automatic",
    );
    const norm = (v: unknown): unknown => JSON.parse(JSON.stringify(v)); // node:sqlite rows are null-prototype
    assert.deepEqual(norm(returnedB), candidateRowA, "B returned the accepted state unchanged (no error, no write)");
    assert.deepEqual(norm(storeB.getCandidate(candidateId)), candidateRowA, "candidate row is exactly A's issued state");
    assert.deepEqual(norm(storeB.getContract(contractId)), contractRowA, "contract row is exactly A's issued state");
    assert.deepEqual(norm(storeB.listSignals()), signalsA, "signal row is exactly A's issued state");

    // The entered-outcome guard refuses the same way: B's commitEnteredOutcome
    // attempt rolls back with no writes and returns the accepted state.
    const postAssessmentStub = {
      invalidated: false, gate: "", reason: "stub",
      result: {
        check: "post_entry_invalidation", entryValid: "pass", entryReason: "stub",
        interveningInvalidation: "no_invalidation_observed", invalidationReason: "stub",
        verdict: "pass", reason: "stub",
      },
    } as unknown as Parameters<typeof commitEnteredOutcome>[9];
    const returnedB2 = await commitEnteredOutcome(
      depsB, staleAwaitingB, parsedA, null, "sig_item1", contractId,
      "identity-item1", "item1-B", "stub summary", postAssessmentStub, "automatic",
    );
    assert.deepEqual(norm(returnedB2), candidateRowA, "B's entered attempt returned the accepted state unchanged");
    assert.deepEqual(norm(storeB.getCandidate(candidateId)), candidateRowA, "candidate row still exactly A's issued state");
    assert.deepEqual(norm(storeB.getContract(contractId)), contractRowA, "contract row still exactly A's issued state");
    assert.deepEqual(norm(storeB.listSignals()), signalsA, "signal row still exactly A's issued state");
    storeA.close();
    storeB.close();
  });
});

describe("item 2: late fetch, stale prints, wrong venue", () => {
  const cleanVetoBar = () =>
    h1Bar("2026-10-14T01:00:00.000Z", { open: 99.5, high: 100.5, low: 96, close: 100 }, "post-decision 1h (clean)");

  it("minute-16: fetch starts in-window, clock advances past expiry during the await → expired, never issued", async () => {
    const ctx = makeCtx(T_CRYPTO);
    const input = integratedCryptoCandidate({ symbol: "LATE", vetoBars: [cleanVetoBar()] });
    const clock = new MutableClock(T_CRYPTO);
    // The expert's counterexample: the feed request starts inside the 15-min
    // window; the clock advances to minute 16 DURING the await; the print
    // (ts=0:30) is served after the window closed.
    const feed: VenueFeed = {
      latestPrints: async (_sinceTs: number) => {
        clock.advance(16 * 60_000);
        return [{ ts: T_CRYPTO + 30_000, price: 100.2, venue: "binance-spot", venueTradeId: "agg-8002", venueSeq: 8002 }];
      },
      // Complete history by construction: the lateness under test is a
      // receipt-time property, not a coverage gap.
      historyCoverage: async (_sinceTs: number) => ({ historyStartMs: Number.NEGATIVE_INFINITY }),
    };
    ctx.deps.entryFeedFor = (): EntryObservationFeed => ({
      feed, clock, pollIntervalMs: 60_000, maxPolls: 5000,
      advance: (ms: number) => { clock.advance(ms); ctx.clock.advance(ms); },
    });
    const rec = await integratedManualIssue(ctx.deps, input, "invocation-late-1");
    assert.equal(rec.status, "entry-expired");
    assert.equal(rec.outcome?.gate, "entry-expired");
    assert.match(rec.outcome!.reason, /late receipt: historical reconstruction, not an actionable entry/);
    assert.equal(ctx.store.listSignals().length, 0, "late receipt never issues");
    assert.equal(ctx.store.getContract(rec.contractId!)?.state, "void_expired");
    ctx.store.close();
  });

  it("stale first print (age > maxObservationAgeMs) -> named non-entry:first-print-missed (never skipped for a later print)", async () => {
    const ctx = makeCtx(T_CRYPTO);
    const input = integratedCryptoCandidate({ symbol: "STALE", vetoBars: [cleanVetoBar()] });
    // The only print is in-window (ts = T+1min) but the observer first sees
    // it at T+10min: age 9min > the declared 5-min bound. v2.1.7: the true
    // first print was missed -> the contract voids immediately as the named
    // non-entry (the old code skipped it and eventually expired — the
    // substitution defect's sibling).
    const clock = new MutableClock(T_CRYPTO + 10 * 60_000);
    const feed = new ScriptedFeed(
      [{ ts: T_CRYPTO + 60_000, price: 100.2, venue: "binance-spot", availableAt: T_CRYPTO + 60_000, venueTradeId: "agg-8003", venueSeq: 8003 }],
      clock,
    );
    ctx.deps.entryFeedFor = (): EntryObservationFeed => ({
      feed, clock, pollIntervalMs: 60_000, maxPolls: 5000,
      advance: (ms: number) => { clock.advance(ms); ctx.clock.advance(ms); },
    });
    const rec = await integratedManualIssue(ctx.deps, input, "invocation-stale-2");
    assert.equal(rec.status, "invalidated");
    assert.equal(rec.outcome?.gate, "first-print-missed");
    assert.match(rec.outcome!.reason, /non-entry:first-print-missed/);
    assert.equal(ctx.store.listSignals().length, 0, "stale first print never entered");
    assert.equal(ctx.store.listAlerts().filter((a) => a.kind === "entry").length, 0, "no entry alert");
    assert.equal(ctx.store.getContract(rec.contractId!)?.state, "void_first_print_missed");
    ctx.store.close();
  });

  it("wrong-venue print → skipped → expired", async () => {
    const ctx = makeCtx(T_CRYPTO);
    const input = integratedCryptoCandidate({ symbol: "VENUE", vetoBars: [cleanVetoBar()] });
    // Timely in-window print, but on the wrong venue for the contract's
    // binance-spot entryVenue: skipped, never entered.
    const clock = new MutableClock(T_CRYPTO);
    const feed = new ScriptedFeed(
      [{ ts: T_CRYPTO + 30_000, price: 100.2, venue: "coinbase-spot", availableAt: T_CRYPTO + 30_000, venueTradeId: "agg-8004", venueSeq: 8004 }],
      clock,
    );
    ctx.deps.entryFeedFor = (): EntryObservationFeed => ({
      feed, clock, pollIntervalMs: 60_000, maxPolls: 5000,
      advance: (ms: number) => { clock.advance(ms); ctx.clock.advance(ms); },
    });
    const rec = await integratedManualIssue(ctx.deps, input, "invocation-venue-1");
    assert.equal(rec.status, "entry-expired");
    assert.equal(ctx.store.listSignals().length, 0, "wrong-venue print never entered");
    assert.equal(ctx.store.getContract(rec.contractId!)?.state, "void_expired");
    ctx.store.close();
  });
});

describe("item 3: durable awaiting-entry recovery", () => {
  it("process termination after qualification → new store on the same file → tick resumes → issued; contract NOT recreated; setup alert exactly once", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "itg-item3-")), "store.db");
    const input = integratedCryptoCandidate({ symbol: "RESUME" });

    // Phase 1: crash between the qualification commit and entry observation.
    const store1 = new DbStore(path);
    const clock1 = manualClock(T_CRYPTO);
    const deps1: IntegratedDeps = { store: store1, clock: clock1, config: { freshnessMs: 24 * 3_600_000 } };
    deps1.entryFeedFor = (): EntryObservationFeed => {
      throw new Error("simulated crash: process died between qualification commit and entry observation");
    };
    let crashed = false;
    try {
      await integratedManualIssue(deps1, input, "item3-phase1");
    } catch (e) {
      crashed = (e as Error).message.startsWith("simulated crash");
    }
    assert.equal(crashed, true, "phase 1 must crash after the qualification commit");
    const afterCrash = store1.getCandidate(issuanceIdentityFor(input))!;
    assert.equal(afterCrash.status, "awaiting-entry", "durable pending state survives the crash");
    const contractId = afterCrash.contractId!;
    const row1 = store1.getContract(contractId)!;
    assert.equal(row1.state, "pending", "contract row is pending");
    const decisionAt1 = (JSON.parse(row1.contractJson) as { decisionAt: string }).decisionAt;
    assert.equal(store1.listAlerts().filter((a) => a.kind === "setup").length, 1, "setup alert enqueued once");
    store1.close(); // process termination: all in-memory state dropped

    // Phase 2: a brand-new store over the same file; the clock is +60s (the
    // 15-min window is still open). integratedTick must resume from the DB.
    const store2 = new DbStore(path);
    const clock2 = manualClock(T_CRYPTO + 60_000);
    const deps2: IntegratedDeps = { store: store2, clock: clock2, config: { freshnessMs: 24 * 3_600_000 } };
    const feedClock = new MutableClock(T_CRYPTO + 60_000);
    const feed = new ScriptedFeed(
      [{ ts: T_CRYPTO + 90_000, price: 100.2, venue: "binance-spot", availableAt: T_CRYPTO + 90_000, venueTradeId: "agg-8005", venueSeq: 8005 }],
      feedClock,
    );
    deps2.entryFeedFor = (): EntryObservationFeed => ({
      feed, clock: feedClock, pollIntervalMs: 60_000, maxPolls: 5000,
      advance: (ms: number) => { feedClock.advance(ms); clock2.advance(ms); },
    });
    deps2.waitingIntervalEvidenceFor = () => [pointPrint(T_CRYPTO + 60_000, 100.1, "waiting-interval point (clean)")];
    deps2.postEntryEvidenceFor = () => ({
      bars: [h1Bar(new Date(T_CRYPTO + 90_000).toISOString(),
        { open: 100, high: 101, low: 97, close: 100.5 }, "post-entry 1h (clean)")],
      nowAt: T_CRYPTO + 3_600_000,
    });
    // Delivery is a separate step with its own timestamp.
    deps2.deliverAlert = async () => { clock2.advance(1); };

    const report = await integratedTick(deps2);
    assert.deepEqual(report.issued, [afterCrash.candidateId], "tick resumed and issued");
    assert.deepEqual(report.awaiting, [], "nothing left awaiting");
    const rec = store2.getCandidate(afterCrash.candidateId)!;
    assert.equal(rec.status, "issued");
    // The contract was NOT recreated: same id, same decision instant.
    assert.equal(rec.contractId, contractId);
    const row2 = store2.getContract(contractId)!;
    assert.equal(row2.state, "entered");
    assert.equal(
      (JSON.parse(row2.contractJson) as { decisionAt: string }).decisionAt, decisionAt1,
      "resumed contract keeps the original decisionAt — parsed from the DB row, not rebuilt",
    );
    // The setup alert was NOT re-fired on resume.
    assert.equal(store2.listAlerts().filter((a) => a.kind === "setup").length, 1, "setup alert fired exactly once");
    // Enqueue and delivery are separate timestamps.
    const entryAlert = store2.listAlerts().find((a) => a.kind === "entry")!;
    assert.ok(entryAlert.enqueuedAt < entryAlert.deliveredAt!,
      `enqueuedAt (${entryAlert.enqueuedAt}) < deliveredAt (${entryAlert.deliveredAt})`);
    assert.equal(entryAlert.deliveryStatus, "delivered");
    assert.equal(store2.listSignals().length, 1);
    store2.close();
  });

  it("poll-budget exhaustion with the window still open → stays awaiting-entry (NOT expired); expires only when the window closes", async () => {
    const ctx = makeCtx(T_CRYPTO);
    const input = integratedCryptoCandidate({
      symbol: "BUDGET",
      vetoBars: [h1Bar("2026-10-14T01:00:00.000Z", { open: 99.5, high: 100.5, low: 96, close: 100 }, "post-decision 1h (clean)")],
    });
    // Empty feed, tiny poll budget: the window is open but nothing observable.
    const clock = new MutableClock(T_CRYPTO);
    const feed = new ScriptedFeed([], clock);
    ctx.deps.entryFeedFor = (): EntryObservationFeed => ({
      feed, clock, pollIntervalMs: 60_000, maxPolls: 1,
      advance: (ms: number) => { clock.advance(ms); ctx.clock.advance(ms); },
    });
    const rec = await integratedManualIssue(ctx.deps, input, "invocation-budget-1");
    assert.equal(rec.status, "awaiting-entry", "poll-budget exhaustion is NOT an expiry");
    assert.equal(rec.outcome?.gate, "poll-budget");
    assert.match(rec.outcome!.reason, /poll-budget-exhausted, window still open/);
    assert.ok(rec.nextReassessmentAt !== null, "another bounded run is scheduled");
    assert.equal(ctx.store.getContract(rec.contractId!)?.state, "pending", "contract NOT voided");
    assert.equal(ctx.store.listSignals().length, 0);

    // Advance past the window close: the next tick resumes and voids as the
    // named unverifiable non-entry — the venue served nothing, so the first
    // print cannot be established (fail closed, v2.1.7).
    clock.set(T_CRYPTO + 16 * 60_000);
    ctx.clock.set(T_CRYPTO + 16 * 60_000);
    const report = await integratedTick(ctx.deps);
    const rec2 = ctx.store.getCandidate(rec.candidateId)!;
    assert.equal(rec2.status, "invalidated");
    assert.equal(rec2.outcome?.gate, "first-print-unverifiable");
    assert.match(rec2.outcome!.reason, /non-entry:first-print-unverifiable/);
    assert.deepEqual(report.rejected, [rec.candidateId]);
    ctx.store.close();
  });
});
