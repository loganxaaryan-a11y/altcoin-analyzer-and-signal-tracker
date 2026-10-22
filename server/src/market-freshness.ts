export const MARKET_FRESHNESS_VERSION = "market-freshness-v2";
export const QUOTE_STALE_AFTER_MS = 5 * 60_000;
export const FORMING_CANDLE_STALE_AFTER_MS = 15 * 60_000;
export const COMPLETED_CANDLE_STALE_AFTER_MS = 26 * 60 * 60_000;
export const EXPENSIVE_FACTOR_STALE_AFTER_MS = 6 * 60 * 60_000;
export const MAX_CLOCK_SKEW_MS = 5 * 60_000;

export type CandleState = "forming" | "completed";
export type FreshnessState = "fresh" | "aging" | "stale" | "unavailable" | "future_invalid";

export type MarketObservation = {
  instrument: string;
  symbol: string;
  source: string;
  venue: string;
  pair: string;
  quoteCurrency: string;
  kind: "quote" | "candle" | "volume_24h";
  interval: "point" | "1d" | "24h";
  candleState: CandleState | "point";
  /** Provider observation time for points; interval end for candles. Never used blindly as a freshness clock. */
  eventAtMs: number;
  intervalStartAtMs: number | null;
  intervalEndAtMs: number | null;
  /** Actual provider update time when supplied. Null when the provider only supplies interval boundaries. */
  providerUpdatedAtMs: number | null;
  receivedAtMs: number;
  value: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
  rawTrace: Record<string, unknown>;
};

export type FrozenDecision = {
  signalId: string;
  direction: "long" | "short";
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  inputSnapshotId: number;
  decisionAtMs: number;
};

export type ObservedStatus = "target_observed" | "stop_observed" | "stale" | "current_mark";

export type StreamRow = {
  observationKey?: string;
  instrument: string;
  source: string;
  quoteCurrency: string;
  kind: string;
  interval: string;
  candleState: string;
  receivedAt: Date;
  providerVersion: number;
  id: number;
};

export type StreamHealthRow = {
  streamKey: string;
  lastObservationKey: string | null;
  lastAttemptAt: Date;
  lastSuccessAt: Date | null;
  consecutiveFailures: number;
  lastError: string | null;
};

export type ObservationFreshnessInput = {
  kind: "quote" | "candle" | "volume_24h";
  candleState: "point" | "forming" | "completed";
  eventAt: Date;
  providerUpdatedAt: Date | null;
  receivedAt: Date;
  lastSuccessfulRefreshAt: Date;
};

function numberOrNull(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function observationFingerprint(observation: MarketObservation): string {
  const numeric = [observation.value, observation.open, observation.high, observation.low, observation.close, observation.volume]
    .map((value) => value === null ? "null" : value.toPrecision(15)).join(":");
  return [MARKET_FRESHNESS_VERSION, observation.source, observation.instrument, observation.kind, observation.interval, observation.candleState, observation.eventAtMs, observation.intervalStartAtMs ?? "null", observation.intervalEndAtMs ?? "null", numeric].join("|");
}

export function streamIdentity(row: Pick<StreamRow, "instrument" | "source" | "quoteCurrency" | "kind" | "interval" | "candleState">): string {
  return [row.instrument, row.source, row.quoteCurrency, row.kind, row.interval, row.candleState].join("|");
}

/** Select one current revision per complete stream before any presentation limit. */
export function latestPerStream<T extends StreamRow>(rows: T[], limit = Number.POSITIVE_INFINITY): T[] {
  const latest = new Map<string, T>();
  for (const row of rows) {
    const key = streamIdentity(row);
    const prior = latest.get(key);
    if (!prior || row.receivedAt.getTime() > prior.receivedAt.getTime() || (row.receivedAt.getTime() === prior.receivedAt.getTime() && (row.providerVersion > prior.providerVersion || (row.providerVersion === prior.providerVersion && row.id > prior.id)))) latest.set(key, row);
  }
  return [...latest.values()].sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime() || b.providerVersion - a.providerVersion || b.id - a.id).slice(0, limit);
}

/** Resolve each stream through its authoritative health pointer. Historical recency is only a legacy fallback. */
export function currentObservationsFromPointers<T extends StreamRow & { observationKey: string }>(rows: T[], healthRows: StreamHealthRow[], limit = Number.POSITIVE_INFINITY): T[] {
  const byObservationKey = new Map(rows.map((row) => [row.observationKey, row]));
  const pointed = new Map<string, T>();
  for (const health of healthRows) {
    if (!health.lastObservationKey) continue;
    const observation = byObservationKey.get(health.lastObservationKey);
    if (observation && streamIdentity(observation) === health.streamKey) pointed.set(health.streamKey, observation);
  }
  for (const row of latestPerStream(rows)) {
    const key = streamIdentity(row);
    if (!pointed.has(key)) pointed.set(key, row);
  }
  return [...pointed.values()].sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime() || b.providerVersion - a.providerVersion || b.id - a.id).slice(0, limit);
}

export function freshnessState(freshnessAtMs: number | null, nowMs: number, staleAfterMs: number): { state: FreshnessState; ageMs: number | null; stale: boolean; futureInvalid: boolean } {
  if (freshnessAtMs === null || !Number.isFinite(freshnessAtMs) || freshnessAtMs <= 0) return { state: "unavailable", ageMs: null, stale: true, futureInvalid: false };
  if (freshnessAtMs > nowMs + MAX_CLOCK_SKEW_MS) return { state: "future_invalid", ageMs: null, stale: true, futureInvalid: true };
  const ageMs = Math.max(0, nowMs - freshnessAtMs);
  if (ageMs > staleAfterMs) return { state: "stale", ageMs, stale: true, futureInvalid: false };
  if (ageMs > staleAfterMs * 0.75) return { state: "aging", ageMs, stale: false, futureInvalid: false };
  return { state: "fresh", ageMs, stale: false, futureInvalid: false };
}

export function observationFreshness(row: ObservationFreshnessInput, streamSuccessAt: Date | null, nowMs: number): {
  display: ReturnType<typeof freshnessState>;
  fetchHealth: ReturnType<typeof freshnessState>;
  providerEventHealth: ReturnType<typeof freshnessState> | null;
  displayBasis: "provider update time" | "validated successful fetch";
  displayAtMs: number;
  staleAfterMs: number;
} {
  const staleAfterMs = row.kind === "quote" || row.kind === "volume_24h" ? QUOTE_STALE_AFTER_MS : row.candleState === "forming" ? FORMING_CANDLE_STALE_AFTER_MS : COMPLETED_CANDLE_STALE_AFTER_MS;
  const fetchAtMs = (streamSuccessAt ?? row.lastSuccessfulRefreshAt ?? row.receivedAt).getTime();
  const fetchHealth = freshnessState(fetchAtMs, nowMs, staleAfterMs);
  const providerEventHealth = row.providerUpdatedAt ? freshnessState(row.providerUpdatedAt.getTime(), nowMs, staleAfterMs) : null;
  const displayBasis = providerEventHealth ? "provider update time" as const : "validated successful fetch" as const;
  return { display: providerEventHealth ?? fetchHealth, fetchHealth, providerEventHealth, displayBasis, displayAtMs: providerEventHealth ? row.providerUpdatedAt?.getTime() ?? fetchAtMs : fetchAtMs, staleAfterMs };
}

export function quoteEligibleForContract(input: { providerEventAtMs: number; receivedAtMs: number; decisionAtMs: number; issuedAtMs: number; entryAtMs: number }): boolean {
  const eligibilityCutoffMs = Math.max(input.decisionAtMs, input.issuedAtMs, input.entryAtMs);
  return input.receivedAtMs >= input.issuedAtMs && input.providerEventAtMs >= eligibilityCutoffMs;
}

export function normalizeBinanceMiniTicker(row: unknown, receivedAtMs: number): MarketObservation[] {
  const item = row as Record<string, unknown>;
  const instrument = typeof item.symbol === "string" ? item.symbol.toUpperCase() : "";
  const providerUpdatedAtMs = numberOrNull(item.closeTime);
  const price = numberOrNull(item.lastPrice);
  const quoteVolume = numberOrNull(item.quoteVolume);
  if (!instrument || providerUpdatedAtMs === null || price === null || price <= 0) return [];
  const symbol = instrument.endsWith("USDT") ? instrument.slice(0, -4) : instrument;
  const common = { instrument, symbol, source: "Binance Spot REST", venue: "Binance Spot", pair: `${symbol}/USDT`, quoteCurrency: "USDT", receivedAtMs, intervalStartAtMs: null, intervalEndAtMs: null, providerUpdatedAtMs };
  return [
    { ...common, kind: "quote", interval: "point", candleState: "point", eventAtMs: providerUpdatedAtMs, value: price, open: null, high: null, low: null, close: price, volume: null, rawTrace: { providerField: "lastPrice", providerUpdateField: "closeTime", fetchedAtMs: receivedAtMs, raw: { symbol: item.symbol, lastPrice: item.lastPrice, closeTime: item.closeTime } } },
    { ...common, kind: "volume_24h", interval: "24h", candleState: "point", eventAtMs: providerUpdatedAtMs, value: quoteVolume, open: null, high: null, low: null, close: null, volume: quoteVolume, rawTrace: { providerField: "quoteVolume", providerUpdateField: "closeTime", fetchedAtMs: receivedAtMs, raw: { symbol: item.symbol, quoteVolume: item.quoteVolume, closeTime: item.closeTime } } },
  ];
}

export function normalizeBinanceKline(instrumentInput: string, row: unknown, receivedAtMs: number): MarketObservation | null {
  if (!Array.isArray(row) || row.length < 7) return null;
  const instrument = instrumentInput.toUpperCase();
  const symbol = instrument.endsWith("USDT") ? instrument.slice(0, -4) : instrument;
  const openTime = numberOrNull(row[0]);
  const open = numberOrNull(row[1]);
  const high = numberOrNull(row[2]);
  const low = numberOrNull(row[3]);
  const close = numberOrNull(row[4]);
  const volume = numberOrNull(row[5]);
  const closeTime = numberOrNull(row[6]);
  if ([openTime, open, high, low, close, volume, closeTime].some((value) => value === null)) return null;
  if ((open ?? 0) <= 0 || (high ?? 0) < (low ?? 0) || (close ?? 0) <= 0 || (volume ?? -1) < 0 || (closeTime ?? 0) <= (openTime ?? 0)) return null;
  const candleState: CandleState = (closeTime ?? 0) < receivedAtMs ? "completed" : "forming";
  return {
    instrument, symbol, source: "Binance Spot REST", venue: "Binance Spot", pair: `${symbol}/USDT`, quoteCurrency: "USDT",
    kind: "candle", interval: "1d", candleState, eventAtMs: closeTime ?? 0, intervalStartAtMs: openTime, intervalEndAtMs: closeTime, providerUpdatedAtMs: null, receivedAtMs, value: close,
    open, high, low, close, volume,
    rawTrace: { providerFields: { intervalStart: 0, open: 1, high: 2, low: 3, close: 4, volume: 5, intervalEnd: 6 }, providerUpdatedAt: "not supplied by REST kline payload", fetchedAtMs: receivedAtMs, raw: row.slice(0, 7) },
  };
}

export function statusFromQuote(decision: FrozenDecision, price: number, stale: boolean): { status: ObservedStatus; authoritativeSettlement: false; reason: string } {
  if (stale) return { status: "stale", authoritativeSettlement: false, reason: "The current mark is stale; the issued decision and levels remain unchanged." };
  const targetSeen = decision.direction === "long" ? price >= decision.targetPrice : price <= decision.targetPrice;
  const stopSeen = decision.direction === "long" ? price <= decision.stopPrice : price >= decision.stopPrice;
  if (targetSeen) return { status: "target_observed", authoritativeSettlement: false, reason: "A quote is at or beyond the issued target. Quote-only evidence cannot establish first touch." };
  if (stopSeen) return { status: "stop_observed", authoritativeSettlement: false, reason: "A quote is at or beyond the issued stop. Quote-only evidence cannot establish first touch." };
  return { status: "current_mark", authoritativeSettlement: false, reason: "Current mark appended. Issued entry, stop, target and decision snapshot remain frozen." };
}

export function statusEventKey(signalId: string, status: ObservedStatus, observationFingerprintValue: string): string {
  return [MARKET_FRESHNESS_VERSION, signalId, status, observationFingerprintValue].join("|");
}

export class RefreshDeduplicator {
  private readonly inFlight = new Map<string, Promise<unknown>>();
  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const existing = this.inFlight.get(key);
    if (existing) return existing as Promise<T>;
    const pending = task().finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, pending);
    return pending;
  }
}


export type MarketFetchResult = { payload: unknown; attemptCount: number; rateLimitCount: number; retryAfterMs: number | null };
export class MarketFetchError extends Error {
  constructor(message: string, readonly attemptCount: number, readonly rateLimitCount: number, readonly retryAfterMs: number | null) { super(message); }
}
function parsedRetryAfterMs(value: string | null, nowMs: number): number | null {
  if (!value) return null; const seconds = Number(value); if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds * 1000); const date = Date.parse(value); return Number.isFinite(date) ? Math.max(0, date - nowMs) : null;
}
export async function fetchMarketJson(url: string, options: { attempts?: number; transport?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>; sleep?: (ms: number) => Promise<void>; now?: () => number } = {}): Promise<MarketFetchResult> {
  const attempts = options.attempts ?? 2; const transport = options.transport ?? fetch; const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))); const now = options.now ?? Date.now;
  let lastError = "Provider request failed"; let attemptCount = 0; let rateLimitCount = 0; let latestRetryAfterMs: number | null = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    attemptCount += 1;
    try {
      const response = await transport(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(12_000) });
      if (response.ok) return { payload: await response.json(), attemptCount, rateLimitCount, retryAfterMs: latestRetryAfterMs };
      lastError = `HTTP ${response.status}`; if (response.status === 429) { rateLimitCount += 1; latestRetryAfterMs = parsedRetryAfterMs(response.headers.get("retry-after"), now()); } if (response.status !== 429 && response.status < 500) break;
    } catch (error) { lastError = error instanceof Error ? error.message : "Provider request failed"; }
    if (attempt + 1 < attempts) { const requestedDelay = latestRetryAfterMs ?? 300 * (attempt + 1); if (requestedDelay > 60_000) break; await sleep(Math.max(0, requestedDelay)); }
  }
  throw new MarketFetchError(lastError, attemptCount, rateLimitCount, latestRetryAfterMs);
}
