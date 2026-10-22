# Ack-path demo — 2026-10-14

The worker marks an alert `delivered` ONLY on this check (run on a later run,
against the run's recorded `delivery_key`):

```sql
SELECT state, delivered_at_utc, last_error
FROM scheduler.delivery_outbox
WHERE delivery_key = '<run delivery_key>';
-- delivered  <=>  state = 'delivered' AND delivered_at_utc IS NOT NULL
```

Demonstrated 2026-10-14 against REAL runtime rows (read-only queries, nothing
written):

## Ack branch (the normal case)

Two real `paste-trade-watch` deliveries to the research side chat:

| delivery_key | state | delivered_at_utc | attempts | last_error |
|---|---|---|---|---|
| `cron-delivery:paste-trade-watch:e29de935-1228-4905-8ff9-b77e2db82097:side_chat:a685c3e7-c8be-4137-8900-4e899008bca7` | `delivered` | 1791953908 | 1 | null |
| `cron-delivery:paste-trade-watch:5a895f42-31ec-4128-b05e-ec39d0344464:side_chat:a685c3e7-c8be-4137-8900-4e899008bca7` | `delivered` | 1791916015 | 1 | null |

The worker's ack predicate passes on both. The `delivered_at_utc` value is the
runtime's confirmed receipt of the message into the side chat — a real channel
ack, not a simulated one, not the worker's own emission.

Same shape verified for `terminal-morning-brief`:
`cron-delivery:terminal-morning-brief:52d12f9c-4975-4495-b824-e72d2ed79e55:side_chat:a685c3e7-…`,
`state='delivered'`, `delivered_at_utc=1791897029`.

## Failure branch (the retry case)

One real failed row exists in the outbox:

| delivery_key | state | attempts | next_attempt_at_utc | last_error |
|---|---|---|---|---|
| `cron-delivery:terminal-morning-brief:697fb687-a757-49f9-8372-4bf24b1fe996:side_chat:a685c3e7-c8be-4137-8900-4e899008bca7` | `failed` | 1 | 1791551833 | `root follow-up ended without a publishable result` |

The worker treats `state='failed'` (or a missing row past the grace run) as a
retry trigger: same ledger entry, `attempts+1`, `next_attempt_at` per backoff
(60s → 5m → 15m → 1h → 1h → 1h), never a new dedup key, never a duplicate
message for an already-acked event. After 6 attempts: `failed`, surfaced in
the worker's output (one line with the signal id) and carried into the next
compact daily summary.

## What this proves and what it doesn't

- PROVES: the ack-detection query works against the live runtime delivery
  subsystem; both branches (ack / failure) have real observed shapes.
- DOES NOT prove: an automatic paper-signal delivery — no alert has been
  emitted yet (deployed paper tables hold 0 alerts). Status: test-proven,
  auto-unproven.
