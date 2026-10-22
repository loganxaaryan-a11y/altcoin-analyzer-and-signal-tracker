# Manifest note — collect_pilot_rows.py vs freeze-manifest-v2.1.5 (2026-10-21)

## The mismatch

- `freeze-manifest-v2.1.5.json` (frozen 2026-10-14T06:11:01.175Z) pins
  `collect_pilot_rows.py` at sha256
  `af2cba2d4c180d6498ec39f40a1255b022017d57439027902eac269305123b0b`.
- The live file at `paper-signals/comparison/collect_pilot_rows.py` hashes
  `cbcde4332146b5c59699efa4c553a80dc02d1f305ee60f6e8365e64bf23b7f48`
  (mtime 2026-10-15 00:57 local) — it differs from the pin.

**The manifest is preserved exactly as-is.** This note is the resolution
record; nothing was overwritten, and no frozen decision or written cohort
row was touched.

## Which side drifted — the evidence

- Every frozen copy of the collector hashes to the pinned value:
  `review-bundle-v2.1.5/02-sources/collect_pilot_rows.py`,
  `review-bundle-v2.1.5/verify/collect_pilot_rows.py`, and
  `review-bundle-v2.1.5/closeout-2026-10-14/collect_pilot_rows.py` all hash
  `af2cba2d…`. The manifest pin was correct at freeze time.
- The live file and two working checkouts (`pr3-work/`,
  `paper-signals/stabilization-work/`) all hash `cbcde433…`. The live file
  changed after the freeze.

## What changed in the file

A diff of the pinned copy against the live file shows exactly one change:
an additive, flag-gated `--dossier-capture` mode (a docstring section, one
branch in `run_collection`, and the argv flag — 49 diff lines, no other
differences). In dossier mode the collector writes captured decision-time
inputs to `decision-time-inputs/` and `wired-trial-evidence/` instead of
the vessel. The default path (no flag) is behavior-identical to the pinned
version. The change's provenance is documented in
`AUTOMATIC-MODEL-CAPTURE-2026-10-14.md` (the intended-models wiring,
2026-10-14): a deliberate feature addition that was never carried into a
new manifest — an unmanifested additive change, not corruption and not a
manifest error.

## Relevance to the Challenger-R1 experiment (the question that matters)

- The collection cron (`paper-signal-comparison-collection`) never passes
  `--dossier-capture`; the flag-gated branch never runs in collection.
- The collector is **not a registered input** to Challenger-R1 v1 or v2.
  Both challenger scorers read only the live paper status pull
  (`getpaperpilotstatus` response) — challenger inputs never pass through
  the collector at all.
- The collector's product, the prospective cohort vessel
  (`rows/cohort-prospective-v2.csv`, 334 rows, all freeze_version 2.1.5),
  is produced by the behavior-identical default path. No registered input
  to the experiment changed.

## Verdict

The mismatch is a provenance gap in the harness's own manifest hygiene —
a deliberate additive change that was never manifested — with **no effect
on any Challenger-R1 input or on the cohort vessel's content**. Under the
2026-10-21 addendum (preserve the prior manifest as-is; document
input-version changes as authorized changes with provenance, never silent
overwrites), the correct action is this note, not a manifest edit. If a
future freeze re-pins the collector, it should pin `cbcde433…` with this
note cited as the provenance of the change.

— Coordinator Z13, 2026-10-21, for Challenger-R1 registration
challenger-r1-v2 (frozen 2026-10-21T07:08:55Z).
