/**
 * Hook-integration test (paper pilot).
 *
 * PAPER ONLY. Proves the vendored deliverAlert hook wiring: two buildDeps
 * instances — one tagged observedBy="wrapper" (issuance lane), one tagged
 * observedBy="watcher" (watch-only lane) — both pointing at the SAME pilot
 * DB and the SAME shared outbox DB. Each fires deliverAlert for the same
 * entry alert (as the vendored handler would after observing the entry).
 *
 * Expected: exactly one accepted transition, exactly one outbox event,
 * exactly one send; the second lane gets a duplicate refusal and sends
 * nothing.
 *
 * Usage: node test/outbox/hook-integration.mjs <scratch-dir>
 * Prints JSON {pass, details} and exits 0/1.
 */
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildDeps, storeOf } from "../../dist/deps.js";
import { EvidenceLog } from "../../dist/evidence.js";
import { outboxCounts, listEvents } from "../../dist/entry-outbox.js";

const T = process.argv[2];
if (!T) { console.error("usage: hook-integration.mjs <scratch-dir>"); process.exit(2); }
mkdirSync(T, { recursive: true });

const dbPath = join(T, "pilot.sqlite");
const outboxDbPath = join(T, "outbox.sqlite");
const sendsLog = join(T, "sends.jsonl");
const evidenceDir = join(T, "evidence");
mkdirSync(evidenceDir, { recursive: true });

const cfg = {
  symbol: "BTCUSD", direction: "long", score: 0.62,
  invalidationPctBelowEntry: 0.015, target1PctAboveEntry: 0.02, target2PctAboveEntry: 0.04,
  entryPollIntervalMs: 20000, entryMaxPolls: 40, retryBackoffMs: 60000,
  freshnessMs: 1800000, dbPath, evidenceDir,
};

const results = [];
const check = (name, cond, detail) => {
  results.push({ name, pass: !!cond, detail });
  console.log(`[${cond ? "pass" : "fail"}] ${name} — ${detail}`);
};

try {
  const countersW = { accepted: 0, duplicates: 0, sends: 0 };
  const countersH = { accepted: 0, duplicates: 0, sends: 0 };
  // Two lane builds, same DBs — this is the "both paths" configuration.
  const depsW = buildDeps(cfg, {
    preObserveHoldMs: 0, httpLogPath: join(T, "http-w.jsonl"), outboxDir: join(T, "ob-w"),
    observedBy: "wrapper", outboxDbPath, promptSendLogPath: sendsLog, counters: countersW,
  }, new EvidenceLog(join(evidenceDir, "w.jsonl")));
  const depsH = buildDeps(cfg, {
    preObserveHoldMs: 0, httpLogPath: join(T, "http-h.jsonl"), outboxDir: join(T, "ob-h"),
    observedBy: "watcher", outboxDbPath, promptSendLogPath: sendsLog, counters: countersH,
  }, new EvidenceLog(join(evidenceDir, "h.jsonl")));

  // Seed one issued candidate with a contract, as the vendored handler would
  // have persisted it after observing the entry — including the v2.1.9
  // first-print identity (real venue trade id + venue seq) on the contract
  // row's observationCheckpoint, which the outbox payload must carry.
  const store = storeOf(depsW);
  store.saveCandidate({
    candidateId: "cand_hook1", status: "issued", terminal: "crypto",
    symbol: "BTCUSD", direction: "long", contractId: "ct_hook1",
    entryObservedAt: "2026-10-15T00:01:00.000Z", firstSeenAt: "2026-10-15T00:00:00.000Z",
  });
  store.saveContract({
    contractId: "ct_hook1", candidateId: "cand_hook1", signalId: "sig_hook1",
    state: "entered",
    contractJson: JSON.stringify({
      entryState: "entered",
      observationCheckpoint: {
        v: 1,
        firstPrint: {
          venueTradeId: "HOOK-VENUE-TRADE-1", ts: 1760486460000, price: 100.05,
          venue: "binance-spot", venueSeq: 7,
        },
      },
    }),
    updatedAt: "2026-10-15T00:01:05.000Z",
  });

  const alert = {
    id: "entry_sig_hook1", kind: "entry", signalId: "sig_hook1",
    candidateId: "cand_hook1", symbol: "BTCUSD", direction: "long",
    alertedAt: "2026-10-15T00:01:00.000Z", channel: "sandbox-feed",
    enqueuedAt: "2026-10-15T00:01:00.000Z", deliveredAt: null, deliveryStatus: "enqueued",
  };

  // Lane 1 (wrapper) observes first: accepts + sends.
  const r1 = await depsW.deliverAlert(alert);
  // Lane 2 (watcher) observes the same entry: duplicate refusal, no send.
  const r2 = await depsH.deliverAlert(alert);

  const sendsLines = readFileSync(sendsLog, "utf8").trim().split("\n").filter(Boolean).length;
  const counts = outboxCounts(outboxDbPath);
  const events = listEvents(outboxDbPath);

  check("d.hook both lanes share one outbox", counts.events === 1, `outbox rows=${counts.events}`);
  check("d.hook wrapper accepted, watcher refused", countersW.accepted === 1 && countersH.duplicates === 1 && countersH.accepted === 0,
    `wrapper accepted=${countersW.accepted} watcher accepted=${countersH.accepted} watcher duplicates=${countersH.duplicates}`);
  check("d.hook exactly one send", sendsLines === 1 && countersW.sends === 1, `sends-log lines=${sendsLines} wrapper sends=${countersW.sends}`);
  check("d.hook event terminal, labeled simulated", events[0]?.state === "delivered_simulated", `state=${events[0]?.state}`);
  check("d.hook payload carries idempotency key", (() => { try { return JSON.parse(readFileSync(sendsLog, "utf8").trim().split("\n")[0]).idempotency_key === "ct_hook1/ENTRY_CONFIRMED/v1"; } catch { return false; } })(),
    "idempotency_key=ct_hook1/ENTRY_CONFIRMED/v1");
  // (finding 1d) the payload must carry the REAL venue trade id + venue seq
  // off the contract row's first-print identity — never a synthesized id.
  check("d.hook payload carries venue trade id + seq", (() => {
    try {
      const p = JSON.parse(readFileSync(sendsLog, "utf8").trim().split("\n")[0]).payload;
      return p.entry_venue_trade_id === "HOOK-VENUE-TRADE-1" && p.entry_venue_seq === 7;
    } catch { return false; }
  })(), "entry_venue_trade_id=HOOK-VENUE-TRADE-1 entry_venue_seq=7");
  check("d.hook second lane acknowledged without resend", r2 === undefined, `watcher deliverAlert returned ${r2 === undefined ? "void (ack)" : JSON.stringify(r2)}`);

  storeOf(depsW).close();
  storeOf(depsH).close();
} catch (err) {
  check("d.hook no exception", false, String(err?.stack ?? err));
}

const failed = results.filter((r) => !r.pass).length;
console.log(JSON.stringify({ pass: failed === 0, failed, results }));
process.exit(failed === 0 ? 0 : 1);
