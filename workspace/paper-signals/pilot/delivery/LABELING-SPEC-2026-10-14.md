# Labeling spec — DOSSIER vs PAPER signal paths, 2026-10-14

Logan's direction (2026-10-14): two signal paths, explicit labels everywhere —
chat alerts AND terminal UI. Paper only; no brokerage. No freeze change.

## The two paths

| | DOSSIER | PAPER |
|---|---|---|
| Purpose | research / setup | prospective strategy |
| What it is | a scored read with frozen levels, graded later | a live contract with an entry window, an observed entry (or a named non-entry), and a 30d horizon |
| Issuance | dossier analysis (`getCryptoAnalysis` → tracker row) | paper pipeline (discovery → handoff → `runpapersignalcycle` → `actionable-entry-v1` contract) |
| Entry | frozen reference price at decision time — **not an order, not a fill** | venue-stamped first post-decision print inside the 15-min window — **or a named non-entry** |
| Alerts | research context only — **never alerted as actionable** | `SETUP_PENDING` / `ENTRY_CONFIRMED`, automatic within the contract window |

## Required fields — DOSSIER (every display, every mention)

Every dossier signal display/alert MUST include:
1. **Decision time** — the frozen `createdAt` (UTC). Never "now", never refreshed.
2. **Horizon** — 30 elapsed days; checkpoints d5 / d14 / d30.
3. **Evidence timestamp** — the row's `sourceAsOf` (when the underlying data was captured).
4. **Actionable entry verified?** — YES/NO. YES only with a paper contract id
   and a venue-stamped entry print; otherwise NO, stated plainly.

Example (id43): `DOSSIER · BTC long · decision 2026-10-14T13:00:21Z ·
horizon 30d (d5/d14/d30) · evidence as of <sourceAsOf> ·
entry 82,805 (frozen reference) · ACTIONABLE ENTRY: NOT VERIFIED — no paper contract.`

A dossier signal MUST NOT be rendered with paper-path fields (no contract id,
no awaiting/entered state), and MUST NOT be phrased as an entry ("entered at",
"filled at") — the frozen price is a measurement reference.

## Required fields — PAPER (every display, every alert)

Every paper signal display/alert MUST include:
1. **Frozen strategy version** — e.g. `paper-pilot-v2.1.0` + contract
   `actionable-entry-v1` (and handler version once deployed, e.g. v2.1.9).
2. **Contract ID** — the `ct_…` id (and linked `sig_…` signal id).
3. **State** — exactly one of: `awaiting entry` / `entered` / `expired` / `voided`
   (voided carries its named reason: `void_expired`,
   `non-entry:first-print-unverifiable`, `non-entry:first-print-missed`,
   `void_no_quote`, …).

Example: `PAPER · BTCUSD long · paper-pilot-v2.1.0 / actionable-entry-v1 ·
contract ct_… · state: entered · entry 83,457.88 (venue-stamped 2026-10-14T02:49:57Z).`

Example: `PAPER · ETHUSD long · paper-pilot-v2.1.0 / actionable-entry-v1 ·
contract ct_… · state: voided (void_expired — entry window [.., ..] closed before
observation began).`

## Cohort discipline

1. **Performance cohorts stay SEPARATE.** Dossier-tracker grades, paper-cohort
   outcomes, fixtures/replays, and the retrospective 356-row cohort are never
   pooled into one denominator. Each population reports its own N, its own
   hit rate, its own R.
2. **LINK overlapping records; never double-count.** When a dossier signal and
   a paper contract cover the same asset in an overlapping window, link the
   records (cross-reference by asset + window) and count the opportunity once
   per population — i.e. once in the dossier cohort AND once in the paper
   cohort is fine (different populations), but never twice inside one.
3. **No silent promotion.** A dossier signal must NOT silently enter the
   prospective paper cohort. If a dossier row is ever used cross-population
   (e.g. seeded as a paper candidate), that use must be explicit, labeled
   (`cross-population: dossier→paper`), and recorded — with its own new
   contract id and its own entry window. Id reuse across populations is
   forbidden as an issuance mechanism.
4. **Dossier rows are not alerts.** The alert worker emits only paper-path
   alerts (`SETUP_PENDING`, `ENTRY_CONFIRMED`). A dossier signal surfacing in
   chat carries the DOSSIER label and the entry-verification field — it is
   research context, never a call to act.

## Where this binds

- Chat alerts: the `paper-signal-alert-delivery` worker reads this spec via
  `delivery-config.json` (`labeling_spec` pointer). Paper alerts render the
  PAPER required fields; the worker never emits a dossier row as an alert.
- Terminal UI: the deployed artifact's tracker/alert feed should render the
  path-appropriate fields above (spec; artifact change is post-freeze work,
  not done here).
- Measurement: the comparison collector keeps the three populations
  (dossier / prospective-paper / fixtures-replays) in separate vessels;
  the cross-population linkage rule applies at collection time.

## Non-goals (explicitly out of scope)

- No new alert type for dossier signals is created by this spec.
- No change to any frozen contract, freeze version, or evaluator.
- No terminal UI code is modified here — this is the spec the UI must satisfy.
