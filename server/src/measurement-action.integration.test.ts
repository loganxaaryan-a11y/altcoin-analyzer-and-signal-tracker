import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Ctx } from "@hatch/space-sdk";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { Actions, injectMeasurementDependencies } from "./actions";
import * as schema from "./schema";
import { EVALUATION_METHOD_VERSION } from "./signal-methodology";

const databases: Database[] = [];
const migrationRoot = resolve(import.meta.dir, "../../drizzle");

function productionDatabase() {
  const sqlite = new Database(":memory:", { strict: true });
  sqlite.exec("PRAGMA foreign_keys=ON;");
  for (const file of readdirSync(migrationRoot).filter((name) => name.endsWith(".sql")).sort()) {
    const sql = readFileSync(resolve(migrationRoot, file), "utf8").replaceAll("--> statement-breakpoint", "");
    sqlite.exec(sql);
  }
  databases.push(sqlite);
  return sqlite;
}

function context(sqlite: Database, invocationId: string): Ctx {
  const db = drizzle(sqlite);
  return { invocationId, db: () => db, invalidateQueries: () => undefined } as unknown as Ctx;
}

function seedFrozenMissingSourceRun(sqlite: Database, runId: string, startedAt: number): void {
  const snapshot = JSON.stringify([{ signalId: "legacy_999", legacySignalId: 999, ordinal: 0, eligible: true, eligibilityReason: "Eligible frozen fixture." }]);
  sqlite.query(`INSERT INTO measurement_runs (
    run_id, terminal, cohort, evaluator_version, source_commit, status,
    started_at, evaluation_cutoff_at, completed_at, last_successful_complete_at,
    lease_token, lease_expires_at, checkpoint_version, cursor, batch_size,
    signals_in_scope, retrieved, eligible_due, evaluated, pending, ambiguous,
    unverified, excluded, failed, snapshot_json, definitions_json,
    failed_ids_json, retry_pending, updated_at
  ) VALUES (?, 'crypto', 'fixture', 'first-touch-ohlc-v3', 'fixture', 'running',
    ?, ?, NULL, NULL, NULL, NULL, 0, 0, 1,
    1, 0, 0, 0, 1, 0, 0, 0, 0, ?, '{}', '[]', 0, ?)`)
    .run(runId, startedAt, startedAt, snapshot, startedAt);
}

const factorLedger = JSON.stringify([{ label: "fixture", reading: "frozen", source: "fixture", score: 1, weight: 1, contribution: 1 }]);

async function seedFrozenValidRun(sqlite: Database, runId: string, startedAt: number): Promise<void> {
  const db = drizzle(sqlite);
  const oldEntry = new Date(startedAt - 11 * 86_400_000);
  const freshEntry = new Date(startedAt - 1 * 86_400_000);
  const inserted = await db.insert(schema.generatedSignals).values([
    { coinId: "fixture-old", name: "Fixture Old", symbol: "OLD", direction: "long", confidence: 70, setupType: "fixture", entry: 100, invalidation: 50, target1: 150, target2: 175, factorsJson: factorLedger, sourceAsOf: oldEntry, createdAt: oldEntry },
    { coinId: "fixture-fresh", name: "Fixture Fresh", symbol: "FRESH", direction: "long", confidence: 70, setupType: "fixture", entry: 100, invalidation: 50, target1: 150, target2: 175, factorsJson: factorLedger, sourceAsOf: freshEntry, createdAt: freshEntry },
  ]).returning({ id: schema.generatedSignals.id });
  const oldId = inserted[0]?.id;
  const freshId = inserted[1]?.id;
  if (oldId === undefined || freshId === undefined) throw new Error("Unable to seed valid measurement signals");
  const contracts = [
    { legacyId: oldId, signalId: "fixture-old-signal", coinId: "fixture-old", symbol: "OLD", entryAt: oldEntry },
    { legacyId: freshId, signalId: "fixture-fresh-signal", coinId: "fixture-fresh", symbol: "FRESH", entryAt: freshEntry },
  ];
  for (const contract of contracts) {
    await db.insert(schema.signalContracts).values({ signalId: contract.signalId, legacySignalId: contract.legacyId, amendsSignalId: null, idempotencyKey: `fixture-${contract.signalId}`, issuanceClaim: "fixture", issuanceState: "complete", entryEvidenceJson: "{}", evaluatorVersion: EVALUATION_METHOD_VERSION, assetId: contract.coinId, symbol: contract.symbol, venue: "fixture", instrumentType: "spot", exchangeCalendar: "24/7", direction: "long", strategyId: "fixture", strategyVersion: "fixture", parameterHash: "fixture", buildId: "fixture", decisionAt: contract.entryAt, availableAt: contract.entryAt, issuedAt: contract.entryAt, entryAt: contract.entryAt, expiresAt: new Date(contract.entryAt.getTime() + 30 * 86_400_000), inputSnapshotId: 1, barStart: new Date(contract.entryAt.getTime() - 86_400_000), barEnd: contract.entryAt, barIsClosed: true, priceBasis: "fixture close", entryRule: "fixture", entryPrice: 100, stopPrice: 50, targetPrice: 150, riskPerUnit: 50, primaryHorizon: 30, horizonUnit: "elapsed_days", featureValuesJson: "{}", gateResultsJson: "{}", setupScore: 70, scoreDefinition: "fixture", dataCoverageJson: "{}", validationStatus: "unverified_prospective", levelsJson: "{}", createdAt: contract.entryAt });
  }
  const snapshot = JSON.stringify(contracts.map((contract, ordinal) => ({ signalId: `legacy_${contract.legacyId}`, legacySignalId: contract.legacyId, ordinal, eligible: true, eligibilityReason: "Eligible frozen fixture." })));
  sqlite.query(`INSERT INTO measurement_runs (
    run_id, terminal, cohort, evaluator_version, source_commit, status,
    started_at, evaluation_cutoff_at, completed_at, last_successful_complete_at,
    lease_token, lease_expires_at, checkpoint_version, cursor, batch_size,
    signals_in_scope, retrieved, eligible_due, evaluated, pending, ambiguous,
    unverified, excluded, failed, snapshot_json, definitions_json,
    failed_ids_json, retry_pending, updated_at
  ) VALUES (?, 'crypto', 'fixture', 'first-touch-ohlc-v3', 'fixture', 'running',
    ?, ?, NULL, NULL, NULL, NULL, 0, 0, 2,
    2, 0, 0, 0, 2, 0, 0, 0, 0, ?, '{}', '[]', 0, ?)`)
    .run(runId, startedAt, startedAt, snapshot, startedAt);
  for (const [ordinal, contract] of contracts.entries()) {
    sqlite.query(`INSERT INTO measurement_run_items (
      run_id, signal_id, legacy_signal_id, membership_ordinal, status, reason,
      trade_state, trade_state_reason, sources_json, attempt_count, evaluated_at, created_at
    ) VALUES (?, ?, ?, ?, 'pending', 'Awaiting fixture evaluation.', 'unknown', 'Not evaluated.', '[]', 0, ?, ?)`)
      .run(runId, `legacy_${contract.legacyId}`, contract.legacyId, ordinal, startedAt, startedAt);
  }
}

function validDependencies(now: () => Date, historyAnchorMs: number) {
  return {
    now,
    loadHistory: async (coinId: string, symbol: string) => {
      const start = coinId === "fixture-old" ? historyAnchorMs - 11 * 86_400_000 : historyAnchorMs - 1 * 86_400_000;
      const count = coinId === "fixture-old" ? 11 : 1;
      return { state: { source: "binance" }, funding: [], bars: Array.from({ length: count }, (_, index) => ({ coinId, symbol, day: new Date(start + index * 86_400_000).toISOString().slice(0, 10), ts: start + index * 86_400_000, open: 100, high: 105, low: 95, close: 102, volume: 1_000_000, source: "binance" as const, fetchedAt: now() })) };
    },
    loadPrices: async (coinIds: string[]) => new Map(coinIds.map((coinId) => [coinId, 102])),
  };
}

async function invokeActualHandler(ctx: Ctx, runId: string) {
  return Actions.runDailySignalPostmortem.handler(ctx, { runId, batchSize: 1, trigger: "manual" });
}

afterEach(() => {
  while (databases.length) databases.pop()?.close();
});

describe("production runDailySignalPostmortem handler", () => {
  test("claims a timestamp_ms lease without binding a JavaScript Date into raw SQL", async () => {
    const sqlite = productionDatabase();
    const nowMs = Date.parse("2026-10-12T12:00:00.000Z");
    seedFrozenMissingSourceRun(sqlite, "raw-date-regression", nowMs);
    const ctx = context(sqlite, "worker-raw-date");
    injectMeasurementDependencies(ctx, { now: () => new Date(nowMs) });

    const result = await invokeActualHandler(ctx, "raw-date-regression");

    expect(result.run.cursor).toBe(0);
    expect(result.run.failed).toBe(1);
    expect(result.run.status).toBe("partial");
    const run = sqlite.query("SELECT lease_token, lease_expires_at, checkpoint_version FROM measurement_runs WHERE run_id=?").get("raw-date-regression") as { lease_token: string | null; lease_expires_at: number | null; checkpoint_version: number };
    expect(run.lease_token).toBeNull();
    expect(run.lease_expires_at).toBeNull();
    expect(run.checkpoint_version).toBeGreaterThan(0);
  });

  test("expired worker is fenced before missing-item, revision, event, snapshot, or brief writes after takeover", async () => {
    const sqlite = productionDatabase();
    const startedAt = Date.parse("2026-10-12T12:00:00.000Z");
    seedFrozenMissingSourceRun(sqlite, "takeover-regression", startedAt);
    const workerA = context(sqlite, "worker-a");
    const workerB = context(sqlite, "worker-b");
    let releaseA: (() => void) | undefined;
    let signalPaused: (() => void) | undefined;
    const paused = new Promise<void>((resolvePaused) => { signalPaused = resolvePaused; });
    const release = new Promise<void>((resolveRelease) => { releaseA = resolveRelease; });
    injectMeasurementDependencies(workerA, {
      now: () => new Date(startedAt),
      beforeOwnedMutation: async (stage) => {
        if (stage !== "missing_source_item") return;
        signalPaused?.();
        await release;
      },
    });
    const oldWorker = invokeActualHandler(workerA, "takeover-regression");
    await paused;

    injectMeasurementDependencies(workerB, { now: () => new Date(startedAt + 11 * 60_000) });
    const winner = await invokeActualHandler(workerB, "takeover-regression");
    expect(winner.run.status).toBe("partial");
    expect(winner.run.failed).toBe(1);

    releaseA?.();
    await expect(oldWorker).rejects.toThrow("lost ownership before missing_source_item");

    const itemRows = sqlite.query("SELECT signal_id, status, attempt_count FROM measurement_run_items WHERE run_id=?").all("takeover-regression") as Array<{ signal_id: string; status: string; attempt_count: number }>;
    expect(itemRows).toEqual([{ signal_id: "legacy_999", status: "failed", attempt_count: 1 }]);
    expect((sqlite.query("SELECT COUNT(*) AS n FROM signal_evaluation_revisions").get() as { n: number }).n).toBe(0);
    expect((sqlite.query("SELECT COUNT(*) AS n FROM signal_outcome_events").get() as { n: number }).n).toBe(0);
    expect((sqlite.query("SELECT COUNT(*) AS n FROM signal_interim_snapshots").get() as { n: number }).n).toBe(0);
    expect((sqlite.query("SELECT COUNT(*) AS n FROM signal_daily_briefs").get() as { n: number }).n).toBe(1);
  });

  test("valid-source late worker is fenced after renewal and cannot alter winner payloads", async () => {
    const sqlite = productionDatabase();
    const startedAt = Date.parse("2026-10-12T12:00:00.000Z");
    await seedFrozenValidRun(sqlite, "valid-takeover", startedAt);
    const workerA = context(sqlite, "valid-worker-a");
    const workerB = context(sqlite, "valid-worker-b");
    let nowMs = startedAt;
    let releaseA: (() => void) | undefined;
    let signalPaused: (() => void) | undefined;
    let didPause = false;
    const paused = new Promise<void>((resolvePaused) => { signalPaused = resolvePaused; });
    const release = new Promise<void>((resolveRelease) => { releaseA = resolveRelease; });
    injectMeasurementDependencies(workerA, {
      ...validDependencies(() => new Date(nowMs), startedAt),
      beforeOwnedMutation: async (stage) => {
        if (stage !== "run_item" || didPause) return;
        didPause = true;
        signalPaused?.();
        await release;
      },
    });
    const oldWorker = invokeActualHandler(workerA, "valid-takeover");
    await paused;

    nowMs += 11 * 60_000;
    injectMeasurementDependencies(workerB, validDependencies(() => new Date(nowMs), startedAt));
    const winner = await invokeActualHandler(workerB, "valid-takeover");
    expect(winner.run.status).toBe("complete");
    const beforeResume = {
      items: sqlite.query("SELECT signal_id, status, attempt_count, sources_json FROM measurement_run_items WHERE run_id=? ORDER BY signal_id").all("valid-takeover"),
      revisions: sqlite.query("SELECT signal_id, product, horizon, evidence_hash FROM signal_evaluation_revisions ORDER BY signal_id, product, horizon, revision").all(),
      events: sqlite.query("SELECT signal_id, event_hash FROM signal_outcome_events ORDER BY signal_id, id").all(),
      snapshots: sqlite.query("SELECT signal_id, captured_day, current_price FROM signal_interim_snapshots ORDER BY signal_id").all(),
      briefs: sqlite.query("SELECT captured_day, summary FROM signal_daily_briefs ORDER BY captured_day").all(),
    };
    expect(beforeResume.revisions.length).toBeGreaterThan(0);
    expect(beforeResume.events.length).toBeGreaterThan(0);
    expect(beforeResume.snapshots.length).toBeGreaterThan(0);

    releaseA?.();
    await expect(oldWorker).rejects.toThrow("lost ownership before run_item");
    expect(sqlite.query("SELECT signal_id, status, attempt_count, sources_json FROM measurement_run_items WHERE run_id=? ORDER BY signal_id").all("valid-takeover")).toEqual(beforeResume.items);
    expect(sqlite.query("SELECT signal_id, product, horizon, evidence_hash FROM signal_evaluation_revisions ORDER BY signal_id, product, horizon, revision").all()).toEqual(beforeResume.revisions);
    expect(sqlite.query("SELECT signal_id, event_hash FROM signal_outcome_events ORDER BY signal_id, id").all()).toEqual(beforeResume.events);
    expect(sqlite.query("SELECT signal_id, captured_day, current_price FROM signal_interim_snapshots ORDER BY signal_id").all()).toEqual(beforeResume.snapshots);
    expect(sqlite.query("SELECT captured_day, summary FROM signal_daily_briefs ORDER BY captured_day").all()).toEqual(beforeResume.briefs);
  });

  test("actual-handler replay after accepted writes before cursor commit preserves hashes and completes once", async () => {
    const sqlite = productionDatabase();
    const startedAt = Date.parse("2026-10-12T12:00:00.000Z");
    await seedFrozenValidRun(sqlite, "replay-after-writes", startedAt);
    const interrupted = context(sqlite, "interrupted-worker");
    let nowMs = startedAt;
    injectMeasurementDependencies(interrupted, {
      ...validDependencies(() => new Date(nowMs), startedAt),
      beforeOwnedMutation: (stage) => {
        if (stage === "checkpoint") throw new Error("fixture interruption after accepted writes");
      },
    });
    await expect(invokeActualHandler(interrupted, "replay-after-writes")).rejects.toThrow("fixture interruption after accepted writes");
    const beforeReplay = sqlite.query("SELECT signal_id, product, horizon, evidence_hash FROM signal_evaluation_revisions ORDER BY signal_id, product, horizon, revision").all();
    const beforeEventHashes = sqlite.query("SELECT event_hash FROM signal_outcome_events ORDER BY event_hash").all();
    expect(beforeReplay.length).toBeGreaterThan(0);
    expect((sqlite.query("SELECT cursor FROM measurement_runs WHERE run_id=?").get("replay-after-writes") as { cursor: number }).cursor).toBe(0);

    nowMs += 11 * 60_000;
    const replay = context(sqlite, "replay-worker");
    injectMeasurementDependencies(replay, validDependencies(() => new Date(nowMs), startedAt));
    const completed = await invokeActualHandler(replay, "replay-after-writes");
    expect(completed.run.status).toBe("complete");
    expect(completed.run.cursor).toBe(2);
    expect(sqlite.query("SELECT signal_id, product, horizon, evidence_hash FROM signal_evaluation_revisions ORDER BY signal_id, product, horizon, revision").all()).toEqual(beforeReplay);
    expect(sqlite.query("SELECT event_hash FROM signal_outcome_events ORDER BY event_hash").all()).toEqual(beforeEventHashes);
    expect((sqlite.query("SELECT COUNT(*) AS n FROM measurement_runs WHERE run_id=? AND status='complete'").get("replay-after-writes") as { n: number }).n).toBe(1);
  });
});
