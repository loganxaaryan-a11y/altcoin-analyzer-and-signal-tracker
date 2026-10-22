// driver.ts — acceptance demonstrations for the paper-signal build (WORK ITEM 4/5).
//
// SANDBOX ONLY. No production issuance, no live trading. Runs directly under
// Node >= 22 type-stripping: `node demo/driver.ts` (no compile step needed).
//
// Every demonstration exercises the REAL compiled modules:
//   - orchestrator/dist/... (orchestrator, issuers, gates, readpath, test fixtures)
//   - veto/src/veto.ts (corrected three-way veto, type-stripped as-is)
//
// and prints, per demo, the identity of every production function exercised:
// module path + function name + source SHA-256 from hashes.txt, plus a runtime
// proof of that identity (live-import reference equality / vendored drift state).
//
// Anything that could NOT be verified against a real imported function is
// flagged explicitly per demo (see each demo's `flags`).

import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// --- the real compiled orchestrator -----------------------------------------
import { manualClock } from "../orchestrator/dist/paper-signals/orchestrator/src/clock.js";
import { SandboxStore } from "../orchestrator/dist/paper-signals/orchestrator/src/issuers/sandbox-store.js";
import type { WriteStore } from "../orchestrator/dist/paper-signals/orchestrator/src/issuers/sandbox-store.js";
import { candidateIdFor, ingestCandidate, manualIssue, tick } from "../orchestrator/dist/paper-signals/orchestrator/src/orchestrator.js";
import type { OrchestratorDeps } from "../orchestrator/dist/paper-signals/orchestrator/src/orchestrator.js";
import { alertFeed, trackerView, viewDossier } from "../orchestrator/dist/paper-signals/orchestrator/src/readpath.js";
import { evaluateBornDead, evaluateShortRegimeGate } from "../orchestrator/dist/paper-signals/orchestrator/src/gates/crypto-gates.js";
import { signalIssuanceDecision } from "../orchestrator/dist/paper-signals/orchestrator/src/gates/equity-gates.js";
import { reconstructAndValidateEquityCandidate, evaluateEquityIssuanceGate, computeEquityDecisionFromRawInputs } from "../orchestrator/dist/paper-signals/orchestrator/src/gates/imported-gates.js";
import type { PaperCandidateInput } from "../orchestrator/dist/paper-signals/orchestrator/src/types.js";
// --- the orchestrator's OWN fixture style (compiled test fixtures) -----------
import { cryptoCandidate, cryptoInputs, equityCandidate, makeCryptoHistory, makeEquityBars } from "../orchestrator/dist/paper-signals/orchestrator/tests/fixtures.js";
// --- the corrected veto module (sandbox reference implementation) ------------
import { checkSetupInvalidation, runIssuanceChecks } from "../veto/src/veto.ts";
import type { EvidenceBar } from "../veto/src/veto.ts";

const DEMO_DIR = dirname(fileURLToPath(import.meta.url));
const PS_DIR = resolve(DEMO_DIR, "..");
const SRC_EXPORT = resolve(PS_DIR, "../hidden_files/source-export-2026-10-13");
const EVIDENCE_DIR = resolve(DEMO_DIR, "evidence");
const STORES_DIR = resolve(EVIDENCE_DIR, "stores");
const DEMOS_DIR = resolve(EVIDENCE_DIR, "demos");

// ---------------------------------------------------------------------------
// Function identity table. SHAs are the source-of-truth values from
// hidden_files/source-export-2026-10-13/hashes.txt, re-verified at runtime
// (file-level SHA-256 recompute) before any demo runs.
// ---------------------------------------------------------------------------

type Provenance = "live-import" | "vendored" | "sandbox-native";

interface FnIdentity {
  fn: string;
  /** Module path as the demo references it (relative to the workspace). */
  module: string;
  /** Source location in the terminal tree (relative to the source export). */
  source: string;
  /** SHA-256 of the source file, from hashes.txt. */
  sha256: string;
  provenance: Provenance;
  note: string;
}

const IDENTITIES: Record<string, FnIdentity> = {
  reconstructAndValidateEquityCandidate: {
    fn: "reconstructAndValidateEquityCandidate",
    module: "paper-signals/orchestrator/src/gates/imported-gates.ts (re-export; loaded live from dist/hidden_files/.../measurement.cjs)",
    source: "equity/server/src/measurement.ts:304",
    sha256: "9109c826d89919da606e44b80f9b1be7e232a3aef83e53eedde58ca80a4ee0d5",
    provenance: "live-import",
    note: "zero-import, DB-free module imported live via createRequire; drift impossible at runtime. Internally calls computeEquityDecisionFromRawInputs then evaluateEquityIssuanceGate (born-dead veto, then short-regime bearish-structure gate).",
  },
  evaluateEquityIssuanceGate: {
    fn: "evaluateEquityIssuanceGate",
    module: "paper-signals/orchestrator/src/gates/imported-gates.ts (live re-export)",
    source: "equity/server/src/measurement.ts:291",
    sha256: "9109c826d89919da606e44b80f9b1be7e232a3aef83e53eedde58ca80a4ee0d5",
    provenance: "live-import",
    note: "born-dead veto, then short-regime bearish-structure gate for shorts; longs pass once born-dead clears.",
  },
  computeEquityDecisionFromRawInputs: {
    fn: "computeEquityDecisionFromRawInputs",
    module: "paper-signals/orchestrator/src/gates/imported-gates.ts (live re-export)",
    source: "equity/server/src/measurement.ts:236",
    sha256: "9109c826d89919da606e44b80f9b1be7e232a3aef83e53eedde58ca80a4ee0d5",
    provenance: "live-import",
    note: "evidence-window reconstruction (200-bar requirement, Wilder RSI-14/ATR-14 factor replay, 2xATR stop / 1.5R / 2.5R levels).",
  },
  evaluateBornDead: {
    fn: "evaluateBornDead",
    module: "paper-signals/orchestrator/src/gates/crypto-gates.ts (vendored)",
    source: "crypto/server/src/actions.ts:1219-1224",
    sha256: "301e270e72a98d1dbcbfcf5d99ce53cc8afb142df77a8c18a514831b2c1a2788",
    provenance: "vendored",
    note: "copied verbatim 2026-10-13 (helpers mean/pct/smaAt/horizonReturn, BORN_DEAD_REASON_PREFIX, hasRecentLowerHighs included); drift policed by tests/drift.js + drift-hashes.json (exact source-range hashes).",
  },
  evaluateShortRegimeGate: {
    fn: "evaluateShortRegimeGate",
    module: "paper-signals/orchestrator/src/gates/crypto-gates.ts (vendored)",
    source: "crypto/server/src/actions.ts:1206-1211",
    sha256: "301e270e72a98d1dbcbfcf5d99ce53cc8afb142df77a8c18a514831b2c1a2788",
    provenance: "vendored",
    note: "same vendor/drift provenance as evaluateBornDead.",
  },
  signalIssuanceDecision: {
    fn: "signalIssuanceDecision",
    module: "paper-signals/orchestrator/src/gates/equity-gates.ts (vendored)",
    source: "equity/server/src/actions.ts:402-416",
    sha256: "17eabf4d8d314fcc130f870df692bf1b66edb67b3a6379972f1b712a3f62cd47",
    provenance: "vendored",
    note: "copied verbatim 2026-10-13 (helpers average/round/recentLowerHighs included); the exact function the equity discovery scan calls at actions.ts:2155-2165; drift policed by tests/drift.js.",
  },
  runIssuanceChecks: {
    fn: "runIssuanceChecks",
    module: "paper-signals/veto/src/veto.ts",
    source: "n/a (no terminal-tree counterpart)",
    sha256: "n/a",
    provenance: "sandbox-native",
    note: "corrected three-way issuance veto (setup_invalidation + entry_zone + pipeline-order guard), reference implementation for WORK ITEM 2/5 per spec VETO-AUDIT.md. NOT imported or vendored from the terminal tree; the terminal tree has no equivalent function.",
  },
  checkSetupInvalidation: {
    fn: "checkSetupInvalidation",
    module: "paper-signals/veto/src/veto.ts",
    source: "n/a (no terminal-tree counterpart)",
    sha256: "n/a",
    provenance: "sandbox-native",
    note: "same sandbox-native provenance as runIssuanceChecks: only bars observed strictly after decisionTime may invalidate; pre-decision extremes are setup features; straddling candles fail closed.",
  },
};

function sha256FileHex(path: string): string {
  return createHash("sha256").update(readFileSync(path), "utf8").digest("hex");
}

/** Runtime verification of every identity: source-file SHA vs hashes.txt + live-import reference equality. */
function verifyIdentities(): { file: string; expected: string; actual: string; pass: boolean }[] {
  const byFile = new Map<string, string>();
  for (const id of Object.values(IDENTITIES)) {
    if (id.provenance === "sandbox-native") continue;
    if (!byFile.has(id.sha256)) {
      const rel = id.source.split(":")[0]!;
      byFile.set(id.sha256, rel);
    }
  }
  const rows: { file: string; expected: string; actual: string; pass: boolean }[] = [];
  for (const [expected, rel] of byFile) {
    const abs = resolve(SRC_EXPORT, rel);
    const actual = existsSync(abs) ? sha256FileHex(abs) : "MISSING";
    rows.push({ file: rel, expected, actual, pass: actual === expected });
  }
  return rows;
}

/** Prove the "live import" is live: the re-exported functions ARE the source tree's exports (reference equality). */
function verifyLiveImport(): { fn: string; pass: boolean }[] {
  const require = createRequire(import.meta.url);
  const cjsPath = resolve(PS_DIR, "orchestrator/dist/hidden_files/source-export-2026-10-13/equity/server/src/measurement.cjs");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const direct = require(cjsPath) as Record<string, unknown>;
  return [
    { fn: "reconstructAndValidateEquityCandidate", pass: direct.reconstructAndValidateEquityCandidate === reconstructAndValidateEquityCandidate },
    { fn: "evaluateEquityIssuanceGate", pass: direct.evaluateEquityIssuanceGate === evaluateEquityIssuanceGate },
    { fn: "computeEquityDecisionFromRawInputs", pass: direct.computeEquityDecisionFromRawInputs === computeEquityDecisionFromRawInputs },
  ];
}

// ---------------------------------------------------------------------------
// Demo harness
// ---------------------------------------------------------------------------

interface Assertion { name: string; pass: boolean; detail?: string }
interface DemoResult {
  id: string;
  title: string;
  pass: boolean;
  flags: string[];
  identities: string[];      // keys into IDENTITIES
  assertions: Assertion[];
  notes: string[];
  evidenceFile: string;
}

const results: DemoResult[] = [];

function printIdentity(key: string): void {
  const id = IDENTITIES[key]!;
  console.log(`  [${id.provenance.toUpperCase()}] ${id.fn}`);
  console.log(`      module : ${id.module}`);
  console.log(`      source : ${id.source}`);
  console.log(`      sha256 : ${id.sha256}`);
  console.log(`      note   : ${id.note}`);
}

function summarizeFlags(flags: string[]): void {
  if (flags.length === 0) { console.log("  flags: none"); return; }
  console.log("  flags:");
  for (const f of flags) console.log(`    - ${f}`);
}

function storePath(demoId: string): string {
  const dir = resolve(STORES_DIR, demoId);
  mkdirSync(dir, { recursive: true });
  return resolve(dir, "store.json");
}

function snapshot(store: WriteStore): Record<string, unknown> {
  return {
    candidates: store.listCandidates(),
    signals: store.listSignals(),
    suppressions: store.listSuppressions(),
    alerts: store.listAlerts(),
    issuanceAttempts: store.getIssuanceAttempts(),
  };
}

function saveDemo(result: DemoResult, extra: Record<string, unknown>): void {
  mkdirSync(DEMOS_DIR, { recursive: true });
  const payload = {
    id: result.id,
    title: result.title,
    pass: result.pass,
    runAt: new Date().toISOString(),
    flags: result.flags,
    identities: result.identities.map((k) => IDENTITIES[k]),
    assertions: result.assertions,
    notes: result.notes,
    ...extra,
  };
  const file = resolve(DEMOS_DIR, `${result.id}.json`);
  writeFileSync(file, JSON.stringify(payload, null, 2), "utf8");
  result.evidenceFile = `evidence/demos/${result.id}.json`;
}

function finish(result: DemoResult): void {
  result.pass = result.assertions.every((a) => a.pass);
  console.log(result.pass ? `\n  ==> ${result.id.toUpperCase()}: PASS` : `\n  ==> ${result.id.toUpperCase()}: FAIL`);
  results.push(result);
}

const T0 = Date.parse("2026-10-13T20:00:01.000Z");

function banner(id: string, title: string): void {
  console.log(`\n================================================================`);
  console.log(` DEMO (${id}) — ${title}`);
  console.log(`================================================================`);
}

// ---------------------------------------------------------------------------
// DEMO (a) — QUALIFYING ISSUANCE EXACTLY ONCE (equity long, real reconstruction)
// ---------------------------------------------------------------------------
async function demoA(): Promise<void> {
  banner("a", "QUALIFYING ISSUANCE EXACTLY ONCE");
  const result: DemoResult = {
    id: "a", title: "Qualifying issuance exactly once", pass: false, flags: [],
    identities: ["reconstructAndValidateEquityCandidate", "evaluateEquityIssuanceGate", "computeEquityDecisionFromRawInputs", "signalIssuanceDecision"],
    assertions: [], notes: [], evidenceFile: "",
  };
  for (const k of result.identities) printIdentity(k);
  summarizeFlags(result.flags);

  const bars = makeEquityBars(); // 220 rising bars, orchestrator fixture style
  const last = bars[bars.length - 1]!;
  const clock = manualClock(Date.parse(`${last.date}T22:00:01.000Z`));
  const store = new SandboxStore(storePath("a"));
  const deps: OrchestratorDeps = { store, clock };

  const input: PaperCandidateInput = equityCandidate(bars);
  const rec = await ingestCandidate(deps, input);
  result.notes.push(`candidateId=${rec.candidateId} symbol=${input.symbol} direction=${input.direction} signalDate=${input.signalDate}`);

  const r1 = await tick(deps);
  const after = store.getCandidate(candidateIdFor(input))!;
  const signals = store.listSignals();
  const alerts = alertFeed(store);
  const tracked = trackerView(store);

  result.assertions.push({ name: "first tick issues exactly one candidate", pass: r1.issued.length === 1, detail: JSON.stringify(r1.issued) });
  result.assertions.push({ name: "exactly one sandbox signal persisted", pass: signals.length === 1, detail: signals[0]?.signalId });
  result.assertions.push({ name: "issued signal is the equity long", pass: signals[0]?.terminal === "equity" && signals[0]?.direction === "long", detail: `${signals[0]?.terminal}/${signals[0]?.direction}` });
  result.assertions.push({ name: "tracker view shows the signal", pass: tracked.length === 1 && tracked[0]?.signalId === after.issuedSignalId, detail: tracked[0]?.signalId });
  result.assertions.push({ name: "alert feed shows the alert (sandbox-feed)", pass: alerts.length === 1 && alerts[0]?.channel === "sandbox-feed" && alerts[0]?.signalId === after.issuedSignalId, detail: JSON.stringify(alerts[0]) });
  result.assertions.push({ name: "candidate outcome is issued with delays", pass: after.status === "issued" && after.outcome?.kind === "issued" && after.delays !== null, detail: JSON.stringify(after.delays) });
  const expectedSpan = Date.parse(`${last.date}T22:00:01.000Z`) - Date.parse(input.detectedAt);
  result.assertions.push({ name: "detection-to-alert delay recorded exactly", pass: after.delays?.detectionToAlertMs === expectedSpan, detail: `detectionToAlertMs=${after.delays?.detectionToAlertMs} expected=${expectedSpan}` });
  result.assertions.push({ name: "alertedAt propagated to the signal row", pass: signals[0]?.alertedAt === after.alertedAt, detail: signals[0]?.alertedAt ?? "null" });
  result.notes.push(`delays: ${JSON.stringify(after.delays)}`);

  // second tick: exactly-once holds
  const r2 = await tick(deps);
  result.assertions.push({ name: "second tick issues nothing new", pass: r2.issued.length === 0 && store.listSignals().length === 1, detail: `issued=${r2.issued.length} signals=${store.listSignals().length}` });

  saveDemo(result, { input: { ...input, inputs: { ...input.inputs, rawBars: `${input.inputs.rawBars?.length} bars` } }, store: snapshot(store), tickReports: [r1, r2] });
  finish(result);
}

// ---------------------------------------------------------------------------
// DEMO (b) — CLEAN ABSTENTION (crypto born-dead long)
// ---------------------------------------------------------------------------
async function demoB(): Promise<void> {
  banner("b", "CLEAN ABSTENTION");
  const result: DemoResult = {
    id: "b", title: "Clean abstention: gate failure -> no issuance + suppression row", pass: false, flags: [],
    identities: ["evaluateBornDead"],
    assertions: [], notes: [], evidenceFile: "",
  };
  for (const k of result.identities) printIdentity(k);
  summarizeFlags(result.flags);

  const clock = manualClock(T0);
  const store = new SandboxStore(storePath("b"));
  const deps: OrchestratorDeps = { store, clock };

  const inputs = cryptoInputs();
  const last = inputs.historyCloses[inputs.historyCloses.length - 1]!;
  inputs.signalDay = { ...inputs.signalDay!, low: last - 10 }; // flush through the stop
  const input = cryptoCandidate({ inputs, invalidation: last - 6 });
  await ingestCandidate(deps, input);
  const report = await tick(deps);
  const rec = store.getCandidate(candidateIdFor(input))!;
  const sup = store.listSuppressions().filter((s) => s.candidateId === rec.candidateId);

  result.assertions.push({ name: "nothing issued", pass: report.issued.length === 0 && store.listSignals().length === 0 });
  result.assertions.push({ name: "candidate rejected", pass: report.rejected.length === 1 && rec.status === "rejected" });
  result.assertions.push({ name: "exact gate name persisted: born-dead", pass: rec.outcome?.gate === "born-dead", detail: rec.outcome?.gate ?? "null" });
  result.assertions.push({ name: "exact reason matches the vendored reason string", pass: /born-dead LONG: signal-day low [\d.]+ <= invalidation [\d.]+/.test(rec.outcome?.reason ?? ""), detail: rec.outcome?.reason });
  result.assertions.push({ name: "suppression row with gate + reason", pass: sup.length === 1 && sup[0]?.gate === "born-dead" && sup[0]?.origin === "orchestrator", detail: JSON.stringify(sup[0]) });
  result.assertions.push({ name: "no alert emitted", pass: store.listAlerts().length === 0 });

  // the vendored function, called directly, agrees with the orchestrator's verdict
  const direct = evaluateBornDead("long", last - 6, { ...inputs.signalDay! });
  result.assertions.push({ name: "direct vendored call agrees (publish=false)", pass: direct.publish === false && (direct.reason ?? "").startsWith("born-dead"), detail: direct.reason ?? "null" });

  saveDemo(result, { input: { ...input }, store: snapshot(store), tickReport: report, directVendoredCall: direct });
  finish(result);
}

// ---------------------------------------------------------------------------
// DEMO (c) — STALE QUOTE REJECTION (never issued on stale evidence)
// ---------------------------------------------------------------------------
async function demoC(): Promise<void> {
  banner("c", "STALE QUOTE REJECTION");
  const result: DemoResult = {
    id: "c", title: "Stale inputs: deferred, never issued on stale evidence", pass: false,
    flags: [
      "The freshness gate is orchestrator-internal logic (freshnessMs config + deferred/stale-inputs outcome) — no production function governs it. Sandbox-only by design.",
    ],
    identities: [],
    assertions: [], notes: [], evidenceFile: "",
  };
  summarizeFlags(result.flags);

  const clock = manualClock(T0);
  const store = new SandboxStore(storePath("c"));
  const deps: OrchestratorDeps = { store, clock, config: { freshnessMs: 30 * 60_000 } }; // no quoteProvider

  const staleAsOf = new Date(T0 - 2 * 3_600_000).toISOString(); // 2h old inputs
  const input = cryptoCandidate({ inputs: cryptoInputs({ asOf: staleAsOf }) });
  await ingestCandidate(deps, input);
  const r1 = await tick(deps);
  const rec = store.getCandidate(candidateIdFor(input))!;

  result.assertions.push({ name: "candidate deferred (not issued, not rejected)", pass: r1.deferred.length === 1 && rec.status === "deferred", detail: rec.status });
  result.assertions.push({ name: "stale-evidence reason names the gate", pass: rec.outcome?.gate === "stale-inputs" && /no quote provider configured/.test(rec.outcome?.reason ?? ""), detail: rec.outcome?.reason });
  result.assertions.push({ name: "next reassessment scheduled (retry backoff)", pass: rec.nextReassessmentAt !== null, detail: rec.nextReassessmentAt ?? "null" });
  result.assertions.push({ name: "zero signals on stale evidence", pass: store.listSignals().length === 0 && store.getIssuanceAttempts() === 0, detail: `signals=${store.listSignals().length} attempts=${store.getIssuanceAttempts()}` });
  result.assertions.push({ name: "no alert emitted", pass: store.listAlerts().length === 0 });

  saveDemo(result, { input: { ...input }, store: snapshot(store), tickReport: r1 });
  finish(result);
}

// ---------------------------------------------------------------------------
// DEMO (d) — EXPIRED CANDIDATE (past TTL)
// ---------------------------------------------------------------------------
async function demoD(): Promise<void> {
  banner("d", "EXPIRED CANDIDATE");
  const result: DemoResult = {
    id: "d", title: "Expired candidate: rejected with gate=expiry, never issued", pass: false,
    flags: [
      "Candidate TTL is orchestrator-internal config (candidateTtlMs) — no production function governs expiry. Sandbox-only by design.",
    ],
    identities: [],
    assertions: [], notes: [], evidenceFile: "",
  };
  summarizeFlags(result.flags);

  const clock = manualClock(T0);
  const store = new SandboxStore(storePath("d"));
  const deps: OrchestratorDeps = { store, clock, config: { candidateTtlMs: 3_600_000 } }; // 1h TTL

  const input = cryptoCandidate({ detectedAt: "2026-10-13T17:00:00.000Z" }); // 3h old at T0
  await ingestCandidate(deps, input);
  const report = await tick(deps);
  const rec = store.getCandidate(candidateIdFor(input))!;

  result.assertions.push({ name: "candidate expired", pass: report.expired.length === 1 && rec.status === "expired", detail: rec.status });
  result.assertions.push({ name: "exact gate name persisted: expiry", pass: rec.outcome?.gate === "expiry", detail: rec.outcome?.gate ?? "null" });
  result.assertions.push({ name: "reason cites the TTL", pass: /TTL exceeded/.test(rec.outcome?.reason ?? ""), detail: rec.outcome?.reason });
  result.assertions.push({ name: "suppression row records the expiry", pass: store.listSuppressions().some((s) => s.candidateId === rec.candidateId && s.gate === "expiry") });
  result.assertions.push({ name: "zero signals, issuer never entered", pass: store.listSignals().length === 0 && store.getIssuanceAttempts() === 0 });

  saveDemo(result, { input: { ...input }, store: snapshot(store), tickReport: report });
  finish(result);
}

// ---------------------------------------------------------------------------
// DEMO (e) — RESTART / REPLAY IDEMPOTENCY
// ---------------------------------------------------------------------------
async function demoE(): Promise<void> {
  banner("e", "RESTART / REPLAY IDEMPOTENCY");
  const result: DemoResult = {
    id: "e", title: "Restart/replay: persisted, store reloaded from disk, re-ingested -> still exactly one signal", pass: false,
    flags: [
      "Idempotency is enforced by the sandbox doubles + orchestrator replay-safety (content-hash identity, replay-safe ingest). The identity-hash pattern mirrors production (equity actions.ts:480-481; crypto actions.ts:1984) but no live production function runs here — sandbox only by design.",
    ],
    identities: [],
    assertions: [], notes: [], evidenceFile: "",
  };
  summarizeFlags(result.flags);

  const path = storePath("e");
  const clock1 = manualClock(T0);
  const store1: WriteStore = new SandboxStore(path);
  const deps1: OrchestratorDeps = { store: store1, clock: clock1 };

  const input = cryptoCandidate();
  const first = await manualIssue(deps1, input);
  const signals1 = store1.listSignals().length;
  const attempts1 = store1.getIssuanceAttempts();
  result.notes.push(`first issuance: signalId=${first.issuedSignalId} signals=${signals1} issuanceAttempts=${attempts1}`);
  result.assertions.push({ name: "first manual issue succeeds", pass: first.status === "issued" && signals1 === 1 });

  // --- simulate a restart: brand-new store instance over the same file ---
  const clock2 = manualClock(T0 + 60_000);
  const store2: WriteStore = new SandboxStore(path); // reload from disk
  const deps2: OrchestratorDeps = { store: store2, clock: clock2 };
  const replayed = await manualIssue(deps2, input);

  result.assertions.push({ name: "reloaded store sees the persisted signal", pass: store2.listSignals().length === 1, detail: `signals=${store2.listSignals().length}` });
  result.assertions.push({ name: "replay resolves to issued, not duplicated", pass: replayed.status === "issued" && replayed.issuedSignalId === first.issuedSignalId, detail: replayed.issuedSignalId ?? "null" });
  result.assertions.push({ name: "issuer NOT re-entered on replay (attempts unchanged)", pass: store2.getIssuanceAttempts() === attempts1, detail: `attempts before=${attempts1} after=${store2.getIssuanceAttempts()}` });
  result.assertions.push({ name: "same signalId (content-hash identity)", pass: store2.listSignals()[0]?.signalId === first.issuedSignalId });

  // a tick over the reloaded store issues nothing new either
  const rTick = await tick(deps2);
  result.assertions.push({ name: "tick after restart issues nothing", pass: rTick.issued.length === 0 && store2.listSignals().length === 1 });

  saveDemo(result, { input: { ...input }, store: snapshot(store2), replayReport: { status: replayed.status, issuedSignalId: replayed.issuedSignalId }, tickReport: rTick });
  finish(result);
}

// ---------------------------------------------------------------------------
// VETO shared fixtures (mirror the exact holdout fixtures from
// veto/tests/veto.test.ts — the corrected three-way veto's own test style)
// ---------------------------------------------------------------------------
const D = (s: string): number => Date.parse(s);
const VETO_DECISION_AT = D("2026-10-13T09:00:00.000Z");
const VETO_ENTRY_AT = D("2026-10-13T09:02:00.000Z");
const VETO_FINAL_STOP = 98; // published stop: entry 100 - 1.25 x ATR14 1.6 (post-buildAtrLevels)

// Yesterday's completed UTC session: O 96, H 104, L 95, C 99.
// Its low (95) crosses the proposed stop (98) — but it is PRE-decision.
const vetoYesterdayBar: EvidenceBar = {
  startAt: D("2026-10-12T00:00:00.000Z"), endAt: D("2026-10-13T00:00:00.000Z"),
  open: 96, high: 104, low: 95, close: 99, isClosed: true,
  granularity: "session", source: "CoinGecko OHLC", label: "2026-10-12 UTC session",
};

function vetoIntradayBar(start: string, end: string, low: number, high: number, label: string): EvidenceBar {
  return {
    startAt: D(start), endAt: D(end), open: low + 0.5, high, low, close: high - 0.3,
    isClosed: true, granularity: "intraday", source: "CoinGecko OHLC", label,
  };
}

// ---------------------------------------------------------------------------
// DEMO (f) — PRE-DECISION CROSSING: yesterday crosses the stop, new setup
// forms afterward -> NO veto (setup feature, not invalidation).
// ---------------------------------------------------------------------------
async function demoF(): Promise<void> {
  banner("f", "PRE-DECISION CROSSING PER CORRECTED VETO");
  const result: DemoResult = {
    id: "f", title: "Pre-decision crossing is a setup feature, never a stop-out (no veto)", pass: false,
    flags: [
      "veto/src/veto.ts is a SANDBOX-NATIVE reference implementation (WORK ITEM 2/5), not imported or vendored from the terminal tree — the tree has no equivalent function. Exercised here end-to-end through the veto's own issuance path (runIssuanceChecks).",
      "The orchestrator issuance pipeline does NOT yet call runIssuanceChecks; this demo proves the veto module's three-way output, not orchestrator integration (integration is a flagged gap).",
    ],
    identities: ["runIssuanceChecks", "checkSetupInvalidation"],
    assertions: [], notes: [], evidenceFile: "",
  };
  for (const k of result.identities) printIdentity(k);
  summarizeFlags(result.flags);

  const out = runIssuanceChecks({
    invalidation: {
      direction: "long", finalStop: VETO_FINAL_STOP, decisionAt: VETO_DECISION_AT, entryAt: VETO_ENTRY_AT,
      finestGranularity: "intraday",
      bars: [vetoYesterdayBar, vetoIntradayBar("2026-10-13T09:00:00.000Z", "2026-10-13T10:00:00.000Z", 99.2, 100.6, "post-decision 1h (safe)")],
    },
    entryZone: { direction: "long", entry: 100, referenceEntry: 100, driftLimitBps: 50, entryAt: VETO_ENTRY_AT, expiresAt: null },
    pipeline: { draftStop: 99, publishedStop: VETO_FINAL_STOP },
  });

  console.log("  three-way output:");
  for (const c of out.checks) console.log(`    [${c.check}] ${c.verdict} — ${c.reason}`);

  const inv = out.checks.find((c) => c.check === "setup_invalidation" && c.detail !== undefined && "preDecisionFeatures" in c.detail)!;
  result.notes.push("Note: the pipeline-order guard shares the `setup_invalidation` check label in runIssuanceChecks output (checks[0]); the actual invalidation check is the one carrying detail.preDecisionFeatures (checks[1]).");
  const features = (inv.detail?.preDecisionFeatures ?? []) as { label?: string }[];
  result.assertions.push({ name: "issuance verdict is pass (no veto)", pass: out.verdict === "pass", detail: out.summary });
  result.assertions.push({ name: "setup_invalidation passes", pass: inv.verdict === "pass", detail: inv.reason });
  result.assertions.push({ name: "yesterday's crossing bar recorded as a SETUP FEATURE, never a stop-out", pass: features.some((f) => f.label === "2026-10-12 UTC session"), detail: JSON.stringify(features) });
  result.assertions.push({ name: "pipeline-order guard passes (final published stop graded)", pass: out.checks.some((c) => c.check === "setup_invalidation" && c.verdict === "pass") && out.checks[0]?.verdict === "pass", detail: out.checks[0]?.reason });
  result.assertions.push({ name: "all three checks pass", pass: out.checks.every((c) => c.verdict === "pass") });

  saveDemo(result, { issuanceVetoInput: { direction: "long", finalStop: VETO_FINAL_STOP }, threeWayOutput: out });
  finish(result);
}

// ---------------------------------------------------------------------------
// DEMO (g) — GENUINE SETUP INVALIDATION: post-decision bar breaches the final
// published stop -> veto fires; no issuance.
// ---------------------------------------------------------------------------
async function demoG(): Promise<void> {
  banner("g", "GENUINE SETUP INVALIDATION");
  const result: DemoResult = {
    id: "g", title: "Post-decision breach of the final published stop -> veto fires, no issuance", pass: false,
    flags: [
      "veto/src/veto.ts is SANDBOX-NATIVE (see demo f). The orchestrator's built-in born-dead check (vendored/production functions) covers the SIGNAL-DAY bar; the corrected veto's POST-DECISION invalidation is new logic with no terminal-tree counterpart — exercised end-to-end through runIssuanceChecks.",
    ],
    identities: ["runIssuanceChecks", "checkSetupInvalidation"],
    assertions: [], notes: [], evidenceFile: "",
  };
  for (const k of result.identities) printIdentity(k);
  summarizeFlags(result.flags);

  // Post-decision 2m bar 09:00Z-09:02Z sits fully inside [decisionAt, entryAt)
  // (it ends exactly at entryTime, so it does not straddle it); its low
  // 97.4 crosses the final published stop 98 -> definite breach -> fail.
  const invInput = {
    direction: "long" as const, finalStop: VETO_FINAL_STOP, decisionAt: VETO_DECISION_AT, entryAt: VETO_ENTRY_AT,
    finestGranularity: "intraday" as const,
    bars: [vetoYesterdayBar, vetoIntradayBar("2026-10-13T09:00:00.000Z", "2026-10-13T09:02:00.000Z", 97.4, 99.8, "post-decision 2m (breached)")],
  };
  const inv = checkSetupInvalidation(invInput);
  const out = runIssuanceChecks({
    invalidation: invInput,
    entryZone: { direction: "long", entry: 100, referenceEntry: 100, driftLimitBps: 50, entryAt: VETO_ENTRY_AT, expiresAt: null },
    pipeline: { draftStop: 99, publishedStop: VETO_FINAL_STOP },
  });

  console.log("  three-way output:");
  for (const c of out.checks) console.log(`    [${c.check}] ${c.verdict} — ${c.reason}`);

  result.assertions.push({ name: "setup_invalidation FAILS on the post-decision breach", pass: inv.verdict === "fail", detail: inv.reason });
  result.assertions.push({ name: "reason names born-dead LONG against the FINAL published stop", pass: /born-dead LONG/.test(inv.reason) && /final published stop 98/.test(inv.reason), detail: inv.reason });
  result.assertions.push({ name: "reason cites the post-decision bar", pass: /post-decision/.test(inv.reason), detail: inv.reason });
  result.assertions.push({ name: "issuance verdict is fail_closed (no issuance)", pass: out.verdict === "fail_closed", detail: out.summary });
  result.assertions.push({ name: "summary attributes the suppression to setup_invalidation=fail", pass: /setup_invalidation=fail/.test(out.summary), detail: out.summary });

  saveDemo(result, { setupInvalidationResult: inv, threeWayOutput: out });
  finish(result);
}

// ---------------------------------------------------------------------------
// DEMO (h) — STRADDLING UNCERTAINTY: decisionTime inside a forming candle
// whose pre-decision portion can't be isolated -> UNCERTAIN, fail-closed.
// ---------------------------------------------------------------------------
async function demoH(): Promise<void> {
  banner("h", "STRADDLING UNCERTAINTY");
  const result: DemoResult = {
    id: "h", title: "Straddling candle: pre-decision portion unisolable -> UNCERTAIN, fail-closed", pass: false,
    flags: [
      "veto/src/veto.ts is SANDBOX-NATIVE (see demo f). Exercised end-to-end through runIssuanceChecks.",
    ],
    identities: ["runIssuanceChecks", "checkSetupInvalidation"],
    assertions: [], notes: [], evidenceFile: "",
  };
  for (const k of result.identities) printIdentity(k);
  summarizeFlags(result.flags);

  // Forming 4h candle 08:00Z-12:00Z straddles decisionTime (09:00Z);
  // whole-bar low 97.5 crosses the stop 98, so the post-decision portion
  // provably cannot be shown safe -> uncertain.
  const formingBreached: EvidenceBar = {
    startAt: D("2026-10-13T08:00:00.000Z"), endAt: D("2026-10-13T12:00:00.000Z"),
    open: 99.8, high: 100.6, low: 97.5, close: 100.1, isClosed: false,
    provisional: true, granularity: "forming_candle", source: "CoinGecko OHLC", label: "forming 4h (breached)",
  };
  const invInput = {
    direction: "long" as const, finalStop: VETO_FINAL_STOP, decisionAt: VETO_DECISION_AT, entryAt: VETO_ENTRY_AT,
    finestGranularity: "forming_candle" as const,
    bars: [formingBreached],
  };
  const inv = checkSetupInvalidation(invInput);
  const out = runIssuanceChecks({
    invalidation: invInput,
    entryZone: { direction: "long", entry: 100, referenceEntry: 100, driftLimitBps: 50, entryAt: VETO_ENTRY_AT, expiresAt: null },
    pipeline: { draftStop: 99, publishedStop: VETO_FINAL_STOP },
  });

  console.log("  three-way output:");
  for (const c of out.checks) console.log(`    [${c.check}] ${c.verdict} — ${c.reason}`);

  result.assertions.push({ name: "setup_invalidation is UNCERTAIN", pass: inv.verdict === "uncertain", detail: inv.reason });
  result.assertions.push({ name: "reason names the straddle rule", pass: /straddles decisionTime/.test(inv.reason), detail: inv.reason });
  result.assertions.push({ name: "reason says the post-decision portion cannot be isolated", pass: /cannot be isolated/.test(inv.reason), detail: inv.reason });
  result.assertions.push({ name: "pre-decision portion never treated as a definite breach", pass: /never treated as a definite breach/.test(inv.reason), detail: inv.reason });
  result.assertions.push({ name: "issuance verdict is fail_closed", pass: out.verdict === "fail_closed", detail: out.summary });

  saveDemo(result, { setupInvalidationResult: inv, threeWayOutput: out });
  finish(result);
}

// ---------------------------------------------------------------------------
// READ-PATH ISOLATION — dossier view over a qualifying candidate: zero issuance
// ---------------------------------------------------------------------------
async function demoReadPath(): Promise<void> {
  banner("read-path", "READ-PATH ISOLATION");
  const result: DemoResult = {
    id: "read-path", title: "Dossier view over a qualifying candidate: zero issuance side effects", pass: false,
    flags: [
      "Read-path isolation is orchestrator-internal safety (runtime + static scan) — no production function is involved, by design: viewing a dossier must never be able to issue.",
    ],
    identities: [],
    assertions: [], notes: [], evidenceFile: "",
  };
  summarizeFlags(result.flags);

  const clock = manualClock(T0);
  const store = new SandboxStore(storePath("read-path"));
  const deps: OrchestratorDeps = { store, clock };

  const input = cryptoCandidate(); // qualifies — would issue if the read path could
  const rec = await ingestCandidate(deps, input);
  const attemptsBefore = store.getIssuanceAttempts();

  for (let i = 0; i < 3; i++) {
    const dossier = viewDossier(store, rec.candidateId);
    result.assertions.push({ name: `dossier view ${i + 1} returns the candidate, no signal yet`, pass: dossier !== null && dossier.signal === null && dossier.candidate.candidateId === rec.candidateId });
  }
  result.assertions.push({ name: "issuance attempts unchanged", pass: store.getIssuanceAttempts() === attemptsBefore, detail: `${attemptsBefore} -> ${store.getIssuanceAttempts()}` });
  result.assertions.push({ name: "zero signals after dossier views", pass: store.listSignals().length === 0 });
  result.assertions.push({ name: "zero alerts after dossier views", pass: store.listAlerts().length === 0 });
  result.assertions.push({ name: "zero suppressions after dossier views", pass: store.listSuppressions().length === 0 });

  // static scan: readpath.ts must not import any issuance capability
  const src = readFileSync(resolve(PS_DIR, "orchestrator/src/readpath.ts"), "utf8");
  const forbidden = ["issuers/equity-issuer", "issuers/crypto-issuer", "./orchestrator", "sandboxRecordSignal", "sandboxIssueGeneratedSignalCandidate", "persistIssuedSignal", "appendAlert", "noteIssuanceAttempt", "appendSuppression"];
  const leaks = forbidden.filter((t) => src.includes(t));
  result.assertions.push({ name: "readpath.ts statically imports no issuance capability", pass: leaks.length === 0, detail: leaks.length ? `leaks: ${leaks.join(",")}` : "clean" });

  // sanity: the same candidate still issues through the orchestrator afterwards
  await tick(deps);
  const dossierAfter = viewDossier(store, rec.candidateId)!;
  result.assertions.push({ name: "candidate still issues via the orchestrator after read-only views", pass: store.listSignals().length === 1 && dossierAfter.signal?.signalId === store.listSignals()[0]?.signalId });

  saveDemo(result, { input: { ...input }, store: snapshot(store), dossierAfterIssuance: dossierAfter });
  finish(result);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
function shortHash(h: string): string { return h.slice(0, 12) + "…"; }

async function main(): Promise<void> {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  mkdirSync(STORES_DIR, { recursive: true });
  mkdirSync(DEMOS_DIR, { recursive: true });

  console.log("paper-signal acceptance demonstrations (WORK ITEM 4/5) — SANDBOX ONLY");
  console.log("no production issuance, no live trading.\n");

  console.log("=== identity verification (runtime) ===");
  const fileChecks = verifyIdentities();
  for (const c of fileChecks) {
    console.log(`  ${c.pass ? "PASS" : "FAIL"}  ${c.file}`);
    console.log(`        expected ${c.expected}`);
    console.log(`        actual   ${c.actual}`);
  }
  console.log("  live-import reference equality (re-export === source-tree export):");
  const liveChecks = verifyLiveImport();
  for (const c of liveChecks) console.log(`  ${c.pass ? "PASS" : "FAIL"}  ${c.fn}`);

  let driftStatus = "unknown";
  const driftStatusFile = resolve(EVIDENCE_DIR, "drift-check.status");
  if (existsSync(driftStatusFile)) driftStatus = readFileSync(driftStatusFile, "utf8").trim();
  console.log(`  drift check (vendored ranges vs source): ${driftStatus}`);
  // crypto vendored functions also get a direct behavioral check against the
  // drift-tested reason strings.
  const { closes, highs } = makeCryptoHistory({ drift: -0.9, start: 140 });
  const bd = evaluateBornDead("long", 95, { day: "2026-10-13", open: 100, high: 101, low: 94, close: 100, source: "t" });
  const rg = evaluateShortRegimeGate(closes[closes.length - 1]!, closes, highs);
  const bdOk = bd.publish === false && bd.reason === "born-dead LONG: signal-day low 94 <= invalidation 95";
  const rgOk = rg.allowed === true && /bearish daily structure confirmed/.test(rg.reason);
  console.log(`  ${bdOk ? "PASS" : "FAIL"}  vendored evaluateBornDead reason string matches production`);
  console.log(`  ${rgOk ? "PASS" : "FAIL"}  vendored evaluateShortRegimeGate allows the falling fixture`);

  const identitiesOk = fileChecks.every((c) => c.pass) && liveChecks.every((c) => c.pass) && bdOk && rgOk;

  await demoA();
  await demoB();
  await demoC();
  await demoD();
  await demoE();
  await demoF();
  await demoG();
  await demoH();
  await demoReadPath();

  // --- evidence: identity + results -----------------------------------------
  const identityEvidence = {
    runAt: new Date().toISOString(),
    sourceExport: "hidden_files/source-export-2026-10-13",
    fileShaVerifications: fileChecks,
    liveImportReferenceEquality: liveChecks,
    driftCheckStatus: driftStatus,
    vendoredReasonStringChecks: { evaluateBornDead: bdOk, evaluateShortRegimeGate: rgOk },
    functions: IDENTITIES,
  };
  writeFileSync(resolve(EVIDENCE_DIR, "identity.json"), JSON.stringify(identityEvidence, null, 2), "utf8");

  const summary = {
    runAt: new Date().toISOString(),
    identitiesVerified: identitiesOk,
    driftCheckStatus: driftStatus,
    demos: results.map((r) => ({ id: r.id, title: r.title, pass: r.pass, assertions: r.assertions.length, failed: r.assertions.filter((a) => !a.pass).map((a) => a.name), flags: r.flags, evidenceFile: r.evidenceFile })),
  };
  writeFileSync(resolve(EVIDENCE_DIR, "results.json"), JSON.stringify(summary, null, 2), "utf8");

  // --- markdown report -------------------------------------------------------
  const lines: string[] = [];
  lines.push("# Paper-signal build — acceptance demonstration report (WORK ITEM 4/5)");
  lines.push("");
  lines.push(`Run at: ${new Date().toISOString()}`);
  lines.push("Mode: **sandbox only** — no production issuance, no live trading. All stores are file-backed sandbox JSON under `demo/evidence/stores/`; strategy ids are `paper-*`, venue `SANDBOX (paper)`.");
  lines.push("");
  lines.push("## Function identity verification (runtime, this run)");
  lines.push("");
  lines.push("| file | expected SHA-256 (hashes.txt) | recomputed | match |");
  lines.push("|---|---|---|---|");
  for (const c of fileChecks) lines.push(`| ${c.file} | ${c.expected} | ${c.actual} | ${c.pass ? "yes" : "**NO**"} |`);
  lines.push("");
  lines.push("Live-import reference equality (`imported-gates.ts` re-export `===` source-tree export via direct `createRequire` of `measurement.cjs`):");
  lines.push("");
  for (const c of liveChecks) lines.push(`- ${c.pass ? "PASS" : "**FAIL**"} — ${c.fn}`);
  lines.push("");
  lines.push(`Drift check (vendored source ranges re-hashed vs vendor-time hashes): **${driftStatus}** (log: \`evidence/drift-check.log\`).`);
  lines.push("");
  lines.push("### Function identities");
  lines.push("");
  for (const [key, id] of Object.entries(IDENTITIES)) {
    lines.push(`#### \`${id.fn}\` — ${id.provenance}`);
    lines.push(`- module: ${id.module}`);
    lines.push(`- source: ${id.source}`);
    lines.push(`- sha256: ${id.sha256}`);
    lines.push(`- note: ${id.note}`);
    lines.push("");
    void key;
  }
  lines.push("## Demo results");
  lines.push("");
  for (const r of results) {
    lines.push(`### (${r.id}) ${r.title} — ${r.pass ? "**PASS**" : "**FAIL**"}`);
    lines.push("");
    if (r.identities.length) {
      lines.push("Functions exercised:");
      for (const k of r.identities) {
        const id = IDENTITIES[k]!;
        lines.push(`- \`${id.fn}\` [${id.provenance}] — ${id.source} — sha256 \`${shortHash(id.sha256)}\``);
      }
      lines.push("");
    }
    for (const a of r.assertions) lines.push(`- ${a.pass ? "PASS" : "**FAIL**"} — ${a.name}${a.detail ? ` — \`${a.detail}\`` : ""}`);
    lines.push("");
    if (r.flags.length) {
      lines.push("Flags:");
      for (const f of r.flags) lines.push(`- ${f}`);
      lines.push("");
    }
    if (r.notes.length) {
      lines.push("Notes:");
      for (const n of r.notes) lines.push(`- ${n}`);
      lines.push("");
    }
    lines.push(`Evidence: \`${r.evidenceFile}\``);
    lines.push("");
  }
  lines.push("## Explicit per-demo verification-status summary");
  lines.push("");
  lines.push("| demo | production-function-backed? | status |");
  lines.push("|---|---|---|");
  lines.push("| (a) | live import (`reconstructAndValidateEquityCandidate` + `evaluateEquityIssuanceGate` + `computeEquityDecisionFromRawInputs`) at the issuer double; vendored `signalIssuanceDecision` at orchestrator qualification | verified |");
  lines.push("| (b) | vendored `evaluateBornDead` (crypto) | verified |");
  lines.push("| (c) | freshness gate is orchestrator-internal | **no production function** — sandbox logic, flagged |");
  lines.push("| (d) | TTL expiry is orchestrator-internal | **no production function** — sandbox logic, flagged |");
  lines.push("| (e) | idempotency pattern mirrors production but enforced by sandbox doubles | **no live production function** — by design, flagged |");
  lines.push("| (f) | veto module is sandbox-native reference | **not** imported/vendored production code — flagged; orchestrator does not yet call `runIssuanceChecks` |");
  lines.push("| (g) | veto module is sandbox-native reference | same flag as (f) |");
  lines.push("| (h) | veto module is sandbox-native reference | same flag as (f) |");
  lines.push("| read-path | orchestrator-internal safety | **no production function** — by design, flagged |");
  lines.push("");
  const allPass = identitiesOk && results.every((r) => r.pass);
  lines.push(`## Overall: ${allPass ? "**ALL GREEN**" : "**FAILURES PRESENT**"}`);
  lines.push("");
  writeFileSync(resolve(DEMO_DIR, "demo-report.md"), lines.join("\n"), "utf8");

  console.log("\n================================================================");
  console.log(" SUMMARY");
  console.log("================================================================");
  console.log(` identity verification: ${identitiesOk ? "PASS" : "FAIL"}   drift check: ${driftStatus}`);
  for (const r of results) console.log(`  (${r.id}) ${r.pass ? "PASS" : "FAIL"} — ${r.title}`);
  console.log(`\n overall: ${allPass ? "ALL GREEN" : "FAILURES PRESENT"}`);
  console.log(` evidence: ${EVIDENCE_DIR}`);
  console.log(` report:   ${resolve(DEMO_DIR, "demo-report.md")}`);

  if (!allPass) process.exit(1);
}

main().catch((err) => { console.error(err); process.exit(2); });
