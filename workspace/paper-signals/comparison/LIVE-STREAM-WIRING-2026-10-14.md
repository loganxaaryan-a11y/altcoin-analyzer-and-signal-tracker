# Fix 3 wiring note — live paper stream → collector

## What changed
The prospective collector previously ingested crypto candidates from a
workspace database copy (`generated_signals` / `suppressed_signal_candidates`
in a local SQLite file) and static equity ledger files. That cannot prove
ongoing deployed collection. Fix 3 adds a live adapter:

- `live_paper_stream.py` — converts a `getpaperpilotstatus` response from the
  DEPLOYED artifact `altcoin-analyzer-and-signal-tracker` into collector
  candidate dicts (harness candidate schema). Includes suppressed paper
  candidates when present. Enforces the post-freeze cutoff
  (v2.1.0 freeze 2026-10-14T04:57:00Z) before emitting.
- `ingest_live_paper_stream(export_path)` — collector-facing ingest function.
  Returns candidate dicts with `row_origin="pilot"` and a `provenance` block
  naming the deployed source. The collector should call this in its
  eligible-stream assembly INSTEAD OF the workspace-DB-copy ingest for the
  prospective pilot. (The workspace-copy ingest remains for the retrospective
  cohort only.)

## Refresh procedure (agent-operated)
The adapter cannot call artifact actions itself. Refresh cycle:
1. Agent calls `artifact.invoke_action getpaperpilotstatus` on
   `altcoin-analyzer-and-signal-tracker`, saves response JSON.
2. `python live_paper_stream.py --status <saved>.json --out live-paper-export-<date>.json`
3. Collector ingests via `ingest_live_paper_stream(<out>)`.

## First live export (2026-10-14)
- `live-paper-status-2026-10-14.json` — raw deployed status (runs 1–2).
- `live-paper-export-2026-10-14.json` — 0 candidates, 0 excluded pre-freeze.
  Stream connected; deployed paper tables genuinely empty. A third manual
  `runpapersignalcycle` invocation (run 3, complete) likewise considered 0
  candidates — three completed runs, zero opportunities, nothing manufactured.
- Legacy segregation intact: 31 legacy tracked signals, paper tables separate.

## Known gap
The artifact's in-artifact delivery config still reports `configured: false`
— Logan's chosen destination (research side chat + terminal) is recorded in
the workspace `pilot/delivery/delivery-config.json`, not yet wired as an
artifact delivery action. Enqueue persistence is separate from delivery.
