#!/usr/bin/env python3
"""Production-vs-C-2 comparison harness (workstream C/A, freeze manifests v1.0.0 / v2.0.0).

Sandbox/research only. No production changes. No threshold tuning. No
strategy changes. Never writes to any production table or holdout.

v2.0.0 delta (2026-10-14, workstream A): the scoring formulas, mirrored
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
    only on its own evidence. Non-flipped legs share production's direction,
    levels, and gate inputs BY CONSTRUCTION, so the challenger's own-evidence
    verdict on that shared evidence is the identical outcome (same reason
    code) -- recorded as shared-evidence agreement, not inheritance.
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
  load_manifest(path)          -> dict (frozen model definitions)
  score_pair(candidate, strict=False) -> dict (one comparison row)
  score_batch(candidates, strict=False) -> list[dict]
  write_rows_csv(rows, path) / read_rows_csv(path)
  ROW_COLUMNS                  -> the frozen comparison-row schema

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
from datetime import datetime, timezone

MANIFEST_VERSION = "2.0.0"

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
# Disposition + reason-code vocabularies (frozen).
# ---------------------------------------------------------------------------

DISPOSITIONS = ("issued", "abstain", "unscored", "not-applicable")

REASON = {
    # abstain: a gate suppressed the arm on its own direction
    "born-dead": "abstain:born-dead",
    "born-dead-mirror": "abstain:born-dead-mirror",
    "short-regime": "abstain:short-regime-gate",
    "short-regime-mirror": "abstain:short-regime-gate-mirror",
    "eligibility": "abstain:eligibility",
    # abstain: issuance validation could not run (signal-day OHLC missing)
    "issuance-unavailable": "abstain:issuance-validation-unavailable",
    # unscored: the arm could not be computed
    "no-factor-ledger": "unscored:no-factor-ledger",
    # unscored: a factor ledger was persisted but is INCOMPLETE for the arm's
    # frozen factor set (RULE 3) -- the arm is not scored from it, never a
    # guessed score
    "incomplete-ledger": "unscored:incomplete-factor-ledger",
    "production-unreproduced": "unscored:production-unreproduced",
    "levels-uncomputable": "unscored:levels-uncomputable",
    "gate-inputs-unverifiable": "unscored:gate-inputs-unverifiable",
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


class LookaheadError(Exception):
    """Raised in strict mode when an input is dated after decisionAt."""


class SchemaError(Exception):
    """Raised when a candidate or row violates the frozen schema."""


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


def born_dead_check(direction: str, invalidation: float | None,
                    sig_high: float | None, sig_low: float | None) -> tuple[str, str | None]:
    """-> (verdict, reason). verdict in passed|suppressed|unverifiable."""
    if invalidation is None or sig_high is None or sig_low is None:
        return "unverifiable", "signal-day OHLC or invalidation missing"
    if direction == "long":
        if sig_low <= invalidation:
            return ("suppressed",
                    f"born-dead LONG: signal-day low {sig_low} <= invalidation {invalidation}")
    else:
        if sig_high >= invalidation:
            return ("suppressed",
                    f"born-dead SHORT: signal-day high {sig_high} >= invalidation {invalidation}")
    return "passed", None


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
    r = (reason or "").lower()
    if r.startswith("born-dead"):
        return REASON["born-dead"]
    if "short-regime" in r:
        return REASON["short-regime"]
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

    sig = candidate.get("signal_day") or {}
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
    #           marked abstain/unscored only on its own evidence.
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

    lv = mirror_levels(entry, atr14, c2["direction"], 1.25)
    if lv is None and flipped:
        row["c2_disposition"] = "unscored"
        row["c2_disposition_reason"] = REASON["levels-uncomputable"]
        row["levels_mode"] = "uncomputable"
        row["notes"] = candidate.get("notes")
        return _finalize(row)

    if not flipped:
        # RULE 4: a non-flipped leg shares production's direction, levels,
        # and gate inputs BY CONSTRUCTION (the challenger differs only by
        # the dropped Momentum factor, which did not change the direction
        # call). The challenger's verdict on that shared evidence is
        # therefore the identical outcome -- recorded here as the same
        # disposition with the same reason code. This is shared-evidence
        # agreement, NOT inheritance of production's decision: the reason
        # code is the same because the evidence is the same. (Had the
        # evidence differed, the challenger would differ too -- see the
        # flipped leg below, which runs its own mirrored levels and gates.)
        row["levels_mode"] = "inherited-identical (non-flipped)"
        row["c2_entry"] = row["prod_entry"]
        row["c2_invalidation"] = row["prod_invalidation"]
        row["c2_target1"] = row["prod_target1"]
        row["c2_target2"] = row["prod_target2"]
        if prod_decision == "issued":
            row["born_dead_mirror"] = "passed"
            row["born_dead_mirror_reason"] = ("non-flipped: invalidation identical "
                                              "to production; veto cleared at issuance")
            row["short_regime_gate_mirror"] = "allowed"
            row["short_regime_gate_mirror_reason"] = ("non-flipped: gate cleared by "
                                                     "production on the identical direction")
            row["c2_disposition"] = "issued"
            row["c2_disposition_reason"] = REASON["ok"]
        else:
            row["born_dead_mirror"] = "suppressed"
            row["born_dead_mirror_reason"] = (
                "non-flipped: direction/levels/gate inputs identical to "
                "production by construction; the challenger's own-evidence "
                "verdict on that shared evidence is the same suppression "
                "(RULE 4: shared-evidence agreement, not inheritance)")
            row["short_regime_gate_mirror"] = "suppressed"
            row["short_regime_gate_mirror_reason"] = (
                "non-flipped: direction/levels/gate inputs identical to "
                "production by construction; the challenger's own-evidence "
                "verdict on that shared evidence is the same suppression "
                "(RULE 4: shared-evidence agreement, not inheritance)")
            row["c2_disposition"] = "abstain"
            row["c2_disposition_reason"] = _classify_suppression(
                candidate.get("production_suppression_reason"))
        row["notes"] = candidate.get("notes")
        return _finalize(row)

    # ---- flipped: challenger gets its own mirrored levels and gates ----
    row["levels_mode"] = "mirrored (flipped)"
    row["c2_entry"] = lv["entry"]
    row["c2_invalidation"] = lv["invalidation"]
    row["c2_target1"] = lv["target1"]
    row["c2_target2"] = lv["target2"]

    bd_verdict, bd_reason = born_dead_check(c2["direction"], lv["invalidation"],
                                            sig.get("high"), sig.get("low"))
    row["born_dead_mirror"] = bd_verdict
    row["born_dead_mirror_reason"] = bd_reason
    if bd_verdict == "suppressed":
        row["c2_disposition"] = "abstain"
        row["c2_disposition_reason"] = REASON["born-dead-mirror"]
        row["notes"] = bd_reason
        return _finalize(row)
    if bd_verdict == "unverifiable":
        row["c2_disposition"] = "abstain"
        row["c2_disposition_reason"] = REASON["gate-inputs-unverifiable"]
        row["notes"] = ("flipped direction but signal-day OHLC unrecoverable; "
                        "gate outcome unknown -- never assumed passed")
        return _finalize(row)

    if c2["direction"] == "short":
        sr_verdict, sr_reason = short_regime_gate(sr.get("price_below_sma50"),
                                                  sr.get("lower_highs"),
                                                  sr.get("trend20_negative"))
        row["short_regime_gate_mirror"] = sr_verdict
        row["short_regime_gate_mirror_reason"] = sr_reason
        if sr_verdict == "suppressed":
            row["c2_disposition"] = "abstain"
            row["c2_disposition_reason"] = REASON["short-regime-mirror"]
            row["notes"] = sr_reason
            return _finalize(row)
        if sr_verdict == "unverifiable":
            row["c2_disposition"] = "abstain"
            row["c2_disposition_reason"] = REASON["gate-inputs-unverifiable"]
            row["notes"] = ("flipped to short but belowSma50/lowerHighs/"
                            "trend20Negative not persisted; gate outcome unknown")
            return _finalize(row)
    else:
        row["short_regime_gate_mirror"] = "allowed"
        row["short_regime_gate_mirror_reason"] = "no long-regime gate"

    row["c2_disposition"] = "issued"
    row["c2_disposition_reason"] = REASON["ok"]
    row["notes"] = candidate.get("notes")
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


def load_manifest(path: str) -> dict:
    with open(path) as f:
        m = json.load(f)
    if m.get("manifest_version") != MANIFEST_VERSION:
        raise SchemaError(f"manifest version {m.get('manifest_version')!r} "
                          f"!= harness {MANIFEST_VERSION}")
    return m


if __name__ == "__main__":
    import sys
    print("comparison harness (freeze manifest v%s). "
          "Use seed_rows.py to build rows; tests via tests/run_tests.py."
          % MANIFEST_VERSION)
    sys.exit(0)
