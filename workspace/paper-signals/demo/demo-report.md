# Paper-signal build — acceptance demonstration report (WORK ITEM 4/5)

Run at: 2026-10-14T02:25:42.233Z
Mode: **sandbox only** — no production issuance, no live trading. All stores are file-backed sandbox JSON under `demo/evidence/stores/`; strategy ids are `paper-*`, venue `SANDBOX (paper)`.

## Function identity verification (runtime, this run)

| file | expected SHA-256 (hashes.txt) | recomputed | match |
|---|---|---|---|
| equity/server/src/measurement.ts | 9109c826d89919da606e44b80f9b1be7e232a3aef83e53eedde58ca80a4ee0d5 | 9109c826d89919da606e44b80f9b1be7e232a3aef83e53eedde58ca80a4ee0d5 | yes |
| crypto/server/src/actions.ts | 301e270e72a98d1dbcbfcf5d99ce53cc8afb142df77a8c18a514831b2c1a2788 | 301e270e72a98d1dbcbfcf5d99ce53cc8afb142df77a8c18a514831b2c1a2788 | yes |
| equity/server/src/actions.ts | 17eabf4d8d314fcc130f870df692bf1b66edb67b3a6379972f1b712a3f62cd47 | 17eabf4d8d314fcc130f870df692bf1b66edb67b3a6379972f1b712a3f62cd47 | yes |

Live-import reference equality (`imported-gates.ts` re-export `===` source-tree export via direct `createRequire` of `measurement.cjs`):

- PASS — reconstructAndValidateEquityCandidate
- PASS — evaluateEquityIssuanceGate
- PASS — computeEquityDecisionFromRawInputs

Drift check (vendored source ranges re-hashed vs vendor-time hashes): **PASS** (log: `evidence/drift-check.log`).

### Function identities

#### `reconstructAndValidateEquityCandidate` — live-import
- module: paper-signals/orchestrator/src/gates/imported-gates.ts (re-export; loaded live from dist/hidden_files/.../measurement.cjs)
- source: equity/server/src/measurement.ts:304
- sha256: 9109c826d89919da606e44b80f9b1be7e232a3aef83e53eedde58ca80a4ee0d5
- note: zero-import, DB-free module imported live via createRequire; drift impossible at runtime. Internally calls computeEquityDecisionFromRawInputs then evaluateEquityIssuanceGate (born-dead veto, then short-regime bearish-structure gate).

#### `evaluateEquityIssuanceGate` — live-import
- module: paper-signals/orchestrator/src/gates/imported-gates.ts (live re-export)
- source: equity/server/src/measurement.ts:291
- sha256: 9109c826d89919da606e44b80f9b1be7e232a3aef83e53eedde58ca80a4ee0d5
- note: born-dead veto, then short-regime bearish-structure gate for shorts; longs pass once born-dead clears.

#### `computeEquityDecisionFromRawInputs` — live-import
- module: paper-signals/orchestrator/src/gates/imported-gates.ts (live re-export)
- source: equity/server/src/measurement.ts:236
- sha256: 9109c826d89919da606e44b80f9b1be7e232a3aef83e53eedde58ca80a4ee0d5
- note: evidence-window reconstruction (200-bar requirement, Wilder RSI-14/ATR-14 factor replay, 2xATR stop / 1.5R / 2.5R levels).

#### `evaluateBornDead` — vendored
- module: paper-signals/orchestrator/src/gates/crypto-gates.ts (vendored)
- source: crypto/server/src/actions.ts:1219-1224
- sha256: 301e270e72a98d1dbcbfcf5d99ce53cc8afb142df77a8c18a514831b2c1a2788
- note: copied verbatim 2026-10-13 (helpers mean/pct/smaAt/horizonReturn, BORN_DEAD_REASON_PREFIX, hasRecentLowerHighs included); drift policed by tests/drift.js + drift-hashes.json (exact source-range hashes).

#### `evaluateShortRegimeGate` — vendored
- module: paper-signals/orchestrator/src/gates/crypto-gates.ts (vendored)
- source: crypto/server/src/actions.ts:1206-1211
- sha256: 301e270e72a98d1dbcbfcf5d99ce53cc8afb142df77a8c18a514831b2c1a2788
- note: same vendor/drift provenance as evaluateBornDead.

#### `signalIssuanceDecision` — vendored
- module: paper-signals/orchestrator/src/gates/equity-gates.ts (vendored)
- source: equity/server/src/actions.ts:402-416
- sha256: 17eabf4d8d314fcc130f870df692bf1b66edb67b3a6379972f1b712a3f62cd47
- note: copied verbatim 2026-10-13 (helpers average/round/recentLowerHighs included); the exact function the equity discovery scan calls at actions.ts:2155-2165; drift policed by tests/drift.js.

#### `runIssuanceChecks` — sandbox-native
- module: paper-signals/veto/src/veto.ts
- source: n/a (no terminal-tree counterpart)
- sha256: n/a
- note: corrected three-way issuance veto (setup_invalidation + entry_zone + pipeline-order guard), reference implementation for WORK ITEM 2/5 per spec VETO-AUDIT.md. NOT imported or vendored from the terminal tree; the terminal tree has no equivalent function.

#### `checkSetupInvalidation` — sandbox-native
- module: paper-signals/veto/src/veto.ts
- source: n/a (no terminal-tree counterpart)
- sha256: n/a
- note: same sandbox-native provenance as runIssuanceChecks: only bars observed strictly after decisionTime may invalidate; pre-decision extremes are setup features; straddling candles fail closed.

## Demo results

### (a) Qualifying issuance exactly once — **PASS**

Functions exercised:
- `reconstructAndValidateEquityCandidate` [live-import] — equity/server/src/measurement.ts:304 — sha256 `9109c826d899…`
- `evaluateEquityIssuanceGate` [live-import] — equity/server/src/measurement.ts:291 — sha256 `9109c826d899…`
- `computeEquityDecisionFromRawInputs` [live-import] — equity/server/src/measurement.ts:236 — sha256 `9109c826d899…`
- `signalIssuanceDecision` [vendored] — equity/server/src/actions.ts:402-416 — sha256 `17eabf4d8d31…`

- PASS — first tick issues exactly one candidate — `["3104052cf331856f0aef33387df46788"]`
- PASS — exactly one sandbox signal persisted — `202324469933764`
- PASS — issued signal is the equity long — `equity/long`
- PASS — tracker view shows the signal — `202324469933764`
- PASS — alert feed shows the alert (sandbox-feed) — `{"id":"alert_202324469933764","kind":"entry","signalId":"202324469933764","candidateId":"3104052cf331856f0aef33387df46788","symbol":"EQTST1","direction":"long","alertedAt":"2026-07-08T22:00:01.000Z","channel":"sandbox-feed","enqueuedAt":"2026-07-08T22:00:01.000Z","deliveredAt":null,"deliveryStatus":"enqueued"}`
- PASS — candidate outcome is issued with delays — `{"detectionToQualificationMs":14401000,"qualificationToIssuanceMs":0,"issuanceToAlertMs":0,"detectionToAlertMs":14401000}`
- PASS — detection-to-alert delay recorded exactly — `detectionToAlertMs=14401000 expected=14401000`
- PASS — alertedAt propagated to the signal row — `2026-07-08T22:00:01.000Z`
- PASS — second tick issues nothing new — `issued=0 signals=1`

Notes:
- candidateId=3104052cf331856f0aef33387df46788 symbol=EQTST1 direction=long signalDate=2026-07-08
- delays: {"detectionToQualificationMs":14401000,"qualificationToIssuanceMs":0,"issuanceToAlertMs":0,"detectionToAlertMs":14401000}

Evidence: `evidence/demos/a.json`

### (b) Clean abstention: gate failure -> no issuance + suppression row — **PASS**

Functions exercised:
- `evaluateBornDead` [vendored] — crypto/server/src/actions.ts:1219-1224 — sha256 `301e270e72a9…`

- PASS — nothing issued
- PASS — candidate rejected
- PASS — exact gate name persisted: born-dead — `born-dead`
- PASS — exact reason matches the vendored reason string — `born-dead LONG: signal-day low 136.94863923755483 <= invalidation 140.94863923755483`
- PASS — suppression row with gate + reason — `{"id":"sup_7807708374e4206f","candidateId":"a9bf3ba4ed926f34a28bdf681418461c","terminal":"crypto","symbol":"TST2","direction":"long","signalDate":"2026-10-13","gate":"born-dead","reason":"born-dead LONG: signal-day low 136.94863923755483 <= invalidation 140.94863923755483","origin":"orchestrator","at":"2026-10-13T20:00:01.000Z"}`
- PASS — no alert emitted
- PASS — direct vendored call agrees (publish=false) — `born-dead LONG: signal-day low 136.94863923755483 <= invalidation 140.94863923755483`

Evidence: `evidence/demos/b.json`

### (c) Stale inputs: deferred, never issued on stale evidence — **PASS**

- PASS — candidate deferred (not issued, not rejected) — `deferred`
- PASS — stale-evidence reason names the gate — `inputs 120m old, no quote provider configured`
- PASS — next reassessment scheduled (retry backoff) — `2026-10-13T20:15:01.000Z`
- PASS — zero signals on stale evidence — `signals=0 attempts=0`
- PASS — no alert emitted

Flags:
- The freshness gate is orchestrator-internal logic (freshnessMs config + deferred/stale-inputs outcome) — no production function governs it. Sandbox-only by design.

Evidence: `evidence/demos/c.json`

### (d) Expired candidate: rejected with gate=expiry, never issued — **PASS**

- PASS — candidate expired — `expired`
- PASS — exact gate name persisted: expiry — `expiry`
- PASS — reason cites the TTL — `candidate TTL exceeded: detected 2026-10-13T17:00:00.000Z, TTL 3600000ms`
- PASS — suppression row records the expiry
- PASS — zero signals, issuer never entered

Flags:
- Candidate TTL is orchestrator-internal config (candidateTtlMs) — no production function governs expiry. Sandbox-only by design.

Evidence: `evidence/demos/d.json`

### (e) Restart/replay: persisted, store reloaded from disk, re-ingested -> still exactly one signal — **PASS**

- PASS — first manual issue succeeds
- PASS — reloaded store sees the persisted signal — `signals=1`
- PASS — replay resolves to issued, not duplicated — `sig_42c3568f5022fd0db8b3b355`
- PASS — issuer NOT re-entered on replay (attempts unchanged) — `attempts before=1 after=1`
- PASS — same signalId (content-hash identity)
- PASS — tick after restart issues nothing

Flags:
- Idempotency is enforced by the sandbox doubles + orchestrator replay-safety (content-hash identity, replay-safe ingest). The identity-hash pattern mirrors production (equity actions.ts:480-481; crypto actions.ts:1984) but no live production function runs here — sandbox only by design.

Notes:
- first issuance: signalId=sig_42c3568f5022fd0db8b3b355 signals=1 issuanceAttempts=1

Evidence: `evidence/demos/e.json`

### (f) Pre-decision crossing is a setup feature, never a stop-out (no veto) — **PASS**

Functions exercised:
- `runIssuanceChecks` [sandbox-native] — n/a (no terminal-tree counterpart) — sha256 `n/a…`
- `checkSetupInvalidation` [sandbox-native] — n/a (no terminal-tree counterpart) — sha256 `n/a…`

- PASS — issuance verdict is pass (no veto) — `issuance checks pass: post-decision invalidation clear on the final published stop; entry inside the permitted zone.`
- PASS — setup_invalidation passes — `no post-decision extreme crossed the final published stop 98; pre-decision extremes recorded as setup features, not stop-outs.`
- PASS — yesterday's crossing bar recorded as a SETUP FEATURE, never a stop-out — `[{"label":"2026-10-12 UTC session","high":104,"low":95}]`
- PASS — pipeline-order guard passes (final published stop graded) — `veto tested the final published stop 98 (draft stop 99 superseded by the post-decision quote).`
- PASS — all three checks pass

Flags:
- veto/src/veto.ts is a SANDBOX-NATIVE reference implementation (WORK ITEM 2/5), not imported or vendored from the terminal tree — the tree has no equivalent function. Exercised here end-to-end through the veto's own issuance path (runIssuanceChecks).
- The orchestrator issuance pipeline does NOT yet call runIssuanceChecks; this demo proves the veto module's three-way output, not orchestrator integration (integration is a flagged gap).

Notes:
- Note: the pipeline-order guard shares the `setup_invalidation` check label in runIssuanceChecks output (checks[0]); the actual invalidation check is the one carrying detail.preDecisionFeatures (checks[1]).

Evidence: `evidence/demos/f.json`

### (g) Post-decision breach of the final published stop -> veto fires, no issuance — **PASS**

Functions exercised:
- `runIssuanceChecks` [sandbox-native] — n/a (no terminal-tree counterpart) — sha256 `n/a…`
- `checkSetupInvalidation` [sandbox-native] — n/a (no terminal-tree counterpart) — sha256 `n/a…`

- PASS — setup_invalidation FAILS on the post-decision breach — `born-dead LONG: post-decision extreme crossed the final published stop 98 (extreme 97.4 on post-decision 2m (breached)).`
- PASS — reason names born-dead LONG against the FINAL published stop — `born-dead LONG: post-decision extreme crossed the final published stop 98 (extreme 97.4 on post-decision 2m (breached)).`
- PASS — reason cites the post-decision bar — `born-dead LONG: post-decision extreme crossed the final published stop 98 (extreme 97.4 on post-decision 2m (breached)).`
- PASS — issuance verdict is fail_closed (no issuance) — `issuance suppressed (fail-closed): setup_invalidation=fail (born-dead LONG: post-decision extreme crossed the final published stop 98 (extreme 97.4 on post-decision 2m (breached)).)`
- PASS — summary attributes the suppression to setup_invalidation=fail — `issuance suppressed (fail-closed): setup_invalidation=fail (born-dead LONG: post-decision extreme crossed the final published stop 98 (extreme 97.4 on post-decision 2m (breached)).)`

Flags:
- veto/src/veto.ts is SANDBOX-NATIVE (see demo f). The orchestrator's built-in born-dead check (vendored/production functions) covers the SIGNAL-DAY bar; the corrected veto's POST-DECISION invalidation is new logic with no terminal-tree counterpart — exercised end-to-end through runIssuanceChecks.

Evidence: `evidence/demos/g.json`

### (h) Straddling candle: pre-decision portion unisolable -> UNCERTAIN, fail-closed — **PASS**

Functions exercised:
- `runIssuanceChecks` [sandbox-native] — n/a (no terminal-tree counterpart) — sha256 `n/a…`
- `checkSetupInvalidation` [sandbox-native] — n/a (no terminal-tree counterpart) — sha256 `n/a…`

- PASS — setup_invalidation is UNCERTAIN — `issuance-validation unavailable: candle forming 4h (breached) straddles decisionTime and entryTime and its extreme crossed the final stop; the pre-event portion of a straddling candle is never treated as a definite breach, and the actionable-side portion cannot be isolated from OHLC.`
- PASS — reason names the straddle rule — `issuance-validation unavailable: candle forming 4h (breached) straddles decisionTime and entryTime and its extreme crossed the final stop; the pre-event portion of a straddling candle is never treated as a definite breach, and the actionable-side portion cannot be isolated from OHLC.`
- PASS — reason says the post-decision portion cannot be isolated — `issuance-validation unavailable: candle forming 4h (breached) straddles decisionTime and entryTime and its extreme crossed the final stop; the pre-event portion of a straddling candle is never treated as a definite breach, and the actionable-side portion cannot be isolated from OHLC.`
- PASS — pre-decision portion never treated as a definite breach — `issuance-validation unavailable: candle forming 4h (breached) straddles decisionTime and entryTime and its extreme crossed the final stop; the pre-event portion of a straddling candle is never treated as a definite breach, and the actionable-side portion cannot be isolated from OHLC.`
- PASS — issuance verdict is fail_closed — `issuance suppressed (fail-closed): setup_invalidation=uncertain (issuance-validation unavailable: candle forming 4h (breached) straddles decisionTime and entryTime and its extreme crossed the final stop; the pre-event portion of a straddling candle is never treated as a definite breach, and the actionable-side portion cannot be isolated from OHLC.)`

Flags:
- veto/src/veto.ts is SANDBOX-NATIVE (see demo f). Exercised end-to-end through runIssuanceChecks.

Evidence: `evidence/demos/h.json`

### (read-path) Dossier view over a qualifying candidate: zero issuance side effects — **PASS**

- PASS — dossier view 1 returns the candidate, no signal yet
- PASS — dossier view 2 returns the candidate, no signal yet
- PASS — dossier view 3 returns the candidate, no signal yet
- PASS — issuance attempts unchanged — `0 -> 0`
- PASS — zero signals after dossier views
- PASS — zero alerts after dossier views
- PASS — zero suppressions after dossier views
- PASS — readpath.ts statically imports no issuance capability — `clean`
- PASS — candidate still issues via the orchestrator after read-only views

Flags:
- Read-path isolation is orchestrator-internal safety (runtime + static scan) — no production function is involved, by design: viewing a dossier must never be able to issue.

Evidence: `evidence/demos/read-path.json`

## Explicit per-demo verification-status summary

| demo | production-function-backed? | status |
|---|---|---|
| (a) | live import (`reconstructAndValidateEquityCandidate` + `evaluateEquityIssuanceGate` + `computeEquityDecisionFromRawInputs`) at the issuer double; vendored `signalIssuanceDecision` at orchestrator qualification | verified |
| (b) | vendored `evaluateBornDead` (crypto) | verified |
| (c) | freshness gate is orchestrator-internal | **no production function** — sandbox logic, flagged |
| (d) | TTL expiry is orchestrator-internal | **no production function** — sandbox logic, flagged |
| (e) | idempotency pattern mirrors production but enforced by sandbox doubles | **no live production function** — by design, flagged |
| (f) | veto module is sandbox-native reference | **not** imported/vendored production code — flagged; orchestrator does not yet call `runIssuanceChecks` |
| (g) | veto module is sandbox-native reference | same flag as (f) |
| (h) | veto module is sandbox-native reference | same flag as (f) |
| read-path | orchestrator-internal safety | **no production function** — by design, flagged |

## Overall: **ALL GREEN**
