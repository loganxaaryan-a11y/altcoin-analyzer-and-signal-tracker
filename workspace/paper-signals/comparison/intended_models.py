#!/usr/bin/env python3
"""Wired trial connection: the frozen trial's ACTUAL named model functions.

Sandbox/research only. Paper signals only. No brokerage. No model tuning,
no production inversion, no model replacement. Holdouts locked.

This module is the callable wiring between the frozen comparison trial
(freeze-manifest-v2.1.x; ACTIVE_MANIFEST names the active freeze) and the
two intended prediction models:

  1. `crypto-dossier-factor-agreement` 2.0.0-measurement-contract
     (parameter hash sha256:4a098b4d389cb85293c78785c82e88a32fe6d96544a8dd84c341dce9fa0b7220)
     crypto production arm of the frozen trial, 11 factors, total weight 17.0.
  2. `equity-factor-agreement` 3.1.0-measurement-closure
     equity arm of the frozen trial, 7 factors, total weight 90.

The challenger arm (crypto-dossier-minus-momentum 0.1.0-shadow, 10 factors,
weight 15.5) is the frozen C-2 definition from the manifest, not a new model:
the Momentum factor's contribution leaves the net AND its weight 1.5 leaves
the denominator; remaining weights are NOT rescaled.

Every function below is a faithful port of the exact named source function,
verified against deployed-recorded issuances (see tests/test_intended_models.py).
TS Math.round (half-up) is reproduced by ts_round; Python banker's rounding is
never used. Nothing here is invented: docstrings cite the exact source
file, line, strategy id, version, and parameter hash.
"""

import math

# ---------------------------------------------------------------------------
# Strategy identity (frozen; must match freeze-manifest-v2.1.x executable core)
# ---------------------------------------------------------------------------

CRYPTO_STRATEGY_ID = "crypto-dossier-factor-agreement"
CRYPTO_STRATEGY_VERSION = "2.0.0-measurement-contract"
CRYPTO_PARAMETER_HASH = (
    "sha256:4a098b4d389cb85293c78785c82e88a32fe6d96544a8dd84c341dce9fa0b7220"
)
CRYPTO_EVALUATOR_VERSION = "crypto-evaluation-v4-cohort-contract"
CRYPTO_SNAPSHOT_VERSION = "crypto-input-snapshot-v3-canonical-atr-window"
CRYPTO_ENTRY_CONVENTION = "first-post-decision-provider-quote"
CRYPTO_PRICE_CONVENTION = "usd-spot-reference"
CRYPTO_COST_SCENARIO_ID = "modeled-roundtrip-18bps-funding-unverified-v1"

C2_STRATEGY_ID = "crypto-dossier-minus-momentum"
C2_STRATEGY_VERSION = "0.1.0-shadow"
C2_DROPPED_FACTOR_LABEL = "Momentum"
C2_DROPPED_WEIGHT = 1.5
C2_TOTAL_WEIGHT = 15.5  # 17.0 - 1.5, weights not rescaled (frozen)

EQUITY_STRATEGY_ID = "equity-factor-agreement"
EQUITY_STRATEGY_VERSION = "3.1.0-measurement-closure"
EQUITY_PARAMETER_HASH = "atr2-target1.5R-weights-6-8-8-20-8-20-20"
EQUITY_INVALIDATION_ATR_MULTIPLE = 2
EQUITY_INVALIDATION_BASIS = "2.00x Wilder ATR-14 from the reference entry"
EQUITY_WEIGHTS = (6, 8, 8, 20, 8, 20, 20)

# Frozen crypto constants (freeze-manifest-v2.0.0.json, executable core)
CRYPTO_FORMULA_SCALE = 42.0
CRYPTO_SCORE_FLOOR = 5
CRYPTO_SCORE_CEIL = 95
CRYPTO_TOTAL_WEIGHT = 17.0
# Legacy factor excluded from the frozen production factor set (historical
# ledgers may still carry it; reproduction verified only with exclusion).
LEGACY_WALKFORWARD_LABELS = ("walk-forward base rate",)


def ts_round(value: float) -> int:
    """TypeScript Math.round semantics (half-up) for float scores.

    Python's round() is banker's rounding; the models' source uses
    Math.round, so this helper must be used for every score rounding.
    All model scores are >= the clamp floor (positive), so floor(x + 0.5)
    is exactly Math.round on this domain.
    """
    return int(math.floor(float(value) + 0.5))


def ts_round_places(value: float, places: int = 2) -> float:
    """TS actions.ts:109 round(value, places) = Math.round(value * 10**places) / 10**places."""
    factor = 10 ** places
    return ts_round(value * factor) / factor


# ---------------------------------------------------------------------------
# 1. crypto-dossier-factor-agreement 2.0.0 -- scoreDossierFactors
#    source: hidden_files/source-export-2026-10-13/crypto/server/src/signal-methodology.ts:47
# ---------------------------------------------------------------------------

def score_dossier_factors(factors):
    """scoreDossierFactors(factors: ScoredFactor[]) -> { weightedNet, totalWeight, longScore, shortScore, direction }

    Exact port of signal-methodology.ts:47-54. Each factor is a dict with
    numeric `contribution` and `weight` (the port accepts the same
    { score, weight, contribution } shape the TS code consumes; contribution
    is score*weight and must be finite).
    """
    usable = [
        f for f in factors
        if _finite(f.get("contribution")) and _finite(f.get("weight")) and float(f["weight"]) > 0
    ]
    weighted_net = sum(float(f["contribution"]) for f in usable)
    total_weight = sum(float(f["weight"]) for f in usable)
    if total_weight > 0:
        raw = 50 + (weighted_net / total_weight) * CRYPTO_FORMULA_SCALE
    else:
        raw = 50
    long_score = ts_round(max(CRYPTO_SCORE_FLOOR, min(CRYPTO_SCORE_CEIL, raw)))
    short_score = 100 - long_score
    return {
        "weightedNet": weighted_net,
        "totalWeight": total_weight,
        "longScore": long_score,
        "shortScore": short_score,
        "direction": "long" if long_score >= short_score else "short",
    }


def _finite(value) -> bool:
    try:
        return math.isfinite(float(value))
    except (TypeError, ValueError):
        return False


def canon_label(label) -> str:
    """Canonical factor identity: strip one trailing " (...)" annotation.

    Same rule as harness.py _canon_label (frozen): the pipeline persists one
    factor as "Supply-overhang penalty (negative-only)" while the frozen
    manifest records "Supply-overhang penalty"; the parenthetical is an
    annotation, not a different factor.
    """
    s = str(label or "").strip()
    if s.endswith(")") and "(" in s:
        s = s[: s.rfind("(")].strip()
    return s


# ---------------------------------------------------------------------------
# 1b. crypto challenger C-2 -- crypto-dossier-minus-momentum 0.1.0-shadow
#    frozen manifest: challengerLong = round(clamp(50 + (weightedNet/15.5)*42, 5, 95));
#    challengerShort = 100 - challengerLong; challengerDirection = longScore >= shortScore ? long : short.
#    The Momentum factor's contribution leaves the net AND its weight 1.5
#    leaves the denominator; remaining weights are NOT rescaled.
# ---------------------------------------------------------------------------

# Frozen factor sets for the two crypto arms (mirror freeze-manifest-v2.0.0.json
# exactly; same sets as harness.py's frozen constants). The challenger set is
# the production set minus Momentum -- judged on its own 10 factors.
CRYPTO_PRODUCTION_LABELS_FROZEN = (
    "Trend cluster", "Momentum", "MACD", "Perp funding crowding",
    "Open interest", "Binance futures positioning",
    "Cross-venue taker imbalance", "TVL trend", "Revenue linkage",
    "Developer velocity", "Supply-overhang penalty",
)
assert len(CRYPTO_PRODUCTION_LABELS_FROZEN) == 11
CRYPTO_C2_LABELS_FROZEN = tuple(
    label for label in CRYPTO_PRODUCTION_LABELS_FROZEN
    if canon_label(label) != C2_DROPPED_FACTOR_LABEL
)
assert len(CRYPTO_C2_LABELS_FROZEN) == 10


def c2_score_minus_momentum(factors):
    """crypto-dossier-minus-momentum 0.1.0-shadow scoring.

    Drops the canon-"Momentum" factor (contribution AND weight leave the
    formula), then runs the identical scoreDossierFactors core. Mirrors
    harness.py's challenger scoring (is_momentum filter, line ~498).
    """
    kept = [f for f in factors if canon_label(f.get("label")) != C2_DROPPED_FACTOR_LABEL]
    dropped = len(factors) - len(kept)
    result = score_dossier_factors(kept)
    return {
        "challengerLong": result["longScore"],
        "challengerShort": result["shortScore"],
        "challengerDirection": result["direction"],
        "challengerWeightedNet": result["weightedNet"],
        "challengerTotalWeight": result["totalWeight"],
        "momentumDropped": dropped,
    }


# ---------------------------------------------------------------------------
# 1c. crypto-dossier-factor-agreement 2.0.0 -- buildAtrLevels / canonicalWilderAtr
#    source: signal-methodology.ts:56 (buildAtrLevels), canonicalWilderAtr (same file)
# ---------------------------------------------------------------------------

def build_atr_levels(direction, entry, atr14, risk_multiplier=1.25):
    """buildAtrLevels(direction, entry, atr14, riskMultiplier = 1.25).

    Exact port of signal-methodology.ts:56-68. stop = entry -/+ 1.25x ATR;
    target1 = entry +/- 1.5x risk; target2 = entry +/- 2.5x risk.
    """
    if not (entry > 0) or not (atr14 > 0) or not (risk_multiplier > 0):
        return None
    risk_per_unit = atr14 * risk_multiplier
    sign = 1 if direction == "long" else -1
    return {
        "entry": entry,
        "stop": entry - sign * risk_per_unit,
        "target": entry + sign * risk_per_unit * 1.5,
        "target2": entry + sign * risk_per_unit * 2.5,
        "riskPerUnit": risk_per_unit,
        "riskMultiplier": risk_multiplier,
        "payoffConvention": "linear-entry-notional",
    }


def canonical_wilder_atr(bars, decision_at_ms, period=14):
    """canonicalWilderAtr(bars, decisionAt, period = 14) -- exact port.

    The complete ordered decision-time window is consumed: first TR starts at
    bar 2, the first ATR is the arithmetic mean of the first `period` TRs,
    and all remaining TRs are Wilder-smoothed. No tail truncation.
    Each bar: { high, low, close, availableAt } (ms).
    """
    eligible = sorted(
        (b for b in bars
         if b.get("availableAt", float("inf")) <= decision_at_ms
         and _finite(b.get("high")) and _finite(b.get("low")) and _finite(b.get("close"))),
        key=lambda b: b["availableAt"],
    )
    if len(eligible) < period + 1:
        return None
    ranges = []
    for i in range(1, len(eligible)):
        row, prev = eligible[i], eligible[i - 1]
        ranges.append(max(
            row["high"] - row["low"],
            abs(row["high"] - prev["close"]),
            abs(row["low"] - prev["close"]),
        ))
    if len(ranges) < period:
        return None
    atr = sum(ranges[:period]) / period
    for r in ranges[period:]:
        atr = ((atr * (period - 1)) + r) / period
    return atr


# ---------------------------------------------------------------------------
# 2. equity-factor-agreement 3.1.0 -- normalizeSignalFactors / factorScoreBreakdown / signalDecision / buildFrozenLevels
#    source: hidden_files/source-export-2026-10-13/equity/server/src/actions.ts
#    normalizeSignalFactors (~line 347), SIGNAL_STRATEGY_ID/VERSION/HASH (349-353),
#    factorScoreBreakdown (143), signalDecision, buildFrozenLevels
# ---------------------------------------------------------------------------

EQUITY_TREND_CLUSTER_NAMES = (
    "Price vs SMA 20",
    "Price vs SMA 50",
    "Price vs SMA 200",
    "MACD 12–26",  # note: source uses U+2013 EN DASH (actions.ts:148)
    "ATR-adjusted 30-session trend",
)
EQUITY_FACTOR_IDS = (
    "price_vs_sma20", "price_vs_sma50", "price_vs_sma200",
    "rsi14_wilder", "macd_12_26", "volume_direction_z", "atr_adjusted_trend30",
)


def normalize_signal_factors(factors):
    """normalizeSignalFactors -- exact port of equity actions.ts (~line 347).

    Drops the legacy "30-session return" when an ATR-adjusted trend factor is
    present; renames "ATR-adjusted follow-through" to the canonical
    "ATR-adjusted 30-session trend"; contribution = weight * score.
    Factors are dicts with name/weight/score.
    """
    has_atr_trend = any(
        f.get("name") in ("ATR-adjusted 30-session trend", "ATR-adjusted follow-through")
        for f in factors
    )
    out = []
    for f in factors:
        name = f.get("name", "")
        weight = f.get("weight")
        score = f.get("score")
        try:
            ok = math.isfinite(float(weight)) and float(weight) > 0
        except (TypeError, ValueError):
            ok = False
        if not ok:
            continue
        if has_atr_trend and name == "30-session return":
            continue
        if name == "ATR-adjusted follow-through":
            name = "ATR-adjusted 30-session trend"
        out.append({
            "name": name,
            "weight": float(weight),
            "score": score,
            "contribution": float(weight) * float(score),
        })
    return out


def factor_score_breakdown(factors):
    """factorScoreBreakdown -- exact port of equity actions.ts:143-157.

    rawScore = round(100 * SUM(weight*score) / SUM(weight)), scores in {-1,0,+1}.
    redundancyAdjustment = -5 if all five trend-cluster factors are +1;
    +5 if all are -1 (toward zero); else 0. score = rawScore + redundancyAdjustment.
    Returns None when total weight is not positive (mirrors TS null).
    """
    normalized = normalize_signal_factors(factors)
    total_weight = sum(f["weight"] for f in normalized)
    if not (total_weight > 0):
        return None
    raw_score = ts_round(100 * sum(f["weight"] * f["score"] for f in normalized) / total_weight)
    trend_names = set(EQUITY_TREND_CLUSTER_NAMES)
    trend = [
        (f["name"] if f["name"] != "30-session return" else "ATR-adjusted 30-session trend", f["score"])
        for f in normalized
    ]
    trend_scores = [score for name, score in trend if name in trend_names]
    if len(trend_scores) == len(trend_names) and all(s == 1 for s in trend_scores):
        redundancy_adjustment = -5
    elif len(trend_scores) == len(trend_names) and all(s == -1 for s in trend_scores):
        redundancy_adjustment = 5
    else:
        redundancy_adjustment = 0
    return {
        "rawScore": raw_score,
        "redundancyAdjustment": redundancy_adjustment,
        "score": raw_score + redundancy_adjustment,
    }


def signal_decision(score):
    """signalDecision -- exact port (equity actions.ts): score >= 20 -> long; <= -20 -> short; else mixed."""
    return "long" if score >= 20 else ("short" if score <= -20 else "mixed")


def build_frozen_levels(entry_price, atr14, direction):
    """buildFrozenLevels -- exact port of equity actions.ts (2.00x Wilder ATR-14).

    stop = entry -/+ 2.00x ATR; target1 = entry +/- 1.5x risk; target2 = +/- 2.5x risk.
    """
    if not (entry_price > 0) or not (atr14 > 0):
        return None
    sign = 1 if direction == "long" else -1
    stop_price = entry_price - sign * atr14 * EQUITY_INVALIDATION_ATR_MULTIPLE
    risk_per_unit = abs(entry_price - stop_price)
    return {
        "entryPrice": ts_round_places(entry_price),
        "stopPrice": ts_round_places(stop_price),
        "target1": ts_round_places(entry_price + sign * 1.5 * risk_per_unit),
        "target2": ts_round_places(entry_price + sign * 2.5 * risk_per_unit),
        "riskPerUnit": ts_round_places(risk_per_unit, 4),
        "direction": direction,
        "atr14": ts_round_places(atr14, 4),
        "invalidationAtrMultiple": EQUITY_INVALIDATION_ATR_MULTIPLE,
        "invalidationBasis": EQUITY_INVALIDATION_BASIS,
    }
