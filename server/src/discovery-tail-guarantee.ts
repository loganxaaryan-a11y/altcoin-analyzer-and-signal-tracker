// ── Discovery tail guarantee (run-239 class, 2026-10-30) ─────────────
//
// Run 239 finished scoring and then vanished: no handoff, no failure
// record, no capture row, its run row stuck "running" with a frozen
// heartbeat until the next run's reaper fenced it. The existing
// catch-block + receipt-backstop machinery already guarantees a failure
// record for every failure mode in which JavaScript still executes —
// but only if the failure REACHES it as a rejection. An unbounded
// await (a hung database call in the tail persistence sequence, which
// had no timeout on the run-row update, the rotation upsert, the signal
// and news writes, the cleanup deletes, or the summary update) never
// rejects: the worker is killed by the platform instead, the catch never
// runs, and the slot reads as a silent gap.
//
// This module is the testable core of the guarantee the actions.ts
// wiring applies at the tail (theory synthesis → persistence + handoff):
//
//   1. Every tail step runs BOUNDED (withStageBudget race semantics:
//      the await rejects at the budget; the underlying work is not
//      cancelled — same contract as every other stage budget in this
//      codebase). A hang therefore becomes a timeout outcome, not a
//      frozen row.
//   2. Every non-handoff tail outcome is CAPTURED at its boundary
//      through the existing never-throwing capture path (the
//      stage-boundary helpers in discovery-write-capture.ts). Capture
//      failure can never mask the outcome: it is guarded here and,
//      in production, recordWriteFailure never throws at all.
//   3. Every tail execution ends in exactly one of three outcomes —
//      the return type has NO silent variant:
//        - "handoff": persistence minted a handoff read back as
//          complete (degraded=true when theory failed or deferred —
//          the handoff still stands, as the isolated-stage contract
//          requires).
//        - "explicit_failure_recorded": persistence threw, timed out,
//          or completed without a complete handoff, and the idempotent
//          explicit failure record was written. This is the same record
//          the catch block and receipt backstop mint; idempotency means
//          a record the catch already minted is returned, not
//          duplicated, if both paths ever run.
//        - "capture_only": the failure record itself could not be
//          written (recordFailure threw or returned null). The
//          boundary capture rows still stand as the durable record, and
//          the outcome names that. In production recordExplicitHandoff-
//          Failure never throws (fallback lane), so this outcome is
//          unreachable there — it exists so the orchestrator can never
//          throw or go silent even if its last resort fails.
//
// What this module CANNOT cover — stated explicitly, not buried: if the
// platform worker process itself is killed (out of memory, platform
// interruption, any death in which no JavaScript executes afterwards),
// no in-run code can mint anything. What survives such a death after
// this patch is strictly more than before: boundary captures for every
// completed stage, the stage checkpoints that already landed, the
// scheduler run's FAILED receipt naming the missing output, and the
// next run's reaper fencing record — a diagnosable recorded failure,
// never a silent gap. Prevention of process death itself is a platform
// property, not something artifact code can guarantee.
//
// No strategy, gate, threshold, freeze, entry-contract, or cadence
// behavior lives in this module: it only decides the tail's terminal
// outcome from step results the caller supplies. Budgets are caller
// supplied; the wiring passes the persistence stage budget (120s) for
// persistence and the synthesis budget (120s) for theory — both
// unchanged from the 2026-10-28 split.

import { StageBudgetTimeoutError, withStageBudget } from "./discovery-repair";
import {
captureStageBoundaryCapture,
type DiscoveryCaptureFn,
type DiscoveryStageBoundaryId,
} from "./discovery-write-capture";

export type DiscoveryTailTheoryStatus = "completed" | "failed" | "deferred";

export type DiscoveryTailStepId = "theory_synthesis" | "persistence_handoff";

export type DiscoveryTailTheoryResult = {
  status: DiscoveryTailTheoryStatus;
  /** Detail carried when status is "failed" (the section's own error). */
  error?: string;
};

export type DiscoveryTailPersistenceResult = {
  handoffId: number | null;
  /** The persistence section's own read-back status. */
  handoffStatus: "complete" | "failed" | "building" | null;
};

export type DiscoveryTailGuaranteeOutcome =
  | {
      outcome: "handoff";
      handoffId: number | null;
      theoryStatus: DiscoveryTailTheoryStatus;
      degraded: boolean;
    }
  | {
      outcome: "explicit_failure_recorded";
      recordId: number | null;
      failedStep: DiscoveryTailStepId;
      theoryStatus: DiscoveryTailTheoryStatus;
    }
  | {
      outcome: "capture_only";
      failedStep: DiscoveryTailStepId;
      theoryStatus: DiscoveryTailTheoryStatus;
      detail: string;
    };

type BoundedStepOutcome<T> =
  | { step: DiscoveryTailStepId; status: "completed"; value: T }
  | { step: DiscoveryTailStepId; status: "failed"; error: string }
  | { step: DiscoveryTailStepId; status: "timeout"; error: string };

/** One tail step under a hard budget. Timeout and throw both come back
 * as outcomes, never as throws — the caller routes them to the
 * guarantee, it never catches them. Mirrors withStageBudget semantics:
 * the underlying work is not cancelled, only the await is bounded. */
async function runBoundedTailStep<T>(
  step: DiscoveryTailStepId,
  budgetMs: number,
  work: () => Promise<T>,
): Promise<BoundedStepOutcome<T>> {
  try {
    const value = await withStageBudget(`discovery tail ${step}`, budgetMs, work());
    return { step, status: "completed", value };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 220) : `${step} failed`;
    if (error instanceof StageBudgetTimeoutError) return { step, status: "timeout", error: message };
    return { step, status: "failed", error: message };
  }
}

/** Capture that can never mask the outcome. Production capture never
 * throws (recordWriteFailure's own contract); the guard exists so a
 * non-production capture fn cannot break the guarantee either. */
async function safeCapture(
  capture: DiscoveryCaptureFn,
  runId: string | number,
  boundary: DiscoveryStageBoundaryId,
  error: unknown,
): Promise<void> {
  try {
    await captureStageBoundaryCapture(capture, { runId, boundary }, error);
  } catch {
    /* capture failure is itself captured by recordWriteFailure's
       fallback sink in production; here it must never mask the outcome */
  }
}

/** Failure-record write that can never throw the orchestrator: a throwing
 * record fn degrades to null (→ "capture_only"), never to silence. */
async function safeRecordFailure(
  recordFailure: (reason: string) => Promise<number | null>,
  reason: string,
): Promise<number | null> {
  try {
    return await recordFailure(reason);
  } catch {
    return null;
  }
}

/**
 * Run the post-scoring tail (theory synthesis → persistence + handoff)
 * to its guaranteed terminal outcome. Never throws for any step failure,
 * timeout, or record-write failure: the return type has no silent
 * variant. Pre-scoring failures are NOT this function's contract — a
 * run that never scored has nothing to hand off, and the existing
 * catch-block + receipt machinery (unchanged) owns its terminal record.
 */
export async function runDiscoveryTail(args: {
  capture: DiscoveryCaptureFn;
  runId: string | number;
  theoryBudgetMs: number;
  persistenceBudgetMs: number;
  theory: () => Promise<DiscoveryTailTheoryResult>;
  persistence: () => Promise<DiscoveryTailPersistenceResult>;
  recordFailure: (reason: string) => Promise<number | null>;
}): Promise<DiscoveryTailGuaranteeOutcome> {
  // Theory is isolated by contract: its failure degrades the run and
  // never blocks persistence. A throw or a timeout is captured at the
  // theory boundary and the run continues degraded.
  const theoryOutcome = await runBoundedTailStep("theory_synthesis", args.theoryBudgetMs, args.theory);
  let theoryStatus: DiscoveryTailTheoryStatus = "completed";
  if (theoryOutcome.status === "completed") {
    theoryStatus = theoryOutcome.value.status;
    if (theoryStatus === "failed") {
      await safeCapture(args.capture, args.runId, "theory-synthesis", theoryOutcome.value.error ?? "theory synthesis failed in isolation");
    }
  } else {
    theoryStatus = "failed";
    await safeCapture(args.capture, args.runId, "theory-synthesis", theoryOutcome.error);
  }

  // Persistence must leave a record: a minted handoff read back as
  // complete, or an explicit failure record. Any other ending is a
  // capture plus a failure-record attempt — never silence.
  const persistenceOutcome = await runBoundedTailStep("persistence_handoff", args.persistenceBudgetMs, args.persistence);
  if (persistenceOutcome.status === "completed" && persistenceOutcome.value.handoffStatus === "complete") {
    return {
      outcome: "handoff",
      handoffId: persistenceOutcome.value.handoffId,
      theoryStatus,
      degraded: theoryStatus !== "completed",
    };
  }

  const failedStep: DiscoveryTailStepId = "persistence_handoff";
  if (persistenceOutcome.status !== "completed") {
    await safeCapture(args.capture, args.runId, "persistence-handoff", persistenceOutcome.error);
  } else {
    await safeCapture(
      args.capture,
      args.runId,
      "persistence-handoff",
      `persistence completed without a complete handoff (read-back status "${persistenceOutcome.value.handoffStatus ?? "none"}")`,
    );
  }
  const reason =
    persistenceOutcome.status === "completed"
      ? `Persistence completed without a complete handoff (read-back status "${persistenceOutcome.value.handoffStatus ?? "none"}"); the tail guarantee wrote this explicit failure record instead of ending silently.`
      : `Discovery tail step persistence_handoff ${persistenceOutcome.status}: ${persistenceOutcome.error}. The tail guarantee wrote this explicit failure record instead of ending silently.`;
  const recordId = await safeRecordFailure(args.recordFailure, reason);
  if (recordId !== null) {
    return { outcome: "explicit_failure_recorded", recordId, failedStep, theoryStatus };
  }
  return {
    outcome: "capture_only",
    failedStep,
    theoryStatus,
    detail: "explicit failure record could not be written; stage-boundary captures stand as the record",
  };
}
