/**
 * actionable-entry-v1 — qualification/entry separation (sandbox).
 *
 * Correction 2 (2026-10-13): the coherent issuance sequence is
 *
 *   qualify candidate
 *     -> buildPendingContract (entry fields explicitly empty, state "pending")
 *     -> setup alert
 *     -> observeEntry (separate step, separate validation — a distinct event)
 *     -> enter | expire | invalidate
 *
 * The old sequence — checking a proposed entry BEFORE a pending contract
 * with no entry existed — was incoherent and is removed. Entry validation
 * happens only inside `observeEntry`, and only against a pending contract
 * that satisfies the structural pending invariant (entryState "pending" +
 * entry fields explicitly empty). There is deliberately NO in-memory
 * registry: after a process restart the contract is parsed back from its
 * persisted DB row, and object identity with the pre-restart contract is
 * gone — the handler validates the persisted contract ROW (state "pending")
 * instead.
 *
 * Entry observation is a distinct persisted event (`EntryObservationEvent`)
 * with its own timestamp (`eventRecordedAt` — the instant the observation
 * was recorded), separate from the venue timestamp (`entryObservedAt`) and
 * the server receipt time (`entryReceivedAt`).
 *
 * Correction 3: `buildPendingContract` threads the actual decision instant
 * (the time the qualification/issuance logic ran) into the contract's
 * `decisionAt` — the contract input's decisionAt must equal the
 * qualification's decisionAt, never a backdated bar close.
 *
 * Sandbox only. No production changes, no live trading, holdouts locked.
 */

import {
  ActionableEntryContract,
  ContractError,
  ContractInput,
  EntryObservation,
  Terminal,
  assertIsoUtc,
  buildContract,
  enterContract,
  voidContract,
} from "./contract.js";

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** The qualified setup's identity (the candidate that was qualified). */
export interface CandidateIdentity {
  candidateId: string;
  terminal: Terminal;
  symbol: string;
}

/**
 * The outcome of the qualification step. `decisionAt` is the ACTUAL instant
 * the qualification/issuance logic ran (correction 3) — it becomes the
 * contract's `decisionAt`, verbatim. `contractInput` carries everything the
 * v1 builder needs; its `decisionAt` must equal this `decisionAt`.
 */
export interface PendingQualification {
  decisionAt: string;
  /** Why the setup qualified (audit note). Required. */
  qualificationReason: string;
  contractInput: ContractInput;
}

// ---------------------------------------------------------------------------
// Pending-contract durability note
// ---------------------------------------------------------------------------
// buildPendingContract returns a contract with entryState "pending" and
// entry fields explicitly empty. There is NO in-memory registry: durability
// across process restarts requires that a contract parsed back from its
// persisted DB row remains observable, so observeEntry validates
// structurally (entryState === "pending" + entry fields empty) instead of
// by object identity.

/**
 * Qualify → build PENDING contract. Entry fields are explicitly empty:
 * entryPrice/entryObservedAt/entryReceivedAt/driftObservedPct are null,
 * entryEvidence is "unavailable", entryState is "pending". A pending
 * contract never carries a fill.
 *
 * Throws unless qualification.decisionAt === contractInput.decisionAt
 * (correction 3: the actual decision instant is threaded through, never
 * backdated to a bar close).
 */
export function buildPendingContract(
  candidate: CandidateIdentity,
  qualification: PendingQualification,
): ActionableEntryContract {
  assertIsoUtc("qualification.decisionAt", qualification.decisionAt);
  if (!qualification.qualificationReason || qualification.qualificationReason.trim().length === 0) {
    throw new ContractError(
      `qualificationReason is required to build a pending contract`,
      "qualification-reason-required",
    );
  }
  if (candidate.terminal !== qualification.contractInput.terminal) {
    throw new ContractError(
      `candidate terminal ${candidate.terminal} != contract terminal ${qualification.contractInput.terminal}`,
      "candidate-terminal-mismatch",
    );
  }
  const decidedMs = Date.parse(qualification.decisionAt);
  const inputDecidedMs = Date.parse(qualification.contractInput.decisionAt);
  if (decidedMs !== inputDecidedMs) {
    throw new ContractError(
      `qualification decisionAt (${qualification.decisionAt}) must equal the contract input's decisionAt (${qualification.contractInput.decisionAt}) — the actual decision instant is never backdated to a bar close`,
      "decision-instant-mismatch",
    );
  }

  const contract = buildContract({
    ...qualification.contractInput,
    decisionAt: qualification.decisionAt, // threaded through, verbatim
  });

  // Pending invariant: no entry fields, ever.
  if (
    contract.entryState !== "pending" ||
    contract.entryPrice !== null ||
    contract.entryObservedAt !== null ||
    contract.entryReceivedAt !== null ||
    contract.driftObservedPct !== null ||
    contract.entryEvidence !== "unavailable"
  ) {
    throw new ContractError(
      `pending contract invariant violated: entry fields must be explicitly empty`,
      "pending-carries-fill",
    );
  }

  // No in-memory registry: the pending invariant above is the whole gate.
  // A contract parsed back from its persisted row after a restart satisfies
  // the same structural checks in observeEntry.
  return contract;
}

// ---------------------------------------------------------------------------
// Entry observation (separate step, separate validation, distinct event)
// ---------------------------------------------------------------------------

export type EntryOutcome = "entered" | "expired" | "invalidated";

/**
 * The persisted record of one entry-observation attempt. `eventRecordedAt`
 * is the observation event's OWN timestamp (the instant it was recorded);
 * `entryObservedAt`/`entryReceivedAt` are the venue/server times of the print.
 */
export interface EntryObservationEvent {
  eventId: string;
  terminal: Terminal;
  signalId: string | number;
  /** Distinct timestamp of this observation event (the recording instant). */
  eventRecordedAt: string;
  entryObservedAt: string;
  entryReceivedAt: string;
  entryPrice: number;
  outcome: EntryOutcome;
  voidReason: string | null;
  resultingContract: ActionableEntryContract;
}

export type ObservationClock = () => string;

/**
 * Observe and validate an entry against a pending contract — the separate
 * entry step. Returns the observation event; the resulting contract is
 * terminal (entered | void_expired | void_drift).
 *
 * DURABILITY (2026-10-13): the old in-memory pending-registry gate
 * (WeakSet) is gone. A process restart drops all in-memory state, so a
 * contract parsed back from its persisted DB row must remain observable.
 * Validation is STRUCTURAL instead: entryState === "pending" plus the
 * pending invariant (entry fields explicitly empty). The handler additionally
 * validates the contract ROW from the DB (state === "pending") before
 * resuming observation.
 *
 * Outcomes:
 *   entered     — print inside window and drift cap (contract "entered").
 *   expired     — print outside the entry window (void_expired).
 *   invalidated — print outside the drift cap (void_drift).
 *
 * Integrity violations (anti-fabrication, causality, entry-before-decision,
 * observation-before-issuance, non-pending contract, pending contract
 * carrying entry fields) THROW ContractError — they are never recorded as
 * business outcomes.
 */
export function observeEntry(
  pendingContract: ActionableEntryContract,
  observation: EntryObservation,
  clock: ObservationClock = () => new Date().toISOString(),
): EntryObservationEvent {
  if (pendingContract.entryState !== "pending") {
    throw new ContractError(
      `entry observation rejected: contract is ${pendingContract.entryState} (terminal)`,
      "contract-not-pending",
    );
  }
  // Structural pending invariant: a pending contract never carries a fill.
  // (A contract parsed from a persisted row after a restart must satisfy
  // the same invariant as one fresh from buildPendingContract.)
  if (
    pendingContract.entryPrice !== null ||
    pendingContract.entryObservedAt !== null ||
    pendingContract.entryReceivedAt !== null ||
    pendingContract.driftObservedPct !== null ||
    pendingContract.entryEvidence !== "unavailable"
  ) {
    throw new ContractError(
      `entry observation rejected: contract claims entryState "pending" but carries entry fields`,
      "pending-carries-fill",
    );
  }
  const eventRecordedAt = clock();
  assertIsoUtc("eventRecordedAt", eventRecordedAt);

  const base = {
    eventId: `${pendingContract.terminal}:${String(pendingContract.signalId)}:${observation.entryObservedAt}`,
    terminal: pendingContract.terminal,
    signalId: pendingContract.signalId,
    eventRecordedAt,
    entryObservedAt: observation.entryObservedAt,
    entryReceivedAt: observation.entryReceivedAt,
    entryPrice: observation.entryPrice,
  };

  try {
    const resultingContract = enterContract(pendingContract, observation);
    return { ...base, outcome: "entered" as const, voidReason: null, resultingContract };
  } catch (e) {
    if (e instanceof ContractError) {
      // Business outcomes become terminal void transitions; integrity
      // violations rethrow below.
      if (e.reasonCode === "entry-outside-window") {
        const resultingContract = voidContract(pendingContract, {
          entryState: "void_expired",
          voidReason: `entry observation outside entry window: ${e.message}`,
        });
        return {
          ...base,
          outcome: "expired" as const,
          voidReason: resultingContract.voidReason,
          resultingContract,
        };
      }
      if (e.reasonCode === "drift-exceeded") {
        const resultingContract = voidContract(pendingContract, {
          entryState: "void_drift",
          voidReason: `entry observation outside drift cap: ${e.message}`,
          driftedPrice: observation.entryPrice,
        });
        return {
          ...base,
          outcome: "invalidated" as const,
          voidReason: resultingContract.voidReason,
          resultingContract,
        };
      }
    }
    throw e;
  }
}
