// veto.test.ts — corrected-veto test suite (WORK ITEM 2/5).
// Run: node --test tests/veto.test.ts   (Node >= 22, type-stripping)
// Proves:
//   1. the yesterday-crosses-stop counterexample (exact holdout fixture) does NOT veto a new setup
//   2. genuine post-decision invalidation DOES veto
//   3. straddling candle -> uncertain / fail-closed
//   4. draft-vs-published stop consistency (veto tests the FINAL published stop)
//   5. the 5 legacy counterexample holdout tests still pass (run in-place, byte-identical)

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  checkSetupInvalidation, checkEntryZone, checkOutcomes, runIssuanceChecks,
  validatePipelineOrder,
} from "../src/veto.ts";
import type { Direction, EvidenceBar } from "../src/veto.ts";

// ---------------- shared fixtures ----------------

const D = (s: string) => Date.parse(s);
const DECISION_AT = D("2026-10-13T09:00:00.000Z");
const ENTRY_AT = D("2026-10-13T09:02:00.000Z");
// Correction 6(a): a bar whose interval contains entryAt straddles the entry
// event and can no longer produce a definite breach. Fixtures that need a
// breaching bar FULLY inside the decision→entry window use this later entry.
const ENTRY_AFTER_BAR = D("2026-10-13T10:30:00.000Z");
const FINAL_STOP = 98; // published stop: entry 100 - 1.25 x ATR14 1.6 (post-buildAtrLevels)
const DAY = 86_400_000;

// Yesterday's completed UTC session — the EXACT holdout Case-1 fixture:
// O 96, H 104, L 95, C 99 on 2026-10-12; draft/decision stop 98.
const yesterdayBar: EvidenceBar = {
  startAt: D("2026-10-12T00:00:00.000Z"), endAt: D("2026-10-13T00:00:00.000Z"),
  open: 96, high: 104, low: 95, close: 99, isClosed: true,
  granularity: "session", source: "CoinGecko OHLC", label: "2026-10-12 UTC session",
};

// Forming 4h candle 08:00-12:00Z — straddles decisionTime (09:00Z).
const formingSafe: EvidenceBar = {
  startAt: D("2026-10-13T08:00:00.000Z"), endAt: D("2026-10-13T12:00:00.000Z"),
  open: 99.8, high: 100.6, low: 99.2, close: 100.1, isClosed: false,
  provisional: true, granularity: "forming_candle", source: "CoinGecko OHLC", label: "forming 4h (safe)",
};
const formingBreached: EvidenceBar = {
  ...formingSafe, low: 97.5, label: "forming 4h (breached)",
};

function intradayBar(start: string, end: string, low: number, high: number, label: string, extra: Partial<EvidenceBar> = {}): EvidenceBar {
  return {
    startAt: D(start), endAt: D(end), open: low + 0.5, high, low, close: high - 0.3,
    isClosed: true, granularity: "intraday", source: "CoinGecko OHLC", label, ...extra,
  };
}

// ---------------- (a) setup invalidation ----------------

test("(a1) yesterday-crosses-stop counterexample does NOT veto the new setup (exact fixture)", () => {
  const r = checkSetupInvalidation({
    direction: "long", finalStop: FINAL_STOP, decisionAt: DECISION_AT, entryAt: ENTRY_AT,
    finestGranularity: "intraday",
    bars: [yesterdayBar, formingSafe],
  });
  assert.equal(r.verdict, "pass", r.reason);
  assert.match(r.reason, /final published stop 98/);
  const features = (r.detail?.preDecisionFeatures ?? []) as { label?: string }[];
  assert.ok(features.some((f) => f.label === "2026-10-12 UTC session"),
    "yesterday's crossing candle must be recorded as a setup FEATURE, never a stop-out");
});

test("(a2) genuine post-decision invalidation DOES veto", () => {
  // Correction 6(a) note: the breaching bar sits FULLY inside the
  // decision→entry window (entryAt 10:30, after the bar). A bar containing
  // entryAt would straddle the entry event -> uncertain, not a definite veto
  // (see the correction-6 test file).
  const r = checkSetupInvalidation({
    direction: "long", finalStop: FINAL_STOP, decisionAt: DECISION_AT, entryAt: ENTRY_AFTER_BAR,
    finestGranularity: "intraday",
    bars: [yesterdayBar, intradayBar("2026-10-13T09:00:00.000Z", "2026-10-13T10:00:00.000Z", 97.4, 99.8, "09:30Z hourly")],
  });
  assert.equal(r.verdict, "fail", r.reason);
  assert.match(r.reason, /born-dead LONG/);
  assert.match(r.reason, /post-decision/);
});

test("(a2b) short-side genuine post-decision invalidation DOES veto", () => {
  const r = checkSetupInvalidation({
    direction: "short", finalStop: 102, decisionAt: DECISION_AT, entryAt: ENTRY_AFTER_BAR,
    finestGranularity: "intraday",
    bars: [yesterdayBar, intradayBar("2026-10-13T09:00:00.000Z", "2026-10-13T10:00:00.000Z", 99.0, 102.4, "09:30Z hourly")],
  });
  assert.equal(r.verdict, "fail", r.reason);
  assert.match(r.reason, /born-dead SHORT/);
});

test("(a3) straddling candle whose whole-bar extreme is safe -> definite pass (provisional)", () => {
  const r = checkSetupInvalidation({
    direction: "long", finalStop: FINAL_STOP, decisionAt: DECISION_AT, entryAt: ENTRY_AT,
    finestGranularity: "forming_candle",
    bars: [formingSafe],
  });
  assert.equal(r.verdict, "pass", r.reason);
  assert.equal(r.detail?.provisionalEvidenceUsed, true);
});

test("(a4) straddling candle whose extreme crossed the stop -> UNCERTAIN, fail-closed", () => {
  const r = checkSetupInvalidation({
    direction: "long", finalStop: FINAL_STOP, decisionAt: DECISION_AT, entryAt: ENTRY_AT,
    finestGranularity: "forming_candle",
    bars: [formingBreached],
  });
  assert.equal(r.verdict, "uncertain", r.reason);
  assert.match(r.reason, /straddles decisionTime/);
  assert.match(r.reason, /never treated as a definite breach/);
  // fail-closed at the orchestrator level
  const o = runIssuanceChecks({
    invalidation: {
      direction: "long", finalStop: FINAL_STOP, decisionAt: DECISION_AT, entryAt: ENTRY_AT,
      finestGranularity: "forming_candle", bars: [formingBreached],
    },
    entryZone: { direction: "long", entry: 100, referenceEntry: 100, driftLimitBps: 25, entryAt: ENTRY_AT, expiresAt: ENTRY_AT + 30 * DAY },
    pipeline: { draftStop: 98, publishedStop: 98 },
  });
  assert.equal(o.verdict, "fail_closed");
});

test("(a5) no post-decision evidence at all -> UNCERTAIN, fail-closed, never falls back to pre-decision candle", () => {
  const r = checkSetupInvalidation({
    direction: "long", finalStop: FINAL_STOP, decisionAt: DECISION_AT, entryAt: ENTRY_AT,
    finestGranularity: "intraday", bars: [yesterdayBar],
  });
  assert.equal(r.verdict, "uncertain", r.reason);
  assert.match(r.reason, /pre-decision candle must never veto/);
});

test("(a6) NO WAITING TRAP: immediate entry validates on the forming candle alone", () => {
  const r = checkSetupInvalidation({
    direction: "long", finalStop: FINAL_STOP, decisionAt: DECISION_AT, entryAt: DECISION_AT + 30_000, // 30s later
    finestGranularity: "forming_candle", bars: [formingSafe],
  });
  assert.equal(r.verdict, "pass", r.reason);
  assert.equal(r.detail?.provisionalEvidenceUsed, true, "must admit the forming candle as provisional, not demand a completed one");
});

test("(a7) equity mode: the signal-day bar crossing the stop is pre-decision -> pass, recorded as feature", () => {
  // Equity entry = signal-day close; decision at the close. The signal-day bar
  // ends exactly at decisionAt -> endAt <= decisionAt -> pre-decision feature.
  const signalDayClose = D("2026-10-09T20:00:00.000Z"); // XNYS close
  const signalDay: EvidenceBar = {
    startAt: D("2026-10-09T13:30:00.000Z"), endAt: signalDayClose,
    open: 99, high: 102, low: 95, close: 100, isClosed: true,
    granularity: "session", source: "Yahoo Finance", label: "2026-10-09 XNYS session",
  };
  const r = checkSetupInvalidation({
    direction: "long", finalStop: 98, decisionAt: signalDayClose, entryAt: signalDayClose,
    finestGranularity: "session", bars: [signalDay],
  });
  // Degenerate window: entry coincides with the decision (equity reference-entry
  // contract). Vacuous pass — NOT a born-dead veto, NOT a missing-evidence
  // uncertain. The signal-day bar is a pre-decision feature.
  assert.equal(r.verdict, "pass", r.reason);
  assert.match(r.reason, /no post-decision pre-entry interval exists/);
  const features = (r.detail?.preDecisionFeatures ?? []) as { label?: string }[];
  assert.ok(features.some((f) => f.label === "2026-10-09 XNYS session"));
});

// ---------------- draft-vs-published (defect i) ----------------

test("(d1) veto uses the FINAL published stop: bar crosses draft stop but not published stop -> NO veto", () => {
  // Draft stop 98 (decision price 100). Post-decision quote moves entry to 102:
  // published stop = 102 - 2.0 = 100. Bar low 99 crosses the draft stop 98? No —
  // make it cross the draft stop: low 97.5 <= 98 draft, but 97.5 <= 100 published TOO. Redo:
  // draft 98, published 96 (entry moved DOWN to 98 via quote): bar low 97 crosses draft (97<=98)
  // but NOT published (97 > 96) -> corrected rule: PASS.
  const r = checkSetupInvalidation({
    direction: "long", finalStop: 96, decisionAt: DECISION_AT, entryAt: ENTRY_AT,
    finestGranularity: "intraday",
    bars: [intradayBar("2026-10-13T09:00:00.000Z", "2026-10-13T10:00:00.000Z", 97, 99, "post-decision bar")],
  });
  assert.equal(r.verdict, "pass", r.reason);
  assert.match(r.reason, /final published stop 96/);
});

test("(d2) veto uses the FINAL published stop: bar misses draft stop but crosses published stop -> VETO", () => {
  // Correction 6(a) note: entryAt moved past the bar so the breaching bar is
  // fully inside the decision→entry window (a bar containing entryAt would
  // straddle the entry event -> uncertain, not a definite veto).
  const r = checkSetupInvalidation({
    direction: "long", finalStop: 99.2, decisionAt: DECISION_AT, entryAt: ENTRY_AFTER_BAR,
    finestGranularity: "intraday",
    bars: [intradayBar("2026-10-13T09:00:00.000Z", "2026-10-13T10:00:00.000Z", 98.7, 101.5, "post-decision bar")],
  });
  assert.equal(r.verdict, "fail", r.reason);
  assert.match(r.reason, /final published stop 99\.2/);
});

test("(d3) pipeline guard rejects a run that graded the draft stop instead of the published stop", () => {
  const ok = validatePipelineOrder({ draftStop: 98, publishedStop: 99.2, checkedStop: 99.2 });
  assert.equal(ok.verdict, "pass", ok.reason);
  const bad = validatePipelineOrder({ draftStop: 98, publishedStop: 99.2, checkedStop: 98 });
  assert.equal(bad.verdict, "fail", bad.reason);
  assert.match(bad.reason, /move the veto after buildAtrLevels/);
  const o = runIssuanceChecks({
    invalidation: {
      direction: "long", finalStop: 98, decisionAt: DECISION_AT, entryAt: ENTRY_AT,
      finestGranularity: "intraday",
      bars: [intradayBar("2026-10-13T09:00:00.000Z", "2026-10-13T10:00:00.000Z", 99, 101, "bar")],
    },
    entryZone: { direction: "long", entry: 101.2, referenceEntry: 100, driftLimitBps: 25, entryAt: ENTRY_AT, expiresAt: ENTRY_AT + 30 * DAY },
    pipeline: { draftStop: 98, publishedStop: 99.2 }, // graded the draft stop 98, not published 99.2
  });
  assert.equal(o.verdict, "fail_closed");
  assert.match(o.summary, /move the veto after buildAtrLevels/);
});

// ---------------- (b) entry zone ----------------

test("(b1) entry beyond driftLimit -> entry-rule failure (NOT a veto)", () => {
  const r = checkEntryZone({ direction: "long", entry: 100.6, referenceEntry: 100, driftLimitBps: 25, entryAt: ENTRY_AT, expiresAt: ENTRY_AT + 30 * DAY });
  assert.equal(r.verdict, "fail", r.reason);
  assert.match(r.reason, /entry-rule failure \(not a veto\)/);
  assert.match(r.reason, /beyond the 25 bps/);
});

test("(b2) entry past expiry -> entry-rule failure", () => {
  const expiresAt = D("2026-11-01T00:00:00.000Z");
  const r = checkEntryZone({ direction: "long", entry: 100, referenceEntry: 100, driftLimitBps: 25, entryAt: expiresAt + 1, expiresAt });
  assert.equal(r.verdict, "fail", r.reason);
  assert.match(r.reason, /past the issuance expiry/);
});

test("(b3) entry inside the permitted zone -> pass", () => {
  const r = checkEntryZone({ direction: "long", entry: 100.1, referenceEntry: 100, driftLimitBps: 25, entryAt: ENTRY_AT, expiresAt: ENTRY_AT + 30 * DAY });
  assert.equal(r.verdict, "pass", r.reason);
});

test("(b4) missing entry -> uncertain, fail-closed", () => {
  const r = checkEntryZone({ direction: "long", entry: null, referenceEntry: 100, driftLimitBps: 25, entryAt: ENTRY_AT, expiresAt: null });
  assert.equal(r.verdict, "uncertain", r.reason);
});

// ---------------- (c) outcomes ----------------

const EXPIRES = DECISION_AT + 30 * DAY;
const NOW_DONE = EXPIRES + DAY;

function sessionBar(date: string, low: number, high: number): EvidenceBar {
  // XNYS session 09:30-16:00 ET on the given date (as UTC for the fixture).
  return {
    startAt: D(`${date}T13:30:00.000Z`), endAt: D(`${date}T20:00:00.000Z`),
    open: low + 1, high, low, close: high - 1, isClosed: true,
    granularity: "session", source: "Yahoo Finance", label: `${date} XNYS`,
  };
}

test("(c1) pre-entry bars are ignored entirely: a pre-entry stop cross does not fail", () => {
  const preEntry = intradayBar("2026-10-13T07:00:00.000Z", "2026-10-13T08:00:00.000Z", 90, 99, "pre-entry bar (stop 98 crossed)");
  const r = checkOutcomes({
    direction: "long", entry: 100, stop: 98, target: 101.5, entryAt: ENTRY_AT,
    expiresAt: EXPIRES, nowAt: NOW_DONE,
    bars: [preEntry, intradayBar("2026-10-13T10:00:00.000Z", "2026-10-13T14:00:00.000Z", 99, 101, "post-entry hold")],
    evaluatorGranularity: "intraday",
  });
  // post-entry bars never touched either level, horizon expired -> pass
  assert.equal(r.verdict, "pass", r.reason);
  assert.equal(r.detail?.ignoredPreEntryBars, 1);
});

test("(c2) post-entry stop touch -> fail (invalidated)", () => {
  const r = checkOutcomes({
    direction: "long", entry: 100, stop: 98, target: 101.5, entryAt: ENTRY_AT,
    expiresAt: EXPIRES, nowAt: NOW_DONE,
    bars: [intradayBar("2026-10-13T10:00:00.000Z", "2026-10-13T14:00:00.000Z", 97, 100.5, "post-entry bar")],
    evaluatorGranularity: "intraday",
  });
  assert.equal(r.verdict, "fail", r.reason);
  assert.match(r.reason, /invalidated LONG/);
});

test("(c3) post-entry target touch -> pass", () => {
  const r = checkOutcomes({
    direction: "long", entry: 100, stop: 98, target: 101.5, entryAt: ENTRY_AT,
    expiresAt: EXPIRES, nowAt: NOW_DONE,
    bars: [intradayBar("2026-10-13T10:00:00.000Z", "2026-10-13T14:00:00.000Z", 99, 102, "post-entry bar")],
    evaluatorGranularity: "intraday",
  });
  assert.equal(r.verdict, "pass", r.reason);
  assert.match(r.reason, /target 101\.5 reached/);
});

test("(c4) same-bar target+stop double touch -> uncertain (pessimistic ordering unresolvable)", () => {
  const r = checkOutcomes({
    direction: "long", entry: 100, stop: 98, target: 101.5, entryAt: ENTRY_AT,
    expiresAt: EXPIRES, nowAt: NOW_DONE,
    bars: [intradayBar("2026-10-13T10:00:00.000Z", "2026-10-13T14:00:00.000Z", 97, 102, "double-touch bar")],
    evaluatorGranularity: "intraday",
  });
  assert.equal(r.verdict, "uncertain", r.reason);
  assert.match(r.reason, /ordering needs finer evidence/);
});

test("(c5) expiry-straddling candle with a touch -> uncertain", () => {
  const straddler: EvidenceBar = {
    startAt: EXPIRES - 2 * 3_600_000, endAt: EXPIRES + 2 * 3_600_000,
    open: 99.5, high: 100.5, low: 97.5, close: 99, isClosed: true,
    granularity: "intraday", source: "CoinGecko OHLC", label: "expiry straddler",
  };
  const r = checkOutcomes({
    direction: "long", entry: 100, stop: 98, target: 101.5, entryAt: ENTRY_AT,
    expiresAt: EXPIRES, nowAt: NOW_DONE, bars: [straddler],
    evaluatorGranularity: "intraday",
  });
  assert.equal(r.verdict, "uncertain", r.reason);
  assert.match(r.reason, /straddles expiry/);
});

test("(c6) equity: entry inside a session -> uncertain (same granularity as evaluator)", () => {
  const insideSession: EvidenceBar = {
    startAt: D("2026-10-12T13:30:00.000Z"), endAt: D("2026-10-12T20:00:00.000Z"),
    open: 99, high: 101, low: 98.5, close: 100, isClosed: true,
    granularity: "session", source: "Yahoo Finance", label: "2026-10-12 XNYS",
  };
  const r = checkOutcomes({
    direction: "long", entry: 100, stop: 98, target: 103, entryAt: D("2026-10-12T17:00:00.000Z"),
    expiresAt: null, nowAt: NOW_DONE, bars: [insideSession],
    evaluatorGranularity: "session",
  });
  assert.equal(r.verdict, "uncertain", r.reason);
  assert.match(r.reason, /falls inside the/);
});

test("(c7) equity: first post-entry session crossing the stop -> fail (born-dead at evaluation)", () => {
  const entryAtSessionClose = D("2026-10-09T20:00:00.000Z"); // entry = signal-day close
  const signalDay = sessionBar("2026-10-09", 95, 102);       // pre-entry: IGNORED even though low 95 <= stop 98
  const nextSession = sessionBar("2026-10-12", 96, 101);      // post-entry: low 96 <= stop 98 -> born-dead
  const r = checkOutcomes({
    direction: "long", entry: 100, stop: 98, target: 103, entryAt: entryAtSessionClose,
    expiresAt: null, nowAt: NOW_DONE,
    bars: [signalDay, nextSession],
    evaluatorGranularity: "session",
  });
  assert.equal(r.verdict, "fail", r.reason);
  assert.match(r.reason, /invalidated LONG/);
  assert.match(r.reason, /2026-10-12 XNYS/);
  assert.equal(r.detail?.ignoredPreEntryBars, 1, "the signal-day bar must be excluded from the graded path");
});

test("(c8) equity veto must examine the evaluator's granularity: intraday evidence for a session evaluator -> uncertain", () => {
  const r = checkOutcomes({
    direction: "long", entry: 100, stop: 98, target: 103, entryAt: D("2026-10-09T20:00:00.000Z"),
    expiresAt: null, nowAt: NOW_DONE,
    bars: [intradayBar("2026-10-12T14:00:00.000Z", "2026-10-12T18:00:00.000Z", 99, 101, "intraday bar")],
    evaluatorGranularity: "session",
  });
  assert.equal(r.verdict, "uncertain", r.reason);
  assert.match(r.reason, /same bar granularity its evaluator uses/);
});

// ---------------- full orchestrator ----------------

test("(o1) full issuance run: the exact counterexample setup passes all three checks", () => {
  const o = runIssuanceChecks({
    invalidation: {
      direction: "long", finalStop: FINAL_STOP, decisionAt: DECISION_AT, entryAt: ENTRY_AT,
      finestGranularity: "intraday", bars: [yesterdayBar, formingSafe],
    },
    entryZone: { direction: "long", entry: 100, referenceEntry: 100, driftLimitBps: 25, entryAt: ENTRY_AT, expiresAt: ENTRY_AT + 30 * DAY },
    pipeline: { draftStop: 98, publishedStop: 98 },
  });
  assert.equal(o.verdict, "pass", o.summary);
  assert.ok(o.checks.every((c) => c.verdict === "pass"));
});

test("(o2) full issuance run: genuine post-decision breach suppresses (fail-closed)", () => {
  // A trade print at 09:01Z — strictly inside [decisionAt, entryAt) — crosses the stop.
  const print: EvidenceBar = {
    startAt: D("2026-10-13T09:01:00.000Z"), endAt: D("2026-10-13T09:01:00.000Z"),
    open: 97.4, high: 97.4, low: 97.4, close: 97.4, isClosed: true,
    granularity: "trade_print", source: "exchange prints", label: "09:01Z print",
  };
  const o = runIssuanceChecks({
    invalidation: {
      direction: "long", finalStop: FINAL_STOP, decisionAt: DECISION_AT, entryAt: ENTRY_AT,
      finestGranularity: "intraday", bars: [yesterdayBar, print],
    },
    entryZone: { direction: "long", entry: 100, referenceEntry: 100, driftLimitBps: 25, entryAt: ENTRY_AT, expiresAt: ENTRY_AT + 30 * DAY },
    pipeline: { draftStop: 98, publishedStop: 98 },
  });
  assert.equal(o.verdict, "fail_closed");
  assert.match(o.summary, /setup_invalidation=fail/);
});

// ---------------- (5) legacy holdout still passes ----------------

test("legacy 5-case counterexample holdout still passes (byte-identical, in place)", () => {
  const out = execFileSync("node", ["tests/holdout-veto-counterexample.test.mjs"], { cwd: new URL("../", import.meta.url), encoding: "utf8" });
  assert.match(out, /5\/5 harness expectations held as analyzed/);
});
