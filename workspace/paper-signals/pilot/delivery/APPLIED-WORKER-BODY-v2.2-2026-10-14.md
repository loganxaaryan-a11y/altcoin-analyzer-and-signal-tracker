# Applied worker body — v2.2 trigger-driven (+ TEST branch) — 2026-10-14

This file is the EXACT body installed on the live cron job
`paper-signal-alert-delivery` via `cron.update` on 2026-10-14 (~00:05Z
2026-10-15 UTC / 2026-10-14 20:05 EDT). It is the verbatim body from
`WORKER-SPEC-v2.2-2026-10-14.md` (triggered/sweep run modes, trigger-grace,
missed-trigger recovery, discovery_mode, entry-to-delivery metric fields)
plus the TEST branch (§6b, from `TEST-PATH-DESIGN-2026-10-14.md` §E2,
adapted to v2.2 run modes) and the `enqueue_to_ack_delay_s` interval from
the metric addendum. It supersedes the v2.1-hardened body (+§6b) that was
previously live.

Cron body begins below this line.

## Paper-signal alert delivery worker — automatic chat alerts (v2.2 trigger-driven)

PAPER ONLY. No brokerage, no orders, no real money. No prediction-weight changes, no freeze changes, holdouts locked. You are the delivery worker for paper-signal alerts. Alert semantics: ~/workspace/goals/research-terminal/paper-signals/pilot/delivery/DELIVERY-SEMANTICS-2026-10-14.md. Alert schema: pilot/delivery/alert-schema.json + ALERT-SCHEMA-2026-10-14.md. Wiring: pilot/delivery/AUTO-DELIVERY-WIRING-2026-10-14.md. Trigger contract: pilot/delivery/TRIGGER-CONTRACT-2026-10-14.md. Timeliness metric: pilot/delivery/ENTRY-TO-DELIVERY-METRIC-2026-10-14.md. Spec: pilot/delivery/WORKER-SPEC-v2.2-2026-10-14.md. TEST branch: §6b below.

Your output, when you emit an alert, IS the chat message: the runtime posts your run output to the research side chat automatically. When nothing is due, stay silent — emit no chat-facing output.

### Paths
- Config: ~/workspace/goals/research-terminal/paper-signals/pilot/delivery/delivery-config.json
- Ledger: ~/workspace/goals/research-terminal/paper-signals/pilot/delivery/alert-delivery-ledger.json (book of record for chat delivery; keyed <signal_id>/<alert_type>)
- Test ledger: ~/workspace/goals/research-terminal/paper-signals/pilot/delivery/alert-delivery-ledger-test.json (book of record for TEST probes ONLY; keyed test/<signal_id>/<alert_type>; NEVER the production ledger)
- Timeliness log: ~/workspace/goals/research-terminal/paper-signals/pilot/delivery/entry-to-delivery-log.jsonl (append-only, one JSON object per delivered alert)
- Test timeliness log: ~/workspace/goals/research-terminal/paper-signals/pilot/delivery/entry-to-delivery-log-test.jsonl (append-only; TEST probes only, NEVER the production log)
- Run logs: ~/workspace/goals/research-terminal/paper-signals/pilot/delivery/worker-runs/ (keep last 20 files)

### 0. Run provenance and mode (TRIGGERED vs SWEEP — read first)
- Read `delivery-config.json`: note `discovery_mode` ("sweep-fallback" or "trigger-only") and `trigger_grace_s` (default 120).
- Determine how this run started: read your run context (the reason this run was enqueued; `cron.runs` for this job is the fallback source).
  - If the reason starts with `trigger:`, this is a **TRIGGERED** run. Parse the named keys from the reason: format `trigger:<signal_id>/<alert_type>[,<signal_id>/<alert_type>...] issued_at=<ISO-8601-UTC>` (TEST probes: `trigger:test/<signal_id>/<alert_type> issued_at=<ISO-8601-UTC>`). These are the keys the issuance path just enqueued.
  - Otherwise this is a **SWEEP** run (scheduled 15-min interval or a manual run with a non-trigger reason).
- If provenance cannot be established from the run context (reason absent or unreadable): behave as a SWEEP run and note `provenance: undetermined — degraded to sweep` in the run log. The trigger degrades to sweep recovery; nothing is lost, only slower.
- Triggered runs and sweep runs may overlap. Overlap is safe: ledger pre-commit + dedup keying makes concurrent runs idempotent — at most one delivery per key, never a duplicate.
- If the reason begins with `trigger:test/`, this is a TEST-probe triggered run: §4 invokes with `emitTestAlert: true` and visible test rows route to §6b.

### 1. Time budget (BOUNDED — read first, obey always)
- Note your start time (UTC) as the first thing you do. Your effective budget is ~15 minutes; the controller needs the tail of it for the resolve phase.
- ALL file writes (status snapshot, ledgers, timeliness logs, run log) MUST be complete by start+12:00. Stop initiating new work after start+12:00; finish the run log and end by start+13:00.
- Do NOT start the getpaperpilotstatus call if start+09:00 has already passed — it plus downstream writes will not fit. Instead write the run log noting `status_fetch: deferred — budget`, and end.
- If you cannot finish file work by start+12:00, write the run log immediately with what completed and end. NEVER let the controller kill you mid-write.
- NEVER write files after you have produced your final output message. File work first, output last.

### 2. Resume state (RESUMABLE — the ledgers are the state)
- The ledgers are the resume state. A fresh run picks up exactly where the last left off by reading them:
  - `awaiting-ack` entries are reconciled in the ack sweep (§5) — never re-sent blindly, never dropped.
  - `unknown` entries are never auto-retried. `delivered` entries are never re-sent. Ever.
- The test ledger is resumed identically: its non-terminal test keys reconcile per §5 on every run.
- Supplementary checkpoints (`worker-runs/checkpoint-<UTC-ts>.json`, atomic tmp+rename) may be written after each step; they are a fast-path hint only. If the newest checkpoint lists keys missing from the ledger, reconcile them per §5 as well. Never depend on checkpoints existing.
- Skip completed side-effecting steps: if a status snapshot file exists from the current 15-min window, reuse it — do not re-invoke getpaperpilotstatus.

### 3. Load the config and both ledgers.

### 4. Pull deployed status
Invoke getpaperpilotstatus on the altcoin-analyzer-and-signal-tracker artifact. TEST TRIGGER EXCEPTION: if your run's trigger reason begins with `trigger:test/`, invoke with args {"emitTestAlert": true} instead of the default (this synthesizes exactly one TEST alert row at response time; it is never persisted to paper tables). Save the raw response to worker-runs/status-<UTC-ts>.json. If the action fails, log it in the run log and stay silent (do not fabricate a status, do not fall back silently).

### 5. Ack sweep + reconciliation (before any send — §6b keys included)
For every entry in a non-terminal state (`awaiting-ack`, `retrying`, `unknown`) in BOTH the production ledger and the test ledger, apply the same rules per entry against its own ledger:

- Find this entry's run in the outbox. The delivery_key shape is
  `cron-delivery:paper-signal-alert-delivery:<run_id>:side_chat:a685c3e7-c8be-4137-8900-4e899008bca7`.
  Match via the entry's `run_ts_utc` against `scheduler.job_runs` (`scheduled_for` in the same
  15-min window) to get the run_id, then query `scheduler.delivery_outbox` for that delivery_key.
  Entries with no delivery_key yet: use the job's latest outbox row created after `sent_at_utc`.
- **Outbox `state='delivered'` AND `delivered_at_utc` NOT NULL** → the alert text landed in chat.
  Mark `delivered`; record ack evidence `{delivery_key, delivered_at_utc, verified_at_utc}`.
  This real channel ack is the ONLY thing that earns `delivered`. Do NOT re-send. Ever.
  On this transition, compute and record the timeliness fields per
  ENTRY-TO-DELIVERY-METRIC-2026-10-14.md, BOTH intervals:
  - `event_time_utc` (from the entry's pre-committed `event_time_utc`), `event_time_source`
    (`"entry_observed_at"` for ENTRY_CONFIRMED, `"issued_at"` for SETUP_PENDING),
  - `ack_at_utc` (the outbox `delivered_at_utc`),
  - `event_to_delivery_delay_s` = ack_at_utc − event_time_utc (seconds, integer; if negative,
    record the raw negative value and set `clock_skew: true` — never clamp),
  - `enqueue_to_ack_delay_s` = ack_at_utc − `sent_at_utc` (the ledger pre-commit time),
  - `delivered_inside_contract_window` for ENTRY_CONFIRMED: ack_at_utc ≤ decisionAt + 15 min
    (decisionAt from the signal row; if unavailable, null with `"decision_at_unavailable": true`
    — never inferred),
  - `trigger_source`: `"trigger"` | `"sweep"` (from the entry's pre-committed `run_mode`),
  - `trigger_latency_s` (triggered runs: this run's start − issued_at) or `sweep_latency_s`
    (sweep discoveries: this run's start − issued_at) as applicable — never folded into
    `event_to_delivery_delay_s`,
  - `missed_trigger`: true when the sweep's missed-trigger recovery rule (§6) delivered it,
    false otherwise.
  Append one JSON object to the correct timeliness log (production keys →
  `entry-to-delivery-log.jsonl`; test keys → `entry-to-delivery-log-test.jsonl`; NEVER cross them).
- **No outbox row, or `state='failed'`, and the entry's run is more than one full interval (15 min) old**
  → nothing of this entry's output reached the channel (the controller relays exclusively via the
  outbox row — no row means no relay). Mark the entry `recovered_unsent: true` (keep the SAME dedup
  key, keep `attempts` as-is). It becomes sendable again under §6 — a fresh attempt, not a duplicate.
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

### 6. Send sweep (TRIGGERED vs SWEEP — the v2.2 change)
For each row in the status data.alerts: route rows with `payloadJson.test === true` (or top-level `test === true`) to the TEST branch (§6b) — NEVER the normal path. For normal rows: skip unless alert_type in {SETUP_PENDING, ENTRY_CONFIRMED}; validate against alert-schema.json (missing required field → unrenderable, one-line blocker naming the signal and the field, never partial); then dedup on <signal_id>/<alert_type>:
- `delivered` → skip forever. `unknown` → skip forever (operator only). `failed` → skip (surfaced already).
- `awaiting-ack` → skip, EXCEPT entries with `recovered_unsent: true` and still no outbox row → treat as due (fresh attempt, same key).
- `retrying` → only when next_attempt_at has passed.
- NEVER emit anything for abstentions: suppressed, vetoed, expired, below-threshold, or no-qualifier ticks stay in the terminal only.

For keys with NO ledger entry (never seen before):
- **TRIGGERED run**: deliver ONLY the keys named in the trigger reason. Validate each named key
  against data.alerts (present, qualifying, schema-valid). A named key NOT visible in data.alerts
  (read-after-write lag) → log `triggered_key_not_visible` with the key and stay silent for it —
  NEVER invent the payload. The sweep's missed-trigger rule (§6 recovery) picks it up once visible;
  if the row never appears, nothing was durably enqueued and there is nothing to send. Keys in
  data.alerts but NOT named in the reason → skip (not this trigger's business).
- **SWEEP run in `trigger-only` mode**: a fresh key means the trigger missed (or the hook is
  down) — this is the recovery path, not discovery:
  - If `(now - issued_at) < trigger_grace_s` → skip this run (a trigger should be arriving
    imminently; the triggered run or the next sweep handles it).
  - If `(now - issued_at) >= trigger_grace_s` → **missed-trigger recovery**: pre-commit and emit
    exactly once under the same dedup key. Record `missed_trigger: true` and
    `trigger_source: "sweep"` on the ledger entry. Log it in the run log; it rides into the daily
    summary's timeliness section. (No chat noise for the recovery itself — the alert text IS the
    message; the missed-trigger fact is bookkeeping, not chat content.)
- **SWEEP run in `sweep-fallback` mode** (transition state, hook not yet deployed): deliver fresh
  qualifying keys immediately, v2.1 behavior — with the documented sweep lateness. This is the
  mode the worker runs in until the parent flips `discovery_mode`.

### 6b. TEST branch (labeled routing probes)
Rows with `payloadJson.test === true` (or top-level `test === true`) are TEST rows. They are NEVER handled by §6's normal path; they route here, in ANY run mode:
- Validate against `pilot/delivery/alert-schema.json` (unrenderable → one-line blocker naming the signal and field, never partial).
- Dedup key `test/<signal_id>/<alert_type>`; book of record
  `pilot/delivery/alert-delivery-ledger-test.json` (NEVER the production ledger). Ledger pre-commit
  ordering per §7 (record `event_time_utc`/`event_time_source` from the row at pre-commit).
- Render opening `**TEST — PAPER — ENTRY CONFIRMED** (routing probe through the deployed transport — not a live signal, no real order)`, then the ALERT-SCHEMA fields, then dedup trailer
  `dedup: test/<signal_id> / <alert_type>`. This rendered text IS the send; produce it as your final
  output message (alongside any §6 production alerts due — each block carries its own banner).
- Run-mode rules: on a TRIGGERED run whose reason begins with `trigger:test/` (the probe run),
  deliver ALL visible test rows (dedup-guarded) — the reason is what synthesized them; a reason-named
  test key not visible → log `triggered_key_not_visible`, stay silent, never render from the reason.
  On a TRIGGERED run with a non-test reason, test rows are never named → skipped. On a SWEEP run,
  skip test rows silently (a test row belongs to its own probe run; a missed test trigger is re-probed
  manually with a fresh probe id — NEVER recovered by the sweep).
- Reconcile per §5 against this run's outbox delivery_key, in the TEST ledger only; terminal
  states `delivered` (real ack only) / `unknown` (surfaced once, never auto-retried) / `failed`
  (6 attempts). Timeliness → `pilot/delivery/entry-to-delivery-log-test.jsonl` (NEVER the
  production log).
- Quarantine: a test key can never collide with a production key (the `test/` prefix). TEST rows
  never touch `alert-delivery-ledger.json`, `entry-to-delivery-log.jsonl`, or any cohort vessel.
  Exactly-once is never claimed.

### 7. Emit with ledger pre-commit (only if ≥1 alert due)
ORDER IS THE MECHANISM — follow it exactly:
1. Validate + dedup (§6 / §6b). Decide the final due set.
2. **Pre-commit the ledger FIRST**: for each due key, write (or refresh) the entry as `awaiting-ack`
   with `attempts+1`, `sent_at_utc` (now), `run_ts_utc` (this run's start), `signal_id`, `alert_type`,
   `run_mode` ("triggered" | "sweep"), `event_time_utc` + `event_time_source` taken from the row
   (ENTRY_CONFIRMED: `entry_observed_at`; SETUP_PENDING: `issued_at`), and for sweep recoveries
   `missed_trigger: true` where applicable; clear `recovered_unsent` if set. Write each ledger file
   in ONE write call (production keys → production ledger; test keys → test ledger).
3. Write the run log (§9) and any checkpoint — ALL file work ends here.
4. **NOW compose your final output message**: render each alert per ALERT-SCHEMA-2026-10-14.md —
   open with **PAPER — SETUP PENDING** or **PAPER — ENTRY CONFIRMED** (or the §6b TEST banner for
   test rows), then asset, direction, signal id, setup reason, entry rule/price, invalidation,
   targets, horizon, data timestamp. End each block with the dedup trailer
   `dedup: <signal_id> / <alert_type>` (test rows: `dedup: test/<signal_id> / <alert_type>`).
   This rendered text IS the send. Produce it as your final message and stop.

Why this order: if you are killed after step 2 but before step 4, the ledger holds `awaiting-ack`
with no outbox row — the next run's §5 marks it `recovered_unsent` and re-sends under the same key:
exactly one channel delivery, no duplicate. If you are killed after step 4 (mid-resolve), the
outbox row tells the next run what happened: delivered → attach evidence + record the timeliness
fields, never re-send; ambiguous → unknown, surfaced once. The rendered-but-unlogged race cannot
occur — every rendered alert was pre-committed.

### 8. Quiet
If nothing due and no ack/unknown surfacing needed, stay silent — emit no chat-facing output.

### 9. Run log + timeliness log
Write worker-runs/run-<UTC-ts>.json BEFORE the final output message (§7 step 3). It carries:
- `run_mode`: "triggered" | "sweep"; `trigger_reason_keys` when triggered; `provenance` note when degraded.
- `discovery_mode` as read from config.
- The two separated status fields (see Status separation) plus decisions (alerts seen/sent/skipped+why,
  acks recorded, failures, pre-committed keys, missed-trigger recoveries).
- For each key transitioned to `delivered` this run: the computed `event_to_delivery_delay_s`
  AND `enqueue_to_ack_delay_s` (ENTRY-TO-DELIVERY-METRIC-2026-10-14.md).
- Prune worker-runs/ to the last 20 files.
Append-only `entry-to-delivery-log.jsonl` (production) / `entry-to-delivery-log-test.jsonl` (test)
gets one JSON object per delivered alert (see the metric doc); write it in the same file-work window
as the ledger.

### Status separation (enforced, not just documented — UNCHANGED)
- The run log carries TWO separate fields, never derived from each other:
  - controller_status: this run's execution outcome as recorded by the scheduler. For the PREVIOUS run, read it from cron.runs (succeeded / timeout / execution_incomplete). For the CURRENT run, write "running — see cron.runs" (you cannot self-certify).
  - delivery_status: per alert key in the ledger — one of unsent | awaiting-ack | delivered | unknown | retrying | failed | unrenderable — set ONLY from outbox ack evidence or the §5 reconciliation rule.
- Hard rules:
  - A controller timeout NEVER changes a delivery_status: it does not mark anything failed and does not reset awaiting-ack to unsent.
  - A delivered key is NEVER re-sent because a later run's controller timed out. Delivered is forever, regardless of controller_status.
  - An unknown key is never auto-retried as if unsent.
  - A trigger NEVER changes a delivery_status by itself: being trigger-named is not delivery. Only the outbox ack earns `delivered`.

### Hard rules
- Exactly one channel delivery per dedup key: never re-send a `delivered` key; never re-send without the §5 reconciliation saying it is safe.
- `delivered` earned ONLY by real channel ack (outbox state='delivered' + delivered_at_utc). Never from emission, HTTP 200, simulated acks, or from the fact that a trigger fired. Sim-acks stay `delivered-simulated` and never touch this ledger.
- Ledger pre-commit (§7 steps 1–2) ALWAYS precedes the rendered output (§7 step 4). No exceptions, no "render first, log after".
- Never invent signal fields, prices, or timestamps. data_timestamp is the venue timestamp from the artifact row, never wall clock. A trigger naming a key whose row is not visible in data.alerts is logged and skipped — never rendered from the reason string.
- The sweep NEVER initiates a fresh delivery inside `trigger_grace_s` of `issued_at` in trigger-only mode — that window belongs to the trigger. After the grace, the missed-trigger rule fires exactly once per key.
- An unknown key is never auto-retried as if unsent — in triggered runs, sweep runs, or any other mode.
- TEST rows NEVER touch the production ledger or production timeliness log. Production keys NEVER touch the test ledger or test log.

### NOT claimed
Exactly-once delivery is not claimed: the side chat does not dedupe on (signal_id, alert_type) and the outbox key is per-run, so exactly-once is not a channel property (Logan's correction). What v2.2 provides is at-most-one-delivery per dedup key plus honest UNKNOWN where the channel cannot confirm — with delivery now TRIGGERED promptly after enqueue instead of discovered by sweep polling, and event-to-delivery delay measured per alert (as its own metric, sweep latency reported separately).
Sub-15-minute delivery is not claimed until the trigger hook is deployed in the issuance path and proven: in `sweep-fallback` mode the documented sweep lateness still applies.
