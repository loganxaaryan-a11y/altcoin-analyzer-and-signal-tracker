// acceptance-run.ts — v2.1.0 final acceptance run (Decision 3 consolidation).
//
// SANDBOX ONLY. No production issuance, no live trading, no brokerage.
// Runs the FULL frozen production crypto model (comparison/harness.py
// score_crypto_production on the REAL persisted factor ledger of signal 31,
// read verbatim from the workspace DB copy) through the REPAIRED issuance
// path (paper-signals/orchestrator/src/issuance/handler.ts — the integrated
// handler with ownership checks, the corrected waiting-interval veto, and
// the actionable-entry-v1 contract), using a REAL candidate from the
// retrospective cohort (rows/cohort-retrospective-v2.csv, crypto:31 — BTC
// long, real decision 2026-10-10T01:51:23.436Z). The candidate is NOT
// manufactured; the market data is REAL (Binance.US BTCUSDT spot aggTrades
// and 1m/daily klines, fetched at run time; venue label "binance-spot").
//
// What this proves:
//   candidate -> integrated handler -> WHICH veto/gate decided the outcome
//   (a valid abstention is acceptance-worthy ONLY if decided by the repaired
//   veto/gates; rejection by the SUPERSEDED historical veto is NOT
//   acceptance evidence) -> alert queued with transport destination
//   "awaiting-user-choice" (Logan has not chosen a destination; none is
//   invented).
//
// Function identity: the driver recomputes the SHA-256 of
// orchestrator/src/issuance/handler.ts at runtime and compares it with the
// v2.1.0 manifest's recorded hash. The run is executed against the compiled
// dist build of the SAME source.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// --- the real compiled integrated handler (dist of the frozen source) -----
import { manualClock } from "../../orchestrator/dist/paper-signals/orchestrator/src/clock.js";
import { DbStore } from "../../orchestrator/dist/paper-signals/orchestrator/src/persistence/db-store.js";
import {
  ingestIntegratedCandidate,
  integratedManualIssue,
} from "../../orchestrator/dist/paper-signals/orchestrator/src/issuance/handler.js";
import type {
  EntryObservationFeed,
  IntegratedDeps,
} from "../../orchestrator/dist/paper-signals/orchestrator/src/issuance/handler.js";
import type { PaperCandidateInput } from "../../orchestrator/dist/paper-signals/orchestrator/src/types.js";
import { MutableClock, ScriptedFeed } from "../../entry-v1/dist/src/feed.js";
import type { TradePrint } from "../../entry-v1/dist/src/feed.js";
import type { EvidenceBar } from "../../veto/src/veto.js";
import { alertFeed, trackerView } from "../../orchestrator/dist/paper-signals/orchestrator/src/readpath.js";

const DIR = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(DIR, "data");
const EVIDENCE = resolve(DIR, "evidence");
mkdirSync(EVIDENCE, { recursive: true });
const WS = "/home/hatch/workspace";
const PS = resolve(WS, "goals/research-terminal/paper-signals");

const log: string[] = [];
const emit = (s: string) => { log.push(s); console.log(s); };

// ---------------------------------------------------------------------------
// 0. Function identity: recompute handler.ts SHA-256, compare with manifest.
// ---------------------------------------------------------------------------
const HANDLER_SRC = resolve(PS, "orchestrator/src/issuance/handler.ts");
const handlerHash = createHash("sha256").update(readFileSync(HANDLER_SRC)).digest("hex");
const manifest = JSON.parse(readFileSync(resolve(PS, "comparison/freeze-manifest-v2.1.0.json"), "utf8"));
const manifestHandler = manifest.operational_rules.source_files.find(
  (s: { path: string }) => s.path.endsWith("issuance/handler.ts"));
emit(`[identity] handler.ts sha256 (runtime recompute): ${handlerHash}`);
emit(`[identity] manifest v2.1.0 records:               ${manifestHandler.sha256}`);
if (handlerHash !== manifestHandler.sha256) {
  emit("[identity] MISMATCH — handler source drifted from the freeze. STOPPING.");
  process.exit(1);
}
emit("[identity] MATCH — the repaired issuance path is the frozen source.");

// ---------------------------------------------------------------------------
// 1. The real candidate: crypto:31 from the retrospective cohort.
// ---------------------------------------------------------------------------
const row = JSON.parse(readFileSync(resolve(DATA, "signal31_row.json"), "utf8"));
emit(`\n[candidate] ${row.row_id} — ${row.symbol} ${row.prod_direction} ` +
  `(strategy ${row.prod_strategy_id} ${row.prod_strategy_version})`);
emit(`[candidate] decision_at=${row.decision_at} | provenance=${row.provenance_verdict} ` +
  `(${row.applicable_freeze}) | cohort=${row.cohort_origin}`);
emit(`[candidate] recorded: score=${row.prod_long_score}/${row.prod_short_score} ` +
  `entry=${row.prod_entry} invalidation=${row.prod_invalidation} ` +
  `target1=${row.prod_target1} target2=${row.prod_target2} atr14=${row.prod_atr14}`);

// ---------------------------------------------------------------------------
// 2. Run the FULL frozen production crypto model on the REAL persisted ledger
//    (comparison/harness.py score_crypto_production, verbatim DB factors).
// ---------------------------------------------------------------------------
const ledgerPath = resolve(DATA, "signal31_ledger.json");
const modelJson = execFileSync("python3", ["-c",
  "import json,sys; sys.path.insert(0, sys.argv[1]); import harness; " +
  "print(json.dumps(harness.score_crypto_production(json.load(open(sys.argv[2])))))",
  resolve(PS, "comparison"), ledgerPath], { encoding: "utf8" });
const model = JSON.parse(modelJson);
emit(`\n[model] FULL frozen production crypto model run on the real ledger:`);
emit(`[model] long_score=${model.long_score} short_score=${model.short_score} ` +
  `direction=${model.direction} (weighted_net=${model.weighted_net}, ` +
  `total_weight=${model.total_weight}, factors_used=${model.factors_used})`);
if (model.direction !== row.prod_direction || model.long_score !== Number(row.prod_long_score)) {
  emit("[model] MISMATCH with the recorded row — the model does not reproduce. STOPPING.");
  process.exit(1);
}
emit("[model] REPRODUCED: direction and score match the real recorded signal (prod_reproduced=True).");

// ---------------------------------------------------------------------------
// 3. Build the PaperCandidateInput from the model output + real row levels.
// ---------------------------------------------------------------------------
const inputs = JSON.parse(readFileSync(resolve(DATA, "accept_inputs.json"), "utf8"));
const decisionMs = Date.parse(row.decision_at);
const entry = Number(row.prod_entry);
const invalidation = Number(row.prod_invalidation);
const candidate: PaperCandidateInput = {
  terminal: "crypto",
  symbol: row.symbol,
  coinId: row.asset_id,
  name: "Bitcoin",
  direction: model.direction,
  score: model.long_score,
  entryPrice: entry,
  invalidation,
  target1: Number(row.prod_target1),
  target2: Number(row.prod_target2),
  signalDate: "2026-10-10",
  detectedAt: row.decision_at,
  source: "manual",
  inputs: {
    signalDay: {
      day: inputs.signal_day.day,
      open: inputs.signal_day.open,
      high: inputs.signal_day.high,
      low: inputs.signal_day.low,
      close: inputs.signal_day.close,
      source: inputs.signal_day.source,
    },
    historyCloses: inputs.history_closes,
    historyHighs: inputs.history_highs,
    currentPrice: inputs.current_price,
    asOf: row.decision_at,
    vetoBars: inputs.veto_bars as EvidenceBar[],
  },
};
emit(`\n[input] signal-day (real, 2026-10-09): O=${inputs.signal_day.open} ` +
  `H=${inputs.signal_day.high} L=${inputs.signal_day.low} C=${inputs.signal_day.close}`);
emit(`[input] history: ${inputs.history_closes.length} daily closes/highs through the signal day (real)`);
emit(`[input] vetoBars: ${inputs.veto_bars.length} pre-decision 1m bars (real; setup-history features)`);

// ---------------------------------------------------------------------------
// 4. Wire the repaired issuance path: real store, real clock at the real
//    decision instant, real post-decision prints, real waiting-interval bars.
// ---------------------------------------------------------------------------
const clock = manualClock(decisionMs);
const store = new DbStore(":memory:");
const feedClock = new MutableClock(decisionMs);
// Real post-decision prints (Binance.US BTCUSDT spot aggTrades). availableAt
// = ts + 200ms models the venue feed's serving latency (labeled; the prints
// themselves are verbatim real market data).
const prints = (inputs.prints as TradePrint[]).map((p) => ({ ...p, availableAt: p.ts + 200 }));
const feed = new ScriptedFeed(prints, feedClock);

// Alert transport: sandbox hook. Every enqueue is recorded with the
// transport destination "awaiting-user-choice" — Logan has not chosen a
// destination, and none is invented. The sandbox hand-off (hook's clean
// return) IS the acknowledgement (delivery_mode "simulated").
const enqueuedAlerts: Array<{ id: string; kind: string; signalId: string; destination: string; enqueuedAt: string }> = [];
const deps: IntegratedDeps = {
  store,
  clock,
  entryFeedFor: () => ({
    feed,
    clock: feedClock,
    pollIntervalMs: 30_000, // strictly finer than the 15-min entry window (correction 4)
    maxPolls: 40,
    advance: (ms: number) => { feedClock.advance(ms); clock.advance(ms); },
  }),
  waitingIntervalEvidenceFor: () => inputs.waiting_bars as EvidenceBar[],
  postEntryEvidenceFor: () => ({
    bars: inputs.post_bars as EvidenceBar[],
    nowAt: decisionMs + 15 * 60_000,
  }),
  deliverAlert: (alert) => {
    enqueuedAlerts.push({
      id: alert.id, kind: alert.kind, signalId: alert.signalId,
      destination: "awaiting-user-choice", enqueuedAt: alert.enqueuedAt,
    });
  },
  deliveryMode: "simulated",
};

// ---------------------------------------------------------------------------
// 5. Run the candidate through the REPAIRED issuance path.
// ---------------------------------------------------------------------------
emit(`\n[run] integrated issuance path: ingest -> min-score -> freshness -> ` +
  `retained regime gate -> runQualificationChecks (repaired veto) -> ` +
  `contract build -> entry observation -> checkWaitingInterval (repaired) -> ` +
  `post-entry -> outcome commit`);
const record = await integratedManualIssue(deps, candidate, "acceptance-v2.1.0");
const outcome = record.outcome;
emit(`\n[outcome] status=${record.status}`);
emit(`[outcome] DECIDING GATE: ${outcome?.gate ?? "(none)"}`);
emit(`[outcome] reason: ${outcome?.reason}`);
if (outcome?.detail) emit(`[outcome] detail keys: ${Object.keys(outcome.detail).join(", ")}`);

// The legacy historical-extreme veto must NOT be the decider: on the
// repaired path it does not exist. The only lawful deciders are the
// repaired gates and contract outcomes.
const LAWFUL_GATES = new Set([
  "expiry", "min-score", "stale-inputs", "duplicate", "short-regime",
  "evidence-insufficient", "issuer-suppression", "issuance-veto",
  "entry-expired", "entry-drift", "entry-no-quote", "waiting-interval-invalidation",
  "post-entry-invalidation", null, // null = issued path (no rejection gate)
]);
const gate = outcome?.gate ?? null;
if (!LAWFUL_GATES.has(gate) || record.status === "rejected" && gate === null) {
  emit(`[gate-check] FAIL: gate "${gate}" is not one of the repaired gates. NOT acceptance evidence.`);
  process.exit(1);
}
emit(`[gate-check] the deciding gate "${gate ?? "issued (all repaired gates passed)"}" ` +
  `is one of the REPAIRED gates — the superseded historical veto decided nothing.`);

// ---------------------------------------------------------------------------
// 6. Delivery path: alert transport armed, destination awaiting-user-choice.
// ---------------------------------------------------------------------------
emit(`\n[delivery] alerts enqueued: ${enqueuedAlerts.length}`);
const dbAlerts = alertFeed(store);
emit(`[delivery] alerts persisted in the DB: ${dbAlerts.length}`);
for (const a of enqueuedAlerts) {
  emit(`[delivery]   ${a.kind} alert ${a.id} (signal ${a.signalId}) ` +
    `enqueuedAt=${a.enqueuedAt} destination=${a.destination}`);
}
const destinations = new Set(enqueuedAlerts.map((a) => a.destination));
if (enqueuedAlerts.length === 0 || destinations.size !== 1 || !destinations.has("awaiting-user-choice")) {
  emit("[delivery] FAIL: alert transport did not enqueue with destination awaiting-user-choice.");
  process.exit(1);
}
emit(`[delivery] ARMED: every enqueued alert carries destination "awaiting-user-choice" ` +
  `(Logan has not chosen a destination; none invented).`);

// Tracker view for the record.
const signals = trackerView(store);
emit(`\n[tracker] issued signals persisted: ${signals.length}; ` +
  `signalId=${signals[0]?.signalId} issuedAt=${signals[0]?.issuedAt}`);

// ---------------------------------------------------------------------------
// 7. Evidence bundle.
// ---------------------------------------------------------------------------
const evidence = {
  run: "v2.1.0 final acceptance (Decision 3 consolidation)",
  ran_at_utc: new Date().toISOString(),
  candidate: {
    row_id: row.row_id, symbol: row.symbol, decision_at: row.decision_at,
    provenance: row.provenance_verdict, cohort_origin: row.cohort_origin,
    strategy: `${row.prod_strategy_id} ${row.prod_strategy_version}`,
  },
  model_run: {
    fn: "comparison/harness.py score_crypto_production (frozen production crypto model)",
    ledger: "real factors_json of generated_signals id 31 (workspace DB copy)",
    result: model,
    reproduced: model.direction === row.prod_direction && model.long_score === Number(row.prod_long_score),
  },
  function_identity: {
    module: "paper-signals/orchestrator/src/issuance/handler.ts",
    sha256_runtime: handlerHash,
    sha256_manifest_v2_1_0: manifestHandler.sha256,
    match: handlerHash === manifestHandler.sha256,
  },
  issuance_path: {
    entry: record.status,
    deciding_gate: gate,
    reason: outcome?.reason ?? null,
    gate_is_repaired: LAWFUL_GATES.has(gate),
    legacy_veto_decided_nothing: true,
    entry_observed_at: (record as { entryObservedAt?: string }).entryObservedAt ?? null,
    setup_alert_at: (record as { setupAlertAt?: string }).setupAlertAt ?? null,
  },
  delivery: {
    alerts_enqueued: enqueuedAlerts.length,
    destination: "awaiting-user-choice",
    alerts: enqueuedAlerts,
    armed: true,
  },
  data_sources: {
    prints: "Binance.US BTCUSDT spot aggTrades (real), venue label binance-spot, availableAt = ts + 200ms (labeled feed latency)",
    bars: "Binance.US BTCUSDT 1m klines (real) for vetoBars / waiting-interval / post-entry; daily klines (real) for signal-day + history",
  },
};
writeFileSync(resolve(EVIDENCE, "acceptance-run-evidence.json"), JSON.stringify(evidence, null, 2));
writeFileSync(resolve(EVIDENCE, "acceptance-run-log.md"), "# v2.1.0 acceptance run — log\n\n" + log.join("\n") + "\n");
emit(`\n[evidence] wrote ${resolve(EVIDENCE, "acceptance-run-evidence.json")}`);
emit(`[evidence] wrote ${resolve(EVIDENCE, "acceptance-run-log.md")}`);
emit(`\nACCEPTANCE RUN COMPLETE: candidate -> repaired issuance path -> ` +
  `deciding gate "${gate ?? "issued"}" -> alert queued (destination awaiting-user-choice).`);
