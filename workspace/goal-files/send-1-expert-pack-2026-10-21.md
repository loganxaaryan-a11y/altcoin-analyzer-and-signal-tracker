# SEND PACK — 2026-10-21 (for the expert; Logan forwards)

**Send 2 files total:**
1. **This file** — everything current: cover + post-closeout addendum + the consolidated implementation closeout + the discovery redefinition and first mining results + the updated question/proposal status.
2. **`send-2-challenger-r1-v2-registration-2026-10-21.md`** — the Challenger-R1 v2 registration (frozen text, with a dated status note on top).

This pack supersedes the two 2026-10-21 morning files (the closeout+discovery brief and the discovery fix note) and the implementation-update brief. Where those files and this pack disagree, this pack is the current record. The 2026-10-20 pack (`everything-2026-10-20.md`, already forwarded) is not repeated; its Q1–Q10 remain open and are not restated here. Paper only throughout. Nothing in this pack changes the frozen strategy, gates, weights, or methodology.

## What we are asking the expert
- Review the Challenger-R1 v2 registration (file 2): are the six corrections + addendum implemented faithfully, and is the comparison math (paired net R, cluster bootstrap, inconclusive-never-promotes) sound as frozen?
- Q13 / P-T1-2 (still open): build a 1m-interval producer so the notification layer's stored-interval evidence exists, or retire the interval form as a display relic? Issuance validates on on-demand prints verified against venue ground truth.
- Q15 / P-MEXC (still open): build a MEXC-specific evidence + monitoring chain, or formalize MEXC as research-only permanently? Current state: MEXC assets are labeled unsupported for formal issuance; Logan's ruling stands until a chain exists.
- Q11 + Q16 (partially answered by building): the narrowed discovery-mining lane (mention-change + crowding only, grade C, findings never touch issuance) is built and scheduled — is that discipline sufficient, and what kill criteria should an attention-based theory candidate carry?
- The second expert's agreement to the phase contract + NO_DATA standard is still pending (one line is enough).

## Decisions that are Logan's, not the expert's (listed so nothing looks open that isn't)
- Radar→paper handoff lane: retire or retarget (closeout §10). It has never qualified a candidate; production issuance does not use it.
- Whether to trace the run-109 insert failure (addendum below) to its exact error text.

## Status of the earlier proposals (updated 2026-10-21, 13:00 EDT)
- P6 BAT settlement append — DONE (closeout §2). This also answers Q14 in practice, following the F2 precedent.
- P7 META #49 verdict append — DONE (closeout §4, EQ-1).
- P5 / Q12 veto measurement — SUPERSEDED by the Challenger-R1 shadow comparison (file 2).
- P-BEAM — RESOLVED differently than proposed: identity proven via contract; mapped on Binance Spot as BEAMXUSDT (freeze v2.1.5), not via MEXC (closeout §5).
- P-DISC discovery build — APPROVED IN NARROWED FORM and built: mention-change + crowding only; the weekly pattern miner is deferred (closeout §9).
- P-T2 contention mitigations — still open; contention is being measured inside the 48–72h evaluation closing Oct 22–23.

---

# ADDENDUM — after the closeout (2026-10-21, ~08:30–12:05 EDT)

The closeout below was delivered at ~12:00Z. These events came after it and are part of the current record:

1. **Run 109 — a full handoff discarded by a fault, then honest abstains.** The 11:01Z issuance tick failed on a `paper_candidate_intake` INSERT (error text truncated in the record; root cause UNDETERMINED), died holding its lease, and the next three ticks coalesced without processing. Run 109 then processed handoff 54 at 11:21Z — after every candidate's entry window had closed (11:14Z) — and abstained 15/15 as `processing-expired` with zero merit evaluation. The lane has been healthy since. Open questions (tracing offered to Logan, his call): the exact insert error; correlation with the known DB-lock contention pattern.
2. **Run 110 — NEAR issued.** Handoff 55 → 1 issued / 8 abstained / 6 deferred. NEAR LONG @ $5.21, invalidation $4.6692, first merit issuance on the v2.1.5 freeze. Chain completed in-window (~11.6 min spare); the chat copy arrived after window close and is labeled historical, per the terminal-first design.
3. **Run 111 — PHA issued; drift gate is now the active blocker.** Handoff 56 → 1 issued / 7 abstained / 7 deferred. PHA LONG @ 0.058825 (score 68, invalidation 0.05642259) — first PHA issuance ever. NEAR and CVX both re-appeared and were drift-blocked; COMP hit 24h duplicate suppression; 7 deferred, all `venue_mapping_unavailable`. Pattern change worth noting: for re-appearing coins, drift — not mapping — is now the binding gate.
4. **First fully measured five-stage chain (handoff 56):** discovery complete 14:57:02Z → terminal visibility 15:01:31Z → qualification 15:01:41Z (278.3s end-to-end, in window, ~10.3 min spare) → chat copy 15:21:58Z (after window close, labeled historical). The terminal-first design works with real numbers; unattended in-window *chat* delivery remains unproven and unclaimed.
5. **Issued paper positions are now 6** (supersedes closeout §7's count of 4): PEPE open, BAT settled −1.00R, COMP open, CVX open @2.61, NEAR open @5.21, PHA open @0.058825. Scanner records remain a separate ledger and are never blended with positions (closeout §7).
6. **R1 v2 demonstrated record: still pending** — the 11:40Z collection run refused 100/100 pre-freeze candidates by design and wrote 20 R4 population records (closeout §3). Discovery runs 137–139 have since landed; their candidates enter the next collection run.

---

# PART A — CONSOLIDATED IMPLEMENTATION CLOSEOUT (verbatim, delivered 2026-10-21)

# Implementation closeout — 2026-10-21 (all workstreams Z7–Z16, R1 v2, D2)

One consolidated closeout for the phase-shift work (Logan's 2026-10-21 01:30 EDT directive + 04:26 EDT addendum). Each item is done or has its gap named. Completed work stays closed. Nothing here reopens settlements, v1 text, frozen decisions, or the strategy.

## 1. Discovery execution repair — CLOSED (Z7, doc 36)

Root cause proven: all 10 slot jobs were space_action crons — the job body containing any verification never executed; the scheduler invoked `runmarketdiscovery` directly and marked success from the transport result alone. Resume semantics do not exist (every re-invocation creates a new run id/lease and restarts; checkpoints are observability only). Ceiling math: healthy run ≈102s vs the 120s worker ceiling; a stale-tier run added 92–96s of in-run tier refresh → guaranteed sever.

Shipped: (a) all 10 slot jobs converted in place to verify-or-fail agent jobs — baseline → invoke → read-back; success only with an attributable terminal run row; bounded retry that re-checks for the slot's own row first (a late landing is adopted, never duplicated); failure reported loudly. Read-back states are the honest three: VERIFIED-EXECUTED / VERIFIED-NOT-EXECUTED (only with an independent "did not start" record) / UNVERIFIED — a missing read-back is execution-unknown, never proof of no execution. (b) Tier refresh separated into a standalone 2h job (~25 min ahead of slots); live fire ~17s vs 92–96s in-run.

**Slot #2 acceptance — PASS (2026-10-21, this morning):** the 0700 ET slot fired at ~10:56Z under the hardened bodies and produced discovery run 137 → handoff 54 (completed 2026-10-21T10:59:02.839Z), no retry, no recovery involvement, no silent-empty. Runtime after tier separation: run 135 = 81.7s, run 136 = 89.0s (tier stage 59ms), run 137 landed normally — margin ~31–38s vs the 120s ceiling. The P3 recovery watch ran untouched throughout and fired nothing. Slots 0300 + 0700 both recorded COMPLETED in the recovery state.

Probe scope, stated exactly: the controlled probe proved the verify-or-fail *reporting* path for a definitely-nonexistent action — an unverifiable invocation is reported as failure-to-verify rather than success. It does not prove the platform invocation can never silently drop.

Self-correction, on the record: an interim build report claimed live slot #1 was "blocked by a scheduler-wide dispatch stall." Wrong — rested on a background timer's printed clock disagreeing with epoch timestamps in the same tool outputs; grounded on the epochs, neither job was due yet. No stall occurred. Withdrawn in doc 36 with the lesson logged.

## 2. BAT settlement — CLOSED (Z9, doc 38)

Under Logan's 2026-10-21 authorization ("append proven settlements under existing authorization"), every check passed against the ORIGINAL contract: canonical levels match the ENTRY_CONFIRMED payload field-for-field (entry 0.1949, invalidation 0.1902812846722114, T1 0.20182807299168287, T2 0.2064467883194715, Binance Spot long); coverage complete (199 bars from entry, 198 eligible, 0 gaps, spanning bar excluded); first touch = invalidation at bar 2026-10-21T01:08:00Z (low 0.1902), zero target touches, no same-bar ambiguity. BAT SETTLED invalidated, −1.00R gross, appended to monitoring/outcomes.jsonl line 9 in the F2 format under crypto-evaluation-v5-corrected (18 bps). PEPE + COMP (run-88 cohort) remain OPEN, coverage current, zero touches. The scheduled monitoring lane was proven separately: 7 consecutive scheduled runs re-derived all 8 positions from canonical records with 0 discrepancies. MEXC appears nowhere in positions or outcomes; entered checkpoints = exactly the Binance positions.

## 3. Challenger-R1 — registration v1 CLOSED, v2 REGISTERED (Z10 → Z13, docs 39/42)

Preparation (Z8, doc 37): sample of 62 candidates pre-registered before outcome review (runs 132+134+135, widening leg 126); every rejection traced to its decisive layer — venue mapping 33/62 (53%, incl. ZEC 65, PUMP 61, BEAM 65, CVX 65), model abstain 19, drift 3, invalid levels 3, first-print-missed 1; shorts: 0 of 6 ever passed the mapping layer, so no short-side rule claim is measurable. The four assessments: (A) ATH hard gate fired 8×, killed zero pilot candidates, true cost unobservable; (B) productionScore = factor-sum − 10 iff Trend AND Momentum both pass (49/49) over factors sharing the same 7D return; no formula change at n=49/3 positives; (C) 3 wrong-side invalidations (25/78/199 bps) — invalidation derived from a daily-candle set vs a spot reference, no recorded derivation window, "malformed" conflated with "already crossed"; repair = same-as-of derivation + per-level provenance + reason split, strict rejection kept, clamping rejected; (D) all 3 drift rejections measured against references 126–149s before the decision while prints arrived 6–15s after — re-anchor the reference to the decision instant, band/window unchanged.

Registration v1 (frozen 2026-10-21T06:00:00Z, rule text `730b415a…`, scorer `637ffd2d…`) shipped with Logan's six corrections (pre-freeze reference only; level-split precedence; attainable arithmetic; matched pairs; per-component inputs; adoption checkpoints not a numeric rule) and the arithmetic correction: doc 37's 75/80% figure was wrong for 17 of 49 candidates — Network unavailable 49/49 but Positioning was a measured neutral on 17/49; attainable is per-candidate 85 (×17) / 75 (×32); ALT (run 132) = 58/85 = 68.2%, not 77.3%.

Registration v2 (frozen 2026-10-21T07:08:55Z, supersedes v1; v1 records untouched, v1 accrual closed with zero v1 records) implements Codex's six corrections + the minimum-implementation addendum: (1) drift records carry fetch start + receipt times; receipt ≤ decision instant verified; late receipt = `historical_reconstruction`, labeled `reconstructed`, excluded from paired-comparison counts (stated: under the 6h cadence all drift evaluations are reconstructions until a live capture step is wired); (2) missing derivation = UNVERIFIED, MALFORMED reserved for demonstrated invalid construction, new code `already_crossed` — **R2 measures provenance only, disposition-neutral** (see §6); (3) R4 completed — population = scored candidates + each run's upstream discovery-observed assets; CoinGecko join (ATH, ATH date, SMA50 relation, 20D trend, cut at decision instant), per-member disposition (hard_exclude / pass_with_context / unverified-with-reason); blind spot named: pure ATH-only exclusions leave no per-asset record in any production read path; (4) attainable-max corrected against the rules — best Trend+Momentum pair = 28 (pass+mixed, no tax), beating both-pass 35−10=25; attainable_max = 68; bar 60 = 88.2%; (5) every record carries baseline freeze, production/challenger hashes, handler 2.1.9, mapping record, manifest identity, scorer hash; the collector-manifest mismatch resolved: the pin was right, the live collector drifted (one additive flag-gated `--dossier-capture` mode, 49 diff lines, default path behavior-identical; the collector feeds no registered challenger input); (6) comparison math frozen: paired net R (gross R − 0.0018 × entry/risk-distance), non-taking arm = 0, reason-split pairs excluded from return inference, AMBIGUOUS/UNKNOWN counted never pooled, cluster bootstrap (10,000 resamples, 90% interval); <30 pairs or <10 clusters = INCONCLUSIVE. Review checkpoints: 30 divergences / 8 weeks (2026-12-16); hard deadline 12 weeks (2027-01-13); inconclusive never promotes; promotion only by a separate post-review decision.

Shadow-outcome evaluation is automatic and isolated: scorer enrolls would-issues into a separate shadow book (`challenger-r1-v2:enroll:<id>`), every record HYPOTHETICAL-labeled with the explicit 18 bps clause, settled under crypto-evaluation-v5-corrected by `challenger_shadow_eval.py` into a separate outcomes file; challenger entry prints are selected independently from venue data. Registration integrity is mechanical: the scorer hash-verifies the rule text on every run and refuses on mismatch.

**Gap named:** the first demonstrated v2 record is still pending. The 2026-10-21T11:40:19Z collection run (next item after the freeze) saw 100 candidates, refused 100/100 pre-registration (all decided before the freeze — by design), scored 0 new, wrote 20 R4 population records, shadow evaluator clean no-op. The armed-path proof stands: guard dry-run = 100 seen / 100 refused / 0 written; live CoinGecko R4 join executed (BTC ATH $126,080, −34.4%, no conjunction); the first post-freeze handoff's scoring at the next collection run will be the first demonstrated record, enrollment included.

## 4. Equity — EQ-1 / EQ-3 CLOSED, EQ-2 collection CLOSED (Z11, Z14, docs 40/43)

EQ-1: signal #49 META long's proven verdict (MISS, graded 2026-10-19; entry 728.08, invalidation 696.20 touched on the 2026-10-19 bar, low 693.86, held 17 sessions, close −3.11%) appended via the artifact's own `recordsignalverdict`; the original signal row never edited. The board's META row now carries the conflict line verbatim. Full-board linkage audit: 11/49 board rows carry `trackedSignalIds`, every link a tracked signal on the same symbol; the other 38 rows have no tracked signal on their symbol at all — nothing provably-the-same left unlinked, no link invented.

EQ-3: migration 0049 adds provenance columns to tracked_signals; recordSignal computes the full set at issuance with an explicit `provenanceIncomplete: true` branch when ATR-14 inputs are unusable. Additive reads only (incl. PROVENANCE-INCOMPLETE chip). No scoring/weights/bars/verdict behavior changed; no legacy row rewritten. Limits: both harness cases were duplicate replays of the 2026-10-20 self-check identities (`insertedThisCall: false`) — the first genuinely new issue is the production proof; the ATR-unavailable stamp branch is implemented but currently unreachable.

EQ-2: definition registered into the same review cycle (C = (22/3)·T over SMA votes, shadow raw = production raw − weighted triple + C, −5 tax = 0 in shadow). Collection wired at board/candidate EVALUATION time (deliberately not issuance, which is frozen) via migration 0050: additive table, both scan evaluation paths, fail-isolated, production never reads it, started empty, nothing backfilled. Definition-fidelity correction (material): live production applies its ±5 adjustment when the five-factor trend cluster is unanimous, not on the three SMA votes alone — resolved toward the code. Demonstrated: scan run #33 (started after wiring, store confirmed empty beforehand) — AAPL production 73 → shadow 78 (pure tax removal); BAC unanimous short, adjustment fully removed; AMD mixed votes → −39 vs −38 (consolidation amplifies partial disagreement). Sandbox full run: 101/101 reproduced, zero failures, 4 divergences (all consolidation-attenuation); board payload byte-identical; tracked signals #49/#51/#52 field-identical. Unresolved: the tax-removal divergence class is implemented but not yet observed live (in #33 the removal never crossed the ±20 bar).

## 5. Venue coverage — v2.1.4 CLOSED, BEAM identity CLOSED, v2.1.5 live (Z12, Z15, Z16; docs 41/44/45)

Freeze v2.1.4 (2026-10-21T05:57:44Z) added 5 Binance Spot mappings verified TRADING in three agreeing passes (ZEC, PUMP, CVX, CRV, RAY); venueMappings 38→43; productionHash `b9b3ec39…` identical across v2.1.1→v2.1.4; 100 window candidates kept original stamps; prospective only. Live proof landed the same day: discovery run 136 (the hardened slot) → handoff 53 → issuance run 108 issued **CVX long** (score 65, entry 2.61, invalidation 2.0936, targets 3.3846/3.9009; qualifying Binance Spot print inside the window at 38.46 bps drift, under the 50 bps cap). First issuance through a v2.1.4-mapped asset and first handoff-driven issuance through the terminal-first chain. Chat copy arrived ~4m38s after expiry, labeled HISTORICAL — terminal record is the actionable surface. Run 108 totals: 1 issued / 8 abstained / 5 deferred of 14; bounded-work check passed (14/14 intake completed, no re-fires).

BEAM identity resolved through canonical metadata: discovery BEAM = CoinGecko `beam-2` (contract `0x62d0a8458ed7719fdaf978fe5929c6d342b0bfce`); MEXC BEAMXUSDT = the same gaming token (contract matches exactly); MEXC BEAMUSDT = the Beam privacy coin (different asset); Binance BEAMUSDT = the privacy coin, delisted Jan 2023 (dead pair); **Binance's gaming-token pair is BEAMXUSDT — TRADING**. The earlier "identity uncertain" was a wrong-pair search. Freeze v2.1.5 (2026-10-21T08:21:22.959Z) shipped beam-2 → BEAMXUSDT as the 44th row after Logan's word, with all three application checks passed: TRADING in three agreeing passes, live aggTrades prints at beam-2's price (~0.0031), live 1m klines on the monitoring host (no MEXC-style evidence gap); productionHash identical; zero past candidates re-stamped; identity guard (CoinGecko id + contract) recorded; BEAMUSDT prohibited. Live proof pending: first v2.1.5 issuance run containing a beam-2 candidate — unlock ≠ qualification.

MEXC chain unchanged: mapping layer only, evidence + monitoring paths unbuilt, assets research-visible but unsupported for formal issuance.

## 6. R2's implemented scope — stated accurately

R2 does not decide, score, or exclude. It measures invalidation provenance and labels each rejection with its reason: valid construction vs missing derivation (UNVERIFIED — never malformed) vs demonstrated invalid construction (MALFORMED) vs valid construction already crossed by the falling price (ALREADY_CROSSED). Rejection remains strict in production; clamping is explicitly rejected. All R2 divergences are disposition-neutral reason-split records.

## 7. Scanner records vs issued paper positions — the clarification

Counts must never be blended. Two separate ledgers:
- **Scanner records:** discovery candidates, notification rows, cohort rows. Current: 349 cohort rows (`rows/cohort-prospective-v2.csv`), 39 alert rows, 350 notification rows (294 actionable / 21 expired / 29 historical / 35 lifecycle), 15 rows added in the latest 11:40Z collection (handoff-136 batch, 1 decision-time verified, 14 unverified by the known adapter gap).
- **Issued paper positions:** exactly 4 — PEPE (open), BAT (SETTLED invalidated, −1.00R gross, appended 2026-10-21), COMP (open), CVX (open, issued via run 108). No MEXC or unmapped asset is enrolled or settled anywhere.

A scanner record is not a position; a cohort row is not a trade. The performance statistics that matter run on issued positions under their contracts, not on scanner counts.

## 8. Workload accounting — including the changed discovery jobs

The terminal-first closeout measured the affected set at 828 → 72 launches/day (−97.1% observer-only; 24/day without the new 30m digest). The discovery-lane change is now part of that picture, stated honestly:
- The 10 discovery slot jobs are agent-kind again (verify-or-fail): **10 agent launches/day**. The pre-fix version ran at 0 agent launches — and that 0 was the Z7 root cause: transport-claimed success with no verification. The launches were bought back deliberately; each carries the read-back that proves the run.
- The new universe-tier-refresh job (2h): **12 agent launches/day**.
- Recovery watch unchanged: 48/day. The 30m terminal-digest: 48/day.
- `paper-issuance-cycle` stays at **0 agent launches** (deterministic 5m space_action — 288 scheduled checks/day), exactly one issuance run per handoff, bounded-work guard verified across ~17 consecutive ticks.

## 9. Discovery mining — built and scheduled (D2, doc 46)

Narrowed scope only (mention-change + crowding, existing collection; weekly pattern miner deferred): `keep_current.py` — ingest (new sweep runs past the watermark, dedupe by post id, atomic watermark), baselines (trailing 30d, expanding; trailing 72h always excluded; coverage/corpus/thin labels stamped), deviation (mention velocity ≥3.0× + first mentions; crowding from a FRESH caller-ledger parse every pass + paste.trade board; cross-stream agreement flagged as the strongest class). Findings carry class, asset, full numbers, as-of, grade C, and the complete limits block. Cron `discovery-mining-daily` at 23:15Z (anchored after the last daily sweep, evidence-based; watermark means a late sweep is caught next pass). Proof run: 507 genuinely new posts appended (store 9,705 → 10,212), baselines stamped THIN (4.00 days), 34 findings (HYPE 5.33× strongest velocity; NFLX first-mention spike consistent with v0; 5 cross-stream crowding agreements — META, ZEC, TSLA, LIT); AMD velocity recount spot-check exact. All stated limits stamped on baselines.json, every finding, and the summary. Findings never touch issuance.

## 10. Incident during the window — concrete decision needed (Logan's call)

The 6-hourly radar→paper handoff job failed 3/3 on run 136's radar candidates (COMP, ZRO, WLD — reason `missing-entry-levels`): the radar output it reads carries no entry prices, and the lane correctly refuses to invent them. Bounded facts: the production path does not use this lane — run 108 already processed the same discovery with full intake and issued CVX; and this job has *never* qualified a single candidate in any real run (prior failures were isolated `invalid-direction` singletons). The failure is honest fail-closed behavior in a lane that produces nothing and blocks nothing.

**The decision:** retire this job, or retarget it at candidates that carry factor ledgers and levels. It currently adds failure noise without adding coverage. Not actioned — Logan's call.

## 11. Outstanding items (his calls — do not nag)

1. **Handoff-lane decision** (§10) — retire or retarget.
2. R1 v2's first demonstrated record — pending the next collection run scoring a post-freeze handoff; enrollment cannot wait behind it (armed-path proof already established).
3. BEAM/CVX live proof — first v2.1.5 issuance run containing a beam-2 candidate; CVX is open and monitored.
4. Oct 23 feed-role deadline — every retained supplement answers a named research question or leaves the default view.
5. 48–72h coverage + timeliness evaluation — closes Oct 22–23 (includes equity store accrual confirmation + DB-lock contention from existing logs).
6. X-sweep backlog delivery — 8 digests verbatim, his go.
7. Expert-file forwarding for the 2026-10-21 closeout+discovery brief — Logan's send; Codex has already replied to the R1 registration review loop.

## Verification limits

R1 v2's prospective proof is armed-path + R4 writes; the first scored record is pending a post-freeze candidate. EQ-3's brand-new-insert proof and EQ-2's live tax-removal divergence class both await their first natural instances. BEAM's live proof awaits a beam-2 issuance. The 2300@2026-10-20 slot remains a permanent recorded coverage gap. DB-lock specific holder remains UNKNOWN (verdict BOTH stands). Discovery run 137 is degraded (research synthesis timed out, 14/15 sources live) — same as 136.

---

# PART B — DISCOVERY REDEFINITION + FIRST MINING RESULTS (from the 2026-10-21 brief; build status updated by closeout §9)

### 2.1 Logan's correction (2026-10-20, standing)
"Plugging in API and displaying stats is not discovery." The scheduled pipeline is a **screener**: it re-scores a known universe on a timer. **Discovery = finding patterns, interesting things, oddballs, and trending things** — deviation against a baseline: mention velocity, first-mentions, actor silences, crowded positioning, correlation breaks, quiet accumulation, narrative lifecycle stage.

Utilization audit (honest): the research inputs Logan curates — X sweep (241 accounts), Telegram sweep, Substacks, paste.trade, feed-skim — were being read once for digests and buried. The accumulated corpus was never mined as a whole. The caller ledger was the only accumulating, re-read structure.

### 2.2 Discovery v0 — first mining pass over the X-sweep corpus (2026-10-21)
Corpus: 36/36 sweep runs parsed, 9,705 deduped posts, 2026-10-14 → 2026-10-20 (~6.7 days). Limits stated in the report and repeated here: ticker extraction is cashtag-only in v0, so only 648 posts (6.7%) carry an assigned ticker — all attention measures are cashtag behavior, not total discussion; baselines rest on 3.67 days (the trailing 72h is excluded from its own baseline). Spot-checks: 3 events recounted independently from raw run files — exact matches.

Findings (as_of 2026-10-20T22:32Z; no price data in this pass, no price claims):
- **Velocity:** HYPE 4.68× baseline (23 mentions, 12 accounts) — strongest; ONDS 4.88×; MSFT 4.27×; ASML 3.66×; AMD 3.06×.
- **First mentions:** NFLX — zero cashtag history, then 10 mentions / 8 accounts in-window; also APLD, ANET, XMR, CRM.
- **Silences (tier-1, retrieval verified working — behavior, not outages):** _tolks 101.4h = 10.3× his normal gap; skundojjala 106.1h = 5.6×.
- **Crowding (two ledgers):** sweep-caller ledger (fresh parse: 526 calls — the on-disk extract was a stale Oct-15 / 60-call snapshot, gap flagged) — BTC 86% long (n=43), META/NBIS 100% long. paste.trade (678 deduped, open-as-listed) — META 91.7% long, ZEC 90%, HYPE 83.3% long, NFLX 83.3% short. **META, ZEC, HYPE are crowded-long in both sources; HYPE combines crowding with the velocity spike; NFLX combines a first-mention spike with a crowded short.**

### 2.3 The build proposal (for review — only v0's manual pass has run)

*Status update: approved in narrowed form and built — mention-change + crowding only (closeout §9); the weekly pattern miner (layer 5) is deferred. The full five-layer text is kept here so the expert can judge the narrowing.*
Five layers, all outside the artifacts (small deterministic scripts; the 120s ceiling kills heavy in-artifact work):
1. **Event store** — one append-only line shape across streams (when / stream / who / asset / what / source ref). X done in v0; Telegram, Substack, paste.trade, market series get normalizers.
2. **Keep-current collectors** — append steps hitched to jobs that already run (sweep post-step; paste.trade snapshot; HL cache extended 6 → top ~50; daily ETF-flow/stablecoin rows).
3. **Baselines** — nightly recompute, dated/versioned, trailing-72h always excluded from the window it judges.
4. **Deviation engine** — daily, deterministic detectors (velocity, first-mention, silence, crowding, funding/OI extremes, correlation breaks, sector-laggard). Findings ledger with observed value, baseline, evidence refs.
5. **Pattern miner** — weekly: outcome backfill per finding (price at +24h/+72h/+7d), detector hit-rates, actor earliness (first-mention timing vs crowd), lead-lag stats, narrative lifecycle curves. Every pattern carries its n; small n is labeled hypothesis.

Surfaces: digest first; a terminal Research card only after the data proves worth displaying. Findings may feed theory candidates (existing approved direction) with evidence grades. **Findings do NOT touch issuance** — the frozen model keeps its lane unless separately approved.

---
