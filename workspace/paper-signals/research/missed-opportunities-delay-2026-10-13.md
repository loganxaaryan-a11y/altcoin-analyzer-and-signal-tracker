# Missed opportunities + detection delay — scan-export evidence (2026-10-13)

**Status: exploratory.** The October sample was already inspected during the
day's diagnosis rounds; nothing here is validation. Read-only; no production
changes. Holdouts untouched.

## 1. What the pipeline missed (from the scan export)

### Crypto — run 55 (2026-10-13T20:24–20:26Z, universe 10)

**Qualified-but-unissued: 2.** BTC (alignment 68, long) and ZRO (45, long)
passed all gates and were "emitted" — but `scanOperations.issuedCount` counts
*retained rows, not newly-issued signals*: **0 new `generated_signals` rows**
were created. BTC's trigger reason cites the already-open id38 long (issued
2026-10-13); ZRO's last issuance was id12 (2026-10-02). Discovery "emitted" ≠
issued signal — issuance happens on the separate dossier path. **Zero
qualified candidates converted to new paper positions this run.**

**Rejected: 8.**
- 6 born-dead suppressed (signal-day low already ≤ invalidation at issuance):
  RSR (align 61), BAT (60), ALEO (51), Q (45), BTW (35), PRL (30). All six were
  LONG candidates; the veto mechanically prevents a day-1 stop-out, so these
  are not clean "missed winners" — grading them as misses would double-count
  the veto's protective effect.
- 1 excluded on strategy eligibility (AMP — never reached scoring).
- 1 failed on provider/normalization (HOODINU — never reached scoring).

**Repeat offenders (from `suppressed_signal_candidates`, n=293 lifetime):**
BAT 10, Q 9, PRL 6 total suppressions; BTW 11. BAT, PRL and Q were suppressed
on 3+ consecutive runs for the same signal day (2026-10-12) — the 48H-velocity
gate keeps spending full 7-dimension scoring on moves already invalidated at
issuance. Discovery is doing redundant work on born-dead repeat offenders; a
pre-scoring invalidation pre-check (or suppression memory) would cut it.
This is the one structural miss with a cost: wasted scoring, not wasted trades.

**Direction instability:** ZRO was suppressed as a born-dead SHORT (id366,
2026-10-12) and qualified as a LONG (alignment 45) in run 55 — the same asset
flipped sides across runs.

### Equity — run 12 (2026-10-13T00:14–00:20Z, universe 101)

**Qualified-but-unissued: 50.** The top-50 radar rows by rankScore; the scan
hardcodes `issuedCount: 0` ("The radar scan never writes the ledger"). No
`tracked_signals` row has a signal_date after 2026-10-05 (latest issuance
2026-10-07). The scan's ranking has **no persisted outcome linkage yet** —
the only outcome sample is n=16 tracked signals, on which |agreement| does not
discriminate (mean |agreement| hits 67.2 vs misses 67.9).

**Rejected: 51.**
- 49 `rank_cap`: scored, below the 50-row radar bound. Per-factor ledgers
  computed in-memory and discarded; exact ranks 51–101 not persisted. **The
  entire below-radar half of the scan is a blind spot for miss analysis** —
  their outcomes are unknowable from persisted state.
- 2 issuance-gate suppressions (AVGO −20, BLK −24): short-regime gate
  ("bearish daily structure gate not met on 2026-10-09"). Weak agreement both —
  the gate cost nothing this run. Historical note: the veto has bitten
  max-agreement candidates before (SPY +100 / QQQ −100 suppressed 2026-10-05
  by born-dead).

**rejected-then-ran: not measurable from persisted state** on either terminal —
suppressed rows carry no outcome grading, and equity's below-radar half has no
persisted scores at all. This is the evidence gap, stated plainly rather than
filled.

## 2. Detection-to-qualification delay

**Equity:** Yahoo input `sourceAsOf` 2026-10-12T20:00Z → scan start
2026-10-13T00:14:20Z ≈ **4.2h pipeline delay**. The scored signal-day bar is
2026-10-09 (Friday) — the Monday 00:14Z scan reads a **~3.5-day-old close**
over the weekend. Every weekend scan is inherently stale by design (latest
completed session only). The staleness is structural, not a bug.

**Crypto:** `sourceAsOf` within ~30s of run start; the code enforces a
≤30-minute freshness bar, so stale quotes cannot enter. Scan cadence is 6h.
The velocity trigger is a **retrospective 48H window** (≥+15% over 48h) — by
construction, a move's start can predate observation by up to 48h plus one
cadence interval. For run 55's suppressed velocity movers (signal day
2026-10-12, suppressed 2026-10-13T20:26Z), the invalidation was already
breached on the signal day itself: **detection arrived after the trade was
dead.** Fresh quotes do not imply fresh signals — the qualification window,
not the data feed, is the delay.

## 3. Bottom line for the expert

- The measurable miss surface is small on the trade side (vetoes doing
  protective work; weak-agreement suppressions costing nothing) and large on
  the evidence side (no ledgers for suppressed/below-radar; no outcomes on
  rejects; "emitted" ≠ issued on both terminals).
- The one quantifiable recurring cost is crypto's repeated full scoring of
  born-dead velocity movers (BAT 10, Q 9, PRL 6 lifetime suppressions).
- Detection delay is dominated by design choices (equity weekend staleness,
  crypto retrospective 48H velocity window), not by pipeline latency.
