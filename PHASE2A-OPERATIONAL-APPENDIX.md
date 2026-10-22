# Phase 2A operational appendix

These Phase 1 operational questions remain open. Isolated research does not close them and does not depend on pretending they are closed.

| Item | Status | Evidence / limit |
|---|---|---|
| Genuine post-edit live issuance | Pending | No new genuine issued contract was created for Phase 2A. Research actions are forbidden from issuing. |
| Production persistence atomicity | Pending | Existing isolated persistence fixtures pass, but the Phase 1 reviewer correctly limited their scope; no production-database rollback event is claimed. |
| Two consecutive scheduled recovery cycles | Pending | Not observed in this Phase 2A run. |
| Production incident logs / root cause | Unavailable | No incident log export was provided or fabricated. |
| Research cache refresh | Sandbox verified | All nine Binance pairs returned without provider error through the action in the isolated builder workspace. This does not establish future uptime. |
| Research rerun determinism | Native fixture verified | Apart from report timestamps, the same normalized input produces identical hashes, observations, reports, and decisions. |
| Legacy scoreboard separation | Source + fixture verified | Phase 2A uses a separate cohort and one separate discovery-state key; it does not call legacy tracker/scorecard writes. |
| Live weights / contracts / cohorts changed | No | The action response explicitly reports false for every such mutation, and the source has no corresponding write path. |

No item above authorizes live promotion. A later promotion review must close the applicable production-path evidence first.
