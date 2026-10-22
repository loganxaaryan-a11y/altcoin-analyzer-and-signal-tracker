/**
 * feed.ts — injectable venue-feed and clock interfaces for the entry watcher
 * (CORRECTION 4: cadence mismatch). Sandbox only — no production changes.
 *
 * The watcher never touches the network directly. All venue reads go through
 * the VenueFeed interface and all time reads through WatchClock, so tests are
 * fully deterministic (MutableClock + ScriptedFeed below) and a production
 * wiring can substitute a live feed without changing the watcher.
 */

export interface TradePrint {
  /** Venue timestamp of the print, ms epoch (e.g. Binance aggTrades T). */
  ts: number;
  price: number;
  /** Venue label, e.g. "binance-spot" / "consolidated-tape". */
  venue: string;
}

/**
 * Sandbox of the venue feed.
 *
 * Contract: returns prints with venue timestamp ts > sinceTs, in ascending ts
 * order, containing ONLY prints observable at call time. A print that exists
 * in history but is not yet served (feed latency, delayed backfill) must NOT
 * be returned — observability, not existence, is what makes an entry timely
 * and actionable.
 */
export interface VenueFeed {
  latestPrints(sinceTs: number): TradePrint[] | Promise<TradePrint[]>;
}

export interface WatchClock {
  nowMs(): number;
}

export function systemClock(): WatchClock {
  return { nowMs: () => Date.now() };
}

// ---------------------------------------------------------------------------
// Sandbox test support — deterministic, no network. NOT for production use.
// ---------------------------------------------------------------------------

/** A manually advanced clock for deterministic tests. */
export class MutableClock implements WatchClock {
  constructor(public now: number) {}
  nowMs(): number {
    return this.now;
  }
  advance(ms: number): void {
    this.now += ms;
  }
  set(ms: number): void {
    this.now = ms;
  }
}

export interface ScriptedPrint extends TradePrint {
  /**
   * Server time at which the feed starts serving this print. Models feed
   * latency / delayed availability: a print with ts < availableAt exists in
   * history but is not observable until availableAt. This is the mechanism
   * that separates a live observation from a historical reconstruction.
   */
  availableAt: number;
}

/**
 * Deterministic in-memory venue feed for tests. Serves a scripted print only
 * once the clock has reached its availableAt — mirroring the VenueFeed
 * contract that unobservable history is never returned.
 */
export class ScriptedFeed implements VenueFeed {
  constructor(
    private readonly prints: ScriptedPrint[],
    private readonly clock: WatchClock,
  ) {}

  latestPrints(sinceTs: number): TradePrint[] {
    const now = this.clock.nowMs();
    return this.prints
      .filter((p) => p.ts > sinceTs && now >= p.availableAt)
      .sort((a, b) => a.ts - b.ts)
      .map(({ ts, price, venue }) => ({ ts, price, venue }));
  }
}
