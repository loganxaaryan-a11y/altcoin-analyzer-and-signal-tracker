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

// ── Run 186 repair (2026-10-25): bounded deadlines past the hyperliquid
// checkpoint. Run 186's last heartbeat sat at "hyperliquid", but that stage
// is parse + checkpoint only (2ms in run 187) — the Hyperliquid contexts are
// fetched earlier, inside the catalog-fetch stage. The unbudgeted section
// AFTER that checkpoint — the veto quote poll plus the per-candidate
// post-decision evidence checks, whose history-cache backfills chain many
// transport-bounded calls into an aggregate with no bound, no intermediate
// heartbeat, and no lease assertion until every candidate finished — is
// where the run died: the worker was killed before the run's own deadline
// and the row sat "running" until a later reaper fenced it as a coverage
// gap. The helpers below are the pure cores of the repair; actions.ts wires
// them to the network and the DB. Nothing here touches thresholds, scores,
// gates, the entry contract, or the production admission rule.

export class FeedDeadlineTimeoutError extends Error {
  constructor(readonly operation: string, readonly timeoutMs: number) {
    super(`timeout: ${operation} exceeded ${Math.round(timeoutMs / 1000)}s`);
    this.name = "FeedDeadlineTimeoutError";
  }
}

export type FeedSettlement<T> =
  | { status: "available"; value: T }
  | { status: "unavailable"; reason: string };

// Settle one external feed call against a hard deadline. NEVER throws: a
// failed or stalled call comes back as explicitly unavailable with the
// reason, so an optional feed degrades in the open (the caller records it
// in sourceStatus) instead of hanging the run or vanishing silently. The
// underlying work is not cancelled (same race semantics as withStageBudget);
// the await is what is bounded. Cancellation record for this transport:
// UNSUPPORTED — settleFeedWithDeadline receives an already-started
// promise, so no AbortSignal can reach the underlying work. Callers that
// need verified cancellation use settleFeedWithAbort (fetch-timing.ts),
// which passes an AbortSignal into the work factory; the veto quote poll
// in runMarketDiscovery is wired that way (Q3, 2026-10-25).
export async function settleFeedWithDeadline<T>(operation: string, timeoutMs: number, work: Promise<T>): Promise<FeedSettlement<T>> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new FeedDeadlineTimeoutError(operation, timeoutMs)), timeoutMs); });
  try {
    const value = await Promise.race([work, timeout]);
    return { status: "available", value };
  } catch (error) {
    return { status: "unavailable", reason: error instanceof Error ? error.message.slice(0, 220) : `${operation} failed` };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

// Canonical deferral record for a candidate whose REQUIRED feed did not
// settle: the candidate is deferred — not scored around, not dropped — and
// the reason names the feed and why it is unavailable.
export function requiredFeedDeferralReason(feed: string, reason: string): string {
  return `deferred — required feed unavailable (${feed}): ${reason}`;
}

export function scoringBudgetDeferralReason(feed: string, budgetMs: number): string {
  return requiredFeedDeferralReason(feed, `scoring stage budget exhausted after ${Math.round(budgetMs / 1000)}s before this candidate's check completed; candidate not evaluated this run`);
}

export type BudgetedCheckControl = { aborted: () => boolean };
export type BudgetedCheckOutcome<R> = { results: Map<string, R>; deferredKeys: string[]; budgetExhausted: boolean };

// Run per-item checks under one hard stage budget. The returned promise
// resolves at the budget deadline even if a worker is stalled on an
// external call: items that never completed are reported in deferredKeys
// (the caller defers those candidates with the reason — they are never
// silently dropped and never scored around missing evidence). Workers
// receive a cooperative abort signal: once the budget fires, no new item
// starts, and a worker that reaches a write after the deadline can check
// control.aborted() and skip run-scoped writes instead of writing into a
// run that has already moved on and fenced its lease.
export async function runBudgetedChecks<I, R>(args: {
  items: readonly I[];
  keyOf: (item: I) => string;
  budgetMs: number;
  concurrency: number;
  worker: (item: I, control: BudgetedCheckControl) => Promise<R>;
  onProgress?: (completedCount: number, totalCount: number) => void;
}): Promise<BudgetedCheckOutcome<R>> {
  const results = new Map<string, R>();
  let abortedFlag = false;
  const control: BudgetedCheckControl = { aborted: () => abortedFlag };
  let cursor = 0;
  const total = args.items.length;
  const runners = Array.from({ length: Math.max(1, Math.min(args.concurrency, Math.max(total, 1))) }, async () => {
    while (!abortedFlag && cursor < total) {
      const index = cursor++;
      const item = args.items[index];
      if (item === undefined) continue;
      const value = await args.worker(item, control);
      results.set(args.keyOf(item), value);
      args.onProgress?.(results.size, total);
    }
  });
  const allDone = Promise.all(runners).then(() => false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const budgetFired = new Promise<boolean>((resolve) => { timer = setTimeout(() => { abortedFlag = true; resolve(true); }, args.budgetMs); });
  const budgetExhausted = await Promise.race([allDone, budgetFired]);
  if (timer !== undefined) clearTimeout(timer);
  // Snapshot at the deadline: a worker still in flight may finish later in
  // the background, but its result can no longer enter this outcome — the
  // item stays deferred, and the worker's own writes are gated on
  // control.aborted().
  const snapshot = new Map(results);
  const deferredKeys = args.items.map((item) => args.keyOf(item)).filter((key) => !snapshot.has(key));
  return { results: snapshot, deferredKeys, budgetExhausted };
}

// ── Run-state transitions: a terminal run is never reopened. The 1300 slot
// of 2026-10-25 (run 186) closed as a named timeout — a coverage gap. That
// record is final: no later code path may transition it back to "running",
// re-dispatch it, or turn it into a handoff or position. New work is always
// a NEW run row; the only legal exit from "running" is a terminal status.
export const DISCOVERY_RUN_TERMINAL_STATUSES: ReadonlySet<string> = new Set(["complete", "degraded", "empty", "missed", "timeout", "failed"]);

export function canTransitionDiscoveryRun(from: string, to: string): boolean {
  if (from === to) return false;
  if (DISCOVERY_RUN_TERMINAL_STATUSES.has(from)) return false;
  return from === "running" && DISCOVERY_RUN_TERMINAL_STATUSES.has(to);
}

// The stale-lease reaper may fence ONLY a row that is still "running" and
// past its deadline. A terminal row — above all a "timeout" coverage gap —
// is never reapable, so it can never be reopened or re-executed.
export function isReapableStaleDiscoveryRun(row: { status: string; deadlineAtMs: number | null; startedAtMs: number }, nowMs: number, executionDeadlineMs: number): boolean {
  if (row.status !== "running") return false;
  if (!canTransitionDiscoveryRun(row.status, "timeout")) return false;
  if (row.deadlineAtMs !== null) return row.deadlineAtMs < nowMs;
  return row.startedAtMs < nowMs - executionDeadlineMs;
}

// ── Discovery certification at the consumer boundary (2026-10-26) ──────
//
// The discovery producer's verified terminal success status is "complete"
// (marketDiscoveryResponse / market_discovery_runs). The scheduler's
// certification vocabulary is "completed" / "degraded". Run 196
// (2026-10-26) executed successfully — terminal run, handoff 104,
// issuance run 151 — but the slot was marked failed because the consumer
// did not recognize "complete". The fix lives HERE, at the consumer
// boundary: normalize the producer's known terminal statuses into the
// scheduler's vocabulary. Unknown statuses stay unverified (null) — they
// are never promoted to a success word. Certification additionally
// requires the slot's OWN run (id match) and a recorded handoff for that
// run; a normalized status alone never certifies a slot, and a failed
// receipt never replays completed business work.
export type SchedulerTerminalStatus = "completed" | "degraded";

export function normalizeDiscoveryTerminalStatus(rawStatus: string | null | undefined): SchedulerTerminalStatus | null {
  if (rawStatus === "complete") return "completed";
  if (rawStatus === "degraded") return "degraded";
  return null;
}

export function certifyDiscoverySlot(input: {
  rawStatus: string | null;
  runId: number | null;
  slotRunId: number | null;
  handoffRunId: number | null;
}): { certified: boolean; schedulerStatus: SchedulerTerminalStatus | null; reason: string } {
  const schedulerStatus = normalizeDiscoveryTerminalStatus(input.rawStatus);
  if (schedulerStatus === null) {
    return { certified: false, schedulerStatus: null, reason: `producer status ${input.rawStatus === null ? "(none)" : `"${input.rawStatus}"`} is not a recognized terminal status — the slot stays unverified.` };
  }
  if (input.runId === null || input.slotRunId === null || input.runId !== input.slotRunId) {
    return { certified: false, schedulerStatus, reason: `terminal run ${input.runId ?? "(none)"} is not the slot's own run ${input.slotRunId ?? "(unknown)"} — the slot stays unverified.` };
  }
  if (input.handoffRunId === null) {
    return { certified: false, schedulerStatus, reason: `run ${input.runId} reached terminal status "${input.rawStatus}" (normalized "${schedulerStatus}") but no handoff is recorded for it — execution is proven, certification is withheld until the handoff check passes.` };
  }
  return { certified: true, schedulerStatus, reason: `run ${input.runId} terminal status "${input.rawStatus}" normalized to scheduler status "${schedulerStatus}"; the slot's own handoff ${input.handoffRunId} is recorded.` };
}
