// MEXC Spot market-data adapter for the paper-research path.
// Mirrors server/src/paper-v219.ts conventions (Binance adapter): request/response
// hash proof, coverage type with documented endpoint assumptions, ascending
// client-side print order. PAPER ONLY — read-only market data, no orders.
//
// Decision 2 (2026-10-15): MEXC Spot covers 7 of 8 unsupported assets
// (BTW, AKE, Q, UMXM, POD, PONS, CASHCAT). PRL (Pearl L1) has no MEXC listing —
// MEXC's PRLUSDT is Perle, a different asset; rejected on identity.

export const MEXC_VENUE = "mexc-spot" as const;
export const MEXC_VENUE_LABEL = "MEXC Spot" as const;
export const MEXC_BASE = "https://api.mexc.com";

// Venue-assigned aggregate ids are NOT exposed on MEXC's public aggTrades
// (a/f/l are null). Print identity is the (ts, price, qty) tuple, rendered
// verbatim so checkpoints stay auditable.
export type MexcTradePrint = {
  ts: number;
  price: number;
  qty: number;
  venue: typeof MEXC_VENUE;
  venueTradeId: string;
  venueSeq: null;
};

export function compareMexcPrints(a: MexcTradePrint, b: MexcTradePrint): number {
  return a.ts - b.ts || a.price - b.price || a.qty - b.qty;
}

async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export type MexcCoverage = {
  claim: "adapter-established coverage under documented endpoint assumptions";
  venue: typeof MEXC_VENUE;
  symbol: string;
  requestedSinceMs: number;
  requestedUntilMs: number;
  receivedAt: string;
  rawResponseHash: string;
  endpoint: "/api/v3/aggTrades";
  endpointAssumptions: string[];
  paginationLimit: number;
  returnedCount: number;
  earliestReturnedTs: number | null;
  latestReturnedTs: number | null;
  headCoverageEstablished: boolean;
  completeForRequestedRange: boolean;
  paginationExhausted: boolean;
  completenessLimits: string[];
};

export type MexcHistoryResult = {
  prints: MexcTradePrint[];
  coverage: MexcCoverage;
  receivedAt: Date;
};

export async function fetchMexcTradeHistory(symbol: string, sinceMs: number, untilMs: number): Promise<MexcHistoryResult> {
  const limit = 1000;
  const url = `${MEXC_BASE}/api/v3/aggTrades?symbol=${encodeURIComponent(symbol)}&startTime=${Math.trunc(sinceMs)}&endTime=${Math.trunc(untilMs)}&limit=${limit}`;
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const raw = await response.text();
  const receivedAt = new Date();
  const rawResponseHash = await sha256Text(raw);
  if (!response.ok) throw new Error(`MEXC aggregate-trade history returned HTTP ${response.status}`);
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("MEXC aggregate-trade history was not an array");
  const prints: MexcTradePrint[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const ts = Number(row.T);
    const price = Number(row.p);
    const qty = Number(row.q);
    if (!Number.isFinite(ts) || !Number.isFinite(price) || price <= 0 || !Number.isFinite(qty) || qty <= 0) continue;
    prints.push({ ts, price, qty, venue: MEXC_VENUE, venueTradeId: `mexc:${ts}:${price}:${qty}`, venueSeq: null });
  }
  // MEXC returns newest-first; the paper path needs ascending venue order.
  prints.sort(compareMexcPrints);
  const earliestReturnedTs = prints[0]?.ts ?? null;
  const latestReturnedTs = prints.at(-1)?.ts ?? null;
  const allInsideRequestedRange = prints.every((print) => print.ts >= sinceMs && print.ts <= untilMs);
  const paginationExhausted = parsed.length < limit;
  // MEXC returns the newest end of a range first. A full page may therefore
  // omit the requested range head, so head completeness is established only
  // when the page is exhausted or reaches the requested start boundary.
  const headCoverageEstablished = allInsideRequestedRange && (paginationExhausted || (earliestReturnedTs !== null && earliestReturnedTs <= sinceMs));
  const completeForRequestedRange = paginationExhausted && allInsideRequestedRange;
  return {
    prints,
    receivedAt,
    coverage: {
      claim: "adapter-established coverage under documented endpoint assumptions",
      venue: MEXC_VENUE,
      symbol,
      requestedSinceMs: sinceMs,
      requestedUntilMs: untilMs,
      receivedAt: receivedAt.toISOString(),
      rawResponseHash,
      endpoint: "/api/v3/aggTrades",
      endpointAssumptions: [
        "MEXC aggTrades accepts startTime/endTime and returns aggregate trades for the requested range.",
        "Public responses omit venue-assigned aggregate ids (a/f/l are null); print identity is the (ts, price, qty) tuple, preserved verbatim as venueTradeId.",
        "Responses arrive newest-first; the adapter re-sorts to ascending (ts, price, qty) before any first-print read.",
      ],
      paginationLimit: limit,
      returnedCount: prints.length,
      earliestReturnedTs,
      latestReturnedTs,
      headCoverageEstablished,
      completeForRequestedRange,
      paginationExhausted,
      completenessLimits: [
        "No venue-assigned sequence exists: prints sharing a millisecond have no defined venue order; ties are ordered deterministically by (price, qty) and the ambiguity is documented here, not hidden.",
        "A full 1000-row newest-first page may omit older prints at the requested range head; head completeness is then withheld unless the earliest returned timestamp reaches the requested start boundary.",
        "The adapter proves its request, response hash and pagination check; it cannot prove the venue is honest or complete.",
      ],
    },
  };
}

// Candles for the venue-aware history cache. Row shape matches Binance klines:
// [openTime, open, high, low, close, volume, closeTime, quoteVolume].
export async function fetchMexcKlines(symbol: string, interval: string, startTimeMs: number, limit = 1000): Promise<unknown[]> {
  const url = `${MEXC_BASE}/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${limit}&startTime=${Math.trunc(startTimeMs)}`;
  // Bounded deadline (run-186 repair): this fetch sits inside discovery's
  // per-candidate history-cache backfill, where a raw fetch with no abort
  // signal could hang the whole scoring section indefinitely.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  let response: Response;
  try {
    response = await fetch(url, { headers: { Accept: "application/json" }, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) throw new Error("timeout: MEXC klines request exceeded 20s");
    throw error;
  } finally { clearTimeout(timer); }
  if (!response.ok) throw new Error(`MEXC klines returned HTTP ${response.status}`);
  const parsed: unknown = await response.json();
  if (!Array.isArray(parsed)) throw new Error("MEXC klines were not an array");
  return parsed;
}
