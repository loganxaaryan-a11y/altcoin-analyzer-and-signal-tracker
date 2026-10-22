#!/usr/bin/env python3
"""Prospective paired-collection runner (workstream B, freeze manifest v2.0.0).

Sandbox/research only. Paper signals only. No brokerage. No strategy
changes. Holdouts locked. This runner changes NOTHING about the frozen
models -- it collects comparison rows prospectively from the eligible
stream, scores them through the frozen harness, and appends them to the
pilot dataset with idempotency and quarantine guards.

What it does
------------
1. Takes candidate dicts (the harness candidate schema; see README "Candidate
   schema") from the eligible stream:
     - crypto: issued/suppressed signals from the discovery/issuance path
       (workspace DB copy: generated_signals / suppressed_signal_candidates)
     - equity: radar-qualified candidates (research/factor-ledgers-*.json)
   Each candidate carries its decision-time factor ledger (or an explicit
   None when the ledger was not persisted) plus an optional operational
   trace (see "Operational trace fields" below).
2. Validates decision-time inputs per the harness rule: score_batch with
   strict=False LABELS unverified rows (decision_time_verified=false) --
   never raises, never fabricates asOf. strict=True is available and raises
   LookaheadError on post-decision inputs.
3. Scores each candidate under BOTH arms via harness.score_batch (crypto:
   production + C-2; equity: production only, challenger not-applicable --
   no equity challenger is frozen).
4. Appends new rows to the pilot file
   (rows/comparison-rows-pilot-2026-10-14.csv + .jsonl twin), or a dated
   successor file -- see "Pilot file decision" below.
5. Prints a collection summary: rows added, verified/unverified split,
   disposition mix per arm, direction-disagreement fraction vs the 40%
   audit trigger, and collection-window membership.

Quarantine (hard guards, never warnings)
----------------------------------------
- Every row written must have row_origin == "pilot". Anything else
  ("sandbox-seeded", "plumbing-test", missing) raises QuarantineError and
  NOTHING is written.
- The runner REFUSES to use rows/comparison-rows-2026-10-13.csv (or its
  .jsonl twin) as input or output: the 55 v1 sandbox-seeded rows are
  quarantined from pilot statistics (see FREEZE-v1.0.0-SUPERSEDED.md).
  There is no code path in this module that reads the v1 file.
- row_origin is stamped by the CANDIDATE, not by this runner: a candidate
  that arrives with a non-pilot origin is rejected, never relabeled.

Idempotency
-----------
Re-running the collector on the same candidate set appends nothing.
Dedupe key: (str(candidate_id), freeze_version). freeze_version is stamped
by the collector from harness.MANIFEST_VERSION -- the freeze the row was
scored under. Rows written before the extended schema existed carry no
freeze_version column; they are treated as freeze "2.0.0" (the only freeze
the pilot has ever run under; build_pilot_rows.py is the sole prior
writer -- documented, not assumed silently: the inference is logged on
every run). A future freeze version re-scores the same candidate_id into a
NEW row (different measurement version), which is correct.

Operational trace fields (schema extension)
-------------------------------------------
decision_at / issued_at are already frozen columns. Six columns are
APPENDED to the row schema (harness ROW_COLUMNS order preserved, then):

  issuance_outcome   "issued" | "abstain:<reason>" | "unscored:<reason>" | ""
                     The pipeline's RECORDED issuance outcome, taken from the
                     candidate's production_decision -- NOT re-derived by the
                     harness. Mapping: issued->"issued";
                     suppressed|rejected->"abstain:<suppression reason>";
                     qualified->"unscored:production-not-issued";
                     unknown/None->"" (null). Where it disagrees with the
                     harness's prod_disposition, that disagreement is itself
                     a fidelity signal (both are kept).
  entry_observed_at  ISO-8601 instant the entry print was observed
                     (entry-v1 entryObservedAt). "" when never observed.
  alert_enqueued_at  ISO-8601 instant the alert entered the outbox. ""
  alert_delivered_at ISO-8601 instant the alert was delivered. ""
  contract_id        Signal-contract id (signal_contracts.signal_id) when the
                     candidate reached contract creation. ""
  freeze_version     Manifest version the row was scored under, e.g. "2.0.0".

Null-with-reason rule: extended fields are empty ("") when the candidate
never reached that stage. The REASON for each null lives in the frozen note
columns (notes / alert_delay_note / outcome_note / decision_time_note) --
never fabricated, never silently blank.

Candidate "trace" input (optional dict on the candidate):
  {"issuance_outcome": ..., "entry_observed_at": ..., "alert_enqueued_at": ...,
   "alert_delivered_at": ..., "contract_id": ..., "trace_note": ...}
Missing keys -> null fields. trace_note is folded into the row's notes.

Suppressed-candidate input format
---------------------------------
A suppressed candidate is a normal candidate dict with:

  {
    "candidate_id": "suppressed-<stable-id>",  # unique, stable across runs
    "terminal": "crypto",
    "symbol": "ALEO",
    "asset_id": "aleo",
    "decision_at": "2026-10-14T02:24:50.000Z",  # when the pipeline decided
    "issued_at": None,                          # never issued
    "row_origin": "pilot",
    "factors": [...],  # decision-time ledger IF persisted, else None
    "production_recorded": None,  # no issued score to reproduce
    "production_decision": "suppressed",
    "production_suppression_reason":
        "born-dead LONG: signal-day low 0.03244645 <= invalidation 0.0327967457",
    "eligibility": "passed",
    "eligibility_reason": "reached issuance validation; suppressed there",
    "entry": 0.0328, "atr14": None,  # atr14 omitted when not persisted
    "signal_day": {"day": "2026-10-13", "high": 0.0331, "low": 0.03244645},
    "short_regime_inputs": None,  # or the persisted gate inputs
    "trace": {"issuance_outcome":
              "abstain:born-dead LONG: signal-day low 0.03244645 <= invalidation 0.0327967457",
              "trace_note": "suppressed before contract creation; no alert path reached"},
    "notes": "real suppressed candidate from the discovery/issuance path ...",
  }

Scoring behavior for suppressed candidates (harness, unchanged):
- production arm: "abstain" with the classified reason (born-dead /
  short-regime / eligibility / issuance-unavailable) -- recorded from the
  pipeline's own suppression reason even when no ledger exists.
- challenger arm: scored from the ledger where available (non-flipped legs
  inherit the suppression as abstain; flipped legs run their own mirrored
  gates); unscored:no-factor-ledger when no ledger was persisted.

Collection window
-----------------
Fixed window 2026-10-14 -> 2026-12-31 UTC (COLLECTION-PLAN-2026-10-14.md).
The collector does NOT drop out-of-window candidates at ingest: dropping
data at collection contradicts the harness's never-silently-drop rule, and
the pilot file already contains pre-window rows from workstream A. Window
membership is computed per row (decision_at; issued_at fallback unused --
qualified rows carry issued_at=None) and reported in the summary; the
readout-side window filter is applied in analysis (metrics.py), not here.

Pilot file decision
-------------------
New rows APPEND to rows/comparison-rows-pilot-2026-10-14.csv (never a
dated successor per batch): one collection dataset for the whole window
keeps dedupe and the readout simple. The filename date is the pilot start,
not a batch date. The quarantined v1 file is never touched.

Schema migration: the pilot file gains the six extended columns lazily --
on the first run that appends rows, the whole file is rewritten with the
extended header (pre-existing rows get "" in the new columns, plus any
backfilled real values). A run that appends zero rows leaves the file
byte-identical. metrics.py reads the extended file fine (plain DictReader);
harness.read_rows_csv remains the strict frozen-schema reader (it rejects
the extended header by design -- use read_pilot_rows here).
"""

import csv
import json
import os
import sqlite3
import sys
from collections import Counter
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from harness import (score_batch, ROW_COLUMNS, MANIFEST_VERSION, REASON,
                     LookaheadError)

BASE = os.path.dirname(os.path.abspath(__file__))
PILOT_CSV = os.path.join(BASE, "rows", "comparison-rows-pilot-2026-10-14.csv")
PILOT_JSONL = os.path.join(BASE, "rows", "comparison-rows-pilot-2026-10-14.jsonl")

# The quarantined v1 sandbox-seeded rows. This module must never read them
# as pilot input nor write them as pilot output.
QUARANTINED_V1_BASENAMES = frozenset({
    "comparison-rows-2026-10-13.csv",
    "comparison-rows-2026-10-13.jsonl",
})

# Schema extension: appended after the frozen ROW_COLUMNS, order fixed.
TRACE_COLUMNS = [
    "issuance_outcome",
    "entry_observed_at",
    "alert_enqueued_at",
    "alert_delivered_at",
    "contract_id",
    "freeze_version",
]
EXTENDED_COLUMNS = ROW_COLUMNS + TRACE_COLUMNS

# Rows written before the extended schema existed were all scored under the
# v2.0.0 freeze (build_pilot_rows.py, 2026-10-14, is the sole prior writer).
INFERRED_FREEZE_FOR_LEGACY_ROWS = "2.0.0"

# Fixed collection window (COLLECTION-PLAN-2026-10-14.md), UTC.
WINDOW_START = datetime(2026, 10, 14, 0, 0, 0, tzinfo=timezone.utc)
WINDOW_END = datetime(2026, 12, 31, 23, 59, 59, tzinfo=timezone.utc)

AUDIT_TRIGGER_FRACTION = 0.40

CRYPTO_DB = os.path.expanduser(
    "~/workspace/ts-spaces/altcoin-analyzer-and-signal-tracker/app.db")


class QuarantineError(Exception):
    """Raised when a quarantine guard fires. Nothing is written."""


class CollectionError(Exception):
    """Raised for malformed candidates or unreadable pilot state."""


# ---------------------------------------------------------------------------
# Quarantine + validation
# ---------------------------------------------------------------------------

def _refuses_v1(path: str) -> None:
    base = os.path.basename(os.path.abspath(path))
    if base in QUARANTINED_V1_BASENAMES:
        raise QuarantineError(
            f"refusing to use quarantined v1 file as pilot data: {base} "
            "(see FREEZE-v1.0.0-SUPERSEDED.md; the 55 v1 rows must never "
            "enter pilot statistics)")


def validate_candidate(cand: dict) -> None:
    """Structural validation. Raises CollectionError / QuarantineError."""
    if not isinstance(cand, dict):
        raise CollectionError(f"candidate is not a dict: {type(cand)}")
    if cand.get("candidate_id") is None:
        raise CollectionError("candidate missing candidate_id")
    if cand.get("terminal") not in ("crypto", "equity"):
        raise CollectionError(
            f"candidate {cand.get('candidate_id')!r}: unknown terminal "
            f"{cand.get('terminal')!r}")
    origin = cand.get("row_origin")
    if origin != "pilot":
        raise QuarantineError(
            f"candidate {cand.get('candidate_id')!r}: row_origin={origin!r} "
            "is not 'pilot' -- refusing to write into the pilot dataset "
            "(sandbox-seeded / plumbing-test rows stay out)")


# ---------------------------------------------------------------------------
# Extended-schema row IO (tolerant reader; the frozen harness reader stays
# strict and is NOT used for the pilot file once extended)
# ---------------------------------------------------------------------------

def read_pilot_rows(path: str) -> list[dict]:
    """Read pilot rows, tolerating the pre-extension frozen header.

    Legacy rows (frozen header, no trace columns) get None for every
    extended field and an inferred freeze_version (documented above).
    The quarantined v1 file is refused outright.
    """
    _refuses_v1(path)
    if not os.path.exists(path):
        return []
    with open(path, newline="") as f:
        rdr = csv.DictReader(f)
        header = list(rdr.fieldnames or [])
        if header[:len(ROW_COLUMNS)] != ROW_COLUMNS:
            raise CollectionError(
                f"pilot file header does not start with the frozen schema: {path}")
        extended = all(c in header for c in TRACE_COLUMNS)
        rows = []
        for raw in rdr:
            row = {c: (None if raw.get(c, "") == "" else raw.get(c))
                   for c in EXTENDED_COLUMNS}
            if not extended:
                row["freeze_version"] = INFERRED_FREEZE_FOR_LEGACY_ROWS
            rows.append(row)
    return rows


def _row_to_extended(row: dict) -> dict:
    return {c: ("" if row.get(c) is None else row.get(c))
            for c in EXTENDED_COLUMNS}


def write_pilot_rows(rows: list[dict], csv_path: str, jsonl_path: str) -> None:
    _refuses_v1(csv_path)
    _refuses_v1(jsonl_path)
    os.makedirs(os.path.dirname(os.path.abspath(csv_path)), exist_ok=True)
    with open(csv_path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=EXTENDED_COLUMNS)
        w.writeheader()
        for r in rows:
            w.writerow(_row_to_extended(r))
    with open(jsonl_path, "w") as f:
        for r in rows:
            f.write(json.dumps(_row_to_extended(r)) + "\n")


def existing_keys(rows: list[dict]) -> set[tuple]:
    """Dedupe identity: (str(candidate_id), freeze_version)."""
    keys = set()
    for r in rows:
        cid = r.get("candidate_id")
        fv = r.get("freeze_version") or INFERRED_FREEZE_FOR_LEGACY_ROWS
        if cid is not None:
            keys.add((str(cid), str(fv)))
    return keys


# ---------------------------------------------------------------------------
# Scoring + trace stamping
# ---------------------------------------------------------------------------

def derive_issuance_outcome(cand: dict) -> str | None:
    """The pipeline's RECORDED issuance outcome (not harness re-derivation)."""
    d = cand.get("production_decision")
    reason = cand.get("production_suppression_reason")
    if d == "issued":
        return "issued"
    if d in ("suppressed", "rejected"):
        return f"abstain:{reason or 'reason not recorded'}"
    if d == "qualified":
        return REASON["production-not-issued"]
    return None


def stamp_trace(row: dict, cand: dict) -> dict:
    """Stamp operational-trace fields + freeze version onto a scored row."""
    for col in TRACE_COLUMNS:
        row.setdefault(col, None)  # null until a real value is wired
    trace = cand.get("trace") or {}
    row["issuance_outcome"] = (
        trace.get("issuance_outcome") or derive_issuance_outcome(cand))
    for col in ("entry_observed_at", "alert_enqueued_at",
                "alert_delivered_at", "contract_id"):
        if trace.get(col) is not None:
            row[col] = trace[col]
    trace_note = trace.get("trace_note")
    if trace_note:
        prior = row.get("notes") or ""
        row["notes"] = (prior + " | trace: " + trace_note).strip(" |")
    # The collector stamps the freeze it scored under; never trusts input.
    row["freeze_version"] = MANIFEST_VERSION
    # schema guard: no silent drift beyond the extended columns
    extra = set(row) - set(EXTENDED_COLUMNS)
    if extra:
        raise CollectionError(f"row schema drift beyond extension: {extra}")
    return row


def score_candidates(candidates: list[dict], strict: bool = False) -> list[dict]:
    """Validate, score via the frozen harness, stamp trace fields."""
    for c in candidates:
        validate_candidate(c)
    rows = score_batch(candidates, strict=strict)
    return [stamp_trace(r, c) for r, c in zip(rows, candidates)]


# ---------------------------------------------------------------------------
# Collection
# ---------------------------------------------------------------------------

def _parse_ts(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return datetime.fromtimestamp(v / 1000 if v > 1e12 else v,
                                      tz=timezone.utc)
    return datetime.fromisoformat(str(v).replace("Z", "+00:00"))


def in_window(row: dict) -> bool | None:
    """Collection-window membership by decision_at (None if unparseable)."""
    ts = _parse_ts(row.get("decision_at"))
    if ts is None:
        return None
    return WINDOW_START <= ts <= WINDOW_END


def collect(candidates: list[dict], pilot_csv: str = PILOT_CSV,
            pilot_jsonl: str = PILOT_JSONL, dry_run: bool = False,
            strict: bool = False) -> dict:
    """Score candidates and append genuinely new rows to the pilot file.

    Returns a summary dict (also printed by print_summary). With
    dry_run=True nothing is written; the summary reports what WOULD be
    appended.
    """
    _refuses_v1(pilot_csv)
    _refuses_v1(pilot_jsonl)
    for c in candidates:
        validate_candidate(c)  # quarantine BEFORE any scoring/writing

    prior_rows = read_pilot_rows(pilot_csv)
    seen = existing_keys(prior_rows)

    fresh = []
    deduped = 0
    for c in candidates:
        key = (str(c["candidate_id"]), MANIFEST_VERSION)
        if key in seen:
            deduped += 1
        else:
            fresh.append(c)
            seen.add(key)

    new_rows = score_candidates(fresh, strict=strict) if fresh else []

    if new_rows and not dry_run:
        write_pilot_rows(prior_rows + new_rows, pilot_csv, pilot_jsonl)

    all_rows = prior_rows + new_rows
    return {
        "candidates_ingested": len(candidates),
        "rows_added": 0 if dry_run else len(new_rows),
        "rows_would_add": len(new_rows),
        "rows_deduped": deduped,
        "dry_run": dry_run,
        "pilot_rows_total": len(prior_rows) + (0 if dry_run else len(new_rows)),
        "rows": all_rows,
        "new_rows": new_rows,
    }


def backfill_trace(pilot_csv: str, pilot_jsonl: str,
                   updates: dict) -> dict:
    """Backfill extended trace fields onto EXISTING pilot rows.

    updates: {row_id: {trace_col: value}}. Only the six TRACE_COLUMNS may
    be written; frozen columns are never modified. Returns counts.
    """
    _refuses_v1(pilot_csv)
    rows = read_pilot_rows(pilot_csv)
    n_rows = n_cells = 0
    for r in rows:
        upd = updates.get(r.get("row_id"))
        if not upd:
            continue
        bad = set(upd) - set(TRACE_COLUMNS)
        if bad:
            raise CollectionError(f"backfill may only write trace columns: {bad}")
        for k, v in upd.items():
            if v is not None:
                r[k] = v
                n_cells += 1
        n_rows += 1
    write_pilot_rows(rows, pilot_csv, pilot_jsonl)
    return {"rows_backfilled": n_rows, "cells_written": n_cells,
            "pilot_rows_total": len(rows)}


# ---------------------------------------------------------------------------
# Summary (interim-reporting-safe: counts only, no outcome peeking)
# ---------------------------------------------------------------------------

def summarize(rows: list[dict], new_rows: list[dict]) -> dict:
    from collections import Counter
    s = {}
    s["n_total"] = len(rows)
    s["n_new"] = len(new_rows)
    ver = Counter()
    for r in rows:
        ver["verified" if str(r.get("decision_time_verified")) == "True"
              else "unverified"] += 1
    s["verified"] = ver.get("verified", 0)
    s["unverified"] = ver.get("unverified", 0)
    disp = {}
    for t in ("crypto", "equity"):
        sub = [r for r in rows if r.get("terminal") == t]
        disp[t] = {
            "n": len(sub),
            "prod": dict(Counter(r.get("prod_disposition") for r in sub)),
            "c2": dict(Counter(r.get("c2_disposition") for r in sub)),
        }
    s["dispositions"] = disp
    # direction disagreement (crypto), vs the 40% audit trigger
    crypto = [r for r in rows if r.get("terminal") == "crypto"]
    paired = [r for r in crypto
              if r.get("prod_disposition") == "issued"
              and r.get("c2_disposition") == "issued"
              and r.get("prod_direction") and r.get("c2_direction")]
    n_dis = sum(1 for r in paired
                if r["prod_direction"] != r["c2_direction"])
    frac = (n_dis / len(paired)) if paired else None
    s["disagreement"] = {
        "n_paired_issued": len(paired),
        "n_disagree": n_dis,
        "fraction": frac,
        "audit_trigger": bool(frac is not None and frac > AUDIT_TRIGGER_FRACTION),
    }
    win = Counter()
    for r in rows:
        m = in_window(r)
        win["in_window" if m else "out_of_window" if m is False else "unknown"] += 1
    s["window"] = dict(win)
    return s


def print_summary(summary: dict, collect_info: dict) -> None:
    s = summary
    print("=" * 64)
    print("PILOT COLLECTION SUMMARY (freeze v%s)" % MANIFEST_VERSION)
    print("=" * 64)
    print(f"candidates ingested : {collect_info['candidates_ingested']}")
    print(f"rows added          : {collect_info['rows_added']}"
          + (" (DRY RUN -- nothing written)" if collect_info["dry_run"] else ""))
    print(f"rows deduped        : {collect_info['rows_deduped']}")
    print(f"pilot rows total    : {collect_info['pilot_rows_total']}")
    print(f"decision-time verified   : {s['verified']}")
    print(f"decision-time unverified : {s['unverified']} (labeled, never dropped)")
    for t in ("crypto", "equity"):
        d = s["dispositions"][t]
        print(f"[{t}] n={d['n']} prod={d['prod']} c2={d['c2']}")
    dg = s["disagreement"]
    frac_txt = ("n/a (no paired issued rows with both directions)"
                if dg["fraction"] is None else f"{dg['fraction']:.1%}")
    print(f"direction disagreement (crypto): {dg['n_disagree']}/"
          f"{dg['n_paired_issued']} = {frac_txt}"
          f"  -- audit trigger (>40%): "
          f"{'FIRED' if dg['audit_trigger'] else 'no'}")
    print(f"collection-window membership: {s['window']} "
          f"(window {WINDOW_START.date()} -> {WINDOW_END.date()} UTC)")
    print("note: outcomes not peeked during collection (plan sect. 6).")


# ---------------------------------------------------------------------------
# Stream ingest: the eligible stream readers
# ---------------------------------------------------------------------------

def _iso_ms(ms):
    return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).isoformat()


def ingest_crypto_issued(db_path: str = CRYPTO_DB) -> list[dict]:
    """Currently-available crypto issued candidates (workspace DB copy).

    Reuses the workstream-A candidate builder so the collector ingests the
    same eligible stream; contract/alert trace enrichment is layered here.
    """
    sys.path.insert(0, BASE)
    import build_pilot_rows
    cands = build_pilot_rows.crypto_candidates()
    return enrich_crypto_trace(cands, db_path)


def ingest_equity_qualified() -> list[dict]:
    """Currently-available equity radar-qualified candidates."""
    sys.path.insert(0, BASE)
    import build_pilot_rows
    return build_pilot_rows.equity_candidates()


def enrich_crypto_trace(cands: list[dict], db_path: str = CRYPTO_DB) -> list[dict]:
    """Attach REAL operational-trace values from the workspace DB copy.

    Wired today: contract_id (signal_contracts.signal_id by legacy_signal_id)
    and issuance_outcome (from production_decision). NOT wired (null with
    reason in the row notes): entry_observed_at (entry_at == issued_at in the
    DB copy -- the entry-rule instant, not a post-decision print
    observation; no genuine entryObservedAt persisted), alert_enqueued_at /
    alert_delivered_at (alerts + alert_hits tables are EMPTY in the DB copy;
    no alert timestamps persisted for these signals).
    """
    con = sqlite3.connect("file:" + db_path + "?mode=ro", uri=True)
    try:
        contracts = dict(con.execute(
            "select legacy_signal_id, signal_id from signal_contracts "
            "where legacy_signal_id is not null"))
    finally:
        con.close()
    for c in cands:
        trace = dict(c.get("trace") or {})
        cid = c.get("candidate_id")
        try:
            key = int(cid)
        except (TypeError, ValueError):
            key = None
        notes = []
        if key is not None and key in contracts:
            trace["contract_id"] = contracts[key]
        else:
            notes.append("no signal_contract row for this candidate in the "
                         "workspace DB copy; contract_id null")
        if (c.get("terminal") == "crypto"
                and c.get("production_decision") == "issued"):
            notes.append(
                "alert delivery timestamps not persisted for production-issued "
                "signals (alerts/alert_hits empty in the workspace DB copy); "
                "entry_observed_at not persisted (entry_at == issued_at is the "
                "entry-rule instant, not a print observation)")
        if notes:
            trace["trace_note"] = "; ".join(notes)
        c["trace"] = trace
    return cands


def ingest_suppressed_from_db(db_path: str = CRYPTO_DB,
                              limit: int | None = None) -> list[dict]:
    """Real suppressed candidates from the discovery/issuance path.

    Source: suppressed_signal_candidates in the workspace DB copy.
    Verification-run artifacts (metadata_json containing verificationRun)
    are EXCLUDED -- they are pipeline proofs, not prospective candidates.
    No factor ledger is persisted for suppressed candidates, so the
    challenger arm scores unscored:no-factor-ledger (the production arm
    still records abstain with the classified suppression reason -- that
    is the data).
    """
    con = sqlite3.connect("file:" + db_path + "?mode=ro", uri=True)
    q = ("select id, coin_id, symbol, direction, source, reason, signal_day, "
         "entry, invalidation, target_1, target_2, candle_high, candle_low, "
         "metadata_json, created_at from suppressed_signal_candidates "
         "where metadata_json not like '%verificationRun%' order by id")
    if limit is not None:
        q += f" limit {int(limit)}"
    db_rows = con.execute(q).fetchall()
    con.close()

    cands = []
    for (rid, coin, sym, dirc, source, reason, sig_day, entry, inv,
         t1, t2, ch, cl, meta_json, created) in db_rows:
        try:
            meta = json.loads(meta_json or "{}")
        except Exception:
            meta = {}
        srg = (meta.get("shortRegimeGate") or {}) if isinstance(meta, dict) else {}
        sr_inputs = None
        if isinstance(srg, dict) and srg:
            sr_inputs = {
                "price_below_sma50": srg.get("priceBelowSma50"),
                "lower_highs": srg.get("lowerHighs"),
                "trend20_negative": srg.get("trend20Negative"),
            }
        decision_at = _iso_ms(created)
        cands.append({
            "candidate_id": f"suppressed-{rid}",
            "terminal": "crypto",
            "symbol": sym,
            "asset_id": coin,
            "decision_at": decision_at,
            "issued_at": None,
            "row_origin": "pilot",
            "factors": None,  # not persisted for suppressed candidates
            "production_recorded": None,
            "production_decision": "suppressed",
            "production_suppression_reason": reason,
            "eligibility": "passed",
            "eligibility_reason": ("reached issuance validation via the "
                                   f"{source} path; suppressed there"),
            "entry": entry,
            "atr14": None,  # not persisted on suppressed_signal_candidates
            "signal_day": ({"day": sig_day, "high": ch, "low": cl}
                           if sig_day else None),
            "short_regime_inputs": sr_inputs,
            "trace": {
                "issuance_outcome": f"abstain:{reason}",
                "trace_note": ("suppressed before contract creation; no alert "
                               "path reached; factor ledger not persisted, so "
                               "the challenger arm is unscored:no-factor-ledger"),
            },
            "notes": (
                "real suppressed candidate from the discovery/issuance path "
                f"(suppressed_signal_candidates id {rid}, source {source}); "
                f"suppression reason recorded verbatim: {reason}"),
        })
    return cands


# ---------------------------------------------------------------------------
# The task-6 run: ingest currently-available real candidates, collect,
# backfill trace, print summary.
# ---------------------------------------------------------------------------

def run_collection(dry_run: bool = False) -> dict:
    candidates = ingest_crypto_issued() + ingest_equity_qualified()
    print(f"ingested {len(candidates)} candidates from the eligible stream "
          f"({sum(1 for c in candidates if c['terminal'] == 'crypto')} crypto, "
          f"{sum(1 for c in candidates if c['terminal'] == 'equity')} equity)")

    info = collect(candidates, dry_run=dry_run)

    backfill = None
    if not dry_run:
        # Backfill REAL operational-trace values onto existing pilot rows
        # (contract_id from the workspace DB copy; issuance_outcome from the
        # recorded production decision; freeze_version stamp). Frozen columns
        # are never modified.
        rows_now = read_pilot_rows(PILOT_CSV)
        updates = {}
        for c in candidates:
            rid = f"{c['terminal']}:{c['candidate_id']}"
            trace = c.get("trace") or {}
            upd = {}
            if trace.get("contract_id"):
                upd["contract_id"] = trace["contract_id"]
            io = derive_issuance_outcome(c)
            if io:
                upd["issuance_outcome"] = io
            upd["freeze_version"] = MANIFEST_VERSION
            if upd:
                updates[rid] = upd
        backfill = backfill_trace(PILOT_CSV, PILOT_JSONL, updates)
        print(f"backfilled trace fields on {backfill['rows_backfilled']} rows "
              f"({backfill['cells_written']} cells)")

    rows = read_pilot_rows(PILOT_CSV)
    s = summarize(rows, info["new_rows"])
    print_summary(s, info)
    if backfill:
        print(f"trace backfill: {backfill}")
    info["summary"] = s
    info["backfill"] = backfill
    return info


if __name__ == "__main__":
    dry = "--dry-run" in sys.argv
    run_collection(dry_run=dry)
