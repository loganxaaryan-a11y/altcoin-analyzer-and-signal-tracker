# Paired inversion retrospective — 2026-10-14

**Scope:** retrospective correction to `DOSSIER-MODEL-DIAGNOSIS-2026-10-14.md`.
Paper signals only. Diagnosis, not a rebuild. No tuning, no inversion adopted.

**What this adds:** the pooled comparison in the diagnosis file compared arm-level
means over *different* definitive row sets (orig: 51 rows, inv: 50 rows, sets not
identical). This file computes **paired inverted-minus-original differences on the
exact same IDs with both outcomes known**, exports each arm's unresolved states
across all 70 opportunities, and splits crypto/equity. The existing pooled figures
remain in the diagnosis file, now labeled **descriptive**.

**Method:** for each of the 70 rows, the inverted arm is the mechanical opposite of
the model's direction, graded with correctly-oriented mirrored levels (risk and
reward distances held constant, mirrored around entry — same convention as the
v7 diagnostic: `stop = entry ∓ risk`, `target = entry ± reward`). Per-row CSV:
[PAIRED-INVERSION-RETROSPECTIVE-2026-10-14.csv](sandbox://workspace/goals/research-terminal/paper-signals/comparison/PAIRED-INVERSION-RETROSPECTIVE-2026-10-14.csv)

## Per-arm unresolved states (all 70 opportunities)

| State | Original arm | Inverted arm |
|---|---|---|
| HIT | 11 | 30 |
| MISS | 40 | 20 |
| TIMING-UNVERIFIED | 6 | 5 |
| OPEN | 13 | 15 |
| Definitive (HIT+MISS) | 51 | 50 |
| Non-definitive | 19 | 20 |

Rows definitive in **both** arms (paired set): **42 of 70**. 28 rows are
non-definitive in at least one arm and are excluded from paired differences
(never substituted).

## Paired results (n=42, both arms known)

| Scope | n | Orig hits | Inv hits | Paired hit-diff (mean) | Orig mean R | Inv mean R | Paired R-diff (mean) | R-diff signs (+/0/−) |
|---|---|---|---|---|---|---|---|---|
| All | 42 | 11/42 (26.2%) | 29/42 (69.0%) | +0.429 | −0.406 R | +0.666 R | **+1.071 R** | 29 / 2 / 11 |
| Crypto | 17 | 3/17 (17.6%) | 13/17 (76.5%) | +0.588 | −0.612 R | +0.859 R | **+1.471 R** | 13 / 1 / 3 |
| Equity | 25 | 8/25 (32.0%) | 16/25 (64.0%) | +0.320 | −0.265 R | +0.535 R | **+0.800 R** | 16 / 1 / 8 |

**Reading:** on the paired set, the inverted arm outperformed the original arm by
+1.07 R on average per row, with 29 of 42 paired rows favoring inversion and 11
favoring the original. Both crypto (+1.47 R) and equity (+0.80 R) paired subsets
favor inversion — the effect is not a crypto-only artifact in this sample.

**Dependence (do not skip):** the 42 paired rows still span only **7 distinct signal
dates** (36 of the 70-row parent set on 2026-10-01 alone). This is one small
retrospective sample with heavy within-date correlation, not 42 independent draws.
The paired difference is a descriptive summary of this sample; it is not an
inference about the direction model's permanent properties.

**Hypothetical shorts:** crypto inverted legs are short positions graded without a
borrow/derivative execution model — hypothetical directional benchmarks, labeled
as such in the per-row CSV (`mirrored=true` marks the counter-directional arm).

## Language withdrawals (recorded 2026-10-14)

1. The phrase **"systematically wrong"** (diagnosis §4) is withdrawn and replaced
   with: **"inversion outperformed in this small retrospective sample; persistence
   and cause remain unproven."**
2. **"Selection/timing/construction ruled out"** (diagnosis §3) is withdrawn. The
   evidence supports a narrower statement: on the observed rows, losses were
   direction-wrong at the graded checkpoints, and zero recoveries were observed in
   the 29 complete post-stop windows examined. That does **not** test earlier
   entries, every alternative stop placement, or every construction variant — those
   alternatives are untested, not ruled out.

The existing pooled figures in the diagnosis file (21.6% vs 60.0%, −0.52 R vs
+0.44 R) are retained and labeled **descriptive**; the paired figures above are
the corrected comparison.
