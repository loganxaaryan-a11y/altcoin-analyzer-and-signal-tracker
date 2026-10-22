/**
 * Binance.US PUBLIC market-data adapter — READ ONLY.
 *
 * PAPER PILOT. This module may only issue HTTP GET requests against the
 * public market-data endpoints allowlisted below. There is no API key, no
 * signing, and no code path that can place, cancel, or query orders:
 *  - GET /api/v3/klines        (candles)
 *  - GET /api/v3/aggTrades      (aggregate trade prints)
 *  - GET /api/v3/ticker/price   (last price)
 * Any other path throws. Every call is appended to the HTTP evidence log
 * (method + path + params) so the venue audit trail is inspectable.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { EvidenceBar, FreshInputs, HistoryCoverage, TradePrint, VenueFeed, WatchClock } from "./shims.js";

const BASE = "https://api.binance.us";
const ALLOWED_PATHS = new Set(["/api/v3/klines", "/api/v3/aggTrades", "/api/v3/ticker/price"]);

export interface Kline { openTime: number; open: number; high: number; low: number; close: number; volume: number; closeTime: number; }
export interface AggTrade { aggId: number; price: number; qty: number; time: number; }

let httpLogPath = "";
export function setHttpLog(path: string): void {
  httpLogPath = path;
  mkdirSync(dirname(resolve(path)), { recursive: true });
}

function logCall(method: string, path: string, params: Record<string, string | number | undefined>, status: number, latencyMs: number): void {
  if (!httpLogPath) return;
  const safeParams: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) if (v !== undefined) safeParams[k] = String(v);
  appendFileSync(httpLogPath, JSON.stringify({ ts: new Date().toISOString(), paper: true, method, path, params: safeParams, status, latencyMs }) + "\n");
}

function buildUrl(path: string, params: Record<string, string | number | undefined>): string {
  if (!ALLOWED_PATHS.has(path)) {
    throw new Error(`paper pilot: refusing non-allowlisted venue path ${path} (read-only market data only; no order endpoints)`);
  }
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));
  return url.toString();
}

export async function venueGet<T>(path: string, params: Record<string, string | number | undefined>): Promise<T> {
  const url = buildUrl(path, params);
  const t0 = Date.now();
  const res = await fetch(url, { headers: { "User-Agent": "paper-pilot/0.1.0 (read-only)" } });
  const latencyMs = Date.now() - t0;
  logCall("GET", path, params, res.status, latencyMs);
  if (!res.ok) throw new Error(`paper pilot: venue GET ${path} -> ${res.status}`);
  return (await res.json()) as T;
}

/**
 * Raw-text variant of venueGet: same allowlist + HTTP evidence logging, but
 * returns the response bytes verbatim (before any JSON parse). Used by the
 * entry feed so the history-coverage evidence's raw-response hash is bound
 * to the ACTUAL response that produced the served batch.
 */
export async function venueGetRawText(path: string, params: Record<string, string | number | undefined>): Promise<string> {
  const url = buildUrl(path, params);
  const t0 = Date.now();
  const res = await fetch(url, { headers: { "User-Agent": "paper-pilot/0.1.0 (read-only)" } });
  const latencyMs = Date.now() - t0;
  logCall("GET", path, params, res.status, latencyMs);
  if (!res.ok) throw new Error(`paper pilot: venue GET ${path} -> ${res.status}`);
  return await res.text();
}

/** Synchronous GET for the handler's sync evidence hooks (entry observed -> outcome commit). Same allowlist. */
export function venueGetSync<T>(path: string, params: Record<string, string | number | undefined>): T {
  const url = buildUrl(path, params);
  const t0 = Date.now();
  const out = execFileSync("curl", ["-sS", "--max-time", "20", "-A", "paper-pilot/0.1.0 (read-only)", url], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  const latencyMs = Date.now() - t0;
  logCall("GET", path, params, 200, latencyMs);
  return JSON.parse(out) as T;
}

type RawKline = [number, string, string, string, string, string, number, string, number, string, string, string];
function toKline(r: RawKline): Kline {
  return { openTime: r[0], open: parseFloat(r[1]), high: parseFloat(r[2]), low: parseFloat(r[3]), close: parseFloat(r[4]), volume: parseFloat(r[5]), closeTime: r[6] };
}

export async function fetchKlines(symbol: string, interval: string, opts: { startTime?: number; endTime?: number; limit?: number }): Promise<Kline[]> {
  const raw = await venueGet<RawKline[]>("/api/v3/klines", { symbol, interval, startTime: opts.startTime, endTime: opts.endTime, limit: opts.limit ?? 500 });
  return raw.map(toKline);
}

export function fetchKlinesSync(symbol: string, interval: string, opts: { startTime?: number; endTime?: number; limit?: number }): Kline[] {
  const raw = venueGetSync<RawKline[]>("/api/v3/klines", { symbol, interval, startTime: opts.startTime, endTime: opts.endTime, limit: opts.limit ?? 500 });
  return raw.map(toKline);
}

export async function fetchAggTrades(symbol: string, opts: { startTime?: number; limit?: number }): Promise<AggTrade[]> {
  const raw = await venueGet<Array<{ a: number; p: string; q: string; T: number }>>("/api/v3/aggTrades", { symbol, startTime: opts.startTime, limit: opts.limit ?? 1000 });
  return raw.map((t) => ({ aggId: t.a, price: parseFloat(t.p), qty: parseFloat(t.q), time: t.T }));
}

export async function fetchLastPrice(symbol: string): Promise<number> {
  const r = await venueGet<{ symbol: string; price: string }>("/api/v3/ticker/price", { symbol });
  return parseFloat(r.price);
}

export function klineToEvidenceBar(k: Kline, nowMs: number, source: string): EvidenceBar {
  const closed = k.closeTime < nowMs;
  return {
    startAt: k.openTime,
    endAt: k.closeTime + 1,
    open: k.open, high: k.high, low: k.low, close: k.close,
    isClosed: closed,
    granularity: "intraday",
    source,
    label: `${source} ${new Date(k.openTime).toISOString()}`,
    ...(closed ? {} : { provisional: true }),
  };
}

export const systemWatchClock = (): WatchClock => ({ nowMs: () => Date.now() });

/**
 * Live venue feed for entry observation. latestPrints(sinceTs) returns ONLY
 * prints with venue timestamp > sinceTs, in ascending order — the VenueFeed
 * contract (observability, not history). Prints are labeled "binance-spot",
 * the only label the crypto entry rule accepts.
 */
export class BinanceVenueFeed implements VenueFeed {
  private readonly symbol: string;
  /**
   * Evidence binding: the raw response bytes (plus request/response
   * metadata) of the most recent latestPrints batch, keyed by the sinceTs
   * that produced it. historyCoverage(sinceTs) binds its evidence to THIS
   * batch — the actual response served — and never to a fresh or invented
   * one.
   */
  private lastBatch: {
    sinceTs: number;
    rawText: string;
    rawCount: number;
    receiptMs: number;
    maxTs: number;
  } | null = null;
  constructor(symbol: string) { this.symbol = symbol; }
  async latestPrints(sinceTs: number): Promise<TradePrint[]> {
    // Raw-text fetch: the response bytes are retained so the coverage
    // evidence's raw-response hash is bound to the ACTUAL response that
    // produced the served batch.
    const rawText = await venueGetRawText("/api/v3/aggTrades", {
      symbol: this.symbol, startTime: Math.max(0, sinceTs), limit: 1000,
    });
    const receiptMs = Date.now();
    const raw = JSON.parse(rawText) as Array<{ a: number; p: string; q: string; T: number }>;
    const trades = raw.map((t) => ({ aggId: t.a, price: parseFloat(t.p), qty: parseFloat(t.q), time: t.T }));
    const served = trades
      .filter((t) => t.time > sinceTs && Number.isFinite(t.price) && t.price > 0)
      .sort((a, b) => a.time - b.time || a.aggId - b.aggId)
      // v2.1.9: preserve the REAL venue trade id — the aggTrades aggregate
      // trade id `a` — verbatim as venueTradeId, and expose it as venueSeq
      // (monotonic in venue execution order) for same-timestamp ordering.
      // The pre-v2.1.9 map dropped `a` here, severing the feed->checkpoint
      // chain at its first link.
      .map((t) => ({
        ts: t.time,
        price: t.price,
        venue: "binance-spot",
        venueTradeId: String(t.aggId),
        venueSeq: t.aggId,
      }));
    this.lastBatch = {
      sinceTs,
      rawText,
      rawCount: raw.length,
      receiptMs,
      maxTs: served.length > 0 ? Math.max(...served.map((s) => s.ts)) : sinceTs,
    };
    return served;
  }
  /**
   * Coverage evidence (v2.1.8 + evidence-binding fix), bound to the actual
   * response served by the preceding latestPrints(sinceTs) call:
   *   - historyStartMs = sinceTs: aggTrades is requested with
   *     startTime = sinceTs and returns ascending history from that instant,
   *     so the head of the served batch is complete from the requested
   *     sinceTs — the head-completeness the first-print rule needs.
   *   - rawResponseHash: sha256 of the raw response bytes exactly as
   *     received, before parsing.
   *   - pagination: limit 1000 per request; paginationExhausted is true when
   *     the response returned fewer rows than the cap (no further pages);
   *     when the cap is hit the TAIL of a busy interval may be truncated —
   *     the head stays complete from sinceTs, and the poll loop re-requests
   *     from the last served print so no interval is skipped.
   *
   * DOCUMENTED ENDPOINT ASSUMPTIONS (Binance.US GET /api/v3/aggTrades):
   *   1. With startTime set, the endpoint returns compressed aggregate
   *      trades with T >= startTime in ascending (time, aggId) order.
   *   2. limit caps the response at 1000 rows (endpoint max); the cap
   *      truncates the TAIL — head-completeness from sinceTs is what the
   *      evidence claims.
   *   3. Exchange-side history gaps are NOT detectable from this endpoint:
   *      the evidence is "complete as served from startTime". The
   *      handler-side proof is that the coverage check is enforced, not
   *      that the venue is honest.
   *   4. latestPrints and historyCoverage are called sequentially with the
   *      same sinceTs (the handler's contract); a historyCoverage call with
   *      no bound batch throws — unbound evidence would be a fabrication,
   *      and the handler fails closed on it (named non-entry).
   *
   * The honest claim is therefore "adapter-established coverage under the
   * documented endpoint assumptions above" — NOT "venue-attested proof".
   */
  async historyCoverage(sinceTs: number): Promise<HistoryCoverage> {
    const batch = this.lastBatch;
    if (!batch || batch.sinceTs !== sinceTs) {
      throw new Error(
        `paper pilot: BinanceVenueFeed has no served batch bound to sinceTs ${sinceTs} — ` +
        `historyCoverage must follow the matching latestPrints call`,
      );
    }
    return {
      historyStartMs: sinceTs,
      venue: "binance-spot",
      symbol: this.symbol,
      requestedRange: { sinceTs, toTs: batch.maxTs },
      receiptMs: batch.receiptMs,
      rawResponseHash: createHash("sha256").update(batch.rawText, "utf8").digest("hex"),
      pagination: { maxResultsPerRequest: 1000, paginationExhausted: batch.rawCount < 1000 },
    };
  }
}

export interface QuoteSnapshot {
  signalDay: { day: string; open: number; high: number; low: number; close: number } | null;
  historyCloses: number[];
  historyHighs: number[];
  currentPrice: number;
  vetoBars: EvidenceBar[];
  asOf: string;
}

export async function snapshotInputs(symbol: string, nowMs: number): Promise<QuoteSnapshot> {
  // Daily history (completed candles only) for the gate evidence.
  const daily = await fetchKlines(symbol, "1d", { limit: 90 });
  const completed = daily.filter((k) => k.closeTime < nowMs);
  const historyCloses = completed.map((k) => k.close);
  const historyHighs = completed.map((k) => k.high);
  const last = completed[completed.length - 1] ?? null;
  const signalDay = last
    ? { day: new Date(last.openTime).toISOString().slice(0, 10), open: last.open, high: last.high, low: last.low, close: last.close }
    : null;
  // Recent 1m bars as post-decision veto evidence (forming candle provisional).
  const intraday = await fetchKlines(symbol, "1m", { limit: 15 });
  const vetoBars = intraday.map((k) => klineToEvidenceBar(k, nowMs, "binance.us klines 1m"));
  const currentPrice = await fetchLastPrice(symbol);
  return { signalDay, historyCloses, historyHighs, currentPrice, vetoBars, asOf: new Date(nowMs).toISOString() };
}

export function snapshotToFreshInputs(snap: QuoteSnapshot): FreshInputs {
  return {
    signalDay: snap.signalDay ? { ...snap.signalDay, source: "binance.us klines 1d" } : null,
    historyCloses: snap.historyCloses,
    historyHighs: snap.historyHighs,
    currentPrice: snap.currentPrice,
    asOf: snap.asOf,
    vetoBars: snap.vetoBars,
  };
}
