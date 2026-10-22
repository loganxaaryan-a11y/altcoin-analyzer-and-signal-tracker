# Expert brief — 2026-10-21: terminal-first closeout results, discovery redefinition, proposals, open questions

Prepared for Logan to forward. Companion to `everything-2026-10-20.md` (forwarded 2026-10-20 evening). Nothing in this file changes the frozen strategy, gates, weights, or methodology. Paper only throughout.

---

## PART 1 — WHAT WAS DONE (2026-10-20 evening → 2026-10-21 00:15 EDT)

### 1.1 Terminal-first retirements — executed, measured
Seven chat-only jobs disabled (never deleted), each with exclusivity evidence that it served chat delivery only: paper-issuance-trigger, paper-entry-prompt-trigger, paper-signal-alert-delivery, paper-signal-cycle (agent wrapper), equity-alert-drain, engine-hits-drain, signal-explainer. Fault observer reduced 30m → 1h and repointed to store timestamps. **Preserved: paper-venue-monitor** (position monitoring/settlement — not chat polling).

Measured launch reduction, three separate numbers, **scope = the affected set only, not the whole programme**:
- Agent launches in the affected set: **828/day → 24/day (−97.1%)** (observer only)
- Including the new 30-minute terminal digest (48/day): **828 → 72/day**
- Scheduled checks: the issuance cycle runs as a deterministic 5-minute space action at **0 agent launches**
- Full issuance executions: only on new handoffs (guard, §1.2)

### 1.2 Bounded issuance-work check — live, three cases verified
Append-only work-check ledger + accounting action (migration 0066). Decides from committed processing state only, inside the existing poll lease; a "last triggered" value alone does not suppress unfinished work.
- **Case 1 (completed handoff skips): PROVEN live.** Handoff 50 was being re-invoked unconditionally every 5 minutes (observer runs 89–105 were no-op reprocesses, idempotent, 0 new rows). Guard stopped the loop at run 105; skips complete in ~1–2s.
- **Case 2 (new handoff processes once): PROVEN live.** Handoff 51 → exactly one issuance run (run 106: 0 issued / 8 abstained / 6 deferred), then skipped thereafter.
- **Case 3 (interrupted handoff recovers without duplicate issuance):** verified by builder decision tests (full server suite 149/149, incl. 14 new tests) + the production idempotency record. Deliberately NOT exercised by a live mid-processing kill.

### 1.3 First genuine issuance under the repaired freeze — run 88
Handoff 50 (discovery 132, completed 2026-10-20T22:59:14Z) → issuance run 88: **ISSUED 3 — PEPE, BAT, COMP, all Binance Spot longs**; 8 abstained (7 production_model_abstain + 1 new reason code `entry_outside_drift_zone`, PHA); 12 deferred (venue_mapping_unavailable). Broke a 36-run zero-issuance streak (runs 52–87). Full payload schema on all alert rows; venue evidence = Binance Spot aggTrades checkpoints with trade IDs and raw-response hashes. Decision instant for all three: 2026-10-20T22:59:12.577Z; discovery→qualification 146.9s, inside the 15-minute entry window.

**Delivery defect (corrected in the record):** terminal visibility was prompt (23:01:33–38Z, seconds after issuance), but chat delivery arrived 23:22:00Z — ~7m47s AFTER the entry window closed — because the delivery worker's render-to-send took 13.9 minutes. All three are recorded as **historical notifications, not actionable entries**, everywhere. Terminal visibility time is now stored separately from chat send time; late items carry a HISTORICAL flag (24 items total). The scoreboard item "a genuine opportunity reaches chat unattended inside its valid window" remains **UNPROVEN** — for the second time, the break was in chat delivery, not in discovery, qualification, or the terminal.

### 1.4 The three issued records — current lifecycle states
All Binance Spot, long, checkpoint contractState `entered`, 30-day cap 2026-11-19:
| Signal | Entry | Invalidation | Target 1 | Target 2 | State |
|---|---|---|---|---|---|
| PEPE paper_3dfb80cd81972e76d094849c | 0.00000457 | 0.0000041106 | 0.0000052591 | 0.0000057184 | OPEN |
| BAT paper_d3241369357fb372c0573415 | 0.1949 | 0.19028128 | 0.20182807 | 0.20644679 | OPEN canonically — see §1.5 |
| COMP paper_9ecb1be0f5e9779a49312ab5 | 26.11 | 21.04519075 | 33.70721387 | 38.77202312 | OPEN |

### 1.5 Monitoring pickup — completed; enrollment now automatic; one real outcome
The three positions were initially missing from the venue monitor (pickup was a separate manual step — an ops gap, now closed):
- **Automatic enrollment is live:** the monitor lane now discovers entered positions from the canonical records itself each run (append-only; venue-gated — non-Binance positions are logged `unsupported-venue` and never enrolled; idempotency proven: repeat runs add 0; field-for-field derivation from canonical records — it caught and corrected rounding in the manual append's target prices).
- **Actual coverage (from entry to 2026-10-21T02:18Z): complete for all three — 199 bars each, 0 gaps.**
- **PEPE:** no barrier touch — OPEN.
- **COMP:** no barrier touch — OPEN.
- **BAT: invalidation TOUCHED** — first touch bar 2026-10-21T01:08:00Z, low 0.1902 vs invalidation 0.19028128; 38 touch bars total, no target touches. Recorded as a late observation in monitoring. **Canonical settlement has NOT been appended** — the position remains OPEN in the canonical record until the settlement append runs through the established append-only path (see Proposal P6).

### 1.6 Venue verification — all 12 newly mapped assets
Mapping + evaluation resolution proven for all 12 (38 live mapping rows).
- **Binance (7: ALT, AMP, COMP, OSMO, PEPE, PHA, WLD): full chain works** — aggTrades evidence path, monitoring, same-venue outcomes. COMP/PEPE proven live in run 88; PHA proven at checkpoint (drift-abstained).
- **MEXC (5: BP, BR, DGAI, JCT, VEREM): chain BROKEN downstream.** All 26 production checkpoints name venue `binance-spot` — zero MEXC evidence has ever been recorded, so a qualifying MEXC candidate has no admissible evidence path today. The monitor fetches klines only from Binance regardless of a position's venue field, and the frozen rules bar proxy data from settling — so MEXC monitoring/settlement is broken as deployed. Venue identity IS preserved in every record.
- **Unmapped (6: BEAM, ARC, GRX, HASH, KNTQ, VENOM):** remain unmapped, research-visible only. BEAM note: Binance pair is in BREAK; MEXC trades it as **BEAMX** — a renamed-identity judgment, not made (Logan's decision).

### 1.7 BLOCKED-wall trace — the shared blocker decomposed
A trace of the 23 discovery-132 notification rows carrying one shared text ("issuance-validation UNKNOWN: no admissible post-decision price evidence (0 admissible interval(s))") found the two evidence systems never meet: the notification check counts *admissible intervals* from an interval store that nothing writes to (the 1m-kline producer has 0 exercises in 224+ observer runs; the market-data cache covers only 6 instruments; no MEXC interval producer exists), and its verdict was stamped at discovery time — **before** the candidates' decision instant, so post-decision evidence cannot exist at stamp time. The count is 0 **by construction**. Issuance instead validates on prints fetched on demand — venue ground truth confirms the first in-window trade IDs are exactly the cited ones.

Classification of the batch: **(a) actual invalidation: ZERO instances** (unreachable by construction in this batch). **(c) processing defect:** PEPE, COMP, BAT (issued on cited prints, still carried the BLOCKED verdict) + PHA (explicitly not invalidation: full-window Binance bars show low 0.0580 > invalidation 0.0577571). **(b) missing price coverage:** JCT, BR (MEXC pairs live; pipeline has no producer; their actual disposition was model abstain — the shared text was not even the deciding cause) + KNTQ, ARC (unmapped). For **18 of 23 rows** the shared text was not the deciding blocker at all.

**Display fix APPLIED + VERIFIED (display layer only; no gates/admissibility/contract changes; no stored rows rewritten):** zero legacy shared text remains across all 326 notifications; each row now shows its actual recorded reason (issued / abstain code / drift / mapping / awaiting issuance); MEXC + unmapped assets carry an explicit "UNSUPPORTED FOR FORMAL ISSUANCE — research only" label with opportunity and partial evidence still visible; HISTORICAL notification vs OPEN position verified simultaneously on the run-88 three.

### 1.8 "Database is locked" trace — verdict: BOTH
Run 131 (slot 1700 recovery) died on its final write at 2026-10-20T22:26Z. The store is SQLite (single-writer). In the failing ±60s, **five of our own writer lanes** land writes by stagger-grid design (entry-watch 1m tick, market-data refresh, an active issuance-cycle execution, the venue monitor's heavy lane, signal-status monitor), plus a concurrent build window. Our overlapping writes are a named, evidenced contributor; platform degradation (timeouts/overloads all evening) is a real amplifier. The specific lock holder at the failing instant is **UNKNOWN** (no lock-owner telemetry). Contention continues to be measured from existing logs inside the 48–72h evaluation (window: 2026-10-20 ~16:18 EDT → Oct 22–23).

### 1.9 Discovery recovery (P3) — final Oct-20 slot ledger, all terminal
1300 COMPLETED · 1500 EXHAUSTED (both attempts consumed; first dispatch provably never started under overload, second severed at the 120s ceiling) · 1700 EXHAUSTED (DB-lock final-write death) · 1900 COMPLETED (handoff 50 — the run-88 cohort) · 2100 COMPLETED_AFTER_RECOVERY (handoff 51; root failure was a null-id insert defect in an adjacent lane). Root constraint, measured: **a healthy discovery run takes ~101–113s against the 120s worker ceiling; any run needing a tier refresh (92–96s alone) exceeds it and dies mid-flight.**

**New recurrence (2026-10-21T02:56Z):** the 2300 slot silent-no-opped — 4-second "succeeded" run, no discovery run 135, no handoff 52 (second instance of this signature). The recovery watch classifies at +45m; failed slots stay recorded as coverage gaps; exhausted retries are not reopened.

### 1.10 AERO repository change — retry APPLIED + VERIFIED
The 2026-10-20 rollback is superseded: after GitHub's stats cache warmed, the retry applied cleanly (mapping `dromos-labs/metadex-public`). Dev now measures (3 commits/12w, subscore 35, was NO_DATA); coverage 0.85 → 1.0; AERO score 56; Change-1 labels byte-identical. **Preserved as rolled back in the record: the original failed attempt and its rollback.**

### 1.11 Working views (for the record)
Equity and crypto five-view journeys (Opportunities, Asset, Paper positions, Research, Diagnostics) are live and verified on both artifacts; research-shortlist-v0.1 live on crypto. Equity board carries known staleness honestly (e.g., BAC stale at 51.23 / 2026-10-16). One known gap: equity signal #49 (META long) has a proven MISS (−3.11%, 2026-10-19) that exists only in the paused grading pipeline; the artifact still shows it unresolved — fix is an append through the artifact's own verdict path (Proposal P7).

---

## PART 2 — DISCOVERY: A REDEFINITION AND A FIRST RESULT

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
Five layers, all outside the artifacts (small deterministic scripts; the 120s ceiling kills heavy in-artifact work):
1. **Event store** — one append-only line shape across streams (when / stream / who / asset / what / source ref). X done in v0; Telegram, Substack, paste.trade, market series get normalizers.
2. **Keep-current collectors** — append steps hitched to jobs that already run (sweep post-step; paste.trade snapshot; HL cache extended 6 → top ~50; daily ETF-flow/stablecoin rows).
3. **Baselines** — nightly recompute, dated/versioned, trailing-72h always excluded from the window it judges.
4. **Deviation engine** — daily, deterministic detectors (velocity, first-mention, silence, crowding, funding/OI extremes, correlation breaks, sector-laggard). Findings ledger with observed value, baseline, evidence refs.
5. **Pattern miner** — weekly: outcome backfill per finding (price at +24h/+72h/+7d), detector hit-rates, actor earliness (first-mention timing vs crowd), lead-lag stats, narrative lifecycle curves. Every pattern carries its n; small n is labeled hypothesis.

Surfaces: digest first; a terminal Research card only after the data proves worth displaying. Findings may feed theory candidates (existing approved direction) with evidence grades. **Findings do NOT touch issuance** — the frozen model keeps its lane unless separately approved.

---

## PART 3 — PROPOSALS AWAITING DECISION

- **P-T1-2 — Interval producer lane.** Whether to build a producer that writes admissible 1m intervals (the store the notification check counts). Admissibility-adjacent → expert question (Q13 below). The display defect it caused is already fixed honestly (§1.7); this is about whether the interval evidence form should exist at all.
- **P-MEXC — MEXC evidence + monitoring chain.** Build venue-specific trade-evidence and kline-monitoring paths for the 5 MEXC-mapped assets, or keep MEXC permanently research-only/unsupported for issuance. Currently labeled unsupported everywhere (§1.6, §1.7).
- **P5 — Veto audit via shadow evaluation.** The last full discovery run scored 16, passed 0, vetoed 14. Measure what the vetoes suppress (shadow-score suppressed candidates prospectively) without touching the live model — method question for the expert (Q12).
- **P-DISC — Discovery engine build.** Approve layers 1–5 of §2.3 as a research-lane build (no issuance contact). Includes the keep-current wiring and the stale-ledger refresh fix found in v0.
- **P-BEAM — BEAM → MEXC "BEAMX" mapping.** Renamed-identity judgment. Logan's call.
- **P6 — BAT settlement append.** Append BAT's settlement (invalidated, first touch 2026-10-21T01:08Z) to the canonical outcomes via the established append-only path (precedent: the two F2 settlements). Until appended, BAT stays OPEN.
- **P7 — META #49 verdict append.** Append the proven MISS through the equity artifact's own verdict path so the board stops showing it unresolved (§1.11).
- **P-T2-1 / P-T2-3 — Contention mitigations.** Move the venue monitor's phase off :25:40; add a bounded SQLITE_BUSY retry on the discovery terminal-status UPDATE only. (P-T2-2, the issuance freshness check, is done — §1.2.)
- **Feed-role deadline (Oct 23).** Every retained supplement answers a named research question or leaves the default view (adapter kept). Candidates for exit: OpenBB panels, unmapped Polymarket hints, social-chatter panels, crypto cycle/ratios. The discovery redefinition (§2) arguably re-scopes this review — input welcome.

---

## PART 4 — QUESTIONS FOR THE EXPERT

**Still open from the 2026-10-20 file** (forwarded yesterday; repeated here only as a checklist — the full text lives there): Q1 frozen-levels as-of alignment · Q2 cohort pooling · Q3 scanner spec scope · Q4 runtime criterion · Q5 receipt/UNKNOWN handling · Q6 barrier both-touched handling · Q7 HYPE id33 contract state · Q8 §6c scope (suppress-invalidated vs deliver-void-flagged) · Q9 Blockworks path · Q10 production-promotion verdict. **Second expert's agreement to the phase contract + NO_DATA standard is also still pending.**

**New questions from tonight:**

- **Q11 — Deviation as a research lane.** Is baseline/deviation measurement over attention and positioning series (mention velocity, first-mentions, silences, crowding) a legitimate research lane fully separate from the frozen trade model — and what discipline should govern detector thresholds so the lane doesn't become a narrative generator? Our guardrails so far: baselines exclude the judged window; every finding carries observed-vs-baseline numbers; findings are graded against later prices before any detector is trusted; small n = hypothesis.
- **Q12 — Veto quality measurement.** 14 of 16 scored candidates were vetoed in the last full run; over the measured window, strategy rejection was 47.5% of unique candidates. How should veto quality be measured without contaminating the frozen comparison — is prospective shadow-scoring of veto-suppressed candidates (recorded, never issued) the right instrument, and what would invalidate it?
- **Q13 — Interval evidence form.** Issuance validates on on-demand prints (verified against venue ground truth); the notification layer counts stored 1m intervals that nothing produces. Should an interval producer be built to make the two evidence forms agree — or should the interval form be retired as a display-only relic? What are the admissibility implications either way?
- **Q14 — Settlement authority for monitor-observed touches.** BAT's invalidation touch is proven from original-venue 1m bars under the frozen barrier rules, recorded as a late observation. Is appending the canonical settlement from monitor evidence the correct path (precedent: the F2 settlements), or should settlement require a checkpoint-path event?
- **Q15 — MEXC: build the chain or formalize research-only?** The 5 MEXC-mapped assets resolve at mapping and evaluation but have no admissible evidence or monitoring path. Is a venue-specific evidence build justified for assets of this tier, or should MEXC remain formally unsupported with the mapping rows serving research only?
- **Q16 — Attention findings as theory candidates.** Should deviation findings (e.g., a first-mention spike against a crowded short) be admissible as theory candidates with evidence grade C→B discipline — and if so, what outcome window and kill criteria should an attention-based hypothesis carry?

---

## Appendix — verification limits (unchanged honesty)
BAT is operational evidence of the issuance chain, not a successful confirmed-entry lifecycle (its chat delivery was late; §1.3). Case 3 of the issuance guard rests on tests + idempotency records, not a live kill. The DB-lock holder at the failing instant is unknown. Discovery v0 baselines rest on 3.67 days and cashtag-only extraction. The 48–72h coverage/timeliness evaluation closes Oct 22–23 and may amend §1.8.
