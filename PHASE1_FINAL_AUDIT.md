# Phase 1 final signoff patch — crypto terminal

Date: 2026-10-09

## Scope

Focused only on the reproduced ATR-window defect, immutable issued-level response/display, explicit replay scope, and production-boundary persistence acceptance tests. No weights, indicators, thresholds, or predictive claims changed.

## Findings to fix

| Finding | Production path | Repair | Acceptance test |
|---|---|---|---|
| Live ATR consumed the full Kraken window while replay saved only `candles.slice(-220)` | `analyzeCoin` → `issueGeneratedSignalCandidate` → `replayDossierDecision` | Added `canonicalWilderAtr`; live and replay both consume the same complete ordered decision-time bar window with the same arithmetic seed and Wilder smoothing | `Phase 1 final canonical ATR and replay scope` in `signal-methodology.test.ts` |
| Replay status overstated what is reconstructed | `replayDossierDecision` | Returns separate statuses for scored ledger, raw-source factors, gates, and levels; upstream provider-source adapters stay explicitly partial | same module suite |
| Caller/UI could show research-reference dossier levels while evaluation graded accepted contract levels | `issueGeneratedSignalCandidate` → `analyzeCoin` → `DossierWorkspace` | Every publish/retry response returns the database-accepted immutable contract entry, stop, targets, entry rule, snapshot, and replay scope. The client labels these as the issued setup and labels dossier levels as research-reference only | `signal-action-contract.integration.test.ts` |
| Prior persistence suite reimplemented `issue()` | Live issuance batch + `persistSignalIssuanceBundle` | Extracted the production persistence coordinator used by live issuance and the isolated adapter tests; tests use production schema table names/columns | `signal-persistence.integration.test.ts` |
| Failure/retry and race coverage was not production-boundary evidence | same | Injects failure after each of five write boundaries, proves rollback then retry; independently interleaves two connections for identical and competing snapshots; returns the accepted original bundle and removes an unreferenced loser snapshot | persistence integration suite |

## Old vs new defect evidence

Synthetic 600-bar fixture, deliberately long enough for the historical Wilder seed to matter:

- Full-window live ATR: `2.0450670719380186`
- Former last-220 replay ATR: `2.0450670634801584`
- Difference: `8.457860189992061e-9`
- Old path: strict replay reported stop, target 1, and target 2 mismatches.
- New path: live and replay both consume all 600 eligible bars; mismatches are empty.

The full values and old mismatch strings are in `phase1-final-sanitized-fixture.json`. This is a synthetic test fixture, not a real persisted signal.

## Reconstruction claims

- **Scored ledger:** reconstructed from saved factor score/weight inputs.
- **Raw-source factors:** partial; provider adapters and raw provider payloads are not replayed.
- **Gates:** partial; ledger/ATR coverage gates replay, while upstream provider freshness/anomaly gates remain outside replay scope.
- **Levels:** reconstructed from the complete canonical ATR window and immutable accepted entry.

No complete end-to-end live-model replay claim is made.

## Operational status

- Genuine post-edit production issuance: **pending**.
- Two scheduled operational/recovery cycles: **pending**.
- Production incident logs/root cause evidence: **unavailable in this build sandbox**.
- PDF.js managed upgrade v25: **not applicable**; the client has no inline blob-backed PDF iframe/embed/object.

These are operational limits, not substituted with synthetic production rows.
