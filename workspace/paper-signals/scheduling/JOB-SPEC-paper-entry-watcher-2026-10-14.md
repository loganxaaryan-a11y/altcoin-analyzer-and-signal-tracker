# Job spec — `paper-entry-watcher` (Job 2: bounded watcher schedule)

**Status: SPEC ONLY — NOT INSTALLED.** Two variants below. The VM reference
variant is demonstrated end-to-end (`watcher-demo/watcher-resume-demo.sh`).
The deployed variant has an INSTALL BLOCKER (§4) — do not install it on an
assumed action interface.

## Purpose

Resume pending entries frequently enough to meet their entry windows. The
shortest entry window is 15 min (crypto; `entry-v1/src/entry-rules.ts`
`cryptoEntryWindowMinutes: 15`). Correction 4 (entry-v1/src/watcher.ts): a
cadence coarser than the window cannot observe inside it — the constructor
ENFORCES `pollIntervalMs < windowMs` structurally. The schedule-level version
of the same rule: **watcher-tick cadence must be strictly finer than 15 min.**

Chosen: **interval@5m** — ≥3 resume ticks per crypto window; within each tick
the bounded watcher polls at 20s << window (sandbox config).

## Semantics every watcher run must satisfy (acceptance bar)

1. **DB-only resume:** the tick reloads pending contracts from the persisted
   DB row (`resumeAwaitingEntry` — contract row re-validated, parsed from
   stored JSON, structural pending invariant checked). No in-memory
   registries — a fresh process with an empty heap resumes correctly
   (demonstrated).
2. **Bounded runs:** each tick runs at most `maxPolls` polls per candidate.
3. **Poll-budget exhaustion ≠ expiry while the window is open:** budget
   exhausted → candidate stays `awaiting-entry`, outcome gate `poll-budget`,
   `nextReassessmentAt` = now + retryBackoffMs. Only a CLOSED window may void
   as `void_expired` (proven in the demo, phase A).
4. **Live-observation boundary:** entry captured ONLY while the window is open;
   a post-window fetch is labeled `reconstruction` (research record, never an
   actionable entry).

## Variant A — deployed (primary; INSTALL BLOCKER)

space_action job, interval@5m, on the artifact's watch/resume tick.

**Blocker:** the deployed `runpapersignalcycle` action's internals are
platform-hosted and unverifiable from this workspace. Before installing, the
parent must confirm with artifact access ONE of:

- (i) `runpapersignalcycle` already performs resume ticks on every invocation
  (mirroring the repaired `integratedTick`: pending + deferred-due +
  awaiting-entry-due). Then the watcher schedule is a 5-min space_action on
  `runpapersignalcycle` — BUT qualification would then also re-run every 5
  min. That is idempotent (content-hash identity, dedupe) yet conflates the
  two cadences this spec separates; make it a conscious, recorded choice.
- (ii) a watch-only action/mode exists (or the builder exposes one) that runs
  the resume tick WITHOUT re-running discovery qualification. This is the
  clean wiring this spec recommends.

Do NOT invent action args (e.g. `{"watchOnly": true}`) — an unconfirmed
interface is how phantom integrations happen. Install only on the confirmed
entry point, with its real name and real args.

Draft parameters (fill `action`/`args` after the blocker resolves):

```json
{
  "id": "paper-entry-watcher",
  "title": "Paper entry watcher (resume tick)",
  "owner": "space:altcoin-analyzer-and-signal-tracker",
  "enabled": true,
  "mode": "task",
  "execution": { "kind": "space_action", "slug": "altcoin-analyzer-and-signal-tracker", "action": "<CONFIRMED WATCH ENTRY POINT>", "args": {} },
  "schedule": { "kind": "interval", "every": "5m", "timezone": "America/Toronto", "flexible_time": true },
  "timeout_secs": 600,
  "predicted_connector_permissions": [],
  "retry": { "max_retries": 0, "on_failure": false }
}
```

## Variant B — VM pilot reference (installable now, demonstrated)

kind=agent task cron. Each run is ONE bounded `pilot tick` in a FRESH process
against the sandbox DB — this is exactly what the demo proves. No daemon, no
in-memory state between runs.

```json
{
  "id": "paper-pilot-watcher",
  "title": "Paper pilot watcher (VM reference tick)",
  "owner": "goal:research-terminal",
  "enabled": true,
  "mode": "task",
  "schedule": { "kind": "interval", "every": "5m", "timezone": "America/Toronto", "flexible_time": true },
  "timeout_secs": 600,
  "predicted_connector_permissions": []
}
```

Body (markdown, injected verbatim at each run):

> ## Paper pilot watcher tick — VM reference lane (PAPER ONLY)
>
> You are the watcher-tick worker for the paper-signals sandbox reference
> lane. Paper signals only. No brokerage. No production modifications.
> Holdouts locked. Do NOT change any code, config, or freeze.
>
> 1. Run ONE bounded watcher tick (fresh process, DB-only resume):
>    `cd ~/workspace/goals/research-terminal/paper-signals/pilot && PILOT_DB="$HOME/workspace/goals/research-terminal/paper-signals/pilot/data/paper-pilot.sqlite" node dist/pilot.js tick`
>    This picks up due pending/deferred/awaiting-entry candidates from the
>    durable SQLite store and runs bounded entry observation (poll 20s,
>    maxPolls 40, 15-min crypto window). It resumes from persisted DB rows
>    only — there is no in-memory registry to preserve.
> 2. Do NOT run `ingest` or `run` here — this job is watch-only; qualification
>    is the deployed `paper-signal-cycle` job's remit. (The pilot `tick` never
>    ingests; it only processes existing rows.)
> 3. If the tick reports issued/expired candidates, note the candidate ids,
>    outcome, and entry timing (decisionAt → entryObservedAt) in your final
>    message. A tick that processes 0 candidates is a normal, healthy result
>    — say so plainly.
> 4. Never treat poll-budget exhaustion as expiry: the handler keeps the
>    candidate awaiting-entry with nextReassessmentAt set. If you see outcome
>    gate `poll-budget`, report it as scheduled-resume, not a failure.
>
> Report in your final message: candidates processed, outcomes
> (issued/expired/awaiting/deferred/rejected), and any error text. Keep it
> terse.

## Install notes for the parent

- Variant B is the sandbox reference lane: it watches
  `pilot/data/paper-pilot.sqlite`, NOT the deployed artifact's paper tables.
  Label it as such; it is the demonstrated implementation of the watcher
  semantics the deployed variant must match.
- `timeout_secs: 600` — a bounded tick completes in seconds-to-~2 min even
  with several awaiting candidates (40 polls × 20s max per candidate,
  sequential).
- Cost: a tick with zero due candidates is one SQLite read — negligible. With
  awaiting-entry candidates it makes bounded read-only Binance.US GETs
  (allowlisted paths only).
- Do not install Variant A until the §4 blocker resolves.
