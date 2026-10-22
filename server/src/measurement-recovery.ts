export type GradingState = "evaluated" | "pending" | "ambiguous" | "unverified" | "excluded" | "failed";
export type TradeState = "open" | "settled" | "unknown";

export type FrozenMember = { signalId: string; ordinal: number };
export type ReconciliationItem = {
  signalId: string;
  membershipOrdinal: number | null;
  gradingState: GradingState;
  gradingReason: string;
  tradeState: TradeState;
  tradeStateReason: string;
};

export function selectMeasurementBatch(
  snapshotSignalIds: string[],
  cursor: number,
  batchSize: number,
  failedSignalIds: string[],
): { signalIds: string[]; startCursor: number; nextCursor: number; mode: "forward" | "retry" | "done" } {
  const boundedCursor = Math.max(0, Math.min(cursor, snapshotSignalIds.length));
  if (boundedCursor < snapshotSignalIds.length) {
    const signalIds = snapshotSignalIds.slice(boundedCursor, boundedCursor + batchSize);
    return {
      signalIds,
      startCursor: boundedCursor,
      nextCursor: Math.min(snapshotSignalIds.length, boundedCursor + signalIds.length),
      mode: "forward",
    };
  }
  const snapshotSet = new Set(snapshotSignalIds);
  const retryIds = [...new Set(failedSignalIds)].filter((id) => snapshotSet.has(id)).slice(0, batchSize);
  return {
    signalIds: retryIds,
    startCursor: boundedCursor,
    nextCursor: boundedCursor,
    mode: retryIds.length ? "retry" : "done",
  };
}

export function reconcileMeasurement(expectedMembers: FrozenMember[], items: ReconciliationItem[]) {
  const counts: Record<GradingState, number> = { evaluated: 0, pending: 0, ambiguous: 0, unverified: 0, excluded: 0, failed: 0 };
  const tradeCounts: Record<TradeState, number> = { open: 0, settled: 0, unknown: 0 };
  const expectedIds = new Set(expectedMembers.map((member) => member.signalId));
  const expectedOrdinals = new Map(expectedMembers.map((member) => [member.signalId, member.ordinal] as const));
  const seen = new Map<string, number>();
  const unexpectedIds: string[] = [];
  const ordinalViolations: string[] = [];
  for (const item of items) {
    counts[item.gradingState] += 1;
    tradeCounts[item.tradeState] += 1;
    seen.set(item.signalId, (seen.get(item.signalId) ?? 0) + 1);
    if (!expectedIds.has(item.signalId)) unexpectedIds.push(item.signalId);
    const expectedOrdinal = expectedOrdinals.get(item.signalId);
    if (expectedOrdinal !== undefined && item.membershipOrdinal !== expectedOrdinal) ordinalViolations.push(`${item.signalId}: expected ordinal ${expectedOrdinal}, found ${item.membershipOrdinal ?? "none"}`);
  }
  const duplicateIds = [...seen.entries()].filter(([, count]) => count > 1).map(([id]) => id).sort();
  const missingIds = expectedMembers.filter((member) => !seen.has(member.signalId)).map((member) => member.signalId);
  const unresolvedPending = counts.pending + counts.ambiguous + counts.unverified;
  const accounted = counts.evaluated + unresolvedPending + counts.failed + counts.excluded;
  const identityBalanced = missingIds.length === 0 && unexpectedIds.length === 0 && duplicateIds.length === 0 && ordinalViolations.length === 0;
  const expectedCount = expectedMembers.length;
  return {
    scope: expectedCount,
    expectedCount,
    accounted,
    balanced: identityBalanced && accounted === expectedCount && items.length === expectedCount,
    identityBalanced,
    missingIds,
    unexpectedIds: [...new Set(unexpectedIds)].sort(),
    duplicateIds,
    ordinalViolations,
    counts,
    unresolvedPending,
    tradeCounts,
    equation: `${expectedCount} frozen IDs = ${counts.evaluated} evaluated + ${unresolvedPending} pending/unresolved + ${counts.failed} failed + ${counts.excluded} excluded`,
  };
}

export function stableEvaluationFingerprint(value: unknown): string {
  const clean = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(clean);
    if (input && typeof input === "object") {
      return Object.fromEntries(Object.entries(input as Record<string, unknown>)
        .filter(([key]) => !["evaluationCutoff", "evaluatedAt", "retrievedAt", "fetchAt"].includes(key))
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, clean(child)]));
    }
    return input;
  };
  return JSON.stringify(clean(value));
}
