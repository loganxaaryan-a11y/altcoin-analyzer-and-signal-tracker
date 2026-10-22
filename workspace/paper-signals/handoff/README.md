# Discovery → Paper Qualification Handoff (sandbox)

**Paper only. No brokerage, no orders. Holdouts locked. No prediction weight changes.**

After a successful crypto discovery run, its fresh radar candidates are handed
AUTOMATICALLY to the repaired paper path — the integrated issuance handler
(`orchestrator/src/issuance/handler.ts`: actionable-entry-v1 contract +
corrected three-way veto incl. `veto/src/waiting-interval.ts` + venue
mapping). The legacy issuer and its historical born-dead veto are unreachable
on this path by construction.

## Layout

```
handoff/
  src/
    discovery-types.ts  # DiscoveryRun / RadarCandidate / FactorRow / DecisionEvidence
    ledger-store.ts     # HandoffStore (node:sqlite): discovery_runs, factor_ledger, handoff_outcomes
    no-legacy.ts        # RUNTIME guard: banned-identifier self-scan + repaired-path identity check
    map-candidate.ts    # strict RadarCandidate -> PaperCandidateInput (never fabricates)
    feeds.ts            # scripted (DEMO ONLY) vs binance (operational, read-only) feed bundles
    qualify.ts          # runHandoffRun: guard -> freshness -> LEDGER FIRST -> qualify -> record
    handoff-run.ts      # CLI entrypoint
  tests/
    no-legacy-issuer.test.ts   # STATIC import-graph guard (twin of the runtime guard)
    ledger-enforcement.test.ts # ledger-before-qualification + outcome reason codes
    run.ts
  demo/
    make-demo-run.ts    # synthetic discovery-run builder (SANDBOX DEMO DATA)
  inbox/                # discovery-*.json files land here (demo file included, labeled)
  evidence/             # handoff reports + http call logs
  data/                # handoff.sqlite + per-run orchestrator sqlite (created on run)
```

## The trigger (automatic)

**`paper-discovery-handoff`** — goal-owned cron (`goal:research-terminal`),
interval 6h, phased ~45 minutes after `crypto-market-discovery` (discovery at
04:24/10:24/16:24/22:24 → handoff at 05:09/11:09/17:09/23:09 America/Toronto).

Each firing, the worker:
1. Reads the latest *successful* `crypto-market-discovery` run's radar
   candidates from the artifact run history (`altcoin-analyzer-and-signal-tracker`).
   If the discovery run failed — or its output is unreachable — the handoff
   is SKIPPED and the miss is reported. Candidates are never fabricated.
2. Writes them verbatim to `handoff/inbox/discovery-<ISO>.json` (the
   `DiscoveryRun` schema; see `src/discovery-types.ts`).
3. Runs `node src/handoff-run.ts --feed binance --run <that file>` from
   `handoff/`. (`--feed scripted` is DEMO-ONLY and refused for non-demo runs.)
4. Reports counts + reason codes briefly; escalates only on failures or
   anomalies (zero-candidate runs, stale runs, exceptions).

Why a scheduled follow-up instead of an in-artifact callback: the discovery
schedule is space-owned (`space:altcoin-analyzer-and-signal-tracker`) and
invokes the artifact's `runmarketdiscovery` action directly; chaining inside
it would touch space-owned scheduling. The follow-up cron is the sanctioned
mechanism (spec: "event, callback, or scheduled follow-up").

## Pipeline (per discovery run)

0. **Runtime guard.** `assertNoLegacyIssuer()` scans every handoff source for
   banned identifiers (legacy issuer names, born-dead veto names, legacy
   issuer double modules, legacy orchestrator module) and throws
   `LegacyIssuerBlockedError` on any hit. `assertRepairedPathIdentity()`
   then verifies the resolved handler module exports `processIntegratedCandidate`
   and none of the banned exports. The static twin
   (`tests/no-legacy-issuer.test.ts`) walks the full import graph and asserts
   the same for every transitively reachable module, against an explicit
   allowlist. (The guard's own source builds its patterns from fragments so
   it can never trip on its own documentation.)
1. **Discovery freshness.** A run older than `maxDiscoveryAgeMs` (default 8h)
   never qualifies — every candidate is recorded `failed/stale-discovery-run`.
   Ledgers are still persisted (faithful record of what discovery emitted).
2. **LEDGER FIRST.** The complete factor ledger (`{label, score, weight,
   contribution}` rows exactly as discovery emitted them) plus the
   decision-time evidence (signal-day candle, history closes/highs,
   currentPrice, asOf, veto bars, entry levels) is persisted per candidate
   BEFORE any qualification runs. `requireLedger()` throws
   `MissingLedgerError` for absent/incomplete ledgers — **no ledger, no
   qualification**. Missing evidence fields persist as null and stay
   unknown, never fabricated.
3. **Qualify.** Each candidate is strictly mapped to `PaperCandidateInput`
   (missing/incoherent entry levels → `failed`, never invented), ingested,
   and run through `processIntegratedCandidate(deps, rec, "automatic", …)`
   — the frozen v2.1.5 executables, unchanged. Entry observation uses the
   configured feed bundle (binance-spot venue prints; crypto fails closed
   with no waiting-interval evidence).
4. **Record.** One outcome row per candidate in `handoff_outcomes`:
   - `qualified` — paper signal issued (`issued`), or pending entry contract
     awaiting the venue print (`qualified-awaiting-entry`).
   - `abstained` — exact reason code = the handler's gate (`short-regime`,
     `issuance-veto`, `min-score`, `duplicate`, `expiry`, `entry-expired`,
     `waiting-interval-invalidation`, `post-entry-invalidation`,
     `entry-drift`, `entry-no-quote`, `evidence-insufficient`).
   - `deferred` — reason (`stale-inputs`, …); picked up by reassessment.
   - `failed` — handoff-level, never a prediction (`no-factor-ledger`,
     `missing-entry-levels`, `missing-signal-day`, `missing-history`,
     `incoherent-levels`, `stale-discovery-run`, `handoff-exception`).

## Versioning

Active comparison freeze stays **v2.1.5** (`comparison/freeze-manifest-v2.1.5.json`).
This handoff adds new operational executables but changes NO frozen
semantics: no factor list/weight/scoring/level/gate/entry-rule/cost-model/
horizon/decision-time/veto-semantics/venue-mapping/evaluator change. Per the
freeze discipline ("new freeze/version only if executables change; document
otherwise"), the frozen executables are imported unchanged (hashed in the
v2.1.5 manifest); the new handoff sources are documented here, not frozen.

Handoff source hashes (sha256, 2026-10-14 — recompute with
`sha256sum src/*.ts tests/*.ts demo/*.ts` if edited):
```
61533b1296035c313e402c9c9e6a0833d7040e216eb6f947c3d0b266b55dca30  src/discovery-types.ts
b865869809e5e68276089b901281d166724c1918520875edcd72b26291d837c2  src/feeds.ts
2e921ce68837528684892bd35d7bf8ee5bcf0759d63bb21b9544fc8ffe5a1e28  src/handoff-run.ts
0d32e9bc3a6b158ea462eafdd7c382416f80a7ec28c53dfe7e807f9ed769a1de  src/ledger-store.ts
fd3cfe24ba7e365c45a81090dcce25280b01e891e9862654d519668fee64ea79  src/map-candidate.ts
22c01f1485b2ab3b7ad75bfb8f978db385aa294ebf1f3a8257079f41b5e7dff2  src/no-legacy.ts
25fb6ab20fb97db0cdce2d17154ed392b05056415bf9f4d13a7bd7862c68b02f  src/qualify.ts
42db8d238f1aa1ae1b22d68ad34fcb70d4411602e100029b4cc04b999866feec  tests/ledger-enforcement.test.ts
81cf846f9a8206ff794a8cee8cc78cc944740ebe9bf3264f1371207bcbfe31a8  tests/no-legacy-issuer.test.ts
a7e97bae7861d8c8acb8a55adcd6b9a45d9dc35ea6ddaf0694e848b430856973  tests/run.ts
0f3dc2da7f80c85d03d28d963ec4a29b693aec0edd3e219b31e496fb7d72ef7f  demo/make-demo-run.ts
```

## Demo

```sh
cd paper-signals/handoff
node demo/make-demo-run.ts demo-2026-10-14   # synthetic run -> inbox/ (labeled demo:true)
node src/handoff-run.ts --feed scripted       # ledger-first -> repaired path -> report
node --test tests/no-legacy-issuer.test.ts tests/ledger-enforcement.test.ts
```

Expected demo outcome: qualified=1 (DEMO1 issued), abstained=2 (DEMO2
short-regime, DEMO3 issuance-veto), deferred=1 (DEMO6 stale-inputs), failed=2
(DEMO4 no-factor-ledger, DEMO5 missing-entry-levels). Report:
`evidence/handoff-report-<runId>.json`. All demo data is labeled
`DEMO-SCRIPTED-*` / `demo:true`; scripted venue prints are refused for
non-demo runs.

## Operational notes

- 2026-10-14 (trigger acceptance run): the scheduled worker found that
  `pilot/src/binance.ts` used a TypeScript parameter property
  (`constructor(private readonly symbol: string)`), which Node's strip-only
  type-stripping rejects (`ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`) when the
  handoff imports the TS source directly for `--feed binance`. Fixed with a
  semantics-preserving rewrite (explicit field + assignment). Behavior
  unchanged; `pilot/dist` (compiled) untouched; `binance.ts` is not among the
  v2.1.5 frozen executables, so no freeze event — documented here.
- 2026-10-14 (trigger acceptance run): first live firing consumed real
  discovery run 56 (completed 2026-10-14T02:26:13Z, 0 radar candidates) →
  inbox `discovery-2026-10-14T02-26-13-665Z.json` → report
  `evidence/handoff-report-56.json`, counts 0/0/0/0. Faithful empty run.

## What this does NOT do

- No prediction weights live here; scores/levels come from discovery verbatim.
- No legacy issuance path is reachable (static + runtime guards).
- No brokerage, no orders — Binance usage is public GET market data only.
- No accepted recovery work reopened; no holdout touched.
