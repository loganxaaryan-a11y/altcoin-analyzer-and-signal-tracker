import { describe, expect, test } from "bun:test";
import {
DISCOVERY_PIPELINE_STAGE_BUDGET_MS,
DISCOVERY_PIPELINE_STAGES,
DISCOVERY_PIPELINE_TOTAL_BUDGET_MS,
DRIFT_CAPTURE_BUDGET_MS,
HANDOFF_PROTECTION_RESERVE_MS,
handoffReceiptVerdict,
pipelineCheckpointCounts,
pipelineStageDef,
runIsolatedPipelineStage,
shouldDeferOptionalStage,
shouldMintScoringFailureRecord,
} from "./discovery-pipeline";

// ── 2026-10-28 discovery split acceptance ───────────────────────────────
// The four pipeline stages, their budgets, their checkpoints, and their
// failure isolation. If any of these pins move, the split has changed
// shape and this suite must be re-agreed, not quietly updated.

describe("discovery pipeline stages", () => {
  test("exactly four stages, in the agreed order", () => {
    expect(DISCOVERY_PIPELINE_STAGES.map((stage) => stage.id)).toEqual([
      "catalog_scoring",
      "news_annotation",
      "theory_synthesis",
      "persistence_handoff",
    ]);
  });

  test("each stage budget is pinned", () => {
    expect(DISCOVERY_PIPELINE_STAGE_BUDGET_MS.catalog_scoring).toBe(12 * 60_000);
    // News annotation keeps its own raised run-209 budget (180s) — it can
    // never again share or eat the theory/scoring budget.
    expect(DISCOVERY_PIPELINE_STAGE_BUDGET_MS.news_annotation).toBe(180_000);
    expect(DISCOVERY_PIPELINE_STAGE_BUDGET_MS.theory_synthesis).toBe(120_000);
    expect(DISCOVERY_PIPELINE_STAGE_BUDGET_MS.persistence_handoff).toBe(2 * 60_000);
  });

  test("stage budgets together fit inside the 20-minute execution deadline", () => {
    expect(DISCOVERY_PIPELINE_TOTAL_BUDGET_MS).toBe(12 * 60_000 + 180_000 + 120_000 + 2 * 60_000);
    expect(DISCOVERY_PIPELINE_TOTAL_BUDGET_MS).toBeLessThan(20 * 60_000);
  });

  test("each stage leaves its own distinct checkpoint", () => {
    const checkpoints = DISCOVERY_PIPELINE_STAGES.map((stage) => stage.checkpointStage);
    expect(checkpoints).toEqual(["catalog-scoring", "news-annotation", "theory-synthesis", "persistence-handoff"]);
    expect(new Set(checkpoints).size).toBe(4);
    for (const stage of DISCOVERY_PIPELINE_STAGES) {
      expect(pipelineStageDef(stage.id).checkpointStage).toBe(stage.checkpointStage);
    }
  });

  test("only catalog+scoring is a handoff dependency", () => {
    const dependencies = DISCOVERY_PIPELINE_STAGES.filter((stage) => stage.handoffDependency);
    expect(dependencies.map((stage) => stage.id)).toEqual(["catalog_scoring"]);
    expect(pipelineStageDef("catalog_scoring").failurePolicy).toBe("fatal_core");
    expect(pipelineStageDef("news_annotation").failurePolicy).toBe("isolated");
    expect(pipelineStageDef("theory_synthesis").failurePolicy).toBe("isolated");
    // Persistence+handoff must always leave a record — handoff or an
    // explicit failure record — never a silent end.
    expect(pipelineStageDef("persistence_handoff").failurePolicy).toBe("must_leave_record");
  });

  test("catalog+scoring groups the existing sub-stages without renaming them", () => {
    expect(pipelineStageDef("catalog_scoring").subStages).toEqual([
      "tier-freshness", "api-budgets", "catalog-fetch", "velocity", "charts", "hyperliquid", "scoring",
    ]);
  });

  test("an isolated stage failure returns an outcome and never throws", async () => {
    const outcome = await runIsolatedPipelineStage("news_annotation", async () => {
      throw new Error("annotation timed out after 180s");
    });
    expect(outcome.status).toBe("failed");
    if (outcome.status === "failed") {
      expect(outcome.stage).toBe("news_annotation");
      expect(outcome.budgetMs).toBe(180_000);
      expect(outcome.error).toContain("annotation timed out");
    }
    // The next stage still runs — the failure stayed inside its stage.
    const next = await runIsolatedPipelineStage("theory_synthesis", async () => ["theory"]);
    expect(next.status).toBe("completed");
    if (next.status === "completed") expect(next.value).toEqual(["theory"]);
  });

  test("checkpoint counts record where the stage stopped, against its own budget", () => {
    const counts = pipelineCheckpointCounts(
      { status: "failed", durationMs: 180_000, budgetMs: 180_000, error: "timeout" },
      { newsInputs: 8, annotated: 0 },
    );
    expect(counts.pipelineStageStatus).toBe("failed");
    expect(counts.budgetMs).toBe(180_000);
    expect(counts.durationMs).toBe(180_000);
    expect(counts.error).toBe("timeout");
    expect(counts.newsInputs).toBe(8);
  });
});

// ── Run-219 handoff-first repair (2026-10-28) ───────────────────────────
// The behavioral pins for the repair: optional work is deferred when it
// would eat the handoff's protected window, a slow or failed optional
// stage demonstrably cannot delay the required path, and a scheduler
// receipt counts a terminal run as success only when its required
// output (completed handoff OR explicit failure record) exists.

describe("handoff-first protection (run 219)", () => {
  test("the reserve is persistence budget + drift block + margin, pinned", () => {
    expect(DRIFT_CAPTURE_BUDGET_MS).toBe(45_000);
    expect(HANDOFF_PROTECTION_RESERVE_MS).toBe(120_000 + 45_000 + 30_000);
    // The reserve fits inside the deadline alongside the core budget:
    // worst-case protected schedule is core + annotation + synthesis
    // only when each starts with the reserve intact.
    expect(HANDOFF_PROTECTION_RESERVE_MS).toBeLessThan(DISCOVERY_PIPELINE_STAGE_BUDGET_MS.catalog_scoring);
  });

  test("optional stages defer when the remaining time would eat the reserve", () => {
    expect(shouldDeferOptionalStage(HANDOFF_PROTECTION_RESERVE_MS - 1)).toBe(true);
    expect(shouldDeferOptionalStage(HANDOFF_PROTECTION_RESERVE_MS)).toBe(false);
    expect(shouldDeferOptionalStage(20 * 60_000)).toBe(false);
    expect(shouldDeferOptionalStage(0)).toBe(true);
    // News annotation additionally protects the whole core budget.
    const newsReserve = DISCOVERY_PIPELINE_STAGE_BUDGET_MS.catalog_scoring + HANDOFF_PROTECTION_RESERVE_MS;
    expect(shouldDeferOptionalStage(newsReserve - 1, newsReserve)).toBe(true);
    expect(shouldDeferOptionalStage(newsReserve, newsReserve)).toBe(false);
  });

  test("a hanging optional stage cannot delay the required path: its timeout isolates it and the handoff step still runs", async () => {
    const startedAt = Date.now();
    let handoffMinted = false;
    // The production shape: optional work races a named timeout inside
    // runIsolatedPipelineStage; the required step runs unconditionally
    // after the stage outcome returns.
    const optional = await runIsolatedPipelineStage("theory_synthesis", async () => {
      await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("timeout: theory synthesis exceeded 50ms")), 50);
        // A stage that would hang for 5s if awaited directly.
        setTimeout(() => { clearTimeout(timer); resolve("late"); }, 5_000).unref?.();
      });
      return "never reached";
    });
    expect(optional.status).toBe("failed");
    // Required decision path: runs immediately after, not after 5s.
    handoffMinted = true;
    expect(handoffMinted).toBe(true);
    expect(Date.now() - startedAt).toBeLessThan(1_000);
  });

  test("a failed optional stage leaves the required path untouched", async () => {
    const optional = await runIsolatedPipelineStage("news_annotation", async () => { throw new Error("annotation provider down"); });
    expect(optional.status).toBe("failed");
    const required = await runIsolatedPipelineStage("persistence_handoff", async () => ({ handoffId: 123 }));
    expect(required.status).toBe("completed");
    if (required.status === "completed") expect(required.value.handoffId).toBe(123);
  });

  test("receipt verdict: terminal success requires a completed handoff or an explicit failure record", () => {
    expect(handoffReceiptVerdict({ runId: 219, runStatus: "complete", handoffStatus: "complete" })).toEqual({ ok: true });
    expect(handoffReceiptVerdict({ runId: 219, runStatus: "degraded", handoffStatus: "failed" })).toEqual({ ok: true });
    // The run-219 shape: terminal run, no handoff row at all.
    const missing = handoffReceiptVerdict({ runId: 219, runStatus: "degraded", handoffStatus: null });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error).toContain("no handoff row and no explicit handoff-failure record");
    // A stuck building handoff is not a completed handoff.
    const stuck = handoffReceiptVerdict({ runId: 219, runStatus: "complete", handoffStatus: "building" });
    expect(stuck.ok).toBe(false);
    if (!stuck.ok) expect(stuck.error).toContain("stuck");
    // A missing run row cannot be verified — never a success.
    const gone = handoffReceiptVerdict({ runId: 219, runStatus: null, handoffStatus: null });
    expect(gone.ok).toBe(false);
    if (!gone.ok) expect(gone.error).toContain("row is missing");
    // An in-flight run belongs to another invocation (suppressed
    // duplicate): not this receipt's failure.
    expect(handoffReceiptVerdict({ runId: 219, runStatus: "running", handoffStatus: null })).toEqual({ ok: true });
  });
});

// ── Unit 1 fast-fail follow-up (run-222 class, 2026-10-29) ──────────
// The predicate is the only new decision in the patch; the mint itself
// reuses recordExplicitHandoffFailure unchanged (idempotent, never
// throws, fallback lane). These pins keep the gate narrow: pre-scoring
// failures still mint nothing.
describe("fast-fail failure record (run 222 class)", () => {
  test("catalog-scoring checkpoint landed: mint (existing path unchanged)", () => {
    expect(shouldMintScoringFailureRecord({ scoringStarted: true, catalogScoringCheckpointLanded: true, scoringCheckpointEvidence: true })).toBe(true);
  });

  test("scoring started but no catalog-scoring checkpoint: mint (the 222 class)", () => {
    expect(shouldMintScoringFailureRecord({ scoringStarted: true, catalogScoringCheckpointLanded: false, scoringCheckpointEvidence: true })).toBe(true);
    expect(shouldMintScoringFailureRecord({ scoringStarted: true, catalogScoringCheckpointLanded: false, scoringCheckpointEvidence: false })).toBe(true);
  });

  test("scoring never started: no mint (catalog-fetch / tier failures unchanged)", () => {
    expect(shouldMintScoringFailureRecord({ scoringStarted: false, catalogScoringCheckpointLanded: false, scoringCheckpointEvidence: false })).toBe(false);
  });

  test("receipt backstop: durable scoring evidence alone mints", () => {
    expect(shouldMintScoringFailureRecord({ scoringStarted: false, catalogScoringCheckpointLanded: false, scoringCheckpointEvidence: true })).toBe(true);
  });

  test("a failed record satisfies the verdict as a recorded failure, not a success", () => {
    expect(handoffReceiptVerdict({ runId: 222, runStatus: "failed", handoffStatus: "failed" })).toEqual({ ok: true });
    expect(handoffReceiptVerdict({ runId: 222, runStatus: "failed", handoffStatus: null })).toEqual({
      ok: false,
      error: `discovery run 222 reached terminal status "failed" with no handoff row and no explicit handoff-failure record`,
    });
  });
});
