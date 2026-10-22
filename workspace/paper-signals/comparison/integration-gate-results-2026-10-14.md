# Integration gate results — 2026-10-14 (~20:45 UTC)

**Deployment under test:** `altcoin-analyzer-and-signal-tracker`, handler 2.1.9,
freeze `paper-pilot-v2.1.0`, response schema `paper-status/1`.
**Gate script:** `comparison/integration_gate.py` (reusable).

## Verdict: GATE PASS

| Check | Result | Evidence |
|-------|--------|----------|
| G1 export schema | PASS (verified live) | `getpaperpilotstatus` 2026-10-14 ~20:30 UTC: `schema_version=="paper-status/1"`; `alerts/candidates/signals/comparisons/checkpoints/runs/handoffRuns` all present as lists. Missing-array → explicit `SchemaError` enforced consumer-side (G2 cases B/C/F). |
| G2 producer–consumer | PASS 7/7 | `regression_producer_consumer_2026_10_14.py` re-run 2026-10-14: real worker parser + real collector code. Full response, missing candidates/alerts → SchemaError, quarantine refuses non-pilot row_origin, unversioned flagged, runs-as-int → SchemaError, malformed row isolated. |
| G3 TEST transport | PASS — **delivered (real ack)** | Labeled TEST `sig_TEST_26971b53` (BTCUSD long, `payloadJson.test===true`, `test/` dedup prefix): endpoint → worker §6b (validated, test-ledger pre-commit, TEST-banner render) → runtime outbox → **delivered, `delivered_at_utc=1792008505` (2026-10-14T20:08:25Z)**. Test ledger key `test/sig_TEST_26971b53/ENTRY_CONFIRMED` marked `delivered` with ack evidence by the worker's §4 sweep. Production ledger untouched (entries: {}). |
| G4 evaluator | PASS 3/3 | `evaluator_gate_fixtures.py` on the ACTUAL frozen `operational_issuance_eval`: clean entry → `pass/issued`; post-decision stop touch → `fail/abstain:waiting-interval-invalidation`; non-observable evidence → `uncertain/abstain:issuance-validation-unavailable` (fail-closed). |
| G5 legacy untouched | PASS 34/34 | `getsignaltracker` 2026-10-14: 34 signal rows (ids 10–43, unique), `latestBrief.trackedCount==34`. |

## Notes

- G3 exercised the SAME outbox, worker, delivery, and ack logic as genuine alerts
  (same `scheduler.delivery_outbox`, same delivery_key shape, same §4 reconciliation,
  same runtime relay). Only the bookkeeping is segregated: `test/` dedup prefix +
  separate test ledger, so TEST records never enter signal/performance metrics.
- The `verifysignalissuancecontrols` probe (dossier issuance controls, separate from
  the paper evaluator) returned `passed:true` on both born-dead branches as designed;
  it wrote two `verificationRun:true` suppressed rows (ids 402/403) — by design of that
  action, not part of the 34 tracked legacy signals.
- Outcome leg of the paper evaluator remains SUSPENDED (bare version string,
  no outcome updater — held for expert freeze decision). G4 covers the issuance leg.
  Prospective performance claims stay suspended.
- The live PAPER path stays UNPROVEN until a genuine opportunity traverses
  discovery → entry → alert → ack end-to-end.

## No-candidate trace (folded item 3)

The nine `no-candidate` rows in `universe/SUPPORTED-UNIVERSE-SCAN-2026-10-14.csv`
(BTC, ETH, SOL, LINK, SUI, DOGE, XRP, AVAX, ADA) are **`no upstream candidate
supplied`** — NOT "strategy evaluated and rejected". For all nine, Layer 1 stopped
at `ledger-input` (`no-factor-ledger`: no live discovery candidate in the window);
`paper_path_result` = `not routed (no candidate)`. Freshness/liquidity/market-cap,
direction, and qualification gates were never reached. The scan proved the
venue-mapping gate structurally clear (9/10 PASS against live Binance.US data;
BAT deferred for the documented unwired-row reason) but it did **not** demonstrate
discovery across the supported universe — it consumed discovery's empty output
(run 58 inbox: 0 candidates) without itself discovering.

## BAT wiring (folded item 1) — dispatched, build running

- Wiring-time verification 2026-10-14 ~20:32 UTC (Binance.US exchangeInfo,
  serverTime 1792008773404): **BATUSDT TRADING**, spot allowed, 2 daily klines,
  aggTrades flowing. **BATUSD = BREAK, BATUSD4 = BREAK** → delisting-risk flag set.
- Identity (CoinGecko): `basic-attention-token` / bat / "Basic Attention",
  ETH contract `0x0d8775f648430679a709e98d2b0cb6250d2887ef` — canonical BAT.
- Edit dispatched: append `{ coinId: "basic-attention-token", symbol: "BAT",
  pair: "BATUSDT" }` + `delisting_risk_flag=true` to COVERAGE in
  `server/src/actions.ts`. NEW candidates only; no backfill, no record changes,
  no threshold/model/freeze changes. ZRO/WAL not wired (separate steps).
- Builder handoff pending at time of writing.
