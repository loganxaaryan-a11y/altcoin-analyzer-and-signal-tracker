/**
 * Feed wiring for the discovery->paper handoff (sandbox).
 *
 * Two modes:
 *   scripted — DEMO ONLY. Entry prints + waiting-interval bars come from the
 *              candidate's `demoScript` block (labeled DEMO-SCRIPTED-FEED).
 *              Refused unless the discovery run is labeled demo:true.
 *   binance  — operational. Read-only Binance.US public market data, reusing
 *              the paper pilot's adapter (pilot/src/binance.ts): aggTrades
 *              prints for entry observation, 1m klines for waiting-interval
 *              and post-entry evidence, last-price quote refresh.
 *
 * PAPER ONLY: no orders, no brokerage, no keys — public GET endpoints.
 *
 * The handoff processes candidates sequentially; qualify.ts calls
 * useCandidate(candidateKey) before each candidate so the evidence callbacks
 * resolve the right radar candidate (the entry contract itself carries no
 * candidate id or symbol).
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const PS = resolve(here, "..", "..");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyMod = Record<string, any>;

async function loadDist(): Promise<{
  manualClock: (startMs: number) => any;
  systemClock: () => any;
  ScriptedFeed: new (prints: any[], clock: any) => any;
  MutableClock: new (startMs: number) => any;
}> {
  const clock = (await import(resolve(PS, "orchestrator/dist/paper-signals/orchestrator/src/clock.js"))) as AnyMod;
  const feed = (await import(resolve(PS, "orchestrator/dist/paper-signals/entry-v1/src/feed.js"))) as AnyMod;
  return {
    manualClock: clock.manualClock,
    systemClock: clock.systemClock,
    ScriptedFeed: feed.ScriptedFeed,
    MutableClock: feed.MutableClock,
  };
}

async function loadPilotBinance(): Promise<AnyMod> {
  return (await import(resolve(PS, "pilot/src/binance.ts"))) as AnyMod;
}

export type FeedMode = "scripted" | "binance";

export interface FeedBundle {
  mode: FeedMode;
  label: string;
  clock: any;
  quoteProvider: any;
  /** Called by qualify.ts before each candidate's processing (sequential). */
  useCandidate: (candidateKey: string) => void;
  entryFeedFor: (contract: any, candidate: any) => any;
  waitingIntervalEvidenceFor: (contract: any) => any;
  postEntryEvidenceFor: (contract: any) => any;
  deliverAlert: (alert: any) => { acknowledged: boolean; mode: "simulated"; ackId: string };
}

/** Discovery symbol -> Binance.US spot symbol (e.g. BTC -> BTCUSD). */
export function toBinanceSymbol(symbol: string): string {
  const s = symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (/(USD|USDT)$/.test(s)) return s;
  return `${s}USD`;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function buildFeedBundle(
  mode: FeedMode,
  opts: {
    isDemoRun: boolean;
    clockStartMs: number;
    /** candidateKey -> RadarCandidate */
    radarByKey: Map<string, any>;
    httpLogPath?: string;
  },
): Promise<FeedBundle> {
  const dist = await loadDist();

  const deliverAlert = (alert: any): { acknowledged: boolean; mode: "simulated"; ackId: string } => ({
    acknowledged: true,
    mode: "simulated",
    ackId: `sandbox-ack-${alert.id}`,
  });

  let currentKey: string | null = null;
  const useCandidate = (candidateKey: string): void => {
    currentKey = candidateKey;
  };
  const currentRadar = (): any => (currentKey ? opts.radarByKey.get(currentKey) : null);

  if (mode === "scripted") {
    if (!opts.isDemoRun) {
      throw new Error("feed=scripted refused: scripted venue prints are DEMO-ONLY (discovery run not labeled demo:true)");
    }
    // Handler clock (orchestrator Clock: now()) and feed clock (WatchClock:
    // nowMs()) advance together, mirroring the tests' wireEntry.
    const clock = dist.manualClock(opts.clockStartMs);
    const feedClock = new dist.MutableClock(opts.clockStartMs);
    const advanceBoth = (ms: number): void => {
      feedClock.advance(ms);
      clock.advance(ms);
    };

    const entryFeedFor = (_contract: any, _candidate: any) => {
      const script = currentRadar()?.demoScript;
      if (!script || script.label !== "DEMO-SCRIPTED-FEED") return null;
      const now = clock.now();
      const prints = (script.prints as Array<{ offsetMs: number; price: number; venue: string }>).map((p) => ({
        ts: now + p.offsetMs,
        price: p.price,
        venue: p.venue,
        availableAt: now + p.offsetMs,
      }));
      return {
        feed: new dist.ScriptedFeed(prints, feedClock),
        clock: feedClock,
        pollIntervalMs: 30_000, // strictly finer than the 15-min crypto entry window
        maxPolls: 100,
        advance: advanceBoth,
      };
    };

    const waitingIntervalEvidenceFor = (contract: any) => {
      const script = currentRadar()?.demoScript;
      const waitingBars = script?.label === "DEMO-SCRIPTED-FEED" ? (script.waitingBars ?? []) : [];
      if (waitingBars.length === 0) return null; // crypto fails closed on empty — honest
      const decisionAt: number = Date.parse(contract.decisionAt);
      return waitingBars.map((b: { offsetMs: number; price: number; label: string }) => ({
        startAt: decisionAt + b.offsetMs,
        endAt: decisionAt + b.offsetMs,
        open: b.price, high: b.price, low: b.price, close: b.price,
        isClosed: true,
        granularity: "trade_print",
        source: "DEMO-SCRIPTED-FEED",
        label: b.label,
      }));
    };

    return {
      mode, label: "DEMO-SCRIPTED-FEED (labeled demo; not a venue)",
      clock, quoteProvider: undefined, useCandidate,
      entryFeedFor, waitingIntervalEvidenceFor,
      postEntryEvidenceFor: () => null,
      deliverAlert,
    };
  }

  // ---- binance (operational) ----
  const bn = await loadPilotBinance();
  if (opts.httpLogPath && typeof bn.setHttpLog === "function") bn.setHttpLog(opts.httpLogPath);
  const clock = dist.systemClock();

  const quoteProvider = {
    refresh: async (candidate: any, nowMs: number) => {
      try {
        const snap = await bn.snapshotInputs(toBinanceSymbol(candidate.symbol), nowMs);
        return bn.snapshotToFreshInputs(snap);
      } catch {
        return null; // provider failure -> deferred, never issued on stale evidence
      }
    },
  };

  const entryFeedFor = (_contract: any, _candidate: any) => {
    const radar = currentRadar();
    if (!radar) return null;
    return {
      feed: new bn.BinanceVenueFeed(toBinanceSymbol(radar.symbol)),
      clock: bn.systemWatchClock(),
      pollIntervalMs: 20_000, // strictly finer than the 15-min crypto entry window
      maxPolls: 40,
      advance: (ms: number) => sleep(ms),
    };
  };

  const waitingIntervalEvidenceFor = (contract: any) => {
    const radar = currentRadar();
    if (!radar) return null;
    try {
      const klines = bn.fetchKlinesSync(toBinanceSymbol(radar.symbol), "1m", {
        startTime: Date.parse(contract.decisionAt),
        endTime: Date.parse(contract.entryObservedAt ?? contract.decisionAt),
        limit: 60,
      });
      const nowMs = Date.now();
      return klines.map((k: any) => bn.klineToEvidenceBar(k, nowMs, "binance.us klines 1m"));
    } catch {
      return null; // crypto fails closed on empty — honest, never silent
    }
  };

  const postEntryEvidenceFor = (contract: any) => {
    const radar = currentRadar();
    if (!radar) return null;
    try {
      const entryAt = Date.parse(contract.entryObservedAt ?? contract.decisionAt);
      const klines = bn.fetchKlinesSync(toBinanceSymbol(radar.symbol), "1m", { startTime: entryAt, limit: 30 });
      const nowMs = Date.now();
      return { bars: klines.map((k: any) => bn.klineToEvidenceBar(k, nowMs, "binance.us klines 1m")), nowAt: nowMs };
    } catch {
      return null;
    }
  };

  return {
    mode, label: "binance-spot (read-only public market data; paper only)",
    clock, quoteProvider, useCandidate,
    entryFeedFor, waitingIntervalEvidenceFor, postEntryEvidenceFor,
    deliverAlert,
  };
}
