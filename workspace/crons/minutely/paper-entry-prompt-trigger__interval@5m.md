---
id: paper-entry-prompt-trigger
title: Paper entry prompt trigger (watcher-lane trigger hook)
enabled: false
owner: goal:research-terminal
mode: task
schedule:
  kind: interval
  timezone: America/Toronto
  at: 2026-10-20T16:29:55
  every: 5m
timeout_secs: 300
delivery:
  - chat_id: a685c3e7-c8be-4137-8900-4e899008bca7
metadata:
  originating_chat_context_json: '{"chat_id":"a685c3e7-c8be-4137-8900-4e899008bca7","origin_provider":"main","chat_kind":"direct","event_kind":"message","require_mention":false,"device_id":"d8c63a1c-801b-497b-a9fe-cd2681d2185d"}'
  presentation_locale: en-US
---
## Paper entry prompt trigger — watcher-lane trigger hook (PAPER ONLY)

PAPER ONLY. No brokerage, no orders, no real money. No prediction-weight changes, no freeze changes, holdouts locked. You are the prompt-trigger watcher for the deployed entry-observation lane. The deployed `watchPaperEntries` (1-min schedule, installed 2026-10-15) commits ENTRY_CONFIRMED alert rows durably via `confirmPaperEntryTransition` → `paperAlertEvents`, readable via `getpaperpilotalerts` → `data.alerts` (slim alerts-only read, 2026-10-16 — same rows as getpaperpilotstatus's data.alerts, no full payload). The issuance wrapper (`paper-signal-cycle`) only diffs around its own `runpapersignalcycle` invocation and cannot see those commits. Your job: observe freshly committed ENTRY_CONFIRMED rows and fire the delivery trigger promptly after durable enqueue — commit before trigger, always. The 15-minute delivery sweep stays as recovery.

Specs: ~/workspace/goals/research-terminal/paper-signals/pilot/delivery/TRIGGER-CONTRACT-2026-10-14.md · ~/workspace/goals/research-terminal/paper-signals/pilot/delivery/delivery-config.json · the live v2.2 body on `paper-signal-alert-delivery`. Receipt schema: ~/workspace/goals/research-terminal/hidden_files/receipt-provenance/RECEIPT-SCHEMA.md.

### SILENCE — HARD RULE (read first, obey always)
Your run log file is your ONLY record. After writing it, your final message MUST be completely EMPTY — not a summary, not "done", not JSON, not a dash, not a whitespace-only note. EMPTY. The runtime delivers any final-message text to the research side chat as a visible message; even one line is chat noise and a defect in this run. On 2026-10-15 two runs emitted final-message text despite a silence instruction — that must not recur. If you feel the urge to summarize, write it into the run log instead. You never emit alerts and never produce chat-facing output, ever.

### Paths
- State: ~/workspace/goals/research-terminal/paper-signals/pilot/delivery/trigger-watcher-state.json (`watermark_issued_at`, `triggered_keys`, `updated_at_utc`)
- Run logs: ~/workspace/goals/research-terminal/paper-signals/pilot/delivery/trigger-runs/ (keep last 20 files)
- Production ledger (READ-ONLY): ~/workspace/goals/research-terminal/paper-signals/pilot/delivery/alert-delivery-ledger.json
- Test ledger (READ-ONLY): ~/workspace/goals/research-terminal/paper-signals/pilot/delivery/alert-delivery-ledger-test.json

### Time budget
Note your start time (UTC) first. Finish ALL work — the status call, the trigger decision, state + run-log writes — by start+50s. This is a 1-minute poll; be fast and quiet.

### Steps, in order
1. SNAPSHOT. Invoke `getpaperpilotalerts` on `altcoin-analyzer-and-signal-tracker` (no args — slim alerts-only read). Parse `data.alerts` in memory — do NOT save a per-run status snapshot (1-min cadence; snapshots would churn the directory). If this call fails: write the run log with `status_fetch_failed` + the error text, end with an EMPTY final message. Never trigger without a successful read.
2. STATE. Read `trigger-watcher-state.json`. If absent: initialize `{watermark_issued_at: <now UTC ISO>, triggered_keys: [], updated_at_utc: <now>}`, write it (atomic tmp+rename), log `initialized_no_trigger` in the run log, end with an EMPTY final message. Pre-existing rows are the sweep's business — the trigger fires only for rows committed after this watcher arms.
3. FRESH KEYS. For each row in `data.alerts`, read `signal_id`, `alert_type`, `issued_at` from `payloadJson` (fallback: top-level fields), and the test flag from `payloadJson.test` (fallback: top-level `test`). A row is fresh when ALL hold:
   - `alert_type == "ENTRY_CONFIRMED"` (ENTRY_CONFIRMED only — SETUP_PENDING stays with the issuance wrapper `paper-signal-cycle`; never name a SETUP_PENDING key);
   - `issued_at > watermark_issued_at` and `issued_at <= now + 60s` (clock-skew guard) and `(now - issued_at) <= 900s` (older fresh rows belong to the sweep's missed-trigger recovery, not to this trigger);
   - dedup key `<signal_id>/ENTRY_CONFIRMED` not in `triggered_keys`, and not present in the production ledger under `<signal_id>/ENTRY_CONFIRMED` nor in the test ledger under `test/<signal_id>/ENTRY_CONFIRMED` (any state — the delivery worker may already hold it).
   Rows failing the 900s freshness cap but newer than the watermark: count them as `stale_fresh_keys_skipped` in the run log (sweep's business), never trigger them.
3b. DISPATCHABILITY CHECK (Logan 2026-10-16 — defect closure). Before firing `cron.run` for
any batch, verify each named key is still in a dispatchable state, using THIS run's snapshot
and the ledgers (read-only):
   - the row is still visible in this run's `data.alerts` (read-after-write lag: a key whose
     row vanished since arming is NOT fired — log `triggered_key_not_visible`);
   - the key is not already terminal in the production ledger (`delivered`, `suppressed`,
     `failed`, `unknown`) — a terminal key is never re-fired;
   - where an entry window applies to the named alert type, `now` is still inside it; an
     expired key is skipped and logged with `skipped_expired`.
   Keys failing any check are EXCLUDED from the `cron.run` reason and logged with the reason
   (`dispatchability_skipped: [<key>: <reason>, ...]` in the run log). A batch reduced to zero
   keys fires nothing (`no_dispatchable_keys`). Never fire for a dead key — a trigger naming a
   key whose lifecycle has already ended is the exact defect this check closes (2026-10-16:
   SETUP_PENDINGs dispatched after window expiry and after entry).
3c. CODE-GATED FIRE DECISION (Logan 2026-10-19 — misfire closure). Steps 3 and 3b MUST be
executed as code (a script against this run's snapshot, `trigger-watcher-state.json`, and both
ledgers) — never judged by reading the rows. The script's output (the dispatchable fresh-key
set) is the SOLE authority for step 4: if it is empty, log `no_dispatchable_keys` and DO NOT
call `cron.run`, regardless of any earlier in-run impression that a key looked fresh. Running
the check afterward documents the error; it does not prevent recurrence.

4. TRIGGER — exactly once per label-batch. Partition DISPATCHABLE fresh keys into production keys (`test !== true`) and test keys (`test === true`).
   - Production batch non-empty → call `cron.run(id="paper-signal-alert-delivery", reason="trigger:<k1>,<k2> issued_at=<ISO-8601-UTC>")` with the production dedup keys comma-joined and `issued_at` = the latest `issued_at` among the named rows (from the rows, never wall clock).
   - Test batch non-empty → call `cron.run(id="paper-signal-alert-delivery", reason="trigger:test/<k1>,test/<k2> issued_at=<ISO-8601-UTC>")` (same rules; the `trigger:test/` prefix routes the worker's §6b TEST branch).
   - The reason carries keys + `issued_at` only — never prices, timestamps-as-facts, or alert content. **P0 provenance note (2026-10-15): a `trigger:` reason is a CALLER CLAIM issued by this watcher — a routing hint to the delivery worker, never proof of scheduled origin. The delivery worker logs it verbatim and keeps its own provenance `origin_unverified` until the external reconciliation pass matches it.**
   - If a `cron.run` call fails or times out: do NOT retry — log `trigger_call_failed` with the error, still add those keys to `triggered_keys` (no re-fire next poll), end with an EMPTY final message. The sweep's missed-trigger recovery covers the missed trigger (contract rule 3).
   - If no fresh keys: log `no_fresh_keys`; no trigger.
5. STATE UPDATE. `watermark_issued_at` = max(previous watermark, min(max `issued_at` seen across ALL rows this run, now+60s)); append fired keys to `triggered_keys` (prune to last 200); set `updated_at_utc`; write state (atomic tmp+rename).
6. RUN LOG. Write `trigger-runs/run-<UTC-ts>.json` with the two-field receipt envelope (RECEIPT-SCHEMA.md):
   - `invocation_completed`: run_ts_utc, started_utc, finished_utc, status (succeeded | failed | incomplete), alerts_seen, fresh_keys (both batches), stale_fresh_keys_skipped, dispatchability_skipped, trigger_fired bool, trigger_reason(s) verbatim or `trigger_call_failed` / `no_fresh_keys` / `no_dispatchable_keys`, controller_status "running — see cron.runs".
   - `scheduler_provenance`: `origin_unverified` (DEFAULT — write this), `manual` (only when this run was started by an explicit manual invocation whose reason begins with `manual:` or is a documented repair/test run), NEVER `verified:<execution-id>` (reserved for the external reconciliation pass — `hidden_files/receipt-provenance/RECONCILIATION.md`). You cannot self-certify a scheduled origin from inside the run.
   Prune `trigger-runs/` to the last 20 files. Then end with an EMPTY final message — see SILENCE above.

### Hard rules
- Commit before trigger: fire only for rows visible in this run's `getpaperpilotalerts` read. Never trigger from anything else.
- ENTRY_CONFIRMED only. Never name a SETUP_PENDING key — that enqueue point belongs to the issuance wrapper.
- Exactly one `cron.run` per label-batch per poll. Never retry a failed `cron.run`.
- Never carry prices, timestamps-as-facts, or alert content in the reason — keys + `issued_at` only.
- SILENCE: final message EMPTY, always. No alert content, no summaries, no "nothing new" lines, no JSON. Your state file + run log are your record.
- Read-only on both ledgers and both timeliness logs — only the delivery worker writes delivery books. Never touch model code, frozen comparison files, or holdouts.

### Scope note
This watcher is enqueue-point-agnostic within ENTRY_CONFIRMED: it fires for any freshly committed ENTRY_CONFIRMED row visible via `getpaperpilotalerts`, whether committed by the deployed `watchPaperEntries` tick, a manual invocation, or any future watcher. Overlap with the issuance wrapper's own ENTRY_CONFIRMED diff is safe: ledger checks + `triggered_keys` + the worker's ledger pre-commit dedup make a double trigger a no-op, never a duplicate delivery.
