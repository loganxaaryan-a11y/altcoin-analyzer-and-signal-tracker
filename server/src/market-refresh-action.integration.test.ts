import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { Ctx } from "@hatch/space-sdk";
import { MarketFetchError, currentObservationsFromPointers, type MarketFetchResult } from "./market-freshness";
import { refreshSignalStatusEvents, runMarketDataRefresh } from "./actions";
import * as schema from "./schema";

const databases: Database[] = [];
function fixture() {
  const sqlite = new Database(":memory:"); databases.push(sqlite);
  sqlite.exec(`
    CREATE TABLE market_data_observations (id INTEGER PRIMARY KEY AUTOINCREMENT, observation_key TEXT NOT NULL UNIQUE, instrument TEXT NOT NULL, symbol TEXT NOT NULL, market TEXT NOT NULL, source TEXT NOT NULL, venue TEXT NOT NULL, pair TEXT NOT NULL, quote_currency TEXT NOT NULL, kind TEXT NOT NULL, interval TEXT NOT NULL, candle_state TEXT NOT NULL, event_at INTEGER NOT NULL, interval_start_at INTEGER, interval_end_at INTEGER, provider_updated_at INTEGER, received_at INTEGER NOT NULL, last_successful_refresh_at INTEGER NOT NULL, value REAL, open REAL, high REAL, low REAL, close REAL, volume REAL, provider_version INTEGER NOT NULL DEFAULT 1, correction_of_id INTEGER, raw_trace_json TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE market_refresh_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, refresh_key TEXT NOT NULL UNIQUE, path TEXT NOT NULL, status TEXT NOT NULL, requested_count INTEGER NOT NULL, fetched_count INTEGER NOT NULL, saved_count INTEGER NOT NULL, deduped_count INTEGER NOT NULL, request_weight INTEGER NOT NULL, attempt_count INTEGER NOT NULL DEFAULT 0, rate_limit_count INTEGER NOT NULL DEFAULT 0, retry_after_ms INTEGER, source TEXT NOT NULL, error TEXT, started_at INTEGER NOT NULL, completed_at INTEGER, created_at INTEGER NOT NULL);
    CREATE TABLE market_stream_health (id INTEGER PRIMARY KEY AUTOINCREMENT, stream_key TEXT NOT NULL UNIQUE, instrument TEXT NOT NULL, source TEXT NOT NULL, quote_currency TEXT NOT NULL, kind TEXT NOT NULL, interval TEXT NOT NULL, candle_state TEXT NOT NULL, last_attempt_at INTEGER NOT NULL, last_success_at INTEGER, last_observation_key TEXT, consecutive_failures INTEGER NOT NULL DEFAULT 0, last_error TEXT, updated_at INTEGER NOT NULL);
    CREATE TABLE signal_contracts (id INTEGER PRIMARY KEY, signal_id TEXT NOT NULL, issued_payload TEXT NOT NULL);
    INSERT INTO signal_contracts VALUES (1, 'immutable-1', '{"entry":100,"stop":90,"target":120}');
  `);
  const db = drizzle(sqlite);
  let invalidations = 0;
  const ctx = { db: () => db, invalidateQueries: () => { invalidations += 1; } } as unknown as Ctx;
  return { sqlite, db, ctx, invalidations: () => invalidations };
}
function monitorFixture() {
  const f = fixture(); f.sqlite.exec(`DROP TABLE signal_contracts;
    CREATE TABLE signal_contracts (id INTEGER PRIMARY KEY AUTOINCREMENT, signal_id TEXT NOT NULL UNIQUE, legacy_signal_id INTEGER UNIQUE, amends_signal_id TEXT, idempotency_key TEXT NOT NULL UNIQUE, issuance_claim TEXT, issuance_state TEXT NOT NULL, entry_evidence_json TEXT NOT NULL, evaluator_version TEXT, asset_id TEXT NOT NULL, symbol TEXT NOT NULL, venue TEXT NOT NULL, instrument_type TEXT NOT NULL, exchange_calendar TEXT NOT NULL, direction TEXT NOT NULL, strategy_id TEXT NOT NULL, strategy_version TEXT NOT NULL, parameter_hash TEXT NOT NULL, build_id TEXT NOT NULL, decision_at INTEGER NOT NULL, available_at INTEGER NOT NULL, issued_at INTEGER NOT NULL, entry_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, input_snapshot_id INTEGER NOT NULL, bar_start INTEGER NOT NULL, bar_end INTEGER NOT NULL, bar_is_closed INTEGER NOT NULL, price_basis TEXT NOT NULL, entry_rule TEXT NOT NULL, entry_price REAL NOT NULL, stop_price REAL NOT NULL, target_price REAL NOT NULL, risk_per_unit REAL NOT NULL, primary_horizon INTEGER NOT NULL, horizon_unit TEXT NOT NULL, feature_values_json TEXT NOT NULL, gate_results_json TEXT NOT NULL, setup_score REAL NOT NULL, score_definition TEXT NOT NULL, data_coverage_json TEXT NOT NULL, validation_status TEXT NOT NULL, levels_json TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE signal_status_events (id INTEGER PRIMARY KEY AUTOINCREMENT, event_key TEXT NOT NULL UNIQUE, signal_id TEXT NOT NULL, status TEXT NOT NULL, observation_key TEXT NOT NULL, observed_price REAL, observed_at INTEGER NOT NULL, authoritative_settlement INTEGER NOT NULL DEFAULT 0, detail TEXT NOT NULL, created_at INTEGER NOT NULL);
  `); return f;
}
afterEach(() => { while (databases.length) databases.pop()?.close(); });

const base = Date.parse("2026-10-11T09:10:00.000Z");
const ticker = (price: string, closeTime = base) => ({ symbol: "BTCUSDT", lastPrice: price, quoteVolume: "123456", closeTime });
const kline = (close: string, receivedAt = base) => [receivedAt - 86_400_000, "100", "120", "90", close, "1000", receivedAt + 86_400_000];
function provider(options: { price?: string; quoteAttempts?: number; rateLimits?: number; candleError?: Error; calls: string[] }): (url: string) => Promise<MarketFetchResult> {
  return async (url) => {
    options.calls.push(url);
    if (url.includes("ticker/24hr")) return { payload: [ticker(options.price ?? "101")], attemptCount: options.quoteAttempts ?? 1, rateLimitCount: options.rateLimits ?? 0, retryAfterMs: options.rateLimits ? 2000 : null };
    if (options.candleError) throw options.candleError;
    return { payload: [kline(options.price ?? "101")], attemptCount: 1, rateLimitCount: 0, retryAfterMs: null };
  };
}

describe("actual market refresh action with isolated database, fake provider, and clock", () => {
  test("success, unchanged success, A→B→A pointer reversion, accounting, and immutable issued rows", async () => {
    const f = fixture(); const originalIssued = f.sqlite.query("SELECT * FROM signal_contracts").get(); const calls: string[] = []; let nowMs = base;
    const deps = { now: () => new Date(nowMs), fetchJson: provider({ price: "101", calls }) };
    const first = await runMarketDataRefresh(f.ctx, ["BTC"], "scheduled", deps);
    expect(first.run.status).toBe("complete"); expect(first.run.savedCount).toBe(3); expect(first.run.attemptCount).toBe(2); expect(calls).toHaveLength(2);
    nowMs += 60_000; const unchanged = await runMarketDataRefresh(f.ctx, ["BTC"], "scheduled", deps);
    expect(unchanged.run.savedCount).toBe(0); expect(unchanged.run.dedupedCount).toBe(3);
    let health = await f.db.select().from(schema.marketStreamHealth); const quoteHealth = health.find((row) => row.kind === "quote"); expect(quoteHealth?.lastSuccessAt?.getTime()).toBe(nowMs);
    nowMs += 60_000; deps.fetchJson = provider({ price: "110", calls }); await runMarketDataRefresh(f.ctx, ["BTC"], "scheduled", deps);
    nowMs += 60_000; deps.fetchJson = provider({ price: "101", calls }); const reverted = await runMarketDataRefresh(f.ctx, ["BTC"], "scheduled", deps);
    expect(reverted.run.dedupedCount).toBeGreaterThanOrEqual(2);
    const observations = await f.db.select().from(schema.marketDataObservations); health = await f.db.select().from(schema.marketStreamHealth);
    const current = currentObservationsFromPointers(observations, health); expect(current.find((row) => row.kind === "quote")?.value).toBe(101);
    expect(f.sqlite.query("SELECT * FROM signal_contracts").get()).toEqual(originalIssued); expect(f.invalidations()).toBe(4);
  });

  test("429 accounting and partial candle failure preserve successful quote/volume writes", async () => {
    const f = fixture(); const calls: string[] = [];
    const result = await runMarketDataRefresh(f.ctx, ["BTC"], "scheduled", { now: () => new Date(base), fetchJson: provider({ calls, quoteAttempts: 2, rateLimits: 1, candleError: new MarketFetchError("timeout", 2, 0, null) }) });
    expect(result.run.status).toBe("degraded"); expect(result.run.attemptCount).toBe(4); expect(result.run.rateLimitCount).toBe(1); expect(result.run.retryAfterMs).toBe(2000); expect(result.run.savedCount).toBe(2); expect(calls).toHaveLength(2);
  });

  test("database write failure records failure and a later cycle recovers without mutating issued rows", async () => {
    const f = fixture(); const originalIssued = f.sqlite.query("SELECT * FROM signal_contracts").get(); const calls: string[] = []; let nowMs = base;
    f.sqlite.exec("CREATE TRIGGER fail_health BEFORE INSERT ON market_stream_health BEGIN SELECT RAISE(ABORT, 'simulated health write failure'); END;");
    const deps = { now: () => new Date(nowMs), fetchJson: provider({ calls }) };
    const failed = await runMarketDataRefresh(f.ctx, ["BTC"], "scheduled", deps); expect(failed.ok).toBe(false); expect(failed.run.status).toBe("failed"); expect(String(failed.run.error)).toContain("simulated health write failure");
    f.sqlite.exec("DROP TRIGGER fail_health"); nowMs += 60_000;
    const recovered = await runMarketDataRefresh(f.ctx, ["BTC"], "scheduled", deps); expect(recovered.ok).toBe(true); expect(recovered.run.status).toBe("complete");
    expect(f.sqlite.query("SELECT * FROM signal_contracts").get()).toEqual(originalIssued);
  });

  test("terminal provider timeout is accounted and subsequent minute recovers", async () => {
    const f = fixture(); let nowMs = base; let timeout = true; const calls: string[] = [];
    const fetchJson = async (url: string): Promise<MarketFetchResult> => { calls.push(url); if (timeout && url.includes("ticker/24hr")) throw new MarketFetchError("timed out", 2, 0, null); return provider({ calls })(url); };
    const failed = await runMarketDataRefresh(f.ctx, ["BTC"], "scheduled", { now: () => new Date(nowMs), fetchJson }); expect(failed.run.status).toBe("failed"); expect(failed.run.attemptCount).toBe(2);
    timeout = false; nowMs += 60_000; const recovered = await runMarketDataRefresh(f.ctx, ["BTC"], "scheduled", { now: () => new Date(nowMs), fetchJson }); expect(recovered.run.status).toBe("complete");
  });

  test("concurrent action triggers share one provider cycle", async () => {
    const f = fixture(); const calls: string[] = []; const fetchJson = provider({ calls }); const deps = { now: () => new Date(base), fetchJson };
    const [left, right] = await Promise.all([runMarketDataRefresh(f.ctx, ["BTC"], "manual", deps), runMarketDataRefresh(f.ctx, ["BTC"], "manual", deps)]);
    expect(left.run.id).toBe(right.run.id); expect(calls).toHaveLength(2);
  });

  test("actual status-monitor action rejects the 09:04 quote for the contract issued at 09:05", async () => {
    const f = monitorFixture(); const at = (hhmm: string) => new Date(`2026-10-11T${hhmm}:00.000Z`);
    await f.db.insert(schema.signalContracts).values({ signalId: "sig-counterexample", legacySignalId: null, amendsSignalId: null, idempotencyKey: "counterexample", issuanceClaim: null, issuanceState: "complete", entryEvidenceJson: "{}", evaluatorVersion: "v1", assetId: "bitcoin", symbol: "BTC", venue: "Binance Spot", instrumentType: "spot", exchangeCalendar: "24/7", direction: "long", strategyId: "frozen", strategyVersion: "v1", parameterHash: "frozen", buildId: "test", decisionAt: at("09:00"), availableAt: at("09:00"), issuedAt: at("09:05"), entryAt: at("09:05"), expiresAt: at("10:00"), inputSnapshotId: 1, barStart: at("08:00"), barEnd: at("09:00"), barIsClosed: true, priceBasis: "Binance Spot BTCUSDT", entryRule: "issued", entryPrice: 100, stopPrice: 90, targetPrice: 120, riskPerUnit: 10, primaryHorizon: 5, horizonUnit: "calendar_days", featureValuesJson: "{}", gateResultsJson: "{}", setupScore: 50, scoreDefinition: "frozen", dataCoverageJson: "{}", validationStatus: "unverified_prospective", levelsJson: "{}", createdAt: at("09:05") });
    const observation: typeof schema.marketDataObservations.$inferInsert = { observationKey: "quote-pre-issue", instrument: "BTCUSDT", symbol: "BTC", market: "crypto", source: "Binance Spot REST", venue: "Binance Spot", pair: "BTCUSDT", quoteCurrency: "USDT", kind: "quote", interval: "point", candleState: "point", eventAt: at("09:04"), intervalStartAt: null, intervalEndAt: null, providerUpdatedAt: at("09:04"), receivedAt: at("09:06"), lastSuccessfulRefreshAt: at("09:06"), value: 121, open: null, high: null, low: null, close: null, volume: null, providerVersion: 1, correctionOfId: null, rawTraceJson: "{}", createdAt: at("09:06") };
    await f.db.insert(schema.marketDataObservations).values(observation); await f.db.insert(schema.marketStreamHealth).values({ streamKey: "BTCUSDT|Binance Spot REST|USDT|quote|point|point", instrument: "BTCUSDT", source: "Binance Spot REST", quoteCurrency: "USDT", kind: "quote", interval: "point", candleState: "point", lastAttemptAt: at("09:06"), lastSuccessAt: at("09:06"), lastObservationKey: "quote-pre-issue", consecutiveFailures: 0, lastError: null, updatedAt: at("09:06") });
    const result = await refreshSignalStatusEvents(f.ctx, { now: () => at("09:07") }); expect(result.checked).toBe(1); expect(result.compatibility.observationPredatedIssuance).toBe(1); expect(result.appended).toBe(0); expect((await f.db.select().from(schema.signalStatusEvents)).length).toBe(0);
  });
});
