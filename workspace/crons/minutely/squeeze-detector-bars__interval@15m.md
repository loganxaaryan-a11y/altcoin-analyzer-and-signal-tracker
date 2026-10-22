---
id: squeeze-detector-bars
title: Squeeze detector — 15-min bar sync + evaluation
enabled: true
owner: goal:research-terminal
mode: task
schedule:
  kind: interval
  timezone: America/Toronto
  at: 2026-10-20T16:46:34
  every: 15m
timeout_secs: 900
metadata:
  originating_chat_context_json: '{"chat_id":"a685c3e7-c8be-4137-8900-4e899008bca7","origin_provider":"main","chat_kind":"direct","event_kind":"message","require_mention":false,"device_id":"d8c63a1c-801b-497b-a9fe-cd2681d2185d"}'
  presentation_locale: en-US
---
Squeeze-detector bar sync + rule evaluation (every 15 min). SHADOW ONLY — no chat output, no scores, no orders. Run: `python3 ~/workspace/goals/research-terminal/hidden_files/squeeze-detector/scripts/detector.py sync` then `python3 ~/workspace/goals/research-terminal/hidden_files/squeeze-detector/scripts/detector.py evaluate`. Sync fetches completed 15-min bars (Yahoo for equities, Kraken/Coinbase for crypto; 1.2s spacing) into `state/bars/`. Evaluate applies the FROZEN specs (squeeze-equity-v1.0, squeeze-crypto-v1.1) once per newly completed bar: flags new setups to `ledgers/{equity,crypto}-setups.jsonl` with frozen entry trigger/invalidation/expiry, and resolves open setups (target/invalidation/expiry) appending to `ledgers/evaluations.jsonl`. Never-squeezed setups stay in the ledger. On 429/fetch failure: NO_DATA, end quietly. Stay silent on completion.
