/**
 * VETO-1 — post-decision veto evidence contract (2026-10-15, revised per
 * Logan's 2026-10-15 item-6 acceptance additions).
 *
 * Corrected born-dead semantics: only post-decision price action may veto.
 * Pre-decision extremes are context, never vetoes.
 *
 * Evidence contract (binding): every price value offered as veto evidence must
 * carry all three fields —
 *   (a) provider observation time (when the provider observed the price),
 *   (b) receipt time (when we received it),
 *   (c) venue identity (which venue/provider the price came from).
 * Any one missing -> the value is unusable for the veto. In particular:
 * receipt-after-decision does NOT prove the quote was observed after decision.
 * The quote shortcut (treating an issuance-time quote as post-decision evidence
 * by construction of its receipt time) is explicitly forbidden.
 *
 * Logan's acceptance additions (item 6):
 *   (a) Interval boundaries are explicit on every veto observation: every
 *       OHLC-derived value carries its full [intervalStart, intervalEnd)
 *       observation window; a point quote carries [observedAt, observedAt].
 *   (b) Coverage/gap accounting exists: the coverage report lists which
 *       intervals were covered AND which ranges are missing (gaps), not just
 *       a pass/unknown verdict.
 *   (c) A candle straddling the decision time or the entry time is treated as
 *       UNKNOWN for that boundary — explicitly recorded as UNKNOWN-side,
 *       never silently assigned to the pre or post side.
 *
 * Two separate validations, never merged:
 *   1. current-price validation — is price beyond invalidation NOW? Uses only
 *      admitted evidence with observedAt >= decisionAt. A current quote
 *      establishes present state only; it CANNOT establish that no
 *      invalidation occurred during the waiting interval.
 *   2. interval-coverage validation — do provider intervals tile the whole
 *      waiting interval [decisionAt, now)? Any gap, missing interval, or fetch
 *      failure -> coverage is UNKNOWN, never "pass".
 *
 * Issuance requires BOTH = pass. UNKNOWN is a distinct terminal status and
 * fails closed (no issuance, explicit UNKNOWN suppression reason). A
 * documented post-decision breach still yields "fail" (fail-closed either
 * way; the label tells the truth) — absence of evidence is not evidence of
 * absence, but presence of breach evidence is definitive.
 *
 * This module is dependency-free so the decision logic is unit-testable in
 * isolation. It is imported by server/src/actions.ts (the deployed paper path).
 */

export const VETO_SEMANTICS = "post-decision-only v2026-10-15";
export const BORN_DEAD_REASON_PREFIX = "born-dead";
export const VETO_QUOTE_VENUE = "coingecko-markets";
export const VETO_OHLC_VENUE = "coingecko-ohlc-4h";

export type VetoStatus = "pass" | "unknown" | "fail";
export type CoverageStatus = "pass" | "unknown";

/** A single price offered as veto evidence. All three contract fields required. */
export type VetoQuote = {
  price: number;
  observedAt: string | null; // (a) provider observation time — NOT receipt time
  receivedAt: string; // (b) receipt time
  venue: string; // (c) venue identity
};

/** One raw provider OHLC interval (ISO boundaries — explicit per Logan (a)). */
export type VetoInterval = {
  start: string;
  end: string;
  high: number;
  low: number;
  observationId?: string;
  venue?: string;
  eventTime?: string;
  receivedAt?: string;
};

/** A candle straddling a boundary: UNKNOWN side, never assigned (Logan (c)). */
export type StraddlingInterval = VetoInterval & {
  straddles: "decision" | "entry";
  note: string;
};

/** Coverage/gap accounting (Logan (b)): which intervals were covered, which ranges are missing. */
export type CoverageReport = {
  status: CoverageStatus;
  covered: Array<{ start: string; end: string }>;
  gaps: Array<{ start: string; end: string }>;
};

/** Folded post-decision slice from provider OHLC intervals. */
export type PostDecisionSlice = {
  intervals: VetoInterval[]; // raw intervals with start >= decisionAt
  straddlingDecision: VetoInterval[]; // start < decisionAt < end — UNKNOWN side, excluded from the fold
  receivedAt: string; // (b) receipt time of the underlying payload
  venue: string; // (c) venue identity
  intervalCount: number;
  coverage: CoverageReport;
  windowStart: string; // ISO start of the waiting interval that was coverage-checked
  windowEnd: string; // ISO end of the waiting interval that was coverage-checked
};

/** Minimal shape of the pre-decision day candle (context only, never a veto). */
export type ContextCandleLike = {
  day: string;
  high: number | null;
  low: number | null;
  highAt: string | null;
  lowAt: string | null;
} | null;

/** One admitted evidence value with explicit [start, end) boundaries (Logan (a)). */
export type VetoEvidence = {
  value: number;
  intervalStart: string;
  intervalEnd: string;
  venue: string;
};

export type QuoteAdmission = { admitted: boolean; price: number | null; reason: string | null };

export type VetoResult = {
  publish: boolean;
  status: VetoStatus; // combined: issuance requires pass
  currentPriceStatus: VetoStatus; // validation 1, independent
  intervalCoverageStatus: CoverageStatus; // validation 2, independent
  reason: string | null;
  quoteAdmission: QuoteAdmission;
  admittedHighs: VetoEvidence[];
  admittedLows: VetoEvidence[];
  foldedHigh: VetoEvidence | null; // extreme actually used, with explicit boundaries
  foldedLow: VetoEvidence | null;
  admissibleIntervalCount: number;
  straddlingDecision: StraddlingInterval[]; // explicitly UNKNOWN-side, never assigned
  straddlingEntry: StraddlingInterval[]; // explicitly UNKNOWN-side, never assigned
};

/**
 * Evidence admission: a quote is usable as veto evidence ONLY when all three
 * contract fields are present and observedAt >= decisionMs. Receipt time alone
 * is never accepted as observation time.
 */
export function admitVetoQuote(quote: VetoQuote | null, decisionMs: number): QuoteAdmission {
  const decisionIso = new Date(decisionMs).toISOString();
  if (!quote) return { admitted: false, price: null, reason: "no quote supplied as veto evidence" };
  if (!Number.isFinite(quote.price))
    return { admitted: false, price: null, reason: `quote excluded from veto: price is not finite (receivedAt ${quote.receivedAt}, venue ${quote.venue})` };
  if (quote.observedAt === null || !Number.isFinite(Date.parse(quote.observedAt)))
    return {
      admitted: false,
      price: null,
      reason: `quote excluded from veto: provider observation time missing — receipt time ${quote.receivedAt} is not observation time (venue ${quote.venue})`,
    };
  if (Date.parse(quote.observedAt) < decisionMs)
    return {
      admitted: false,
      price: null,
      reason: `quote excluded from veto: provider observation time ${quote.observedAt} precedes decision ${decisionIso} (venue ${quote.venue})`,
    };
  return { admitted: true, price: quote.price, reason: null };
}

/**
 * Interval-coverage validation with full gap accounting (Logan (b)): do the
 * provider intervals' observation windows tile the whole waiting interval
 * [decisionMs, nowMs)? Returns which intervals were covered and exactly which
 * ranges are missing. Any gap, missing interval, or empty collection over a
 * non-degenerate window -> status "unknown", never "pass". A degenerate window
 * (nowMs <= decisionMs) has no waiting interval to cover and passes vacuously
 * when the fetch succeeded.
 */
export function checkIntervalCoverage(
  covering: ReadonlyArray<{ start: number; end: number }>,
  decisionMs: number,
  nowMs: number,
): CoverageReport {
  const iso = (ms: number) => new Date(ms).toISOString();
  if (!Number.isFinite(decisionMs) || !Number.isFinite(nowMs))
    return { status: "unknown", covered: [], gaps: [] };
  const sorted = [...covering]
    .filter((iv) => Number.isFinite(iv.start) && Number.isFinite(iv.end) && iv.end > iv.start)
    .sort((a, b) => a.start - b.start);
  const covered = sorted.map((iv) => ({ start: iso(iv.start), end: iso(iv.end) }));
  if (nowMs <= decisionMs) return { status: "pass", covered, gaps: [] };
  const gaps: Array<{ start: string; end: string }> = [];
  if (sorted.length === 0) {
    gaps.push({ start: iso(decisionMs), end: iso(nowMs) });
  } else {
    if (sorted[0]!.start > decisionMs) gaps.push({ start: iso(decisionMs), end: iso(sorted[0]!.start) });
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i]!.start > sorted[i - 1]!.end)
        gaps.push({ start: iso(sorted[i - 1]!.end), end: iso(sorted[i]!.start) });
    }
    if (sorted[sorted.length - 1]!.end < nowMs)
      gaps.push({ start: iso(sorted[sorted.length - 1]!.end), end: iso(nowMs) });
  }
  return { status: gaps.length === 0 ? "pass" : "unknown", covered, gaps };
}

function straddleNote(which: "decision" | "entry", boundaryIso: string): string {
  return `candle straddles the ${which} time ${boundaryIso} — the extreme cannot be attributed to either side: UNKNOWN, excluded from the veto comparison, never silently assigned`;
}

/**
 * Corrected born-dead veto. The whole-day high/low comparison is gone as a
 * veto; the pre-decision candle appears in the reason string as labeled
 * context only. Missing or inadmissible post-decision evidence -> "unknown"
 * (fail-closed). Incomplete interval coverage -> "unknown", never "pass" —
 * a fresh quote cannot paper over a gap in coverage. A documented
 * post-decision breach -> "fail" even when coverage is unknown (fail-closed
 * either way; presence of breach evidence is definitive).
 *
 * entryTimeMs bounds the veto window to [decisionMs, entryTimeMs]: an
 * interval straddling the entry time is UNKNOWN-side for the entry boundary
 * (Logan (c)) and excluded from the comparison. Defaults to decisionMs,
 * which disables the entry distinction (the full post-decision set is
 * admissible); the admissible quote then establishes current state.
 */
export function evaluateBornDead(
  direction: "long" | "short",
  invalidation: number,
  veto: {
    postDecision: PostDecisionSlice | null;
    quote: VetoQuote | null;
    contextCandle: ContextCandleLike;
  },
  decisionMs: number,
  entryTimeMs: number = decisionMs,
): VetoResult {
  const decisionIso = new Date(decisionMs).toISOString();
  // The entry boundary only constrains when a real entry time is supplied;
  // otherwise the whole post-decision set stays admissible.
  const E = entryTimeMs > decisionMs ? entryTimeMs : Number.POSITIVE_INFINITY;
  const entryIso = new Date(Number.isFinite(E) ? E : decisionMs).toISOString();
  const quoteAdmission = admitVetoQuote(veto.quote, decisionMs);
  const pd = veto.postDecision;

  // Classify post-decision intervals against the entry boundary (Logan (c)).
  const admissible: VetoInterval[] = [];
  const straddlingEntry: StraddlingInterval[] = [];
  if (pd) {
    for (const iv of pd.intervals) {
      const s = Date.parse(iv.start);
      const e = Date.parse(iv.end);
      if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) continue;
      if (s < E && e > E)
        straddlingEntry.push({ ...iv, straddles: "entry", note: straddleNote("entry", entryIso) });
      else if (s < E) admissible.push(iv); // s >= decisionMs by construction; e <= E
      // s >= E: beyond the veto window (post-entry) — not veto evidence; not recorded as either side.
    }
  }
  const straddlingDecision: StraddlingInterval[] = (pd?.straddlingDecision ?? []).map((iv) => ({
    ...iv,
    straddles: "decision" as const,
    note: straddleNote("decision", decisionIso),
  }));

  // Fold extremes over admissible intervals only — explicit [start, end) on
  // every observation (Logan (a)).
  const fold = (
    pick: (best: VetoInterval, iv: VetoInterval) => boolean,
    value: (iv: VetoInterval) => number,
  ): VetoEvidence | null => {
    let best: VetoInterval | null = null;
    for (const iv of admissible) if (!best || pick(best, iv)) best = iv;
    return best ? { value: value(best), intervalStart: best.start, intervalEnd: best.end, venue: pd!.venue } : null;
  };
  const foldedHigh = fold((best, iv) => iv.high > best.high, (iv) => iv.high);
  const foldedLow = fold((best, iv) => iv.low < best.low, (iv) => iv.low);

  const admittedHighs: VetoEvidence[] = [];
  const admittedLows: VetoEvidence[] = [];
  if (foldedHigh) admittedHighs.push(foldedHigh);
  if (foldedLow) admittedLows.push(foldedLow);
  if (quoteAdmission.admitted && veto.quote && veto.quote.observedAt) {
    const q: VetoEvidence = {
      value: quoteAdmission.price as number,
      intervalStart: veto.quote.observedAt,
      intervalEnd: veto.quote.observedAt,
      venue: veto.quote.venue,
    };
    admittedHighs.push(q);
    admittedLows.push(q);
  }

  // Validation 1 — current price: breach check over admitted post-decision evidence only.
  let currentPriceStatus: VetoStatus = "unknown";
  if (admittedHighs.length > 0 || admittedLows.length > 0) {
    const breached =
      direction === "long"
        ? admittedLows.some((e) => e.value <= invalidation)
        : admittedHighs.some((e) => e.value >= invalidation);
    currentPriceStatus = breached ? "fail" : "pass";
  }

  // Validation 2 — interval coverage: independent of current price.
  const coverage: CoverageReport = pd
    ? pd.coverage
    : { status: "unknown", covered: [], gaps: [] };
  const intervalCoverageStatus: CoverageStatus = coverage.status;

  const cc = veto.contextCandle;
  const context =
    cc && cc.high !== null && cc.low !== null
      ? ` (pre-decision ${cc.day} day ${
          direction === "short"
            ? `high ${cc.high}${cc.highAt ? ` @ ${cc.highAt}` : ""}`
            : `low ${cc.low}${cc.lowAt ? ` @ ${cc.lowAt}` : ""}`
        } shown as context, not a veto)`
      : "";
  const straddleSuffix =
    straddlingDecision.length > 0 || straddlingEntry.length > 0
      ? ` [${straddlingDecision.length} decision-straddling + ${straddlingEntry.length} entry-straddling candle(s) held as UNKNOWN, not assigned to either side]`
      : "";

  let status: VetoStatus;
  let reason: string | null = null;
  if (currentPriceStatus === "fail") {
    status = "fail";
    const worst =
      direction === "long"
        ? admittedLows.reduce((a, b) => (b.value < a.value ? b : a))
        : admittedHighs.reduce((a, b) => (b.value > a.value ? b : a));
    const bounds = `[${worst.intervalStart}, ${worst.intervalEnd})`;
    reason =
      direction === "long"
        ? `${BORN_DEAD_REASON_PREFIX} LONG: post-decision low ${worst.value} <= invalidation ${invalidation} @ ${bounds} (${worst.venue})${context}${straddleSuffix}`
        : `${BORN_DEAD_REASON_PREFIX} SHORT: post-decision high ${worst.value} >= invalidation ${invalidation} @ ${bounds} (${worst.venue})${context}${straddleSuffix}`;
  } else if (currentPriceStatus === "unknown") {
    status = "unknown";
    const held = straddlingDecision.length + straddlingEntry.length;
    reason =
      `issuance-validation UNKNOWN: no admissible post-decision price evidence` +
      (held > 0 ? ` (${held} straddling candle(s) held as UNKNOWN, ${admissible.length} admissible interval(s))` : ` (${admissible.length} admissible interval(s))`) +
      `; contract requires observation time + receipt time + venue`;
  } else if (intervalCoverageStatus === "unknown") {
    status = "unknown";
    const window = pd ? `[${pd.windowStart}, ${pd.windowEnd})` : `[${decisionIso}, decision instant)`;
    const gapList = coverage.gaps.map((g) => `[${g.start}, ${g.end})`).join(", ") || "uncomputed";
    reason = `issuance-validation UNKNOWN: interval coverage incomplete for ${window} — ${coverage.gaps.length} gap(s): ${gapList}; current price alone cannot establish no invalidation occurred during the interval`;
  } else {
    status = "pass";
    reason = null;
  }

  return {
    publish: status === "pass",
    status,
    currentPriceStatus,
    intervalCoverageStatus,
    reason,
    quoteAdmission,
    admittedHighs,
    admittedLows,
    foldedHigh,
    foldedLow,
    admissibleIntervalCount: admissible.length,
    straddlingDecision,
    straddlingEntry,
  };
}

/**
 * Suppression-record metadata fragment (Change 5 + Logan item 6): per-evidence
 * contract fields with explicit interval boundaries, coverage/gap accounting,
 * the two independent verdicts, the combined veto status, straddling-candle
 * UNKNOWN accounting, and the pre-decision context labeled as context-only.
 * No new columns — merged into metadataJson by the caller.
 */
export function buildVetoMetadataFragment(input: {
  direction: "long" | "short";
  invalidation: number;
  decisionMs: number;
  entryTimeMs?: number;
  contextCandle: ContextCandleLike;
  postDecision: PostDecisionSlice | null;
  quote: VetoQuote | null;
  result: VetoResult;
}): Record<string, unknown> {
  const pd = input.postDecision;
  const q = input.quote;
  const r = input.result;
  const cc = input.contextCandle;
  const straddle = (s: StraddlingInterval) => ({
    start: s.start,
    end: s.end,
    high: s.high,
    low: s.low,
    treatment: "UNKNOWN — not assigned to either side",
    note: s.note,
  });
  return {
    vetoSemantics: VETO_SEMANTICS,
    vetoDirection: input.direction,
    vetoInvalidation: input.invalidation,
    vetoDecisionAt: new Date(input.decisionMs).toISOString(),
    vetoEntryAt: new Date(Math.max(input.entryTimeMs ?? input.decisionMs, input.decisionMs)).toISOString(),
    vetoStatus: r.status,
    currentPriceStatus: r.currentPriceStatus,
    intervalCoverageStatus: r.intervalCoverageStatus,
    postDecisionHigh: r.foldedHigh?.value ?? null,
    postDecisionLow: r.foldedLow?.value ?? null,
    postDecisionHighInterval: r.foldedHigh ? { start: r.foldedHigh.intervalStart, end: r.foldedHigh.intervalEnd } : null,
    postDecisionLowInterval: r.foldedLow ? { start: r.foldedLow.intervalStart, end: r.foldedLow.intervalEnd } : null,
    postDecisionReceivedAt: pd?.receivedAt ?? null,
    postDecisionVenue: pd?.venue ?? null,
    postDecisionIntervalCount: pd?.intervalCount ?? null,
    postDecisionAdmissibleIntervalCount: r.admissibleIntervalCount,
    postDecisionCoverage: pd?.coverage.status ?? null,
    postDecisionCoveredIntervals: pd?.coverage.covered ?? null,
    postDecisionCoverageGaps: pd?.coverage.gaps ?? null,
    postDecisionWindowStart: pd?.windowStart ?? null,
    postDecisionWindowEnd: pd?.windowEnd ?? null,
    postDecisionIntervalObservations: pd?.intervals
      .filter((interval) => interval.observationId !== undefined)
      .map((interval) => ({
        observationId: interval.observationId,
        venue: interval.venue ?? pd.venue,
        eventTime: interval.eventTime ?? interval.start,
        receivedAt: interval.receivedAt ?? pd.receivedAt,
        start: interval.start,
        end: interval.end,
        high: interval.high,
        low: interval.low,
      })) ?? null,
    postDecisionStraddlingDecision: r.straddlingDecision.map(straddle),
    postDecisionStraddlingEntry: r.straddlingEntry.map(straddle),
    vetoQuote: q?.price ?? null,
    quoteObservedAt: q?.observedAt ?? null,
    quoteReceivedAt: q?.receivedAt ?? null,
    quoteVenue: q?.venue ?? null,
    quoteAdmitted: r.quoteAdmission.admitted,
    quoteExclusionReason: r.quoteAdmission.reason,
    contextCandleDay: cc?.day ?? null,
    contextCandleHigh: cc?.high ?? null,
    contextCandleLow: cc?.low ?? null,
    contextCandleHighAt: cc?.highAt ?? null,
    contextCandleLowAt: cc?.lowAt ?? null,
    contextCandleNote: "pre-decision signal-day candle shown as context only, never a veto",
  };
}
