// Research-shortlist snapshot persistence with write-failure capture
// (fix-neutral, 2026-10-25: close the null-id capture coverage gap in the
// research_shortlist lane, expert direction Q4 follow-up).
//
// getResearchShortlist computes the ranking in memory, then appends one
// snapshot row and rewrites that row's payload with the assigned
// snapshotId embedded. Previously a failure of either write only appended
// a note and left snapshotId null — no write_failure_captures row, so the
// failure was invisible to the diagnostic capture lane.
//
// Guarantee: the failure is captured verbatim (the caller's
// recordWriteFailure — message + stack + cause chain, never compactError)
// while the ranking flow is unchanged: the computed ranking is returned
// unsaved with the caller's existing note. The capture itself is isolated
// inside recordWriteFailure (single insert, own try/catch, returns
// { captured: false } on failure, never throws), so a capture failure can
// never mask the ranking computation or change the note.
//
// GUARD: the insert is always awaited before the payload update, and the
// update only runs with the id the insert returned. A null id (insert
// returned no row) is the pre-existing no-op path: no update, no capture,
// no note.

export type ShortlistSnapshotPersistResult = {
  snapshotId: number | null;
  stored: boolean;
  error: unknown;
};

export async function persistResearchShortlistSnapshot(args: {
  insertSnapshot: () => Promise<number | null>;
  updatePayload: (snapshotId: number) => Promise<void>;
  capture: (error: unknown, statementKind: "insert" | "update", snapshotId: number | null) => Promise<{ captured: boolean }>;
}): Promise<ShortlistSnapshotPersistResult> {
  let snapshotId: number | null;
  try {
    snapshotId = await args.insertSnapshot();
  } catch (error) {
    await args.capture(error, "insert", null);
    return { snapshotId: null, stored: false, error };
  }
  if (snapshotId === null) return { snapshotId: null, stored: true, error: null };
  try {
    await args.updatePayload(snapshotId);
  } catch (error) {
    await args.capture(error, "update", snapshotId);
    return { snapshotId, stored: false, error };
  }
  return { snapshotId, stored: true, error: null };
}
