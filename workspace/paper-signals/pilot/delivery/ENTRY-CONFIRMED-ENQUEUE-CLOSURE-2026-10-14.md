# ENTRY_CONFIRMED enqueue closure + timing analysis — 2026-10-14/15

PAPER ONLY. No brokerage, no execution. No model/issuance cadence change, no freeze change.

## (b) Closure of the ENTRY_CONFIRMED enqueue point

**Correction 2026-10-15 (Logan).** No new mechanism was installed for what
the wrapper can actually prove. The installed `paper-signal-cycle` issuance
wrapper (kind=agent, 6h, verified via `cron.view` 2026-10-15) diffs pre/post
snapshots over BOTH enqueue points, with this corrected scope:

The issuance wrapper observes entry-relevant events committed during its own invocation lifetime (pre/post snapshot diff). This does not prove observation throughout the entire entry window. Full-window observation is provided by the watch-only entry worker ticks, which observe persisted awaiting-entry contracts through their original windows.

1. **The wrapper's diff keeps ENTRY_CONFIRMED.** Installed body step 4:
   `new_keys = post_keys MINUS known_keys, keeping only rows with alert_type in
   {SETUP_PENDING, ENTRY_CONFIRMED}`. Every ENTRY_CONFIRMED row committed during
   the wrapped `runpapersignalcycle` invocation is diffed and triggers exactly
   one `cron.run` (commit-before-trigger, no issuer retry — contract rules 1/3).

2. **On the deployed path, ENTRY_CONFIRMED can only be committed during a
   `runpapersignalcycle` invocation.** Evidence:
   - Capability table row 49 (CAPABILITY-TABLE-DEPLOYED-VS-SANDBOX-2026-10-14.md):
     the deployed entry machinery is "single-pass + re-entrant `awaiting_entry`";
     post-window receipts are rejected as entries (`expired` /
     `non-entry:first-print-missed` / fail-closed on insufficient coverage).
   - A candidate whose entry is not observed during the invocation's single-pass
     await stays `awaiting_entry`; the next scheduled invocation (6h later)
     re-enters and voids it `void_expired` — historical reconstruction is never
     an entry, so no ENTRY_CONFIRMED can be committed post-window.
   - The deployed entry tick (Variant A) is not installed (install blocker
     stands — scheduling/JOB-INSTALL-EVIDENCE-2026-10-14.md); the workspace
     `paper-discovery-handoff` lane never writes the deployed paper tables
     (workspace SQLite + inbox only). The wrapper owns every SCHEDULED
     `runpapersignalcycle` invocation (converted in place from the old
     space_action schedule).
   - Edge case, stated plainly: a MANUAL (unscheduled) `runpapersignalcycle`
     invocation commits outside the wrapper. That is covered by the 15-minute
     delivery sweep's missed-trigger recovery (WORKER-SPEC-v2.2 §6), not by the
     trigger — delivery still happens, trigger_source="sweep".

3. **Body text corrected.** The installed body's "What this does NOT cover"
   section previously claimed ENTRY_CONFIRMED had no deployed enqueue point.
   That was the conservative pre-analysis reading; it is replaced (cron.update,
   2026-10-15) with the closure statement below. Behavior unchanged — the diff
   filter already covered ENTRY_CONFIRMED since install.

> Closure statement (now in the installed wrapper body — NOTE: the installed
> body still carries the pre-correction wording; needs a parent cron.update):
>
> The issuance wrapper observes entry-relevant events committed during its own invocation lifetime (pre/post snapshot diff). This does not prove observation throughout the entire entry window. Full-window observation is provided by the watch-only entry worker ticks, which observe persisted awaiting-entry contracts through their original windows.

**The direct hook is now explicitly optional.** Contract fallback (a)
(deployed action calling `cron.run` directly) remains unavailable from this
seat (builder session + open platform question), but it is no longer a
functional blocker: the wrapper diffs every enqueue committed during its own
invocation lifetime — it cannot observe writes committed after it returns —
and the 15m sweep recovers anything outside the wrapper (manual invocations,
trigger-call failures).

## (a) Timing analysis — per-path math

Conventions: T0 = `crypto-market-discovery` completes. W_s = wrapper run start
(≈ T0+45min by schedule phase: wrapper at 05:09/11:09/17:09/23:09 vs discovery
at 04:24/10:24/16:24/22:24 America/Toronto). R = deployed action runtime
inside the wrapper (observed: wrapper mechanical-verification run took
00:38:28Z → 00:42:22Z ≈ 3.9 min total incl. snapshots; action single-pass
await ≤ ~3 min). ε = qualification startup within the action (seconds–minutes).

### Critical correction: the window opens at DECISION, not at discovery

The entry window is W = [decisionAt, decisionAt + 15 min] (frozen entry-v1
semantics; deployed actions.ts `PAPER_ENTRY_WINDOW_MS`). decisionAt is the
qualification/issuance instant (entry-v1 correction 3: "decisionAt must equal
the qualification's actual decision instant, never a backdated bar close;
45-min-late scans record scan time as decisionAt"). Qualification runs INSIDE
the wrapper's `runpapersignalcycle` call, so decisionAt d ≈ T0+45min+ε and

    W ≈ [T0+45min+ε, T0+60min+ε]

The 45-minute offset is discovery→qualification (the sanctioned handoff flow),
not window→wrapper. The wrapper does NOT run 30 minutes after the window
closes; the window opens at the wrapper's own issuance call.

### Path 1 — wrapper as scheduled (6h) — the deployed reality

| Step | Time | Event |
|---|---|---|
| 1 | T0 | discovery completes |
| 2 | W_s ≈ T0+45min | wrapper starts; pre-snapshot |
| 3 | t2 ≈ W_s+ε | `runpapersignalcycle` starts; per-candidate decision instant d ≈ t2 |
| 4 | ≈ d | qualification commits SETUP_PENDING (visible in post-snapshot) |
| 5 | [d, t2+R] | deployed single-pass await observes venue prints live; entry print at t_e ∈ W ∩ [d, t2+R] → ENTRY_CONFIRMED committed in the SAME invocation |
| 6 | t3 ≈ t2+R+ε' | post-snapshot; diff finds SETUP_PENDING (+ ENTRY_CONFIRMED if observed); exactly one `cron.run` at t4 ≈ t3+seconds |
| 7 | t5 | TRIGGERED worker run → render → outbox ack. Measured on TEST probe: trigger_latency_s=147 (run start − issued_at); event→ack 241s, enqueue→ack 130s. Contract acceptance ~60s to be measured on the first real firing. |

- SETUP_PENDING: no window; delivered ≈ T0+50–52min. Covered.
- ENTRY_CONFIRMED observed during the single-pass: ack ≈ d + (t2+R−d) + worker
  latency ≈ d + ~3–8 min < d+15min → `delivered_inside_contract_window = true`
  is reachable. Covered.
- Entry prints arriving in (t2+R, d+15min] (after the action returned): NO
  deployed observer (Variant A not installed) → no ENTRY_CONFIRMED; the
  candidate voids `void_expired` at the next 6h cycle. This is a recorded
  observation outcome, not a delivery gap.
- Verdict: the 6h wrapper diffs every enqueue committed during its own
  invocation lifetime — nothing scheduler-side can perform venue observation —
  but this does not prove observation throughout the entire entry window.
  Full-window observation is provided by the watch-only entry worker ticks,
  which observe persisted awaiting-entry contracts through their original
  windows.

### Path 2 — wrapper at tighter cadence (e.g. every 5m) — NOT the answer

- Technically schedulable: `every` accepts `5m` (pattern `^\d+\s*[smh]$`;
  precedent: `paper-signal-alert-delivery` at 15m, JOB-SPEC drafts 5m).
- Does NOT solve entry observation: the observer is the deployed action's
  single-pass await, not the wrapper. A 5-min wrapper re-invokes
  `runpapersignalcycle` 288×/day → re-runs QUALIFICATION 288×/day (content-hash
  / candidateKey idempotency prevents duplicates, but the issuance CADENCE
  changes from 6h to 5m — a strategy-cadence change = redesign, out of scope).
- Cost: 288 agent workers/day × ~3.9 min ≈ 18.7 agent-hours/day vs current
  4 runs/day ≈ 16 min/day (~72× compute), plus 288 deployed-action market-data
  passes (CoinGecko/Binance budgets tolerate; agent compute does not).
- Verdict: tighter wrapper cadence adds no live observation, conflates the
  issuance and observation cadences the JOB-SPEC deliberately separates, and
  multiplies cost. Rejected — and tightening is never allowed to move
  decisionAt (correction 3: decision times are recorded, never reset to fit
  scheduling).

### Path 3 — direct hook only (contract (a) + deployed entry tick) — the only
real-time full-window observer; NOT closable from this seat

- SETUP_PENDING: contract (a) = deployed `runpapersignalcycle` calls `cron.run`
  after commit. Needs the open platform question answered (can space_action
  code invoke scheduler.cron.run?) + a builder session. Optional now — the
  wrapper covers it.
- ENTRY_CONFIRMED: needs BOTH the deployed entry tick (Variant A, 5m,
  watch-only entry point confirmed) AND its direct `cron.run`. Variant A
  install blocker stands. This is the ONLY path that observes entries live
  across the FULL 15-minute window (tick 5m < 15min ✓; within-tick polls 20s),
  with trigger latency in seconds → delivery inside the window with margin.
- Verdict: remains a parent/builder action item. Nothing in this task's scope
  can install it, and no wrapper cadence substitutes for it.

## (c) Deliverable verdict

**Recommended path: the wrapper as scheduled (6h kind=agent issuance wrapper).**
Evidence: installed body step 4 (verified via `cron.view` 2026-10-15) keeps
ENTRY_CONFIRMED in the trigger diff; deployed semantics prove ENTRY_CONFIRMED
can only commit inside a wrapper-wrapped `runpapersignalcycle` invocation
(capability-table row 49; Variant A not installed; handoff lane never writes
deployed tables); mechanical verification proved the wrap→diff→silence
machinery on the deployed action (run 8: 0 issued, 7 deferred, 1 abstained,
no spurious trigger). The direct hook is explicitly OPTIONAL for delivery
completeness. For genuine real-time observation across the full 15-minute
window, only the deployed entry tick (Variant A) + direct hook suffices — a
builder-session install outside this task's scope; a tighter wrapper cadence
was analyzed and rejected (no added observation, cadence conflation, ~72×
compute).

## Status updates made with this closure

- `paper-signal-cycle` cron body: "What this does NOT cover" replaced with the
  closure statement (behavior unchanged).
- `pilot/delivery/delivery-config.json` → `trigger_contract.status`: ENTRY_CONFIRMED
  marked wrapper-covered; direct hook optional.
- `discovery_mode` stays `sweep-fallback` until the first wrapper-originated
  triggered delivery is proven end-to-end (unchanged acceptance rule).
