# Phase 1.2 integration-closure audit — crypto terminal

Date: 2026-10-09
Scope: crypto artifact only. No weights, indicators, thresholds, or strategy rules were changed.

## Findings to fixes

| Review finding | Production change | Acceptance evidence | Honest limit |
|---|---|---|---|
| Snapshot → contract → generated signal → link was non-atomic | `issueGeneratedSignalCandidate` now writes all four records in one `ctx.db.batch`, gives generated signals a DB-unique issuance key, records `pending/complete/failed`, and repairs an existing incomplete claim on retry rather than returning `already_exists` | `signal-persistence.integration.test.ts`: injected failures after each of four write boundaries; retry; repeated invocations; competing snapshots | The fault harness uses an isolated Bun SQLite database implementing the same unique keys and transaction sequence. It does not invoke the platform `Ctx` adapter itself. Production runtime fault injection remains unverified. |
| Entry label claimed evidence that did not exist | A generated paper setup now requires a fresh CoinGecko quote requested after decision time. The immutable contract records `first-post-decision-provider-quote`, `usd-spot-reference`, received time, provider and price. Failure to obtain it suppresses publication rather than relabeling the research reference. | Source/typecheck/build plus snapshot export shape | No real post-edit issuance was created during this edit. |
| Snapshot lacked replayable decision evidence | Snapshot v2 stores decision-time OHLC window, factor input ledger, parameters, entry evidence, provider/build metadata and saved derived comparison targets. `replayDossierDecision` is pure and recomputes ATR, gates, factor contributions, direction, agreement score and levels. `replaySignalSnapshot` returns field mismatches and marks legacy snapshots unverified. | Four replay tests: untouched reconstruction; raw-input mutation; saved-output mutation; future-unavailable input | Factor-source adapters currently persist their canonical scored input ledger rather than every upstream API response. Replay verifies the exact scoring/level computation from the consumed ledger; it does not rerun third-party provider adapters. |
| Tracker cohort claim exceeded filters | `isCurrentProspectiveCohort` and authoritative reads now require complete immutable contract, exact strategy/version/parameter hash, evaluator, product, 30 elapsed-day horizon, entry convention, price convention and cost scenario. Uncontracted/legacy rows remain visible but cannot enter prospective metrics. | Mixed-identity cohort test and tracker source | No production regrade was run; v3 rows remain preserved and excluded from the v4 cohort. |
| UI denominators were unclear | Tracker response/UI now shows issued, open, resolved, ambiguous and unverified counts and exposes the exact cohort definition. | Typecheck/build/audit | Runtime counts depend on future qualifying v4 issuances. |

## Checks

Commands and captured output are recorded in `PHASE1_2_TEST_RESULTS.txt`. Module behavior and persistence integration are reported separately.

## Status separation

- **Implemented:** atomic batch issuance, recoverable incomplete claims, truthful post-decision entry evidence, raw-window replay, exact cohort filtering, explicit denominators.
- **Tested offline:** 22 methodology/replay/cohort tests; 6 isolated SQLite atomicity/retry tests.
- **Verified in runtime:** build and local artifact audit only.
- **Operational verification pending:** a genuine post-edit issuance, and two scheduled grading/recovery cycles. No evidence was fabricated and no production rows were inserted for this report.
