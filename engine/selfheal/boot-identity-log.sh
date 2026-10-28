#!/bin/bash
# Boot-identity / uptime / install-presence log for the rt-engine watchdog.
# Added 2026-10-27 under Logan's repair scope (priority 2): diagnose the
# engine disappearance without another permission round. READ-ONLY except
# for appending one JSON line to a persistent workspace log.
# This script never heals, never enables timers, never changes a verdict.
# It must never fail the watchdog run: every read has a fallback.
set -u
LOG=/home/hatch/workspace/goals/research-terminal/hidden_files/engine-selfheal/boot-identity.jsonl
SNAP=/home/hatch/workspace/goals/research-terminal/paper-signals/pilot/snapshots/core-snapshot.json
mkdir -p "$(dirname "$LOG")" 2>/dev/null || true

boot_id="$(cat /proc/sys/kernel/random/boot_id 2>/dev/null || echo unknown)"
machine_id="$(cat /etc/machine-id 2>/dev/null || echo unknown)"
uptime_s="$(awk '{print int($1)}' /proc/uptime 2>/dev/null || echo null)"
# Boot time in UTC, computed from uptime — NOT `uptime -s`, whose output
# shifts with the calling shell's timezone (seen 2026-10-27: 14:51 vs 18:51
# for the same boot). boot_id + uptime_s are the reliable identifiers.
if [ "$uptime_s" != "null" ] && [ -n "$uptime_s" ]; then
  boot_time="$(date -u -d "@$(( $(date +%s) - uptime_s ))" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || echo unknown)"
else
  boot_time="unknown"
fi
env_present=false; [ -f /etc/rt-engine/env ] && env_present=true
units_present=0; units_missing=""
for u in rt-crypto-core rt-research rt-equity; do
  for k in service timer; do
    if [ -f "/etc/systemd/system/$u.$k" ]; then units_present=$((units_present+1)); else units_missing="$units_missing $u.$k"; fi
  done
done
timers_registered=false
systemctl list-timers --all 2>/dev/null | grep -q "rt-crypto-core.timer" && timers_registered=true
snapshot_age_min=null
if [ -f "$SNAP" ]; then
  snapshot_age_min=$(python3 - "$SNAP" <<'PY' 2>/dev/null || echo null
import json, sys, datetime
try:
    d = json.load(open(sys.argv[1]))
    gen = datetime.datetime.fromisoformat(d["generated_at_utc"].replace("Z", "+00:00"))
    now = datetime.datetime.now(datetime.timezone.utc)
    print(int((now - gen).total_seconds() // 60))
except Exception:
    print("null")
PY
)
fi
utc_now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
verdict="${1:-unknown}"
python3 - "$LOG" "$utc_now" "$verdict" "$boot_id" "$machine_id" "$uptime_s" "$boot_time" "$env_present" "$units_present" "$units_missing" "$timers_registered" "$snapshot_age_min" <<'PY' 2>/dev/null || true
import json, sys
log, utc, verdict, boot_id, machine_id, uptime_s, boot_time, env_present, units_present, units_missing, timers_registered, snapshot_age_min = sys.argv[1:13]
row = {
    "utc": utc,
    "verdict": verdict,
    "boot_id": boot_id,
    "machine_id": machine_id,
    "uptime_s": int(uptime_s) if uptime_s not in ("null", "") else None,
    "boot_time_utc": boot_time,
    "install": {
        "env_present": env_present == "true",
        "unit_files_present": int(units_present),
        "unit_files_missing": units_missing.strip().split() if units_missing.strip() else [],
        "timers_registered": timers_registered == "true",
    },
    "snapshot_age_min": int(snapshot_age_min) if snapshot_age_min not in ("null", "") else None,
}
with open(log, "a") as f:
    f.write(json.dumps(row) + "\n")
PY
echo "BOOT_IDENTITY: boot_id=$boot_id uptime_s=$uptime_s env=$env_present units=$units_present/6 timers=$timers_registered snapshot_age_min=$snapshot_age_min"
