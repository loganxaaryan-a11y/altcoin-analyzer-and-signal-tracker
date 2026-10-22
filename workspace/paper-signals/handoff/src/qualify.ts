/**
 * Discovery -> paper qualification handoff (sandbox).
 *
 * Per discovery run:
 *   0. Runtime guard: assertNoLegacyIssuer() + repaired-path identity check.
 *      The ONLY issuance entry callable here is processIntegratedCandidate
 *      from orchestrator/src/issuance/handler.ts (entry-v1 contract +
 *      waiting-interval veto + venue mapping). The legacy issuer
 *      and the born-dead veto are unreachable
 *      by construction (proven by tests/no-legacy-issuer.test.ts, static).
 *   1. Discovery freshness: a stale discovery run never qualifies — every
 *      candidate is recorded failed/stale-discovery-run. Ledgers are still
 *      persisted (faithful record of what discovery emitted).
 *   2. LEDGER FIRST: the complete factor ledger + decision-time evidence for
 *      EVERY candidate is persisted BEFORE any qualification runs.
 *   3. Per candidate: map (strict, never fabricate) -> requireLedger
 *      (MissingLedgerError => failed/no-factor-ledger) -> ingest ->
 *      processIntegratedCandidate(..., "automatic", ...) under the frozen
 *      v2.1.5 rules embodied by the handler -> record outcome.
 *
 * Outcome vocabulary (handoff):
 *   qualified — the repaired path issued a paper signal (or holds a pending
 *               entry contract awaiting the venue print).
 *   abstained — did not qualify; exact reason code = the handler's gate
 *               (short-regime, issuance-veto, min-score, duplicate, expiry,
 *               entry-expired, waiting-interval-invalidation,
 *               post-entry-invalidation, entry-drift, entry-no-quote,
 *               evidence-insufficient, stale-inputs-as-rejection...).
 *   deferred  — parked for reassessment with a reason (stale-inputs).
 *   failed    — handoff-level failure, never a prediction: no-factor-ledger,
 *               missing-entry-levels, missing-signal-day, missing-history,
 *               incoherent-levels, stale-discovery-run, handoff-exception.
 *
 * PAPER ONLY. No brokerage, no orders. Holdouts locked; no prediction
 * weight changes (the handoff carries no weights — it persists what
 * discovery emitted and routes into the frozen v2.1.5 executables).
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { DiscoveryRun, RadarCandidate } from "./discovery-types.ts";
import { HandoffStore, MissingLedgerError, candidateKeyFor, type HandoffOutcome } from "./ledger-store.ts";
import { mapRadarCandidate } from "./map-candidate.ts";
import { assertNoLegacyIssuer, assertRepairedPathIdentity, LegacyIssuerBlockedError } from "./no-legacy.ts";
import { buildFeedBundle, type FeedMode } from "./feeds.ts";

const here = dirname(fileURLToPath(import.meta.url));
const PS = resolve(here, "..", "..");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

export interface HandoffRunOptions {
  run: DiscoveryRun;
  feedMode: FeedMode;
  /** File path for the integrated handler's DbStore (durable sqlite). */
  orchestratorDbPath: string;
  /** File path for the handoff ledger/outcome store. */
  handoffDbPath: string;
  /** Max age of a discovery run before it is refused (default 8h). */
  maxDiscoveryAgeMs?: number;
  /** Scripted-demo clock start (ms). Ignored in binance mode. */
  clockStartMs?: number;
  invocationPrefix?: string;
  httpLogPath?: string;
}

export interface CandidateResult {
  candidateKey: string;
  symbol: string;
  direction: string;
  ledgerHash: string | null;
  outcome: HandoffOutcome;
  reasonCode: string;
  reason: string;
  gate: string | null;
  handlerOutcomeKind: string | null;
}

export interface HandoffRunReport {
  runId: string;
  source: string;
  completedAt: string;
  freezeVersion: string;
  demo: boolean;
  feedMode: FeedMode;
  feedLabel: string;
  issuancePath: string;
  activeFreeze: "v2.1.5";
  receivedAt: string;
  staleRun: boolean;
  candidates: CandidateResult[];
  counts: Record<HandoffOutcome, number>;
}

const ISSUANCE_PATH = "processIntegratedCandidate(orchestrator/src/issuance/handler.ts) — entry-v1 + waiting-interval veto + venue mapping";

function toHandoffOutcome(handlerKind: string | null | undefined, gate: string | null, reason: string): {
  outcome: HandoffOutcome; reasonCode: string; reason: string; gate: string | null; handlerOutcomeKind: string | null;
} {
  const base = { reason, gate, handlerOutcomeKind: handlerKind ?? null };
  switch (handlerKind) {
    case "issued":
      return { ...base, outcome: "qualified", reasonCode: "issued" };
    case "awaiting-entry":
      return { ...base, outcome: "qualified", reasonCode: "qualified-awaiting-entry" };
    case "deferred":
      return { ...base, outcome: "deferred", reasonCode: gate ?? "deferred" };
    case "rejected":
      return { ...base, outcome: "abstained", reasonCode: gate ?? "rejected" };
    case "invalidated":
      return { ...base, outcome: "abstained", reasonCode: gate ?? "invalidated" };
    case "entry-expired":
      return { ...base, outcome: "abstained", reasonCode: "entry-expired" };
    default:
      return { ...base, outcome: "failed", reasonCode: "unknown-handler-outcome" };
  }
}

export async function runHandoffRun(opts: HandoffRunOptions): Promise<HandoffRunReport> {
  // 0. Runtime guard — legacy issuer can never be on this path.
  assertNoLegacyIssuer();
  const { processIntegratedCandidate } = await assertRepairedPathIdentity();
  const distHandler = (await import(resolve(PS, "orchestrator/dist/paper-signals/orchestrator/src/issuance/handler.js"))) as Record<string, AnyFn>;
  const distDb = (await import(resolve(PS, "orchestrator/dist/paper-signals/orchestrator/src/persistence/db-store.js"))) as Record<string, any>;
  const ingestIntegratedCandidate: AnyFn = distHandler.ingestIntegratedCandidate;
  const DbStore = distDb.DbStore;

  const receivedAt = new Date().toISOString();
  const store = new HandoffStore(opts.handoffDbPath);
  const report: HandoffRunReport = {
    runId: opts.run.runId,
    source: opts.run.source,
    completedAt: opts.run.completedAt,
    freezeVersion: opts.run.freezeVersion,
    demo: !!opts.run.demo,
    feedMode: opts.feedMode,
    feedLabel: "",
    issuancePath: ISSUANCE_PATH,
    activeFreeze: "v2.1.5",
    receivedAt,
    staleRun: false,
    candidates: [],
    counts: { qualified: 0, abstained: 0, deferred: 0, failed: 0 },
  };

  const record = (r: CandidateResult): void => {
    store.recordOutcome({
      runId: opts.run.runId,
      candidateKey: r.candidateKey,
      symbol: r.symbol,
      direction: r.direction,
      outcome: r.outcome,
      reasonCode: r.reasonCode,
      reason: r.reason,
      gate: r.gate,
      handlerOutcomeKind: r.handlerOutcomeKind,
      ledgerHash: r.ledgerHash,
    });
    report.candidates.push(r);
    report.counts[r.outcome] += 1;
  };

  try {
    // 1. Discovery freshness — stale radar never qualifies.
    const ageMs = Date.now() - Date.parse(opts.run.completedAt);
    const maxAge = opts.maxDiscoveryAgeMs ?? 8 * 3_600_000;

    // 2. LEDGER FIRST — persist every candidate's complete factor ledger +
    //    decision-time evidence BEFORE any qualification runs.
    const { candidateKeys } = store.persistDiscoveryRun(opts.run, receivedAt);
    const keyByIndex = new Map<number, string>();
    opts.run.candidates.forEach((c, i) => keyByIndex.set(i, candidateKeys[i]!));

    if (!Number.isFinite(ageMs) || ageMs > maxAge) {
      report.staleRun = true;
      opts.run.candidates.forEach((c, i) => {
        record({
          candidateKey: keyByIndex.get(i)!,
          symbol: c.symbol, direction: c.direction,
          ledgerHash: store.ledgerHashFor(keyByIndex.get(i)!),
          outcome: "failed",
          reasonCode: "stale-discovery-run",
          reason: `discovery run completed ${opts.run.completedAt} is ${Math.round(ageMs / 60000)}m old (budget ${Math.round(maxAge / 60000)}m): refused — never qualify on stale radar`,
          gate: null, handlerOutcomeKind: null,
        });
      });
      return report;
    }

    // 3. Wire the repaired path's deps (DbStore file, clock, feeds).
    const radarByKey = new Map<string, RadarCandidate>();
    opts.run.candidates.forEach((c, i) => radarByKey.set(keyByIndex.get(i)!, c));
    const feeds = await buildFeedBundle(opts.feedMode, {
      isDemoRun: !!opts.run.demo,
      clockStartMs: opts.clockStartMs ?? Date.now(),
      radarByKey,
      httpLogPath: opts.httpLogPath,
    });
    report.feedLabel = feeds.label;

    const dbStore = new DbStore(opts.orchestratorDbPath);
    const deps = {
      store: dbStore,
      clock: feeds.clock,
      quoteProvider: feeds.quoteProvider,
      entryFeedFor: feeds.entryFeedFor,
      waitingIntervalEvidenceFor: feeds.waitingIntervalEvidenceFor,
      postEntryEvidenceFor: feeds.postEntryEvidenceFor,
      deliverAlert: feeds.deliverAlert,
    };

    // 4. Per candidate: map -> requireLedger -> ingest -> repaired path -> record.
    for (let i = 0; i < opts.run.candidates.length; i++) {
      const radar = opts.run.candidates[i]!;
      const candidateKey = keyByIndex.get(i)!;
      const fail = (reasonCode: string, reason: string): void => {
        record({
          candidateKey, symbol: radar.symbol, direction: radar.direction,
          ledgerHash: store.ledgerHashFor(candidateKey),
          outcome: "failed", reasonCode, reason, gate: null, handlerOutcomeKind: null,
        });
      };

      // 4a. Strict mapping — missing fields are never fabricated.
      const mapped = mapRadarCandidate(radar);
      if (!mapped.ok) {
        fail(mapped.reasonCode, mapped.reason);
        continue;
      }

      // 4b. LEDGER ENFORCEMENT — no ledger, no qualification.
      let ledgerHash: string;
      try {
        ledgerHash = store.requireLedger(candidateKey).ledgerHash;
      } catch (err) {
        if (err instanceof MissingLedgerError) {
          fail("no-factor-ledger", err.message);
          continue;
        }
        throw err;
      }

      // 4c. The repaired paper path (automatic). Never the legacy issuer.
      try {
        feeds.useCandidate(candidateKey);
        const invocationId = `${opts.invocationPrefix ?? "handoff"}-${opts.run.runId}-${candidateKey.slice(0, 8)}`;
        const ingested = await ingestIntegratedCandidate(deps, { ...mapped.input, source: "shortlist" });
        const rec = await (processIntegratedCandidate as AnyFn)(deps, ingested, "automatic", invocationId);
        const mapped2 = toHandoffOutcome(
          rec.outcome?.kind ?? rec.status,
          rec.outcome?.gate ?? null,
          rec.outcome?.reason ?? `handler status ${rec.status}`,
        );
        record({
          candidateKey, symbol: radar.symbol, direction: radar.direction,
          ledgerHash, ...mapped2,
        });
      } catch (err) {
        if (err instanceof LegacyIssuerBlockedError) throw err;
        fail("handoff-exception", `exception in repaired path: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    dbStore.close();
    return report;
  } finally {
    store.close();
  }
}
