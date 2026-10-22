# Timeout diagnosis — paper-signal-alert-delivery, 2026-10-14 (13:30 / 13:45 / 14:00 / 14:15 EDT)

Paper only. No brokerage. Fresh export from `scheduler.job_runs` + `scheduler.delivery_outbox`
(`muse.db`, 2026-10-14 ~14:40 EDT) covering all FOUR consecutive timeouts. Supersedes the
3-run version: adds the 14:15 EDT run, the `worker_phase` column (direct phase-at-termination
evidence), the 14:15 run's lost file writes, and the first v2-body run (14:30 EDT) observation.

## 1. Exported timeout stage — all four runs cut in `resolve`

| Scheduled (EDT) | run_id | started (EDT) | finished (EDT) | exec duration | status | worker_phase at kill |
|---|---|---|---|---|---|---|
| 13:30 | 5c85cba3-1061-424f-b99c-dcec4fabcbdb | 13:38:48 (+8.8 min late) | 13:45:01 | 373s | timeout | **resolve** |
| 13:45 | c1c6adde-9cce-4a0e-acf9-84446e1035c1 | 13:45:01 | 14:00:19 | 918s | timeout | **resolve** |
| 14:00 | 1970c8b0-d7b4-4fd0-9883-7f72a86c652b | 14:00:19 | 14:15:33 | 914s | timeout | **resolve** |
| 14:15 | d8f1e8a0-0d5a-4d6f-a71b-ee2b87c7734f | 14:15:33 | 14:30:52 | 919s | timeout | **resolve** |

`error_text` (all four, verbatim): "Ran out of its 900s time budget before finishing;
steps it finished stand, the rest did not run." `worker_execution_timed_out=true` on all four.

Budget math: the job requests `timeout_secs: 600`, but the runtime enforces
`max(requested, cadence)` = **900s effective** for a 15m-interval job (the error text confirms
900s). The three full runs consumed 914–919s — the entire effective budget — inside the worker's
execute pacing, leaving nothing for the controller's resolve phase (final-output processing →
result certification → chat-relay bookkeeping). The 13:30 run started 8.8 min late (scheduler
slot contention) and was retired at 373s when the 13:45 occurrence fired (`finished_at` ==
next `scheduled_for` to the second).

## 2. Persisted vs lost progress at termination

| Run (EDT) | status snapshot | run log | checkpoint | outbox row | ledger |
|---|---|---|---|---|---|
| 13:30 | written 13:41:55 | written 13:44:37 | none | created 13:45:01 → delivered 13:47:01 | untouched (empty) |
| 13:45 | written 13:55:04 | written 13:59:13 | none | created 14:00:19 → delivered 14:06:20 | untouched (empty) |
| 14:00 | written 14:09:23 | written 14:11:15 | none | created 14:15:33 → delivered 14:20:34 | untouched (empty) |
| 14:15 | **LOST** — never written | **LOST** — never written | none | created 14:30:52 → delivered 14:34:28 | untouched (empty) |

(All times EDT. Outbox rows: `scheduler.delivery_outbox`, `delivery_key =
cron-delivery:paper-signal-alert-delivery:<run_id>:side_chat:a685c3e7-…`, all `state='delivered'`.)

- **Persisted (13:30/13:45/14:00):** config+ledger loaded, `getpaperpilotstatus` succeeded
  (raw response saved, `alerts=[]` — nothing was due every time), ack sweep no-op (ledger empty),
  send sweep 0 alerts, run log written. The workers' `result_summary` texts are on record.
- **Lost (14:15):** the worker's own summary states it "loaded config, loaded empty ledger,
  pulled deployed status via getpaperpilotstatus (alerts: [], candidates: [], signals: []),
  verified no alerts due, quiet rule applies" — but `worker-runs/status-<ts>.json` and
  `worker-runs/run-<ts>.json` "were not persisted … due to cron phase timeout" and the prune
  never ran. No `worker-runs/` file has an mtime between 18:15 and 18:31 UTC. The run's work
  product survives ONLY as the `result_summary` row and the relayed outbox output.
- **Controller-timeout ≠ delivery failure:** all four runs' outputs were relayed to the research
  side chat AFTER the timeout via the per-run outbox rows (delivered 2–6 min after `finished_at`).
  These were quiet runs, so the relayed outputs were the quiet summaries — no alert content involved.
- **Ledger:** `entries` still `{}` — no alert has ever been due, so no delivery record exists.
  The ledger file itself was rewritten at 14:28 EDT (v2 schema: `unknown` in the status
  vocabulary, `status_fields_v2_2026_10_14` separation block) — schema-only change, no entries.
- **Checkpoints:** ZERO `checkpoint-*.json` files exist in `worker-runs/`. No production run has
  ever written one — including the 14:30 EDT run, the first to execute the v2 body (it wrote its
  status snapshot at 14:37 and run log at 14:38, ~5.5 min into its run, but no checkpoint and no
  `controller_status`/`delivery_status` fields in the run log). The v2 checkpoint mechanism is
  specified but not adopted by the worker agents in practice.

## 3. Root cause

**Controller-side starvation, not a worker-side hang.** Ruled out as hang locations:

- `getpaperpilotstatus` latency as a *failure*: the action succeeded on every run (3 snapshots on
  disk; the 4th run's summary confirms `alerts: []` returned). Slow as part of overall pacing, not stuck.
- The outbox check: ledger was empty, nothing to check.
- The 20-file prune: 16–20 files present, never the blocker.
- The 600s request: irrelevant — the effective budget is 900s and the workers burned all of it.

What actually happened: the worker agent paces ~10 tool-call turns at ~60–90s/turn through
(read 4 spec docs + config + ledger + schema → 1 artifact action → 2 file writes), consuming the
full 900s in execute. The controller's resolve phase then has zero headroom and the budget
expires mid-resolve → `status=timeout`, `worker_phase=resolve`, `execution_incomplete=true` —
even though the output is relayed to chat minutes later anyway. The 13:30 run additionally shows
scheduler slot contention (8.8-min-late start, retired by the next firing).

Corroboration that the work fits when time-boxed: the 14:30 EDT run (first v2-body run) completed
all file work (snapshot + run log) by ~5.5 min into its run.

## 4. Why this matters for alerts (the race the v2.1 hardening closes)

The outbox `delivery_key` is **per-run**, not per-alert, and the side chat does **not** dedupe on
`(signal_id, alert_type)` — exactly-once is therefore NOT a channel property here (Logan's
correction). The dangerous races, in worker-observable terms:

- Kill between render and ledger-write → alert text may land in chat (outbox row → delivered)
  while the ledger has no record → next run re-emits → **duplicate**.
- Kill after ledger-write but before the controller relays → ledger says `awaiting-ack` for an
  alert that never landed → **silent loss** unless the next run reconciles.
- Kill mid-resolve with the outbox row in a non-terminal state → **unconfirmable**: never blindly
  re-send as unsent, never mark delivered without ack evidence → `UNKNOWN`, surfaced once.

v2's answer (checkpoints + render-before-ledger + reconciliation) is unproven in production —
the workers never wrote the checkpoints it depends on. v2.1 (`WORKER-SPEC-v2.1-2026-10-14.md`)
replaces the checkpoint dependency with **ledger pre-commit**: the `awaiting-ack` entry (with
dedup key, `sent_at`, `run_ts`) is written BEFORE the alert text becomes the run's output, so
every rendered alert has a ledger record by construction; recovery then reconciles each
non-terminal entry against the outbox (delivered → attach ack evidence, never re-send; no row +
run older than one interval → safe fresh attempt under the SAME key; row ambiguous → UNKNOWN,
surfaced once). Checkpoints stay as supplementary fast-path only.

## 5. Post-diagnosis observation — the streak broke on the first v2-body run

The 14:30 EDT run (run 72fdc826…, first to execute the v2 body with the §0 time-box):
`status=succeeded`, `worker_phase=resolve` at finish, `worker_execution_timed_out=false`,
attempt 1. File work (status snapshot + run log) was complete by ~14:38 EDT, ~5.5 min into the
run — the same mechanical work the timed-out runs stretched across the full 900s. The four
timeouts were a pacing problem, and the time-box is the fix that held on first contact.
(Note: the run's `started_at` was re-stamped by the scheduler late in the run — 18:32:33 →
18:42:10 UTC — reason not established from these tables; the outcome fields above are the
reliable record.)

## 6. Relied-upon channel properties (observed 2026-10-14, documented as assumptions)

- **P1 — relay exclusivity:** the controller relays run output to the side chat exclusively via a
  per-run outbox row (`delivery_key` shape above), created at/after `finished_at`. All four
  timed-out runs got rows; all delivered. Absence of the row one full interval after the run ⇒
  the output never reached the channel.
- **P2 — no channel dedup:** the side chat does not dedupe on `(signal_id, alert_type)`.
  At-most-once-per-delivery is therefore a worker+ledger property, not a channel guarantee —
  exactly-once is NOT claimed.
- **P3 — single slot:** one occurrence runs at a time per job (13:30 retired when 13:45 fired);
  no concurrent ledger writers expected.
