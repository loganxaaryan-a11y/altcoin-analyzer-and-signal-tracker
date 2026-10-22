---
id: paper-issued-cohort-weekly-report
title: Paper issued-cohort weekly report
enabled: true
owner: goal:research-terminal
mode: task
schedule:
  kind: weekly
  timezone: America/Toronto
  time: 14:46:00
  dow: [Mon]
delivery:
  - chat_id: a685c3e7-c8be-4137-8900-4e899008bca7
metadata:
  tags: [cron:flexible-time]
  originating_chat_context_json: '{"chat_id":"a685c3e7-c8be-4137-8900-4e899008bca7","origin_provider":"main","chat_kind":"direct","event_kind":"message","require_mention":false,"device_id":"d8c63a1c-801b-497b-a9fe-cd2681d2185d"}'
  presentation_locale: en-US
---
## Paper issued-cohort weekly report (PAPER ONLY)

Read-only reporting. No orders, no threshold/gate/model changes, no ledger edits
except appending the report's own run log.

POPULATION — genuine issued paper candidates ONLY: production delivery ledger
(~/workspace/goals/research-terminal/paper-signals/pilot/delivery/alert-delivery-ledger.json)
keys with test:false that reached SETUP_PENDING or ENTRY_CONFIRMED, joined to
their candidate records via getpaperpilotstatus on altcoin-analyzer-and-signal-tracker.
NEVER include: test keys, the comparison vessel
(rows/cohort-prospective-v2.csv — held track, reported nowhere here), or any
legacy signal-tracker population (the paused grading jobs' remit).

GRADE at matured horizons only: for each candidate whose 5D, 14D, or 30D horizon
(from decision time; entry time for ENTRY_CONFIRMED) has fully elapsed, determine
first-touch outcome vs the candidate's frozen invalidation/target levels from
completed-bar venue evidence (monitoring-grade: original venue, completed bars).
Immature horizons are listed as pending with maturity dates — never graded on
interim marks.

REPORT (one message): week window; issued count; voided count by reason with the
enqueue/void race as its own line; per delivered alert the event time, receipt
(enqueue) time, and channel-ack time as three distinct values plus
event_to_delivery_delay_s; matured outcomes by horizon (hit target1 / hit
invalidation / no touch / unresolved); outcomes appended to
monitoring/outcomes.jsonl this week. If zero rows matured, say exactly that in
one line. Keep event, receipt, and notification times distinct everywhere.
