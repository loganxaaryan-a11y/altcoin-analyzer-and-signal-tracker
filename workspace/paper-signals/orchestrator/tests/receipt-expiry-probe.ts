/**
 * Cross-language parity probe for ITEM 2 (receipt-expiry rule).
 *
 * Runs the REAL integrated issuance handler on a parameterized fixture: a
 * crypto candidate whose venue feed serves a print observed at
 * startMs + <observedOffsetMs> while the clock advances to
 * startMs + <receiptOffsetMs> DURING the await (the receipt instant).
 *
 * Usage: node receipt-expiry-probe.js <observedOffsetMs> <receiptOffsetMs> <accept:0|1>
 *   accept=1 wires clean post-entry + waiting-interval evidence so an
 *   in-window receipt can run the full path to "issued".
 *
 * Prints one JSON line on stdout:
 *   {"verdict": "fail"|"pass"|"unexpected",
 *    "reason_code": "abstain:entry-expired"|"issued"|"unexpected:...",
 *    "handler_status": ..., "contract_state": ..., "reason": ...}
 *
 * The verdict/reason_code use the comparison harness's taxonomy
 * (operational_issuance_eval in comparison/harness.py): a handler outcome
 * of "expired" with entryState "void_expired" maps to
 * ("fail", "abstain:entry-expired") -- the harness's code for the handler's
 * void_expired via _classify_suppression; status "issued" maps to
 * ("pass", "issued"). The Python agreement test
 * (comparison/tests/test_receipt_expiry_parity.py) runs this probe on the
 * same fixtures as the harness and asserts identical (verdict, reason_code);
 * any divergence is a test failure.
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

const T_CRYPTO = Date.parse("2026-10-14T04:00:00.000Z"); // handler run (matches the parity tests)

function pointPrint(ts: number, price: number, label: string): EvidenceBar {
  return {
    startAt: ts, endAt: ts,
    open: price, high: price, low: price, close: price,
    isClosed: true, granularity: "trade_print", source: "itg-fixture", label,
  };
}

async function main(): Promise<void> {
  const observedOffsetMs = Number(process.argv[2]);
  const receiptOffsetMs = Number(process.argv[3]);
  const accept = process.argv[4] === "1";
  if (!Number.isFinite(observedOffsetMs) || !Number.isFinite(receiptOffsetMs)) {
    console.log(JSON.stringify({ verdict: "unexpected", reason_code: "unexpected:bad-args" }));
    process.exit(2);
  }

  const store = new DbStore(":memory:");
  const clock = manualClock(T_CRYPTO);
  const deps: IntegratedDeps = {
    store,
    clock,
    config: { freshnessMs: 24 * 3_600_000 },
  };
  const input = integratedCryptoCandidate({
    symbol: "PROBE",
    vetoBars: [
      h1Bar("2026-10-14T01:00:00.000Z", { open: 99.5, high: 100.5, low: 96, close: 100 }, "post-decision 1h (clean)"),
    ],
  });

  const feedClock = new MutableClock(T_CRYPTO);
  const feed: VenueFeed = {
    latestPrints: async (_sinceTs: number) => {
      feedClock.advance(receiptOffsetMs);
      return [{ ts: T_CRYPTO + observedOffsetMs, price: 100.2, venue: "binance-spot", venueTradeId: "agg-8001", venueSeq: 8001 }];
    },
    // Complete history by construction (scripted venue): the receipt-expiry
    // parity under test is a receipt-time property, not a coverage gap.
    historyCoverage: async (_sinceTs: number) => ({ historyStartMs: Number.NEGATIVE_INFINITY }),
  };
  deps.entryFeedFor = (): EntryObservationFeed => ({
    feed, clock: feedClock, pollIntervalMs: 60_000, maxPolls: 5000,
    advance: (ms: number) => { feedClock.advance(ms); clock.advance(ms); },
  });

  if (accept) {
    deps.postEntryEvidenceFor = () => ({
      bars: [
        h1Bar(new Date(T_CRYPTO).toISOString(),
          { open: 100, high: 101, low: 97, close: 100.5 }, "post-entry 1h (clean)"),
        h1Bar(new Date(T_CRYPTO + 3_600_000).toISOString(),
          { open: 100.5, high: 102, low: 98, close: 101 }, "post-entry 1h (clean)"),
      ],
      nowAt: T_CRYPTO + 2 * 3_600_000,
    });
    deps.waitingIntervalEvidenceFor = () =>
      [pointPrint(T_CRYPTO + 10_000, 100.1, "waiting-interval point (clean)")];
  }

  const rec = await integratedManualIssue(deps, input, "invocation-parity-probe");
  const contractState = rec.contractId ? store.getContract(rec.contractId)?.state ?? null : null;
  store.close();

  // Map the handler outcome into the harness taxonomy (comparison/harness.py):
  // handler void_expired <-> harness REASON["entry-expired"] ("abstain:entry-expired").
  let verdict: string;
  let reason_code: string;
  if (rec.status === "entry-expired" && contractState === "void_expired") {
    verdict = "fail";
    reason_code = "abstain:entry-expired";
  } else if (rec.status === "issued") {
    verdict = "pass";
    reason_code = "issued";
  } else {
    verdict = "unexpected";
    reason_code = `unexpected:${rec.status}/${contractState}`;
  }
  console.log(JSON.stringify({
    verdict,
    reason_code,
    handler_status: rec.status,
    contract_state: contractState,
    reason: rec.outcome?.reason ?? null,
  }));
}

await main();
