export type CompleteIssuanceBundle = {
  issuanceState: string;
  legacySignalId: number | null;
  inputSnapshotId: number;
};

/**
 * The single production persistence coordinator used by live issuance and tests.
 * `atomicWrite` must be the platform batch (or an isolated adapter transaction).
 * The accepted row is always re-read after the write so concurrent retries and
 * competing snapshots deterministically receive the database-accepted bundle.
 */
export async function persistSignalIssuanceBundle<T extends CompleteIssuanceBundle>(input: {
  atomicWrite: () => Promise<void>;
  readAccepted: () => Promise<T | null>;
}): Promise<T> {
  const before = await input.readAccepted();
  if (before?.issuanceState === "complete" && before.legacySignalId !== null) return before;
  try {
    await input.atomicWrite();
  } catch (error) {
    const acceptedAfterConflict = await input.readAccepted();
    if (acceptedAfterConflict?.issuanceState === "complete" && acceptedAfterConflict.legacySignalId !== null) return acceptedAfterConflict;
    throw error;
  }
  const accepted = await input.readAccepted();
  if (!accepted || accepted.issuanceState !== "complete" || accepted.legacySignalId === null) {
    throw new Error("Atomic issuance did not expose a complete signal bundle; retry is safe.");
  }
  return accepted;
}
