# Report Population Split — 2026-10-14 (Task D, Part 1)

**Rule (binding for all daily reports):** performance figures must be presented
for THREE SEPARATE populations, never pooled. Cross-population comparisons are
fine; cross-population denominators are not.

## The three populations

| # | Population | Current count (2026-10-14) | Notes |
|---|---|---|---|
| (i) | **Legacy / reconstructed signals** | **356 retrospective rows** (60 pilot + 296 suppressed-stream candidates; `cohort-retrospective-v2.csv`) | The population graded in the daily `signal-accuracy-*.md` files. 10 crypto issued + 296 suppressed + 50 equity production-only per the v2.1.0 consolidation. |
| (ii) | **Prospective paper entries** | **0 verified deployed-natural entries; NO completed outcomes** | Prospective file `rows/cohort-prospective-v2.csv` is header-only at freeze time (forward collection only, per v2.1.x rules). See provenance note below. |
| (iii) | **Fixtures / replays** | **120 (117 + 3)** — excluded from ALL performance metrics | 117 Class A synthetic fixtures + 2 Class B market-data replays + 1 Class C candidate pending verification (see below). Source: `paper-signals/audit/entry-audit-v2-2026-10-14.md` (supersedes the v1 audit; originals untouched). |

### Provenance note on population (ii) vs (iii)

The corrected v2 entry audit did identify **one Class C candidate** — the pilot
BTC long (`sig_53bb2a86d2e0fee1f3664812`, `pilot/data/paper-pilot.sqlite`).
However, its deployed-natural provenance is **with the expert to rule**
(expert-loop state, 2026-10-14) — it is not yet verified, and it has **no
completed outcome** (still entered; zero outcome/close/settle/exit/pnl keys
exist on any of the 120 audited rows). Until the expert rules, it is counted in
the excluded (iii) bucket, not in (ii). Hence: (ii) = 0 verified, (iii) = 120.

Related: the paper pipeline's id39 Sonic long (graded HIT by the independent
first-touch method in `signal-accuracy-2026-10-14.md`) is a **signal-level
grade**, not a verified deployed entry with a completed outcome in the
prospective measurement set. Under this split it belongs in population (ii)
reporting — never inside population (i) denominators.

## Pooling locations in today's accuracy file

`hidden_files/signal-accuracy/signal-accuracy-2026-10-14.md` pools
populations (i) and (ii) in the following places (noted only — file not rewritten):

1. **§1 bottom-line table** — "crypto (altcoin) 4 / 23 = 17.4%" includes id39
   (paper cohort, HIT). Legacy-only would be **3 / 22 = 13.6%**. The
   "combined 14 / 59 = 23.7%" headline therefore moves on a paper-cohort hit.
2. **§2 confidence band** — crypto 65–79: "3/11 = 27.3% (HIT: 12, 14, 39)".
   Legacy-only: **2 / 10 = 20.0%**.
3. **§4 newly-closed item 3** — id39 (explicitly labeled "(crypto, paper
   cohort)") is graded inside the legacy crypto flow. It should be reported
   under population (ii), with a pointer from (i), not inside (i) totals.
4. **§5 OPEN table (crypto)** — id40 (HYPE short, paper pipeline, issued today
   02:23Z) is listed among legacy OPEN crypto signals (ids 31/32/33/35/38).
   It is an open prospective entry (population ii), not a legacy open.
5. **§9 honest assessment** — "Combined 14/59 = 23.7% — up 2.3pp on one new
   HIT (id39)" — the headline delta is driven by a population-(ii) signal.

**Forward rule:** any daily brief must show three separate sections —
legacy/reconstructed, prospective paper, fixtures/replays — with no shared
denominators. The one-line change that fixes today's file: move id39 and id40
out of the crypto legacy tables into a "Prospective paper" section and restate
(i) as crypto 3/22, combined 13/58.
