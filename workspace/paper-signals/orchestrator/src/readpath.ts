/**
 * READ PATH — dossier views for the paper-signal lane.
 *
 * CRITICAL SAFETY: viewing a dossier must NEVER issue a signal. This module is
 * the proof of that separation:
 *
 *   - It imports ONLY the ReadStore interface and shared types. It does NOT
 *     import the orchestrator, either issuer double, or any gate function.
 *   - It receives a ReadStore (read-only subset), never a WriteStore — it has
 *     no handle capable of persisting an issuance even by accident.
 *   - It performs no clock reads for issuance, no quote refreshes, no writes.
 *
 * The test suite enforces this two ways:
 *   (a) runtime: exercising viewDossier over a qualifying candidate asserts
 *       zero new signals, zero alerts, zero issuance attempts;
 *   (b) static: a test scans this file's source and fails if it ever imports
 *       anything from the issuers directory (other than the store types) or
 *       from the orchestrator module.
 */
import type { AlertRow, CandidateRecord, IssuedSignal, SuppressionRow } from "./types.js";
import type { ReadStore } from "./issuers/sandbox-store.js";

export interface DossierView {
  candidate: CandidateRecord;
  /** The issued signal, if this candidate was ever issued (null otherwise). */
  signal: IssuedSignal | null;
  alerts: AlertRow[];
  suppressionHistory: SuppressionRow[];
}

/** Pure read: assemble a candidate's dossier. Zero side effects. */
export function viewDossier(store: ReadStore, candidateId: string): DossierView | null {
  const candidate = store.getCandidate(candidateId);
  if (!candidate) return null;
  const signal = candidate.issuedSignalId
    ? (store.listSignals().find((s) => s.signalId === candidate.issuedSignalId) ?? null)
    : null;
  return {
    candidate,
    signal,
    alerts: store.listAlerts().filter((a) => a.candidateId === candidateId),
    suppressionHistory: store.listSuppressions().filter((s) => s.candidateId === candidateId),
  };
}

/** Pure read: every issued sandbox signal with its recorded delays (tracker view). */
export function trackerView(store: ReadStore): IssuedSignal[] {
  return [...store.listSignals()].sort((a, b) => (a.issuedAt < b.issuedAt ? -1 : 1));
}

/** Pure read: the sandbox alert feed, newest first. */
export function alertFeed(store: ReadStore): AlertRow[] {
  return [...store.listAlerts()].sort((a, b) => (a.alertedAt < b.alertedAt ? 1 : -1));
}
