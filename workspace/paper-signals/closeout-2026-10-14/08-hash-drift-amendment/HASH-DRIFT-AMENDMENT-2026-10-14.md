# HASH-DRIFT AMENDMENT — 2026-10-14

## File amended

`freeze-manifest-v2.1.5.json` (ACTIVE freeze; see `05-freeze-manifests/`), section
`executable_hashes`, entry:

```
"comparison/live_paper_stream.py": "0f6393006d935c82d4b3d841aa23faec8adb18e860e006b16d4ab07a42b04836"
```

The manifest's recorded hash no longer matches the file on disk. The live file's
current sha256 is:

```
f421b72873f7ff8a0042f91d1185a9a6da0c451541ae276fbf4eec4ed385f4b2
```

(`comparison/live_paper_stream.py`; verified 2026-10-14.) This amendment records
the drift, names the change, and carries the actual before/after code diff — the
manifest itself is left byte-identical (frozen).

## Why the hash changed — the timestamp fix (`decisionAt` vs `decision_at`)

During collection run 5 (2026-10-14T23:40Z; see `09-supporting-docs/collection-run-log-2026-10-14.md`),
the collection adapter was repaired in two spots, both in `live_paper_stream.py`:

1. **`candidate_from_paper_signal`** (signal path) — BEFORE:
   ```python
   decision_at = sig.get("decision_at") or sig.get("decided_at")
   ```
   AFTER:
   ```python
   decision_at = _pick(sig, "decisionAt", "decision_at", "decided_at")
   ```
2. **`candidate_from_paper_candidate`** (candidate path) — BEFORE:
   ```python
   decision_at = cand.get("decision_at") or cand.get("decided_at")
   ```
   AFTER:
   ```python
   decision_at = _pick(cand, "decisionAt", "decision_at", "decided_at")
   ```

Root cause: the deployed `getpaperpilotstatus` schema persists the decision
timestamp as **`decisionAt`** (camelCase). The adapter extracted snake_case keys
only, so every deployed candidate resolved to `decision_at=None`,
`_after_cutoff(None)` = False, and all 8 post-freeze candidates were silently
mislabeled "excluded pre-freeze: 8" — a false healthy 0-row run. The fix uses the
script's own `_pick` helper with camelCase-first tolerance (matching the
adapter's documented convention in
`09-supporting-docs/LIVE-ADAPTER-FIELD-COVERAGE-2026-10-14.md`); absent still
resolves to None — never fabricated. After the fix: 8 candidates exported,
0 excluded pre-freeze, 8 rows appended to the prospective vessel under freeze
stamp 2.1.5.

The full unified diff (old = the manifest-recorded version, hash `0f639300…`,
sourced from `review-bundle-v2.1.5-2026-10-14/02-sources/live_paper_stream.py`;
new = the current file, hash `f421b728…`) is in:

`08-hash-drift-amendment/live-paper-stream-decisionAt-fix.diff`

It contains 5 hunks: the two `decisionAt` timestamp-fix hunks above, one
`_factor_ledger()` helper addition, and its two call sites (mapping the deployed
`factorLedgerJson` camelCase string to harness factor dicts, verbatim
name→label; the frozen harness judges completeness against its own factor sets,
never guesses). All changes are operational plumbing; no model, weight,
threshold, or formula was changed. The frozen harness (`harness.py`), collector
(`collect_pilot_rows.py`), and all other `executable_hashes` entries are
untouched and still match the manifest.

## Status

Drift is flagged, not hidden. `tests/test_version_mapping.py` reports the
mismatch honestly. The amendment is recorded here rather than by rewriting the
frozen manifest, so the manifest's byte-identity as a frozen trial record is
preserved.

## Addendum — authorized test-only replacement (2026-10-14)

The closeout task authorized one test-only change. `tests/test_collector.py ::
TestVessel::test_real_vessel_header_matches_schema` asserted the production
vessel `rows/cohort-prospective-v2.csv` is header-only (zero rows). Collection
run 5 legitimately appended the first 8 post-freeze rows, so the test failed on
the real file — it assumed production stays empty. It was REPLACED with
`test_fixture_vessel_header_matches_schema`: same schema assertions (header ==
VESSEL_COLUMNS, 69 columns, trailing cohort columns; header-only fixture reads
back as zero rows) run against a TEMP vessel in `tempfile.TemporaryDirectory()`,
never the production file, and never depending on the production cohort being
empty. Full suite: 156 tests, all passing (`python3 tests/run_tests.py`).

Manifest drift from this change: `executable_hashes["comparison/tests/test_collector.py"]`
`c17a6a0de8b062b2c772a5e9c3cb4ceb00f5528fe4fb2f0845f8a7d7b2b4fd52` (recorded) →
`c7fe3a03ab98f18d91dd7ced3928d393137ef70205a3013d86b8ca242f4a4ed6` (current).
The staged `04-tests/test_collector.py` is the updated file; the package's
MANIFEST.json records its current hash.
