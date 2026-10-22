/**
 * Issuance gate — kill-band enforcement at issuance boundaries.
 * States: NORMAL (default, no row) | WARNING (issuable, flagged) |
 * ISSUANCE_DISABLED (refused at the transactional boundary).
 */
export type BandIssuanceState = "NORMAL" | "WARNING" | "ISSUANCE_DISABLED";
export type IssuancePath = "manual" | "dossier" | "scheduled";
export type GateDecision = "allowed" | "blocked" | "warning_allowed";
export interface BandReliabilityInput { bandKey: string; killFlag: boolean; status: "calibrated" | "limited" | "uncalibrated"; sampleSize: number; expectancyR: number | null; }
export interface ExplicitBandState { band: string; state: "WARNING" | "ISSUANCE_DISABLED"; reason: string; setBy: string; setAt: Date; }
export interface BandGateRead { explicit: ExplicitBandState | null; revision: number; }
export interface GateAuditRow { id: string; createdAt: Date; path: IssuancePath; score: number; band: string; bandState: BandIssuanceState; decision: GateDecision; reason: string; isTest: boolean; signalIdentity: string | null; }
export interface IssuanceGateStore {
  readBandGate(band: string): Promise<BandGateRead>;
  setBandState(input: { band: string; state: BandIssuanceState; reason: string; setBy: string; expectancyR?: number | null; sampleSize?: number | null; isTest: boolean }): Promise<{ state: BandIssuanceState; revision: number }>;
  insertGateAudit(row: GateAuditRow): Promise<void>;
  listGateAudits(input?: { band?: string; limit?: number }): Promise<Array<{ id: string; createdAt: string; path: string; score: number; band: string; decision: string; bandState: string; reason: string; isTest: number; signalIdentity: string | null }>>;
  listBandStateHistory(band?: string): Promise<Array<{ id: number; band: string; fromState: string | null; toState: string; reason: string; setBy: string }>>;
}
export function resolveBandIssuanceState(reliability: BandReliabilityInput, explicit: ExplicitBandState | null): { state: BandIssuanceState; basis: string } {
  if (explicit) return { state: explicit.state, basis: `explicit band state ${explicit.state} (set by ${explicit.setBy} at ${explicit.setAt.toISOString()}: ${explicit.reason})` };
  if (reliability.killFlag) return { state: "WARNING", basis: `killFlag=true (expectancy ${reliability.expectancyR}R, n=${reliability.sampleSize}, status=${reliability.status}) — under review per expert constraint; negative retrospective expectancy alone does not disable issuance` };
  if (reliability.status === "uncalibrated") return { state: "WARNING", basis: "uncalibrated band (n=0); no measured edge yet — issuance permitted with warning" };
  return { state: "NORMAL", basis: `killFlag=false, status=${reliability.status}, n=${reliability.sampleSize}` };
}
export interface GatedIssuanceInput { path: IssuancePath; score: number; band: string; reliability: BandReliabilityInput; isTest: boolean; signalIdentity?: string; }
export interface GatedIssuanceResult { issued: boolean; decision: GateDecision; bandState: BandIssuanceState; reason: string; auditId: string; revision: number; }
export function newGateId(prefix: string): string { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`; }
export async function attemptGatedIssuance(store: IssuanceGateStore, input: GatedIssuanceInput): Promise<GatedIssuanceResult> {
  const now = new Date();
  const { explicit, revision } = await store.readBandGate(input.band);
  const { state, basis } = resolveBandIssuanceState(input.reliability, explicit);
  const decision: GateDecision = state === "ISSUANCE_DISABLED" ? "blocked" : state === "WARNING" ? "warning_allowed" : "allowed";
  const reason = state === "ISSUANCE_DISABLED"
    ? `Issuance BLOCKED at read time: band ${input.band} is ISSUANCE_DISABLED (${basis}). Score ${input.score} via ${input.path} path refused.`
    : state === "WARNING" ? `Issuance ALLOWED with WARNING: band ${input.band} (${basis}). Warning flag visible, non-blocking.`
    : `Issuance ALLOWED: band ${input.band} (${basis}).`;
  const auditId = newGateId("gate");
  await store.insertGateAudit({ id: auditId, createdAt: now, path: input.path, score: input.score, band: input.band, bandState: state, decision, reason, isTest: input.isTest, signalIdentity: input.signalIdentity ?? null });
  return { issued: decision !== "blocked", decision, bandState: state, reason, auditId, revision };
}
export function bandKeyForScore(score: number): string { if (score >= 80) return "80–100"; if (score >= 65) return "65–79"; if (score >= 50) return "50–64"; return "0–49"; }

export class KillBandRevisionMismatchError extends Error {
  constructor(public readonly band: string, public readonly expectedRevision: number, public readonly currentRevision: number) {
    super(`kill_band_revision_mismatch: band ${band}, expected revision ${expectedRevision}, found ${currentRevision}`);
    this.name = "KillBandRevisionMismatchError";
  }
}
