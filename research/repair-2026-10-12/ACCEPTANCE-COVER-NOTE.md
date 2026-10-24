# Crypto tracker acceptance closeout — cover note

Date: 2026-10-12

## Status by acceptance case

1. **Trade state separated from grading state — implemented.** `measurement_run_items.trade_state` and `trade_state_reason` are independent of `status` and `reason` (grading). An open trade can therefore carry `failed` grading with retry pending. The run summary reports trade-state counts and grading reconciliation separately; it no longer calls missing grading input “open.”
2. **All 28 records reconciled — implemented in the frozen cohort/read model.** A new run snapshots every persisted signal ID, not only eligible rows. Each ID receives a durable item immediately. Exclusions retain an explicit reason. Pending, ambiguous and unverified are combined only in the displayed pending/unresolved subtotal, while their per-ID subtype remains visible. The arithmetic is printed as `in scope = evaluated + pending/unresolved + failed + excluded` and is marked balanced only when every frozen ID has exactly one item.
3. **Restart recovery — fixture proof completed; deployed restart proof pending.** The stable cursor selects the same batch after a simulated worker stop before cursor commit. `(run_id, signal_id)` upsert prevents duplicate items. Evaluation evidence hashing now removes volatile worker timestamps, so repeating unchanged evidence does not append a new revision or outcome event. Failed IDs are retried under the same run ID after the forward cursor reaches the end. The recovery test proves 28-ID reconciliation, no skipped IDs, no duplicate keys and no history rewrite under unchanged evidence.
4. **Deployed schedule/failure-recovery evidence — explicitly pending.** This artifact checkout does not contain evidence that an enabled production schedule calls the repaired action, nor a deployed controlled-outage/recovery cycle. The specific missing evidence is: deployed commit/build identifier tied to the repaired action, enabled schedule definition and ownership, action execution logs for a successful complete run, and a redacted controlled provider failure followed by same-run recovery. No fixture is presented as production proof.

## What this establishes

The repair restores readable records and an auditable, resumable accounting path. It does not establish predictive edge or improve past signal outcomes.

## Verification attribution

All included test/build/audit results are builder or Muse-reviewer evidence. Independent expert rerun and acceptance remain separate and pending.
