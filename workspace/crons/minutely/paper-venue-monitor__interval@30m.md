---
id: paper-venue-monitor
title: Paper venue monitor + HL market-data cache
enabled: true
owner: goal:research-terminal
mode: task
schedule:
  kind: interval
  timezone: America/Toronto
  at: 2026-10-21T13:13:40
  every: 30m
timeout_secs: 600
metadata:
  originating_chat_context_json: '{"chat_id":"a685c3e7-c8be-4137-8900-4e899008bca7","origin_provider":"main","chat_kind":"direct","event_kind":"message","require_mention":false,"device_id":"d8c63a1c-801b-497b-a9fe-cd2681d2185d"}'
  presentation_locale: en-US
---
## Paper venue monitor — CORE LANE (every 30 min, PAPER ONLY)

Interval-based barrier monitoring for the enrolled paper entries against their ORIGINAL venue (Binance Spot USDT) via data-api.binance.vision, plus the standing settlement pass. Independent of broad discovery — no CoinGecko dependency. Read-only with respect to the artifact and all pipelines: never touch scoring, thresholds, gates, or frozen contracts. Step 3 auto-enrolls entered positions from the canonical records (append-only; added 2026-10-21). Step 2 runs the standing settlement pass (added 2026-10-21 under Logan's standing-settlement authorization): it appends settlement records to the outcomes ledger (monitoring/outcomes.jsonl) under the frozen evaluator — the ledger is the authorized settlement surface; canonical lifecycle records are still never rewritten.

REPAIR (2026-10-22, monitoring-outage fix): this lane carries ONLY the core steps. The Hyperliquid cache refresh, scanner board, and research-shortlist capture live in the separate `paper-research-refresh` job so a slow research step can never starve monitoring or settlement. ORDER (revised 2026-10-22 after the 02:43 EDT run starved in step 1): monitoring and settlement run FIRST — they depend only on the local store and the price feed. Enrollment runs LAST: it is the step whose artifact pull can drip for many minutes, and a position entered just before a pass is enrolled at the end of that pass or the next one — monitoring of already-enrolled positions is never delayed by it. Every step is HARD TIME-BOXED: a step that hits its box is recorded as timed out in the run summary and the lane CONTINUES — no single step may consume the lane. Use the `timeout` command exactly as written for the python steps.

### Each run
1. Run `timeout 480 python3 ~/workspace/goals/research-terminal/paper-signals/pilot/monitoring/monitor.py`
   - Covers the interval since the last successful check per position (gap-verified); appends observations to `observations.jsonl`; updates `state.json` per position as it goes; writes `runs/run-<UTC-ts>.json`. If the timeout kills it mid-pass, the positions it completed keep their advanced checkpoints and the rest keep their old ones — coverage is never advanced on a failed or partial fetch. Record which positions completed in the run summary.
2. Standing settlement pass (runs AFTER the monitor): run `timeout 600 python3 ~/workspace/goals/research-terminal/paper-signals/pilot/monitoring/settle.py`
   - For every position with NO settlement record in `monitoring/outcomes.jsonl`, the settler revalidates the stored record (Binance Spot venue, sane level ordering, frozen R arithmetic: target1 = 1.50R, target2 = 2.50R) and walks first-touch ordering under the frozen evaluator crypto-evaluation-v5-corrected (the position's own freeze governs — legacy population paper-pilot-v2.1.0, later positions the pilot freeze in force at their entry; the evaluator text is identical across the lineage). The settler walks incrementally from its per-position verified watermark (settle-state.json) when one exists; a detected terminal event is always confirmed by a full-history re-walk before any record is appended, so settlement records keep the exact established field conventions.
   - Appends exactly one idempotent settlement record per position when the evidence is complete: invalidation-first → invalidated −1.00R gross; target1-first → target1_hit +1.50R gross (the walk stops at the first touch — a later target2 touch is a post-settlement observation, never a target2 settlement); same-1m-bar double touch → ambiguous (excluded from hit rate); first touch inside the entry-straddling 4h block → timing_unverified; no touch past the 30-day cap → time_exit at the cap. No second observation is required when the evidence is complete.
   - Coverage gaps between entry and the settling event, a failed record validation, or a fetch that exceeds its per-position deadline HOLD the settlement: nothing is appended and the watermark is NOT advanced; the hold and its reason land in the pass log (`monitoring/runs/settle-<UTC-ts>.json`) only. A position already settled is never settled twice — a re-run appends nothing.
   - The settler writes ONLY to `outcomes.jsonl` (appends), `settle-state.json` (verified watermarks) and its own pass log. It never edits positions.json, observations.jsonl, canonical records, or any freeze. Never hand-append a settlement record yourself; if settle.py errors, report the error under the reporting rule instead of improvising a settlement.
3. Auto-enrollment (append-only — runs LAST, after monitoring and settlement). HARD BUDGET: 6 minutes for the whole step.
   - Invoke `getpaperpilotstatus` on `altcoin-analyzer-and-signal-tracker` (no args) and save the FULL response JSON verbatim to `~/workspace/goals/research-terminal/paper-signals/pilot/monitoring/canonical-entered.json` (overwrite).
   - If the invoke fails, the response cannot be saved verbatim (e.g. truncated), or 6 minutes pass: DO NOT stall — run enroll.py against the existing canonical-entered.json, and state in the run summary that the FALLBACK source was used, the file's timestamp, and any positions enroll.py reports as discrepancies (positions it cannot yet reconcile from the last good file must be disclosed, never silently skipped). Enrollment never blocks monitoring — it now runs after it.
   - Run `timeout 240 python3 ~/workspace/goals/research-terminal/paper-signals/pilot/monitoring/enroll.py`
     - Derives entered positions from the canonical signals/checkpoints/ENTRY_CONFIRMED alerts (cross-checked; a mismatch skips that position and is logged as a discrepancy), appends any entered Binance Spot position not yet in `positions.json`, and writes `runs/enroll-<UTC-ts>.json`. A position whose venue is not Binance Spot is logged unsupported-venue and is NEVER enrolled into this monitor (MEXC positions stay unenrolled until a MEXC monitor exists). Never hand-edit positions.json.

### Rules (frozen — do not reinterpret)
- Completed 1m bars only; the forming bar is excluded. Missing bars → UNKNOWN intervals, never interpolated.
- Spanning bars (bar open < entry_observed_at < bar close) are labeled and excluded from touch evidence (R14).
- TOUCH at exact barrier (R8); wick OR close establishes touch (R9). Same-bar double-touch with unknown order → UNRESOLVED (R12). Positively observed touches stand despite other coverage gaps (R15).
- Findings are LATE OBSERVATIONS — never new entries, never retroactive timely alerts.
- Lifecycle verdicts in the canonical records are NEVER rewritten by this job. Settlement records appended by step 2 live in the outcomes ledger only (Logan's rule, 2026-10-20) and do not rewrite any canonical record, position, or observation.

### Reporting rule (strict)
Silent by default. Emit chat output ONLY when:
- a position's outcome TRANSITIONS to `invalidation_touched` / `target1_touched` / `unresolved` (a newly established barrier touch — report once, as a late observation with the bar timestamp, never as a timely alert), or
- the settlement pass APPENDS a settlement (report once per position: symbol, outcome class, gross R, settling bar timestamp — plainly labeled a paper settlement recorded in the outcomes ledger), or HOLDS a due settlement on a coverage gap or a failed record validation (report the position and the precise reason; this is a blocker, not a routine event), or settle.py itself errors, or
- the monitor fetch FAILS twice in a row (persistent coverage failure), or
- a new gap (unknown interval) appears on a position with no established touch (material coverage loss on an open observation).
No routine "all quiet" messages. When silent, just end with no output.
