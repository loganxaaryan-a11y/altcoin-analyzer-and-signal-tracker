/**
 * watcher.test.ts — entry-watcher tests (CORRECTION 4: cadence mismatch).
 * Run: compile with tsc, then `node dist/test/watcher.test.js`.
 *
 * Proves:
 *  (a) entry observed inside its window, with both alert delays recorded
 *  (b) window expires with no qualifying print -> contract void_expired
 *      (never filled from a later print)
 *  (c) late fetch of a past print -> labeled "reconstruction", rejected as
 *      an actionable entry
 *  plus: drift-void on the first out-of-band print, cadence enforcement
 *  (poll < window, structural), and check() idempotency on terminal states.
 */
import assert from "node:assert";
import { issueCryptoEntryContract } from "../src/entry-rules.js";
import { MutableClock, ScriptedFeed } from "../src/feed.js";
import {
  DEFAULT_POLL_INTERVAL_MS,
  EntryWatcher,
} from "../src/watcher.js";

let passed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`ok - ${name}`);
  } catch (e) {
    console.error(`FAIL - ${name}`);
    console.error(e);
    process.exitCode = 1;
  }
}

const D = (s: string) => Date.parse(s);
const T0 = D("2026-10-13T09:00:00.000Z"); // decisionAt; window [T0, T0+15min]

function cryptoContract() {
  return issueCryptoEntryContract({
    signalId: "CR-W1",
    strategyId: "crypto-dossier-factor-agreement",
    strategyVersion: "frozen-2026-10-12",
    parameterHash: "sha256:watcher",
    decisionAt: new Date(T0).toISOString(),
    decisionPrice: 100,
    decisionSourceObservedAt: new Date(T0 - 10_000).toISOString(),
    invalidationPrice: 98,
    target1Price: 101.5,
    target2Price: 103,
    riskPerUnit: 2,
    issuedBy: "watcher-test",
    issuedAt: new Date(T0 + 5_000).toISOString(),
  });
}

function print(ts: number, price: number, availableAt: number) {
  return { ts, price, venue: "binance-spot", availableAt };
}

// ---------------------------------------------------------------- (a) live entry

test("(a) entry observed inside its window, with both alert delays recorded", async () => {
  const clock = new MutableClock(T0 + 30_000);
  // Print at T0+3min, served by the feed at T0+3min+2s (2s feed latency).
  const feed = new ScriptedFeed(
    [print(T0 + 180_000, 100.2, T0 + 182_000)],
    clock,
  );
  const w = new EntryWatcher(cryptoContract(), feed, clock);

  w.markSetupAlertDelivered(T0 + 45_000); // setup alert 45s after the decision

  const r1 = await w.check();
  assert.equal(r1.status, "waiting", "print not yet observable at T0+30s");

  clock.advance(3.5 * 60_000); // T0+4min: the print is now observable
  const r2 = await w.check();
  assert.equal(r2.status, "entered");
  if (r2.status !== "entered") throw new Error("unreachable");
  assert.equal(r2.observation.entryPrice, 100.2);
  assert.equal(r2.observation.entryObservedAt, new Date(T0 + 180_000).toISOString(),
    "entryObservedAt is the VENUE timestamp of the print");
  assert.equal(r2.observation.entryReceivedAt, new Date(T0 + 240_000).toISOString(),
    "entryReceivedAt is the server time the watcher polled");
  assert.equal(r2.contract.entryEvidence, "venue-trade");

  // Entry alert delivered 5s after the watcher polled the print.
  const record = w.buildWatchRecord({ entryAlertDeliveredAtMs: T0 + 245_000 });
  assert.equal(record.setupAlertDelayMs, 45_000,
    "persisted: decisionAt -> setup-alert-delivered");
  assert.equal(record.entryAlertDelayMs, 245_000 - 180_000,
    "persisted: entry-observed (venue ts) -> entry-alert-delivered");
  assert.equal(record.entryObservedAt, new Date(T0 + 180_000).toISOString());
  assert.equal(record.outcome, "entered");
  assert.ok(record.polls >= 2);
});

// ---------------------------------------------------------------- (b) expiry

test("(b) window expires with no qualifying print -> void_expired, never filled later", async () => {
  const clock = new MutableClock(T0 + 60_000);
  // The only print arrives AFTER the window (ts T0+20min): it must never fill.
  const feed = new ScriptedFeed([print(T0 + 1_200_000, 100.2, T0 + 1_200_000)], clock);
  const w = new EntryWatcher(cryptoContract(), feed, clock);

  assert.equal((await w.check()).status, "waiting");
  clock.set(T0 + 16 * 60_000); // past the 15-minute window
  const r = await w.check();
  assert.equal(r.status, "expired");
  if (r.status !== "expired") throw new Error("unreachable");
  assert.equal(r.contract.entryState, "void_expired");
  assert.equal(r.contract.entryPrice, null, "a voided contract never carries a fill price");
  assert.match(r.contract.voidReason ?? "", /no qualifying print observed/);

  // A later poll must not resurrect the contract from the late print.
  clock.set(T0 + 21 * 60_000);
  const r2 = await w.check();
  assert.equal(r2.status, "expired", "idempotent: terminal states are final");
  if (r2.status !== "expired") throw new Error("unreachable");
  assert.equal(r2.contract.entryState, "void_expired");

  const record = w.buildWatchRecord();
  assert.equal(record.outcome, "expired_no_print");
  assert.equal(record.setupAlertDelayMs, null, "no setup-alert delivery recorded -> null, never fabricated");
  assert.equal(record.entryAlertDelayMs, null);
});

// ---------------------------------------------------------------- (c) reconstruction

test("(c) late fetch of a past print -> labeled reconstruction, rejected as actionable entry", async () => {
  const clock = new MutableClock(T0 + 16 * 60_000); // window already closed
  // In-window print (ts T0+5min) that the feed only served at T0+20min —
  // history the watcher never observed live.
  const latePrint = print(T0 + 300_000, 100.2, T0 + 1_200_000);
  const feed = new ScriptedFeed([latePrint], clock);
  const w = new EntryWatcher(cryptoContract(), feed, clock);

  const r = await w.check();
  assert.equal(r.status, "expired", "window closed: no live entry from a past print");
  if (r.status !== "expired") throw new Error("unreachable");
  assert.equal(r.contract.entryState, "void_expired");

  const rec = w.reconstruct([{ ts: latePrint.ts, price: latePrint.price, venue: latePrint.venue }]);
  assert.equal(rec.kind, "reconstruction");
  assert.equal(rec.actionable, false, "type-level: a reconstruction is NEVER an actionable entry");
  assert.equal(rec.prints.length, 1, "the in-window historical print is kept as a research record");
  assert.equal(rec.prints[0].ts, T0 + 300_000);
  assert.match(rec.reason, /historical reconstruction for research records, NEVER an actionable entry/);

  // The contract is still void_expired — reconstruct() never enters.
  assert.equal(w.currentContract.entryState, "void_expired");
  assert.equal(w.currentContract.entryPrice, null);

  const record = w.buildWatchRecord();
  assert.equal(record.outcome, "reconstruction");
  assert.ok(record.reconstruction !== null && record.reconstruction.kind === "reconstruction");
});

test("(c2) reconstruct() refuses while the window is still open", async () => {
  const clock = new MutableClock(T0 + 60_000);
  const w = new EntryWatcher(cryptoContract(), new ScriptedFeed([], clock), clock);
  assert.throws(
    () => w.reconstruct([{ ts: T0 + 30_000, price: 100.1, venue: "binance-spot" }]),
    /post-window late fetches only/,
    "a fetch inside the window is a live observation — use check()",
  );
});

// ---------------------------------------------------------------- drift

test("(d) first in-window print beyond the drift cap -> void_drift", async () => {
  const clock = new MutableClock(T0 + 4 * 60_000);
  // +2.0% drift vs the 1.5% crypto cap.
  const feed = new ScriptedFeed([print(T0 + 180_000, 102.0, T0 + 180_000)], clock);
  const w = new EntryWatcher(cryptoContract(), feed, clock);
  const r = await w.check();
  assert.equal(r.status, "drift_void");
  if (r.status !== "drift_void") throw new Error("unreachable");
  assert.equal(r.contract.entryState, "void_drift");
  assert.equal(r.contract.entryPrice, null, "anti-selection-bias: the drifted fill is voided, not kept");
  assert.ok((r.contract.driftObservedPct ?? 0) > 1.5);
});

// ---------------------------------------------------------------- cadence enforcement

test("(e) cadence must be strictly finer than the window: 30-min poll on a 15-min window throws", () => {
  const clock = new MutableClock(T0);
  const feed = new ScriptedFeed([], clock);
  assert.equal(DEFAULT_POLL_INTERVAL_MS, 60_000);
  assert.throws(
    () => new EntryWatcher(cryptoContract(), feed, clock, { pollIntervalMs: 30 * 60_000 }),
    /strictly finer than the entry window/,
    "a 30-minute tick cannot observe inside a 15-minute window — structural rejection",
  );
  // The default 60s cadence is fine on the 15-minute window.
  const w = new EntryWatcher(cryptoContract(), feed, clock);
  assert.equal(w.cadenceMs, 60_000);
});

// ---------------------------------------------------------------- idempotency

test("(f) check() is idempotent on terminal states", async () => {
  const clock = new MutableClock(T0 + 4 * 60_000);
  const feed = new ScriptedFeed([print(T0 + 180_000, 100.2, T0 + 180_000)], clock);
  const w = new EntryWatcher(cryptoContract(), feed, clock);
  const r1 = await w.check();
  assert.equal(r1.status, "entered");
  const r2 = await w.check();
  assert.equal(r2.status, "entered", "re-polling an entered contract re-reports, never re-enters");
  if (r2.status !== "entered") throw new Error("unreachable");
  assert.equal(r2.observation.entryObservedAt, new Date(T0 + 180_000).toISOString());
});

setTimeout(() => {
  console.log(`\n${passed} watcher tests passed`);
}, 0);
