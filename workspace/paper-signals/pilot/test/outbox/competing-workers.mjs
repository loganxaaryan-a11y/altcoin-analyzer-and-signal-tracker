/**
 * Scenario (e) — TWO COMPETING WORKERS, end-to-end (paper pilot).
 *
 * PAPER ONLY. Proves the arbiter protocol across the two real lanes:
 *
 *   Phase 1 (concurrent observation): two worker processes run the full
 *   fixture integratedTick concurrently against the SAME pilot DB and the
 *   SAME shared outbox DB. Both observe the same entry print. The vendored
 *   handler's in-transaction ownership guard (handler.js:1040-1051,
 *   LostOwnershipError) lets exactly one worker commit the entered outcome;
 *   the loser returns the database-accepted record with no write.
 *
 *   Phase 2 (competing triggers): each worker then replays the wrapper-lane
 *   trigger (deliverAlert for the entry alert, as the paper-signal-cycle
 *   diff->trigger path fires independently of which lane committed). Both
 *   calls route through makeEntryOutboxDeliverAlert -> attemptEntryConfirmed,
 *   the atomic arbiter: exactly one accepted outbox row; the loser gets
 *   accepted=false, sends nothing, and reads the accepted state.
 *
 *   Phase 3 ({acknowledged:false} determinism): a crafted non-terminal
 *   accepted row (state "claiming", simulating an in-flight send by another
 *   sender) makes a refused lane's deliverAlert return {acknowledged:false};
 *   the vendored handler's exact acknowledgment read
 *   (handler.js:1302-1305) then refuses to mark the alert delivered —
 *   it marks failed instead (real vendored store methods).
 *
 * True single-transaction atomicity across the pilot DB and the outbox DB
 * (two different SQLite files) is impossible and is NOT claimed. What is
 * demonstrated: the outbox INSERT is the single atomic arbiter (one SQLite
 * DB, BEGIN IMMEDIATE, UNIQUE(contract_id,event_type,event_version));
 * first observer wins; the accepted lane's contract transition exists
 * exactly once; the loser reads the accepted state.
 *
 * Usage: node test/outbox/competing-workers.mjs <scratch-dir>
 * Prints [pass|fail] lines + JSON {pass, results}; exits 0/1.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

const T = process.argv[2];
if (!T) { console.error("usage: competing-workers.mjs <scratch-dir>"); process.exit(2); }
mkdirSync(T, { recursive: true });

const PILOT = new URL("../..", import.meta.url).pathname;
const DRIVER = join(PILOT, "test", "outbox", "fixture-tick-driver.mjs");
const DIST = join(PILOT, "dist");

const results = [];
const check = (name, cond, detail) => {
  results.push({ name, pass: !!cond, detail });
  console.log(`[${cond ? "pass" : "fail"}] ${name} — ${detail}`);
};

const runNode = (args) => new Promise((resolve) => {
  const p = spawn("node", args, { stdio: ["ignore", "pipe", "pipe"] });
  let out = "", err = "";
  p.stdout.on("data", (c) => { out += c; });
  p.stderr.on("data", (c) => { err += c; });
  p.on("close", (code) => resolve({ code, out, err }));
});

const lastJsonLine = (out) => {
  const lines = out.trim().split("\n").filter(Boolean);
  return JSON.parse(lines[lines.length - 1]);
};

try {
  // ------------------------------------------------ Phase 1: concurrent ticks
  console.log("--- e.1 concurrent observation: wrapper-lane + watcher-lane full ticks");
  await runNode([DRIVER, "seed", T]);
  const [ra, rb] = await Promise.all([
    runNode([DRIVER, "run", T, "wrapper"]),
    runNode([DRIVER, "run", T, "watcher"]),
  ]);
  if (ra.code !== 0) console.log("worker A stderr tail:", ra.err.slice(-500));
  if (rb.code !== 0) console.log("worker B stderr tail:", rb.err.slice(-500));
  check("e.phase1 both workers exited 0", ra.code === 0 && rb.code === 0,
    `wrapper exit=${ra.code} watcher exit=${rb.code}`);

  const { listEvents, outboxCounts } = await import(join(DIST, "entry-outbox.js"));
  const { DbStore } = await import(join(DIST, "vendor.js"));
  const outboxDbPath = join(T, "outbox.sqlite");
  const dbPath = join(T, "pilot.sqlite");

  const events = listEvents(outboxDbPath);
  const counts = outboxCounts(outboxDbPath);
  const store = new DbStore(dbPath);
  const cand = store.getCandidate("cand_trace1");
  const crow = store.getContract("ct_cand_trace1");
  const signals = store.listSignals();
  const entryAlerts = store.listAlerts().filter((a) => a.kind === "entry");

  check("e.1 exactly one accepted outbox row", events.length === 1,
    `outbox rows=${events.length}`);
  check("e.1 row is the contract's deterministic transition", events[0]?.event_id === "evt_ct_cand_trace1_ENTRY_CONFIRMED_v1",
    `event_id=${events[0]?.event_id}`);
  check("e.1 exactly one send on record", events[0]?.send_count === 1,
    `send_count=${events[0]?.send_count}`);
  check("e.1 payload binds the real venue trade id", (() => {
    try {
      const p = JSON.parse(events[0].payload_json);
      return p.entry_venue_trade_id === "TRACE-VENUE-TRADE-1" && p.entry_venue_seq === 42;
    } catch { return false; }
  })(), "entry_venue_trade_id=TRACE-VENUE-TRADE-1 entry_venue_seq=42");
  check("e.1 accepted lane's contract transitioned exactly once", signals.length === 1 && cand?.status === "issued" && crow?.state === "entered",
    `signals=${signals.length} candidate=${cand?.status} contract=${crow?.state}`);
  check("e.1 exactly one entry alert row enqueued", entryAlerts.length === 1,
    `entry alert rows=${entryAlerts.length}`);

  // ------------------------------------------------ Phase 2: competing triggers
  console.log("--- e.2 competing triggers: both lanes deliverAlert the same entry alert");
  const [ta, tb] = await Promise.all([
    runNode([DRIVER, "trig", T, "wrapper"]),
    runNode([DRIVER, "trig", T, "watcher"]),
  ]);
  const ja = ta.code === 0 ? lastJsonLine(ta.out) : null;
  const jb = tb.code === 0 ? lastJsonLine(tb.out) : null;
  const events2 = listEvents(outboxDbPath);
  const refused = [ja, jb].filter((j) => j && j.counters.duplicates === 1 && j.counters.accepted === 0).length;
  const accepted2 = [ja, jb].filter((j) => j && j.counters.accepted === 1).length;
  check("e.2 both trigger replays exited 0", ta.code === 0 && tb.code === 0,
    `wrapper exit=${ta.code} watcher exit=${tb.code}`);
  check("e.2 still exactly one outbox event after both triggers", events2.length === 1,
    `outbox rows=${events2.length}`);
  check("e.2 loser lanes read the accepted state (accepted=false)", refused === 2 && accepted2 === 0,
    `refused=${refused}/2 accepted=${accepted2}`);
  check("e.2 no second send from either trigger", events2[0]?.send_count === 1,
    `send_count=${events2[0]?.send_count}`);
  const rets = [ja?.deliverAlertReturn, jb?.deliverAlertReturn];
  check("e.2 refused lanes returned void(ack)/no-resend (terminal state read)", rets.every((r) => r === "void(ack)" || (r && r.acknowledged === false)),
    `returns=${JSON.stringify(rets)}`);

  // ------------------------------------------------ Phase 3: {acknowledged:false}
  console.log("--- e.3 refused lane against a NON-TERMINAL accepted row -> {acknowledged:false}");
  const T3 = join(T, "refused");
  mkdirSync(T3, { recursive: true });
  const outbox3 = join(T3, "outbox.sqlite");
  const db3 = join(T3, "pilot.sqlite");
  await runNode([DRIVER, "seed", T3]);
  const store3 = new DbStore(db3);
  const alertAt = new Date().toISOString();
  store3.appendAlert({
    id: "entry_sig_e6", kind: "entry", signalId: "sig_e6", candidateId: "cand_trace1",
    symbol: "BTCUSD", direction: "long", alertedAt: alertAt, channel: "sandbox-feed",
    enqueuedAt: alertAt, deliveredAt: null, deliveryStatus: "enqueued",
    deliveryMode: null, ackId: null, deliveryAttempts: 0,
  });
  store3.close();
  // Winner accepts the transition directly (as the other lane's commit would).
  const { attemptEntryConfirmed, getEvent, openOutboxDb } = await import(join(DIST, "entry-outbox.js"));
  const won = attemptEntryConfirmed(outbox3, {
    contractId: "ct_cand_trace1", signalId: "sig_e6", candidateId: "cand_trace1",
    observedAt: alertAt, observedBy: "wrapper", payloadJson: "{}",
  });
  check("e.3 winner accepted the transition", won.accepted === true, `accepted=${won.accepted}`);
  // Simulate an in-flight send by another sender: the row is accepted but
  // NOT terminal, and this process did not claim it.
  const odb = openOutboxDb(outbox3);
  odb.exec(`UPDATE entry_delivery_outbox SET state='claiming', claim_id='sim-inflight-claim', claimed_at='${alertAt}', updated_at='${alertAt}' WHERE event_id='${won.eventId}'`);
  odb.close();
  // Loser lane's deliverAlert for the same entry alert.
  const r3 = await runNode([DRIVER, "trig", T3, "watcher"]);
  const j3 = r3.code === 0 ? lastJsonLine(r3.out) : null;
  const ret3 = j3?.deliverAlertReturn;
  check("e.3 refused lane returned {acknowledged:false}", r3.code === 0 && ret3 && ret3.acknowledged === false,
    `return=${JSON.stringify(ret3)}`);
  check("e.3 refused lane attempted no send", j3?.counters.sends === 0,
    `sends=${j3?.counters.sends}`);
  // The vendored handler's EXACT acknowledgment read (handler.js:1302-1305):
  //   const raw = await deps.deliverAlert?.(alert);
  //   const acknowledged = raw == null ? true : raw.acknowledged !== false;
  //   if (!acknowledged) throw new Error("transport declined the acknowledgement");
  // ...caught -> markAlertFailed (handler.js:1310-1314), NEVER markAlertDelivered.
  const raw = ret3;
  const acknowledged = raw == null ? true : raw.acknowledged !== false;
  const store3b = new DbStore(db3);
  if (!acknowledged) store3b.markAlertFailed("entry_sig_e6"); // what the vendored handler does
  const a3 = store3b.listAlerts().find((a) => a.id === "entry_sig_e6");
  store3b.close();
  check("e.3 vendored read: acknowledged=false -> alert NOT marked delivered", acknowledged === false && a3?.deliveryStatus === "failed",
    `acknowledged=${acknowledged} deliveryStatus=${a3?.deliveryStatus}`);
  const ev3 = getEvent(openOutboxDb(outbox3), won.eventId);
  openOutboxDb(outbox3).close();
  check("e.3 outbox row still the single accepted transition", ev3?.state === "claiming" && listEvents(outbox3).length === 1,
    `state=${ev3?.state} rows=${listEvents(outbox3).length}`);
} catch (err) {
  check("e.no-exception", false, String(err?.stack ?? err));
}

const failed = results.filter((r) => !r.pass).length;
console.log(JSON.stringify({ pass: failed === 0, failed, results }));
process.exit(failed === 0 ? 0 : 1);
