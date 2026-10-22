# Version mapping — `paper-pilot-v2.1.0` ↔ comparison `v2.1.5` (2026-10-14)

Successor to `comparison/HASH-MAPPING-2026-10-14.md` (which mapped the
deployed freeze against the then-active comparison `v2.1.4`; v2.1.4 is now
superseded — see `FREEZE-v2.1.4-SUPERSEDED.md`). That doc is retained for
history; this doc is the single current mapping. Do not create a second
mapping doc — extend this one.

## 1. The two version series (NOT unified — mapped, never merged)

| | Deployed paper series | Comparison measurement series |
|---|---|---|
| **Name** | `paper-pilot-v2.1.0` | `v2.1.5` |
| **What it freezes** | The artifact's own paper-pilot machinery (`runpapersignalcycle` / `getpaperpilotstatus` on `altcoin-analyzer-and-signal-tracker`) | The comparison measurement: harness evaluator, collector wiring, adapter full-record, executable hashes, row-stamp |
| **Frozen at** | `2026-10-14T04:54:12.629Z` | `2026-10-14T06:11:01Z` |
| **Active manifest** | n/a (self-reported by the deployed actions) | `comparison/ACTIVE_MANIFEST` → `comparison/freeze-manifest-v2.1.5.json` |
| **Stamp on prospective rows** | NEVER — the collector does not stamp `paper-pilot-v2.1.0` onto rows | `freeze_version = "2.1.5"` (`harness.ACTIVE_FREEZE_VERSION` ← `ACTIVE_MANIFEST["manifest_version"]`) |

Conflating the artifact's `paper-pilot-v2.1.0` with any comparison `v2.1.x`
is a category error; the series stay separate by design.

### 1.1 Deployed-side build identifiers (self-reported)

Captured via `getpaperpilotstatus` 2026-10-14T05:41:30Z, snapshot at
`comparison/live-paper-status-2026-10-14.json`:

- `freezeVersion`: `paper-pilot-v2.1.0`
- `frozenAt`: `2026-10-14T04:54:12.629Z`
- `freezeHash`: `a7d354a4f8ad9b0af7d3d61986b049f822ee918d28f26f335401d72d24669f84`
- `productionHash`: `f259e73e1af77c423dadde587e84430e704994afa484e3fedbf5aa6ecfef04cc`
- `challengerHash`: `d88d534391d5214f5d3775274ea38c27cd1edc61449232c01c3084054313870d`
- Runs recorded (all `complete`, 0 candidates / 0 issued, all summaries "No
  directional discovery candidate was available for the explicit paper path;
  no signal was manufactured."):
  - `paper-pilot-v2.1.0:scheduled:5973178` (discoveryRunId 56), 04:54:12.656Z→04:54:12.675Z
  - `paper-pilot-v2.1.0:manual:5973178` (discoveryRunId 56), 04:54:56.233Z→04:54:56.285Z
  - `paper-pilot-v2.1.0:manual:5973183` (discoveryRunId 56), 05:18:02.303Z→05:18:02.347Z

### 1.2 Deployed-side operational source (exported, hash-verified)

The deployed artifact backend is platform-hosted: **sha256 of the running
deployed backend code = `unverifiable-from-workspace`** (no artifact-action
API, live browser, or platform session available here; never invent a hash).

What IS verifiable is the 2026-10-13 source export
(`goals/research-terminal/hidden_files/source-export-2026-10-13/`), whose
core files were verified byte-identical to the deployed artifact's export
(`pilot/TERMINAL-RUNTIME-EVIDENCE-2026-10-14.md`), and whose hashes are also
recorded in the frozen comparison manifest v2.0.0's `operational_rules`
`source_files`. The operational rule semantics below are grounded in these
files; all hashes re-verified on disk 2026-10-14 (see §3).

## 2. Mapping assertion

`paper-pilot-v2.1.0` (deployed paper machinery) is mapped to comparison
`v2.1.5` (active measurement freeze) for prospective collection under the
post-freeze cutoff `2026-10-14T04:57:00Z` (carried from v2.1.0). The mapping
holds IFF every source/build hash verifies (§3) AND every operational rule
below asserts COMPATIBLE (§4). Any DIVERGENT rule REJECTS the mapping with
the named reason documented in §5.

## 3. Source/build hashes (recomputed 2026-10-14, all verified)

### 3.1 Deployed-side operational sources (paper-pilot-v2.1.0 rule definitions)

These are the files the six operational rules below are defined in. Hashes
match the source export's `hashes.txt` AND the v2.0.0 frozen manifest's
recorded `source_files` (where recorded).

| File (workspace path) | sha256 | Matches export hashes.txt | Recorded in frozen manifest |
|---|---|---|---|
| `paper-signals/entry-v1/src/contract.ts` | `15853721301ccd13893f99e9c5e6751fb448aeadb7da6141dab7bad7c18cca42` | yes | v2.0.0 operational_rules |
| `paper-signals/entry-v1/src/entry-rules.ts` | `9874a0810b02c90ec457f88f4fcccb427ce47caa377f1c0279314d06f932eb53` | yes | v2.0.0 operational_rules |
| `paper-signals/entry-v1/src/feed.ts` | `68b5558eb67fcecd2a0ab6d91173e3911b272c94214ba7f6f65bdd415b974784` | yes | v2.0.0 operational_rules |
| `paper-signals/entry-v1/src/legacy.ts` | `adeb94b6b54dda33004cda8cdddc9fcd6f8212e1a0cd87ab65e2ee4c5e700792` | yes | — |
| `paper-signals/entry-v1/src/levels.ts` | `5bd21b1d71d9fae5443cce6ad10bcb1fe3e0ff868baa94c6523bb872cce528bb` | yes | v2.0.0 operational_rules |
| `paper-signals/entry-v1/src/pending.ts` | `5624a9b1ffee8e7071ef0340e2f8b4aa1e75f74f8fbd44179a45c47d503da3c1` | yes | v2.0.0 operational_rules |
| `paper-signals/entry-v1/src/watcher.ts` | `b27d715d7054386d85daf349a71468c7e1dfa2d4ca69c340f65a53435a912b07` | yes | v2.0.0 operational_rules |
| `paper-signals/veto/src/veto.ts` | `ae38b6b1ddb933033dfa70e7bf375e403d134e24f75e9b57e60ff6b78a3ae478` | yes | v2.0.0 operational_rules (via waiting-interval chain) |
| `paper-signals/veto/src/waiting-interval.ts` | `4035f95c8a02f66d2e69fb942969b2daa11154903fd7ee169333e803cd9f3c40` | yes | v2.0.0 operational_rules |
| `paper-signals/orchestrator/src/issuance/handler.ts` | `b43a788047ebb234d3c996595a9612cda60f1acd69adba25eb8bf8d8746b393b` | yes | v2.0.0 operational_rules (venue_mapping) |

Deployed running backend code sha256: **`unverifiable-from-workspace`**
(platform-hosted; no artifact-action API available to this workspace).
The self-reported freeze/production/challenger hashes in §1.1 are the only
build identifiers on record for the running code.

### 3.2 Comparison side (v2.1.5) — recorded `executable_hashes` vs on-disk

Manifest: `comparison/freeze-manifest-v2.1.5.json`
(sha256 `829ec2e978d76f3d2bcda467c3ac6b74d22bfbc9ef0851403c2992dfc209dfcc`).
Marker: `comparison/ACTIVE_MANIFEST`
(sha256 `16a488bb87afc477a0d6b270945ec13afd714a3cb1e708ff75294b8578267f95`)
contains exactly `freeze-manifest-v2.1.5.json`.
`harness.EXPECTED_ACTIVE_VERSION == "2.1.5" == manifest_version` (fail-fast on
import). All nine recorded executable hashes verified on disk:

| File | Recorded in v2.1.5 manifest | On disk | Verdict |
|---|---|---|---|
| `comparison/harness.py` | `229ca493e60d325237d16c23244583c44053c8558a72d76f6f4395cd7fdae147` | same | MATCH |
| `comparison/collect_pilot_rows.py` | `af2cba2d4c180d6498ec39f40a1255b022017d57439027902eac269305123b0b` | same | MATCH |
| `comparison/live_paper_stream.py` | `0f6393006d935c82d4b3d841aa23faec8adb18e860e006b16d4ab07a42b04836` | same | MATCH |
| `comparison/tests/test_harness.py` | `d8a3e9bfbb91867a989e5caca630c8c054193affb97720175453a360c2f36990` | same | MATCH |
| `comparison/tests/test_collector.py` | `c17a6a0de8b062b2c772a5e9c3cb4ceb00f5528fe4fb2f0845f8a7d7b2b4fd52` | same | MATCH |
| `comparison/tests/test_live_adapter_full.py` | `477562e7c4f47df005a69057865a6f9aab2a811193770248f86e2aa96403a869` | same | MATCH |
| `comparison/tests/test_receipt_expiry_parity.py` | `89de95f8cc49056a99695c954158e820add8cee5317e3e21cf6aa46ef853a144` | same | MATCH |
| `comparison/tests/run_tests.py` | `d3a62c8c78c245692880fc67e27ed8a18189915b0f2e63d9d520d55825ed7cbd` | same | MATCH |
| `comparison/check_reconciliation_v2_1_5.py` | `202a110125dc84f19f89e0b15a959d652372bd46783be4af53a503c66725a3eb` | same | MATCH |

Note: the v2.1.4-era finding from the superseded hash-mapping doc (harness.py
edited after the v2.1.4 freeze, manifest hash stale) is resolved by v2.1.5:
the v2.1.5 manifest was frozen AFTER the receipt-expiry executable change and
records the current hashes.

## 4. Operational-rule compatibility, rule by rule

For each rule: deployed-side behavior → comparison-side behavior → verdict.
The v2.1.5 manifest scope explicitly states the v2.1.5 amendment changed
nothing about "prediction weights, factor sets, scoring formulas, level
construction, asserted rules 1-6, the operational evaluator's other gates,
the decision-time rule, the collection window, row data" — the frozen
operational rules below (carried forward from v2.0.0) are therefore the
comparison side's rules.

### R1 — Entry contract (`actionable-entry-v1` fields) — COMPATIBLE

- **Deployed:** `entry-v1/src/contract.ts`, `CONTRACT_VERSION =
  "actionable-entry-v1"`. Fields: decisionAt (information-cutoff commit
  instant), sourceObservedAt, sourceObservationWindow, entryWindowOpensAt /
  entryWindowExpiresAt, entryPrice / entryObservedAt / entryReceivedAt /
  driftObservedPct / entryEvidence (pending contracts carry these EXPLICITLY
  null), issuedAt (≥ decisionAt). Entry rules per terminal: equity
  `next-xnys-regular-session-open-print`, crypto
  `first-post-decision-binance-spot-trade` (buildContract throws on
  terminal/rule mismatch). Timestamp ordering enforced:
  decisionAt ≤ issuedAt ≤ entryObservedAt ≤ entryReceivedAt (violations throw
  ContractError). Anti-fabrication: enterContract THROWS if evidence
  "unavailable" carries a price; only `venue-trade` or `cost-adjusted-quote`
  may carry entryPrice. Terminal states:
  pending → entered | void_drift | void_expired | void_no_quote. Voided
  contracts are logged non-entries, excluded from the accuracy cohort, never
  scored as MISS.
- **Comparison:** `comparison/harness.py` `operational_issuance_eval` §1
  implements the same contract: evidence must be in
  `("venue-trade", "cost-adjusted-quote")`; price > 0 and
  observed_at/received_at required; the same timestamp ordering enforced
  (fail-closed "time-incoherent"); crypto entry window
  [decisionAt, decisionAt+15 min] (`OP_CRYPTO_ENTRY_WINDOW_MINUTES = 15`
  vs entry-rules.ts `cryptoEntryWindowMinutes: 15`); 5-min observation-age
  bound (`OP_MAX_OBSERVATION_AGE_MS = 300000` vs `maxObservationAgeMs: 5 *
  60_000`); drift caps `OP_CRYPTO_DRIFT_CAP_PCT = 1.5` /
  `OP_EQUITY_DRIFT_CAP_PCT = 0.5` (vs `cryptoDriftCapPct: 1.5` /
  `equityDriftCapPct: 0.5`). The adapter's five nested blocks (`contract`,
  `entry_observation`, `frozen_levels`, `gate_inputs`,
  `waiting_interval_evidence`) carry the full repaired-handler record
  through the collector (`fold_full_record`, 69-column schema untouched).
  The frozen v2.0.0 `operational_rules.entry_contract` (carried forward)
  records the identical contract_version, fields, per-terminal entry rules,
  window, drift caps, age bound, anti-fabrication, and terminal states.
- Boundary (documented, not a divergence): the equity XNYS calendar check is
  pipeline-side on both sides; the harness requires a post-decision print
  and does not re-derive the session calendar.

### R2 — Waiting-interval veto semantics — COMPATIBLE

- **Deployed:** `veto/src/waiting-interval.ts` — `checkWaitingInterval`
  grades the genuine `[contract.decisionAt, entryObservedAt]` interval
  (entryAt < decisionAt throws — time-incoherent, never guessed). Setup
  history: bars ending ≤ cutoff (min(preDecisionAt, decisionAt)) are
  FEATURES, never stop-outs. A touch is a touch: any adverse extreme
  touching the FINAL published stop in the interval invalidates (fail).
  Straddling candles: definite pass only if the whole-bar extreme provably
  could not have crossed, else UNCERTAIN (fail-closed; the pre-event portion
  is never a definite breach). Null/incoherent OHLC → UNCERTAIN. No
  post-decision bars → UNCERTAIN, except the equity overnight gap (no bars
  BY CONSTRUCTION → pass with explicit reason). Granularity rank
  (`GRANULARITY_RANK`): session=1, intraday=2, forming_candle=3,
  trade_print=4, quote=5; required rank: equity "session", crypto
  "intraday". Deliberately NO decision→entry invalidation at qualification
  time (`runQualificationChecks`): the interval does not exist yet.
- **Comparison:** `harness.py` §2 implements the same semantics line for
  line: cutoff = min(detected_at, decision_at); features = bars with
  end ≤ cutoff; window bars = start < entry_at AND end > decision_at;
  `OP_GRANULARITY_RANK` identical values (session 1, intraday 2,
  forming_candle 3, trade_print 4, quote 5); required rank session for
  equity / intraday for crypto; equity overnight gap → pass with the same
  "no bars by construction" reason; straddling → uncertain unless the
  whole-bar extreme is provably safe; null/incoherent → uncertain; no bars
  → uncertain (equity pass); "a touch is a touch" against the FINAL
  published stop (fail → `abstain:waiting-interval-invalidation`).

### R3 — Venue mapping — COMPATIBLE

- **Deployed:** `entry-v1/src/entry-rules.ts`
  `ENTRY_VENUE_ACCEPTED_PRINT_LABELS`:
  `"primary-listing-consolidated-tape" → ["consolidated-tape",
  "primary-listing-consolidated-tape"]`;
  `"binance-spot" → ["binance-spot"]`.
  Unknown entryVenue → exact-label fallback (fail-closed against unlisted
  venues). Consumed at `orchestrator/src/issuance/handler.ts:719`:
  `acceptedPrintVenues(pending.entryVenue)` — non-accepted prints are
  SKIPPED (never entered). Anti-cross-venue: a wrong-venue print is not the
  contract's entry even if the price is inside the drift cap.
- **Comparison:** `harness.py` `OP_ENTRY_VENUE_ACCEPTED_PRINT_LABELS` is
  the identical mapping (same two rows, same accepted labels);
  `OP_ENTRY_VENUE_ACCEPTED_PRINT_LABELS.get(entry_venue, (entry_venue,))`
  is the same exact-label fallback; a wrong-venue print →
  `("fail", REASON["entry-venue"], ...)` (`abstain:entry-venue`).

### R4 — Level construction / invalidation immutability — COMPATIBLE

- **Deployed:** `entry-v1/src/levels.ts` — explicit rebuild policy; the v1
  rule is `freeze-at-decision`: published levels === decision-time levels.
  `publishDecisionLevels` deep-freezes decision-time levels;
  `withRefreshedQuote` returns a NEW package with the SAME frozen levels
  reference (a refreshed quote never silently moves the invalidation).
  `validatePublishedLevels` replays the declared rule from recorded inputs
  and FAILS LOUDLY on mismatch (the check that catches the buildAtrLevels
  silent-rebuild bug: tested stop ≠ published stop). `auditVetoStopAlignment`:
  the stop the issuance veto TESTED must equal the stop the ledger
  PUBLISHES. Risk math: crypto riskPerUnit = 1.25 × Wilder ATR-14
  (canonical decision-time bars, complete window); invalidation = entry ∓
  riskPerUnit by direction; target1 = ±1.5R, target2 = ±2.5R; equity:
  invalidation = 2.00 × Wilder ATR-14, targets 1.5R/2.5R.
- **Comparison:** the frozen v2.0.0 `operational_rules.level_construction`
  (carried forward — v2.1.5 scope explicitly states level construction did
  not change) records the same immutability, the same `freeze-at-decision`
  v1 rule, the same `validatePublishedLevels` loud failure, the same
  veto-stop alignment audit, and the same risk math. The harness's
  waiting-interval veto grades against "the FINAL published stop"
  (the `invalidation` parameter); the adapter's `frozen_levels` block
  preserves decision-time levels through collection.

### R5 — Evaluator version (crypto v5-corrected / equity 3.3.0) — COMPATIBLE

- **Deployed:** frozen evaluator configurations in the source export —
  crypto: `research/phase2a1/closure-v3-real-market/executable-freeze.json`
  (`phase2a1-executable-freeze-v3-closure`), equity:
  `research/config/PHASE2A1-CLOSURE-V2-FREEZE.json`
  (correctedEngine `3be88f04c9cfb3aa4cb53045deac7f4fbf12cc32d1aa8161cc7ab15e40da7a52`).
  The paper pilot itself never grades outcomes (paper signals only; voided
  contracts are non-entries) — outcomes are graded forward by the
  comparison harness under the frozen versions.
- **Comparison:** frozen v2.0.0 `operational_rules.corrected_evaluator`
  (carried forward; v2.1.5's `immutability_rule` names "evaluator version"
  as requiring a NEW manifest version on any change, and v2.1.5's scope
  states nothing about the evaluator changed) records:
  crypto `crypto-evaluation-v5-corrected` — first-touch barrier walk,
  invalidation-first MISS / target1-first HIT / same-block double-touch
  AMBIGUOUS (excluded from hit rate), issuance-straddling touch →
  TIMING-UNVERIFIED (terminal), uncertainty-terminal hard rule, 30 elapsed
  days, 18 bps roundtrip net of costs, funding unverified; equity
  `equity-eval-3.3.0` — same barrier semantics on daily bars, CE-002
  same-day TIMING-UNVERIFIED, 30 trading sessions, 3.2.0 cost convention.
  The harness notes rows are "graded forward under the frozen evaluator
  versions". Both sides reference the identical evaluator versions.

### R6 — Receipt-expiry rule (`received_at > window_end → expired`) — COMPATIBLE

- **Deployed:** `orchestrator/src/issuance/handler.ts` — `lateReceiptVoid`:
  after every venue fetch the clock is re-read; `if (receiptMs >
  expiresMs) return lateReceiptVoid(receiptMs)` where expiresMs is the
  contract's `entryWindowExpiresAt`. Result: `voidContract(pending,
  {entryState: "void_expired", ...})`, outcome `"expired"`. The code comment
  cites the expert's minute-16 counterexample: a print observed in-window
  (minute 14) but received after the window closed (minute 16) is
  historical reconstruction, never entered.
- **Comparison:** `harness.py` (v2.1.5 executable amendment, receipt-expiry
  parity): crypto branch — `if received_at > window_end: return ("fail",
  REASON["entry-expired"], ...)` where `REASON["entry-expired"] =
  "abstain:entry-expired"`. The v2.1.5 manifest `changed_fields` documents
  this explicitly: "received_at > window_end -> ('fail',
  'abstain:entry-expired'), matching the issuance handler's lateReceiptVoid
  -> void_expired (orchestrator/src/issuance/handler.ts). Dual-path
  agreement test asserts identical (verdict, reason_code) on both paths."
  `tests/test_receipt_expiry_parity.py` runs both paths on shared fixtures
  (canonical obs-14/rec-16 → REJECT both; boundary cases → identical
  verdicts) — a live cross-language proof of R6 parity, recorded in the
  v2.1.5 manifest's `executable_hashes`.
- Boundary (documented, not a divergence): the explicit receipt-time
  window check in the harness sits in the crypto branch (the self-contained
  15-min window). Equity's entry window expiry is contract-level
  (`entryWindowExpiresAt`, set by the pipeline's XNYS calendar); the
  deployed handler applies the same `lateReceiptVoid` rule against it, and
  the adapter preserves the contract block (including void state) through
  collection — the comparison side consumes the pipeline's verdict rather
  than re-deriving the session calendar.

## 5. Rejection rule

If any hash in §3 fails to recompute, or any rule in §4 asserts DIVERGENT,
the mapping is REJECTED — not graded, not qualified — with the named reason:

- Hash failure: `mapping-rejected:hash-mismatch:<relative-path>`
- Rule failure: `mapping-rejected:rule-divergence:<rule-name>`
  where `<rule-name>` ∈ `entry-contract`, `waiting-interval-veto`,
  `venue-mapping`, `level-construction`, `evaluator-version`,
  `receipt-expiry`.

### Exact check that produces each rejection

| Rule | Check (what must hold; failure → the named rejection) |
|---|---|
| entry-contract | `contract.ts` `CONTRACT_VERSION == "actionable-entry-v1"`; harness `OP_CRYPTO_ENTRY_WINDOW_MINUTES == 15 == entry-rules.ts cryptoEntryWindowMinutes`; `OP_MAX_OBSERVATION_AGE_MS == 300000 == entry-rules.ts maxObservationAgeMs`; drift caps 1.5/0.5 equal on both sides; `OP_ENTRY_EVIDENCE_KINDS == ("venue-trade", "cost-adjusted-quote")`; v2.1.5 manifest scope records no entry-contract change |
| waiting-interval-veto | harness `OP_GRANULARITY_RANK` dict == veto.ts `GRANULARITY_RANK` dict exactly (5 ranks, same values); required rank session(equity)/intraday(crypto) on both sides; harness grades the genuine [decisionAt, entryObservedAt] against the final published stop |
| venue-mapping | harness `OP_ENTRY_VENUE_ACCEPTED_PRINT_LABELS` == entry-rules.ts `ENTRY_VENUE_ACCEPTED_PRINT_LABELS` row-for-row; handler.ts consumes `acceptedPrintVenues(pending.entryVenue)`; fallback = exact-label fail-closed on both sides |
| level-construction | levels.ts names `freeze-at-decision` as the policy with `validatePublishedLevels` loud failure; v2.1.5 manifest scope records no level-construction change; harness waiting-interval veto grades the final published stop |
| evaluator-version | v2.0.0 `operational_rules.corrected_evaluator` records `crypto-evaluation-v5-corrected` / `equity-eval-3.3.0`; v2.1.5 `immutability_rule` names evaluator version as version-bump-triggering; v2.1.5 scope records no evaluator change |
| receipt-expiry | handler.ts contains `lateReceiptVoid` + `receiptMs > expiresMs` → `entryState: "void_expired"`; harness contains `received_at > window_end` → `("fail", "abstain:entry-expired")`; canonical fixture (crypto, observed min 14, received min 16) evaluates to exactly `("fail", "abstain:entry-expired")` on the harness path; v2.1.5 manifest `changed_fields` documents the parity |

The regression test `comparison/tests/test_version_mapping.py` re-runs all
of §3 and §4 on every invocation and FAILS loudly (with the rejection
reason in the failure message) on any mismatch or drift. It carries a
negative control: a deliberately altered copy of a rule description must
fail its check, so the suite cannot pass vacuously.

## 6. Verdict

`paper-pilot-v2.1.0` ↔ `v2.1.5` mapping: **VALID as of 2026-10-14**.
All 22 recorded hashes recompute; all six operational rules assert
COMPATIBLE; no rule DIVERGENT; no hash marked unverifiable except the
deployed running backend code itself (`unverifiable-from-workspace` —
platform-hosted, expected and documented, not a gap in the mapping).
The two series remain separate: rows are stamped `2.1.5` only.
