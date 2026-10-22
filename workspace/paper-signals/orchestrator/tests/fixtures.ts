/**
 * Deterministic synthetic fixtures for the sandbox orchestrator tests.
 * No network, no production data — seeded PRNG bars only.
 */
import type { FreshInputs, PaperCandidateInput, RawBar, SignalDayCandle } from "../src/types.js";
import { MutableClock, ScriptedFeed } from "../../entry-v1/src/feed.js";
import { etWallToUtcIso, nextXnysSession, xnysSessionBounds } from "../../entry-v1/src/entry-rules.js";
import type { EvidenceBar } from "../../veto/src/veto.js";

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isoDate(base: Date, offsetDays: number): string {
  const d = new Date(base.getTime() + offsetDays * 86_400_000);
  return d.toISOString().slice(0, 10);
}

export interface EquityBarOpts {
  n?: number;
  start?: number;
  drift?: number;      // per-bar close drift
  noise?: number;      // uniform noise amplitude
  startDate?: string;  // YYYY-MM-DD of first bar
  seed?: number;
  /** Override the final (signal-day) bar's OHLC after generation. */
  lastBar?: Partial<{ open: number; high: number; low: number; close: number }>;
}

/** n daily equity bars, oldest -> newest; last bar is the signal day. */
export function makeEquityBars(opts: EquityBarOpts = {}): RawBar[] {
  const { n = 220, start = 180, drift = 0.35, noise = 0.6, startDate = "2025-12-01", seed = 42, lastBar } = opts;
  const rand = mulberry32(seed);
  const base = new Date(`${startDate}T00:00:00.000Z`);
  const bars: RawBar[] = [];
  let close = start;
  for (let i = 0; i < n; i++) {
    close = close + drift + (rand() - 0.5) * 2 * noise;
    const open = close - drift * 0.4 + (rand() - 0.5) * noise;
    const high = Math.max(open, close) + rand() * noise * 0.8;
    const low = Math.min(open, close) - rand() * noise * 0.8;
    const volume = Math.round(1_000_000 * (1 + (close > open ? 0.3 : -0.1) + (rand() - 0.5) * 0.4));
    const date = isoDate(base, i);
    bars.push({ date, open, high, low, close, volume, availableAt: `${date}T21:00:00.000Z` });
  }
  if (lastBar) Object.assign(bars[n - 1]!, lastBar);
  return bars;
}

export function signalDayFromBars(bars: RawBar[]): SignalDayCandle {
  const last = bars[bars.length - 1]!;
  return { day: last.date, open: last.open, high: last.high, low: last.low, close: last.close ?? 0, source: "sandbox-fixture" };
}

export function closesFromBars(bars: RawBar[]): number[] {
  return bars.map((b) => b.close ?? 0);
}
export function highsFromBars(bars: RawBar[]): number[] {
  return bars.map((b) => b.high ?? 0);
}

export interface CryptoHistoryOpts {
  n?: number;
  start?: number;
  drift?: number;
  noise?: number;
  seed?: number;
}

/** Rising or falling close/high series for crypto gate tests. */
export function makeCryptoHistory(opts: CryptoHistoryOpts = {}): { closes: number[]; highs: number[] } {
  const { n = 60, start = 100, drift = 0.8, noise = 0.9, seed = 7 } = opts;
  const rand = mulberry32(seed);
  const closes: number[] = [];
  const highs: number[] = [];
  let close = start;
  for (let i = 0; i < n; i++) {
    close = Math.max(0.01, close + drift + (rand() - 0.5) * 2 * noise);
    closes.push(close);
    highs.push(close + rand() * noise);
  }
  return { closes, highs };
}

export function cryptoInputs(overrides: Partial<FreshInputs> = {}): FreshInputs {
  const { closes, highs } = makeCryptoHistory();
  const last = closes[closes.length - 1]!;
  return {
    signalDay: { day: "2026-10-13", open: last - 1, high: last + 1.5, low: last - 1.5, close: last, source: "sandbox-fixture" },
    historyCloses: closes,
    historyHighs: highs,
    currentPrice: last,
    asOf: "2026-10-13T20:00:00.000Z",
    ...overrides,
  };
}

let candidateSeq = 0;

export function cryptoCandidate(overrides: Partial<PaperCandidateInput> = {}): PaperCandidateInput {
  candidateSeq += 1;
  const inputs = cryptoInputs();
  const last = inputs.historyCloses[inputs.historyCloses.length - 1]!;
  return {
    terminal: "crypto",
    symbol: `TST${candidateSeq}`,
    coinId: `tst-${candidateSeq}`,
    name: `Test Coin ${candidateSeq}`,
    direction: "long",
    score: 72,
    entryPrice: last,
    invalidation: last - 6,
    target1: last + 6,
    target2: last + 12,
    signalDate: "2026-10-13",
    detectedAt: "2026-10-13T18:00:00.000Z",
    source: "shortlist",
    inputs,
    ...overrides,
  };
}

export function equityCandidate(bars: RawBar[], overrides: Partial<PaperCandidateInput> = {}): PaperCandidateInput {
  candidateSeq += 1;
  const last = bars[bars.length - 1]!;
  const asOf = `${last.date}T22:00:00.000Z`;
  return {
    terminal: "equity",
    symbol: `EQTST${candidateSeq}`,
    name: `Test Equity ${candidateSeq}`,
    direction: "long",
    score: 68,
    entryPrice: last.close ?? 0,
    invalidation: (last.close ?? 0) - 4,
    target1: (last.close ?? 0) + 6,
    target2: (last.close ?? 0) + 10,
    signalDate: last.date,
    detectedAt: `${last.date}T18:00:00.000Z`,
    source: "shortlist",
    inputs: {
      signalDay: signalDayFromBars(bars),
      historyCloses: closesFromBars(bars),
      historyHighs: highsFromBars(bars),
      currentPrice: last.close,
      asOf,
      rawBars: bars,
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Integrated-path fixtures (workstream A): deterministic timelines for the
// integrated issuance handler. Crypto timeline: signal day 2026-10-13,
// decision (detectedAt) 2026-10-14T00:30Z — after the signal-day bar closed,
// so the signal-day bar is fully pre-decision. Equity timeline: signal day
// 2026-10-13 (Tuesday XNYS session), decision evening 2026-10-13T22:00Z,
// entry = 2026-10-14 session-open print.
// ---------------------------------------------------------------------------

export interface IntegratedCryptoOpts {
  symbol?: string;
  direction?: "long" | "short";
  entryPrice?: number;
  invalidation?: number;
  signalDayLow?: number;
  signalDayHigh?: number;
  vetoBars?: EvidenceBar[];
  detectedAt?: string;
  asOf?: string;
  historyCloses?: number[];
  historyHighs?: number[];
  score?: number;
}

/** Crypto candidate on the integrated timeline (long default). */
export function integratedCryptoCandidate(opts: IntegratedCryptoOpts = {}): PaperCandidateInput {
  const entryPrice = opts.entryPrice ?? 100;
  const direction = opts.direction ?? "long";
  const invalidation = opts.invalidation ?? (direction === "long" ? entryPrice - 6 : entryPrice + 6);
  const detectedAt = opts.detectedAt ?? "2026-10-14T00:30:00.000Z";
  const closes = opts.historyCloses ?? Array.from({ length: 60 }, (_, i) => entryPrice - (59 - i) * 0.5);
  const highs = opts.historyHighs ?? closes.map((c) => c + 0.4);
  const symbol = opts.symbol ?? "ITG";
  return {
    terminal: "crypto",
    symbol,
    coinId: `itg-${symbol.toLowerCase()}`,
    name: `Integrated ${symbol}`,
    direction,
    score: opts.score ?? 72,
    entryPrice,
    invalidation,
    target1: direction === "long" ? entryPrice + 6 : entryPrice - 6,
    target2: direction === "long" ? entryPrice + 12 : entryPrice - 12,
    signalDate: "2026-10-13",
    detectedAt,
    source: "shortlist",
    inputs: {
      signalDay: {
        day: "2026-10-13",
        open: entryPrice - 1,
        high: opts.signalDayHigh ?? entryPrice + 1,
        low: opts.signalDayLow ?? entryPrice - 4.5,
        close: entryPrice,
        source: "itg-fixture",
      },
      historyCloses: closes,
      historyHighs: highs,
      currentPrice: entryPrice,
      asOf: opts.asOf ?? detectedAt,
      vetoBars: opts.vetoBars ?? [],
    },
  };
}

export interface IntegratedEquityOpts {
  symbol?: string;
  close?: number;
  invalidation?: number;
  detectedAt?: string;
  asOf?: string;
  score?: number;
}

/** Equity long candidate on the integrated timeline (2026-10-13 = Tuesday XNYS session). */
export function integratedEquityCandidate(opts: IntegratedEquityOpts = {}): PaperCandidateInput {
  const close = opts.close ?? 250;
  const invalidation = opts.invalidation ?? close - 6;
  const detectedAt = opts.detectedAt ?? "2026-10-13T22:00:00.000Z";
  const closes = Array.from({ length: 60 }, (_, i) => close - (59 - i) * 0.4);
  const symbol = opts.symbol ?? "ITGEQ";
  return {
    terminal: "equity",
    symbol,
    name: `Integrated ${symbol}`,
    direction: "long",
    score: opts.score ?? 68,
    entryPrice: close,
    invalidation,
    target1: close + 9,
    target2: close + 15,
    signalDate: "2026-10-13",
    detectedAt,
    source: "shortlist",
    inputs: {
      signalDay: {
        day: "2026-10-13", open: close - 1, high: close + 1, low: close - 1.5, close, source: "itg-fixture",
      },
      historyCloses: closes,
      historyHighs: closes.map((c) => c + 0.5),
      currentPrice: close,
      asOf: opts.asOf ?? detectedAt,
    },
  };
}

interface Ohlc {
  open: number;
  high: number;
  low: number;
  close: number;
}

/** Closed 1h bar (intraday granularity) for the veto's decision→entry window. */
export function h1Bar(startIso: string, ohlc: Ohlc, label: string): EvidenceBar {
  const startAt = Date.parse(startIso);
  return {
    startAt, endAt: startAt + 3_600_000,
    ...ohlc, isClosed: true, granularity: "intraday", source: "itg-fixture", label,
  };
}

/** Forming (provisional) candle for straddling-uncertainty fixtures. */
export function formingBar(startIso: string, endIso: string, ohlc: Ohlc, label: string): EvidenceBar {
  return {
    startAt: Date.parse(startIso), endAt: Date.parse(endIso),
    ...ohlc, isClosed: false, provisional: true, granularity: "forming_candle",
    source: "itg-fixture", label,
  };
}

/** Closed XNYS session bar (session granularity) for post-entry evidence. */
export function sessionBar(dateStr: string, ohlc: Ohlc, label: string): EvidenceBar {
  const { start, end } = xnysSessionBounds(dateStr);
  return {
    startAt: Date.parse(start), endAt: Date.parse(end),
    ...ohlc, isClosed: true, granularity: "session", source: "itg-fixture", label,
  };
}

export interface ScriptedEntrySetup {
  feed: ScriptedFeed;
  clock: MutableClock;
  printTs: number;
}

/** Crypto: one scripted trade print served at printTs (venue clock). */
export function cryptoPrintFeed(handlerStartMs: number, printOffsetMs: number, price: number): ScriptedEntrySetup {
  const clock = new MutableClock(handlerStartMs);
  const printTs = handlerStartMs + printOffsetMs;
  const feed = new ScriptedFeed(
    [{ ts: printTs, price, venue: "binance-spot", venueTradeId: "agg-7001", venueSeq: 7001, availableAt: printTs }],
    clock,
  );
  return { feed, clock, printTs };
}

/** Equity: the next session's open print, served exactly at the open instant. */
export function equityOpenPrintFeed(handlerStartMs: number, signalDate: string, price: number): ScriptedEntrySetup {
  const clock = new MutableClock(handlerStartMs);
  const printTs = Date.parse(etWallToUtcIso(nextXnysSession(signalDate), "09:30"));
  const feed = new ScriptedFeed(
    [{ ts: printTs, price, venue: "consolidated-tape", venueTradeId: "tape-7002", venueSeq: 7002, availableAt: printTs }],
    clock,
  );
  return { feed, clock, printTs };
}
