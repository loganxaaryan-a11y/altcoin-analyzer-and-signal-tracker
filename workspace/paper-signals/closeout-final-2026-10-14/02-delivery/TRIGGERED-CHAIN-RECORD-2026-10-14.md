# Triggered-path chain record — TEST probe — 2026-10-14/15

PAPER ONLY. TEST-labeled throughout. This records the durable chain for one
TEST alert across the triggered delivery path. Read the origin note first —
it determines what this chain proves and what it does not.

## Origin note (what this chain proves)

- PROVES: the worker-side triggered path — a `cron.run` with a `trigger:`
  reason starts a TRIGGERED run of `paper-signal-alert-delivery`, which
  delivers only the visible named keys, and the outbox ack reconciles the
  ledger to `delivered` with `trigger_source: "trigger"`.
- DOES NOT PROVE: the wrapper hook (installed 2026-10-15 ~00:38Z, AFTER this
  probe). This probe's trigger was a MANUAL coordinator `cron.run`, not the
  issuance wrapper. The wrapper-originated chain
  (issuance → wrapper diff → wrapper cron.run → triggered worker → ack) is
  still unproven and will be recorded automatically on the first genuine
  qualifying signal. That is exactly what `trigger-ready` means.
- The probe also demonstrated the anti-fabrication rule: the reason-named key
  was NOT visible in `data.alerts`, so it was logged `triggered_key_not_visible`
  and never rendered from the reason string; the actually-visible synthesized
  row was delivered under its own dedup key.

## The chain — test/sig_TEST_0c8ffb7f/ENTRY_CONFIRMED

| # | Link | Timestamp (UTC) | ID / evidence |
|---|---|---|---|
| 1 | Trigger fired (manual coordinator `cron.run`) | reason `issued_at=2026-10-14T23:59:55Z` | `cron.run(id="paper-signal-alert-delivery", reason="trigger:test/sig_TEST_d853fb5b/ENTRY_CONFIRMED issued_at=2026-10-14T23:59:55Z")` |
| 2 | Worker run started, run_mode=triggered | 2026-10-15T00:02:22Z | run_id `8c64be7a-f4a9-4370-b230-73991b873008`; `trigger_latency_s=147` (run start − reason issued_at); run log `worker-runs/run-2026-10-15T00-02-35Z.json` |
| 3 | Alert row visible (response-time synthesis, `emitTestAlert=true`; NEVER persisted to paper tables) | `entry_observed_at` / `issued_at` 2026-10-15T00:02:35.889Z | `data.alerts[0]` in `worker-runs/status-2026-10-15T00-02-35Z.json`; `signal_id=sig_TEST_0c8ffb7f`, `alert_type=ENTRY_CONFIRMED`, `test=true`, probe price 1.0 |
| 4 | §6b TEST branch: schema validation pass, dedup fresh, ledger pre-commit | `sent_at_utc` 2026-10-15T00:04:26Z | test ledger key `test/sig_TEST_0c8ffb7f/ENTRY_CONFIRMED` → `awaiting-ack`; rendered with TEST banner as the run's final output (the send) |
| 5 | Channel acknowledgement (runtime delivery subsystem → side chat) | `delivered_at_utc` 2026-10-15T00:06:36Z (epoch 1792022796) | outbox `delivery_key=cron-delivery:paper-signal-alert-delivery:8c64be7a-f4a9-4370-b230-73991b873008:side_chat:a685c3e7-c8be-4137-8900-4e899008bca7`, `state='delivered'`; independently verified via muse.db SELECT at 2026-10-15T00:16:37Z |
| 6 | Ledger → `delivered` with trigger_source="trigger" | reconciled on the 2026-10-15T00:14:54Z sweep run | `alert-delivery-ledger-test.json` entry `test/sig_TEST_0c8ffb7f/ENTRY_CONFIRMED`; `event_to_delivery_delay_s=241` (event→ack), `enqueue_to_ack_delay_s=130` (enqueue→ack), `missed_trigger=false`, `clock_skew=false` |
| 7 | Timeliness logged (test log only) | recorded 2026-10-15T00:16:37Z | `entry-to-delivery-log-test.jsonl` row for the key (both intervals, delivery_key, trigger_source) |

Interval note (do not conflate): 241 s = event (00:02:35.889Z) → ack (00:06:36Z);
130 s = enqueue/pre-commit (00:04:26Z) → ack (00:06:36Z).

## Segregation confirmation (TEST vs production)

| Book | TEST | Production |
|---|---|---|
| Ledger | `alert-delivery-ledger-test.json`: 2 entries, both `delivered` (`sig_TEST_26971b53`, `sig_TEST_0c8ffb7f`) | `alert-delivery-ledger.json`: 0 entries — no test key has ever touched it |
| Timeliness log | `entry-to-delivery-log-test.jsonl`: 2 rows | `entry-to-delivery-log.jsonl`: absent — zero rows (no genuine alert ever delivered) |
| Dedup keys | `test/<signal_id>/<alert_type>` — the `test/` prefix makes collision with a production key impossible | n/a |
| Cohorts / paper tables | probe rows never persisted (`paper_alert_events` count unchanged); collector quarantine guards verified | untouched |

The wrapper (`paper-signal-cycle` kind=agent) holds both ledgers READ-ONLY and
writes only `pilot/delivery/wrapper-runs/`. Only the delivery worker writes the
ledgers and timeliness logs.

## Pending: the wrapper-originated chain

On the first genuine qualifying signal after the wrapper install, the expected
automatic chain is: deployed `runpapersignalcycle` commits SETUP_PENDING row(s)
→ wrapper post-snapshot diff finds new key(s) → wrapper `cron.run`
(`trigger:<signal_id>/SETUP_PENDING issued_at=<row issued_at>`) within ~60 s
of commit → TRIGGERED worker run delivers → outbox `delivered` → production
ledger `delivered` with `trigger_source="trigger"` + both delay intervals in
`entry-to-delivery-log.jsonl`. When links 1–7 above exist for a production key
with the trigger originated by the wrapper (check the wrapper run log's
`trigger_reason`), the parent flips `discovery_mode` to `"trigger-only"` per
the contract's acceptance section — not before.
