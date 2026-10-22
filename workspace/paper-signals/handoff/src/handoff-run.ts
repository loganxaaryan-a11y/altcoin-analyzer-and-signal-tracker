/**
 * handoff-run — CLI entrypoint for the discovery -> paper qualification handoff.
 *
 * Usage:
 *   node src/handoff-run.ts --feed binance [--inbox <dir>] [--run <file>]
 *   node src/handoff-run.ts --feed scripted --demo-run <file>   # labeled demos only
 *
 * Reads the newest discovery-*.json from the inbox (or --run), persists every
 * candidate's factor ledger + decision-time evidence FIRST, then routes each
 * candidate through the repaired paper path (processIntegratedCandidate,
 * via "automatic") under the frozen v2.1.5 rules, and records one outcome
 * per candidate: qualified | abstained (reason code) | deferred (reason) |
 * failed (reason).
 *
 * PAPER ONLY. No brokerage. The legacy issuer is unreachable (runtime guard
 * + static import-graph test).
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { runHandoffRun, type HandoffRunReport } from "./qualify.ts";
import type { DiscoveryRun } from "./discovery-types.ts";
import type { FeedMode } from "./feeds.ts";

const here = dirname(fileURLToPath(import.meta.url));
const HANDOFF_DIR = resolve(here, "..");

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  return def;
}

function newestInboxFile(inboxDir: string): string {
  const files = readdirSync(inboxDir)
    .filter((f) => f.startsWith("discovery-") && f.endsWith(".json"))
    .map((f) => resolve(inboxDir, f))
    .sort();
  if (files.length === 0) throw new Error(`no discovery-*.json in inbox ${inboxDir}: refusing to run with no discovery output (never fabricate candidates)`);
  return files[files.length - 1]!;
}

function validateRun(raw: unknown): DiscoveryRun {
  const r = raw as Partial<DiscoveryRun>;
  if (!r || typeof r.runId !== "string" || !Array.isArray(r.candidates) || typeof r.completedAt !== "string") {
    throw new Error("inbox file is not a valid DiscoveryRun (runId/completedAt/candidates required)");
  }
  if (!Number.isFinite(Date.parse(r.completedAt))) {
    throw new Error(`discovery run completedAt ${JSON.stringify(r.completedAt)} is not a valid timestamp`);
  }
  return r as DiscoveryRun;
}

async function main(): Promise<void> {
  const feed = (arg("--feed", "binance") as FeedMode);
  if (feed !== "scripted" && feed !== "binance") throw new Error(`--feed must be scripted|binance, got ${feed}`);
  const inboxDir = resolve(arg("--inbox", resolve(HANDOFF_DIR, "inbox"))!);
  const runFile = arg("--run") ? resolve(arg("--run")!) : newestInboxFile(inboxDir);
  const run = validateRun(JSON.parse(readFileSync(runFile, "utf8")));

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dataDir = resolve(HANDOFF_DIR, "data");
  mkdirSync(dataDir, { recursive: true });
  const evidenceDir = resolve(HANDOFF_DIR, "evidence");
  mkdirSync(evidenceDir, { recursive: true });

  console.log(`[handoff] discovery run ${run.runId} (${run.candidates.length} candidates, completed ${run.completedAt})`);
  console.log(`[handoff] feed=${feed} inbox=${basename(runFile)}`);

  const report: HandoffRunReport = await runHandoffRun({
    run,
    feedMode: feed,
    orchestratorDbPath: resolve(dataDir, `orchestrator-${run.runId}.sqlite`),
    handoffDbPath: resolve(dataDir, "handoff.sqlite"),
    clockStartMs: Date.parse(run.completedAt),
    invocationPrefix: "handoff",
    httpLogPath: resolve(evidenceDir, `http-calls-${run.runId}.jsonl`),
  });

  const reportPath = resolve(evidenceDir, `handoff-report-${run.runId}.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`[handoff] report -> ${reportPath}`);

  const c = report.counts;
  console.log(`[handoff] counts: qualified=${c.qualified} abstained=${c.abstained} deferred=${c.deferred} failed=${c.failed}`);
  for (const cand of report.candidates) {
    console.log(`[handoff]   ${cand.symbol} ${cand.direction}: ${cand.outcome} (${cand.reasonCode}) — ${cand.reason.slice(0, 120)}`);
  }
  if (report.staleRun) {
    console.log(`[handoff] STALE RUN: discovery output too old — nothing qualified`);
  }
}

main().catch((err) => {
  console.error(`[handoff] FATAL: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  process.exit(1);
});
