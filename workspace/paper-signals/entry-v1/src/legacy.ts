/**
 * actionable-entry-v1 — legacy preservation guarantees (sandbox).
 *
 * Hard rules (ENTRY-SEMANTICS.md §5):
 *   1. No rewrite: existing research rows keep schema, labels, evaluator treatment.
 *   2. No backfill: actionable contracts are written at live issuance only.
 *   3. Additive issuance: legacy record + new contract reference it via signalId.
 *   4. Cohort separation: legacy / v1-entered / v1-voided graded separately.
 *
 * This module contains ONLY read-only guards and reference shapes. There is
 * deliberately NO function that converts, rewrites, or backfills a legacy
 * record into an actionable contract. Attempting one throws.
 */

import { CONTRACT_VERSION, ContractError, deepFreeze } from "./contract.js";

/** Read-only reference shapes for the legacy contracts (not mutated, ever). */
export interface LegacyEquitySignal {
  readonly id: string | number;
  readonly entryRule: string; // matches /research reference|not claimed/i
  readonly entry: number; // prior completed adjusted close
}

export interface LegacyCryptoSignal {
  readonly id: string | number;
  readonly entryConvention: "first-post-decision-provider-quote";
  readonly entryAt: string; // = quoteReceivedAt (receipt time, no provider stamp)
}

/** Markers that identify a legacy research record (used by guards only). */
export const LEGACY_EQUITY_ENTRY_RULE_RE = /research reference|not claimed/i;
export const LEGACY_CRYPTO_ENTRY_CONVENTION = "first-post-decision-provider-quote" as const;

export function isLegacyEquityEntryRule(entryRule: string): boolean {
  return LEGACY_EQUITY_ENTRY_RULE_RE.test(entryRule);
}

/**
 * Backfill is forbidden. This function exists so that any caller attempting
 * "reconstruct what the entry would have been" for an old signal gets a loud
 * refusal instead of a silently fabricated contract. The standing doctrine
 * (never re-score history as logged live) is enforced in code.
 */
export function refuseBackfill(legacySignalId: string | number): never {
  throw new ContractError(
    `refusing backfill for legacy signal ${JSON.stringify(legacySignalId)}: ` +
      `actionable contracts are written at live issuance only; ` +
      `${CONTRACT_VERSION} is never reconstructed for historical signals`,
  );
}

/**
 * Assert a legacy record was not mutated by an operation: deep-compare a
 * snapshot taken before against the record after. Used in tests and can wrap
 * any issuance path.
 */
export function assertLegacyUntouched<T>(before: T, after: T, label: string): void {
  const a = JSON.stringify(before);
  const b = JSON.stringify(after);
  if (a !== b) {
    throw new ContractError(`legacy record mutated (${label}):\nbefore=${a}\nafter=${b}`);
  }
}

/**
 * Freeze a legacy record for the duration of a sandbox run so accidental
 * mutation throws immediately instead of corrupting the research record.
 */
export function freezeLegacy<T>(record: T): T {
  return deepFreeze(record);
}
