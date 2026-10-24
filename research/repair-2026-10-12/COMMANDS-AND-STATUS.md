# Commands and exit status

Date: 2026-10-12

## Native regression test

```bash
set -o pipefail; bun test server/src/measurement-recovery.test.ts 2>&1 | tee research/repair-2026-10-12/measurement-recovery-test.log; code=${PIPESTATUS[0]}; printf '\nEXIT_CODE=%s\n' "$code" | tee -a research/repair-2026-10-12/measurement-recovery-test.log; exit "$code"
```

Exit code: 0. Complete output: `measurement-recovery-test.log`.

## Typecheck

```bash
set -o pipefail; bun run typecheck 2>&1 | tee research/repair-2026-10-12/typecheck.log; code=${PIPESTATUS[0]}; printf '\nEXIT_CODE=%s\n' "$code" | tee -a research/repair-2026-10-12/typecheck.log; exit "$code"
```

Exit code: see the final line of `typecheck.log`.

## Build and audit

The artifact was built and audited through the managed web-artifact builder interface, not `bun run build`.

- Latest successful build before the acceptance audit: 2026-10-12T17:56:24Z.
- Audit directory: `audits/2026-10-12T17-56-41Z-848897787/`.
- Audit verdict: pass.
- `fix_before_attesting`: empty.
- Page delivery: HTTP 200; no console errors; no broken local assets; 390px page-level overflow: 0px.
- One 401px internal scroller inside a 390px box was advisory, not page-level overflow.
- External Google Fonts were refused by the audit egress lockdown as expected.

## Action and UI probe commands

See `SANDBOX-ACTION-EVIDENCE.md`. The action calls were executed with the platform's `artifact.invoke_action`; the UI was driven with the audit probe CLI.

## Verification attribution

All entries here are builder or Muse-reviewer evidence. The expert has not independently rerun this repair package.
