# Source Resolution — Paper-Signal Spec Open Items (2026-10-13)

**Status:** READ-ONLY resolution against the source export. No implementation, no production changes, no scheduler touched.
**Source base:** `~/workspace/goals/research-terminal/hidden_files/source-export-2026-10-13/` (byte-identical copy, 0 mismatches on re-hash per MANIFEST.md).
**Companion docs:** `implementation-spec-2026-10-13.md` (the spec these items were open in), `MANIFEST.md`, `CONFIG.md`, `PIPELINE-TRACE.md` (all in the source-export dir).
**Deployed-parity caveat:** the export is the builders' workspace source, not a dump of the deployed runtime (no tool exposes a deployed commit ID). All `file:line` refs are against the export. Cron timing/→action mapping comes from the live hatch scheduler (`cron.view`, 2026-10-13) per PIPELINE-TRACE.md §3 — that is the only live-sourced data in this file.

**Provenance tags used on every number/claim:** `[S]` = read directly from exported source · `[O]` = observed in source-export behavior/counts (not a declared constant) · `[L]` = live-scheduler verification via cron.view on 2026-10-13 · `[E]` = estimate/derivation, flagged for operator confirmation.

**MEASURED vs ESTIMATED (expert correction, 2026-10-13):** `[S]`/`[O]`/`[L]` are MEASURED — verified against the exported source (`[S]`/`[O]`, with file:line refs) or the live scheduler (`[L]`, via cron.view on 2026-10-13). `[E]` is ESTIMATED — derived, assumed, or taken from public docs, with the justification stated inline. **None of these numbers are account-verified:** no provider dashboard, account API, or billing page was checked, so no number here represents a confirmed provider-enforced quota. Where the original wording implied otherwise, it is corrected below.

---

## 1. Production issuer signatures

### 1a. Equity — `recordSignal`

**Location [S]:** `equity/server/src/actions.ts:448` (exported; only production caller is `trackAnalyzedSignal` → `analyze(shouldRecord=true)` at :714–715).

```ts
export async function recordSignal(
  ctx: Ctx,
  symbol: string,
  name: string,
  setupType: string,
  _direction: "long" | "short",
  _confidence: number,
  signalDate: string,
  evidence: {
    factors: SignalFactor[];
    levels: FrozenLevels;
    sourceAsOf: string;
    barTimestamp: string;
    barState: "closed" | "forming";
    sourceUrl: string;
    exchangeCalendar: string;
    instrumentType: string
  },
  dependencies: RecordSignalDependencies = {}
): Promise<RecordSignalResult>
```

**What each parameter means [S]:**
- `ctx` — `Ctx` from `@hatch/space-sdk` [S: equity/server/src/actions.ts:1]. Supplies `ctx.db<typeof schema>()` (Drizzle handle over `trackedSignals`, `signalInputSnapshots`, `signalEvents`, `suppressedSignalCandidates`, `historicalCaches`), plus `ctx.tool`, `ctx.invalidateQueries()`. **DB handle is required; there is no clock injection — `recordSignal` calls `new Date()` twice directly** (`issuedAt`, `updatedAt`) [S: :504, :510]. A sandbox port must wrap these behind an injectable `Clock` (the orchestrator already has one at `orchestrator/src/clock.ts`).
- `symbol` — Yahoo symbol, uppercased; used for the evidence fetch and the identity hash [S: :420, :481].
- `name` — instrument display name, stored on the row.
- `setupType` — setup label stored on the row (e.g. `"Discovery high"`).
- `_direction`, `_confidence` — the caller's draft direction/confidence. **Deliberately ignored for the final decision**: the function reconstructs the candidate from the fetched evidence and uses the reconstruction's direction/score, falling back to these only when reconstruction is absent [S: :455–456]. The underscore prefix is the author's own mark of fallback-only.
- `signalDate` — `YYYY-MM-DD` signal day; drives `exactYahooIssuanceEvidence(symbol, signalDate)` [S: :418–423].
- `evidence` — draft payload: `factors` (dossier factor reads), `levels` (draft `FrozenLevels`: entryPrice/stopPrice/target1/target2/riskPerUnit/atr14/…), `sourceAsOf`, `barTimestamp` (decision timestamp — becomes `decisionBar`/`barEnd` and enters the idempotency identity at :481–483), `barState`, `sourceUrl`, `exchangeCalendar` (**must be `"XNYS"`** or the candidate is suppressed watch-only at :449), `instrumentType`.
- `dependencies` — optional injection seam, already present in production [S: :442–445]:
  ```ts
  export type RecordSignalDependencies = {
    loadIssuanceEvidence?: (symbol: string, signalDate: string) => Promise<Omit<ExactIssuanceCheck, "decision"> & { error: string | null }>;
    logSuppressed?: typeof logSuppressedCandidate;
  };
  ```
  **This is the sanctioned sandbox seam**: injecting `loadIssuanceEvidence` replaces the one network call (the Yahoo fetch) with a paper feed. No other seam exists; the DB calls go through `ctx.db` unconditionally.

**Context/config it requires [S]:**
- Frozen constants read from module scope: `SIGNAL_STRATEGY_ID/VERSION/PARAMETER_HASH/BUILD_ID/SCORE_DEFINITION` (:349–354), `SIGNAL_INVALIDATION_ATR_MULTIPLE`, `SIGNAL_INVALIDATION_METHOD`, target multiples 1.5/2.5 (:454).
- `reconstructAndValidateEquityCandidate` + `computeEquityDecisionFromRawInputs` (`equity/server/src/measurement.ts:304`, `:236`) with frozen `DEFAULT_WEIGHTS` (:234).
- XNYS calendar helpers (`xnysSessionBounds`, `newYorkCloseIso`).
- `contentHash`/`stableJson`/`factorId`/`round` utilities.
- **Network:** exactly 1 Yahoo request per call — `yahooSeries(symbol, "1y", lane)` via `exactYahooIssuanceEvidence` [S: :420] — unless `dependencies.loadIssuanceEvidence` is injected.
- **Return:** `RecordSignalResult = { recorded: boolean; suppressedReason: SignalIssuanceReason | null; signalDay: Point | null; acceptedCandidate: AcceptedSignalCandidate | null }` [S: :440]. Idempotency via `issuanceIdentity` content hash + `onConflictDoNothing` [S: :481–483, :512–518]; races return `recorded: true` on re-read [S: :520–524].

### 1b. Crypto — `issueGeneratedSignalCandidate`

**Location [S]:** `crypto/server/src/actions.ts:1976` (exported; only production caller is `analyzeCoin` at :3411; verification control at :5091–5092).

```ts
export async function issueGeneratedSignalCandidate(
  ctx: Ctx,
  draft: GeneratedSignalDraft,
  input: {
    shortRegime: ShortRegimeGate | null;
    metadata: Record<string, unknown>;
    rawAtrBars?: Array<{ high: number; low: number; close: number; availableAt: number }>
  }
): Promise<SignalIssuanceResult>
```

**`GeneratedSignalDraft` [S: crypto/server/src/actions.ts:1947–1951]:**
```ts
type GeneratedSignalDraft = {
  coinId: string; name: string; symbol: string;           // coinId = CoinGecko id
  direction: "long" | "short"; confidence: number; setupType: string;
  entry: number; invalidation: number; target1: number; target2: number;
  atr14: number | null; riskMultiplier: number | null;    // riskMultiplier defaults to 1.25 at :1991
  riskMethod: "legacy_fixed" | "atr14_1_25x";
  funding: number | null; oiUsd: number | null; oiChange: number | null;
  factorsJson: string;                                    // serialized dossier factor ledger
  sourceAsOf: Date; createdAt: Date;                      // createdAt = decision time; entry quote must be received AFTER it
};
```

**What each parameter means [S]:**
- `ctx` — `Ctx` from `@hatch/space-sdk` [S: crypto/server/src/actions.ts:1]. Uses `ctx.db<typeof schema>()` (`signalContracts`, `generatedSignals`, `signalInputSnapshots`, `historicalDailyBars`, `historyCacheState`, `strategyTrials`, `methodologyFreezes`) and **`ctx.invocationId` as the issuance claim for the atomic publish** [S: :2012]. DB handle required; **no network or clock injection — `new Date()` is called directly** for `quoteReceivedAt`/`issuedAt`/:2002–2004, and the CoinGecko fetch goes through the module-level `getJson` (not injectable). A sandbox port must route both behind its own quote provider and clock.
- `draft` — as above. Note: `draft.entry/invalidation/target1/target2` are **draft** levels; the accepted levels are rebuilt from the post-decision quote via `buildAtrLevels` [S: :1991–1995] and the accepted draft overwrites them [S: :1996].
- `input.shortRegime` — precomputed `ShortRegimeGate` (or `null`). Gate logic at :1979: `draft.direction === "short" && input.shortRegime && !input.shortRegime.allowed` → blocked. **`null` is allowed and means "not evaluated"** — for a short with `shortRegime: null`, the regime check is silently skipped [O]. Callers must treat `null` as inapplicable, never as passed; production discovery always computes it (:3756).
- `input.metadata` — opaque record persisted into `gateResultsJson`/`dataCoverageJson` and the suppression-log metadata (production stamps `issuancePath`, strategy id/version/parameter hash) [S: :1983, :2005].
- `input.rawAtrBars` — optional; bars with `availableAt <= draft.createdAt` are fed to `replayDossierDecision` for the issuance-time reconstruction check [S: :1997–1999].
- **Return:** `SignalIssuanceResult = { status: "published" | "suppressed" | "already_exists"; reason: string | null; signalDay: string | null; candle: SignalDayCandle | null; acceptedSetup: AcceptedIssuedSetup | null }` [S: :1963].

**Context/config it requires [S]:**
- `ensurePhase1Freeze(ctx)` [S: :1953–1958, called :1977] — upserts `strategyTrials` + `methodologyFreezes` rows; issuance refuses to exist outside a recorded freeze.
- `loadIssuanceSignalDayCandle(ctx, coinId, symbol, nowMs)` [S: :1919–1945, called :1978] — reads the `historicalDailyBars` cache via `ensureHistoryCache`, then fetches **1 CoinGecko `/coins/{id}/ohlc?vs_currency=usd&days=30`** and upserts the latest completed day. That is the born-dead evidence.
- Post-decision entry quote: **1 CoinGecko `/coins/markets?vs_currency=usd&ids={coinId}`** [S: :1989]; `issuedAt = entryAt = quoteReceivedAt` (receipt time, not provider timestamp) [S: :1992–2004].
- `replayDossierDecision` / `replayMismatches` (`signal-methodology.ts:117+`) with `ENTRY_CONVENTION = "first-post-decision-provider-quote"`, `PRICE_CONVENTION = "usd-spot-reference"` [S: sm:7–8].
- `persistSignalIssuanceBundle` (`crypto/server/src/issuance-persistence.ts:11`) — atomic batch write + re-read of the accepted bundle; the return distinguishes `published` vs `already_exists` by comparing `accepted.issuanceClaim === ctx.invocationId` [S: :2013–2015].

**Item 1 — resolved.** Both signatures are exported production functions. The equity function ships with an injectable evidence seam (`RecordSignalDependencies`); the crypto function has none — its network (`getJson`) and clock (`new Date()`) are module-direct, so a paper port must interpose at the call site, not via the existing signature.

---

## 2. Equity gate decomposition (`signalIssuanceDecision`)

### 2a. The original — branch structure

**Source [S]:** `equity/server/src/actions.ts:402–416` (matches the vendored copy in `paper-signals/orchestrator/src/gates/equity-gates.ts`, which the header documents as verbatim lines 402–416).

```ts
function signalIssuanceDecision(direction: "long" | "short", invalidation: number, signalDay: Point | null, history: Point[]): SignalIssuanceDecision {
  if (!signalDay || signalDay.open == null || signalDay.low == null || signalDay.high == null) return { allowed: false, reason: `issuance-check unavailable: exact completed signal-day OHLC was not available for ${signalDay?.date ?? "the requested date"}`, belowSma50: null, lowerHighs: null, trend20Negative: null };   // B1 :403
  const breached = direction === "long" ? signalDay.low <= invalidation : signalDay.high >= invalidation;                                                                                                                              // B2 :404
  if (breached) {                                                                                                                                                                                                                   // B2 :405-407
    const reason = direction === "long" ? `born-dead LONG: signal-day low ${round(signalDay.low, 4)} <= invalidation ${round(invalidation, 4)}` : `born-dead SHORT: signal-day high ${round(signalDay.high, 4)} >= invalidation ${round(invalidation, 4)}`;
    return { allowed: false, reason, belowSma50: null, lowerHighs: null, trend20Negative: null };
  }
  if (direction === "long") return { allowed: true, reason: null, belowSma50: null, lowerHighs: null, trend20Negative: null };                                                                                                          // B3 :408
  const signalIndex = history.findIndex((row) => row.date === signalDay.date); const throughSignalDay = signalIndex >= 0 ? history.slice(0, signalIndex + 1) : history.filter((row) => row.date <= signalDay.date);                // B4 :409
  const mean50 = average(throughSignalDay.slice(-50).map((row) => row.close)); const close20Ago = throughSignalDay.at(-21)?.close;
  const belowSma50 = mean50 == null ? null : signalDay.close < mean50;
  const lowerHighs = recentLowerHighs(throughSignalDay);
  const trend20Negative = close20Ago == null ? null : signalDay.close < close20Ago;
  const bearishStructure = belowSma50 === true && (lowerHighs === true || trend20Negative === true);
  return bearishStructure ? { allowed: true, reason: null, belowSma50, lowerHighs, trend20Negative } : { allowed: false, reason: `short-regime: bearish daily structure gate not met on ${signalDay.date}`, belowSma50, lowerHighs, trend20Negative };
}
```

**Branch inventory [S]:**

| Branch | Lines | Condition | Outcome |
|---|---|---|---|
| B1 availability | :403 | `!signalDay \|\| signalDay.open==null \|\| low==null \|\| high==null` | `{allowed:false, reason:"issuance-check unavailable: exact completed signal-day OHLC was not available for …"}` |
| B2 born-dead | :404–407 | long: `signalDay.low <= invalidation`; short: `signalDay.high >= invalidation` | `{allowed:false, reason:"born-dead LONG/SHORT: …"}` |
| B3 long short-circuit | :408 | `direction === "long"` (reached only if B1/B2 passed) | `{allowed:true}` |
| B4 short-regime | :409–415 | `belowSma50===true && (lowerHighs===true \|\| trend20Negative===true)` → allow, else block | `{allowed:true,…}` or `{allowed:false, reason:"short-regime: bearish daily structure gate not met on …"}` |

### 2b. Separability verdict

**They are fully separable.** B1, B2, B3 are independent sequential `if` early-returns; B4 is a straight-line computation whose only inputs are `(direction, signalDay, history)` — it reads no state written by B1/B2 other than the early-return control flow. No branch shares mutable state, no intertwined conditions. The crypto terminal proves the decomposition is viable: its gates are *already* two separate functions — `evaluateBornDead(direction, invalidation, candle)` [S: crypto/server/src/actions.ts:1219–1224] and `evaluateShortRegimeGate(currentPrice, closes, highs)` [S: :1207–1211] — and production calls them independently in both discovery (:3758–3762) and issuance (:1978–1979).

### 2c. Minimal refactor (builder-ready)

Decompose in the sandbox gate file (`orchestrator/src/gates/equity-gates.ts`), **keeping the vendored `signalIssuanceDecision` block verbatim** (it is hash-policed by `tests/drift.ts` + `tests/drift-hashes.json` — do not edit inside the hashed range):

```ts
// NEW — outside the drift-hashed range. Proven equivalent to B1+B2 of :403-407.
export function evaluateEquityBornDead(
  direction: "long" | "short", invalidation: number, signalDay: Point | null
): { blocked: boolean; reason: string | null } {
  if (!signalDay || signalDay.open == null || signalDay.low == null || signalDay.high == null)
    return { blocked: true, reason: `issuance-check unavailable: exact completed signal-day OHLC was not available for ${signalDay?.date ?? "the requested date"}` };
  const breached = direction === "long" ? signalDay.low <= invalidation : signalDay.high >= invalidation;
  if (!breached) return { blocked: false, reason: null };
  const reason = direction === "long"
    ? `born-dead LONG: signal-day low ${round(signalDay.low, 4)} <= invalidation ${round(invalidation, 4)}`
    : `born-dead SHORT: signal-day high ${round(signalDay.high, 4)} >= invalidation ${round(invalidation, 4)}`;
  return { blocked: true, reason };
}

// NEW — outside the drift-hashed range. Proven equivalent to B4 of :409-415 (B3 folds in as the long early-return).
export function evaluateEquityShortRegime(
  direction: "long" | "short", signalDay: Point, history: Point[]
): SignalIssuanceDecision {
  if (direction === "long") return { allowed: true, reason: null, belowSma50: null, lowerHighs: null, trend20Negative: null };
  const signalIndex = history.findIndex((row) => row.date === signalDay.date);
  const throughSignalDay = signalIndex >= 0 ? history.slice(0, signalIndex + 1) : history.filter((row) => row.date <= signalDay.date);
  const mean50 = average(throughSignalDay.slice(-50).map((row) => row.close));
  const close20Ago = throughSignalDay.at(-21)?.close;
  const belowSma50 = mean50 == null ? null : signalDay.close < mean50;
  const lowerHighs = recentLowerHighs(throughSignalDay);
  const trend20Negative = close20Ago == null ? null : signalDay.close < close20Ago;
  const bearishStructure = belowSma50 === true && (lowerHighs === true || trend20Negative === true);
  return bearishStructure
    ? { allowed: true, reason: null, belowSma50, lowerHighs, trend20Negative }
    : { allowed: false, reason: `short-regime: bearish daily structure gate not met on ${signalDay.date}`, belowSma50, lowerHighs, trend20Negative };
}
```

Then the orchestrator's `qualifyCandidate` calls **only** `evaluateEquityShortRegime` (the retained regime filter), and the born-dead branch is exercised exclusively through the new `runIssuanceChecks` semantics — satisfying the spec's static test (§1.3): no born-dead reason string is produced on the issue path outside the veto module. Prove equivalence with a differential test: random (direction, invalidation, signalDay, history) fixtures assert `signalIssuanceDecision(...)` ≡ compose(`evaluateEquityBornDead`, `evaluateEquityShortRegime`) on all four outcomes. If the builder instead rewrites inside the hashed block, `tests/drift-hashes.json` must be regenerated and the re-vendor documented — the verbatim-preserving option above avoids that.

**Item 2 — resolved.** Branches are separable (independent early-returns, no shared state); the minimal refactor is two new pure functions outside the hash-policed range, with the original kept as the differential-test oracle.

---

## 3. Realistic API budgets

### 3a. Scan cadences (verified)

| Scan | Cadence | Provenance |
|---|---|---|
| Equity `equity-theory-discovery` → `runAutomatedScan {universe:"sp100"}` | **12h**, enabled, America/Toronto | **[L]** — cron.view 2026-10-13 (PIPELINE-TRACE.md §1). Not in source (MANIFEST.md Gap #1). |
| Crypto `crypto-market-discovery` → `runMarketDiscovery {}` | **6h**, enabled, America/Toronto | **[S]** `DISCOVERY_SCAN_CADENCE_MS = 6 * 60 * 60_000` [crypto/server/src/actions.ts:1406] + **[L]** cron.view interval@6h. |
| Equity market-data refresh lane | **15m** | **[S]** `MARKET_REFRESH_CONFIG.cadenceMinutes: 15` [equity/server/src/freshness.ts] + **[L]** cron.view interval@15m. |
| Crypto market-data refresh (BTC/ETH/SOL) | **5m** | **[L]** cron.view interval@5m; lane table [S: crypto/server/src/actions.ts:2986–2988]. |
| Crypto theory discovery | 12h | [L] — theories only, no issuance relevance. |

### 3b. What the discovery scans fetch per candidate (observed counts)

**Equity scan (12h, sp100 = 101 profiles; sp500 = 503) [S: equity/server/src/actions.ts:2129–2280]:**
- Universe membership: 2 Wikipedia scrapes (S&P 100 / S&P 500) per run [O: :1705–1708].
- Velocity screen: Yahoo `v7/finance/spark`, **batched 50 symbols/request** → ⌈101/50⌉ = **3 requests/run** for sp100 (⌈503/50⌉ = 11 for sp500) [S: :1746–1765].
- Per full-scoring profile: `analyze()` → `yahooFullHistory` — **≤1 Yahoo chart request per symbol per day** (DB `historicalCaches` dedup by `fetchedOn`; cache hit = 0 requests) [S: :309–328]. Concurrency 14 (sp100) / 18 (sp500) [S: :2133].
- Issuance validation in-scan (`signalIssuanceDecision` on cached bars, :2157–2165): **0 additional requests** — stated in-code: "Reuse those exact completed bars … instead of making a second network request per symbol; the decision rule is unchanged" [S: :2161–2163]. Concurrency 4 [S: :2157].
- **Per-candidate network total: 0–1 Yahoo requests, 0 for issuance validation** [E — derived bound from the [S] constants above; not observed network traffic].
- Equity *issuance* (`recordSignal` path): exactly **1 Yahoo `/v8/finance/chart` request** per issuance attempt (`yahooSeries(symbol,"1y")`) [S: :418–420].

**Crypto discovery (6h) [S: crypto/server/src/actions.ts:3592–3840]:**
- Fixed per-run overhead: 2× CoinGecko `/coins/markets` (500 ranked assets) + 1 trending + **7 rotation-category leader requests** + 1 meme-category page + 1 stablecoin catalog (in `ensureUniverseTiers`) = **12 CoinGecko requests** [O: :3629–3645, :137–145] + 1 Hyperliquid `metaAndAssetCtxs` [O: :3631] + 3 web searches [O: :3632–3636] + 1 CoinMarketCap keyless listings [O: :3639] + Elfa **2 of 10 daily** + altFINS **1 of 10 daily** (code-configured daily credit budgets via `reserveApiCredits` — NOT account-verified provider quotas) [S: :3613, :3624].
- Per scan candidate (`scanUniverse` = saved T1 + 48h ≥ +15% velocity qualifiers): **1 Binance `klines?interval=1d&limit=201`** [S: `fetchUniverseChart`, :1243–1265; concurrency 8, :3690]. CoinGecko `/market_chart` only on Binance failure (fallback) [S: :1266–1275].
- Per *directional* candidate (issuance check, concurrency 6): **+1 CoinGecko `/coins/{id}/ohlc?vs_currency=usd&days=30`** via `loadIssuanceSignalDayCandle` [S: :1919–1945, :3758–3764].
- **Per-candidate network total: 1 Binance klines (+1 CoinGecko /ohlc if directional)** [E — derived from the [S] fetch sites above; not observed network traffic].
- Crypto *issuance* (`issueGeneratedSignalCandidate`): 1 CoinGecko `/ohlc` (signal-day candle) + 1 CoinGecko `/coins/markets?ids={coinId}` (post-decision entry quote) [S: :1978, :1989].

### 3c. Rate-limit constants in source [S]

| Provider | Constant | Ref |
|---|---|---|
| Yahoo (equity) | **650 ms minimum gap between requests, global** (per-lane + global promise queues); 3 attempts; on 429 → backoff `800 × 2^attempt` ms (800, 1600), then throw | equity/server/src/actions.ts:259–277 |
| Equity market-refresh lane | `maxSymbolsPerRun: 20`, `cadenceMinutes: 15`, `requestsPerSymbol: 1`, `retryBackoffSeconds: [30, 120]`, `quoteFreshSeconds.equity: 1800` | equity/server/src/freshness.ts (`MARKET_REFRESH_CONFIG`) |
| Crypto upstream | `UPSTREAM_TIMEOUT_MS = 20_000`; `getJson`: retry backoff `500 × (attempt+1)` ms, 202-poll `800 × (attempt+1)` ms | crypto/server/src/actions.ts:279, :284–330 |
| Binance (crypto refresh) | on 429 → `500 × 2^attempt` ms, ≤3 attempts; tracks `rateLimitCount`/`retryAfterMs`; per-symbol `requestWeight += 2 × attempts` | crypto/server/src/actions.ts:416–423, :2773–2787 |
| Elfa / altFINS | code-configured daily budgets **10/10** (not account-verified — actual provider quotas unknown); scheduled discovery reserves **2** Elfa + **1** altFINS per run | crypto/server/src/actions.ts:3613, :3624 |
| Crypto eligibility | `sourceAsOf` ≤ 30 min old required for issuance eligibility | crypto/server/src/actions.ts:3768 |

**Declared budget formula (equity, source):** `requestBudget()` → `dailyRequests = min(maxSymbolsPerRun, active) × runsPerDay(96) × requestsPerSymbol(1)` = **1,920 Yahoo requests/day** at the 15-min/20-symbol lane [S: equity/server/src/freshness.ts]. Yahoo's actual quota is not in source (unofficial API — no published limit).

### 3d. Proposed per-cycle caps (30-minute orchestrator tick)

The tick reassesses watched/shortlisted candidates only; it never runs discovery [spec §3.2]. "Quote refresh" = lightweight latest quote + new bars since `inputs.asOf` (no dossier recompute); "full recompute" = factor re-scoring on materially new inputs.

| Cap | Proposed | Provenance |
|---|---|---|
| Equity quote refreshes / tick | **≤ 50 candidates** | **[E]** proposed cap (implementation-spec §3.4; design choice — not measured, not in production source). **Source-consistent:** 650 ms Yahoo pacing [S] → 50 sequential requests ≈ **33 s of pacing**, fits the 30-min tick with headroom [E-derived]. Due-first ordering, overflow rolls to next tick. |
| Equity full dossier recompute / tick | **≤ 10 candidates** | **[E]** proposed cap (implementation-spec §3.4; design choice — not measured). **Source-consistent:** `yahooFullHistory` dedups to ≤1 Yahoo request/symbol/day via `historicalCaches` [S], and the recompute excludes valuation/SEC (the expensive path) [E — recompute scope is a design choice, not source]. |
| Crypto quote refreshes / tick | **≤ 50 candidates** | **[E]** proposed cap (implementation-spec §3.4; design choice — not measured). **Caveat:** CoinGecko free-tier quota is **not in source** and not account-verified [E — public docs ~5–15 req/min; see flag]. At ≥2 s pacing, 50 quotes ≈ **100 s/tick**, under the free tier [E]. |
| Crypto full dossier recompute / tick | **≤ 10 candidates** | **[E]** proposed cap (implementation-spec §3.4; design choice — not measured). Per recompute ≈ 1 Binance klines (weight ~5 at limit=201 [E — Binance public docs, not in source]) + 1 CoinGecko /ohlc + factor pulls; 10 is conservative [E]. |
| 429 / provider error | exponential backoff, candidate deferred, never issue on failed refresh | **[S]** spec §3.4; matches production backoff shapes above. |
| Daily ceiling cross-check (equity Yahoo) | 50 × 96 ticks = **4,800 req/day theoretical max** | **[E]** derived. 2.5× the production lane's declared 1,920/day [S]. **Flag for operator** — see below. |
| Discovery scans | unchanged (12h equity / 6h crypto), radar-only, no orchestrator calls | **[L]/[S]** — no budget impact from the tick. |

### 3e. Flags needing operator confirmation

1. **Yahoo has no documented quota; 4,800/day is 2.5× the production lane's declared 1,920/day.** The 650 ms pacing is the only in-source governor. If Yahoo starts 429ing the sandbox IP, the backoff path (`800 × 2^attempt`, then throw) fires and candidates defer — safe, but noisy. Operator may want a lower per-tick cap (e.g. 25) or a daily counter. **[E]**
2. **CoinGecko free-tier limit is not stated anywhere in source.** The ≤50/tick cap assumes ~5–15 req/min public free-tier behavior. If the deployment uses a paid key, the cap can rise; if the sandbox IP is already near CoinGecko's demo cap from other jobs, it must fall. Confirm which CoinGecko tier the sandbox runs under. **[E]**
3. **Crypto full-recompute factor pulls** (OKX OI, Hyperliquid funding, DeFiLlama TVL, etc.) have no in-source per-call budget; ≤10/tick is an estimate pending a real recompute cost audit. **[E]**
4. **Cron timings (12h/6h/15m/5m) were verified live on 2026-10-13 but are not in the exported source** (MANIFEST.md Gap #1) — if the platform remaps a job, these numbers go stale with no in-repo signal. Re-verify via cron tools at build time.

**Item 3 — resolved** (caps are concrete numbers with per-number provenance; four operator-confirmation flags listed above).

---

## 4. Production veto strings / reason codes (exact vocabulary for sandbox rejection reasons)

### 4a. Crypto [S: crypto/server/src/actions.ts]

`BORN_DEAD_REASON_PREFIX = "born-dead"` [S: :1194]. Exact strings:

| String | Emitted by | Ref |
|---|---|---|
| `issuance-validation unavailable: completed signal-day OHLC missing` | `evaluateBornDead` (null/incomplete candle) | :1220 |
| `born-dead LONG: signal-day low {low} <= invalidation {invalidation}` | `evaluateBornDead` (raw numbers, no rounding) | :1221 |
| `born-dead SHORT: signal-day high {high} >= invalidation {invalidation}` | `evaluateBornDead` | :1222 |
| `issuance-validation unavailable: invalidation missing` | discovery issuance check (null invalidation, discovery-only) | :3762 |
| `bearish daily structure confirmed: price below 50D MA and {recent swing highs are lower \| 20D trend is negative}` | `evaluateShortRegimeGate` (allowed=true) | :1210 |
| `short-regime: bearish daily structure absent (price {below \| not below} 50D MA; lower highs {yes \| no}; 20D trend {negative \| not negative})` | `evaluateShortRegimeGate` (allowed=false) | :1210 |
| `No timestamped post-decision provider quote was available; the research reference was not promoted to a paper entry.` | `issueGeneratedSignalCandidate` (no post-decision quote) | :1995 |
| `The complete immutable issuance already exists; this retry returned the accepted bundle.` | `issueGeneratedSignalCandidate` (already_exists) | :1987, :2014 |
| Status codes: `published` \| `suppressed` \| `already_exists` | `SignalIssuanceResult.status` | :1963 |

Note: crypto prefixes are the constant `"born-dead"` — the sandbox veto module must import or re-declare the identical literal (already vendored at `orchestrator/src/gates/crypto-gates.ts`).

### 4b. Equity [S: equity/server/src/actions.ts]

Equity has **no** `BORN_DEAD_REASON_PREFIX` constant — the literal `"born-dead"` is embedded in the reason strings:

| String | Emitted by | Ref |
|---|---|---|
| `issuance-check unavailable: exact completed signal-day OHLC was not available for {date}` | `signalIssuanceDecision` B1 | :403 |
| `issuance-check unavailable: exact Yahoo daily series fetch failed for {symbol}: {error}` | `exactYahooIssuanceEvidence` | :420 |
| `born-dead LONG: signal-day low {round(low,4)} <= invalidation {round(inv,4)}` | `signalIssuanceDecision` B2 (**rounded to 4 dp**, unlike crypto) | :406 |
| `born-dead SHORT: signal-day high {round(high,4)} >= invalidation {round(inv,4)}` | `signalIssuanceDecision` B2 | :406 |
| `short-regime: bearish daily structure gate not met on {date}` | `signalIssuanceDecision` B4 | :415 |
| `watch-only: {calendar} calendar is not yet supported by the issuance clock` | `recordSignal` (non-XNYS) | :449 |
| `Final candidate reconstruction or gate validation was incomplete.` | `recordSignal` (fallback suppression reason) | :456 |
| Suppression origin values: `tracker` \| `discovery` | `logSuppressedCandidate` param type | :437 |

The spec's static test keys on the `"born-dead"` prefix (and `BORN_DEAD_REASON_PREFIX`) appearing on the issue path — the sandbox must ensure neither the equity literal nor the crypto constant's output appears on that path outside `runIssuanceChecks`' own reason strings. Note the production reason strings themselves contain the literal prefix, so the test's allowlist must be exactly the veto module, not the string alone.

**Veto vocabulary — resolved.** Every production rejection string is quoted verbatim above with file:line refs; the one behavioral difference to preserve is equity's 4-dp rounding vs crypto's raw numbers.

---

## Summary

- **Item 1 (issuer signatures): RESOLVED.** Equity `recordSignal(ctx, symbol, name, setupType, _direction, _confidence, signalDate, evidence, dependencies={})` at `equity/server/src/actions.ts:448` — ships an injectable evidence seam (`RecordSignalDependencies`); DB via `ctx.db`, no clock injection. Crypto `issueGeneratedSignalCandidate(ctx, draft: GeneratedSignalDraft, input: {shortRegime, metadata, rawAtrBars?})` at `crypto/server/src/actions.ts:1976` — no injection seams; network (`getJson`) and clock (`new Date()`) are module-direct, so the paper port interposes at the call site. Both take `Ctx` from `@hatch/space-sdk`.
- **Item 2 (gate decomposition): RESOLVED.** Equity's `signalIssuanceDecision` (:402–416) is four independent early-return branches (availability → born-dead → long short-circuit → short-regime) with no shared state — fully separable. Minimal refactor: two new pure functions (`evaluateEquityBornDead`, `evaluateEquityShortRegime`) outside the drift-hashed range, original kept verbatim as the differential-test oracle. Crypto is already decomposed (`evaluateBornDead` :1219–1224, `evaluateShortRegimeGate` :1207–1211) — no refactor needed.
- **Item 3 (API budgets): RESOLVED with provenance.** Scan cadences verified (12h equity [L], 6h crypto [S+L]). Per-candidate fetch counts derived from source — not observed network traffic: equity 0–1 Yahoo req [E] (0 for issuance validation — reused cached bars [S]); crypto 1 Binance klines + 1 CoinGecko /ohlc if directional [E]. Rate-limit constants extracted from source [S] (Yahoo 650 ms global pacing; MARKET_REFRESH_CONFIG 20 symbols/15 min; Elfa/altFINS code-configured 2/10 + 1/10 daily budgets — not account-verified; Binance 429 backoff). Concrete per-tick caps proposed [E] (design choices, not measured): 50/10 equity, 50/10 crypto; four operator-confirmation flags (Yahoo quota unknown, CoinGecko tier unknown, crypto recompute cost unaudited, cron timings not in source). **No budget number in this item is account-verified.**
- **Veto vocabulary: RESOLVED.** All production rejection strings quoted verbatim with refs; equity rounds to 4 dp, crypto emits raw numbers; equity has no prefix constant (literal embedded).
- **Still needs operator confirmation:** the four flags in §3e — nothing else in this task's scope.
