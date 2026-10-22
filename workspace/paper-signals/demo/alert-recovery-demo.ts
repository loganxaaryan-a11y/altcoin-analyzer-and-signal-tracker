// alert-recovery-demo.ts — recoverable alert delivery, demonstrated with a REAL
// process crash between signal issuance and delivery acknowledgement.
//
// SANDBOX ONLY. No production issuance, no scheduler enablement, no brokerage.
// Runs directly under Node >= 22 type-stripping: `node demo/alert-recovery-demo.ts`
// (no compile step needed for this file). It exercises the REAL compiled modules:
//   - orchestrator/dist/... (integrated handler, DbStore — the recoverable
//     delivery machinery: claim-before-send, ack-required marking,
//     recoverUndeliveredAlerts)
// and persists to a REAL file-backed SQLite DB (WAL), so the "restart" is a
// genuinely new process over the same file.
//
// Three modes:
//   node demo/alert-recovery-demo.ts            -> driver: runs phase1 (expects
//                                                the crash), then phase2 (the
//                                                restart + recovery), asserts
//                                                the end state, writes evidence.
//   node demo/alert-recovery-demo.ts phase1     -> issues a signal; the
//                                                deliverAlert hook hands the
//                                                ENTRY alert to the (fake)
//                                                transport, then the process
//                                                CRASHES before the handler
//                                                records the acknowledgement.
//   node demo/alert-recovery-demo.ts phase2     -> fresh process: runs the
//                                                recovery pass, redelivers the
//                                                entry alert exactly once,
//                                                verifies the final DB state.
//
// Evidence: demo/evidence/alert-recovery/ (db, transport log, crash marker,
// per-phase logs, summary.json).

import { spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// --- the real compiled integrated handler ----------------------------------
import { manualClock } from "../orchestrator/dist/paper-signals/orchestrator/src/clock.js";
import { DbStore } from "../orchestrator/dist/paper-signals/orchestrator/src/persistence/db-store.js";
import {
  integratedManualIssue,
  recoverUndeliveredAlerts,
} from "../orchestrator/dist/paper-signals/orchestrator/src/issuance/handler.js";
import type {
  EntryObservationFeed,
  IntegratedDeps,
  PostEntryEvidence,
} from "../orchestrator/dist/paper-signals/orchestrator/src/issuance/handler.js";
import type { AlertRow } from "../orchestrator/dist/paper-signals/orchestrator/src/types.js";
import {
  cryptoPrintFeed,
  h1Bar,
  integratedCryptoCandidate,
} from "../orchestrator/dist/paper-signals/orchestrator/tests/fixtures.js";
import type { EvidenceBar } from "../veto/src/veto.ts";

const DEMO_DIR = dirname(fileURLToPath(import.meta.url));
const EVIDENCE_DIR = resolve(DEMO_DIR, "evidence", "alert-recovery");
const DB_PATH = join(EVIDENCE_DIR, "demo.sqlite");
const TRANSPORT_LOG = join(EVIDENCE_DIR, "transport-log.jsonl");
const CRASH_MARKER = join(EVIDENCE_DIR, "crash-marker.txt");
const SUMMARY_PATH = join(EVIDENCE_DIR, "summary.json");

const T_CRYPTO = Date.parse("2026-10-14T04:00:00.000Z");

function pointPrint(ts: number, price: number, label: string): EvidenceBar {
  return {
    startAt: ts, endAt: ts,
    open: price, high: price, low: price, close: price,
    isClosed: true, granularity: "trade_print", source: "itg-fixture", label,
  };
}

interface Phase1Deps {
  deps: IntegratedDeps;
  store: DbStore;
}

/** Full clean path: qualify -> setup alert -> entry print -> issued. */
function wireCleanPath(store: DbStore, clockMs: number): Phase1Deps {
  const storeRef = store;
  const clock = manualClock(clockMs);
  const setup = cryptoPrintFeed(clockMs, 30_000, 100.2);
  const deps: IntegratedDeps = { store: storeRef, clock, config: { freshnessMs: 24 * 3_600_000 } };
  deps.entryFeedFor = (): EntryObservationFeed => ({
    feed: setup.feed,
    clock: setup.clock,
    pollIntervalMs: 60_000,
    maxPolls: 5000,
    advance: (ms: number) => { setup.clock.advance(ms); clock.advance(ms); },
  });
  deps.waitingIntervalEvidenceFor = () => [
    pointPrint(setup.printTs - 10_000, 100.1, "waiting-interval point (clean)"),
  ];
  deps.postEntryEvidenceFor = (): PostEntryEvidence => ({
    bars: [h1Bar(new Date(setup.printTs).toISOString(),
      { open: 100, high: 101, low: 97, close: 100.5 }, "post-entry 1h (clean)")],
    nowAt: setup.printTs + 3_600_000,
  });
  return { deps, store };
}

function transportLog(line: Record<string, unknown>): void {
  appendFileSync(TRANSPORT_LOG, JSON.stringify(line) + "\n", "utf8");
}

// ---------------------------------------------------------------- phase 1 --
async function phase1(): Promise<void> {
  console.log("[phase1] issuing a signal; the transport will crash before the entry-alert ack is recorded");
  const { deps, store } = wireCleanPath(new DbStore(DB_PATH), T_CRYPTO);
  deps.deliverAlert = async (alert: AlertRow) => {
    if (alert.kind === "setup") {
      transportLog({ phase: 1, alertId: alert.id, kind: alert.kind, event: "transport-accepted" });
      return; // clean return = simulated ack -> setup alert delivered in phase 1
    }
    // ENTRY alert: the fake transport RECEIVES it (logged), then the process
    // dies before the handler can record the acknowledgement. The DB row
    // stays claimed-but-unacknowledged ("sending", attempts=1).
    transportLog({ phase: 1, alertId: alert.id, kind: alert.kind, event: "transport-received" });
    writeFileSync(CRASH_MARKER,
      `crashed after transport hand-off, before ack bookkeeping (alert ${alert.id})\n`, "utf8");
    console.log(`[phase1] transport received entry alert ${alert.id} — CRASHING before the ack is recorded`);
    process.exit(1);
  };
  const input = integratedCryptoCandidate({ symbol: "CRASHDEMO" });
  await integratedManualIssue(deps, input, "demo-phase1");
  // Unreachable: the hook above exits the process on the entry alert.
  store.close();
  throw new Error("[phase1] BUG: expected to crash on the entry alert delivery");
}

// ---------------------------------------------------------------- phase 2 --
async function phase2(): Promise<void> {
  console.log("[phase2] restart: fresh process over the same DB file; running the recovery pass");
  const clock = manualClock(T_CRYPTO + 120_000); // the restart happens 2 min later
  const store = new DbStore(DB_PATH);
  const deps: IntegratedDeps = { store, clock, config: { freshnessMs: 24 * 3_600_000 } };
  const transportSends: string[] = [];
  deps.deliverAlert = async (alert: AlertRow) => {
    transportSends.push(alert.id);
    transportLog({ phase: 2, alertId: alert.id, kind: alert.kind, event: "transport-accepted" });
    return { acknowledged: true, mode: "simulated" as const, ackId: "demo-ack-entry-1" };
  };

  const before = store.listAlerts();
  console.log(`[phase2] alerts in DB before recovery: ${before.map((a) => `${a.kind}=${a.deliveryStatus}`).join(", ")}`);
  const report = await recoverUndeliveredAlerts(deps);
  console.log(`[phase2] recovery report: ${JSON.stringify(report)}`);

  const alerts = store.listAlerts();
  const entryAlert = alerts.find((a) => a.kind === "entry")!;
  const setupAlert = alerts.find((a) => a.kind === "setup")!;
  const summary = {
    recoveryReport: report,
    transportSendsPhase2: transportSends,
    entryAlert: {
      id: entryAlert.id,
      deliveryStatus: entryAlert.deliveryStatus,
      deliveredAt: entryAlert.deliveredAt,
      deliveryMode: entryAlert.deliveryMode,
      ackId: entryAlert.ackId,
      deliveryAttempts: entryAlert.deliveryAttempts,
    },
    setupAlert: {
      id: setupAlert.id,
      deliveryStatus: setupAlert.deliveryStatus,
      deliveryMode: setupAlert.deliveryMode,
      deliveryAttempts: setupAlert.deliveryAttempts,
    },
    signals: store.listSignals().length,
    entryAlerts: alerts.filter((a) => a.kind === "entry").length,
  };
  writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2) + "\n", "utf8");

  // --- the assertions that make this a demonstration, not a story -----------
  const failures: string[] = [];
  const check = (cond: boolean, msg: string): void => { if (!cond) failures.push(msg); };
  check(report.delivered.length === 1 && report.delivered[0] === entryAlert.id,
    `recovery must redeliver exactly the entry alert, got ${JSON.stringify(report.delivered)}`);
  check(report.failed.length === 0, `no alert may fail on recovery, got ${JSON.stringify(report.failed)}`);
  check(transportSends.length === 1 && transportSends[0] === entryAlert.id,
    `the transport must send exactly once on recovery (no duplicate send), got ${JSON.stringify(transportSends)}`);
  check(entryAlert.deliveryStatus === "delivered", `entry alert final status must be delivered, got ${entryAlert.deliveryStatus}`);
  check(entryAlert.deliveredAt !== null, "entry alert deliveredAt must be set");
  check(entryAlert.deliveryMode === "simulated", `sandbox ack must be labeled simulated, got ${entryAlert.deliveryMode}`);
  check(entryAlert.ackId === "demo-ack-entry-1", `ack id must be persisted, got ${entryAlert.ackId}`);
  check(entryAlert.deliveryAttempts === 2,
    `attempts must be 2 (phase-1 claim + recovery claim), got ${entryAlert.deliveryAttempts}`);
  check(setupAlert.deliveryStatus === "delivered" && setupAlert.deliveryAttempts === 1,
    `setup alert was delivered in phase 1 and must not be redelivered: ${setupAlert.deliveryStatus}/${setupAlert.deliveryAttempts}`);
  check(summary.signals === 1, `exactly one signal (no re-issuance on recovery), got ${summary.signals}`);
  check(summary.entryAlerts === 1, `exactly one entry alert row (no duplicate), got ${summary.entryAlerts}`);
  store.close();

  if (failures.length > 0) {
    console.error("[phase2] FAILURES:\n - " + failures.join("\n - "));
    process.exit(2);
  }
  console.log("[phase2] all recovery assertions pass — entry alert redelivered exactly once, final state correct");
}

// ---------------------------------------------------------------- driver ---
function driver(): void {
  rmSync(EVIDENCE_DIR, { recursive: true, force: true });
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const self = fileURLToPath(import.meta.url);

  console.log("=== alert-recovery demo: driver ===");
  const p1 = spawnSync(process.execPath, [self, "phase1"], { stdio: "inherit" });
  if (p1.status !== 1 || !existsSync(CRASH_MARKER)) {
    console.error(`driver: phase1 must exit(1) with a crash marker (status=${p1.status})`);
    process.exit(1);
  }
  console.log("driver: phase1 crashed as designed (exit 1, crash marker written)\n");

  const p2 = spawnSync(process.execPath, [self, "phase2"], { stdio: "inherit" });
  if (p2.status !== 0) {
    console.error(`driver: phase2 failed (status=${p2.status})`);
    process.exit(1);
  }
  console.log("\ndriver: phase2 (restart + recovery) PASS");
  console.log(`evidence: ${EVIDENCE_DIR}`);
  for (const line of readFileSync(TRANSPORT_LOG, "utf8").trim().split("\n")) {
    console.log(`  transport: ${line}`);
  }
}

const mode = process.argv[2];
if (mode === "phase1") await phase1();
else if (mode === "phase2") await phase2();
else driver();
