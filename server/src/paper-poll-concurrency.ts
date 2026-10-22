export type PaperPollClaim = { ownerToken: string; generation: number };
export type PaperPollAcquire = { acquired: true; claim: PaperPollClaim } | { acquired: false; activeGeneration: number };

export type PaperPollLeaseStore<T> = {
  acquire: () => Promise<PaperPollAcquire>;
  claimFollowup: (claim: PaperPollClaim) => Promise<PaperPollClaim | null>;
  complete: (claim: PaperPollClaim, result: T) => Promise<boolean>;
  fail: (claim: PaperPollClaim, error: unknown) => Promise<void>;
};

export type BoundedPaperPollResult<T> =
  | { coalesced: true; activeGeneration: number }
  | { coalesced: false; passes: number; generation: number; result: T };

/**
 * Construction failure for a paper poll lease acquisition attempt. Raised by
 * buildPaperPollLeaseAttempt BEFORE any database write when the inputs the
 * acquire statement would carry are invalid (empty owner token, or a lease
 * expiry that is not a valid timestamp strictly in the future). This is an
 * input-construction defect class, distinct from database contention:
 * retrying the same malformed attempt cannot fix it. The `kind` field and
 * the message prefix make the failure identifiable as a construction
 * failure in action results and scheduler receipts.
 */
export const LEASE_CONSTRUCTION_INVALID_KIND = "lease_construction_invalid" as const;

export class PaperPollLeaseConstructionError extends Error {
  readonly kind = LEASE_CONSTRUCTION_INVALID_KIND;
  constructor(lane: string, detail: string) {
    super(`${LEASE_CONSTRUCTION_INVALID_KIND}: paper poll lease acquisition for lane "${lane}" aborted before any database write: ${detail}`);
    this.name = "PaperPollLeaseConstructionError";
  }
}

/**
 * Builds and validates the construction inputs of one lease acquisition
 * attempt: the owner token about to be written and the lease expiry
 * computed from the lane TTL. Pure and write-free: callers must invoke this
 * before ANY database write in the acquisition path, so an invalid attempt
 * can never reach a query (no guard insert, no acquire update) and the
 * lane's stored lease row is left exactly as it was.
 */
export function buildPaperPollLeaseAttempt(input: { lane: string; ownerToken: string; ttlMs: number; now: Date }): { ownerToken: string; leaseExpiresAt: Date } {
  const { lane, ownerToken, ttlMs, now } = input;
  if (typeof ownerToken !== "string" || ownerToken.length === 0) {
    throw new PaperPollLeaseConstructionError(lane, "owner token is empty or not a string");
  }
  if (typeof ttlMs !== "number" || !Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new PaperPollLeaseConstructionError(lane, `lane TTL is not a positive finite duration (got ${String(ttlMs)})`);
  }
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
    throw new PaperPollLeaseConstructionError(lane, "acquisition clock reading is not a valid timestamp");
  }
  const leaseExpiresAt = new Date(now.getTime() + ttlMs);
  if (!Number.isFinite(leaseExpiresAt.getTime()) || leaseExpiresAt.getTime() <= now.getTime()) {
    throw new PaperPollLeaseConstructionError(lane, "computed lease expiry is not a valid timestamp strictly in the future");
  }
  return { ownerToken, leaseExpiresAt };
}

/**
 * Runs at most maxPasses for one durable lane. Concurrent invocations only set
 * the lane's rerun bit; they never start another worker. A generation fence on
 * completion prevents an expired/stale worker from overwriting newer progress.
 */
export async function runBoundedCoalescedPoll<T>(
  store: PaperPollLeaseStore<T>,
  work: (pass: number) => Promise<T>,
  maxPasses = 2,
): Promise<BoundedPaperPollResult<T>> {
  if (!Number.isInteger(maxPasses) || maxPasses < 1) throw new Error("maxPasses must be a positive integer.");
  const acquired = await store.acquire();
  if (!acquired.acquired) return { coalesced: true, activeGeneration: acquired.activeGeneration };
  let claim = acquired.claim;
  let result: T | undefined;
  let passes = 0;
  try {
    while (passes < maxPasses) {
      passes += 1;
      result = await work(passes);
      const followup = await store.claimFollowup(claim);
      if (!followup) break;
      claim = followup;
    }
    if (result === undefined) throw new Error("Bounded paper poll completed without a result.");
    await store.complete(claim, result);
    return { coalesced: false, passes, generation: claim.generation, result };
  } catch (error) {
    await store.fail(claim, error);
    throw error;
  }
}
