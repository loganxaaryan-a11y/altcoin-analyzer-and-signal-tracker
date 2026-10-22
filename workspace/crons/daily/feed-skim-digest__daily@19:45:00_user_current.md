---
id: feed-skim-digest
title: Feed skim digest → terminal signal chat
enabled: true
owner: goal:research-terminal
mode: task
schedule:
  kind: daily
  timezone: '@user.current'
  time: 19:45:00
delivery:
  - chat_id: 7b75e732-f527-4d53-b40d-4aa036201d9b
metadata:
  originating_chat_context_json: '{"chat_id":"7b75e732-f527-4d53-b40d-4aa036201d9b","origin_provider":"main","chat_kind":"direct","event_kind":"message","require_mention":false,"device_id":"b0fd69c2-fdf4-4238-b72c-9849812abe31"}'
  presentation_locale: en-US
---
## Feed skim digest (daily) — Logan's idea, 2026-10-17

Every morning, produce the terminal-relevant digest of the last ~24h and deliver it to the terminal signal chat.

### The split (important)
Feed units can ONLY be read with the feed tools, which work solely in the main conversation — a scheduled worker cannot call them. So this job is split:
- **Worker (this run):** sweep news sites and world events from the last ~24h across Logan's beats: macro/rates, crypto flows and tape, AI buildout + AI-credit stress, cannabis (SNDL/Canopy/Aurora/Vireo/Planet 13, policy votes), geopolitics/energy, big tech. Use browser_search (news vertical where it fits) and verify each claim against its source before including it. Draft the digest (see format). Then write THEORY CANDIDATES (see below) to hidden_files/feed-skim-digest/theory-candidates-YYYY-MM-DD.md (paths relative to ~/workspace/goals/research-terminal/).
- **Main agent at delivery:** reads the last ~24h of Feed units with the feed tools, folds the feed signal into the worker's draft, and posts the combined digest. The worker's draft must be clearly sectioned so the feed items slot in. Then: (a) review the theory candidates — save the worthy ones as terminal theories via the terminal actions (report which were saved and which were rejected and why); (b) run the RIPPLE-MAP UPDATE (see below).

### Digest format
Compact, phone-readable. One line per item: what happened + the number + why it matters for the terminal. Standing lens (Logan's words): news matters for understanding how big powers work — every item carries the game-theory/narrative layer (who benefits, what game is being played, what story is being sold), not just prices.
Evidence rules: label FACT vs INFERENCE vs HYPOTHESIS; caller opinions (e.g. "Willy Woo reads X as contrarian") stay labeled as caller opinion, never findings; every % carries its basis or is marked unknown.

### Theory candidates (worker writes, main agent judges)
From the digest, propose up to 3 theory candidates — each MUST have: asset, direction (long/short/none), a falsifiable tripwire (observable price level or dated event that confirms/denies it), invalidation, horizon, and the 2-4 evidence lines supporting it. ANTI-FORCING: a candidate counts only with a real directional view and a tripwire; vague sentiment, single headlines, and thin evidence never become candidates and are not listed. An empty candidate file is honest — never pad. Candidates are proposals, not theories: the main agent saves only the ones that survive its own read, and reports rejections with reasons.

### Ripple-map update (main agent, after posting)
Update ~/workspace/goals/research-terminal/hidden_files/world-model/ripples.md per its update loop: (1) add new observed transmissions with dated evidence (from the digest AND the folded feed units); (2) upgrade/downgrade strength labels; (3) log broken chains (expected ripples that didn't happen — as informative as confirmed ones); (4) never promote a chain on a single wire-service headline — needs a second source or a price move. If nothing earned a change, change nothing and say so in the run note.

### Delivery
Post the combined digest to the terminal signal chat. Keep a short run note in ~/memory/YYYY-MM-DD.md. Stay silent in other chats.
