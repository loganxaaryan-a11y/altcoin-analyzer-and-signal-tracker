# QUARANTINE RECORD — demo-fixture entries (2026-10-14)

**Quarantine issued:** 2026-10-14 ~08:50 UTC · **Status:** ACTIVE — barred from any live performance claim.
**Scope:** 75 fixture entries + 1 unverifiable re-issue (see below). Sources read-only; originals untouched; copies are quarantine by reference in `quarantine-excluded-rows.jsonl`.

## Why quarantined
All of these entries were produced by synthetic demo/acceptance runs (`demo/integrated-demos.ts`,
`cryptoPrintFeed` / `equityOpenPrintFeed` / `ScriptedFeed`, fixture candidates with source `itg-fixture`).
Their "prints" are fabricated: fixed-offset timestamps, round fixture prices, identical stamps across rows.
No first-post-decision / next-open-print contract can be honored on fabricated prints — print identity
is the thing being asserted, and it does not exist.

## Cohorts
1. **40 equity demo entries** — `demo/evidence/integrated/demo{1..10}-*/store.db` (equity terminal):
   `entryObservedAt` identically `2026-10-14T13:30:00.000Z`; entry rule `next-xnys-regular-session-open-print` asserted against a scripted open-print feed.
2. **34 crypto demo entries** — `demo/evidence/integrated/demo{1..10}-*/store.db` (crypto terminal):
   28 rows = signal `sig_e663920b936efbc5ebed4538`, entry `2026-10-14T04:00:30.000Z`, `decisionPrice=100.00`/`entryPrice=100.2` identical;
   6 rows = signal `sig_18102a0eb98eb79c61ecf6ce`, entry `2026-10-14T04:01:30.000Z` (crash→resume demo on a ScriptedFeed print).
3. **1 orchestrator demo entry** — `handoff/data/orchestrator-demo-2026-10-14.sqlite`, signal `sig_c09dd0cf71db18324b937ddc`:
   inbox source `DEMO-SCRIPTED-DISCOVERY (not a real discovery run)`; prices 100/94/106/112; observed==received.
4. **1 unverifiable re-issue** — `scheduling/watcher-demo/data/sched-demo.sqlite`, contract `ct_53bb2a86d2e0fee1f36648122134e684`:
   same contract id re-issued (decisionAt 06:44:43.646Z), entry observed 616s post-decision on a first-post-decision rule; no stale-skip trail, no served-print log — first-print fidelity cannot be established.

Note: the 42 equity-discovery entries are quarantined separately in `quarantine-record-equity-42.md`.

## What is NOT quarantined
- `pilot/data/paper-pilot.sqlite` BTC long `sig_53bb2a86d2e0fee1f3664812` — clean on record evidence (real Binance-spot feed).
- `pilot/data/paper-pilot-dryrun.sqlite` — clean dryrun copy of the same signal.
