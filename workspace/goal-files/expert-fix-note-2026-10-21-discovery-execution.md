# Fix note — 2026-10-21: discovery execution repair (companion to the 2026-10-21 brief)

Logan ordered this fix directly on 2026-10-21 ("remove the empty thing… make it work and make it work right"). Scope: **execution mechanics only** — no model, gate, threshold, veto, scoring, or freeze changes. Paper only. The P3 bounded-recovery watch remains in place as backstop, unchanged. This note will be updated with live-slot acceptance results as they land; claims below are labeled proven vs in-progress.

## The defect class: empty and dying discovery runs

Three failure modes, each evidenced in the record (workstream docs 30/31/33; fault-observer runs 227/228):

1. **Silent no-op ("empty success").** Slot 2300@2026-10-20: the slot's agent job finished in 4 seconds claiming it invoked `runmarketdiscovery`; the scheduler marked the run SUCCEEDED; **no discovery run row and no handoff were ever created.** Second instance of this signature. Because the scheduler record claimed success while artifact evidence showed nothing, the recovery classifier could only return UNCERTAIN — the slot became a permanent coverage gap with no recovery authority. Root property: **a slot job could report success without any artifact side effect existing.** Success was asserted, never verified.
2. **Ceiling deaths.** A healthy discovery run measures ~101–113s against the platform's 120s space-worker ceiling. Any run that also performs data-tier refresh (tier-freshness alone: 92–96s) exceeds the ceiling and dies mid-flight (2026-10-20 slots 1500 and 1700 both died in this family).
3. **Final-write deaths.** A run completes its work but dies writing its terminal status — SQLite "database is locked" under contention from our own overlapping writer lanes (traced in the 2026-10-21 brief, §1.8: verdict BOTH, our lanes a named contributor).

Net effect across 2026-10-20's ten slots: 3 completed cleanly, 2 completed only via recovery, 2 exhausted, 1 uncertain-empty, the remainder degraded or rescued — i.e., the scan layer's reliability, not its logic, is the binding constraint on everything downstream.

## The fix (three mechanisms)

**A. Verify-or-fail (kills failure mode 1 by construction).** The slot job must verify its own side effect: after invoking discovery, it reads back the discovery run row (id + status). Success may only be reported **with a run id that exists**. If no attributable run row exists, the job retries the invocation once inside the same run, re-verifies, and if still nothing exists it reports **execution FAILURE with the read-back evidence** — converting an unprovable UNCERTAIN into a classifiable proven failure that the recovery watch can act on under the existing P3 rules. A scheduler "succeeded" with no run row becomes impossible by construction of the job body.

**B. Fit the ceiling (failure mode 2).** Tier refresh is separated from the discovery run: a standalone tier-refresh job runs on an offset cadence so slots start with warm tiers and skip the 92–96s in-run refresh. Resume-looping (re-invoke to continue a checkpointed run) is applied **only if** the artifact's resume semantics are proven from code/evidence during diagnosis — discovery run rows carry checkpoint stages, heartbeats, and leases, but resume-on-reinvoke is not assumed. Where resume semantics are absent, tier separation + P3 backstop carry the load, and that limit is stated rather than papered over.

**C. Final-write protection (failure mode 3).** Post-completion read-back: the job confirms the run row reached a terminal status; a stranded non-terminal row with a complete checkpoint set is driven to completion once through the artifact's public actions only — never direct database writes.

**Guardrails held:** decisions remain stamped with their real run times (nothing backdated); one recovery execution per slot remains P3's rule; failed slots remain recorded as coverage gaps; no exhausted retry is reopened.

## Acceptance — status

- **PROVEN (2026-10-21T04:34Z): the verify-or-fail path.** A controlled probe job invoked a deliberately nonexistent action twice (with the in-job retry): both invocations errored, read-backs before and after showed the latest run row unchanged (id 134), and the job **reported FAILURE** with the evidence — the intended outcome. An unverifiable invocation can no longer end as success. No production contamination (no unexpected row appeared).
- **IN PROGRESS:** hardened job bodies deployed slot-by-slot; the next two live slots must complete with real run rows + handoffs (or fail loudly and classifiably — zero silent empties), with run durations reported against the 120s ceiling before vs after tier separation.
- The internal record (diagnosis, exact job-body changes, per-slot results) is maintained as workstream doc 36 and available on request.

## What this fix does NOT claim

It does not backfill the lost 2300 slot (the past is not rewritten; the slot stays a recorded coverage gap). It does not change what discovery computes — candidate quality, vetoes, and scoring are untouched and separately under review (veto-audit proposal P5 / question Q12 in the companion brief). It removes the *empty and silent* failure class; platform overload deaths remain possible but become loud, evidenced, and recoverable instead of invisible.
