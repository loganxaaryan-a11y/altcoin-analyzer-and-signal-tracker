# Equity score "inconsistency" — resolution (2026-10-13)

CHALLENGER-ASSESSMENT.md §2d reported recorded equity scores as
"arithmetically inconsistent with the frozen formula" (exhibit: id 5 NVDA
2026-10-01 records rawScore=90, impossible under weights 6/8/8/20/8/20/20).
Re-examined read-only against the local workspace DB copy. **The inconsistency
does NOT reproduce as an arithmetic bug. It is a vintage-weight mismatch plus
the documented redundancy adjustment.**

## Findings (all 50 tracked_signals rows)

1. **Two factor-set vintages exist**, each with its own persisted weights in
   `factor_breakdown_json`:
   - n=45 (ids 3–48): weights 15/20/20/15/10/10/10 (denominator 100), with the
     legacy factor "30-session return" instead of "ATR-adjusted 30-session
     trend" (RSI weight 10, not 20).
   - n=5 (ids 4, 49, 51, 52 + one more): weights 6/8/8/20/8/20/20 — the
     current frozen set.
   - NVDA id5's rawScore=90 is **exactly reachable** under its own vintage
     weights (all +1 except High-volume direction 0: Σ=90, den=100). The
     "impossibility" only appears when the *current* frozen weights are applied
     to a *legacy* signal.

2. **46/50 rows match `round(100·Σw·s/Σw)` computed under their own ledger
   weights exactly.** The 4 exceptions (ids 4, 49, 51, 52 — META/BTC-USD
   2026-10-01/02/05) differ by **exactly 5 points**: ledger-raw 78 vs recorded
   confidence 73. All four have the five trend-cluster factors unanimously +1
   (SMA-20/50/200, MACD, ATR-trend all +1) → the frozen **±5 redundancy
   adjustment** (actions.ts:155-156, m:270) fires: 78 − 5 = 73 = recorded
   confidence. Not an error — the adjustment working as specified.

3. **Scan-export ledgers (run 12, n=50 emitted):** all internally consistent
   (contribution = weight×score on all 350 factor rows); the frozen formula's
   recomputed direction matches the recorded `direction` on 50/50; rankScore
   recomputes exactly on 50/50; the scan's persisted `agreementScore` field
   equals the **five-dimension rating score** (not the 7-factor agreement) on
   50/50 — a naming collision, verified, not a bug.

## What remains genuinely blocked

- **49 rank_cap rows**: ledgers computed in-memory and discarded; only
  diagnostics rows persist. Irrecoverable from persisted state.
- **2 suppressed rows**: agreementScore + veto reason only.
- The CHALLENGER §2d "0 of 26 reconstructions matched with systematic sign
  flips" is a *separate* phenomenon — replaying factor votes from fresh Yahoo
  history (input/version drift, `canonicalParameters` overrides not exported),
  not ledger arithmetic. Not re-litigated here; the replay inputs needed to
  settle it (`signalInputSnapshots` raw bars with `availableAt` cutoffs per
  graded signal) are still absent from the export.
