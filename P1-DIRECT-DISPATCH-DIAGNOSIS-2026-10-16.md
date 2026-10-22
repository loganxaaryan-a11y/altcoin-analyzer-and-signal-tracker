# P1 direct-dispatch diagnosis — 2026-10-16

## Outcome

Contract option (a), direct `cron.run` from the deployed `runpapersignalcycle` action after alert commit, is **not supported by the artifact runtime currently deployed for this project**.

The project is on `platformVersion: 25` and `@hatch/space-sdk` `0.13.0`. Its action `Ctx` exposes the database and blob clients, `agent`, `inference`, `tool`, `executePrivileged`, and query invalidation. It exposes no scheduler client and no `cron.run` method. A server action therefore cannot invoke `paper-signal-alert-delivery` through a supported artifact API. Privileged handlers do not add scheduler access; they are for host capabilities declared through `@space/privileged`, not the scheduler control plane.

No unsupported endpoint, private runtime route, subprocess shim, or third trigger mechanism was added.

## Existing commit points

Both enqueue points remain durable and idempotent:

- `SETUP_PENDING`: written to `paper_alert_events` in `runExplicitPaperCycle` with `onConflictDoNothing()`.
- `ENTRY_CONFIRMED`: written to `paper_alert_events` in `confirmPaperEntryTransition` inside the same ordered database batch that advances the entry checkpoint and inserts the signal/comparison rows.

The action does not claim a trigger was fired. The paper status response now exposes the unsupported direct-trigger result, the exact trigger-reason contract, the required safeguards, the wrapper-fence diagnosis, and the activation gate through `PAPER_DELIVERY_ARCHITECTURE`.

## Wrapper behavior diagnosis

Contract option (b) is implemented by the `paper-signal-cycle` kind=agent wrapper. Its handoff-14 run record proves the wrapper:

1. completed issuance;
2. read the post-commit alert snapshot;
3. diffed four new production keys;
4. computed exactly one compliant reason containing keys plus `issued_at`; and
5. did not invoke `cron.run`.

The recorded decision was `trigger_intent_recorded_mechanism_not_invoked`. Repeated refusal establishes that wrapper invocation is blocked, but the worker's own `execution-phase fence` explanation does not establish an authoritative platform restriction. The cause therefore remains unverified and the investigation is parked while the operational polling path is improved.

The later delivery trigger came from the one-minute watcher, not from this wrapper. The precise closeout is: **artifact dispatch unavailable; wrapper invocation blocked for an unverified reason; polling remains operational.**

## Safeguards preserved

- Alert identity is committed before any delivery work.
- Committed alerts remain recoverable through the delivery ledger.
- Duplicate triggers do not duplicate notifications; deduplication is by `signal_id` + `alert_type` within separate production and test ledgers.
- Outbox acknowledgement reconciles a send to delivered; an ambiguous send reconciles to UNKNOWN, surfaces once, and is never auto-retried.
- Trigger reason carries only `<signal_id>/<alert_type>` keys and `issued_at`.
- One-minute watcher and 15-minute sweep remain operational.
- `delivery-config.json`: remains `discovery_mode: "sweep-fallback"`.

## Activation gate

Do not switch to `trigger-only` until deployed evidence demonstrates all four conditions:

1. scheduler invocation recorded;
2. triggered worker ran;
3. delivery outbox acknowledged delivery; and
4. delivery ledger recorded `trigger_source: "trigger"`.

## Evidence read

- `paper-signals/pilot/delivery/TRIGGER-CONTRACT-2026-10-14.md`
- `paper-signals/pilot/delivery/WRAPPER-FALLBACK-INSTALL-2026-10-14.md`
- `paper-signals/pilot/delivery/wrapper-runs/run-20261016T130400Z.json`
- `hidden_files/latency-analysis-2026-10-16.md`
- `node_modules/@hatch/space-sdk/dist/index.d.ts`
- `server/src/actions.ts`
- `server/src/paper-v219.ts`
- `space.json`
