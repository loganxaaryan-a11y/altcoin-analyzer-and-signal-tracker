---
id: equity-discovery-scan
title: Equity discovery scan (workspace batch lane)
enabled: false
owner: goal:research-terminal
mode: task
schedule:
  kind: interval
  timezone: America/Toronto
  at: 2026-10-15T13:08:01
  every: 12h
timeout_secs: 600
metadata:
  tags: [cron:automatic-interval-anchor]
  originating_chat_context_json: '{"chat_id":"a685c3e7-c8be-4137-8900-4e899008bca7","origin_provider":"main","chat_kind":"direct","event_kind":"message","require_mention":false,"device_id":"d8c63a1c-801b-497b-a9fe-cd2681d2185d"}'
  presentation_locale: en-US
---
Run the next pending batch of the workspace batch lane equity discovery scan (cycle = today UTC). This lane is a labeled BACKUP — not a substitute for the deployed discovery repair.

Steps (execute in order):
1. cd ~/workspace/goals/research-terminal/paper-signals/equity-discovery/scan
2. Run: python3 scan_batch.py --state-dir ../state --cycle $(date -u +%F) --batches 8 --batch-index next
   (picks the lowest batch index with non-terminal symbols; exits ok with allTerminal:true when the cycle is complete)
3. Then run: python3 consolidate.py --state-dir ../state --cycle $(date -u +%F). If it exits 0 (every universe symbol terminal), run the paper handoff for this cycle's qualified candidates per the handoff/README section of the ops doc (build_inputs.mjs + run_handoff.mjs with cycle-specific output names). If consolidate exits non-zero, stop and report the missing batches.
4. Report per-symbol accounting from the run record in ../state/runs/ for this cycle (attempted/alreadyTerminal/counts by status, mean+max elapsed ms).

Boundaries: this is the workspace batch lane repair for the deployed discovery (equity-theory-discovery) 120s timeouts. Label all results as workspace batch lane explicitly — a labeled backup, NOT a substitute for the deployed discovery repair, which remains necessary. Paper signals only; no brokerage. Do not touch the deployed artifact, the crypto pipeline, or any frozen methodology (7-factor weights 6/8/8/20/8/20/20, Wilder RSI-14, ATR-14, issuance gates stay as ported). Report the full stdout summary plus the accounting file path.
