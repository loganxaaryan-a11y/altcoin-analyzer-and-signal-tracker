/**
 * Equity gate decomposition — differential test.
 *
 * Proves the sandbox-native decomposition
 * (src/gates/equity-gate-decomposition.ts: evaluateEquityBornDead +
 * evaluateEquityShortRegime, composed by composeEquityDecision) is EXACTLY
 * equivalent to the vendored `signalIssuanceDecision`
 * (equity/server/src/actions.ts:402-416, kept verbatim as the oracle) on all
 * four outcomes: availability-block, born-dead block, long pass, short
 * pass/block via the regime gate.
 *
 * The integrated handler imports ONLY evaluateEquityShortRegime (the retained
 * regime filter); the born-dead branch is exercised exclusively through the
 * corrected veto (runIssuanceChecks). This test is what makes that split
 * trustworthy.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  signalIssuanceDecision,
  type Point,
  type SignalIssuanceDecision,
} from "../src/gates/equity-gates.js";
import {
  composeEquityDecision,
  evaluateEquityBornDead,
  evaluateEquityShortRegime,
} from "../src/gates/equity-gate-decomposition.js";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Fixture {
  direction: "long" | "short";
  invalidation: number;
  signalDay: Point | null;
  history: Point[];
}

function randomPoint(rand: () => number, date: string, base: number): Point {
  const open = base + (rand() - 0.5) * 4;
  const close = base + (rand() - 0.5) * 4;
  return {
    date,
    open,
    high: Math.max(open, close) + rand() * 2,
    low: Math.min(open, close) - rand() * 2,
    close,
    volume: 1_000_000,
  };
}

function randomFixture(rand: () => number, index: number): Fixture {
  const direction = rand() < 0.5 ? "long" : "short";
  const n = 20 + Math.floor(rand() * 200);
  const history: Point[] = [];
  let base = 100 + rand() * 100;
  for (let i = 0; i < n; i++) {
    base += (rand() - 0.5) * 3;
    history.push(randomPoint(rand, `2026-01-${String((i % 28) + 1).padStart(2, "0")}-d${index}`, base));
  }
  // Renumber dates so the signal day is last and findable.
  history.forEach((p, i) => { p.date = `d${index}-${String(i).padStart(4, "0")}`; });
  let signalDay: Point | null = history[history.length - 1] ?? null;
  const roll = rand();
  if (roll < 0.08) {
    signalDay = null; // B1: missing signal day
  } else if (roll < 0.16 && signalDay) {
    signalDay = { ...signalDay, low: null }; // B1: incomplete OHLC
  }
  const ref = signalDay?.close ?? 100;
  // Bias the invalidation so all four outcomes occur: sometimes through the
  // signal-day extreme (born-dead), sometimes clear of it.
  const invalidation = direction === "long"
    ? ref + (rand() < 0.4 ? -(rand() * 6) : 2 + rand() * 6)
    : ref + (rand() < 0.4 ? rand() * 6 : -(2 + rand() * 6));
  return { direction, invalidation, signalDay, history };
}

function normalize(d: SignalIssuanceDecision): SignalIssuanceDecision {
  // Round-trip through JSON to normalize -0 / undefined edge cases before compare.
  return JSON.parse(JSON.stringify(d)) as SignalIssuanceDecision;
}

describe("equity gate decomposition: differential vs vendored signalIssuanceDecision", () => {
  it("compose(evaluateEquityBornDead, evaluateEquityShortRegime) ≡ signalIssuanceDecision on 500 random fixtures", () => {
    const rand = mulberry32(20261013);
    let blocked = 0;
    let allowed = 0;
    for (let i = 0; i < 500; i++) {
      const f = randomFixture(rand, i);
      const expected = normalize(signalIssuanceDecision(f.direction, f.invalidation, f.signalDay, f.history));
      const actual = normalize(composeEquityDecision(f.direction, f.invalidation, f.signalDay, f.history));
      assert.deepEqual(actual, expected, `fixture ${i} diverged: ${JSON.stringify(f.signalDay?.date)}`);
      if (expected.allowed) allowed++; else blocked++;
    }
    assert.ok(blocked > 50, `expected a healthy mix of blocks, got ${blocked}/500`);
    assert.ok(allowed > 50, `expected a healthy mix of allows, got ${allowed}/500`);
  });

  it("evaluateEquityBornDead reproduces the exact production reason strings (equity 4-dp rounding)", () => {
    const day: Point = { date: "2026-10-13", open: 100, high: 101, low: 94.12345, close: 100, volume: 1 };
    const v = evaluateEquityBornDead("long", 95.67891, day);
    assert.equal(v.blocked, true);
    assert.equal(v.reason, "born-dead LONG: signal-day low 94.1235 <= invalidation 95.6789");
    const ok = evaluateEquityBornDead("long", 90, day);
    assert.deepEqual(ok, { blocked: false, reason: null });
    const missing = evaluateEquityBornDead("short", 90, null);
    assert.equal(missing.blocked, true);
    assert.match(missing.reason ?? "", /issuance-check unavailable/);
  });

  it("evaluateEquityShortRegime lets longs through and gates shorts on bearish structure", () => {
    const rand = mulberry32(7);
    const history: Point[] = [];
    let base = 200;
    for (let i = 0; i < 80; i++) { // falling history -> bearish structure
      base -= 0.8 + rand();
      history.push(randomPoint(rand, `s-${String(i).padStart(3, "0")}`, base));
    }
    const signalDay = history[history.length - 1]!;
    const longPass = evaluateEquityShortRegime("long", signalDay, history);
    assert.equal(longPass.allowed, true);
    const shortPass = evaluateEquityShortRegime("short", signalDay, history);
    assert.equal(shortPass.allowed, true, `bearish history should pass shorts: ${shortPass.reason}`);

    const rising: Point[] = [];
    let b2 = 100;
    for (let i = 0; i < 80; i++) {
      b2 += 0.9;
      rising.push(randomPoint(rand, `r-${String(i).padStart(3, "0")}`, b2));
    }
    const rDay = rising[rising.length - 1]!;
    const shortBlocked = evaluateEquityShortRegime("short", rDay, rising);
    assert.equal(shortBlocked.allowed, false);
    assert.match(shortBlocked.reason ?? "", /short-regime/);
  });
});
