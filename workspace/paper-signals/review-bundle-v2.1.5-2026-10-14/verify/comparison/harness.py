#!/usr/bin/env python3
"""Production-vs-C-2 comparison harness (workstream C/A, freeze manifests v1.0.0 / v2.0.0 / v2.1.x).

Sandbox/research only. No production changes. No threshold tuning. No
strategy changes. Never writes to any production table or holdout.

v2.1.2 amendment (2026-10-14, fix 1 of 5 -- executable path matches the
active freeze):
  1. The harness now LOADS THE ACTIVE MANIFEST EXPLICITLY at runtime:
     comparison/ACTIVE_MANIFEST names the active freeze file; the path is
     resolved relative to this file (never a hardcoded version string that
     can drift). load_active_manifest() fails loudly (SchemaError) if the
     loaded manifest's manifest_version != EXPECTED_ACTIVE_VERSION
     ("2.1.2"). The hardcoded MANIFEST_VERSION = "2.0.0" constant is GONE;
     the collector stamps rows from ACTIVE_MANIFEST["manifest_version"].
  2. The SUPERSEDED historical born-dead gate (born_dead_check: pre-decision
     signal-day extremes graded as stop-outs) is DELETED from the issuance
     path. It is unreachable -- statically (no such function) and
     behaviorally (no pre-decision extreme can suppress). In its place, BOTH
     arms run the REPAIRED operational evaluator
     (operational_issuance_eval): the waiting-interval veto
     (checkWaitingInterval over the genuine [decisionAt, entryObservedAt]
     interval, setup-history filter, fail-closed), the actionable-entry-v1
     contract gates (per-terminal entry rule, 15-min crypto window, drift
     caps 1.50 crypto / 0.50 equity, 5-min observation-age bound, timestamp
     ordering, anti-fabrication), and the venue mapping
     (ENTRY_VENUE_ACCEPTED_PRINT_LABELS). This is the identical evaluator
     production's live path runs (orchestrator/src/issuance/handler.ts);
     C-2's only difference from production remains Momentum removal
     (scoring), never the operational rules.
     - Production arm: the issuance verdict is the RECORDED pipeline
       decision (RULE 1; the repaired pipeline ran this exact evaluator
       live), now classified under the repaired taxonomy
       (_classify_suppression: waiting-interval-invalidation, entry-drift,
       entry-expired, entry-no-quote, entry-venue, issuance-veto).
     - Challenger arm, flipped legs: runs operational_issuance_eval
       in-harness (pipeline order: retained short-regime gate first for
       shorts, then the evaluator). Missing/unverifiable operational
       evidence fails closed -> abstain:issuance-validation-unavailable,
       never "issued" on pre-decision evidence.
     - Challenger arm, non-flipped legs: unchanged shared-evidence
       agreement with production's recorded verdict (RULE 4).
  3. born_dead_mirror / born_dead_mirror_reason stay in the frozen row
     schema but are ALWAYS None under v2.1.2+: the historical mirrored gate
     no longer runs. The v2.0.0/v2.1.x reason codes abstain:born-dead and
     abstain:born-dead-mirror are RETAINED in the vocabulary for historical
     rows and historical recorded reasons (RULE 1: a recorded suppression
     stands); they are never produced by the v2.1.2 issuance path.
  4. Prediction weights, factor sets, scoring formulas, level construction,
     the four asserted rules (RULES 1-4), and the decision-time rule are
     UNCHANGED. No prediction-weight drift (pinned by tests).

Fix 2 (2026-10-14, bounded fix 2 of 5 -- C-2 independent evaluation):
  5. RULE 4's non-flipped "shared by construction" shortcut is replaced by
     the verified reuse gate c2_may_reuse_production(evidence) -> (bool,
     reason) (RULE 5): a production result is reused for C-2 ONLY on exact
     input+rule match -- same decision-time ledger, same direction, same
     levels (recomputed exactly from each arm's own entry inputs; a
     matching direction alone never proves identical levels, entry
     eligibility, or waiting-interval evidence), same entry-eligibility
     inputs, same waiting-interval evidence, same operational gates.
     Reuse is recorded as levels_mode "reused: exact input+rule match"
     with the match evidence in notes. Direction-match with any other
     input/rule difference -- or a flipped direction -- evaluates C-2
     independently from its own factor ledger through the identical
     operational rules (fix 1's repaired evaluator:
     operational_issuance_eval on C-2's own direction and mirrored stop,
     against C-2's operational view of the evidence).
  6. Missing C-2 evidence is UNKNOWN (RULE 6): when the entry-observation
     stage is evidenced but C-2's required operational inputs are missing
     (entry observation without waiting-interval bars, or vice versa),
     the challenger's disposition is unscored with a missing-evidence
     reason code -- never filled from production's values, never inferred.
     (Issuance-time gates that cannot be verified stay fail-closed
     abstain: abstain:gate-inputs-unverifiable -- pinned v2.1.2 semantics.
     The flipped leg's fail-closed operational mapping is unchanged.)
  No prediction-weight changes: Momentum removal stays C-2's only model
  difference. No threshold tuning. Paper signals only; holdouts locked.

v2.0.0 delta (2026-10-14, workstream A): [unchanged historical text follows] the scoring formulas, mirrored
levels/gates, reason codes, and decision-time rule are UNCHANGED from v1.
Two additive extensions only:
  1. production_decision == "qualified": scan-qualified radar candidates
     that production never issued (scan-level issuance is a separate path).
     The production arm scores the frozen formula from the ledger but the
     disposition is unscored:production-not-issued -- never "issued".
  2. MANIFEST_VERSION bumped to "2.0.0": load_manifest() now requires the
     v2.0.0 freeze. Rows quarantined under v1.0.0 (rows/comparison-rows-
     2026-10-13.csv) are NOT re-scored; they stay labeled under v1.
All 33 v1 unit tests still pass unchanged (run tests/run_tests.py).

v2.0.0 amendment (2026-10-14, workstream B -- prospective collection):
  3. production_decision in ("suppressed", "rejected") WITH a persisted
     factor ledger but WITHOUT a recorded pre-suppression score
     (production_recorded empty): the suppression itself IS the recorded
     production decision, so there is no score reproduction to check. The
     production arm records abstain with the classified suppression reason
     (not unscored:production-unreproduced), and the challenger IS computed
     from the ledger (non-flipped legs record the same suppression as abstain
     on the shared direction/levels/gate evidence -- see RULE 4;
     flipped legs run their own mirrored gates). A RECORDED score that
     mismatches the ledger still routes to unscored:production-unreproduced
     for both arms (fidelity check intact). No existing pilot row changes
     disposition under this amendment (no suppressed-with-ledger row existed
     before it).

v2.0.0 asserted semantics (2026-10-14): four ASSERTED RULES now govern
  abstain/unscored routing, encoded in score_pair under the "ASSERTED RULES"
  banner and pinned by tests/test_harness.py::TestAssertedRules:
  RULE 1 -- a RECORDED suppression/rejection establishes `abstain` even when
    no score was recorded (recorded decision > missing number), with a
    complete ledger, an incomplete ledger, or no ledger at all. This
    generalizes the workstream-B amendment above.
  RULE 2 -- missing scores ALONE never establish abstention: no recorded
    score + no recorded suppression decision -> `unscored`, never `abstain`.
  RULE 3 -- a missing score is recomputed from the COMPLETE factor ledger
    where possible (both arms); an incomplete ledger retains `unscored`
    (unscored:incomplete-factor-ledger) -- never a guessed score. Complete =
    every frozen factor of the arm's model present with finite contribution
    and positive weight (see _ledger_completeness).
  RULE 4 -- C-2 is evaluated INDEPENDENTLY: production `abstain` never
    implies C-2 `abstain` by itself. The challenger is scored from its own
    factor set (minus Momentum) wherever its ledger is complete, runs its
    own mirrored levels/gates on flipped legs, and is marked abstain/unscored
    only on its own evidence. (Fix 2 supersedes the former non-flipped
    "shared by construction" shortcut: the sharing is now the explicit
    exact-match check of RULE 5, not a construction assumption.)
  RULE 5 -- verified reuse (fix 2): c2_may_reuse_production(evidence) ->
    (bool, reason). A production result is reused for C-2 ONLY on exact
    input+rule match (same decision-time ledger, same direction, same
    levels recomputed exactly, same entry-eligibility inputs, same
    waiting-interval evidence, same operational gates; production's result
    a real issued/abstain verdict). A matching direction alone never
    suffices; any other input/rule difference evaluates C-2 independently.
    Reuse is recorded with the match evidence (levels_mode "reused: exact
    input+rule match").
  RULE 6 -- missing C-2 evidence is UNKNOWN (fix 2): when the
    entry-observation stage is evidenced but C-2's required operational
    inputs are missing, the challenger's disposition is unscored with a
    missing-evidence reason code -- never filled from production's values,
    never inferred.
  Known tensions (documented, not guessed):
  (i)  A RECORDED production score that mismatches the complete ledger still
    kills BOTH arms (unscored:production-unreproduced) -- pinned by
    test_production_unreproduced_kills_challenger and
    test_suppressed_recorded_mismatch_still_unreproduced. The fidelity kill
    is about ledger untrustworthiness, not inherited suppression, but its
    letter does limit RULE 4's independence; changing it needs those tests
    to change first.
  (ii) Suppressed + incomplete ledger + a RECORDED (but unverifiable) score
    routes production to abstain (RULE 1: the recorded suppression stands;
    only a PROVEN mismatch on a complete ledger overturns it).

What it does
------------
For the SAME eligible candidates, scores BOTH the frozen production model
(crypto-dossier-factor-agreement / equity-factor-agreement) and the frozen
challenger (crypto-dossier-minus-momentum, version 0.1.0-shadow) from
DECISION-TIME inputs only. Abstentions and missing outcomes are emitted as
rows with machine-readable reason codes -- never silently dropped.

Public API
----------
  resolve_active_manifest_path(marker_path=None) -> str (ACTIVE_MANIFEST marker -> file path)
  load_active_manifest(path=None) -> dict (the ACTIVE freeze; fails loudly on version mismatch)
  load_manifest(path, expected_version=None) -> dict (plain loader; optional version check)
  ACTIVE_MANIFEST      -> the loaded active freeze manifest (import-time, fail-fast)
  ACTIVE_FREEZE_VERSION -> ACTIVE_MANIFEST["manifest_version"] (the stamp for new rows)
  operational_issuance_eval(direction, invalidation, candidate)
                       -> (verdict, reason_code, note); the repaired operational
                          issuance evaluator, identical for both arms
  c2_may_reuse_production(evidence) -> (bool, reason); the RULE 5 verified
                          reuse gate (fix 2): reuse a production result for
                          C-2 only on exact input+rule match
  build_c2_reuse_evidence(candidate, ...) -> dict; assembles the gate's
                          exact-match evidence (fix 2)
  score_pair(candidate, strict=False) -> dict (one comparison row)
  score_batch(candidates, strict=False) -> list[dict]
  write_rows_csv(rows, path) / read_rows_csv(path)
  ROW_COLUMNS                  -> the frozen comparison-row schema

Candidate schema extension (v2.1.2+, all OPTIONAL): operational evidence for
the repaired issuance path. Carried when the pipeline persisted it; absent ->
the evaluator fails closed (uncertain), never assumes.
  "waiting_interval_bars": [{"start_at","end_at","open","high","low","close",
      "granularity","source","label","is_closed","provisional"}, ...]
      Evidence bars covering [decision_at, entry_observed_at]. Bars with
      end_at <= the pre-decision cutoff are setup-history FEATURES, never
      stop-outs.
  "entry_observation": {"price","observed_at","received_at","venue_label",
      "evidence"} -- the entry print observation ("venue-trade" |
      "cost-adjusted-quote"; anti-fabrication: anything else -> no entry).
  "entry_venue": contract entryVenue label (default per terminal).
  "decision_price": decision-time reference price (drift-cap basis).
  "detected_at": draft/detectedAt instant (pre-decision cutoff for the
      setup-history filter; clamped to <= decision_at).

Decision-time rule: candidate["factors"] entries may carry "asOf"
timestamps. Any asOf later than candidate["decision_at"] marks the row
decision_time_verified=False with an explicit note (default), or raises
LookaheadError in strict=True mode. Inputs without asOf fields are labeled
decision_time_verified=False ("asOf not recorded") -- never assumed.

Schema stability: ROW_COLUMNS is the frozen row schema. New columns are
appended only; existing columns are never renamed or removed.
"""

import csv
import json
import math
import os
from datetime import datetime, timedelta, timezone

# ---------------------------------------------------------------------------
# Active-freeze binding (v2.1.2+). The harness loads THE active manifest
# explicitly at runtime: comparison/ACTIVE_MANIFEST names the single active
# freeze file, resolved by path relative to this file -- never a hardcoded
# version string that can drift. Loading fails loudly (SchemaError) unless
# the manifest's manifest_version == EXPECTED_ACTIVE_VERSION. Bumping the
# active freeze is an explicit, reviewed edit of BOTH the marker file and
# the pin below.
# ---------------------------------------------------------------------------

EXPECTED_ACTIVE_VERSION = "2.1.5"


def resolve_active_manifest_path(marker_path: str | None = None) -> str:
    """Resolve the active freeze manifest file by path via the marker."""
    base = os.path.dirname(os.path.abspath(__file__))
    marker = marker_path or os.path.join(base, "ACTIVE_MANIFEST")
    try:
        with open(marker) as f:
            name = f.read().strip()
    except OSError as e:
        raise SchemaError(
            f"cannot read ACTIVE_MANIFEST marker at {marker}: {e} -- "
            f"the harness refuses to run without an explicitly named active freeze")
    if not name or "/" in name or "\\" in name or not name.endswith(".json"):
        raise SchemaError(
            f"ACTIVE_MANIFEST names an invalid manifest file: {name!r}")
    path = os.path.join(base, name)
    if not os.path.isfile(path):
        raise SchemaError(
            f"active manifest {name!r} (from ACTIVE_MANIFEST) not found in "
            f"the package tree: {path}")
    return path


def load_manifest(path: str, expected_version: str | None = None) -> dict:
    """Plain freeze-manifest loader. With expected_version, fail loudly on mismatch."""
    with open(path) as f:
        m = json.load(f)
    if expected_version is not None and m.get("manifest_version") != expected_version:
        raise SchemaError(f"manifest version {m.get('manifest_version')!r} at {path} "
                          f"!= expected {expected_version!r}")
    return m


def load_active_manifest(path: str | None = None) -> dict:
    """Load THE active freeze manifest, resolved by path (not version string).

    Fails loudly (SchemaError) if the loaded manifest's manifest_version !=
    EXPECTED_ACTIVE_VERSION. Update EXPECTED_ACTIVE_VERSION alongside the
    ACTIVE_MANIFEST marker when the active freeze is bumped.
    """
    p = path or resolve_active_manifest_path()
    m = load_manifest(p)
    if m.get("manifest_version") != EXPECTED_ACTIVE_VERSION:
        raise SchemaError(
            f"active manifest version {m.get('manifest_version')!r} at {p} "
            f"!= expected active version {EXPECTED_ACTIVE_VERSION!r} -- "
            f"the harness's executable path no longer matches the active freeze; "
            f"update EXPECTED_ACTIVE_VERSION alongside the ACTIVE_MANIFEST marker, "
            f"or restore the pinned manifest")
    return m


# Import-time, fail-fast: the harness never runs against the wrong freeze.
ACTIVE_MANIFEST = load_active_manifest()
ACTIVE_FREEZE_VERSION: str = ACTIVE_MANIFEST["manifest_version"]


class LookaheadError(Exception):
    """Raised in strict mode when an input is dated after decisionAt."""


class SchemaError(Exception):
    """Raised when a candidate or row violates the frozen schema."""

# ---------------------------------------------------------------------------
# Frozen model parameters (mirror the freeze manifest; kept here so the
# harness scores exactly the frozen models without drifting from the JSON).
# ---------------------------------------------------------------------------

CRYPTO_PRODUCTION_TOTAL_WEIGHT = 17.0
CRYPTO_C2_TOTAL_WEIGHT = 15.5
CRYPTO_C2_MOMENTUM_LABEL = "Momentum"
CRYPTO_C2_MOMENTUM_WEIGHT = 1.5
CRYPTO_FORMULA_BASELINE = 50.0
CRYPTO_FORMULA_SCALE = 42.0
CRYPTO_SCORE_FLOOR = 5
CRYPTO_SCORE_CEIL = 95
# Legacy factor excluded from the frozen production factor set (historical
# ledgers may still carry it; reproduction verified 30/30 only with exclusion).
LEGACY_WALKFORWARD_LABELS = ("walk-forward base rate",)

# Frozen factor sets (mirror freeze-manifest-v2.0.0.json exactly). Used by
# RULE 3 (_ledger_completeness): a ledger is COMPLETE for an arm only when
# every frozen factor of that arm's model is present with a finite
# contribution and a finite positive weight. The challenger set is the
# production set minus Momentum -- judged on its own 10 factors (RULE 4).
CRYPTO_PRODUCTION_LABELS = (
    "Trend cluster", "Momentum", "MACD", "Perp funding crowding",
    "Open interest", "Binance futures positioning",
    "Cross-venue taker imbalance", "TVL trend", "Revenue linkage",
    "Developer velocity", "Supply-overhang penalty",
)
CRYPTO_C2_LABELS = tuple(l for l in CRYPTO_PRODUCTION_LABELS
                         if l != CRYPTO_C2_MOMENTUM_LABEL)
assert len(CRYPTO_PRODUCTION_LABELS) == 11
assert len(CRYPTO_C2_LABELS) == 10


def _canon_label(label: str) -> str:
    """Canonical factor identity for ledger-completeness matching.

    The pipeline persists one frozen factor with a scoring-rule annotation
    in its label -- "Supply-overhang penalty (negative-only)" -- while the
    frozen manifest records it as "Supply-overhang penalty". The parenthetical
    is an annotation, not a different factor (verified: the 10/10 pilot
    reproduction used ledgers carrying the annotated label). Canonical
    identity strips a single trailing " (...)" qualifier, then matches
    exactly against the frozen set. No two frozen labels collide after this
    normalization (asserted below).
    """
    s = str(label or "").strip()
    if s.endswith(")") and "(" in s:
        s = s[:s.rfind("(")].strip()
    return s


assert len({_canon_label(l) for l in CRYPTO_PRODUCTION_LABELS}) == 11
assert len({_canon_label(l) for l in CRYPTO_C2_LABELS}) == 10

EQUITY_WEIGHTS = {
    "price_vs_sma20": 6, "price_vs_sma50": 8, "price_vs_sma200": 8,
    "rsi14_wilder": 20, "macd_12_26": 8, "volume_direction_z": 20,
    "atr_adjusted_trend30": 20,
}
EQUITY_TREND_CLUSTER = [
    "price_vs_sma20", "price_vs_sma50", "price_vs_sma200",
    "macd_12_26", "atr_adjusted_trend30",
]
EQUITY_REDUNDANCY_ADJUSTMENT = 5  # toward zero on unanimous trend cluster
EQUITY_LONG_THRESHOLD = 20
EQUITY_SHORT_THRESHOLD = -20

COST_BPS_ROUNDTRIP = 18.0

# ---------------------------------------------------------------------------
# Disposition + reason-code vocabularies.
# v2.1.2: the repaired operational evaluator's taxonomy. New codes are
# additive; historical codes are RETAINED for historical rows/reasons
# (never produced by the v2.1.2 issuance path).
# ---------------------------------------------------------------------------

DISPOSITIONS = ("issued", "abstain", "unscored", "not-applicable")

REASON = {
    # abstain: a gate suppressed the arm on its own direction
    # (historical: recorded pre-v2.1.2 pipeline suppressions from the
    # superseded pre-decision-extreme veto. RULE 1: a recorded suppression
    # stands. Never produced by the v2.1.2 issuance path.)
    "born-dead": "abstain:born-dead",
    # (historical: the harness's own mirrored born-dead gate on challenger
    # flipped legs. SUPERSEDED in v2.1.2 by the repaired operational
    # evaluator; the gate function is deleted. Never produced now.)
    "born-dead-mirror": "abstain:born-dead-mirror",
    # abstain: the repaired waiting-interval veto invalidated the setup
    # (a post-decision extreme touched the final published stop in
    # [decisionAt, entryObservedAt] -- "a touch is a touch"). Identical for
    # both arms.
    "waiting-interval-invalidation": "abstain:waiting-interval-invalidation",
    "short-regime": "abstain:short-regime-gate",
    "short-regime-mirror": "abstain:short-regime-gate-mirror",
    "eligibility": "abstain:eligibility",
    # abstain: the repaired evaluator could not confirm issuance
    # (fail-closed uncertainty -- missing/unverifiable operational evidence).
    # Identical for both arms.
    "issuance-unavailable": "abstain:issuance-validation-unavailable",
    # abstain: qualification-time issuance veto (runQualificationChecks
    # fail_closed at issuance, entry not yet observed).
    "issuance-veto": "abstain:issuance-veto",
    # abstain: entry-contract (actionable-entry-v1) failures -- entry-rule
    # failures, NOT vetos. Identical for both arms.
    "entry-drift": "abstain:entry-drift",
    "entry-expired": "abstain:entry-expired",
    "entry-no-quote": "abstain:entry-no-quote",
    "entry-venue": "abstain:entry-venue",
    # unscored: the arm could not be computed
    "no-factor-ledger": "unscored:no-factor-ledger",
    # unscored: a factor ledger was persisted but is INCOMPLETE for the arm's
    # frozen factor set (RULE 3) -- the arm is not scored from it, never a
    # guessed score
    "incomplete-ledger": "unscored:incomplete-factor-ledger",
    "production-unreproduced": "unscored:production-unreproduced",
    "levels-uncomputable": "unscored:levels-uncomputable",
    "gate-inputs-unverifiable": "unscored:gate-inputs-unverifiable",
    # fix 2 (RULE 6): the entry-observation stage is evidenced but C-2's
    # required operational inputs are missing -- the challenger's
    # disposition is UNKNOWN (unscored is the harness's unknown bucket),
    # never filled from production's values, never inferred.
    "waiting-interval-evidence-missing": "unscored:waiting-interval-evidence-missing",
    "entry-observation-missing": "unscored:entry-observation-missing",
    # v2: scan-qualified radar candidate that production never issued
    # (scan-level issuance is a separate path; issuedCount=0 by construction)
    "production-not-issued": "unscored:production-not-issued",
    # terminal mismatch
    "no-challenger": "not-applicable:no-challenger-frozen",
    "ok": "issued",
}

# ---------------------------------------------------------------------------
# The frozen comparison-row schema.
# ---------------------------------------------------------------------------

ROW_COLUMNS = [
    # identity
    "row_id", "terminal", "symbol", "asset_id", "candidate_id",
    "decision_at", "issued_at", "row_origin",
    # inputs provenance
    "decision_time_verified", "decision_time_note", "factor_ledger_available",
    "eligibility", "eligibility_reason",
    # production arm
    "prod_strategy_id", "prod_strategy_version",
    "prod_long_score", "prod_short_score", "prod_direction",
    "prod_reproduced", "prod_decision", "prod_suppression_reason",
    "prod_disposition", "prod_disposition_reason",
    "prod_entry", "prod_invalidation", "prod_target1", "prod_target2", "prod_atr14",
    # challenger arm
    "c2_strategy_id", "c2_strategy_version",
    "c2_long_score", "c2_short_score", "c2_direction",
    "direction_flipped",
    "c2_entry", "c2_invalidation", "c2_target1", "c2_target2",
    "levels_mode",
    "born_dead_mirror", "born_dead_mirror_reason",
    "short_regime_gate_mirror", "short_regime_gate_mirror_reason",
    "c2_disposition", "c2_disposition_reason",
    # outcomes (populated later; missing = explicit)
    "alert_delay_hours", "alert_delay_note",
    "prod_barrier_outcome", "c2_barrier_outcome",
    "prod_net_r", "c2_net_r",
    "prod_dir_d5", "prod_dir_d14", "prod_dir_d30",
    "c2_dir_d5", "c2_dir_d14", "c2_dir_d30",
    "outcome_note",
    # audit
    "notes",
]

BARRIER_OUTCOMES = ("target", "invalidated", "time_exit", "ambiguous",
                    "unverified", "open", "not-graded")
DIR_OUTCOMES = ("hit", "miss", "pending", "not-graded")


# ---------------------------------------------------------------------------
# Scoring -- exact frozen formulas.
# ---------------------------------------------------------------------------

def _agreement(long_score: int) -> tuple[int, int, str]:
    long_score = max(CRYPTO_SCORE_FLOOR, min(CRYPTO_SCORE_CEIL, long_score))
    short_score = 100 - long_score
    direction = "long" if long_score >= short_score else "short"
    return long_score, short_score, direction


def score_crypto_production(factors: list[dict]) -> dict:
    """Frozen crypto production: 11-factor dossier agreement (walk-forward excluded)."""
    usable = [f for f in factors
              if str(f.get("label", "")).lower() not in LEGACY_WALKFORWARD_LABELS
              and math.isfinite(f.get("contribution", float("nan")))
              and math.isfinite(f.get("weight", float("nan")))
              and f.get("weight", 0) > 0]
    weighted_net = sum(f["contribution"] for f in usable)
    total_weight = sum(f["weight"] for f in usable)
    if total_weight > 0:
        long_score = round(CRYPTO_FORMULA_BASELINE
                           + (weighted_net / total_weight) * CRYPTO_FORMULA_SCALE)
    else:
        long_score = round(CRYPTO_FORMULA_BASELINE)
    long_score, short_score, direction = _agreement(long_score)
    return {"long_score": long_score, "short_score": short_score,
            "direction": direction, "weighted_net": weighted_net,
            "total_weight": total_weight, "factors_used": len(usable)}


def score_crypto_challenger(factors: list[dict]) -> dict:
    """Frozen C-2: drop RSI-14 Momentum (contribution AND weight 1.5; no rescale)."""
    def is_momentum(f: dict) -> bool:
        return (str(f.get("label", "")).strip() == CRYPTO_C2_MOMENTUM_LABEL
                and abs(float(f.get("weight", 0)) - CRYPTO_C2_MOMENTUM_WEIGHT) < 1e-9)
    kept = [f for f in factors if not is_momentum(f)]
    result = score_crypto_production(kept)
    result["momentum_dropped"] = len(factors) - len(kept)
    return result


def score_equity_production(factors: list[dict]) -> dict:
    """Frozen equity production: weighted vote + redundancy adjustment, +/-20."""
    num = sum(float(f["weight"]) * float(f["score"]) for f in factors)
    den = sum(float(f["weight"]) for f in factors)
    raw = round(100 * num / den) if den else None
    by_id = {f["id"]: f for f in factors}
    cluster = [by_id.get(i) for i in EQUITY_TREND_CLUSTER]
    adj = 0
    if all(c is not None for c in cluster):
        scores = [c["score"] for c in cluster]
        if all(s == 1 for s in scores):
            adj = -EQUITY_REDUNDANCY_ADJUSTMENT
        elif all(s == -1 for s in scores):
            adj = EQUITY_REDUNDANCY_ADJUSTMENT
    final = raw + adj if raw is not None else None
    direction = ("long" if final is not None and final >= EQUITY_LONG_THRESHOLD
                 else "short" if final is not None and final <= EQUITY_SHORT_THRESHOLD
                 else "mixed")
    return {"final_score": final, "raw_score": raw,
            "redundancy_adjustment": adj, "direction": direction,
            "total_weight": den}


def mirror_levels(entry, atr14, direction, risk_multiple=1.25) -> dict | None:
    """Mirrored levels (production and challenger share this construction)."""
    if entry is None or atr14 is None:
        return None
    if not (entry > 0 and atr14 > 0 and risk_multiple > 0):
        return None
    rpu = atr14 * risk_multiple
    sign = 1 if direction == "long" else -1
    return {
        "entry": entry,
        "invalidation": entry - sign * rpu,
        "target1": entry + sign * 1.5 * rpu,
        "target2": entry + sign * 2.5 * rpu,
        "risk_per_unit": rpu,
        "risk_multiple": risk_multiple,
    }


# ---------------------------------------------------------------------------
# The repaired operational issuance evaluator (active freeze v2.1.x).
#
# v2.1.2 REPLACES the superseded historical born-dead gate
# (born_dead_check -- pre-decision signal-day extremes graded as stop-outs;
# DELETED) with this evaluator. It is IDENTICAL for both arms: production's
# live issuance path runs this exact logic
# (orchestrator/src/issuance/handler.ts: retained regime gate, then
# runQualificationChecks at qualification, then entry observation per the
# actionable-entry-v1 contract, then checkWaitingInterval over the genuine
# [contract.decisionAt, entryObservedAt] at entry observation); the
# challenger runs it in-harness on flipped legs. C-2's only difference from
# production remains Momentum removal (scoring), never the operational rules.
#
# Frozen operational parameters (mirror the active freeze's operational_rules;
# entry-v1/src/entry-rules.ts DEFAULT_UNGROUNDED_PARAMS and
# ENTRY_VENUE_ACCEPTED_PRINT_LABELS).
# ---------------------------------------------------------------------------

OP_CRYPTO_ENTRY_WINDOW_MINUTES = 15
OP_CRYPTO_DRIFT_CAP_PCT = 1.5
OP_EQUITY_DRIFT_CAP_PCT = 0.5
OP_MAX_OBSERVATION_AGE_MS = 5 * 60_000
OP_ENTRY_VENUE_ACCEPTED_PRINT_LABELS = {
    "binance-spot": ("binance-spot",),
    "primary-listing-consolidated-tape": (
        "consolidated-tape", "primary-listing-consolidated-tape"),
}
# Granularity fineness rank (veto/src/veto.ts GRANULARITY_RANK). A bar is
# admissible as waiting-interval evidence iff rank >= the required rank
# ("intraday" crypto, "session" equity).
OP_GRANULARITY_RANK = {
    "session": 1, "intraday": 2, "forming_candle": 3,
    "trade_print": 4, "quote": 5,
}
OP_ENTRY_EVIDENCE_KINDS = ("venue-trade", "cost-adjusted-quote")


def _append_note(candidate: dict, note: str) -> str:
    base = candidate.get("notes")
    return (base + " | " + note) if base else note


def operational_issuance_eval(direction: str, invalidation: float | None,
                              candidate: dict) -> tuple[str, str, str]:
    """The repaired operational issuance evaluator -- identical for both arms.

    Returns (verdict, reason_code, note); verdict in {"pass","fail","uncertain"}.
      "pass"      -> the operational path clears; reason_code is "issued".
      "fail"      -> the setup was invalidated on the operational path
                     (waiting-interval touch of the final stop, or an
                     entry-contract failure). The arm abstains.
      "uncertain" -> fail-closed: issuance cannot be confirmed from the
                     persisted operational evidence. The arm abstains with
                     abstain:issuance-validation-unavailable (or the specific
                     entry-contract reason). Uncertainty is never resolved by
                     guessing.

    Components, in live-pipeline order:
      1. Entry contract (actionable-entry-v1): the entry observation must
         satisfy the per-terminal entry rule, the entry window, the drift
         cap, the 5-min observation-age bound, timestamp ordering
         (decisionAt <= issuedAt <= entryObservedAt <= entryReceivedAt),
         the venue mapping, and the anti-fabrication rule (entryPrice only
         on a venue trade or cost-adjusted quote). Entry-rule failures are
         NOT vetos.
      2. Waiting-interval veto (checkWaitingInterval): the genuine
         [decisionAt, entryObservedAt] graded against the FINAL published
         stop. Bars entirely before the pre-decision cutoff are setup-history
         FEATURES, never stop-outs. A touch is a touch: any adverse extreme
         touching the final stop in the interval invalidates (fail).
         Per-bar handling: straddling candles -> definite pass only if the
         whole-bar extreme provably could not have crossed, else UNCERTAIN
         (fail-closed); null/incoherent OHLC -> UNCERTAIN; no post-decision
         bars -> UNCERTAIN, except the equity overnight gap (no bars BY
         CONSTRUCTION -> pass with explicit reason, never uncertain).
    """
    terminal = candidate.get("terminal", "crypto")
    decision_at = _parse_ts(candidate.get("decision_at"))
    issued_at = _parse_ts(candidate.get("issued_at"))

    def uncertain(why: str) -> tuple[str, str, str]:
        return ("uncertain", REASON["issuance-unavailable"],
                f"operational evaluator: {why} -- fail-closed, never assumed")

    if decision_at is None:
        return uncertain("decision_at missing; the waiting interval cannot be formed")
    if invalidation is None or not (invalidation > 0):
        return uncertain("no positive final published stop to grade")

    # ---- 1. entry contract (actionable-entry-v1) ----
    obs = candidate.get("entry_observation") or {}
    price = obs.get("price")
    observed_at = _parse_ts(obs.get("observed_at"))
    received_at = _parse_ts(obs.get("received_at"))
    venue_label = obs.get("venue_label")
    evidence = obs.get("evidence")
    entry_venue = (candidate.get("entry_venue")
                   or ("binance-spot" if terminal == "crypto"
                       else "primary-listing-consolidated-tape"))
    decision_price = candidate.get("decision_price")

    # anti-fabrication: a fill price is never invented
    if evidence not in OP_ENTRY_EVIDENCE_KINDS:
        return uncertain(
            f"entry evidence {evidence!r} is not an observable venue trade "
            f"or cost-adjusted quote")
    if price is None or not (price > 0) or observed_at is None or received_at is None:
        return uncertain(
            "entry observation incomplete (price/observed_at/received_at required)")
    # timestamp ordering: decisionAt <= issuedAt <= entryObservedAt <= entryReceivedAt
    if issued_at is not None and issued_at < decision_at:
        return uncertain("time-incoherent: issuedAt precedes decisionAt")
    if observed_at < decision_at:
        return uncertain("time-incoherent: entryObservedAt precedes decisionAt")
    if issued_at is not None and observed_at < issued_at:
        return uncertain("time-incoherent: entryObservedAt precedes issuedAt")
    if received_at < observed_at:
        return uncertain("time-incoherent: entryReceivedAt precedes entryObservedAt")
    # entry window
    if terminal == "crypto":
        # first-post-decision-binance-spot-trade: [decisionAt, decisionAt+15min]
        window_end = decision_at + timedelta(minutes=OP_CRYPTO_ENTRY_WINDOW_MINUTES)
        if observed_at > window_end:
            return ("fail", REASON["entry-expired"],
                    f"operational evaluator (entry contract): entry observed past "
                    f"the {OP_CRYPTO_ENTRY_WINDOW_MINUTES}-min crypto entry window")
        # receipt-expiry parity with the issuance handler (issuance/handler.ts
        # lateReceiptVoid): the receipt time -- not just the observation time --
        # is graded against the window expiry. A print observed in-window but
        # received after the window closed is historical reconstruction, not
        # an actionable entry. The expert's counterexample: observed at
        # minute 14 (inside the 15-min window), receipt at minute 16 (after
        # expiry) -> void_expired, never entered.
        if received_at > window_end:
            return ("fail", REASON["entry-expired"],
                    f"operational evaluator (entry contract): late receipt -- "
                    f"the venue fetch returned at {received_at.isoformat()} "
                    f"after the {OP_CRYPTO_ENTRY_WINDOW_MINUTES}-min crypto "
                    f"entry window closed; an in-window print served now is "
                    f"historical reconstruction, not an actionable entry")
        drift_cap = OP_CRYPTO_DRIFT_CAP_PCT
    else:
        # next-xnys-regular-session-open-print: the XNYS calendar check is
        # pipeline-side; the harness requires a post-decision print.
        drift_cap = OP_EQUITY_DRIFT_CAP_PCT
    # observation age: a print older than 5 min at receipt is historical
    # reconstruction, not an actionable entry
    age_ms = (received_at - observed_at).total_seconds() * 1000
    if age_ms > OP_MAX_OBSERVATION_AGE_MS:
        return uncertain(
            f"entry print observation age {age_ms / 60000:.1f} min exceeds the "
            f"5-min bound")
    # drift cap against the decision-time reference price
    if decision_price is None or not (decision_price > 0):
        return uncertain("decision_price not persisted; the drift cap cannot be checked")
    drift_pct = abs(price - decision_price) / decision_price * 100
    if drift_pct > drift_cap:
        return ("fail", REASON["entry-drift"],
                f"operational evaluator (entry contract): entry {price} drifted "
                f"{drift_pct:.2f}% from decision price {decision_price}, beyond "
                f"the {drift_cap}% cap")
    # venue mapping: the print's venue label must be accepted for the
    # contract's entryVenue (unknown venues fall back to exact-label match,
    # fail-closed against unlisted venues)
    accepted = OP_ENTRY_VENUE_ACCEPTED_PRINT_LABELS.get(entry_venue, (entry_venue,))
    if venue_label not in accepted:
        return ("fail", REASON["entry-venue"],
                f"operational evaluator (venue mapping): print venue {venue_label!r} "
                f"not in the accepted set {list(accepted)} for entryVenue "
                f"{entry_venue!r}")

    # ---- 2. waiting-interval veto (checkWaitingInterval) ----
    entry_at = observed_at
    if entry_at < decision_at:
        return uncertain("time-incoherent waiting interval: entryAt < decisionAt")
    detected_at = _parse_ts(candidate.get("detected_at"))
    # setup-history cutoff, clamped to the authoritative decision
    cutoff = min(detected_at, decision_at) if detected_at else decision_at

    raw_bars = candidate.get("waiting_interval_bars") or []
    bars = []
    for b in raw_bars:
        try:
            s = _parse_ts(b.get("start_at"))
            e = _parse_ts(b.get("end_at"))
            ohlc = [float(v) if v is not None else None
                    for v in (b.get("open"), b.get("high"),
                              b.get("low"), b.get("close"))]
        except (TypeError, ValueError):
            return uncertain("a waiting-interval bar has unparseable timestamps/prices")
        bars.append({
            "start": s, "end": e, "ohlc": ohlc,
            "granularity": b.get("granularity"),
            "label": b.get("label") or b.get("source") or "waiting-interval bar",
        })

    # setup-history filter: bars entirely before the cutoff are FEATURES,
    # never stop-outs. Yesterday's stop crossing cannot veto a new setup.
    features = [b for b in bars if b["end"] is not None and b["end"] <= cutoff]
    n_features = len(features)

    if not bars:
        if terminal == "equity":
            # the overnight gap [session-close, next-open] carries no bars BY
            # CONSTRUCTION (the market is closed) -- not uncertainty.
            return ("pass", REASON["ok"],
                    "operational evaluator: waiting interval clear -- no bars by "
                    "construction (equity overnight gap); pre-decision extremes are "
                    "setup features, never stop-outs")
        return uncertain(
            "no waiting-interval evidence: the decision->entry interval has no "
            "observable bars and empty evidence was not declared by construction")

    if entry_at == decision_at:
        # Degenerate window: no post-decision pre-entry interval exists, so no
        # post-decision invalidation is possible. Vacuous pass -- not missing
        # evidence. Pre-decision extremes stay features, never stop-outs.
        return ("pass", REASON["ok"],
                f"operational evaluator: no post-decision pre-entry interval exists "
                f"(entry coincides with the decision); {n_features} pre-decision "
                f"bar(s) recorded as setup features, never stop-outs")

    required_rank = OP_GRANULARITY_RANK["session" if terminal == "equity" else "intraday"]
    window_bars = [b for b in bars
                   if b["end"] is not None and b["end"] > decision_at
                   and b["start"] is not None and b["start"] < entry_at]
    if not window_bars:
        return uncertain(
            "no post-decision OHLC evidence in [decisionAt, entryAt); a "
            "pre-decision candle must never veto a post-decision entry")
    fine = [b for b in window_bars
            if OP_GRANULARITY_RANK.get(b["granularity"], 0) >= required_rank]
    if not fine:
        return uncertain(
            "waiting-interval evidence is coarser than the finest available "
            "granularity; the path cannot be isolated")

    for b in fine:
        label = b["label"]
        o, h, l, c = b["ohlc"]
        if (any(v is None or not math.isfinite(v) for v in (o, h, l, c))
                or not (h >= max(o, c) and l <= min(o, c))):
            return uncertain(
                f"post-decision bar has missing or incoherent OHLC ({label}); "
                f"cannot prove the path")
        extreme = l if direction == "long" else h
        crossed = (extreme <= invalidation) if direction == "long" else (extreme >= invalidation)
        straddles_decision = b["start"] < decision_at and b["end"] > decision_at
        straddles_entry = b["start"] < entry_at and b["end"] > entry_at
        if straddles_decision or straddles_entry:
            # Only the actionable-side portion may invalidate. If the
            # whole-bar extreme is safe, that portion is provably safe.
            # Otherwise the portion cannot be isolated from OHLC -> uncertain,
            # fail-closed. The pre-event portion is NEVER a definite breach.
            if not crossed:
                continue
            which = " and ".join(
                x for x, y in (("decisionAt", straddles_decision),
                               ("entryAt", straddles_entry)) if y)
            return uncertain(
                f"candle {label} straddles {which} and its extreme crossed the "
                f"final stop; the actionable-side portion cannot be isolated from OHLC")
        if crossed:
            return ("fail", REASON["waiting-interval-invalidation"],
                    f"operational evaluator (waiting-interval veto): post-decision "
                    f"extreme crossed the final published stop {invalidation} "
                    f"(extreme {extreme} on {label}) -- setup invalidated in its "
                    f"waiting interval")

    return ("pass", REASON["ok"],
            f"operational evaluator: waiting interval clear -- no post-decision "
            f"extreme crossed the final published stop {invalidation}; "
            f"{n_features} pre-decision bar(s) recorded as setup features, never "
            f"stop-outs")


def short_regime_gate(price_below_sma50, lower_highs,
                      trend20_negative) -> tuple[str, str | None]:
    """-> (verdict, reason). verdict in allowed|suppressed|unverifiable."""
    inputs = (price_below_sma50, lower_highs, trend20_negative)
    if any(v is None for v in inputs):
        return "unverifiable", "belowSma50/lowerHighs/trend20Negative not persisted"
    allowed = bool(price_below_sma50) and (bool(lower_highs) or bool(trend20_negative))
    if allowed:
        return "allowed", None
    return ("suppressed",
            "short-regime: bearish daily structure gate not met "
            "(priceBelowSma50 && (lowerHighs || trend20Negative))")


def _parse_ts(v) -> datetime | None:
    if v is None:
        return None
    if isinstance(v, (int, float)):
        # epoch ms or s heuristic
        return datetime.fromtimestamp(v / 1000 if v > 1e12 else v, tz=timezone.utc)
    return datetime.fromisoformat(str(v).replace("Z", "+00:00"))


def decision_time_check(candidate: dict, strict: bool = False) -> tuple[bool, str]:
    """Verify every input asOf <= decisionAt. Returns (verified, note)."""
    decision_at = _parse_ts(candidate.get("decision_at"))
    if decision_at is None:
        return False, "decision_at missing; decision-time verification impossible"
    late = []
    unlabeled = 0
    for f in candidate.get("factors") or []:
        as_of = f.get("asOf") or f.get("as_of")
        if as_of is None:
            unlabeled += 1
            continue
        if _parse_ts(as_of) > decision_at:
            late.append(f.get("label") or f.get("id"))
    if late:
        note = f"{len(late)} input(s) dated after decisionAt: {late[:5]}"
        if strict:
            raise LookaheadError(note)
        return False, note
    if unlabeled:
        return False, (f"asOf not recorded on {unlabeled} factor input(s); "
                       "decision-time status labeled, not assumed")
    return True, "all factor inputs asOf <= decisionAt"


def _classify_suppression(reason: str | None) -> str:
    """Classify a RECORDED suppression reason under the repaired taxonomy.

    v2.1.2: the live issuance path no longer suppresses via the historical
    born-dead veto, so reasons recorded by the repaired pipeline
    (waiting-interval-invalidation, entry-drift/expired/no-quote, venue,
    issuance-veto) classify under the repaired codes. Historical
    pre-decision-extreme reasons ("born-dead ... signal-day ...") keep their
    recorded code (RULE 1: the recorded suppression stands). The repaired
    checkSetupInvalidation fail reason ("born-dead {DIR}: post-decision
    extreme crossed ...") is the waiting-interval veto, not the historical
    gate -- it classifies as waiting-interval-invalidation.
    """
    r = (reason or "").lower()
    if "waiting-interval-invalidation" in r or "waiting interval" in r:
        return REASON["waiting-interval-invalidation"]
    if "post-decision extreme crossed" in r:
        return REASON["waiting-interval-invalidation"]
    if r.startswith("born-dead"):
        return REASON["born-dead"]
    if "short-regime" in r:
        return REASON["short-regime"]
    if "entry-drift" in r or "void_drift" in r:
        return REASON["entry-drift"]
    if "entry-expired" in r or "void_expired" in r or "past the issuance expiry" in r:
        return REASON["entry-expired"]
    if "entry-no-quote" in r or "no_quote" in r:
        return REASON["entry-no-quote"]
    if "venue" in r:
        return REASON["entry-venue"]
    if "issuance-veto" in r:
        return REASON["issuance-veto"]
    if "issuance-validation unavailable" in r:
        return REASON["issuance-unavailable"]
    if r:
        return REASON["eligibility"]
    return REASON["eligibility"]


def _ledger_completeness(terminal: str, factors: list[dict],
                         for_challenger: bool = False) -> tuple[bool, str]:
    """RULE 3: is the persisted factor ledger COMPLETE for the arm's formula?

    Complete = every frozen factor of the arm's model is present with a finite
    contribution and a finite positive weight. Legacy labels excluded from the
    frozen set (e.g. walk-forward base rate) never count as missing; extra
    unknown labels never count as present. Label matching is exact
    (post-strip) against the frozen manifest labels -- a mislabeled ledger is
    not the frozen ledger.

    Returns (complete, note). An incomplete ledger is never scored from: the
    arm retains `unscored` (unscored:incomplete-factor-ledger) -- do not
    guess.

    Label matching uses _canon_label (trailing parenthetical annotations
    stripped); contribution/weight usability is as stated above.
    """
    if terminal == "crypto":
        required = CRYPTO_C2_LABELS if for_challenger else CRYPTO_PRODUCTION_LABELS
        key = "label"
    elif terminal == "equity":
        if for_challenger:
            raise SchemaError("no equity challenger is frozen")
        required = tuple(EQUITY_WEIGHTS)
        key = "id"
    else:
        raise SchemaError(f"unknown terminal: {terminal!r}")
    required_canon = [_canon_label(r) for r in required]
    usable: dict[str, bool] = {}
    for fac in factors or []:
        name = _canon_label(fac.get(key, ""))
        try:
            contrib = float(fac.get("contribution", float("nan")))
            weight = float(fac.get("weight", float("nan")))
        except (TypeError, ValueError):
            contrib, weight = float("nan"), float("nan")
        ok = math.isfinite(contrib) and math.isfinite(weight) and weight > 0
        usable[name] = usable.get(name, False) or ok
    missing = [lbl for lbl, canon in zip(required, required_canon)
               if not usable.get(canon)]
    if missing:
        return False, f"incomplete factor ledger: missing/unusable {missing}"
    return True, "factor ledger complete for the arm's frozen factor set"


# ---------------------------------------------------------------------------
# Fix 2 (2026-10-14) -- C-2 independent evaluation: the verified reuse gate.
# RULE 5 + RULE 6. See the module docstring ("Fix 2" amendment).
# ---------------------------------------------------------------------------

def _levels_exact_equal(a, b) -> bool:
    """Exact equality on the four published levels.

    A matching direction alone never proves identical levels: the reuse
    gate demands the exact same entry/invalidation/target1/target2. Exact
    float equality (no tolerance) -- both sides come from the same
    deterministic mirror_levels construction, so a true match is bitwise
    identical.
    """
    if not a or not b:
        return False
    return all(a.get(k) == b.get(k)
               for k in ("entry", "invalidation", "target1", "target2"))


def _c2_operational_view(candidate: dict) -> dict:
    """Candidate view with C-2's per-arm operational overrides applied.

    The operational evidence (entry observation, waiting-interval bars,
    short-regime inputs) is shared decision-time market data -- one reality
    per candidate. Optional c2_* overrides model a divergent C-2 observation
    (used by tests and forward rows that persist per-arm evidence); when
    absent, C-2 grades the shared evidence. A divergent override breaks the
    reuse gate's exact-match conditions (RULE 5).
    """
    view = dict(candidate)
    if candidate.get("c2_entry_observation") is not None:
        view["entry_observation"] = candidate["c2_entry_observation"]
    if candidate.get("c2_waiting_interval_bars") is not None:
        view["waiting_interval_bars"] = candidate["c2_waiting_interval_bars"]
    if candidate.get("c2_short_regime_inputs") is not None:
        view["short_regime_inputs"] = candidate["c2_short_regime_inputs"]
    return view


def _c2_missing_operational_evidence(candidate: dict) -> list:
    """RULE 6: detect C-2's missing operational inputs.

    Returns the list of missing required C-2 inputs (empty = none missing).

    The entry-observation stage is "evidenced" when the candidate carries an
    entry observation or waiting-interval bars (or per-arm overrides). When
    the stage is NOT evidenced at all, there is nothing to grade -- the
    recorded production verdict governs via RULE 1 / the RULE 5 reuse gate
    (the live pipeline ran the repaired evaluator on the real evidence;
    absence from the candidate is not absence from reality). When the stage
    IS evidenced but incomplete for C-2 (crypto: the entry observation
    anchors the [decisionAt, entryAt] interval and the bars grade it -- one
    without the other cannot be graded), the missing inputs are reported
    and the challenger's disposition is UNKNOWN -- never filled from
    production's values, never inferred.
    """
    view = _c2_operational_view(candidate)
    obs = view.get("entry_observation")
    bars = view.get("waiting_interval_bars")
    if obs is None and bars is None:
        return []
    missing = []
    if obs is None:
        missing.append("entry observation")
    if not bars:
        # The challenger is crypto-only; the waiting interval cannot be
        # graded without bars. (The equity overnight gap passes inside the
        # evaluator, but no equity challenger is frozen.)
        missing.append("waiting-interval evidence")
    return missing


def build_c2_reuse_evidence(candidate: dict, *, prod_direction,
                            prod_disposition, prod_disposition_reason,
                            prod_decision_recorded, c2_direction,
                            prod_levels, c2_levels) -> dict:
    """Assemble the exact-match evidence consumed by c2_may_reuse_production.

    Every field is a checkable claim about the COMPLETE relevant inputs of
    the two arms (RULE 5). prod_levels / c2_levels are the harness
    recomputations from each arm's own decision-time entry inputs.
    """
    # C-2 grades the shared decision-time market data unless a per-arm
    # override is present. The effective inputs match production's iff the
    # override is absent or value-identical to the shared evidence.
    view = _c2_operational_view(candidate)
    ev = {
        # One persisted decision-time ledger per candidate; the challenger
        # scores the same ledger minus Momentum (deterministic transform).
        "ledger_identity_match": True,
        "prod_direction": prod_direction,
        "c2_direction": c2_direction,
        # A matching direction alone never proves identical levels.
        "direction_match": c2_direction == prod_direction,
        "levels_match": _levels_exact_equal(prod_levels, c2_levels),
        # Entry-eligibility inputs: C-2's effective entry observation is
        # the shared one (no divergent override).
        "entry_eligibility_match": (
            view.get("entry_observation") == candidate.get("entry_observation")),
        # Waiting-interval evidence: C-2's effective bar set is the shared
        # one (no divergent override).
        "waiting_interval_match": (
            view.get("waiting_interval_bars") == candidate.get("waiting_interval_bars")),
        # Operational gates: C-2's effective gate inputs are the shared
        # ones (no divergent override). Signal-day OHLC is not graded under
        # v2.1.2.
        "gates_match": (
            view.get("short_regime_inputs") == candidate.get("short_regime_inputs")),
    }
    if prod_disposition in ("issued", "abstain"):
        ev["production_result_reusable"] = True
        ev["production_result"] = ("issued" if prod_disposition == "issued"
                                   else f"abstain:{prod_disposition_reason}")
    elif prod_decision_recorded == "issued":
        # RULE 2: no reproducible score, but the RECORDED issuance decision
        # is itself a production result on the shared inputs (the live
        # pipeline ran the repaired evaluator before the score was lost).
        ev["production_result_reusable"] = True
        ev["production_result"] = "issued (recorded decision; score not reproduced)"
    else:
        ev["production_result_reusable"] = False
        ev["production_result"] = None
    # RULE 6: applicable-stage evidence missing for C-2.
    ev["c2_missing_evidence"] = _c2_missing_operational_evidence(candidate)
    return ev


def c2_may_reuse_production(evidence: dict) -> tuple:
    """ASSERTED RULE 5 (fix 2, 2026-10-14): the verified reuse gate.

    A production result is reused for C-2 ONLY when the COMPLETE relevant
    inputs AND the rules match exactly: same decision-time ledger, same
    direction, same levels (recomputed exactly -- a matching direction alone
    never proves identical levels, entry eligibility, or waiting-interval
    evidence), same entry-eligibility inputs, same waiting-interval
    evidence, same operational gates -- and production's result is a real
    verdict (issued/abstain), not unscored.

    RULE 6: missing C-2 evidence -> (False, missing-evidence reason). The
    caller routes that case to disposition UNKNOWN (unscored with the
    reason recorded) -- C-2's missing inputs are never filled from
    production's values.

    Returns (may_reuse, reason). The True-branch reason enumerates the
    match evidence; the row records it (levels_mode "reused: exact
    input+rule match").
    """
    missing = evidence.get("c2_missing_evidence") or []
    if missing:
        return (False,
                "missing C-2 evidence: " + ", ".join(missing) +
                " -- disposition unknown (RULE 6); never filled from "
                "production's values, never inferred")
    mismatched = [k for k in ("ledger_identity_match", "direction_match",
                              "levels_match", "entry_eligibility_match",
                              "waiting_interval_match", "gates_match")
                  if not evidence.get(k)]
    if mismatched:
        return (False,
                "no reuse: " + ", ".join(mismatched) +
                " differ between production and C-2 -- C-2 evaluated "
                "independently from its own factor ledger (RULE 5)")
    if not evidence.get("production_result_reusable"):
        return (False,
                "no reuse: production result is not a reusable verdict "
                "(unscored/not-applicable) -- C-2 evaluated independently "
                "(RULE 5)")
    return (True,
            "exact input+rule match: same decision-time ledger, direction "
            f"{evidence.get('c2_direction')}, levels (exact), "
            "entry-eligibility inputs, waiting-interval evidence, "
            "operational gates -- production result "
            f"'{evidence.get('production_result')}' reused for C-2")


def _c2_missing_evidence_reason(missing: list) -> str:
    """Map RULE-6 missing inputs to the frozen unknown-bucket reason code."""
    if "waiting-interval evidence" in missing:
        return REASON["waiting-interval-evidence-missing"]
    if "entry observation" in missing:
        return REASON["entry-observation-missing"]
    return REASON["gate-inputs-unverifiable"]


# ---------------------------------------------------------------------------
# score_pair -- one candidate -> one comparison row.
# ---------------------------------------------------------------------------

def score_pair(candidate: dict, strict: bool = False) -> dict:
    terminal = candidate.get("terminal", "crypto")
    if terminal not in ("crypto", "equity"):
        raise SchemaError(f"unknown terminal: {terminal!r}")

    verified, dt_note = decision_time_check(candidate, strict=strict)
    factors = candidate.get("factors")
    # "present" = a ledger was persisted at all; "complete" (RULE 3) is judged
    # per-arm below by _ledger_completeness -- present is not complete.
    ledger_present = bool(factors)

    row = {c: None for c in ROW_COLUMNS}
    row.update({
        "row_id": f"{terminal}:{candidate.get('candidate_id')}",
        "terminal": terminal,
        "symbol": candidate.get("symbol"),
        "asset_id": candidate.get("asset_id"),
        "candidate_id": candidate.get("candidate_id"),
        "decision_at": candidate.get("decision_at"),
        "issued_at": candidate.get("issued_at"),
        "row_origin": candidate.get("row_origin", "sandbox-seeded"),
        "decision_time_verified": verified,
        "decision_time_note": dt_note,
        "factor_ledger_available": ledger_present,
        "eligibility": candidate.get("eligibility", "unknown"),
        "eligibility_reason": candidate.get("eligibility_reason"),
        "prod_barrier_outcome": "not-graded",
        "c2_barrier_outcome": "not-graded",
        "prod_dir_d5": "not-graded", "prod_dir_d14": "not-graded",
        "prod_dir_d30": "not-graded",
        "c2_dir_d5": "not-graded", "c2_dir_d14": "not-graded",
        "c2_dir_d30": "not-graded",
        "outcome_note": ("sandbox-seeded rows carry no outcomes; outcomes are "
                         "graded forward under the frozen evaluator versions"),
        "alert_delay_note": ("not gradable: decisionAt/issuedAt not both "
                             "persisted for this row"),
    })

    # NOTE: candidate["signal_day"] is intentionally NOT graded here. The
    # historical born-dead gate read signal-day OHLC as stop-outs; the
    # repaired evaluator treats pre-decision extremes as setup-history
    # features and grades only the genuine [decisionAt, entryObservedAt]
    # waiting interval (candidate["waiting_interval_bars"]).
    sr = candidate.get("short_regime_inputs") or {}
    prod_recorded = candidate.get("production_recorded") or {}
    rec_dir = prod_recorded.get("direction")
    rec_score = prod_recorded.get("score")
    # Did production record anything to reproduce? A suppressed candidate may
    # carry a ledger but no pre-suppression score (suppressed before score
    # persistence) -- the suppression itself is the recorded decision
    # (workstream-B amendment, generalized by RULE 1 below).
    recorded_score_present = rec_dir is not None or rec_score is not None

    # ------------------------------------------------------------------
    # ASSERTED RULES (2026-10-14) -- abstain/unscored semantics. Each rule
    # is named at the branch that enforces it; see the module docstring
    # section "v2.0.0 asserted semantics" for the full statement and the
    # known tensions.
    #   RULE 1: a RECORDED suppression/rejection establishes `abstain` even
    #           when no score was recorded (recorded decision > missing
    #           number) -- with a complete ledger, an incomplete ledger, or
    #           no ledger at all.
    #   RULE 2: missing scores ALONE never establish abstention -- no
    #           recorded score + no recorded suppression decision stays
    #           `unscored`, never `abstain`.
    #   RULE 3: a missing score is recomputed from the COMPLETE factor ledger
    #           where possible (both arms); an incomplete ledger retains
    #           `unscored` (unscored:incomplete-factor-ledger) -- do not
    #           guess.
    #   RULE 4: C-2 is evaluated INDEPENDENTLY -- production `abstain` never
    #           implies C-2 `abstain` by itself; the challenger is scored from
    #           its own factor set wherever its ledger is complete and is
    #           marked abstain/unscored only on its own evidence. (Fix 2:
    #           the non-flipped "shared by construction" shortcut is now the
    #           explicit RULE 5 exact-match check.)
    #   RULE 5: verified reuse -- c2_may_reuse_production(evidence):
    #           production result reused for C-2 ONLY on exact input+rule
    #           match (ledger, direction, levels exact, entry-eligibility,
    #           waiting-interval evidence, gates; real issued/abstain
    #           verdict). Direction-match alone never suffices.
    #   RULE 6: missing C-2 evidence -> UNKNOWN (unscored with the
    #           missing-evidence reason) -- never filled from production's
    #           values, never inferred.
    # ------------------------------------------------------------------

    # ---- production arm ----
    prod_scored = None
    prod_reproduced = None
    prod_ledger_complete = False
    c2_ledger_complete = False
    if ledger_present:
        prod_ledger_complete, _ = _ledger_completeness(terminal, factors)
        if terminal == "crypto":
            c2_ledger_complete, _ = _ledger_completeness(
                terminal, factors, for_challenger=True)

    if terminal == "crypto":
        row["prod_strategy_id"] = "crypto-dossier-factor-agreement"
        row["prod_strategy_version"] = "2.0.0-measurement-contract"
        if prod_ledger_complete:
            # RULE 3: recompute the (possibly missing) score from the complete
            # ledger. The score columns are written even when no score was
            # recorded -- the disposition below decides what that means.
            prod_scored = score_crypto_production(factors)
            row["prod_long_score"] = prod_scored["long_score"]
            row["prod_short_score"] = prod_scored["short_score"]
            row["prod_direction"] = prod_scored["direction"]
            sel = (prod_scored["long_score"] if prod_scored["direction"] == "long"
                   else prod_scored["short_score"])
            prod_reproduced = (recorded_score_present
                               and rec_dir == prod_scored["direction"]
                               and rec_score is not None
                               and abs(sel - rec_score) < 1e-9)
            row["prod_reproduced"] = prod_reproduced
        else:
            # RULE 3: incomplete/absent ledger -- no score recomputed, nothing
            # guessed; reproduction cannot be assessed.
            row["prod_reproduced"] = None
    else:  # equity production -- frozen, no challenger
        row["prod_strategy_id"] = "equity-factor-agreement"
        row["prod_strategy_version"] = "3.1.0-measurement-closure"
        if prod_ledger_complete:
            # RULE 3: recompute from the complete 7-factor ledger.
            prod_scored = score_equity_production(factors)
            row["prod_long_score"] = prod_scored["final_score"]
            row["prod_short_score"] = None
            row["prod_direction"] = prod_scored["direction"]
        # replay cross-check is forward work
        row["prod_reproduced"] = None

    prod_decision = candidate.get("production_decision")
    row["prod_decision"] = prod_decision
    row["prod_suppression_reason"] = candidate.get("production_suppression_reason")
    suppression_recorded = prod_decision in ("suppressed", "rejected")

    # Fidelity failure (crypto only): a RECORDED score that does not reproduce
    # from the complete ledger. Pinned behavior -- both arms unscored, and it
    # beats even a recorded suppression (see module docstring, tension (i)).
    fidelity_failed = (terminal == "crypto" and prod_ledger_complete
                       and recorded_score_present and prod_reproduced is False)

    if fidelity_failed:
        row["prod_disposition"] = "unscored"
        row["prod_disposition_reason"] = REASON["production-unreproduced"]
    elif suppression_recorded:
        # RULE 1: the RECORDED suppression/rejection establishes abstain --
        # complete ledger (workstream-B amendment), incomplete ledger, or no
        # ledger. Recorded decision > missing number. (A *proven* score
        # mismatch on a complete ledger was caught by the fidelity branch
        # above; an unverifiable recorded score does not overturn this.)
        row["prod_disposition"] = "abstain"
        row["prod_disposition_reason"] = _classify_suppression(
            candidate.get("production_suppression_reason"))
    elif not ledger_present:
        # No factor ledger persisted. A recorded "issued" still stands (the
        # decision is the data; reproduction is skipped, not faked); anything
        # else is unscored -- RULE 2: no score + no suppression record is
        # never abstain.
        if prod_decision == "issued":
            row["prod_disposition"] = "issued"
            row["prod_disposition_reason"] = (
                "issued (ledger not persisted; reproduction skipped)")
        else:
            row["prod_disposition"] = "unscored"
            row["prod_disposition_reason"] = REASON["no-factor-ledger"]
    elif not prod_ledger_complete:
        # RULE 3: the ledger is incomplete -- do not guess a score from it.
        # (A recorded suppression was already handled by RULE 1 above.)
        row["prod_disposition"] = "unscored"
        row["prod_disposition_reason"] = REASON["incomplete-ledger"]
    elif prod_decision == "issued":
        if terminal != "crypto" or (recorded_score_present and prod_reproduced):
            # Crypto: the recorded score verified against the complete ledger.
            # Equity: no reproduction check exists (forward work) -- the
            # recorded decision stands, as before.
            row["prod_disposition"] = "issued"
            row["prod_disposition_reason"] = REASON["ok"]
        else:
            # RULE 2: complete ledger but no recorded score to reproduce --
            # unscored, never abstain.
            row["prod_disposition"] = "unscored"
            row["prod_disposition_reason"] = REASON["production-unreproduced"]
    elif prod_decision == "qualified":
        # v2: scan-qualified radar candidate; production never issued it
        # (issuance into tracked_signals is a separate path). The frozen
        # formula is still scored from the ledger above; the disposition
        # records that no production signal exists to grade.
        if terminal == "crypto" and not recorded_score_present:
            # RULE 2: complete ledger but nothing recorded to reproduce.
            # (A recorded mismatch was caught by the fidelity branch above.)
            row["prod_disposition"] = "unscored"
            row["prod_disposition_reason"] = REASON["production-unreproduced"]
        else:
            row["prod_disposition"] = "unscored"
            row["prod_disposition_reason"] = REASON["production-not-issued"]
    else:
        # RULE 2: no recorded suppression decision and no (reproducible)
        # recorded score -- unscored, never abstain.
        if terminal != "crypto" or (recorded_score_present and prod_reproduced):
            row["prod_disposition"] = "unscored"
            row["prod_disposition_reason"] = REASON["gate-inputs-unverifiable"]
        else:
            row["prod_disposition"] = "unscored"
            row["prod_disposition_reason"] = REASON["production-unreproduced"]

    # production levels (as recorded; challenger inherits when not flipped)
    entry = candidate.get("entry")
    atr14 = candidate.get("atr14")
    if terminal == "crypto" and prod_scored and entry and atr14:
        lv = mirror_levels(entry, atr14, prod_scored["direction"], 1.25)
        if lv:
            row["prod_entry"] = lv["entry"]
            row["prod_invalidation"] = lv["invalidation"]
            row["prod_target1"] = lv["target1"]
            row["prod_target2"] = lv["target2"]
            row["prod_atr14"] = atr14

    # ---- challenger arm (crypto only) ----
    row["c2_strategy_id"] = "crypto-dossier-minus-momentum"
    row["c2_strategy_version"] = "0.1.0-shadow"
    if terminal != "crypto":
        row["c2_disposition"] = "not-applicable"
        row["c2_disposition_reason"] = REASON["no-challenger"]
        row["notes"] = candidate.get("notes")
        return _finalize(row)

    # RULE 4: the challenger never inherits production's suppression. It is
    # scored from its own factor set (minus Momentum) wherever its ledger is
    # complete, and is marked abstain/unscored only on its own evidence.
    if fidelity_failed:
        # Pinned: a RECORDED production score that does not reproduce from
        # the complete ledger makes the row's ledger untrustworthy; the
        # challenger is not computed. (Tension with RULE 4's letter noted in
        # the module docstring; pre-existing tests pin this.)
        row["c2_disposition"] = "unscored"
        row["c2_disposition_reason"] = REASON["production-unreproduced"]
        row["notes"] = ("production does not reproduce from ledger; "
                        "challenger not computed")
        return _finalize(row)
    if not ledger_present:
        # RULE 4: no ledger is the challenger's own missing evidence --
        # unscored on its own evidence, never an inherited abstain.
        row["c2_disposition"] = "unscored"
        row["c2_disposition_reason"] = REASON["no-factor-ledger"]
        row["notes"] = candidate.get("notes")
        return _finalize(row)
    if not c2_ledger_complete:
        # RULE 3 + RULE 4: the challenger's own factor set is incomplete --
        # do not guess; unscored on its own evidence, never an inherited
        # abstain.
        row["c2_disposition"] = "unscored"
        row["c2_disposition_reason"] = REASON["incomplete-ledger"]
        row["notes"] = candidate.get("notes")
        return _finalize(row)

    # RULE 3: recompute the challenger's (possibly missing) score from its own
    # complete factor set. RULE 4: this uses the challenger's own inputs --
    # production's recorded score/decision play no role here.
    c2 = score_crypto_challenger(factors)
    row["c2_long_score"] = c2["long_score"]
    row["c2_short_score"] = c2["short_score"]
    row["c2_direction"] = c2["direction"]

    if prod_scored is None:
        # The challenger's own 10-factor set is complete (e.g. the ledger is
        # missing only Momentum) but production's direction cannot be
        # recomputed from the incomplete production ledger. The challenger is
        # scored above on its own evidence (RULE 3, both arms; RULE 4), but
        # the flipped/non-flipped comparison needs production's recomputed
        # direction, which cannot be formed without guessing -- so no
        # disposition is assigned.
        row["direction_flipped"] = None
        row["c2_disposition"] = "unscored"
        row["c2_disposition_reason"] = REASON["incomplete-ledger"]
        row["notes"] = ("challenger scored from its own complete ledger; "
                        "production direction not recomputable from the "
                        "incomplete production ledger -- pair comparison not "
                        "formed, no disposition guessed")
        return _finalize(row)

    flipped = c2["direction"] != prod_scored["direction"]
    row["direction_flipped"] = flipped

    # ---- fix 2 (RULE 5/6): C-2's OWN levels, recomputed from C-2's own
    # entry inputs -- never copied from production's row values without
    # verification. Optional per-arm overrides (c2_entry / c2_atr14) model
    # a divergent C-2 entry observation; when absent C-2 uses the
    # candidate's shared decision-time entry inputs.
    c2_levels = mirror_levels(candidate.get("c2_entry", entry),
                              candidate.get("c2_atr14", atr14),
                              c2["direction"], 1.25)
    if c2_levels is None:
        # A required C-2 input is missing -> disposition unknown (RULE 6),
        # never guessed from production's levels.
        row["c2_disposition"] = "unscored"
        row["c2_disposition_reason"] = REASON["levels-uncomputable"]
        row["levels_mode"] = "uncomputable"
        row["notes"] = _append_note(
            candidate, "C-2 levels uncomputable from C-2's own entry inputs")
        return _finalize(row)

    # Production levels for the exact-match comparison: the harness
    # recomputation from production's decision-time inputs (the same values
    # written to the prod_* columns above).
    prod_levels = (mirror_levels(entry, atr14, prod_scored["direction"], 1.25)
                   if (entry and atr14) else None)

    # ---- fix 2, RULE 5: the verified reuse gate. A production result is
    # reused for C-2 ONLY on exact input+rule match (same decision-time
    # ledger, same direction, same levels recomputed exactly, same
    # entry-eligibility inputs, same waiting-interval evidence, same
    # operational gates). A matching direction alone never suffices --
    # direction-match with any other input/rule difference evaluates C-2
    # independently from its own factor ledger.
    ev = build_c2_reuse_evidence(
        candidate,
        prod_direction=prod_scored["direction"],
        prod_disposition=row["prod_disposition"],
        prod_disposition_reason=row["prod_disposition_reason"],
        prod_decision_recorded=prod_decision,
        c2_direction=c2["direction"],
        prod_levels=prod_levels,
        c2_levels=c2_levels)
    may_reuse, reuse_reason = c2_may_reuse_production(ev)

    # C-2's operational view: shared decision-time market data, with C-2's
    # per-arm overrides applied (a divergent override already broke the
    # reuse gate above).
    c2_view = _c2_operational_view(candidate)
    c2_sr = c2_view.get("short_regime_inputs") or {}

    if ev["c2_missing_evidence"]:
        # ---- RULE 6: the entry-observation stage is evidenced but C-2's
        # required operational inputs are missing -> disposition UNKNOWN.
        # Never filled from production's values, never inferred.
        row["levels_mode"] = ("mirrored (flipped)" if flipped
                              else "independent (non-flipped)")
        row["c2_entry"] = c2_levels["entry"]
        row["c2_invalidation"] = c2_levels["invalidation"]
        row["c2_target1"] = c2_levels["target1"]
        row["c2_target2"] = c2_levels["target2"]
        row["born_dead_mirror"] = None
        row["born_dead_mirror_reason"] = None
        row["short_regime_gate_mirror"] = None
        row["short_regime_gate_mirror_reason"] = None
        row["c2_disposition"] = "unscored"
        row["c2_disposition_reason"] = _c2_missing_evidence_reason(
            ev["c2_missing_evidence"])
        row["notes"] = _append_note(
            candidate, f"C-2 disposition unknown (RULE 6): {reuse_reason}")
        return _finalize(row)

    if may_reuse and not flipped:
        # ---- RULE 5: exact input+rule match -- record production's result
        # as C-2's, WITH the match evidence. Verified reuse, not
        # direction-match inheritance: the gate above proved the complete
        # relevant inputs identical.
        row["levels_mode"] = "reused: exact input+rule match"
        row["c2_entry"] = c2_levels["entry"]
        row["c2_invalidation"] = c2_levels["invalidation"]
        row["c2_target1"] = c2_levels["target1"]
        row["c2_target2"] = c2_levels["target2"]
        row["born_dead_mirror"] = None
        row["born_dead_mirror_reason"] = None
        result = ev["production_result"]
        if result.startswith("issued"):
            row["short_regime_gate_mirror"] = "allowed"
            row["short_regime_gate_mirror_reason"] = (
                "reused (RULE 5): production's recorded issuance ran the "
                "repaired operational evaluator live on the identical "
                "direction/levels; no divergent C-2 inputs")
            row["c2_disposition"] = "issued"
            row["c2_disposition_reason"] = REASON["ok"]
        else:
            row["short_regime_gate_mirror"] = "suppressed"
            row["short_regime_gate_mirror_reason"] = (
                f"reused (RULE 5): production's recorded {result} on the "
                "identical direction/levels applies to C-2; no divergent "
                "C-2 inputs")
            row["c2_disposition"] = "abstain"
            row["c2_disposition_reason"] = row["prod_disposition_reason"]
        row["notes"] = _append_note(
            candidate,
            f"C-2 reuses production result '{result}': {reuse_reason}")
        return _finalize(row)

    # ---- independent evaluation (RULE 4 + RULE 5) ----
    # C-2 is scored from its own factor ledger and run through the
    # IDENTICAL operational rules as production's live path (fix 1's
    # repaired evaluator: entry contract, venue mapping, waiting-interval
    # veto), on C-2's own direction and mirrored stop, against C-2's
    # operational view of the evidence. Production's verdict plays no role
    # here -- a flipped direction, or direction-match with any other
    # input/rule difference, evaluates C-2 independently.
    # (v2.1.2: the historical born-dead mirror stays deleted; the
    # born_dead_mirror columns stay None. Pipeline order puts the retained
    # short-regime gate first for shorts. Missing/unverifiable operational
    # evidence fails closed -- never "issued" on unverifiable evidence.)
    row["levels_mode"] = ("mirrored (flipped)" if flipped
                          else "independent (non-flipped)")
    row["c2_entry"] = c2_levels["entry"]
    row["c2_invalidation"] = c2_levels["invalidation"]
    row["c2_target1"] = c2_levels["target1"]
    row["c2_target2"] = c2_levels["target2"]
    row["born_dead_mirror"] = None
    row["born_dead_mirror_reason"] = None

    if c2["direction"] == "short":
        sr_verdict, sr_reason = short_regime_gate(c2_sr.get("price_below_sma50"),
                                                  c2_sr.get("lower_highs"),
                                                  c2_sr.get("trend20_negative"))
        row["short_regime_gate_mirror"] = sr_verdict
        row["short_regime_gate_mirror_reason"] = sr_reason
        if sr_verdict == "suppressed":
            row["c2_disposition"] = "abstain"
            row["c2_disposition_reason"] = REASON["short-regime-mirror"]
            row["notes"] = _append_note(
                candidate,
                f"C-2 independent evaluation: short-regime gate on C-2's own "
                f"inputs: {sr_reason} (reuse denied: {reuse_reason})")
            return _finalize(row)
        if sr_verdict == "unverifiable":
            row["c2_disposition"] = "abstain"
            row["c2_disposition_reason"] = REASON["gate-inputs-unverifiable"]
            row["notes"] = _append_note(
                candidate,
                "C-2 independent evaluation: flipped to short but "
                "belowSma50/lowerHighs/trend20Negative not persisted; gate "
                f"outcome unknown (reuse denied: {reuse_reason})")
            return _finalize(row)
    else:
        row["short_regime_gate_mirror"] = "allowed"
        row["short_regime_gate_mirror_reason"] = "no long-regime gate"

    op_verdict, op_reason, op_note = operational_issuance_eval(
        c2["direction"], c2_levels["invalidation"], c2_view)
    if op_verdict != "pass":
        row["c2_disposition"] = "abstain"
        row["c2_disposition_reason"] = op_reason
        row["notes"] = _append_note(
            candidate,
            f"C-2 independent evaluation: operational evaluator {op_verdict} "
            f"on C-2's own direction/stop: {op_note} "
            f"(reuse denied: {reuse_reason})")
        return _finalize(row)

    row["c2_disposition"] = "issued"
    row["c2_disposition_reason"] = REASON["ok"]
    row["notes"] = _append_note(
        candidate,
        f"C-2 independent evaluation: operational evaluator pass on C-2's "
        f"own direction/stop: {op_note} (reuse denied: {reuse_reason})")
    return _finalize(row)


def _finalize(row: dict) -> dict:
    # schema guard: no silent column drift
    extra = set(row) - set(ROW_COLUMNS)
    missing = set(ROW_COLUMNS) - set(row)
    if extra or missing:
        raise SchemaError(f"row schema drift: extra={extra} missing={missing}")
    for col in ("prod_barrier_outcome", "c2_barrier_outcome"):
        if row[col] not in BARRIER_OUTCOMES:
            raise SchemaError(f"{col}={row[col]!r} not in {BARRIER_OUTCOMES}")
    for col in ("prod_dir_d5", "prod_dir_d14", "prod_dir_d30",
                "c2_dir_d5", "c2_dir_d14", "c2_dir_d30"):
        if row[col] not in DIR_OUTCOMES:
            raise SchemaError(f"{col}={row[col]!r} not in {DIR_OUTCOMES}")
    if row["prod_disposition"] not in DISPOSITIONS or \
            row["c2_disposition"] not in DISPOSITIONS:
        raise SchemaError(f"bad disposition: {row['prod_disposition']}/{row['c2_disposition']}")
    return {c: row[c] for c in ROW_COLUMNS}


def score_batch(candidates: list[dict], strict: bool = False) -> list[dict]:
    rows = []
    for cand in candidates:
        rows.append(score_pair(cand, strict=strict))
    return rows


def write_rows_csv(rows: list[dict], path: str) -> None:
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=ROW_COLUMNS, extrasaction="ignore")
        w.writeheader()
        for r in rows:
            w.writerow({k: ("" if v is None else v) for k, v in r.items()})


def read_rows_csv(path: str) -> list[dict]:
    with open(path, newline="") as f:
        rdr = csv.DictReader(f)
        if list(rdr.fieldnames or []) != ROW_COLUMNS:
            raise SchemaError("CSV header does not match the frozen row schema")
        rows = []
        for raw in rdr:
            rows.append({k: (None if v == "" else v) for k, v in raw.items()})
    return rows


if __name__ == "__main__":
    import sys
    print("comparison harness (active freeze v%s via %s). "
          "Use build_pilot_rows.py / collect_pilot_rows.py for rows; "
          "tests via tests/run_tests.py."
          % (ACTIVE_FREEZE_VERSION, resolve_active_manifest_path()))
    sys.exit(0)
