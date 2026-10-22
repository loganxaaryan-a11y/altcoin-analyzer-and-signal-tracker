---
id: weekly-calibration-bout
title: Weekly calibration bout
enabled: true
owner: goal:research-terminal
mode: task
schedule:
  kind: weekly
  timezone: '@user.current'
  time: 09:00:00
  dow: [Mon]
timeout_secs: 3600
delivery:
  - chat_id: 7b75e732-f527-4d53-b40d-4aa036201d9b
metadata:
  originating_chat_context_json: '{"chat_id":"7b75e732-f527-4d53-b40d-4aa036201d9b","origin_provider":"main","chat_kind":"direct","event_kind":"message","require_mention":false,"device_id":"d8c63a1c-801b-497b-a9fe-cd2681d2185d"}'
  presentation_locale: en-US
---
Weekly calibration bout: our systems vs the market, scored on realized outcomes. This is the standing version of Logan's 2026-10-04 comparison test (direct Muse vs terminal vs Elfa/Grok/Nansen/Claude).

Baselines live in ~/workspace/goals/research-terminal/hidden_files/calibration-bout/ as bout-YYYY-MM-DD.md files. Each file lists: the week's direct-Muse top-5 picks and the terminal's top-5 discovery picks, with entry price, invalidation, targets, and date frozen.

Each run does TWO things, in order:
1. SCORE OLD BOUTS: list the bout files. For any bout old enough that 5d/14d/30d windows have closed since its freeze date, check current prices (via the terminal's analyzecoin action or a price source) and score each pick: hit target 1 / hit invalidation / neither, with realized return %. Append the scores to the bout file. Never rewrite frozen picks.
2. FREEZE NEW BOUT: run this week's prompt twice:
   (a) Direct analysis — answer from live sources yourself.
   (b) Terminal — top 5 by discovery alignment from getmarketdiscovery on artifact `altcoin-analyzer-and-signal-tracker`, filtered to mcap >$500M and 24h volume >$20M, direction-agnostic.
   Save both top-5 lists with prices, invalidations, targets, timestamps to bout-<today>.md.

THE PROMPT (frozen, do not alter):
"Pick 5 altcoins (exclude BTC, ETH, stablecoins) with the strongest combined chart and fundamentals setup right now. Market cap above $500M, 24h volume above $20M. For each coin give: 1. Current price, 24h volume, market cap, with data timestamp and source. 2. Chart: trend on 1D and 4H, key support/resistance, RSI, above/below 50/200 MA. 3. Derivatives: funding rate, OI change 7d, long/short ratio. 4. Fundamentals: TVL/revenue trend, active users, unlocks next 90d, dev activity. 5. Bull/bear case one sentence each. 6. Prediction: 7d and 30d range with probability, entry zone, invalidation level. 7. Confidence 1-10 and single biggest risk. Rules: label every number live/estimated/unavailable. Do not guess. Rank the 5 and name one rejected coin with why."

Report to chat: the newly frozen picks (both lists, compact) plus any newly closed bout scores. Keep it tight. Note: external systems (Elfa/Grok/Nansen/Claude) are added by Logan manually when he runs them — leave a clearly marked section in each bout file for his pastes.
