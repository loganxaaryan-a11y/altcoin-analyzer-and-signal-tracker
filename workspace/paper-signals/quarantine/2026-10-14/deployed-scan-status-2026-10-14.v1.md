# Deployed scan status — v1 (2026-10-14, 09:00Z)

**Verdict: BLOCKED — the resumable equity scan is NOT deployed on the live equity artifact.**

## Evidence checked
- `equity-discovery/evidence/scheduled-scan-2026-10-14.md` (run_id `e236ff59-d02f-42ae-b7af-e71ca0be5f1f`, fired 03:28 EDT): explicitly states the scheduler run was **sandbox** — "The deployed artifact's `runAutomatedScan` was not involved and remains broken."
- `equity-discovery/state/runs/2026-10-14-batch-{0..7}.json` (07:28Z) — all 8 batches are VM-local sandbox runs; cross-checked scan state shows 101/101 symbols terminal *in the workspace state file*, not on the artifact.
- No deployed artifact action runs, no builder changes, and no fresh scan timestamps on the live artifact exist anywhere in the workspace. A file sweep for anything newer than 2026-10-14 08:47Z turned up only rebuilt sandbox dist files — nothing from `equity-analyzer-and-signal-tracker`.
- README §Known findings #2 (still current): "this repair is workspace-side. The deployed `runAutomatedScan` still times out; a durable fix needs the artifact builder (batch args on the action, or the scan split into the existing `populateUniverseTierBatch`-style resumable actions)."

## Missing capability
- Artifact builder access to `equity-analyzer-and-signal-tracker` (needed to add resumable batch args/actions to `runAutomatedScan`).
- The subagent session's prior finding stands: the builder path is unavailable from here. Deploying the scan requires an eligible session with builder access (parent/root).

**Gate condition (a): NOT MET.**
