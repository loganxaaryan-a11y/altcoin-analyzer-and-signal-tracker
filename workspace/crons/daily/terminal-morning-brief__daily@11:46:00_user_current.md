---
id: terminal-morning-brief
title: Terminal morning brief
enabled: true
owner: goal:research-terminal
mode: task
schedule:
  kind: daily
  timezone: '@user.current'
  time: 11:46:00
timeout_secs: 7200
delivery:
  - chat_id: 7b75e732-f527-4d53-b40d-4aa036201d9b
metadata:
  tags: [cron:flexible-time]
  originating_chat_context_json: '{"chat_id":"a685c3e7-c8be-4137-8900-4e899008bca7","origin_provider":"main","chat_kind":"direct","event_kind":"message","require_mention":false,"device_id":"d8c63a1c-801b-497b-a9fe-cd2681d2185d"}'
  presentation_locale: en-US
---
TERMINAL MORNING BRIEF — one message, four sections. Logan merged the signal post-mortems, the smart-sources sweep, the daily synthesis brief, and the setup hunt into this single brief (2026-10-05). Use America/Toronto date.

POSITIONING BRIEF — WHAT IT MEANS (sharpened split 2026-10-15): the 09:00 Big Updates covers WHAT HAPPENED. This 11:00 brief covers WHAT IT MEANS FOR OUR POSITIONS AND THEORIES — post-open, with live tape behind it. Don't re-report the news; interpret it against our signals, theories, and the caller ledger.

Run the four sections in parallel via subagents where it helps (post-mortem pulls are quick; the sweep, synthesis, and hunt are the heavy lifts), then assemble into ONE chat message with four clearly labeled sections. If a section has nothing (quiet sweep day, nothing cleared the bar, no hunt finds), say so in one line — never pad.

=== SECTION 1 — SIGNAL POST-MORTEM (both terminals) ===
The 06:00 signal-accuracy-test-week1 run is the SOURCE OF TRUTH for signal grading — do NOT re-grade signals here. Read today's grading file at ~/workspace/goals/research-terminal/hidden_files/signal-accuracy/signal-accuracy-YYYY-MM-DD.md (America/Toronto date) and carry its standings forward in 2-3 lines: combined hit rate with sample size, newly closed since yesterday, runner recall rate.
Then report ONLY the 06:00→11:00 delta: pull getsignaltracker ({}) on altcoin-analyzer-and-signal-tracker and getsignaltracker ({"query": "..."}) on equity-analyzer-and-signal-tracker, and compare each open signal's current distance to target1/invalidation against the levels in the 06:00 file. Flag only what is new since 06:00: signals that closed in the 06:00–11:00 window, or moved to within 3% of target1 or invalidation. If nothing moved, say so in one line.
Explicitly frame interim returns as tracking-in-progress noise, not verdicts; only 5D/14D/30D target-vs-invalidation outcomes are verdicts. No trading advice, no inferred prices.
If today's 06:00 file is missing or empty (run failed or skipped), fall back to running `rundailysignalpostmortem` ({}) on altcoin-analyzer-and-signal-tracker and `runDailySignalPostMortem` ({}) on equity-analyzer-and-signal-tracker, and note the gap plainly.

=== SECTION 2 — SMART-SOURCES SWEEP (covered by the 07:46 standalone sweep — do NOT re-run it here) ===
The standalone smart-sources-morning-sweep (07:46, same signal chat) already pulled these feeds this morning, ran the theory tests, and saved its theories. Do not re-pull the feeds, re-run theory tests, or re-save theories in this brief. Carry the sweep's results forward in condensed form: read today's delivered 07:46 sweep digest and today's entries in ~/memory/YYYY-MM-DD.md, and give 3-6 lines — the top insights with their theory-test scores, the theories it saved, and anything it flagged to watch. If the 07:46 sweep did not run today, say so in one line and skip the section.

=== SECTION 3 — TERMINAL SYNTHESIS BRIEF (both terminals, Logan's spec 2026-10-05) ===
Terminals are lean data machines: they collect evidence, generate signals, store and display theories. YOU do all the hard reasoning. Internal terminal synthesis is retired — never call synthesizetheorydiscovery / synthesizemarkettheories (they return retired).

CRYPTO (slug `altcoin-analyzer-and-signal-tracker`): pull evidence via `runtheorydiscovery` (evidence collection only), `getmarketread`, `getnews` (view discovery), `getsignaltracker`, plus `gethyperliquidmarket`, `getonchain`, `getwhaledata` where relevant. Reason with full agentic depth, cross-check key claims, write 1-4 theories via `saveagenttheory` (headline, thesis, direction bullish|bearish|none, confidence low|medium|high, convictionMode descriptive, sector, linkedCoins, layers[] factor ledger, invalidation tripwire, countercase, forwardLook, predictions, sources[]). If nothing clears the bar, write nothing and say so. Verify read-back via `listtheorywatch`.

EQUITY (slug `equity-analyzer-and-signal-tracker`): pull `getmarketread` (needs {"query": "..."}), `getnews` (needs {"view":"discovery","symbol":null}), `getsignaltracker` (needs {"query":"..."}), `listmachinetheories`. NOTE: `discovertheories` times out at 120s — do NOT use it. Same depth of reasoning. Write via `savetheory` (id: null for new) + `attachtheoryevidence` (confirming AND challenging). Verify read-back via `listtheories`.

Own further research: use the unlocked stack freely — no per-call approval theater, keep usage sane, stop on any 429/402: CoinStats (20k/mo), Finnhub (60/min), Etherscan (100k/day), Bigdata, Alchemy (300M CU/mo), CMC keyless, DeFiLlama, Hyperliquid, CoinGecko, OKX, BLS. GATED (scarce): Nansen on-demand only, 1-2 calls per deep dive, ALWAYS show cost + remaining; altFINS 10/day scheduled, agreement/conflict evidence only; Alpha Vantage 25/day on-demand; Elfa 10/day scheduled.

Methodology (binding): Wilder RSI-14/ATR-14. Scores are UNCALIBRATED agreement scores — never probabilities. Conviction mode descriptive until tested. Four-layer verification; contested forks get NO directional pick. Observable invalidation tripwire on every theory. Every key claim evidence-linked or labeled inference. Missing evidence = UNVERIFIED. Single source = SINGLE SOURCE, capped at low confidence.

Bill guardrail (Logan's rule): billing only where a payment method is on file — no key/account = no bill, just rate limits. Log metered spend every run for QUOTA visibility. HARD STOP on any 429/402/payment-required: end that API's use for the run, no retries, continue with what's free, say what was skipped.

SYNTHESIS DELIVERABLE (within the one message): per terminal — WHAT'S HAPPENING AND WHY, interpreted not dumped; every section ends in one interpreted line. How you researched — which sources actually pulled, what cross-checks ran, where evidence was thin. Verdict with EMPIRICAL analysis — the call backed by numbers, never narrative alone, honest UNVERIFIED / SINGLE SOURCE flags. If nothing cleared the bar: say so explicitly. End the whole brief with a one-line spend summary.

=== SECTION 4 — SETUP HUNT (Muse's personal hunt on top of terminal automation) ===
Use artifact.invoke_action on both terminals: equity-analyzer-and-signal-tracker: getmarketdaybrief ({}), getsignaltracker ({}), listmachinetheories ({}), getradar ({}); altcoin-analyzer-and-signal-tracker: getmarketdaybrief ({}), getsignaltracker ({}), listmachinetheories ({}), gethyperliquidmarket where relevant. Look for convergence: strong factor agreement + clean invalidation with room to breathe + smart-money/whale/funding support + a well-evidenced theory on the same thesis. Check both long and short setups, futures and spot framings. Run checkentry on the 1-2 strongest candidates to grade timing — Logan's direction (2026-10-05): "normal signals" from real chart/TA/volume; the 5:1 gate framing is dropped, judge entry quality on chart/TA/volume grounds. Spot-check key numbers rather than trusting prose; single-sourced evidence or broken tripwire → say so or drop it. Deliver 1-3 best finds (ticker/coin, direction, 2-3 line thesis, entry zone, invalidation, targets, converging evidence, honest caveats incl. calibration status and what could kill it). If nothing meets the bar, one line — never pad. Research only: no position sizing, no urgency language, agreement scores are not probabilities, UNCALIBRATED where no track record exists.

Assemble all four sections into the one message with headers: "Signal post-mortem", "Smart sources", "Terminal synthesis", "Setup hunt". Each section keeps its own deliverable rules.

Do not edit MEMORY.md; append dated observations to ~/memory/YYYY-MM-DD.md (append-only).
