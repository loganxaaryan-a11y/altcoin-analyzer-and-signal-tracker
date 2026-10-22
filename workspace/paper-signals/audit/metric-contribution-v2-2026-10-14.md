# Metric-contribution report — which audited records fed displayed metrics (2026-10-14)

**Scope:** which of the 120 audited paper-entry records *ever contributed to a displayed performance metric*, where it was displayed, which records fed it, and the corrected value. Search covered `~/workspace/goals/research-terminal/`: dashboards, reports, messages, CSVs, chat-visible claims, JSON ledgers, demo/acceptance docs, delivery audits.

**Headline:** no hit rate, expectancy, or outcome-based figure was ever computed from these records — there are no completed outcomes on any of the 120 rows (verified: no outcome/close/settle/exit/pnl keys in any audited contract). What exists are *count/issuance claims* built from the fabricated rows. Those are itemized below; every one is corrected to **withdrawn** or **deduped**.

## 1. "Outcome mix: {"issued":42,"rejected":43}" — handoff report claim (CORRECTED: WITHDRAWN)

- **Metric as displayed:** `equity-discovery/handoff/handoff-report-2026-10-14.md` — summary line `Outcome mix: {"issued":42,"rejected":43}` plus a per-row table marking all 42 symbols `status=issued` with `entryObservedAt=2026-10-14T13:30:00.000Z` and contract IDs.
- **Records that fed it:** the 42 equity-discovery rows (Class A), signal IDs `sig_2e6b7e006aa1436a1271ffc6` … `sig_ba1d012f5eee319849178128` (full list in `quarantine/2026-10-14/equity-42-id-table.csv`).
- **Why it was wrong:** the "issued/entered" state was stamped by a scripted handoff run with a `ScriptedFeed`-style fixed stamp — `entryObservedAt` identical across all 42 rows, written ~6h before the entry window opened; no genuine venue print was ever observed.
- **Corrected value:** **withdrawn.** None of the 42 may be counted as issued/entered in any performance measurement. Reclassification v2 (`reclass-42-longs-2026-10-14.v2.csv`) stands: **42 → STILL-PENDING**, 0 expired at audit time. The quarantine record (`quarantine/2026-10-14/quarantine-record-equity-42.md`) already superseded this document; this report records the metric correction formally. Any measurement harness reading the handoff report must treat the 42 as STILL-PENDING (quarantined), never entered.
- **Machine-readable:** all 42 are on `audit/exclusion-list-v2-2026-10-14.json` with reason `fabricated-synthetic-fixture`.

## 2. Watcher-demo "processed=1 → issued" — duplicate-issuance presentation (CORRECTED: DEDUPED)

- **Claim as displayed:** `scheduling/watcher-demo/DEMO-VERDICT-2026-10-14.md` — Phase B table: `processed=1 → issued`, `Outcome commit → signal sig_53bb2a86d2e0fee1f3664812; entry alert enqueued+delivered`.
- **Records that fed it:** the 1 watcher-demo re-issue row (Class B, `scheduling/watcher-demo/data/sched-demo.sqlite`), contract `ct_53bb2a86d2e0fee1f36648122134e684` — the same contract id and signal id as the live Class C entry.
- **Why it matters:** this is a second "issued" presentation of the *same opportunity* (same signal_id, same contract_id), produced by a demo harness. It is a functional resume-mechanics demo claim, not a performance metric — but if any metric counts "issued entries", it would double-count the BTC opportunity.
- **Corrected value:** **deduped to one opportunity.** For prediction statistics only the live Class C row (`pilot/data/paper-pilot.sqlite`) counts; the re-issue is on the exclusion list with reason `duplicate-or-sandbox-execution`.

## 3. Dryrun "issued" — pilot README/operational evidence (CORRECTED: DEDUPED, no display change needed)

- **Claim as displayed:** `pilot/README.md` ("Evidence (this run): `evidence/dryrun-1.jsonl` — … candidate 53bb2a86… → issued") and `pilot/TERMINAL-RUNTIME-EVIDENCE-2026-10-14.md` class-(a) sandbox evidence.
- **Records that fed it:** the 1 dryrun row (Class B, `pilot/data/paper-pilot-dryrun.sqlite`), same signal_id and contract_id as the live entry.
- **Assessment:** honestly labeled as a dry-run cycle throughout; not a performance-metric claim. No display correction needed — but the row is on the exclusion list (`duplicate-or-sandbox-execution`) so measurement code can never count the BTC opportunity twice.

## 4. Items checked and found NOT to be performance metrics fed by these records

- `demo/demo-report.md` and `demo/integrated-demo-log-2026-10-13.md` — PASS/FAIL *acceptance* claims for the 74 sandbox demo rows (Class A). These assert pipeline mechanics (issuance ordering, veto gates, replay idempotency) with explicit sandbox provenance; they compute no hit rates or outcome figures. Remain valid as functional evidence; the underlying rows stay excluded from measurement.
- `pilot/TERMINAL-RUNTIME-EVIDENCE-2026-10-14.md` — reports evidence in labeled sandbox vs deployment classes (including the 41.7s detection→alert timing on the kill-test demo). Operational evidence with honest labeling; no performance metric.
- `hidden_files/signal-accuracy/*` and `comparison/` retrospective files (e.g. the 58/118 exploratory result) — signal-level retrospectives of production signals; predate the paper-entry program and were not computed from these 120 rows (v1 audit note confirmed).
- `comparison/MANIFEST-NOTE-min-score-abs-floor-v2.1.6.md` — replays the 43 rejected equity shorts in a `:memory:` sandbox (nothing persisted, no audit rows produced) and explicitly labels it "sandbox-verification evidence of the gate fix only". Not a performance metric; no display correction needed.
- `pilot/delivery/alert-delivery-ledger.json` — chat-delivery book of record; entries empty (`"entries": {}`), so no delivery count metric exists from these records.
- `pilot/evidence/alert-outbox-*/`, cycle JSONL files — operational alert outbox evidence, no aggregated metrics.

## Forward rule (for measurement code)
Consume `audit/exclusion-list-v2-2026-10-14.json`: drop any record matching `(signal_id, contract_id, store_path)` before computing any performance statistic. The only measurement-eligible entry from this audit is the Class C BTC long (`sig_53bb2a86d2e0fee1f3664812`, `pilot/data/paper-pilot.sqlite`); it has **no completed outcome yet** (still entered), so no hit rate is computable from the eligible set either. Prospectively, measurement must use only post-freeze deployed records per the v2.1.x rules — the v1 exclusion semantics carry forward unchanged.
