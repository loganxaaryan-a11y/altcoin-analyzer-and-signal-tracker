/**
 * Sandbox issuance orchestrator — test suite (node:test).
 *
 * Proves: qualifying issuance exactly once, clean abstention with reason,
 * expired candidate rejected, restart/replay idempotency, read-path isolation
 * (dossier view -> zero issuance side effects), duplicate suppression, and
 * detection-to-alert delay recording. All against the sandbox doubles —
 * production issuance is never touched.
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { manualClock } from "../src/clock.js";
import type { Clock } from "../src/clock.js";
import type { FreshInputs, PaperCandidateInput } from "../src/types.js";
import { SandboxStore } from "../src/issuers/sandbox-store.js";
import type { WriteStore } from "../src/issuers/sandbox-store.js";
import {
  candidateIdFor, ingestCandidate, manualIssue, processCandidate, tick,
} from "../src/orchestrator.js";
import type { OrchestratorDeps } from "../src/orchestrator.js";
import { alertFeed, trackerView, viewDossier } from "../src/readpath.js";
import { sandboxRecordSignal } from "../src/issuers/equity-issuer.js";
import { sandboxIssueGeneratedSignalCandidate } from "../src/issuers/crypto-issuer.js";
import { evaluateBornDead, evaluateShortRegimeGate } from "../src/gates/crypto-gates.js";
import { signalIssuanceDecision } from "../src/gates/equity-gates.js";
import type { Point } from "../src/gates/equity-gates.js";
import { reconstructAndValidateEquityCandidate } from "../src/gates/imported-gates.js";
import {
  cryptoCandidate, cryptoInputs, equityCandidate, makeCryptoHistory, makeEquityBars,
} from "./fixtures.js";

const here = dirname(fileURLToPath(import.meta.url));
const T0 = Date.parse("2026-10-13T20:00:01.000Z");

interface Ctx {
  deps: OrchestratorDeps;
  clock: Clock & { advance(ms: number): void; set(ms: number): void };
  store: WriteStore;
  path: string;
}

function makeCtx(overrides: Partial<OrchestratorDeps["config"]> = {}, startMs = T0): Ctx {
  const path = join(mkdtempSync(join(tmpdir(), "orch-test-")), "store.json");
  const clock = manualClock(startMs);
  const store = new SandboxStore(path);
  const deps: OrchestratorDeps = { store, clock, config: { ...overrides } };
  return { deps, clock, store, path };
}

function pointsFromBars(bars: ReturnType<typeof makeEquityBars>): Point[] {
  return bars.map((b) => ({ date: b.date, close: b.close ?? 0, open: b.open, high: b.high, low: b.low, volume: b.volume ?? null }));
}

// ---------------------------------------------------------------- crypto ---

describe("crypto automatic path", () => {
  let ctx: Ctx;
  beforeEach(() => { ctx = makeCtx(); });

  it("qualifying long issues exactly once across repeated ticks", async () => {
    const input = cryptoCandidate(); // rising history; low (last-1.5) > invalidation (last-6)
    await ingestCandidate(ctx.deps, input);
    const r1 = await tick(ctx.deps);
    assert.deepEqual(r1.issued.length, 1);
    assert.equal(ctx.store.listSignals().length, 1);
    assert.equal(ctx.store.listAlerts().length, 1);

    const r2 = await tick(ctx.deps);
    assert.deepEqual(r2.issued.length, 0);
    assert.equal(ctx.store.listSignals().length, 1, "second tick must not re-issue");

    const rec = ctx.store.getCandidate(candidateIdFor(input))!;
    assert.equal(rec.status, "issued");
    assert.equal(rec.outcome?.kind, "issued");
    assert.equal(rec.issuedSignalId, ctx.store.listSignals()[0]!.signalId);
  });

  it("crypto issuer double is idempotent at the issuance layer", async () => {
    const input = cryptoCandidate();
    const rec = await ingestCandidate(ctx.deps, input);
    const draft = {
      coinId: input.coinId!, name: input.name, symbol: input.symbol, direction: input.direction,
      entry: input.entryPrice, invalidation: input.invalidation, target1: input.target1, target2: input.target2,
      confidence: input.score, signalDay: input.inputs.signalDay, historyCloses: input.inputs.historyCloses,
      historyHighs: input.inputs.historyHighs, currentPrice: input.inputs.currentPrice,
      createdAt: input.inputs.asOf, sourceAsOf: input.inputs.asOf,
    };
    const first = await sandboxIssueGeneratedSignalCandidate(ctx.store, ctx.clock, draft, rec.candidateId);
    const second = await sandboxIssueGeneratedSignalCandidate(ctx.store, ctx.clock, draft, rec.candidateId);
    assert.equal(first.status, "published");
    assert.equal(second.status, "already_exists");
    assert.equal(second.signalId, first.signalId);
    assert.equal(ctx.store.listSignals().length, 1);
  });

  it("born-dead long abstains cleanly with the gate reason persisted", async () => {
    const inputs = cryptoInputs();
    const last = inputs.historyCloses[inputs.historyCloses.length - 1]!;
    inputs.signalDay = { ...inputs.signalDay!, low: last - 10 }; // flush below invalidation
    const input = cryptoCandidate({ inputs, invalidation: last - 6 });
    await ingestCandidate(ctx.deps, input);
    const report = await tick(ctx.deps);

    assert.deepEqual(report.issued.length, 0);
    assert.deepEqual(report.rejected.length, 1);
    assert.equal(ctx.store.listSignals().length, 0);
    const rec = ctx.store.getCandidate(candidateIdFor(input))!;
    assert.equal(rec.status, "rejected");
    assert.equal(rec.outcome?.gate, "born-dead");
    assert.match(rec.outcome!.reason, /born-dead LONG/);
    const sup = ctx.store.listSuppressions().filter((s) => s.candidateId === rec.candidateId);
    assert.equal(sup.length, 1);
    assert.equal(sup[0]!.origin, "orchestrator");
  });

  it("short without bearish structure is rejected by the short-regime gate", async () => {
    const { closes, highs } = makeCryptoHistory({ drift: 0.8 }); // rising
    const last = closes[closes.length - 1]!;
    const inputs = cryptoInputs({
      signalDay: { day: "2026-10-13", open: last - 1, high: last + 1, low: last - 1, close: last, source: "sandbox-fixture" },
      historyCloses: closes, historyHighs: highs, currentPrice: last,
    });
    // short born-dead clears (high < invalidation), regime gate must block
    const input = cryptoCandidate({ direction: "short", inputs, invalidation: last + 6 });
    await ingestCandidate(ctx.deps, input);
    await tick(ctx.deps);
    const rec = ctx.store.getCandidate(candidateIdFor(input))!;
    assert.equal(rec.status, "rejected");
    assert.equal(rec.outcome?.gate, "short-regime");
    assert.equal(ctx.store.listSignals().length, 0);
  });

  it("short with bearish structure issues", async () => {
    const { closes, highs } = makeCryptoHistory({ drift: -0.9, start: 140 }); // falling
    const last = closes[closes.length - 1]!;
    const inputs = cryptoInputs({
      signalDay: { day: "2026-10-13", open: last + 1, high: last + 1.2, low: last - 1.2, close: last, source: "sandbox-fixture" },
      historyCloses: closes, historyHighs: highs, currentPrice: last,
    });
    const input = cryptoCandidate({ direction: "short", inputs, invalidation: last + 8 });
    await ingestCandidate(ctx.deps, input);
    const report = await tick(ctx.deps);
    assert.deepEqual(report.issued.length, 1);
    const rec = ctx.store.getCandidate(candidateIdFor(input))!;
    assert.equal(rec.status, "issued");
    assert.equal(ctx.store.listSignals()[0]!.direction, "short");
  });

  it("duplicate instrument+direction within window is suppressed to a single issuance", async () => {
    const a = cryptoCandidate({ symbol: "DUP", coinId: "dup" });
    const bInputs = cryptoInputs();
    const bLast = bInputs.historyCloses[bInputs.historyCloses.length - 1]!;
    const b = cryptoCandidate({
      symbol: "DUP", coinId: "dup", signalDate: "2026-10-12",
      entryPrice: bLast - 2, invalidation: bLast - 8, inputs: bInputs,
      detectedAt: "2026-10-12T18:00:00.000Z",
    });
    assert.notEqual(candidateIdFor(a), candidateIdFor(b), "different decision content -> different candidate ids");
    await ingestCandidate(ctx.deps, a);
    await ingestCandidate(ctx.deps, b);
    await tick(ctx.deps);

    assert.equal(ctx.store.listSignals().length, 1, "exactly one issuance for the instrument+direction");
    const recB = ctx.store.getCandidate(candidateIdFor(b))!;
    assert.equal(recB.status, "rejected");
    assert.equal(recB.outcome?.gate, "duplicate");
    assert.match(recB.outcome!.reason, /already issued/);
  });

  it("expired candidate is rejected with gate=expiry and never issued", async () => {
    ctx = makeCtx({ candidateTtlMs: 3_600_000 }, T0); // 1h TTL
    const input = cryptoCandidate({ detectedAt: "2026-10-13T17:00:00.000Z" }); // 3h old
    await ingestCandidate(ctx.deps, input);
    const report = await tick(ctx.deps);
    assert.deepEqual(report.expired.length, 1);
    const rec = ctx.store.getCandidate(candidateIdFor(input))!;
    assert.equal(rec.status, "expired");
    assert.equal(rec.outcome?.gate, "expiry");
    assert.match(rec.outcome!.reason, /TTL exceeded/);
    assert.equal(ctx.store.listSignals().length, 0);
  });

  it("detection-to-alert delays are recorded exactly", async () => {
    const ctx = makeCtx({ freshnessMs: 24 * 3_600_000 }); // keep the 2h-old inputs fresh
    const detectedAt = "2026-10-13T18:00:00.000Z";
    const input = cryptoCandidate({ detectedAt });
    await ingestCandidate(ctx.deps, input);
    ctx.clock.advance(2 * 3_600_000); // tick 2h after T0
    await tick(ctx.deps);

    const rec = ctx.store.getCandidate(candidateIdFor(input))!;
    const tickMs = ctx.clock.now();
    const expectedSpan = tickMs - Date.parse(detectedAt);
    assert.equal(rec.status, "issued");
    assert.deepEqual(rec.delays, {
      detectionToQualificationMs: expectedSpan,
      qualificationToIssuanceMs: 0,
      issuanceToAlertMs: 0,
      detectionToAlertMs: expectedSpan,
    });
    const signal = ctx.store.listSignals()[0]!;
    assert.deepEqual(signal.delays, rec.delays);
    assert.equal(signal.alertedAt, rec.alertedAt);
    const alerts = alertFeed(ctx.store);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0]!.channel, "sandbox-feed");
    assert.equal(alerts[0]!.signalId, signal.signalId);
  });

  it("stale inputs defer (never issue on stale evidence), then issue when fresh inputs arrive", async () => {
    ctx = makeCtx({ freshnessMs: 30 * 60_000 });
    const staleAsOf = new Date(T0 - 2 * 3_600_000).toISOString();
    const input = cryptoCandidate({ inputs: cryptoInputs({ asOf: staleAsOf }) });
    let providerCalls = 0;
    ctx.deps.quoteProvider = {
      refresh: async (candidate) => {
        providerCalls += 1;
        if (providerCalls === 1) return null; // provider failure first
        const fresh = cryptoInputs({ asOf: new Date(ctx.clock.now()).toISOString() });
        void candidate;
        return fresh;
      },
    };
    await ingestCandidate(ctx.deps, input);
    const r1 = await tick(ctx.deps);
    assert.deepEqual(r1.deferred.length, 1);
    const deferred = ctx.store.getCandidate(candidateIdFor(input))!;
    assert.equal(deferred.status, "deferred");
    assert.equal(deferred.outcome?.gate, "stale-inputs");
    assert.ok(deferred.nextReassessmentAt !== null);
    assert.equal(ctx.store.listSignals().length, 0);

    ctx.clock.set(Date.parse(deferred.nextReassessmentAt!) + 1); // past due
    const r2 = await tick(ctx.deps);
    assert.deepEqual(r2.issued.length, 1);
    assert.equal(ctx.store.listSignals().length, 1);
  });

  it("min-score floor abstains with reason", async () => {
    ctx = makeCtx({ minScore: 80 });
    const input = cryptoCandidate({ score: 72 });
    await ingestCandidate(ctx.deps, input);
    await tick(ctx.deps);
    const rec = ctx.store.getCandidate(candidateIdFor(input))!;
    assert.equal(rec.outcome?.gate, "min-score");
    assert.equal(ctx.store.listSignals().length, 0);
  });
});

// ---------------------------------------------------------------- manual ---

describe("manual path shares the single pipeline", () => {
  let ctx: Ctx;
  beforeEach(() => { ctx = makeCtx(); });

  it("manualIssue on a qualifying candidate issues via the same pipeline", async () => {
    const input = { ...cryptoCandidate(), source: "shortlist" as const };
    const rec = await manualIssue(ctx.deps, input);
    assert.equal(rec.status, "issued");
    assert.equal(rec.outcome?.via, "manual");
    assert.equal(rec.source, "manual");
    assert.equal(ctx.store.listSignals().length, 1);
    assert.equal(ctx.store.listAlerts().length, 1);
  });

  it("manualIssue on a born-dead candidate abstains with reason", async () => {
    const inputs = cryptoInputs();
    const last = inputs.historyCloses[inputs.historyCloses.length - 1]!;
    inputs.signalDay = { ...inputs.signalDay!, low: last - 10 };
    const rec = await manualIssue(ctx.deps, cryptoCandidate({ inputs, invalidation: last - 6 }));
    assert.equal(rec.status, "rejected");
    assert.equal(rec.outcome?.gate, "born-dead");
    assert.equal(rec.outcome?.via, "manual");
    assert.equal(ctx.store.listSignals().length, 0);
  });

  it("manual re-issue of the same candidate is idempotent (one signal)", async () => {
    const input = cryptoCandidate();
    await manualIssue(ctx.deps, input);
    const again = await manualIssue(ctx.deps, input);
    assert.equal(again.status, "issued");
    assert.equal(ctx.store.listSignals().length, 1);
  });
});

// ------------------------------------------------- restart / replay safety ---

describe("restart and replay idempotency", () => {
  it("same input replayed after a store reload issues exactly once", async () => {
    const ctx1 = makeCtx();
    const input = cryptoCandidate();
    await manualIssue(ctx1.deps, input);
    assert.equal(ctx1.store.listSignals().length, 1);

    // Simulate a restart: brand-new store instance over the same file.
    const clock2 = manualClock(T0 + 60_000);
    const store2: WriteStore = new SandboxStore(ctx1.path);
    const deps2: OrchestratorDeps = { store: store2, clock: clock2 };
    const replayed = await manualIssue(deps2, input);
    assert.equal(replayed.status, "issued");
    assert.equal(store2.listSignals().length, 1, "reload + replay must not duplicate");
    assert.equal(store2.getIssuanceAttempts(), ctx1.store.getIssuanceAttempts(),
      "replay of an issued candidate must not reach the issuer again");

    // And a tick over the reloaded store issues nothing new either.
    await tick(deps2);
    assert.equal(store2.listSignals().length, 1);
  });

  it("equity issuer double: identical retry returns already-existed, one signal", async () => {
    const ctx = makeCtx();
    const bars = makeEquityBars();
    const input = equityCandidate(bars);
    const rec = await ingestCandidate(ctx.deps, input);
    const evidence = {
      rawBars: bars,
      decisionAt: input.inputs.asOf,
      exchangeCalendar: "XNYS",
      instrumentType: "equity",
      sourceAsOf: input.inputs.asOf,
      sourceUrl: "sandbox://paper",
    };
    const first = await sandboxRecordSignal(ctx.store, ctx.clock, input.symbol, input.name, "paper-shortlist",
      input.direction, input.score, input.signalDate, rec.candidateId, evidence);
    const second = await sandboxRecordSignal(ctx.store, ctx.clock, input.symbol, input.name, "paper-shortlist",
      input.direction, input.score, input.signalDate, rec.candidateId, evidence);
    assert.equal(first.recorded, true);
    assert.equal(first.alreadyExisted, false);
    assert.equal(second.recorded, true);
    assert.equal(second.alreadyExisted, true);
    assert.equal(second.signalId, first.signalId);
    assert.equal(ctx.store.listSignals().length, 1);
  });
});

// ----------------------------------------------------------------- equity ---

describe("equity automatic path (real reconstruction import)", () => {
  // Equity fixtures are date-anchored to their synthetic bars; pin the clock
  // just after the evidence as-of time so TTL/freshness behave realistically.
  const equityCtx = (bars: ReturnType<typeof makeEquityBars>): Ctx => {
    const last = bars[bars.length - 1]!;
    return makeCtx({}, Date.parse(`${last.date}T22:00:01.000Z`));
  };

  it("qualifying long issues exactly once via the real reconstruction", async () => {
    const bars = makeEquityBars(); // 220 rising bars
    const ctx = equityCtx(bars);
    const input = equityCandidate(bars);
    await ingestCandidate(ctx.deps, input);
    const r1 = await tick(ctx.deps);
    assert.deepEqual(r1.issued.length, 1);
    const signal = ctx.store.listSignals()[0]!;
    assert.equal(signal.terminal, "equity");
    assert.equal(signal.direction, "long");
    assert.ok(signal.score >= 0);

    const r2 = await tick(ctx.deps);
    assert.deepEqual(r2.issued.length, 0);
    assert.equal(ctx.store.listSignals().length, 1);
    const tracked = trackerView(ctx.store);
    assert.equal(tracked.length, 1);
    assert.ok(tracked[0]!.delays?.detectionToAlertMs !== null);
  });

  it("born-dead long (signal-day flush through the stop) is rejected", async () => {
    const bars = makeEquityBars();
    const ctx = equityCtx(bars);
    const last = bars[bars.length - 1]!;
    last.low = (last.close ?? 0) - 8; // flush well below the ~2*ATR stop
    const input = equityCandidate(bars);
    await ingestCandidate(ctx.deps, input);
    await tick(ctx.deps);
    const rec = ctx.store.getCandidate(candidateIdFor(input))!;
    assert.equal(rec.status, "rejected");
    assert.equal(rec.outcome?.gate, "born-dead");
    assert.match(rec.outcome!.reason, /born-dead LONG/);
    assert.equal(ctx.store.listSignals().length, 0);
  });

  it("qualifying short issues (bearish structure via real reconstruction)", async () => {
    const bars = makeEquityBars({ drift: -0.35, start: 260, seed: 11 });
    const ctx = equityCtx(bars);
    const last = bars[bars.length - 1]!;
    // Keep OHLC coherent while holding the signal-day high below the short stop.
    last.high = Math.max(last.open ?? 0, last.close ?? 0) + 0.4;
    last.low = Math.min(last.open ?? 0, last.close ?? 0) - 0.6;
    const input = equityCandidate(bars, { direction: "short", invalidation: (last.close ?? 0) + 4 });
    await ingestCandidate(ctx.deps, input);
    const report = await tick(ctx.deps);
    const rec = ctx.store.getCandidate(candidateIdFor(input))!;
    assert.equal(rec.status, "issued", `expected issued, got ${rec.status}: ${rec.outcome?.reason}`);
    assert.deepEqual(report.issued.length, 1);
    assert.equal(ctx.store.listSignals()[0]!.direction, "short");
  });

  it("vendored signalIssuanceDecision rejects a short with no bearish structure", async () => {
    const bars = makeEquityBars({ n: 60 }); // rising history
    const history = pointsFromBars(bars);
    const signalDay = history[history.length - 1]!;
    const decision = signalIssuanceDecision("short", (signalDay.high ?? 0) + 5, signalDay, history);
    assert.equal(decision.allowed, false);
    assert.match(decision.reason ?? "", /short-regime/);
  });

  it("vendored equity gate agrees with the real imported reconstruction", async () => {
    for (const bars of [makeEquityBars(), (() => { const b = makeEquityBars(); const l = b[b.length - 1]!; l.low = (l.close ?? 0) - 8; return b; })()]) {
      const last = bars[bars.length - 1]!;
      const asOf = `${last.date}T22:00:00.000Z`;
      const reconstructed = reconstructAndValidateEquityCandidate(
        bars.map((b) => ({ ...b })), asOf, last.date,
        { invalidationAtrMultiple: 2, target1R: 1.5, target2R: 2.5 },
      );
      const history = pointsFromBars(bars);
      const signalDay = history.find((p) => p.date === last.date) ?? null;
      const invalidation = reconstructed.reconstruction.levels
        ? reconstructed.reconstruction.levels.stopPrice
        : (last.close ?? 0) - 4;
      const direction = reconstructed.reconstruction.decision?.direction ?? "long";
      const vendored = signalIssuanceDecision(direction, invalidation, signalDay, history);
      const realAllowed = reconstructed.status === "accepted";
      assert.equal(vendored.allowed, realAllowed,
        `vendored (${vendored.allowed}: ${vendored.reason}) vs real (${realAllowed}) must agree on ${last.date}`);
      if (!realAllowed) assert.match(vendored.reason ?? "", /born-dead/);
    }
  });

  it("vendored crypto gates match production reason strings", () => {
    const bornDead = evaluateBornDead("long", 95, { day: "2026-10-13", open: 100, high: 101, low: 94, close: 100, source: "t" });
    assert.deepEqual(bornDead, { publish: false, reason: "born-dead LONG: signal-day low 94 <= invalidation 95" });
    const missing = evaluateBornDead("long", 95, null);
    assert.equal(missing.publish, false);
    const { closes, highs } = makeCryptoHistory({ drift: -0.9, start: 140 });
    const regime = evaluateShortRegimeGate(closes[closes.length - 1]!, closes, highs);
    assert.equal(regime.allowed, true);
    assert.match(regime.reason, /bearish daily structure confirmed/);
  });
});

// ------------------------------------------------------- read-path safety ---

describe("read-path isolation: dossier views never issue", () => {
  it("viewing a qualifying candidate's dossier has zero issuance side effects", async () => {
    const ctx = makeCtx();
    const input = cryptoCandidate(); // qualifies — would issue if the read path could
    const rec = await ingestCandidate(ctx.deps, input);

    const attemptsBefore = ctx.store.getIssuanceAttempts();
    for (let i = 0; i < 3; i++) {
      const dossier = viewDossier(ctx.store, rec.candidateId);
      assert.ok(dossier, "dossier must exist");
      assert.equal(dossier!.signal, null, "not issued yet");
      assert.equal(dossier!.candidate.candidateId, rec.candidateId);
    }
    assert.equal(ctx.store.getIssuanceAttempts(), attemptsBefore, "read path must not touch the issuer");
    assert.equal(ctx.store.listSignals().length, 0);
    assert.equal(ctx.store.listAlerts().length, 0);
    assert.equal(ctx.store.listSuppressions().length, 0);
    assert.equal(viewDossier(ctx.store, "nonexistent"), null);

    // ...and the same candidate still issues fine through the orchestrator afterwards.
    await tick(ctx.deps);
    assert.equal(ctx.store.listSignals().length, 1);
    const dossierAfter = viewDossier(ctx.store, rec.candidateId)!;
    assert.equal(dossierAfter.signal?.signalId, ctx.store.listSignals()[0]!.signalId);
    assert.equal(dossierAfter.alerts.length, 1);
  });

  it("readpath.ts statically imports no issuance capability", () => {
    // NOTE: at runtime `here` is dist/.../tests; walk back up to the project source tree.
    const projectRoot = resolve(here, "..", "..", "..", "..");
    const src = readFileSync(resolve(projectRoot, "src", "readpath.ts"), "utf8");
    const forbidden = [
      "issuers/equity-issuer",
      "issuers/crypto-issuer",
      "./orchestrator",
      "sandboxRecordSignal",
      "sandboxIssueGeneratedSignalCandidate",
      "persistIssuedSignal",
      "appendAlert",
      "noteIssuanceAttempt",
      "appendSuppression",
    ];
    for (const token of forbidden) {
      assert.ok(!src.includes(token), `readpath.ts must not reference issuance capability: ${token}`);
    }
  });
});

// ------------------------------------------------------------- misc unit ---

describe("candidate identity", () => {
  it("is deterministic and insensitive to live-price/timestamp noise", () => {
    const a = cryptoCandidate();
    const b: PaperCandidateInput = {
      ...a,
      inputs: cryptoInputs({ asOf: new Date(T0 + 999_000).toISOString(), currentPrice: 12345.678 }),
      detectedAt: new Date(T0 + 999_000).toISOString(),
    };
    assert.equal(candidateIdFor(a), candidateIdFor(b));
    const c = cryptoCandidate({ direction: "short" });
    assert.notEqual(candidateIdFor(a), candidateIdFor(c));
  });

  it("ingest is replay-safe: re-ingesting never overwrites the record", async () => {
    const ctx = makeCtx();
    const input = cryptoCandidate();
    const first = await ingestCandidate(ctx.deps, input);
    await tick(ctx.deps);
    const second = await ingestCandidate(ctx.deps, { ...input, score: 99 });
    assert.equal(second.status, "issued");
    assert.equal(second.candidateId, first.candidateId);
  });
});

describe("processCandidate direct", () => {
  it("already-issued candidates are a no-op", async () => {
    const ctx = makeCtx();
    const input = cryptoCandidate();
    const rec = await ingestCandidate(ctx.deps, input);
    await tick(ctx.deps);
    const attempts = ctx.store.getIssuanceAttempts();
    const again = await processCandidate(ctx.deps, ctx.store.getCandidate(rec.candidateId)!, "automatic");
    assert.equal(again.status, "issued");
    assert.equal(ctx.store.getIssuanceAttempts(), attempts);
    assert.equal(ctx.store.listSignals().length, 1);
  });
});
