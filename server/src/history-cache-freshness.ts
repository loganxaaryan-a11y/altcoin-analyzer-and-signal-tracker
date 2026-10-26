/**
 * History-cache metadata freshness — the optionality contract for the
 * isolated `history_cache_state` write (2026-10-25 verification).
 *
 * The cache has two layers with different criticality:
 *
 *   - DATA (historical_daily_bars / historical_metrics rows): committed
 *     independently, immutable, unique-keyed. A metadata-write failure
 *     cannot corrupt or falsify them; they stay readable with their own
 *     per-row `fetchedAt`.
 *   - METADATA (history_cache_state: lastRefreshAt, barCount, lastError):
 *     this row IS the freshness record. It is NOT optional for any
 *     freshness or eligibility claim. If its write fails, the refresh it
 *     described DID NOT COMMIT, and no caller may treat the cache as
 *     refreshed: lastRefreshAt must not advance, a prior clean lastError
 *     must not mask the failure, and incomplete work must not read as
 *     complete.
 *
 * This module is the single evaluator every freshness/eligibility read
 * of that metadata goes through. Its rules are fail-closed:
 *
 *   1. A state carrying `metadataWriteFailed` is NEVER fresh — even if
 *      its lastRefreshAt happens to be today (an earlier successful
 *      refresh the same day), because the LATEST refresh's provenance
 *      is unproven.
 *   2. A state with a recorded lastError is not fresh.
 *   3. A missing state row is unavailable, never fresh.
 *   4. Freshness requires lastRefreshAt on the current UTC day — the
 *      same cadence rule ensureHistoryCache itself uses to decide a
 *      refresh is owed. A snapshot belonging to the current run does
 *      not make its contents fresh; only the committed metadata row
 *      proves a refresh landed.
 *
 * When the state is not fresh, history-dependent eligibility must treat
 * the candidate's history inputs as UNAVAILABLE (the existing scoring
 * treatment for missing inputs) — never estimate them from stale bars
 * presented as current.
 */

export interface HistoryCacheStateLike {
  lastRefreshAt?: Date | string | number | null;
  lastError?: string | null;
  barCount?: number | null;
  /** Set in-memory by ensureHistoryCache when the isolated metadata
   * upsert failed during THIS call. Never persisted (the write failed);
   * exists precisely so the failure cannot be laundered into a clean
   * read of the prior committed row. */
  metadataWriteFailed?: boolean;
}

export type HistoryCacheFreshness =
  | { fresh: true; reason: string }
  | { fresh: false; state: "metadata_write_failed" | "error_recorded" | "unavailable" | "stale"; reason: string };

function refreshMs(state: HistoryCacheStateLike): number | null {
  const value = state.lastRefreshAt;
  if (value === null || value === undefined) return null;
  const ms = value instanceof Date ? value.getTime() : typeof value === "string" ? Date.parse(value) : value;
  return Number.isFinite(ms) ? ms : null;
}

function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function evaluateHistoryCacheFreshness(state: HistoryCacheStateLike | null | undefined, nowMs: number): HistoryCacheFreshness {
  if (!state) {
    return { fresh: false, state: "unavailable", reason: "No committed history_cache_state row exists; cache freshness is unproven and history inputs are unavailable." };
  }
  if (state.metadataWriteFailed) {
    return { fresh: false, state: "metadata_write_failed", reason: "The latest history_cache_state metadata write FAILED and was captured in write_failure_captures; the refresh did not commit, so the cache must not be read as fresh and any history-dependent eligibility stays unavailable until a later refresh commits its metadata." };
  }
  if (state.lastError) {
    return { fresh: false, state: "error_recorded", reason: `The committed cache state records an error (${state.lastError}); the cache is degraded, not fresh.` };
  }
  const refreshedMs = refreshMs(state);
  if (refreshedMs === null) {
    return { fresh: false, state: "unavailable", reason: "The committed cache state has no refresh timestamp; freshness is unproven." };
  }
  if (utcDay(refreshedMs) !== utcDay(nowMs)) {
    return { fresh: false, state: "stale", reason: `The committed cache state was last refreshed ${new Date(refreshedMs).toISOString()}, not today; a refresh is owed before freshness can be claimed.` };
  }
  if (!state.barCount) {
    return { fresh: false, state: "unavailable", reason: "The committed cache state records zero bars; there is no history to be fresh." };
  }
  return { fresh: true, reason: `Committed cache state refreshed ${new Date(refreshedMs).toISOString()} with no recorded error.` };
}

/**
 * The state a caller must see after an isolated metadata-write failure:
 * the PRIOR committed row (or null), with lastError overlaid so the
 * failure is visible, lastRefreshAt UNADVANCED, and the
 * metadataWriteFailed flag set. Synthesizing the attempted values here
 * instead would let stale inputs appear fresh — that is exactly what
 * this function refuses to do.
 */
export function stateAfterMetadataWriteFailure<T extends HistoryCacheStateLike>(
  priorState: T | null,
  refreshError: string | null,
  writeErrorKind: string,
): (T & { metadataWriteFailed: true }) | { metadataWriteFailed: true; lastRefreshAt: null; lastError: string; barCount: number } {
  const failureNote = `history_cache_state metadata write failed (${writeErrorKind}); full error captured in write_failure_captures — root cause of the original null-id failure remains OPEN (a query echo containing null for an autoincrement field does not establish it). The refresh did not commit its metadata; freshness is unproven and the next refresh retries the write.`;
  const lastError = [refreshError, failureNote].filter((part) => part && part.trim().length > 0).join(" · ");
  if (priorState) return { ...priorState, lastError, metadataWriteFailed: true as const };
  return { metadataWriteFailed: true as const, lastRefreshAt: null, lastError, barCount: 0 };
}
