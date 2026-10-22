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
