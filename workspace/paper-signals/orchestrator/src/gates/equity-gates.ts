/**
 * VENDORED — faithful copies from the equity terminal source tree.
 *
 * Source root (read-only export):
 *   ~/workspace/goals/research-terminal/hidden_files/source-export-2026-10-13/
 * File: equity/server/src/actions.ts
 *
 * Units copied VERBATIM (logic untouched; only module-local types redeclared
 * and functions exported, since the originals are not exported and the host
 * module carries DB/network deps that prevent a clean import):
 *
 *   average                  line 103
 *   round                    line 109
 *   recentLowerHighs           lines 388-401
 *   signalIssuanceDecision     lines 402-416
 *
 * This is the exact issuance-validation function the equity discovery scan
 * calls at actions.ts:2155-2165 (born-dead veto, then the short-regime
 * bearish-structure gate for shorts; longs pass the gate once born-dead clears).
 *
 * Copied 2026-10-13. Drift is policed by tests/drift.js + tests/drift-hashes.json:
 * that test re-hashes these exact source ranges and FAILS if the source changes,
 * forcing a re-vendor + re-verification.
 */

// --- redeclared module-local types (equity/server/src/actions.ts:8 and :373) ---
export type Point = { date: string; close: number; open: number | null; high: number | null; low: number | null; volume: number | null };
export type SignalIssuanceDecision = { allowed: boolean; reason: string | null; belowSma50: boolean | null; lowerHighs: boolean | null; trend20Negative: boolean | null };

// --- vendored: equity/server/src/actions.ts:103 ---
function average(values: number[]): number | null { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null; }
// --- vendored: equity/server/src/actions.ts:109 ---
function round(value: number, places = 2) { const f = 10 ** places; return Math.round(value * f) / f; }
// --- vendored: equity/server/src/actions.ts:388-401 ---
function recentLowerHighs(points: Point[]): boolean | null {
  const recent = points.slice(-35); if (recent.length < 12) return null;
  const peaks: number[] = [];
  for (let index = 2; index < recent.length - 2; index++) {
    const row = recent[index]; const currentHigh = row?.high; if (currentHigh == null) continue;
    const neighbors = [recent[index - 2]?.high, recent[index - 1]?.high, recent[index + 1]?.high, recent[index + 2]?.high];
    const measuredNeighbors = neighbors.filter((value): value is number => value != null);
    if (measuredNeighbors.length === neighbors.length && measuredNeighbors.every((value) => currentHigh >= value)) peaks.push(currentHigh);
  }
  if (peaks.length >= 2) return (peaks.at(-1) ?? Infinity) < (peaks.at(-2) ?? -Infinity);
  const recentHighs = recent.slice(-5).map((row) => row.high).filter((value): value is number => value != null);
  const priorHighs = recent.slice(-10, -5).map((row) => row.high).filter((value): value is number => value != null);
  return recentHighs.length === 5 && priorHighs.length === 5 ? Math.max(...recentHighs) < Math.max(...priorHighs) : null;
}
// --- vendored: equity/server/src/actions.ts:402-416 ---
// NOTE: the sandbox-native decomposition (evaluateEquityBornDead /
// evaluateEquityShortRegime, per source-resolution §2c) lives in
// ./equity-gate-decomposition.ts — this file keeps the vendored block verbatim
// and drift-policed. Do not add code below the closing brace of
// signalIssuanceDecision in THIS file.
export function signalIssuanceDecision(direction: "long" | "short", invalidation: number, signalDay: Point | null, history: Point[]): SignalIssuanceDecision {
  if (!signalDay || signalDay.open == null || signalDay.low == null || signalDay.high == null) return { allowed: false, reason: `issuance-check unavailable: exact completed signal-day OHLC was not available for ${signalDay?.date ?? "the requested date"}`, belowSma50: null, lowerHighs: null, trend20Negative: null };
  const breached = direction === "long" ? signalDay.low <= invalidation : signalDay.high >= invalidation;
  if (breached) {
    const reason = direction === "long" ? `born-dead LONG: signal-day low ${round(signalDay.low, 4)} <= invalidation ${round(invalidation, 4)}` : `born-dead SHORT: signal-day high ${round(signalDay.high, 4)} >= invalidation ${round(invalidation, 4)}`;
    return { allowed: false, reason, belowSma50: null, lowerHighs: null, trend20Negative: null };
  }
  if (direction === "long") return { allowed: true, reason: null, belowSma50: null, lowerHighs: null, trend20Negative: null };
  const signalIndex = history.findIndex((row) => row.date === signalDay.date); const throughSignalDay = signalIndex >= 0 ? history.slice(0, signalIndex + 1) : history.filter((row) => row.date <= signalDay.date);
  const mean50 = average(throughSignalDay.slice(-50).map((row) => row.close)); const close20Ago = throughSignalDay.at(-21)?.close;
  const belowSma50 = mean50 == null ? null : signalDay.close < mean50;
  const lowerHighs = recentLowerHighs(throughSignalDay);
  const trend20Negative = close20Ago == null ? null : signalDay.close < close20Ago;
  const bearishStructure = belowSma50 === true && (lowerHighs === true || trend20Negative === true);
  return bearishStructure ? { allowed: true, reason: null, belowSma50, lowerHighs, trend20Negative } : { allowed: false, reason: `short-regime: bearish daily structure gate not met on ${signalDay.date}`, belowSma50, lowerHighs, trend20Negative };
}
