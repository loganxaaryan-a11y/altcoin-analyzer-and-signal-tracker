# Worker logic demo — 2026-10-14

Logic demonstration only. NOTHING WAS SENT.
The real ledger was not modified (temp copy used). Case B values are the real 2026-10-14T02:48Z dry-run figures, replayed as a fixture.

```
CASE A — real deployed status snapshot (2026-10-14T05:41:30Z)
  alerts in status: 0 | to_emit: 0 | skipped: 0
  DECISION: QUIET — nothing emitted (correct: no signal, no noise)
CASE B — fixture replay of real dry-run signal sig_53bb2a86d2e0fee1f3664812 (values from the 2026-10-14T02:48Z dry run; NOT sent)
  schema validation: PASS
  dedup key: sig_53bb2a86d2e0fee1f3664812/ENTRY_CONFIRMED | prior ledger entry: none
  DECISION: EMIT (1 alert) — ledger -> awaiting-ack, attempts=1
  --- exact bytes that WOULD be emitted as the run output (NOT SENT) ---
**PAPER — ENTRY CONFIRMED** (paper signal, no real order)
BTCUSD long · sig_53bb2a86d2e0fee1f3664812
Setup: issuance gates passed: freshness refresh, retained regime gate, entry-zone check; score 0.62 ≥ floor; no duplicate suppression
Entry rule: first post-decision spot print inside the 15-min window, drift ≤ 1.5%
Entry price: 83438.92
Entry observed: 83438.92 @ 2026-10-14T02:48:53.405Z (venue print)
Invalidation: 82187.34 (1.5% below observed entry) · Targets: T1 85107.7 / T2 86776.48
Horizon: paper observation: exit on invalidation or targets
Data timestamp: 2026-10-14T02:48:53.405Z
dedup: sig_53bb2a86d2e0fee1f3664812 / ENTRY_CONFIRMED
  --- end of would-be emission ---
CASE C — same fixture, ledger already holds delivered for the dedup key
  to_emit: 0 | skipped: [('sig_53bb2a86d2e0fee1f3664812/ENTRY_CONFIRMED', 'already delivered — dedup skip')]
  DECISION: SKIP — no duplicate (correct)
CASE D — abstention input
  abstentions are not alert rows and never reach decide(); to_emit: 0 — QUIET (correct)
```
