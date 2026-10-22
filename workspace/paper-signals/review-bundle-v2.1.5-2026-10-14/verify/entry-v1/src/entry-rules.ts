/**
 * actionable-entry-v1 — per-terminal entry rule engines (sandbox).
 *
 * Equity: `next-xnys-regular-session-open-print` (ENTRY-SEMANTICS.md §1).
 * Crypto: `first-post-decision-binance-spot-trade` (ENTRY-SEMANTICS.md §2).
 *
 * The five items ENTRY-SEMANTICS.md §6 flags as ungrounded are EXPLICIT
 * PARAMETERS here (UngroundedParams) — never hidden constants. Tuning any
 * of them requires a new contract version per the versioning rule.
 */

import {
  ActionableEntryContract,
  ContractError,
  ENTRY_REJECTION_REASON,
  EntryObservation,
  assertIsoUtc,
  buildContract,
  enterContract,
  voidContract,
} from "./contract.js";

// ---------------------------------------------------------------------------
// Ungrounded-but-explicit parameters (§6 of the spec)
// ---------------------------------------------------------------------------

export interface UngroundedParams {
  /** §6.1 — equity drift cap %. Anchored to risk-unit math, not measured fills. */
  equityDriftCapPct: number;
  /** §6.1 — crypto drift cap %. Same caveat. */
  cryptoDriftCapPct: number;
  /** §6.2 — crypto entry window length in minutes. Fast-input decay is assumed, not measured. */
  cryptoEntryWindowMinutes: number;
  /**
   * §6.3 — primary entry clock venue. Binance Spot is the MEASUREMENT clock;
   * the contract does not claim Logan trades there (jurisdiction unresolved).
   */
  cryptoPrimaryVenue: string;
  /** §6.4 — equity after-hours exclusion (measurement choice, not a broker claim). */
  equityAfterHoursExcluded: boolean;
  /**
   * §6.5 — maximum observation age of an entry print (ms). A print is
   * actionable only if receiptMs − print.ts ≤ this bound. Justification:
   * the entry rule demands the FIRST post-decision print observed LIVE; the
   * observation loop's poll cadence is enforced strictly finer than the
   * entry window (correction 4), so a live observer sees a fresh print
   * within a fraction of the window. A print older than a third of the
   * crypto entry window (15 min / 3 = 5 min) at receipt time means the
   * observer missed it across many polls — it is historical reconstruction,
   * not an actionable entry, and the paper fill at that price is no longer
   * credible. Prints older than this bound are SKIPPED (never entered).
   * The bound is deliberately looser than a single poll interval: feed
   * latency and backfill jitter are expected; multi-poll blindness is not.
   */
  maxObservationAgeMs: number;
}

export const DEFAULT_UNGROUNDED_PARAMS: UngroundedParams = {
  equityDriftCapPct: 0.5,
  cryptoDriftCapPct: 1.5,
  cryptoEntryWindowMinutes: 15,
  cryptoPrimaryVenue: "binance-spot",
  equityAfterHoursExcluded: true,
  maxObservationAgeMs: 5 * 60_000, // 15-min crypto window / 3 (see §6.5)
};

/**
 * §6.6 — explicit venue mapping: contract entryVenue → accepted print venue
 * labels. A TradePrint's `venue` label must be in the accepted set for the
 * contract's entryVenue, or the print is SKIPPED (never entered). This is
 * the anti-cross-venue rule: an entry observed on the wrong venue is not the
 * contract's entry, even if the price is inside the drift cap.
 *
 * Rationale for each row:
 * - "primary-listing-consolidated-tape" (equity): the consolidated tape is
 *   the measurement venue; fixtures and the equity contract both label its
 *   prints "consolidated-tape".
 * - "binance-spot" (crypto): the measurement clock is Binance Spot
 *   aggTrades; only prints labeled "binance-spot" qualify.
 * Unknown entryVenue values fall back to exact-label match (fail-closed
 * against unlisted venues).
 */
export const ENTRY_VENUE_ACCEPTED_PRINT_LABELS: Record<string, readonly string[]> = {
  "primary-listing-consolidated-tape": ["consolidated-tape", "primary-listing-consolidated-tape"],
  "binance-spot": ["binance-spot"],
};

export function acceptedPrintVenues(entryVenue: string): readonly string[] {
  return ENTRY_VENUE_ACCEPTED_PRINT_LABELS[entryVenue] ?? [entryVenue];
}

// ---------------------------------------------------------------------------
// Time helpers (America/New_York session math, no external deps)
// ---------------------------------------------------------------------------

/** US DST: second Sunday of March through first Sunday of November. */
function isEasternDst(year: number, month: number, day: number): boolean {
  // month: 1-12
  const secondSundayMarch = nthWeekdayOfMonth(year, 3, 0, 2);
  const firstSundayNovember = nthWeekdayOfMonth(year, 11, 0, 1);
  const d = year * 10000 + month * 100 + day;
  return d >= secondSundayMarch && d < firstSundayNovember;
}

function nthWeekdayOfMonth(year: number, month: number, weekday: number, n: number): number {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return year * 10000 + month * 100 + (1 + offset + (n - 1) * 7);
}

/** Offset of America/New_York from UTC in minutes (positive east). */
export function easternOffsetMinutes(year: number, month: number, day: number): number {
  return isEasternDst(year, month, day) ? -240 : -300; // EDT = UTC-4, EST = UTC-5
}

/** "YYYY-MM-DD" of a Date in America/New_York. */
export function etDateString(ms: number): string {
  const approx = new Date(ms);
  const y = approx.getUTCFullYear();
  const m = approx.getUTCMonth() + 1;
  const d = approx.getUTCDate();
  const off = easternOffsetMinutes(y, m, d);
  const s = new Date(ms + off * 60_000);
  return (
    String(s.getUTCFullYear()).padStart(4, "0") +
    "-" +
    String(s.getUTCMonth() + 1).padStart(2, "0") +
    "-" +
    String(s.getUTCDate()).padStart(2, "0")
  );
}

/** ET wall-clock for a date string + HH:MM, returned as a UTC ISO instant. */
export function etWallToUtcIso(dateStr: string, hhmm: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  const offMin = easternOffsetMinutes(y, m, d);
  const utcMs = Date.UTC(y, m - 1, d, hh, mm) - offMin * 60_000;
  return new Date(utcMs).toISOString();
}

export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) + n * 86_400_000);
  return (
    String(t.getUTCFullYear()).padStart(4, "0") +
    "-" +
    String(t.getUTCMonth() + 1).padStart(2, "0") +
    "-" +
    String(t.getUTCDate()).padStart(2, "0")
  );
}

// ---------------------------------------------------------------------------
// XNYS session calendar (sandbox test calendar, 2025–2027)
// ---------------------------------------------------------------------------

/**
 * Sandbox calendar: weekends + listed US market holidays/early closes.
 * NOT authoritative — production must use the validated 2025–2027 XNYS
 * calendar (isXnysSession, measurement.ts:78-83). Any date outside
 * 2025–2027 throws; the engine refuses to guess.
 */
const XNYS_HOLIDAYS = new Set([
  // 2025
  "2025-01-01", "2025-01-09", "2025-01-20", "2025-02-17", "2025-04-18",
  "2025-05-26", "2025-06-19", "2025-07-04", "2025-09-01", "2025-11-27",
  "2025-12-25",
  // 2026
  "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25",
  "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
  // 2027
  "2027-01-01", "2027-01-18", "2027-02-15", "2027-04-02", "2027-05-31",
  "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
]);

/** 13:00 ET closes (day after Thanksgiving, Christmas Eve, July 3rd). */
const XNYS_EARLY_CLOSES = new Set([
  "2025-11-28", "2025-12-24",
  "2026-11-27", "2026-12-24",
  "2027-11-26", "2027-12-24",
]);

export function isXnysSession(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new ContractError(`bad date string: ${dateStr}`);
  }
  const year = Number(dateStr.slice(0, 4));
  if (year < 2025 || year > 2027) {
    throw new ContractError(
      `sandbox calendar covers 2025–2027 only; refusing to guess for ${dateStr}`,
    );
  }
  const [y, m, d] = dateStr.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  if (dow === 0 || dow === 6) return false;
  return !XNYS_HOLIDAYS.has(dateStr);
}

/** Session bounds as UTC ISO instants. Early-close days end 13:00 ET. */
export function xnysSessionBounds(dateStr: string): { start: string; end: string; earlyClose: boolean } {
  if (!isXnysSession(dateStr)) {
    throw new ContractError(`${dateStr} is not an XNYS session`);
  }
  const earlyClose = XNYS_EARLY_CLOSES.has(dateStr);
  return {
    start: etWallToUtcIso(dateStr, "09:30"),
    end: etWallToUtcIso(dateStr, earlyClose ? "13:00" : "16:00"),
    earlyClose,
  };
}

/** Next XNYS session strictly after the given date string. */
export function nextXnysSession(dateStr: string): string {
  let d = addDays(dateStr, 1);
  for (let i = 0; i < 14; i++) {
    if (isXnysSession(d)) return d;
    d = addDays(d, 1);
  }
  throw new ContractError(`no XNYS session found within 14 days after ${dateStr}`);
}

// ---------------------------------------------------------------------------
// EQUITY — next-xnys-regular-session-open-print
// ---------------------------------------------------------------------------

export interface EquityIssuanceInput {
  signalId: string | number;
  strategyId: string;
  strategyVersion: string;
  parameterHash: string;
  /** Signal date (the closed session), "YYYY-MM-DD" in ET. */
  signalDate: string;
  decisionPrice: number; // completed adjusted close
  invalidationPrice: number;
  target1Price: number | null;
  target2Price: number | null;
  riskPerUnit: number;
  issuedBy: string;
  issuedAt: string;
  /**
   * Correction 3: the ACTUAL instant the qualification/issuance logic ran.
   * Optional for backward compatibility; when omitted, decisionAt falls back
   * to the session-bounds end (the information cutoff). A late-running scan
   * must pass its own run time here — decisionAt is NEVER backdated to the
   * bar close. When provided it must be >= session end (the completed close
   * must exist before it can be decided on) and < the next session open
   * (the decision must precede any entry print).
   */
  decisionAt?: string;
  params?: UngroundedParams;
}

/**
 * Issue an equity actionable-entry-v1 contract.
 * decisionAt defaults to session-bounds END (13:00 ET on early-close days —
 * the §1.1 fix), never hardcoded 16:00; a caller-supplied decisionAt records
 * the actual decision instant instead (correction 3).
 */
export function issueEquityEntryContract(input: EquityIssuanceInput) {
  const params = input.params ?? DEFAULT_UNGROUNDED_PARAMS;
  if (!isXnysSession(input.signalDate)) {
    throw new ContractError(`signalDate ${input.signalDate} is not an XNYS session`);
  }
  const session = xnysSessionBounds(input.signalDate);
  const nextSession = nextXnysSession(input.signalDate);
  const nextBounds = xnysSessionBounds(nextSession);

  // Correction 3: sourceObservedAt is the source bar's close (the information
  // cutoff); decisionAt is the actual instant the strategy decided.
  let decisionAt = session.end; // §1.1: session-bounds end, unconditionally
  if (input.decisionAt !== undefined) {
    assertIsoUtc("decisionAt", input.decisionAt);
    const decidedMs = Date.parse(input.decisionAt);
    const sessionEndMs = Date.parse(session.end);
    const windowOpensMs = Date.parse(nextBounds.start);
    if (decidedMs < sessionEndMs) {
      throw new ContractError(
        `decisionAt ${input.decisionAt} precedes the session close ${session.end} — the completed close must exist before the decision`,
        "decision-before-bar-close",
      );
    }
    if (decidedMs >= windowOpensMs) {
      throw new ContractError(
        `decisionAt ${input.decisionAt} is not before the entry window opens ${nextBounds.start} — the decision must precede any entry print`,
        "decision-after-entry-window-open",
      );
    }
    decisionAt = input.decisionAt;
  }

  const contract = buildContract({
    terminal: "equity",
    signalId: input.signalId,
    strategyId: input.strategyId,
    strategyVersion: input.strategyVersion,
    parameterHash: input.parameterHash,
    decisionAt,
    decisionClock: "xnys-session-close",
    decisionPrice: input.decisionPrice,
    sourceObservedAt: session.end, // crystallized at the close (§1.2)
    sourceObservationWindow: { start: session.start, end: session.end },
    entryRule: "next-xnys-regular-session-open-print",
    entryVenue: "primary-listing-consolidated-tape",
    entryWindowOpensAt: nextBounds.start, // 09:30 ET next session
    entryWindowExpiresAt: nextBounds.end, // session close (13:00 early-close)
    invalidationPrice: input.invalidationPrice,
    target1Price: input.target1Price,
    target2Price: input.target2Price,
    riskPerUnit: input.riskPerUnit,
    horizonUnit: "trading_sessions",
    primaryHorizon: 30,
    evaluatorCompatibility:
      "entryRule does not match /research reference|not claimed/i; " +
      "entry stamped at the 09:30:00.000 session-open boundary is not inside " +
      "the session (entryMs > start is false at equality), so the " +
      "entry_session_path_unobserved check passes",
    issuedBy: input.issuedBy,
    issuedAt: input.issuedAt,
    driftCapPct: params.equityDriftCapPct,
  });
  return { contract, nextSession };
}

/**
 * Resolve an equity entry from the next session's consolidated-tape opening
 * print. Extended-hours prints are rejected when equityAfterHoursExcluded.
 */
export function resolveEquityEntry(
  contract: ReturnType<typeof buildContract>,
  openPrint: {
    price: number;
    /** Venue timestamp of the print; must equal the 09:30:00.000 session open. */
    observedAt: string;
    receivedAt: string;
    extendedHours: boolean;
  },
  params: UngroundedParams = DEFAULT_UNGROUNDED_PARAMS,
) {
  if (params.equityAfterHoursExcluded && openPrint.extendedHours) {
    return voidContract(contract, {
      entryState: "void_no_quote",
      voidReason:
        "open print flagged extended-hours; regular-session prints only (§1.3 after-hours exclusion)",
    });
  }
  if (openPrint.observedAt !== contract.entryWindowOpensAt) {
    return voidContract(contract, {
      entryState: "void_no_quote",
      voidReason: `open print timestamp ${openPrint.observedAt} != session-open instant ${contract.entryWindowOpensAt}`,
    });
  }
  const drift = ((openPrint.price - contract.decisionPrice) / contract.decisionPrice) * 100;
  if (Math.abs(drift) > contract.driftCapPct) {
    return voidContract(contract, {
      entryState: "void_drift",
      voidReason: `open-print drift ${drift.toFixed(4)}% exceeds cap ${contract.driftCapPct}%`,
      driftedPrice: openPrint.price,
    });
  }
  const obs: EntryObservation = {
    entryObservedAt: openPrint.observedAt,
    entryReceivedAt: openPrint.receivedAt,
    entryPrice: openPrint.price,
    evidence: "venue-trade", // consolidated-tape opening-auction print
  };
  return enterContract(contract, obs);
}

// ---------------------------------------------------------------------------
// CRYPTO — first-post-decision-binance-spot-trade
// ---------------------------------------------------------------------------

export interface CryptoIssuanceInput {
  signalId: string | number;
  strategyId: string;
  strategyVersion: string;
  parameterHash: string;
  /**
   * Server wall clock UTC at draft finalization (before the quote fetch).
   * Correction 3: this is the ACTUAL decision instant — a late-running scan
   * passes its own run time here, never the source bar's close (which is
   * recorded separately as decisionSourceObservedAt).
   */
  decisionAt: string;
  decisionPrice: number; // draft.entry — decision-time levels basis
  /** Provider observation instant for the decision inputs, if captured. */
  decisionSourceObservedAt: string | null;
  invalidationPrice: number;
  target1Price: number | null;
  target2Price: number | null;
  riskPerUnit: number;
  issuedBy: string;
  issuedAt: string;
  params?: UngroundedParams;
}

export function issueCryptoEntryContract(input: CryptoIssuanceInput) {
  const params = input.params ?? DEFAULT_UNGROUNDED_PARAMS;
  const decisionMs = Date.parse(input.decisionAt);
  if (Number.isNaN(decisionMs)) throw new ContractError(`bad decisionAt: ${input.decisionAt}`);
  const expiresMs = decisionMs + params.cryptoEntryWindowMinutes * 60_000;
  return buildContract({
    terminal: "crypto",
    signalId: input.signalId,
    strategyId: input.strategyId,
    strategyVersion: input.strategyVersion,
    parameterHash: input.parameterHash,
    decisionAt: input.decisionAt,
    decisionClock: "server-utc",
    decisionPrice: input.decisionPrice,
    sourceObservedAt: input.decisionSourceObservedAt,
    sourceObservationWindow: null, // 24/7 — point observations (§2.2)
    entryRule: "first-post-decision-binance-spot-trade",
    entryVenue: params.cryptoPrimaryVenue,
    entryWindowOpensAt: input.decisionAt,
    entryWindowExpiresAt: new Date(expiresMs).toISOString(),
    invalidationPrice: input.invalidationPrice,
    target1Price: input.target1Price,
    target2Price: input.target2Price,
    riskPerUnit: input.riskPerUnit,
    horizonUnit: "elapsed_days",
    primaryHorizon: 30,
    evaluatorCompatibility:
      "venue-stamped entry (Binance T >= decisionAt); legacy receipt-time " +
      "evaluator continues to grade legacy rows unchanged",
    issuedBy: input.issuedBy,
    issuedAt: input.issuedAt,
    driftCapPct: params.cryptoDriftCapPct,
  });
}

export interface VenueTrade {
  /** Trade price on the primary venue. */
  price: number;
  /** Venue timestamp T in ms (Binance server clock, aggTrades T). */
  venueTimeMs: number;
  /** Server receipt time ISO for the trade observation. */
  receivedAt: string;
}

/**
 * Primary path: pick the FIRST venue trade with T >= decisionAt inside the
 * 15-minute window. Trades with T < decisionAt are pre-decision and ignored;
 * the contract requires the VENUE timestamp >= decisionAt, not just receipt.
 */
export function resolveCryptoEntry(
  contract: ReturnType<typeof buildContract>,
  trades: VenueTrade[],
  params: UngroundedParams = DEFAULT_UNGROUNDED_PARAMS,
) {
  void params;
  const decisionMs = Date.parse(contract.decisionAt);
  const expiresMs = Date.parse(contract.entryWindowExpiresAt);
  const eligible = trades
    .filter((t) => t.venueTimeMs >= decisionMs && t.venueTimeMs <= expiresMs)
    .sort((a, b) => a.venueTimeMs - b.venueTimeMs);

  if (eligible.length === 0) {
    return voidContract(contract, {
      entryState: "void_expired",
      voidReason: `no ${contract.entryVenue} trade with venue timestamp in [decisionAt, decisionAt+window] before ${contract.entryWindowExpiresAt}`,
    });
  }
  const first = eligible[0];
  const drift = ((first.price - contract.decisionPrice) / contract.decisionPrice) * 100;
  if (Math.abs(drift) > contract.driftCapPct) {
    return voidContract(contract, {
      entryState: "void_drift",
      voidReason: `first post-decision print drift ${drift.toFixed(4)}% exceeds cap ${contract.driftCapPct}%`,
      driftedPrice: first.price,
    });
  }
  const obs: EntryObservation = {
    entryObservedAt: new Date(first.venueTimeMs).toISOString(),
    entryReceivedAt: first.receivedAt,
    entryPrice: first.price,
    evidence: "venue-trade", // Binance Spot trade print on the venue's own clock
  };
  return enterContract(contract, obs);
}

/**
 * Degraded path (CoinGecko fallback): no venue timestamp available.
 * Records providerObservedAt = last_updated when present, flags
 * observation_degraded, and grades on receipt semantics. A null observation
 * is still an explicit null with a staleness bound — never a fabricated T.
 */
export function resolveCryptoEntryDegraded(
  contract: ReturnType<typeof buildContract>,
  quote: {
    price: number;
    /** Row's last_updated, or null when the provider gives none. */
    lastUpdated: string | null;
    receivedAt: string;
  },
) {
  const receivedMs = Date.parse(quote.receivedAt);
  const decisionMs = Date.parse(contract.decisionAt);
  const expiresMs = Date.parse(contract.entryWindowExpiresAt);
  if (receivedMs < decisionMs) {
    throw new ContractError(
      `degraded quote received before decisionAt — violates ordering`,
      ENTRY_REJECTION_REASON.entryBeforeDecision,
    );
  }
  const stalenessBoundMs = receivedMs - decisionMs;
  if (receivedMs > expiresMs) {
    return voidContract(contract, {
      entryState: "void_expired",
      voidReason: `degraded quote received ${quote.receivedAt}, outside entry window (staleness bound ${(stalenessBoundMs / 60000).toFixed(2)} min)`,
    });
  }
  const drift = ((quote.price - contract.decisionPrice) / contract.decisionPrice) * 100;
  if (Math.abs(drift) > contract.driftCapPct) {
    return voidContract(contract, {
      entryState: "void_drift",
      voidReason: `degraded quote drift ${drift.toFixed(4)}% exceeds cap ${contract.driftCapPct}%`,
      driftedPrice: quote.price,
    });
  }
  const entered = enterContract(contract, {
    // No venue timestamp exists on this path: entryObservedAt records the
    // provider's last_updated (or receipt time when the provider gives none),
    // and observationDegraded flags the degraded basis explicitly.
    entryObservedAt: quote.lastUpdated ?? quote.receivedAt,
    entryReceivedAt: quote.receivedAt,
    entryPrice: quote.price,
    evidence: "cost-adjusted-quote",
  });
  return {
    ...entered,
    observationDegraded: true,
    entryEvidenceReason: `degraded path: no venue timestamp; staleness bound ${(stalenessBoundMs / 60000).toFixed(2)} min from receipt`,
  } as typeof entered;
}
