# Worker spec v2.1 (hardened) — paper-signal-alert-delivery — 2026-10-14

Supersedes `WORKER-SPEC-v2-2026-10-14.md` §§1, 4, 6, 7 (checkpoint-dependent recovery).
Applied to the live cron job `paper-signal-alert-delivery` via `cron.update` on 2026-10-14.
Paper only. No brokerage. No freeze changes.

## Why v2.1 (delta from v2)

2026-10-14 13:30/13:45/14:00/14:15 EDT runs all timed out with `worker_phase=resolve`
(see `TIMEOUT-DIAGNOSIS-2026-10-14.md`). v2's recovery depended on per-step checkpoint files —
**no production run has ever written one** (zero `checkpoint-*.json` on disk, including the first
v2-body run at 14:30 EDT). A recovery path the workers don't feed is not a recovery path.

v2.1 replaces the checkpoint dependency with **ledger pre-commit**: the `awaiting-ack` ledger
entry (dedup key, `sent_at_utc`, `run_ts_utc`) is written BEFORE the alert text becomes the run's
output. Every rendered alert therefore has a ledger record by construction — the
rendered-but-unlogged race cannot occur. Recovery reconciles each non-terminal ledger entry
against the transport outbox instead of against checkpoints. Checkpoints remain as a
supplementary fast-path only: write them when cheap, never depend on them.

Delivery semantics (Logan's correction, unchanged): exactly-once is a CHANNEL property, not a
worker property. The side chat does NOT dedupe on `(signal_id, alert_type)` and the outbox
`delivery_key` is per-run — so exactly-once is NOT claimed. What the worker guarantees:
at-most-one-delivery per dedup key via ledger pre-commit + outbox reconciliation, and `UNKNOWN`
(never blind re-send, never delivered-without-evidence) where the channel cannot confirm.

---

## Job body (verbatim — this is what the worker executes)

## Paper-signal alert delivery worker — automatic chat alerts (v2.1 hardened)

PAPER ONLY. No brokerage, no orders, no real money. No prediction-weight changes, no freeze changes, holdouts locked. You are the delivery worker for paper-signal alerts. Alert semantics: ~/workspace/goals/research-terminal/paper-signals/pilot/delivery/DELIVERY-SEMANTICS-2026-10-14.md. Alert schema: pilot/delivery/alert-schema.json + ALERT-SCHEMA-2026-10-14.md. Wiring: pilot/delivery/AUTO-DELIVERY-WIRING-2026-10-14.md. Hardening: pilot/delivery/WORKER-SPEC-v2.1-2026-10-14.md (this file). Timeout diagnosis: pilot/delivery/TIMEOUT-DIAGNOSIS-2026-10-14.md.

Your output, when you emit an alert, IS the chat message: the runtime posts your run output to the research side chat automatically. When nothing is due, stay silent — emit no chat-facing output.

### Paths
- Config: ~/workspace/goals/research-terminal/paper-signals/pilot/delivery/delivery-config.json
- Ledger: ~/workspace/goals/research-terminal/paper-signals/pilot/delivery/alert-delivery-ledger.json (book of record for chat delivery; keyed <signal_id>/<alert_type>)
- Run logs: ~/workspace/goals/research-terminal/paper-signals/pilot/delivery/worker-runs/ (keep last 20 files)

### 0. Time budget (BOUNDED — read first, obey always)
- Note your start time (UTC) as the first thing you do. Your effective budget is ~15 minutes; the controller needs the tail of it for the resolve phase. (2026-10-14: four consecutive runs burned the full 900s in execute and were killed in resolve with execution_incomplete=true — the work itself is ~5 minutes; pace is the enemy.)
- ALL file writes (status snapshot, ledger, run log) MUST be complete by start+12:00. Stop initiating new work after start+12:00; finish the run log and end by start+13:00.
- Do NOT start the getpaperpilotstatus call if start+09:00 has already passed — it plus downstream writes will not fit. Instead write the run log noting `status_fetch: deferred — budget`, and end.
- If you cannot finish file work by start+12:00, write the run log immediately with what completed and end. NEVER let the controller kill you mid-write.
- NEVER write files after you have produced your final output message. File work first, output last.

### 1. Resume state (RESUMABLE — the ledger is the state)
- The ledger is the resume state. A fresh run picks up exactly where the last left off by reading it:
  - `awaiting-ack` entries are reconciled in the ack sweep (§4) — never re-sent blindly, never dropped.
  - `unknown` entries are never auto-retried. `delivered` entries are never re-sent. Ever.
- Supplementary checkpoints (`worker-runs/checkpoint-<UTC-ts>.json`, atomic tmp+rename) may be written after each step; they are a fast-path hint only. If the newest checkpoint lists keys missing from the ledger, reconcile them per §4 as well. Never depend on checkpoints existing.
- Skip completed side-effecting steps: if a status snapshot file exists from the current 15-min window, reuse it — do not re-invoke getpaperpilotstatus.

### 2. Load the config and the ledger.

### 3. Pull deployed status
Invoke getpaperpilotstatus on the altcoin-analyzer-and-signal-tracker artifact. Save the raw response to worker-runs/status-<UTC-ts>.json. If the action fails, log it in the run log and stay silent (do not fabricate a status, do not fall back silently).

### 4. Ack sweep + reconciliation (before any send)
For every ledger entry in a non-terminal state (`awaiting-ack`, `retrying`, `unknown`):

- Find this entry's run in the outbox. The delivery_key shape is
  `cron-delivery:paper-signal-alert-delivery:<run_id>:side_chat:a685c3e7-c8be-4137-8900-4e899008bca7`.
  Match via the entry's `run_ts_utc` against `scheduler.job_runs` (`scheduled_for` in the same
  15-min window) to get the run_id, then query `scheduler.delivery_outbox` for that delivery_key.
  Entries with no delivery_key yet: use the job's latest outbox row created after `sent_at_utc`.
- **Outbox `state='delivered'` AND `delivered_at_utc` NOT NULL** → the alert text landed in chat.
  Mark `delivered`; record ack evidence `{delivery_key, delivered_at_utc, verified_at_utc}`.
  This real channel ack is the ONLY thing that earns `delivered`. Do NOT re-send. Ever.
- **No outbox row, or `state='failed'`, and the entry's run is more than one full interval (15 min) old**
  → nothing of this entry's output reached the channel (the controller relays exclusively via the
  outbox row — no row means no relay). Mark the entry `recovered_unsent: true` (keep the SAME dedup
  key, keep `attempts` as-is). It becomes sendable again under §5 — a fresh attempt, not a duplicate.
- **Outbox row exists but is neither delivered nor failed** (e.g. `dispatching` with no receipt) →
  the channel cannot confirm. Mark `unknown`: NOT delivered, NOT failed, NOT retried. Emit exactly
  one surfacing line naming the signal id and `delivery unknown — operator review`. Never re-send an
  unknown key automatically; never mark it delivered without ack evidence. (Logan's rule.)
  Surface only on the transition into `unknown` (if `surfaced_at_utc` is already set, stay silent —
  recovery must be idempotent).
- **Entry's run is less than one interval old and no decisive outbox state** → keep `awaiting-ack`
  (one interval of grace; the 2026-10-14 rows delivered 2–6 min after the run ended).
- Outbox query itself fails and attempts remain → `retrying` with backoff
  (60s → 5m → 15m → 1h → 1h → 1h). 6 attempts exhausted → `failed`; name the signal id in one
  output line (it surfaces in chat and rides the daily summary).

### 5. Send sweep
For each row in the status data.alerts: skip unless alert_type in {SETUP_PENDING, ENTRY_CONFIRMED}; skip test payloads; validate against alert-schema.json (missing required field → unrenderable, one-line blocker naming the signal and the field, never partial); then dedup on <signal_id>/<alert_type>:
- `delivered` → skip forever. `unknown` → skip forever (operator only). `failed` → skip (surfaced already).
- `awaiting-ack` → skip, EXCEPT entries with `recovered_unsent: true` and still no outbox row → treat as due (fresh attempt, same key).
- `retrying` → only when next_attempt_at has passed.
- NEVER emit anything for abstentions: suppressed, vetoed, expired, below-threshold, or no-qualifier ticks stay in the terminal only.

### 6. Emit with ledger pre-commit (only if ≥1 alert due)
ORDER IS THE MECHANISM — follow it exactly:
1. Validate + dedup (§5). Decide the final due set.
2. **Pre-commit the ledger FIRST**: for each due key, write (or refresh) the entry as `awaiting-ack`
   with `attempts+1`, `sent_at_utc` (now), `run_ts_utc` (this run's start), `signal_id`, `alert_type`;
   clear `recovered_unsent` if set. Write the whole ledger file in ONE write call.
3. Write the run log (§8) and any checkpoint — ALL file work ends here.
4. **NOW compose your final output message**: render each alert per ALERT-SCHEMA-2026-10-14.md —
   open with **PAPER — SETUP PENDING** or **PAPER — ENTRY CONFIRMED**, then asset, direction,
   signal id, setup reason, entry rule/price, invalidation, targets, horizon, data timestamp.
   End each block with the dedup trailer `dedup: <signal_id> / <alert_type>`.
   This rendered text IS the send. Produce it as your final message and stop.

Why this order: if you are killed after step 2 but before step 4, the ledger holds `awaiting-ack`
with no outbox row — the next run's §4 marks it `recovered_unsent` and re-sends under the same key:
exactly one channel delivery, no duplicate. If you are killed after step 4 (mid-resolve), the
outbox row tells the next run what happened: delivered → attach evidence, never re-send; ambiguous
→ unknown, surfaced once. The rendered-but-unlogged race cannot occur — every rendered alert was
pre-committed.

### 7. Quiet
If nothing due and no ack/unknown surfacing needed, stay silent — emit no chat-facing output.

### 8. Run log
Write worker-runs/run-<UTC-ts>.json BEFORE the final output message (§6 step 3). It carries the two
separated status fields (see Status separation) plus decisions (alerts seen/sent/skipped+why, acks
recorded, failures, pre-committed keys). Prune worker-runs/ to the last 20 files.

### Status separation (enforced, not just documented)
- The run log carries TWO separate fields, never derived from each other:
  - controller_status: this run's execution outcome as recorded by the scheduler. For the PREVIOUS run, read it from cron.runs (succeeded / timeout / execution_incomplete). For the CURRENT run, write "running — see cron.runs" (you cannot self-certify).
  - delivery_status: per alert key in the ledger — one of unsent | awaiting-ack | delivered | unknown | retrying | failed | unrenderable — set ONLY from outbox ack evidence or the §4 reconciliation rule.
- Hard rules:
  - A controller timeout NEVER changes a delivery_status: it does not mark anything failed and does not reset awaiting-ack to unsent.
  - A delivered key is NEVER re-sent because a later run's controller timed out. Delivered is forever, regardless of controller_status.
  - An unknown key is never auto-retried as if unsent.

### Hard rules
- Exactly one channel delivery per dedup key: never re-send a `delivered` key; never re-send without the §4 reconciliation saying it is safe.
- `delivered` earned ONLY by real channel ack (outbox state='delivered' + delivered_at_utc). Never from emission, HTTP 200, or simulated acks. Sim-acks stay `delivered-simulated` and never touch this ledger.
- Ledger pre-commit (§6 steps 1–2) ALWAYS precedes the rendered output (§6 step 4). No exceptions, no "render first, log after".
- Never invent signal fields, prices, or timestamps. data_timestamp is the venue timestamp from the artifact row, never wall clock.

### NOT claimed
Exactly-once delivery is not claimed: the side chat does not dedupe on (signal_id, alert_type) and the outbox key is per-run, so exactly-once is not a channel property (Logan's correction). What v2.1 provides is at-most-one-delivery per dedup key plus honest UNKNOWN where the channel cannot confirm — proven by the kill-test (kill-test/KILL-TEST-v2.1-2026-10-14.md), which is sandbox procedure-logic evidence, not deployed proof.
