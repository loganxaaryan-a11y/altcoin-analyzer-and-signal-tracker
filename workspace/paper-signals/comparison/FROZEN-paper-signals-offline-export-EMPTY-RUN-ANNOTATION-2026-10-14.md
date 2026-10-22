# Frozen snapshot annotation — empty-run correction (2026-10-14)

**Snapshots are NOT edited.** This file is the correction/annotation record
for the two frozen offline evidence exports:

- `paper-signals-offline-export-v2.1.2.zip`
- `paper-signals-offline-export.zip`

(Both contain `paper-signals-offline-export/paper-signals/...` copies of the
workspace files listed below.) Frozen bytes are evidence and must not be
rewritten.

## What the snapshots say (incorrect)

`paper-signals-offline-export/paper-signals/comparison/BTC-ISSUANCE-RUNTIME-2026-10-14.md`:

1. Line 5: "(1) **a deployed abstention via `runpapersignalcycle` (run ID 2)**"
   — plus the daily-log quote "Deployed evidence so far is only clean abstention."
2. Section heading (line 73): "3. **Deployed abstention** — `runpapersignalcycle`
   run ID 2".
3. Line 76: "two deployed cycles completed with zero discovery candidates
   **and clean abstention**".
4. Summary (line 85): "The **deployed abstention** (`runpapersignalcycle`
   run ID 2) is genuinely deployed-artifact runtime".

`paper-signals-offline-export/paper-signals/comparison/LIVE-STREAM-WIRING-2026-10-14.md`:

5. Line 33: "runpapersignalcycle invocation (run 3, complete) likewise
   considered 0 candidates — **clean abstention**, nothing manufactured."

## Why it is wrong

Each deployed `runpapersignalcycle` run evaluated **zero candidates**
(`candidateCount: 0` on all three runs; per-run counts now on record in
`comparison/deployed-run-counts-2026-10-14.json`). An abstention requires a
candidate — the frozen harness rule defines a genuine abstention as "the arm
EVALUATED the issuance decision and declined". With zero candidates evaluated
there was nothing to abstain on. The correct description is:

> **Three completed runs, zero opportunities.**

(Not affected: line 69's "clean abstention via born-dead veto" refers to the
sandbox third-pilot-evidence item, which DID have a candidate — that usage is
genuine and stays. Likewise the zips' `implementation-spec`, `demo/*`,
`orchestrator/tests`, and `TERMINAL-RUNTIME-EVIDENCE` "clean abstention"
strings all concern sandbox/unit-test contexts WITH candidates.)

## What superseded it (live record)

The live working copies `comparison/BTC-ISSUANCE-RUNTIME-2026-10-14.md` and
`comparison/LIVE-STREAM-WIRING-2026-10-14.md` were corrected in place on
2026-10-14 (workstream 2): "deployed abstention" → "deployed
`runpapersignalcycle` completion with zero discovery candidates (run ID 2)";
the verbatim daily-log quote is retained with a bracketed correction note.
Anyone citing the snapshots' line-5/73/76/85 or line-33 wording must cite
this annotation alongside it.
