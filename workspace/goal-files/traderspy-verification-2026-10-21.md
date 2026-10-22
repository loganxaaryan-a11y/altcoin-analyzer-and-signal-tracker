# TraderSpy signal track record — independent verification (2026-10-21)

> **CORRECTION (2026-10-21, expert review — read first):** the original draft contained a material maturity error. Three 4h signals (TAO, ZRO — created Oct 20; PAXG — created Oct 19) were labeled "expired" on Oct 21 although their 4-day tracking horizons had not closed; under the frozen-level rules they were still **open**. Consequently the draft's "51.4% rebuilt win rate" and "better than a coin flip" claims are **withdrawn**: 18/35 is an observed TP1-first touch fraction over a maturity-incomplete sample, not a hit rate. Further corrections applied throughout: `profit_locked` is kept as a vendor-reported exit class (neither target win nor automatic loss); spot-fallback rows are cross-market checks, not exact verification of futures signals; entry-price plausibility does not prove timely publication (prospective snapshots are the corrective); and the 30 reproduced classifications support the sampled claims only, not a general verdict on the engine or any edge. Amended sections are marked CORRECTED; the original per-signal evidence table is preserved with corrected states.

**Question (Logan):** TraderSpy is "supposed to be pretty good." Is it?
**Method:** pulled the vendor's own signal feed and stats through the API, then rebuilt every verifiable resolved signal from independent Binance price data (1-minute bars, USD-M futures daily archives from data.binance.vision, spot REST as fallback) using the vendor's own published judging rules. Research only — nothing was wired into any pipeline.
**Evidence-matching caveat (expert correction, 2026-10-21):** these are futures signals. Rows rebuilt from the USD-M futures archives are futures-evidence checks. Any row where the spot REST fallback was used is a **labeled cross-market check, not exact verification** — spot and perp prices diverge, especially on thin names; the original draft did not mark which rows used the fallback, so the 30/30 reproduction claim should be read as "reproduced against futures data where available, cross-checked against spot otherwise," and per-row evidence type is recorded explicitly in the prospective pilot.

## Bottom line

- **The sampled TP/SL classifications reproduced.** Every TP/SL outcome claim I could check — 30 of 30 — reproduced exactly from independent exchange data, including one stop timestamp that matched the vendor's claimed stop time **to the minute**. That supports those 30 sampled claims. It does not, by itself, establish the engine's general honesty or any predictive edge.
- **The headline win rate is flattered.** The vendor advertises 67–68%. On the verified sample its own formula gives 65.7% — but 5 of its 23 "wins" are a category called `profit_locked` that never reached TP1 on the published levels (one of them actually hit the stop).
- **No matured hit rate can be stated for this sample yet (CORRECTED 2026-10-21, expert review).** 18/35 signals had touched TP1 before any stop *at evaluation time* — an observed target-touch fraction, not a hit rate: three of the sample (TAO, ZRO, PAXG) were still inside their 4-day tracking horizons on 2026-10-21 and remain open (see Correction below). Any "better than a coin flip" framing is withdrawn — it is unsupported on an immature sample and ignores target/stop geometry in any case.
- **Verdict:** the sampled TP/SL claims are reproducible (evidence grade **B** for those claims). `profit_locked` stays a **vendor-reported exit class (grade C)** — neither a verified target win nor automatically a loss; its exit price, announcement time and rule need separate verification. No verdict on predictive edge is offered or implied.

## What the vendor claims

`/v1/signals/stats` exists (the only stats windows offered are 4h / 8h / 24h / 7d — no 30-day or all-time view):

| Window | Signals | Reached TP1+ | Stopped | Pending | Claimed win rate |
|---|---|---|---|---|---|
| 24h (default) | 14 | 6 | 3 | 5 | **67%** |
| 7d | 46 | 27 | 13 | 6 | **68%** |

The endpoint documents its own rules, which I used verbatim: judged on 1-minute highs/lows after entry, for 24 candles of the signal's timeframe (24h for 1h signals, 4 days for 4h signals); outcome = highest TP reached **before** the stop was touched; a stop touched in the same minute as TP1 counts as stopped; neither touched by the end of tracking = `expired`; win rate = reached at least TP1 **(or a profit lock)** / closed signals, with open and expired signals excluded.

Endpoints probed: `/v1/signals/stats` ✓, `/v1/signals/<id>` ✓ (detail adds the vendor's claimed resolution timestamp and price), `/v1/stats` ✗ (404).

## The sample (no cherry-picking)

Primary sample = the full first page of the unfiltered feed, `GET /v1/signals?limit=50` (50 is the API's max page size), newest first, 2026-10-14 13:08Z → 2026-10-21 16:11Z. All 50 rows kept:

- Resolved 44: `stop` 16, `tp3_hit` 10, `profit_locked` 7, `tp2_hit` 6, `tp1_hit` 5
- Pending 6
- Mix: 31 × 1h, 19 × 4h; importance: 40 low, 9 medium, 1 high

I verified the first **40 resolved signals in returned order** (the task cap). A second page (importance=high, 50 rows, 2026-09-02 → 2026-10-16, all 4h) was pulled for the mix comparison in the survivorship section but not candle-verified.

## Verification results

Of the 40: **35 verifiable, 30 agree, 5 disagree — and all 5 disagreements are the same category** (`profit_locked`, below). The 5 unverifiable signals were all created on 2026-10-21 (BSV, BROCCOLIF3B, RECALL, PTB, Q — perp-only symbols with no spot pair; Binance's public futures archive for the current UTC day is not published yet and the live futures API is geo-blocked from this VM). They become verifiable tomorrow; they were excluded, not dropped silently.

Exact-class agreement on every non-`profit_locked` claim: **30/30 (100%)** — every `tp1_hit`, `tp2_hit`, `tp3_hit`, and `stop` reproduced exactly, at the right level, in the right order.

| Coin | TF | Side | Created (UTC) | Entry | Claimed | Reconstructed | Agree | Deciding evidence (1m bars) |
|---|---|---|---|---|---|---|---|---|
| FETUSDT | 1h | sell | 2026-10-21T14:00Z | 0.1936 | stop | stop | YES | SL 2026-10-21T15:11:00Z |
| KSMUSDT | 1h | sell | 2026-10-21T13:49Z | 4.237 | tp3_hit | tp3_hit | YES | TP1 13:57Z; TP2 13:59Z; TP3 14:00Z |
| CFGUSDT | 1h | sell | 2026-10-21T09:02Z | 0.1207 | stop | stop | YES | SL 2026-10-21T12:52:00Z |
| BMTUSDT | 4h | buy | 2026-10-21T07:52Z | 0.0199 | tp3_hit | tp3_hit | YES | TP1 09:38Z; TP2 09:41Z; TP3 09:54Z |
| TAOUSDT | 4h | buy | 2026-10-20T17:00Z | 272.96 | profit_locked | **open — horizon not reached** (CORRECTED) | NO | no touch yet; 4-day horizon runs to 2026-10-24 |
| ZROUSDT | 4h | buy | 2026-10-20T15:01Z | 1.9928 | profit_locked | **open — horizon not reached** (CORRECTED) | NO | no touch yet; 4-day horizon runs to 2026-10-24 |
| IOUSDT | 4h | buy | 2026-10-20T07:17Z | 0.1598 | tp1_hit | tp1_hit | YES | TP1 2026-10-20T17:14:00Z |
| SFPUSDT | 1h | sell | 2026-10-20T06:00Z | 0.2444 | stop | stop | YES | SL 2026-10-20T14:08:00Z |
| MIRAUSDT | 1h | sell | 2026-10-20T06:00Z | 0.04296 | stop | stop | YES | SL 2026-10-20T13:37:00Z |
| BTCUSDT | 4h | sell | 2026-10-19T16:03Z | 81826.1 | profit_locked | stop | NO | SL 2026-10-21T14:26:00Z |
| PAXGUSDT | 4h | sell | 2026-10-19T15:55Z | 4139.77 | profit_locked | **open — horizon not reached** (CORRECTED) | NO | no touch yet; 4-day horizon runs to 2026-10-23 |
| STOUSDT | 1h | sell | 2026-10-19T14:15Z | 0.03239 | tp1_hit | tp1_hit | YES | TP1 18:25Z (SL later 22:38Z) |
| INJUSDT | 1h | buy | 2026-10-18T23:00Z | 8.412 | tp2_hit | tp2_hit | YES | TP1 23:23Z; TP2 23:24Z |
| DASHUSDT | 1h | sell | 2026-10-18T14:00Z | 48.76 | tp3_hit | tp3_hit | YES | TP1 14:05Z; TP2 17:51Z; TP3 19:33Z |
| COLLECTUSDT | 1h | sell | 2026-10-18T13:49Z | 0.02144 | stop | stop | YES | SL 2026-10-18T14:37:00Z |
| SUSDT | 1h | buy | 2026-10-18T10:45Z | 0.05435 | tp2_hit | tp2_hit | YES | TP1 11:50Z; TP2 11:57Z (SL later 14:48Z) |
| AIOTUSDT | 1h | buy | 2026-10-17T17:01Z | 0.05332 | stop | stop | YES | SL 2026-10-17T21:38:00Z (TP touches came after) |
| MANAUSDT | 1h | sell | 2026-10-17T16:01Z | 0.08873 | tp2_hit | tp2_hit | YES | TP1 16:55Z; TP2 16:57Z (SL later 18:32Z) |
| AKTUSDT | 1h | sell | 2026-10-17T15:46Z | 0.7024 | tp3_hit | tp3_hit | YES | TP1 16:53Z; TP2 17:01Z; TP3 21:30Z |
| NMRUSDT | 4h | buy | 2026-10-17T08:04Z | 12.559 | stop | stop | YES | SL 2026-10-18T14:02:00Z |
| MITOUSDT | 1h | sell | 2026-10-16T18:50Z | 0.01377 | stop | stop | YES | SL 2026-10-16T20:06:00Z |
| GRIFFAINUSDT | 1h | sell | 2026-10-16T18:02Z | 0.015346 | stop | stop | YES | SL 2026-10-16T23:06:00Z (TP1 came after) |
| ENAUSDT | 1h | sell | 2026-10-16T17:00Z | 0.19951 | tp3_hit | tp3_hit | YES | TP1 17:19Z; TP2 next day 13:16Z; TP3 15:52Z |
| DOGEUSDT | 4h | sell | 2026-10-16T16:00Z | 0.08037 | tp1_hit | tp1_hit | YES | TP1 2026-10-18T19:30:00Z |
| FARTCOINUSDT | 1h | sell | 2026-10-16T16:00Z | 0.1548 | tp3_hit | tp3_hit | YES | TP1 16:51Z; TP2 17:15Z; TP3 next day 13:13Z |
| MELANIAUSDT | 1h | sell | 2026-10-16T15:18Z | 0.08532 | tp1_hit | tp1_hit | YES | TP1 2026-10-16T17:19:00Z |
| TRUMPUSDT | 1h | sell | 2026-10-16T14:00Z | 1.857 | tp3_hit | tp3_hit | YES | TP1 15:05Z; TP2 16:49Z; TP3 17:15Z |
| VELVETUSDT | 1h | sell | 2026-10-16T13:32Z | 0.07251 | tp1_hit | tp1_hit | YES | TP1 2026-10-17T11:42:00Z |
| SUPERUSDT | 4h | buy | 2026-10-16T11:25Z | 0.21436 | stop | stop | YES | SL 2026-10-16T17:18:00Z |
| HUMAUSDT | 1h | sell | 2026-10-16T04:00Z | 0.032292 | tp3_hit | tp3_hit | YES | TP1 05:41Z; TP2 06:01Z; TP3 06:04Z |
| WAXPUSDT | 1h | sell | 2026-10-16T01:42Z | 0.005091 | tp2_hit | tp2_hit | YES | TP1 16:01Z; TP2 17:18Z |
| CRVUSDT | 4h | buy | 2026-10-15T12:00Z | 0.3496 | profit_locked | expired | NO | no touch in window |
| ARIAUSDT | 4h | buy | 2026-10-15T07:34Z | 0.03457 | tp3_hit | tp3_hit | YES | TP1 12:24Z; TP2 13:40Z; TP3 next day 14:38Z |
| RSRUSDT | 1h | buy | 2026-10-15T02:03Z | 0.002005 | stop | stop | YES | SL 2026-10-15T02:24:00Z (TP touches came after) |
| AIOTUSDT | 4h | sell | 2026-10-18T12:00Z | 0.05155 | stop | stop | YES | SL 2026-10-20T05:29:00Z |

Unverifiable (excluded from the rate, not counted either way): BSVUSDT 4h (claimed profit_locked), BROCCOLIF3BUSDT 1h (tp2_hit), RECALLUSDT 1h (stop), PTBUSDT 1h (tp3_hit), QUSDT 1h (tp2_hit) — all created 2026-10-21, perp-only, current-day archive unpublished.

### Claimed vs reconstructed mix (verified 35) — CORRECTED 2026-10-21

| | TP1 touched first | Stop touched first | Expired (horizon closed, no touch) | Still open at evaluation |
|---|---|---|---|---|
| Vendor's labels | 23 (incl. 5 profit_locked) | 12 | 0 | 0 |
| Reconstructed (published levels) | 18 | 13 | 1 (CRV) | 3 (TAO, ZRO, PAXG) |

The difference is the 5 `profit_locked` rows: one (BTC) touched its published stop first; one (CRV) expired at horizon close; three had touched neither level and were **still inside their tracking horizons** — the original draft wrongly called them "expired" by evaluating a 4-day signal against a shorter window (see Correction). **No hit rate is stated for this sample**: 18/35 is the observed TP1-first touch fraction at evaluation time over a maturity-incomplete sample, and comparing it to a coin flip would ignore the target/stop geometry besides. A matured rate requires the open rows to resolve and the geometry (R terms) to be stated — the prospective pilot is built to produce exactly that.

## The profit_locked problem

`profit_locked` is counted as a win in the vendor's win rate ("reached at least TP1 **or a profit lock**"). In the verified sample, 5 of 35 resolved signals (14%) carry this label, and **none of the 5 ever reached TP1** on the published levels:

| Coin | TP1 needed | Best favourable move (MFE) | What actually happened |
|---|---|---|---|
| TAOUSDT | +3.29% | +3.09% | Neither touched yet — **still open** at evaluation (horizon to 2026-10-24) |
| ZROUSDT | +9.80% | +7.34% | Neither touched yet — **still open** at evaluation (horizon to 2026-10-24) |
| BTCUSDT | +1.96% | +0.77% | **Hit the stop** (−3.75% adverse vs 2.8% SL) |
| PAXGUSDT | +1.96% | +0.65% | Neither touched yet — **still open** at evaluation (horizon to 2026-10-23) |
| CRVUSDT | +5.95% | +4.83% | Neither touched by horizon close → expired |

It is not fabricated: the detail record shows a real mechanism — for BTC the vendor logged a lock at 81,279.4 (+0.67% favourable, 2026-10-20T01:10:01.903Z) and its claimed stop time (2026-10-21T14:26:00Z) matches my independently reconstructed first stop-touch **to the minute**. But the lock level is **not in the published signal** and the trigger rule is undocumented. **Standing treatment (expert review, 2026-10-21): `profit_locked` is a vendor-reported exit class — keep it as its own class. It is neither a verified target win nor automatically a loss.** Our grading never counts it as a target hit; it also never books it as a loss. Its exit price, announcement time and rule get verified separately (the prospective pilot captures all three at announcement time). The vendor counting it as a full "win" alongside TP3 hits is what inflates its headline rate; the correction on our side is separate accounting, not re-scoring to losses.

## Point-in-time (backfill) check — scope corrected 2026-10-21

For all 35 verified signals I compared the stated entry price to the actual 1-minute bar containing `createdAt`:

- **32/35** entries sit inside that minute's traded range.
- 3 exceptions, all small and all on illiquid symbols: BMTUSDT entry 0.80% below its entry minute's low; SFPUSDT −0.29% and MIRAUSDT −0.09% against flat one-price minutes (single-trade bars). Deviations under 1%, consistent with a different reference venue or a stale print on thin books.

**What this establishes and what it does not (expert correction):** an entry price inside its minute's range shows the price is *plausible for that minute*. It does **not** prove the signal was published at that time, and it does not exclude backfilling — a backfilled record would also carry a plausible price. The only corrective is prospective: timestamped snapshots taken by us at first sight of each signal. That is how the approved pilot collects from now on; this historical check is reported as plausibility only.

## Survivorship / selection read

- **The feed shows its losers.** Stops are the largest single class on the high-importance page (23/50) and 16/50 on the recent page; an `expired` row and live `pending` rows are shown as such. Nothing in the observable feed looks scrubbed.
- **Raw feed vs claimed stats:** the recent page's resolved mix is 28 wins / 16 stops (63.6% vendor-style); the high-importance page (Sep 2 – Oct 16) is 26 wins / 23 stops / 1 expired = **53.1%** — noticeably weaker than the advertised 67–68%, and that page predates the stats windows entirely (stats only cover 24h/7d, the most flattering recent stretch). Reconstructed, the high page would come out lower still once its 1 `profit_locked` is reclassified.
- One unreconciled mismatch: the 7d stats total (46 signals) is **less than** the number of signals the feed itself returns for the same trailing ~7 days (≥50). A few signals are outside the stats count for reasons not visible from outside (window edges or an unstated filter). Not proof of manipulation; worth knowing the stats are a subset, not the feed.
- The full history is deep — the list envelope reports **4,435 signals** retrievable via offset paging — so this is not a cherry-picked showcase of a dozen calls.
- Deleted-row detection is only observational: date sequences look continuous at the feed's normal cadence (~1 high-importance signal/day on the older page), with no suspicious gaps. Absence of evidence, stated as such.

## Limits (account / API)

Stated by the API itself (response headers on an authenticated call, 2026-10-21T23:59Z):

- **300 requests per day** — `X-RateLimit-Limit: 300`, `X-RateLimit-Reset: 1792627200` = 2026-10-22T00:00:00Z (daily window resets at midnight UTC). 286 remained after this session's ~14 calls.
- **10 requests per minute** — `X-RateLimit-Limit-Minute: 10` (9 remaining on the sampled call). This is the binding constraint on bulk work.
- `Retry-After` is an exposed header but no 429 was ever returned during this session (~25 API calls, spaced): **no throttling was actually hit**.

Observed behaviour:

- **Max page size is 50** — `limit=100` is rejected with an explicit "Must be at most 50" error. `offset` paging works and the envelope reports `total: 4435`, `hasMore`. Paging the entire history = 89 requests ≈ 30% of one day's budget and ≥9 minutes at the per-minute cap.
- The stats endpoint accepts only `period` ∈ {4h, 8h, 24h, 7d} plus a `strategy` filter.

**Not stated by the API:** no account, usage, limits, or subscription endpoint exists — `/v1/me`, `/v1/account`, `/v1/usage`, `/v1/limits`, and `/v1/subscription` all return 404. The plan/tier name, any per-endpoint quotas beyond the two rate headers, and any fair-use terms are **not stated by the API** and are not guessed here.

## Verdict (corrected 2026-10-21)

What is established: the 30 sampled TP/SL classifications reproduced exactly from independent data, claimed event timestamps were accurate to the minute on the checked rows, and the feed displays its losers. That supports **those sampled claims (grade B)** — nothing more. It does not establish the engine's general honesty, and it says nothing about predictive edge: no matured hit rate exists for this sample (3 rows still open at evaluation), no R accounting is possible from the vendor's published fields, and the advertised 67–68% leans on counting `profit_locked` (14% of resolved signals in-sample, none of which reached TP1 on published levels, one an outright stop) as wins and on excluding expired signals from the denominator.

**Standing treatment going forward:** TraderSpy is approved for a small prospective caller-ledger pilot — timestamped snapshots at first sight, grading only at horizon close or a documented exit, `profit_locked` kept as its own vendor-reported class, futures evidence for futures signals. Its signals are external research leads and separately graded calls; agreement with our own price-derived model earns **no** independent confirming vote (correlated inputs). The wallet layer may add observations later, with Hyperliquid traders deduplicated against our existing whale watch.

*Sources: TraderSpy API via the registered connector (2026-10-21); Binance USD-M futures 1m daily archives + spot klines, data.binance.vision. Vendor judging rules quoted from `/v1/signals/stats` `howToRead`. Sample and reconstruction scripts retained in the working directory of this run.*
