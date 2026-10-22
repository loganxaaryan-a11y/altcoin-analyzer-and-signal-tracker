---
id: tg-public-sweep
title: Telegram public sweep
enabled: true
owner: goal:research-terminal
mode: task
schedule:
  kind: interval
  timezone: America/Toronto
  at: 2026-10-22T13:12:51
  every: 24h
delivery:
  - chat_id: bb1f84ee-dd7d-404c-86c6-5edd9b6ff95e
metadata:
  tags: [cron:automatic-interval-anchor]
  originating_chat_context_json: '{"chat_id":"7b75e732-f527-4d53-b40d-4aa036201d9b","origin_provider":"main","chat_kind":"direct","event_kind":"message","require_mention":false,"device_id":"d8c63a1c-801b-497b-a9fe-cd2681d2185d"}'
  presentation_locale: en-US
---
Telegram public-channel sweep (read-only, no login). Logan's public crypto Telegram channels, swept ONCE DAILY (Logan's call 2026-10-21: "once a day, twice at best, not more"). The private ones need his logged-in session (he declined) — skip them silently, never attempt auth.

CHANNELS (verified @usernames; handle audit 2026-10-15, re-verified 2026-10-21):
cointelegraph, cryptoquant_official, cryptoquant_Alert, CryptoCapoTG, onchainlens, thetulipgarden, mlmonchain, shadyssyndicate, shualpha, AW_Time, lyxedegen, alphavisiontrade, i1v9factory, jussycalls, spaceinsights, azflin_ai, salsatekila, aixbtfeed, rasmrsmemecoiners, xiaomingcallz.
- @cryptoquant_official: the VERIFIED official CryptoQuant main channel (56K subs). Replaces cryptoquant_com, whose public preview is dead. Corrected 2026-10-15.
- @cryptoquant_Alert (with underscore — NOT cryptoquantalert, which is a dead channel): the live CryptoQuant whale-alert feed. Corrected 2026-10-15 after Logan flagged it.
- @AW_Time: the real Wacy Time main channel (replaces the dead AW_Alpha mirror). Note: quiet since Dec 2025.
- @alphavisiontrade: verify the page title contains "Alpha Vision"; skip the channel if it doesn't match (name mismatch flagged 2026-10-15).
- ADDED 2026-10-21 (Logan's links; public previews verified live 2026-10-21 — these were wrongly listed as private/skipped since 2026-10-15): @i1v9factory (1v9 factory — owen1v9's trade-call channel), @jussycalls (Jussy — trading/data/investing + streams), @spaceinsights (space thoughts — @spacexbt, retail-sentiment dashboards), @azflin_ai (AzFlin's A.I. Emporium — farming/coding/shitcoins), @salsatekila (Zoomed out - Salsatekila — market views/monthly updates), @rasmrsmemecoiners (rasmr's rasmr — trading journal + stream updates, 10.8K subs).
- ADDED 2026-10-21: @aixbtfeed (Aixbt Daily Briefs — a mirror posting aixbt's daily briefs; NOT the squatted @aixbt username-selling channel, which stays excluded).
- ADDED 2026-10-21: @xiaomingcallz (xiao | HELPLINE — degen calls with a PEARL/PRL focus; Logan's words: "one of the best". Separate from the dead @xiaohelpline removed 2026-10-15.)
- REMOVED 2026-10-15 (need correct handles from Logan): aixbt (no official Telegram channel exists — @aixbt is a squatted spam channel selling the username; the real aixbt lives on X; the @aixbtfeed briefs mirror above is separate), cryptoupdates (handle now resolves to "Rowdy's Renaissance", a personal vlog channel), xiaohelpline (dead, renamed to "Circle", 1 post ever).
- Private/skipped (no public preview exists): paste.trade, Heart's trades (@theheartereum — handle provided by Logan 2026-10-21, no public preview, verified empty).

STEPS:
1. Read watermark ~/workspace/telegram-digest/watermark.md (last sweep UTC + seen message IDs as channel:id). First run: seed seen IDs from ~/workspace/telegram-digest/data/2026-10-15-public.json.
2. READ THE NOTES FIRST: skim ~/workspace/telegram-digest/notes/tickers/ and ~/workspace/telegram-digest/notes/topics/ so this run builds on what is already known instead of starting cold. Note which tickers/topics have live threads.
3. For each channel, in order, small delay between requests: curl -s --max-time 25 -A "Mozilla/5.0 (iPhone; CPU iPhone OS 26_5_2 like Mac OS X) AppleWebKit/605.1.15" https://t.me/s/<username>. Parse tgme_widget_message_wrap blocks: message text + <time datetime="...">. Keep messages newer than the watermark (fallback: last 24h). If a page 404s or has no message blocks, log and continue — never invent content.
4. Save raw pull to ~/workspace/telegram-digest/data/<UTC-date>-public.json as {"pulled_at": <utc iso>, "channels": {<username>: {"messages": [{"id":..., "date":..., "text":...}]}}, "skipped": [...]}.
5. Update watermark.md with this sweep's UTC time + all seen IDs.
6. WRITE LEARNING NOTES (Logan's directive 2026-10-21: "make notes for urself per tickers or per topics — what's affected what etc and changing what etc — so u keep learning"):
   - Per ticker: append a dated entry to ~/workspace/telegram-digest/notes/tickers/<TICKER>.md (create the file if needed) for every ticker with a REAL claim this run — a call with direction or levels, a flow/positioning data point, a dated catalyst. Entry format: date + channel + the claim, then two lines: "Affects:" (what this moves or bears on — other tickers, sectors, topics; name the mechanism, or say "no clear downstream" — never force a link) and "Changed:" (what is different vs the previous note on this ticker — new position, flipped view, catalyst nearer/passed, nothing changed = write nothing).
   - Per topic: same treatment in ~/workspace/telegram-digest/notes/topics/<topic-slug>.md for cross-ticker threads (e.g. hormuz-oil, ai-credit, pearl-listing, tokenized-stocks) — what the channels collectively added, what it affects, what changed.
   - Anti-forcing: notes only for real signal. Noise, memes, and promo get no note. An empty notes pass on a quiet day is correct, not a failure. Notes are working memory, not a deliverable — keep each entry to a few lines, facts + timestamps, no hype.
7. SYNTHESIZE for the chat message (this is the deliverable — your output IS the chat message):
   - Top items, max 8: one line each — channel, what it said, why it matters, timestamp. Only real signal: flows, positioning, on-chain data, calls with levels, macro. Skip generic headlines.
   - 2-4 key insights: what the weight of evidence says. Where the notes show a CHANGE (a flip, a new catalyst, a thesis strengthening or breaking), say so explicitly — that's the learning surfacing.
   - Note any clash/agreement with his standing terminal views from memory (BTC tripwire levels, risk regime, credit-stress thread, caller track records).
   - Terse. No fluff. Every claim traceable to a specific message. If nothing notable, say so in one line — don't force a list.

HARD RULES: read-only public web fetching. Never fabricate usernames, messages, timestamps, or numbers. Never attempt Telegram login. Quiet channels (zero new messages) are normal — report "quiet", not an error.
