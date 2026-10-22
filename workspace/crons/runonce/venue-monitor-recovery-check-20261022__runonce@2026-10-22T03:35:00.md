---
id: venue-monitor-recovery-check-20261022
title: Venue-monitor recovery confirmation (one-time)
enabled: true
owner: goal:research-terminal
mode: task
schedule:
  kind: runonce
  timezone: America/Toronto
  at: 2026-10-22T03:35:00
timeout_secs: 1800
delivery:
  - chat_id: a685c3e7-c8be-4137-8900-4e899008bca7
metadata:
  originating_chat_context_json: '{"chat_id":"a685c3e7-c8be-4137-8900-4e899008bca7","origin_provider":"main","chat_kind":"direct","event_kind":"message","require_mention":false,"device_id":"d8c63a1c-801b-497b-a9fe-cd2681d2185d"}'
  presentation_locale: en-US
---
## One-time recovery confirmation — paper-venue-monitor (PAPER ONLY)

Context: on 2026-10-22 the paper-venue-monitor lane was repaired after a night of 1800s timeouts (workstream docs 56-57). The lane now runs core steps only, in the order monitor → settle → enroll, each hard time-boxed; research steps live in `paper-research-refresh` (staggered to :24/:54). A directed recovery pass at 2026-10-22T06:45Z restored full coverage (all 13 positions gap-free through the recovery watermark **2026-10-22T06:44:59Z**; 7 open, 6 settled, 0 new settlements). New paper entries are HELD: the `paper-issuance-cycle` cron is disabled until this scheduled-recovery proof passes. You are running unattended at ~03:35 EDT, after the 03:13 EDT scheduled core-lane run (the 02:43 EDT run starved in its enrollment step under the pre-reorder body — it is NOT a valid proof either way; the reordered 03:13 run is the proof candidate).

### The proof — ALL four parts required
1. **Monitoring advanced beyond the recovery watermark:** a monitor run log (`monitoring/runs/run-*.json`) written by the 03:13 EDT scheduled run (log timestamp in the 07:13–07:45Z window) shows all 13 positions ok with gaps=0, AND `monitoring/state.json` shows every position's last_covered_bar_close_utc **after 2026-10-22T06:44:59Z**.
2. **Settlement completed against that coverage:** a settle log (`monitoring/runs/settle-*.json`) timestamped AFTER that monitor run, in which no open position has action held_gap, held_fetch, held_validation, or error. (Appended settlements are fine — report them; already_settled / open_no_touch are the expected actions.)
3. **Enrollment reconciled:** an enroll log (`monitoring/runs/enroll-*.json`) from the same scheduled run with discrepancies empty (warnings about float serialization within tolerance are acceptable and not discrepancies). If the enroll step used the fallback canonical file, the run summary must disclose it — note in your report whether the source was fresh or fallback and the file timestamp. If no enroll log exists yet when you first check, re-check every ~3 minutes for up to 15 minutes (the enrollment step runs last and its artifact pull can drip); after that, enrollment counts as NOT reconciled.
4. **Timeout cleanup verified:** at your check time there are no lingering lane subprocesses (no monitor.py / settle.py / enroll.py / hl_cache.py / scanner.py processes from earlier runs still alive) and no lock files in the monitoring store or the scanner directory. Timed-out runs must have actually stopped before the next run started.

### If ALL four parts pass
- Write the attestation file `~/workspace/goals/research-terminal/paper-signals/pilot/monitoring/scheduled-recovery.json` (overwrite if present): {"confirmed_at_utc": <now UTC>, "scheduled_run_scheduled_for": "2026-10-22T03:13:40-04:00", "monitor_log": <filename>, "settle_log": <filename>, "enroll_log": <filename>, "coverage_through_utc": <state.json max last_covered_bar_close_utc>, "cleanup_verified": true}. The terminal's monitoring-health surface reads this file to switch its automation line from "scheduled recovery pending" to confirmed.
- Re-enable `paper-issuance-cycle` with cron.update (id paper-issuance-cycle, enabled true), then verify with cron.status that it is enabled. If cron.update is refused or fails, say so plainly — the main agent will lift the hold on receipt; still write the attestation and report the proof as passed.
- Report ONE compact message to this chat: scheduled recovery CONFIRMED, the proof in one line per part (enrollment reconciled + source fresh/fallback; coverage through <ts>; settlement completed with <n> appended; cleanup verified), entry hold LIFTED (or lift failed + why), and the research-refresh state (paper-research-refresh runs at :24/:54 — did its 03:24 EDT run produce a fresh HL snapshot + scanner record or a logged skip?).

### If ANY part fails
- The hold STAYS: do not re-enable issuance, do not write the attestation, do not run monitor.py / settle.py / enroll.py yourself, do not edit any cron body or script.
- Report ONE compact message: scheduled recovery NOT confirmed, which part failed with the evidence (timestamps, log filenames, process/lock findings), and the current last verified coverage timestamp. Plain sentences, real numbers.
