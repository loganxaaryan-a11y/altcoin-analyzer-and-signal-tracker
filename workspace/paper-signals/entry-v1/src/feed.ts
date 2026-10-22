/**
 * feed.ts — injectable venue-feed and clock interfaces for the entry watcher
 * (CORRECTION 4: cadence mismatch). Sandbox only — no production changes.
 *
 * The watcher never touches the network directly. All venue reads go through
 * the VenueFeed interface and all time reads through WatchClock, so tests are
 * fully deterministic (MutableClock + ScriptedFeed below) and a production
 * wiring can substitute a live feed without changing the watcher.
 */

import { createHash } from "node:crypto";

export interface TradePrint {
  /** Venue timestamp of the print, ms epoch (e.g. Binance aggTrades T). */
  ts: number;
  price: number;
  /** Venue label, e.g. "binance-spot" / "consolidated-tape". */
  venue: string;
  /**
   * The VENUE-ASSIGNED trade id, preserved VERBATIM end to end
   * (feed -> checkpoint -> contract -> alert evidence). For Binance
   * aggTrades this is the aggregate trade id `a` (stringified).
   *
   * This field is required and NEVER synthesized: a print without a
   * venue-assigned id cannot establish first-print identity, and the
   * handler fails closed on such prints (never fabricates an id from
   * ts/price/venue to paper over a venue data gap).
   */
  venueTradeId: string;
  /**
   * The venue's OWN monotonic ordering field (for Binance aggTrades the
   * aggregate trade id `a`, which is strictly increasing in venue
   * execution order). Same-timestamp ordering resolves by venueSeq —
   * never by price, never by arrival order.
   */
  venueSeq: number;
}

/**
 * History-coverage evidence for one latestPrints(sinceTs) batch.
 *
 * The issuance handler's first-print rule must establish the first eligible
 * print's IDENTITY over the full decision→observation interval — not merely
 * "the first print the fetch returned". A fetch that returns N prints proves
 * nothing about prints it did not serve: the venue's served history may
 * start after the decision instant, or a gap may hide the true first print.
 * The feed's ADAPTER therefore binds coverage evidence to the actual batch
 * it just served, and the handler fails closed
 * (non-entry:first-print-unverifiable) on absent or insufficient evidence.
 *
 * The honest claim is "adapter-established coverage under documented
 * endpoint assumptions" — NOT "venue-attested proof". The handler proves it
 * CHECKED coverage against evidence bound to the real response; it cannot
 * prove the venue is honest, and a feed that fabricates evidence defeats the
 * check the same way a feed that fabricates prints defeats the entry rule.
 * Each adapter documents its endpoint assumptions next to its
 * implementation (BinanceVenueFeed in pilot/src/binance.ts; the scripted
 * sandbox venue below).
 */
export interface HistoryCoverage {
  /**
   * Earliest instant (ms epoch) of continuous, complete venue-history
   * coverage ending at (and including) the batch just served. The adapter
   * establishes: every print with ts in [historyStartMs, receiptMs] that was
   * observable at receipt was served in this batch — no gaps, no silent
   * truncation inside that span. historyStartMs > sinceTs means the
   * interval (sinceTs, historyStartMs) is NOT covered: the venue's served
   * history begins after the requested instant.
   */
  historyStartMs: number;
  /**
   * Venue label this evidence was produced for — bound to the actual served
   * prints' venue (the handler's entry rule accepts only its known labels).
   */
  venue?: string;
  /** Symbol/market this evidence was produced for. */
  symbol?: string;
  /**
   * The request window this evidence covers: sinceTs (the request's start
   * bound — the same sinceTs passed to latestPrints) → toTs (the end of the
   * served batch, i.e. the greatest served print ts, or sinceTs when the
   * batch is empty).
   */
  requestedRange?: { sinceTs: number; toTs: number };
  /**
   * ms epoch at which the raw response was received (the observability
   * instant for this batch).
   */
  receiptMs?: number;
  /**
   * sha256 (hex) of the RAW response bytes that produced the served batch —
   * the cryptographic binding between the coverage claim and the response
   * it describes. The hash is computed over the response exactly as
   * received, before any parsing, filtering, or mapping.
   */
  rawResponseHash?: string;
  /**
   * Pagination/completeness limits of the request that produced the batch:
   * the maximum results the endpoint returns per request, and whether the
   * request exhausted the interval (fewer results returned than the cap —
   * no further pages needed) or hit the cap (tail may be truncated; the
   * head — what the first-print rule needs — is complete from sinceTs).
   */
  pagination?: { maxResultsPerRequest: number; paginationExhausted: boolean };
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
  /**
   * OPTIONAL history-coverage evidence for the batch just served by
   * latestPrints(sinceTs) — call with the same sinceTs; the evidence
   * describes that batch, bound to the actual response fields (venue,
   * symbol, requested range, receipt timestamp, raw-response hash,
   * pagination/completeness limits).
   *
   * Absent = the feed cannot establish coverage. The issuance handler treats
   * absent or insufficient evidence as non-entry:first-print-unverifiable
   * (fail closed): without proven coverage over the full interval, the
   * first eligible print's identity cannot be established and no entry is
   * taken. A feed that IS the venue (scripted sandbox feeds) establishes
   * complete coverage; a live feed establishes what its adapter bound to
   * the response it actually served.
   */
  historyCoverage?(sinceTs: number): HistoryCoverage | Promise<HistoryCoverage>;
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
  /**
   * The most recent latestPrints batch, bound by the sinceTs that produced
   * it — historyCoverage(sinceTs) binds its evidence to THIS batch's actual
   * served content, never to a fresh or invented one.
   */
  private lastServed: {
    sinceTs: number;
    prints: TradePrint[];
    receiptMs: number;
  } | null = null;

  constructor(
    private readonly prints: ScriptedPrint[],
    private readonly clock: WatchClock,
    private readonly opts: { symbol?: string } = {},
  ) {}

  latestPrints(sinceTs: number): TradePrint[] {
    const now = this.clock.nowMs();
    const served = this.prints
      .filter((p) => p.ts > sinceTs && now >= p.availableAt)
      .sort((a, b) => a.ts - b.ts)
      // Preserve the venue-assigned trade id and venue sequence verbatim:
      // the sandbox feed must not strip identity fields the way the
      // pre-v2.1.9 map did ({ ts, price, venue } only).
      .map(({ ts, price, venue, venueTradeId, venueSeq }) => ({ ts, price, venue, venueTradeId, venueSeq }));
    this.lastServed = { sinceTs, prints: served, receiptMs: now };
    return served;
  }

  /**
   * Coverage evidence: the script IS the venue in the sandbox — the
   * scripted prints are the complete venue history by construction, so
   * coverage is complete from the beginning of time. latestPrints already
   * enforces the observability contract (availableAt) on top of that
   * complete history: unserved prints are unobservable, never "missing".
   *
   * The evidence is bound to the batch last served by latestPrints: venue
   * and symbol label the actual served prints, requestedRange spans the
   * request's sinceTs to the served batch's end, receiptMs is the clock at
   * service time, rawResponseHash is the sha256 of the serialized served
   * batch (the script's "raw response"), and pagination records that the
   * scripted venue serves its whole script per poll with no pagination.
   *
   * Called with a sinceTs that does not match the last served batch, the
   * adapter has no batch to bind evidence to and throws — the handler fails
   * closed downstream (non-entry:first-print-unverifiable) rather than
   * accepting unbound evidence.
   */
  historyCoverage(sinceTs: number): HistoryCoverage {
    const batch = this.lastServed;
    if (!batch || batch.sinceTs !== sinceTs) {
      throw new Error(
        `ScriptedFeed: no served batch bound to sinceTs ${sinceTs} — ` +
        `historyCoverage must follow the matching latestPrints call`,
      );
    }
    const rawText = JSON.stringify(batch.prints);
    const maxTs = batch.prints.length > 0 ? Math.max(...batch.prints.map((p) => p.ts)) : sinceTs;
    return {
      historyStartMs: Number.NEGATIVE_INFINITY,
      venue: batch.prints[0]?.venue ?? this.prints[0]?.venue ?? "scripted-venue",
      symbol: this.opts.symbol ?? "SCRIPTED",
      requestedRange: { sinceTs, toTs: maxTs },
      receiptMs: batch.receiptMs,
      rawResponseHash: createHash("sha256").update(rawText, "utf8").digest("hex"),
      pagination: { maxResultsPerRequest: this.prints.length, paginationExhausted: true },
    };
  }
}
