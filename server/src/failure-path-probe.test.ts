import { describe, expect, test } from "bun:test";
import { runFailurePathProbe } from "./failure-path-probe";
import { HANDOFF_PROTECTION_RESERVE_MS } from "./discovery-pipeline";

// ── Unit 1 failure-path probe acceptance (2026-10-28) ───────────────────
// The probe is the behavioral evidence the success-path sandbox run did
// not provide: a handoff-missing run closing FAILED, the failure record
// and fallback log surviving a double write failure, and slow/failed
// news + theory stages demonstrably unable to delay the handoff. It is
// isolated: synthetic run ids only, no 219 replay, no issuance.

describe("Unit 1 isolated failure-path probe", () => {
  test("every scenario passes and no position is created", async () => {
    const report = await runFailurePathProbe();
    for (const s of report.scenarios) {
      if (!s.passed) throw new Error(`scenario ${s.id} failed: ${s.detail}`);
    }
    expect(report.allPassed).toBe(true);
    expect(report.positionsCreated).toBe(0);
    expect(report.reserveMs).toBe(HANDOFF_PROTECTION_RESERVE_MS);
    expect(report.reserveMs).toBe(195_000);
  });

  test("the receipt for a handoff-missing terminal run is FAILED, naming the missing output", async () => {
    const report = await runFailurePathProbe();
    expect(report.receipt.status).toBe("failed");
    expect(report.receipt.handoffStatus).toBeNull();
    expect(report.receipt.error).toContain("no handoff row and no explicit handoff-failure record");
    const scenario = report.scenarios.find((s) => s.id === "missing_handoff_fails_receipt");
    expect(scenario?.passed).toBe(true);
  });

  test("the failure record and the double-failure fallback log are both produced", async () => {
    const report = await runFailurePathProbe();
    expect(report.failureRecord?.status).toBe("failed");
    expect(report.failureRecord?.reason).toContain("explicit failure record");
    expect(report.fallbackLog).not.toBeNull();
    expect(report.fallbackLog?.lane).toBe("paper_handoff");
    expect(report.fallbackLog?.errorText).toContain("handoff insert failed");
    expect(report.fallbackLog?.captureErrorKind).toBe("Error");
  });

  test("slow and failed news AND theory stages are each exercised, plus the combined case and deferral", async () => {
    const report = await runFailurePathProbe();
    const ids = report.scenarios.map((s) => s.id);
    for (const id of ["slow_news_isolated", "failed_news_isolated", "slow_theory_isolated", "failed_theory_isolated", "slow_news_plus_failed_theory", "reserve_deferral_skips_optional_work"]) {
      expect(ids).toContain(id);
      expect(report.scenarios.find((s) => s.id === id)?.passed).toBe(true);
    }
    // Isolation is timed, not asserted: each hanging stage (5s if
    // awaited) must release the required path in well under a second.
    for (const id of ["slow_news_isolated", "slow_theory_isolated"]) {
      expect(report.scenarios.find((s) => s.id === id)?.durationMs).toBeLessThan(1_000);
    }
  });
});
