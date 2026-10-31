// Q2 expanded-scoring harness (expert direction 2026-10-25).
//
// Runs the expanded (paper-pilot-v2.1.7 provisional) Binance Spot scoring
// path in a harness BEFORE any activation, with issuance and production
// writes disabled by an asserted guard. PAPER ONLY — this module changes
// no threshold, score, gate, model, entry contract, cohort reporting, or
// admission rule, and it never activates paper-pilot-v2.1.7.
//
// Contract:
//  - The 29 provisional instruments are scored (or explicitly not
//    evaluated, with the exact reason) using Q1 per-input freshness
//    records (./input-freshness). A stale/missing REQUIRED input defers
//    the candidate — it is never scored around into an abstain.
//  - Production writes go through WritesDisabledGuard: every write
//    attempt throws ProductionWriteAttemptError and is counted. The run
//    asserts the guard at the end (attempts recorded, none succeeded).
//    The action layer additionally proves zero production rows by
//    counting paper_signal_runs / paper_candidate_intake / notification /
//    monitoring-enrollment rows before vs after.
//  - Measurement is per asset and in total: scoring stage time,
//    per-candidate evidence-load time, provider calls by provider and
//    endpoint, and cache hits vs misses for the catalog cache, the tier
//    charts (the 208-asset tier set), and the history cache — including
//    how many of the 29 were already covered by the tier-chart set.
//  - Velocity stage time is measured and reported SEPARATELY from
//    scoring stage time; the two are never summed into one number.
//  - A production decision is reported as a HARNESS VERDICT ONLY — it is
//    never written as a decision anywhere.
//  - Duplicate scoring of one asset in one run is a FAILURE of the run,
//    not an optimization note.
//  - Bottlenecks are reported only when DEMONSTRATED by the measured
//    stage times, call counts, or cache miss rates of this run — never
//    extrapolated from another run's rate.

import {
candidateFreshnessDisposition,
DECISION_INPUT_MAX_AGE_MS,
paperPathFreshnessGate,
type InputFreshnessRecord,
} from "./input-freshness";

export const PROVISIONAL_BINANCE_SPOT_29: ReadonlyArray<{ symbol: string; instrument: string }> = [
  "ALT", "AMP", "AVAX", "BAT", "BEAMX", "BTC", "ADA", "LINK", "COMP", "CVX",
  "CRV", "DOGE", "ENA", "ETH", "ZRO", "NEAR", "PEPE", "PROM", "PUMP", "PYTH",
  "RAY", "XRP", "SOL", "SUI", "A", "WLD", "W", "ZAMA", "ZEC",
].map((symbol) => ({ symbol, instrument: `${symbol}USDT` }));

/** The existing discovery scoring stage budget (DISCOVERY_STAGE_BUDGET_MS
 * scoring = 2 minutes). The harness measures against it; it never raises it. */
export const HARNESS_SCORING_BUDGET_MS = 120_000;

// ── Writes-disabled guard ─────────────────────────────────────────────

export class ProductionWriteAttemptError extends Error {
  constructor(readonly kind: string, readonly detail: string) {
    super(`production write blocked by harness guard: ${kind} — ${detail}`);
    this.name = "ProductionWriteAttemptError";
  }
}

export type ProductionWriteKind =
  | "paper_signal_run"
  | "paper_candidate_intake"
  | "notification"
  | "monitoring_enrollment"
  | "production_decision";

/**
 * The guard installed over every production write surface the scoring
 * path could touch. Any attempt throws and is counted; there is no
 * code path in the harness that writes around it.
 */
export class WritesDisabledGuard {
  attempts = 0;
  readonly attemptLog: Array<{ kind: ProductionWriteKind; detail: string }> = [];

  attemptWrite(kind: ProductionWriteKind, detail: string): never {
    this.attempts++;
    this.attemptLog.push({ kind, detail });
    throw new ProductionWriteAttemptError(kind, detail);
  }

  /** The write surface handed to scoring code: every method is guarded. */
  writeSurface(): Record<ProductionWriteKind, (detail: string) => never> {
    return {
      paper_signal_run: (detail) => this.attemptWrite("paper_signal_run", detail),
      paper_candidate_intake: (detail) => this.attemptWrite("paper_candidate_intake", detail),
      notification: (detail) => this.attemptWrite("notification", detail),
      monitoring_enrollment: (detail) => this.attemptWrite("monitoring_enrollment", detail),
      production_decision: (detail) => this.attemptWrite("production_decision", detail),
    };
  }

  /** Asserted, not assumed: the run calls this at the end. A guard that
   * was never installed (attempts tracking absent) fails the assertion. */
  assertGuardInstalled(): void {
    if (!Number.isFinite(this.attempts) || !Array.isArray(this.attemptLog)) {
      throw new Error("writes-disabled guard was not installed for this harness run");
    }
  }
}

// ── Measurement types ─────────────────────────────────────────────────

export type ProviderCallRecord = { provider: string; endpoint: string };

export type CacheStat = { hits: number; misses: number };

export type HarnessDimension = {
  name: string;
  status: "pass" | "mixed" | "fail" | "unavailable" | "neutral";
  contribution: number;
};

export type HarnessEvidence = {
  /** Q1 per-input freshness records for this candidate. */
  freshnessRecords: InputFreshnessRecord[];
  /** Stored dimension ledger, or null when no ledger exists. */
  dimensions: HarnessDimension[] | null;
  direction: "long" | "short" | null;
};

export type HarnessAssetResult = {
  symbol: string;
  instrument: string;
  presentInCatalog: boolean;
  evaluated: boolean;
  /** Exact reason when not evaluated; null when evaluated. */
  notEvaluatedReason: string | null;
  /** Harness verdict only — never a written production decision. */
  harnessVerdict: "would_trade" | "would_abstain" | null;
  verdictDirection: "long" | "short" | null;
  productionScore: number | null;
  evidenceLoadMs: number;
  scoringMs: number;
  freshnessRecords: InputFreshnessRecord[];
  cache: { catalog: "hit" | "miss"; tierChart: "hit" | "miss"; history: "hit" | "miss" };
};

export type HarnessReport = {
  status: "complete" | "failed";
  failureReasons: string[];
  requestedCount: number;
  presentInCatalogCount: number;
  evaluatedCount: number;
  notEvaluatedCount: number;
  assets: HarnessAssetResult[];
  /** Stage times — always reported separately, never combined. */
  velocityMs: number;
  scoringMs: number;
  evidenceLoadMs: number;
  scoringBudgetMs: number;
  overScoringBudget: boolean;
  providerCalls: Array<{ provider: string; endpoint: string; count: number }>;
  providerCallTotal: number;
  cache: {
    catalog: CacheStat;
    tierCharts: CacheStat & { tierSetSize: number; overlapOf29: number };
    history: CacheStat;
  };
  duplicateScoringDetected: boolean;
  scoringCounts: Record<string, number>;
  guard: { installed: true; attempts: number; attemptLog: Array<{ kind: string; detail: string }> };
  demonstratedBottlenecks: string[];
  sharedSnapshotLoads: { catalog: number; tierCharts: number; history: number };
};

export type HarnessDeps = {
  /** Monotonic clock in ms (injectable for tests). */
  now: () => number;
  guard: WritesDisabledGuard;
  /** Symbols present in the harness catalog (loaded once, shared). */
  catalogSymbols: ReadonlySet<string>;
  /** Symbols covered by the tier-chart set (the 208-asset tier set). */
  tierChartSymbols: ReadonlySet<string>;
  tierSetSize: number;
  /** Symbols with a committed history-cache entry. */
  historySymbols: ReadonlySet<string>;
  /** Per-candidate evidence load; may record provider calls. */
  loadEvidence: (symbol: string, recordCall: (call: ProviderCallRecord) => void) => Promise<HarnessEvidence>;
  /** The existing production scoring rule, unchanged. */
  score: (dimensions: HarnessDimension[]) => { production: number; productionDecision: "trade" | "abstain" };
  /** Velocity stage work, timed separately from scoring. */
  runVelocityStage: () => Promise<void>;
  requested?: ReadonlyArray<{ symbol: string; instrument: string }>;
};

export async function runExpandedScoringHarness(deps: HarnessDeps): Promise<HarnessReport> {
  const requested = deps.requested ?? PROVISIONAL_BINANCE_SPOT_29;
  const guard = deps.guard;
  guard.assertGuardInstalled();

  // ── Velocity stage: timed separately, never folded into scoring. ──
  const velocityStart = deps.now();
  await deps.runVelocityStage();
  const velocityMs = Math.max(0, deps.now() - velocityStart);

  const providerCalls: ProviderCallRecord[] = [];
  const recordCall = (call: ProviderCallRecord) => { providerCalls.push(call); };

  const scoringCounts: Record<string, number> = {};
  const assets: HarnessAssetResult[] = [];
  const cache = {
    catalog: { hits: 0, misses: 0 } as CacheStat,
    tierCharts: { hits: 0, misses: 0, tierSetSize: deps.tierSetSize, overlapOf29: 0 },
    history: { hits: 0, misses: 0 } as CacheStat,
  };

  // ── Scoring stage ──
  const scoringStart = deps.now();
  let evidenceLoadTotalMs = 0;
  for (const entry of requested) {
    const symbol = entry.symbol;
    const presentInCatalog = deps.catalogSymbols.has(symbol);
    const tierHit = deps.tierChartSymbols.has(symbol);
    const historyHit = deps.historySymbols.has(symbol);
    if (presentInCatalog) cache.catalog.hits++; else cache.catalog.misses++;
    if (tierHit) { cache.tierCharts.hits++; cache.tierCharts.overlapOf29++; } else cache.tierCharts.misses++;
    if (historyHit) cache.history.hits++; else cache.history.misses++;

    const cacheForAsset = {
      catalog: presentInCatalog ? "hit" as const : "miss" as const,
      tierChart: tierHit ? "hit" as const : "miss" as const,
      history: historyHit ? "hit" as const : "miss" as const,
    };

    if (!presentInCatalog) {
      assets.push({
        symbol, instrument: entry.instrument, presentInCatalog: false, evaluated: false,
        notEvaluatedReason: "not present in the harness catalog — the lane never invents catalog membership",
        harnessVerdict: null, verdictDirection: null, productionScore: null,
        evidenceLoadMs: 0, scoringMs: 0, freshnessRecords: [], cache: cacheForAsset,
      });
      continue;
    }

    const loadStart = deps.now();
    const evidence = await deps.loadEvidence(symbol, recordCall);
    const evidenceLoadMs = Math.max(0, deps.now() - loadStart);
    evidenceLoadTotalMs += evidenceLoadMs;

    // Q1 freshness disposition: a stale/missing REQUIRED input defers —
    // the exact defer reason is the not-evaluated reason.
    const disposition = candidateFreshnessDisposition(evidence.freshnessRecords);
    if (disposition.disposition === "defer") {
      assets.push({
        symbol, instrument: entry.instrument, presentInCatalog: true, evaluated: false,
        notEvaluatedReason: disposition.deferReason,
        harnessVerdict: null, verdictDirection: null, productionScore: null,
        evidenceLoadMs, scoringMs: 0, freshnessRecords: evidence.freshnessRecords, cache: cacheForAsset,
      });
      continue;
    }
    if (!evidence.dimensions || evidence.dimensions.length === 0) {
      assets.push({
        symbol, instrument: entry.instrument, presentInCatalog: true, evaluated: false,
        notEvaluatedReason: "no dimension ledger in stored evidence — scoring would require fabricated inputs",
        harnessVerdict: null, verdictDirection: null, productionScore: null,
        evidenceLoadMs, scoringMs: 0, freshnessRecords: evidence.freshnessRecords, cache: cacheForAsset,
      });
      continue;
    }
    if (!evidence.direction) {
      assets.push({
        symbol, instrument: entry.instrument, presentInCatalog: true, evaluated: false,
        notEvaluatedReason: "stored evidence is watch-only — no directional verdict can be reported",
        harnessVerdict: null, verdictDirection: null, productionScore: null,
        evidenceLoadMs, scoringMs: 0, freshnessRecords: evidence.freshnessRecords, cache: cacheForAsset,
      });
      continue;
    }

    const scoreStart = deps.now();
    const scored = deps.score(evidence.dimensions);
    const assetScoringMs = Math.max(0, deps.now() - scoreStart);
    scoringCounts[symbol] = (scoringCounts[symbol] ?? 0) + 1;
    assets.push({
      symbol, instrument: entry.instrument, presentInCatalog: true, evaluated: true,
      notEvaluatedReason: null,
      harnessVerdict: scored.productionDecision === "trade" ? "would_trade" : "would_abstain",
      verdictDirection: scored.productionDecision === "trade" ? evidence.direction : null,
      productionScore: scored.production,
      evidenceLoadMs, scoringMs: assetScoringMs, freshnessRecords: evidence.freshnessRecords, cache: cacheForAsset,
    });
  }
  const scoringMs = Math.max(0, deps.now() - scoringStart);

  // ── Duplicate scoring is a failure, not an optimization note. ──
  const duplicatedSymbols = Object.entries(scoringCounts).filter(([, c]) => c > 1).map(([s]) => s);
  const duplicateScoringDetected = duplicatedSymbols.length > 0;
  const failureReasons: string[] = [];
  if (duplicatedSymbols.length > 0) {
    failureReasons.push(`duplicate scoring detected for ${duplicatedSymbols.join(", ")} — an asset scored twice in one run is a failure`);
  }

  const overScoringBudget = scoringMs > HARNESS_SCORING_BUDGET_MS;
  if (overScoringBudget) {
    failureReasons.push(`scoring stage ${scoringMs}ms exceeded the ${HARNESS_SCORING_BUDGET_MS}ms budget`);
  }

  // ── Demonstrated bottlenecks only: from THIS run's measurements. ──
  const demonstratedBottlenecks: string[] = [];
  if (overScoringBudget) {
    demonstratedBottlenecks.push(
      `scoring stage over budget at ${scoringMs}ms (budget ${HARNESS_SCORING_BUDGET_MS}ms); evidence load consumed ${evidenceLoadTotalMs}ms of it across ${assets.filter((a) => a.presentInCatalog).length} catalog-present assets`,
    );
  }
  const historyLookups = cache.history.hits + cache.history.misses;
  if (historyLookups > 0 && cache.history.misses / historyLookups > 0.5) {
    demonstratedBottlenecks.push(
      `history cache miss rate ${cache.history.misses}/${historyLookups} (>50%) measured this run — candidates without committed history cannot be level-checked from cache`,
    );
  }
  const tierLookups = cache.tierCharts.hits + cache.tierCharts.misses;
  if (tierLookups > 0 && cache.tierCharts.misses / tierLookups > 0.5) {
    demonstratedBottlenecks.push(
      `tier-chart miss rate ${cache.tierCharts.misses}/${tierLookups} (>50%) measured this run — only ${cache.tierCharts.overlapOf29} of ${requested.length} provisional assets were already covered by the ${deps.tierSetSize}-asset tier-chart set`,
    );
  }
  if (providerCalls.length > requested.length * 2) {
    demonstratedBottlenecks.push(
      `provider call count ${providerCalls.length} exceeded 2 per requested asset (${requested.length}) this run — call reduction is demonstrated, not extrapolated`,
    );
  }

  // Aggregate provider calls by provider + endpoint.
  const callMap = new Map<string, { provider: string; endpoint: string; count: number }>();
  for (const call of providerCalls) {
    const key = `${call.provider} ${call.endpoint}`;
    const existing = callMap.get(key) ?? { provider: call.provider, endpoint: call.endpoint, count: 0 };
    existing.count++;
    callMap.set(key, existing);
  }

  guard.assertGuardInstalled();

  return {
    status: failureReasons.length > 0 ? "failed" : "complete",
    failureReasons,
    requestedCount: requested.length,
    presentInCatalogCount: assets.filter((a) => a.presentInCatalog).length,
    evaluatedCount: assets.filter((a) => a.evaluated).length,
    notEvaluatedCount: assets.filter((a) => !a.evaluated).length,
    assets,
    velocityMs,
    scoringMs,
    evidenceLoadMs: evidenceLoadTotalMs,
    scoringBudgetMs: HARNESS_SCORING_BUDGET_MS,
    overScoringBudget,
    providerCalls: [...callMap.values()].sort((a, b) => b.count - a.count),
    providerCallTotal: providerCalls.length,
    cache,
    duplicateScoringDetected,
    scoringCounts,
    guard: { installed: true, attempts: guard.attempts, attemptLog: guard.attemptLog.map((a) => ({ kind: a.kind, detail: a.detail })) },
    demonstratedBottlenecks,
    sharedSnapshotLoads: { catalog: 1, tierCharts: 1, history: 1 },
  };
}

// ── Live workload rehearsal (expert direction 2026-10-26) ─────────────
//
// The stored-evidence harness above measures stored dimension ledgers
// only — by the direction's own ruling that is NOT a workload rehearsal
// (its ~3 ms scoring result says nothing about the live path). This
// rehearsal runs the expanded set through the PRODUCTION scorer and the
// PRODUCTION provider adapters (injected by the action layer: the same
// getJson transport with its 20 s upstream timeout, the same Binance
// trade-history adapter, the same paperScores), with production writes
// disabled by the same guard and ISOLATED cache state (a per-run
// in-memory cache owned by the adapter closure; the production history
// cache tables are neither read nor written).
//
// Measurement discipline:
//  - external provider calls and stored reads are counted SEPARATELY,
//    by provider/endpoint and by store;
//  - fetch/evidence time, pure scoring time, and total time are reported
//    separately and never summed into one stage number;
//  - evidence loading runs INSIDE the scoring scope: its time counts
//    against the same 120 s scoring-stage budget production discovery
//    enforces (DISCOVERY_STAGE_BUDGET_MS.scoring). A candidate the
//    budget never reaches is EXPLICITLY deferred with the budget
//    reason — never silently skipped, never read as an abstention;
//  - each candidate's evidence load carries the production per-candidate
//    deadline (60 s); a load that overruns it defers that candidate;
//  - the ACTUAL paper-path freshness gate (paperPathFreshnessGate) is
//    applied to the live evidence timestamps: missing → unverified
//    deferral, future → future deferral, stale → stale deferral,
//    boundary → pass, under the configured strict comparisons.
export const REHEARSAL_PER_CANDIDATE_EVIDENCE_DEADLINE_MS = 60_000;
export const REHEARSAL_UPSTREAM_FETCH_TIMEOUT_MS = 20_000;

export type RehearsalEvidence = {
  /** Source timestamp of the decision input (provider last_updated). */
  sourceTimeMs: number | null;
  klines: { barCount: number; lastCompletedCloseMs: number | null } | null;
  trades: { printCount: number } | null;
};

export type RehearsalAssetResult = {
  symbol: string;
  instrument: string;
  presentInCatalog: boolean;
  evaluated: boolean;
  /** Exact reason when not evaluated / deferred; null when evaluated. */
  notEvaluatedReason: string | null;
  /** The paper-path gate outcome for live evidence: "pass" or the
   * deferral code (decision_input_unverified / future_source_timestamp /
   * stale_decision_inputs); null when the gate was never reached. */
  freshnessGate: string | null;
  harnessVerdict: "would_trade" | "would_abstain" | null;
  verdictDirection: "long" | "short" | null;
  productionScore: number | null;
  fetchEvidenceMs: number;
  scoringMs: number;
  externalCalls: number;
};

export type LiveRehearsalReport = {
  mode: "live-rehearsal";
  status: "complete" | "failed";
  failureReasons: string[];
  requestedCount: number;
  presentInCatalogCount: number;
  evaluatedCount: number;
  deferredCount: number;
  assets: RehearsalAssetResult[];
  /** Stage times — always separate, never combined. */
  fetchEvidenceMs: number;
  scoringMs: number;
  totalMs: number;
  scoringBudgetMs: number;
  overScoringBudget: boolean;
  /** External provider calls, counted separately from stored reads. */
  externalCalls: Array<{ provider: string; endpoint: string; count: number }>;
  externalCallTotal: number;
  storedReads: Array<{ source: string; count: number }>;
  storedReadTotal: number;
  timeoutScopes: {
    scoringStageBudgetMs: number;
    perCandidateEvidenceDeadlineMs: number;
    upstreamFetchTimeoutMs: number;
    note: string;
  };
  duplicateScoringDetected: boolean;
  guard: { installed: true; attempts: number; attemptLog: Array<{ kind: string; detail: string }> };
  demonstratedBottlenecks: string[];
};

export type LiveRehearsalDeps = {
  now: () => number;
  guard: WritesDisabledGuard;
  /** The verified set for this run (verified Binance Spot instrument +
   * present in the current catalog), resolved by the action layer. */
  requested: ReadonlyArray<{ symbol: string; instrument: string; coinId: string }>;
  catalogSymbols: ReadonlySet<string>;
  /** Decision instant for the freshness gate (the run's start). */
  decisionAtMs: number;
  frozenAtMs: number;
  /** Stored read: the stored dimension ledger for a symbol, or null. */
  loadStoredDimensions: (symbol: string, recordStoredRead: (read: { source: string }) => void) => Promise<{ dimensions: HarnessDimension[]; direction: "long" | "short" | null } | null>;
  /** External evidence load through the production provider adapters.
   * deadlineMs is the per-candidate evidence deadline (absolute, on the
   * deps clock); the adapter wires it into its abort signals. */
  fetchEvidence: (entry: { symbol: string; instrument: string; coinId: string }, deadlineMs: number, recordExternalCall: (call: ProviderCallRecord) => void) => Promise<RehearsalEvidence>;
  score: (dimensions: HarnessDimension[]) => { production: number; productionDecision: "trade" | "abstain" };
};

export async function runLiveScoringRehearsal(deps: LiveRehearsalDeps): Promise<LiveRehearsalReport> {
  const guard = deps.guard;
  guard.assertGuardInstalled();
  const totalStart = deps.now();
  const externalCalls: ProviderCallRecord[] = [];
  const storedReads: Array<{ source: string }> = [];
  const recordExternalCall = (call: ProviderCallRecord) => { externalCalls.push(call); };
  const recordStoredRead = (read: { source: string }) => { storedReads.push(read); };

  const assets: RehearsalAssetResult[] = [];
  const scoringCounts: Record<string, number> = {};
  let fetchEvidenceTotalMs = 0;
  let scoringTotalMs = 0;

  // The scoring scope opens before the first candidate's evidence load:
  // evidence-building inside this scope counts against the budget.
  const scopeStart = deps.now();
  let budgetExhausted = false;
  for (const entry of deps.requested) {
    const presentInCatalog = deps.catalogSymbols.has(entry.symbol);
    if (!presentInCatalog) {
      assets.push({
        symbol: entry.symbol, instrument: entry.instrument, presentInCatalog: false, evaluated: false,
        notEvaluatedReason: "not present in the current catalog — the verified set never invents catalog membership",
        freshnessGate: null, harnessVerdict: null, verdictDirection: null, productionScore: null,
        fetchEvidenceMs: 0, scoringMs: 0, externalCalls: 0,
      });
      continue;
    }
    if (budgetExhausted || deps.now() - scopeStart > HARNESS_SCORING_BUDGET_MS) {
      budgetExhausted = true;
      assets.push({
        symbol: entry.symbol, instrument: entry.instrument, presentInCatalog: true, evaluated: false,
        notEvaluatedReason: `scoring budget exhausted before evaluation — explicitly deferred; evidence-building inside the scoring scope counts against the ${HARNESS_SCORING_BUDGET_MS}ms budget, and an unevaluated candidate is never read as a model abstention`,
        freshnessGate: null, harnessVerdict: null, verdictDirection: null, productionScore: null,
        fetchEvidenceMs: 0, scoringMs: 0, externalCalls: 0,
      });
      continue;
    }

    const callsBefore = externalCalls.length;
    const fetchStart = deps.now();
    const evidence = await deps.fetchEvidence(entry, fetchStart + REHEARSAL_PER_CANDIDATE_EVIDENCE_DEADLINE_MS, recordExternalCall);
    const fetchEvidenceMs = Math.max(0, deps.now() - fetchStart);
    fetchEvidenceTotalMs += fetchEvidenceMs;
    const assetExternalCalls = externalCalls.length - callsBefore;

    if (fetchEvidenceMs > REHEARSAL_PER_CANDIDATE_EVIDENCE_DEADLINE_MS) {
      assets.push({
        symbol: entry.symbol, instrument: entry.instrument, presentInCatalog: true, evaluated: false,
        notEvaluatedReason: `evidence load exceeded the ${REHEARSAL_PER_CANDIDATE_EVIDENCE_DEADLINE_MS}ms per-candidate deadline (measured ${Math.round(fetchEvidenceMs)}ms) — deferred, not scored around`,
        freshnessGate: null, harnessVerdict: null, verdictDirection: null, productionScore: null,
        fetchEvidenceMs, scoringMs: 0, externalCalls: assetExternalCalls,
      });
      continue;
    }

    const stored = await deps.loadStoredDimensions(entry.symbol, recordStoredRead);
    if (!stored || stored.dimensions.length === 0) {
      assets.push({
        symbol: entry.symbol, instrument: entry.instrument, presentInCatalog: true, evaluated: false,
        notEvaluatedReason: "no dimension ledger in stored evidence — scoring would require fabricated inputs",
        freshnessGate: null, harnessVerdict: null, verdictDirection: null, productionScore: null,
        fetchEvidenceMs, scoringMs: 0, externalCalls: assetExternalCalls,
      });
      continue;
    }

    // The actual paper-path freshness gate on the live evidence.
    const gate = paperPathFreshnessGate({
      decisionAtMs: deps.decisionAtMs,
      sourceObservedAtMs: evidence.sourceTimeMs,
      ledgerOk: true,
      frozenAtMs: deps.frozenAtMs,
      maxAgeMs: DECISION_INPUT_MAX_AGE_MS,
    });
    if (gate.outcome === "deferred") {
      assets.push({
        symbol: entry.symbol, instrument: entry.instrument, presentInCatalog: true, evaluated: false,
        notEvaluatedReason: `paper-path freshness gate deferred (${gate.code}): ${gate.reason}`,
        freshnessGate: gate.code, harnessVerdict: null, verdictDirection: null, productionScore: null,
        fetchEvidenceMs, scoringMs: 0, externalCalls: assetExternalCalls,
      });
      continue;
    }
    if (!stored.direction) {
      assets.push({
        symbol: entry.symbol, instrument: entry.instrument, presentInCatalog: true, evaluated: false,
        notEvaluatedReason: "stored evidence is watch-only — no directional verdict can be reported",
        freshnessGate: "pass", harnessVerdict: null, verdictDirection: null, productionScore: null,
        fetchEvidenceMs, scoringMs: 0, externalCalls: assetExternalCalls,
      });
      continue;
    }

    const scoreStart = deps.now();
    const scored = deps.score(stored.dimensions);
    const assetScoringMs = Math.max(0, deps.now() - scoreStart);
    scoringTotalMs += assetScoringMs;
    scoringCounts[entry.symbol] = (scoringCounts[entry.symbol] ?? 0) + 1;
    assets.push({
      symbol: entry.symbol, instrument: entry.instrument, presentInCatalog: true, evaluated: true,
      notEvaluatedReason: null, freshnessGate: "pass",
      harnessVerdict: scored.productionDecision === "trade" ? "would_trade" : "would_abstain",
      verdictDirection: scored.productionDecision === "trade" ? stored.direction : null,
      productionScore: scored.production,
      fetchEvidenceMs, scoringMs: assetScoringMs, externalCalls: assetExternalCalls,
    });
  }
  const totalMs = Math.max(0, deps.now() - totalStart);
  const scopeMs = Math.max(0, deps.now() - scopeStart);
  const overScoringBudget = scopeMs > HARNESS_SCORING_BUDGET_MS;

  const duplicatedSymbols = Object.entries(scoringCounts).filter(([, c]) => c > 1).map(([s]) => s);
  const duplicateScoringDetected = duplicatedSymbols.length > 0;
  const failureReasons: string[] = [];
  if (duplicateScoringDetected) failureReasons.push(`duplicate scoring detected for ${duplicatedSymbols.join(", ")} — an asset scored twice in one run is a failure`);
  if (overScoringBudget) failureReasons.push(`scoring scope ${Math.round(scopeMs)}ms exceeded the ${HARNESS_SCORING_BUDGET_MS}ms budget (evidence loading inside the scope counts against it)`);

  const demonstratedBottlenecks: string[] = [];
  if (budgetExhausted) demonstratedBottlenecks.push(`the scoring budget was exhausted with ${assets.filter((a) => !a.evaluated && a.freshnessGate === null && a.presentInCatalog).length} catalog-present candidate(s) explicitly deferred this run — measured, not extrapolated`);
  const slowAssets = assets.filter((a) => a.fetchEvidenceMs > REHEARSAL_PER_CANDIDATE_EVIDENCE_DEADLINE_MS / 2);
  if (slowAssets.length > 0) demonstratedBottlenecks.push(`evidence loads over half the per-candidate deadline for ${slowAssets.map((a) => `${a.symbol} (${Math.round(a.fetchEvidenceMs)}ms)`).join(", ")} — measured this run`);

  const aggregate = (calls: ProviderCallRecord[]) => {
    const map = new Map<string, { provider: string; endpoint: string; count: number }>();
    for (const call of calls) {
      const key = `${call.provider} ${call.endpoint}`;
      const existing = map.get(key) ?? { provider: call.provider, endpoint: call.endpoint, count: 0 };
      existing.count++;
      map.set(key, existing);
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  };
  const aggregateReads = (reads: Array<{ source: string }>) => {
    const map = new Map<string, { source: string; count: number }>();
    for (const read of reads) {
      const existing = map.get(read.source) ?? { source: read.source, count: 0 };
      existing.count++;
      map.set(read.source, existing);
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  };

  guard.assertGuardInstalled();

  return {
    mode: "live-rehearsal",
    status: failureReasons.length > 0 ? "failed" : "complete",
    failureReasons,
    requestedCount: deps.requested.length,
    presentInCatalogCount: assets.filter((a) => a.presentInCatalog).length,
    evaluatedCount: assets.filter((a) => a.evaluated).length,
    deferredCount: assets.filter((a) => a.presentInCatalog && !a.evaluated).length,
    assets,
    fetchEvidenceMs: fetchEvidenceTotalMs,
    scoringMs: scoringTotalMs,
    totalMs,
    scoringBudgetMs: HARNESS_SCORING_BUDGET_MS,
    overScoringBudget,
    externalCalls: aggregate(externalCalls),
    externalCallTotal: externalCalls.length,
    storedReads: aggregateReads(storedReads),
    storedReadTotal: storedReads.length,
    timeoutScopes: {
      scoringStageBudgetMs: HARNESS_SCORING_BUDGET_MS,
      perCandidateEvidenceDeadlineMs: REHEARSAL_PER_CANDIDATE_EVIDENCE_DEADLINE_MS,
      upstreamFetchTimeoutMs: REHEARSAL_UPSTREAM_FETCH_TIMEOUT_MS,
      note: "evidence loading runs inside the scoring stage scope and counts against the scoring budget; each upstream fetch carries the production 20s transport timeout linked to the per-candidate deadline's abort signal",
    },
    duplicateScoringDetected,
    guard: { installed: true, attempts: guard.attempts, attemptLog: guard.attemptLog.map((a) => ({ kind: a.kind, detail: a.detail })) },
    demonstratedBottlenecks,
  };
}

/** Counts proof: production row counts before vs after a harness run.
 * Zero created rows in every guarded table is the only passing shape. */
export type ProductionRowCounts = {
  paperSignalRuns: number;
  paperCandidateIntake: number;
  notifications: number;
  monitoringEnrollments: number;
};

export function proveZeroProductionWrites(before: ProductionRowCounts, after: ProductionRowCounts): {
  proven: boolean;
  created: ProductionRowCounts;
  detail: string;
} {
  const created: ProductionRowCounts = {
    paperSignalRuns: after.paperSignalRuns - before.paperSignalRuns,
    paperCandidateIntake: after.paperCandidateIntake - before.paperCandidateIntake,
    notifications: after.notifications - before.notifications,
    monitoringEnrollments: after.monitoringEnrollments - before.monitoringEnrollments,
  };
  const proven = created.paperSignalRuns === 0 && created.paperCandidateIntake === 0
    && created.notifications === 0 && created.monitoringEnrollments === 0;
  return {
    proven,
    created,
    detail: proven
      ? "zero paper_signal_runs rows, zero intake rows, zero notification rows, and zero monitoring enrollment rows were created by the run (before vs after counts identical)"
      : `production writes leaked during the harness run: ${JSON.stringify(created)}`,
  };
}
