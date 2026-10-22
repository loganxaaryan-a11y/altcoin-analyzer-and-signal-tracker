/**
 * Paper pilot driver (Workstream D) — PAPER ONLY.
 *
 * Commands:
 *   ingest   build one candidate from the live read-only venue quote and ingest it
 *   tick     run ONE scheduled tick (integratedTick): pending/deferred-due +
 *            awaiting-entry resume from the DB. A scheduler/cron invokes this.
 *   watch    the WATCH-ONLY entry worker: one tick (no ingest, no
 *            re-qualification, no timestamp resets) with ENTRY_CONFIRMED
 *            routed through the SHARED outbox + PROMPT dispatch. This is what
 *            the 5-min paper-pilot-watcher cron invokes.
 *   run      ingest + tick in one process
 *   loop     scheduled-tick loop: tick every --interval-ms until SIGTERM
 *   status   dump candidate / signal / contract / alert rows from the DB
 *
 * Env overrides:
 *   PILOT_DB, PILOT_EVIDENCE_DIR, PILOT_CYCLE_ID, PILOT_MAX_POLLS,
 *   PILOT_POLL_MS, PILOT_PRE_OBSERVE_HOLD_MS (demo-harness timing control),
 *   PILOT_LOOP_INTERVAL_MS
 *
 * No orders, no brokerage, no production code: the only network calls are
 * GETs against the Binance.US public market-data endpoints (see binance.ts
 * allowlist). Every artifact is labeled paper.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ingestIntegratedCandidate, integratedTick } from "./vendor.js";
import { buildDeps, storeOf, type PilotConfig } from "./deps.js";
import { runWatchOnce } from "./entry-worker.js";
import { EvidenceLog, utcStamp } from "./evidence.js";
import { snapshotInputs } from "./binance.js";
import type { AlertRow, PaperCandidateInput } from "./shims.js";

const PILOT_ROOT = resolve(new URL(".", import.meta.url).pathname, "..");
const CONFIG_PATH = join(PILOT_ROOT, "config.json");

function loadConfig(): PilotConfig {
  const raw = JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as Record<string, unknown>;
  const evidenceDir = process.env.PILOT_EVIDENCE_DIR ?? join(PILOT_ROOT, String(raw.evidenceDir ?? "evidence"));
  return {
    symbol: String(raw.symbol ?? "BTCUSD"),
    direction: (raw.direction as "long" | "short") ?? "long",
    score: Number(raw.score ?? 0.62),
    invalidationPctBelowEntry: Number(raw.invalidationPctBelowEntry ?? 0.015),
    target1PctAboveEntry: Number(raw.target1PctAboveEntry ?? 0.02),
    target2PctAboveEntry: Number(raw.target2PctAboveEntry ?? 0.04),
    entryPollIntervalMs: Number(process.env.PILOT_POLL_MS ?? raw.entryPollIntervalMs ?? 20000),
    entryMaxPolls: Number(process.env.PILOT_MAX_POLLS ?? raw.entryMaxPolls ?? 40),
    retryBackoffMs: Number(raw.retryBackoffMs ?? 60000),
    freshnessMs: Number(raw.freshnessMs ?? 1800000),
    dbPath: process.env.PILOT_DB ?? join(PILOT_ROOT, String(raw.dbPath ?? "data/paper-pilot.sqlite")),
    evidenceDir,
  };
}

function newEvidence(cfg: PilotConfig): { ev: EvidenceLog; cycleId: string; httpLogPath: string; outboxDir: string } {
  const cycleId = process.env.PILOT_CYCLE_ID ?? `cycle-${utcStamp()}`;
  const ev = new EvidenceLog(join(cfg.evidenceDir, `${cycleId}.jsonl`));
  const httpLogPath = join(cfg.evidenceDir, `http-calls-${cycleId}.jsonl`);
  const outboxDir = join(cfg.evidenceDir, `alert-outbox-${cycleId}`);
  return { ev, cycleId, httpLogPath, outboxDir };
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * The ONE shared durable outbox both lanes use. The wrapper lane
 * (issuance/tick) and the watch-only entry worker MUST point at the same
 * file — uniqueness on (contract_id, event_type, event_version) is what
 * makes the first observer win exactly once.
 */
function sharedOutboxPaths(): { outboxDbPath: string; promptSendLogPath: string } {
  return {
    outboxDbPath: process.env.OUTBOX_DB ?? join(PILOT_ROOT, "delivery", "entry-outbox.sqlite"),
    promptSendLogPath: process.env.PROMPT_SEND_LOG ?? join(PILOT_ROOT, "delivery", "prompt-send-log.jsonl"),
  };
}

async function cmdIngest(): Promise<void> {
  const cfg = loadConfig();
  const { ev, cycleId, httpLogPath, outboxDir } = newEvidence(cfg);
  const deps = buildDeps(cfg, { preObserveHoldMs: Number(process.env.PILOT_PRE_OBSERVE_HOLD_MS ?? 0), httpLogPath, outboxDir, observedBy: process.env.PILOT_OBSERVED_BY ?? "wrapper", ...sharedOutboxPaths() }, ev);
  try {
    const nowMs = Date.now();
    const snap = await snapshotInputs(cfg.symbol, nowMs);
    const entryPrice = snap.currentPrice;
    const input: PaperCandidateInput = {
      terminal: "crypto",
      symbol: cfg.symbol,
      coinId: cfg.symbol,
      name: "Bitcoin",
      direction: cfg.direction,
      score: cfg.score,
      entryPrice,
      invalidation: round2(entryPrice * (1 - cfg.invalidationPctBelowEntry)),
      target1: round2(entryPrice * (1 + cfg.target1PctAboveEntry)),
      target2: round2(entryPrice * (1 + cfg.target2PctAboveEntry)),
      signalDate: snap.signalDay?.day ?? new Date(nowMs).toISOString().slice(0, 10),
      detectedAt: new Date(nowMs).toISOString(),
      source: "watchlist",
      inputs: {
        signalDay: snap.signalDay ? { ...snap.signalDay, source: "binance.us klines 1d" } : null,
        historyCloses: snap.historyCloses,
        historyHighs: snap.historyHighs,
        currentPrice: snap.currentPrice,
        asOf: snap.asOf,
        vetoBars: snap.vetoBars,
      },
    };
    const rec = await ingestIntegratedCandidate(deps, input);
    ev.log({ step: "candidate-ingested", cycleId, candidateId: rec.candidateId, symbol: rec.symbol, direction: rec.direction, entryPrice: rec.entryPrice, invalidation: rec.invalidation, score: rec.score, signalDate: rec.signalDate, detectedAt: rec.detectedAt, status: rec.status });
    console.log(JSON.stringify({ cycleId, candidateId: rec.candidateId, status: rec.status, entryPrice: rec.entryPrice, invalidation: rec.invalidation }));
  } finally {
    storeOf(deps).close();
  }
}

function summarizeTick(deps: ReturnType<typeof buildDeps>, report: Awaited<ReturnType<typeof integratedTick>>, ev: EvidenceLog): void {
  const store = storeOf(deps);
  ev.log({ step: "tick-report", at: report.at, processed: report.processed, issued: report.issued, rejected: report.rejected, deferred: report.deferred, expired: report.expired, awaiting: report.awaiting });
  for (const cid of report.processed) {
    const c = store.getCandidate(cid);
    if (!c) continue;
    ev.log({
      step: "candidate-final-state", candidateId: cid, status: c.status,
      outcomeKind: c.outcome?.kind ?? null, gate: c.outcome?.gate ?? null,
      reason: c.outcome?.reason ?? null, via: c.outcome?.via ?? null,
      contractId: c.contractId, setupAlertAt: c.setupAlertAt, entryObservedAt: c.entryObservedAt,
      issuedSignalId: c.issuedSignalId, delays: c.delays,
    });
  }
  const alerts: AlertRow[] = store.listAlerts();
  for (const a of alerts) {
    ev.log({ step: "alert-row", alertId: a.id, kind: a.kind, signalId: a.signalId, candidateId: a.candidateId, enqueuedAt: a.enqueuedAt, deliveredAt: a.deliveredAt, deliveryStatus: a.deliveryStatus });
  }
  for (const s of store.listSignals()) {
    const contract = s.contractId ? store.getContract(s.contractId) : null;
    ev.log({ step: "signal-row", signalId: s.signalId, candidateId: s.candidateId, contractId: s.contractId, contractState: contract?.state ?? null, issuedAt: s.issuedAt, alertedAt: s.alertedAt, gateSummary: s.gateSummary });
  }
  // Persisted-rows snapshot for the evidence bundle.
  const rowsPath = join(loadConfig().evidenceDir, `db-rows-${report.at.replace(/[:.]/g, "-")}.json`);
  const rows = {
    paper: true,
    at: report.at,
    candidates: store.listCandidates(),
    signals: store.listSignals(),
    alerts: store.listAlerts(),
    contracts: store.listCandidates().map((c) => (c.contractId ? store.getContract(c.contractId) : null)).filter(Boolean),
  };
  writeFileSync(rowsPath, JSON.stringify(rows, null, 2));
  ev.log({ step: "db-rows-snapshot", path: rowsPath });
}

async function cmdTick(): Promise<void> {
  const cfg = loadConfig();
  const { ev, cycleId, httpLogPath, outboxDir } = newEvidence(cfg);
  const counters = { accepted: 0, duplicates: 0, sends: 0 };
  const deps = buildDeps(cfg, {
    preObserveHoldMs: Number(process.env.PILOT_PRE_OBSERVE_HOLD_MS ?? 0),
    httpLogPath, outboxDir,
    observedBy: process.env.PILOT_OBSERVED_BY ?? "wrapper",
    counters,
    ...sharedOutboxPaths(),
  }, ev);
  try {
    ev.log({ step: "tick-begin", cycleId, note: "scheduled tick: picks up due pending/deferred/awaiting-entry candidates from the DB" });
    const report = await integratedTick(deps);
    summarizeTick(deps, report, ev);
    console.log(JSON.stringify({ cycleId, at: report.at, processed: report.processed.length, issued: report.issued, awaiting: report.awaiting, rejected: report.rejected, expired: report.expired, deferred: report.deferred, outbox: counters }));
  } finally {
    storeOf(deps).close();
  }
}

/**
 * watch — the watch-only entry worker (one bounded run).
 * Same tick as `tick` (DB resume only, no ingest), but tagged observedBy=
 * "watcher", and ENTRY_CONFIRMED events route through the SHARED outbox
 * with PROMPT dispatch (claim-before-send) instead of waiting for the
 * 15-min delivery sweep. This is what the 5-min paper-pilot-watcher cron
 * should invoke. Paper only.
 */
async function cmdWatch(): Promise<void> {
  const cfg = loadConfig();
  const report = await runWatchOnce({ cfg, pilotRoot: PILOT_ROOT, observedBy: "watcher" });
  console.log(JSON.stringify(report));
}

async function cmdStatus(): Promise<void> {
  const cfg = loadConfig();
  const deps = buildDeps(cfg, { preObserveHoldMs: 0, httpLogPath: join(cfg.evidenceDir, "http-calls-status.jsonl"), outboxDir: join(cfg.evidenceDir, "alert-outbox-status"), observedBy: "status-probe", ...sharedOutboxPaths() }, new EvidenceLog(join(cfg.evidenceDir, "status-probe.jsonl")));
  const store = storeOf(deps);
  try {
    for (const c of store.listCandidates()) {
      const contract = c.contractId ? store.getContract(c.contractId) : null;
      console.log(`candidate ${c.candidateId} ${c.symbol} ${c.direction} status=${c.status} gate=${c.outcome?.gate ?? "-"} contract=${c.contractId ?? "-"}(${contract?.state ?? "-"}) setupAlertAt=${c.setupAlertAt ?? "-"} entryObservedAt=${c.entryObservedAt ?? "-"} signal=${c.issuedSignalId ?? "-"}`);
    }
    for (const a of store.listAlerts()) {
      console.log(`alert ${a.id} kind=${a.kind} enqueued=${a.enqueuedAt} delivered=${a.deliveredAt ?? "-"} status=${a.deliveryStatus}`);
    }
    for (const s of store.listSignals()) {
      console.log(`signal ${s.signalId} issued=${s.issuedAt} alerted=${s.alertedAt ?? "-"}`);
    }
    if (store.listCandidates().length === 0) console.log("(no candidates in DB)");
  } finally {
    store.close();
  }
}

async function cmdLoop(): Promise<void> {
  const cfg = loadConfig();
  const intervalMs = Number(process.env.PILOT_LOOP_INTERVAL_MS ?? 60000);
  console.log(JSON.stringify({ paper: true, msg: "scheduled-tick loop started", intervalMs, pid: process.pid }));
  let stopped = false;
  const stop = (): void => { stopped = true; };
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  while (!stopped) {
    const { ev, cycleId, httpLogPath, outboxDir } = newEvidence(cfg);
    const deps = buildDeps(cfg, { preObserveHoldMs: 0, httpLogPath, outboxDir, observedBy: process.env.PILOT_OBSERVED_BY ?? "watcher", ...sharedOutboxPaths() }, ev);
    try {
      ev.log({ step: "scheduled-tick-begin", cycleId, intervalMs });
      const report = await integratedTick(deps);
      summarizeTick(deps, report, ev);
      console.log(JSON.stringify({ cycleId, at: report.at, issued: report.issued.length, awaiting: report.awaiting.length, rejected: report.rejected.length }));
    } catch (err) {
      ev.log({ step: "scheduled-tick-error", error: String(err) });
      console.error(JSON.stringify({ error: String(err) }));
    } finally {
      storeOf(deps).close();
    }
    if (!stopped) await new Promise((r) => setTimeout(r, intervalMs));
  }
  console.log(JSON.stringify({ paper: true, msg: "scheduled-tick loop stopped" }));
}

async function main(): Promise<void> {
  const cmd = process.argv[2];
  if (cmd === "ingest") return cmdIngest();
  if (cmd === "tick") return cmdTick();
  if (cmd === "watch") return cmdWatch();
  if (cmd === "run") {
    // One cycle id across ingest + tick in this process.
    process.env.PILOT_CYCLE_ID = process.env.PILOT_CYCLE_ID ?? `cycle-${utcStamp()}`;
    await cmdIngest();
    return cmdTick();
  }
  if (cmd === "loop") return cmdLoop();
  if (cmd === "status") return cmdStatus();
  console.error("usage: pilot.js <ingest|tick|watch|run|loop|status>");
  process.exit(2);
}

main().catch((err) => {
  console.error(JSON.stringify({ fatal: String(err?.stack ?? err) }));
  process.exit(1);
});
