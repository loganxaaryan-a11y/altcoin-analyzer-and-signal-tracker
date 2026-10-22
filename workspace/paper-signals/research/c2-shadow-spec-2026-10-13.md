# C-2 "crypto-dossier-minus-momentum" — shadow-scoring spec + harness (2026-10-13)

**Status: SHADOW ONLY. No production changes. No promotion.**
Extends CHALLENGER-ASSESSMENT.md §3–§4 with the explicit mirroring rule,
independent horizon grading, and abstention/missed-opportunity accounting
required for the shadow ledger. The October sample was already inspected during
diagnosis — everything here is exploratory; the SUPPORT/REJECT criteria are
forward-looking.

## 1. Frozen spec (unchanged from CHALLENGER-ASSESSMENT §3)

- Challenger id `crypto-dossier-minus-momentum`, version `0.1.0-shadow`.
- Factor set (10): Trend cluster 2.5 · MACD 1.5 · Perp funding crowding 1.75 ·
  Open interest 1.0 · Binance futures positioning 1.0 · Cross-venue taker
  imbalance 1.25 · TVL trend 2.0 · Revenue linkage 1.5 · Developer velocity 1.5 ·
  Supply-overhang penalty 1.5 — total weight **15.5**.
- Per-factor score rules unchanged from production (CONFIG.md dossier table);
  NO_DATA → 0, never estimated.
- Agreement formula: `challengerLong = round(clamp(50 + (weightedNet/15.5)×42, 5, 95))`;
  `challengerShort = 100 − challengerLong`;
  `challengerDirection = challengerLong ≥ challengerShort ? long : short`.
- Renormalization (explicit): the Momentum factor's contribution leaves the net
  AND its weight 1.5 leaves the denominator; remaining weights are NOT rescaled.
  (Same convention production applies to a 0-scoring factor, except the weight
  stays in the denominator there — this is the one deliberate difference.)
- Verified ground truth: production reproduces **30/30** from persisted
  `factors_json` ledgers once the legacy "Walk-forward base rate" extra factor
  (weight 1.0) is excluded — see harness. The C-2 computation drops Momentum
  from the same ledger.
- Horizon 30 elapsed days; checkpoints 5 / 14 / 30 days.
- Trigger: scored shadow-side at dossier time for **every** production issuance
  candidate, **including** candidates production suppresses (born-dead veto,
  short-regime gate, eligibility rejects). Persisted per candidate (new nullable
  columns; no schema break): `challengerId`, `challengerScore`,
  `challengerDirection`, 10 per-factor votes, production score/direction, veto
  reason if suppressed, `dossierScoredAt`, `draft.createdAt`, `quoteReceivedAt`.
- Entry: first post-decision-provider-quote; `issuedAt = entryAt =
  quoteReceivedAt` (paper; no execution claimed).
- Costs: 18 bps round-trip modeled (funding unverified, as production).
- Expiry: `issuedAt + 30d`.

## 2. The mirroring rule (explicit)

When C-2's direction **flips** vs production on a candidate, the challenger leg
is NOT scored against production's levels. It gets its own mirrored levels and
the stated gates applied to **its** direction:

1. **Levels (mirrored):** `entry` = the same paper entry rule (first
   post-decision provider quote; `issuedAt = entryAt = quoteReceivedAt`).
   `riskPerUnit = 1.25 × Wilder ATR-14` (same ATR-14 value production used —
   ATR is directionless). `invalidation = entry − riskPerUnit` for a challenger
   LONG, `entry + riskPerUnit` for a challenger SHORT.
   `target1 = entry ± 1.5×riskPerUnit`, `target2 = entry ± 2.5×riskPerUnit`,
   sign by challenger direction. Payoff convention `linear-entry-notional`.
   Veto-string templates are mirrored verbatim:
   `"born-dead LONG: signal-day low {L} <= invalidation {I}"` /
   `"born-dead SHORT: signal-day high {H} >= invalidation {I}"`.

2. **Born-dead veto (mirrored to challenger direction):**
   - challenger LONG: suppressed if `signalDay.low ≤ challengerInvalidation`;
   - challenger SHORT: suppressed if `signalDay.high ≥ challengerInvalidation`.
   Same signal-day OHLC production used (the exact completed bars; reuse, do not
   re-fetch).

3. **Short-regime gate (mirrored):** applies ONLY when the challenger direction
   is short: allowed iff `priceBelowSma50 && (lowerHighs || trend20Negative)`
   computed on the same decision-time bars; else suppressed with the same reason
   string production uses. There is no long-regime gate — challenger longs pass
   if not born-dead.

4. **Everything else frozen:** eligibility bars (sourceAsOf ≤ 30 min, price ≠
   null, liquidity/mcap/OI/funding bars), velocity qualifier, tiers,
   idempotency — byte-identical to production. The direction parameter only
   mirrors supports()/opposes() in the discovery gate; dimension logic is
   identical (methodology-crypto.md:118).

5. **Guardrail:** if challenger direction differs from production on >40% of
   paired rows, pause readout and audit the score pipeline — divergence that
   large signals an implementation bug, not a strategy difference
   (CHALLENGER-ASSESSMENT §4).

## 3. Horizon grading — independent of barrier resolution

Two products are graded **independently** for each arm; neither conditions on
the other's resolution:

- **(a) Barrier product (trade setup):** first-target vs first-stop touch
  within 30 elapsed days; net R at 18 bps, `linear-entry-notional`. Uncertainty
  (TIMING-UNVERIFIED / AMBIGUOUS / OPEN) counted separately per arm, never
  merged into accuracy.
- **(b) Direction-forecast product:** directional return at exactly the d5 /
  d14 / d30 checkpoints > 0 → hit, else miss. Barrier-blind, age-checked.
  Graded even when the barrier product already resolved (target hit on day 2
  does not cancel the d30 direction read, and vice versa).

Both arms (production and C-2) are graded by the same
`crypto-evaluation-v4-cohort-contract` evaluator, same entry/invalidation/
expiry, same costs.

## 4. Abstentions and missed opportunities — explicit counting

Every challenger row in the shadow ledger carries a `challengerDisposition`:

- `issued` — C-2 scored, direction set, all gates passed on its direction.
- `abstain` — C-2 scored but a gate suppressed it on its own direction
  (reason recorded: `born-dead-mirror`, `short-regime-gate-mirror`,
  `eligibility`). Abstentions are counted and reason-split in every readout.
- `unscored` — C-2 could not be computed (no dossier factor ledger persisted;
  e.g. historical suppressed rows, excluded/failed candidates). Listed, never
  silently dropped, never backfilled.

Two derived sets, reported separately:

- **Foregone set** (production issued, challenger abstained): what C-2 would
  have skipped that production traded. Its production-side outcomes are
  reported as the opportunity cost of the challenger gates.
- **Recovered-opportunity ledger** (challenger issued, production suppressed):
  what C-2 would have traded that production vetoed. Forward-only — historical
  suppressed rows are `unscored` (their dossier ledgers were never persisted),
  so the historical replay cannot populate this set; the spec requires the
  forward shadow to score suppressed candidates at dossier time, exactly where
  production already computes all 11 factors before the vetoes.

## 5. Historical replay (available data only)

`c2_shadow_harness.py` (this directory) runs read-only against the local
workspace DB copy:

1. Loads `generated_signals` (n=30) with persisted `factors_json`.
2. **Production check:** reproduces the recorded confidence/direction from the
   ledger (30/30 with the walk-forward exclusion). Any non-reproducing row
   aborts that row's challenger computation (never silently).
3. **C-2 score:** drops the "Momentum" factor (contribution and weight 1.5),
   recomputes `challengerLong/challengerShort/challengerDirection` per §1.
4. **Gate mirroring (historical limits):**
   - born-dead mirror: attempted from `signal_input_snapshots`
     (`candle.high/low` on the signal day, matched by asset + day). If no
     snapshot links, the row is marked `born-dead-mirror: UNRECOVERABLE` and
     reported separately — never assumed passed.
   - short-regime gate: **UNVERIFIABLE-HISTORICAL** for all historical rows —
     `belowSma50/lowerHighs/trend20Negative` are not persisted per row. These
     rows are reported with the gate outcome unknown, not assumed passed.
5. Writes `c2-shadow-ledger-2026-10-13.csv`: per row — id, symbol, created_at,
   production score/dir (reproduced?), C-2 score/dir, direction_flipped,
   mirrored invalidation/targets, born-dead-mirror result, short-regime-gate
   status, challengerDisposition, notes.
6. Prints the summary: n scored, n flipped, flip rate, abstentions by reason,
   unscored count.

The harness does NOT write to any production table and does NOT touch the
Phase 2A holdout. It reads only the local workspace DB copy.

## 6. Readout criteria (pre-registered, from CHALLENGER-ASSESSMENT §4)

Paired definitive rows = same opportunities, both arms scored.

- **SUPPORT** (promote C-2 to a production paper trial): n ≥ 30 paired
  definitive rows AND challenger d30-direction accuracy ≥ production + 10pp AND
  challenger mean net R ≥ production mean net R − 0.05 R/signal.
- **REJECT** (retire C-2): n ≥ 30 paired definitive rows AND (challenger
  d30-direction accuracy ≤ production − 10pp OR challenger mean net R <
  production mean net R − 0.15 R/signal).
- **INCONCLUSIVE**: n < 30 paired definitive rows, or gap < 10pp → continue
  collecting; no promotion, no retirement.

d14/d30 horizons have zero evaluable rows in the dev sample; the criterion is
necessarily forward-looking. The October sample already informed the
hypothesis — nothing here is validation.
