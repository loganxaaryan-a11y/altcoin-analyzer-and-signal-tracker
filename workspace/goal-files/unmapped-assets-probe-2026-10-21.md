# The 21 unmapped assets — read-only pair probe (2026-10-21)

Prepared 2026-10-21 (late evening, EDT). Authorized by Logan 2026-10-21 ~22:14 EDT. READ-ONLY — nothing was deployed, no freeze changed. PAPER ONLY.

## Headline — occurrences vs unique assets, stated both ways

- The issuance breakdown counted **51 `venue_mapping_unavailable` deferral OCCURRENCES** across issuance runs 113–116. Those are **21 UNIQUE assets**, re-presented cycle after cycle. **51 occurrences are not 51 independent missed opportunities** — they are 21 assets × repeated presentation.
- Probe result, per unique asset: **6 supported pair missing from our map · 0 pair inactive · 15 no supported pair · 0 identity unresolved.**
- So of the 21 unique assets: 6 are coverable today (a Binance Spot USDT pair exists, is TRADING, and both evidence routes answer) but lack a mapping row; 15 have no Binance Spot pair for their identity and stay research-visible.

## Method

- Identity resolved by **CoinGecko ID** (the discovery coinId) — symbol, name, and contract/platform addresses from the CoinGecko coin record. Never by ticker alone.
- Binance Spot instrument identity + status from `data-api.binance.vision` `GET /api/v3/exchangeInfo` (single pull, 3,736 symbols).
- Entry-evidence access: `GET /api/v3/aggTrades?limit=1` per candidate pair. Monitoring access: `GET /api/v3/klines?interval=1m&limit=1`.
- Evidence timestamps: CoinGecko identity + exchangeInfo pull **2026-10-22T02:15:36Z**; aggTrades/klines access probes **2026-10-22T02:17:39Z**; ticker-collision identity cross-checks (Sleepless AI, Litentry) ~**2026-10-22T02:17Z**. All checks are tonight's fresh probes — no stale evidence was reused for any classification.

## The table (21 unique assets)

| coinId | Resolved asset (symbol / name) | Binance Spot pair | Class | Evidence |
|---|---|---|---|---|
| vaulta | A / Vaulta | AUSDT — TRADING | **supported pair missing from our map** | exchangeInfo AUSDT status TRADING; aggTrades OK, klines 1m OK (02:17:39Z). Native L1 (ex-EOS); CoinGecko records no EVM contract. |
| ethena | ENA / Ethena | ENAUSDT — TRADING | **supported pair missing from our map** | exchangeInfo TRADING; aggTrades OK, klines OK. Ethereum contract 0x57e114b691db790c35207b2e685d4a43181e6061. |
| iostoken | IOST / IOST | IOSTUSDT — TRADING | **supported pair missing from our map** | exchangeInfo TRADING; aggTrades OK, klines OK. Native L1 (BSC representation 0xaf48b7e315a52518cfbf7d96c455d9dfad94cb48). |
| prometeus | PROM / Prom | PROMUSDT — TRADING | **supported pair missing from our map** | exchangeInfo TRADING; aggTrades OK, klines OK. Ethereum contract 0xfc82bb4ba86045af6f327323a46e80412b91b27d. |
| wormhole | W / Wormhole | WUSDT — TRADING | **supported pair missing from our map** | exchangeInfo TRADING; aggTrades OK, klines OK. Ethereum contract 0xb0ffa8000886e57f86dd5264b9582b2ad87b2b91. |
| zama | ZAMA / Zama | ZAMAUSDT — TRADING | **supported pair missing from our map** | exchangeInfo TRADING; aggTrades OK, klines OK. Ethereum contract 0xa12cc123ba206d4031d1c7f6223d1c2ec249f4f3. |
| ai-rig-complex | ARC / AI Rig Complex | none | no supported pair | No Binance Spot base asset ARC in exchangeInfo (02:15:36Z). Solana-native (CoinGecko platform: solana). |
| artificial-inu-3 | AI / Artificial Inu | none for this asset | no supported pair | **Ticker collision:** AIUSDT exists and is TRADING, but it is **Sleepless AI** (CoinGecko `sleepless-ai`, BSC contract 0xbda011d7f8ec00f66c1923b049b94c67d148d8b2) — a different asset. Artificial Inu (contract 0x2e8c31162b855a2ffa90f6f8634643ad6f111e18, Robinhood chain) has no Binance Spot pair. Never map by ticker. |
| edgex | EDGE / edgeX | none | no supported pair | No Binance Spot base asset EDGE in exchangeInfo. |
| grass | GRASS / Grass | none | no supported pair | No Binance Spot base asset GRASS (Binance exposure is futures-only; no spot pair in exchangeInfo). Solana-native. |
| grx-chain | GRX / GRX Chain | none | no supported pair | No Binance Spot base asset GRX in exchangeInfo. |
| hood-sword-inu | HOODINU / Hood Sword Inu | none | no supported pair | No Binance Spot base asset HOODINU in exchangeInfo. |
| kinetiq | KNTQ / Kinetiq | none | no supported pair | No Binance Spot base asset KNTQ in exchangeInfo. HyperEVM-native. |
| lighter | LIT / Lighter | none for this asset | no supported pair | **Ticker collision:** LITUSDT exists but is **BREAK** (not TRADING) and is the legacy **Litentry** instrument (CoinGecko `litentry`, Ethereum contract 0xb59490ab09a0f526cc7305822ac65f2ab12f9723; since rebranded Heima). Lighter (Ethereum contract 0x232ce3bd40fcd6f80f3d55a522d03f25df784ee2) has no Binance Spot pair. Both the identity and the status bar fail — this asset is not coverable via LITUSDT. |
| magma-finance | MAGMA / Magma Finance | none | no supported pair | No Binance Spot base asset MAGMA in exchangeInfo. Sui-native. |
| moolah | MOOLAH / Moolah | none | no supported pair | No Binance Spot base asset MOOLAH in exchangeInfo. BSC-native. |
| nockchain | NOCK / Nockchain | none | no supported pair | No Binance Spot base asset NOCK in exchangeInfo. Base-native. |
| ore | ORE / ORE | none | no supported pair | No Binance Spot base asset ORE in exchangeInfo. Solana-native. |
| pearl-2 | PEARL / Pearl | none | no supported pair | No Binance Spot base asset PEARL in exchangeInfo. |
| useless-3 | USELESS / Useless Coin | none | no supported pair | No Binance Spot base asset USELESS in exchangeInfo. Solana/BSC meme. |
| verse-world | VERSE / Verse World | none | no supported pair | No Binance Spot base asset VERSE in exchangeInfo. Solana-native. (Not to be confused with Bitcoin.com's VERSE — a different asset that also has no Binance Spot pair relied on here.) |

**Pair inactive: 0.** No asset in the set has its own pair present-but-not-TRADING. (The only BREAK pair encountered, LITUSDT, belongs to a different asset — see the lighter row.)

**Identity unresolved: 0.** All 21 CoinGecko IDs resolved to a unique asset; the two ticker collisions (AI, LIT) were resolved by contract, which is exactly why identity is checked by ID + contract and never by ticker alone.

## What this means

- **6 of 21** unique assets are a mapping-table gap, not a venue gap: the pair exists, trades, and both the entry-evidence route (aggTrades) and the monitoring route (1m klines) answer. Mapping additions for exactly these 6 are prepared in `mapping-additions-prepared-2026-10-21.md` — **prepared, not deployed**.
- **15 of 21** have no Binance Spot pair for their identity. Absent mapping for these means coverage is *unresolved-by-venue*, not a fixable table gap, under the current Binance-Spot entry contract. **All 15 stay research-visible** — nothing is removed from research, and a future venue or listing change re-opens them.
- The 51-occurrence framing overstates the problem ~2.4×: the recurring deferral count is driven by 21 assets being re-presented every cycle.

*Sources: CoinGecko coin records by ID (2026-10-22T02:15:36Z); Binance Spot exchangeInfo via data-api.binance.vision (same pull); aggTrades + klines access probes (2026-10-22T02:17:39Z). Starting set: the 21 unique symbols in issuance-reason-breakdown-2026-10-21.md, with coinIds taken from the candidate records (live-paper-status-2026-10-21T2340Z.json).*
