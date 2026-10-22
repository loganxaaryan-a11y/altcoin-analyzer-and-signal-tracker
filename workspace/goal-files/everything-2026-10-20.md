# TERMINAL STATUS — everything in one file (2026-10-20, evening)

## What I told you above, in one place

**Done and live:**
- Both terminals have the five working views (Opportunities, Asset, Paper positions, Research, Diagnostics)
- Mapping repair done: 12 coins fixed (7 on Binance Spot, 5 on MEXC). Two new freezes saved (v2.1.2, v2.1.3) — strategy, weights and gates untouched; the old freeze stays as the comparison arm
- First real paper signals in weeks issued tonight: PEPE, BAT, COMP — all longs, all confirmed in time (whole chain took about 2.5 minutes, ~12 minutes to spare). This ends a 36-run zero streak
- Delivery worker bug fixed and verified in a live run. One damaged record's two lost fields are marked unknown — no delivery was affected
- Equity scan resume fixed and proven (incomplete scans now pick up where they left off)
- AERO labels fixed (merged platform scope, conversion opens Oct 21 8pm ET). One AERO change (dev repo) failed its check and was rolled back cleanly

**Still open when you asked:**
- Recovery system: 3pm slot closed for good (its one recovery ran, produced nothing, recorded honestly). 5pm slot still being checked. 7pm slot ran fine on its own
- Last cleanup step not done yet: retiring the old chat-polling jobs and the final count of how much daily load we actually cut (was 828 agent runs/day before)
- The "wall of BLOCKED" cards you screenshotted: those coins fail one shared check — the system can't prove from timestamped venue prices that the setup didn't already die after the decision, so it blocks instead of guessing. Real fix not scoped yet — your call

**Decisions still yours (no rush):**
- Forward the three expert documents below — they unblock the frozen-levels fix and the runtime question
- BEAM trades on MEXC under a different name (BEAMX) — mapping it is your call
- META signal #49: the proven miss isn't in the terminal's own record yet

---

# PART 2 — THE THREE EXPERT DOCUMENTS (forward these as-is)

# Expert brief — 2026-10-20 (overnight build + open questions)

**From:** Logan's research-terminal project (paper-only system; no brokerage, no orders, no real money — unchanged).
**Purpose:** (1) report everything built and verified overnight 2026-10-19→20 under the merged revamp plan, (2) put every open question in one place for your review.
**Governing rules respected throughout:** strategy weights/thresholds/gates/methodology untouched (prospective-only); frozen strategy and any shadow variants held for you; no historical decision regenerated, replayed, or backfilled; missing evidence stays "unknown"; append-only evidence.

---

## Part 1 — What was done last night (all applied + verified, zero rollbacks)

Execution ran under a verify-or-rollback rule: each batch applied only after the previous verified; any acceptance failure would have rolled back and paused the program. No batch failed acceptance. The only failures were environmental (a concurrent-build publish race, a platform restart-drain, a 503 window), each recovered by republish/re-dispatch. Full item log: `13-batches-2-5-application-log.md` (available on request).

### Batch 1 — screen simplification + display honesty (both terminals)
Plain-language error text; no "/100" scores shown below 60% measured coverage; Hyperliquid sign fix; five-view labels (Opportunities / Asset / Paper positions / Research / Diagnostics) placed across both artifacts — the ZRO acceptance test (understandable without three screens of caveats) passes. Equity: ~30 error sites fixed, sector-relative toggle added. Two items held by design: B1-I8 ("last verified" line — stamp only from a same-day polling-health check, never backdated) deferred; B1-I10 (asset-dossier read action) held.

### Cadence change
`paper-issuance-trigger` and `paper-entry-prompt-trigger` moved to 5-minute cadence, bodies byte-identical except schedule, verified by read-back.

### Batch 2 — discovery funnel instrumentation (measurement only)
New `discovery_funnel_counts` (crypto migration 0058, equity 0045) recording the existing verdict reason codes verbatim at each funnel stage, read-only `getDiscoveryFunnel` action, Diagnostics strips on both artifacts. Crypto audit pass, 128 tests; a sandbox issuance run conserved exactly (5 inputs = 0 survivors + 5 removals). Pre-existing runs read `instrumented: false` — history was not backfilled.

### Batch 3 — filtered observations + evidence exposure (display of existing state only)
Crypto: `getDiscoveryObservations` (suppressed candidates visible with Priority labels), `getAssetExternalEvidence` (per-asset dossier; BTC shows a stored DIVERGENCE verdict + 20 dated smart-money entries; assets with no evidence render exact honest empty lines), Hyperliquid funding-extremes strip. Equity: `getFilteredObservations`, Priority ordering with scores unchanged, AVGO cross-stream dossier via a new privileged workspace-read, per-source health rows on both Diagnostics views (unstored fields display "not tracked" rather than invented values).

### Batch 4 — NO_DATA crosswalks + business evidence
Crypto: DeFiLlama crosswalk migration 0059 — 2,432 rows live, exactly matching the live DeFiLlama payload; curated-first resolution; fee scoring only from verified slugs; dev-velocity fallback via repos_url under a 50-call budget; DEX enrichment explicitly labeled "DEX data, not spot turnover." Fundamentals formula and weights provably unchanged (full-source reads). Coverage lift deliberately **not** claimed — it measures from the next weekly `refreshFundamentalsScores`.
Equity: business evidence extended to all 11 remaining directional names from SEC EDGAR companyfacts, each item carrying form + filed date; AVGO/WMT byte-identical to before; omissions recorded honestly per name.

### Batch 4b — verified-source wiring, Hyperliquid phase 2, OpenBB supplement
Crypto: Deribit options context (BTC ATM IV 29.33, 25Δ RR −2.53, OI $32.2B), OKX perp context, Polymarket event odds, DeFiLlama backdrop — all labeled supplements, direct keyless fetchers remain primary.
Equity: Cboe volatility regime (VIX 18.44 / SKEW 161.86, as_of = file dates) and CFTC COT from the official file (report date 2026-10-13; spot-checks exact; the xoomar mirror used only as a labeled cross-check).
Hyperliquid phase 2: workspace cache extended with a wallet-positioning step (verified live: 30 leaderboard traders, 21 holding board positions); board renders crowding panels, top-trader tables, hand-rolled 1h charts, byte-matched to the cache files.
OpenBB (approved by Logan as a pinned library, not a platform): fetcher-direct collector (core 2.0.1, providers 2.0.0) writing provenance-stamped bundles, rendered as labeled supplements on both artifacts. Its standardized COT cross-check matches the official file. One item (UST-10Y COT code) recorded unresolved — never guessed.

### Batch 5 — discovery survival + scan-on-demand
Crypto: venue probe + per-stage time budgets; catalog cache (migration 0060) with an honest `missed` status; stored-timestamp carry-forward; chunked checkpoints; single-flight lease plus receipt retry-once. 14/14 repair tests covering all seven acceptance checks in the spec. On-demand discovery trigger with proof stamps (run id, computed-at, data-through).
Equity: two consecutive on-demand scans ran live with no done-lock; the in-progress lock fired correctly three times; proof stamps on scheduled and on-demand results alike.
Discovery has since resumed end-to-end (runs 123–125 completed, handoffs 46–48 processed inside the window). Run 122's earlier stall remains a historical gap, never backfilled.

### Connector wire-ins
- **Etherscan MCP — wired and verified live** (16 read-only tools; a live call returned the 63-chain list).
- **CoinGecko MCP — built but inert.** The client compiles and the identical path works against Etherscan, but the initialize handshake is never answered from this egress (3 attempts) — consistent with throttling of the shared egress IP. `ALLOWED_TOOLS` left empty until a first successful tool listing; retry when the IP cools.
- Token Terminal MCP — not connected (needs Logan's OAuth account; see Part 4).

### Carve-outs confirmed untouched
No gate/threshold/weight/scoring/issuance change anywhere. The frozen strategy and all shadow variants held for you — nothing built, nothing prepared. The single REMOVE-CANDIDATE untouched. Notifications and scanner activation still held. Discovery retry still held. The AP-1…AP-3 stop-rule stands (see Q3). No purchases or signups.

---

## Part 2 — Investigations completed

**Theories #70/#71 "absence" — resolved, was never a data loss.** Both rows were saved correctly, verified live and pristine, `status: live`. The absence was a read-path paging artifact: `listTheoryWatch` sorts by `lastCheckedAt`, and its read handler re-stamps machine theories' `lastCheckedAt = now` on every call while explicitly skipping `agent:` rows — machine rows float to the top, agent rows sink below the default 25-row page (#70/#71 sat at positions 25/26). Four read-path-only repairs are prepared (explicit paging / root sort fix / stop the self-reinforcing re-stamp / separate refresh from read); none applied. This dissolves the factual blocker under AP-1…AP-3 — the apply decision is now purely Logan's (Part 4).

**OpenBB code check — the forwarded terminal list's picture is stale.** The current repo is Open Data Platform v5.0.0 with no Yahoo/yfinance, CoinGecko, or Kraken provider code in-tree. Genuinely keyless in-tree: Deribit, Cboe, Nasdaq, SEC, ECB/OECD/IMF/Fed/Fama-French/FINRA; CFTC COT tokenless; the FRED route is key-gated (our fredgraph CSV route stays better). No crypto spot provider, no Hyperliquid/OKX, no liquidation tape. Consumption shape approved and built in Batch 4b (above).

**Bitquery MCP check — not keyless.** A token gate sits before the handshake; it needs a Bitquery account (free account + 7-day/100-credit trial, no card; Trading MCP $19/mo). All 18 Hyperliquid tools are read-only (paper-safe). Genuinely additive versus our direct Hyperliquid info API: liquidation tape, open-interest long/short account-count split, funding rows with account counts, TWAP activity, linked accounts, builder fee aggregates; ~30-day historical index. Verdict: account-decision bucket (Part 4); nothing to wire until an account exists.

**Dead-source re-probe (previously rejected sources re-tested live).**
- **Senate EFD flipped:** efdsearch.senate.gov/search/home/ returned HTTP 200 with genuine HTML (previously unreachable). Caveat: home page only — the agreement click-through + POST search flow is not yet exercised; reachable ≠ search works.
- CoinGlass API: key-gated confirmed exactly (endpoints return "Need api key"; free tier = free key after signup).
- Arkham API: key-gated confirmed (401 "Missing API Key").
- House Stock Watcher: still dead (timeout + empty replies across attempts). House Clerk bulk files remain the durable congressional path.
- The Graph hosted MCP endpoint: sunset (301); gateway key required; low priority.
- BrainDAO/mcp-defiLlama: code-read = redundant wrapper over the same four public llama.fi hosts we already call — not adopted.
- Free Crypto News MCP: code-clean (single outbound host, no auth, no telemetry/exec patterns) — adoptable as a research-lane grade B/C lead source; not wired.

**Evidence rules adopted** (from the second data expert's advice, now standing in our operating file): point-in-time correctness (every data point carries publication `as_of`; no look-ahead outside frozen issuance-time levels); evidence grades A–D with downstream gating (A-grade can raise an alert; C-grade only enters a monitor list); hypothesis kill discipline (every signal/theory carries hypothesis, source+timestamp, invalidation, expected regime, live/paused/killed status).

---

## Part 3 — Pipeline state at the time of writing

- Latest handoff: 48 (discovery 125, 7 candidates, completed 2026-10-20T14:56Z). Issuance has now run **18 consecutive 0-issued runs** since the handoff-35 BTC paper entry. Latest issuance split (handoff 48): 0 issued / 3 abstained / 4 deferred. Abstention pattern across the drought (handoffs 23–32 baseline): production-model abstain ~59%, venue-mapping ~28%, duplicate suppression ~7%, invalid frozen levels ~4%, issued ~2%.
- Delivery ledger unchanged: 26 alert rows (11 delivered / 13 suppressed / 2 unrenderable, all terminal).
- Prospective comparison vessel: 255 rows, all freeze_version 2.1.5; the 6 newest rows are unscored in both arms (`unscored:incomplete-factor-ledger` — a known adapter gap); direction disagreement 0/5, audit trigger not fired.
- Paper positions: 5 open, all still labeled "Entry recorded — current lifecycle unknown." The venue monitor (30-min, gap-verified completed 1m Binance bars) has established first touches on two of them (one invalidation touch → MISS; one T1 touch → HIT) as appended monitor observations; canonical verdicts have not been written yet (see Q5).
- Signal quality, latest graded session (Oct 20): combined legacy 18/68 = 26.5% (crypto 4/27 = 14.8%, population fully closed; equity 14/41 = 34.1%). Runner recall: crypto 1/76 = 1.3% all-time (ninth straight 0% session — all three of today's misses were in-universe and blocked at the issuance gate, not missed by detection); equity 8/14 = 57.1%. **No trustworthy pooled win rate and no demonstrated edge — stated plainly.**
- **Grading change made today (Logan's instruction):** the four daily grading jobs (signal-accuracy review, crypto postmortem, equity postmortem, daily board grading) are PAUSED. His position: they re-grade a closed legacy population and interim marks; grading should cover real issued signals only. See Q6.
- Schedule load: ~95 enabled jobs, ~3,870 runs/day after the cadence fixes (down from ~5,043). A cut/merge/slow-down plan (~→1,700/day full package) is prepared and awaiting Logan's pick; no schedule was changed unilaterally.
- "Space worker overloaded" episodes continue (issuance trigger and entry watcher failures on 2026-10-20 midday, all self-recovered or covered by the 6h backstop). This is the recurring runtime-pressure evidence behind Q4.

---

## Part 4 — Questions for you

**Q1 — Wrong-sided frozen invalidation: now documented in BOTH directions. Does the second occurrence change your Oct 18 no-build ruling?**
Mechanism (traced Oct 18, candidate 162 / handoff 30): invalidation = trailing-24h extreme from **hourly** sparkline closes (min for longs, max for shorts), while the decision reference is a fresher spot snapshot. When price crosses its own trailing extreme intra-hour, the pair is wrong-sided at creation. Oct 18 instance: BTC long, frozen invalidation 81019.79 vs reference 80974. **New instance, 2026-10-20 (handoff 48): ZRO short, frozen invalidation 1.9143823425720212 (trailing-24h max) vs decision reference 1.98** — the issuance gate (`invalid_frozen_levels`) fired for the first time since handoff 30. Your Oct 18 closure held: the gate rejects correctly, silently, with values and provenance preserved; the prepared emission-nulling patch stays superseded (it degrades the recorded reason and adds a notification). The candidate in both cases stayed dead; nothing was regenerated or clamped. Question: with the defect now proven in both directions, do you (a) leave the gate as the sole guard, (b) adopt your sketched emission-side disposition (explicit invalid-level record retaining values + provenance, no extra notifications), or (c) fix the root — compute the trailing extreme on data as fresh as the reference (e.g., include the current partial hour)? Note (c) changes candidate construction, so we have treated it as methodology and held it for you. Also note: the derivation inputs are not stored in the issuance record in either case, so the ZRO mechanism is established by precedent + exact numeric fit, not by a ZRO-specific input trace — is adding derivation-input provenance to the candidate record worth doing regardless?

**Q2 — Receipt-fault root diagnosis.**
Batch 5's A5 work stops the cascade (single-flight lease, receipt retry-once), but the root cause of the receipt faults — the family that reached even the discovery lane on 2026-10-19 (5 of the last 6 slots that day faulted across five distinct fault types) — remains undiagnosed by design; you hold this thread. What do you need from us to run the root diagnosis, and in what form?

**Q3 — AP-1…AP-3 (theory read-path repairs): apply, and in which shape?**
The #70/#71 investigation (Part 2) dissolved the factual blocker. The four prepared repairs are read-path only (explicit paging; root sort fix; stop the read handler's self-reinforcing `lastCheckedAt` re-stamp on machine theories; separate refresh from read). Logan's apply decision is pending; your view on which subset is the right scope — and whether the re-stamp behavior itself is a defect worth fixing at the root rather than paging around — would settle it in one pass.

**Q4 — Rehost criterion: is the runtime evidence now sufficient?**
"Space worker overloaded" failures continue across the trigger/watcher families (2026-10-20: issuance trigger failed twice midday, entry watcher failed three times, one timeout after reading handoff 48; all recovered or backstopped, none lost a delivery). Six discovery slots faulted on 2026-10-19 across five fault types. Current load is ~3,870 scheduled runs/day, with a costed cut plan (~→1,700/day) awaiting Logan's pick. Your criterion was "rehost only if inspection proves a material runtime limitation." Does this evidence meet it, or should the load cut land first and the question be re-asked on the reduced load?

**Q5 — Canonical outcome recording for the five paper positions.**
The outcome-recording step is now unblocked (Batch 5 complete). Proposal on the table: write canonical position outcomes from venue-monitor evidence only (gap-verified completed 1m bars), first-touch against the frozen levels, append-only, never rewriting the original entries. Two positions already have monitor-established first touches (BTC invalidation touch 2026-10-17 → MISS; BAT T1 touch 2026-10-17 → HIT). Is this the right contract, and should the monitor-established touches be adopted as the canonical verdicts or re-derived under the recording step?

**Q6 — "Grade real signals only": what should the replacement grading be?**
Logan paused all four daily grading jobs today (Part 3). His instruction: stop grading legacy tracker rows and interim marks; grade real signals. Our working shape: one weekly job grading only (a) issued paper signals at matured 5/14/30-day horizons under first-touch frozen rules and (b) the prospective comparison cohort — nothing interim, nothing legacy. The prospective baseline is still empty (no post-repair issued cohort to grade yet; cohort contract closes ~2026-11-13). Is the weekly, matured-horizons-only shape right, and is there anything you would add before it starts so the forward record is gradeable from day one?

**Q7 — id33 HYPE short: contract says "unverified," independent evidence says HIT.**
The system contract still shows this legacy crypto row as unverified; an independent check established a T1 hit on 2026-10-18 (low 76.08 vs T1 76.8247, +7.29%). It has never been reconciled, and it is the only discrepancy of its kind standing between the tracker and the independent record. Reconcile by correction entry (append-only, preserving the original), or leave the contract as-is and carry the discrepancy as a documented known-difference?

**Q8 — Scanner / detector track (prospective only).**
Your setup taxonomy (5 setups) plus per-setup×regime base rates as the admission price for any future detector card, with TA-Lib/pandas-ta as detection engines, is filed on the prospective track. Scanner activation remains held, and no shadow variants of the frozen strategy were built or prepared. Confirming this stays parked until prospective comparisons are greenlit — or is there a measurement-only step you want first?

**Q9 — Delivery timing evidence: is the measurement plan enough?**
Exactly one full genuine chain has been measured end-to-end (handoff-35 BTC: event→chat acknowledgement 1149.19s; the chain was inside its window for qualification but the chat acknowledgement landed ~4m after window close). Handoffs 44/45 chains broke on the discovery double-fire (now guarded by Batch 5's single-flight lease). The events-only alert doctrine is design-agreed but activation-held. The next genuine triggered delivery is the first real test of both the Batch 5 queue fixes and the watcher gate. Is a single-chain baseline plus forward measurement an acceptable evidentiary basis, or do you want a synthetic end-to-end timing probe (test-flagged) rather than waiting for the next genuine issuance, which may be weeks away given the drought?

**Q10 — Anything in the overnight build you would have done differently?**
Batches 1–5 were built to the merged revamp plan's specs under the carve-outs above. If any piece reads as wrong-layer, over-built, or under-instrumented (the funnel instrumentation in particular was built so gate questions could be measured before being changed), say so now while changes are still cheap.

---

## Part 5 — Decisions sitting with Logan (listed so you have full context; not questions for you)

1. Schedule cut/merge/slow-down package (full ~→1,700 runs/day vs conservative ~→3,300/day vs line-item picks).
2. AP-1…AP-3 apply-or-not (see Q3).
3. Scanner activation/scheduling and notifications — held; events-only doctrine design-agreed.
4. The single REMOVE-CANDIDATE (crypto Asset view "Discovery assessments" permanent-UNAVAILABLE section) — untouched, needs his per-item word.
5. B1-I10 asset-dossier read action — held.
6. Account decisions (all his, none made): Token Terminal (OAuth, free-tier MCP); Bitquery (free account + trial — unlocks the Hyperliquid liquidation tape and OI account-count split); Bubblemaps paid key; CoinGlass free key; Dune account/key; Longbridge account.
7. Experiential Labs API key (Jev decision-layer triage) — signup pending with Logan.
8. Senate EFD search-flow browser test (home page reachable; search untested) — optional next step.

## Appendix — source verdicts since the last brief (one line each)
Cboe VIX+SKEW: keyless, verified, wired (Batch 4b). CFTC COT official file: verified, wired; xoomar mirror = cross-check only. OpenBB: consumed as pinned fetcher libraries only; the forwarded list's provider picture was stale. Etherscan MCP: wired, verified. CoinGecko MCP: service is keyless; our connector inert from this egress. Bitquery MCP: account-gated; additive Hyperliquid data (liquidations, OI account split). Senate EFD: reachable, search untested. House Stock Watcher: still dead; House Clerk bulk files are the durable path. FINRA short interest: keyless but OTC-only and frozen at 2022-06-30 — the short-interest gap stays open. GDELT: files usable (keyless, MD5-verified, backfill to 2015), API throttled from here; cadence capped at a few checks/day by Logan's instruction. gem-search: adopted as a research-lane Solana ownership X-ray (works only with our RPC endpoint reorder). Discarded with reasons, kept for your review: Stooq (deferred, environment-only failure), QuiverQuant + Twelve Data (Logan's own 2026-10-03 verdict), Whale Alert, Birdeye, 1inch, DeBank (key-gated), DeFiLlama unlocks (402), BrainDAO MCP (redundant wrapper), community Hyperliquid *trading* MCPs (signed order placement — rejected under the paper mandate), TradingView MCPs (paid or ToS-violating scrapers).

---

## Addendum (2026-10-20, ~13:25 EDT) — Q11: first-print receipt deadline, 5 min → 10 min?

Hours after this brief was written, a live case landed. BAT long (candidate 263, handoff 49): the SETUP_PENDING alert reached the signal chat unattended and inside its window — event→delivery **488s** (second full chain measured; the handoff-35 baseline was 1149.19s), channel ack ~100s before the window closed. Delivery works.

The candidate still died. First print observed ~+4s after the decision (timely), but the checkpoint receipt landed 308s after the print — **8 seconds past the 300s first-print receipt deadline** — so it voided as `non-entry:first-print-missed`. Same shape as candidate 217 on 2026-10-19 (print +0.36s; receipt ~562s, where the delay chain included ~5.5 min of agent startup alone). Two cases in two days, both killed by our own receipt latency, not by late market prints. A 10-minute deadline would have saved both.

**Q11:** Is the 300s first-print receipt deadline a strategy rule (it protects entry validity — a print we cannot confirm promptly should not become an entry) or a plumbing tolerance that our own startup/transport latency keeps breaching? Should it become 600s prospectively, stay at 300s with the receipt path made faster instead, or split — e.g., deadline counted from handler start rather than print time? We have not changed it; it sits in the frozen entry contract, so it waits for your ruling like Q1.

**Update (2026-10-20 ~13:22 EDT): Q11 is CLOSED by Logan's direct decision** — taken in the signal chat minutes after this addendum was drafted, before forwarding: the first-print receipt bound becomes **900000ms (15 minutes)**, matching the entry window, under a **new freeze version, prospective only**. Candidates 217 and 263 stay void; nothing retroactive. The change was routed to the builder chat to land inside the alert-path rebuild already underway there. Q11 above is kept for the record — it no longer needs your ruling.


---

# For both experts — Logan's direction concerns (2026-10-20)

Logan asked me to put his recurring concerns to you directly, unsoftened. These are the questions he keeps asking me, and his feeling, in his words, is that with four or five parties working on one project we are "going in circles and wasting a lot of time" instead of making "focused and intended improvements." He wants to know if we are actually all on the same page.

## Concern 1 — Are we aligned at all?

Logan keeps re-asking basic direction questions (most recently: "are we moving towards the 5-view thing now or when"). If the plan were shared and visible, he wouldn't have to. Batches 1–5 shipped, findings reconcile, packages prepare — but he cannot see a single line from *where we are* to *what this becomes*. 

**Ask:** State, in one page, what we are building toward, what "done" looks like for this phase, and what we should STOP doing. If the two of you disagree with each other or with the current build order, say so now.

## Concern 2 — Data displayed but not used

The terminal now displays Hyperliquid, OKX, Deribit, Polymarket, OpenBB, Cboe and COT data in their own panels. Almost none of it feeds any decision, ranking, or alert. When Logan asked why, my answer was: batch 4b wired them "context lanes only, no gate/score contact," because the trade model is frozen mid-measurement and new inputs may only enter prospectively, via shadow tests.

**Ask:** Is display-first actually the right phase, or is it unfinished work dressed as discipline? If it is a phase, name the concrete path and trigger for each feed to start being *used* — research ranking/filtering first, decision inputs second — with dates or conditions, not "later." If some feeds will never earn a decision role, say which, so we stop carrying them.

## Concern 3 — NO_DATA next to unused data

Logan screenshotted the AERO fundamentals card today: NO_DATA on TVL trend, revenue yield, and developer velocity — while the same platform holds DEX liquidity for AERO, a 2,432-row DeFiLlama crosswalk, and multiple wired sources that were never pointed at the gap. His read: "there's no data while you have data from other things that you're not using for this because you think it's not going to be useful or something dumb."

**Ask:** Which of these gaps are real (the source genuinely doesn't cover the asset) and which are self-imposed (mapping not built, source wired for display only, fallback never attempted)? What is the rule going forward — should every NO_DATA carry proof that all wired sources were tried for that asset?

## Concern 4 — Focus and the scoreboard

The program now runs ~95 schedules and produces findings about findings. Logan's scoreboard has not changed: a genuine opportunity reaching his chat unattended inside its window, and research that produces insight he can act on. The first happened once (today, BAT — delivered in-window, then voided by our own receipt latency). 

**Ask:** If you had to cut this program to the smallest set of work that moves that scoreboard in the next two weeks, what survives the cut? Name it. Everything else gets parked by your word, which ends the argument here.

## Muse's own answers (Logan asked me to state mine too)

1. **Alignment:** No, not fully. Each party optimizes its own layer — I optimize for verified, reversible steps; the process rewards completeness over usefulness. The 5-view restructure is the clearest example: labels shipped, structure didn't, and I let "later" stand in for a date.
2. **Display vs use:** Display-first was right for the *trade model* (protecting the frozen measurement is real). It was wrong as a stopping point for the *research lane* — nothing stops those feeds from ranking and flagging research today, and I didn't push that step. That's on me, not the freeze.
3. **NO_DATA:** Mixed. Some gaps are real coverage limits. But we wired sources for display and never built the boring mappings that turn them into coverage. A NO_DATA should have to prove every wired source was tried for that asset. It doesn't today.
4. **Focus:** If it were my cut: finish reliability (the receipt/delivery path — the scoreboard item), position outcomes, and research-lane consumption of the feeds we already pay attention to. Park everything else until those three land.

— Prepared by Muse at Logan's direction, 2026-10-20. Nothing in this letter authorizes changes; it asks for rulings.


---

# Runtime addendum — 2026-10-20 (for Q4, the rehost criterion)

Addendum to `expert-brief-2026-10-20.md` **Q4** and the concerns brief. Evidence
from today's (2026-10-20) records only — run IDs, timestamps, counts. Two
things changed since the brief was written this morning: **part of the load
cut has now landed**, and **the deeper cut turns out to be blocked by the
platform itself**, not by a decision. Both facts bear directly on Q4's
either/or ("does the evidence meet the criterion, or should the load cut land
first?").

---

## 1. Today's overload incidents (measured)

All times UTC. "Overloaded" = the artifact action infrastructure rejecting
calls with `space worker overloaded; retry after 2000ms`. Both terminals'
action layers were hit at different points in the day.

| # | When | Lane / run | What failed | What was actually lost |
|---|------|-----------|-------------|------------------------|
| 1 | 13:30Z slot (17:30Z run) | Equity deployed scan, run 31 / batch 14 (`equity-deployed-batch-1330`) | 4 of 15 invocations rejected "overloaded" (inv. 2–4 consecutive, inv. 7); the other 11 succeeded (38–99s each) | No symbols: 101/101 processed. The batch's final wrap-up never ran — symbols finished exactly on the 15-invocation cap, leaving no invocation for finalize, so `done` stayed false. Finalize deferred to the next cycle's auto-resume (batchRunId 14). |
| 2 | 11:30Z slot (15:30Z run) | Equity deployed scan, run 30 / batch 13 (`equity-deployed-batch-1130`) | A different, worse failure class: 1 "service restarted mid-call", then 120s worker **timeouts** on inv. 5 and inv. 7–15 (9 consecutive), plus the final diagnostic call — 12 of 16 calls failed | The scan **stopped at 50/101 symbols** (last verified). Rows checkpoint per symbol, so the next cycle resumes safely — but the 11:30 board was half-built for hours, and the run's true final count could not even be read back at the time. |
| 3 | 17:02:55Z | Crypto issuance trigger poll (fault observer run 212) | Execution **succeeded**; the bookkeeping (receipt/state write) **timed out** | Bookkeeping only. No work lost. |
| 4 | 17:32–17:35Z | Storm cluster (fault observer run 213): crypto issuance-trigger poll **failed** (its handoff read rejected 3× "overloaded", 100s); 9 adjacent-lane runs failed in the same minutes (entry-watch 4×, venue monitor 2×, market-data refresh 2× incl. one run-101-cascade signature, equity refresh 1×); squeeze detector 300s timeout | Fail-safe held (no fire without an observed handoff); recovered by 17:48Z. No handoff missed — handoff 49 was already triggered and the next discovery slot (19:00Z) was unaffected. Polls were delayed, nothing else. |
| 5 | 17:35–18:18Z | Storm tail (fault observer run 214, counts as reported; the window abuts #4) | Entry-watch 5 failed, signal-status monitor 2, crypto market refresh 1, equity market refresh 1, squeeze-detector tick 1 timeout — interleaved with successes | Nothing material; the issuance/delivery core stayed up throughout. |
| 6 | 18:00:02Z | Paper alert-delivery sweep (worker run `run-20261020T180002Z`) | The alerts poll failed on **both** attempts, "overloaded" (~3s apart) | One 15-minute delivery window had **no coverage**. Nothing was actually lost: all 27 production ledger entries were already terminal — nothing was waiting to send. Had a candidate been pending in that window, it would have waited for the next sweep. |
| 7 | 18:17–18:19Z | Trigger polls (entry-prompt run `run-20261020T181902Z`; issuance-trigger 14:17:55 EDT occurrence) | First poll attempt "overloaded" on each; a single retry succeeded on each | Nothing. No fresh keys existed; no fire was missed. |

**Control case, same day:** the 09:30 equity deployed scan (batch 12) ran
completely clean — 0 failures, 101/101, `done=true` in 14 invocations. And
the day's one genuine paper delivery (BAT, 17:04–17:12Z) went through fine.
The pool is not down; it fails **episodically, in clusters**, and the clusters
are what the table above counts: **7 episodes, 6+ lanes, both artifacts.**

One more load fact from the scan logs: even when calls *succeed*, the scan
action takes **40–112 seconds per 10-symbol batch** (batch 12: 9–110s;
batch 13's successful calls: 89–112s, hard against the 120s limit). Our
heaviest legitimate workload is heavy.

## 2. The structural finding: the remaining load cannot be cut with the tools given

Coordinator D's conversion attempt today (log:
`hidden_files/workstreams-2026-10-19/18-contention-batch-log.md`, §D2) is the
second half of this addendum. The scheduler's only no-agent execution kind is
`space_action`: it invokes **one** published artifact action with fixed args.
It has **no workspace file access, no conditional branching, and no ability
to fire another job**. The four deterministic jobs that exist (entry-watch,
the market-data refreshes, signal-status monitor) work precisely because each
is a single self-contained operation inside one artifact's own data.

All five script pollers need at least two of the three missing capabilities
(the issuance trigger needs all three: read handoffs → compare against a
workspace state file → *conditionally* fire another cron → write state + run
log). The artifact's 124 published actions contain no trigger equivalent, and
building one inside the artifact still couldn't dispatch a cron or write the
workspace records the receipt system reads. **Conversions refused on all
five; nothing was weakened to fit.** Consequence: the poller family's
**~1,000+ agent launches/day** (workstream A count, doc 15) stay agent
launches. Unblocking needs a platform script-execution kind, or moving each
poller's state + dispatch inside an artifact that gains a cron-enqueue
capability. Neither is a cron edit.

## 3. What we already did today — judge the remainder, not the pre-fix state

- **D1 consolidation applied** (same log, §D1), coverage verified per job
  before anything was disabled: equity duplicate scan lane → failover-only
  (removes the 4×/day double-scan collisions at 09:30/11:30/13:30/15:30);
  `x-sweep-caller-scan`, `daily-setup-hunt`, `daily-synthesis-brief`,
  `lightweight-surveillance` off; paste-trade feed merged into the daily
  watch; the morning brief's duplicated sweep copy stripped. **~13 agent
  launches/day removed**, zero rollbacks. Schedule now 99 jobs, 83 enabled.
- **Scanner** put on the 30-min cache lane with a single-flight lockfile and
  a stale-cache skip (§D3, verified end-to-end 18:21–18:23Z).
- **Honest timing caveat:** the contention batch completed ~18:24Z. Every
  incident in §1 predates it or overlaps its rollout — **the 13:30 scan and
  both storms are pre-fix evidence.** Post-fix overload rates are *not yet
  measured*. Anyone quoting today's counts as the post-cut steady state
  would be overstating.
- **What would settle it:** the same table, kept for the next 2–3 days of
  deployed runs — overload rejections/timeouts per deployed scan, observer
  storm counts per day, any delivery window left blind. The records already
  exist in the same places this table was drawn from.

## 4. One wart that is ours, not the platform's: the scan wrap-up

Batch 12 (clean day) shows the normal shape: symbols finished on invocation
11, and finalize/wrap-up consumed invocations 12–14 (the finalize call itself
took ~110s) before `done` flipped true. Batch 14 (13:30) finished its
symbols exactly on invocation 15 — the cap — so wrap-up never ran and a
*completed* scan sat unfinalized until the next cycle.

**Our read: this fix does not need expert input.** The 15-invocation cap is
applied by the lane's own driver loop (the run logs record "15 allowed"),
the resume path (`batchRunId`) is the lane's own designed recovery, and the
fix is pacing only: stop feeding new symbol batches when the remaining
invocations are within the observed wrap-up budget (~3), and let finalize
take them. It changes no scoring, gates, data, or artifact behaviour. If
part of the bound turns out to be platform-set, the same headroom logic
works inside whatever cap exists. Flagging it here for completeness, not as
a decision item.

## 5. Honest complication: our own bursts are part of the load

The records do **not** isolate platform fault from self-inflicted load, and
we won't pretend otherwise:

- The 17:32–17:35Z cluster sits on a half-hour boundary where several of
  our own lanes start at once (30-min monitor/scanner lane, triggers,
  refreshes, the observer itself). Known pile-ups at identical start times
  were documented before today (workstream A). D1 removed the *duplicate*
  work, not the *simultaneous starts*.
- But a momentary self-burst does not explain the 11:30 scan: one lane,
  calling strictly sequentially, timed out 9 times in a row over ~18
  minutes — and the 13:30 rejections spread across a ~25-minute run, not a
  single minute. Nor does it explain successful calls routinely taking
  89–112s against a 120s ceiling outside the storm windows.
- We cannot see other tenants of the shared pool from here. "The pool was
  saturated" is the error message's own claim; whose load saturated it is
  not observable from our records.

## 6. Decision asked — and our honest read

**Q4 asks whether the rehost criterion ("proven material runtime
limitation") is met. On today's evidence alone, our read is: not cleanly —
yet.** Three reasons: (1) every incident predates or overlaps today's load
cut, so the reduced-load experiment Q4 proposed has barely begun; (2) our
own schedule bursts are a real contributing cause we haven't yet staggered
away; (3) today's actual losses were small — one scan half-built for hours,
one delivery window blind with nothing waiting, one finalize deferred. No
delivery was lost.

**But the shape of the answer changed today.** Q4's alternative was "cut
the load first, then re-ask." §2 shows that path now has a hard floor: the
biggest remaining cut (~1,000+ launches/day) is not awaiting a pick — the
platform offers no mechanism to make it. So the experiment is now bounded:
D1's cut + staggering the half-hour pile-ups is all the load reduction
available to us. **If overload clusters persist at that floor over the next
2–3 days — above all, if another deployed scan is left incomplete or
another delivery window goes blind — the limitation is proven by
elimination, and the criterion is met without further argument.** If they
fall to isolated, retried-and-recovered rejections, in-place mitigation was
enough and rehost stays parked.

Smallest mitigations available now, if the answer is "not yet": stagger the
:00/:30-boundary lane starts; the §4 headroom fix; keep the retry/backoff
behaviour that demonstrably recovered every incident today except the 11:30
scan. Moving collection out or rehosting (portable code+data, no side-store)
remains the escalation if the 2–3 day measurement says so.

*— Muse, 2026-10-20. Sources: deployed-batch run logs 2026-10-20 (batches
12/13/14); delivery worker run run-20261020T180002Z; trigger run
run-20261020T181902Z; fault-observer state.json + daily log, runs 212–214;
contention batch log §D1–§D3; workstream A doc 15 (launch counts).*

---

## 7. Measurement continuation — 2026-10-20, post-consolidation (partial day)

The §3 caveat stands: the D1 consolidation landed ~18:24Z, so only the
evening hours of 2026-10-20 are post-fix evidence. Three incidents since,
all from fault-observer runs 215–216 and the issuance-trigger state file:

| # | When | Lane / run | What failed | What was actually lost |
|---|------|-----------|-------------|------------------------|
| 8 | ~18:53–19:23Z window | Crypto market-data refresh + crypto paper-entry watch (fault-observer run 215) | 1 failure each, `space worker overloaded` signature, execution NOT-RUN / receipt FAILED, interleaved with successes in the same window | Nothing; both lanes recovered on adjacent runs. Issuance/delivery core unaffected; ledger unchanged (27 entries). |
| 9 | 18:57:53→18:59:54Z | **Crypto discovery slot 15:00 ET** (`crypto-market-discovery-1500`, fault-observer run 216) | Space-worker request timed out after 120s (121s wall). execution UNKNOWN (zero observed side effects), receipt FAILED. 4th occurrence of this timeout signature in the discovery lane | The whole discovery slot: no discovery 127 / handoff 50 was produced. Discovery reliability is now **4 of the last 8 slots faulted; 10 faulted since Oct-17 19:00 ET**. No candidates were lost that existed — none were produced. |
| 10 | 19:42Z | Crypto issuance-trigger poll | `getpaperpilothandoffs` rejected "overloaded" on both attempts; state written with the failure logged; lastTriggeredHandoffId unchanged at 49 | Nothing (no new handoff existed to miss — slot #9 produced none). The 6h `paper-signal-cycle` backstop remains. |

**Reading so far:** the post-fix sample is hours, not days — §6's 2–3 day
test is still the plan. But incident #9 is a new *kind* of loss for the
table: not a delayed poll or a deferred finalize, but a full discovery
slot producing nothing, in a lane that has now faulted in half its recent
slots. If the discovery lane keeps failing at this rate while other lanes
recover, the "clusters persist at the load floor" condition in §6 is
approaching met on the discovery lane specifically, whatever the rest of
the pool does.

*Continuation sources: fault-observer state.json runs 215–216;
paper-issuance-trigger/state.json lastCheck 2026-10-20T19:42Z.*
