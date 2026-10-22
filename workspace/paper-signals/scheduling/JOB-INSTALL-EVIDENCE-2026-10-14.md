# Job installation evidence — 2026-10-14 (installed by coordinator, Logan authorized)

## paper-signal-alert-delivery
- Enabled: true. Schedule: interval@15m, America/Toronto, next run Wed 2026-10-14 12:00:00 EDT.
- Action mapping: kind=agent worker → reads deployed `getpaperpilotstatus`, ack-sweeps the delivery ledger, emits PAPER alerts to side chat a685c3e7-c8be-4137-8900-4e899008bca7 only when due.
- First execution: run 915a6ed2-4648-4d9a-92f7-d6748a480f15, manual, succeeded 04:33:07 EDT.
  - Scheduler dispatch: job fired on manual trigger (queued → running → succeeded).
  - Handler completion: worker completed; status fetch OK; 0 alerts in deployed status; ledger empty.
  - Delivery acknowledgement: N/A — nothing emitted (quiet run per no-noise rule). No ack owed.
  - Evidence: pilot/delivery/worker-runs/run-2026-10-14T08-32-31Z.json

## paper-signal-cycle
- Enabled: true. Schedule: interval@6h, America/Toronto, anchor 2026-10-01T23:09:23 (45 min after crypto-market-discovery), next run Wed 2026-10-14 05:09:23 EDT.
- Action mapping: kind=space_action → altcoin-analyzer-and-signal-tracker.runpapersignalcycle (no args). Silent run; failures stay in run history.
- First execution: run d1d267a3-6c78-41ab-902a-be3b0a14b56e, manual, succeeded 04:32:19 EDT.
  - Scheduler dispatch: job fired on manual trigger.
  - Handler completion: artifact action invoked directly; deployed paper cycle id 4 completed, issued 0 (clean, nothing manufactured).
  - Delivery acknowledgement: N/A — space_action runs are silent by design; no chat delivery expected.
  - Note: timeout extended by runtime 1800s → 21600s (cadence rule); harmless.

## paper-pilot-watcher (Variant B — VM reference lane)
- Enabled: true. Schedule: interval@5m, America/Toronto (flexible), next run Wed 2026-10-14 04:37:11 EDT.
- Action mapping: kind=agent worker → one bounded `pilot tick` in a fresh process against pilot/data/paper-pilot.sqlite (DB-only resume, no ingest).
- First execution: run 710ba171-3ecd-4515-9c89-eac4c70f2d4c, manual, succeeded 04:32:35 EDT.
  - Scheduler dispatch: job fired on manual trigger.
  - Handler completion: worker completed; tick processed (0-candidate tick is the healthy result).
  - Delivery acknowledgement: N/A — watcher emits no chat output; outcomes reported in run summary only.
- Variant A (deployed space_action watcher) NOT installed: install blocker stands — the deployed runpapersignalcycle internals are platform-hosted; the watch/resume entry point is unconfirmed. See JOB-SPEC-paper-entry-watcher-2026-10-14.md §4. Not installed on an assumed interface.
