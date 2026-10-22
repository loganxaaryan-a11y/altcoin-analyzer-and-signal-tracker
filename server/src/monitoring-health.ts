// Monitoring-outage recovery health (2026-10-22, refined per doc 57).
//
// Pure derivation over the original-venue monitoring store's own records:
// enrolled positions, per-position coverage checkpoints (state.json),
// latest observations, the latest monitor run log, the latest settlement
// run log, the latest enrollment run log, and the scheduled-recovery
// attestation file. No timestamps are invented and no checkpoint is
// advanced here — this module only reads what the monitoring lane wrote.
//
// COVERAGE and AUTOMATION are separate claims and are never merged into a
// single badge (doc 57 §2):
//   - Coverage: verified / degraded / stale / unavailable, derived from
//     the store checkpoints. It is VERIFIED only when every open position
//     has a checkpoint, the latest observations report zero gaps, the
//     latest monitor run completed every position, and a settlement pass
//     under the frozen contract has run at or after the latest monitor
//     run with complete coverage and nothing held. Until a scheduled-
//     recovery attestation exists, the basis of the last verified
//     coverage is the directed recovery pass (2026-10-22T06:45Z, last
//     verified coverage 2026-10-22T06:44:59Z) and reads exactly
//     "Coverage verified by directed recovery".
//   - Automation: "Scheduled recovery pending" until
//     monitoring/scheduled-recovery.json exists — that file is written
//     only by the one-time confirmation check after a scheduled lane run
//     completes monitor + settle + enroll cleanly. Absence of the file
//     is a normal pending state, never an error. When present, the line
//     reads "Scheduled recovery confirmed <confirmed_at_utc>".
//
// FRESHNESS is part of the gate (doc 57 §3): complete coverage older
// than 45 minutes (30-minute cadence + slack) is STALE — a degraded
// class — so a single good pass never reads verified forever.
//
// ENTRY GATE: admission is open only when coverage is verified AND
// automation is confirmed. It stays closed while coverage is degraded
// or stale, and also while automation is still pending even when
// coverage itself is verified. Discovery and research never read this
// state.

export const MONITORING_STALE_AFTER_MS = 45 * 60_000; // 1.5x the 30m cadence
// A canonical file saved by a fresh pull lands seconds before the enroll
// run starts (observed live: 0.1–24.3s across the 2026-10-21/22 runs).
// Anything older than this bound at enroll time is disclosed as a
// last-good-file fallback instead of a fresh pull.
export const ENROLLMENT_FRESH_PULL_MAX_AGE_S = 300;

export const DIRECTED_RECOVERY_BASIS = "Coverage verified by directed recovery";
export const SCHEDULED_RECOVERY_BASIS = "Coverage verified by scheduled recovery";
export const AUTOMATION_PENDING_LABEL = "Scheduled recovery pending";

export type MonitoringPositionInput = {
  positionId: string;
  settled: boolean;
  lastCoveredBarCloseUtc: string | null;
  lastCheckUtc: string | null;
  latestGapCount: number | null;
  latestWindowFromUtc: string | null;
  latestWindowToUtc: string | null;
  latestBarsFetched: number | null;
};

export type MonitorRunInput = {
  runUtc: string | null;
  total: number;
  okCount: number;
  failCount: number;
} | null;

export type SettleRunInput = {
  runUtc: string | null;
  total: number;
  appendedCount: number;
  alreadySettledCount: number;
  openNoTouchCount: number;
  heldCount: number;
  openCoverageComplete: boolean;
} | null;

export type ScheduledRecoveryInput = {
  confirmedAtUtc: string | null;
  scheduledRunScheduledFor: string | null;
  monitorLog: string | null;
  settleLog: string | null;
  enrollLog: string | null;
  coverageThroughUtc: string | null;
  cleanupVerified: boolean | null;
} | null;

export type EnrollmentDiscrepancy = {
  positionId: string | null;
  candidateId: number | null;
  reason: string;
};

export type EnrollmentRunInput = {
  runUtc: string | null;
  derivedCount: number | null;
  addedCount: number | null;
  alreadyEnrolledCount: number | null;
  unsupportedCount: number | null;
  skippedSettledCount: number | null;
  discrepancies: EnrollmentDiscrepancy[];
  canonicalFileAgeS: number | null;
} | null;

export type CoverageStatus = "verified" | "degraded" | "stale" | "unavailable";

export type CoverageHealth = {
  status: CoverageStatus;
  basis: string;
  lastSuccessfulCoverageUtc: string | null;
  coverageAgeMs: number | null;
  staleAfterMs: number;
  gapsTotal: number;
};

export type AutomationHealth = {
  status: "pending" | "confirmed";
  label: string;
  confirmedAtUtc: string | null;
  scheduledRunScheduledFor: string | null;
  coverageThroughUtc: string | null;
  cleanupVerified: boolean | null;
  monitorLog: string | null;
  settleLog: string | null;
  enrollLog: string | null;
};

export type EnrollmentHealth = {
  available: boolean;
  runUtc: string | null;
  source: "fresh_pull" | "last_good_file_fallback" | "unknown" | "unavailable";
  sourceLabel: string;
  canonicalFileUtc: string | null;
  canonicalFileAgeAtEnrollS: number | null;
  derivedCount: number | null;
  enrolledCount: number | null;
  addedCount: number | null;
  alreadyEnrolledCount: number | null;
  discrepancies: EnrollmentDiscrepancy[];
  discrepancyCount: number;
};

export type MonitoringHealth = {
  // Overall verdict: "verified" only when coverage is verified AND
  // automation is confirmed (the entry gate is open). Kept for existing
  // consumers; the panel renders coverage and automation separately.
  status: "verified" | "degraded" | "unavailable";
  entryAdmission: "open" | "held";
  coverageStatus: CoverageStatus;
  coverageBasis: string;
  coverage: CoverageHealth;
  automation: AutomationHealth;
  enrollment: EnrollmentHealth;
  totalPositions: number;
  openPositions: number;
  settledPositions: number;
  lastSuccessfulCoverageUtc: string | null;
  coverageAgeMs: number | null;
  gapsTotal: number;
  latestMonitorRunUtc: string | null;
  latestMonitorRunOk: boolean;
  recoveredWindowFromUtc: string | null;
  recoveredWindowToUtc: string | null;
  recoveredBars: number | null;
  settlementRunUtc: string | null;
  settlementVerifiedAfterCoverage: boolean;
  settlementAppended: number | null;
  failingStage: string | null;
  reasons: string[];
};

function parseMs(value: string | null): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function buildAutomation(scheduledRecovery: ScheduledRecoveryInput): AutomationHealth {
  if (!scheduledRecovery) {
    return {
      status: "pending",
      label: AUTOMATION_PENDING_LABEL,
      confirmedAtUtc: null,
      scheduledRunScheduledFor: null,
      coverageThroughUtc: null,
      cleanupVerified: null,
      monitorLog: null,
      settleLog: null,
      enrollLog: null,
    };
  }
  return {
    status: "confirmed",
    label: scheduledRecovery.confirmedAtUtc ? `Scheduled recovery confirmed ${scheduledRecovery.confirmedAtUtc}` : "Scheduled recovery confirmed",
    confirmedAtUtc: scheduledRecovery.confirmedAtUtc,
    scheduledRunScheduledFor: scheduledRecovery.scheduledRunScheduledFor,
    coverageThroughUtc: scheduledRecovery.coverageThroughUtc,
    cleanupVerified: scheduledRecovery.cleanupVerified,
    monitorLog: scheduledRecovery.monitorLog,
    settleLog: scheduledRecovery.settleLog,
    enrollLog: scheduledRecovery.enrollLog,
  };
}

function buildEnrollment(enrollmentRun: EnrollmentRunInput, canonicalFileModifiedUtc: string | null): EnrollmentHealth {
  if (!enrollmentRun) {
    return {
      available: false,
      runUtc: null,
      source: "unavailable",
      sourceLabel: "Enrollment unavailable — no enroll run log is reachable from this view; unreconciled positions cannot be ruled out, so nothing is assumed enrolled beyond the positions shown.",
      canonicalFileUtc: canonicalFileModifiedUtc,
      canonicalFileAgeAtEnrollS: null,
      derivedCount: null,
      enrolledCount: null,
      addedCount: null,
      alreadyEnrolledCount: null,
      discrepancies: [],
      discrepancyCount: 0,
    };
  }
  const discrepancies = enrollmentRun.discrepancies ?? [];
  const enrolledCount = enrollmentRun.addedCount != null && enrollmentRun.alreadyEnrolledCount != null
    ? enrollmentRun.addedCount + enrollmentRun.alreadyEnrolledCount
    : null;
  // Age of the canonical file at enroll time: the enroll log's own
  // canonical_file_age_s is authoritative (the file's current mtime may
  // already belong to a later pull); fall back to the mtime-vs-run
  // difference only when the log carries no age.
  const runMs = parseMs(enrollmentRun.runUtc);
  const canonicalMs = parseMs(canonicalFileModifiedUtc);
  const ageAtEnrollS = enrollmentRun.canonicalFileAgeS
    ?? (runMs != null && canonicalMs != null ? Math.max(0, Math.round((runMs - canonicalMs) / 100) / 10) : null);
  let source: EnrollmentHealth["source"] = "unknown";
  let sourceLabel: string;
  if (ageAtEnrollS == null) {
    sourceLabel = "Enrollment source unknown — the canonical-entered.json timestamp could not be compared with the enroll run time; whether this run used a fresh pull or the last good file is not established.";
  } else if (ageAtEnrollS <= ENROLLMENT_FRESH_PULL_MAX_AGE_S) {
    source = "fresh_pull";
    sourceLabel = `Fresh pull — canonical-entered.json was saved ${ageAtEnrollS}s before the enroll run, so this run reconciled against a current pull.`;
  } else {
    source = "last_good_file_fallback";
    sourceLabel = `Last-good-file fallback — canonical-entered.json was ${ageAtEnrollS}s old at the enroll run, so this run reconciled against the last good file, not a fresh pull. Positions it could not reconcile are listed explicitly below, never silently skipped.`;
  }
  return {
    available: true,
    runUtc: enrollmentRun.runUtc,
    source,
    sourceLabel,
    canonicalFileUtc: canonicalFileModifiedUtc,
    canonicalFileAgeAtEnrollS: ageAtEnrollS,
    derivedCount: enrollmentRun.derivedCount,
    enrolledCount,
    addedCount: enrollmentRun.addedCount,
    alreadyEnrolledCount: enrollmentRun.alreadyEnrolledCount,
    discrepancies,
    discrepancyCount: discrepancies.length,
  };
}

export function computeMonitoringHealth(input: {
  positions: MonitoringPositionInput[];
  monitorRun: MonitorRunInput;
  settleRun: SettleRunInput;
  nowMs: number;
  scheduledRecovery?: ScheduledRecoveryInput;
  enrollmentRun?: EnrollmentRunInput;
  canonicalFileModifiedUtc?: string | null;
}): MonitoringHealth {
  const { positions, monitorRun, settleRun, nowMs } = input;
  const automation = buildAutomation(input.scheduledRecovery ?? null);
  const enrollment = buildEnrollment(input.enrollmentRun ?? null, input.canonicalFileModifiedUtc ?? null);
  const open = positions.filter((row) => !row.settled);
  const settledCount = positions.length - open.length;
  const coverageBasis = automation.status === "confirmed" ? SCHEDULED_RECOVERY_BASIS : DIRECTED_RECOVERY_BASIS;
  const partial: Omit<MonitoringHealth, "coverage" | "automation" | "enrollment" | "coverageStatus" | "coverageBasis"> = {
    status: "unavailable",
    entryAdmission: "held",
    totalPositions: positions.length,
    openPositions: open.length,
    settledPositions: settledCount,
    lastSuccessfulCoverageUtc: null,
    coverageAgeMs: null,
    gapsTotal: 0,
    latestMonitorRunUtc: monitorRun?.runUtc ?? null,
    latestMonitorRunOk: Boolean(monitorRun && monitorRun.total > 0 && monitorRun.failCount === 0 && monitorRun.okCount === monitorRun.total),
    recoveredWindowFromUtc: null,
    recoveredWindowToUtc: null,
    recoveredBars: null,
    settlementRunUtc: settleRun?.runUtc ?? null,
    settlementVerifiedAfterCoverage: false,
    settlementAppended: settleRun ? settleRun.appendedCount : null,
    failingStage: null,
    reasons: [],
  };
  const finish = (rest: Omit<MonitoringHealth, "coverage" | "automation" | "enrollment" | "coverageStatus" | "coverageBasis">, coverageStatus: CoverageStatus): MonitoringHealth => ({
    ...rest,
    coverageStatus,
    coverageBasis,
    coverage: {
      status: coverageStatus,
      basis: coverageBasis,
      lastSuccessfulCoverageUtc: rest.lastSuccessfulCoverageUtc,
      coverageAgeMs: rest.coverageAgeMs,
      staleAfterMs: MONITORING_STALE_AFTER_MS,
      gapsTotal: rest.gapsTotal,
    },
    automation,
    enrollment,
  });
  if (!positions.length) {
    return finish({ ...partial, failingStage: "monitoring data — no enrolled positions are reachable from this view", reasons: ["Monitoring store unreachable or empty; coverage cannot be verified."] }, "unavailable");
  }
  const reasons: string[] = [];
  // Last successful coverage = the OLDEST checkpoint among open positions:
  // recovery is only as strong as the least-covered open position. This
  // is the newest COMPLETE coverage — every open position is covered at
  // least through this bar.
  const openCoveredMs = open.map((row) => parseMs(row.lastCoveredBarCloseUtc));
  const missingCoverage = open.filter((_, i) => openCoveredMs[i] == null);
  const lastCoverageMs = openCoveredMs.every((v) => v != null) && openCoveredMs.length
    ? Math.min(...(openCoveredMs as number[]))
    : null;
  partial.lastSuccessfulCoverageUtc = lastCoverageMs != null ? new Date(lastCoverageMs).toISOString() : null;
  partial.coverageAgeMs = lastCoverageMs != null ? Math.max(0, nowMs - lastCoverageMs) : null;
  partial.gapsTotal = open.reduce((sum, row) => sum + (row.latestGapCount ?? 0), 0);
  // Recovered interval: the latest observations' windows for open positions.
  const windowFroms = open.map((row) => parseMs(row.latestWindowFromUtc)).filter((v): v is number => v != null);
  const windowTos = open.map((row) => parseMs(row.latestWindowToUtc)).filter((v): v is number => v != null);
  partial.recoveredWindowFromUtc = windowFroms.length ? new Date(Math.min(...windowFroms)).toISOString() : null;
  partial.recoveredWindowToUtc = windowTos.length ? new Date(Math.max(...windowTos)).toISOString() : null;
  partial.recoveredBars = open.length && open.every((row) => row.latestBarsFetched != null)
    ? Math.min(...open.map((row) => row.latestBarsFetched as number))
    : null;

  let failingStage: string | null = null;
  const isStale = partial.coverageAgeMs != null && partial.coverageAgeMs > MONITORING_STALE_AFTER_MS;
  if (missingCoverage.length) {
    failingStage = "venue monitor — coverage checkpoint missing";
    reasons.push(`${missingCoverage.length} open position(s) have no coverage checkpoint; their interval is unobserved.`);
  }
  if (partial.gapsTotal > 0) {
    failingStage = failingStage ?? "venue monitor — coverage gaps in the latest observation";
    reasons.push(`Latest observations report ${partial.gapsTotal} gap interval(s) across open positions; first-touch order is not established on a gapped interval.`);
  }
  if (isStale && lastCoverageMs != null) {
    failingStage = failingStage ?? "venue monitor — coverage stale";
    reasons.push(`Last successful coverage ${partial.lastSuccessfulCoverageUtc} is ${Math.round((partial.coverageAgeMs ?? 0) / 60_000)} minutes old — older than the 45-minute staleness bound for the 30-minute cadence; a previously successful pass does not stay verified, and the entry gate is closed until a newer complete pass lands.`);
  }
  if (monitorRun && monitorRun.failCount > 0) {
    failingStage = failingStage ?? "venue monitor — latest run had failed positions";
    reasons.push(`Latest monitor run ${monitorRun.runUtc ?? "untimestamped"} failed ${monitorRun.failCount} of ${monitorRun.total} positions; failed checkpoints were not advanced and the interval will be re-fetched.`);
  }
  // Settlement verification: a settle pass at/after the latest monitor run,
  // complete coverage for open positions, nothing held.
  const monitorMs = parseMs(monitorRun?.runUtc ?? null);
  const settleMs = parseMs(settleRun?.runUtc ?? null);
  const settlementVerified = Boolean(
    settleRun && settleMs != null && monitorMs != null && settleMs >= monitorMs
    && settleRun.heldCount === 0 && settleRun.openCoverageComplete,
  );
  partial.settlementVerifiedAfterCoverage = settlementVerified;
  if (!settlementVerified && failingStage === null) {
    failingStage = "settlement — no frozen-contract settlement pass has completed since the latest coverage";
    reasons.push(settleRun
      ? `Latest settlement pass ${settleRun.runUtc ?? "untimestamped"} predates or does not cover the latest monitor coverage (${monitorRun?.runUtc ?? "unknown"}), or held a position; settlement under the frozen contract is not yet confirmed for the recovered interval.`
      : "No settlement run log is reachable; settlement under the frozen contract cannot be confirmed.");
  }
  if (failingStage === null && lastCoverageMs == null) {
    failingStage = "venue monitor — coverage checkpoint missing";
    reasons.push("No open-position coverage checkpoint is available.");
  }
  const coverageVerified = failingStage === null && settlementVerified && !isStale;
  // Automation is a separate gate condition: coverage can be verified
  // while scheduled recovery is still pending, and entries stay held.
  if (automation.status === "pending") {
    reasons.push("Automation: Scheduled recovery pending — the directed recovery pass verified coverage, but no scheduled unattended lane run has yet completed monitor + settle + enroll cleanly and written the scheduled-recovery attestation; the entry gate stays closed until it does.");
  }
  if (enrollment.source === "last_good_file_fallback") {
    reasons.push(`Enrollment ran off the last good canonical file (canonical-entered.json ${enrollment.canonicalFileAgeAtEnrollS}s old at the enroll run), not a fresh pull; ${enrollment.discrepancyCount} position(s) could not be reconciled from that file and are disclosed in the enrollment section.`);
  } else if (enrollment.available && enrollment.discrepancyCount > 0) {
    reasons.push(`Enrollment: ${enrollment.discrepancyCount} position(s) could not be reconciled in the latest enroll run and are disclosed in the enrollment section — they were not silently skipped.`);
  }
  const entryOpen = coverageVerified && automation.status === "confirmed";
  const overallFailingStage = failingStage ?? (entryOpen ? null : "automation — scheduled recovery pending");
  // Coverage status is derived from coverage evidence alone; automation
  // never changes it. Stale (a degraded class) is named explicitly so a
  // previously successful pass is never read as verified forever.
  const coverageStatus: CoverageStatus = coverageVerified ? "verified" : isStale ? "stale" : "degraded";
  return finish({
    ...partial,
    status: entryOpen ? "verified" : "degraded",
    entryAdmission: entryOpen ? "open" : "held",
    settlementVerifiedAfterCoverage: settlementVerified,
    failingStage: overallFailingStage,
    reasons: entryOpen ? ["Continuous, gap-free coverage is fresh, a settlement pass under the frozen contract completed after it with nothing held, and scheduled recovery is confirmed by attestation."] : reasons,
  }, coverageStatus);
}
