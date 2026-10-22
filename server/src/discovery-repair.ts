export type LaneStatus = `active${string}` | `paused(${string})` | `shadow(${string})`;

export function assertTierRefreshComplete(catalogCount: number, assignedCount: number, assignmentComplete = true): void {
  if (catalogCount < 100) throw new Error(`Incomplete tier snapshot rejected before persistence (${catalogCount} ranked, ${assignedCount} assigned).`);
  if (!assignmentComplete || assignedCount === 0) throw new Error(`Incomplete tier snapshot rejected before persistence (${catalogCount} ranked, ${assignedCount} assigned).`);
}

export function classifyDiscoveryLanes(input: {
  tierSnapshotUsable: boolean;
  tierRunId: number | null;
  savedT1Count: number;
  catalogT1Intersection: number;
  catalogCount: number;
  velocityIndependent: boolean;
}): { tierLaneStatus: LaneStatus; velocityLaneStatus: LaneStatus; identityMismatch: boolean; legitimateZeroT1: boolean } {
  const identityMismatch = input.tierSnapshotUsable && input.savedT1Count > 0 && input.catalogT1Intersection === 0;
  const legitimateZeroT1 = input.tierSnapshotUsable && input.savedT1Count === 0;
  const tierLaneStatus: LaneStatus = !input.tierSnapshotUsable
    ? "paused(no usable tier snapshot)"
    : identityMismatch
      ? `paused(identity mismatch: 0/${input.savedT1Count} saved T1 coinIds intersect the fresh catalog)`
      : `active(snapshot #${input.tierRunId ?? "unknown"}; ${input.savedT1Count} saved T1 members; ${input.catalogT1Intersection} catalog intersections)`;
  const velocityLaneStatus: LaneStatus = input.catalogCount < 100
    ? `paused(ranked catalog degraded: ${input.catalogCount}/500)`
    : input.velocityIndependent
      ? "active(independent ranked-catalog 48H velocity path verified: selection uses catalog sparkline only; tier lookup is label/fallback context and is not an eligibility dependency)"
      : "shadow(tier independence not established)";
  return { tierLaneStatus, velocityLaneStatus, identityMismatch, legitimateZeroT1 };
}

export function healthyEmptyStatus(catalogCount: number, candidateCount: number): "empty" | "continue" | "failed" {
  if (catalogCount < 100) return "failed";
  return candidateCount === 0 ? "empty" : "continue";
}

export function namedTimeoutSummary(lastCheckpointStage: string | null, leaseId: string | null): string {
  return `Named timeout: execution deadline exceeded without completion. Last checkpoint: ${lastCheckpointStage ?? "none"}. Lease ${leaseId ?? "legacy-no-lease"} fenced.`;
}

export function validationBeforeScoring(catalogCount: number, scoring: () => void): "failed" | "scored" {
  if (catalogCount < 100) return "failed";
  scoring();
  return "scored";
}

// ── Batch 5 Part A (2026-10-20): discovery survival helpers. These are the
// pure, testable cores of the survival diffs; actions.ts wires them to the
// DB and the network. Survival/reliability only — nothing here touches tier
// definitions, gates, score weights, issuance, or schedules.

export type DiscoveryStageName = "tier-freshness" | "api-budgets" | "catalog-fetch" | "velocity" | "charts" | "hyperliquid" | "scoring" | "synthesis" | "persistence";

// A1b: per-stage caps. The 20-minute run deadline stays the outer bound;
// budgets stop one stage from consuming the whole run.
export const DISCOVERY_STAGE_BUDGET_MS: Record<DiscoveryStageName, number> = {
  "tier-freshness": 5 * 60_000,
  "api-budgets": 2 * 60_000,
  "catalog-fetch": 3 * 60_000,
  velocity: 2 * 60_000,
  charts: 4 * 60_000,
  hyperliquid: 90_000,
  scoring: 2 * 60_000,
  synthesis: 90_000,
  persistence: 2 * 60_000,
};

export class StageBudgetTimeoutError extends Error {
  constructor(readonly operation: string, readonly timeoutMs: number) {
    super(`timeout: ${operation} exceeded ${Math.round(timeoutMs / 1000)}s`);
    this.name = "StageBudgetTimeoutError";
  }
}

// Promise.race timeout for one discovery stage. The underlying work is not
// cancelled (same semantics as the existing withNamedTimeout); the stage
// await rejects so the run continues with partial data.
export async function withStageBudget<T>(operation: string, budgetMs: number, work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new StageBudgetTimeoutError(operation, budgetMs)), budgetMs); });
  try { return await Promise.race([work, timeout]); } finally { if (timer !== undefined) clearTimeout(timer); }
}

export function stageBudgetExhaustedDetail(_stage: DiscoveryStageName, budgetMs: number): string {
  return `stage budget exhausted after ${Math.round(budgetMs / 1000)}s; run continued with partial data`;
}

// A1a: when the per-run venue probe marks a leg dead, the per-coin attempts
// array records the skip explicitly — visible, never silent.
export function skippedVenueAttempt(provider: "Binance" | "CoinGecko"): { provider: "Binance" | "CoinGecko"; status: "provider_rejection"; detail: string } {
  return { provider, status: "provider_rejection", detail: "run-level probe failed; leg skipped" };
}

// A2: catalog cache decision. Fresh rows >= 100 win; otherwise a snapshot
// aged <= 24h serves; otherwise the run is honestly MISSED.
export const CATALOG_CACHE_MAX_AGE_MS = 24 * 60_000 * 60;
export const CATALOG_MISSED_MESSAGE = "MISSED — catalog unavailable and cache older than 24h (or absent)";
export const CATALOG_MISSED_SUMMARY = "MISSED — catalog unavailable and cache older than 24h; no fabrication, no retry in-run";
export const CATALOG_PAGE_RETRY_DELAYS_MS: readonly number[] = [2_000, 8_000, 32_000];

export type CatalogDecision =
  | { kind: "fresh"; rows: any[]; provenance: string }
  | { kind: "cached"; rows: any[]; provenance: string; ageMs: number }
  | { kind: "missed"; rows: []; provenance: string };

export function resolveCatalog(input: { freshRows: any[]; snapshot: { rows: any[]; fetchedAtMs: number } | null; nowMs: number }): CatalogDecision {
  if (input.freshRows.length >= 100) {
    return { kind: "fresh", rows: input.freshRows, provenance: `fresh ${new Date(input.nowMs).toISOString()} (2 pages)` };
  }
  if (input.snapshot) {
    const ageMs = Math.max(0, input.nowMs - input.snapshot.fetchedAtMs);
    if (ageMs <= CATALOG_CACHE_MAX_AGE_MS && input.snapshot.rows.length > 0) {
      return { kind: "cached", rows: input.snapshot.rows, provenance: `cached (age ${(ageMs / 3_600_000).toFixed(1)}h)`, ageMs };
    }
  }
  return { kind: "missed", rows: [], provenance: CATALOG_MISSED_MESSAGE };
}

// A3: stored-chart carry-forward decision — a coin whose stored sourceAsOf
// price moved <= 2% keeps its stored chart fields; movers and new coins get
// a fresh chart.
export function priceMovePct(storedPrice: number | null, currentPrice: number | null): number | null {
  if (storedPrice === null || currentPrice === null || storedPrice <= 0) return null;
  return Math.abs(currentPrice - storedPrice) / storedPrice * 100;
}

export function shouldCarryStoredChart(storedPrice: number | null, currentPrice: number | null, maxMovePct = 2): boolean {
  const move = priceMovePct(storedPrice, currentPrice);
  return move !== null && move <= maxMovePct;
}

// A4: fixed-size chunking for the chart gate's intermediate checkpoints.
export function chunkArray<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

// A5a: single-flight predicate — a run is "in flight" only while it is
// running, inside its deadline, and heartbeating within the last 3 minutes.
// It is an in-progress lock, never a done-lock: once no run matches, a fresh
// run can always start.
export const DISCOVERY_HEARTBEAT_FRESH_MS = 3 * 60_000;
export function isLiveDiscoveryLease(row: { status: string; deadlineAtMs: number | null; lastHeartbeatAtMs: number | null }, nowMs: number): boolean {
  return row.status === "running"
    && row.deadlineAtMs !== null && row.deadlineAtMs > nowMs
    && row.lastHeartbeatAtMs !== null && row.lastHeartbeatAtMs > nowMs - DISCOVERY_HEARTBEAT_FRESH_MS;
}

export function suppressedDuplicateMessage(runId: number, leaseId: string): string {
  return `suppressed duplicate invocation — run #${runId} already in flight (lease ${leaseId})`;
}

// A5b: retry-once with a bounded backoff. A second failure rethrows the
// ORIGINAL error so the failure record names the first fault, not the retry's.
export async function retryOnce<T>(work: () => Promise<T>, opts: { delayMs?: number; sleep?: (ms: number) => Promise<void> } = {}): Promise<T> {
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  try {
    return await work();
  } catch (firstError) {
    await sleep(opts.delayMs ?? 2_000);
    try {
      return await work();
    } catch {
      throw firstError;
    }
  }
}
