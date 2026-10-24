export const ISSUANCE_HANDLER_VERSION = "2.1.9";
export const DEPLOYED_PAPER_PATH = "artifact-native discovery handoff -> paper-v219 first-print handler";
export const LEGACY_ISSUER_REACHABLE = false as const;

export const PAPER_SOURCE_HASHES = {
  "orchestrator/src/issuance/handler.ts": "6a9aaf62444fdb880b14ae8345a68ab324037d0c3997db55bde976258ad3db37",
  "entry-v1/src/feed.ts": "14732e2e0931df574763a7bb20d181ddd62acf8247f5737be1531ebff99f481a",
  "entry-v1/src/watcher.ts": "8d8348f98b2a18fe3d61487ef3279a0ca6cd78f76fc24bd77e96b06f3fb6cee1",
  "pilot/src/binance.ts": "227dae4ddb2b8aa5914b9dad3be5b092b59917e5fc53ef5be65c1edb07997b79",
  "pilot/src/shims.d.ts": "9f5472acc22072b9fcb8f90332f975498a58be466a5b76f9cc4dcdd58d2e1024",
  "handoff/src/qualify.ts": "25fb6ab20fb97db0cdce2d17154ed392b05056415bf9f4d13a7bd7862c68b02f",
  "handoff/src/discovery-types.ts": "61533b1296035c313e402c9c9e6a0833d7040e216eb6f947c3d0b266b55dca30",
  "handoff/src/feeds.ts": "b865869809e5e68276089b901281d166724c1918520875edcd72b26291d837c2",
  "handoff/src/handoff-run.ts": "2e921ce68837528684892bd35d7bf8ee5bcf0759d63bb21b9544fc8ffe5a1e28",
  "handoff/src/ledger-store.ts": "0d32e9bc3a6b158ea462eafdd7c382416f80a7ec28c53dfe7e807f9ed769a1de",
  "handoff/src/map-candidate.ts": "fd3cfe24ba7e365c45a81090dcce25280b01e891e9862654d519668fee64ea79",
  "handoff/src/no-legacy.ts": "22c01f1485b2ab3b7ad75bfb8f978db385aa294ebf1f3a8257079f41b5e7dff2",
} as const;

export const PAPER_VERSION_MAPPING = {
  deployedSeries: "paper-pilot-v2.1.6",
  comparisonSeries: "v2.1.6",
  handlerVersion: ISSUANCE_HANDLER_VERSION,
  mappingDocument: "VERSION-MAPPING-2026-10-14.md",
  amendment: "MANIFEST-NOTE-tiebreak-v2.1.9.md",
  handlerHashExpected: PAPER_SOURCE_HASHES["orchestrator/src/issuance/handler.ts"],
  handlerHashMatchesManifest: true,
  semantics: "v2.1.9 entry-observation identity repair; freeze paper-pilot-v2.1.1 (2026-10-20) widens the first-print receipt bound from 5 to 15 minutes to match the 15-minute entry window, prospective only — v2.1.0 candidates keep the 5-minute bound and no voided candidate is reopened; freeze paper-pilot-v2.1.2 (2026-10-20) adds explicit Binance Spot instrument mappings for ALT, AMP, COMP, OSMO, PEPE, PHA and WLD only — the sole delta from v2.1.1, which stays preserved as the comparison arm; freeze paper-pilot-v2.1.3 (2026-10-20) adds explicit MEXC Spot instrument mappings for BP, BR, DGAI, JCT and VEREM only — the sole delta from v2.1.2, which stays preserved as the comparison arm; freeze paper-pilot-v2.1.4 (2026-10-21) adds explicit Binance Spot instrument mappings for ZEC, PUMP, CVX, CRV and RAY only — the sole delta from v2.1.3, which stays preserved as the comparison arm; freeze paper-pilot-v2.1.5 (2026-10-21) adds the explicit Binance Spot instrument mapping for beam-2 (BEAMXUSDT) only — identity guard: the canonical asset is CoinGecko id beam-2 (Beam gaming token, ex-Merit Circle), Ethereum contract 0x62d0a8458ed7719fdaf978fe5929c6d342b0bfce; BEAMX is Binance's venue display ticker for this asset; the pair BEAMUSDT on any venue is the delisted Beam privacy coin (a different asset) and must never be mapped for beam-2; the new mapping applies to future evaluations only and no historical candidate, handoff, or decision rows are re-stamped, re-decided, or rescored — the sole delta from v2.1.4, which stays preserved as the comparison arm; freeze paper-pilot-v2.1.6 (2026-10-23) adds explicit Binance Spot instrument mappings for vaulta (AUSDT), ethena (ENAUSDT), iostoken (IOSTUSDT), prometeus (PROMUSDT), wormhole (WUSDT) and zama (ZAMAUSDT) only, each re-verified live 2026-10-23T18:30:00Z (status TRADING, aggTrades HTTP 200, 1m klines HTTP 200 on data-api.binance.vision) — identity anchors: vaulta is Vaulta (ex-EOS native L1), CoinGecko id vaulta; ethena is Ethereum contract 0x57e114b691db790c35207b2e685d4a43181e6061; iostoken is a native L1 (BSC representation 0xaf48b7e315a52518cfbf7d96c455d9dfad94cb48); prometeus is Ethereum contract 0xfc82bb4ba86045af6f327323a46e80412b91b27d; wormhole is Ethereum contract 0xb0ffa8000886e57f86dd5264b9582b2ad87b2b91; zama is Ethereum contract 0xa12cc123ba206d4031d1c7f6223d1c2ec249f4f3; map by these identity anchors, never by ticker alone — Binance AIUSDT is Sleepless AI (not AI) and LITUSDT is a legacy instrument in BREAK, neither mapped; the new mappings apply to future evaluations only and no historical candidate, handoff, or decision rows are re-stamped, re-decided, or rescored — the sole delta from v2.1.5, which stays preserved as the comparison arm; prediction weights, frozen models, gates, levels, holdouts and evaluator remain unchanged",
} as const;

export const PAPER_DELIVERY_ARCHITECTURE = {
  configured: false,
  scope: "artifact-owned delivery",
  destinationChosen: true,
  destination: "research side chat a685c3e7-c8be-4137-8900-4e899008bca7",
  artifactRole: "Durably commit SETUP_PENDING and ENTRY_CONFIRMED alert rows and expose the slim polling projection through getpaperpilotalerts; the artifact does not send chat messages.",
  workspaceRole: "Agent cron paper-signal-alert-delivery polls getpaperpilotalerts, not the full getpaperpilotstatus diagnostic payload; the one-minute watcher and 15-minute sweep remain operational.",
  deliverySemantics: "Committed alerts remain recoverable in the ledger. Duplicate triggers are suppressed by signal_id + alert_type within the production or test ledger. Outbox acknowledgements reconcile attempts to delivered; ambiguous attempts reconcile to unknown, surface once, and are never auto-retried.",
  acknowledgementPath: "workspace ledger pilot/delivery/alert-delivery-ledger.json plus scheduler.delivery_outbox acknowledgement; ledger records retain signal_id, alert_type, issued_at and sent_at_utc",
  slimWorkerContract: {
    readAction: "getpaperpilotalerts",
    fullStatusActionUsedForPolling: false,
    retainedFields: ["signal_id", "alert_type", "issued_at", "sent_at_utc"],
    safeguards: ["payload schema validation", "issued_at lifecycle and expiry guard", "ledger pre-commit before render", "deduplication on signal_id + alert_type", "UNKNOWN surfaces once and is never auto-retried", "outbox acknowledgement reconciliation", "production and test ledgers remain separate"],
  },
  directTrigger: {
    contractOption: "a",
    status: "unsupported_by_deployed_action_context",
    evaluatedAt: "2026-10-16",
    platformVersion: 25,
    spaceSdkVersion: "0.13.0",
    jobId: "paper-signal-alert-delivery",
    reasonContract: "trigger:<signal_id>/<alert_type>[,...] issued_at=<ISO-8601-UTC>",
    evidence: "The deployed @hatch/space-sdk Ctx exposes agent, inference, tool, db, blobs, invalidateQueries and privileged execution, but no scheduler or cron.run capability. Action-side scheduler dispatch therefore cannot be compiled or deployed through the supported artifact API.",
    safeguards: ["commit alert rows before any trigger", "duplicate triggers must not duplicate notifications", "committed alerts stay recoverable through the ledger", "ambiguous sends reconcile to UNKNOWN and are never auto-retried", "reason contains keys and issued_at only"],
  },
  wrapperFallback: {
    contractOption: "b",
    status: "invocation_blocked_reason_unverified",
    diagnosis: "Repeated wrapper runs computed the post-commit trigger reason but did not invoke cron.run. That establishes the behavior, not an authoritative platform restriction or the worker's self-described cause.",
    evidenceRun: "paper-signals/pilot/delivery/wrapper-runs/run-20261016T130400Z.json",
  },
  activationGate: "Keep discovery_mode=sweep-fallback until deployed evidence shows scheduler invocation recorded, triggered worker ran, outbox acknowledged delivery, and the ledger recorded trigger_source=trigger.",
  missingCapability: "Artifact dispatch is unavailable; wrapper invocation is blocked for an unverified reason; polling remains operational.",
} as const;

export function assertNoLegacyPaperIssuer(): void {
  if (LEGACY_ISSUER_REACHABLE) throw new Error("legacy paper issuer is reachable from the repaired paper path");
}

export type VenueTradePrint = {
  ts: number;
  price: number;
  venue: "binance-spot" | "mexc-spot";
  venueTradeId: string;
  venueSeq: number | null;
};

export function comparePrintsByVenueOrder(a: VenueTradePrint, b: VenueTradePrint): number {
  return a.ts - b.ts || (a.venueSeq ?? 0) - (b.venueSeq ?? 0);
}

async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export type BinanceCoverage = {
  claim: "adapter-established coverage under documented endpoint assumptions";
  venue: "binance-spot" | "mexc-spot";
  symbol: string;
  requestedSinceMs: number;
  requestedUntilMs: number;
  receivedAt: string;
  rawResponseHash: string;
  endpoint: "/api/v3/aggTrades";
  endpointAssumptions: string[];
  paginationLimit: number;
  returnedCount: number;
  earliestReturnedTs: number | null;
  latestReturnedTs: number | null;
  headCoverageEstablished: boolean;
  completeForRequestedRange: boolean;
  paginationExhausted: boolean;
  completenessLimits: string[];
};

export type BinanceHistoryResult = {
  prints: VenueTradePrint[];
  coverage: BinanceCoverage;
  receivedAt: Date;
};

export async function fetchBinanceTradeHistory(symbol: string, sinceMs: number, untilMs: number): Promise<BinanceHistoryResult> {
  const limit = 1000;
  const url = `https://data-api.binance.vision/api/v3/aggTrades?symbol=${encodeURIComponent(symbol)}&startTime=${Math.trunc(sinceMs)}&endTime=${Math.trunc(untilMs)}&limit=${limit}`;
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const raw = await response.text();
  const receivedAt = new Date();
  const rawResponseHash = await sha256Text(raw);
  if (!response.ok) throw new Error(`Binance aggregate-trade history returned HTTP ${response.status}`);
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("Binance aggregate-trade history was not an array");
  const prints: VenueTradePrint[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const venueTradeId = typeof row.a === "string" || typeof row.a === "number" ? String(row.a) : "";
    const venueSeq = Number(row.a);
    const ts = Number(row.T);
    const price = Number(row.p);
    if (!venueTradeId || !Number.isFinite(venueSeq) || !Number.isFinite(ts) || !Number.isFinite(price) || price <= 0) continue;
    prints.push({ ts, price, venue: "binance-spot", venueTradeId, venueSeq });
  }
  prints.sort(comparePrintsByVenueOrder);
  const earliestReturnedTs = prints[0]?.ts ?? null;
  const latestReturnedTs = prints.at(-1)?.ts ?? null;
  const allInsideRequestedRange = prints.every((print) => print.ts >= sinceMs && print.ts <= untilMs);
  // The first-print rule needs head-completeness from startTime, not an
  // exhausted tail. A capped response may omit later prints while still
  // establishing the first eligible print under Binance's documented
  // ascending (timestamp, aggregate-trade-id) endpoint semantics.
  const headCoverageEstablished = allInsideRequestedRange;
  const paginationExhausted = parsed.length < limit;
  const completeForRequestedRange = paginationExhausted && allInsideRequestedRange;
  return {
    prints,
    receivedAt,
    coverage: {
      claim: "adapter-established coverage under documented endpoint assumptions",
      venue: "binance-spot",
      symbol,
      requestedSinceMs: sinceMs,
      requestedUntilMs: untilMs,
      receivedAt: receivedAt.toISOString(),
      rawResponseHash,
      endpoint: "/api/v3/aggTrades",
      endpointAssumptions: [
        "Binance aggTrades startTime/endTime returns aggregate trades in venue execution sequence for the requested range.",
        "Aggregate trade id a is the venue-assigned monotonic sequence and is preserved verbatim as venueTradeId.",
      ],
      paginationLimit: limit,
      returnedCount: prints.length,
      earliestReturnedTs,
      latestReturnedTs,
      headCoverageEstablished,
      completeForRequestedRange,
      paginationExhausted,
      completenessLimits: [
        "A full 1000-row page may truncate the tail, but does not invalidate head-completeness from the requested startTime under the documented ascending-order endpoint assumption.",
        "The adapter proves its request, response hash and pagination check; it cannot prove the venue is honest or complete.",
      ],
    },
  };
}
