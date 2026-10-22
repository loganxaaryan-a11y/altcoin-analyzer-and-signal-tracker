# Collector separation proof — the 6-hour collector is ANALYSIS-ONLY

**Date:** 2026-10-14. **Claim:** `paper-signal-comparison-collection`
(interval@6h, runs `comparison/collect_pilot_rows.py`) performs analysis
export ONLY. It does NOT control entry observation or alert timing. Entry/alert
timing is driven by the watcher schedule (`paper-entry-watcher`, interval@5m)
plus venue prints and alert-channel acks.

**Verified:** 2026-10-14 by inspection + the automated test
`tests/test_collector_separation.py` (all assertions passed — see §5).

---

## 1. What the collector touches

| Access | Target | Mode | Effect on entry/alert timing |
|---|---|---|---|
| SQLite open | workspace DB copy (`CRYPTO_DB`, `~/workspace/ts-spaces/altcoin-analyzer-and-signal-tracker/app.db`) | `mode=ro` read-only URI (lines 765, 810) | none — read-only |
| JSON read | live paper export (`live-paper-export-*.json`, from deployed `getpaperpilotstatus`) | read | none |
| JSON read | equity factor ledgers (`research/factor-ledgers-*.json`) | read | none |
| CSV write | prospective vessel `rows/cohort-prospective-v2.csv` | write | none — analysis record only |
| Markdown append | `collection-run-log-2026-10-14.md` | append | none — run log |

**Zero references** to the operational paper store: `grep` for
`paper-pilot.sqlite`, `pilot/data`, `PILOT_DB` in `collect_pilot_rows.py`
returns nothing. The collector cannot even address the DB that holds pending
contracts and alert rows.

## 2. What the collector imports (static import graph)

`collect_pilot_rows.py` imports: `csv, json, os, sqlite3, sys, collections,
datetime` + `harness` (scoring: `score_batch`, `ROW_COLUMNS`, `REASON`,
`LookaheadError`, …) + `live_paper_stream` (export-file adapter, read-only).

It does NOT import: `orchestrator` / `issuance/handler` / `DbStore` /
`entry-v1` / `watcher` / `pilot` / `deps` / `transport` / `deliverAlert` /
anything under `paper-signals/pilot/`, `paper-signals/orchestrator/`, or
`paper-signals/entry-v1/`. There is no code path from the collector to
`observeEntry`, `resumeAwaitingEntry`, `integratedTick`, alert enqueue, or
alert delivery. (Asserted by the test — §5.)

## 3. Timing-direction proof (the collector cannot cause an alert)

The alert-timing chain (persisted, per-signal):

```
venue print ts → watcher poll → observeEntry (eventRecordedAt) →
outcome commit → entry alert ENQUEUED (enqueuedAt) → transport delivers →
DELIVERED (deliveredAt, only on real ack)
```

The collector's eligible stream is built from **completed rows only**: the
live export carries signals with `issuedAt`/`alertedAt` already set, or the
workspace DB copy's `generated_signals`. A comparison row is appended at
collector-run time T+≤6h for an alert delivered at T. The row cannot precede
the alert: the collector reads timestamps it did not create, and its only
writes are the comparison CSV + run log. **Causality runs alert → collector,
never collector → alert.**

Negative controls:
- Disable the collector → entry observation and alert delivery continue
  unchanged (nothing in the watcher/alert path reads the collector's outputs).
- Stop the watcher ticks → pending contracts lapse to `void_expired` when
  their windows close and no entry alerts fire — the watcher cadence is the
  causal lever for entry/alert timing, not the collector.

## 4. Scheduling-layer consequence

- Entry/alert timing budget: watcher tick every 5m + poll 20s → max
  undetected entry latency ≈ 5m + feed latency, inside the 15-min window.
- Collector timing budget: 6h → first post-freeze opportunity appears in the
  comparison vessel within 6h of issuance. This is ANALYSIS latency only.

## 5. Automated test

`tests/test_collector_separation.py` — run 2026-10-14, all passed:

1. **Static:** `collect_pilot_rows.py` imports no operational module
   (orchestrator/handler/watcher/pilot/alert/DbStore/integratedTick/
   resumeAwaitingEntry/deliverAlert).
2. **Static:** no reference to the pilot paper DB path anywhere in the
   collector or its local imports (`harness.py`, `live_paper_stream.py`).
3. **Static:** every `sqlite3.connect` in the collector uses a read-only URI
   (`mode=ro`).
4. **Behavioral:** sha256 of all live paper DBs
   (`pilot/data/paper-pilot.sqlite`, `pilot/data/paper-pilot-dryrun.sqlite`)
   and the alert-outbox tree are IDENTICAL before and after a real
   `collect_pilot_rows.py --dry-run` execution — the collector run did not
   touch operational state.
5. **Behavioral:** the collector's filesystem writes during the run were
   confined to `comparison/` analysis artifacts (vessel CSV is untouched in
   dry-run; nothing written outside `comparison/`).

To re-run: `cd ~/workspace/goals/research-terminal/paper-signals/scheduling && python3 tests/test_collector_separation.py`
