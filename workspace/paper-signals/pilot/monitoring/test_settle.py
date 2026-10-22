#!/usr/bin/env python3
"""
Test harness for settle.py (standing settlement pass). PAPER ONLY.

Runs entirely against a COPY of the store in a temp dir; the real store is
only READ (positions.json / outcomes.jsonl copied out). Three proofs:

  A. REPRODUCTION — the settler's full-history walk, run over the three
     already-settled positions, reproduces the recorded settlements'
     first-touch conclusions (outcome, settling bar, extreme) exactly.
  B. DUE SETTLEMENTS — a live-mode run against the copy appends settlements
     for the positions whose evidence validates, including the two known-due
     ones (BTC legacy paper_00e4b771, PHA paper_3d7f6db2), with the frozen
     first-touch outcomes.
  C. IDEMPOTENCY — a second live-mode run against the same copy appends
     nothing (outcomes.jsonl line count unchanged).

Usage: python3 test_settle.py
Exit code 0 iff all checks pass.
"""
import json, os, shutil, subprocess, sys, tempfile, time

BASE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE)
import settle  # noqa: E402

FAILURES = []


def check(name, cond, detail=""):
    print(f"  [{'PASS' if cond else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))
    if not cond:
        FAILURES.append(name)


def read_jsonl(path):
    out = []
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line:
                out.append(json.loads(line))
    return out


def main():
    tmp = tempfile.mkdtemp(prefix="settle-test-")
    print(f"test store: {tmp}")
    for name in ("positions.json", "outcomes.jsonl"):
        shutil.copy(os.path.join(BASE, name), os.path.join(tmp, name))
    positions = settle.load_json(os.path.join(tmp, "positions.json"), [])
    records = read_jsonl(os.path.join(tmp, "outcomes.jsonl"))
    recorded_settlements = {r["position_id"]: r for r in records
                            if r.get("record_type") == "settlement"}
    now_ms = int(time.time() * 1000)

    print("\nA. REPRODUCTION of known settlements (walk only, no writes)")
    for pid, rec in sorted(recorded_settlements.items()):
        pos = next(p for p in positions if p["id"] == pid)
        entry_ms = settle.parse_iso(pos["entry_observed_at"])
        bars = settle.fetch_klines(pos["instrument"],
                                   (entry_ms // settle.BAR_MS) * settle.BAR_MS,
                                   now_ms - 1)
        v = settle.walk_position(pos, bars, now_ms)
        got_touch = v.get("settling_touch") or {}
        want_touch = rec["settling_touch"]
        check(f"{pid} outcome", v.get("settlement_outcome") == rec["settlement_outcome"],
              f"walk={v.get('settlement_outcome')} recorded={rec['settlement_outcome']}")
        check(f"{pid} gross_r", v.get("gross_r") == rec["gross_r"],
              f"walk={v.get('gross_r')} recorded={rec['gross_r']}")
        check(f"{pid} settling bar", got_touch.get("bar_open_utc") == want_touch["bar_open_utc"],
              f"walk={got_touch.get('bar_open_utc')} recorded={want_touch['bar_open_utc']}")
        check(f"{pid} settling extreme", got_touch.get("extreme") == want_touch["extreme"],
              f"walk={got_touch.get('extreme')} recorded={want_touch['extreme']}")

    print("\nB. LIVE-MODE RUN against the copy")
    before = len(read_jsonl(os.path.join(tmp, "outcomes.jsonl")))
    r1 = subprocess.run([sys.executable, os.path.join(BASE, "settle.py"),
                         "--store-dir", tmp], capture_output=True, text=True)
    print(r1.stdout)
    if r1.returncode != 0:
        print(r1.stderr)
    check("settler run exit 0", r1.returncode == 0)
    after_records = read_jsonl(os.path.join(tmp, "outcomes.jsonl"))
    new_records = after_records[before:]
    new_by_id = {r["position_id"]: r for r in new_records
                 if r.get("record_type") == "settlement"}
    print(f"  appended {len(new_records)} record(s): {sorted(new_by_id)}")

    btc = new_by_id.get("paper_00e4b771faf0f29853c5675b")
    check("BTC legacy paper_00e4b771 appended", btc is not None)
    if btc:
        check("BTC outcome target1_hit +1.50R",
              btc["settlement_outcome"] == "target1_hit" and btc["gross_r"] == 1.5,
              f"{btc['settlement_outcome']} {btc['gross_r']}")
        check("BTC settling bar 2026-10-21T14:51:00Z",
              btc["settling_touch"]["bar_open_utc"] == "2026-10-21T14:51:00Z",
              btc["settling_touch"]["bar_open_utc"])
        check("BTC settling extreme 84645.51",
              btc["settling_touch"]["extreme"] == 84645.51,
              repr(btc["settling_touch"]["extreme"]))
    pha = new_by_id.get("paper_3d7f6db2183d736bbefdd973")
    check("PHA paper_3d7f6db2 appended", pha is not None)
    if pha:
        # Frozen rule: the walk STOPS at the first touch. T1 (22:04Z) precedes
        # T2 (22:06Z), so the settlement is target1_hit +1.50R; the T2 touch is
        # a post-settlement observation and must appear in the note as such.
        check("PHA outcome target1_hit +1.50R (first touch, NOT target2)",
              pha["settlement_outcome"] == "target1_hit" and pha["gross_r"] == 1.5,
              f"{pha['settlement_outcome']} {pha['gross_r']}")
        check("PHA settling bar 2026-10-21T22:04:00Z",
              pha["settling_touch"]["bar_open_utc"] == "2026-10-21T22:04:00Z",
              pha["settling_touch"]["bar_open_utc"])
        check("PHA note records T2 22:06Z as post-settlement observation",
              "2026-10-21T22:06:00Z" in pha["note"] and "post-settlement" in pha["note"])
    others = sorted(set(new_by_id) - {"paper_00e4b771faf0f29853c5675b",
                                      "paper_3d7f6db2183d736bbefdd973"})
    if others:
        print(f"  NOTE: additional positions settled from live evidence: {others} "
              f"(each must be a genuine first-touch on gap-free coverage)")

    print("\nC. IDEMPOTENCY — second live-mode run against the same copy")
    r2 = subprocess.run([sys.executable, os.path.join(BASE, "settle.py"),
                         "--store-dir", tmp], capture_output=True, text=True)
    print(r2.stdout)
    check("second run exit 0", r2.returncode == 0)
    final_count = len(read_jsonl(os.path.join(tmp, "outcomes.jsonl")))
    check("no new lines appended on re-run", final_count == len(after_records),
          f"before={len(after_records)} after={final_count}")

    print("\n" + ("ALL CHECKS PASSED" if not FAILURES
                  else f"FAILURES: {FAILURES}"))
    return 0 if not FAILURES else 1


if __name__ == "__main__":
    sys.exit(main())
