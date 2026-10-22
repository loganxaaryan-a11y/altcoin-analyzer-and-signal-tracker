# SUPERSEDED as the current mapping (2026-10-14, later the same day)

The active series has moved v2.1.4 → v2.1.5
(`comparison/ACTIVE_MANIFEST` now names `freeze-manifest-v2.1.5.json`),
so the v2.1.4-specific statements below (notably the harness.py
hash-mismatch finding) are stale history. The single current mapping is
`comparison/VERSION-MAPPING-2026-10-14.md`
(`paper-pilot-v2.1.0` ↔ `v2.1.5`), re-validated on every run by
`comparison/tests/test_version_mapping.py`. This doc is retained
unmodified for provenance; extend the successor, not this file.

---

# Hash mapping — deployed components → build hashes → comparison freeze (2026-10-14)

One row per deployed component: the deployed action/code → its build or source hash → the comparison manifest freeze version it was built under → the comparison stamp (`freeze_version`) the collector writes onto rows.

**Nomenclature warning (two independent version series):**
- (a) The artifact's own paper-pilot freeze, self-reported by the deployed actions: **`paper-pilot-v2.1.0`** (frozen 2026-10-14T04:54:12.629Z). This is the deployed terminal's paper machinery version.
- (b) The **comparison measurement freeze series**: v2.0.0 → v2.1.0 → v2.1.1 → v2.1.2 → v2.1.3 → **v2.1.4 (ACTIVE)**. This is what the collector stamps onto rows.
Do NOT conflate the artifact's `paper-pilot-v2.1.0` with comparison `v2.1.0` — they are different freezes of different things.

All sha256 values marked "computed" were computed 2026-10-14 via `sha256sum` on this machine.

## 1. Deployed paper actions on `altcoin-analyzer-and-signal-tracker`

### `runpapersignalcycle` (deployed action)
- **Build identifiers** (self-reported by the deployed action, captured via `getpaperpilotstatus` at 2026-10-14T05:41:30Z, saved to `comparison/live-paper-status-2026-10-14.json`):
  - `freezeVersion`: `paper-pilot-v2.1.0`
  - `frozenAt`: `2026-10-14T04:54:12.629Z`
  - `freezeHash`: `a7d354a4f8ad9b0af7d3d61986b049f822ee918d28f26f335401d72d24669f84`
  - `productionHash`: `f259e73e1af77c423dadde587e84430e704994afa484e3fedbf5aa6ecfef04cc`
  - `challengerHash`: `d88d534391d5214f5d3775274ea38c27cd1edc61449232c01c3084054313870d`
- **Deployed run records** (from the same status payload):
  - run 1: `runKey paper-pilot-v2.1.0:scheduled:5973178`, `discoveryRunId 56`, trigger `scheduled`, 2026-10-14T04:54:12.656Z → 04:54:12.675Z, `complete`, candidateCount 0 / issuedCount 0
  - run 2: `runKey paper-pilot-v2.1.0:manual:5973178`, `discoveryRunId 56`, trigger `manual`, 2026-10-14T04:54:56.233Z → 04:54:56.285Z, `complete`, 0/0
  - run 3: `runKey paper-pilot-v2.1.0:manual:5973183`, `discoveryRunId 56`, trigger `manual`, 2026-10-14T05:18:02.303Z → 05:18:02.347Z, `complete`, 0/0
  - All three summaries: "No directional discovery candidate was available for the explicit paper path; no signal was manufactured."
- **Built under comparison manifest freeze**: `paper-pilot-v2.1.0` — the artifact's own paper freeze, NOT the comparison v2.1.x series. No comparison manifest records this action's code.
- **Comparison stamp the collector writes**: `2.1.4` (`harness.ACTIVE_FREEZE_VERSION` → `ACTIVE_MANIFEST` → `freeze-manifest-v2.1.4.json`). The collector does NOT stamp the artifact's `paper-pilot-v2.1.0` onto rows; the two series are kept separate.
- **Deployed backend code sha256**: unverifiable — the artifact backend is platform-hosted; this subagent has no artifact-action API, live browser, or platform session. No source hash is claimed.

### `getpaperpilotstatus` (deployed action)
- **Build identifiers**: same self-reported freeze identifiers as above (its own response payload carried them: freezeVersion `paper-pilot-v2.1.0`, freezeHash `a7d354a4f8ad9b0af7d3d61986b049f822ee918d28f26f335401d72d24669f84`, frozenAt 2026-10-14T04:54:12.629Z).
- **Snapshot on disk**: `comparison/live-paper-status-2026-10-14.json` (`exported_at` 2026-10-14T05:41:30Z, `exported_by` "paper-signal-comparison-collection", `source` "deployed-artifact:altcoin-analyzer-and-signal-tracker:getpaperpilotstatus").
- **Built under comparison manifest freeze**: `paper-pilot-v2.1.0` (artifact paper freeze).
- **Comparison stamp the collector writes**: n/a — read-only status action; rows are stamped by the collector, not by this action.
- **Deployed backend code sha256**: unverifiable (same reason as above).

## 2. Paper pilot source components (workspace, sandbox path)

### Repaired issuance handler — `orchestrator/src/issuance/handler.ts`
- **sha256 (computed)**: `b43a788047ebb234d3c996595a9612cda60f1acd69adba25eb8bf8d8746b393b`
- **Built under comparison manifest freeze**: none — no comparison manifest's `executable_hashes` records this file (those cover only `comparison/*.py` + tests). The BTC-ISSUANCE-RUNTIME-2026-10-14.md acceptance run recorded "[identity] MATCH — the repaired issuance path is the frozen source" (frozen *terminal* source, not a comparison freeze version).
- **Collector stamp**: n/a (sandbox paper-pilot source, not a collector input).

### entry-v1 (entry observation) — `entry-v1/src/`
| File | sha256 (computed) |
|---|---|
| `entry-v1/src/contract.ts` | `15853721301ccd13893f99e9c5e6751fb448aeadb7da6141dab7bad7c18cca42` |
| `entry-v1/src/entry-rules.ts` | `9874a0810b02c90ec457f88f4fcccb427ce47caa377f1c0279314d06f932eb53` |
| `entry-v1/src/feed.ts` | `68b5558eb67fcecd2a0ab6d91173e3911b272c94214ba7f6f65bdd415b974784` |
| `entry-v1/src/legacy.ts` | `adeb94b6b54dda33004cda8cdddc9fcd6f8212e1a0cd87ab65e2ee4c5e700792` |
| `entry-v1/src/levels.ts` | `5bd21b1d71d9fae5443cce6ad10bcb1fe3e0ff868baa94c6523bb872cce528bb` |
| `entry-v1/src/pending.ts` | `5624a9b1ffee8e7071ef0340e2f8b4aa1e75f74f8fbd44179a45c47d503da3c1` |
| `entry-v1/src/watcher.ts` | `b27d715d7054386d85daf349a71468c7e1dfa2d4ca69c340f65a53435a912b07` |
- **Built under comparison manifest freeze**: none recorded. **Collector stamp**: n/a.

### veto — `veto/src/`
| File | sha256 (computed) |
|---|---|
| `veto/src/veto.ts` | `ae38b6b1ddb933033dfa70e7bf375e403d134e24f75e9b57e60ff6b78a3ae478` |
| `veto/src/waiting-interval.ts` | `4035f95c8a02f66d2e69fb942969b2daa11154903fd7ee169333e803cd9f3c40` |
- **Built under comparison manifest freeze**: none recorded. **Collector stamp**: n/a.

## 3. Comparison manifest v2.1.4 (the active stamp source)
- **File**: `comparison/freeze-manifest-v2.1.4.json`
- **sha256 (computed)**: `97761fa1c745179328e48e86bc0d9f9ab07dde20ce82a4f9d46326d6b578c1ef`
- **manifest_version**: `2.1.4`; **frozen_at_utc**: `2026-10-14T05:40:02Z`
- **Chain**: supersedes v2.1.3 (sha256 `d5501893e4bd1dad4a028f8f47dab99a05a89ce085411ca5ebb0ba71544a4a28`) → v2.1.2 (`bffc2e93a8add0bba9cabb43d8098f15ad51318df073db66828c990f296174b7`) → v2.1.1 (`96aa584b3bda36aec4cadf78ce9ed527ebddff55821838918281421254c37f52`); executable core pinned from v2.1.0; post-freeze collection cutoff `2026-10-14T04:57:00Z`.
- **ACTIVE_MANIFEST** (sha256 computed: `b59f79f420971f8849b1019ff0920bc16f800a1730ad8a6c76441e0ce58952fd`) contains exactly `freeze-manifest-v2.1.4.json`.
- **Comparison stamp the collector writes**: `2.1.4` — `harness.ACTIVE_FREEZE_VERSION` (harness.py:280) fail-fasts from `ACTIVE_MANIFEST`; `collect_pilot_rows.py` stamps `freeze_version` from it and dedupes on `(candidate_id, freeze_version)`.

### Manifest-recorded executable hashes (v2.1.4 `executable_hashes`) vs on-disk verification 2026-10-14
| File | Recorded in manifest | On disk 2026-10-14 | Verdict |
|---|---|---|---|
| `comparison/harness.py` | `5ad1d7a0895393f5fe93a1017f7a6841e328896d115e13c68b1300537cd39319` | `d92ab4c74f90fd3817b3c1349167eb380eafba61a240af379d15e671c098968e` | **MISMATCH** |
| `comparison/collect_pilot_rows.py` | `6aa5231456c7db88120145517e74a4a3b9eaec8d41d16b23557880451248b062` | same | MATCH |
| `comparison/live_paper_stream.py` | `911cd4161a1a4b077f73a534a41a313b1382888dfd4f42a98f04a1d4d96370f8` | same | MATCH |
| `comparison/tests/test_harness.py` | `91b3c6d8641598cba432c004b6ae852fccc6affb92d8e498a5aad7981f37c4aa` | same | MATCH |
| `comparison/tests/test_collector.py` | `c17a6a0de8b062b2c772a5e9c3cb4ceb00f5528fe4fb2f0845f8a7d7b2b4fd52` | same | MATCH |
| `comparison/tests/run_tests.py` | `b1ca5d22f70d70098e462862d881ee2d29033ddbcaf3237b35163fbb6457c5d6` | same | MATCH |
| `comparison/check_reconciliation_v2_1_4.py` | `ccc067d78b30e414cc1da33a56a7b32e7fa2752e3c2c901bd10c6c418e3388e9` | same | MATCH |

**Finding (not repaired — out of scope):** `comparison/harness.py` was edited at 2026-10-14T06:04:50Z, AFTER `freeze-manifest-v2.1.4.json` was frozen at 05:40:02Z. The manifest's recorded harness hash (`5ad1d7a0…`) no longer matches the live file (`d92ab4c7…`). Six of seven recorded hashes match; only `harness.py` drifted. Neither the frozen manifest nor the harness was edited here — a re-freeze (v2.1.5 or equivalent) is the parent/expert's call, since the manifest is frozen by rule.

## 4. Terminal source used in the class-(b) real-issuance demo
Source: `pilot/evidence/terminal-runtime-demo-2026-10-14/source-hashes.txt`; per `pilot/TERMINAL-RUNTIME-EVIDENCE-2026-10-14.md`, verified byte-identical to the 2026-10-13 source export of `altcoin-analyzer-and-signal-tracker` (all six core files sha256-matched).
| File (as recorded) | sha256 |
|---|---|
| `/tmp/terminal-shim/src/actions.ts` | `301e270e72a98d1dbcbfcf5d99ce53cc8afb142df77a8c18a514831b2c1a2788` |
| `/tmp/terminal-shim/src/issuance-persistence.ts` | `4087b0639c4f332ea8ebee34f361e8ff19f0dfec5b5b13513cd933b5cec2707c` |
| `/tmp/terminal-shim/src/market-freshness.ts` | `12fc9ab4fe4e488c30a778094df8545c5ffdb166f78b1f239a2f694c0898642a` |
| `/tmp/terminal-shim/src/measurement-recovery.ts` | `746b2d45f90e7643e73c97e0a110c948f7ca50a2a5ad3dfa9bea02fc4f9d1d6e` |
| `/tmp/terminal-shim/src/meme-risk.ts` | `14aa5bebfe8a3fa4a89c6ec40faef4fec1620d72b3ac1d01cb3c7aa117a2919f` |
| `/tmp/terminal-shim/src/phase2a-controls.ts` | `ba50f5a1f2c8a3cb1865349445d61986abb3415257336e1ce53bae850eb5b845` |
| `/tmp/terminal-shim/src/phase2a-package-sources.ts` | `831eb9530db1d36347ceb9d005fe8083e855c0b005246e457b784158ca9586c4` |
| `/tmp/terminal-shim/src/phase2a-package.ts` | `eaad5e9928f8ac7e1878ddfc0a361cf3b1f5acfe702837ed22d553edf31629b9` |
| `/tmp/terminal-shim/src/phase2a-research.ts` | `09b8146145dbf8af8caa8629038bbdf713f2d96325be18e469cacef57dfb283d` |
| `/tmp/terminal-shim/src/phase2a-timing-preflight.ts` | `96e4358c4e66aec66b0b5a3bcb9e9e5fe0f28ef356253cce4ec28266e7683ba9` |
| `/tmp/terminal-shim/src/privileged.ts` | `013ff5cb7a168e9f4f73e738498bd947d86235fb6a2180bc09ca2a1e4eb19463` |
| `/tmp/terminal-shim/src/schema.ts` | `26b3202117041b6047b720fc63502d6b3b29316d1b6676acd54b2d3dc652d95f` |
| `/tmp/terminal-shim/src/signal-methodology.ts` | `617d64ef316e4076496e6f2fa7e90d71a48743ca4c31bb120493f007ae3a8532` |
- **Built under comparison manifest freeze**: none — terminal production source, not comparison-freeze artifacts. The key file is `actions.ts` (contains `issueGeneratedSignalCandidate()`, the real issuance function executed in the class-(b) demo; invocation `paper-shim-65a38544-4581-42cb-925a-5ad29c4042aa`, outcome `suppressed` via the born-dead veto).
- **Collector stamp**: n/a (read-only execution demo, never collected).

## Unverifiable (marked, not invented)
- sha256 of the deployed artifact backend code (`runpapersignalcycle` / `getpaperpilotstatus` as they run on the platform): **unverifiable: deployed artifact code is platform-hosted; no artifact-action API, live browser, or platform session is available to this subagent.** The artifact's self-reported freeze hashes (freezeHash / productionHash / challengerHash above) are the only build identifiers on record.
