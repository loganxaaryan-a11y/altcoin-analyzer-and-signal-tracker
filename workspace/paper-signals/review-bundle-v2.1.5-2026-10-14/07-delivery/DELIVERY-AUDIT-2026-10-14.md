# Delivery audit — 2026-10-14

Scope: every alert record in `paper-signals/` — `demo/evidence/`, `pilot/evidence/`,
all alert outbox stores, orchestrator/demo SQLite stores. Rule under audit:
**no record is marked `delivered` without an actual channel acknowledgement**;
sandbox simulated acks must stay labeled simulated. Under the 2026-10-14
delivery semantics, `delivered` is reserved for real chat-channel acks;
sim-ack rows carry `delivered-simulated`.

## Verdict

**Violations found and corrected.** 96 alert rows across live SQLite stores were
marked `delivered` on simulated acks only. All 96 have been relabeled
`delivered-simulated` in the live stores (UPDATE applied 2026-10-14, verified
post-update: zero rows still carry bare `delivered` anywhere in the tree's
SQLite stores). Frozen evidence snapshots keep their original bytes (evidence
integrity); their corrected status is recorded in this ledger.

No record anywhere claimed a REAL channel acknowledgement for a signal alert.
The only real-channel delivery on record is a labeled `channel-test` ping
(see below) — explicitly not a signal.

## Corrections applied (live stores)

| Store | Rows relabeled | From → to |
|---|---|---|
| `pilot/data/paper-pilot.sqlite` | 2 (`setup_53bb…22134e684`, `entry_sig_53bb…4812`) | `delivered`/`simulated` → `delivered-simulated` |
| `pilot/data/paper-pilot-dryrun.sqlite` | 2 (same ids) | `delivered`/`simulated` → `delivered-simulated` |
| `demo/evidence/alert-recovery/demo.sqlite` | 2 (`setup_b738…be8b0f`, `entry_sig_b738…6b8cf`) | `delivered`/`simulated` → `delivered-simulated` |
| `demo/evidence/integrated/*/store.db` | 90 rows across 46 stores (16 with explicit `delivery_mode=simulated`; 74 on the intermediate schema with no mode column — the sandbox integrated demos had no real channel, so sim-ack is the only possible reading) | `delivered` → `delivered-simulated` |

## Corrected by this ledger (frozen snapshots — bytes preserved)

These are historical evidence snapshots; original labels are kept verbatim and
the relabel is applied by this audit record:

- `pilot/evidence/db-rows-2026-10-14T02-48-45-321Z.json` — 2 alert rows
  (`setup_53bb…`, `entry_sig_53bb…`): labeled `delivered`/`simulated` →
  **corrected status `delivered-simulated`**
- `pilot/evidence/db-rows-2026-10-14T02-50-10-513Z.json` — same 2 rows →
  **corrected status `delivered-simulated`**
- `demo/evidence/alert-recovery/summary.json` — `entryAlert` + `setupAlert`
  `deliveryStatus: delivered` / `deliveryMode: simulated`, and the
  `recoveryReport.delivered` list → **corrected status `delivered-simulated`
  (transport-recovery phase labels, sandbox only)**

## Clean records (verified, no violation)

- `pilot/evidence/alert-outbox-dryrun-1/` and
  `pilot/evidence/alert-outbox-restart-demo-2026-10-13/` — payload `.json`
  files snapshot the alert at enqueue (`deliveryStatus: "enqueued"`,
  `deliveredAt: null`); companion `.ack.json` files are explicitly labeled
  `"simulated": true`, `"note": "SIMULATED acknowledgement — sandbox file
  outbox; no real delivery channel exists in the paper pilot"`. ✓
- `pilot/evidence/dryrun-1.jsonl` and `restart-demo-2026-10-13.jsonl` —
  `alert-delivered` events carry `"ackSimulated": true` and
  `transport: "sandbox-file-outbox"`. Correctly labeled. ✓
- `demo/evidence/stores/{a,b,c,read-path}/store.json` — 3 alert rows,
  `deliveryStatus: "enqueued"`, `deliveredAt: null`. ✓
- `demo/evidence/demos/{a,e,read-path}.json` — delivery fields show
  `enqueued` only, no delivered claims. ✓
- Old-schema integrated stores (alerts table without delivery columns) — no
  delivery claim possible by construction. ✓
- `comparison/acceptance-run-v2.1.0/evidence/acceptance-run-evidence.json` —
  delivery section records `alerts_enqueued: 2` only, destination
  `awaiting-user-choice` (truthful at that time; superseded for live routing
  by `pilot/delivery/delivery-config.json`). No delivered claim. ✓
- `pilot/evidence/terminal-runtime-demo-2026-10-14/` — `channel-post-proof.json`
  (HTTP 200 to webhook.site) + `channel-receipt.json` (inbox fetch 200) are a
  REAL third-party ack of a payload explicitly labeled `kind: "channel-test"`,
  `demo: "terminal-runtime-shim-2026-10-14"` — a labeled routing ping, NOT a
  signal alert. The accompanying `TERMINAL-RUNTIME-EVIDENCE-2026-10-14.md`
  states this plainly and class (a) sandbox evidence states `delivered =
  sandbox file-outbox with simulated ack, NOT a real channel`. ✓

## Notes

- The `awaiting-user-choice` string survives only inside the frozen
  acceptance-run-v2.1.0 evidence (acceptance-run.ts, log, evidence JSON) as a
  truthful historical record; it is superseded, not rewritten, for live routing.
- No production code, frozen manifests, or the accepted recovery implementation
  were modified. Only SQLite `delivery_status` labels in paper/demo stores were
  corrected, plus the new spec files in `pilot/delivery/`.
