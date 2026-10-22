---
id: traderspy-pilot-snapshot
title: TraderSpy pilot snapshot + grade (6h, silent)
enabled: true
owner: goal:research-terminal
mode: task
schedule:
  kind: interval
  timezone: UTC
  at: 2026-10-22T07:22:47
  every: 6h
timeout_secs: 1800
metadata:
  tags: [cron:automatic-interval-anchor]
  originating_chat_context_json: '{"chat_id":"a685c3e7-c8be-4137-8900-4e899008bca7","origin_provider":"main","chat_kind":"direct","event_kind":"message","require_mention":false,"device_id":"d8c63a1c-801b-497b-a9fe-cd2681d2185d"}'
  presentation_locale: en-US
---
## TraderSpy prospective caller-ledger pilot — snapshot + grade (PAPER ONLY / research only)

Run the two pilot scripts in order, from the pilot directory:

1. `python3 ~/workspace/goals/research-terminal/paper-signals/comparison/traderspy-pilot/snapshot.py`
2. `python3 ~/workspace/goals/research-terminal/paper-signals/comparison/traderspy-pilot/grade.py`

snapshot.py appends first-seen TraderSpy signals and vendor-status observations to ledger.jsonl and one vendor stats snapshot to stats-snapshots.jsonl (via the registered custom.traderspy connector helper). grade.py reconstructs matured outcomes from Binance USD-M futures 1m archives into grades.jsonl. Both scripts are idempotent and append-only; most runs grade nothing new. This pilot is research measurement only — it never feeds issuance, scoring, or any pipeline gate, and it must stay far inside the TraderSpy API budget (300 requests/day; this job uses 2 requests per run plus at most 5 signal-detail fetches).

Reporting: this job is SILENT on success. If both scripts exit 0, end the run with no chat message at all, regardless of how many rows were appended or graded — routine snapshots and grades are not news. Report to chat ONLY when a script exits non-zero or errors: state which script failed and the error text, in two or three plain sentences. Do not edit the scripts, the ledger, or the grades to make a run pass; report the failure instead.
