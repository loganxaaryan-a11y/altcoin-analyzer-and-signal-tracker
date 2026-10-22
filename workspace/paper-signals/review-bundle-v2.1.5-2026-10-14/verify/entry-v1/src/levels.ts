/**
 * actionable-entry-v1 — setup levels vs entry validation (sandbox).
 *
 * The rule: the thesis invalidation published at decision time is IMMUTABLE.
 * A refreshed quote never silently moves it.
 *
 * Crypto's documented bug (VETO-AUDIT.md): the issuance veto tested a draft
 * stop built from the decision-time price, but the ledger published a
 * DIFFERENT stop rebuilt by buildAtrLevels around the post-decision quote.
 * This module implements:
 *   1. the explicit rebuild policy ("freeze-at-decision" is the v1 rule;
 *      "rebuild-around-entry" is the explicit alternative),
 *   2. a validator that checks final published levels against the rule and
 *      FAILS LOUDLY on mismatch,
 *   3. a veto-alignment audit: the stop the veto tested must be the stop
 *      the ledger publishes.
 */

import { ContractError, deepFreeze } from "./contract.js";

export type Direction = "long" | "short";

/** Decision-time thesis levels. Published once; never mutated after. */
export interface DecisionLevels {
  direction: Direction;
  /** The price the levels were computed from (equity: adjusted close; crypto: draft.entry). */
  basisPrice: number;
  invalidationPrice: number;
  target1Price: number;
  target2Price: number;
  riskPerUnit: number;
  /** ATR-14 and multiplier the levels were derived from (for rebuild audit). */
  atr14: number;
  riskMultiplier: number;
}

/** Levels as published on the contract/ledger. */
export interface PublishedLevels {
  invalidationPrice: number;
  target1Price: number | null;
  target2Price: number | null;
  riskPerUnit: number;
  /** Which basis the published levels were computed from. */
  basisPrice: number;
  rebuildPolicy: RebuildPolicy;
}

/**
 * Explicit rebuild policy — the thing crypto's buildAtrLevels call did
 * silently. It is now a named, validated choice:
 * - "freeze-at-decision": published levels === decision-time levels. (v1 rule.)
 * - "rebuild-around-entry": levels mechanically rebuilt around the actual
 *   entry price with the SAME atr14 + riskMultiplier + direction. The rebuild
 *   inputs and outputs are both recorded and validated.
 */
export type RebuildPolicy = "freeze-at-decision" | "rebuild-around-entry";

/**
 * Mirror of the terminal's buildAtrLevels (crypto signal-methodology.ts:56-68):
 * riskPerUnit = atr14 * riskMultiplier; stop = entry ∓ risk; targets 1.5R/2.5R.
 * Kept here so the rebuild rule is exact and auditable in the sandbox.
 */
export function buildAtrLevels(
  direction: Direction,
  entry: number,
  atr14: number,
  riskMultiplier: number,
): { entry: number; stop: number; target: number; target2: number; riskPerUnit: number } {
  if (!(entry > 0) || !(atr14 > 0) || !(riskMultiplier > 0)) {
    throw new ContractError(`buildAtrLevels requires positive entry/atr14/riskMultiplier`);
  }
  const riskPerUnit = atr14 * riskMultiplier;
  return {
    entry,
    stop: direction === "long" ? entry - riskPerUnit : entry + riskPerUnit,
    target: direction === "long" ? entry + riskPerUnit * 1.5 : entry - riskPerUnit * 1.5,
    target2: direction === "long" ? entry + riskPerUnit * 2.5 : entry - riskPerUnit * 2.5,
    riskPerUnit,
  };
}

/** Publish decision-time levels. Returns a deep-frozen object. */
export function publishDecisionLevels(levels: DecisionLevels): DecisionLevels {
  if (!(levels.basisPrice > 0) || !(levels.riskPerUnit > 0)) {
    throw new ContractError(`decision levels require positive basisPrice and riskPerUnit`);
  }
  return deepFreeze({ ...levels });
}

/**
 * Quote refresh: returns a NEW package with the refreshed quote price, but
 * the decision-time levels object is carried over UNCHANGED (same frozen
 * reference). A refreshed quote can never move the published invalidation.
 */
export interface DecisionPackage {
  quotePrice: number;
  quoteObservedAt: string;
  levels: DecisionLevels; // frozen at decision
}

export function withRefreshedQuote(pkg: DecisionPackage, newQuotePrice: number, observedAt: string): DecisionPackage {
  if (!(newQuotePrice > 0)) throw new ContractError(`quote price must be > 0`);
  return deepFreeze({
    quotePrice: newQuotePrice,
    quoteObservedAt: observedAt,
    levels: pkg.levels, // same frozen reference — invalidation untouched
  });
}

/**
 * Derive the published levels under an explicit rebuild policy.
 * - freeze-at-decision: published = decision levels, basis unchanged.
 * - rebuild-around-entry: rebuild via buildAtrLevels(entryPrice, atr14,
 *   riskMultiplier, direction); the decision basis and rebuild inputs are
 *   recorded so the validator can replay them exactly.
 */
export function derivePublishedLevels(
  policy: RebuildPolicy,
  decision: DecisionLevels,
  entryPrice: number,
): PublishedLevels {
  if (policy === "freeze-at-decision") {
    return deepFreeze({
      invalidationPrice: decision.invalidationPrice,
      target1Price: decision.target1Price,
      target2Price: decision.target2Price,
      riskPerUnit: decision.riskPerUnit,
      basisPrice: decision.basisPrice,
      rebuildPolicy: policy,
    });
  }
  // rebuild-around-entry
  const rebuilt = buildAtrLevels(decision.direction, entryPrice, decision.atr14, decision.riskMultiplier);
  return deepFreeze({
    invalidationPrice: rebuilt.stop,
    target1Price: rebuilt.target,
    target2Price: rebuilt.target2,
    riskPerUnit: rebuilt.riskPerUnit,
    basisPrice: entryPrice,
    rebuildPolicy: policy,
  });
}

function near(a: number, b: number, tol = 1e-9): boolean {
  return Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
}

export class LevelMismatchError extends ContractError {
  constructor(message: string) {
    super(message);
    this.name = "LevelMismatchError";
  }
}

/**
 * Validator: checks the FINAL published levels against the declared rebuild
 * rule, replaying the rule from the recorded inputs. FAILS LOUDLY on any
 * mismatch — this is the check that would have caught the buildAtrLevels
 * silent-rebuild bug (tested stop ≠ published stop).
 */
export function validatePublishedLevels(
  policy: RebuildPolicy,
  decision: DecisionLevels,
  published: PublishedLevels,
  entryPrice: number,
): void {
  if (published.rebuildPolicy !== policy) {
    throw new LevelMismatchError(
      `declared rebuild policy ${policy} != published policy ${published.rebuildPolicy}`,
    );
  }
  const expected = derivePublishedLevels(policy, decision, entryPrice);
  const fields: Array<[string, number | null, number | null]> = [
    ["invalidationPrice", expected.invalidationPrice, published.invalidationPrice],
    ["target1Price", expected.target1Price, published.target1Price],
    ["target2Price", expected.target2Price, published.target2Price],
    ["riskPerUnit", expected.riskPerUnit, published.riskPerUnit],
    ["basisPrice", expected.basisPrice, published.basisPrice],
  ];
  for (const [name, exp, got] of fields) {
    const ok =
      exp === null ? got === null : got !== null && near(exp, got);
    if (!ok) {
      throw new LevelMismatchError(
        `published ${name} ${JSON.stringify(got)} != rule-derived ${JSON.stringify(exp)} ` +
          `(policy=${policy}, decision basis=${decision.basisPrice}, entry=${entryPrice})`,
      );
    }
  }
}

/**
 * Veto-alignment audit (the VETO-AUDIT.md finding, enforced): the stop the
 * issuance veto TESTED must equal the stop the ledger PUBLISHES. If the veto
 * ran against a draft stop and the published stop differs — e.g. silently
 * rebuilt around a later quote — this fails loudly instead of letting
 * measurement conflate a check on stop A with published stop B.
 */
export function auditVetoStopAlignment(testedStop: number, publishedInvalidation: number): void {
  if (!near(testedStop, publishedInvalidation)) {
    throw new LevelMismatchError(
      `veto tested stop ${testedStop} but ledger publishes invalidation ${publishedInvalidation} ` +
        `— the veto did not test the published stop (see VETO-AUDIT.md buildAtrLevels finding)`,
    );
  }
}
