# Slim-down map — research terminal system
Drafted 2026-10-22 (~04:15 EDT) for Logan's approval. Nothing has been changed yet — this is the plan, not the rebuild.

## The problem in one paragraph
The work is light; the wrapping is heavy. Watching and settling 13 paper positions is seconds-to-minutes of plain code — the directed recovery pass at 06:45Z did the whole book directly, gap-free. What makes everything slow is ~42 enabled jobs for the two terminals, most of them agents passing ~1.3 MB artifact payloads to each other, plus proof machinery (leases, attestations, four-part confirmations) bigger than the pipeline it guards. Rough count: ~3,200 scheduled runs/day for terminal machinery. Tonight's enrollment failure was this, exactly: monitor + settle are fine scripts; the agent round-trips around them ate the whole 30-minute budget before enrollment's turn.

## The target — what runs after the slim-down
Three pipeline jobs, total. Everything else either folds into them, parks, or dies.

1. **paper-engine** (hourly) — one deterministic script run, no agent judgment inside: refresh prices → enroll → monitor → settle → discovery scan → issuance (while enabled) → write small snapshot files. The terminals read the snapshots. Target: a full run in under 5 minutes, or it fails loudly in the run log.
2. **daily-digest** (daily) — one message: new entries, settlements, book state, and engine health = "last engine run finished at HH:MM." This replaces the 30-min digest, the fault observer, and the separate cohort reports.
3. **weekly-review** (Mondays) — the performance table + issued-cohort report, as one digest section.

Plus the research layer Logan actually reads, untouched: Big Updates morning edition, X smart sweep + digest forward, feed skim, Telegram sweep, smart-sources sweep. Those are editorial, not pipeline.

Estimated result: ~42 enabled terminal jobs → ~6, and ~3,200 runs/day → ~40.

## STAYS (the useful core)
- **The paper book itself** — positions, frozen levels, append-only outcomes. Plain files, zero jobs, carried over untouched.
- **monitor.py / settle.py / enroll.py** — proven tonight (full recovery, gaps 0, correct settlements). They stop being "lanes" and become steps inside the one engine script. No logic changes.
- **Discovery** — the candidate finder stays. What dies is its ten separate daily slot jobs plus recovery-watch/handoff/trigger chain; it becomes one step in the engine.
- **Issuance** — the frozen v2.1.5 contract and the bounded-work guard stay exactly as they are; the engine calls the issuance action once per run instead of a 5-minute polling cycle doing it.
- **Both terminals as displays** — fed by the engine's small snapshot files instead of computing over their full history tables on every read. (The equity terminal has the same disease at smaller scale: 3 jobs → its scan and its daily fill/outcome recording become steps in the engine's daily pre-open pass.)
- **Theory discovery/synthesis** (12h, both terminals) — the research brain of the terminals; cheap at this cadence, not part of the weight problem.
- **The cheap truth-keepers** — frozen levels, append-only outcomes, the performance table, evidence grades. All just files. They cost nothing and they're what stops factual drift.

## PARKS (job off, code and data kept, one-line revival note each)
- **Challenger R1 shadow + comparison collection + abstain sample** — Phase-1 measurement of a machine that doesn't run reliably yet. Data collected so far stays frozen. Revival: turn collection back on ~2 weeks before the Dec 16 review, if wanted.
- **Paper pipeline fault observer** — replaced by the engine's own finish/fail line in the daily digest. An observer that itself times out and reads stale state is worse than none.
- **P3 discovery recovery watch** — the engine is idempotent and reruns hourly; a failed run retries itself next hour. No separate recovery lane.
- **Discovery mining (daily)** — measurement; parks with the challenger.
- **TraderSpy pilot** — snapshots stay on disk; grading pauses.
- **Squeeze detector (3 jobs) + equity deployed batches (4 jobs)** — equity discovery folds into the engine's daily pass; the separate tickers park.
- **Terminal morning brief + daily trading board** — overlap Big Updates and the digest. One morning product survives (Big Updates); these park until missed.
- **Thesis watchers, paste.trade watch, weekly calibration bout** — editorial extras; park, revive if missed.

## DIES (definitions deleted; history stays in files)
- **crypto-paper-entry-watch (every 1 min — 1,440 runs/day, the single biggest item).** The 15-minute in-window premise was already superseded by terminal-first; entry timing moves inside the engine.
- **The 5-minute pollers**: crypto-market-data-refresh, crypto-signal-status-monitor, paper-pilot-watcher. Status becomes a file the engine writes; market data refreshes inside the engine and on terminal reads.
- **paper-research-refresh as a separate job** — HL cache, scanner, shortlist snapshot all become engine steps.
- **mirror-terminal-state** — its job (cheap state reads) is absorbed by the engine writing snapshots directly.
- **The zombie definitions** — ~17 already-disabled leftovers from retired designs (issuance trigger, entry-prompt trigger, alert delivery, discovery handoff, signal cycle, alert drains, signal explainer, and friends). Deleting them removes accidental re-enables and declutters every future audit.
- **The proof machinery as a pattern** — leases, attestation files, multi-part confirmation checks. Replaced by one rule: the engine finished and wrote its snapshot, or the digest says it didn't.

## What does NOT change
PAPER only. Frozen strategy v2.1.5, thresholds, gates, holdouts. The current book (13 entries, 6 settled, +1.50R gross) and every historical record. Evidence rules. The entry hold stays in force until the engine runs clean unattended — same bar as before, reached by a simpler road.

## Order of work, if approved
1. Write engine.py as a sequencer around the existing scripts — no new logic.
2. Builder pass: point both terminals at the snapshot files (the only artifact work).
3. Shadow-run the engine 24h beside the old lanes; book state must match exactly.
4. Flip: disable the old lanes, delete zombie definitions, enable the 3 jobs.
5. Park the measurement stack with revival notes. The 6 prepared venue mappings ride in with the flip, rechecked at application as already planned.

Decision needed from Logan: approve the shape, or move items between columns first.
