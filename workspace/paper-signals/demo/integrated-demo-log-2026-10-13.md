# Integrated Issuance Handler — Ten Demonstrations

Workstream A (integrated issuance handler) + B (DB persistence) + the 2026-10-13 repair
(concurrency guards, late-fetch/stale-print/venue rules, durable awaiting-entry recovery,
waiting-interval veto, alert enqueue vs delivery).
SANDBOX ONLY: no production issuance, no scheduler enablement, no brokerage.
Every demo runs the COMPLETE handler sequence through the REAL DB path
(DbStore over node:sqlite: BEGIN IMMEDIATE / COMMIT / ROLLBACK;
UNIQUE(identity_hash) + issuance_claim = invocationId).

Provenance of the exercised functions:
  - runQualificationChecks / checkWaitingInterval: veto/src/waiting-interval.ts
    (the corrected veto after the 2026-10-13 split: qualification-time checks at step 5,
    the genuine decision→entry veto over the real [decisionAt, entryAt] window at step 9b;
    runIssuanceChecks stays exported from veto/src/veto.ts for its own unit tests)
  - checkSetupInvalidation / checkPostEntryInvalidation: veto/src/veto.ts
    (the ONLY emitter of 'born-dead ...' strings on this path)
  - buildPendingContract / observeEntry: entry-v1/src/pending.ts (corrections 2+3;
    the in-memory pending registry is gone — structural validation, durable across restarts)
  - EntryWatcher cadence rule (poll < window, correction 4): enforced in the handler's observation loop
  - evaluateEquityShortRegime: orchestrator/src/gates/equity-gate-decomposition.ts (retained regime gate)
  - evaluateShortRegimeGate: vendored crypto gate (retained regime gate, unchanged semantics)
  - persistSignalIssuanceBundle shape: crypto/server/src/issuance-persistence.ts:11 (production control)
  - issuanceClaim === invocationId: crypto/server/src/actions.ts:2013-2021 (production claim mechanism)
  - db.batch + onConflictDoNothing: equity/server/src/actions.ts:505-513 (production atomic batch)

## Demo 1 — qualifying issuance exactly once (equity)
Input: equity long, clean post-decision path; next-session open print +0.1% (within the 0.5% drift cap).
Expected path: tick -> regime gate pass -> runQualificationChecks pass -> pending contract ->
  setup alert -> open print observed -> entered -> post-entry clean -> atomic persist -> tracker + alerts.
  [PASS] candidate issued — status=issued
  [PASS] exactly one signal
  [PASS] exactly one contract, entered — entryPrice=250.25
  [PASS] contractId persisted alongside signalId — ct_b25f5669d4194776005fccd02fac8a3f
  [PASS] setup alert + entry alert
  [PASS] setupAlertAt < entryObservedAt (spec §2.2) — 2026-10-13T22:30:00.000Z < 2026-10-14T13:30:00.000Z
  [PASS] tracker shows the signal
  [PASS] alert feed has both alerts
  [PASS] second tick issues nothing

## Demo 2 — clean abstention with gate reason (crypto)
Input: crypto long; the entry print is clean (+0.2%, within the drift cap), but a bar inside
  the REAL decision→entry waiting interval breaches the final published stop (94).
Expected path: tick -> runQualificationChecks pass -> pending contract -> setup alert ->
  entry observed -> checkWaitingInterval fail_closed (breach in the waiting interval) ->
  invalidated, gate=waiting-interval-invalidation; reason names the breach bar and the final
  stop; no signal row, no entry alert. (The decision→entry invalidation moved from the
  speculative step-5 veto to the genuine [decisionAt, entryAt] window at step 9b.)
  [PASS] invalidated — status=invalidated
  [PASS] gate is waiting-interval-invalidation — waiting-interval-invalidation
  [PASS] reason names the breach bar and the final stop
  [PASS] zero signals
  [PASS] entry was observed (contract row entered) before the veto fired
  [PASS] setup alert fired exactly once, no entry alert

## Demo 3 — stale quote rejection (equity)
Input: candidate with inputs 2h old (freshness 30m); quote provider returns null, then recovers.
Expected path: tick -> deferred (stale-inputs), nextReassessmentAt set; no issuance, no contract,
  no alert. Re-tick after recovery -> proceeds to issuance.
  [PASS] deferred on stale inputs — status=deferred
  [PASS] gate is stale-inputs
  [PASS] next reassessment scheduled — 2026-10-13T22:45:00.000Z
  [PASS] no issuance / contract / alert while stale
  [PASS] re-tick after recovery issues

## Demo 4 — expired candidate (crypto)
Input: candidate detected 3h ago, TTL 1h. Expected: rejected gate=expiry; issuer never entered.
  [PASS] rejected with gate expiry — status=expired gate=expiry
  [PASS] reason cites the TTL
  [PASS] issuer never entered

## Demo 5 — restart/replay -> one signal (equity)
Input: issue once, close the DB, reopen over the same file, re-ingest, tick.
Expected: still exactly one signal; same signalId and contractId; tick issues nothing new.
  [PASS] first run issued
  [PASS] replay returns the issued record
  [PASS] still exactly one signal
  [PASS] same signalId and contractId — sig_b25f5669d4194776005fccd0 / ct_b25f5669d4194776005fccd02fac8a3f
  [PASS] tick over the reloaded store issues nothing

## Demo 6 — pre-decision crossing -> PASS (the behavioral old-veto guard)
Input: yesterday's (signal-day) bar crossed the proposed stop (low 93 <= stop 94);
  post-decision 1h bars clean. The LEGACY born-dead veto tests the signal-day candle and
  would suppress this fixture; the corrected veto records it as a setup feature.
Expected path: tick -> veto pass (preDecisionFeatures) -> issued.
  old-veto premise: evaluateBornDead -> publish=false reason="born-dead LONG: signal-day low 93 <= invalidation 94"
  [PASS] old veto would have killed it
  [PASS] corrected veto passes -> issued — status=issued: issued via integrated crypto path; entered 2026-10-14T04:00:30.000Z; entry alert appended to sandbox-feed
  [PASS] exactly one signal

## Demo 7 — genuine setup invalidation -> fail_closed (crypto)
Input: the entry print is clean, but a bar inside the REAL decision→entry waiting interval
  breaches the final published stop (94). The breach evidence lives in the waiting interval
  (moved out of the old speculative step-5 fixture) — test intent preserved: a genuine
  invalidation fails closed.
Expected path: tick -> runQualificationChecks pass -> entered -> checkWaitingInterval=fail ->
  invalidated, gate=waiting-interval-invalidation; reason names the waiting-interval bar and
  the final stop; validatePipelineOrder passes (checked stop == published stop).
  [PASS] invalidated
  [PASS] gate is waiting-interval-invalidation
  [PASS] reason names the waiting-interval bar and the final stop
  [PASS] zero signals

## Demo 8 — straddling uncertainty -> uncertain/fail-closed (crypto)
Input: a forming 1h candle straddles the REAL decision instant (the handler's run time);
  its extreme crossed the stop. The straddle now lives in the waiting interval.
Expected path: tick -> entered -> checkWaitingInterval=uncertain -> fail_closed;
  the pre-event portion is never treated as a definite breach; the straddle rule is cited.
  [PASS] invalidated
  [PASS] gate is waiting-interval-invalidation
  [PASS] verdict is uncertain (fail-closed)
  [PASS] straddle rule cited
  [PASS] zero signals

## Demo 9 — overlapping manual + scheduled calls -> exactly one issuance (equity)
Input: qualifying candidate; integratedManualIssue and integratedTick run concurrently
  (interleaved, same store, distinct invocation ids).
Expected: exactly one signal, one contract, one setup alert, one entry alert;
  the loser returns the existing record (no error, no duplicate).
  [PASS] racing calls complete without error (loser returns accepted state) — status=awaiting-entry
  [PASS] exactly one signal — signals=1
  [PASS] exactly one contract
  [PASS] exactly one setup alert
  [PASS] exactly one entry alert
  [PASS] final state issued with the single accepted signal id — status=issued signalId=sig_b4d1ebcf62a37107dc95d899

## Demo 10 — FINAL ACCEPTANCE: qualify → crash → resume → issue → concurrent loser refused
The full repair chain on one DB file, every step logged with the DB state asserted:
  (1) qualification commits the durable pending state, then the process 'dies';
  (2) a brand-new store on the same file resumes from the DB row → timely valid entry;
  (3) waiting-interval veto passes; issuance is immutable;
  (4) the paper alert carries SEPARATE enqueue and delivery timestamps;
  (5) a conflicting concurrent worker (drift-invalid print after issuance) attempts its
      outcome on a second connection — and returns the accepted state unchanged.
  phase 1: qualifying, then simulating process termination after the qualification commit
  [PASS] phase 1 crashed as simulated (after the qualification commit)
  [PASS] DB state: candidate awaiting-entry — status=awaiting-entry
  [PASS] DB state: contract id is deterministic — ct_18102a0eb98eb79c61ecf6ce8b32de0a
  [PASS] DB state: contract row pending
  phase 1 durable state: contract ct_18102a0eb98eb79c61ecf6ce8b32de0a, decisionAt 2026-10-14T04:00:00.000Z
  [PASS] DB state: setup alert enqueued exactly once
  phase 2: restart — new DbStore on the same file, clock +60s (window still open)
  [PASS] tick resumed the awaiting-entry candidate and issued — issued=[18102a0eb98eb79c61ecf6ce8b32de0a]
  [PASS] DB state: candidate issued — status=issued
  [PASS] contract NOT recreated: same contractId — ct_18102a0eb98eb79c61ecf6ce8b32de0a
  [PASS] DB state: contract row entered
  [PASS] resumed contract keeps the original decisionAt (parsed from the DB row, not rebuilt)
  [PASS] setup alert NOT re-fired on resume
  [PASS] paper alert: enqueuedAt and deliveredAt are separate timestamps — enqueuedAt=2026-10-14T04:02:00.000Z deliveredAt=2026-10-14T04:02:00.001Z
  [PASS] paper alert: delivery recorded
  [PASS] exactly one signal row (immutable issuance)
  phase 3: worker B (second DB connection, WAL) attempts the drift-invalid outcome after issuance
  [PASS] B returned the accepted state unchanged (no error, no write)
  [PASS] final candidate row is exactly A's issued state
  [PASS] final contract row is exactly A's issued state (still entered, not void_drift)
  [PASS] final signal row is exactly A's issued state

---
ALL 10 DEMOS PASSED.
