# Supported-universe scan — 2026-10-14T20:05Z (workstream 2, part 2)

**Scan ID:** `universe-scan-2026-10-14T2005Z` · **Universe:** UNIVERSE-v1.0.0 · **Venue:** Binance Spot via Binance.US (venue label `binance-spot`)
**Scope:** paper signals only. No brokerage, no execution. No frozen-model tuning, no holdout contact.
**Seat limits (honest):** no artifact-invoke capability — the deployed `runpapersignalcycle` / `getpaperpilotstatus` actions could not be called from this seat. This scan works from the workspace handler code, the deployed-status snapshots in `pilot/delivery/worker-runs/`, and LIVE Binance.US market data pulled during the scan. Anything requiring a deployed read is flagged `PARENT-VERIFY`, not faked.

## What this scan is

A scheduled supported-universe scan consumes discovery candidates and routes them through the repaired qualification path. This scan ran the path's gates over the 10 supported assets with real evidence at every step that can be evidenced without discovery. Where a gate needs discovery-emitted inputs (factor ledger, score, entry levels, direction), the scan records the honest stop — it does not invent them.

Two layers, kept distinct:

- **Layer 1 — candidate qualification:** requires a live discovery candidate with a factor ledger. None exists for any supported asset in this window → the trace stops at `ledger-input` for all 10. Documented, not manufactured.
- **Layer 2 — structural venue-mapping probe (the repaired gate):** the mapping gate is asset-level (pair → COVERAGE lookup → live venue verification), so it IS fully evaluable without discovery. This is the gate the v2.1.9 repair fixed, and the scan's core purpose: prove missing mappings no longer explain the result.

## Live venue re-verification (Layer 2 evidence, pulled during this scan)

`bash universe/verify-universe.sh` — 2026-10-14T20:05:33Z, exchangeInfo serverTime 1792008312768 (629 symbols).
Evidence: `universe/evidence/venue-feed-checks-2026-10-14T200510Z.json`, `universe/evidence/binanceus-exchangeinfo-2026-10-14T200510Z.json`.

| Pair | status | spot | 1d klines | last agg id | support rule |
|---|---|---|---|---|---|
| BTCUSDT | TRADING | yes | 2 | 30273187 | PASS |
| ETHUSDT | TRADING | yes | 2 | 18104764 | PASS |
| SOLUSDT | TRADING | yes | 2 | 10997483 | PASS |
| LINKUSDT | TRADING | yes | 2 | 1331615 | PASS |
| SUIUSDT | TRADING | yes | 2 | 521695 | PASS |
| DOGEUSDT | TRADING | yes | 2 | 12727879 | PASS |
| XRPUSDT | TRADING | yes | 2 | 2595633 | PASS |
| AVAXUSDT | TRADING | yes | 2 | 2496056 | PASS |
| ADAUSDT | TRADING | yes | 2 | 9205892 | PASS |
| BATUSDT | TRADING | yes | 2 | 1259746 | PASS |

**10/10 pass.** BAT delisting-risk re-check (policy: re-verify at wiring time): BATUSD = BREAK, BATUSD4 = BREAK, BATUSDT = sole live BAT quote — flag current, unchanged. ZROUSDT / WALUSDT confirmed NOT LISTED on Binance.US (UNSUPPORTED_VENUE stands).

## Deployed path state (from snapshots — not re-invoked from this seat)

- Deployed freeze: `paper-pilot-v2.1.0` (frozenAt 2026-10-14T04:54:12.629Z); handler `2.1.9` (evidence: `pilot/delivery/worker-runs/status-2026-10-14T19-50-57Z.json`).
- Deployed COVERAGE (per `comparison/CANDIDATE-ROUTING-2026-10-14.md`, verified 2026-10-14 ~18:42Z against the deployed build): 9 live pairs — BTC, ETH, SOL, LINK, SUI, DOGE, XRP, AVAX, ADA — plus HYPE/MON carried with `pair: null`. **BAT has no COVERAGE row** (wiring is a separate step per UNIVERSE-POLICY-v1.0.0). `PARENT-VERIFY`: confirm the deployed COVERAGE list is unchanged before treating the 9 as pass-through.
- Latest deployed discovery state: runs 56–58; run 58 inbox file carries 0 candidates; paper runs 1–6 all `issuedCount: 0` ("No directional discovery candidate was available for the explicit paper path; no signal was manufactured"). Builder-probe run 59 (13 candidates) is NOT on the deployed DB.

## Per-asset gate trace

Gate order per the repaired path: pre-freeze → ledger-input → future-timestamp → staleness → venue mapping → freshness/liquidity/market-cap → direction → qualification.

| # | Asset (coinId / symbol / pair) | pre-freeze | ledger-input | future-ts / staleness | venue mapping (structural probe) | freshness/liq/mcap, direction, qualification | Scan disposition |
|---|---|---|---|---|---|---|---|
| 1 | bitcoin / BTC / BTCUSDT | PASS (freeze v2.1.0 active, handler 2.1.9) | STOP — `no-factor-ledger`: no live discovery candidate in this window | N/A (no inputs) | PASS — pair TRADING live; COVERAGE row present | not reached | **no candidate** (structural: clear) |
| 2 | ethereum / ETH / ETHUSDT | PASS | STOP — `no-factor-ledger` | N/A | PASS — pair TRADING live; COVERAGE row present | not reached | **no candidate** (structural: clear) |
| 3 | solana / SOL / SOLUSDT | PASS | STOP — `no-factor-ledger` | N/A | PASS — pair TRADING live; COVERAGE row present | not reached | **no candidate** (structural: clear) |
| 4 | chainlink / LINK / LINKUSDT | PASS | STOP — `no-factor-ledger` | N/A | PASS — pair TRADING live; COVERAGE row present | not reached | **no candidate** (structural: clear) |
| 5 | sui / SUI / SUIUSDT | PASS | STOP — `no-factor-ledger` | N/A | PASS — pair TRADING live; COVERAGE row present | not reached | **no candidate** (structural: clear) |
| 6 | dogecoin / DOGE / DOGEUSDT | PASS | STOP — `no-factor-ledger` | N/A | PASS — pair TRADING live; COVERAGE row present | not reached | **no candidate** (structural: clear) |
| 7 | ripple / XRP / XRPUSDT | PASS | STOP — `no-factor-ledger` | N/A | PASS — pair TRADING live; COVERAGE row present | not reached | **no candidate** (structural: clear) |
| 8 | avalanche-2 / AVAX / AVAXUSDT | PASS | STOP — `no-factor-ledger` | N/A | PASS — pair TRADING live; COVERAGE row present | not reached | **no candidate** (structural: clear) |
| 9 | cardano / ADA / ADAUSDT | PASS | STOP — `no-factor-ledger` | N/A | PASS — pair TRADING live; COVERAGE row present | not reached | **no candidate** (structural: clear) |
| 10 | basic-attention-token / BAT / BATUSDT ⚠ delisting-risk | PASS | STOP — `no-factor-ledger` | N/A | **DEFER — `venue_mapping_unavailable`**: pair TRADING live (verified this scan), but NO COVERAGE row shipped; wiring requires same-day re-verification per policy (re-check done: BATUSD/BATUSD4 still BREAK). `PARENT-VERIFY` the wiring step. | not reached | **deferred** (`venue_mapping_unavailable`) |

## Scan outcome

- **Issued:** 0. **Abstained:** 0. **Deferred:** 1 (BAT, `venue_mapping_unavailable` — expected, pending the separate wiring step). **No candidate:** 9 (structurally clear at the venue-mapping gate; no live discovery candidate to qualify).
- **Entry evidence:** none required — no candidate qualified, no entry attempted. No prints manufactured. Named non-entry: n/a (empty scan; the one deferral never reached the entry gate).
- **Key result:** missing mappings no longer explain the result. 9 of 10 supported assets resolve the repaired venue-mapping gate against live venue data; the 10th (BAT) defers for the documented, policy-governed reason (unwired row + delisting-risk flag), not a missing-venue mystery. The scan is empty because discovery emitted no directional candidates for supported assets — a faithful empty, matching the deployed runs 1–6 behavior.

## Machine-readable rows

`universe/SUPPORTED-UNIVERSE-SCAN-2026-10-14.csv` — one row per scanned asset, dual-coverage CSV schema (discovery columns carry `no-candidate` where no discovery candidate exists).

## PARENT-VERIFY items (deployed reads this seat cannot do)

1. Confirm the deployed COVERAGE list still carries the 9 live pair rows and no BAT row (relied on the 18:42Z probe verification).
2. Confirm `getpaperpilotstatus` raw payload carries `data.candidates` / `data.signals` arrays per schema v1 (the captured extracts do not show them).
3. The BAT COVERAGE-row wiring itself (same-day re-verification done in this scan: BATUSDT TRADING, siblings BREAK — row may ship when the parent approves the wiring step).
