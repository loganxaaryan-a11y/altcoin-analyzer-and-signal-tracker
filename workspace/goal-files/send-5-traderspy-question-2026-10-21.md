# For the expert — TraderSpy: verified, with one scoring caveat. Where does it belong in the stack?

> **SUPERSEDED IN PART (2026-10-21, expert review):** the expert reviewed the underlying verification directly and corrected it: (1) three sampled signals (TAO, ZRO, PAXG) were still inside their 4-day horizons — the "51.4% rebuilt win rate" below is withdrawn; it is an observed target-touch fraction over a maturity-incomplete sample, and no "better than a coin flip" claim stands; (2) `profit_locked` is to be kept as a vendor-reported exit class — neither a verified target win nor automatically a loss — not re-scored as non-wins as proposed below; (3) the 30 reproduced classifications support the sampled claims only. A small prospective caller-ledger pilot was approved on the corrected labels; the questions below are answered. The corrected verification file governs.

Prepared 2026-10-21 (evening, EDT). Full evidence: `traderspy-verification-2026-10-21.md`. PAPER ONLY context — nothing here proposes live trading.

## What it is
TraderSpy (api.traderspy.app) — an AI futures-signal vendor plus a smart-money layer (top traders by ROI/PnL/SmartScore across Binance, Hyperliquid, Bybit, OKX; trader profiles; live positions). Logan obtained API access 2026-10-21; connected and verified live from our environment. Signal rows arrive timestamped with locked entry prices, TP1–TP3/SL as percentages, the conditions that fired, and a self-reported resolutionStatus.

## Verification (independent rebuild from Binance 1m data)
- Sample: the full first feed page of resolved signals, 40 rows, no cherry-picking; 35 verifiable today (5 excluded — created today, perp-only symbols, futures archive not yet published).
- **Every TP/stop claim reproduced exactly: 30/30.** BTC's claimed stop timestamp matched the reconstruction to the minute. Entries are point-in-time clean (32/35 inside the entry minute's real range; 3 sub-1% deviations on illiquid names). No backfill signs. The feed shows its losers — stops are the largest class on the high-importance page.
- **The 5 disagreements are one category: `profit_locked`.** The vendor counts these as wins; none of the 5 reached TP1. Four expired touching neither level; one (BTC) wiggled +0.67% in its favour, got "locked," and then hit its stop.
- **Win rates:** vendor claims 67–68%. Rebuilt TP1-before-stop on the sample: **51.4%** (58.1% on the vendor's own denominator). The entire gap is the profit_locked treatment. The high-importance history itself (Sep 2–Oct 16) claims only 53.1% before any re-scoring.

## Limits (stated by the API)
300 requests/day (resets 00:00 UTC), 10/minute, page size max 50, ~4,435 signals retrievable via offset. No account/usage endpoint exists; plan name not stated. Budget-wise this is a few pulls a day, not a streaming feed.

## Builder's read
- Signal engine: **grade B** (claims independently reproducible). Headline win rate: **grade C** until profit_locked is re-scored as non-wins.
- "Pretty good" is supported for the engine's honesty, not for the marketed number. A ~51% TP1-first hit rate with TP/SL geometry around 3–10% targets vs ~4–6% stops is a real, measurable caller — not obviously an edge after costs, and the sample is 35.

## Proposed incorporation (builder's proposal, not yet built)
1. **Caller-ledger grading**, same as the X callers: ingest signals point-in-time, grade first-touch against frozen geometry, profit_locked re-scored as non-win by rule. Their win rate then competes on our scoreboard, not theirs.
2. **Research-shortlist input (grade C→B evidence)**: a TraderSpy signal on an asset is a lead for the research lane, never an issuance input.
3. **Smart-money cross-check**: their leaderboard/positions against the Hyperliquid whale watch already running — agreement/divergence notes only.

## Questions for the expert
1. Is a verified-honest but ~51% TP1-rate external caller worth ledger space and a daily pull budget (300/day is not binding for this use), or is it noise next to the internal funnel?
2. Should profit_locked be re-scored as a non-win, or tracked as its own outcome class (partial-win accounting) so the vendor's convention stays visible?
3. Weight: does a TraderSpy signal agreeing with a discovery candidate count as independent confirming evidence for research prioritization, given both are ultimately price/TA-derived (correlated inputs)?
