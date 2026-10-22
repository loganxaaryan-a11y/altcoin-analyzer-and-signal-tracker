/**
 * DB-backed sandbox store: SQLite persistence with REAL transactions.
 *
 * SANDBOX ONLY. Never touches a production database, schema, or table.
 * Strategy ids / venue are the paper-* sandbox identity space (see types.ts
 * SANDBOX), deliberately disjoint from every production id.
 *
 * This store replaces the file tmp+rename store for the INTEGRATED issuance
 * path. The old file store (issuers/sandbox-store.ts) is preserved for the
 * legacy orchestrator path and its provenance tests.
 *
 * ---------------------------------------------------------------------------
 * NAMED CONTROLS (the accepted production controls, reused as equivalents)
 * ---------------------------------------------------------------------------
 * Production (source-export-2026-10-13):
 *  - DB handle: `ctx.db<typeof schema>()` — a Drizzle ORM handle over SQLite
 *    tables (drizzle-orm/sqlite-core; crypto/server/src/schema.ts,
 *    equity/server/src/schema.ts).
 *  - Atomic publish: `persistSignalIssuanceBundle({ atomicWrite, readAccepted })`
 *    (crypto/server/src/issuance-persistence.ts:11) — `atomicWrite` is the
 *    platform `db.batch([...])` (multi-statement atomic write); the accepted
 *    bundle is ALWAYS re-read after the write so concurrent retries and
 *    competing snapshots deterministically receive the database-accepted row.
 *  - Claim mechanism: `signalContracts.issuanceClaim = ctx.invocationId`; the
 *    return distinguishes `published` vs `already_exists` by comparing
 *    `accepted.issuanceClaim === ctx.invocationId`
 *    (crypto/server/src/actions.ts:2013-2021).
 *  - Conflict backstop: `.onConflictDoNothing()` with explicit conflict
 *    targets (equity issuanceIdentity at actions.ts:505-513).
 *
 * Sandbox equivalents in this file:
 *  - TRANSACTION API: `transact(fn)` — explicit `BEGIN IMMEDIATE` / `COMMIT` /
 *    `ROLLBACK` on node:sqlite's DatabaseSync. A throw inside `fn` (including
 *    a simulated crash) rolls back; no partial state is ever visible.
 *  - ISOLATION LEVEL: SQLite SERIALIZABLE. Writers are serialized two ways:
 *    (1) `BEGIN IMMEDIATE` acquires the RESERVED lock up-front, so two
 *    writers cannot interleave even across processes; (2) `runExclusive(fn)`
 *    is an in-process async mutex around each commit scope, so interleaved
 *    async callers (manual + tick) serialize without SQLITE_BUSY.
 *  - CLAIM MECHANISM: `signals.issuance_claim` TEXT column + a
 *    `UNIQUE(identity_hash)` constraint. The issuance insert is
 *    `INSERT ... ON CONFLICT(identity_hash) DO NOTHING` carrying the caller's
 *    `invocationId` as the claim; the accepted row is re-read and
 *    `claim === invocationId` decides `published` vs `already_exists` —
 *    exactly the production comparison.
 *  - BUNDLE COORDINATOR: `persistSignalIssuanceBundle({ atomicWrite,
 *    readAccepted, isComplete })` — the sandbox port of the production
 *    coordinator (same shape: pre-read, try write, re-read on conflict,
 *    throw only when no complete bundle is exposed).
 *
 * PRAGMAs: `journal_mode=WAL`, `busy_timeout=5000`.
 */

import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type {
  AlertRow,
  CandidateRecord,
  CandidateStatus,
  IssuedSignal,
  SuppressionRow,
} from "../types.js";
import type { WriteStore } from "../issuers/sandbox-store.js";

/** A stored signal row: the IssuedSignal plus the issuance claim column. */
export interface StoredSignal extends IssuedSignal {
  issuanceClaim: string;
}

export interface ContractRow {
  contractId: string;
  candidateId: string;
  signalId: string | null;
  /** EntryState of the serialized contract ("pending" | "entered" | "void_*"). */
  state: string;
  /** Full ActionableEntryContract JSON (deep-frozen at write time by the caller). */
  contractJson: string;
  updatedAt: string;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS candidates (
  candidate_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  terminal TEXT NOT NULL,
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL,
  record_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS signals (
  signal_id TEXT PRIMARY KEY,
  identity_hash TEXT NOT NULL UNIQUE,
  issuance_claim TEXT NOT NULL,
  issuance_state TEXT NOT NULL DEFAULT 'complete',
  record_json TEXT NOT NULL,
  issued_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS contracts (
  contract_id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  signal_id TEXT,
  state TEXT NOT NULL,
  contract_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS suppressions (
  id TEXT PRIMARY KEY,
  candidate_id TEXT NOT NULL,
  terminal TEXT NOT NULL,
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL,
  signal_date TEXT NOT NULL,
  gate TEXT NOT NULL,
  reason TEXT NOT NULL,
  origin TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  signal_id TEXT NOT NULL,
  candidate_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL,
  alerted_at TEXT NOT NULL,
  channel TEXT NOT NULL,
  enqueued_at TEXT,
  delivered_at TEXT,
  delivery_status TEXT,
  delivery_mode TEXT,
  ack_id TEXT,
  delivery_attempts INTEGER NOT NULL DEFAULT 0,
  delivery_claim TEXT
);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

/**
 * Sandbox port of production's persistSignalIssuanceBundle
 * (crypto/server/src/issuance-persistence.ts:11).
 *
 * "The accepted row is always re-read after the write so concurrent retries
 * and competing snapshots deterministically receive the database-accepted
 * bundle." Difference from production: synchronous (node:sqlite is sync),
 * and `isComplete` is an explicit predicate instead of the
 * issuanceState/legacySignalId shape.
 */
export function persistSignalIssuanceBundle<T>(input: {
  atomicWrite: () => void;
  readAccepted: () => T | null;
  isComplete: (t: T | null) => t is T;
}): T {
  const before = input.readAccepted();
  if (input.isComplete(before)) return before;
  try {
    input.atomicWrite();
  } catch (error) {
    const acceptedAfterConflict = input.readAccepted();
    if (input.isComplete(acceptedAfterConflict)) return acceptedAfterConflict;
    throw error;
  }
  const accepted = input.readAccepted();
  if (!input.isComplete(accepted)) {
    throw new Error("Atomic issuance did not expose a complete signal bundle; retry is safe.");
  }
  return accepted;
}

/** Thrown inside the outcome transaction when another signal won the duplicate race. */
export class DuplicateIssuanceError extends Error {
  readonly winningSignalId: string;
  constructor(winningSignalId: string) {
    super(`duplicate suppressed inside issuance transaction: ${winningSignalId} already issued`);
    this.name = "DuplicateIssuanceError";
    this.winningSignalId = winningSignalId;
  }
}

export class DbStore implements WriteStore {
  private readonly db: DatabaseSync;
  private txDepth = 0;
  /** In-process async mutex serializing commit scopes across interleaved callers. */
  private mutex: Promise<void> = Promise.resolve();

  constructor(filePath: string) {
    const inMemory = filePath === ":memory:";
    const path = inMemory ? ":memory:" : resolve(filePath);
    if (!inMemory) mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA busy_timeout = 5000;");
    this.db.exec(SCHEMA);
    this.migrateAlerts();
  }

  /**
   * Alert enqueue-vs-delivery columns on pre-existing sandbox DB files.
   * CREATE TABLE IF NOT EXISTS does not add columns to an old table, so
   * ALTER the old shape; a duplicate-column error means the file is already
   * migrated (or was created fresh with the new schema) and is swallowed.
   */
  private migrateAlerts(): void {
    for (const ddl of [
      "ALTER TABLE alerts ADD COLUMN enqueued_at TEXT",
      "ALTER TABLE alerts ADD COLUMN delivered_at TEXT",
      "ALTER TABLE alerts ADD COLUMN delivery_status TEXT",
      "ALTER TABLE alerts ADD COLUMN delivery_mode TEXT",
      "ALTER TABLE alerts ADD COLUMN ack_id TEXT",
      "ALTER TABLE alerts ADD COLUMN delivery_attempts INTEGER NOT NULL DEFAULT 0",
      "ALTER TABLE alerts ADD COLUMN delivery_claim TEXT",
    ]) {
      try {
        this.db.exec(ddl);
      } catch {
        /* duplicate column: already migrated — nothing to do */
      }
    }
  }

  close(): void {
    this.db.close();
  }

  // ------------------------------------------------------------------
  // Named control 1: TRANSACTION API — BEGIN IMMEDIATE / COMMIT / ROLLBACK
  // ------------------------------------------------------------------
  /**
   * Run `fn` inside a real database transaction. BEGIN IMMEDIATE takes the
   * write lock up-front (serializes writers); any throw — including a
   * simulated crash between writes — rolls back, leaving no partial state.
   * Nested calls join the outer transaction (depth-counted).
   */
  transact<T>(fn: () => T): T {
    if (this.txDepth > 0) return fn();
    this.txDepth++;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const out = fn();
      this.db.exec("COMMIT");
      return out;
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
        /* rollback of a failed begin is a no-op; preserve the original error */
      }
      throw error;
    } finally {
      this.txDepth--;
    }
  }

  // ------------------------------------------------------------------
  // Named control 2: ISOLATION — in-process mutex + BEGIN IMMEDIATE
  // ------------------------------------------------------------------
  /**
   * Serialize an (async) critical section across interleaved callers in this
   * process. Combine with transact() for the commit scopes: the mutex orders
   * the callers, BEGIN IMMEDIATE orders them against any other process.
   * Together with UNIQUE(identity_hash) this yields exactly-once issuance.
   */
  async runExclusive<T>(fn: () => T): Promise<T> {
    const prev = this.mutex;
    let release!: () => void;
    this.mutex = new Promise<void>((res) => {
      release = res;
    });
    await prev;
    try {
      return fn();
    } finally {
      release();
    }
  }

  // ---- reads (WriteStore / ReadStore) ----
  getCandidate(candidateId: string): CandidateRecord | null {
    const row = this.db
      .prepare("SELECT record_json FROM candidates WHERE candidate_id = ?")
      .get(candidateId) as { record_json: string } | undefined;
    return row ? (JSON.parse(row.record_json) as CandidateRecord) : null;
  }

  listCandidates(): CandidateRecord[] {
    const rows = this.db
      .prepare("SELECT record_json FROM candidates ORDER BY rowid")
      .all() as Array<{ record_json: string }>;
    return rows.map((r) => JSON.parse(r.record_json) as CandidateRecord);
  }

  listSignals(): IssuedSignal[] {
    const rows = this.db
      .prepare("SELECT record_json FROM signals ORDER BY rowid")
      .all() as Array<{ record_json: string }>;
    return rows.map((r) => JSON.parse(r.record_json) as IssuedSignal);
  }

  /** Read a signal by its issuance identity, WITH the claim column. */
  getSignalByIdentity(identityHash: string): StoredSignal | null {
    const row = this.db
      .prepare("SELECT record_json, issuance_claim FROM signals WHERE identity_hash = ?")
      .get(identityHash) as { record_json: string; issuance_claim: string } | undefined;
    if (!row) return null;
    return { ...(JSON.parse(row.record_json) as IssuedSignal), issuanceClaim: row.issuance_claim };
  }

  listSuppressions(): SuppressionRow[] {
    const rows = this.db.prepare(
      "SELECT id, candidate_id AS candidateId, terminal, symbol, direction, signal_date AS signalDate, gate, reason, origin, at FROM suppressions ORDER BY rowid",
    ).all() as Array<{
      id: string; candidateId: string; terminal: string; symbol: string; direction: string;
      signalDate: string; gate: string; reason: string; origin: string; at: string;
    }>;
    return rows.map((r) => ({
      id: r.id, candidateId: r.candidateId, terminal: r.terminal as SuppressionRow["terminal"],
      symbol: r.symbol, direction: r.direction as SuppressionRow["direction"],
      signalDate: r.signalDate, gate: r.gate, reason: r.reason,
      origin: r.origin as SuppressionRow["origin"], at: r.at,
    }));
  }

  listAlerts(): AlertRow[] {
    const rows = this.db.prepare(
      "SELECT id, kind, signal_id AS signalId, candidate_id AS candidateId, symbol, direction, alerted_at AS alertedAt, channel, enqueued_at AS enqueuedAt, delivered_at AS deliveredAt, delivery_status AS deliveryStatus, delivery_mode AS deliveryMode, ack_id AS ackId, delivery_attempts AS deliveryAttempts FROM alerts ORDER BY rowid",
    ).all() as Array<{
      id: string; kind: string; signalId: string; candidateId: string; symbol: string;
      direction: string; alertedAt: string; channel: string;
      enqueuedAt: string | null; deliveredAt: string | null; deliveryStatus: string | null;
      deliveryMode: string | null; ackId: string | null; deliveryAttempts: number | null;
    }>;
    return rows.map((r) => ({
      id: r.id, kind: r.kind as AlertRow["kind"], signalId: r.signalId, candidateId: r.candidateId,
      symbol: r.symbol, direction: r.direction as AlertRow["direction"],
      alertedAt: r.alertedAt, channel: r.channel as AlertRow["channel"],
      // Rows written before the enqueue/delivery columns existed read back
      // as enqueued at alert time, never delivered.
      enqueuedAt: r.enqueuedAt ?? r.alertedAt,
      deliveredAt: r.deliveredAt,
      deliveryStatus: (r.deliveryStatus ?? "enqueued") as AlertRow["deliveryStatus"],
      deliveryMode: (r.deliveryMode ?? null) as AlertRow["deliveryMode"],
      ackId: r.ackId,
      deliveryAttempts: r.deliveryAttempts ?? 0,
    }));
  }

  /**
   * Alerts that still need delivery: enqueued (never attempted), failed
   * (transport failure), or sending (claimed but never acknowledged — the
   * crash-between-claim-and-ack state; recovery reclaims these).
   * Ordered by rowid for deterministic recovery order.
   */
  listUndeliveredAlerts(): AlertRow[] {
    return this.listAlerts().filter(
      (a) => a.deliveryStatus !== "delivered",
    );
  }

  getIssuanceAttempts(): number {
    const row = this.db
      .prepare("SELECT value FROM meta WHERE key = 'issuance_attempts'")
      .get() as { value: string } | undefined;
    return row ? Number.parseInt(row.value, 10) : 0;
  }

  getContract(contractId: string): ContractRow | null {
    const row = this.db
      .prepare("SELECT contract_id AS contractId, candidate_id AS candidateId, signal_id AS signalId, state, contract_json AS contractJson, updated_at AS updatedAt FROM contracts WHERE contract_id = ?")
      .get(contractId) as
      | { contractId: string; candidateId: string; signalId: string | null; state: string; contractJson: string; updatedAt: string }
      | undefined;
    return row ?? null;
  }

  // ---- writes ----
  upsertCandidate(record: CandidateRecord): void {
    this.db.prepare(
      "INSERT INTO candidates (candidate_id, status, terminal, symbol, direction, record_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(candidate_id) DO NOTHING",
    ).run(
      record.candidateId, record.status, record.terminal, record.symbol, record.direction,
      JSON.stringify(record), record.lastReassessedAt ?? record.firstSeenAt,
    );
  }

  saveCandidate(record: CandidateRecord): void {
    this.db.prepare(
      "INSERT INTO candidates (candidate_id, status, terminal, symbol, direction, record_json, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(candidate_id) DO UPDATE SET status = excluded.status, record_json = excluded.record_json, updated_at = excluded.updated_at",
    ).run(
      record.candidateId, record.status, record.terminal, record.symbol, record.direction,
      JSON.stringify(record), new Date().toISOString(),
    );
  }

  persistIssuedSignal(signal: IssuedSignal): void {
    this.db.prepare(
      "INSERT INTO signals (signal_id, identity_hash, issuance_claim, issuance_state, record_json, issued_at) VALUES (?, ?, ?, 'complete', ?, ?) ON CONFLICT(signal_id) DO UPDATE SET record_json = excluded.record_json, issued_at = excluded.issued_at",
    ).run(
      signal.signalId, signal.identityHash, "legacy-path",
      JSON.stringify(signal), signal.issuedAt,
    );
  }

  /**
   * Named control 3: CLAIM MECHANISM. Insert the signal row carrying the
   * caller's invocationId as the claim; on identity conflict do nothing.
   * Returns true iff this call won the claim (row inserted).
   */
  insertSignalClaim(signal: IssuedSignal, issuanceClaim: string): boolean {
    const result = this.db.prepare(
      "INSERT INTO signals (signal_id, identity_hash, issuance_claim, issuance_state, record_json, issued_at) VALUES (?, ?, ?, 'complete', ?, ?) ON CONFLICT(identity_hash) DO NOTHING",
    ).run(
      signal.signalId, signal.identityHash, issuanceClaim,
      JSON.stringify(signal), signal.issuedAt,
    );
    return (result.changes as number) > 0;
  }

  saveContract(row: ContractRow): void {
    this.db.prepare(
      "INSERT INTO contracts (contract_id, candidate_id, signal_id, state, contract_json, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(contract_id) DO UPDATE SET signal_id = excluded.signal_id, state = excluded.state, contract_json = excluded.contract_json, updated_at = excluded.updated_at",
    ).run(row.contractId, row.candidateId, row.signalId, row.state, row.contractJson, row.updatedAt);
  }

  appendSuppression(row: SuppressionRow): void {
    this.db.prepare(
      "INSERT INTO suppressions (id, candidate_id, terminal, symbol, direction, signal_date, gate, reason, origin, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING",
    ).run(
      row.id, row.candidateId, row.terminal, row.symbol, row.direction,
      row.signalDate, row.gate, row.reason, row.origin, row.at,
    );
  }

  /**
   * appendAlert = ENQUEUE. The row is written with enqueuedAt set and
   * deliveredAt null (deliveryStatus "enqueued"); delivery is a separate
   * step via markAlertDelivered. ON CONFLICT(id) DO NOTHING keeps
   * exactly-once across retries (a re-enqueue never rewrites the original
   * enqueue timestamp).
   */
  appendAlert(row: AlertRow): void {
    this.db.prepare(
      "INSERT INTO alerts (id, kind, signal_id, candidate_id, symbol, direction, alerted_at, channel, enqueued_at, delivered_at, delivery_status, delivery_mode, ack_id, delivery_attempts, delivery_claim) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL) ON CONFLICT(id) DO NOTHING",
    ).run(
      row.id, row.kind, row.signalId, row.candidateId, row.symbol, row.direction,
      row.alertedAt, row.channel, row.enqueuedAt, row.deliveredAt, row.deliveryStatus,
      row.deliveryMode, row.ackId, row.deliveryAttempts,
    );
  }

  /**
   * CLAIM-BEFORE-SEND (workstream B): the idempotency mechanism for alert
   * delivery. Run inside the sender's transition transaction: the claim
   * moves the row to "sending" and stamps the sender's claim id + an
   * attempt count atomically, so two concurrent senders (tick + recovery,
   * two processes) cannot both send the same alert. Returns true iff this
   * caller won the claim. A crash after the claim but before the
   * acknowledgement leaves "sending" — recovery reclaims it (the claim is
   * scoped to this process; production would need a claim lease/expiry,
   * which the sandbox deliberately does not implement).
   */
  claimAlertForDelivery(alertId: string, claim: string): boolean {
    const result = this.db.prepare(
      "UPDATE alerts SET delivery_status = 'sending', delivery_claim = ?, delivery_attempts = delivery_attempts + 1 WHERE id = ? AND delivery_status IN ('enqueued', 'failed', 'sending')",
    ).run(claim, alertId);
    return (result.changes as number) > 0;
  }

  /**
   * Record alert delivery: sets delivered_at, delivery_mode, and the ack id,
   * flips delivery_status to "delivered". IDEMPOTENT on the acknowledgement:
   * the update only fires when the row is not already delivered, so a
   * duplicate ack (redelivery producing the same ack id, or a late duplicate
   * acknowledgement) is a no-op — the first acknowledgement wins.
   * Sandbox/test acknowledgements MUST be labeled mode "simulated" (callers
   * that do not pass a mode get "simulated" here as the fail-safe default —
   * never "live").
   */
  markAlertDelivered(
    alertId: string,
    at: string,
    opts?: { mode?: "simulated" | "live"; ackId?: string },
  ): void {
    this.db.prepare(
      "UPDATE alerts SET delivered_at = ?, delivery_status = 'delivered', delivery_mode = ?, ack_id = COALESCE(?, ack_id), delivery_claim = NULL WHERE id = ? AND delivery_status != 'delivered'",
    ).run(at, opts?.mode ?? "simulated", opts?.ackId ?? null, alertId);
  }

  /**
   * Record a delivery failure: the transport threw or declined the
   * acknowledgement. The alert stays undelivered (status "failed") and is
   * picked up by the recovery pass (recoverUndeliveredAlerts). No-op on an
   * already-delivered alert — a failure can never un-deliver.
   */
  markAlertFailed(alertId: string): void {
    this.db.prepare(
      "UPDATE alerts SET delivery_status = 'failed', delivery_claim = NULL WHERE id = ? AND delivery_status != 'delivered'",
    ).run(alertId);
  }

  noteIssuanceAttempt(): void {
    this.db.prepare(
      "INSERT INTO meta (key, value) VALUES ('issuance_attempts', '1') ON CONFLICT(key) DO UPDATE SET value = CAST(CAST(meta.value AS INTEGER) + 1 AS TEXT)",
    ).run();
  }

  /** Test/support: does the store hold any row in the given table? */
  tableCount(table: "candidates" | "signals" | "contracts" | "suppressions" | "alerts"): number {
    const row = this.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number };
    return row.n;
  }
}

/** Terminal candidate statuses: the handler must not overwrite these. */
const TERMINAL_STATUSES: ReadonlySet<CandidateStatus> = new Set([
  "issued",
  "rejected",
  "expired",
  "invalidated",
  "entry-expired",
]);

export function isTerminalStatus(status: CandidateStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}
