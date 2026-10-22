# outcomes.jsonl — canonical append-only outcome records (created 2026-10-20, Workstream A)

One JSON object per line. APPEND-ONLY: records are never edited or deleted;
errors are fixed by appending a `{"record_type":"correction"}` line that names
the position, field, wrong value, and correct value.

## Position outcome record fields
- `position_id`, `symbol`, `direction`, `venue` — from monitoring/positions.json (verbatim).
- `entry_price`, `entry_observed_at` — the frozen entry.
- `frozen_levels` — invalidation / target1 / target2 exactly as in positions.json (null = not in the monitor record).
- `barrier_rule` — TOUCH on completed 1m bars (bar high/low), rules R8/R9 of monitoring/README.md.
- `coverage` — window validated, gap count, unknown-interval count, evidence source.
- `first_touches` — every barrier's FIRST touch in the evidence, in time order:
  {barrier, level, bar_open_utc, extreme, side}. Empty list = no touch in coverage.
- `first_touch_outcome` — `invalidation_touched` | `target1_touched` | `no_touch_observed`,
  decided by FIRST touch only; later touches of the other barrier stay observations.
- `closure_status` — a touch is NOT a closure. Closure is recorded only if a canonical
  record actually closes the position; otherwise this states the lifecycle remains as
  recorded ('Entry recorded — current lifecycle unknown').
- `recorded_at_utc`, `recorded_by` — provenance of the validation pass.

Source of truth for touches: monitoring/observations.jsonl (venue-monitor evidence,
data-api.binance.vision, original venue only). Lifecycle verdicts in the canonical
signal records are never rewritten by this file.
