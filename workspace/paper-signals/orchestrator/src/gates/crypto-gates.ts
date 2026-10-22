/**
 * VENDORED — faithful copies from the crypto terminal source tree.
 *
 * Source root (read-only export):
 *   ~/workspace/goals/research-terminal/hidden_files/source-export-2026-10-13/
 * File: crypto/server/src/actions.ts
 *
 * Units copied VERBATIM (logic untouched; only module-local types redeclared
 * and functions exported, since the originals are not exported and the host
 * module carries DB/network deps that prevent a clean import):
 *
 *   mean                      line 706
 *   pct                       line 712
 *   smaAt                     line 720
 *   horizonReturn               lines 763-765
 *   BORN_DEAD_REASON_PREFIX   line 1194
 *   hasRecentLowerHighs         lines 1195-1205
 *   evaluateShortRegimeGate     lines 1206-1211
 *   evaluateBornDead            lines 1219-1224
 *
 * Copied 2026-10-13. Drift is policed by tests/drift.js + tests/drift-hashes.json:
 * that test re-hashes these exact source ranges and FAILS if the source changes,
 * forcing a re-vendor + re-verification.
 */

// --- redeclared module-local types (crypto/server/src/actions.ts local defs) ---
export type SignalDayCandle = { day: string; open: number | null; high: number | null; low: number | null; close: number; source: string };
export type ShortRegimeGate = { allowed: boolean; priceBelowSma50: boolean; lowerHighs: boolean; trend20Negative: boolean; sma50: number | null; trend20Pct: number | null; reason: string };

// --- vendored: crypto/server/src/actions.ts:706 ---
function mean(values: number[]): number | null { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null; }
// --- vendored: crypto/server/src/actions.ts:712 ---
function pct(a: number, b: number): number | null { return a ? ((b / a) - 1) * 100 : null; }
// --- vendored: crypto/server/src/actions.ts:720 ---
function smaAt(values: number[], period: number): number | null { return values.length >= period ? mean(values.slice(-period)) : null; }
// --- vendored: crypto/server/src/actions.ts:763-765 ---
function horizonReturn(prices: number[], days: number): number | null {
  if (prices.length <= days) return null; return pct(prices[prices.length - 1 - days] ?? 0, prices[prices.length - 1] ?? 0);
}
// --- vendored: crypto/server/src/actions.ts:1194 ---
const BORN_DEAD_REASON_PREFIX = "born-dead";
// --- vendored: crypto/server/src/actions.ts:1195-1205 ---
function hasRecentLowerHighs(values: number[]): boolean {
  const recent = values.slice(-40);
  if (recent.length < 12) return false;
  const swings = recent.flatMap((value, index) => {
    if (index < 2 || index > recent.length - 3) return [];
    const left1 = recent[index - 1]; const left2 = recent[index - 2]; const right1 = recent[index + 1]; const right2 = recent[index + 2];
    return left1 !== undefined && left2 !== undefined && right1 !== undefined && right2 !== undefined && value > left1 && value >= left2 && value > right1 && value >= right2 ? [value] : [];
  });
  const prior = swings.at(-2); const latest = swings.at(-1);
  return prior !== undefined && latest !== undefined && latest < prior;
}
// --- vendored: crypto/server/src/actions.ts:1206-1211 ---
export function evaluateShortRegimeGate(currentPrice: number | null, closes: number[], highs: number[] = []): ShortRegimeGate {
  const sma50 = smaAt(closes, 50); const trend20Pct = horizonReturn(closes, 20); const priceBelowSma50 = currentPrice !== null && sma50 !== null && currentPrice < sma50;
  const lowerHighs = hasRecentLowerHighs(highs.length >= 20 ? highs : closes); const trend20Negative = trend20Pct !== null && trend20Pct < 0; const allowed = priceBelowSma50 && (lowerHighs || trend20Negative);
  const reason = allowed ? `bearish daily structure confirmed: price below 50D MA and ${lowerHighs ? "recent swing highs are lower" : "20D trend is negative"}` : `short-regime: bearish daily structure absent (price ${priceBelowSma50 ? "below" : "not below"} 50D MA; lower highs ${lowerHighs ? "yes" : "no"}; 20D trend ${trend20Negative ? "negative" : "not negative"})`;
  return { allowed, priceBelowSma50, lowerHighs, trend20Negative, sma50, trend20Pct, reason };
}
// --- vendored: crypto/server/src/actions.ts:1219-1224 ---
export function evaluateBornDead(direction: "long" | "short", invalidation: number, candle: SignalDayCandle | null): { publish: boolean; reason: string | null } {
  if (!candle || candle.high === null || candle.low === null) return { publish: false, reason: "issuance-validation unavailable: completed signal-day OHLC missing" };
  if (direction === "long" && candle.low <= invalidation) return { publish: false, reason: `${BORN_DEAD_REASON_PREFIX} LONG: signal-day low ${candle.low} <= invalidation ${invalidation}` };
  if (direction === "short" && candle.high >= invalidation) return { publish: false, reason: `${BORN_DEAD_REASON_PREFIX} SHORT: signal-day high ${candle.high} >= invalidation ${invalidation}` };
  return { publish: true, reason: null };
}
