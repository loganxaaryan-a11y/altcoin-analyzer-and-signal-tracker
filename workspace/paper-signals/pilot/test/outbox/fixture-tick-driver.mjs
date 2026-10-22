/**
 * Fixture tick driver (paper pilot) — PAPER ONLY.
 *
 * Drives a REAL integratedTick through the vendored handler (handler.js
 * v2.1.9, READ-ONLY) against a scratch pilot DB seeded with one
 * awaiting-entry candidate + pending contract. The market-data surface is
 * replaced by LABELED FIXTURE stubs (venue feed, waiting-interval evidence,
 * post-entry evidence) — the stubs stand in for Binance HTTP only; every
 * line of handler/deps/outbox code exercised is the real installed code.
 *
 * Modes:
 *   seed <T>          build scratch DBs and seed the awaiting-entry contract
 *   run  <T> <lane>   run one fixture integratedTick as <lane> (wrapper|watcher)
 *   trig <T> <lane>   wrapper-lane trigger replay: deliverAlert the entry
 *                     alert row currently in the store (mirrors the
 *                     paper-signal-cycle diff -> trigger path, which fires
 *                     for entry alerts independently of which lane committed)
 *
 * The (1b) TRACE uses: seed -> run watcher.
 * Scenario (e) uses:   seed -> (run wrapper || run watcher) concurrently ->
 *                      trig wrapper -> trig watcher.
 */
import { mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDeps, storeOf } from "../../dist/deps.js";
import { EvidenceLog } from "../../dist/evidence.js";
import { integratedTick } from "../../dist/vendor.js";
import { dispatchPending, listEvents, outboxCounts } from "../../dist/entry-outbox.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const PILOT = resolve(HERE, "..", "..");
const PENDING_JS = resolve(
  PILOT, "..", "orchestrator", "dist", "paper-signals", "entry-v1", "src", "pending.js",
);
const { buildPendingContract } = await import(PENDING_JS);

const [mode, T, laneArg] = process.argv.slice(2);
if (!mode || !T) { console.error("usage: fixture-tick-driver.mjs <seed|run|trig> <scratch-dir> [lane]"); process.exit(2); }
mkdirSync(T, { recursive: true });
const lane = laneArg ?? "watcher";

const dbPath = join(T, "pilot.sqlite");
const outboxDbPath = join(T, "outbox.sqlite");
const sendsLog = join(T, "sends.jsonl");
const evidenceDir = join(T, "evidence");
mkdirSync(evidenceDir, { recursive: true });

// Fixture market data (LABELED). Decision 60s before seed; the fixture print
// lands 30s after the decision, inside the 15-min crypto entry window.
//
// Contract-id convention: the vendored handler DERIVES the contract id as
// contractIdFor(candidateId) = `ct_${candidateId}` (handler.js:214) inside
// observeAndSettle and its ownership guard — the seeded row MUST use that
// id or the commit refuses with LostOwnershipError (correct behavior).
const CAND = "cand_trace1";
const CT = "ct_cand_trace1";
const SIG = "sig_trace1";
const SYM = "BTCUSD";
const ENTRY_PRICE = 100;
const STOP = 98.5;
const PRINT_PRICE = 100.05; // drift 0.05% < 1.5% crypto cap
const FIXTURE_VENUE_TRADE_ID = "TRACE-VENUE-TRADE-1";
const FIXTURE_VENUE_SEQ = 42;

const cfg = {
  symbol: SYM, direction: "long", score: 0.62,
  invalidationPctBelowEntry: 0.015, target1PctAboveEntry: 0.02, target2PctAboveEntry: 0.04,
  entryPollIntervalMs: 20000, entryMaxPolls: 40, retryBackoffMs: 60000,
  freshnessMs: 1800000, dbPath, evidenceDir,
};

function buildLaneDeps(laneName, counters) {
  const ev = new EvidenceLog(join(evidenceDir, `driver-${laneName}.jsonl`));
  const deps = buildDeps(cfg, {
    preObserveHoldMs: 0, httpLogPath: join(T, `http-${laneName}.jsonl`),
    outboxDir: join(T, `ob-${laneName}`),
    observedBy: laneName, outboxDbPath, promptSendLogPath: sendsLog, counters,
  }, ev);
  return { deps, ev };
}

/** Seed the awaiting-entry candidate + pending contract via the REAL vendored buildPendingContract. */
function seedOnce() {
  const { deps } = buildLaneDeps("seed", undefined);
  const store = storeOf(deps);
  try {
    if (store.getCandidate(CAND)) {
      console.log(JSON.stringify({ seeded: false, note: "already seeded" }));
      return;
    }
    const nowMs = Date.now();
    const decisionMs = nowMs - 60_000;
    const decisionAt = new Date(decisionMs).toISOString();
    // The real qualification path issues the contract AT the decision
    // instant (cryptoContractInput(decisionAtIso, decisionAtIso)).
    const issuedAt = decisionAt;
    const contract = buildPendingContract(
      { terminal: "crypto", symbol: SYM, candidateId: CAND },
      {
        decisionAt,
        qualificationReason: "fixture seed: labeled fixture contract for the watch-path trace",
        contractInput: {
          terminal: "crypto", signalId: SIG,
          strategyId: "fixture-strategy", strategyVersion: "v1", parameterHash: "fixture-hash",
          decisionAt, decisionClock: "server-utc", decisionPrice: ENTRY_PRICE,
          sourceObservedAt: issuedAt, sourceObservationWindow: null,
          entryRule: "first-post-decision-binance-spot-trade",
          entryVenue: "binance-spot",
          entryWindowOpensAt: decisionAt,
          entryWindowExpiresAt: new Date(decisionMs + 15 * 60_000).toISOString(),
          invalidationPrice: STOP, target1Price: 102, target2Price: 104,
          riskPerUnit: 1.5,
          horizonUnit: "elapsed_days", primaryHorizon: 30,
          evaluatorCompatibility: "fixture",
          issuedBy: "fixture-tick-driver", issuedAt, driftCapPct: 1.5,
        },
      },
    );
    store.saveContract({
      contractId: CT, candidateId: CAND, signalId: SIG,
      state: contract.entryState, contractJson: JSON.stringify(contract), updatedAt: issuedAt,
    });
    const setupAlertAt = issuedAt;
    store.saveCandidate({
      candidateId: CAND, terminal: "crypto", symbol: SYM, coinId: SYM, name: "Bitcoin",
      direction: "long", score: 0.62, entryPrice: ENTRY_PRICE, invalidation: STOP,
      target1: 102, target2: 104, signalDate: new Date(decisionMs).toISOString().slice(0, 10),
      detectedAt: decisionAt, firstSeenAt: decisionAt, lastReassessedAt: setupAlertAt,
      qualifiedAt: setupAlertAt, issuedAt: null, alertedAt: null,
      status: "awaiting-entry",
      outcome: { kind: "awaiting-entry", gate: null, reason: "fixture seed: setup qualified, entry pending", via: "fixture" },
      nextReassessmentAt: null, issuedSignalId: null, delays: null,
      contractId: CT, setupAlertAt, entryObservedAt: null,
      inputs: {
        signalDay: null, historyCloses: [], historyHighs: [],
        currentPrice: ENTRY_PRICE, asOf: issuedAt, vetoBars: [],
      },
    });
    console.log(JSON.stringify({
      seeded: true, candidateId: CAND, contractId: CT, decisionAt,
      windowExpiresAt: new Date(decisionMs + 15 * 60_000).toISOString(),
    }));
  } finally {
    store.close();
  }
}

/** Install the labeled fixture market-data stubs on a real buildDeps. */
function installFixtureMarket(deps, decisionMs) {
  const printTs = decisionMs + 30_000;
  const fixtureNowMs = decisionMs + 35_000;
  const feed = {
    // FIXTURE: stands in for Binance aggTrades HTTP. Serves exactly one
    // eligible print carrying the REAL v2.1.9 print-identity fields.
    latestPrints: async (_sinceTs) => [{
      ts: printTs, price: PRINT_PRICE, venue: "binance-spot",
      venueTradeId: FIXTURE_VENUE_TRADE_ID, venueSeq: FIXTURE_VENUE_SEQ,
    }],
    // FIXTURE: adapter-established coverage bound to the served response.
    historyCoverage: async (sinceTs) => ({
      historyStartMs: sinceTs, venue: "binance-spot", symbol: SYM,
      requestedRange: { sinceTs, toTs: printTs }, receiptMs: fixtureNowMs,
      rawResponseHash: "fixture-hash",
      pagination: { maxResultsPerRequest: 1000, paginationExhausted: true },
    }),
  };
  deps.entryFeedFor = () => ({
    feed,
    clock: { nowMs: () => fixtureNowMs }, // FIXTURE observation clock
    pollIntervalMs: 20000, maxPolls: 40,
    advance: async () => {},
  });
  // FIXTURE: waiting-interval bars — one clean bar, low never touches the stop.
  deps.waitingIntervalEvidenceFor = () => [{
    startAt: decisionMs, endAt: printTs,
    open: 100.0, high: 100.2, low: 99.9, close: 100.1,
    isClosed: true, granularity: "intraday", source: "fixture-waiting-bars", label: "fixture-waiting-bar",
  }];
  // FIXTURE: no post-entry bars — entry validity is provable from the print
  // itself (100.05 > stop 98.5); invalidation is reported insufficient_data.
  deps.postEntryEvidenceFor = () => ({ bars: [], nowAt: fixtureNowMs });
  return { printTs, fixtureNowMs };
}

async function runTick() {
  const counters = { accepted: 0, duplicates: 0, sends: 0 };
  const { deps, ev } = buildLaneDeps(lane, counters);
  const store = storeOf(deps);
  try {
    const cand = store.getCandidate(CAND);
    if (!cand) throw new Error("not seeded — run seed mode first");
    const decisionMs = Date.parse(JSON.parse(store.getContract(CT).contractJson).decisionAt);
    const fx = installFixtureMarket(deps, decisionMs);
    ev.log({ step: "driver-fixture-armed", lane, printTs: fx.printTs, venueTradeId: FIXTURE_VENUE_TRADE_ID, venueSeq: FIXTURE_VENUE_SEQ, note: "FIXTURE market data; handler/deps/outbox code is real" });

    const report = await integratedTick(deps);
    ev.log({ step: "driver-tick-done", issued: report.issued, awaiting: report.awaiting, rejected: report.rejected });

    // Prompt drain (mirrors runWatchOnce): orphans dispatch here.
    const { makePromptSendFn } = await import("../../dist/deps.js");
    const drain = await dispatchPending(outboxDbPath, makePromptSendFn(sendsLog, ev));
    counters.sends += drain.attempted;

    const after = store.getCandidate(CAND);
    const crow = store.getContract(CT);
    const cjson = JSON.parse(crow.contractJson);
    const alerts = store.listAlerts().filter((a) => a.kind === "entry");
    const events = listEvents(outboxDbPath);
    const counts = outboxCounts(outboxDbPath);
    console.log(JSON.stringify({
      lane,
      tick: { processed: report.processed, issued: report.issued, awaiting: report.awaiting, rejected: report.rejected, expired: report.expired },
      candidateStatus: after?.status,
      contractState: crow.state,
      contractFirstPrint: cjson.observationCheckpoint?.firstPrint ?? null,
      entryAlertRows: alerts.map((a) => ({ id: a.id, deliveryStatus: a.deliveryStatus, deliveryMode: a.deliveryMode })),
      outboxEvents: events.map((e) => ({
        event_id: e.event_id, state: e.state, observed_by: e.observed_by, send_count: e.send_count,
        payload: JSON.parse(e.payload_json),
      })),
      outboxCounts: counts,
      counters,
      drainAttempted: drain.attempted,
    }, null, 2));
  } finally {
    store.close();
  }
}

/** Wrapper-lane trigger replay: deliverAlert the store's entry alert as the
 *  wrapper lane's diff->trigger would, independent of which lane committed. */
async function triggerReplay() {
  const counters = { accepted: 0, duplicates: 0, sends: 0 };
  const { deps, ev } = buildLaneDeps(lane, counters);
  const store = storeOf(deps);
  try {
    const alert = store.listAlerts().find((a) => a.kind === "entry");
    if (!alert) throw new Error("no entry alert row in store — run mode must commit first");
    ev.log({ step: "driver-trigger-replay", lane, alertId: alert.id, note: "wrapper-lane trigger replay: deliverAlert for the entry alert, independent lane" });
    const ret = await deps.deliverAlert(alert);
    const counts = outboxCounts(outboxDbPath);
    const events = listEvents(outboxDbPath);
    console.log(JSON.stringify({
      lane, mode: "trigger-replay", alertId: alert.id,
      deliverAlertReturn: ret === undefined ? "void(ack)" : ret,
      counters, outboxEvents: counts.events,
      states: events.map((e) => e.state),
    }));
  } finally {
    store.close();
  }
}

if (mode === "seed") seedOnce();
else if (mode === "run") await runTick();
else if (mode === "trig") await triggerReplay();
else { console.error(`unknown mode ${mode}`); process.exit(2); }
