# Job spec — `paper-signal-cycle` (Job 1: automatic paper qualification)

**Status: SPEC ONLY — NOT INSTALLED.** Installing creates persistent scheduler
state; the parent installs with the exact parameters below after approval.
Paper signals only. No brokerage. No executables changed.

## Purpose

Close gap (c) from `comparison/DISCOVERY-CONFIRMATION-2026-10-14.md`: the
deployed paper cycle `runpapersignalcycle` exists but no schedule invokes it —
it runs only on manual invocation. This job triggers paper qualification
AUTOMATICALLY after each crypto discovery run completes: discovery completion
→ paper qualification, no manual step.

## Handoff design

- `crypto-market-discovery` (space_action, interval@6h, America/Toronto,
  anchor `2026-10-01T22:24:23` → fires :24 past the hour every 6h) writes the
  completed discovery run (carries `discoveryRunId`).
- This job fires 45 min later (anchor `2026-10-01T23:09:23` → :09 past the
  hour every 6h) and invokes `runpapersignalcycle` with no args. The action
  reads the LATEST COMPLETED discovery run — it never qualifies a run that
  hasn't completed.
- If a discovery run overruns 45 min, the cycle reads the previous completed
  run: safe (no fabrication — the action only qualifies completed discovery
  rows), and the next 6h cycle catches up. Worst-case qualification lag: one
  discovery interval.
- Idempotency: the repaired issuance path uses deterministic content-hash
  identity (terminal/symbol/direction/signalDate/params) + issuance-claim —
  the same candidate reassessed twice issues at most once. A run that finds
  zero candidates completes cleanly ("No directional discovery candidate was
  available for the explicit paper path; no signal was manufactured") —
  deployed runs 1–3 proved this behavior.

## Exact `cron.add` parameters

```json
{
  "id": "paper-signal-cycle",
  "title": "Paper-signal cycle (post-discovery qualification)",
  "owner": "space:altcoin-analyzer-and-signal-tracker",
  "enabled": true,
  "mode": "task",
  "execution": {
    "kind": "space_action",
    "slug": "altcoin-analyzer-and-signal-tracker",
    "action": "runpapersignalcycle",
    "args": {}
  },
  "schedule": {
    "kind": "interval",
    "every": "6h",
    "at": "2026-10-01T23:09:23",
    "timezone": "America/Toronto",
    "flexible_time": false
  },
  "timeout_secs": 1800,
  "predicted_connector_permissions": [],
  "retry": { "max_retries": 0, "on_failure": false }
}
```

Body (run-history context; space_action runs are silent, body is not executed):

> Paper-signal qualification cycle (paper-only). Invokes the deployed
> `runpapersignalcycle` action on `altcoin-analyzer-and-signal-tracker` after
> each crypto discovery run completes. Qualifies directional discovery
> candidates → pending entry contracts → PAPER setup alerts per
> `pilot/delivery/delivery-config.json` (research side chat + terminal,
> dedup key `(signal_id, alert_type)`, delivered only on real ack). No
> brokerage. Zero-candidate runs complete cleanly without manufacturing
> signals (content-hash issuance identity).

## Install notes for the parent

- `at` is load-bearing here (phased 45 min after `crypto-market-discovery`'s
  anchor), so `flexible_time: false`. First firing ≈ 45 min after the next
  discovery run.
- `owner: space:altcoin-analyzer-and-signal-tracker` matches the artifact-owned
  pattern of the discovery jobs; lifecycle follows the artifact.
- `retry` off: dispatched artifact actions are never auto-retried (effects may
  have committed); a missed run is caught by the next 6h cycle.
- `timeout_secs: 1800` is generous (deployed 0-candidate runs complete in
  <1s); a run with real candidates does qualification + bounded observation.
- After install, verify with `cron.runs` (id `paper-signal-cycle`): expect
  succeeded runs with per-run counts; confirm the run's `discoveryRunId`
  matches a completed discovery run.
- First-run expectation: likely 0 candidates (deployed runs 1–3 found zero
  against discovery run 56) — a clean 0-candidate completion is the healthy
  result, not a failure.
