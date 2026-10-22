# Candidate Routing Table — Discovery Run 59 → Repaired Paper Path (handler 2.1.9)

> **EVIDENCE SCOPE BANNER (added 2026-10-14 ~19:35Z):** BUILDER PROBE-DB EVIDENCE ONLY. Run 7 / discovery run 59 / handoff run 1 were created in the builder's workspace probe database (`ts-spaces/.../probe-ui/databases/.../app.db`, written 18:42:10Z — before the repaired build deployed at 18:44:32Z) and are CONFIRMED ABSENT from the deployed artifact DB (live `getpaperpilotstatus` shows deployed paper runs 1–6 only, discovery runs 56–58 only). Nothing in this table is deployed-path evidence. The deployed paper path remains 0/0/0/0 with zero verified natural entries.

**Date:** 2026-10-14 · **Scope:** paper signals only, no brokerage, no execution, no model tuning
**Pipeline:** discovery run 59 → handoff run 1 → paper run 7 (handler 2.1.9, "paper-v219 first-print handler")
**Outcome:** 13 natural candidates discovered · 10 reached the repaired paper path · 0 issued · 10 honestly deferred

## Provenance

| Item | Value |
|---|---|
| Discovery run | 59 (crypto-market-discovery, post-build, ~18:40Z) |
| Handoff run | id 1, `status=complete`, `handler_version=2.1.9`, `discovered_count=13`, `scored_count=13`, `directional_count=10`, `eligible_count=10`, `rejected_count=3`, `reason_counts={eligible_repaired_path:10, monitor_only:3}` |
| Paper run | id 7, `runKey=paper-pilot-v2.1.0:handoff:1:manual:5973344`, `status=partial`, started 2026-10-14T18:42:10Z, `candidate_count=10`, `issued_count=0`, `abstained_count=0`, `deferred_count=10` |
| Deferral mechanism | `actions.ts:3040/3051` — `COVERAGE.find(item => item.coinId === coinId \|\| item.symbol === symbol.toUpperCase())?.pair`; `!pair` → `state=deferred`, `reason_code=venue_mapping_unavailable`, `reason="No explicit Binance Spot USDT instrument mapping exists."`, `instrument=unmapped`, `venue=Binance Spot` |
| Gate order in handler | pre-freeze → decision-input-unverified → future-source-timestamp → stale-decision-inputs (>30 min) → **venue mapping** → invalid-frozen-levels → min-score floor → production abstain → entry window. All 10 deferred candidates passed every gate before the mapping gate (freshness and ledger-input checks clean). |
| Evidence source | Builder workspace probe DB `~/workspace/ts-spaces/altcoin-analyzer-and-signal-tracker/.harness/probe-ui/databases/f97addc2-64f2-41e7-bc7e-011768729784/app.db` — tables `paper_handoff_runs`, `paper_handoff_candidates`, `paper_signal_runs`, `paper_signal_candidates` (read-only inspection). Handoff and paper runs both record handler 2.1.9. Deployed-DB confirmation via `getpaperpilotstatus` on the live terminal is left to the parent — this table documents the builder's verification evidence. |
| Venue-listing source | Binance Spot `exchangeInfo` via `data-api.binance.vision` (public market-data mirror), pulled 2026-10-14 — authoritative for exact USDT pair existence + TRADING status. |
| Chain/contract source | CoinGecko `/api/v3/coins/{id}` (coinIds are the pipeline's own identifiers), pulled 2026-10-14. Identities below are what CoinGecko returns; matching here is by chain/contract, not ticker. |

## Routing table (13 rows)

### A. Reached the repaired paper path — 10 candidates, all deferred at the venue-mapping gate

| # | Candidate ID (coinId / symbol / dir) | Asset identity (chain / contract) | Stage reached | Reason code | Mapping classification |
|---|---|---|---|---|---|
| 1 | `bitway` / BTW / long | BSC `0x444045b0ee1ee319a660a5e3d604ca0ffa35acaa` (CG primary); also ETH `0x3a63de3572c69a1307ff08394f3ee7702c16d25d` | issuance_controls → paper path (eligible pre-legacy-filter) | `venue_mapping_unavailable` | **UNSUPPORTED LISTING** — BTW appears nowhere on Binance Spot (no pair under any quote). |
| 2 | `layerzero` / ZRO / short | ETH OFT omnichain `0x6985884c4392d348587b19cb9eaaf157f13271cd` (same address on ETH/Base/Polygon/BSC/Arbitrum/Optimism/Avalanche per CG) | issuance_controls → paper path | `venue_mapping_unavailable` | **MISSING MAPPING** — `ZROUSDT` is TRADING on Binance Spot (spot trading allowed); the row is simply absent from the 11-entry COVERAGE list. |
| 3 | `pearl-2` / PRL / long | Pearl network — native PoW L1 ("proof-of-useful-work"), CG lists no contract (`asset_platform_id: null`) | issuance_controls → paper path | `venue_mapping_unavailable` | **UNSUPPORTED LISTING** — PRL appears nowhere on Binance Spot. |
| 4 | `basic-attention-token` / BAT / long | ETH `0x0d8775f648430679a709e98d2b0cb6250d2887ef` (canonical; bridged variants exist on Solana/Polygon/Avalanche/Harmony/Energi/NEAR) | issuance_controls → paper path | `venue_mapping_unavailable` | **MISSING MAPPING** — `BATUSDT` is TRADING on Binance Spot (spot trading allowed); absent from COVERAGE. (Note: BAT's non-USDT pairs on Binance are all BREAK — USDT is the only live quote.) |
| 5 | `quack-ai` / Q / long | ETH `0xc07e1300dc138601fa6b0b59f8d0fa477e690589` (same on BSC per CG) | issuance_controls → paper path | `venue_mapping_unavailable` | **UNSUPPORTED LISTING** — Q appears nowhere on Binance Spot. (Not to be confused with RichQUACK/QUACK, a different token.) |
| 6 | `pons` / PONS / short | CG platform label "robinhood", `0x39dbed3a2bd333467115de45665cc57f813c4571` (CG's label, reported verbatim) | persistence → paper path (eligible; "Directional candidate with a complete decision-time factor ledger reached the repaired paper [path]") | `venue_mapping_unavailable` | **UNSUPPORTED LISTING** — PONS appears nowhere on Binance Spot. |
| 7 | `walrus-2` / WAL / long | Sui `0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL` | issuance_controls → paper path | `venue_mapping_unavailable` | **MISSING MAPPING** — `WALUSDT` is TRADING on Binance Spot (spot trading allowed; WALUSDC/WALBNB also TRADING); absent from COVERAGE. |
| 8 | `manadia` / UMXM / long | BSC `0x44fc58faaaca03e5d52e493dae930ffa63e2a664` | issuance_controls → paper path | `venue_mapping_unavailable` | **UNSUPPORTED LISTING** — UMXM appears nowhere on Binance Spot. |
| 9 | `deep` / DEEP / long | Sui `0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP` | issuance_controls → paper path | `venue_mapping_unavailable` | **UNSUPPORTED LISTING** — DEEP appears nowhere on Binance Spot. |
| 10 | `swarm-network` / TRUTH / long | Sui `0x0a48f85a3905cfa49a652bdb074d9e9fabad27892d54afaa5c9e0adeb7ac3cdf::swarm_network_token::SWARM_NETWORK_TOKEN` | issuance_controls → paper path | `venue_mapping_unavailable` | **UNSUPPORTED LISTING** — TRUTH appears nowhere on Binance Spot. |

All 10 candidate rows record `decision_at=2026-10-14T18:41:58Z`, `state=deferred`, `reason_code=venue_mapping_unavailable`. Paper run 7 summary (verbatim): *"10 eligible pre-legacy-filter candidates processed through artifact-native discovery handoff -> paper-v219 first-print handler: 0 issued, 0 abstained/expired/invalidated, 10 deferred. Legacy generated_signals and signal_contracts were unreachable."* The routing logic is direction-agnostic: the 10 paper-path candidates are exactly the 10 directional (long/short) ones.

### B. Did NOT reach the repaired paper path — 3 candidates, rejected pre-filter

| # | Candidate ID (coinId / symbol / dir) | Asset identity (chain / contract) | Exact stage reached | Exact reason (verbatim) | Reason code |
|---|---|---|---|---|---|
| 11 | `bitcoin` / BTC / **watch** | Bitcoin native L1 (no contract) | `persistence` — passed data, strategy, issuance, and evidence-ledger checks and was **persisted as monitor-only** | "Passed data, strategy, issuance, and evidence-ledger checks and was persisted." | `monitor_only` — non-directional (watch), so it was never routed to the issuance path. (BTC already has a COVERAGE mapping `BTCUSDT`; irrelevant here.) |
| 12 | `dusk-network` / DUSK / **watch** | Dusk L1 native; ERC-20 repr. ETH `0x940a2db1b7008b6c776d4faaca729d6d4a4aa551` (CG primary), BSC `0xb2bd0749dbe21f623d9baba856d3b0f0e1bfec9c` | `strategy_eligibility` — chart was fetched and normalized, then rejected | "Chart fetched and normalized, but existing freshness/liquidity/market-cap/perpetual-context strategy eligibility was not satisfied." | `monitor_only` — stopped at strategy eligibility, before any issuance stage. |
| 13 | `aleo` / ALEO / **watch** | Aleo native L1; CG also lists a BSC token repr. `0x6cfffa5bfd4277a04d83307feedfe2d18d944dd2` | `strategy_eligibility` — chart was fetched and normalized, then rejected | "Chart fetched and normalized, but existing freshness/liquidity/market-cap/perpetual-context strategy eligibility was not satisfied." | `monitor_only` — stopped at strategy eligibility, before any issuance stage. |

All three are `direction=watch` / `outcome=rejected` / `pre_legacy_filter=1`. The paper path only consumes `outcome=eligible` directional candidates, so the routing to the repaired path was 10 in / 3 out before issuance controls ever ran.

## What is needed to create the missing mappings (ZRO, BAT, WAL only)

1. **Source (authoritative, already verified 2026-10-14):** Binance Spot `exchangeInfo` — confirms the exact USDT pair exists and is TRADING with spot trading allowed:
   - `ZROUSDT` — TRADING (also ZROFDUSD/ZROTRY/ZROUSDC TRADING; ZROBTC BREAK)
   - `BATUSDT` — TRADING (all other BAT quote pairs BREAK)
   - `WALUSDT` — TRADING (also WALUSDC/WALBNB/WALTRY TRADING; WALFDUSD BREAK)
2. **Format:** one row each appended to the `COVERAGE` const in `server/src/actions.ts` (line 118), matching the existing shape — CoinGecko coinId first (unambiguous, ticker-independent):
   - `{ coinId: "layerzero", symbol: "ZRO", pair: "ZROUSDT" }`
   - `{ coinId: "basic-attention-token", symbol: "BAT", pair: "BATUSDT" }`
   - `{ coinId: "walrus-2", symbol: "WAL", pair: "WALUSDT" }`
   
   The lookup (`item.coinId === coinId || item.symbol === symbol.toUpperCase()`) then resolves the pair; downstream `fetchBinanceTradeHistory(pair, …)` establishes the first print.
3. **Verification step (after deploy, before calling it done):**
   - Re-confirm each pair's status is still TRADING on Binance (delisting risk is real — see BAT's BREAK pairs; the handler does not re-check listing status at runtime).
   - Run the paper cycle against a completed handoff containing the asset and confirm the candidate advances **past** the mapping gate — state becomes `awaiting_entry` or a later gate's code (anything except `venue_mapping_unavailable`).
   - Confirm the first-print history resolves via the mapped pair. This is mapping-only wiring; no threshold, score, or model change is involved.
4. **Explicitly do NOT:** wire the 7 unsupported assets (BTW, PRL, Q, PONS, UMXM, DEEP, TRUTH) — Binance does not list them; creating a mapping would invent a print source. Do not substitute another token, another venue, or a bridged/wrapped variant — the handler is pinned to Binance Spot USDT instruments. (Precedent in-code: HYPE and MON are deliberately carried in COVERAGE with `pair: null` — "known, no Binance Spot USDT instrument" — and defer with the same code.)

## Notes / caveats

- The deferral is honest, not a bug: the handler refuses to issue without an explicit venue instrument to observe the first print on. 10 deferred / 0 issued is the correct output given the current COVERAGE list.
- COVERAGE currently maps only 11 assets (9 with live pairs: BTC, ETH, SOL, LINK, SUI, DOGE, XRP, AVAX, ADA; HYPE and MON deliberately `pair: null`). Any future discovery candidate outside these 9 live pairs will defer the same way — 7 of today's 10 did so because the venue doesn't list them at all.
- Evidence for this table comes from the builder's probe-harness DB (verification evidence), read-only. Confirming run 7 on the live deployed DB (via `getpaperpilotstatus` from the terminal) is the parent's live check; this table gives the parent the exact row IDs (`paper_handoff_runs.id=1`, `paper_signal_runs.id=7`, `paper_handoff_candidates.id 1–13`, `paper_signal_candidates.id 1–10`) to compare against.
