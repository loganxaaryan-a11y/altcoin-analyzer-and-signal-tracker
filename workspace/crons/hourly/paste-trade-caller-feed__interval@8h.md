---
id: paste-trade-caller-feed
title: paste.trade caller feed (8h, witness-shadow)
enabled: false
owner: goal:research-terminal
mode: task
schedule:
  kind: interval
  timezone: America/Toronto
  at: 2026-10-15T11:31:24
  every: 8h
timeout_secs: 900
delivery:
  - chat_id: 7b75e732-f527-4d53-b40d-4aa036201d9b
metadata:
  tags: [cron:automatic-interval-anchor]
  originating_chat_context_json: '{"chat_id":"a685c3e7-c8be-4137-8900-4e899008bca7","origin_provider":"main","chat_kind":"direct","event_kind":"message","require_mention":false,"device_id":"d8c63a1c-801b-497b-a9fe-cd2681d2185d"}'
  presentation_locale: en-US
---
PASTE.TRADE CALLER FEED — evidence capture for the witness layer (W10, expert repair program). Runs every 8h, same cadence as the X-sweep caller scan.

EXPERT CONSTRAINTS (binding):
- NO-HINDSIGHT: capture every board row AT RETRIEVAL TIME with an availability timestamp. Grade outcomes LATER via a separate grading pass. Never admit only already-profitable calls — capture ALL rows in the window, no top-N cutoff, no cherry-picking.
- WITNESS-SHADOW ONLY: rows feed the witness-layer shadow computation as caller-track-record inputs. ZERO score impact. No strategy changes, no terminal gate changes.
- PAPER only. Never invent a row or a field — missing = UNKNOWN.

DATA ACCESS (verified live 2026-10-15, no auth, no API key, no login needed):
1. Primary: browser.open https://paste.trade/api/board?window=today&lens=max — returns the full today board as JSON text: rows with id, ticker, direction, author_handle, author_name, author_date (ISO UTC), author_price (entry), thesis, leverage (= VENUE max leverage for the ticker, NOT the author's), current_pnl (spot %), shown_now/pnl_display (max-leverage "best case" display %), shown_peak, price, crowd[] (extra authors on the same call — the capture script expands each as its own row), platform, instrument; plus window_start/end, computed_at, prices_as_of.
   - Do NOT use /api/feed, /api/trades, /api/leaderboard (sign-in required).
   - Do NOT scrape via exec/curl — web reads go through browser.open only.
2. Fallback (if the API fails): browser.open https://app.paste.trade page text (the board's default view; note its date title in the log). Shows rank, ticker, dir, handle, entry time, live %, peak %, thesis, "said at" price, per-ticker max-leverage disclaimer. Best-effort parse; the script marks parse=partial.

EACH RUN:
1. Fetch the board (API primary). Save the FULL raw text to hidden_files/paste-trade-feed/raw/board-<UTC-ts>.txt (create raw/ if missing).
2. Run: python3 hidden_files/paste-trade-feed/capture.py raw/board-<UTC-ts>.txt --avail-ts <UTC-ts-of-this-run>   (paths relative to ~/workspace/goals/research-terminal/)
   - Normalizes rows, expands crowd[] sub-rows, dedups on handle+ticker+entry_time against hidden_files/paste-trade-feed/caller-rows.jsonl, appends new rows to ~/workspace/x-sweep/v2/paste-trade-calls.md + the JSONL shadow file.
   - Prints a JSON summary {parsed, new, dupes_skipped}. Include it in the run report.
3. If the board can't be read, log what failed and which fallback was tried, then stay silent to chat.

DEDUP: handle.lower()+ticker.upper()+entry_time. A row seen before is never re-added. Known limitation: first-seen record is kept; a later capture with more complete fields does NOT upgrade it (open expert question).

REPORT TO THE RESEARCH SIDE CHAT only when: new rows were captured (compact: window, N new, notable caller handles, anomalies such as API failure/fallback), or a caller on Logan's smart lists appears with a fresh call (Citrini, Ansem, Cobie, KoolKrypto, zeroxkyle, thinkingusd, theshortbear, jukan05, zephyr_z9, degentradinglsd, moneyprinter0x, that1618guy, skundojjala/SemiAnalysis, chamath, hkuppy, karlbooklover). Otherwise stay silent — no "nothing new" messages. Max 5 lines.

CAVEATS (hold every run):
- Board % is the site's "best case" at venue-max leverage ("not what the author used"; borrow costs and wipeout risk NOT counted). Outcomes are graded from entry_px vs later prices, never from board %.
- paste.trade handles are self-registered display names, not verified identities (e.g. `elonmusk`, `jimcramer` rows). Treat as labels; map to known X accounts only where already established.
- Author leverage is never shown — always UNKNOWN.
- The app page's default view may show the previous day's board (it did at ~03:27 EDT Oct 15); the API window=today is authoritative for "today".
- API `count` may exceed parsed rows; log both numbers.

DO NOT: change terminal scoring/gates, invent rows or fields, use board P&L as outcomes, or merge this job with paste-trade-watch (a separate chat-attention job; consolidation is Logan's call).
