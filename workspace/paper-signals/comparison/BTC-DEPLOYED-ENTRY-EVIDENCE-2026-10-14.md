# BTC Deployed-Entry Evidence Export — 2026-10-14

**Signal:** `sig_53bb2a86d2e0fee1f3664812` (BTCUSD long, crypto terminal)
**Contract:** `ct_53bb2a86d2e0fee1f36648122134e684`
**Candidate:** `53bb2a86d2e0fee1f36648122134e684`
**Store:** `pilot/data/paper-pilot.sqlite` (under `~/workspace/goals/research-terminal/paper-signals/`)
**Audit classification:** Class C (the single Class C row of 120), `audit/entry-audit-v2-2026-10-14.csv` row 76 —
"deployed-pilot runpapersignalcycle issuance: real Binance-spot prints,
`issuedBy=paper-signals-integrated-handler`, distinct-ms timestamps, kill-test resume
mid-hold after entry; terminal issued on its own".

**Honesty legend.** Pieces are either EVIDENCED (verbatim from persisted
records/files) or marked **deployment provenance unverified** (not persisted /
not found — left blank, never reconstructed).

---

## 1. Action / run ID

| Field | Value |
|---|---|
| Pilot cycle ID | `restart-demo-2026-10-13` (EVIDENCED — every line of `pilot/evidence/restart-demo-2026-10-13.jsonl`) |
| Execution form | local VM pilot process: `pilot/src/pilot.ts` "run" (ingest + tick), PID 16838; `kill -9` mid-awaiting-entry hold at 2026-10-14T02:50:09.865Z; resumed by a new "pilot tick" process at 2026-10-14T02:50:10.116Z which reloaded the persisted contract row and issued (EVIDENCED — `pilot/evidence/restart-resume-2026-10-13.log`) |
| issuance_claim (signals table) | `b2a3a97a-c4a8-4075-aef4-77e87ad3b55e` (EVIDENCED) |
| Deployed-artifact action invocation ID | **deployment provenance unverified** — no artifact action invocation ID exists for this entry. The deployed `altcoin-analyzer-and-signal-tracker` runs (`paper-pilot-v2.1.0:scheduled:5973178`, `:manual:5973178`, `:manual:5973183`, 04:54–05:18 UTC, per `comparison/deployed-run-counts-2026-10-14.json`) evaluated **zero candidates and issued zero signals**; they did not produce this entry. This entry came from the paper-pilot machinery executed locally. |

## 2. Persisted contract (full record, verbatim from `contracts` table)

```json
{
  "contractVersion": "actionable-entry-v1",
  "terminal": "crypto",
  "signalId": "sig_53bb2a86d2e0fee1f3664812",
  "strategyId": "paper-crypto-dossier",
  "strategyVersion": "0.1.0-sandbox",
  "parameterHash": "sandbox-paper-v1",
  "decisionAt": "2026-10-14T02:49:36.346Z",
  "decisionClock": "server-utc",
  "decisionPrice": 83472.56,
  "sourceObservedAt": "2026-10-14T02:49:33.750Z",
  "sourceObservationWindow": null,
  "entryRule": "first-post-decision-binance-spot-trade",
  "entryVenue": "binance-spot",
  "entryWindowOpensAt": "2026-10-14T02:49:36.346Z",
  "entryWindowExpiresAt": "2026-10-14T03:04:36.346Z",
  "entryPrice": 83457.88,
  "entryObservedAt": "2026-10-14T02:49:57.509Z",
  "entryReceivedAt": "2026-10-14T02:50:12.698Z",
  "observationDegraded": false,
  "driftCapPct": 1.5,
  "driftObservedPct": -0.017586617686091113,
  "entryState": "entered",
  "voidReason": null,
  "invalidationPrice": 82220.47,
  "target1Price": 85142.01,
  "target2Price": 86811.46,
  "riskPerUnit": 1252.0899999999965,
  "horizonUnit": "elapsed_days",
  "primaryHorizon": 30,
  "evaluatorCompatibility": "actionable-entry-v1 crypto: venue-stamped first post-decision trade print",
  "supersedes": null,
  "issuedBy": "paper-signals-integrated-handler",
  "issuedAt": "2026-10-14T02:49:36.346Z",
  "cohortId": "actionable-entry-v1:crypto:elapsed_days:30",
  "entryEvidence": "venue-trade",
  "entryEvidenceReason": null
}
```

Status: EVIDENCED (verbatim from the `contracts` row in `pilot/data/paper-pilot.sqlite`;
state `entered`, updated 2026-10-14T02:50:15.436Z).

## 3. Raw print + receipt evidence

| Field | Value | Status |
|---|---|---|
| Entry price (venue print) | 83457.88 | EVIDENCED (contract row) |
| Venue | `binance-spot` (Binance.US `BTCUSD` aggTrades) | EVIDENCED |
| Venue observation timestamp | 2026-10-14T02:49:57.509Z (trade timestamp on the first post-decision trade; ~21s post-decision at 02:49:36.346Z, distinct ms) | EVIDENCED |
| Receipt/processing timestamp | 2026-10-14T02:50:12.698Z (`entryReceivedAt`) | EVIDENCED |
| Venue HTTP call | `GET /api/v3/aggTrades symbol=BTCUSD startTime=1791946176345 limit=1000` → 200 in 2164ms at 2026-10-14T02:50:12.692Z | EVIDENCED (`pilot/evidence/http-calls-restart-demo-2026-10-13.jsonl`) |
| Venue trade ID | **deployment provenance unverified** — no venue trade ID is persisted in the contract row, the signal row, or the evidence log; the HTTP-call log records request metadata only (no response bodies), so the served stream cannot be independently re-verified. Same caveat as the audit: "no in-store print log". | |
| Served-print log | **deployment provenance unverified** — no served-print log exists (audit caveat carried from v1). | |

Note: the run's own log states "real venue bars over the genuine
[decisionAt, entryObservedAt] interval" (`waiting-interval-evidence` step,
3 bars). The candidate inputs carry the pre-decision venue data (see §4).

## 4. Qualification ledger (factor ledger / gate inputs)

No standalone per-factor ledger document was persisted for this candidate —
`research/factor-ledgers-2026-10-13.json` covers retrospective candidates only,
and the candidate `record_json` has no `factors`/`factorLedger` field.
**The standalone factor ledger is therefore deployment provenance unverified.**
What IS persisted (EVIDENCED):

**Gate summary** (signal row):
> "integrated issuance [automatic]: retained regime gate passed;
> runQualificationChecks pass; entered 2026-10-14T02:49:57.509Z via
> first-post-decision-binance-spot-trade (drift -0.017586617686091113%, evidence
> venue-trade); waiting-interval veto pass; post-entry invalidation unresolved
> (fail-closed on the invalidation question; entry validity reported separately)"

**Gate inputs** (candidate `record_json`, verbatim keys):
- terminal `crypto`, symbol `BTCUSD`, direction `long`, score `0.62`,
  source `watchlist`, detectedAt `2026-10-14T02:49:33.750Z`, signalDate `2026-10-13`
- `inputs.signalDay`: 2026-10-13 OHLC `81760.12 / 84068.42 / 80969.58 / 83100.61`,
  source `binance.us klines 1d`
- `inputs.historyCloses`: 89 daily closes; `inputs.historyHighs`: 89 daily highs
  (binance.us klines 1d)
- `inputs.currentPrice`: 83472.56 at `inputs.asOf` 2026-10-14T02:49:33.750Z
  (`binance.us ticker/price`)
- `inputs.vetoBars`: 1-minute `binance.us klines` covering the pre-decision interval
- Delays: detection→qualification 2596ms, qualification→issuance 21163ms,
  issuance→alert 17927ms, detection→alert 41686ms
- `entryEventId`: `crypto:sig_53bb2a86d2e0fee1f3664812:2026-10-14T02:49:57.509Z`

## 5. Handler version / source hash

- `issuedBy` (contract row): `paper-signals-integrated-handler` (EVIDENCED)
- The run executed `integratedTick`/`ingestIntegratedCandidate` imported via
  `pilot/src/vendor.ts` from `orchestrator/dist/paper-signals/orchestrator/src/issuance/handler.js`.
- `ISSUANCE_HANDLER_VERSION`: **deployment provenance unverified.** The constant
  was not recorded in any run evidence (DB rows, JSONL log, alert outbox).
  Current `orchestrator/src/issuance/handler.ts` declares `"2.1.8"`, but the
  compiled `dist` handler that executed at 02:49–02:50 UTC was overwritten by a
  later rebuild (file mtime 2026-10-14 09:12 UTC), so the version/hash that ran
  for THIS entry cannot be recovered — reporting `2.1.8` as the run's version
  would be an inference, and is not made here.
- Source hash of the handler at run time: **deployment provenance unverified**
  (not recorded anywhere).

## 6. Alert acknowledgement

Setup alert `setup_53bb2a86d2e0fee1f36648122134e684` and entry alert
`entry_sig_53bb2a86d2e0fee1f3664812` were written to the sandbox file outbox
(`pilot/evidence/alert-outbox-restart-demo-2026-10-13/`). EVIDENCED facts:

- Entry alert file `entry_sig_53bb2a86d2e0fee1f3664812.json`:
  `channel: "sandbox-feed"`, enqueued 2026-10-14T02:50:15.436Z,
  delivered 2026-10-14T02:50:15.528Z.
- Entry ack file `entry_sig_53bb2a86d2e0fee1f3664812.ack.json` (verbatim):
  ```json
  {
    "alertId": "entry_sig_53bb2a86d2e0fee1f3664812",
    "status": "acknowledged",
    "simulated": true,
    "transport": "sandbox-file-outbox",
    "note": "SIMULATED acknowledgement — sandbox file outbox; no real delivery channel exists in the paper pilot",
    "at": "2026-10-14T02:50:15.527Z"
  }
  ```
- `alerts` table rows: `delivery_status = "delivered-simulated"`,
  `delivery_mode = "simulated"`, `channel = "sandbox-feed"`, `ack_id = ""` (empty).
- A live-channel ack (research side chat / terminal): **deployment provenance
  unverified** — no live delivery channel exists in the paper pilot; the only
  ack on record is the explicitly simulated one above.

## 7. Audit per-record support for the 117 / 2 / 1 counts

Source: `audit/entry-audit-v2-2026-10-14.csv` (120 rows), counts corroborated by
`audit/dedup-counts-v2-2026-10-14.json` and summarized in
`audit/entry-audit-v2-2026-10-14.md`.

| Class | Rows | What they are | Store paths (rows) |
|---|---|---|---|
| A — synthetic fixtures | 117 | Sandbox/demo fixture entries, v1 verdict `affected`; measurement-excluded | `demo/evidence/integrated/demo{1,2,3,5,6,7,8,9,10}-*/store.db` (75 rows), `equity-discovery/handoff/handoff-store-2026-10-14.db` (42 rows), `handoff/data/orchestrator-demo-2026-10-14.sqlite` (1 row) |
| B — market-data replays / sandbox duplicates | 2 | Same opportunity as the Class C entry, excluded as duplicate-or-sandbox | `pilot/data/paper-pilot-dryrun.sqlite` row 77 (dryrun copy: same signal + contract id, real Binance prints, sandbox execution, entry 83444.23 ~8.1s post-decision); `scheduling/watcher-demo/data/sched-demo.sqlite` row 79 (watcher-demo re-issue of same contract id, entry 83381.2, 616s post-decision, unverifiable first-print fidelity) |
| C — naturally issued deployed entry | 1 | The entry exported in this file | `pilot/data/paper-pilot.sqlite` row 76, `sig_53bb2a86d2e0fee1f3664812` |

Exclusion semantics (per `audit/exclusion-list-v2-2026-10-14.json` and
`audit/metric-contribution-v2-2026-10-14.md`): the two Class B rows are excluded
as `exclude-duplicate-or-sandbox`; the only measurement-eligible entry is the
Class C BTC long. It has **no completed outcome** (contract state `entered`),
so no hit rate is computable from the eligible set.

---

## Piece-by-piece verdict

| Piece | Status |
|---|---|
| Action/run ID (`restart-demo-2026-10-13`) | EVIDENCED; no artifact action invocation ID exists → that part **deployment provenance unverified** |
| Persisted contract | EVIDENCED (verbatim) |
| Raw print: price / venue / observation ts / receipt ts / HTTP call | EVIDENCED |
| Raw print: venue trade ID, served-print log | **deployment provenance unverified** |
| Qualification: gate summary + gate inputs | EVIDENCED |
| Qualification: standalone per-factor ledger | **deployment provenance unverified** (never persisted) |
| Handler: `issuedBy` label + executed module path | EVIDENCED |
| Handler: `ISSUANCE_HANDLER_VERSION` / source hash at run time | **deployment provenance unverified** |
| Alert: simulated ack record (explicitly labeled simulated) | EVIDENCED as-simulated |
| Alert: live-channel ack | **deployment provenance unverified** (no live channel exists) |

*Export written 2026-10-14 by evidence-export subagent. Read-only except for
these two export files. Paper signals only; no brokerage; holdouts untouched.*
