# Measurement-integrity closeout — offline repair

Date: 2026-10-12

This checkout repairs the six bounded measurement-integrity findings. It does not alter strategy weights, unlock holdouts, rewrite immutable issued contracts/raw snapshots, promote a strategy, or establish predictive edge. Production scheduler execution, deployed interruption/recovery, and consecutive live cycles remain an operational gate.

## Finding → source → regression

| Finding | Before counterexample | Repair source | Regression / evidence | After |
|---|---|---|---|---|
| 1. Settlement authority | A later high of 120 settled an Oct. 1 long despite the required Oct. 2 candle being absent. Legacy non-null outcomes could also appear complete. | `server/src/actions.ts` accepted-revision read model; `server/src/signal-methodology.ts` | `signal-methodology.test.ts`: missing initial/middle/tail, future/forming, expiry-straddling, pre-entry and ambiguous paths | Only a current accepted `trade_setup` revision for the immutable contract, evaluator version, product, and contract horizon can settle. Monitoring marks and legacy outcomes are non-authoritative. |
| 2. Grading semantics | Age and nonempty bars could label an unresolved evaluation evaluated. Each resumed batch used a later wall clock. | `server/src/actions.ts`; `server/src/schema.ts`; `drizzle/0039_harden_measurement_run_integrity.sql` | Evaluator boundary suite plus Measurement read model | `evaluated` means every due product/horizon is resolved. Pending/not-due, ambiguous, unverified, provider failure, and exclusion stay distinct. One persisted `evaluation_cutoff_at` is reused. |
| 3. Membership identity | Two rows for one ID could balance a two-ID scope; a frozen ID outside a rolling read window could be skipped. | `server/src/measurement-recovery.ts`; explicit selected-ID fetch in `server/src/actions.ts`; ordinal constraint in migration 0039 | `measurement-recovery.test.ts`; `measurement-database.integration.test.ts` | Reconciliation uses the original ID+ordinal set and reports missing, unexpected, duplicate, and ordinal violations. Missing selected source rows become failures and hold the cursor. |
| 4. Restart proof | Arrays/Sets and hardcoded zero telemetry did not exercise persistent interruption. | Durable checkpoint/lease CAS in `server/src/actions.ts`; DB constraints; idempotent revision insert now reports whether the current call inserted | `measurement-database.integration.test.ts` | In-memory SQLite integration exercises duplicate constraints, unknown ID, two competing claims, stale cursor, writes-before-cursor interruption, fresh-context retry, missing member, provider failure/exclusion states, and rolling-window loss. Counts/hashes are read before and after, not hardcoded. Deployed worker-kill proof remains pending. |
| 5. Standalone checkout | Prior ZIP omitted eight relative modules. | Full source checkout plus `scripts/package-integrity-closeout.sh` | `verification/2026-10-12/SHA256SUMS`, `FILE-LENGTHS.tsv`, `COMMANDS.log` | Package is assembled from this checkout only; all eight required modules, runtime/test source, migrations, manifests and lockfile are included. No files are borrowed from another archive. |
| 6. Malformed factor structure | `'[{}]'` became an invented `Factor1` with zero values and could qualify as evidence. | `adaptFactorLedger` in `server/src/actions.ts` | `factor-ledger-compat.test.ts` | Optional `note: null` remains readable. Missing required label/reading/source/score/weight/contribution makes the row inspection-only; no factor is invented and eligibility remains false. |

## Accepted evaluator → grading → trade state traces

| Evidence condition | Accepted evaluator result | Grading state | Trade state |
|---|---|---|---|
| Missing initial candle before a later barrier touch | `unverified` | `unverified` | open |
| Missing middle candle (Oct. 2 fixture) before later high 120 | `unverified` | `unverified` | open |
| Missing tail before exact expiry | `unverified` | `unverified` | open |
| Candle still forming / ending after frozen cutoff | not consumed; unresolved evidence | pending or unverified according to due state | open |
| Candle straddles expiry and cannot prove pre-expiry order | `unverified` | `unverified` | open |
| Entry-straddling or double-touch order is unknowable | `ambiguous` | `ambiguous` | open |
| Provider/history transport failure | no accepted resolved revision | `failed`, retry pending | unchanged/open when no prior accepted terminal revision exists |
| Complete required intervals with a contract-defined target/stop/time expiry | `resolved` | `evaluated` when every due product/horizon is resolved | settled only from terminal `trade_setup` revision |

The boundary cases above are asserted in `server/src/signal-methodology.test.ts`. State separation is applied in `computeDailySignalSnapshots` and displayed in Measurement. A monitoring quote can update the open-trade observation without becoming settlement evidence.

## Read-model arithmetic

`reconcileMeasurement` anchors its denominator to `snapshot_json` membership, not current item-row length:

`original frozen IDs = evaluated + pending/unresolved + failed + excluded`

A run can be `complete` only when:

1. exact IDs and ordinals reconcile with no missing/unexpected/duplicate/ordinal errors;
2. row counts equal the original frozen count;
3. the cursor reached the original frozen count;
4. no failed/retry-pending IDs remain.

Balanced current rows alone are not completion. The Measurement UI shows frozen count, retrieved count, frozen cutoff, due count, identity defects, cursor, and a separate trade-open/grading-failed case when present.

## Measured recovery evidence

`measurement-database.integration.test.ts` uses a fresh SQLite database and real uniqueness/CAS statements. The interrupted-write test records item identity/evidence/history hashes and revision multiplicity, repeats the batch from durable cursor 0 in a fresh logical worker context, then compares the persisted rows. The measured result is unchanged hashes and unchanged revision count; the cursor advances once. Concurrent claims measure one returned lease row and one rejected claim. A stale cursor commit returns no row.

These are sandbox integration results, not production proof. Complete command output and exit codes are in the verification directory and package.

## Operational items still pending

- Enabled artifact-owned 06:00 America/New_York scheduler evidence; the observed schedules were disabled.
- Consecutive successful production measurement cycles.
- Controlled deployed provider outage and recovery.
- Forced deployed worker/process interruption after writes and before cursor commit.
- Production-provider source/accounting for the originating H_NO_DATA/W_NO_DATA crypto payload; it is not present in this checkout.
- Expert rerun/acceptance of this repaired checkout.

No sandbox fixture is presented as production evidence. The no-promotion decision remains intact.
