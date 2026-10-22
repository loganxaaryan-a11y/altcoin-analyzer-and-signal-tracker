# Daily abstention summary — job spec, 2026-10-14

SPEC ONLY. No scheduled job is created here — creating persistent scheduled
state needs Logan's explicit authorization. This file is the complete spec a
future dispatch can implement unchanged.

## Purpose

Routine paper-signal abstentions stay in the terminal only (no chat noise per
Logan's 2026-10-14 spec). The research side chat
(`a685c3e7-c8be-4137-8900-4e899008bca7`) gets ONE compact summary per day so
Logan can see what the machine looked at and passed on — without a message per
abstention.

## Schedule (proposed, not created)

- Once daily, at end of the collection day. Proposed: **21:00 ET** (after the
  US equity close and inside the crypto 24 h window; day boundary = 00:00 ET).
- Exactly one summary per day; dedup key `(summary, YYYY-MM-DD)`.
- The job runs only if the day's collection ran; if no ticks ran, the summary
  says so in one line instead of fabricating counts.

## Contents

1. **Counts by disposition** for the day:
   - issued (setup alerts sent, entries confirmed)
   - suppressed — by veto reason (born-dead, waiting-interval, freshness,
     score floor, regime gate, duplicate suppression)
   - abstained — no qualifying candidate on the tick
   - failed deliveries (if any) with the affected signal IDs
2. **Notable abstentions** — at most 3, terse, only when worth Logan's glance:
   e.g. a candidate that nearly qualified, or a suppression on a runner he is
   watching. Never more than 3; zero is fine.
3. **Collection health**: ticks run, entry observations attempted/completed,
   store lag, errors (one line each, no stack traces in chat).
4. **Carry-over**: paper positions still open from prior days (pending setups
   awaiting entry, confirmed entries awaiting invalidation/targets), one line
   each.

What it NEVER contains: per-tick noise, raw data dumps, re-scores of history,
or anything labeled as a live signal. Everything in it is PAPER.

## Compact format

```
PAPER — daily paper-signal summary · 2026-10-14 (ET)

Issued: 1 setup / 1 entry confirmed (BTCUSD long)
Suppressed: 2 (1 born-dead veto, 1 freshness refresh fail)
Abstained: 5 ticks, no qualifier
Failed deliveries: none
Notable: ETH long scored 0.61, below 0.62 floor — passed on.
Health: 24 ticks, 1 entry obs, 0 errors
Carry-over: none open
```

Hard cap: the rendered summary stays under ~15 lines. If a section is empty,
it prints `none` — it is never dropped (Logan should be able to tell "quiet"
from "broken").

## Anti-noise rules

- No summary is skipped on quiet days — the one-line "quiet" summary IS the
  signal that collection is alive.
- The summary never carries a SETUP_PENDING or ENTRY_CONFIRMED alert payload;
  those travel only as real alerts under DELIVERY-SEMANTICS-2026-10-14.md.
- If the routing test has not yet been acked, the summary notes that live
  paper alerts are still gated on the test.
