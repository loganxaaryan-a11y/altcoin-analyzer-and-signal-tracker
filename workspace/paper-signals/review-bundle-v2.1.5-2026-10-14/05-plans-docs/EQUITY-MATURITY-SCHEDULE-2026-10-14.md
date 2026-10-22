# Equity Maturity Schedule — computed calendar (expert correction 1)

**Date:** 2026-10-14 · Workstream C · freeze manifest v2.1.0
**Status:** COMPUTED. This is a calendar calculation, not a decision. It
replaces the audit's signal-date + 47-calendar-day substitution
(`MEASUREMENT-GAPS-2026-10-14.md` gap (e)) and the COLLECTION-PLAN §9
unresolved-conflict flag, per the expert's correction: "this is a calendar
calculation, not a decision."

## 1. The frozen evaluator's exact 30-trading-session rule

Source: the frozen equity evaluator (`equity-eval-3.3.0`), exported source
`goals/research-terminal/hidden_files/source-export-2026-10-13/equity/server/src/measurement.ts`.

**Session expectation** (`evaluateEquityTradeSetup`, entry-anchored — not
signal-anchored):

> `const expected = expectedXnysSessions(signal.entryAt, signal.primaryHorizon);`

where `expectedXnysSessions(afterInstant, count)` collects **the `count`
XNYS sessions strictly after the NY-calendar date of the entry instant**
(cursor starts at the NY date of `entryAt`, advances one day first, then
collects — the entry day itself is never counted).

**Horizon close** (the outcome deadline): the close of the 30th such
session — `xnysSessionBounds(finalDate).end` (16:00 ET; 13:00 ET on early-
close days). The barrier walk is first-touch: target-first → HIT,
invalidation-first → MISS, no touch in 30 complete sessions → TIME_EXIT at
that close. Quoted verbatim from the source:

> "No level touched in ${signal.primaryHorizon} complete XNYS sessions;
> the frozen horizon closes at the final session close."

Recorded constants on every tracked signal: `primaryHorizon: 30`,
`horizonUnit: "trading_sessions"`, `exchangeCalendar: "XNYS"`.

## 2. Calendar provenance (with honest caveats)

- **Calendar used:** XNYS — weekdays minus the hardcoded NYSE holiday
  schedule in the frozen source (`xnysHolidays` + explicit Good Friday map
  {2025: 2025-04-18, 2026: 2026-04-03, 2027: 2027-03-26} + early-close set),
  coverage 2025–2027 only (`XNYS_SUPPORTED_YEARS`). All dates below fall
  inside coverage.
- **Caveat (sandbox vs authoritative):** this schedule lives in the
  sandbox source export; it was audit-nominated from the NYSE Group
  official 2026/2027 holiday calendar, not downloaded from an authoritative
  feed. Cross-check: every relevant 2026/2027 closure in the computed
  schedule (Thanksgiving 2026-11-26, Christmas 2026-12-25, New Year's Day
  2027-01-01, MLK 2027-01-18, Presidents Day 2027-02-15, Good Friday
  2027-03-26) matches the audit's own listed closures exactly.
- **Anchor is entry, not signal date.** The audit's +47 rule anchored on
  the signal date and covered both counting anchors as a backstop. The
  evaluator anchors on `signal.entryAt` and counts exclusively. Under the
  frozen entry rule this changes the answer (see §3).

## 3. The entry rule (frozen) and the latest possible entry

`actionable-entry-v1` equity entry rule: **`next-xnys-regular-session-open-print`**
(`entry-v1/src/entry-rules.ts`):

- `entryWindowOpensAt` = next regular XNYS session open after the signal
  date (09:30 ET); `entryWindowExpiresAt` = that same session's close
  (16:00 ET; 13:00 ET early-close). No extension: a contract that never
  enters voids (`void_expired`/`void_no_quote`/`void_drift`) — it is logged
  as a non-entry, never scored as a miss.
- **Maximum entry delay** per the entry-expiry rule = entry at the window
  expiry (the next session's close). Because the evaluator's anchor is the
  **NY date** of `entryAt`, any intraday position inside the entry session
  yields the same 30-session list.

Latest possible signal date: **2026-12-31** (Thursday — a regular XNYS
session; collection window 2026-10-14 → 2026-12-31 inclusive, UTC; the
latest UTC instant 2026-12-31T23:59:59Z is 18:59 ET, still NY date
2026-12-31).

Latest possible entry session: next XNYS session after 2026-12-31 =
**2027-01-04** (Monday; 2027-01-01 is the New Year's Day holiday,
01-02/01-03 are weekend). Entry at/inside the 2027-01-04 session.

## 4. Computed outcome deadline (function of entry)

For a row with entry instant `entryAt`:

> **due(entryAt) = NYSE-close of the 30th XNYS session strictly after the
> NY-calendar date of `entryAt`.**
>
> due = `expectedXnysSessions(entryAt, 30)[29]` at session close
> (16:00 ET; 13:00 ET if that date is an early close).

### Working set — per-row status (2026-10-14)

The prospective cohort vessel (`rows/cohort-prospective-v2.csv`) is
header-only. The working set — the 50 equity rows in
`rows/cohort-retrospective-v2.csv` (which backfills the 50 real pilot rows
in `rows/comparison-rows-pilot-2026-10-14.csv`) — is 50/50
**`unscored:production-not-issued`** (Cohort E, equity production-only):
**no row has an entry timestamp**. Per-row due dates are therefore the
formula above, to be evaluated per row once prospective rows are collected
with actual `entryAt` values.

The 50 symbols (all pending-entry, no timestamps): AAPL, ABBV, AMD, AMT,
AXP, BA, BAC, BKNG, BNY, CMCSA, COF, COST, CSCO, CVS, DE, DHR, DUK, FDX,
GD, GE, GEV, GS, HD, INTC, ISRG, JPM, LMT, LOW, MCD, META, MS, NEE, NFLX,
NOW, PANW, PEP, PG, PLTR, RTX, SBUX, SCHW, SO, T, TMUS, UBER, UNH, UPS,
USB, VZ, WMT.

### Worked examples (computed on the frozen calendar)

| Entry session (NY date of entryAt) | 30th XNYS session (due date) | Note |
|---|---|---|
| 2026-10-09 (Fri) | **2026-11-19** (Thu) | retrospective rows' factor session, if they had entered that day |
| 2027-01-04 (Mon) | **2027-02-17** (Wed) | latest possible entry → latest cohort maturity |

The 30 sessions after 2027-01-04: 01-05, 01-06, 01-07, 01-08, 01-11,
01-12, 01-13, 01-14, 01-15, 01-19 (MLK 01-18 holiday), 01-20, 01-21,
01-22, 01-25, 01-26, 01-27, 01-28, 01-29, 02-01, 02-02, 02-03, 02-04,
02-05, 02-08, 02-09, 02-10, 02-11, 02-12, 02-16 (Presidents Day 02-15
holiday), **02-17**.

## 5. Latest possible cohort maturity (equity)

**Equity outcome windows close: 2027-02-17, 16:00 ET (21:00 UTC)** —
Wednesday, a regular session (not an early close).

- Derivation: latest signal date 2026-12-31 → latest entry session
  2027-01-04 → 30th session after it = 2027-02-17. Span from the signal
  date: 48 calendar days.
- Note: this is **one day later than the audit's +47 backstop (2027-02-16)**.
  The +47 rule anchored on the signal date and missed the entry rule's
  session-hop across the New Year holiday weekend (entry lands 2027-01-04,
  not on/near 2026-12-31). The +47 substitution and the §9 conflict text
  (2027-01-30 vs 2027-02-16) are both superseded by this computation.

## 6. Readout date (computed, not chosen)

Equity's final outcome is due 2027-02-17 at 16:00 ET; the readout must
follow it. **Readout by: 2027-02-24** (Wednesday).

- Computed floor: 2027-02-18 — the first calendar day on which every
  equity horizon has matured.
- Adopted buffer: +7 calendar days after the final close (2027-02-17 →
  2027-02-24), mirroring the plan's prior convention (the old readout was
  7 days after the crypto close). This buffer — final-bar evidence pull
  and grading lag — is a stated **judgment call**; the anchor (2027-02-17)
  is not.

## 7. Crypto schedule — separate, unchanged

Crypto is graded under `crypto-evaluation-v5-corrected`: **"30 elapsed
days primary; checkpoints d5/d14/d30. Rows still open past the cap exit at
the cap (time_exit)"** — no exchange calendar needed (24/7 market).

- **Crypto outcome windows close: 2027-01-30** (Saturday) — last issuance
  2026-12-31 + 30 elapsed days. UNCHANGED by this correction.
- The cohort-wide readout (2027-02-24) follows the equity close, which is
  the binding constraint. Crypto's own 2027-01-30 close is untouched.
