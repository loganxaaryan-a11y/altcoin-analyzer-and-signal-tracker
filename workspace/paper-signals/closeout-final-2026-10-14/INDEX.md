# Closeout package — 2026-10-14 (final)

One package for the five closeout workstreams. Paper only, no brokerage, no execution.
No model tuning, no production inversion, no model replacement. H-2 unchanged, B/C parked.

## Contents

### 01-intended-models/
- `INTENDED-MODEL-WIRING-2026-10-14.md` — frozen trial connected to actual named model functions:
  `crypto-dossier-factor-agreement` 2.0.0 (`scoreDossierFactors`, `buildAtrLevels`,
  `canonicalWilderAtr` ← `signal-methodology.ts`), C-2 `crypto-dossier-minus-momentum` 0.1.0-shadow,
  `equity-factor-agreement` 3.1.0 (`factorScoreBreakdown`, `signalDecision`, `buildFrozenLevels` ← `actions.ts`).
  19/19 pinned tests reproduce recorded decisions.
- `intended_models.py` — the wired functions (faithful ports, docstrings cite source lines).
- `decision-time-inputs-dossier-btc-id43-2026-10-14.json` — complete decision-time inputs for the
  demonstrated opportunity (BTC id43, issued 2026-10-14T13:00:21.555Z); 3 no-data factors stored UNKNOWN.
- `wired-trial-evidence-dossier-btc-id43-2026-10-14.json` — both arms' scores/dispositions:
  production 52/long scored (reproduces issuance exactly); C-2 52/long scored non-flipped;
  paper-pipeline operational arm UNKNOWN (no entry-observation evidence for a dossier-path opportunity).
- `PAIRED-INVERSION-RETROSPECTIVE-2026-10-14.md` — exploratory paired finding, n=42, +1.071 R
  (crypto +1.471 R, equity +0.800 R); "7 issuance dates; effective independence unknown".

### 02-delivery/
- `WRAPPER-FALLBACK-INSTALL-2026-10-14.md` — issuer-side hook installed as the contract's wrapper
  fallback (direct artifact invocation unavailable from this seat): `paper-signal-cycle` converted to a
  `kind=agent` issuance wrapper doing pre/post `getpaperpilotstatus` snapshots, alert-key diff, and one
  `cron.run(trigger:...)` per batch. Commit-before-trigger enforced. State label: **trigger-ready**
  (installed, not yet proven on a real alert); `discovery_mode` stays `sweep-fallback` until one proven
  triggered delivery. ENTRY_CONFIRMED enqueue point still unhooked (blocker stands).
- `TRIGGERED-CHAIN-RECORD-2026-10-14.md` — durable chain for `test/sig_TEST_0c8ffb7f/ENTRY_CONFIRMED`:
  manual trigger (issued_at 2026-10-14T23:59:55Z) → worker run 8c64be7a (trigger_latency_s=147) →
  pre-commit → render → outbox delivered 00:06:36Z (independently verified); event→ack 241s,
  enqueue→ack 130s; `trigger_source="trigger"`. TEST evidence segregated from production.

### 03-grading-stats/
- `SHADOW-COMPARISON-PROTOCOL-v2.md` — "net horizon return" withdrawn; two fields:
  `fixed_5d_return_r` (secondary/descriptive) and `barrier_exit_return_r` (primary endpoint).
  Read rule: paired estimate ≥+0.25 R with interval excluding zero = "warrants further testing" —
  does NOT establish an improvement of ≥+0.25 R. Collection 2026-10-15 → 2027-02-15, readout 2027-02-25.
- `STATISTICAL-AMENDMENT-v1-2026-10-14.md` — frozen BEFORE any outcome inspection:
  overlap diagnostics D1–D5 (diagnostics only, never entering the interval); block bootstrap
  (B=10,000) over overlap-connected components (shadow) / two-way CGM cluster SEs (Challenger A);
  estimand pinned to the per-opportunity mean (equal date-mean averaging rejected);
  minimum-data rule (shadow: paired n ≥ 20 AND ≥ 5 overlap blocks; Challenger A: ≥20 clusters/dim AND ≥ 40 rows)
  → below it, named INSUFFICIENT EVIDENCE, never upgraded.
- `SPEC-A-CHART-SETUP-v5-AMENDMENT-2026-10-14.md` — entry-straddling hour no longer silently excluded:
  finer 1m evidence where available; otherwise `STRADDLE_UNRESOLVED` (terminally non-definitive).
  V0-v3 thresholds untouched. 33/33 new checks pass; full suite green.

### 04-executable-evidence/ (by reference — already staged and hash-verified)
`paper-signals/closeout-2026-10-14/` — 35 files + MANIFEST.json (sha256): collection adapter
(`live_paper_stream.py`), collector/harness, graders, 8 tests, full manifest chain (v1.0.0 → v2.1.5 +
ACTIVE_MANIFEST), run-5 raw action response, delivery records (test ledger + timeliness logs),
one-page INDEX.md. Includes the hash-drift amendment WITH the actual code diff
(`live-paper-stream-decisionAt-fix.diff`, 5 hunks; pre-fix baseline verified byte-for-byte), and the
isolated-fixture test replacing the production-empty-cohort assertion (156/156 pass).

## Status

- **Intended models scored on fresh opportunities:** 1 demonstrated (BTC id43, both arms scored;
  paper-operational arm UNKNOWN). The 8 discovery candidates remain their own population (unscored,
  per RULE 3 — deployed pilot runs a different 7-factor model).
- **Automatic delivery:** trigger-ready. Wrapper fallback installed and mechanically verified
  (deployed paper run 8: 0 issued, 7 deferred, 1 abstained, no spurious trigger). One proven
  triggered TEST chain (event→ack 241s). `discovery_mode` stays sweep-fallback until the first
  genuine wrapper-originated chain completes.
- **Grading definitions:** corrected (two return fields; straddling-hour uncertainty preserved).
- **Statistical amendment:** frozen (both protocols, pre-inspection attestation).
- **Executable evidence:** included (35 staged files + hash manifest).

## Remaining blockers

1. Issuer-side direct hook — needs artifact builder session with deploy rights; wrapper is the fallback.
2. ENTRY_CONFIRMED enqueue point unhooked (deployed entry tick Variant A not installed).
3. Factor-model mismatch (deployed 7-factor ≠ frozen 11/10-factor) — expert loop's call.
4. `live_paper_stream.py` hash drift vs freeze manifest — manifest amendment call (parent/expert).
5. Live PAPER path UNPROVEN — no genuine opportunity has traversed it end to end.
6. H-2 and direction-model rebuild — Logan's calls under his 40% rule.
7. BAT wired-but-unfired — resolves on the next paper cycle.
