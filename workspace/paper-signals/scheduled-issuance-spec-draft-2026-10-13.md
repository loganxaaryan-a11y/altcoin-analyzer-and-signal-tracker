# Scheduled issuance step — draft spec (for expert review)

**Status:** draft prepared 2026-10-13 ~19:45 ET by Muse (research stage). Sandbox build this specs is `~/workspace/goals/research-terminal/paper-signals/`. NOT approved, NOT deployed, no production code touched.

## Purpose

Turn detection into actual signals. Today's audit proved the architectural gap: scheduled discovery is intentionally radar-only (equity's scan hardcodes `issuedCount: 0`; crypto discovery never calls its production issuer; all 12 checked crons call nothing on the issuance path), so the tracker only changes when a human issues from a dossier. This step adds the missing scheduled capability: a cron that reassesses shortlisted/watchlist candidates with fresh inputs and calls the existing production issuance functions on qualifiers — the one recommendation from the expert's program ("the biggest win isn't indicator weights — it's connecting timely detection to real issuance with a feasible entry").

## The call chain (what actually gets wired)

One new scheduled action per terminal, each invoking the sandbox-verified `tick()` pipeline (orchestrator/src/orchestrator.ts) pointed at the **production** issuer functions instead of the sandbox doubles:

- **Equity:** `recordSignal` — `equity/server/src/actions.ts:448` (mirrored by sandbox equity-issuer.ts; source hash `17eabf4d8d…`, demo-verified).
- **Crypto:** `issueGeneratedSignalCandidate` — `crypto/server/src/actions.ts:1976` (mirrored by sandbox crypto-issuer.ts; source hash `301e270e72a9…`, demo-verified).

`tick()` reassesses each watched candidate: expiry check → min-score floor → cheap freshness-gated refresh (inputs older than `freshnessMs` get a `quoteProvider.refresh()`; provider failure **defers**, never issues on stale evidence) → qualification on fresh inputs (equity: `signalIssuanceDecision`; crypto: `evaluateBornDead`, then `evaluateShortRegimeGate` for shorts) → duplicate suppression → issuance → alert + delay recording. Dossier/tracker/alert reads cannot issue (proven by runtime + static tests in the sandbox).

## Parameters (defaults from the verified build; expert to confirm)

| Parameter | Default | Notes |
|---|---|---|
| `candidateTtlMs` | 48h | Expired → rejected, gate `expiry` |
| `freshnessMs` | 30m | Inputs older than this trigger cheap refresh; refresh failure → deferred with `nextReassessmentAt` |
| `duplicateWindowMs` | 24h | Same instrument+direction → single issuance, names the winner |
| `minScore` | 0 (disabled) | Score floor is a config, not a veto |
| `retryBackoffMs` | 15m | Deferred candidates get a next-reassessment time, never dropped silently |
| Cadence | 30-min tick | Crypto 24/7; equity tick gated to US regular-session hours + pre-market candidate staging (per the entry-v1 contract: equity fills on next session's open print) |

## The veto gap — must be resolved before this goes live

The sandbox build flagged it honestly: **the orchestrator does not yet call the corrected three-way veto** (`runIssuanceChecks` in `veto/src/veto.ts` — setup_invalidation / entry_zone / pipeline-order guard). Demos (f)–(h) prove the veto module, not its integration. Two honest paths:

- **A (recommended): wire the veto into the orchestrator first**, then schedule. The veto is sandbox-native reference code (no terminal-tree counterpart), so this deploys *new* production logic — it needs the expert's line-by-line review either way.
- **B: schedule with the existing gates only** (vendored born-dead + short-regime), veto deferred. Faster, but reintroduces the known defect the veto was built to fix (pre-decision extremes treated as stop-outs; draft-vs-published stop mismatch; equity checking a bar its evaluator ignores).

Recommendation is A. Either way, state the choice explicitly — no silent fallback.

## Identity, safety, rollback

- **Paper lane:** issued signals carry paper identity (`paper-*` strategy ids, `SANDBOX (paper)`-style venue or the terminal's existing paper lane if one exists — verify before wiring). A sandbox row can never collide with a production issuance row.
- **Replay-safe identity:** deterministic content hash over decision identity (terminal/symbol/direction/signalDate/params); the same candidate reassessed twice issues at most once. Restart/replay demo-verified.
- **Every outcome persists a reason:** `issued` / `rejected` (which gate) / `deferred` (why + next reassessment). Suppression rows exist for abstentions, not just suppression — ranking and missed-opportunity analysis need them.
- **Delays recorded:** `detectionToQualificationMs`, `qualificationToIssuanceMs`, `issuanceToAlertMs`, `detectionToAlertMs` persisted on candidate + signal (asserted to the millisecond in tests).
- **Exposure:** issued paper signals surface in the tracker and alert feed (sandbox demo shows the exact rows). No brokerage execution — paper signals only, standing authorization.
- **Rollback:** disabling the cron stops everything; no partial pipeline state exists outside the orchestrator's store. Read path provably cannot issue, so tracker/dossier views are unaffected by the cron either way.

## Rollout (proposed)

1. **Expert review** of this spec + the sandbox source (hashes in `demo/demo-report.md`, drift-pinned vendored ranges).
2. **Shadow deploy:** cron runs, orchestrator ticks against production watchlists, but issuance calls route to the paper lane only. Run ≥ 2 weeks; record detection-to-alert delays and compare issued-vs-manual.
3. **Graduated:** paper-lane signals promoted to the main tracker/alert feed after expert sign-off on the shadow evidence.
4. **No promotion** of C-2 or any challenger through this path — C-2 collects shadow scores only, per authorization.

## Acceptance (the expert's shape)

Deployed evidence only: run IDs for ≥ 1 full tick cycle, per-candidate traces (issued/rejected/deferred with gates), a compact acceptance table mirroring the 8 sandbox demos, the deployed artifact versions named, and the exact missing capability if any. Sandbox tests (26/26 orchestrator, 24/24 entry-v1, 26/26 veto reference, 8/8 demos) are supporting evidence, not acceptance.

## Open questions for Logan

1. Cadence: 30-min tick for both terminals, or session-aligned for equity (e.g. every 30m 09:30–16:30 ET, hourly overnight for crypto-only candidates)?
2. Alert surface: paper-lane signals in the main alert feed immediately, or a separate paper feed until the shadow period clears?
3. Veto path A vs B (recommended: A).
