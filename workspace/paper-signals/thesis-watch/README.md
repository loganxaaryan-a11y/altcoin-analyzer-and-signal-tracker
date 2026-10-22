# Thesis Watch

Twice-daily monitoring of terminal theories (agent theses with falsifiable predictions) on
`altcoin-analyzer-and-signal-tracker` (crypto) and `equity-analyzer-and-signal-tracker` (equity).
Approved by Logan 2026-10-15. Runs 08:00 + 20:00 ET. Monitoring only: no frozen-rule changes,
no paper-pipeline changes, no theory writes.

## Files

- `theory-state.json` — last known status per theory per terminal: status (confirming/challenged),
  predictions (ticker, direction, targetLevel, dueDate, stance, tripwire_state), baseline prices,
  evidence inventory for confirming theories. Baseline recorded 2026-10-15T06:40:18Z, SILENT —
  pre-existing states never alert; only transitions after that timestamp do.
- `alert-ledger.json` — book of record for chat alerts. Dedup key:
  `<terminal-slug>/<theory_id>/<transition>` where transition ∈
  `status:challenged→confirming`, `status:confirming→challenged`, `tripwire:<pred>:hit`,
  `invalidated:<pred>`, `expired:<pred>`, `new-challenging-evidence`.
  Pre-commit ordering: ledger entry (`awaiting-ack`) is written BEFORE the alert text is composed —
  same mechanism as the paper-signal delivery worker. Delivered keys never re-alert.
- `learning-ledger.jsonl` — append-only, one JSON object per resolved prediction: raw performance,
  beta-adjusted performance (vs BTC crypto / vs SPY equity, beta assumed 1 and labeled), regime tag
  (`risk-off` when breadth collapses, else `normal`), bounce-vs-fakeout classification when a broken
  level is reclaimed. Never edit prior lines.
- `worker-runs/` — run logs + raw listtheories/getmarketread snapshots (keep last 20).

## Alert triggers (only these)

1. Theory status flip: confirming ↔ challenged.
2. Tripwire break: price hits a prediction's targetLevel in the predicted direction.
3. Invalidation: terminal reports invalidated, or dueDate passes with the level unhit (expired unresolved).
4. New contradicting evidence: a new "challenging"-stance evidence item on a "confirming" thesis.

Alert format (short, to research side chat `a685c3e7-c8be-4137-8900-4e899008bca7`):
thesis name (id), what flipped, tripwire price vs current price, dedup trailer. Nothing else.
Quiet otherwise — no chat output when nothing transitioned.

## Schedules

- `thesis-watcher-morning` — daily 08:00 America/Toronto
- `thesis-watcher-evening` — daily 20:00 America/Toronto
