---
id: discovery-mining-daily
title: Discovery mining — daily mention-change + crowding pass
enabled: true
owner: goal:research-terminal
mode: task
schedule:
  kind: daily
  timezone: UTC
  time: 23:15:00
timeout_secs: 1200
metadata:
  originating_chat_context_json: '{"chat_id":"a685c3e7-c8be-4137-8900-4e899008bca7","origin_provider":"main","chat_kind":"direct","provider":"main","event_kind":"message","require_mention":false,"device_id":"d8c63a1c-801b-497b-a9fe-cd2681d2185d"}'
  presentation_locale: en-US
---
Discovery mining keep-current pass (research only — findings never touch issuance, scoring, gates, or terminal data).

Run exactly one command:
`python3 ~/workspace/goals/research-terminal/hidden_files/discovery-engine/keep_current.py`

The script ingests any sweep runs newer than its watermark into the event store (dedupe by post id), recomputes per-asset mention baselines (trailing 30 days, trailing 72h always excluded, thin baselines labeled), and runs the narrowed deviation pass — mention-change (velocity + first mentions) and crowding (caller ledger fresh-parsed from calls.md every pass + paste.trade board; cross-stream agreement flagged) — appending findings to findings.jsonl and refreshing latest-findings.md in the same directory. It is idempotent: a pass with no new sweep runs appends zero posts and zero findings.

Then read `~/workspace/goals/research-terminal/hidden_files/discovery-engine/latest-findings.md` and report the pass briefly: posts appended, baseline days (flag if THIN), finding counts by class, the top few findings, and any source recorded as UNAVAILABLE with its reason. If the script exits non-zero, report the error verbatim — do not retry with edits, do not fall back to stale extracts, and do not improvise a pass by hand.
