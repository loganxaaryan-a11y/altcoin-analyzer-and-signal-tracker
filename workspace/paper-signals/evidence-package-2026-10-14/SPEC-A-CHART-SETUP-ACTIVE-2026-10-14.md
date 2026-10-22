# SPEC A — Chart Setup Challenger: Trend → Consolidation → Breakout
## ACTIVE SPECIFICATION (V0-v3 + v4 mechanics amendment) — 2026-10-14

**Status:** Frozen. This is the ONE active specification for Challenger A.
**Paper signals only. No brokerage. No evaluation runs yet — SPECIFY BEFORE EVALUATION.**

This document describes what the implemented code
(`challengers/spec-a/`: `detector/`, `collector/`, `validation/`) **actually
does**. Where earlier frozen texts (v2, v3) disagreed with the implemented
behavior, the implemented behavior governs and the text here is corrected.
Every rule carries a code reference so a new reader can verify it without
knowing the document history.

**Variant:** V0-v3 (frozen parameter set, §3) + `v4-amendment-2026-10-14`
(mechanics corrections only — **no threshold was changed by any amendment**;
any parameter change creates a new variant row before results are read).

**Document status:**
- ACTIVE: this file.
- Superseded as active (preserved for history, never consulted for behavior):
  `SPEC-A-CHART-SETUP-2026-10-14.md` (v1), `SPEC-A-CHART-SETUP-v2-2026-10-14.md`,
  `SPEC-A-CHART-SETUP-v3-2026-10-14.md` (frozen), `SPEC-A-CHART-SETUP-v4-AMENDMENT-2026-10-14.md`
  (folded into this document in full), `SPEC-A-DATA-FEASIBILITY-2026-10-14.md`.
- A consolidated withdrawn-claims ledger is in §15; open questions in §16.

> **Non-interference:** Paper only. No change to any frozen model
> (`equity-factor-agreement` `3.1.0-measurement-closure`,
> `crypto-dossier-factor-agreement` `2.0.0-measurement-contract`), no locked
> holdout (2025-01-01 → 2026-09-30 UTC), no frozen trial (H-1R, H-2), no
> deployment/venue/delivery work.

---

## 1. Setup choice

Trend → consolidation → range breakout. Rationale (frozen, not re-argued here):
detectable on saved daily-candle infrastructure; orthogonal to the production
factors (volatility compression → range expansion is a mechanism no production
factor measures); evaluable with the existing first-touch graders (crisp
breakout-bar trigger, structural stop); consolidations recur. Pullback-to-trend
is NOT the setup (it would need an authoritative trend-leg definition, adding
free parameters and intrabar ambiguity).

---

## 2. Authoritative feeds — one feed per asset class

### 2a. Crypto: Binance.US spot klines — ONLY

- **Pattern/ATR/qualification:** `GET https://api.binance.us/api/v3/klines?symbol={SYM}USDT&interval=1d`
  (`limit=1000`; `startTime`-bounded). True daily OHLC (`openTime` exactly
  00:00:00.000 UTC, `closeTime` 23:59:59.999 UTC). The last returned kline is
  the current incomplete day — dropped for all pattern/ATR/qualification use.
  (`detector/feeds.py::fetch_binance_us_klines`)
- **Outcomes:** `GET .../klines?symbol={SYM}USDT&interval=1h` over
  `(entry_ts, entry_ts + 720h]` — one call covers the whole 720h window.
  (`detector/feeds.py::fetch_binance_us_klines_1h`)
- No Kraken fallback. An asset without a Binance.US spot `{SYM}USDT` pair is
  `EXCLUDED_NO_VERIFIED_FEED` — never silently dropped. `api.binance.com` is
  geo-blocked from this environment and is not a fallback.
- Quote currency: **USDT**, stated per row (`quote_ccy: USDT`). USDT is NOT
  silently interchangeable with USD; no conversion anywhere; cross-class
  comparison in R units only.

### 2b. Equities: Yahoo Finance chart API, 1d, `range=5y` (never `range=max`)

- `GET https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?interval=1d&range=5y&events=div,splits`
  (`range=2y` acceptable equivalent). `range=max` is REMOVED — it is silently
  downsampled to ~quarterly bars and unusable for daily geometry.
  (`detector/feeds.py::fetch_yahoo_daily`)
- Session coverage: XNYS trading sessions (weekdays minus NYSE holidays; a bar
  is complete only after **16:15 ET** — the production `isCompletedUsDailyBar`
  rule). Non-US listings per the existing venue mapping.
- **Adjusted OHLC only:** `adj_factor(bar) = adjclose(bar) / raw_close(bar)`; all
  pattern/ATR/entry/outcome prices use adjclose-scaled prices. Per payload:
  `adj_asof` (fetch timestamp) and `series_hash` are pinned and recorded on
  every row. Rows from different payloads are comparable only via their pinned
  bases; R-normalized outcomes are the cross-payload comparison unit.
- **Silent-revision risk:** Yahoo has silently dropped bars. Every fetch is
  snapshot-pinned (`series_hash`, `fetched_at`, bar count per date). A later
  fetch contradicting a pinned series flags the row `DATA_REVISION`; the pinned
  series governs — revisions never silently rewrite outcomes.
- Quote currency: the listing currency (e.g. USD), stated per row as `quote_ccy`.

### 2c. Prohibitions

- CoinGecko `market_chart` and `coins/{id}/ohlc` are **not in this spec's data
  path at all** — not for pattern, ATR, entry, or outcomes.
- Pattern, ATR, entry, and outcome data share compatible instrument, venue,
  granularity, and price conventions.

---

## 3. Pattern definition (mechanical) — FROZEN, variant V0-v3

All bars are **completed daily bars, close-time semantics**. For candidate
qualification bar index `t` (the breakout bar):

### 3a. Frozen parameter table (V0-v3)

| Parameter | Value | Meaning |
|---|---|---|
| `N_CONSOL` | 20 | Consolidation window = completed bars `[t−20, t−1]` |
| `M_IMPULSE` | 20 | Pre-consolidation impulse window = completed bars `[t−40, t−21]` |
| `K_RANGE` | 1.25 | Max consolidation-range-to-ATR ratio |
| `K_DRIFT` | 0.5 | Max net drift inside consolidation, as fraction of range |
| `MIN_TOUCHES` | 2 | Min distinct bars touching each range extreme (±`TOUCH_TOL`) |
| `TOUCH_TOL` | 0.1 | Touch tolerance, in ×ATR14 units |
| `K_IMPULSE` | 1.0 | Min pre-consolidation impulse, in ×ATR14 units (relative move) |
| `B_BUF` | 0.10 | Breakout buffer, in ×ATR14(t) |
| `S_BUF` | 0.25 | Stop buffer, in ×ATR14(t) |
| `E_GAP_MAX` | 1.5 | Max adverse gap, entry print vs qualification close, in ×ATR14 |
| `ENTRY_TIMEOUT_MIN` | 60 | Crypto: max minutes after `decision_ts` to observe a verified entry print |
| `ENTRY_POLL_INTERVAL_S` | 30 | Crypto: `aggTrades` poll cadence during the entry window |
| `FRESHNESS_MAX_S` | 120 | Crypto: max `receipt_ts − exchange_ts` for an eligible entry print |

Single source of truth: `detector/params.py`. Any change = new variant row
(§13) before results are read.

### 3b. Conditions

Definitions — all consolidation/impulse quantities use only information
available **before** the breakout bar (§3c):

1. **ATR14(t−1)** = Wilder ATR-14 over highs/lows/closes through bar `t−1`,
   with the **pinned seeding convention**: seed = simple mean of the 14 true
   ranges over bars `[t−34, t−21]`, assigned to bar `t−21` (Wilder's original
   seeding); Wilder recursion `ATR(k) = (ATR(k−1)×13 + TR(k))/14` forward to
   reads at `t−21`, `t−1`, and `t`. `TR(t−34)` needs `close(t−35)` — inside the
   40-bar window. **No bar older than `t−40` is required.**
   (`detector/indicators.py::atr14_pinned`)
2. **Consolidation range:** `R_hi = max(high)` over `[t−20, t−1]`;
   `R_lo = min(low)` over `[t−20, t−1]`; `R = R_hi − R_lo`.
3. **Compression:** `R / ATR14(t−1) ≤ K_RANGE` (1.25).
4. **No net drift:** `|close(t−1) − close(t−20)| ≤ K_DRIFT × R` (0.5).
5. **Defended range:** ≥ `MIN_TOUCHES` (2) distinct bars in `[t−20, t−1]` have
   `high ≥ R_hi − TOUCH_TOL × ATR14(t−1)`, AND ≥ 2 distinct bars have
   `low ≤ R_lo + TOUCH_TOL × ATR14(t−1)`. A spike with no retest is not a range.
6. **Pre-consolidation impulse:**
   `|close(t−21) / close(t−40) − 1| ≥ K_IMPULSE × ATR14(t−21) / close(t−21)`.
   **Setup direction** = sign of `close(t−21) − close(t−40)` (up → long,
   down → short). No impulse, or impulse = 0 → no setup.

**Breakout qualification (the closed-bar rule).** Bar `t` is the first bar
after `t−1` whose **CLOSE** satisfies:
- long: `close(t) > R_hi + B_BUF × ATR14(t)`
- short: `close(t) < R_lo − B_BUF × ATR14(t)`

Qualification is evaluated **only at the close of bar `t`** — at `decision_ts`
(§5), when bar `t`'s completed data has been received. A wick through the range
that closes back inside does **not** qualify. **No intrabar peeking, ever.**
(`B_BUF` uses ATR14(t), known at decision time; it is a breakout-test buffer,
not a consolidation boundary.)

### 3c. Information-boundary rule

`R_hi`, `R_lo`, touches, drift, and impulse are computed **exclusively from
bars `t−40 … t−1`**. Bar `t` contributes only its close (the breakout test)
and its ATR14 (the buffer). No open/high/low of bar `t` enters any pattern
quantity. (`detector/pattern.py::evaluate`)

---

## 4. Data boundary + executable dependency chain

### 4a. The single boundary rule

**For a qualification decision on bar `t`, every bar used in any pattern,
indicator, gate, or outcome computation must be dated ≥ 2026-10-01 UTC
(equities: the XNYS session date). The oldest datum the method references is
the impulse-start close, bar `t−40`.**

Executable dependencies, in order:

| # | Dependency | Exact need | Bars required |
|---|---|---|---|
| 1 | Pattern inputs | 40 completed bars `[t−40, t−1]` for range, touches, drift, impulse | 40 |
| 2 | ATR-14 recursion | Pinned seeding (§3b.1): fully determined by bars inside `[t−40, t]` | 0 additional |
| 3 | Optional diagnostics (TAS, SMA-200) | Vote degrades to 0 ("unavailable") until 200 post-boundary bars exist; SMA availability logged per row. **Diagnostics never gate and never add dependency bars.** | 0 additional |

**Total: 40 consecutive usable bars dated ≥ 2026-10-01. Nothing more.**

**Enforcement (code):**
- Feeds request/keep only bars ≥ 2026-10-01 (Binance.US via `startTime`;
  Yahoo `range=5y` filtered post-fetch — the older bars are ACCESS, never USE).
- The detector **refuses** any older bar that slips through: `detector/timestamps.py::check_boundary`
  raises `DATA BOUNDARY VIOLATION` on any bar dated < 2026-10-01, in both
  `detector/pattern.py::evaluate` and `detector/__init__.py::scan_asset`.
  Verified live: a synthetic series with one pre-boundary bar raises; a
  post-boundary-only series evaluates.
- A corrupt bar (missing/zero OHLC) breaks the window; the qualification date
  `t` shifts forward. Corrupt bars are never interpolated.

### 4b. The sole exception: indicator warm-up arithmetic (exact scope)

Pre-boundary bars may be read **only** as **inert seed values for indicator
recursion arithmetic** — i.e. the seeding of SMA/EMA/ATR/RSI recursions,
including the TAS diagnostic's EMA/RSI seed restart (§8). This exception
covers **nothing else** and specifically excludes:

- (a) any pattern quantity (§3b) or the breakout test;
- (b) any gate, veto, qualification, or eligibility decision;
- (c) any outcome/horizon computation;
- (d) any threshold, selection statistic, or reported performance number.

**Implementation note (what the code actually does):** the implementation does
not currently exercise this permission at all. ATR-14 uses the pinned seeding
inside `[t−34, t−21]` (already within the 40-bar window); EMA/RSI seeds for the
TAS diagnostic **restart at the oldest post-boundary bar** (documented
truncation in `detector/indicators.py`). So no pre-boundary bar is read for
any purpose today; the exception stands as a permission for future indicator
work, bounded exactly as above. This is the ONLY permitted pre-boundary
input — there are no others.

### 4c. Usable history vs listing age vs diagnostics

- **Usable history** = 40 consecutive completed, non-corrupt bars dated
  ≥ 2026-10-01. An asset listed after 2026-10-01 simply cannot satisfy the rule
  until 40 post-boundary bars exist; the rule handles it mechanically.
  Crypto consecutive-day guard; equities max-gap guard (Fri→Mon = 3d, holiday
  weekend = 4d; duplicates refused).
- **Listing age** is not a separate gate.
- **Outcome bars** (horizon, §7) are a separate downstream requirement, not a
  qualification dependency.
- The v2 §9 history gates ("equity ≥ 252 clean sessions", "crypto ≥ 200
  verified daily closes") are **REMOVED** — production discovery gates, not
  executable dependencies of this method.

**Retained challenger-specified coverage filters** (each logged with its
rationale in the coverage report; excluded assets listed with reason codes,
never silently dropped):
- Crypto: median 20d dollar volume ≥ $1m (USDT); not a stablecoin
  (`EXCLUDED_VOLUME`, `EXCLUDED_STABLECOIN`).
- Equities: median 20-session dollar volume ≥ $25m (listing ccy).
- No verified feed: `EXCLUDED_NO_VERIFIED_FEED`. Insufficient history:
  `EXCLUDED_INSUFFICIENT_HISTORY`.
  (`detector/__init__.py::coverage_check`)

### 4d. Canonical dates — derived once from the §4a rule

Detection, entry, and maturity are **three distinct dates** — never collapsed
into one date anywhere in this spec, its tables, or its timelines.

Derivation rule (single): bar `t` is the first bar whose 40-bar dependency
window `[t−40, t−1]` is fully dated ≥ 2026-10-01.

| Milestone | Crypto | Equities |
|---|---|---|
| **(a) First possible DETECTION** — earliest `decision_ts` at which the 40-bar pattern + all §4a dependencies can be evaluated | Bar `t` = **2026-11-10** (40 daily bars 2026-10-01 … 2026-11-09; bar `t` completes 00:00 UTC 2026-11-11) → earliest `decision_ts` **early 2026-11-11 UTC** (after kline receipt) | Bar `t` = 41st XNYS session on/after 2026-10-01 = **2026-11-27** (sessions 1–40 = 2026-10-01 … 2026-11-25; 2026-11-26 is Thanksgiving) → earliest `decision_ts` **after 16:15 ET 2026-11-27** |
| **(b) First possible ENTRY** — earliest entry that can follow a detection, honoring timeout/expiry rules | First eligible verified print after `decision_ts`, within `ENTRY_TIMEOUT_MIN` = 60 min → **2026-11-11 UTC** (bounded: `decision_ts ≤ entry_ts ≤ decision_ts + 60 min`; no print in window → `EXPIRED_ENTRY_TIMEOUT`) | Intended entry = adjusted open of session S = first XNYS session after `t` = **2026-11-30**, `entry_model: modeled-daily-open` (§6). `decision_ts` (2026-11-27) < open(S) → no `EXPIRED_OPEN_PASSED` on the first detection |
| **(c) Full-horizon MATURITY** — earliest date a row opened on the first possible entry reaches its full horizon | Deadline = `entry_ts + 720h` ≈ **2026-12-11** → endpoint = the **last 1h-bar close ≤ the deadline** (v4 single-endpoint rule, §7b) ≈ **2026-12-11 UTC** | 30th XNYS session after the entry session = **2027-01-13** (close) |

Equity session dates above are computed with the implementation's XNYS
calendar (`detector/timestamps.py`), which covers the collection window.

**Early resolutions are tracked, not presented as the completed cohort.** A
barrier touch (stop or target) may occur before the full horizon. Every row
carries `resolution_ts` (timestamp of the first barrier touch) and
`resolution_type` (`STOP_HIT` / `TARGET1_HIT` / `TARGET2_HIT` / `AMBIGUOUS` /
`TIME_EXITED` / `EVIDENCE_UNKNOWN`). A row is **complete** when it has resolved
(barrier touch) or reached its horizon end (`TIME_EXITED`). A readout's
completed cohort = complete rows only; in-flight rows (no resolution, horizon
end in the future) are reported separately as pending and never counted in
completed-cohort statistics. **Early stop/target hits do not advance a
readout's coverage date and are never described as "the cohort matured."**

**A possible detection date does not guarantee a qualifying setup.** The dates
above are the earliest dates the *dependency rule* can be satisfied; a
qualification still requires the §3 pattern conditions to hold on that date.

### 4e. Holdout — access vs use

Locked holdout: **2025-01-01 → 2026-09-30 UTC**. No fitting, no threshold
selection, no factor choice, no performance reporting on this window.

| | Feasibility probes (2026-10-14) | Challenger computations |
|---|---|---|
| **ACCESS** (bars fetched into probe output) | Yes — bars dated inside the holdout were returned by the feeds and observed | — |
| **USE** (bars entering any pattern, indicator, gate, threshold, or reported statistic) | — | **None.** Every challenger computation uses bars ≥ 2026-10-01 only, per §4a. |

Fetched ≠ used. No holdout-dated bar enters any challenger computation; that
is the protected claim, and it holds (enforced by §4a refusal + the §4b
exception's explicit exclusions).

**Historical replay** (engineering validation of pipeline mechanics only):
`decision_ts` is simulated, rows carry `replay=true`, and replay rows never
contribute to reported statistics. (`collector/pipeline.py::scan_one`)

---

## 5. Decision and receipt times

**Qualification follows RECEIPT of a completed breakout bar — never an assumed
instant at bar close.** Timestamps are real, per-row, and mandatory:

| Field | Definition |
|---|---|
| `bar_close_ts` | The venue close time of the breakout bar `t` (XNYS session close / 00:00 UTC). |
| `decision_ts` | When the completed bar `t`'s data was **received and available** to the decision process — the timestamp at which qualification was actually evaluated. `decision_ts ≥ bar_close_ts`, always. This is the **detection** timestamp (§4d-a). |
| `receipt_ts` | When the raw bar payload arrived from the venue feed. In practice `receipt_ts ≤ decision_ts`; both are logged. |

Rules:
- A qualification is **valid only if evaluated on the completed bar**
  (`isCompletedUsDailyBar` true for equities, i.e. observed after 16:15 ET;
  kline closed for crypto). Evaluating on an incomplete bar is a protocol
  violation; the row is void. (`detector/timestamps.py::validate_decision_time`)
- **Equities:** the intended entry is the adjusted open of session `S` = the
  first XNYS session after bar `t`'s date. If `decision_ts ≥ open(S)` — the
  intended open has already happened by decision time — the setup **EXPIRES**
  with reason code **`EXPIRED_OPEN_PASSED`**. The setup is NOT re-timed to a
  later session.
- **Crypto:** entry must be a verified print after `decision_ts` (§6). If none
  arrives within `ENTRY_TIMEOUT_MIN` (60) minutes, the entry **EXPIRES** with
  reason code **`EXPIRED_ENTRY_TIMEOUT`**.
- In prospective validation, `decision_ts`/`receipt_ts` are wall-clock pipeline
  timestamps. In any historical replay, `decision_ts` is simulated and the row
  carries `replay=true` — replay rows never contribute to reported statistics.

---

## 6. Entry semantics

### 6a. Crypto entry — FIRST eligible verified post-decision print (first-print fidelity)

Entry = the **first eligible, verified post-`decision_ts` venue print** on the
row's venue/instrument: **Binance.US spot `{SYM}USDT`, `aggTrades`/`trades`,
identified by its numeric venue trade ID**.

The next-daily-open substitution is **REJECTED** (a daily-bar open is not an
executable print; substituting it manufactures an entry that was never
observed). There is no open-substitution in this spec.

**First-print fidelity (v4).** The FIRST post-decision print's identity is
preserved. Its evidence is checked once, immediately:
- receipt latency (`receipt_ts − exchange_ts`) ≤ `FRESHNESS_MAX_S` (120s) →
  entered with THAT print;
- receipt latency > `FRESHNESS_MAX_S` →
  **`NONENTRY_FIRST_PRINT_STALE`** (named non-entry);
- coverage of the decision instant unprovable, or unresolvable `aggId` gap →
  `NONENTRY_NO_PRINT`.

The waiter **NEVER advances to a later print** under this contract. Skipping a
stale first print and accepting a later one is the substitution bug this rule
repairs.

**Coverage proof.** Either:
- an explicit `decision_checkpoint` (last `aggId` observed at/before
  `decision_ts`) with no gap to the first returned trade (`first_a ≤
  checkpoint + 1`), **or**
- the first poll returning ≥ 1 trade with `exchange_ts ≤ decision_ts` (the
  window provably covers the decision instant).

Otherwise the "first" print's identity is unverifiable →
`NONENTRY_NO_PRINT`. Pre-decision prints (`exchange_ts < decision_ts`) are
skipped — they were never entry candidates, so this is NOT a substitution.
(`detector/entry.py::wait_for_entry_print`; 42/42 regression tests in
`validation/test_v4_amendments.py`)

Eligibility of a print (all must hold):
1. `print.exchange_ts ≥ decision_ts` (strictly after detection — equal is
   acceptable at the instant boundary).
2. `print.receipt_ts − print.exchange_ts ≤ FRESHNESS_MAX_S` (120s).
3. Print observed within `ENTRY_TIMEOUT_MIN` (60 min) of `decision_ts`.

**Recovery checkpoint:** at `decision_ts`, record the last-observed `aggId`.
On stream/poll interruption, resume from the checkpoint with ≤ 3 gap retries;
an unresolvable `aggId` gap → `NONENTRY_NO_PRINT` — a gap is never papered over
with an assumed print.

**Waiting-interval safeguard:** the 60-minute window is bounded by design; the
30-second poll cadence (≤ 120 polls per qualification) is the interval.

### 6b. Entry-evidence contract

**Every entered trade MUST carry all five evidence fields. Missing or missed
entry evidence → a named non-entry, never a substituted fill.**

| # | Field | Equities | Crypto |
|---|---|---|---|
| 1 | **Venue trade ID / print identity** | NO venue trade ID — see §6c | The venue's numeric **trade ID** (`aggTrades` `a`) of the first eligible post-`decision_ts` print |
| 2 | **Observation time** | `observation_ts` = when the completed session-S bar was received | Exchange timestamp of the trade print |
| 3 | **Receipt time** | `receipt_ts` of the session-S bar payload | `receipt_ts` = when our process received the print |
| 4 | **First-print identity** | The exact open price used, its bar date, venue, series hash, and `entry_model` label (§6c) | The exact trade: id, price, quantity, exchange timestamp — the first eligible print after `decision_ts` |
| 5 | **Coverage attestation** | "Session-S bar complete; its open is the first price of session S in the daily feed; no earlier session-S price exists in this feed" | "Trade stream observed continuously from `decision_ts`; `aggId` sequence gap-checked from the checkpoint; no earlier eligible print was missed" — or, if the stream had an unresolvable gap or the timeout elapsed, the row is a non-entry |

**Named non-entries (never substituted fills):**
- `NONENTRY_NO_PRINT` — crypto: no eligible verified venue print within the
  timeout, an unresolvable `aggId` gap, or the decision-instant coverage is
  unprovable; replay mode (no `aggTrades` feed) also resolves here.
- `NONENTRY_FIRST_PRINT_STALE` — crypto: the FIRST post-decision print failed
  freshness. No later print is substituted.
- `NONENTRY_BAR_MISSING` — equities: the session-S bar was never
  completed/observed (data gap at the entry session).
- **Rejections are logged separately from non-entries:**
  `REJECTED_CHASE` / `REJECTED_STOP_DEGENERATE` mean evidence existed and the
  setup was refused; a non-entry means the evidence never materialized.

### 6c. Equity entry — modeled-daily-open study ONLY

The equity entry (adjusted open of session S) **exists ONLY as a separately
labeled modeled-entry study**:

- Every equity entry row carries `entry_model: modeled-daily-open` — **never**
  `verified-live`. (`detector/entry.py::equity_modeled_entry`)
- A modeled entry **cannot count as a verified live paper entry** and **cannot
  trigger a backdated actionable alert**. Alerts fire only on verified prints;
  there is no verified-print feed for equities in this spec, so equity rows
  generate no actionable alerts.
- Until an opening-print feed exists: equity setups are collected with states
  `pending` / `expired` (per the `EXPIRED_OPEN_PASSED` rule, §5); the
  modeled-open prices feed the measurement study only.
- A `verified-print` `entry_model` is crypto-only; the store refuses
  `verified-print` rows on equities, refuses entered `verified-print` rows
  without a venue trade ID, and refuses any `modeled-daily-open` row carrying
  a venue trade ID. (`collector/store.py::insert_entry`)

**Trade-ID fabrication prohibition (explicit):** NEVER construct a venue trade
ID from `symbol + date` (e.g. `{exchange}:{symbol}:{session_date}:open` as a
synthetic print identity). A modeled entry has no venue trade ID; its identity
is (`venue`, `symbol`, `session_date`, `series_hash`, `entry_model:
modeled-daily-open`). Any row found carrying a fabricated trade ID is void and
the fabrication is logged as a protocol violation.

### 6d. Gap veto (both classes) — explicit equations

If the entry print/reference is more than `E_GAP_MAX = 1.5 × ATR14(t)` away
from the qualification close **in the adverse direction**, the entry is
**REJECTED** as a chase — reason code **`REJECTED_CHASE`**:

- **Long:** `(entry_print − close(t)) / ATR14(t) > E_GAP_MAX` → `REJECTED_CHASE`
- **Short:** `(close(t) − entry_print) / ATR14(t) > E_GAP_MAX` → `REJECTED_CHASE`

(`close(t)` = qualification close; `ATR14(t)` = Wilder ATR-14 as of bar `t`,
pinned seeding §3b.1.) Veto order: gap veto THEN stop-degeneracy veto.
(`detector/entry.py::gap_veto`)

---

## 7. Prices, exits, costs

### 7a. Adjusted equity levels (pinned basis)

Per bar: `adj_factor(bar) = adjclose(bar) / raw_close(bar)`; adjusted OHLC =
raw OHLC × `adj_factor(bar)`. Per payload: `adj_asof` and `series_hash` are
pinned and recorded on every row. The paper entry reference is the **adjusted
open of session S**; paper exit references are adjusted closes/prints — the
same adjusted space as the pattern. No silent mixing of raw and adjusted
prices.

### 7b. Crypto horizon — ONE rule: single endpoint on 1h bars

**Deadline** = `entry_ts + 720h`, where `entry_ts` is the entry print's
exchange timestamp.
**Endpoint** = the **last 1h-bar close ≤ deadline**. This single endpoint is
used consistently for **both** barrier evaluation AND time-exit pricing:
- The evaluated set is exactly the 1h bars with
  `entry_ts < bar_close_ts ≤ endpoint`.
- The time-exit price is the endpoint bar's close.
- **Entry-straddling bar:** the 1h bar with
  `(bar_close − 1h) < entry_ts < bar_close` is **EXCLUDED** from barrier
  evaluation — its intrabar path relative to `entry_ts` is unknowable from
  OHLC (explicit).
- **Deadline-straddling:** handled by construction — no evaluated bar has
  `bar_close > endpoint`.
- **Missing evidence:** any missing hour in `(entry_ts, deadline]`, or a
  missing endpoint bar with no earlier barrier touch → **`EVIDENCE_UNKNOWN`**,
  never imputed. Coverage is proven bar-by-bar.
  (`detector/entry.py::grade_first_touch`, `collector/pipeline.py::_crypto_endpoint_and_coverage`)

For the earliest possible crypto entry (2026-11-11 UTC) the deadline falls on
≈ 2026-12-11 and the endpoint is the last 1h-bar close ≤ that deadline
(≈ 2026-12-11 UTC, §4d-c).

### 7c. Equity horizon

**30 XNYS trading sessions post-entry**, counted on the venue session calendar.
Entry at session open (no straddle — entry equals the bar open). Endpoint = the
**30th-session bar's own close timestamp** (resolved from the series, not
assumed). No touch within the horizon → `TIME_EXITED` at the horizon close; a
missing 30th-session bar with no earlier barrier touch →
`EVIDENCE_UNKNOWN`.
(`collector/pipeline.py::_resolve_equity`, interval `23400` s recorded as
`outcome_granularity_s`)

"30 sessions" is the equities rule only; "entry+720h" is the crypto rule only.
They are not interchangeable and are never stated as a single number covering
both classes.

### 7d. Gap-through fills (first-touch ordering)

Grading uses first-touch ordering on the outcome series. Per bar, barriers are
checked in path order: stop → target1 → target2. When a single bar gaps
through a barrier level:

- **Gap through the STOP (adverse):** fill = **the bar's open beyond the stop**
  (the worse price). A stop-market fills at the next available price; paper
  does not claim the stop price it could not have received.
- **Gap through a TARGET (favorable):** fill = **the target price** (the limit
  guarantee). Paper does not claim the better gap-open.
- **Ambiguous bars** (both stop and target levels touched in one bar) →
  `AMBIGUOUS`, excluded from rates, listed per row.

**TARGET2_HIT reachability note (flagged):** under first-touch semantics a bar
that gaps OVER target1 books `TARGET1_HIT` at target1 — the first working
limit in path order fills first in time, and paper books the guaranteed level
rather than the better gap-open. Under this rule `TARGET2_HIT` fires only when
a bar reaches target2's level while target1's level is genuinely untouched,
which continuous paths cannot do; the enum arm is retained for parity with
this spec.

### 7e. Invalidation (exact stop construction)

- **Long stop** = `R_lo − S_BUF × ATR14(t)`; **short stop** =
  `R_hi + S_BUF × ATR14(t)`, with `S_BUF = 0.25` and ATR14 as of the
  qualification bar `t` (pinned seeding §3b.1). The stop is **structural**
  (opposite range extreme + buffer), computed once at entry and **never moved**
  — no tightening, no trailing, no discretionary adjustment.
- **Degeneracy veto:** if the constructed stop is on the wrong side of entry
  (long stop ≥ entry; short stop ≤ entry — possible when the entry gaps far
  into the range), the setup is **REJECTED** with reason code
  **`REJECTED_STOP_DEGENERATE`**.
- **Targets** (same frozen construction as the program): `target1 = entry ±
  1.5R`, `target2 = entry ± 2.5R`, `R = |entry − stop|` (risk per unit), sign by
  direction. (`detector/entry.py::build_targets`)

### 7f. Spot SHORTS are hypothetical directional benchmarks

**No borrow or derivative execution model exists in this spec.** Spot short
rows are labeled **`directional-benchmark (hypothetical short, spot)`** — they
measure the pattern's directional information, not an executable short. Borrow
costs are **unknown and NOT modeled** (stated distinctly from funding, below).
The 18 bps modeled cost scenario (§7g) applies to the benchmark as the cost
scenario, not as a verified execution cost.

### 7g. Costs — 18 bps is a MODELED scenario

**18 bps roundtrip baseline** on every entered trade
(`COST_SCENARIO_ID`: `modeled-roundtrip-18bps-funding-unverified-v1`).
Paper convention only — no brokerage, no order routing. The entry print is a
recorded reference price, labeled as such.

Cost in R units (documented mechanical choice — the spec states the scenario,
not the conversion): `cost_R = 0.0018 × entry_price / |entry − stop|`;
`gross_R = direction × (exit − entry) / |entry − stop|`; `net_R = gross_R −
cost_R`. (`detector/entry.py::apply_direction_and_cost`)

**Funding:** this spec is spot-paper — no perpetuals, no funding legs — so
funding is **not applicable** to challenger rows and is **excluded** from net
R (labeled `funding: n/a (spot)` for comparability with production rows, where
it remains UNVERIFIED as in production). Funding inapplicability (spot has no
funding legs) is stated **distinctly from** unknown borrow costs (§7f): the
former is a structural zero, the latter is an unmodeled unknown.

---

## 8. Related trend evidence — Trend-Alignment Score as DIAGNOSTIC ONLY

SMA-20, SMA-50, SMA-200, MACD 12–26, and RSI-14 trend reads are **correlated
votes on the same price series**. This spec counts them **once**, and **does
NOT gate on them and does NOT add any other overlapping indicator gate**:

- Reuse the existing factor-code formulas on the pre-qualification series
  (bars `≤ t−1` only): `replayAverage` SMAs, `replayEma` MACD 12–26,
  `replayRsi` RSI-14. (`detector/indicators.py`)
- Ternary votes with the production rules:
  - `v_sma20 / v_sma50 / v_sma200` = +1 if `close > SMA`, else −1 (0 if SMA unavailable)
  - `v_macd` = +1 if MACD diff > 0, −1 if < 0, 0 if `|diff| < 1e-6`
  - `v_rsi` = +1 if `55 ≤ RSI ≤ 75`; −1 if `25 ≤ RSI ≤ 45`; else 0
- **Trend-Alignment Score:** `TAS = (v_sma20 + v_sma50 + v_sma200 + v_macd + v_rsi) / 5`, ∈ [−1, 1].
- **TAS is recorded per row as a diagnostic. It is never a gate, never added
  to a score, never a veto.** The setup has no score; it either qualifies or
  it doesn't.
- SMA-200 availability is logged per row (`sma200_available` Y/N); until 200
  post-boundary bars exist the SMA-200 vote is 0 and TAS is noisier — stratify
  at readout.
- **Warm-up truncation note:** the EMA/RSI seed recursion restarts at the
  oldest post-boundary bar (the §4b exception is not exercised — see §4b);
  this differs from a full-history computation. TAS is diagnostic-only, so the
  truncation is logged, not hidden.

---

## 9. Frozen comparator — the dossier engine

**The comparator is the production dossier engine. Exactly one model, named by
version and callable function — not the discovery-paper model:**

| Class | Model | Version | Callable |
|---|---|---|---|
| Crypto | `crypto-dossier-factor-agreement` | `2.0.0-measurement-contract` | `analyzeCoin` → `issueGeneratedSignalCandidate` |
| Equities | `equity-factor-agreement` | `3.1.0-measurement-closure` | `analyze()` |

**Same opportunity timestamp.** An opportunity = `(asset, decision_ts)`. At
every opportunity in the validation window, **both methods are evaluated using
only inputs available at that timestamp**:
- **Challenger A:** qualifies (or not) per §§2–6 at `decision_ts`.
- **Dossier engine:** its decision for the same asset **at the same
  `decision_ts`**, replayed under its own specified rules with only data
  available at that timestamp (its own signal, veto, and entry convention —
  **not** the challenger's entry forced onto it). The engine's inputs at that
  timestamp are captured and hashed per opportunity.

**Comparator semantics (resolved from source, not inferred):**
- **Crypto** (`crypto-dossier-factor-agreement` 2.0.0): `analyzeCoin` →
  `issueGeneratedSignalCandidate`. Entry convention
  `first-post-decision-provider-quote`: a timestamped post-decision CoinGecko
  markets quote (`quoteReceivedAt ≥ createdAt`); entry re-leveled onto that
  quote via `buildAtrLevels`; no quote → suppressed. Qualification: complete
  factor ledger, Wilder ATR-14, non-null levels, no same-day same-direction
  (`hasToday`), born-dead veto, short-regime gate, idempotent coin|day key.
  Horizon 30 elapsed days; `evaluateTradeSetup` on daily candles. No
  minimum-confidence threshold. Comparator rows replay with THESE semantics at
  the same `decision_ts`; `comparator_replay: confirmed-from-source`.
- **Equities** (`equity-factor-agreement` 3.1.0): `analyze()` → `recordSignal()`.
  Entry = signal-day adjusted close, explicitly "paper execution is not
  claimed." The program's own evaluator refuses these as trade setups
  (`evaluateEquityTradeSetup` → `UNVERIFIED / research_only_entry`). Therefore
  the equity comparator is graded as a **directional-call benchmark**:
  first-touch mechanics on the dossier's own levels (stop = entry ∓
  2.00×ATR-14, targets 1.5R/2.5R, 30 XNYS sessions, entry = signal-day close),
  labeled `comparator_grading: directional-benchmark` — derived from the real
  functions, not invented.

**Genuine abstention:** if a method issues nothing at an opportunity, that is
recorded as **`ABSTAIN`** — an explicit outcome row with zero position,
counted in denominators, never dropped silently. Abstention rates are reported
per method.

**Unknown evidence → UNKNOWN, not zero.** If either side's required inputs are
unknown at `decision_ts` (data gap, feed outage, incomplete history), the side
is recorded as **`EVIDENCE_UNKNOWN`** — not imputed, not carried forward from
another day, not filled from a ±1-day window. A paired opportunity where either
side is `EVIDENCE_UNKNOWN` is recorded as pair = **`UNKNOWN`** — excluded from
inference, listed, and **never scored as zero**.

**Each method keeps its own specified mechanics.** The challenger is graded
with its entry (§6), stop/targets (§7), horizon (§7), and costs (§7g). The
dossier engine's rows are graded with the engine's own specified entry
convention, stop/target construction, horizon, and costs. The comparison never
forces one method's entry onto the other.

**Opportunity ledger:** every eligible-asset × evaluation-date in the
validation window is logged compactly (`asset, date, challenger_qualified Y/N,
dossier_signal Y/N/ABSTAIN, evidence flags`). Issued rows get full trade
ledgers. The primary inference set = opportunities where the challenger issued
with known evidence; the dossier side at those same opportunities (issued or
`ABSTAIN`) forms the paired comparison. The full ledger is kept for coverage —
**this is not an overall replacement verdict.** The primary question is:
**"does A add value where A qualifies?"**

**Naive baselines on identical challenger entries** (same entry print, same
stop/target construction — these are mechanical variants of the challenger
row, so shared mechanics are legitimate here): **(a)** random direction
(seeded PRNG, seed logged); **(b)** always-long; **(c)** momentum baseline
(direction = sign of 20-session return at qualification). Same 18 bps costs.
Seeds and code refs logged per §13.

**Stop/target orientation for opposite-direction baselines (exact).** A
baseline with direction `d` uses the challenger's geometric construction
flipped for `d`:
- stop = `R_lo − S_BUF × ATR14(t)` if `d = +1` (long); `R_hi + S_BUF × ATR14(t)` if `d = −1` (short)
- `R = |entry − stop|`; `target1 = entry + d × 1.5R`; `target2 = entry + d × 2.5R`

So the always-long baseline (`d = +1` always) uses the long-side geometry even
when the challenger qualified short — the flip rule is mechanical, stated once,
applied uniformly. Random-direction: `d ∈ {+1, −1}` from the seeded PRNG.
Momentum: `d = sign(20-session return at qualification)`; a zero return → no
baseline row (`ABSTAIN`).

**Primary vs robustness (CONFIRMED):** all-rows with two-way clustering is
primary; first-entry-only is the robustness check.

**Universe:** the verified supported universe
`paper-signals/universe/SUPPORTED-UNIVERSE-v1.0.0.json` is the challenger
universe (frozen v1.0.0). Assets outside it are
`EXCLUDED_NO_VERIFIED_FEED`, never silently dropped.

---

## 10. Statistical protocol

### 10a. Dependence handling — overlapping outcome windows, including cross-asset

Decision-date clustering alone misses different-date entries exposed to the
same later shock. The protocol clusters in two dimensions, **with the
cross-asset overlapping-window rule stated explicitly**:

- **Dimension A — asset × window chains:** two challenger entries on the same
  asset with overlapping holding windows `[entry_ts, horizon_end]` belong to
  the same cluster. This absorbs repeated same-asset signals.
- **Dimension B — decision-week blocks:** **7-day blocks anchored
  `2026-10-14T00:00Z`** (`collector/analysis.py::decision_week_block`).
  Fixed, non-overlapping — they **cannot chain by construction** (a
  connected-components rule on shock-linked rows would collapse to a handful
  of clusters exactly when the most data exists; simulation showed this). Two
  signals in the same week share cross-asset shock exposure by construction of
  the block; signals in different weeks are never B-linked. Maximum **38**
  blocks in the collection window.
- Inference uses **two-way cluster-robust standard errors**
  (Cameron–Gelbach–Miller): variance = V(A) + V(B) − V(A∩B). The reported 95%
  CI on every estimand is the two-way cluster-robust interval.

**What the effective-sample claim rests on (no false "effective N").**
`min(n_A, n_B)` is **not** presented as a demonstrated effective independent
sample size. The claim rests on: (i) the count of dimension-A clusters = the
number of **non-overlapping exposure windows** (an upper bound on independent
information, stated as such — it is not demonstrated independence); (ii) the
two-way cluster-robust CI, which is valid without claiming an effective N;
(iii) the pre-registered gate below, which requires ≥ 20 clusters in **each**
dimension before any verdict. Below that, no verdict is possible — by
construction, not by interpretation.

### 10b. Estimand and the three terminal outcomes

- Primary estimand: **Δ = E[net R_challenger] − E[net R_comparator]**, paired at
  shared opportunities (§9), net of the 18 bps modeled costs, in units of R.
- Comparators: the dossier engine (paired) AND each naive baseline
  (random-direction, always-long, momentum).
- **SUPPORT:** the two-way cluster-robust **95% CI of Δ lies entirely above
  +0.25R for EVERY comparator** (min over comparators of the CI lower bound >
  +0.25R), **AND** clusters ≥ 20 in each dimension, **AND**
  target-before-stop rate ≥ 40% (guard: the first-touch mechanics must show the
  pattern's edge shape, not just a favorable Δ).
- **INSUFFICIENT EVIDENCE:** clusters < 20 in either dimension, or any
  comparator's CI straddles the +0.25R margin — reported as insufficient
  evidence, never as weak support or weak rejection. (The v3 dead zone — a CI
  entirely inside (−0.25R, +0.25R), e.g. (−0.10, +0.20) — resolves here.)
- **FAILURE TO MEET CRITERION:** the 95% CI of Δ vs the **dossier comparator**
  lies entirely **below 0** (upper bound < 0) with ≥ 20 clusters in each
  dimension → the setup as specified does not meet the criterion; volatility
  compression → expansion is not the default explanation for any production
  miss on this evidence. (Failure = evidence the setup adds no value vs the
  production engine, not evidence of a large negative edge.)
- **Hit rate alone never promotes, retires, or ranks** — it is a diagnostic,
  not a verdict.
- **All possible outcomes resolve to exactly these three.** Partition proof:
  for the dossier CI, exactly one of (a) lo > +0.25, (b) hi < 0, (c) neither
  (CI intersects [0, +0.25R]) holds → (a)+gates+guard = SUPPORT, (b)+gates =
  FAILURE, else INSUFFICIENT. Nothing is unclassified.
- **All-rows with two-way clustering is primary; first-entry-only is the
  robustness check** (§9).
- Findings concern **this exact variant (V0-v3 + v4 mechanics amendment)** —
  not breakout strategies generally, not volatility compression as a universal
  mechanism.
  (`collector/analysis.py::classify_outcome` — frozen in code before outcome
  evaluation)

**Extension contingency (pre-registered).** If week-clusters < 20 at
2027-06-30, collection extends ONE 3-month block (to 2027-09-30) and the final
readout moves to 2027-11-15. No second extension is pre-registered — two
extensions without 20 active weeks means the method fires too rarely to
validate: report INSUFFICIENT EVIDENCE with the run-rate stated. **The bar is
never lowered to manufacture a verdict.** (`collector/analysis.py::extension_needed`)

### 10c. Frozen collection window and readout dates

- **Collection:** 2026-10-14 → **2027-06-30** (last permitted `decision_ts`).
  First possible detections per §4d (crypto 2026-11-11 UTC; equities
  2026-11-27).
- **Monthly readouts** (last calendar day of each month, first 2026-12-31)
  cover only rows **complete** by that date (§4d: resolved or horizon-ended;
  in-flight rows listed as pending). Monthly readouts are **progress
  description only** — no promotion/falsification testing at monthly readouts.
- **Sequential-testing rule (selected): a single pre-registered final test.**
  The SUPPORT / INSUFFICIENT EVIDENCE / FAILURE TO MEET CRITERION test (§10b)
  is run **once**, at the final readout. Monthly readouts do not test; they
  describe.
- **Final readout: 2027-08-15**, covering all rows opened in the collection
  window: last crypto entries (2027-06-30) mature 2027-07-30; last equity
  entries (2027-06-30) mature 2027-08-12. No readout covers a row before its
  horizon completes or it resolves.
- **Outcome maturity per row** (§7): crypto rows mature at the endpoint (last
  1h-bar close ≤ `entry_ts + 720h`); equity rows at the close of the 30th
  session after entry. Early barrier resolutions carry `resolution_ts` and are
  tracked per §4d — they do not advance any readout's coverage date.

**Drawdown labeling:**
- Report **max peak-to-trough decline of the cumulative net-R curve (unit risk
  per trade)**. This is **labeled "cumulative-R drawdown (paper, unit risk)"**
  — it is **NOT labeled portfolio drawdown**. Portfolio drawdown requires a
  defined allocation (sizing, concurrency, capital base), which this spec does
  not define. The two must not be conflated in any report.

---

## 11. Report fields (every readout)

Signal frequency (signals/week, signals/asset/week) · coverage (assets
scanned, assets eligible, excluded with reason codes) · `decision_ts`,
`receipt_ts`, `observation_ts`, `entry_ts`, `resolution_ts`, `horizon_end`
per row (detection/entry/maturity kept separate, §4d) · `endpoint_ts` per
resolved row (== `horizon_end`) · `outcome_granularity_s` per row (3600 crypto /
23400 equities) · `decision_week_block` per row · venue, instrument,
`quote_ccy`, print/trade ID, first-print identity, coverage attestation per
entered row · `entry_model` label per row (`verified-print` crypto /
`modeled-daily-open` equities) · expiries and rejections with reason codes
(`EXPIRED_OPEN_PASSED`, `EXPIRED_ENTRY_TIMEOUT`, `REJECTED_CHASE`,
`REJECTED_STOP_DEGENERATE`, `NONENTRY_NO_PRINT`, `NONENTRY_FIRST_PRINT_STALE`,
`NONENTRY_BAR_MISSING`, `DATA_REVISION`) · abstentions (`ABSTAIN`) and
unknown-evidence rows (`EVIDENCE_UNKNOWN`, pair = `UNKNOWN`) with counts ·
directional accuracy · **target-before-stop rate** (first-touch) · **net
expectancy** (avg net R per trade, costs in) · cumulative-R drawdown (unit
risk; NOT portfolio drawdown, §10c) · false alarms (stop-first rate;
failed-breakout subtype where price reached ≥ +0.5R then stopped) ·
**detection-to-entry delay** (`decision_ts` → `entry_ts`) and
detection-to-paper-record delay · **losers listed by id** · **rejected
opportunities listed with reason codes** · TAS per row (diagnostic) +
`sma200_available` · costs stated (18 bps roundtrip modeled; funding n/a —
spot; borrow unknown — hypothetical shorts) · n_rows AND n_clusters (n_A and
n_B separately — week blocks for B; no "effective N" claim, §10a) ·
per-cluster decomposition · first-entry-only robustness variant · pending
(in-flight) rows listed separately from the completed cohort ·
extension-contingency status at the final readout.

---

## 12. Forward pipeline budget

Line items. Documented limits are stated as documented; observed limits as
observed; unknowns as unknown — no unverified rate-limit claims.

| # | Item | Volume | Cost |
|---|---|---|---|
| 1 | **History bootstrap** (one call/asset) | Crypto: N × 1 `klines?limit=1000` (weight **10**/call, documented); Equities: 101 × 1 Yahoo `range=5y` | Negligible |
| 2 | **Daily collection feed** (per asset per day during collection) | Crypto: 1 `klines?limit=2`/asset/day; Equities: 1 Yahoo `range=5y`/asset/day (or per-readout refresh; §2b). Dedup against production-saved candles where the feed is identical — one fetch serves both, logged once | Crypto: 101 assets ≈ 1010 weight/day ≪ headroom. Yahoo: paced ≤ 1 call/2s |
| 3 | **ENTRY MONITORING** | Per crypto qualification: `aggTrades` poll every `ENTRY_POLL_INTERVAL_S` = 30 s over ≤ 60 min → **≤ 120 polls** (weight **1**/call, documented) per setup; checkpoint + gap backfill ≤ 3 retries | Bounded per setup; setups are rare (pattern-gated). No standing WS required; WS subscribe is the approved alternative if polling proves lossy |
| 4 | **Coverage recovery** (gap re-fetch) | `klines` with `startTime`/`endTime` for missing bars; Yahoo re-fetch on `DATA_REVISION` | Bounded: ≤ 3 retries with backoff per gap |
| 5 | **Outcome collection** (horizon-end bars) | **Crypto:** one `klines?interval=1h&limit=720` call (weight **10**, documented) per crypto entry at/after maturity — the single-endpoint rule needs the 1h series, which the daily feed cannot supply; plus the monthly readout refresh. **Equities:** folded into the daily feed (the 30 session bars already arrive). | Honestly priced |
| 6 | **Equity modeled entries** | 0 extra calls — from the same Yahoo fetch (item 1/2) | Zero |

**Rate limits — documented vs observed (honest):**
- **Binance.US public REST: 6000 request-weight/min (documented).** `klines?limit=1000`
  = weight **10**/call (documented); `aggTrades` = weight **1**/call (documented).
  No key required for public market data. Observed 2026-10-14: probes ran clean; no
  throttling observed on Binance.US.
- **Yahoo Finance: per-IP cap undocumented (unknown).** Observed: generally tolerant
  at low pacing; the cap is stated as **observed/unknown, not quantified** — no
  invented number. Pacing rule: ≤ 1 call/2s, back off on 429 with jitter.
- **CoinGecko: throttling observed** (probes backgrounded on rate-limit backoff,
  2026-10-14) — historical observation only; CoinGecko is not in this spec's data
  path (§2c).

**Shared-provider contention policy** (Yahoo and Binance.US are shared with
production): challenger collection runs **outside production batch windows**; the
challenger never exceeds **50% of documented headroom** (≤ 3000 weight/min on
Binance.US; Yahoo self-paced per above); on 429/418/503 the challenger backs off
first and production traffic is never crowded. Challenger usage is logged per day
(calls, weight) in the coverage report.

---

## 13. Variant log (RESET — V0-v3 = this spec's frozen defaults)

Rule: **V0-v3 = this spec's defaults (§3a).** Any parameter touched creates a new variant
row **before** its results are read. No silent tuning; no unlogged variant may contribute
to shipped parameters. (V0-v2 was never evaluated; its rows do not carry forward.)

| variant_id | date | parameter(s) changed (old → new) | reason | code ref (script + hash/seed) | result destination |
|---|---|---|---|---|---|
| V0-v3 | 2026-10-14 | — (spec defaults, §3a) | initial v3 spec (seven items reconciled; §15) | `challengers/spec-a/` (detector, collector, validation) | `challengers/results/spec-a/V0-v3/` |
| `v4-amendment-2026-10-14` | 2026-10-14 | mechanics only — **no threshold changed** | first-print fidelity (§6a), single-endpoint grading (§7b), week-block clustering + partition (§10), comparator semantics closed (§9) | same code tree, amendment id recorded per re-graded row (`row_revisions`) | `challengers/results/spec-a/V0-v3/` |
| _template_ | _YYYY-MM-DD_ | _e.g. `K_RANGE` 1.25 → 1.0_ | _why the change was tried_ | _script path + git/commit hash or content hash_ | _results dir for that variant_ |

Variant results live under `~/workspace/goals/research-terminal/challengers/results/spec-a/<variant_id>/`
and must contain the full §11 report plus the row-level ledger (ids, entries, stops,
targets, outcomes, rejections, evidence fields, cluster ids, `resolution_ts`,
`entry_model`). A variant with no results directory is an unrun variant — it does not
exist for decision purposes.

---

## 14. Implementation map (rule → code)

| Rule | Implementation |
|---|---|
| Frozen parameters | `detector/params.py` (single source of truth) |
| Data boundary refusal | `detector/timestamps.py::check_boundary` (raises); called in `detector/pattern.py::evaluate` and `detector/__init__.py::scan_asset` |
| Feeds (≥ 2026-10-01 only) | `detector/feeds.py::fetch_binance_us_klines` (1d), `fetch_binance_us_klines_1h` (1h outcomes), `fetch_yahoo_daily` (adjusted, pinned) |
| Pattern evaluation | `detector/pattern.py::evaluate` |
| ATR-14 pinned seeding | `detector/indicators.py::atr14_pinned` |
| TAS diagnostic | `detector/indicators.py::trend_alignment_score` |
| Coverage filters | `detector/__init__.py::coverage_check`; ledger rows via `::scan_asset` |
| Crypto first-print entry | `detector/entry.py::wait_for_entry_print` (fidelity, coverage proof, named non-entries) |
| Equity modeled entry | `detector/entry.py::equity_modeled_entry` (always `modeled-daily-open`, no trade id) |
| Vetoes | `detector/entry.py::gap_veto`, `stop_degeneracy_veto`, `build_targets` |
| First-touch grader (single endpoint) | `detector/entry.py::grade_first_touch`, `apply_direction_and_cost` |
| Pipeline: scan, entry state machine, resolutions | `collector/pipeline.py::scan_one`, `_handle_entry`, `update_resolutions`, `_resolve_crypto`, `_resolve_equity`, `_crypto_endpoint_and_coverage` |
| Persistence + §6c enforcement | `collector/schema.py`, `collector/store.py` (fabrication refusal; `row_revisions` table; `outcome_granularity_s`) |
| Pre-registered decision rule | `collector/analysis.py` (`decision_week_block`, `classify_outcome`, `extension_needed`, `max_week_blocks`) |
| Reason codes | `detector/reason_codes.py` ([SPEC] + [v4] codes; [EXT] `STAGE_*` funnel labels and `COVERAGE_UNEVALUABLE` are mechanical stage labels, not gates or vetoes) |

---

## 15. Withdrawn and superseded claims ledger (consolidated)

The following claims are withdrawn/superseded and are NOT part of the active
spec. Preserved for history only.

**From v2:**
1. §2/§9: **Kraken spot `OHLC?interval=1440` fallback — REMOVED** (never probed; an unprobed fallback is not a fallback). Binance.US 1d klines is the sole crypto feed.
2. §2/§9: **Yahoo `range=max` — REMOVED** (probes proved silent downsampling to ~quarterly). Specified: `range=5y` (or `range=2y`).
3. §9: **200/252-history eligibility gates — REMOVED** (production discovery gates, not executable dependencies of this method). Replaced by the 40-bar rule (§4a) + challenger-specified coverage filters (§4c).
4. §7: **dual crypto-horizon wording — RECONCILED** into one rule, then corrected by v4 to the single-endpoint 1h rule (§7b).
5. §11c: **`min(n_A, n_B)` as effective independent sample size — CORRECTED** (§10a).
6. §11e: **outcome labels "inconclusive"/"falsify" — REPLACED** by INSUFFICIENT EVIDENCE / FAILURE TO MEET CRITERION (§10b).
7. §5b: **`print_id = {exchange}:{symbol}:{session_date}:open` as a synthetic venue trade ID — PROHIBITED** (§6c). Modeled entries carry no venue trade ID.
8. §11a: **detection/entry/maturity collapsed into "first possible decision" dates — CORRECTED** (§4d): three separate dates per class, everywhere.

**From the annex:**
9. §5: **54-bar derivation (40 pattern + 14 ATR seed) — WITHDRAWN** as double-counting. The ATR seed needs no bars before `t−40` under the pinned seeding convention. Dates 2026-11-24 / 2026-12-17 withdrawn.
10. §2 table: **"≥ 54 clean bars ≥ 2026-10-01: Yes" — CORRECTED** (§4e): conflated fetched history with usable post-boundary history. Access vs use reported separately.
11. §1c consequence: **next-daily-open as crypto entry — REJECTED** (§6a). Entry is the first eligible verified post-decision venue print.
12. §5: **"no holdout bars were pulled" — CORRECTED** (§4e): probes did fetch holdout-dated bars (access); none enter any challenger computation (use).
13. §3: **"zero entry calls" budget — REPLACED** (§12 item 3): entry monitoring is priced honestly (≤ 120 weight-1 polls per crypto qualification).
14. §5 table: **collapsed "first complete observations" (2026-12-25 / 2027-02-01) — NOT ACCEPTED** (§4d): wrong rule and collapsed dates.

**Standing withdrawals (carried from v2, unchanged):** the v1 dev-window "13 days yields enough rows" claim; the v1 CoinGecko `market_chart`/`/ohlc` crypto candle rows; the v1 CoinGecko-quote → daily-open fallback; the v1 "close observed before 16:15 ET → skip a session" clause; the v1 production-pairing ±1-day window; the v1 `TAS_MIN = 0.2` gate.

**From v3 (v4 mechanics amendment):**
15. §6a v3: **"stale prints are skipped, not eligible; waiting continues for the next print" — WITHDRAWN.** Restored the substitution bug. Replaced by first-print fidelity + `NONENTRY_FIRST_PRINT_STALE` (§6a).
16. §7b v3: **"exit = first venue daily-bar close at or after the deadline" — WITHDRAWN** as inconsistent with barrier evaluation stopping at the deadline. Replaced by the single-endpoint rule on 1h bars (§7b). **The v3 §4e crypto maturity date "2026-12-12 UTC" is superseded** by the §4d-c derivation (≈ 2026-12-11 UTC).
17. §10a v3: **shock-linkage connected components for dimension B — WITHDRAWN.** Simulation proved perverse collapse. Replaced by decision-week blocks (§10a).
18. §10b v3: **FAILURE defined as CI entirely below −0.25R vs "best comparator" — REPLACED** by CI entirely below 0 vs the dossier comparator (§10b); the dead-zone gap is closed by the new partition.
19. §12 item 5 v3: **"outcome collection folded into the daily feed" — SUPERSEDED for crypto** by priced 1h outcome calls (§12 item 5).
20. §15.3: **comparator semantics "to be confirmed via expert loop" — CLOSED** from the source exports (§9). §15.5 primary-vs-robustness — CONFIRMED as all-rows primary / first-entry-only robustness.

---

## 16. Open questions (two remain)

7. **Yahoo revision at the entry session:** if the session-S bar is revised after the paper entry is recorded, the pinned series governs (§2b) — confirm this matches the program's revision policy for production paper rows.
8. **Binance.US pair availability:** confirm the working crypto universe (which `{SYM}USDT` pairs exist on Binance.US spot) at collection start; assets without a pair are `EXCLUDED_NO_VERIFIED_FEED`.

---

*End of SPEC A Active Specification (V0-v3 + v4-amendment-2026-10-14, frozen 2026-10-14).*
*Paper signals only. No brokerage.*
