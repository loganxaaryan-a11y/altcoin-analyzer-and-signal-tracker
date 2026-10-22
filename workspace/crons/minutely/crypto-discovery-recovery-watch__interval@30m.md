---
id: crypto-discovery-recovery-watch
title: Crypto discovery recovery watch (P3, one bounded attempt per faulted slot)
enabled: true
owner: goal:research-terminal
mode: task
schedule:
  kind: interval
  timezone: America/Toronto
  at: 2026-10-20T17:45:00
  every: 30m
delivery:
  - chat_id: a685c3e7-c8be-4137-8900-4e899008bca7
metadata:
  originating_chat_context_json: '{"chat_id":"a685c3e7-c8be-4137-8900-4e899008bca7","origin_provider":"main","chat_kind":"direct","provider":"main","event_kind":"message","require_mention":false,"device_id":"d8c63a1c-801b-497b-a9fe-cd2681d2185d"}'
  presentation_locale: en-US
---
## Crypto discovery recovery watch — P3 bounded recovery (PAPER ONLY)

Logan approved P3 on 2026-10-20 (~17:10 EDT): ONE delayed recovery attempt per logical crypto discovery slot, only after reconciling the original execution's state from evidence. This job is that mechanism. It is NOT the fault observer (which stays read-only); this job may fire a recovery, under the strict code gate below, and nothing else. No model/gate/threshold/freeze changes. Never edit any discovery job. Never invoke `runmarketdiscovery` directly — a recovery is always a `cron.run` of the slot's own job.

### Fixed facts
- Discovery slot jobs (all daily, America/Toronto): crypto-market-discovery-0300, -0700, -0900, -1100, -1300, -1500, -1700, -1900, -2100, -2300. Each fires once per local day; the logical slot id is `<job_id>@<YYYY-MM-DD>` (local date).
- A slot's scheduled run actually starts a few minutes BEFORE the nominal time (dispatch spread) — always take times from the scheduler record, never the nominal time.
- Artifact: `altcoin-analyzer-and-signal-tracker`. Reads: `getmarketdiscovery` (data.run = the LATEST discovery run row only: id, status, startedAt, completedAt, lastHeartbeatAt, deadlineAt, lastCheckpointStage, stageDurationsJson, leaseId) and `getpaperpilothandoffs` (data.handoffRuns: id + completedAt, latest ~12).
- State: `~/workspace/goals/research-terminal/hidden_files/discovery-recovery/state.json` (slots map + claimed_handoff_ids). Classifier: `~/workspace/goals/research-terminal/hidden_files/discovery-recovery/classify.py`. Bundles dir: `.../discovery-recovery/bundles/`. Logs (append-only JSONL): `.../discovery-recovery/recovery-log.jsonl` AND `~/workspace/goals/research-terminal/hidden_files/pipeline-fault-observer/recovery-records.jsonl` (the visible record next to the fault observer's state — never edit the observer's state.json itself).

### Decision delay and scope
- A slot becomes decidable 45 minutes after its nominal time. Evaluate: (a) slots with nominal time in [now-6h, now-45m] not yet in state; (b) every state slot not marked terminal. Process OLDEST slot first.
- Terminal states (never touch again): COMPLETED, COMPLETED_AFTER_RECOVERY, EXHAUSTED, UNCERTAIN.

### Per-slot procedure (follow exactly)
1. From `cron.runs` for the slot's job (limit 10), find the slot's scheduled run: trigger_reason == "scheduled" and scheduled_for_local matches the slot's date and HH:MM. Record status, started_at_utc, finished_at_utc, error_text, run_id. Collect post_slot_manual_runs: any runs of that job with trigger_reason != "scheduled" that started after the scheduled run started (a manual rerun — by anyone — consumes the slot's one recovery attempt; note your own earlier recovery dispatch for this slot also appears here, which is correct).
2. Handoff screen: the slot's attribution window is [scheduled run started_at_utc, next slot's nominal start). From `getpaperpilothandoffs`, a handoff counts for this slot only if its completedAt is in the window AND its id is NOT in state.claimed_handoff_ids under another slot (recovery handoffs of earlier slots can land inside a later slot's window — claims, evaluated oldest-first, prevent false completions). If this slot previously fired a recovery, ALSO check for a handoff with completedAt in [recovery_fired_at_utc - 60s, recovery_fired_at_utc + 20m] and claim it for this slot.
3. Run row: from `getmarketdiscovery`, `run_row` = data.run. It is attributable to this slot iff |row.startedAt − scheduled run started_at_utc| ≤ 600s. If attributable and the slot's state has no prior_checkpointed_evidence yet, SAVE the row snapshot into state as prior_checkpointed_evidence {run_row, captured_at_utc: now, captured_from: "watcher getmarketdiscovery read"} — even when the verdict turns out ACTIVE (the row will later be superseded by newer runs and unobservable; the recorded proof is what keeps a dead slot recoverable).
4. Recovery-outcome reconciliation (ONLY for slots whose state has recovery_fired == true): from the same `cron.runs` result, find the recovery dispatch run: the LATEST non-scheduled run of this job that started within ±5 minutes of state.recovery_fired_at_utc (earlier dispatches for the same slot, if any, were already recorded as not-executed — the latest one is the operative dispatch). Determine `dispatch_state`:
   - The run's error/summary states the scheduled action DID NOT START (platform wording "did not start") AND no discovery run row is attributable to the recovery start AND no recovery handoff was found in step 2 → "not_started" (the recovery provably never executed; the slot's one EXECUTION is still available).
   - The run shows the action was invoked (result_summary says it invoked the artifact action, or it failed/timed out after starting) → "invoked".
   - The run is still queued/running → "pending".
   - No such run found → "unknown".
   If dispatch_state == "not_started" and state.last_dispatch_failure_run_id != that run's id: increment state.fire_dispatch_failures by 1, set state.last_dispatch_failure_run_id to that run's id, and append a `recovery_dispatch_not_executed` JSON line (slot, run id, evidence) to BOTH logs — do this BEFORE building the bundle so the classifier's dispatch bound (2) sees the fresh count.
5. Build the evidence bundle exactly per classify.py's header (slot_id, job_id, eval_at_utc = now, scheduler, post_slot_manual_runs, handoff_in_window, run_row, run_row_attributable, ledger = the slot's state entry including recovery_fired / recovery_fired_at_utc / fire_dispatch_failures / prior_checkpointed_evidence, and recovery_outcome {dispatch_state} when step 4 applied). Write it to bundles/<slot_id>.json (slot_id is filename-safe). Run: `python3 ~/workspace/goals/research-terminal/hidden_files/discovery-recovery/classify.py bundles/<slot_id>.json` and parse its JSON verdict. THE VERDICT IS THE ONLY FIRE AUTHORITY. If the script errors or the reads fail (e.g. artifact overloaded), STOP work on that slot this pass: write nothing, fire nothing, note it in state as last_eval_error. Never improvise a verdict.
6. Act on the verdict:
   - action "recover": fire ONLY if no recovery has been fired yet during THIS pass (at most one per pass — platform-wide overlap prevention; further RECOVER verdicts stay CHECKPOINTED in state and are noted "deferred to next pass, one recovery per pass"). Fire: `cron.run(id=<job_id>, reason="recovery:1 slot=<slot_id> original_scheduler_run=<run_id> discovery_run=<row id or recorded> — P3 bounded recovery, one attempt. Decisions made by this run are NEW decisions stamped with this run's own time; nothing is backdated to the slot time.")`. On dispatch acceptance: state recovery_fired=true, recovery_fired_at_utc=now, status=RECOVERY_FIRED; append a `recovery_fired` JSON line (slot, original failure, evidence summary, fire time, cron.run result, and the honest note that dispatch acceptance is not execution) to BOTH logs; this is a reportable event. On a cron.run CALL error (the call itself fails): do NOT set recovery_fired (no dispatch occurred); increment fire_dispatch_failures; if it reaches 2, set status=EXHAUSTED (terminal) with reason "recovery could not be dispatched — 2 failed dispatch attempts" and append `recovery_exhausted` lines to both logs (reportable); otherwise note the failure in state and stop.
   - action "record" (UNCERTAIN or EXHAUSTED): set the terminal status + classification in state with the classifier's reasons; append a JSON line (event `uncertain_recorded` or `recovery_exhausted`, slot, original failure, reasons) to BOTH logs; reportable event.
   - action "none": update state status/classification. COMPLETED and COMPLETED_AFTER_RECOVERY are terminal — record the handoff id into claimed_handoff_ids for this slot; COMPLETED_AFTER_RECOVERY is reportable the first time it is observed. ACTIVE / RECOVERY_IN_FLIGHT stay non-terminal, silent.
7. Write state.json atomically (write to a .tmp sibling, then rename) with updated_at_utc = now.

### Timing identity (guardrail — never violate)
A recovery run executes with CURRENT data. Its candidates/decisions are NEW decisions stamped with the recovery run's real start time (the artifact stamps real times natively — never ask it to do otherwise, never relabel them with the slot's time). Every record you write carries BOTH the slot time and the recovery time so the decision provenance is explicit.

### Reporting
Your final message is EMPTY unless this pass had a reportable event (recovery fired, a not-executed dispatch recorded, UNCERTAIN/EXHAUSTED recorded, a recovery completed). Then report in plain language, one block per event: the slot, what originally failed, the reconciliation verdict with its key evidence, and what you did. Execution vs receipt status separate where relevant. No routine "all quiet" messages.

### Hard rules
- One recovery EXECUTION per logical slot, ever. A dispatch that provably never executed does not consume it (classify.py enforces the bound of 2 failed dispatches, after which the slot closes EXHAUSTED). The ledger + visible-manual-run check is the enforcement; when the outcome is ambiguous, treat the attempt as consumed — fail closed.
- NEVER fire on an UNCERTAIN classification, on a slot whose scheduler record claims success, on a slot with no attributable/recorded run-row death proof, or inside the deadline/heartbeat grace (classify.py encodes all of this — trust it, do not override it).
- NEVER fire more than one recovery per pass.
- If evidence is missing or contradictory, the answer is a record, not a retry.
