# Performance Reconciliation — 2026-10-14

**Scope:** paper signals only. No model tuning, no rebuild, no historical records rewritten.
**Question:** reconcile "13/58 = 22.4%" vs "12/60 = 20.0%", define the 56-bet population
behind "−0.71 R crypto expectancy", and identify exactly what "−124%" is.

**Verdict:** all four figures reconcile. 13/58 and 12/60 are different snapshots of the
same graded legacy/reconstructed population, differing by (a) 2 newly closed equity
signals (id15 MISS, id17 HIT, both closed 2026-10-13) and (b) 4 equity rows moved from
definitive-MISS to TIMING-UNVERIFIED under the CE-002 same-day rule. The 56-bet
population is the v3-definitive subset (not the headline 60). −124% is the arithmetic
SUM of the 56 per-bet net returns (n × mean), not a compounded portfolio return
(which would be −72.8% on the same rows).

---

## 1. Record identity — 13/58 vs 12/60

### 1a. "12/60 = 20.0%" (2026-10-13)

- **Source:** `~/workspace/goals/research-terminal/hidden_files/signal-accuracy/signal-accuracy-2026-10-13.md`
  §1 headline (as cited in `OPERATIONAL-METRICS-2026-10-14.md` §D2 "dossier legacy").
- **Snapshot:** daily pass of 2026-10-13. Equity bars through 10-13 close; crypto 4h blocks
  through the 10-13 pull.
- **Population:** tracker-inclusive dossier legacy — 79 tracked rows (50 equity ids 3–52 +
  29 crypto ids 10–38).
- **Evaluator:** independent first-touch walk (crypto: CoinGecko /ohlc 4h close-time-interval
  corr2 semantics + CE-003 issuance-boundary rule; equity: Yahoo daily bars + CE-002
  same-day rule). **Not** the deployed `crypto-evaluation-v4-cohort-contract` and **not**
  `equity-eval-3.2.0` — per E3 of the same file, `outcome=RECONSTRUCTED` for every row and
  the deployed v4 contract had settled **0** of these rows. Terms were `FROZEN-CONTRACT`.
- **Denominator construction (60 definitive = 12 HIT + 48 MISS):**
  - Crypto 3/22: ids 10–38, definitive HIT ids {12, 14, 18} + 19 MISS. (TIMING-UNVERIFIED
    ids 11, 13 and OPEN ids 31, 32, 33, 35, 38 excluded.)
  - Equity 9/38: 34 v3-definitive (9 HIT + 25 MISS) **plus the 4 CE-002 same-day rows
    counted as definitive MISS per tracker settlement**: id11 (MU), id14, id38 (COPL),
    id46 (INFY). AMBIGUOUS 2 excluded.
- **Fixtures/replays:** none present. Paper-cohort rows id39 (created 10-13T10:07:29Z) and
  id40 were not in this file's crypto rows (ids stopped at 38).

### 1b. "13/58 = 22.4%" (2026-10-14)

- **Source:** `~/workspace/goals/research-terminal/hidden_files/signal-accuracy/signal-accuracy-2026-10-14.md`
  §1 (population rule 2026-10-14: legacy/reconstructed only; paper-cohort rows removed).
- **Snapshot:** daily pass of 2026-10-14; crypto candles pulled 10-14 ~08:00Z; equity bars
  through 10-13 close.
- **Population:** strict v3-definitive legacy/reconstructed — 58 definitive = 13 HIT + 45 MISS.
- **Evaluator:** same independent first-touch walk as 10-13 (corr2 + CE-003 / Yahoo daily +
  CE-002). Still not the deployed evaluators.
- **Denominator construction:**
  - Crypto 3/22 — the same 22 definitive rows and the same 3 HITs as 10-13. The JSON
    (`crypto_grades_2026-10-14.json`) gained two rows vs 10-13 — **id39 (S long, walked HIT)
    and id40 (HYPE short, OPEN) — but both are EXCLUDED from the published figure as
    market-data replays** per the 2026-10-14 reclassification (§1c). Counterfactual: if
    counted, crypto would be 4/23 and combined 14/61 = 23.0%.
  - Equity 10/36: 10 HIT + 26 MISS. The 4 CE-002 rows (ids 11, 14, 38, 46) are now
    TIMING-UNVERIFIED and excluded from the denominator (unlike the 10-13 headline).

### 1c. Record-level diff (12/60 → 13/58)

| Change | Numerator | Denominator |
|---|---|---|
| Baseline (10-13 headline) | 12 | 60 |
| + equity id17 (AAPL long s75): OPEN → **HIT**, closed 2026-10-13 | +1 | +1 |
| + equity id15 (AMD long s85): OPEN → **MISS**, closed 2026-10-13 | +0 | +1 |
| − equity ids 11, 14, 38, 46: definitive-MISS → TIMING-UNVERIFIED (CE-002 same-day rule; §6: tracker settles definitively, independent method withholds) | +0 | −4 |
| Crypto: id39/id40 added to JSON, excluded as replays → no change | +0 | +0 |
| **Reconciled (10-14)** | **13** | **58** |

Check: 60 + 2 − 4 = 58; 12 + 1 = 13. ✓ Crypto definitive identical both days (3/22).
The two figures never shared a population on the equity side: the 10-13 headline used a
tracker-inclusive 9/38, while the 10-13 diagnosis section (§D1) and the 10-14 report both
use the strict v3-definitive equity count (9/34 → 10/36). Fixtures/replays (P3, 120 rows)
are excluded from both.

---

## 2. The 56-bet population behind "−0.71 R crypto expectancy"

### 2a. Inclusion criteria (exact, reproducible)

The population is the **v3-definitive subset** of the legacy/reconstructed graded rows —
identical to the "Contract totals" 12/56 in signal-accuracy-2026-10-13.md §D1. Inclusion
rule, applied in `diagnose-2026-10-13.py::item3` / `baselines_v4`:

1. Row belongs to the legacy/reconstructed graded population (dossier tracker rows).
2. `verdict ∈ {HIT, MISS}` under the independent v3 first-touch walk (TARGET-BEFORE-STOP
   ordering: crypto corr2 4h close-time intervals + CE-003; equity Yahoo daily + CE-002).
3. OPEN, TIMING-UNVERIFIED, AMBIGUOUS, STALE, UNVERIFIED rows excluded. In particular the
   4 equity CE-002 same-day rows (ids 11, 14, 38, 46) are **out** — this is why it is 56
   and not the headline 60.
4. Fixtures, replays, prospective-paper rows: **out** (separate populations P1/P3).
5. Terms frozen at issuance (`terms=FROZEN-CONTRACT`); outcomes reconstructed
   (`outcome=RECONSTRUCTED`) — the deployed `crypto-evaluation-v4-cohort-contract`
   settled 0 of these rows (E3); `equity-eval-3.2.0` governs production issuance params,
   not these verdicts.

Reproduce: `./reproduce-diagnosis-v4.sh` in
`~/workspace/goals/research-terminal/hidden_files/signal-accuracy/` (re-ran 2026-10-14
to extract per-row returns for this reconciliation; deterministic, committed inputs).

### 2b. The 56 records

**Crypto (22)** — HIT ids {12 (ZRO long), 14 (SOL long), 18 (BTC short)} + 19 MISS:
ids 10 (LINK long), 15 (BTC long), 16 (ETH long), 17 (LINK long), 19 (BTC long),
20 (BTC long), 21 (SOL long), 22 (ETH long), 23 (ETH long), 24 (SOL long),
25 (LINK long), 26 (BTC long), 27 (XRP long), 28 (ETH long), 29 (BTC long),
30 (ETH long), 34 (STRK long), 36 (ETH long), 37 (AVAX long).

**Equity (34)** — HIT ids {3 (AAPL long), 5 (NVDA long), 18 (TECHM.NS short),
21 (ADANIENT.NS short), 22 (PLTR long), 23 (SPY long), 25 (NVDA long),
33 (PTIR long), 34 (PLTR long)} + 25 MISS: ids 6 (TSLA short), 8 (CL=F long),
10 (IWM short), 12 (HD short), 19 (RELIANCE.NS short), 20 (JIOFIN.NS short),
24 (SUI short), 26 (COST short), 27 (6411.TWO long), 28 (AMZN short),
29 (INTC long), 30 (TCS.NS short), 35 (MDT short), 36 (BSE.NS short),
37 (CL short), 39 (COPA short), 41 (0221.KL long), 42 (CL=F long),
43 (VEDL.NS short), 44 (HG=F short), 45 (PEP short), 47 (WMT short),
48 (MDLZ short), 50 (EMR long), 51 (BTC-USD long).

### 2c. Evaluator and cost treatment

- **Return construction** (`baselines_v4`): first-touch realized return at the row's own
  levels — exit at the first invalidation/target touch (directional), marked at data end
  if untouched. Signal, buy-and-hold, always-long, and random-direction baselines use
  identical assets, entry timestamps, horizons, and costs.
- **Costs: 18 bps roundtrip deducted from EVERY return**, signal and baselines alike
  (script: `per["cost"] = "18bps roundtrip deducted from every return (signal and baselines)"`).
  In R terms, cost is converted to risk units: `cost_r = 18bps × entry / |entry − inv|`.
- **R definition** (`item3`): HIT → `r_multiple(entry, inv, t1) − cost_r` (t1 distance in
  units of risk); MISS → `−1.0 − cost_r` (full risk loss plus cost). Expectancy = mean of
  the 22 crypto R multiples: (3 × 1.434 + 19 × (−1.047)) / 22 = **−0.708 → −0.71 R**
  (equity: (9 × 1.436 + 25 × −1.059) / 34 = **−0.40 R**). Matches §D3/E4.

---

## 3. "−124%": what it is, step by step

**Answer: it is the arithmetic SUM of the 56 individual per-bet net returns. It is not a
compounded portfolio return.**

Computation, from the same `baselines_v4` that produced the published table:

1. For each of the 56 bets, take the first-touch realized return at own levels, net of
   18 bps roundtrip (values in R/% are the `r_sig` series; crypto mean −3.523%,
   equity mean −1.368%; crypto avg win +4.030% / avg loss −4.715%; equity avg win
   +4.655% / avg loss −3.537%).
2. **SUM the 56 returns:** Σ rᵢ = **−124.021%** → published as "total −124.0%".
3. Identity check: mean (−2.215%) × n (56) = −124.04% ✓. The "total" column is exactly
   n × mean — a restatement of the mean, containing no additional information.
4. **Compounded alternative on the same 56 rows:** Π(1 + rᵢ) − 1 = **−72.8%** — a
   different number. The script never computes a product; every "total" in §D4/E4 is a sum
   (de-duped check: −1.893% × 41 = −77.6% ✓; buy-and-hold: −0.245% × 56 = −13.7% ✓).

**Correct interpretation for reporting:** "−124%" = Σ per-bet returns; report it as
**"sum of per-trade net returns (−124.0% = 56 × −2.215%)"**, never as a portfolio P&L.
As a portfolio figure it would be misleading: the bets overlap in time (e.g. the BTC
long cluster ids 31/32/35/38 and the 10-07/08 flush cohort), so the sum implies deploying
56× capital simultaneously and scales arbitrarily with n. The honest quantities are the
per-bet mean (−2.22%), the R-expectancy (−0.71 R crypto / −0.40 R equity), and the
baseline comparisons (signal underperforms buy-and-hold, always-long, and random-direction
on identical assets/timestamps/costs). The de-duplicated pass (41 rows, mean −1.89%,
sum −77.6%) partially addresses the overlap; buy-and-hold de-duplicated turns positive
(+0.87%) while the signal stays negative.

---

## 4. Reconciled performance table

| Figure | Value | Population | Evaluator | Snapshot | Correct interpretation |
|---|---|---|---|---|---|
| 12/60 = 20.0% | 12 HIT / 60 | Dossier legacy, tracker-inclusive: 29 crypto (3/22) + 50 equity (9/38, incl. 4 CE-002 rows as tracker-settled MISS) | Independent first-touch walk (corr2+CE-003 / Yahoo+CE-002); deployed evaluators settled 0 rows | 2026-10-13 daily pass | Hit rate on the looser 10-13 headline population; superseded for equity by the strict v3 count |
| 13/58 = 22.4% | 13 HIT / 58 | Dossier legacy, strict v3-definitive: 22 crypto (3/22) + 36 equity (10/36); id39/id40 excluded as replays | Same independent first-touch walk | 2026-10-14 daily pass (~08:00Z candles) | Current combined hit rate; reconciles to 12/60 via §1c |
| −0.71 R | crypto expectancy | v3-definitive 56-bet subset: 22 crypto + 34 equity (§2b IDs) | `item3`: HIT → t1-risk multiple − cost_r; MISS → −1 − cost_r | Same inputs as 2026-10-13 §D3/E4 | Mean R multiple per crypto bet, net of 18 bps roundtrip. (Equity: −0.40 R.) |
| −124% | Σ rᵢ, 56 bets | Same 56-bet subset | `baselines_v4` first-touch realized returns, 18 bps roundtrip off every return | Same | **Sum of per-bet net returns** (= 56 × −2.215%). NOT compounded (compound = −72.8%). Report as sum, never as portfolio P&L. |

### Flags

- **None of the four figures is unreconcilable.** The apparent contradictions are all
  accounted for: (i) 12/60 vs 13/58 = snapshot + the §1c record diff; (ii) 56 vs 60 =
  the 4 CE-002 rows counted definitive in the 10-13 headline but TIMING-UNVERIFIED in
  the v3 subset; (iii) −124% vs intuition = sum, not compound.
- **Watch item (not a contradiction):** the 10-13 report carried two parallel equity
  denominators in one document (headline 9/38 vs diagnosis 9/34). Anyone quoting
  "12/60" alongside "−0.71 R / −124%" should note the R and % figures are computed on
  the 56-subset, not the 60-headline. The 10-14 report unified on the strict count.
- **No figure draws on fixtures/replays (P3), prospective paper (P1), or the deployed
  evaluators.** The measurable prospective-paper baseline remains EMPTY (0 verified
  deployed-natural entries, 0 completed outcomes).
