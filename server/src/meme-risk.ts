export type RiskStatus = "clean" | "caution" | "critical" | "unverified";
export type PanelVerdict = "PASS" | "CAUTION" | "DISQUALIFIED" | "UNVERIFIED";

export type HolderFunding = {
  wallet: string;
  amount: number;
  supplyPct: number;
  funder: string | null;
  funderBalanceSol: number | null;
  onCurve: boolean;
  fundingStatus: "found" | "none" | "unverified";
};

export type BundleCluster = {
  funder: string;
  walletCount: number;
  supplyPct: number;
  wallets: string[];
};

export type BundleResult = {
  status: RiskStatus;
  bundled: boolean;
  veto: boolean;
  checkedWallets: number;
  unresolvedWallets: number;
  excludedOffCurve: number;
  excludedExchangeFunders: number;
  clusters: BundleCluster[];
  largestCluster: BundleCluster | null;
  summary: string;
};

/**
 * Funding-source clustering adapted from CrawlHive's scan-bundles.ts.
 * Original project: github.com/h100envy/crawl-hive (MIT), credit @h100envy.
 * A shared funder is only actionable when it is not a likely exchange hot wallet.
 */
export function detectFundingBundles(rows: HolderFunding[], options: { minWallets?: number; minSupplyPct?: number; exchangeSolThreshold?: number } = {}): BundleResult {
  const minWallets = options.minWallets ?? 5;
  const minSupplyPct = options.minSupplyPct ?? 10;
  const exchangeSolThreshold = options.exchangeSolThreshold ?? 5_000;
  const groups = new Map<string, HolderFunding[]>();
  let unresolvedWallets = 0;
  let excludedOffCurve = 0;
  let excludedExchangeFunders = 0;
  for (const row of rows) {
    if (!row.onCurve) { excludedOffCurve += 1; continue; }
    if (row.fundingStatus !== "found" || !row.funder) { unresolvedWallets += 1; continue; }
    if (row.funderBalanceSol !== null && row.funderBalanceSol >= exchangeSolThreshold) { excludedExchangeFunders += 1; continue; }
    const group = groups.get(row.funder) ?? [];
    group.push(row);
    groups.set(row.funder, group);
  }
  const clusters = [...groups.entries()].map(([funder, members]) => ({
    funder,
    walletCount: members.length,
    supplyPct: members.reduce((sum, row) => sum + Math.max(0, row.supplyPct), 0),
    wallets: members.map((row) => row.wallet),
  })).filter((cluster) => cluster.walletCount >= 2).sort((a, b) => b.supplyPct - a.supplyPct || b.walletCount - a.walletCount);
  const largestCluster = clusters[0] ?? null;
  const bundled = clusters.some((cluster) => cluster.walletCount >= minWallets || cluster.supplyPct >= minSupplyPct);
  const checkedWallets = rows.length - unresolvedWallets - excludedOffCurve;
  const status: RiskStatus = bundled ? "critical" : checkedWallets === 0 ? "unverified" : unresolvedWallets > 0 ? "caution" : "clean";
  return {
    status,
    bundled,
    veto: bundled,
    checkedWallets,
    unresolvedWallets,
    excludedOffCurve,
    excludedExchangeFunders,
    clusters,
    largestCluster,
    summary: bundled
      ? `BUNDLED: ${largestCluster?.walletCount ?? 0} linked wallets control ${Number(largestCluster?.supplyPct ?? 0).toFixed(2)}% of supply.`
      : status === "unverified"
        ? "UNVERIFIED: no usable holder funding histories were returned."
        : `No qualifying bundle found across ${checkedWallets} checked top-holder wallets${unresolvedWallets ? `; ${unresolvedWallets} unresolved` : ""}.`,
  };
}

export type RugCheckResult = {
  status: RiskStatus;
  score: number | null;
  rugged: boolean | null;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  lpLockedPct: number | null;
  topHolderPct: number | null;
  risks: Array<{ name: string; level: string; description: string }>;
  veto: boolean;
  summary: string;
};

function finite(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}
function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function text(value: unknown): string | null { return typeof value === "string" && value.trim() ? value.trim() : null; }

export function normalizeRugCheck(summaryRaw: unknown, reportRaw: unknown, claimsRenounced: boolean): RugCheckResult {
  const summary = object(summaryRaw);
  const report = object(reportRaw);
  const score = finite(summary.score_normalised ?? summary.scoreNormalized ?? report.score_normalised ?? report.scoreNormalized ?? report.score);
  const rugged = typeof summary.rugged === "boolean" ? summary.rugged : typeof report.rugged === "boolean" ? report.rugged : null;
  const mintAuthority = text(report.mintAuthority ?? object(report.token).mintAuthority);
  const freezeAuthority = text(report.freezeAuthority ?? object(report.token).freezeAuthority);
  const markets = array(report.markets).map(object);
  const lockers = markets.flatMap((market) => array(market.lp?.toString ? object(market.lp).lpLockedPct : null));
  const lpCandidates = [report.lpLockedPct, report.lp_locked_pct, ...markets.map((market) => object(market.lp).lpLockedPct), ...lockers];
  const lpLockedPct = lpCandidates.map(finite).find((value): value is number => value !== null) ?? null;
  const holders = array(report.topHolders).map(object);
  const topHolderPct = holders.reduce((sum, holder) => sum + Math.max(0, finite(holder.pct ?? holder.percentage) ?? 0), 0) || null;
  const risks = array(summary.risks ?? report.risks).map((raw) => { const row = object(raw); return { name: text(row.name) ?? "Unnamed risk", level: text(row.level) ?? "unknown", description: text(row.description ?? row.value) ?? "No detail supplied" }; });
  const criticalNamed = risks.some((risk) => /rugged|honeypot|mint authority|freeze authority/i.test(`${risk.name} ${risk.description}`) && /danger|critical|high/i.test(risk.level));
  const authorityContradiction = claimsRenounced && Boolean(mintAuthority || freezeAuthority);
  const veto = rugged === true || criticalNamed || authorityContradiction;
  const status: RiskStatus = veto ? "critical" : score === null ? "unverified" : risks.length > 0 || score >= 60 ? "caution" : "clean";
  return { status, score, rugged, mintAuthority, freezeAuthority, lpLockedPct, topHolderPct, risks, veto, summary: veto ? authorityContradiction ? "Critical authority contradiction: the token was described as renounced, but an authority remains enabled." : "RugCheck returned a critical risk witness." : score === null ? "UNVERIFIED: RugCheck did not return a usable score." : `RugCheck risk ${score.toFixed(0)}/100${risks.length ? ` with ${risks.length} named flag${risks.length === 1 ? "" : "s"}` : "; no named flags returned"}.` };
}

export function panelVerdict(inputs: { rugcheck: RiskStatus; bundle: RiskStatus; concentration: RiskStatus; rugVeto: boolean; bundleVeto: boolean }): PanelVerdict {
  if (inputs.rugVeto || inputs.bundleVeto) return "DISQUALIFIED";
  if ([inputs.rugcheck, inputs.bundle, inputs.concentration].includes("unverified")) return "UNVERIFIED";
  if ([inputs.rugcheck, inputs.bundle, inputs.concentration].includes("caution")) return "CAUTION";
  return "PASS";
}
