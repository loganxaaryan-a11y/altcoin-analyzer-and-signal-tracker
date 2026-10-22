// integrated-demos.ts — ten integrated demonstrations through the COMPLETE
// integrated issuance handler (workstream A + B + the 2026-10-13 repair).
//
// SANDBOX ONLY. No production issuance, no scheduler enablement, no brokerage.
// Runs directly under Node >= 22 type-stripping: `node demo/integrated-demos.ts`
// (no compile step needed for this file).
//
// Every demonstration exercises the REAL compiled modules:
//   - orchestrator/dist/... (integrated handler, DbStore, gates, fixtures)
//   - veto/src/veto.ts (corrected three-way veto)
//   - veto/src/waiting-interval.ts (runQualificationChecks at step 5,
//     checkWaitingInterval at step 9b — the genuine decision→entry veto)
//   - entry-v1/src/*.ts (pending contracts, entry observation, feed)
//
// and every persistence write goes through the REAL DB path (DbStore over
// node:sqlite with BEGIN IMMEDIATE / COMMIT / ROLLBACK transactions).
//
// Output: demo/integrated-demo-log-2026-10-13.md (this run's full log).

import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// --- the real compiled integrated handler ----------------------------------
import { manualClock } from "../orchestrator/dist/paper-signals/orchestrator/src/clock.js";
import { DbStore } from "../orchestrator/dist/paper-signals/orchestrator/src/persistence/db-store.js";
import {
  ingestIntegratedCandidate,
  integratedManualIssue,
  integratedTick,
  issuanceIdentityFor,
} from "../orchestrator/dist/paper-signals/orchestrator/src/issuance/handler.js";
import type {
  EntryObservationFeed,
  IntegratedDeps,
  PostEntryEvidence,
} from "../orchestrator/dist/paper-signals/orchestrator/src/issuance/handler.js";
import {
  commitNonEntryOutcome,
  contractIdFor,
} from "../orchestrator/dist/paper-signals/orchestrator/src/issuance/handler.js";
import type { EvidenceBar } from "../veto/src/veto.ts";
import { MutableClock, ScriptedFeed } from "../entry-v1/dist/src/feed.js";
import { alertFeed, trackerView } from "../orchestrator/dist/paper-signals/orchestrator/src/readpath.js";
import { evaluateBornDead } from "../orchestrator/dist/paper-signals/orchestrator/src/gates/crypto-gates.js";
import {
  cryptoPrintFeed,
  equityOpenPrintFeed,
  formingBar,
  h1Bar,
  integratedCryptoCandidate,
  integratedEquityCandidate,
  sessionBar,
} from "../orchestrator/dist/paper-signals/orchestrator/tests/fixtures.js";

const DEMO_DIR = dirname(fileURLToPath(import.meta.url));
const LOG_PATH = resolve(DEMO_DIR, "integrated-demo-log-2026-10-13.md");
const EVIDENCE_DIR = resolve(DEMO_DIR, "evidence", "integrated");
mkdirSync(EVIDENCE_DIR, { recursive: true });

const T_CRYPTO = Date.parse("2026-10-14T04:00:00.000Z");
const T_EQUITY = Date.parse("2026-10-13T22:30:00.000Z");

const log: string[] = [];
function emit(s = ""): void {
  log.push(s);
  console.log(s);
}
let failures = 0;
function check(name: string, cond: boolean, detail = ""): void {
  const mark = cond ? "PASS" : "FAIL";
  if (!cond) failures++;
  emit(`  [${mark}] ${name}${detail ? ` — ${detail}` : ""}`);
}

type TestClock = ReturnType<typeof manualClock>;

function makeDeps(startMs: number, dbFile: string, config: Record<string, number> = {}): { deps: IntegratedDeps; clock: TestClock; store: DbStore } {
  const store = new DbStore(dbFile);
  const clock = manualClock(startMs);
  const deps: IntegratedDeps = { store, clock, config: { freshnessMs: 24 * 3_600_000, ...config } };
  return { deps, clock, store };
}

function wireEquity(ctx: { deps: IntegratedDeps; clock: TestClock }, price: number, postLow: number): void {
  const { deps, clock } = ctx;
  deps.entryFeedFor = (): EntryObservationFeed => {
    const setup = equityOpenPrintFeed(clock.now(), "2026-10-13", price);
    return {
      feed: setup.feed, clock: setup.clock, pollIntervalMs: 60_000, maxPolls: 5000,
      advance: (ms: number) => {
        setup.clock.advance(ms);
        clock.advance(ms);
      },
    };
  };
  const openTs = Date.parse("2026-10-14T13:30:00.000Z");
  deps.postEntryEvidenceFor = (): PostEntryEvidence => ({
    bars: [sessionBar("2026-10-14",
      { open: price, high: price + 2, low: postLow, close: price + 1 },
      "2026-10-14 session (post-entry, clean)")],
    nowAt: openTs + 6.5 * 3_600_000,
  });
}

function wireCrypto(ctx: { deps: IntegratedDeps; clock: TestClock }, price: number, post: PostEntryEvidence | null, waitingBars?: EvidenceBar[] | null): void {
  const { deps, clock } = ctx;
  deps.entryFeedFor = (): EntryObservationFeed => {
    const setup = cryptoPrintFeed(clock.now(), 30_000, price);
    return {
      feed: setup.feed, clock: setup.clock, pollIntervalMs: 60_000, maxPolls: 5000,
      advance: (ms: number) => {
        setup.clock.advance(ms);
        clock.advance(ms);
      },
    };
  };
  deps.postEntryEvidenceFor = () => post;
  if (waitingBars !== undefined) deps.waitingIntervalEvidenceFor = () => waitingBars;
}

/** Point print evidence (trade_print granularity) at a ms timestamp. */
function pointPrint(ts: number, price: number, label: string): EvidenceBar {
  return {
    startAt: ts, endAt: ts,
    open: price, high: price, low: price, close: price,
    isClosed: true, granularity: "trade_print", source: "demo-fixture", label,
  };
}

/** A bar fully inside [startMs, endMs) — the waiting-interval breach fixture. */
function windowBar(startMs: number, endMs: number, ohlc: { open: number; high: number; low: number; close: number }, label: string): EvidenceBar {
  return {
    startAt: startMs, endAt: endMs,
    ...ohlc, isClosed: true, granularity: "intraday", source: "demo-fixture", label,
  };
}

const clean1h = (startIso: string, label: string) =>
  h1Bar(startIso, { open: 99.5, high: 100.5, low: 96, close: 100 }, label);

function dbFile(tag: string): string {
  return join(mkdtempSync(join(EVIDENCE_DIR, `${tag}-`)), "store.db");
}


// ---------------------------------------------------------------------------
async function demo1(): Promise<void> {
  emit("\n## Demo 1 — qualifying issuance exactly once (equity)");
  emit("Input: equity long, clean post-decision path; next-session open print +0.1% (within the 0.5% drift cap).");
  emit("Expected path: tick -> regime gate pass -> runQualificationChecks pass -> pending contract ->");
  emit("  setup alert -> open print observed -> entered -> post-entry clean -> atomic persist -> tracker + alerts.");
  const ctx = makeDeps(T_EQUITY, dbFile("demo1"));
  const input = integratedEquityCandidate();
  wireEquity(ctx, 250.25, 249.5);
  const rec = await integratedManualIssue(ctx.deps, input, "demo1-invocation");
  const signal = ctx.store.listSignals()[0]!;
  const alerts = ctx.store.listAlerts();
  const contractRow = ctx.store.getContract(rec.contractId!)!;
  const contract = JSON.parse(contractRow.contractJson) as { entryState: string; entryPrice: number; entryObservedAt: string };

  check("candidate issued", rec.status === "issued", `status=${rec.status}`);
  check("exactly one signal", ctx.store.listSignals().length === 1);
  check("exactly one contract, entered", ctx.store.tableCount("contracts") === 1 && contract.entryState === "entered",
    `entryPrice=${contract.entryPrice}`);
  check("contractId persisted alongside signalId", signal.contractId === rec.contractId, signal.contractId ?? "null");
  check("setup alert + entry alert", alerts.filter((a) => a.kind === "setup").length === 1 &&
    alerts.filter((a) => a.kind === "entry").length === 1);
  check("setupAlertAt < entryObservedAt (spec §2.2)", rec.setupAlertAt! < rec.entryObservedAt!,
    `${rec.setupAlertAt} < ${rec.entryObservedAt}`);
  check("tracker shows the signal", trackerView(ctx.store).length === 1);
  check("alert feed has both alerts", alertFeed(ctx.store).length === 2);
  const r2 = await integratedTick(ctx.deps);
  check("second tick issues nothing", r2.issued.length === 0 && ctx.store.listSignals().length === 1);
  ctx.store.close();
}

async function demo2(): Promise<void> {
  emit("\n## Demo 2 — clean abstention with gate reason (crypto)");
  emit("Input: crypto long; the entry print is clean (+0.2%, within the drift cap), but a bar inside");
  emit("  the REAL decision→entry waiting interval breaches the final published stop (94).");
  emit("Expected path: tick -> runQualificationChecks pass -> pending contract -> setup alert ->");
  emit("  entry observed -> checkWaitingInterval fail_closed (breach in the waiting interval) ->");
  emit("  invalidated, gate=waiting-interval-invalidation; reason names the breach bar and the final");
  emit("  stop; no signal row, no entry alert. (The decision→entry invalidation moved from the");
  emit("  speculative step-5 veto to the genuine [decisionAt, entryAt] window at step 9b.)");
  const ctx = makeDeps(T_CRYPTO, dbFile("demo2"));
  const input = integratedCryptoCandidate({
    vetoBars: [clean1h("2026-10-14T01:00:00.000Z", "post-decision 1h (clean)")],
  });
  wireCrypto(ctx, 100.2, null, [
    windowBar(T_CRYPTO, T_CRYPTO + 30_000,
      { open: 99, high: 99.5, low: 93.5, close: 98 }, "waiting-interval 30s bar (breach)"),
  ]);
  const rec = await integratedManualIssue(ctx.deps, input, "demo2-invocation");
  check("invalidated", rec.status === "invalidated", `status=${rec.status}`);
  check("gate is waiting-interval-invalidation", rec.outcome?.gate === "waiting-interval-invalidation", rec.outcome?.gate ?? "null");
  check("reason names the breach bar and the final stop",
    /waiting-interval 30s bar \(breach\)/.test(rec.outcome?.reason ?? "") && /final published stop 94/.test(rec.outcome?.reason ?? ""));
  check("zero signals", ctx.store.listSignals().length === 0);
  check("entry was observed (contract row entered) before the veto fired",
    ctx.store.getContract(rec.contractId!)?.state === "entered");
  check("setup alert fired exactly once, no entry alert",
    ctx.store.listAlerts().filter((a) => a.kind === "setup").length === 1 &&
    ctx.store.listAlerts().filter((a) => a.kind === "entry").length === 0);
  ctx.store.close();
}

async function demo3(): Promise<void> {
  emit("\n## Demo 3 — stale quote rejection (equity)");
  emit("Input: candidate with inputs 2h old (freshness 30m); quote provider returns null, then recovers.");
  emit("Expected path: tick -> deferred (stale-inputs), nextReassessmentAt set; no issuance, no contract,");
  emit("  no alert. Re-tick after recovery -> proceeds to issuance.");
  const ctx = makeDeps(T_EQUITY, dbFile("demo3"), { freshnessMs: 30 * 60_000 });
  const input = integratedEquityCandidate({ asOf: new Date(T_EQUITY - 2 * 3_600_000).toISOString() });
  let calls = 0;
  ctx.deps.quoteProvider = {
    refresh: async (c) => {
      calls += 1;
      if (calls === 1) return null;
      return { ...c.inputs, asOf: new Date(ctx.clock.now()).toISOString() };
    },
  };
  await integratedManualIssue(ctx.deps, input, "demo3-invocation");
  const deferred = ctx.store.getCandidate(issuanceIdentityFor(input))!;
  check("deferred on stale inputs", deferred.status === "deferred", `status=${deferred.status}`);
  check("gate is stale-inputs", deferred.outcome?.gate === "stale-inputs");
  check("next reassessment scheduled", deferred.nextReassessmentAt !== null, deferred.nextReassessmentAt ?? "null");
  check("no issuance / contract / alert while stale",
    ctx.store.listSignals().length === 0 && ctx.store.tableCount("contracts") === 0 && ctx.store.listAlerts().length === 0);

  wireEquity(ctx, 250.25, 249.5);
  ctx.clock.set(Date.parse(deferred.nextReassessmentAt!) + 1);
  const r2 = await integratedTick(ctx.deps);
  check("re-tick after recovery issues", r2.issued.length === 1 && ctx.store.listSignals().length === 1);
  ctx.store.close();
}

async function demo4(): Promise<void> {
  emit("\n## Demo 4 — expired candidate (crypto)");
  emit("Input: candidate detected 3h ago, TTL 1h. Expected: rejected gate=expiry; issuer never entered.");
  const ctx = makeDeps(T_CRYPTO, dbFile("demo4"), { candidateTtlMs: 3_600_000 });
  const input = integratedCryptoCandidate({ detectedAt: "2026-10-14T01:00:00.000Z" });
  const rec = await integratedManualIssue(ctx.deps, input, "demo4-invocation");
  check("rejected with gate expiry", rec.status === "expired" && rec.outcome?.gate === "expiry",
    `status=${rec.status} gate=${rec.outcome?.gate}`);
  check("reason cites the TTL", /TTL exceeded/.test(rec.outcome?.reason ?? ""));
  check("issuer never entered", ctx.store.listSignals().length === 0 && ctx.store.tableCount("contracts") === 0);
  ctx.store.close();
}

async function demo5(): Promise<void> {
  emit("\n## Demo 5 — restart/replay -> one signal (equity)");
  emit("Input: issue once, close the DB, reopen over the same file, re-ingest, tick.");
  emit("Expected: still exactly one signal; same signalId and contractId; tick issues nothing new.");
  const path = dbFile("demo5");
  const ctx1 = makeDeps(T_EQUITY, path);
  const input = integratedEquityCandidate();
  wireEquity(ctx1, 250.25, 249.5);
  const first = await integratedManualIssue(ctx1.deps, input, "demo5-invocation-1");
  check("first run issued", first.status === "issued");
  ctx1.store.close();

  const ctx2 = makeDeps(T_EQUITY + 60_000, path);
  wireEquity(ctx2, 250.25, 249.5);
  const replayed = await integratedManualIssue(ctx2.deps, input, "demo5-invocation-2");
  check("replay returns the issued record", replayed.status === "issued");
  check("still exactly one signal", ctx2.store.listSignals().length === 1);
  check("same signalId and contractId", replayed.issuedSignalId === first.issuedSignalId &&
    replayed.contractId === first.contractId, `${replayed.issuedSignalId} / ${replayed.contractId}`);
  await integratedTick(ctx2.deps);
  check("tick over the reloaded store issues nothing", ctx2.store.listSignals().length === 1);
  ctx2.store.close();
}

async function demo6(): Promise<void> {
  emit("\n## Demo 6 — pre-decision crossing -> PASS (the behavioral old-veto guard)");
  emit("Input: yesterday's (signal-day) bar crossed the proposed stop (low 93 <= stop 94);");
  emit("  post-decision 1h bars clean. The LEGACY born-dead veto tests the signal-day candle and");
  emit("  would suppress this fixture; the corrected veto records it as a setup feature.");
  emit("Expected path: tick -> veto pass (preDecisionFeatures) -> issued.");
  // Prove the premise: the old veto blocks this exact fixture.
  const oldVeto = evaluateBornDead("long", 94,
    { day: "2026-10-13", open: 99, high: 101, low: 93, close: 100, source: "t" });
  emit(`  old-veto premise: evaluateBornDead -> publish=${oldVeto.publish} reason="${oldVeto.reason}"`);
  const ctx = makeDeps(T_CRYPTO, dbFile("demo6"));
  const input = integratedCryptoCandidate({
    signalDayLow: 93,
    vetoBars: [
      clean1h("2026-10-14T01:00:00.000Z", "post-decision 1h (clean)"),
      clean1h("2026-10-14T02:00:00.000Z", "post-decision 1h (clean)"),
    ],
  });
  wireCrypto(ctx, 100.2, {
    bars: [
      h1Bar(new Date(T_CRYPTO).toISOString(), { open: 100, high: 101, low: 97, close: 100.5 }, "post-entry 1h (clean)"),
      h1Bar(new Date(T_CRYPTO + 3_600_000).toISOString(), { open: 100.5, high: 102, low: 98, close: 101 }, "post-entry 1h (clean)"),
    ],
    nowAt: T_CRYPTO + 2 * 3_600_000,
  }, [pointPrint(T_CRYPTO + 10_000, 100.1, "waiting-interval point (clean)")]);
  const rec = await integratedManualIssue(ctx.deps, input, "demo6-invocation");
  check("old veto would have killed it", oldVeto.publish === false);
  check("corrected veto passes -> issued", rec.status === "issued", `status=${rec.status}: ${rec.outcome?.reason ?? ""}`);
  check("exactly one signal", ctx.store.listSignals().length === 1);
  ctx.store.close();
}

async function demo7(): Promise<void> {
  emit("\n## Demo 7 — genuine setup invalidation -> fail_closed (crypto)");
  emit("Input: the entry print is clean, but a bar inside the REAL decision→entry waiting interval");
  emit("  breaches the final published stop (94). The breach evidence lives in the waiting interval");
  emit("  (moved out of the old speculative step-5 fixture) — test intent preserved: a genuine");
  emit("  invalidation fails closed.");
  emit("Expected path: tick -> runQualificationChecks pass -> entered -> checkWaitingInterval=fail ->");
  emit("  invalidated, gate=waiting-interval-invalidation; reason names the waiting-interval bar and");
  emit("  the final stop; validatePipelineOrder passes (checked stop == published stop).");
  const ctx = makeDeps(T_CRYPTO, dbFile("demo7"));
  const input = integratedCryptoCandidate({
    vetoBars: [clean1h("2026-10-14T01:00:00.000Z", "post-decision 1h (clean)")],
  });
  wireCrypto(ctx, 100.2, null, [
    windowBar(T_CRYPTO, T_CRYPTO + 30_000,
      { open: 99, high: 99.5, low: 93.5, close: 98 }, "waiting-interval 30s bar (breach)"),
  ]);
  const rec = await integratedManualIssue(ctx.deps, input, "demo7-invocation");
  check("invalidated", rec.status === "invalidated");
  check("gate is waiting-interval-invalidation", rec.outcome?.gate === "waiting-interval-invalidation");
  check("reason names the waiting-interval bar and the final stop",
    /waiting-interval 30s bar \(breach\)/.test(rec.outcome?.reason ?? "") && /final published stop 94/.test(rec.outcome?.reason ?? ""));
  check("zero signals", ctx.store.listSignals().length === 0);
  ctx.store.close();
}

async function demo8(): Promise<void> {
  emit("\n## Demo 8 — straddling uncertainty -> uncertain/fail-closed (crypto)");
  emit("Input: a forming 1h candle straddles the REAL decision instant (the handler's run time);");
  emit("  its extreme crossed the stop. The straddle now lives in the waiting interval.");
  emit("Expected path: tick -> entered -> checkWaitingInterval=uncertain -> fail_closed;");
  emit("  the pre-event portion is never treated as a definite breach; the straddle rule is cited.");
  const ctx = makeDeps(T_CRYPTO, dbFile("demo8"));
  const input = integratedCryptoCandidate({
    vetoBars: [clean1h("2026-10-14T01:00:00.000Z", "post-decision 1h (clean)")],
  });
  wireCrypto(ctx, 100.2, null, [
    formingBar("2026-10-14T03:30:00.000Z", "2026-10-14T04:30:00.000Z",
      { open: 99, high: 100, low: 93, close: 98.5 }, "forming 1h (straddles decisionAt)"),
  ]);
  const rec = await integratedManualIssue(ctx.deps, input, "demo8-invocation");
  check("invalidated", rec.status === "invalidated");
  check("gate is waiting-interval-invalidation", rec.outcome?.gate === "waiting-interval-invalidation");
  check("verdict is uncertain (fail-closed)", /uncertain/.test(rec.outcome?.reason ?? ""));
  check("straddle rule cited", /straddles/.test(rec.outcome?.reason ?? ""));
  check("zero signals", ctx.store.listSignals().length === 0);
  ctx.store.close();
}

async function demo9(): Promise<void> {
  emit("\n## Demo 9 — overlapping manual + scheduled calls -> exactly one issuance (equity)");
  emit("Input: qualifying candidate; integratedManualIssue and integratedTick run concurrently");
  emit("  (interleaved, same store, distinct invocation ids).");
  emit("Expected: exactly one signal, one contract, one setup alert, one entry alert;");
  emit("  the loser returns the existing record (no error, no duplicate).");
  const ctx = makeDeps(T_EQUITY, dbFile("demo9"));
  const input = integratedEquityCandidate({ symbol: "CONC" });
  await ingestIntegratedCandidate(ctx.deps, input);
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
    integratedManualIssue(ctx.deps, input, "demo9-invocation-A"),
    integratedTick(ctx.deps),
  ]);
  void tickReport;
  // The qualification race has exactly one winner; the loser returns the
  // accepted state without writing (it may be awaiting-entry while the winner
  // is still observing — the DB converges to exactly-once).
  check("racing calls complete without error (loser returns accepted state)",
    manualRec.status === "issued" || manualRec.status === "awaiting-entry",
    `status=${manualRec.status}`);
  check("exactly one signal", ctx.store.tableCount("signals") === 1, `signals=${ctx.store.tableCount("signals")}`);
  check("exactly one contract", ctx.store.tableCount("contracts") === 1);
  check("exactly one setup alert", ctx.store.listAlerts().filter((a) => a.kind === "setup").length === 1);
  check("exactly one entry alert", ctx.store.listAlerts().filter((a) => a.kind === "entry").length === 1);
  const ticked = ctx.store.getCandidate(issuanceIdentityFor(input))!;
  check("final state issued with the single accepted signal id",
    ticked.status === "issued" && ticked.issuedSignalId === ctx.store.listSignals()[0]!.signalId,
    `status=${ticked.status} signalId=${ticked.issuedSignalId}`);
  ctx.store.close();
}

// ---------------------------------------------------------------------------
async function demo10(): Promise<void> {
  emit("\n## Demo 10 — FINAL ACCEPTANCE: qualify → crash → resume → issue → concurrent loser refused");
  emit("The full repair chain on one DB file, every step logged with the DB state asserted:");
  emit("  (1) qualification commits the durable pending state, then the process 'dies';");
  emit("  (2) a brand-new store on the same file resumes from the DB row → timely valid entry;");
  emit("  (3) waiting-interval veto passes; issuance is immutable;");
  emit("  (4) the paper alert carries SEPARATE enqueue and delivery timestamps;");
  emit("  (5) a conflicting concurrent worker (drift-invalid print after issuance) attempts its");
  emit("      outcome on a second connection — and returns the accepted state unchanged.");
  const path = dbFile("demo10");
  const input = integratedCryptoCandidate({ symbol: "ACC" });
  const candidateId = issuanceIdentityFor(input);

  // ---- phase 1: qualify, then crash before entry observation ----------------
  emit("  phase 1: qualifying, then simulating process termination after the qualification commit");
  const ctx1 = makeDeps(T_CRYPTO, path);
  ctx1.deps.entryFeedFor = (): EntryObservationFeed => {
    throw new Error("simulated crash: process died between qualification commit and entry observation");
  };
  let crashed = false;
  try {
    await integratedManualIssue(ctx1.deps, input, "demo10-invocation-1");
  } catch (e) {
    crashed = (e as Error).message.startsWith("simulated crash");
  }
  check("phase 1 crashed as simulated (after the qualification commit)", crashed);
  const afterCrash = ctx1.store.getCandidate(candidateId)!;
  check("DB state: candidate awaiting-entry", afterCrash.status === "awaiting-entry", `status=${afterCrash.status}`);
  const contractId = afterCrash.contractId!;
  check("DB state: contract id is deterministic", contractId === contractIdFor(candidateId), contractId);
  const row1 = ctx1.store.getContract(contractId)!;
  check("DB state: contract row pending", row1.state === "pending");
  const decisionAt1 = (JSON.parse(row1.contractJson) as { decisionAt: string }).decisionAt;
  emit(`  phase 1 durable state: contract ${contractId}, decisionAt ${decisionAt1}`);
  check("DB state: setup alert enqueued exactly once",
    ctx1.store.listAlerts().filter((a) => a.kind === "setup").length === 1);
  ctx1.store.close(); // process termination: all in-memory state dropped

  // ---- phase 2: restart — new store, same file; tick resumes ----------------
  emit("  phase 2: restart — new DbStore on the same file, clock +60s (window still open)");
  const ctx2 = makeDeps(T_CRYPTO + 60_000, path);
  const feedClock = new MutableClock(T_CRYPTO + 60_000);
  const feed = new ScriptedFeed(
    [{ ts: T_CRYPTO + 90_000, price: 100.2, venue: "binance-spot", availableAt: T_CRYPTO + 90_000 }],
    feedClock,
  );
  ctx2.deps.entryFeedFor = (): EntryObservationFeed => ({
    feed, clock: feedClock, pollIntervalMs: 60_000, maxPolls: 5000,
    advance: (ms: number) => { feedClock.advance(ms); ctx2.clock.advance(ms); },
  });
  ctx2.deps.waitingIntervalEvidenceFor = () => [pointPrint(T_CRYPTO + 60_000, 100.1, "waiting-interval point (clean)")];
  ctx2.deps.postEntryEvidenceFor = (): PostEntryEvidence => ({
    bars: [h1Bar(new Date(T_CRYPTO + 90_000).toISOString(),
      { open: 100, high: 101, low: 97, close: 100.5 }, "post-entry 1h (clean)")],
    nowAt: T_CRYPTO + 3_600_000,
  });
  // Delivery is a separate step with its own timestamp (clock advances 1ms).
  ctx2.deps.deliverAlert = async () => { ctx2.clock.advance(1); };

  const tick2 = await integratedTick(ctx2.deps);
  check("tick resumed the awaiting-entry candidate and issued", tick2.issued.includes(candidateId),
    `issued=[${tick2.issued.join(",")}]`);
  const rec = ctx2.store.getCandidate(candidateId)!;
  check("DB state: candidate issued", rec.status === "issued", `status=${rec.status}`);
  check("contract NOT recreated: same contractId", rec.contractId === contractId, rec.contractId ?? "null");
  const row2 = ctx2.store.getContract(contractId)!;
  check("DB state: contract row entered", row2.state === "entered");
  check("resumed contract keeps the original decisionAt (parsed from the DB row, not rebuilt)",
    (JSON.parse(row2.contractJson) as { decisionAt: string }).decisionAt === decisionAt1);
  check("setup alert NOT re-fired on resume",
    ctx2.store.listAlerts().filter((a) => a.kind === "setup").length === 1);
  const entryAlert = ctx2.store.listAlerts().find((a) => a.kind === "entry")!;
  check("paper alert: enqueuedAt and deliveredAt are separate timestamps",
    entryAlert.enqueuedAt < entryAlert.deliveredAt!,
    `enqueuedAt=${entryAlert.enqueuedAt} deliveredAt=${entryAlert.deliveredAt}`);
  check("paper alert: delivery recorded", entryAlert.deliveryStatus === "delivered");
  const signals = ctx2.store.listSignals();
  check("exactly one signal row (immutable issuance)", signals.length === 1);
  const candidateRowA = JSON.parse(JSON.stringify(rec));
  const contractRowA = JSON.parse(JSON.stringify(row2));
  const signalsA = JSON.parse(JSON.stringify(signals));

  // ---- phase 3: conflicting concurrent worker --------------------------------
  emit("  phase 3: worker B (second DB connection, WAL) attempts the drift-invalid outcome after issuance");
  const storeB = new DbStore(path);
  const depsB: IntegratedDeps = {
    store: storeB, clock: ctx2.clock, config: { freshnessMs: 24 * 3_600_000 },
  };
  const voidedByB = {
    ...(JSON.parse(contractRowA.contractJson) as Record<string, unknown>),
    entryState: "void_drift", voidReason: "B: drift-invalid print arrived after issuance",
  };
  const staleAwaitingB = {
    ...candidateRowA, status: "awaiting-entry" as const,
    outcome: { kind: "awaiting-entry" as const, gate: null, reason: "B's stale pre-issuance view", via: "automatic" as const },
  };
  const norm = (v: unknown): unknown => JSON.parse(JSON.stringify(v)); // node:sqlite rows are null-prototype
  const returnedB = await commitNonEntryOutcome(
    depsB, staleAwaitingB, voidedByB as never, "sig_demo10", contractId,
    "invalidated", "entry-drift", "B: drift-invalid print arrived after issuance", "automatic",
  );
  check("B returned the accepted state unchanged (no error, no write)",
    JSON.stringify(norm(returnedB)) === JSON.stringify(candidateRowA));
  check("final candidate row is exactly A's issued state",
    JSON.stringify(norm(storeB.getCandidate(candidateId))) === JSON.stringify(candidateRowA));
  check("final contract row is exactly A's issued state (still entered, not void_drift)",
    JSON.stringify(norm(storeB.getContract(contractId))) === JSON.stringify(contractRowA) &&
    (storeB.getContract(contractId) as { state: string }).state === "entered");
  check("final signal row is exactly A's issued state",
    JSON.stringify(norm(storeB.listSignals())) === JSON.stringify(signalsA));
  storeB.close();
  ctx2.store.close();
}

// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  emit("# Integrated Issuance Handler — Ten Demonstrations");
  emit("");
  emit("Workstream A (integrated issuance handler) + B (DB persistence) + the 2026-10-13 repair");
  emit("(concurrency guards, late-fetch/stale-print/venue rules, durable awaiting-entry recovery,");
  emit("waiting-interval veto, alert enqueue vs delivery).");
  emit("SANDBOX ONLY: no production issuance, no scheduler enablement, no brokerage.");
  emit("Every demo runs the COMPLETE handler sequence through the REAL DB path");
  emit("(DbStore over node:sqlite: BEGIN IMMEDIATE / COMMIT / ROLLBACK;");
  emit("UNIQUE(identity_hash) + issuance_claim = invocationId).");
  emit("");
  emit("Provenance of the exercised functions:");
  emit("  - runQualificationChecks / checkWaitingInterval: veto/src/waiting-interval.ts");
  emit("    (the corrected veto after the 2026-10-13 split: qualification-time checks at step 5,");
  emit("    the genuine decision\u2192entry veto over the real [decisionAt, entryAt] window at step 9b;");
  emit("    runIssuanceChecks stays exported from veto/src/veto.ts for its own unit tests)");
  emit("  - checkSetupInvalidation / checkPostEntryInvalidation: veto/src/veto.ts");
  emit("    (the ONLY emitter of 'born-dead ...' strings on this path)");
  emit("  - buildPendingContract / observeEntry: entry-v1/src/pending.ts (corrections 2+3;");
  emit("    the in-memory pending registry is gone \u2014 structural validation, durable across restarts)");
  emit("  - EntryWatcher cadence rule (poll < window, correction 4): enforced in the handler's observation loop");
  emit("  - evaluateEquityShortRegime: orchestrator/src/gates/equity-gate-decomposition.ts (retained regime gate)");
  emit("  - evaluateShortRegimeGate: vendored crypto gate (retained regime gate, unchanged semantics)");
  emit("  - persistSignalIssuanceBundle shape: crypto/server/src/issuance-persistence.ts:11 (production control)");
  emit("  - issuanceClaim === invocationId: crypto/server/src/actions.ts:2013-2021 (production claim mechanism)");
  emit("  - db.batch + onConflictDoNothing: equity/server/src/actions.ts:505-513 (production atomic batch)");
  const demos: Array<[string, () => Promise<void>]> = [
    ["demo1", demo1], ["demo2", demo2], ["demo3", demo3],
    ["demo4", demo4], ["demo5", demo5], ["demo6", demo6],
    ["demo7", demo7], ["demo8", demo8], ["demo9", demo9],
    ["demo10", demo10],
  ];
  for (const [tag, fn] of demos) {
    try {
      await fn();
    } catch (e) {
      failures++;
      emit(`  [FAIL] ${tag} threw: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  emit("\n---");
  emit(failures === 0 ? "ALL 10 DEMOS PASSED." : `${failures} CHECK(S) FAILED.`);
  writeFileSync(LOG_PATH, log.join("\n") + "\n", "utf8");
  emit(`\nDemo log written to: ${LOG_PATH}`);
  if (failures > 0) process.exitCode = 1;
}

await main();
