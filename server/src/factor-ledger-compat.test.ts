import { describe, expect, test } from "bun:test";
import { adaptFactorLedger } from "./actions";

const complete = { label: "Chart", reading: "Bullish", value: "+1", score: 1, weight: 20, contribution: 20, source: "fixture", asOf: "2026-10-12T10:00:00.000Z", quality: "live" };

describe("factor ledger backward-compatible read adapter", () => {
  test("preserves a historical null note without rejecting the signal", () => {
    const result = adaptFactorLedger(JSON.stringify([{ ...complete, note: null }]));
    expect(result.version).toBe("legacy-array-v0");
    expect(result.integrity).toBe("adapted");
    expect(result.factors).toHaveLength(1);
    expect(result.factors[0]?.note).toBeNull();
  });

  test("reads a versioned envelope and preserves valid current factors", () => {
    const result = adaptFactorLedger(JSON.stringify({ version: "factor-ledger-v2", factors: [{ ...complete, note: "Owned observation" }] }));
    expect(result.version).toBe("factor-ledger-v2");
    expect(result.integrity).toBe("valid");
    expect(result.factors[0]?.contribution).toBe(20);
  });

  test("marks missing and malformed evidence explicitly instead of inventing it", () => {
    const missing = adaptFactorLedger(JSON.stringify([]));
    expect(missing.integrity).toBe("malformed");
    expect(missing.factors).toEqual([]);
    expect(missing.issues[0]).toContain("missing or empty");

    const partial = adaptFactorLedger(JSON.stringify([{ label: "Funding", note: null }]));
    expect(partial.integrity).toBe("malformed");
    expect(partial.factors).toEqual([]);
    expect(partial.issues[0]).toContain("inspection-only");

    const emptyObject = adaptFactorLedger("[{}]");
    expect(emptyObject.integrity).toBe("malformed");
    expect(emptyObject.factors).toEqual([]);
    expect(emptyObject.issues.join(" ")).toContain("label");
  });

  test("reports unreadable JSON as malformed", () => {
    const result = adaptFactorLedger("{not-json");
    expect(result.integrity).toBe("malformed");
    expect(result.issues[0]).toContain("not valid JSON");
  });
});
