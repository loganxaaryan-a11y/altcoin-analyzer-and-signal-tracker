# Production-vs-C-2 status — 2026-10-14 (Task E, ~18:10 UTC / 14:10 EDT)

Paper signals only. No tuning, no rebuild, no threshold/weight changes. C-2 stays shadow-only.

## 1. Freeze state (confirmed, not changed)

- **Comparison measurement freeze:** `v2.1.5` (ACTIVE — `comparison/ACTIVE_MANIFEST` →
  `comparison/freeze-manifest-v2.1.5.json`, `manifest_version` = `2.1.5`).
- **Deployed paper series:** `paper-pilot-v2.1.0` (self-reported by deployed artifact;
  frozen 2026-10-14T04:54:12.629Z). Mapped to comparison v2.1.5 per
  `comparison/VERSION-MAPPING-2026-10-14.md` (verdict: VALID as of 2026-10-14).
- The two series are mapped, never merged; prospective rows stamp `2.1.5` only.
- Post-freeze cutoff: **2026-10-14T04:57:00Z** (unchanged since v2.1.0). Collection
  window: 2026-10-14 → 2026-12-31 UTC.

## 2. Prospective counts (all zeros — stated plainly)

| Metric | Value | Source |
|---|---|---|
| Independent post-freeze opportunities | **0** | `rows/cohort-prospective-v2.csv` still **header-only** (1 line, verified 18:10Z) |
| Completed outcomes | **0** | same |
| Directional accuracy | n/a (0/0) | same |
| Net returns after costs | n/a | same |

- Collector runs today (scheduled 6h spec): Runs 1–4, latest **Run 4 at 17:44Z** under
  active freeze v2.1.5 — 0 rows added every run; all deduped (60) or 0-row healthy runs.
- Deployed paper path: latest deployed run 15:09:25Z, all runs 0 candidates / 0 issued —
  "No directional discovery candidate was available for the explicit paper path;
  no signal was manufactured."
- First-post-freeze marker: `rows/first-post-freeze-opportunity-2026-10-14.json` =
  `none_yet`. No natural post-freeze candidate has occurred yet.
- Retrospective stays frozen and excluded from prospective metrics; suppressed-stream
  ingest (296 candidates) remains OFF pending parent/Logan's call (collection-run-log
  open item #1).

## 3. Retrospective cohort — counts stand

- `rows/cohort-retrospective-v2.csv`: **357 lines = header + 356 rows**, counted live:
  - 10 crypto issued
  - 296 crypto suppressed (abstain cohort, appended per v2.1.0 consolidation)
  - 50 equity production-only (unscored)
- `metrics.py` exclusion list intact: synthetic fixtures / market-data replays /
  sandbox dry-runs excluded from all performance statistics (exclusion markers at
  `metrics.py` ~L64–168); measurement-excluded rows contribute to NO statistic.

## 4. VERSION-MAPPING extension note (extension needed — freeze NOT changed)

The mapping doc is stale in one respect and needs an **extension section**
(it does not currently have one — do not rewrite or re-version the freeze):

- Mapping asserts the **deployed freeze `paper-pilot-v2.1.0`** ↔ comparison **v2.1.5**,
  with §3.1 hashes and §4 rule assertions written against the deployed-side sources
  as of the 04:54Z freeze.
- The workspace issuance handler has since moved through a correction series —
  **v2.1.6** (min-score `|score|` floor fix; all 43 equity shorts previously rejected
  on a sign artifact now pass the floor), **v2.1.7** (first-print fidelity repair;
  stale first print → named non-entry instead of silent substitution), **v2.1.8**
  (history-coverage proof), **v2.1.9** (venue trade-id preservation + sequence
  tiebreak) — documented in `comparison/MANIFEST-NOTE-*-v2.1.{6,7,9}.md`. The notes
  assert no prediction weights, factors, scoring formulas, levels, veto semantics,
  entry rules, or evaluator versions changed; the v2.1.6 note honestly records the
  min-score gate behavior DID change for shorts (bug correction, value stays 0).
- Gap to resolve in the extension: the mapping's §3.1 recorded `handler.ts` hash
  (`b43a…393b`) predates the v2.1.6–v2.1.9 corrections, and whether the deployed
  paper artifact runs the corrected handler or still the frozen v2.1.0 machinery is
  **unverifiable from the workspace** (platform-hosted; self-reported
  `freezeVersion` still reads `paper-pilot-v2.1.0`).
- Recommended extension content (for the mapping doc, NOT the freeze):
  record the v2.1.6–v2.1.9 handler correction series, state which of R1–R6 each
  correction touches (R1 entry-window/expiry semantics: v2.1.7; R3 venue mapping:
  v2.1.9 print identity; min-score gate: v2.1.6 — a deployed-side behavior correction),
  re-run the `test_version_mapping.py` regression against the current workspace
  sources, and document whether the deployed artifact's self-reported build
  identifiers have moved off `paper-pilot-v2.1.0`. If the deployed side has absorbed
  the corrections, the mapping needs re-assertion against them (still as an extension —
  the v2.1.5 comparison freeze itself must not be edited in place per its
  immutability rule).

## 5. Equity 42 window check — 18:10 UTC, all still pending

- Export: `quarantine/2026-10-14/equity-42-window-export-2026-10-14.v1.csv`
  (43 lines = header + 42 rows; all 42 rows `STILL-PENDING`, counted live).
- Windows (per-setup, fixed at original terms): **2026-10-14T13:30:00.000Z →
  2026-10-14T20:00:00.000Z** on all 42. Current time 18:10:56Z — windows still open.
- **Pending: 42. Expired: 0.** No roll-forward, no extension — the lapsed reason code
  (`entry-window-lapsed`) is defined but unused. Next meaningful evaluation is after
  2026-10-14T20:00:00Z (all windows close); no scheduled re-evaluation is installed.
- Quarantine remains ACTIVE per `quarantine-record-equity-42.md` — all 42 stay out of
  every live performance claim regardless of window status.

## 6. Blocker reconfirmation (still gating — unchanged since 09:00Z)

1. **Deployed scan (a): NOT MET.** The resumable equity scan is still not deployed on
   the live equity artifact; `runAutomatedScan` remains broken/timing-out. Durable fix
   needs the artifact builder (resumable batch args) — a capability this session lacks;
   needs an eligible session (parent/root).
   Evidence: `quarantine/2026-10-14/deployed-scan-status-2026-10-14.v1.md`.
2. **Opening-print venue feed (b): NOT MET.** No genuine consolidated-tape
   opening-print observer exists for equity entries; `ScriptedFeed` is the only
   `VenueFeed` implementation. Building/wiring it is outside this task's bounded
   scope and is wired nowhere today.
   Evidence: `quarantine/2026-10-14/venue-feed-status-2026-10-14.v1.md`.

## Headline

- Freeze: comparison **v2.1.5** active, mapped to deployed `paper-pilot-v2.1.0` — unchanged.
- Prospective: **0 opportunities / 0 outcomes / accuracy n/a / returns n/a** — vessel header-only.
- Retrospective: **356 rows** (10 issued + 296 suppressed + 50 equity production-only) — unchanged; fixtures/replays excluded from metrics.
- VERSION-MAPPING needs an **extension section** recording the workspace handler
  v2.1.6–v2.1.9 correction series and re-asserting R1–R6 (freeze itself untouched).
- Equity 42: **42 pending / 0 expired** at 18:10 UTC; both blockers (deployed scan,
  opening-print feed) still gating.
