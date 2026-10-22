# Signal explainer alerts

Logan-approved (safe-list item 10). When a discovery scan generates new signals
(crypto or equity), Logan gets a HUMAN explanation in the research side chat —
not the terse PAPER schema format.

## What it is

An additive, read-only interpretation layer. It never issues, suppresses,
vetoes, re-scores, or otherwise touches signals; it never changes strategy, the
paper pipeline, frozen methodology, holdouts, or any in-flight expert repair.
It reads the trackers and explains, once per signal.

## Paths

- Ledger (book of record): `explained.json` — keyed `<terminal>:<signal_id>`
  (`crypto:39`, `equity:12`, ...). The terminal prefix is part of the key
  because crypto and equity signal ids live in separate namespaces and could
  collide. Each signal is explained exactly once.
- Run logs: `runs/run-<UTC-ts>.json` (keep last 20).
- Cron job id: `signal-explainer` — interval every 4h, delivers to the research
  side chat `a685c3e7-c8be-4137-8900-4e899008bca7`. Definition is owned by the
  scheduler (`cron.view signal-explainer`); the file under
  `crons/hourly/signal-explainer__interval@4h.md` is a read-only copy.
- X-sweep caller file (contradictions input): `~/workspace/x-sweep/v2/calls.md`.
- Quality bands (quality-read input): newest
  `~/workspace/goals/research-terminal/hidden_files/signal-accuracy/signal-accuracy-YYYY-MM-DD.md`.

## Worker contract (each run)

1. Read the ledger; note `last_check_utc` and existing keys.
2. Invoke `getsignaltracker` on BOTH artifacts
   (`altcoin-analyzer-and-signal-tracker`, `equity-analyzer-and-signal-tracker`);
   paginate until all rows are collected. Invoke `getmarketread` on both for
   regime context. Action failure → log in the run log, stay silent (never
   fabricate rows).
3. New = rows with `createdAt` (fallback `signalDate`) strictly after
   `last_check_utc` AND no ledger key. Replay/fixture-marked rows are explained
   once like any other row, with the marker named in the explanation.
4. For each new signal: gather contradictions (agreement score vs dossier
   confidence; last-7d X-sweep calls leaning the other way; live opposing
   theories via `listtheories`; internal factor tension; the row's own
   reliability kill flag) and compose the human explanation:
   WHAT / WHY (top 3–4 factors by |contribution|, in words) / REGIME /
   CONTRADICTIONS / QUALITY READ (honest calibration — band hit rate, sample
   size, kill flag; never inflated; small samples called small).
5. PRE-COMMIT the ledger FIRST (all due keys + advance `last_check_utc`),
   then write the run log, then emit the rendered explanations as the run's
   final output (the runtime posts it to the side chat). If killed between
   pre-commit and emit, the next run skips the keys — an explanation is lost,
   never duplicated.
6. No new signals and nothing to surface → stay silent.

## Bootstrap rule (2026-10-15 first pass)

The ledger started empty, so the first pass used a bounded backfill instead of
"since last check": it explained rows **created in the last 48h only**
(cutoff 2026-10-13T06:38Z), to avoid spamming ancient history. That picked up
crypto ids 39 (S long) and 40 (HYPE short); no equity rows qualified (the 10-14
grading reported zero equity issuance, latestBrief: 0 issued under
equity-eval-3.2.0). Both rows carry the 2026-10-14 replay reclassification —
explained once, marker named. Every later run uses the ledger's
`last_check_utc` watermark; the 48h rule never applies again.
