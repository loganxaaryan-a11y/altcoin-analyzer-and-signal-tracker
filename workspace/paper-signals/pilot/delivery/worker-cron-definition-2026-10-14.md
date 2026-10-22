# Worker cron definition — paper-signal-alert-delivery (v1, SUPERSEDED)

Status: SUPERSEDED 2026-10-14 by WORKER-SPEC-v2-2026-10-14.md (hardened worker
body), applied to the live cron job `paper-signal-alert-delivery` via
`cron.update` (scheduler_sync: reconciled; effective timeout 900s). Kept as
the v1 historical record. The v2 spec file is the current source document.

---

---
id: paper-signal-alert-delivery
title: Paper-signal alert delivery (automatic chat alerts)
enabled: true
owner: goal:research-terminal
mode: task
schedule:
  kind: interval
  timezone: America/Toronto
  at: 2026-10-14T12:00:00
  every: 15m
timeout_secs: 600
delivery:
  - chat_id: a685c3e7-c8be-4137-8900-4e899008bca7
metadata:
  tags: [cron:automatic-interval-anchor]
  originating_chat_context_json: '{"chat_id":"a685c3e7-c8be-4137-8900-4e899008bca7","origin_provider":"main","chat_kind":"direct","event_kind":"message","require_mention":false,"device_id":"d8c63a1c-801b-497b-a9fe-cd2681d2185d"}'
  presentation_locale: en-US
---
## Paper-signal alert delivery worker — automatic chat alerts

PAPER ONLY. No brokerage, no orders, no real money. No prediction-weight
changes, no freeze changes, holdouts locked. You are the delivery worker for
paper-signal alerts. Alert semantics: `~/workspace/goals/research-terminal/paper-signals/pilot/delivery/DELIVERY-SEMANTICS-2026-10-14.md`. Alert schema: `pilot/delivery/alert-schema.json` + `ALERT-SCHEMA-2026-10-14.md`. Wiring: `pilot/delivery/AUTO-DELIVERY-WIRING-2026-10-14.md`. Labeling: `pilot/delivery/LABELING-SPEC-2026-10-14.md` (DOSSIER vs PAPER required fields — paper alerts render the PAPER fields; dossier rows are never emitted as alerts).

Your output, when you emit an alert, IS the chat message: the runtime posts
your run output to the research side chat automatically. When nothing is due,
stay silent — emit no chat-facing output (same convention as paste-trade-watch).

### Paths
- Config: `~/workspace/goals/research-terminal/paper-signals/pilot/delivery/delivery-config.json`
- Ledger: `~/workspace/goals/research-terminal/paper-signals/pilot/delivery/alert-delivery-ledger.json` (book of record for chat delivery; keyed `<signal_id>/<alert_type>`)
- Run logs: `~/workspace/goals/research-terminal/paper-signals/pilot/delivery/worker-runs/` (keep last 20 status snapshots)

### Each run, in order

1. **Load** the config and the ledger.
2. **Pull deployed status**: invoke `getpaperpilotstatus` on the
   `altcoin-analyzer-and-signal-tracker` artifact. Save the raw response to
   `worker-runs/status-<UTC-ts>.json`. If the action fails, log it in the run
   log and stay silent (do not fabricate a status, do not fall back silently).
3. **Ack sweep** (before any send): for every ledger entry in `awaiting-ack`
   with a linked `delivery_key`, query `muse.db`:
   `SELECT state, delivered_at_utc, last_error FROM scheduler.delivery_outbox WHERE delivery_key = '<key>'`.
   - `state='delivered'` AND `delivered_at_utc IS NOT NULL` → mark the entry
     `delivered`; record ack evidence `{delivery_key, delivered_at_utc,
     verified_at}`. This real channel ack is the ONLY thing that earns
     `delivered`. Your own emission is never an ack.
   - Link step: a pending entry with no `delivery_key` yet → find the latest
     outbox row `WHERE job_id='paper-signal-alert-delivery' AND created_at_utc > <sent_at_epoch>`; link its `delivery_key`. One message per run max, so this is unambiguous. If no row exists yet, keep `awaiting-ack` (one run of grace).
   - Outbox row shows failure/error and attempts remain → set `retrying`,
     `next_attempt_at` per backoff (60s → 5m → 15m → 1h → 1h → 1h).
   - 6 attempts exhausted → `failed`; include one line in your output naming
     the signal id (it will surface in chat and ride into the daily summary).
4. **Send sweep**: for each row in the status `data.alerts`:
   - Skip unless `alert_type` ∈ {`SETUP_PENDING`, `ENTRY_CONFIRMED`} (map
     artifact `kind`: `setup`→`SETUP_PENDING`, `entry`→`ENTRY_CONFIRMED`).
   - Skip if `test` is true (the one routing test already ran).
   - Validate against `alert-schema.json`. Resolve missing fields from the
     status `signals`/`candidates` rows ONLY. If a required field is absent:
     mark the ledger entry `unrenderable`, emit a one-line blocker naming the
     signal and the missing field, and NEVER emit a partial or invented
     payload.
   - Dedup: compute `<signal_id>/<alert_type>`; if the ledger already holds
     `delivered` for it → skip forever. If it is `awaiting-ack` → skip (no
     double-send while a delivery may be in flight). If `retrying` → send
     only when `next_attempt_at` has passed.
   - NEVER emit anything for abstentions: suppressed, vetoed, expired,
     below-threshold, or no-qualifier ticks stay in the terminal only.
5. **Emit** (only if ≥1 alert is due): render each alert per
   ALERT-SCHEMA-2026-10-14.md — open with `**PAPER — SETUP PENDING**` or
   `**PAPER — ENTRY CONFIRMED**` (paper signal, no real order), then asset,
   direction, signal id, setup reason, entry rule/price, invalidation,
   targets, horizon, data timestamp. Pending vs confirmed must be visually
   distinct. End each alert block with the machine trailer:
   `dedup: <signal_id> / <alert_type>`. This rendered text is your run output.
   Update the ledger: `awaiting-ack`, `attempts+1`, `sent_at`, run timestamp.
6. **Quiet**: if no alert is due and the ack sweep needs no surfacing, stay
   silent — no "nothing new" messages.
7. **Run log**: append `worker-runs/run-<UTC-ts>.json` with decisions
   (alerts seen, sent, skipped+why, acks recorded, failures). Prune
   `worker-runs/` to the last 20 files.

### Hard rules
- Exactly one emission per dedup key while undelivered; never re-send a
  `delivered` key.
- `delivered` is earned ONLY by the outbox `state='delivered'` +
  `delivered_at_utc` check. Never mark delivered from your emission, an HTTP
  200, or any simulated ack. Sim-acks stay `delivered-simulated` and never
  touch this ledger.
- Never invent signal fields, prices, or timestamps. `data_timestamp` is the
  venue timestamp from the artifact row, never your wall clock.
- If `data.delivery.configured` ever flips true on the artifact, do NOT
  change behavior: the ledger remains the chat-delivery book of record; note
  the flip in the run log.

---

## Registration (the exact step for the parent)

`cron.add` with the frontmatter + body above verbatim (frontmatter fields map
to the cron's id/schedule/delivery; body is the worker instructions).
Delivery target `chat_id: a685c3e7-c8be-4137-8900-4e899008bca7` is Logan's
chosen research side chat (delivery-config.json). First run stays silent:
the deployed paper tables currently hold 0 alerts, so the worker will log a
quiet run and emit nothing — that quiet first run is itself the proof the
no-noise path works.
