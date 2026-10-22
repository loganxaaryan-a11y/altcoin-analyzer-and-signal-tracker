# FREEZE v2.0.0 — SUPERSEDED by v2.1.0

**Status: SUPERSEDED on 2026-10-14 by `freeze-manifest-v2.1.0.json`.**

`freeze-manifest-v2.0.0.json` is **immutable and kept on disk** — it is not
edited, not deleted, and its rows are not re-scored.

## Why superseded

v2.1.0 is a governance/measurement consolidation (Decision 3), not a
change to executable semantics. It closes the measurement audit
`MEASUREMENT-GAPS-2026-10-14.md` (authoritative) and reconciles the manifest
with the executable harness and the collection plan:

1. **Removed the old born-dead gate** from the production crypto model's
   issuance-path gates. The legacy pre-decision-extreme veto is superseded
   by the repaired waiting-interval veto (setup-history filter: pre-decision
   extremes are features, never stop-outs; checkWaitingInterval grades the
   genuine [decisionAt, entryObservedAt] interval).
2. **Removed the "continue collecting until N" criteria** — the n>=30 gate
   and the INCONCLUSIVE clause directing further collection. Collection is
   window-based only (2026-10-14 → 2026-12-31); the readout happens
   regardless of N.
3. **Removed disagreement-as-bug wording** — direction disagreement >40% is
   an AUDIT TRIGGER (four-part audit, written finding), never proof of a
   bug, never a readout pause.
4. **Real parameter hashes** — the v2.0.0 challenger `parameter_hash`
   (`sha256:derived-from-production-minus-momentum-1.5`) was a placeholder;
   v2.1.0 records real SHA-256 of the parameter-defining files, the
   canonical factor-label mapping (incl. the
   `"Supply-overhang penalty"` / `"Supply-overhang penalty (negative-only)"`
   discrepancy and the `_canon_label()` resolution), and explicitly states
   that no standalone parameter file exists for either crypto model.
5. **Encoded the audit's primary economic comparison** — genuine abstention
   = 0.000 R real zero; never-evaluated = UNKNOWN (counted, labeled,
   excluded); both-issued-only is the secondary sensitivity check.
6. **Encoded the cohort reporting split** (Cohort P crypto paired vs Cohort E
   equity-only, never pooled) and **the equity horizon rule** (signal date +
   47 calendar days).
7. **Recorded the UNRESOLVED conflict** between the collection plan's
   2027-01-30 outcome close and the frozen equity horizon (implied equity
   close 2027-02-16) — pending Logan's decision; not picked a side.

Carried forward unchanged from v2.0.0: actionable-entry-v1 contract,
waiting-interval veto, venue mapping, level construction, corrected
evaluator, and the four asserted harness rules (RULES 1–4).

## Drift notes (post-v2.0.0, recorded in v2.1.0)

After the v2.0.0 freeze (2026-10-14T04:09:32Z), three files changed on disk:
`harness.py` (the v2.0.0 asserted RULES 1–4 amendment, tests 80/80 green —
kept as the executable), `ts-spaces/altcoin-analyzer-and-signal-tracker/
server/src/actions.ts`, and `.../schema.ts`. v2.1.0 records the current
hashes; the 11 dossier factor lines in `actions.ts` still carry the frozen
labels/weights (verified programmatically). The entry-v1, veto, and
issuance-handler sources are unchanged since v2.0.0 (hashes match).

## Quarantine

Rows scored under v2.0.0 (`rows/comparison-rows-pilot-2026-10-14.csv`,
retrospective cohort `rows/cohort-retrospective-v2.csv`) are kept for audit
and retrospective accounting under v2.1.0's accounting rules. They are not
re-scored; the v2.1.0 prospective file (`rows/cohort-prospective-v2.csv`)
accepts ONLY rows decided after the v2.1.0 freeze timestamp, under its
executable rules, with PROSPECTIVE provenance.
