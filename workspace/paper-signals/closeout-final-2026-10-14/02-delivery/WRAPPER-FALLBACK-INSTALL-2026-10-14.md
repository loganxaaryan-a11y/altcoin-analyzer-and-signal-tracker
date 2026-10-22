# Issuer-side hook — WRAPPER FALLBACK install — 2026-10-14/15

PAPER ONLY. No brokerage, no execution. No model tuning, no freeze change, holdouts locked.

## Why the wrapper (contract fallback (b))

TRIGGER-CONTRACT-2026-10-14.md offers two mechanisms for the issuer-side hook:

- **(a) Preferred:** the deployed `runpapersignalcycle` action calls `cron.run`
  directly after alert commit. UNAVAILABLE from this seat: installing it needs
  an artifact builder session with deploy rights on
  `altcoin-analyzer-and-signal-tracker` (depth 2/2 cannot edit or redeploy the
  artifact; the "open platform question" — whether space_action code can invoke
  scheduler.cron.run — is unverified and cannot be verified from the workspace).
- **(b) Fallback:** "issuance runs under a `kind=agent` wrapper cron whose body
  invokes the `runpapersignalcycle` action, reads the returned alert keys, and
  calls `cron.run` on the delivery job."

(b) is implemented here. No third mechanism was invented.

## What was installed

`paper-signal-cycle` (previously a silent `space_action` → `runpapersignalcycle`
every 6h, anchored 2026-10-01T23:09:23 America/Toronto, 45 min after
`crypto-market-discovery`) was converted IN PLACE to `kind=agent` with the
wrapper body below. Same id, same schedule phase (verified: next run still
2026-10-14 23:09:23 EDT), same timeout. Owner moved from
`space:altcoin-analyzer-and-signal-tracker` to `goal:research-terminal` —
platform validation REJECTS artifact-owned (`space:*`) schedules with
kind=agent ("an artifact-owned schedule must use execution.kind=space_action
for a silent refresh"), so the wrapper is delivery-side owned. Delivery target
set to the research side chat (required for kind=agent); the body carries the
delivery worker's silence convention verbatim (it never produces chat-facing
output — its record is the run log file).

The wrapper body, per run:

1. PRE-SNAPSHOT: `getpaperpilotstatus` (default args) → records visible alert
   dedup keys `<signal_id>/<alert_type>` (test rows skipped).
2. ISSUE: invokes `runpapersignalcycle` (no args) — the same call the
   space_action schedule made. On failure: logs `issuance_failed`, ends.
3. POST-SNAPSHOT: `getpaperpilotstatus` again → the durably committed rows.
4. DIFF: `new_keys` = post keys − pre keys − every key already in the
   production or test ledger (any state); keeps only SETUP_PENDING /
   ENTRY_CONFIRMED, never test rows.
5. TRIGGER (exactly once per batch): if `new_keys` non-empty →
   `cron.run(id="paper-signal-alert-delivery",
   reason="trigger:<k1>,<k2> issued_at=<latest row issued_at ISO-8601-UTC>")`.
   On `cron.run` failure: NO retry (contract rule 3) — logs
   `trigger_call_failed`; the sweep's missed-trigger recovery covers it.
6. RUN LOG → `pilot/delivery/wrapper-runs/run-<UTC-ts>.json`; final message is
   a 3-line run summary for the run record only (no chat delivery).

Hard rules (in the installed body): commit-before-trigger (rows must be visible
in the post-snapshot — never trigger from the action return payload alone);
exactly one `cron.run` per batch; no issuer-side retry; no test/ keys ever
named; no alert content/prices in the reason (keys + issued_at only); ledgers
and timeliness logs are read-only for the wrapper (only the delivery worker
writes delivery books); no model code / frozen comparison / holdout contact.

## Scope notes (honest)

- The wrapper hooks the QUALIFICATION-time enqueue point (SETUP_PENDING). The
  deployed entry-observation tick (Variant A) is not installed — its install
  blocker stands — so ENTRY_CONFIRMED has no deployed enqueue point to hook yet.
  The 15-min delivery sweep still covers every path as recovery.
- The workspace `paper-discovery-handoff` lane (kind=agent, same 6h phase, runs
  the handoff CLI) is a SEPARATE path and was not touched. If it ever enqueues
  deployed alert rows, the sweep (not this wrapper) picks them up.
- Issuance cadence, phase, idempotency (content-hash issuance-claim), and the
  zero-candidate clean-completion behavior are unchanged — the wrapper makes the
  same action call the space_action schedule made, then diffs and triggers.

## State after install

- Hook: INSTALLED (via wrapper fallback). Proven: NO — no genuine alert has
  been enqueued since install, so the full chain
  (wrapper cron.run → triggered worker run → outbox delivered → ledger
  delivered with trigger_source=trigger) is not yet observed.
- Task state label: **`trigger-ready`** (hook installed, not yet proven).
- `delivery-config.json` `discovery_mode` stays `"sweep-fallback"` per the
  contract's acceptance section — it flips to `"trigger-only"` only after one
  triggered delivery is proven end-to-end (triggered run → outbox delivered →
  ledger delivered with trigger_source="trigger"). No sub-15-minute delivery
  is claimed until then.

## Verification (completed 2026-10-15 ~00:42Z)

- Install verified via `cron.view` (execution.kind=agent, wrapper body
  installed, schedule phase preserved — next run 2026-10-14 23:09:23 EDT;
  owner goal:research-terminal; delivery target set as required for
  kind=agent).
- Mechanical verification: manual `cron.run` on `paper-signal-cycle`
  (run 0729f437-9d2b-4f7d-b741-9a988f640b07, reason "manual wrapper
  verification", 2026-10-15T00:38:28Z → succeeded 00:42:22Z). Results in
  `pilot/delivery/wrapper-runs/run-2026-10-15T004055Z.json`:
  - The agent worker CAN invoke the issuance action: deployed paper cycle
    run id 8 completed under the wrapper (issued 0, deferred 7, abstained 1,
    handler 2.1.9, freeze paper-pilot-v2.1.0) — clean, nothing manufactured;
    issuance continuity preserved vs the old space_action runs.
  - Pre/post diff works: pre_keys=0, post_keys=0, known_keys=2 (the two test
    ledger keys, correctly excluded as known) → new_keys=[] →
    trigger_decision `no_new_alerts`, no spurious trigger fired.
  - Chat silence confirmed: no `scheduler.delivery_outbox` row for the
    wrapper run → nothing relayed to the side chat (the worker's final
    message is transcript bookkeeping only, same as the delivery worker's
    "Nothing to report" quiet notes).
- NOT verified (by construction): the wrapper firing `cron.run` on a genuine
  alert — no genuine alert has been enqueued since install, and test rows are
  never persisted so the wrapper can never see them (it also never names
  test/ keys). The first genuine qualifying signal exercises this
  automatically; the wrapper run log's `trigger_reason` will be the evidence.
- Latency note (honest): the wrapper fires the trigger after
  issuance-return + post-snapshot, so trigger latency = action duration +
  snapshot time (seconds to low minutes). The contract's ~60 s acceptance bar
  will be measured on the first real firing, not assumed.
