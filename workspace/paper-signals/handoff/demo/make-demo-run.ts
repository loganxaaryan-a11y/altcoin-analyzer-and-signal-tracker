/**
 * DEMO discovery-run builder (SANDBOX DEMO DATA — not real discovery output).
 *
 * Builds one synthetic discovery run with six radar candidates exercising
 * every handoff outcome:
 *   DEMO1 long  — clean setup                     -> qualified (issued)
 *   DEMO2 short — bullish history                  -> abstained (short-regime)
 *   DEMO3 long  — entry-zone drift 500bps          -> abstained (issuance-veto)
 *   DEMO4 long  — no factor ledger                 -> failed (no-factor-ledger)
 *   DEMO5 long  — invalidation missing             -> failed (missing-entry-levels)
 *   DEMO6 long  — stale inputs, no quote provider  -> deferred (stale-inputs)
 *
 * Factor labels/values below are ILLUSTRATIVE demo fixtures. The handoff
 * persists whatever a real discovery run emits verbatim; it never invents
 * factor rows. Weights sum to 17.0 to mirror the frozen crypto production
 * total (freeze v2.1.5 §prediction_weights_unchanged).
 */
import type { DiscoveryRun, RadarCandidate, FactorRow, DecisionEvidence } from "../src/discovery-types.ts";

const DAY = 86_400_000;

function factorLedger(score: number): FactorRow[] {
  const rows: Array<[string, number, number]> = [
    ["trend-structure", 78, 3.0],
    ["momentum-12h", 71, 2.5],
    ["volatility-regime", 66, 2.0],
    ["volume-confirmation", 74, 2.0],
    ["funding-sentiment", 62, 1.5],
    ["orderflow-imbalance", 70, 2.0],
    ["btc-beta", 69, 2.0],
    ["liquidity-depth", 73, 2.0],
  ];
  return rows.map(([label, s, w]) => ({ label, score: s, weight: w, contribution: s * w }));
}

function evidence(nowMs: number, entryPrice: number, asOfMs: number, currentPrice: number | null, vetoBars: DecisionEvidence["vetoBars"] = []): DecisionEvidence {
  const closes = Array.from({ length: 60 }, (_, i) => entryPrice - (59 - i) * 0.5);
  return {
    signalDay: {
      day: new Date(nowMs - DAY).toISOString().slice(0, 10),
      open: entryPrice - 1,
      high: entryPrice + 1,
      low: entryPrice - 4.5,
      close: entryPrice,
      source: "DEMO-SCRIPTED",
    },
    historyCloses: closes,
    historyHighs: closes.map((c) => c + 0.4),
    currentPrice,
    asOf: new Date(asOfMs).toISOString(),
    vetoBars,
  };
}

function cleanVetoBar(nowMs: number): DecisionEvidence["vetoBars"] {
  const startAt = nowMs - 3_600_000;
  return [{
    startAt, endAt: startAt + 3_600_000,
    open: 99.5, high: 100.5, low: 96, close: 100,
    isClosed: true, granularity: "intraday", source: "DEMO-SCRIPTED", label: "post-decision 1h (clean)",
  }];
}

function base(symbol: string, direction: "long" | "short", nowMs: number): RadarCandidate {
  return {
    symbol,
    coinId: `demo-${symbol.toLowerCase()}`,
    name: `Demo ${symbol}`,
    direction,
    score: 70,
    entryPrice: 100,
    invalidation: direction === "long" ? 94 : 106,
    target1: direction === "long" ? 106 : 94,
    target2: direction === "long" ? 112 : 88,
    signalDate: new Date(nowMs - DAY).toISOString().slice(0, 10),
    detectedAt: new Date(nowMs - 30 * 60_000).toISOString(),
    factorLedger: factorLedger(70),
    totalWeight: 17.0,
    decisionEvidence: null,
    demoScript: null,
  };
}

export function buildDemoRun(nowMs: number, runId = "demo-discovery-run"): DiscoveryRun {
  const detected = nowMs - 5 * 60_000; // fresh: well inside the 30m freshness budget

  const c1 = base("DEMO1", "long", nowMs);
  c1.decisionEvidence = evidence(nowMs, 100, detected, 100, cleanVetoBar(nowMs));
  c1.demoScript = {
    label: "DEMO-SCRIPTED-FEED",
    prints: [{ offsetMs: 30_000, price: 100, venue: "binance-spot" }],
    waitingBars: [{ offsetMs: 10_000, price: 100.1, label: "waiting-interval point (clean)" }],
  };

  const c2 = base("DEMO2", "short", nowMs);
  c2.score = 68;
  c2.decisionEvidence = evidence(nowMs, 100, detected, 100); // rising history -> short-regime gate blocks

  const c3 = base("DEMO3", "long", nowMs);
  c3.score = 65;
  c3.decisionEvidence = evidence(nowMs, 100, detected, 105, cleanVetoBar(nowMs)); // 500bps drift -> issuance-veto

  const c4 = base("DEMO4", "long", nowMs);
  c4.decisionEvidence = evidence(nowMs, 100, detected, 100);
  c4.factorLedger = null; // no ledger -> cannot qualify
  c4.totalWeight = null;

  const c5 = base("DEMO5", "long", nowMs);
  c5.score = 71;
  c5.invalidation = null; // missing entry level -> never fabricated
  c5.decisionEvidence = evidence(nowMs, 100, detected, 100);

  const c6 = base("DEMO6", "long", nowMs);
  c6.score = 69;
  c6.decisionEvidence = evidence(nowMs, 100, nowMs - 2 * 3_600_000, 100); // 2h stale, no quote provider -> deferred
  c6.demoScript = {
    label: "DEMO-SCRIPTED-FEED",
    prints: [{ offsetMs: 30_000, price: 100, venue: "binance-spot" }],
    waitingBars: [{ offsetMs: 10_000, price: 100.1, label: "waiting-interval point (clean)" }],
  };

  return {
    runId,
    source: "DEMO-SCRIPTED-DISCOVERY (not a real discovery run)",
    completedAt: new Date(nowMs).toISOString(),
    freezeVersion: "v2.1.5",
    demo: true,
    candidates: [c1, c2, c3, c4, c5, c6],
  };
}

/** CLI: write the demo inbox file. `node demo/make-demo-run.ts [runId]` */
const isMain = process.argv[1]?.endsWith("make-demo-run.ts");
if (isMain) {
  const { writeFileSync, mkdirSync } = await import("node:fs");
  const { dirname, resolve } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const nowMs = Date.now();
  const runId = process.argv[2] ?? `demo-discovery-${new Date(nowMs).toISOString().replace(/[:.]/g, "-")}`;
  const run = buildDemoRun(nowMs, runId);
  const inboxDir = resolve(dirname(fileURLToPath(import.meta.url)), "..", "inbox");
  mkdirSync(inboxDir, { recursive: true });
  const path = resolve(inboxDir, `discovery-${runId}.json`);
  writeFileSync(path, JSON.stringify(run, null, 2));
  console.log(`[demo] wrote ${path} (${run.candidates.length} candidates, demo:true)`);
}
