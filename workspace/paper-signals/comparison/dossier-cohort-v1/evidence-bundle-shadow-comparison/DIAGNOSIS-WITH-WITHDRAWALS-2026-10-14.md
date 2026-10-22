# Dossier-model diagnosis — 2026-10-14

**Models:** `crypto-dossier-factor-agreement` 2.0.0 (the engine Logan sees) and
`equity-factor-agreement` 3.1.0. Paper signals only. **Diagnosis, not a rebuild:**
no tuning, no inversion adopted, no frozen-trial contact, no holdout contact.

**Data:** 70-row matched-opportunity set (`diagnosis-legs-v7.json`), independent
first-touch grading (`crypto_grades_2026-10-14.json`, `equity_grades_2026-10-14.json`),
d5 horizon observations (`horizon-observations-v7.csv`). All returns net of 18 bps
roundtrip. Barrier legs use correctly-oriented mirrored risk/reward levels for
counter-directional variants (valid independent strategies for the comparison).

---

## CORRECTION ADDENDUM — 2026-10-14 (supersedes the two claims below)

1. **"Systematically wrong" is withdrawn.** Replacement: **"inversion outperformed
   in this small retrospective sample; persistence and cause remain unproven."**
   Paired retrospective (same IDs, both outcomes known):
   [PAIRED-INVERSION-RETROSPECTIVE-2026-10-14.md](sandbox://workspace/goals/research-terminal/paper-signals/comparison/PAIRED-INVERSION-RETROSPECTIVE-2026-10-14.md)
   — n=42 paired, inv-minus-orig mean **+1.071 R** (+29/0:2/−11 signs), crypto
   +1.471 R (n=17), equity +0.800 R (n=25). The 42 rows still span 7 signal dates;
   this is one small correlated sample, not an inference about permanent
   properties. The pooled figures elsewhere in this file are descriptive.
2. **"Selection/timing/construction ruled out" is withdrawn.** Narrower statement:
   on the observed rows, losses were direction-wrong at the graded checkpoints and
   zero recoveries were observed in the 29 complete post-stop windows examined.
   That does not test earlier entries, every alternative stop, or every
   construction variant — untested, not ruled out.

---

---

## 1. Three outcome dimensions per closed recommendation

Per-row table:
[THREE-DIMENSION-OUTCOMES-2026-10-14.csv](sandbox://workspace/goals/research-terminal/paper-signals/comparison/THREE-DIMENSION-OUTCOMES-2026-10-14.csv)

| Dimension | Definition | Result (model, definitive rows) |
|---|---|---|
| Gross horizon direction | d5 close on the signal's side of entry | yes 24/70 = 34.3% |
| Net return | first-touch exit, net of 18 bps | mean −1.85% / −0.520 R (n=51) |
| Barrier outcome | target-before-stop, first touch | HIT 11 / MISS 40 (21.6%) |

**d5 direction and barrier verdict agree on 48/51 rows** — they are nearly the same
measurement on this horizon, not two independent confirmations. Net return splits
cleanly on direction: d5-yes rows average **+3.64%** (n=12), d5-no rows **−3.54%**
(n=39). Direction is the return driver; framing is second-order.

---

## 2. Comparison — identical opportunities, valid execution rules

Full table (all legs × all/crypto/equity):
[MODEL-DIAGNOSIS-COMPARISON-2026-10-14.csv](sandbox://workspace/goals/research-terminal/paper-signals/comparison/MODEL-DIAGNOSIS-COMPARISON-2026-10-14.csv)

| Leg | n | Hit rate | Mean net ret | Mean R |
|---|---|---|---|---|
| **model (unchanged)** | 51 | **21.6%** | −1.85% | **−0.520 R** |
| **inverted (diagnostic)** | 50 | **60.0%** | +1.69% | **+0.441 R** |
| always_long | 52 | 44.2% | −0.27% | +0.048 R |
| always_short | 49 | 36.7% | +0.09% | −0.141 R |
| random_20261013 | 51 | 33.3% | −0.54% | −0.225 R |
| random_42 | 52 | 30.8% | −1.25% | −0.289 R |
| random_777 | 49 | 34.7% | −0.46% | −0.193 R |
| random_1234567 | 47 | 53.2% | +1.11% | +0.271 R |
| random_20261014 | 51 | 43.1% | −0.19% | +0.020 R |
| random_314159 | 47 | 40.4% | +0.01% | −0.049 R |

Inverted by group: crypto 13/17 = 76.5% (+0.859 R); equity 17/33 = 51.5% (+0.227 R).

**Coverage:** n=47–52 definitive per leg (barrier verdicts: 40 MISS / 11 HIT /
6 TIMING-UNVERIFIED / 13 OPEN — non-definitive rows excluded identically for every
leg, never substituted).

**Dependence (read before the numbers):** the 70 rows span **7 distinct signal
dates**, with **36 of 70 on 2026-10-01 alone**; 50 distinct assets, max 6 signals on
one asset (BTC). The "70 observations" are roughly 7 independent market draws with
heavy within-date correlation. Cluster-robust inference is not a refinement here —
it is the entire story: naive n=51 overstates evidence by an order of magnitude.
Random-seed spread (30.8%–53.2% hit, −0.29 R to +0.27 R) shows how wide single
realizations swing at this effective sample size.

**Caveats on the inverted leg:** it is diagnostic only. Crypto inverted legs are
shorts — **hypothetical directional benchmarks**, not executable spot shorts
(no borrow/derivative model). The inverted outperformance is consistent with two
stories the data cannot separate: (a) the direction vote is systematically wrong;
(b) two regime draws (Oct 6–8 flush, equity rally) maximally punished the model's
positioning and inversion is regime luck. **Inversion is not adopted.**

---

## 3. Attribution — evidence only

| Candidate cause | Verdict | Evidence |
|---|---|---|
| **Factor direction** | **SUPPORTED as the failure** | 39/45 closed losses direction-wrong (86.7%); 0 entry-timing; inverted twin prints +0.44 R on identical candidates and levels. |
| Candidate selection | **Not established as the driver on observed data** | The same candidates with flipped direction win — selection is not implicated relative to direction on these rows. always_long on identical opportunities: 44.2% — the opportunities are not toxic; the direction assignment is. (Crypto's 19/20 long issuance is a property of the direction model, not a separable selection effect on this data.) |
| Detection delay | **Not established as a cause on observed data** | v3 chase ratios: entries not chased (median ~0.2 of target distance pre-entry). 0 recoveries in 29 complete 5d post-stop windows — no timing change saves those losses. Earlier entries and alternative stops untested. |
| Trade construction | **Not established as a cause on observed data** | Stop/target geometry identical for hits and misses; 0/29 post-stop recoveries (no wider stop helps those); d5-direction ≈ barrier verdict (48/51) — framing adds nothing beyond direction. Confidence scores: 62.3 hits vs 62.3 misses — no score filter supported. Untested construction variants are untested, not ruled out. |

---

## 4. Strongest supported finding (corrected 2026-10-14 — see addendum)

**Inversion outperformed the model in this small retrospective sample; persistence
and cause remain unproven.** Paired on the same 42 IDs with both outcomes known:
inv-minus-orig mean +1.071 R, 29 of 42 paired rows favoring inversion. 39 of 45
closed losses never went the signal's way at any horizon checkpoint; entries,
stops, targets, scores, and timing do not account for the losses on the observed
data. The mechanism *behind* the wrong direction (factor signs, regime
conditioning, issuance timing) is **not** established by this data, and the
sample spans only 7 signal dates.

## 5. One feasible improvement to test (specified, not implemented)

**Pre-registered directional A/B shadow trial.** Run two shadow arms on the
prospective dossier stream from the collection start date: Arm 1 = the unchanged
dossier model; Arm 2 = its direction-inverted twin (identical candidates, levels,
entry rules, costs, and grading protocol — the inversion construction validated
above). Score both arms under the Challenger-A comparison protocol (same
opportunity timestamps, missing evidence → UNKNOWN, cluster-robust readouts).
Pre-register the read rule: if the inverted arm outperforms by ≥0.25 R with a
two-way 95% CI excluding zero at the frozen readout, the direction model is
declared systematically wrong and a rebuild is authorized; otherwise the
inversion hypothesis is retired. Feasible with zero new data — it reuses the
existing dossier pipeline and ledger. **This tests the finding; it does not
adopt inversion.**

## 6. Explicitly NOT supported

- Automatic inversion of the live model (regime-luck alternative not ruled out;
  crypto inverted legs are hypothetical shorts).
- Wider stops, different stop/target geometry, chased-entry fixes, confidence-score
  filters, the H-1R trailing-return regime gate (all ruled out above).
- Any claim about *why* direction fails (factor-level decomposition not run).
- d14/d30 horizon conclusions (no signal old enough); the 5 UNCERTAIN losses
  (windows incomplete as of 2026-10-14).
- Any comparative verdict on the prospective dossier stream (0 graded entered rows;
  no claim until ≥ 20 per the ledger's own rule).
