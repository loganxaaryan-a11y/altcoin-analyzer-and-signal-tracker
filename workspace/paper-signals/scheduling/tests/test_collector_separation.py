#!/usr/bin/env python3
"""
Collector separation test — proves the 6-hour comparison collector
(`comparison/collect_pilot_rows.py`) is ANALYSIS-ONLY: it cannot drive entry
observation or alert timing.

Checks:
  1. (static) the collector imports no operational paper-pipeline module
     (issuance handler, watcher, pilot, alert transport, DbStore).
  2. (static) no reference to the operational paper DB path
     (paper-pilot.sqlite / pilot/data) anywhere in the collector or its
     local imports.
  3. (static) every sqlite3.connect in the collector uses a read-only URI.
  4. (behavioral) a real `collect_pilot_rows.py --live-export=... --dry-run`
     execution leaves all operational paper state byte-identical
     (paper DBs, alert-outbox tree) and writes nothing outside comparison/.

Paper signals only. No brokerage. Read-only except the collector's own
dry-run (which writes nothing by construction).
"""
import hashlib
import os
import re
import subprocess
import sys

HOME = os.path.expanduser("~")
PS = os.path.join(HOME, "workspace/goals/research-terminal/paper-signals")
COMPARISON = os.path.join(PS, "comparison")
COLLECTOR = os.path.join(COMPARISON, "collect_pilot_rows.py")
LOCAL_MODULES = ["collect_pilot_rows.py", "harness.py", "live_paper_stream.py"]

OPERATIONAL_MODULE_NAMES = [
    "orchestrator", "issuance", "handler", "db-store", "db_store", "DbStore",
    "integratedTick", "integrated_tick", "resumeAwaitingEntry",
    "resume_awaiting_entry", "watcher", "entry-v1", "entry_v1",
    "pilot", "deps", "transport", "deliverAlert", "deliver_alert",
    "binance", "evidence",
]
OPERATIONAL_DB_MARKERS = ["paper-pilot.sqlite", "paper-pilot-dryrun.sqlite", "pilot/data", "PILOT_DB"]

OPERATIONAL_STATE_PATHS = [
    os.path.join(PS, "pilot/data/paper-pilot.sqlite"),
    os.path.join(PS, "pilot/data/paper-pilot-dryrun.sqlite"),
]


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def snapshot_operational_state():
    """Hash every operational paper-state file (DBs + alert outbox files)."""
    snap = {}
    for p in OPERATIONAL_STATE_PATHS:
        if os.path.exists(p):
            snap[p] = sha256_file(p)
        for suffix in ("-wal", "-shm", "-journal"):
            q = p + suffix
            if os.path.exists(q):
                snap[q] = sha256_file(q)
    outbox_root = os.path.join(PS, "pilot/evidence")
    if os.path.isdir(outbox_root):
        for dirpath, _dirnames, filenames in os.walk(outbox_root):
            if "alert-outbox" in os.path.basename(dirpath):
                for fn in sorted(filenames):
                    fp = os.path.join(dirpath, fn)
                    snap[fp] = sha256_file(fp)
    return snap


def snapshot_tree(root):
    """Map of relative path -> sha256 for every file under root."""
    snap = {}
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in ("__pycache__", "node_modules")]
        for fn in filenames:
            fp = os.path.join(dirpath, fn)
            snap[os.path.relpath(fp, root)] = sha256_file(fp)
    return snap


def read_local_sources():
    srcs = {}
    for mod in LOCAL_MODULES:
        p = os.path.join(COMPARISON, mod)
        with open(p, "r", encoding="utf-8") as f:
            srcs[mod] = f.read()
    return srcs


def check_static_imports(srcs):
    """The collector must not import any operational paper-pipeline module."""
    failures = []
    for mod, src in srcs.items():
        for name in OPERATIONAL_MODULE_NAMES:
            # match import statements / from-imports mentioning the module
            pat = re.compile(r"^\s*(import|from)\s+[\w.]*" + re.escape(name) + r"\b", re.M)
            for m in pat.finditer(src):
                # allow mentions inside comments/docstrings only if the line is a comment
                line = src[max(0, src.rfind("\n", 0, m.start())):m.end()].strip()
                if line.startswith("#"):
                    continue
                failures.append(f"{mod}: imports operational module '{name}': {line[:100]}")
    return failures


def check_static_db_refs(srcs):
    failures = []
    for mod, src in srcs.items():
        for marker in OPERATIONAL_DB_MARKERS:
            if marker in src:
                failures.append(f"{mod}: references operational paper DB '{marker}'")
    return failures


def check_static_readonly_sqlite(srcs):
    """Every sqlite3.connect in the collector must use a read-only URI."""
    failures = []
    src = srcs["collect_pilot_rows.py"]
    for m in re.finditer(r"sqlite3\.connect\(([^)]*)\)", src):
        args = m.group(1)
        if "mode=ro" not in args:
            failures.append(f"non-read-only sqlite3.connect: sqlite3.connect({args[:80]})")
    return failures


def check_behavioral():
    """Run the collector exactly as the installed job does (dry-run) and prove
    operational state is untouched and nothing is written outside comparison/."""
    failures = []
    before_state = snapshot_operational_state()
    before_ps = snapshot_tree(PS)

    export = os.path.join(COMPARISON, "live-paper-export-2026-10-14.json")
    cmd = [sys.executable, COLLECTOR, f"--live-export={export}", "--dry-run"]
    proc = subprocess.run(cmd, cwd=COMPARISON, capture_output=True, text=True, timeout=600)
    if proc.returncode != 0:
        return [f"collector dry-run failed (rc={proc.returncode}): {proc.stderr[-2000:]}"]

    after_state = snapshot_operational_state()
    if before_state != after_state:
        changed = [p for p in set(before_state) | set(after_state)
                   if before_state.get(p) != after_state.get(p)]
        failures.append(f"operational paper state CHANGED by collector run: {changed}")

    after_ps = snapshot_tree(PS)
    changed_files = [p for p in set(before_ps) | set(after_ps)
                     if before_ps.get(p) != after_ps.get(p)]
    outside = [p for p in changed_files if not p.startswith("comparison/")]
    if outside:
        failures.append(f"collector wrote outside comparison/: {outside}")
    return failures


def main():
    srcs = read_local_sources()
    failures = []
    failures += check_static_imports(srcs)
    failures += check_static_db_refs(srcs)
    failures += check_static_readonly_sqlite(srcs)
    failures += check_behavioral()
    if failures:
        print("COLLECTOR SEPARATION TEST: FAILED")
        for f in failures:
            print("  -", f)
        return 1
    print("COLLECTOR SEPARATION TEST: PASSED")
    print("  - no operational imports; no paper-DB references; sqlite read-only")
    print("  - dry-run left all operational paper state byte-identical")
    print("  - no writes outside comparison/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
