#!/usr/bin/env python3
"""Validation for shadow-capture.py: synthetic cohort rows prove the frozen
conventions hold. Exits non-zero on any failure. Fixtures only - never part of
any performance cohort."""

import csv
import os
import shutil
import subprocess
import sys
import tempfile

BASE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(BASE, "shadow-capture.py")

COHORT_HEADER = [
    "dossier_row_id", "cohort_id", "cohort_version", "terminal", "symbol",
    "coin_id", "dossier_signal_id", "decision_at_utc", "issued_at_utc",
    "source_as_of_utc", "decision_time_verified", "decision_time_note",
    "direction", "confidence", "setup_type", "entry", "invalidation",
    "target1", "target2", "atr14", "risk_multiplier", "risk_method",
    "entry_rule", "window_start_utc", "window_end_utc", "entry_status_at_record",
    "disposition_reason", "factor_ledger_available", "factor_ledger_json",
    "costs_bps_paper", "outcome_rule", "outcome_5", "outcome_14", "outcome_30",
    "return_5", "return_14", "return_30", "outcome_note", "cross_population_link",
    "chat_sent", "recorded_at_utc", "recorded_by", "notes",
]


def blank(**kw):
    row = {c: "" for c in COHORT_HEADER}
    row.update(kw)
    return row


_failures = []


def _check(cond, label):
    if not cond:
        _failures.append(label)
        print(f"  FAIL: {label}")


def run_case(name, cohort_rows, checks):
    tmp = tempfile.mkdtemp(prefix="shadowtest_")
    rowsdir = os.path.join(tmp, "rows")
    os.makedirs(rowsdir)
    with open(os.path.join(rowsdir, "dossier-cohort-v1.csv"), "w",
              newline="") as f:
        w = csv.DictWriter(f, fieldnames=COHORT_HEADER)
        w.writeheader()
        w.writerows(cohort_rows)
    # run the real script against the temp dir by monkey-patching paths
    code = open(SCRIPT).read()
    code = code.replace('BASE = os.path.dirname(os.path.abspath(__file__))',
                        f'BASE = {tmp!r}')
    patched = os.path.join(tmp, "shadow_capture_patched.py")
    open(patched, "w").write(code)
    r1 = subprocess.run([sys.executable, patched], capture_output=True, text=True)
    assert r1.returncode == 0, f"{name}: first run failed: {r1.stderr}"
    shadow = os.path.join(rowsdir, "dossier-shadow-comparison-v1.csv")
    got = []
    if os.path.exists(shadow):
        with open(shadow, newline="") as f:
            got = list(csv.DictReader(f))
    else:
        assert "nothing new" in r1.stdout, f"{name}: expected honest-zero note"
    # idempotence: second run appends nothing
    r2 = subprocess.run([sys.executable, patched], capture_output=True, text=True)
    assert r2.returncode == 0, f"{name}: second run failed"
    got2 = []
    if os.path.exists(shadow):
        with open(shadow, newline="") as f:
            got2 = list(csv.DictReader(f))
    assert len(got2) == len(got), f"{name}: second run not idempotent"
    assert "nothing new" in r2.stdout, f"{name}: expected honest-zero note"
    checks(got)
    shutil.rmtree(tmp)
    print(f"PASS {name} ({len(got)} shadow rows)")


def approx(a, b):
    return abs(float(a) - float(b)) < 1e-9


# Case 1: entered long -> inv short, mirrored, distances identical
run_case(
    "entered-long-mirror",
    [blank(dossier_row_id="dossier-v1:crypto:9001", decision_at_utc="2026-10-15T12:00:00Z",
           symbol="BTC", coin_id="bitcoin", direction="long", entry="80000",
           invalidation="78000", target1="83000",
           entry_status_at_record="entered", disposition_reason="print abc123")],
    lambda got: (
        _check(len(got) == 2, "two arms"),
        _check({g["arm"] for g in got} == {"orig", "inv"}, "arm labels"),
        _check(next(g for g in got if g["arm"] == "orig")["direction"] == "long", "orig dirn"),
        _check(next(g for g in got if g["arm"] == "inv")["direction"] == "short", "inv dirn"),
        _check(approx(next(g for g in got if g["arm"] == "inv")["stop"], 82000), "inv stop = entry+risk"),
        _check(approx(next(g for g in got if g["arm"] == "inv")["target"], 77000), "inv target = entry-reward"),
        _check(approx(next(g for g in got if g["arm"] == "inv")["risk_distance"], 2000), "inv risk dist"),
        _check(approx(next(g for g in got if g["arm"] == "inv")["reward_distance"], 3000), "inv reward dist"),
        _check(next(g for g in got if g["arm"] == "inv")["mirrored"] == "true", "mirrored flag"),
        _check(next(g for g in got if g["arm"] == "inv")["hypothetical_short"] == "true", "inv short hypothetical"),
        _check(next(g for g in got if g["arm"] == "orig")["hypothetical_short"] == "false", "orig long not hypothetical"),
        _check(all(g["entry_price"] == got[0]["entry_price"] for g in got), "shared entry price"),
        _check(all(g["barrier_5"] == "not-graded" for g in got), "outcomes ungraded"),
        _check(all(g["fixed_5d_return_r"] == "" for g in got), "fixed_5d_return empty at capture"),
        _check(all(g["barrier_exit_return_r"] == "" for g in got), "barrier_exit_return empty at capture"),
        _check(all("net_return_5_r" not in g for g in got), "v1 net_return_5_r column gone"),
    ),
)

# Case 2: entered short -> inv long, hypothetical flag on orig
run_case(
    "entered-short-mirror",
    [blank(dossier_row_id="dossier-v1:crypto:9002", decision_at_utc="2026-10-15T13:00:00Z",
           symbol="ETH", coin_id="ethereum", direction="short", entry="2500",
           invalidation="2600", target1="2300",
           entry_status_at_record="entered", disposition_reason="print def456")],
    lambda got: (
        _check(next(g for g in got if g["arm"] == "inv")["direction"] == "long", "inv dirn"),
        _check(approx(next(g for g in got if g["arm"] == "inv")["stop"], 2400), "inv stop = entry-risk"),
        _check(approx(next(g for g in got if g["arm"] == "inv")["target"], 2700), "inv target = entry+reward"),
        _check(next(g for g in got if g["arm"] == "orig")["hypothetical_short"] == "true", "orig short hypothetical"),
        _check(next(g for g in got if g["arm"] == "inv")["hypothetical_short"] == "false", "inv long not hypothetical"),
    ),
)

# Case 3: non-entry cohort row -> both arms non-entry, same reason
run_case(
    "non-entry-both-arms",
    [blank(dossier_row_id="dossier-v1:crypto:9003", decision_at_utc="2026-10-15T14:00:00Z",
           symbol="SOL", coin_id="solana", direction="long", entry="150",
           invalidation="140", target1="165",
           entry_status_at_record="expired_non_entry",
           disposition_reason="window closed, no print")],
    lambda got: (
        _check(all(g["entry_status"] == "expired_non_entry" for g in got), "both arms non-entry"),
        _check(all("window closed" in g["entry_evidence_note"] for g in got), "reason carried"),
    ),
)

# Case 4: unresolved entry status -> no shadow rows
run_case(
    "unresolved-skipped",
    [blank(dossier_row_id="dossier-v1:crypto:9004", decision_at_utc="2026-10-15T15:00:00Z",
           symbol="DOGE", coin_id="dogecoin", direction="long", entry="0.2",
           invalidation="0.18", target1="0.23",
           entry_status_at_record="", disposition_reason="")],
    lambda got: _check(len(got) == 0, "unresolved row skipped"),
)

# Case 5: pre-collection-window row -> excluded (prospective only)
run_case(
    "pre-window-excluded",
    [blank(dossier_row_id="dossier-v1:crypto:43", decision_at_utc="2026-10-14T13:00:21Z",
           symbol="BTC", coin_id="bitcoin", direction="long", entry="82805",
           invalidation="80076", target1="86899",
           entry_status_at_record="expired_non_entry",
           disposition_reason="window closed, no entry")],
    lambda got: _check(len(got) == 0, "pre-window seed row excluded"),
)

if _failures:
    print(f"\n{_failures} FAILED")
    sys.exit(1)
print("\nall shadow-capture validations passed")
