#!/usr/bin/env python3
"""Decision-time input store for the wired intended-model trial.

Sandbox/research only. Paper signals only. No brokerage. No production
modifications. Read-only against the workspace DB copies.

When an intended model (crypto-dossier-factor-agreement 2.0.0,
equity-factor-agreement 3.1.0, or the C-2 challenger) is evaluated on a fresh
opportunity, persist_decision_time_inputs() writes the COMPLETE set of
decision-time inputs the model consumed, each with its own timestamp, to
comparison/decision-time-inputs/<opportunity_id>.json.

NEVER-BACKFILL RULE (frozen discipline): an input missing at decision time is
recorded as {"status": "UNKNOWN", "asOf": null, "value": null} with an honest
reason. It is never reconstructed afterward. The store records what the
decision consumed; a later correction belongs in a new file, never an edit
of the stored bundle.

Bundle schema (JSON):
  opportunity_id      -- unique id, e.g. "dossier-btc-id43-2026-10-14"
  terminal            -- "crypto" | "equity"
  model               -- { strategy_id, strategy_version, parameter_hash }
  decision_at         -- UTC ISO instant the decision was taken (decision clock)
  issued_at           -- UTC ISO instant the issuance was recorded (nullable)
  persisted_at        -- UTC ISO instant this bundle was written
  snapshot_version    -- model snapshot convention (crypto-input-snapshot-v3-canonical-atr-window)
  issuance_key        -- pipeline issuance key (binds strategy id/version/hash to the decision)
  factors[]           -- every factor the model consumed:
      label, weight, score, contribution, reading, source, quality, asOf,
      value/raw (when persisted), plus per-factor `missing` flags
  entry_context       -- entry price, atr14, risk multiplier, levels,
      entry-evidence (provider, receivedAt, rule), signal-day candle
  provider_metadata   -- provider cost/calendar/timestamp-meaning table
  missing_inputs[]    -- inputs the model consumed but which were absent at
      decision time, each { label, reason, status: "UNKNOWN" }
  provenance          -- read-only source table/row, snapshot id, export time
"""

import copy
import datetime
import json
import os

STORE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "decision-time-inputs")

UNKNOWN = "UNKNOWN"


def _utcnow_iso() -> str:
    return datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="milliseconds")


def build_factor_record(factor: dict) -> dict:
    """Normalize one consumed factor into the store schema.

    A factor whose asOf is absent (None) or whose value was never observed
    is NOT reconstructed: it is recorded with status UNKNOWN so downstream
    consumers know this input cannot support freshness or asOf-verified
    scoring. The contribution/score/weight the model actually consumed ARE
    recorded (they are the decision-time fact), only the missing temporal
    anchor is marked unknown.
    """
    label = factor.get("label") or factor.get("name")
    as_of = factor.get("asOf") or factor.get("as_of")
    quality = factor.get("quality")
    missing = as_of is None or quality in ("no_data", "NO_DATA", "unavailable")
    return {
        "label": label,
        "weight": factor.get("weight"),
        "score": factor.get("score"),
        "contribution": factor.get("contribution"),
        "reading": factor.get("reading"),
        "source": factor.get("source"),
        "quality": quality,
        "asOf": as_of,
        "value": factor.get("value"),
        "status": UNKNOWN if missing else "observed",
        "missing_reason": (
            "no asOf recorded at decision time; quality reported as "
            f"{quality!r} by the issuing pipeline" if missing else None
        ),
    }


def persist_decision_time_inputs(bundle: dict, path_override: str | None = None) -> str:
    """Persist one opportunity's complete decision-time input bundle.

    `bundle` carries everything in the module docstring schema EXCEPT
    persisted_at (stamped here). Factors are normalized through
    build_factor_record; missing_inputs entries are appended for every
    factor whose status is UNKNOWN. Returns the written file path.

    `path_override`: write to this exact path instead of the default
    <STORE_DIR>/<opportunity_id>.json (used by the automatic dossier-model
    collector for replay-labeled captures, which must not touch the default
    store location). The never-overwrite rule is enforced by the caller.

    Raises ValueError if the bundle lacks the required decision-clock or
    model-identity fields: the store refuses to write an unidentified bundle.
    """
    required = ("opportunity_id", "terminal", "model", "decision_at", "factors")
    for key in required:
        if bundle.get(key) is None:
            raise ValueError(f"refusing to persist: bundle lacks required field {key!r}")
    model = bundle["model"]
    for key in ("strategy_id", "strategy_version"):
        if not model.get(key):
            raise ValueError(f"refusing to persist: model lacks identity field {key!r}")

    record = copy.deepcopy(bundle)
    record["factors"] = [build_factor_record(f) for f in record["factors"]]
    record["missing_inputs"] = [
        {
            "label": f["label"],
            "reason": f["missing_reason"],
            "status": UNKNOWN,
        }
        for f in record["factors"]
        if f["status"] == UNKNOWN
    ]
    record["persisted_at"] = _utcnow_iso()
    record["store_rule"] = (
        "missing decision-time inputs are marked UNKNOWN, never backfilled; "
        "a later correction is a new file, never an edit of this bundle"
    )

    os.makedirs(STORE_DIR, exist_ok=True)
    if path_override:
        path = path_override
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    else:
        path = os.path.join(STORE_DIR, f"{bundle['opportunity_id']}.json")
    with open(path, "w") as handle:
        json.dump(record, handle, indent=2, sort_keys=True)
        handle.write("\n")
    return path


def load_decision_time_inputs(opportunity_id: str) -> dict:
    """Load a persisted bundle. The store never synthesizes: file absent -> FileNotFoundError."""
    path = os.path.join(STORE_DIR, f"{opportunity_id}.json")
    with open(path) as handle:
        return json.load(handle)


def ledger_completeness(terminal: str, factors: list, for_challenger: bool = False):
    """RULE 3 check against the arm's frozen factor set (mirrors harness._ledger_completeness).

    Returns (complete: bool, missing: list[str]). Missing labels are the
    frozen labels (canonical). A factor counts as present when its contribution
    and weight are finite and weight > 0. UNKNOWN status on a present factor
    does not remove it from the ledger (the model consumed it); it is flagged
    in the bundle's missing_inputs for downstream freshness checks.
    """
    import math
    from intended_models import canon_label

    if terminal == "crypto":
        from intended_models import CRYPTO_PRODUCTION_LABELS_FROZEN
        required = CRYPTO_PRODUCTION_LABELS_FROZEN
        if for_challenger:
            from intended_models import C2_DROPPED_FACTOR_LABEL
            required = tuple(l for l in required if canon_label(l) != C2_DROPPED_FACTOR_LABEL)
        key = "label"
    elif terminal == "equity":
        from intended_models import EQUITY_FACTOR_IDS, EQUITY_WEIGHTS
        required = EQUITY_FACTOR_IDS
        key = "id"
    else:
        raise ValueError(f"unknown terminal: {terminal!r}")

    usable = {}
    for fac in factors or []:
        name = canon_label(fac.get(key, ""))
        try:
            contrib = float(fac.get("contribution", float("nan")))
            weight = float(fac.get("weight", float("nan")))
        except (TypeError, ValueError):
            contrib, weight = float("nan"), float("nan")
        ok = math.isfinite(contrib) and math.isfinite(weight) and weight > 0
        usable[name] = usable.get(name, False) or ok
    missing = [lbl for lbl in required if not usable.get(canon_label(lbl))]
    return (len(missing) == 0), missing
