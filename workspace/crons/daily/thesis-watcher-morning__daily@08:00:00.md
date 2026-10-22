---
id: thesis-watcher-morning
title: Thesis watcher (morning)
enabled: true
owner: goal:research-terminal
mode: task
schedule:
  kind: daily
  timezone: America/Toronto
  time: 08:00:00
timeout_secs: 1800
delivery:
  - chat_id: 7b75e732-f527-4d53-b40d-4aa036201d9b
metadata:
  originating_chat_context_json: '{"chat_id":"a685c3e7-c8be-4137-8900-4e899008bca7","origin_provider":"main","chat_kind":"direct","event_kind":"message","require_mention":false,"device_id":"b0fd69c2-fdf4-4238-b72c-9849812abe31"}'
  presentation_locale: en-US
---
## THESIS WATCHER — twice-daily theory monitoring (morning run)

MONITORING ONLY. Read-only. No frozen-rule changes, no paper-pipeline changes, no theory writes.
You may call ONLY these artifact read actions:
- crypto (`altcoin-analyzer-and-signal-tracker`): listtheories, listtheorywatch, getmarketread
- equity (`equity-analyzer-and-signal-tracker`): listtheories, listmachinetheories, getmarketread, getmarketdaybrief
NEVER savetheory / saveagenttheory / attachtheoryevidence / any write action.

Your output, when an alert is due, IS the chat message: the runtime posts your run output to the
research side chat automatically. When nothing transitioned, stay silent — emit no chat-facing output.

### Paths
- State: ~/workspace/goals/research-terminal/paper-signals/thesis-watch/theory-state.json
- Alert ledger: ~/workspace/goals/research-terminal/paper-signals/thesis-watch/alert-ledger.json
  (dedup on <terminal-slug>/<theory_id>/<transition>; book of record)
- Learning ledger: ~/workspace/goals/research-terminal/paper-signals/thesis-watch/learning-ledger.jsonl
  (append-only, one object per resolved prediction)
- Run logs: ~/workspace/goals/research-terminal/paper-signals/thesis-watch/worker-runs/ (keep last 20)
- Receipt schema: ~/workspace/goals/research-terminal/hidden_files/receipt-provenance/RECEIPT-SCHEMA.md

### 0. Time budget (BOUNDED — read first, obey always)
- Note start time (UTC) first. Effective budget ~30 min. ALL file writes MUST be complete by
  start+25:00. End by start+28:00. NEVER write files after producing the final output message.
  File work first, output last.

### 1. Load state + ledgers
- Read theory-state.json and alert-ledger.json. They are the resume state. The baseline recorded at
  baseline_recorded_utc is SILENT: pre-existing states never alert; only transitions observed after
  that timestamp do.

### 2. Pull theories (both terminals)
- Invoke listtheories({}) on altcoin-analyzer-and-signal-tracker. Save raw response to
  worker-runs/listtheories-crypto-<UTC-ts>.json.
- Invoke listtheories({}) on equity-analyzer-and-signal-tracker. Save raw response to
  worker-runs/listtheories-equity-<UTC-ts>.json.
- If an action fails: log it in the run log, continue with the other terminal, stay silent about the
  failed side. Never fabricate theories, statuses, or predictions.
- First-run backfill: state entries flagged "coverage":"sampled", "evidence_baselined":false, or
  baseline prices "pending_first_run" are filled in SILENTLY this run. Newly enumerated
  theories/predictions/evidence are baselined, never alerted.

### 3. Pull current prices
- Crypto: getmarketread({}) on altcoin-analyzer-and-signal-tracker → current price per linked coin
  (BTC, ETH, SOL, HYPE, AAVE, ...). Record the venue/data timestamp from the response, never wall clock.
- Equity: getmarketread({"query":"SPY"}) on equity-analyzer-and-signal-tracker → SPY + linked tickers
  (AAPL, QQQ, SOXX, CL=F, ...). SPY is the equity beta benchmark; BTC is the crypto beta benchmark.
- If a linked asset's price is missing: mark "unavailable" for that prediction this run in the run log —
  never infer it, never carry a stale price forward silently.

### 4. Recompute per theory vs theory-state.json
For each theory in the fresh listtheories output, compare against state:
(a) THEORY STATUS: confirming ↔ challenged flip → TRANSITION.
(b) PREDICTION TRIPWIRE: for each prediction with a targetLevel, recompute hit/unhit from the current
    price vs the level in the predicted direction ("above X" hits when price ≥ X; "below X" hits when
    price ≤ X). unhit→hit = TRIPWIRE BREAK → transition. Also compute progress_pct toward the level
    (above: (now−base)/(level−base); below: (base−now)/(base−level); base = price at first observation)
    and store it in state — progress alone is not an alert.
(c) INVALIDATION: prediction reported invalidated by the terminal, or dueDate passed with the level
    unhit → RESOLVED. Alert once ("invalidated" / "expired unresolved"), write the learning-ledger
    entry (§6), mark resolved in state so it never re-records.
(d) NEW CONTRADICTING EVIDENCE: on a theory with status "confirming", if listtheories exposes evidence
    items, compare stance inventory vs the state's evidence list. A newly appearing
    "challenging"-stance item → transition. Evidence is baselined on first observation only.
(e) NEW THEORY in listtheories but not in state → record silently in state (baseline on first sight).
    NEVER alert on first sight.
(f) Theory in state but absent from listtheories two runs in a row → note in run log only, keep the
    state row flagged "missing_since".

### 5. Dedup + ledger pre-commit (ORDER IS THE MECHANISM — follow it exactly)
- Dedup key: <terminal-slug>/<theory_id>/<transition>, transition ∈
  {status:challenged→confirming, status:confirming→challenged, tripwire:<pred_key>:hit,
   invalidated:<pred_key>, expired:<pred_key>, new-challenging-evidence}.
- Skip keys already in alert-ledger.json with status "delivered" — forever. Never re-alert.
- PRE-COMMIT FIRST: for each due key, write/refresh the ledger entry as "awaiting-ack" with
  attempts+1, sent_at_utc (now), run_ts_utc (this run's start), terminal, theory_id, theory_name,
  transition, tripwire_level, current_price, data_timestamp_utc. Write the ledger file in ONE write.
- THEN write the run log (§8) and state updates. ONLY THEN compose the final output message.

### 6. Alert format (short — nothing else)
One block per alert:
**THESIS WATCH** — <Crypto|Equity>
<theory name> (id <n>)
<what flipped, one line>
Tripwire <level> vs <price> now
dedup: <terminal-slug>/<theory_id>/<transition>

### 7. Learning ledger (append-only)
For each prediction newly resolved this run, append ONE JSON object to learning-ledger.jsonl
(never edit prior lines): {"resolved_utc","terminal","theory_id","theory_name","prediction_key","ticker","direction",
 "target_level","due_date","outcome":"hit"|"miss"|"invalidated",
 "raw_return_pct" (ticker return, first-observed price → resolution price),
 "benchmark":"BTC"|"SPY","benchmark_return_pct" (same window),
 "beta_adjusted_return_pct" (raw − benchmark; beta assumed 1, labeled as such),
 "regime":"risk-off"|"normal","regime_inputs":{"breadth_15d_pct":…,"categories_all_bearish":…},
 "bounce_fakeout": null | {"reclaimed_level","reclaimed_at_utc","held_days",
   "final":"bounce-held"|"fakeout","reclaim_context":{"volume_note","funding_note","breadth_note"}}}
- Regime "risk-off" when market breadth collapses: crypto 15d breadth <10% positive OR all categories
  bearish; equity: advancing <10% or 0/4 majors bullish with all tracked categories bearish. Otherwise
  "normal". Record the inputs used; if breadth unavailable, "normal" with "breadth_unavailable":true.
- Bounce-vs-fakeout: when a hit tripwire level is later reclaimed (price moves back across the level
  against the predicted direction), open a watch in state; classify after 5 days — re-breached within
  5d → "fakeout", else "bounce-held". Record hold duration and volume/funding/breadth context at
  reclaim from getmarketread.
- Mark the prediction "resolved" in theory-state.json so it is never re-recorded.

### 8. Run log + state update (BEFORE any output message)
- Write worker-runs/run-<UTC-ts>.json as the two-field receipt envelope (RECEIPT-SCHEMA.md):
  - `invocation_completed`: run_ts_utc, started_utc, finished_utc, status (succeeded | failed | incomplete), per-terminal fetch status, theories seen counts, transitions found, alerts pre-committed, learning entries appended, errors. This proves THIS run ran — nothing about who started it.
  - `scheduler_provenance`: `origin_unverified` (DEFAULT — write this), `manual` (write ONLY when this run was started by an explicit manual invocation whose reason begins with `manual:` or is a documented repair/test run), NEVER `verified:<execution-id>` (reserved for the external reconciliation pass — `hidden_files/receipt-provenance/RECONCILIATION.md`). You cannot self-certify a scheduled origin from inside the run.
  Prune worker-runs/ to the last 20 files.
- Update theory-state.json: new statuses, current prices, progress_pct, last_checked_utc, evidence
  inventory for newly baselined confirming theories, resolved flags. State updates are bookkeeping,
  never alerts.

### 9. Quiet
If no transitions are due and nothing needs surfacing, stay silent — emit no chat-facing output.

### Hard rules
- Baseline is silent: only transitions AFTER baseline_recorded_utc alert. Pre-existing states never alert.
- Never invent prices, levels, predictions, or timestamps. data_timestamp comes from the artifact response.
- A "delivered" ledger key is never re-sent. The ledger is the book of record.
- No writes to either terminal. No strategy, freeze, or paper-pipeline changes. This job watches; it does not steer.
