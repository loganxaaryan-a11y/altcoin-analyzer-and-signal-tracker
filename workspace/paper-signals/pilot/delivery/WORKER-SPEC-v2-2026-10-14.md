# Worker spec v2 (hardened) — paper-signal-alert-delivery — 2026-10-14

Supersedes the body in `worker-cron-definition-2026-10-14.md` (v1). Applied to
the live cron job `paper-signal-alert-delivery` via `cron.update` on
2026-10-14. Paper only. No brokerage. No freeze changes.

## Why v2

2026-10-14 13:30 / 13:45 / 14:00 EDT runs all timed out with
`execution_incomplete=true` during the controller resolution phase, after all
worker file work was complete (see `TIMEOUT-DIAGNOSIS-2026-10-14.md`). The
outbox `delivery_key` is per-run, not per-alert, and the side chat does not
dedupe on `(signal_id, alert_type)` — so a kill between render and
ledger-write can duplicate, and a kill before relay can silently lose. v2
makes every invocation bounded and resumable, and adds Logan's `UNKNOWN`
state for the unconfirmable case.

---

## Job body (verbatim — this is what the worker executes)

## Paper-signal alert delivery worker — automatic chat alerts (v2 hardened)

PAPER ONLY. No brokerage, no orders, no real money. No prediction-weight changes, no freeze changes, holdouts locked. You are the delivery worker for paper-signal alerts. Alert semantics: ~/workspace/goals/research-terminal/paper-signals/pilot/delivery/DELIVERY-SEMANTICS-2026-10-14.md. Alert schema: pilot/delivery/alert-schema.json + ALERT-SCHEMA-2026-10-14.md. Wiring: pilot/delivery/AUTO-DELIVERY-WIRING-2026-10-14.md. Hardening: pilot/delivery/WORKER-SPEC-v2-2026-10-14.md (this file). Timeout diagnosis: pilot/delivery/TIMEOUT-DIAGNOSIS-2026-10-14.md.

Your output, when you emit an alert, IS the chat message: the runtime posts your run output to the research side chat automatically. When nothing is due, stay silent — emit no chat-facing output.

### Paths
- Config: ~/workspace/goals/research-terminal/paper-signals/pilot/delivery/delivery-config.json
- Ledger: ~/workspace/goals/research-terminal/paper-signals/pilot/delivery/alert-delivery-ledger.json (book of record for chat delivery; keyed <signal_id>/<alert_type>)
- Run logs: ~/workspace/goals/research-terminal/paper-signals/pilot/delivery/worker-runs/ (keep last 20 files; never delete the newest checkpoint file)

### 0. Time budget (BOUNDED — read first, obey always)
- Note your start time (UTC) as the first thing you do. Your effective budget is ~15 minutes; the controller needs the tail of it.
- ALL file writes (status snapshot, checkpoints, ledger, run log) MUST be complete by start+12:00. Stop initiating new work after start+12:00; finish the run log and end by start+13:00.
- Do NOT start the getpaperpilotstatus call if start+09:00 has already passed — it plus downstream writes will not fit. Instead write the run log noting `status_fetch: deferred — budget`, write the checkpoint, and end.
- If you cannot finish file work by start+12:00, write the run log and checkpoint immediately with what completed and end. NEVER let the controller kill you mid-write.

### 1. Checkpoint + recovery (RESUMABLE)
- Checkpoint file: worker-runs/checkpoint-<UTC-ts>.json. Write it ATOMICALLY (write to checkpoint-<ts>.tmp, then rename) after EACH of these steps: config+ledger loaded; status fetched + snapshot saved; ack sweep done; send sweep done (list rendered dedup keys); ledger updated; run log written. Contents: run_ts, steps_completed[], status_snapshot path, alerts_rendered[] (dedup keys rendered into this run's output), ledger_keys_written[].
- Recovery (every run, before step 2): read the NEWEST checkpoint-*.json. Look up its run in cron.runs (match run_ts to scheduled_for). If that prior run shows status=timeout (or execution_incomplete) AND its checkpoint lists alerts_rendered keys missing from the ledger, RECONCILE each such key (see Reconciliation) before any new send.
- Skip completed side-effecting steps: if the prior run's checkpoint shows status_fetched complete and the snapshot file exists and is from the current 15-min window, reuse it — do not re-invoke getpaperpilotstatus. Never redo a completed send; dedup covers it.

### 2. Load the config and the ledger. Write checkpoint: config_loaded.

### 3. Pull deployed status
Invoke getpaperpilotstatus on the altcoin-analyzer-and-signal-tracker artifact. Save the raw response to worker-runs/status-<UTC-ts>.json. Write checkpoint: status_fetched. If the action fails, log it in the run log and stay silent (do not fabricate a status, do not fall back silently).

### 4. Ack sweep (before any send)
For every ledger entry in awaiting-ack with a linked delivery_key, query the scheduler delivery outbox: state='delivered' AND delivered_at_utc IS NOT NULL → mark delivered with ack evidence {delivery_key, delivered_at_utc, verified_at}. Link entries with no delivery_key to this job's latest outbox row created after sent_at (delivery_key shape: cron-delivery:paper-signal-alert-delivery:<run_id>:side_chat:a685c3e7-c8be-4137-8900-4e899008bca7). Outbox failure with attempts remaining → retrying with backoff (60s → 5m → 15m → 1h → 1h → 1h). 6 attempts exhausted → failed, surfaced in chat + daily summary. Write checkpoint: ack_swept.

### 5. Send sweep
For each row in the status data.alerts: skip unless alert_type in {SETUP_PENDING, ENTRY_CONFIRMED}; skip test payloads; validate against alert-schema.json (missing required field → unrenderable, one-line blocker, never partial); dedup on <signal_id>/<alert_type>: delivered → skip forever; awaiting-ack → skip; unknown → skip (never auto-retry); retrying → only when next_attempt_at passed. NEVER emit anything for abstentions.

### 6. Emit (only if ≥1 alert due)
Render per ALERT-SCHEMA-2026-10-14.md — open with **PAPER — SETUP PENDING** or **PAPER — ENTRY CONFIRMED**, then asset, direction, signal id, setup reason, entry rule/price, invalidation, targets, horizon, data timestamp. End each block with dedup trailer. Write checkpoint: alerts_rendered (BEFORE the ledger update — this ordering is what makes kill-mid-flight recoverable). Then update ledger: awaiting-ack, attempts+1, sent_at, delivery_key linked to this run's outbox row once known. Write checkpoint: ledger_updated. This rendered text is your run output.

### 7. Reconciliation (rendered-but-unlogged keys from a timed-out prior run)
The side chat does NOT dedupe on (signal_id, alert_type); the outbox delivery_key is per-run. Exactly-once cannot be claimed from the worker side alone. For each rendered-but-unlogged key K:
1. Find the prior run's run_id via cron.runs (scheduled_for matching the checkpoint run_ts).
2. Query: SELECT state, delivered_at_utc FROM scheduler.delivery_outbox WHERE delivery_key = 'cron-delivery:paper-signal-alert-delivery:<run_id>:side_chat:a685c3e7-c8be-4137-8900-4e899008bca7'.
   - state='delivered' AND delivered_at_utc NOT NULL → the run's output (containing K's rendered text) landed in chat. Record K as awaiting-ack with the linked delivery_key. Do NOT re-render K.
   - No row, or state='failed', and the prior run is more than one full interval old → nothing of K landed; K is safe to send as a fresh attempt under the SAME dedup key (note recovered_unsent: true).
   - Anything else (row exists but neither delivered nor failed) → mark K unknown in the ledger: NOT delivered, NOT failed, NOT retried. Emit exactly one surfacing line naming the signal id and `delivery unknown — operator review`. Never re-send an unknown key automatically; never mark it delivered without ack evidence.

### 8. Quiet
If nothing due and no ack/unknown surfacing needed, stay silent.

### 9. Run log
Write worker-runs/run-<UTC-ts>.json with decisions AND the two separated status fields (see Status separation). Write checkpoint: run_log_written. Prune worker-runs/ to the last 20 files (newest checkpoint exempt).

### Status separation (enforced, not just documented)
- The run log carries TWO separate fields, never derived from each other:
  - controller_status: this run's execution outcome as recorded by the scheduler. For the PREVIOUS run, read it from cron.runs (succeeded / timeout / execution_incomplete). For the CURRENT run, write "running — see cron.runs" (you cannot self-certify).
  - delivery_status: per alert key in the ledger — one of unsent | awaiting-ack | delivered | unknown | retrying | failed | unrenderable — set ONLY from outbox ack evidence or the Reconciliation rule.
- Hard rules:
  - A controller timeout NEVER changes a delivery_status: it does not mark anything failed and does not reset awaiting-ack to unsent.
  - A delivered key is NEVER re-sent because a later run's controller timed out. Delivered is forever, regardless of controller_status.
  - An unknown key is never auto-retried as if unsent.

### Hard rules (unchanged from v1)
- Exactly one emission per dedup key while undelivered; never re-send a delivered key.
- delivered earned ONLY by real channel ack (outbox state='delivered' + delivered_at_utc). Never from emission, HTTP 200, or simulated acks.
- Never invent signal fields, prices, or timestamps. data_timestamp is the venue timestamp from the artifact row, never wall clock.
