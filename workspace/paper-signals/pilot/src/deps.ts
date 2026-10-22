/**
 * Builds the handler's IntegratedDeps for the paper pilot:
 *  - DbStore (SQLite file) — durable, survives process kill/restart
 *  - systemClock
 *  - Binance quote provider (read-only refresh)
 *  - Binance entry-observation feed (bounded: pollIntervalMs << 15-min window,
 *    maxPolls cap) with an optional demo-harness pre-observation hold
 *    (labeled; market data untouched — timing control only)
 *  - waiting-interval evidence (sync real 1m klines over
 *    [decisionAt, entryObservedAt]) — crypto fails closed on empty
 *  - post-entry evidence (sync real 1m klines over [entryAt, nowAt])
 *  - sandbox alert transport implementing the deliverAlert hook
 *    (appendAlert = enqueue in the store; markAlertDelivered marks delivery)
 */
import { resolve } from "node:path";
import { DbStore, systemClock } from "./vendor.js";
import {
  BinanceVenueFeed, fetchKlinesSync, klineToEvidenceBar, setHttpLog,
  snapshotInputs, snapshotToFreshInputs, systemWatchClock,
} from "./binance.js";
import { makeSandboxTransport } from "./transport.js";
import {
  attemptEntryConfirmed, dispatchPending, getEvent, openOutboxDb,
  ENTRY_EVENT_TYPE, ENTRY_EVENT_VERSION,
  type OutboxEvent, type SendFn,
} from "./entry-outbox.js";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { EvidenceLog } from "./evidence.js";
import type {
  AlertRow, CandidateRecord, Clock, DbStoreIface, EvidenceBar, FreshInputs, HistoryCoverage, IntegratedDeps,
  PostEntryEvidence, TradePrint, VenueFeed, AlertAck,
} from "./shims.js";

export interface PilotConfig {
  symbol: string;
  direction: "long" | "short";
  score: number;
  invalidationPctBelowEntry: number;
  target1PctAboveEntry: number;
  target2PctAboveEntry: number;
  entryPollIntervalMs: number;
  entryMaxPolls: number;
  retryBackoffMs: number;
  freshnessMs: number;
  dbPath: string;
  evidenceDir: string;
}

export interface PilotOptions {
  /** Demo-harness hold (ms) before the first entry-observation poll serves. Labeled in evidence. */
  preObserveHoldMs: number;
  httpLogPath: string;
  outboxDir: string;
  /**
   * Which lane this process belongs to: "wrapper" (issuance lane) or
   * "watcher" (watch-only entry worker). Recorded on outbox events as
   * observed_by; env PILOT_OBSERVED_BY overrides the default.
   */
  observedBy?: string;
  /** Shared durable outbox DB. Both lanes MUST point at the same file. */
  outboxDbPath?: string;
  /** Append-only prompt-send log (durable send records for the reference lane). */
  promptSendLogPath?: string;
  /**
   * In-process counters incremented by the outbox deliverAlert hook.
   * Lets a watch/tick run report accepted vs duplicate transitions without
   * re-reading logs.
   */
  counters?: { accepted: number; duplicates: number; sends: number };
}

/**
 * Reference-lane prompt sender: durably records the send (one JSONL line,
 * carrying the idempotency key) and returns a SIMULATED acknowledgement.
 * Labeled everywhere as simulated — this is NOT a real delivery channel and
 * never touches the production ledger or scheduler outbox. The destination
 * does not dedupe on the idempotency key, so UNKNOWN is retained for any
 * send whose ack cannot be established (see the outbox module docs).
 */
export function makePromptSendFn(logPath: string, ev: EvidenceLog): SendFn {
  return (event: OutboxEvent) => {
    const record = {
      paper: true,
      channel: "reference-lane-prompt",
      event_id: event.event_id,
      dedup_key: event.dedup_key,
      idempotency_key: event.idempotency_key,
      contract_id: event.contract_id,
      signal_id: event.signal_id,
      candidate_id: event.candidate_id,
      observed_at: event.observed_at,
      observed_by: event.observed_by,
      sent_at: new Date().toISOString(),
      claim_id: event.claim_id,
      attempt_n: event.send_count,
      payload: JSON.parse(event.payload_json || "{}"),
    };
    mkdirSync(dirname(logPath), { recursive: true });
    appendFileSync(logPath, JSON.stringify(record) + "\n");
    ev.log({ step: "prompt-send", eventId: event.event_id, dedupKey: event.dedup_key, idempotencyKey: event.idempotency_key, ackSimulated: true, note: "SIMULATED ack — reference lane; no real delivery channel" });
    return {
      acked: true,
      simulated: true,
      ackId: `sim-${event.event_id}-n${event.send_count}`,
      transportNote: "SIMULATED acknowledgement — reference-lane prompt sender; labeled, never real",
    };
  };
}

/**
 * Read the established first-print identity (venue trade id + venue sequence)
 * off the persisted contract row's observation checkpoint.
 *
 * handler.js v2.1.9 print-identity integrity REQUIRES venueTradeId + venueSeq
 * on every served print and persists the established identity on the entered
 * contract (firstPrintIdentity, handler.js:515; checkpoint write,
 * handler.js:859; contract save via withObservationCheckpoint, handler.js:866;
 * alert evidence, handler.js:997-998, 1026-1027).
 *
 * The deliverAlert hook runs AFTER commitEnteredOutcome persisted that row
 * (handler.js:1101), so getContract() sees the entered contract here.
 *
 * Returns nulls when the row or its checkpoint predates the evidence (older
 * rows, or rows never entered) — NEVER synthesized: an internal id is not
 * the venue's id, and a fabricated trade id would corrupt the audit chain.
 */
function firstPrintIdentityOf(store: DbStoreIface, contractId: string | null): { venueTradeId: string | null; venueSeq: number | null } {
  const absent = { venueTradeId: null as string | null, venueSeq: null as number | null };
  if (!contractId) return absent;
  try {
    const row = store.getContract(contractId);
    if (!row?.contractJson) return absent;
    const parsed = JSON.parse(row.contractJson) as {
      observationCheckpoint?: { firstPrint?: { venueTradeId?: unknown; venueSeq?: unknown } | null } | null;
    };
    const fp = parsed?.observationCheckpoint?.firstPrint ?? null;
    if (!fp) return absent;
    const venueTradeId = typeof fp.venueTradeId === "string" && fp.venueTradeId.length > 0 ? fp.venueTradeId : null;
    const venueSeq = typeof fp.venueSeq === "number" && Number.isFinite(fp.venueSeq) ? fp.venueSeq : null;
    return { venueTradeId, venueSeq };
  } catch {
    return absent; // unparseable contract JSON: refuse to fabricate the identity
  }
}

/**
 * deliverAlert routing BOTH lanes through the SAME shared outbox.
 *
 * - "setup" alerts keep the legacy sandbox file-outbox path (unchanged).
 * - "entry" alerts go through attemptEntryConfirmed() on the shared durable
 *   outbox: the first observer (wrapper lane or watcher lane) accepts the
 *   transition and enqueues exactly one outbox event; the loser gets
 *   accepted=false and never sends. After acceptance the event is dispatched
 *   promptly (claim-before-send) via the prompt sender.
 *
 * Return contract to the vendored handler: void = acknowledged (its internal
 * row goes delivered_simulated — labeled); {acknowledged:false} = the event
 * is NOT in a delivered-ish state, so the vendored row must not be marked
 * delivered. 'unknown' outbox events are never re-sent here.
 */
function makeEntryOutboxDeliverAlert(
  store: DbStoreIface,
  opts: { outboxDbPath: string; observedBy: string; promptSendLogPath: string; counters?: { accepted: number; duplicates: number; sends: number } },
  ev: EvidenceLog,
  sandboxTransport: (alert: AlertRow) => Promise<void>,
): (alert: AlertRow) => Promise<void | AlertAck> {
  const sendFn = makePromptSendFn(opts.promptSendLogPath, ev);
  return async (alert: AlertRow): Promise<void | AlertAck> => {
    if (alert.kind !== "entry") {
      await sandboxTransport(alert);
      return;
    }
    const candidate = store.getCandidate(alert.candidateId);
    const contractId = candidate?.contractId ?? null;
    if (!contractId) {
      ev.log({ step: "entry-transition-no-contract", alertId: alert.id, signalId: alert.signalId, candidateId: alert.candidateId, note: "cannot key the shared transition without a contract id — alert row left to the vendored path" });
      return;
    }
    const firstPrint = firstPrintIdentityOf(store, contractId);
    const payloadJson = JSON.stringify({
      paper: true,
      alert_kind: "entry",
      alert_id: alert.id,
      signal_id: alert.signalId,
      candidate_id: alert.candidateId,
      symbol: alert.symbol,
      direction: alert.direction,
      alerted_at: alert.alertedAt,
      enqueued_at: alert.enqueuedAt,
      entry_observed_at: candidate?.entryObservedAt ?? null,
      // v2.1.9 print-identity integrity: the REAL venue-assigned trade id +
      // venue sequence of the established first print, read off the persisted
      // contract row (null when the row predates the evidence — never
      // synthesized). Binds the accepted transition to the exact venue print.
      entry_venue_trade_id: firstPrint.venueTradeId,
      entry_venue_seq: firstPrint.venueSeq,
    });
    const obs = {
      contractId,
      eventType: ENTRY_EVENT_TYPE,
      eventVersion: ENTRY_EVENT_VERSION,
      signalId: alert.signalId,
      candidateId: alert.candidateId,
      observedAt: candidate?.entryObservedAt ?? alert.enqueuedAt,
      observedBy: opts.observedBy,
      payloadJson,
    };
    const attempt = attemptEntryConfirmed(opts.outboxDbPath, obs);
    if (!attempt.accepted) {
      if (opts.counters) opts.counters.duplicates += 1;
      ev.log({ step: "entry-transition-duplicate", eventId: attempt.eventId, state: attempt.state, observedBy: opts.observedBy, contractId, note: "another lane already accepted this entry transition — no new outbox event, no send from this lane" });
    } else {
      if (opts.counters) opts.counters.accepted += 1;
      ev.log({ step: "entry-transition-accepted", eventId: attempt.eventId, observedBy: opts.observedBy, contractId });
    }
    // Prompt dispatch (also self-heals: a 'pending'/'failed' orphan left by a
    // crashed winner is picked up here; 'unknown' is never claimed).
    const report = await dispatchPending(opts.outboxDbPath, sendFn);
    if (opts.counters) opts.counters.sends += report.attempted;
    const db = openOutboxDb(opts.outboxDbPath);
    try {
      const st = getEvent(db, attempt.eventId)?.state ?? null;
      ev.log({ step: "entry-dispatch", eventId: attempt.eventId, state: st, attempted: report.attempted });
      if (st === "delivered" || st === "delivered_simulated") return;
      return { acknowledged: false };
    } finally {
      db.close();
    }
  };
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Venue feed wrapper with an optional labeled demo-harness hold before the first poll. */
class HoldableFeed implements VenueFeed {
  private held = false;
  readonly historyCoverage?: (sinceTs: number) => Promise<HistoryCoverage>;
  constructor(private readonly inner: VenueFeed, private readonly holdMs: number, private readonly ev: EvidenceLog) {
    // The hold only delays observability; coverage evidence passes through
    // untouched. If the inner feed cannot establish coverage, this feed
    // cannot either (absent evidence fails closed downstream) — never invent
    // coverage. The evidence stays bound to the inner feed's actual served
    // response.
    if (inner.historyCoverage) {
      const hc = inner.historyCoverage.bind(inner);
      this.historyCoverage = (sinceTs: number) => Promise.resolve(hc(sinceTs));
    }
  }
  async latestPrints(sinceTs: number): Promise<TradePrint[]> {
    if (!this.held && this.holdMs > 0) {
      this.held = true;
      this.ev.log({ step: "observation-hold-begin", holdMs: this.holdMs, note: "DEMO HARNESS timing control (labeled): market data untouched; process is killable while awaiting-entry during this hold" });
      await sleep(this.holdMs);
      this.ev.log({ step: "observation-hold-end" });
    }
    return this.inner.latestPrints(sinceTs);
  }
}

function contractField(contract: unknown, field: string): string | null {
  const v = (contract as Record<string, unknown> | null)?.[field];
  return typeof v === "string" ? v : null;
}

export function buildDeps(cfg: PilotConfig, opts: PilotOptions, ev: EvidenceLog, clock?: Clock): IntegratedDeps {
  setHttpLog(opts.httpLogPath);
  const store = new DbStore(resolve(cfg.dbPath));
  const theClock: Clock = clock ?? systemClock();

  const quoteProvider = {
    refresh: async (candidate: CandidateRecord, nowMs: number): Promise<FreshInputs | null> => {
      try {
        const snap = await snapshotInputs(cfg.symbol, nowMs);
        ev.log({ step: "quote-refresh", candidateId: candidate.candidateId, currentPrice: snap.currentPrice, signalDay: snap.signalDay?.day ?? null, vetoBars: snap.vetoBars.length, asOf: snap.asOf });
        return snapshotToFreshInputs(snap);
      } catch (err) {
        ev.log({ step: "quote-refresh-failed", candidateId: candidate.candidateId, error: String(err), note: "provider failure -> candidate deferred, never issued on stale evidence" });
        return null;
      }
    },
  };

  const entryFeedFor = (_contract: unknown, candidate: CandidateRecord) => {
    const feed = new HoldableFeed(new BinanceVenueFeed(cfg.symbol), opts.preObserveHoldMs, ev);
    ev.log({ step: "entry-feed-armed", candidateId: candidate.candidateId, venue: "binance-spot", pollIntervalMs: cfg.entryPollIntervalMs, maxPolls: cfg.entryMaxPolls, note: "bounded watcher: cadence strictly finer than the 15-min crypto entry window" });
    return {
      feed,
      clock: systemWatchClock(),
      pollIntervalMs: cfg.entryPollIntervalMs,
      maxPolls: cfg.entryMaxPolls,
      advance: (ms: number) => sleep(ms),
    };
  };

  const waitingIntervalEvidenceFor = (contract: unknown): EvidenceBar[] | null => {
    try {
      const decisionAt = contractField(contract, "decisionAt");
      const entryObservedAt = contractField(contract, "entryObservedAt");
      if (!decisionAt || !entryObservedAt) return [];
      const dMs = Date.parse(decisionAt);
      const eMs = Date.parse(entryObservedAt);
      const nowMs = Date.now();
      const klines = fetchKlinesSync(cfg.symbol, "1m", { startTime: dMs - 120_000, endTime: eMs + 60_000, limit: 20 });
      const bars = klines.map((k) => klineToEvidenceBar(k, nowMs, "binance.us klines 1m"));
      ev.log({ step: "waiting-interval-evidence", decisionAt, entryObservedAt, bars: bars.length, note: "real venue bars over the genuine [decisionAt, entryObservedAt] interval" });
      return bars;
    } catch (err) {
      ev.log({ step: "waiting-interval-evidence-failed", error: String(err), note: "crypto fails closed on empty waiting-interval evidence" });
      return [];
    }
  };

  const postEntryEvidenceFor = (contract: unknown): PostEntryEvidence | null => {
    try {
      const entryObservedAt = contractField(contract, "entryObservedAt");
      if (!entryObservedAt) return null;
      const eMs = Date.parse(entryObservedAt);
      const nowMs = Date.now();
      const klines = fetchKlinesSync(cfg.symbol, "1m", { startTime: eMs, endTime: nowMs, limit: 60 });
      const bars = klines.map((k) => klineToEvidenceBar(k, nowMs, "binance.us klines 1m"));
      ev.log({ step: "post-entry-evidence", entryObservedAt, nowAt: new Date(nowMs).toISOString(), bars: bars.length });
      return { bars, nowAt: Math.max(nowMs, eMs) };
    } catch (err) {
      ev.log({ step: "post-entry-evidence-failed", error: String(err), note: "null -> check runs on empty post-entry interval; invalidation flagged unresolved, never silently passed" });
      return null;
    }
  };

  const sandboxTransport = makeSandboxTransport(opts.outboxDir, ev);
  // Shared entry-transition outbox: BOTH the wrapper lane and the watcher
  // lane route entry alerts through the same transactional transition and
  // the same durable outbox (uniqueness on contract_id/event_type/version).
  // pilot.ts passes explicit paths; fallbacks keep the outbox next to the DB.
  const outboxDbPath =
    opts.outboxDbPath ??
    process.env.OUTBOX_DB ??
    resolve(cfg.dbPath, "..", "entry-outbox.sqlite");
  const promptSendLogPath =
    opts.promptSendLogPath ??
    process.env.PROMPT_SEND_LOG ??
    resolve(cfg.dbPath, "..", "prompt-send-log.jsonl");
  const observedBy = opts.observedBy ?? process.env.PILOT_OBSERVED_BY ?? "wrapper";
  const deliverAlert = makeEntryOutboxDeliverAlert(
    store,
    { outboxDbPath, observedBy, promptSendLogPath, counters: opts.counters },
    ev,
    sandboxTransport,
  );

  return {
    store, clock: theClock,
    deliveryMode: "simulated",
    config: { retryBackoffMs: cfg.retryBackoffMs, freshnessMs: cfg.freshnessMs },
    quoteProvider, entryFeedFor, waitingIntervalEvidenceFor, postEntryEvidenceFor, deliverAlert,
  };
}

/** Narrow helper so the driver can close/inspect the store without reaching into deps. */
export function storeOf(deps: IntegratedDeps): DbStoreIface {
  return deps.store as DbStoreIface;
}

export type { AlertRow };
