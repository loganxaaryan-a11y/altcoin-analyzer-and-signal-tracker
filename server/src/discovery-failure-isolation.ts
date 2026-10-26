// Failure-recording isolation for the discovery catch block (fix-neutral,
// 2026-10-24 expert direction Q4).
//
// Guarantee: the failure RECORD survives a failed snapshot/bookkeeping
// write. The row-status update commits FIRST (the caller wraps it in
// retryOnce and captures on failure); snapshot bookkeeping runs SECOND and
// is best-effort. This isolation does NOT make the run succeed — a
// success-path failure still fails the run; only the record is guaranteed.
//
// GUARD: no discovery_state write (or any other snapshot/bookkeeping write)
// may precede the row-status commit in this sequence. The step order below
// is the enforcement point: `rowStatus` is always awaited before
// `snapshotBookkeeping` is invoked.

export type FailureRecordingStepResult = {
  rowStatusCommitted: boolean;
  snapshotOk: boolean;
};

export async function runFailureRecordingSequence(args: {
  rowStatus: () => Promise<void>;
  snapshotBookkeeping: () => Promise<void>;
  capture: (error: unknown, stage: "row-status" | "snapshot") => Promise<{ captured: boolean }>;
}): Promise<FailureRecordingStepResult> {
  let rowStatusCommitted = false;
  let snapshotOk = false;
  // FIRST: row-status commit. A failure here is captured, never swallowed
  // silently, and never blocks the best-effort bookkeeping below.
  try {
    await args.rowStatus();
    rowStatusCommitted = true;
  } catch (error) {
    await args.capture(error, "row-status");
  }
  // SECOND: snapshot bookkeeping, best-effort only. Its failure is captured
  // and swallowed — it can never mask or undo the row-status commit above.
  try {
    await args.snapshotBookkeeping();
    snapshotOk = true;
  } catch (error) {
    await args.capture(error, "snapshot");
  }
  return { rowStatusCommitted, snapshotOk };
}
