# Manifest note — venue trade id preservation + sequence-based tie-breaking (handler v2.1.9)

Date: 2026-10-14. Paper signals only. No brokerage, no holdout touched.
Prediction weights UNCHANGED. No prediction-factor, level, gate, entry-rule,
cost-model, or veto-semantics change. The frozen evaluator is untouched. This
supersedes handler v2.1.8 (history-coverage proof, 2026-10-14) — the v2.1.8
semantics are retained verbatim; only the entry-observation identity layer
changes, as described below. Additive note: frozen manifests (v2.1.5 and
earlier) are not touched.

## The defects (read at the actual gate)

Live gate: `paper-signals/orchestrator/src/issuance/handler.ts` —
`observeEntryPhase` (the integrated issuance path both handoffs run).

1. **Dropped / synthesized venue trade id.** The real adapter
   (`pilot/src/binance.ts`, `BinanceVenueFeed`) fetched Binance aggTrades —
   which carry the aggregate trade id `a` — and then DROPPED it in the map,
   emitting only `{ ts, price, venue }`. Downstream,
   `firstPrintIdentity()` REPLACED the missing id with a synthesized
   `trade:${venue}:${ts}:${price}` stand-in. The chain
   feed -> checkpoint -> contract -> alert evidence therefore never carried
   the real venue-assigned id at any step: the feed dropped it, the
   checkpoint invented a replacement.

2. **Price tiebreak.** `observeEntryPhase` sorted same-timestamp candidates
   by ascending price (`a.ts - b.ts || a.price - b.price`). Two prints in
   the same millisecond are ordered by execution, not by price — the old
   tiebreak could crown a later-executed print as the "first" print.

## The repair (v2.1.9, additive)

**Real venue trade id, verbatim, at every step.**
- `entry-v1/src/feed.ts`: `TradePrint` gains two REQUIRED fields —
  `venueTradeId: string` (the venue-assigned id, verbatim; Binance
  aggTrades `a` stringified) and `venueSeq: number` (the venue's own
  monotonic ordering field; aggTrades `a`). Required, never optional:
  the type system now enforces that no print flows without an id.
  `ScriptedFeed.latestPrints` preserves both fields (its old map stripped
  everything but `{ ts, price, venue }`).
- `pilot/src/binance.ts`: `BinanceVenueFeed.latestPrints` emits
  `venueTradeId: String(t.aggId)` / `venueSeq: t.aggId` from the real
  aggTrades response (the actual adapter code, raw-text fetch path
  retained for the raw-response hash evidence).
- `pilot/src/shims.d.ts`: mirrors the new `TradePrint` shape.
- `entry-v1/src/watcher.ts`: `reconstruct()` preserves both fields in its
  research-record map.
- `orchestrator/src/issuance/handler.ts`:
  - `firstPrintIdentity()` now records the print's REAL `venueTradeId`
    and `venueSeq` — the `trade:${venue}:${ts}:${price}` synthesis is
    deleted. `FirstPrintIdentity` gains `venueSeq` so the checkpoint pins
    WHICH print won a same-timestamp tie.
  - `readObservationCheckpoint` / `withObservationCheckpoint` carry and
    validate `venueSeq` (finite number); a checkpoint whose first-print
    identity lacks a valid id/seq is treated as corrupt (fresh checkpoint),
    never trusted.
  - Print-identity integrity guard (new, fail closed): any served print
    lacking a non-empty `venueTradeId` or a finite `venueSeq` voids as the
    named non-entry `non-entry:first-print-unverifiable` — the handler
    NEVER synthesizes an id to paper over a venue data gap.
  - Alert evidence: the entry alert's gate summary and the issued
    outcome detail now name the real `entryVenueTradeId` /
    `entryVenueSeq` (read off the checkpoint's established first-print
    identity). The entry-alert evidence gate (`checkEntryEvidenceComplete`)
    already required the id; it now gates on the real one.
- `ISSUANCE_HANDLER_VERSION` 2.1.8 -> 2.1.9.

**The tiebreak rule (exact).** New exported comparator
`comparePrintsByVenueOrder(a, b)`: prints order by (venue timestamp, VENUE
SEQUENCE) ascending — `a.ts - b.ts || a.venueSeq - b.venueSeq`. When two
candidate prints share the same observation timestamp, the one with the
LOWER venue sequence number is the earlier print. Price is never a
tiebreaker; arrival order is never a tiebreaker (batch serving order is a
transport artifact, not venue execution order).

## Tests

- New `orchestrator/tests/venue-seq-tiebreak.test.ts` (added to the npm
  test script):
  - REAL-ADAPTER regression: `BinanceVenueFeed.latestPrints` (the actual
    adapter code) against a stubbed transport returning a canned aggTrades
    response with same-`T` ties, scrambled response order, and price order
    disagreeing with sequence order. Asserts the prints carry
    `venueTradeId`/`venueSeq` verbatim from `a` and arrive ordered by
    (ts, venueSeq): a naive price pick (a=5002) or arrival-order pick
    (a=5003) would both be wrong; the adapter yields a=5001 first.
  - Unit: `comparePrintsByVenueOrder` vs the old price tiebreak over the
    same fixture — asserts they pick DIFFERENT prints, so the regression
    fails if the tiebreak is removed. Verified empirically: temporarily
    restoring the price sort makes the integrated test fail (entered at
    100.05 instead of 100.20); the tiebreak was then restored.
  - Integrated (real handler end-to-end): two same-ts eligible prints,
    lower price served first with the HIGHER venue seq; asserts entry on
    the lower-seq print (price 100.20), the checkpoint's firstPrint
    carrying `venueTradeId "agg-9001"` / `venueSeq 9001`, and the alert
    evidence (gate summary + outcome detail) naming the real trade id.
  - Fail-closed: a served print with no venue-assigned id voids as
    `non-entry:first-print-unverifiable` — no signal, no entry alert, no
    synthesized id.
- Updated for the new required fields / real ids: `fixtures.ts`
  (`cryptoPrintFeed` -> `agg-7001`/7001, `equityOpenPrintFeed` ->
  `tape-7002`/7002), all `TradePrint` literals in `clock-skew`,
  `first-print-fidelity`, `integrated-handler` tests and the two probe
  scripts; `first-print-fidelity` assertions that expected the old
  synthetic `trade:...` id now expect the real fixture ids (and the
  checkpoint-schema key list gains `venueSeq`); `min-score-abs-floor`
  version pin -> 2.1.9.
- Full orchestrator suite: 90/90 pass. `pilot` build (tsc) passes.

## Honest limits

1. `venueSeq` monotonicity is a venue property the handler cannot prove —
   for Binance aggTrades, `a` is documented as increasing in execution
   order; a venue whose "sequence" is not execution-ordered would defeat
   the tiebreak the same way a lying feed defeats the coverage check.
2. `venueTradeId` is preserved verbatim, not independently verified
   against the venue — the handler proves it carried the id through, not
   that the venue told the truth.
3. The same-ts watermark resume subtlety is unchanged: the recovery
   checkpoint watermarks on print ts; a venue that serves additional
   same-ts prints in a LATER poll (after the watermark advanced past
   their ts) is outside this repair's scope.

## File hashes (sha256, at packaging time)

6a9aaf62444fdb880b14ae8345a68ab324037d0c3997db55bde976258ad3db37  orchestrator/src/issuance/handler.ts
14732e2e0931df574763a7bb20d181ddd62acf8247f5737be1531ebff99f481a  entry-v1/src/feed.ts
8d8348f98b2a18fe3d61487ef3279a0ca6cd78f76fc24bd77e96b06f3fb6cee1  entry-v1/src/watcher.ts
227dae4ddb2b8aa5914b9dad3be5b092b59917e5fc53ef5be65c1edb07997b79  pilot/src/binance.ts
9f5472acc22072b9fcb8f90332f975498a58be466a5b76f9cc4dcdd58d2e1024  pilot/src/shims.d.ts
ee8bf565ca0e01d6bb2262f53034e92fdb104f4dfb677db0172c39f745de9fe0  orchestrator/tests/venue-seq-tiebreak.test.ts
077ab884aba9ccf2c0834e5d44622f08b69ae10b6deea6afd5f233512a3bf5e9  orchestrator/tests/first-print-fidelity.test.ts
537d1a315855e11d68e55242419c563b861590b0f49a6216d88884e571892ec1  orchestrator/tests/fixtures.ts
9403349a6800405fd0b2ae75f68e51b33b02e9b03a0c8b9e6419112d2eca52f6  orchestrator/tests/clock-skew.test.ts
5aaeede09a21c3abfa24e8fd8b898a0fd511444caeded9f1845afa1335c7827c  orchestrator/tests/integrated-handler.test.ts
c662d7ed5d5d8df3f7e5895dc1ab81e2f9819d21ff7811b01103b08a478a1672  orchestrator/tests/min-score-abs-floor.test.ts
1fa5fb4b8dbe172f6618b253fca09d121c09d68c154f17149288c283c65c3cdb  orchestrator/tests/first-print-substitution-regression.ts
ae4e544bf44d986a2edb11aeb37252de1c2243b7961ba92ae28aee1c4228f667  orchestrator/tests/receipt-expiry-probe.ts
b993b04f7dedbbd50b0b359a2946761620a1d63854f5cfcacab2cbdc4dcb0b8c  orchestrator/package.json
