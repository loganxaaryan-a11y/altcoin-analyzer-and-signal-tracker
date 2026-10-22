# Deployed Runtime Integration Gap — 2026-10-14

Question: does the DEPLOYED runtime of `altcoin-analyzer-and-signal-tracker` /
`equity-analyzer-and-signal-tracker` (the hosted artifacts, not the VM) contain
(a) the repaired discovery→paper handoff and (b) the v2.1.9 entry handler?

## Verdict

- (a) Repaired discovery→paper handoff (`paper-signals/handoff/src/qualify.ts`): **NOT-PRESENT**
- (b) v2.1.9 entry handler (`paper-signals/orchestrator/src/issuance/handler.ts`,
  `ISSUANCE_HANDLER_VERSION = "2.1.9"`): **NOT-PRESENT**

## Evidence (all from the deployed runtime or deployed records — no VM runs)

1. **Deployed `getpaperpilotstatus` payload, captured 2026-10-14T17:52:18Z**
   (saved by the alert-delivery worker at
   `pilot/delivery/worker-runs/status-2026-10-14T17-52-18Z.json` — hours AFTER
   both workspace repairs were written):
   - `freeze.version = "paper-pilot-v2.1.0"`, `freeze.hash = "a7d354a4..."`,
     `frozenAt = "2026-10-14T04:54:12Z"`.
   - No issuance-handler version field; no "2.1.9" anywhere in the payload.

2. **Deployed `runpapersignalcycle` executions 1–6** (same payload): runs 4, 5, 6
   executed at 08:32, 09:09 and 15:09 UTC today — i.e. AFTER the workspace
   handoff repair (06:47 UTC) and the v2.1.9 handler (09:26 UTC) were written —
   all report `freezeVersion: "paper-pilot-v2.1.0"` with the same freezeHash.
   A deployed run cannot report v2.1.0 while executing v2.1.9 code.

3. **Space inspection of the deployed artifact (2026-10-14 04:55:06 UTC,
   `~/workspace/space-inspections/35f04a58-0fed-4939-a77b-a6e6478e3f77/`)**:
   the deployed source tree (83 files, fingerprint `8d5bc696...`) contains NO
   `handoff/` directory and NO `orchestrator/src/issuance/handler.ts`. The
   paper handler is `runExplicitPaperCycle` in `server/src/actions.ts` with
   deployed constants `PAPER_FREEZE_VERSION='paper-pilot-v2.1.0'`,
   `PAPER_ENTRY_CONTRACT_VERSION='actionable-entry-v1'`, 15-minute entry
   window, 5-minute max observation age. The deployed handler "implements the
   repaired paper pipeline" in the *earlier* (2026-10-13, v2.1.0) sense —
   pending contracts, waiting-interval veto, segregated paper tables — not the
   current workspace repair.

4. **Build timeline (all UTC, 2026-10-14)**:
   - `altcoin-analyzer-and-signal-tracker` build `c9bb1cad-...` updated
     04:53:55 (matches `frozenAt` 04:54:12).
   - `handoff/src/qualify.ts` (repaired handoff) written 06:47:16 — AFTER.
   - `orchestrator/src/issuance/handler.ts` (v2.1.9) written 09:26:36 — AFTER.
   - No redeploy since: `spaces.spaces.updated_at` still 04:53:55, latest
     inspection of the slug is 04:55:06, and the memory log records only the
     ~05:00 UTC addition of the two paper actions (no subsequent build).

5. **Workspace v2.1.9 code itself defines the delta**: `handler.ts` documents
   that pre-v2.1.9 code used a synthesized `trade:${venue}:${ts}:${price}`
   stand-in and lacked the verbatim feed→checkpoint→contract→alert evidence
   chain, venue-sequence tiebreak, first-print fidelity (v2.1.7) and
   history-coverage proof (v2.1.8). Deployed v2.1.0 code is definitionally not
   that handler.

6. **Equity artifact** (`equity-analyzer-and-signal-tracker`, build `1da0f745-...`,
   updated 2026-10-13 07:43 UTC): no `runpapersignalcycle` / `getpaperpilotstatus`
   actions exist per all records; the paper program is crypto-terminal-only.
   Both (a) and (b) are NOT-PRESENT there as well (no paper lane at all).

Note on tooling: no artifact-inspect/invoke tool is available to this agent;
the deployed evidence above comes from (i) the raw deployed action output
persisted by the alert-delivery worker, (ii) deployed run records inside that
output, and (iii) the platform space inspection snapshot — all genuine deployed
records, not VM executions.

## Missing integration step(s)

Neither repair has been pushed to any deployed artifact. The required work is a
deploy/build step, not more workspace repair:

1. **On `altcoin-analyzer-and-signal-tracker`**: an artifact builder session
   with deploy rights must rebuild/republish the artifact so its server action
   `runpapersignalcycle` executes the repaired discovery→paper handoff
   (workspace `paper-signals/handoff/src/qualify.ts`) and the v2.1.9 issuance
   handler (workspace `paper-signals/orchestrator/src/issuance/handler.ts`,
   `ISSUANCE_HANDLER_VERSION = "2.1.9"`). The deployed server code is currently
   `runExplicitPaperCycle` in `server/src/actions.ts` under
   `PAPER_FREEZE_VERSION='paper-pilot-v2.1.0'` — the workspace sandbox
   reference implementation was never ported into the artifact's server bundle.
   A successful redeploy should be confirmed by deployed evidence: a new
   `current_build_id`/`updated_at` on `spaces.spaces`, a post-deploy inspection
   showing the repaired code in the deployed source tree, and the deployed
   `getpaperpilotstatus` payload reporting the v2.1.9 handler version (currently
   absent — the payload has no issuance-handler version field at all).

2. **On `equity-analyzer-and-signal-tracker`**: no paper lane exists yet. After
   (1) is deployed and proven on crypto, the equity equivalent needs the paper
   actions added to the artifact and rebuilt the same way (separate scoped task
   — Logan's equity paper lane is not yet approved to exist).
