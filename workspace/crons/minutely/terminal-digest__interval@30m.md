---
id: terminal-digest
title: Terminal research digest (30m, both terminals)
enabled: true
owner: goal:research-terminal
mode: task
schedule:
  kind: interval
  timezone: America/Toronto
  at: 2026-10-20T18:15:59
  every: 30m
timeout_secs: 900
delivery:
  - chat_id: 7b75e732-f527-4d53-b40d-4aa036201d9b
metadata:
  tags: [cron:automatic-interval-anchor]
  originating_chat_context_json: '{"chat_id":"a685c3e7-c8be-4137-8900-4e899008bca7","origin_provider":"main","chat_kind":"direct","event_kind":"message","require_mention":false,"device_id":"d8c63a1c-801b-497b-a9fe-cd2681d2185d"}'
  presentation_locale: en-US
---
## Terminal research digest — every 30 min, both terminals (PAPER ONLY)

PAPER ONLY. No brokerage, no orders, no real money. This job is the chat digest for the terminal-first design (doc: ~/workspace/goals/research-terminal/hidden_files/workstreams-2026-10-19/24-terminal-first-delivery-prep.md §4, Tier 3). The TERMINALS are the primary destination; this digest is a notification of record. Read state (readAt) is set ONLY by Logan in the terminal UI — this job NEVER writes readAt, never calls any ack action, and never presents an expired setup as actionable.

### Sources (artifact actions only — never app.db/sqlite)
- Crypto: invoke `getNotifications` on `altcoin-analyzer-and-signal-tracker` with {limit: 1000}.
- Equity: invoke `getNotifications` on `equity-analyzer-and-signal-tracker` with {limit: 200}. If this call fails, RETRY IT ONCE (known cold-read behavior: the equity read builds the opportunity board for the Review-due join and the first cold read can fail); only if the retry also fails, treat the equity store as unreadable this run, note it in the state file, and continue with crypto only.
- Crypto run-status cross-check: invoke `getmarketdiscovery` on `altcoin-analyzer-and-signal-tracker` with {}. Build two sets. KNOWN-UNFINISHED (demote-only): (a) the latest discovery run (data.run) when its completedAt is null at build time (still running), and (b) every runId in data.coverageGaps whose status is not a completed status (e.g. "timeout"). KNOWN-COMPLETED: (a) the latest discovery run when its completedAt is non-null at build time, and (b) every run id recorded in state `known_completed_runs` (this job's own ledger of runs it has observed completed — see State). Research visibility keys on SOURCE-RUN COMPLETION, never on issuance: a run in KNOWN-UNFINISHED can only demote a candidate to PROVISIONAL; a run in KNOWN-COMPLETED releases its candidates as research (Eligibility rule 2) whether or not issuance has assessed them. An issuance verdict NEVER gates research visibility — it is shown beside the candidate as separate information (rule 2). If this call fails, proceed on the row-level fields plus the state `known_completed_runs` ledger alone and note the failed cross-check in the state file.

### State
State file: ~/workspace/goals/research-terminal/hidden_files/terminal-digest/state.json with two watermarks: `stored_since` and `expired_since` (ISO UTC), plus `updated_at_utc`, plus `provisional_pending`: a list of {store, id, run_id, first_shown_utc, stage} for crypto discovery rows already shown whose issuance verdict has not yet been printed (stage = "provisional": shown only as PROVISIONAL so far; stage = "research_announced": shown in NEW OPPORTUNITIES as research with issuance assessment pending — Eligibility rule 3), plus `known_completed_runs`: a list of {run_id, completed_at_utc, first_observed_utc} recording every discovery run this job has observed completed (the latest run with completedAt non-null at any build); prune entries older than 7 days on each write. If absent (first run): initialize `stored_since` = now − 1h and `expired_since` = now − 24h, `provisional_pending` = [], and `known_completed_runs` = []. After building the KNOWN sets each run, if the latest run's completedAt is non-null and its id is not yet in `known_completed_runs`, add it (completed_at_utc = its completedAt, first_observed_utc = now); persist the ledger in the same end-of-run state write as everything else. BASELINE RULE: the pre-terminal-first backlog (e.g. the 2026-10-16 discovery notifications) lives in the terminals with correct stamps and is NEVER dumped into chat by this job; only events inside the watermark windows are ever carried.

### Eligibility (compute liveness at build time from each row's expiresAt — never from storedAt)
From each store's rows (fields: notificationClass, eventType, symbol, title, reasonLines, blockerReason, eventAt, storedAt, expiresAt, reviewDue where present, chatSentAt, store, id, dedupKey; crypto discovery rows also carry sourceRef and issuanceOutcome):
1. URGENT section — rows with notificationClass = "lifecycle" AND eventType in {ENTRY_CONFIRMED, SETTLED, INVALIDATED} AND storedAt > stored_since.
2. NEW OPPORTUNITIES section — RESEARCH-VISIBLE rows only. Rows with notificationClass = "opportunity" AND storedAt > stored_since AND (expiresAt is null OR expiresAt > now) that are research-visible:
   - Crypto discovery rows (store = "discovery", sourceRef = "discovery_run:<N>") are research-visible the moment their SOURCE RUN is complete; issuance never gates research visibility. Classify each such row into exactly one state:
     - **State 3 — issuance verdict present:** issuanceOutcome is "blocked" or "issued" (equivalently eventType BLOCKED or ISSUED). Print in NEW OPPORTUNITIES with the issuance qualification shown beside the item as separate information: blocked rows print their blockerReason and the line "Issuance: blocked"; issued rows print the line "Issuance: issued". (A verdict can only exist after the source run completed, handed off, and issuance processed it — a verdict is therefore also proof of completion.)
     - **State 2 — source run completed, issuance assessment pending:** issuanceOutcome is "awaiting_issuance" or null AND source run <N> is in KNOWN-COMPLETED (the cross-check or the state ledger). Print in NEW OPPORTUNITIES labeled "Issuance assessment pending" — the candidate IS a research opportunity; never print it in PROVISIONAL, and never phrase the pending assessment as a defect or a block. After printing, track it in `provisional_pending` with stage = "research_announced" so its verdict gets an update printing when it lands (rule 3).
     - A crypto discovery row in neither state (no verdict, and its source run is not known completed) is NOT research-visible yet — it belongs in PROVISIONAL (rule 3), never here.
   - Rows carried over from `provisional_pending` are printed here only through the rule-3 carry-over, even when storedAt <= stored_since; a tracked row is never printed twice in one digest.
   - Equity rows (no discovery_run sourceRef) are not subject to this classification and follow the pre-existing rule unchanged.
   Blocked rows print their blockerReason. Equity rows may also show "Review due <reviewDue>" when reviewDue is present — display information only; an equity row NEVER expires by inference (its expiresAt is null by rule) and never appears in the EXPIRED section.
3. PROVISIONAL OPPORTUNITIES section — crypto discovery rows (store = "discovery", notificationClass = "opportunity", storedAt > stored_since, expiresAt null OR > now) that are NOT yet research-visible under rule 2 (rows already tracked in `provisional_pending` are handled by the carry-over re-check below, not re-printed here). Two distinct cases, labeled distinctly — never merge them into one label:
   - **Run known unfinished:** source run <N> is in KNOWN-UNFINISHED. Label every such item "PROVISIONAL — discovery run <N> not finished; not yet validated."
   - **Completion unconfirmed:** no issuance verdict on the row, and source run <N> is in neither KNOWN-UNFINISHED nor KNOWN-COMPLETED (the published actions cannot confirm this run's completion — e.g. it finished before this job ever observed it as the latest run and its rows carry no verdict). Label every such item "PROVISIONAL — discovery run <N> completion not yet confirmed; not yet validated." Never label an unconfirmed run as finished or as unfinished — the label states exactly what is unknown.
   Print both cases under the heading "PROVISIONAL OPPORTUNITIES — source run not finished, not yet validated". Never print a provisional item in NEW OPPORTUNITIES or phrase it as a research opportunity.
   Carry-over: after printing, add each such row to state `provisional_pending` ({store, id, run_id, first_shown_utc = now, stage = "provisional"}) if not already present. At the START of every run, re-check each `provisional_pending` entry against the freshly fetched crypto rows and the freshly built KNOWN sets:
   - If the row is now State 2 (source run known completed, still no verdict): print it in NEW OPPORTUNITIES labeled "Issuance assessment pending" (its research announcement), stamp it, and set its stage to "research_announced" — keep tracking it, the verdict is still owed.
   - If the row is now State 3 (verdict present): if its stage was "provisional", print it in NEW OPPORTUNITIES with its issuance qualification beside it (research announcement and verdict together), stamp it, and remove the entry. If its stage was "research_announced", print it once more in NEW OPPORTUNITIES as an issuance update — the item plus the line "Issuance update:" followed by the qualification (blocked rows: their blockerReason; issued rows: "Issuance: issued") — stamp it, and remove the entry.
   - If its expiresAt is now <= now, remove the entry (rule 4 handles it if it falls in the expired window).
   - If the row is absent from the fetched rows AND first_shown_utc is more than 48h old, remove the entry and note the drop in the state file (aged out of the read window still unresolved).
   - Entries whose state has not changed stay listed and are NOT re-printed.
4. EXPIRED section — rows with expiresAt non-null AND expired_since < expiresAt <= now. These are a RECORD, under an explicit EXPIRED heading, stamped EXPIRED, never styled or phrased as actionable. (Crypto setups only — the frozen candidate entryExpiresAt is the only expiry source.)
5. MILESTONES section — rows with eventType in {THEORY_HIT, MILESTONE_TOUCH} AND storedAt > stored_since, labeled milestones (never closures).

### Message shape (only when at least one section is non-empty)
One message. Header: `TERMINAL DIGEST — <now, ET> — paper only`. Sections in the order: URGENT, PROVISIONAL OPPORTUNITIES, NEW OPPORTUNITIES, EXPIRED (record), MILESTONES. Every item prints its three timestamps on its own line: `event <eventAt> → stored <storedAt> → digest <now>` (all UTC ISO), so delay is printed, not implied. Keep each item to its title line, its reason lines (blocked rows: the blocker reason), and the timestamp line. Plain language, no pipeline jargon, no agent-layer fields.

### After a successful send (the send is this run's final message)
- For every row printed, stamp it: invoke `markNotificationsChatSent` on the row's artifact with that row's store + id and the send timestamp. This stamps provisional printings the same way as any other printing, and each later carry-over printing (research announcement, issuance update) is stamped again with its own send timestamp. This action stamps chatSentAt only; it must never touch readAt. If a stamp call fails, note it in the state file — the row may repeat in the next digest (at-least-once, recognizable by its original timestamps; accepted design trade).
- Advance both watermarks to this run's start time, persist any `provisional_pending` and `known_completed_runs` changes in the same write, and write the state file (atomic tmp + rename).

### Silence
If no section qualifies: emit NO chat-facing output at all (empty final message). Still advance the watermarks, persist `provisional_pending` and `known_completed_runs` changes, and write the state file. Never emit "nothing new" lines, summaries, or status text to chat — the state file is the record.
