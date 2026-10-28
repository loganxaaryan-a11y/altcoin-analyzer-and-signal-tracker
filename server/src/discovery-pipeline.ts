// ── Discovery pipeline stages (2026-10-28 split) ────────────────────────
//
// Discovery used to be one long chain — catalog, scoring, news annotation,
// theory synthesis, persistence, handoff minting — inside a single run, so
// one slow stage could eat the whole slot (run 209: news annotation burned
// its budget inside the giant run and the run ended with no handoff).
//
// The run is now organised as FOUR pipeline stages. The stage boundaries
// are internal stage records within the existing run (no new scheduler
// jobs, no new run rows): each stage carries its own budget, leaves its
// own checkpoint in market_discovery_checkpoints (via discoveryCheckpoint
// in actions.ts, keyed by `checkpointStage` below), and fails alone —
// a failed news or theory stage degrades the run, it never takes scoring
// or the handoff down with it. Only catalog+scoring is a handoff
// dependency: persistence+handoff runs whenever scoring completed, and a
// run that reaches the end of persistence without a handoff row gets an
// explicit failed-handoff record instead of silence.
//
// Nothing here touches the model, thresholds, gates, the freeze, the
// drift bound, or the entry contract. The sub-stage budgets in
// discovery-repair.ts (DISCOVERY_STAGE_BUDGET_MS) are unchanged and keep
// bounding the work inside catalog+scoring.
//
// Lighter-by-construction rules the wiring in actions.ts follows:
//  - News annotation reuses the evidence string built once from the
//    retained news rows (buildNewsAnnotationEvidence: first 8 items,
//    snippets truncated) — no second evidence build for theory synthesis,
//    which reads the same `newsEvidence` string scoring already produced.
//  - Theory synthesis evidence is built once from the research pool and
//    reused for every theory in the stage; nothing is re-scored.
//  - Persistence looks up prior discovery signals ONLY for the coinIds
//    this run retained (scoped query), instead of re-reading the newest
//    5,000 stored signal rows on every run.
//  - The handoff snapshot is minted from the candidates scoring already
//    produced; persistence never re-runs scoring, the veto, or levels.

import { DISCOVERY_NEWS_ANNOTATION_TIMEOUT_MS } from "./discovery-repair";

export type DiscoveryPipelineStageId =
  | "catalog_scoring"
  | "news_annotation"
  | "theory_synthesis"
  | "persistence_handoff";

export type DiscoveryPipelineFailurePolicy =
  // The core: if it fails, the run fails — but the failure is the run's
  // own terminal record, and no handoff is minted for unscored work.
  | "fatal_core"
  // The stage's failure is recorded (source status + checkpoint) and the
  // run continues degraded without it.
  | "isolated"
  // The stage must always leave a record: a completed handoff row, or an
  // explicit failed-handoff record naming the failure. Never silence.
  | "must_leave_record";

export interface DiscoveryPipelineStageDef {
  id: DiscoveryPipelineStageId;
  label: string;
  // Stage name written to market_discovery_checkpoints and to the run's
  // lastCheckpointStage / stageDurationsJson.
  checkpointStage: string;
  budgetMs: number;
  failurePolicy: DiscoveryPipelineFailurePolicy;
  // True only for the one stage a handoff strictly depends on.
  handoffDependency: boolean;
  // Existing sub-stages (discovery-repair budgets) grouped under this
  // pipeline stage; empty for stages that are a single bounded call.
  subStages: readonly string[];
}

// Theory synthesis keeps the exact budget it already had (120s, the
// DISCOVERY_SYNTHESIS_TIMEOUT_MS in actions.ts); news annotation keeps
// its own raised 180s budget from the run-209 repair. Catalog+scoring is
// the core and gets the bulk of the 20-minute execution deadline;
// persistence+handoff matches the existing 120s persistence sub-budget.
export const DISCOVERY_PIPELINE_STAGE_BUDGET_MS: Record<DiscoveryPipelineStageId, number> = {
  catalog_scoring: 12 * 60_000,
  news_annotation: DISCOVERY_NEWS_ANNOTATION_TIMEOUT_MS,
  theory_synthesis: 120_000,
  persistence_handoff: 2 * 60_000,
};

export const DISCOVERY_PIPELINE_STAGES: readonly DiscoveryPipelineStageDef[] = [
  {
    id: "catalog_scoring",
    label: "Catalog + scoring",
    checkpointStage: "catalog-scoring",
    budgetMs: DISCOVERY_PIPELINE_STAGE_BUDGET_MS.catalog_scoring,
    failurePolicy: "fatal_core",
    handoffDependency: true,
    subStages: ["tier-freshness", "api-budgets", "catalog-fetch", "velocity", "charts", "hyperliquid", "scoring"],
  },
  {
    id: "news_annotation",
    label: "News annotation",
    checkpointStage: "news-annotation",
    budgetMs: DISCOVERY_PIPELINE_STAGE_BUDGET_MS.news_annotation,
    failurePolicy: "isolated",
    handoffDependency: false,
    subStages: [],
  },
  {
    id: "theory_synthesis",
    label: "Theory synthesis",
    checkpointStage: "theory-synthesis",
    budgetMs: DISCOVERY_PIPELINE_STAGE_BUDGET_MS.theory_synthesis,
    failurePolicy: "isolated",
    handoffDependency: false,
    subStages: [],
  },
  {
    id: "persistence_handoff",
    label: "Persistence + handoff minting",
    checkpointStage: "persistence-handoff",
    budgetMs: DISCOVERY_PIPELINE_STAGE_BUDGET_MS.persistence_handoff,
    failurePolicy: "must_leave_record",
    handoffDependency: false,
    subStages: ["persistence"],
  },
] as const;

export const DISCOVERY_PIPELINE_TOTAL_BUDGET_MS: number =
  DISCOVERY_PIPELINE_STAGES.reduce((sum, stage) => sum + stage.budgetMs, 0);

export function pipelineStageDef(id: DiscoveryPipelineStageId): DiscoveryPipelineStageDef {
  const def = DISCOVERY_PIPELINE_STAGES.find((stage) => stage.id === id);
  if (!def) throw new Error(`Unknown discovery pipeline stage: ${id}`);
  return def;
}

export type PipelineStageOutcome<T> =
  | { stage: DiscoveryPipelineStageId; status: "completed"; durationMs: number; budgetMs: number; value: T }
  | { stage: DiscoveryPipelineStageId; status: "failed"; durationMs: number; budgetMs: number; error: string };

// Run one isolated pipeline stage: the stage's own failure comes back as
// an outcome, never as a throw, so the caller records it and the run
// continues with the remaining stages. Used for the stages whose work is
// a single bounded unit (news annotation / theory synthesis semantics);
// the fatal core keeps its existing throw-to-terminal handling.
export async function runIsolatedPipelineStage<T>(
  id: DiscoveryPipelineStageId,
  work: () => Promise<T>,
  nowMs: () => number = Date.now,
): Promise<PipelineStageOutcome<T>> {
  const def = pipelineStageDef(id);
  const startedAt = nowMs();
  try {
    const value = await work();
    return { stage: id, status: "completed", durationMs: Math.max(0, nowMs() - startedAt), budgetMs: def.budgetMs, value };
  } catch (error) {
    return {
      stage: id,
      status: "failed",
      durationMs: Math.max(0, nowMs() - startedAt),
      budgetMs: def.budgetMs,
      error: error instanceof Error ? error.message.slice(0, 220) : `${def.label} failed`,
    };
  }
}

// The counts object a pipeline-stage checkpoint persists: where the stage
// stopped, against its own budget, plus the stage's own tallies.
export function pipelineCheckpointCounts(
  outcome: { status: string; durationMs: number; budgetMs: number; error?: string },
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ...extra,
    pipelineStageStatus: outcome.status,
    budgetMs: outcome.budgetMs,
    durationMs: outcome.durationMs,
    ...(outcome.error ? { error: outcome.error } : {}),
  };
}
