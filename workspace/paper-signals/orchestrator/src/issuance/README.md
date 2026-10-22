# Integrated Issuance Handler (sandbox)

**Workstream A + B of the paper-signal build (2026-10-13). Sandbox only: no
production issuance, no scheduler enablement, no brokerage.**

The single issuance path with the corrected semantics wired end-to-end:
`src/issuance/handler.ts` (`processIntegratedCandidate`, shared verbatim by
`integratedTick` and `integratedManualIssue`), `src/issuance/veto-input.ts`
(`buildIssuanceVetoInput`), `src/persistence/db-store.ts` (SQLite store with
real transactions).

## Call sequence

```
processIntegratedCandidate(deps, candidate, via, invocationId?)
  1. expiry / min-score
  2. freshness-gated cheap refresh (stale -> deferred; never issued on stale evidence)
  3. RETAINED regime gate (equity: evaluateEquityShortRegime — NEW decomposed
     function; crypto: evaluateShortRegimeGate — shorts only)
     // the legacy historical-extreme veto is NOT on this path (see guard below)
  4. buildIssuanceVetoInput(candidate, fresh, now) -> IssuanceVetoInput
  5. runIssuanceChecks (decision→entry corrected veto: pipeline-order +
     setup-invalidation + entry-zone; fail_closed -> reject "issuance-veto")
  6. duplicate suppression (pre-check; re-checked atomically in the outcome tx)
  7. buildPendingContract (entry fields empty; actual decision instant threaded)
  8. QUALIFICATION COMMIT — one DB transaction:
       contract row (pending) + candidate (awaiting-entry, contractId,
       setupAlertAt) + setup alert
  9. entry observation — injectable VenueFeed/WatchClock, observeEntry per
     print; poll cadence enforced strictly finer than the entry window
     (correction 4); live-vs-reconstruction honored
 10. checkPostEntryInvalidation — POST-ENTRY point (governs post-entry, not
     decision→entry); entryValid and interveningInvalidation kept separate
 11. OUTCOME COMMIT — one DB transaction:
       entered     -> signal (claim-guarded) + contract (entered) +
                      candidate (issued) + entry alert
       expired     -> contract (void_expired) + candidate (entry-expired);
                      logged non-entry, never scored
       invalidated -> void_drift / void_no_quote / stopped-at-birth:
                      contract + candidate (invalidated); no valid entry, no signal.
                      (A post-entry stop-out AFTER a valid entry is a realized
                      outcome: the signal IS persisted with the stop-out in
                      detail — never vanished as a non-entry.)
 12. return the final candidate record (tracker + alert event read off the store)
```

State machine (spec §2.1): `qualified -> awaiting entry -> entered | expired |
invalidated`. Three persisted timestamps per signal (spec §2.2):
`setupAlertAt < entryObservedAt <= alertDeliveredAt` — asserted on every entered
fixture.

## The old-veto guard

The legacy historical-extreme veto must not leak back onto this path. Proven
two ways (`tests/no-legacy-veto.test.ts` static + `tests/integrated-handler.test.ts`
behavioral demo-6 fixture):

- **Static:** scans the handler's value-import graph from `handler.ts`; fails if
  `evaluateBornDead`, `signalIssuanceDecision`, or `evaluateEquityBornDead` is
  reachable as an imported name, if the handler references the legacy issuer
  doubles / legacy orchestrator module, or if the `born-dead` literal appears in
  the handler's own source. The one allowlisted emitter of `born-dead ...`
  strings is `veto/src/veto.ts` itself (the corrected veto's own vocabulary).
  The retained regime gates (`evaluateEquityShortRegime`,
  `evaluateShortRegimeGate`) are asserted REACHABLE — the guard must not nuke them.
- **Behavioral:** a crypto fixture whose signal-day bar crossed the stop (the old
  veto blocks it — asserted in-test) issues cleanly when the post-decision path
  is clean.

## Named persistence controls (task B)

Production controls (source-export-2026-10-13) and their sandbox equivalents in
`src/persistence/db-store.ts`:

| Production | Sandbox equivalent |
|---|---|
| `ctx.db<typeof schema>()` — Drizzle ORM over SQLite | `DbStore` over `node:sqlite` `DatabaseSync` |
| `db.batch([...])` atomic multi-write | `transact(fn)` — `BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK` |
| `persistSignalIssuanceBundle({atomicWrite, readAccepted})` (issuance-persistence.ts:11) | `persistSignalIssuanceBundle({atomicWrite, readAccepted, isComplete})` — same shape |
| `issuanceClaim = ctx.invocationId`; `accepted.issuanceClaim === ctx.invocationId` → published vs already_exists | `signals.issuance_claim` + `UNIQUE(identity_hash)`; `INSERT ... ON CONFLICT DO NOTHING`; re-read; claim comparison |
| `.onConflictDoNothing()` conflict backstop | `ON CONFLICT DO NOTHING` on deterministic ids (`ct_<candidateId>`, `sig_<hash>`, `setup_<candidateId>`, `entry_<signalId>`) |

Isolation: SQLite SERIALIZABLE; writers serialized by `BEGIN IMMEDIATE`
(RESERVED lock up-front) + `runExclusive()` in-process async mutex around each
commit scope. Crash between writes → ROLLBACK, no partial state (proven by test).

## Demos

`demo/integrated-demos.ts` — nine integrated demos through the complete handler,
all through the real DB path. Log: `demo/integrated-demo-log-2026-10-13.md`.

## Run

```sh
cd orchestrator && npm test   # build + all 53 tests (26 legacy + 27 new)
cd ../.. && node demo/integrated-demos.ts
```
