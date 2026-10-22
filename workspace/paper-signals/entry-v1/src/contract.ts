/**
 * actionable-entry-v1 — frozen contract module (sandbox).
 *
 * Implements the contract schema drafted in ENTRY-SEMANTICS.md §4
 * (source-export-2026-10-13). This file is the normative definition:
 * once adopted, v1 semantics are immutable; any change to decision-time
 * definition, observation semantics, entry rule, venue, expiry window, or
 * drift cap requires a new contract version (v2), per the versioning rule.
 *
 * Sandbox only. No production changes, no live trading, holdouts locked.
 *
 * REJECTION POLICY (correction 1, 2026-10-13): `enterContract` REJECTS by
 * THROWING `ContractError` — never by returning a soft rejection. Every
 * rejection carries a machine-readable `reasonCode` from
 * `ENTRY_REJECTION_REASON`, so a caller cannot silently swallow a violated
 * invariant. Throw (not typed-return) is the choice because the whole
 * entry-v1 API boundary already throws (`buildContract`, `voidContract`,
 * `markEvidenceUnavailable`); mixing return-based rejections into one path
 * would let integrity violations look like business outcomes.
 */

// ---------------------------------------------------------------------------
// Version + cohort identity
// ---------------------------------------------------------------------------

/** Frozen contract version string. NEVER change this constant's value. */
export const CONTRACT_VERSION = "actionable-entry-v1" as const;
export type ContractVersion = typeof CONTRACT_VERSION;

export type Terminal = "equity" | "crypto";

export type DecisionClock = "xnys-session-close" | "server-utc";

export type EntryRule =
  | "next-xnys-regular-session-open-print"
  | "first-post-decision-binance-spot-trade";

export type EntryState =
  | "pending"
  | "entered"
  | "void_drift"
  | "void_expired"
  | "void_no_quote"
  | "void_first_print_missed"
  | "void_first_print_unverifiable";

export type HorizonUnit = "trading_sessions" | "elapsed_days";

/**
 * How the entry print was evidenced. The anti-fabrication rule lives here:
 * a contract may only carry an entryPrice when evidence is a subsequent
 * observable bid/ask (`venue-trade`) or an explicitly cost-adjusted quote
 * (`cost-adjusted-quote`). When no fill evidence exists, evidence MUST be
 * `"unavailable"` with a reason, and entryPrice MUST stay null — a fill
 * price is never invented.
 */
export type EntryEvidence = "venue-trade" | "cost-adjusted-quote" | "unavailable";

// ---------------------------------------------------------------------------
// The frozen 30-field contract (+ evidence fields required by the build task)
// ---------------------------------------------------------------------------

export interface ActionableEntryContract {
  // --- §4 table fields ---
  contractVersion: ContractVersion;
  terminal: Terminal;
  signalId: string | number;
  strategyId: string;
  strategyVersion: string;
  parameterHash: string;
  decisionAt: string; // ISO-8601 UTC — the information-cutoff commit instant
  decisionClock: DecisionClock;
  decisionPrice: number; // frozen reference (>0)
  sourceObservedAt: string | null; // venue/provider observation instant; null only under degraded rule
  sourceObservationWindow: { start: string; end: string } | null;
  entryRule: EntryRule;
  entryVenue: string;
  entryWindowOpensAt: string; // ISO-8601 UTC
  entryWindowExpiresAt: string; // ISO-8601 UTC
  entryPrice: number | null; // null until entered
  entryObservedAt: string | null; // venue timestamp of the entry print
  entryReceivedAt: string | null; // server receipt time (staleness audit)
  observationDegraded: boolean; // true iff sourceObservedAt is null (crypto fallback path only)
  driftCapPct: number; // 0.50 equity | 1.50 crypto — explicit param, see entry-rules.ts
  driftObservedPct: number | null; // signed, null until entered
  entryState: EntryState;
  voidReason: string | null;
  invalidationPrice: number; // frozen at decision — IMMUTABLE (see levels.ts)
  target1Price: number | null; // frozen at decision
  target2Price: number | null; // frozen at decision
  riskPerUnit: number; // frozen at decision (>0)
  horizonUnit: HorizonUnit;
  primaryHorizon: number; // 30
  evaluatorCompatibility: string;
  supersedes: null; // always null — research records are never rewritten
  issuedBy: string; // build id at issuance
  issuedAt: string; // ISO-8601 UTC server time of contract write (>= decisionAt)

  // --- build-task-required extensions (frozen alongside the 30) ---
  /** Versioned cohort marker. Graded in a separate cohort from legacy rows. */
  cohortId: string;
  /** How the entry print was evidenced; "unavailable" ⇒ entryPrice stays null. */
  entryEvidence: EntryEvidence;
  /** Required when entryEvidence === "unavailable"; null otherwise. */
  entryEvidenceReason: string | null;
}

/** Cohort marker format: version:terminal:horizonUnit:horizon. */
export function deriveCohortId(
  terminal: Terminal,
  horizonUnit: HorizonUnit,
  primaryHorizon: number,
): string {
  return `${CONTRACT_VERSION}:${terminal}:${horizonUnit}:${primaryHorizon}`;
}

// ---------------------------------------------------------------------------
// Validation + construction
// ---------------------------------------------------------------------------

export class ContractError extends Error {
  /** Machine-readable rejection code (see ENTRY_REJECTION_REASON); undefined on legacy throws. */
  readonly reasonCode?: string;
  constructor(message: string, reasonCode?: string) {
    super(`[actionable-entry-v1] ${message}`);
    this.name = "ContractError";
    this.reasonCode = reasonCode;
  }
}

/**
 * Machine-readable reason codes for every `enterContract` rejection
 * (correction 1). Assert on these in tests — never on message substrings.
 */
export const ENTRY_REJECTION_REASON = {
  /** (a) anti-fabrication: evidence "unavailable" carrying a fill price. */
  evidenceUnavailableWithFill: "evidence-unavailable-with-fill",
  /** (b) causality violation: receiptAt earlier than provider observationAt. */
  receiptBeforeObservation: "receipt-before-observation",
  /** (c) entry observation timestamped before the contract was issued. */
  observationBeforeIssuance: "observation-before-issuance",
  /** correction 3: entry print predates the actual decision instant. */
  entryBeforeDecision: "entry-before-decision",
  /** entry print outside [entryWindowOpensAt, entryWindowExpiresAt]. */
  entryOutsideWindow: "entry-outside-window",
  /** |drift| exceeds the contract's drift cap. */
  driftExceeded: "drift-exceeded",
  /** transition attempted on a non-pending (terminal) contract. */
  contractNotPending: "contract-not-pending",
  /** contract version is not the frozen v1. */
  versionMismatch: "version-mismatch",
} as const;
export type EntryRejectionReason =
  (typeof ENTRY_REJECTION_REASON)[keyof typeof ENTRY_REJECTION_REASON];

export function assertIsoUtc(label: string, v: unknown): asserts v is string {
  if (typeof v !== "string" || Number.isNaN(Date.parse(v))) {
    throw new ContractError(`${label} must be an ISO-8601 string, got ${JSON.stringify(v)}`);
  }
  // Require an explicit timezone designator (Z or offset) — no naive times.
  if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(v.trim())) {
    throw new ContractError(`${label} must carry an explicit timezone (Z or offset), got ${v}`);
  }
}

function assertPositive(label: string, v: unknown): asserts v is number {
  if (typeof v !== "number" || !(v > 0) || !Number.isFinite(v)) {
    throw new ContractError(`${label} must be a finite number > 0, got ${JSON.stringify(v)}`);
  }
}

/** Deep-freeze so published contracts are structurally immutable. */
export function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === "object" && !Object.isFrozen(obj)) {
    for (const key of Object.keys(obj)) {
      deepFreeze((obj as Record<string, unknown>)[key]);
    }
    Object.freeze(obj);
  }
  return obj;
}

export interface ContractInput {
  terminal: Terminal;
  signalId: string | number;
  strategyId: string;
  strategyVersion: string;
  parameterHash: string;
  decisionAt: string;
  decisionClock: DecisionClock;
  decisionPrice: number;
  sourceObservedAt: string | null;
  sourceObservationWindow: { start: string; end: string } | null;
  entryRule: EntryRule;
  entryVenue: string;
  entryWindowOpensAt: string;
  entryWindowExpiresAt: string;
  invalidationPrice: number;
  target1Price: number | null;
  target2Price: number | null;
  riskPerUnit: number;
  horizonUnit: HorizonUnit;
  primaryHorizon: number;
  evaluatorCompatibility: string;
  issuedBy: string;
  issuedAt: string;
  driftCapPct: number;
}

/**
 * Construct a new pending contract at issuance. Throws on any schema
 * violation. The returned contract is deep-frozen.
 */
export function buildContract(input: ContractInput): ActionableEntryContract {
  assertIsoUtc("decisionAt", input.decisionAt);
  assertIsoUtc("entryWindowOpensAt", input.entryWindowOpensAt);
  assertIsoUtc("entryWindowExpiresAt", input.entryWindowExpiresAt);
  assertIsoUtc("issuedAt", input.issuedAt);
  if (input.sourceObservedAt !== null) assertIsoUtc("sourceObservedAt", input.sourceObservedAt);
  if (input.sourceObservationWindow !== null) {
    assertIsoUtc("sourceObservationWindow.start", input.sourceObservationWindow.start);
    assertIsoUtc("sourceObservationWindow.end", input.sourceObservationWindow.end);
  }
  assertPositive("decisionPrice", input.decisionPrice);
  assertPositive("invalidationPrice", input.invalidationPrice);
  assertPositive("riskPerUnit", input.riskPerUnit);
  if (input.target1Price !== null) assertPositive("target1Price", input.target1Price);
  if (input.target2Price !== null) assertPositive("target2Price", input.target2Price);
  if (typeof input.driftCapPct !== "number" || !(input.driftCapPct > 0)) {
    throw new ContractError(`driftCapPct must be a number > 0`);
  }

  const decisionMs = Date.parse(input.decisionAt);
  const issuedMs = Date.parse(input.issuedAt);
  if (issuedMs < decisionMs) {
    throw new ContractError(`issuedAt (${input.issuedAt}) must be >= decisionAt (${input.decisionAt})`);
  }
  if (Date.parse(input.entryWindowExpiresAt) <= Date.parse(input.entryWindowOpensAt)) {
    throw new ContractError(`entryWindowExpiresAt must be after entryWindowOpensAt`);
  }

  // Cross-field consistency demanded by the spec.
  const expectedRule: EntryRule =
    input.terminal === "equity"
      ? "next-xnys-regular-session-open-print"
      : "first-post-decision-binance-spot-trade";
  if (input.entryRule !== expectedRule) {
    throw new ContractError(
      `entryRule ${input.entryRule} does not match terminal ${input.terminal} (expected ${expectedRule})`,
    );
  }
  const expectedClock: DecisionClock =
    input.terminal === "equity" ? "xnys-session-close" : "server-utc";
  if (input.decisionClock !== expectedClock) {
    throw new ContractError(`decisionClock mismatch for terminal ${input.terminal}`);
  }
  // Degraded observation is a crypto-fallback concept only.
  if (input.terminal === "equity" && input.sourceObservedAt === null) {
    throw new ContractError(`equity contracts require a non-null sourceObservedAt`);
  }

  const contract: ActionableEntryContract = {
    contractVersion: CONTRACT_VERSION,
    terminal: input.terminal,
    signalId: input.signalId,
    strategyId: input.strategyId,
    strategyVersion: input.strategyVersion,
    parameterHash: input.parameterHash,
    decisionAt: input.decisionAt,
    decisionClock: input.decisionClock,
    decisionPrice: input.decisionPrice,
    sourceObservedAt: input.sourceObservedAt,
    sourceObservationWindow: input.sourceObservationWindow,
    entryRule: input.entryRule,
    entryVenue: input.entryVenue,
    entryWindowOpensAt: input.entryWindowOpensAt,
    entryWindowExpiresAt: input.entryWindowExpiresAt,
    entryPrice: null,
    entryObservedAt: null,
    entryReceivedAt: null,
    observationDegraded: input.sourceObservedAt === null,
    driftCapPct: input.driftCapPct,
    driftObservedPct: null,
    entryState: "pending",
    voidReason: null,
    invalidationPrice: input.invalidationPrice,
    target1Price: input.target1Price,
    target2Price: input.target2Price,
    riskPerUnit: input.riskPerUnit,
    horizonUnit: input.horizonUnit,
    primaryHorizon: input.primaryHorizon,
    evaluatorCompatibility: input.evaluatorCompatibility,
    supersedes: null,
    issuedBy: input.issuedBy,
    issuedAt: input.issuedAt,
    cohortId: deriveCohortId(input.terminal, input.horizonUnit, input.primaryHorizon),
    entryEvidence: "unavailable",
    entryEvidenceReason: "contract pending — no entry observation yet",
  };
  return deepFreeze(contract);
}

// ---------------------------------------------------------------------------
// State machine: pending -> entered | void_drift | void_expired | void_no_quote
// ---------------------------------------------------------------------------

export interface EntryObservation {
  /** Venue timestamp of the entry print (Binance T; equity = session-open instant). */
  entryObservedAt: string;
  /** Server receipt time. */
  entryReceivedAt: string;
  entryPrice: number;
  evidence: Exclude<EntryEvidence, "unavailable">;
}

export interface VoidObservation {
  entryState: "void_drift" | "void_expired" | "void_no_quote" | "void_first_print_missed" | "void_first_print_unverifiable";
  voidReason: string;
  /** entryPrice at the moment of voiding (e.g. the drifted print), if observed. */
  driftedPrice?: number;
}

/**
 * Transition a pending contract to entered. Rejects by THROWING
 * ContractError with an ENTRY_REJECTION_REASON code (correction 1) for:
 *   (a) evidence "unavailable" carrying a fill price (anti-fabrication),
 *   (b) receipt-before-observation (causality violation),
 *   (c) observation timestamped before the contract was issued.
 * Also rejects entry prints predating decisionAt (correction 3), prints
 * outside the entry window, and drift beyond the cap — the window/drift
 * cases must go through voidContract instead.
 */
export function enterContract(
  contract: ActionableEntryContract,
  obs: EntryObservation,
): ActionableEntryContract {
  if (contract.entryState !== "pending") {
    throw new ContractError(
      `cannot enter: contract is ${contract.entryState} (terminal)`,
      ENTRY_REJECTION_REASON.contractNotPending,
    );
  }
  if (contract.contractVersion !== CONTRACT_VERSION) {
    throw new ContractError(
      `version mismatch: ${contract.contractVersion}`,
      ENTRY_REJECTION_REASON.versionMismatch,
    );
  }
  // (a) anti-fabrication: the TS type excludes "unavailable" from
  // EntryObservation, but a runtime caller can still smuggle it in.
  // A fill price with unavailable evidence is never a fill.
  if ((obs as { evidence?: unknown }).evidence === "unavailable") {
    throw new ContractError(
      `evidence "unavailable" cannot carry a fill price — anti-fabrication rejection`,
      ENTRY_REJECTION_REASON.evidenceUnavailableWithFill,
    );
  }
  assertIsoUtc("entryObservedAt", obs.entryObservedAt);
  assertIsoUtc("entryReceivedAt", obs.entryReceivedAt);
  assertPositive("entryPrice", obs.entryPrice);

  const observedMs = Date.parse(obs.entryObservedAt);
  const receivedMs = Date.parse(obs.entryReceivedAt);
  const opensMs = Date.parse(contract.entryWindowOpensAt);
  const expiresMs = Date.parse(contract.entryWindowExpiresAt);
  const decisionMs = Date.parse(contract.decisionAt);
  const issuedMs = Date.parse(contract.issuedAt);

  // (b) causality: the server cannot receive a print before it was observed.
  if (receivedMs < observedMs) {
    throw new ContractError(
      `entryReceivedAt (${obs.entryReceivedAt}) precedes entryObservedAt (${obs.entryObservedAt}) — causality violation`,
      ENTRY_REJECTION_REASON.receiptBeforeObservation,
    );
  }
  // correction 3: the selected entry print must not predate the actual
  // decision instant. A late scan may not claim an earlier print as its entry.
  if (observedMs < decisionMs) {
    throw new ContractError(
      `entry print ${obs.entryObservedAt} precedes decisionAt ${contract.decisionAt} — violates post-decision ordering`,
      ENTRY_REJECTION_REASON.entryBeforeDecision,
    );
  }
  // (c) the observation cannot exist before the contract that records it.
  if (observedMs < issuedMs) {
    throw new ContractError(
      `entry print ${obs.entryObservedAt} precedes contract issuance ${contract.issuedAt}`,
      ENTRY_REJECTION_REASON.observationBeforeIssuance,
    );
  }
  if (observedMs < opensMs || observedMs > expiresMs) {
    throw new ContractError(
      `entry print ${obs.entryObservedAt} outside entry window [${contract.entryWindowOpensAt}, ${contract.entryWindowExpiresAt}] — use voidContract(void_expired)`,
      ENTRY_REJECTION_REASON.entryOutsideWindow,
    );
  }

  const drift = ((obs.entryPrice - contract.decisionPrice) / contract.decisionPrice) * 100;
  if (Math.abs(drift) > contract.driftCapPct) {
    throw new ContractError(
      `drift ${drift.toFixed(4)}% exceeds cap ${contract.driftCapPct}% — use voidContract(void_drift)`,
      ENTRY_REJECTION_REASON.driftExceeded,
    );
  }

  return deepFreeze({
    ...contract,
    entryPrice: obs.entryPrice,
    entryObservedAt: obs.entryObservedAt,
    entryReceivedAt: obs.entryReceivedAt,
    driftObservedPct: drift,
    entryState: "entered" as const,
    entryEvidence: obs.evidence,
    entryEvidenceReason: null,
  });
}

/**
 * Transition a pending contract to a void terminal state. Voided contracts
 * are logged non-entries: excluded from the accuracy cohort, never scored
 * as MISS. Terminal states are final — this throws on a non-pending contract.
 */
export function voidContract(
  contract: ActionableEntryContract,
  obs: VoidObservation,
): ActionableEntryContract {
  if (contract.entryState !== "pending") {
    throw new ContractError(`cannot void: contract is ${contract.entryState} (terminal)`);
  }
  if (!obs.voidReason || obs.voidReason.trim().length === 0) {
    throw new ContractError(`voidReason is required on any void_* transition`);
  }
  let driftObservedPct: number | null = null;
  if (obs.driftedPrice !== undefined) {
    assertPositive("driftedPrice", obs.driftedPrice);
    driftObservedPct =
      ((obs.driftedPrice - contract.decisionPrice) / contract.decisionPrice) * 100;
  }
  return deepFreeze({
    ...contract,
    entryState: obs.entryState,
    voidReason: obs.voidReason,
    driftObservedPct,
    // Evidence is unavailable on void: the setup was never entered.
    // NEVER fabricate a fill price here — entryPrice stays null.
    entryEvidence: "unavailable" as const,
    entryEvidenceReason: `voided (${obs.entryState}): ${obs.voidReason}`,
  });
}

/**
 * Mark unavailable fill evidence explicitly. Only valid on a pending
 * contract with no entry price; records evidence:"unavailable" + reason and
 * leaves the contract pending (the caller then voids via voidContract with a
 * named reason, e.g. void_no_quote). This is the ONLY sanctioned path when
 * no fill evidence exists — a price is never invented.
 */
export function markEvidenceUnavailable(
  contract: ActionableEntryContract,
  reason: string,
): ActionableEntryContract {
  if (contract.entryState !== "pending") {
    throw new ContractError(`cannot mark evidence: contract is ${contract.entryState}`);
  }
  if (contract.entryPrice !== null) {
    throw new ContractError(`evidence unavailable requires entryPrice === null`);
  }
  if (!reason || reason.trim().length === 0) {
    throw new ContractError(`a reason is required when marking evidence unavailable`);
  }
  return deepFreeze({
    ...contract,
    entryEvidence: "unavailable" as const,
    entryEvidenceReason: reason,
  });
}
