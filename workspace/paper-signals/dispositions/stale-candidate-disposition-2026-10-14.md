# Stale-candidate disposition — 2026-10-14 09:00 ET dossier longs

**Scope:** BTC id43, ETH id42, SUI id41 — created 2026-10-14T13:00:09–21Z (09:00 ET).
Dispositioned 2026-10-14 ~18:30Z (~5.5h after creation). Paper signals only;
no brokerage. Holdouts locked. No model tuning. No rebuild.

## Headline verdict

All three are **DOSSIER-tracker measurement rows**, not paper-pipeline
issuances. Their frozen contract is `crypto-evaluation-v4-cohort-contract`
(the dossier measurement contract). **That contract defines no entry window
at all** — the entry is a frozen measurement reference at `createdAt`; the
evaluator walks candles from `entryAt` to `expiresAt` (30 elapsed days).
There is therefore no entry window that could have "expired" for them, and
**no actionable entry exists or is claimed**. None of the three is sent as
an actionable signal. Timestamps and prices below are the frozen originals —
nothing reset, nothing substituted.

The 15-minute entry window (`actionable-entry-v1`) belongs exclusively to
paper-pipeline contracts. No paper contract was ever issued for any of these
three ids (verified: zero rows in the paper `contracts`/`signals`/`candidates`/
`alerts` tables; deployed `getpaperpilotstatus` shows 0 alerts / 0 candidates /
0 signals; `alert-delivery-ledger.json` `entries={}`). The paper-window bounds
below are stated as **hypothetical reference bounds only** — no window ever
opened, so none expired; the applicable disposition is a named non-entry for
absence of any paper contract.

## Frozen rules, read from code (not docs)

**Dossier measurement contract** — applies to ids 41/42/43:
- Contract string (deployed tracker stats, `cohortDefinition`):
  `crypto-dossier-factor-agreement@2.0.0-measurement-contract; … 30 elapsed_days;
  first-post-decision-provider-quote; usd-spot-reference;
  modeled-roundtrip-18bps-funding-unverified-v1; evaluator
  crypto-evaluation-v4-cohort-contract`.
- Entry: frozen at `createdAt` (`ENTRY_CONVENTION =
  "first-post-decision-provider-quote"`, `signal-methodology.ts:7`).
- **No entry window anywhere in the evaluator.** `evaluateTradeSetup`
  (`signal-methodology.ts:188–234`) takes `{entryAt, expiresAt, …}` and walks
  eligible candles `entryAt → expiresAt`; it settles target touch /
  invalidation touch / 30d time-exit net of 18 bps. No window-open/window-close
  concept exists in this contract.
- Expiry: `primaryHorizon: 30`, `horizonUnit: "elapsed_days"` → expires at
  `createdAt + 30 days`. Interim checkpoints d5 / d14 / d30
  (`evaluationStatuses {d5,d14,d30}`, `outcome5/14/30`).
- Tracked row shape (`trackedSignalShape`, `actions.ts:1091`) carries no
  entry-window field — there is nothing to expire.

**Paper entry contract** (`actionable-entry-v1`) — does NOT apply (no contract
issued), bounds for reference only:
- `entryWindowOpensAt = decisionAt`,
  `entryWindowExpiresAt = decisionAt + cryptoEntryWindowMinutes × 60s`
  (`entry-v1/src/entry-rules.ts:402`).
- `cryptoEntryWindowMinutes: 15` (`entry-rules.ts:61`) → 15-minute window.
- `maxObservationAgeMs: 5 × 60_000` (5 min, `entry-rules.ts:64`);
  `cryptoDriftCapPct: 1.5` (`entry-rules.ts:60`); entry rule
  `first-post-decision-binance-spot-trade`; `primaryHorizon: 30`,
  `horizonUnit: "elapsed_days"`.
- Deployed artifact constants (space inspection `35f04a58…`, `inspection.json:125`):
  same 15-min window / 5-min max observation age / 2s future-skew tolerance;
  drift cap reads **50 bps deployed** vs 1.5% in workspace `entry-rules.ts` —
  noted, not reconciled here (no rebuild authorized).
- Named non-entries in code (`orchestrator/src/issuance/handler.ts`):
  `non-entry:first-print-unverifiable` (`void_first_print_unverifiable`),
  `non-entry:first-print-missed` (`void_first_print_missed`),
  `void_expired` (window closed before observation began / late receipt).

## Per-candidate disposition

### SUI id41 — LONG @ 1.032 (invalidation 0.926, target1 1.19), conf 52
- Decision time (frozen): **2026-10-14T13:00:09Z**. Not reset.
- Frozen contract: `crypto-evaluation-v4-cohort-contract`, `factorSchemaVersion legacy-array-v0`.
- Entry window under frozen contract: **NONE** (no such concept in the evaluator).
- Expiry (frozen): **2026-11-13T13:00:09Z** (`createdAt + 30 elapsed days`).
  Checkpoints: d5 2026-10-19T13:00:09Z · d14 2026-10-28T13:00:09Z · d30 2026-11-13T13:00:09Z.
- Hypothetical paper window (reference only, never opened): [2026-10-14T13:00:09Z, 2026-10-14T13:15:09Z].
- **Named non-entry: `non-entry:no-paper-contract-issued`** — dossier measurement
  row; never entered the paper path; no actionable entry exists or is claimed.
  Do not alert as actionable.
- Entry evidence retained: **NONE** — no venue print observed, no partial fill,
  no entry event in any paper table or deployed status. Nothing to retain.
- Notification rule: any future notification about id41 must carry the label
  **DELAYED** (signal is 5.5h old at disposition; it was never a live entry).

### ETH id42 — LONG @ 2,479.76 (invalidation 2,367, target1 2,649), conf 52
- Decision time (frozen): **2026-10-14T13:00:10Z**. Not reset.
- Frozen contract: `crypto-evaluation-v4-cohort-contract`, `factorSchemaVersion legacy-array-v0`.
- Entry window under frozen contract: **NONE**.
- Expiry (frozen): **2026-11-13T13:00:10Z**.
  Checkpoints: d5 2026-10-19T13:00:10Z · d14 2026-10-28T13:00:10Z · d30 2026-11-13T13:00:10Z.
- Hypothetical paper window (reference only, never opened): [2026-10-14T13:00:10Z, 2026-10-14T13:15:10Z].
- **Named non-entry: `non-entry:no-paper-contract-issued`** — dossier measurement
  row; never entered the paper path; no actionable entry exists or is claimed.
  Do not alert as actionable.
- Entry evidence retained: **NONE**.
- Notification rule: any future notification about id42 must carry **DELAYED**.

### BTC id43 — LONG @ 82,805 (invalidation 80,076, target1 86,899), conf 52
- Decision time (frozen): **2026-10-14T13:00:21Z**. Not reset.
- Frozen contract: `crypto-evaluation-v4-cohort-contract`, `factorSchemaVersion legacy-array-v0`.
- Entry window under frozen contract: **NONE**.
- Expiry (frozen): **2026-11-13T13:00:21Z**.
  Checkpoints: d5 2026-10-19T13:00:21Z · d14 2026-10-28T13:00:21Z · d30 2026-11-13T13:00:21Z.
- Hypothetical paper window (reference only, never opened): [2026-10-14T13:00:21Z, 2026-10-14T13:15:21Z].
- **Named non-entry: `non-entry:no-paper-contract-issued`** — dossier measurement
  row; never entered the paper path; no actionable entry exists or is claimed.
  Do not alert as actionable.
- Entry evidence retained: **NONE**.
- Notification rule: any future notification about id43 must carry **DELAYED**.

## Standing rule (documented where the alert worker reads it)

> **Future alerts fire AUTOMATICALLY within each contract's window, without
> waiting for expert approval.** When the paper pipeline issues a qualifying
> signal, the alert worker emits `SETUP_PENDING` at qualification and
> `ENTRY_CONFIRMED` on entry observation — inside the contract's 15-minute
> entry window — on the worker's normal sweep, with no expert-approval gate.
> Expert review remains measurement/oversight; it is never a delivery
> precondition.

Recorded in `pilot/delivery/delivery-config.json` (`auto_alert_rule`) and
`pilot/delivery/DELIVERY-SEMANTICS-2026-10-14.md` (§ "Standing rule —
automatic alerts, no expert gate"). Dossier-tracker rows are NOT alerted as
actionable under this rule; see `pilot/delivery/LABELING-SPEC-2026-10-14.md`
(DOSSIER vs PAPER paths).

## Verification notes (what was actually checked)

- `pilot/data/paper-pilot.sqlite`: `contracts`, `signals`, `candidates`,
  `alerts` tables hold exactly one row each — the Oct-13 BTC replay
  (`sig_53bb2a86d2e0fee1f3664812` / `ct_53bb2a86d2e0fee1f36648122134e684`);
  zero rows for ids 41/42/43.
- Deployed `getpaperpilotstatus` snapshot `worker-runs/status-2026-10-14T18-05-47Z.json`:
  `data.alerts=[]`, candidates 0, signals 0, `delivery.configured:false`.
- `pilot/delivery/alert-delivery-ledger.json`: `entries={}` — no alert ever emitted.
- Operational trace 2026-10-14: discovery run 58 → 0 candidates → paper run id 6
  → 0 issued. The 09:00 ET dossier signals came from the dossier path, not the
  paper path.
- The deployed artifact DB (`generatedSignals` ids 41–43) was not directly
  queryable from this seat; ids/params/timestamps are the frozen values supplied
  in the task brief, preserved verbatim.
