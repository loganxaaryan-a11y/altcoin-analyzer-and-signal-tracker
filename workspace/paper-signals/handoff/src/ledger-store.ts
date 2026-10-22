/**
 * Handoff ledger store (sandbox, node:sqlite).
 *
 * Three tables:
 *   discovery_runs  — one row per consumed discovery run (idempotent re-run safe)
 *   factor_ledger   — the COMPLETE factor ledger + decision-time evidence per
 *                     candidate, persisted BEFORE qualification runs.
 *   handoff_outcomes— one row per candidate per run: qualified | abstained |
 *                     deferred | failed + exact reason code.
 *
 * Enforcement: `requireLedger(candidateKey)` throws MissingLedgerError when
 * no ledger row exists. The qualification step calls it first — no ledger,
 * no qualification. Missing evidence fields are persisted as null and stay
 * null (unknown), never fabricated.
 */
import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import type { DiscoveryRun, RadarCandidate } from "./discovery-types.js";

export class MissingLedgerError extends Error {
  constructor(candidateKey: string) {
    super(`no factor ledger persisted for candidate ${candidateKey}: cannot qualify`);
    this.name = "MissingLedgerError";
  }
}

export type HandoffOutcome = "qualified" | "abstained" | "deferred" | "failed";

export interface HandoffOutcomeRow {
  runId: string;
  candidateKey: string;
  symbol: string;
  direction: string;
  outcome: HandoffOutcome;
  reasonCode: string;
  reason: string;
  gate: string | null;
  handlerOutcomeKind: string | null;
  ledgerHash: string | null;
  recordedAt: string;
}

export function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

export function stableJson(v: unknown): string {
  return JSON.stringify(v);
}

/** Deterministic candidate identity for one discovery run. */
export function candidateKeyFor(runId: string, c: RadarCandidate): string {
  return sha256Hex(stableJson({
    runId,
    symbol: c.symbol,
    coinId: c.coinId ?? null,
    direction: c.direction,
    signalDate: c.signalDate,
    detectedAt: c.detectedAt,
  })).slice(0, 32);
}

export class HandoffStore {
  private db: DatabaseSync;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS discovery_runs (
        run_id TEXT PRIMARY KEY,
        source TEXT NOT NULL,
        completed_at TEXT NOT NULL,
        freeze_version TEXT NOT NULL,
        demo INTEGER NOT NULL DEFAULT 0,
        candidate_count INTEGER NOT NULL,
        received_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS factor_ledger (
        candidate_key TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        direction TEXT NOT NULL,
        ledger_json TEXT, -- null when the candidate arrived with no factor ledger (ledger_complete=0)
        ledger_hash TEXT NOT NULL,
        evidence_json TEXT NOT NULL,
        ledger_complete INTEGER NOT NULL,
        persisted_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS handoff_outcomes (
        run_id TEXT NOT NULL,
        candidate_key TEXT NOT NULL,
        symbol TEXT NOT NULL,
        direction TEXT NOT NULL,
        outcome TEXT NOT NULL,
        reason_code TEXT NOT NULL,
        reason TEXT NOT NULL,
        gate TEXT,
        handler_outcome_kind TEXT,
        ledger_hash TEXT,
        recorded_at TEXT NOT NULL,
        PRIMARY KEY (run_id, candidate_key)
      );
    `);
  }

  /** Run fn inside BEGIN IMMEDIATE / COMMIT (rollback on throw). */
  private transact<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const out = fn();
      this.db.exec("COMMIT");
      return out;
    } catch (err) {
      try { this.db.exec("ROLLBACK"); } catch { /* already rolled back */ }
      throw err;
    }
  }

  /**
   * Persist the complete factor ledger + decision-time evidence for every
   * candidate in the run. Runs BEFORE any qualification. A candidate with
   * no factorLedger gets a ledger row with ledger_complete=0 and a null
   * ledger_json — requireLedger() then refuses it.
   */
  persistDiscoveryRun(run: DiscoveryRun, receivedAt: string): { candidateKeys: string[] } {
    const keys: string[] = [];
    this.transact(() => {
      this.db.prepare(`
        INSERT INTO discovery_runs (run_id, source, completed_at, freeze_version, demo, candidate_count, received_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(run_id) DO NOTHING
      `).run(run.runId, run.source, run.completedAt, run.freezeVersion, run.demo ? 1 : 0, run.candidates.length, receivedAt);
      for (const c of run.candidates) {
        const key = candidateKeyFor(run.runId, c);
        keys.push(key);
        const complete = Array.isArray(c.factorLedger) && c.factorLedger.length > 0 && c.decisionEvidence != null;
        const ledgerJson = c.factorLedger ? stableJson(c.factorLedger) : null;
        const evidenceJson = stableJson({
          decisionEvidence: c.decisionEvidence,
          totalWeight: c.totalWeight,
          entryPrice: c.entryPrice,
          invalidation: c.invalidation,
          target1: c.target1,
          target2: c.target2,
          score: c.score,
          detectedAt: c.detectedAt,
          signalDate: c.signalDate,
        });
        const hash = sha256Hex(stableJson({ ledger: ledgerJson, evidence: evidenceJson }));
        this.db.prepare(`
          INSERT INTO factor_ledger (candidate_key, run_id, symbol, direction, ledger_json, ledger_hash, evidence_json, ledger_complete, persisted_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(candidate_key) DO NOTHING
        `).run(key, run.runId, c.symbol, c.direction, ledgerJson, hash, evidenceJson,
          complete ? 1 : 0, receivedAt);
      }
    });
    return { candidateKeys: keys };
  }

  /** Enforcement point: throws MissingLedgerError when no (complete) ledger exists. */
  requireLedger(candidateKey: string): { ledgerHash: string; ledgerJson: string } {
    const row = this.db.prepare(
      `SELECT ledger_json, ledger_hash, ledger_complete FROM factor_ledger WHERE candidate_key = ?`
    ).get(candidateKey) as { ledger_json: string | null; ledger_hash: string; ledger_complete: number } | undefined;
    if (!row || !row.ledger_json || row.ledger_complete !== 1) {
      throw new MissingLedgerError(candidateKey);
    }
    return { ledgerHash: row.ledger_hash, ledgerJson: row.ledger_json };
  }

  ledgerHashFor(candidateKey: string): string | null {
    const row = this.db.prepare(
      `SELECT ledger_hash FROM factor_ledger WHERE candidate_key = ?`
    ).get(candidateKey) as { ledger_hash: string } | undefined;
    return row?.ledger_hash ?? null;
  }

  /** True when the candidate arrived with a complete factor ledger + evidence. */
  ledgerCompleteFor(candidateKey: string): boolean {
    const row = this.db.prepare(
      `SELECT ledger_complete FROM factor_ledger WHERE candidate_key = ?`
    ).get(candidateKey) as { ledger_complete: number } | undefined;
    return row?.ledger_complete === 1;
  }

  recordOutcome(row: Omit<HandoffOutcomeRow, "recordedAt">): void {
    this.db.prepare(`
      INSERT INTO handoff_outcomes
        (run_id, candidate_key, symbol, direction, outcome, reason_code, reason, gate, handler_outcome_kind, ledger_hash, recorded_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(run_id, candidate_key) DO UPDATE SET
        outcome=excluded.outcome, reason_code=excluded.reason_code, reason=excluded.reason,
        gate=excluded.gate, handler_outcome_kind=excluded.handler_outcome_kind,
        ledger_hash=excluded.ledger_hash, recorded_at=excluded.recorded_at
    `).run(
      row.runId, row.candidateKey, row.symbol, row.direction, row.outcome,
      row.reasonCode, row.reason, row.gate, row.handlerOutcomeKind, row.ledgerHash,
      new Date().toISOString(),
    );
  }

  outcomesForRun(runId: string): HandoffOutcomeRow[] {
    return this.db.prepare(
      `SELECT run_id AS runId, candidate_key AS candidateKey, symbol, direction, outcome,
              reason_code AS reasonCode, reason, gate,
              handler_outcome_kind AS handlerOutcomeKind, ledger_hash AS ledgerHash,
              recorded_at AS recordedAt
       FROM handoff_outcomes WHERE run_id = ? ORDER BY symbol`
    ).all(runId) as HandoffOutcomeRow[];
  }

  outcomeCounts(runId: string): Record<HandoffOutcome, number> {
    const counts: Record<HandoffOutcome, number> = { qualified: 0, abstained: 0, deferred: 0, failed: 0 };
    for (const o of this.outcomesForRun(runId)) counts[o.outcome] += 1;
    return counts;
  }

  close(): void {
    this.db.close();
  }
}
