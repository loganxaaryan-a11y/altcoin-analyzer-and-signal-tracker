/**
 * Shared transactional entry transition + durable outbox (paper pilot).
 *
 * PAPER ONLY. No brokerage, no orders, no real money. No model changes.
 *
 * PURPOSE
 * -------
 * Two paths can originate an ENTRY_CONFIRMED event for the same contract:
 *   (a) the issuance-wrapper lane (paper-signal-cycle wrapper → diff → trigger),
 *   (b) the watch-only entry-worker lane (paper-pilot-watcher 5-min ticks,
 *       DB-resume, bounded entry observation).
 * Whichever path observes the entry first must win, exactly once: one accepted
 * transition → exactly one outbox event → at most one prompt send.
 *
 * MECHANISM
 * ---------
 * - The ACCEPTED TRANSITION and the OUTBOX EVENT are the same durable row:
 *   a single atomic INSERT both accepts the transition and enqueues the
 *   event. There is no separate transition table that could diverge from the
 *   outbox.
 * - Uniqueness is enforced by the store: UNIQUE(contract_id, event_type,
 *   event_version). The insert uses ON CONFLICT ... DO NOTHING inside
 *   BEGIN IMMEDIATE (SERIALIZABLE); the affected-row count tells the caller
 *   whether it won (accepted=true) or lost (accepted=false, duplicate of the
 *   existing row). Concurrent processes serialize on the SQLite RESERVED
 *   lock — the race test proves exactly one winner.
 * - SEND is claim-before-send: a row moves pending → claiming → sending with
 *   the claim id + attempt count stamped atomically, so two senders cannot
 *   both send the same event. sent_at + send_count are recorded BEFORE the
 *   transport call, so a crash after send is on the record.
 * - DELIVERY is never inferred: state reaches delivered/delivered_simulated
 *   ONLY on acknowledgement evidence. A send with no ack → state 'unknown'.
 *   'unknown' is NEVER auto-retried and NEVER auto-marked delivered
 *   (Logan's rule). Exactly-once delivery is NOT claimed (see disclosure in
 *   pilot/delivery/ENTRY-OUTBOX-DESIGN-2026-10-15.md): the destination may not
 *   dedupe on the idempotency key, so after an ambiguous send a manual retry
 *   could duplicate at the destination. The outbox guarantees at most one
 *   send ATTEMPT per accepted event from this worker, plus honest UNKNOWN.
 * - Every send payload carries idempotency_key =
 *   <contract_id>/<event_type>/v<event_version>; senders for channels that
 *   support destination idempotency must pass it through. The local
 *   reference-lane channel does NOT dedupe — hence UNKNOWN is retained.
 *
 * This module is the ONLY entry-transition/outbox implementation under
 * pilot/. Both lanes call attemptEntryConfirmed(); both lanes dispatch from
 * the same table.
 */
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";

export const ENTRY_EVENT_TYPE = "ENTRY_CONFIRMED";
export const ENTRY_EVENT_VERSION = "v1";

export type OutboxState =
  | "pending"            // accepted, not yet sent
  | "claiming"           // a sender won the claim, send not yet recorded
  | "sending"            // send recorded (sent_at + send_count), ack not seen
  | "delivered"          // real acknowledgement evidence
  | "delivered_simulated"// sandbox/simulated acknowledgement (labeled, never real)
  | "unknown"            // send recorded but ack could not be established; never auto-retried
  | "failed";            // transport threw; retryable by an operator/run

export interface EntryObservation {
  contractId: string;
  eventType?: string;      // default ENTRY_CONFIRMED
  eventVersion?: string;   // default v1
  signalId: string;
  candidateId: string;
  observedAt: string;      // ISO-8601, venue-assigned entry observation time
  observedBy: string;      // "wrapper" | "watcher" | ...
  payloadJson?: string;    // alert payload snapshot (keys + timestamps)
}

export interface OutboxEvent {
  event_id: string;
  contract_id: string;
  event_type: string;
  event_version: string;
  dedup_key: string;
  idempotency_key: string;
  signal_id: string;
  candidate_id: string;
  observed_at: string;
  observed_by: string;
  payload_json: string;
  state: OutboxState;
  claim_id: string | null;
  claimed_at: string | null;
  send_count: number;
  sent_at: string | null;
  ack_at: string | null;
  ack_id: string | null;
  last_error: string | null;
  surfaced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AttemptResult {
  accepted: boolean;
  eventId: string;
  state: OutboxState | null; // state of the (new or existing) row
  reason: string;
}

export interface SendOutcome {
  acked: boolean;
  simulated?: boolean;
  ackId?: string | null;
  transportNote: string;
}

export type SendFn = (event: OutboxEvent) => Promise<SendOutcome> | SendOutcome;

export interface AckEvidence {
  acked: boolean;
  simulated?: boolean;
  ackId?: string | null;
  ackAt?: string | null;
}
export type AckEvidenceFn = (event: OutboxEvent) => AckEvidence | null;

export interface DispatchItem { eventId: string; claimed: boolean; sent: boolean; state: OutboxState; error?: string }
export interface DispatchReport { at: string; attempted: number; items: DispatchItem[] }
export interface ReconcileItem { eventId: string; from: OutboxState; to: OutboxState; reason: string }
export interface ReconcileReport { at: string; items: ReconcileItem[] }

const SCHEMA = `
CREATE TABLE IF NOT EXISTS entry_delivery_outbox (
  event_id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_version TEXT NOT NULL,
  dedup_key TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  signal_id TEXT NOT NULL,
  candidate_id TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  observed_by TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  state TEXT NOT NULL DEFAULT 'pending',
  claim_id TEXT,
  claimed_at TEXT,
  send_count INTEGER NOT NULL DEFAULT 0,
  sent_at TEXT,
  ack_at TEXT,
  ack_id TEXT,
  last_error TEXT,
  surfaced_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(contract_id, event_type, event_version)
);
CREATE INDEX IF NOT EXISTS idx_outbox_state ON entry_delivery_outbox(state);
CREATE INDEX IF NOT EXISTS idx_outbox_contract ON entry_delivery_outbox(contract_id, event_type, event_version);
`;

const nowIso = (): string => new Date().toISOString();

function sleepSyncMs(ms: number): void {
  const sab = new SharedArrayBuffer(4);
  const view = new Int32Array(sab);
  Atomics.wait(view, 0, 0, ms);
}

/** Open the outbox DB: WAL + busy timeout so concurrent paths serialize instead of erroring. */
export function openOutboxDb(dbPath: string): DatabaseSync {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  // busy_timeout FIRST: it needs no lock. The journal_mode switch below
  // needs momentary exclusive access; when a concurrent lane (wrapper vs
  // watcher — the real production topology) holds a write lock, the switch
  // returns SQLITE_BUSY immediately instead of honoring busy_timeout, so
  // retry it with backoff. Without this, the loser's open races the
  // winner's transaction and crashes (seen live: errcode 5 at open).
  db.exec("PRAGMA busy_timeout = 30000;");
  const t0 = Date.now();
  for (;;) {
    try {
      db.exec("PRAGMA journal_mode = WAL;");
      break;
    } catch (err) {
      const busy = (err as { errcode?: number })?.errcode === 5;
      if (!busy || Date.now() - t0 > 30000) throw err;
      sleepSyncMs(100);
    }
  }
  db.exec("PRAGMA synchronous = FULL;");
  db.exec(SCHEMA);
  return db;
}

export function dedupKeyFor(contractId: string, eventType: string, eventVersion: string): string {
  return `${contractId}/${eventType}/${eventVersion}`;
}

function rowToEvent(row: Record<string, unknown>): OutboxEvent {
  return row as unknown as OutboxEvent;
}

export function getEvent(db: DatabaseSync, eventId: string): OutboxEvent | null {
  const row = db.prepare("SELECT * FROM entry_delivery_outbox WHERE event_id = ?").get(eventId) as Record<string, unknown> | null;
  return row ? rowToEvent(row) : null;
}

export function listEvents(dbPath: string): OutboxEvent[] {
  const db = openOutboxDb(dbPath);
  try {
    return (db.prepare("SELECT * FROM entry_delivery_outbox ORDER BY created_at").all() as Record<string, unknown>[]).map(rowToEvent);
  } finally {
    db.close();
  }
}

export function outboxCounts(dbPath: string): { events: number; accepted: number; byState: Record<string, number> } {
  const db = openOutboxDb(dbPath);
  try {
    const events = (db.prepare("SELECT COUNT(*) AS n FROM entry_delivery_outbox").get() as { n: number }).n;
    const byState: Record<string, number> = {};
    for (const r of db.prepare("SELECT state, COUNT(*) AS n FROM entry_delivery_outbox GROUP BY state").all() as { state: string; n: number }[]) {
      byState[r.state] = r.n;
    }
    return { events, accepted: events, byState };
  } finally {
    db.close();
  }
}

/**
 * THE shared entry transition. One atomic INSERT = one accepted transition =
 * one outbox event. Uniqueness on (contract_id, event_type, event_version)
 * decides the winner; the loser gets accepted=false with the existing row's
 * id and state. Both the wrapper lane and the watcher lane call this.
 *
 * holdMs (test-only): sleep inside the transaction after BEGIN IMMEDIATE so
 * two racing processes provably overlap in the critical section.
 */
export function attemptEntryConfirmed(
  dbPath: string,
  obs: EntryObservation,
  opts?: { holdMs?: number },
): AttemptResult {
  const eventType = obs.eventType ?? ENTRY_EVENT_TYPE;
  const eventVersion = obs.eventVersion ?? ENTRY_EVENT_VERSION;
  if (!obs.contractId) throw new Error("attemptEntryConfirmed: contractId is required");
  const eventId = `evt_${obs.contractId}_${eventType}_${eventVersion}`;
  const dedupKey = dedupKeyFor(obs.contractId, eventType, eventVersion);
  const db = openOutboxDb(dbPath);
  try {
    db.exec("BEGIN IMMEDIATE;");
    try {
      if (opts?.holdMs && opts.holdMs > 0) sleepSyncMs(opts.holdMs);
      const ts = nowIso();
      const res = db.prepare(
        `INSERT INTO entry_delivery_outbox
         (event_id, contract_id, event_type, event_version, dedup_key, idempotency_key,
          signal_id, candidate_id, observed_at, observed_by, payload_json,
          state, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
         ON CONFLICT(contract_id, event_type, event_version) DO NOTHING`,
      ).run(
        eventId, obs.contractId, eventType, eventVersion, dedupKey, dedupKey,
        obs.signalId, obs.candidateId, obs.observedAt, obs.observedBy,
        obs.payloadJson ?? "{}", ts, ts,
      );
      if (res.changes === 1) {
        db.exec("COMMIT;");
        return { accepted: true, eventId, state: "pending", reason: "transition accepted: first observer wins" };
      }
      db.exec("ROLLBACK;");
    } catch (err) {
      try { db.exec("ROLLBACK;"); } catch { /* already rolled back */ }
      throw err;
    }
    const existing = db.prepare(
      "SELECT event_id, state FROM entry_delivery_outbox WHERE contract_id = ? AND event_type = ? AND event_version = ?",
    ).get(obs.contractId, eventType, eventVersion) as { event_id: string; state: OutboxState } | null;
    if (!existing) throw new Error("attemptEntryConfirmed: insert did nothing but no existing row found");
    return {
      accepted: false,
      eventId: existing.event_id,
      state: existing.state,
      reason: `duplicate transition refused: (contract_id, event_type, event_version) already accepted (state=${existing.state})`,
    };
  } finally {
    db.close();
  }
}

function recordSendOutcome(db: DatabaseSync, eventId: string, claimId: string, outcome: SendOutcome): OutboxState {
  const ts = nowIso();
  let state: OutboxState;
  let lastError: string | null = null;
  let surfacedAt: string | null = null;
  if (outcome.acked && outcome.simulated) {
    state = "delivered_simulated";
  } else if (outcome.acked) {
    state = "delivered";
  } else {
    // Send completed but acknowledgement could not be established: UNKNOWN.
    // Never auto-retried, never marked delivered. Surfaced once.
    state = "unknown";
    lastError = `send completed without ack evidence (${outcome.transportNote}); UNKNOWN preserved — never auto-retried, never marked delivered`;
    surfacedAt = ts;
  }
  const res = db.prepare(
    `UPDATE entry_delivery_outbox
     SET state = ?, ack_at = ?, ack_id = ?, last_error = ?, surfaced_at = COALESCE(surfaced_at, ?),
         claim_id = NULL, claimed_at = NULL, updated_at = ?
     WHERE event_id = ? AND claim_id = ? AND state IN ('claiming', 'sending')`,
  ).run(state, outcome.acked ? ts : null, outcome.ackId ?? null, lastError, surfacedAt, ts, eventId, claimId);
  if (res.changes !== 1) throw new Error(`recordSendOutcome: claim ${claimId} no longer owns ${eventId}`);
  return state;
}

function recordSendThrew(db: DatabaseSync, eventId: string, claimId: string, error: string): void {
  const ts = nowIso();
  db.prepare(
    `UPDATE entry_delivery_outbox
     SET state = 'failed', last_error = ?, claim_id = NULL, claimed_at = NULL, updated_at = ?
     WHERE event_id = ? AND claim_id = ? AND state IN ('claiming', 'sending')`,
  ).run(error, ts, eventId, claimId, ts);
}

/**
 * Dispatch every due outbox event: claim-before-send (atomic), durable send
 * record BEFORE the transport call (sent_at + send_count), then the send,
 * then outcome recording (delivered on ack, unknown on no-ack, failed on
 * throw). 'unknown' rows are never claimed here — no auto-retry, ever.
 */
export async function dispatchPending(dbPath: string, sendFn: SendFn, opts?: { maxEvents?: number }): Promise<DispatchReport> {
  const db = openOutboxDb(dbPath);
  const report: DispatchReport = { at: nowIso(), attempted: 0, items: [] };
  try {
    const due = db.prepare(
      "SELECT event_id FROM entry_delivery_outbox WHERE state IN ('pending', 'failed') ORDER BY created_at",
    ).all() as { event_id: string }[];
    const limit = opts?.maxEvents ?? due.length;
    for (const { event_id: eventId } of due.slice(0, limit)) {
      const claimId = randomUUID();
      const ts = nowIso();
      const won = db.prepare(
        `UPDATE entry_delivery_outbox
         SET state = 'claiming', claim_id = ?, claimed_at = ?, updated_at = ?
         WHERE event_id = ? AND state IN ('pending', 'failed')`,
      ).run(claimId, ts, ts, eventId);
      if (won.changes !== 1) {
        report.items.push({ eventId, claimed: false, sent: false, state: (getEvent(db, eventId)?.state ?? "pending") });
        continue;
      }
      // Durable send record BEFORE the transport call: a crash after this
      // point leaves 'sending' with send_count=1 on the record.
      db.prepare(
        `UPDATE entry_delivery_outbox
         SET state = 'sending', sent_at = COALESCE(sent_at, ?), send_count = send_count + 1, updated_at = ?
         WHERE event_id = ? AND claim_id = ?`,
      ).run(ts, ts, eventId, claimId);
      report.attempted += 1;
      const event = getEvent(db, eventId);
      if (!event) throw new Error(`dispatchPending: lost row ${eventId} after claim`);
      let outcome: SendOutcome;
      try {
        outcome = await sendFn(event);
      } catch (err) {
        recordSendThrew(db, eventId, claimId, `transport threw: ${String(err)}`);
        report.items.push({ eventId, claimed: true, sent: false, state: "failed", error: String(err) });
        continue;
      }
      const state = recordSendOutcome(db, eventId, claimId, outcome);
      report.items.push({ eventId, claimed: true, sent: true, state });
    }
    return report;
  } finally {
    db.close();
  }
}

/**
 * Post-restart reconciliation for events left mid-flight ('claiming' /
 * 'sending') AND for 'unknown' events when real ack evidence arrives later.
 * The ack evidence source is consulted FIRST:
 *   - ack evidence found → delivered (or delivered_simulated), ack recorded.
 *     Ack evidence is the ONLY thing that earns delivered.
 *   - no ack evidence on a mid-flight event → 'unknown'. NEVER auto-marked
 *     delivered, NEVER re-sent automatically. Exactly one send stays on the
 *     record (send_count / sent_at untouched).
 *   - no ack evidence on an 'unknown' event → left as unknown (no auto-retry).
 * 'pending' events are left alone (the next dispatch sends them exactly
 * once); 'failed' keeps its retry policy; terminal states untouched.
 * Reconciliation never calls the sender: it can never create a duplicate
 * delivery attempt.
 */
export function reconcileAfterRestart(dbPath: string, ackEvidence: AckEvidenceFn): ReconcileReport {
  const db = openOutboxDb(dbPath);
  const report: ReconcileReport = { at: nowIso(), items: [] };
  try {
    const midFlight = db.prepare(
      "SELECT * FROM entry_delivery_outbox WHERE state IN ('claiming', 'sending', 'unknown') ORDER BY created_at",
    ).all() as Record<string, unknown>[];
    for (const row of midFlight) {
      const event = rowToEvent(row);
      const ack = ackEvidence(event);
      const ts = nowIso();
      if (ack?.acked) {
        const state: OutboxState = ack.simulated ? "delivered_simulated" : "delivered";
        const res = db.prepare(
          `UPDATE entry_delivery_outbox
           SET state = ?, ack_at = COALESCE(?, ?), ack_id = COALESCE(?, ack_id),
               claim_id = NULL, claimed_at = NULL, updated_at = ?
           WHERE event_id = ? AND state IN ('claiming', 'sending', 'unknown')`,
        ).run(state, ack.ackAt ?? ts, ts, ack.ackId ?? null, ts, event.event_id);
        if (res.changes === 1) {
          report.items.push({ eventId: event.event_id, from: event.state, to: state, reason: event.state === "unknown" ? "late ack evidence on unknown event" : "ack evidence found post-restart" });
        }
      } else if (event.state === "unknown") {
        // No ack evidence: unknown stays unknown. Never auto-retried.
        report.items.push({ eventId: event.event_id, from: "unknown", to: "unknown", reason: "no ack evidence: UNKNOWN preserved" });
      } else {
        db.prepare(
          `UPDATE entry_delivery_outbox
           SET state = 'unknown',
               last_error = 'restart: send was recorded (send_count=' || send_count || ') but no ack evidence; UNKNOWN preserved — never auto-marked delivered, never re-sent',
               surfaced_at = COALESCE(surfaced_at, ?), claim_id = NULL, claimed_at = NULL, updated_at = ?
           WHERE event_id = ? AND state IN ('claiming', 'sending')`,
        ).run(ts, ts, event.event_id);
        report.items.push({ eventId: event.event_id, from: event.state, to: "unknown", reason: "no ack evidence after restart: UNKNOWN preserved" });
      }
    }
    return report;
  } finally {
    db.close();
  }
}
