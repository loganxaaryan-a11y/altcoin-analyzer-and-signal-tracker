# Phase 2A.1 original vs corrected v2

This comparison reruns the preserved two-asset review fixture (`research/phase2a1/fixtures/synthetic-validation-bars.jsonl`, SHA-256 `8c81bf69c062e2c772378cc00f946be104204eb782cfe65089362266e6a4c400`) through the corrected engine. It is a regression fixture, not market evidence. The original market review report remains preserved separately.

## What changed

- Candidate and full-schedule benchmark feature windows now reject any required bar whose `availableAt` is after the decision.
- Point estimates and block-bootstrap intervals now use one complete 720-date population; machine output reports `pointEstimateRows` and `tailRowsExcluded`.
- Synthetic controls use the shared date-panel evaluator; a separate known positive traverses the actual feature/entry/label engine.
- The frozen success criterion is unchanged.

## Reproduced fixture comparison

| Item | Original | Corrected v2 | Explanation |
|---|---:|---:|---|
| Input rows | 1,940 | 1,940 | Same bytes and input hash |
| Dataset manifest hash | `cb446bbb…` | `cb446bbb…` | Availability repair did not change normalized input |
| Product-expanded observations | 2,420 | 2,420 | This fixture's existing bars were timely; adversarial late-revision coverage is a separate regression |
| 5d trend issued | 1,266 | 1,266 | Unchanged |
| 30d trend issued | 1,118 | 1,118 | Unchanged |
| 5d breakout issued | 20 | 20 | Unchanged |
| 30d breakout issued | 16 | 16 | Unchanged |
| Selection | none | none | Frozen no-promotion decision retained |

All four pooled means and confidence intervals remain numerically unchanged on this fixture. The prior report excluded 11 scheduled short-tail dates from bootstrap but did not expose whether emitted rows fell there. Corrected v2 reports zero emitted tail rows for each pooled product, which is why point estimates remain unchanged while the population definition is now explicit and aligned.

## Availability counterexample

A dedicated fixture marks one required earlier bar unavailable until ten days after a decision, then changes only that bar's values. Both variants exclude the earlier decision for `feature_unavailable_at_decision`; neither may use the late revision. Decisions after the availability time may use it. This closes the engine defect without claiming the preserved fixture or prior market dataset was contaminated.

## Interpretation

The correct conclusion remains: no candidate qualified under this run's frozen rules. It is not evidence that no useful timing edge exists. No holdout labels were opened and no strategy was promoted.
