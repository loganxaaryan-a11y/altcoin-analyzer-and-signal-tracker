import { describe, expect, test } from "bun:test";
import { detectFundingBundles, normalizeRugCheck, panelVerdict, type HolderFunding } from "./meme-risk";

function holder(wallet: string, funder: string | null, supplyPct: number, overrides: Partial<HolderFunding> = {}): HolderFunding {
  return { wallet, funder, supplyPct, amount: supplyPct * 1_000, funderBalanceSol: 100, onCurve: true, fundingStatus: funder ? "found" : "none", ...overrides };
}

describe("meme risk deterministic controls", () => {
  test("positive control: five linked wallets trip the bundle veto", () => {
    const rows = Array.from({ length: 5 }, (_, index) => holder(`wallet-${index}`, "shared-funder", 1.1));
    const result = detectFundingBundles(rows);
    expect(result.bundled).toBe(true);
    expect(result.veto).toBe(true);
    expect(result.largestCluster?.walletCount).toBe(5);
    expect(panelVerdict({ rugcheck: "clean", bundle: result.status, concentration: "clean", rugVeto: false, bundleVeto: result.veto })).toBe("DISQUALIFIED");
  });

  test("positive control: two linked wallets controlling ten percent trip the veto", () => {
    const result = detectFundingBundles([holder("a", "shared", 6), holder("b", "shared", 4.2)]);
    expect(result.bundled).toBe(true);
    expect(result.largestCluster?.supplyPct).toBeCloseTo(10.2);
  });

  test("negative control: a clean major fixture passes three measured inputs", () => {
    const bundle = detectFundingBundles(Array.from({ length: 8 }, (_, index) => holder(`major-${index}`, `funder-${index}`, 0.3)));
    const rug = normalizeRugCheck({ score_normalised: 1, risks: [], rugged: false }, { mintAuthority: null, freezeAuthority: null, topHolders: [{ pct: 0.4 }], markets: [{ lp: { lpLockedPct: 100 } }] }, true);
    expect(bundle.status).toBe("clean");
    expect(rug.status).toBe("clean");
    expect(panelVerdict({ rugcheck: rug.status, bundle: bundle.status, concentration: "clean", rugVeto: rug.veto, bundleVeto: bundle.veto })).toBe("PASS");
  });

  test("CEX-funded wallets do not false-cluster", () => {
    const rows = Array.from({ length: 8 }, (_, index) => holder(`wallet-${index}`, "cex-hot", 2, { funderBalanceSol: 7_500 }));
    const result = detectFundingBundles(rows);
    expect(result.bundled).toBe(false);
    expect(result.excludedExchangeFunders).toBe(8);
  });

  test("unreachable RugCheck stays UNVERIFIED, never clean", () => {
    const rug = normalizeRugCheck(null, null, false);
    expect(rug.status).toBe("unverified");
    expect(panelVerdict({ rugcheck: rug.status, bundle: "clean", concentration: "clean", rugVeto: false, bundleVeto: false })).toBe("UNVERIFIED");
  });

  test("named RugCheck warnings plus cautionary concentration never render clean", () => {
    const rug = normalizeRugCheck(
      { score_normalised: 12, risks: [{ name: "Low liquidity", level: "warn", description: "Thin exit liquidity" }], rugged: false },
      { mintAuthority: null, freezeAuthority: null },
      false,
    );
    expect(rug.status).toBe("caution");
    expect(panelVerdict({ rugcheck: rug.status, bundle: "clean", concentration: "caution", rugVeto: rug.veto, bundleVeto: false })).toBe("CAUTION");
  });

  test("wallet with no funding history remains unresolved", () => {
    const result = detectFundingBundles([holder("new-wallet", null, 3)]);
    expect(result.status).toBe("unverified");
    expect(result.summary).toContain("UNVERIFIED");
  });

  test("enabled mint authority vetoes a claimed-renounced token", () => {
    const rug = normalizeRugCheck({ score_normalised: 20, risks: [], rugged: false }, { mintAuthority: "authority-wallet", freezeAuthority: null }, true);
    expect(rug.veto).toBe(true);
    expect(rug.status).toBe("critical");
  });
});
