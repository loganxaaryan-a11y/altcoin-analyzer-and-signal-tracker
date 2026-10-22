---
id: daily-setup-hunt
title: Daily setup hunt (both terminals)
enabled: false
owner: goal:research-terminal
mode: task
schedule:
  kind: daily
  timezone: '@user.current'
  time: 07:46:00
delivery:
  - chat_id: a685c3e7-c8be-4137-8900-4e899008bca7
metadata:
  tags: [cron:flexible-time]
  originating_chat_context_json: '{"chat_id":"a685c3e7-c8be-4137-8900-4e899008bca7","origin_provider":"main","chat_kind":"direct","event_kind":"message","require_mention":false,"device_id":"d8c63a1c-801b-497b-a9fe-cd2681d2185d"}'
  presentation_locale: en-US
---
Daily setup hunt across both research terminals. Logan asked Muse to personally hunt for the best opportunities on top of the terminals' own automated discovery.

Method: use artifact.invoke_action on both terminals:
- equity-analyzer-and-signal-tracker: getmarketdaybrief ({}), getsignaltracker ({}), listmachinetheories ({}), getradar ({})
- altcoin-analyzer-and-signal-tracker: getmarketdaybrief ({}), getsignaltracker ({}), listmachinetheories ({}), gethyperliquidmarket where relevant

What to look for: convergence. The best finds are where multiple independent evidence lanes point the same way — strong factor agreement + clean invalidation with room to breathe + smart-money/whale/funding support + a well-evidenced theory on the same thesis. Check both long and short setups, futures and spot framings. Run checkentry on the 1-2 strongest candidates to grade timing.

Verify before surfacing: spot-check the key numbers (entry/invalidation/target math, factor directions) rather than trusting prose. If a candidate's evidence is single-sourced or its tripwire is broken, say so or drop it.

Delivery: 1-3 best finds, each with ticker/coin, direction, thesis in 2-3 lines, entry zone, invalidation, targets, the converging evidence, and honest caveats (calibration status, what could kill it). If nothing meets the bar, say so in one line — never pad. This is research, not trading advice: no position sizing, no urgency language. Frame everything with the standing honesty rules: agreement scores are not probabilities, UNCALIBRATED where no track record exists.

Log the hunt to ~/memory/YYYY-MM-DD.md (append-only, dated observations only).
