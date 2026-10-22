/**
 * REGRESSION TEST (Task B.4, 2026-10-14): first-print fidelity across recovery.
 *
 * Scenario: the venue's FIRST post-decision print is missed (process dead /
 * observer absent) and only observed much later at resume time, when it is
 * older than the §6.5 observation-age bound (5 min) and therefore skipped as
 * historical reconstruction. A second, fresher print arrives in the same poll.
 *
 * Required behavior: the later print MUST NOT silently substitute for the
 * required first print. It must be rejected (contract voided — the missed
 * first print was never observed live) or explicitly re-baselined under a
 * NEW contract. Entering on the later print under the ORIGINAL contract's
 * "first-post-decision" entry rule is the regression.
 *
 * This runs the REAL integrated issuance handler on a parameterized fixture:
 * crypto candidate, manual clocks, venue feed serves
 *   print1 @ T0 + 10s  (the true first post-decision print; 7m50s stale at receipt)
 *   print2 @ T0 + 8min (fresh at receipt)
 * while the clock advances to T0 + 8min DURING the await (the receipt instant).
 *
 * Prints one JSON line on stdout:
 *   {"verdict": "pass"|"fail"|"unexpected", "reason": ..., "handler_status": ...,
 *    "contract_state": ..., "entry_observed_at": ...}
 *
 * verdict=pass  -> no silent substitution (voided or otherwise not entered).
 * verdict=fail  -> REGRESSION: entered on the later print under the original contract.
 */
import { manualClock } from "../src/clock.js";
import { DbStore } from "../src/persistence/db-store.js";
import {
  integratedManualIssue,
  type EntryObservationFeed,
  type IntegratedDeps,
} from "../src/issuance/handler.js";
import { MutableClock } from "../../entry-v1/src/feed.js";
import type { VenueFeed } from "../../entry-v1/src/feed.js";
import { h1Bar, integratedCryptoCandidate } from "./fixtures.js";
import type { EvidenceBar } from "../../veto/src/veto.js";

const T0 = Date.parse("2026-10-14T04:00:00.000Z"); // decision/handler run
const PRINT1_TS = T0 + 10_000; // true first post-decision print (missed)
const RECEIPT_TS = T0 + 8 * 60_000; // resume-time receipt (8 min later)
const PRINT2_TS = RECEIPT_TS; // later, fresh print served in the same poll

function pointPrint(ts: number, price: number, label: string): EvidenceBar {
  return {
    startAt: ts, endAt: ts,
    open: price, high: price, low: price, close: price,
    isClosed: true, granularity: "trade_print", source: "itg-fixture", label,
  };
}

async function main(): Promise<void> {
  const store = new DbStore(":memory:");
  const clock = manualClock(T0);
  const deps: IntegratedDeps = {
    store,
    clock,
    config: { freshnessMs: 24 * 3_600_000 },
  };
  const input = integratedCryptoCandidate({
    symbol: "REG1",
    vetoBars: [
      h1Bar("2026-10-14T01:00:00.000Z", { open: 99.5, high: 100.5, low: 96, close: 100 }, "post-decision 1h (clean)"),
    ],
  });

  const feedClock = new MutableClock(T0);
  const feed: VenueFeed = {
    latestPrints: async (_sinceTs: number) => {
      // Recovery poll: the observer was absent for 8 min. The venue now
      // serves the full print history since decision — print1 (the missed
      // first print, now 7m50s old) and print2 (fresh).
      feedClock.advance(RECEIPT_TS - T0);
      return [
        { ts: PRINT1_TS, price: 100.05, venue: "binance-spot", venueTradeId: "agg-8001", venueSeq: 8001 },
        { ts: PRINT2_TS, price: 100.20, venue: "binance-spot", venueTradeId: "agg-8002", venueSeq: 8002 },
      ];
    },
  };
  deps.entryFeedFor = (): EntryObservationFeed => ({
    feed, clock: feedClock, pollIntervalMs: 60_000, maxPolls: 5000,
    advance: (ms: number) => { feedClock.advance(ms); clock.advance(ms); },
  });

  // Wire clean post-entry + waiting-interval evidence so an in-window entry
  // (right or wrong) runs the full path — we must see the actual entry.
  deps.postEntryEvidenceFor = () => ({
    bars: [
      h1Bar(new Date(T0).toISOString(),
        { open: 100, high: 101, low: 97, close: 100.5 }, "post-entry 1h (clean)"),
      h1Bar(new Date(T0 + 3_600_000).toISOString(),
        { open: 100.5, high: 102, low: 98, close: 101 }, "post-entry 1h (clean)"),
    ],
    nowAt: T0 + 2 * 3_600_000,
  });
  deps.waitingIntervalEvidenceFor = () =>
    [pointPrint(T0 + 10_000, 100.1, "waiting-interval point (clean)")];

  const rec = await integratedManualIssue(deps, input, "first-print-substitution-regression");
  const contractRow = rec.contractId ? store.getContract(rec.contractId) : null;
  const contractState = contractRow?.state ?? null;
  store.close();

  let entryObservedAt: string | null = null;
  let entryPrice: number | null = null;
  if (contractRow) {
    try {
      const cj = JSON.parse(contractRow.contractJson as string);
      entryObservedAt = cj.entryObservedAt ?? null;
      entryPrice = cj.entryPrice ?? null;
    } catch { /* keep null */ }
  }

  const substitutedLaterPrint =
    rec.status === "issued" &&
    entryObservedAt !== null &&
    Date.parse(entryObservedAt) === PRINT2_TS;

  let verdict: string;
  let reason: string;
  if (substitutedLaterPrint) {
    verdict = "fail";
    reason = "REGRESSION: handler entered on the LATER print (print2, T0+8min) under the " +
      `original first-print contract after skipping the missed true first print (print1, T0+10s, ` +
      `7m50s stale). Later print silently substituted for the required first print.`;
  } else if (rec.status === "issued") {
    verdict = "unexpected";
    reason = `issued but entryObservedAt (${entryObservedAt}) is neither print1 nor print2`;
  } else {
    verdict = "pass";
    reason = `no silent substitution: handler status=${rec.status}, contract_state=${contractState}. ` +
      `The missed first print was not silently replaced by the later print.`;
  }

  console.log(JSON.stringify({
    verdict,
    reason,
    handler_status: rec.status,
    contract_state: contractState,
    entry_observed_at: entryObservedAt,
    entry_price: entryPrice,
    print1_ts: new Date(PRINT1_TS).toISOString(),
    print2_ts: new Date(PRINT2_TS).toISOString(),
    outcome_reason: rec.outcome?.reason ?? null,
  }));
}

await main();
