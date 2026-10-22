# Operational Metrics Dashboard — 2026-10-14

**Snapshot time:** 2026-10-14 ~14:40 EDT (18:40 UTC). **Scope:** paper signals only, no brokerage.
**Governing ruling (expert):** zero issuance is an *operational observation*, not accuracy evidence.
This dashboard reports candidate coverage, issuance rate, delivery delay, completed outcomes, and net
performance **alongside** hit rate. **No gates were loosened to produce activity.** Every number below
carries its source record; a number without a source was not reported.

## Populations — never pooled

| Population | What it is | Key record |
|---|---|---|
| P1 — Deployed paper pipeline (prospective) | Automatic discovery → handoff → `runpapersignalcycle` → contract → alert, under the frozen v2.1.x rules | `comparison/live-paper-status-2026-10-14T1744Z.json` |
| P2 — Retrospective paper cohort | 356 rows: 60 pilot + 296 suppressed-stream; ALL decided before any freeze existed | `comparison/rows/cohort-retrospective-v2.csv` |
| P3 — Audit classes (fixtures/replays) | 120 audited paper entry rows: 117 fixtures / 3 replays / 0 verified deployed-natural | `audit/CLASSIFICATION-CORRECTION-2026-10-14.md` |
| P4 — Dossier path, legacy graded | Terminal dossier tracker rows (equity + crypto) graded in the daily signal-accuracy pass | `~/workspace/goals/research-terminal/hidden_files/signal-accuracy/signal-accuracy-2026-10-13.md` |
| P5 — Dossier path, new dossier-cohort-v1 | 3 dossier measurement rows from today 09:00 ET (ids 41/42/43) — NOT paper issuances | `dispositions/reconciliation-0900-dossier-longs-2026-10-14.md` |
| P6 — Workspace sandbox | Local VM machinery, simulated feeds/acks — excluded from all measurement populations | `equity-discovery/README.md` (status: sandbox) |

---

## A. Paper path — deployed automatic pipeline (P1)

### A1. Candidate coverage (discovery → handoff, 2026-10-14)

| Discovery run | Completed (UTC) | Candidates emitted | Scored (factor ledger) | Handoff qualified | Handoff abstained | Handoff deferred | Handoff failed | Source |
|---|---|---|---|---|---|---|---|---|
| 56 | 02:26:13 | 0 | 0 rows | 0 | 0 | 0 | 0 | `handoff/inbox/discovery-2026-10-14T02-26-13-665Z.json`, `handoff/evidence/handoff-report-56.json` |
| 57 | 08:26:14 | 0 | 0 rows | 0 | 0 | 0 | 0 | `handoff/inbox/discovery-2026-10-14T08-26-14-095Z.json`, `handoff/evidence/handoff-report-57.json` |
| 58 | 14:26:14 | 0 | 0 rows | 0 | 0 | 0 | 0 | `handoff/inbox/discovery-2026-10-14T14-26-14-449Z.json`, `handoff/evidence/handoff-report-58.json`, `OPERATIONAL-TRACE-2026-10-14.md` |
| **Total** | | **0** | **0** | **0** | **0** | **0** | **0** | |

- Run 58 is fully traced end-to-end (discovery → handoff → paper cycle → collector), every hop fired on schedule and recorded the emptiness faithfully; nothing was manufactured (`OPERATIONAL-TRACE-2026-10-14.md`).
- Genuine gap: the terminal's **internal** suppression screen for run 58 (how many directional candidates were screened out before the 0-candidate payload) is not visible from any accessible artifact; deployed run rows expose no suppression-count field and this seat has no `artifact.invoke_action` tool. The manual handoff of run 56 recorded a single note — "9 directional candidates failed issuance controls and were suppressed" (unclassified by gate) — no equivalent note exists for runs 57/58.
- **Today: no paper alerts emitted.** `pilot/delivery/alert-delivery-ledger.json` `entries={}` — unchanged since initialization 2026-10-14T00:00:00Z. Deployed delivery config: `configured:false`.

### A2. Paper-cycle runs (deployed `runpapersignalcycle`)

| Run id | Discovery run | Candidates | Issued | Abstained | Deferred | Status | Source |
|---|---|---|---|---|---|---|---|
| 1 | 56 | 0 | 0 | 0 | 0 | complete | `live-paper-status-2026-10-14T1744Z.json` |
| 2 | 56 | 0 | 0 | 0 | 0 | complete | same |
| 3 | 56 | 0 | 0 | 0 | 0 | complete | same |
| 4 | 57 | 0 | 0 | 0 | 0 | complete | same |
| 5 | 57 | 0 | 0 | 0 | 0 | complete | same |
| 6 | 58 | 0 | 0 | 0 | 0 | complete | same; traced in `OPERATIONAL-TRACE-2026-10-14.md` |
| **Total** | | **0** | **0** | **0** | **0** | 6/6 complete | |

- Deployed summary on every run: *"No directional discovery candidate was available for the explicit paper path; no signal was manufactured."*
- **Issuance rate: 0 issued / 0 candidates** — no issuance occurred; the rate is undefined (0/0), not 0%. Zero issuance is an operational observation, not accuracy evidence (expert ruling).
- Per-gate rejection counts for today's runs: **n/a** — no candidates reached any gate. (Pre-filter rejection export: not present for the deployed runs.)

### A3. Delivery delay (P1)

| Metric | Value | Source |
|---|---|---|
| Alerts emitted today | 0 | `pilot/delivery/alert-delivery-ledger.json` (`entries={}`); deployed `data.alerts=[]` |
| Decision → send → ack latency | **n/a** — nothing emitted, nothing to time | — |
| Alert worker last sweep | 2026-10-14T18:05:47Z status: deployed stream alerts `[]`, candidates `[]` | `pilot/delivery/worker-runs/status-2026-10-14T18-05-47Z.json` |

Only prior alert-adjacent activity: a labeled manual **routing TEST** (assistant-msg-630a9f81…, recorded in `delivery-config.json`, not the ledger) and the Oct-13 Class-B BTC replay whose two alerts were `delivered-simulated` only (P3, excluded).

### A4. Completed outcomes / hit rate / net performance (P1)

| Metric | Value | Source |
|---|---|---|
| Prospective cohort rows | 0 (file header-only) | `comparison/rows/cohort-prospective-v2.csv` (1 line) |
| First post-freeze opportunity | `none_yet` | `comparison/first-post-freeze-opportunity-2026-10-14.json` |
| Settled 5D/14D/30D outcomes | **0** | prospective file empty; `audit/measurable-baseline-2026-10-14.md` |
| Measurement-eligible entries | **0** | same |
| Hit rate | **n/a** — no eligible entries | same |
| Net performance (18 bps) | **n/a** — no outcomes | same |

---

## B. Paper path — retrospective cohort (P2, kept separate)

File: `comparison/rows/cohort-retrospective-v2.csv` — **356 rows** (60 pilot + 296 suppressed-stream).
All decisions 2026-10-10 → 2026-10-14T02:23:07Z, **before** v1.0.0 freeze (2026-10-14T02:42:57Z); `decision_time_verified=false` on all 356; `applicable_freeze=none-predates-freeze`; prospective provenance cannot be established (`MEASUREMENT-GAPS-2026-10-14.md` verdict (a)).

### B1. Coverage / issuance (retrospective)

| Metric | Value | Source |
|---|---|---|
| Total candidates | 356 | cohort file row count |
| Scored vs unscored | prod arm scored 306 (10 issued + 296 abstain) / 50 unscored; C-2 arm unscored 346/346 (50 equity `not-applicable:no-challenger-frozen`, 296 suppressed `unscored:no-factor-ledger`) | counted from CSV `prod_disposition` |
| Issued | 10 (crypto) | CSV |
| Unscored: production-not-issued | 50 (equity radar candidates; scan-level `issuedCount=0` — production never issued them) | CSV; `COHORTS-2026-10-14.md` |
| Abstained | 296 (suppressed stream) | CSV |
| Issuance rate (prod arm) | **10 / 306 scored candidates = 3.27%** | computed; denominators in CSV |

### B2. Per-gate rejection counts (296 suppressed candidates)

| Gate (suppression reason) | Count | Source |
|---|---|---|
| `abstain:born-dead` | **218** | `COHORTS-2026-10-14.md` (deterministic dry-run reproduction) |
| `abstain:issuance-validation-unavailable` | **76** | same |
| `abstain:short-regime-gate` | **2** | same |
| **Total** | **296** | |

No factor ledger was persisted for suppressed candidates (`no-factor-ledger`), so the challenger arm is unscored on all 296.

### B3. Delivery / outcomes / hit rate / net (P2)

| Metric | Value | Source |
|---|---|---|
| Alerts emitted | n/a — retrospective cohort; no alert path existed for these rows ("suppressed before contract creation; no alert path reached") | per-row CSV `provenance` notes |
| Settled 5D/14D/30D outcomes | **0 graded** — all outcome columns blank (`not-graded`); "sandbox-seeded rows carry no outcomes; outcomes are graded forward under the frozen evaluator versions" | counted from CSV; per-row notes |
| Hit rate | **not computed** — retrospective, no prospective provenance; pooling it with P1 would manufacture a baseline | `COHORTS-2026-10-14.md`, expert loop terms |
| Net performance (18 bps) | **n/a** — no graded outcomes | same |

---

## C. Paper path — audit classes (P3, kept separate)

From `audit/CLASSIFICATION-CORRECTION-2026-10-14.md` (120 audited paper entry rows; accepted baseline; exclusion list `audit/exclusion-list-v3-2026-10-14.json`, 120 excluded / 0 eligible):

| Class | Records | Unique opportunities |
|---|---|---|
| A — synthetic fixtures | 117 | 47 |
| B — market-data replays / sandbox executions | 3 | 1 (all three rows are `sig_53bb2a86d2e0fee1f3664812`: `paper-pilot.sqlite`, `paper-pilot-dryrun.sqlite`, `sched-demo.sqlite`) |
| C — verified deployed-natural entries | **0** | 0 |
| **Measurement-eligible** | **0** | |
| **Completed outcomes** | **0** | **No hit rate, expectancy, or R statistic is computable** |

- The Oct-13 BTC entry `sig_53bb2a86d2e0fee1f3664812` was reclassified Class C → Class B (expert ruling): local VM replay through sandbox machinery, sandbox file outbox, **simulated acks** (`"simulated": true`). Its alerts do not count as delivered.
- Delivery delay for P3: n/a — no real delivery occurred; acks were simulated, not delivered.

---

## D. Dossier path — legacy graded population (P4, kept separate)

Source: `~/workspace/goals/research-terminal/hidden_files/signal-accuracy/signal-accuracy-2026-10-13.md` (daily pass 2026-10-13; first-touch ordering, both terminals).

### D1. Candidate coverage (dossier discovery)

| Metric | Value | Source |
|---|---|---|
| Equity scan 2026-10-13 (`getradar`) | universe scanned **101**, excluded **0**, signalCount **50** | signal-accuracy-2026-10-13.md |
| Equity withheld by issuance validation | **2** (TMUS −100, DE −100) | same |
| Equity ≥±90 qualifiers | **4** (VEDL.NS −95, RELIANCE.NS −95, HD −95, MU +95) | same |
| Crypto catch side, 8 sessions | runner recall **1/51 (2.0%)**; 2/4 unique equity | same |
| Crypto 2026-10-13 | **8 scored qualifiers, all suppressed** — "the discovery pipeline finds movers it structurally cannot call" | same |

### D2. Completed outcomes + hit rate (dossier tracker)

| Metric | Value | Source |
|---|---|---|
| Tracked rows | **79** (50 equity ids 3–52 + 29 crypto ids 10–38) | same |
| Completed outcomes (definitive) | **60** — HIT 12, MISS 48 (OPEN 17; AMBIGUOUS 2 excluded; STALE 0; UNVERIFIED 0) | same |
| Combined hit rate | **12/60 = 20.0%** (n=60 — still noise) | same |
| Equity hit rate | **9/38 = 23.7%** | same |
| Crypto hit rate | **3/22 = 13.6%** | same |
| High-conviction −85/−95 short band | **0/10** | same |
| By direction: long 9/37 = 24.3%; short 3/23 = 13.0% | same |
| Equity longs 7/16 = 43.8%; equity shorts 2/22 = 9.1% | same |
| Crypto longs 2/21 = 9.5%; crypto shorts 1/1 (BTC id18, the only non-same-day crypto win) | same |

- Newly closed 2026-10-13: 4 closes, all misses (equity id27 6411.TWO −1.91%; crypto id34 STRK −20.74%; ids 36/37 crypto misses).

### D3. Net performance (net of 18 bps; v3-definitive subset, n=56 — label the filter)

| Group | n | Target-before-stop | d5 directional acc (n) | d14/d30 | Avg win R | Avg loss R | Expectancy R | Source |
|---|---|---|---|---|---|---|---|---|
| Crypto | 22 | 13.6% | 22.2% (18) | n/a (0/0) | +1.43 | −1.05 | **−0.71** | same, §D3 |
| Equity | 34 | 26.5% | 26.5% (34) | n/a (0/0) | +1.44 | −1.06 | **−0.40** | same, §D3 |
| Baseline (56 bets) | mean −2.22% | **total −124.0%** | | | | | | same |
| Signal, de-duplicated (41) | mean −1.89% | **total −77.6%** | | | | | | same |

Costs (18 bps) are in all figures. Note: §D3 is the v3-definitive subset (56 rows); the headline hit rate (§D2) is n=60 — filters differ, both reported as labeled. Loss autopsy (44 definitive misses): **zero stop-before-recovery across all 44 evaluable losses** (19/19 crypto losses are longs; 18/25 equity losses are shorts).

---

## E. Dossier path — new dossier-cohort-v1 (P5, kept separate)

Today 09:00 ET (13:00Z) crypto dossier signals — **dossier measurement rows, NOT paper issuances**
(`dispositions/reconciliation-0900-dossier-longs-2026-10-14.md`, `dispositions/stale-candidate-disposition-2026-10-14.md`):

| id | Asset | Dir | Entry (frozen) | Inv | T1 | Conf | Decision (UTC) | d5 / d14 / d30 | Source |
|---|---|---|---|---|---|---|---|---|---|
| 41 | SUI | long | 1.032 | 0.926 | 1.19 | 52 | 2026-10-14T13:00:09Z | 10-19 / 10-28 / 11-13 | reconciliation doc |
| 42 | ETH | long | 2,479.76 | 2,367 | 2,649 | 52 | 2026-10-14T13:00:10Z | 10-19 / 10-28 / 11-13 | reconciliation doc |
| 43 | BTC | long | 82,805 | 80,076 | 86,899 | 52 | 2026-10-14T13:00:21Z | 10-19 / 10-28 / 11-13 | reconciliation doc |

| Metric | Value | Source |
|---|---|---|
| Dossier candidate denominator for today's 3 | **not recorded** — terminal dossier scan internals not visible here | reconciliation doc |
| Entry-verification status | **NOT VERIFIED — no actionable entry** (no paper contract, no venue-stamped print, no entry event) | `stale-candidate-disposition-2026-10-14.md` |
| Named non-entry | `non-entry:no-paper-contract-issued` on all three | same |
| Completed outcomes | **0** (all OPEN; d5 checkpoint 2026-10-19) | same |
| Hit rate / net performance | **n/a** — no completed outcomes | — |

Explicit direction: the existence of these three signals does **not** establish the paper pipeline worked — they never entered it (no candidate row, no contract row, no entry observation, no alert). Any claim that "the pipeline issued three longs this morning" on their basis would be false.

---

## F. Workspace sandbox (P6 — excluded from ALL measurement populations)

- Equity scan 2026-10-14 (workspace, status: **sandbox**): universe 101, **qualified 85, scored 16, failed 0, skipped 0** (`equity-discovery/state/accounting-2026-10-14.json`).
- Equity→paper handoff 2026-10-14 (sandbox, ScriptedFeed, simulated acks): 85 candidates → **42 issued / 43 rejected by the min-score gate** (`equity-discovery/handoff/handoff-report-2026-10-14.md`).
- Excluded per the audit classes (P3) — fixtures/replays are not measurement evidence.

---

## Cross-population notes

1. **No double counting.** ids 41/42/43 overlap in asset/window with legacy records (e.g. BTC longs ids 31/32/35/38) — they are LINKED, not merged (`reconciliation-0900-dossier-longs-2026-10-14.md`).
2. **The 12/60 dossier hit rate says nothing about the paper pipeline** (expert: zero issuance is operational, not accuracy). P1's prospective accuracy starts at 0 completed outcomes and accumulates only from future verified deployed-natural entries (`audit/measurable-baseline-2026-10-14.md`).
3. **Collection is wired but empty:** collector runs 1–4 completed healthy; prospective vessel stays header-only (`comparison/collection-run-log-2026-10-14.md`); equity maturity = 30 XNYS sessions after each actual entry; crypto close 2027-01-30.
4. **If new signals print ~40% or worse, the strategy gets rebuilt, not the measurement** (signal-accuracy verdict rule, 2026-10-13). Current combined baseline: 20.0% (12/60).

## Known gaps (honest, not backfilled)

- G1: Internal suppression count for discovery run 58 — not visible in any accessible artifact (deployed rows expose no suppression-count field; no `artifact.invoke_action` in this seat). Run 56's manual note ("9 directional candidates failed issuance controls and were suppressed") has no equivalent for runs 57/58.
- G2: Dossier crypto candidate denominator for today's 3 dossier rows (P5) — not recorded.
- G3: Delivery latency (decision → send → ack) for real paper alerts — unmeasurable until a real alert is emitted; the ledger is empty by design, not by outage.
