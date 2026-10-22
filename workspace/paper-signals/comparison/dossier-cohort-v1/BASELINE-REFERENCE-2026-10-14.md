# Baseline Reference — Dossier Legacy Performance (reconciled)

**Written:** 2026-10-14 ~16:00 ET · **Authority:**
`comparison/PERFORMANCE-RECONCILIATION-2026-10-14.md` (reconciles every figure below)
**Purpose:** the fixed reference that future `dossier-cohort-v1` comparisons measure
against. Quote these figures exactly as defined here — never from memory, never
rounded differently, never with a different population.

Paper signals only. No model tuning. No historical records rewritten.

---

## The reconciled baseline: 12/60 = 20.0%

| Element | Definition |
|---|---|
| **Figure** | **12 HIT / 60 definitive = 20.0%** |
| **Population** | Dossier legacy, **tracker-inclusive**: 79 tracked rows (50 equity ids 3–52 + 29 crypto ids 10–38); 60 definitive = 12 HIT + 48 MISS |
| **Crypto** | 3/22 — HIT ids {12 (ZRO long), 14 (SOL long), 18 (BTC short)} + 19 MISS; TIMING-UNVERIFIED ids 11, 13 and OPEN ids 31, 32, 33, 35, 38 excluded |
| **Equity** | 9/38 — 34 v3-definitive (9 HIT + 25 MISS) **plus** the 4 CE-002 same-day rows (ids 11 MU, 14, 38 COPL, 46 INFY) counted as definitive MISS per tracker settlement; AMBIGUOUS 2 excluded |
| **Snapshot** | 2026-10-13 daily pass; equity bars through 10-13 close; crypto 4h blocks through the 10-13 pull |
| **Evaluator** | Independent first-touch walk (crypto: CoinGecko /ohlc 4h close-time-interval corr2 + CE-003 issuance-boundary rule; equity: Yahoo daily bars + CE-002 same-day rule). **Not** the deployed evaluators — per the source report, `outcome=RECONSTRUCTED` for every row and the deployed v4 contract had settled 0 of these rows. Terms `FROZEN-CONTRACT`. |
| **Source** | `hidden_files/signal-accuracy/signal-accuracy-2026-10-13.md` §1 headline (as cited in `OPERATIONAL-METRICS-2026-10-14.md` §D2) |

### Companion figures (same reconciliation, different cuts — do not mix populations)

- **13/58 = 22.4%** — the 2026-10-14 strict v3-definitive recount (22 crypto 3/22 + 36
  equity 10/36; id39/id40 excluded as replays; the 4 CE-002 rows moved to
  TIMING-UNVERIFIED). Reconciles to 12/60 via the record-level diff in the
  reconciliation doc §1c. Use 12/60 as the headline baseline; 13/58 is the
  current-day recount on the stricter population.
- **−0.71 R crypto expectancy** (−0.40 R equity) — computed on the **56-bet
  v3-definitive subset** (22 crypto + 34 equity), not the 60-headline: HIT →
  t1-risk-multiple − cost_r; MISS → −1 − cost_r; 18 bps roundtrip on every bet.
- **−124%** — the **arithmetic SUM of the 56 per-bet net returns**
  (56 × −2.215% = −124.0%). **Not a compounded portfolio return** (compound on the
  same rows = −72.8%). Report only as "sum of per-trade net returns", never as P&L.

### RETIRED — do not use

- **The 17.4% figure is retired and must not be used anywhere** — in reports,
  comparisons, prompts, or conversation. It is superseded by the reconciled 20.0%.

---

## Usage rule for future dossier-cohort-v1 comparisons

1. Compare `dossier-cohort-v1` graded outcomes (first-touch 5D/14D/30D, net of 18 bps
   round-trip, entered rows only) against **12/60 = 20.0%** as the legacy baseline,
   with the population definition above attached to every citation.
2. **No comparative verdict until the dossier cohort has ≥ 20 graded entered rows**
   (same discipline as the no-probability-below-N=20 rule). Before that, the dossier
   cohort status is "collecting".
3. Never compare the dossier cohort's hit rate against −0.71 R or −124% directly —
   those are expectancy/sum figures on a different (56-subset) population. Compare
   like with like: hit rate vs hit rate, expectancy vs expectancy (computed with the
   identical R construction), each labeled with its population.
4. If a future recount moves rows between populations (as 12/60 → 13/58 did), the
   move is documented row-by-row in a new reconciliation note — the baseline figure
   itself is never silently edited.
