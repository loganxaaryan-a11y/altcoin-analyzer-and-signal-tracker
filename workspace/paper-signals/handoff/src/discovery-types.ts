/**
 * Discovery-run input shapes for the paper handoff (sandbox).
 *
 * A discovery run emits radar candidates. The handoff consumes them VERBATIM:
 * it never recomputes scores, never invents missing fields. A candidate that
 * arrives without a complete factor ledger or without actionable entry
 * levels cannot qualify — recorded as failed, never fabricated.
 */

/** One scored factor row, exactly as the dossier/discovery emits it. */
export interface FactorRow {
  label: string;
  score: number;
  weight: number;
  /** score * weight, carried from discovery (recomputed at persist time and compared). */
  contribution: number;
}

/** Decision-time evidence captured by discovery at the decision instant. */
export interface DecisionEvidence {
  /** Signal-day candle (pre-decision feature). */
  signalDay: {
    day: string; // YYYY-MM-DD
    open: number | null;
    high: number | null;
    low: number | null;
    close: number;
    source: string;
  } | null;
  /** Oldest -> newest closes through the signal day. */
  historyCloses: number[];
  /** Oldest -> newest highs through the signal day. */
  historyHighs: number[];
  /** Live quote at decision time. */
  currentPrice: number | null;
  /** ISO instant the evidence was captured. */
  asOf: string;
  /** Post-decision intraday evidence bars for the issuance veto (may be empty). */
  vetoBars: Array<{
    startAt: number; endAt: number;
    open: number; high: number; low: number; close: number;
    isClosed: boolean; granularity: string; source: string; label?: string;
  }>;
}

/** One radar candidate from a discovery run. */
export interface RadarCandidate {
  symbol: string;
  coinId?: string;
  name: string;
  direction: "long" | "short";
  /** Discovery/dossier score (0-100 agreement-style, as emitted). */
  score: number;
  /** Actionable entry levels — REQUIRED for the entry-v1 contract. */
  entryPrice: number | null;
  invalidation: number | null;
  target1: number | null;
  target2: number | null;
  signalDate: string; // YYYY-MM-DD
  /** ISO instant discovery first surfaced this candidate. */
  detectedAt: string;
  /** COMPLETE factor ledger as emitted by discovery/dossier. Absent => cannot qualify. */
  factorLedger: FactorRow[] | null;
  /** Sum of weights, as asserted by discovery (checked against the frozen total). */
  totalWeight: number | null;
  decisionEvidence: DecisionEvidence | null;
  /**
   * DEMO ONLY: scripted venue prints for entry observation.
   * Real runs MUST use the binance feed (feed=binance). Presence of this
   * field outside a labeled demo is rejected by the handoff.
   */
  demoScript?: {
    label: "DEMO-SCRIPTED-FEED";
    prints: Array<{ offsetMs: number; price: number; venue: string }>;
    waitingBars?: Array<{ offsetMs: number; price: number; label: string }>;
  } | null;
}

/** One completed discovery run, as written to the handoff inbox. */
export interface DiscoveryRun {
  runId: string;
  /** Which discovery produced this (e.g. "crypto-market-discovery"). */
  source: string;
  /** ISO instant the discovery run completed. */
  completedAt: string;
  /** Active comparison freeze the run was produced under. */
  freezeVersion: string;
  /** True only for labeled sandbox demonstrations. */
  demo?: boolean;
  candidates: RadarCandidate[];
}
