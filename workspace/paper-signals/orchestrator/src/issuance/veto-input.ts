/**
 * buildIssuanceVetoInput — constructs the corrected veto's input from a
 * qualified candidate and its fresh inputs (spec §1.2 step 2).
 *
 * SANDBOX ONLY. Part of the integrated issuance path; never touches the
 * legacy born-dead veto.
 *
 * Per-terminal semantics:
 *
 * CRYPTO — the veto input records the ACTUAL decision instant (GAP-4,
 * 2026-10-13):
 *   decisionAt = the handler's run time (nowMs) — the ACTUAL decision
 *     instant, i.e. what the contract records as contract.decisionAt.
 *     Never min(detectedAt, nowMs): that stamped the [detectedAt,
 *     handlerStart] window as post-decision when it is in fact pre-decision
 *     setup history.
 *   preDecisionAt = detectedAt (recorded, not derived) — bars entirely
 *     before this are setup-history FEATURES (recorded, never stop-outs).
 *   entryAt    = the handler's run time — the quote receipt time for the
 *     PROPOSED entry. At qualification time the decision→entry interval is
 *     degenerate ([decisionAt, entryAt] = [nowMs, nowMs]); the real waiting
 *     interval [contract.decisionAt, entryObservedAt] is graded at entry
 *     observation by checkWaitingInterval (veto/src/waiting-interval.ts).
 *   finestGranularity = "intraday".
 *   bars = the signal-day bar (pre-decision FEATURE — recorded, never a
 *     stop-out) + fresh.vetoBars (post-decision intraday bars / forming
 *     candles supplied by the quote provider or the fixture). Absent
 *     post-decision evidence, the veto fails closed (honest, never silent).
 *
 * EQUITY — the degenerate reference-entry case (documented in veto.ts):
 *   at issuance time there is no post-decision pre-entry interval (the market
 *   is closed between the signal-day close and the next session open), so
 *   decisionAt = entryAt = the handler's run time (nowMs). The veto
 *   returns its vacuous pass: pre-decision extremes are setup features, never
 *   stop-outs. The ACTIONABLE entry (next-session open print) is governed
 *   later by the contract's entry window + drift cap (entry observation), and
 *   post-entry survival by checkPostEntryInvalidation. Treating the overnight
 *   gap as "no post-decision OHLC evidence" would fail-closed every equity
 *   issuance — the gap has no bars BY CONSTRUCTION, which is not uncertainty.
 *   At entry observation the overnight waiting interval [session-close,
 *   next-open] is graded by checkWaitingInterval with allowEmptyInterval=true
 *   (veto/src/waiting-interval.ts).
 *   finestGranularity = "session" (the evaluator's granularity).
 *
 * entryZone (both): the proposed entry vs the decision-time reference —
 *   crypto: entry = fresh.currentPrice ?? candidate.entryPrice (the live
 *     quote the entry would be based on), reference = candidate.entryPrice
 *     (the draft/decision reference), driftLimitBps = 150.
 *   equity: entry = reference = candidate.entryPrice, driftLimitBps = 50.
 *   expiresAt = null: no expiry is configured at the veto stage; the
 *   contract's entry window governs expiry at observation time.
 *
 * pipeline: draftStop = publishedStop = candidate.invalidation. In the
 * sandbox the levels are final at qualification (no separate buildAtrLevels
 * network step), so the guard proves the veto graded the published stop.
 */
import type { CandidateRecord, FreshInputs } from "../types.js";
import { isoMs } from "../util.js";
import type { EvidenceBar, IssuanceVetoInput } from "../../../veto/src/veto.js";

function signalDayBarUtc(candidate: CandidateRecord): EvidenceBar | null {
  const sd = candidate.inputs.signalDay;
  if (!sd || sd.open == null || sd.high == null || sd.low == null) return null;
  const startAt = Date.parse(`${sd.day}T00:00:00.000Z`);
  if (!Number.isFinite(startAt)) return null;
  return {
    startAt,
    endAt: startAt + 86_400_000,
    open: sd.open,
    high: sd.high,
    low: sd.low,
    close: sd.close,
    isClosed: true,
    granularity: "session",
    source: sd.source || "signal-day",
    label: `signal-day ${sd.day} (pre-decision feature)`,
  };
}

/**
 * Build the IssuanceVetoInput for one candidate. `nowMs` is the handler's
 * run time — both the ACTUAL decision instant (what the contract records as
 * contract.decisionAt, GAP-4) and the proposed entry's quote receipt time.
 */
export function buildIssuanceVetoInput(
  candidate: CandidateRecord,
  fresh: FreshInputs,
  nowMs: number,
): IssuanceVetoInput {
  const direction = candidate.direction;
  const finalStop = candidate.invalidation;
  const detectedMs = isoMs(candidate.detectedAt);
  // GAP-4 (2026-10-13): decisionAt is the ACTUAL decision instant — the
  // handler's run time, which is what the contract records as
  // contract.decisionAt. Never min(detectedAt, nowMs): the old form stamped
  // the [detectedAt, handlerStart] window as post-decision when it is in
  // fact pre-decision setup history. detectedAt is recorded as preDecisionAt
  // so pre-decision bars classify as setup-history features, never stop-outs.
  const decisionAt = nowMs;
  const preDecisionAt = Number.isFinite(detectedMs) ? detectedMs : decisionAt;

  if (candidate.terminal === "crypto") {
    const entryAt = Math.max(nowMs, decisionAt);
    const bars: EvidenceBar[] = [];
    const seen = new Set<string>();
    const push = (b: EvidenceBar): void => {
      const key = `${b.startAt}:${b.endAt}:${b.label ?? b.source}`;
      if (seen.has(key)) return;
      seen.add(key);
      bars.push(b);
    };
    const signalDay = signalDayBarUtc(candidate);
    if (signalDay) push(signalDay); // pre-decision feature — never a stop-out
    for (const b of fresh.vetoBars ?? []) push(b);
    return {
      invalidation: {
        direction,
        finalStop,
        decisionAt,
        entryAt,
        preDecisionAt,
        finestGranularity: "intraday",
        bars,
      },
      entryZone: {
        direction,
        entry: fresh.currentPrice ?? candidate.entryPrice,
        referenceEntry: candidate.entryPrice,
        driftLimitBps: 150,
        entryAt,
        expiresAt: null,
      },
      pipeline: { draftStop: candidate.invalidation, publishedStop: candidate.invalidation },
    };
  }

  // equity: degenerate reference-entry window (see module docstring)
  const t = decisionAt;
  const bars: EvidenceBar[] = [];
  const signalDay = signalDayBarUtc(candidate);
  if (signalDay) bars.push(signalDay);
  for (const b of fresh.vetoBars ?? []) {
    if (!bars.some((x) => x.startAt === b.startAt && x.endAt === b.endAt && (x.label ?? x.source) === (b.label ?? b.source))) {
      bars.push(b);
    }
  }
  return {
    invalidation: {
      direction,
      finalStop,
      decisionAt: t,
      entryAt: t,
      preDecisionAt,
      finestGranularity: "session",
      bars,
    },
    entryZone: {
      direction,
      entry: candidate.entryPrice,
      referenceEntry: candidate.entryPrice,
      driftLimitBps: 50,
      entryAt: t,
      expiresAt: null,
    },
    pipeline: { draftStop: candidate.invalidation, publishedStop: candidate.invalidation },
  };
}
