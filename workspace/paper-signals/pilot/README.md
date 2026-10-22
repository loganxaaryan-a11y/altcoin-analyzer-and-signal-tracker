# Paper pilot — deployed cycle (Workstream D, 2026-10-13)

**PAPER ONLY.** Read-only market data, no orders, no brokerage, no real money.
Every artifact is labeled paper. Sandbox code; the production terminals were
not modified (the pilot only *imports* the compiled sandbox modules).

## What is wired

```
pilot/
  src/binance.ts    read-only Binance.US public market-data adapter
                    (GET /api/v3/klines, /api/v3/aggTrades, /api/v3/ticker/price
                    ONLY — allowlisted; any other path throws; every call
                    logged to evidence/http-calls-*.jsonl)
  src/deps.ts       builds the handler's IntegratedDeps:
                      DbStore (SQLite, durable across kill/restart)
                      Binance quote provider (cheap refresh)
                      Binance entry-observation feed (bounded watcher:
                        pollIntervalMs=20s << 15-min crypto window, maxPolls=40)
                      waiting-interval evidence (real 1m klines over the
                        genuine [decisionAt, entryObservedAt] interval;
                        crypto fails closed on empty)
                      post-entry evidence (real 1m klines)
                      deliverAlert hook -> sandbox transport
  src/transport.ts  sandbox alert transport: appendAlert = enqueue (store, in
                    the outcome transaction); this hook runs after enqueue;
                    the handler then calls markAlertDelivered — three separate
                    timestamps by construction. Acknowledgements are SIMULATED
                    and labeled so in the payload and the evidence log.
  src/pilot.ts      CLI: ingest | tick | run | loop | status
  src/vendor.ts     typed bridge to the compiled sandbox modules
                    (orchestrator/dist/.../handler.js, db-store.js, clock.js)
  config.json       symbol BTCUSD, crypto long, score 0.62, watcher bounds
  restart-demo.sh   the kill/restart demonstration script
```

The handler runs the integrated pipeline verbatim:
expiry → min-score → freshness refresh → retained regime gate →
runQualificationChecks (pipeline-order + setup-history + entry-zone) →
duplicate suppression → buildPendingContract → qualification commit
(candidate awaiting-entry + contract row pending + setup alert, one tx) →
setup alert delivered → bounded entry observation (first post-decision
binance-spot trade, 15-min window, 1.5% drift cap, 5-min observation-age
bound) → waiting-interval veto → post-entry check → outcome commit →
entry alert delivered. `tick` = one scheduled tick (what a cron invokes);
`loop` = the scheduled-tick loop.

## Run

```sh
cd pilot && npm run build
node dist/pilot.js run      # ingest one live-quote candidate + one tick
node dist/pilot.js tick     # one scheduled tick (picks up due + awaiting-entry)
node dist/pilot.js loop     # scheduled ticks every 60s until SIGTERM
node dist/pilot.js status   # dump DB rows
```

Env: PILOT_DB, PILOT_CYCLE_ID, PILOT_MAX_POLLS, PILOT_POLL_MS,
PILOT_PRE_OBSERVE_HOLD_MS (labeled demo-harness timing control only).

## Evidence (this run)

- `evidence/dryrun-1.jsonl` — full dry-run cycle, 2026-10-14T02:48Z:
  candidate 53bb2a86… → issued (entry observed 02:48:53Z, venue ts)
- `evidence/restart-demo-2026-10-13.jsonl` — kill/restart cycle (below)
- `evidence/restart-resume-2026-10-13.log` — timestamped kill/restart log
- `evidence/http-calls-*.jsonl` — every venue call (GET only, 3 paths)
- `evidence/alert-outbox-*/` — alert payloads + SIMULATED acks
- `evidence/db-rows-*.json` — persisted candidate/signal/contract/alert rows

## Restart/resume demonstration (item 3)

1. Fresh DB. `pilot run` (PID 16838) with a labeled 120 s pre-observation
   hold; candidate qualified → qualification commit → awaiting-entry,
   contract `ct_53bb…` pending, setup alert enqueued+delivered 02:49:36Z.
2. 02:50:09Z — `kill -9 16838` while the process slept in the hold
   (candidate awaiting-entry). SIGKILL confirmed.
3. Fresh `pilot status` probe: DB still holds awaiting-entry + pending
   contract row — no daemon, durable SQLite.
4. New process `pilot tick` 02:50:10Z — resumed from the persisted contract
   row (contract reloaded, NOT rebuilt; setup alert NOT re-fired):
   entry observed on the first live poll (venue print ts 02:49:57.509Z,
   receipt-age ~14 s < 5-min bound) → waiting-interval veto pass on 3 real
   1 m bars → issued 02:50:15Z → entry alert enqueued+delivered
   (simulated ack). All inside the 15-min entry window (expires 03:04:36Z).
