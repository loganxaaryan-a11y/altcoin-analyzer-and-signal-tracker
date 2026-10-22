// veto.ts — corrected born-dead / historical-extreme veto (sandbox reference implementation).
//
// Spec: ~/workspace/goals/research-terminal/hidden_files/source-export-2026-10-13/VETO-AUDIT.md
// WORK ITEM 2/5. Sandbox only — no production changes. Holdouts locked.
//
// The veto is split into three EXPLICIT, separate checks:
//
//   (a) checkSetupInvalidation — between decision and entry. ONLY bars observed
//       strictly after decisionTime may invalidate. Pre-decision extremes are
//       setup FEATURES (recorded), never stop-outs.
//   (b) checkEntryZone — entry-rule failures: entry beyond the drift limit or
//       past expiry. These are NOT vetos; they reject the issuance for a
//       different reason.
//   (c) checkOutcomes — target/stop outcomes after entry only, per the frozen
//       evaluation contract (evaluator granularity, same-bar ambiguity).
//
// Every check returns pass | fail | uncertain with a reason string. UNCERTAIN
// ALWAYS FAILS CLOSED (the orchestrator runIssuanceChecks treats any non-pass
// as a suppression). Uncertainty handling is specified per case, never silent.
//
// Defects fixed (from the audit):
//   (i)  crypto must test the FINAL published stop (post-buildAtrLevels), never
//        the draft stop. The invalidation check takes finalStop only, and
//        validatePipelineOrder() rejects any run that graded a different stop.
//   (ii) equity's veto must examine the same bar granularity its evaluator
//        uses: daily XNYS sessions for the post-entry path. Evidence at any
//        other granularity fails closed with reason.
const GRANULARITY_RANK = {
    session: 1, // daily / XNYS session bar
    intraday: 2, // 4h / 1h / sub-daily closed bar
    forming_candle: 3, // currently forming candle (provisional evidence)
    trade_print: 4, // single trade print (point in time)
    quote: 5, // provider quote (point in time)
};
export function isFiniteOhlc(bar) {
    return [bar.open, bar.high, bar.low, bar.close].every((v) => typeof v === "number" && Number.isFinite(v))
        && bar.high >= Math.max(bar.open, bar.close)
        && bar.low <= Math.min(bar.open, bar.close);
}
/**
 * A setup is invalidated only by adverse movement observed strictly AFTER
 * the decision, against the final published stop.
 *
 * Per-bar uncertainty handling (each is fail-closed):
 *  - bar entirely before decisionAt (endAt <= decisionAt): PRE-DECISION FEATURE.
 *    Recorded in preDecisionFeatures; can never veto.
 *  - bar straddling decisionAt (startAt < decisionAt < endAt):
 *      - if the whole-bar extreme cannot have crossed the stop, the
 *        post-decision portion provably cannot either -> definite pass for
 *        that bar.
 *      - otherwise the post-decision portion cannot be isolated from OHLC ->
 *        UNCERTAIN, fail-closed. The pre-decision portion is NEVER treated as
 *        a definite breach.
 *  - bar straddling entryAt (startAt < entryAt < endAt) — CORRECTION 6(a):
 *    same rule as the decision-straddle. The pre-entry portion must not
 *    contribute a definite breach: whole-bar extreme safe -> definite pass
 *    for that bar; otherwise UNCERTAIN, fail-closed (the breach cannot be
 *    isolated to the pre-entry portion, and the post-entry portion belongs
 *    to the outcomes check, not this one).
 *  - bar fully at/after decisionAt: normal extreme check. Null/incoherent OHLC
 *    -> UNCERTAIN, fail-closed.
 *  - bar coarser than finestGranularity in the window -> contributes no
 *    definite signal; if NO fine evidence exists at all -> UNCERTAIN,
 *    fail-closed ("no fine-grained post-decision evidence").
 *  - point evidence (startAt === endAt, quote/trade_print) at ts >= decisionAt
 *    is fully post-decision; no straddle possible.
 *  - no post-decision bars whatsoever -> UNCERTAIN, fail-closed
 *    ("issuance-validation unavailable: no post-decision OHLC evidence").
 *    Never fall back to a pre-decision candle.
 *  - NO WAITING TRAP: forming candles are admitted (provisional: true) so an
 *    immediate entry does not need to wait for a completed candle.
 */
export function checkSetupInvalidation(input) {
    const { direction, finalStop, decisionAt, entryAt, finestGranularity, bars } = input;
    if (!(finalStop > 0) || !Number.isFinite(decisionAt) || !Number.isFinite(entryAt) || entryAt < decisionAt) {
        return { check: "setup_invalidation", verdict: "uncertain", reason: "issuance-validation unavailable: incoherent decision/entry timestamps or non-positive final stop." };
    }
    const requiredRank = GRANULARITY_RANK[finestGranularity];
    const preDecisionFeatures = [];
    for (const b of bars) {
        if (b.endAt <= decisionAt)
            preDecisionFeatures.push(b);
    }
    if (entryAt === decisionAt) {
        // Degenerate window (equity reference-entry contract: entry = signal-day
        // close, decided at that same close). There is no decision->entry interval,
        // so no post-decision invalidation is possible. Vacuous pass — this is NOT
        // a missing-evidence uncertain; it is a no-window pass. Pre-decision
        // extremes stay features, never stop-outs.
        return {
            check: "setup_invalidation", verdict: "pass",
            reason: `no post-decision pre-entry interval exists (entry coincides with the decision at ${new Date(decisionAt).toISOString()}); pre-decision extremes recorded as setup features, never stop-outs.`,
            detail: { finalStop, preDecisionFeatures: preDecisionFeatures.map((b) => ({ label: b.label ?? b.source, high: b.high, low: b.low })) },
        };
    }
    const windowBars = bars.filter((b) => b.endAt > decisionAt && b.startAt < entryAt);
    if (windowBars.length === 0) {
        return {
            check: "setup_invalidation",
            verdict: "uncertain",
            reason: "issuance-validation unavailable: no post-decision OHLC evidence in [decisionAt, entryAt); a pre-decision candle must never veto a post-decision entry.",
            detail: { finalStop, preDecisionFeatures: preDecisionFeatures.map((b) => b.label ?? b.source) },
        };
    }
    const fineBars = windowBars.filter((b) => GRANULARITY_RANK[b.granularity] >= requiredRank);
    if (fineBars.length === 0) {
        return {
            check: "setup_invalidation",
            verdict: "uncertain",
            reason: `issuance-validation unavailable: evidence in the post-decision window is coarser than the finest available granularity (${finestGranularity}); the path cannot be isolated.`,
            detail: { finalStop, windowBars: windowBars.map((b) => b.label ?? b.source) },
        };
    }
    let provisionalUsed = false;
    for (const bar of fineBars) {
        if (bar.provisional)
            provisionalUsed = true;
        const label = bar.label ?? `${bar.source} [${new Date(bar.startAt).toISOString()}..${new Date(bar.endAt).toISOString()}]`;
        const straddlesDecision = bar.startAt < decisionAt && bar.endAt > decisionAt;
        // CORRECTION 6(a): a candle whose interval contains entryAt straddles the
        // entry event, just as a candle containing decisionAt straddles the
        // decision. Its pre-entry portion must not contribute a definite breach —
        // the same rule as the decision-straddle: pre-event portion ->
        // uncertain/fail-closed. (Point evidence cannot straddle: startAt === endAt.)
        const straddlesEntry = bar.startAt < entryAt && bar.endAt > entryAt;
        if (!isFiniteOhlc(bar)) {
            return {
                check: "setup_invalidation", verdict: "uncertain",
                reason: `issuance-validation unavailable: post-decision bar has missing or incoherent OHLC (${label}); cannot prove the path.`,
                detail: { finalStop, bar: label },
            };
        }
        const extreme = direction === "long" ? bar.low : bar.high;
        const crossed = direction === "long" ? extreme <= finalStop : extreme >= finalStop;
        if (straddlesDecision || straddlesEntry) {
            // Only the portion on the actionable side of the event may invalidate.
            // If the whole-bar extreme is safe, that portion is provably safe.
            // Otherwise the portion cannot be isolated from OHLC -> uncertain,
            // fail-closed. The pre-event portion is NEVER treated as a definite breach.
            if (!crossed)
                continue;
            const boundaries = [
                straddlesDecision ? "decisionTime" : null,
                straddlesEntry ? "entryTime" : null,
            ].filter((b) => b !== null).join(" and ");
            return {
                check: "setup_invalidation", verdict: "uncertain",
                reason: `issuance-validation unavailable: candle ${label} straddles ${boundaries} and its extreme crossed the final stop; the pre-event portion of a straddling candle is never treated as a definite breach, and the actionable-side portion cannot be isolated from OHLC.`,
                detail: { finalStop, bar: label, extreme, straddlesDecision, straddlesEntry },
            };
        }
        // Fully post-decision bar (bar.startAt >= decisionAt), or a point print
        // at/after decisionAt (startAt === endAt >= decisionAt).
        if (crossed) {
            return {
                check: "setup_invalidation", verdict: "fail",
                reason: `born-dead ${direction.toUpperCase()}: post-decision extreme crossed the final published stop ${finalStop} (extreme ${extreme} on ${label}).`,
                detail: { finalStop, bar: label, extreme, provisional: bar.provisional ?? false },
            };
        }
    }
    return {
        check: "setup_invalidation", verdict: "pass",
        reason: `no post-decision extreme crossed the final published stop ${finalStop}; pre-decision extremes recorded as setup features, not stop-outs.`,
        detail: {
            finalStop, provisionalEvidenceUsed: provisionalUsed,
            preDecisionFeatures: preDecisionFeatures.map((b) => ({ label: b.label ?? b.source, high: b.high, low: b.low })),
        },
    };
}
// ---------------------------------------------------------------------------
// Pipeline-order guard (defect i): the veto must test the FINAL published stop.
// ---------------------------------------------------------------------------
export function validatePipelineOrder(input) {
    const { draftStop, publishedStop, checkedStop } = input;
    if (!(publishedStop > 0)) {
        return { check: "setup_invalidation", verdict: "uncertain", reason: "issuance-validation unavailable: no published stop was built (buildAtrLevels not run)." };
    }
    if (checkedStop !== publishedStop) {
        return {
            check: "setup_invalidation", verdict: "fail",
            reason: `veto tested stop ${checkedStop} but the ledger publishes stop ${publishedStop}${draftStop !== null ? ` (draft stop was ${draftStop})` : ""}: move the veto after buildAtrLevels; measurement conflates a pre-entry check on stop A with an outcome graded on stop B.`,
            detail: { draftStop, publishedStop, checkedStop },
        };
    }
    return {
        check: "setup_invalidation", verdict: "pass",
        reason: `veto tested the final published stop ${publishedStop}${draftStop !== null && draftStop !== publishedStop ? ` (draft stop ${draftStop} superseded by the post-decision quote)` : ""}.`,
        detail: { draftStop, publishedStop, checkedStop },
    };
}
/**
 * Rejects an entry that drifted beyond the permitted zone or is past expiry.
 * This is an ENTRY-RULE FAILURE, not a born-dead veto: the setup may be
 * valid, but this particular entry is not executable under the contract.
 */
export function checkEntryZone(input) {
    const { entry, referenceEntry, driftLimitBps, entryAt, expiresAt } = input;
    if (entry == null || !Number.isFinite(entry) || entry <= 0) {
        return { check: "entry_zone", verdict: "uncertain", reason: "entry-rule unavailable: entry price missing or non-positive; cannot confirm executability." };
    }
    if (!Number.isFinite(entryAt)) {
        return { check: "entry_zone", verdict: "uncertain", reason: "entry-rule unavailable: entry timestamp incoherent." };
    }
    if (expiresAt !== null && entryAt > expiresAt) {
        return {
            check: "entry_zone", verdict: "fail",
            reason: `entry-rule failure (not a veto): entry at ${new Date(entryAt).toISOString()} is past the issuance expiry ${new Date(expiresAt).toISOString()}.`,
            detail: { entry, entryAt, expiresAt },
        };
    }
    if (driftLimitBps !== null && referenceEntry !== null && referenceEntry > 0) {
        const driftBps = Math.abs(entry - referenceEntry) / referenceEntry * 1e4;
        if (driftBps > driftLimitBps) {
            return {
                check: "entry_zone", verdict: "fail",
                reason: `entry-rule failure (not a veto): entry ${entry} drifted ${driftBps.toFixed(1)} bps from the reference ${referenceEntry}, beyond the ${driftLimitBps} bps permitted zone.`,
                detail: { entry, referenceEntry, driftBps, driftLimitBps },
            };
        }
        return {
            check: "entry_zone", verdict: "pass",
            reason: `entry ${entry} inside the permitted zone (drift ${driftBps.toFixed(1)} bps <= ${driftLimitBps} bps of reference ${referenceEntry}).`,
            detail: { entry, referenceEntry, driftBps, driftLimitBps },
        };
    }
    return {
        check: "entry_zone", verdict: "pass",
        reason: `entry ${entry} accepted (no drift limit configured; entry not past expiry).`,
        detail: { entry },
    };
}
/**
 * Grades the post-entry path per the frozen contract. Pre-entry bars are
 * ignored entirely (there is no position and no P&L path before entry).
 *
 * Uncertainty handling (fail-closed):
 *  - non-closed or incoherent bar on the graded path -> uncertain
 *  - same-bar target+stop double touch -> uncertain (pessimistic ordering is
 *    unresolvable without finer evidence; matches the Phase-1 evaluators)
 *  - a touch inside an expiry-straddling candle -> uncertain (full-candle
 *    extreme cannot prove a pre-expiry touch)
 *  - equity: entry inside a session -> uncertain (daily OHLC cannot establish
 *    the post-entry path)
 *  - horizon incomplete and no level touched -> uncertain (open, not resolved)
 *
 * Verdicts: fail = stopped out; pass = target hit or horizon survived
 * untouched; uncertain = unresolved / unverifiable (fails closed).
 */
export function checkOutcomes(input) {
    const { direction, entry, stop, target, entryAt, expiresAt, nowAt, bars, evaluatorGranularity } = input;
    const requiredRank = GRANULARITY_RANK[evaluatorGranularity];
    if (!(entry > 0) || !(stop > 0) || !(target > 0) || !Number.isFinite(entryAt)) {
        return { check: "outcome", verdict: "uncertain", reason: "outcome check unavailable: incoherent frozen levels or entry timestamp." };
    }
    const path = bars.filter((b) => b.endAt > entryAt).sort((a, b) => a.startAt - b.startAt);
    const ignoredPreEntry = bars.length - path.length;
    for (const b of path) {
        if (GRANULARITY_RANK[b.granularity] !== requiredRank) {
            return {
                check: "outcome", verdict: "uncertain",
                reason: `outcome check unavailable: evidence granularity (${b.granularity}) differs from the evaluator's granularity (${evaluatorGranularity}); a veto must examine the same bar granularity its evaluator uses.`,
                detail: { bar: b.label ?? b.source },
            };
        }
    }
    // Equity session-entry rule (mirrors evaluateEquityTradeSetup): an entry
    // inside a session cannot be graded from daily OHLC.
    if (evaluatorGranularity === "session") {
        const straddler = path.find((b) => b.startAt < entryAt && entryAt < b.endAt);
        if (straddler) {
            return {
                check: "outcome", verdict: "uncertain",
                reason: `outcome check unavailable: entry falls inside the ${straddler.label ?? straddler.source} session; daily OHLC cannot establish the post-entry path without finer evidence.`,
                detail: { entryAt },
            };
        }
    }
    for (const bar of path) {
        if (bar.endAt > nowAt || !bar.isClosed)
            continue; // not yet observable; coverage gap below fails closed
        const label = bar.label ?? `${bar.source} [${new Date(bar.startAt).toISOString()}..${new Date(bar.endAt).toISOString()}]`;
        if (!isFiniteOhlc(bar)) {
            return { check: "outcome", verdict: "uncertain", reason: `outcome check unavailable: post-entry bar ${label} has missing or incoherent OHLC.`, detail: { bar: label } };
        }
        const stopTouched = direction === "long" ? bar.low <= stop : bar.high >= stop;
        const targetTouched = direction === "long" ? bar.high >= target : bar.low <= target;
        // CORRECTION 6(a)(b) — time-ordering: a candle whose interval contains
        // entryAt straddles the entry event. Its extreme cannot be timestamped
        // after entryAt from OHLC: it may be pre-entry movement (not a stop-out —
        // a later extreme must not invalidate an earlier entry) or post-entry
        // (genuine). A whole-bar-safe candle provably has a safe post-entry
        // portion; otherwise the portion cannot be isolated -> uncertain,
        // fail-closed. (The equity session-entry rule above already returns
        // uncertain for session bars containing entryAt; this covers intraday.
        // Point evidence cannot straddle — startAt === endAt — and points at/after
        // entryAt are fully post-entry.)
        if (bar.startAt < entryAt && entryAt < bar.endAt) {
            if (!stopTouched && !targetTouched)
                continue;
            return {
                check: "outcome", verdict: "uncertain",
                reason: `outcome check unavailable: candle ${label} straddles entryTime; its extreme cannot be timestamped after entryAt from OHLC — a pre-entry extreme is pre-entry movement, not a stop-out — and the post-entry portion cannot be isolated.`,
                detail: { bar: label, entryAt: new Date(entryAt).toISOString(), stopTouched, targetTouched },
            };
        }
        if (expiresAt !== null && bar.startAt < expiresAt && bar.endAt > expiresAt && (stopTouched || targetTouched)) {
            return { check: "outcome", verdict: "uncertain", reason: `outcome check unavailable: candle ${label} straddles expiry; its full-candle extreme cannot prove a pre-expiry touch.`, detail: { bar: label } };
        }
        if (stopTouched && targetTouched) {
            return {
                check: "outcome", verdict: "uncertain",
                reason: `outcome check unavailable: ${label} touched stop and target in the same bar; ordering needs finer evidence (pessimistic same-bar ordering is unresolvable on ${evaluatorGranularity} bars).`,
                detail: { bar: label },
            };
        }
        if (stopTouched) {
            return {
                check: "outcome", verdict: "fail",
                reason: `invalidated ${direction.toUpperCase()}: post-entry extreme crossed the stop ${stop} on ${label}.`,
                detail: { bar: label, stop, ignoredPreEntryBars: ignoredPreEntry },
            };
        }
        if (targetTouched) {
            return {
                check: "outcome", verdict: "pass",
                reason: `target ${target} reached post-entry on ${label}; stop never crossed.`,
                detail: { bar: label, target, ignoredPreEntryBars: ignoredPreEntry },
            };
        }
    }
    if (expiresAt !== null && nowAt >= expiresAt) {
        return { check: "outcome", verdict: "pass", reason: `horizon expired untouched: no post-entry bar touched the stop ${stop}; born-dead check clear at evaluation.`, detail: { ignoredPreEntryBars: ignoredPreEntry } };
    }
    return {
        check: "outcome", verdict: "uncertain",
        reason: "outcome check unresolved: horizon incomplete and no level touched yet; not a pass, not a stop-out.",
        detail: { ignoredPreEntryBars: ignoredPreEntry },
    };
}
/**
 * Post-entry invalidation with the two questions separated (correction 6c).
 *
 * (1) ENTRY VALIDITY: the entry print itself vs the stop. LONG: entryPrice <=
 *     stop -> fail (stopped at birth); SHORT: entryPrice >= stop -> fail.
 *     Otherwise pass. This is the "current entry valid" field.
 *
 * (2) INTERVENING INVALIDATION: post-entry observations vs the stop.
 *     Time-ordering (correction 6b): ONLY extremes that can be timestamped
 *     strictly AFTER entryAt count against the entry —
 *       - point evidence (trade_print/quote) with ts > entryAt: counts.
 *       - closed bar fully after entry (startAt >= entryAt): its extreme is
 *         entirely post-entry -> counts.
 *       - closed bar straddling entryAt (startAt < entryAt < endAt): the
 *         extreme cannot be timestamped after entryAt from OHLC. Whole-bar
 *         safe -> provably no post-entry breach from this bar. Otherwise the
 *         post-entry portion cannot be isolated -> unisolable (insufficient
 *         data), NEVER a definite stop-out.
 *       - bars with endAt <= entryAt: pre-entry movement, ignored entirely.
 *       - incoherent OHLC on a would-be evidence bar -> unisolable.
 *     A forming (provisional) candle currently through the stop IS real-time
 *     adverse movement -> invalidation_observed, flagged provisional: true in
 *     detail (it may uncross; the caller sees the provisional flag).
 *
 * (3) COVERAGE: "no_invalidation_observed" requires the closed-bar evidence to
 *     continuously cover [entryAt, nowAt] with whole-bar-safe bars. Points do
 *     NOT contribute coverage — one safe print cannot prove an entire interval
 *     was safe. Any gap (or any unisolable bar) -> "insufficient_data":
 *     fail-closed on the invalidation question, NOT on entry validity.
 *
 * This check is a post-entry lifecycle stage, NOT part of runIssuanceChecks
 * (which governs decision -> entry). It is exported standalone for the entry
 * watcher / tracker to call once a contract is entered.
 */
export function checkPostEntryInvalidation(input) {
    const { direction, stop, entryPrice, entryAt, nowAt, bars } = input;
    const incoherent = (why) => ({
        check: "post_entry_invalidation",
        entryValid: "uncertain",
        entryReason: `entry-validity check unavailable: ${why}.`,
        interveningInvalidation: "insufficient_data",
        invalidationReason: `invalidation evidence unavailable: ${why}.`,
        verdict: "uncertain",
        reason: `post-entry invalidation check unavailable: ${why} (fail-closed on both questions).`,
        detail: { stop, entryAt },
    });
    if (!(stop > 0) || !(entryPrice > 0)) {
        return incoherent("non-positive stop or entry price");
    }
    if (!Number.isFinite(entryAt) || !Number.isFinite(nowAt) || nowAt < entryAt) {
        return incoherent("incoherent entryAt/nowAt ordering");
    }
    // (1) Entry validity: the print itself.
    const stoppedAtPrint = direction === "long" ? entryPrice <= stop : entryPrice >= stop;
    const entryValid = stoppedAtPrint ? "fail" : "pass";
    const entryReason = stoppedAtPrint
        ? `entry print ${entryPrice} itself crossed the stop ${stop} — stopped at birth (${direction.toUpperCase()}).`
        : `entry print ${entryPrice} within bounds of the stop ${stop} (${direction.toUpperCase()}).`;
    // (2)+(3) Post-entry evidence, strictly after entryAt.
    const adverse = (extreme) => direction === "long" ? extreme <= stop : extreme >= stop;
    const extremeOf = (b) => direction === "long" ? b.low : b.high;
    let invalidation = null;
    const unisolable = [];
    const gaps = [];
    let coveredUntil = entryAt;
    const sorted = [...bars]
        .filter((b) => b.endAt > entryAt && b.startAt <= nowAt)
        .sort((a, b) => a.startAt - b.startAt);
    for (const b of sorted) {
        const label = b.label ??
            `${b.source} [${new Date(b.startAt).toISOString()}..${new Date(b.endAt).toISOString()}]`;
        if (!isFiniteOhlc(b)) {
            // Cannot assess this bar at all — it can neither prove safety nor a
            // breach. Fail-closed on the invalidation question.
            unisolable.push(`${label} (incoherent OHLC)`);
            continue;
        }
        const isPoint = b.startAt === b.endAt;
        const straddlesEntry = b.startAt < entryAt && entryAt < b.endAt;
        const extreme = extremeOf(b);
        const crossed = adverse(extreme);
        if (straddlesEntry && !isPoint) {
            // The extreme cannot be timestamped after entryAt from OHLC.
            if (!crossed) {
                // Whole-bar safe -> the post-entry portion is provably safe: this bar
                // contributes coverage from entryAt.
                coveredUntil = Math.max(coveredUntil, Math.min(b.endAt, nowAt));
                continue;
            }
            unisolable.push(`${label} (straddles entryTime; extreme ${extreme} cannot be isolated to the post-entry portion — pre-entry movement is not a stop-out)`);
            continue;
        }
        if (crossed) {
            // Timestamped strictly after entryAt (a point with ts > entryAt, or a
            // bar fully after entry): genuine post-entry extreme.
            if (invalidation === null) {
                invalidation = { label, extreme, provisional: b.provisional ?? false };
            }
            continue;
        }
        // Whole-bar-safe evidence strictly after entryAt.
        if (!isPoint && b.isClosed) {
            // A closed bar's extreme IS the interval min/max: a safe closed bar
            // proves its interval safe. A safe point proves only the instant
            // (correction 6c) — points never contribute coverage.
            if (b.startAt > coveredUntil) {
                gaps.push(`[${new Date(coveredUntil).toISOString()}..${new Date(b.startAt).toISOString()}) unobserved`);
            }
            coveredUntil = Math.max(coveredUntil, Math.min(b.endAt, nowAt));
        }
        // Safe points and safe provisional candles: no breach, no coverage.
    }
    if (coveredUntil < nowAt) {
        gaps.push(`[${new Date(coveredUntil).toISOString()}..${new Date(nowAt).toISOString()}) unobserved`);
    }
    let interveningInvalidation;
    let invalidationReason;
    if (invalidation !== null) {
        interveningInvalidation = "invalidation_observed";
        invalidationReason =
            `post-entry extreme crossed the stop ${stop} (extreme ${invalidation.extreme} on ${invalidation.label})` +
                (invalidation.provisional ? " [provisional: forming candle, may uncross]" : "") +
                ` — genuine stop-out: the extreme is timestamped strictly after entryAt.`;
    }
    else if (unisolable.length > 0 || gaps.length > 0) {
        interveningInvalidation = "insufficient_data";
        const parts = [];
        if (unisolable.length > 0) {
            parts.push(`${unisolable.length} bar(s) whose extreme cannot be time-ordered after entryAt: ${unisolable.join("; ")}`);
        }
        if (gaps.length > 0) {
            parts.push(`post-entry interval not fully covered by closed bars: ${gaps.join("; ")} (a single safe print cannot prove an interval safe)`);
        }
        invalidationReason = `insufficient invalidation evidence (fail-closed on the invalidation question, NOT on entry validity): ${parts.join(" | ")}.`;
    }
    else {
        interveningInvalidation = "no_invalidation_observed";
        invalidationReason = `post-entry interval [${new Date(entryAt).toISOString()}..${new Date(nowAt).toISOString()}] fully covered by closed bars; no extreme crossed the stop ${stop}.`;
    }
    const verdict = entryValid === "fail" || interveningInvalidation === "invalidation_observed"
        ? "fail"
        : interveningInvalidation === "insufficient_data"
            ? "uncertain"
            : "pass";
    const reason = verdict === "fail"
        ? entryValid === "fail"
            ? entryReason
            : invalidationReason
        : verdict === "uncertain"
            ? invalidationReason
            : `entry valid and no post-entry invalidation observed: ${invalidationReason}`;
    return {
        check: "post_entry_invalidation",
        entryValid,
        entryReason,
        interveningInvalidation,
        invalidationReason,
        verdict,
        reason,
        detail: {
            stop,
            entryPrice,
            entryAt: new Date(entryAt).toISOString(),
            nowAt: new Date(nowAt).toISOString(),
            unisolableBars: unisolable,
            coverageGaps: gaps,
            invalidationBar: invalidation?.label ?? null,
            provisionalInvalidation: invalidation?.provisional ?? false,
        },
    };
}
export function runIssuanceChecks(input) {
    const pipeline = validatePipelineOrder({ ...input.pipeline, checkedStop: input.invalidation.finalStop });
    const invalidation = checkSetupInvalidation(input.invalidation);
    const entryZone = checkEntryZone(input.entryZone);
    const checks = [pipeline, invalidation, entryZone];
    const bad = checks.filter((c) => c.verdict !== "pass");
    return {
        verdict: bad.length === 0 ? "pass" : "fail_closed",
        checks,
        summary: bad.length === 0
            ? "issuance checks pass: post-decision invalidation clear on the final published stop; entry inside the permitted zone."
            : `issuance suppressed (fail-closed): ${bad.map((c) => `${c.check}=${c.verdict} (${c.reason})`).join(" | ")}`,
    };
}
