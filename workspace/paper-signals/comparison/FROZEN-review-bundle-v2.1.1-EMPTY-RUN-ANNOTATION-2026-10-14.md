# Frozen bundle annotation — empty-run correction (2026-10-14)

**Bundle is NOT edited.** This file is the correction/annotation record for
`review-bundle-v2.1.1-2026-10-14/` (directory + `review-bundle-v2.1.1-2026-10-14.zip`),
frozen 2026-10-14 ~05:11 UTC under comparison freeze **v2.1.1**. Frozen bytes
are evidence and must not be rewritten.

## What the bundle says (incorrect)

`review-bundle-v2.1.1-2026-10-14/plan/BTC-ISSUANCE-RUNTIME-2026-10-14.md`:

1. Line 5: "(1) **a deployed abstention via `runpapersignalcycle` (run ID 2)**
   on the live altcoin terminal artifact" — and quotes the daily log:
   "Deployed evidence so far is only clean abstention."
2. Line 76: "two deployed cycles completed with zero discovery candidates
   **and clean abstention**".
3. Section heading: "3. **Deployed abstention** — `runpapersignalcycle` run ID 2".
4. Summary: "The **deployed abstention** (`runpapersignalcycle` run ID 2) is
   genuinely deployed-artifact runtime".

## Why it is wrong

Each deployed `runpapersignalcycle` run evaluated **zero candidates**
(`candidateCount: 0` on all three runs, per-run counts on record in
`comparison/deployed-run-counts-2026-10-14.json`). An abstention requires a
candidate: the harness rule (frozen in the manifests) defines a genuine
abstention as "the arm EVALUATED the issuance decision and declined". With
zero candidates evaluated there was nothing to evaluate, suppress, or
abstain on. The correct description is:

> **Three completed runs, zero opportunities.**

(Not affected: line 69's "clean abstention via born-dead veto" refers to the
sandbox third-pilot-evidence item, which DID have a candidate — that usage is
genuine and stays.)

## What superseded it (live record)

The live working copy `comparison/BTC-ISSUANCE-RUNTIME-2026-10-14.md` has
been corrected in place on 2026-10-14 (workstream 2): "deployed abstention"
→ "deployed `runpapersignalcycle` completion with zero discovery candidates
(run ID 2)"; the verbatim daily-log quote is retained with a bracketed
correction note. Anyone citing the bundle's line-5/76/heading/summary
wording must cite this annotation alongside it.
