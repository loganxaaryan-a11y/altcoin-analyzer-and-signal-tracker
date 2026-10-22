# Research terminal

Goal ID: goal_4938a0331118
Goal slug: research-terminal

## Description
Logan's agentic research terminal: ticker-in → full interpreted dossier out, a daily Big Updates news edition across finance/AI/crypto/robotics/wars/minerals/space, and a theory-testing engine that checks theses against chart, volume and TA with a confidence score. Chat workflow first, dashboard later.

## Setup notes (2026-10-01)
- Cron `big-updates-morning`: daily ~06:46 ET (flexible), delivers Big Updates edition to the research side chat. First auto edition fires this morning.
- Hook `big-news-watch`: polls AI/tech/crypto RSS every 20 min, wakes only on high-signal hits (AI model releases, mega funding, geopolitical/macro shocks, big crypto events). Worker verifies via search before alerting Logan; stays silent otherwise. Delivers to the research side chat.
- Theory engine: `~/workspace/research-terminal/theory_test.py` (+ `.venv` with yfinance). Usage: `.venv/bin/python theory_test.py --thesis "..." --tickers A,B,C [--benchmark SPY]`. Rule-based 0-100 confidence, transparent breakdown.
- Headline refresh: manual — Logan says "refresh"/"headlines". Brief at `~/workspace/research-terminal/headline-sweep-brief.md`; dedupe state in `last-headlines.md`.
- Logan trades perps on Hyperliquid and wants fast AI/tech alerts for positioning (e.g. Google model beating Astra/Opus = long-the-AI-beta moment).
- "Astra" and "Opus" are frontier AI models he tracks benchmarks against.
- Constraints: no hype/filler; separate fact from inference; label hypotheses; cite sources on big claims; never pad quiet verticals.
