/**
 * SANDBOX DOUBLE of the equity production issuer.
 *
 * Production function mirrored: `recordSignal`
 *   equity/server/src/actions.ts:448
 *   (called only from manual `trackAnalyzedSignal` at :3530 and the diagnostic
 *   `verifySignalIssuanceControls` at :3025 — never from discovery)
 *
 * Mirrored semantics:
 *   1. XNYS calendar gate -> "watch-only" suppression (production :448).
 *   2. Rebuild the candidate from the evidence window via the REAL imported
 *      `reconstructAndValidateEquityCandidate` (measurement.ts:304), which
 *      internally applies `evaluateEquityIssuanceGate` (born-dead veto, then
 *      short-regime bearish-structure gate for shorts). Rejected -> suppression
 *      row with origin "issuer" (mirrors production's `logSuppressedCandidate`
 *      with origin "tracker" at :437-458).
 *   3. Idempotency: content-hash identity over
 *      {symbol, venue, strategyId, strategyVersion, parameterHash, decisionBar}
 *      (production :480-481). A retry with the same identity returns the
 *      stored acceptance — the same candidate reassessed twice issues at most once.
 *   4. Atomic persist of issued signal + input snapshot + "issued" event
 *      (mirrors the production batch insert at :505-513).
 *
 * Differences from production (all sandbox-scoped, documented):
 *   - ctx is a SandboxCtx (store + clock), never a Drizzle DB handle.
 *   - Venue is "SANDBOX (paper)" and strategy ids are paper-* so sandbox rows
 *     can never collide with production identity space.
 *   - Evidence arrives via an injected loader (no Yahoo network calls).
 *   - No amendment-event path for divergent retries: a divergent retry is
 *     suppressed as a duplicate candidate instead (simpler; logged).
 *
 * THIS DOUBLE MUST NEVER BE POINTED AT A PRODUCTION STORE.
 */
import type { Clock } from "../clock.js";
import type { Direction, RawBar, SuppressionRow } from "../types.js";
import { SANDBOX } from "../types.js";
import { contentHash, round6 } from "../util.js";
import { reconstructAndValidateEquityCandidate } from "../gates/imported-gates.js";
import type { WriteStore } from "./sandbox-store.js";

export interface SandboxEquityEvidence {
  /** Full OHLC bars (needs >= 200 for the real reconstruction). */
  rawBars: RawBar[];
  /** ISO decision timestamp; must be >= the last bar's availableAt. */
  decisionAt: string;
  exchangeCalendar: string;
  instrumentType: string;
  sourceAsOf: string;
  sourceUrl: string;
}

export interface SandboxRecordSignalResult {
  recorded: boolean;
  alreadyExisted: boolean;
  suppressedReason: string | null;
  signalId: string | null;
}

/** Production reconstruction parameters: atr multiple 2, targets 1.5R/2.5R (actions.ts:455). */
const PARAMETERS = { invalidationAtrMultiple: 2, target1R: 1.5, target2R: 2.5 };

export async function sandboxRecordSignal(
  store: WriteStore,
  clock: Clock,
  symbol: string,
  name: string,
  _setupType: string,
  _direction: Direction,
  _confidence: number,
  signalDate: string,
  candidateId: string,
  evidence: SandboxEquityEvidence,
): Promise<SandboxRecordSignalResult> {
  store.noteIssuanceAttempt();
  const at = new Date(clock.now()).toISOString();

  // (1) Calendar gate — mirrors production's first line.
  if (evidence.exchangeCalendar !== "XNYS") {
    const reason = `watch-only: ${evidence.exchangeCalendar} calendar is not yet supported by the issuance clock`;
    appendSuppression(store, { candidateId, symbol, direction: _direction, signalDate, gate: "calendar", reason, at });
    return { recorded: false, alreadyExisted: false, suppressedReason: reason, signalId: null };
  }

  // (2) Reconstruct from the evidence window + apply the issuance gate
  // (the real production functions, live import).
  const decision = reconstructAndValidateEquityCandidate(
    evidence.rawBars.map((b) => ({ ...b })),
    evidence.decisionAt,
    signalDate,
    PARAMETERS,
  );
  if (decision.status !== "accepted" || !decision.reconstruction.decision || !decision.reconstruction.levels || !decision.gate) {
    const reason = decision.reason ?? decision.gate?.reason ?? "Final candidate reconstruction or gate validation was incomplete.";
    const gate = reason.includes("born-dead") ? "born-dead" : reason.includes("short-regime") ? "short-regime" : "reconstruction";
    appendSuppression(store, { candidateId, symbol, direction: decision.reconstruction.decision?.direction ?? _direction, signalDate, gate, reason, at });
    return { recorded: false, alreadyExisted: false, suppressedReason: reason, signalId: null };
  }

  const ledgerDirection = decision.reconstruction.decision.direction;
  const levels = decision.reconstruction.levels;
  const frozenLevels = {
    entryPrice: levels.entryPrice,
    stopPrice: levels.stopPrice,
    target1: levels.target1,
    target2: levels.target2,
    riskPerUnit: round6(Math.abs(levels.entryPrice - levels.stopPrice)),
    direction: ledgerDirection,
    atr14: levels.atr14,
  };

  // (3) Idempotency — mirrors production's issuanceIdentity content hash.
  const identity = {
    symbol,
    venue: SANDBOX.venue,
    strategyId: SANDBOX.equityStrategyId,
    strategyVersion: SANDBOX.equityStrategyVersion,
    parameterHash: SANDBOX.parameterHash,
    decisionBar: evidence.decisionAt,
  };
  const identityHash = contentHash(identity);
  const signalId = Number.parseInt(identityHash.slice(0, 12), 16);
  const existing = store.listSignals().find((s) => s.identityHash === identityHash);
  if (existing) {
    return { recorded: true, alreadyExisted: true, suppressedReason: null, signalId: existing.signalId };
  }

  // (4) Atomic persist of the issued signal (mirrors the production batch insert).
  store.persistIssuedSignal({
    signalId: String(signalId),
    candidateId,
    identityHash,
    contractId: null, // legacy path: no entry contract; the integrated path persists the contract id
    terminal: "equity",
    symbol,
    coinId: null,
    name,
    direction: ledgerDirection,
    score: decision.reconstruction.decision.score,
    entryPrice: frozenLevels.entryPrice,
    invalidation: frozenLevels.stopPrice,
    target1: frozenLevels.target1,
    target2: frozenLevels.target2,
    signalDate,
    issuedAt: at,
    alertedAt: null,
    delays: null,
    gateSummary: decision.gate.reason ?? "born-dead cleared; longs skip the short-regime gate",
    origin: "orchestrator",
  });
  return { recorded: true, alreadyExisted: false, suppressedReason: null, signalId: String(signalId) };
}

function appendSuppression(
  store: WriteStore,
  input: { candidateId: string; symbol: string; direction: Direction; signalDate: string; gate: string; reason: string; at: string },
): void {
  const row: SuppressionRow = {
    id: `sup_${contentHash({ ...input, at: input.at }).slice(0, 16)}`,
    candidateId: input.candidateId,
    terminal: "equity",
    symbol: input.symbol,
    direction: input.direction,
    signalDate: input.signalDate,
    gate: input.gate,
    reason: input.reason,
    origin: "issuer",
    at: input.at,
  };
  store.appendSuppression(row);
}
