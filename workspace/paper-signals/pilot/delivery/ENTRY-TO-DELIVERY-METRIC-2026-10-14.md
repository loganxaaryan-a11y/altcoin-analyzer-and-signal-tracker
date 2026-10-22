# Entry-to-delivery delay — metric definition — 2026-10-14

PAPER ONLY. The delivery-timeliness metric for paper-signal alerts, defined
separately from sweep latency. Descriptive until baselined — no pass/fail
gate is attached (Logan's measurement doctrine: "protected means frozen for
measurement, not proven").

## Definition

For each delivered alert, exactly one delay is computed:

```
event_to_delivery_delay_s = ack_at_utc − event_time_utc        (seconds, integer)
```

| Component | Source | Notes |
|---|---|---|
| `event_time_utc` | ENTRY_CONFIRMED: the alert row's `entry_observed_at` (venue-stamped first post-decision print; issuance guarantees it lies inside `[decisionAt, decisionAt + 15 min]`) | Never wall clock, never the worker's read time |
| `event_time_utc` | SETUP_PENDING: the alert row's `issued_at` (qualification/decision time) | The setup contract has no entry window; delay is still reported |
| `ack_at_utc` | `delivered_at_utc` on the run's `scheduler.delivery_outbox` row for the alert's delivery_key | The SAME real channel ack that earns `delivered` in the ledger — the metric is only ever computed on the delivered transition, never estimated |

Derived fields recorded alongside:

- `event_time_source`: `"entry_observed_at"` | `"issued_at"` — which field anchored the metric.
- `delivered_inside_contract_window` (ENTRY_CONFIRMED only): `ack_at_utc ≤ decisionAt + 15 min`.
  `decisionAt` comes from the signal row; if unavailable, `null` with
  `"decision_at_unavailable": true` — never inferred.
- `trigger_source`: `"trigger"` | `"sweep"` — which path delivered it.
- `trigger_latency_s`: triggered runs only — `trigger_run_start_utc − issued_at`
  (how fast the hook fired the worker after enqueue).
- `sweep_latency_s`: sweep-discovered deliveries only — `sweep_run_start_utc − issued_at`.
  **This is kept as a separate field and never folded into
  `event_to_delivery_delay_s`.** The metric answers "how long from the market
  event to the acked alert"; sweep latency answers "how much of that was the
  polling cadence". Conflating them would hide the trigger's contribution.
- `missed_trigger`: `true` when the alert was delivered by the sweep's
  missed-trigger recovery rule (WORKER-SPEC-v2.2 §6).

Clock-skew rule: if `ack_at_utc < event_time_utc`, record the raw negative
value and set `clock_skew: true`. Never clamp to zero silently — a negative
delay is a data-quality signal, not a fast delivery.

## Where it is recorded

1. **Ledger entry** (`pilot/delivery/alert-delivery-ledger.json`): on the
   transition to `delivered`, the worker writes `event_time_utc`,
   `event_time_source`, `ack_at_utc`, `event_to_delivery_delay_s`,
   `delivered_inside_contract_window`, `trigger_source`, `trigger_latency_s`
   / `sweep_latency_s`, `missed_trigger` (false unless the recovery rule
   fired), and `clock_skew` when applicable. Ledger schema note for v2.2:
   `status_fields_v2_2_2026_10_14` — these fields exist only on entries that
   reached `delivered` via the v2.2 worker; older entries are untouched.
2. **Timeliness log** (`pilot/delivery/entry-to-delivery-log.jsonl`):
   append-only, one JSON object per delivered alert, same fields plus
   `signal_id`, `alert_type`, `asset`, `direction`, `delivery_key`,
   `recorded_at_utc`. The worker appends in the same file-work window as the
   ledger write. This file is the series the daily summary aggregates —
   never hand-edited.
3. **Run log** (`worker-runs/run-<UTC-ts>.json`): carries the computed
   `event_to_delivery_delay_s` for each key transitioned to `delivered` in
   that run.
4. **Daily summary**: the timeliness section aggregates the log — count
   delivered, p50 / max `event_to_delivery_delay_s`, count
   `delivered_inside_contract_window`, count `missed_trigger: true`, split by
   `trigger_source`. (The daily-summary job spec gains this section when the
   parent wires it; the fields above are the contract it reads.)

## Reading the metric

- ENTRY_CONFIRMED: the actionable question is `delivered_inside_contract_window`.
  The delay in seconds says how much of the 15-minute window the alert consumed.
- SETUP_PENDING: no window; the delay is reported as-is for trend-watching.
- A rising `missed_trigger` count means the trigger hook is degrading — the
  sweep is doing the hook's job. That is the early-warning signal for the
  parent to investigate the deployed hook, not a delivery failure.
- Zero rows today (2026-10-14): no alert has ever been delivered, so the log
  is empty and the metric has no baseline. The first delivered alert seeds it.

## What it is NOT

- Not a model/strategy metric: it measures the delivery pipeline, never the
  signal. It does not touch the freeze, the paper program, or any prediction.
- Not sweep latency: reported separately by construction (see above).
- Not a gate: no alert is held, delayed, or re-sent on the basis of this
  metric. It is measurement, not control.

## Interval addendum — two distinct delays (2026-10-14)

The metric above measures **event → ack**. A second, distinct interval is now
recorded alongside it and must never be conflated:

```
enqueue_to_ack_delay_s = ack_at_utc − sent_at_utc   (seconds, integer)
```

- `sent_at_utc` = the ledger pre-commit time (the durable enqueue; "the send
  attempt" for event-driven triggers, or the sweep emission for recovery).
- Both intervals share `ack_at_utc` (the same real channel ack) but differ in
  their left endpoint.

Worked example — TEST probe `test/sig_TEST_26971b53/ENTRY_CONFIRMED`
(2026-10-14):

| Interval | Left endpoint | Right endpoint | Value |
|---|---|---|---|
| `event_to_delivery_delay_s` | event `2026-10-14T19:49:51.472Z` | ack `2026-10-14T20:08:25Z` | **1114 s (18.6 min)** |
| `enqueue_to_ack_delay_s` | enqueue `2026-10-14T19:50:57Z` | ack `2026-10-14T20:08:25Z` | **1048 s (17 m 28 s)** |

**18.6 minutes is the event→ack interval, not the enqueue→ack interval.**
Reporting 18.6 as the enqueue→ack figure is a labeling error. The 66-second
gap between the two is the probe's own issuance-to-enqueue time (run start →
pre-commit), not delivery work.
