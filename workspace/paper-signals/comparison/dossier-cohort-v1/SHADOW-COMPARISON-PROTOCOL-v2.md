# Directional Shadow Comparison — Protocol v2 Amendment (2026-10-14)

**Amends:** `SHADOW-COMPARISON-PROTOCOL-v1.md` (frozen — not edited).
**Scope:** (V2.1) grading-definitions correction — two separate return fields;
(V2.2) adoption of the shared frozen statistical amendment. Nothing else in v1
is reopened: §1–4 (capture, mirroring, entry), §6 (hypothetical shorts), §7
(unknown evidence), the §8.5 read-rule thresholds, the §8.5 scope cap
("warrants further testing" only), §8.7 (INSUFFICIENT EVIDENCE as a named
outcome), and §9 are unchanged. v1 rows are never re-graded under a new
version — moot in practice: zero shadow rows existed at amendment time
(verified 2026-10-14: no `rows/dossier-shadow-comparison-v1.csv` exists;
collection starts 2026-10-15T00:00:00Z).

Paper signals only. No brokerage. No model tuning. Shadow only.

---

## V2.1 Two return fields (corrects v1 §5)

**Problem.** v1 §5 recorded one return column (`net_return_5_r`) labeled "net
horizon return" while defining it as the *first-touch* exit return. One field
doing two jobs: the return at the fixed five-day endpoint and the return at
the barrier exit are different quantities, and collapsing them loses the
divergence between them (e.g. early target hit followed by a full reversal —
the barrier exit books the win, the fixed endpoint does not).

**Amended rule.** Every shadow arm records TWO separate return fields,
computed independently and stored in separate columns. One is never
overwritten by, derived from, or substituted for the other.

- **`fixed_5d_return_r`** — net R at the **fixed five-day endpoint**:
  `direction × (endpoint_close − entry_price) / risk − cost_R`, where
  `endpoint_close` is the last venue close ≤ `endpoint_ts` (the v1 §5
  TIME_EXITED pricing convention), `risk = |entry − stop|`,
  `cost_R = 0.0018 × entry_price / risk` (18 bps roundtrip modeled, same
  modeled-cost scenario as v1). Recorded for every definitive row
  **regardless of barrier outcome** — including rows whose barrier resolved
  early. `TIME_EXITED` rows: identical to the time-exit price net of costs.
  `UNKNOWN` rows: empty, never imputed.
- **`barrier_exit_return_r`** — net R at the **barrier exit**, i.e. the arm's
  first-touch resolution, whichever resolved first:
  - target touched first → `+reward / risk` (the target1 R multiple);
  - stop touched first → `−1 R` at the stop (fill: the stop level;
    adverse gap-through → the bar's open beyond the stop, stated);
  - `TIME_EXITED` → the time-exit price net of costs (equals
    `fixed_5d_return_r` for these rows by construction);
  - `UNKNOWN` → empty, never imputed.
  18 bps roundtrip modeled, net — same cost scenario as above.

Both fields are in R multiples, both net of the modeled cost. Their
divergence is expected and informative; it is never "reconciled" away.

**Schema change (capture code).** `shadow-capture.py` header: the v1 column
`net_return_5_r` is REMOVED; the two new columns `fixed_5d_return_r` and
`barrier_exit_return_r` are added (empty at capture, filled at grading).
Verified 2026-10-14: no `dossier-shadow-comparison-v1.csv` existed, so there
is no migration and no legacy data to reinterpret. `test_shadow_capture.py`
pins the new header (both fields empty at capture; the v1 column absent).

**Primary endpoint pinned (clarifies v1 §8.1).** The primary endpoint — the
mean paired inv-minus-orig net R difference per row, over the paired set
(rows definitive in both arms) — is computed on **`barrier_exit_return_r`**.
This is what v1 §8.1's "net R difference" meant (v1 §5 defined the recorded
net return as the first-touch return); the v2 amendment pins it explicitly so
no future reader can substitute the fixed-endpoint field. `fixed_5d_return_r`
is a **pre-registered secondary endpoint**: its paired mean difference is
reported descriptively at each readout (with the same block-bootstrap
interval as the primary), but it never enters the §8.5 read rule.

## V2.2 Statistical amendment (adopted)

This protocol adopts the shared frozen statistical amendment
`paper-signals/comparison/STATISTICAL-AMENDMENT-v1-2026-10-14.md` (frozen
2026-10-14, pre-collection — no outcome data existed or was inspected in
choosing the method), with the following protocol-specific bindings:

1. **Overlap diagnostics** (amendment §S1) are computed on the paired set at
   every readout (monthly descriptive + final), from entry timestamps only,
   and reported alongside — they never enter the interval.
2. **Dependence method** (amendment §S2): block bootstrap over
   overlap-connected components (union-find on positive 5-day exposure-window
   overlap; B = 10,000; percentile 95% interval; opportunity-weighted
   replicate statistics). This **supersedes** the v1 §8.3 decision-date-block
   interval computation. The §8.5 read-rule thresholds (+0.25 R screen,
   interval excluding zero) and the §8.5 scope cap ("warrants further testing"
   only — never an improvement claim, never live inversion) are unchanged.
3. **Estimand** (amendment §S4): the per-opportunity mean paired
   inv-minus-orig `barrier_exit_return_r` difference. The v1 §8.3 phrase
   "computed over block-level paired-mean differences" is clarified: blocks
   are resampling units; the statistic inside each bootstrap replicate is the
   pair-weighted mean. Date-means are never averaged equally (that targets
   the mean-of-date-means, a different estimand).
4. **Minimum data** (amendment §S5): the §8.5 read rule applies at the final
   readout only when paired n ≥ 20 **and** ≥ 5 overlap-component blocks.
   (Component count ≤ decision-date count, so this is strictly stronger than
   v1 §8.6's "≥ 5 distinct decision-date blocks", which it supersedes.) With
   fewer than 2 blocks the interval is undefined. Below the requirement the
   outcome is **INSUFFICIENT EVIDENCE** (§8.7) — never support, never failure.

## Withdrawn / superseded claims — v2 ledger

- v2.1. v1 §5: **"Net horizon return per arm: first-touch net R multiple" —
  WITHDRAWN as a label.** The single collapsed field is replaced by
  `fixed_5d_return_r` and `barrier_exit_return_r`, recorded separately.
- v2.2. v1 §8.3 decision-date block interval computation — **SUPERSEDED** by
  the overlap-component block bootstrap (read-rule thresholds, scope cap,
  and the INSUFFICIENT EVIDENCE named outcome unchanged).
- v2.3. v1 §8.6 "≥ 5 distinct decision-date blocks" — **SUPERSEDED** by "≥ 5
  overlap-component blocks" (strictly stronger; paired n ≥ 20 unchanged).
