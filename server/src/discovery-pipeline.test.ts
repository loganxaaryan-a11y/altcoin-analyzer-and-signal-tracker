import { describe, expect, test } from "bun:test";
import {
  DISCOVERY_PIPELINE_STAGE_BUDGET_MS,
  DISCOVERY_PIPELINE_STAGES,
  DISCOVERY_PIPELINE_TOTAL_BUDGET_MS,
  pipelineCheckpointCounts,
  pipelineStageDef,
  runIsolatedPipelineStage,
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
