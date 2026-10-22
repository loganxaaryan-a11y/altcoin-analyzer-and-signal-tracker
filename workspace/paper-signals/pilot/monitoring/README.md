# Original-venue paper-entry monitor

Interval-based barrier monitoring for the enrolled paper entries, against
their ORIGINAL venue (Binance Spot USDT) via `data-api.binance.vision`.

## Enrollment (automatic — added 2026-10-21)
Enrollment is no longer manual. Each `paper-venue-monitor` run first:
1. Invokes `getpaperpilotstatus` on the crypto artifact and saves the full
   response verbatim to `canonical-entered.json` (overwrite).
2. Runs `enroll.py`, which derives ENTERED positions from the canonical
   records — checkpoints with `contractState == "entered"`, joined to their
   signal record (venue, instrument, direction, entry price, `entryAt`,
   stop = invalidation, targetPrice = target1) and to the ENTRY_CONFIRMED
   alert payload (targets t1/t2 at full precision, entry_observed_at =
   firstPrintObservedAt) — cross-checks every level across the three records,
   and appends any entered Binance Spot position not yet in `positions.json`.

Enrollment constraints:
- APPEND-ONLY: existing entries are never modified or removed by enrollment.
- A canonical cross-check mismatch skips that position (fail closed) and is
  logged in `runs/enroll-<UTC-ts>.json`. Last-bit float serialization
  differences between canonical records (relative ≤ 1e-9) are logged as
  warnings; the signal record's values are used.
- Venue identity is preserved: a position whose venue is NOT Binance Spot is
  logged `unsupported-venue` and is NOT enrolled (MEXC positions stay
  unenrolled until a MEXC monitor exists — Logan's ruling).
- Positions already settled in `outcomes.jsonl` are not newly enrolled.
- Idempotent: a run with no new entered positions changes nothing. A stale
  (>20 min) or missing `canonical-entered.json` is a no-op — enrollment never
  blocks monitoring.

## Files
- `positions.json` — the enrolled entries (id, instrument, venue, direction,
  entry price, `entry_observed_at`, invalidation, target1, target2). Levels
  copied verbatim from the canonical records by `enroll.py`. Never hand-edit;
  the five legacy entries predate automatic enrollment and are preserved
  as-is (two carry a `target2_source` note from their original work order).
- `enroll.py` — automatic enrollment (see above).
- `canonical-entered.json` — the latest `getpaperpilotstatus` response saved
  by the monitor lane; the enrollment source snapshot.
- `monitor.py` — the check script. Each run covers the interval SINCE THE LAST
  SUCCESSFUL CHECK per position (gap-verified); the first run for a position
  does historical recovery back to its `entry_observed_at` (R13).
- `state.json` — per-position `last_covered_bar_close_ms` (+ last outcome).
- `observations.jsonl` — appended observations, one record per position per run.
  Append-only: decisions are never rewritten.
- `runs/run-<UTC-ts>.json` — per-run monitor summary logs;
  `runs/enroll-<UTC-ts>.json` — per-run enrollment logs.

## Rules enforced (corrected barrier spec R8–R15)
- Completed 1m bars only; the forming bar is excluded.
- TOUCH at exact barrier (R8); wick OR close via bar high/low (R9).
- Missing bars → UNKNOWN intervals, never interpolated (R10).
- Bars spanning the entry time are fetched, labeled `spanning`, and excluded
  from touch evidence (R14).
- Both barriers touched in the same bar with unknown order → UNRESOLVED (R12).
- Positively observed touches stand despite other coverage gaps (R15).
- Original venue only — no proxy data settles a touch (R11 corrected).

## Outcomes
`no_touch_observed` | `invalidation_touched` | `target1_touched` |
`unresolved` | `unknown` (no coverage). Touches are LATE OBSERVATIONS —
never new entries, never retroactive timely alerts. Lifecycle verdicts in the
canonical records stay as recorded; the outcome note states what the frozen
evaluator rules imply without rewriting the record.

## Settlement (standing pass — added 2026-10-21)
`settle.py` runs on the same lane (step 2b, after the monitor) under Logan's
2026-10-21 standing-settlement authorization. For every position with no
settlement record in `outcomes.jsonl` it revalidates the stored record
(venue, level ordering, frozen R arithmetic), re-fetches the full 1m history
from entry on the original venue, and appends ONE idempotent settlement
record under the frozen evaluator (crypto-evaluation-v5-corrected; the
position's own freeze governs — legacy population v2.1.0, later positions
the pilot freeze in force at entry): invalidation-first → invalidated
−1.00R gross; target1-first → target1_hit +1.50R gross (the walk stops at
the first touch; later touches are post-settlement observations);
same-bar double touch → ambiguous; first touch inside the entry-straddling
4h block → timing_unverified; no touch past the 30-day cap → time_exit.
Coverage gaps between entry and the settling event (or a failed
validation) HOLD the settlement — nothing is appended, the reason lands in
`runs/settle-<UTC-ts>.json` only. Settlements live in the outcomes ledger
only; canonical lifecycle records are never rewritten. Test harness:
`test_settle.py` (reproduction + copy-store + idempotency proofs; design
record: workstreams doc 53).

## Schedule
Runs every 30 minutes via the `paper-venue-monitor` cron (goal-owned,
silent): enrollment (step 1), then the monitor, the settlement pass
(step 2b), the HL cache refresh, the research scanner, and the shortlist
capture. Independent of broad discovery — no CoinGecko dependency.
