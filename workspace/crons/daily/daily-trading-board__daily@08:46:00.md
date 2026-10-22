---
id: daily-trading-board
title: Daily trading board — 5-10 long/short ideas
enabled: true
owner: goal:research-terminal
mode: task
schedule:
  kind: daily
  timezone: America/Toronto
  time: 08:46:00
timeout_secs: 3600
delivery:
  - chat_id: 7b75e732-f527-4d53-b40d-4aa036201d9b
metadata:
  tags: [cron:flexible-time]
  originating_chat_context_json: '{"chat_id":"7b75e732-f527-4d53-b40d-4aa036201d9b","origin_provider":"main","chat_kind":"direct","event_kind":"message","require_mention":false,"device_id":"d8c63a1c-801b-497b-a9fe-cd2681d2185d"}'
  presentation_locale: en-US
---
Build Logan's daily trading board: 5-10 long/short ideas for the day, delivered to the research side chat before market open.

EVIDENCE REUSE (binding — see hidden_files/evidence-reuse/SPEC.md): this job reuses persisted evidence. Do NOT invoke terminal actions by default. Read files; only invoke terminal read actions for a mirror side whose generated_at is >2h stale at run start, and name the staleness in the source labels.

Steps:
1. Read the one-read mirrors (~/workspace/goals/research-terminal/hidden_files/terminal-state/crypto-state.json and equity-state.json): sections.open_signals.signals (entry/invalidation/targets, distances), sections.theories.theories, sections.market_read, sections.discovery, sections.paper_pilot.live_signals. Note each mirror's generated_at and each used section's as_of. If a side is >2h stale, you MAY invoke the terminal read actions (the same reads the mirror-terminal-state worker uses) for that side only — and label the pick's sources accordingly. Otherwise use the mirrors as-is.
2. Check the X-sweep digest and caller ledger (~/workspace/x-sweep/v2/calls.md, latest run in runs/, state.json) for fresh graded calls, flips, [QUIET]/[DIVERGENCE] rows. Read-only — never re-sweep.
3. Read Logan's Synthesize desk (curatednewslawl.grok.me): go deeper on his threads or surface what he missed — never re-report his headlines.
4. Check paste.trade best-trades board for what top callers are positioned in.
5. Do catalyst research: today's earnings, ratio extremes (BTC/SOXX, BTC/QQQ), credit events, geopolitical shocks, overnight news.
6. Synthesize 5-10 ideas. BEFORE finalizing, read the asset dossiers (~/workspace/goals/research-terminal/hidden_files/asset-dossiers/<SYMBOL>.md) for each candidate asset — what past streams said, the track record on this asset, what we learned. For EACH pick: direction, entry zone, invalidation level, the thesis in plain English, the bear case on the pick, honest confidence, and source labels (mirror sections + as_of / caller conviction / desk / catalyst / dossier / mix). If a section was stale, say so in the label.
7. CROSS-STREAM MATRIX (mandatory — the systematic co-relation layer, not a suggestion). For each finalized pick, check its direction against every other stream holding a view on the same asset:
   - mirror terminal theories: sections.theories.theories (direction/bias + tripwire + theory id)
   - mirror open signals: sections.open_signals.signals (direction, entry, invalidation)
   - paper pilot live signals: sections.paper_pilot.live_signals (direction)
   - caller ledger: [DIVERGENCE] rows from the last 48h in ~/workspace/x-sweep/v2/calls.md (same-underlying only, per the sweep's evidence rules)
   - paste.trade today's rows: ~/workspace/x-sweep/v2/paste-trade-calls.md (handle + direction + entry)
   Classify per pick: CONVERGENCE (3+ streams agree with the board's direction), DIVERGENCE (any stream disagrees — name every disagreeing stream; board-vs-terminal-theory/signal disagreements go FIRST, they are the highest-value flags), SINGLE (only the board holds a view). Write the full matrix to ~/workspace/goals/research-terminal/hidden_files/daily-board/cross-stream/YYYY-MM-DD.json (per asset: board direction + each stream's direction + verdict + as_of timestamps). Deliver a fixed "Cross-stream check" section in the board message: convergences as one-liners, divergences with each disagreeing stream named and the tension stated plainly. Never skip this section.
   ANTI-FORCING RULES (binding — Logan 2026-10-19: "dont force it, it has to be real"): never manufacture a connection to fill the matrix. A stream counts toward a verdict ONLY with a real directional view — direction + level or entry + timestamp. Vague sentiment, passing mentions, stale rows, and unsourced chatter do not count and are not listed as agree/disagree. Thin evidence → verdict SINGLE or UNKNOWN, never a forced CONVERGENCE. A cause-effect claim needs the mechanism named and evidence linked, or it is labeled inference. An empty or mostly-SINGLE matrix is an honest matrix — report it as-is in one line per asset, never pad.
8. Log every pick to the board ledger (~/workspace/goals/research-terminal/hidden_files/daily-board/ledger.jsonl) with date, symbol, direction, entry, invalidation, thesis summary, confidence, evidence ages, PLUS cross_stream: {verdict: CONVERGENCE|DIVERGENCE|SINGLE, agree: [<stream names>], disagree: [<stream names>]}. Then append to each pick's asset dossier (~/workspace/goals/research-terminal/hidden_files/asset-dossiers/<SYMBOL>.md — create with the dossier template below if missing): one dated stream-log line with the pick, the matrix verdict, and disagreeing streams named. The daily-board-grading job grades yesterday's picks at end of day and appends outcomes to the dossiers — that is how the dossiers learn; never write grades yourself.

ASSET DOSSIER TEMPLATE (when creating):
# <SYMBOL> — asset dossier
## Current read (as of YYYY-MM-DD): <direction, conviction, key levels, one-line thesis>
## Stream log (append-only, newest last — facts only: dated entries from each stream; keep interpretation OUT of the log)
## What we've learned (durable lessons only — updates ONLY from resolved grades with N>=3 on this asset, never from open picks, never from a single outcome; a pattern needs repetition before it becomes a lesson)

Rules: PAPER only — these are research ideas, never orders. Label clearly as "Muse's daily board," NOT terminal signals (they don't go through frozen gates). Steelman then attack every pick. No manufactured data — if evidence is missing, say UNKNOWN. Weekends: crypto-only board (equity market closed). Finnhub/Alpha Vantage stay on-demand only: zero scheduled keyed-API calls.
