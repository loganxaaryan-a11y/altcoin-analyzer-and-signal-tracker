# TraderSpy prospective caller-ledger pilot

**Status:** live since 2026-10-22. Approved by Logan 2026-10-21 (small pilot scope).
**PAPER ONLY / research only.** Nothing in this pilot feeds issuance, scoring,
or any pipeline gate. TraderSpy rows are external research leads and separately
graded calls — nothing more.

## Purpose

The 2026-10-21 verification (`files/traderspy-verification-2026-10-21.md`,
read its CORRECTION banner) found that TraderSpy's sampled TP/SL claims
reproduce from independent data, but that no honest hit rate could be stated
from the historical feed: entry-price plausibility does not prove timely
publication, and part of the sample was still inside its tracking horizon.
This pilot is the corrective: **timestamped snapshots taken by us at first
sight of each signal**, graded only when the signal has matured, under the
corrected labels below.

## Corrected labeling rules (binding — from the expert review, 2026-10-21)

1. **Open ≠ expired.** A signal is graded only when its tracking horizon has
   closed (vendor rule: 24 candles of its timeframe after creation — 24h for
   1h, 4 days for 4h) or when reconstruction reaches a decisive first touch
   (stop touched, or TP3 touched) after a vendor-documented exit. Inside its
   horizon it is `still_open`: never graded early, never called expired.
2. **`profit_locked` is its own outcome class** (`vendor_profit_locked`) —
   a vendor-reported exit class. It is never counted as a target win and
   never counted as a loss. The vendor's claimed exit price and time are
   captured from the signal detail endpoint at grading time, flagged
   `vendor_reported`, with rule verification pending separate work.
3. **Futures evidence for futures signals.** Grading reconstructs first
   touches from Binance USD-M **futures** 1m daily archives
   (data.binance.vision). Spot data is never used as a verdict. A missing
   archive day inside the judged window makes the row `unverifiable`
   (reason stated) once the horizon closed >36h ago; before that it defers,
   because the archive may simply be unpublished yet.
4. **Prospective entry: eligibility screens + modeled entry (v1.2,
   expert corrections 2026-10-21).** Our first-seen timestamp proves when
   we *received* a signal; it does not by itself make the signal a
   prospective *entry*, and passing an availability screen does not
   establish that the vendor's advertised entry price was obtainable.
   Every grade carries an `entry_class`, assigned by the grader exactly
   as follows (this text and the code are the same rule; there is no
   daylight between them):

   > **Screens (unchanged from v1.1).** A ledger signal passes the
   > prospective-entry screens only if all of the following hold at our
   > first-seen instant:
   > (a) neither its TP1 nor its SL had been touched in the window
   >     [vendor `createdAt`, our `first_seen`) — checked bar-by-bar from
   >     Binance USD-M futures 1m data;
   > (b) the trade was still meaningfully available at first-seen, which
   >     requires both: (b1) the market price at first-seen — the close of
   >     the 1m futures bar containing the first-seen instant — was still
   >     on the entry side of TP1 with **at least half (≥ 50%) of the
   >     entry→TP1 distance remaining**; and (b2) no vendor-documented exit
   >     time precedes first-seen (a trade the vendor had already exited
   >     was not available to enter).
   >
   > A signal failing any screen is `observed_underway`: it is still
   > graded for information (its outcome may be recorded), but it is
   > **excluded from prospective performance**, and the pre-observation
   > facts are recorded with the grade. A signal whose horizon had
   > already closed at first-seen is `retrospective_context` (the screens
   > do not apply). If no TP1 level was published, availability cannot be
   > established and the row is `unverifiable` — excluded from
   > prospective tallies (fail closed). If no screen has failed but the
   > data needed to pass one is not yet available (an archive day inside
   > the pre-observation window is unpublished), grading **defers** to a
   > later run rather than guessing.
   >
   > **Modeled entry (v1.2).** A signal that passes the screens becomes a
   > prospective entry only at a **modeled entry price**: the modeled
   > entry price is the **open of the first Binance USD-M futures 1m bar
   > whose open time is ≥ our `first_seen` timestamp**. If that bar is
   > not yet available (archive unpublished), grading **defers** — no
   > earlier or later price is ever substituted. If the modeled entry
   > price is already beyond TP1 or beyond SL (price ran through a level
   > by the first bar after first-seen, without a recorded touch in the
   > pre-observation window), the row is **not** a prospective entry:
   > `entry_class = modeled_entry_unavailable`, with the fact recorded.
   > Prospective outcome measurement runs **from the modeled entry**
   > against the vendor's frozen TP1/TP2/TP3/SL levels (unchanged), first
   > touch deciding, same-minute rule as the judging rules below. **R is
   > computed off the modeled entry**: denominator = |modeled entry −
   > SL|; a TP outcome's R = (TP level − modeled entry) / denominator,
   > direction-aware; stop = −1R gross; expired = 0R gross. A round-trip
   > **cost of 0.18% of the modeled entry price** is applied in R terms
   > (cost_R = 0.0018 × modeled entry / |modeled entry − SL|) and
   > prospective rows report **gross R, cost R, and net R** (net = gross
   > − cost). The cost is a **modeling assumption** — the same derived
   > convention as the crypto book's reporting — not a vendor fact.
   >
   > **Tally discipline.** The prospective performance tally remains
   > **ZERO** — no eligible matured records — until a signal has
   > (i) been first seen passing the screens, (ii) been entered at a
   > modeled price, and (iii) matured under the frozen exit rules. No
   > prospective hit rate or R is stated before all three hold.

   **Pre-observation moves are excluded from prospective performance by
   construction.** The screens measure only what was true at the
   first-seen instant, and measurement starts at the modeled entry: if a
   level was touched pre-observation, the row is `observed_underway`
   **regardless of the later outcome** — a pre-observation TP1 touch does
   not become a prospective win when the signal later reaches TP2, and a
   pre-observation SL touch does not become a prospective loss. Price
   action in [vendor `createdAt`, first_seen) never enters prospective
   performance in either direction.

   *Superseded (v1.1, 2026-10-21 → 2026-10-22):* v1.1 treated passing
   the screens above as sufficient for a prospective entry and measured
   R off the vendor's advertised entry. The expert correction: half the
   distance to target remaining does not make the original advertised
   entry obtainable; a prospective return must begin at a price
   available after our first observation, with costs and frozen exit
   rules recorded. v1.2 keeps the v1.1 screens as the gate and adds the
   modeled entry. No v1.1 record claimed `prospective_entry`, so no
   entry basis needed superseding; still-open signals grade under v1.2
   when they mature.
5. **No independent confirming vote.** TraderSpy's signals are price/TA-derived,
   like our own model. TraderSpy agreeing with a discovery candidate is
   correlated input, never independent confirming evidence, and earns no vote
   in any research prioritization. (The wallet layer, if added later, needs
   Hyperliquid traders deduplicated against the existing whale watch.)

## Judging rules (vendor's published rules, applied to frozen levels)

- Levels are frozen in the `first_seen` ledger record: entry price and
  TP1/TP2/TP3/SL as absolute prices computed from the vendor's percentages
  (side-aware), with the raw percentages kept alongside.
- Scan convention: Binance USD-M futures 1m bars from the minute containing
  the vendor `createdAt` up to horizon close; long touches on high/low,
  short mirrored.
- Outcome = highest TP reached **before** the stop was touched. A stop
  touched in the same 1-minute bar as a TP counts as stopped — that TP does
  not count. Neither touched by horizon close = `expired`.
- **R convention:** for informational rows (`observed_underway`,
  `retrospective_context`), risk = |vendor entry − SL|; a TP outcome
  scores |TP − entry| / risk at the highest TP touched; stop = −1R;
  expired = 0R. For **prospective rows** (`prospective_entry`), R is
  computed off the **modeled entry** instead (rule 4): denominator
  |modeled entry − SL|, TP R direction-aware, stop = −1R gross,
  expired = 0R gross, minus the 0.18% round-trip cost in R terms,
  reported as gross / cost / net. R is reported only over matured rows
  (see review reading below).

## Files

| File | Contents |
|---|---|
| `snapshot.py` | Collector. Appends `first_seen` records for new signal ids and `observation` records when a known signal's vendor status changes. Never overwrites. Also appends one vendor stats snapshot per run. |
| `grade.py` | Grader (`traderspy-grade-v1.2`; supersedes v1.1 and v1, whose records remain as history). Append-only grades keyed by signal id + grader version; idempotent. Appends `grade_correction` records re-labeling any v1 grade the v1.1 pass has not reached, and superseding the entry basis (modeled entry) of any v1.1 record that claims `prospective_entry`. Fresh grades apply the eligibility screens and, for prospective rows, the modeled entry with gross/cost/net R. |
| `ledger.jsonl` | `first_seen` + `observation` records. first_seen fields: signal_id, symbol, side, timeframe, importance, strategy_name, vendor_created_at, **snapshot_at (our first-seen anchor)**, entry_price, levels (absolute), levels_pct (raw), triggered_conditions, vendor_status_at_first_seen, vendor_raw. |
| `stats-snapshots.jsonl` | One record per snapshot run: our timestamp + the raw `/v1/signals/stats?period=7d` response, so vendor-claimed rates are tracked prospectively too. |
| `grades.jsonl` | Grade records (`grade` / `grade_correction`): outcome_class (`tp1_hit`/`tp2_hit`/`tp3_hit`/`stop`/`expired`/`vendor_profit_locked`/`unverifiable`), maturity (`prospective`/`retrospective_context` — first-seen vs horizon close only), **entry_class** (`prospective_entry`/`observed_underway`/`retrospective_context`/`modeled_entry_unavailable`/`unverifiable` — the binding eligibility label, rule 4) with an `eligibility` facts block (pre-observation touches, window coverage, vendor-exit check, price at first-seen, TP1-distance fraction remaining, deciding test), touches with first-touch times, r_multiple, vendor_status_latest, vendor_agrees, evidence_source. **Prospective-entry records (v1.2) additionally carry a `modeled_entry` block (price + bar open time, or the level it ran beyond) and `r_gross` / `r_cost` / `r_net` (+ `r_detail`) computed off the modeled entry; their `r_multiple` equals gross R.** `vendor_profit_locked` records carry `vendor_exit_claim` (price, time, flagged vendor-reported) instead of an R. A `grade_correction` record carries the prior version's outcome forward verbatim (unless its entry basis is superseded, in which case the outcome is re-scanned from the modeled entry) and adds a `corrects` pointer (signal id, prior grader version, prior outcome/maturity). **The current grade of a signal is its record under the highest grader version.** |
| `kline_cache/` | Downloaded Binance futures 1m day CSVs, reused across runs. |

## Schedule and request budget

- Cron job **`traderspy-pilot-snapshot`** (goal-owned: research-terminal),
  every 6 hours, runs `snapshot.py` then `grade.py`. Silent on success;
  the job body instructs reporting only failures.
- API limits (stated by the API): 300 requests/day, 10/minute, page max 50.
- Per run: 1 signals page + 1 stats call = 2 requests, plus signal-detail
  fetches only for newly graded `profit_locked` rows (capped at 5 per run).
  Per day: 4 runs × 2 = **8 base requests**, + at most ~4 detail fetches on a
  typical day (7 `profit_locked` rows appeared in the entire first week
  page) ⇒ **≈12 requests/day worst typical case, ~4% of the daily budget**,
  and never more than 7 requests in any single run (≤28/day absolute cap
  from this job). Binance archive downloads do not touch the TraderSpy budget.
- Coverage: the feed produces ~7 signals/day (46 in the trailing 7d stats);
  the newest-50 page spans ~7 days, so a 6-hourly snapshot cannot miss a
  signal aging off the page.

## First live run (2026-10-22T01:19–01:24Z)

- Snapshot: 50 signals on the newest page → **50 `first_seen` ledger rows**,
  each with our snapshot timestamp and frozen levels. Re-run appended 0
  (idempotent); stats snapshots appended once per run by design.
- Grader run 1: **33 graded** — 28 reconstructed TP/stop outcomes
  (13 stop, 7 tp3_hit, 4 tp2_hit, 4 tp1_hit; **vendor agreed on all 28**)
  and 5 `vendor_profit_locked` (detail-fetch cap). **15 still open, not
  graded.** 2 `profit_locked` rows deferred by the fetch cap.
- Grader run 2 (idempotency check): graded exactly those 2 deferred rows,
  35 grades total, **0 duplicate signal ids**. Final maturity split:
  **29 retrospective_context / 6 prospective** (the 5 `profit_locked` rows
  first seen live with their vendor exit claims captured, plus 1 stop —
  AIOTUSDT 4h, first seen ~11h before its horizon close, R −1.0).
- No `expired` grade has been handed to any immature row; the three signals
  the original verification draft wrongly called expired (TAO, ZRO, PAXG)
  sit in the ledger as `vendor_profit_locked` with the vendor's claims
  recorded and their horizons (to 2026-10-23/24) still open.

### Correction pass (2026-10-22, grader v1.1 — eligibility rule applied)

The split above ("29 retrospective_context / 6 prospective") used the v1
label, which counted any signal first seen before its horizon close as
prospective. Under the eligibility rule (rule 4), **all 6 of those rows
were already underway when first seen** and are re-labeled
`observed_underway` by appended `grade_correction` records (35 corrections:
6 `observed_underway`, 29 `retrospective_context` restated under v1.1;
0 deferred; a second run appended nothing — idempotent):

- **AIOTUSDT** (was: prospective stop, −1.0R) → `observed_underway`,
  test (a): its SL was touched 2026-10-20T05:29Z, ~44h **before** our
  first-seen (2026-10-22T01:19:51Z). The −1R is pre-observation price
  action and is **removed from prospective performance**.
- **BSVUSDT, TAOUSDT, ZROUSDT, BTCUSDT, PAXGUSDT** (were: prospective
  `vendor_profit_locked`) → `observed_underway`, test (b2): the vendor's
  documented exit precedes first-seen in every case (BSV 2026-10-21T22:00Z;
  TAO 2026-10-21T15:10Z; ZRO 2026-10-21T00:40Z; BTC 2026-10-20T01:10Z;
  PAXG 2026-10-20T06:00Z). The trades had already been exited by the
  vendor before we ever saw them. (Test (a) facts are recorded as scanned
  on available bars; the 2026-10-21/22 archive days were still
  unpublished at correction time and are disclosed as missing in each
  record — no record claims test (a) passed.)

**Corrected prospective tally: 0 matured `prospective_entry` rows.** No
prospective hit rate and no prospective R exist yet, and none will be
stated until genuinely eligible signals — first seen live, untouched, and
still meaningfully available at first sight — have matured under our own
snapshots. The 15 still-open ledger signals will be eligibility-tested at
grade time by v1.1 as they mature.

### Modeled-entry upgrade (2026-10-22, grader v1.2)

The expert's follow-up correction: the v1.1 screens alone do not
establish that the advertised entry was obtainable — half the distance
to target remaining is not an entry price. Grader v1.2 therefore adds the
**modeled entry** (rule 4): prospective measurement begins at the open
of the first futures 1m bar at/after first-seen, R is computed off that
price, and a 0.18% round-trip cost is reported as gross / cost / net.
At the upgrade, **no v1.1 record claimed `prospective_entry`** (all 35
were `observed_underway` or `retrospective_context`), so no entry basis
needed superseding and grades.jsonl gained no records from the upgrade
itself. **The prospective tally remains ZERO**: it stays zero until a
signal is first seen passing the screens, entered at a modeled price,
and matured under the frozen exits. The 15 still-open ledger signals
will be graded under v1.2 as they mature.

## How a Dec-16-style review reads the tallies

- Take each signal's current grade (highest grader version in
  `grades.jsonl`) and filter to **`entry_class == "prospective_entry"`**
  only. `observed_underway` and `retrospective_context` rows are
  background, never in the rate; `unverifiable` rows are reported as their
  own count with reasons.
- Count per outcome class over **matured rows only** (tp1/tp2/tp3/stop/
  expired). `still_open` rows are excluded from every rate until they
  mature.
- `vendor_profit_locked` is reported as its own line — inside neither the
  win count nor the loss count.
- Hit rate, when stated, = (tp1+tp2+tp3) / (tp1+tp2+tp3+stop+expired) over
  prospective-entry matured rows, always alongside total R and mean R over
  the same rows — prospective R read from the modeled-entry fields
  (`r_gross`, with `r_net` after the 0.18% round-trip cost reported
  beside it; `r_multiple` on those rows equals gross R) — and alongside
  the vendor-claimed rate tracked in `stats-snapshots.jsonl` over the
  same window.
