---
id: paste-trade-watch
title: paste.trade KOL watch + P&L tracking (2x daily)
enabled: true
owner: goal:research-terminal
mode: task
schedule:
  kind: daily
  timezone: '@user.current'
  time: 20:46:00
timeout_secs: 1800
delivery:
  - chat_id: 7b75e732-f527-4d53-b40d-4aa036201d9b
metadata:
  tags: [cron:flexible-time]
  originating_chat_context_json: '{"chat_id":"a685c3e7-c8be-4137-8900-4e899008bca7","origin_provider":"main","chat_kind":"direct","event_kind":"message","require_mention":false,"device_id":"d8c63a1c-801b-497b-a9fe-cd2681d2185d"}'
  presentation_locale: en-US
---
DAILY paste.trade KOL watch (Logan's spec, updated 2026-10-15): track how each call is DOING over time, and research the notable ones with our terminals. Runs once daily. Logan's call: no API key needed.

BILL NOTE: no key = no bill possible. Public API path only.

DATA ACCESS (updated 2026-10-15 — no browser needed): pull the public board API directly: https://paste.trade/api/board?window=today&lens=max (no auth; returns the full today table as JSON — rows with ticker, direction, leverage, pct, handle, time). The 7d window returns top 10 only. Verified live 2026-10-15. Do NOT attempt /api/feed, /api/trades, /api/leaderboard (sign-in required).

SCOPE: look at ALL calls on the board every run — no top-5 cutoff, no cherry-picking. Extract and track every call: ticker, direction, thesis, author handle, said-at price, current P&L. Prefer 'direct' (author named the trade) over AI-extracted 'derived' when ranking attention, but track both.

LEDGER (persistent state — read and update every run):
- ~/workspace/goals/research-terminal/hidden_files/paste-trade-watch/pnl-ledger.md
- One row per tracked call: ticker, direction, caller handle, direct|derived, entry price + entry time, thesis one-liner, then P&L snapshots each run (time, current price, P&L %).
- On each run: snapshot every tracked call's current P&L, compute move since last snapshot, drop calls that fell off the board.

EACH RUN:
1. Pull the board (per DATA ACCESS above). Extract ALL ranked calls with their P&L.
2. Update the ledger: add fresh calls, snapshot P&L on every tracked call, flag big movers (>|10%| move since last snapshot or crossing ±25% total).
3. Cross-check vs terminals: pull open signals via getsignaltracker on altcoin-analyzer-and-signal-tracker (crypto) and equity-analyzer-and-signal-tracker. Flag agree/contradict vs our signals and vs open theories. Note any appearance by Logan's smart-guys list: Citrini, Ansem, Cobie.
4. RESEARCH the notable ones (big movers, fresh high-conviction, top-caller calls, clashes): run terminal-backed research — analyzecoin/analyzeinstrument or rundeepanalysis on the relevant terminal, plus unlocked sources (CoinStats, Etherscan, Bigdata, Finnhub, CMC keyless...). Nansen ONLY when seriously eyeing a call (1-2 calls max, always show cost + remaining). Depth on the ones that matter; the scan covers everything.

REPORT TO CHAT ONLY when something's actually worth attention:
- a tracked call making a big move,
- a fresh high-conviction call from a top caller,
- a direct clash with a terminal signal or theory.
Otherwise stay silent — no "nothing new" messages. Keep any report to 5 lines max: ticker, direction, P&L move, what the research says, and the agree/clash flag.

CAVEATS (always hold): P&L is naive (no borrow costs); win rates need N before they mean anything; never invent calls; if the board can't be read, log it and stay silent.

CALLER-FEED CAPTURE (merged 2026-10-20 from the retired 8h paste-trade-caller-feed job — Logan approved the consolidation; the feed job's checks are preserved here verbatim in substance):
On each run, using the SAME board pull from step 1 (one fetch serves both jobs' purposes):
1. Save the FULL raw board JSON text to ~/workspace/goals/research-terminal/hidden_files/paste-trade-feed/raw/board-<UTC-ts>.txt (create raw/ if missing).
2. Run: python3 ~/workspace/goals/research-terminal/hidden_files/paste-trade-feed/capture.py <that raw file> --avail-ts <UTC-ts-of-this-run>
   - NO-HINDSIGHT: capture EVERY board row AT RETRIEVAL TIME with the availability timestamp — no top-N cutoff, no cherry-picking. Outcomes are graded LATER via a separate grading pass, never at capture time.
   - WITNESS-SHADOW ONLY: rows feed the witness-layer shadow computation (hidden_files/paste-trade-feed/caller-rows.jsonl + ~/workspace/x-sweep/v2/paste-trade-calls.md) as caller-track-record inputs. ZERO score impact. No strategy changes, no terminal gate changes.
   - DEDUP: handle.lower()+ticker.upper()+entry_time. A row seen before is never re-added. First-seen record is kept; a later capture with more complete fields does NOT upgrade it.
   - Never invent a row or a field — missing = UNKNOWN. Board % is the site's "best case" display at venue-max leverage (NOT the author's leverage; author leverage is always UNKNOWN; borrow costs and wipeout risk NOT counted). Outcomes are graded from entry price vs later prices, never from board %.
   - paste.trade handles are self-registered display names, not verified identities; map to known X accounts only where already established.
   - API `count` may exceed parsed rows; log both numbers.
   - If the API pull fails, fallback: read the app.paste.trade page (the board's default view; note its date title in the log — it may show the previous day's board; the API window=today is authoritative for "today") and run capture.py on that text; the script marks parse=partial. If both fail, log what failed and continue the watch steps on existing ledger data only.
3. Note the capture summary {parsed, new, dupes_skipped} in the run's working notes. A fresh call from a caller on Logan's smart lists (Citrini, Ansem, Cobie, KoolKrypto, zeroxkyle, thinkingusd, theshortbear, jukan05, zephyr_z9, degentradinglsd, moneyprinter0x, that1618guy, skundojjala/SemiAnalysis, chamath, hkuppy, karlbooklover) counts as "worth attention" under the report rules above.
