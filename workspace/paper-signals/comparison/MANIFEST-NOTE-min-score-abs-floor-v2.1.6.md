# Manifest note — min-score |score| strength-floor correction (handler v2.1.6)

Date: 2026-10-14. Paper signals only. No brokerage, no holdout touched.
Prediction weights UNCHANGED: crypto production 17.0, crypto C-2 15.5, equity 90.
No prediction-factor, level, gate, entry-rule, cost-model, or veto-semantics change.

## Gate-code finding (read at the actual gate, not the docs)

Live gate: `paper-signals/orchestrator/src/issuance/handler.ts` —
`processIntegratedCandidate` (the integrated issuance path the equity and crypto
handoffs both run; imported from the compiled
`orchestrator/dist/paper-signals/orchestrator/src/issuance/handler.js`).

OLD logic (handler.ts:1534, pre-correction):

```ts
// 2. Min-score floor.
if (candidate.score < config.minScore) {
  return reject(deps, candidate, "min-score",
    `score ${candidate.score} below orchestrator floor ${config.minScore}`, via);
}
```

The score is SIGNED-directional: negative = short direction, magnitude = strength.
Equity evidence — `equity-discovery/scan/gates.py:136`:

```python
direction = "long" if score >= 20 else ("short" if score <= -20 else "mixed")
trade_direction = "long" if score >= 0 else "short"
```

and the 43 rejected shorts all carried direction=short with negative scores.
With the default `minScore = 0` (`types.ts:217`: "Score floor (0 = disabled)"),
`score < 0` rejected EVERY short — so the documented "0 = disabled" was false for
shorts. All 43 equity shorts died at this gate purely as a sign artifact, none
were evaluated on strength.

Identical bug in the demo/test pipeline gate
(`orchestrator/src/orchestrator.ts:293`, `processCandidate`) — corrected to match.

## Correction (v2.1.6)

New logic (both gates):

```ts
if (Math.abs(candidate.score) < config.minScore) {
  return reject(deps, candidate, "min-score",
    `|score| ${Math.abs(candidate.score)} below orchestrator floor ${config.minScore}`, via);
}
```

Strength floor applied AFTER direction qualification: direction is already decided
upstream (carried on the candidate record) and the short-regime veto remains a
separate, later gate. Threshold value PRESERVED (0 stays 0).

**Explicit disclosure on the vacuity:** with minScore = 0 the corrected floor is
`|score| >= 0`, which passes every candidate — the floor is vacuous. That is the
documented intent of "0 = disabled", now genuinely implemented. A meaningful
strength floor would require minScore > 0 (e.g. 20 would mirror the discovery
mixed-band boundary ±20; 40–50 would gate only strong setups). No new threshold
was invented: the value stays 0 and this note records the consequence — the floor
is currently a no-op for both directions.

## Versioning / hashes

`ISSUANCE_HANDLER_VERSION = "2.1.6"` exported from
`orchestrator/src/issuance/handler.ts` (asserted by a regression test).

sha256:
```
a388bb801b1688757680c22eb4ff69ea2d5b46dc8ab31ada60a0b23f27ee48b8  orchestrator/src/issuance/handler.ts
4d5fa84a8279a49d282dc1c2864633c7d57d6d33f46a930f50af7837d8dd6667  orchestrator/src/orchestrator.ts
a16ff47ed2b8c0e1a6d1409151d3ba883ef0206680e2934bff374ae67429a8bc  orchestrator/tests/min-score-abs-floor.test.ts
21df89320f7c3ee48c6a06658687c7cc5b4d81c0ec1e388e98bf1fab8ac59921  orchestrator/dist/paper-signals/orchestrator/src/issuance/handler.js (executable used by handoffs)
504153ead184ee19de0f74f7c0ecce3299a0c75d0a821b72510cf1488c6aeafa  orchestrator/dist/paper-signals/orchestrator/tests/min-score-abs-floor.test.js
```

Build caveat (pre-existing, unrelated): `npm run build` emits with one tsc error
in `tests/first-print-substitution-regression.ts:109` (`contract_json` vs
`ContractRow.contractJson`) — pre-existing, untouched by this change. tsc still
emitted (no `noEmitOnError`); the dist `handler.js` above carries the correction,
and `measurement.cjs` from the earlier postbuild remains in place.

## Regressions (all green)

- NEW `orchestrator/tests/min-score-abs-floor.test.ts` — 5/5:
  version records 2.1.6; default minScore=0 admits a -73 short; +40/-40 at
  minScore=50 both abstain min-score (symmetric); +60/-60 both pass the floor;
  boundary |score|==minScore passes (strictly-below semantics).
- Existing `orchestrator/tests/run.js` — 26/26 (incl. the minScore=80 test).
- Existing `orchestrator/tests/integrated-handler.test.js` — 23/23.

## Disposition change for the 43 excluded shorts

Cycle: equity-discovery cycle 2026-10-14, signalDate 2026-10-13, source
`handoff/handoff-inputs-2026-10-14.json` (85 inputs; 42 longs, 43 shorts).
Evidence of the old exclusion: `equity-discovery/handoff/handoff-report-2026-10-14.md`
(all 43 rows `status=rejected gate=min-score`).

Under the corrected rule NONE of the 43 are rejected at min-score. Each proceeds
past the floor to the remaining gates (issuance veto, short-regime, duplicate,
entry observation). Verified by replaying all 43 through the compiled corrected
handler (v2.1.6) with the exact feed wiring of `run_handoff.mjs`, in a :memory:
sandbox store (nothing persisted): 0 rejected at min-score; all 43 issued in the
replay sandbox with entered prints at 2026-10-14T13:30:00.000Z.

The 43 (all direction=short, signalDate=2026-10-13):

| symbol | score | symbol | score | symbol | score |
|---|---|---|---|---|---|
| ABT | -24 | AXP | -42 | ADBE | -73 |
| BA | -73 | BAC | -73 | BKNG | -73 |
| BMY | -73 | BNY | -38 | CAT | -78 |
| CMCSA | -73 | COF | -73 | CVS | -24 |
| FDX | -73 | GD | -73 | GE | -73 |
| GS | -95 | HD | -42 | IBM | -20 |
| INTC | -20 | INTU | -42 | JNJ | -60 |
| LMT | -73 | LOW | -42 | MCD | -73 |
| MMM | -38 | MRK | -38 | MS | -95 |
| MU | -20 | NEE | -42 | NFLX | -73 |
| PEP | -73 | RTX | -73 | SBUX | -73 |
| SCHW | -73 | SNDK | -38 | T | -73 |
| TMUS | -73 | UBER | -20 | UNP | -24 |
| UPS | -73 | USB | -60 | VZ | -73 |
| WFC | -78 | | | |

NOTE: the replay "issued" outcome above is sandbox-verification evidence of the
gate fix only — the production handoff report for cycle 2026-10-14 stands as
recorded. Re-running the live handoff to amend those 43 outcomes is an operational
decision left to the parent agent (it would issue real prospective rows against
the frozen comparison; holdouts stay locked either way).
