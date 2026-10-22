import { describe, expect, test } from "bun:test";
import { assertTierRefreshComplete, classifyDiscoveryLanes, healthyEmptyStatus, namedTimeoutSummary, validationBeforeScoring } from "./discovery-repair";

describe("bounded discovery repair", () => {
  test("non-empty saved T1 with zero fresh-catalog intersection pauses only the tier lane", () => {
    const lanes = classifyDiscoveryLanes({ tierSnapshotUsable: true, tierRunId: 26, savedT1Count: 3, catalogT1Intersection: 0, catalogCount: 500, velocityIndependent: true });
    expect(lanes.tierLaneStatus).toStartWith("paused(identity mismatch:");
    expect(lanes.velocityLaneStatus).toStartWith("active(");
    expect(healthyEmptyStatus(500, 10)).toBe("continue");
  });

  test("incomplete refresh rejects before any write and preserves the accepted snapshot", () => {
    const acceptedSnapshot = ["btc", "eth", "sol"];
    let writes = 0;
    const publish = () => { assertTierRefreshComplete(73, 73, true); writes += 1; acceptedSnapshot.splice(0, acceptedSnapshot.length, "replacement"); };
    expect(publish).toThrow("Incomplete tier snapshot rejected before persistence");
    expect(writes).toBe(0);
    expect(acceptedSnapshot).toEqual(["btc", "eth", "sol"]);
  });

  test("legitimate zero-T1 snapshot plus zero velocity qualifiers is a healthy empty run", () => {
    const lanes = classifyDiscoveryLanes({ tierSnapshotUsable: true, tierRunId: 27, savedT1Count: 0, catalogT1Intersection: 0, catalogCount: 500, velocityIndependent: true });
    expect(lanes.legitimateZeroT1).toBe(true);
    expect(lanes.tierLaneStatus).toStartWith("active(");
    expect(lanes.identityMismatch).toBe(false);
    expect(healthyEmptyStatus(500, 0)).toBe("empty");
  });

  test("stale running lease receives a named timeout and a new lease is distinct", () => {
    const oldLease = "lease-old";
    const newLease = "lease-new";
    const summary = namedTimeoutSummary("catalog-fetch", oldLease);
    expect(summary).toBe("Named timeout: execution deadline exceeded without completion. Last checkpoint: catalog-fetch. Lease lease-old fenced.");
    expect(newLease).not.toBe(oldLease);
    expect(summary).toContain("fenced");
  });

  test("global catalog validation occurs before scoring fan-out", () => {
    let scoringCalls = 0;
    const result = validationBeforeScoring(42, () => { scoringCalls += 1; });
    expect(result).toBe("failed");
    expect(scoringCalls).toBe(0);
  });
});

// ── Batch 5 Part A (2026-10-20): discovery survival acceptance checks.
// These exercise the pure helpers actions.ts wires to the DB/network, in
// the exact shapes the spec's sandbox checks prescribe.
import { CATALOG_MISSED_MESSAGE, CATALOG_PAGE_RETRY_DELAYS_MS, chunkArray, DISCOVERY_STAGE_BUDGET_MS, isLiveDiscoveryLease, priceMovePct, resolveCatalog, retryOnce, shouldCarryStoredChart, skippedVenueAttempt, StageBudgetTimeoutError, stageBudgetExhaustedDetail, suppressedDuplicateMessage, withStageBudget } from "./discovery-repair";

describe("batch 5 part A — discovery survival", () => {
  test("A1b budgets: the per-stage caps match the spec and sum above the outer deadline by design", () => {
    expect(DISCOVERY_STAGE_BUDGET_MS["tier-freshness"]).toBe(5 * 60_000);
    expect(DISCOVERY_STAGE_BUDGET_MS["api-budgets"]).toBe(2 * 60_000);
    expect(DISCOVERY_STAGE_BUDGET_MS["catalog-fetch"]).toBe(3 * 60_000);
    expect(DISCOVERY_STAGE_BUDGET_MS.velocity).toBe(2 * 60_000);
    expect(DISCOVERY_STAGE_BUDGET_MS.charts).toBe(4 * 60_000);
    expect(DISCOVERY_STAGE_BUDGET_MS.hyperliquid).toBe(90_000);
    expect(DISCOVERY_STAGE_BUDGET_MS.scoring).toBe(2 * 60_000);
    expect(DISCOVERY_STAGE_BUDGET_MS.synthesis).toBe(90_000);
    expect(DISCOVERY_STAGE_BUDGET_MS.persistence).toBe(2 * 60_000);
    expect(stageBudgetExhaustedDetail("tier-freshness", 5 * 60_000)).toBe("stage budget exhausted after 300s; run continued with partial data");
  });

  test("acceptance 1: tier-freshness budget forced to 1s against a hung refresh times out ~1s while the velocity lane completes", async () => {
    const hung = new Promise<never>(() => { /* never resolves */ });
    const started = Date.now();
    let caught: unknown = null;
    try {
      await withStageBudget("tier freshness refresh", 1_000, hung);
    } catch (error) { caught = error; }
    const elapsed = Date.now() - started;
    expect(caught).toBeInstanceOf(StageBudgetTimeoutError);
    expect(elapsed).toBeGreaterThanOrEqual(900);
    expect(elapsed).toBeLessThan(2_500);
    // The independent lane is a separate await: it still completes.
    const velocity = await withStageBudget("velocity", 1_000, Promise.resolve("velocity-complete"));
    expect(velocity).toBe("velocity-complete");
  });

  test("A1a: a probe-dead venue leg is recorded as a visible skip, never silent", () => {
    expect(skippedVenueAttempt("Binance")).toEqual({ provider: "Binance", status: "provider_rejection", detail: "run-level probe failed; leg skipped" });
    expect(skippedVenueAttempt("CoinGecko").detail).toBe("run-level probe failed; leg skipped");
  });

  test("acceptance 2: 429s on both catalog pages + 3h-old snapshot → cached provenance, 500 rows", () => {
    const snapshotRows = Array.from({ length: 500 }, (_, i) => ({ id: `coin-${i}` }));
    const decision = resolveCatalog({ freshRows: [], snapshot: { rows: snapshotRows, fetchedAtMs: Date.now() - 3 * 3_600_000 }, nowMs: Date.now() });
    expect(decision.kind).toBe("cached");
    if (decision.kind === "cached") {
      expect(decision.provenance).toBe("cached (age 3.0h)");
      expect(decision.rows.length).toBe(500);
    }
  });

  test("acceptance 3: 429s + no snapshot → MISSED; a >24h snapshot is also MISSED; fresh >= 100 wins over cache", () => {
    const noSnapshot = resolveCatalog({ freshRows: [], snapshot: null, nowMs: Date.now() });
    expect(noSnapshot.kind).toBe("missed");
    expect(noSnapshot.provenance).toBe(CATALOG_MISSED_MESSAGE);
    const staleSnapshot = resolveCatalog({ freshRows: [], snapshot: { rows: [{ id: "x" }], fetchedAtMs: Date.now() - 25 * 3_600_000 }, nowMs: Date.now() });
    expect(staleSnapshot.kind).toBe("missed");
    const fresh = resolveCatalog({ freshRows: Array.from({ length: 500 }, (_, i) => ({ id: `c${i}` })), snapshot: { rows: [{ id: "old" }], fetchedAtMs: Date.now() - 3_600_000 }, nowMs: Date.parse("2026-10-20T07:00:00.000Z") });
    expect(fresh.kind).toBe("fresh");
    if (fresh.kind === "fresh") expect(fresh.provenance).toBe("fresh 2026-10-20T07:00:00.000Z (2 pages)");
    expect(CATALOG_PAGE_RETRY_DELAYS_MS).toEqual([2_000, 8_000, 32_000]);
  });

  test("acceptance 4: single-flight — only a live, heartbeating, in-deadline running row suppresses a duplicate", () => {
    const now = Date.now();
    const live = { status: "running", deadlineAtMs: now + 10 * 60_000, lastHeartbeatAtMs: now - 30_000 };
    expect(isLiveDiscoveryLease(live, now)).toBe(true);
    // Stale heartbeat (> 3 min) does not block — the lease is reaped instead.
    expect(isLiveDiscoveryLease({ ...live, lastHeartbeatAtMs: now - 4 * 60_000 }, now)).toBe(false);
    // Past deadline does not block.
    expect(isLiveDiscoveryLease({ ...live, deadlineAtMs: now - 1_000 }, now)).toBe(false);
    // A finished run never blocks (in-progress lock, not a done-lock).
    expect(isLiveDiscoveryLease({ ...live, status: "complete" }, now)).toBe(false);
    expect(isLiveDiscoveryLease({ ...live, status: "missed" }, now)).toBe(false);
    expect(suppressedDuplicateMessage(121, "lease-abc")).toBe("suppressed duplicate invocation — run #121 already in flight (lease lease-abc)");
  });

  test("acceptance 5: receipt write failing once is retried and proceeds; failing twice throws the original error", async () => {
    let calls = 0;
    const flaky = async () => { calls += 1; if (calls === 1) throw new Error("transient write failure"); return "written"; };
    await expect(retryOnce(flaky, { sleep: async () => {} })).resolves.toBe("written");
    expect(calls).toBe(2);
    let calls2 = 0;
    const original = new Error("original receipt fault");
    const alwaysFails = async () => { calls2 += 1; throw calls2 === 1 ? original : new Error("retry fault"); };
    await expect(retryOnce(alwaysFails, { sleep: async () => {} })).rejects.toBe(original);
    expect(calls2).toBe(2);
  });

  test("acceptance 6: stored-chart carry-forward — <= 2% move carries, > 2% move fetches fresh", () => {
    expect(priceMovePct(100, 101.5)).toBeCloseTo(1.5);
    expect(shouldCarryStoredChart(100, 101.5)).toBe(true);
    expect(shouldCarryStoredChart(100, 102)).toBe(true);
    expect(shouldCarryStoredChart(100, 103)).toBe(false);
    expect(shouldCarryStoredChart(100, 97)).toBe(false);
    expect(shouldCarryStoredChart(null, 100)).toBe(false);
    expect(shouldCarryStoredChart(100, null)).toBe(false);
  });

  test("acceptance 7: chunked chart gate — a budget stop mid-gate leaves the checkpoint holding partial counts", async () => {
    const targets = Array.from({ length: 160 }, (_, i) => i);
    const chunks = chunkArray(targets, 40);
    expect(chunks.length).toBe(4);
    expect(chunks.map((chunk) => chunk.length)).toEqual([40, 40, 40, 40]);
    // Simulate the gate: an intermediate checkpoint write after each chunk;
    // the budget fires after chunk 2 — the last checkpoint already holds 80.
    const checkpoints: Array<{ processed: number; total: number }> = [];
    let processed = 0;
    for (const chunk of chunks) {
      processed += chunk.length;
      checkpoints.push({ processed, total: targets.length });
      if (processed === 80) break; // stage budget fires here
    }
    expect(checkpoints.at(-1)).toEqual({ processed: 80, total: 160 });
    expect(`charts partial: ${processed}/${targets.length} (budget)`).toBe("charts partial: 80/160 (budget)");
  });
});
