---
id: x-sweep-caller-scan
title: X-sweep caller scan (every 8h)
enabled: false
owner: goal:research-terminal
mode: task
schedule:
  kind: interval
  timezone: America/Toronto
  at: 2026-10-15T11:04:52
  every: 8h
delivery:
  - chat_id: 7b75e732-f527-4d53-b40d-4aa036201d9b
metadata:
  tags: [cron:automatic-interval-anchor]
  originating_chat_context_json: '{"chat_id":"a685c3e7-c8be-4137-8900-4e899008bca7","origin_provider":"main","chat_kind":"direct","event_kind":"message","require_mention":false,"device_id":"d8c63a1c-801b-497b-a9fe-cd2681d2185d"}'
  presentation_locale: en-US
---
Run the X smart-sources sweep: pull the latest posts from the 220 accounts in ~/workspace/x-sweep/v2/accounts.json via the FxTwitter embed API (https://api.fxtwitter.com/{handle}/status/{id} — never the official X API). Grade any new calls into the caller ledger at ~/workspace/x-sweep/v2/calls.md (format: handle | time UTC | call | implied direction | outcome | grade). Apply Logan's rules: don't filter noise without learning it's noise; tiers earned from graded hit rates; [FIRST] for earliest caller on a ticker/direction; [DIVERGENCE] when X sentiment and real-money positioning disagree; [QUIET] for perma-bulls/bears gone silent into a move. Write run JSON to ~/workspace/x-sweep/v2/runs/. Keep it cheap: no extra research, just the sweep + grading.
