# Trigger contract — enqueue→trigger hook — 2026-10-14

PAPER ONLY. The exact contract the DEPLOYED issuance path must implement so
delivery is triggered promptly after durable enqueue. Workspace-side
implementation cannot create this hook: it must live in the deployed
issuance path (`altcoin-analyzer-and-signal-tracker`), installed by an
artifact builder session with deploy rights.

## Parties

- **Issuer**: the deployed paper issuance path — `runpapersignalcycle`
  (currently `runExplicitPaperCycle` in the artifact's `server/src/actions.ts`;
  the v2.1.9 issuance handler when it is deployed) for SETUP_PENDING at
  qualification, and the entry-observation tick (deployed watcher, when its
  install blocker resolves) for ENTRY_CONFIRMED at entry observation.
- **Scheduler**: the runtime scheduler exposing `cron.run`.
- **Worker**: the `paper-signal-alert-delivery` agent cron, v2.2 body
  (WORKER-SPEC-v2.2-2026-10-14.md).

## The hook (exact)

Immediately after the issuance path durably commits qualifying alert row(s)
— i.e. the rows are readable via `getpaperpilotstatus` → `data.alerts` with
all `alert-schema.json`-required fields — the issuance path MUST call,
exactly once per enqueue batch:

```
cron.run(
  id: "paper-signal-alert-delivery",
  reason: "trigger:<signal_id>/<alert_type>[,<signal_id>/<alert_type>...] issued_at=<ISO-8601-UTC>"
)
```

Example reason:
`trigger:sig_9f2c/ENTRY_CONFIRMED issued_at=2026-10-14T18:03:11Z`

Rules:

1. **Commit before trigger.** The trigger fires only AFTER the alert row is
   durably committed. Never trigger before commit; a worker that cannot see
   the row logs `triggered_key_not_visible` and sends nothing (v2.2 §6) —
   the sweep's missed-trigger rule recovers it once visible.
2. **Exactly once per enqueue batch.** One `cron.run` per batch of rows
   committed in the same issuance execution; name every key in the reason.
   Duplicate triggers are safe (ledger dedup makes re-triggered runs no-ops),
   but the issuer does not rely on that.
3. **No issuer-side retry.** If the `cron.run` call itself fails or times out,
   the issuer MUST NOT retry it. The sweep's missed-trigger recovery
   (v2.2 §6: fresh keys older than `trigger_grace_s` with no ledger entry)
   covers the missed trigger — exactly once, under the same dedup key.
   Issuer retries would risk double-trigger races the ledger would then have
   to absorb; the recovery path is the designed fallback, not the retry.
4. **Both enqueue points.** SETUP_PENDING (qualification) and ENTRY_CONFIRMED
   (entry observation) are separate enqueue points, possibly in separate
   action executions — each fires its own trigger. A voided/expired contract
   enqueues nothing and triggers nothing (abstentions stay terminal-only).
5. **No payload in the reason.** The reason carries key names and `issued_at`
   only — never prices, timestamps-as-facts, or alert content. The worker
   renders exclusively from `data.alerts`; a reason-named key whose row is
   not visible is never rendered from the reason string (anti-fabrication).

## What the trigger does NOT do

- It does not mark anything delivered. Being trigger-named is not delivery;
  only the outbox ack earns `delivered` (Logan's rule, unchanged).
- It does not change dedup, retry, UNKNOWN, or abstention semantics. It
  changes only *when a worker run starts*.
- It does not replace the sweep. The 15-minute sweep remains for recovery:
  missed triggers, UNKNOWN reconciliation, retries, `recovered_unsent`.

## Open platform question (for the builder session)

Whether artifact server code executing as a `space_action` can invoke
`scheduler.cron.run`. This is unverified from the workspace. The builder
session must confirm one of:

- **(a) Preferred:** the deployed `runpapersignalcycle` action invokes
  `cron.run` directly after commit (needs the scheduler-invocation
  capability inside the artifact runtime).
- **(b) Fallback:** issuance runs under a `kind=agent` wrapper cron whose body
  invokes the `runpapersignalcycle` action, reads the returned alert keys,
  and calls `cron.run` on the delivery job. (Note: "the artifact builder owns
  installing silent artifact refreshes; a parent requesting a build passes
  along the trigger instead of adding the same schedule itself" — so (b) is
  the parent's call if (a) is impossible, not a second artifact build.)

Do not invent a third mechanism. If neither (a) nor (b) is available, say so
plainly: the system stays in `sweep-fallback` mode with documented lateness.

## Acceptance (deployed evidence, not assertions)

The hook is live when ALL of these are observed from deployed records:

1. A deployed `runpapersignalcycle` (or entry-tick) execution commits an
   alert row AND a `cron.run` on `paper-signal-alert-delivery` is recorded
   within ~60 s of the row's `issued_at`, with a reason naming the key.
2. The triggered worker run renders the alert; the outbox row for that run
   reaches `state='delivered'` with `delivered_at_utc` not null.
3. The ledger entry reaches `delivered` with `trigger_source: "trigger"` and
   a populated `event_to_delivery_delay_s`.
4. Only then does the parent flip `delivery-config.json` `discovery_mode`
   from `"sweep-fallback"` to `"trigger-only"`.

Until (4), the worker runs in `sweep-fallback` and the sweep's lateness is
the documented behavior — no sub-15-minute delivery is claimed.
