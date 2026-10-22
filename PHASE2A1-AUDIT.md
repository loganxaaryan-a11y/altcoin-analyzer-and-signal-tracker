# Phase 2A.1 crypto measurement and reproducibility repair

## Scope and stopping point

This repair preserves the original Phase 2A outputs, frozen success criterion, and no-selection decision. It does not add indicators, tune weights, open the final holdout, promote a strategy, rewrite legacy scores, or claim edge.

## Issue resolution

| Expert finding | Resolution | Verification |
|---|---|---|
| Missing engine, tests, adapter, build metadata, observations and inputs | Self-contained export action now creates one ZIP with fresh source, actual normalized validation bars, actual observations, machine reports, controls and metadata | `exportphase2a1reviewpackage` |
| Elapsed endpoint could stretch around a missing bar | Entry and exit are looked up by exact scheduled UTC timestamp. A missing expected entry/endpoint is excluded, never moved | dedicated missing-endpoint regression |
| Baseline cost comparability unclear | Every observation exports gross, 18 bps central-net and 36 bps stressed-net baselines. Reports compare like with like | matched-SMA equality regression at all three cost bases |
| Holdout guard lived only in command flow | Pure engine rejects any bar crossing 2025-01-01 before canonicalization, features, labels or reports. CLI inherits this guard | direct-engine and normal-command synthetic fixtures |
| Bootstrap used emitted dates and short tails | Resampling uses complete scheduled UTC-date grids, keeps each date's cross-asset panel, and excludes/discloses an incomplete tail | uncertainty method/count fields and regression |
| Executable constants could diverge from docs | CLI verifies engine and embedded-spec SHA-256 against `executable-freeze.json` | deterministic mismatch failure |
| Matched SMA cannot measure timing | Equality retained as a sanity test; original no-selection remains. A separate versioned timing protocol is proposed but not run | `PHASE2A1-TIMING-EVALUATION-PROTOCOL.md` |
| Harness sensitivity unknown | Separate synthetic controls: positive pre-decision latent state predicts later outcomes by construction; independent signal/outcome RNGs run over five fixed seeds | positive must qualify; negative false-qualification count reported |

## Synthetic control design

The positive control does not derive a feature from a future label. A latent state is generated and persisted before the decision; the synthetic later return is then generated from that state plus bounded independent noise. The negative control's signal and outcome generators are independent. All rows use synthetic identifiers and cohort `phase2a1-synthetic-controls-only`; they are never accepted by the market-data engine or mixed into market reports.

The frozen market qualification rule requires a positive lower bound versus the best matched directional baseline. Since both frozen hypotheses choose exactly the same direction as matched SMA-200 on their emitted timestamps, candidate and SMA returns are identical under equal costs; a strictly positive incremental result is impossible. That rule is retained unchanged for the original run. The positive control uses the appropriate non-identical always-long/always-short comparator, so guaranteed directional information can be detected rather than blocked by construction.

## Still unsupported or pending

- Final holdout performance; the holdout remains closed.
- Timing-filter value under an approved schedule comparator.
- Whole-market point-in-time membership and delisted assets.
- Real short borrow/funding/locate and observed execution costs.
- Production issuance atomicity, real issuance, two recovery cycles, scheduler reliability and incident logs.
- Independent expert rerun of this package.

No operational limitation above is quietly marked complete.
