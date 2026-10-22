/**
 * DRIFT CHECK — fails if any vendored source range changed upstream.
 *
 * For each unit in tests/drift-hashes.json this test re-reads the terminal
 * source file, slices the exact recorded line ranges, hashes them, and
 * compares to the hash captured at vendor time (2026-10-13). Any upstream
 * edit — even whitespace — fails loudly, forcing a deliberate re-vendor +
 * re-verification of the sandbox copies in src/gates/.
 *
 * It also asserts the live-imported measurement.ts still exports the
 * functions the sandbox equity issuer depends on.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
// At runtime `here` is dist/paper-signals/orchestrator/tests; the terminal
// source tree lives at <research-terminal>/hidden_files (6 levels up).
const SRC_ROOT = resolve(here, "..", "..", "..", "..", "..", "..", "hidden_files", "source-export-2026-10-13");
// drift-hashes.json is a source-tree file (not emitted to dist).
const PROJECT_ROOT = resolve(here, "..", "..", "..", "..");

interface DriftUnit { file: string; ranges: [number, number][]; sha256: string; note: string }

function sha256Hex(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

describe("drift check: vendored gate sources unchanged", () => {
  const units: DriftUnit[] = JSON.parse(readFileSync(resolve(PROJECT_ROOT, "tests", "drift-hashes.json"), "utf8"));
  assert.ok(units.length > 0, "drift-hashes.json must list vendored units");

  for (const unit of units) {
    it(`source unchanged: ${unit.file} (${unit.note.slice(0, 60)}…)`, () => {
      const lines = readFileSync(resolve(SRC_ROOT, unit.file), "utf8").split("\n");
      const blob = unit.ranges.map(([s, e]) => lines.slice(s - 1, e).join("\n")).join("\n");
      assert.equal(sha256Hex(blob), unit.sha256,
        `DRIFT DETECTED in ${unit.file}: a vendored range changed upstream. ` +
        `Re-vendor src/gates/* from the new source, re-verify, and regenerate tests/drift-hashes.json.`);
    });
  }

  it("live-imported measurement.ts still exports the issuer's functions", async () => {
    const mod = await import("../src/gates/imported-gates.js");
    assert.equal(typeof mod.reconstructAndValidateEquityCandidate, "function");
    assert.equal(typeof mod.evaluateEquityIssuanceGate, "function");
    assert.equal(typeof mod.computeEquityDecisionFromRawInputs, "function");
  });
});
