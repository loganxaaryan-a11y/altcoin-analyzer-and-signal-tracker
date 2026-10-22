// waiting-interval.test.ts — GAP-4 veto timestamp-alignment repair (WORK ITEM, sandbox).
//
// Run:  npm run build && node --test build/tests/waiting-interval.test.js
// (the module under test uses "./veto.js" specifiers so the sibling agent's
// tsc-built handler can import it; Node type-stripping cannot resolve those,
// hence the compile step — the older veto tests keep their direct
// `node --test tests/*.test.ts` form.)
//
// Proves:
//   1. the waiting-interval contract: entryAt < decisionAt throws (integrity);
//      empty + allowEmptyInterval -> pass "no bars by construction"; empty
//      without it -> uncertain "no waiting-interval evidence" (fail-closed)
//   2. pre-decision extremes are setup-history FEATURES, never stop-outs
//      (recorded in preDecisionFeatures AND as a separate setup_history check)
//   3. runQualificationChecks: setup-history filter + entry-zone +
//      pipeline-order, NO decision→entry invalidation
//   4. DEMO: timestamped verdict timelines for
//        (i)  CONFIRMED breach during the waiting interval -> fail at the
//             breach, and REMAINS fail after the price recovers before entry
//             (a touch is a touch — recovery does not un-invalidate)
//        (ii) PROVISIONAL breach evidence (coarse bar suggests a cross) ->
//             uncertain at that point, then finer evidence exonerates -> pass
//      Each timeline prints the veto's EXACT verdict + reason per timestamp.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkWaitingInterval,
  checkSetupHistory,
  runQualificationChecks,
} from "../src/waiting-interval.js";
import type { WaitingIntervalInput } from "../src/waiting-interval.js";
import type { Direction, EvidenceBar, IssuanceVetoInput } from "../src/veto.js";

// ---------------- shared fixtures ----------------

const D = (s: string) => Date.parse(s);
const FINAL_STOP = 98; // final published stop (post-buildAtrLevels)
const DIRECTION: Direction = "long";

const PRE_DECISION_AT = D("2026-10-13T09:00:00.000Z"); // draft/detectedAt
const DECISION_AT = D("2026-10-13T09:05:00.000Z");     // contract.decisionAt (handler-start, authoritative)

// Pre-decision session bar whose low CROSSED the final stop — setup history,
// must never veto.
const yesterdayBar: EvidenceBar = {
  startAt: D("2026-10-12T00:00:00.000Z"), endAt: D("2026-10-13T00:00:00.000Z"),
  open: 96, high: 104, low: 95, close: 99, isClosed: true,
  granularity: "session", source: "CoinGecko OHLC", label: "2026-10-12 UTC session (pre-decision)",
};

// Signal-day so-far bar, also pre-decision, also crossed.
const signalDaySoFar: EvidenceBar = {
  startAt: D("2026-10-13T00:00:00.000Z"), endAt: D("2026-10-13T09:00:00.000Z"),
  open: 99, high: 101, low: 97.2, close: 100.1, isClosed: true,
  granularity: "intraday", source: "CoinGecko OHLC", label: "signal-day 00:00-09:00Z (pre-decision)",
};

function m5(start: string, low: number, high: number, label: string): EvidenceBar {
  const s = D(start);
  return {
    startAt: s, endAt: s + 5 * 60_000,
    open: low + 0.4, high, low, close: high - 0.2, isClosed: true,
    granularity: "intraday", source: "venue klines", label,
  };
}

function baseInput(over: Partial<WaitingIntervalInput> = {}): WaitingIntervalInput {
  return {
    direction: DIRECTION,
    finalStop: FINAL_STOP,
    decisionAt: DECISION_AT,
    entryAt: DECISION_AT,
    preDecisionAt: PRE_DECISION_AT,
    finestGranularity: "intraday",
    bars: [],
    allowEmptyInterval: false,
    ...over,
  };
}

function printPoint(t: number, verdict: string, reason: string): void {
  console.log(`[t=${new Date(t).toISOString()}] verdict=${verdict}\n    reason=${reason}`);
}

// ---------------- 1. contract: integrity, empty intervals ----------------

test("entryAt < decisionAt throws (integrity — never grade a time-incoherent window)", () => {
  assert.throws(
    () => checkWaitingInterval(baseInput({ decisionAt: DECISION_AT, entryAt: DECISION_AT - 1 })),
    /integrity violation/,
  );
});

test("empty bars + allowEmptyInterval -> pass with reason 'no bars by construction'", () => {
  const r = checkWaitingInterval(baseInput({
    decisionAt: D("2026-10-13T16:00:00.000Z"), // equity session close
    entryAt: D("2026-10-14T13:30:00.000Z"),     // next session open
    bars: [],
    allowEmptyInterval: true,
  }));
  assert.equal(r.verdict, "pass");
  assert.match(r.reason, /no bars by construction/);
  const kinds = r.checks.map((c) => c.check);
  assert.deepEqual(kinds, ["setup_history", "setup_invalidation"]);
  assert.ok(r.checks.every((c) => c.verdict === "pass"));
});

test("empty bars without allowEmptyInterval -> uncertain, fail-closed ('no waiting-interval evidence')", () => {
  const r = checkWaitingInterval(baseInput({ bars: [], allowEmptyInterval: false, entryAt: DECISION_AT + 60_000 }));
  assert.equal(r.verdict, "uncertain");
  assert.match(r.reason, /no waiting-interval evidence/);
  assert.equal(r.checks[1]!.check, "setup_invalidation");
  assert.equal(r.checks[1]!.verdict, "uncertain");
});

// ---------------- 2. setup history is features, never stop-outs ----------------

test("pre-decision extremes crossing the stop are features only — waiting interval still passes", () => {
  const safe = m5("2026-10-13T09:05:00.000Z", 99.0, 100.2, "09:05-09:10Z (safe)");
  const r = checkWaitingInterval(baseInput({
    entryAt: D("2026-10-13T09:10:00.000Z"),
    bars: [yesterdayBar, signalDaySoFar, safe],
  }));
  assert.equal(r.verdict, "pass");
  // both crossed bars recorded as pre-decision features, in the result AND the separate check entry
  assert.deepEqual(r.preDecisionFeatures.map((b) => b.label).sort(), [
    "2026-10-12 UTC session (pre-decision)",
    "signal-day 00:00-09:00Z (pre-decision)",
  ]);
  const history = r.checks[0]!;
  assert.equal(history.check, "setup_history");
  assert.equal(history.verdict, "pass");
  assert.match(history.reason, /never stop-outs/);
  assert.deepEqual(
    (history.detail as { historicalCrosses: string[] }).historicalCrosses.sort(),
    ["2026-10-12 UTC session (pre-decision)", "signal-day 00:00-09:00Z (pre-decision)"],
  );
  assert.equal(r.checks[1]!.check, "setup_invalidation");
});

test("preDecisionAt beyond decisionAt is clamped — post-decision evidence still graded", () => {
  const breach = m5("2026-10-13T09:05:00.000Z", 97.5, 99.8, "09:05-09:10Z (breach)");
  const r = checkWaitingInterval(baseInput({
    entryAt: D("2026-10-13T09:10:00.000Z"),
    preDecisionAt: D("2026-10-13T09:10:00.000Z"), // incoherent: draft after decision
    bars: [breach],
  }));
  assert.equal(r.verdict, "fail");
  assert.match(r.reason, /setup invalidated in the waiting interval/);
});

// ---------------- 3. runQualificationChecks ----------------

function qualificationInput(over: Partial<IssuanceVetoInput> = {}): IssuanceVetoInput {
  return {
    invalidation: {
      direction: DIRECTION,
      finalStop: FINAL_STOP,
      decisionAt: DECISION_AT,
      entryAt: DECISION_AT, // degenerate at qualification: the entry is not observed yet
      preDecisionAt: PRE_DECISION_AT,
      finestGranularity: "intraday",
      bars: [yesterdayBar, signalDaySoFar],
    },
    entryZone: {
      direction: DIRECTION,
      entry: 100.2,
      referenceEntry: 100,
      driftLimitBps: 150,
      entryAt: DECISION_AT,
      expiresAt: null,
    },
    pipeline: { draftStop: FINAL_STOP, publishedStop: FINAL_STOP },
    ...over,
  };
}

test("runQualificationChecks: pre-decision crossing never fails; clean run passes with no decision→entry invalidation", () => {
  const q = runQualificationChecks(qualificationInput());
  assert.equal(q.verdict, "pass");
  assert.deepEqual(q.checks.map((c) => c.check), ["setup_invalidation", "setup_history", "entry_zone"]);
  assert.ok(q.checks.every((c) => c.verdict === "pass"));
  assert.match(q.summary, /No decision→entry invalidation is evaluated at qualification time/);
  const history = q.checks[1]!;
  assert.match(history.reason, /recorded as features, never stop-outs/);
});

test("runQualificationChecks: entry-zone drift failure -> fail_closed (entry-rule failure, not a veto)", () => {
  const q = runQualificationChecks(qualificationInput({
    entryZone: {
      direction: DIRECTION, entry: 105, referenceEntry: 100, driftLimitBps: 150,
      entryAt: DECISION_AT, expiresAt: null,
    },
  }));
  assert.equal(q.verdict, "fail_closed");
  assert.match(q.summary, /entry_zone=fail/);
  assert.match(q.summary, /entry-rule failure \(not a veto\)/);
});

test("runQualificationChecks: pipeline stop mismatch -> fail_closed", () => {
  const q = runQualificationChecks(qualificationInput({
    pipeline: { draftStop: 97, publishedStop: FINAL_STOP },
    invalidation: { ...qualificationInput().invalidation, finalStop: 97 },
  }));
  assert.equal(q.verdict, "fail_closed");
  assert.match(q.summary, /setup_invalidation=fail/);
  assert.match(q.summary, /move the veto after buildAtrLevels/);
});

test("checkSetupHistory standalone: always pass, even when history crossed the stop", () => {
  const h = checkSetupHistory({
    direction: DIRECTION, finalStop: FINAL_STOP, preDecisionAt: PRE_DECISION_AT,
    bars: [yesterdayBar, signalDaySoFar],
  });
  assert.equal(h.check, "setup_history");
  assert.equal(h.verdict, "pass");
  assert.match(h.reason, /2 bar\(s\).*recorded as setup features/);
  assert.match(h.reason, /never stop-outs/);
});

// ---------------- 4(i). DEMO: CONFIRMED breach -> fail, stays fail after recovery ----------------

test("DEMO (i): confirmed breach in the waiting interval — fail at the breach, remains fail after recovery", () => {
  console.log("\n--- demo(i): CONFIRMED breach during [decisionAt, entryAt), then recovery before entry ---");
  const safe1 = m5("2026-10-13T09:05:00.000Z", 99.0, 100.2, "09:05-09:10Z (safe)");
  const breach = m5("2026-10-13T09:10:00.000Z", 97.5, 99.8, "09:10-09:15Z (BREACH: low 97.5 <= stop 98)");
  const recovery = m5("2026-10-13T09:15:00.000Z", 99.3, 100.6, "09:15-09:20Z (recovery: low 99.3)");

  const history = [yesterdayBar, signalDaySoFar];

  // t1: evidence so far is clean -> pass
  let t = D("2026-10-13T09:10:00.000Z");
  let r = checkWaitingInterval(baseInput({ entryAt: t, bars: [...history, safe1] }));
  printPoint(t, r.verdict, r.reason);
  assert.equal(r.verdict, "pass");

  // t2: the fine-grained 5m bar crosses the final stop inside the window -> FAIL
  t = D("2026-10-13T09:15:00.000Z");
  r = checkWaitingInterval(baseInput({ entryAt: t, bars: [...history, safe1, breach] }));
  printPoint(t, r.verdict, r.reason);
  assert.equal(r.verdict, "fail");
  assert.match(r.reason, /setup invalidated in the waiting interval/);
  assert.match(r.reason, /born-dead LONG: post-decision extreme crossed the final published stop 98/);

  // t3: price recovered BEFORE the entry was observed — the verdict REMAINS fail.
  // A touch is a touch: recovery before entry does not un-invalidate.
  t = D("2026-10-13T09:20:00.000Z");
  r = checkWaitingInterval(baseInput({ entryAt: t, bars: [...history, safe1, breach, recovery] }));
  printPoint(t, r.verdict, r.reason);
  assert.equal(r.verdict, "fail");
  assert.match(r.reason, /born-dead LONG: post-decision extreme crossed the final published stop 98 \(extreme 97\.5/);
  console.log("    note: recovery before entry does not un-invalidate — a touch is a touch.");
});

// ---------------- 4(ii). DEMO: PROVISIONAL breach -> uncertain, finer evidence exonerates -> pass ----------------

test("DEMO (ii): provisional (coarse) breach evidence -> uncertain, then finer evidence exonerates -> pass", () => {
  console.log("\n--- demo(ii): PROVISIONAL breach evidence, then exoneration by finer evidence ---");
  const history = [yesterdayBar, signalDaySoFar];

  // Coarse decision-day session bar (daily OHLC) whose low suggests a cross.
  // At intraday granularity this is PROVISIONAL: the path cannot be isolated.
  const coarseSession: EvidenceBar = {
    startAt: D("2026-10-13T00:00:00.000Z"), endAt: D("2026-10-14T00:00:00.000Z"),
    open: 100, high: 101.5, low: 97.0, close: 100.4, isClosed: true,
    granularity: "session", source: "daily OHLC", label: "decision-day session (coarse: low 97.0)",
  };

  // t1: only the coarse bar covers the window -> UNCERTAIN (fail-closed downstream)
  let t = D("2026-10-13T09:10:00.000Z");
  let r = checkWaitingInterval(baseInput({ entryAt: t, bars: [...history, coarseSession] }));
  printPoint(t, r.verdict, r.reason);
  assert.equal(r.verdict, "uncertain");
  assert.match(r.reason, /coarser than the finest available granularity/);

  // t2: finer 5m evidence arrives and shows NO cross — the provisional
  // suggestion is exonerated -> PASS. (The coarse bar is superseded by the
  // finer evidence the issuer now holds; it no longer contributes.)
  t = D("2026-10-13T09:20:00.000Z");
  const fine = [
    m5("2026-10-13T09:05:00.000Z", 99.0, 100.2, "09:05-09:10Z (fine, safe)"),
    m5("2026-10-13T09:10:00.000Z", 99.4, 100.8, "09:10-09:15Z (fine, safe)"),
    m5("2026-10-13T09:15:00.000Z", 99.6, 101.0, "09:15-09:20Z (fine, safe)"),
  ];
  r = checkWaitingInterval(baseInput({ entryAt: t, bars: [...history, ...fine] }));
  printPoint(t, r.verdict, r.reason);
  assert.equal(r.verdict, "pass");
  assert.match(r.reason, /waiting interval clear/);
  console.log("    note: the coarse provisional suggestion never became a definite breach — finer evidence exonerated the window.");
});
