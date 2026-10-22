---
id: x-smart-sweep
title: X smart sweep
enabled: true
owner: goal:research-terminal
mode: task
schedule:
  kind: interval
  timezone: America/Toronto
  at: 2026-10-13T10:31:48
  every: 8h
timeout_secs: 1800
delivery:
  - chat_id: 7b75e732-f527-4d53-b40d-4aa036201d9b
metadata:
  tags: [cron:automatic-interval-anchor]
  originating_chat_context_json: '{"chat_id":"7b75e732-f527-4d53-b40d-4aa036201d9b","origin_provider":"main","chat_kind":"direct","event_kind":"message","require_mention":false,"device_id":"b0fd69c2-fdf4-4238-b72c-9849812abe31"}'
  presentation_locale: en-US
---
X smart-sweep run (3x daily). You are the main agent at run time.

1. Run: cd ~/workspace/x-sweep/v2 && python3 sweep.py
   (keyless fxtwitter v2 loop over all accounts in accounts.json; batched 50
   per burst with 3-min pauses + end-of-run second pass over failures, so a
   full run takes ~25-30 min; no login, no browser needed). If the script
   exits 1, note failed_handles from the summary but continue with the
   accounts that succeeded.
2. Read the newest file in ~/workspace/x-sweep/v2/runs/ (posts array,
   newest first). Filter for real trading signal using
   ~/memory/x-smart-sources.md as the lens: hard data with numbers,
   entries/levels with invalidation, dated catalysts, real position shifts,
   fund/macro thesis pieces. Skip engagement bait, vague sentiment, promo
   funnels, and reposts of things already covered.

   NOISE RULE (2026-10-15, Logan): don't filter noise without learning it's
   noise. When in doubt, keep the post in the raw run file and note it as
   borderline — the caller ledger learns what's noise over time from graded
   outcomes, not from pre-filtering. Tiers (T0/T1/T2/T3/T4) are EARNED from
   the ledger's hit rates, never assigned by gut.

3. LAYER IN THE OTHER SOURCES (2026-10-15, Logan authorized — be smart):
   - paste.trade board API: curl https://paste.trade/api/board?window=today&lens=max
     (public, no auth). Note the day's top realized calls and any handle that
     appears both on the board and in today's sweep posts.
   - Elfa (metered ~$0.015/call, keep it tight): run
     `elfa trending --limit 10` (PYTHONPATH=/opt/muse/skills/custom-connector-setup/bin)
     for what all of crypto Twitter is talking about. Compare vs what the 220
     accounts said: are they early, late, or missing it? Max ~3 Elfa calls/run.
   - CMC keyless: `./bin/cmc feargreed` for regime context (free).
   - Polymarket (public, no auth): https://gamma-api.polymarket.com/public-search?q=<ticker>
     for the 1-2 most-mentioned tickers — odds as positioning in numbers. Note
     where the money disagrees with the timeline.
   - Logan's desk (https://curatednewslawl.grok.me): cross-check only — never
     re-report his headlines; go deeper on his threads or surface what the
     sweep found that he missed.
   - Nansen: on-demand ONLY for targeted smart-money flow questions (~43 credits
     left) — never routine.
4. SIGNAL IDEAS (2026-10-15, Logan — implement):
   - EARLINESS: the ledger grades who's right, but money is in who's FIRST.
     When several accounts call the same ticker/direction, record each
     timestamp — the earliest gets the earliness credit in ~/workspace/x-sweep/v2/calls.md.
     Early + right is the T0 trait.
   - DIVERGENCE ALERT: compare X sentiment vs board P&L vs Polymarket odds.
     When the crowd screams one way and top traders (or the money) are
     positioned the other, flag it explicitly — disagreement is a signal.
   - QUIET TELL: note when perma-bulls go silent into selloffs (or perma-bears
     into rips). Absence is signal — record who stopped posting and when.
     "Silent" here means the account was RETRIEVED and posted nothing new in
     the window (see coverage contract below) — never count an unavailable
     account as silent.
5. Log directional calls to ~/workspace/x-sweep/v2/calls.md: handle, UTC
   timestamp, call text, implied direction/asset, first-mention flag where
   applicable, then grade later against price/board. This is the caller track
   record — it curates who's high-signal.
5b. EVIDENCE VALIDATION (2026-10-16, Logan — mandatory, runs BEFORE step 6).
   Apply every check below to each claim before it enters the report or the
   ledger. A claim failing a check is corrected or dropped — never narrated
   around.
   1. SAME UNDERLYING: before declaring two calls "opposing" or a DIVERGENCE,
      establish both reference the same underlying instrument (e.g. puts on the
      Global X Battery & Lithium ETF vs a long mapped to a LIT perp = NOT the
      same underlying = no divergence verdict). Different horizons can both
      succeed — never force a zero-sum read.
   2. SILENCE DURATION: compute from timestamps (last post time → now), never
      estimate. Quote the arithmetic (e.g. 2026-10-15T02:18Z → 2026-10-16T22:31Z
      = 44h13m).
   3. EARLINESS CREDIT: a retrospective claim ("delevered Monday", stated Friday)
      earns NO prospective earliness credit without an earlier timestamped record
      of the call. Log it as a stated position, not as an early call.
   4. BOARD % LABELING: every quoted board figure carries leverage + entry +
      call time + snapshot time + open/closed + underlying equivalent, or each
      missing piece is marked unknown. If open/closed status was unknown at
      quote time, write "reported leveraged P&L; realization status unknown" —
      never "realized", never confirmed open-position P&L.
   5. HYPOTHESIS LABELS: reads like "liquidation magnet", "money usually right",
      "fade-the-crowd" are hypotheses until evidenced — label them as such,
      never present them as findings.
6. Report to the user in this chat: Substack-level long-form writeup (2026-10-15:
   "summary should be like substack level long") — full depth on what mattered,
   with the why-it-matters and connections across accounts. Depth serves insight:
   go deep where threads keep yielding, stop when they stop paying. If nothing
   clears the bar, deliver nothing (stay silent; the script already updated the
   watermarks).
6a. COVERAGE REPORT CONTRACT (2026-10-15, Logan): every report must include
   the run's `coverage_line` from the run JSON summary verbatim — four
   separate numbers: accounts requested, successfully retrieved,
   unavailable (errors), genuinely observed silent. Missing retrieval is NOT
   silence: never treat an unavailable handle as quiet — in QUIET TELLs,
   call logging, or the report narrative.
   Standing leaderboard-bias note (include once per report, quote or
   paraphrase): "Availability timestamps alone do not eliminate leaderboard
   selection bias — accounts that are frequently unavailable are
   systematically under-graded, biasing the caller leaderboard toward the
   reliably-retrievable."
6b. WORLD-MODEL UPDATE (2026-10-19, Logan): after the digest, update
   ~/workspace/goals/research-terminal/hidden_files/world-model/ripples.md per
   its update loop: (1) add new observed transmissions with dated evidence from
   this sweep; (2) upgrade/downgrade strength labels; (3) log broken chains
   (expected ripples that didn't happen — as informative as confirmed ones);
   (4) never promote a chain on a single headline — needs a second source or a
   price move. If nothing earned a change, change nothing.
7. Hard rules: read-only — the script only performs GETs. If MANY accounts
   fail at once (not just the known-private chumbawamba22), the v2 endpoint may be down — report that plainly instead of delivering a thin sweep.
