---
id: squeeze-detector-hourly
title: Squeeze detector — hourly slow inputs + witness
enabled: true
owner: goal:research-terminal
mode: task
schedule:
  kind: interval
  timezone: America/Toronto
  at: 2026-10-15T22:27:39
  every: 1h
timeout_secs: 1800
metadata:
  tags: [cron:automatic-interval-anchor]
  originating_chat_context_json: '{"chat_id":"7b75e732-f527-4d53-b40d-4aa036201d9b","origin_provider":"main","chat_kind":"direct","event_kind":"message","require_mention":false,"device_id":"d8c63a1c-801b-497b-a9fe-cd2681d2185d"}'
  presentation_locale: en-US
---
Squeeze-detector hourly slow-input pass. SHADOW ONLY — no chat output, no scores, no orders. Run: `python3 ~/workspace/goals/research-terminal/hidden_files/squeeze-detector/scripts/detector.py hourly`. Refreshes Hyperliquid funding/OI cache (crypto crowding input), checks for a new FINRA biweekly short-interest file (rebuilds watchlist when the settlement changes), rebuilds the watchlist when it is more than 24h old (the paste.trade W2 input refreshes daily), scans the paste.trade board for caller disagreement vs open setups (writes investigation flags to `ledgers/investigation_flags.jsonl` — investigation priority only, never a score change). All inputs cached; no paid feeds. If anything would need incremental spend, do NOT enable it — record the cost question in the hourly report instead. Stay silent on completion; the ledger files are the record.
