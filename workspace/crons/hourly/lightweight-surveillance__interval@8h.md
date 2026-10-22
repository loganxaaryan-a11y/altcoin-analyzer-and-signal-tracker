---
id: lightweight-surveillance
title: Lightweight snapshot-change monitoring (intraday diffs of hourly mirrors)
enabled: false
owner: goal:research-terminal
mode: task
schedule:
  kind: interval
  timezone: America/Toronto
  at: 2026-10-20T10:23:49
  every: 8h
timeout_secs: 300
delivery:
  - chat_id: 7b75e732-f527-4d53-b40d-4aa036201d9b
metadata:
  tags: [cron:automatic-interval-anchor]
  originating_chat_context_json: '{"chat_id":"a685c3e7-c8be-4137-8900-4e899008bca7","origin_provider":"main","chat_kind":"direct","event_kind":"message","require_mention":false,"device_id":"d8c63a1c-801b-497b-a9fe-cd2681d2185d"}'
  presentation_locale: en-US
---
# Lightweight snapshot-change monitoring (intraday) — PAPER, read-only, diff-based

SNAPSHOT-CHANGE MONITORING, NOT FRESH MARKET SURVEILLANCE, NOT RESEARCH. This is the intraday layer: every 3 hours, CHEAP local file diffs over the one-read mirrors — it detects *mirror changes*, not market events. The mirrors refresh **hourly** (mirror-terminal-state cron), so honest detection latency vs a market event is mirror age (0 to ~1h in normal operation) + ≤3h loop + script runtime. Never describe this as fresh market surveillance or "watching the market live". It is distinct from the thesis watcher (twice daily, slow research — keep that lane separate). Full spec: ~/workspace/goals/research-terminal/hidden_files/surveillance/SPEC.md.

HARD RULES: never invoke terminal actions (no getsignaltracker, getmarketread, listtheories, or any artifact action). Never fetch the network. Never refetch anything. Read local files only: the one-read mirrors (hidden_files/terminal-state/crypto-state.json, equity-state.json), the caller ledger (~/workspace/x-sweep/v2/calls.md), and the watermark (hidden_files/surveillance/last-check.json).

Steps:
1. Run: python3 ~/workspace/goals/research-terminal/hidden_files/surveillance/surveil.py
   The script diffs the mirrors and caller ledger against the watermark. It updates the watermark itself.
2. If the output contains alert blocks (prefixed "SNAPSHOT-CHANGE MONITOR (intraday)"): that text IS your final message — deliver it to the terminal signal chat as-is. Do not add analysis, do not re-explain signals (the signal explainer owns that), do not invent context beyond what the script printed.
3. If the output is "SNAPSHOT-MONITOR: DEGRADED — ...": deliver that DEGRADED line to the terminal signal chat (a degraded lane is news, not silence).
4. If the output is "SNAPSHOT-MONITOR: no state changes (all inputs fresh — ...)": stay silent — emit no chat-facing output.

PAPER only. Never manufacture data: a missing/unreadable/stale (>2h) mirror makes the run DEGRADED (exit 2), never a clean "no state changes". This lane exists under the expert's "no additional scheduled research jobs" constraint as snapshot-change monitoring (local diffs), explicitly not a research job — and per the expert's 2026-10-15 correction, it is explicitly NOT fresh market surveillance.
