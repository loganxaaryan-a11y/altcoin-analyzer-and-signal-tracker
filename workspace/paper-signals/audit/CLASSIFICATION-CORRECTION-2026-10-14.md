# Classification Correction — 2026-10-14

**Scope:** paper signals only. Append-only record update. No rebuild, no re-audit, no re-verification of any artifact.

## The correction

Entry `sig_53bb2a86d2e0fee1f3664812` (BTCUSD long, crypto terminal; contract `ct_53bb2a86d2e0fee1f36648122134e684`; store `pilot/data/paper-pilot.sqlite`; CSV row 76 of `audit/entry-audit-v2-2026-10-14.csv`) moves from **Class C** ("naturally issued deployed entry") to **Class B** (market-data replay). Ruling: the expert. Original records are untouched; this note appends the corrected classification on top.

## Raw evidence supporting the change

All from `comparison/BTC-DEPLOYED-ENTRY-EVIDENCE-2026-10-14.md` / `.json` (evidence-export, 2026-10-14):

1. **Local VM execution, not the deployed artifact.** The run that issued this entry was a local pilot process on this VM: `pilot/src/pilot.ts` "run" (ingest + tick), PID 16838; `kill -9` mid-awaiting-entry hold at 2026-10-14T02:50:09.865Z; resumed by a new local "pilot tick" process at 2026-10-14T02:50:10.116Z, which reloaded the persisted contract row. Cycle ID `restart-demo-2026-10-13`.
2. **No deployed action invocation ID.** None exists for this entry. The three deployed `altcoin-analyzer-and-signal-tracker` runs that night (`paper-pilot-v2.1.0:scheduled:5973178`, `:manual:5973178`, `:manual:5973183`, 04:54–05:18 UTC, per `comparison/deployed-run-counts-2026-10-14.json`) **evaluated zero candidates and issued zero signals** — they did not produce this entry.
3. **Sandbox file outbox.** Setup and entry alerts (`setup_53bb2a86d2e0fee1f36648122134e684`, `entry_sig_53bb2a86d2e0fee1f3664812`) were written to `pilot/evidence/alert-outbox-restart-demo-2026-10-13/` with `channel: "sandbox-feed"`.
4. **Simulated acks.** The entry ack record is verbatim: `"status": "acknowledged", "simulated": true, "transport": "sandbox-file-outbox", "note": "SIMULATED acknowledgement — sandbox file outbox; no real delivery channel exists in the paper pilot"`. DB `alerts` rows show `delivery_status = "delivered-simulated"`, `delivery_mode = "simulated"`, `ack_id = ""` (empty).
5. **Handler provenance unrecoverable.** `issuedBy = paper-signals-integrated-handler` is persisted, but the handler version/source hash at run time cannot be recovered (compiled dist overwritten 2026-10-14 09:12 UTC).

What was real: Binance.US spot prints (BTCUSD, real aggTrades/ticker/klines inputs, real first post-decision trade observed 2026-10-14T02:49:57.509Z). What was not real: the issuance path — a local VM replay, not a deployed-issued signal. Real venue data replayed through sandbox machinery is Class B, not Class C.

## Corrected headline counts (120 audited rows)

| Class | Records | Unique opportunities |
|---|---|---|
| A — synthetic fixtures | 117 | 47 |
| B — market-data replays / sandbox executions | 3 | 1 (all three rows are `sig_53bb2a86d2e0fee1f3664812`: `paper-pilot.sqlite`, `paper-pilot-dryrun.sqlite`, `sched-demo.sqlite`) |
| C — verified deployed-natural entries | **0** | 0 |

- **Excluded records:** 120 (all classes excluded; see `audit/exclusion-list-v3-2026-10-14.json`). v2 list preserved untouched.
- **Measurement-eligible entries:** 0 (previously 1 under the v2 classification).
- **Unique opportunities (deduped by signal_id):** 48 (47 A + 1 B).
- **Completed outcomes:** 0 — the eligible set is empty, so no hit rate, expectancy, or R statistic is computable from the audited rows.

## Measurable baseline

**Prospective accuracy: NO COMPLETED OUTCOMES.** Zero verified deployed-natural (Class C) entries exist to date, so there is no prospective accuracy to measure against the frozen v2.1.x rules yet. The baseline starts at zero completed outcomes and accumulates only from future verified deployed-natural entries. This baseline is also published as `audit/measurable-baseline-2026-10-14.md`.

## v2.1.9 fix status

v2.1.9 repairs remain **BUILDER-VERIFIED pending independent check**: the expert's rerun passed v2.1.8; v2.1.9 changed source has not been independently rerun. Nothing in this correction re-verifies that. Per instruction, no re-verification was performed.
