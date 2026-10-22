/**
 * SANDBOX DOUBLE of the crypto production issuer.
 *
 * Production function mirrored: `issueGeneratedSignalCandidate`
 *   crypto/server/src/actions.ts:1976
 *   (called only from manual `analyzeCoin` dossier at :3411 and the diagnostic
 *   `verifySignalIssuanceControls` at :5091-5092 — never from discovery)
 *
 * Mirrored semantics:
 *   1. Born-dead veto via the VENDORED `evaluateBornDead` (actions.ts:1219),
 *      then the short-regime veto for shorts via VENDORED
 *      `evaluateShortRegimeGate` (actions.ts:1206) — same veto order as
 *      production (:1978-1979). Blocked -> suppression row with origin "issuer"
 *      (mirrors `logSuppressedSignal` with source "dossier" at :1981).
 *   2. Idempotency key `${coinId}|spot-reference|${strategyId}|${strategyVersion}|${parameterHash}|${barEnd}`
 *      (production :1984). An existing complete issuance returns
 *      `already_exists` — the same candidate reassessed twice issues at most once.
 *   3. Atomic persist of the issuance bundle: input snapshot + signal contract +
 *      generated signal, then re-read of the accepted bundle (mirrors
 *      `persistSignalIssuanceBundle` at issuance-persistence.ts:11).
 *
 * Differences from production (all sandbox-scoped, documented):
 *   - ctx is (store, clock), never a Drizzle DB handle or invocation context.
 *   - The signal-day candle arrives on the draft (validated at reassessment);
 *     production loads it internally via `loadIssuanceSignalDayCandle`.
 *   - No post-decision provider quote -> levels rebuild step: the orchestrator
 *     reassesses with fresh inputs, so entry/invalidation on the draft are
 *     already final. A draft with missing levels is suppressed, mirroring
 *     production's "No timestamped post-decision provider quote" suppression.
 *   - Strategy ids / venue are paper-* ("SANDBOX (paper)"), never production ids.
 *   - Phase-1 freeze check is a no-op in the sandbox (noted, not faked).
 *
 * THIS DOUBLE MUST NEVER BE POINTED AT A PRODUCTION STORE.
 */
import type { Clock } from "../clock.js";
import type { Direction, SuppressionRow } from "../types.js";
import { SANDBOX } from "../types.js";
import { contentHash } from "../util.js";
import { evaluateBornDead, evaluateShortRegimeGate } from "../gates/crypto-gates.js";
import type { ShortRegimeGate } from "../gates/crypto-gates.js";
import type { WriteStore } from "./sandbox-store.js";

export interface SandboxCryptoDraft {
  coinId: string;
  name: string;
  symbol: string;
  direction: Direction;
  entry: number | null;
  invalidation: number | null;
  target1: number | null;
  target2: number | null;
  confidence: number;
  /** Signal-day candle validated at reassessment (production loads this itself). */
  signalDay: { day: string; open: number | null; high: number | null; low: number | null; close: number; source: string } | null;
  /** Fresh history through the signal day, for the short-regime gate. */
  historyCloses: number[];
  historyHighs: number[];
  currentPrice: number | null;
  createdAt: string; // ISO
  sourceAsOf: string; // ISO
}

export type SandboxIssuanceStatus = "published" | "already_exists" | "suppressed";

export interface SandboxCryptoIssuanceResult {
  status: SandboxIssuanceStatus;
  reason: string | null;
  signalId: string | null;
}

export async function sandboxIssueGeneratedSignalCandidate(
  store: WriteStore,
  clock: Clock,
  draft: SandboxCryptoDraft,
  candidateId: string,
): Promise<SandboxCryptoIssuanceResult> {
  store.noteIssuanceAttempt();
  const at = new Date(clock.now()).toISOString();

  // (1) Veto order mirrors production: born-dead first, then short-regime for shorts.
  const candle = draft.signalDay;
  const bornDead = evaluateBornDead(draft.direction, draft.invalidation ?? NaN, candle);
  const shortRegime: ShortRegimeGate | null =
    draft.direction === "short" ? evaluateShortRegimeGate(draft.currentPrice, draft.historyCloses, draft.historyHighs) : null;
  const blocked = !bornDead.publish
    ? bornDead.reason
    : draft.direction === "short" && shortRegime && !shortRegime.allowed
      ? shortRegime.reason
      : null;
  if (blocked) {
    const gate = blocked.includes("born-dead") ? "born-dead" : "short-regime";
    appendSuppression(store, {
      candidateId, coinId: draft.coinId, symbol: draft.symbol, direction: draft.direction,
      signalDate: candle?.day ?? draft.createdAt.slice(0, 10), gate, reason: blocked, at,
    });
    return { status: "suppressed", reason: blocked, signalId: null };
  }

  // Levels must be final (orchestrator reassessed with fresh inputs already).
  if (draft.entry === null || draft.invalidation === null) {
    const reason = "No final entry/invalidation levels on the draft; the research reference was not promoted to a paper entry.";
    appendSuppression(store, {
      candidateId, coinId: draft.coinId, symbol: draft.symbol, direction: draft.direction,
      signalDate: candle?.day ?? draft.createdAt.slice(0, 10), gate: "levels", reason, at,
    });
    return { status: "suppressed", reason, signalId: null };
  }

  // (2) Idempotency — mirrors production's idempotency key (:1984).
  const barStart = candle ? Date.parse(`${candle.day}T00:00:00.000Z`) : Math.floor(Date.parse(draft.sourceAsOf) / 86_400_000) * 86_400_000;
  const barEnd = barStart + 86_400_000;
  const idempotencyKey = `${draft.coinId}|spot-reference|${SANDBOX.cryptoStrategyId}|${SANDBOX.cryptoStrategyVersion}|${SANDBOX.parameterHash}|${barEnd}`;
  const existing = store.listSignals().find((s) => s.identityHash === idempotencyKey);
  if (existing) {
    return {
      status: "already_exists",
      reason: "The complete immutable issuance already exists; this retry returned the accepted bundle.",
      signalId: existing.signalId,
    };
  }

  // (3) Atomic persist of the bundle, then re-read of the accepted row.
  const signalId = `sig_${contentHash(idempotencyKey).slice(0, 24)}`;
  store.persistIssuedSignal({
    signalId,
    candidateId,
    identityHash: idempotencyKey,
    contractId: null, // legacy path: no entry contract; the integrated path persists the contract id
    terminal: "crypto",
    symbol: draft.symbol,
    coinId: draft.coinId,
    name: draft.name,
    direction: draft.direction,
    score: draft.confidence,
    entryPrice: draft.entry,
    invalidation: draft.invalidation,
    target1: draft.target1,
    target2: draft.target2,
    signalDate: candle?.day ?? draft.createdAt.slice(0, 10),
    issuedAt: at,
    alertedAt: null,
    delays: null,
    gateSummary: bornDead.reason ?? (shortRegime ? `short-regime cleared: ${shortRegime.reason}` : "born-dead cleared; longs skip the short-regime gate"),
    origin: "orchestrator",
  });
  const accepted = store.listSignals().find((s) => s.identityHash === idempotencyKey);
  if (!accepted) throw new Error("Atomic issuance did not expose an accepted signal bundle; retry is safe.");
  return { status: "published", reason: null, signalId: accepted.signalId };
}

function appendSuppression(
  store: WriteStore,
  input: { candidateId: string; coinId: string; symbol: string; direction: Direction; signalDate: string; gate: string; reason: string; at: string },
): void {
  const row: SuppressionRow = {
    id: `sup_${contentHash({ ...input, at: input.at }).slice(0, 16)}`,
    candidateId: input.candidateId,
    terminal: "crypto",
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
