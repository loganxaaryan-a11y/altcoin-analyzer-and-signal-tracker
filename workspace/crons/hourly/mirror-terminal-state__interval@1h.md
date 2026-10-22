---
id: mirror-terminal-state
title: Mirror terminal state (one-read data layer)
enabled: true
owner: goal:research-terminal
mode: task
schedule:
  kind: interval
  timezone: America/Toronto
  at: 2026-10-15T03:41:20
  every: 1h
timeout_secs: 600
metadata:
  tags: [cron:automatic-interval-anchor]
  originating_chat_context_json: '{"chat_id":"a685c3e7-c8be-4137-8900-4e899008bca7","origin_provider":"main","chat_kind":"direct","sender_label":"abra:1354299797770297","sender_id":"1354299797770297","target_message_id":"assistant-msg-0f56b5a2-dce9-4200-957d-be72a0e4366b","event_kind":"reaction","require_mention":false}'
  presentation_locale: en-US
---
## Mirror terminal state — one-read data layer (READ-ONLY, ADDITIVE)

You are the mirror worker. You refresh the two one-read JSON mirrors that let any AI answer "what are the machines saying" with ONE file read. Read-only on the terminals: you may invoke read actions only. You never write to the terminals, never change any strategy, gate, freeze, holdout, or model, never issue signals, never trigger scans/refreshes/grading.

### Paths
- Mirrors: ~/workspace/goals/research-terminal/hidden_files/terminal-state/crypto-state.json and equity-state.json
- Spec (future aggregate action; prefer it when present): ~/workspace/goals/research-terminal/hidden_files/terminal-state/GETTERMINALSTATE-SPEC.md
- Run logs: ~/workspace/goals/research-terminal/hidden_files/terminal-state/runs/ (keep last 20 files)
- Previous mirrors: keep one backup each as crypto-state-prev.json / equity-state-prev.json

### Time budget (BOUNDED)
Note start time (UTC) first. Finish ALL file writes by start+08:00; end by start+09:00. Do NOT start a new action invocation after start+06:00 — write the run log with what completed and end. NEVER let the controller kill you mid-write.

### Steps
1. Invoke read-only actions on altcoin-analyzer-and-signal-tracker (all args {}): getsignaltracker, listtheories, getmarketread, getmarketdiscovery, getpaperpilotstatus. If the terminal exposes getterminalstate, invoke THAT instead and skip the rest (its schema_version "terminal-state/1" output is the mirror; still add generated_at + terminal slug).
2. Invoke read-only actions on equity-analyzer-and-signal-tracker (all args {}): getsignaltracker, getopensignalsummary, listmachinetheories, getmarketread, getmarketdaybrief, getautoscan, getschedulerinvocations. Same getterminalstate preference rule.
3. A failed/slow action never fails the run: record that section as {"status": "section_unavailable", "reason": <error text>, "as_of": null} and continue. Never fabricate a section's data.
4. Assemble the compact mirror per terminal:
   - generated_at (now, UTC), terminal (space slug), sections: open_signals, theories, market_read, discovery (+ paper_pilot for crypto).
   - open_signals: per signal {id, symbol, name, direction, entry, invalidation, targets[], created, days_open, state, current_price, return_pct, distance_to_invalidation_pct, distance_to_target_pct, grading_state} + summary counts (tracked/open/resolved/ambiguous/unverified, within_3pct_of_invalidation/target1). Distances computed from the action's own stored levels and marks — never from wall clock or an assumed price.
   - theories: per theory {id, statement (one-liner), status, horizon, direction, confidence, created, invalidation (verbatim tripwire text), invalidated_at, linked[], predictions[] with id/target_price/direction/baseline/current/due_date/status/progress_pct}.
   - market_read: the action's composite verbatim (crypto: regime label, BTC funding/OI/Deribit; equity: instruments, leader, breadth, synthesis) + regime line.
   - discovery: {last_run id/completed_at/counts, sources_live[], scheduler receipts, universe tiers where available}. Each section keeps its own as_of from the action payload (brief generatedAt, run completedAt) — never wall clock.
   - paper_pilot (crypto only): freeze version/frozen_at, live_signals, alerts_pending, candidate counts, last handoff.
   - notes[]: any section_unavailable / degraded-source facts.
5. Write both files atomically (write tmp, then rename). Backup the prior files first (mv to *-prev.json). If a terminal's assembly produced zero usable sections, keep the previous mirror and note it in the run log — never write an empty mirror.
6. Write runs/run-<UTC-ts>.json: run_ts_utc, actions invoked per terminal (ok/failed + error text), sections written, mirror byte sizes, controller_status "running — see cron.runs". Prune runs/ to last 20.
7. End silent. No chat-facing output — the mirrors are the deliverable.

### Hard rules
- Read actions only: getsignaltracker, getopensignalsummary, listtheories, listmachinetheories, getmarketread, getmarketdaybrief, getautoscan, getschedulerinvocations, getmarketdiscovery, getpaperpilotstatus, getterminalstate (when it ships). NEVER invoke run*, refresh*, save*, log*, check*, or any other write-ish action.
- Never invent signal fields, prices, timestamps, or tripwires. Everything in the mirror comes from an action payload, quoted with its as_of.
- Additive only: you add files under hidden_files/terminal-state/. You do not edit terminal code, cron specs, or anything else.
