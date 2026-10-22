# Reconciliation — the 09:00 ET (13:00Z) dossier longs, 2026-10-14

**Question:** what exactly were BTC id43, ETH id42, SUI id41 — radar candidates,
setup alerts, pending paper contracts, or verified paper entries?

**Answer: none of those. They are DOSSIER signals** — research/setup rows in the
crypto terminal's dossier signal tracker (`evaluationMethod
crypto-evaluation-v4-cohort-contract`, `factorSchemaVersion legacy-array-v0`),
created 2026-10-14T13:00:09–21Z. They are **NOT paper-pipeline issuances**.

## Per-ID reconciliation

| id | asset | dir | decision time (frozen) | entry (frozen) | inv | t1 | conf | entry-verification status |
|---|---|---|---|---|---|---|---|---|
| 41 | SUI | long | 2026-10-14T13:00:09Z | 1.032 | 0.926 | 1.19 | 52 | **NOT VERIFIED — no actionable entry.** Dossier row only; no paper contract, no venue-stamped print, no entry event. |
| 42 | ETH | long | 2026-10-14T13:00:10Z | 2,479.76 | 2,367 | 2,649 | 52 | **NOT VERIFIED — no actionable entry.** Dossier row only; no paper contract, no venue-stamped print, no entry event. |
| 43 | BTC | long | 2026-10-14T13:00:21Z | 82,805 | 80,076 | 86,899 | 52 | **NOT VERIFIED — no actionable entry.** Dossier row only; no paper contract, no venue-stamped print, no entry event. |

For each id, the negative checks (all verified 2026-10-14 ~18:30Z):
- **Radar candidate? NO.** Discovery run 58 (completed 10:26 EDT) emitted 0
  candidates; handoff qualified 0; the paper path never saw them.
- **Setup alert? NO.** `pilot/delivery/alert-delivery-ledger.json` `entries={}`;
  deployed `getpaperpilotstatus` `data.alerts=[]`. No alert was ever emitted.
- **Pending paper contract? NO.** Zero rows for these ids in paper `contracts` /
  `signals` / `candidates` tables (local) and zero candidates/signals/alerts in
  deployed status. No `actionable-entry-v1` contract exists for any of them.
- **Verified paper entry? NO.** A verified paper entry requires a venue-stamped
  first post-decision trade print inside the 15-minute entry window
  (`first-post-decision-binance-spot-trade`); none exists for any of the three.

## Explicit statement (Logan's direction)

**The existence of these three dossier signals does NOT establish that the
automatic paper pipeline worked.** The paper path is a separate population
with its own issuance machinery (discovery → handoff → `runpapersignalcycle` →
`actionable-entry-v1` contract → entry observation → alert). These three
signals never entered that pipeline: no candidate row, no contract row, no
entry observation, no alert. A dossier signal firing is evidence about the
dossier path only — it says nothing about the health, correctness, or output
of the automatic paper pipeline. Any claim that "the pipeline issued three
longs this morning" on the basis of ids 41/42/43 would be false.

## Population counts (kept separate — never pooled)

**DOSSIER signals (crypto tracker)** — 34 rows:
- 29 legacy measurement rows (ids 10–38; the graded population).
- 2 paper-cohort replay rows on local machinery (ids 39 S-long, 40 HYPE-short) —
  EXCLUDED from all legacy figures per the 2026-10-14 reclassification.
- 3 new dossier signals today (ids 41/42/43) — measurement rows; not paper issuances.

**PAPER pipeline (deployed artifact)** — 6 completed `runpapersignalcycle` runs
(ids 1–6), **0 candidates / 0 signals / 0 contracts / 0 alerts** across all of
them. Nothing manufactured, nothing pending.

**PAPER pipeline (local workspace mirror, `pilot/data/paper-pilot.sqlite`)** —
1 candidate / 1 signal / 1 contract / 2 alerts, all belonging to the single
Oct-13 BTC record `sig_53bb2a86d2e0fee1f3664812`, reclassified as a
market-data replay (fixture); its two alerts are `delivered-simulated` only.

**Audit classes (accepted baseline)** — 117 fixtures / 3 replays /
**0 verified deployed-natural entries**. The three dossier longs change none of
these numbers: they are not fixtures, not replays, and not deployed-natural
entries — they are a fourth thing (dossier measurement rows) that sits outside
the audit's paper classes entirely.

**Retrospective cohort** — 356 rows (10 crypto issued + 296 suppressed + 50
equity production-only). **Prospective file** (`comparison/rows/cohort-prospective-v2.csv`) —
header-only, 0 rows. First post-freeze opportunity: `none_yet`.

## Cross-population linkage (no double counting)

- ids 41/42/43 overlap in asset and window with existing paper/legacy records
  (e.g. BTC legacy longs ids 31/32/35/38). They are LINKED, not merged: each
  population keeps its own rows and its own denominators; the same opportunity
  is never counted twice across populations.
- Dossier signals must NOT silently enter the prospective paper cohort. Any
  cross-population use of a dossier row (e.g. as a paper candidate) must be
  explicit, labeled, and recorded — it never happens by id reuse or silent
  promotion.
- Labeling requirements for both paths: `pilot/delivery/LABELING-SPEC-2026-10-14.md`.
