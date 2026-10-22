# Paper-Signal Issuance Orchestrator (sandbox)

**Work item 3 of 5 — research-terminal. Sandbox only. This code must NEVER call
production issuance; it is wired exclusively to sandbox doubles of the issuer
interface. No production code was changed. Holdouts locked.**

The single issuance orchestrator for the paper-signal lane: it takes shortlisted
/ watchlist candidates, reassesses each with fresh inputs against the existing
qualification rules, and issues through sandbox doubles that mirror the
production issuer interfaces (`recordSignal` for equity, `issueGeneratedSignalCandidate`
for crypto). One code path serves both the manual entry point and the automatic
tick.

## Layout

```
orchestrator/
  src/
    orchestrator.ts        # THE orchestrator: tick() + manualIssue() + processCandidate()
    readpath.ts            # dossier read path — provably cannot issue
    types.ts               # candidate lifecycle, outcomes, delays, config
    util.ts / clock.ts     # stableJson/sha256, injectable clock
    gates/
      crypto-gates.ts      # VENDORED evaluateBornDead + evaluateShortRegimeGate (+ helpers)
      equity-gates.ts      # VENDORED signalIssuanceDecision (+ helpers)
      imported-gates.ts    # REAL IMPORT of reconstructAndValidateEquityCandidate,
                           # evaluateEquityIssuanceGate, computeEquityDecisionFromRawInputs
                           # from equity/server/src/measurement.ts (live import)
    issuers/
      sandbox-store.ts     # file-backed JSON store (read/write namespaces separated)
      equity-issuer.ts     # sandbox double mirroring recordSignal (actions.ts:448)
      crypto-issuer.ts     # sandbox double mirroring issueGeneratedSignalCandidate (actions.ts:1976)
  tests/
    run.ts                 # 26 tests (node:test)
    drift.ts               # drift check: fails if any vendored source range changes
    drift-hashes.json      # pinned sha256 of each vendored source range
    fixtures.ts            # deterministic synthetic bars/candidates
  scripts/postbuild.mjs    # renames tsc-emitted measurement.js -> .cjs (CJS scope fix)
  data/                    # default sandbox store location (created on first run)
```

## Imported vs vendored (with hashes)

**Live import** (no copy; drift impossible at runtime):
- `reconstructAndValidateEquityCandidate` — `equity/server/src/measurement.ts:304`
- `evaluateEquityIssuanceGate` — `equity/server/src/measurement.ts:291`
- `computeEquityDecisionFromRawInputs` — `equity/server/src/measurement.ts:236`

Source root for all refs: `~/workspace/goals/research-terminal/hidden_files/source-export-2026-10-13/`.
measurement.ts has zero imports, so it loads cleanly via relative import
(`createRequire`, because the source tree has no `"type": "module"` and tsc
emits it as CommonJS — see `scripts/postbuild.mjs`).

**Vendored** (faithful verbatim copies; the hosts `crypto/server/src/actions.ts`
and `equity/server/src/actions.ts` carry DB/network deps and can't be imported):

| Unit | Source | Lines |
|---|---|---|
| `mean`, `pct`, `smaAt`, `horizonReturn` | crypto actions.ts | 706, 712, 720, 763–765 |
| `BORN_DEAD_REASON_PREFIX`, `hasRecentLowerHighs` | crypto actions.ts | 1194, 1195–1205 |
| `evaluateShortRegimeGate` | crypto actions.ts | 1206–1211 |
| `evaluateBornDead` | crypto actions.ts | 1219–1224 |
| `average`, `round` | equity actions.ts | 103, 109 |
| `recentLowerHighs` | equity actions.ts | 388–401 |
| `signalIssuanceDecision` | equity actions.ts | 402–416 |

Range hashes: `tests/drift-hashes.json` (crypto blob `2e92062f…`, equity blob
`31258ae2…` — full values in the file). `npm run drift` re-hashes the live
source ranges and fails on any change, forcing re-vendor + re-verify.
Each vendored file carries a header naming the source file, line ranges, and
copy date.

## Pipeline (single code path)

`processCandidate` — shared verbatim by `tick()` (automatic) and `manualIssue()`:

1. **Expiry** — `now - firstSeenAt > candidateTtlMs` (default 48h) → rejected, gate `expiry`.
2. **Min-score floor** — `score < minScore` (default 0 = disabled) → rejected, gate `min-score`.
3. **Freshness-gated cheap refresh** — inputs older than `freshnessMs` (default 30m)
   get a cheap `quoteProvider.refresh()` (watched candidates only; the orchestrator
   never rescans the universe). Provider failure → **deferred** with
   `nextReassessmentAt = now + retryBackoffMs`, never issued on stale evidence.
4. **Qualification on fresh inputs** — equity: vendored `signalIssuanceDecision`;
   crypto: vendored `evaluateBornDead`, then `evaluateShortRegimeGate` for shorts.
   Failures → rejected with the gate (`born-dead` / `short-regime` / `evidence-insufficient`).
5. **Duplicate suppression** — same instrument+direction already issued within
   `duplicateWindowMs` (default 24h) → rejected, gate `duplicate` (names the winner).
6. **Issue via sandbox doubles** — they re-validate (equity: the REAL imported
   reconstruction + gate; crypto: vendored vetoes) and enforce idempotency
   (content-hash identity / idempotency key), exactly like production.
7. **Alert + delays** — sandbox-feed alert appended; `detectionToQualificationMs`,
   `qualificationToIssuanceMs`, `issuanceToAlertMs`, `detectionToAlertMs` persisted
   on the candidate record and the issued signal.

Every outcome persists a per-candidate reason: `issued` / `rejected` (which gate)
 / `deferred` (why + next reassessment time). Candidate identity is a deterministic
content hash over decision identity (terminal/symbol/direction/signalDate/params) —
the same candidate reassessed twice issues at most once.

## Safety

- **Read path isolation** (`src/readpath.ts`): `viewDossier` / `trackerView` /
  `alertFeed` import only the `ReadStore` interface and types — never the
  orchestrator, never an issuer double, never a gate. Proven by a runtime test
  (dossier views over a qualifying candidate → zero signals/alerts/issuance
  attempts) AND a static test (fails if the file ever references issuance
  capability).
- **Sandbox identity space**: strategy ids `paper-*`, venue `SANDBOX (paper)` —
  deliberately disjoint from every production id, so a sandbox row can never
  collide with a production issuance row.
- **File-backed store only** (`data/sandbox-store.json`, atomic tmp+rename
  writes). No DB, no network, no production writes anywhere in this tree.

## Run

```sh
npm install        # once
npm test           # build + 26 tests (node:test)
npm run drift      # build + drift check (vendored ranges unchanged upstream)
```

## Test coverage (26 tests, all green)

- crypto qualifying long issues exactly once across repeated ticks
- crypto issuer double idempotent at the issuance layer (`published` → `already_exists`)
- born-dead long abstains cleanly with the gate reason persisted
- short without bearish structure rejected by short-regime gate; short with it issues
- duplicate instrument+direction within window → single issuance
- expired candidate rejected with gate `expiry`
- detection-to-alert delays recorded exactly (asserted to the millisecond)
- stale inputs defer (never issue on stale evidence), then issue when fresh inputs arrive
- min-score floor abstention; manual path shares the pipeline (issue + abstain + idempotent re-issue)
- restart/replay: store reload + same input → exactly one signal, issuer not re-entered
- equity qualifying long issues exactly once via the REAL reconstruction; born-dead rejected; qualifying short issues
- vendored equity gate rejects short with no bearish structure; vendored-vs-real agreement on both fixtures
- read-path isolation: runtime (zero side effects) + static (no issuance imports)
- candidate identity deterministic under live-price/timestamp noise; ingest replay-safe

Plus 3 drift tests: both vendored range hashes match the live source tree, and the
live-imported measurement.ts still exports the issuer's functions.
