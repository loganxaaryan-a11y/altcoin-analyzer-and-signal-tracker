---
id: budget-monthly-guard
title: Budget monthly spend guard
enabled: true
owner: goal:research-terminal
mode: task
schedule:
  kind: daily
  timezone: America/Toronto
  time: 08:46:00
delivery:
  - chat_id: a685c3e7-c8be-4137-8900-4e899008bca7
metadata:
  tags: [cron:flexible-time]
  originating_chat_context_json: '{"chat_id":"a685c3e7-c8be-4137-8900-4e899008bca7","origin_provider":"main","chat_kind":"direct","event_kind":"message","require_mention":false,"device_id":"d8c63a1c-801b-497b-a9fe-cd2681d2185d"}'
  presentation_locale: en-US
---
Budget governor — monthly spend guard. Runs daily; quiet unless a threshold is crossed.

Step 1. Run:
  python3 ~/workspace/goals/research-terminal/hidden_files/budget-governor/guard_check.py
It refreshes monthly-usage.json from the providers' FREE status endpoints (elfa status, altfins permits — no metered spend) and compares against the caps.json thresholds (Elfa guard trigger 800 / hard stop 950; altFINS trigger 800 / hard stop 1000 against the free-tier ceiling). It prints a JSON verdict with `crossed` true/false and an `alerts` list.

Step 2. If the verdict has crossed=true: your final message IS the alert — post the alert text from the verdict verbatim, noting the provider, the threshold crossed, monthly used vs cap/ceiling, and the resulting degradation (Elfa-minimal at 800: trending_tokens only 1 call/run; Elfa dropped entirely at 950; altFINS call dropped for discovery at its trigger). Keep it terse. This is the only case that produces chat output.

Step 3. If crossed=false: end silent — no final message text, no summary lines. A clean guard run produces no chat output.

Step 4. If the script errors (network failure, parse error — the verdict has an `error` field): report the failure text as your final message so a broken guard is visible, never silently green.

Boundaries: read-only on the providers' free status endpoints. Never touch discovery code, schedules, frozen methodology, the paper pipeline, or keyed APIs (Finnhub/Alpha Vantage stay on-demand only). This guard watches spend; it does not spend.
