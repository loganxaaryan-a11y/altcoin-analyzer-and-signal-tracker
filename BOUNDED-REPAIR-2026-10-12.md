# Bounded atomic-fencing repair and evidence

Date: 2026-10-12

This supplement records only the current bounded crypto repair. It does **not** claim deployed scheduler operation, production measurement cycles, predictive edge, H_NO_DATA/W_NO_DATA provenance, responsive/keyboard captures, holdout promotion, or successful live-provider diagnostics.

## Raw-Date lease regression retained

`computeDailySignalSnapshots` compares the `timestamp_ms` lease column to epoch milliseconds. The frozen evaluation cutoff and evaluation semantics are unchanged.

`server/src/measurement-action.integration.test.ts` invokes the real exported `Actions.runDailySignalPostmortem.handler` against isolated Bun SQLite databases populated by every production migration. The frozen missing-source fixture proves lease claim reaches a durable partial checkpoint without binding a JavaScript `Date` into raw SQL.

## Atomic lease fencing

Renewal is no longer treated as authorization for a later write. Every protected statement carries an `EXISTS` or `WHERE` predicate on the current `(run_id, lease_token, unexpired lease)` in the **same SQL statement** that mutates data. The post-renewal test seam now pauses after a successful renewal and before that conditional statement.

Protected paths include:

- evaluation-cutoff initialization and membership ordinal edits;
- missing-source and evaluated run-item insert/conflict-update branches;
- discovery outcomes;
- append-only evaluation revisions and outcome events;
- interim snapshot and daily brief insert/conflict-update branches;
- final cursor/checkpoint commit.

Lease renewal itself requires the current lease to remain unexpired. The checkpoint still compares the token and unexpired lease before clearing ownership. No scoring, indicator, issuance-gate, horizon, holdout, or original issued decision was changed.

## Reproduced takeover and replay coverage

The actual-handler suite includes both missing-source and valid-source races:

1. Worker A renews successfully, then pauses immediately before the protected SQL statement.
2. The injected clock advances eleven minutes.
3. Worker B acquires the same run and writes/completes it.
4. Worker A resumes and its conditional mutation applies zero rows.

The valid-source fixture reaches real revision, outcome-event, interim-snapshot, daily-brief, and run-item code. After Worker B finishes, the test snapshots run items plus all accepted hashes/payload identities; resuming Worker A changes none of them.

A second actual-handler fixture interrupts after accepted revision/item writes but before cursor commit. Replay starts from cursor zero, reuses the frozen evaluation cutoff, preserves accepted revision/event hashes, avoids duplicate accepted rows, and completes the cursor exactly once. Evaluation timestamps are now derived from the frozen run cutoff rather than replay wall-clock time, removing a newly exposed source of hash drift.

## Shared history-cache policy

The shared history cache is not accepted measurement evidence and does not inherit the run lease:

- `historical_daily_bars` is uniquely keyed by `(coin_id, day)` and `historical_metrics` by `(coin_id, metric, ts)`;
- inserts are immutable (`ON CONFLICT DO NOTHING`), so a late fetch cannot rewrite owned cache bytes;
- cache-state metadata is monotonic by **refresh start time**; a late older response cannot replace a newer state row;
- accepted evaluation revisions copy their exact source rows into the immutable revision evidence payload and are fenced separately;
- the required post-provider lease renewal prevents a worker that lost ownership during provider I/O from creating accepted revisions, events, snapshots, briefs, items, or a cursor commit.

A late cache fill may improve a later run's input coverage, but it cannot rewrite an already accepted evaluation. This is the declared independently idempotent/versioned cache policy.

## Portable checkout

The managed SDK tarball remains vendored at `vendor/space-sdk-0.13.0.tgz`; `package.json` uses the relative `file:vendor/space-sdk-0.13.0.tgz` dependency. The compile-time privileged module remains included at `server/.generated/privileged.contract.ts`, and `server/tsconfig.json` maps `@space/privileged` to that file.

Clean-checkout commands:

```bash
bun install --frozen-lockfile
bun x tsc --noEmit -p client/tsconfig.json
bun x tsc --noEmit -p server/tsconfig.json
bun test server/src/*.test.ts
bash scripts/package-integrity-closeout.sh /tmp/crypto-atomic-fencing-repair-2026-10-12.zip
sha256sum /tmp/crypto-atomic-fencing-repair-2026-10-12.zip
```

The SDK tarball SHA-256 in this checkout is `031b34f98766aedde11e799911dbe53865265bcd66dd94f9be67731e60a9e67b`.

## Acceptance table

| Requirement | Changed source | Verification command / run ID | Observed result | Remaining limitation |
|---|---|---|---|---|
| Raw-Date binding remains fixed | `server/src/actions.ts`; `server/src/measurement-action.integration.test.ts` | `bun test server/src/measurement-action.integration.test.ts` | Actual handler claims and checkpoints with production migrations | Offline isolated DB only |
| Atomic check-and-write after renewal | `server/src/actions.ts` | `valid-source late worker…` and `expired worker…` actual-handler cases | Resumed A applies zero protected writes; item attempt remains winner-owned | Does not prove deployed scheduler execution |
| Valid-source revision/event/snapshot coverage | `server/src/measurement-action.integration.test.ts` | `valid-source late worker…` | Real paths reached; B's items/hashes/events/snapshots/brief remain byte-for-byte unchanged after A resumes | Injected provider data, not live provider |
| Crash/replay after accepted writes | `server/src/actions.ts`; `server/src/measurement-action.integration.test.ts` | `actual-handler replay…` | Cursor 0 recovers to complete once; accepted hashes unchanged; no duplicate accepted rows | Offline fixture only |
| Shared history-cache policy | `server/src/actions.ts` | Full server typecheck + production-migration action suite | Immutable keyed rows, monotonic state metadata, accepted evidence copied/fenced | Live cache contention not observed in production |
| Strategy/holdout immutability | No strategy files changed | Source diff + full suite | Gates, weights, horizons, holdouts, original decisions untouched | Predictive quality remains unproven |
| Portable package | `package.json`, lockfile, vendored SDK, generated privileged contract, package script | Package integrity script and clean extraction commands | Pending final archive/hash in this build | Deployment portability is a managed-runtime concern |
| Build and UI smoke evidence | No client behavior change | Builder build/audit IDs | Pending builder build and fresh audit | A UI audit cannot prove production scheduler recovery |

## Still pending

- Production scheduler access, enabled-state evidence, real invoked action IDs, and consecutive deployed cycles.
- Originating H_NO_DATA/W_NO_DATA records or payloads.
- 320/375/768 and keyboard captures beyond the builder's standard desktop/phone audit.
- Live-provider contention/recovery evidence.
- Independent expert rerun of the final archive.
- Any claim of improved predictive performance or promotion.
