/**
 * Handoff enforcement + outcome-recording tests (sandbox).
 *
 *  - No factor ledger -> MissingLedgerError from requireLedger(); the
 *    handoff records the candidate as failed/no-factor-ledger and NEVER
 *    ingests it into the issuance store.
 *  - Full runHandoffRun over the six-candidate demo run (scripted feeds):
 *    every candidate ends with exactly one recorded outcome, with the
 *    expected outcome + reason code; counts match; ledger rows exist for
 *    every candidate BEFORE qualification (persistence precedes issuance —
 *    asserted by checking the failed candidates' ledger rows too).
 */
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { HandoffStore, MissingLedgerError, candidateKeyFor } from "../src/ledger-store.ts";
import { runHandoffRun, type HandoffRunReport } from "../src/qualify.ts";
import { buildDemoRun } from "../demo/make-demo-run.ts";
import type { DiscoveryRun } from "../src/discovery-types.ts";

const here = dirname(fileURLToPath(import.meta.url));
const PS = resolve(here, "..", "..");

let workdir: string;
let report: HandoffRunReport;
let run: DiscoveryRun;

before(async () => {
  workdir = mkdtempSync(join(tmpdir(), "handoff-test-"));
  const nowMs = Date.now();
  run = buildDemoRun(nowMs, "test-demo-run");
  report = await runHandoffRun({
    run,
    feedMode: "scripted",
    orchestratorDbPath: join(workdir, "orchestrator.sqlite"),
    handoffDbPath: join(workdir, "handoff.sqlite"),
    clockStartMs: nowMs,
    invocationPrefix: "test",
  });
});

after(() => {
  rmSync(workdir, { recursive: true, force: true });
});

describe("handoff: ledger persistence precedes qualification", () => {
  it("requireLedger throws MissingLedgerError when no complete ledger exists", () => {
    const store = new HandoffStore(join(workdir, "probe.sqlite"));
    try {
      const nowMs = Date.now();
      const r = buildDemoRun(nowMs, "probe-run");
      store.persistDiscoveryRun(r, new Date().toISOString());
      const noLedgerKey = candidateKeyFor(r.runId, r.candidates[3]!); // DEMO4: factorLedger null
      assert.throws(() => store.requireLedger(noLedgerKey), MissingLedgerError);
      const okKey = candidateKeyFor(r.runId, r.candidates[0]!); // DEMO1: complete
      const { ledgerHash } = store.requireLedger(okKey);
      assert.match(ledgerHash, /^[0-9a-f]{64}$/);
    } finally {
      store.close();
    }
  });

  it("every candidate has a persisted ledger row even when qualification fails", () => {
    const store = new HandoffStore(join(workdir, "handoff.sqlite"));
    try {
      // One outcome row per candidate; each outcome carries the ledger hash
      // (null only when the candidate arrived with no ledger at all).
      const outcomes = store.outcomesForRun(run.runId);
      assert.equal(outcomes.length, 6, "one outcome row per candidate");
      const bySymbol = new Map(outcomes.map((o) => [o.symbol, o]));
      const keyFor = (s: string) => candidateKeyFor(run.runId, run.candidates.find((c) => c.symbol === s)!);
      // DEMO4 arrived with no factor ledger: the ledger ROW exists (evidence of
      // what discovery emitted) but is incomplete — and the outcome is failed.
      assert.equal(store.ledgerCompleteFor(keyFor("DEMO4")), false);
      assert.equal(bySymbol.get("DEMO4")!.outcome, "failed");
      assert.equal(bySymbol.get("DEMO4")!.reasonCode, "no-factor-ledger");
      // Every other candidate has a complete, hash-pinned ledger.
      for (const s of ["DEMO1", "DEMO2", "DEMO3", "DEMO5", "DEMO6"]) {
        assert.equal(store.ledgerCompleteFor(keyFor(s)), true, `${s} ledger should be complete`);
        assert.match(bySymbol.get(s)!.ledgerHash ?? "", /^[0-9a-f]{64}$/, `${s} should carry a ledger hash`);
      }
    } finally {
      store.close();
    }
  });
});

describe("handoff: outcome recording with exact reason codes", () => {
  it("counts: 1 qualified, 2 abstained, 1 deferred, 2 failed", () => {
    assert.deepEqual(report.counts, { qualified: 1, abstained: 2, deferred: 1, failed: 2 });
  });

  it("each candidate carries the expected outcome + reason code", () => {
    const bySymbol = new Map(report.candidates.map((c) => [c.symbol, c]));
    const get = (s: string) => {
      const c = bySymbol.get(s);
      assert.ok(c, `missing result for ${s}`);
      return c!;
    };
    assert.equal(get("DEMO1").outcome, "qualified");
    assert.equal(get("DEMO1").reasonCode, "issued");
    assert.equal(get("DEMO2").outcome, "abstained");
    assert.equal(get("DEMO2").reasonCode, "short-regime");
    assert.equal(get("DEMO3").outcome, "abstained");
    assert.equal(get("DEMO3").reasonCode, "issuance-veto");
    assert.equal(get("DEMO4").outcome, "failed");
    assert.equal(get("DEMO4").reasonCode, "no-factor-ledger");
    assert.equal(get("DEMO5").outcome, "failed");
    assert.equal(get("DEMO5").reasonCode, "missing-entry-levels");
    assert.equal(get("DEMO6").outcome, "deferred");
    assert.equal(get("DEMO6").reasonCode, "stale-inputs");
  });

  it("the no-ledger candidate never reached the issuance store", async () => {
    const distDb = (await import(resolve(PS, "orchestrator/dist/paper-signals/orchestrator/src/persistence/db-store.js"))) as Record<string, any>;
    const store = new distDb.DbStore(join(workdir, "orchestrator.sqlite"));
    try {
      const symbols = new Set(store.listCandidates().map((c: { symbol: string }) => c.symbol));
      assert.ok(!symbols.has("DEMO4"), "DEMO4 (no ledger) must never be ingested");
      assert.ok(!symbols.has("DEMO5"), "DEMO5 (missing levels) must never be ingested");
      assert.ok(symbols.has("DEMO1") && symbols.has("DEMO2") && symbols.has("DEMO3") && symbols.has("DEMO6"));
      assert.equal(store.listSignals().length, 1, "exactly one paper signal issued (DEMO1)");
      assert.equal(store.listSignals()[0].symbol, "DEMO1");
    } finally {
      store.close();
    }
  });

  it("stale discovery runs refuse qualification for every candidate", async () => {
    const wd = mkdtempSync(join(tmpdir(), "handoff-stale-"));
    try {
      const nowMs = Date.now();
      const stale = buildDemoRun(nowMs - 24 * 3_600_000, "stale-run");
      stale.completedAt = new Date(nowMs - 24 * 3_600_000).toISOString();
      const rep = await runHandoffRun({
        run: stale,
        feedMode: "scripted",
        orchestratorDbPath: join(wd, "orch.sqlite"),
        handoffDbPath: join(wd, "handoff.sqlite"),
        clockStartMs: nowMs,
        invocationPrefix: "test-stale",
        maxDiscoveryAgeMs: 8 * 3_600_000,
      });
      assert.equal(rep.staleRun, true);
      assert.deepEqual(rep.counts, { qualified: 0, abstained: 0, deferred: 0, failed: 6 });
      assert.ok(rep.candidates.every((c) => c.reasonCode === "stale-discovery-run"));
    } finally {
      rmSync(wd, { recursive: true, force: true });
    }
  });
});
