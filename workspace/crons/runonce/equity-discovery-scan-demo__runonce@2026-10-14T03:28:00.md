---
id: equity-discovery-scan-demo
title: Equity discovery scan demo (scheduled batch)
enabled: true
owner: goal:research-terminal
mode: task
schedule:
  kind: runonce
  timezone: America/Toronto
  at: 2026-10-14T03:28:00
timeout_secs: 600
metadata:
  originating_chat_context_json: '{"chat_id":"a685c3e7-c8be-4137-8900-4e899008bca7","origin_provider":"main","chat_kind":"direct","event_kind":"message","require_mention":false,"device_id":"b0fd69c2-fdf4-4238-b72c-9849812abe31"}'
  presentation_locale: en-US
---
## Equity discovery — scheduled batch scan (sandbox demo)

You are running one batch of the resumable-batch equity discovery scanner
for the research-terminal paper-signals program. Paper signals only. No
production changes, no brokerage, no artifact edits.

1. Run exactly this command:
   `cd ~/workspace/goals/research-terminal/paper-signals/equity-discovery/scan && python3 scan_batch.py --state-dir ../state --cycle 2026-10-14 --batches 8 --batch-index 7`
   (The scanner is idempotent: symbols already terminal are skipped, and
   per-symbol progress persists after every symbol, so an interruption
   loses nothing.)
2. Do NOT run consolidate.py and do NOT run the paper handoff — the parent
   handles those after your run.
3. Report in your final message: the JSON summary the scanner printed
   (attempted, alreadyTerminal, counts, mean/max elapsed ms) and whether
   the batch completed inside its time budget.

Design doc: ~/workspace/goals/research-terminal/paper-signals/equity-discovery/README.md
Timeout diagnosis: ~/workspace/goals/research-terminal/paper-signals/equity-discovery/TIMEOUT-DIAGNOSIS-2026-10-14.md
