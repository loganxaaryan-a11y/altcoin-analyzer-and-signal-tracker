#!/usr/bin/env python3
"""Comparison metrics per model (freeze manifest v2.1.0).

Primary economic comparison (MEASUREMENT-GAPS-2026-10-14, section (d)):
mean per-opportunity paired difference d = c(C-2) - c(production) over
opportunities where neither arm is UNKNOWN -- genuine abstention = 0.000 R
real zero; never-evaluated / ungraded = UNKNOWN (counted, labeled, excluded).
Cluster-robust 95% interval (G >= 10). The both-issued-only comparison is the
secondary sensitivity check.

Metrics per model arm (production / challenger):
  - target_before_stop_rate: fraction of issued rows whose barrier product
    resolved "target" (vs "invalidated"); time_exit / ambiguous / unverified
    counted separately, never merged into accuracy.
  - directional_accuracy_d{5,14,30}: hit fraction among graded rows.
  - mean_net_r: mean net R per issued row, costs included (18 bps roundtrip
    modeled, funding unverified per the frozen cost scenario).
  - opportunity_coverage: issued / abstain / unscored fractions of the
    eligible stream.
  - alert_delay_hours: issued_at - decision_at distribution (when both
    persisted).

Uncertainty (readout): paired differences use cluster-robust intervals per
COLLECTION-PLAN-2026-10-14 (Liang-Zeger one-way cluster variance,
G/(G-1) adjustment, t_{G-1} critical value, minimum G=10 clusters for a
reported interval; fewer than 10 clusters -> INCONCLUSIVE on that metric,
no interval reported). Per-arm Wilson 95% CIs below are DESCRIPTIVE ONLY
(within-arm, independence-assuming); comparison verdicts are never read
from them.

Collection is window-based, never target-N: the fixed collection window
is 2026-10-14 -> 2026-12-31 UTC, readout by 2027-02-06, REGARDLESS of N.
There is no "collect until 30 rows" logic anywhere in this file.

Rows with outcome == "not-graded"/"pending"/"open" are excluded from that metric and
counted explicitly -- never silently dropped.

Reads comparison-row CSVs produced by harness.py.
"""

import csv
import json
import math
import os
from collections import Counter
from datetime import datetime, timezone


def wilson(n: int, k: int, z: float = 1.96) -> tuple[float, float] | None:
    """Wilson 95% CI for k/n. Returns None when n == 0."""
    if n <= 0:
        return None
    p = k / n
    denom = 1 + z * z / n
    center = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    return (max(0.0, center - half), min(1.0, center + half))


# ---------------------------------------------------------------------------
# Measurement exclusion (audit/exclusion-list-v2-2026-10-14.json).
#
# The audit established 119 quarantined records (117 fabricated synthetic
# fixtures + 2 market-data replay / sandbox dry-run copies, 48 distinct
# record IDs) that MUST NOT contribute to any performance statistic:
# directional accuracy, net returns, target-before-stop, or any count used
# in a denominator. The exclusion is STRUCTURAL, not documentary: every
# public metrics entry point (compare, compare_primary, model_metrics,
# direction_disagreement) filters its input rows through
# apply_measurement_exclusion() at computation time. Excluded rows are
# counted and labeled in the output -- never silently dropped.
#
# Record identity: the exclusion list matches on (signal_id, contract_id,
# store_path). Comparison rows carry the record's signal id in
# `contract_id` (collector stamps signal_contracts.signal_id; retrospective
# rows likewise). A row is excluded when ANY of its contract_id /
# candidate_id / row_id appears in the flagged ID set, OR when its
# provenance text carries one of the multi-word synthetic-fixture /
# market-data-replay markers below.
#
# Multi-word markers only: bare "sandbox"/"dryrun" collide with harness
# boilerplate on legitimate rows. ("sandbox-seeded" is deliberately NOT a
# structural marker: it is the harness's DEFAULT row_origin for any
# constructed row -- including its own regression-test rows -- so it does
# not identify a synthetic fixture.) The legitimate retrospective
# suppressed cohort carries cohort_origin "suppressed-dryrun-2026-10-14"
# and the boilerplate outcome_note "sandbox-seeded rows carry no
# outcomes..." -- both verified marker-free and measurement-eligible.
# ---------------------------------------------------------------------------

_EXCLUSION_LIST_FILENAME = "exclusion-list-v2-2026-10-14.json"
_EXCLUSION_CACHE: dict = {}


def _package_root() -> str:
    return os.path.dirname(os.path.abspath(__file__))


def default_exclusion_list_path() -> str:
    return os.path.join(os.path.dirname(_package_root()), "audit",
                        _EXCLUSION_LIST_FILENAME)


def load_exclusion_ids(path: str | None = None, reload: bool = False) -> frozenset:
    """Union of signal_id / contract_id values flagged exclude_from_metrics.

    Cached per path for a single process; pass reload=True to re-read the
    file. Missing or unreadable file -> empty set (never a crash; the
    structural classifiers still run).
    """
    path = path or default_exclusion_list_path()
    if path in _EXCLUSION_CACHE and not reload:
        return _EXCLUSION_CACHE[path]
    ids: set = set()
    try:
        with open(path) as f:
            doc = json.load(f)
        for rec in doc.get("rows", []):
            if not rec.get("exclude_from_metrics", True):
                continue
            for key in ("signal_id", "contract_id"):
                val = rec.get(key)
                if val:
                    ids.add(val)
    except (OSError, ValueError):
        ids = set()
    out = frozenset(ids)
    _EXCLUSION_CACHE[path] = out
    return out


# Multi-word markers only -- bare "sandbox"/"dryrun" collide with harness
# boilerplate on legitimate rows (see header note above).
_STRUCTURAL_MARKERS = (
    "synthetic fixture",
    "fabricated",
    "sandbox execution",
    "sandbox replay",
    "dryrun copy",
    "replay of the deployed issuance path",
    "fixture candidate",
    "demo sandbox",
)

_STRUCTURAL_FIELDS = (
    "provenance_verdict", "notes", "decision_time_note",
    "eligibility_reason", "outcome_note", "cohort_origin",
)


def exclusion_reason(row: dict, excluded_ids: frozenset | None = None) -> str | None:
    """Why this row is excluded from measurement, or None if eligible.

    Returns a human-readable reason (used for labeling; never silent).
    """
    if excluded_ids is None:
        excluded_ids = load_exclusion_ids()
    for key in ("contract_id", "candidate_id", "row_id"):
        rid = row.get(key)
        if rid and rid in excluded_ids:
            return (f"exclusion-list match: {key} {rid!r} flagged "
                    f"exclude_from_metrics in {_EXCLUSION_LIST_FILENAME}")
    haystack = " | ".join(
        str(row.get(f) or "") for f in _STRUCTURAL_FIELDS).lower()
    for marker in _STRUCTURAL_MARKERS:
        if marker in haystack:
            return (f"structural: provenance text matches {marker!r} "
                    f"(synthetic fixture / market-data replay marker)")
    return None


def apply_measurement_exclusion(rows: list[dict],
                                excluded_ids: frozenset | None = None,
                                exclusion_list_path: str | None = None
                                ) -> tuple[list[dict], dict]:
    """Partition rows into (measurement-eligible, exclusion report).

    The exclusion report counts and labels every dropped row -- exclusion
    is never silent.
    """
    if excluded_ids is None:
        excluded_ids = load_exclusion_ids(exclusion_list_path)
    eligible: list[dict] = []
    excluded: list[dict] = []
    for r in rows:
        reason = exclusion_reason(r, excluded_ids)
        if reason:
            excluded.append({
                "row_id": r.get("row_id"),
                "contract_id": r.get("contract_id"),
                "candidate_id": r.get("candidate_id"),
                "terminal": r.get("terminal"),
                "reason": reason,
            })
        else:
            eligible.append(r)
    return eligible, {
        "exclusion_list": os.path.basename(exclusion_list_path
                                           or default_exclusion_list_path()),
        "exclusion_list_ids": len(excluded_ids),
        "n_excluded": len(excluded),
        "excluded": excluded,
        "note": ("excluded rows contribute to NO performance statistic "
                 "(accuracy, net R, target-before-stop, denominators); "
                 "counted and labeled here, never silently dropped"),
    }


def rate_summary(n: int, k: int) -> dict:
    ci = wilson(n, k)
    out = {"n": n, "k": k, "rate": (k / n) if n else None,
           "ci95": ci, "n_label": "small-n" if 0 < n < 20 else ("n=0" if n == 0 else "ok")}
    return out


def mean_se(vals: list[float]) -> dict:
    n = len(vals)
    if n == 0:
        return {"n": 0, "mean": None, "se": None, "ci95": None, "n_label": "n=0"}
    mean = sum(vals) / n
    if n == 1:
        return {"n": 1, "mean": mean, "se": None, "ci95": None, "n_label": "small-n"}
    var = sum((v - mean) ** 2 for v in vals) / (n - 1)
    se = math.sqrt(var / n)
    return {"n": n, "mean": mean, "se": se,
            "ci95": (mean - 1.96 * se, mean + 1.96 * se),
            "n_label": "small-n" if n < 20 else "ok"}


# ---------------------------------------------------------------------------
# Cluster-robust uncertainty (COLLECTION-PLAN-2026-10-14, mirrors the H-2
# method). The paired differences d_i are not independent -- rows sharing
# market exposure co-move. Clusters are the connected components under the
# grouping rule below (union-find). Interval: Var(dbar) = [G/(G-1)] *
# (1/n^2) * sum_g S_g^2, S_g = sum_{i in g}(d_i - dbar); SE = sqrt(Var);
# 95% CI = dbar +/- t_{G-1,0.975} * SE. Minimum G = 10 clusters for a
# reported interval; fewer -> INCONCLUSIVE on that metric, no interval.
# ---------------------------------------------------------------------------

MIN_CLUSTERS = 10          # minimum independent clusters for a reported interval
CLUSTER_WINDOW_DAYS = 30   # outcome window defining market exposure
CLUSTER_LINK_DAYS = 7      # issuance proximity for the same-direction link
CLUSTER_MIN_OVERLAP = 20   # minimum window-overlap days for the same-direction link

_T975 = {1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571, 6: 2.447,
         7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228, 11: 2.201, 12: 2.179,
         13: 2.160, 14: 2.145, 15: 2.131, 16: 2.120, 17: 2.110, 18: 2.101,
         19: 2.093, 20: 2.086, 21: 2.080, 22: 2.074, 23: 2.069, 24: 2.064,
         25: 2.060, 26: 2.056, 27: 2.052, 28: 2.048, 29: 2.045, 30: 2.042}


def t975(df: int) -> float:
    """Two-sided 95% Student-t critical value (df >= 1)."""
    if df < 1:
        raise ValueError(f"t critical undefined for df={df}")
    return _T975.get(df, 1.96)  # df > 30: normal approximation


def _parse_ts(v):
    if v is None or v == "":
        return None
    try:
        if isinstance(v, (int, float)):
            return datetime.fromtimestamp(v / 1000 if v > 1e12 else v,
                                          tz=timezone.utc)
        return datetime.fromisoformat(str(v).replace("Z", "+00:00"))
    except (ValueError, TypeError, OverflowError):
        return None


def assign_clusters(rows: list[dict]) -> dict:
    """Group comparison rows into market-exposure clusters (union-find).

    Grouping rule (COLLECTION-PLAN-2026-10-14, adapted from the H-2 rule):
      (1) same symbol -> same cluster (asset-specific exposure);
      (2) same production direction + issued_at within 7 days + 30-day
          outcome windows overlapping >= 20 days -> same cluster (shared
          market-regime exposure).
    Links use decision-time fields only (symbol, issued_at, prod_direction) --
    never outcomes. Production direction is the grouping key: the challenger
    deviation is the treatment, not the exposure. Rows missing symbol or
    issued_at cannot be linked and form singleton clusters.
    Returns {row_id: cluster_index}.
    """
    parent = {}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[ra] = rb

    items = [r for r in rows if r.get("row_id") is not None]
    for r in items:
        parent[r["row_id"]] = r["row_id"]

    # link (1): same symbol
    by_symbol = {}
    for r in items:
        sym = r.get("symbol")
        if sym:
            by_symbol.setdefault(sym, []).append(r["row_id"])
    for ids in by_symbol.values():
        for other in ids[1:]:
            union(ids[0], other)

    # link (2): same production direction + issuance within 7d + overlap >= 20d
    dated = [(r, _parse_ts(r.get("issued_at"))) for r in items]
    dated = [(r, ts) for r, ts in dated if ts is not None]
    for i in range(len(dated)):
        ri, ti = dated[i]
        di = ri.get("prod_direction")
        if not di:
            continue
        for j in range(i + 1, len(dated)):
            rj, tj = dated[j]
            if rj.get("prod_direction") != di:
                continue
            gap_days = abs((ti - tj).total_seconds()) / 86400.0
            if gap_days > CLUSTER_LINK_DAYS:
                continue
            overlap = max(0.0, CLUSTER_WINDOW_DAYS - gap_days)
            if overlap >= CLUSTER_MIN_OVERLAP:
                union(ri["row_id"], rj["row_id"])

    roots = {}
    out = {}
    for r in items:
        root = find(r["row_id"])
        if root not in roots:
            roots[root] = len(roots)
        out[r["row_id"]] = roots[root]
    return out


def cluster_mean_interval(pairs: list[tuple]) -> dict:
    """Cluster-robust 95% interval for the mean of paired differences.

    pairs: iterable of (value, cluster_id); None values are dropped.
    Returns {n, G, mean, se, ci95 or None, verdict}. G < MIN_CLUSTERS ->
    INCONCLUSIVE: point estimate shown for reference, NO interval reported.
    """
    vals = [(float(v), c) for v, c in pairs if v is not None]
    n = len(vals)
    if n == 0:
        return {"n": 0, "G": 0, "mean": None, "se": None, "ci95": None,
                "verdict": "n=0 (no graded rows)"}
    mean = sum(v for v, _ in vals) / n
    groups: dict = {}
    for v, c in vals:
        groups.setdefault(c, []).append(v)
    G = len(groups)
    if G < 2:
        return {"n": n, "G": G, "mean": mean, "se": None, "ci95": None,
                "verdict": "INCONCLUSIVE: fewer than 2 clusters (SE undefined) -- "
                           "no interval reported"}
    s2 = sum((sum(v - mean for v in g)) ** 2 for g in groups.values())
    var = (G / (G - 1)) * (s2 / (n * n))
    se = math.sqrt(max(var, 0.0))
    if G < MIN_CLUSTERS:
        return {"n": n, "G": G, "mean": mean, "se": se, "ci95": None,
                "verdict": (f"INCONCLUSIVE: {G} clusters < {MIN_CLUSTERS} minimum "
                            "-- no interval reported")}
    t = t975(G - 1)
    return {"n": n, "G": G, "mean": mean, "se": se,
            "ci95": (mean - t * se, mean + t * se), "verdict": "reported"}


def direction_disagreement(rows: list[dict], terminal: str = "crypto") -> dict:
    """Fraction of paired issued rows where the arms' direction calls disagree.

    Denominator: paired issued rows with BOTH directions present. A fraction
    > 0.40 is an AUDIT TRIGGER per COLLECTION-PLAN-2026-10-14 -- it mandates
    the four-part audit and a written finding; it is NOT proof of a bug and
    does NOT change the freeze.
    """
    rows, excl = apply_measurement_exclusion(rows)
    rs = [r for r in rows if r.get("terminal") == terminal]
    paired = [r for r in rs
              if r.get("prod_disposition") == "issued"
              and r.get("c2_disposition") == "issued"]
    both = [r for r in paired
            if r.get("prod_direction") and r.get("c2_direction")]
    n_dis = sum(1 for r in both
                if r["prod_direction"] != r["c2_direction"])
    frac = (n_dis / len(both)) if both else None
    return {
        "n_paired_issued": len(paired),
        "n_both_directed": len(both),
        "n_disagree": n_dis,
        "fraction": frac,
        "measurement_exclusion": {"n_excluded": excl["n_excluded"]},
        "audit_trigger": (frac is not None and frac > 0.40),
        "audit_note": ("fraction > 0.40 -> AUDIT TRIGGER: run the four-part "
                       "direction-disagreement audit (COLLECTION-PLAN-2026-10-14); "
                       "written finding; freeze unchanged")
        if frac is not None and frac > 0.40 else None,
    }


def _f(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _arm_outcome(row: dict, arm: str, field: str):
    return row.get(f"{arm}_{field}")


# ---------------------------------------------------------------------------
# Primary economic comparison (MEASUREMENT-GAPS-2026-10-14, section (d);
# authoritative). Work at the OPPORTUNITY level: one opportunity = one
# comparison row (one candidate at one decision time).
#
# Per-arm contribution c(arm, row):
#   1. Arm `issued` and outcome graded -> c = the arm's graded net R.
#   2. Arm `issued` but outcome not yet graded / unverifiable (time_exit,
#      ambiguous, unverified, open, not-graded) -> c = UNKNOWN.
#   3. Genuine abstention -- the arm EVALUATED the issuance decision and
#      declined (abstain:*: born-dead, issuance-validation-unavailable,
#      short-regime-gate, eligibility, gate-inputs-unverifiable) -> c =
#      0.000 R exactly, zero cost. A real zero: it participates in the mean.
#   4. Never evaluated (unscored:*) or no counterpart (not-applicable:*) ->
#      c = UNKNOWN.
# UNKNOWN is counted and labeled per metric, excluded from that metric's
# interval -- never scored as 0, never silently dropped. (Rationale:
# unscored:production-not-issued is not a decision to stay out; scoring it 0
# would credit the arm with a costless correct abstention it never made.)
#
# Primary: over all opportunities in the cohort, d = c(C-2) - c(production);
# the mean of d is taken over opportunities where NEITHER arm is UNKNOWN,
# with the COLLECTION-PLAN cluster-robust 95% interval (G >= 10).
# Abstention zeros participate as real zeros. The both-issued-only comparison
# is reported SECONDARILY as a sensitivity check.
#
# Single-arm cohorts (equity): no paired gap exists. Primary = mean
# per-opportunity production contribution over opportunities where production
# is not UNKNOWN (genuine abstentions as zeros); reported production-only,
# never as a challenger gap.
# ---------------------------------------------------------------------------

UNKNOWN = None  # sentinel: never evaluated / ungraded -- counted, labeled, excluded
ABSTAIN_ZERO = 0.0  # genuine abstention: a REAL zero that participates in the mean


def arm_contribution(row: dict, arm: str) -> float | None:
    """Per-arm economic contribution for one opportunity.

    Returns the graded net R, 0.0 for a genuine abstention, or None for
    UNKNOWN (never evaluated / ungraded outcome / no counterpart).
    """
    disp = row.get(f"{arm}_disposition")
    if disp == "issued":
        net_r = _f(row.get(f"{arm}_net_r"))
        return net_r if net_r is not None else UNKNOWN
    if disp == "abstain":
        # The arm evaluated the issuance decision and declined (RULES 1-4:
        # the harness only assigns abstain on recorded suppression or the
        # arm's own mirrored gates). Genuine abstention = real zero.
        return ABSTAIN_ZERO
    # unscored:* (never evaluated) and not-applicable:* (no counterpart).
    return UNKNOWN


def primary_accounting(rows: list[dict], terminal: str = "crypto") -> dict:
    """Classify every opportunity in the cohort into the primary set.

    Returns the per-row contributions plus the counts the readout must
    label. Measurement-excluded rows (synthetic fixtures / replays) are
    filtered before accounting and reported separately -- never silently
    dropped, never scored.
    """
    rows, excl = apply_measurement_exclusion(rows)
    rs = [r for r in rows if r.get("terminal") == terminal]
    table = []
    for r in rs:
        c_prod = arm_contribution(r, "prod")
        c_c2 = (arm_contribution(r, "c2")
                if terminal == "crypto" else "not-applicable")
        table.append({
            "row_id": r.get("row_id"),
            "prod": c_prod,
            "c2": c_c2,
            "prod_disposition": r.get("prod_disposition"),
            "c2_disposition": r.get("c2_disposition"),
        })
    return {"terminal": terminal, "n_opportunities": len(rs), "table": table,
            "measurement_exclusion": {"n_excluded": excl["n_excluded"]}}


def compare_primary(rows: list[dict], terminal: str = "crypto") -> dict:
    """The PRIMARY economic comparison (audit rule).

    Crypto: d = c(C-2) - c(production) over opportunities where neither arm
    is UNKNOWN; cluster-robust 95% interval (G >= 10), secondary otherwise.
    Equity: production-only mean contribution over opportunities where
    production is not UNKNOWN; never a challenger gap.
    """
    acct = primary_accounting(rows, terminal)
    table = acct["table"]

    if terminal == "crypto":
        d_rows = []
        unknown_prod = unknown_c2 = 0
        for t in table:
            cp, cc = t["prod"], t["c2"]
            if cp is None:
                unknown_prod += 1
            if cc is None:
                unknown_c2 += 1
            if cp is not None and cc is not None:
                d_rows.append(t)
        # Per-arm breakdown WITHIN the primary set (abstention zeros
        # participate in the mean; only UNKNOWN rows are excluded).
        in_primary = lambda arm: [t[arm] for t in d_rows]
        acct_arm = lambda arm: {
            "n_unknown": unknown_prod if arm == "prod" else unknown_c2,
            "n_abstain_zero": sum(1 for v in in_primary(arm) if v == ABSTAIN_ZERO),
            "n_graded": sum(1 for v in in_primary(arm) if v != ABSTAIN_ZERO),
        }
        clusters = assign_clusters([r for r in rows if r.get("terminal") == terminal])
        pairs = [(t["c2"] - t["prod"], clusters.get(t["row_id"])) for t in d_rows]
        interval = cluster_mean_interval(pairs)
        return {
            "terminal": terminal,
            "primary": True,
            "n_opportunities": acct["n_opportunities"],
            "n_primary": len(d_rows),
            "accounting": {
                "prod": acct_arm("prod"),
                "c2": acct_arm("c2"),
                "unknown_note": ("UNKNOWN counted and labeled, excluded from the "
                                 "interval -- never scored as 0, never silently dropped"),
            },
            "net_r_gap_primary": interval,
            "uncertainty_note": ("cluster-robust 95% interval (Liang-Zeger, G/(G-1), "
                                 "t_{G-1}); G < 10 -> INCONCLUSIVE on the primary gap, "
                                 "no interval reported"),
        }

    # terminal == "equity": single-arm, production-only primary.
    contribs = []
    unknown = abstain_zero = 0
    for t in table:
        cp = t["prod"]
        if cp is None:
            unknown += 1
        else:
            if cp == ABSTAIN_ZERO:
                abstain_zero += 1
            contribs.append(cp)
    return {
        "terminal": terminal,
        "primary": True,
        "single_arm": "production-only (no challenger frozen for equity); never a challenger gap",
        "n_opportunities": acct["n_opportunities"],
        "n_primary": len(contribs),
        "accounting": {
            "prod": {"n_unknown": unknown, "n_abstain_zero": abstain_zero,
                     "n_graded": len(contribs) - abstain_zero},
            "unknown_note": ("UNKNOWN counted and labeled, excluded from the mean "
                             "-- never scored as 0, never silently dropped"),
        },
        "prod_contribution_primary": mean_se(contribs),
        "uncertainty_note": ("descriptive mean +/- 1.96*SE (independence-assuming); "
                             "the equity cohort carries no paired comparison"),
    }


def model_metrics(rows: list[dict], arm: str, terminal: str = "crypto") -> dict:
    """arm in ('prod', 'c2'). terminal selects which scoring fields exist.

    Measurement-excluded rows (synthetic fixtures / market-data replays per
    the audit exclusion list and structural classifiers) are filtered at
    computation time and reported in `measurement_exclusion`.
    """
    rows, excl = apply_measurement_exclusion(rows)
    rs = [r for r in rows if r.get("terminal") == terminal]
    disp_col = f"{arm}_disposition"
    eligible = rs  # every row is an eligible-stream member with a disposition
    disp = Counter(r.get(disp_col) for r in eligible)
    issued = [r for r in eligible if r.get(disp_col) == "issued"]

    # barrier product: resolved = target|invalidated|time_exit; the rate is
    # target-before-stop among rows that hit either barrier first.
    barrier_col = f"{arm}_barrier_outcome"
    b_vals = Counter(r.get(barrier_col) for r in issued)
    hit_either = [r for r in issued
                  if r.get(barrier_col) in ("target", "invalidated")]
    target_first = sum(1 for r in hit_either if r.get(barrier_col) == "target")

    # direction product per horizon
    dir_rates = {}
    for h in ("d5", "d14", "d30"):
        col = f"{arm}_dir_{h}"
        graded = [r for r in issued if r.get(col) in ("hit", "miss")]
        hits = sum(1 for r in graded if r.get(col) == "hit")
        dir_rates[h] = rate_summary(len(graded), hits)

    # net R (costs included by the evaluator; 18 bps roundtrip modeled)
    net_rs = [_f(r.get(f"{arm}_net_r")) for r in issued]
    net_rs = [v for v in net_rs if v is not None]
    gross_outcome_missing = sum(1 for r in issued if _f(r.get(f"{arm}_net_r")) is None)

    # alert delay
    delays = [_f(r.get("alert_delay_hours")) for r in issued]
    delays = [v for v in delays if v is not None]

    return {
        "arm": arm, "terminal": terminal,
        "n_rows": len(rs),
        "measurement_exclusion": excl,
        "coverage": {
            "issued": disp.get("issued", 0), "abstain": disp.get("abstain", 0),
            "unscored": disp.get("unscored", 0),
            "not_applicable": disp.get("not-applicable", 0),
            "n_eligible": len(eligible),
            "issued_fraction": disp.get("issued", 0) / len(eligible) if eligible else None,
            "abstain_fraction": disp.get("abstain", 0) / len(eligible) if eligible else None,
            "unscored_fraction": disp.get("unscored", 0) / len(eligible) if eligible else None,
        },
        "target_before_stop": rate_summary(len(hit_either), target_first),
        "barrier_outcome_counts": dict(b_vals),
        "directional_accuracy": dir_rates,
        "net_r": mean_se(net_rs),
        "net_r_missing_outcome": gross_outcome_missing,
        "alert_delay_hours": mean_se(delays),
    }


def compare(rows: list[dict], terminal: str = "crypto") -> dict:
    """Paired readout for the production vs challenger arms.

    Collection is WINDOW-BASED (COLLECTION-PLAN-2026-10-14: collection
    2026-10-14 -> 2026-12-31 UTC, readout by 2027-02-06, REGARDLESS of N).
    There is deliberately no target-N gate here: verdicts come from the
    paired cluster-robust intervals (G >= 10 required per metric); metrics
    with fewer clusters read INCONCLUSIVE.

    The PRIMARY economic comparison is `primary` (audit rule,
    MEASUREMENT-GAPS-2026-10-14 section (d)): mean per-opportunity paired
    difference d = c(C-2) - c(production) over opportunities where neither
    arm is UNKNOWN (genuine abstentions = 0.000 R real zeros; never-evaluated
    = UNKNOWN, counted/labeled/excluded), with the cluster-robust interval.
    The both-issued-only comparison (`paired_cluster`, below) is the
    SECONDARY sensitivity check.
    """
    rows, excl = apply_measurement_exclusion(rows)
    prod = model_metrics(rows, "prod", terminal)
    c2 = model_metrics(rows, "c2", terminal)
    rs = [r for r in rows if r.get("terminal") == terminal]
    paired = [r for r in rs
              if r.get("prod_disposition") == "issued"
              and r.get("c2_disposition") == "issued"]
    clusters = assign_clusters(rs)

    def _hit(row, arm, h):
        v = row.get(f"{arm}_dir_{h}")
        return 1.0 if v == "hit" else (0.0 if v == "miss" else None)

    def _tbs_first(row, arm):
        v = row.get(f"{arm}_barrier_outcome")
        return 1.0 if v == "target" else (0.0 if v == "invalidated" else None)

    def _diff_pairs(fn):
        return [(fn(r), clusters.get(r["row_id"])) for r in paired
                if fn(r) is not None]

    def _diff(fn_c2, fn_prod):
        def both(r):
            a, b = fn_c2(r), fn_prod(r)
            return (a - b) if (a is not None and b is not None) else None
        return both

    net_r_gap = _diff_pairs(_diff(lambda r: _f(r.get("c2_net_r")),
                                  lambda r: _f(r.get("prod_net_r"))))
    tbs_gap = _diff_pairs(_diff(lambda r: _tbs_first(r, "c2"),
                                lambda r: _tbs_first(r, "prod")))
    dir_gaps = {}
    for h in ("d5", "d14", "d30"):
        dir_gaps[h] = _diff_pairs(_diff(lambda r, h=h: _hit(r, "c2", h),
                                        lambda r, h=h: _hit(r, "prod", h)))

    paired_cluster = {
        "role": ("SECONDARY sensitivity check (both-issued-only). The PRIMARY "
                 "economic comparison is 'primary' (audit rule); this exists "
                 "to show how the both-issued restriction changes the answer."),
        "net_r_gap": cluster_mean_interval(net_r_gap),
        "target_before_stop_gap": cluster_mean_interval(tbs_gap),
        "directional_accuracy_gap": {h: cluster_mean_interval(dir_gaps[h])
                                     for h in ("d5", "d14", "d30")},
        "uncertainty_note": ("cluster-robust 95% intervals (Liang-Zeger, "
                             "G/(G-1), t_{G-1}); G < 10 -> INCONCLUSIVE on "
                             "that metric, no interval reported"),
    }
    return {
        "terminal": terminal,
        "n_rows": len(rs),
        "measurement_exclusion": excl,
        "n_paired_issued": len(paired),
        "prod": prod, "c2": c2,
        "direction_disagreement": direction_disagreement(rows, terminal),
        "primary": compare_primary(rows, terminal),
        "paired_cluster": paired_cluster,
        "readout_note": ("Fixed-window collection 2026-10-14 -> 2026-12-31 UTC "
                         "(COLLECTION-PLAN-2026-10-14); readout by 2027-02-06 "
                         "REGARDLESS of N. No target-N collection logic. "
                         "Verdicts from the PRIMARY paired cluster-robust "
                         "interval (G>=10 required per metric); the "
                         "both-issued-only readout is secondary."),
    }


def fmt_rate(s: dict) -> str:
    if s["n"] == 0:
        return "n=0 (no graded rows)"
    ci = s["ci95"]
    return (f"{s['rate']:.1%} ({s['k']}/{s['n']}) "
            f"95% CI [{ci[0]:.1%}, {ci[1]:.1%}] [{s['n_label']}]")


def fmt_mean(s: dict) -> str:
    if s["n"] == 0:
        return "n=0 (no graded rows)"
    if s["se"] is None:
        return f"mean={s['mean']:.3f} (n=1)"
    lo, hi = s["ci95"]
    return f"mean={s['mean']:.3f} +/- {1.96 * s['se']:.3f} 95% CI [{lo:.3f}, {hi:.3f}] (n={s['n']}, {s['n_label']})"


def fmt_cluster(s: dict) -> str:
    """Format a cluster-robust interval summary."""
    if s["mean"] is None:
        return s["verdict"]
    base = f"mean={s['mean']:+.3f} (n={s['n']}, G={s['G']})"
    if s["ci95"] is None:
        return f"{base} | {s['verdict']}"
    lo, hi = s["ci95"]
    return f"{base} 95% CI [{lo:+.3f}, {hi:+.3f}] | {s['verdict']}"


def print_report(rep: dict) -> None:
    print(f"== comparison report [{rep['terminal']}] freeze v2.1.0 ==")
    print(f"rows: {rep['n_rows']} | paired issued: {rep['n_paired_issued']} | "
          f"measurement-excluded: {rep['measurement_exclusion']['n_excluded']} "
          f"(labeled in report, not scored)")
    pr = rep["primary"]
    print(f"\n-- PRIMARY ECONOMIC COMPARISON (audit rule; abstain=0.000 R, unscored=UNKNOWN) --")
    print(f"opportunities: {pr['n_opportunities']} | in primary set: {pr['n_primary']}")
    for arm in ("prod", "c2"):
        if arm in pr["accounting"]:
            a = pr["accounting"][arm]
            print(f"  {arm}: unknown={a['n_unknown']} abstain-zero={a['n_abstain_zero']} graded={a['n_graded']}")
    if rep["terminal"] == "crypto":
        print(f"primary net R gap (C-2 minus production): {fmt_cluster(pr['net_r_gap_primary'])}")
    else:
        print(f"production-only primary contribution: {fmt_mean(pr['prod_contribution_primary'])}")
    print(f"  ({pr['uncertainty_note']})")
    for arm_key, label in (("prod", "PRODUCTION"), ("c2", "CHALLENGER C-2")):
        m = rep[arm_key]
        cov = m["coverage"]
        print(f"\n-- {label} (descriptive; Wilson CIs, not verdicts) --")
        print(f"coverage: issued {cov['issued']}/{cov['n_eligible']} "
              f"({(cov['issued_fraction'] or 0):.1%}), "
              f"abstain {cov['abstain']} ({(cov['abstain_fraction'] or 0):.1%}), "
              f"unscored {cov['unscored']} ({(cov['unscored_fraction'] or 0):.1%})")
        print(f"target-before-stop: {fmt_rate(m['target_before_stop'])} "
              f"| barrier counts: {m['barrier_outcome_counts']}")
        for h in ("d5", "d14", "d30"):
            print(f"direction {h}: {fmt_rate(m['directional_accuracy'][h])}")
        print(f"net R (18bps modeled): {fmt_mean(m['net_r'])} "
              f"| missing outcome: {m['net_r_missing_outcome']}")
        print(f"alert delay (h): {fmt_mean(m['alert_delay_hours'])}")
    dd = rep["direction_disagreement"]
    frac = f"{dd['fraction']:.1%}" if dd["fraction"] is not None else "n/a"
    print(f"\n-- DIRECTION DISAGREEMENT --")
    print(f"disagree {dd['n_disagree']}/{dd['n_both_directed']} paired "
          f"({frac}) | audit_trigger={dd['audit_trigger']}")
    if dd["audit_note"]:
        print(f"  !! {dd['audit_note']}")
    pc = rep["paired_cluster"]
    print(f"\n-- SECONDARY: PAIRED CLUSTER-ROBUST, both-issued-only (C-2 minus production) --")
    print(f"net R gap: {fmt_cluster(pc['net_r_gap'])}")
    print(f"target-before-stop gap: {fmt_cluster(pc['target_before_stop_gap'])}")
    for h in ("d5", "d14", "d30"):
        print(f"direction {h} gap: {fmt_cluster(pc['directional_accuracy_gap'][h])}")
    print(f"uncertainty: {pc['uncertainty_note']}")
    print(f"\nnote: {rep['readout_note']}")


def read_rows(path: str) -> list[dict]:
    with open(path, newline="") as f:
        return list(csv.DictReader(f))


if __name__ == "__main__":
    import sys
    if len(sys.argv) != 2:
        print("usage: metrics.py <comparison-rows.csv>")
        sys.exit(2)
    print_report(compare(read_rows(sys.argv[1])))
