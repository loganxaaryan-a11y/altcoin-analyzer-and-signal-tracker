# Prepared mapping additions — 6 Binance Spot USDT rows (2026-10-21)

**Status: PREPARED, NOT DEPLOYED — deployment = new freeze amendment on Logan's word.** No freeze version was created, no artifact was edited, no collector was changed. Prepared 2026-10-21 (late evening, EDT) under Logan's authorization of the read-only probe (~22:14 EDT), following the v2.1.4/v2.1.5 prospective mapping-amendment pattern (precedent: beam-2 → BEAMXUSDT, freeze v2.1.5, identity resolution in doc 44).

## Scope of the prepared amendment (when deployed)

Venue instrument mapping addition only: 6 Binance Spot USDT rows for assets whose identity was resolved by CoinGecko ID + contract, whose Binance Spot USDT pair was verified TRADING, and whose entry-evidence (aggTrades) and monitoring (1m klines) routes were both probe-verified reachable. Evidence: `unmapped-assets-probe-2026-10-21.md` (identity + exchangeInfo pull 2026-10-22T02:15:36Z; access probes 2026-10-22T02:17:39Z). No prediction-weight, factor-set, scoring-formula, gate, or threshold change — identical in kind to the v2.1.5 BEAM amendment.

## The exact rows to add

Freeze venue-mapping format (`venueMappings`, as carried in the paper-pilot status):

```json
[
  { "coinId": "vaulta",   "instrument": "AUSDT",    "venue": "Binance Spot" },
  { "coinId": "ethena",   "instrument": "ENAUSDT",  "venue": "Binance Spot" },
  { "coinId": "iostoken", "instrument": "IOSTUSDT", "venue": "Binance Spot" },
  { "coinId": "prometeus","instrument": "PROMUSDT", "venue": "Binance Spot" },
  { "coinId": "wormhole", "instrument": "WUSDT",    "venue": "Binance Spot" },
  { "coinId": "zama",     "instrument": "ZAMAUSDT", "venue": "Binance Spot" }
]
```

Runtime venue-mapping record shape (same fields as existing mapped rows, e.g. compound-governance-token):

```json
[
  { "coinId": "vaulta",    "symbol": "A",     "pair": "AUSDT",    "venue": "Binance Spot", "delisting_risk_flag": false, "delisting_risk_note": null, "listing_status_runtime_rechecked": false },
  { "coinId": "ethena",    "symbol": "ENA",   "pair": "ENAUSDT",  "venue": "Binance Spot", "delisting_risk_flag": false, "delisting_risk_note": null, "listing_status_runtime_rechecked": false },
  { "coinId": "iostoken",  "symbol": "IOST",  "pair": "IOSTUSDT", "venue": "Binance Spot", "delisting_risk_flag": false, "delisting_risk_note": null, "listing_status_runtime_rechecked": false },
  { "coinId": "prometeus", "symbol": "PROM",  "pair": "PROMUSDT", "venue": "Binance Spot", "delisting_risk_flag": false, "delisting_risk_note": null, "listing_status_runtime_rechecked": false },
  { "coinId": "wormhole",  "symbol": "W",     "pair": "WUSDT",    "venue": "Binance Spot", "delisting_risk_flag": false, "delisting_risk_note": null, "listing_status_runtime_rechecked": false },
  { "coinId": "zama",      "symbol": "ZAMA",  "pair": "ZAMAUSDT", "venue": "Binance Spot", "delisting_risk_flag": false, "delisting_risk_note": null, "listing_status_runtime_rechecked": false }
]
```

Resulting mapping-table size on deployment: 44 → 50 coinIds.

## Identity + verification record per row

| coinId | Canonical asset | Contract / identity anchor | Pair status | aggTrades | klines 1m |
|---|---|---|---|---|---|
| vaulta | Vaulta (A), ex-EOS native L1 | CoinGecko `vaulta`; no EVM contract recorded (native chain) | AUSDT TRADING | OK | OK |
| ethena | Ethena (ENA) | Ethereum 0x57e114b691db790c35207b2e685d4a43181e6061 | ENAUSDT TRADING | OK | OK |
| iostoken | IOST (IOST) | Native L1; BSC representation 0xaf48b7e315a52518cfbf7d96c455d9dfad94cb48 | IOSTUSDT TRADING | OK | OK |
| prometeus | Prom (PROM) | Ethereum 0xfc82bb4ba86045af6f327323a46e80412b91b27d | PROMUSDT TRADING | OK | OK |
| wormhole | Wormhole (W) | Ethereum 0xb0ffa8000886e57f86dd5264b9582b2ad87b2b91 | WUSDT TRADING | OK | OK |
| zama | Zama (ZAMA) | Ethereum 0xa12cc123ba206d4031d1c7f6223d1c2ec249f4f3 | ZAMAUSDT TRADING | OK | OK |

All statuses and access results as of the probe timestamps above (2026-10-22T02:15:36Z / 02:17:39Z). Per the established prospective process, TRADING status is re-verified at deployment time; a pair that has left TRADING by then does not get added.

## Explicitly NOT included

The other 15 probed assets (see the probe file): 13 with no Binance Spot base asset for their ticker at all, plus 2 ticker collisions (artificial-inu-3 — Binance AIUSDT is Sleepless AI; lighter — Binance LITUSDT is the legacy Litentry instrument, in BREAK) where mapping by ticker would attach the wrong asset. They stay research-visible and unmapped.

**Prepared, not deployed — deployment = new freeze amendment on Logan's word.**
