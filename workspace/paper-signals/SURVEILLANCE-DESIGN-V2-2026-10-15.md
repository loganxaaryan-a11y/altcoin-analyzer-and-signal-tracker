# Surveillance — Design V2 (paper only)

**Date:** 2026-10-15 · **Status:** DESIGN ONLY. Nothing installed. No cron created, no polling process started, no delivery enabled.
**Scope:** Extends the SAME pipeline — detection → evidence → setup → confirmed entry → alert → measured outcome. It is instrumentation and surfacing on the existing qualification path. It must never become a second signal pipeline.
**Method frozen:** nothing here changes any frozen method, score, weight, threshold, or qualification cadence. Faster monitoring never changes decision rules (stated explicitly in §1.7).

---

## 0. MEASUREMENTS (taken from this seat, 2026-10-15 ~01:0x ET)

Every number below was measured by this seat with curl/python. Anything not measurable is marked **OWED** with the exact verification step.

| # | Item | Measured value |
|---|---|---|
| M1 | Binance.US batched `/ticker/24hr?symbols=[42]` (compact JSON, no spaces) | HTTP 200, **1.01 s** (observed range 1.0–2.4 s), 21.7 KB, **40 request-weight per cycle**. **Coverage note:** a successful 42-symbol batch proves the venue serves those 42 symbols — it proves NOTHING about terminal coverage. The only coverage proof is the §1.3 mapping diff (must be empty) |
| M1a | Exchange calendar authority for US session hours | **OWED** — NYSE trading calendar (early closes; half sessions). Not verified from this seat |
| M2 | Binance.US rate limits (from `exchangeInfo.rateLimits`, measured) | REQUEST_WEIGHT **6000/min**; RAW_REQUESTS 300000/5min |
| M3 | Single `/ticker/price?symbol=BTCUSDT` | HTTP 200, 1.23 s, weight 2 |
| M4 | `/aggTrades?limit=1` last-trade staleness (overnight, thin session) | BTC 18.4 s, ETH 5.8 s, SOL 33.6 s (includes ~1–2.2 s network RTT); 42-symbol median **17.5 s**, min 14.6 s |
| M5 | `/klines?interval=5m&limit=50` single asset | HTTP 200, 2.02 s, 8.1 KB |
| M6 | Server time skew (`/time` vs local) | ≈ RTT/2 (≈1.4 s); clocks effectively synced |
| M7 | Encoding gotcha (implementation note) | `symbols=[...]` with **spaces** after commas → HTTP 400 `Illegal characters`. Must use compact JSON (`separators=(',',':')`). This was the author's bug, not a server limit — 42 symbols batch fine once compact |
| M8 | MATICUSDT on Binance.US | **status BREAK** (halted) — **verified via `/api/v3/exchangeInfo` `symbols[].status` (2026-10-15: `MATICUSDT → BREAK`, `BTCUSDT → TRADING`)**. Instrument status comes from exchangeInfo ONLY; ticker responses do not carry it. The loop must exclude non-TRADING pairs at each cycle; a batch that blindly includes BREAK pairs returns them with stale prices (MATICUSDT last trade ~45 days old) |
| M9 | fxtwitter v2 profile timeline `GET /2/profile/{handle}/statuses` | HTTP 200, **1.44 s**, 23 results (`cobie`); suspended handle (`ansem`) → HTTP 404 `{"code":404,"results":[]}` — clean error path |
| M10 | fxtwitter status endpoint `GET /{handle}/status/{id}` | HTTP 200, **0.76 s**, verified live on real tweet `940747700865187840`: full `text`, `created_at` + `created_timestamp`, `author` block (followers, joined), likes/retweets/replies/views, `replying_to`, `raw_text` |
| M11 | Sweep infrastructure already present | `~/workspace/x-sweep/v2/sweep.py`: keyless fxtwitter v2 loop over `accounts.json`, 1 s politeness delay, MAX_PAGES=10, watermark/cutoff resume, runs in `~/workspace/x-sweep/v2/runs/` — cron `x-smart-sweep` (interval 8h). **The 8 h sweep is third-party FxTwitter access (not official X API); an 8 h cadence cannot support breaking-news timeliness — background sweep for discovery/context only** |
| M12 | Stooq intraday 5-min CSV from this seat | **BLOCKED** — JS proof-of-work browser challenge (HTTP 200 but challenge page). No curl-usable intraday equity feed verified → equity intraday is OWED (§6) |
| M13 | Existing cadences (from `cron.list`, read-only) | `crypto-market-data-refresh` 5m (args: **BTC, ETH, SOL only**), `equity-market-data-refresh` 15m, `crypto-market-discovery` 6h, `paper-pilot-watcher` 5m (VM tick, DB-only — no ingest), `paper-signal-alert-delivery` 15m, `x-smart-sweep` 8h, `terminal-morning-brief` daily 09:00 |

**Feed-delay framing (honest):** for a REST-polled loop the event-to-receipt delay = network RTT (~1 s) + up to one cadence of staleness (a 5 m cadence sees data on average 2.5 min old) + per-symbol trade staleness (M4: median 17.5 s overnight; thinner symbols up to ~40 s; expect tighter in session). The loop's effective resolution is bounded by its cadence; it is NOT tick data.

---

## 1. T1/T2 SURVEILLANCE (42 assets)

### 1.1 The loop

- **Cadence:** one cycle every **5 minutes** for crypto (24/7), aligned to the existing `crypto-market-data-refresh` (5m) convention. **Effective resolution:** 5 m cadence is NOT 5-min timeliness — see the event-to-alert delay decomposition below. The task asked for 1–5 min "where existing access and budgets support it": at **40 weight/cycle** against a 6000/min cap, even 1-min cadence is 40 weight/min = **0.67% of budget** and is technically supported. **Recommendation: 5 m default** — the pilot watcher already ticks at 5 m, alert delivery sweeps at 15 m, and no downstream consumer reads faster than 5 m. 1 m cadence is approved-by-measurement but not needed; it adds no decision value today.
- **Event-to-alert delay decomposition (the "1–5 min" capability, honestly stated):** for a REST-polled loop the delay from market event to any downstream action = **network RTT** (~1 s, M1) **+ cadence staleness** (up to one full cadence: 5 m on this loop, i.e. on average the data is 2.5 min old) **+ per-symbol trade staleness** (M4: median 17.5 s overnight; thinner symbols up to ~40 s; tighter in session) **+ downstream sweep lag** (the alert-delivery sweep runs 15 m; delivery marks only on chat ack, so a trigger can sit up to 15+ min before delivery is even attempted). There is no path in this design that beats this decomposition; any "1–5 min" phrasing elsewhere in this doc must be read against it.
- **Per cycle (measured design):**
  1. **One batched call:** `GET /api/v3/ticker/24hr?symbols=[42 USDT pairs]` — M1: 1.0–2.4 s, weight 40. Returns `lastPrice`, `priceChangePercent`, `quoteVolume`, `volume`, `closeTime`, `openTime` per asset.
  2. **Local compute:** deltas vs each asset's last dossier-read baseline (% move since dossier read, 24h quoteVolume vs trailing-48h baseline from the 6h discovery output), distance to tracked entry/invalidation levels.
  3. **Trigger compare** against §1.4 (same trigger set as the 2026-10-15 bounded-watch design).
  4. **Write one append-only row per asset** (schema §1.6); exit. No resident polling.
- **Runtime per cycle (measured):** ~1–2.5 s fetch + < 10 s local compute for 42 rows → **< 30 s wall per cycle**, well inside the 5 m budget. klines are NOT fetched in the loop — only for trigger-fired assets (M5: 2.02 s each), bounded by the same cap as the bounded-watch design (max 10 triggered re-reads/day, overflow = `trigger_deferred`).

### 1.2 Reused refreshes (named) vs incremental budget

| Existing lane | What the watch reuses | Why it doesn't cover the loop |
|---|---|---|
| `crypto-market-data-refresh` (5m) | BTC/ETH/SOL prices (3 of 42) | args are exactly `["BTC","ETH","SOL"]` — 39 assets uncovered |
| `crypto-market-discovery` (6h) | 500-asset funnel, 48h trailing volume baselines, velocity-path trips | 6h cadence — not 5m surveillance |
| `paper-discovery-handoff` (6h) | tier state (T1/T2 membership), handed-off rows | tier state only, not prices |
| `equity-market-data-refresh` (15m) | equity prices/volumes in-session | 15m, equity only |
| `paper-pilot-watcher` (5m) | nothing — it processes existing DB rows (no ingest) | different remit; the surveillance loop must not touch its store |

**INCREMENTAL budget (the new cost, beyond everything already running):**

| Item | Per cycle | Per day (5m cadence, 288 cycles) |
|---|---|---|
| Binance.US batched calls | 1 call (weight 40) | **288 calls** |
| Request weight | 40 | **11,520 weight** (0.67% of the 6000/min cap at burst; no daily weight cap exists) |
| Elfa / altFINS / CMC keyless / CoinGecko / keyed APIs (Finnhub, AlphaVantage) | 0 | **0** (untouched; keyed APIs remain on-demand only per Logan's standing rule) |
| Local compute | < 30 s wall | ~144 min spread across 288 short-lived processes |
| Append-only rows | 42 rows | ~12,096 rows/day (~3–6 MB/day, pruneable after 90 days hot) |
| **Out-of-pocket cost** | — | **$0** |

At 1 m cadence (if ever chosen): 1,440 calls/day, 57,600 weight/day — still trivially within the weight cap, but not needed today.

### 1.3 Asset list — the venue-mapping gate (HARD INSTALL GATE)

**OWED — exact T1/T2 asset→venue-symbol mapping (42 rows).** This seat cannot read the deployed artifact's tier store (no artifact tool access, confirmed 2026-10-15). The mapping artifact to be produced is **`T1T2-VENUE-MAPPING-<YYYY-MM-DD>.json`**: 42 rows of `{ terminal_asset, venue_pair, quote_asset, status_at_export }`, where `status_at_export` is taken from the deployed terminal's instrument store (or a same-day `exchangeInfo` read) — never from a ticker batch.

**Why a hard gate:** a successful 42-symbol batched ticker response proves the venue serves 42 symbols. It proves **nothing** about whether those 42 symbols are the terminal's actual T1/T2 membership — asset-level mismatches (wrong asset on the same pair, renamed symbols, delisted pairs substituted silently) would pass a batch test and fail only at the diff. Venue coverage ≠ terminal coverage.

**Verification step (install checklist, mandatory):** an eligible seat exports the deployed T1/T2 asset→pair mapping (42 rows) from the deployed tier state (via the existing `paper-discovery-handoff` rows / discovery output). The surveillance list is diffed against that export, row by row; **the diff must be empty before install.** A non-empty diff blocks install — it is a wrong-universe install, not a warning. The loop reads the tier list from the deployed tier state at install time; it never hardcodes tiers and never recomputes membership.

**Status gate:** the export's status check is authoritative via `exchangeInfo` `symbols[].status` only (per M8) — any row not `TRADING` is written `pair_unavailable` from cycle one, never probed for price.

### 1.4 Trigger set (unchanged from the 2026-10-15 bounded-watch design, plus new observation-only trigger classes A0 and A1b — no frozen threshold, score, weight, or qualification rule altered)

- **A0. Level proximity (NEW trigger class, observation only):** an asset's last print is within **x% of a tracked entry or invalidation level** (levels exactly as on the asset's current dossier/pilot rows; the watch never invents levels). A0 is an early-notice class: it arms the A3 close-beyond check and is the ONLY route that fetches level-check klines. Parameter **x is OWED** (design parameter, not a frozen rule — set at install spec, not invented at runtime).
- **A1. Price drift — LARGE-MOVE DETECTOR ONLY:** |% move since last dossier read| ≥ 8% (crypto) — set below the 15%/48h velocity bar so the dossier can weigh in before the bar trips. **A1 detects large moves only.** It would NOT have tripped on a ~2.4% move (e.g. tonight's ~2.4% BTC move would pass unseen) — anything subtler needs the A0/A1b classes below.
- **A1b. Volatility-relative move (NEW trigger class, observation only):** |% move since last dossier read| ≥ **k × recent ATR (or recent realized volatility)**. Large-but-normal movers on a high-volatility asset and small-but-anomalous movers on a dead asset are different evidence; A1b is the class that sees the latter. ATR window, volatility window, and parameter **k are OWED** (design parameters, not frozen rules — set at install spec). A1b fires independently of A1.
- **A2. Volume surge:** (i) **ticker path** — rolling-24h volume ≥ 3× trailing-48h baseline (baselines from the 6h discovery output), from the batched `/ticker/24hr` fields; (ii) **burst path** — when (i) crosses 2× OR an A0/A1/A1b row exists for the asset, fetch **`GET /api/v3/klines?interval=5m&limit=24`** (the last **24 CLOSED 5-min candles**, ~2 h window; the forming candle is fetched and **discarded**) and check the last-N-candle volume against the N-candle share of the 48h baseline. Burst threshold **k₂ is OWED** (design parameter, not a frozen rule). klines are fetched per triggered asset only — never in the main loop (M5: 2.02 s each; same max-10-triggered-reads/day cap as the bounded-watch design, overflow = `trigger_deferred`).
- **A3. Level breach:** **a CLOSED 5-min candle close beyond a tracked entry/invalidation level** — breach requires a completed candle; the forming candle never counts. Fed by **`GET /api/v3/klines?interval=5m&limit=2`** (latest closed + forming; forming discarded), fetched only for assets with a live A0 row or an A1/A1b trip. Levels exactly as on the asset's current dossier/pilot rows; the watch never invents levels.
- **B. Eligible setup per existing qualification path:** velocity-path trip / volume-path clearance / dossier-issued qualification — the watch notes the event and pulls the freshest dossier read.
- **C. Logan names an asset** → next cycle pulls its dossier read (keyed APIs still on-demand only).
- **What triggers do NOT do:** no issuance, no paper contract, no entry-window writes, no score/weight/threshold/tier changes. Trigger rows are timestamped observations only, inputs to the existing dossier/qualification path. A0 and A1b are trigger CLASSES — observation only; adding them changes no frozen threshold or qualification rule.
- **Dead-pair rule (from M8):** instrument status comes from the **`exchangeInfo` `symbols[].status` field ONLY** — never from a ticker response (ticker responses do not carry a status field; a batch response that includes a BREAK pair returns it with a stale price, and that must never be read as `TRADING`). The loop caches the exchangeInfo status map and refreshes it every 6 h (aligned with the discovery cadence), plus an on-demand re-check whenever a pair first shows `pair_unavailable`. Any pair not `status==TRADING` is written as `pair_unavailable`, never as a price. The MATICUSDT/BREAK example stands, with exchangeInfo as the authority.

### 1.5 Health / staleness

If an asset's underlying data is stale (no successful market-data read > 45 min for crypto; > 15 min into session for equity), the row carries `stale_input` — never synthesized deltas. If the deployed tier labels go > 48 h without refresh, the watch writes a **health row** flagging staleness; it does not recompute tiers.

### 1.6 Append-only row schema (per asset per cycle)

```
{ asset, pair, ts_cycle, price, quote_volume_24h, volume_48h_baseline,
  move_since_last_dossier_read_pct, trigger: none|A0|A1|A1b|A2|A3|B|C|pair_unavailable|stale_input,
  input_freshness: ok|stale_input, tier_snapshot: T1|T2, tier_list_version,
  klines_source: none|ticker24h|klines5m_limit24|klines5m_limit2,
  notes }  # direction changes carry the tag diagnosis_only; never alert copy
```

Corrections are new rows; nothing is updated or deleted. Missing evidence stays `unknown`. Scores are factor agreement, never probabilities.

### 1.7 FROZEN-CADENCE PRESERVATION (explicit attestation statement)

**Faster monitoring never changes decision rules.** The surveillance loop's cadence (5 m) is an observation cadence only. Qualification cadence, entry windows (15 m crypto), the 30-min freshness cutoff, expiry/veto semantics, and all frozen thresholds remain exactly as frozen (v2.1.x). A trigger firing does not accelerate any decision clock; the qualification path runs on its own schedule when a trigger row feeds it fresh inputs. This attestation must be re-signed at install time by whoever wires the loop.

---

## 2. BROADER MOVER SURVEILLANCE (T3/T4: upward movers only via 6h discovery — NO downside path; T1/T2: both directions via the 5 m loop)

### 2.1 What the loop covers

- **T1/T2 (42):** 5 m loop, §1 — both directions (A0/A1/A1b/A2/A3 are sign-agnostic; dumps and pumps both trigger).
- **T3/T4:** mover surveillance rides the existing **6h `crypto-market-discovery`** output — zero new calls. When a discovery run flags a ≥15%/48H mover, the watch writes one detection row: `{asset, timestamp, move_48h, tier_at_detection, direction, via: "discovery-6h"}`. **Limitations, stated explicitly:** (1) a 6 h cadence means detection lags the move by up to 6 h plus trade staleness — a move that starts just after a scan is not seen until the next scan; (2) the discovery velocity path **trips on UPWARD moves only** (`48h ≥ +15%` velocity qualifiers per the scan code refs — `source-resolution-2026-10-13.md`; every verified velocity qualifier in the runner-recall audit is an upward pump). **Downward moves on T3/T4 are NOT detected by this route — there is no downside discovery path, and no downside detection may be claimed for it.** These rows are surveillance-only; they do not feed the qualification path (velocity-path qualification remains the deployed discovery logic's job).
- **Downward moves:** covered on the same terms as upward moves **only inside the 5 m T1/T2 loop** — every trigger and detection row there is direction-signed. A −20% T1 dump trips A1/A2/A3 exactly like a +20% pump. Outside that loop (T3/T4 via discovery), downside moves are invisible to the watch — state that in the UI, not in a footnote.

### 2.2 Explicitly exported: UNSUPPORTED COVERAGE

The loop **cannot see** (state this in the UI, not in a footnote):
1. Assets with **no Binance.US spot listing** (e.g. ZRO, WAL, BTW, PRL, Q, PONS, UMXM, DEEP, TRUTH — the UNIVERSE-v1.0.0 exclusion list). Venue-mismatch is permanent for the paper program; a runner on another venue is invisible here.
2. Pairs in **BREAK/halted status** (M8: MATICUSDT) — written `pair_unavailable`, never interpolated.
3. **Intraday equity moves** outside the 15 m equity refresh cache and outside market sessions (§6).
4. Moves **between 5 m cycles** on illiquid pairs whose trade staleness exceeds the cadence (M4) — the loop reports the last print, honestly timestamped.
5. Anything before the first successful cycle — no backfill, no reconstruction (same NEVER-BACKFILL posture as the decision-time input store).
6. **Downside moves on T3/T4** — the 6h discovery route trips on upward velocity only; a T3/T4 dump has no detection path in this design (5m sign-agnostic triggers exist only for T1/T2).

### 2.3 Plain statement (required UI copy)

> The +15%/48h velocity route is a **qualification gate**, not early detection. A detection row means "this moved; we saw it at the next scan" — it says nothing about whether the move was predictable, whether similar movers were missed between scans, or whether the machine would have issued on it. **Do not describe the velocity route as early detection or as downside coverage: it trips on upward moves only and lags them by up to 6 h.** Runner-recall gaps are measured separately (0/11 in the 2026-10-08 audit) and stay separate.

---

## 3. X USAGE — third-party FxTwitter access (not official X API)

All X content in this design is read through **third-party FxTwitter access (not official X API)**. That distinction must appear in every summary, header, and alert-copy mention of X access — including the §5.2 card labels.

### 3.1 Endpoints verified from this seat (2026-10-15)

| Endpoint | Verdict |
|---|---|
| `GET https://api.fxtwitter.com/2/profile/{handle}/statuses` (v2 timeline, paginated) | **VERIFIED LIVE** — 1.44 s, 23 results for `cobie`; suspended handle → clean HTTP 404. The existing `x-smart-sweep` (8h, `~/workspace/x-sweep/v2/sweep.py`) already runs this keyless with 1 s politeness delay and watermark resume. |
| `GET https://api.fxtwitter.com/{handle}/status/{id}` (v1 embed) | **VERIFIED LIVE** — 0.76 s on real tweet `940747700865187840`: full text, `created_at` + `created_timestamp`, author block, engagement counts, `replying_to` |
| X official API | Not available keyless from this seat — **no account, no key, no cost basis to design against** |
| Nitter / xstalk / xcancel mirrors | **DEAD** (verified 2026-10-10) — do not design against |

**Quotas/costs:** keyless, no documented quota; the sweep's politeness discipline (1 s between accounts, MAX_PAGES=10, watermark cutoffs) is the rate protection. The sweep's own rule stands: if MANY accounts 404 at once, the v2 endpoint is down — report plainly, don't deliver thin.

**Breaking-news timeliness — EXPLICITLY OUT OF SCOPE:** the existing `x-smart-sweep` runs on an **8-hour cadence**. An 8 h cadence cannot support timely breaking-news surveillance, period: a catalyst post can sit unread for up to 8 h before the next sweep sees it, and per-post reads are on-demand only. The sweep is a **background discovery/context layer** — caller-ledger building, advance-call capture, macro context — never a breaking-news wire. Do not imply, in copy or placement, that X coverage here is timely; X-candidate rows on UI cards (§5.2) carry the sweep's staleness window plainly.

### 3.2 Capture schema (per X claim row)

```
{ post_id, post_url, handle_at_retrieval, author_user_id,
  posted_at_utc, retrieved_at_utc,
  post_text (verbatim, untrimmed), asset (resolved ticker, or null),
  claim (one sentence), direction (long/short/neutral/none),
  conditions (entry/invalidation levels stated, or null),
  horizon (stated holding window, or null),
  is_retweet (bool), retweet_of (original author or null),
  claim_class: advance_call | after_move_commentary | macro_context | position_update,
  primary_source_catalyst_verified: true/false/unverifiable,
  contemporaneous_chart_volume: {checked: bool, supports: supports/contradicts/neutral},
  disagreement_with: [other claim ids], disagreements_recorded: bool,
  grade_outcome: hit | miss | ungradable, graded_at (nullable) }
```

### 3.3 Rules

1. **Advance calls vs after-the-move commentary:** `claim_class` is mandatory. A post timestamped after the move it describes is `after_move_commentary` — it can corroborate a catalyst but can never be logged as a prediction.
2. **Deduplicate copied sources:** identical/near-identical text across handles → one claim row, `copied_by: [handles]`; the originator keeps authorship, copiers are not independent witnesses.
3. **Combine claims with contemporaneous evidence:** every advance call gets a contemporaneous chart/volume check (price action around `posted_at_utc`) plus primary-source catalyst verification (the actual announcement/filing/data, not a quote-tweet of it). Unverifiable catalysts are marked `unverifiable`, not assumed.
4. **Record disagreements:** when two tracked authors take opposite sides on the same asset/window, both rows link to each other — disagreement is data, not noise.
5. **Track authors prospectively, misses included:** every advance call with a testable direction + horizon enters the caller ledger; outcomes graded hit/miss; calls without a testable claim are `ungradable` (never scored as misses, never silently dropped). Handle changes are expected (e.g. `@ansem` suspended → `@blknoiz06` confirmed main 2026-10-15): the ledger keys on `author_user_id`, keeps `handle_at_retrieval` as a label, and never merges ledgers on a handle match alone.
6. **Private accounts** (e.g. `@chumbawamba22`) stay out of automated capture — no follow-request gaming; their exclusion is listed in unsupported coverage, not worked around.

### 3.4 X (third-party FxTwitter access, not official X API) is evidence only — the frozen-model line

**Initially X — third-party FxTwitter access, not official X API — is for candidate discovery + contextual evidence ONLY.** An X claim may put an asset on the watch's attention list (trigger class C-equivalent: a manual-equivalent dossier read) and may appear as cited evidence in a dossier — it may **never** change a frozen model's vote, score, or weight. Changing a frozen model's votes on X evidence requires a **separately specified shadow test** (own protocol, own freeze, own acceptance bar) — that test is not this document.

---

## 4. THREE ALERT TYPES (through the shared delivery system — specified, not enabled)

The shared delivery system exists today: `paper-signal-alert-delivery` (15m sweep), destinations = research side chat + terminal tracker, delivery marked only on chat ack, dedup + retry already specified in `pilot/delivery/`. These three types extend it — **none is enabled by this design**.

**Alert-delay honesty:** the 15 m delivery sweep means any alert is delayed by up to 15 m after its trigger row is written, plus the §1.1 event-to-alert decomposition (RTT + cadence staleness + trade staleness) and chat-ack time. An `MARKET_MOVE` alert for a 5 m-loop trigger therefore arrives between minutes and ~20+ min after the market event; for a 6 h-discovery trip, up to ~6 h 15 m plus staleness.

### 4.1 The three types

| # | Type | Meaning | Triggered by | Opt-in |
|---|---|---|---|---|
| (a) | `MARKET_MOVE` | **Informational only** — a watched asset made a material market move | §1.4 trigger A0/A1/A1b/A2/A3 firing on a T1/T2 asset, or an **upward-only** 6h discovery velocity-path trip (any tier; the discovery route trips on upward moves only — §2.1) | **YES — default OFF; Logan opts in explicitly per asset or per class** |
| (b) | `SETUP_PENDING` | A paper signal qualified and is awaiting entry | Issuance contract committed + entry-observation watcher armed | No (Logan's existing routing spec governs) |
| (c) | `ENTRY_CONFIRMED` | The paper entry was actually observed on a venue print | Entry observed on a real post-decision print + waiting-interval veto passed | No |

**Render rules:** (a) renders as **INFO — MARKET MOVE (not a signal, not a position)** and must never carry entry/invalidation/target fields or the PAPER-trade label. (b)/(c) keep the existing `ALERT-SCHEMA-2026-10-14.md` renderings (`PAPER — SETUP PENDING` / `PAPER — ENTRY CONFIRMED`) with all required fields.

### 4.2 Dedup keys

- **(a) `MARKET_MOVE`:** `(asset, move_class, window_start_utc)` where `move_class` ∈ {`up_velocity`, `down_velocity`, `vol_surge`, `level_break`}. One alert per (asset, class, window) — retries idempotent on this key. `down_velocity` is minted by the 5 m T1/T2 loop only — the 6 h discovery route never produces it (§2.1).
- **(b) `SETUP_PENDING`:** `(signal_id, alert_type)` — existing, unchanged.
- **(c) `ENTRY_CONFIRMED`:** `(signal_id, alert_type)` — existing, unchanged.

### 4.3 Expiry semantics

- **(a):** expires 48 h after `window_start_utc`. A new window (fresh trigger class or a genuinely new move) mints a new key.
- **(b):** expires when the observation window closes (15 m crypto) or the contract voids — after expiry it must read as an expired setup, never a pending one.
- **(c):** never expires as a record; it is a fact about an observed print.

### 4.4 Material-change thresholds for re-alerting

- **(a):** re-alert on the same `(asset, move_class)` only if the move **extends by ≥ 50% of the original trigger threshold beyond the last alerted level** (e.g. A1 alerted at +8%; re-alert requires a further +4 percentage points) **or** a new trigger class fires. Prevents drip-alerts on a slow bleed.
- **(b)/(c):** no re-alerting by design — at most one of each per signal (existing rule).

### 4.5 HARD RULE — the score-flip ban

**A weak score flip alone must NEVER create a trade alert.** A dossier re-read that changes a factor-agreement score (e.g. tonight's BTC 52→52 long→short) is a **changed model opinion, not an established regime change**. Such rows are recorded in the append-only log with the tag `diagnosis_only`, surfaced on the UI card's assessment-history line (§5), and are permanently ineligible for `MARKET_MOVE`, `SETUP_PENDING`, or `ENTRY_CONFIRMED`. No alert type exists for "the model changed its mind."

---

## 5. UI CARD SPEC

Three zones, ordered: **current opportunities → developing activity → catalysts first.**

### 5.1 Card layout (every card, all three zones)

| Field | Rule |
|---|---|
| Asset + pair | e.g. BTC / BTCUSDT (Binance.US spot) |
| **Method** | Frozen strategy version that produced the read (e.g. `paper-pilot-v2.1.0 / actionable-entry-v1 / handler v2.1.9`) — every card, no exceptions |
| **Horizon** | Observation/holding window (e.g. 30 elapsed days crypto; 30 XNYS sessions equity) |
| **Evidence time** | Venue timestamp of the market data behind the card — never generation wall clock |
| **Status** | Exactly one of: `awaiting entry` / `entered` / `expired` / `voided(+named reason)` / `watching` / `trigger-fired` / `dossier-only` |
| **Entry condition** | The rule defining entry (paper) or the setup condition being watched (dossier) |
| **Invalidation** | `{ price, rule }` — the level/condition that kills the setup |
| **Chart / evidence access** | One tap to: the pair's venue page, the dossier bundle (`comparison/decision-time-inputs/<opportunity_id>.json`), and the trigger row |
| **Assessment history** | Previous-direction line from the dossier history store: last N reads with `{ decision_at, direction, score, model_version }` — direction changes shown as `52 long → 52 short (2026-10-15)` with the `diagnosis_only` tag visible, never as alerts |

### 5.2 Zone rules

- **Current opportunities:** open paper contracts (`awaiting entry` / `entered`) and `SETUP_PENDING` rows. PAPER-labeled, frozen version on every card.
- **Developing activity:** trigger-fired watch rows, velocity-path trips, X-candidate rows (labeled `X (third-party FxTwitter access, not official X API) — candidate discovery, not a model vote`; rows carry the sweep's staleness window — background discovery, not timely news). Score-flip rows appear here as `diagnosis_only` history, never as opportunities.
- **Catalysts first:** rows with `primary_source_catalyst_verified: true` sort above unverified rows within each zone; unverified catalysts carry the label plainly.

### 5.3 Separations (hard)

- **Operational diagnostics collapsed** into one drawer: measurement runs, reconciliation equations, watcher ticks, staleness health rows. Never on the main card flow.
- **Historical signals separated:** dossier cohort, prospective-paper cohort, retrospective cohort each render under their own header with own N — never one pooled list (per the cohort discipline in `UI-FUNCTION-MAP-2026-10-14.md`).
- **Research, theories, watchlists, journal remain accessible** — linked from the card zone header, never merged into opportunity cards.
- Dossier rows carry the **DOSSIER — research/setup** label and the `actionable entry verified: YES/NO` field; a dossier row is never rendered as an entry.
- The `checkentry` (dossier timing check) vs paper entry-evidence name collision is resolved in UI copy only: "Timing check (dossier)" vs "Entry evidence".

---

## 6. EQUITY NOTE

1. **Scheduler/grading repairs come first.** The equity side's scan/grading path is broken on the deployed side and its repairs are **blocked on deploy access** — this is a dependency, not a detail. No equity surveillance semantics are finalized until the repairs land and are verified deployed (deployed evidence, not sandbox).
2. **Frequent surveillance only where a verified intraday feed supports it:** equity rows are evaluated **only during US regular-session hours (09:30–16:00 ET)** against the existing `equity-market-data-refresh` (15m) cache — the loop reads that cache for equity, it does not fetch its own. Session gating must consult an **exchange calendar (NYSE calendar with early closes — e.g. day after Thanksgiving, Christmas Eve, Juneteenth-adjacent closes)**: the loop must not assume every weekday is a full session, must not run on exchange holidays, and must compress the window on early-close days. A curl-usable free intraday feed from the loop's seat was **not** verified (M12: Stooq blocked by JS challenge) → **OWED**: verify an intraday equity source from the loop seat, or accept the 15m cache as the finest equity resolution. Verification step: one in-session cycle reading the 15m cache with per-row `input_freshness` attested against the cache's own timestamps.
3. **Daily candles cannot substantiate live intraday detection.** Any equity row evaluated on daily candles is labeled `daily-candle basis — not intraday detection`, full stop.
4. **Modeled-open studies stay clearly labeled** as modeled, with the model named and its error bounds shown — never presented as observed opens.

---

## 7. ACCEPTANCE (pre-install, mirrors the bounded-watch bar)

1. Static test: the watch worker contains no issuance call (`recordSignal`, `issueGeneratedSignalCandidate`, `runpapersignalcycle`, entry-window writers) — **read path provably cannot issue**.
2. Deployed dry run: ≥ 1 full cycle producing observation rows and **zero** issuance rows, with run IDs and per-row traces.
3. Tier-list diff empty (§1.3).
4. Deployed evidence or it isn't done (2026-10-12 verification bar). Sandbox-only gets labeled plainly.

---

## 8. INSTALLATION BLOCKED UNTIL — checklist

- [ ] **Logan approves this design + the budget** (incremental: 288 Binance.US batched calls/day, 11,520 weight/day, 0 keyed-API calls, 0 credits, $0 out-of-pocket; §1.2).
- [ ] **Endpoint verifications complete:** Binance.US batched loop (§0 M1/M2 — done), klines-on-trigger (M5 — done), fxtwitter v2 + status (M9/M10 — done; access is third-party FxTwitter, not official X API), deployed tier-list export — **`T1T2-VENUE-MAPPING-<date>.json`, 42 rows, diff vs surveillance list empty (§1.3 hard gate — OWED)**, equity 15m-cache read in-session + NYSE-calendar session gating (§6 — OWED).
- [ ] **Frozen-cadence preservation attested** (§1.7) — signed at install by the wiring seat.
- [ ] **Read-path-cannot-issue proof delivered** (§7.1) + deployed dry run with zero issuance rows (§7.2).
- [ ] **Expert-loop check:** if the expert loop is still open, the expert reviews this design before install (a new install is not a repair instruction — it needs Logan's word).
- [ ] **Cron/schedule ownership assigned by Logan** — schedule changes stay his call; the design proposes 5m but creates nothing until he names it.
- [ ] **Equity scheduler/grading repairs landed + verified deployed** (§6.1) — equity surveillance rows stay staged until then.

---

*Design prepared 2026-10-15 by the paper-signals workstream. Extends `BOUNDED-WATCH-DESIGN-2026-10-15.md` (30-min cache-reader) with a measured 5-min direct loop for the 42-asset universe; both options share the trigger set, row schema posture, and the feed-don't-issue rule.*
