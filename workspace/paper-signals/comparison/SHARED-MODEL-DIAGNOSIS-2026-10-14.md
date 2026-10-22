# SHARED-MODEL DIAGNOSIS — 2026-10-14

**Scope:** the shared prediction model `crypto-dossier-factor-agreement v2.0.0` (11 factors, weight 17.0) that sits under both the dossier engine and the paper engine. **Retrospective/development data only — diagnosis, no tuning.** No weight, threshold, stop, target, or feature changes; no production or holdout changes. The frozen prospective comparison (production vs C-2) was not touched.

**Standing:** legacy dossier population as of 2026-10-14 — crypto 3/22 = 13.6%, equity 10/36 = 27.8%, **combined 13/58 = 22.4%** (source: `hidden_files/signal-accuracy/signal-accuracy-2026-10-14.md`). The user's framing (12/60 = 20.0%, crypto expectancy −0.71 R, −124% over 56 bets net of costs) was the 10-13 restatement; the underlying facts are unchanged.

**Sources:** the independent first-touch grading ledger (`crypto_grades_2026-10-14.json`, `equity_grades_2026-10-14.json`), the retrospective diagnosis series (`diagnosis-2026-10-13-v4`…`v10.json`, `diagnosis-legs-v7.json`, `horizon-observations-v7.csv`), and saved candle snapshots. All outcome columns are RECONSTRUCTED from the independent walk over frozen contract terms, net of 18 bps costs throughout.

---

## 1. Per-loss attribution (45 closed losses, record by record)

**Attribution rule** — each loss carries three independent dimensions (from the v4/E1 split):
- (a) **direction@d5** — close at issuance+5d on the signal's side of entry (yes/no)
- (b) **target-before-stop** — first-touch verdict (all rows here are MISS)
- (c) **recovery@5d** — target zone reached within 5 calendar days *after* the invalidation touch (yes/no/insufficient-data)

Buckets:
- **DIRECTION WRONG** := d5 direction = no. Price never went the signal's way.
- **ENTRY TIMING WRONG** := d5 = yes AND recovery@5d = yes. Direction eventually right; the entry was stopped out before the move (a wider/differently-timed entry would have worked).
- **EXIT FRAMING WRONG** := d5 = yes AND recovery@5d = no. Direction was right at the horizon, but the target/invalidation geometry produced a loss anyway (stop touched on the path, target never reached within the window).
- **UNCERTAIN** := either dimension unknowable (window incomplete as of the 2026-10-14 cutoff).

### Counts

| Bucket | n / 45 | crypto | equity |
|---|---|---|---|
| DIRECTION WRONG | **39 (86.7%)** | 15 | 24 |
| ENTRY TIMING WRONG | **0 (0%)** | 0 | 0 |
| EXIT FRAMING WRONG | **1 definitive** | 1 | 0 |
| UNCERTAIN | 5 | 3 | 2 |

Of the 40 fully evaluable losses: **39 direction-wrong (97.5%), 1 exit-framing, 0 entry-timing.** Two of the five uncertain rows lean exit-framing (see notes); none can become entry-timing on current evidence. **Zero recoveries in 29 complete 5d post-stop windows** — no observed loss would have been saved by a wider stop.

### Full attribution table

| group | id | symbol | dir | d5 direction | recovery@5d | bucket | note |
|---|---|---|---|---|---|---|---|
| crypto | 10 | LINK | long | no | no | DIRECTION WRONG |  |
| crypto | 15 | BTC | long | yes | no | EXIT FRAMING WRONG | entry 84559, inv 82445.03, t1 87729.96; d5 close +0.99%; inv touched 10-08 on the flush; t1 never reached in 5d after stop |
| crypto | 16 | ETH | long | no | no | DIRECTION WRONG |  |
| crypto | 17 | LINK | long | no | no | DIRECTION WRONG |  |
| crypto | 19 | BTC | long | no | insufficient-data | DIRECTION WRONG |  |
| crypto | 20 | BTC | long | no | insufficient-data | DIRECTION WRONG |  |
| crypto | 21 | SOL | long | no | no | DIRECTION WRONG |  |
| crypto | 22 | ETH | long | no | no | DIRECTION WRONG |  |
| crypto | 23 | ETH | long | no | no | DIRECTION WRONG |  |
| crypto | 24 | SOL | long | no | no | DIRECTION WRONG |  |
| crypto | 25 | LINK | long | no | insufficient-data | DIRECTION WRONG |  |
| crypto | 26 | BTC | long | no | no | DIRECTION WRONG |  |
| crypto | 27 | XRP | long | no | no | DIRECTION WRONG |  |
| crypto | 28 | ETH | long | no | insufficient-data | DIRECTION WRONG |  |
| crypto | 29 | BTC | long | no | insufficient-data | DIRECTION WRONG |  |
| crypto | 30 | ETH | long | yes (+0.02%, borderline) | no | DIRECTION WRONG | stopped same-day 10-08; d5 exactly +0.02% — classified direction-wrong on substance (max favorable excursion only 30% of target distance), borderline disclosed |
| crypto | 34 | STRK | long | na | insufficient-data | UNCERTAIN | d5 window ends 10-17 |
| crypto | 36 | ETH | long | na | insufficient-data | UNCERTAIN | d5 window ends 10-17 |
| crypto | 37 | AVAX | long | na | insufficient-data | UNCERTAIN | d5 window ends 10-17 |
| equity | 6 | TSLA | short | no | no | DIRECTION WRONG |  |
| equity | 8 | CL=F | long | no | no | DIRECTION WRONG |  |
| equity | 10 | IWM | short | no | no | DIRECTION WRONG |  |
| equity | 12 | HD | short | no | insufficient-data | DIRECTION WRONG | high-conviction −85/−95 short band |
| equity | 15 | AMD | long | yes | insufficient-data | UNCERTAIN | **new MISS 2026-10-14**: entry 615.73, inv 586.00, t1 660.32, held 12d, d5 +5.47%; recovery window ends 10-18 — lean EXIT FRAMING |
| equity | 19 | RELIANCE.NS | short | no | no | DIRECTION WRONG | high-conviction −85/−95 short band |
| equity | 20 | JIOFIN.NS | short | no | no | DIRECTION WRONG | high-conviction −85/−95 short band |
| equity | 24 | SUI | short | no | no | DIRECTION WRONG |  |
| equity | 26 | COST | short | no | no | DIRECTION WRONG |  |
| equity | 27 | 6411.TWO | long | yes | insufficient-data | UNCERTAIN | inv touched 10-13 (cutoff day), held 11d; recovery window ends 10-18 — lean EXIT FRAMING |
| equity | 28 | AMZN | short | no | no | DIRECTION WRONG |  |
| equity | 29 | INTC | long | no | no | DIRECTION WRONG |  |
| equity | 30 | TCS.NS | short | no | insufficient-data | DIRECTION WRONG |  |
| equity | 35 | MDT | short | no | insufficient-data | DIRECTION WRONG |  |
| equity | 36 | BSE.NS | short | no | no | DIRECTION WRONG | high-conviction −85/−95 short band |
| equity | 37 | CL | short | no | no | DIRECTION WRONG | high-conviction −85/−95 short band |
| equity | 39 | COPA | short | no | no | DIRECTION WRONG |  |
| equity | 41 | 0221.KL | long | no | insufficient-data | DIRECTION WRONG |  |
| equity | 42 | CL=F | long | no | no | DIRECTION WRONG |  |
| equity | 43 | VEDL.NS | short | no | no | DIRECTION WRONG | high-conviction −85/−95 short band |
| equity | 44 | HG=F | short | no | no | DIRECTION WRONG |  |
| equity | 45 | PEP | short | no | insufficient-data | DIRECTION WRONG |  |
| equity | 47 | WMT | short | no | no | DIRECTION WRONG | high-conviction −85/−95 short band |
| equity | 48 | MDLZ | short | no | no | DIRECTION WRONG | high-conviction −85/−95 short band |
| equity | 50 | EMR | long | no | insufficient-data | DIRECTION WRONG |  |
| equity | 51 | BTC-USD | long | no | no | DIRECTION WRONG |  |
(AAPL id17 closed **HIT** on 2026-10-14 — not a loss, excluded from attribution.)

### Most instructive examples
- **BTC id15 (crypto) — the one pure EXIT FRAMING case.** Direction was right at d5 (+0.99%), but the invalidation was touched on the 10-08 flush before the target, and the target was never reached in the 5 days after the stop. Entry timing was fine; the path killed it.
- **AMD id15 (equity) — pending, likely exit-framing.** Direction was clearly right (+5.47% at d5), the call survived 12 days, but the target (+7.25%) was never reached and invalidation eventually touched on 10-13. If the target zone is reached by 10-18 it reclassifies to entry-timing; on current evidence it is a framing case.
- **ETH id30 (crypto) — the borderline.** Stopped on the signal day; d5 reads +0.02% (a mechanical "yes") while price never went more than 30% of the way to target. Classified direction-wrong with the knife-edge disclosed — the mechanical rule would mislabel it.
- **The −85/−95 equity short band (ids 12, 19, 20, 24, 30, 36, 37, 43, 47, 48): 0/10, every one stopped on invalidation wicks into a grinding rally.** The highest-conviction shorts are the worst-performing cohort.

---

## 2. Model vs simple baselines — identical opportunities, 18 bps costs

**Barrier block** (first-touch exits at the signal's own levels; counter-directional legs use correctly-oriented mirrored risk/reward levels — genuine independent strategies, v6+ construction). Eligible set: 70 rows with complete d5 horizon data, identical for every leg. Per-row R multiples recomputed from `diagnosis-legs-v7.json` (net of 18 bps). Means over definitive rows only; uncertainty (TU/AMBIGUOUS/OPEN) preserved, never substituted.

| leg | crypto: hit rate | crypto E[R] | equity: hit rate | equity E[R] | combined: hit rate | combined E[R] |
|---|---|---|---|---|---|---|
| **model (signal)** | 3/18 = **16.7%** | **−0.637 R** | 8/33 = **24.2%** | **−0.456 R** | 11/51 = **21.6%** | **−0.520 R** |
| always_long | 2/18 = 11.1% | −0.776 R | 21/34 = **61.8%** | **+0.483 R** | 23/52 = 44.2% | +0.048 R |
| always_short | 14/17 = **82.4%** | **+1.006 R** | 4/32 = 12.5% | −0.750 R | 18/49 = 36.7% | −0.141 R |
| random_dir (seed 20261013) | 9/18 = 50.0% | +0.197 R | 9/34 = 26.5% | −0.400 R | 18/52 = 34.6% | −0.193 R |

**Fixed d5-horizon block** (n=70, exit at d5 close regardless of barriers — the buy-and-hold comparison):

| leg | direction@d5 | mean net % |
|---|---|---|
| **model (own direction)** | 24/70 = **34.3%** | **−1.461%** |
| buy-and-hold (always long) | 34/70 = **48.6%** | **−0.391%** |
| random_dir | — | −1.052% |

Read:
- The model underperforms **every** baseline on the identical opportunity set — including a single seeded coin flip with the same invalidation/target structure (random_dir: 34.6% hit, −0.19 R vs model 21.6%, −0.52 R). The model's direction picks are worse than chance with identical trade structure.
- The baselines are regime mirrors of each other: in the crypto sample (Oct 6–8 flush) always_short printed +1.01 R / 82.4%; in the equity sample (grinding rally) always_long printed +0.48 R / 61.8%. The model lost in both regimes — it was long into the flush and short into the rally.
- Buy-and-hold beats the model on direction (48.6% vs 34.3%) and on mean return (−0.39% vs −1.46%) at the fixed d5 horizon.
- On the full definitive set (the 56 bets behind the −124% figure): signal mean −2.215%, total −124.0%; crypto E −0.708 R, equity E −0.400 R; buy-and-hold −0.245% mean (−13.7% total), always_long −1.406%, random −1.107% (v4; random leg later found degenerate and replaced — the v7 seeded random_dir above is the valid construction).

---

## 3. Failure patterns (top 3 — hypotheses for later, not fixes)

**P1. Crypto: 19/19 losses are longs issued into a market that only fell.**
16 of 19 are pure direction-wrong; invalidation touches cluster 2026-10-07/08 (the flush); crypto-long direction@d5 is 4/19 = 21.1%. Entries were *not* chased (24h pre-entry chase ratios 0.02–0.86, median ~0.2 of target distance — v3), so this is not an entry-timing story. The pre-registered regime-gate hypothesis **H-1R** (block crypto longs when trailing-72h BTC return < 0) was **REJECTED**: both regimes were all-misses, the gate has no directional validity, and all crypto winners sat outside the evaluable window. The failure is the direction model itself, not a timing filter on top of it.

**P2. Equity: shorts systematically calling tops into a grinding rally.**
18 of 26 equity misses are shorts. Equity shorts: target-before-stop 10% vs longs 50%; direction@d5 yes 5% vs 57% — a 40–52pp gap that is direction failure, not framing (d5-yes 5% confirms). The high-conviction −85/−95 short band is 0/10. Every one was stopped on invalidation wicks while buy-and-hold went up 60% of the time at d5. This is the H-2 hypothesis (suspend equity shorts pending a dedicated short methodology) — pre-registered, awaiting authorization; **not** a production change.

**P3. The trade mechanics are exonerated — geometry doesn't separate, scores don't separate.**
0/29 complete 5d post-stop windows ever reached the target (no loss would have been saved by a wider stop); reward:risk ≈ 1.5× and risk% ≈ 3–4% are identical for hits and misses; crypto confidence scores are 62.3 for hits vs 62.3 for misses (no score filter is supported). Both deployed settlement read models have settled **0** rows — the independent ledger is the only measurement that exists. Nothing about stops, targets, or score cutoffs explains the losses; the direction call does.

**What this rules out:** wider stops · chased entries · stop/target geometry · the H-1R trailing-return regime gate · confidence-score filters.

**Hypotheses for later (specified, not run):** H-2 (equity-short suspension trial — pre-registered, Logan's call); a direction-model rebuild per the user's 40%-hit-rate rule; a crypto-long issuance discriminant other than trailing BTC return (H-1R's formulation failed; the flush killed both regimes).

---

## 4. Caveats
- n is small (40 evaluable losses, 51–70 rows per baseline leg); d14/d30 horizons are unevaluable (no signal old enough); 5 losses remain UNCERTAIN pending complete windows.
- Crypto always_short +1.01 R is a small-sample regime artifact of the Oct 6–8 flush (n=17 definitive), not a strategy endorsement.
- Random_dir is one seeded stream (20261013) — its −0.19 R is a single realization; the point stands that the model trails it.
- The frozen prospective comparison (production vs C-2) was not touched by this work.
