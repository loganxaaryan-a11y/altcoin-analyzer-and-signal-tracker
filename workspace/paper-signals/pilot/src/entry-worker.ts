/**
 * Watch-only entry worker (paper pilot).
 *
 * PAPER ONLY. No brokerage, no orders. No model changes.
 *
 * What it does:
 *   1. Runs ONE integratedTick against the durable SQLite store — the SAME
 *      tick the 5-min paper-pilot-watcher cron runs. It resumes persisted
 *      awaiting-entry contracts from their stored rows (original entry
 *      windows, persisted observation checkpoints) and performs bounded
 *      entry observation (poll 20s << 15-min crypto window, maxPolls 40).
 *   2. Any ENTRY_CONFIRMED observed by this tick is routed through the SHARED
 *      transactional entry transition + durable outbox (entry-outbox.ts) —
 *      the same module the wrapper lane uses. First observer wins; the loser
 *      gets a duplicate refusal and never sends.
 *   3. Dispatches due outbox events PROMPTLY (claim-before-send) instead of
 *      waiting for the next 15-min delivery sweep.
 *
 * What it NEVER does (watch-only invariants):
 *   - never ingests candidates (no ingest, no qualification re-run);
 *   - never re-runs qualification for awaiting-entry contracts: the vendored
 *     processIntegratedCandidate branches awaiting-entry → resumeAwaitingEntry,
 *     bypassing runQualificationChecks entirely (handler.js:1554);
 *   - never resets timestamps: decisionAt / entryWindowOpensAt /
 *     entryWindowExpiresAt are read from the persisted contract row
 *     (observeEntryPhase parses pending.entryWindowOpensAt/ExpiresAt and
 *     pending.decisionAt, handler.js:626-630); the observation checkpoint
 *     resumes from the row's stored checkpoint via readObservationCheckpoint
 *     (handler.js:1374), never reset blindly;
 *   - never treats poll-budget exhaustion as expiry: the candidate keeps
 *     awaiting-entry with nextReassessmentAt (commitPollBudgetOutcome,
 *     handler.js:1163-1177).
 *
 * Why this path exists: the issuance wrapper (paper-signal-cycle) diffs
 * deployed alert rows in its post-snapshot and fires one cron.run per batch —
 * it cannot observe writes committed AFTER it returns. Entry prints arriving
 * in (post-snapshot, decisionAt+15min] are invisible to the wrapper. This
 * worker ticks continuously and observes the persisted contracts through
 * their original windows, closing that gap.
 */
import { join } from "node:path";
import { integratedTick } from "./vendor.js";
import { buildDeps, storeOf, makePromptSendFn, type PilotConfig, type PilotOptions } from "./deps.js";
import { dispatchPending, listEvents } from "./entry-outbox.js";
import { EvidenceLog, utcStamp } from "./evidence.js";

export interface WatchRunOptions {
  cfg: PilotConfig;
  pilotRoot: string;
  /** "watcher" — recorded as observed_by on outbox events this run accepts. */
  observedBy?: string;
  cycleId?: string;
}

export interface WatchReport {
  paper: true;
  worker: "watch-only-entry-worker";
  cycleId: string;
  at: string;
  observedBy: string;
  tick: { processed: number; issued: string[]; awaiting: string[]; rejected: number; expired: number; deferred: number };
  outbox: {
    acceptedTransitions: number;
    duplicateRefusals: number;
    sendsAttempted: number;
    byState: Record<string, number>;
  };
}

export async function runWatchOnce(opts: WatchRunOptions): Promise<WatchReport> {
  const { cfg, pilotRoot } = opts;
  const observedBy = opts.observedBy ?? "watcher";
  const cycleId = opts.cycleId ?? `watch-${utcStamp()}`;
  const outboxDbPath = process.env.OUTBOX_DB ?? join(pilotRoot, "delivery", "entry-outbox.sqlite");
  const promptSendLogPath = process.env.PROMPT_SEND_LOG ?? join(pilotRoot, "delivery", "prompt-send-log.jsonl");
  const ev = new EvidenceLog(join(cfg.evidenceDir, `${cycleId}.jsonl`));
  const counters = { accepted: 0, duplicates: 0, sends: 0 };
  const pilotOpts: PilotOptions = {
    preObserveHoldMs: 0, // watch-only: no demo-harness timing games
    httpLogPath: join(cfg.evidenceDir, `http-calls-${cycleId}.jsonl`),
    outboxDir: join(cfg.evidenceDir, `alert-outbox-${cycleId}`),
    observedBy,
    outboxDbPath,
    promptSendLogPath,
    counters,
  };
  const deps = buildDeps(cfg, pilotOpts, ev);
  try {
    ev.log({ step: "watch-begin", cycleId, observedBy, note: "watch-only: DB resume only, no ingest, no re-qualification, no timestamp resets" });
    const report = await integratedTick(deps);
    ev.log({ step: "watch-tick-report", processed: report.processed.length, issued: report.issued.length, awaiting: report.awaiting.length, rejected: report.rejected.length, expired: report.expired.length, deferred: report.deferred.length });
    // Prompt drain: any outbox event this tick accepted (or an orphaned one
    // from a crashed run) is sent now, not at the next 15-min sweep.
    const drain = await dispatchPending(outboxDbPath, makePromptSendFn(promptSendLogPath, ev));
    counters.sends += drain.attempted;
    ev.log({ step: "watch-drain", attempted: drain.attempted });
    const byState: Record<string, number> = {};
    for (const e of listEvents(outboxDbPath)) byState[e.state] = (byState[e.state] ?? 0) + 1;
    return {
      paper: true,
      worker: "watch-only-entry-worker",
      cycleId,
      at: report.at,
      observedBy,
      tick: {
        processed: report.processed.length,
        issued: report.issued,
        awaiting: report.awaiting,
        rejected: report.rejected.length,
        expired: report.expired.length,
        deferred: report.deferred.length,
      },
      outbox: {
        acceptedTransitions: counters.accepted,
        duplicateRefusals: counters.duplicates,
        sendsAttempted: counters.sends,
        byState,
      },
    };
  } finally {
    storeOf(deps).close();
  }
}
