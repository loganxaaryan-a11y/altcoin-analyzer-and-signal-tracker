import { describe, expect, test } from "bun:test";
import { computeMonitoringHealth, type EnrollmentRunInput, type MonitoringPositionInput, type MonitorRunInput, type ScheduledRecoveryInput, type SettleRunInput } from "./monitoring-health";

const NOW = Date.parse("2026-10-22T07:00:00Z");
function pos(over: Partial<MonitoringPositionInput> = {}): MonitoringPositionInput {
  return {
    positionId: "paper_open1",
    settled: false,
    lastCoveredBarCloseUtc: "2026-10-22T06:44:59Z",
    lastCheckUtc: "2026-10-22T06:45:10Z",
    latestGapCount: 0,
    latestWindowFromUtc: "2026-10-22T05:32:00Z",
    latestWindowToUtc: "2026-10-22T06:45:05Z",
    latestBarsFetched: 73,
    ...over,
  };
}
const monitorOk: MonitorRunInput = { runUtc: "2026-10-22T06:45:05Z", total: 2, okCount: 2, failCount: 0 };
const settleAfter: SettleRunInput = { runUtc: "2026-10-22T06:52:00Z", total: 2, appendedCount: 0, alreadySettledCount: 1, openNoTouchCount: 1, heldCount: 0, openCoverageComplete: true };
const attestation: ScheduledRecoveryInput = {
  confirmedAtUtc: "2026-10-22T07:35:00Z",
  scheduledRunScheduledFor: "2026-10-22T07:13:00Z",
  monitorLog: "run-20261022T071505Z.json",
  settleLog: "settle-20261022T071535Z.json",
  enrollLog: "enroll-20261022T0716Z.json",
  coverageThroughUtc: "2026-10-22T07:14:59Z",
  cleanupVerified: true,
};
const enrollFresh: EnrollmentRunInput = {
  runUtc: "2026-10-22T06:32:08Z",
  derivedCount: 13,
  addedCount: 0,
  alreadyEnrolledCount: 13,
  unsupportedCount: 0,
  skippedSettledCount: 0,
  discrepancies: [],
  canonicalFileAgeS: 3.5,
};

describe("computeMonitoringHealth", () => {
  test("coverage verified by directed recovery while automation is pending — and the entry gate stays closed", () => {
    const health = computeMonitoringHealth({ positions: [pos(), pos({ positionId: "paper_settled", settled: true })], monitorRun: monitorOk, settleRun: settleAfter, nowMs: NOW });
    // Two separate lines, never one merged badge:
    expect(health.coverageStatus).toBe("verified");
    expect(health.coverage.status).toBe("verified");
    expect(health.coverageBasis).toBe("Coverage verified by directed recovery");
    expect(health.coverage.basis).toBe("Coverage verified by directed recovery");
    expect(health.automation.status).toBe("pending");
    expect(health.automation.label).toBe("Scheduled recovery pending");
    // Coverage verified is not enough: automation pending holds entries.
    expect(health.entryAdmission).toBe("held");
    expect(health.status).toBe("degraded");
    expect(health.failingStage).toContain("automation");
    expect(health.lastSuccessfulCoverageUtc).toBe("2026-10-22T06:44:59.000Z");
    expect(health.settlementVerifiedAfterCoverage).toBe(true);
  });

  test("entry gate opens only when coverage is verified AND scheduled recovery is confirmed by attestation", () => {
    const health = computeMonitoringHealth({ positions: [pos(), pos({ positionId: "paper_settled", settled: true })], monitorRun: monitorOk, settleRun: settleAfter, nowMs: NOW, scheduledRecovery: attestation });
    expect(health.coverageStatus).toBe("verified");
    expect(health.coverageBasis).toBe("Coverage verified by scheduled recovery");
    expect(health.automation.status).toBe("confirmed");
    expect(health.automation.label).toBe("Scheduled recovery confirmed 2026-10-22T07:35:00Z");
    expect(health.automation.cleanupVerified).toBe(true);
    expect(health.entryAdmission).toBe("open");
    expect(health.status).toBe("verified");
  });

  test("absence of the attestation file is a normal pending state, never an error or unavailable", () => {
    const health = computeMonitoringHealth({ positions: [pos()], monitorRun: monitorOk, settleRun: settleAfter, nowMs: NOW, scheduledRecovery: null });
    expect(health.automation.status).toBe("pending");
    expect(health.coverageStatus).toBe("verified");
    expect(health.status).not.toBe("unavailable");
  });

  test("degraded and held when settlement predates the recovered coverage (the 2026-10-22 outage state)", () => {
    const staleSettle: SettleRunInput = { runUtc: "2026-10-22T05:38:50Z", total: 2, appendedCount: 0, alreadySettledCount: 1, openNoTouchCount: 1, heldCount: 0, openCoverageComplete: true };
    const health = computeMonitoringHealth({ positions: [pos()], monitorRun: monitorOk, settleRun: staleSettle, nowMs: NOW });
    expect(health.status).toBe("degraded");
    expect(health.coverageStatus).toBe("degraded");
    expect(health.entryAdmission).toBe("held");
    expect(health.failingStage).toContain("settlement");
    expect(health.recoveredWindowFromUtc).toBe("2026-10-22T05:32:00.000Z");
  });

  test("gaps keep first-touch order unestablished and hold entries", () => {
    const health = computeMonitoringHealth({ positions: [pos({ latestGapCount: 3 })], monitorRun: monitorOk, settleRun: settleAfter, nowMs: NOW, scheduledRecovery: attestation });
    expect(health.status).toBe("degraded");
    expect(health.coverageStatus).toBe("degraded");
    expect(health.gapsTotal).toBe(3);
    expect(health.entryAdmission).toBe("held");
  });

  test("a previously successful pass becomes stale after 45 minutes and closes the gate even with an attestation", () => {
    const old = pos({ lastCoveredBarCloseUtc: "2026-10-22T05:00:00Z" });
    const health = computeMonitoringHealth({ positions: [old], monitorRun: monitorOk, settleRun: settleAfter, nowMs: NOW, scheduledRecovery: attestation });
    expect(health.coverageStatus).toBe("stale");
    expect(health.coverage.status).toBe("stale");
    expect(health.status).toBe("degraded");
    expect(health.entryAdmission).toBe("held");
    expect(health.failingStage).toContain("stale");
    expect(health.reasons.join(" ")).toContain("does not stay verified");
  });

  test("coverage exactly at the 45-minute bound is not yet stale; one minute past it is", () => {
    const atBound = computeMonitoringHealth({ positions: [pos({ lastCoveredBarCloseUtc: "2026-10-22T06:15:00Z" })], monitorRun: monitorOk, settleRun: settleAfter, nowMs: NOW, scheduledRecovery: attestation });
    expect(atBound.coverageAgeMs).toBe(45 * 60_000);
    expect(atBound.coverageStatus).toBe("verified");
    const pastBound = computeMonitoringHealth({ positions: [pos({ lastCoveredBarCloseUtc: "2026-10-22T06:14:59Z" })], monitorRun: monitorOk, settleRun: settleAfter, nowMs: NOW, scheduledRecovery: attestation });
    expect(pastBound.coverageStatus).toBe("stale");
    expect(pastBound.entryAdmission).toBe("held");
  });

  test("a failed position in the latest monitor run blocks verification and never advances the verdict", () => {
    const run: MonitorRunInput = { runUtc: "2026-10-22T06:45:05Z", total: 2, okCount: 1, failCount: 1 };
    const health = computeMonitoringHealth({ positions: [pos()], monitorRun: run, settleRun: settleAfter, nowMs: NOW, scheduledRecovery: attestation });
    expect(health.status).toBe("degraded");
    expect(health.coverageStatus).toBe("degraded");
    expect(health.latestMonitorRunOk).toBe(false);
  });

  test("a held settlement blocks verification", () => {
    const held: SettleRunInput = { ...settleAfter, heldCount: 1, openCoverageComplete: false };
    const health = computeMonitoringHealth({ positions: [pos()], monitorRun: monitorOk, settleRun: held, nowMs: NOW, scheduledRecovery: attestation });
    expect(health.status).toBe("degraded");
    expect(health.settlementVerifiedAfterCoverage).toBe(false);
  });

  test("unavailable when the monitoring store is unreachable, and entries stay held (fail closed)", () => {
    const health = computeMonitoringHealth({ positions: [], monitorRun: null, settleRun: null, nowMs: NOW });
    expect(health.status).toBe("unavailable");
    expect(health.coverageStatus).toBe("unavailable");
    expect(health.entryAdmission).toBe("held");
    expect(health.automation.label).toBe("Scheduled recovery pending");
    expect(health.enrollment.available).toBe(false);
    expect(health.enrollment.source).toBe("unavailable");
  });

  test("enrollment fresh pull: source, derived vs enrolled counts, and the canonical timestamp are surfaced", () => {
    const health = computeMonitoringHealth({ positions: [pos()], monitorRun: monitorOk, settleRun: settleAfter, nowMs: NOW, enrollmentRun: enrollFresh, canonicalFileModifiedUtc: "2026-10-22T06:32:05Z" });
    expect(health.enrollment.available).toBe(true);
    expect(health.enrollment.source).toBe("fresh_pull");
    expect(health.enrollment.canonicalFileUtc).toBe("2026-10-22T06:32:05Z");
    expect(health.enrollment.canonicalFileAgeAtEnrollS).toBe(3.5);
    expect(health.enrollment.derivedCount).toBe(13);
    expect(health.enrollment.enrolledCount).toBe(13);
    expect(health.enrollment.discrepancyCount).toBe(0);
  });

  test("enrollment fallback: an old canonical file is disclosed as last-good-file fallback and discrepancies are listed, never skipped", () => {
    const fallback: EnrollmentRunInput = {
      runUtc: "2026-10-22T06:45:00Z",
      derivedCount: 11,
      addedCount: 0,
      alreadyEnrolledCount: 11,
      unsupportedCount: 0,
      skippedSettledCount: 0,
      discrepancies: [
        { positionId: "paper_missing1", candidateId: 501, reason: "entered checkpoint with no ENTRY_CONFIRMED alert" },
        { positionId: "paper_missing2", candidateId: 502, reason: "canonical cross-check mismatch" },
      ],
      canonicalFileAgeS: 3600,
    };
    const health = computeMonitoringHealth({ positions: [pos()], monitorRun: monitorOk, settleRun: settleAfter, nowMs: NOW, enrollmentRun: fallback, canonicalFileModifiedUtc: "2026-10-22T05:45:00Z" });
    expect(health.enrollment.source).toBe("last_good_file_fallback");
    expect(health.enrollment.sourceLabel).toContain("Last-good-file fallback");
    expect(health.enrollment.derivedCount).toBe(11);
    expect(health.enrollment.enrolledCount).toBe(11);
    expect(health.enrollment.discrepancies).toHaveLength(2);
    expect(health.enrollment.discrepancies[0]?.positionId).toBe("paper_missing1");
    expect(health.enrollment.discrepancyCount).toBe(2);
    expect(health.reasons.join(" ")).toContain("could not be reconciled");
  });

  test("enrollment source falls back to the canonical mtime vs enroll run time when the log carries no age", () => {
    const noAge: EnrollmentRunInput = { ...enrollFresh, canonicalFileAgeS: null, runUtc: "2026-10-22T06:32:08Z" };
    const fresh = computeMonitoringHealth({ positions: [pos()], monitorRun: monitorOk, settleRun: settleAfter, nowMs: NOW, enrollmentRun: noAge, canonicalFileModifiedUtc: "2026-10-22T06:32:05Z" });
    expect(fresh.enrollment.source).toBe("fresh_pull");
    const stale = computeMonitoringHealth({ positions: [pos()], monitorRun: monitorOk, settleRun: settleAfter, nowMs: NOW, enrollmentRun: noAge, canonicalFileModifiedUtc: "2026-10-22T05:32:05Z" });
    expect(stale.enrollment.source).toBe("last_good_file_fallback");
  });
});
