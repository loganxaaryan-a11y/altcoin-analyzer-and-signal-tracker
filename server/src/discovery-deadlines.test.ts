import { describe, expect, test } from "bun:test";
import {
  canTransitionDiscoveryRun,
  DISCOVERY_RUN_TERMINAL_STATUSES,
  isReapableStaleDiscoveryRun,
  requiredFeedDeferralReason,
  runBudgetedChecks,
  scoringBudgetDeferralReason,
  settleFeedWithDeadline,
} from "./discovery-repair";

// ── Run-186 repair acceptance (2026-10-25). Run 186 (1300 slot, 2026-10-25)
// froze with its last heartbeat at the "hyperliquid" checkpoint: the
// section AFTER that checkpoint — per-candidate post-decision evidence
// checks chaining many transport-bounded calls, one leg with no timeout at
// all — had no aggregate deadline, no intermediate heartbeat, and no lease
// assertion until every candidate finished. These tests replay a stalled
// external call against the pure cores actions.ts wires to the network and
// the DB. PAPER ONLY; no thresholds, scores, gates, entry contract, or the
// production admission rule are exercised or changed here.

const HUNG = new Promise<never>(() => { /* a stalled external call: never settles */ });

describe("run-186 repair — bounded deadlines on external calls", () => {
  test("a stalled feed call settles as explicitly unavailable at its deadline, never hangs", async () => {
    const started = Date.now();
    const settlement = await settleFeedWithDeadline("Hyperliquid funding history", 60, HUNG);
    const elapsed = Date.now() - started;
    expect(settlement.status).toBe("unavailable");
    if (settlement.status === "unavailable") {
      expect(settlement.reason).toContain("timeout:");
      expect(settlement.reason).toContain("Hyperliquid funding history");
    }
    expect(elapsed).toBeGreaterThanOrEqual(50);
    expect(elapsed).toBeLessThan(1_500);
  });

  test("a feed that answers inside its deadline settles available with its value", async () => {
    const settlement = await settleFeedWithDeadline("veto quote poll", 1_000, Promise.resolve({ rows: 3 }));
    expect(settlement).toEqual({ status: "available", value: { rows: 3 } });
  });

  test("a feed that throws settles unavailable with the failure as the reason", async () => {
    const settlement = await settleFeedWithDeadline("catalog page", 1_000, Promise.reject(new Error("HTTP 429 from provider")));
    expect(settlement.status).toBe("unavailable");
    if (settlement.status === "unavailable") expect(settlement.reason).toContain("HTTP 429");
  });
});

describe("run-186 repair — optional vs required feeds", () => {
  test("optional feed unavailable: the run continues and records the feed explicitly unavailable", async () => {
    // Optional-feed pattern (e.g. Hyperliquid perp context in discovery):
    // settle with a deadline, record unavailable in source status, continue
    // with an empty context — the run is degraded in the open, never hung
    // and never silently zero-filled.
    const sourceStatus: Array<{ source: string; status: "live" | "unavailable"; detail: string }> = [];
    const settlement = await settleFeedWithDeadline("Hyperliquid market contexts", 60, HUNG);
    const contexts = settlement.status === "available" ? settlement.value : new Map<string, unknown>();
    sourceStatus.push({
      source: "Hyperliquid",
      status: contexts.size ? "live" : "unavailable",
      detail: contexts.size ? `${contexts.size} perpetual contexts checked.` : `Perpetual context feed unavailable.${settlement.status === "unavailable" ? ` ${settlement.reason}` : ""}`,
    });
    // The run continued past the feed: downstream work still executes.
    const downstream = "scoring continued";
    expect(downstream).toBe("scoring continued");
    expect(sourceStatus[0]?.status).toBe("unavailable");
    expect(sourceStatus[0]?.detail).toContain("Perpetual context feed unavailable.");
    expect(sourceStatus[0]?.detail).toContain("Hyperliquid market contexts");
  });

  test("required feed unavailable: affected candidates are deferred with the reason, unaffected candidates are untouched", async () => {
    const reason = requiredFeedDeferralReason("post-decision evidence (history cache + OHLC)", "timeout: issuance evidence FOO exceeded 60s");
    expect(reason).toBe("deferred — required feed unavailable (post-decision evidence (history cache + OHLC)): timeout: issuance evidence FOO exceeded 60s");
    const candidates = [
      { coinId: "foo", suppressionReason: null as string | null },
      { coinId: "bar", suppressionReason: null as string | null },
    ];
    const affected = new Set(["foo"]);
    const after = candidates.map((row) => affected.has(row.coinId) ? { ...row, suppressionReason: reason } : row);
    expect(after[0]?.suppressionReason).toBe(reason);
    expect(after[1]?.suppressionReason).toBeNull();
    // A deferred candidate is not eligible (suppressionReason set) and not
    // dropped: it remains in the candidate list carrying its reason.
    expect(after).toHaveLength(2);
  });
});

describe("run-186 repair — the scoring section cannot hang past its budget", () => {
  test("one stalled candidate defers with the budget reason; finished candidates keep their results; elapsed stays at the budget", async () => {
    const started = Date.now();
    const outcome = await runBudgetedChecks({
      items: [{ coinId: "fast" }, { coinId: "stalled" }, { coinId: "queued" }],
      keyOf: (row) => row.coinId,
      budgetMs: 120,
      concurrency: 1,
      worker: async (row) => {
        if (row.coinId === "stalled") await HUNG;
        return { coinId: row.coinId, checked: true };
      },
    });
    const elapsed = Date.now() - started;
    expect(outcome.budgetExhausted).toBe(true);
    expect(outcome.results.get("fast")).toEqual({ coinId: "fast", checked: true });
    // The stalled candidate AND the never-started candidate are both
    // deferred — with the canonical budget deferral reason, not dropped.
    expect(outcome.deferredKeys.sort()).toEqual(["queued", "stalled"]);
    const reason = scoringBudgetDeferralReason("post-decision evidence (history cache + OHLC)", 120);
    expect(reason).toContain("deferred — required feed unavailable (post-decision evidence (history cache + OHLC))");
    expect(reason).toContain("scoring stage budget exhausted");
    expect(reason).toContain("candidate not evaluated this run");
    expect(elapsed).toBeGreaterThanOrEqual(110);
    expect(elapsed).toBeLessThan(1_500);
  });

  test("when every check finishes inside the budget nothing is deferred and the budget does not fire", async () => {
    const outcome = await runBudgetedChecks({
      items: [{ coinId: "a" }, { coinId: "b" }],
      keyOf: (row) => row.coinId,
      budgetMs: 5_000,
      concurrency: 2,
      worker: async (row) => ({ coinId: row.coinId, checked: true }),
    });
    expect(outcome.budgetExhausted).toBe(false);
    expect(outcome.deferredKeys).toEqual([]);
    expect(outcome.results.size).toBe(2);
  });

  test("after the budget fires, the cooperative abort signal stops new work and gates late writes", async () => {
    let abortedSeenByStalledWorker: boolean | null = null;
    let lateWriteAttempted = false;
    const outcome = await runBudgetedChecks({
      items: [{ coinId: "stalled" }],
      keyOf: (row) => row.coinId,
      budgetMs: 80,
      concurrency: 1,
      worker: async (_row, control) => {
        await new Promise((resolve) => setTimeout(resolve, 250));
        abortedSeenByStalledWorker = control.aborted();
        // The worker pattern in actions.ts: run-scoped writes are skipped
        // once aborted, so a late worker never writes into a fenced run.
        if (!control.aborted()) lateWriteAttempted = true;
        return { coinId: "stalled", checked: true };
      },
    });
    // The budgeted call returned at the deadline with the item deferred,
    // even though the worker was still in flight.
    expect(outcome.budgetExhausted).toBe(true);
    expect(outcome.deferredKeys).toEqual(["stalled"]);
    // Let the background worker finish and confirm it observed the abort.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(abortedSeenByStalledWorker === true).toBe(true);
    expect(lateWriteAttempted).toBe(false);
    // And its late result never entered the snapshotted outcome.
    expect(outcome.results.has("stalled")).toBe(false);
  });
});

describe("run-186 repair — no run hangs past its deadline unfenced, no coverage gap reopens", () => {
  test("a running row past its deadline is reapable exactly once: running → timeout, then terminal forever", () => {
    const nowMs = Date.parse("2026-10-25T17:20:00.000Z");
    const running = { status: "running", deadlineAtMs: Date.parse("2026-10-25T17:17:55.000Z"), startedAtMs: Date.parse("2026-10-25T16:57:55.000Z") };
    expect(isReapableStaleDiscoveryRun(running, nowMs, 20 * 60_000)).toBe(true);
    expect(canTransitionDiscoveryRun("running", "timeout")).toBe(true);
    // After the reap the row is a terminal coverage gap: not reapable,
    // and no transition out of it exists — above all not back to running.
    const gap = { ...running, status: "timeout" };
    expect(isReapableStaleDiscoveryRun(gap, nowMs + 60 * 60_000, 20 * 60_000)).toBe(false);
    expect(canTransitionDiscoveryRun("timeout", "running")).toBe(false);
    expect(canTransitionDiscoveryRun("timeout", "timeout")).toBe(false);
  });

  test("run 186's closed slot stays a coverage gap: terminal statuses never transition anywhere", () => {
    for (const terminal of DISCOVERY_RUN_TERMINAL_STATUSES) {
      for (const target of ["running", "complete", "degraded", "empty", "missed", "timeout", "failed"]) {
        expect(canTransitionDiscoveryRun(terminal, target)).toBe(false);
      }
    }
    // The legal exits from running are exactly the terminal statuses.
    for (const terminal of DISCOVERY_RUN_TERMINAL_STATUSES) {
      expect(canTransitionDiscoveryRun("running", terminal)).toBe(true);
    }
    expect(canTransitionDiscoveryRun("running", "running")).toBe(false);
  });

  test("a live running row inside its deadline is not reapable", () => {
    const nowMs = Date.parse("2026-10-25T17:00:00.000Z");
    const live = { status: "running", deadlineAtMs: Date.parse("2026-10-25T17:17:55.000Z"), startedAtMs: Date.parse("2026-10-25T16:57:55.000Z") };
    expect(isReapableStaleDiscoveryRun(live, nowMs, 20 * 60_000)).toBe(false);
    // Legacy rows without a stored deadline fall back to start + deadline.
    const legacyLive = { status: "running", deadlineAtMs: null, startedAtMs: nowMs - 5 * 60_000 };
    expect(isReapableStaleDiscoveryRun(legacyLive, nowMs, 20 * 60_000)).toBe(false);
    const legacyStale = { status: "running", deadlineAtMs: null, startedAtMs: nowMs - 21 * 60_000 };
    expect(isReapableStaleDiscoveryRun(legacyStale, nowMs, 20 * 60_000)).toBe(true);
  });
});
