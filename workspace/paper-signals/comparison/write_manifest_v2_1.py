#!/usr/bin/env python3
"""Write comparison/freeze-manifest-v2.1.0.json (Decision 3 consolidation).

v2.1.0 is a GOVERNANCE/MEASUREMENT consolidation, not a change to executable
semantics. It closes the measurement audit (MEASUREMENT-GAPS-2026-10-14.md,
whose verdicts are authoritative), supersedes v2.0.0's stale content, and
reconciles the manifest with the executable harness and the collection plan.

Changes from v2.0.0:
  1. REMOVED the old born-dead gate from the production crypto model's
     issuance-path gates (the legacy pre-decision-extreme veto is superseded
     by the repaired waiting-interval veto). The comparison harness's
     born_dead_check mirror (challenger flipped legs) is unchanged — it is
     frozen comparison-row semantics, not the live issuance veto.
  2. REMOVED the "continue collecting until N" criteria (the n>=30 gate and
     the INCONCLUSIVE "continue collecting" clause). Collection is
     window-based only (2026-10-14 -> 2026-12-31, readout regardless of N).
  3. REMOVED disagreement-as-bug wording: direction disagreement >40% is an
     AUDIT TRIGGER (four-part audit, written finding), never proof of a bug.
  4. REAL parameter hashes: the v2.0.0 challenger parameter_hash was the
     placeholder "sha256:derived-from-production-minus-momentum-1.5". v2.1.0
     records the real SHA-256 of the files that actually define each model's
     parameters, and explicitly states where no standalone parameter file
     exists.
  5. Encoded the audit's primary economic comparison (genuine abstention =
     0.000 R real zero; never-evaluated = UNKNOWN, counted/labeled/excluded;
     both-issued-only is secondary).
  6. Encoded the cohort reporting split (Cohort P crypto paired vs Cohort E
     equity-only, never pooled) and the equity horizon rule (signal date + 47
     calendar days).
  7. Records the UNRESOLVED plan-vs-frozen-horizon conflict (2027-01-30 vs
     2027-02-16) pending Logan's decision.

Carried forward unchanged from v2.0.0: actionable-entry-v1 contract,
waiting-interval veto, venue mapping, level construction, corrected
evaluator, and the four asserted harness rules (by name).
"""
import json
import hashlib
import os
import datetime

BASE = os.path.dirname(os.path.abspath(__file__))
WS = os.path.expanduser("~/workspace")


def sha(rel):
    """rel is relative to ~/workspace."""
    p = os.path.join(WS, rel)
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


H = {
    # actionable-entry-v1 contract + entry rules + levels + watcher (unchanged since v2.0.0)
    "contract.ts": sha("goals/research-terminal/paper-signals/entry-v1/src/contract.ts"),
    "entry-rules.ts": sha("goals/research-terminal/paper-signals/entry-v1/src/entry-rules.ts"),
    "levels.ts": sha("goals/research-terminal/paper-signals/entry-v1/src/levels.ts"),
    "watcher.ts": sha("goals/research-terminal/paper-signals/entry-v1/src/watcher.ts"),
    "feed.ts": sha("goals/research-terminal/paper-signals/entry-v1/src/feed.ts"),
    "pending.ts": sha("goals/research-terminal/paper-signals/entry-v1/src/pending.ts"),
    # issuance veto (unchanged since v2.0.0)
    "waiting-interval.ts": sha("goals/research-terminal/paper-signals/veto/src/waiting-interval.ts"),
    "veto.ts": sha("goals/research-terminal/paper-signals/veto/src/veto.ts"),
    # venue-mapping consumption point (unchanged since v2.0.0)
    "handler.ts": sha("goals/research-terminal/paper-signals/orchestrator/src/issuance/handler.ts"),
    # crypto model parameter sources
    "crypto-signal-methodology.ts": sha("ts-spaces/altcoin-analyzer-and-signal-tracker/server/src/signal-methodology.ts"),
    "crypto-actions.ts": sha("ts-spaces/altcoin-analyzer-and-signal-tracker/server/src/actions.ts"),
    "crypto-schema.ts": sha("ts-spaces/altcoin-analyzer-and-signal-tracker/server/src/schema.ts"),
    # equity model parameter sources (unchanged since v2.0.0)
    "equity-measurement.ts": sha("ts-spaces/equity-analyzer-and-signal-tracker/server/src/measurement.ts"),
    "equity-actions.ts": sha("ts-spaces/equity-analyzer-and-signal-tracker/server/src/actions.ts"),
    "equity-schema.ts": sha("ts-spaces/equity-analyzer-and-signal-tracker/server/src/schema.ts"),
    "methodology-crypto.md": sha("goals/research-terminal/hidden_files/methodology-export-2026-10-13/methodology-crypto.md"),
    "methodology-equity.md": sha("goals/research-terminal/hidden_files/methodology-export-2026-10-13/methodology-equity.md"),
    # C-2 parameter sources (real hashes replace the v2.0.0 placeholder)
    "c2-shadow-spec.md": sha("goals/research-terminal/paper-signals/research/c2-shadow-spec-2026-10-13.md"),
    "c2-shadow-harness.py": sha("goals/research-terminal/paper-signals/research/c2_shadow_harness.py"),
    "challenger-assessment.md": sha("goals/research-terminal/hidden_files/source-export-2026-10-13/CHALLENGER-ASSESSMENT.md"),
    # corrected evaluator semantics (unchanged since v2.0.0)
    "grade-corr2-crypto.py": sha("goals/research-terminal/hidden_files/signal-accuracy/grade-2026-10-13-corr2.py"),
    "replay-equity-corr.py": sha("goals/research-terminal/hidden_files/signal-accuracy/replay-equity-2026-10-13-corr.py"),
    # comparison harness (current executable, with the four asserted RULES 1-4)
    "harness.py": sha("goals/research-terminal/paper-signals/comparison/harness.py"),
    # comparison metrics (implements the audit's primary comparison)
    "metrics.py": sha("goals/research-terminal/paper-signals/comparison/metrics.py"),
}

ENTRY_CONTRACT = {
    "contract_version": "actionable-entry-v1",
    "contract_fields": {
        "decisionAt": "ISO-8601 UTC -- the information-cutoff commit instant (authoritative decision time).",
        "sourceObservedAt": "venue/provider observation instant of the decision reference price. DISTINCT from decisionAt: decisionAt is when the decision was committed; sourceObservedAt is when the provider observed the price the decision references. Null only under the degraded rule (crypto fallback path only; equity contracts REQUIRE non-null).",
        "sourceObservationWindow": "optional {start, end} bounding the observation interval.",
        "entryObservedAt": "venue timestamp of the entry print (the print's own clock).",
        "entryReceivedAt": "server receipt time of the entry print (staleness audit).",
        "issuedAt": "server time of contract write; MUST be >= decisionAt."
    },
    "timestamps_ordering": "entry print must satisfy decisionAt <= issuedAt <= entryObservedAt <= entryReceivedAt; violations throw ContractError (entry-before-decision, observation-before-issuance, receipt-before-observation).",
    "entry_rule": {
        "equity": "next-xnys-regular-session-open-print",
        "crypto": "first-post-decision-binance-spot-trade",
        "note": "buildContract enforces the per-terminal rule; a mismatch throws."
    },
    "entry_window": {
        "crypto": "entryWindowOpensAt = decisionAt; entryWindowExpiresAt = decisionAt + 15 min (cryptoEntryWindowMinutes; explicit UngroundedParam, ENTRY-SEMANTICS.md 6.2). Prints outside the window are never entered (void_expired).",
        "equity": "next regular XNYS session open; after-hours excluded (equityAfterHoursExcluded=true, explicit param)."
    },
    "drift_limit": "driftCapPct: 0.50 equity | 1.50 crypto (explicit UngroundedParams, ENTRY-SEMANTICS.md 6.1). |drift| beyond the cap -> void_drift; a drifted print is never entered.",
    "observation_age_limit": "maxObservationAgeMs = 5 min (cryptoEntryWindowMinutes/3, ENTRY-SEMANTICS.md 6.5). The entry rule demands the FIRST post-decision print observed LIVE; a print older than 5 min at receipt time is historical reconstruction, not an actionable entry -- prints older than this bound are SKIPPED (never entered).",
    "anti_fabrication": "a contract may only carry entryPrice when evidence is a subsequent observable bid/ask (venue-trade) or an explicitly cost-adjusted quote (cost-adjusted-quote). With evidence 'unavailable', entryPrice MUST stay null -- a fill price is never invented. enterContract REJECTS by THROWING ContractError (never a soft rejection); every rejection carries a machine-readable ENTRY_REJECTION_REASON code.",
    "terminal_states": "pending -> entered | void_drift | void_expired | void_no_quote. Voided contracts are logged non-entries: excluded from the accuracy cohort, never scored as MISS. States are terminal.",
}

WAITING_INTERVAL_VETO = {
    "repair": "GAP-4 (expert, 2026-10-13): the old issuance veto graded [detectedAt, handlerStart] -- actually PRE-decision setup history -- while the real waiting interval [contract.decisionAt, entryObservedAt] was never veto-checked. The repair splits the veto across its two real timestamps.",
    "setup_history_filter": {
        "function": "checkSetupHistory",
        "semantics": "Bars entirely before the pre-decision cutoff (endAt <= preDecisionAt, clamped to <= decisionAt) are classified as setup-history FEATURES. A pre-decision extreme that crossed the final published stop is RECORDED (detail.historicalCrosses) -- evidence ABOUT how the setup formed, NEVER a stop-out against it. Yesterday's stop crossing cannot veto a new setup. This check NEVER fails: classificatory, not a veto."
    },
    "decision_to_entry_invalidation": {
        "function": "checkWaitingInterval",
        "window": "[contract.decisionAt, entryObservedAt] -- the genuine waiting interval. entryAt < decisionAt throws (time-incoherent interval; never guess).",
        "semantics": "A touch is a touch: any adverse extreme TOUCHING the final published stop in the waiting interval invalidates the setup (fail). Per-bar handling (inherited from checkSetupInvalidation, fail-closed): bar entirely before decisionAt -> feature (never veto); bar straddling decisionAt or entryAt -> definite pass only if the whole-bar extreme provably could not have crossed; otherwise UNCERTAIN/fail-closed (the pre-event portion is never treated as a definite breach and cannot be isolated from OHLC); bar fully post-decision -> normal extreme check; null/incoherent OHLC -> UNCERTAIN; no post-decision bars -> UNCERTAIN ('issuance-validation unavailable'), except the equity overnight gap (session-close -> next-open carries no bars BY CONSTRUCTION: allowEmptyInterval=true passes with the explicit reason 'no bars by construction', never uncertain). Forming candles are admitted (provisional) so an immediate entry needs no completed candle.",
        "separation": "The result's checks carry the setup-history filter and the decision->entry invalidation as SEPARATE check entries, so a reader can see which question failed."
    },
    "qualification_time": "runQualificationChecks (issuance time, entry not yet observed): pipeline-order guard (the veto must grade the FINAL published stop) + setup-history filter + entry-zone rules. Deliberately NO decision->entry invalidation at qualification -- the waiting interval does not exist yet; it is graded by checkWaitingInterval at entry observation. Uncertain fails closed.",
    "superseded_on_issuance_path": "The legacy born-dead veto (pre-decision setup-history extremes graded as stop-outs against the new setup) is SUPERSEDED on the live issuance path by this repair: pre-decision extremes are features, never vetoes; only the genuine decision->entry interval can invalidate. The comparison harness's born_dead_check mirror (challenger flipped legs, harness.py) is frozen comparison-row semantics -- it is NOT the live issuance veto and must not be read as one."
}

VENUE_MAPPING = {
    "rule": "ENTRY_VENUE_ACCEPTED_PRINT_LABELS (entry-rules.ts:83): contract entryVenue -> accepted print venue labels. A TradePrint's venue label MUST be in the accepted set for the contract's entryVenue, or the print is SKIPPED (never entered). Anti-cross-venue: an entry observed on the wrong venue is not the contract's entry, even if the price is inside the drift cap.",
    "accepted_labels": {
        "primary-listing-consolidated-tape": ["consolidated-tape", "primary-listing-consolidated-tape"],
        "binance-spot": ["binance-spot"]
    },
    "fallback": "Unknown entryVenue values fall back to exact-label match (fail-closed against unlisted venues).",
    "consumption": "orchestrator/src/issuance/handler.ts:719 -- acceptedPrintVenues(pending.entryVenue); non-accepted prints skipped."
}

LEVEL_CONSTRUCTION = {
    "decision_time_immutability": "The thesis invalidation published at decision time is IMMUTABLE. publishDecisionLevels deep-freezes decision-time levels; withRefreshedQuote returns a NEW package with the refreshed quote but carries the SAME frozen levels reference -- a refreshed quote never silently moves the invalidation.",
    "rebuild_policy": "Explicit, named, validated choice. 'freeze-at-decision' (v1 rule): published levels === decision-time levels. 'rebuild-around-entry': levels mechanically rebuilt around the actual entry price with the SAME atr14 + riskMultiplier + direction; rebuild inputs and outputs both recorded. The v1 rule for the comparison is freeze-at-decision.",
    "validator": "validatePublishedLevels(policy, decision, published, entryPrice) replays the declared rule from the recorded inputs and FAILS LOUDLY (LevelMismatchError) on any mismatch -- the check that would have caught the buildAtrLevels silent-rebuild bug (tested stop != published stop).",
    "veto_stop_alignment": "auditVetoStopAlignment: the stop the issuance veto TESTED must equal the stop the ledger PUBLISHES; fails loudly otherwise.",
    "risk_math": "crypto: riskPerUnit = 1.25 x Wilder ATR-14 (canonical, decision-time bars, complete window); invalidation = entry -/+ riskPerUnit by direction; target1 = entry +/- 1.5 x riskPerUnit; target2 = entry +/- 2.5 x riskPerUnit. equity: invalidation = 2.00x Wilder ATR-14 from the reference entry; targets 1.5R / 2.5R."
}

CORRECTED_EVALUATOR = {
    "crypto": {
        "evaluator_version": "crypto-evaluation-v5-corrected",
        "basis": "First-touch barrier walk on 4h CoinGecko OHLC (candle-close timestamps; block covers [T-4h, T)). Interval-level, timestamp-aware (grade-2026-10-13-corr2.py semantics).",
        "barrier_semantics": "invalidation-first -> invalidated/MISS; target1-first -> target/HIT; both levels touched in one clean block -> AMBIGUOUS (excluded from hit rate).",
        "issuance_boundary": "block with close_ts <= issuance -> pre-entry, SKIPPED. Block with open_ts < issuance < close_ts -> STRADDLING: any touch inside it is TIMING-UNVERIFIED (terminal -- the touch cannot be ordered against issuance from OHLC).",
        "uncertainty_hard_rule": "Uncertainty once established is terminal. A later block NEVER erases uncertainty about an earlier overlapping touch. The walk STOPS at the first touch-or-uncertainty event.",
        "horizon_cap": "30 elapsed days primary; checkpoints d5/d14/d30. Rows still open past the cap exit at the cap (time_exit).",
        "costs": "18 bps round-trip modeled; funding UNVERIFIED (production convention). Net R = gross R - 18 bps."
    },
    "equity": {
        "evaluator_version": "equity-eval-3.3.0",
        "basis": "First-touch barrier walk on Yahoo daily bars from the signal date.",
        "barrier_semantics": "same as crypto (invalidation-first MISS / target1-first HIT / same-bar double-touch AMBIGUOUS).",
        "timing_unverified": "CE-002: same-day HIT/MISS verdicts where intraday touch order is unknowable from daily bars are TIMING-UNVERIFIED and removed from definitive HIT/MISS totals (replay-equity-2026-10-13-corr.py).",
        "horizon_cap": "30 trading sessions primary; checkpoints 5/14/30 sessions.",
        "horizon_calendar_rule": "Equity outcome deadline = signal date + 47 calendar days (see 'equity_horizon' section).",
        "costs": "costs modeled per equity-eval-3.2.0 convention (unchanged); crypto 18 bps convention does not apply to equity rows."
    },
    "note": "The deployed engine's own evaluation method (crypto-evaluation-v4-cohort-contract) settled ZERO outcomes independently (expert evidence package 2026-10-13: its 'unverified' label is terminal with no path to resolved). The comparison grades forward under the CORRECTED evaluators above, not the deployed engine's marks."
}

OPERATIONAL_SOURCE_FILES = [
    {"path": "goals/research-terminal/paper-signals/entry-v1/src/contract.ts", "sha256": H["contract.ts"], "role": "frozen contract schema, state machine, rejection codes"},
    {"path": "goals/research-terminal/paper-signals/entry-v1/src/entry-rules.ts", "sha256": H["entry-rules.ts"], "role": "per-terminal entry rules, drift caps, 5-min observation-age bound, venue mapping"},
    {"path": "goals/research-terminal/paper-signals/entry-v1/src/feed.ts", "sha256": H["feed.ts"], "role": "TradePrint / VenueFeed types (venue-stamped prints)"},
    {"path": "goals/research-terminal/paper-signals/entry-v1/src/levels.ts", "sha256": H["levels.ts"], "role": "publishDecisionLevels, withRefreshedQuote, derivePublishedLevels, validatePublishedLevels, auditVetoStopAlignment, buildAtrLevels"},
    {"path": "goals/research-terminal/paper-signals/entry-v1/src/pending.ts", "sha256": H["pending.ts"], "role": "pending-contract entry observation path"},
    {"path": "goals/research-terminal/paper-signals/entry-v1/src/watcher.ts", "sha256": H["watcher.ts"], "role": "live entry watcher (poll cadence strictly finer than entry window)"},
    {"path": "goals/research-terminal/paper-signals/veto/src/veto.ts", "sha256": H["veto.ts"], "role": "checkSetupInvalidation (straddle/granularity/fail-closed), checkEntryZone, validatePipelineOrder"},
    {"path": "goals/research-terminal/paper-signals/veto/src/waiting-interval.ts", "sha256": H["waiting-interval.ts"], "role": "timestamp-alignment repair: checkSetupHistory, checkWaitingInterval, runQualificationChecks"},
    {"path": "goals/research-terminal/paper-signals/orchestrator/src/issuance/handler.ts", "sha256": H["handler.ts"], "role": "integrated issuance path: ownership checks, corrected veto consumption, venue filter on the live entry path"},
]

CRYPTO_FACTORS = [
    {"label": "Trend cluster", "weight": 2.5, "score_rule": "votes: price>=SMA50, price>=SMA200, d90>+8%; score=sign(sum); 0 unless >=200 obs", "source": "CoinGecko daily history"},
    {"label": "Momentum", "weight": 1.5, "score_rule": "RSI-14: >72 -> -1; <30 -> +1; >=52 -> +1; <=45 -> -1; else 0", "source": "CoinGecko daily history"},
    {"label": "MACD", "weight": 1.5, "score_rule": "macd >= signal -> +1 else -1", "source": "CoinGecko daily history"},
    {"label": "Perp funding crowding", "weight": 1.75, "score_rule": "funding8h > +0.00005 -> -1; < -0.00005 -> +1; else 0", "source": "Hyperliquid (hourly x8) or OKX fallback"},
    {"label": "Open interest", "weight": 1.0, "score_rule": "OKX OI 24h change: >+8% -> +1; <-8% -> -1; else 0", "source": "OKX OI + 24h baseline"},
    {"label": "Binance futures positioning", "weight": 1.0, "score_rule": "taker buy/sell >1.05 -> +1; <0.95 -> -1; else 0", "source": "Binance Futures"},
    {"label": "Cross-venue taker imbalance", "weight": 1.25, "score_rule": "continuous: margin<0.04 -> 0 else sign(combined)*min(1,margin/0.35)*sizeScale*(agreement?1:0.5)", "source": "Binance aggTrades + OKX spot trades"},
    {"label": "TVL trend", "weight": 2.0, "score_rule": "tvl30>0 && tvl7>=-2 -> +1; tvl30<-15 -> -1; else 0", "source": "DeFiLlama"},
    {"label": "Revenue linkage", "weight": 1.5, "score_rule": "annualized revenue yield >=1.5% -> +1; else 0 (never negative)", "source": "DeFiLlama 30D fees+revenue"},
    {"label": "Developer velocity", "weight": 1.5, "score_rule": ">=8 active wks && >=50 commits/12w -> +1; <=2 active wks -> -1; else 0", "source": "GitHub commit activity"},
    {"label": "Supply-overhang penalty", "weight": 1.5, "score_rule": "FDV/mcap >=2 -> -1; else 0 (never positive)", "source": "CoinGecko"},
]

CANON_LABEL_MAP = {
    "note": "Canonical factor identity for ledger-completeness matching (harness.py _canon_label): the pipeline persists one frozen factor with a scoring-rule annotation in its label -- 'Supply-overhang penalty (negative-only)' -- while the frozen manifest records it as 'Supply-overhang penalty'. The parenthetical is an annotation, not a different factor (verified: the 10/10 pilot reproduction used ledgers carrying the annotated label). Canonical identity strips a single trailing ' (...)' qualifier, then matches exactly against the frozen set. No two frozen labels collide after this normalization (asserted in harness.py).",
    "manifest_label": "Supply-overhang penalty",
    "persisted_pipeline_label": "Supply-overhang penalty (negative-only)",
    "resolution_function": "_canon_label (harness.py): strip a single trailing ' (...)' qualifier, then exact-match against the frozen set",
    "affected_weight": 1.5,
    "all_other_factors": "manifest label == persisted label (10/11 exact; the discrepancy is this one factor only)"
}

PARAMETER_PROVENANCE = {
    "production_crypto": {
        "standalone_parameter_file": None,
        "statement": "No standalone parameter/weight file (e.g. params.json) exists for the production crypto model. Factor weights and score rules are embedded in code: the 11 dossier add() calls in ts-spaces/altcoin-analyzer-and-signal-tracker/server/src/actions.ts (lines 3475-3499; verified programmatically 2026-10-14: labels/weights match this manifest's factor set exactly), and the scoring formula in ts-spaces/altcoin-analyzer-and-signal-tracker/server/src/signal-methodology.ts (scoreDossierFactors).",
        "parameter_sources": [
            {"path": "ts-spaces/altcoin-analyzer-and-signal-tracker/server/src/signal-methodology.ts", "sha256": H["crypto-signal-methodology.ts"], "role": "scoring formula, levels, evaluation, strategy/version constants; matches v2.0.0 hash (unchanged)"},
            {"path": "ts-spaces/altcoin-analyzer-and-signal-tracker/server/src/actions.ts", "sha256": H["crypto-actions.ts"], "role": "factor definitions (11 dossier add() calls, lines 3475-3499) and issuance decision. POST-V2.0.0 DRIFT: modified 2026-10-14T04:47:56Z, after the v2.0.0 freeze (2026-10-14T04:09:32Z); v2.0.0 recorded 301e270e72a98d1dbcbfcf5d99ce53cc8afb142df77a8c18a514831b2c1a2788. The 11 dossier factor lines carry the frozen labels/weights (verified); the drift is elsewhere in this 5000+ line file and the exact diff is unavailable (no version control). v2.1.0 records the CURRENT hash."},
            {"path": "ts-spaces/altcoin-analyzer-and-signal-tracker/server/src/schema.ts", "sha256": H["crypto-schema.ts"], "role": "persisted signal/contract schema. POST-V2.0.0 DRIFT: hash changed after the v2.0.0 freeze; v2.1.0 records the CURRENT hash."},
            {"path": "goals/research-terminal/hidden_files/methodology-export-2026-10-13/methodology-crypto.md", "sha256": H["methodology-crypto.md"], "role": "read-only methodology export (line references) as of 2026-10-13; matches v2.0.0 hash (unchanged)"}
        ],
        "asserted_constant": "signal-methodology.ts DOSSIER_PARAMETER_HASH = 'sha256:4a098b4d389cb85293c78785c82e88a32fe6d96544a8dd84c341dce9fa0b7220' is an ASSERTED string in code, not a verifiable hash of any on-disk parameter file -- its derivation is opaque. It is carried here as the recorded parameter hash for provenance continuity, superseded as the source of truth by the real file hashes above."
    },
    "challenger_c2": {
        "standalone_parameter_file": None,
        "statement": "No standalone parameter file exists for C-2 either. C-2 is defined DERIVATIVELY: the production factor set minus the RSI-14 Momentum factor (its contribution leaves the net AND its weight 1.5 leaves the denominator; remaining weights NOT rescaled). The derivation is specified in c2-shadow-spec-2026-10-13.md and executed in c2_shadow_harness.py and comparison/harness.py (score_crypto_challenger).",
        "parameter_hash_v2_0_0_placeholder": "sha256:derived-from-production-minus-momentum-1.5 -- this was a PLACEHOLDER, not a real hash. It is retired by v2.1.0.",
        "parameter_sources": [
            {"path": "goals/research-terminal/paper-signals/research/c2-shadow-spec-2026-10-13.md", "sha256": H["c2-shadow-spec.md"], "role": "frozen C-2 shadow spec (10 factors, 15.5 total weight, mirroring rule, guardrail); matches v2.0.0 hash (unchanged)"},
            {"path": "goals/research-terminal/paper-signals/research/c2_shadow_harness.py", "sha256": H["c2-shadow-harness.py"], "role": "executable C-2 scoring (drops Momentum from the persisted ledger)"},
            {"path": "goals/research-terminal/hidden_files/source-export-2026-10-13/CHALLENGER-ASSESSMENT.md", "sha256": H["challenger-assessment.md"], "role": "challenger assessment (S3-S4 readout criteria, flip guardrail); matches v2.0.0 hash (unchanged)"},
            {"path": "ts-spaces/altcoin-analyzer-and-signal-tracker/server/src/signal-methodology.ts", "sha256": H["crypto-signal-methodology.ts"], "role": "per-factor score rules and scoring formula inherited from production"}
        ]
    }
}

manifest = {
    "manifest_version": "2.1.0",
    "frozen_at_utc": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "frozen_by": "workstream v2.1.0 consolidation subagent (Decision 3)",
    "supersedes": {
        "manifest": "freeze-manifest-v2.0.0.json",
        "status": "SUPERSEDED",
        "marker": "goals/research-terminal/paper-signals/comparison/FREEZE-v2.0.0-SUPERSEDED.md",
        "why": [
            "v2.0.0 carried the OLD born-dead gate as a production issuance-path gate; the legacy pre-decision-extreme veto is superseded by the repaired waiting-interval veto (v2.1.0 removes it from the model gates and restates the repaired gates).",
            "v2.0.0 carried target-N criteria (an n>=30 gate and an INCONCLUSIVE clause directing further collection); v2.1.0 removes them -- collection is window-based only, readout regardless of N.",
            "v2.0.0's flip guardrail worded direction disagreement as an implementation-bug signal; v2.1.0 restates it as an AUDIT TRIGGER per COLLECTION-PLAN-2026-10-14 (four-part audit, written finding), never proof of a bug.",
            "v2.0.0's challenger parameter_hash was the placeholder 'sha256:derived-from-production-minus-momentum-1.5'; v2.1.0 records real SHA-256 of the parameter-defining files and the canonical factor-label mapping.",
            "v2.0.0 did not encode the audit's primary economic comparison, the cohort reporting split, or the equity +47-day horizon rule; v2.1.0 encodes all three (MEASUREMENT-GAPS-2026-10-14.md verdicts, authoritative).",
            "Model factor sets, weights, scoring formulas, operational rules (entry contract, veto, venue mapping, level construction, evaluator), and the four asserted harness rules are UNCHANGED from v2.0.0."
        ]
    },
    "immutability_rule": "This manifest is immutable. ANY change to a model's factor list, weights, scoring formula, level construction, gate rules, entry rule, cost model, horizon, decision-time definition, veto semantics, venue mapping, or evaluator version requires a NEW manifest version (2.2.0 or 3.0.0). Never edit this file in place.",
    "audit": {
        "source": "goals/research-terminal/paper-signals/comparison/MEASUREMENT-GAPS-2026-10-14.md",
        "role": "measurement audit (read-only); its verdicts are AUTHORITATIVE for v2.1.0",
        "verdicts_encoded": ["cohort reporting split (Cohort P / Cohort E)", "primary economic comparison (abstain=0.000 R, UNKNOWN accounting)", "equity horizon rule (signal date + 47 calendar days)", "timestamp strict-rule findings (carried as dataset caveats, not manifest changes)"]
    },
    "operational_rules": {
        "note": "BOTH arms (production AND C-2 challenger) use IDENTICAL operational rules. C-2's ONLY model difference is the removal of the Momentum factor (10 factors vs 11; weight totals 15.5 vs 17.0).",
        "entry_contract": ENTRY_CONTRACT,
        "waiting_interval_veto": WAITING_INTERVAL_VETO,
        "venue_mapping": VENUE_MAPPING,
        "level_construction": LEVEL_CONSTRUCTION,
        "corrected_evaluator": CORRECTED_EVALUATOR,
        "source_files": OPERATIONAL_SOURCE_FILES
    },
    "parameter_provenance": PARAMETER_PROVENANCE,
    "canonical_factor_labels": CANON_LABEL_MAP,
    "models": [
        {
            "model_name": "crypto-dossier-factor-agreement",
            "role": "production",
            "terminal": "crypto",
            "strategy_id": "crypto-dossier-factor-agreement",
            "strategy_version": "2.0.0-measurement-contract",
            "parameter_hash": "sha256:4a098b4d389cb85293c78785c82e88a32fe6d96544a8dd84c341dce9fa0b7220",
            "parameter_hash_note": "Asserted constant in signal-methodology.ts (carried for provenance continuity). The verifiable parameter sources are the real file hashes in 'parameter_provenance'.",
            "decision_clock": "server-utc",
            "price_convention": "usd-spot-reference",
            "snapshot_version": "crypto-input-snapshot-v3-canonical-atr-window",
            "entry_convention": "first-post-decision-binance-spot-trade (actionable-entry-v1)",
            "evaluator_version": "crypto-evaluation-v5-corrected",
            "total_weight": 17.0,
            "n_factors": 11,
            "scoring_formula": "usable = factors with finite contribution, finite weight, weight > 0 (walk-forward legacy factor excluded); weightedNet = SUM(contribution); totalWeight = SUM(weight); longScore = round(clamp(50 + (weightedNet/totalWeight)*42, 5, 95)); shortScore = 100 - longScore; direction = longScore >= shortScore ? long : short. NO_DATA -> score 0, never estimated.",
            "levels": {
                "risk_per_unit": "1.25 x Wilder ATR-14 (canonical, decision-time bars, complete window)",
                "invalidation": "entry -/+ riskPerUnit by direction (IMMUTABLE from decision time; validatePublishedLevels)",
                "target1": "entry +/- 1.5 x riskPerUnit",
                "target2": "entry +/- 2.5 x riskPerUnit",
                "payoff_convention": "linear-entry-notional"
            },
            "gates": {
                "issuance_path_gates": "Repaired gates (the live issuance path): (1) runQualificationChecks at qualification -- pipeline-order guard (the veto grades the FINAL published stop) + setup-history filter (pre-decision extremes are FEATURES, never stop-outs) + entry-zone rules; (2) checkWaitingInterval over the genuine [contract.decisionAt, entryObservedAt] at entry observation -- 'a touch is a touch', fail-closed; (3) entry-contract gates (15-min window, drift caps, 5-min observation-age, venue mapping); (4) post-entry invalidation check. The LEGACY born-dead veto (pre-decision setup-history extremes graded as stop-outs) is SUPERSEDED on the issuance path.",
                "eligibility": "no suppression AND sourceAsOf <= 30 min AND price != null AND (meme: $2M<=mcap<=$250M AND socialSnapshot) OR (main: volume24h>=$5M AND mcap>=$25M AND OI>=$1M AND funding != null).",
                "short_regime": "applies to shorts ONLY: allowed iff priceBelowSma50 && (lowerHighs || trend20Negative); else suppressed.",
                "comparison_harness_mirror": "The comparison harness's born_dead_check (mirrored to challenger direction on flipped legs) is frozen COMPARISON-ROW semantics in harness.py -- it is not the live issuance veto and must not be read as one."
            },
            "horizon": {"primary": 30, "checkpoints_days": [5, 14, 30], "unit": "elapsed_days"},
            "cost_bps_roundtrip": 18.0,
            "cost_note": "18 bps round-trip modeled; funding UNVERIFIED (production convention).",
            "cost_scenario_id": "modeled-roundtrip-18bps-funding-unverified-v1",
            "legacy_exclusion": "The legacy 'Walk-forward base rate' factor (weight 1.0) is NOT part of the frozen factor set; reproduction verified 30/30 (v1) and 10/10 (v2 real rows) only with its exclusion.",
            "factors": CRYPTO_FACTORS,
            "label_note": "Persisted ledgers spell the last factor 'Supply-overhang penalty (negative-only)'; identical weight (1.5) and never-positive rule. Canonical identity via _canon_label (see 'canonical_factor_labels').",
            "parameter_sources": "see 'parameter_provenance.production_crypto'"
        },
        {
            "model_name": "crypto-dossier-minus-momentum",
            "role": "challenger",
            "terminal": "crypto",
            "strategy_id": "crypto-dossier-minus-momentum",
            "strategy_version": "0.1.0-shadow",
            "parameter_hash": "sha256:real-parameter-hashes-in-parameter_provenance",
            "parameter_hash_note": "v2.0.0's 'sha256:derived-from-production-minus-momentum-1.5' was a PLACEHOLDER and is retired. C-2's parameters are derivational (production minus Momentum); the verifiable sources are the real file hashes in 'parameter_provenance.challenger_c2'.",
            "definition": "Production model with the RSI-14 Momentum factor removed. The ONE deliberate difference from production. ALL operational rules (entry contract, waiting-interval veto, venue mapping, level construction, evaluator) are IDENTICAL to production.",
            "decision_clock": "server-utc",
            "price_convention": "usd-spot-reference",
            "snapshot_version": "crypto-input-snapshot-v3-canonical-atr-window",
            "entry_convention": "first-post-decision-binance-spot-trade (actionable-entry-v1)",
            "evaluator_version": "crypto-evaluation-v5-corrected",
            "total_weight": 15.5,
            "n_factors": 10,
            "scoring_formula": "challengerLong = round(clamp(50 + (weightedNet/15.5)*42, 5, 95)); challengerShort = 100 - challengerLong; challengerDirection = challengerLong >= challengerShort ? long : short. The Momentum factor's contribution leaves the net AND its weight 1.5 leaves the denominator; remaining weights are NOT rescaled. Per-factor score rules unchanged from production (NO_DATA -> 0, never estimated).",
            "levels": {
                "risk_per_unit": "1.25 x Wilder ATR-14 (same ATR-14 value production used; ATR is directionless)",
                "invalidation": "entry -/+ riskPerUnit by CHALLENGER direction (IMMUTABLE from decision time)",
                "target1": "entry +/- 1.5 x riskPerUnit",
                "target2": "entry +/- 2.5 x riskPerUnit",
                "payoff_convention": "linear-entry-notional"
            },
            "gates": {
                "issuance_path_gates": "Identical repaired gates to production (see production model).",
                "comparison_harness_mirror": "On flipped legs, the harness mirrors born-dead and short-regime checks to the CHALLENGER's direction/levels (frozen comparison-row semantics in harness.py); non-flipped legs share production's direction/levels/gate inputs by construction (RULE 4: shared-evidence agreement, not inheritance).",
                "eligibility": "Byte-identical to production."
            },
            "horizon": {"primary": 30, "checkpoints_days": [5, 14, 30], "unit": "elapsed_days"},
            "cost_bps_roundtrip": 18.0,
            "cost_note": "18 bps round-trip modeled; funding UNVERIFIED (production convention).",
            "cost_scenario_id": "modeled-roundtrip-18bps-funding-unverified-v1",
            "factors": [f for f in CRYPTO_FACTORS if f["label"] != "Momentum"],
            "direction_disagreement": "If the two arms' direction calls disagree on MORE THAN 40% of paired issued rows with both directions present, that is an AUDIT TRIGGER -- not proof of an implementation bug, not a strategy difference, not a freeze change. The trigger fires on decision-time data; the four-part audit (factor-configuration concentration; harness fidelity; shared market conditions; definition drift from the freeze) produces a WRITTEN FINDING. See COLLECTION-PLAN-2026-10-14.md. (v2.0.0's 'pause readout / implementation bug' wording is superseded.)",
            "readout_criteria": "Window-based (COLLECTION-PLAN-2026-10-14.md): collection 2026-10-14 -> 2026-12-31 UTC, readout regardless of N. Verdicts are read from the paired cluster-robust intervals (G >= 10 per metric) per the primary comparison rule. The v2.0.0 target-N gate and the INCONCLUSIVE clause directing further collection are REMOVED -- there is no target-N logic anywhere in this program.",
            "parameter_sources": "see 'parameter_provenance.challenger_c2'"
        },
        {
            "model_name": "equity-factor-agreement",
            "role": "production",
            "terminal": "equity",
            "strategy_id": "equity-factor-agreement",
            "strategy_version": "3.1.0-measurement-closure",
            "build_id": "phase1-final-signoff-2026-10-09",
            "parameter_hash": "atr2-target1.5R-weights-6-8-8-20-8-20-20",
            "decision_clock": "xnys-session-close",
            "entry_convention": "next-xnys-regular-session-open-print (actionable-entry-v1)",
            "evaluator_version": "equity-eval-3.3.0",
            "total_weight": 90,
            "n_factors": 7,
            "scoring_formula": "rawScore = round(100 x SUM(weight x score) / SUM(weight)), scores in {-1,0,+1}. redundancyAdjustment = -5 if all five trend-cluster factors are +1; +5 if all five are -1 (toward zero); else 0. finalScore = rawScore + redundancyAdjustment. Direction: score >= 20 -> long; <= -20 -> short; else mixed.",
            "levels": {
                "invalidation_method": "2.00x Wilder ATR-14 from the reference entry (IMMUTABLE from decision time; validatePublishedLevels)",
                "target1": "entry +/- 1.5 x riskPerUnit",
                "target2": "entry +/- 2.5 x riskPerUnit"
            },
            "gates": {
                "issuance_path_gates": "Repaired gates apply (see production crypto model); the equity overnight gap (session-close -> next-open) carries no bars BY CONSTRUCTION: checkWaitingInterval grades it with allowEmptyInterval=true (passes with the explicit reason 'no bars by construction', never uncertain).",
                "short_regime": "SHORT additionally requires bearish daily structure: belowSma50 && (lowerHighs || trend20Negative), else suppressed."
            },
            "quality_gates": "ANOMALY (any daily move > 80% in last 260 sessions), STALE (latest bar > 5 days old), NO_DATA (reading unavailable) -> non-GOOD factors get score = 0; contribution withheld.",
            "horizon": {"primary": 30, "checkpoints_sessions": [5, 14, 30], "unit": "trading_sessions"},
            "horizon_calendar_rule": "Equity outcome deadline = signal date + 47 calendar days (see 'equity_horizon' section).",
            "cost_scenario_note": "costs modeled per equity-eval-3.2.0; crypto 18 bps convention does not apply to equity rows.",
            "snapshot_note": "Persisted Yahoo OHLCV replay; decision-time cutoff enforced (availableAt <= decisionAt).",
            "no_equity_challenger": "NO equity challenger is frozen here: none is specified, and inventing one would be a strategy change, which is out of scope. Equity rows score the production arm only; the challenger arm is not-applicable:no-challenger-frozen.",
            "trend_cluster": ["price_vs_sma20", "price_vs_sma50", "price_vs_sma200", "macd_12_26", "atr_adjusted_trend30"],
            "factors": [
                {"id": "price_vs_sma20", "display": "Price vs SMA 20", "weight": 6, "score_rule": "+1 if close > SMA20, else -1 (0 if SMA unavailable)"},
                {"id": "price_vs_sma50", "display": "Price vs SMA 50", "weight": 8, "score_rule": "+1 if close > SMA50, else -1"},
                {"id": "price_vs_sma200", "display": "Price vs SMA 200", "weight": 8, "score_rule": "+1 if close > SMA200, else -1"},
                {"id": "rsi14_wilder", "display": "Wilder RSI 14", "weight": 20, "score_rule": "+1 if 55 <= RSI <= 75; -1 if 25 <= RSI <= 45; else 0 (0 if RSI null)"},
                {"id": "macd_12_26", "display": "MACD 12-26", "weight": 8, "score_rule": "0 if EMA12/EMA26 null or |diff| < 1e-6; +1 if diff > 0, else -1"},
                {"id": "volume_direction_z", "display": "High-volume direction", "weight": 20, "score_rule": "0 unless volumeZ > 1; then +1 if close > prevClose, -1 if below"},
                {"id": "atr_adjusted_trend30", "display": "ATR-adjusted 30-session trend", "weight": 20, "score_rule": "riskAdjusted = 30d return% / (ATR14/close x 100 x sqrt(30)); 0 if |riskAdjusted| < 0.5; +1/-1 by sign"}
            ],
            "source_files": [
                {"path": "ts-spaces/equity-analyzer-and-signal-tracker/server/src/measurement.ts", "sha256": H["equity-measurement.ts"], "role": "factor scoring mirror (computeEquityDecisionFromRawInputs, DEFAULT_WEIGHTS), issuance gates; matches v2.0.0 hash (unchanged)"},
                {"path": "ts-spaces/equity-analyzer-and-signal-tracker/server/src/actions.ts", "sha256": H["equity-actions.ts"], "role": "dossier factor computation, factorScoreBreakdown, signalDecision; matches v2.0.0 hash (unchanged)"},
                {"path": "ts-spaces/equity-analyzer-and-signal-tracker/server/src/schema.ts", "sha256": H["equity-schema.ts"], "role": "persisted signal/ledger schema; matches v2.0.0 hash (unchanged)"},
                {"path": "goals/research-terminal/hidden_files/methodology-export-2026-10-13/methodology-equity.md", "sha256": H["methodology-equity.md"], "role": "read-only methodology export (line references) as of 2026-10-13; matches v2.0.0 hash (unchanged)"}
            ]
        }
    ],
    "harness": {
        "path": "goals/research-terminal/paper-signals/comparison/harness.py",
        "sha256": H["harness.py"],
        "manifest_version_note": "harness.py's MANIFEST_VERSION constant remains '2.0.0' and load_manifest() reads freeze-manifest-v2.0.0.json -- the harness is NOT re-pointed by this consolidation. v2.1.0 is a governance/measurement consolidation: its executable sections (operational rules, model parameters, the four asserted rules below) are content-identical to what the current harness executes. The v2.0.0 manifest file itself stays immutable on disk (superseded).",
        "post_v2_0_0_amendment": "harness.py was amended AFTER the v2.0.0 freeze (2026-10-14T04:09:32Z) with the v2.0.0 asserted semantics (four ASSERTED RULES, workstream B amendment generalized). v2.1.0 records the CURRENT harness hash, including those rules.",
        "asserted_rules": [
            "RULE 1 -- a RECORDED suppression/rejection establishes `abstain` even when no score was recorded (recorded decision > missing number), with a complete ledger, an incomplete ledger, or no ledger at all.",
            "RULE 2 -- missing scores ALONE never establish abstention: no recorded score + no recorded suppression decision -> `unscored`, never `abstain`.",
            "RULE 3 -- a missing score is recomputed from the COMPLETE factor ledger where possible (both arms); an incomplete ledger retains `unscored` (unscored:incomplete-factor-ledger) -- never a guessed score.",
            "RULE 4 -- C-2 is evaluated INDEPENDENTLY: production `abstain` never implies C-2 `abstain` by itself. The challenger is scored from its own factor set (minus Momentum) wherever its ledger is complete, runs its own mirrored levels/gates on flipped legs, and is marked abstain/unscored only on its own evidence. Non-flipped legs share production's direction, levels, and gate inputs BY CONSTRUCTION (shared-evidence agreement, not inheritance)."
        ],
        "rules_source": "harness.py 'ASSERTED RULES' banner + tests/test_harness.py::TestAssertedRules (80/80 green at consolidation)",
        "writes": "comparison row CSV/JSONL under goals/research-terminal/paper-signals/comparison/rows/. Never writes to any production table or holdout.",
        "decision_time_rule": "Both arms are scored from decision-time inputs only. Any input dated after decisionAt fails the decision-time check: default labels the row decision_time_verified=false (never silently passes); strict mode raises LookaheadError. Inputs without asOf fields are labeled decision_time_verified=false ('asOf not recorded') -- never assumed. Date-only asOf values are normalized to UTC midnight in the row builder (documented per row); the harness itself is unchanged."
    },
    "metrics": {
        "path": "goals/research-terminal/paper-signals/comparison/metrics.py",
        "sha256": H["metrics.py"],
        "implements": "the audit's primary economic comparison (see 'primary_comparison')"
    },
    "cohort_reporting": {
        "rule": "Two cohorts exist and are NEVER pooled into one N without the split shown alongside.",
        "cohort_p": {
            "name": "Cohort P -- crypto paired (production vs C-2)",
            "definition": "crypto-terminal comparison rows. This is the ONLY cohort in which a paired production-vs-challenger comparison exists. Paired metrics use the COLLECTION-PLAN cluster-robust intervals.",
            "caveat": "Cohort P rows are currently 10/10 decision_time_verified=false (incomplete timestamp evidence); every Cohort P readout carries this caveat and the verified/unverified split."
        },
        "cohort_e": {
            "name": "Cohort E -- equity production-only",
            "definition": "equity-terminal rows. NO C-2 counterpart exists (the freeze specifies no equity challenger; inventing one would be a strategy change). Production arm is reported as production-only descriptive metrics (opportunity coverage, ledger-score distributions); no paired gap is computable.",
        },
        "reporting_format": "Every figure, table, or readout that touches both cohorts displays the split -- 'Cohort P (crypto paired): n=...' and 'Cohort E (equity production-only): n=...' -- with the cohort definitions. A combined n may appear only as a dataset-size line, never as the denominator of a metric, and never without the split adjacent.",
        "rationale": "Pooling would average a paired challenger comparison with a challenger-less production-only cohort -- a category error that inflates N and silently dilutes the paired result."
    },
    "primary_comparison": {
        "source": "MEASUREMENT-GAPS-2026-10-14.md section (d) -- authoritative.",
        "unit": "One opportunity = one comparison row (one candidate at one decision time).",
        "per_arm_contribution": [
            "Arm `issued` and outcome graded -> c = the arm's graded net R (crypto: net of the frozen 18 bps roundtrip, funding unverified per the frozen cost scenario; equity: per the equity-eval-3.2.0 cost convention -- the crypto 18 bps convention does not apply to equity rows).",
            "Arm `issued` but outcome not yet graded / unverifiable (time_exit, ambiguous, unverified, open, not-graded) -> c = UNKNOWN.",
            "Genuine abstention -- the arm EVALUATED the issuance decision and declined (abstain:*: born-dead, issuance-validation-unavailable, short-regime-gate, eligibility, gate-inputs-unverifiable) -> c = 0.000 R exactly, zero cost. A real zero: it participates in the mean.",
            "Never evaluated (unscored:*: production-not-issued, no-factor-ledger, production-unreproduced, incomplete-factor-ledger) or no counterpart (not-applicable:*) -> c = UNKNOWN."
        ],
        "unknown_accounting": "UNKNOWN is counted and labeled per metric, excluded from that metric's interval -- never scored as 0, never silently dropped. (Rationale: unscored:production-not-issued is not a decision to stay out; scoring it 0 would credit the arm with a costless correct abstention it never made.)",
        "primary": "Over all opportunities in the cohort, d = c(C-2) - c(production); the mean of d is taken over opportunities where NEITHER arm is UNKNOWN, with the COLLECTION-PLAN cluster-robust 95% interval (G >= 10). Abstention zeros participate as real zeros. The both-issued-only comparison is reported SECONDARILY as a sensitivity check.",
        "single_arm_cohorts": "No paired gap exists for Cohort E. Primary = mean per-opportunity production contribution over opportunities where production is not UNKNOWN (genuine abstentions as zeros); reported production-only, never as a challenger gap."
    },
    "equity_horizon": {
        "rule": "Equity outcome deadline = signal date + 47 calendar days.",
        "derivation": "Frozen equity evaluator (equity-eval-3.3.0): first-touch barrier walk, horizon cap 30 TRADING sessions. No exchange calendar was frozen in v2.0.0; the audit nominated NYSE (XNYS, the frozen decision-clock/session reference) from the NYSE Group official 2026/2027 holiday calendar. The +47 backstop covers both session-counting anchors (worst case: anchor B exclusive, 47 days) and absorbs the maximum 3 weekday NYSE holidays any 30-session window can contain -- so no per-signal holiday lookup is required; the true 30th XNYS session always falls on or before the deadline. If a future freeze pins the anchor, N tightens to 46/47 with the same holiday logic.",
        "worked_check": "Signal session 2026-10-09 (Fri) -> 30th XNYS session 2026-11-19 (span 41) <= deadline 2026-11-25.",
        "unresolved_conflict": "COLLECTION-PLAN-2026-10-14.md fixes 'All outcome windows close: 2027-01-30' (last issuance 2026-12-31 + 30 calendar days -- the CRYPTO evaluator's cap). That cap CONTRADICTS the frozen equity evaluator for late-window signals: a 2026-12-31 equity signal's 30th XNYS session is 2027-02-12 (span 43) -- 13 days after the plan's close -- and the plan's readout-by date (2027-02-06) precedes it. Under the +47 rule, equity outcomes for the collection window close 2027-02-16 (= 2026-12-31 + 47), not 2027-01-30. Reconciliation options (parent/Logan; freeze amendment, not decided here): (i) extend the equity outcome close to 2027-02-16 and move the readout accordingly; or (ii) restate the equity horizon -- but (ii) would change the frozen evaluator, which requires a new freeze version. This conflict is UNRESOLVED pending Logan's decision; the consolidation does NOT pick a side."
    },
    "comparison_dataset": {
        "pilot": "goals/research-terminal/paper-signals/comparison/rows/comparison-rows-pilot-2026-10-14.csv (+ .jsonl twin) -- 60 rows: real candidates with persisted decision-time factor ledgers. Retrospective provenance (audit verdict (a)): all decisions predate every freeze; freeze_version stamps are collection-time backfills; prospective provenance cannot be established. 60/60 rows lack fully verified decision-time evidence under the strict rule (audit verdict (b)).",
        "prospective": "goals/research-terminal/paper-signals/comparison/rows/cohort-prospective-v2.csv -- header-only forward-collection vessel under THIS freeze (v2.1.0). ONLY rows decided AFTER the v2.1.0 freeze timestamp, under its executable rules, with provenance_verdict PROSPECTIVE. Retrospective rows never enter this file.",
        "retrospective": "goals/research-terminal/paper-signals/comparison/rows/cohort-retrospective-v2.csv -- 356 rows (60 pilot + 296 suppressed-stream dry-run reproduction). Separate readout dataset with retrospective accounting; QUARANTINE: no read path into pilot statistics or the prospective file (collect_pilot_rows.py reads exactly one hardcoded pilot path; metrics.py takes explicit paths; nothing discovers cohort-* paths). The retrospective file is never an input to collection or to pilot metrics.",
        "quarantined_v1": "goals/research-terminal/paper-signals/comparison/rows/comparison-rows-2026-10-13.csv (+ .jsonl twin) -- sandbox-seeded rows under the SUPERSEDED v1.0.0 freeze; excluded from pilot statistics, kept for audit only."
    },
    "disagreement": {
        "rule": "If the two arms' direction calls disagree on MORE THAN 40% of paired issued rows with both directions present, that is an AUDIT TRIGGER -- not proof of an implementation bug, not a strategy difference, and not a freeze change. The trigger fires on decision-time data, so it may fire during collection without violating the no-peeking rule.",
        "audit": ["(a) factor-configuration concentration", "(b) harness fidelity check (prod_reproduced on disagreement rows)", "(c) shared market conditions", "(d) definition drift from the freeze"],
        "output": "A WRITTEN FINDING (which of (a)-(d) explains the disagreement, with numbers). It does not change the freeze, the models, or the collection window. If the audit finds an implementation bug, the fix goes through a NEW freeze version -- never patched in place.",
        "supersedes_v2_0_0_wording": "v2.0.0's flip_guardrail wording (which framed >40% disagreement as an implementation-bug signal warranting a readout pause) is superseded by this clause."
    },
    "collection_window": {
        "window": "2026-10-14 -> 2026-12-31 (inclusive, UTC)",
        "crypto_outcome_close": "2027-01-30 (last issuance 2026-12-31 + 30 elapsed days, the frozen crypto barrier-walk cap)",
        "equity_outcome_close": "UNRESOLVED -- see 'equity_horizon.unresolved_conflict'. Under the +47 rule the equity close is 2027-02-16; the plan currently fixes 2027-01-30.",
        "readout_by": "2027-02-06 (plan's current date; subject to the unresolved equity-close conflict -- a late equity close moves the readout)",
        "rule": "All dates FIXED. The readout happens REGARDLESS of N -- even N=0 (every metric reads n=0 / INCONCLUSIVE). There is NO 'collect until 30 definitive rows qualify' logic anywhere in this program.",
        "no_tuning": "NOTHING observed during collection -- counts, disagreement rates, or (after the window) outcomes -- may motivate changes to model thresholds, weights, factors, gates, or costs. Any model change requires a NEW freeze manifest version. The freeze is changed by versioning, never by editing v2.1.0 in place, and never in response to accumulating results."
    },
    "comparison_metrics": {
        "per_model": ["target-before-stop rate", "directional accuracy d5/d14/d30 (where observable)", "net returns after costs (18 bps roundtrip, crypto; equity per equity-eval-3.2.0 convention)", "opportunity coverage (issued/abstain/unscored fraction of the eligible stream)", "alert delay (issued_at - decision_at)"],
        "uncertainty": "Wilson 95% CI for rates; cluster-robust 95% interval (Liang-Zeger, G/(G-1), t_{G-1}, minimum G=10) for the primary paired gap; small-n reported as-is and labeled. Abstentions and missing outcomes are rows with reason codes, never silently dropped. TIMING_UNVERIFIED rows are excluded from definitive totals.",
        "primary_is": "the audit's primary economic comparison (see 'primary_comparison'); both-issued-only is the secondary sensitivity check"
    },
    "exploratory_note": "The 58/118 exploratory result and all other exploratory findings stay exploratory. They are not validation. The comparison dataset is rows collected under THIS freeze.",
    "scope": "Head-to-head production-vs-challenger comparison for the paper pilot. Sandbox/research only; no production changes; no threshold tuning; no strategy changes. Paper signals only; no brokerage. Holdouts locked."
}

out_path = os.path.join(BASE, "freeze-manifest-v2.1.0.json")
with open(out_path, "w") as f:
    json.dump(manifest, f, indent=2)
    f.write("\n")
print("wrote", out_path)
