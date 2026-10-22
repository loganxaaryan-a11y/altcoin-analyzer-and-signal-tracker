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
