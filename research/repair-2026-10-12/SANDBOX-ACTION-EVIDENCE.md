# Sandbox action evidence — Muse reviewer rerun

Date: 2026-10-12
Scope: isolated builder copy of the artifact database. These writes are discarded after submit and are not production/deployed evidence.

## Starting state

Action:

```text
artifact.invoke_action slug=altcoin-analyzer-and-signal-tracker action=getmeasurementrun args={}
```

Observed result:

- Run ID: `crypto-daily-2026-10-12T17-55-11-615Z`
- Status: `partial`
- Cursor: `2/28`
- Retrieved/accounted: `28/28`
- Equation: `28 in scope = 0 evaluated + 26 pending/unresolved + 2 failed + 0 excluded`
- Balanced: `true`
- Trade state: 2 open, 0 settled, 26 unknown
- Failed grading IDs: legacy_36, legacy_37
- Each failed grading row remained trade state `open`, with an independent grading reason and trade-state reason.

## Same-run resume

Action:

```text
artifact.invoke_action slug=altcoin-analyzer-and-signal-tracker action=rundailysignalpostmortem args={"runId":"crypto-daily-2026-10-12T17-55-11-615Z","batchSize":2}
```

Observed result:

- Same run ID preserved: `crypto-daily-2026-10-12T17-55-11-615Z`
- Cursor: `2 -> 4/28`
- Status: `partial`
- Retrieved/accounted: `28/28`
- Equation: `28 in scope = 0 evaluated + 24 pending/unresolved + 4 failed + 0 excluded`
- Balanced: `true`
- Trade state: 4 open, 0 settled, 24 unknown
- New failed grading IDs and correctly attributed reasons:
  - legacy_34 / STRK: `STRK: Daily OHLC path missing for STRK #34; grading remains failed or unverified while trade state is reported independently.`
  - legacy_35 / BTC: `BTC: Daily OHLC path missing for BTC #35; grading remains failed or unverified while trade state is reported independently.`
- Existing failures legacy_36 and legacy_37 remained present. No item disappeared.
- The returned summary explicitly separated trade state from grading: `Grading state is separate and appears in the reconciliation.`
- Retry pending remained true.

## UI probe

Commands (exit 0 unless noted):

```text
bun /opt/hatch/skills/spaces/ts-runtime/dist/probe-ui.js observe --socket /home/hatch/workspace/ts-spaces/altcoin-analyzer-and-signal-tracker/.harness/probe-ui/sock --find Measurement
bun /opt/hatch/skills/spaces/ts-runtime/dist/probe-ui.js act --socket /home/hatch/workspace/ts-spaces/altcoin-analyzer-and-signal-tracker/.harness/probe-ui/sock --node 10 --click
```

The Measurement view showed:

- `PARTIAL`
- same run ID
- cursor `4/28`
- `28 / 28` in scope/retrieved
- `0` evaluated
- `24` pending/unresolved
- `4 / 0` failed/excluded
- trade state `4` open, `0` settled
- `28 in scope = 0 evaluated + 24 pending/unresolved + 4 failed + 0 excluded · BALANCED`
- retry-pending notice for four failed records
- `Resume same run` control

Captured frame: `audits/2026-10-12T17-56-41Z-848897787/act-001.png` (SHA-256 `8a49652be8e51bd5214a839cb2cd6c9cb8e91a30f2a83daec4596b0a77c37f14`).

## Restart/idempotency proof

The deterministic unit test uses the exported recovery helpers and simulates a worker stop after item writes but before cursor commit. The repeated selection returns the same IDs under the same run ID. Upsert-key uniqueness and the stable evidence fingerprint prevent duplicates and history rewrites. See `measurement-recovery-test.log` and `server/src/measurement-recovery.test.ts`.

## Attribution

This is a Muse-reviewer rerun, not independent expert verification and not deployed operational evidence.
