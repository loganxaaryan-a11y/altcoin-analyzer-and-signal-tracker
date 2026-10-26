// Q1 per-input freshness records (expert direction 2026-10-25).
//
// Every scoring input used for a candidate carries a record: source time,
// fetch time, the freshness rule applied, and a status of
// fresh / aging / stale / unavailable. The rules enforced here are the
// terminal's EXISTING rules — no threshold, score, gate, or admission
// behaviour changes:
//   - a REQUIRED input that is missing or stale DEFERS the candidate with
//     the missing-input reason; it is never scored around into an abstain;
//   - an OPTIONAL input that is missing contributes 0 with NO_DATA —
//     never an estimate;
//   - a cached catalog keeps its ORIGINAL provenance timestamp and is
//     labeled cached with its age — a fetching run never re-stamps it;
//   - candle coverage is checked separately from fetch success: a
//     successful fetch with missing expected intervals is a coverage
//     gap, not a fresh input;
//   - level construction records its candle interval, completed/forming
//     state, last included observation, and reference timestamp, and uses
//     no observation after the decision time — a post-decision
//     observation is excluded and recorded as excluded.

export type InputFreshnessStatus = "fresh" | "aging" | "stale" | "unavailable";
export type InputRequirement = "required" | "optional";

/** The existing decision-input rule: decision inputs older than 30
 * minutes at the decision defer (paper path: stale_decision_inputs;
 * discovery eligibility filter uses the same 30-minute bound). */
export const DECISION_INPUT_MAX_AGE_MS = 30 * 60_000;
/** Weekly fundamentals cadence rule (existing): fresh < 7 days. */
export const WEEKLY_FUNDAMENTALS_MAX_AGE_MS = 7 * 24 * 60 * 60_000;
/** Catalog cache rule (existing): a snapshot aged <= 24h may serve. */
export const CATALOG_CACHE_MAX_AGE_MS = 24 * 60 * 60_000;

export type InputFreshnessRecord = {
  input: string;
  requirement: InputRequirement;
  /** When the source produced the value (provider/provenance time). */
  sourceTimeMs: number | null;
  /** When this run fetched (or re-read) the value. */
  fetchTimeMs: number;
  /** Human-readable rule applied, e.g. "required · max age 30m". */
  freshnessRule: string;
  status: InputFreshnessStatus;
  /** True when the value came from a cache/snapshot rather than a live fetch. */
  cached: boolean;
  /** Age of the cached value at fetch time; null for live values. */
  cacheAgeMs: number | null;
  /** Original provenance timestamp preserved through caching; null for live values. */
  provenanceTimeMs: number | null;
  detail: string;
};

function statusForAge(ageMs: number | null, maxAgeMs: number): InputFreshnessStatus {
  if (ageMs === null || !Number.isFinite(ageMs)) return "unavailable";
  if (ageMs > maxAgeMs) return "stale";
  if (ageMs > maxAgeMs * 0.75) return "aging";
  return "fresh";
}

export function buildInputFreshnessRecord(args: {
  input: string;
  requirement: InputRequirement;
  sourceTimeMs: number | null;
  fetchTimeMs: number;
  maxAgeMs: number;
  cached?: boolean;
  provenanceTimeMs?: number | null;
  detail?: string;
}): InputFreshnessRecord {
  const cached = args.cached ?? false;
  const provenanceTimeMs = cached ? (args.provenanceTimeMs ?? args.sourceTimeMs) : null;
  // For a cached value the freshness clock is the ORIGINAL provenance
  // time — never the fetching run's time. Re-stamping a cached value as
  // fresh at fetch time is exactly the laundering this record forbids.
  const effectiveSourceMs = cached ? provenanceTimeMs : args.sourceTimeMs;
  const ageMs = effectiveSourceMs === null ? null : Math.max(0, args.fetchTimeMs - effectiveSourceMs);
  const status = statusForAge(ageMs, args.maxAgeMs);
  return {
    input: args.input,
    requirement: args.requirement,
    sourceTimeMs: args.sourceTimeMs,
    fetchTimeMs: args.fetchTimeMs,
    freshnessRule: `${args.requirement} · max age ${Math.round(args.maxAgeMs / 60_000)}m`,
    status,
    cached,
    cacheAgeMs: cached ? ageMs : null,
    provenanceTimeMs,
    detail: args.detail ?? (status === "unavailable"
      ? `${args.input}: no source timestamp — input unavailable.`
      : `${args.input}: ${status}${cached ? ` (cached, age ${ageMs === null ? "unknown" : `${Math.round(ageMs / 60_000)}m`}, provenance ${provenanceTimeMs === null ? "unknown" : new Date(provenanceTimeMs).toISOString()})` : ""}.`),
  };
}

/** Catalog record from the resolveCatalog decision: fresh rows carry the
 * fetch time as source time; cached rows keep the snapshot's original
 * fetchedAt as provenance and are labeled cached with their age. */
export function catalogFreshnessRecord(args: {
  kind: "fresh" | "cached";
  snapshotFetchedAtMs: number | null;
  fetchTimeMs: number;
}): InputFreshnessRecord {
  if (args.kind === "fresh") {
    return buildInputFreshnessRecord({
      input: "catalog",
      requirement: "required",
      sourceTimeMs: args.fetchTimeMs,
      fetchTimeMs: args.fetchTimeMs,
      maxAgeMs: DECISION_INPUT_MAX_AGE_MS,
      detail: "catalog: fresh fetch this run (2 pages).",
    });
  }
  return buildInputFreshnessRecord({
    input: "catalog",
    requirement: "required",
    sourceTimeMs: args.snapshotFetchedAtMs,
    fetchTimeMs: args.fetchTimeMs,
    maxAgeMs: CATALOG_CACHE_MAX_AGE_MS,
    cached: true,
    provenanceTimeMs: args.snapshotFetchedAtMs,
  });
}

// ── Candle coverage: separate from fetch success ─────────────────────

export type CandleCoverageResult = {
  fetchSucceeded: boolean;
  status: "complete" | "coverage_gap" | "fetch_failed";
  expectedCount: number;
  observedCount: number;
  missingStartsMs: number[];
  detail: string;
};

/** Expected interval starts are [windowStart, windowEnd) stepped by
 * intervalMs. A successful fetch whose observed starts omit any expected
 * start is a coverage gap — explicitly NOT a fresh/complete input. */
export function checkCandleCoverage(args: {
  fetchSucceeded: boolean;
  windowStartMs: number;
  windowEndMs: number;
  intervalMs: number;
  observedStartsMs: number[];
}): CandleCoverageResult {
  if (!args.fetchSucceeded) {
    return { fetchSucceeded: false, status: "fetch_failed", expectedCount: 0, observedCount: 0, missingStartsMs: [], detail: "candle fetch failed; coverage not evaluated." };
  }
  const observed = new Set(args.observedStartsMs);
  const missingStartsMs: number[] = [];
  let expectedCount = 0;
  for (let t = args.windowStartMs; t < args.windowEndMs; t += args.intervalMs) {
    expectedCount++;
    if (!observed.has(t)) missingStartsMs.push(t);
  }
  const status = missingStartsMs.length === 0 ? "complete" : "coverage_gap";
  return {
    fetchSucceeded: true,
    status,
    expectedCount,
    observedCount: observed.size,
    missingStartsMs,
    detail: status === "complete"
      ? `candle coverage complete: ${expectedCount}/${expectedCount} expected intervals present.`
      : `candle coverage gap: fetch succeeded but ${missingStartsMs.length} of ${expectedCount} expected intervals are missing — a coverage gap, not a fresh input.`,
  };
}

// ── Level construction record ─────────────────────────────────────────

export type LevelCandle = { startMs: number; endMs: number; close?: number };

export type LevelConstructionRecord = {
  intervalMs: number;
  intervalLabel: string;
  candleState: "completed" | "forming";
  /** Last observation actually used — always <= decisionTimeMs. */
  lastIncludedObservationMs: number | null;
  /** The decision time the levels are referenced to. */
  referenceTimestampMs: number;
  includedCount: number;
  /** Observations after the decision time: excluded, and recorded here
   * as excluded — never silently included. */
  excludedPostDecisionMs: number[];
};

/** Interval label from the candle spacing (first gap), e.g. "4h", "1d". */
function intervalLabel(intervalMs: number): string {
  if (intervalMs % 86_400_000 === 0) return `${intervalMs / 86_400_000}d`;
  if (intervalMs % 3_600_000 === 0) return `${intervalMs / 3_600_000}h`;
  return `${Math.round(intervalMs / 60_000)}m`;
}

export function buildLevelConstructionRecord(args: {
  candles: LevelCandle[];
  decisionTimeMs: number;
}): LevelConstructionRecord {
  const sorted = [...args.candles].sort((a, b) => a.startMs - b.startMs);
  const intervalMs = sorted.length >= 2 ? (sorted[1]!.startMs - sorted[0]!.startMs) : 0;
  const included = sorted.filter((c) => c.endMs <= args.decisionTimeMs);
  const excludedPostDecisionMs = sorted.filter((c) => c.endMs > args.decisionTimeMs).map((c) => c.endMs);
  const lastIncluded = included.at(-1) ?? null;
  // The forming candle is the one whose window contains the decision
  // time; if the last included candle already ended at/before the
  // decision and no candle straddles it, construction used completed
  // candles only.
  const straddles = sorted.some((c) => c.startMs < args.decisionTimeMs && c.endMs > args.decisionTimeMs);
  return {
    intervalMs,
    intervalLabel: intervalMs > 0 ? intervalLabel(intervalMs) : "unknown",
    candleState: straddles ? "forming" : "completed",
    lastIncludedObservationMs: lastIncluded ? lastIncluded.endMs : null,
    referenceTimestampMs: args.decisionTimeMs,
    includedCount: included.length,
    excludedPostDecisionMs,
  };
}

// ── Candidate disposition from its input records ──────────────────────

export type CandidateFreshnessDisposition =
  | { disposition: "score"; deferReason: null }
  | { disposition: "defer"; deferReason: string };

/** A missing/stale REQUIRED input defers with the missing-input reason —
 * the candidate is not scored and not abstained. Optional inputs never
 * defer. */
export function candidateFreshnessDisposition(records: InputFreshnessRecord[]): CandidateFreshnessDisposition {
  const blocking = records.filter((r) => r.requirement === "required" && (r.status === "stale" || r.status === "unavailable"));
  if (blocking.length === 0) return { disposition: "score", deferReason: null };
  const first = blocking[0]!;
  return {
    disposition: "defer",
    deferReason: `deferred — required input ${first.status} (${first.input}): ${first.detail}`,
  };
}

/** An optional input that is missing/stale contributes exactly 0 with
 * NO_DATA — never an estimate, never a fabricated value. Returns null
 * when the input is usable and the caller should use its real value. */
export function optionalMissingContribution(record: InputFreshnessRecord): { value: 0; status: "NO_DATA" } | null {
  if (record.requirement !== "optional") return null;
  if (record.status === "stale" || record.status === "unavailable") return { value: 0, status: "NO_DATA" };
  return null;
}

// ── The paper-path freshness gate (extracted 2026-10-26) ──────────────
//
// This is the ACTUAL gate the paper issuance path applies to a
// candidate's decision inputs, extracted verbatim from the issuance
// cycle so it can be tested in isolation: missing, future, stale and
// boundary timestamps, plus preservation through caching. Comparisons
// are the configured STRICT ones, unchanged:
//   - future: source observed MORE than futureSkewMs after the decision
//     (exactly at the skew boundary passes);
//   - stale: decision inputs MORE than maxAgeMs old at the decision
//     (exactly maxAgeMs old passes — the production comparison is `>`).
// Check order is the production order: pre-freeze, unverified (missing
// ledger or missing source timestamp), future, stale.
export type PaperPathFreshnessGateResult =
  | { outcome: "pass" }
  | { outcome: "deferred"; code: "pre_freeze_candidate" | "decision_input_unverified" | "future_source_timestamp" | "stale_decision_inputs"; reason: string };

export function paperPathFreshnessGate(args: {
  decisionAtMs: number;
  sourceObservedAtMs: number | null;
  ledgerOk: boolean;
  frozenAtMs: number;
  maxAgeMs?: number;
  futureSkewMs?: number;
}): PaperPathFreshnessGateResult {
  const maxAgeMs = args.maxAgeMs ?? DECISION_INPUT_MAX_AGE_MS;
  const futureSkewMs = args.futureSkewMs ?? 2_000;
  if (args.decisionAtMs < args.frozenAtMs) {
    return { outcome: "deferred", code: "pre_freeze_candidate", reason: "Discovery decision predates the executable freeze and is excluded from prospective pilot statistics." };
  }
  if (!args.ledgerOk || args.sourceObservedAtMs === null) {
    return { outcome: "deferred", code: "decision_input_unverified", reason: "Complete, timestamped decision-time factor evidence is unavailable." };
  }
  if (args.sourceObservedAtMs > args.decisionAtMs + futureSkewMs) {
    return { outcome: "deferred", code: "future_source_timestamp", reason: "The discovery source timestamp is in the future relative to the decision." };
  }
  if (args.decisionAtMs - args.sourceObservedAtMs > maxAgeMs) {
    return { outcome: "deferred", code: "stale_decision_inputs", reason: "Decision inputs were more than 30 minutes old at the paper decision." };
  }
  return { outcome: "pass" };
}
