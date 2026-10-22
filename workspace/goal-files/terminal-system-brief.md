# Research Terminal — Complete System Brief
*Built by Logan + Muse, October 2026. Written for external AI review: tell us what's naive, what's missing, and what you'd kill to make this actually work. Updated 2026-10-04 with verified build results and the in-flight audit.*

## 1. What this is

Two private fullstack web apps (one crypto, one equity) plus a personal research page, forming a single research loop:

**Ticker in → full interpreted dossier out.** Not data dumps — synthesis: asset decoded, bull/bear with trading signals, technicals, valuation, smart-money reads, multi-hop ripple effects. Chat-first workflow; dashboard exists but chat is primary.

**Theory-testing engine.** Any thesis (Logan's or machine-found) gets scored 0–100 against chart, volume, and TA with a transparent factor breakdown. Washed-out tapes are reported as-is.

**Forward-calibrated signal tracker.** Every signal is tracked against 5-day, 14-day, and 30-day horizons, graded hit/miss on target-vs-invalidation. Currently in its live forward-test week; nothing is labeled calibrated until real outcomes accumulate.

**Fathom** (curatednewslawl.grok.me) — Logan's personal daily research page: curated notes from smart sources checked against the tape, with kill conditions, a theory tracker, and a signals book. Used as a research input.

**Objective function (settled 2026-10-04):** the system exists to identify *great chart conditions in either direction* — selectivity plus timing, not longs-only. The product is **confluence**: context (narrative, flows, regime, power, valuation) and chart (trend, momentum, structure, volume) pointing the same way. Buy-and-hold is the diagnostic baseline, not the competitor: if long signals don't beat buy-and-hold, the honest conclusion is the long book should *be* buy-and-hold and all value is in timing, avoidance, and shorts. No-signal is a valid and frequent output.

---

## 2. What's live and VERIFIED (directly invoked, not taken on trust)

### Equity valuation — `valuestock` (live, verified on PLTR 2026-10-04)
Eight sections, all returned with live numbers (SEC Companyfacts + Yahoo free layer; Finnhub/Alpha Vantage keyed enrichment queued on-demand):
- Revenue: TTM $4.475B, reported growth 56.18%. Operating margin 31.59%.
- Accrual: SBC $684.0M vs gross buybacks $75.0M — flagged as NOT net accrual. Diluted shares +4.67%.
- Multiples: P/E 299.6×, P/S 108.19×, FCF yield 0.43%. Dividends, EV/EBITDA, PEG labeled missing, not invented.
- Reverse DCF: price implies **85.14% annual FCF growth for 5 years** (10% discount rate, 3% terminal growth — stated in output).
- Verdict: "fair" — **WEAK, and we know it**: no peer pipeline exists yet, so peer-median comparisons couldn't fire. The verdict is only as strong as its inputs.
- Honest gaps: Standing and Edge sections returned "unavailable" — no moat or named-competitor evidence in the free layer.

### Crypto valuation — `valuecoin` (live, verified on HYPE 2026-10-04)
Eight sections (CoinGecko + DeFiLlama; chain-level AND protocol-level scopes):
- Market: price $90.34, mcap $20.1B, FDV $86.3B, circulating 23.3% of total (4.29× FDV/mcap).
- Revenue: 30d avg fees $2.34M/day ($0.85B annualized), revenue $1.81M/day ($0.66B annualized), take rate 77.5%. Chain-level scope also shown (Hyperliquid chain fees $1.81B annualized).
- Multiples: P/S 30.4× on mcap, 130.6× on FDV. Named-peer median 14.5× (GMX 5.4×, dYdX 37.7×, Jupiter 14.5×).
- Verdict: **RICH** — 30.4 ÷ 14.5 = 2.10× vs thresholds ≤0.75 cheap / 0.75–1.25 fair / ≥1.25 rich. Bull case stated as revenue reaching $1.39B in 2 years (+45% CAGR); bear case as a kill condition on revenue falling while the multiple stays above peer median. No price target.
- Honest NO_DATA (not invented): unlock timing — **no verified free unlock calendar exists** (DeFiLlama's emissions route is paywalled; Tokenomist is a website, not a feed). Buyback/burn mechanism — no verified mechanism feed (withheld even though our own research shows ~100% of HYPE revenue goes to buybacks; the terminal won't assert what it can't query). Holder cost basis, moat sources — NO_DATA.
- **Correction in progress:** the user correctly challenged NO_DATA-on-unlocks — the data exists via research (we found HYPE's vesting schedule the same day); the gap is feeds, not existence. Planned fix: curated, timestamped unlock table for covered coins (source + as-of date per row), NO_DATA only where genuinely unresearched.

### Earlier fix wave (deployed + verified 2026-10-04)
7-dimension discovery scoring: Trend 20, Momentum 15, Volatility 10, Volume 15 (size-tiered spot), Positioning 10, Network fundamentals 15, Supply overhang 15. Glance block on every signal and dossier verdict (direction, constructive/mixed, strength, risk — labeled "factor agreement only, not a probability"). Volume filter documented as $5M CoinGecko consolidated spot. Taker-imbalance gate ($250k/venue notional): fires for majors, quiet for most alts — quiet by design, accepted tradeoff.

---

## 3. Methodology — formulas and current state

**Indicators.** Wilder RSI-14, Wilder ATR-14, exact trading-session return windows. SMAs 20/50/200.

**Factor scoring.** Each factor scores −1/0/+1 × weight; raw score = 100 × Σ(weight × score) ÷ Σ(weights). A toward-zero redundancy adjustment applies when SMA-20/50/200 + MACD + ATR-trend fully align (not independent votes). Every factor carries a quality label (live/stale/no_data with reason). **No-data doctrine: a missing factor scores 0 and is shown as missing, never interpolated.**

**Walk-forward base rates.** BTC: 223 observations, ~53.8% directional hits, +1.09R. SPY: 935 observations, 58.61% hits. **R definition is UNDER AUDIT (see §5 item 1):** currently R = direction-adjusted horizon-close move ÷ initial risk (1.25× ATR-14), uncapped, with **no stop simulated** — while the live tracker grades target-vs-invalidation. These are different things.

**Stops.** Invalidation at 1.25× ATR-14. Honest note: the basis for 1.25× is unknown — possibly picked by feel. Under test: 1.25/1.5/2/3× plus BTC-beta-adjusted stops.

**Scores are factor agreement, never win probabilities.** 60/100 = 60% factor agreement, not 60% win chance. Calibrated probability (empirical hit rate of historically similar signals: same score band × direction × regime, always with N) deferred until live 5d/14d/30d outcomes accumulate (first ~Oct 6–8, 2026). Live calibration N=0 as of 2026-10-03. No probability shown where comparable N < 20.

**Theory weighting.** Measured evidence > observed > inference. Vetoes on conflicting evidence. Source dedup (one story via three outlets = one source). Crowd pricing = context only. Contested theories surface with conflicts shown, never silenced. Machine theories need 2+ independent sources per key claim; single-sourced = flagged SINGLE SOURCE, capped low confidence.

**Valuation verdicts.** Crypto: relative P/S vs named-peer median (bands above). Equity: 2+ same-direction flags required; peer-multiple flag fires at 25% gap from median (currently cannot fire — no peer pipeline). Reverse DCF: 10% discount, 3% terminal growth, 5-year implied FCF CAGR.

**Calibration timeline (stated upfront):** ~3 weeks for N≥20 per band on 5d outcomes; ~2 months on 30d. 46 same-day finance signals ≈ ~10 independent bets after clustering — clustering is mandatory, not optional.

---

## 4. Known bugs and honest gaps

1. **R definition mismatch** (walk-forward vs live tracker) — in audit.
2. **No peer pipeline (equities)** — Standing/Edge unavailable; verdicts weak without peer medians. Fix designed (Finnhub `/stock/peers` → peer multiples → flags fire; verdicts labeled *provisional* when inputs thin). Queued behind audit.
3. **No unlock feed (crypto)** — NO_DATA is feed-honest but research exists; curated table planned.
4. **Buyback mechanism (HYPE)** — research shows ~100% revenue buybacks; no verifiable feed, so withheld. Feed or curated-source needed.
5. **DEX flow on majors** — unavailable half the time, actively misled on LINK. Candidate for demotion.
6. **13F whale-watching at 45-day lag** — honestly labeled, but predictive or decorum? In audit kill-list.
7. **Polymarket prose-query** — already being rebuilt as structured inputs.
8. **Costs** — fees, slippage, funding not yet subtracted from expectancy. In audit.
9. **Overlapping windows** — effective N after autocorrelation not yet computed. In audit.

---

## 5. The 12-point audit — RUNNING NOW (no new features until it reports)

Pasted verbatim to the terminal builder on 2026-10-04. Builder reports results, not plans; output = a results table per item plus a ranked keep/fix/kill list; anything unverifiable labeled UNVERIFIED; if the honest conclusion is "no edge beyond beta and momentum," that goes first.

1. **R definition bug** — re-run walk-forward with stops and targets actually simulated; one R definition for backtest and live grading; show old and new numbers.
2. **Statistical honesty** — raw N, effective N after overlapping 5/14/30d windows, 95% Wilson interval, p-value vs 50% for every base rate. State plainly if the edge is indistinguishable from zero.
3. **Baselines** — vs (a) buy-and-hold, (b) random entries at the same times with identical ATR stops, (c) "always long BTC beta" for alts. Say so if signals don't beat them.
4. **Stop test** — 1.25/1.5/2/3× ATR + BTC-beta-adjusted stop; hit rate, expectancy, beta-stop trigger frequency.
5. **Costs** — subtract fees, slippage, funding over the holding period; expectancy before and after.
6. **Overfitting control** — freeze a holdout the design never saw; write ALL factor definitions (including the new pump-alignment family) BEFORE testing; count every variant tried and report it; tune on first part only, report holdout separately.
7. **Mechanical lenses** — implement as logged factors: ATH-drawdown (50D reclaim inside 80%+ drawdown = bounce), thin-data cap tied to a coverage metric (missing data lowers confidence, not neutral 0), BTC-beta regime for alts. Re-score MEGA, WIN, LINK; show whether the original signals would have been blocked.
8. **Signal selection** — how often v1 and v2 stay silent; whether issued signals outperform suppressed ones.
9. **Risk layer** — position sizing: leverage capped so liquidation sits well beyond invalidation; correlated same-day signals counted as one bet; max suggested leverage per tracked signal.
10. **Self-test (user's top priority)** — log every entry the user actually takes with its `checkentry` verdict; compare outcomes across good/caution/bad; report how many trades are needed before the comparison means anything (~30 for a first read, 50+ for confidence).
11. **Data** — show which existing factors have measurable edge BEFORE adding sources; for each proposed source (Deribit IV/skew, liquidation data, stablecoin flows, Farside ETF flows) state what it adds, confirm it's an accessible API under current terms, mark anything fragile or scraped.
12. **Kill list** — name failing features with reasons. Candidates: silent-hints feed, KOL seeding, breaking-news hook, 0-100 precision, ungradable ripple hops, 13F at 45-day lag.

---

## 6. Proposed next — sequenced AFTER the audit

1. **Audit results land** → ranked keep/fix/kill executed.
2. **Equity peer pipeline** — Finnhub `/stock/peers` (keyed, on-demand) → named competitors → peer medians (P/E, EV/EBITDA, P/S, FCF yield) → multiple flags fire; Standing gets a mechanical read (sector + margins/growth vs peers); verdicts labeled provisional when inputs thin. Moat narrative stays qualitative, sourced from 10-K business descriptions (SEC EDGAR, free) — extracted, never invented.
3. **Scoring redesign v2** (authorized 2026-10-04 — reverses the earlier "don't touch scoring" directive; priority is *technically/logically sound*): flag families. Current factors become the trend/structure family; new families for volume/participation and TA pump-alignment (base building, volume expansion, RSI reset, clean breakout structure, funding not crowded). Per-family caps, evidence-coverage metric, hard no-signal threshold. **v2 runs alongside v1 — the forward test judges between them; v1 is never replaced by argument.**
4. **Mechanical lenses** per audit item 7 (if audit validates them).
5. **Stop/target test live on 5d outcomes** + calibration scaffolding (fewer bins, Brier score, shrinkage, scorer versioning).
6. **Chain-health screen** — dying vs thriving chains from DeFiLlama (fees −70% from 90d high, TVL −50%, DEX volume dried up, no catalyst). **Filter first** (no longs on dying chains); short signal second — shorting dead alts into a BTC rally is how you get squeezed.
7. **Farside spot-BTC ETF flows** (free, daily) — the one concrete source gap identified.
8. **Curated unlock table** (crypto) per §2 correction.
9. **Equity bottleneck screen** (new proposal): who owns the constraint (power sites, HBM, enrichment, fab capacity) — scarcity × pricing power × constraint duration. Template: find the constraint → who owns it → who can't route around it → how long it lasts → what's priced in.
10. **Miss-analysis loop** — paste.trade top calls vs our signals, periodic review feeding the post-mortem lenses.

**Kill-list candidates** (pending audit evidence): silent-hints feed, KOL seeding, breaking-news hook, 0-100 precision display, ungradable ripple hops, 13F at 45-day lag, DEX flow on majors (demote, don't kill).

---

## 7. Deep-logic requirements (the researcher's reasoning discipline)

Not a feature spec — the standard every thesis is held to. For every qualitative claim: (1) state the mechanism, (2) grade its logical strength on the evidence, (3) say to what extent it should move the thesis, (4) end with something observable or measurable.

- **Name the game before scoring players.** Every domain has 2–3 variables that decide winners (L1s: usability, liquidity depth, developer gravity, distribution; DeFi: yield sustainability, liquidity stickiness; bottlenecks: constraint ownership × pricing power × duration). Analysis that scores without naming the game first is noise.
- **Power is a variable, not a veto.** Backers, sovereign criticality, regulatory capture, gray-zone advantages (rebates, bailouts, procurement entrenchment) are real — weight them by mechanism and evidence, don't let them auto-kill or auto-validate a thesis. Example: Binance has an obvious incentive to resist Hyperliquid taking perp volume (strong mechanism); "Binance/CZ/China are coordinating to kill Hyperliquid" is not established without specific actions (weak claim, zero weight until evidenced).
- **Mortality analysis.** Giants die by value migration, not overvaluation: the moat was real, the game moved (Nokia/BlackBerry: hardware logistics → software ecosystems; Canon: smartphones shrank the TAM). Every position gets the Nokia question: where on the S-curve, and is the moat in what's becoming irrelevant?
- **Competitive pressure discounts, doesn't veto.** Backpack/Lighter/Aster vs Hyperliquid is measured through funding, product moves, and perp-DEX volume share — a discount rate on the thesis, not a kill switch.
- These lenses live with the human researcher, not in the scoring code, by explicit choice: the terminal stays mechanical and consistent; interpretation layers on top.

---

## 8. Standing constraints (non-negotiable)

- No fictional data — better to not do it than fake it. Missing shown as missing.
- No win probabilities without measured comparable N (preferably N≥20).
- Keyed APIs (Etherscan, Finnhub, Alpha Vantage) on-demand only, never scheduled.
- Scores stay factor-agreement until calibrated.
- Build nothing unapproved; keep builds lean.
- Every number traceable/recomputable; every methodology claim auditable against raw cached data.
- The user's eyes are the final UI check.

---

## 9. What we want from you

Be blunt:

1. **Attack the methodology.** Factor design, gates, the no-data doctrine, walk-forward usage, the 4-layer theory verification, the R redefinition — where's the weakest point?
2. **The audit's blind spots.** What's the 12-point audit not checking that it should?
3. **Missing sources.** Run the open-world sweep: free/keyless data with real edge we haven't surveyed. Verify accessibility — don't assert what you can't confirm.
4. **Adjudicate the kill list.** Which candidates would you actually kill, and what did we miss?
5. **v2 scorer design.** How would you structure flag families, caps, and the coverage metric? How do you keep v1/v2 comparison honest?
6. **On valuation:** does the 8-part crypto framework hold? What breaks in the equity port? Is the provisional-verdict idea (verdict strength scales with input completeness) the right fix for thin inputs?
7. **Calibration.** Our plan: empirical hit rates per band/direction/regime at N≥20, fewer bins, Brier score, shrinkage, versioning. Better approaches?
8. **If the honest conclusion is "no edge beyond beta and momentum"** — say so, and say what you'd do with the system then.
