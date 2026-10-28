# rt-engine durable execution route (established 2026-10-24)

## The problem
The engine's systemd registration lived only in /etc (`/etc/systemd/system/rt-*`,
`/etc/rt-engine/env`). /etc sits on a tmpfs-backed overlay in this VM and is
wiped on every VM replacement (14+ in two days, 2026-10-22/23). A watchdog
cron reinstalled it after the fact each time.

## Environment facts (measured 2026-10-24, not assumed)
- `/home/hatch` is backed by a persistent btrfs volume (`/dev/mapper/rv`);
  `/`, `/etc`, `/root`, `/usr/local`, `/var` are an overlay whose upper dir
  lives under `/run/hatch/overlay/upper` (tmpfs) — only home storage persists.
- The guest boots a minimal `default.target`. There is NO login session:
  `systemd-logind` and `dbus.service` are inactive, `loginctl` cannot
  connect ("No such file or directory"), there is no `/run/user/0`, and
  `/var/lib/systemd/linger/` does not exist.
- A direct probe failed as predicted: `systemctl start user@0.service` →
  dependency failure, because `user-runtime-dir@0` exits 1 with "Failed to
  connect to system bus". The only accounts are root (passwd home `/root`,
  itself ephemeral) and system users.

## Why NOT systemd user units
Per the platform doc (~/docs/chat/scheduling-and-watching.md, "Services in
this runtime"): "Use a user service only when its manager, configuration
lookup, runtime directory, bus, and startup after replacement are
established... Do not assume lingering works." Here NONE of those five
preconditions hold, and lingering additionally needs logind (dead) plus a
linger flag file under /var (ephemeral). The user-manager route is not
supported in this guest; forcing it would be another fragile heal.

## The supported route (implemented)
Guest SYSTEM systemd as executor (timers hook `default.target`, the target
this guest actually reaches) + ALL canonical state in persistent home
storage + one canonical startup path:

- Canonical units: `engine/systemd/rt-{crypto-core,research,equity}.{service,timer}`
  (unchanged; absolute ExecStart paths into home storage).
- Canonical programs + state: `engine/` and the goal workspace (unchanged).
- Canonical proxy env: **`engine/env`** (mode 600), NEW 2026-10-24.
  `install-units.sh` writes it from the live shell env (and keeps it if a
  later invoking shell has no proxy vars), and refreshes `/etc/rt-engine/env`
  as a compatibility copy. `lib.sh` sources `engine/env` first, `/etc` copy
  as fallback.
- Startup path: **`engine/bootstrap.sh`** — idempotent, flock-guarded:
  install-units → `systemctl enable --now` the three timers → one
  crypto-core pass → verify (timers registered; last-run all steps 0;
  snapshot coverage_complete=true and <10 min old).
- The pre-existing watchdog cron and the /etc install remain in place as
  fallback; nothing was disabled. The watchdog's heal calls
  `install-units.sh`, so it now also maintains the persistent env.

## Verification (2026-10-24 ~03:08–03:11Z)
- `engine/env`: 8 variables, mode 600; variable NAMES identical to the /etc
  copy; file hashes identical (values never printed).
- Fallback proven in a private mount namespace with `/etc/rt-engine`
  hidden (0 entries visible): `lib.sh` still set all 8 proxy vars from
  `engine/env`, no warning.
- `bootstrap.sh` ran clean (rc=0): crypto-core pass finished
  2026-10-24T03:09:43Z, all 5 steps exit 0; snapshot
  coverage_complete=true, age 1s at check.
- All three services execute under the manager: manual starts of
  rt-research (03:09:49–03:10:37Z) and rt-equity (03:10:37Z) both
  Result=success / ExecMainStatus=0. (Research's `scanner` step recorded
  exit 2 — same as its 02:54 timer run; pre-existing module-step behavior,
  recorded by design, not an install fault.)
- Timers: crypto-core and research demonstrably fired on schedule under
  this install (02:43:30Z, 02:54:12Z); equity timer registered and active,
  next elapse 08:00Z (its on-schedule firing under this install is still
  ahead; service proven by manual start).

## What is NOT yet proven
Durability across a REAL VM replacement. The pieces are individually
proven (persistent locations, env fallback with /etc hidden, one-command
bootstrap, timers on default.target), and the watchdog remains as the
bounded saved recovery job the platform doc prescribes — but the first
replacement after 2026-10-24T03:10Z is the only full proof. If that
replacement's heal is a watchdog run, check afterwards whether the
persistent env survived (names + hash vs a fresh agent-shell capture) and
record the outcome here.
