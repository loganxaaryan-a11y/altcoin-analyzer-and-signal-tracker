# Terminal-Runtime Demonstration + Real Alert Channel — Evidence (2026-10-14)

Workstream D. Paper signals only. No brokerage, no strategy changes, holdouts locked.
Nothing below touched the terminals' production databases, the artifact platform, or any live alert feed.

## What "the path" was

model-selected candidate → paper issuance → alert → delivery, executed 2026-10-14 ~04:00–04:10 UTC.

**Outcome: clean abstention.** The model selected BTC long (conviction 78); the terminal's REAL
issuance function evaluated it against REAL market data and SUPPRESSED it via its own born-dead
veto (signal-day low 81018 ≤ invalidation 81088.90). No signal was published, so no signal alert
was emitted — manufacturing one would have violated the paper mandate. The real delivery channel
was proven separately with a labeled channel-test ping (explicitly not a signal).

Evidence is reported in the three required classes. Nothing is relabeled across classes.

---

## Class (a) — SANDBOX evidence (what ran in the sandbox harness)

The paper pilot harness: `pilot/` driver + vendored sandbox modules (`orchestrator/dist`),
SQLite DbStore, Binance.US read-only feed, **sandbox file-outbox transport with SIMULATED acks**
(labeled as such in every payload). None of this ran in any terminal runtime.

- `pilot/evidence/dryrun-1.jsonl`, `http-calls-dryrun-1.jsonl`, `alert-outbox-dryrun-1/` —
  BTCUSD long: candidate ingested → setup alert → entry observed on a real Binance.US print →
  issued. Acks in the outbox are **simulated** (payloads say so).
- `pilot/evidence/restart-demo-2026-10-13.jsonl`, `restart-resume-2026-10-13.log` — process
  kill-tested mid-hold while awaiting-entry; resumed from the persisted row; detection→alert
  41.7s with every step traceable.
- `pilot/evidence/db-rows-2026-10-14T02-48-45-321Z.json`,
  `db-rows-2026-10-14T02-50-10-513Z.json` — persisted-row snapshots.
- `demo/integrated-demo-log-2026-10-13.md` — ten sandbox demonstrations (issuance, abstentions,
  stale-quote deferral, expiry, replay idempotency).
- Fresh re-confirmation 2026-10-14 (~04:10 UTC), `npm run status` against the pilot DB:
  candidate `53bb2a86d2e0fee1f36648122134e684` BTCUSD long status=issued, entry observed
  2026-10-14T02:49:57.509Z; setup + entry alerts marked `delivered` — **delivered = sandbox
  file-outbox with simulated ack, NOT a real channel.**

**Sandbox verdict:** the path candidate→issuance→alert works in the harness; alert "delivery"
there is simulated by design. This class proves nothing about the terminal runtime or real delivery.

---

## Class (b) — DEPLOYMENT evidence (terminal-runtime proximity)

### What "actual terminal runtime" means here, and what was achievable

The two terminals are hosted web artifacts; their backends run on the artifact platform and their
actions are invocable only via `artifact.invoke_action`. A subagent has no access to that API, no
live browser, and no platform session — so execution *inside the deployed artifact backend* was
not achievable from this position. Three candidate forms were evaluated:

1. **Invoke via the artifact action API** — not available to this subagent. Only the parent/root
   agent can do this (see "Exact gap" below).
2. **Import and execute the terminal's actual action-handler code** — ACHIEVED. The real
   `issueGeneratedSignalCandidate()` from `altcoin-analyzer-and-signal-tracker/server/src/actions.ts`
   (live tree, verified byte-identical to the 2026-10-13 source export — sha256 match on all six
   core files, hashes in `evidence/terminal-runtime-demo-2026-10-14/source-hashes.txt`) was
   transpiled read-only and executed in Node 24 with a shimmed `Ctx`. The shim provides
   `db` (drizzle over a disposable local SQLite file with the terminal's own 39 drizzle
   migrations applied), `invocationId` (fresh paper UUID), and throwing stubs for platform
   tools/privileged providers (the issuance path never calls them). The function performed its
   OWN real network reads (CoinGecko OHLC + markets; Binance klines for the history cache) and
   its OWN gates. This is the terminal's genuine issuance code path — not the sandbox port.
3. **Run the terminal's own scheduled scan path** (`runMarketDiscovery` via managedCronJobs) —
   not achievable from here (platform scheduler only) and out of paper scope (full discovery run).

Honest label for what ran: **the terminal's real issuance function, real market data, shimmed
execution context — NOT the deployed artifact runtime.** The deployed-runtime step remains open
(see "Exact gap").

### The demonstration (class b)

**Model selection** (`scripts/select-model.mjs`, deterministic, documented):
- Watchlist BTC/ETH/SOL; real daily klines from `data-api.binance.vision` (the same source the
  terminal's own history cache uses); 5 trend factors scored by the terminal's REAL
  `scoreDossierFactors()`; selection rule = highest `max(longScore, shortScore)`, no score floor
  (the terminal's gates are the qualifiers, never boosted by hand).
- Result: **BTC long, conviction 78** (long 78 / short 22); ETH 56, SOL 57.
  Full per-coin factor tables: `evidence/terminal-runtime-demo-2026-10-14/model-selection.json`.

**Draft construction** (`scripts/issue.mjs`): factors at full precision (same definitions),
`direction`/`confidence` set to the scorer's own outputs (so replay reconstruction is exact),
ATR-14 = 2077.688200909813 via the terminal's REAL `canonicalWilderAtr()`, draft levels via the
REAL `buildAtrLevels()` (entry 83686.01, invalidation 81088.89974886272), `rawAtrBars` = the
decision-time daily bars, `shortRegime: null` (long candidate — regime gate inapplicable;
null = "not evaluated" per the source, never treated as passed).

**Issuance** — the real function, 5148 ms, invocation `paper-shim-65a38544-4581-42cb-925a-5ad29c4042aa`:
```json
{ "status": "suppressed",
  "reason": "born-dead LONG: signal-day low 81018 <= invalidation 81088.89974886272",
  "signalDay": "2026-10-13" }
```
- The signal-day candle came from the function's own CoinGecko OHLC fetch
  (`candle_source: "CoinGecko OHLC → historical_daily_bars grading series"`).
- The born-dead veto — the terminal's own issuance-validation gate — refused to publish a long
  whose invalidation was already breached by the completed signal day. Correct behavior on real data.
- Shim-DB proof (`evidence/terminal-runtime-demo-2026-10-14/db-proof.json`, full DB at
  `evidence/terminal-runtime-demo-2026-10-14/shim.db`):
  `suppressed_signal_candidates` = 1 row (the veto, with candle low 81018 and full metadata),
  `signal_contracts` = 0, `signal_input_snapshots` = 0, `generated_signals` = 0.
  The real function wrote exactly what the real code writes on suppression — nothing else.

**Class (b) verdict:** the terminal's genuine issuance code path executed against real market
data and produced a real veto. What it is NOT: execution inside the deployed artifact backend.

### Exact gap — what the parent must arrange for TRUE deployed-runtime evidence

1. Invoke `analyzeCoin` on the **deployed** `altcoin-analyzer-and-signal-tracker` artifact via
   `artifact.invoke_action` with `{ "symbol": "BTC", "coinId": "bitcoin", "name": "Bitcoin" }`
   (request schema at `crypto/server/src/actions.ts:3247`). `analyzeCoin` is the production
   caller of `issueGeneratedSignalCandidate` (:3411). Capture: the action's returned payload,
   the resulting `suppressed_signal_candidates` / `signal_contracts` rows (via the artifact's
   inspect-data operations), and the invocation ID.
2. **Requires Logan's approval first:** this writes to the PRODUCTION artifact DB
   (`suppressed_signal_candidates` at minimum; a `signal_contracts` bundle if it publishes).
   Per his standing rules, production writes need his explicit go-ahead — the shim DB exists
   precisely so this demo did not need it.
3. Alternative with no production writes: have the builder add a paper-only action (shim-style
   Ctx against scratch storage) to the terminal and invoke that — needs a builder dispatch.

---

## Class (c) — DELIVERY evidence (real channel)

### Channel investigation (in order, per the task)

- **(a) The terminal's own alert feed** — ruled out from this position. It lives in the artifact's
  `app.db`; the artifact's own AGENTS.md forbids touching that file directly, and external writes
  require `artifact.invoke_action` or a builder edit. No path available to this subagent.
- **(b) Outbound webhook to a request-capture service** — CHOSEN. webhook.site token API works
  from this VM (token created 2026-10-14, no signup). The captured request in the receiver's
  inbox IS the delivery evidence: real outbound HTTPS to a real third party.
- **(c) Messaging integration on this machine** — none usable. `~/workspace/telegram-digest/`
  scaffolding exists but its `config.yaml` carries no bot token, and the digest is ON HOLD per
  Logan (2026-09-29). Not pursued.

The sandbox file outbox was NOT used as the "real channel" anywhere in this demo.

### Receipt proof

- Token: `https://webhook.site/466443bf-643f-43ef-b44d-2eff9c997dd1` (expires 2026-10-21).
- POST of the payload → **HTTP 200** (`evidence/terminal-runtime-demo-2026-10-14/channel-post-proof.json`).
- Inbox fetch `GET /token/{uuid}/requests` → **HTTP 200**; the captured request was found and its
  content verified byte-meaningful: `kind: "channel-test"`, `demo: "terminal-runtime-shim-2026-10-14"`,
  `issuanceOutcome.invocationId` matches the issuance run
  (`evidence/terminal-runtime-demo-2026-10-14/channel-receipt.json`,
  `channel-captured-request.json`).

**Critical labeling:** the delivered payload is `kind: "channel-test"` — explicitly NOT a signal
alert. The model-selected candidate was suppressed by the terminal's veto, so no signal alert
existed to deliver; sending a signal-shaped payload would have been manufacturing. The receipt
proves the REAL channel works end-to-end; a future published signal travels this same path.

### Exact gap — full "published signal → real channel" delivery

Requires a naturally qualifying candidate (never manufactured) or Logan's approval to run the
paper path against the deployed terminal with alert routing to a real destination. Today's
outcome was the honest one: suppression, no alert.

---

## Reproducibility

All scripts, stubs, hashes, and the shim DB are preserved under
`pilot/evidence/terminal-runtime-demo-2026-10-14/` (`scripts/`: select-model, issue, deliver,
init-db, transpile; `stubs/`: the two platform shims; `shim.db`: the 1.1 MB SQLite file with
the suppression row; `source-hashes.txt`: sha256 of every copied terminal source file).
Re-running `issue.mjs` issues a NEW invocationId; the idempotency key is per signal-day, so a
same-day re-run returns `already_exists` against the same shim DB (real idempotency behavior).

## Standing constraints honored

- Paper only: the only network calls were GETs to public market-data endpoints
  (data-api.binance.vision, api.coingecko.com, webhook.site). No orders, no brokerage.
- No strategy changes: no weights, gates, or thresholds were modified; the factor definitions
  used for the draft are documented in `scripts/select-model.mjs` and the draft's
  direction/confidence are the scorer's own outputs.
- Holdouts locked: no research data touched.
- No production state: terminal source was read-only (copied with `cp -p`); `app.db` never opened;
  the ts-spaces tree was not built or modified.
