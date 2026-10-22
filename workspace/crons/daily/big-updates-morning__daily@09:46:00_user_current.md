---
id: big-updates-morning
title: Big Updates morning edition
enabled: true
owner: goal:research-terminal
mode: task
schedule:
  kind: daily
  timezone: '@user.current'
  time: 09:46:00
timeout_secs: 2400
delivery:
  - chat_id: 7b75e732-f527-4d53-b40d-4aa036201d9b
metadata:
  tags: [cron:flexible-time]
  originating_chat_context_json: '{"chat_id":"a685c3e7-c8be-4137-8900-4e899008bca7","origin_provider":"main","chat_kind":"direct","event_kind":"message","require_mention":false,"device_id":"b0fd69c2-fdf4-4238-b72c-9849812abe31"}'
  presentation_locale: en-US
---
Produce Logan's "Big Updates" morning edition for today (use America/Toronto date).

TWO OUTPUTS (standing, 2026-10-16): every run produces exactly two outputs.
(a) THE SHORT USER BRIEF — delivered to chat as the run's final message. Format (adopted 2026-10-16): the FRONT PAGE four lines first; then the Big Three as punchy takes with key numbers bolded; rest of the tape as one-liners; compact theory bridge + KOL watch; overnight tape unchanged. The brief is the product Logan reads; keep it tight and phone-readable.
(b) DURABLE LINKED RESEARCH UPDATES — the dated archive file plus terminal theory updates. The claim ledger, delta-vs-previous-edition, affected terminal records, and next checks live here, not in the chat brief. The chat brief stays readable; the durable layer stays complete. Never merge them into one long message.

FRONT PAGE (standing, 2026-10-16; corrected 2026-10-16 per reviewer): the chat brief OPENS with four plain-language lines, before anything else:
- What changed: the 1–3 developments that matter since yesterday's edition.
- What it affects: assets, sectors, or positions touched (symbols named).
- What we're watching: the open questions and their next check (date/event).
- Delivery status: the channel-acknowledged delivery status of PREVIOUS editions and alerts (on-time / delayed / unconfirmed), plus THIS edition's timeliness label when it started >15 min late (DELAYED — scheduled vs actual start, known at build time; see DELIVERY TRACKING).
Hard rule (reviewer correction 2026-10-16): the brief NEVER claims its own receipt. This edition's acknowledgement is established only by channel ack after delivery, recorded under DELIVERY TRACKING. The front page reports prior receipts and this edition's lateness — never "you received this alert."
Sources, calculations, and operational detail stay expandable below the front page. The front page must make the research usable without reading the whole edition.

NEWS EDITION — WHAT HAPPENED (sharpened split 2026-10-15): this edition reports what happened across the verticals, with why-it-matters. The 11:00 terminal brief covers what it means for our positions and theories — don't duplicate its job; leave position interpretation to the brief.

Sweep the last ~24h across these verticals: finance/markets, AI, crypto, robotics, wars/geopolitics, minerals/commodities, space.

Method: browser_search with the news vertical, a few targeted queries per vertical; browser_open the most important hits to verify. Spawn parallel subagents if it speeds the sweep.

Content bar (this is the product — hold it):
- Lead with what actually moved or broke. TBPN-style punchy voice for the tech/AI section; tight everywhere else.
- Every item: what happened, why it matters, which companies/sectors it touches, 2nd/3rd-order ripple effects. No bare headlines.
- Separate measured facts from inference; label hypotheses as hypotheses.
- Cite sources with links on the biggest claims; say plainly when something is single-source or unconfirmed.
- No hype, no filler, no AI slop. If a vertical is quiet, say so in one line — never pad.
- End with "Overnight tape": US futures, Asia/Europe sessions, BTC/ETH, and today's scheduled catalysts (data releases, earnings, launches).

DEPTH BALANCE (2026-10-15, Logan's rule): don't go crazy on depth — find the balance where real insights live. Depth serves insight: go deep on threads that keep yielding, stop the moment one stops paying. A tight edition that finds three real things beats an exhaustive one that finds nothing. Insight density over coverage.

THEORY BRIDGE (standing instruction): after the edition is written, extract the 1–2 most theory-grade findings — a thesis where the narrative lines up with numbers, or a setup with converging evidence across independent lanes. For each candidate: verify the key claims with at least 2 independent sources; run the relevant terminal verification via artifact.invoke_action (analyzecoin/analyzeinstrument for chart/factors/structure, gethyperliquidmarket or funding/OI where relevant, checkentry for timing on the 1–2 strongest). Then BOTH: (a) write it into the terminal — save as a [Muse theory] via the terminal's theory actions, or attach as narrative evidence to an already-tracked thesis via attachtheoryevidence — following the standing evidence rules (single-source → flagged SINGLE SOURCE, capped at low confidence, no auto-invalidation; tripwire must be on the correct side of current price, derived from the asset's own history, and verified unbreached at creation; if no valid tripwire can be computed use thesis falsification conditions and no price tripwire); and (b) include the theory in the chat delivery with its evidence, invalidation/falsification conditions, and honest caveats. Never force it: if nothing is theory-grade, say so in one line. This is research, not trading advice: no position sizing, no urgency language, agreement scores are not probabilities.

THEORY VERSIONING (standing, 2026-10-16): when the theory bridge touches a thesis the terminal already tracks, UPDATE the existing theory — attach new evidence via the terminal's evidence actions, revise conditions/tripwires in place — rather than saving a new theory. Never create a duplicate theory for a thesis already tracked. Preserve prior versions: if the terminal's theory actions support version history, use it; if not, write the prior version's key fields (thesis text, conditions, tripwire, confidence, timestamp) into the new evidence text BEFORE overwriting, so the history is retained in the record. A theory updated today must still show what it said yesterday.

KOL WATCH (paste.trade, merged 2026-10-05; API route verified 2026-10-15): pull the public board API directly — https://paste.trade/api/board?window=today&lens=max (no auth, returns the full today table; the 7d window returns top 10 only). No live browser needed. Look for: fresh high-conviction calls from top callers, direct clashes between board calls and the terminals' open signals or tracked theories (pull getsignaltracker on both terminals to compare), and any new calls from Citrini, Ansem, or Cobie. Prefer 'direct' (author-named) over AI-extracted 'derived'; P&L is naive (no borrow costs), win rates need N. Include as a compact section only if something qualifies; otherwise one line "KOL watch: quiet."

FROZEN-SCORE QUARANTINE (hard rule, 2026-10-16): unverified claims and caller opinions NEVER enter frozen signal scores or factor inputs. This includes KOL/paste.trade caller rows (witness layer only — store timestamped observations in shadow mode with entry, leverage, and source preserved), single-source or unconfirmed news claims, and any HYPOTHESIS-status ledger items. They may inform research and the theory bridge (labeled as witness evidence, capped confidence), but they never touch frozen scores, gates, weights, or factor inputs. The frozen core stays frozen.

ARCHIVE — REMEMBERED COPY (standing, 2026-10-15): the edition must be remembered for the terminal's research pipeline. After writing it, save the FULL edition as a dated file at ~/workspace/goals/research-terminal/hidden_files/big-updates/YYYY-MM-DD.md (create the dir if missing) — every section, the claim ledger, the delta + next check, all claims with their sources, the theory bridge, KOL watch, overnight tape. This is the durable copy the terminal reads later; the chat delivery is the readable one. Then append 3-5 lines of dated observations to ~/memory/YYYY-MM-DD.md (append-only; never edit MEMORY.md).

CLAIM LEDGER (standing, 2026-10-16): for each MATERIAL claim in the edition (a claim that moves a thesis, an asset read, or a tracked question — not every background fact), record a structured entry in the dated archive file under a "## CLAIM LEDGER" section. Schema — template at ~/workspace/goals/research-terminal/hidden_files/big-updates/CLAIM-LEDGER-TEMPLATE.md:
- claim: the claim text, verbatim as published in the brief.
- source: name + URL.
- event_time_utc: when the underlying event happened (ISO-8601; null if unknown, never inferred).
- publication_time_utc: when the source published it (ISO-8601; null if unknown).
- retrieval_time_utc: when this run read it (ISO-8601).
- affected_assets: symbols/sectors touched (e.g. BTC, MSTR, semis).
- status: FACT | INFERENCE | HYPOTHESIS | UNVERIFIED | SINGLE_SOURCE — one only, per the fact-vs-inference bar.
- challenged_by: what evidence would overturn or weaken the claim (be specific: a number, a date, an event).
A claim without a real source link and publication time stays UNVERIFIED and never becomes terminal evidence. The ledger is append-only within the edition; corrections to earlier editions go in the new edition's delta section, never by rewriting the old ledger.

DELTA + NEXT CHECK (standing, 2026-10-16): the durable layer ends with:
(a) WHAT CHANGED since the previous edition, organized per tracked question/theme (e.g. "BTC $80K demand question", "AI financing stress", "MSCI/MSTR") — new facts, resolved questions, anything that reversed.
(b) WHICH TERMINAL RECORDS IT AFFECTS: theory ids updated (with version note), signal ids referenced, watchlist items added/removed.
(c) THE NEXT CHECK: what to look for and when (a date, a data release, an event — never "monitor ongoing").
If nothing changed on a tracked question, say so in one line — the silence is the signal.

DELIVERY TRACKING (standing, 2026-10-16): the edition's delivery is tracked through channel acknowledgement, independent of research quality:
- Record per edition: scheduled_for, started_at, built_at, delivered_to_chat_at, channel_ack (confirmed | unconfirmed).
- If started_at is more than 15 minutes after scheduled_for, label the edition DELAYED prominently at the top of the chat brief: "**DELAYED edition** — scheduled 9:46, published 10:25".
- The run's chat-facing final message IS the brief itself — the full edition text, nothing else. Writing a summary report about the edition instead of delivering the edition is explicitly forbidden (this failure mode occurred 2026-10-16: the run completed the research but the user never received it).
- Delivery health and research quality are separate verdicts: a late edition is labeled late; a thin news day is labeled thin. Neither excuses the other.
