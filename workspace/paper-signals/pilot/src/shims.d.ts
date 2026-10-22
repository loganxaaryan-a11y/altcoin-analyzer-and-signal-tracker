/**
 * Type shims for the compiled paper-signals sandbox modules this pilot drives.
 * The pilot imports the built JS under
 * ../orchestrator/dist/paper-signals/orchestrator/src/... (no .d.ts emitted).
 * These declarations mirror the source signatures; the pilot never redefines
 * handler/store behavior — it only wires deps (feed, transport, evidence).
 */

// ---- types mirrored from orchestrator/src/types.ts ----
export interface SignalDayCandle { day: string; open: number | null; high: number | null; low: number | null; close: number; source: string; }
export interface EvidenceBar { startAt: number; endAt: number; open: number | null; high: number | null; low: number | null; close: number | null; isClosed: boolean; granularity: string; source: string; label?: string; provisional?: boolean; }
export interface FreshInputs { signalDay: SignalDayCandle | null; historyCloses: number[]; historyHighs: number[]; currentPrice: number | null; asOf: string; vetoBars?: EvidenceBar[]; }
export interface PaperCandidateInput { terminal: "equity" | "crypto"; symbol: string; coinId?: string; name: string; direction: "long" | "short"; score: number; entryPrice: number; invalidation: number; target1: number | null; target2: number | null; signalDate: string; detectedAt: string; source: "shortlist" | "watchlist" | "manual"; inputs: FreshInputs; }
export interface OutcomeRecord { kind: string; gate: string | null; reason: string; via?: string; detail?: Record<string, unknown>; }
export interface DelayRecord { detectionToQualificationMs: number | null; qualificationToIssuanceMs: number | null; issuanceToAlertMs: number | null; detectionToAlertMs: number | null; }
export interface CandidateRecord extends PaperCandidateInput { candidateId: string; firstSeenAt: string; lastReassessedAt: string | null; qualifiedAt: string | null; issuedAt: string | null; alertedAt: string | null; status: string; outcome: OutcomeRecord | null; nextReassessmentAt: string | null; issuedSignalId: string | null; delays: DelayRecord | null; contractId: string | null; setupAlertAt: string | null; entryObservedAt: string | null; }
export interface AlertRow { id: string; kind: "setup" | "entry"; signalId: string; candidateId: string; symbol: string; direction: "long" | "short"; alertedAt: string; channel: "sandbox-feed"; enqueuedAt: string; deliveredAt: string | null; deliveryStatus: "enqueued" | "delivered" | "failed"; }
export interface IssuedSignal { signalId: string; candidateId: string; identityHash: string; contractId: string | null; terminal: string; symbol: string; direction: string; issuedAt: string; alertedAt: string | null; gateSummary: string; }

// ---- feed/clock (mirrored from entry-v1/src/feed.ts) ----
// v2.1.9: TradePrint carries the VENUE-ASSIGNED trade id (venueTradeId,
// verbatim — for Binance aggTrades the aggregate trade id `a` stringified)
// and the venue's own monotonic ordering field (venueSeq — aggTrades `a`).
// Same-timestamp ordering resolves by venueSeq, never by price or arrival
// order. Both fields are required: a print without a venue-assigned id
// cannot establish first-print identity and fails closed downstream.
export interface TradePrint { ts: number; price: number; venue: string; venueTradeId: string; venueSeq: number; }
export interface HistoryCoverage {
  historyStartMs: number;
  /**
   * Six-field evidence binding (mirrored from entry-v1/src/feed.ts): venue,
   * symbol, requested range, receipt timestamp, raw-response hash, and
   * pagination/completeness limits — adapter-established coverage under
   * documented endpoint assumptions, NOT "venue-attested proof".
   */
  venue?: string;
  symbol?: string;
  requestedRange?: { sinceTs: number; toTs: number };
  receiptMs?: number;
  rawResponseHash?: string;
  pagination?: { maxResultsPerRequest: number; paginationExhausted: boolean };
}
export interface VenueFeed {
  latestPrints(sinceTs: number): TradePrint[] | Promise<TradePrint[]>;
  historyCoverage?(sinceTs: number): HistoryCoverage | Promise<HistoryCoverage>;
}
export interface WatchClock { nowMs(): number; }
export interface EntryObservationFeed { feed: VenueFeed; clock: WatchClock; pollIntervalMs: number; maxPolls: number; advance: (ms: number) => void | Promise<void>; }

// ---- handler deps (mirrored from orchestrator/src/issuance/handler.ts) ----
export interface Clock { now(): number; }
export interface IntegratedQuoteProvider { refresh(candidate: CandidateRecord, nowMs: number): Promise<FreshInputs | null>; }
export interface PostEntryEvidence { bars: EvidenceBar[]; nowAt: number; }
export interface IntegratedDeps {
  store: unknown;
  clock: Clock;
  config?: Record<string, unknown>;
  /** Labeled sandbox/test delivery mode for the vendored hook's fallback. Never "live". */
  deliveryMode?: string;
  quoteProvider?: IntegratedQuoteProvider;
  entryFeedFor?: (contract: unknown, candidate: CandidateRecord) => EntryObservationFeed | null;
  waitingIntervalEvidenceFor?: (contract: unknown) => EvidenceBar[] | null;
  postEntryEvidenceFor?: (contract: unknown) => PostEntryEvidence | null;
  deliverAlert?: (alert: AlertRow) => void | Promise<void | AlertAck>;
}
/** What a deliverAlert hook may return. The vendored handler reads
 * `raw.acknowledged !== false`; a void return counts as acknowledged. */
export interface AlertAck {
  acknowledged: boolean;
  mode?: string;
  ackId?: string | null;
}
export interface TickReport { at: string; processed: string[]; issued: string[]; rejected: string[]; deferred: string[]; expired: string[]; awaiting: string[]; }
export interface DbStoreIface {
  close(): void;
  getCandidate(candidateId: string): CandidateRecord | null;
  listCandidates(): CandidateRecord[];
  listSignals(): IssuedSignal[];
  listAlerts(): AlertRow[];
  getContract(contractId: string): { contractId: string; candidateId: string; state: string; contractJson: string; updatedAt: string } | null;
  appendAlert(row: AlertRow): void;
  markAlertDelivered(alertId: string, at: string): void;
}
