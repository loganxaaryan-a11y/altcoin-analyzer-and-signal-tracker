// veto-timing-c6.test.ts — CORRECTION 6 (veto timing tightened) tests.
// Run: node --test tests/veto-timing-c6.test.ts   (Node >= 22, type-stripping)
// Proves:
//   (6a) candles straddling ENTRY are handled like decision-straddles:
//        pre-entry portion -> uncertain/fail-closed, never a definite breach
//   (6b) time-ordering: only extremes timestamped AFTER entryAt count;
//        pre-entry extremes are pre-entry movement, not stop-outs
//   (6c) the veto result separates "current entry valid" (the entry print
//        itself within bounds) from "evidence of intervening setup
//        invalidation" (post-entry observations); one safe print cannot prove
//        an interval safe -> "insufficient-data" on the invalidation question

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkSetupInvalidation,
  checkOutcomes,
  checkPostEntryInvalidation,
} from "../src/veto.ts";
import type { EvidenceBar } from "../src/veto.ts";

const D = (s: string) => Date.parse(s);
const DECISION_AT = D("2026-10-13T09:00:00.000Z");
const ENTRY_AT = D("2026-10-13T09:30:00.000Z");
const STOP = 98;

function intradayBar(start: string, end: string, low: number, high: number, label: string): EvidenceBar {
  return {
    startAt: D(start), endAt: D(end), open: low + 0.5, high, low, close: high - 0.3,
    isClosed: true, granularity: "intraday", source: "CoinGecko OHLC", label,
  };
}

function tradePrint(ts: string, price: number, label: string): EvidenceBar {
  const t = D(ts);
  return {
    startAt: t, endAt: t, open: price, high: price, low: price, close: price,
    isClosed: true, granularity: "trade_print", source: "Binance Spot", label,
  };
}

// ---------------- (6a) straddling-ENTRY candles in checkSetupInvalidation ----------------

test("(6a1) straddling-entry candle with breach -> UNCERTAIN, not a definite veto", () => {
  // The bar [09:00,10:00) contains entryAt 09:30. Its low 97 may have printed
  // at 09:05 (pre-entry movement) or 09:45 (post-entry) — OHLC cannot isolate
  // the pre-entry portion, so it must not contribute a definite breach.
  const r = checkSetupInvalidation({
    direction: "long", finalStop: STOP, decisionAt: DECISION_AT, entryAt: ENTRY_AT,
    finestGranularity: "intraday",
    bars: [intradayBar("2026-10-13T09:00:00.000Z", "2026-10-13T10:00:00.000Z", 97, 100.5, "entry-straddling bar")],
  });
  assert.equal(r.verdict, "uncertain", r.reason);
  assert.notEqual(r.verdict, "fail", "a straddling-entry candle must never produce a definite veto");
  assert.match(r.reason, /straddles entryTime/);
  assert.match(r.reason, /never treated as a definite breach/);
  assert.equal(r.detail?.straddlesEntry, true);
});

test("(6a2) straddling-entry candle, whole-bar safe -> definite pass", () => {
  const r = checkSetupInvalidation({
    direction: "long", finalStop: STOP, decisionAt: DECISION_AT, entryAt: ENTRY_AT,
    finestGranularity: "intraday",
    bars: [intradayBar("2026-10-13T09:00:00.000Z", "2026-10-13T10:00:00.000Z", 99, 100.5, "entry-straddling bar (safe)")],
  });
  assert.equal(r.verdict, "pass", r.reason);
});

test("(6a3) bar fully inside (decision, entry) crossing the stop -> still a definite veto", () => {
  const r = checkSetupInvalidation({
    direction: "long", finalStop: STOP, decisionAt: DECISION_AT, entryAt: ENTRY_AT,
    finestGranularity: "intraday",
    bars: [intradayBar("2026-10-13T09:05:00.000Z", "2026-10-13T09:10:00.000Z", 97, 100.5, "fully pre-entry bar")],
  });
  assert.equal(r.verdict, "fail", r.reason);
  assert.match(r.reason, /born-dead LONG/);
});

// ---------------- (6b) time-ordering in checkOutcomes ----------------

test("(6b1) outcome: intraday bar straddling entryAt with a stop touch -> UNCERTAIN, not fail", () => {
  // Old behavior: fail ("invalidated LONG"). Corrected: the touch cannot be
  // timestamped after entryAt — pre-entry movement is not a stop-out.
  const r = checkOutcomes({
    direction: "long", entry: 100, stop: STOP, target: 101.5, entryAt: ENTRY_AT,
    expiresAt: null, nowAt: D("2026-10-13T12:00:00.000Z"),
    bars: [intradayBar("2026-10-13T09:00:00.000Z", "2026-10-13T10:00:00.000Z", 97, 100.5, "entry-straddling bar")],
    evaluatorGranularity: "intraday",
  });
  assert.equal(r.verdict, "uncertain", r.reason);
  assert.match(r.reason, /straddles entryTime/);
  assert.match(r.reason, /pre-entry extreme is pre-entry movement, not a stop-out/);
});

test("(6b2) outcome: straddling-entry bar, whole-bar safe -> post-entry portion provably safe", () => {
  const r = checkOutcomes({
    direction: "long", entry: 100, stop: STOP, target: 101.5, entryAt: ENTRY_AT,
    expiresAt: D("2026-10-13T12:00:00.000Z"), nowAt: D("2026-10-13T13:00:00.000Z"),
    bars: [intradayBar("2026-10-13T09:00:00.000Z", "2026-10-13T10:00:00.000Z", 99, 100, "entry-straddling bar (safe)")],
    evaluatorGranularity: "intraday",
  });
  assert.equal(r.verdict, "pass", r.reason);
});

test("(6b3) outcome: bar fully after entryAt crossing the stop -> still fail (genuine stop-out)", () => {
  const r = checkOutcomes({
    direction: "long", entry: 100, stop: STOP, target: 101.5, entryAt: ENTRY_AT,
    expiresAt: null, nowAt: D("2026-10-13T12:00:00.000Z"),
    bars: [intradayBar("2026-10-13T10:00:00.000Z", "2026-10-13T11:00:00.000Z", 97, 100.5, "fully post-entry bar")],
    evaluatorGranularity: "intraday",
  });
  assert.equal(r.verdict, "fail", r.reason);
  assert.match(r.reason, /invalidated LONG/);
});

// ---------------- (6c) checkPostEntryInvalidation: the two questions separated ----------------

const ENTRY_PRINT_AT = D("2026-10-13T09:03:00.000Z");

test("(6c1) valid entry followed by a later extreme beyond the stop -> veto fires (genuine stop-out)", () => {
  const r = checkPostEntryInvalidation({
    direction: "long", stop: STOP, entryPrice: 100, entryAt: ENTRY_PRINT_AT,
    nowAt: D("2026-10-13T09:15:00.000Z"),
    bars: [tradePrint("2026-10-13T09:10:00.000Z", 97.5, "09:10 print through the stop")],
  });
  assert.equal(r.entryValid, "pass", r.entryReason);
  assert.equal(r.interveningInvalidation, "invalidation_observed", r.invalidationReason);
  assert.equal(r.verdict, "fail", r.reason);
});

test("(6c2) extreme timestamped BEFORE entryAt -> does not veto (pre-entry movement)", () => {
  const r = checkPostEntryInvalidation({
    direction: "long", stop: STOP, entryPrice: 100, entryAt: ENTRY_PRINT_AT,
    nowAt: D("2026-10-13T09:15:00.000Z"),
    bars: [tradePrint("2026-10-13T09:00:00.000Z", 97.5, "pre-entry print through the stop")],
  });
  assert.equal(r.entryValid, "pass", r.entryReason);
  assert.notEqual(r.interveningInvalidation, "invalidation_observed",
    "a pre-entry extreme must never count as a stop-out");
  assert.notEqual(r.verdict, "fail", "a pre-entry extreme must never veto the entry");
  // No post-entry coverage at all -> insufficient data on the invalidation
  // question (fail-closed there), not on entry validity.
  assert.equal(r.interveningInvalidation, "insufficient_data");
  assert.equal(r.verdict, "uncertain");
});

test("(6c3) single safe print inside an otherwise unobserved interval -> entry valid, invalidation insufficient-data", () => {
  // THE correction-6c regression: one safe print cannot prove the interval safe.
  const r = checkPostEntryInvalidation({
    direction: "long", stop: STOP, entryPrice: 100, entryAt: ENTRY_PRINT_AT,
    nowAt: D("2026-10-13T09:15:00.000Z"),
    bars: [tradePrint("2026-10-13T09:10:00.000Z", 100.5, "lone safe print")],
  });
  assert.equal(r.entryValid, "pass", r.entryReason);
  assert.equal(r.interveningInvalidation, "insufficient_data", r.invalidationReason);
  assert.match(r.invalidationReason, /fail-closed on the invalidation question, NOT on entry validity/);
  assert.equal(r.verdict, "uncertain", "fail-closed on the invalidation question only");
});

test("(6c4) fully covered post-entry interval, no breach -> pass on both questions", () => {
  const r = checkPostEntryInvalidation({
    direction: "long", stop: STOP, entryPrice: 100, entryAt: ENTRY_PRINT_AT,
    nowAt: D("2026-10-13T11:00:00.000Z"),
    bars: [
      intradayBar("2026-10-13T09:00:00.000Z", "2026-10-13T10:00:00.000Z", 99, 100.5, "entry-straddling bar (safe)"),
      intradayBar("2026-10-13T10:00:00.000Z", "2026-10-13T11:00:00.000Z", 99.2, 100.8, "fully post-entry bar (safe)"),
    ],
  });
  assert.equal(r.entryValid, "pass", r.entryReason);
  assert.equal(r.interveningInvalidation, "no_invalidation_observed", r.invalidationReason);
  assert.equal(r.verdict, "pass", r.reason);
});

test("(6c5) entry print itself crosses the stop -> entryValid fail (stopped at birth)", () => {
  const r = checkPostEntryInvalidation({
    direction: "long", stop: STOP, entryPrice: 97.5, entryAt: ENTRY_PRINT_AT,
    nowAt: D("2026-10-13T09:15:00.000Z"),
    bars: [],
  });
  assert.equal(r.entryValid, "fail", r.entryReason);
  assert.match(r.entryReason, /stopped at birth/);
  assert.equal(r.verdict, "fail", r.reason);
});

test("(6c6) straddling-entry bar with a crossing in the new check -> insufficient-data, never a definite stop-out", () => {
  const r = checkPostEntryInvalidation({
    direction: "long", stop: STOP, entryPrice: 100, entryAt: ENTRY_AT,
    nowAt: D("2026-10-13T12:00:00.000Z"),
    bars: [intradayBar("2026-10-13T09:00:00.000Z", "2026-10-13T10:00:00.000Z", 97, 100.5, "entry-straddling bar")],
  });
  assert.equal(r.entryValid, "pass", r.entryReason);
  assert.notEqual(r.interveningInvalidation, "invalidation_observed",
    "an unisolable straddling-bar extreme must never be a definite stop-out");
  assert.equal(r.interveningInvalidation, "insufficient_data");
  assert.equal(r.verdict, "uncertain");
});

test("(6c7) short side: post-entry extreme above the stop -> invalidation_observed", () => {
  const r = checkPostEntryInvalidation({
    direction: "short", stop: 102, entryPrice: 100, entryAt: ENTRY_PRINT_AT,
    nowAt: D("2026-10-13T09:15:00.000Z"),
    bars: [tradePrint("2026-10-13T09:10:00.000Z", 102.4, "09:10 print through the stop")],
  });
  assert.equal(r.entryValid, "pass", r.entryReason);
  assert.equal(r.interveningInvalidation, "invalidation_observed");
  assert.equal(r.verdict, "fail");
});
