---
id: squeeze-detector-tick
title: Squeeze detector — 5-min lightweight tick
enabled: true
owner: goal:research-terminal
mode: task
schedule:
  kind: interval
  timezone: America/Toronto
  at: 2026-10-20T16:28:24
  every: 5m
timeout_secs: 300
metadata:
  originating_chat_context_json: '{"chat_id":"a685c3e7-c8be-4137-8900-4e899008bca7","origin_provider":"main","chat_kind":"direct","event_kind":"message","require_mention":false,"device_id":"d8c63a1c-801b-497b-a9fe-cd2681d2185d"}'
  presentation_locale: en-US
---
Squeeze-detector shadow tick (5-min lightweight monitor). SHADOW ONLY — no chat output, no scores, no orders. Run: `python3 ~/workspace/goals/research-terminal/hidden_files/squeeze-detector/scripts/detector.py tick`. This polls Kraken multi-ticker (crypto, 1 request) and Yahoo 1-min bars for the equity hotlist (≤25 symbols, 1s spacing), recording material moves (≥3%) to `state/material_changes.jsonl`. On HTTP 429 or fetch failure: log NO_DATA in `state/tick_stats.json` and end quietly — never fabricate prices. Quota guard: if Yahoo 429s twice in a row, skip equity for this run. Stay silent on completion; the ledger files are the record.
