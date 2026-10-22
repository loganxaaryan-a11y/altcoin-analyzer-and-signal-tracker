# Item 4 — One post-freeze opportunity: evidence record (2026-10-14)

## Verdict: prospective file remains header-only (empty run, documented)

No post-freeze opportunity has occurred. The live deployed paper stream
(`getpaperpilotstatus` on altcoin-analyzer-and-signal-tracker) contains
**0 candidates** across 3 deployed `runpapersignalcycle` runs — three
completed runs, zero opportunities (no candidates were evaluated, so there
was nothing to abstain on), nothing manufactured. The 31 legacy tracked
signals are intact.

## Checks performed (2026-10-14, ~06:15Z)

1. `live_paper_stream.py --status live-paper-status-2026-10-14.json`:
   0 candidates exported, 0 excluded pre-freeze, 3 deployed runs seen.
2. Prospective vessel `rows/cohort-prospective-v2.csv`: 1 line (header only).
3. Post-freeze cutoff enforced: v2.1.0 freeze time 2026-10-14T04:57:00Z
   (carried through v2.1.5 unchanged).

## Path proof (synthetic, kept out of the prospective file)

The export→adapter→collector path is proven by the non-empty regression
`comparison/tests/test_live_adapter_full.py` (12/12 green):
- synthetic deployed status (1 issued + 1 suppressed, labeled synthetic, /tmp only)
- flows through export_live_stream → ingest_live_paper_stream → collector row-building
- every audited field (contract, entry_observation, frozen_levels, gate_inputs,
  waiting_interval_evidence) verified field-by-field in the row dicts
- `test_real_prospective_file_untouched` asserts the real vessel is byte-identical
  before/after (still header-only)

## What happens next

The scheduled collection job (`paper-signal-comparison-collection`, 6h cadence)
continues to run. The first naturally occurring post-freeze opportunity —
issued or genuine abstention — will reach the prospective file exactly once
(idempotent on (candidate_id, freeze_version), pre-freeze rows rejected).
