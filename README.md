# altcoin-analyzer-and-signal-tracker — snapshot 2026-10-22

Private save of the crypto research terminal as it stood on 2026-10-22, taken
before the display-only slim-down rebuild (planned from 2026-10-23). The live
system keeps running in Muse; this repo is the rollback point, not a deploy
source.

## What's here
- `client/`, `server/`, `drizzle/` (migrations through 0067), `space.json` —
  the terminal app source as deployed, including the 2026-10-22 monitoring
  health split (coverage/automation lines, 45-minute freshness gate,
  enrollment disclosure; build 2026-10-22T07:23:35Z).
- Root `*.md` / `*.txt` — the build and audit record that ships with the app.
- `workspace/` — the operating pipeline that feeds the terminal:
  `paper-signals/` (monitoring: monitor/settle/enroll, discovery, comparison +
  challenger R1, marketdata cache, freeze manifests v2.1.2–v2.1.5),
  `crons/` (current job definitions), `goal-files/` + `GOAL.md` (goal docs,
  incl. the slim-down map).

## State at snapshot
- Freeze **v2.1.5** (2026-10-21T08:21:22Z). Paper book: 13 entries, 6 settled,
  **+1.50R gross**, 7 open.
- **Entry hold ON**: `paper-issuance-cycle` disabled 2026-10-22 pending an
  unattended monitoring-recovery proof. The 2026-10-22 check passed
  monitoring, settlement, and cleanup; the enrollment step starved, so the
  hold stayed.
- PAPER only. No brokerage, no real orders, no leverage execution.

## Excluded on purpose
Live database (`app.db`), `node_modules`, build outputs, the app's `audits/`
and `research/` data dirs, and dated snapshot/cache archives (status dumps,
kline caches, offline-export zips) — those stay on the VM. No secrets in this
tree: API credentials live in the Muse vault, and the tree was scanned before
pushing.

Earlier combined export (2026-10-15): `loganxaaryan-a11y/research-terminal-source`.
The shared paper pipeline lives in this repo; the equity terminal's snapshot
(`loganxaaryan-a11y/equity-analyzer-and-signal-tracker`) references it.


## Export completion — 2026-10-22

Added after verification against the export checklist: `vendor/space-sdk-0.13.0.tgz`
(the `@hatch/space-sdk` tarball matching the `file:` dependency in package.json —
a bare clone can now `bun install`), `PORTABILITY.md` (platform dependencies and
what replaces them elsewhere), and `workspace/exports/theories-export.json`
(canonical theories export, read from the live terminal 2026-10-22; the earlier
export carried thesis-watch snapshots only). Migration chain load-verified
2026-10-22: 67/67 migrations apply cleanly to a scratch SQLite database.
Exports are point-in-time records; the live system remains the source of truth.
