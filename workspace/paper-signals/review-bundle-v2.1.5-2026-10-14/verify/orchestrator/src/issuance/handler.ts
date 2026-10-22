/**
 * INTEGRATED ISSUANCE HANDLER (sandbox).
 *
 * The single issuance path for the paper-signal lane with the corrected
 * semantics wired end-to-end. SANDBOX ONLY: no production issuance, no
 * scheduler enablement, no brokerage. This module is deliberately
 * independent of the legacy orchestrator path (src/orchestrator.ts) — it
 * shares only types, utils, and the retained regime gates, so the old
 * legacy historical-extreme veto cannot leak back onto this path (proven by
 * tests/no-legacy-veto.test.ts, static + behavioral).
 *
 * Call sequence (spec §1.2, task workstream A + 2026-10-13 repair):
 *
 *   processIntegratedCandidate(deps, candidate, via, invocationId?)
 *     1. expiry / min-score                     (unchanged pipeline guards)
 *     2. freshness-gated cheap refresh           (stale -> deferred, never issued on stale evidence;
 *                                                 defer/refresh writes guarded to live candidates)
 *     3. RETAINED regime gate                    (equity: evaluateEquityShortRegime;
 *                                                 crypto: evaluateShortRegimeGate — shorts only.
 *                                                 The legacy historical-extreme veto is NOT here.)
 *     4. buildIssuanceVetoInput(candidate, fresh, now) -> IssuanceVetoInput
 *     5. runQualificationChecks(input)           (veto/src/waiting-interval.ts:
 *                                                 setup-history filter + pipeline-order + entry-zone
 *                                                 ONLY. No decision→entry invalidation — the entry
 *                                                 has not been observed yet. fail_closed -> reject
 *                                                 gate "issuance-veto")
 *     6. duplicate suppression                  (pre-check; re-checked atomically inside the outcome transaction)
 *     7. buildPendingContract(...)               (correction 2+3: entry fields empty,
 *                                                 actual decision instant threaded through)
 *     8. QUALIFICATION COMMIT (one DB transaction, ownership-guarded):
 *          proceeds only if the candidate is still pending/deferred;
 *          contract row (pending) + candidate (awaiting-entry, contractId,
 *          setupAlertAt) + setup alert (ENQUEUED). The loser of a concurrent
 *          race returns the accepted state unchanged (won=false) — no
 *          observation, no write. Timestamps: setupAlertAt; the alert is
 *          DELIVERED after the commit (separate timestamp).
 *     9. entry observation                       (injectable VenueFeed/WatchClock;
 *                                                 observeEntry per print; poll cadence enforced
 *                                                 strictly finer than the entry window — correction 4;
 *                                                 LATE FETCH: clock re-read after every await —
 *                                                 receipt past the window voids as void_expired
 *                                                 ("late receipt: historical reconstruction");
 *                                                 prints older than maxObservationAgeMs are skipped;
 *                                                 wrong-venue prints are skipped (explicit venue map).
 *                                                 Poll-budget exhaustion with the window still open
 *                                                 keeps awaiting-entry + schedules a reassessment —
 *                                                 distinctly NOT an expiry.)
 *    9b. checkWaitingInterval(...)               (the genuine decision→entry
 *                                                 veto over the REAL [contract.decisionAt,
 *                                                 entryObservedAt] interval, BEFORE the outcome
 *                                                 commit; verdict !== pass fails closed ->
 *                                                 commitNonEntryOutcome gate
 *                                                 "waiting-interval-invalidation")
 *    10. checkPostEntryInvalidation(...)         (POST-ENTRY point: governs post-entry,
 *                                                 NOT decision→entry. entryValid and
 *                                                 interveningInvalidation carried separately — correction 6c)
 *    11. OUTCOME COMMIT (one DB transaction — signal + contract + candidate +
 *        entry alert atomic via the DB's own transaction controls, with the
 *        ownership/state guard INSIDE the transaction: candidate must still
 *        be awaiting-entry AND the contract row still pending, else the
 *        loser rolls back with NO writes and returns the accepted state):
 *          entered     -> signal row (claim-guarded) + contract (entered) +
 *                         candidate (issued) + entry alert (enqueued, then
 *                         delivered with a separate timestamp). Timestamps:
 *                         entryObservedAt (venue), alertDeliveredAt.
 *          expired     -> contract (void_expired) + candidate (entry-expired).
 *                         Logged non-entry; never scored; no entry alert.
 *          invalidated -> void_drift / void_no_quote / waiting-interval /
 *                         stopped-at-birth: contract + candidate (invalidated).
 *                         No valid paper entry occurred, so no signal row. A
 *                         post-entry stop-out AFTER a valid entry is a realized
 *                         outcome: the signal IS persisted (issued) with the
 *                         stop-out in detail — never vanished as a non-entry.
 *    12. return the final candidate record (tracker + alert event read off the store).
 *
 * Durable recovery (item 3): a candidate left in awaiting-entry (crashed
 * process, poll budget exhausted) resumes from the PERSISTED DB state —
 * resumeAwaitingEntry re-validates the contract ROW (state === "pending"),
 * parses the contract from the stored JSON (no in-memory registry), and
 * runs a BOUNDED observation run without recreating the contract or
 * re-firing the setup alert. integratedTick picks up awaiting-entry
 * candidates whose nextReassessmentAt is due (or null).
 *
 * Exactly-once: deterministic ids (contract ct_<candidateId>, signal
 * sig_<identityHash>, alerts setup_<candidateId> / entry_<signalId>) with
 * ON CONFLICT DO NOTHING, plus the issuance-claim mechanism
 * (UNIQUE(identity_hash) + issuance_claim = invocationId, re-read after
 * write — the production persistSignalIssuanceBundle shape). Overlapping
 * manual + scheduled calls serialize on the store's commit scopes; the loser
 * re-reads and returns the existing record — no error, no duplicate.
 *
 * State machine (spec §2.1): qualified -> awaiting entry -> entered |
 * expired | invalidated. Three persisted timestamps per signal (spec §2.2):
 * setupAlertAt < entryObservedAt < alertDeliveredAt — asserted on every
 * entered fixture.
 */

import { randomUUID } from "node:crypto";
import type { Clock } from "../clock.js";
import type {
  AlertRow,
  CandidateRecord,
  CandidateStatus,
  DelayRecord,
  FreshInputs,
  IssuedSignal,
  OrchestratorConfig,
  OutcomeKind,
  OutcomeRecord,
  PaperCandidateInput,
} from "../types.js";
import { DEFAULT_CONFIG, SANDBOX } from "../types.js";
import { contentHash, isoMs } from "../util.js";
import { evaluateEquityShortRegime } from "../gates/equity-gate-decomposition.js";
import type { Point } from "../gates/equity-gates.js";
import { evaluateShortRegimeGate } from "../gates/crypto-gates.js";
import {
  checkPostEntryInvalidation,
} from "../../../veto/src/veto.js";
import type {
  EvidenceBar,
  PostEntryInvalidationResult,
} from "../../../veto/src/veto.js";
import {
  checkWaitingInterval,
  runQualificationChecks,
} from "../../../veto/src/waiting-interval.js";
import { buildIssuanceVetoInput } from "./veto-input.js";
import {
  buildPendingContract,
  observeEntry,
} from "../../../entry-v1/src/pending.js";
import type {
  EntryObservationEvent,
  EntryOutcome,
} from "../../../entry-v1/src/pending.js";
import {
  ContractError,
  voidContract,
} from "../../../entry-v1/src/contract.js";
import type {
  ActionableEntryContract,
  ContractInput,
} from "../../../entry-v1/src/contract.js";
import {
  DEFAULT_UNGROUNDED_PARAMS,
  acceptedPrintVenues,
  isXnysSession,
  nextXnysSession,
  xnysSessionBounds,
} from "../../../entry-v1/src/entry-rules.js";
import type {
  TradePrint,
  VenueFeed,
  WatchClock,
} from "../../../entry-v1/src/feed.js";
import {
  DuplicateIssuanceError,
  isTerminalStatus,
  persistSignalIssuanceBundle,
} from "../persistence/db-store.js";
import type { DbStore, StoredSignal } from "../persistence/db-store.js";

// ---------------------------------------------------------------------------
// Deps
// ---------------------------------------------------------------------------

export interface IntegratedQuoteProvider {
  refresh(candidate: CandidateRecord, nowMs: number): Promise<FreshInputs | null>;
}

export interface EntryObservationFeed {
  feed: VenueFeed;
  clock: WatchClock;
  /**
   * Poll cadence in ms. ENFORCED strictly finer than the contract's entry
   * window (correction 4: a cadence coarser than the window cannot observe
   * inside it — the handler throws rather than silently missing the window).
   */
  pollIntervalMs: number;
  /** Safety bound on polls per observation run. */
  maxPolls: number;
  /**
   * Advance time between polls. Tests pass a mutable-clock advance;
   * a live wiring would sleep here instead.
   */
  advance: (ms: number) => void | Promise<void>;
}

export interface PostEntryEvidence {
  bars: EvidenceBar[];
  nowAt: number;
}

/**
 * Transport acknowledgement for an alert (workstream B, 2026-10-13).
 *
 * The deliverAlert hook may return void (the sandbox default: the hook's
 * clean return IS the acknowledgement — a sandbox transport's hand-off
 * accepted the alert) or an explicit acknowledgement object. A real wiring
 * returns { acknowledged: true, mode: "live", ackId } from the transport's
 * ack; a transport failure should THROW (or return { acknowledged: false }),
 * which marks the alert failed and schedules it for the recovery pass.
 */
export interface AlertAck {
  /** False (or a throw) means the transport did NOT acknowledge — the alert stays undelivered. */
  acknowledged: boolean;
  /** Sandbox/test acks are "simulated"; real transport acks are "live". */
  mode?: "simulated" | "live";
  /** Transport-provided acknowledgement id — the dedup key on redelivery. */
  ackId?: string;
}

/** Widened (additive) deliverAlert hook signature: void or an AlertAck. */
export type DeliverAlertHook = (alert: AlertRow) => void | Promise<void> | AlertAck | Promise<AlertAck>;

/**
 * Venue-clock-skew signal (workstream B, 2026-10-13): a venue print whose
 * timestamp is in the FUTURE relative to our clock — the provider clock is
 * ahead of ours. Thrown by the skew-guarded feed; the handler catches it
 * and DEFERS (never clamps the timestamp, never fabricates entry evidence).
 */
export class VenueClockSkewError extends Error {
  readonly printTs: number;
  readonly nowMs: number;
  constructor(printTs: number, nowMs: number, toleranceMs: number) {
    const aheadMs = printTs - nowMs;
    super(
      `deferred_clock_skew_future_observation: venue print ts ${new Date(printTs).toISOString()} ` +
      `(${printTs}) is ${aheadMs}ms ahead of our clock ${new Date(nowMs).toISOString()} (${nowMs}) ` +
      `(tolerance ${toleranceMs}ms) — the provider clock is ahead of ours; the print's timestamps are ` +
      `untrusted. No timestamp clamped, no entry evidence fabricated from it; retrying on a later tick.`,
    );
    this.name = "VenueClockSkewError";
    this.printTs = printTs;
    this.nowMs = nowMs;
  }
}

/**
 * Conservative tolerance for venue-vs-our clock skew. A print whose ts is
 * ANY amount in the future relative to the observation clock is a
 * provider-clock-ahead observation and is deferred. The default is ZERO —
 * strictly conservative — because the contract's own causality rule
 * (entryReceivedAt must not precede entryObservedAt) already hard-fails on
 * any future-timestamped print that reaches it; a nonzero tolerance would
 * convert a clean named deferral into a loud ContractError that aborts the
 * whole tick. The tolerance stays a parameter for tests and future tuning,
 * not a live setting.
 */
export const VENUE_CLOCK_SKEW_TOLERANCE_MS = 0;

/**
 * Wrap a VenueFeed so any print timestamped in the future (beyond the
 * tolerance) relative to the observation clock throws VenueClockSkewError
 * INSTEAD of being served. The underlying feed is never modified — its
 * timestamps are never clamped or rewritten. Async feeds pass through
 * unchanged apart from the skew check.
 *
 * The clock is read when the prints are RECEIVED (post-await), in the same
 * frame as the existing late-receipt check: a print is "future" if its
 * venue timestamp is ahead of the observer's now at the moment the print
 * is actually observed. In the handler this is the feed bundle's WatchClock
 * — in a live wiring the same wall clock the handler reads; in tests the
 * clock that advances with observation.
 */
export function skewGuardedFeed(
  feed: VenueFeed,
  nowMs: () => number,
  toleranceMs: number = VENUE_CLOCK_SKEW_TOLERANCE_MS,
): VenueFeed {
  const check = (prints: TradePrint[]): TradePrint[] => {
    for (const p of prints) {
      const now = nowMs();
      if (p.ts > now + toleranceMs) throw new VenueClockSkewError(p.ts, now, toleranceMs);
    }
    return prints;
  };
  return {
    latestPrints: (sinceTs: number) => {
      const result = feed.latestPrints(sinceTs);
      return result instanceof Promise ? result.then(check) : check(result);
    },
  };
}

export interface IntegratedDeps {
  store: DbStore;
  clock: Clock;
  config?: Partial<OrchestratorConfig>;
  quoteProvider?: IntegratedQuoteProvider;
  /**
   * Venue feed + clock for entry observation. Null => no venue feed:
   * the contract is voided as void_no_quote (no print observed, no fill
   * fabricated — the anti-fabrication rule).
   */
  entryFeedFor?: (contract: ActionableEntryContract, candidate: CandidateRecord) => EntryObservationFeed | null;
  /**
   * Post-entry evidence for checkPostEntryInvalidation. Null => the check
   * runs on an empty post-entry interval (vacuous at entryAt); the invalidation
   * question is then unresolved and flagged, never silently passed.
   */
  postEntryEvidenceFor?: (contract: ActionableEntryContract) => PostEntryEvidence | null;
  /**
   * Waiting-interval evidence for checkWaitingInterval (step 9b): bars
   * covering the REAL decision→entry interval [contract.decisionAt,
   * entryObservedAt]. Null/[] allowed: for equity the empty interval passes
   * by construction (overnight gap); for crypto it fails closed.
   */
  waitingIntervalEvidenceFor?: (contract: ActionableEntryContract) => EvidenceBar[] | null;
  /**
   * Alert delivery hook, called after every alert enqueue (setup + entry).
   * The hook may return void (its clean return is the acknowledgement) or an
   * explicit AlertAck. A throw (or { acknowledged: false }) marks the alert
   * failed; it is then retried by the recovery pass
   * (recoverUndeliveredAlerts), never lost. Only acknowledged alerts are
   * marked delivered, and sandbox/test acknowledgements are persisted with
   * delivery_mode "simulated".
   */
  deliverAlert?: DeliverAlertHook;
  /**
   * Default delivery mode when the hook returns void without an explicit
   * mode. Defaults to "simulated" — a void-returning hook is a sandbox/test
   * acknowledgement and must never be labeled "live". A live transport
   * wiring returns { mode: "live", ackId } from the hook instead.
   */
  deliveryMode?: "simulated" | "live";
}

export interface TickReport {
  at: string;
  processed: string[];
  issued: string[];
  rejected: string[];
  deferred: string[];
  expired: string[];
  /** Candidates that stayed awaiting-entry after a resume (e.g. poll budget exhausted, window still open). */
  awaiting: string[];
}

// ---------------------------------------------------------------------------
// Deterministic ids (exactly-once across retries / concurrent callers)
// ---------------------------------------------------------------------------

export const contractIdFor = (candidateId: string): string => `ct_${candidateId}`;
export const setupAlertIdFor = (candidateId: string): string => `setup_${candidateId}`;
export const entryAlertIdFor = (signalId: string): string => `entry_${signalId}`;
export const suppressionIdFor = (candidateId: string, gate: string): string => `sup_${candidateId}_${gate}`;

export function issuanceIdentityFor(input: PaperCandidateInput): string {
  return contentHash({
    terminal: input.terminal,
    symbol: input.symbol,
    coinId: input.coinId ?? null,
    direction: input.direction,
    signalDate: input.signalDate,
    parameterHash: "sandbox-paper-v1",
  }).slice(0, 32);
}

export const signalIdFor = (identityHash: string): string => `sig_${identityHash.slice(0, 24)}`;

function cfg(deps: IntegratedDeps): OrchestratorConfig {
  return { ...DEFAULT_CONFIG, ...(deps.config ?? {}) };
}

// ---------------------------------------------------------------------------
// Ingest (replay-safe; local copy — this module takes no imports from the
// legacy orchestrator path, per the old-veto guard)
// ---------------------------------------------------------------------------

export async function ingestIntegratedCandidate(
  deps: IntegratedDeps,
  input: PaperCandidateInput,
): Promise<CandidateRecord> {
  const candidateId = issuanceIdentityFor(input);
  const existing = deps.store.getCandidate(candidateId);
  if (existing) return existing;
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

// ---------------------------------------------------------------------------
// Rejection helper (persists candidate outcome + suppression row)
// ---------------------------------------------------------------------------

function statusForGate(gate: string): { status: CandidateStatus; kind: OutcomeKind } {
  if (gate === "expiry") return { status: "expired", kind: "rejected" };
  if (gate === "entry-expired") return { status: "entry-expired", kind: "entry-expired" };
  if (gate === "invalidated" || gate === "entry-drift" || gate === "entry-no-quote" || gate === "post-entry-invalidation" || gate === "waiting-interval-invalidation") {
    return { status: "invalidated", kind: "invalidated" };
  }
  return { status: "rejected", kind: "rejected" };
}

/**
 * Thrown inside an outcome transaction when the ownership/state guard
 * refuses the transition: another worker already settled this candidate.
 * The transaction rolls back (no writes) and the caller returns the
 * database-accepted record — no error surfaces to the caller.
 */
export class LostOwnershipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LostOwnershipError";
  }
}

/**
 * Ownership/state guard shared by the transition commits: proceed only
 * while the candidate is still awaiting-entry AND the contract row is still
 * pending. Anything else means another worker owns (or already finished)
 * this transition.
 */
function checkTransitionOwnership(
  deps: IntegratedDeps,
  candidateId: string,
  contractId: string,
): { ok: true } | { ok: false; candidateStatus: string; contractState: string } {
  const current = deps.store.getCandidate(candidateId);
  const contractRow = deps.store.getContract(contractId);
  if (current?.status === "awaiting-entry" && contractRow?.state === "pending") {
    return { ok: true };
  }
  return {
    ok: false,
    candidateStatus: current?.status ?? "missing",
    contractState: contractRow?.state ?? "missing",
  };
}

function reject(
  deps: IntegratedDeps,
  candidate: CandidateRecord,
  gate: string,
  reason: string,
  via: "manual" | "automatic",
  detail?: Record<string, unknown>,
): CandidateRecord {
  const now = new Date(deps.clock.now()).toISOString();
  const { status, kind } = statusForGate(gate);
  const outcome: OutcomeRecord = { kind, gate, reason, via, detail };
  // Ownership/state guard INSIDE the rejection transaction: only a live
  // (pending / deferred) candidate may be rejected on a pre-qualification
  // path. A settled candidate (awaiting-entry, issued, terminal) is returned
  // unchanged — the loser of a concurrent race writes nothing. The ONE
  // explicit exception is the DuplicateIssuanceError path, which may move
  // awaiting-entry -> rejected/duplicate (the race is resolved at the
  // outcome commit, and the rejection records it).
  const allowed: ReadonlySet<CandidateStatus> = gate === "duplicate"
    ? new Set(["pending", "deferred", "awaiting-entry"])
    : new Set(["pending", "deferred"]);
  return deps.store.transact(() => {
    const live = deps.store.getCandidate(candidate.candidateId) ?? candidate;
    if (!allowed.has(live.status)) return live; // accepted state, unchanged
    const updated: CandidateRecord = {
      ...live, status, outcome, nextReassessmentAt: null, lastReassessedAt: now,
    };
    deps.store.saveCandidate(updated);
    deps.store.appendSuppression({
      id: suppressionIdFor(candidate.candidateId, gate),
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
  });
}

// ---------------------------------------------------------------------------
// Pipeline steps
// ---------------------------------------------------------------------------

async function refreshIfStale(
  deps: IntegratedDeps,
  candidate: CandidateRecord,
  config: OrchestratorConfig,
  nowMs: number,
  via: "manual" | "automatic",
): Promise<{ working: CandidateRecord; deferred: CandidateRecord | null }> {
  const inputsAgeMs = nowMs - isoMs(candidate.inputs.asOf);
  if (inputsAgeMs <= config.freshnessMs) return { working: candidate, deferred: null };
  // Ownership/state guard: only a live (pending / deferred) candidate may be
  // deferred or refreshed. A concurrent worker may have settled it already;
  // the loser returns the accepted state unchanged.
  const liveStatus = (): CandidateRecord => deps.store.getCandidate(candidate.candidateId) ?? candidate;
  const defer = (reason: string): CandidateRecord => {
    const nextAt = new Date(nowMs + config.retryBackoffMs).toISOString();
    return deps.store.transact(() => {
      const live = liveStatus();
      if (live.status !== "pending" && live.status !== "deferred") return live;
      const updated: CandidateRecord = {
        ...live,
        status: "deferred",
        outcome: { kind: "deferred", gate: "stale-inputs", reason, via },
        nextReassessmentAt: nextAt,
        lastReassessedAt: new Date(nowMs).toISOString(),
      };
      deps.store.saveCandidate(updated);
      return updated;
    });
  };
  if (!deps.quoteProvider) {
    return {
      working: candidate,
      deferred: defer(`inputs ${Math.round(inputsAgeMs / 60000)}m old, no quote provider configured`),
    };
  }
  const fresh = await deps.quoteProvider.refresh(candidate, nowMs);
  if (!fresh) {
    return {
      working: candidate,
      deferred: defer("quote provider returned no fresh inputs; deferred, never issued on stale evidence"),
    };
  }
  const working: CandidateRecord = deps.store.transact(() => {
    const live = liveStatus();
    // Only a live (pending / deferred) candidate may be refreshed into a new
    // working copy; a settled candidate is returned unchanged.
    if (live.status !== "pending" && live.status !== "deferred") return live;
    const w: CandidateRecord = {
      ...live, inputs: fresh, lastReassessedAt: new Date(nowMs).toISOString(),
      status: "pending", outcome: null, nextReassessmentAt: null,
    };
    deps.store.saveCandidate(w);
    return w;
  });
  return { working, deferred: null };
}

/**
 * The RETAINED regime gate — a regime filter with unchanged semantics.
 * The legacy historical-extreme branch is deliberately NOT on this path:
 * it is replaced by runIssuanceChecks (decision→entry, post-decision evidence
 * only). Crypto longs and equity longs have no regime gate (as in production).
 */
function retainedRegimeGate(candidate: CandidateRecord): { gate: string; reason: string } | null {
  if (candidate.direction === "long") return null;
  if (candidate.terminal === "equity") {
    const rawBars = candidate.inputs.rawBars;
    if (!rawBars || rawBars.length === 0) {
      return { gate: "evidence-insufficient", reason: "equity short reassessment requires rawBars evidence; none present" };
    }
    const history: Point[] = rawBars.map((b) => ({
      date: b.date, close: b.close ?? 0, open: b.open, high: b.high, low: b.low, volume: b.volume ?? null,
    }));
    const signalDay = history.find((p) => p.date === candidate.signalDate) ?? null;
    if (!signalDay) {
      return { gate: "evidence-insufficient", reason: `signal-day ${candidate.signalDate} not found in equity history` };
    }
    const decision = evaluateEquityShortRegime("short", signalDay, history);
    if (!decision.allowed) return { gate: "short-regime", reason: decision.reason ?? "short-regime gate blocked" };
    return null;
  }
  const regime = evaluateShortRegimeGate(
    candidate.inputs.currentPrice, candidate.inputs.historyCloses, candidate.inputs.historyHighs,
  );
  if (!regime.allowed) return { gate: "short-regime", reason: regime.reason };
  return null;
}

function findDuplicate(
  deps: IntegratedDeps,
  candidate: CandidateRecord,
  nowMs: number,
  config: OrchestratorConfig,
): IssuedSignal | null {
  return deps.store.listSignals().find((s) =>
    s.terminal === candidate.terminal &&
    s.symbol === candidate.symbol &&
    s.direction === candidate.direction &&
    s.candidateId !== candidate.candidateId &&
    nowMs - isoMs(s.issuedAt) <= config.duplicateWindowMs,
  ) ?? null;
}

// ---------------------------------------------------------------------------
// Contract inputs (field computation mirrors entry-rules.ts, but returns the
// ContractInput for buildPendingContract instead of a pre-built contract, so
// the pending-registry invariant and correction-3 decisionAt threading hold)
// ---------------------------------------------------------------------------

function riskPerUnitFor(candidate: CandidateRecord): number {
  const rpu = Math.abs(candidate.entryPrice - candidate.invalidation);
  if (!(rpu > 0)) {
    throw new ContractError(`riskPerUnit must be > 0 (entry ${candidate.entryPrice}, invalidation ${candidate.invalidation})`);
  }
  return rpu;
}

function equityContractInput(
  candidate: CandidateRecord, decisionAtIso: string, issuedAtIso: string, signalId: string,
): ContractInput {
  if (!isXnysSession(candidate.signalDate)) {
    throw new ContractError(`signalDate ${candidate.signalDate} is not an XNYS session`);
  }
  const session = xnysSessionBounds(candidate.signalDate);
  const nextSession = nextXnysSession(candidate.signalDate);
  const nextBounds = xnysSessionBounds(nextSession);
  return {
    terminal: "equity",
    signalId,
    strategyId: SANDBOX.equityStrategyId,
    strategyVersion: SANDBOX.equityStrategyVersion,
    parameterHash: SANDBOX.parameterHash,
    decisionAt: decisionAtIso,
    decisionClock: "xnys-session-close",
    decisionPrice: candidate.entryPrice,
    sourceObservedAt: session.end,
    sourceObservationWindow: { start: session.start, end: session.end },
    entryRule: "next-xnys-regular-session-open-print",
    entryVenue: "primary-listing-consolidated-tape",
    entryWindowOpensAt: nextBounds.start,
    entryWindowExpiresAt: nextBounds.end,
    invalidationPrice: candidate.invalidation,
    target1Price: candidate.target1,
    target2Price: candidate.target2,
    riskPerUnit: riskPerUnitFor(candidate),
    horizonUnit: "trading_sessions",
    primaryHorizon: 30,
    evaluatorCompatibility:
      "actionable-entry-v1 equity: entry stamped at the next session-open instant; " +
      "venue-stamped, never a backdated reference",
    issuedBy: "paper-signals-integrated-handler",
    issuedAt: issuedAtIso,
    driftCapPct: DEFAULT_UNGROUNDED_PARAMS.equityDriftCapPct,
  };
}

function cryptoContractInput(
  candidate: CandidateRecord, decisionAtIso: string, issuedAtIso: string, signalId: string,
): ContractInput {
  const decisionMs = Date.parse(decisionAtIso);
  if (!Number.isFinite(decisionMs)) throw new ContractError(`bad decisionAt: ${decisionAtIso}`);
  const expiresMs = decisionMs + DEFAULT_UNGROUNDED_PARAMS.cryptoEntryWindowMinutes * 60_000;
  return {
    terminal: "crypto",
    signalId,
    strategyId: SANDBOX.cryptoStrategyId,
    strategyVersion: SANDBOX.cryptoStrategyVersion,
    parameterHash: SANDBOX.parameterHash,
    decisionAt: decisionAtIso,
    decisionClock: "server-utc",
    decisionPrice: candidate.entryPrice,
    sourceObservedAt: candidate.inputs.asOf,
    sourceObservationWindow: null,
    entryRule: "first-post-decision-binance-spot-trade",
    entryVenue: DEFAULT_UNGROUNDED_PARAMS.cryptoPrimaryVenue,
    entryWindowOpensAt: decisionAtIso,
    entryWindowExpiresAt: new Date(expiresMs).toISOString(),
    invalidationPrice: candidate.invalidation,
    target1Price: candidate.target1,
    target2Price: candidate.target2,
    riskPerUnit: riskPerUnitFor(candidate),
    horizonUnit: "elapsed_days",
    primaryHorizon: 30,
    evaluatorCompatibility:
      "actionable-entry-v1 crypto: venue-stamped first post-decision trade print",
    issuedBy: "paper-signals-integrated-handler",
    issuedAt: issuedAtIso,
    driftCapPct: DEFAULT_UNGROUNDED_PARAMS.cryptoDriftCapPct,
  };
}

// ---------------------------------------------------------------------------
// Entry observation (injectable VenueFeed/WatchClock; observeEntry per print)
// ---------------------------------------------------------------------------

interface ObservationResult {
  contract: ActionableEntryContract;
  event: EntryObservationEvent | null;
  /**
   * "poll-budget-exhausted": maxPolls was hit while the entry window was
   * STILL OPEN. The contract stays pending (never voided); the candidate
   * keeps awaiting-entry with a reassessment scheduled. Distinctly NOT an
   * expiry — only a closed window voids as void_expired.
   */
  outcome: EntryOutcome | "poll-budget-exhausted";
}

async function observeEntryPhase(
  pending: ActionableEntryContract,
  bundle: EntryObservationFeed | null,
): Promise<ObservationResult> {
  const opensMs = Date.parse(pending.entryWindowOpensAt);
  const expiresMs = Date.parse(pending.entryWindowExpiresAt);
  const decisionMs = Date.parse(pending.decisionAt);
  const windowMs = expiresMs - opensMs;
  // Declared observation-age limit (entry-rules.ts §6.5): receiptMs −
  // print.ts must stay within this bound, or the print is historical
  // reconstruction — skipped, never entered.
  const maxAgeMs = DEFAULT_UNGROUNDED_PARAMS.maxObservationAgeMs;
  // Explicit venue mapping (entry-rules.ts §6.6): prints whose venue label
  // is not accepted for the contract's entryVenue are skipped, never entered.
  const acceptedVenues = new Set(acceptedPrintVenues(pending.entryVenue));

  if (!bundle) {
    // No venue feed: void_no_quote. No print observed, no fill fabricated
    // (anti-fabrication rule) — the setup cannot be entered.
    const voided = voidContract(pending, {
      entryState: "void_no_quote",
      voidReason: "no venue feed configured for entry observation; no print observed, no fill fabricated",
    });
    return { contract: voided, event: null, outcome: "invalidated" };
  }

  const { feed, clock: wclock, pollIntervalMs, maxPolls, advance } = bundle;
  if (!(pollIntervalMs < windowMs)) {
    throw new ContractError(
      `pollIntervalMs (${pollIntervalMs}ms) must be strictly finer than the entry window ` +
      `(${windowMs}ms): a cadence coarser than the window cannot observe inside it (correction 4).`,
    );
  }

  const eligible = (p: TradePrint): boolean => {
    if (typeof p.price !== "number" || !Number.isFinite(p.price) || !(p.price > 0)) return false;
    if (!acceptedVenues.has(p.venue)) return false; // wrong-venue print: skipped, never entered
    if (pending.terminal === "equity") {
      // The equity entry rule is the session-open print — exactly the open instant.
      return p.ts === opensMs;
    }
    const earliest = Math.max(decisionMs, opensMs);
    return p.ts >= earliest && p.ts <= expiresMs;
  };

  // Live-vs-reconstruction: if the window already closed, any in-window print
  // is history — void, never enter from a past print.
  if (wclock.nowMs() > expiresMs) {
    const voided = voidContract(pending, {
      entryState: "void_expired",
      voidReason:
        `entry window [${pending.entryWindowOpensAt}, ${pending.entryWindowExpiresAt}] closed ` +
        `before observation began; any in-window print is historical reconstruction, not an actionable entry.`,
    });
    return { contract: voided, event: null, outcome: "expired" };
  }

  const lateReceiptVoid = (receiptMs: number): ObservationResult => {
    const voided = voidContract(pending, {
      entryState: "void_expired",
      voidReason:
        `late receipt: historical reconstruction, not an actionable entry — the venue fetch returned at ` +
        `${new Date(receiptMs).toISOString()}, after the entry window ` +
        `[${pending.entryWindowOpensAt}, ${pending.entryWindowExpiresAt}] closed; an in-window print served ` +
        `now is history, not a live entry.`,
    });
    return { contract: voided, event: null, outcome: "expired" };
  };

  let sinceTs = decisionMs - 1;
  let polls = 0;
  while (wclock.nowMs() <= expiresMs && polls < maxPolls) {
    const prints = await feed.latestPrints(sinceTs);
    // (a) LATE FETCH: re-read the clock AFTER the await. The fetch may have
    // started inside the entry window while the clock advanced past it during
    // the await (the expert's minute-16 counterexample): a print served now
    // is historical reconstruction — void_expired, never issued.
    const receiptMs = wclock.nowMs();
    if (receiptMs > expiresMs) return lateReceiptVoid(receiptMs);
    for (const p of prints) {
      if (p.ts > sinceTs) sinceTs = p.ts;
      if (!eligible(p)) continue;
      // (b) OBSERVATION AGE: a print older than the declared bound at
      // receipt time was missed across many polls — historical
      // reconstruction. Skipped, never entered.
      if (receiptMs - p.ts > maxAgeMs) continue;
      // observeEntry: the separate entry step (correction 2). Business outcomes
      // (expired/invalidated) return; integrity violations throw ContractError.
      const event = observeEntry(
        pending,
        {
          entryObservedAt: new Date(p.ts).toISOString(),
          entryReceivedAt: new Date(receiptMs).toISOString(),
          entryPrice: p.price,
          evidence: "venue-trade",
        },
        () => new Date(receiptMs).toISOString(),
      );
      return { contract: event.resultingContract, event, outcome: event.outcome };
    }
    polls += 1;
    await advance(pollIntervalMs);
  }

  if (wclock.nowMs() <= expiresMs) {
    // Poll budget exhausted while the window is STILL OPEN: the contract
    // stays pending (it is NOT voided) and the candidate keeps awaiting-entry
    // with another bounded run scheduled — distinctly not an expiry.
    return { contract: pending, event: null, outcome: "poll-budget-exhausted" };
  }

  const voided = voidContract(pending, {
    entryState: "void_expired",
    voidReason:
      `entry window [${pending.entryWindowOpensAt}, ${pending.entryWindowExpiresAt}] closed ` +
      `with no qualifying print observed after ${polls} poll(s); a later fetch of an ` +
      `in-window print is historical reconstruction, not an actionable entry.`,
  });
  return { contract: voided, event: null, outcome: "expired" };
}

// ---------------------------------------------------------------------------
// Post-entry invalidation (POST-ENTRY point — governs post-entry, not
// decision→entry). entryValid and interveningInvalidation stay separate
// (correction 6c): fail-closed on the invalidation question flags the signal
// unresolved; it does not rewrite the fact of entry.
// ---------------------------------------------------------------------------

interface PostEntryAssessment {
  /**
   * True only when the entry itself was never valid (stopped at birth):
   * no valid paper entry occurred, so no signal row is persisted and the
   * candidate is "invalidated". A post-entry stop-out AFTER a valid entry
   * (entryValid=pass, invalidation_observed) is a REALIZED outcome — the
   * signal IS persisted (issued) with the stop-out recorded in detail, so
   * stop-outs stay visible to measurement instead of vanishing.
   */
  invalidated: boolean;
  gate: string;
  reason: string;
  result: PostEntryInvalidationResult;
}

function assessPostEntry(
  deps: IntegratedDeps,
  entered: ActionableEntryContract,
  direction: "long" | "short",
): PostEntryAssessment {
  const evidence = deps.postEntryEvidenceFor?.(entered) ?? null;
  const bars = evidence?.bars ?? [];
  const entryAt = Date.parse(entered.entryObservedAt as string);
  const nowAt = evidence ? Math.max(evidence.nowAt, entryAt) : entryAt;
  const result = checkPostEntryInvalidation({
    direction,
    stop: entered.invalidationPrice,
    entryPrice: entered.entryPrice as number,
    entryAt,
    nowAt,
    bars,
  });
  // Bright line: a signal row exists iff a VALID paper entry occurred.
  if (result.entryValid === "fail") {
    // Stopped at birth — the entry print itself crossed the stop. Never a
    // valid entry: invalidated, no signal row.
    return {
      invalidated: true,
      gate: "post-entry-invalidation",
      reason: `stopped at birth: ${result.entryReason}`,
      result,
    };
  }
  if (result.verdict === "fail") {
    // Valid entry, then stopped out post-entry: a REALIZED outcome. The
    // signal is persisted (issued) with the stop-out in detail — it must
    // stay visible to measurement, not vanish as a non-entry.
    return {
      invalidated: false,
      gate: "",
      reason: `entered, then stopped out post-entry: ${result.invalidationReason}`,
      result,
    };
  }
  // "uncertain" fails closed on the invalidation question only: the entry
  // stands (entryValid reported separately), flagged unresolved.
  return { invalidated: false, gate: "", reason: result.reason, result };
}

// ---------------------------------------------------------------------------
// Outcome commits (each ONE DB transaction via the named controls)
// ---------------------------------------------------------------------------

function buildDelays(candidate: CandidateRecord, setupAlertAt: string, entryObservedAt: string, entryAlertAt: string): DelayRecord {
  return {
    detectionToQualificationMs: isoMs(setupAlertAt) - isoMs(candidate.firstSeenAt),
    qualificationToIssuanceMs: isoMs(entryObservedAt) - isoMs(setupAlertAt),
    issuanceToAlertMs: isoMs(entryAlertAt) - isoMs(entryObservedAt),
    detectionToAlertMs: isoMs(entryAlertAt) - isoMs(candidate.firstSeenAt),
  };
}

export async function commitEnteredOutcome(
  deps: IntegratedDeps,
  awaiting: CandidateRecord,
  entered: ActionableEntryContract,
  event: EntryObservationEvent | null,
  signalId: string,
  contractId: string,
  identityHash: string,
  invocationId: string,
  vetoSummary: string,
  postAssessment: PostEntryAssessment,
  via: "manual" | "automatic",
): Promise<CandidateRecord> {
  const entryObservedAt = entered.entryObservedAt as string;
  const entryAlertAt = new Date(deps.clock.now()).toISOString();
  const delays = buildDelays(awaiting, awaiting.setupAlertAt as string, entryObservedAt, entryAlertAt);
  const postFlag = postAssessment.result.interveningInvalidation === "insufficient_data"
    ? "post-entry invalidation unresolved (fail-closed on the invalidation question; entry validity reported separately)"
    : `post-entry invalidation: ${postAssessment.result.interveningInvalidation}`;

  const signal: IssuedSignal = {
    signalId,
    candidateId: awaiting.candidateId,
    identityHash,
    contractId,
    terminal: awaiting.terminal,
    symbol: awaiting.symbol,
    coinId: awaiting.coinId ?? null,
    name: awaiting.name,
    direction: awaiting.direction,
    score: awaiting.score,
    entryPrice: entered.entryPrice as number,
    invalidation: entered.invalidationPrice,
    target1: entered.target1Price,
    target2: entered.target2Price,
    signalDate: awaiting.signalDate,
    issuedAt: entryAlertAt,
    alertedAt: entryAlertAt,
    delays,
    gateSummary:
      `integrated issuance [${via}]: retained regime gate passed; runQualificationChecks pass; ` +
      `entered ${entryObservedAt} via ${entered.entryRule} (drift ${entered.driftObservedPct}%, ` +
      `evidence ${entered.entryEvidence}); waiting-interval veto pass; ${postFlag}`,
    origin: "orchestrator",
  };

  // The entry alert is ENQUEUED atomically with the outcome; delivery is a
  // separate post-commit step with its own timestamp (markAlertDelivered).
  const entryAlert: AlertRow = {
    id: entryAlertIdFor(signalId),
    kind: "entry",
    signalId,
    candidateId: awaiting.candidateId,
    symbol: awaiting.symbol,
    direction: awaiting.direction,
    alertedAt: entryAlertAt,
    channel: "sandbox-feed",
    enqueuedAt: entryAlertAt,
    deliveredAt: null,
    deliveryStatus: "enqueued",
    deliveryMode: null,
    ackId: null,
    deliveryAttempts: 0,
  };

  const config = cfg(deps);
  const outcomeDetail: Record<string, unknown> = {
    vetoSummary,
    contractId,
    entryEventId: event?.eventId ?? null,
    polls: null,
    postEntryInvalidation: postAssessment.result.interveningInvalidation,
    postEntryReason: postAssessment.result.invalidationReason,
  };

  // The atomic bundle: signal (claim-guarded) + contract + candidate + entry
  // alert in ONE transaction. The duplicate check re-runs INSIDE the
  // transaction to close the check→issue race.
  let accepted: StoredSignal;
  try {
    accepted = await deps.store.runExclusive(() =>
      persistSignalIssuanceBundle({
        atomicWrite: () =>
          deps.store.transact(() => {
            // ITEM 1 — ownership/state guard INSIDE the outcome transaction:
            // proceed only if the candidate is still awaiting-entry AND the
            // contract row is still pending. The expert's counterexample is a
            // concurrent worker B whose drift-invalid print arrives after
            // worker A issued: B must NOT overwrite A's issued state. The
            // transaction stops partial writes; this guard stops
            // loser-overwrites-winner. A refused transition rolls back with
            // NO writes (LostOwnershipError), and the caller returns the
            // database-accepted record — no error, no write.
            const ownership = checkTransitionOwnership(deps, awaiting.candidateId, contractId);
            if (!ownership.ok) {
              throw new LostOwnershipError(
                `entered-outcome commit refused: candidate ${awaiting.candidateId} is ` +
                `${ownership.candidateStatus} (contract ${contractId} is ${ownership.contractState}) — ` +
                `another worker owns this transition`,
              );
            }
            const dupe = findDuplicate(deps, awaiting, deps.clock.now(), config);
            if (dupe) throw new DuplicateIssuanceError(dupe.signalId);
            deps.store.insertSignalClaim(signal, invocationId);
            deps.store.saveContract({
              contractId,
              candidateId: awaiting.candidateId,
              signalId,
              state: entered.entryState,
              contractJson: JSON.stringify(entered),
              updatedAt: entryAlertAt,
            });
            const issued: CandidateRecord = {
              ...awaiting,
              status: "issued",
              outcome: { kind: "issued", gate: null, reason: `issued via integrated ${awaiting.terminal} path; entered ${entryObservedAt}; entry alert appended to sandbox-feed`, via, detail: outcomeDetail },
              issuedAt: entryAlertAt,
              alertedAt: entryAlertAt,
              issuedSignalId: signalId,
              entryObservedAt,
              nextReassessmentAt: null,
              delays,
            };
            deps.store.saveCandidate(issued);
            deps.store.appendAlert(entryAlert);
            deps.store.noteIssuanceAttempt();
          }),
        readAccepted: () => deps.store.getSignalByIdentity(identityHash),
        isComplete: (s): s is StoredSignal => s !== null,
      }),
    );
  } catch (error) {
    if (error instanceof LostOwnershipError) {
      // Lost the race (e.g. a concurrent worker settled this candidate
      // first): return the database-accepted record — no error, no write.
      return deps.store.getCandidate(awaiting.candidateId) ?? awaiting;
    }
    throw error;
  }

  // Claim comparison — the production published vs already_exists distinction.
  if (accepted.issuanceClaim !== invocationId) {
    // Lost the race (concurrent manual + tick): return the database-accepted
    // record — no error, no duplicate.
    return deps.store.getCandidate(awaiting.candidateId) ?? awaiting;
  }
  // Deliver the entry alert (enqueued atomically above): recoverable —
  // claim-before-send, ack required, failures retried by recovery.
  await attemptAlertDelivery(deps, entryAlert);
  return deps.store.getCandidate(awaiting.candidateId) ?? awaiting;
}

export async function commitNonEntryOutcome(
  deps: IntegratedDeps,
  awaiting: CandidateRecord,
  contract: ActionableEntryContract,
  signalId: string,
  contractId: string,
  status: CandidateStatus,
  gate: string,
  reason: string,
  via: "manual" | "automatic",
  detail?: Record<string, unknown>,
): Promise<CandidateRecord> {
  const now = new Date(deps.clock.now()).toISOString();
  const { kind } = statusForGate(gate);
  const updated: CandidateRecord = {
    ...awaiting,
    status,
    outcome: { kind, gate, reason, via, detail },
    nextReassessmentAt: null,
    lastReassessedAt: now,
  };
  const committed = await deps.store.runExclusive(() =>
    deps.store.transact(() => {
      // ITEM 1 — same ownership/state guard as the entered commit: only the
      // owner of a live awaiting-entry + pending contract may record a
      // non-entry outcome. A losing invocation writes NOTHING and returns
      // the database-accepted state unchanged (no error).
      const ownership = checkTransitionOwnership(deps, awaiting.candidateId, contractId);
      if (!ownership.ok) return null;
      deps.store.saveContract({
        contractId,
        candidateId: awaiting.candidateId,
        signalId,
        state: contract.entryState,
        contractJson: JSON.stringify(contract),
        updatedAt: now,
      });
      deps.store.saveCandidate(updated);
      return updated;
    }),
  );
  if (!committed) return deps.store.getCandidate(awaiting.candidateId) ?? awaiting;
  // Logged non-entry: excluded from the accuracy cohort, never scored MISS.
  // No entry alert (the setup alert already fired at qualification).
  return committed;
}

/**
 * Poll-budget exhaustion while the entry window is STILL OPEN (item 3c):
 * keep status awaiting-entry, schedule another bounded observation run via
 * nextReassessmentAt, and record the outcome distinctly from expiry. Only a
 * closed window may void as void_expired.
 */
async function commitPollBudgetOutcome(
  deps: IntegratedDeps,
  awaiting: CandidateRecord,
  pending: ActionableEntryContract,
  contractId: string,
  via: "manual" | "automatic",
): Promise<CandidateRecord> {
  const nowMs = deps.clock.now();
  const now = new Date(nowMs).toISOString();
  const config = cfg(deps);
  const updated: CandidateRecord = {
    ...awaiting,
    status: "awaiting-entry",
    outcome: {
      kind: "awaiting-entry",
      gate: "poll-budget",
      reason:
        "poll-budget-exhausted, window still open: the observation poll budget was exhausted " +
        "before any qualifying print was observed; another bounded run is scheduled — distinctly NOT an expiry",
      via,
      detail: { entryWindowExpiresAt: pending.entryWindowExpiresAt },
    },
    nextReassessmentAt: new Date(nowMs + config.retryBackoffMs).toISOString(),
    lastReassessedAt: now,
  };
  const committed = await deps.store.runExclusive(() =>
    deps.store.transact(() => {
      const ownership = checkTransitionOwnership(deps, awaiting.candidateId, contractId);
      if (!ownership.ok) return null;
      deps.store.saveCandidate(updated);
      return updated;
    }),
  );
  if (!committed) return deps.store.getCandidate(awaiting.candidateId) ?? awaiting;
  return committed;
}

/**
 * Venue-clock-skew deferral (workstream B, 2026-10-13): a venue print arrived
 * timestamped in the future relative to our clock (provider clock ahead of
 * ours). The candidate stays awaiting-entry with the pending contract intact
 * and a reassessment scheduled — distinctly NOT an expiry, NOT an
 * invalidation, and NOT an entry. The deferral reason is the named
 * `deferred_clock_skew_future_observation`; the print's timestamp is never
 * clamped and no entry evidence is fabricated from it. A later tick resumes
 * observation; once the timestamp is no longer in the future (our clock
 * caught up / the provider clock corrected), the print is consumed normally.
 */
async function commitClockSkewDeferral(
  deps: IntegratedDeps,
  awaiting: CandidateRecord,
  via: "manual" | "automatic",
  skew: VenueClockSkewError,
): Promise<CandidateRecord> {
  const nowMs = deps.clock.now();
  const now = new Date(nowMs).toISOString();
  const config = cfg(deps);
  const updated: CandidateRecord = {
    ...awaiting,
    status: "awaiting-entry",
    outcome: {
      kind: "awaiting-entry",
      gate: "clock-skew",
      reason: skew.message,
      via,
      detail: { printTs: skew.printTs, ourClockMs: skew.nowMs },
    },
    nextReassessmentAt: new Date(nowMs + config.retryBackoffMs).toISOString(),
    lastReassessedAt: now,
  };
  const committed = await deps.store.runExclusive(() =>
    deps.store.transact(() => {
      // Ownership/state guard: only a live awaiting-entry candidate may be
      // deferred. A concurrent worker may have settled it meanwhile — then
      // return the database-accepted state unchanged.
      const live = deps.store.getCandidate(awaiting.candidateId);
      if (!live || live.status !== "awaiting-entry") return live ?? awaiting;
      deps.store.saveCandidate(updated);
      return updated;
    }),
  );
  return committed;
}

// ---------------------------------------------------------------------------
// THE integrated pipeline
// ---------------------------------------------------------------------------

/**
 * Recoverable alert delivery (workstream B, 2026-10-13).
 *
 * Sequence: claim-before-send (inside the store's transition transaction —
 * only the claim winner sends) → run the deliverAlert hook → on an ACTUAL
 * acknowledgement, markAlertDelivered (idempotent on the ack); on a
 * transport failure (throw or { acknowledged: false }), markAlertFailed so
 * the recovery pass retries it.
 *
 * Enqueue (appendAlert, inside the outcome transaction) and delivery are
 * separate steps with separate timestamps by construction — and delivery is
 * only recorded after acknowledgement. A hook that returns void is the
 * sandbox transport: its clean return is the acknowledgement, persisted
 * with delivery_mode "simulated" (never "live").
 *
 * Returns { delivered } — whether THIS call recorded a delivery (false when
 * the claim was lost to a concurrent sender, or the transport failed).
 */
/**
 * In-process in-flight registry for alert delivery. Guards the case the DB
 * claim cannot see: two senders in THIS process (tick + recovery pass)
 * attempting the same alert — the DB claim is reclaimable from "sending" by
 * design (a crashed process's claim must be reclaimable), so without this
 * the second sender would reclaim a row the first is actively delivering and
 * double-send. Entries are added before the claim and removed in `finally`;
 * a crashed process dies with its registry, so recovery in a new process is
 * unaffected. (Alert ids are globally deterministic — setup_<candidateId> /
 * entry_<signalId> — so cross-store collisions serialize to the safe side.)
 */
const inFlightDeliveries = new Set<string>();

async function attemptAlertDelivery(
  deps: IntegratedDeps,
  alert: AlertRow,
): Promise<{ delivered: boolean; claimed: boolean; mode: "simulated" | "live" }> {
  if (inFlightDeliveries.has(alert.id)) {
    return { delivered: false, claimed: false, mode: "simulated" }; // this process is already sending it
  }
  inFlightDeliveries.add(alert.id);
  try {
    return await attemptAlertDeliveryClaimed(deps, alert);
  } finally {
    inFlightDeliveries.delete(alert.id);
  }
}

async function attemptAlertDeliveryClaimed(
  deps: IntegratedDeps,
  alert: AlertRow,
): Promise<{ delivered: boolean; claimed: boolean; mode: "simulated" | "live" }> {
  const claim = randomUUID();
  const won = await deps.store.runExclusive(() =>
    deps.store.transact(() => deps.store.claimAlertForDelivery(alert.id, claim)),
  );
  if (!won) return { delivered: false, claimed: false, mode: "simulated" }; // a concurrent sender owns it
  const fallbackMode = deps.deliveryMode ?? "simulated";
  try {
    const raw = await deps.deliverAlert?.(alert);
    const acknowledged = raw == null ? true : raw.acknowledged !== false;
    if (!acknowledged) throw new Error("transport declined the acknowledgement");
    const mode = raw?.mode ?? fallbackMode;
    const ackId: string | undefined = raw?.ackId ?? undefined;
    deps.store.markAlertDelivered(alert.id, new Date(deps.clock.now()).toISOString(), { mode, ackId });
    return { delivered: true, claimed: true, mode };
  } catch {
    // Transport failure: mark failed — the recovery pass retries it; the
    // alert is never lost and never marked delivered without an ack.
    deps.store.markAlertFailed(alert.id);
    return { delivered: false, claimed: true, mode: fallbackMode };
  }
}

export interface AlertRecoveryReport {
  at: string;
  /** Alert ids this pass attempted to (re)deliver (claim won). */
  attempted: string[];
  /** Alert ids acknowledged this pass. */
  delivered: string[];
  /** Alert ids whose transport failed again this pass (still undelivered). */
  failed: string[];
  /** Alert ids skipped because a concurrent sender already holds the claim. */
  skipped: string[];
}

/**
 * Recovery pass (workstream B): read every undelivered alert from the DB
 * and (re)deliver it. This is the tick-restart path: a process that crashed
 * between enqueue and acknowledgement leaves alerts in "enqueued" (never
 * attempted), "sending" (claimed, ack never recorded), or "failed"
 * (transport failure) — all three are reclaimed and delivered exactly once
 * via claim-before-send; markAlertDelivered is a no-op on duplicate acks.
 */
export async function recoverUndeliveredAlerts(deps: IntegratedDeps): Promise<AlertRecoveryReport> {
  const report: AlertRecoveryReport = {
    at: new Date(deps.clock.now()).toISOString(),
    attempted: [],
    delivered: [],
    failed: [],
    skipped: [],
  };
  for (const alert of deps.store.listUndeliveredAlerts()) {
    const outcome = await attemptAlertDelivery(deps, alert);
    if (!outcome.claimed) {
      report.skipped.push(alert.id);
      continue;
    }
    report.attempted.push(alert.id);
    if (outcome.delivered) report.delivered.push(alert.id);
    else report.failed.push(alert.id);
  }
  return report;
}

/**
 * Steps 9–11 shared by the fresh path and the resume path: entry
 * observation → waiting-interval veto → post-entry invalidation →
 * outcome commit. `pending` is the live pending contract (freshly built on
 * the fresh path; parsed from the persisted DB row on the resume path).
 */
async function observeAndSettle(
  deps: IntegratedDeps,
  awaiting: CandidateRecord,
  pending: ActionableEntryContract,
  vetoSummary: string,
  via: "manual" | "automatic",
  invocationId: string,
): Promise<CandidateRecord> {
  const config = cfg(deps);
  const contractId = contractIdFor(awaiting.candidateId);
  const identityHash = issuanceIdentityFor(awaiting);
  const signalId = signalIdFor(identityHash);

  // 9. Entry observation — the separate entry step (observeEntry per print).
  // The feed is skew-guarded: any venue print timestamped in the future
  // relative to the observation clock (provider clock ahead of ours) throws
  // VenueClockSkewError instead of being served — the timestamps are never
  // clamped and no entry evidence is fabricated from them. The guard reads
  // the bundle's WatchClock (receipt-time frame, same as the late-receipt
  // check) rather than the handler clock, so a print observed late (minute-16
  // fetch) is judged against when it is actually observed.
  const feedBundle = deps.entryFeedFor?.(pending, awaiting) ?? null;
  const guardedBundle = feedBundle
    ? { ...feedBundle, feed: skewGuardedFeed(feedBundle.feed, () => feedBundle.clock.nowMs()) }
    : null;
  let observed: ObservationResult;
  try {
    observed = await observeEntryPhase(pending, guardedBundle);
  } catch (error) {
    // Integrity violations (anti-fabrication, causality, entry-before-decision)
    // are loud ContractErrors — never recorded as business outcomes. The
    // candidate stays awaiting-entry with the pending contract intact.
    if (error instanceof ContractError) throw error;
    // Venue-clock skew: DEFER with the named reason and retry on a later
    // tick (commitClockSkewDeferral). Never clamps, never fabricates.
    if (error instanceof VenueClockSkewError) {
      return commitClockSkewDeferral(deps, awaiting, via, error);
    }
    throw error;
  }

  // 9a. Poll-budget exhaustion while the window is still open: NOT an expiry.
  if (observed.outcome === "poll-budget-exhausted") {
    return commitPollBudgetOutcome(deps, awaiting, pending, contractId, via);
  }

  // 9b. WAITING-INTERVAL veto — the genuine decision→entry check over the
  // REAL observed interval [contract.decisionAt, entryObservedAt], BEFORE
  // the outcome commit. Verdict !== "pass" fails closed (uncertain included):
  // the setup is invalidated in its own waiting interval, the reason is
  // recorded, and no signal row is persisted.
  if (observed.outcome === "entered") {
    const entered = observed.contract;
    const waiting = checkWaitingInterval({
      direction: awaiting.direction,
      finalStop: entered.invalidationPrice,
      decisionAt: Date.parse(entered.decisionAt),
      entryAt: Date.parse(entered.entryObservedAt as string),
      preDecisionAt: isoMs(awaiting.detectedAt),
      finestGranularity: awaiting.terminal === "equity" ? "session" : "intraday",
      bars: deps.waitingIntervalEvidenceFor?.(entered) ?? [],
      allowEmptyInterval: awaiting.terminal === "equity", // overnight gap has no bars by construction
    });
    if (waiting.verdict !== "pass") {
      return commitNonEntryOutcome(deps, awaiting, entered, signalId, contractId,
        "invalidated", "waiting-interval-invalidation",
        `waiting-interval veto ${waiting.verdict}: ${waiting.reason}`, via,
        {
          waitingInterval: {
            verdict: waiting.verdict,
            reason: waiting.reason,
            checks: waiting.checks.map((c) => ({ check: c.check, verdict: c.verdict, reason: c.reason })),
          },
        });
    }

    // 10. Post-entry invalidation — the POST-ENTRY point (correction 6c).
    const postAssessment = assessPostEntry(deps, entered, awaiting.direction);
    if (postAssessment.invalidated) {
      return commitNonEntryOutcome(deps, awaiting, entered, signalId, contractId,
        "invalidated", postAssessment.gate, postAssessment.reason, via,
        { postEntry: { verdict: postAssessment.result.verdict, entryValid: postAssessment.result.entryValid, interveningInvalidation: postAssessment.result.interveningInvalidation } });
    }
    // 11. OUTCOME COMMIT — signal + contract + candidate + entry alert, atomic.
    // The in-transaction duplicate backstop throws DuplicateIssuanceError on
    // a lost race; convert it to a clean duplicate rejection (the pre-check
    // in step 6 catches the common case; this closes the check→issue race).
    // The in-transaction ownership guard throws LostOwnershipError when a
    // concurrent worker settled the candidate first; the commit converts it
    // to returning the accepted record (no error, no write).
    try {
      return await commitEnteredOutcome(deps, awaiting, entered, observed.event, signalId, contractId,
        identityHash, invocationId, vetoSummary, postAssessment, via);
    } catch (error) {
      if (error instanceof DuplicateIssuanceError) {
        return reject(deps, awaiting, "duplicate",
          `duplicate suppressed: ${awaiting.symbol} ${awaiting.direction} already issued as ${error.winningSignalId} within ${config.duplicateWindowMs}ms`,
          via, { winningSignalId: error.winningSignalId });
      }
      throw error;
    }
  }
  if (observed.outcome === "expired") {
    return commitNonEntryOutcome(deps, awaiting, observed.contract, signalId, contractId,
      "entry-expired", "entry-expired",
      observed.contract.voidReason ?? "entry window lapsed with no qualifying print", via);
  }
  // invalidated: void_drift (print outside the drift cap) or void_no_quote.
  const gate = observed.contract.entryState === "void_drift" ? "entry-drift" : "entry-no-quote";
  return commitNonEntryOutcome(deps, awaiting, observed.contract, signalId, contractId,
    "invalidated", gate,
    observed.contract.voidReason ?? "entry invalidated before fill", via);
}

/**
 * Durable awaiting-entry recovery (item 3b): a candidate left in
 * awaiting-entry by a crashed process (or an earlier tick) resumes from the
 * PERSISTED state — the candidate row and the contract ROW from the DB.
 * The contract is parsed from the stored JSON (the in-memory registry is
 * gone by design), validated structurally, and observation runs a BOUNDED
 * run (maxPolls) WITHOUT recreating the contract or re-firing the setup
 * alert (the setup alert row already exists; appendAlert is
 * ON CONFLICT DO NOTHING in any case).
 */
async function resumeAwaitingEntry(
  deps: IntegratedDeps,
  candidate: CandidateRecord,
  via: "manual" | "automatic",
  invocationId: string,
): Promise<CandidateRecord> {
  const now = new Date(deps.clock.now()).toISOString();
  const contractId = candidate.contractId;
  const failClosed = (reason: string): CandidateRecord => deps.store.transact(() => {
    const live = deps.store.getCandidate(candidate.candidateId) ?? candidate;
    if (live.status !== "awaiting-entry") return live; // settled meanwhile: return accepted state
    const updated: CandidateRecord = {
      ...live,
      status: "invalidated",
      outcome: { kind: "invalidated", gate: "awaiting-entry-corrupt", reason, via },
      nextReassessmentAt: null,
      lastReassessedAt: now,
    };
    deps.store.saveCandidate(updated);
    return updated;
  });

  // The contract ROW is the source of truth: state must be "pending".
  const row = contractId ? deps.store.getContract(contractId) : null;
  if (!row) {
    return failClosed(
      `awaiting-entry resume failed closed: candidate ${candidate.candidateId} has no contract row ` +
      `(contractId ${contractId ?? "null"}) — the durable state is incoherent`,
    );
  }
  if (row.state !== "pending") {
    return failClosed(
      `awaiting-entry resume failed closed: contract row ${row.contractId} is ${row.state}, not pending — ` +
      `observation cannot resume on a non-pending contract`,
    );
  }
  let contract: ActionableEntryContract;
  try {
    contract = JSON.parse(row.contractJson) as ActionableEntryContract;
  } catch {
    return failClosed(
      `awaiting-entry resume failed closed: contract row ${row.contractId} JSON is unparseable`,
    );
  }
  // Structural validation of the parsed contract (entryState === "pending" +
  // entry fields explicitly empty — the same invariant observeEntry enforces).
  const structurallyPending =
    contract.entryState === "pending" &&
    contract.entryPrice === null &&
    contract.entryObservedAt === null &&
    contract.entryReceivedAt === null &&
    contract.driftObservedPct === null &&
    contract.entryEvidence === "unavailable";
  if (!structurallyPending) {
    return failClosed(
      `awaiting-entry resume failed closed: parsed contract ${row.contractId} violates the pending ` +
      `structural invariant (entryState ${contract.entryState})`,
    );
  }
  const vetoSummary =
    `resumed from durable awaiting-entry state (qualified ${candidate.setupAlertAt ?? "unknown"}; ` +
    `contract ${contractId} reloaded from the persisted DB row — not rebuilt, setup alert not re-fired)`;
  return observeAndSettle(deps, candidate, contract, vetoSummary, via, invocationId);
}

/**
 * The single integrated issuance pipeline. Shared verbatim by the automatic
 * tick and the manual entry point.
 */
export async function processIntegratedCandidate(
  deps: IntegratedDeps,
  candidate: CandidateRecord,
  via: "manual" | "automatic",
  invocationId: string = randomUUID(),
): Promise<CandidateRecord> {
  const config = cfg(deps);
  const nowMs = deps.clock.now();

  // Already settled: idempotent no-op (a concurrent call may have settled it).
  if (isTerminalStatus(candidate.status)) return candidate;
  // Awaiting-entry: durable resume from the persisted DB state (item 3b).
  // Never double-process blindly — the contract ROW is re-validated first.
  if (candidate.status === "awaiting-entry") {
    return resumeAwaitingEntry(deps, candidate, via, invocationId);
  }

  // 1. Expiry.
  if (nowMs - isoMs(candidate.firstSeenAt) > config.candidateTtlMs) {
    return reject(deps, candidate, "expiry",
      `candidate TTL exceeded: detected ${candidate.firstSeenAt}, TTL ${config.candidateTtlMs}ms`, via);
  }

  // 2. Min-score floor.
  if (candidate.score < config.minScore) {
    return reject(deps, candidate, "min-score",
      `score ${candidate.score} below orchestrator floor ${config.minScore}`, via);
  }

  // 3. Freshness-gated cheap refresh.
  const { working, deferred } = await refreshIfStale(deps, candidate, config, nowMs, via);
  if (deferred) return deferred;

  // 4. Retained regime gate (NO legacy historical-extreme veto on this path).
  const regimeBlocked = retainedRegimeGate(working);
  if (regimeBlocked) return reject(deps, working, regimeBlocked.gate, regimeBlocked.reason, via);

  // 5. Qualification veto: buildIssuanceVetoInput -> runQualificationChecks
  //    (setup-history filter + pipeline-order + entry-zone ONLY). The
  //    decision→entry invalidation is NOT evaluated here — the entry has not
  //    been observed yet; the genuine [contract.decisionAt, entryObservedAt]
  //    window is graded by checkWaitingInterval at step 9b.
  const vetoInput = buildIssuanceVetoInput(working, working.inputs, nowMs);
  const vetoResult = runQualificationChecks(vetoInput);
  if (vetoResult.verdict !== "pass") {
    return reject(deps, working, "issuance-veto", vetoResult.summary, via, {
      checks: vetoResult.checks.map((c) => ({ check: c.check, verdict: c.verdict, reason: c.reason })),
    });
  }

  // 6. Duplicate suppression (pre-check; re-checked atomically in the outcome transaction).
  const dupe = findDuplicate(deps, working, nowMs, config);
  if (dupe) {
    return reject(deps, working, "duplicate",
      `duplicate suppressed: ${working.symbol} ${working.direction} already issued as ${dupe.signalId} within ${config.duplicateWindowMs}ms`,
      via, { winningSignalId: dupe.signalId });
  }

  // 7. Build the pending contract (correction 2+3: entry fields explicitly
  //    empty; the ACTUAL decision instant threaded through, never backdated).
  const decisionAtIso = new Date(nowMs).toISOString();
  const identityHash = issuanceIdentityFor(working);
  const signalId = signalIdFor(identityHash);
  const contractId = contractIdFor(working.candidateId);
  const contractInput = working.terminal === "equity"
    ? equityContractInput(working, decisionAtIso, decisionAtIso, signalId)
    : cryptoContractInput(working, decisionAtIso, decisionAtIso, signalId);
  const pending = buildPendingContract(
    { candidateId: working.candidateId, terminal: working.terminal, symbol: working.symbol },
    {
      decisionAt: decisionAtIso,
      qualificationReason:
        `integrated issuance [${via}]: retained regime gate passed; ` +
        `runQualificationChecks pass — ${vetoResult.summary}`,
      contractInput,
    },
  );

  // 8. QUALIFICATION COMMIT — contract (pending) + candidate (awaiting-entry,
  //    contractId, setupAlertAt) + setup alert in ONE transaction.
  //    Ownership/state guard INSIDE the transaction: proceed only if the
  //    candidate is still pending/deferred. The loser of a concurrent race
  //    returns the accepted state unchanged (won=false) — no observation,
  //    no write; a later tick resumes the winner's durable state.
  const setupAlertAt = decisionAtIso;
  const setupAlert: AlertRow = {
    id: setupAlertIdFor(working.candidateId),
    kind: "setup",
    signalId,
    candidateId: working.candidateId,
    symbol: working.symbol,
    direction: working.direction,
    alertedAt: setupAlertAt,
    channel: "sandbox-feed",
    enqueuedAt: setupAlertAt,
    deliveredAt: null,
    deliveryStatus: "enqueued",
    deliveryMode: null,
    ackId: null,
    deliveryAttempts: 0,
  };
  const qualResult = await deps.store.runExclusive(() =>
    deps.store.transact(() => {
      const current = deps.store.getCandidate(working.candidateId);
      if (!current || (current.status !== "pending" && current.status !== "deferred")) {
        return { record: current ?? working, won: false }; // lost the race: return accepted state
      }
      deps.store.saveContract({
        contractId,
        candidateId: working.candidateId,
        signalId,
        state: pending.entryState,
        contractJson: JSON.stringify(pending),
        updatedAt: setupAlertAt,
      });
      const awaiting: CandidateRecord = {
        ...working,
        status: "awaiting-entry",
        outcome: {
          kind: "awaiting-entry", gate: null,
          reason: "setup qualified; entry contract built (pending); setup alert fired — entry pending",
          via,
        },
        contractId,
        setupAlertAt,
        lastReassessedAt: setupAlertAt,
        nextReassessmentAt: null,
      };
      deps.store.saveCandidate(awaiting);
      deps.store.appendAlert(setupAlert);
      return { record: awaiting, won: true };
    }),
  );
  if (!qualResult.won || isTerminalStatus(qualResult.record.status)) return qualResult.record;
  const awaiting = qualResult.record;

  // Deliver the setup alert (enqueued atomically above): recoverable —
  // claim-before-send, ack required, failures retried by recovery.
  await attemptAlertDelivery(deps, setupAlert);

  // 9–11. Entry observation → waiting-interval veto → post-entry point →
  // outcome commit (shared with the resume path).
  return observeAndSettle(deps, awaiting, pending, vetoResult.summary, via, invocationId);
}

/**
 * Automatic path: scheduler-compatible tick over the integrated pipeline.
 * No cron is wired here. Processes pending candidates and deferred candidates
 * whose next-reassessment time is due.
 */
export async function integratedTick(deps: IntegratedDeps): Promise<TickReport> {
  const nowMs = deps.clock.now();
  const report: TickReport = {
    at: new Date(nowMs).toISOString(), processed: [], issued: [], rejected: [], deferred: [], expired: [], awaiting: [],
  };
  for (const candidate of deps.store.listCandidates()) {
    // Pending + deferred-due candidates run the full pipeline; awaiting-entry
    // candidates whose reassessment is due (or never scheduled) resume from
    // the persisted DB state (item 3d).
    const due = candidate.status === "pending" ||
      (candidate.status === "deferred" && candidate.nextReassessmentAt !== null && isoMs(candidate.nextReassessmentAt) <= nowMs) ||
      (candidate.status === "awaiting-entry" &&
        (candidate.nextReassessmentAt === null || isoMs(candidate.nextReassessmentAt) <= nowMs));
    if (!due) continue;
    report.processed.push(candidate.candidateId);
    const updated = await processIntegratedCandidate(deps, candidate, "automatic", randomUUID());
    if (updated.status === "issued") report.issued.push(updated.candidateId);
    else if (updated.status === "expired" || updated.status === "entry-expired") report.expired.push(updated.candidateId);
    else if (updated.status === "deferred") report.deferred.push(updated.candidateId);
    else if (updated.status === "awaiting-entry") report.awaiting.push(updated.candidateId);
    else report.rejected.push(updated.candidateId);
  }
  return report;
}

/**
 * Manual path: explicit manual-issue entry point running the SAME integrated
 * pipeline as the automatic tick.
 */
export async function integratedManualIssue(
  deps: IntegratedDeps,
  input: PaperCandidateInput,
  invocationId: string = randomUUID(),
): Promise<CandidateRecord> {
  const candidate = await ingestIntegratedCandidate(deps, { ...input, source: "manual" });
  if (isTerminalStatus(candidate.status)) return candidate;
  return processIntegratedCandidate(deps, candidate, "manual", invocationId);
}
