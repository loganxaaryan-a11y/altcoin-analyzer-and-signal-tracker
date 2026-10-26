import { describe, expect, test } from "bun:test";
import { evaluateHistoryCacheFreshness, stateAfterMetadataWriteFailure } from "./history-cache-freshness";

const NOW = Date.parse("2026-10-25T16:00:00.000Z");
const TODAY = new Date("2026-10-25T09:00:00.000Z");
const YESTERDAY = new Date("2026-10-24T09:00:00.000Z");

describe("history-cache metadata optionality — failure never reads as fresh", () => {
  test("a committed, error-free, today-refreshed state is fresh", () => {
    const verdict = evaluateHistoryCacheFreshness({ lastRefreshAt: TODAY, lastError: null, barCount: 365 }, NOW);
    expect(verdict.fresh).toBe(true);
  });

  test("a failed metadata write is never fresh — even when the prior row was refreshed today", () => {
    // The laundering case: an earlier refresh today committed cleanly, a
    // later forced refresh's metadata write fails. Reading the prior row
    // alone would claim "refreshed today, no error". The overlay must
    // refuse that claim.
    const degraded = stateAfterMetadataWriteFailure({ lastRefreshAt: TODAY, lastError: null, barCount: 365 }, null, "SQLiteError");
    const verdict = evaluateHistoryCacheFreshness(degraded, NOW);
    expect(verdict.fresh).toBe(false);
    if (!verdict.fresh) expect(verdict.state).toBe("metadata_write_failed");
    // lastRefreshAt is the PRIOR committed instant — never advanced to
    // the failed attempt.
    expect((degraded.lastRefreshAt as Date).toISOString()).toBe(TODAY.toISOString());
    expect(degraded.lastError).toContain("metadata write failed");
    expect(degraded.lastError).toContain("root cause of the original null-id failure remains OPEN");
  });

  test("a failed write with no prior row is unavailable, not fresh, and invents no timestamp", () => {
    const degraded = stateAfterMetadataWriteFailure(null, "CoinGecko free daily history: unavailable", "Error");
    expect(degraded.lastRefreshAt).toBeNull();
    expect(degraded.barCount).toBe(0);
    expect(degraded.lastError).toContain("CoinGecko free daily history: unavailable");
    const verdict = evaluateHistoryCacheFreshness(degraded, NOW);
    expect(verdict.fresh).toBe(false);
  });

  test("a recorded error degrades the state even with today's timestamp", () => {
    const verdict = evaluateHistoryCacheFreshness({ lastRefreshAt: TODAY, lastError: "Hyperliquid funding: history unavailable", barCount: 365 }, NOW);
    expect(verdict.fresh).toBe(false);
    if (!verdict.fresh) expect(verdict.state).toBe("error_recorded");
  });

  test("yesterday's committed refresh is stale; a current-run snapshot alone proves nothing", () => {
    const verdict = evaluateHistoryCacheFreshness({ lastRefreshAt: YESTERDAY, lastError: null, barCount: 365 }, NOW);
    expect(verdict.fresh).toBe(false);
    if (!verdict.fresh) expect(verdict.state).toBe("stale");
  });

  test("missing state and zero-bar state are unavailable, never fresh", () => {
    expect(evaluateHistoryCacheFreshness(null, NOW).fresh).toBe(false);
    expect(evaluateHistoryCacheFreshness({ lastRefreshAt: TODAY, lastError: null, barCount: 0 }, NOW).fresh).toBe(false);
  });
});
