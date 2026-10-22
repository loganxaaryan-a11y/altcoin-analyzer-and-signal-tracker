# Dossier engine vs Paper engine — comparison & same-or-different determination

**Date:** 2026-10-14. **Scope:** paper signals only. No brokerage. Holdouts locked. No model tuning, no weight changes. Observation/export only — nothing installed, enabled, or modified.

**Determination (up front): the DOSSIER engine and the PAPER engine use the SAME prediction model, but they are DIFFERENT issuance pipelines fed by DIFFERENT candidate sources.** The dossier issued the three 09:00 ET longs (BTC id43 @ 82,805, ETH id42 @ 2,479.76, SUI id41 @ 1.032, all confidence 52) because the dossier analysis path (`analyzeCoin` → `issueGeneratedSignalCandidate`) ran on those coins and the candidates passed the dossier preconditions. The paper pipeline issued nothing — not because any gate rejected those three longs, but because **the paper pipeline never received them**: its only candidate feed is the artifact's `runMarketDiscovery` radar runs, and discovery runs 56, 57, and 58 all emitted **0 candidates** (0 evaluated → 0 issued → 0 abstained → 0 deferred on all 6 deployed `runpapersignalcycle` runs). There is no gate at which the paper path "drops" these dossier candidates — they never entered the paper pipeline. The two paths write to segregated tables (`generated_signals` vs `paper_signals`) and never cross by id.

---

## 1. The prediction model (shared)

Both engines sit on `crypto-dossier-factor-agreement`, strategy version `2.0.0-measurement-contract`, parameter hash `sha256:4a098b4d389cb85293c78785c82e88a32fe6d96544a8dd84c341dce9fa0b7220`, evaluation method `crypto-evaluation-v4-cohort-contract`.

**Inputs (11 scored factors, total weight 17.0):**
| # | Factor | Wt | Source |
|---|---|---|---|
| 1 | Trend cluster | 2.5 | CoinGecko daily closes (SMA50/SMA200 position, 90d return) |
| 2 | Momentum (RSI-14) | 1.5 | CoinGecko daily closes |
| 3 | MACD | 1.5 | CoinGecko daily closes |
| 4 | Perp funding crowding | 1.75 | Hyperliquid / OKX funding rates |
| 5 | Open interest | 1.0 | OKX OI 24h change |
| 6 | Binance futures positioning | 1.0 | Binance taker buy/sell ratio |
| 7 | Cross-venue taker imbalance | 1.25 | Binance aggTrades + OKX spot trades |
| 8 | TVL trend | 2.0 | DeFiLlama TVL |
| 9 | Revenue linkage | 1.5 | DeFiLlama 30d fees/revenue |
| 10 | Developer velocity | 1.5 | GitHub commit activity |
| 11 | Supply-overhang penalty | 1.5 | CoinGecko FDV/mcap (negative-only) |

**Scoring (`scoreDossierFactors`, signal-methodology.ts:47–54):**
- `weightedNet = Σ score×weight`; `longScore = round(clamp(50 + (weightedNet/totalWeight)×42, 5, 95))`; `shortScore = 100 − longScore`; `direction = longScore ≥ shortScore ? long : short`.
- Confidence reported = the winning side's score ("factor agreement score; not a calibrated probability").
- The three 09:00 longs all printed **confidence 52** — a bare 50+2 lean. The dossier path has **no minimum-confidence threshold**: issuance fires at any score once preconditions pass.

**Levels (`buildAtrLevels`, signal-methodology.ts:56–68, riskMultiplier 1.25):** stop = entry ∓ 1.25×ATR14; target1 = entry ± 1.5×risk; target2 = entry ± 2.5×risk; payoff "linear-entry-notional". Verified against the actual 09:00 records (BTC 82,805 / 80,076 / 86,899; ETH 2,479.76 / 2,367 / 2,649; SUI 1.032 / 0.926 / 1.19 — all match the formula to rounding).

**Horizon:** 30 elapsed days, cost scenario modeled-roundtrip-18bps-funding-unverified-v1, legacy baseline `legacy-sma50-sma200-weekly-30d-v1` (context only).

---

## 2. Dossier engine — rules as they actually run

**Path:** `analyzeCoin` (manual / on-demand dossier view; **no cron reaches this path** — verified 2026-10-13 schedule→action audit) → `issueGeneratedSignalCandidate` (actions.ts:1977) → `persistSignalIssuanceBundle` → `signalContracts` + `generatedSignals` tables (the dossier tracker).

| Stage | Dossier rule (actual code) |
|---|---|
| Inputs | Full analyzeCoin workup: CoinGecko OHLC/market, Hyperliquid + OKX perp funding + OI, Binance futures positioning, cross-venue taker flow, DeFiLlama TVL/revenue, GitHub dev velocity, Fear & Greed, whale-leaderboard watchlist, chart pivots/divergence |
| Scoring | `scoreDossierFactors` above (11 factors, 17.0 weight); confidence = max(long,short) |
| Qualification | 1. Complete scored factor ledger (`hasFactorLedger`) · 2. Wilder ATR-14 available (canonical: complete decision-time window, arithmetic seed of first 14 true ranges, Wilder smoothing) · 3. invalidation/target1/target2 non-null · 4. no same-day same-direction signal already (`hasToday` → `already_exists`, immutable contract re-read) · 5. **born-dead veto** (`evaluateBornDead`: long requires signal-day candle low > invalidation; short requires signal-day high < invalidation; missing candle = fail, "issuance-validation unavailable") · 6. **short-regime gate** for shorts (price < 50D MA AND (lower highs OR 20D trend negative)) · 7. idempotent issuance key per coin\|day |
| Entry rule | `ENTRY_CONVENTION = "first-post-decision-provider-quote"`: a **timestamped post-decision CoinGecko markets quote** (`quoteReceivedAt ≥ createdAt`); entry is re-leveled onto that quote via `buildAtrLevels`. If none: suppressed ("No timestamped post-decision provider quote was available; the research reference was not promoted to a paper entry."). Price convention `usd-spot-reference`. |
| Levels | ATR formula above; riskMethod `atr14_1_25x` |
| Horizon | 30 elapsed days; evaluation via `evaluateTradeSetup` on daily candles |
| Delivery | Dossier tracker UI (`generated_signals` table, getsignals/getsignaltracker actions), morning-brief reads; **no paper alerts emitted** |
| Suppression | failures → `suppressedSignalCandidates` with `source: "dossier"` and reason (e.g. born-dead) |

The 09:00 ET signals passed all of this and were published with `entryRule: "first-post-decision-provider-quote"`.

---

## 3. Paper engine — rules as they actually run (paper-pilot v2.1.x, handler v2.1.9)

**Path:** `runpapersignalcycle` (deployed artifact action; **no hatch cron invokes it**) → reads the latest discovery run's radar candidates → handoff `processIntegratedCandidate` (handler v2.1.9) → `actionable-entry-v1` contract → venue entry observation → setup + entry alerts.

| Stage | Paper rule (actual code) |
|---|---|
| Inputs | Radar candidates from `runMarketDiscovery` runs ONLY (per `discovery-types.ts`: consumed verbatim — **never recomputed**). Required per candidate: score, entryPrice/invalidation (coherent: long invalidation < entry), complete factor ledger, signalDay candle OHLC, historyCloses/historyHighs, evidence asOf. Missing → `failed` with exact reason code (missing-score, missing-entry-levels, no-factor-ledger, missing-signal-day, missing-history, incoherent-levels). Note: the discovery shortlist path itself computes issuance *validation* (`loadIssuanceSignalDayCandle` + `evaluateBornDead` + `evaluateShortRegimeGate`) but **persists radar rows + suppression logs only — there is no `issueGeneratedSignalCandidate` call in the discovery path**. |
| Scoring | **None on the paper path.** The handoff carries no weights; score passes through for the strength floor only. |
| Qualification | 1. expiry · 2. **min-score floor v2.1.6**: `\|score\| < minScore` rejects; minScore=0 ⇒ **vacuous no-op** (documented) · 3. **freshness** (`freshnessMs` 30 min): stale inputs → `deferred` (stale-inputs), never issued on stale evidence · 4. **retained regime gate** (shorts only; longs pass) · 5. **issuance veto** (`runQualificationChecks`): setup-history filter + pipeline-order + entry-zone ONLY · 6. **duplicate suppression** (`duplicateWindowMs` 24h) · then qualification commit → pending contract + SETUP alert (enqueued → delivered, separate timestamps) |
| Entry rule | `first-post-decision-binance-spot-trade` on **Binance spot** (`cryptoPrimaryVenue: "binance-spot"`); **15-minute window** from decision (`cryptoEntryWindowMinutes: 15`); drift cap 1.5%; **v2.1.7 first-print fidelity** (earliest eligible print wins; stale-first-print → void `first-print-missed`, never substituted); **v2.1.8 history-coverage attestation** (`historyCoverage` bound to the served response; unproven batch → void `first-print-unverifiable`); **v2.1.9 venue-trade-id identity** (real Binance aggTrades `a` id + `venueSeq` tiebreak by (ts, venueSeq) ascending — price/arrival never tiebreak); max observation age 5 min; poll cadence enforced strictly finer than the window; zero venue-clock-skew tolerance (future-timestamped prints → defer). |
| Levels | `riskPerUnit = |entry − invalidation|` carried from the candidate (same 1.25×ATR construction upstream); no re-leveling. |
| Horizon | 30 elapsed days (crypto). Post-entry: **waiting-interval veto** (checkWaitingInterval over the REAL [decisionAt, entryObservedAt] interval — crypto fails closed on empty evidence), **post-entry invalidation** check; valid entries persist a signal row + ENTRY alert gated on `checkEntryEvidenceComplete` (venue trade id + observedAt + receivedAt + price). |
| Delivery | SETUP_PENDING + ENTRY_CONFIRMED alert rows exposed via `getpaperpilotstatus`; workspace cron hands due alerts to the runtime delivery subsystem → **research side chat + terminal**, labeled PAPER, pending-vs-confirmed distinct, deduped, delivered-on-ack; abstentions terminal-only + compact daily chat summary. |
| Suppression | Rejection reasons recorded verbatim (`sup_<candidateId>_<gate>` rows): min-score, stale-inputs, short-regime, issuance-veto, duplicate, expiry, entry-expired, waiting-interval-invalidation, entry-drift, entry-no-quote, first-print-missed, first-print-unverifiable, post-entry-invalidation. |

Version notes: v2.1.6 = |score| strength floor (vacuous at minScore=0); v2.1.7 = first-print fidelity + observation checkpoint; v2.1.8 = history-coverage proof; v2.1.9 = venue-trade-id identity + (ts, venueSeq) tiebreak. **All four are entry-observation / issuance-plumbing repairs — none change the prediction model, factor weights, gates, levels, or horizon** ("Prediction weights UNCHANGED: crypto production 17.0, crypto C-2 15.5, equity 90").

---

## 4. Comparison table

| Axis | DOSSIER engine | PAPER engine | Material difference |
|---|---|---|---|
| **Candidate source** | `analyzeCoin` dossier analyses (manual/on-demand; no cron reaches it) | `runMarketDiscovery` radar runs (scheduled 6h; radar-only) | **YES — disjoint.** Dossier signals never enter the paper pipeline. |
| **Inputs** | Full 11-factor workup (CG closes, funding, OI, positioning, taker flow, TVL, revenue, dev, supply) | Whatever the discovery run emits — consumed VERBATIM; required: score, coherent levels, complete factor ledger, signal-day candle, history series, evidence asOf | Paper adds strict input-completeness enforcement (failed ≠ abstained) |
| **Scoring** | `scoreDossierFactors`: 50+(weightedNet/17)×42, clamp 5–95; direction = long if longScore ≥ shortScore | **No scoring on the paper path** — consumes emitted score verbatim | Paper is score-agnostic; same model only via shared upstream |
| **Qualification** | factor ledger complete, ATR-14 available, levels non-null, no same-day same-direction signal, **born-dead veto** (signal-day candle), short-regime gate (shorts), idempotency | expiry, min-score floor (**vacuous at 0**), **freshness deferral (30 min)**, retained short-regime gate, **issuance-veto** (setup-history + pipeline-order + entry-zone), **duplicate suppression (24h)**, ownership-guarded commit | Paper has freshness/duplicate/veto gates the dossier lacks; dossier has born-dead + same-day gates; both share a short-regime gate |
| **Entry rule** | `first-post-decision-provider-quote` — timestamped post-decision **CoinGecko** markets quote; entry re-leveled onto it | `first-post-decision-binance-spot-trade` — **venue-stamped Binance spot trade print** (real `a` trade id) inside a **15-min window**, with coverage attestation | **Different evidence standard:** CG quote vs Binance venue print; paper's window/coverage/identity machinery is far stricter |
| **Levels** | `buildAtrLevels`: stop = entry ∓ 1.25×ATR; t1 = ±1.5R; t2 = ±2.5R | `riskPerUnit = |entry − invalidation|` carried from candidate; drift cap 1.5% | Same construction; paper reuses, never re-levels |
| **Horizon** | 30 elapsed days; 18 bps modeled roundtrip; funding unverified | 30 elapsed days (crypto) | Same |
| **Delivery** | Tracker UI (`generated_signals`, getsignals/getsignaltracker); morning-brief reads | SETUP_PENDING + ENTRY_CONFIRMED alerts → research side chat + terminal (labeled PAPER, ack-gated); abstentions terminal-only + daily chat summary | **Different populations and surfaces** — nothing crosses |
| **Write target** | `generated_signals` / `signalContracts` (legacy/tracker) | `paper_signals` (+ paper contracts/candidates/alerts) | **Segregated tables** — cross-use must be explicit, labeled, recorded |
| **Automation** | Manual/on-demand only | `runpapersignalcycle` exists but has **no schedule**; invoked manually | Neither is fully automatic; paper's "scheduled issuance" exists only as an unapproved draft spec |

---

## 5. Why dossier issues while paper issues none — candidate-routing evidence

**The routing fact:** ids 41/42/43 were issued through the dossier path at 2026-10-14T13:00:09–21Z (09:00 ET). Negative checks (verified ~18:30Z):
- **Radar candidate? NO** — discovery run 58 (completed 2026-10-14T14:26Z, i.e. 10:26 EDT) emitted 0 candidates; runs 56 (02:26Z) and 57 (08:26Z) likewise emitted 0. Inbox payloads: `candidates: []` on all three runs.
- **Setup alert? NO** — alert ledger empty; deployed `getpaperpilotstatus` `data.alerts=[]`.
- **Pending paper contract? NO** — zero rows for these ids in paper contracts/signals/candidates tables, local and deployed.
- **Verified paper entry? NO** — no venue-stamped first post-decision Binance spot trade print inside a 15-min window exists for any of them.

**Deployed paper-cycle record (6 runs, all complete):**

| Run | Discovery run | Candidates | Issued | Abstained | Deferred | Summary |
|---|---|---|---|---|---|---|
| 1–3 | 56 | 0 | 0 | 0 | 0 | "No directional discovery candidate was available for the explicit paper path; no signal was manufactured." |
| 4–5 | 57 | 0 | 0 | 0 | 0 | same |
| 6 | 58 | 0 | 0 | 0 | 0 | same |

**Exact gate analysis:** the paper gates (min-score, stale-inputs, short-regime, issuance-veto, duplicate, entry observation, waiting-interval, post-entry, alert gating) evaluated **nothing** — there were no candidates to evaluate. The three 09:00 longs did not reach any paper gate; they were issued to `generated_signals` by a path the paper pipeline does not consume. **The drop point is routing, not qualification:** the dossier issuance path and the discovery radar path are disjoint by design (the deployed paper action explicitly "does not delegate to legacy `analyzeCoin` or `issueGeneratedSignalCandidate`").

**Would the paper path have issued them anyway?** Unknown from deployed evidence — and unknowable without routing them through. Structurally, the paper path is strictly stricter than the dossier path in at least these gates it would have applied: 30-min input freshness (deferral), 24h duplicate suppression, the issuance veto (setup-history filter + pipeline-order + entry-zone), the 15-min Binance venue-print entry window with first-print identity + coverage attestation, the waiting-interval veto (crypto fails closed on empty evidence), and alert acknowledgement. The dossier path issues on a timestamped CoinGecko quote with no confidence floor (52 fired). So even with the same score, the paper path can and will issue less often — **but on 2026-10-14 that comparison never got tested, because the feed was empty.**

---

## 6. Caveats & gaps (honest)

1. The factor rows for ids 41/42/43 are not readable from this seat (workspace tracker snapshot caps at id 40; the deployed tracker table isn't readable here). The confidence-52 claim and levels are from the reconciliation record; factor-level recomputation of the 09:00 decisions is not available.
2. Whether discovery radar candidates carry the same 11-factor dossier-agreement score vs the discovery vote score (`resolveDiscoveryDirection` netVotes ≥ 3 → long; `fiveDimensionGate` with the −10 trend-momentum redundancy adjustment) is not verifiable from the workspace on the deployed path — the three inbox runs are all empty, and the deployed discovery tables aren't readable here. The paper handoff consumes whatever score is emitted verbatim; the "same model" claim rests on the frozen strategy identity (id/version/param hash) and the manifest's "prediction weights unchanged" record, not on an observed live candidate.
3. The deployed `runpapersignalcycle` candidate-selection logic (artifact-side, post-2026-10-13 source export) was not inspectable from this seat; its behavior is characterized from its outputs (0 candidates on runs 1–6) and the status schema.
4. Local sandbox machinery (pilot/, handoff/ with `:memory:` stores and scripted feeds) is NOT evidence about the deployed path; nothing in this report rests on it.

**Sources:** `ts-spaces/altcoin-analyzer-and-signal-tracker/server/src/signal-methodology.ts` (scoring/levels/entry convention), `server/src/actions.ts:1977` (dossier issuance), `:3640` (dossier preconditions), `:1207/:1220` (short-regime/born-dead), `paper-signals/orchestrator/src/issuance/handler.ts` (paper v2.1.9), `handoff/src/qualify.ts` / `map-candidate.ts` / `discovery-types.ts` (handoff), `entry-v1/src/entry-rules.ts` (15-min window, Binance venue, drift cap), `comparison/live-paper-status-2026-10-14T1744Z.json` + `deployed-run-counts-2026-10-14.json` (deployed runs), `handoff/inbox/discovery-*.json` (0 candidates), `dispositions/reconciliation-0900-dossier-longs-2026-10-14.md` (per-id negative checks), `comparison/DISCOVERY-CONFIRMATION-2026-10-14.md` (radar-only discovery), `hidden_files/source-export-2026-10-13/CONFIG.md:113` (11-factor weights) + `PIPELINE-TRACE.md` (no-cron-reaches-issuance audit).
