import { describe, expect, test } from "bun:test";
import {
  buildInputFreshnessRecord,
  buildLevelConstructionRecord,
  candidateFreshnessDisposition,
  catalogFreshnessRecord,
  checkCandleCoverage,
  DECISION_INPUT_MAX_AGE_MS,
  optionalMissingContribution,
  paperPathFreshnessGate,
} from "./input-freshness";

// Q1 acceptance (expert direction 2026-10-25): per-input freshness
// records with source time, fetch time, rule, and status; cached
// provenance preserved; candle coverage distinct from fetch success;
// level construction with post-decision exclusion; required-missing
// defers, optional-missing contributes 0 with NO_DATA. PAPER ONLY — no
// threshold, score, gate, or admission behaviour is exercised here.

const T0 = Date.parse("2026-10-25T16:00:00.000Z");

describe("Q1 per-input freshness records", () => {
  test("fresh input passes: record carries source time, fetch time, rule, and fresh status", () => {
    const record = buildInputFreshnessRecord({
      input: "catalog price",
      requirement: "required",
      sourceTimeMs: T0 - 2 * 60_000,
      fetchTimeMs: T0,
      maxAgeMs: 30 * 60_000,
    });
    expect(record.status).toBe("fresh");
    expect(record.sourceTimeMs).toBe(T0 - 2 * 60_000);
    expect(record.fetchTimeMs).toBe(T0);
    expect(record.freshnessRule).toContain("required");
    expect(record.freshnessRule).toContain("30m");
    expect(record.cached).toBe(false);
    const disposition = candidateFreshnessDisposition([record]);
    expect(disposition).toEqual({ disposition: "score", deferReason: null });
  });

  test("stale required input defers with the missing-input reason — never scored to an abstain", () => {
    const record = buildInputFreshnessRecord({
      input: "catalog price",
      requirement: "required",
      sourceTimeMs: T0 - 45 * 60_000, // older than the existing 30-minute decision-input rule
      fetchTimeMs: T0,
      maxAgeMs: 30 * 60_000,
    });
    expect(record.status).toBe("stale");
    const disposition = candidateFreshnessDisposition([record]);
    expect(disposition.disposition).toBe("defer");
    if (disposition.disposition === "defer") {
      expect(disposition.deferReason).toContain("deferred — required input stale (catalog price)");
    }
    // An unavailable required input (no source time at all) defers too.
    const missing = buildInputFreshnessRecord({
      input: "sparkline",
      requirement: "required",
      sourceTimeMs: null,
      fetchTimeMs: T0,
      maxAgeMs: 30 * 60_000,
    });
    expect(missing.status).toBe("unavailable");
    expect(candidateFreshnessDisposition([missing]).disposition).toBe("defer");
  });

  test("stale optional input contributes 0 with NO_DATA, never an estimate, and never defers", () => {
    const record = buildInputFreshnessRecord({
      input: "Hyperliquid funding/OI",
      requirement: "optional",
      sourceTimeMs: null,
      fetchTimeMs: T0,
      maxAgeMs: 30 * 60_000,
    });
    expect(record.status).toBe("unavailable");
    expect(optionalMissingContribution(record)).toEqual({ value: 0, status: "NO_DATA" });
    expect(candidateFreshnessDisposition([record]).disposition).toBe("score");
    const weekly = buildInputFreshnessRecord({
      input: "weekly fundamentals",
      requirement: "optional",
      sourceTimeMs: T0 - 10 * 24 * 60 * 60_000,
      fetchTimeMs: T0,
      maxAgeMs: 7 * 24 * 60 * 60_000,
    });
    expect(weekly.status).toBe("stale");
    expect(optionalMissingContribution(weekly)).toEqual({ value: 0, status: "NO_DATA" });
    // A fresh optional input is usable: no forced NO_DATA contribution.
    const freshOptional = buildInputFreshnessRecord({
      input: "Hyperliquid funding/OI",
      requirement: "optional",
      sourceTimeMs: T0 - 60_000,
      fetchTimeMs: T0,
      maxAgeMs: 30 * 60_000,
    });
    expect(optionalMissingContribution(freshOptional)).toBeNull();
  });

  test("cached catalog is labeled cached with its age and its ORIGINAL provenance — never re-stamped fresh by the fetching run", () => {
    const provenance = T0 - 5 * 60 * 60_000; // snapshot fetched 5h before this run
    const record = catalogFreshnessRecord({ kind: "cached", snapshotFetchedAtMs: provenance, fetchTimeMs: T0 });
    expect(record.cached).toBe(true);
    expect(record.provenanceTimeMs).toBe(provenance);
    expect(record.sourceTimeMs).toBe(provenance);
    expect(record.cacheAgeMs).toBe(5 * 60 * 60_000);
    expect(record.detail).toContain("cached");
    expect(record.detail).toContain(new Date(provenance).toISOString());
    // A 5h-old cache under the 24h catalog rule is within its age bound,
    // but it is still labeled CACHED with its original provenance — the
    // fetching run's time never becomes the source time.
    expect(record.status).toBe("fresh"); // 5h < 75% of 24h → within bound, yet labeled cached above
    expect(record.fetchTimeMs).toBe(T0);
    expect(record.sourceTimeMs).not.toBe(T0);
    // A cache older than the 24h rule is stale and defers as required.
    const ancient = catalogFreshnessRecord({ kind: "cached", snapshotFetchedAtMs: T0 - 30 * 60 * 60_000, fetchTimeMs: T0 });
    expect(ancient.status).toBe("stale");
    expect(candidateFreshnessDisposition([ancient]).disposition).toBe("defer");
    // Fresh fetch: source time IS the fetch time, not cached.
    const fresh = catalogFreshnessRecord({ kind: "fresh", snapshotFetchedAtMs: null, fetchTimeMs: T0 });
    expect(fresh.cached).toBe(false);
    expect(fresh.cacheAgeMs).toBeNull();
    expect(fresh.status).toBe("fresh");
  });

  test("candle coverage gap is distinct from fetch success", () => {
    const intervalMs = 4 * 60 * 60_000;
    const complete = checkCandleCoverage({
      fetchSucceeded: true,
      windowStartMs: T0,
      windowEndMs: T0 + 3 * intervalMs,
      intervalMs,
      observedStartsMs: [T0, T0 + intervalMs, T0 + 2 * intervalMs],
    });
    expect(complete.status).toBe("complete");
    const gap = checkCandleCoverage({
      fetchSucceeded: true, // the fetch SUCCEEDED…
      windowStartMs: T0,
      windowEndMs: T0 + 3 * intervalMs,
      intervalMs,
      observedStartsMs: [T0, T0 + 2 * intervalMs], // …but the middle interval is missing
    });
    expect(gap.fetchSucceeded).toBe(true);
    expect(gap.status).toBe("coverage_gap");
    expect(gap.missingStartsMs).toEqual([T0 + intervalMs]);
    expect(gap.detail).toContain("coverage gap");
    const failed = checkCandleCoverage({ fetchSucceeded: false, windowStartMs: T0, windowEndMs: T0 + intervalMs, intervalMs, observedStartsMs: [] });
    expect(failed.status).toBe("fetch_failed");
  });

  test("level record carries interval, state, last included observation, and reference timestamp; a post-decision observation is excluded and recorded as excluded", () => {
    const intervalMs = 4 * 60 * 60_000;
    const decision = T0 + 2 * intervalMs; // decision at the end of candle 2
    const candles = [
      { startMs: T0, endMs: T0 + intervalMs, close: 100 },
      { startMs: T0 + intervalMs, endMs: T0 + 2 * intervalMs, close: 101 },
      { startMs: T0 + 2 * intervalMs, endMs: T0 + 3 * intervalMs, close: 999 }, // post-decision: must be excluded
    ];
    const record = buildLevelConstructionRecord({ candles, decisionTimeMs: decision });
    expect(record.intervalMs).toBe(intervalMs);
    expect(record.intervalLabel).toBe("4h");
    expect(record.referenceTimestampMs).toBe(decision);
    expect(record.lastIncludedObservationMs).toBe(T0 + 2 * intervalMs);
    expect(record.includedCount).toBe(2);
    expect(record.excludedPostDecisionMs).toEqual([T0 + 3 * intervalMs]);
    // No included observation is after the decision time.
    expect(record.lastIncludedObservationMs).toBeLessThanOrEqual(decision);
    // A candle straddling the decision makes the state "forming".
    const forming = buildLevelConstructionRecord({ candles, decisionTimeMs: T0 + intervalMs + 1_000 });
    expect(forming.candleState).toBe("forming");
    expect(forming.lastIncludedObservationMs).toBe(T0 + intervalMs);
    const completed = buildLevelConstructionRecord({ candles, decisionTimeMs: decision });
    expect(completed.candleState).toBe("completed");
  });
});

// The ACTUAL paper-path freshness gate in isolation (expert direction
// 2026-10-26): missing, future, stale and boundary timestamps with the
// configured strict comparisons, plus preservation through caching. No
// naturally stale live candidate is needed to prove these branches.
describe("paper-path freshness gate (the production gate, isolated)", () => {
  const frozenAtMs = T0 - 24 * 60 * 60_000;
  const decisionAtMs = T0;
  const gate = (overrides: Partial<Parameters<typeof paperPathFreshnessGate>[0]>) =>
    paperPathFreshnessGate({ decisionAtMs, sourceObservedAtMs: decisionAtMs - 60_000, ledgerOk: true, frozenAtMs, ...overrides });

  test("fresh, timestamped, complete evidence passes", () => {
    expect(gate({}).outcome).toBe("pass");
  });

  test("missing source timestamp defers as decision_input_unverified — never scored around", () => {
    const result = gate({ sourceObservedAtMs: null });
    expect(result.outcome).toBe("deferred");
    if (result.outcome === "deferred") expect(result.code).toBe("decision_input_unverified");
  });

  test("missing factor ledger defers as decision_input_unverified even with a fresh timestamp", () => {
    const result = gate({ ledgerOk: false });
    expect(result.outcome).toBe("deferred");
    if (result.outcome === "deferred") expect(result.code).toBe("decision_input_unverified");
  });

  test("a decision before the freeze defers as pre_freeze_candidate, ahead of every other check", () => {
    const result = gate({ decisionAtMs: frozenAtMs - 1, sourceObservedAtMs: null, ledgerOk: false });
    expect(result.outcome).toBe("deferred");
    if (result.outcome === "deferred") expect(result.code).toBe("pre_freeze_candidate");
  });

  test("future source timestamp beyond the configured skew defers as future_source_timestamp", () => {
    const result = gate({ sourceObservedAtMs: decisionAtMs + 2_001 });
    expect(result.outcome).toBe("deferred");
    if (result.outcome === "deferred") expect(result.code).toBe("future_source_timestamp");
  });

  test("boundary: a source exactly at the future-skew limit passes (strict > comparison)", () => {
    expect(gate({ sourceObservedAtMs: decisionAtMs + 2_000 }).outcome).toBe("pass");
  });

  test("stale decision inputs defer as stale_decision_inputs", () => {
    const result = gate({ sourceObservedAtMs: decisionAtMs - DECISION_INPUT_MAX_AGE_MS - 1 });
    expect(result.outcome).toBe("deferred");
    if (result.outcome === "deferred") expect(result.code).toBe("stale_decision_inputs");
  });

  test("boundary: inputs exactly 30 minutes old pass (strict > comparison)", () => {
    expect(gate({ sourceObservedAtMs: decisionAtMs - DECISION_INPUT_MAX_AGE_MS }).outcome).toBe("pass");
  });

  test("preservation through caching: a cached value keeps its original provenance, so an old provenance still defers at the gate", () => {
    // Provenance 31 minutes before the decision; the fetching run reads
    // it NOW. Caching must not re-stamp it fresh.
    const provenanceMs = decisionAtMs - DECISION_INPUT_MAX_AGE_MS - 60_000;
    const record = buildInputFreshnessRecord({
      input: "catalog price", requirement: "required",
      sourceTimeMs: provenanceMs, fetchTimeMs: decisionAtMs,
      maxAgeMs: DECISION_INPUT_MAX_AGE_MS, cached: true, provenanceTimeMs: provenanceMs,
    });
    expect(record.cached).toBe(true);
    expect(record.provenanceTimeMs).toBe(provenanceMs);
    expect(record.status).toBe("stale");
    const result = gate({ sourceObservedAtMs: record.provenanceTimeMs });
    expect(result.outcome).toBe("deferred");
    if (result.outcome === "deferred") expect(result.code).toBe("stale_decision_inputs");
  });

  test("preservation through caching: a cached value with fresh provenance passes the gate on its provenance time", () => {
    const provenanceMs = decisionAtMs - 5 * 60_000;
    const record = buildInputFreshnessRecord({
      input: "catalog price", requirement: "required",
      sourceTimeMs: provenanceMs, fetchTimeMs: decisionAtMs,
      maxAgeMs: DECISION_INPUT_MAX_AGE_MS, cached: true, provenanceTimeMs: provenanceMs,
    });
    expect(record.status).toBe("fresh");
    expect(gate({ sourceObservedAtMs: record.provenanceTimeMs }).outcome).toBe("pass");
  });
});
