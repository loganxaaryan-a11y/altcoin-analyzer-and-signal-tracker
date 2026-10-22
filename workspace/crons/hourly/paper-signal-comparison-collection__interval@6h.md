---
id: paper-signal-comparison-collection
title: Paper-signal comparison collection (prospective v2.1.5)
enabled: true
owner: goal:research-terminal
mode: task
schedule:
  kind: interval
  timezone: UTC
  at: 2026-10-14T11:40:19
  every: 6h
timeout_secs: 1800
delivery:
  - chat_id: a685c3e7-c8be-4137-8900-4e899008bca7
metadata:
  tags: [cron:automatic-interval-anchor]
  originating_chat_context_json: '{"chat_id":"a685c3e7-c8be-4137-8900-4e899008bca7","origin_provider":"main","chat_kind":"direct","event_kind":"message","require_mention":false,"device_id":"b0fd69c2-fdf4-4238-b72c-9849812abe31"}'
  presentation_locale: en-US
---
## Paper-signal comparison collection — prospective rows under active freeze (v2.1.5)

You are a collection worker for the paper-signals program. Paper signals only. No brokerage. No production modifications. Holdouts locked. Work under `~/workspace/goals/research-terminal/paper-signals/comparison/`.

Active freeze: v2.1.5 (`freeze-manifest-v2.1.5.json`; chain v2.1.0 executable core <- v2.1.1 dates <- v2.1.2 executable-path <- v2.1.3 RULE 5/6 <- v2.1.4 collector wiring <- v2.1.5 operational-verification amendment). v2.1.5 is an operational-verification amendment to v2.1.4 (harness receipt-expiry parity check + adapter full-record extension); no prediction-weight, factor-set, scoring-formula, or asserted-rule changes. Post-freeze cutoff: 2026-10-14T04:57:00Z (carried forward unchanged from v2.1.4 — read the live value from the active manifest's `prospective_collection.post_freeze_cutoff_utc`, never guessed). Collection window: 2026-10-14 -> 2026-12-31 UTC. Prospective vessel: `rows/cohort-prospective-v2.csv` (69 cols). NEVER write to the retrospective cohort, the v1 file, or the legacy pilot file.

Steps:
1. Pull the LIVE paper stream: invoke the `getpaperpilotstatus` action on the `altcoin-analyzer-and-signal-tracker` artifact; save the full response JSON to `live-paper-status-<UTC-date>.json`. If the action is unavailable or fails, REPORT the blocker and stop — do not fabricate a status, do not fall back to a stale file silently.
1b. Pull the discovery observations for the latest completed discovery run: invoke the `getdiscoveryobservations` action on the `altcoin-analyzer-and-signal-tracker` artifact; save the full response JSON to `discovery-observations-<UTC-date>.json`. If it fails, REPORT the blocker and continue without it (the Challenger-R1 v3 scorer then writes no R4 upstream-population records this run — note that in the log).
1c. With the discovery run id from step 1b's response, invoke the `getdiscoveryfunnel` action with that run id and save the full response JSON to `discovery-funnel-<UTC-date>.json`. If it fails, continue without it (funnel counts are recorded as absent, never invented).
2. Build the live export: `python3 live_paper_stream.py --status <saved>.json --out live-paper-export-<UTC-date>.json`. This converts deployed paper candidates/signals (including suppressed) to collector candidate dicts and enforces the post-freeze cutoff.
3. Run the collector: `python3 collect_pilot_rows.py --live-export=<export.json>`. It scores both arms via the frozen harness, stamps freeze_version from the ACTIVE manifest (must read 2.1.5), enforces the cutoff again, and appends idempotently (dedupe key candidate_id + freeze_version) to `rows/cohort-prospective-v2.csv`.
3b. Run the Challenger-R1 v3 shadow scorer: `python3 challenger_r1_v3.py --status <the status file saved in step 1> --observations <the observations file saved in step 1b, if any> --funnel <the funnel file saved in step 1c, if any>`. Registration `challenger-r1-v3`, frozen 2026-10-21T19:12:02Z; it SUPERSEDES `challenger-r1-v2` prospectively (v2 accrual closed at the v3 freeze with a final closing pass on 2026-10-21; v2 records stay v2 — do NOT run the v2 scorer anymore). The v3 scorer appends, idempotently: Challenger-R1 v3 shadow records to `rows/challenger-r1-shadow-v3.jsonl` (dedupe registration_id + deployed candidate id), R4 upstream-population records to `rows/challenger-r1-r4-population-v3.jsonl`, and HYPOTHETICAL shadow-book enrollments to `rows/challenger-r1-shadow-book-v3.jsonl` (dedupe enrollment id). Candidates decided before the v3 freeze are refused by design — refused counts and 0 newly scored are normal. The scorer verifies its registered rule text's hash on every run; if it errors or reports a hash mismatch, REPORT that as a blocker (registration integrity) — do NOT edit the rule text, the registration, or the scorer to make it pass.
3c. Run BOTH shadow evaluators. (i) v2 book: `python3 challenger_shadow_eval.py` — evaluates the still-open HYPOTHETICAL v2 enrollments (registration challenger-r1-v2) into `rows/challenger-r1-shadow-outcomes-v2.jsonl` until they all close; v2 is history, never counted under v3. (ii) v3 book: `python3 challenger_shadow_eval_v3.py` — evaluates open HYPOTHETICAL v3 enrollments into `rows/challenger-r1-shadow-outcomes-v3.jsonl`. Both are isolated: they never touch production positions, production monitoring, or production outcomes. Shadow records are HYPOTHETICAL and never counted as issued work.
3d. Run the bounded rejected-abstain sample: `python3 rejected_abstain_sample.py --status <the status file saved in step 1>`. It appends up to 5 NEW production-model-abstain samples per run (Binance Spot only; window 2026-10-21 -> 2026-11-18 UTC; hard total cap 50) to `rows/rejected-abstain-sample.jsonl` and walks open samples forward under crypto-evaluation-v5-corrected. MEASUREMENT ONLY: it never issues, never enrolls anything actionable, and its records are labeled measurement samples. Report its one-line summary in the run log.
4. Verify before trusting: (a) the stamp on any new row is 2.1.5 — if not, report the mismatch as a blocker and stop; (b) the vessel written is `rows/cohort-prospective-v2.csv`; (c) no pre-freeze row was appended.
5. Append a dated section to `collection-run-log-2026-10-14.md`: UTC timestamp, live-stream candidate count, rows added, rows deduped, decision-time verified/unverified split, per-arm disposition mix, direction-disagreement fraction vs the 40% audit trigger, collection-window membership, the Challenger-R1 v3 shadow summary from steps 3b/3c (newly scored count, refused count, divergence count split by class — paired_comparison vs mechanics_proof_only — unverified-drift count, shadow enrollments written, population records written, v2 + v3 shadow outcomes closed), and the abstain-sample summary from step 3d.
6. If this run produced the FIRST post-freeze row, also write it to `rows/first-post-freeze-opportunity-2026-10-14.json` (replacing the `none_yet` record) with both model scores, input-availability evidence, and independent dispositions.

Rules: do NOT hand-edit any row. Do NOT enable anything beyond this spec. Do NOT touch quarantined files. If direction disagreement exceeds 40%, surface it prominently (audit trigger, not a bug verdict). A run that adds 0 rows is a normal, healthy result — log it and stay quiet (no chat report for routine 0-row runs; report only blockers, audit triggers, or the first real row).
