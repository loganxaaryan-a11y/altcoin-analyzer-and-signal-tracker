# Runtime addendum — 2026-10-20 (for Q4, the rehost criterion)

Addendum to `expert-brief-2026-10-20.md` **Q4** and the concerns brief. Evidence
from today's (2026-10-20) records only — run IDs, timestamps, counts. Two
things changed since the brief was written this morning: **part of the load
cut has now landed**, and **the deeper cut turns out to be blocked by the
platform itself**, not by a decision. Both facts bear directly on Q4's
either/or ("does the evidence meet the criterion, or should the load cut land
first?").

---

## 1. Today's overload incidents (measured)

All times UTC. "Overloaded" = the artifact action infrastructure rejecting
calls with `space worker overloaded; retry after 2000ms`. Both terminals'
action layers were hit at different points in the day.

| # | When | Lane / run | What failed | What was actually lost |
|---|------|-----------|-------------|------------------------|
| 1 | 13:30Z slot (17:30Z run) | Equity deployed scan, run 31 / batch 14 (`equity-deployed-batch-1330`) | 4 of 15 invocations rejected "overloaded" (inv. 2–4 consecutive, inv. 7); the other 11 succeeded (38–99s each) | No symbols: 101/101 processed. The batch's final wrap-up never ran — symbols finished exactly on the 15-invocation cap, leaving no invocation for finalize, so `done` stayed false. Finalize deferred to the next cycle's auto-resume (batchRunId 14). |
| 2 | 11:30Z slot (15:30Z run) | Equity deployed scan, run 30 / batch 13 (`equity-deployed-batch-1130`) | A different, worse failure class: 1 "service restarted mid-call", then 120s worker **timeouts** on inv. 5 and inv. 7–15 (9 consecutive), plus the final diagnostic call — 12 of 16 calls failed | The scan **stopped at 50/101 symbols** (last verified). Rows checkpoint per symbol, so the next cycle resumes safely — but the 11:30 board was half-built for hours, and the run's true final count could not even be read back at the time. |
| 3 | 17:02:55Z | Crypto issuance trigger poll (fault observer run 212) | Execution **succeeded**; the bookkeeping (receipt/state write) **timed out** | Bookkeeping only. No work lost. |
| 4 | 17:32–17:35Z | Storm cluster (fault observer run 213): crypto issuance-trigger poll **failed** (its handoff read rejected 3× "overloaded", 100s); 9 adjacent-lane runs failed in the same minutes (entry-watch 4×, venue monitor 2×, market-data refresh 2× incl. one run-101-cascade signature, equity refresh 1×); squeeze detector 300s timeout | Fail-safe held (no fire without an observed handoff); recovered by 17:48Z. No handoff missed — handoff 49 was already triggered and the next discovery slot (19:00Z) was unaffected. Polls were delayed, nothing else. |
| 5 | 17:35–18:18Z | Storm tail (fault observer run 214, counts as reported; the window abuts #4) | Entry-watch 5 failed, signal-status monitor 2, crypto market refresh 1, equity market refresh 1, squeeze-detector tick 1 timeout — interleaved with successes | Nothing material; the issuance/delivery core stayed up throughout. |
| 6 | 18:00:02Z | Paper alert-delivery sweep (worker run `run-20261020T180002Z`) | The alerts poll failed on **both** attempts, "overloaded" (~3s apart) | One 15-minute delivery window had **no coverage**. Nothing was actually lost: all 27 production ledger entries were already terminal — nothing was waiting to send. Had a candidate been pending in that window, it would have waited for the next sweep. |
| 7 | 18:17–18:19Z | Trigger polls (entry-prompt run `run-20261020T181902Z`; issuance-trigger 14:17:55 EDT occurrence) | First poll attempt "overloaded" on each; a single retry succeeded on each | Nothing. No fresh keys existed; no fire was missed. |

**Control case, same day:** the 09:30 equity deployed scan (batch 12) ran
completely clean — 0 failures, 101/101, `done=true` in 14 invocations. And
the day's one genuine paper delivery (BAT, 17:04–17:12Z) went through fine.
The pool is not down; it fails **episodically, in clusters**, and the clusters
are what the table above counts: **7 episodes, 6+ lanes, both artifacts.**

One more load fact from the scan logs: even when calls *succeed*, the scan
action takes **40–112 seconds per 10-symbol batch** (batch 12: 9–110s;
batch 13's successful calls: 89–112s, hard against the 120s limit). Our
heaviest legitimate workload is heavy.

## 2. The structural finding: the remaining load cannot be cut with the tools given

Coordinator D's conversion attempt today (log:
`hidden_files/workstreams-2026-10-19/18-contention-batch-log.md`, §D2) is the
second half of this addendum. The scheduler's only no-agent execution kind is
`space_action`: it invokes **one** published artifact action with fixed args.
It has **no workspace file access, no conditional branching, and no ability
to fire another job**. The four deterministic jobs that exist (entry-watch,
the market-data refreshes, signal-status monitor) work precisely because each
is a single self-contained operation inside one artifact's own data.

All five script pollers need at least two of the three missing capabilities
(the issuance trigger needs all three: read handoffs → compare against a
workspace state file → *conditionally* fire another cron → write state + run
log). The artifact's 124 published actions contain no trigger equivalent, and
building one inside the artifact still couldn't dispatch a cron or write the
workspace records the receipt system reads. **Conversions refused on all
five; nothing was weakened to fit.** Consequence: the poller family's
**~1,000+ agent launches/day** (workstream A count, doc 15) stay agent
launches. Unblocking needs a platform script-execution kind, or moving each
poller's state + dispatch inside an artifact that gains a cron-enqueue
capability. Neither is a cron edit.

## 3. What we already did today — judge the remainder, not the pre-fix state

- **D1 consolidation applied** (same log, §D1), coverage verified per job
  before anything was disabled: equity duplicate scan lane → failover-only
  (removes the 4×/day double-scan collisions at 09:30/11:30/13:30/15:30);
  `x-sweep-caller-scan`, `daily-setup-hunt`, `daily-synthesis-brief`,
  `lightweight-surveillance` off; paste-trade feed merged into the daily
  watch; the morning brief's duplicated sweep copy stripped. **~13 agent
  launches/day removed**, zero rollbacks. Schedule now 99 jobs, 83 enabled.
- **Scanner** put on the 30-min cache lane with a single-flight lockfile and
  a stale-cache skip (§D3, verified end-to-end 18:21–18:23Z).
- **Honest timing caveat:** the contention batch completed ~18:24Z. Every
  incident in §1 predates it or overlaps its rollout — **the 13:30 scan and
  both storms are pre-fix evidence.** Post-fix overload rates are *not yet
  measured*. Anyone quoting today's counts as the post-cut steady state
  would be overstating.
- **What would settle it:** the same table, kept for the next 2–3 days of
  deployed runs — overload rejections/timeouts per deployed scan, observer
  storm counts per day, any delivery window left blind. The records already
  exist in the same places this table was drawn from.

## 4. One wart that is ours, not the platform's: the scan wrap-up

Batch 12 (clean day) shows the normal shape: symbols finished on invocation
11, and finalize/wrap-up consumed invocations 12–14 (the finalize call itself
took ~110s) before `done` flipped true. Batch 14 (13:30) finished its
symbols exactly on invocation 15 — the cap — so wrap-up never ran and a
*completed* scan sat unfinalized until the next cycle.

**Our read: this fix does not need expert input.** The 15-invocation cap is
applied by the lane's own driver loop (the run logs record "15 allowed"),
the resume path (`batchRunId`) is the lane's own designed recovery, and the
fix is pacing only: stop feeding new symbol batches when the remaining
invocations are within the observed wrap-up budget (~3), and let finalize
take them. It changes no scoring, gates, data, or artifact behaviour. If
part of the bound turns out to be platform-set, the same headroom logic
works inside whatever cap exists. Flagging it here for completeness, not as
a decision item.

## 5. Honest complication: our own bursts are part of the load

The records do **not** isolate platform fault from self-inflicted load, and
we won't pretend otherwise:

- The 17:32–17:35Z cluster sits on a half-hour boundary where several of
  our own lanes start at once (30-min monitor/scanner lane, triggers,
  refreshes, the observer itself). Known pile-ups at identical start times
  were documented before today (workstream A). D1 removed the *duplicate*
  work, not the *simultaneous starts*.
- But a momentary self-burst does not explain the 11:30 scan: one lane,
  calling strictly sequentially, timed out 9 times in a row over ~18
  minutes — and the 13:30 rejections spread across a ~25-minute run, not a
  single minute. Nor does it explain successful calls routinely taking
  89–112s against a 120s ceiling outside the storm windows.
- We cannot see other tenants of the shared pool from here. "The pool was
  saturated" is the error message's own claim; whose load saturated it is
  not observable from our records.

## 6. Decision asked — and our honest read

**Q4 asks whether the rehost criterion ("proven material runtime
limitation") is met. On today's evidence alone, our read is: not cleanly —
yet.** Three reasons: (1) every incident predates or overlaps today's load
cut, so the reduced-load experiment Q4 proposed has barely begun; (2) our
own schedule bursts are a real contributing cause we haven't yet staggered
away; (3) today's actual losses were small — one scan half-built for hours,
one delivery window blind with nothing waiting, one finalize deferred. No
delivery was lost.

**But the shape of the answer changed today.** Q4's alternative was "cut
the load first, then re-ask." §2 shows that path now has a hard floor: the
biggest remaining cut (~1,000+ launches/day) is not awaiting a pick — the
platform offers no mechanism to make it. So the experiment is now bounded:
D1's cut + staggering the half-hour pile-ups is all the load reduction
available to us. **If overload clusters persist at that floor over the next
2–3 days — above all, if another deployed scan is left incomplete or
another delivery window goes blind — the limitation is proven by
elimination, and the criterion is met without further argument.** If they
fall to isolated, retried-and-recovered rejections, in-place mitigation was
enough and rehost stays parked.

Smallest mitigations available now, if the answer is "not yet": stagger the
:00/:30-boundary lane starts; the §4 headroom fix; keep the retry/backoff
behaviour that demonstrably recovered every incident today except the 11:30
scan. Moving collection out or rehosting (portable code+data, no side-store)
remains the escalation if the 2–3 day measurement says so.

*— Muse, 2026-10-20. Sources: deployed-batch run logs 2026-10-20 (batches
12/13/14); delivery worker run run-20261020T180002Z; trigger run
run-20261020T181902Z; fault-observer state.json + daily log, runs 212–214;
contention batch log §D1–§D3; workstream A doc 15 (launch counts).*

---

## 7. Measurement continuation — 2026-10-20, post-consolidation (partial day)

The §3 caveat stands: the D1 consolidation landed ~18:24Z, so only the
evening hours of 2026-10-20 are post-fix evidence. Three incidents since,
all from fault-observer runs 215–216 and the issuance-trigger state file:

| # | When | Lane / run | What failed | What was actually lost |
|---|------|-----------|-------------|------------------------|
| 8 | ~18:53–19:23Z window | Crypto market-data refresh + crypto paper-entry watch (fault-observer run 215) | 1 failure each, `space worker overloaded` signature, execution NOT-RUN / receipt FAILED, interleaved with successes in the same window | Nothing; both lanes recovered on adjacent runs. Issuance/delivery core unaffected; ledger unchanged (27 entries). |
| 9 | 18:57:53→18:59:54Z | **Crypto discovery slot 15:00 ET** (`crypto-market-discovery-1500`, fault-observer run 216) | Space-worker request timed out after 120s (121s wall). execution UNKNOWN (zero observed side effects), receipt FAILED. 4th occurrence of this timeout signature in the discovery lane | The whole discovery slot: no discovery 127 / handoff 50 was produced. Discovery reliability is now **4 of the last 8 slots faulted; 10 faulted since Oct-17 19:00 ET**. No candidates were lost that existed — none were produced. |
| 10 | 19:42Z | Crypto issuance-trigger poll | `getpaperpilothandoffs` rejected "overloaded" on both attempts; state written with the failure logged; lastTriggeredHandoffId unchanged at 49 | Nothing (no new handoff existed to miss — slot #9 produced none). The 6h `paper-signal-cycle` backstop remains. |

**Reading so far:** the post-fix sample is hours, not days — §6's 2–3 day
test is still the plan. But incident #9 is a new *kind* of loss for the
table: not a delayed poll or a deferred finalize, but a full discovery
slot producing nothing, in a lane that has now faulted in half its recent
slots. If the discovery lane keeps failing at this rate while other lanes
recover, the "clusters persist at the load floor" condition in §6 is
approaching met on the discovery lane specifically, whatever the rest of
the pool does.

*Continuation sources: fault-observer state.json runs 215–216;
paper-issuance-trigger/state.json lastCheck 2026-10-20T19:42Z.*
