/**
 * RadarCandidate -> PaperCandidateInput mapping (sandbox).
 *
 * STRICT: every field the repaired path needs must be present in the
 * discovery output. Missing fields are NEVER fabricated — the candidate is
 * returned as a mapping failure with an exact reason code, and the handoff
 * records it as `failed`.
 */
import type { RadarCandidate } from "./discovery-types.js";

export interface MappedCandidate {
  ok: true;
  input: {
    terminal: "crypto";
    symbol: string;
    coinId?: string;
    name: string;
    direction: "long" | "short";
    score: number;
    entryPrice: number;
    invalidation: number;
    target1: number | null;
    target2: number | null;
    signalDate: string;
    detectedAt: string;
    source: "shortlist";
    inputs: {
      signalDay: {
        day: string;
        open: number | null;
        high: number | null;
        low: number | null;
        close: number;
        source: string;
      };
      historyCloses: number[];
      historyHighs: number[];
      currentPrice: number | null;
      asOf: string;
      vetoBars: Array<{
        startAt: number; endAt: number;
        open: number; high: number; low: number; close: number;
        isClosed: boolean; granularity: "intraday"; source: string; label?: string;
      }>;
    };
  };
}

export interface MappingFailure {
  ok: false;
  reasonCode: string;
  reason: string;
}

const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export function mapRadarCandidate(c: RadarCandidate): MappedCandidate | MappingFailure {
  const fail = (reasonCode: string, reason: string): MappingFailure => ({ ok: false, reasonCode, reason });

  if (c.direction !== "long" && c.direction !== "short") {
    return fail("invalid-direction", `direction ${JSON.stringify(c.direction)} is not long|short`);
  }
  if (!num(c.score)) return fail("missing-score", "discovery score missing or non-finite");
  // The actionable-entry-v1 contract needs real levels. Absent => failed, never invented.
  if (!num(c.entryPrice) || c.entryPrice <= 0) {
    return fail("missing-entry-levels", "entryPrice missing or non-positive: the entry-v1 contract cannot be built");
  }
  if (!num(c.invalidation) || c.invalidation <= 0) {
    return fail("missing-entry-levels", "invalidation missing or non-positive: the entry-v1 contract cannot be built");
  }
  if (c.direction === "long" && c.invalidation >= c.entryPrice) {
    return fail("incoherent-levels", `long with invalidation ${c.invalidation} >= entry ${c.entryPrice}`);
  }
  if (c.direction === "short" && c.invalidation <= c.entryPrice) {
    return fail("incoherent-levels", `short with invalidation ${c.invalidation} <= entry ${c.entryPrice}`);
  }
  const ev = c.decisionEvidence;
  if (!ev) return fail("missing-decision-evidence", "decision-time evidence absent");
  if (!ev.signalDay || !num(ev.signalDay.open) || !num(ev.signalDay.high) || !num(ev.signalDay.low) || !num(ev.signalDay.close)) {
    return fail("missing-signal-day", "signal-day candle incomplete: pre-decision feature required");
  }
  if (!Array.isArray(ev.historyCloses) || ev.historyCloses.length === 0 || !ev.historyCloses.every(num)) {
    return fail("missing-history", "historyCloses empty or non-numeric");
  }
  if (!Array.isArray(ev.historyHighs) || ev.historyHighs.length === 0 || !ev.historyHighs.every(num)) {
    return fail("missing-history", "historyHighs empty or non-numeric");
  }
  if (!ev.asOf || !Number.isFinite(Date.parse(ev.asOf))) {
    return fail("missing-decision-evidence", "evidence asOf timestamp missing or unparseable");
  }

  return {
    ok: true,
    input: {
      terminal: "crypto",
      symbol: c.symbol,
      coinId: c.coinId,
      name: c.name,
      direction: c.direction,
      score: c.score,
      entryPrice: c.entryPrice,
      invalidation: c.invalidation,
      target1: num(c.target1) ? c.target1 : null,
      target2: num(c.target2) ? c.target2 : null,
      signalDate: c.signalDate,
      detectedAt: c.detectedAt,
      source: "shortlist",
      inputs: {
        signalDay: {
          day: ev.signalDay.day,
          open: ev.signalDay.open,
          high: ev.signalDay.high,
          low: ev.signalDay.low,
          close: ev.signalDay.close,
          source: ev.signalDay.source,
        },
        historyCloses: [...ev.historyCloses],
        historyHighs: [...ev.historyHighs],
        currentPrice: num(ev.currentPrice) ? ev.currentPrice : null,
        asOf: ev.asOf,
        vetoBars: (ev.vetoBars ?? []).map((b) => ({
          startAt: b.startAt, endAt: b.endAt,
          open: b.open, high: b.high, low: b.low, close: b.close,
          isClosed: b.isClosed, granularity: "intraday" as const,
          source: b.source, label: b.label,
        })),
      },
    },
  };
}
