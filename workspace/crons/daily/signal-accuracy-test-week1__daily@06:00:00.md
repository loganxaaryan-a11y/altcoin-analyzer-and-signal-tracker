---
id: signal-accuracy-test-week1
title: Daily signal accuracy review (both terminals)
enabled: false
owner: goal:research-terminal
mode: task
schedule:
  kind: daily
  timezone: America/Toronto
  time: 06:00:00
delivery:
  - chat_id: a685c3e7-c8be-4137-8900-4e899008bca7
metadata:
  originating_chat_context_json: '{"chat_id":"a685c3e7-c8be-4137-8900-4e899008bca7","origin_provider":"main","chat_kind":"direct","event_kind":"message","require_mention":false,"device_id":"d8c63a1c-801b-497b-a9fe-cd2681d2185d"}'
  presentation_locale: en-US
---
Daily accuracy review of every tracked signal on both research terminals. Pull the full signal trackers and score every call. THIS RUN IS THE SOURCE OF TRUTH for signal grading — the 09:00 terminal-morning-brief reads this run's output file instead of re-grading.

Actions to invoke:
- equity-analyzer-and-signal-tracker → getsignaltracker ({}) — PAGINATE with {"cursor": N} until nextCursor is null (48 signals span 3 pages; a single call misses most), getradar ({}), getmarketread ({}), getmarketdaybrief ({})
- altcoin-analyzer-and-signal-tracker → getsignaltracker ({}), getmarketread ({})

GRADING METHOD — FIRST-TOUCH ORDERING (mandatory):
Do NOT grade signals by comparing the current price to entry/target/invalidation. A current-price check cannot establish which level was touched first, so it cannot distinguish HIT from MISS. Every verdict below must come from the candle path.

For EACH tracked signal:
1. Take entry price, direction (long/short), invalidation level, target1, and createdAt (crypto) / signalDate (equity).
2. Pull daily OHLC candle history covering createdAt/signalDate through today:
   - crypto: analyzecoin with {symbol, coinId} → use the `candles` array (ts/open/high/low/close/volume).
   - equity: analyzeinstrument with {ticker or symbol} → use its daily candle/price history (the same Yahoo Finance daily series the engine uses; each signal's sourceUrl shows the exact series).
   - If candle history is unavailable for a signal, grade it UNVERIFIED (never OPEN, never HIT/MISS) and list it as a data gap. Fail closed — do not invent or interpolate candles.
3. Walk the candles in chronological order starting from the calendar day of createdAt/signalDate. For each candle, direction-aware:
   - LONG: if candle.low <= invalidation → MISS on that date. Else if candle.high >= target1 → HIT on that date.
   - SHORT: if candle.high >= invalidation → MISS on that date. Else if candle.low <= target1 → HIT on that date.
   - If a single candle touches BOTH levels, grade AMBIGUOUS (intraday order is unknowable from daily candles): count separately, exclude from hit-rate numerator and denominator, list explicitly.
   - The FIRST touch in chronological order decides. Stop at the first deciding candle. If the verdict comes from the creation-day candle alone, note "(same-day candle — intraday order approximate)".
4. If no candle touched either level:
   - If today − signalDate/createdAt > horizon → STALE. Horizon = the signal's stated horizon where present, else 14 days. STALE is tracked separately from HIT/MISS and excluded from hit-rate.
   - Else → OPEN. Report current % return vs entry and distance to target1/invalidation (informational only, not a verdict).

RUNNER RECALL — "did we catch what ran" (the real test). Resource-wise funnel:
This measures false negatives: movers the machine did NOT call. Do this per terminal.
1. Cheap wide net (keyless, negligible cost):
   - Crypto: CoinGecko public markets API — IMPORTANT: the API ignores gainers ordering. Use `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1` (one cheap call, back off on 429) and SORT CLIENT-SIDE by `price_change_percentage_24h` descending. Do NOT use `order=price_change_percentage_24h_desc` — it is silently ignored.
   - NOTE: cmc-keyless has NO gainers/losers endpoint (verified 2026-10-05) — do not instruct using it for gainers.
   - altFINS signals feed (pre-computed momentum/breakout signals; cheap on free credits).
   - Equity: the terminal has NO trailing-3d gainers action — use getmarketdaybrief sector notables + getmarketread (15d) as the in-universe mover source. One on-demand keyed call max (e.g. Alpha Vantage TOP_GAINERS_LOSERS) for the external board; skip if awkward.
   - Union all sources with the terminal's own overnight discovery output — READ the 6-hourly discovery results, do NOT re-run scans.
2. DUAL WINDOWS (meme pumps die in 1–2 days; fundamental moves sustain):
   - FAST window (48h): for high-beta/meme-type names. A meme coin up big on day 3 is NOT a "caught runner" — it's likely exit liquidity. Flag late-detected meme pumps as "LATE — probable exit liquidity," never as a win.
   - SLOW window (3d, equity up to 5d): for fundamental names (HYPE, SOL, majors). Sustained moves.
   - Tag each runner with its window and type (meme/pump vs fundamental).
3. IDENTITY LINE (mandatory, one line): every runner row carries what the thing IS — "XYZ is a Solana DEX aggregator" / "ABC is a regional bank holding company." Source from the terminal dossier first, else CoinGecko/CMC metadata (one cheap lookup). Never invent; "identity unverified" is acceptable but must be labeled. A runner without identity is an incomplete row.
4. Diff vs our universe: tag each runner in-universe or out-of-universe. Out-of-universe runners get one logged line (ticker + source board + identity) — no deep research. NOTE: micro-caps/warrants/sub-$1 names on external boards are out of the sp100 universe BY DESIGN — log as "out of scope", not as failures.
5. CAUGHT check: the flag (open long signal, active theory, discovery flag) must be dated BEFORE the move window started. Same-day flags → mark CAUGHT* with "timing-approximate" label. For meme/fast-window runners: only counts as CAUGHT if flagged within the first 48h — later is LATE.
6. Deep research ONLY on missed in-universe runners, CAP 5 per terminal per day (largest moves first). Each gets: terminal getnews + one analyzecoin/analyzeinstrument pass → one why-trending catalyst line. Web search only if the terminal has nothing (getnews can resolve a ticker to the wrong asset class, e.g. XRPN → coin — the web fallback covers this). Single-sourced → label SINGLE SOURCE. Never invent a catalyst — NO_DATA is acceptable.
7. Miss reasons (be specific): not in scanned universe → universe-coverage miss / failed volume filter / score below the bar / no catalyst read / data gap.
8. Quiet days: if nothing meets the bar (+15% crypto / +10% equity trailing move), report "no qualifying runners" and the closest movers — do NOT force a list.
9. Keep a running tally in ~/workspace/goals/research-terminal/hidden_files/signal-accuracy/runner-recall.md: date, runner, identity, source tags, window (fast/slow), type (meme/fundamental), in/out of universe, caught/missed/LATE, miss reason, catalyst. Report the running recall rate (caught ÷ total runners) each day, split by fast/slow. In the 5-session assessment, SEPARATE coverage misses from in-universe misses — they are different problems.
10. If a MISSED runner's catalyst + numbers genuinely align (2+ sources), flag it as a theory candidate for the theory bridge — do NOT auto-create theories; flag only.
11. After ~5 sessions (Logan's call), assess: is the dominant miss reason a fixable filter (universe too narrow, bar too high) or is the machine blind to a whole class of moves? Report that plainly — this is the "why did we miss them" answer.

Then compute and report:
1. Overall hit rate (hits ÷ (hits + misses)) per terminal and combined. AMBIGUOUS, STALE, and UNVERIFIED are excluded from the denominator — state the exclusion counts plainly.
2. Hit rate by confidence/score band (e.g. 90+, 65–79, below 65)
3. Hit rate by direction (long vs short)
4. Newly closed signals since yesterday's review (HIT/MISS/STALE/AMBIGUOUS), with per-call detail: entry, invalidation, target1, first-touch date and level, days held
5. Runner recall section: today's runners (identity + source + window + type + in/out-of-universe tags), caught/missed/LATE with reasons, why-trending line on the deep-dived ones, running recall rate split fast/slow
6. Full call list only when something changed; otherwise summarize deltas vs yesterday
7. Note which signals' 5d/14d/30d outcome fields the system itself has settled vs what you independently verified — flag any disagreement
8. Honest assessment every time: state the sample size and what the numbers can and cannot prove yet. Early on most signals will still be OPEN — say so plainly.

PERSIST THE FULL REPORT (source-of-truth file): every run, write the complete report — per-signal verdicts with entry/invalidation/target1/first-touch date, hit-rate tables, runner recall section, open-signal distances to target1/invalidation — to ~/workspace/goals/research-terminal/hidden_files/signal-accuracy/signal-accuracy-YYYY-MM-DD.md using the America/Toronto date (this file already exists from prior runs — keep writing the same file each day, do not create a second report file). The 09:00 terminal-morning-brief reads this file instead of re-grading, so keep every section complete and the numbers unambiguous in it.

Deliver the report as a chat message. Be brutally honest — if the hit rate is bad, say so plainly with the numbers. If nothing closed since yesterday, keep it short: interim standings only.
