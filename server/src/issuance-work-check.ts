/**
 * Bounded issuance-work check.
 *
 * The issuance cycle is invoked on a fixed cadence (every five minutes), but
 * the expensive work — intake synchronisation across every completed
 * handoff, per-candidate venue history fetches, gate audits, run-row
 * creation — is owed only when the latest completed discovery handoff still
 * has unprocessed work. This module decides, from AUTHORITATIVE COMMITTED
 * PROCESSING STATE ONLY, whether a handoff still needs that work:
 *
 *   - the latest committed paper-cycle run for the handoff (a run is marked
 *     complete only after its results are committed), and
 *   - the per-candidate durable intake dispositions for the handoff
 *     (processed / processing_expired / missed_processing are terminal).
 *
 * A scheduler receipt, a lease timestamp, or any "last triggered" value is
 * deliberately NOT an input: a recent trigger must never suppress work that
 * is failed, interrupted, or uncertain. Any disagreement between the run
 * label and the intake rows resolves toward recovery, never toward skipping.
 *
 * "Finished" needs care in this codebase: a cycle run ends "partial" (not
 * "complete") whenever some candidates were dispositioned deferred or
 * awaiting-entry — outcomes that ARE committed when the run's final update
 * lands (counts + completedAt), with the entry-watch lane owning any later
 * entry observation. So a run is finished iff its status is complete or
 * partial AND its completion stamp is committed; a run still "running"
 * (an interrupted invocation) or "failed" is unfinished, and any
 * non-terminal intake row overrides a finished label.
 */
export type IssuanceRunStatus = "running" | "complete" | "partial" | "failed";

export interface HandoffProcessingState {
  handoffId: number;
  discoveryRunId: number;
  /** Eligible pre-filter candidates recorded on the handoff itself. */
  eligibleCount: number;
  /**
   * Entry-window expiry evidence for the handoff's still-pending eligible
   * candidates (2026-10-25 starvation-prevention repair). `earliest` is
   * the soonest pending expiry (the urgency ordering key); `latest` is
   * the last pending expiry (the handoff is fully expired only once the
   * latest has passed). Both null when no pending candidate carries an
   * expiry — expiry is then UNKNOWN and the handoff is treated as
   * unexpired, so missing expiry evidence can never demote a live
   * handoff behind expired cleanup.
   */
  earliestEntryExpiresAt?: string | null;
  latestEntryExpiresAt?: string | null;
  /** Latest committed paper-cycle run for this handoff, or null when the
   * handoff has never been through a cycle. */
  latestRun: { id: number; status: IssuanceRunStatus; completedAt: string | null } | null;
  /** Durable intake rows committed for this handoff. */
  intakeTotal: number;
  /** Intake rows in a terminal state (processed / processing_expired /
   * missed_processing). */
  intakeTerminal: number;
  /** Intake rows still owed work (queued / processing / retryable_failure /
   * overflow_deferred, or any unaccounted remainder). */
  intakePending: number;
}

export type IssuanceWorkDecisionKind = "skipped_completed" | "processed_new" | "recovered_incomplete";

export interface IssuanceWorkDecision {
  kind: IssuanceWorkDecisionKind;
  reason: string;
}

export function decideIssuanceWork(state: HandoffProcessingState): IssuanceWorkDecision {
  const { latestRun } = state;
  if (!latestRun) {
    // Coverage-gap closure (2026-10-25 missed-handoff repair): a handoff can
    // be fully accounted for WITHOUT a paper-cycle run when every one of its
    // durable intake rows was dispositioned terminal outside a cycle — the
    // coverage-gap closure that dispositions an expired, never-selected
    // handoff as missed_processing. Intake rows are only ever created as
    // queued/processing by the sync, so "no run + every intake row terminal"
    // cannot describe a fresh handoff awaiting its first pass; it describes
    // work that was dispositioned, and re-running the pass would only
    // re-disposition expired candidates. A legitimate model abstention
    // recorded through such a disposition counts as successful processing.
    if (state.intakeTotal > 0 && state.intakePending === 0 && state.intakeTerminal === state.intakeTotal) {
      return {
        kind: "skipped_completed",
        reason: `Handoff ${state.handoffId} is fully accounted for without a paper-cycle run: all ${state.intakeTotal} durable intake rows are in a terminal state (dispositioned outside a cycle, e.g. a coverage-gap closure of an expired missed handoff). No run row is owed and no candidate is reprocessed.`,
      };
    }
    return {
      kind: "processed_new",
      reason: `No committed paper-cycle run exists for handoff ${state.handoffId}; the full issuance pass runs for the first time.`,
    };
  }
  const finished = (latestRun.status === "complete" || latestRun.status === "partial") && latestRun.completedAt !== null;
  if (!finished) {
    return {
      kind: "recovered_incomplete",
      reason: latestRun.status === "running"
        ? `Latest run ${latestRun.id} for handoff ${state.handoffId} never committed a completion (status "running", no completion stamp) — an interrupted execution; its work is recovered, never suppressed by the fact that a cycle recently triggered.`
        : `Latest committed run ${latestRun.id} for handoff ${state.handoffId} ended "${latestRun.status}"${latestRun.completedAt === null ? " without a completion stamp" : ""}; unfinished or uncertain work is recovered, never suppressed by the fact that a cycle recently triggered.`,
    };
  }
  if (state.intakePending > 0) {
    return {
      kind: "recovered_incomplete",
      reason: `Run ${latestRun.id} is marked complete but ${state.intakePending} of ${state.intakeTotal} intake rows for handoff ${state.handoffId} are not in a terminal state; the committed intake rows win over the run label and the remainder is recovered.`,
    };
  }
  if (state.eligibleCount > 0 && state.intakeTotal < state.eligibleCount) {
    return {
      kind: "recovered_incomplete",
      reason: `Handoff ${state.handoffId} records ${state.eligibleCount} eligible candidates but only ${state.intakeTotal} committed intake rows; intake coverage is incomplete, so the state is uncertain and processing resumes.`,
    };
  }
  if (state.intakeTerminal !== state.intakeTotal) {
    return {
      kind: "recovered_incomplete",
      reason: `Intake accounting for handoff ${state.handoffId} does not reconcile (${state.intakeTerminal} terminal of ${state.intakeTotal} rows); uncertain state is recovered, not skipped.`,
    };
  }
  return {
    kind: "skipped_completed",
    reason: `Handoff ${state.handoffId} is fully processed: run ${latestRun.id} committed "${latestRun.status}" with its results final and all ${state.intakeTotal} intake rows are in a terminal state. The expensive issuance pass is skipped; completion rests on committed run + intake state, not on when a cycle last triggered.`,
  };
}

/**
 * Monitoring-hold explanation (2026-10-23 issuance inspection).
 *
 * The 2026-10-23 "frozen issuance lane" was ONE failure reported as two:
 * monitoring coverage stopped at 03:42:59Z, its 45-minute freshness bound
 * was crossed at 04:27:59Z, and from then until coverage recovered the
 * issuance cycle was HELD BY DESIGN by the monitoring-health gate — it
 * evaluated health first and returned before any candidate processing.
 * The defect was not dispatch: the hold branch recorded nothing durable,
 * so a designed hold was indistinguishable from a dispatch failure in the
 * lane's own status. This builder produces the durable explanation every
 * held invocation now records in the work-check ledger.
 *
 * Trigger provenance: the recorded trigger is the caller-supplied action
 * argument, and an unsupplied trigger defaults to "manual" in the action
 * schema. A "manual" label therefore does NOT establish that a person
 * fired the invocation, and a resumed check carrying it does not prove
 * the lane "restarted on its own" — both readings are explicitly refused
 * here so the stored reason never overclaims the origin.
 */
export interface MonitoringHoldExplanationInput {
  coverageStatus: string;
  coverageBasis: string;
  lastSuccessfulCoverageUtc: string | null;
  staleAfterMs: number;
  settlementRunUtc: string | null;
  automationLabel: string;
  failingStage: string | null;
  reasons: string[];
  trigger: string;
}

export interface MonitoringHoldExplanation {
  /** Instant the freshness bound was crossed (last coverage + bound), or
   * null when no successful coverage timestamp is available. */
  staleBoundCrossedUtc: string | null;
  reason: string;
}

export function monitoringHoldExplanation(input: MonitoringHoldExplanationInput): MonitoringHoldExplanation {
  const lastMs = input.lastSuccessfulCoverageUtc ? Date.parse(input.lastSuccessfulCoverageUtc) : NaN;
  const staleBoundCrossedUtc = Number.isFinite(lastMs) && input.staleAfterMs > 0
    ? new Date(lastMs + input.staleAfterMs).toISOString()
    : null;
  const staleMinutes = Math.round(input.staleAfterMs / 60_000);
  const gateReasons = input.reasons.filter((row) => row.trim().length > 0);
  const reason = [
    "Held by design by the monitoring-health gate — not a dispatch failure: this cycle was invoked, evaluated monitoring health first, and returned before any candidate processing because entry admission is held.",
    `Coverage is ${input.coverageStatus.toUpperCase()} (${input.coverageBasis}; last successful coverage ${input.lastSuccessfulCoverageUtc ?? "unavailable"}${staleBoundCrossedUtc ? `; the ${staleMinutes}-minute freshness bound was crossed at ${staleBoundCrossedUtc}` : ""}; latest settlement pass ${input.settlementRunUtc ?? "unavailable"}) and automation is ${input.automationLabel} (failing stage: ${input.failingStage ?? "coverage unverified"}).`,
    gateReasons.length ? `Gate reasons: ${gateReasons.join(" ")}` : "Gate reasons: none recorded.",
    "No candidate was processed and no entry was admitted on this invocation. Monitoring, settlement, discovery and research are separate lanes and are not gated by this hold; admission resumes automatically on the first cycle after coverage is fresh and scheduled recovery is confirmed by attestation.",
    `Trigger provenance: the recorded trigger label is "${input.trigger}", the caller-supplied action argument — an unsupplied trigger defaults to "manual" in the action schema, so a "manual" label alone does not establish that a person fired this invocation.`,
  ].join(" ");
  return { staleBoundCrossedUtc, reason };
}

/**
 * Handoff selection + coverage accounting (2026-10-25 missed-handoff
 * repair).
 *
 * Root cause of the handoff-94 skip: the cycle selected exactly ONE
 * handoff — the one linked to the latest discovery run whose status was
 * complete/degraded. Discovery run 184 persisted handoff 94 complete at
 * 12:58:27Z, then timed out in a later stage and was fenced as "timeout",
 * so selection kept returning handoff 93 (run 181) for checks 885–908
 * while handoff 94 sat eligible and unprocessed; when run 185 completed,
 * selection jumped straight to handoff 95 and 94 was leapfrogged
 * permanently. Its intake rows stayed "queued", but the work check only
 * ever loaded the SELECTED handoff's state, so the miss was invisible:
 * every check honestly reported the handoff it was shown.
 *
 * The repair: selection and health operate over EVERY completed handoff.
 * A completed handoff row is the durable unit discovery committed (its
 * candidate evidence is frozen at persist time); the discovery run's
 * later status does not uncommit it, and coverage accounting reports
 * any handoff whose committed state is not fully accounted —
 * distinguishing "the scheduled check ran" from "all eligible handoffs
 * were accounted for".
 *
 * Starvation prevention (2026-10-25, second repair): oldest-first alone
 * lets a backlog of EXPIRED handoffs (the 11-handoff residue the first
 * repair surfaced: 63–75) consume every cycle's single full pass while
 * a fresh handoff's 15-minute entry window burns. Selection is now
 * two-lane: UNEXPIRED unaccounted handoffs go first, ordered by
 * earliest entry expiry (planHandoffAccounting); expired handoffs are
 * accounted separately — dispositioned without entries in a bounded
 * batch (EXPIRED_HANDOFF_BATCH_LIMIT) using remaining cycle capacity —
 * and coverage reporting spans both groups, so an expired handoff stays
 * visible until its disposition lands. Nothing disappears merely
 * because it expired.
 */
export interface HandoffSelection {
  /** Index into the input array (ordered oldest → newest) of the handoff
   * the cycle must account for on this invocation. */
  targetIndex: number;
  /** True when every handoff is accounted for; the target is then the
   * newest handoff, whose skip the cycle reports as before. */
  allAccounted: boolean;
}

/**
 * Expiry classification for one handoff at `nowMs` (starvation-prevention
 * repair, 2026-10-25). "accounted" wins first — a finished handoff is in
 * neither work group. A handoff with pending work is "expired" only when
 * its LATEST pending entry expiry has passed: every candidate window is
 * closed, so no entry can still be taken from it. When expiry evidence
 * is absent the handoff is "unexpired" — unknown never reads as expired,
 * so a live handoff can never be demoted behind cleanup by missing data.
 */
export type HandoffExpiryGroup = "accounted" | "unexpired" | "expired";

export function classifyHandoffExpiry(state: HandoffProcessingState, nowMs: number): HandoffExpiryGroup {
  if (decideIssuanceWork(state).kind === "skipped_completed") return "accounted";
  const latestMs = state.latestEntryExpiresAt ? Date.parse(state.latestEntryExpiresAt) : NaN;
  if (Number.isFinite(latestMs)) return latestMs <= nowMs ? "expired" : "unexpired";
  const earliestMs = state.earliestEntryExpiresAt ? Date.parse(state.earliestEntryExpiresAt) : NaN;
  if (Number.isFinite(earliestMs)) return earliestMs <= nowMs ? "expired" : "unexpired";
  return "unexpired";
}

function earliestExpiryMs(state: HandoffProcessingState): number {
  const earliest = state.earliestEntryExpiresAt ? Date.parse(state.earliestEntryExpiresAt) : NaN;
  if (Number.isFinite(earliest)) return earliest;
  const latest = state.latestEntryExpiresAt ? Date.parse(state.latestEntryExpiresAt) : NaN;
  return Number.isFinite(latest) ? latest : Number.POSITIVE_INFINITY;
}

/** Bounded expired-cleanup batch per cycle invocation: expired handoffs
 * are dispositioned with REMAINING capacity after the live target, never
 * ahead of it, and never more than this many per invocation. */
export const EXPIRED_HANDOFF_BATCH_LIMIT = 2;

export interface HandoffAccountingPlan {
  /** Index of the handoff that receives the full issuance pass this
   * invocation: the unexpired unaccounted handoff with the EARLIEST
   * expiry. Null when no unexpired handoff is owed work. */
  primaryIndex: number | null;
  /** Indices of expired, never-run handoffs to disposition this
   * invocation (missed_processing, no paper candidate, no run row, no
   * entry), oldest first, bounded by the batch limit. These consume only
   * remaining cycle capacity: the primary is selected first and is never
   * displaced by an entry here. */
  expiredDispositionIndices: number[];
  /** Every unaccounted handoff, split by group — coverage reporting
   * covers BOTH groups; expiry never removes a handoff from accounting. */
  unexpiredUnaccountedIndices: number[];
  expiredUnaccountedIndices: number[];
  allAccounted: boolean;
}

export function planHandoffAccounting(
  states: readonly HandoffProcessingState[],
  nowMs: number,
  expiredBatchLimit: number = EXPIRED_HANDOFF_BATCH_LIMIT,
): HandoffAccountingPlan {
  const unexpired: number[] = [];
  const expired: number[] = [];
  for (let index = 0; index < states.length; index++) {
    const state = states[index];
    if (!state) continue;
    const group = classifyHandoffExpiry(state, nowMs);
    if (group === "unexpired") unexpired.push(index);
    else if (group === "expired") expired.push(index);
  }
  // Unexpired first, ordered by earliest expiry (most urgent window
  // first); ties and unknown expiries keep oldest-first order.
  const byUrgency = [...unexpired].sort((a, b) => {
    const ea = earliestExpiryMs(states[a] as HandoffProcessingState);
    const eb = earliestExpiryMs(states[b] as HandoffProcessingState);
    return ea !== eb ? ea - eb : a - b;
  });
  const limit = Math.max(0, Math.floor(expiredBatchLimit));
  // Only never-run expired handoffs are disposition-eligible: a handoff a
  // cycle already processed (a committed run exists) keeps its run's
  // recovery semantics and is never rewritten as a coverage gap.
  const dispositionable = expired.filter((index) => states[index]?.latestRun === null);
  return {
    primaryIndex: byUrgency[0] ?? null,
    expiredDispositionIndices: dispositionable.slice(0, limit),
    unexpiredUnaccountedIndices: unexpired,
    expiredUnaccountedIndices: expired,
    allAccounted: unexpired.length === 0 && expired.length === 0,
  };
}

export function selectHandoffToAccount(states: readonly HandoffProcessingState[], nowMs?: number): HandoffSelection | null {
  if (!states.length) return null;
  if (nowMs !== undefined && Number.isFinite(nowMs)) {
    // Starvation prevention: an unexpired eligible handoff is ALWAYS
    // selected ahead of the expired backlog, however old the backlog is.
    const plan = planHandoffAccounting(states, nowMs);
    if (plan.primaryIndex !== null) return { targetIndex: plan.primaryIndex, allAccounted: false };
    if (plan.expiredUnaccountedIndices.length) {
      return { targetIndex: plan.expiredUnaccountedIndices[0] as number, allAccounted: false };
    }
    return { targetIndex: states.length - 1, allAccounted: true };
  }
  for (let index = 0; index < states.length; index++) {
    const state = states[index];
    if (state && decideIssuanceWork(state).kind !== "skipped_completed") {
      return { targetIndex: index, allAccounted: false };
    }
  }
  return { targetIndex: states.length - 1, allAccounted: true };
}

export interface UnaccountedHandoffRow {
  handoffId: number;
  discoveryRunId: number;
  decision: IssuanceWorkDecisionKind;
  intakeTotal: number;
  intakeTerminal: number;
  intakePending: number;
  reason: string;
  /** Expiry group at the summarised instant: an expired handoff stays in
   * coverage reporting until it is dispositioned — nothing disappears
   * merely because it expired. Null when no `nowMs` was supplied. */
  expiryGroup: "unexpired" | "expired" | null;
  earliestEntryExpiresAt: string | null;
  latestEntryExpiresAt: string | null;
}

export interface HandoffCoverageSummary {
  totalHandoffs: number;
  accountedHandoffs: number;
  /** Every handoff is accounted for: a finished committed run with all
   * intake rows terminal, or a full terminal disposition without a run. */
  allAccounted: boolean;
  unaccounted: UnaccountedHandoffRow[];
  /** Coverage split across BOTH work groups (present when `nowMs` was
   * supplied): unexpired handoffs still owed a live processing pass, and
   * expired handoffs still owed a disposition. Their sum plus
   * accountedHandoffs always equals totalHandoffs. */
  groups: {
    unexpiredUnaccounted: number;
    expiredUnaccounted: number;
  } | null;
}

export function summarizeHandoffCoverage(states: readonly HandoffProcessingState[], nowMs?: number): HandoffCoverageSummary {
  const unaccounted: UnaccountedHandoffRow[] = [];
  let unexpiredUnaccounted = 0;
  let expiredUnaccounted = 0;
  const haveNow = nowMs !== undefined && Number.isFinite(nowMs);
  for (const state of states) {
    const decision = decideIssuanceWork(state);
    if (decision.kind !== "skipped_completed") {
      const group = haveNow ? classifyHandoffExpiry(state, nowMs) : null;
      if (group === "unexpired") unexpiredUnaccounted++;
      else if (group === "expired") expiredUnaccounted++;
      unaccounted.push({
        handoffId: state.handoffId,
        discoveryRunId: state.discoveryRunId,
        decision: decision.kind,
        intakeTotal: state.intakeTotal,
        intakeTerminal: state.intakeTerminal,
        intakePending: state.intakePending,
        reason: decision.reason,
        expiryGroup: group === "accounted" ? null : group,
        earliestEntryExpiresAt: state.earliestEntryExpiresAt ?? null,
        latestEntryExpiresAt: state.latestEntryExpiresAt ?? null,
      });
    }
  }
  return {
    totalHandoffs: states.length,
    accountedHandoffs: states.length - unaccounted.length,
    allAccounted: unaccounted.length === 0,
    unaccounted,
    groups: haveNow ? { unexpiredUnaccounted, expiredUnaccounted } : null,
  };
}

export function summarizeIntakeStatuses(
  rows: ReadonlyArray<{ status: string; count: number }>,
  isTerminalStatus: (status: string) => boolean,
): { total: number; terminal: number; pending: number } {
  let total = 0;
  let terminal = 0;
  for (const row of rows) {
    const n = Number.isFinite(row.count) && row.count > 0 ? Math.floor(row.count) : 0;
    total += n;
    // Terminality is decided by paper-intake's isTerminalIntakeStatus, passed
    // in by the caller: an unrecognised status counts as pending, so an
    // uncertain state can never read as finished.
    if (isTerminalStatus(row.status)) terminal += n;
  }
  return { total, terminal, pending: total - terminal };
}
