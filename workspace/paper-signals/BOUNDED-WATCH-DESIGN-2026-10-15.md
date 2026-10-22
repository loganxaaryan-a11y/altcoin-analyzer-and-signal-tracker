# Bounded Watch — Design (paper only)

**Date:** 2026-10-15
**Status:** DESIGN ONLY. Nothing installed. No cron created, no scheduler modified, no polling process started.
**Purpose:** Support the repair work (discovery, intended-model capture, entry/delivery). This is instrumentation feeding the *existing* qualification path — it must never become a second signal pipeline.

**Source of truth for gates:** deployed UI copy captured from the terminal UI on 2026-10-14 (tier/funnel panel text and discovery run 60 issuance bars), plus the scheduler draft spec `~/workspace/goals/research-terminal/paper-signals/scheduled-issuance-spec-draft-2026-10-13.md`. Deployed-code verification is **OWED** (see §1.6).

---

## 1. SCOPE

**Watch universe: T1 + T2 only = 42 assets** (2 T1 + 40 T2 as of 2026-10-14).

### 1.1 The gates, as evidenced from the deployed UI (2026-10-14)

**A. Weekly screener funnel:** "500 → T1 + volume or ≥15%/48H → full scoring." A 500-asset universe is filtered down; only two routes reach full 7-dimension scoring.

**B. Two routes into full 7-dimension scoring:**
1. **Volume path (T1):** "Non-velocity assets must be T1 and clear the volume path."
2. **Velocity path (any tier):** "A ≥15% move over 48 hours qualifies from any tier through the independent velocity path; its volume multiple is not consulted."

**C. T1 membership — three independent doors:** "T1 has three independent doors: active verified theory, open signal, or Graduation ≥70." Meeting ANY one door qualifies an asset as T1.

**D. T2 membership:** "top-40 volume among chart-passers." The 40 highest-volume assets that passed the chart gate, not currently T1.

**E. Issuance bars (from discovery run 60):** an asset that reaches full scoring can issue only if it clears **four bars: live-perp, freshness, market-cap, $5M consolidated spot-volume.** Issuance is gate-kept after scoring — scoring is not issuance.

### 1.2 What the gates actually check (stated plainly)

- **Live-perp bar:** the asset must have an active perpetual futures contract (i.e., a venue where a paper contract can reference a live mark price). It says nothing about trade quality.
- **Freshness bar:** input data (price/volume/factor reads) must be recent enough (observed 30-min freshness cutoff in the crypto terminal audit) — issuance on stale bars is blocked.
- **Market-cap bar:** minimum market capitalization — a liquidity/survivability filter.
- **$5M consolidated spot-volume bar:** at least $5M spot volume consolidated across venues — a fillability proxy.
- **Graduation ≥70:** the asset's cumulative scorecard score ≥ 70 admits it to T1 via door 3.
- **Active verified theory / open signal (doors 1–2):** qualitative/human-linked states the machine tracks — an existing machine theory that has survived verification, or a paper signal currently open.

**Tier membership is routing, not opportunity quality.** T1 says "this asset has enough standing to be scored"; T2 says "this asset is liquid enough to be watched." Neither says "this is a good trade." The 2026-10-14 deployed state had **only 2 T1 assets** — which, combined with the 2026-10-08 audit finding ("T1 = 3 assets, all depends on the velocity path; tiers went 38h stale"), is why this watch exists: to know, continuously and honestly, whether the watchable universe is even fresh.

### 1.3 The watch never re-decides tier membership

The watch reads tier state from the deployed terminals' existing stores. If the deployed tier labels go stale, the watch **flags staleness** (last-tier-refresh timestamp > 48h) as a health row — it does not recompute tiers, promote, or demote.

### 1.4 Out of scope, by construction

- No new scoring factors. No weight changes. No new thresholds (per standing rule).
- No flip alerts (dossier reads never issue trades; direction changes recorded for diagnosis only).
- No new whipsaw thresholds. Missing evidence stays UNKNOWN.
- Scores are factor agreement, never probabilities — the watch stores deltas and timestamps, not win-probability language.

### 1.5 Equity vs crypto cadence

Crypto: 24/7. Equity: watch ticks run but equity rows are evaluated only during US regular-session hours (09:30–16:30 ET) plus one pre-market staging check, matching the entry-v1 contract (equity fills on the next session's open print). Overnight equity rows are held, not evaluated.

### 1.6 Deployed-code verification — OWED

`tool_search.load_tool_namespace(["artifact"])` was attempted once on 2026-10-15 and returned no loadable artifact namespace (confirmed: subagent seats have no artifact tool access, no CLI, no skill). Therefore **none of the gates above were verified against deployed code.** Each gate in §1.1 is cited to deployed-UI copy / the discovery run 60 output / the 2026-10-08 audit — all of which describe the deployed build second-hand. Before any install: an eligible seat (parent/root) must name the deployed functions and files for: the T1 three-door check, the volume path check, the velocity path check, the issuance-bar check (live-perp, freshness, market-cap, $5M volume), and the full-scoring trigger. Until then, gates are taken on deployed-UI evidence, not proven.

---

## 2. LIGHTWEIGHT LOOP

### 2.1 The 30-min cycle (steady state)

One cycle every 30 minutes (aligned to existing cadence conventions), doing only this per T1+T2 asset (42 rows):

1. **Read** the latest price and volume from the existing refresh caches (§3.2) — zero new external API calls in steady state.
2. **Compute deltas** locally against the asset's last dossier-read baseline: % move since last dossier read, volume vs trailing 48h baseline, distance to any tracked entry/invalidation level.
3. **Compare** against the trigger set in §2.2.
4. **Write** one append-only row (§5) per asset per cycle: timestamp, price, volume, deltas, trigger status (none/fired + which).
5. **Health check:** if the asset's underlying refresh data is stale (>45 min since last successful market-data refresh for crypto; >15 min into session for equity), write `stale_input` instead of deltas — never synthesize.

Runtime target per cycle: **under 2 minutes**, local compute only. Process exits after writing; no resident polling.

### 2.2 Trigger set — precise definitions

A deeper dossier analysis (the terminal's existing dossier path, manual-equivalent read) is triggered for an asset **only** when one of these is true:

**(a) Meaningful change — exactly one of:**

- **A1. Price drift:** |% move since the asset's last dossier read| **≥ 8%** (crypto). Set below the 15%/48h velocity-path bar so the dossier can weigh in *before* the bar trips — the watch's job is early notice, not post-hoc confirmation.
- **A2. Volume surge:** trailing-24h volume **≥ 3× the trailing-48h baseline** (48h baseline = the 48 hours preceding the current 24h window; baseline recomputed from cached hourly bars only).
- **A3. Level breach:** a **close beyond** a tracked entry or invalidation level (any of the asset's open/watched levels) — intraday pierces that close back inside do not count. Level set = exactly the levels on the asset's current dossier/pilot candidate rows; the watch never invents levels.

Equity note: A1–A3 evaluated only in-session; overnight moves are folded into the first in-session evaluation against the last dossier-read baseline.

**(b) Eligible setup per the existing qualification path:** the asset reaches the qualification path through the *existing* deployed logic (velocity-path trip, volume-path clearance, or dossier-issued qualification) — the watch notes the event and pulls the freshest dossier read. The watch does not qualify; the deployed qualification logic qualifies, as it does today.

**(c) The user's explicit request:** Logan names an asset (in either chat) → next watch cycle pulls its dossier read regardless of triggers. This is the manual override and also the path for any dossier read that would need Finnhub/AlphaVantage keyed data (keyed APIs remain on-demand-only per his standing rule; the watch never fires them itself).

### 2.3 What the trigger does NOT do

- It does not issue. It does not create a paper contract. It does not reset any entry window or expiry.
- It does not change any score, weight, threshold, or tier.
- Trigger-firing rows are timestamped observations (§5); downstream, they are **inputs** to the existing dossier/qualification path, nothing more.

---

## 3. BUDGET FIRST

### 3.1 Incremental budget table

Steady-state design: the watch is a **reader of existing refresh outputs**, not a new fetcher. Every price/volume input it needs is already refreshed by lanes that run today.

| Row | Item | Per 30-min cycle (42 assets) | Per day (48 cycles) | Notes |
|---|---|---|---|---|
| 1 | New external API calls (steady state) | **0** | **0** | Reads existing caches/DB rows only |
| 2 | Local DB/cache reads | 42 rows × ~4 fields | ~2,016 reads | Negligible |
| 3 | Local compute (deltas, trigger compare, write rows) | < 2 min wall time | ~96 min CPU spread | One process per cycle, exits |
| 4 | Elfa scheduled calls | 0 | **0** | Elfa ~10/day budget untouched |
| 5 | altFINS credits | 0 | **0** | 1,000/mo free budget untouched |
| 6 | CoinMarketCap keyless calls | 0 | **0** | IP rate-limit untouched |
| 7 | CoinGecko free-tier calls | 0 | **0** | Untouched |
| 8 | Finnhub / AlphaVantage (keyed) | **0 — forbidden** | **0 — forbidden** | Standing rule: keyed APIs on-demand only, never scheduled |
| 9 | Triggered dossier re-reads (free sources only) | 0–N | bounded by §3.3 | Only on §2.2 trigger; dossier path's own budgets apply |
| 10 | T3/T4 mover surveillance | 0 | **0** | Reads the existing 6h discovery handoff output (§4) |

**Total daily incremental cost: 0 new API calls, 0 credits, $0 out-of-pocket.** The watch's only footprint is local compute (~96 min/day spread across 48 short-lived processes) and append-only rows (~2,016 rows/day, each small — ~1–2 MB/day, pruneable).

### 3.2 Reused refreshes (name them)

1. **`crypto-market-discovery` (6h, heavy)** — the existing screener: 500-asset funnel, volume baselines, velocity-path trips. The watch reads its output for T1/T2 price/volume baselines and for T3/T4 mover flags (§4). *Reused, not duplicated: the baselines the watch needs (48h trailing volume, 48h % move) are exactly what the discovery run computes.*
2. **Crypto terminal market-data refresh (~15m; 9:53 PM refreshes observed 2026-10-14)** — the terminal's own price/volume refresh lane. The watch reads its cache for per-cycle prices. *Reused: freshness bar data already lands here; a second price fetcher would double rate-limit pressure on the same providers.*
3. **Equity 15-min price-refresh lane** — the equity terminal's existing refresh. The watch reads its cache for equity prices/volumes in-session. *Reused for the same reason as (2).*
4. **`paper-discovery-handoff` (6h)** — hands discovery output to the paper lane. The watch reads the handed-off rows for velocity-path and tier-state, rather than recomputing membership. *Reused: tier state is the terminal's job, not the watch's (§1.3).*

### 3.3 Duplicated reads — there are none, and why

The design intentionally duplicates **nothing**. The alternative (a watch-side fetcher for price/volume) would:
- double the request rate against CoinGecko free-tier / CMC keyless IP limits already shared with lanes (2)–(3);
- create two divergent "latest price" values for the same asset (the freshness-bar audit already proved divergent caches cause wrong levels);
- violate the standing budget rule (keep builds lean; keyed APIs on-demand only).

**If reuse turns out impossible** (e.g., the market-data refresh cache is not readable from the watch worker's seat), the design must change to scheduled-batch reads with an explicit budget line, and the parent must approve the new cost — do not silently duplicate.

### 3.4 Worst-case cost if triggers fire heavily

Bounded anyway: a dossier re-read triggered by the watch uses only the dossier path's existing free sources (same stack the audit verified: CoinGecko, Hyperliquid/OKX, DeFiLlama, GitHub, altFINS pre-computed indicators within the 1,000/mo free budget, Elfa within its ~10/day scheduled allocation). If trigger volume would exceed those, the watch **queues and caps**: max 10 triggered re-reads/day (Elfa's scheduled ceiling is the binding constraint); overflow rows are recorded as `trigger_deferred` with the trigger timestamp preserved for diagnosis — the same defer-never-drop posture as the pilot watcher's poll-budget rule. Keyed APIs (Finnhub/AlphaVantage) stay at zero by rule.

---

## 4. T3/T4 — LIGHTWEIGHT MOVER SURVEILLANCE ONLY

- T3/T4 assets are **not watched on the 30-min loop.** The only T3/T4 treatment is mover surveillance riding on the existing 6h discovery output: when a discovery run flags a ≥15%/48H mover (the velocity path), the watch writes one detection row: `{asset, timestamp, move_48h, tier_at_detection, via: "discovery-6h"}`.
- **No new paid calls** for T3/T4 — surveillance consumes data the 6h discovery already fetches.
- **Explicit statement:** detecting a mover after it moved (e.g., BTW +27.7%/48H, the missed-opportunities case from 2026-10-13) is **detection, not early prediction and not comprehensive coverage.** A detection row says "this moved, we saw it at the next 6h scan" — it says nothing about whether the move was predictable, whether similar movers were missed between scans, or whether the machine would have issued on it. Do not present detection rows as coverage statistics; the runner-recall gap (0/11 in the 2026-10-08 audit) is measured separately and stays separate.
- T3/T4 detection rows are **surveillance-only**: they do not feed the qualification path (velocity-path qualification remains the deployed discovery logic's job, as today). They exist so missed-opportunity analysis (§5 histories) can ask "did the watch see it?" without conflating sight with prediction.

---

## 5. DOSSIER HISTORY — APPEND-ONLY

Per asset (T1/T2), an append-only log:

```
{ asset, ts, price, volume_24h, volume_48h_baseline,
  move_since_last_dossier_read_pct, trigger: none|A1|A2|A3|B|C,
  input_freshness: ok|stale_input, tier_snapshot: T1|T2, notes }
```

- **Append-only:** rows are never updated or deleted. Corrections are new rows. (Same posture as the pilot SQLite store: durable rows, no in-memory registry.)
- **Explicitly forbidden:** flip alerts (no "signal reversed" notifications — dossier reads never issue trades, direction changes are recorded for diagnosis only, per standing rules), new whipsaw thresholds, re-scoring, probability language. A row that records a direction change carries the tag `diagnosis_only`.
- Missing evidence stays UNKNOWN — if a cycle cannot compute a delta (stale input, missing baseline), the row says `unknown`, never interpolates.
- Retention: rows are small; keep 90 days hot, archive beyond. Pruning never rewrites history.

---

## 6. FEED, DON'T ISSUE

Watch outputs feed the **existing qualification path only, as refreshed inputs**. Concretely:

1. **The watch writes observations, never decisions.** Its output schema (§5) contains no entry price, no direction call, no contract fields, no expiry — there is nothing in a watch row that an issuer could act on without the full qualification path running first.
2. **No issuance imports.** The watch worker's code must not import or reference `recordSignal`, `issueGeneratedSignalCandidate`, `runpapersignalcycle`, or any production issuer. This is enforced structurally, not by convention.
3. **No entry-window writes.** The watch never creates paper contracts, never sets `decisionAt`, never resets expiry or `nextReassessmentAt`. Those fields belong to the qualification/issuer lanes (`paper-signal-cycle`, pilot watcher) — write-access is restricted to those lanes' stores.
4. **Acceptance gate (pre-install):** mirror the scheduled-issuance draft's "read path provably cannot issue" proof — a static test asserting the watch worker contains no issuance call, plus a deployed dry run showing ≥1 full 30-min cycle producing observation rows and zero issuance rows. Deployed evidence or it isn't done (2026-10-12 verification bar).
5. **Alert surface:** watch rows are queryable for diagnosis (missed-opportunity analysis, staleness flags). They do **not** feed `paper-signal-alert-delivery` (15m sweep) or any chat alert path. Trigger-fired dossier re-reads surface through the dossier's existing surface only.

---

## 7. INSTALLATION BLOCKED UNTIL — checklist

- [ ] **User approves this design + the budget** (total daily incremental cost: 0 new API calls, 0 credits, $0; §3.1).
- [ ] **Deployed-code gate verification completed** (§1.6): an eligible seat names the deployed functions/files for the T1 three-door check, volume path, velocity path, issuance bars (live-perp, freshness, market-cap, $5M consolidated spot-volume), and full-scoring trigger. Do not install against UI-copy evidence alone.
- [ ] **Read-access to the reused refresh caches confirmed** (§3.2): crypto market-data refresh cache, equity 15-min refresh cache, 6h discovery output, discovery handoff rows. If any cache is unreadable from the watch seat, redesign the budget (§3.3) and re-approve before installing.
- [ ] **Enforcement proof delivered** (§6.4): static no-issuance test + deployed dry-run cycle with observation rows and zero issuance rows.
- [ ] **Cron/schedule ownership assigned by the user** — schedule changes stay his call (standing boundary); the install proposes the exact 30-min interval spec but does not create it until he names the slot.
- [ ] **Expert-loop check**: if the expert loop is still open, the expert gets the design for review before install (his override makes expert repair instructions directly actionable, but a *new* install is not a repair instruction — it needs his word).
