# Watch-only entry worker — 2026-10-15

PAPER ONLY. No brokerage, no orders. No model changes, no freeze changes.

## What is installed

`pilot/src/entry-worker.ts` + the `watch` command (`node dist/pilot.js watch`,
`npm run watch`). One bounded run:

1. Runs ONE `integratedTick` against the durable SQLite store — the same tick
   the 5-min `paper-pilot-watcher` cron invokes.
2. Any ENTRY_CONFIRMED observed routes through the SHARED transactional entry
   transition + durable outbox (`src/entry-outbox.ts`, tagged
   `observed_by="watcher"`) — the same module the wrapper lane uses.
3. Dispatches due outbox events PROMPTLY (claim-before-send) via the drain at
   the end of the run, instead of waiting for the 15-min delivery sweep.
4. Prints a JSON report: tick outcomes (processed/issued/awaiting/rejected/
   expired/deferred) + outbox counts (accepted transitions, duplicate
   refusals, sends attempted, by-state).

Smoke-tested 2026-10-15 on a scratch DB: `processed=0, issued=[], awaiting=[]`,
outbox `{}`, exit 0 — the worker runs clean with nothing due and emits no
chat-facing output (quiet when nothing is due, per the delivery convention).

## What observes (window semantics)

- **What:** the `paper-pilot-watcher` cron (5 m interval, `goal:research-terminal`,
  `crons/minutely/paper-pilot-watcher__interval@5m.md`) runs
  `node dist/pilot.js watch` (proposed; currently `tick` — same tick, see the
  cron-body note below) with `PILOT_DB` pointed at the pilot's durable SQLite.
- **Window:** the ORIGINAL 15-minute crypto entry window, anchored at the
  persisted `decisionAt` (qualification instant). `observeEntryPhase` parses
  `pending.entryWindowOpensAt` / `pending.entryWindowExpiresAt` /
  `pending.decisionAt` from the stored contract row (handler.js:626–630) —
  the tick never rewrites them.
- **Resume, not restart:** the observation checkpoint is read from the
  contract row (`readObservationCheckpoint(pending, decisionMs)`,
  handler.js:1374) — each tick continues FROM the persisted checkpoint,
  never resets `sinceTs` blindly. Poll cadence (20 s) is strictly finer than
  the window (enforced by `ContractError`, handler.js:645–648).
- **Poll-budget exhaustion ≠ expiry:** the candidate keeps `awaiting-entry`
  with `nextReassessmentAt` set (`commitPollBudgetOutcome`, handler.js:1163–
  1177) — the next tick resumes it. Expiry only at the real window close.

## No-requalification proof

`processIntegratedCandidate` (handler.js:1554) branches FIRST on
`candidate.status === "awaiting-entry"` → `resumeAwaitingEntry` (handler.js:
1559–1561). The qualification path — min-score floor, freshness refresh,
regime gate, `runQualificationChecks`, duplicate suppression, contract build
(handler.js:1562–1630) — is unreachable for awaiting-entry contracts. The
watch worker runs `integratedTick` only; it never calls `ingest`, never
builds candidates, never touches qualification. `cmdWatch` sets
`preObserveHoldMs: 0` (no demo-harness timing).

## ENTRY_CONFIRMED → prompt delivery (same outbox)

The worker's `deliverAlert` (built by `buildDeps`, `src/deps.ts`) routes every
entry alert through `attemptEntryConfirmed()` on
`pilot/delivery/entry-outbox.sqlite` — the same DB, same table, same
UNIQUE(contract_id, event_type, event_version) the wrapper lane uses. First
observer wins; the loser logs `entry-transition-duplicate` and never sends.
After acceptance the event is dispatched promptly (claim-before-send); the
end-of-run drain picks up orphans. See ENTRY-OUTBOX-DESIGN-2026-10-15.md for
the transition/outbox semantics and the idempotency/UNKNOWN disclosure.

## Why the watcher path exists

The issuance wrapper (`paper-signal-cycle`, kind=agent) works by diffing
pre/post `getpaperpilotstatus` snapshots around its `runpapersignalcycle`
call and firing exactly one `cron.run` per batch for the new keys
(WRAPPER-FALLBACK-INSTALL-2026-10-14.md, body steps 3–5). **It cannot observe
writes committed after it returns.** An entry print arriving in
(post-snapshot, decisionAt+15 min] — i.e. inside the contract's window but
after the wrapper's post-snapshot — is invisible to the wrapper: no diff
sees it, no trigger fires for it. The 5-min watch-only ticks observe the
persisted pending contracts continuously through their original windows and
route ENTRY_CONFIRMED to prompt delivery via the shared outbox, closing that
gap. (This is the local reference-lane equivalent of the deployed entry tick
"Variant A" — a future real-time improvement, not a delivery gap.)

## Cron-body note (parent action)

The `paper-pilot-watcher` body currently invokes `node dist/pilot.js tick`.
`watch` is a strict superset for this job's purpose (same tick + watcher
tagging + outbox prompt-drain + structured report; still no ingest, still
quiet when nothing is due). Proposed one-line change to the installed cron
body, for the parent to apply via `cron.update`:

    node dist/pilot.js watch

with `PILOT_DB` unchanged. Until then, `tick` already routes entry alerts
through the same shared outbox (the wiring is in `buildDeps`, used by both) —
the difference is only the `observed_by` tag, the prompt drain, and the
report shape.
