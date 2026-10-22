---
id: daily-board-grading
title: Daily board grading — grade picks, feed dossiers
enabled: false
owner: goal:research-terminal
mode: task
schedule:
  kind: daily
  timezone: America/Toronto
  time: 20:30:00
delivery:
  - chat_id: 7b75e732-f527-4d53-b40d-4aa036201d9b
metadata:
  originating_chat_context_json: '{"chat_id":"a685c3e7-c8be-4137-8900-4e899008bca7","origin_provider":"main","chat_kind":"direct","event_kind":"message","require_mention":false,"device_id":"d8c63a1c-801b-497b-a9fe-cd2681d2185d"}'
  presentation_locale: en-US
---
Grade the daily-board picks and feed the asset dossiers. PAPER only — grading research ideas, never orders.

Steps:
1. Read ~/workspace/goals/research-terminal/hidden_files/daily-board/ledger.jsonl. Take ALL rows with no grade yet, oldest first (this clears backlogs; never leave a permanent ungraded tail — a date filter that skips old rows is a bug).
2. Reference prices: crypto via Hyperliquid public API (POST https://api.hyperliquid.xyz/info {"type":"allMids"} — no key, no auth; use candle history where the grade needs intra-period highs/lows, never just the latest print). Equities: reuse ~/workspace/goals/research-terminal/hidden_files/equity-alert-drain/intraday_quotes.py via `python3 intraday_quotes.py <SYMBOL>` (Finnhub-backed; after close it returns the closing price — fine for grading). Never invent a price; if a symbol's price is unavailable, mark its grade UNKNOWN with the reason.
3. Grade each pick against its ledger entry/invalidation: did price trade into the entry zone? Did it hit invalidation (loss) or target1 (win)? Outcome ∈ {win, loss, no_trigger, open, unknown}. Compute R multiple where entry + invalidation + target allow it; otherwise state the plain outcome. Be honest about partials: a pick that triggered then stopped is a loss even if it later recovered.
4. Write ~/workspace/goals/research-terminal/hidden_files/daily-board/grading/YYYY-MM-DD.json (date = the picks' date): per-pick {symbol, direction, outcome, R, entry_hit, notes}. Keep a running tally in the same file: board win rate over the last 20 graded picks.
5. Append to each graded asset's dossier (~/workspace/goals/research-terminal/hidden_files/asset-dossiers/<SYMBOL>.md): one dated outcome line in the stream log (facts only). ANTI-FORCING (binding — Logan 2026-10-19: "dont force it, it has to be real"): "What we've learned" updates ONLY from resolved grades with N>=3 on that asset — never from open picks, never from a single outcome, never from a narrative that fits today's tape. A pattern needs repetition before it becomes a lesson; a cause-effect claim needs the mechanism named or it stays out. If nothing earned a lesson today, change nothing.
6. Deliver a compact message to the research side chat: one line per pick (symbol, direction, outcome, R), the running 20-pick tally, and one line on what the dossiers learned today if anything changed. If no picks needed grading, stay silent.

Rules: read-only on the ledger (never rewrite ledger.jsonl). No terminal actions. No manufactured prices.
