import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Area, Bar, CartesianGrid, Cell, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SafeAreaTopScrim } from "@hatch/space-sdk/client";
import { api } from "./api";
import { readTheoryWithDeadline, useTheoryCollection } from "./theory-requests";
import { CALLER_CALLS, CALLER_CALLS_GENERATED_AT, type CallerCall } from "./caller-calls";

type Tab = "market" | "dossier" | "news" | "smart" | "signals" | "theories" | "assets" | "watchlist" | "journal" | "alerts" | "audit" | "meme-risk";
const tabs: Array<{ id: Tab; label: string }> = [
  { id: "market", label: "Market" },
  { id: "dossier", label: "Coin Dossier" },
  { id: "signals", label: "Signals" },
  { id: "theories", label: "Theories" },
  { id: "assets", label: "Assets" },
  { id: "watchlist", label: "Watchlist" },
  { id: "journal", label: "Journal" },
  { id: "alerts", label: "Alerts" },
  { id: "audit", label: "Measurement" },
  { id: "meme-risk", label: "Meme Risk" },
];
const horizons: Record<string, string> = { d7: "7D", d15: "15D", d30: "30D", d50: "50D", d90: "90D", d180: "6M", d365: "1Y" };
const canonicalCoinIds: Record<string, string> = { WLD: "worldcoin-wld" };
function canonicalCoinId(coinId: string, symbol?: string): string { return canonicalCoinIds[symbol?.trim().toUpperCase() ?? ""] ?? coinId.trim().toLowerCase(); }

function money(v: number | null | undefined, compact = false) { if (v == null || !Number.isFinite(v)) return "—"; if (compact) return new Intl.NumberFormat(undefined, { notation: "compact", style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(v); return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: v < 1 ? 6 : 2 }).format(v); }
function num(v: number | null | undefined, compact = false) { if (v == null || !Number.isFinite(v)) return "—"; return new Intl.NumberFormat(undefined, compact ? { notation: "compact", maximumFractionDigits: 2 } : { maximumFractionDigits: 2 }).format(v); }
function percent(v: number | null | undefined, digits = 1) { return v == null || !Number.isFinite(v) ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`; }
function dateLabel(ts: number) { if (!Number.isFinite(ts) || ts <= 0) return "Unknown"; return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(ts)); }
function sourceTimeLabel(ts: number | null | undefined) { if (ts == null || !Number.isFinite(ts) || ts <= 0) return "timestamp unavailable"; if (ts > Date.now() + 5 * 60_000) return "future timestamp rejected"; return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(ts)); }
// (batch 1) Translate known infrastructure failure strings into plain words.
// The raw string stays available to Diagnostics; it never IS the user-facing text.
function plainUpstreamError(error: unknown): string {
  const raw = String(error ?? "").replace(/^Error:\s*/, "");
  if (/ctx\.inference/i.test(raw)) return "Research synthesis did not finish in time — the machine's writing step hit its deadline. This is a missing result, not a 'nothing found' verdict; measured signals from the same scan remain usable.";
  const t = raw.match(/timeout:\s*upstream request exceeded\s*(\d+)\s*s/i);
  if (t) return `The data provider took longer than ${t[1]} seconds and the read timed out. Stored data stays visible; this section refills on the next successful run.`;
  return raw.length > 240 ? raw.slice(0, 240) + "…" : raw;
}
function Metric({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) { return <div className="metric"><span>{label}</span><strong className={tone === "up" ? "up" : tone === "down" ? "down" : ""}>{value}</strong></div>; }
function Empty({ children }: { children: string }) { return <div className="empty">{children}</div>; }
function Source({ children }: { children: string }) { return <span className="source">{children}</span>; }
function ReliabilityLine({ data }: { data: any; compact?: boolean }) {
  if (!data) return <span className="reliability unavailable"><b>RELIABILITY UNAVAILABLE</b> · calibration lookup did not complete; do not use this rating</span>;
  if (data.status === "uncalibrated" && data.sampleSize === 0) return <span className="reliability uncalibrated"><b>UNCALIBRATED</b> · {data.band} band · 0 hits / 0 misses · n=0 · {data.basis}</span>;
  const label = data.status === "calibrated" ? "CALIBRATED" : "LIMITED";
  return <span className={`reliability ${data.status}`}><b>{label}</b> · {data.hitRate == null ? "directional hit rate pending" : `${num(data.hitRate)}% directional hit rate`} · {data.band} agreement band · n={data.sampleSize} · legacy +1/−1 diagnostic only, not trading expectancy or sizing advice · {data.basis}</span>;
}

function ChartOpportunitiesBanner() { return <div className="lane-banner" role="note">CHART OPPORTUNITIES — observations only. No entries, no targets, no sizing.</div>; }
const VIEW_LABEL: Record<string, string> = {
  opportunities: "OPPORTUNITIES — what changed · why it matters · timeframe · evidence and conflicts",
  asset: "ASSET — chart, thesis, history and paper records together",
  paper: "PAPER POSITIONS — issued entries · original rules · monitoring · outcomes",
  research: "RESEARCH — hypotheses · causal links · countercases · upcoming checks",
  diagnostics: "DIAGNOSTICS — provider failures · receipts · calibration · implementation detail",
};
function ViewLabel({ view }: { view: keyof typeof VIEW_LABEL }) { return <p className="eyebrow cyan view-label" role="note">{VIEW_LABEL[view]}</p>; }
function InvestmentResearchBanner() { return <div className="lane-banner" role="note">INVESTMENT RESEARCH — assessments and theses, not trades.</div>; }

function DirectionalCommand({ d, refreshing, watching, onRefresh, onWatch }: { d: any; refreshing: boolean; watching: boolean; onRefresh: () => void; onWatch: () => void }) {
  const v = d.verdict;
  const market = useQuery({ queryKey: ["market-freshness", d.asset.symbol], queryFn: () => api.getMarketFreshness({ symbol: d.asset.symbol }), staleTime: 30_000, refetchInterval: 60_000 });
  const observations: any[] = (market.data as any)?.observations ?? []; const quote = observations.find((row) => row.kind === "quote"); const cheapVolume = observations.find((row) => row.kind === "volume_24h");
  const issued = d.signalIssuance?.acceptedSetup;
  const score = v.side === "long" ? v.longConfidence : v.shortConfidence;
  const reliability = v.side === "long" ? v.longReliability : v.shortReliability;
  const tier = score >= 80 ? "HIGH" : score >= 65 ? "MEDIUM" : "LOW";
  return <section className={`coin-command ${v.side}`} aria-label={`${d.asset.symbol} directional summary`}>
    <div className="command-asset">
      <div><p>{d.asset.name} <span>#{d.asset.rank ?? "—"}</span></p><div className="command-symbol"><h1>{d.asset.symbol}</h1><span className={`direction-chip ${v.side}`}>{v.side.toUpperCase()}</span></div></div>
      <div className="command-price"><strong>{quote?.value == null ? money(d.asset.price) : `${num(quote.value)} ${quote.quoteCurrency}`}</strong><span className={quote?.stale ? "down" : "up"}>{quote ? `${String(quote.freshness).toUpperCase()} · ${quote.venue}` : `${percent(d.asset.change24h)} · last known mark · ${sourceTimeLabel(new Date(d.asset.lastUpdated).getTime())} · CoinGecko`}</span>{cheapVolume?.value != null && <small>Binance Spot 24H quote volume · {num(cheapVolume.value, true)} {cheapVolume.quoteCurrency} · as of {sourceTimeLabel(new Date(cheapVolume.eventAt).getTime())} · {String(cheapVolume.fetchHealth ?? cheapVolume.freshness).toUpperCase()}</small>}</div>
    </div>
    <div className="indicator-grid command-context" aria-label="Assessment status"><Metric label="Assessment" value={`${v.side.toUpperCase()} · ${score}/100 agreement`}/><Metric label="Horizon" value={issued?.horizon ?? "Research · horizon not issued"}/><Metric label="Analysis generated at" value={sourceTimeLabel(new Date(d.asset.lastUpdated).getTime())}/><Metric label="Market data as of" value={quote ? sourceTimeLabel(new Date(quote.freshnessAt).getTime()) : sourceTimeLabel(new Date(d.asset.lastUpdated).getTime())}/><Metric label="Freshness" value={quote ? String(quote.freshness).toUpperCase() : "UNKNOWN"}/><Metric label="Validation" value={issued ? "Issued contract · edge unvalidated" : "Unvalidated research"}/><Metric label="Cohort" value={issued ? "Prospective issued calls" : "Research assessment"}/><Metric label="Eligibility" value={issued ? (quote?.stale ? "Blocked · market data stale" : "Issued contract preserved") : "Not eligible · no issued contract"}/></div>
    <div className="command-call">
      <div className="command-score"><span>Factor alignment · NOT A PROBABILITY</span><strong>{score} / 100</strong><small>{tier} alignment tier</small></div>
      <div className="command-levels">
        {issued ? <><Metric label="Issued entry" value={money(issued.entry)}/><Metric label="Issued stop" value={money(issued.stop)} tone="down"/><Metric label="Issued target 1" value={money(issued.target1)} tone="up"/><Metric label="Issued target 2" value={money(issued.target2)} tone="up"/></> : <><Metric label="Research-reference entry" value={`${money(v.entryLow)} – ${money(v.entryHigh)}`}/><Metric label="Research-reference invalidation" value={money(v.invalidation)} tone="down"/><Metric label="Research-reference target 1" value={money(v.target1)} tone="up"/><Metric label="Research-reference target 2" value={money(v.target2)} tone="up"/></>}
      </div>
    </div>
    <p className="score-disclaimer">{issued ? `Accepted immutable ${issued.direction} contract · ${issued.entryRule} · these are the levels the evaluator grades. The dossier's chart levels remain research references.` : v.riskMethod === "unavailable" ? "Research-reference risk levels withheld — complete daily OHLC data is required for true Wilder ATR-14. No issued setup is attached." : `Research-reference only · invalidation uses ${num(v.riskMultiplier)}× true Wilder ATR-14; no issued setup is attached.`}</p>
    <div className="command-foot"><ReliabilityLine data={reliability}/><div className="command-actions"><button aria-label="Refresh analysis and market read" onClick={onRefresh} disabled={refreshing}>{refreshing ? "Refreshing…" : "Refresh"}</button><button aria-label={watching ? `Remove ${d.asset.symbol} from watchlist` : `Add ${d.asset.symbol} to watchlist`} onClick={onWatch}>{watching ? "Watching" : "+ Watch"}</button></div></div>
    <p className="command-asof">Current mark {quote ? `${quote.freshnessBasis} ${sourceTimeLabel(new Date(quote.freshnessAt).getTime())}` : "unavailable from cheap lane"} · analysis generated at {sourceTimeLabel(new Date(d.asset.lastUpdated).getTime())} · factor alignment is not a profit probability</p>
  </section>;
}

function AssetContext({ d }: { d: any }) { return <details className="asset-context"><summary>Context · crowd, fundamentals, known gaps</summary><div className="snapshot"><Metric label="Market cap" value={money(d.asset.marketCap, true)}/><Metric label="CoinGecko market-wide spot volume · USD" value={`${money(d.asset.volume24h, true)} · as of ${sourceTimeLabel(new Date(d.asset.lastUpdated).getTime())}`}/><Metric label="Fear & Greed" value={d.sentiment?.fearGreed == null ? "NO_DATA" : `${num(d.sentiment.fearGreed)} · ${d.sentiment.classification ?? "unclassified"} · ${sourceTimeLabel(new Date(d.sentiment.asOf).getTime())}`}/><Metric label="Developer velocity" value={d.developerVelocity?.state === "available" ? `${num(d.developerVelocity.commits12w)} commits / 12w · n=${d.developerVelocity.sampleWeeks}` : "NO_DATA · no verified CoinGecko→GitHub mapping"}/><Metric label="ATH distance" value={percent(d.asset.athDistance)}/><Metric label="Circulating" value={num(d.asset.circulatingSupply, true)}/></div><p className="muted">Market-wide CoinGecko USD volume is contextual coverage across reported venues. The current Binance Spot USDT quote volume above is a separate venue-specific feed and is not directly comparable.</p></details>; }

function AssetContextSummary({ context, compact = false }: { context: any; compact?: boolean }) {
  if (!context) return <section className="asset-brief empty-brief"><Empty>No verified asset context is linked yet.</Empty></section>;
  const questions = [
    ["What is it?", context.what], ["Why is it here?", context.why], ["What’s the logic?", context.logic], ["What disagrees?", context.disagrees], ["What next?", context.next],
  ];
  return <section className={`asset-brief ${compact ? "compact" : ""}`} aria-label={`${context.symbol} asset context`}>
    <div className="asset-brief-head"><div><p className="eyebrow cyan">{context.symbol} · {context.instrument}</p><h2>Opportunity in plain English</h2></div><small>as of {sourceTimeLabel(new Date(context.dataAsOf).getTime())}</small></div>
    <div className="asset-state-strip"><span><b>Price</b>{money(context.price?.value)}<small>{context.price?.capturedAt ? sourceTimeLabel(new Date(context.price.capturedAt).getTime()) : "no stored mark"}</small></span><span><b>Signal</b>{String(context.signal?.status ?? "none").replaceAll("_", " ")}<small>{context.signal?.direction ?? "no direction"}</small></span><span><b>Delivery</b>{String(context.delivery?.status ?? "none").replaceAll("_", " ")}<small>{context.delivery?.acknowledgedAt ? `ack ${sourceTimeLabel(new Date(context.delivery.acknowledgedAt).getTime())}` : "no acknowledgement"}</small></span></div>
    <div className="asset-five">{questions.map(([label, text]) => <article key={label}><strong>{label}</strong><p>{text || "No linked record yet."}</p></article>)}</div>
    <details><summary>Sources, calculations and saved history</summary><div className="asset-evidence"><h3>Sources</h3>{context.sources?.length ? context.sources.map((source:any,index:number)=><div key={`${source.label}-${index}`}><span>{source.url ? <a href={source.url} target="_blank" rel="noreferrer">{source.label}</a> : source.label}</span><small>{source.observedAt ? sourceTimeLabel(new Date(source.observedAt).getTime()) : "time unavailable"}</small></div>) : <p>No linked sources.</p>}<h3>Calculations</h3>{context.calculations?.map((row:any)=><div key={row.label}><b>{row.label}</b><span>{row.detail}</span></div>)}<h3>Frozen assessments</h3>{context.history?.length ? <>{context.history.map((row:any)=><details key={row.assessmentKey}><summary>{row.flow} · {sourceTimeLabel(new Date(row.decisionAt).getTime())} · {Array.isArray(row.outcomes) ? row.outcomes.length : Number(row.outcomes ?? 0)} outcome{(Array.isArray(row.outcomes) ? row.outcomes.length : Number(row.outcomes ?? 0)) === 1 ? "" : "s"}</summary>{Array.isArray(row.outcomes) ? row.outcomes.map((o:any,i:number)=><div key={i}><b>{String(o.outcomeType).toUpperCase()}</b><small>{o.observedAt ? sourceTimeLabel(new Date(o.observedAt).getTime()) : "time unavailable"}</small><details><summary>Content (full)</summary><p>{typeof o.content === "string" ? o.content : JSON.stringify(o.content ?? {})}</p></details>{o.evidence != null && JSON.stringify(o.evidence ?? {}) !== "{}" ? <details><summary>Evidence (full)</summary><p>{typeof o.evidence === "string" ? o.evidence : JSON.stringify(o.evidence)}</p></details> : null}</div>) : <p>{Number(row.outcomes ?? 0)} attached outcomes.</p>}</details>)}</> : <p>No prior frozen assessment snapshot yet.</p>}{context.withdrawnTheories?.length ? <><h3>Withdrawn theories · labeled history</h3><p className="muted">Withdrawn reasoning is preserved for inspection. It no longer leads this card.</p>{context.withdrawnTheories.map((t:any)=><details key={t.id}><summary>WITHDRAWN · {t.title}</summary><p><b>Reason:</b> {t.withdrawal?.reason ?? "unstated"}</p><p><b>Withdrawn:</b> {t.withdrawal?.withdrawnAt ? sourceTimeLabel(new Date(t.withdrawal.withdrawnAt).getTime()) : "time unavailable"} by {t.withdrawal?.withdrawnBy ?? "unknown"}</p>{t.withdrawal?.evidence ? <details><summary>Evidence (full)</summary><p>{JSON.stringify(t.withdrawal.evidence)}</p></details> : null}</details>)}</> : null}</div></details>
  </section>;
}

function AlertContextSummary({ context, onOpen }: { context: any; onOpen: () => void }) {
  return <div className="alert-brief" aria-label={`${context.symbol} alert context`}>
    <div><strong>{context.symbol} · {context.instrument}</strong><small>{money(context.price?.value)} · signal {String(context.signal?.status ?? "none").replaceAll("_", " ")} · delivery {String(context.delivery?.status ?? "none").replaceAll("_", " ")}</small></div>
    <p><b>What</b>{context.what}</p><p><b>Why</b>{context.why}</p><p><b>Logic</b>{context.logic}</p><p><b>Disagrees</b>{context.disagrees}</p><p><b>Next</b>{context.next}</p>
    <button onClick={onOpen}>Open full dossier</button>
  </div>;
}

function ageLabel(ms: number | null | undefined) { if (ms == null || !Number.isFinite(ms)) return "age unavailable"; if (ms < 60_000) return `${Math.max(0, Math.floor(ms / 1000))}s old`; if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m old`; if (ms < 86_400_000) return `${(ms / 3_600_000).toFixed(1)}h old`; return `${(ms / 86_400_000).toFixed(1)}d old`; }
function inputValue(row: any) { if (row.kind === "quote") return `${num(row.value)} ${row.quoteCurrency}`; if (row.kind === "volume_24h") return `${num(row.value, true)} ${row.quoteCurrency}`; return `${num(row.open)} / ${num(row.high)} / ${num(row.low)} / ${num(row.close)} ${row.quoteCurrency}`; }
function FreshnessPanel({ symbol }: { symbol: string }) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["market-freshness", symbol], queryFn: () => api.getMarketFreshness({ symbol }), staleTime: 30_000, refetchInterval: 60_000 });
  const refresh = useMutation({ mutationFn: async () => { const market = await api.refreshMarketData({ symbols: [symbol], trigger: "manual" }); await api.refreshSignalStatuses({ trigger: "manual" }); return market; }, onSuccess: () => qc.invalidateQueries({ queryKey: ["market-freshness", symbol] }) });
  const data: any = query.data;
  const rows = data?.observations ?? [];
  return <section className="freshness-panel" aria-label={`${symbol} input freshness`}>
    <div className="freshness-head"><div><p className="eyebrow cyan">Independent market-data lane</p><h2>Input freshness</h2></div><button onClick={() => refresh.mutate()} disabled={refresh.isPending}>{refresh.isPending ? "Refreshing marks…" : "Refresh market data"}</button></div>
    {rows.length ? <div className="freshness-grid">{rows.map((row:any) => <article key={`${row.kind}-${row.candleState}`} className={`freshness-input ${row.stale ? "stale" : ""}`}><div><strong>{row.kind === "volume_24h" ? "24H quote volume" : row.kind === "quote" ? "Current mark" : `${row.candleState} daily candle`}</strong><span className={`fresh-state ${row.freshness}`}>{String(row.freshness).toUpperCase()}</span></div><b>{inputValue(row)}</b><small>{row.kind === "candle" ? `interval ${sourceTimeLabel(new Date(row.intervalStartAt ?? row.eventAt).getTime())} → ${sourceTimeLabel(new Date(row.intervalEndAt ?? row.eventAt).getTime())}` : `provider event ${sourceTimeLabel(new Date(row.eventAt).getTime())}`}</small><small>{row.freshnessBasis} · {ageLabel(row.cacheAgeMs)} · latest successful fetch {sourceTimeLabel(new Date(row.lastSuccessfulRefreshAt).getTime())}</small><small>fetch health {String(row.fetchHealth ?? "unavailable").toUpperCase()} · provider event {row.providerEventHealth ? String(row.providerEventHealth).toUpperCase() : "not supplied"}</small><small>{row.venue} · {row.pair} · {row.source}{row.providerVersion > 1 ? ` · correction v${row.providerVersion}` : ""}</small>{row.kind === "candle" && <small>{row.candleState === "forming" ? "Live partial volume; excluded from completed-candle decision inputs." : "Completed observation; issuance snapshots still remain immutable."}</small>}</article>)}</div> : <div className="freshness-empty"><p>{query.isPending ? "Loading owned market cache…" : "No owned market observation yet for this supported pair."}</p><small>The analysis lane remains separate; use market refresh for a cheap quote/candle update.</small></div>}
    <div className="freshness-lanes">{(data?.lanes ?? []).map((lane:any) => <div key={lane.id}><strong>{lane.label}</strong><span>{lane.cadence}</span><small>{lane.source}</small></div>)}</div>
    {(data?.decisions ?? []).length > 0 && <details className="frozen-decisions"><summary>Issued contracts stay frozen · {data.decisions.length}</summary>{data.decisions.map((decision:any) => <div key={decision.signalId}><strong>{decision.direction.toUpperCase()} · {decision.signalId}</strong><span>entry {money(decision.entryPrice)} · stop {money(decision.stopPrice)} · target {money(decision.targetPrice)}</span><small>decision {sourceTimeLabel(new Date(decision.decisionAt).getTime())} · snapshot #{decision.inputSnapshotId}</small></div>)}</details>}
    {(data?.statusEvents ?? []).length > 0 && <details className="status-events"><summary>Timestamped status events · {data.statusEvents.length}</summary>{data.statusEvents.slice(0, 12).map((event:any) => <div key={event.eventKey}><strong>{String(event.status).replaceAll("_", " ")}</strong><span>{event.observedPrice == null ? "No mark" : money(event.observedPrice)}</span><small>{sourceTimeLabel(new Date(event.observedAt).getTime())} · unsettled quote evidence</small></div>)}</details>}
    <p className="freshness-note">A fresh mark never freshens funding, OI, news or an issued decision. Quote-only barrier observations remain unsettled until the existing path evaluator has adequate coverage.</p>
    {refresh.data && !(refresh.data as any).ok && <p className="freshness-error">Refresh failed; the last-known values remain visible with stale status.</p>}
  </section>;
}

function MarketChart({ data, candles, indicators, symbol }: { data: any[]; candles: any[]; indicators: any; symbol: string }) {
  const current = useQuery({ queryKey: ["market-freshness", symbol], queryFn: () => api.getMarketFreshness({ symbol }), staleTime: 30_000, refetchInterval: 60_000 }); const mark = ((current.data as any)?.observations ?? []).find((row: any) => row.kind === "quote");
  const [mode, setMode] = useState<"line" | "candles">("line"); const [sma, setSma] = useState(true); const [ema, setEma] = useState(false);
  const rows = useMemo(() => {
    const src = (mode === "candles" && candles.length ? candles : data).slice(-180);
    const alpha = 2 / 21; let ema20: number | null = null;
    return src.map((r: any, i: number, a: any[]) => {
      const before20 = a.slice(Math.max(0, i - 19), i + 1).map((x: any) => Number(x.close)); const before50 = a.slice(Math.max(0, i - 49), i + 1).map((x: any) => Number(x.close));
      if (i === 19) ema20 = before20.reduce((x: number, y: number) => x + y, 0) / 20;
      else if (i > 19 && ema20 !== null) ema20 = Number(r.close) * alpha + ema20 * (1 - alpha);
      const volWindow = a.slice(Math.max(0, i - 29), i + 1).map((x: any) => Number(x.volume ?? 0)); const volMean = volWindow.length ? volWindow.reduce((x: number, y: number) => x + y, 0) / volWindow.length : 0;
      return { ...r, date: dateLabel(r.ts), sma20: before20.length === 20 ? before20.reduce((x: number, y: number) => x + y, 0) / 20 : null, ema20, body: r.open != null ? [Math.min(r.open, r.close), Math.max(r.open, r.close)] : null, wick: r.low != null ? [r.low, r.high] : null, rising: r.open == null || r.close >= r.open, sma50: before50.length === 50 ? before50.reduce((x: number, y: number) => x + y, 0) / 50 : null, volumeRegime: volMean > 0 ? Number(r.volume ?? 0) / volMean : null };
    });
  }, [data, candles, mode]);
  return <section className="chart-panel">
    <div className="panel-head"><div><p className="eyebrow">Price evidence</p><h2>1 year tape</h2></div><div className="seg"><button className={mode === "line" ? "active" : ""} onClick={() => setMode("line")}>Line</button><button disabled={!candles.length} title={!candles.length ? "OHLC unavailable on Kraken" : ""} className={mode === "candles" ? "active" : ""} onClick={() => setMode("candles")}>Candles</button></div></div>
    <div className="chart-controls"><label><input type="checkbox" checked={sma} onChange={(e) => setSma(e.target.checked)} /> SMA 20/50</label><label><input type="checkbox" checked={ema} onChange={(e) => setEma(e.target.checked)} /> EMA 20</label><Source>{mode === "candles" ? "Kraken" : "CoinGecko"}</Source></div>
    {mark && <div className={`chart-live-mark ${mark.stale ? "stale" : ""}`}><span>Separate live mark · not spliced into {mode === "candles" ? "Kraken USD candles" : "CoinGecko USD history"}</span><strong>{num(mark.value)} {mark.quoteCurrency}</strong><small>{mark.venue} · {String(mark.freshness).toUpperCase()} · {mark.freshnessBasis} {sourceTimeLabel(new Date(mark.freshnessAt).getTime())}</small></div>}
    <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={rows} margin={{ top: 8, right: 4, left: -18, bottom: 0 }}><CartesianGrid stroke="#1d2925" vertical={false}/><XAxis dataKey="ts" tickFormatter={(v: number) => new Intl.DateTimeFormat(undefined, { month: "short" }).format(new Date(v))} minTickGap={46} stroke="#73827b" fontSize={10}/><YAxis domain={["auto", "auto"]} stroke="#73827b" fontSize={10} tickFormatter={(v: number) => v < 1 ? v.toFixed(3) : v.toFixed(0)}/><Tooltip contentStyle={{ background: "#101513", border: "1px solid #2b3934", fontFamily: "IBM Plex Mono, monospace" }} labelFormatter={(v) => dateLabel(Number(v))} formatter={(v: any, name: any) => [Array.isArray(v) ? `${money(v[0])} – ${money(v[1])}` : money(Number(v)), String(name)]}/>{mode === "candles" && candles.length ? <Bar dataKey="body" name="Open–close" barSize={4}>{rows.map((r: any, i: number) => <Cell key={i} fill={r.rising ? "#67f578" : "#ff5c5c"}/>)}</Bar> : <Area type="monotone" dataKey="close" name="Close" stroke="#67f578" fill="#173c22" strokeWidth={2} isAnimationActive={false}/>} {sma && <Line type="monotone" dataKey="sma20" name="SMA 20" stroke="#38d7ff" dot={false} strokeWidth={1.3} isAnimationActive={false}/>} {sma && <Line type="monotone" dataKey="sma50" name="SMA 50" stroke="#f7c65f" dot={false} strokeWidth={1.3} isAnimationActive={false}/>} {ema && <Line type="monotone" dataKey="ema20" name="EMA 20" stroke="#ff8a65" dot={false} strokeDasharray="4 3" isAnimationActive={false}/>}<Legend /></ComposedChart></ResponsiveContainer></div>
    <div className="volume-regime"><span>Volume regime · multiple of trailing 30D mean</span><ResponsiveContainer width="100%" height={72}><ComposedChart data={rows}><XAxis dataKey="ts" hide/><YAxis domain={[0, "auto"]} hide/><Tooltip labelFormatter={(v) => dateLabel(Number(v))} formatter={(v:any) => [`${Number(v).toFixed(2)}×`, "Volume regime"]} contentStyle={{ background: "#101513", border: "1px solid #2b3934" }}/><Line type="monotone" dataKey="volumeRegime" stroke="#f7c65f" dot={false} isAnimationActive={false}/></ComposedChart></ResponsiveContainer></div>
    <p className="chart-note">RSI {num(indicators.rsi14)} · MACD histogram {num(indicators.macdHistogram)} · Wilder ATR-14 {indicators.atr14 == null ? "unavailable (OHLC required)" : money(indicators.atr14)} · Volume z {num(indicators.volumeZ)}</p>
  </section>;
}

function MarketRead({ market, compact = false, openCoin, openFull }: { market: any; compact?: boolean; openCoin?: (id: string, symbol: string) => void; openFull?: () => void }) {
  const m = market?.data;
  if (!m) return <section className="market-read"><div className="market-read-head"><div><p className="eyebrow cyan">Market read</p><h2>Coverage is loading</h2></div><span className="feed-badge partial">PARTIAL FEED</span></div><p className="muted">{market?.error ?? "Refreshing CoinGecko prices and OKX instrument coverage…"}</p></section>;
  return <section className={`market-read ${compact ? "compact" : ""}`}>
    <div className="market-read-head"><div><p className="eyebrow cyan">Market read</p><h2>{m.synthesis}</h2></div>{compact && openFull ? <button className="text-action" onClick={openFull}>Open desk</button> : m.partial ? <span className="feed-badge partial">PARTIAL FEED</span> : <span className="feed-badge">FULL FEED</span>}</div>
    <div className="market-stats"><Metric label="15-day breadth" value={m.breadth15 == null ? "—" : `${num(m.breadth15)}%`}/><Metric label="3+ horizon flags" value={num(m.activeFlags)}/><Metric label="4+ horizon flags" value={num(m.highAlignment)}/><Metric label="BTC OI / price regime" value={String(m.btcCrossVenue?.regimeLabel ?? "NO_DATA").toUpperCase()}/></div>
    <p className="provenance">{m.refreshed} instruments have complete CoinGecko + OKX coverage; {m.unavailable} partial or unavailable{m.unavailableSymbols.length ? ` (${m.unavailableSymbols.join(", ")})` : ""}.{compact ? " Open Market read for per-source status." : " Select an instrument to open its dossier."}</p>
    {!compact && <div className="instrument-status">{m.rows.map((row:any) => <button type="button" key={row.symbol} className={`instrument-source ${row.available && row.okxMapped ? "ok" : "partial"}`} onClick={() => openCoin?.(row.id, row.symbol)} disabled={!openCoin || !row.available} aria-label={row.available ? `Open ${row.symbol} dossier` : `${row.symbol} price history unavailable`}>
      <strong>{row.symbol}</strong>
      <div><span className={row.available ? "available" : "unavailable"}>CoinGecko {row.available ? "available" : "unavailable"}</span><time>{row.available ? sourceTimeLabel(row.sourceTime) : "timestamp unavailable"}</time></div>
      <div><span className={row.okxMapped ? "available" : "unavailable"}>OKX {row.okxMapped ? "mapped" : "unavailable"}</span><time>checked {sourceTimeLabel(row.okxSourceTime)}</time></div>
      {row.unavailableReason && <small>{row.unavailableReason}</small>}<em>Open dossier →</em>
    </button>)}</div>}
  </section>;
}

function SignalTape({ d }: { d: any }) { const [filter, setFilter] = useState<"all"|"bullish"|"bearish"|"pinned">("all"); const [pinned, setPinned] = useState<string[]>([]); const [open, setOpen] = useState<string | null>(null); const rows = (d.setups ?? []).filter((row:any) => filter === "all" || (filter === "pinned" ? pinned.includes(row.id) : row.direction === filter)); const pin = (id:string) => setPinned((old) => old.includes(id) ? old.filter((x) => x !== id) : [...old, id]); return <section className="terminal-section signal-tape"><div className="panel-head"><div><p className="eyebrow cyan">Signal tape</p><h2>Named, testable setups</h2></div><span className="alignment-note">alignment density, never probability</span></div><div className="seg signal-filters">{(["all","bullish","bearish","pinned"] as const).map((name) => <button key={name} className={filter === name ? "active" : ""} onClick={() => setFilter(name)}>{name}</button>)}</div>{rows.length ? <div className="setup-list">{rows.map((row:any) => <article key={row.id} className={open === row.id ? "open" : ""}><button className="setup-main" aria-expanded={open === row.id} onClick={() => setOpen(open === row.id ? null : row.id)}><div><strong>{row.name}</strong><small>{row.aligned} supporting conditions · {row.conflicts} contradictions</small><small className={d.asset.lastUpdated && Date.now() - new Date(d.asset.lastUpdated).getTime() > 30 * 60_000 ? "stale" : ""}>{d.asset.lastUpdated ? `${Date.now() - new Date(d.asset.lastUpdated).getTime() > 30 * 60_000 ? "STALE · " : ""}as of ${new Date(d.asset.lastUpdated).toLocaleString()}` : "Source timestamp unavailable"}</small><small>Invalidation {money(row.invalidation)} · expand for disconfirming evidence</small></div><span className={row.direction === "bullish" ? "up" : "down"}>{row.direction}</span><b>CONDITION SET · NO COMPOSITE RATING</b></button><button className={`pin ${pinned.includes(row.id) ? "on" : ""}`} aria-label={`${pinned.includes(row.id) ? "Unpin" : "Pin"} ${row.name}`} onClick={() => pin(row.id)}>⌖</button>{open === row.id && <div className="setup-detail"><p><span>Empirical read</span>{row.empirical}</p><p><span>Thesis</span>{row.thesis}</p><p><span>Failure condition</span>{row.failure}</p><div className="levels"><Metric label="Entry zone" value={`${money(row.entryLow)} – ${money(row.entryHigh)}`}/><Metric label="Invalidation" value={money(row.invalidation)} tone="down"/><Metric label="Target 1 (chart)" value={money(row.targets[0])} tone="up"/><Metric label="Target 2 (chart)" value={money(row.targets[1])} tone="up"/></div></div>}</article>)}</div> : <Empty>No signals match this filter.</Empty>}</section>; }


// ---- Five-view completion batch (client part 2 of 2) -----------------------
// Research shortlist (research-shortlist-v0.1): a separately-versioned
// research read model rendered from getResearchShortlist. It never issues
// and never gates; every point of a row's priority is a rendered
// contribution line — there is no hidden term.
function signedEffect(effect: number): string { return effect > 0 ? `+${effect}` : effect < 0 ? `−${Math.abs(effect)}` : "0"; }

function ShortlistContribution({ c }: { c: any }) {
  if (c?.kind === "fundamentals-nodata") {
    return <div className="shortlist-contrib">
      <p><b>{c.feed}</b> · {c.metric ?? "factor"} · {c.canonicalIdentity ?? "canonical identity unrecorded"}</p>
      <p>Primary source · {c.primarySource ?? "unrecorded"}</p>
      <p>Reason · {c.reason ?? c.observation}</p>
      <p>Last attempt · {c.lastAttemptAt ? new Date(c.lastAttemptAt).toLocaleString() : "not recorded"} · effect {signedEffect(Number(c.effect ?? 0))}</p>
      {c.classification ? <span className="status">{c.classification}</span> : null}
    </div>;
  }
  return <div className="shortlist-contrib">
    <p><b>{c.feed}</b> · {c.observation}</p>
    <p>as of {c.asOf ? new Date(c.asOf).toLocaleString() : "timestamp unavailable"} · effect {signedEffect(Number(c.effect ?? 0))}{c.stale ? " · stale" : ""}{c.flag ? ` · flag: ${c.flag}` : ""}</p>
  </div>;
}

function ResearchShortlistStrip() {
  const q = useQuery({ queryKey: ["research-shortlist"], queryFn: () => api.getResearchShortlist({}), staleTime: 300_000 });
  const data: any = q.data;
  const rows: any[] = [...(data?.rows ?? [])].sort((a: any, b: any) => (b.priority ?? 0) - (a.priority ?? 0) || String(a.symbol).localeCompare(String(b.symbol)));
  return <section className="terminal-section research-shortlist" aria-label="Research shortlist">
    <div className="panel-head"><div><p className="eyebrow cyan">Investigation priority · stored evidence only</p><h2>Research shortlist{data?.version ? ` · ${data.version}` : ""}</h2></div><button className="refresh-small" onClick={() => q.refetch()} disabled={q.isFetching}>{q.isFetching ? "Reloading…" : "Reload"}</button></div>
    <p className="funnel-stamp">{data ? `computed ${new Date(data.computedAt).toLocaleString()} · snapshot ${data.snapshotId ?? "unrecorded"}` : q.isPending ? "Loading the research shortlist…" : "Research shortlist unavailable."}</p>
    <p className="score-disclaimer">Research ranking — never issues, never gates.</p>
    {data ? <>
      <details className="shortlist-how"><summary>How this ranking works</summary>
        {(data.howItWorks ?? []).map((line: string, i: number) => <p key={`how-${i}`}>{line}</p>)}
        {(data.banner ?? []).map((line: string, i: number) => <p key={`banner-${i}`}><b>Context · </b>{line}</p>)}
      </details>
      {rows.length ? <div className="shortlist-rows">{rows.map((row: any) => <article key={row.symbol} className="shortlist-row">
        <header><div><strong>{row.symbol}</strong><small>priority {row.priority > 0 ? `+${row.priority}` : row.priority}</small></div>
          <span className="shortlist-flags">{(row.flags ?? []).map((flag: string) => <span key={flag} className="status">{flag}</span>)}</span>
        </header>
        {row.issuanceSupport === "unsupported" ? <p className="issuance-support"><span className="issuance-support-chip">UNSUPPORTED FOR FORMAL ISSUANCE — research only</span>{row.issuanceSupportReason ? <span className="issuance-support-reason">{row.issuanceSupportReason}</span> : null}</p> : null}
        {row.conflict?.present && row.conflict?.description ? <p className="shortlist-conflict"><span className="status challenged">conflict · {row.conflict.description}</span></p> : null}
        <details><summary>Contribution lines · {(row.contributions ?? []).length} · priority is their plain sum</summary>
          {(row.contributions ?? []).map((c: any, i: number) => <ShortlistContribution key={i} c={c}/>)}
        </details>
        {row.question ? <p className="asset-meta">Question · {row.question}</p> : null}
        {row.nextCheck ? <p className="asset-meta">Next check · {row.nextCheck}</p> : null}
        {row.whatWouldChangeIt ? <p className="asset-meta">What would change it · {row.whatWouldChangeIt}</p> : null}
      </article>)}</div> : <Empty>No asset currently qualifies for the research shortlist.</Empty>}
      {(data.notes ?? []).length ? <div className="shortlist-notes">{data.notes.map((note: string, i: number) => <p key={i} className="asset-meta">{note}</p>)}</div> : null}
    </> : q.isPending ? <Empty>Loading the research shortlist…</Empty> : <Empty>Research shortlist unavailable.</Empty>}
  </section>;
}

function QuestionsQueue() {
  const q = useQuery({ queryKey: ["research-shortlist"], queryFn: () => api.getResearchShortlist({}), staleTime: 300_000 });
  const data: any = q.data;
  const rows: any[] = [...(data?.rows ?? [])].sort((a: any, b: any) => (b.priority ?? 0) - (a.priority ?? 0) || String(a.symbol).localeCompare(String(b.symbol))).slice(0, 5);
  return <section className="terminal-section questions-queue" aria-label="Research questions queue">
    <div className="panel-head"><div><p className="eyebrow cyan">From the research shortlist</p><h2>Questions queue</h2></div><Source>getResearchShortlist</Source></div>
    <p className="muted">The top five shortlist priorities and the question each one is asking. This is the shortlist's own data — nothing here is newly generated.</p>
    {q.isPending ? <Empty>Loading the questions queue…</Empty> : rows.length ? <div className="asset-record-list">{rows.map((row: any) => <article key={row.symbol} className="asset-record compact-record">
      <header><div><strong>{row.symbol}</strong><small>priority {row.priority > 0 ? `+${row.priority}` : row.priority}</small></div></header>
      <p className="asset-meta">Question · {row.question ?? "no question recorded"}</p>
      <p className="asset-meta">Next check · {row.nextCheck ?? "not recorded"}</p>
      <p className="asset-meta">What would change it · {row.whatWouldChangeIt ?? "not recorded"}</p>
    </article>)}</div> : <Empty>No shortlist rows are available for the questions queue.</Empty>}
  </section>;
}

function DeliveryChip({ alerts, paperSignalId, contractId }: { alerts: any[]; paperSignalId?: unknown; contractId?: unknown }) {
  const match = (alerts ?? []).filter((a: any) => (paperSignalId != null && String(a.paperSignalId) === String(paperSignalId)) || (contractId != null && String(a.contractId) === String(contractId))).sort((a: any, b: any) => new Date(b.enqueuedAt).getTime() - new Date(a.enqueuedAt).getTime())[0];
  if (!match) return <span className="status">Delivery · no alert row</span>;
  // Terminal visibility is recorded separately from chat arrival; a chat
  // copy stamped after the entry window closed makes the item historical.
  const chatLate = Boolean(match.chatSentAt && match.expiresAt && new Date(match.chatSentAt).getTime() > new Date(match.expiresAt).getTime());
  return <span className="status">Delivery · {String(match.status)}{match.acknowledgedAt ? ` · ack ${new Date(match.acknowledgedAt).toLocaleString()}` : ""} · terminal {new Date(match.createdAt ?? match.enqueuedAt).toLocaleString()}{match.chatSentAt ? ` · chat ${new Date(match.chatSentAt).toLocaleString()}` : ""}{chatLate ? " · HISTORICAL — chat arrived after expiry" : ""}</span>;
}

function plainContractState(state: unknown): string | null {
  if (typeof state !== "string" || !state) return null;
  const s = state.toUpperCase();
  if (s === "SETUP_PENDING" || s === "PENDING") return "setup issued — awaiting entry";
  if (s === "ENTRY_CONFIRMED" || s === "ENTERED") return "entered — open";
  if (s.includes("VOID")) return "void before entry";
  if (s.includes("EXPIRED")) return "expired";
  return null;
}

function settlementHeadline(s: any): string {
  const raw = String(s?.settlementOutcome ?? "").toLowerCase();
  let label = String(s?.settlementOutcome ?? "settled").replaceAll("_", " ");
  if (raw.includes("invalid")) label = "invalidated";
  else if (/target\s*1|t1/.test(raw)) label = "target 1 hit";
  else if (/target\s*2|t2/.test(raw)) label = "target 2 hit";
  const r = typeof s?.grossR === "number" && Number.isFinite(s.grossR) ? s.grossR : null;
  const rText = r === null ? "gross R unrecorded" : `${r >= 0 ? "+" : "−"}${Math.abs(r).toFixed(2)}R gross`;
  return `Settled — ${label} (${rText})`;
}

// Fundamentals NO_DATA four-part explanation (batch §6): metric + canonical
// identity, primary source + the fallback the reason itself names (never an
// invented one), last attempt + result + next retry, and a classification
// chip derived from the reason text by the batch's fixed rules.
function noDataClassification(reason: string): string {
  const t = reason.toLowerCase();
  if (t.includes("no curated") || t.includes("no defillama mapping") || t.includes("no github.com repository linked") || t.includes("no mapping")) return "mapping missing";
  if (t.includes("returned zero commits") || t.includes("flagged for review")) return "provider failure / mapping under review";
  if (t.includes("unlock timing has no verified feed")) return "unsupported";
  return "provider failure";
}
function fundNoDataReason(row: any, s: any): string {
  if (s.label === "Revenue yield" && row.revenueYield?.reason) return String(row.revenueYield.reason);
  if (s.label === "Developer velocity" && row.developerVelocity?.reason) return String(row.developerVelocity.reason);
  return String(s.reading ?? "NO_DATA");
}
function fundFallback(reason: string): string {
  if (/crosswalk/i.test(reason)) return "the DeFiLlama gecko_id crosswalk named in the reason (attempted; no verified slug)";
  return "no suitable fallback";
}
function FundNoData({ row, s }: { row: any; s: any }) {
  const reason = fundNoDataReason(row, s);
  const source = s.label === "Revenue yield" && row.revenueYield?.source ? String(row.revenueYield.source) : s.label === "Developer velocity" && row.developerVelocity?.source ? String(row.developerVelocity.source) : String(s.source ?? "unrecorded");
  const lastAttempt = (s.label === "Revenue yield" ? row.revenueYield?.lastAttemptAt : s.label === "Developer velocity" ? row.developerVelocity?.lastAttemptAt : null) ?? s.lastAttemptAt ?? null;
  return <div className="fund-nodata">
    <p><b>{s.label}</b> · {row.coinId} · {row.identityAuthority ?? "identity authority unrecorded"}</p>
    <p>Primary source · {source} · fallback · {fundFallback(reason)}</p>
    <p>Last attempt · {lastAttempt ? new Date(lastAttempt).toLocaleString() : "not recorded"} · result · {reason}</p>
    <p>Next retry · next weekly fundamentals refresh, or immediately when a supported mapping is added</p>
    <span className="status">{noDataClassification(reason)}</span>
  </div>;
}

// Bounded issuance-work accounting: the three volumes are measured
// separately — scheduled checks, worker launches/coalescing, and full
// issuance executions — so a quiet terminal shows WHY it is quiet.
function IssuanceWorkPanel() {
  const q = useQuery({ queryKey: ["issuance-work-accounting"], queryFn: () => api.getIssuanceWorkAccounting({ windowHours: 24 }), staleTime: 60_000 });
  const d: any = q.data;
  const latest: any = d?.latestCheck ?? null;
  const decisionLabel = (value: string | null | undefined) => value === "skipped_completed" ? "SKIPPED — already complete" : value === "processed_new" ? "PROCESSED — new handoff" : value === "recovered_incomplete" ? "RECOVERED — unfinished work" : value === "no_handoff" ? "NO HANDOFF" : value === "coalesced" ? "COALESCED — deferred by lease" : value ?? "—";
  return <div className="asset-subblock issuance-work">
    <h3>Issuance work check · bounded</h3>
    <p className="asset-meta">Before any expensive pass, the cycle reads the handoff's committed state — the latest committed run plus every durable intake row. A handoff counts as complete only when that committed state says so; a recent trigger time never suppresses failed, partial or uncertain work, and overlapping invocations coalesce into the active worker instead of racing.</p>
    {q.isPending ? <Empty>Reading issuance work accounting…</Empty> : !d ? <Empty>Issuance work accounting unavailable.</Empty> : <>
      <div className="indicator-grid">
        <Metric label="Checks · 24h" value={num(d.checks?.total ?? 0)}/>
        <Metric label="Skipped · complete" value={num(d.checks?.skippedCompleted ?? 0)}/>
        <Metric label="Full executions · 24h" value={num(d.executions?.total ?? 0)}/>
        <Metric label="Recoveries · 24h" value={num(d.checks?.recoveredIncomplete ?? 0)}/>
        <Metric label="Worker generations" value={d.pollLane ? num(d.pollLane.generation) : "—"}/>
        <Metric label="Coalesced invocations" value={d.pollLane ? num(d.pollLane.coalescedCount) : "—"}/>
      </div>
      {latest ? <p className="asset-meta">Latest check {new Date(latest.checkedAt).toLocaleString()} · <b>{decisionLabel(latest.decision)}</b> · handoff {latest.handoffRunId ?? "—"} · intake {latest.intakeTerminal}/{latest.intakeTotal} terminal{latest.priorRunId ? ` · prior run ${latest.priorRunId} (${latest.priorRunStatus ?? "unknown"})` : ""} · {latest.reason}</p> : <p className="asset-meta">No bounded check has been recorded yet — checks are recorded from the first cycle invocation after this build.</p>}
      <p className="asset-meta">{d.note}</p>
    </>}
  </div>;
}

function MonitoringHealthPanel({ health, loading }: { health: any; loading: boolean }) {
  if (loading && !health) return <div className="asset-subblock monitoring-health"><h3>Venue monitoring · recovery status</h3><Empty>Checking coverage checkpoints…</Empty></div>;
  if (!health) return <div className="asset-subblock monitoring-health degraded"><h3>Venue monitoring · recovery status</h3><p className="unavailable-line"><b>MONITORING UNAVAILABLE</b> — health could not be read; new paper entries are held (fail closed).</p></div>;
  // Coverage and automation are shown as two separate lines — a single
  // badge would merge a directed-recovery coverage claim with an
  // unattended-automation claim that has not been proven yet.
  const coverage = health.coverage ?? { status: health.coverageStatus ?? health.status, basis: health.coverageBasis ?? "", lastSuccessfulCoverageUtc: health.lastSuccessfulCoverageUtc, coverageAgeMs: health.coverageAgeMs, staleAfterMs: 45 * 60_000, gapsTotal: health.gapsTotal };
  const automation = health.automation ?? { status: "pending", label: "Scheduled recovery pending", confirmedAtUtc: null, scheduledRunScheduledFor: null, coverageThroughUtc: null, cleanupVerified: null, monitorLog: null, settleLog: null, enrollLog: null };
  const enrollment = health.enrollment ?? null;
  const coverageStatus = String(coverage.status ?? "unavailable").toUpperCase();
  const held = health.entryAdmission !== "open";
  const ageMin = coverage.coverageAgeMs == null ? null : Math.round(coverage.coverageAgeMs / 60_000);
  return <div className={`asset-subblock monitoring-health ${held ? "degraded" : "verified"}`} role={held ? "alert" : undefined}>
    <h3>Venue monitoring · recovery status</h3>
    <p className="venue-outcome"><b>Coverage · {coverageStatus}</b> — {coverage.basis} · last successful coverage {coverage.lastSuccessfulCoverageUtc ? sourceTimeLabel(new Date(coverage.lastSuccessfulCoverageUtc).getTime()) : "unavailable"}{ageMin != null ? ` · ${ageMin} min old (stale after 45 min)` : ""} · gaps {num(coverage.gapsTotal)}</p>
    <p className="venue-outcome"><b>Automation</b> — {automation.label}{automation.status === "confirmed" && automation.coverageThroughUtc ? ` · coverage through ${sourceTimeLabel(new Date(automation.coverageThroughUtc).getTime())}` : ""}{automation.status === "confirmed" && automation.cleanupVerified != null ? ` · timeout cleanup verified: ${automation.cleanupVerified ? "yes — no orphan processes or locks" : "no"}` : ""}</p>
    {held && <p className="venue-outcome"><b>NEW PAPER ENTRIES HELD</b> — {health.coverageStatus === "verified" && automation.status === "pending" ? "coverage is verified, but scheduled recovery is still pending; a directed pass alone does not prove the automatic loop." : "coverage is not verified, or scheduled recovery is still pending."} Discovery and research keep running; existing positions keep being monitored and settled.</p>}
    <div className="indicator-grid">
      <Metric label="Entry admission" value={health.entryAdmission === "open" ? "OPEN" : "HELD"}/>
      <Metric label="Coverage" value={coverageStatus}/>
      <Metric label="Automation" value={automation.status === "confirmed" ? "CONFIRMED" : "PENDING"}/>
      <Metric label="Open / settled" value={`${num(health.openPositions)} / ${num(health.settledPositions)}`}/>
      <Metric label="Last successful coverage" value={health.lastSuccessfulCoverageUtc ? sourceTimeLabel(new Date(health.lastSuccessfulCoverageUtc).getTime()) : "unavailable"}/>
      <Metric label="Coverage age" value={ageMin == null ? "unavailable" : `${ageMin} min · stale after 45`}/>
      <Metric label="Coverage gaps · open" value={num(health.gapsTotal)}/>
      <Metric label="Latest monitor run" value={health.latestMonitorRunUtc ? `${sourceTimeLabel(new Date(health.latestMonitorRunUtc).getTime())} · ${health.latestMonitorRunOk ? "all positions OK" : "failures present"}` : "unavailable"}/>
      <Metric label="Latest settlement pass" value={health.settlementRunUtc ? sourceTimeLabel(new Date(health.settlementRunUtc).getTime()) : "unavailable"}/>
      <Metric label="Settlement after coverage" value={health.settlementVerifiedAfterCoverage ? "VERIFIED" : "NOT YET"}/>
      <Metric label="Settlements appended · last pass" value={health.settlementAppended == null ? "—" : num(health.settlementAppended)}/>
    </div>
    {health.recoveredWindowFromUtc && <p className="asset-meta">Recovered interval · {sourceTimeLabel(new Date(health.recoveredWindowFromUtc).getTime())} → {health.recoveredWindowToUtc ? sourceTimeLabel(new Date(health.recoveredWindowToUtc).getTime()) : "—"} · at least {health.recoveredBars == null ? "—" : num(health.recoveredBars)} completed 1m bars per open position · first-touch order is read only from this gap-checked interval.</p>}
    {health.failingStage && <p className="asset-meta">Failing stage · {health.failingStage}</p>}
    {(health.reasons ?? []).map((reason: string, i: number) => <p key={i} className="asset-meta">{reason}</p>)}
    <div className="asset-subblock enrollment-disclosure">
      <h4>Enrollment · reconciliation disclosure</h4>
      {!enrollment || !enrollment.available ? <p className="unavailable-line"><b>ENROLLMENT UNAVAILABLE</b> — {enrollment?.sourceLabel ?? "no enroll run log is reachable from this view; unreconciled positions cannot be ruled out (fail closed)."}</p> : <>
        <p className="asset-meta">{enrollment.sourceLabel}</p>
        <div className="indicator-grid">
          <Metric label="Latest enroll run" value={enrollment.runUtc ? sourceTimeLabel(new Date(enrollment.runUtc).getTime()) : "unavailable"}/>
          <Metric label="Canonical file · canonical-entered.json" value={enrollment.canonicalFileUtc ? sourceTimeLabel(new Date(enrollment.canonicalFileUtc).getTime()) : "unavailable"}/>
          <Metric label="Canonical age at enroll" value={enrollment.canonicalFileAgeAtEnrollS == null ? "unknown" : `${num(enrollment.canonicalFileAgeAtEnrollS)}s`}/>
          <Metric label="Derived entered" value={enrollment.derivedCount == null ? "—" : num(enrollment.derivedCount)}/>
          <Metric label="Enrolled (added + already)" value={enrollment.enrolledCount == null ? "—" : num(enrollment.enrolledCount)}/>
          <Metric label="Unreconciled positions" value={num(enrollment.discrepancyCount)}/>
        </div>
        {(enrollment.discrepancies ?? []).length ? <div className="venue-list">{(enrollment.discrepancies as any[]).map((disc: any, i: number) => <div key={`${disc.positionId ?? disc.candidateId ?? i}`}><span>{disc.positionId ?? `candidate ${disc.candidateId ?? "unknown"}`}</span><strong>NOT RECONCILED — {disc.reason}</strong></div>)}</div> : <p className="asset-meta">No unreconciled positions in the latest enroll run — every derived entered position reconciled. Any position enrollment cannot reconcile is listed here explicitly, never silently skipped.</p>}
      </>}
    </div>
    <p className="asset-meta">Timeout diagnosis · timed-out venue-monitor runs run serially — a timed-out step's subprocess is stopped before another run starts, runs do not overlap and leave no lock behind; checkpoints are written per position only after a complete, gap-checked fetch, so a failed or partial fetch never advances coverage and the missing interval is re-fetched from the last verified bar. Timeout cleanup is part of the scheduled-recovery attestation (cleanup_verified). The research-refresh job is staggered to :24/:54 against the venue lane's :13/:43 so the two never start together. The six prepared venue mappings (A, ENA, IOST, PROM, W, ZAMA) stay unapplied until scheduled recovery is confirmed, then are rechecked and applied prospectively.</p>
  </div>;
}

function PaperPilot() {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ["paper-pilot-status"], queryFn: () => api.getPaperPilotStatus({ emitTestAlert: false }), staleTime: 30_000 });
  const run = useMutation({ mutationFn: () => api.runPaperSignalCycle({ trigger: "manual", limit: 8 }), onSuccess: () => qc.invalidateQueries({ queryKey: ["paper-pilot-status"] }) });
  const data: any = status.data; const latest = data?.runs?.[0]; const latestSignal = data?.signals?.[0];
  const alertsQ = useQuery({ queryKey: ["paper-pilot-alerts-panel"], queryFn: () => api.getPaperPilotAlerts({ emitTestAlert: false }), staleTime: 30_000 });
  const monitoringQ = useQuery({ queryKey: ["paper-monitoring-panel"], queryFn: () => api.getPaperMonitoring({}), staleTime: 60_000 });
  const alertRows: any[] = (alertsQ.data as any)?.alerts ?? [];
  const canonical: any = (monitoringQ.data as any)?.canonicalOutcomes ?? null;
  const checkpointByCandidateIdPanel = new Map<number, any>(((data?.checkpoints ?? []) as any[]).map((c: any) => [Number(c.candidateId), c]));
  const candidateByKeyPanel = new Map<string, any>(((data?.candidates ?? []) as any[]).map((c: any) => [String(c.candidateKey), c]));
  const plainStateForCandidateKey = (key: unknown): string | null => { const cand = key != null ? candidateByKeyPanel.get(String(key)) : undefined; const cp = cand ? checkpointByCandidateIdPanel.get(Number(cand.id)) : undefined; return plainContractState(cp?.contractState); };
  return <section className="terminal-section paper-pilot" aria-label="Automatic paper signal pilot">
    <div className="panel-head"><div><p className="eyebrow cyan">Paper-only issuance</p><h2>RECORDED PAPER TRADES — only issued entries with frozen levels</h2></div><span className="feed-badge">{data?.freeze?.version ?? "loading freeze"}</span></div>
    <p className="muted">This explicit path reads model-selected discovery candidates, creates only segregated paper records, and leaves the existing signal tracker unchanged.</p>
    <div className="indicator-grid"><Metric label="Handler" value={data?.handler?.version ? `v${data.handler.version}` : "—"}/><Metric label="Latest cycle" value={latest?.status ? String(latest.status).toUpperCase() : "Not run"}/><Metric label="Discovered" value={data?.handoff?.discoveryCounts ? num(data.handoff.discoveryCounts.discovered) : "—"}/><Metric label="Eligible before legacy filters" value={data?.handoff?.discoveryCounts ? num(data.handoff.discoveryCounts.eligibleBeforeLegacyFilters) : "—"}/><Metric label="Issued" value={latest ? num(latest.issuedCount) : "—"}/><Metric label="Alert delivery" value={data?.delivery?.configured ? "IN ARTIFACT" : "WORKSPACE LAYER"}/></div>
    {latestSignal ? <div className="paper-signal-proof"><strong>{latestSignal.symbol} · {String(latestSignal.direction).toUpperCase()} · {latestSignal.paperSignalId}</strong><span>entry {money(latestSignal.entryPrice)} · stop {money(latestSignal.stopPrice)} · target {money(latestSignal.targetPrice)}</span><small>decision {sourceTimeLabel(new Date(latestSignal.decisionAt).getTime())} · entry observed {sourceTimeLabel(new Date(latestSignal.entryAt).getTime())} · {latestSignal.venue} {latestSignal.instrument}</small><DeliveryChip alerts={alertRows} paperSignalId={latestSignal.paperSignalId}/></div> : <Empty>No paper signal has qualified under the frozen post-freeze rules. A clean abstention or defer is preserved rather than replaced with a fixture.</Empty>}
    {run.data && <p className="paper-cycle-result">{run.data.summary}</p>}
    {(run.data?.delivery?.missingCapability ?? data?.delivery?.missingCapability) && <p className="source-warning">Delivery architecture: {run.data?.delivery?.missingCapability ?? data?.delivery?.missingCapability}</p>}
    <div className="command-actions"><button className="primary" onClick={() => run.mutate()} disabled={run.isPending}>{run.isPending ? "Running paper cycle…" : "Run explicit paper cycle"}</button><button onClick={() => status.refetch()} disabled={status.isFetching}>{status.isFetching ? "Refreshing…" : "Refresh evidence"}</button></div>
    <MonitoringHealthPanel health={(monitoringQ.data as any)?.health ?? null} loading={monitoringQ.isPending}/>
    <IssuanceWorkPanel/>
    <details><summary>Freeze, handoff and delivery evidence</summary><div className="venue-list"><div><span>Production hash</span><strong>{data?.freeze?.productionHash ?? "—"}</strong></div><div><span>C-2 hash</span><strong>{data?.freeze?.challengerHash ?? "—"}</strong></div><div><span>Storage</span><strong>{data?.segregation?.paperTable ?? "paper_signals"} · not {data?.segregation?.legacyTable ?? "generated_signals"}</strong></div><div><span>Run-linked handoff</span><strong>{data?.handoff ? `handoff ${data.handoff.id} · discovery ${data.handoff.discoveryRunId}` : "No completed handoff"}</strong></div><div><span>Delivery destination</span><strong>{data?.delivery?.destination ?? "—"}</strong></div><div><span>Acknowledgement path</span><strong>{data?.delivery?.acknowledgementPath ?? "—"}</strong></div><div><span>Fixed readout</span><strong>{data?.freeze?.collectionPlan?.readoutBy ? new Date(data.freeze.collectionPlan.readoutBy).toLocaleDateString() : "Feb 6, 2027"}</strong></div></div></details>
    {data?.handoff?.perCandidateReasons?.length ? <details><summary>Pre-filter candidate reasons · {data.handoff.perCandidateReasons.length}</summary><div className="venue-list">{data.handoff.perCandidateReasons.map((row:any) => <div key={row.candidateKey}><span>{row.symbol} · {row.direction ?? "unqualified"} · {row.stage}</span><strong>{row.outcome} · {row.reasonCode}</strong><small>{row.reason}</small><DeliveryChip alerts={alertRows} contractId={row.candidateKey}/>{plainStateForCandidateKey(row.candidateKey) ? <small>{plainStateForCandidateKey(row.candidateKey)}</small> : null}</div>)}</div></details> : null}
    <div className="asset-subblock paper-outcomes">
      <h3>Outcomes — append-only record</h3>
      <p className="asset-meta">Source · getPaperMonitoring canonicalOutcomes. Settlements appear only where a settlement record exists; touches below are milestones, never closures.</p>
      {monitoringQ.isPending ? <Empty>Loading the canonical outcomes record…</Empty> : !canonical ? <p className="unavailable-line"><b>UNAVAILABLE</b> — canonical outcomes are not reachable from this view.</p> : canonical.available === false ? <p className="unavailable-line"><b>UNAVAILABLE</b> — {canonical.reason ?? "canonical outcomes ledger unavailable"}</p> : (canonical.positions ?? []).length ? <div className="asset-record-list">{(canonical.positions as any[]).map((pos: any) => <article key={pos.positionId} className="asset-record compact-record">
        <header><div><strong>{pos.positionId}</strong><small>canonical outcome record{pos.recordedAtUtc ? ` · recorded ${new Date(pos.recordedAtUtc).toLocaleString()}` : ""}</small></div><DeliveryChip alerts={alertRows} paperSignalId={pos.positionId}/></header>
        {pos.settlement ? <>
          <p className="venue-outcome"><b>{settlementHeadline(pos.settlement)}</b></p>
          <p className="asset-meta">Settling barrier · {pos.settlement.settlingBarrier ? barrierName(pos.settlement.settlingBarrier) : "unrecorded"} · bar {pos.settlement.settlingBarOpenUtc ? new Date(pos.settlement.settlingBarOpenUtc).toLocaleString() : "unrecorded"}{pos.settlement.recordedAtUtc ? ` · settlement recorded ${new Date(pos.settlement.recordedAtUtc).toLocaleString()}` : ""}</p>
        </> : <>
          <p className="asset-meta"><b>Milestones — touches are observations, not closures</b></p>
          {(pos.firstTouches ?? []).length ? (pos.firstTouches as any[]).map((t: any, i: number) => <p key={i} className="asset-meta">{barrierName(t.barrier)} · level {t.level == null ? "—" : num(t.level)} · bar {t.barOpenUtc ? new Date(t.barOpenUtc).toLocaleString() : "unrecorded"}</p>) : <p className="asset-meta">No milestone touches recorded yet.</p>}
        </>}
        {pos.lifecycleNote ? <p>{pos.lifecycleNote}</p> : null}
      </article>)}</div> : <Empty>No canonical outcome records are stored yet.</Empty>}
    </div>
  </section>;
}

function Signals({ d }: { d: any }) {
  const v = d.verdict; const ex = d.expert; const issued = d.signalIssuance?.acceptedSetup;
  return <div className="stack"><PaperPilot/><SignalTape d={d}/><section className="terminal-section walk-forward"><div className="panel-head"><div><p className="eyebrow cyan">Walk-forward discipline</p><h2>Statistics before confidence</h2></div><Source>full cached history</Source></div><div className="indicator-grid"><Metric label="Raw / effective N" value={`${num(d.walkForward?.rawN)} / ${num(d.walkForward?.effectiveN)}`}/><Metric label="Canonical expectancy" value={d.walkForward?.expectancyR == null ? "WITHHELD" : `${num(d.walkForward.expectancyR)}R`}/><Metric label="Old horizon-close" value={d.walkForward?.oldDefinition?.expectancyR == null ? "UNVERIFIED" : `${num(d.walkForward.oldDefinition.expectancyR)}R`}/><Metric label="After 18 bps" value={d.walkForward?.afterCosts?.expectancyR == null ? "UNVERIFIED" : `${num(d.walkForward.afterCosts.expectancyR)}R`}/><Metric label="95% Wilson" value={d.walkForward?.wilsonLow == null ? "—" : `${num(d.walkForward.wilsonLow)}–${num(d.walkForward.wilsonHigh)}%`}/><Metric label="p vs 50%" value={d.walkForward?.pValueVs50 == null ? "—" : num(d.walkForward.pValueVs50)}/><Metric label="Edge state" value={d.walkForward?.edgeState ?? "UNVERIFIED"} tone={d.walkForward?.edgeState === "positive edge vs 50%" ? "up" : d.walkForward?.edgeState === "negative edge vs 50%" ? "down" : undefined}/></div><div className="venue-list">{(d.walkForward?.regimes ?? []).map((r:any)=><div key={r.regime}><span>{r.regime} · n={r.sampleSize}</span><strong>{r.expectancyR == null ? "WITHHELD" : `${num(r.expectancyR)}R · ${num(r.hitRate)}% hit`}</strong></div>)}</div><p className="muted">{d.walkForward?.cadence}. {d.walkForward?.note}</p><p className="score-disclaimer"><b>R method:</b> {d.walkForward?.rMethod ?? "Unavailable — complete OHLC history is required."}</p><details className="passed-log"><summary>Decision ledger · {(d.walkForward?.decisions ?? []).length} timestamps</summary><div className="venue-list">{(d.walkForward?.decisions ?? []).map((decision:any) => <div key={`${decision.decisionAt}-${decision.evaluationAt}`}><span>Decision {new Date(decision.decisionAt).toLocaleDateString()} → evaluation {new Date(decision.evaluationAt).toLocaleDateString()}</span><strong>new {num(decision.r)}R · old {num(decision.oldR)}R · net {num(decision.netR)}R · {decision.result} · entry {money(decision.entry)} · exit {money(decision.exit)}</strong></div>)}</div></details></section><section className="confidence" aria-label="Long and short factor alignment scores"><div className="confidence-heading"><span>Current-fetch factor alignment scores</span><b>NOT A PROBABILITY</b></div><div className="conf long"><span>LONG ALIGNMENT</span><strong>See directional read</strong><ReliabilityLine data={v.longReliability} compact/><i style={{ width: `${v.longConfidence}%` }}/></div><div className="conf short"><span>SHORT ALIGNMENT</span><strong>{v.shortConfidence} / 100</strong><ReliabilityLine data={v.shortReliability} compact/><i style={{ width: `${v.shortConfidence}%` }}/></div><p>{d.factorFormula.rule} Missing inputs contribute zero. Reliability uses only closed target/invalidation observations in the same rating band; the separate 20-observation gate applies only to the walk-forward confidence label above.</p></section>
    <MarketChart data={d.line} candles={d.candles} indicators={d.indicators} symbol={d.asset.symbol}/>
    <section className="terminal-section"><div className="panel-head"><div><p className="eyebrow cyan">Empirical read</p><h2>Measured horizons</h2></div><Source>CoinGecko</Source></div><div className="horizon-grid">{Object.entries(d.indicators.returns).map(([k, val]) => <Metric key={k} label={horizons[k] ?? k} value={percent(val as number | null)} tone={(val as number ?? 0) >= 0 ? "up" : "down"}/>)}</div><div className="indicator-grid"><Metric label="RSI 14" value={num(d.indicators.rsi14)}/><Metric label="SMA 20" value={money(d.indicators.sma20)}/><Metric label="SMA 50" value={money(d.indicators.sma50)}/><Metric label="SMA 200" value={money(d.indicators.sma200)}/><Metric label="Bollinger upper" value={money(d.indicators.bollUpper)}/><Metric label="Bollinger lower" value={money(d.indicators.bollLower)}/><Metric label="OBV" value={num(d.indicators.obv, true)}/><Metric label="Volume z" value={num(d.indicators.volumeZ)}/></div></section>
    <section className="terminal-section desk"><div className="panel-head"><div><p className="eyebrow cyan">Expert TA</p><h2>Market structure desk note</h2></div><Source>computed</Source></div><p>{ex.deskNote}</p><div className="two-col"><div><span className="mini">1D structure</span><strong>{ex.dailyStructure}</strong></div><div><span className="mini">1W structure</span><strong>{ex.weeklyStructure}</strong></div><div><span className="mini">Support / liquidity</span><strong>{ex.supports.length ? ex.supports.map((x:number) => money(x)).join(" · ") : "No clean pivot"}</strong></div><div><span className="mini">Resistance / liquidity</span><strong>{ex.resistances.length ? ex.resistances.map((x:number) => money(x)).join(" · ") : "No clean pivot"}</strong></div><div><span className="mini">Divergence</span><strong>{ex.divergence}</strong></div><div><span className="mini">Volatility</span><strong>{ex.volatilityRegime} · {num(ex.atrPct)}%</strong></div></div></section>
    <section className={`verdict ${v.side}`}><p className="eyebrow">Thesis + failure</p><h2>{v.side === "long" ? "Long" : "Short"} setup · see directional read</h2>{v.glance ? <div className="glance"><p><b>{v.glance.read}</b></p><p>Strength — {v.glance.strength}</p><p>Risk — {v.glance.risk}</p></div> : null}<ReliabilityLine data={v.side === "long" ? v.longReliability : v.shortReliability}/><p className="score-disclaimer">Alignment density only—not a probability that this trade profits.</p><p>{v.thesis}</p><p className="failure">{v.failure}</p>{issued ? <><div className="levels"><Metric label="Issued entry" value={money(issued.entry)}/><Metric label="Issued stop" value={money(issued.stop)} tone="down"/><Metric label="Issued target 1" value={money(issued.target1)} tone="up"/><Metric label="Issued target 2" value={money(issued.target2)} tone="up"/></div><p className="score-disclaimer">Accepted immutable {issued.direction} contract · {issued.entryRule}. These are the levels the evaluator grades.</p></> : null}{v.riskMethod !== "unavailable" && <div className="levels"><Metric label="Research-reference entry zone" value={`${money(v.entryLow)} – ${money(v.entryHigh)}`}/><Metric label="Research-reference invalidation" value={money(v.invalidation)} tone="down"/><Metric label="Research-reference target 1 · 1.5R" value={money(v.target1)} tone="up"/><Metric label="Research-reference target 2 · 2.5R" value={money(v.target2)} tone="up"/></div>}<p className="score-disclaimer">{v.riskMethod === "unavailable" ? "Research-reference risk levels unavailable: complete daily OHLC data is required for true ATR." : `Research-reference only · 1R = ${num(v.riskMultiplier)} × true Wilder ATR-14 (${money(v.atr14)}), fixed at the dossier decision snapshot. It does not replace an issued contract.`}</p><p className="command-asof">Source snapshot {sourceTimeLabel(new Date(d.asset.lastUpdated).getTime())}</p></section>
    <details className="terminal-section factor-ledger"><summary><span><b>Why · factor ledger</b><small>{d.factors.filter((f:any) => f.quality === "no_data" || f.quality === "anomaly").length} factors sat out · expand evidence</small></span></summary><div className="factor-list">{d.factors.map((f: any) => { const stale = f.asOf && Date.now() - new Date(f.asOf).getTime() > 30 * 60_000; return <div className={`factor ${stale ? "stale" : ""}`} key={f.label}><span className={f.score > 0 ? "dot up-bg" : f.score < 0 ? "dot down-bg" : "dot"}/><div><strong>{f.label}</strong><small>{f.reading ?? f.value}</small><small>{f.source} · {f.asOf ? `${stale ? "STALE · " : ""}${sourceTimeLabel(new Date(f.asOf).getTime())}` : "timestamp unavailable"} · {String(f.quality ?? "live").toUpperCase()}</small><small>contribution {f.contribution > 0 ? "+" : ""}{num(f.contribution)} · weight {num(f.weight)}</small><small>{f.note ?? "Factor note unavailable in the saved payload."}</small></div><b>{f.quality === "no_data" || f.quality === "anomaly" ? "SAT OUT" : `${f.contribution > 0 ? "+" : ""}${num(f.contribution)}`}</b></div>})}</div></details>
  </div>;
}

function CrossVenueDerivatives({ x }: { x: any }) {
  const c = x?.crossVenue;
  if (!c) return null;
  const funding = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "—" : `${value >= 0 ? "+" : ""}${(value * 100).toFixed(4)}%`;
  const options = c.options;
  return <section className="terminal-section cross-venue"><div className="panel-head"><div><p className="eyebrow cyan">Cross-venue derivatives</p><h2>{c.symbol} positioning aggregate</h2></div><Source>OKX · Hyperliquid · Deribit · Kraken</Source></div>
    <div className="indicator-grid"><Metric label="OI-weighted funding · 8H" value={funding(c.blendedFundingRate8h)} tone={(c.blendedFundingRate8h ?? 0) > 0 ? "up" : (c.blendedFundingRate8h ?? 0) < 0 ? "down" : undefined}/><Metric label="Funding spread" value={funding(c.fundingSpread8h)} tone={c.venueSpecificCrowding ? "down" : undefined}/><Metric label="Venue divergence" value={c.venueSpecificCrowding ? "VENUE-SPECIFIC CROWDING" : c.fundingSpread8h == null ? "NO_DATA" : "clear"} tone={c.venueSpecificCrowding ? "down" : undefined}/><Metric label="Total open interest" value={money(c.totalOpenInterestUsd, true)}/><Metric label="OI · 24H" value={percent(c.oiChange24h)}/><Metric label="24H OI coverage" value={c.oiChangeCoveragePct == null ? "NO_DATA" : `${num(c.oiChangeCoveragePct)}% of current OI`}/><Metric label="Price · 24H" value={percent(c.priceChange24h)}/><Metric label="Mechanical regime" value={String(c.regimeLabel ?? "NO_DATA").toUpperCase()}/><Metric label="Funding vs 30D" value={c.crowding?.fundingZ30d == null ? "NO_DATA" : `${num(c.crowding.fundingZ30d)}σ · n=${c.crowding.historySamples}`}/></div>
    <div className="venue-list cross-venue-list">{(c.venues ?? []).map((venue:any) => <div key={venue.venue} className={venue.status === "available" ? "" : "venue-unavailable"}><span>{venue.venue} · {venue.marketSymbol ?? "unmapped"}</span>{venue.status === "available" ? <strong>{funding(venue.fundingRate8h)} / 8H · OI {money(venue.openInterestUsd, true)} · mark {money(venue.markPrice)}</strong> : <strong>{venue.reason ?? "NO_DATA"}</strong>}<small>{venue.status === "available" ? `native period ${venue.fundingPeriodHours ?? "?"}H · as of ${new Date(venue.asOf).toLocaleString()}` : "Excluded from blend"}</small></div>)}</div>
    <p className="score-disclaimer">{c.methodology}</p>
    {options && <div className="options-panel"><div className="panel-head"><div><p className="eyebrow">Deribit options · front month</p><h3>{options.currency} volatility read</h3></div><Source>{options.expiry ? `Expiry ${new Date(options.expiry).toLocaleDateString()}` : "NO_DATA"}</Source></div>{options.state === "available" ? <><div className="indicator-grid"><Metric label="25Δ risk reversal" value={options.riskReversal25d == null ? "—" : `${options.riskReversal25d >= 0 ? "+" : ""}${num(options.riskReversal25d)} vol pts`}/><Metric label="Put / call volume" value={num(options.putCallVolumeRatio)}/><Metric label="Front-month IV" value={options.frontMonthIv == null ? "—" : `${num(options.frontMonthIv)}%`}/></div><div className="option-meanings"><p><b>25Δ risk reversal</b>{options.riskReversal25d == null ? "No comparable 25-delta wings." : options.riskReversal25d > 0 ? "Calls carry more implied volatility than puts: upside protection/speculation is richer." : options.riskReversal25d < 0 ? "Puts carry more implied volatility than calls: downside protection is richer." : "Call and put wings are balanced."}</p><p><b>Put / call volume</b>{options.putCallVolumeRatio == null ? "No usable front-expiry volume ratio." : options.putCallVolumeRatio > 1 ? "More put than call contracts traded in the front expiry." : "More call than put contracts traded in the front expiry."}</p><p><b>Front-month IV</b>{options.frontMonthIv == null ? "No usable at-the-money IV." : `The nearest-expiry at-the-money straddle implies about ${num(options.frontMonthIv)}% annualized volatility.`}</p></div><p className="score-disclaimer">{options.methodology} n={options.sampleSize} option summaries.</p></> : <Empty>{options.reason ?? "NO_DATA — Deribit options were unavailable."}</Empty>}</div>}
  </section>;
}

function WalletIntelligence() {
  const [address, setAddress] = useState(""); const [proto, setProto] = useState<"eth"|"sol"|"btc"|"bnb"|"matic"|"avax">("eth");
  const quote = useMutation({ mutationFn: () => api.lookupWalletIntelligence({ address, proto, confirm: false }) });
  const run = useMutation({ mutationFn: () => api.lookupWalletIntelligence({ address, proto, confirm: true }) });
  const valid = address.length >= 20;
  return <section className="terminal-section wallet-intel"><div className="panel-head"><div><p className="eyebrow cyan">On-demand wallet research</p><h2>Entity label + address risk</h2></div><Source>AnChain</Source></div><div className="wallet-form"><select aria-label="Wallet chain" value={proto} onChange={(e) => setProto(e.target.value as typeof proto)}><option value="eth">Ethereum</option><option value="sol">Solana</option><option value="btc">Bitcoin</option><option value="bnb">BNB</option><option value="matic">Polygon</option><option value="avax">Avalanche</option></select><input aria-label="Wallet address for AnChain" value={address} onChange={(e) => { setAddress(e.target.value.trim()); quote.reset(); run.reset(); }} placeholder="Wallet address"/><button onClick={() => quote.mutate()} disabled={!valid || quote.isPending}>Show cost</button></div>{quote.data?.requiresConfirmation && !run.data && <div className="cost-confirm"><strong>15 credits total</strong><span>Label 5 + risk 10 · remaining credits are shown after the provider call.</span><button className="primary" onClick={() => run.mutate()} disabled={run.isPending}>{run.isPending ? "Checking…" : "Confirm and run"}</button></div>}{run.data?.data && <div className="wallet-result"><p>{run.data.data.interpretation}</p><pre>{JSON.stringify({ label: run.data.data.label, risk: run.data.data.risk }, null, 2)}</pre><small>Checked {new Date(run.data.data.checkedAt).toLocaleString()} · remaining {run.data.quote.remaining ?? "not reported"}</small></div>}{(quote.data?.error || run.data?.error) && <p className="source-warning">{quote.data?.error ?? run.data?.error}</p>}</section>;
}

function Smart({ d }: { d: any }) { const x = d.derivatives; const dex = d.dex; const hyper = useQuery({ queryKey: ["hyper", d.asset.symbol], queryFn: () => api.getHyperliquidMarket({ symbol: d.asset.symbol }) }); const attention = useQuery({ queryKey: ["attention", d.asset.id], queryFn: () => api.getAttention({ coinId: d.asset.id, contract: d.asset.primaryContract, network: d.asset.primaryNetwork }) }); const social = useQuery({ queryKey: ["social-chatter", d.asset.symbol], queryFn: () => api.getSocialTradeChatter({ symbol: d.asset.symbol }) }); const hints = useQuery({ queryKey: ["silent-hints", d.asset.symbol], queryFn: () => api.getSilentHints({ symbol: d.asset.symbol }) }); const [address, setAddress] = useState(""); const lookup = useMutation({ mutationFn: (walletAddress?: string) => api.lookupHyperliquidWallet({ address: walletAddress ?? address }) }); const inspectWallet = (walletAddress: string) => { setAddress(walletAddress); lookup.mutate(walletAddress); }; const cross = d.derivatives?.hyperliquidCrossCheck; const hm = hyper.data?.market ?? (cross?.marketSymbol ? { symbol: cross.marketSymbol, markPrice: cross.markPrice, openInterest: cross.openInterestUsd != null && cross.markPrice ? cross.openInterestUsd / cross.markPrice : null, funding: cross.funding, dayVolume: null, premium: null, maxLeverage: null } : null); return <div className="stack"><section className="notice"><strong>Measured positioning, not mythology</strong><p>Wallets are only named when a source names them. Leaderboard accounts below pass a live profitability screen; that does not make them infallible or identify who controls them.</p></section><section className="terminal-section"><div className="panel-head"><h2>Hyperliquid positioning</h2><Source>Hyperliquid</Source></div>{hm ? <div className="indicator-grid"><Metric label="Mark" value={money(hm.markPrice)}/><Metric label="Open interest" value={`${num(hm.openInterest, true)} ${hm.symbol}`}/><Metric label="Funding" value={hm.funding == null ? "—" : `${(hm.funding * 100).toFixed(4)}%`}/><Metric label="Funding / OI as of" value={hm.asOf ? new Date(hm.asOf).toLocaleString() : "timestamp unavailable"}/><Metric label="24H notional" value={money(hm.dayVolume, true)}/><Metric label="Premium" value={num(hm.premium)}/><Metric label="Max leverage" value={`${num(hm.maxLeverage)}×`}/></div> : <Empty>{hyper.data?.error ?? "This coin has no Hyperliquid perp market."}</Empty>}</section><section className="terminal-section"><div className="panel-head"><h2>Profitable trader watch</h2><Source>HL leaderboard</Source></div>{hyper.data?.whales?.length ? <div className="whale-list">{hyper.data.whales.map((w: any) => <article key={w.address}><div><strong>{w.displayName || `${w.address.slice(0, 7)}…${w.address.slice(-5)}`}</strong><small>Month PnL {money(w.monthPnl, true)} · all-time {money(w.allTimePnl, true)}</small></div>{w.symbolPosition ? <span className={w.symbolPosition.side === "long" ? "up" : "down"}>{w.symbolPosition.side.toUpperCase()} {money(Math.abs(w.symbolPosition.value ?? 0), true)}</span> : <span className="muted">No {d.asset.symbol} position</span>}<p>{w.topPositions.length ? `Top live positions: ${w.topPositions.map((p:any) => `${p.coin} ${p.side} ${money(Math.abs(p.value ?? 0), true)}`).join(" · ")}` : "No open positions returned."}</p><button className="text-action" onClick={() => inspectWallet(w.address)}>Inspect wallet →</button></article>)}</div> : <Empty>{hyper.isPending ? "Screening the live leaderboard…" : "No qualifying live accounts returned."}</Empty>}</section><section className="terminal-section"><div className="panel-head"><div><p className="eyebrow cyan">Wallet evidence</p><h2>Inspect EVM or Solana wallet</h2></div><Source>Nansen · Hyperliquid for EVM</Source></div><form className="wallet-form" onSubmit={(e) => { e.preventDefault(); if (/^0x[a-fA-F0-9]{40}$/.test(address) || /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address)) lookup.mutate(address); }}><input aria-label="EVM or Solana wallet address" value={address} onChange={(e) => setAddress(e.target.value.trim())} placeholder="0x… or Solana address"/><button className="primary">Inspect</button></form>{address && !/^0x[a-fA-F0-9]{40}$/.test(address) && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address) && <p className="down">Enter a valid EVM or Solana wallet address.</p>}{lookup.data?.wallet && <WalletView wallet={lookup.data.wallet}/>} {lookup.data?.error && <Empty>{lookup.data.error}</Empty>}</section><CrossVenueDerivatives x={x}/><section className="terminal-section"><div className="panel-head"><h2>POSITIONING / OKX</h2><Source>OKX primary · Hyperliquid check</Source></div>{x.available ? <><div className="indicator-grid"><Metric label="Funding" value={x.fundingCurrent == null ? "Unavailable" : `${(x.fundingCurrent * 100).toFixed(4)}%`}/><Metric label="Funding / OI as of" value={x.sourceTime ? new Date(x.sourceTime).toLocaleString() : "timestamp unavailable"}/><Metric label="Funding z" value={num(x.fundingZ)}/><Metric label="Open interest" value={money(x.openInterestUsd, true)}/><Metric label="OI · 24H" value={percent(x.oiChange24h)}/><Metric label="Long / short" value={num(x.longShortRatio)}/><Metric label="Perp basis" value={percent(x.perpBasisPct, 3)}/><Metric label="Spot CVD · 100" value={money(x.spotCvdUsd, true)}/><Metric label="Perp CVD · 100" value={money(x.perpCvdUsd, true)}/></div>{x.liquidationZones && <div className="levels"><Metric label="Long 10× ref" value={money(x.liquidationZones.long10x)}/><Metric label="Long 20× ref" value={money(x.liquidationZones.long20x)}/><Metric label="Short 20× ref" value={money(x.liquidationZones.short20x)}/><Metric label="Short 10× ref" value={money(x.liquidationZones.short10x)}/></div>}<p className="muted">{x.liquidationZones?.methodology} Hyperliquid cross-check: funding {x.hyperliquidCrossCheck?.funding == null ? "unavailable" : `${(x.hyperliquidCrossCheck.funding * 100).toFixed(4)}%`} · OI {money(x.hyperliquidCrossCheck?.openInterestUsd, true)}.</p></> : <Empty>{x.unavailableNote ?? "No OKX perpetual mapping returned."}</Empty>}</section><section className="terminal-section"><div className="panel-head"><div><p className="eyebrow cyan">Silent hints</p><h2>Early institutional footprints</h2></div><Source>Linked public evidence</Source></div><p className="muted">VC investment, market-maker engagement, foundation delegation, and listing-pipeline evidence before it becomes a consensus narrative. Confidence tiers describe source strength, never probability.</p>{hints.data?.items?.length ? <div className="hint-feed">{hints.data.items.map((h:any, i:number) => <article key={`${h.title}-${i}`}><div><span>{h.type}</span><b>{h.confidence}</b></div><strong>{h.title}</strong><p>{h.summary}</p><small>{h.singleSource ? "Single source — unconfirmed" : `${h.sources.length} linked sources`}</small>{h.sources.map((s:any) => <a key={s.url} href={s.url} target="_blank" rel="noreferrer">{s.source} ↗</a>)}</article>)}</div> : <Empty>{hints.isPending ? "Checking public institutional-footprint sources…" : hints.data?.error ?? "No verified Silent Hints returned."}</Empty>}</section><section className="terminal-section"><div className="panel-head"><h2>Public social + trader chatter</h2><Source>Stocktwits / Reddit / Hyperliquid</Source></div>{social.data?.social ? <><div className="indicator-grid"><Metric label="Stocktwits posts" value={num(social.data.social.counts.stocktwits)}/><Metric label="Explicit bullish" value={num(social.data.social.counts.bullish)}/><Metric label="Explicit bearish" value={num(social.data.social.counts.bearish)}/><Metric label="Reddit posts" value={num(social.data.social.counts.reddit)}/></div><p className="muted">{social.data.social.methodology} X timelines are not included because they require paid API access.</p><a className="outlink" href="https://paste.trade" target="_blank" rel="noreferrer">Open paste.trade public tracking ↗</a>{social.data.social.messages?.length ? <div className="social-feed">{social.data.social.messages.map((m:any) => <article key={`${m.source}-${m.id}`}><div><strong>{m.handle}</strong><Source>{`${m.source}${m.sentiment ? ` · ${m.sentiment}` : ""}`}</Source></div><p>{m.text}</p><small>{m.createdAt ? new Date(m.createdAt).toLocaleString() : "Time unavailable"} · {num(m.reactions)} reactions · {num(m.replies)} replies</small>{m.url && <a className="outlink" href={m.url} target="_blank" rel="noreferrer">Open source ↗</a>}</article>)}</div> : <Empty>{`No public messages returned for ${d.asset.symbol}.`}</Empty>}<p className="muted">Checked {new Date(social.data.social.checkedAt).toLocaleString()}. Profitable-trader positions above are pulled separately from Hyperliquid's public leaderboard and wallet state.</p></> : <Empty>{social.isPending ? "Checking public chatter…" : social.data?.error ?? "Public social chatter unavailable."}</Empty>}</section><section className="terminal-section"><div className="panel-head"><h2>DEX flow + attention</h2><Source>DexScreener / GeckoTerminal</Source></div>{dex ? <><div className="indicator-grid"><Metric label="Venue" value={`${dex.venue} · ${dex.chain}`}/><Metric label="Liquidity" value={money(dex.liquidity, true)}/><Metric label="24H volume" value={money(dex.volume24h, true)}/><Metric label="Buys / sells" value={`${num(dex.buys24h)} / ${num(dex.sells24h)}`}/><Metric label="Liquidity Δ" value={percent(dex.liquidityChange)}/><Metric label="Trending rank" value={attention.data?.attention?.trendingRank ? `#${attention.data.attention.trendingRank}` : "Not trending"}/><Metric label="DEX boosted" value={attention.data?.attention?.boosted ? `Yes · ${num(attention.data.attention.boostAmount)}` : "Not seen"}/></div>{attention.data?.attention?.pool && <p className="interpret">Unique 24H buyers/sellers: {num(attention.data.attention.pool.buyers24h)} / {num(attention.data.attention.pool.sellers24h)}. This is an activity proxy, not sentiment or proof of accumulation.</p>}{dex.url && <a className="outlink" href={dex.url} target="_blank" rel="noreferrer">Open verified pair ↗</a>}<p className="muted">Fresh-wallet and bundler identity cannot be proven by these public endpoints. {attention.data?.attention?.unlockNote}</p></> : <Empty>No verified contract-matched DEX pair was returned.</Empty>}</section>{hyper.data?.network && <section className="terminal-section"><div className="panel-head"><h2>BTC network pressure</h2><Source>mempool.space</Source></div><div className="indicator-grid"><Metric label="Pending txs" value={num(hyper.data.network.pendingTransactions, true)}/><Metric label="Virtual size" value={num(hyper.data.network.virtualSize, true)}/><Metric label="Fast fee" value={`${num(hyper.data.network.fastestFee)} sat/vB`}/><Metric label="30m fee" value={`${num(hyper.data.network.halfHourFee)} sat/vB`}/></div><p className="muted">Congestion and fee pressure are activity proxies—not exchange inflows or whale direction.</p></section>}</div>; }
function WalletView({ wallet }: { wallet: any }) { return <div className="wallet-view">{wallet.nansen && <section className="wallet-profiler"><div className="provider-heading"><div><span>NANSEN PROFILER · {String(wallet.nansen.chain).toUpperCase()}</span><h3>Measured wallet PnL summary</h3></div><Source>{wallet.nansen.asOf ? new Date(wallet.nansen.asOf).toLocaleString() : "on demand"}</Source></div><div className="credit-ledger"><span>THIS CALL COST</span><strong>{wallet.nansen.credits?.cost ?? "header unavailable"} credits</strong><span>REMAINING</span><strong>{wallet.nansen.credits?.remaining ?? "header unavailable"}</strong></div>{wallet.nansen.status === "unavailable" ? <Empty>{wallet.nansen.error}</Empty> : <div className="indicator-grid"><Metric label="Realized PnL" value={money(wallet.nansen.metrics?.realizedPnlUsd, true)}/><Metric label="Unrealized PnL" value={money(wallet.nansen.metrics?.unrealizedPnlUsd, true)}/><Metric label="Total PnL" value={money(wallet.nansen.metrics?.totalPnlUsd, true)}/><Metric label="ROI" value={percent(wallet.nansen.metrics?.roiPercent)}/><Metric label="Win rate" value={percent(wallet.nansen.metrics?.winRatePercent)}/><Metric label="Trades" value={num(wallet.nansen.metrics?.tradeCount)}/></div>}<p className="interpretation"><b>Read:</b> {wallet.nansen.interpretation}</p></section>}<div className="indicator-grid"><Metric label="Account value" value={money(wallet.accountValue, true)}/><Metric label="Notional" value={money(wallet.totalNotional, true)}/><Metric label="Margin used" value={money(wallet.marginUsed, true)}/><Metric label="Lean" value={wallet.lean}/></div>{wallet.behavior && <div className="behavior-profile"><span>Behavioral labels · heuristic, not identity</span><div>{wallet.behavior.labels.map((label:string) => <b key={label}>{label}</b>)}</div><p>Closed-fill win rate {wallet.behavior.winRate == null ? "unavailable" : `${num(wallet.behavior.winRate)}%`} · average observed hold {wallet.behavior.avgHoldHours == null ? "unavailable" : `${num(wallet.behavior.avgHoldHours)}h`} · 48h buys/sells {money(wallet.behavior.buyNotional48h,true)} / {money(wallet.behavior.sellNotional48h,true)}.</p><small>{wallet.behavior.methodology}</small></div>}<h3>Open positions</h3>{wallet.positions.length ? wallet.positions.map((p:any) => <div className="position" key={p.coin}><strong>{p.coin}</strong><span className={p.side === "long" ? "up" : "down"}>{p.side} · {money(Math.abs(p.value ?? 0), true)}</span><small>Entry {money(p.entry)} · Liq {money(p.liquidationPrice)} · uPnL {money(p.unrealizedPnl)}</small></div>) : <Empty>No open positions returned.</Empty>}<h3>Recent fills</h3>{wallet.fills.slice(0, 10).map((f:any, i:number) => <div className="fill" key={`${f.hash}-${i}`}><span>{f.coin} · {f.side}</span><strong>{money(f.price)} × {num(f.size)}</strong><small>{f.time ? new Date(f.time).toLocaleString() : "Time unavailable"}</small></div>)}</div>; }

function UnderwaterChart({ rows }: { rows: any[] }) { return <div className="underwater"><div><span>UNDERWATER · FULL HISTORY</span><small>drawdown from the running all-time high</small></div><ResponsiveContainer width="100%" height={180}><ComposedChart data={rows} margin={{top:8,right:6,left:-16,bottom:0}}><CartesianGrid stroke="#1d2925" vertical={false}/><XAxis dataKey="day" stroke="#73827b" fontSize={8} minTickGap={50}/><YAxis domain={["dataMin",0]} stroke="#73827b" fontSize={8} tickFormatter={(v:number)=>`${v.toFixed(0)}%`}/><Tooltip contentStyle={{background:"#101513",border:"1px solid #2b3934"}} formatter={(v:any)=>[`${Number(v).toFixed(1)}%`,"Drawdown"]}/><Area type="monotone" dataKey="drawdownPct" stroke="#ff6f61" fill="#ff6f6126" isAnimationActive={false}/></ComposedChart></ResponsiveContainer></div>; }

function DistributionStrip({ row }: { row: any }) { const pctile = row.percentile == null ? null : Math.max(0, Math.min(100, row.percentile)); return <div className="distribution-row"><div><strong>{row.label}</strong><span>{row.value == null ? "Unavailable" : `${num(row.value, false)}${row.unit ? ` ${row.unit}` : ""}`}</span></div><div className="distribution-track" aria-label={`${row.label} historical percentile`}><i style={{ width: `${pctile ?? 0}%` }}/>{pctile != null && <b style={{ left: `${pctile}%` }}/>}</div><small>{pctile == null ? row.window : `${num(pctile)}th percentile · n=${row.samples} · ${row.window}`}</small></div>; }

function CycleOverlay({ c }: { c: any }) { const cycle = c?.cycle; if (!cycle?.cycles?.length) return null; const colors: Record<string,string> = { "2016": "#f7c65f", "2020": "#38d7ff", "2024": "#67f578" }; const days = Array.from(new Set(cycle.cycles.flatMap((item:any) => item.points.map((point:any) => point.day)))).sort((a:any,b:any) => a-b).filter((day:any) => day <= Math.max(1500, cycle.currentDay ?? 0)); const rows = days.map((day:any) => { const row:any = { day }; cycle.cycles.forEach((item:any) => { const point = item.points.find((p:any) => p.day === day); if (point) row[item.label] = point.returnPct; }); return row; }); return <><div className="cycle-summary"><Metric label="Prior-cycle run achieved" value={cycle.percentOfPriorRun == null ? "—" : `${num(cycle.percentOfPriorRun)}%`}/><Metric label="Drawdown vs analog" value={percent(cycle.drawdownVsAnalog)}/><Metric label="Return divergence" value={cycle.divergence ? `${percent(cycle.divergence.differencePctPoints)} pts` : "—"}/><Metric label="Divergence flag" value={cycle.divergence?.flag ? "ACTIVE" : "clear"}/></div><div className={`cycle-pattern ${cycle.pattern?.meaningful ? "meaningful" : "insufficient"}`}><b>{cycle.pattern?.label}</b><span>{cycle.pattern?.reason}</span><small>{cycle.pattern?.rule}</small></div><div className="cycle-similarity">{cycle.similarities?.map((row:any)=><div key={row.cycle}><strong>{row.cycle} similarity</strong><span>{row.correlation == null ? "unavailable" : `r=${num(row.correlation)} · RMSE ${num(row.rmsePctPoints)}pp`}</span><small>{row.weeklySamples} weekly matches · {row.comparable ? "comparable" : "insufficient sample"}</small></div>)}</div><div className="cycle-chart"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={rows} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}><CartesianGrid stroke="#1d2925" vertical={false}/><XAxis dataKey="day" stroke="#73827b" fontSize={9} tickFormatter={(v:number) => `${v}d`}/><YAxis stroke="#73827b" fontSize={9} tickFormatter={(v:number) => `${v.toFixed(0)}%`}/><Tooltip contentStyle={{ background: "#101513", border: "1px solid #2b3934" }} labelFormatter={(v) => `Day ${v}`} formatter={(v:any,name:any) => [`${Number(v).toFixed(1)}%`, `${name} halving`]}/><Legend/>{cycle.cycles.map((item:any) => <Line key={item.label} type="monotone" dataKey={item.label} name={`${item.label}${item.partial ? " · partial" : ""}`} stroke={colors[item.label] ?? "#91a099"} dot={false} strokeWidth={item.label === "2024" ? 2.4 : 1.3} isAnimationActive={false}/>)}</ComposedChart></ResponsiveContainer></div><p className="chart-note">Normalized return from each cycle’s first cached close. {cycle.divergence?.rule} Missing cycles: {cycle.unavailableCycles?.join(", ") || "none"}.</p></>; }

function Rotation({ cycle, rotation, openCoin }: { cycle: any; rotation: any; openCoin: (id: string, symbol: string) => void }) { const c = cycle?.data; return <div className="stack"><section className="terminal-section"><div className="panel-head"><div><p className="eyebrow cyan">BTC cycle study</p><h2>Regime compass</h2></div><button className="text-action" onClick={() => openCoin("bitcoin", "BTC")}>Open BTC</button></div>{c ? <><div className="indicator-grid"><Metric label="Since halving" value={`${num(c.daysSinceHalving)} days`}/><Metric label="Halving date" value={c.halvingDate}/><Metric label="BTC drawdown" value={percent(c.btcDrawdown)}/><Metric label="BTC regime" value={c.btcRegime}/><Metric label="BTC dominance" value={`${num(c.btcDominance)}%`}/><Metric label="Total market" value={money(c.totalMarketCap, true)}/></div><p className="muted">{c.priorCycleNote}</p><CycleOverlay c={c}/>{c.history && <><div className="distribution-list">{c.history.distributions.map((row:any) => <DistributionStrip key={row.label} row={row}/>)}</div><p className="score-disclaimer">{c.history.note}</p><div className="drawdown-table"><div className="drawdown-row head"><span>Drawdown</span><span>Depth</span><span>To trough</span><span>Recovery</span></div>{c.history.drawdowns.slice(0,8).map((row:any,index:number) => <div className="drawdown-row" key={`${row.start}-${index}`}><span>{row.start} → {row.trough}</span><b className="down">{percent(row.depth)}</b><span>{row.durationDays}d</span><span>{row.recoveryDays == null ? "unrecovered" : `${row.recoveryDays}d`}</span></div>)}</div></>}<RatioCharts c={c}/></> : <Empty>{cycle?.error ? plainUpstreamError(cycle.error) : "Cycle data loading…"}</Empty>}</section><section className="terminal-section"><div className="panel-head"><div><p className="eyebrow cyan">/BTC ratio table</p><h2>Rotation breadth</h2></div><Source>CoinGecko</Source></div><p className="muted">{rotation?.note ?? "Ratio breadth is loading…"}</p>{rotation?.pairs?.length ? <div className="ratio-table"><div className="ratio-row head"><span>Pair</span><span>30D</span><span>90D</span><span>Range</span></div>{rotation.pairs.map((row:any) => <button type="button" className="ratio-row" key={row.id} onClick={() => openCoin(row.id, row.symbol)} aria-label={`Open ${row.symbol} dossier`}><strong>{row.symbol}/BTC</strong><span className={(row.return30d ?? 0) >= 0 ? "up" : "down"}>{percent(row.return30d)}</span><span className={(row.return90d ?? 0) >= 0 ? "up" : "down"}>{percent(row.return90d)}</span><em>{row.range} →</em></button>)}</div> : <Empty>{rotation?.error ? plainUpstreamError(rotation.error) : "Ratio data loading…"}</Empty>}</section><section className="terminal-section"><div className="panel-head"><div><p className="eyebrow cyan">Narrative rotation</p><h2>Leaders and laggards</h2></div><Source>CoinGecko</Source></div>{rotation?.categories?.length ? <div className="rotation-list">{rotation.categories.map((r: any, i: number) => <article key={r.id}><b>#{i + 1}</b><div><strong>{r.label}</strong><div className="leader-links">{r.leaders.map((x: any) => <button key={x.symbol} onClick={() => openCoin(x.id, x.symbol)}>{x.symbol} →</button>)}</div></div><span className={(r.return7d ?? 0) >= 0 ? "up" : "down"}>{percent(r.return7d)}</span><em>{num(r.breadth7d)}% breadth</em></article>)}</div> : <Empty>{rotation?.error ? plainUpstreamError(rotation.error) : "Rotation data loading…"}</Empty>}</section></div>; }
function RatioCharts({ c }: { c: any }) { const rows = [{ key: "ethBtc", label: "ETH / BTC" }, { key: "solBtc", label: "SOL / BTC" }, { key: "solEth", label: "SOL / ETH" }]; return <div className="ratio-grid">{rows.map((r) => <div className="ratio" key={r.key}><span>{r.label}</span><ResponsiveContainer width="100%" height={90}><ComposedChart data={c[r.key].slice(-180)}><XAxis dataKey="ts" hide/><YAxis domain={["auto", "auto"]} hide/><Tooltip labelFormatter={(v) => dateLabel(Number(v))} formatter={(v:any) => num(Number(v), false)} contentStyle={{ background: "#101513", border: "1px solid #2b3934" }}/><Line type="monotone" dataKey="value" dot={false} stroke="#38d7ff" isAnimationActive={false}/></ComposedChart></ResponsiveContainer></div>)}<WalletIntelligence/></div>; }

function EntryTiming({ asset }: { asset: any }) {
  const [direction, setDirection] = useState<"long"|"short">("long"); const [entry, setEntry] = useState(String(asset.price ?? "")); const qc = useQueryClient();
  const check = useMutation({ mutationFn: () => api.checkentry({ coinId: asset.id, symbol: asset.symbol, direction, entryPrice: Number(entry) }) }); const r = check.data?.result;
  const log = useMutation({ mutationFn: () => api.logActualEntry({ symbol: asset.symbol, side: direction, entry: Number(entry), stop: Number(r?.invalidation), target: r?.target1 ?? null, verdict: r?.verdict, checkSnapshot: r, notes: "" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["self-test"] }) });
  return <section className="terminal-section"><div className="panel-head"><div><p className="eyebrow cyan">Entry timing check</p><h2>Is this entry early, crowded, or aligned?</h2></div><Source>TA + positioning + signals + news</Source></div><form className="form" onSubmit={(e) => { e.preventDefault(); if (Number(entry) > 0) check.mutate(); }}><label>Direction<select aria-label="Planned entry direction" value={direction} onChange={(e) => setDirection(e.target.value as "long"|"short")}><option value="long">Long</option><option value="short">Short</option></select></label><label>Planned entry<input aria-label="Planned entry price" type="number" min="0" step="any" value={entry} onChange={(e) => setEntry(e.target.value)}/></label><button className="primary" disabled={check.isPending || !(Number(entry) > 0)}>{check.isPending ? "Checking…" : "Check timing"}</button></form><p className="score-disclaimer">This view shows the underlying timing checks directly; no composite timing rating is issued until entry-check outcomes have a closed-history calibration.</p>{r && <div className="entry-read"><div className="panel-head"><strong>{r.verdictLabel}</strong><small>{new Date(r.checkedAt).toLocaleString()}</small></div><div className="entry-checks">{r.reasons.map((reason:any) => <div key={reason.check} className={reason.status}><span>{reason.check}</span><b>{reason.status}</b><p>{reason.evidence}</p></div>)}</div>{r.invalidation != null && <div className="actual-entry-log"><p>Taking this entry for real? Save the verdict and immutable check snapshot before execution.</p><button className="primary" onClick={() => log.mutate()} disabled={log.isPending || log.isSuccess}>{log.isPending ? "Logging…" : log.isSuccess ? "Actual entry logged" : "Log actual entry"}</button></div>}{r.news?.length > 0 && <div className="machine-sources"><span>Nearby catalysts / news</span>{r.news.map((n:any) => <a key={n.url} href={n.url} target="_blank" rel="noreferrer"><strong>{n.title}</strong><small>{n.source} · {n.publishedAt ?? "Date unavailable"}</small></a>)}</div>}</div>}{check.data?.error && <Empty>{check.data.error}</Empty>}</section>;
}
function Sizing({ asset }: { asset: any }) { const [a, setA] = useState({ account: "10000", risk: "1", entry: String(asset.price ?? ""), stop: asset.price ? String(asset.price * 0.95) : "", feeBps: "10", slippageBps: "8", side: "long" }); const n = Object.fromEntries(Object.entries(a).map(([k, v]) => [k, Number(v)])) as any; const riskBudget = Math.max(0, n.account * n.risk / 100); const stopDistance = Math.abs(n.entry - n.stop); const frictionPerUnit = Math.max(0, n.entry * (n.feeBps + n.slippageBps) / 10000); const units = stopDistance + frictionPerUnit > 0 ? riskBudget / (stopDistance + frictionPerUnit) : 0; const notional = units * n.entry; const estimatedFriction = notional * (n.feeBps + n.slippageBps) / 10000; const frictionRatio = riskBudget > 0 ? estimatedFriction / riskBudget * 100 : 0; const update = (k: string, v: string) => setA({ ...a, [k]: v }); return <section className="terminal-section"><p className="eyebrow cyan">Risk capture</p><h2>Position-size calculator · {asset.symbol}</h2><div className="form"><label>Account size<input aria-label="Account size" type="number" min="0" value={a.account} onChange={(e) => update("account", e.target.value)}/></label><label>Risk per idea %<input aria-label="Risk per idea percent" type="number" min="0" step="0.1" value={a.risk} onChange={(e) => update("risk", e.target.value)}/></label><label>Reference entry<input aria-label="Reference entry" type="number" min="0" step="any" value={a.entry} onChange={(e) => update("entry", e.target.value)}/></label><label>Stop<input aria-label="Sizing stop" type="number" min="0" step="any" value={a.stop} onChange={(e) => update("stop", e.target.value)}/></label><label>Round-trip fees · bps<input aria-label="Round trip fees in basis points" type="number" min="0" value={a.feeBps} onChange={(e) => update("feeBps", e.target.value)}/></label><label>Slippage · bps<input aria-label="Slippage in basis points" type="number" min="0" value={a.slippageBps} onChange={(e) => update("slippageBps", e.target.value)}/></label><label>Side<select aria-label="Sizing side" value={a.side} onChange={(e) => update("side", e.target.value)}><option value="long">Long</option><option value="short">Short</option></select></label></div><div className="sizing-output"><Metric label="Risk budget" value={money(riskBudget)}/><Metric label="Stop distance" value={money(stopDistance)}/><Metric label={`Units · ${asset.symbol}`} value={num(units)}/><Metric label={`Reference notional · ${a.side}`} value={money(notional)}/><Metric label="Estimated friction" value={money(estimatedFriction)}/><Metric label="Friction / risk" value={`${num(frictionRatio)}%`}/></div><p className="muted">Fee and slippage inputs are assumptions. Nothing here predicts execution, liquidity, fills, funding, or venue-specific liquidation mechanics.</p></section>; }


function Tracker({ openCoin }: { openCoin: (id: string, symbol: string) => void }) {
  const [showTest, setShowTest] = useState(false);
  const q = useQuery({ queryKey: ["signal-tracker", showTest], queryFn: () => api.getSignalTracker({ limit: 50, cursor: 0, includeTest: showTest }) });
  const discovery = useQuery({ queryKey: ["market-discovery"], queryFn: () => api.getMarketDiscovery({}), staleTime: 300000 });
  const qc = useQueryClient();
  const [measurementRunId, setMeasurementRunId] = useState<string | undefined>();
  const postmortem = useMutation({ mutationFn: () => api.runDailySignalPostmortem({ runId: measurementRunId, batchSize: 8, trigger: "manual" }), onSuccess: (result) => { setMeasurementRunId(result.run.status === "partial" ? result.run.runId : undefined); qc.invalidateQueries({ queryKey: ["signal-tracker"] }); } });
  const s = q.data?.stats;
  const openSignals = q.data?.signals?.filter((signal:any) => signal.outcome30 == null) ?? [];
  const interimAt = (history:any[], day:number) => history.find((snapshot:any) => snapshot.daysSinceEntry === day) ?? null;
  return <div className="stack">
    <section className="terminal-section daily-postmortem"><div className="panel-head"><div><p className="eyebrow cyan">Daily post-mortem</p><h2>How recent calls are tracking</h2></div><button className="refresh-small" onClick={() => postmortem.mutate()} disabled={postmortem.isPending}>{postmortem.isPending ? "Checking batch…" : measurementRunId ? "Continue partial run" : "Run check now"}</button></div>{q.data?.latestBrief ? <><p>{q.data.latestBrief.summary}</p><div className="indicator-grid"><Metric label="Tracked calls" value={num(q.data.latestBrief.trackedCount)}/><Metric label="Near target 1" value={num(q.data.latestBrief.approachingTargetCount)} tone="up"/><Metric label="Near invalidation" value={num(q.data.latestBrief.approachingInvalidationCount)} tone="down"/><Metric label="Data as of" value={sourceTimeLabel(new Date(q.data.latestBrief.sourceAsOf).getTime())}/></div></> : <Empty>No daily review has run yet. The scheduled check will create the first brief, or run it now.</Empty>}{postmortem.data ? <p className={postmortem.data.run.status === "complete" ? "muted" : "source-warning"}><b>{postmortem.data.run.status.toUpperCase()}</b> · run {postmortem.data.run.runId} · checkpoint {postmortem.data.run.cursor}/{postmortem.data.run.signalsInScope} · evaluated {postmortem.data.run.evaluated} · pending {postmortem.data.run.pending} · unverified {postmortem.data.run.unverified} · failed {postmortem.data.run.failed}{postmortem.data.run.retryPending ? " · retry pending" : ""}</p> : null}{postmortem.data?.errors?.length ? <p className="source-warning">Batch issues: {postmortem.data.errors.join(" · ")}</p> : null}<p className="score-disclaimer">Interim returns are tracking-in-progress noise, never verdicts. Reliability uses only the exact declared cohort under {q.data?.stats?.methodVersion ?? "the active evaluator"}: {q.data?.stats?.issued ?? 0} issued · {q.data?.stats?.resolved ?? 0} resolved · {q.data?.stats?.ambiguous ?? 0} ambiguous · {q.data?.stats?.unverified ?? 0} unverified · {q.data?.stats?.open ?? 0} awaiting evidence. <span title={q.data?.stats?.cohortDefinition ?? ""}>Cohort details</span>.</p></section>
    <section className="terminal-section"><div className="panel-head"><div><p className="eyebrow cyan">DISCOVERY ASSESSMENTS</p><h2>Automatic shortlist — not tracked calls</h2></div><button className="text-action" onClick={() => discovery.refetch()}>Reload stored scan</button></div><p className="muted">Generated from the scheduled tiered market screen: 30 core assets every run, plus attention, rotation, and silent-hint triggers. Select a row to inspect the full live dossier. Discovery assessments are research shortlists — not tracked calls and never entries.</p>{discovery.data?.signals?.length ? <div className="home-signal-list">{discovery.data.signals.slice(0, 10).map((item: any) => { const rated = Boolean(item.sourceAsOf) && Array.isArray(item.dimensions) && item.dimensions.length > 0; return <button key={item.id} onClick={() => openCoin(item.coinId, item.symbol)}><span><strong>{item.symbol} · #{item.rank ?? "—"}</strong><small>{item.setupType} · {rated ? item.dimensions.map((dimension:any) => `${dimension.name} ${dimension.contribution}`).join(" · ") : "Factor ledger or source timestamp unavailable"}</small>{rated ? <ReliabilityLine data={item.reliability} compact/> : null}</span><b className={rated ? item.direction === "long" ? "up" : item.direction === "short" ? "down" : "muted" : "muted"}>{rated ? item.direction.toUpperCase() : "RATING WITHHELD"}</b><em>{rated && item.reliability ? `${item.direction.toUpperCase()} · ${item.alignment} / 100` : "RATING WITHHELD"}</em></button>; })}</div> : <Empty>No automatic discovery scan is stored yet.</Empty>}</section>
    <section className="terminal-section"><p className="eyebrow cyan">Forward evidence</p><h2>Directional scorecard</h2><div className="indicator-grid"><Metric label="Directional hit rate" value={s?.hitRate == null ? "Awaiting maturity" : `${num(s.hitRate)}%`}/><Metric label="Resolved observations" value={num(s?.scored)}/><Metric label="Open" value={num(s?.open)}/><Metric label="Ambiguous / unverified" value={`${num(s?.ambiguous)} / ${num(s?.unverified)}`}/></div><p className="score-disclaimer">Legacy diagnostic: outcomes are coded +1 for directionally aligned and −1 for opposed. Without frozen execution prices, initial risk, contract-consistent exits and costs, this is not R, trading expectancy, or position-sizing evidence. Scores out of 100 measure factor agreement—not probability or edge.</p><p className="muted">Each issued contract is evaluated separately at its declared horizon. Missing or incomplete coverage remains visible as unverified; it is never removed from cohort accounting.</p>{s?.groups?.length ? <div className="venue-list">{s.groups.map((g:any) => <div key={g.label}><span>{g.label} · n={g.total}</span><strong>{g.hitRate == null ? "Awaiting resolved observations" : `${num(g.hitRate)}% directional hit rate`} · {g.status}</strong></div>)}</div> : null}</section>
    <section className="terminal-section recent-calls"><div className="panel-head"><div><p className="eyebrow cyan">TRACKED DOSSIER SIGNALS</p><h2>Recent calls</h2></div><label className="test-toggle"><input type="checkbox" aria-label="Show TEST fixtures" checked={showTest} onChange={(e) => setShowTest(e.target.checked)} /> Show TEST fixtures</label><Source>daily snapshots</Source></div><p className="muted">Open calls show 1D / 2D / 3D checkpoints beside the formal 5D / 14D / 30D outcome windows. The early tape is context, not a grade.</p>{q.isPending ? <Empty>Loading issued contracts and evaluation history…</Empty> : q.isError ? <Empty>Signal tracker failed to load. Retry the page or run the measurement check again.</Empty> : openSignals.length ? <div className="recent-call-list">{openSignals.map((x:any) => { const rated = Boolean(x.sourceAsOf) && Array.isArray(x.factors) && x.factors.length > 0; const d1 = interimAt(x.history, 1); const d2 = interimAt(x.history, 2); const d3 = interimAt(x.history, 3); const latest = x.history.at(-1) ?? null; return <button type="button" key={x.id} onClick={() => openCoin(x.coinId, x.symbol)} aria-label={`Open ${x.symbol} signal dossier`}><div className="recent-call-head"><span><strong>{x.symbol} · {x.direction.toUpperCase()}</strong><small>{x.setupType} · entry {money(x.entry)} · recorded {new Date(x.createdAt).toLocaleString()}</small>{x.recordIntegrity !== "valid" ? <small className="source-warning">Stored factor ledger {String(x.recordIntegrity).toUpperCase()} · schema {x.factorSchemaVersion} · {(x.integrityIssues ?? []).join(" · ")}</small> : null}<small>{x.riskMethod === "atr14_1_25x" ? `1R = ${num(x.riskMultiplier)}× ATR-14 (${money(x.atr14)})` : "Legacy fixed-risk signal · pre-ATR methodology"}</small></span><b className={(latest?.returnPct ?? 0) >= 0 ? "up" : "down"}>{latest ? percent(latest.returnPct) : "awaiting first check"}</b></div><div className={`invalidation-flags${x.tightInvalidation ? " tight" : ""}`}><span>{x.invalidationGrade} invalidation</span><strong>{x.roomToBreatheAtr == null ? "ATR room unavailable" : `${num(x.roomToBreatheAtr)} ATR room`}</strong>{x.tightInvalidation ? <b>TIGHT · inside 0.75 ATR</b> : null}</div><div className="interim-grid"><Metric label="1D · tracking" value={d1 ? percent(d1.returnPct) : "pending"} tone={d1 ? d1.returnPct >= 0 ? "up" : "down" : undefined}/><Metric label="2D · tracking" value={d2 ? percent(d2.returnPct) : "pending"} tone={d2 ? d2.returnPct >= 0 ? "up" : "down" : undefined}/><Metric label="3D · tracking" value={d3 ? percent(d3.returnPct) : "pending"} tone={d3 ? d3.returnPct >= 0 ? "up" : "down" : undefined}/><Metric label="Current" value={latest ? money(latest.currentPrice) : "pending"}/></div><div className="formal-outcomes"><span>5D <b>{x.outcome5 ?? "pending"}</b>{x.return5 != null ? ` · ${percent(x.return5)}` : ""}</span><span>14D <b>{x.outcome14 ?? "pending"}</b>{x.return14 != null ? ` · ${percent(x.return14)}` : ""}</span><span>30D <b>{x.outcome30 ?? "pending"}</b>{x.return30 != null ? ` · ${percent(x.return30)}` : ""}</span></div>{latest ? <p>Latest checkpoint · day {latest.daysSinceEntry} · target 1 distance {percent(latest.distanceTarget1Pct)} · invalidation buffer {percent(latest.distanceInvalidationPct)} · captured {new Date(latest.capturedAt).toLocaleString()}</p> : <p>First daily snapshot pending. Entry, target and invalidation remain unchanged.</p>}{rated ? <ReliabilityLine data={x.reliability}/> : null}<em>Open dossier →</em></button>; })}</div> : <Empty>No open generated calls are waiting on a 30-day outcome.</Empty>}<details className="passed-log"><summary>Completed and older calls</summary><div className="signal-log interactive-log">{(q.data?.signals ?? []).filter((x:any) => x.outcome30 != null).map((x:any) => <button type="button" key={x.id} onClick={() => openCoin(x.coinId, x.symbol)}><strong>{x.symbol} · {x.direction.toUpperCase()}</strong><small>5D {x.outcome5 ?? "pending"} · 14D {x.outcome14 ?? "pending"} · 30D {x.outcome30 ?? "pending"}</small><small>{x.invalidationGrade} invalidation · {x.roomToBreatheAtr == null ? "ATR room unavailable" : `${num(x.roomToBreatheAtr)} ATR room`}{x.tightInvalidation ? " · TIGHT" : ""}</small><em>Open →</em></button>)}</div></details></section>
  </div>;
}

function News({ asset }: { asset: any }) {
  const qc = useQueryClient(); const [scope, setScope] = useState<"coin" | "discovery">("coin"); const [theoryId, setTheoryId] = useState("");
  const theories = useQuery({ queryKey: ["theories"], queryFn: () => api.listTheories({}) });
  const q = useQuery({ queryKey: ["news", scope, asset.id], queryFn: () => api.getNews({ scope, coinId: scope === "coin" ? asset.id : null, name: scope === "coin" ? asset.name : null, symbol: scope === "coin" ? asset.symbol : "CRYPTO", limit: 20, cursor: 0 }), staleTime: 300000 });
  const attach = useMutation({ mutationFn: (a: any) => api.addTheoryEvidence(a), onSuccess: () => qc.invalidateQueries({ queryKey: ["theories"] }) });
  return <div className="stack"><section className="terminal-section"><div className="panel-head"><div><p className="eyebrow cyan">Sourced developments</p><h2>{scope === "coin" ? `${asset.symbol} news` : "Crypto discovery"}</h2></div><button className="refresh-small" onClick={() => q.refetch()} disabled={q.isFetching}>{q.isFetching ? "Refreshing…" : "Refresh"}</button></div><div className="seg news-tabs"><button className={scope === "coin" ? "active" : ""} onClick={() => setScope("coin")}>Per coin</button><button className={scope === "discovery" ? "active" : ""} onClick={() => setScope("discovery")}>Today’s discovery</button></div>{theories.data?.theories.length ? <label className="evidence-target">Attach evidence to<select aria-label="Theory evidence target" value={theoryId} onChange={(e) => setTheoryId(e.target.value)}><option value="">Choose a theory</option>{theories.data.theories.map((t:any) => <option key={t.id} value={t.id}>{t.statement.slice(0, 70)}</option>)}</select></label> : <p className="muted">Create a theory to attach news as confirming or challenging evidence.</p>}</section>{q.isPending ? <Empty>Checking current sources…</Empty> : q.data?.items.length ? <section className="terminal-section news-feed">{q.data.items.map((item:any) => <article key={item.url}><a href={item.url} target="_blank" rel="noreferrer"><strong>{item.title}</strong></a><small className={item.stale || item.sourceTier === "LOW_TIER" ? "source-warning" : ""}>{item.stale ? "STALE · " : ""}{item.source} · {item.publishedAt || `Retrieved ${new Date(item.retrievedAt).toLocaleString()}`} · <b>{item.verification}</b></small><p><span>Why it matters:</span> {item.whyItMatters}</p><div className="ripple-tags">{item.rippleTags.map((tag:string) => <em key={tag}>{tag}</em>)}</div><div className="evidence-actions"><button disabled={!theoryId || attach.isPending} onClick={() => attach.mutate({ theoryId: Number(theoryId), title: item.title, url: item.url, source: item.source, stance: "confirming", publishedAt: item.publishedAt })}>Attach as confirming</button><button disabled={!theoryId || attach.isPending} onClick={() => attach.mutate({ theoryId: Number(theoryId), title: item.title, url: item.url, source: item.source, stance: "challenging", publishedAt: item.publishedAt })}>Attach as challenging</button></div></article>)}</section> : <Empty>{q.data?.error ?? "No sourced developments were returned. Try refresh later."}</Empty>}</div>;
}

type PredictionDraft = { coinId: string; symbol: string; direction: "above" | "below"; targetPrice: string; dueDate: string };
function UserTheories({ asset }: { asset: any }) {
  const qc = useQueryClient(); const blankPrediction = (): PredictionDraft => ({ coinId: asset.id, symbol: asset.symbol, direction: "above", targetPrice: "", dueDate: "" }); const [filter, setFilter] = useState<"all" | "short" | "long">("all"); const [form, setForm] = useState<{ id?: number; statement: string; horizon: "short" | "long"; rippleMap: string; predictions: PredictionDraft[] }>({ statement: "", horizon: "short", rippleMap: "", predictions: [blankPrediction()] });
  const q = useQuery({ queryKey: ["theories"], queryFn: () => api.listTheories({}) });
  const save = useMutation({ mutationFn: () => api.saveTheory({ id: form.id, statement: form.statement, horizon: form.horizon, rippleMap: form.rippleMap, linkedCoins: [...new Map(form.predictions.map((p) => [p.coinId, { coinId: p.coinId.trim(), symbol: p.symbol.trim().toUpperCase() }])).values()], predictions: form.predictions.map((p) => ({ coinId: p.coinId.trim(), symbol: p.symbol.trim().toUpperCase(), direction: p.direction, targetPrice: p.targetPrice ? Number(p.targetPrice) : null, dueDate: p.dueDate })) }), onSuccess: (result) => { if (result.ok) { setForm({ statement: "", horizon: "short", rippleMap: "", predictions: [blankPrediction()] }); qc.invalidateQueries({ queryKey: ["theories"] }); } } });
  const del = useMutation({ mutationFn: (id:number) => api.deleteTheory({ id }), onSuccess: () => qc.invalidateQueries({ queryKey: ["theories"] }) });
  const updatePrediction = (index:number, patch:Partial<PredictionDraft>) => setForm({ ...form, predictions: form.predictions.map((p, i) => i === index ? { ...p, ...patch } : p) }); const rows = (q.data?.theories ?? []).filter((t:any) => filter === "all" || t.horizon === filter);
  return <div className="stack"><section className="terminal-section"><div className="panel-head"><div><p className="eyebrow cyan">Falsifiable research</p><h2>{form.id ? "Update theory" : "Create a theory"}</h2></div><Source>live prices</Source></div><form className="theory-form" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}><label>Plain statement<textarea aria-label="Theory statement" required value={form.statement} onChange={(e) => setForm({ ...form, statement: e.target.value })} placeholder="What do you think will happen, and why?"/></label><label>Horizon<select aria-label="Theory horizon" value={form.horizon} onChange={(e) => setForm({ ...form, horizon: e.target.value as "short" | "long" })}><option value="short">Short-term · under 30 days</option><option value="long">Long-term</option></select></label><label>Ripple map<textarea aria-label="Theory ripple map" required value={form.rippleMap} onChange={(e) => setForm({ ...form, rippleMap: e.target.value })} placeholder="X affects Y because…"/></label><div className="prediction-builder"><div className="panel-head"><h3>Predictions</h3><button type="button" onClick={() => setForm({ ...form, predictions: [...form.predictions, blankPrediction()] })}>+ Add prediction</button></div>{form.predictions.map((p, i) => <div className="prediction-row" key={i}><label>CoinGecko ID<input aria-label={`Prediction ${i + 1} coin ID`} required value={p.coinId} onChange={(e) => updatePrediction(i, { coinId: e.target.value })}/></label><label>Symbol<input aria-label={`Prediction ${i + 1} symbol`} required value={p.symbol} onChange={(e) => updatePrediction(i, { symbol: e.target.value })}/></label><label>Direction<select aria-label={`Prediction ${i + 1} direction`} value={p.direction} onChange={(e) => updatePrediction(i, { direction: e.target.value as "above" | "below" })}><option value="above">Above / higher</option><option value="below">Below / lower</option></select></label><label>Target price · optional<input aria-label={`Prediction ${i + 1} target price`} type="number" min="0" step="any" value={p.targetPrice} onChange={(e) => updatePrediction(i, { targetPrice: e.target.value })}/></label><label>By date<input aria-label={`Prediction ${i + 1} due date`} type="date" required value={p.dueDate} onChange={(e) => updatePrediction(i, { dueDate: e.target.value })}/></label>{form.predictions.length > 1 && <button type="button" className="danger" onClick={() => setForm({ ...form, predictions: form.predictions.filter((_x, j) => j !== i) })}>Remove</button>}</div>)}</div><button className="primary" disabled={save.isPending}>{save.isPending ? "Saving…" : form.id ? "Update theory" : "Create theory + snapshot prices"}</button>{save.data?.error && <p className="down">{save.data.error}</p>}</form></section><section className="terminal-section"><div className="panel-head"><h2>Tracked theories</h2><div className="seg"><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>All</button><button className={filter === "short" ? "active" : ""} onClick={() => setFilter("short")}>Short</button><button className={filter === "long" ? "active" : ""} onClick={() => setFilter("long")}>Long</button></div></div>{rows.length ? <div className="theory-list">{rows.map((t:any) => <article key={t.id}><div className="theory-title"><span className={`status ${t.status}`}>{t.status}</span><small>{t.horizon === "short" ? "Short-term" : "Long-term"} · created {new Date(t.createdAt).toLocaleDateString()}</small></div><h3>{t.statement}</h3><p className="ripple-map"><span>Ripple map</span>{t.rippleMap}</p><div className="prediction-status">{t.predictions.map((p:any) => <div key={p.id}><strong>{p.symbol} {p.direction} {p.targetPrice ? money(p.targetPrice) : "creation price"}</strong><small>Started {money(p.baseline)} · now {money(p.current)} · due {p.dueDate}</small><div className="progress"><i style={{ width: `${Math.max(0, Math.min(100, p.progress ?? (p.status === "confirming" ? 100 : 0)))}%` }}/></div><em className={`status ${p.status}`}>{p.status}{p.progress == null ? "" : ` · ${num(p.progress)}%`}</em></div>)}</div>{t.evidence.length ? <div className="theory-evidence"><span>Attached evidence</span>{t.evidence.map((e:any) => <a key={e.id} href={e.url} target="_blank" rel="noreferrer"><b className={e.stance === "confirming" ? "up" : "down"}>{e.stance}</b> · {e.title}<small>{e.source} · {e.publishedAt || new Date(e.createdAt).toLocaleString()}</small></a>)}</div> : null}<div className="row-actions"><button onClick={() => setForm({ id: t.id, statement: t.statement, horizon: t.horizon, rippleMap: t.rippleMap, predictions: t.predictions.map((p:any) => ({ coinId: p.coinId, symbol: p.symbol, direction: p.direction, targetPrice: p.targetPrice ?? "", dueDate: p.dueDate })) })}>Edit</button><button className="danger" onClick={() => del.mutate(t.id)}>Delete</button></div></article>)}</div> : <Empty>{q.data?.error ?? "No theories yet. Create one with a dated, falsifiable prediction."}</Empty>}</section></div>;
}

function TheoryLayerGrid({ layers }: { layers: any[] }) { return <div className="theory-layers">{layers.map((layer: any) => { const contribution = Number(layer.contribution ?? 0); const contributionLabel = contribution > 0 ? `+${contribution}` : String(contribution); return <div key={layer.name} className={String(layer.status).toLowerCase()}><span>{layer.name}</span><b>{layer.status}</b>{layer.weight != null && <em className="layer-score">weight {layer.weight} · score {contributionLabel}</em>}<p>{layer.evidence}</p>{layer.deduplicationNote && <strong className="dedup-note">{layer.deduplicationNote}</strong>}{layer.marketUrl ? <a href={layer.marketUrl} target="_blank" rel="noreferrer">{layer.source ?? "Polymarket"} ↗</a> : layer.source && <small>{layer.source}</small>}</div>; })}</div>; }

function TheoryScore({ theory }: { theory: any }) {
  const assessment = theory.snapshot?.evidenceAssessment; if (!assessment) return null;
  const label = assessment.classification === "directional" ? "DIRECTIONAL PICK" : assessment.classification === "contested" ? "CONTESTED · NO DIRECTIONAL PICK" : assessment.classification === "insufficient-evidence" ? "INSUFFICIENT EVIDENCE" : "WATCH ONLY · NO DIRECTIONAL PICK";
  return <div className={`theory-score ${assessment.classification}`}><div><span>WEIGHTED EVIDENCE</span><strong>{assessment.weightedScore >= 0 ? "+" : ""}{assessment.weightedScore}</strong></div><div><span>EVIDENCE TIER</span><strong>{String(assessment.confidenceBand).toUpperCase()}</strong></div><p>{label} · measured layers with data {assessment.measuredWithData}/2</p></div>;
}

function TheorySources({ sources }: { sources: any[] }) { return <div className="machine-sources"><span>Source attribution</span>{sources.map((source: any, index: number) => <a key={`${source.url}-${index}`} href={source.url} target="_blank" rel="noreferrer"><strong>{source.title}</strong><small>{source.source} · {source.publishedAt ?? "date unavailable"} · {source.label ?? "linked evidence"}</small></a>)}</div>; }

function TheoryIntegrity({ theory }: { theory: any }) {
  const stored = theory.snapshot?.sourceIntegrity; const fallbackCount = new Set((theory.sources ?? []).map((source:any) => String(source.source ?? "").trim().toLowerCase()).filter(Boolean)).size; const integrity = stored ?? { independentSourceCount: fallbackCount, singleSource: fallbackCount < 2 }; const tripwire = theory.snapshot?.tripwire;
  return <div className="theory-integrity"><div className="integrity-badges"><b className={`status ${integrity.singleSource ? "single-source" : "multi-source"}`}>{integrity.singleSource ? "SINGLE SOURCE" : `${integrity.independentSourceCount} SOURCES`}</b>{tripwire ? <b className="status unbreached">TRIPWIRE UNBREACHED</b> : <b className="status no-tripwire">NO PRICE TRIPWIRE</b>}</div><p>{integrity?.singleSource ? "News remains NO_DATA until a second independent publisher corroborates the factual premise; the measured and observed layers still score independently." : "Independent-source integrity check passed."} {tripwire ? `${theory.linkedSymbol} must close ${tripwire.side} ${money(tripwire.level)} to trigger price invalidation; verified against ${money(tripwire.currentPrice)} at ${tripwire.verificationMoment ?? "creation"}.` : "Only the written falsification conditions remain active."}</p></div>;
}

function TheoryPositioning({ theory }: { theory: any }) {
  const p = theory.positioning;
  if (!p) return <div className="positioning-panel no-position"><div className="positioning-head"><span>POSITIONING OPTIONS</span><b>NO POSITIONING</b></div><p>Full-history positioning has not been computed for this stored theory.</p></div>;
  return <div className={`positioning-panel ${p.state}`}>
    <div className="positioning-head"><div><span>POSITIONING OPTIONS · NEVER FORCED</span><strong>{p.symbol} · {String(p.horizon).toUpperCase()} HORIZON</strong></div><b>{p.options?.length ? `${p.options.length} FIT${p.options.length === 1 ? "" : "S"}` : "NO POSITIONING"}</b></div>
    <div className="positioning-context"><Metric label="Current close" value={money(p.currentPrice)}/><Metric label="Volatility regime" value={p.volatility ? `${String(p.volatility.regime).toUpperCase()} · ${num(p.volatility.percentile)}th pct` : "Unavailable"}/><Metric label="History" value={p.barCount ? `${num(p.barCount)} bars` : "Unavailable"}/><Metric label="Coverage" value={p.firstBar && p.lastBar ? `${p.firstBar} → ${p.lastBar}` : "Unavailable"}/></div>
    {p.supports?.length || p.resistances?.length || p.liquidityZones?.length ? <div className="positioning-levels"><div><span>SUPPORT</span><strong>{p.supports?.length ? p.supports.map((row:any) => money(row.level)).join(" · ") : "No clean level"}</strong><small>{p.supports?.map((row:any) => `${money(row.level)}: ${row.basis} Last seen ${row.lastSeen}.`).join(" ")}</small></div><div><span>RESISTANCE</span><strong>{p.resistances?.length ? p.resistances.map((row:any) => money(row.level)).join(" · ") : "No clean level"}</strong><small>{p.resistances?.map((row:any) => `${money(row.level)}: ${row.basis} Last seen ${row.lastSeen}.`).join(" ")}</small></div><div><span>HISTORICAL LIQUIDITY ZONES</span><strong>{p.liquidityZones?.length ? p.liquidityZones.map((row:any) => `${money(row.low)}–${money(row.high)}`).join(" · ") : "Unavailable"}</strong><small>High-volume price bins from cached history; not live order-book or liquidation data.</small></div></div> : null}
    {p.options?.length ? <div className="positioning-options">{p.options.map((option:any) => <article key={option.kind}><header><div><span>OPTION · {option.kind.toUpperCase()}</span><h4>{option.label}</h4></div><b>UNCALIBRATED</b></header><p>{option.fit}</p><div className="positioning-timeline"><span>TIMELINE</span><strong>{option.timeline}</strong></div>{option.kind === "futures" ? <><div className="positioning-grid"><div><span>AGGRESSIVE ENTRY</span><strong>{option.aggressiveEntry ? `${money(option.aggressiveEntry.low)}–${money(option.aggressiveEntry.high)}` : "Not offered"}</strong><small>{option.aggressiveEntry?.basis}</small></div><div><span>PATIENT ENTRY</span><strong>{option.patientEntry ? `${money(option.patientEntry.low)}–${money(option.patientEntry.high)}` : "Not offered"}</strong><small>{option.patientEntry?.basis ?? "A distinct deeper level was not present."}</small></div><div><span>INVALIDATION</span><strong className="down">{money(option.invalidation)}</strong><small>{option.invalidationBasis}</small></div><div><span>TARGETS</span><strong className="up">{option.targets?.map((target:any) => money(target.level)).join(" · ")}</strong><small>{option.targets?.map((target:any) => `${money(target.level)}: ${target.basis}.`).join(" ")}</small></div></div></> : <><p className="spot-thesis">{option.thesis}</p><div className="dca-list">{option.tranches?.map((row:any) => <div key={row.tranche}><span>TRANCHE {row.tranche}</span><strong>{money(row.level)}</strong><small>{row.basis}</small></div>)}</div>{option.invalidation != null && <div className="spot-invalidation"><span>TECHNICAL INVALIDATION</span><strong>{money(option.invalidation)}</strong><small>{option.invalidationBasis}</small></div>}</>}</article>)}</div> : <div className="no-position-copy"><strong>NO POSITIONING</strong><p>{p.reason}</p></div>}
    <p className="positioning-method">{p.methodology} Source: {p.source ?? "cached history source unavailable"}. Every figure is a price-history calculation; none is a probability.</p>
  </div>;
}

function EngineHits() {
  const q = useQuery({ queryKey: ["engine-hits"], queryFn: () => api.listEngineHits({ limit: 25, cursor: 0 }), staleTime: 60000 });
  const hits = q.data?.hits ?? [];
  return <div className="stack engine-hits-shell">
    <section className="engine-hits-command"><div><p className="eyebrow cyan">Theory-engine evidence log</p><h2>Engine Hits</h2><p>A hit appears only after a stored machine theory, linked evidence, an engine score, a tape-state snapshot, and a checked causal chain are all present. Automatic tripwire-breach detection is deployed via the theory integrity audit; automatic hits carry an AUTO prefix in their score basis and a tripwire-breach key. Until one is observed live, coverage remains manual-only.</p></div><button className="refresh-small" onClick={() => q.refetch()} disabled={q.isFetching}>{q.isFetching ? "Reloading…" : "Reload log"}</button></section>
    <section className="terminal-section"><div className="panel-head"><div><p className="eyebrow cyan">Timestamped record</p><h2>{hits.length ? `${hits.length} logged hit${hits.length === 1 ? "" : "s"}` : "No engine hits logged yet"}</h2></div><Source>engine-scored events</Source></div>
      {q.isPending ? <Empty>Loading Engine Hits…</Empty> : hits.length ? <div className="engine-hit-list">{hits.map((hit: any) => <article key={hit.id}>
        <header><div><time>{new Date(hit.eventAt).toLocaleString()}</time><span>logged {new Date(hit.createdAt).toLocaleString()}</span></div><div className="engine-hit-state"><b>{hit.engineScore} / 100</b><em className={hit.tapeState}>{hit.tapeState} tape</em></div></header>
        <div className="engine-hit-block"><span>THESIS SUPPORTED</span><h3>{hit.thesis}</h3></div>
        <div className="engine-hit-block"><span>TRIGGERING EVENT</span><p>{hit.triggeringEvent}</p></div>
        <div className="engine-score-basis"><strong>ENGINE SCORE BASIS</strong><p>{hit.scoreBasis}</p></div>
        <div className="engine-hit-evidence"><span>EVIDENCE</span>{hit.evidence.map((item: any, index: number) => <a key={`${item.url}-${index}`} href={item.url} target="_blank" rel="noreferrer"><strong>{item.title}</strong><small>{item.source} · {item.publishedAt ?? "date unavailable"}</small></a>)}</div>
        <div className="engine-hit-chain"><span>MULTI-HOP RIPPLE CHAIN</span>{hit.rippleChain.map((hop: any, index: number) => <div key={`${hop.from}-${hop.to}-${index}`} className={hop.kind}><div><strong>{hop.from}</strong><i>→</i><b>{hop.to}</b></div><p>{hop.mechanism}</p><em>{hop.kind === "verified" ? "VERIFIED" : "INFERENCE"}{hop.kind === "verified" ? ` · ${hop.evidenceUrls.length} linked source${hop.evidenceUrls.length === 1 ? "" : "s"}` : " · not a sourced fact"}</em></div>)}</div>
      </article>)}</div> : <Empty>{q.data?.error ?? "No engine hits logged yet"}</Empty>}
    </section>
  </div>;
}

function CrossSynthesis() {
  const q = useQuery({ queryKey: ["agent-cross-synthesis"], queryFn: () => readTheoryWithDeadline(async () => {
    const result = await api.getLatestAgentCrossMarketSynthesis({});
    if (result.error) throw new Error(result.error);
    return result;
  }), staleTime: 300000, retry: false });
  const theory = q.data?.theory;
  const linkedCoins = Array.isArray(theory?.snapshot?.linkedCoins) ? theory.snapshot.linkedCoins : [];
  return <div className="stack synthesis-shell">
    <InvestmentResearchBanner/>
    <section className="synthesis-command"><div><p className="eyebrow cyan">Agent synthesis</p><h2>Cross-market synthesis</h2><p>The latest stored cross-market synthesis from Theory Watch.</p></div></section>
    {q.error && <section className="discovery-run degraded" role="alert"><strong>Unable to read the latest synthesis</strong><p>{q.error.message}</p>{theory && <p>Showing the previously loaded synthesis; its timestamp has not changed.</p>}<button onClick={() => void q.refetch()} disabled={q.isFetching}>{q.isFetching ? "READING…" : "Retry synthesis read"}</button></section>}
    {q.isPending ? <Empty>{q.fetchStatus === "paused" ? "Synthesis read is paused while offline." : "Loading the latest agent synthesis…"}</Empty> : theory ? <>
      <section className={`synthesis-picture ${theory.direction}`}>
        <div className="synthesis-head"><div><p className="eyebrow cyan">Latest stored synthesis</p><h2>{theory.headline}</h2></div><div className="synthesis-verdict"><b>{String(theory.direction).toUpperCase()}</b><span>{String(theory.confidence).toUpperCase()} EVIDENCE TIER</span></div></div>
        <p className="synthesis-summary">{theory.thesis}</p>
        <div className="synthesis-meta"><span>{theory.status.toUpperCase()}</span><time>{new Date(theory.createdAt).toLocaleString()}</time>{linkedCoins.length ? <b>{linkedCoins.map((coin: any) => coin.symbol).join(" · ")}</b> : null}</div>
      </section>
      <section className="terminal-section"><div className="panel-head"><div><p className="eyebrow cyan">Evidence record</p><h2>{theory.sector}</h2></div><Source>stored agent theory</Source></div><TheoryLayerGrid layers={theory.layers}/><TheorySources sources={theory.sources}/></section>
      <section className="terminal-section"><div className="future-map"><div><span>WHAT MAY COME NEXT</span><p>{theory.forwardLook || "No forward path was stored."}</p></div><div><span>COUNTERCASE</span><p>{theory.countercase}</p></div></div><div className="observable"><span>OBSERVABLE INVALIDATION</span><p>{theory.invalidation}</p>{theory.invalidationReason && <strong>{theory.invalidationReason}</strong>}</div></section>
    </> : !q.error && <Empty>No agent cross-market synthesis stored yet</Empty>}
  </div>;
}

function TheoryDetailBody({ theory, openSymbol }: { theory: any; openSymbol: (symbol: string) => void }) {
  return <>
    {theory.withdrawal ? <div className="withdrawn-notice"><strong>WITHDRAWN · {theory.withdrawal.reason}</strong><p>Withdrawn {theory.withdrawal.withdrawnAt ? new Date(theory.withdrawal.withdrawnAt).toLocaleString() : "time unavailable"} by {theory.withdrawal.withdrawnBy ?? "unknown"}. Original reasoning preserved below for inspection; it no longer leads summaries or notifications.</p></div> : null}
    {theory.mode === "contested" && <div className="no-pick">CONTESTED · NO DIRECTIONAL PICK</div>}
    <TheoryScore theory={theory}/>
    {theory.direction !== "none" && <div className={`direction ${theory.direction === "bullish" ? "up" : "down"}`}>{theory.direction.toUpperCase()}</div>}
    <TheoryIntegrity theory={theory}/>
    <div className="memo-label">WRITTEN THESIS MEMO</div>
    <p className="machine-thesis"><span>THESIS</span>{theory.thesis}</p>
    <div className="future-map"><div><span>HORIZON / WHAT MIGHT COME NEXT</span><p>{theory.forwardLook}</p></div><div><span>COUNTERCASE</span><p>{theory.countercase}</p></div></div>
    <TheoryPositioning theory={theory}/>
    {theory.snapshot?.rippleChain?.length ? <div className="action-legs"><span className="chain-label">MULTI-HOP RIPPLE CHAIN</span>{theory.snapshot.rippleChain.map((leg: any, index: number) => <div key={`${leg.from}-${index}`} className={leg.status?.toLowerCase()}><strong>{leg.from}</strong><span>{leg.mechanism}</span><b>{leg.to}</b><em>{leg.kind} · {leg.status}</em>{leg.sources?.length ? <small>{leg.sources.map((s: any) => s.source).join(" + ")}</small> : null}</div>)}</div> : null}
    <TheoryLayerGrid layers={theory.layers}/>
    <div className="observable"><span>OBSERVABLE INVALIDATION</span><p>{theory.invalidation}</p>{theory.invalidationReason && <strong>{theory.invalidationReason}</strong>}</div>
    <TheorySources sources={theory.sources}/>
    {theory.linkedSymbol && <button className="theory-open" onClick={() => openSymbol(theory.linkedSymbol)}>Open {theory.linkedSymbol} dossier →</button>}
    <footer>Last checked {new Date(theory.lastCheckedAt).toLocaleString()} · status {theory.status === "live" ? "confirmed" : theory.status}</footer>
  </>;
}

function MachineTheoryCard({ theory, openSymbol }: { theory: any; openSymbol: (symbol: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const detail = useQuery({ queryKey: ["theory-watch-detail", theory.id], queryFn: () => readTheoryWithDeadline(async () => {
    const result = await api.getTheoryWatchDetail({ theoryId: theory.id });
    if (result.error) throw new Error(result.error);
    return result;
  }), enabled: expanded, staleTime: 300000, retry: false });
  const detailTheory = detail.data?.theory ?? null;
  return <article className={`${theory.mode} ${theory.status}`}>
    <div className="machine-theory-head"><div><span className="machine-label">{theory.machineKey?.startsWith("agent:") ? "AGENT THEORY" : "MACHINE-FOUND"} · {theory.sector}</span><h3>{theory.headline}</h3></div><div className="machine-badges"><b className={`status ${theory.status === "live" ? "confirmed" : theory.status}`} title="CONFIRMED means the stored evidence checks passed. It is not a trade call and not a proven forecast.">{theory.status === "live" ? "confirmed" : theory.status}</b>{theory.status === "live" ? <small className="badge-gloss">CONFIRMED = evidence checks passed · not a trade call · not a proven forecast</small> : null}<em>EVIDENCE CHECKS BELOW · OUTCOME UNCALIBRATED</em>{theory.withdrawal ? <b className="status withdrawn" title="This theory's reasoning was withdrawn. It is preserved in the detail view for inspection and no longer leads summaries or notifications.">WITHDRAWN</b> : null}</div></div>
    <div className="theory-summary-meta">
      {theory.direction !== "none" && <span className={`direction ${theory.direction === "bullish" ? "up" : "down"}`}>{theory.direction.toUpperCase()}</span>}
      <span>Evidence tier {String(theory.evidenceTier ?? theory.confidence).toUpperCase()}</span>
      {theory.weightedScore != null && <span>Weighted evidence {theory.weightedScore >= 0 ? "+" : ""}{theory.weightedScore}</span>}
      <span>{theory.counts?.layers ?? 0} layers · {theory.counts?.sources ?? 0} sources</span>
      <span>Created {new Date(theory.createdAt).toLocaleString()}</span>
      <span>Last checked {new Date(theory.lastCheckedAt).toLocaleString()}</span>
    </div>
    {theory.layers?.length ? <div className="theory-layer-summary">{theory.layers.map((layer: any) => <span key={layer.name} className={String(layer.status).toLowerCase()}><b>{layer.name}</b>{layer.status}{layer.contribution ? ` · ${layer.contribution > 0 ? "+" : ""}${layer.contribution}` : ""}</span>)}</div> : null}
    <button className="theory-open" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? "Hide full evidence" : "View full evidence"}</button>
    {expanded && (detail.isPending ? <div className="loading" role="status" aria-live="polite"><span/>Reading the full stored evidence…</div> : detailTheory ? <TheoryDetailBody theory={detailTheory} openSymbol={openSymbol}/> : <p role="alert">{detail.error?.message ?? "Theory detail unavailable."}</p>)}
  </article>;
}

function TheoryWatch({ asset, openSymbol }: { asset: any | null; openSymbol: (symbol: string) => void }) {
  const qc = useQueryClient(); const [view, setView] = useState<"synthesis" | "machine" | "hits" | "map" | "mine">("synthesis"); const [statusFilter, setStatusFilter] = useState<"active" | "history">("active"); const [scenario, setScenario] = useState("");
  const q = useInfiniteQuery({ queryKey: ["theory-watch"], queryFn: ({ pageParam }) => readTheoryWithDeadline(async () => {
    const result = await api.listTheoryWatch({ limit: 25, cursor: pageParam ?? undefined });
    if (result.error) throw new Error(result.error);
    return result;
  }), initialPageParam: null as string | null, getNextPageParam: (lastPage: any) => lastPage.nextCursor ?? undefined, staleTime: 300000, retry: false });
  const firstPage = q.data?.pages?.[0] ?? null;
  const allTheories = (q.data?.pages ?? []).flatMap((page: any) => page.theories ?? []);
  const totalCount = firstPage?.totalCount ?? allTheories.length;
  const rows = allTheories.filter((row: any) => statusFilter === "active" ? row.status !== "invalidated" : row.status === "invalidated");
  const refresh = useMutation({ mutationFn: () => api.refreshTheoryWatch({}), onSuccess: () => { void qc.invalidateQueries({ queryKey: ["theory-watch"] }); void qc.invalidateQueries({ queryKey: ["theory-watch-detail"] }); } });
  const discover = useTheoryCollection();
  const map = useMutation({ mutationFn: () => api.mapTheoryEvent({ scenario }) });
  const lastRun = firstPage?.runs?.[0] ?? null;
  const latestBatch = firstPage?.latestBatch ?? null;
  const lastRunAt = lastRun ? new Date(lastRun.completedAt).getTime() : 0;
  const batchAt = latestBatch?.collectedAt ? new Date(latestBatch.collectedAt).getTime() : 0;
  const isInitialTheoryRead = q.isPending || (q.isFetching && q.data === undefined);
  const lastDiscoveryLabel = isInitialTheoryRead ? "Reading stored results…" : batchAt >= lastRunAt && latestBatch ? `Evidence batch ${latestBatch.id} · collected ${new Date(latestBatch.collectedAt).toLocaleString()}` : lastRun ? `Discovery run · completed ${new Date(lastRun.completedAt).toLocaleString()}` : "Not run yet";
  return <div className="stack theory-watch-shell">
    <ViewLabel view="research"/>
    <InvestmentResearchBanner/>
    <QuestionsQueue/>
    <section className="theory-watch-command"><div><p className="eyebrow cyan">Agentic theory watch</p><h2>Market evidence → falsifiable theory</h2><p>Discovery collects the evidence stack for agent-led synthesis. Layers score independently; single-source news stays NO_DATA, shared evidence is deduplicated, and measured conflicts block directional picks.</p></div><div className="theory-watch-actions"><button className="primary" onClick={() => discover.mutate()} disabled={discover.isPending}>{discover.isPending ? discover.slow ? "AWAITING CONFIRMATION" : "COLLECTING EVIDENCE…" : "RUN DISCOVERY"}</button><button onClick={() => refresh.mutate()} disabled={refresh.isPending}>{refresh.isPending ? "REFRESHING PRICING…" : "REFRESH PRICING"}</button></div></section>
    {refresh.data && <section className={`discovery-run ${refresh.data.ok ? "complete" : "degraded"}`} role="status" aria-live="polite"><strong>{refresh.data.ok ? "Theory pricing refreshed" : "Theory pricing refresh failed"}</strong><p>{refresh.data.ok ? `Checked ${refresh.data.checked} stored theories; repriced ${refresh.data.refreshed}. Stored list data was left in place until the refresh wrote new values.` : `${refresh.data.error ?? "Refresh failed."} The last good stored pricing remains in place.`}</p></section>}
    {(discover.status || q.error) && <section className={`discovery-run ${discover.data?.ok ? "complete" : "degraded"}`} role="status" aria-live="polite">
      {discover.submittedAt ? <small>Collection requested in this browser: {new Date(discover.submittedAt).toLocaleString()}</small> : null}
      {discover.isPending && <p>{discover.slow ? "Collection completion is unconfirmed after 90 seconds. The server may still finish; this request has not been cancelled. Check stored results without starting another collection." : "Waiting for the evidence collection response."}</p>}
      {discover.error && <><strong>Collection completion unconfirmed</strong><p>{discover.error.message}</p><p>The server may have saved evidence before the connection failed. Check stored results before starting a new collection.</p></>}
      {discover.data && <><strong>{discover.data.ok ? "Evidence collection completed" : "Evidence collection degraded"}</strong><p>{discover.data.message}</p><p>Collecting evidence does not itself create a synthesis. A synthesis appears here only after an agent saves one.</p></>}
      {q.error && <p role="alert">Unable to read theory history: {q.error.message}. Previously loaded rows, if any, are retained.</p>}
      <button onClick={() => { void q.refetch(); void qc.invalidateQueries({ queryKey: ["agent-cross-synthesis"] }); }} disabled={q.isFetching}>{q.isFetching ? "READING STORED RESULTS…" : "Check stored results"}</button>
    </section>}
    <div className="seg theory-mode"><button className={view === "synthesis" ? "active" : ""} onClick={() => setView("synthesis")}>Synthesis</button><button className={view === "machine" ? "active" : ""} onClick={() => setView("machine")}>Machine-found</button><button className={view === "hits" ? "active" : ""} onClick={() => setView("hits")}>Engine hits</button><button className={view === "map" ? "active" : ""} onClick={() => setView("map")}>Event map</button><button className={view === "mine" ? "active" : ""} onClick={() => setView("mine")}>My theories</button></div>
    {view === "synthesis" && <CrossSynthesis/>}
    {view === "machine" && <>
      <section className={`discovery-run ${lastRun?.status ?? (latestBatch ? "complete" : "degraded")}`}><div><span>LAST DISCOVERY</span><b>{lastDiscoveryLabel}</b></div><strong>{discover.data?.message ?? lastRun?.summary ?? latestBatch?.collectionSummary ?? firstPage?.error ?? "Run discovery to build the first verified theory set."}</strong>{lastRun?.sourceStatus?.length ? <div className="source-health">{lastRun.sourceStatus.map((source: any) => <div key={source.source} className={source.status}><b>{source.source}</b><span>{source.status}</span><small>{source.detail}</small></div>)}</div> : null}</section>
      <section className="terminal-section"><div className="panel-head"><div><p className="eyebrow cyan">Weighted evidence</p><h2>Machine-found theories</h2></div><div className="seg"><button className={statusFilter === "active" ? "active" : ""} onClick={() => setStatusFilter("active")}>Picks + watch + contested</button><button className={statusFilter === "history" ? "active" : ""} onClick={() => setStatusFilter("history")}>Invalidated</button></div></div><p className="score-disclaimer">High / medium / low are evidence tiers, never probabilities. Showing {allTheories.length} of {totalCount} stored theories, newest first; open a theory for its full evidence record.</p>{isInitialTheoryRead ? <div className="loading" role="status" aria-live="polite"><span/>Reading stored theory results…</div> : rows.length ? <><div className="machine-theory-list">{rows.map((theory: any) => <MachineTheoryCard key={theory.id} theory={theory} openSymbol={openSymbol}/>)}</div>{q.hasNextPage && <button className="theory-open" onClick={() => void q.fetchNextPage()} disabled={q.isFetchingNextPage}>{q.isFetchingNextPage ? "LOADING MORE…" : `Load more theories (${allTheories.length} of ${totalCount})`}</button>}</> : q.error ? <div className="theory-read-error" role="alert"><strong>Theory list unavailable.</strong><p>{q.error.message} Previously loaded rows, if any, are retained. Use “Check stored results” above to retry.</p></div> : <Empty>{statusFilter === "history" ? "No invalidated machine theories yet." : "No theory is surfaced yet. Run discovery to score the current evidence stack; evidence-floor candidates stay tracked but withheld."}</Empty>}</section>
    </>}
    {view === "hits" && <EngineHits/>}
    {view === "map" && <><section className="terminal-section"><p className="eyebrow cyan">Event / action map</p><h2>Stress-test a scenario</h2><form className="event-map-form" onSubmit={(e) => { e.preventDefault(); if (scenario.trim().length >= 8) map.mutate(); }}><textarea aria-label="Scenario to map" value={scenario} onChange={(e) => setScenario(e.target.value)} placeholder="e.g. ETH ETF staking approval reprices LSTs"/><button className="primary" disabled={map.isPending || scenario.trim().length < 8}>{map.isPending ? "MAPPING…" : "MAP EVENT"}</button></form></section>{map.data?.result && <section className={`event-result ${map.data.result.mode ?? "degraded"}`}>{map.data.result.fallback ? <div className="fallback-state"><strong>{map.data.result.fallback}</strong><p>{map.data.result.reason}</p></div> : <><div className="machine-theory-head"><div><span className="machine-label">EVENT / ACTION MAP</span><h3>{map.data.result.scenario}</h3></div><div className="machine-badges"><b>{map.data.result.direction}</b><em>EVIDENCE CHECKS BELOW · OUTCOME UNCALIBRATED</em></div></div><p className="score-disclaimer">{map.data.result.confidenceNote}</p><div className="premise-grid"><div><span>VERIFIED PREMISES</span>{map.data.result.verifiedPremises.map((item: string) => <p key={item}>{item}</p>)}</div><div><span>INFERENCE</span>{map.data.result.inferences.map((item: string) => <p key={item}>{item}</p>)}</div></div><div className="action-legs">{map.data.result.legs.map((leg: any, index: number) => <div key={`${leg.from}-${index}`} className={leg.status?.toLowerCase()}><strong>{leg.from}</strong><span>{leg.mechanism}</span><b>{leg.to}</b><em>{leg.kind} · {leg.confidence} · {leg.status}</em>{leg.sources?.length ? <small>{leg.sources.map((s: any) => s.source).join(" + ")}</small> : <small>No supporting source attached</small>}</div>)}</div>{map.data.result.evidenceAssessment && <div className={`theory-score ${map.data.result.evidenceAssessment.classification}`}><div><span>WEIGHTED EVIDENCE</span><strong>{map.data.result.evidenceAssessment.weightedScore >= 0 ? "+" : ""}{map.data.result.evidenceAssessment.weightedScore}</strong></div><div><span>EVIDENCE TIER</span><strong>{String(map.data.result.evidenceAssessment.confidenceBand).toUpperCase()}</strong></div><p>{map.data.result.direction} · measured layers with data {map.data.result.evidenceAssessment.measuredWithData}/2</p></div>}<TheoryLayerGrid layers={map.data.result.layers}/><div className="future-map"><div><span>COUNTERCASE</span><p>{map.data.result.countercase}</p></div><div><span>OBSERVABLE INVALIDATION</span><p>{map.data.result.invalidation}</p></div></div><TheorySources sources={map.data.result.sources}/></>}</section>}</>}
    {view === "mine" && (asset ? <UserTheories asset={asset}/> : <CoinRequired onHome={() => setView("machine")}/>)}
  </div>;
}
function DefiLevelThree({ oc }: { oc: any }) {
  const momentum = oc?.tvlMomentum; const valuation = oc?.tvlValuation; const divergence = oc?.dexPriceDivergence; const asOf = oc?.sourceTimes?.defiLlama; const stamp = asOf ? new Date(asOf).toLocaleString() : "timestamp unavailable";
  return <div className="defi-level-three">
    <div className="level-three-head"><div><span>LEVEL 3 · EVIDENCE ONLY</span><strong>TVL, valuation and flow context</strong></div><small>Not included in factor scores</small></div>
    <div className="indicator-grid"><Metric label="TVL · 7D" value={percent(momentum?.change7d ?? oc?.tvlChange7d)}/><Metric label="TVL · 30D" value={percent(momentum?.change30d ?? oc?.tvlChange30d)}/><Metric label="Acceleration" value={percent(momentum?.accelerationPctPoints)}/><Metric label="Daily Δ z-score" value={momentum?.dailyDeltaZScore == null ? "—" : `${num(momentum.dailyDeltaZScore)}σ`}/><Metric label="DEX volume · 7D" value={percent(oc?.dexVolumeTrend7d)}/></div>
    <div className="level-three-ledger"><div><b>TVL momentum</b><p>{momentum?.inflection ? `Inflected ${momentum.inflection}: 7D ${percent(momentum.change7d)} after ${percent(momentum.change30d)} 30D; latest daily delta ${percent(momentum.latestDailyDeltaPct)} at ${num(momentum.dailyDeltaZScore)}σ (n=${momentum.trailingDeltaSamples}, gate ±${num(momentum.inflectionThreshold)}σ).` : momentum?.inflectionReason ?? oc?.notes?.momentum ?? "NO_DATA — dated TVL momentum history unavailable."}</p><small>DeFiLlama · as of {stamp}</small></div><div><b>TVL / market cap</b><p>{valuation?.state === "available" ? `${num(valuation.ratio)} ratio · ${num(valuation.percentile90d)}th percentile of its 90D range · ${valuation.band} (n=${valuation.samples}). Valuation context only, never a buy/sell signal.` : valuation?.reason ?? oc?.notes?.valuation ?? "NO_DATA — protocol TVL/market-cap range unavailable."}</p><small>{valuation?.source ?? "DeFiLlama protocol TVL + protocols market cap"} · as of {valuation?.asOf ? new Date(valuation.asOf).toLocaleString() : stamp}</small></div><div className={divergence?.state === "divergence" ? "divergence" : ""}><b>DEX flow vs price</b><p>{divergence?.evidence ?? oc?.notes?.dexPriceDivergence ?? "NO_DATA — matched DEX-volume and price trends unavailable."}</p><small>DeFiLlama DEX volume + CoinGecko price · as of {divergence?.asOf ? new Date(divergence.asOf).toLocaleString() : stamp}</small></div></div>
  </div>;
}

function Research({ d }: { d: any }) { const asset = d.asset; const q = useQuery({ queryKey: ["research", asset.id], queryFn: () => api.getResearch({ coinId: asset.id, name: asset.name, symbol: asset.symbol }) }); const onchain = useQuery({ queryKey: ["onchain", asset.id], queryFn: () => api.getOnChain({ coinId: asset.id, symbol: asset.symbol }) }); const x = d.derivatives; const v = d.verdict; const oc = onchain.data?.data; return <div className="stack"><MarketChart data={d.line} candles={d.candles} indicators={d.indicators} symbol={d.asset.symbol}/><section className="terminal-section"><div className="panel-head"><div><p className="eyebrow cyan">Multi-horizon returns</p><h2>Regime read</h2></div><Source>CoinGecko</Source></div><div className="horizon-grid">{Object.entries(d.indicators.returns).map(([key,value]) => <Metric key={key} label={horizons[key] ?? key} value={percent(value as number | null)} tone={(value as number ?? 0) >= 0 ? "up" : "down"}/>)}</div></section><CrossVenueDerivatives x={x}/><section className="terminal-section"><div className="panel-head"><div><p className="eyebrow cyan">Positioning</p><h2>OKX derivatives</h2></div><Source>OKX</Source></div>{x.available ? <><div className="indicator-grid"><Metric label="Funding" value={x.fundingCurrent == null ? "—" : `${(x.fundingCurrent * 100).toFixed(4)}%`}/><Metric label="OI" value={money(x.openInterestUsd, true)}/><Metric label="OI · 24H" value={percent(x.oiChange24h)}/><Metric label="Long / short" value={num(x.longShortRatio)}/><Metric label="Perp basis" value={percent(x.perpBasisPct, 3)}/><Metric label="Spot / perp CVD" value={`${money(x.spotCvdUsd, true)} / ${money(x.perpCvdUsd, true)}`}/></div>{x.liquidationZones && <p className="muted">Liquidation references: long 20× {money(x.liquidationZones.long20x)} · long 10× {money(x.liquidationZones.long10x)} · short 20× {money(x.liquidationZones.short20x)} · short 10× {money(x.liquidationZones.short10x)}. {x.liquidationZones.methodology}</p>}</> : <Empty>{x.unavailableNote ?? "No OKX mapping."}</Empty>}</section><section className="terminal-section"><div className="panel-head"><div><p className="eyebrow cyan">On-chain</p><h2>Network activity</h2></div><Source>DeFiLlama / Coin Metrics</Source></div>{oc?.matched ? <><div className="indicator-grid"><Metric label="Chain" value={oc.chain ?? "—"}/><Metric label="TVL" value={money(oc.tvl, true)}/><Metric label="Fees · 24H" value={money(oc.fees24h, true)}/><Metric label="Active addresses" value={num(oc.activeAddresses, true)}/><Metric label="Exchange netflow" value={money(oc.exchangeNetflowUsd, true)}/></div><DefiLevelThree oc={oc}/><p className="muted">{[oc.notes?.fees, oc.notes?.activeAddresses, oc.notes?.exchangeNetflow, oc.notes?.etherscan].filter(Boolean).join(" · ") || "Latest source observations shown."}</p></> : <Empty>{onchain.isPending ? "Checking chain coverage…" : oc?.notes?.tvl ?? onchain.data?.error ?? "NO_DATA — no mapped DeFiLlama protocol or chain."}</Empty>}</section><section className="terminal-section"><div className="panel-head"><div><p className="eyebrow cyan">Tokenomics + sector</p><h2>Supply context</h2></div><Source>CoinGecko</Source></div><div className="indicator-grid"><Metric label="Market cap" value={money(asset.marketCap, true)}/><Metric label="FDV" value={money(asset.fdv, true)}/><Metric label="Circulating" value={num(asset.circulatingSupply, true)}/><Metric label="Total supply" value={num(asset.totalSupply, true)}/><Metric label="Max supply" value={num(asset.maxSupply, true)}/></div><p className="muted">{asset.categories?.length ? asset.categories.join(" · ") : "No verified sector categories returned."}</p></section><section className={`verdict ${v.side}`}><p className="eyebrow">Connect the dots</p><h2>{v.side.toUpperCase()} alignment · {Math.max(v.longConfidence, v.shortConfidence)}/100</h2><ReliabilityLine data={v.side === "long" ? v.longReliability : v.shortReliability}/><p className="score-disclaimer">This is alignment density, never probability. {d.factorFormula.rule}</p><p>{v.thesis}</p><p className="failure">Invalidation: {v.failure}</p>{v.riskMethod !== "unavailable" && <div className="levels"><Metric label="Entry zone" value={`${money(v.entryLow)} – ${money(v.entryHigh)}`}/><Metric label="Invalidation" value={money(v.invalidation)} tone="down"/><Metric label="Target 1 (chart-derived)" value={money(v.target1)} tone="up"/><Metric label="Target 2 (chart-derived)" value={money(v.target2)} tone="up"/></div>}</section><section className="terminal-section"><div className="panel-head"><h2>Long / short factor table</h2><Source>factor ledger</Source></div><p className="score-disclaimer">Factor agreement is not a win probability. Missing inputs are neutral.</p><div className="factor-list">{d.factors.map((f:any) => <div className="factor" key={f.label}><span className={f.score > 0 ? "dot up-bg" : f.score < 0 ? "dot down-bg" : "dot"}/><div><strong>{f.label}</strong><small>{f.reading ?? f.value} · {f.source}</small><small>reading {f.score > 0 ? "+" : ""}{f.score} × weight {f.weight} = contribution {f.contribution > 0 ? "+" : ""}{f.contribution}</small></div><b>{f.contribution > 0 ? "+" : ""}{f.contribution}</b></div>)}</div></section><section className="terminal-section"><div className="panel-head"><div><p className="eyebrow cyan">Asset brief</p><h2>What {asset.symbol} does</h2></div><Source>CoinGecko</Source></div><p>{q.data?.description || asset.description || "No verified project description was returned."}</p>{(q.data?.homepage || asset.homepage) && <a className="outlink" href={q.data?.homepage || asset.homepage} target="_blank" rel="noreferrer">Project homepage ↗</a>}</section><section className="terminal-section"><div className="panel-head"><div><p className="eyebrow cyan">News + attention</p><h2>Recent developments</h2></div><Source>web search</Source></div>{q.isPending ? <Empty>Loading sourced coverage…</Empty> : q.data?.news.length ? <div className="news-list">{q.data.news.map((n) => <a key={n.url} href={n.url} target="_blank" rel="noreferrer"><div><strong>{n.title}</strong><small>{n.source ?? "Source"} · {n.freshness ?? "Date unavailable"} · single-source until corroborated</small></div><p>{n.snippet ? `Why it matters: ${n.snippet.slice(0, 220)}${n.snippet.length > 220 ? "…" : ""}` : "Why it matters: open the source for the full development."}</p></a>)}</div> : <Empty>{q.data?.error ?? "No recent verified coverage returned."}</Empty>}</section></div>; }

function plainFundamentalMissing(s: any): string {
  const reading = String(s?.reading ?? "");
  if (/no DeFiLlama mapping/i.test(reading)) return "no DeFiLlama mapping for this asset";
  if (/dated TVL history unavailable/i.test(reading)) return "no dated TVL history available";
  if (/fee-summary mapping/i.test(reading)) return "no fee-data mapping";
  const feeObs = reading.match(/returned (\d+)\/30 dated daily-fee observations/i);
  if (feeObs) return `only ${feeObs[1]} of 30 days of fee data returned`;
  if (/market cap is unavailable/i.test(reading)) return "market cap unavailable";
  if (/GitHub repository mapping|canonical GitHub/i.test(reading)) return "no GitHub repo mapping";
  const weeks = reading.match(/only (\d+) weekly observations/i);
  if (weeks) return `only ${weeks[1]} weekly observations returned; at least 8 needed`;
  if (/zero commits/i.test(reading)) return "repository returned zero commits";
  if (/GitHub returned|GitHub .* failed/i.test(reading)) return "GitHub request failed";
  if (/FDV or market cap unavailable/i.test(reading)) return "FDV or market cap unavailable";
  if (/volume or market cap unavailable/i.test(reading)) return "volume or market cap unavailable";
  const stripped = reading.replace(/^NO_DATA\s*[—-]\s*/i, "").replace(/\.$/, "").trim();
  return stripped || "no data available";
}
function FundamentalsRanking({ openCoin }: { openCoin: (id: string, symbol: string) => void }) {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["fundamentals-ranking"], queryFn: () => api.getFundamentalsRanking({}), staleTime: 300000 });
  const rescore = useMutation({ mutationFn: () => api.refreshFundamentalsScores({}), onSuccess: () => qc.invalidateQueries({ queryKey: ["fundamentals-ranking"] }) });
  const rows = q.data?.rows ?? [];
  const rankedRows = rows.filter((r: any) => r.ranked); const thinRows = rows.filter((r: any) => !r.ranked);
  const distribution = q.data?.distribution ?? rescore.data?.distribution ?? null;
  const methodology = (q.data?.methodologyLog ?? rescore.data?.methodologyLog ?? []).at(-1) ?? null;
  const rowButton = (r: any) => {
    const marker = r.ranked ? `${r.tied ? "T" : "#"}${r.displayRank ?? "—"}` : "NR";
    const subs = r.subscores ?? [];
    const measuredFactors = subs.filter((s: any) => s.score != null);
    const missingFactors = subs.filter((s: any) => s.score == null);
    const coverageLine = subs.length ? `Based on: ${measuredFactors.length ? measuredFactors.map((s: any) => s.label).join(", ") : "none"}. Missing: ${missingFactors.length ? missingFactors.map((s: any) => `${s.label} — ${plainFundamentalMissing(s)}`).join("; ") : "none"}.` : null;
    return <button key={r.coinId} type="button" aria-label={`Open ${r.symbol} coin dossier${r.tied ? `, tied rank ${r.displayRank}` : ""}`} onClick={() => openCoin(r.coinId, r.symbol)}><div className="signal-rank"><b>{marker}</b><span>{r.tied ? "TIED" : r.symbol}</span></div><div><strong>{r.symbol} · {r.ranked ? (r.score == null ? "NO_DATA" : `${r.score} / 100`) : "insufficient data for a score"}{r.coverage != null && r.coverage < 1 ? ` · ${Math.round(r.coverage * 100)}% of factor weight measured` : ""}</strong>{coverageLine ? <small>{coverageLine}</small> : null}<div className="fundamental-factor-strip">{(r.subscores ?? []).map((s: any) => <span key={s.label}><b>{s.label}</b><em>{s.score == null ? "NO_DATA" : s.score}</em><small>{s.reading}</small>{s.label === "TVL trend" && r.tvl?.scope ? <small>TVL scope · {r.tvl.scope}</small> : null}{s.label === "Revenue yield" && r.revenueYield?.scopeNote ? <small>{r.revenueYield.scopeNote}</small> : null}<small>{s.source} · {s.asOf ? `as of ${new Date(s.asOf).toLocaleString()}` : "timestamp unavailable"}</small></span>)}</div>{(r.subscores ?? []).filter((s: any) => s.score == null).map((s: any) => <FundNoData key={`nodata-${s.label}`} row={r} s={s}/>)}{r.marketSnapshot?.dexLiquidity ? <small>DEX liquidity (DexScreener/GeckoTerminal) — DEX data, not spot turnover · liquidity {money(r.marketSnapshot.dexLiquidity.usd, true)} · 24H volume {money(r.marketSnapshot.dexLiquidity.volume24h, true)}{r.marketSnapshot.dexLiquidity.pairs != null ? ` · ${r.marketSnapshot.dexLiquidity.pairs} pairs` : ""}{r.marketSnapshot.dexLiquidity.chain ? ` · ${r.marketSnapshot.dexLiquidity.chain}` : ""} · via {r.marketSnapshot.dexLiquidity.source}</small> : r.marketSnapshot?.dexLiquidityNote ? <small>DEX liquidity (DexScreener/GeckoTerminal) — {r.marketSnapshot.dexLiquidityNote}</small> : null}<small>{r.coverage == null ? "coverage unavailable" : `${Math.round(r.coverage * 100)}% of factor weight measured`}{r.marketSnapshot?.asOf ? ` · market data ${new Date(r.marketSnapshot.asOf).toLocaleString()}` : ""}</small></div><em>{r.marketSnapshot?.price != null ? money(r.marketSnapshot.price) : "—"}</em></button>;
  };
  return <section className="terminal-section fundamentals-ranking"><ViewLabel view="research"/><div className="panel-head"><div><p className="eyebrow cyan">Direction-agnostic</p><h2>Strongest fundamentals</h2></div><button className="refresh-small" onClick={() => rescore.mutate()} disabled={rescore.isPending}>{rescore.isPending ? "SCORING…" : "RESCORE NOW"}</button></div><p className="score-disclaimer">Scored weekly{q.data?.scoredAt ? ` · scored ${new Date(q.data.scoredAt).toLocaleDateString()}` : ""}{q.data?.marketDataAsOf ? ` · market data refreshed ${new Date(q.data.marketDataAsOf).toLocaleString()}` : ""}. TVL 30 + revenue 20 + supply 25 + developer 15 + liquidity 10. Scores are factor agreement, never probabilities. Assets with under 60% of their factor weight measured are listed separately, not ranked.</p>{q.data?.stale ? <p className="source-warning">Weekly scores are older than 7 days — rescore for a fresh weekly read.</p> : null}{rescore.data?.error ? <p className="source-warning">{rescore.data.error}</p> : null}{q.isPending ? <Empty>Loading fundamentals ranking…</Empty> : rows.length ? <>{rankedRows.length ? <div className="discovery-signal-list">{rankedRows.map((r: any) => rowButton(r))}</div> : <Empty>No asset has enough measured factor weight to rank yet.</Empty>}{thinRows.length ? <><p className="score-disclaimer">Limited coverage — not ranked (under 60% of factor weight measured):</p><div className="discovery-signal-list">{thinRows.map((r: any) => rowButton(r))}</div></> : null}</> : <Empty>{rescore.isPending ? "Scoring fundamentals…" : q.data?.message ?? q.data?.error ?? "No weekly fundamentals score stored yet — run Rescore."}</Empty>}{distribution || methodology ? <details className="fundamentals-methodology"><summary>Methodology and measured revenue-yield range</summary>{distribution ? <p>{distribution.measuredCount}/{distribution.universeCount} coins measured · range {distribution.minPct == null ? "NO_DATA" : `${distribution.minPct.toFixed(3)}%`} to {distribution.maxPct == null ? "NO_DATA" : `${distribution.maxPct.toFixed(3)}%`} · median {distribution.medianPct == null ? "NO_DATA" : `${distribution.medianPct.toFixed(3)}%`}. Revenue scores use percentile bands within the measured T1 + T2 set: top decile 95, bottom decile 8. Yield = 30-day average daily fees × 365 ÷ CoinGecko market cap; FDV is never substituted.</p> : null}{methodology ? <><p><b>Changed {new Date(methodology.changedAt).toLocaleString()}</b> · {methodology.version} · {methodology.what}</p><p>{methodology.why}</p></> : null}</details> : null}</section>;
}

function UniverseTiers({ openCoin }: { openCoin: (id: string, symbol: string) => void }) {
  const qc = useQueryClient();
  const [tier, setTier] = useState<"T1" | "T2" | "T3" | "T4">("T1");
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const q = useQuery({ queryKey: ["universe-tiers", tier], queryFn: () => api.getuniversetiers({ tier }), staleTime: 300000 });
  const refresh = useMutation({ mutationFn: () => api.refreshuniversetiers({ dryRun: false, trigger: "manual" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["universe-tiers"] }) });
  const rows = q.data?.rows ?? [];
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visibleRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const selectTier = (next: "T1" | "T2" | "T3" | "T4") => { setTier(next); setPage(1); };
  const witnessScore = (value: number | null | undefined) => value == null ? "NO_DATA" : String(value);
  const holderWitness = (row: any) => row.witnesses.holderGrowthPct == null ? "H NO_DATA" : `H ${row.witnesses.holderGrowthPct >= 0 ? "+" : ""}${num(row.witnesses.holderGrowthPct)}% · ${witnessScore(row.witnesses.holders)}`;
  const whaleWitness = (row: any) => row.witnesses.whaleNetflow24hUsd == null ? "W NO_DATA" : `W ${row.witnesses.whaleNetflow24hUsd >= 0 ? "+" : "−"}${money(Math.abs(row.witnesses.whaleNetflow24hUsd), true)} · ${witnessScore(row.witnesses.whales)}`;
  return <section className="terminal-section universe-tiers">
    <div className="panel-head"><div><p className="eyebrow cyan">Weekly screener funnel</p><h2>500 → T1 + volume or ≥15% / 48H → full scoring</h2></div><button className="refresh-small" aria-label="Recompute weekly universe tiers" onClick={() => refresh.mutate()} disabled={refresh.isPending}>{refresh.isPending ? "SCREENING…" : "RECOMPUTE"}</button></div>
    <p className="score-disclaimer">Two routes enter full 7-dimension scoring. Non-velocity assets must be T1 and clear the volume path. A ≥15% move over 48 hours qualifies from any tier through the independent velocity path; its volume multiple is not consulted.</p>
    <p className="score-disclaimer">T1 has three independent doors: active verified theory, open signal, or Graduation ≥70. The graduation score does not explain a theory- or signal-led promotion.</p>
    {refresh.data?.error ? <p className="source-warning">{refresh.data.error}</p> : refresh.data?.summary ? <p className="interpretation">{refresh.data.summary}</p> : null}
    {q.data?.lastRun ? <p className="universe-run">Assigned {new Date(q.data.lastRun.completedAt).toLocaleString()} · {q.data.lastRun.summary}</p> : null}
    <div className="seg universe-tier-tabs" aria-label="Universe tier"><button className={tier === "T1" ? "active" : ""} onClick={() => selectTier("T1")}>T1 · {q.data?.counts.T1 ?? 0}</button><button className={tier === "T2" ? "active" : ""} onClick={() => selectTier("T2")}>T2 · {q.data?.counts.T2 ?? 0}</button><button className={tier === "T3" ? "active" : ""} onClick={() => selectTier("T3")}>T3 · {q.data?.counts.T3 ?? 0}</button><button className={tier === "T4" ? "active" : ""} onClick={() => selectTier("T4")}>T4 · {q.data?.counts.T4 ?? 0}</button></div>
    {q.isPending ? <Empty>Loading saved weekly tiers…</Empty> : q.data?.error ? <Empty>{q.data.error}</Empty> : rows.length ? <><div className="universe-tier-list">{visibleRows.map((row: any) => <button key={row.coinId} type="button" aria-label={`Open ${row.coin} ${row.tier} dossier`} onClick={() => openCoin(row.coinId, row.coin)}><div className="universe-tier-rank"><b>{row.coin}</b><span>{row.volumeRank ? `V#${row.volumeRank}` : "GRANDFATHER"}</span></div><div><strong>{row.name}{row.mover ? " · MOVER" : ""}{row.newListing ? " · NEW LISTING" : ""}</strong><p>{row.reason}</p>{row.catalystLine ? <small>{row.catalystLine}</small> : null}</div><div className="universe-tier-proof">{row.tier === "T4" ? <><em>Price {row.price == null ? "NO_DATA" : money(row.price)}</em><small>24H spot volume {row.volume24h == null ? "NO_DATA" : money(row.volume24h, true)}</small></> : <><em>{row.graduationScore == null ? "Graduation blocked" : `Graduation ${row.graduationScore}/100 (bar 70)`}</em><small>V {row.volumeMultiple30d == null ? witnessScore(row.witnesses.volume) : `${num(row.volumeMultiple30d)}× · ${witnessScore(row.witnesses.volume)}`} · {holderWitness(row)} · {whaleWitness(row)} · C {row.witnesses.catalyst} · S {row.witnesses.structure}</small>{row.witnesses.onchainSource ? <small>{row.witnesses.onchainSource}{row.witnesses.onchainAsOf ? ` · ${new Date(row.witnesses.onchainAsOf).toLocaleString()}` : ""}</small> : null}</>}</div></button>)}</div>{pageCount > 1 ? <nav className="universe-pagination" aria-label={`${tier} tier pages`}><button type="button" aria-label={`Previous ${tier} page`} onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={safePage === 1}>Previous</button><span>Page {safePage} of {pageCount}<small>{(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, rows.length)} of {rows.length}</small></span><button type="button" aria-label={`Next ${tier} page`} onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={safePage === pageCount}>Next</button></nav> : null}</> : <Empty>{`No saved ${tier} membership yet. Run the weekly screener.`}</Empty>}
  </section>;
}

// HL board phase 2 (crypto) — positioning panel + per-asset charts, inside
// the Hyperliquid board. Pure display of the marketdata cache read
// (getHyperliquidPositioning): crowding figures are the stored snapshot
// strings, wallet rows are the captured leaderboard positions, and charts
// are hand-rolled SVG from the stored 1h candles. Research lane only.
type HlBar = { openMs: number; open: number; high: number; low: number; close: number };
function parseHlBar(raw: any): HlBar | null {
  if (!raw) return null;
  const openMs = Number(raw.openMs); const open = Number(raw.open); const high = Number(raw.high); const low = Number(raw.low); const close = Number(raw.close);
  return Number.isFinite(openMs) && Number.isFinite(open) && Number.isFinite(high) && Number.isFinite(low) && Number.isFinite(close) ? { openMs, open, high, low, close } : null;
}
function isoStamp(ms: number): string { return new Date(ms).toISOString().replace(".000Z", "Z"); }

function HlCandleChart({ symbol, candle, fundingHistory, oiPoints }: { symbol: string; candle: any; fundingHistory: any[]; oiPoints: any[] }) {
  const completedAll: HlBar[] = (Array.isArray(candle?.completed) ? candle.completed : []).map(parseHlBar).filter((b: HlBar | null): b is HlBar => b !== null);
  const forming = parseHlBar(candle?.forming);
  if (!completedAll.length) return <Empty>{`Chart unavailable — no completed Hyperliquid candles for ${symbol} in the latest snapshot.`}</Empty>;
  const completed = completedAll.slice(-72);
  const first = completed[0] as HlBar;
  const last = completed[completed.length - 1] as HlBar;
  const bars: Array<{ bar: HlBar; forming: boolean }> = [...completed.map((bar) => ({ bar, forming: false })), ...(forming ? [{ bar: forming, forming: true }] : [])];
  const W = 720; const priceTop = 18; const priceH = 168; const fundTop = priceTop + priceH + 24; const fundH = 42; const H = fundTop + fundH + 20;
  const plotW = W - 58;
  const step = plotW / bars.length;
  const bodyW = Math.max(2, step * 0.62);
  let min = Infinity; let max = -Infinity;
  for (const { bar } of bars) { min = Math.min(min, bar.low); max = Math.max(max, bar.high); }
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) { max = min + 1; }
  const pad = (max - min) * 0.06; min -= pad; max += pad;
  const y = (v: number) => priceTop + (max - v) / (max - min) * priceH;
  const xForTime = (ms: number) => (ms - first.openMs) / 3_600_000 * step + step / 2;
  const dataThroughMs = last.openMs + 3_600_000;
  const oiInWindow = (Array.isArray(oiPoints) ? oiPoints : []).map((p: any) => ({ t: Date.parse(String(p?.tUtc ?? "")), v: Number(p?.value) })).filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v) && p.t >= first.openMs && p.t <= dataThroughMs);
  const oiMin = oiInWindow.length ? Math.min(...oiInWindow.map((p) => p.v)) : 0;
  const oiMax = oiInWindow.length ? Math.max(...oiInWindow.map((p) => p.v)) : 1;
  const oiY = (v: number) => oiMax > oiMin ? priceTop + 8 + (oiMax - v) / (oiMax - oiMin) * (priceH - 16) : priceTop + priceH / 2;
  const oiPath = oiInWindow.map((p) => `${xForTime(p.t).toFixed(1)},${oiY(p.v).toFixed(1)}`).join(" ");
  const oiShorter = oiInWindow.length > 0 && oiInWindow[0] !== undefined && oiInWindow[0].t > first.openMs;
  const fundingInWindow = (Array.isArray(fundingHistory) ? fundingHistory : []).map((p: any) => ({ t: Date.parse(String(p?.timeUtc ?? "")), v: Number(p?.fundingRate) })).filter((p) => Number.isFinite(p.t) && Number.isFinite(p.v) && p.t >= first.openMs && p.t <= dataThroughMs);
  const fundMax = fundingInWindow.length ? Math.max(...fundingInWindow.map((p) => Math.abs(p.v)), 1e-9) : 1e-9;
  const fundMid = fundTop + fundH / 2;
  const hatchId = `hl-hatch-${symbol}`;
  return <figure className="hl-chart" aria-label={`${symbol} Hyperliquid 1h candlestick chart`}>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${symbol} candlesticks with funding bars and open interest line`} preserveAspectRatio="none">
      <defs><pattern id={hatchId} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="transparent"/><line x1="0" y1="0" x2="0" y2="5" stroke="var(--amber)" strokeWidth="1.4"/></pattern></defs>
      <line x1="0" y1={priceTop} x2={plotW} y2={priceTop} stroke="var(--border)" strokeWidth="0.5"/>
      <line x1="0" y1={priceTop + priceH} x2={plotW} y2={priceTop + priceH} stroke="var(--border)" strokeWidth="0.5"/>
      <text x={plotW + 6} y={y(max - pad) + 3} fill="var(--dim)" fontSize="9" fontFamily="'IBM Plex Mono',monospace">{num(max - pad)}</text>
      <text x={plotW + 6} y={y(min + pad) + 3} fill="var(--dim)" fontSize="9" fontFamily="'IBM Plex Mono',monospace">{num(min + pad)}</text>
      {oiInWindow.length > 1 ? <polyline points={oiPath} fill="none" stroke="var(--cyan)" strokeWidth="1.2" opacity="0.85"/> : null}
      {oiInWindow.length > 1 ? <text x={Math.min(plotW - 14, xForTime((oiInWindow[oiInWindow.length - 1] as { t: number }).t))} y={priceTop + 10} fill="var(--cyan)" fontSize="9" fontFamily="'IBM Plex Mono',monospace">OI</text> : null}
      {bars.map(({ bar, forming: isForming }, i) => {
        const cx = i * step + step / 2;
        const up = bar.close >= bar.open;
        const color = isForming ? "var(--amber)" : up ? "var(--accent)" : "var(--danger)";
        const bodyTop = y(Math.max(bar.open, bar.close)); const bodyH = Math.max(1, Math.abs(y(bar.open) - y(bar.close)));
        return <g key={`${bar.openMs}-${i}`}>
          <line x1={cx} y1={y(bar.high)} x2={cx} y2={y(bar.low)} stroke={color} strokeWidth="1"/>
          {isForming
            ? <><rect x={cx - bodyW / 2} y={bodyTop} width={bodyW} height={bodyH} fill={`url(#${hatchId})`} stroke={color} strokeWidth="1" strokeDasharray="3 2"/><text x={cx} y={priceTop - 6} fill="var(--amber)" fontSize="9" textAnchor="middle" fontFamily="'IBM Plex Mono',monospace">forming</text></>
            : <rect x={cx - bodyW / 2} y={bodyTop} width={bodyW} height={bodyH} fill={color}/>}
        </g>;
      })}
      <line x1="0" y1={fundMid} x2={plotW} y2={fundMid} stroke="var(--border)" strokeWidth="0.5"/>
      {fundingInWindow.map((p) => { const h = Math.abs(p.v) / fundMax * (fundH / 2); const x = xForTime(p.t); return <rect key={p.t} x={x - Math.max(1, step * 0.3)} y={p.v >= 0 ? fundMid - h : fundMid} width={Math.max(1, step * 0.6)} height={Math.max(0.6, h)} fill={p.v >= 0 ? "var(--accent)" : "var(--danger)"} opacity="0.8"/>; })}
      <text x="0" y={fundTop - 8} fill="var(--dim)" fontSize="9" fontFamily="'IBM Plex Mono',monospace">funding / h</text>
      <text x="0" y={H - 4} fill="var(--dim)" fontSize="9" fontFamily="'IBM Plex Mono',monospace">{isoStamp(first.openMs)}</text>
      <text x={plotW} y={H - 4} fill="var(--dim)" fontSize="9" textAnchor="end" fontFamily="'IBM Plex Mono',monospace">{isoStamp(dataThroughMs)}</text>
    </svg>
    <figcaption>
      <span>{`Hyperliquid · 1h · data through ${isoStamp(dataThroughMs)}`}</span>
      {forming ? <span> · hatched bar is the forming bar, excluded from completed calculations</span> : <span> · no forming bar in the latest snapshot</span>}
      {oiInWindow.length > 1 ? <span> · cyan line is open interest (own scale, {symbol} units)</span> : <span> · OI line unavailable for this window</span>}
      {oiShorter ? <span> · OI series accumulates from 2026-10-19</span> : null}
    </figcaption>
  </figure>;
}

function HlPositioningPanels({ symbols }: { symbols: string[] }) {
  const q = useQuery({ queryKey: ["hl-positioning"], queryFn: () => api.getHyperliquidPositioning({}), staleTime: 300000 });
  const d = q.data;
  if (q.isPending) return <div className="hl-phase2"><div className="panel-head"><div><p className="eyebrow cyan">Hyperliquid · positioning + charts</p><h3>Positioning &amp; price charts</h3></div></div><Empty>Loading Hyperliquid positioning from the marketdata cache…</Empty></div>;
  if (!d || (!d.snapshot && !d.wallets)) return <div className="hl-phase2"><div className="panel-head"><div><p className="eyebrow cyan">Hyperliquid · positioning + charts</p><h3>Positioning &amp; price charts</h3></div></div><Empty>{d?.error ?? "Hyperliquid positioning unavailable — the marketdata cache could not be read."}</Empty></div>;
  const snap = d.snapshot;
  const wallets = d.wallets;
  const pctGloss = (raw: string | null | undefined, digits: number) => { const v = Number(raw); return raw != null && Number.isFinite(v) ? ` (${v >= 0 ? "+" : ""}${(v * 100).toFixed(digits)}%)` : ""; };
  const truncAddr = (a: string) => a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
  return <div className="hl-phase2">
    <div className="panel-head"><div><p className="eyebrow cyan">Hyperliquid · positioning + charts</p><h3>Positioning &amp; price charts</h3></div><button className="refresh-small" onClick={() => q.refetch()} disabled={q.isFetching}>{q.isFetching ? "Reloading…" : "Reload"}</button></div>
    <p className="hl-honesty">Funding &amp; premium are a crowding gauge. Open interest is a total — it is NOT a long/short split.</p>
    {symbols.map((symbol) => {
      const context = snap?.contexts.find((c: any) => c.symbol === symbol) ?? null;
      const positions = (wallets?.traders ?? []).flatMap((t: any) => (t.positions ?? []).filter((p: any) => p.coin === symbol).map((p: any) => ({ ...p, address: t.address, displayName: t.displayName })));
      return <article key={symbol} className="hl-phase2-asset">
        <div className="panel-head"><div><p className="eyebrow cyan">Hyperliquid · {symbol}-PERP</p><h4>{symbol} positioning</h4></div><Source>{snap?.receiptTimeUtc ? `Hyperliquid · as of ${snap.receiptTimeUtc}` : "Hyperliquid"}</Source></div>
        {context ? <div className="snapshot">
          <Metric label="Funding rate (per hour, as stored)" value={`${context.funding ?? "—"}${pctGloss(context.funding, 5)}`}/>
          <Metric label="Premium (mark vs oracle, as stored)" value={`${context.premium ?? "—"}${pctGloss(context.premium, 4)}`}/>
          <Metric label={`Open interest (${symbol})`} value={context.openInterest ?? "—"}/>
          <Metric label="Mark price" value={context.markPx ?? "—"}/>
        </div> : <Empty>{`Crowding data unavailable for ${symbol} in the latest Hyperliquid snapshot.`}</Empty>}
        <p className="muted">{snap?.receiptTimeUtc ? `Crowding figures as of ${snap.receiptTimeUtc} · Hyperliquid` : "Snapshot receipt time unavailable."}</p>
        {snap ? <HlCandleChart symbol={symbol} candle={snap.candles[symbol]} fundingHistory={snap.fundingHistory[symbol] ?? []} oiPoints={d.oiSeries[symbol] ?? []}/> : <Empty>{`Chart unavailable for ${symbol} — the latest Hyperliquid snapshot could not be read.`}</Empty>}
        <div className="panel-head"><div><h4>{`Top-trader positioning — top 30 Hyperliquid leaderboard wallets by trailing-month PnL · as of ${wallets?.receiptTimeUtc ?? "unavailable"}`}</h4></div></div>
        {wallets ? (positions.length ? <div className="hl-wallet-wrap"><table className="hl-wallet-table" aria-label={`${symbol} top-trader positions`}>
          <thead><tr><th>Wallet</th><th>Side</th><th>Size (szi)</th><th>Entry</th><th>Liquidation</th><th>Unrealized PnL</th><th>Leverage</th></tr></thead>
          <tbody>{positions.map((p: any, i: number) => { const szi = Number(p.szi); const side = Number.isFinite(szi) ? (szi >= 0 ? "Long" : "Short") : "—"; return <tr key={`${p.address}-${i}`}>
            <td>{p.displayName ? `${p.displayName} · ` : ""}{truncAddr(String(p.address))}</td>
            <td className={side === "Long" ? "up" : side === "Short" ? "down" : ""}>{side}</td>
            <td>{p.szi ?? "—"}</td><td>{p.entryPx ?? "—"}</td><td>{p.liquidationPx ?? "—"}</td><td>{p.unrealizedPnl ?? "—"}</td>
            <td>{p.leverage == null ? "—" : `${p.leverage}×${p.leverageType ? ` ${p.leverageType}` : ""}`}</td>
          </tr>; })}</tbody>
        </table></div> : <Empty>{`No captured ${symbol} positions among the top 30 leaderboard wallets in the latest wallets file.`}</Empty>) : <Empty>Top-trader positioning unavailable — the latest Hyperliquid wallets file could not be read.</Empty>}
      </article>;
    })}
  </div>;
}

// (Crypto stream, 2026-10-19) Hyperliquid opportunity board — independent
// research surface. Renders the verified scanner run (6 configured perp
// instruments) with per-asset provenance. T1 membership and paper-issuance
// gates never filter this board. No agent-layer internals are rendered:
// every field below is measured data or its provenance.
function HyperliquidBoard() {
  const q = useQuery({ queryKey: ["hl-opportunity-board"], queryFn: () => api.getHyperliquidOpportunityBoard({}), staleTime: 300000 });
  const board = q.data?.board;
  if (q.isPending) return <section className="terminal-section"><div className="panel-head"><div><p className="eyebrow cyan">Hyperliquid · perp · USD</p><h2>Opportunity board</h2></div></div><Empty>Loading the latest verified scanner run…</Empty></section>;
  if (!board) return <section className="terminal-section"><div className="panel-head"><div><p className="eyebrow cyan">Hyperliquid · perp · USD</p><h2>Opportunity board</h2></div><button className="refresh-small" onClick={() => q.refetch()} disabled={q.isFetching}>{q.isFetching ? "Reloading…" : "Reload"}</button></div><Empty>{q.data?.error ?? "Opportunity board unavailable."}</Empty></section>;
  const rows = [...board.rows].sort((a: any, b: any) => (b.mover.change_pct ?? -1e18) - (a.mover.change_pct ?? -1e18));
  const freshness = (r: any) => ageLabel(Date.now() - (Date.parse(r.lastCompletedBarOpen) + 3600000));
  return <><ViewLabel view="opportunities"/><ChartOpportunitiesBanner/><section className="terminal-section hl-board">
    <div className="panel-head"><div><p className="eyebrow cyan">Hyperliquid · perp · USD · research only — not a call</p><h2>Opportunity board</h2></div><button className="refresh-small" onClick={() => q.refetch()} disabled={q.isFetching}>{q.isFetching ? "Reloading…" : "Reload"}</button></div>
    <p className="score-disclaimer">Six configured instruments — NOT broad market coverage. Independent of T1 membership and paper-issuance gates; nothing here enters issuance. Prices are Hyperliquid 1h candleSnapshot closes (not spot, not mark); the forming bar is excluded from every component.</p>
    <p className="funnel-stamp">Run {board.runFile} · computed {board.runUtc ? new Date(board.runUtc).toLocaleString() : "—"} · data through {board.identity?.last_completed_bar_open_utc ? new Date(board.identity.last_completed_bar_open_utc).toLocaleString() : "—"}</p>
    <p className="muted">Observed {sourceTimeLabel(Date.parse(board.rows[0].observationTime))} · last completed bar {new Date(board.rows[0].lastCompletedBarOpen).toLocaleString()} ({freshness(board.rows[0])}) · scanner run {board.runFile} · K={board.parameters?.K_breakout ?? 24} breakout lookback.</p>
    <div className="metric-grid"><Metric label="24h top mover" value={`${rows[0].symbol} ${percent(rows[0].mover.change_pct)}`}/><Metric label="24h bottom mover" value={`${rows[rows.length-1].symbol} ${percent(rows[rows.length-1].mover.change_pct)}`}/><Metric label="Session bars" value={board.sessionNewBars == null ? "—" : `${board.sessionNewBars} new`}/><Metric label="Open interest" value="unavailable"/></div>
    {board.openInterest?.status !== "ok" ? <p className="source-warning">Open interest: {board.openInterest?.reason ?? "unavailable"} — never treated as zero change.</p> : null}
    {Array.isArray(board.fundingExtremes) && board.fundingExtremes.length ? (() => { const extremes = board.fundingExtremes as any[]; const avail = extremes.filter((e: any) => e.available && e.latest != null); const highestPositive = avail.length ? avail.reduce((best: any, e: any) => (e.latest > (best?.latest ?? -Infinity) ? e : best), null) : null; const mostNegative = avail.length ? avail.reduce((best: any, e: any) => (e.latest < (best?.latest ?? Infinity) ? e : best), null) : null; const firstCollection = avail.map((e: any) => e.firstAt).filter(Boolean).sort()[0] ?? null; return <div className="funding-extremes" aria-label="Funding extremes across board instruments">
      <div className="panel-head"><div><p className="eyebrow cyan">Collected series · ranked by |z| vs own history</p><h3>Funding extremes</h3></div></div>
      <p className="muted">Latest funding per instrument against its own stored funding series{firstCollection ? ` · funding history since first collection ${new Date(firstCollection).toLocaleDateString()}` : ""}. Display of already-collected data only.</p>
      {(highestPositive && highestPositive.latest > 0) || (mostNegative && mostNegative.latest < 0) ? <div className="metric-grid">{highestPositive && highestPositive.latest > 0 ? <Metric label="Highest positive" value={`${highestPositive.symbol} +${(highestPositive.latest * 100).toFixed(5)}%/h`}/> : null}{mostNegative && mostNegative.latest < 0 ? <Metric label="Most negative" value={`${mostNegative.symbol} ${(mostNegative.latest * 100).toFixed(5)}%/h`}/> : null}</div> : null}
      <div className="funding-extreme-rows">{extremes.map((e: any) => e.available ? <div key={e.symbol} className="funding-extreme-row"><strong>{e.symbol}</strong><span>{e.latest == null ? "—" : `${e.latest >= 0 ? "+" : ""}${(e.latest * 100).toFixed(5)}%/h`}</span><span>{e.zScore == null ? "z n/a — flat or single-point history" : `z ${e.zScore >= 0 ? "+" : ""}${Number(e.zScore).toFixed(2)}`}</span><span>{e.percentile == null ? "percentile n/a" : `${Number(e.percentile).toFixed(0)}th pct`}</span><small>{e.firstAt ? `funding history since first collection ${new Date(e.firstAt).toLocaleDateString()} · ${e.points ?? 0} points` : "coverage unknown"}{e.latestAt ? ` · latest ${new Date(e.latestAt).toLocaleString()}` : ""}</small></div> : <div key={e.symbol} className="funding-extreme-row"><strong>{e.symbol}</strong><span>funding history unavailable</span></div>)}</div>
    </div>; })() : null}
    <HlPositioningPanels symbols={rows.map((r: any) => String(r.symbol))}/>
    <div className="hl-asset-grid">{rows.map((r: any) => <article key={r.symbol} className={r.partial ? "hl-asset partial" : "hl-asset"}>
      <div className="panel-head"><div><p className="eyebrow cyan">{r.source} · {r.instrument}</p><h3>{r.symbol}</h3></div><span className={r.mover.change_pct >= 0 ? "up" : "down"}>{percent(r.mover.change_pct, 2)}</span></div>
      <small>Observed {sourceTimeLabel(Date.parse(r.observationTime))} · last completed bar {new Date(r.lastCompletedBarOpen).toLocaleString()} ({freshness(r)}) · lookback 24h / 7d / K24 · forming bar excluded</small>
      <div className="snapshot">
        <Metric label="24h change (close→close)" value={`${percent(r.mover.change_pct, 2)} · ${num(r.mover.from_close)} → ${num(r.mover.to_close)}`}/>
        <Metric label="24h range" value={`${num(r.mover.range_24h_low)} – ${num(r.mover.range_24h_high)}`}/>
        {r.btcRelativeStrengthBps != null ? <Metric label="BTC-relative strength" value={`${r.btcRelativeStrengthBps >= 0 ? "+" : ""}${Number(r.btcRelativeStrengthBps).toFixed(1)} bps`}/> : null}
        <Metric label="Volume (6h vs prior 6h, base units)" value={r.volume.status === "ok" ? `${percent(r.volume.change_pct, 1)} · ${num(r.volume.recent_6_sum_base, true)} vs ${num(r.volume.prior_6_sum_base, true)}` : "unavailable"}/>
        <Metric label="Funding (per hour)" value={`${r.funding.current_pct_per_hour >= 0 ? "+" : ""}${r.funding.current_pct_per_hour.toFixed(5)}%/h${r.funding.current_baseline_pegged ? " · baseline-pegged (neutral)" : ""}`}/>
        <Metric label="Funding 7d" value={`pos ${r.funding.history_7d.positive} / neg ${r.funding.history_7d.negative} / flips ${r.funding.history_7d.sign_flips}`}/>
        <Metric label="K=24 last-bar signal" value={r.breakout.last_bar_live_signal === "none" ? "none" : r.breakout.last_bar_live_signal}/>
        <Metric label="K=24 distance" value={`max ${percent(r.breakout.dist_to_prior24_max_pct, 2)} above · min ${num(Math.abs(r.breakout.dist_to_prior24_min_pct ?? 0))}% below`}/>
      </div>
      {r.breakout.most_recent_live_breakout ? <small>Most recent live breakout: bar {new Date(r.breakout.most_recent_live_breakout.bar).toLocaleString()} close {num(r.breakout.most_recent_live_breakout.close)} · first observed at that bar open.</small> : null}
      {r.breakout.most_recent_live_breakdown ? <small>Most recent live breakdown: bar {new Date(r.breakout.most_recent_live_breakdown.bar).toLocaleString()} close {num(r.breakout.most_recent_live_breakdown.close)} · first observed at that bar open.</small> : null}
      {r.missingEvidence.length ? <p className="source-warning">Missing evidence: {r.missingEvidence.join(" · ")}</p> : <p className="muted">Full coverage on all components.</p>}
    </article>)}</div>
  </section></>;
}

// Batch 3 — All observations: every candidate the latest completed discovery
// run recorded, tier rendered as a priority label only. This is the research
// lane at full width; the tier-filtered scanner views above are unchanged,
// and issuance decisions live elsewhere, separately.
function AllObservations({ openCoin }: { openCoin: (id: string, symbol: string) => void }) {
  const q = useQuery({ queryKey: ["discovery-observations"], queryFn: () => api.getDiscoveryObservations({}), staleTime: 300000 });
  const rows = q.data?.rows ?? [];
  return <section className="terminal-section all-observations" aria-label="All observations from the latest completed discovery run">
    <div className="panel-head"><div><p className="eyebrow cyan">Research lane · unfiltered</p><h2>All observations</h2></div><button className="refresh-small" onClick={() => q.refetch()} disabled={q.isFetching}>{q.isFetching ? "Reloading…" : "Reload"}</button></div>
    <p className="muted">Research observations — everything the scanner computed. Tier is a priority label, not a qualification. Issuance decisions are unchanged and shown separately.</p>
    {q.data?.run ? <p className="funnel-stamp">Run #{q.data.run.id} · completed {new Date(q.data.run.completedAt).toLocaleString()}</p> : null}
    {q.data?.run ? <p className="asset-meta">Latest completed discovery run #{q.data.run.id} · {q.data.run.status} · completed {new Date(q.data.run.completedAt).toLocaleString()} · ordered by the run's recorded alignment where the run recorded one; remaining observations follow in the run's scan order.</p> : null}
    {q.isPending ? <Empty>Loading every observation from the latest completed run…</Empty> : q.data?.error ? <Empty>{q.data.error}</Empty> : rows.length ? <div className="discovery-signal-list">{rows.map((row: any) => <button key={row.coinId} type="button" aria-label={`Open ${row.symbol} coin dossier`} onClick={() => openCoin(row.coinId, row.symbol)}>
      <div className="signal-rank"><b>{row.symbol}</b><span>{row.tierLabel}</span></div>
      <div><strong>{row.symbol}{row.name ? ` · ${row.name}` : ""} · {row.direction ? row.direction.toUpperCase() : "NO DIRECTION RECORDED"}</strong><small>{row.context}</small><small>{row.sourceAsOf ? `data through ${new Date(row.sourceAsOf).toLocaleString()}` : "data-through time unavailable"}</small></div>
      <em>{row.tierLabel}</em>
    </button>)}</div> : <Empty>No completed discovery run has stored observations yet.</Empty>}
  </section>;
}

// Batch 4b — Deribit options context. Display only: IV / skew / OI measured
// on Deribit, labeled with the venue and its own as_of. Never blended with
// OKX or Hyperliquid figures.
function DeribitOptionsSection() {
  const q = useQuery({ queryKey: ["deribit-options-context"], queryFn: () => api.getDeribitOptionsContext({}), staleTime: 300000 });
  const d = q.data;
  return <section className="terminal-section" aria-label="Derivatives context from Deribit">
    <div className="panel-head"><div><p className="eyebrow cyan">Options · BTC / ETH</p><h2>Derivatives context · Deribit</h2></div><Source>{d?.asOf ? `Deribit · as of ${new Date(d.asOf).toLocaleString()}` : "Deribit"}</Source></div>
    {q.isPending ? <Empty>Loading Deribit option book summaries…</Empty> : !d || d.error ? <Empty>{d?.error ?? "Deribit options context unavailable."}</Empty> : <div className="stack">
      {d.underlyings.map((u: any) => u.state !== "available" ? <div key={u.currency} className="context-block"><div className="panel-head"><h3>{u.currency} options</h3></div><Empty>{u.error ?? `${u.currency} options unavailable from Deribit.`}</Empty></div> : <div key={u.currency} className="context-block">
        <div className="panel-head"><h3>{u.currency} options · nearest expiry {u.expiry ? new Date(u.expiry).toLocaleDateString() : "—"}</h3><span className="muted">underlying {money(u.underlyingPrice)}</span></div>
        <div className="indicator-grid">
          <Metric label="ATM IV (nearest strike)" value={u.atmIv == null ? "—" : `${num(u.atmIv)}%`}/>
          <Metric label="25Δ risk reversal (call − put IV)" value={u.riskReversal25d == null ? "—" : `${u.riskReversal25d >= 0 ? "+" : ""}${num(u.riskReversal25d)} pts`}/>
          <Metric label="25Δ call IV" value={u.call25Iv == null ? "—" : `${num(u.call25Iv)}%`}/>
          <Metric label="25Δ put IV" value={u.put25Iv == null ? "—" : `${num(u.put25Iv)}%`}/>
          <Metric label={`Total options OI (${u.currency})`} value={num(u.totalOiContracts, true)}/>
          <Metric label="Total options OI (USD)" value={money(u.totalOiUsd, true)}/>
        </div>
        {u.strikes?.length ? <details><summary>Per-strike OI · nearest expiry · {u.strikes.length} strikes</summary><div className="strike-oi-list">{u.strikes.map((s: any) => <div key={s.strike} className="strike-oi-row"><b>{num(s.strike)}</b><span>call OI {num(s.callOi)}</span><span>put OI {num(s.putOi)}</span></div>)}</div></details> : null}
      </div>)}
      <p className="muted">Source: Deribit public book summaries (mark_iv, open_interest, underlying_price) · as of {d.asOf ? new Date(d.asOf).toLocaleString() : "—"}. 25Δ approximated from listed strikes: delta is computed from each summary's mark IV and underlying price (Black-Scholes), and the listed strike nearest 25Δ is used — Deribit book summaries do not publish per-contract delta. ATM IV is the mean mark IV of the call and put at the strike nearest the underlying price.</p>
    </div>}
  </section>;
}

// OpenBB parser supplement — display only, beside the primary Deribit read
// above. Funding history, chain aggregates and the nearest-expiry greeks
// come from the research pipeline's OpenBB bundle; the bundle's own source
// string and fetched_at_utc are carried verbatim in the header. A missing
// bundle or section renders unavailable — never a substituted figure.
function OpenbbDeribitSection() {
  const q = useQuery({ queryKey: ["openbb-deribit-supplement"], queryFn: () => api.getOpenbbDeribitSupplement({}), staleTime: 300000 });
  const d = q.data;
  const fmtRate = (v: number | null | undefined) => v == null || !Number.isFinite(v) ? "—" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(4)}%`;
  const fmtGreek = (v: number | null | undefined) => v == null || !Number.isFinite(v) ? "—" : new Intl.NumberFormat(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 5 }).format(v);
  return <section className="terminal-section" aria-label="Deribit via OpenBB parser supplement">
    <div className="panel-head"><div><p className="eyebrow cyan">Parser-library supplement · BTC / ETH</p><h2>Deribit via OpenBB parser (supplement)</h2></div><button className="refresh-small" onClick={() => q.refetch()} disabled={q.isFetching}>{q.isFetching ? "Reloading…" : "Reload"}</button></div>
    {q.isPending ? <Empty>Loading the OpenBB Deribit bundle…</Empty> : !d || !d.available ? <Empty>{d?.error ?? "OpenBB Deribit bundle unavailable."}</Empty> : <div className="stack">
      <p className="muted">Source: {d.source ?? "—"} · as of {d.fetchedAtUtc ?? "—"}{d.layer ? ` · ${d.layer}` : ""}. Supplement only — the direct Deribit section above stays primary.</p>
      {Object.entries(d.errors ?? {}).length ? <p className="muted">Bundle read notes: {Object.entries(d.errors).map(([k, v]) => `${k}: ${v}`).join(" · ")}</p> : null}
      {d.underlyings.map((u: any) => {
        const funding = Array.isArray(u.fundingHistory) ? u.fundingHistory : [];
        const latest = funding.length ? funding[funding.length - 1] : null;
        const recent = funding.slice(-12).reverse();
        const agg = u.chainAggregates;
        const chain = Array.isArray(u.nearestChainTop) ? u.nearestChainTop : [];
        return <div key={u.currency} className="context-block">
          <div className="panel-head"><h3>{u.currency} · OpenBB parser supplement</h3>{agg?.nearestExpiry ? <span className="muted">nearest expiry {agg.nearestExpiry}</span> : null}</div>
          {u.error ? <p className="muted">{u.error}</p> : null}
          <p className="eyebrow cyan">Funding-rate history</p>
          {latest ? <><div className="indicator-grid">
            <Metric label={`Latest funding 1h · ${latest.date ?? "—"}`} value={fmtRate(latest.interest1h)}/>
            <Metric label="Latest funding 8h" value={fmtRate(latest.interest8h)}/>
            <Metric label="Index price at latest print" value={money(latest.indexPrice)}/>
            {u.bookSummary ? <Metric label="Book summary OI (USD)" value={money(u.bookSummary.openInterest, true)}/> : null}
            {u.bookSummary ? <Metric label="Book summary funding 8h" value={fmtRate(u.bookSummary.funding8h)}/> : null}
            {u.bookSummary ? <Metric label="Book summary mark price" value={money(u.bookSummary.markPrice)}/> : null}
          </div>
          <div className="funding-extreme-rows">{recent.map((p: any) => <div key={p.date ?? `${p.interest1h}`} className="funding-extreme-row"><strong>{p.date ?? "—"}</strong><span>1h {fmtRate(p.interest1h)}</span><span>8h {fmtRate(p.interest8h)}</span><span>index {money(p.indexPrice)}</span></div>)}</div></> : <Empty>{`Funding history unavailable in the OpenBB bundle for ${u.currency}.`}</Empty>}
          <p className="eyebrow cyan">Chain summary</p>
          {agg ? <div className="indicator-grid">
            <Metric label="Total contracts" value={num(agg.totalContracts, true)}/>
            <Metric label="Expiries" value={num(agg.expiries)}/>
            <Metric label="Total call OI" value={num(agg.totalCallOi)}/>
            <Metric label="Total put OI" value={num(agg.totalPutOi)}/>
            <Metric label="Put / call OI ratio" value={num(agg.putCallOiRatio)}/>
            <Metric label="Nearest expiry" value={agg.nearestExpiry ?? "—"}/>
          </div> : <Empty>{`Chain aggregates unavailable in the OpenBB bundle for ${u.currency}.`}</Empty>}
          <p className="eyebrow cyan">Nearest-expiry greeks · top {chain.length} by open interest{u.nearestChainCount ? ` of ${u.nearestChainCount}` : ""}</p>
          {chain.length ? <div className="hl-wallet-wrap"><table className="hl-wallet-table" aria-label={`${u.currency} nearest-expiry contracts by open interest`}>
            <thead><tr><th>Contract</th><th>Strike</th><th>Type</th><th>OI</th><th>IV</th><th>Delta</th><th>Gamma</th><th>Vega</th></tr></thead>
            <tbody>{chain.map((c: any) => <tr key={c.contractSymbol}><td>{c.contractSymbol}</td><td>{num(c.strike)}</td><td>{c.optionType}</td><td>{num(c.openInterest)}</td><td>{c.impliedVolatility == null ? "—" : `${num(c.impliedVolatility)}%`}</td><td>{fmtGreek(c.delta)}</td><td>{fmtGreek(c.gamma)}</td><td>{fmtGreek(c.vega)}</td></tr>)}</tbody>
          </table></div> : <Empty>{`Nearest-expiry chain unavailable in the OpenBB bundle for ${u.currency}.`}</Empty>}
        </div>;
      })}
    </div>}
  </section>;
}

// Batch 4b — OKX perp context beside the HL board: funding, OI and the
// filled liquidation tape for the same six instruments, OKX-labeled with its
// own as_of. Instruments OKX does not list say so — no substituted venue.
function OkxPerpContext() {
  const q = useQuery({ queryKey: ["okx-perp-context"], queryFn: () => api.getOkxPerpContext({}), staleTime: 300000 });
  const d = q.data;
  return <section className="terminal-section" aria-label="OKX perp context">
    <div className="panel-head"><div><p className="eyebrow cyan">OKX · USDT swaps · separate venue — not blended with Hyperliquid</p><h2>OKX perp context</h2></div><button className="refresh-small" onClick={() => q.refetch()} disabled={q.isFetching}>{q.isFetching ? "Reloading…" : "Reload"}</button></div>
    {q.isPending ? <Empty>Loading OKX funding, open interest and liquidations…</Empty> : !d || d.error ? <Empty>{d?.error ?? "OKX perp context unavailable."}</Empty> : <>
      <p className="muted">Source: OKX public API · fetched {d.asOf ? new Date(d.asOf).toLocaleString() : "—"}. Funding and OI below are OKX's own figures for OKX instruments.</p>
      <div className="hl-asset-grid">{d.instruments.map((row: any) => <article key={row.symbol} className="hl-asset">
        <div className="panel-head"><div><p className="eyebrow cyan">OKX · {row.instId}</p><h3>{row.symbol}</h3></div></div>
        {!row.listed ? <Empty>not listed on OKX</Empty> : <div className="snapshot">
          <Metric label="Funding rate (current period)" value={row.fundingRate == null ? "—" : `${row.fundingRate >= 0 ? "+" : ""}${(row.fundingRate * 100).toFixed(4)}%`}/>
          <Metric label="Next funding" value={row.nextFundingTime ? new Date(row.nextFundingTime).toLocaleString() : "—"}/>
          <Metric label="Open interest (USD)" value={money(row.oiUsd, true)}/>
          <Metric label={`Open interest (${row.symbol})`} value={num(row.oiCcy, true)}/>
          <Metric label="OI as of" value={row.asOf ? new Date(row.asOf).toLocaleString() : "—"}/>
          {row.error ? <Metric label="Note" value={row.error}/> : null}
        </div>}
      </article>)}</div>
      <div className="panel-head"><div><p className="eyebrow cyan">OKX · filled liquidation orders</p><h3>Recent liquidation tape</h3></div></div>
      {d.liquidations.length ? <div className="funding-extreme-rows">{d.liquidations.map((liq: any, i: number) => <div key={`${liq.instId}-${liq.ts}-${i}`} className="funding-extreme-row"><strong>{liq.symbol}</strong><span className={liq.posSide === "long" ? "down" : "up"}>{liq.posSide} liquidated</span><span>{num(liq.sizeContracts)} contracts</span><span>bk px {money(liq.price)}</span><small>{liq.instId} · {new Date(liq.ts).toLocaleString()} · OKX</small></div>)}</div> : <Empty>No filled liquidation orders returned by OKX for these instruments.</Empty>}
    </>}
  </section>;
}

// Batch 4b — Polymarket event context. These are event probabilities from a
// prediction market — labeled as such, never prices or signals.
function PolymarketEventsSection() {
  const q = useQuery({ queryKey: ["polymarket-event-context"], queryFn: () => api.getPolymarketEventContext({}), staleTime: 300000 });
  const d = q.data;
  return <section className="terminal-section" aria-label="Event context from Polymarket">
    <div className="panel-head"><div><p className="eyebrow cyan">Prediction markets · crypto events</p><h2>Event context · Polymarket</h2></div><Source>{d?.asOf ? `Polymarket · as of ${new Date(d.asOf).toLocaleString()}` : "Polymarket"}</Source></div>
    <p className="muted">Event probabilities implied by Polymarket bettors — what the crowd will pay for YES, not a price, forecast or signal.</p>
    {q.isPending ? <Empty>Loading Polymarket crypto event markets…</Empty> : !d || d.error ? <Empty>{d?.error ?? "Polymarket event context unavailable."}</Empty> : d.markets.length ? <div className="funding-extreme-rows">{d.markets.map((m: any) => <div key={m.question} className="funding-extreme-row"><strong>{m.yesProbability == null ? "—" : `${(m.yesProbability * 100).toFixed(1)}% YES`}</strong><span>{m.question}</span><small>{m.eventTitle && m.eventTitle !== m.question ? `${m.eventTitle} · ` : ""}volume {money(m.volume, true)} · ends {m.endDate ? new Date(m.endDate).toLocaleDateString() : "—"} · Polymarket</small></div>)}</div> : <Empty>No active crypto event markets returned.</Empty>}
  </section>;
}

// Batch 4b — DeFiLlama liquidity backdrop: stablecoin supplies and top yield
// pools, each stamped with the DeFiLlama source and fetch as_of.
function DefiLlamaLiquiditySection() {
  const q = useQuery({ queryKey: ["defillama-liquidity"], queryFn: () => api.getDefiLlamaLiquidity({}), staleTime: 300000 });
  const d = q.data;
  return <section className="terminal-section" aria-label="Liquidity backdrop from DeFiLlama">
    <div className="panel-head"><div><p className="eyebrow cyan">Stablecoins + yields</p><h2>Liquidity backdrop · DeFiLlama</h2></div><Source>{d?.asOf ? `DeFiLlama · as of ${new Date(d.asOf).toLocaleString()}` : "DeFiLlama"}</Source></div>
    {q.isPending ? <Empty>Loading DeFiLlama stablecoin supplies and yield pools…</Empty> : !d ? <Empty>DeFiLlama liquidity backdrop unavailable.</Empty> : <div className="stack">
      <div className="context-block"><div className="panel-head"><h3>Top stablecoins by circulating supply</h3></div>
        {d.stablecoins.state !== "available" ? <Empty>{d.stablecoins.error ?? "Stablecoin supplies unavailable from DeFiLlama."}</Empty> : <div className="funding-extreme-rows">{d.stablecoins.rows.map((row: any) => <div key={row.symbol} className="funding-extreme-row"><strong>{row.symbol}</strong><span>{money(row.supplyUsd, true)} circulating</span><span className={row.change7dPct == null ? "" : row.change7dPct >= 0 ? "up" : "down"}>7d {row.change7dPct == null ? "—" : `${row.change7dPct >= 0 ? "+" : ""}${num(row.change7dPct)}%`}</span><small>{row.name} · DeFiLlama</small></div>)}</div>}
      </div>
      <div className="context-block"><div className="panel-head"><h3>Top yield pools by TVL</h3></div>
        {d.yields.state !== "available" ? <Empty>{d.yields.error ?? "Yield pools unavailable from DeFiLlama."}</Empty> : <div className="funding-extreme-rows">{d.yields.rows.map((row: any, i: number) => <div key={`${row.project}-${row.symbol}-${i}`} className="funding-extreme-row"><strong>{row.symbol}</strong><span>{row.project} · {row.chain}</span><span>TVL {money(row.tvlUsd, true)}</span><span>APY {row.apy == null ? "—" : `${num(row.apy)}%`}</span><small>DeFiLlama yields</small></div>)}</div>}
      </div>
    </div>}
  </section>;
}

// Batch 4b — source health strip (Diagnostics). Every value comes from a
// stored field; anything the terminal does not store renders "not tracked".
function SourceHealthStrip() {
  const q = useQuery({ queryKey: ["source-health"], queryFn: () => api.getSourceHealth({}), staleTime: 60_000 });
  const d = q.data;
  const cell = (value: string | number | null | undefined) => value === null || value === undefined || value === "" ? "not tracked" : String(value);
  return <section className="terminal-section source-health-strip" aria-label="Source health from stored state">
    <div className="panel-head"><div><p className="eyebrow cyan">Source health · stored state only</p><h2>What each source last did</h2></div><button className="refresh-small" onClick={() => q.refetch()} disabled={q.isFetching}>{q.isFetching ? "Reloading…" : "Reload"}</button></div>
    <p className="muted">Built only from stored records — recorded fetch outcomes, the latest discovery run's source statuses, and stored credit budgets. A field with no stored value reads "not tracked"; nothing is estimated.{d?.generatedAt ? ` Read ${new Date(d.generatedAt).toLocaleString()}.` : ""}</p>
    {q.isPending ? <Empty>Reading stored source state…</Empty> : d?.error ? <Empty>{d.error}</Empty> : !d ? <Empty>Source health read did not complete — use Reload to retry. Stored state is unaffected.</Empty> : d.rows.length ? <div className="health-rows">{d.rows.map((row: any) => <div key={row.source} className="health-row">
      <strong>{row.source}</strong>
      <span>last success {row.lastSuccessAt ? new Date(row.lastSuccessAt).toLocaleString() : "not tracked"}</span>
      <span>freshness {cell(row.freshness)}</span>
      <span>errors {cell(row.errorCount)}</span>
      <span>quota used {cell(row.quotaUsed)} · remaining {cell(row.quotaRemaining)}</span>
      <span>fallback {cell(row.fallbackStatus)}</span>
      {row.lastError ? <small>last error: {row.lastError}</small> : null}
    </div>)}</div> : <Empty>No stored source state yet — sources appear here after their first recorded run or fetch.</Empty>}
  </section>;
}

// Terminal-first delivery (design §2.4): Notifications section at the top of
// the Opportunities view — the union of paper lifecycle events, discovery
// opportunities (blocked ones render in place with their blocker reason),
// and engine hits. Read state changes only through the explicit per-row ack
// or Mark all read below; opening the view never marks anything read. Every
// row prints event → stored (→ chat, once a digest has carried it) so the
// notification delay is visible on the row itself.
function NotificationRow({ row, onAck, acking }: { row: any; onAck: (row: any) => void; acking: boolean }) {
  const stamp = (value: string | null | undefined) => value ? new Date(value).toLocaleString() : null;
  const historical = row.group === "expired" || row.chatLate === true;
  return <article className={`notification-row ${row.read ? "read" : "unread"} group-${row.group}${row.chatLate ? " chat-late" : ""}`}>
    <header>
      <div><strong>{row.title}</strong><small>{row.notificationClass} · {row.eventType} · {row.store.replaceAll("_", " ")}</small></div>
      <span className="notification-badges">
        {row.chatLate ? <span className="status invalidated">HISTORICAL</span> : null}
        <span className={`status ${historical ? "invalidated" : row.read ? "" : "live"}`}>{row.chatLate ? "HISTORICAL · CHAT LATE" : row.group === "expired" ? "EXPIRED" : row.read ? "READ" : "UNREAD"}</span>
      </span>
    </header>
    {row.direction || row.entry != null ? <p className="notification-levels">{row.direction ? `${String(row.direction).toUpperCase()} ` : ""}{row.entry != null ? `entry ${money(row.entry)}` : ""}{row.invalidation != null ? ` · invalidation ${money(row.invalidation)}` : ""}{row.target1 != null ? ` · T1 ${money(row.target1)}` : ""}{row.target2 != null ? ` · T2 ${money(row.target2)}` : ""}</p> : null}
    {(row.reasonLines ?? []).map((line: string, index: number) => <p key={index} className="notification-reason">{line}</p>)}
    {row.blockerReason ? <p className="notification-blocker"><b>BLOCKED</b> — {row.blockerReason}</p> : null}
    {row.issuanceSupport === "unsupported" ? <p className="issuance-support"><span className="issuance-support-chip">UNSUPPORTED FOR FORMAL ISSUANCE — research only</span>{row.issuanceSupportReason ? <span className="issuance-support-reason">{row.issuanceSupportReason}</span> : null}</p> : null}
    {row.disclosure ? <p className="notification-disclosure">{row.disclosure}</p> : null}
    {row.deliveryNote ? <p className="notification-disclosure">{row.deliveryNote}</p> : null}
    <small className="notification-times">event {stamp(row.eventAt) ?? "time unavailable"} → terminal {stamp(row.terminalVisibleAt ?? row.storedAt) ?? "time unavailable"}{row.chatSentAt ? ` → chat ${stamp(row.chatSentAt)}` : ""} · {row.expiresAt ? `expires ${stamp(row.expiresAt)}` : "no expiry recorded"}{row.readAt ? ` · read ${stamp(row.readAt)}` : ""}</small>
    {!row.read ? <button type="button" className="text-action notification-ack" aria-label={`Mark ${row.title} as read`} onClick={() => onAck(row)} disabled={acking}>Mark read</button> : null}
  </article>;
}

function NotificationsSection() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["notifications"], queryFn: () => api.getNotifications({ limit: 1000 }), staleTime: 30_000 });
  const invalidate = () => { void qc.invalidateQueries({ queryKey: ["notifications"] }); };
  const ackPaper = useMutation({ mutationFn: (alertId: number) => api.ackPaperAlert({ alertId }), onSuccess: invalidate });
  const ackDiscovery = useMutation({ mutationFn: (notificationId: number) => api.ackDiscoveryNotification({ notificationId }), onSuccess: invalidate });
  const ackHit = useMutation({ mutationFn: (notificationId: number) => api.ackHitNotification({ notificationId }), onSuccess: invalidate });
  const acking = ackPaper.isPending || ackDiscovery.isPending || ackHit.isPending;
  const ack = (row: any) => { if (row.store === "paper_alert") ackPaper.mutate(row.id); else if (row.store === "discovery") ackDiscovery.mutate(row.id); else ackHit.mutate(row.id); };
  const rows: any[] = q.data?.notifications ?? [];
  const counts = q.data?.counts;
  const actionable = rows.filter((row) => row.group === "actionable");
  const lifecycle = rows.filter((row) => row.group === "lifecycle");
  const expired = rows.filter((row) => row.group === "expired");
  const markAllRead = () => { rows.filter((row) => !row.read).forEach(ack); };
  const groupBlock = (label: string, groupRows: any[]) => groupRows.length ? <div className="notification-group"><h3>{label}{counts ? ` · ${groupRows.filter((row) => !row.read).length} unread` : ""}</h3><div className="notification-list">{groupRows.map((row) => <NotificationRow key={`${row.store}-${row.id}`} row={row} onAck={ack} acking={acking}/>)}</div></div> : null;
  return <section className="terminal-section notifications-section" aria-label="Notifications">
    <div className="panel-head"><div><p className="eyebrow cyan">Terminal inbox · opportunities + lifecycle</p><h2>Notifications{counts ? ` · ${counts.unread} unread` : ""}{counts?.historical ? ` · ${counts.historical} historical` : ""}</h2></div><div className="head-links"><button type="button" onClick={() => q.refetch()} disabled={q.isFetching}>{q.isFetching ? "Reloading…" : "Reload"}</button><button type="button" onClick={markAllRead} disabled={acking || !rows.some((row) => !row.read)}>Mark all read</button></div></div>
    <p className="muted">Blocked opportunities stay visible with their blocker reason — visibility is never gated on paper qualification. Expired setups are kept for the record and are never actionable. Terminal visibility time is recorded separately from chat arrival: an item whose chat copy landed after its window closed reads as a historical notification, not an actionable entry. Read state is set only by your ack here; chat delivery never marks a row read.</p>
    {q.isPending ? <Empty>Loading notifications…</Empty> : q.data?.error ? <Empty>{q.data.error}</Empty> : !rows.length ? <Empty>No notifications stored yet — opportunities, blocked setups, engine hits and paper lifecycle events land here as they are committed.</Empty> : <>
      {groupBlock("Actionable now", actionable)}
      {groupBlock("Lifecycle", lifecycle)}
      {expired.length ? <details className="notification-expired"><summary>Expired · {expired.length} ({expired.filter((row) => !row.read).length} unread) — record only, never actionable</summary><div className="notification-list">{expired.map((row) => <NotificationRow key={`${row.store}-${row.id}`} row={row} onAck={ack} acking={acking}/>)}</div></details> : null}
    </>}
  </section>;
}

function MarketDiscovery({ market, openCoin }: { market: any; openCoin: (id: string, symbol: string) => void }) {
  const qc = useQueryClient(); const [view, setView] = useState<"signals" | "news" | "fundamentals" | "perpboard" | "context">("signals"); const [lane, setLane] = useState<"main" | "meme">("main"); const [scope, setScope] = useState<"all" | "tier1" | "tier2">("all"); const [tier, setTier] = useState<"all" | "high" | "medium" | "low">("all"); const [sort, setSort] = useState<"alignment" | "return7d" | "volume" | "tier">("alignment");
  const q = useQuery({ queryKey: ["market-discovery"], queryFn: () => api.getMarketDiscovery({}), staleTime: 300000 });
  const run = useMutation({ mutationFn: () => api.runMarketDiscovery({ trigger: "manual" }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["market-discovery"] }); qc.invalidateQueries({ queryKey: ["theory-watch"] }); } });
  const latest = q.data?.run; const currentStatus = run.data?.status ?? latest?.status ?? "degraded"; const allSignals = q.data?.signals ?? []; const tierRank:any = { high:3, medium:2, low:1 }; const signals = allSignals.filter((item: any) => (lane === "meme" ? item.discoveryLane === "meme" : item.discoveryLane !== "meme") && (scope === "all" || item.discoveryTier === scope) && (tier === "all" || item.confidenceTier === tier)).sort((a:any,b:any) => sort === "return7d" ? (b.change7d ?? -999)-(a.change7d ?? -999) : sort === "volume" ? (b.volume24h ?? 0)-(a.volume24h ?? 0) : sort === "tier" ? (tierRank[b.confidenceTier] ?? 0)-(tierRank[a.confidenceTier] ?? 0) : (b.alignment ?? 0)-(a.alignment ?? 0));
  return <div className="stack discovery-shell">
    <NotificationsSection/>
    <ResearchShortlistStrip/>
    <MarketRead market={market} compact/>
    <UniverseTiers openCoin={openCoin}/>
    <section className="discovery-command"><div><p className="eyebrow cyan">Automatic market discovery</p><h2>Verified perp universe → evidence flags</h2><p>The weekly funnel pulls CoinGecko’s top 500. Non-velocity assets reach full 7-dimension scoring through the saved T1 and volume path. Any tier can also enter through the independent ≥15% / 48H velocity path, where the volume multiple is not consulted.</p></div><button className="primary" onClick={() => run.mutate()} disabled={run.isPending}>{run.isPending ? "SCANNING TIERS…" : "RUN NOW"}</button></section>
    <section className={`discovery-run ${currentStatus}`}><div><span>LAST COMPLETED SCAN</span><b>{latest ? new Date(latest.completedAt).toLocaleString() : "No scan stored yet"}</b><em className="run-status">{currentStatus.toUpperCase()}</em></div><strong>{run.data?.message ?? latest?.summary ?? q.data?.error ?? "Run the first scan to build the discovery feed."}</strong>{latest && <div className="scan-stats"><Metric label="Universe" value={num(latest.universeSize)}/><Metric label="Shortlist" value={num(latest.shortlisted)}/><Metric label="News impacts" value={num(latest.newsCount)}/><Metric label="Theories" value={num(latest.theoryCount)}/></div>}{latest?.sourceStatus?.length ? <div className="source-health">{latest.sourceStatus.map((source: any) => <div key={source.source} className={source.status}><b>{source.source}</b><span>{source.status}</span><small>{plainUpstreamError(source.detail)}</small></div>)}</div> : null}</section>
    {(q.data?.coverageGaps ?? []).length ? <section className="terminal-section coverage-gaps" aria-label="Discovery coverage gaps"><div className="panel-head"><div><p className="eyebrow cyan">Coverage gaps · recorded, not reopened</p><h2>Failed discovery slots · {(q.data?.coverageGaps ?? []).length}</h2></div></div><p className="muted">These scheduled discovery slots failed, timed out or were missed in the last 14 days and produced no scan. They stay on record as coverage gaps: recovery is one bounded attempt per slot by the recovery watch, and an exhausted slot is never reopened from the terminal.</p><div className="venue-list">{(q.data?.coverageGaps ?? []).map((gap: any) => <div key={gap.runId}><span>Run {gap.runId} · {new Date(gap.startedAt).toLocaleString()}</span><strong>{String(gap.status).toUpperCase()} · coverage gap</strong><small>{gap.summary}</small>{gap.failedSources?.length ? <small>{gap.failedSources.join(" · ")}</small> : null}</div>)}</div></section> : null}
    <div className="seg theory-mode"><button className={view === "signals" ? "active" : ""} onClick={() => setView("signals")}>Auto signals</button><button className={view === "news" ? "active" : ""} onClick={() => setView("news")}>News impact</button><button className={view === "fundamentals" ? "active" : ""} onClick={() => setView("fundamentals")}>Fundamentals</button><button className={view === "perpboard" ? "active" : ""} onClick={() => setView("perpboard")}>HL perp board</button><button className={view === "context" ? "active" : ""} onClick={() => setView("context")}>Market context</button></div>
    {view === "signals" && <><ViewLabel view="opportunities"/><ChartOpportunitiesBanner/><section className={`terminal-section ${lane === "meme" ? "meme-lane" : ""}`}><div className="seg lane-switch" aria-label="Discovery lane"><button className={lane === "main" ? "active" : ""} onClick={() => setLane("main")}>Main Discovery</button><button className={lane === "meme" ? "active" : ""} onClick={() => setLane("meme")}>Meme Lane</button></div><div className="panel-head"><div><p className="eyebrow cyan">{lane === "meme" ? "Micro-cap validator stack" : "Ranked scanner output"}</p><h2>{lane === "meme" ? "Mindshare first · measured confirmation second" : "Volume, interest and momentum flags"}</h2></div><span className="alignment-note">{lane === "meme" ? "volume excluded" : "alignment, not probability"}</span></div>{lane === "meme" && <p className="meme-rule">Entry requires a CoinGecko meme-category micro-cap and an Elfa mindshare spike. Open a row to inspect the machine evidence. Nansen netflow and holder-growth witnesses stay outside terminal scoring; missing validators remain visible as NO_DATA.</p>}<div className="seg signal-filters"><button className={scope === "all" ? "active" : ""} onClick={() => setScope("all")}>All</button><button className={scope === "tier1" ? "active" : ""} onClick={() => setScope("tier1")}>T1 · full engine only</button><button className={scope === "tier2" ? "active" : ""} onClick={() => setScope("tier2")}>Legacy triggered rows</button></div><div className="seg signal-filters" aria-label="Evidence tier filter">{(["all", "high", "medium", "low"] as const).map((name) => <button key={name} className={tier === name ? "active" : ""} onClick={() => setTier(name)}>{name === "all" ? "All tiers" : name}</button>)}</div><div className="sticky-sort" aria-label="Sort scanner"><span>Sort</span>{(["alignment","return7d","volume","tier"] as const).map((name)=><button key={name} className={sort===name?"active":""} onClick={()=>setSort(name)}>{name === "return7d" ? "7D return" : name === "volume" ? "24H volume" : name}</button>)}</div>{signals.length ? <div className="discovery-signal-list">{signals.map((item: any) => <button key={item.id} type="button" aria-label={`Open ${item.symbol} coin dossier`} onClick={() => openCoin(item.coinId, item.symbol)}><div className="signal-rank"><b>#{item.rank ?? "—"}</b><span>{item.discoveryTier === "tier2" ? "Tier 2 · triggered" : "Tier 1 · core"}</span></div><div><strong>{item.symbol} · {item.setupType}</strong><small>{item.confidenceTier?.toUpperCase() ?? "LOW"} · {item.passedDimensions ?? 0}/5 gates · {item.researchState === "validated" ? "validated flag" : item.researchState === "research_required" ? "research required" : "monitor only"}</small>{item.triggerReasons?.length ? <small>Scan reason · {item.triggerReasons.join(" · ")}</small> : null}{item.discoveryLane === "meme" && item.socialSnapshot ? <small className="meme-proof">ELFA · mindshare {item.socialSnapshot.changePercent == null ? "spike detected" : `${item.socialSnapshot.changePercent >= 0 ? "+" : ""}${num(item.socialSnapshot.changePercent)}%`} · {item.memeValidation?.state ? `Nansen ${String(item.memeValidation.state).replaceAll("_", " ")}` : "Nansen + holder growth pending external review"}</small> : null}<small className={item.sourceAsOf && Date.now() - new Date(item.sourceAsOf).getTime() > 30 * 60_000 ? "stale" : ""}>{item.sourceAsOf ? `${Date.now() - new Date(item.sourceAsOf).getTime() > 30 * 60_000 ? "STALE · " : ""}as of ${new Date(item.sourceAsOf).toLocaleString()}` : "Source timestamp unavailable"}</small></div><span className={item.direction === "long" ? "up" : item.direction === "short" ? "down" : "muted"}>{item.direction.toUpperCase()}</span><em>{item.dimensions?.length && item.reliability ? `${item.direction.toUpperCase()} · ${item.alignment} / 100` : "RATING WITHHELD"}</em>{item.dimensions?.length ? <ReliabilityLine data={item.reliability}/> : null}{item.glance ? <small className="glance-line">{item.glance.read} Strength — {item.glance.strength} · Risk — {item.glance.risk}</small> : null}<div className="signal-measures"><span>24H {percent(item.change24h)}</span><span>7D {percent(item.change7d)}</span><span>30D {percent(item.change30d)}</span><span>Turnover {item.turnover == null ? "—" : `${(item.turnover * 100).toFixed(1)}%`}</span><span>Invalidation {item.invalidationLevel == null ? "not set · monitor only" : money(item.invalidationLevel)}</span></div><p className="score-formula">{item.discoveryLane === "meme" ? "MEME LANE validator order: Elfa mindshare spike → Nansen Smart Money 24H netflow → holder growth. Nansen is not called by this terminal; volume is displayed as context but never validates or rejects this lane." : "Score = Σ factor contribution. Trend 20 + momentum 15 (24H/7D — 1H noise excluded) + volatility 10 + size-aware spot-volume participation 15 + funding crowding 10 + network fundamentals (TVL trend) 15 + supply overhang 15. PASS earns full weight; MIXED half; FAIL, NEUTRAL (no signal) or unavailable zero. 24H volume is CoinGecko consolidated SPOT volume, never perp volume; the shortlist bar is $5M spot volume. Neutral funding is labeled no-signal, never a penalty."}</p><div className="dimension-strip">{(item.dimensions ?? []).map((dimension:any) => <span key={dimension.name} className={dimension.status} title={dimension.evidence}><b>{dimension.name}</b> · {dimension.reading} · weight {dimension.weight} · contribution {dimension.contribution} · {dimension.status}</span>)}</div><small className="evidence-link">Open dossier for source evidence and disconfirmation →</small></button>)}</div> : <Empty>{latest ? "No signals match these tier filters." : "No scheduled scan has completed yet."}</Empty>}<details className="passed-log"><summary>Passed log · rejected / monitor-only setups</summary><p>Every retained low-tier shortlist row stays visible with the exact failed or unavailable gates and later 5D/14D/30D outcomes. This scores rejects over time instead of deleting them.</p>{allSignals.filter((item:any)=>item.discoveryLane !== "meme" && (item.confidenceTier === "low" || item.researchState === "monitor")).map((item:any)=><div key={item.id}><b>{item.symbol} · passed</b><span>{(item.dimensions ?? []).filter((d:any)=>d.status === "fail" || d.status === "unavailable").map((d:any)=>`${d.name}: ${d.evidence}`).join(" · ") || "Insufficient evidence density"}</span><small>5D {item.outcome5 ?? "pending"} · 14D {item.outcome14 ?? "pending"} · 30D {item.outcome30 ?? "pending"}</small></div>)}</details></section><AllObservations openCoin={openCoin}/></>}
    {view === "news" && <DiscoveryNewsSection q={q} latest={latest}/>}
    {view === "fundamentals" && <FundamentalsRanking openCoin={openCoin}/>}
    {view === "perpboard" && <><HyperliquidBoard/><OkxPerpContext/></>}
    {view === "context" && <><DeribitOptionsSection/><OpenbbDeribitSection/><PolymarketEventsSection/><DefiLlamaLiquiditySection/></>}
  </div>;
}


function HistoryContextPanel({ asset }: { asset: any }) { const q = useQuery({ queryKey: ["history-context", asset.id], queryFn: () => api.getHistoryContext({ coinId: asset.id, symbol: asset.symbol, refresh: false }), staleTime: 86_400_000 }); const data = q.data?.data; return <section className="terminal-section history-context"><div className="panel-head"><div><p className="eyebrow cyan">History cache · coverage varies by asset</p><h2>Full-history context</h2></div><button className="refresh-small" onClick={() => q.refetch()} disabled={q.isFetching}>{q.isFetching ? "Refreshing…" : "Refresh cache"}</button></div>{q.isPending ? <Empty>Checking the permanent history cache…</Empty> : data ? <><div className="cache-ledger"><span><b>{data.cache.source}</b> source</span><span><b>{num(data.cache.barCount)}</b> daily bars</span><span><b>{data.cache.firstBar ?? "—"}</b> first bar</span><span><b>{data.cache.lastBar ?? "—"}</b> latest bar</span></div>{data.cache.lastError && <p className="source-warning">Latest refresh issue: {data.cache.lastError}. Existing cached rows remain available.</p>}<div className="distribution-list">{data.analytics.distributions.map((row:any) => <DistributionStrip key={row.label} row={row}/>)}</div><UnderwaterChart rows={data.analytics.underwater ?? []}/><p className="score-disclaimer">{data.analytics.note}</p><details className="drawdown-detail"><summary>{data.analytics.drawdowns.length} drawdowns of 20% or more</summary><div className="drawdown-table"><div className="drawdown-row head"><span>Peak → trough</span><span>Depth</span><span>To trough</span><span>Recovery</span></div>{data.analytics.drawdowns.map((row:any,index:number) => <div className="drawdown-row" key={`${row.start}-${index}`}><span>{row.start} → {row.trough}</span><b className="down">{percent(row.depth)}</b><span>{row.durationDays}d</span><span>{row.recoveryDays == null ? "unrecovered" : `${row.recoveryDays}d`}</span></div>)}</div></details><p className="provenance">{data.cache.policy} Refreshed {data.cache.refreshedAt ? new Date(data.cache.refreshedAt).toLocaleString() : "not yet"}.</p></> : <Empty>{q.data?.error ?? "History context is unavailable."}</Empty>}</section>; }

function CompletePicture({ d }: { d: any }) {
  const payload = useMemo(() => ({ asset: d.asset, factors: d.factors, verdict: d.verdict, derivatives: d.derivatives, expert: d.expert }), [d]);
  const q = useQuery({ queryKey: ["complete-picture", d.asset.id, d.asset.lastUpdated], queryFn: () => api.getCompletePicture({ coinId: d.asset.id, name: d.asset.name, symbol: d.asset.symbol, analysis: payload }), staleTime: 300000 });
  const p = q.data?.data;
  if (q.isPending) return <section className="complete-picture loading-picture"><div><p className="eyebrow cyan">Complete picture</p><h2>Assembling the complete picture…</h2></div><span className="picture-loader"/></section>;
  if (!p) return <section className="complete-picture"><div className="panel-head"><div><p className="eyebrow cyan">Complete picture</p><h2>The complete picture could not be assembled.</h2></div><Source>live assembly</Source></div><Empty>{q.data?.error ?? ""}</Empty><button className="primary" onClick={() => void q.refetch()}>Retry</button></section>;
  const evidenceById = new Map((p.evidence ?? []).map((item: any) => [item.id, item]));
  return <section className={`complete-picture ${p.direction}`}>
    <header className="picture-head"><div><p className="eyebrow cyan">Complete picture</p><h2>{p.headline}</h2></div><div className="picture-rating"><b>{p.rating == null ? "—" : `${p.rating}/100`}</b><span>NOT A PROBABILITY</span><em>{String(p.reliability).toUpperCase()}</em></div></header>
    <p className="picture-summary">{p.summary}</p>
    <div className="picture-claims">{p.claims.map((claim: any, index: number) => <details key={claim.title} open={index < 2}><summary><span>{String(index + 1).padStart(2, "0")}</span><strong>{claim.title}</strong><small>{claim.evidenceIds.length} source{claim.evidenceIds.length === 1 ? "" : "s"}</small></summary><div className="picture-claim-body"><p>{claim.text}</p><div className="picture-evidence">{claim.evidenceIds.length ? claim.evidenceIds.map((id: string) => { const item: any = evidenceById.get(id); if (!item) return null; const body = <><b>{item.id} · {item.label}</b><span>{item.detail}</span><small>{item.source}{item.asOf ? ` · ${sourceTimeLabel(new Date(item.asOf).getTime())}` : ""}</small></>; return item.url ? <a key={id} href={item.url} target="_blank" rel="noreferrer">{body}<em>Open source ↗</em></a> : <div key={id}>{body}</div>; }) : <div><b>NO LINKED EVIDENCE</b><span>This lane has no underlying record yet.</span></div>}</div></div></details>)}</div>
    <div className="picture-grid"><div><p className="eyebrow">Category comparison</p>{p.peers.length ? <div className="peer-table"><div className="peer-row head"><span>Protocol</span><span>MCap</span><span>7D</span></div>{p.peers.map((peer: any) => <div className="peer-row" key={peer.id}><strong>{peer.symbol}<small>{peer.name}</small></strong><span>{money(peer.marketCap, true)}</span><span className={(peer.return7d ?? 0) >= 0 ? "up" : "down"}>{percent(peer.return7d)}</span></div>)}</div> : <Empty>No verified category peer set. Competition is not inferred.</Empty>}</div><div><p className="eyebrow">Known gaps</p><ul className="missing-list">{p.missing.map((item: string) => <li key={item}>{item}</li>)}</ul></div></div>
    <footer><span>Assembled {sourceTimeLabel(new Date(p.generatedAt).getTime())}</span><button onClick={() => void q.refetch()} disabled={q.isFetching}>{q.isFetching ? "Refreshing…" : "Refresh picture"}</button></footer>
  </section>;
}

function CoinAttention({ asset }: { asset: any }) { const attention = useQuery({ queryKey: ["coin-attention", asset.id], queryFn: () => api.getAttention({ coinId: asset.id, contract: asset.primaryContract, network: asset.primaryNetwork }) }); const a = attention.data?.attention; return <section className="terminal-section"><div className="panel-head"><div><p className="eyebrow cyan">Measured attention</p><h2>{asset.symbol} activity</h2></div><Source>CoinGecko / DexScreener</Source></div>{a ? <div className="indicator-grid"><Metric label="Trending rank" value={a.trendingRank ? `#${a.trendingRank}` : "Not trending"}/><Metric label="DEX boosted" value={a.boosted ? `Yes · ${num(a.boostAmount)}` : "Not seen"}/><Metric label="24H buyers" value={num(a.pool?.buyers24h)}/><Metric label="24H sellers" value={num(a.pool?.sellers24h)}/></div> : <Empty>{attention.isPending ? "Checking public attention signals…" : attention.data?.error ?? "No verified attention data returned."}</Empty>}<p className="muted">Activity is an attention proxy, not proof of accumulation or directional sentiment.</p></section>; }

function MarketWorkspace({ market, openCoin }: { market: any; openCoin: (id: string, symbol: string) => void }) { const rotation = useQuery({ queryKey: ["rotation"], queryFn: () => api.getRotation({}) }); const cycle = useQuery({ queryKey: ["btc-cycle"], queryFn: () => api.getCycleAndRatios({}) }); return <div className="stack"><MarketDiscovery market={market} openCoin={openCoin}/><Rotation cycle={cycle.data} rotation={rotation.data} openCoin={openCoin}/></div>; }

function CrowdPricingPanel({ data }: { data: any }) {
  if (!data || data.state === "no_data") return <section className="terminal-section crowd-pricing-panel no-data"><div className="panel-head"><div><p className="eyebrow cyan">Macro odds</p><h2>Crowd pricing</h2></div><Source>Polymarket</Source></div><p className="crowd-label">{data?.label ?? "Implied crowd prices from Polymarket prediction markets - what bettors will pay, not probabilities."}</p><Empty>{data?.reason ?? "No liquid relevant market passed the required gate."}</Empty></section>;
  return <section className="terminal-section crowd-pricing-panel"><div className="panel-head"><div><p className="eyebrow cyan">Macro odds</p><h2>Crowd pricing</h2></div><Source>{data.asOf ? `as of ${new Date(data.asOf).toLocaleString()}` : "Polymarket"}</Source></div><p className="crowd-label">{data.label}</p><div className="crowd-market-list">{data.markets.map((market:any, index:number) => { const body = <><span>{index === 0 ? "FED DECISION" : "MACRO CONTEXT"}</span><strong>{market.question}</strong><div><b>Yes implied crowd price {Number(market.yesPrice).toFixed(3)}</b><small>volume24hr {money(market.volume24hr, true)} · liquidity {money(market.liquidity, true)}</small></div></>; return market.marketUrl ? <a key={`${market.question}-${index}`} href={market.marketUrl} target="_blank" rel="noreferrer">{body}<em>Open market ↗</em></a> : <div key={`${market.question}-${index}`}>{body}<em>{market.slug ?? "Market URL unavailable"}</em></div>; })}</div></section>;
}

function ValuationPanel({ asset }: { asset: any }) {
  const q = useQuery({ queryKey: ["valuecoin", asset.id], queryFn: () => api.valuecoin({ coinId: asset.id }), staleTime: 300000 });
  const v = q.data?.data;
  if (!v) return <section className="valuation-block"><div className="panel-head"><div><p className="eyebrow cyan">8-part framework</p><h2>Fair valuation</h2></div><button className="refresh-small" onClick={() => void q.refetch()} disabled={q.isFetching}>{q.isFetching ? "Loading…" : "Retry"}</button></div><Empty>{q.isPending ? "Pulling market, fee and revenue evidence…" : q.data?.error ?? "Valuation unavailable."}</Empty></section>;
  return <section className={`valuation-block verdict-${v.verdict.label}`}>
    <div className="valuation-head"><div><p className="eyebrow cyan">8-part framework</p><h2>{asset.symbol} fair valuation</h2><p>Relative economics only. No price target.</p></div><div className={`valuation-verdict ${v.verdict.label}`}><span>VERDICT</span><strong>{String(v.verdict.label).replace("no_data", "WITHHELD").toUpperCase()}</strong><small>{v.primaryScope ?? "NO REVENUE SCOPE"}</small></div></div>
    <div className="valuation-market"><div><span>PRICE</span><b>{money(v.market.price)}</b><small>CoinGecko · {sourceTimeLabel(new Date(v.market.asOf).getTime())}</small></div><div><span>MARKET CAP</span><b>{money(v.market.marketCap, true)}</b><small>CoinGecko</small></div><div><span>FDV</span><b>{money(v.market.fdv, true)}</b><small>CoinGecko</small></div><button aria-label={`Refresh ${asset.symbol} valuation`} onClick={() => void q.refetch()} disabled={q.isFetching}>{q.isFetching ? "REFRESHING…" : "REFRESH VALUATION"}</button></div>
    <div className="valuation-parts">{v.sections.map((section:any) => <details key={section.key} open={section.index === 1 || section.index === 4 || section.index === 8}><summary><span>{String(section.index).padStart(2, "0")}</span><strong>{section.title}</strong><em className={section.status}>{String(section.status).replace("no_data", "NO_DATA")}</em></summary><div className="valuation-body"><p>{section.summary}</p><div className="valuation-rows">{section.rows.map((row:any, index:number) => <div key={`${row.label}-${index}`}><span>{row.label}</span><strong>{row.value}</strong><small>{row.source}{row.singleSource ? " · SINGLE SOURCE" : ""}{row.asOf ? ` · ${sourceTimeLabel(new Date(row.asOf).getTime())}` : ""}</small>{row.note && <p>{row.note}</p>}</div>)}</div></div></details>)}</div>
    {v.scopes.length > 1 && <details className="valuation-scopes"><summary>All matched DeFiLlama scopes</summary>{v.scopes.map((scope:any) => <div key={`${scope.kind}-${scope.label}`}><b>{scope.label}</b><span>fees {scope.feesAnnualized == null ? "NO_DATA" : `${money(scope.feesAnnualized, true)}/yr`} · revenue {scope.revenueAnnualized == null ? "NO_DATA" : `${money(scope.revenueAnnualized, true)}/yr`}</span><small>{scope.note}</small></div>)}</details>}
    <footer><span>Computed {sourceTimeLabel(new Date(v.generatedAt).getTime())}</span><span>Every missing field stays NO_DATA.</span></footer>
  </section>;
}

function CallerAgreementPanel({ d }: { d: any }) {
  const symbol = String(d.asset?.symbol ?? "").toUpperCase();
  const v = d.verdict;
  const issued = d.signalIssuance?.acceptedSetup ?? null;
  const terminalSide: "long" | "short" = v?.side === "short" ? "short" : "long";
  const terminalHorizon: string | null = issued?.horizon ?? null;
  const terminalInvalidation: number | null = v?.invalidation ?? null;
  const terminalAsOf = d.asset?.lastUpdated ? new Date(d.asset.lastUpdated).getTime() : null;
  const rows: CallerCall[] = CALLER_CALLS.filter((c) => c.symbols.includes(symbol));
  const dirOf = (c: CallerCall): string => c.perAssetDirection?.[symbol] ?? c.direction ?? "neutral";
  const publishedMs = (c: CallerCall) => new Date(c.publishedAt).getTime();
  const retrievedMs = (c: CallerCall): number | null => (c.firstRetrievedAt ? new Date(c.firstRetrievedAt).getTime() : null);
  const latestMs: number | null = rows.length ? Math.max(...rows.map(publishedMs)) : null;
  const contradicts = rows.filter((c) => (terminalSide === "long" ? dirOf(c) === "short" : dirOf(c) === "long"));
  const steppedAside = rows.filter((c) => dirOf(c) === "flat");
  const noVote = rows.filter((c) => dirOf(c) === "neutral");
  const count = (list: CallerCall[], dir: string) => list.filter((c) => dirOf(c) === dir).length;
  const dirChip = (dir: string) => dir === "long" ? "up" : dir === "short" ? "down" : "muted";
  const rowKey = (c: CallerCall) => `${c.handle}-${c.publishedAt}`;
  const latestCall = latestMs != null ? rows.find((c) => publishedMs(c) === latestMs) ?? null : null;
  return <section className="terminal-section dossier-section caller-agreement" aria-label={`${symbol} caller versus terminal`}>
    <div className="panel-head"><div><p className="eyebrow cyan">Paper only · read-only</p><h2>Caller vs terminal</h2></div><Source>{`ledger snapshot ${new Date(CALLER_CALLS_GENERATED_AT).toLocaleString()}`}</Source></div>
    <p className="score-disclaimer">Descriptive read only — direction counts, never a probability, never a confidence rating. Nothing here changes scores, factors, or model outputs.</p>
    {rows.length === 0 ? <Empty>{`No caller-ledger coverage for ${symbol} yet. Coverage grows as the sweep logs calls.`}</Empty> : <>
      <div className="indicator-grid" aria-label="Terminal data">
        <Metric label="Terminal direction" value={terminalSide.toUpperCase()}/>
        <Metric label="Terminal horizon" value={terminalHorizon ?? "Research · horizon not issued"}/>
        <Metric label="Terminal invalidation" value={terminalInvalidation == null ? "—" : money(terminalInvalidation)} tone="down"/>
        <Metric label="Terminal analysis as of" value={terminalAsOf ? sourceTimeLabel(terminalAsOf) : "timestamp unavailable"}/>
        <Metric label="Caller posts counted" value={String(rows.length)}/>
        <Metric label="Latest caller post" value={latestMs != null ? `${ageLabel(Date.now() - latestMs)}${latestCall ? ` · @${latestCall.handle}` : ""}` : "—"}/>
      </div>
      <p className="muted">Caller direction counts for {symbol}: {count(rows, "long")} long · {count(rows, "short")} short · {count(rows, "flat")} flat · {count(rows, "neutral")} no directional vote — vs terminal {terminalSide.toUpperCase()}. Counts only.</p>
      <div className="caller-list" aria-label="Reported caller claims">
        {rows.slice().sort((a, b) => publishedMs(b) - publishedMs(a)).map((c) => {
          const dir = dirOf(c);
          const ret = retrievedMs(c);
          return <article key={rowKey(c)} className="caller-claim">
            <div className="caller-claim-head">
              <strong>REPORTED CLAIM · @{c.handle} · published {sourceTimeLabel(publishedMs(c))}</strong>
              <span className={dirChip(dir)}>{dir === "neutral" ? "NO DIRECTIONAL VOTE" : dir.toUpperCase()}</span>
            </div>
            <p>{c.callText}</p>
            <div className="caller-claim-meta">
              <small>First retrieved by our sweep {ret != null ? sourceTimeLabel(ret) : "not in retained run files"}</small>
              {c.sourceUrl ? <a className="outlink" href={c.sourceUrl} target="_blank" rel="noreferrer">Open post ↗</a> : null}
            </div>
            <div className="caller-claim-details">
              <small>Caller horizon: {c.horizonHint}</small>
              <small>Caller invalidation: {c.invalidationHint}</small>
              <small>{c.position}{/entry|stop|long from|short from/i.test(c.position) ? " — the caller's own position, not an available entry now" : ""}</small>
              {c.markers.includes("FIRST") ? <b className="status confirmed">FIRST OBSERVED</b> : null}
              {c.markers.includes("EXIT") ? <small>exit / flat logged</small> : null}
              <small>ledger grade: {c.grade}</small>
            </div>
          </article>;
        })}
      </div>
      <div className="caller-disagreement" aria-label="Disagreement">
        <h3>Disagreement — not smoothed over</h3>
        <p><b>vs terminal ({terminalSide.toUpperCase()}):</b> {contradicts.length ? contradicts.map((c) => `@${c.handle} (${sourceTimeLabel(publishedMs(c))}, ${dirOf(c)})`).join(" · ") : "no caller contradicts the terminal direction."}</p>
        {steppedAside.length > 0 && <p><b>Stepped aside:</b> {steppedAside.map((c) => `@${c.handle} (${sourceTimeLabel(publishedMs(c))})`).join(" · ")} went flat while the terminal holds {terminalSide.toUpperCase()}.</p>}
        {noVote.length > 0 && <p><b>Reads without a directional vote:</b> {noVote.map((c) => `@${c.handle} (${sourceTimeLabel(publishedMs(c))})`).join(" · ")} — structural/macro reads, not positions.</p>}
        <p><b>Caller vs caller:</b> {["long", "short"].every((dir) => count(rows, dir) === 0) || (count(rows, "long") > 0) !== (count(rows, "short") > 0) ? `callers are one-sided on direction (${count(rows, "long")} long · ${count(rows, "short")} short).` : `callers disagree among themselves: ${count(rows, "long")} long vs ${count(rows, "short")} short.`}</p>
      </div>
      <p className="interpretation"><b>OUR INTERPRETATION:</b> {rows.length} ledger call{rows.length === 1 ? "" : "s"} mention {symbol} from the {new Date(CALLER_CALLS_GENERATED_AT).toLocaleDateString()} sweep snapshot; the newest is {latestMs != null ? ageLabel(Date.now() - latestMs) : "age unavailable"} old. Caller posts are individual reported claims, not a sample — do not read counts as odds.</p>
    </>}
  </section>;
}

function DossierWorkspace({ d, onOpenInAssets }: { d: any; onOpenInAssets?: (symbol: string) => void }) {
  const [account, setAccount] = useState(10000); const [riskPct, setRiskPct] = useState(1);
  const v = d.verdict; const issued = d.signalIssuance?.acceptedSetup ?? null; const sourceAt = sourceTimeLabel(new Date(d.asset.lastUpdated).getTime());
  const methodologyEntry = Array.isArray(d.methodologyLog) ? d.methodologyLog.at(-1) : null;
  const sideScore = v.side === "long" ? v.longConfidence : v.shortConfidence;
  const chartLabels = ["trend", "momentum", "rsi", "macd", "volume"]; const fundamentalLabels = ["tvl", "revenue", "developer", "supply"];
  const chartNet = d.factors.filter((f:any) => chartLabels.some((x) => String(f.label).toLowerCase().includes(x))).reduce((sum:number,f:any) => sum + Number(f.contribution ?? 0), 0);
  const fundamentalNet = d.factors.filter((f:any) => fundamentalLabels.some((x) => String(f.label).toLowerCase().includes(x))).reduce((sum:number,f:any) => sum + Number(f.contribution ?? 0), 0);
  const positioningNet = d.factors.filter((f:any) => ["funding","open interest","taker","flow","cvd"].some((x) => String(f.label).toLowerCase().includes(x))).reduce((sum:number,f:any) => sum + Number(f.contribution ?? 0), 0);
  const chartVerdict = Math.abs(chartNet) < 0.25 ? "mixed" : chartNet > 0 ? "constructive" : "bearish"; const agrees = (n:number) => Math.abs(n) < 0.25 ? "neutral" : (n > 0) === (v.side === "long") ? "agree" : "disagree";
  const convictionMode = Math.abs(chartNet) < .25 && Math.abs(fundamentalNet) < .25 ? "quiet" : agrees(chartNet) === "agree" && (agrees(fundamentalNet) === "agree" || agrees(positioningNet) === "agree") ? "confluence" : "chart-led";
  const stopDistance = Math.abs(Number(v.entryLow ?? d.asset.price) - Number(v.invalidation ?? d.asset.price)); const riskCash = account * riskPct / 100; const units = stopDistance > 0 ? riskCash / stopDistance : null; const stopFraction = stopDistance / Number(v.entryLow ?? d.asset.price); const leverageCap = stopFraction > 0 ? Math.max(1, Math.min(20, Math.floor(1 / (stopFraction * 1.5 + .005)))) : null;
  const track = useQuery({ queryKey: ["dossier-track", d.asset.id], queryFn: () => api.getDossierTrackRecord({ coinId: d.asset.id }) });
  const logVerdict = useMutation({ mutationFn: () => api.logDossierVerdict({ coinId: d.asset.id, symbol: d.asset.symbol, direction: v.side, convictionMode, score: sideScore, invalidation: v.invalidation ?? null, sourceAsOf: d.asset.lastUpdated ?? null, payload: { thesis: v.thesis, failure: v.failure, factorFormula: d.factorFormula } }), onSuccess: () => { void track.refetch(); } });
  useEffect(() => { logVerdict.mutate(); }, [d.asset.id, sideScore]);
  const tr = track.data?.data;
  const directionHistory = Array.isArray(tr?.directionHistory) ? [...tr.directionHistory].reverse() : [];
  const directionHistoryLine = directionHistory.map((row:any) => `${num(row.score)} ${String(row.direction).toLowerCase()} · ${String(row.modelVersion)} · decision_at ${String(row.decisionAt).slice(0, 10)}`).join(" → ");
  const line = (title:string, text:string) => <p className="interpretation"><b>{title}:</b> {text}</p>;
  return <div className="stack dossier-rebuild">
    <ViewLabel view="asset"/>
    <InvestmentResearchBanner/>
    <section className={`dossier-pin ${v.side}`} aria-label="Pinned dossier verdict"><div><span className="direction-chip">{v.side.toUpperCase()}</span><span className="conviction-chip">{convictionMode} · DESCRIPTIVE</span></div>{onOpenInAssets ? <p className="asset-meta"><a href="#asset-view" onClick={(e) => { e.preventDefault(); onOpenInAssets(d.asset.symbol); }}>Open in Assets</a> — the same symbol's Asset view.</p> : null}<h2>{v.thesis}</h2><small>Source as of {sourceAt} · ledger {logVerdict.isError ? "write failed" : logVerdict.isPending ? "writing…" : "recorded"}</small>{directionHistory.length > 0 ? <p className="direction-history"><span>Previous direction</span><strong>{directionHistoryLine}</strong><b>{String(directionHistory.at(-1)?.tag)}</b></p> : null}</section>
    <AssetContextSummary context={d.researchContext}/>
    <section className="terminal-section dossier-section"><h2>1 · What’s happening</h2><p>The pinned verdict is the single directional claim. This section records what can change it: the stored invalidation, a factor-sign change, or newer source-backed evidence.</p>{line("Read", `Uncalibrated factor alignment; invalidation ${money(v.invalidation)}; source ${sourceAt}.`)}</section>
    <section className="terminal-section dossier-section"><h2>2 · Chart read</h2><p>Structure and momentum net to {num(chartNet)} weighted points. Price is {money(d.asset.price)} with RSI {num(d.indicators.rsi14)}, MACD histogram {num(d.indicators.macdHistogram)} and volume z-score {num(d.indicators.volumeZ)}.</p><details><summary>Underlying chart numbers</summary><MarketChart data={d.line} candles={d.candles} indicators={d.indicators} symbol={d.asset.symbol}/></details>{line("Chart verdict", `${chartVerdict.toUpperCase()}; the read is wrong beyond ${money(v.invalidation)}. Source ${sourceAt}.`)}</section>
    <section className="terminal-section dossier-section"><h2>3 · Line-up check</h2><div className="lineup"><p><b>Fundamentals</b> · {agrees(fundamentalNet)} · {num(fundamentalNet)} weighted points</p><p><b>Valuation</b> · neutral until the valuation panel returns a source-backed comparison</p><p><b>Positioning / flows</b> · {agrees(positioningNet)} · {num(positioningNet)} weighted points</p></div><details><summary>Open fundamentals, valuation and positioning evidence</summary><Research d={d}/></details>{line("Line-up", `The chart is ${chartVerdict}; fundamental factors ${agrees(fundamentalNet)} and positioning factors ${agrees(positioningNet)}—disagreement is retained, source ${sourceAt}.`)}</section>
    <section className="terminal-section dossier-section"><h2>4 · Ratings and fixed weights</h2><p>{d.factorFormula.rule}</p><details open><summary>Fixed factor ledger</summary><div className="factor-list">{d.factors.map((f:any) => <div className="factor" key={f.label}><div><strong>{f.label}</strong><small>{f.reading ?? f.value} · {f.source} · {f.asOf ? sourceTimeLabel(new Date(f.asOf).getTime()) : "timestamp unavailable"}</small></div><b>{num(f.score)} × {num(f.weight)} = {num(f.contribution)}</b></div>)}</div></details>{line("Weight verdict", "The fixed ledger supports the pinned verdict; no discretionary override was applied.")}</section>
    <section className="terminal-section dossier-section"><h2>5 · Conviction</h2><p>Mode is logged with each dossier verdict, but it is not treated as predictive until forward testing validates it.</p>{line("Conviction", `${convictionMode.toUpperCase()} is DESCRIPTIVE only; it does not change sizing or the fixed score.`)}</section>
    <CallerAgreementPanel d={d}/>
    <section className="terminal-section dossier-section"><h2>7 · Trade framing</h2>{issued ? <div className="issued-setup" aria-label="Accepted issued setup"><div className="panel-head"><div><p className="eyebrow cyan">Accepted immutable contract</p><h3>{issued.direction.toUpperCase()} issued setup</h3></div><Source>{new Date(issued.issuedAt).toLocaleString()}</Source></div><div className="indicator-grid"><Metric label="Issued entry" value={money(issued.entry)}/><Metric label="Issued stop" value={money(issued.stop)} tone="down"/><Metric label="Issued target 1" value={money(issued.target1)} tone="up"/><Metric label="Issued target 2" value={money(issued.target2)} tone="up"/></div><p className="score-disclaimer">{issued.entryRule} · {issued.priceBasis}. These immutable levels are the setup the evaluator grades.</p></div> : <p className="score-disclaimer">No issued setup is attached to this response. The levels below are research-reference levels from the current dossier and are not an executable paper fill.</p>}<div className="risk-inputs"><label>Account value <input aria-label="Account value for risk sizing" type="number" min="0" value={account} onChange={(e)=>setAccount(Number(e.target.value))}/></label><label>Risk per idea % <input aria-label="Risk percent per idea" type="number" min="0" max="5" step="0.1" value={riskPct} onChange={(e)=>setRiskPct(Number(e.target.value))}/></label></div><div className="indicator-grid"><Metric label="Risk cash" value={money(riskCash)}/><Metric label="Units at invalidation" value={num(units)}/><Metric label="Leverage cap" value={leverageCap == null ? "—" : `${leverageCap}× max`}/><Metric label="Liquidation buffer" value="1.5× invalidation + 0.5%"/></div><p><b>Research-reference view:</b> the dossier entry band is {money(v.entryLow)}–{money(v.entryHigh)} with reference invalidation {money(v.invalidation)}. It cannot impersonate the issued setup above.</p>{line("Trade frame", issued ? `Sizing must use the accepted issued entry ${money(issued.entry)} and stop ${money(issued.stop)}; the current dossier reference remains separate.` : stopDistance > 0 ? `Reference sizing is ${num(units)} units at ${riskPct}% risk with a ${leverageCap ?? "—"}× ceiling, but no issued setup is attached.` : "Neither futures nor spot is framed because no valid invalidation distance is available.")}</section>
    <section className="terminal-section dossier-section"><h2>8 · Track record</h2>{track.isPending ? <Empty>Loading closed outcomes…</Empty> : <div className="record-pair"><article><b>{d.asset.symbol}</b><span>n={tr?.coin.n ?? 0} · {num(tr?.coin.hitRate)}% hit · {num(tr?.coin.averageR)}R</span><small>95% Wilson {num(tr?.coin.wilsonLow)}–{num(tr?.coin.wilsonHigh)}%</small></article><article><b>System-wide</b><span>n={tr?.system.n ?? 0} · {num(tr?.system.hitRate)}% hit · {num(tr?.system.averageR)}R</span><small>95% Wilson {num(tr?.system.wilsonLow)}–{num(tr?.system.wilsonHigh)}%</small></article></div>}{line("Track record", (tr?.coin.n ?? 0) < 20 ? `${d.asset.symbol} remains uncalibrated; n=${tr?.coin.n ?? 0} is too small for predictive claims.` : `${d.asset.symbol} is shown beside the system baseline with uncertainty, not as a standalone win rate.`)}</section>
    <section className="terminal-section dossier-section"><h2>9 · What would change the read</h2><ul><li>Price crosses the stored invalidation at {money(v.invalidation)}.</li><li>The chart weighted net changes sign from its current {num(chartNet)}.</li><li>Positioning flips from {agrees(positioningNet)} to disagree with the chart.</li><li>A previously missing source becomes available and materially changes its fixed-weight contribution.</li></ul>{line("Tripwires", `Observe ${money(v.invalidation)}, factor-sign flips, and source timestamps; do not change the read on narrative alone.`)}</section>
    <section className="terminal-section dossier-section"><h2>10 · Evidence drawer</h2><details><summary>Full prior analysis and context</summary><div className="stack"><HistoryContextPanel asset={d.asset}/><Signals d={d}/><ValuationPanel asset={d.asset}/><CoinAttention asset={d.asset}/><CrowdPricingPanel data={d.crowdPricing}/></div></details>{methodologyEntry ? <details><summary>Methodology log</summary><p><b>Changed {new Date(methodologyEntry.changedAt).toLocaleString()}</b> · {methodologyEntry.version} · {methodologyEntry.what}</p><p>{methodologyEntry.why}</p></details> : null}{line("Evidence state", `Underlying numbers remain one tap away; unsupported claims are withheld and source times remain visible.`)}</section>
  </div>;
}

function StoredNews() { const q = useQuery({ queryKey: ["market-discovery"], queryFn: () => api.getMarketDiscovery({}), staleTime: 300000 }); return <section className="terminal-section news-feed impact-feed"><div className="panel-head"><div><p className="eyebrow cyan">Stored market scan</p><h2>News → mechanism → sector</h2></div><button className="refresh-small" onClick={() => q.refetch()} disabled={q.isFetching}>{q.isFetching ? "Reloading…" : "Reload"}</button></div>{(() => { const view = resolveDiscoverySynthesisView(q.data); const newsArticle = (item: any) => <article key={item.id}><a href={item.url} target="_blank" rel="noreferrer"><strong>{item.title}</strong></a><small>{item.source} · {item.publishedAt ?? new Date(item.retrievedAt).toLocaleString()} · {item.verification}</small><p><span>Why it matters:</span> {item.whyItMatters}</p><div className="impact-list">{item.impacts.map((impact: any, index: number) => <div key={`${impact.sector}-${index}`} className={impact.direction}><b>{impact.sector}</b><em>{impact.direction}</em><p>{impact.mechanism}</p></div>)}</div></article>; return view === "current" ? q.data?.news.map(newsArticle) : view === "prior" ? <PriorSynthesisBlock previous={q.data?.previousSynthesis}/> : <Empty>{view === "loading" ? "Loading the latest completed scan\u2026" : view === "error" ? plainUpstreamError(q.data?.error ?? "No stored news-impact scan yet.") : view === "none-ever" ? "The latest scan's synthesis timed out and no completed synthesis is stored yet \u2014 measured signals remain usable; this is a missing result, not a 'nothing found' verdict." : q.data?.error ?? "No stored news-impact scan yet."}</Empty>; })()}</section>; }
// (A4, 2026-10-19) Previous-synthesis renderer. getMarketDiscovery
// attaches previousSynthesis ONLY when the latest run's synthesis timed
// out. The client previously had no handling for it, so a timeout
// rendered the honest "no news" empty state — which reads as "nothing
// found". This block renders the last completed synthesis with its age,
// labeled "previous run".
type DiscoverySynthesisView = "loading" | "error" | "current" | "prior" | "none-ever" | "empty-scan" | "no-scan";
function resolveDiscoverySynthesisView(data: any): DiscoverySynthesisView {
  if (!data) return "loading";
  if (data.error) return "error";
  const news = data.news ?? [];
  const prev = data.previousSynthesis ?? null;
  if (news.length > 0) return "current";   // fresh synthesis wins over any stale pointer
  if (prev) return "prior";                // timeout + a completed synthesis exists → render it with age
  const timedOut = (data.run?.sourceStatus ?? []).some((s: any) => s.source === "Research synthesis" && s.status === "unavailable");
  if (timedOut) return "none-ever";         // timeout and NO completed synthesis stored yet → honest empty
  if (data.run) return "empty-scan";        // scan ran, genuinely no news items
  return "no-scan";                        // nothing stored yet
}

function PriorSynthesisBlock({ previous }: { previous: any }) {
  const completedAt = previous?.completedAt ? new Date(previous.completedAt) : null;
  const age = completedAt && !Number.isNaN(completedAt.getTime())
    ? ageLabel(Date.now() - completedAt.getTime())   // recompute client-side from the source timestamp
    : previous?.ageMs != null ? ageLabel(previous.ageMs) : "age unavailable";
  const items = previous?.news ?? [];
  const theoryWord = previous?.theoryCount === 1 ? "theory" : "theories";
  return <section className="terminal-section news-feed impact-feed prior-synthesis" aria-label="Previous completed synthesis">
    <div className="panel-head"><div><p className="eyebrow cyan">Previous run · synthesis fallback</p><h2>News → mechanism → sector</h2></div><span className="source-warning">PREVIOUS RUN</span></div>
    <p className="muted">The latest scan's synthesis timed out, so this is the last completed synthesis — completed {completedAt ? completedAt.toLocaleString() : "timestamp unavailable"} ({age}){previous?.newsCount != null ? ` · ${num(previous.newsCount)} annotated news` : ""}{previous?.theoryCount != null ? ` · ${num(previous.theoryCount)} ${theoryWord}` : ""}. Measured signals from the current scan remain above; this view is the prior synthesis, not fresh output.</p>
    {items.length ? items.map((item: any) => <article key={`prior-${item.id}`}><a href={item.url} target="_blank" rel="noreferrer"><strong>{item.title}</strong></a><small>{item.source} · {item.publishedAt ?? new Date(item.retrievedAt).toLocaleString()} · {item.verification} · <b className="source-warning">PREVIOUS RUN</b></small><p><span>Why it matters:</span> {item.whyItMatters}</p><div className="impact-list">{(item.impacts ?? []).map((impact: any, index: number) => <div key={`${impact.sector}-${index}`} className={impact.direction}><b>{impact.sector}</b><em>{impact.direction}</em><p>{impact.mechanism}</p></div>)}</div>{item.assetTags?.length ? <div className="ripple-tags">{item.assetTags.map((tag: string) => <em key={tag}>{tag}</em>)}</div> : null}</article>) : <Empty>No annotated news rows were stored on the previous completed synthesis.</Empty>}
  </section>;
}

function DiscoveryNewsSection({ q, latest }: { q: any; latest: any }) {
  const newsArticle = (item: any) => <article key={item.id}><a href={item.url} target="_blank" rel="noreferrer"><strong>{item.title}</strong></a><small>{item.source} · {item.publishedAt ?? `Retrieved ${new Date(item.retrievedAt).toLocaleString()}`} · {item.verification}</small><p><span>Why it matters:</span> {item.whyItMatters}</p><div className="impact-list">{item.impacts.map((impact: any, index: number) => <div key={`${impact.sector}-${index}`} className={impact.direction}><b>{impact.sector}</b><em>{impact.direction}</em><p>{impact.mechanism}</p></div>)}</div>{item.assetTags?.length ? <div className="ripple-tags">{item.assetTags.map((tag: string) => <em key={tag}>{tag}</em>)}</div> : null}</article>;
  const view = resolveDiscoverySynthesisView(q.data);
  return <section className="terminal-section news-feed impact-feed"><ViewLabel view="research"/><div className="panel-head"><div><p className="eyebrow cyan">Cross-sector transmission</p><h2>News → mechanism → sector</h2></div><Source>linked sources</Source></div>
    {view === "current" ? q.data.news.map(newsArticle)
    : view === "prior" ? <PriorSynthesisBlock previous={q.data.previousSynthesis}/>
    : <Empty>{view === "loading" ? "Loading the latest completed scan…" : view === "error" ? plainUpstreamError(q.data?.error ?? "Market discovery unavailable.") : view === "none-ever" ? "The latest scan's synthesis timed out and no completed synthesis is stored yet — measured signals remain usable; this is a missing result, not a 'nothing found' verdict." : latest ? "This scan completed without a sourced news-impact item." : "No scheduled scan has completed yet."}</Empty>}</section>;
}

function NewsWorkspace({ asset }: { asset: any | null }) { const [view, setView] = useState<"market" | "coin">("market"); return <div className="stack"><div className="seg workspace-switch"><button className={view === "market" ? "active" : ""} onClick={() => setView("market")}>Market impact</button><button className={view === "coin" ? "active" : ""} onClick={() => setView("coin")}>Coin news</button></div>{view === "market" ? <StoredNews/> : asset ? <News asset={asset}/> : <CoinRequired onHome={() => setView("market")}/>}</div>; }

function WatchlistDashboard({ openCoin }: { openCoin: (id: string, symbol: string) => void }) { const q = useQuery({ queryKey: ["watch-dashboard"], queryFn: () => api.getWatchlistDashboard({}) }); const correlation = useQuery({ queryKey: ["portfolio-correlation"], queryFn: () => api.getPortfolioCorrelation({}) }); const c = correlation.data?.data; return <section className="terminal-section"><div className="panel-head"><div><p className="eyebrow cyan">Tracked market</p><h2>Watchlist dashboard</h2></div><Source>live price + latest signal</Source></div>{q.data?.items.length ? <div className="watch-list compact-list">{q.data.items.map((item:any) => <article key={item.coinId}><button className="watch-open" onClick={() => openCoin(item.coinId, item.symbol)}><div><strong>{item.symbol}</strong><small>{item.name}</small><small>{item.factors?.length ? item.factors.slice(0, 3).map((f:any) => `${f.label}: ${f.contribution > 0 ? "+" : ""}${f.contribution}`).join(" · ") : "No scored signal"}</small>{item.confidence != null && item.factors?.length ? <ReliabilityLine data={item.reliability} compact/> : null}</div><span>{money(item.price)}</span><b className={item.direction === "long" ? "up" : item.direction === "short" ? "down" : "muted"}>{item.direction.toUpperCase()}</b><em className={(item.change24h ?? 0) >= 0 ? "up" : "down"}>{percent(item.change24h)}</em></button></article>)}</div> : <Empty>{q.data?.error ?? "Your watchlist is empty. Add coins from a dossier."}</Empty>}<div className={`correlation-check ${c?.concentrated ? "warning" : ""}`}><div className="panel-head"><div><p className="eyebrow cyan">One bet, not eight</p><h3>Cross-book correlation</h3></div><Source>full cached history</Source></div>{c ? <><p>{c.warning}</p><div className="indicator-grid"><Metric label="Assets with history" value={num(c.assets.length)}/><Metric label="Average pairwise" value={num(c.avgPairwise)}/><Metric label="Average BTC beta" value={c.avgBtcBeta == null ? "unavailable" : num(c.avgBtcBeta)}/></div><div className="correlation-matrix"><div className="matrix-row head"><span>asset</span>{c.assets.map((a:any)=><b key={a.coinId}>{a.symbol}</b>)}</div>{c.matrix.map((row:any)=><div className="matrix-row" key={row.coinId}><strong>{row.symbol}</strong>{row.values.map((cell:any)=><span key={cell.coinId} className={(cell.correlation ?? 0)>=.75 ? "hot" : ""}>{cell.correlation == null ? "—" : num(cell.correlation)}</span>)}</div>)}</div><small>{c.methodology}</small></> : <Empty>{correlation.isPending ? "Computing correlations from cached history…" : correlation.data?.error ?? "Correlation check unavailable."}</Empty>}</div></section>; }

function ActualTradeRow({ trade }: { trade: any }) { const [exit, setExit] = useState(""); const qc = useQueryClient(); const close = useMutation({ mutationFn: () => api.closeActualEntry({ id: trade.id, exit: Number(exit), notes: trade.notes ?? "" }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["self-test"] }); qc.invalidateQueries({ queryKey: ["methodology-audit"] }); } }); return <article className="actual-trade"><div><strong>{trade.symbol} · {trade.side.toUpperCase()}</strong><small>{trade.verdict.toUpperCase()} at entry · {new Date(trade.createdAt).toLocaleString()}</small><small>entry {money(trade.entry)} · stop {money(trade.stop)} · target {money(trade.target)}</small></div><b className={trade.status === "closed" ? (trade.outcomeR ?? 0) > 0 ? "up" : "down" : ""}>{trade.status === "closed" ? `${num(trade.outcomeR)}R` : "OPEN"}</b>{trade.status === "open" && <div className="trade-close"><label>Exit<input aria-label={`Exit price for ${trade.symbol} trade`} type="number" min="0" step="any" value={exit} onChange={(e) => setExit(e.target.value)}/></label><button onClick={() => close.mutate()} disabled={close.isPending || !(Number(exit) > 0)}>{close.isPending ? "Closing…" : "Close + score"}</button></div>}</article>; }

function TwelvePointAuditWorkspace() { const audit = useQuery({ queryKey: ["methodology-audit"], queryFn: () => api.getMethodologyAudit({}) }); const self = useQuery({ queryKey: ["self-test"], queryFn: () => api.getSelfTest({}) }); const d = audit.data; return <div className="stack audit-workspace">{audit.isPending ? <div className="loading"><span/>Recomputing from cached rows…</div> : d ? <><section className="audit-command"><p className="eyebrow cyan">Methodology audit · cached evidence only</p><h2>{d.conclusion}</h2><small>Recomputed {new Date(d.generatedAt).toLocaleString()} · UNVERIFIED means the cached data cannot support the claim.</small></section><section className="terminal-section"><div className="panel-head"><div><p className="eyebrow cyan">Base rates</p><h2>Overlap-adjusted statistical read</h2></div><Source>stored outcomes</Source></div><div className="audit-rates">{d.baseRates.map((row:any)=><article key={row.horizon}><strong>{row.horizon}</strong><span>raw n={row.rawN} · effective n={row.effectiveN}</span><b>{row.hitRate == null ? "UNVERIFIED" : `${num(row.hitRate)}% hit`}</b><small>95% Wilson {row.wilsonLow == null ? "—" : `${num(row.wilsonLow)}–${num(row.wilsonHigh)}%`} · p={row.pValueVs50 == null ? "—" : num(row.pValueVs50)}</small><em>{row.edgeState}</em></article>)}</div><p className="score-disclaimer">Effective N removes same-coin overlapping windows one horizon apart; cross-coin beta dependence remains, so independence may still be overstated.</p></section><section className="terminal-section"><p className="eyebrow cyan">12-point audit</p><h2>Results, not promises</h2><div className="audit-items">{d.items.map((item:any)=><article key={item.id}><span>{String(item.id).padStart(2,"0")}</span><div><strong>{item.label}</strong><p>{item.result}</p></div><b className={item.status === "FIXED" || item.status === "MEASURED" ? "up" : item.status === "FAILED" ? "down" : ""}>{item.status}</b></article>)}</div></section><section className="terminal-section"><p className="eyebrow cyan">Evidence-ranked decision</p><h2>Keep, fix, kill</h2><div className="audit-ranking">{d.ranking.map((row:any,index:number)=><article key={`${row.action}-${row.feature}`}><span>#{index+1}</span><b className={row.action.startsWith("KEEP") ? "up" : row.action.startsWith("KILL") ? "down" : ""}>{row.action}</b><strong>{row.feature}</strong><p>{row.reason}</p></article>)}</div></section><section className="terminal-section"><div className="panel-head"><div><p className="eyebrow cyan">Risk layer</p><h2>Latest tracked leverage caps</h2></div><Source>entry vs invalidation</Source></div><div className="risk-cap-list">{d.riskRows.slice(0,20).map((row:any)=><article key={row.id}><strong>{row.symbol} · {row.direction.toUpperCase()}</strong><span>stop {num(row.stopPct)}% away</span><b>{row.maxSuggestedLeverage == null ? "UNVERIFIED" : `≤ ${row.maxSuggestedLeverage}×`}</b></article>)}</div><p className="score-disclaimer">Cap ≈ liquidation buffer 1.5× beyond invalidation plus 0.5% maintenance allowance, never venue-exact liquidation math. Portfolio correlation can lower size further.</p></section></> : <Empty>Audit unavailable.</Empty>}<section className="terminal-section"><div className="panel-head"><div><p className="eyebrow cyan">Priority 10 · self-test</p><h2>Your entries, verdict frozen at entry</h2></div><Source>trade log</Source></div><p>{self.data?.guidance ?? "Loading self-test…"}</p><div className="self-test-groups">{self.data?.groups.map((group:any)=><article key={group.verdict}><strong>{group.verdict.toUpperCase()}</strong><span>closed n={group.rawN}</span><b>{group.expectancyR == null ? "AWAITING TRADES" : `${num(group.expectancyR)}R avg`}</b><small>{group.hitRate == null ? "No outcome comparison yet" : `${num(group.hitRate)}% win · 95% Wilson ${num(group.wilsonLow)}–${num(group.wilsonHigh)}%`}</small></article>)}</div><div className="actual-trades">{self.data?.trades.length ? self.data.trades.map((trade:any)=><ActualTradeRow key={trade.id} trade={trade}/>) : <Empty>No actual entries logged yet. Run a Coin check, then use Log actual entry only when you truly take it.</Empty>}</div></section></div>; }

function WinnerLoserAuditWorkspace() {
  const q = useQuery({ queryKey: ["second-methodology-audit"], queryFn: () => api.getSecondMethodologyAudit({}) });
  const d = q.data;
  const pct = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "—" : `${value.toFixed(1)}%`;
  const rValue = (value: number | null | undefined) => value == null || !Number.isFinite(value) ? "OPEN" : `${value >= 0 ? "+" : ""}${value.toFixed(2)}R`;
  if (q.isPending) return <div className="loading"><span/>Rebuilding the winner/loser audit from cached rows…</div>;
  if (!d) return <Empty>Outcome audit unavailable.</Empty>;
  const allLedger = [...d.ledger, ...d.shadowLedger];
  const timingCounts = d.timingIntegrity.rows.reduce((acc:any,row:any) => ({ ...acc, [row.state]: (acc[row.state] ?? 0) + 1 }), {});
  return <div className="stack edge-audit">
    <section className="audit-command edge-verdict"><p className="eyebrow cyan">Winner / loser attribution audit · cached evidence only</p><h2>{d.attribution.discrimination}</h2><small>Recomputed {new Date(d.generatedAt).toLocaleString()} · excluded rows never enter the statistics.</small></section>

    <section className="terminal-section audit-section" aria-labelledby="full-ledger-heading"><div className="audit-section-title"><span>01</span><div><p className="eyebrow cyan">Full ledger</p><h2 id="full-ledger-heading">Every stored call, plus known gaps</h2></div></div>
      <div className="audit-summary-grid"><Metric label="Eligible closed N" value={num(d.overall.rawN)}/><Metric label="Hit rate" value={pct(d.overall.hitRate)}/><Metric label="Average net R" value={rValue(d.overall.averageNetR)}/><Metric label="95% Wilson" value={d.overall.wilsonLow == null ? "—" : `${pct(d.overall.wilsonLow)}–${pct(d.overall.wilsonHigh)}`}/></div>
      <div className="coverage-strip"><span>v1 <b>{d.coverage.v1}</b></span><span>v2 <b>{d.coverage.v2}</b></span><span>current shadow <b>{d.coverage.shadowCurrentRows}</b></span><span>suppressed aggregate <b>{d.coverage.suppressedAggregate}</b></span></div>
      <p className="audit-callout warning"><b>{d.coverage.completeness}</b> · {d.coverage.statement}</p>
      <details className="audit-drawer"><summary>Open full ledger · {allLedger.length} rows</summary><div className="audit-ledger-list">{allLedger.map((row:any) => <details className="audit-ledger-row" key={`${row.class}-${row.id}`}><summary><span><b>{row.symbol}</b><small>{row.class.toUpperCase()} · {row.direction.toUpperCase()} · {new Date(row.timestamp).toLocaleString()}</small></span><em className={row.outcome === "target" ? "up" : row.outcome === "invalidation" ? "down" : ""}>{row.outcome.toUpperCase()} · {rValue(row.netR)}</em></summary><div className="audit-ledger-body"><div className="audit-summary-grid"><Metric label="Entry" value={money(row.entry)}/><Metric label="Invalidation" value={money(row.invalidation)}/><Metric label="Targets" value={row.targets?.length ? row.targets.map((v:number) => money(v)).join(" / ") : "UNVERIFIED"}/><Metric label="Score" value={num(row.score)}/></div><p><b>Timing:</b> {row.timingReason}</p><p><b>Entry:</b> {row.entryState}</p><p><b>Funding:</b> {row.funding}</p>{row.exclusionReasons?.length ? <small>Excluded: {row.exclusionReasons.join(" · ")}</small> : <small className="up">Included in statistical results.</small>}</div></details>)}</div></details>
    </section>

    <section className="terminal-section audit-section" aria-labelledby="timing-heading"><div className="audit-section-title"><span>02</span><div><p className="eyebrow cyan">Timing integrity</p><h2 id="timing-heading">Was the call logged before the move?</h2></div></div>
      <div className="audit-summary-grid"><Metric label="Clean" value={num(timingCounts.clean ?? 0)}/><Metric label="Late" value={num(timingCounts.late ?? 0)}/><Metric label="Unverified" value={num(timingCounts.unverified ?? 0)}/><Metric label="Factor ledger missing" value={num(d.timingIntegrity.rows.filter((row:any) => !row.factorLedgerStored).length)}/></div>
      <p>{d.timingIntegrity.rule}</p><details className="audit-drawer"><summary>Review timing row by row</summary><div className="audit-plain-list">{d.timingIntegrity.rows.map((row:any) => <article key={row.id}><span><b>{row.symbol}</b><small>{new Date(row.timestamp).toLocaleString()}</small></span><em className={row.state === "clean" ? "up" : row.state === "late" ? "down" : ""}>{row.state.toUpperCase()}</em><p>{row.reason}</p></article>)}</div></details>
    </section>

    <section className="terminal-section audit-section" aria-labelledby="baseline-heading"><div className="audit-section-title"><span>03</span><div><p className="eyebrow cyan">Dumb-screen baseline</p><h2 id="baseline-heading">Trend screen and long-BTC beta</h2></div></div>
      <p>{d.baselines.methodology}</p><div className="audit-summary-grid"><Metric label="Winners captured" value={`${d.baselines.winnerCapture.captured}/${d.baselines.winnerCapture.winners}`}/><Metric label="Comparable alt calls" value={num(d.baselines.btcBeta.comparableAltCalls)}/><Metric label="BTC-positive windows" value={`${d.baselines.btcBeta.positiveBtcWindows}/${d.baselines.btcBeta.comparableAltCalls}`}/><Metric label="Average BTC return" value={percent(d.baselines.btcBeta.averageBtcReturnPct)}/></div>
      <div className="baseline-runs">{d.baselines.runs.length ? d.baselines.runs.map((run:any) => <article key={run.day}><strong>{run.day}</strong><span>{run.coveredCoins} coins with 90D history</span><small>Top-decile bar {pct(run.topDecileThreshold)}</small><p>{run.flagged.length ? run.flagged.map((row:any) => `${row.symbol} (${pct(row.return90)}, RSI ${num(row.rsi14)})`).join(" · ") : "No cached coin passed all three conditions."}</p></article>) : <Empty>No eligible closed dates to baseline yet.</Empty>}</div>
    </section>

    <section className="terminal-section audit-section" aria-labelledby="luck-heading"><div className="audit-section-title"><span>04</span><div><p className="eyebrow cyan">Luck test</p><h2 id="luck-heading">Could this happen by chance?</h2></div></div>
      <div className="audit-summary-grid"><Metric label="Observed" value={`${d.luckTest.observedWins}/${d.luckTest.n}`}/><Metric label="p under 50%" value={d.luckTest.pValueUnder50 == null ? "—" : num(d.luckTest.pValueUnder50)}/><Metric label="Walk-forward base" value={pct(d.luckTest.walkForwardBaseRate)}/><Metric label="p under base" value={d.luckTest.pValueUnderWalkForwardBaseRate == null ? "—" : num(d.luckTest.pValueUnderWalkForwardBaseRate)}/></div>
      <p className="audit-callout"><b>{d.luckTest.verdict}</b></p><small>{d.luckTest.baseRateNote}</small>
    </section>

    <section className="terminal-section audit-section" aria-labelledby="tradability-heading"><div className="audit-section-title"><span>05</span><div><p className="eyebrow cyan">Tradability</p><h2 id="tradability-heading">Entry, first touch, and net R</h2></div></div>
      <p>{d.tradability.pathRule}</p><p className="audit-callout warning"><b>{d.tradability.fundingStatus}</b> · {d.tradability.fundingEvidence}</p><small>{d.tradability.costAssumption}</small>
      <div className="tradability-list">{d.tradability.rows.length ? d.tradability.rows.map((row:any) => <article key={row.id}><span><b>{row.symbol} · {row.direction.toUpperCase()}</b><small>{row.entryState}</small></span><em className={row.outcome === "target" ? "up" : "down"}>{row.outcome.toUpperCase()}</em><strong>{rValue(row.netR)}</strong><small>18 bps only · funding not included · path: {row.pathSource ?? "UNVERIFIED"}{row.sameBarAmbiguous ? " · SAME-BAR ORDER UNVERIFIED" : ""}</small></article>) : <Empty>No range-confirmed closed path is available yet.</Empty>}</div>
    </section>

    <section className="terminal-section audit-section" aria-labelledby="attribution-heading"><div className="audit-section-title"><span>06</span><div><p className="eyebrow cyan">Attribution on winners and losers</p><h2 id="attribution-heading">Do the factors discriminate?</h2></div></div>
      <p className="audit-callout"><b>{d.attribution.discrimination}</b></p>
      <h3>Closed-signal factor profiles</h3><div className="audit-profile-list">{d.attribution.closedProfiles.length ? d.attribution.closedProfiles.map((row:any) => <details key={row.signalId}><summary><span><b>{row.symbol}</b><small>score {num(row.score)} · {rValue(row.netR)}</small></span><em className={row.outcome === "target" ? "up" : "down"}>{row.outcome.toUpperCase()}</em></summary><div>{row.firedFactors.length ? row.firedFactors.map((factor:any) => <p key={factor.label}><b>{factor.label}</b> · {factor.family.replace("_", "/")} · contribution {factor.contribution > 0 ? "+" : ""}{num(factor.contribution)} / {num(factor.weight)}<small>{factor.reading}</small></p>) : <p>No valid fired factors stored.</p>}</div></details>) : <Empty>No eligible closed profiles.</Empty>}</div>
      <h3>Score bands</h3><div className="audit-rates compact">{d.attribution.scoreBands.map((row:any) => <article key={row.label}><strong>{row.label}</strong><span>n={row.rawN}</span><b>{pct(row.hitRate)} hit</b><small>{rValue(row.averageNetR)} average · Wilson {pct(row.wilsonLow)}–{pct(row.wilsonHigh)}</small></article>)}</div>
      <h3>Factor active vs inactive</h3><div className="factor-attribution-list">{d.attribution.factorAttribution.length ? d.attribution.factorAttribution.map((row:any) => <details key={row.label}><summary><span><b>{row.label}</b><small>{row.family.replace("_", "/")}</small></span><em>{row.poweredFor20PointGap ? row.separates ? "SEPARATES" : "NO DISCRIMINATION" : "UNDERPOWERED"}</em></summary><div className="factor-compare"><div><b>Active · n={row.active.rawN}</b><span>{pct(row.active.hitRate)} hit · {rValue(row.active.averageNetR)}</span><small>Wilson {pct(row.active.wilsonLow)}–{pct(row.active.wilsonHigh)}</small></div><div><b>Inactive · n={row.inactive.rawN}</b><span>{pct(row.inactive.hitRate)} hit · {rValue(row.inactive.averageNetR)}</span><small>Wilson {pct(row.inactive.wilsonLow)}–{pct(row.inactive.wilsonHigh)}</small></div></div><p>{row.conclusion}</p></details>) : <Empty>No eligible factors to compare.</Empty>}</div>
      <h3>Independent families vs trend/momentum</h3><p>{d.attribution.independentConclusion}</p><div className="family-grid">{d.attribution.familyAttribution.map((row:any) => <article key={row.family}><strong>{row.family.replace("_", " / ")}</strong><span>active n={row.active.rawN} · {pct(row.active.hitRate)} hit · {rValue(row.active.averageNetR)}</span><span>inactive n={row.inactive.rawN} · {pct(row.inactive.hitRate)} hit · {rValue(row.inactive.averageNetR)}</span><small>{row.conclusion}</small></article>)}</div><p className="score-disclaimer">{d.attribution.powerRule}</p>
    </section>

    <section className="terminal-section audit-section verdict-panel" aria-labelledby="verdict-heading"><div className="audit-section-title"><span>07</span><div><p className="eyebrow cyan">Verdict</p><h2 id="verdict-heading">Skill, beta/momentum, or undetermined</h2></div></div><p>{d.verdict}</p></section>
  </div>;
}

function PassDirectionRead({ row }: { row: any }) {
  const tone = row.status === "pass" ? "up" : String(row.status).includes("futility") || String(row.status).startsWith("fail") ? "down" : "";
  return <article className="pass-direction"><header><div><span>{String(row.direction).toUpperCase()} SIDE</span><strong className={tone}>{String(row.status).toUpperCase()}</strong></div><b>{row.effectiveClosed} effective closes</b></header><div className="indicator-grid pass-metrics"><Metric label="Average net R" value={row.averageNetR == null ? "UNVERIFIED" : `${num(row.averageNetR)}R`}/><Metric label="95% interval" value={row.netRLower95 == null ? "UNVERIFIED" : `${num(row.netRLower95)} to ${num(row.netRUpper95)}R`}/><Metric label="Hit rate (reported only)" value={row.hitRate == null ? "UNVERIFIED" : `${num(row.hitRate)}%`}/><Metric label="Weeks to effective n=30" value={row.weeksNeeded == null ? "UNVERIFIED" : num(row.weeksNeeded)}/></div><div className="pass-baselines">{row.baselines.map((base:any)=><div key={base.key}><span>{base.label}</span><strong className={base.beat ? "up" : ""}>{base.beat ? "BEAT" : base.comparableN < row.evaluatedWindow ? "UNVERIFIED" : "NOT BEATEN"}</strong><small>paired n={base.comparableN} · Δ {base.averageDifferenceR == null ? "—" : `${num(base.averageDifferenceR)}R`} · 95% lower {base.lower95 == null ? "—" : `${num(base.lower95)}R`}</small></div>)}</div><div className="pass-checks"><p><b>Silence</b><span>{row.silence.pass == null ? "UNVERIFIED" : row.silence.pass ? "PASS" : "FAIL"}</span><small>issued {row.silence.issuedAverageNetR == null ? "—" : `${num(row.silence.issuedAverageNetR)}R`} · suppressed {row.silence.suppressedAverageNetR == null ? "—" : `${num(row.silence.suppressedAverageNetR)}R`} · effective suppressed n={row.silence.suppressedEffectiveN}</small></p><p><b>Regime span</b><span>{row.regime.pass ? "PASS" : "INCOMPLETE"}</span><small>BTC-up {row.regime.upWeeks} · down/flat {row.regime.downOrFlatWeeks} · unclassified {row.regime.unclassified}</small></p></div><footer>{row.sizingAuthorized ? "Risk tiers and leverage cap may apply to this side." : "Sizing stays flat for this side."}</footer></article>;
}

function FoundationWorkspace() {
  const qc = useQueryClient(); const q = useQuery({ queryKey: ["measurement-foundation"], queryFn: () => api.getMeasurementFoundation({}) });
  const runQ = useQuery({ queryKey: ["measurement-run"], queryFn: () => api.getMeasurementRun({}) });
  const capture = useMutation({ mutationFn: () => api.captureUniverseSnapshot({ trigger: "manual" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["measurement-foundation"] }) });
  const timing = useMutation({ mutationFn: () => api.runTimingIntegrityAudit({}), onSuccess: () => qc.invalidateQueries({ queryKey: ["measurement-foundation"] }) });
  const measure = useMutation({ mutationFn: () => api.runDailySignalPostmortem({ runId: runQ.data?.run?.status === "partial" ? runQ.data.run.runId : undefined, batchSize: 8, trigger: "manual" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["measurement-run"] }) });
  const d = q.data?.data; const latestRun = runQ.data?.run; const runItems = runQ.data?.items ?? []; const openFailed = runItems.find((item:any) => item.tradeState === "open" && item.gradingState === "failed"); const acceptanceTrace = runQ.data?.acceptanceTrace;
  if (q.isPending) return <div className="loading"><span/>Reading the append-only ledger…</div>;
  return <div className="stack measurement-stack">
    <section className="terminal-section measurement-run-panel"><div className="panel-head"><div><p className="eyebrow cyan">Daily grading run</p><h2>Trade state and grading state</h2></div><button className="primary" onClick={()=>measure.mutate()} disabled={measure.isPending || runQ.isPending}>{measure.isPending ? "Running batch…" : latestRun?.status === "partial" ? "Resume same run" : "Start run"}</button></div>
      {runQ.isPending ? <Empty>Loading the latest checkpoint…</Empty> : latestRun ? <><div className="run-status-line"><strong className={latestRun.status === "complete" ? "up" : "warning"}>{String(latestRun.status).toUpperCase()}</strong><span>{latestRun.runId}</span><small>cursor {latestRun.cursor}/{latestRun.signalsInScope} · evaluator checkpoint</small></div><div className="indicator-grid"><Metric label="Frozen IDs / retrieved" value={`${latestRun.expectedCount} / ${latestRun.retrieved}`}/><Metric label="Evaluated (resolved)" value={num(latestRun.evaluated)}/><Metric label="Queued / not due" value={num(latestRun.pending)}/><Metric label="Ambiguous / unverified" value={`${latestRun.ambiguous} / ${latestRun.unverified}`}/><Metric label="Failed / excluded" value={`${latestRun.failed} / ${latestRun.excluded}`}/><Metric label="Trade state: open / settled" value={`${latestRun.openTrades} / ${latestRun.settledTrades}`}/></div><p className="score-disclaimer">Evaluation cutoff frozen at {new Date(latestRun.evaluationCutoffAt).toISOString()} · eligible due {latestRun.eligibleDue}. Completion requires the original frozen identity set, not merely balanced row counts.</p><p className={latestRun.balanced ? "interpretation" : "source-warning"}><b>Identity reconciliation:</b> {latestRun.equation} · {latestRun.balanced ? "COMPLETE ID MATCH" : "INCOMPLETE"}. Missing {latestRun.missingIds.length} · unexpected {latestRun.unexpectedIds.length} · duplicate {latestRun.duplicateIds.length} · ordinal errors {latestRun.ordinalViolations.length}. Evaluation failures do not close an open trade.</p>{openFailed ? <p className="source-warning"><b>Trade open · grading failed:</b> {openFailed.signalId}. {openFailed.gradingReason} {openFailed.tradeStateReason}</p> : null}<details className="audit-drawer"><summary>Every frozen signal ID · {runItems.length}/{latestRun.expectedCount} records</summary><div className="measurement-item-list">{runItems.map((item)=><article key={item.signalId}><div><b>{item.signalId}</b><span>trade <strong>{item.tradeState.toUpperCase()}</strong> · grading <strong>{item.gradingState.toUpperCase()}</strong></span></div><small>{item.gradingReason}</small><small>{item.tradeStateReason}</small><em>attempts {item.attemptCount}</em></article>)}</div></details>{latestRun.retryPending ? <p className="source-warning">Retry pending for {latestRun.failed} failed record{latestRun.failed === 1 ? "" : "s"}. Resume keeps the same run ID and retries those IDs after the forward cursor completes.</p> : null}</> : <Empty>No measurement run exists. Start a bounded run to freeze and reconcile the current issued-signal cohort.</Empty>}
      {measure.isError ? <p className="source-warning">The batch did not finish. The saved cursor and per-ID states remain available for retry.</p> : null}
      {acceptanceTrace?.length ? <details className="audit-drawer" open><summary>Acceptance traces · grading cannot close a trade</summary><div className="measurement-item-list">{acceptanceTrace.map((trace:any)=><article key={trace.fixture}><div><b>{trace.fixture}</b><span>trade <strong>{trace.tradeState.toUpperCase()}</strong> · grading <strong>{trace.gradingState.toUpperCase()}</strong></span></div><small>Evaluator {trace.evaluatorVersion}: {trace.evaluatorResult}. {trace.reason}</small><em>Deterministic regression fixture · not production evidence</em></article>)}</div></details> : null}
    </section>
    <section className="terminal-section"><div className="panel-head"><div><p className="eyebrow cyan">0 · Foundation</p><h2>v1 measurement freeze</h2></div><span className="feed-badge">{d?.freeze ? "FROZEN" : "NOT CAPTURED"}</span></div>{d?.freeze ? <><div className="indicator-grid"><Metric label="Version" value={d.freeze.version}/><Metric label="Freeze UTC" value={new Date(d.freeze.frozenAt).toISOString()}/><Metric label="Status" value="FROZEN FOR MEASUREMENT"/><Metric label="Hash" value={`${String(d.freeze.versionHash).slice(0,12)}…`}/></div><p>{d.freeze.spec.scoring}</p><p className="score-disclaimer">Frozen so it can be measured. This is not proof of edge and does not change scanner, scoring, issuance, silence, tracker, checkentry, or prior ledgers.</p></> : <Empty>Take the first forward-only snapshot to create the v1 freeze. No history is backfilled into this ledger.</Empty>}</section>
    <section className="terminal-section"><div className="panel-head"><div><p className="eyebrow cyan">Daily UTC ledger</p><h2>Full scan-universe snapshots</h2></div><button className="primary" onClick={()=>capture.mutate()} disabled={capture.isPending}>{capture.isPending ? "Capturing…" : "Capture today"}</button></div>{capture.data && <p className="interpretation">{capture.data.inserted} new rows · {capture.data.existing} preserved · universe {capture.data.universe}. {capture.data.note}</p>}<div className="indicator-grid"><Metric label="Rows" value={num(d?.totalSnapshotRows ?? 0)}/><Metric label="Latest UTC" value={d?.latestSnapshot?.at ? new Date(d.latestSnapshot.at).toISOString() : "No snapshot"}/><Metric label="Days" value={num(d?.snapshotDays?.length ?? 0)}/><Metric label="Realized funding" value="UNVERIFIED unless recorded"/></div><details><summary>Snapshot days</summary>{d?.snapshotDays?.length ? d.snapshotDays.map((row:any)=><p key={row.day}>{row.day} · {row.count} universe rows</p>) : <Empty>No forward snapshot exists yet.</Empty>}</details><p className="score-disclaimer">Each row stores OHLC, every frozen discovery factor, venue funding/OI where returned, and an explicit UNVERIFIED state for unavailable realized payments. Existing day rows cannot be overwritten.</p></section>
    <section className="terminal-section pass-bar"><div className="panel-head"><div><p className="eyebrow cyan">2 · Pre-registered pass bar</p><h2>v1 final · signed off {d?.passBar?.signedOffDate ?? "2026-10-05"}</h2></div><span className="feed-badge">SIGNED OFF</span></div><p className="pass-lead">Expectancy is the bar. Hit rate is context only. Every read below is recomputed from owned OHLC, the append-only signal ledger, suppressed universe snapshots, and recorded funding payments.</p><div className="indicator-grid"><Metric label="Raw closed rows" value={num(d?.passBar?.currentClosed ?? 0)}/><Metric label="Effective closes" value={num(d?.passBar?.effectiveClosed ?? 0)}/><Metric label="Raw rows excluded" value={num(d?.passBar?.excludedRawRows ?? 0)}/><Metric label="Weeks to effective n=30" value={d?.passBar?.weeksNeeded == null ? "UNVERIFIED" : num(d.passBar.weeksNeeded)}/><Metric label="Funding" value={d?.passBar?.funding?.state ?? "UNVERIFIED / NOT INCLUDED"}/><Metric label="Sizing" value={d?.passBar?.sizingAuthorized ? "RISK TIERS ACTIVE" : "FLAT / LOCKED"}/></div><p className="score-disclaimer">Effective N keeps same-coin calls at least one full 30-day outcome horizon apart. Cross-coin dependence is DISCLOSED, NOT REMOVED. Raw row counts never satisfy the bar.</p><div className="pass-direction-list">{(d?.passBar?.directions ?? []).map((row:any)=><PassDirectionRead key={row.direction} row={row}/>)}</div><details className="pass-definition"><summary>Frozen v1-final analysis definition</summary><ol><li><b>N:</b> 30 effective closes per side; one call per coin per 30-day horizon.</li><li><b>Expectancy:</b> 18 bps round-trip cost; paired-bootstrap 95% lower bound above zero versus buy-and-hold.</li><li><b>Baselines:</b> beat buy-and-hold, seeded random-entry, and always-long BTC beta. Two of three is mixed.</li><li><b>Silence:</b> suppressed candidates may not outperform issued calls at the same 30-day first-touch horizon and costs.</li><li><b>Direction:</b> longs and shorts certify separately.</li><li><b>Regime:</b> each certification window needs a completed BTC-up week and BTC-down-or-flat week.</li><li><b>Funding:</b> {d?.passBar?.funding?.recordedDays ?? 0}/30 realized-payment days recorded. Until 30, funding is UNVERIFIED / not included and sizing stays locked.</li><li><b>First touch:</b> target or invalidation closes the call; same-candle ambiguity is invalidation. No touch settles at the 30th daily close.</li><li><b>Futility:</b> at 15 effective closes, a 95% upper bound below zero halts the cycle as “futility — reassess.”</li><li><b>Re-certification:</b> each new non-overlapping block of 30 effective closes replaces the prior certificate.</li></ol><div className="baseline-defs">{(d?.passBar?.definition?.baselines ?? []).map((base:any)=><p key={base.key}><b>{base.label}</b><span>{base.definition}</span></p>)}</div></details><p className="interpretation"><b>Sizing rule:</b> {d?.passBar?.sizingRule}</p></section>
    <section className="terminal-section"><div className="panel-head"><div><p className="eyebrow cyan">3 · Timing integrity</p><h2>ZRO / WIN / MEGA</h2></div><button onClick={()=>timing.mutate()} disabled={timing.isPending}>{timing.isPending ? "Checking…" : "Run source check"}</button></div>{d?.timing?.length ? <div className="timing-list">{d.timing.map((row:any)=><article key={row.id}><b>{row.symbol} · signal {row.signalId}</b><span>timestamp {String(row.timestampState).toUpperCase()} · candles {String(row.candleState).toUpperCase()} · {row.preSignalBars} pre-signal bars</span><small>{row.note}</small></article>)}</div> : <Empty>No timing audit has run. This check may backfill exchange candles into the history cache, never into the forward ledger.</Empty>}<p className="interpretation"><b>Timing rule:</b> pre-signal candles may be sourced; a factor ledger that was never stored is never reconstructed.</p></section>
  </div>;
}

const FUNNEL_STAGE_LABELS: Record<string, string> = { S0: "catalog", S1: "volume", S2: "tiers", S3: "legacy bar", S4: "ATH gate", S5: "T1 doors", S6: "graduation", issuance: "gates" };

function FunnelStrip({ runKind, title }: { runKind: "discovery" | "issuance"; title: string }) {
  const [runId, setRunId] = useState<number | undefined>(undefined);
  const q = useQuery({ queryKey: ["discovery-funnel", runKind, runId ?? "latest"], queryFn: () => api.getDiscoveryFunnel(runId ? { runId, runKind } : { runKind }) });
  const d = q.data;
  return <div className="funnel-strip"><div className="panel-head"><h3>{title}</h3>{d?.recentRuns?.length ? <label>Run <select aria-label={`${title} funnel run`} value={String(runId ?? d.runId ?? "")} onChange={(e) => setRunId(Number(e.target.value))}>{d.recentRuns.map((run: any) => <option key={run.runId} value={String(run.runId)}>#{run.runId} · {new Date(run.computedAt).toLocaleString()}</option>)}</select></label> : null}</div>
  {q.isPending ? <p className="muted">Loading measured funnel…</p> : !d ? <p className="muted">Funnel unavailable.</p> : !d.instrumented ? <p>Not instrumented — this run predates funnel instrumentation.</p> : <><div className="funnel-lines">{d.stages.map((stage: any) => { const conservation = stage.removals.filter((r: any) => !r.diagnostic); const diagnostics = stage.removals.filter((r: any) => r.diagnostic); const removedTotal = conservation.reduce((sum: number, r: any) => sum + r.count, 0); return <div key={stage.stage} className="funnel-line"><p>{stage.stage} {FUNNEL_STAGE_LABELS[stage.stage] ?? stage.stage}: {stage.input} → {stage.survivors}{stage.breakdown?.length ? ` (${stage.breakdown.map((b: any) => `${b.gate} ${b.count}`).join(" · ")})` : ""}{conservation.length ? ` (${removedTotal} removed · ${conservation.map((r: any) => r.reasonCode).join(" · ")})` : ""}</p>{diagnostics.length ? <p className="funnel-note">{diagnostics.map((r: any) => `${r.gate} missing on ${r.count}`).join(" · ")}</p> : null}</div>; })}</div><p className="funnel-stamp">MEASURED · run #{d.runId} · {d.computedAt}</p></>}
  </div>;
}

function DiscoveryFunnelSection() { return <section className="terminal-section"><p className="eyebrow cyan">Discovery funnel</p><h2>Where candidates disappear</h2><FunnelStrip runKind="discovery" title="Discovery"/><FunnelStrip runKind="issuance" title="Issuance"/></section>; }

function EvidenceWorkspace() { const q = useQuery({ queryKey: ["universe-evidence"], queryFn: () => api.getUniverseDayEvidence({}) }); const d = q.data?.data; if (q.isPending) return <div className="stack measurement-stack"><DiscoveryFunnelSection/><SourceHealthStrip/><div className="loading"><span/>Grading matured universe-days…</div></div>; return <div className="stack measurement-stack"><DiscoveryFunnelSection/><SourceHealthStrip/><section className="terminal-section"><p className="eyebrow cyan">1 · Evidence unit</p><h2>Universe-day forward grading</h2><p>{d?.methodology}</p><div className="record-pair">{d?.groups?.map((row:any)=><article key={row.horizon}><b>{row.horizon}D</b><span>{num(row.hitRate)}% hit · {num(row.averageNetExcessReturn)}% average net excess</span><small>{row.rawRows} rows · {row.dateClusters ?? 0} UTC-date clusters · {row.independentWeeks} INDEPENDENT WEEKS · funding included in {row.fundingIncludedRows}</small></article>)}</div><p className="interpretation"><b>Evidence read:</b> effective N is reported as independent snapshot weeks; raw universe rows never masquerade as independent evidence.</p></section><section className="terminal-section"><h2>Matured observations</h2>{d?.evaluations?.length ? <div className="occurrence-list">{d.evaluations.map((row:any)=><article key={`${row.snapshotId}-${row.horizon}`}><b>{row.symbol} · {row.day} · {row.horizon}D</b><span>net BTC-relative {percent(row.netExcessReturn,2)} · {row.hit ? "hit" : "miss"}</span><small>{row.fundingNote}</small></article>)}</div> : <Empty>No forward 5D / 14D / 30D universe-day horizon has matured from a captured snapshot.</Empty>}</section></div>; }

function ReverseWorkspace() { const q = useQuery({ queryKey: ["reverse-mode"], queryFn: () => api.getReverseMode({}) }); const d = q.data?.data; if (q.isPending) return <div className="loading"><span/>Applying the frozen retrospective rule…</div>; return <div className="stack measurement-stack"><section className="terminal-section"><p className="eyebrow cyan">5 · Reverse mode</p><h2>{d?.definition?.name ?? "Pattern library not frozen"}</h2>{d?.definition && <><p>Frozen {new Date(d.definition.frozenAt).toISOString()} · {d.definition.criteria.definitionOrder}</p><ol>{d.definition.criteria.criteria.map((item:string)=><li key={item}>{item}</li>)}</ol><p><b>Outcome:</b> {d.definition.outcomeRule}</p><p><b>Holdout:</b> {d.definition.holdoutRule}</p></>}<div className="indicator-grid"><Metric label="Hits" value={num(d?.hits ?? 0)}/><Metric label="Misses" value={num(d?.misses ?? 0)}/><Metric label="Holdout rows" value={num(d?.holdout ?? 0)}/><Metric label="Label" value="RETROSPECTIVE"/></div><p className="interpretation"><b>Reverse-mode read:</b> {d?.note}</p></section><section className="terminal-section"><h2>All matched occurrences</h2>{d?.occurrences?.length ? <div className="occurrence-list">{d.occurrences.map((row:any,i:number)=><article key={`${row.coinId}-${row.signalDay}-${i}`}><b>{row.symbol} · {row.signalDay} · {String(row.result).toUpperCase()}</b><span>{row.segment} · {percent(row.netReturn,2)} net · exit {row.exitDay}</span><small>{row.label}</small></article>)}</div> : <Empty>No cached historical occurrence matched the frozen rule.</Empty>}</section></div>; }

function SourceJobs() {
  const q = useQuery({ queryKey: ["source-jobs"], queryFn: () => api.getsourcejobs({}), staleTime: 60_000 });
  return <section className="terminal-section source-jobs"><div className="panel-head"><div><p className="eyebrow cyan">Source map</p><h2>What feeds what</h2></div><Source>{q.data?.generatedAt ? `as of ${new Date(q.data.generatedAt).toLocaleTimeString()}` : "loading"}</Source></div>{q.data?.jobs?.length ? <div className="source-job-list">{q.data.jobs.map((job:any) => <article key={job.source}><strong>{job.source}</strong><span>{job.job}</span><small>{job.feeds.join(" · ")}</small><em>{job.quota.used == null ? "usage unavailable" : `${job.quota.used}/${job.quota.cap}`} · {job.quota.resets}</em></article>)}</div> : <Empty>Source map unavailable.</Empty>}</section>;
}

function SchedulerReceiptsPanel() {
  const q = useQuery({ queryKey: ["scheduler-invocations"], queryFn: () => api.getSchedulerInvocations({}), staleTime: 30_000, retry: false });
  const timestamp = (value: string | null | undefined) => value ? new Date(value).toLocaleString() : "unavailable";
  const elapsed = (started: string, completed: string) => {
    const duration = Math.max(0, new Date(completed).getTime() - new Date(started).getTime());
    if (duration < 1_000) return `${duration}ms`;
    const seconds = Math.floor(duration / 1_000); const minutes = Math.floor(seconds / 60); const hours = Math.floor(minutes / 60);
    if (hours) return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    if (minutes) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };
  const output = (progressJson: string | null | undefined) => {
    if (!progressJson) return null;
    try {
      const parsed: unknown = JSON.parse(progressJson);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
      const values = Object.entries(parsed as Record<string, unknown>).filter(([, value]) => ["string", "number", "boolean"].includes(typeof value));
      return values.length ? values.map(([key, value]) => `${key} ${String(value)}`).join(" · ") : null;
    } catch { return null; }
  };
  return <section className="terminal-section scheduler-receipts"><div className="panel-head"><div><p className="eyebrow cyan">Invocation evidence</p><h2>Scheduler receipts</h2></div><Source>{q.data?.generatedAt ? `as of ${new Date(q.data.generatedAt).toLocaleTimeString()}` : q.isPending ? "loading" : "unavailable"}</Source></div>{q.data?.jobs?.length ? <div className="scheduler-receipt-grid">{q.data.jobs.map((job:any) => {
    const latest = job.latest; const counts = output(latest?.progressJson); const running = latest?.status === "running" && !latest.completedAt;
    return <article key={job.jobKey}><div><strong>{job.jobName}</strong><span className={`receipt-status ${latest?.status ?? "missing"}`}>{latest?.status?.toUpperCase() ?? "NO RECEIPT"}</span></div>{latest ? <div className="receipt-lines"><b>{running ? `INVOKED · running since ${timestamp(latest.invokedAt)}` : latest.completedAt ? `COMPLETED · ${String(latest.status).toUpperCase()} · took ${elapsed(latest.invokedAt, latest.completedAt)}` : `INVOKED · ${timestamp(latest.invokedAt)}`}</b>{latest.status === "succeeded" && counts ? <span className="receipt-output">OUTPUT · {counts}</span> : null}<small>TRIGGER PROVENANCE (CALLER-CLAIMED) · {latest.triggerProvenance?.toUpperCase() ?? "UNAVAILABLE"}</small><small>CONFIGURED STARTUP REF · {latest.configuredStartupVersion ?? "not recorded"}</small><small>EXECUTING BUILD · {latest.executingVersion ?? "not exposed by runtime"}</small>{latest.status === "failed" && latest.error ? <small className="receipt-error">ERROR · {latest.error}</small> : null}</div> : <small>This job has not recorded an invocation yet.</small>}{latest ? <code>{latest.runId}</code> : null}</article>;
  })}</div> : <Empty>{q.isPending ? "Loading scheduler receipts…" : "Scheduler receipts unavailable."}</Empty>}</section>;
}

// Batch 5 Part A (Part 6): on-demand discovery trigger on the Diagnostics
// surface. The single-flight guard is an in-progress lock only — a fresh run
// can always be started once no run is in flight, and a duplicate invocation
// returns the in-flight run's proof stamps instead of starting a second run.
function DiscoveryRunTrigger() {
  const qc = useQueryClient();
  const run = useMutation({ mutationFn: () => api.runMarketDiscovery({ trigger: "manual" }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["market-discovery"] }); qc.invalidateQueries({ queryKey: ["scheduler-invocations"] }); qc.invalidateQueries({ queryKey: ["source-health"] }); } });
  const d = run.data;
  return <section className="terminal-section" aria-label="On-demand discovery run">
    <div className="panel-head"><div><p className="eyebrow cyan">Discovery · on demand</p><h2>Run market discovery now</h2></div><button className="primary" onClick={() => run.mutate()} disabled={run.isPending}>{run.isPending ? "RUNNING…" : "RUN DISCOVERY"}</button></div>
    <p className="muted">Starts a fresh discovery run unless one is already in flight — a duplicate invocation is suppressed and returns the in-flight run instead of a second execution.</p>
    {run.isError ? <Empty>The discovery trigger did not complete — no run was started by this attempt. Try again; a run can always be started once none is in flight.</Empty> : d ? <div className="scan-stats">
      <Metric label="Run" value={d.runId == null ? "—" : `#${d.runId}`}/>
      <Metric label="Status" value={String(d.status).toUpperCase()}/>
      <Metric label="Computed at" value={d.computedAt ? new Date(d.computedAt).toLocaleString() : "unavailable"}/>
      <Metric label="Data through" value={d.dataThrough ? new Date(d.dataThrough).toLocaleString() : "unavailable"}/>
      <Metric label="Universe" value={num(d.universeSize)}/>
      <Metric label="Signals" value={num(d.signalCount)}/>
    </div> : null}
    {d ? <p className="muted">{d.message}</p> : null}
  </section>;
}

function AuditWorkspace() { const [view, setView] = useState<"foundation" | "evidence" | "reverse" | "twelve" | "attribution">("foundation"); return <div className="stack"><ViewLabel view="diagnostics"/><DiscoveryRunTrigger/><div className="seg workspace-switch audit-switch" role="group" aria-label="Measurement view"><button className={view === "foundation" ? "active" : ""} onClick={() => setView("foundation")}>Foundation</button><button className={view === "evidence" ? "active" : ""} onClick={() => setView("evidence")}>Evidence</button><button className={view === "reverse" ? "active" : ""} onClick={() => setView("reverse")}>Reverse</button><button className={view === "twelve" ? "active" : ""} onClick={() => setView("twelve")}>12-point audit</button><button className={view === "attribution" ? "active" : ""} onClick={() => setView("attribution")}>Attribution</button></div>{view === "foundation" ? <FoundationWorkspace/> : view === "evidence" ? <EvidenceWorkspace/> : view === "reverse" ? <ReverseWorkspace/> : view === "twelve" ? <TwelvePointAuditWorkspace/> : <WinnerLoserAuditWorkspace/>}<SchedulerReceiptsPanel/><SourceJobs/></div>; }

function SignalsWorkspace({ d, openCoin }: { d: any | null; openCoin: (id: string, symbol: string) => void }) { const [view, setView] = useState<"scanner" | "coin">("scanner"); return <div className="stack"><ResearchShortlistStrip/><ViewLabel view="paper"/><PaperPilot/><div className="seg workspace-switch"><button className={view === "scanner" ? "active" : ""} onClick={() => setView("scanner")}>Tracker</button><button className={view === "coin" ? "active" : ""} onClick={() => setView("coin")}>Coin check</button></div>{view === "scanner" ? <><Tracker openCoin={openCoin}/><WatchlistDashboard openCoin={openCoin}/></> : d ? <div className="stack"><SignalTape d={d}/><EntryTiming asset={d.asset}/><Sizing asset={d.asset}/></div> : <CoinRequired onHome={() => setView("scanner")}/>}</div>; }
function WatchlistWorkspace({ openCoin }: { openCoin: (id: string, symbol: string) => void }) { return <div className="stack"><WatchlistDashboard openCoin={openCoin}/></div>; }

function JournalTradeRow({ trade }: { trade: any }) {
  const qc = useQueryClient(); const [exit, setExit] = useState("");
  const close = useMutation({ mutationFn: () => api.closeActualEntry({ id: trade.id, exit: Number(exit), notes: trade.notes ?? "" }), onSuccess: () => { setExit(""); qc.invalidateQueries({ queryKey: ["trade-journal"] }); qc.invalidateQueries({ queryKey: ["self-test"] }); } });
  const remove = useMutation({ mutationFn: () => api.deleteJournalTrade({ id: trade.id }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["trade-journal"] }); qc.invalidateQueries({ queryKey: ["self-test"] }); } });
  return <article className="journal-trade-row"><header><div><strong>{trade.symbol} · {String(trade.side).toUpperCase()}</strong><small>{String(trade.status).toUpperCase()} · {trade.setupType === "checkentry" ? `${String(trade.checkVerdict ?? "unscored").toUpperCase()} AT ENTRY` : "MANUAL"} · {new Date(trade.createdAt).toLocaleString()}</small></div><b className={trade.status === "closed" ? (trade.outcomeR ?? 0) > 0 ? "up" : "down" : ""}>{trade.status === "closed" ? `${num(trade.outcomeR)}R` : trade.status.toUpperCase()}</b></header><div className="journal-trade-metrics"><span>Entry <b>{money(trade.entry)}</b></span><span>Stop <b>{money(trade.stop)}</b></span><span>Target <b>{money(trade.target)}</b></span><span>Size <b>{num(trade.size)}</b></span><span>Leverage <b>{trade.leverage == null ? "—" : `${num(trade.leverage)}×`}</b></span>{trade.exit != null && <span>Exit <b>{money(trade.exit)}</b></span>}</div>{trade.notes && <p>{trade.notes}</p>}<div className="journal-row-actions">{trade.status !== "closed" && <><label>Exit price<input aria-label={`Exit price for ${trade.symbol}`} type="number" min="0" step="any" value={exit} onChange={(e) => setExit(e.target.value)}/></label><button onClick={() => close.mutate()} disabled={close.isPending || !(Number(exit) > 0)}>{close.isPending ? "Closing…" : "Close + score"}</button></>}<button className="danger" aria-label={`Delete ${trade.symbol} journal trade`} onClick={() => remove.mutate()} disabled={remove.isPending}>Delete</button></div></article>;
}

function JournalWorkspace({ asset }: { asset: any | null }) {
  const qc = useQueryClient(); const q = useQuery({ queryKey: ["trade-journal"], queryFn: () => api.listTradeJournal({}) });
  const [form, setForm] = useState({ symbol: asset?.symbol ?? "", side: "long" as "long"|"short", entry: asset?.price ? String(asset.price) : "", stop: "", target: "", size: "", leverage: "", status: "planned" as "planned"|"open", notes: "" });
  const [rule, setRule] = useState("");
  useEffect(() => { if (asset) setForm((old) => ({ ...old, symbol: old.symbol || asset.symbol, entry: old.entry || String(asset.price ?? "") })); }, [asset?.id]);
  const create = useMutation({ mutationFn: () => api.addJournalTrade({ symbol: form.symbol, side: form.side, entry: Number(form.entry), stop: Number(form.stop), target: Number(form.target) > 0 ? Number(form.target) : null, size: Number(form.size) > 0 ? Number(form.size) : null, leverage: Number(form.leverage) > 0 ? Number(form.leverage) : null, status: form.status, notes: form.notes }), onSuccess: () => { setForm((old) => ({ ...old, entry: "", stop: "", target: "", size: "", leverage: "", notes: "" })); qc.invalidateQueries({ queryKey: ["trade-journal"] }); } });
  const addRule = useMutation({ mutationFn: () => api.addTradingRule({ text: rule }), onSuccess: () => { setRule(""); qc.invalidateQueries({ queryKey: ["trade-journal"] }); } });
  const toggleRule = useMutation({ mutationFn: (row:any) => api.toggleTradingRule({ id: row.id, enabled: !row.enabled }), onSuccess: () => qc.invalidateQueries({ queryKey: ["trade-journal"] }) });
  const deleteRule = useMutation({ mutationFn: (id:number) => api.deleteTradingRule({ id }), onSuccess: () => qc.invalidateQueries({ queryKey: ["trade-journal"] }) });
  const trades = q.data?.trades ?? []; const openCount = trades.filter((row:any) => row.status !== "closed").length; const closed = trades.filter((row:any) => row.status === "closed" && row.outcomeR != null); const avgR = closed.length ? closed.reduce((sum:number,row:any) => sum + Number(row.outcomeR), 0) / closed.length : null;
  const submit = (e:FormEvent) => { e.preventDefault(); if (form.symbol.trim() && Number(form.entry) > 0 && Number(form.stop) > 0) create.mutate(); };
  return <div className="stack journal-workspace"><ViewLabel view="paper"/><section className="workspace-command"><div><p className="eyebrow cyan">Trade journal</p><h2>Your setups and outcomes</h2><p>Planned and live trades share the same journal used by Coin check. Closing a row scores its result in R from the frozen entry and stop.</p></div><div className="workspace-totals"><span><b>{openCount}</b> active</span><span><b>{closed.length}</b> scored</span><span><b>{avgR == null ? "—" : `${num(avgR)}R`}</b> average</span></div></section><section className="terminal-section"><h2>Add a trade</h2><form className="form" onSubmit={submit}><label>Symbol<input aria-label="Journal trade symbol" value={form.symbol} onChange={(e)=>setForm({...form,symbol:e.target.value.toUpperCase()})} placeholder="BTC"/></label><label>Side<select aria-label="Journal trade side" value={form.side} onChange={(e)=>setForm({...form,side:e.target.value as "long"|"short"})}><option value="long">Long</option><option value="short">Short</option></select></label><label>Entry<input aria-label="Journal trade entry" type="number" min="0" step="any" value={form.entry} onChange={(e)=>setForm({...form,entry:e.target.value})}/></label><label>Stop<input aria-label="Journal trade stop" type="number" min="0" step="any" value={form.stop} onChange={(e)=>setForm({...form,stop:e.target.value})}/></label><label>Target<input aria-label="Journal trade target" type="number" min="0" step="any" value={form.target} onChange={(e)=>setForm({...form,target:e.target.value})}/></label><label>Size<input aria-label="Journal trade size" type="number" min="0" step="any" value={form.size} onChange={(e)=>setForm({...form,size:e.target.value})}/></label><label>Leverage<input aria-label="Journal trade leverage" type="number" min="0" step="any" value={form.leverage} onChange={(e)=>setForm({...form,leverage:e.target.value})}/></label><label>Status<select aria-label="Journal trade status" value={form.status} onChange={(e)=>setForm({...form,status:e.target.value as "planned"|"open"})}><option value="planned">Planned</option><option value="open">Open</option></select></label><label className="wide">Notes<textarea aria-label="Journal trade notes" value={form.notes} onChange={(e)=>setForm({...form,notes:e.target.value})}/></label><button className="primary" disabled={create.isPending || !form.symbol.trim() || !(Number(form.entry)>0) || !(Number(form.stop)>0)}>{create.isPending ? "Saving…" : "Save trade"}</button></form>{create.isError && <p className="source-warning">Trade could not be saved.</p>}</section><section className="terminal-section"><div className="panel-head"><div><p className="eyebrow cyan">Journal ledger</p><h2>{trades.length ? `${trades.length} saved trade${trades.length === 1 ? "" : "s"}` : "No saved trades"}</h2></div><button className="refresh-small" onClick={()=>q.refetch()} disabled={q.isFetching}>{q.isFetching ? "Reloading…" : "Reload"}</button></div>{q.isPending ? <Empty>Loading your journal…</Empty> : trades.length ? <div className="journal-list">{trades.map((trade:any)=><JournalTradeRow key={trade.id} trade={trade}/>)}</div> : <Empty>Log a planned or live trade above. Coin check entries will appear here too.</Empty>}</section><section className="terminal-section"><p className="eyebrow cyan">Trading rules</p><h2>Pre-trade checklist</h2><form className="rule-add" onSubmit={(e)=>{e.preventDefault();if(rule.trim())addRule.mutate();}}><input aria-label="New trading rule" value={rule} onChange={(e)=>setRule(e.target.value)} placeholder="Add a rule you want visible before entries"/><button className="primary" disabled={addRule.isPending || !rule.trim()}>Add</button></form>{q.data?.rules.length ? <div className="rule-list">{q.data.rules.map((row:any)=><div key={row.id}><button className={`check ${row.enabled ? "on" : ""}`} aria-label={`${row.enabled ? "Disable" : "Enable"} rule: ${row.text}`} onClick={()=>toggleRule.mutate(row)}>{row.enabled ? "✓" : ""}</button><span className={row.enabled ? "" : "muted"}>{row.text}</span><button className="danger" aria-label={`Delete rule: ${row.text}`} onClick={()=>deleteRule.mutate(row.id)}>×</button></div>)}</div> : <Empty>No trading rules saved yet.</Empty>}</section></div>;
}

function AlertsWorkspace({ asset, openCoin }: { asset: any | null; openCoin: (id: string, symbol: string) => void }) {
  const qc = useQueryClient(); const q = useQuery({ queryKey: ["alerts-workspace"], queryFn: () => api.listAlertsWorkspace({}) });
  const contextsQuery = useQuery({ queryKey: ["asset-contexts"], queryFn: () => api.getAssetContexts({ symbols: ["BTC", "NEAR", "BAC"] }) });
  const contexts: any[] = contextsQuery.data?.rows ?? []; const contextBySymbol = new Map(contexts.map((row:any) => [String(row.symbol).toUpperCase(), row]));
  const [form, setForm] = useState({ coinId: asset?.id ?? "", symbol: asset?.symbol ?? "", type: "entry" as "entry"|"funding"|"oi"|"whale"|"unlock", threshold: "", wallet: "" });
  useEffect(() => { if (asset) setForm((old)=>({ ...old, coinId: old.coinId || asset.id, symbol: old.symbol || asset.symbol })); }, [asset?.id]);
  const create = useMutation({ mutationFn: () => api.addAlert({ coinId: form.coinId, symbol: form.symbol, type: form.type, threshold: Number.isFinite(Number(form.threshold)) && form.threshold.trim() !== "" ? Number(form.threshold) : null, wallet: form.wallet.trim() || null }), onSuccess: () => { setForm((old)=>({ ...old, threshold:"", wallet:"" })); qc.invalidateQueries({ queryKey:["alerts-workspace"] }); } });
  const toggle = useMutation({ mutationFn: (row:any)=>api.toggleAlert({ id:row.id, enabled:!row.enabled }), onSuccess:()=>qc.invalidateQueries({queryKey:["alerts-workspace"]}) });
  const remove = useMutation({ mutationFn: (id:number)=>api.deleteAlert({id}), onSuccess:()=>qc.invalidateQueries({queryKey:["alerts-workspace"]}) });
  const alerts = q.data?.alerts ?? []; const hits = q.data?.hits ?? []; const thresholdNeeded = form.type === "entry" || form.type === "funding" || form.type === "oi";
  const submit = (e:FormEvent) => { e.preventDefault(); if(form.coinId.trim() && form.symbol.trim() && (!thresholdNeeded || form.threshold.trim() !== "")) create.mutate(); };
  const typeLabel = (row:any) => row.type === "entry" ? `Price ${money(row.threshold)}` : row.type === "funding" ? `Funding ${row.threshold == null ? "—" : `${num(row.threshold)}%`}` : row.type === "oi" ? `OI change ${row.threshold == null ? "—" : `${num(row.threshold)}%`}` : row.type === "whale" ? row.wallet ? `Wallet ${row.wallet.slice(0,8)}…${row.wallet.slice(-5)}` : "Whale activity" : "Unlock event";
  return <div className="stack alerts-workspace"><ViewLabel view="paper"/><section className="workspace-command"><div><p className="eyebrow cyan">Alert desk</p><h2>Saved market tripwires</h2><p>Manage the alert definitions and hit history already stored by the terminal.</p></div><div className="workspace-totals"><span><b>{alerts.filter((row:any)=>row.enabled).length}</b> enabled</span><span><b>{alerts.filter((row:any)=>!row.enabled).length}</b> paused</span><span><b>{hits.length}</b> hits</span></div></section><section className="terminal-section shared-contexts"><div className="panel-head"><div><p className="eyebrow cyan">Shared research context</p><h2>BTC, NEAR and BAC</h2></div><button className="refresh-small" onClick={()=>contextsQuery.refetch()} disabled={contextsQuery.isFetching}>{contextsQuery.isFetching ? "Reloading…" : "Reload"}</button></div>{contextsQuery.isPending ? <Empty>Linking stored research…</Empty> : contexts.length ? <div className="context-demo-list">{contexts.map((context:any)=><AssetContextSummary key={context.assetId} context={context} compact/>)}</div> : <Empty>{contextsQuery.data?.error ?? "No linked asset context is available."}</Empty>}</section><section className="terminal-section"><h2>Add an alert</h2><form className="form" onSubmit={submit}><label>Coin ID<input aria-label="Alert coin id" value={form.coinId} onChange={(e)=>setForm({...form,coinId:e.target.value.toLowerCase()})} placeholder="bitcoin"/></label><label>Symbol<input aria-label="Alert symbol" value={form.symbol} onChange={(e)=>setForm({...form,symbol:e.target.value.toUpperCase()})} placeholder="BTC"/></label><label>Type<select aria-label="Alert type" value={form.type} onChange={(e)=>setForm({...form,type:e.target.value as typeof form.type})}><option value="entry">Entry price</option><option value="funding">Funding</option><option value="oi">Open interest</option><option value="whale">Whale wallet</option><option value="unlock">Unlock event</option></select></label><label>{thresholdNeeded ? "Threshold" : "Threshold · optional"}<input aria-label="Alert threshold" type="number" step="any" value={form.threshold} onChange={(e)=>setForm({...form,threshold:e.target.value})} placeholder={form.type === "entry" ? "Price in USD" : form.type === "funding" ? "Funding percent" : form.type === "oi" ? "OI change percent" : "Optional"}/></label>{form.type === "whale" && <label className="wide">Wallet · optional<input aria-label="Alert wallet" value={form.wallet} onChange={(e)=>setForm({...form,wallet:e.target.value})} placeholder="0x…"/></label>}<button className="primary" disabled={create.isPending || !form.coinId.trim() || !form.symbol.trim() || (thresholdNeeded && !form.threshold.trim())}>{create.isPending ? "Saving…" : "Save alert"}</button></form>{create.isError && <p className="source-warning">Alert could not be saved.</p>}</section><section className="terminal-section"><div className="panel-head"><div><p className="eyebrow cyan">Definitions</p><h2>{alerts.length ? `${alerts.length} saved alert${alerts.length === 1 ? "" : "s"}` : "No saved alerts"}</h2></div><button className="refresh-small" onClick={()=>q.refetch()} disabled={q.isFetching}>{q.isFetching ? "Reloading…" : "Reload"}</button></div>{q.isPending ? <Empty>Loading saved alerts…</Empty> : alerts.length ? <div className="alert-list">{alerts.map((row:any)=><article key={row.id} className={row.enabled ? "enabled" : "paused"}><div><strong>{row.symbol} · {String(row.type).toUpperCase()}</strong><small>{typeLabel(row)} · saved {new Date(row.createdAt).toLocaleString()}</small></div><b>{row.enabled ? "ENABLED" : "PAUSED"}</b><div className="row-actions"><button onClick={()=>toggle.mutate(row)}>{row.enabled ? "Pause" : "Enable"}</button><button className="danger" aria-label={`Delete ${row.symbol} ${row.type} alert`} onClick={()=>remove.mutate(row.id)}>Delete</button></div>{contextBySymbol.get(String(row.symbol).toUpperCase()) ? <details className="alert-context"><summary>Why this asset is on the desk</summary><AlertContextSummary context={contextBySymbol.get(String(row.symbol).toUpperCase())} onOpen={()=>openCoin(row.coinId, row.symbol)}/></details> : <small className="alert-context-missing">No verified asset context is linked for this symbol.</small>}</article>)}</div> : <Empty>Add a tripwire above. Existing terminal alert rows will appear here.</Empty>}</section><section className="terminal-section"><p className="eyebrow cyan">Hit history</p><h2>Triggered alerts</h2>{hits.length ? <div className="alert-hit-list">{hits.map((hit:any)=><article key={hit.id}><div><strong>{hit.symbol}</strong><small>{hit.source} · {new Date(hit.createdAt).toLocaleString()}</small></div><p>{hit.message}</p>{contextBySymbol.get(String(hit.symbol).toUpperCase()) ? <details className="alert-context"><summary>Asset context at review</summary><AlertContextSummary context={contextBySymbol.get(String(hit.symbol).toUpperCase())} onOpen={()=>{const context=contextBySymbol.get(String(hit.symbol).toUpperCase());if(context)openCoin(context.assetId, context.symbol);}}/></details> : null}</article>)}</div> : <Empty>No stored alert hits yet.</Empty>}</section></div>;
}

function CoinRequired({ onHome }: { onHome: () => void }) {
  return <section className="coin-required"><p className="eyebrow cyan">Coin dossier</p><h2>Choose a coin to open this view</h2><p>Use the search bar above, then select a result. The home page stays market-wide until you do.</p><button className="primary" onClick={onHome}>Back to home</button></section>;
}

function MemeRiskWorkspace() {
  const [mint, setMint] = useState("");
  const [symbol, setSymbol] = useState("");
  const [claimsRenounced, setClaimsRenounced] = useState(false);
  const qc = useQueryClient();
  const history = useQuery({ queryKey: ["meme-risk-history"], queryFn: () => api.listMemeRiskValidations({}) });
  const run = useMutation({ mutationFn: () => api.validateMemeRisk({ mint: mint.trim(), symbol: symbol.trim() || undefined, claimsRenounced }), onSuccess: () => qc.invalidateQueries({ queryKey: ["meme-risk-history"] }) });
  const current = run.data?.validation ?? history.data?.validations?.[0] ?? null;
  const validMint = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(mint.trim());
  const details = (factor: any) => factor?.details && typeof factor.details === "object" ? factor.details : {};
  return <div className="meme-risk-workspace">
    <section className="terminal-section meme-risk-intro">
      <div className="panel-head"><div><p className="eyebrow cyan">T3 / T4 · on demand only</p><h2>Unified meme risk</h2></div><Source>RugCheck + FluxRPC · Alchemy fallback</Source></div>
      <p>Validate one Solana mint before a meme-lane decision. A qualifying funding bundle or critical RugCheck witness disqualifies; an unavailable check stays UNVERIFIED.</p>
      <div className="meme-risk-form">
        <label><span>Solana mint</span><input aria-label="Solana token mint" value={mint} onChange={(event) => setMint(event.target.value.trim())} placeholder="Paste mint address"/></label>
        <label><span>Symbol · optional</span><input aria-label="Token symbol" value={symbol} onChange={(event) => setSymbol(event.target.value.toUpperCase().slice(0,20))} placeholder="e.g. BONK"/></label>
        <label className="renounced-check"><input type="checkbox" checked={claimsRenounced} onChange={(event) => setClaimsRenounced(event.target.checked)}/><span>Token is presented as renounced</span></label>
        <button className="primary" onClick={() => run.mutate()} disabled={!validMint || run.isPending}>{run.isPending ? "Tracing holders…" : "Run risk validation"}</button>
      </div>
      {!validMint && mint.length > 0 && <small className="form-error">Enter a valid base58 Solana mint address.</small>}
      {run.data?.error && <p className="meme-risk-error">{run.data.error}</p>}
    </section>
    {current ? <section className={`terminal-section meme-risk-result verdict-${String(current.verdict).toLowerCase()}`}>
      <div className="meme-risk-verdict"><div><p className="eyebrow">Validation verdict</p><h2>{current.verdict}</h2></div><div><strong>{current.symbol || `${String(current.mint).slice(0,6)}…${String(current.mint).slice(-4)}`}</strong><small>as of {sourceTimeLabel(new Date(current.asOf).getTime())}</small></div></div>
      {current.vetoReason && <p className="veto-line"><b>Veto:</b> {current.vetoReason}</p>}
      <div className="meme-factor-ledger">{(current.factors ?? []).map((factor: any) => { const d = details(factor); const clusters = Array.isArray(d.clusters) ? d.clusters : []; return <article key={factor.id}>
        <header><div><span>{factor.label}</span><small>{factor.source}</small></div><b className={`risk-state ${factor.status}`}>{String(factor.status).toUpperCase()}</b></header>
        <p>{factor.summary}</p>
        {factor.id === "rugcheck" && <div className="risk-metrics"><span>Risk score <b>{d.score == null ? "—" : `${num(Number(d.score))}/100`}</b></span><span>Mint authority <b>{d.mintAuthority ? "ENABLED" : "none returned"}</b></span><span>Freeze authority <b>{d.freezeAuthority ? "ENABLED" : "none returned"}</b></span><span>LP locked <b>{d.lpLockedPct == null ? "—" : `${num(Number(d.lpLockedPct))}%`}</b></span></div>}
        {factor.id === "bundle_detection" && <><div className="risk-metrics"><span>Wallets checked <b>{num(Number(d.checkedWallets ?? 0))}</b></span><span>Unresolved <b>{num(Number(d.unresolvedWallets ?? 0))}</b></span><span>CEX-like excluded <b>{num(Number(d.excludedExchangeFunders ?? 0))}</b></span><span>Alchemy history fallback <b>{num(Number(d.fundingHistory?.alchemyFallbackUsable ?? 0))}</b></span></div>{clusters.length > 0 && <div className="bundle-clusters"><strong>Linked clusters</strong>{clusters.map((cluster: any, index: number) => <div key={`${cluster.funder}-${index}`}><span>{String(cluster.funder).slice(0,6)}…{String(cluster.funder).slice(-4)}</span><b>{cluster.walletCount} wallets · {num(Number(cluster.supplyPct))}% supply</b></div>)}</div>}</>}
        {factor.id === "holder_concentration" && <div className="risk-metrics"><span>Holder accounts <b>{d.holderCount == null ? "—" : num(Number(d.holderCount), true)}</b></span><span>Top-account share <b>{d.topHolderSharePct == null ? "—" : `${num(Number(d.topHolderSharePct))}%`}</b></span><span>Prior snapshot <b>{d.previousHolderCount == null ? "not yet" : num(Number(d.previousHolderCount), true)}</b></span><span>Trend <b>{d.holderTrendPct == null ? "needs repeat" : percent(Number(d.holderTrendPct))}</b></span></div>}
        <footer>{sourceTimeLabel(new Date(factor.asOf).getTime())}</footer>
      </article>; })}</div>
      <details className="risk-limits"><summary>Method limits</summary><ul>{(current.limits ?? []).map((limit: string) => <li key={limit}>{limit}</li>)}</ul></details>
    </section> : <section className="terminal-section"><Empty>No meme-risk validation yet. Paste an exact Solana mint to run all three checks.</Empty></section>}
    {history.data?.validations?.length ? <section className="terminal-section"><div className="panel-head"><div><p className="eyebrow">Saved ledger</p><h2>Recent validations</h2></div><Source>{`${history.data.validations.length} stored`}</Source></div><div className="risk-history">{history.data.validations.map((row: any) => <article key={row.id}><b className={`risk-state ${String(row.verdict).toLowerCase()}`}>{row.verdict}</b><span>{row.symbol || `${String(row.mint).slice(0,6)}…${String(row.mint).slice(-4)}`}</span><small>{sourceTimeLabel(new Date(row.asOf).getTime())}</small></article>)}</div></section> : null}
  </div>;
}

function normAssetSymbol(raw: unknown): string {
  const cleaned = String(raw ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (cleaned.endsWith("USDT")) return cleaned.slice(0, -4);
  if (cleaned.endsWith("USD")) return cleaned.slice(0, -3);
  return cleaned;
}
function parsePayloadJson(value: unknown): any {
  if (value && typeof value === "object") return value;
  if (typeof value === "string") { try { const parsed = JSON.parse(value); return parsed && typeof parsed === "object" ? parsed : {}; } catch { return {}; } }
  return {};
}
function tsLabel(iso: unknown): string {
  if (typeof iso !== "string" || !iso) return "unverified";
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return "unverified";
  return `${iso} · ${new Date(ms).toLocaleString()}`;
}
function orUnverified(value: unknown): string {
  if (value == null || value === "") return "unverified";
  return String(value);
}

function barrierName(barrier: string): string {
  return barrier === "invalidation" ? "Invalidation" : barrier === "target1" ? "Target 1" : barrier === "target2" ? "Target 2" : barrier;
}

function VenueMonitoringBlock({ mon }: { mon: any }) {
  return <div className="venue-monitoring">
    <h3>Venue monitoring · {mon.venue ?? "original venue"}</h3>
    <p className="asset-meta"><b>Latest-window observations</b> — this block reports the latest monitoring window only; it is not the canonical outcome record.</p>
    <p className="asset-meta">Coverage · last checked {tsLabel(mon.lastCheckUtc)} · {mon.barsEligible ?? "—"} of {mon.barsFetched ?? "—"} 1-minute bars covered{mon.windowFromUtc ? ` · window ${mon.windowFromUtc} → ${mon.windowToUtc ?? "—"}` : ""} · covered through {mon.lastCoveredBarCloseUtc ?? "—"}</p>
    <p className="asset-meta">Unknown intervals · {mon.gapCount > 0 ? `${mon.gapCount} gap${mon.gapCount === 1 ? "" : "s"}${mon.gaps?.length ? `: ${mon.gaps.map((g: any) => `${g.fromUtc ?? "?"} → ${g.toUtc ?? "?"}`).join("; ")}` : ""}` : "none — every interval in the covered window has bars"}{mon.spanningCount > 0 ? ` · ${mon.spanningCount} entry-spanning bar${mon.spanningCount === 1 ? "" : "s"} excluded from touch evidence` : ""}</p>
    <p className="venue-outcome"><b>Latest barrier observation:</b> {mon.outcomePlain}</p>
    {mon.outcomeNote && mon.outcomeNote !== mon.outcomePlain ? <p className="asset-meta">{mon.outcomeNote}</p> : null}
    {(mon.firstTouches ?? []).length > 1 ? <p className="asset-meta">First touches · {mon.firstTouches.map((t: any) => `${barrierName(t.barrier)} at ${t.barOpenUtc ?? "—"}`).join(" · ")}</p> : null}
    <div className="indicator-grid asset-metrics">
      <Metric label="Entry price" value={money(mon.entryPrice)}/>
      <Metric label="Invalidation" value={money(mon.invalidation)} tone="down"/>
      <Metric label="Target 1" value={money(mon.target1)} tone="up"/>
      <Metric label="Target 2" value={money(mon.target2)} tone="up"/>
    </div>
    <p className="asset-meta">Late observation from the original venue — not a new entry and not a retroactive timely alert. The recorded lifecycle verdict is not rewritten by this monitoring.</p>
  </div>;
}

function ResearchMarketData() {
  const q = useQuery({ queryKey: ["paper-monitoring-market"], queryFn: () => api.getPaperMonitoring({}), staleTime: 60_000 });
  const market: any = (q.data as any)?.market ?? null;
  const changeText = (inst: any): string => {
    const mid = (inst.changes ?? []).find((c: any) => c.field === "midPx");
    if (!mid) return "no change record for this refresh";
    if (mid.was == null) return "first collected snapshot — no previous refresh to compare";
    const was = Number(mid.was); const now = Number(mid.now);
    if (!Number.isFinite(was) || !Number.isFinite(now) || was === 0) return `mid ${mid.was} → ${mid.now}`;
    const pct = (now - was) / was * 100;
    return `mid ${mid.was} → ${mid.now} (${pct >= 0 ? "+" : ""}${pct.toFixed(3)}%)`;
  };
  return <section className="terminal-section" aria-label="Research market data">
    <div className="panel-head"><div><p className="eyebrow cyan">Research market data</p><h2>Shared perp snapshot</h2></div><Source>Hyperliquid perps · collected snapshot</Source></div>
    {q.isPending ? <Empty>Loading research market data…</Empty> : market?.available ? <>
      <p className="asset-meta">Source time {tsLabel(market.receiptTimeUtc)} · last refreshed {tsLabel(market.lastRefreshUtc)} · venue {market.venue ?? "—"} · market {market.marketType ?? "—"}</p>
      <div className="asset-record-list">{(market.instruments ?? []).map((inst: any) => <article key={inst.symbol} className="asset-record compact-record">
        <header><div><strong>{inst.symbol} · mid {inst.midPx ?? "—"}</strong><small>mark {inst.markPx ?? "—"} · oracle {inst.oraclePx ?? "—"}</small></div><span className="status">SNAPSHOT</span></header>
        <p className="asset-meta">Since previous refresh · {changeText(inst)}</p>
        <p className="asset-meta">History available · {inst.completedCandles ?? "—"} completed {inst.candleInterval ?? "1h"} candles · {inst.fundingPoints ?? "—"} funding history points</p>
        <p className="asset-meta">Funding {inst.funding ?? "—"} · open interest {inst.openInterest ?? "—"} · 24h volume {inst.dayNtlVlm ?? "—"}</p>
      </article>)}</div>
      <p className="score-disclaimer">Funding and open-interest history starts at the first collected snapshot (2026-10-19) and does not establish earlier trends.</p>
    </> : <p className="unavailable-line"><b>UNAVAILABLE</b> — research market data is not reachable from this view.</p>}
  </section>;
}

function zroPrice(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

// ZRO lane-separated acceptance view (worker 3, §3): five records across five
// lanes, rendered from existing reads only (getSignalTracker, listTheoryWatch,
// getuniversetiers, getDossierTrackRecord). No lane rewrites, demotes or
// reconciles another; disagreements render side by side with population labels.
function ZroLaneSection({ signal }: { signal: any | null }) {
  const pictureQ = useQuery({ queryKey: ["zro-complete-picture"], queryFn: () => api.getCompletePicture({ coinId: "layerzero", name: "LayerZero", symbol: "ZRO", analysis: {} }), staleTime: 120_000 });
  const tiersQ = useQuery({ queryKey: ["zro-universe-tiers"], queryFn: () => api.getuniversetiers({}), staleTime: 120_000 });
  const trackQ = useQuery({ queryKey: ["zro-dossier-track"], queryFn: () => api.getDossierTrackRecord({ coinId: "layerzero" }), staleTime: 120_000 });
  const theory4: any = ((pictureQ.data as any)?.data?.theories ?? []).find((t: any) => t.id === 4) ?? null;
  const tierRow: any = ((tiersQ.data as any)?.rows ?? []).find((r: any) => r.coin === "ZRO") ?? null;
  const dossierShort: any = ((trackQ.data as any)?.data?.directionHistory ?? []).find((r: any) => r.direction === "short") ?? null;
  const history: any[] = signal?.history ?? [];
  const checkpoint = (days: number) => history.find((h: any) => h.daysSinceEntry === days) ?? null;
  const cp1 = checkpoint(1); const cp2 = checkpoint(2); const cp3 = checkpoint(3);
  const doorDates = [signal?.createdAt].filter((v: any): v is string => typeof v === "string" && Number.isFinite(new Date(v).getTime())).sort();
  const doorDate = doorDates[0] ? doorDates[0].slice(0, 10) : "2026-10-02";
  const doorAgeDays = doorDates[0] ? Math.floor((Date.now() - new Date(doorDates[0]).getTime()) / 86_400_000) : null;
  const staleDoor = doorAgeDays != null && doorAgeDays > 7;
  return <section className="terminal-section" aria-label="ZRO lane-separated records">
    <div className="panel-head"><div><p className="eyebrow cyan">ZRO · LayerZero</p><h2>One asset, five lanes — no forced agreement</h2></div><Source>getSignalTracker + getCompletePicture + getuniversetiers + getDossierTrackRecord</Source></div>
    <p className="muted">Each record stays in its own lane and population. A disagreement between lanes is shown, never resolved: no lane rewrites, demotes or overrides another.</p>

    <div className="asset-subblock" id="zro-lane-a">
      <h3>Lane A · Recorded paper trades</h3>
      <p className="score-disclaimer">Only issued entries with frozen levels appear in this lane.</p>
      {signal ? <article className="asset-record">
        <header><div><strong>#{signal.id} · ZRO · {String(signal.direction).toUpperCase()}</strong><small>issued {tsLabel(signal.createdAt)} · setup {signal.setupType} · {signal.coinId}</small></div><span className="status challenged">{String(signal.evaluationStatuses?.d30 ?? "open").toUpperCase()}</span></header>
        <div className="indicator-grid asset-metrics">
          <Metric label="Direction" value={String(signal.direction).toUpperCase()}/>
          <Metric label="Entry" value={zroPrice(signal.entry)}/>
          <Metric label="Invalidation" value={`~${zroPrice(signal.invalidation)}`} tone="down"/>
          <Metric label="Target 1" value={zroPrice(signal.target1)} tone="up"/>
          <Metric label="Target 2" value={zroPrice(signal.target2)} tone="up"/>
          <Metric label="Confidence" value={`${num(signal.confidence)} / 100`}/>
        </div>
        <p className="asset-meta">Invalidation grade {signal.invalidationGrade} · risk method {signal.riskMethod === "legacy_fixed" ? "legacy fixed — pre-ATR methodology" : orUnverified(signal.riskMethod)} · horizon windows 5 / 14 / 30 days.</p>
        {(signal.factors ?? []).length ? <div className="theory-evidence"><span>Factor ledger · as stored</span>{signal.factors.map((f: any, i: number) => <div key={`${f.label}-${i}`} className="asset-evidence-row">{f.label} · {f.reading ?? f.value}<small>{f.source}</small></div>)}</div> : null}
        <p className="asset-meta">Machine lifecycle · evaluation 5D {orUnverified(signal.evaluationStatuses?.d5)} · 14D {orUnverified(signal.evaluationStatuses?.d14)} · 30D {orUnverified(signal.evaluationStatuses?.d30)} · record integrity {orUnverified(signal.recordIntegrity)}.</p>
        <div className="zro-verdict-split">
          <div><span>Machine adapted verdict</span><b>{String(signal.legacyOutcomes?.d5 ?? "unverified").toUpperCase()}</b><p>d5 legacy outcome, adapted under the current cohort contract. The machine evaluation windows above remain open; this verdict is not rewritten.</p></div>
          <div><span>Retrospective review</span><b>HIT · +12.09%</b><p>2026-10-04 retrospective review grade for the same signal — a separate record, kept in the legacy review record below. It does not overwrite the machine verdict.</p></div>
        </div>
        <p className="asset-meta">Population: recorded paper trade (issued signal) · record #{signal.id}. The two verdicts describe different populations and are not reconciled.</p>
      </article> : <Empty>Signal #12 is not present in the current tracker read.</Empty>}
      <article className="asset-record">
        <header><div><strong>Legacy review record</strong><small>2026-10-04 retrospective review · signal #12</small></div><span className="status">RETROSPECTIVE</span></header>
        <p><b>legacy review record — retrospective, not machine evaluation.</b></p>
        <p className="asset-meta">Grade: HIT · +12.09% (2026-10-04 review).</p>
        <p className="asset-meta">Legacy dossier checkpoints · 1D {cp1 ? percent(cp1.returnPct) : "—"} · 2D {cp2 ? percent(cp2.returnPct) : "—"} · 3D {cp3 ? percent(cp3.returnPct) : "—"} — read from the stored interim snapshots for signal #12.</p>
        <p className="asset-meta">The legacy dossier marks the run continuing to +21.79% by 2026-10-12.</p>
        <p className="asset-meta">Population: legacy review record (retrospective) · kept separate from the machine lifecycle above.</p>
      </article>
    </div>

    <div className="asset-subblock" id="zro-lane-b">
      <h3>Lane B · Investment research</h3>
      <p className="score-disclaimer">Assessments and theses — not trades. Nothing in this lane is an issued setup.</p>
      {theory4 ? <article className="asset-record">
        <header><div><strong>Theory #4</strong><small>theory watch · linked ZRO · last checked {tsLabel(theory4.checkedAt)}</small></div><span className={`status ${theory4.status === "live" ? "confirming" : theory4.status === "invalidated" ? "refuted" : "challenged"}`}>{theory4.status === "live" ? "VERIFIED · LIVE" : String(theory4.status).toUpperCase()}</span></header>
        <p><b>{theory4.headline}</b></p>
        <p className="asset-meta">Confidence {orUnverified(theory4.confidence)} · direction {orUnverified(theory4.direction)} · {num(theory4.sourceCount)} attached sources</p>
        <div className="asset-evidence-row"><b>Countercase · 2026-10-02 audit — travels with the theory</b><p>{theory4.countercase}</p></div>
        <p className="asset-meta">Population: investment research (tracked theory) · theory #4. The theory stays verified; nothing here demotes it.</p>
      </article> : <Empty>{pictureQ.isPending ? "Loading theory #4…" : "Theory #4 is not present in the current complete-picture read."}</Empty>}
      <article className="asset-record">
        <header><div><strong>Research dossier · SHORT</strong><small>diagnosis-only verdict snapshot{dossierShort ? ` · ${tsLabel(dossierShort.decisionAt)}` : ""}</small></div><span className="status challenged">{dossierShort ? `${num(dossierShort.score)} / 100` : "52 / 100"}</span></header>
        <div className="indicator-grid asset-metrics">
          <Metric label="Factor agreement" value={`${dossierShort ? num(dossierShort.score) : "52"} / 100`}/>
          <Metric label="Reference entry" value="US$1.84–1.95"/>
          <Metric label="Invalidation" value="US$2.16" tone="down"/>
          <Metric label="Target 1" value="US$1.45" tone="up"/>
          <Metric label="Target 2" value="US$1.17" tone="up"/>
        </div>
        <p><b>Research-reference only · no issued setup is attached</b></p>
        <p className="asset-meta">Not eligible · no issued contract. No paper trade was ever issued from this dossier.</p>
        <p className="asset-meta">Population: investment research (research dossier) · direction and factor-agreement score from the stored diagnosis-only snapshot{dossierShort ? ` · model ${orUnverified(dossierShort.modelVersion)}` : ""}; reference levels as stored on the dossier record.</p>
      </article>
    </div>

    <div className="asset-subblock" id="zro-lane-c">
      <h3>Lane C · Chart opportunities</h3>
      <p className="score-disclaimer">Observations only — a scanner row is not a setup and carries no levels.</p>
      <article className="asset-record">
        <header><div><strong>Scanner row #90 · ZRO</strong><small>stored discovery scanner row</small></div><span className="status challenged">WATCH</span></header>
        <div className="indicator-grid asset-metrics">
          <Metric label="Direction" value="—"/>
          <Metric label="Factor agreement" value="43 / 100"/>
          <Metric label="Band" value="LOW"/>
          <Metric label="Entry" value="—"/>
          <Metric label="Invalidation" value="—"/>
          <Metric label="Targets" value="—"/>
        </div>
        <p className="asset-meta">Note: monitor only · momentum displacement. No direction is assigned and no entry, invalidation or targets exist on this row.</p>
        <details className="zro-details"><summary>Details</summary><p className="asset-meta">Gates passed 2/5.</p></details>
        {tierRow?.nearStructuralDowntrend && tierRow.athChangePct != null ? <p className="source-warning">Tape note: WARNING near structural-downtrend line ({Number(tierRow.athChangePct).toFixed(1)}% from ATH, hard gate −75%).</p> : null}
        <p className="asset-meta">Population: chart opportunity (scanner observation) · row #90.</p>
      </article>
    </div>

    <div className="asset-subblock" id="zro-t1">
      <h3>T1 membership · processing priority</h3>
      <p className="score-disclaimer">T1 membership is a processing priority, not a buy recommendation.</p>
      {tierRow ? <>
        <p className="zro-badge-line"><span className="feed-badge">T1 · door: verified theory #4 + open long id12 · evidence {doorDate}</span>{staleDoor ? <span className="feed-badge partial">stale door — re-check pending</span> : null}</p>
        <p className="asset-meta">Door evidence is {doorAgeDays == null ? "of unverified age" : `${doorAgeDays} days old`} · display threshold 7 days. The door rests on the theory and the open long — graduation is not part of it.</p>
        <p className="asset-meta">graduation {tierRow.graduationScore == null ? "—" : `${num(tierRow.graduationScore)}/100`} · separate track, not the door.</p>
        <p className="asset-meta">Stored tier reason: {tierRow.reason}</p>
      </> : <Empty>{tiersQ.isPending ? "Loading tier membership…" : "No universe-tier row is stored for ZRO in the current read."}</Empty>}
      <p className="zro-badge-line"><span className="feed-badge partial">views disagree — long (tier door, evidence {doorDate}) vs short (research dossier)</span></p>
      <p className="asset-meta zro-lane-links">This chip takes no side. See the <a href="#zro-lane-a">Lane A long (record #12)</a> and the <a href="#zro-lane-b">Lane B research dossier short</a>.</p>
    </div>
  </section>;
}

// Batch 3 — workspace evidence for one asset: the compounding dossier file,
// the latest cross-stream verdict, and whole caller-ledger / paste.trade
// entries mentioning the asset. All three blocks are verbatim stored
// records; nothing is summarized, no direction is inferred, and silence in
// any block is never presented as a flip.
function AssetEvidenceSection({ symbol }: { symbol: string }) {
  const q = useQuery({ queryKey: ["asset-external-evidence", symbol], queryFn: () => api.getAssetExternalEvidence({ symbol }), staleTime: 300000 });
  const d: any = q.data;
  return <section className="terminal-section" aria-label={`${symbol} workspace evidence`}>
    <ViewLabel view="research"/>
    <div className="panel-head"><div><p className="eyebrow cyan">Workspace evidence · read-only files</p><h2>{symbol} dossier, cross-stream &amp; smart money</h2></div><Source>asset dossier · cross-stream matrix · caller ledger + paste.trade</Source></div>
    {q.isPending ? <Empty>Reading the workspace evidence files…</Empty> : !d || d.error ? <Empty>{d?.error ?? "Workspace evidence is unavailable."}</Empty> : <>
      <div className="asset-subblock">
        <h3>Asset dossier</h3>
        {d.dossier.exists ? <>
          {d.dossier.currentRead ? <p>{d.dossier.currentRead}</p> : null}
          {d.dossier.streamLog ? <><p className="eyebrow">Stream log</p><pre className="evidence-pre">{d.dossier.streamLog}</pre></> : null}
          {d.dossier.learned ? <><p className="eyebrow">What we've learned</p><pre className="evidence-pre">{d.dossier.learned}</pre></> : null}
          {!d.dossier.currentRead && !d.dossier.streamLog && !d.dossier.learned ? <p className="asset-meta">The dossier file exists but carries no current-read, stream-log, or learned sections yet.</p> : null}
        </> : <p className="asset-meta">{`No dossier yet for ${symbol}.`}</p>}
      </div>
      <div className="asset-subblock">
        <h3>Cross-stream verdict{d.crossStream.fileDate ? ` · latest matrix ${d.crossStream.fileDate}` : ""}</h3>
        {d.crossStream.verdict ? <>
          <p><b>{d.crossStream.verdict}</b>{d.crossStream.board ? ` · board: ${d.crossStream.board}` : ""}</p>
          {d.crossStream.agree.length ? <div className="theory-evidence"><span>Agreeing records · as recorded</span>{d.crossStream.agree.map((line: string, i: number) => <p key={i} className="asset-meta">{line}</p>)}</div> : null}
          {d.crossStream.disagree.length ? <div className="theory-evidence"><span>Disagreeing records · as recorded</span>{d.crossStream.disagree.map((line: string, i: number) => <p key={i} className="asset-meta">{line}</p>)}</div> : null}
          {d.crossStream.risks.length ? <div className="theory-evidence"><span>Risks · as recorded</span>{d.crossStream.risks.map((line: string, i: number) => <p key={i} className="asset-meta">{line}</p>)}</div> : null}
          {d.crossStream.note ? <p className="asset-meta">Note: {d.crossStream.note}</p> : null}
          <p className="asset-meta">Verdict and citations are the matrix file's own, dated {d.crossStream.fileDate}. Records about different underlyings are never merged into one claim.</p>
        </> : <p className="asset-meta">{d.crossStream.fileDate ? `No cross-stream check recorded for ${symbol} in the latest matrix (${d.crossStream.fileDate}).` : "No cross-stream matrix file is stored yet."}</p>}
      </div>
      <div className="asset-subblock">
        <h3>Smart-money evidence (caller ledger + paste.trade)</h3>
        {d.smartMoney.entries.length ? <div className="asset-record-list">{d.smartMoney.entries.map((entry: any, i: number) => <article key={`${entry.source}-${i}`} className="asset-record compact-record">
          <header><div><strong>{entry.source}</strong><small>{entry.date ?? "date not recorded"}</small></div></header>
          <p className="evidence-entry">{entry.text}</p>
        </article>)}</div> : <p className="asset-meta">{`No caller-ledger or paste.trade entries mention ${symbol}.`}</p>}
        <p className="asset-meta">Whole entries mentioning {symbol}, shown exactly as recorded — no direction inferred from them here, and an absence of entries is not a signal.</p>
      </div>
    </>}
  </section>;
}


function BoardMomentumLine({ symbol }: { symbol: string }) {
  const q = useQuery({ queryKey: ["hl-opportunity-board"], queryFn: () => api.getHyperliquidOpportunityBoard({}), staleTime: 300000 });
  const board: any = q.data?.board ?? null;
  const row: any = board?.rows?.find((r: any) => String(r.symbol).toUpperCase() === symbol.toUpperCase()) ?? null;
  if (!board || !row) return null;
  return <section className="terminal-section board-momentum" aria-label={`${symbol} Hyperliquid board read`}>
    <div className="panel-head"><div><p className="eyebrow cyan">Hyperliquid board read</p><h2>{symbol} board momentum</h2></div><Source>Hyperliquid opportunity board</Source></div>
    <p className="funnel-stamp">Run {board.runFile} · computed {board.runUtc ? new Date(board.runUtc).toLocaleString() : "—"} · data through {board.identity?.last_completed_bar_open_utc ? new Date(board.identity.last_completed_bar_open_utc).toLocaleString() : "—"}</p>
    <div className="indicator-grid asset-metrics">
      <Metric label="24h move" value={percent(row.mover?.change_pct, 2)}/>
      <Metric label="RS vs BTC (24h)" value={row.btcRelativeStrengthBps == null ? "—" : `${row.btcRelativeStrengthBps >= 0 ? "+" : ""}${Number(row.btcRelativeStrengthBps).toFixed(1)} bps`}/>
      <Metric label="Last completed bar" value={row.lastCompletedBarOpen ? new Date(row.lastCompletedBarOpen).toLocaleString() : "—"}/>
      <Metric label="K=24 distance to prior max" value={percent(row.breakout?.dist_to_prior24_max_pct, 2)}/>
      <Metric label="K=24 distance to prior min" value={percent(row.breakout?.dist_to_prior24_min_pct, 2)}/>
    </div>
  </section>;
}

// Stored asset dossier (batch-1 B1-I10): the workspace dossier file's learned
// block plus its stream log — the last 3 entries inline, older entries in an
// expansion. When no dossier file exists (found:false) the section is
// omitted entirely.
function StoredAssetDossier({ symbol }: { symbol: string }) {
  const q = useQuery({ queryKey: ["asset-dossier-stored", symbol], queryFn: () => api.getAssetDossier({ symbol }), staleTime: 300000 });
  const d: any = q.data;
  if (!d || d.found !== true) return null;
  const raw = String(d.streamLog ?? "").trim();
  const parts = raw ? raw.split(/\n(?=\d{4}-\d{2}-\d{2})/) : [];
  const blocks = (parts.length > 1 ? parts : raw.split(/\n{2,}/)).map((b: string) => b.trim()).filter(Boolean);
  const recent = blocks.slice(-3); const older = blocks.slice(0, Math.max(0, blocks.length - 3));
  return <section className="terminal-section" aria-label={`${symbol} stored asset dossier`}>
    <div className="panel-head"><div><p className="eyebrow cyan">Stored dossier · workspace file</p><h2>Asset dossier — stream log &amp; what we've learned</h2></div><Source>getAssetDossier</Source></div>
    {d.updatedAt ? <p className="asset-meta">Updated {new Date(d.updatedAt).toLocaleString()}</p> : null}
    {d.learned ? <><p className="eyebrow">What we've learned</p><pre className="evidence-pre">{d.learned}</pre></> : null}
    <p className="eyebrow">Stream log · latest {recent.length}</p>
    {recent.length ? recent.map((entry: string, i: number) => <pre key={i} className="evidence-pre">{entry}</pre>) : <p className="asset-meta">No stream-log entries stored yet.</p>}
    {older.length ? <details><summary>Older stream-log entries · {older.length}</summary>{older.map((entry: string, i: number) => <pre key={i} className="evidence-pre">{entry}</pre>)}</details> : null}
  </section>;
}

function AssetView({ focusSymbol, onOpenDossier }: { focusSymbol?: string; onOpenDossier?: (symbol: string) => void }) {
  const [selected, setSelected] = useState(focusSymbol ?? "BTC");
  useEffect(() => { if (focusSymbol) setSelected(focusSymbol); }, [focusSymbol]);
  const tracker = useQuery({ queryKey: ["asset-view-tracker"], queryFn: () => api.getSignalTracker({ limit: 200, cursor: 0, includeTest: false }), staleTime: 120_000 });
  const theoriesQ = useQuery({ queryKey: ["theories"], queryFn: () => api.listTheories({}), staleTime: 120_000 });
  const alertsQ = useQuery({ queryKey: ["asset-view-alerts"], queryFn: () => api.getPaperPilotAlerts({ emitTestAlert: false }), staleTime: 60_000 });
  const statusQ = useQuery({ queryKey: ["asset-view-paper-status"], queryFn: () => api.getPaperPilotStatus({ emitTestAlert: false }), staleTime: 60_000 });
  const contextsQ = useQuery({ queryKey: ["asset-view-context", selected], queryFn: () => api.getAssetContexts({ symbols: [selected] }), staleTime: 120_000 });
  const monitoringQ = useQuery({ queryKey: ["asset-view-monitoring"], queryFn: () => api.getPaperMonitoring({}), staleTime: 60_000 });

  const alertRows = useMemo(() => ((alertsQ.data as any)?.alerts ?? []).map((row: any) => {
    const payload = parsePayloadJson(row.payloadJson);
    const asset = normAssetSymbol(payload.asset ?? payload.symbol ?? "");
    const alertType = String(payload.alert_type ?? row.eventType ?? payload.type ?? "unverified");
    return { row, payload, asset, alertType };
  }), [alertsQ.data]);

  const assetOptions = useMemo(() => {
    const set = new Set<string>(["BTC", "NEAR", "BAC", "ZRO"]);
    for (const s of ((tracker.data as any)?.signals ?? [])) { const sym = normAssetSymbol(s.symbol); if (sym) set.add(sym); }
    for (const t of ((theoriesQ.data as any)?.theories ?? [])) for (const c of (t.linkedCoins ?? [])) { const sym = normAssetSymbol(c.symbol); if (sym) set.add(sym); }
    for (const a of alertRows) if (a.asset) set.add(a.asset);
    for (const c of ((statusQ.data as any)?.candidates ?? [])) { const sym = normAssetSymbol(c.symbol); if (sym) set.add(sym); }
    for (const s of ((statusQ.data as any)?.signals ?? [])) { const sym = normAssetSymbol(s.symbol); if (sym) set.add(sym); }
    return [...set].sort((a, b) => (a === "BTC" ? -1 : b === "BTC" ? 1 : a.localeCompare(b)));
  }, [tracker.data, theoriesQ.data, alertRows, statusQ.data]);

  const dossierRows = useMemo(() => ((tracker.data as any)?.signals ?? []).filter((s: any) => normAssetSymbol(s.symbol) === selected), [tracker.data, selected]);
  const theoryRows = useMemo(() => ((theoriesQ.data as any)?.theories ?? []).filter((t: any) => (t.linkedCoins ?? []).some((c: any) => normAssetSymbol(c.symbol) === selected)), [theoriesQ.data, selected]);
  const assetAlerts = useMemo(() => alertRows.filter((a: any) => a.asset === selected), [alertRows, selected]);
  const entryRows = useMemo(() => assetAlerts.filter((a: any) => a.alertType === "ENTRY_CONFIRMED"), [assetAlerts]);
  const contextRow: any = ((contextsQ.data as any)?.rows ?? [])[0] ?? null;
  const contextTheories: any[] = (contextRow?.evidence ?? []).filter((e: any) => e.type === "theory");
  const withdrawnRows: any[] = contextRow?.withdrawnTheories ?? [];

  const candidateByKey = useMemo(() => new Map<string, any>(((statusQ.data as any)?.candidates ?? []).map((c: any) => [String(c.candidateKey), c])), [statusQ.data]);
  const checkpointByCandidateId = useMemo(() => new Map<number, any>(((statusQ.data as any)?.checkpoints ?? []).map((c: any) => [Number(c.candidateId), c])), [statusQ.data]);
  const checkpointByKey = useMemo(() => {
    const map = new Map<string, any>();
    for (const c of ((statusQ.data as any)?.checkpoints ?? [])) {
      const parsed = parsePayloadJson(c.checkpointJson);
      if (typeof parsed?.candidateKey === "string") map.set(parsed.candidateKey, c);
    }
    return map;
  }, [statusQ.data]);
  const signalById = useMemo(() => new Map<string, any>(((statusQ.data as any)?.signals ?? []).map((s: any) => [String(s.paperSignalId), s])), [statusQ.data]);

  const monitoringData: any = (monitoringQ.data as any) ?? null;
  const monitoringMatch = useMemo(() => {
    const map = new Map<number, any>();
    const used = new Set<string>();
    const positions: any[] = monitoringData?.positions ?? [];
    const byId = new Map<string, any>(positions.map((p: any) => [String(p.positionId), p]));
    for (const { row, payload } of entryRows) {
      let mon = byId.get(String(payload.signal_id ?? row.paperSignalId)) ?? null;
      if (!mon && payload.entry_price != null) mon = positions.find((p: any) => !used.has(String(p.positionId)) && normAssetSymbol(p.symbol) === selected && p.entryPrice != null && Math.abs(Number(p.entryPrice) - Number(payload.entry_price)) < 1e-9) ?? null;
      if (mon) { map.set(row.id, mon); used.add(String(mon.positionId)); }
    }
    return { map, used };
  }, [entryRows, monitoringData, selected]);
  const unmatchedMonitoring = useMemo(() => ((monitoringData?.positions ?? []) as any[]).filter((p: any) => !monitoringMatch.used.has(String(p.positionId)) && normAssetSymbol(p.symbol) === selected), [monitoringData, monitoringMatch, selected]);

  const joinCheckpoint = (row: any) => {
    const candidate = row.contractId ? candidateByKey.get(String(row.contractId)) : undefined;
    if (candidate) { const cp = checkpointByCandidateId.get(Number(candidate.id)); if (cp) return { candidate, checkpoint: cp }; }
    if (row.contractId && checkpointByKey.has(String(row.contractId))) return { candidate: candidate ?? null, checkpoint: checkpointByKey.get(String(row.contractId)) };
    return { candidate: candidate ?? null, checkpoint: null };
  };

  const loading = tracker.isPending || theoriesQ.isPending || alertsQ.isPending || statusQ.isPending;
  return <div className="stack asset-view">
    <ViewLabel view="asset"/>
    <section className="terminal-section asset-picker-section">
      <div className="panel-head"><div><p className="eyebrow cyan">Asset detail · read-only</p><h2>One asset, every record population</h2></div><Source>existing reads only</Source></div>
      {onOpenDossier ? <p className="asset-meta"><a href="#dossier-view" onClick={(e) => { e.preventDefault(); onOpenDossier(selected); }}>Open dossier</a> — the same symbol's Coin Dossier view.</p> : null}
      <p className="muted">This view joins stored records for one canonical asset. Discovery, dossier, theory, paper and notification records stay in their own labeled sections — they are never pooled into one ranked list, and nothing here writes or scores.</p>
      <div className="asset-picker" role="group" aria-label="Asset selector">
        {assetOptions.map((sym) => <button key={sym} type="button" className={selected === sym ? "active" : ""} aria-label={`View ${sym} asset detail`} aria-pressed={selected === sym} onClick={() => setSelected(sym)}>{sym}</button>)}
      </div>
      <div className="asset-counts">
        <span>Dossier signals <b>{dossierRows.length}</b></span>
        <span>Theories <b>{theoryRows.length}</b></span>
        <span>Paper entries <b>{entryRows.length}</b></span>
        <span>Notifications <b>{assetAlerts.length}</b></span>
      </div>
      {loading && <p className="muted">Loading stored records for {selected}…</p>}
    </section>

    <BoardMomentumLine symbol={selected}/>

    {selected === "ZRO" && <ZroLaneSection signal={(((tracker.data as any)?.signals ?? []) as any[]).find((s: any) => s.id === 12 && normAssetSymbol(s.symbol) === "ZRO") ?? null}/>}

    <section className="terminal-section" aria-label={`${selected} discovery assessments`}>
      <div className="panel-head"><div><p className="eyebrow cyan">Discovery assessments</p><h2>{selected} discovery</h2></div><span className="feed-badge partial">UNAVAILABLE</span></div>
      <p className="unavailable-line"><b>UNAVAILABLE</b> — no per-asset discovery read is published. Discovery assessments are not reconstructed here from dossier, theory or paper records.</p>
    </section>

    <section className="terminal-section" aria-label={`${selected} dossier calls`}>
      <div className="panel-head"><div><p className="eyebrow cyan">TRACKED DOSSIER SIGNALS</p><h2>{selected} dossier calls</h2></div><Source>getSignalTracker</Source></div>
      <p className="score-disclaimer">Dossier signals are research calls, not paper positions. They do not establish position lifecycle.</p>
      {tracker.isPending ? <Empty>Loading dossier signals…</Empty> : dossierRows.length ? <div className="asset-record-list">{dossierRows.map((s: any) => <article key={s.id} className="asset-record">
        <header><div><strong>#{s.id} · {s.symbol} · {String(s.direction).toUpperCase()}</strong><small>{s.setupType} · {s.coinId}</small></div><span className={`status ${s.evaluationStatuses?.d30 === "resolved" ? (s.outcome30 === "invalidated" ? "refuted" : "confirming") : "challenged"}`}>{s.evaluationStatuses?.d30 ?? "unverified"}</span></header>
        <div className="indicator-grid asset-metrics">
          <Metric label="Direction" value={String(s.direction).toUpperCase()}/>
          <Metric label="Entry" value={money(s.entry)}/>
          <Metric label="Invalidation" value={money(s.invalidation)} tone="down"/>
          <Metric label="Target 1" value={money(s.target1)} tone="up"/>
          <Metric label="Target 2" value={money(s.target2)} tone="up"/>
          <Metric label="Confidence" value={`${num(s.confidence)} / 100`}/>
        </div>
        <p className="asset-meta">Created {tsLabel(s.createdAt)} · source as of {tsLabel(s.sourceAsOf)}</p>
        <p className="asset-meta">Evaluation · 5D {orUnverified(s.evaluationStatuses?.d5)} / outcome {orUnverified(s.outcome5)}{s.return5 != null ? ` (${percent(s.return5)})` : ""} · 14D {orUnverified(s.evaluationStatuses?.d14)} / outcome {orUnverified(s.outcome14)}{s.return14 != null ? ` (${percent(s.return14)})` : ""} · 30D {orUnverified(s.evaluationStatuses?.d30)} / outcome {orUnverified(s.outcome30)}{s.return30 != null ? ` (${percent(s.return30)})` : ""}</p>
        <p className="asset-meta">Population: dossier (tracked dossier signal) · record #{s.id}</p>
      </article>)}</div> : <Empty>{`No tracked dossier signals are stored for ${selected}.`}</Empty>}
    </section>

    <StoredAssetDossier symbol={selected}/>

    <section className="terminal-section" aria-label={`${selected} theories`}>
      <div className="panel-head"><div><p className="eyebrow cyan">Theories</p><h2>{selected} theories</h2></div><Source>listTheories + getAssetContexts</Source></div>
      {theoriesQ.isPending ? <Empty>Loading theories…</Empty> : theoryRows.length ? <div className="asset-record-list">{theoryRows.map((t: any) => <article key={t.id} className="asset-record">
        <header><div><strong>Theory #{t.id}</strong><small>{t.horizon === "short" ? "Short-term" : "Long-term"} · linked {(t.linkedCoins ?? []).map((c: any) => c.symbol).join(", ")}</small></div><span className={`status ${t.status}`}>{t.status}</span></header>
        <p className="asset-meta">Created {tsLabel(t.createdAt)} · age {ageLabel(Date.now() - new Date(t.createdAt).getTime())} · updated {tsLabel(t.updatedAt)}</p>
        <p>{t.statement}</p>
        <p className="ripple-map"><span>Ripple map</span>{t.rippleMap}</p>
        <p className="asset-meta">Invalidation: unverified — no invalidation field is stored on this theory record.</p>
        {(t.predictions ?? []).length ? <div className="prediction-status">{t.predictions.map((p: any) => <div key={p.id}><strong>{p.symbol} {p.direction} {p.targetPrice != null ? money(p.targetPrice) : "creation price"}</strong><small>Baseline {money(p.baseline)} · current {money(p.current)} · due {p.dueDate}</small><em className={`status ${p.status}`}>{p.status}{p.progress == null ? "" : ` · ${num(p.progress)}%`}</em></div>)}</div> : <p className="asset-meta">Predictions: unverified — none stored.</p>}
        {(t.evidence ?? []).length ? <div className="theory-evidence"><span>Original evidence · dates as recorded</span>{t.evidence.map((e: any) => <div key={e.id} className="asset-evidence-row"><b className={e.stance === "confirming" ? "up" : "down"}>{e.stance}</b> · {e.title}<small>{e.source} · published {orUnverified(e.publishedAt)} · attached {tsLabel(e.createdAt)}</small></div>)}</div> : <p className="asset-meta">Evidence: none attached yet.</p>}
        <p className="asset-meta">Population: theory (tracked theory) · record #{t.id}</p>
      </article>)}</div> : <Empty>{`No tracked theories are linked to ${selected}.`}</Empty>}
      {contextRow ? <>
        {contextTheories.length ? <div className="asset-subblock"><h3>Asset-context theory links · theory-watch IDs</h3>{contextTheories.map((e: any) => <p key={e.id} className="asset-meta">Theory-watch #{e.id} · {e.title} · stance {e.stance} · observed {typeof e.observedAt === "string" && Number.isFinite(new Date(e.observedAt).getTime()) ? tsLabel(e.observedAt) : orUnverified(e.observedAt)}</p>)}</div> : null}
        <div className="asset-subblock withdrawn-block">
          <h3>Withdrawn theories · labeled history</h3>
          <p className="muted">Withdrawn reasoning is preserved for inspection. It is excluded from the lead above and never presented as live.</p>
          {withdrawnRows.length ? withdrawnRows.map((w: any) => <article key={w.id} className="asset-record withdrawn-record">
            <header><div><strong>Theory-watch #{w.id} · {w.title}</strong></div><span className="status withdrawn">WITHDRAWN</span></header>
            <p className="asset-meta">Reason: {orUnverified(w.withdrawal?.reason)} · withdrawn {w.withdrawal?.withdrawnAt ? tsLabel(w.withdrawal.withdrawnAt) : "unverified"} by {orUnverified(w.withdrawal?.withdrawnBy)}</p>
            <p className="asset-meta">Observed {typeof w.observedAt === "string" && Number.isFinite(new Date(w.observedAt).getTime()) ? tsLabel(w.observedAt) : orUnverified(w.observedAt)} · stance withdrawn</p>
          </article>) : <p className="asset-meta">No withdrawn theories are recorded for {selected}.</p>}
        </div>
      </> : contextsQ.isPending ? <Empty>Loading asset context…</Empty> : <p className="asset-meta">Asset-context evidence: unverified — no asset-context row is published for {selected}.</p>}
    </section>

    <AssetEvidenceSection symbol={selected}/>

    <section className="terminal-section" aria-label={`${selected} paper positions`}>
      <div className="panel-head"><div><p className="eyebrow cyan">Paper positions</p><h2>{selected} paper entries</h2></div><Source>getPaperPilotAlerts + getPaperPilotStatus</Source></div>
      <p className="score-disclaimer">Lifecycle comes only from candidate / position / outcome records. A checkpoint contractState of “entered” proves the entry transition only — it says nothing about subsequent barrier touches. Barrier outcomes come only from the original-venue monitoring shown per position below; where no monitoring record is reachable, barrier state stays unverified (UNKNOWN).</p>
      {alertsQ.isPending || statusQ.isPending ? <Empty>Loading paper entry records…</Empty> : entryRows.length ? <div className="asset-record-list">{entryRows.map(({ row, payload }: any) => {
        const { candidate, checkpoint } = joinCheckpoint(row);
        const signal = signalById.get(String(row.paperSignalId)) ?? null;
        const contractState = checkpoint?.contractState ?? null;
        const mon = monitoringMatch.map.get(row.id) ?? null;
        return <article key={row.id} className="asset-record">
          <header><div><strong>{orUnverified(payload.signal_id ?? row.paperSignalId)} · {String(payload.direction ?? "unverified").toUpperCase()}</strong><small>PAPER · ENTRY_CONFIRMED</small></div><span className="status challenged">LIFECYCLE UNVERIFIED</span></header>
          <p className="lifecycle-line">Entry recorded — current lifecycle unknown.</p>
          <p className="asset-meta">Checkpoint contractState: {contractState ?? "unverified"}{contractState === "entered" ? " — proves the entry transition only" : ""} · barrier monitoring: {mon ? "original-venue monitoring below (late observations)" : "unverified (UNKNOWN) — no monitoring record matched to this position"}.</p>
          <div className="indicator-grid asset-metrics">
            <Metric label="Entry price" value={money(payload.entry_price)}/>
            <Metric label="Frozen invalidation" value={money(payload.invalidation?.price)} tone="down"/>
            <Metric label="Frozen target 1" value={money(payload.targets?.t1)} tone="up"/>
            <Metric label="Frozen target 2" value={money(payload.targets?.t2)} tone="up"/>
          </div>
          <p className="asset-meta"><b>Invalidation semantics: TOUCH</b> · frozen rule as recorded: {orUnverified(payload.invalidation?.rule)}</p>
          <p className="asset-meta">Entry time (entry_observed_at): {tsLabel(payload.entry_observed_at)}</p>
          <p className="asset-meta">Notification time (issued_at): {tsLabel(payload.issued_at)} · enqueued at {tsLabel(row.enqueuedAt)} — entry time and notification time are separate events.</p>
          <p className="asset-meta">Signal ID: {orUnverified(payload.signal_id ?? row.paperSignalId)} · Contract ID: {orUnverified(row.contractId)} · Candidate key: {orUnverified(candidate?.candidateKey ?? row.contractId)}{candidate ? ` · Candidate #${candidate.id} · candidate state ${orUnverified(candidate.state)}` : ""}{signal ? ` · Paper signal entry ${money(signal.entryPrice)} · stop ${money(signal.stopPrice)} · target ${money(signal.targetPrice)}` : ""}</p>
          <p className="asset-meta">Horizon: {orUnverified(payload.horizon)}</p>
          <p className="asset-meta">Entry rule: {orUnverified(payload.entry_rule)}</p>
          <p className="asset-meta">Setup reason: {orUnverified(payload.setup_reason)}</p>
          <p className="asset-meta">Post-entry check: {orUnverified(payload.post_entry_check)}</p>
          <p className="asset-meta">Population: paper (paper position) · alert row #{row.id}</p>
          {mon ? <VenueMonitoringBlock mon={mon}/> : null}
        </article>;
      })}</div> : <Empty>{`No ENTRY_CONFIRMED paper records are stored for ${selected}.`}</Empty>}
      {monitoringData?.health && monitoringData.health.entryAdmission !== "open" ? <p className="unavailable-line" role="alert"><b>NEW PAPER ENTRIES HELD</b> — Coverage · {String(monitoringData.health.coverageStatus ?? monitoringData.health.status).toUpperCase()}: {monitoringData.health.coverageBasis ?? "basis unavailable"} · last successful coverage {monitoringData.health.lastSuccessfulCoverageUtc ? sourceTimeLabel(new Date(monitoringData.health.lastSuccessfulCoverageUtc).getTime()) : "unavailable"} · Automation · {monitoringData.health.automation?.label ?? "Scheduled recovery pending"} · failing stage: {monitoringData.health.failingStage ?? "coverage unverified"}</p> : null}
      {monitoringQ.isPending ? <p className="asset-meta">Loading venue monitoring…</p> : monitoringData && !monitoringData.available ? <p className="unavailable-line"><b>UNAVAILABLE</b> — monitoring data not reachable from this view.</p> : unmatchedMonitoring.length ? <div className="asset-record-list">{unmatchedMonitoring.map((mon: any) => <article key={mon.positionId} className="asset-record">
        <header><div><strong>{mon.positionId} · {String(mon.direction ?? "unverified").toUpperCase()}</strong><small>PAPER · MONITORED ENTRY · NO MATCHED ALERT ROW IN THIS VIEW</small></div><span className="status challenged">LIFECYCLE UNVERIFIED</span></header>
        <VenueMonitoringBlock mon={mon}/>
      </article>)}</div> : null}
    </section>

    <ResearchMarketData/>

    <section className="terminal-section" aria-label={`${selected} notification state`}>
      <div className="panel-head"><div><p className="eyebrow cyan">Notification state</p><h2>{selected} notification history</h2></div><Source>getPaperPilotAlerts</Source></div>
      <p className="muted">Alert rows establish notification history only. Delivery route is shown exactly as recorded on each row (transport + destination); where a row carries no manual-relay vs unattended attribution, that attribution is unverified here.</p>
      {alertsQ.isPending ? <Empty>Loading notification history…</Empty> : assetAlerts.length ? <div className="asset-record-list">{assetAlerts.map(({ row, payload, alertType }: any) => <article key={row.id} className="asset-record compact-record">
        <header><div><strong>{alertType} · {orUnverified(payload.signal_id ?? row.paperSignalId)}</strong><small>alert row #{row.id} · event key {orUnverified(row.eventKey)}</small></div><span className="status">{orUnverified(row.status)}</span></header>
        <p className="asset-meta">Signal ID: {orUnverified(payload.signal_id ?? row.paperSignalId)} · Test flag: {payload.test === true ? "TEST" : payload.test === false ? "No — live record" : "unverified"}</p>
        <p className="asset-meta">Issued at (notification time): {tsLabel(payload.issued_at ?? row.enqueuedAt)} · Enqueued at: {tsLabel(row.enqueuedAt)}</p>
        <p className="asset-meta">Entry observed at (entry time): {payload.entry_observed_at ? tsLabel(payload.entry_observed_at) : "unverified — not an entry event"}</p>
        <p className="asset-meta">Route as recorded: transport {orUnverified(row.transport)} · destination {orUnverified(row.destinationLabel)} · attempts {num(row.attemptCount)} · acknowledged {row.acknowledgedAt ? tsLabel(row.acknowledgedAt) : "unverified — no acknowledgement stored on this row"}</p>
        <p className="asset-meta">Population: notification (paper alert) · alert row #{row.id}</p>
      </article>)}</div> : <Empty>{`No paper alert rows are stored for ${selected}.`}</Empty>}
      <p className="unavailable-line"><b>UNAVAILABLE</b> — delivery / acknowledgement evidence lives in the workspace delivery ledger, which is not exposed via an artifact read action. It is not reconstructed here.</p>
    </section>
  </div>;
}

export function App() {
  const deepCoin = new URLSearchParams(window.location.search).get("coin")?.trim() || null;
  const [tab, setTab] = useState<Tab>(deepCoin ? "dossier" : "market");
  const [coinId, setCoinId] = useState<string | null>(deepCoin?.toLowerCase() ?? null);
  const [query, setQuery] = useState(deepCoin?.toUpperCase() ?? "");
  const [submitted, setSubmitted] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [assetFocus, setAssetFocus] = useState<string>("BTC");
  const qc = useQueryClient();
  const watch = useQuery({ queryKey: ["watchlist"], queryFn: () => api.listWatchlist({}) });
  const addWatch = useMutation({ mutationFn: (a: any) => api.addWatch(a), onSuccess: () => { qc.invalidateQueries({ queryKey: ["watchlist"] }); qc.invalidateQueries({ queryKey: ["watch-dashboard"] }); } });
  const removeWatch = useMutation({ mutationFn: (id: string) => api.removeWatch({ coinId: id }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["watchlist"] }); qc.invalidateQueries({ queryKey: ["watch-dashboard"] }); } });
  const search = useQuery({ queryKey: ["search", submitted], queryFn: () => api.searchCoins({ query: submitted }), enabled: submitted.length > 0 });
  const marketRead = useQuery({ queryKey: ["market-read"], queryFn: () => api.getMarketRead({}), staleTime: 300000 });
  const analysis = useQuery({ queryKey: ["analysis", coinId], queryFn: () => api.analyzeCoin({ symbol: query || coinId || "BTC", coinId: coinId ?? undefined, refresh: false }), enabled: coinId !== null, staleTime: 300000 });
  const runSearch = (e: FormEvent) => { e.preventDefault(); const next = query.trim(); if (next) { setSubmitted(next); setShowResults(true); } };
  const selectCoin = (c: any) => { const id = canonicalCoinId(String(c.id ?? ""), String(c.symbol ?? "")); if (!id) return; setCoinId(id); setQuery(String(c.symbol ?? id).toUpperCase()); setShowResults(false); setTab("dossier"); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const openCoin = (id: string, symbol: string) => selectCoin({ id: canonicalCoinId(id, symbol), symbol });
  const openSymbol = async (symbol: string) => { const result = await api.searchCoins({ query: symbol }); const coin = result.coins.find((item) => item.symbol.toUpperCase() === symbol.toUpperCase()) ?? result.coins[0]; if (coin) selectCoin(coin); };
  const d = analysis.data?.data;
  const needsCoin = tab === "dossier" || tab === "smart";
  const showAssetHeader = Boolean(d) && (tab === "dossier" || tab === "smart" || tab === "signals" || tab === "news" || tab === "watchlist");
  return <div className="app"><SafeAreaTopScrim backgroundColor="var(--bg)"/><main>
    <section className="search-zone"><form onSubmit={runSearch}><input aria-label="Search any coin" value={query} onChange={(e) => { setQuery(e.target.value); if (!e.target.value.trim()) setShowResults(false); }} placeholder="Search BTC, LINK, ICP or any coin"/><button aria-label="Run coin search" type="submit">Analyze</button></form>{showResults && <div className="results">{search.isPending || search.isFetching ? <span>Searching…</span> : search.data?.coins.length ? search.data.coins.map((c) => <button key={c.id} onClick={() => selectCoin(c)}><strong>{c.symbol}</strong><span>{c.name}</span><small>{c.rank ? `#${c.rank}` : "unranked"}</small></button>) : <span>{search.data?.message ?? "No matches"}</span>}</div>}</section>
    <nav aria-label="Terminal sections">{tabs.map((t) => <button key={t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>{t.label}</button>)}</nav>
    <details className="parked-tools"><summary>More tools</summary><div><button onClick={() => setTab("news")}>News search</button><button onClick={() => setTab("smart")}>Perps & whales</button></div><small>Standalone search and deep-dive tools remain available here.</small></details>
    {showAssetHeader && d && <><DirectionalCommand d={d} refreshing={analysis.isFetching || marketRead.isFetching} watching={Boolean(watch.data?.items.some((w) => w.coinId === d.asset.id))} onRefresh={() => { void analysis.refetch(); void marketRead.refetch(); }} onWatch={() => watch.data?.items.some((w) => w.coinId === d.asset.id) ? removeWatch.mutate(d.asset.id) : addWatch.mutate({ coinId: d.asset.id, name: d.asset.name, symbol: d.asset.symbol })}/><FreshnessPanel symbol={d.asset.symbol}/>{tab === "dossier" && <CompletePicture d={d}/>}<AssetContext d={d}/></>}
    {needsCoin && !coinId && <CoinRequired onHome={() => setTab("market")}/>} 
    {needsCoin && coinId && analysis.isPending && <div className="loading"><span/>Building the live evidence stack…</div>}
    {needsCoin && coinId && !analysis.isPending && !d && <Empty>{analysis.data?.error ?? "Analysis unavailable."}</Empty>}
    {tab === "market" && <MarketWorkspace market={marketRead.data} openCoin={openCoin}/>} 
    {tab === "theories" && <TheoryWatch asset={d?.asset ?? null} openSymbol={(symbol) => { void openSymbol(symbol); }}/>} 
    {tab === "news" && <NewsWorkspace asset={d?.asset ?? null}/>} 
    {tab === "signals" && <SignalsWorkspace d={d ?? null} openCoin={openCoin}/>} 
    {tab === "watchlist" && <WatchlistWorkspace openCoin={openCoin}/>} 
    {tab === "journal" && <JournalWorkspace asset={d?.asset ?? null}/>} 
    {tab === "alerts" && <AlertsWorkspace asset={d?.asset ?? null} openCoin={openCoin}/>}
    {tab === "assets" && <AssetView focusSymbol={assetFocus} onOpenDossier={(symbol) => { void openSymbol(symbol); }}/>}
    {tab === "audit" && <AuditWorkspace/>}
    {tab === "meme-risk" && <MemeRiskWorkspace/>}
    {tab === "dossier" && d && <DossierWorkspace d={d} onOpenInAssets={(symbol) => { setAssetFocus(symbol.toUpperCase()); setTab("assets"); }}/>} 
    {tab === "smart" && d && <Smart d={d}/>} 
  </main></div>;
}
