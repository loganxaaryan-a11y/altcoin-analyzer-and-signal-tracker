/**
 * Shared types for the paper-signal issuance orchestrator (sandbox only).
 *
 * Lifecycle per candidate:
 *   pending -> (reassess) -> issued | rejected | deferred -> (reassess when due) -> ...
 *   pending -> expired   (candidate TTL exceeded; persisted as rejected/expiry)
 *
 * Outcomes are persisted per candidate with the gate that decided them, so
 * every abstention is explainable: issued / rejected (which gate) / deferred
 * (why + next reassessment time).
 */

import type { EvidenceBar } from "../../veto/src/veto.js";

export type Terminal = "equity" | "crypto";
export type Direction = "long" | "short";
export type CandidateSource = "shortlist" | "watchlist" | "manual";
export type CandidateStatus =
  | "pending"
  | "deferred"
  | "rejected"
  | "expired"
  | "issued"
  | "awaiting-entry"   // integrated path: pending contract built, setup alert fired, entry not yet observed
  | "entry-expired"    // integrated path: entry window lapsed with no qualifying print (void_expired)
  | "invalidated";     // integrated path: setup invalidated (drift or post-entry invalidation)
export type OutcomeKind = "issued" | "rejected" | "deferred" | "invalidated" | "entry-expired" | "awaiting-entry";

/** Completed signal-day candle, in the shape crypto's evaluateBornDead expects. */
export interface SignalDayCandle {
  day: string; // YYYY-MM-DD
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  source: string;
}

/** One raw OHLC bar (equity reconstruction evidence). */
export interface RawBar {
  date: string; // YYYY-MM-DD
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume?: number | null;
  availableAt?: string | null; // ISO; required for the real equity reconstruction
}

/** Fresh inputs used to reassess a candidate. Refreshed cheaply, never by rescanning the universe. */
export interface FreshInputs {
  signalDay: SignalDayCandle | null;
  /** Oldest -> newest closes through the signal day. */
  historyCloses: number[];
  /** Oldest -> newest highs through the signal day. */
  historyHighs: number[];
  currentPrice: number | null;
  /** ISO timestamp when these inputs were captured (freshness gate). */
  asOf: string;
  /** Equity: full OHLC bars for the real reconstruction path. */
  rawBars?: RawBar[];
  /**
   * Integrated path: venue-timestamped decision→entry evidence bars for the
   * corrected issuance veto (post-decision intraday bars, forming candles,
   * signal-day bars as pre-decision features). Supplied by the quote
   * provider's refresh or the demo/test fixture; absent => the veto sees no
   * post-decision evidence and fails closed (honest, never silent).
   */
  vetoBars?: EvidenceBar[];
}

export interface PaperCandidateInput {
  terminal: Terminal;
  symbol: string;
  coinId?: string; // crypto only
  name: string;
  direction: Direction;
  score: number;
  entryPrice: number;
  invalidation: number;
  target1: number | null;
  target2: number | null;
  signalDate: string; // YYYY-MM-DD
  /** ISO detection timestamp: when the shortlist/watchlist first surfaced this candidate. */
  detectedAt: string;
  source: CandidateSource;
  inputs: FreshInputs;
}

export interface OutcomeRecord {
  kind: OutcomeKind;
  /** Which gate decided: born-dead | short-regime | expiry | duplicate | min-score | stale-inputs | issuer-suppression | evidence-insufficient | issuance-veto | entry-expired | entry-drift | post-entry-invalidation */
  gate: string | null;
  reason: string;
  via?: "manual" | "automatic";
  detail?: Record<string, unknown>;
}

export interface DelayRecord {
  detectionToQualificationMs: number | null;
  qualificationToIssuanceMs: number | null;
  issuanceToAlertMs: number | null;
  detectionToAlertMs: number | null;
}

export interface CandidateRecord extends PaperCandidateInput {
  /** Deterministic content-hash identity: same candidate reassessed twice issues at most once. */
  candidateId: string;
  firstSeenAt: string;
  lastReassessedAt: string | null;
  qualifiedAt: string | null;
  issuedAt: string | null;
  alertedAt: string | null;
  status: CandidateStatus;
  outcome: OutcomeRecord | null;
  nextReassessmentAt: string | null;
  issuedSignalId: string | null;
  delays: DelayRecord | null;
  /** Integrated path: pending entry contract id (null until the veto passes and the contract is built). */
  contractId: string | null;
  /** Integrated path: ISO instant the setup alert fired (contract build / qualification). */
  setupAlertAt: string | null;
  /** Integrated path: venue timestamp of the observed paper entry (null unless entered). */
  entryObservedAt: string | null;
}

export interface IssuedSignal {
  signalId: string;
  candidateId: string;
  identityHash: string;
  /** Integrated path: the entry contract id persisted alongside the signal row (null on the legacy path). */
  contractId: string | null;
  terminal: Terminal;
  symbol: string;
  coinId: string | null;
  name: string;
  direction: Direction;
  score: number;
  entryPrice: number;
  invalidation: number;
  target1: number | null;
  target2: number | null;
  signalDate: string;
  issuedAt: string;
  alertedAt: string | null;
  delays: DelayRecord | null;
  gateSummary: string;
  origin: "orchestrator";
}

export interface SuppressionRow {
  id: string;
  candidateId: string;
  terminal: Terminal;
  symbol: string;
  direction: Direction;
  signalDate: string;
  gate: string;
  reason: string;
  origin: "orchestrator" | "manual" | "issuer";
  at: string;
}

export interface AlertRow {
  id: string;
  /** "setup" = decision-time alert (setup qualified, entry pending); "entry" = entered-signal alert. */
  kind: "setup" | "entry";
  signalId: string;
  candidateId: string;
  symbol: string;
  direction: Direction;
  alertedAt: string;
  channel: "sandbox-feed";
  /**
   * Enqueue vs delivery (paper-signals repair 2026-10-13): appendAlert =
   * enqueue. enqueuedAt is the instant the alert row was written;
   * deliveredAt is set separately by markAlertDelivered when the delivery
   * hook runs. The two are distinct timestamps by construction.
   */
  enqueuedAt: string;
  /** Null until markAlertDelivered runs. */
  deliveredAt: string | null;
  /**
   * Recoverable delivery (workstream B, 2026-10-13): "enqueued" = waiting for
   * first delivery; "sending" = claimed by a sender (crash between claim and
   * acknowledgement leaves this state — recovery reclaims it); "delivered" =
   * transport acknowledged; "failed" = transport failure, awaiting recovery.
   */
  deliveryStatus: "enqueued" | "sending" | "delivered" | "failed";
  /**
   * How the acknowledgement was obtained. Null until delivered.
   * "simulated" = sandbox/test acknowledgement (the deliverAlert hook's clean
   * return with no transport ack); "live" = a real transport ack. Sandbox
   * acknowledgements are ALWAYS labeled simulated — never live.
   */
  deliveryMode: "simulated" | "live" | null;
  /**
   * Transport-provided acknowledgement id. The dedup key: if a redelivery
   * produces the same ack id for an already-delivered alert, the duplicate
   * acknowledgement is a no-op (markAlertDelivered is idempotent).
   */
  ackId: string | null;
  /**
   * Number of delivery attempts (incremented by claimAlertForDelivery on
   * every claim, including recovery claims). 0 = never attempted.
   */
  deliveryAttempts: number;
}

export interface OrchestratorConfig {
  /** Candidate TTL: older than this from detection -> expired. Default 48h. */
  candidateTtlMs: number;
  /** Inputs older than this are refreshed cheaply before reassessment. Default 30m. */
  freshnessMs: number;
  /** Same instrument+direction issued within this window -> duplicate suppression. Default 24h. */
  duplicateWindowMs: number;
  /** Score floor (0 = disabled). */
  minScore: number;
  /** How long to wait before retrying a deferred candidate. Default 15m. */
  retryBackoffMs: number;
}

export const DEFAULT_CONFIG: OrchestratorConfig = {
  candidateTtlMs: 48 * 3_600_000,
  freshnessMs: 30 * 60_000,
  duplicateWindowMs: 24 * 3_600_000,
  minScore: 0,
  retryBackoffMs: 15 * 60_000,
};

/**
 * Sandbox identity constants. DELIBERATELY different from every production
 * strategy id / venue string so a sandbox row can never collide with, or be
 * mistaken for, a production issuance row.
 */
export const SANDBOX = {
  equityStrategyId: "paper-equity-factor-agreement",
  equityStrategyVersion: "0.1.0-sandbox",
  cryptoStrategyId: "paper-crypto-dossier",
  cryptoStrategyVersion: "0.1.0-sandbox",
  parameterHash: "sandbox-paper-v1",
  venue: "SANDBOX (paper)",
} as const;
