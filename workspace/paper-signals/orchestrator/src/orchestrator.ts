/**
 * THE single issuance orchestrator (sandbox).
 *
 * One code path serves both entry points:
 *   - automatic: `tick()` — scheduler-compatible, no cron wiring; iterates
 *     pending + due deferred candidates from the shortlist/watchlist.
 *   - manual: `manualIssue()` — explicit manual entry point that runs the SAME
 *     reassess -> qualify -> issue pipeline.
 *
 * Per-candidate pipeline (mirrors the production issuance shape):
 *   1. expiry check (configurable TTL from detection)
 *   2. min-score floor (config, 0 = disabled)
 *   3. freshness-gated cheap refresh of inputs (watchlist-style; the orchestrator
 *      never rescans the full universe — it reassesses watched candidates)
 *   4. qualification against the existing gate rules on FRESH inputs:
 *        equity: vendored `signalIssuanceDecision` (born-dead, then short-regime)
 *        crypto: vendored `evaluateBornDead` then `evaluateShortRegimeGate`
 *   5. duplicate suppression (same instrument+direction within window)
 *   6. issue via the sandbox issuer doubles (which re-validate + enforce
 *      idempotency, exactly like production)
 *   7. alert append + detection/qualification/issuance/alert delay recording
 *
 * Every abstention persists a reason: issued / rejected (which gate) / deferred
 * (why + next reassessment time). Expired candidates are rejected with gate
 * "expiry".
 */
import type { Clock } from "./clock.js";
import type {
  AlertRow,
  CandidateRecord,
  CandidateStatus,
  DelayRecord,
  FreshInputs,
  IssuedSignal,
  OrchestratorConfig,
  OutcomeRecord,
  PaperCandidateInput,
} from "./types.js";
import { DEFAULT_CONFIG } from "./types.js";
import { contentHash, isoMs } from "./util.js";
import { evaluateBornDead, evaluateShortRegimeGate } from "./gates/crypto-gates.js";
import { signalIssuanceDecision } from "./gates/equity-gates.js";
import type { Point } from "./gates/equity-gates.js";
import type { WriteStore } from "./issuers/sandbox-store.js";
import { sandboxRecordSignal } from "./issuers/equity-issuer.js";
import { sandboxIssueGeneratedSignalCandidate } from "./issuers/crypto-issuer.js";

export interface QuoteProvider {
  /**
   * Cheap refresh of a watched candidate's inputs. Returns null when fresh
   * inputs are unavailable (provider failure) — the candidate is deferred,
   * never issued on stale evidence.
   */
  refresh(candidate: CandidateRecord, nowMs: number): Promise<FreshInputs | null>;
}

export interface OrchestratorDeps {
  store: WriteStore;
  clock: Clock;
  config?: Partial<OrchestratorConfig>;
  quoteProvider?: QuoteProvider;
}

export interface TickReport {
  at: string;
  processed: string[];
  issued: string[];
  rejected: string[];
  deferred: string[];
  expired: string[];
}

function cfg(deps: OrchestratorDeps): OrchestratorConfig {
  return { ...DEFAULT_CONFIG, ...(deps.config ?? {}) };
}

/**
 * Replay-safe identity: deterministic content hash over the candidate's
 * decision identity (NOT over scores, levels, live prices, or timestamps),
 * so the same candidate reassessed twice maps to one record and issues at
 * most once. Mirrors production's issuanceIdentity, which likewise hashes
 * identity (symbol/venue/strategy/decision-bar), not the scored levels —
 * exactly-once is enforced at the issuer layer on top of this.
 */
export function candidateIdFor(input: PaperCandidateInput): string {
  return contentHash({
    terminal: input.terminal,
    symbol: input.symbol,
    coinId: input.coinId ?? null,
    direction: input.direction,
    signalDate: input.signalDate,
    parameterHash: "sandbox-paper-v1",
  }).slice(0, 32);
}

export async function ingestCandidate(deps: OrchestratorDeps, input: PaperCandidateInput): Promise<CandidateRecord> {
  const candidateId = candidateIdFor(input);
  const existing = deps.store.getCandidate(candidateId);
  if (existing) return existing; // replay-safe: never overwrite an existing record
  const record: CandidateRecord = {
    ...input,
    inputs: { ...input.inputs },
    candidateId,
    firstSeenAt: input.detectedAt,
    lastReassessedAt: null,
    qualifiedAt: null,
    issuedAt: null,
    alertedAt: null,
    status: "pending" as CandidateStatus,
    outcome: null,
    nextReassessmentAt: null,
    issuedSignalId: null,
    delays: null,
    contractId: null,
    setupAlertAt: null,
    entryObservedAt: null,
  };
  deps.store.upsertCandidate(record);
  return record;
}

function reject(deps: OrchestratorDeps, candidate: CandidateRecord, gate: string, reason: string, via: "manual" | "automatic", detail?: Record<string, unknown>): CandidateRecord {
  const now = new Date(deps.clock.now()).toISOString();
  const outcome: OutcomeRecord = { kind: "rejected", gate, reason, via, detail };
  const status: CandidateStatus = gate === "expiry" ? "expired" : "rejected";
  const updated: CandidateRecord = { ...candidate, status, outcome, nextReassessmentAt: null, lastReassessedAt: now };
  deps.store.saveCandidate(updated);
  deps.store.appendSuppression({
    id: `sup_${contentHash({ candidateId: candidate.candidateId, gate, reason, at: now }).slice(0, 16)}`,
    candidateId: candidate.candidateId,
    terminal: candidate.terminal,
    symbol: candidate.symbol,
    direction: candidate.direction,
    signalDate: candidate.signalDate,
    gate,
    reason,
    origin: via === "manual" ? "manual" : "orchestrator",
    at: now,
  });
  return updated;
}

function gateFromEquityReason(reason: string | null): string {
  if (!reason) return "unknown";
  if (reason.includes("born-dead")) return "born-dead";
  if (reason.includes("short-regime")) return "short-regime";
  if (reason.includes("issuance-check unavailable")) return "evidence-insufficient";
  return "gate";
}

/** Qualification on fresh inputs. Returns null when the candidate qualifies. */
function qualifyCandidate(candidate: CandidateRecord): { gate: string; reason: string } | null {
  const inputs = candidate.inputs;
  if (candidate.terminal === "equity") {
    const rawBars = inputs.rawBars;
    if (!rawBars || rawBars.length === 0) {
      return { gate: "evidence-insufficient", reason: "equity reassessment requires rawBars evidence; none present" };
    }
    const history: Point[] = rawBars.map((b) => ({
      date: b.date, close: b.close ?? 0, open: b.open, high: b.high, low: b.low, volume: b.volume ?? null,
    }));
    const signalDay = history.find((p) => p.date === candidate.signalDate) ?? null;
    const decision = signalIssuanceDecision(candidate.direction, candidate.invalidation, signalDay, history);
    if (!decision.allowed) return { gate: gateFromEquityReason(decision.reason), reason: decision.reason ?? "issuance gate blocked" };
    return null;
  }
  // crypto
  const bornDead = evaluateBornDead(candidate.direction, candidate.invalidation, inputs.signalDay);
  if (!bornDead.publish) {
    const gate = (bornDead.reason ?? "").includes("born-dead") ? "born-dead" : "evidence-insufficient";
    return { gate, reason: bornDead.reason ?? "born-dead veto" };
  }
  if (candidate.direction === "short") {
    const regime = evaluateShortRegimeGate(inputs.currentPrice, inputs.historyCloses, inputs.historyHighs);
    if (!regime.allowed) return { gate: "short-regime", reason: regime.reason };
  }
  return null;
}

async function issueCandidate(deps: OrchestratorDeps, candidate: CandidateRecord, via: "manual" | "automatic"): Promise<CandidateRecord> {
  const nowMs = deps.clock.now();
  const now = new Date(nowMs).toISOString();
  const inputs = candidate.inputs;

  if (candidate.terminal === "equity") {
    const result = await sandboxRecordSignal(
      deps.store, deps.clock, candidate.symbol, candidate.name, "paper-shortlist",
      candidate.direction, candidate.score, candidate.signalDate, candidate.candidateId,
      {
        rawBars: inputs.rawBars ?? [],
        decisionAt: inputs.asOf,
        exchangeCalendar: "XNYS",
        instrumentType: "equity",
        sourceAsOf: inputs.asOf,
        sourceUrl: "sandbox://paper",
      },
    );
    if (!result.recorded || !result.signalId) {
      return reject(deps, candidate, "issuer-suppression", result.suppressedReason ?? "issuer suppressed", via);
    }
    return finalizeIssuance(deps, candidate, result.signalId, nowMs, now, via,
      "real reconstructAndValidateEquityCandidate + evaluateEquityIssuanceGate (live import)");
  }

  const result = await sandboxIssueGeneratedSignalCandidate(deps.store, deps.clock, {
    coinId: candidate.coinId ?? candidate.symbol,
    name: candidate.name,
    symbol: candidate.symbol,
    direction: candidate.direction,
    entry: candidate.entryPrice,
    invalidation: candidate.invalidation,
    target1: candidate.target1,
    target2: candidate.target2,
    confidence: candidate.score,
    signalDay: inputs.signalDay,
    historyCloses: inputs.historyCloses,
    historyHighs: inputs.historyHighs,
    currentPrice: inputs.currentPrice,
    createdAt: inputs.asOf,
    sourceAsOf: inputs.asOf,
  }, candidate.candidateId);
  if (result.status === "suppressed" || !result.signalId) {
    return reject(deps, candidate, "issuer-suppression", result.reason ?? "issuer suppressed", via);
  }
  return finalizeIssuance(deps, candidate, result.signalId, nowMs, now, via,
    "vendored evaluateBornDead + evaluateShortRegimeGate");
}

function finalizeIssuance(
  deps: OrchestratorDeps, candidate: CandidateRecord, signalId: string,
  nowMs: number, now: string, via: "manual" | "automatic", gateSummaryNote: string,
): CandidateRecord {
  // Alert feed append (file/JSON sandbox feed — no production UI changes).
  const alert: AlertRow = {
    id: `alert_${signalId}`,
    kind: "entry",
    signalId,
    candidateId: candidate.candidateId,
    symbol: candidate.symbol,
    direction: candidate.direction,
    alertedAt: now,
    channel: "sandbox-feed",
    enqueuedAt: now,
    deliveredAt: null,
    deliveryStatus: "enqueued",
    deliveryMode: null,
    ackId: null,
    deliveryAttempts: 0,
  };
  deps.store.appendAlert(alert);

  const qualifiedMs = isoMs(candidate.qualifiedAt ?? candidate.firstSeenAt);
  const delays: DelayRecord = {
    detectionToQualificationMs: qualifiedMs - isoMs(candidate.firstSeenAt),
    qualificationToIssuanceMs: nowMs - qualifiedMs,
    issuanceToAlertMs: nowMs - nowMs, // alert appended in the same step; recorded explicitly
    detectionToAlertMs: nowMs - isoMs(candidate.firstSeenAt),
  };

  const signal = deps.store.listSignals().find((s) => s.signalId === signalId);
  if (signal) {
    const updated: IssuedSignal = { ...signal, alertedAt: now, delays, gateSummary: `${signal.gateSummary} [${gateSummaryNote}]` };
    deps.store.persistIssuedSignal(updated);
  }

  const outcome: OutcomeRecord = { kind: "issued", gate: null, reason: `issued via sandbox ${candidate.terminal} issuer; alert appended to sandbox-feed`, via };
  const updated: CandidateRecord = {
    ...candidate, status: "issued", outcome, issuedAt: now, alertedAt: now,
    issuedSignalId: signalId, nextReassessmentAt: null, delays,
  };
  deps.store.saveCandidate(updated);
  return updated;
}

/**
 * The single pipeline: reassess -> qualify -> issue. Shared verbatim by the
 * automatic tick and the manual entry point.
 */
export async function processCandidate(deps: OrchestratorDeps, candidate: CandidateRecord, via: "manual" | "automatic"): Promise<CandidateRecord> {
  const config = cfg(deps);
  const nowMs = deps.clock.now();

  // Already issued: idempotent no-op.
  if (candidate.status === "issued") return candidate;

  // 1. Expiry.
  if (nowMs - isoMs(candidate.firstSeenAt) > config.candidateTtlMs) {
    return reject(deps, candidate, "expiry",
      `candidate TTL exceeded: detected ${candidate.firstSeenAt}, TTL ${config.candidateTtlMs}ms`, via);
  }

  // 2. Min-score floor (strength floor over |score| — score is
  //    signed-directional; minScore = 0 is documented "disabled", and with
  //    |score| it genuinely is. Corrected to match issuance handler v2.1.6).
  if (Math.abs(candidate.score) < config.minScore) {
    return reject(deps, candidate, "min-score",
      `|score| ${Math.abs(candidate.score)} below orchestrator floor ${config.minScore}`, via);
  }

  // 3. Freshness-gated cheap refresh (watched candidates only — never a universe rescan).
  let working = candidate;
  const inputsAgeMs = nowMs - isoMs(candidate.inputs.asOf);
  if (inputsAgeMs > config.freshnessMs) {
    if (!deps.quoteProvider) {
      const nextAt = new Date(nowMs + config.retryBackoffMs).toISOString();
      const updated: CandidateRecord = {
        ...candidate,
        status: "deferred",
        outcome: { kind: "deferred", gate: "stale-inputs", reason: `inputs ${Math.round(inputsAgeMs / 60000)}m old, no quote provider configured`, via },
        nextReassessmentAt: nextAt,
        lastReassessedAt: new Date(nowMs).toISOString(),
      };
      deps.store.saveCandidate(updated);
      return updated;
    }
    const fresh = await deps.quoteProvider.refresh(candidate, nowMs);
    if (!fresh) {
      const nextAt = new Date(nowMs + config.retryBackoffMs).toISOString();
      const updated: CandidateRecord = {
        ...candidate,
        status: "deferred",
        outcome: { kind: "deferred", gate: "stale-inputs", reason: "quote provider returned no fresh inputs; deferred, never issued on stale evidence", via },
        nextReassessmentAt: nextAt,
        lastReassessedAt: new Date(nowMs).toISOString(),
      };
      deps.store.saveCandidate(updated);
      return updated;
    }
    working = { ...candidate, inputs: fresh, lastReassessedAt: new Date(nowMs).toISOString(), status: "pending", outcome: null, nextReassessmentAt: null };
    deps.store.saveCandidate(working);
  }

  // 4. Qualification on fresh inputs.
  const blocked = qualifyCandidate(working);
  if (blocked) return reject(deps, working, blocked.gate, blocked.reason, via);
  const qualified: CandidateRecord = { ...working, qualifiedAt: new Date(deps.clock.now()).toISOString() };
  deps.store.saveCandidate(qualified);

  // 5. Duplicate suppression: same instrument+direction already issued within the window.
  const dupe = deps.store.listSignals().find((s) =>
    s.terminal === qualified.terminal &&
    s.symbol === qualified.symbol &&
    s.direction === qualified.direction &&
    s.candidateId !== qualified.candidateId &&
    deps.clock.now() - isoMs(s.issuedAt) <= config.duplicateWindowMs,
  );
  if (dupe) {
    return reject(deps, qualified, "duplicate",
      `duplicate suppressed: ${qualified.symbol} ${qualified.direction} already issued as ${dupe.signalId} within ${config.duplicateWindowMs}ms`,
      via, { winningSignalId: dupe.signalId });
  }

  // 6-7. Issue via the sandbox doubles (they re-validate + enforce idempotency).
  return issueCandidate(deps, qualified, via);
}

/**
 * Automatic path: scheduler-compatible tick. No cron is wired here — a
 * scheduler would call tick() on its own cadence. Processes pending candidates
 * and deferred candidates whose next-reassessment time is due.
 */
export async function tick(deps: OrchestratorDeps): Promise<TickReport> {
  const nowMs = deps.clock.now();
  const report: TickReport = {
    at: new Date(nowMs).toISOString(), processed: [], issued: [], rejected: [], deferred: [], expired: [],
  };
  for (const candidate of deps.store.listCandidates()) {
    const due = candidate.status === "pending" ||
      (candidate.status === "deferred" && candidate.nextReassessmentAt !== null && isoMs(candidate.nextReassessmentAt) <= nowMs);
    if (!due) continue;
    report.processed.push(candidate.candidateId);
    const updated = await processCandidate(deps, candidate, "automatic");
    if (updated.status === "issued") report.issued.push(updated.candidateId);
    else if (updated.status === "expired") report.expired.push(updated.candidateId);
    else if (updated.status === "deferred") report.deferred.push(updated.candidateId);
    else report.rejected.push(updated.candidateId);
  }
  return report;
}

/**
 * Manual path: explicit manual-issue entry point. Runs the SAME
 * reassess -> qualify -> issue pipeline as the automatic tick.
 */
export async function manualIssue(deps: OrchestratorDeps, input: PaperCandidateInput): Promise<CandidateRecord> {
  const candidate = await ingestCandidate(deps, { ...input, source: "manual" });
  if (candidate.status === "issued") return candidate;
  return processCandidate(deps, candidate, "manual");
}
