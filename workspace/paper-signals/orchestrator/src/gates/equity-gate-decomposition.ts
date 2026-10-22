/**
 * Equity gate DECOMPOSITION (sandbox-native, NOT vendored).
 *
 * Splits the vendored `signalIssuanceDecision` (equity/server/src/actions.ts:402-416,
 * kept verbatim above as the differential-test oracle) into two independently
 * callable pure functions, per source-resolution-2026-10-13.md §2c:
 *
 *   evaluateEquityBornDead     ≡ branches B1 (availability) + B2 (born-dead)
 *   evaluateEquityShortRegime  ≡ branch B3 (long short-circuit) + B4 (short-regime)
 *
 * The branches are independent early-returns with no shared mutable state, so
 * the decomposition is exact. A differential test (tests/gate-decomposition.test.ts)
 * proves `signalIssuanceDecision(d, inv, day, hist)` ≡
 * compose(evaluateEquityBornDead, evaluateEquityShortRegime) on all four outcomes.
 *
 * WHY: the integrated issuance handler retains the short-regime gate (a regime
 * filter with unchanged semantics) but must NOT route through the historical-
 * extreme (born-dead) branch — that check is replaced by the corrected
 * decision→entry veto (`runIssuanceChecks` in veto/src/veto.ts), which only
 * admits post-decision evidence. Keeping the vendored original verbatim preserves
 * the drift policing; the handler imports ONLY evaluateEquityShortRegime.
 *
 * This file lives OUTSIDE the drift-hashed range: the drift test re-hashes the
 * upstream source ranges, not this file, so additions here cannot trip it.
 */
import type { Point, SignalIssuanceDecision } from "./equity-gates.js";

export interface BornDeadVerdict {
  blocked: boolean;
  reason: string | null;
}

/**
 * Branches B1+B2 of signalIssuanceDecision: availability, then the
 * historical-extreme (born-dead) check on the signal-day candle.
 * Proven equivalent to the vendored original by the differential test.
 */
export function evaluateEquityBornDead(
  direction: "long" | "short",
  invalidation: number,
  signalDay: Point | null,
): BornDeadVerdict {
  // B1 — availability (verbatim logic of :403).
  if (!signalDay || signalDay.open == null || signalDay.low == null || signalDay.high == null) {
    return {
      blocked: true,
      reason: `issuance-check unavailable: exact completed signal-day OHLC was not available for ${signalDay?.date ?? "the requested date"}`,
    };
  }
  // B2 — born-dead (verbatim logic of :404-407, including 4-dp rounding).
  const round4 = (v: number): number => Math.round(v * 1e4) / 1e4;
  const breached = direction === "long" ? (signalDay.low as number) <= invalidation : (signalDay.high as number) >= invalidation;
  if (!breached) return { blocked: false, reason: null };
  const reason =
    direction === "long"
      ? `born-dead LONG: signal-day low ${round4(signalDay.low as number)} <= invalidation ${round4(invalidation)}`
      : `born-dead SHORT: signal-day high ${round4(signalDay.high as number)} >= invalidation ${round4(invalidation)}`;
  return { blocked: true, reason };
}

/**
 * Branches B3+B4 of signalIssuanceDecision: longs short-circuit allowed (B3);
 * shorts face the bearish-structure regime gate (B4). This is the RETAINED
 * gate on the integrated issuance path — a regime filter, not the
 * historical-extreme veto, with unchanged semantics.
 */
export function evaluateEquityShortRegime(
  direction: "long" | "short",
  signalDay: Point,
  history: Point[],
): SignalIssuanceDecision {
  // B3 — long short-circuit (verbatim logic of :408).
  if (direction === "long") {
    return { allowed: true, reason: null, belowSma50: null, lowerHighs: null, trend20Negative: null };
  }
  // B4 — short-regime (verbatim logic of :409-415). Uses the vendored
  // helpers via a local re-derivation to avoid touching the hashed block.
  const signalIndex = history.findIndex((row) => row.date === signalDay.date);
  const throughSignalDay = signalIndex >= 0 ? history.slice(0, signalIndex + 1) : history.filter((row) => row.date <= signalDay.date);
  const closes = throughSignalDay.slice(-50).map((row) => row.close);
  const mean50 = closes.length ? closes.reduce((a, b) => a + b, 0) / closes.length : null;
  const close20Ago = throughSignalDay.at(-21)?.close;
  const belowSma50 = mean50 == null ? null : signalDay.close < mean50;
  const lowerHighs = recentLowerHighsLocal(throughSignalDay);
  const trend20Negative = close20Ago == null ? null : signalDay.close < close20Ago;
  const bearishStructure = belowSma50 === true && (lowerHighs === true || trend20Negative === true);
  return bearishStructure
    ? { allowed: true, reason: null, belowSma50, lowerHighs, trend20Negative }
    : { allowed: false, reason: `short-regime: bearish daily structure gate not met on ${signalDay.date}`, belowSma50, lowerHighs, trend20Negative };
}

/**
 * Local copy of the vendored `recentLowerHighs` logic (actions.ts:388-401),
 * used only by evaluateEquityShortRegime so the drift-hashed block above is
 * never edited. Proven equivalent by the differential test.
 */
function recentLowerHighsLocal(points: Point[]): boolean | null {
  const recent = points.slice(-35);
  if (recent.length < 12) return null;
  const peaks: number[] = [];
  for (let index = 2; index < recent.length - 2; index++) {
    const row = recent[index];
    const currentHigh = row?.high;
    if (currentHigh == null) continue;
    const neighbors = [recent[index - 2]?.high, recent[index - 1]?.high, recent[index + 1]?.high, recent[index + 2]?.high];
    const measuredNeighbors = neighbors.filter((value): value is number => value != null);
    if (measuredNeighbors.length === neighbors.length && measuredNeighbors.every((value) => currentHigh >= value)) peaks.push(currentHigh);
  }
  if (peaks.length >= 2) return (peaks.at(-1) ?? Infinity) < (peaks.at(-2) ?? -Infinity);
  const recentHighs = recent.slice(-5).map((row) => row.high).filter((value): value is number => value != null);
  const priorHighs = recent.slice(-10, -5).map((row) => row.high).filter((value): value is number => value != null);
  return recentHighs.length === 5 && priorHighs.length === 5 ? Math.max(...recentHighs) < Math.max(...priorHighs) : null;
}

/**
 * Compose the two decomposed gates back into the original decision, for the
 * differential test: born-dead first (B1+B2), then the short-regime gate
 * (B3+B4) — the same order as the vendored early-returns.
 */
export function composeEquityDecision(
  direction: "long" | "short",
  invalidation: number,
  signalDay: Point | null,
  history: Point[],
): SignalIssuanceDecision {
  const bornDead = evaluateEquityBornDead(direction, invalidation, signalDay);
  if (bornDead.blocked) {
    return { allowed: false, reason: bornDead.reason, belowSma50: null, lowerHighs: null, trend20Negative: null };
  }
  // signalDay is non-null here: B1 passed.
  return evaluateEquityShortRegime(direction, signalDay as Point, history);
}
