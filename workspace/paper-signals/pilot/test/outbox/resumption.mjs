/**
 * Resumption test (paper pilot) — PAPER ONLY. TEST records only.
 *
 * Proves the watch-only entry worker RESUMES a pending contract after a
 * simulated interruption instead of restarting observation:
 *
 *   seed  -> TICK 1 (interruption): the venue feed serves ONE wrong-venue
 *            print (skipped, never entered) then goes quiet. The tick finds
 *            nothing eligible, exhausts its poll budget, exits. The contract
 *            stays pending / awaiting-entry; the observation checkpoint
 *            (highWaterTs) persists on the contract row.
 *   TICK 2 (recovery): the feed serves the eligible entry print. The tick
 *            must resume FROM the persisted checkpoint (first sinceTs ==
 *            tick-1 highWaterTs, NOT decisionMs-1), confirm the entry, and
 *            route exactly one outbox event (observed_by=watcher).
 *   TICK 3 (idempotency): no duplicate outbox event, no re-entry.
 *
 * All ids are TEST- prefixed. Scratch DBs only — nothing here touches the
 * deployed artifact, the production ledger, or any metric cohort.
 *
 * Usage: node test/outbox/resumption.mjs <scratch-dir>
 * Prints [pass|fail] lines + JSON {pass, results}; exits 0/1.
 */
import { mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PILOT = resolve(HERE, "..", "..");
const PENDING_JS = resolve(PILOT, "..", "orchestrator", "dist", "paper-signals", "entry-v1", "src", "pending.js");
const { buildPendingContract } = await import(PENDING_JS);
const { buildDeps, storeOf, makePromptSendFn } = await import(join(PILOT, "dist", "deps.js"));
const { EvidenceLog } = await import(join(PILOT, "dist", "evidence.js"));
const { integratedTick } = await import(join(PILOT, "dist", "vendor.js"));
const { dispatchPending, listEvents } = await import(join(PILOT, "dist", "entry-outbox.js"));

const T = process.argv[2];
if (!T) { console.error("usage: resumption.mjs <scratch-dir>"); process.exit(2); }
mkdirSync(T, { recursive: true });

const dbPath = join(T, "pilot.sqlite");
const outboxDbPath = join(T, "outbox.sqlite");
const sendsLog = join(T, "sends.jsonl");
const evidenceDir = join(T, "evidence");
mkdirSync(evidenceDir, { recursive: true });

// TEST-labeled ids. Contract id MUST be ct_<candidateId> (handler derives it).
const CAND = "TEST-cand_resume1";
const CT = "ct_TEST-cand_resume1";
const SIG = "TEST-sig_resume1";
const SYM = "BTCUSD";
const ENTRY_PRICE = 100;
const STOP = 98.5;
const WRONG_VENUE_TS_OFF = 10_000;   // wrong-venue print at decision+10s
const ENTRY_TS_OFF = 30_000;         // eligible print at decision+30s
const CLOCK_OFF = 35_000;            // fixture observation clock

const cfg = {
  symbol: SYM, direction: "long", score: 0.62,
  invalidationPctBelowEntry: 0.015, target1PctAboveEntry: 0.02, target2PctAboveEntry: 0.04,
  entryPollIntervalMs: 20000, entryMaxPolls: 40, retryBackoffMs: 2000, // TEST: short backoff so tick 2 runs after a 2.5s sleep
  freshnessMs: 1800000, dbPath, evidenceDir,
};

const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
const check = (name, cond, detail) => {
  results.push({ name, pass: !!cond, detail });
  console.log(`[${cond ? "pass" : "fail"}] ${name} — ${detail}`);
};

function seedOnce() {
  const ev = new EvidenceLog(join(evidenceDir, "driver-seed.jsonl"));
  const deps = buildDeps(cfg, {
    preObserveHoldMs: 0, httpLogPath: join(T, "http-seed.jsonl"),
    outboxDir: join(T, "ob-seed"), observedBy: "seed",
    outboxDbPath, promptSendLogPath: sendsLog, counters: undefined,
  }, ev);
  const store = storeOf(deps);
  try {
    if (store.getCandidate(CAND)) return Date.parse(JSON.parse(store.getContract(CT).contractJson).decisionAt);
    const nowMs = Date.now();
    const decisionMs = nowMs - 60_000;
    const decisionAt = new Date(decisionMs).toISOString();
    const issuedAt = decisionAt;
    const contract = buildPendingContract(
      { terminal: "crypto", symbol: SYM, candidateId: CAND },
      {
        decisionAt,
        qualificationReason: "TEST resumption: labeled fixture contract for the watch-path resumption trace",
        contractInput: {
          terminal: "crypto", signalId: SIG,
          strategyId: "TEST-strategy", strategyVersion: "v1", parameterHash: "TEST-hash",
          decisionAt, decisionClock: "server-utc", decisionPrice: ENTRY_PRICE,
          sourceObservedAt: issuedAt, sourceObservationWindow: null,
          entryRule: "first-post-decision-binance-spot-trade",
          entryVenue: "binance-spot",
          entryWindowOpensAt: decisionAt,
          entryWindowExpiresAt: new Date(decisionMs + 15 * 60_000).toISOString(),
          invalidationPrice: STOP, target1Price: 102, target2Price: 104,
          riskPerUnit: 1.5,
          horizonUnit: "elapsed_days", primaryHorizon: 30,
          evaluatorCompatibility: "TEST-fixture",
          issuedBy: "resumption.mjs", issuedAt, driftCapPct: 1.5,
        },
      },
    );
    store.saveContract({
      contractId: CT, candidateId: CAND, signalId: SIG,
      state: contract.entryState, contractJson: JSON.stringify(contract), updatedAt: issuedAt,
    });
    store.saveCandidate({
      candidateId: CAND, terminal: "crypto", symbol: SYM, coinId: SYM, name: "Bitcoin",
      direction: "long", score: 0.62, entryPrice: ENTRY_PRICE, invalidation: STOP,
      target1: 102, target2: 104, signalDate: new Date(decisionMs).toISOString().slice(0, 10),
      detectedAt: decisionAt, firstSeenAt: decisionAt, lastReassessedAt: issuedAt,
      qualifiedAt: issuedAt, issuedAt: null, alertedAt: null,
      status: "awaiting-entry",
      outcome: { kind: "awaiting-entry", gate: null, reason: "TEST resumption seed: setup qualified, entry pending", via: "TEST" },
      nextReassessmentAt: null, issuedSignalId: null, delays: null,
      contractId: CT, setupAlertAt: issuedAt, entryObservedAt: null,
      inputs: { signalDay: null, historyCloses: [], historyHighs: [], currentPrice: ENTRY_PRICE, asOf: issuedAt, vetoBars: [] },
    });
    return decisionMs;
  } finally { store.close(); }
}

/**
 * Install the labeled fixture market-data stubs.
 * mode "interrupt": one wrong-venue print (skipped, never entered) then quiet.
 * mode "recover":   the eligible entry print (served only for ts > sinceTs).
 * Records every sinceTs the feed is polled with.
 */
function installFixtureMarket(deps, decisionMs, mode, sinceTsLog) {
  const fixtureNowMs = decisionMs + CLOCK_OFF;
  const wrongPrint = {
    ts: decisionMs + WRONG_VENUE_TS_OFF, price: 100.02, venue: "TEST-wrong-venue",
    venueTradeId: "TEST-VENUE-TRADE-WRONG-1", venueSeq: 7,
  };
  const entryPrint = {
    ts: decisionMs + ENTRY_TS_OFF, price: 100.05, venue: "binance-spot",
    venueTradeId: "TEST-VENUE-TRADE-ENTRY-1", venueSeq: 9,
  };
  const feed = {
    latestPrints: async (sinceTs) => {
      sinceTsLog.push(sinceTs);
      const out = [];
      if (mode === "interrupt" && sinceTs < wrongPrint.ts) out.push(wrongPrint);
      if (mode === "recover" && sinceTs < entryPrint.ts) out.push(entryPrint);
      return out;
    },
    historyCoverage: async (sinceTs) => ({
      historyStartMs: sinceTs, venue: "binance-spot", symbol: SYM,
      requestedRange: { sinceTs, toTs: decisionMs + ENTRY_TS_OFF }, receiptMs: fixtureNowMs,
      rawResponseHash: "TEST-fixture-hash",
      pagination: { maxResultsPerRequest: 1000, paginationExhausted: true },
    }),
  };
  deps.entryFeedFor = () => ({
    feed,
    clock: { nowMs: () => fixtureNowMs },
    pollIntervalMs: 20000, maxPolls: 40,
    advance: async () => {},
  });
  deps.waitingIntervalEvidenceFor = () => [{
    startAt: decisionMs, endAt: decisionMs + ENTRY_TS_OFF,
    open: 100.0, high: 100.2, low: 99.9, close: 100.1,
    isClosed: true, granularity: "intraday", source: "TEST-fixture-waiting-bars", label: "TEST-waiting-bar",
  }];
  deps.postEntryEvidenceFor = () => ({ bars: [], nowAt: fixtureNowMs });
}

async function runTick(lane, mode) {
  const counters = { accepted: 0, duplicates: 0, sends: 0 };
  const ev = new EvidenceLog(join(evidenceDir, `driver-${lane}-${mode}.jsonl`));
  const deps = buildDeps(cfg, {
    preObserveHoldMs: 0, httpLogPath: join(T, `http-${lane}-${mode}.jsonl`),
    outboxDir: join(T, `ob-${lane}-${mode}`), observedBy: lane,
    outboxDbPath, promptSendLogPath: sendsLog, counters,
  }, ev);
  const store = storeOf(deps);
  const sinceTsLog = [];
  try {
    const cand = store.getCandidate(CAND);
    if (!cand) throw new Error("not seeded");
    const decisionMs = Date.parse(JSON.parse(store.getContract(CT).contractJson).decisionAt);
    installFixtureMarket(deps, decisionMs, mode, sinceTsLog);
    const report = await integratedTick(deps);
    const { makePromptSendFn: mpsf } = await import(join(PILOT, "dist", "deps.js"));
    const drain = await dispatchPending(outboxDbPath, mpsf(sendsLog, ev));
    counters.sends += drain.attempted;
    const after = store.getCandidate(CAND);
    const crow = store.getContract(CT);
    const cjson = JSON.parse(crow.contractJson);
    const alerts = store.listAlerts().filter((a) => a.kind === "entry");
    const events = listEvents(outboxDbPath);
    return {
      lane, mode, decisionMs, sinceTsLog,
      tick: { processed: report.processed, issued: report.issued, awaiting: report.awaiting, rejected: report.rejected },
      candidateStatus: after?.status, candidateQualifiedAt: after?.qualifiedAt,
      contractState: crow.state,
      checkpoint: cjson.observationCheckpoint ?? null,
      entryAlertRows: alerts.length,
      outboxEvents: events.map((e) => ({ event_id: e.event_id, state: e.state, observed_by: e.observed_by, payload: JSON.parse(e.payload_json) })),
      counters,
    };
  } finally { store.close(); }
}

const decisionMs = seedOnce();
const qualifiedAt0 = (() => {
  const ev = new EvidenceLog(join(evidenceDir, "driver-read.jsonl"));
  const deps = buildDeps(cfg, { preObserveHoldMs: 0, httpLogPath: join(T, "http-read.jsonl"), outboxDir: join(T, "ob-read"), observedBy: "read", outboxDbPath, promptSendLogPath: sendsLog }, ev);
  const s = storeOf(deps);
  try { return s.getCandidate(CAND)?.qualifiedAt; } finally { s.close(); }
})();

// TICK 1 — simulated interruption: feed serves one wrong-venue print, then quiet.
const t1 = await runTick("watcher", "interrupt");
check("t1.interrupt candidate still awaiting-entry", t1.candidateStatus === "awaiting-entry", `status=${t1.candidateStatus}`);
check("t1.interrupt contract still pending", t1.contractState === "pending", `state=${t1.contractState}`);
check("t1.interrupt checkpoint persisted + advanced by the served print",
  t1.checkpoint?.highWaterTs === decisionMs + WRONG_VENUE_TS_OFF,
  `highWaterTs=${t1.checkpoint?.highWaterTs} expected=${decisionMs + WRONG_VENUE_TS_OFF} polls=${t1.checkpoint?.polls}`);
check("t1.interrupt no outbox events, no entry alerts",
  t1.outboxEvents.length === 0 && t1.entryAlertRows === 0,
  `outbox=${t1.outboxEvents.length} alerts=${t1.entryAlertRows}`);

// TICK 2 — recovery: feed serves the eligible print. Must RESUME from the checkpoint.
// (sleep past the TEST retryBackoffMs so the reassessment is due, like the 5-min cron would be)
await sleepMs(2500);
const t2 = await runTick("watcher", "recover");
const firstSinceTs = t2.sinceTsLog[0];
check("t2.recover resumed from checkpoint (not restarted)",
  firstSinceTs === decisionMs + WRONG_VENUE_TS_OFF,
  `first sinceTs=${firstSinceTs} expected=${decisionMs + WRONG_VENUE_TS_OFF} (decisionMs-1 would be ${decisionMs - 1})`);
check("t2.recover contract entered", t2.contractState === "entered", `state=${t2.contractState}`);
check("t2.recover candidate issued", t2.candidateStatus === "issued", `status=${t2.candidateStatus}`);
check("t2.recover no re-qualification", t2.candidateQualifiedAt === qualifiedAt0, `qualifiedAt unchanged=${t2.candidateQualifiedAt === qualifiedAt0}`);
check("t2.recover exactly one outbox event, watcher-observed",
  t2.outboxEvents.length === 1 && t2.outboxEvents[0].observed_by === "watcher",
  `events=${t2.outboxEvents.length} observed_by=${t2.outboxEvents[0]?.observed_by}`);
check("t2.recover event binds the real venue trade identity",
  t2.outboxEvents[0]?.payload?.entry_venue_trade_id === "TEST-VENUE-TRADE-ENTRY-1",
  `venue_trade_id=${t2.outboxEvents[0]?.payload?.entry_venue_trade_id}`);

// TICK 3 — idempotency: nothing new.
await sleepMs(2500);
const t3 = await runTick("watcher", "recover");
check("t3.idempotent no duplicate outbox event", t3.outboxEvents.length === 1, `events=${t3.outboxEvents.length}`);
check("t3.idempotent contract still entered once", t3.contractState === "entered", `state=${t3.contractState}`);

const failed = results.filter((r) => !r.pass).length;
console.log(JSON.stringify({ pass: failed === 0, failed, results }, null, 2));
process.exit(failed === 0 ? 0 : 1);
