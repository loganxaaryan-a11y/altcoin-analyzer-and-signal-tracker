/**
 * Sandbox store: file-backed JSON persistence for the paper-signal lane.
 *
 * SANDBOX ONLY. This store is a plain JSON file under the orchestrator's own
 * data directory. It never touches a production database, a production schema,
 * or a production table. The read path (src/readpath.ts) only ever receives the
 * ReadStore subset; only the orchestrator + issuer doubles receive WriteStore.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { AlertRow, CandidateRecord, IssuedSignal, SuppressionRow } from "../types.js";

export interface ReadStore {
  getCandidate(candidateId: string): CandidateRecord | null;
  listCandidates(): CandidateRecord[];
  listSignals(): IssuedSignal[];
  listSuppressions(): SuppressionRow[];
  listAlerts(): AlertRow[];
  getIssuanceAttempts(): number;
}

export interface WriteStore extends ReadStore {
  upsertCandidate(record: CandidateRecord): void;
  saveCandidate(record: CandidateRecord): void;
  persistIssuedSignal(signal: IssuedSignal): void;
  appendSuppression(row: SuppressionRow): void;
  appendAlert(row: AlertRow): void;
  noteIssuanceAttempt(): void;
}

interface StoreFile {
  version: 1;
  candidates: Record<string, CandidateRecord>;
  signals: Record<string, IssuedSignal>;
  suppressions: SuppressionRow[];
  alerts: AlertRow[];
  issuanceAttempts: number;
}

function emptyStore(): StoreFile {
  return { version: 1, candidates: {}, signals: {}, suppressions: [], alerts: [], issuanceAttempts: 0 };
}

export class SandboxStore implements WriteStore {
  private file: StoreFile = emptyStore();
  private readonly path: string;

  constructor(filePath: string) {
    this.path = resolve(filePath);
    if (existsSync(this.path)) {
      const raw = readFileSync(this.path, "utf8");
      this.file = JSON.parse(raw) as StoreFile;
    }
  }

  /** Atomic persist: write temp + rename, so a crash never leaves a half-written file. */
  private save(): void {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.file, null, 2), "utf8");
    renameSync(tmp, this.path);
  }

  // ---- reads ----
  getCandidate(candidateId: string): CandidateRecord | null {
    return this.file.candidates[candidateId] ?? null;
  }
  listCandidates(): CandidateRecord[] {
    return Object.values(this.file.candidates);
  }
  listSignals(): IssuedSignal[] {
    return Object.values(this.file.signals);
  }
  listSuppressions(): SuppressionRow[] {
    return [...this.file.suppressions];
  }
  listAlerts(): AlertRow[] {
    return [...this.file.alerts];
  }
  getIssuanceAttempts(): number {
    return this.file.issuanceAttempts;
  }

  // ---- writes ----
  upsertCandidate(record: CandidateRecord): void {
    if (!this.file.candidates[record.candidateId]) this.file.candidates[record.candidateId] = record;
    this.save();
  }
  saveCandidate(record: CandidateRecord): void {
    this.file.candidates[record.candidateId] = record;
    this.save();
  }
  persistIssuedSignal(signal: IssuedSignal): void {
    this.file.signals[signal.signalId] = signal;
    this.save();
  }
  appendSuppression(row: SuppressionRow): void {
    this.file.suppressions.push(row);
    this.save();
  }
  appendAlert(row: AlertRow): void {
    this.file.alerts.push(row);
    this.save();
  }
  noteIssuanceAttempt(): void {
    this.file.issuanceAttempts += 1;
    this.save();
  }
}

/** Default sandbox store location: inside the orchestrator's own data dir. */
export function defaultStorePath(): string {
  return resolve(dirname(new URL(import.meta.url).pathname), "..", "..", "data", "sandbox-store.json");
}
