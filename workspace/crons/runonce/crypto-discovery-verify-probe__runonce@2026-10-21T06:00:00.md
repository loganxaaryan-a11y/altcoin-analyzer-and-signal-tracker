---
id: crypto-discovery-verify-probe
title: TEMP probe — verify-or-fail path test (remove after proof)
enabled: true
owner: goal:research-terminal
mode: task
schedule:
  kind: runonce
  timezone: America/Toronto
  at: 2026-10-21T06:00:00
timeout_secs: 3600
delivery: []
metadata:
  originating_chat_context_json: '{"chat_id":"a685c3e7-c8be-4137-8900-4e899008bca7","origin_provider":"main","chat_kind":"direct","event_kind":"message","require_mention":false,"device_id":"d8c63a1c-801b-497b-a9fe-cd2681d2185d"}'
  presentation_locale: en-US
---
VERIFICATION PROBE — this job tests the discovery verify-or-fail protocol against a deliberately nonexistent artifact action. The action name used in steps 2 and 4 does NOT exist, so every invocation errors by design and no artifact side effect can occur. This probe PASSES if this run ends as a FAILED run with the evidence summary in step 5 (that is the verify-or-fail path working). It FAILS if this run ends as succeeded.

Steps:
1) BASELINE: read the `run` object of getmarketdiscovery on altcoin-analyzer-and-signal-tracker. Note the latest run id (PREV_ID) and its status. Note the current UTC time as T0.
2) INVOKE: invoke the action `runmarketdiscoveryprobevoid` on altcoin-analyzer-and-signal-tracker with args {"trigger":"scheduler"}. It will error (unknown action) — record the time and the error.
3) VERIFY: read getmarketdiscovery's `run` object again. A row would be attributable only if its id differs from PREV_ID and its startedAt is within [T0 − 120s, now + 120s]. None can exist (the invoked action does not exist), so verification must find NO attributable row.
4) ONE RETRY: invoke `runmarketdiscoveryprobevoid` once more, then re-read getmarketdiscovery and confirm again that no attributable row exists and PREV_ID is unchanged.
5) End this run as a FAILED run (worker-reported failure). The summary must state: PROBE — execution FAILED by design; both invocations of the nonexistent action errored (give times and the error text); read-back evidence: PREV_ID before and after, latest row id/status unchanged; no verified discovery run exists. If — contrary to the design — an attributable new run row DID appear in step 3 or 4, do not report success either: end as FAILED and state that an unexpected row appeared (give its id, startedAt and status) so the contamination is visible.
