/**
 * min-score floor regression: the floor is a STRENGTH floor over |score|.
 *
 * Scores are SIGNED-directional (negative = short direction, magnitude =
 * strength). The gate must compare |score| AFTER direction qualification —
 * direction is already decided upstream on the candidate record and the
 * short-regime veto is a separate, later gate.
 *
 * Pins: (1) default minScore = 0 is genuinely "disabled" for shorts;
 *       (2) equal-strength +X long and -X short receive identical floor
 *       treatment; (3) the handler version records this correction.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { manualClock } from "../src/clock.js";
import type { Clock } from "../src/clock.js";
import { DbStore } from "../src/persistence/db-store.js";
import {
  ISSUANCE_HANDLER_VERSION,
  integratedManualIssue,
  type IntegratedDeps,
} from "../src/issuance/handler.js";
import { integratedCryptoCandidate } from "./fixtures.js";

const T = Date.parse("2026-10-14T04:00:00.000Z");

type MutableTestClock = Clock & { advance(ms: number): void; set(ms: number): void };

function makeCtx(minScore: number): { deps: IntegratedDeps; clock: MutableTestClock } {
  const store = new DbStore(":memory:");
  const clock = manualClock(T);
  const deps: IntegratedDeps = {
    store,
    clock,
    config: { freshnessMs: 24 * 3_600_000, minScore },
  };
  return { deps, clock };
}

async function run(deps: IntegratedDeps, score: number, direction: "long" | "short", symbol: string) {
  const input = integratedCryptoCandidate({ score, direction, symbol });
  return integratedManualIssue(deps, input, `minscore-reg-${symbol}`);
}

describe("min-score |score| floor (v2.1.6 correction)", () => {
  it("handler version records the correction", () => {
    assert.equal(ISSUANCE_HANDLER_VERSION, "2.1.9");
  });

  it("default minScore = 0 is disabled for a strong short (old code rejected it)", async () => {
    const { deps } = makeCtx(0);
    const rec = await run(deps, -73, "short", "MSF1");
    // The floor must NOT fire. It may still be vetoed downstream (short-regime
    // / issuance-veto are real, later gates) — the point is it is not a
    // sign artifact.
    assert.notEqual(rec.outcome?.gate, "min-score",
      `short score -73 must pass a disabled floor; got: ${rec.outcome?.reason}`);
  });

  it("equal strength, below a non-zero floor: +40 long and -40 short both abstain", async () => {
    const { deps } = makeCtx(50);
    const recLong = await run(deps, 40, "long", "MSF2L");
    const recShort = await run(deps, -40, "short", "MSF2S");
    assert.equal(recLong.outcome?.gate, "min-score", `+40 long: ${recLong.outcome?.reason}`);
    assert.equal(recShort.outcome?.gate, "min-score", `-40 short: ${recShort.outcome?.reason}`);
  });

  it("equal strength, above a non-zero floor: +60 long and -60 short both pass the floor", async () => {
    const { deps } = makeCtx(50);
    const recLong = await run(deps, 60, "long", "MSF3L");
    const recShort = await run(deps, -60, "short", "MSF3S");
    assert.notEqual(recLong.outcome?.gate, "min-score",
      `+60 long must pass the floor; got: ${recLong.outcome?.reason}`);
    assert.notEqual(recShort.outcome?.gate, "min-score",
      `-60 short must pass the floor; got: ${recShort.outcome?.reason}`);
  });

  it("exact boundary: |score| == minScore passes (floor is strictly below)", async () => {
    const { deps } = makeCtx(50);
    const rec = await run(deps, -50, "short", "MSF4");
    assert.notEqual(rec.outcome?.gate, "min-score",
      `-50 short at floor 50 must pass; got: ${rec.outcome?.reason}`);
  });
});
