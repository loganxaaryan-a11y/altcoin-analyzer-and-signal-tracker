# Watcher-resume demo — verdict (2026-10-14)

**Script:** `watcher-demo.sh` (evidence in `evidence/`). **Runtime:** local VM,
`sandbox` pilot, read-only Binance.US market data, sandbox alert transport
(acks SIMULATED and labeled). Paper only, no brokerage.

**Procedural note (honest):** the host service restarted during the scripted
180s gap sleep and the script process was lost at "gap start". The gap itself
(no pilot process alive) completed as designed — 06:44:46Z → 06:51:51Z
(~7 min, longer than the scripted 3 min). The remaining phases were executed
manually with the identical commands the script would have run (fresh
processes, same DB, same env). The log records this.

## Timeline (UTC)

| Time | Event |
|---|---|
| 06:44:39 | Fresh DB; `pilot run` (PID A) with 180s labeled pre-observation hold |
| 06:44:43.646 | Qualification commit: candidate `53bb2a86d2e0fee1f36648122134e684` (BTCUSD long) → **awaiting-entry**; contract `ct_53bb…` **pending**; setup alert enqueued+delivered |
| 06:44:46 | `kill -9` PID A mid-hold → **simulated gap begins (no process alive)** |
| 06:51:51 | **Phase A** — fresh `pilot tick`, `PILOT_MAX_POLLS=0`: processed=1 → **awaiting-entry**, outcome gate **`poll-budget`** ("poll-budget-exhausted, window still open … distinctly NOT an expiry"), contract still pending, `nextReassessmentAt=06:52:51.838Z` |
| 06:53:10 | **Phase B** — fresh `pilot tick`, `PILOT_MAX_POLLS=40`: processed=1 → **issued** |
| 06:54:59.237 | Entry observed (venue ts) — **inside the 15-min window** (window → 06:59:43.646Z) |
| 06:55:02 | Outcome commit → signal `sig_53bb2a86d2e0fee1f3664812`; entry alert enqueued+delivered |

## What this proves

1. **DB-only resume:** Phase A and Phase B were fresh processes with empty
   heaps; both resumed the pending contract from the persisted DB row
   (`resumeAwaitingEntry` re-validated row state `pending`, parsed the stored
   JSON, structural pending-invariant check). No in-memory registry exists to
   have been consulted.
2. **Cadence meets the window:** entry observed 10m15s after decision, inside
   the 15-min crypto window, despite a 7-min process gap — a 5-min watcher
   tick cadence resumes pending entries with margin.
3. **Bounded runs:** each tick ran at most `maxPolls` observation polls
   (Phase A: 0 polls → budget-exhausted; Phase B: ≤40 polls).
4. **Poll-budget exhaustion ≠ expiry:** Phase A outcome gate `poll-budget`,
   status stayed `awaiting-entry`, contract stayed `pending`, reassessment
   scheduled — the window was still open, so nothing was voided.
5. **No alert re-fire:** exactly one setup alert row and one entry alert row;
   the setup alert was not re-fired on resume (dedup key `(signal_id,
   alert_type)`, ON CONFLICT DO NOTHING).
6. **Delays measured:** detection→qualification 3.6s, qualification→issuance
   615.6s (dominated by the deliberate gap), issuance→alert 3.4s.

## Evidence files

- `evidence/watcher-resume-demo-2026-10-14.log` — timestamped run log
- `evidence/status-pre-gap.txt`, `status-post-phaseA.txt` (in log),
  `evidence/status-final.txt` — DB row dumps
- `evidence/sched-demo-2026-10-14-phaseA.jsonl`,
  `evidence/sched-demo-2026-10-14-phaseB.jsonl` — per-cycle evidence
- `evidence/db-rows-final.json` — persisted candidate/signal/contract/alert rows
- `evidence/run-phase0-stdout.log` — phase-0 process stdout
- `data/sched-demo.sqlite` — the durable demo DB (replayable via `pilot status`)
