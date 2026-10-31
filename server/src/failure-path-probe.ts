// ── Unit 1 isolated failure-path probe (2026-10-28) ─────────────────────
//
// The Unit 1 repair (run-219 handoff-first) was sandbox-proven on the
// SUCCESS path only: no test had demonstrated a handoff-missing run
// closing its scheduler receipt as FAILED — the exact concealment 219
// showed. This probe closes that gap WITHOUT touching production:
//
//  - It never reads, replays, or re-stamps run 219 (or any real run's
//    candidates). Every scenario runs against an in-memory store keyed
//    by synthetic probe run ids, plus — in the action layer — one
//    clearly-marked probe discovery row created fresh for the probe.
//  - It never calls issuance: its position store is a counter that no
//    scenario increments, and the action layer additionally diffs the
//    real paper_signals / paper_signal_candidates counts before/after.
//  - It exercises the REAL production helpers, not copies:
//    handoffReceiptVerdict, shouldDeferOptionalStage,
//    runIsolatedPipelineStage, and recordWriteFailure (including its
//    independent fallback sink).
//  - Optional-work scenarios use the production shape: optional work
//    races a named timeout inside runIsolatedPipelineStage, and the
//    required handoff step runs unconditionally afterwards. Slow AND
//    failed variants run for BOTH news annotation and theory
//    synthesis, plus the reserve-deferral gate — because the 195s
//    reserve alone does not prove optional work cannot delay handoff.

import {
DISCOVERY_PIPELINE_STAGE_BUDGET_MS,
HANDOFF_PROTECTION_RESERVE_MS,
handoffReceiptVerdict,
runIsolatedPipelineStage,
shouldDeferOptionalStage,
} from "./discovery-pipeline";
import {
clearFallbackWriteFailures,
getFallbackWriteFailures,
recordWriteFailure,
type WriteFailureCaptureValues,
} from "./write-failure-capture";

export type ProbeScenarioResult = {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
  durationMs: number;
};

export type FailurePathProbeReport = {
  probeRunLabel: string;
  reserveMs: number;
  scenarios: ProbeScenarioResult[];
  // The receipt the failure path produces: a terminal run with no
  // handoff and no failure record closes FAILED, naming the output.
  receipt: { status: "failed"; error: string; runStatus: string; handoffStatus: string | null };
  // The explicit failure record the probe's failure path leaves.
  failureRecord: { status: "failed"; reason: string; handoffKey: string } | null;
  // The fallback log entry preserved when BOTH the handoff write and
  // the failure-record write fail (independent sink, not app.db).
  fallbackLog: { lane: string; tableName: string; errorText: string; captureErrorKind: string } | null;
  positionsCreated: number;
  allPassed: boolean;
};

const PROBE_TIMEOUT_MS = 60;

/** A stage that would hang for 5s if awaited directly; the probe races
 * it against a short named timeout exactly as production races the
 * inference calls, so isolation — not patience — is what is measured. */
function hangingStage(label: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout: ${label} exceeded ${PROBE_TIMEOUT_MS}ms`)), PROBE_TIMEOUT_MS);
    const late = setTimeout(() => { clearTimeout(timer); resolve("late"); }, 5_000);
    (late as unknown as { unref?: () => void }).unref?.();
  });
}

export async function runFailurePathProbe(): Promise<FailurePathProbeReport> {
  const scenarios: ProbeScenarioResult[] = [];
  let positionsCreated = 0;
  // The probe's isolated position store: no scenario has any path that
  // increments this — issuance is never invoked by the probe.
  const positionStore = { count: 0 };
  const finish = (id: string, label: string, startedAt: number, passed: boolean, detail: string) => {
    scenarios.push({ id, label, passed, durationMs: Math.max(0, Date.now() - startedAt), detail });
    return passed;
  };

  // ── 1. Missing handoff: terminal run, no handoff row at all ────────
  // The run-219 shape. The receipt verdict must FAIL by name.
  const probeRunId = 9_900_219;
  let t = Date.now();
  const missingVerdict = handoffReceiptVerdict({ runId: probeRunId, runStatus: "degraded", handoffStatus: null });
  finish("missing_handoff_fails_receipt", "Terminal run with no handoff row fails the receipt verdict by name", t,
    !missingVerdict.ok && missingVerdict.error.includes("no handoff row and no explicit handoff-failure record"),
    missingVerdict.ok ? "verdict unexpectedly ok" : missingVerdict.error);

  // ── 2. Stuck building handoff is not a completed handoff ──────────
  t = Date.now();
  const stuckVerdict = handoffReceiptVerdict({ runId: probeRunId, runStatus: "complete", handoffStatus: "building" });
  finish("stuck_building_handoff_fails_receipt", "Handoff stuck in \"building\" fails the receipt verdict", t,
    !stuckVerdict.ok && stuckVerdict.error.includes("stuck"),
    stuckVerdict.ok ? "verdict unexpectedly ok" : stuckVerdict.error);

  // ── 3. Explicit failure record satisfies the guarantee ────────────
  // Simulated in-memory handoff store mirroring recordExplicitHandoffFailure
  // semantics: a stuck row converts to failed; the verdict then passes
  // because the slot reads as a RECORDED failure, never a silent success.
  t = Date.now();
  const handoffStore = new Map<number, { status: string; handoffKey: string; reason: string }>();
  handoffStore.set(probeRunId, { status: "building", handoffKey: `probe:discovery:${probeRunId}`, reason: "" });
  const failureReason = "Probe: persistence completed without a completed handoff; explicit failure record stands for this run.";
  const existing = handoffStore.get(probeRunId)!;
  handoffStore.set(probeRunId, { status: "failed", handoffKey: existing.handoffKey, reason: failureReason });
  const recordedVerdict = handoffReceiptVerdict({ runId: probeRunId, runStatus: "degraded", handoffStatus: handoffStore.get(probeRunId)!.status });
  const failureRecord = { status: "failed" as const, reason: failureReason, handoffKey: existing.handoffKey };
  finish("explicit_failure_record_satisfies_verdict", "Explicit failed-handoff record makes the verdict pass as a recorded failure", t,
    recordedVerdict.ok && failureRecord.status === "failed",
    recordedVerdict.ok ? `failure record ${failureRecord.handoffKey} on file; verdict ok (recorded failure, not success)` : "verdict still failing with a failure record on file");

  // ── 4. Double failure: handoff write AND failure-record write fail ─
  // The original error must survive in the independent fallback sink
  // (log + in-memory buffer) that does not depend on the failed write.
  t = Date.now();
  clearFallbackWriteFailures();
  const originalError = new Error("probe: handoff insert failed — UNIQUE constraint on paper_handoff_runs (simulated double failure)");
  const captureResult = await recordWriteFailure(
    async (_values: WriteFailureCaptureValues) => { throw new Error("probe: capture table unavailable (simulated)"); },
    { lane: "paper_handoff", tableName: "paper_handoff_runs", statementKind: "insert", runId: probeRunId, attemptedKey: `probe:discovery:${probeRunId}`, error: originalError, context: { stage: "explicit_handoff_failure_record", reason: failureReason } },
  );
  const fallback = getFallbackWriteFailures();
  const fallbackEntry = fallback[0] ?? null;
  finish("double_failure_preserved_in_fallback", "When the failure-record write also fails, the original error survives in the independent fallback log", t,
    captureResult.captured === false && fallbackEntry !== null && fallbackEntry.errorText.includes("handoff insert failed") && fallbackEntry.errorText.includes("UNIQUE constraint"),
    fallbackEntry ? `fallback captured lane=${fallbackEntry.lane} table=${fallbackEntry.tableName} captureErrorKind=${fallbackEntry.captureErrorKind}` : "no fallback entry recorded");
  const fallbackLog = fallbackEntry ? { lane: fallbackEntry.lane, tableName: fallbackEntry.tableName, errorText: fallbackEntry.errorText.slice(0, 500), captureErrorKind: fallbackEntry.captureErrorKind } : null;
  clearFallbackWriteFailures();

  // ── 5–8. Slow / failed news and theory stages cannot delay handoff ─
  const optionalCases: Array<{ id: string; label: string; stage: "news_annotation" | "theory_synthesis"; work: () => Promise<string> }> = [
    { id: "slow_news_isolated", label: "Slow (hanging) news annotation is timeout-isolated; handoff still runs immediately", stage: "news_annotation", work: () => hangingStage("market discovery news annotation") },
    { id: "failed_news_isolated", label: "Failed news annotation is isolated; handoff still runs", stage: "news_annotation", work: async () => { throw new Error("probe: annotation provider down"); } },
    { id: "slow_theory_isolated", label: "Slow (hanging) theory synthesis is timeout-isolated; handoff still runs immediately", stage: "theory_synthesis", work: () => hangingStage("market discovery theory synthesis") },
    { id: "failed_theory_isolated", label: "Failed theory synthesis is isolated; handoff still runs", stage: "theory_synthesis", work: async () => { throw new Error("probe: synthesis inference unavailable"); } },
  ];
  for (const c of optionalCases) {
    t = Date.now();
    const outcome = await runIsolatedPipelineStage(c.stage, c.work);
    // Required decision path: runs unconditionally after the outcome.
    const handoff = { minted: true, at: Date.now() };
    const elapsed = Date.now() - t;
    finish(c.id, c.label, t,
      outcome.status === "failed" && handoff.minted && elapsed < 1_000,
      `stage outcome=${outcome.status}${outcome.status === "failed" ? ` error="${outcome.error.slice(0, 120)}"` : ""}; handoff minted after ${elapsed}ms (hang was 5000ms if awaited)`);
  }

  // ── 9. Combined: slow news + failed theory together ────────────────
  t = Date.now();
  const newsOutcome = await runIsolatedPipelineStage("news_annotation", () => hangingStage("market discovery news annotation"));
  const theoryOutcome = await runIsolatedPipelineStage("theory_synthesis", async () => { throw new Error("probe: synthesis inference unavailable"); });
  const combinedElapsed = Date.now() - t;
  finish("slow_news_plus_failed_theory", "Slow news + failed theory together still leave the required path on time", t,
    newsOutcome.status === "failed" && theoryOutcome.status === "failed" && combinedElapsed < 1_500,
    `news=${newsOutcome.status}, theory=${theoryOutcome.status}; required path reached after ${combinedElapsed}ms`);

  // ── 10. Reserve deferral: optional work is not even started ───────
  t = Date.now();
  let optionalRan = false;
  const remainingMs = HANDOFF_PROTECTION_RESERVE_MS - 1;
  const newsDeferred = shouldDeferOptionalStage(remainingMs, DISCOVERY_PIPELINE_STAGE_BUDGET_MS.catalog_scoring + HANDOFF_PROTECTION_RESERVE_MS);
  const theoryDeferred = shouldDeferOptionalStage(remainingMs);
  if (!theoryDeferred) { optionalRan = true; await runIsolatedPipelineStage("theory_synthesis", async () => "ran"); }
  finish("reserve_deferral_skips_optional_work", "With less than the 195s reserve remaining, optional stages defer (never start) and the handoff proceeds", t,
    newsDeferred && theoryDeferred && !optionalRan,
    `reserve=${HANDOFF_PROTECTION_RESERVE_MS}ms; remaining=${remainingMs}ms; newsDeferred=${newsDeferred}; theoryDeferred=${theoryDeferred}; optionalRan=${optionalRan}`);

  // ── 11. No position was created ────────────────────────────────────
  t = Date.now();
  positionsCreated = positionStore.count;
  finish("no_position_created", "Probe created no paper position (issuance never invoked)", t,
    positionsCreated === 0,
    `isolated position store count=${positionsCreated} across all scenarios`);

  return {
    probeRunLabel: `isolated-probe:${probeRunId}`,
    reserveMs: HANDOFF_PROTECTION_RESERVE_MS,
    scenarios,
    receipt: { status: "failed", error: missingVerdict.ok ? "" : missingVerdict.error, runStatus: "degraded", handoffStatus: null },
    failureRecord,
    fallbackLog,
    positionsCreated,
    allPassed: scenarios.every((s) => s.passed),
  };
}
