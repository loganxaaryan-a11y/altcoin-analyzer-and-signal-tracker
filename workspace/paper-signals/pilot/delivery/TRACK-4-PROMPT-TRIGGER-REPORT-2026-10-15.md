# TRACK 4 — Prompt entry-observation trigger (watcher lane) — 2026-10-15

PAPER ONLY. No brokerage, no orders. No model/freeze/holdout contact.

## What was wired

New workspace cron **`paper-entry-prompt-trigger`** (kind=agent, interval 1m,
America/Toronto, owner `goal:research-terminal`, enabled 2026-10-15 ~18:31 EDT):
the prompt trigger for the deployed entry-observation lane's durable enqueue
point. Live definition:
`~/workspace/goals/research-terminal/crons/minutely/paper-entry-prompt-trigger__interval@1m.md`.

Why it exists: the deployed `watchPaperEntries` (1-min schedule, installed
2026-10-15 via builder seat, Repair 6) commits ENTRY_CONFIRMED alert rows via
`confirmPaperEntryTransition` → `paperAlertEvents` — OUTSIDE any
`runpapersignalcycle` invocation. The issuance wrapper (`paper-signal-cycle`)
only diffs pre/post snapshots around its own invocation and cannot see those
commits. Until this track, the only delivery path for watcher-committed
ENTRY_CONFIRMED rows was the 15-minute sweep. The trigger contract's
"ENTRY_CONFIRMED enqueue point CLOSED via the wrapper" claim
(`delivery-config.json` `trigger_contract.status`) is therefore STALE for the
watcher lane — this watcher closes it.

Mechanism (commit-before-trigger, by construction):
1. Each poll invokes `getpaperpilotstatus` (default args) on
   `altcoin-analyzer-and-signal-tracker` and parses `data.alerts` in memory.
2. A row is trigger-eligible iff: `alert_type == "ENTRY_CONFIRMED"`
   (SETUP_PENDING stays with the issuance wrapper — never named here),
   `issued_at` newer than the persisted watermark, within the 900s freshness
   cap (older rows belong to the sweep's missed-trigger recovery), and its
   dedup key is in neither delivery ledger nor the watcher's own
   `triggered_keys` set.
3. Exactly one `cron.run(id="paper-signal-alert-delivery",
   reason="trigger:<keys> issued_at=<latest row issued_at>")` per label-batch
   (production keys and `trigger:test/` keys fire separately so the worker's
   §6b TEST branch routes unambiguously). Keys + `issued_at` only in the
   reason — never prices or alert content. No retry on `cron.run` failure
   (contract rule 3; sweep recovers).
4. State (`trigger-watcher-state.json`: watermark, triggered_keys) + run log
   (`trigger-runs/run-<UTC-ts>.json`, last 20) written every poll; the worker
   never produces chat-facing output.

The 15-minute `paper-signal-alert-delivery` sweep is unchanged and stays as
recovery (missed triggers, UNKNOWN reconciliation, retries). Overlap with the
wrapper's own ENTRY_CONFIRMED diff is safe: ledger checks + triggered_keys +
the worker's ledger pre-commit dedup make a double trigger a no-op.

## Deployed proof (TEST probe, real outbox ack)

No genuine ENTRY_CONFIRMED has been committed by the deployed watcher, so the
proof uses the established labeled TEST-probe mechanism (`trigger:test/`
reason → worker `emitTestAlert` synthesis → side chat → real channel ack),
quarantined to `alert-delivery-ledger-test.json` /
`entry-to-delivery-log-test.jsonl`. This probe fires the EXACT `cron.run` call
the trigger-watcher makes — proving the trigger → delivery → ack chain on
deployed with measured latencies from real outbox ack evidence (independent
`muse.db` SELECT on `scheduler.delivery_outbox`, not emission or HTTP 200).

| Leg | Evidence |
|---|---|
| Trigger | `cron.run(id="paper-signal-alert-delivery", reason="trigger:test/sig_TEST_9f3a7c1e/ENTRY_CONFIRMED issued_at=2026-10-15T22:34:27Z")` — run `b0b5d70b-5418-4dd5-b17f-9afa63fe80ed`, queued 2026-10-15T22:34:31Z |
| Worker | Triggered run started 22:34:41Z (`trigger_latency_s=14`), TEST mode (`emitTestAlert:true`), synthesized `test/sig_TEST_39d9282b/ENTRY_CONFIRMED`; reason-named key correctly logged `triggered_key_not_visible`, never rendered from the reason. Rendered `**TEST — PAPER — ENTRY CONFIRMED**` (BTCUSD) as final output; test ledger pre-committed `awaiting-ack` at `sent_at_utc=2026-10-15T22:35:20Z`. Run log: `worker-runs/run-2026-10-15T22-34-41Z.json` |
| Chat ack (REAL) | Outbox row `cron-delivery:paper-signal-alert-delivery:b0b5d70b-5418-4dd5-b17f-9afa63fe80ed:side_chat:a685c3e7-c8be-4137-8900-4e899008bca7`: `state='delivered'`, `delivered_at_utc=1792008505→1792103866` (2026-10-15T22:37:46Z), `attempt_count=1`, `last_error=null` — verified by independent `muse.db` SELECT |

Measured latencies (worker book-of-record, from the real outbox ack):
- `event_to_delivery_delay_s` = **175s** (event `2026-10-15T22:34:51.141Z` → ack `2026-10-15T22:37:46Z`; independent raw calc 174.9s)
- `enqueue_to_ack_delay_s` = **146s** (enqueue `2026-10-15T22:35:20Z` → ack `2026-10-15T22:37:46Z`)
- `trigger_latency_s` = 14s (reason `issued_at` → worker run start), worker-recorded

The worker's §5 reconciliation (sweep run ~22:45Z) marked the test key
`delivered` with `ack_at_utc=2026-10-15T22:37:46Z` (matching the independent
outbox read exactly), `trigger_source=trigger`, `missed_trigger=false`,
`clock_skew=false`, and appended the timeliness row to
`entry-to-delivery-log-test.jsonl` — CONFIRMED 2026-10-15T22:52Z.
Production ledger and production timeliness log untouched (verified: no
production keys).

## Watcher mechanical verification

- `cron.add` 2026-10-15T22:31Z; `cron.view` confirms kind=agent, 1m,
  owner goal:research-terminal.
- Manual run `67d17037-5117-4a86-9825-d3e6a89c2925` (`manual:` reason):
  state initialized (`watermark_issued_at=2026-10-15T22:31:47Z`),
  `initialized_no_trigger`, no spurious trigger, `scheduler_provenance=manual`.
- Scheduled runs: `getpaperpilotstatus` poll OK (`alerts_seen=0`),
  `no_fresh_keys`, no trigger, `scheduler_provenance=origin_unverified`.
  Poll cadence confirmed live at 1m.
- **Silence defect found + fixed 2026-10-15 ~22:54Z:** 2 of the first ~20
  runs emitted final-message text that the runtime relayed to the research
  side chat as visible messages (outbox rows `cron-delivery:paper-entry-prompt-trigger:67d17037…`
  and `…:b34a61c6…:side_chat:a685c3e7…`, both `delivered`). Benign
  bookkeeping noise in the builder chat, but a contract violation. Fix:
  body updated via `cron.update` with a HARD silence rule (final message
  MUST be completely empty; the 2026-10-15 incident cited verbatim in the
  body). Monitoring: no new `paper-entry-prompt-trigger` outbox rows after
  the fix.

## What is NOT claimed

- **Natural end-to-end issuance stays UNPROVEN.** No genuine ENTRY_CONFIRMED
  has traversed watcher-commit → trigger-watcher fires → worker → ack. The
  trigger-watcher's firing logic is proven mechanically + structurally
  (commit-before-trigger by construction: it fires only for rows visible via
  `getpaperpilotstatus`); the first genuine watcher-committed row will
  exercise it automatically, and its run log's `trigger_reason` will be the
  evidence.
- The in-action hook (trigger-contract fallback (a): deployed
  `watchPaperEntries` calling `scheduler.cron.run` directly after commit)
  remains uninstalled — needs a builder session + the open platform question
  (can `space_action` code invoke `scheduler.cron.run`?) answered. It is now
  explicitly OPTIONAL: the 1-min trigger-watcher achieves prompt delivery
  without it.
- `delivery-config.json` `discovery_mode` stays `"sweep-fallback"` per the
  contract's acceptance section — it flips to `"trigger-only"` only after one
  triggered delivery of a genuine (non-TEST) alert is proven end-to-end.
- Exactly-once delivery is not claimed (per WORKER-SPEC-v2.2): at-most-one
  delivery per dedup key + honest UNKNOWN.

## Files

- Live cron: `paper-entry-prompt-trigger` (mirror:
  `~/workspace/goals/research-terminal/crons/minutely/paper-entry-prompt-trigger__interval@1m.md`)
- State: `~/workspace/goals/research-terminal/paper-signals/pilot/delivery/trigger-watcher-state.json`
- Run logs: `~/workspace/goals/research-terminal/paper-signals/pilot/delivery/trigger-runs/`
- Test books: `~/workspace/goals/research-terminal/paper-signals/pilot/delivery/alert-delivery-ledger-test.json`,
  `entry-to-delivery-log-test.jsonl`
- Probe worker run log: `~/workspace/goals/research-terminal/paper-signals/pilot/delivery/worker-runs/run-2026-10-15T22-34-41Z.json`
