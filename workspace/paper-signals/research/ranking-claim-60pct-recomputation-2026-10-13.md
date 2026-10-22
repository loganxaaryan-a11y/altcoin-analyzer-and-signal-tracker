# The "≥60 → 49%" claim — recomputation (2026-10-13)

**Claim (SCAN-ASSESSMENT.md §1):** crypto discovery alignment sorts 5-day outcomes
monotonically: high ≥60 → 49.2% hit (n=118) vs low <40 → 30.3% (n=89).

**Verdict: REPRODUCES EXACTLY** from the local workspace DB copy
(`~/workspace/ts-spaces/altcoin-analyzer-and-signal-tracker/app.db`, read-only).
All three bucket hit rates, row counts, mean returns, and the hit/miss mean
alignment figures match to the printed precision.

## Signed long score vs confidence in the selected direction

The crypto terminal has three distinct "score" quantities. They must not be
conflated:

| Quantity | Where | Scale | Meaning |
|---|---|---|---|
| **Discovery alignment** | `discovery_signals.alignment` | 0–100 | Σ(7 discovery-dimension contributions) − trend/momentum redundancy (−10 when Trend and Momentum both pass), floored at 0. This is **confidence in the selected direction** — the direction itself is stored separately in the `direction` column (long/short/watch). There is no signed variant. Code: `actions.ts:1028–1086`, `actions.ts:1083`. |
| **Dossier signed long score** | `generated_signals` scoring (`scoreDossierFactors`, `signal-methodology.ts`) | 5–95 | `longScore = round(clamp(50 + (weightedNet/totalWeight)×42, 5, 95))`. This is the **signed long score**: values <50 favor short. |
| **Confidence in selected direction** | same dossier scoring | 50–95 | `longScore` if direction=long, else `100 − longScore`. Always ≥50 by construction. Verified on all 30 `generated_signals` rows: recorded `confidence` reproduces exactly as this quantity (30/30, once the legacy "Walk-forward base rate" extra factor is excluded — see CHALLENGER-ASSESSMENT §2e). |

**The claim uses the DISCOVERY ALIGNMENT (first row)** — the 0–100
directional-agreement score with a separate direction column. It does NOT use
the dossier signed long score (5–95) or the selected-direction confidence.

## Exact rows and calculation

Rows: all `discovery_signals` rows with `outcome_5 IS NOT NULL` → **n=364**.
Full row-level dump (id, symbol, first_seen_run_id, run_id,
first_seen_direction, current direction, alignment, outcome_5, return_5_pct,
prices, tiers, timestamps):
`discovery-alignment-rows-2026-10-13.csv` (this directory).

Buckets: `high` = alignment ≥ 60; `mid` = 40–59; `low` = < 40. No null
alignments among the 364.

| Bucket | n | hits | hit rate | avg directional 5d return |
|---|---|---|---|---|
| high ≥ 60 | 118 | 58 | **49.2%** | +1.45% |
| mid 40–59 | 157 | 54 | **34.4%** | −0.37% |
| low < 40 | 89 | 27 | **30.3%** | −2.63% |

Mean alignment: hits 51.3 vs misses 47.9 — reproduces.
Direction symmetry (current `direction` column): longs 40.3% (77/191),
shorts 41.2% (35/85) — reproduces.

Outcome definition (verified in code, `actions.ts` ~2463–2484): for each
discovery row, once it is ≥5 days old, `outcome_5 = "hit"` iff the
**directional 5-day return > 0**, else `"miss"`, where the return is computed
from `first_seen_price` to the close nearest `first_seen_at + 5d`, flipped by
`first_seen_direction` (not the current direction). `return_5` is that
directional return in percent. Verified: `sign(return_5) > 0 ⇔ outcome_5 =
"hit"` on 364/364 rows.

## Caveats (quantified)

- **In-place mutation is real and large.** Rows are updated on re-appearance.
  146/364 rows (40.1%) have a current `direction` different from their
  `first_seen_direction` (mostly demotions to `watch` on later runs); their
  mean alignment (37.8) is well below non-flipped rows (56.8), i.e. the
  stored alignment reflects the *latest* appearance, not necessarily the
  graded one. The bucket math still reproduces exactly, but the claim is
  directional evidence from a mutated table, not a clean backtest —
  as SCAN-ASSESSMENT already flags.
- Recomputed independently of the assessment text: same numbers from a fresh
  query, no reliance on the stated table.
