# HISTORY-COVERAGE-2.1.8 — handler change record (2026-10-14)

## The precise claim

The history-coverage proof is **adapter-established coverage under
documented endpoint assumptions** — NOT "venue-attested proof".

The handler proves it *checked* coverage against evidence bound to the
actual served response; it cannot prove the venue is honest. A feed that
fabricates coverage evidence defeats the check the same way a feed that
fabricates prints defeats the entry rule. The enforcement is real (every
non-empty batch is checked; absent or insufficient evidence fails closed as
`non-entry:first-print-unverifiable`); the CLAIM is bounded to what the
adapter can actually establish.

## Why this change exists

Handler v2.1.7 repaired the first-print substitution defect, but its
first-print identity argument rested on an unproven premise: "the feed serves
ascending post-sinceTs history" — i.e. "the fetch returned N prints" was
treated as proof that no earlier print existed. Nothing checked that the
served history actually covered the full decision→observation interval. A
venue history starting after the decision instant, or a gap between the
decision and the first served print, would have let the handler enter on a
print whose identity as the TRUE first eligible print was never established.

v2.1.8 closes that gap with the history-coverage proof: every non-empty
observation batch must carry the feed adapter's coverage evidence
(`VenueFeed.historyCoverage`) establishing that its served history is
continuous back to at least the requested sinceTs — evidence bound to the
actual served response (venue, symbol, requested range, receipt timestamp,
raw-response hash, pagination/completeness limits). Absent or insufficient
evidence fails closed as the named non-entry
`non-entry:first-print-unverifiable`, and an unproven batch never advances
the durable recovery checkpoint (a resumed run inherits only coverage its
predecessors proved).

## What changed (minimal, additive — no weight/freeze/recovery-semantics changes)

- `entry-v1/src/feed.ts`: `HistoryCoverage` extended with the six evidence
  fields (`venue`, `symbol`, `requestedRange { sinceTs, toTs }`,
  `receiptMs`, `rawResponseHash` — sha256 of the raw response bytes —
  `pagination { maxResultsPerRequest, paginationExhausted }`); all optional
  so existing feeds keep compiling. `ScriptedFeed` binds its evidence to the
  batch its `latestPrints` actually served (receipt = service-time clock,
  hash = sha256 of the serialized served batch; pagination records that the
  scripted venue serves its whole script per poll with no pagination). An
  `historyCoverage` call with no matching served batch throws — unbound
  evidence would be a fabrication; the handler fails closed on it.
- `orchestrator/src/issuance/handler.ts`: `observeEntryPhase` enforces the
  coverage check on every non-empty batch (before the checkpoint advance and
  before the first-print rule); the VERIFIED evidence is persisted on the
  durable `EntryObservationCheckpoint` as `coverageEvidence` (additive,
  tolerant read: rows written before the binding read back `null`);
  `skewGuardedFeed` forwards the evidence; `ISSUANCE_HANDLER_VERSION`
  stays 2.1.8 — gate semantics unchanged; doc comments updated to the
  precise claim. Runtime reason strings (`non-entry:first-print-unverifiable`
  messages) are untouched.
- `pilot/src/binance.ts`: `BinanceVenueFeed.latestPrints` retains the raw
  aggTrades response bytes; `historyCoverage` hashes them (sha256) and
  returns the six bound fields: `venue: "binance-spot"`, the request symbol,
  `requestedRange` (sinceTs → greatest served print ts), receipt timestamp,
  raw-response hash, `pagination: { maxResultsPerRequest: 1000,
  paginationExhausted: rawCount < 1000 }`. A `historyCoverage` call with no
  bound batch throws (fails closed downstream).
- `pilot/src/shims.d.ts`: mirrors the six evidence fields.
- `pilot/src/deps.ts`: `HoldableFeed` forwards the inner feed's evidence
  when present; never invents coverage.
- Tests: `first-print-fidelity.test.ts` gains regression 6 (history starts
  after the decision instant → `non-entry:first-print-unverifiable`, no
  entry, checkpoint NOT advanced), regression 7 (no evidence at all →
  fail closed), regression 7b (evidence lookup throws →
  named non-entry, not a tick crash), a checkpoint-schema test (persisted
  checkpoint records WHICH print was established as first-eligible via
  `venueTradeId`), and a coverage-evidence-binding test (the persisted
  checkpoint's `coverageEvidence` carries all six fields with values bound
  to the actual served batch);
  `integrated-handler.test.ts` custom feeds and the
  `receipt-expiry-probe.ts` parity probe return `{ historyStartMs:
  -Infinity }` (scripted venues — the receipt-time properties under test
  are unchanged);
  `min-score-abs-floor.test.ts` version pin stays 2.1.8.

No prediction weights, freeze manifests, or holdouts were touched. The
recovery implementation is unchanged apart from the coverage gate and the
additive evidence field.

## Documented endpoint assumptions (Binance.US GET /api/v3/aggTrades)

The adapter's coverage claim rests on these assumptions about the endpoint:

1. **Ordering.** With `startTime` set, the endpoint returns compressed
   aggregate trades with `T >= startTime` in ascending (`time`, `aggId`)
   order. The adapter sorts defensively by (`time`, `aggId`) anyway.
2. **Head-completeness, not tail-completeness.** `limit` caps the response
   at 1000 rows (endpoint max); the cap truncates the TAIL of a busy
   interval. The coverage evidence claims head-completeness from sinceTs —
   which is what the first-print rule needs. The poll loop re-requests from
   the last served print, so no interval is skipped across polls.
   `paginationExhausted` is true when the response returned fewer rows than
   the cap (no further pages needed); false when the cap was hit.
3. **Exchange-side gaps are not detectable from this endpoint.** The
   evidence is "complete as served from startTime". The handler-side proof
   is that the coverage check is enforced — not that Binance's history is
   complete.
4. **Sequential pairing.** `latestPrints(sinceTs)` and
   `historyCoverage(sinceTs)` are called sequentially with the same sinceTs
   (the handler's contract); the evidence describes the batch just served,
   identified by the raw-response hash. An unpaired call throws.

Scripted sandbox venue assumptions: the script IS the venue — scripted
prints are the complete history by construction; `availableAt` models
observability (unserved prints are unobservable, never "missing"); the
scripted venue serves its whole script per poll with no pagination.

## Honest limits of this proof (read before relying on it)

1. The proof is handler-side enforcement over ADAPTER-ESTABLISHED COVERAGE
   EVIDENCE. The handler proves it *checked* coverage against
   response-bound evidence; it cannot prove the venue is honest. A feed that
   fabricates evidence defeats the check the same way a feed that fabricates
   prints defeats the entry rule.
2. `BinanceVenueFeed`'s evidence is "complete as served from startTime":
   exchange-side history gaps are not detectable from the aggTrades
   endpoint. The live path's coverage therefore rests on Binance's history
   completeness plus the adapter's endpoint assumptions above — not on an
   independent proof.
3. Coverage is a single continuous-span scalar (`historyStartMs`). A venue
   with an internal gap must report `historyStartMs` at the end of its most
   recent gap; the interface cannot express "covered except (a,b)".

## File hashes (sha256, at packaging time)

bedb777e30be81175291e59e2539191562adda189345808d6fd00b840e9cdc8c  orchestrator/src/issuance/handler.ts
14732e2e0931df574763a7bb20d181ddd62acf8247f5737be1531ebff99f481a  entry-v1/src/feed.ts
227dae4ddb2b8aa5914b9dad3be5b092b59917e5fc53ef5be65c1edb07997b79  pilot/src/binance.ts
7cf21613ca4aefc64d50b14b51d7b989b6b965fb35d5dacae8b38a0836a509ff  pilot/src/deps.ts
9f5472acc22072b9fcb8f90332f975498a58be466a5b76f9cc4dcdd58d2e1024  pilot/src/shims.d.ts
077ab884aba9ccf2c0834e5d44622f08b69ae10b6deea6afd5f233512a3bf5e9  orchestrator/tests/first-print-fidelity.test.ts
5aaeede09a21c3abfa24e8fd8b898a0fd511444caeded9f1845afa1335c7827c  orchestrator/tests/integrated-handler.test.ts
c662d7ed5d5d8df3f7e5895dc1ab81e2f9819d21ff7811b01103b08a478a1672  orchestrator/tests/min-score-abs-floor.test.ts
ae4e544bf44d986a2edb11aeb37252de1c2243b7961ba92ae28aee1c4228f667  orchestrator/tests/receipt-expiry-probe.ts
