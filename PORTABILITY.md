# Portability — Muse / platform dependencies

What in this system depends on Muse (Meta's agent platform), and what replaces
each dependency if the system is rebuilt or hosted elsewhere. Written
2026-10-22 as part of the export verification for the terminal simplification.

## Platform dependencies

1. **The artifact host (`@hatch/space-sdk`, vendored in `vendor/`)**
   Hosts the web app, its database, the action API, scheduled space actions
   (e.g. the crypto paper-issuance cycle), and the privileged subprocess
   bridge that lets the terminal read workspace files (paper-signals store,
   market-data cache) directly from disk.
   *Replacement elsewhere:* any conventional web host + database. The
   privileged file reader becomes ordinary server-side file reads; scheduled
   space actions become cron/systemd jobs calling the same code paths.

2. **The Muse cron scheduler (agent jobs)**
   Job definitions under `workspace/crons/` are natural-language instructions
   executed by an AI agent on a schedule — every run is an agent launch.
   They are documentation of intent as much as configuration.
   *Replacement elsewhere:* systemd timers / cron running the plain scripts
   (this is the direction of the 2026-10-22 simplification: execution moves
   to `engine/` scripts; only judgment work — synthesis, digests — stays
   agent-shaped, and any LLM API can do it).

3. **Connector credentials (Elfa, Nansen, altFINS, Alchemy, FluxRPC, etc.)**
   Held in Muse's secure vault and referenced by capability name inside
   `server/src/privileged.ts`. No credential values exist in this repository
   (verified by scan, 2026-10-22).
   *Replacement elsewhere:* environment variables or a secrets manager,
   keeping the same capability names.

4. **Agent labor**
   Discovery synthesis, theory writing/testing, and the editorial digests
   were produced by the agent following the prompts in `workspace/crons/`
   and the goal files.
   *Replacement elsewhere:* any LLM API, or a human process, following the
   same written instructions.

## What is NOT exportable (by design or by nature)

- **Live database contents beyond the data exports.** The running app's
  database stays with the platform. Canonical records are exported as data:
  crypto — `workspace/paper-signals/` (positions, outcomes ledger, frozen
  contracts) plus `workspace/exports/theories-export.json`; equity —
  `workspace/exports/paper-book-export.json`. Schemas and full migration
  chains are in `drizzle/` (verified 2026-10-22: crypto 67/67 migrations,
  equity 52/52, applied cleanly to a scratch SQLite database).
- **Scheduler runtime state** (run receipts, watermarks inside the Muse
  runtime). Job *definitions* are exported; their execution history is not
  meaningful outside the platform.
- **Vault credentials** — never exported, anywhere, by design.
- **Chat history and agent memory** — the working record lives with Logan's
  Muse account; the durable facts are in `GOAL.md`, `workspace/goal-files/`,
  and this repository's docs.

## Rebuild quick-start

1. `bun install` (the vendored `@hatch/space-sdk` tarball is in `vendor/`,
   matching the `file:` dependency in `package.json`).
2. Apply `drizzle/*.sql` in filename order to a fresh SQLite database.
3. Load the canonical data exports listed above.
4. Provide credentials for the data providers under the capability names
   used in `server/src/privileged.ts`.
