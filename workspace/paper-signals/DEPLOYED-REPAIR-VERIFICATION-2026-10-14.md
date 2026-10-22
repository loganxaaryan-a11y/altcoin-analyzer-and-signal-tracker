# Deployed repair verification — paper pipeline rebuild (2026-10-14)

**Scope:** deploy the repaired paper pipeline (workspace `handoff/src/qualify.ts` +
`orchestrator/src/issuance/handler.ts` v2.1.9) into the live crypto terminal
`altcoin-analyzer-and-signal-tracker`, and verify the deployed transport.
Paper signals only. No brokerage. Holdouts locked. No model tuning. No
re-audit of accepted components.

**Seat limits (stated plainly):** this seat has no `artifact.invoke_action` /
`artifact.status` / `artifact.edit` tool and no side-chat send capability.
Deployment itself was performed by the sibling builder dispatch (deploy
rights); this file records and verifies from deployed records only:
`spaces.spaces` build row (read-only DB), the deployed `getpaperpilotstatus`
snapshots persisted by the `paper-signal-alert-delivery` worker, and the
scheduled cron run history. Per-file deployed source-tree inspection is not
available from this seat (same caveat as VERSION-MAPPING §6:
`unverifiable-from-workspace`).

## 1. Pre-deploy baseline (deployed v2.1.0-era code)

Captured in DEPLOYED-INTEGRATION-GAP-2026-10-14.md:

- Build `c9bb1cad-be8d-49e3-a325-04f1ee0edebc`, `spaces.updated_at`
  2026-10-14T04:53:55Z; deployed source tree (83 files, fingerprint
  `8d5bc696…`) contains NO `handoff/` directory and NO
  `orchestrator/src/issuance/handler.ts`.
- Deployed `getpaperpilotstatus` (snapshot `worker-runs/status-2026-10-14T18-05-47Z.json`,
  last pre-deploy pull 18:05:47Z):
  - `data.freeze.version = "paper-pilot-v2.1.0"`,
    `frozenAt = "2026-10-14T04:54:12.629Z"`,
    `freeze.hash = "a7d354a4…"`, `productionHash = "f259e73e…"`,
    `challengerHash = "d88d5343…"`.
  - No issuance-handler version field anywhere in the payload.
  - `data.delivery.configured = false`;
    `missingCapability = "No chosen alert destination or acknowledged
    delivery action is configured."`
  - `data.segregation`: `legacyTable = "generated_signals"`
    (`legacyTrackedCount = 34`), `paperTable = "paper_signals"`;
    note: "The paper action never writes generated_signals or
    signal_contracts."
  - 6 deployed paper runs (ids 1–6), all `complete`, 0 candidates / 0 issued;
    run 6 carries `discoveryRunId = 58`.
- Workspace sources to deploy (hashes computed 2026-10-14, pre-deploy):
  - `handoff/src/qualify.ts` —
    `25fb6ab20fb97db0cdce2d17154ed392b05056415bf9f4d13a7bd7862c68b02f`
    (written 2026-10-14T06:47:16Z; matches the hash recorded in
    `handoff/README.md`)
  - `orchestrator/src/issuance/handler.ts` —
    `6a9aaf62444fdb880b14ae8345a68ab324037d0c3997db55bde976258ad3db37`
    (written 2026-10-14T09:26:36Z;
    `ISSUANCE_HANDLER_VERSION = "2.1.9"` at line 2050)

## 2. Deployment (sibling builder dispatch — continued, not restarted)

Build observed in progress via `spaces.spaces` (read-only). This seat did
not start, restart, or modify any build.

- 2026-10-14T18:22:31Z: `current_build_id =
  034acae8-d86f-48ca-9842-ae006383dff6`, `construction_status = "updating"`,
  `builder_provenance_pending_build_id = 034acae8-…` (first rebuild observed).
- 2026-10-14T18:32:58Z: `current_build_id` advanced to
  `948e74ed-4655-41b8-b5fd-f5dc9ed372b4`, `construction_status` still
  `"updating"`, `builder_provenance_pending_build_id = 948e74ed-…`
  (sibling superseded the first build ~10 min in; no provenance was ever
  recorded for `034acae8-…`, `builder_provenance_build_id` still
  `c9bb1cad-…` = the v2.1.0-era build).
- 2026-10-14T18:37:06Z: `current_build_id` advanced AGAIN to
  `c698a58b-c607-49d6-9297-bbdc1803405e`, `construction_status` still
  `"updating"`, `builder_provenance_pending_build_id = c698a58b-…`
  (second build superseded ~4 min in; no provenance recorded for
  `948e74ed-…` either). Three builds in ~15 min suggests rapid iteration
  or fast build failures on the sibling's side; build logs are not visible
  from this seat.
- 2026-10-14T18:39:34Z: `builder_provenance_build_id` advanced to
  `c698a58b-…`, `builder_provenance_pending_build_id` cleared (provenance
  recorded for the third build).
- 2026-10-14T18:41:27Z: `construction_status = "failed"` observed
  (transient — see next line).
- 2026-10-14T18:44:32Z: **`construction_status = "succeeded"`**,
  `current_build_id = c698a58b-c607-49d6-9297-bbdc1803405e`,
  `builder_provenance_build_id = c698a58b-…`. **The rebuild LANDED.**
  (The 18:41 "failed" reading was transient; the final status is
  succeeded. First two attempts `034acae8-…` and `948e74ed-…` were
  superseded without completing.)

## 2a. Deployment outcome (as of 18:44 UTC)

**Build `c698a58b-c607-49d6-9297-bbdc1803405e` succeeded and is current.**
Post-deploy runtime verification now depends on the next
`paper-signal-alert-delivery` worker snapshot (pulls `getpaperpilotstatus`
from the new build): expect the issuance-handler version field (`2.1.9`),
updated freeze identifiers, and the `paper_handoff_*` provenance tables in
the deployed DB. The sibling's port (in the build workspace, read-only
inspected): `server/src/paper-v219.ts` (`ISSUANCE_HANDLER_VERSION =
"2.1.9"`, `LEGACY_ISSUER_REACHABLE = false`, `PAPER_SOURCE_HASHES`
matching workspace sources hash-for-hash, `PAPER_VERSION_MAPPING`
deployedSeries `paper-pilot-v2.1.0` ↔ comparisonSeries `v2.1.5`);
migration `0041_paper_handoff_v219_provenance.sql` creating
`paper_handoff_runs` (UNIQUE `discovery_run_id`) and
`paper_handoff_candidates` (with `pre_legacy_filter`); delivery
architecture declares artifact-owned chat delivery NOT configured
(missingCapability named in the deployed bundle itself).

Note: `paper-signal-alert-delivery` worker runs were timing out on
persistence from 13:30 EDT (17:30 UTC) — before the first build started.
The `getpaperpilotstatus` pull itself kept succeeding (fresh data); the
timeouts hit the bookkeeping phase. Snapshots eventually persisted at
18:35:53Z (old code, mid-rebuild) and 18:57:02Z (new code, post-deploy —
the verification payload in §3a). The 18:57 run also noted
"getpaperpilotstatus returned slowly" — the action is slow post-rebuild,
which likely explains the earlier timeouts.

## 3. Post-deploy verification

### 3a. Deployed runtime proof — `getpaperpilotstatus` reports handler 2.1.9

First post-deploy snapshot `pilot/delivery/worker-runs/status-2026-10-14T18-57-02Z.json`
(pulled 18:57:02Z from build `c698a58b-…`, ~13 min after the build
succeeded). The deployed action now returns a reshaped summary envelope:

```json
{
  "action": "getpaperpilotstatus",
  "artifact": "altcoin-analyzer-and-signal-tracker",
  "fetched_at_utc": "2026-10-14T18:57:02Z",
  "summary": {
    "alerts": 0, "candidates": 0, "candidates_in": 0,
    "freeze": "paper-pilot-v2.1.0",
    "freeze_hash": "a7d354a4f8ad9b0af7d3d61986b049f822ee918d28f26f335401d72d24669f84",
    "handler_version": "2.1.9",
    "latest_paper_run": {"id": 6, "discovery_run_id": 58, "issued": 0,
      "trigger": "manual", "completed_at_utc": "2026-10-14T15:09:25.294Z"},
    "legacy_generated_signals": 34,
    "paper_signals": 0
  }
}
```

Verified:
- **`handler_version: "2.1.9"`** — the repaired issuance handler is
  executing in the deployed runtime. (Confirmation criterion met.)
- Freeze series UNCHANGED: `paper-pilot-v2.1.0`, same freeze hash
  `a7d354a4…` — the deployed paper series stays separate from the
  comparison `v2.1.5` series, exactly as VERSION-MAPPING §1 requires.
- Run linkage intact: latest paper run id 6 carries `discovery_run_id: 58`.
- Legacy segregation intact: 34 legacy rows in `generated_signals`,
  untouched; `paper_signals: 0`; worker run log confirms "the paper action
  never writes that table."
- Deployed source hashes (from the build's `server/src/paper-v219.ts`
  `PAPER_SOURCE_HASHES`, read-only inspected pre-publish):
  `orchestrator/src/issuance/handler.ts` =
  `6a9aaf62444fdb880b14ae8345a68ab324037d0c3997db55bde976258ad3db37`
  (matches workspace file hash computed independently;
  `ISSUANCE_HANDLER_VERSION = "2.1.9"`),
  `handoff/src/qualify.ts` =
  `25fb6ab20fb97db0cdce2d17154ed392b05056415bf9f4d13a7bd7862c68b02f`
  (matches workspace file hash and `handoff/README.md`).
  Remaining handoff sources match the README's recorded hashes
  (discovery-types `61533b12…`, feeds `b8658698…`, handoff-run
  `2e921ce6…`, ledger-store `0d32e9bc…`, map-candidate `fd3cfe24…`,
  no-legacy `22c01f14…`).

### 3b. Manifest mapping check

- `comparison/ACTIVE_MANIFEST` → `freeze-manifest-v2.1.5.json` (unchanged;
  comparison series untouched by this deploy).
- VERSION-MAPPING-2026-10-14.md §1 (two series, mapped never merged)
  holds: deployed still self-reports `paper-pilot-v2.1.0`; rows are still
  stamped `2.1.5` only.
- §3.1's deployed-side source hashes are now STALE for the repaired files
  (it records the pre-v2.1.9 `handler.ts` `b43a7880…` and `feed.ts`
  `68b5558e…`; deployed are now `6a9aaf62…` / `14732e2e…` per the build's
  `PAPER_SOURCE_HASHES`). Addendum appended as §7 of VERSION-MAPPING
  (per its "extend this one" rule). R1–R6 re-verification against the
  v2.1.9 handler is NOT done here (out of scope: no repeat audit); the §6
  verdict stands for the v2.1.0-era deployed side.

### 3c. Handoff linking (design verified; runtime proof pending first new-code cycle)

- Deployed design (from the build): `paper_handoff_runs` table with
  UNIQUE `discovery_run_id` + `paper_handoff_candidates` (with
  `pre_legacy_filter`) — the handoff is persisted IN-ARTIFACT, keyed by
  discovery run. `LEGACY_ISSUER_REACHABLE = false` const +
  `assertNoLegacyPaperIssuer()` guard in the deployed bundle.
- No race by construction: the paper cycle consumes the persisted
  handoff row for its discovery run (unique key), rather than racing a
  parallel workspace process.
- Runtime proof pending: no `runpapersignalcycle` has executed on the new
  code yet (latest run id 6 ran 15:09:25Z on old code). First new-code
  cycle: `paper-signal-cycle` cron at 17:09:23 EDT (21:09:23Z), ~45 min
  after `crypto-market-discovery` at 16:24:23 EDT.
- Legacy issuance unreachable: segregation block in the live payload
  (34 legacy rows, paper never writes `generated_signals`), plus the
  deployed `LEGACY_ISSUER_REACHABLE=false` const.

### 3d. Open interface gap (flagged, not fixed — out of scope)

The rebuilt `getpaperpilotstatus` returns a **counts-only summary** — the
alert/candidate/signal ROWS the delivery worker and the comparison
collector depend on are no longer in the payload (old shape had
`data.alerts[]` etc.). Consequences:
- The `paper-signal-alert-delivery` worker's send sweep looks for
  `data.alerts` (old path). With the new shape it will find no rows even
  when `summary.alerts > 0` → genuine alerts would never render/deliver.
- The comparison collector's live-stream parser (`live_paper_stream.py`)
  was written against the old envelope; the 19:40 EDT collection run may
  misparse.
Possible reconciliation (for the parent/sibling): restore row exposure in
`getpaperpilotstatus` (the build's own `PAPER_DELIVERY_ARCHITECTURE`
declares "Expose SETUP_PENDING and ENTRY_CONFIRMED alert rows through
getpaperpilotstatus"), or update the worker + collector to the new shape.
This seat cannot do either (no builder interface; no rebuild scope).

## 4. Test notification — NOT SENT through the deployed transport (missing capability named)

No labeled TEST was emitted through the deployed paper alert route. This is
not a failure to attempt it — the capability does not exist, by design and
by the new interface gap. Faking one (a manual chat send labeled as
transport-verified, or a modified worker emission) would be fabrication.

Exact missing capabilities:

1. **No test affordance in the deployed alert route (by design).** The
   deployed bundle's own `PAPER_DELIVERY_ARCHITECTURE` declares
   artifact-owned chat delivery NOT configured (`configured: false`;
   `missingCapability: "Artifact-owned chat delivery is not configured;
   the chosen research-side-chat destination is implemented by the
   workspace cron and runtime delivery subsystem."`). The
   `paper-signal-alert-delivery` worker's send sweep explicitly **skips
   `test: true` payloads** and only emits genuine `SETUP_PENDING` /
   `ENTRY_CONFIRMED` rows from the deployed status. There is no supported
   path for a labeled TEST through the route.
2. **Row exposure removed in the rebuild (new gap, §3d).** The rebuilt
   `getpaperpilotstatus` returns counts only — no alert rows. The worker
   cannot render an alert (test or genuine) from this payload. Until row
   exposure is restored or the worker is updated to the new shape, nothing
   can traverse the deployed transport.
3. **Seat limits.** This subagent has no artifact-action invocation tool
   and no side-chat send capability.

The prior labeled routing test (2026-10-14T05:12:07Z, `test: true` fixture
replaying the dry-run signal, channel-acked with 👍 in 18.8s, recorded in
`pilot/delivery/delivery-config.json` → `routing_test`) went out as a
**manual parent send**, not through the deployed transport. It proved the
chat path; it did not and could not prove the deployed transport.

What WOULD prove the deployed transport: a genuine paper signal issuing
(→ alert row in the deployed status → worker render → runtime delivery →
outbox `delivered` → ledger `delivered`). That is identical to the live
path's proof, which is why the path stays UNPROVEN (§5).

## 5. Live signal path status

**UNPROVEN.** The live PAPER signal path remains UNPROVEN until a genuine
opportunity traverses the full path end-to-end: discovery → qualification
→ entry/void → delivery acknowledgement → collection. What exists now:

- Deployed: build `c698a58b-c607-49d6-9297-bbdc1803405e` (succeeded
  2026-10-14T18:44:32Z) serving the repaired v2.1.9 handler
  (`handler_version: "2.1.9"` in the live `getpaperpilotstatus` payload,
  18:57:02Z); persisted run-linked handoff tables
  (`paper_handoff_runs`/`paper_handoff_candidates`); legacy issuance
  unreachable by construction and by segregation.
- Proven: empty-run handling (discovery run 58 → 0 candidates → faithful
  empty handoff → paper run id 6 complete with 0 issued, no manufacture).
- NOT proven: issuance of a genuine signal, alert delivery, acknowledgement,
  collection of a real row. Prospective cohort remains header-only (0 rows);
  `first-post-freeze-opportunity` remains `none_yet`.
- Blocked until reconciled: the status-payload row exposure (§3d) — no
  alert, genuine or test, can currently traverse the deployed transport.

No trading candidate was manufactured at any point. Paper signals only;
no brokerage; holdouts locked.
