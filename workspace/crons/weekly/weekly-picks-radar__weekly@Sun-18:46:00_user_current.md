---
id: weekly-picks-radar
title: Weekly picks radar — IPOs & stocks
enabled: true
owner: goal:research-terminal
mode: task
schedule:
  kind: weekly
  timezone: '@user.current'
  time: 18:46:00
  dow: [Sun]
timeout_secs: 7200
delivery:
  - chat_id: a685c3e7-c8be-4137-8900-4e899008bca7
metadata:
  tags: [cron:flexible-time]
  originating_chat_context_json: '{"chat_id":"ba1c0c32-3cea-44a8-89ce-9733f3196ab4","origin_provider":"main","chat_kind":"direct","event_kind":"message","require_mention":false,"device_id":"d8c63a1c-801b-497b-a9fe-cd2681d2185d"}'
  presentation_locale: en-US
---
You are producing Logan's Weekly Picks Radar — his Sunday idea-generation feed for the research terminal workflow (goal: research-terminal).

## What to produce
4-6 investment ideas: a mix of (a) recent IPOs (listed in the last 6-12 months), (b) upcoming IPOs (S-1 filed or credibly reported), and (c) listed stocks Logan hasn't already covered deeply. Lean toward his AI/robotics physical-infrastructure thesis but don't force it — a genuinely good setup outside the thesis beats a forced fit.

## How to pick (Logan's framework — apply strictly)
1. **Platform-agnostic inevitability (the Nokia test):** prefer businesses that win regardless of which AI lab, model, or robot company wins — the "chips for phones, not Nokia or Sony" filter. If the thesis depends on one company winning a platform war, it's out.
2. **Non-obvious over obvious:** do NOT just screen famous semis/chips — that layer is crowded and priced. Be smarter: hunt the non-obvious inevitable inputs (power delivery, test equipment, interconnect, substrates, specialty materials, etc.). An obvious name is allowed only if the numbers genuinely show mispricing.
3. **Growth-adjusted, never momentum:** a big run backed by earnings growth is fine (the Hammond lesson: PEG ~1.07 justified +132%); a big run on narrative alone is a cut. Use PEG, forward multiples vs own history, backlog/order trends.
4. **Avoid repeats:** read `~/workspace/goals/research-terminal/hidden_files/picks-radar-seen.md` (create it if missing) for names already covered; skip them unless something materially changed (earnings surprise, guidance change, major contract, derating >20%, new catalyst). Append this week's names to the seen list at the end of the run.

## For each idea deliver
- What it is (one line) + why it's structurally inevitable (2-3 sentences — the Nokia-test argument)
- Valuation snapshot: price, P/E / EV/EBITDA / PEG where computable, vs its own history and 52-week range (with date)
- Crowdedness: 12-month run + analyst consensus in one line
- The single biggest risk
- **Why it'll run:** the specific catalyst and rough timeframe (earnings, contract award, IPO lockup expiry, policy decision…)

Rank by conviction. For the #1 pick include a compact bull/base/bear with explicit assumptions (reference the hardened-table style used for LEU/MP/CCJ in Sept 2026).

## Format & rules
- Phone-readable chat message. Sections: Top pick (with bull/base/bear) → More ideas (shorter each) → IPO watch → one-line watchlist adds.
- Educational research only — never financial advice; state once at the top.
- This is the weekly deep-dive, distinct from the daily terminal-morning-brief: no headline recycling, only actionable setups.
- Mark anything unverified [UNVERIFIED]. Cite sources on big claims. No hype or filler.
- Keep a run log (names covered, date) appended to the seen-list file in hidden_files.
