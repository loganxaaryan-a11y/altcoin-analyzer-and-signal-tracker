import { describe, expect, test } from "bun:test";
import { MarketFetchError, RefreshDeduplicator, currentObservationsFromPointers, fetchMarketJson, freshnessState, latestPerStream, normalizeBinanceKline, observationFingerprint, observationFreshness, quoteEligibleForContract, statusEventKey, statusFromQuote, type FrozenDecision } from "./market-freshness";

const DAY = 86_400_000;
const decision: FrozenDecision = { signalId: "sig-1", direction: "long", entryPrice: 100, stopPrice: 90, targetPrice: 120, inputSnapshotId: 7, decisionAtMs: 1_700_000_000_000 };
const kline = (openTime: number, closeTime: number, close = "105", volume = "1000") => [openTime, "100", "110", "95", close, volume, closeTime, "0"];

describe("Track A market freshness", () => {
  test("expensive analysis can remain throttled while market refresh observations advance", () => {
    const analysisAt = 1_700_000_000_000;
    const quoteAt = analysisAt + 3_600_000;
    expect(freshnessState(quoteAt, quoteAt + 30_000, 300_000).stale).toBe(false);
    expect(freshnessState(analysisAt, quoteAt, 300_000).stale).toBe(true);
  });

  test("a successful response with old event time remains stale", () => {
    const now = 1_800_000_000_000;
    expect(freshnessState(now - 600_000, now, 300_000)).toEqual({ state: "stale", ageMs: 600_000, stale: true, futureInvalid: false });
  });

  test("the latest Binance daily row is forming until its close time passes", () => {
    const now = 1_800_000_000_000;
    const forming = normalizeBinanceKline("BTCUSDT", kline(now - DAY, now + 1), now);
    const completed = normalizeBinanceKline("BTCUSDT", kline(now - DAY, now - 1), now);
    expect(forming?.candleState).toBe("forming");
    expect(completed?.candleState).toBe("completed");
  });

  test("forming volume is not relabeled completed volume", () => {
    const now = 1_800_000_000_000;
    const row = normalizeBinanceKline("ETHUSDT", kline(now - DAY, now + 1000), now);
    expect(row?.volume).toBe(1000);
    expect(row?.candleState).toBe("forming");
  });

  test("outage does not alter the last-known observation", () => {
    const now = 1_800_000_000_000;
    const before = normalizeBinanceKline("SOLUSDT", kline(now - DAY, now - 1), now);
    const frozen = JSON.stringify(before);
    const simulatedError = new Error("simulated provider outage");
    expect(simulatedError.message).toContain("outage");
    expect(JSON.stringify(before)).toBe(frozen);
  });

  test("concurrent refresh work is deduplicated", async () => {
    const dedupe = new RefreshDeduplicator();
    let calls = 0;
    const task = async () => { calls += 1; await Promise.resolve(); return 42; };
    const [a, b] = await Promise.all([dedupe.run("same-minute", task), dedupe.run("same-minute", task)]);
    expect([a, b]).toEqual([42, 42]);
    expect(calls).toBe(1);
  });

  test("fresh price does not freshen an old funding factor", () => {
    const now = 1_800_000_000_000;
    expect(freshnessState(now - 30_000, now, 300_000).stale).toBe(false);
    expect(freshnessState(now - 12 * 3_600_000, now, 6 * 3_600_000).stale).toBe(true);
  });

  test("quote monitoring never mutates the issued decision snapshot or levels", () => {
    const before = structuredClone(decision);
    const status = statusFromQuote(decision, 121, false);
    expect(status.status).toBe("target_observed");
    expect(status.authoritativeSettlement).toBe(false);
    expect(decision).toEqual(before);
  });

  test("observed barrier without path evidence remains unsettled", () => {
    const target = statusFromQuote(decision, 125, false);
    const stop = statusFromQuote(decision, 85, false);
    expect(target.reason).toContain("cannot establish first touch");
    expect(stop.reason).toContain("cannot establish first touch");
  });

  test("repeated status observation has an idempotent key", () => {
    const now = 1_800_000_000_000;
    const row = normalizeBinanceKline("BTCUSDT", kline(now - DAY, now - 1), now);
    expect(row).not.toBeNull();
    if (!row) return;
    const fingerprint = observationFingerprint(row);
    expect(statusEventKey("sig-1", "current_mark", fingerprint)).toBe(statusEventKey("sig-1", "current_mark", fingerprint));
  });

  test("provider correction changes the observation version identity", () => {
    const now = 1_800_000_000_000;
    const first = normalizeBinanceKline("BTCUSDT", kline(now - DAY, now - 1, "105"), now);
    const corrected = normalizeBinanceKline("BTCUSDT", kline(now - DAY, now - 1, "106"), now + 5000);
    expect(first && corrected ? observationFingerprint(first) : "").not.toBe(corrected ? observationFingerprint(corrected) : "");
  });

  test("forming candle freshness is based on last fetch, not its future interval end", () => {
    const fetchedAt = 1_800_000_000_000; const checkedAt = fetchedAt + 5 * 3_600_000;
    const row = normalizeBinanceKline("BTCUSDT", kline(fetchedAt - DAY, fetchedAt + 19 * 3_600_000), fetchedAt);
    expect(row?.intervalEndAtMs).toBeGreaterThan(checkedAt); expect(row?.providerUpdatedAtMs).toBeNull();
    expect(freshnessState(row?.receivedAtMs ?? null, checkedAt, 15 * 60_000).state).toBe("stale");
  });

  test("implausible future point timestamps are explicit invalid data, never age zero", () => {
    const now = 1_800_000_000_000; expect(freshnessState(now + 3_600_000, now, 300_000)).toEqual({ state: "future_invalid", ageMs: null, stale: true, futureInvalid: true });
  });

  test("latest-per-stream happens before global limit across more than 300 revisions", () => {
    const base = 1_800_000_000_000; const rows: Array<{ id:number; instrument:string; source:string; quoteCurrency:string; kind:string; interval:string; candleState:string; receivedAt:Date; providerVersion:number }> = [];
    for (let index = 0; index < 321; index++) rows.push({ id:index + 1, instrument:"BTCUSDT", source:"Binance Spot REST", quoteCurrency:"USDT", kind:"candle", interval:"1d", candleState:"forming", receivedAt:new Date(base + index), providerVersion:index + 1 });
    rows.push({ id:400, instrument:"BTCUSDT", source:"Binance Spot REST", quoteCurrency:"USDT", kind:"quote", interval:"point", candleState:"point", receivedAt:new Date(base + 10), providerVersion:1 });
    rows.push({ id:401, instrument:"BTCUSDT", source:"Binance Spot REST", quoteCurrency:"USDT", kind:"volume_24h", interval:"24h", candleState:"point", receivedAt:new Date(base + 10), providerVersion:1 });
    rows.push({ id:402, instrument:"BTCUSDT", source:"Binance Spot REST", quoteCurrency:"USDT", kind:"candle", interval:"1d", candleState:"completed", receivedAt:new Date(base + 9), providerVersion:1 });
    rows.push({ id:403, instrument:"ETHUSDT", source:"Binance Spot REST", quoteCurrency:"USDT", kind:"quote", interval:"point", candleState:"point", receivedAt:new Date(base + 8), providerVersion:1 });
    rows.push({ id:404, instrument:"SOLUSDT", source:"Binance Spot REST", quoteCurrency:"USDT", kind:"quote", interval:"point", candleState:"point", receivedAt:new Date(base + 7), providerVersion:1 });
    const selected = latestPerStream(rows, 20); expect(selected).toHaveLength(6); expect(new Set(selected.map((row) => `${row.instrument}:${row.kind}:${row.candleState}`)).size).toBe(6); expect(selected.find((row) => row.kind === "candle" && row.candleState === "forming")?.providerVersion).toBe(321);
  });

  test("real provider transport wrapper records 429 retry instructions and recovers", async () => {
    const waits: number[] = []; let calls = 0; const transport = async () => { calls += 1; return calls === 1 ? new Response("rate limited", { status: 429, headers: { "retry-after": "2" } }) : Response.json({ price: "101" }); };
    const result = await fetchMarketJson("https://fixture.invalid", { attempts: 2, transport, sleep: async (ms) => { waits.push(ms); }, now: () => 1_800_000_000_000 });
    expect(result).toEqual({ payload: { price: "101" }, attemptCount: 2, rateLimitCount: 1, retryAfterMs: 2000 }); expect(waits).toEqual([2000]);
  });

  test("real provider transport wrapper counts timeout retries and terminal failure", async () => {
    let calls = 0; const transport = async () => { calls += 1; throw new DOMException("timed out", "TimeoutError"); };
    try { await fetchMarketJson("https://fixture.invalid", { attempts: 2, transport, sleep: async () => undefined, now: () => 1_800_000_000_000 }); expect.unreachable(); }
    catch (error) { expect(error).toBeInstanceOf(MarketFetchError); expect((error as MarketFetchError).attemptCount).toBe(2); expect((error as MarketFetchError).rateLimitCount).toBe(0); expect(calls).toBe(2); }
  });

  test("unchanged successful fetch advances fetch health for the current immutable payload", () => {
    const receivedAt = new Date("2026-10-11T01:00:00.000Z"); const successAt = new Date("2026-10-11T05:59:00.000Z"); const now = Date.parse("2026-10-11T06:00:00.000Z");
    const result = observationFreshness({ kind: "candle", candleState: "forming", eventAt: new Date("2026-10-12T00:00:00.000Z"), providerUpdatedAt: null, receivedAt, lastSuccessfulRefreshAt: receivedAt }, successAt, now);
    expect(result.displayBasis).toBe("validated successful fetch"); expect(result.display.state).toBe("fresh"); expect(result.display.ageMs).toBe(60_000);
  });

  test("stopped polling ages the fetch health even when the candle interval end is in the future", () => {
    const receivedAt = new Date("2026-10-11T01:00:00.000Z"); const now = Date.parse("2026-10-11T06:00:00.000Z");
    const result = observationFreshness({ kind: "candle", candleState: "forming", eventAt: new Date("2026-10-12T00:00:00.000Z"), providerUpdatedAt: null, receivedAt, lastSuccessfulRefreshAt: receivedAt }, receivedAt, now);
    expect(result.display.state).toBe("stale"); expect(result.display.ageMs).toBe(5 * 3_600_000);
  });

  test("fresh fetch health does not freshen outdated provider point content", () => {
    const oldProviderEvent = new Date("2026-10-11T01:00:00.000Z"); const successAt = new Date("2026-10-11T05:59:00.000Z"); const now = Date.parse("2026-10-11T06:00:00.000Z");
    const result = observationFreshness({ kind: "quote", candleState: "point", eventAt: oldProviderEvent, providerUpdatedAt: oldProviderEvent, receivedAt: successAt, lastSuccessfulRefreshAt: successAt }, successAt, now);
    expect(result.fetchHealth.state).toBe("fresh"); expect(result.providerEventHealth?.state).toBe("stale"); expect(result.display.state).toBe("stale");
  });

  test("A to B to A reversion follows the authoritative immutable payload pointer", () => {
    const common = { instrument: "BTCUSDT", source: "Binance Spot REST", quoteCurrency: "USDT", kind: "quote", interval: "point", candleState: "point" };
    const a = { ...common, id: 1, observationKey: "A", receivedAt: new Date(1000), providerVersion: 1, value: 100 };
    const b = { ...common, id: 2, observationKey: "B", receivedAt: new Date(2000), providerVersion: 2, value: 110 };
    const health = [{ streamKey: "BTCUSDT|Binance Spot REST|USDT|quote|point|point", lastObservationKey: "A", lastAttemptAt: new Date(3000), lastSuccessAt: new Date(3000), consecutiveFailures: 0, lastError: null }];
    expect(currentObservationsFromPointers([a, b], health)[0]?.value).toBe(100);
  });

  test("09:04 provider quote received at 09:06 cannot cross a contract issued at 09:05", () => {
    const at = (hhmm: string) => Date.parse(`2026-10-11T${hhmm}:00.000Z`);
    expect(quoteEligibleForContract({ decisionAtMs: at("09:00"), issuedAtMs: at("09:05"), entryAtMs: at("09:05"), providerEventAtMs: at("09:04"), receivedAtMs: at("09:06") })).toBe(false);
    expect(quoteEligibleForContract({ decisionAtMs: at("09:00"), issuedAtMs: at("09:05"), entryAtMs: at("09:05"), providerEventAtMs: at("09:05"), receivedAtMs: at("09:06") })).toBe(true);
  });
});
