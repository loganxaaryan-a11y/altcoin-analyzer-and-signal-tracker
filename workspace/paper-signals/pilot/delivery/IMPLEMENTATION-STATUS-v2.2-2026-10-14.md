# Implementation status — v2.2 trigger-driven delivery — 2026-10-14

Honest accounting of what this task implemented workspace-side versus what
requires the deployed artifact (or the parent) to change. Paper only.

## APPLIED to the live cron — worker-side trigger readiness (DONE, 2026-10-14 ~00:05Z 2026-10-15 UTC)

The v2.2 worker body is LIVE on `paper-signal-alert-delivery` (applied via
`cron.update`, verified via `cron.view`):

| # | Change | Where |
|---|---|---|
| 1 | v2.2 verbatim worker body installed: §0 run provenance (TRIGGERED vs SWEEP), §6 triggered-run named-key-only delivery, sweep recovery-only in trigger-only mode (trigger_grace_s honoring + missed-trigger recovery), discovery_mode read every run | `pilot/delivery/APPLIED-WORKER-BODY-v2.2-2026-10-14.md` (exact installed text) |
| 2 | §6b TEST branch (v2.2-adapted): test:true rows route to the test branch in any run mode; test ledger + test timeliness log only; TEST banner rendering; probe runs deliver all visible test rows on `trigger:test/` reasons | same body |
| 3 | §4 TEST TRIGGER EXCEPTION: `trigger:test/` runs invoke getpaperpilotstatus with {"emitTestAlert": true} (response-time-synthesized probe row, never persisted) | same body |
| 4 | Entry-to-delivery metric wiring: §7 pre-commit records event_time_utc/event_time_source/run_mode; §5 on the delivered transition records BOTH intervals — `event_to_delivery_delay_s` (ack−event) and `enqueue_to_ack_delay_s` (ack−sent_at_utc) — plus delivered_inside_contract_window, trigger_source, trigger/sweep latency, missed_trigger, clock_skew; appended to the correct timeliness log (production/test kept separate) | same body |
| 5 | UNKNOWN preserved: §5 marks unknown on unconfirmable outbox rows, never auto-retried, never delivered without ack; trigger never changes delivery_status | same body |
| 6 | `delivery-config.json`: version → `2026-10-14+trigger-live-worker`; `trigger_contract.status` records worker-side readiness; `enqueue_to_ack_delay_s` added to ledger fields list | `pilot/delivery/delivery-config.json` |

The worker is now trigger-ready: a `cron.run` with reason
`trigger:<signal_id>/<alert_type> issued_at=<ISO-8601-UTC>` starts a TRIGGERED
run that delivers only the named keys promptly after commit, without waiting
for the next sweep. The 15-min sweep remains (sweep-fallback discovery for
now; recovery-only once `discovery_mode` flips to `trigger-only`).

## Implemented workspace-side (earlier 2026-10-14, done)

| # | Artifact | Path |
|---|---|---|
| 1 | Worker spec v2.2 (triggered/sweep run modes, missed-trigger recovery rule, `discovery_mode` transition, timeliness fields) | `pilot/delivery/WORKER-SPEC-v2.2-2026-10-14.md` |
| 2 | Trigger contract: exact hook the deployed issuance path must implement | `pilot/delivery/TRIGGER-CONTRACT-2026-10-14.md` |
| 3 | Entry-to-delivery delay metric: definition, derived fields, clock-skew rule, both intervals | `pilot/delivery/ENTRY-TO-DELIVERY-METRIC-2026-10-14.md` |
| 4 | This status file | `pilot/delivery/IMPLEMENTATION-STATUS-v2.2-2026-10-14.md` |

v2.1 files are superseded where noted but preserved (v2.1 spec §§0–8 replaced
by v2.2; v2.1 hardening — pre-commit ordering, reconciliation, UNKNOWN,
status separation — retained unchanged inside v2.2).

## NOT implemented — requires the parent

1. **Flip `discovery_mode` to `"trigger-only"`** only after the trigger hook
   is deployed AND one triggered delivery is proven end-to-end per the
   contract's acceptance section. Flipping early would strand fresh alerts
   (sweep would wait out the grace for triggers that never come, then
   recover them late — worse than sweep-fallback, not better).

## NOT implemented — requires the deployed artifact (builder session)

2. **The enqueue→trigger hook does not exist.** Nothing in the deployed
   `runpapersignalcycle` (`runExplicitPaperCycle`, `server/src/actions.ts`)
   calls `cron.run` after alert commit. Installing it needs an artifact
   builder session with deploy rights on `altcoin-analyzer-and-signal-tracker`.
   This seat (depth 2/2) cannot edit or redeploy the artifact, and cannot
   invoke artifact.* actions. This is the one missing capability between the
   current state and the trigger contract's acceptance evidence.
3. **Open platform question:** whether artifact server code running as a
   `space_action` can invoke `scheduler.cron.run`. Unverified from the
   workspace. Fallback is the parent's call: a `kind=agent` issuance wrapper
   that invokes the action then calls `cron.run` (TRIGGER-CONTRACT §"Open
   platform question"). If neither works, the system stays in
   `sweep-fallback` — stated plainly, not worked around.
4. **ENTRY_CONFIRMED enqueue point:** the deployed entry-observation tick
   (`paper-entry-watcher` Variant A) is not installed — its install blocker
   (unconfirmed watch entry point) is still open. Entry triggers cannot fire
   until the entry tick runs on a confirmed deployed entry point.
5. **Issuance itself is not scheduled:** `paper-signal-cycle` (the cron that
   would invoke `runpapersignalcycle` automatically) is SPEC ONLY, not
   installed. With no automatic issuance, there is nothing to trigger yet —
   the trigger architecture is proven on the first real automatic signal.

## NOT yet measurable

6. **The production metric has zero rows.** No genuine alert has ever been
   delivered (`alert-delivery-ledger.json` entries: {}), so
   `entry-to-delivery-log.jsonl` is absent and there is no baseline. The
   first delivered genuine alert seeds it. The TEST probes populate only
   the test ledger/log. Sub-15-minute delivery is not claimed until the
   contract's acceptance evidence exists.

## What changes for Logan, concretely

- Today: nothing in his chat changes. The worker is trigger-ready but the
  issuer hook isn't deployed, so alerts (when the first real signal issues)
  still flow via the 15-minute sweep, with the documented lateness. Genuine
  deliveries now record event_to_delivery_delay_s + enqueue_to_ack_delay_s
  per alert.
- After the hook deploys and proves out: SETUP_PENDING / ENTRY_CONFIRMED
  alerts arrive in the research side chat within ~minutes of enqueue instead
  of at the next quarter-hour sweep — and every delivery carries a measured
  event-to-ack delay he can see in the daily summary.
- What never changes: PAPER only, no brokerage; delivered-only-on-real-ack;
  UNKNOWN never auto-retried; abstentions stay terminal-only.
