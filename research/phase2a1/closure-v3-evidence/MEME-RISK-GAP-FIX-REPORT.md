# Meme-risk verification gap follow-up

Checked and repaired on 2026-10-12. Veto semantics, the three independent witnesses, and the on-demand-only rule are unchanged.

## 1. RugCheck named warnings

Root cause: `normalizeRugCheck` labeled a response clean whenever the numeric score was below 60, even when `risks[]` contained named warnings.

Repair: any non-empty named-risk list now yields at least `caution`; existing critical/veto logic still takes precedence. The added regression fixture combines a named RugCheck warning with cautionary concentration and proves the panel verdict cannot be `PASS`/clean. The current suite records all eight meme-risk tests passing.

Live check: the real BONK mint returned a RugCheck score of 7 with the named warning `Mutable metadata`; the factor rendered `caution`, not clean. A separate low-liquidity token returned a named `Low Liquidity` warning and also rendered `caution`.

## 2. FluxRPC funding histories

Root cause investigation showed a provider-side coverage gap, not a request-shape, parser, or rate-limit error. For wallet accounts with delegated stake, the same `getSignaturesForAddress` request returned an empty list from FluxRPC while Alchemy returned 100 signatures. Both providers returned the same live balance for the account, and neither response was rate-limited.

Repair:

- FluxRPC remains primary for token supply and largest-token-account snapshots.
- `getSignaturesForAddress` falls through to Alchemy when FluxRPC is empty or fails.
- `getTransaction` and `getBalance` fall through when FluxRPC fails.
- Alchemy uses the verified manual surrogate path substitution required by the local connection.
- Funding extraction now inspects inner instructions plus `newAccountPubkey` and `base` fields.
- The bounded RPC timeout and worker concurrency were raised enough for the fallback path to complete inside the action budget.
- Provider telemetry records Flux empty/fail calls, Alchemy fallback calls, and usable Alchemy histories.

Live evidence after the platform build:

- JUP: four top-holder wallets checked, zero unresolved, no qualifying funder cluster. FluxRPC returned eight empty/unusable histories; all eight Alchemy fallbacks were usable. The bundle witness returned `clean`. The overall panel remained `CAUTION` because RugCheck reported mutable metadata and holder concentration was 67.90%; this is expected witness independence, not a clean overall verdict.
- BONK: 12 largest token accounts were inspected; the action recorded 18 Flux empty/unusable history calls, 18 Alchemy fallbacks, 12 usable fallback histories, six checked holder wallets, six unresolved, and no qualifying bundle. RugCheck returned a named mutable-metadata warning, correctly producing `CAUTION` rather than clean.

## Live flagged-veto demonstration

No live token tested in this session met the unchanged shared-funder veto thresholds. Recent high-risk launch examples reported by a separate launch-wallet clustering source did not trip this implementation because its method is different: this panel only clusters the current top-12 token accounts by earliest visible funder, excludes CEX-like funders, and uses a bounded 100-signature history. Many active or program-owned accounts still do not expose first funding inside that window. Expanding to same-transaction or Jito-bundle matching would be a separate method change and was outside this repair.

The flagged path therefore remains verified by deterministic positive controls, not represented as live proof: five linked wallets trigger the bundle veto, and two linked wallets controlling ten percent of supply trigger the concentration veto. The current suite records both controls passing. This is the remaining honest limitation.
