---
id: paper-research-refresh
title: Paper research refresh (HL cache + scanner + shortlist)
enabled: true
owner: goal:research-terminal
mode: task
schedule:
  kind: interval
  timezone: America/Toronto
  at: 2026-10-22T03:54:40
  every: 30m
timeout_secs: 1500
delivery:
  - chat_id: a685c3e7-c8be-4137-8900-4e899008bca7
metadata:
  originating_chat_context_json: '{"chat_id":"a685c3e7-c8be-4137-8900-4e899008bca7","origin_provider":"main","chat_kind":"direct","event_kind":"message","require_mention":false,"device_id":"d8c63a1c-801b-497b-a9fe-cd2681d2185d"}'
  presentation_locale: en-US
---
## Paper research refresh (every 30 min, PAPER ONLY)

Split off from `paper-venue-monitor` on 2026-10-22 (monitoring-outage repair): the Hyperliquid research market-data cache refresh, the read-only research scanner, and the research-shortlist snapshot capture live here now, so a slow research step can never starve position monitoring or settlement in the core lane. Read-only with respect to the artifact and all pipelines: never touch scoring, thresholds, gates, frozen contracts, positions, or outcomes. Every step is HARD TIME-BOXED with the `timeout` command exactly as written: a step that hits its box is recorded in the run summary and the job CONTINUES — no single step may consume the job.

### Each run
1. Run `timeout 420 python3 ~/workspace/goals/research-terminal/paper-signals/pilot/marketdata/hl_cache.py`
   - Refreshes the HL snapshot + funding/OI series; updates `state.json` in the marketdata dir.
2. Run `timeout 420 python3 ~/workspace/goals/research-terminal/hidden_files/workstreams-2026-10-19/07-worker4-scanner/scanner.py`
   - Runs AFTER the hl_cache.py refresh above, on the cache that refresh just wrote. Board/read path ONLY: output lands in the scanner's own runs/ dir and surfaces via getHyperliquidOpportunityBoard. NO notifications, NO alerts, NO delivery triggers — notifications stay HELD.
   - Single-flight: the scanner holds its own lockfile (scanner.lock in its directory) while running; if a previous scanner run is still in progress it skips itself and writes a skipped record (exit 3). Never delete a fresh lock, never run a second copy.
   - Partial/failed cache: if the hl_cache.py refresh failed, or the newest snapshot is stale (>40 min), or the snapshot fails the scanner's integrity checks, the scanner writes a skipped/unavailable run record stating why and emits NO board (exit 3 or 2). That is a logged skip, not a job failure — do not retry the scanner within this run.
3. Invoke `getresearchshortlist` on `altcoin-analyzer-and-signal-tracker` with no arguments. Record only the returned `snapshotId` and `computedAt` in the run summary. Do not retry on failure; a missed capture is a gap in the snapshot series, never a job failure.

### Reporting rule (strict)
Silent by default. Emit chat output ONLY when the HL cache fetch FAILS twice in a row (persistent failure). Scanner skips, missed shortlist captures, and single-step timeouts are run-summary notes only. No routine messages. When silent, just end with no output.
