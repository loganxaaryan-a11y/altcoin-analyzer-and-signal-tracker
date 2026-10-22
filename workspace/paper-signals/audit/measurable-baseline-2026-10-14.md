# Measurable Baseline — 2026-10-14 (paper signals)

**Prospective accuracy: NO COMPLETED OUTCOMES.**

Basis: the 2026-10-14 audit of 120 paper entry rows (see `audit/CLASSIFICATION-CORRECTION-2026-10-14.md`).

- Class A (synthetic fixtures): 117 records / 47 unique opportunities — excluded.
- Class B (market-data replays / sandbox executions): 3 records / 1 unique opportunity — excluded.
- Class C (verified deployed-natural entries): **0** — nothing remains as a naturally issued deployed entry after the expert reclassification of `sig_53bb2a86d2e0fee1f3664812` (local VM replay; sandbox outbox; simulated acks; no deployed action invocation ID).

Measurement-eligible entries: 0. Completed outcomes: 0. No hit rate, expectancy, or accuracy statistic is computable from the audited rows — the prospective baseline is empty and starts accumulating only from future verified deployed-natural (Class C) entries under the frozen v2.1.x rules.

Exclusion list in force: `audit/exclusion-list-v3-2026-10-14.json` (120 excluded / 0 eligible).
