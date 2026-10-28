# rt-engine shared helpers — sourced by every module runner.
#
# Two jobs:
# 1) Restore the egress-proxy environment. This VM egresses through a proxy
#    (http_proxy/https_proxy/... in the agent shell). Python urllib clients
#    read those variables automatically. systemd services start with a CLEAN
#    environment — no proxy variables — and direct TLS egress on this VM
#    fails with "SSL: WRONG_VERSION_NUMBER". That is the whole mechanism
#    behind the demo route's settle failures on 2026-10-22: same code, same
#    host, different environment.
#    CANONICAL env file: $RT_ENGINE/env, in persistent home storage
#    (/home/hatch is a btrfs-backed mount that survives VM replacement;
#    /etc is a tmpfs-backed overlay that does not). install-units.sh writes
#    it from the live environment (mode 600, never committed) and also
#    refreshes the /etc/rt-engine/env compatibility copy. lib.sh sources
#    the persistent file first and falls back to the /etc copy, so module
#    runs keep working even when the /etc install has been wiped and not
#    yet restored.
# 2) Small step/lock/run-record helpers so each module runner stays thin.
RT_BASE=/home/hatch/workspace/goals/research-terminal
RT_ENGINE=$RT_BASE/engine

if [ -f "$RT_ENGINE/env" ]; then
  set -a
  . "$RT_ENGINE/env"
  set +a
elif [ -f /etc/rt-engine/env ]; then
  set -a
  . /etc/rt-engine/env
  set +a
else
  echo "rt-engine WARNING: no proxy env file (persistent $RT_ENGINE/env and /etc/rt-engine/env both missing) - network fetches will likely fail; run engine/install-units.sh" >&2
fi

RT_STEPS=""
RT_STARTED_UTC=$(date -u +%FT%TZ)
RT_STARTED_EPOCH=$(date +%s)

# rt_lock <name> — single-instance guard for the module. Exits 0 quietly when
# another run already holds the lock.
rt_lock() {
  mkdir -p "$RT_ENGINE/locks"
  exec 9>"$RT_ENGINE/locks/$1.lock"
  if ! flock -n 9; then
    echo "$1: another run holds the lock; skipping"
    exit 0
  fi
}

# rt_step <label> <timeout-seconds> <command...> — run one step in its own
# hard time-box. A failed or timed-out step is recorded and NEVER aborts the
# module: later steps still run (enrollment runs last, on purpose).
rt_step() {
  local label=$1 box=$2 rc
  shift 2
  echo "step $label: start $(date -u +%FT%TZ) (box ${box}s)"
  timeout "$box" "$@"
  rc=$?
  echo "step $label: exit=$rc $(date -u +%FT%TZ)"
  RT_STEPS="${RT_STEPS}${RT_STEPS:+, }\"$label\": $rc"
  return 0
}

# rt_write_lastrun <module> — small per-module run record, written atomically.
rt_write_lastrun() {
  local module=$1 dir="$RT_ENGINE/modules/$1" tmp
  mkdir -p "$dir"
  tmp="$dir/last-run.json.tmp"
  printf '{\n  "module": "%s",\n  "started_at_utc": "%s",\n  "finished_at_utc": "%s",\n  "duration_s": %s,\n  "steps": {%s},\n  "route": "systemd (zero agent launches)"\n}\n' \
    "$module" "$RT_STARTED_UTC" "$(date -u +%FT%TZ)" \
    "$(( $(date +%s) - RT_STARTED_EPOCH ))" "$RT_STEPS" > "$tmp"
  mv "$tmp" "$dir/last-run.json"
  echo "last-run record: $dir/last-run.json"
}
