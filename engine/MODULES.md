# rt-engine modules — topology and rules

Built 2026-10-22 under the expert-corrected simplification (PROCEED ~15:06 EDT).
Three independently runnable modules, shared code in `engine/lib.sh`, each with
its own lock, its own systemd timer, and no dependency on the others. A slow
research step can never delay position coverage; a slow enrollment can never
delay the core snapshot (it publishes before enroll runs).

| Module | Runner | Steps (hard time-boxes) | Timer (local) | Snapshot |
|---|---|---|---|---|
| crypto-core | `modules/crypto-core/run.sh` | monitor 480s → settle 600s → snapshot → enroll 240s → snapshot | :13 / :43 | `snapshots/core-snapshot.json` |
| research | `modules/research/run.sh` | hl_cache 420s → scanner 420s → snapshot | :24 / :54 | `snapshots/research-snapshot.json` |
| equity | `modules/equity/run.sh` | openbb_layer 900s → snapshot | 08:00 / 16:35 | `snapshots/equity-snapshot.json` |

Each module also writes `modules/<name>/last-run.json` (per-step exit codes,
start/finish, duration) on every run.

## What deliberately stays artifact-side (not in any script)

- **Crypto issuance** — the `paper-issuance-cycle` space action driving
  `runpapersignalcycle` (deterministic, already zero-agent). Scripts never
  call artifact actions; the earlier slim-down wording that had the engine
  "call issuance" was wrong and is corrected here.
- **Equity fills / postmortem** — the equity book lives in the artifact DB;
  its daily pass stays an artifact-side operation.
- **Research shortlist capture** — `getresearchshortlist` is an artifact
  action; it stays on its existing route until cutover planning says
  otherwise.

## The proxy rule (learned 2026-10-22, the hard way)

This VM egresses through a proxy named by `http_proxy`/`https_proxy`/etc.
Python urllib reads those variables automatically; systemd services start
with a clean environment, so under systemd every fetch failed with
`SSL: WRONG_VERSION_NUMBER` while the identical agent-run code worked.
`lib.sh` sources the canonical env file `engine/env` — in persistent home
storage — at the top of every runner, falling back to the compatibility
copy `/etc/rt-engine/env`. `install-units.sh` writes both from the live
environment (mode 600, values never committed). After a VM replacement,
run `engine/bootstrap.sh` (the canonical startup path: install + enable
timers + one verified crypto-core pass) — see `engine/DURABLE-ROUTE.md`.
If fetches fail with WRONG_VERSION_NUMBER after a heal, the proxy
credential may have rotated; re-run `install-units.sh` from an agent
shell to recapture it.

## State as of build time

- All three modules verified live on 2026-10-22 (see
  hidden_files/simplification/module-verification-2026-10-22.md). crypto-core
  ran the full chain under systemd in 31s with the proxy env file in place.
- Units installed in /etc/systemd/system; **timers NOT enabled** — enabling
  is the cutover step, after the 24h isolated comparison passes.
- The rt-core-demo unit (the execution-route proof) was retired after the
  crypto-core verification; its canonical unit files live in
  engine/systemd/retired/. The proof stands in
  hidden_files/simplification/execution-proof-2026-10-22.md.
- Legacy agent lanes still run production until cutover. crypto-core's
  runner carries a pgrep guard so it can never overlap them.
- Entry hold stays ON throughout.
