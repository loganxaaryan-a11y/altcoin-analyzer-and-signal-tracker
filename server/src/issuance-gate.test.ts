import { describe, expect, test } from "bun:test";
import { bandKeyForScore, resolveBandIssuanceState } from "./issuance-gate";

describe("issuance kill gate", () => {
  const uncalibrated = { bandKey: "50–64", killFlag: false, status: "uncalibrated" as const, sampleSize: 0, expectancyR: null };
  test("statistics never disable issuance", () => {
    expect(resolveBandIssuanceState({ ...uncalibrated, killFlag: true, status: "limited", sampleSize: 12, expectancyR: -0.4 }, null).state).toBe("WARNING");
    expect(resolveBandIssuanceState(uncalibrated, null).state).toBe("WARNING");
  });
  test("only an explicit disabled row disables", () => {
    const resolved = resolveBandIssuanceState(uncalibrated, { band: "50–64", state: "ISSUANCE_DISABLED", reason: "authorized test", setBy: "TEST", setAt: new Date("2026-10-15T00:00:00Z") });
    expect(resolved.state).toBe("ISSUANCE_DISABLED");
  });
  test("score bands preserve the frozen boundaries", () => {
    expect([49.9, 50, 65, 80].map(bandKeyForScore)).toEqual(["0–49", "50–64", "65–79", "80–100"]);
  });
});
