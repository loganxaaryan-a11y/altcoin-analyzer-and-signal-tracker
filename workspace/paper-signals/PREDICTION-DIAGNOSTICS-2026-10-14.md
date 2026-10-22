# Prediction Diagnostics — missed runners, 2026-10-14 (Task D, Part 2)

**Scope:** the session-9 crypto 0/7 misses (TRUTH, Q, BTW, PRL, BAT, WAL, ALEO)
plus the two recent equity misses (AMT, ACN — session 8; session 9 had zero
equity qualifiers). Sources: `hidden_files/signal-accuracy/signal-accuracy-2026-10-14.md`
§7 and `hidden_files/signal-accuracy/runner-recall.md` (sessions 8–9). All
returns in this revision are measured from public price data on 2026-10-14
~18:22Z; nothing below is a counterfactual.

**Method:** for each runner, walk the pipeline in order — universe → data →
scan → strategy → entry → delivery — and record the EARLIEST stage that
failed. Exactly one category per runner:
`outside-universe / unavailable-data / not-scanned-in-time / unresolved-screen-rejection / strategy-rejection / entry-failure / delivery-failure`.
`unresolved-screen-rejection` is used where the operative screen never
qualified the runner but no scan-timing evidence establishes a missed scan;
it names the evidence gap instead of assuming the cause.

**Reading rule:** every runner below was already up sharply when first observed
— all nine carry the late-detection flag. A late detection is not a successful
prediction, even where the move continued afterward. No runner below was ever
called; measured post-detection returns are observations of what happened
after observation, not of any position the system took or would have taken.

## Per-runner diagnostic table

| runner | direction-called? | earliest-failure | detection-time | move-after-detection | late-detection-flag |
|---|---|---|---|---|---|
| TRUTH (Swarm Network, T2) | NO — velocity-flagged + scored, never called | **strategy-rejection** — issuance-validation veto: born-dead (signal-day low breached invalidation) | 10-14 ~08:26Z, session-9 review (discovery run 57), first in-review observation | **measured** (see returns table): detection → ~10h: +1.67%; range flat-to-slightly-up | **late detection — not a successful prediction** (already discovery +50.8% / CG 48h +60.8% at detection) |
| Q (Quack AI, T2) | NO — mid-window velocity flag, vetoed, never called | **strategy-rejection** — velocity-qualified + scored, born-dead vetoed (session-8 mid-window flag 10-13 is not pre-window) | 10-13 ~08:26Z, session-8 review (mid-window; first in-review observation of this run) | **measured:** detection → +24h: +28.28%; detection → now (~34h): +33.00%. Continuation is measured fact; no position was taken. | **late detection — not a successful prediction** (already +30.48% 48h at first observation) |
| BTW (Bitway, T2) | NO — velocity-flagged + scored, never called | **strategy-rejection** — velocity-qualified + scored, born-dead vetoed | 10-14 ~08:26Z, session-9 review (discovery run 57) — session-8's +27.0% discovery print was a rejected measurement conflict (CG +10.42%, below bar) | **measured:** detection → ~10h: −16.01%; peaked +3.3% above detection before fading | **late detection — not a successful prediction** (already discovery +52.0% / CG 48h +46.1% at detection) |
| PRL (Pearl, T4) | NO — velocity-flagged + scored, never called | **strategy-rejection** — velocity-qualified + scored, born-dead vetoed | 10-14 ~08:26Z, session-9 review (discovery run 57), first in-review observation | **measured:** detection → ~10h: +1.51%; essentially flat | **late detection — not a successful prediction** (already discovery +38.8% / CG 48h +35.8% at detection). Theory candidate (2+ in-window sources) — flagged, not created |
| BAT (Basic Attention Token, T3) | NO — mid-window velocity flag, vetoed, never called | **strategy-rejection** — velocity-qualified + scored, born-dead vetoed (session-8 mid-window flag 10-13 is not pre-window) | 10-13 ~08:26Z, session-8 review (mid-window; first in-review observation of this run) | **measured:** detection → +24h: +4.58% (peak +9.6% above detection); detection → now (~34h): −7.14%. The move continued, then reversed. | **late detection — not a successful prediction** (already +26.55% 48h at first observation) |
| WAL (Walrus, T3) | NO — never qualified, never scored | **unresolved-screen-rejection** — the velocity screen never qualified it (no suppression row; board-only detection). No scan-timing evidence establishes a missed scan, so a missed-scan claim is not made. | 10-14 ~08:26Z, session-9 review — via tiers board only (+35.7% board / +33.5% CG 48h); the operative screen never saw it | **measured:** detection → ~10h: +26.88%; monotonic up over the window | **late detection — not a successful prediction** (already +33.5% 48h when the board displayed it) |
| ALEO (Aleo, T2) | NO — velocity-flagged + scored, never called | **strategy-rejection** — velocity-qualified + scored, born-dead vetoed | 10-14 ~08:26Z, session-9 review (discovery run 57), first in-review observation | **measured:** detection → ~10h: +0.96%; essentially flat | **late detection — not a successful prediction** (already discovery +26.8% / CG 48h +24.7% at detection) |
| AMT (American Tower, sp100 equity) | NO — no pre-move flag or signal; bullish dossier only on demand post-move | **not-scanned-in-time** — no timely scan: discovery dead 3 sessions; getradar sp100 degraded 5 straight sessions (recovered session 8 but issued nothing); on-demand dossier read aligned_long +60 (RSI 69.1) only after the move | post-move, session-8 review (10-13); at detection +12.51% 5d (10-05→10-12, recomputed and verified) | **measured:** as of 10-14 close — rolling 5d (10-07→10-14): +8.09% (down from +12.51%); same-base 10-05→10-14: +10.70%; close-to-close post-detection (10-13→10-14): +0.11%. Faded on the rolling-5d frame. | **late detection — not a successful prediction** |
| ACN (Accenture, sp100 equity) | NO — no pre-move flag or signal; bullish dossier only on demand post-move | **not-scanned-in-time** — no timely scan (same discovery/getradar gap as AMT); in-window catalyst (Dell AI partnership expansion, 10-08, 2+ sources) never picked up; dossier aligned_long +56 (RSI 63.5) only on demand post-move | post-move, session-8 review (10-13); at detection +10.16% 5d (recomputed and verified) | **measured:** as of 10-14 close — rolling 5d (10-07→10-14): +9.43% (down from +10.16%); same-base 10-05→10-14: +10.33%; close-to-close post-detection (10-13→10-14): +0.76%. Roughly flat. | **late detection — not a successful prediction** |

## Measured post-detection returns

Measured 2026-10-14 ~18:22Z. Crypto: CoinGecko `market_chart/range` hourly,
10-11 → 10-14; detection price = hourly point nearest detection time.
Cross-checked against the cmc-keyless CLI (rounded to 2 decimals; all seven
agreed). Equities: Yahoo Finance daily chart API. Detection-time equity
5d figures were recomputed from the same source and matched the file's
+12.51% / +10.16% exactly.

Barrier check for crypto: the 12h low before detection (the price region the
born-dead veto was reacting to) was NOT breached after detection for any of
the seven runners — but no barrier was "ahead" of anything, because no
position was ever taken. The barrier column is reported for completeness,
not as a position outcome.

| runner | detection time (Z) | price @ detection | price @ now | return det → now | +24h return | post-detection low / high | pre-det 12h low breached? |
|---|---|---|---|---|---|---|---|
| TRUTH | 10-14 08:26 | $0.02260 | $0.02298 | **+1.67%** (~10h) | not yet elapsed | $0.02235 / $0.02336 | NO |
| Q | 10-13 08:26 | $0.03846 | $0.05115 | **+33.00%** (~34h) | **+28.28%** | $0.03846 / $0.05145 | NO |
| BTW | 10-14 08:26 | $2.5204 | $2.1168 | **−16.01%** (~10h) | not yet elapsed | $2.1168 / $2.6031 | NO |
| PRL | 10-14 08:26 | $1.9289 | $1.9580 | **+1.51%** (~10h) | not yet elapsed | $1.8854 / $2.0174 | NO |
| WAL | 10-14 08:26 | $0.04873 | $0.06183 | **+26.88%** (~10h) | not yet elapsed | $0.04873 / $0.06183 | NO |
| ALEO | 10-14 08:26 | $0.04005 | $0.04044 | **+0.96%** (~10h) | not yet elapsed | $0.03939 / $0.04251 | NO |
| BAT | 10-13 08:26 | $0.18347 | $0.17037 | **−7.14%** (~34h) | **+4.58%** | $0.17037 / $0.20108 | NO |
| AMT (equity) | 10-13 (review day) | 5d +12.51% | 179.62 (10-14 close) | rolling 5d now **+8.09%**; post-det close-to-close **+0.11%** | n/a (equity frame) | — | n/a |
| ACN (equity) | 10-13 (review day) | 5d +10.16% | 215.19 (10-14 close) | rolling 5d now **+9.43%**; post-det close-to-close **+0.76%** | n/a (equity frame) | — | n/a |

Honest read of the numbers: post-detection continuation is mixed. Q and WAL
continued hard (+33.0% / +26.9%); BTW and BAT reversed (−16.0% / −7.1%);
TRUTH, PRL, ALEO were roughly flat (+1.7% / +1.5% / +1.0%); AMT faded on the
rolling-5d frame and ACN was roughly flat. Neither "the move was over" nor
"it kept running" holds uniformly — the vetoes were non-chase calls, and
non-chase calls have a measured cost (Q, WAL) and a measured saving (BTW,
BAT). The +24h/+48h checks for the five session-9 crypto runners have not
yet elapsed; the continuation/fade read for them lands in session 10.

## Headline

**`strategy-rejection` dominates: 6 of 9 misses.** All six session-9 crypto
runners the scanner found were killed at the issuance-validation veto
(born-dead — the 48h-velocity + same-day-issuance design can only qualify a
move after it has already printed). The remaining misses are WAL
(`unresolved-screen-rejection` — the operative screen never qualified it,
and no scan-timing evidence establishes a missed scan) and AMT/ACN
(`not-scanned-in-time` — dead equity discovery). Zero `outside-universe`
misses (all nine in-universe), zero `unavailable-data`, `entry-failure`, or
`delivery-failure` — the pipeline observed 7 runners mid-move and issued
0 calls.

**Caveat (carried, not re-audited):** the born-dead vetoes are mechanically
defensible as non-chase calls. What this revision changes is the follow-on
claim: qualifying on trailing-48h velocity does not establish that the move
is over at issuance. The measured evidence runs both ways — Q (+28.28% at
+24h post-detection) and WAL (+26.88% in ~10h) continued, while BTW
(−16.01%) and BAT (−7.14% from detection, after peaking +9.6%) reversed.
A vetoed call is a call not taken; its outcome is measured, not asserted.
