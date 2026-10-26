// paper-pilot-v2.1.7 — bounded Binance Spot admission pilot (ACTIVATED
// prospectively 2026-10-26 under Logan's 2026-10-25 approval, after the
// repair build's preflight passed: certification "complete"→"completed"
// normalization, notification 621 resolved as coverage-gap/expired-
// unissued, the live workload rehearsal at 22 evaluated / 6 deferred in
// 28,903 ms total (4 ms pure scoring) against the 120,000 ms budget with
// 57 external calls counted separately from 28 stored reads, the
// paper-path freshness gate unit-tested in isolation, and the
// "Stored evidence reads" label shipped).
//
// THE ONE CHANGE from v2.1.6: discovery full scoring gains a THIRD
// admission lane alongside saved-T1 and the 48H velocity lane — an asset
// in the frozen Binance pilot universe below, present in the run's
// catalog, enters full scoring. Everything downstream is UNCHANGED:
// venue gate first, production threshold ≥ 60 with ≤ 1 severe fail among
// the first five dimensions, PAPER_MIN_SCORE floor, frozen levels and
// entry contract, the 900,000 ms first-print receipt bound, the
// 15-minute entry window, the 50 bps drift bound, frozen-level
// validation, monitoring requirements, challenger ≥ 45 never gating
// issuance, prospective only, no backfill, MEXC research-only for
// issuance venue purposes (existing MEXC mappings unchanged).
//
// THE FROZEN UNIVERSE is the verified, currently present Binance set
// from the 2026-10-26 rehearsal: 28 instruments present in the catalog.
// It is a RECORDED set, not a target count: the provisional list held 29
// and BEAMX is NOT in the pilot universe because beam-2 was absent from
// the catalog at verification. Adding BEAMX — or any other asset —
// later is its own versioned change; the universe never changes
// silently mid-review. HYPE stays out (no Binance Spot instrument, pair
// null). The quant-network MEXC Spot mapping (2026-10-26) is a SEPARATE
// versioned mapping change and is NOT part of this Binance pilot
// admission set; grass was not mapped (identity unproven) and is not in
// the set. OSMO / PHA / IOST carry Binance mappings from earlier freezes
// but were not in the verified present pilot set, so they do not enter
// through this lane (they still enter via T1 / velocity as before).
//
// PER-RUN RECORDING: every discovery run under this freeze records the
// admission version, this frozen universe, which members were present
// in that run's catalog, which present members were pilot-only
// admissions, and a disposition for every member — present members take
// their scan disposition (emitted / suppressed / excluded / failed);
// a member absent from the catalog is explicitly deferred with that
// reason, never silently dropped and never read as a model abstention.
// A legitimate zero-issue review run is acceptable: the pilot tests
// broader evaluation and operational reliability, not entries.

export const PILOT_V217_VERSION = "paper-pilot-v2.1.7" as const;
export const PILOT_V217_ACTIVATED_AT = "2026-10-26T19:06:00Z" as const;
export const PILOT_V217_SUPERSEDES = "paper-pilot-v2.1.6" as const;

export type PilotUniverseEntry = { coinId: string; symbol: string; instrument: string };

/** The frozen v2.1.7 pilot universe: the 28 verified Binance Spot
 * instruments present in the catalog at the 2026-10-26 verification,
 * each anchored to its canonical CoinGecko identity in COVERAGE. */
export const PILOT_V217_BINANCE_UNIVERSE: ReadonlyArray<PilotUniverseEntry> = [
  { coinId: "altlayer", symbol: "ALT", instrument: "ALTUSDT" },
  { coinId: "amp-token", symbol: "AMP", instrument: "AMPUSDT" },
  { coinId: "avalanche-2", symbol: "AVAX", instrument: "AVAXUSDT" },
  { coinId: "basic-attention-token", symbol: "BAT", instrument: "BATUSDT" },
  { coinId: "bitcoin", symbol: "BTC", instrument: "BTCUSDT" },
  { coinId: "cardano", symbol: "ADA", instrument: "ADAUSDT" },
  { coinId: "chainlink", symbol: "LINK", instrument: "LINKUSDT" },
  { coinId: "compound-governance-token", symbol: "COMP", instrument: "COMPUSDT" },
  { coinId: "convex-finance", symbol: "CVX", instrument: "CVXUSDT" },
  { coinId: "curve-dao-token", symbol: "CRV", instrument: "CRVUSDT" },
  { coinId: "dogecoin", symbol: "DOGE", instrument: "DOGEUSDT" },
  { coinId: "ethena", symbol: "ENA", instrument: "ENAUSDT" },
  { coinId: "ethereum", symbol: "ETH", instrument: "ETHUSDT" },
  { coinId: "layerzero", symbol: "ZRO", instrument: "ZROUSDT" },
  { coinId: "near", symbol: "NEAR", instrument: "NEARUSDT" },
  { coinId: "pepe", symbol: "PEPE", instrument: "PEPEUSDT" },
  { coinId: "prometeus", symbol: "PROM", instrument: "PROMUSDT" },
  { coinId: "pump-fun", symbol: "PUMP", instrument: "PUMPUSDT" },
  { coinId: "pyth-network", symbol: "PYTH", instrument: "PYTHUSDT" },
  { coinId: "raydium", symbol: "RAY", instrument: "RAYUSDT" },
  { coinId: "ripple", symbol: "XRP", instrument: "XRPUSDT" },
  { coinId: "solana", symbol: "SOL", instrument: "SOLUSDT" },
  { coinId: "sui", symbol: "SUI", instrument: "SUIUSDT" },
  { coinId: "vaulta", symbol: "A", instrument: "AUSDT" },
  { coinId: "worldcoin-wld", symbol: "WLD", instrument: "WLDUSDT" },
  { coinId: "wormhole", symbol: "W", instrument: "WUSDT" },
  { coinId: "zama", symbol: "ZAMA", instrument: "ZAMAUSDT" },
  { coinId: "zcash", symbol: "ZEC", instrument: "ZECUSDT" },
];

/** Explicitly NOT in the pilot universe, with the recorded reason. Any
 * future inclusion is a separate versioned change, never a silent edit. */
export const PILOT_V217_EXCLUSIONS: ReadonlyArray<{ symbol: string; reason: string }> = [
  { symbol: "BEAMX", reason: "beam-2 carries a verified Binance Spot instrument (BEAMXUSDT) but was absent from the catalog at the 2026-10-26 verification — the verified present set is 28, not the provisional 29" },
  { symbol: "HYPE", reason: "hyperliquid has no Binance Spot instrument (COVERAGE pair is null) — stays research-visible, never admitted through this lane" },
  { symbol: "QNT", reason: "quant-network's MEXC Spot mapping (2026-10-26) is a separate versioned mapping change, not part of the Binance pilot admission set" },
  { symbol: "GRASS", reason: "grass was not mapped — MEXC contract does not match the canonical Solana mint, so asset identity is unproven" },
  { symbol: "OSMO", reason: "osmosis carries an earlier Binance mapping but was not in the verified present pilot set; it still enters via T1 / velocity as before" },
  { symbol: "PHA", reason: "pha carries an earlier Binance mapping but was not in the verified present pilot set; it still enters via T1 / velocity as before" },
  { symbol: "IOST", reason: "iostoken carries an earlier Binance mapping but was not in the verified present pilot set; it still enters via T1 / velocity as before" },
];

export const PILOT_V217_COIN_IDS: ReadonlySet<string> = new Set(PILOT_V217_BINANCE_UNIVERSE.map((entry) => entry.coinId));

export type AdmissionLane = "t1" | "velocity" | "binance_pilot" | "t1+velocity" | "t1+binance_pilot" | "velocity+binance_pilot" | "t1+velocity+binance_pilot" | "none";

/** The admission lane(s) a catalog asset enters full scoring through.
 * T1 and velocity keep their exact v2.1.6 meanings; binance_pilot is
 * the sole v2.1.7 addition. */
export function admissionLaneFor(args: { coinId: string; tier1Ids: ReadonlySet<string>; velocityIds: ReadonlySet<string> }): AdmissionLane {
  const lanes: string[] = [];
  if (args.tier1Ids.has(args.coinId)) lanes.push("t1");
  if (args.velocityIds.has(args.coinId)) lanes.push("velocity");
  if (PILOT_V217_COIN_IDS.has(args.coinId)) lanes.push("binance_pilot");
  return (lanes.length ? lanes.join("+") : "none") as AdmissionLane;
}

export function isPilotOnlyAdmission(args: { coinId: string; tier1Ids: ReadonlySet<string>; velocityIds: ReadonlySet<string> }): boolean {
  return PILOT_V217_COIN_IDS.has(args.coinId) && !args.tier1Ids.has(args.coinId) && !args.velocityIds.has(args.coinId);
}

export type PilotAssetDisposition = {
  coinId: string;
  symbol: string;
  instrument: string;
  presentInCatalog: boolean;
  pilotOnlyAdmission: boolean;
  /** Scan disposition for present members; "deferred_not_in_catalog"
   * for absent members (explicit deferral, never an abstention). */
  disposition: string;
  stage: string;
  reason: string;
};

export type PilotRunRecord = {
  version: typeof PILOT_V217_VERSION;
  activatedAt: string;
  universe: PilotUniverseEntry[];
  universeCount: number;
  presentSymbols: string[];
  missingDeferredSymbols: string[];
  pilotOnlyAdmittedSymbols: string[];
  evaluatedCount: number;
  deferredCount: number;
  unexplainedOmissions: number;
  dispositions: PilotAssetDisposition[];
};

/** Build the per-run pilot record. `scanDispositionByCoinId` carries the
 * run's own scan-item disposition for every scan-universe asset; a
 * present pilot member without one is an UNEXPLAINED OMISSION and is
 * counted as such — the review fails on it rather than hiding it. */
export function buildPilotRunRecord(args: {
  catalogCoinIds: ReadonlySet<string>;
  tier1Ids: ReadonlySet<string>;
  velocityIds: ReadonlySet<string>;
  scanDispositionByCoinId: ReadonlyMap<string, { status: string; stage: string; reason: string }>;
}): PilotRunRecord {
  const dispositions: PilotAssetDisposition[] = [];
  let unexplainedOmissions = 0;
  let evaluatedCount = 0;
  let deferredCount = 0;
  for (const entry of PILOT_V217_BINANCE_UNIVERSE) {
    const presentInCatalog = args.catalogCoinIds.has(entry.coinId);
    const pilotOnlyAdmission = presentInCatalog && isPilotOnlyAdmission({ coinId: entry.coinId, tier1Ids: args.tier1Ids, velocityIds: args.velocityIds });
    if (!presentInCatalog) {
      deferredCount++;
      dispositions.push({
        ...entry, presentInCatalog: false, pilotOnlyAdmission: false,
        disposition: "deferred_not_in_catalog", stage: "pilot_admission",
        reason: "Frozen paper-pilot-v2.1.7 universe asset not present in this run's catalog — explicitly deferred (not evaluated this run); never silently dropped and never read as a model abstention.",
      });
      continue;
    }
    const scan = args.scanDispositionByCoinId.get(entry.coinId);
    if (!scan) {
      unexplainedOmissions++;
      dispositions.push({
        ...entry, presentInCatalog: true, pilotOnlyAdmission,
        disposition: "unexplained_omission", stage: "pilot_admission",
        reason: "Present in the catalog and admitted to the scan universe but no scan disposition was recorded — an unexplained omission the first-three-runs review must flag, not a model abstention.",
      });
      continue;
    }
    evaluatedCount++;
    dispositions.push({ ...entry, presentInCatalog: true, pilotOnlyAdmission, disposition: scan.status, stage: scan.stage, reason: scan.reason });
  }
  return {
    version: PILOT_V217_VERSION,
    activatedAt: PILOT_V217_ACTIVATED_AT,
    universe: PILOT_V217_BINANCE_UNIVERSE.map((entry) => ({ ...entry })),
    universeCount: PILOT_V217_BINANCE_UNIVERSE.length,
    presentSymbols: dispositions.filter((row) => row.presentInCatalog).map((row) => row.symbol),
    missingDeferredSymbols: dispositions.filter((row) => !row.presentInCatalog).map((row) => row.symbol),
    pilotOnlyAdmittedSymbols: dispositions.filter((row) => row.pilotOnlyAdmission).map((row) => row.symbol),
    evaluatedCount,
    deferredCount,
    unexplainedOmissions,
    dispositions,
  };
}

export const PILOT_V217_REVIEW_REQUIRED_RUNS = 3;

/** First-three-runs review plan (fixed at activation; the universe does
 * not change mid-review). A run counts toward the review when it
 * completed under admission version paper-pilot-v2.1.7 with a recorded
 * pilot record. Zero issued entries is an acceptable outcome when every
 * admitted candidate was evaluated or explicitly deferred. */
export const PILOT_V217_REVIEW_PLAN = {
  requiredRuns: PILOT_V217_REVIEW_REQUIRED_RUNS,
  admissionVersion: PILOT_V217_VERSION,
  universeFrozen: true,
  perRunChecks: [
    "eligible assets (the recorded frozen universe) and which were present in the run's catalog",
    "actually evaluated vs explicitly deferred, with the deferral reason for each deferred asset",
    "unavailable inputs and their approved treatment (optional unavailable = contribution 0; required missing/stale = deferral)",
    "production decisions under the unchanged ≥60 / ≤1 severe-fail rule — a legitimate zero-issue result is acceptable",
    "runtime against the discovery stage budgets, with any budget deferral named per candidate",
    "any resulting entries, with first-entry enrollment and settlement tracked as post-activation checks by name — never manufactured and never a reopened expired window",
  ],
  passRule: "All three runs recorded with zero unexplained omissions: every admitted candidate evaluated or explicitly deferred.",
} as const;

export type PilotReviewRunInput = {
  runId: number;
  status: string;
  record: PilotRunRecord | null;
  issuedCount: number | null;
};

export function summarizePilotReview(runs: PilotReviewRunInput[]): {
  requiredRuns: number;
  completedRuns: number;
  reviewComplete: boolean;
  totalUnexplainedOmissions: number;
  totalEvaluated: number;
  totalDeferred: number;
  totalIssued: number;
  verdict: string;
  runs: Array<{ runId: number; status: string; evaluated: number; deferred: number; pilotOnlyAdmitted: number; unexplainedOmissions: number; issued: number | null; recorded: boolean }>;
} {
  const counted = runs.slice(0, PILOT_V217_REVIEW_REQUIRED_RUNS);
  const rows = counted.map((run) => ({
    runId: run.runId,
    status: run.status,
    evaluated: run.record?.evaluatedCount ?? 0,
    deferred: run.record?.deferredCount ?? 0,
    pilotOnlyAdmitted: run.record?.pilotOnlyAdmittedSymbols.length ?? 0,
    unexplainedOmissions: run.record?.unexplainedOmissions ?? 0,
    issued: run.issuedCount,
    recorded: run.record !== null,
  }));
  const totalUnexplainedOmissions = rows.reduce((sum, row) => sum + row.unexplainedOmissions, 0);
  const unrecorded = rows.filter((row) => !row.recorded).length;
  const reviewComplete = rows.length >= PILOT_V217_REVIEW_REQUIRED_RUNS && unrecorded === 0;
  const verdict = rows.length === 0
    ? "No natural run has completed under paper-pilot-v2.1.7 yet — the first-three-runs review is pending by name."
    : !reviewComplete
      ? `${rows.length} of ${PILOT_V217_REVIEW_REQUIRED_RUNS} review runs completed — review in progress; the frozen universe does not change mid-review.`
      : totalUnexplainedOmissions > 0
        ? `Review complete with ${totalUnexplainedOmissions} unexplained omission(s) — NOT a pass; each omission must be explained before the pilot is called reliable.`
        : "Review complete: all three runs recorded, every admitted candidate evaluated or explicitly deferred, zero unexplained omissions. A zero-issue outcome across these runs is a legitimate pass.";
  return {
    requiredRuns: PILOT_V217_REVIEW_REQUIRED_RUNS,
    completedRuns: rows.length,
    reviewComplete,
    totalUnexplainedOmissions,
    totalEvaluated: rows.reduce((sum, row) => sum + row.evaluated, 0),
    totalDeferred: rows.reduce((sum, row) => sum + row.deferred, 0),
    totalIssued: rows.reduce((sum, row) => sum + (row.issued ?? 0), 0),
    verdict,
    runs: rows,
  };
}
