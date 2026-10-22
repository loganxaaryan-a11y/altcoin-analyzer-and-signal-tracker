// waiting-interval.ts — GAP-4 veto timestamp-alignment repair (sandbox reference implementation).
//
// SANDBOX ONLY. Part of the paper-signals sandbox build; never touches
// production issuance. Holdouts locked.
//
// THE GAP (expert, 2026-10-13): the issuance veto built its input with
//   decisionAt = min(detectedAt, handlerStart)
// but the contract records handler-start as contract.decisionAt. So the
// veto's [detectedAt, handlerStart] window was actually PRE-decision setup
// history, while the real waiting interval [contract.decisionAt,
// entryObservedAt] was never veto-checked.
//
// THE REPAIR splits the veto across its two real timestamps:
//
//   QUALIFICATION TIME (issuance, entry not yet observed):
//     runQualificationChecks — setup-history filter (pre-decision extremes
//     are recorded as features, never stop-outs) + pipeline-order guard +
//     entry-zone rules. NO decision->entry invalidation: there is no waiting
//     interval yet (the decision instant IS the handler's run time).
//
//   ENTRY OBSERVATION TIME (the entry print is actually observed):
//     checkWaitingInterval — the genuine [contract.decisionAt,
//     entryObservedAt] window, reusing checkSetupInvalidation (straddles,
//     granularity, fail-closed uncertainty all inherited).
//
// THREE TIMESTAMPS (all ms epoch):
//   preDecisionAt — the draft/detectedAt instant. Bars entirely before this
//     are setup-history FEATURES, never stop-outs.
//   decisionAt    — contract.decisionAt (authoritative): the actual decision
//     instant, i.e. the handler's run time at qualification.
//   entryAt       — entryObservedAt: when the entry print was observed.
//     Must be >= decisionAt (integrity: otherwise the interval is
//     incoherent and the check throws rather than guessing).
//
// EQUITY OVERNIGHT GAP: the waiting interval [session-close, next-open]
// carries no bars BY CONSTRUCTION — the market is closed. That is not
// uncertainty, so allowEmptyInterval=true passes with the explicit reason
// "no bars by construction". Absent that flag, an empty interval is
// UNCERTAIN and fails closed ("no waiting-interval evidence").
//
// Source: veto/src/veto.ts (checkSetupInvalidation, checkEntryZone,
// validatePipelineOrder). This module only ADDS the timestamp-alignment
// layer; veto.ts semantics are unchanged.
import { checkSetupInvalidation, checkEntryZone, validatePipelineOrder, isFiniteOhlc, } from "./veto.js";
/**
 * Classifies pre-decision evidence as setup-history FEATURES. A pre-decision
 * extreme that crossed the final stop is RECORDED (detail.historicalCrosses)
 * — it is evidence ABOUT the setup (how it formed), never a stop-out against
 * it. Yesterday's stop crossing cannot veto a new setup.
 *
 * This check NEVER fails: setup history is classificatory, not a veto.
 * Verdict is always "pass" (even with zero pre-decision bars).
 */
export function checkSetupHistory(input) {
    const { direction, finalStop, preDecisionAt, bars } = input;
    const features = bars.filter((b) => b.endAt <= preDecisionAt);
    const crossed = [];
    for (const b of features) {
        if (!isFiniteOhlc(b))
            continue;
        const extreme = direction === "long" ? b.low : b.high;
        const hit = direction === "long" ? extreme <= finalStop : extreme >= finalStop;
        if (hit)
            crossed.push(b.label ?? b.source);
    }
    const cutoffIso = Number.isFinite(preDecisionAt) ? new Date(preDecisionAt).toISOString() : "n/a";
    return {
        check: "setup_history",
        verdict: "pass",
        reason: `setup-history filter: ${features.length} bar(s) entirely before the pre-decision cutoff ${cutoffIso} ` +
            `recorded as setup features` +
            (crossed.length > 0
                ? `; ${crossed.length} crossed the final published stop ${finalStop} in the pre-decision window (${crossed.join("; ")}) — recorded as features, never stop-outs`
                : `; none crossed the final published stop ${finalStop}`) +
            ` (a touch before the decision is history, not invalidation).`,
        detail: {
            finalStop,
            preDecisionAt: cutoffIso,
            preDecisionFeatures: features.map((b) => ({ label: b.label ?? b.source, high: b.high, low: b.low })),
            historicalCrosses: crossed,
        },
    };
}
/**
 * Vetoes a setup invalidated during the REAL waiting interval
 * [contract.decisionAt, entryObservedAt].
 *
 * Steps:
 *  1. Integrity: entryAt < decisionAt throws (the interval would be
 *     incoherent; never guess a direction for time).
 *  2. Setup-history filter: bars entirely before preDecisionAt are
 *     recorded as features (never stop-outs). The cutoff is clamped to
 *     decisionAt — a preDecisionAt beyond the authoritative decision can
 *     never swallow post-decision evidence.
 *  3. Empty interval: allowEmptyInterval -> PASS with reason
 *     "no bars by construction" (the equity overnight gap: session-close
 *     to next-open has no bars by construction, which is not uncertainty).
 *     Otherwise UNCERTAIN, fail-closed ("no waiting-interval evidence").
 *  4. Otherwise the [decisionAt, entryAt] window is graded by
 *     checkSetupInvalidation (straddling-candle rules, granularity
 *     fidelity, and fail-closed uncertainty all inherited unchanged).
 *
 * The result's `checks` carry the setup-history filter and the
 * decision→entry invalidation as SEPARATE entries, so a downstream reader
 * can see which question failed.
 */
export function checkWaitingInterval(input) {
    const { direction, finalStop, decisionAt, entryAt, preDecisionAt, finestGranularity, bars, allowEmptyInterval } = input;
    // (1) Integrity: the waiting interval must run forward in time.
    if (!Number.isFinite(decisionAt) || !Number.isFinite(entryAt) || entryAt < decisionAt) {
        throw new Error(`checkWaitingInterval integrity violation: entryAt (${entryAt}) < decisionAt (${decisionAt}); ` +
            `the waiting interval must be forward in time — refusing to grade a time-incoherent window.`);
    }
    // (2) Setup-history filter. Clamp the cutoff to the authoritative decision:
    // a preDecisionAt beyond decisionAt must never reclassify post-decision
    // evidence as history.
    const cutoff = Number.isFinite(preDecisionAt) ? Math.min(preDecisionAt, decisionAt) : decisionAt;
    const history = checkSetupHistory({ direction, finalStop, preDecisionAt: cutoff, bars });
    const preDecisionFeatures = bars.filter((b) => b.endAt <= cutoff);
    const windowEvidence = bars.filter((b) => b.endAt > cutoff);
    const intervalIso = `[${new Date(decisionAt).toISOString()}..${new Date(entryAt).toISOString()})`;
    // (3) Empty interval.
    if (bars.length === 0) {
        if (allowEmptyInterval) {
            const reason = `no bars by construction: the waiting interval ${intervalIso} carries no evidence by construction ` +
                `(equity overnight gap: session-close → next-open — the market is closed, so there is nothing to observe), ` +
                `not by omission; nothing to invalidate — pass.`;
            return {
                verdict: "pass",
                reason,
                checks: [
                    history,
                    {
                        check: "setup_invalidation",
                        verdict: "pass",
                        reason: `vacuous pass on the final published stop ${finalStop}: ${reason}`,
                        detail: { finalStop, allowEmptyInterval: true, interval: intervalIso },
                    },
                ],
                preDecisionFeatures,
            };
        }
        const reason = `no waiting-interval evidence: the decision→entry interval ${intervalIso} has no observable bars ` +
            `and empty evidence was not declared by construction (allowEmptyInterval=false) — fail-closed.`;
        return {
            verdict: "uncertain",
            reason,
            checks: [
                history,
                {
                    check: "setup_invalidation",
                    verdict: "uncertain",
                    reason: `issuance-validation unavailable: ${reason}`,
                    detail: { finalStop, allowEmptyInterval: false, interval: intervalIso },
                },
            ],
            preDecisionFeatures,
        };
    }
    // (4) Grade [decisionAt, entryAt] via checkSetupInvalidation. It applies
    // its own endAt <= decisionAt feature rule to the window evidence, plus
    // the straddle / granularity / fail-closed semantics.
    const invalidation = checkSetupInvalidation({
        direction,
        finalStop,
        decisionAt,
        entryAt,
        finestGranularity,
        bars: windowEvidence,
    });
    const bad = [history, invalidation].filter((c) => c.verdict !== "pass");
    const verdict = bad.some((c) => c.verdict === "fail")
        ? "fail"
        : bad.length > 0
            ? "uncertain"
            : "pass";
    const reason = verdict === "fail"
        ? `setup invalidated in the waiting interval: ${invalidation.reason}`
        : verdict === "uncertain"
            ? `waiting-interval invalidation uncertain (fail-closed downstream): ${invalidation.reason}`
            : `waiting interval clear: ${invalidation.reason}`;
    return { verdict, reason, checks: [history, invalidation], preDecisionFeatures };
}
// ---------------------------------------------------------------------------
// Qualification checks — issuance time (the entry has NOT been observed yet).
// ---------------------------------------------------------------------------
/**
 * Qualification-time veto runner. Takes the SAME IssuanceVetoInput shape as
 * runIssuanceChecks (drop-in for the handler rewire) but evaluates only what
 * can be decided before the entry is observed:
 *
 *   1. pipeline-order guard (defect i): the veto must grade the FINAL
 *      published stop — validatePipelineOrder.
 *   2. setup-history filter: pre-decision extremes (bars with endAt <=
 *      preDecisionAt, the recorded detectedAt) are classified as features,
 *      never stop-outs — checkSetupHistory. Never fails.
 *   3. entry-zone rules: drift cap + expiry on the PROPOSED entry —
 *      checkEntryZone. An entry-rule failure, not a veto.
 *
 * There is deliberately NO decision→entry invalidation here: at
 * qualification time the decision instant IS the handler's run time, so the
 * waiting interval does not exist yet. The real [contract.decisionAt,
 * entryObservedAt] window is graded by checkWaitingInterval at entry
 * observation. Uncertain fails closed, as with runIssuanceChecks.
 */
export function runQualificationChecks(input) {
    const pipeline = validatePipelineOrder({
        draftStop: input.pipeline.draftStop,
        publishedStop: input.pipeline.publishedStop,
        checkedStop: input.invalidation.finalStop,
    });
    const history = checkSetupHistory({
        direction: input.invalidation.direction,
        finalStop: input.invalidation.finalStop,
        preDecisionAt: Number.isFinite(input.invalidation.preDecisionAt)
            ? input.invalidation.preDecisionAt
            : input.invalidation.decisionAt,
        bars: input.invalidation.bars,
    });
    const entryZone = checkEntryZone(input.entryZone);
    const checks = [pipeline, history, entryZone];
    const bad = checks.filter((c) => c.verdict !== "pass");
    return {
        verdict: bad.length === 0 ? "pass" : "fail_closed",
        checks,
        summary: bad.length === 0
            ? "qualification checks pass: setup history classified as features (never a veto); the final published stop is the graded stop; the proposed entry is inside the permitted zone. No decision→entry invalidation is evaluated at qualification time — the entry has not been observed yet; the waiting interval is checked at entry observation (checkWaitingInterval)."
            : `qualification suppressed (fail-closed): ${bad.map((c) => `${c.check}=${c.verdict} (${c.reason})`).join(" | ")}`,
    };
}
