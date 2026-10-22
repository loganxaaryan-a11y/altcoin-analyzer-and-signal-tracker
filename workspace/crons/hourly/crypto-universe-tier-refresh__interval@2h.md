---
id: crypto-universe-tier-refresh
title: Crypto universe tier refresh (keeps discovery tiers warm)
enabled: true
owner: goal:research-terminal
mode: task
schedule:
  kind: interval
  timezone: America/Toronto
  at: 2026-10-21T02:35:00
  every: 2h
timeout_secs: 3600
delivery: []
metadata:
  originating_chat_context_json: '{"chat_id":"a685c3e7-c8be-4137-8900-4e899008bca7","origin_provider":"main","chat_kind":"direct","event_kind":"message","require_mention":false,"device_id":"b0fd69c2-fdf4-4238-b72c-9849812abe31"}'
  presentation_locale: en-US
---
Keep the crypto artifact's universe tiers warm so scheduled discovery runs never pay the in-run tier refresh (measured 92–96s, which pushes discovery runs past the 120s worker ceiling and severs them). PAPER only; data mechanics only — never touch the model, gates, thresholds, scoring, or any other job.

Read-back semantics (binding): a missing read-back after an uncertain invocation is NOT proof that no execution occurred. Failure reports must say the refresh outcome is "UNVERIFIED — execution unknown", never that the refresh did not run, unless an independent platform record proves it never started (cite it).

Steps:
1) Read getuniversetiers on altcoin-analyzer-and-signal-tracker. Note lastRun.id (PREV_TIER_ID) and lastRun.completedAt, and compute the tiers' age at the time of this read.
2) If lastRun.completedAt is less than 2 hours old, the tiers are fresh: end the run as SUCCEEDED with a one-line summary (tiers fresh, snapshot id, age). Do NOT invoke a refresh.
3) Otherwise invoke refreshuniversetiers with args {"trigger":"scheduler"}. Record the invocation start/end UTC times and its outcome (result, error, or timeout).
4) Verify: read getuniversetiers again. Success = lastRun.id is greater than PREV_TIER_ID AND lastRun.completedAt is at or after the invocation start. If verified, end as SUCCEEDED reporting the new snapshot id, the refresh duration, and the tier counts from the refresh result.
5) If not verified: wait 60 seconds and re-read getuniversetiers once — a refresh may commit after a transport timeout, and a late commit found here is this run's refresh (do not invoke again). If now verified, report SUCCEEDED noting the delayed commit. If still not verified, invoke refreshuniversetiers ONE more time and verify again the same way. If the snapshot still has not advanced, end the run as a FAILED run (worker-reported failure) whose summary states both attempts' times and outcomes, the last observed snapshot id and completedAt, and that the refresh outcome is UNVERIFIED — execution unknown (no advanced snapshot could be verified; this does not prove the refresh never ran). Never report success without an advanced snapshot id. Never invoke refreshuniversetiers more than twice in one run.
