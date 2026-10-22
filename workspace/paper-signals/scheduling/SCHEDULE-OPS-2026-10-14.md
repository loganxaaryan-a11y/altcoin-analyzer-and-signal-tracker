# Paper pipeline — scheduling layer (operations spec)

**Date:** 2026-10-14. **Scope:** paper signals only. No brokerage, holdouts locked,
no prediction-weight changes, no reopening of accepted recovery work.
**Versioning:** this spec changes NO executables (handler, watcher, contract,
collector, pilot code all untouched) — therefore NO new freeze/version is
minted. This is operational configuration + documentation. sha256 of every new
operational file is recorded in `FILE-HASHES-2026-10-14.txt`.

**Status:** SPECS ONLY — nothing installed, nothing modified. Installing any of
these jobs creates persistent scheduler state and needs the parent's explicit
approval (standing rule: creating a scheduled job requires approval). The
parent installs with the exact `cron.add` parameters in the JOB-SPEC files.

---

## 1. The full schedule

```
crypto-market-discovery (EXISTS, healthy)
  interval@6h, America/Toronto, anchor 2026-10-01T22:24:23
  space_action → altcoin-analyzer-and-signal-tracker.runmarketdiscovery
  owner: space:altcoin-analyzer-and-signal-tracker
        │
        │  discovery completion → paper qualification (NO manual step)
        ▼
paper-signal-cycle (NEW — Job 1, JOB-SPEC-paper-signal-cycle-2026-10-14.md)
  interval@6h, America/Toronto, anchor 2026-10-01T23:09:23 (+45 min phase)
  space_action → altcoin-analyzer-and-signal-tracker.runpapersignalcycle
  owner: space:altcoin-analyzer-and-signal-tracker
  What it does: qualifies directional discovery candidates from the latest
  COMPLETED discovery run → pending contracts → setup alerts (PAPER, routed
  per delivery-config.json). Idempotent (content-hash identity): a run that
  finds zero candidates completes cleanly, manufacturing nothing.
        │
        │  pending contract exists → watch for entry inside the window
        ▼
paper-entry-watcher (NEW — Job 2, JOB-SPEC-paper-entry-watcher-2026-10-14.md)
  interval@5m (strictly finer than the 15-min crypto entry window)
  Resumes awaiting-entry candidates from PERSISTED DB state only
  (resumeAwaitingEntry — no in-memory registries). Bounded runs:
  poll-budget exhaustion ≠ expiry while the window is open (the candidate
  stays awaiting-entry + nextReassessmentAt is set).
  Deployed target: the artifact's watch/resume tick (INSTALL BLOCKER — see §3).
  Reference target (VM, demonstrated): `pilot tick` one-shots.
        │
        │  entered → outcome commit → entry alert (delivered only on real ack)
        ▼
paper-signal-comparison-collection (EXISTS, installed, running)
  interval@6h UTC — ANALYSIS EXPORT ONLY. Reads completed rows via the live
  stream export (getpaperpilotstatus) + workspace DB copy (read-only);
  appends comparison rows. It does NOT drive entry observation or alert
  timing. Proof: COLLECTOR-SEPARATION-2026-10-14.md + tests/test_collector_separation.py.
```

### Cadence table

| Job | Cadence | Trigger | Execution | Drives entry/alert timing? |
|---|---|---|---|---|
| `crypto-market-discovery` | interval@6h (exists) | clock | space_action `runmarketdiscovery` | no (radar only) |
| `paper-signal-cycle` | interval@6h, +45m phase (new) | discovery completion (phase) | space_action `runpapersignalcycle` | no — starts the lifecycle (qualification → pending + setup alert) |
| `paper-entry-watcher` | interval@5m (new) | clock | watch/resume tick (deployed: TBD action; VM: `pilot tick`) | **YES — entry observation + entry-alert timing** |
| `paper-signal-comparison-collection` | interval@6h (exists) | clock | agent worker, `collect_pilot_rows.py` | **NO — analysis export only** |

### Why these cadences

- **Qualification @6h phased +45m:** discovery runs every 6h; the cycle must see
  a COMPLETED discovery run. 45 min is the completion budget; if a discovery
  run overruns, the cycle reads the previous completed run (it carries
  `discoveryRunId`) — safe, no fabrication, next cycle catches up.
- **Watcher @5m:** the shortest entry window is 15 min (crypto). Correction 4
  (entry-v1/src/watcher.ts): a cadence coarser than the window cannot observe
  inside it. 5m < 15m gives ≥3 resume ticks per window; within each tick the
  bounded watcher polls at 20s (sandbox config) << window. Max undetected
  entry latency ≈ one watcher-tick interval + poll interval.
- **Collector @6h:** analysis latency only. Entry/alert timing is unaffected
  (proven in COLLECTOR-SEPARATION-2026-10-14.md).

---

## 2. What runs, on what cadence, what triggers what

1. `crypto-market-discovery` fires (6h) → writes radar rows + completed run id.
2. `paper-signal-cycle` fires 45 min later (6h) → invokes `runpapersignalcycle`
   → qualifies candidates from the latest completed discovery run →
   pending contracts + setup alerts (PAPER). Zero candidates → clean completion.
3. `paper-entry-watcher` fires every 5 min → resumes every awaiting-entry
   candidate whose reassessment is due, from the persisted DB row only →
   bounded observation (poll budget) → entered (outcome commit + entry alert)
   | expired (window closed) | poll-budget-exhausted (stays awaiting-entry,
   nextReassessmentAt set — NOT expiry).
4. `paper-signal-comparison-collection` fires every 6h → exports completed
   paper rows (live stream) → appends comparison rows. Independent of 1–3.

**Alert timing chain (entry → alert):** venue print (ts) → watcher poll observes
→ `observeEntry` (persisted event, eventRecordedAt) → outcome commit →
entry alert ENQUEUED → transport delivers → `delivered` only on real ack
(dedup key `(signal_id, alert_type)`). The collector appears nowhere in this
chain.

---

## 3. Install blockers (resolve before installing)

1. **Deployed watcher target.** The deployed `runpapersignalcycle` action's
   internals are platform-hosted and unverifiable from this workspace. The
   `paper-entry-watcher` job needs the artifact's watch/resume tick entry
   point confirmed with artifact access: either the cycle action already
   performs resume ticks on every invocation (then a 5-min space_action on it
   is the watcher — but qualification would also re-run every 5 min, which
   conflates the two cadences and should be a conscious choice), or a
   watch-only action/mode must be exposed by the builder. Do NOT install the
   deployed watcher job on an assumed action name/args — inventing the
   interface is how phantom integrations happen.
2. **VM pilot watcher DB.** The reference `paper-pilot-watcher` job (kind=agent,
   `pilot tick` every 5m) watches the sandbox DB
   `pilot/data/paper-pilot.sqlite`. That is the repaired reference lane, not
   the deployed lane — label it as such in the job body.
3. **Collection-window end.** Unrelated to this spec, but noted: the collector
   job should be disabled when the collection window closes (2027-01-01 UTC).

---

## 4. Acceptance (before reporting "scheduled")

- `paper-signal-cycle`: ≥1 completed run after a discovery run, per-run
  counts on record (candidateCount/issuedCount), zero manufactured signals
  on empty runs.
- `paper-entry-watcher`: a pending contract issued by the cycle is observed
  by a later watcher tick (entry or expiry inside the window), resumed from
  DB state — demonstrated for the VM lane in
  `watcher-demo/watcher-resume-demo.sh` (evidence in `watcher-demo/evidence/`).
- Collector separation: `tests/test_collector_separation.py` passes.

---

## 5. Rollback

Disabling `paper-signal-cycle` stops new qualifications; disabling
`paper-entry-watcher` stops resume ticks (pending contracts expire naturally
at their window ends — nothing hangs). No partial pipeline state exists
outside the orchestrator's store. The collector is unaffected by either.
