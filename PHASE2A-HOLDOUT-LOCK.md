# Phase 2A holdout lock evidence

- Boundary: 2025-01-01 through 2026-09-30 UTC.
- Dataset manifest: `e40894eb8a40e0622423f145939fe42f0338cbe9c86441357184a70866516bda`.
- Feature-eligible rows counted without labels: 22,968 across strategy/horizon evaluation passes.
- Issued directions counted without labels: trend continuation 3,580 for each horizon; breakout + volume 238 for each horizon.
- Performance opened: **no**.
- The ordinary engine throws `LOCKED_HOLDOUT` when passed `allowHoldout: true`.
- The command refuses both `--open-holdout` and `--evaluate-holdout` before reading data.
- Holdout rows never enter `observations`, candidate reports, uncertainty, or selection.

The direction counts are not performance evidence. They reveal no holdout returns, labels, hit rates, costs, rankings, or strategy comparison. Actual 2025–2026 market outcomes may be knowable to people from other sources; this software lock only establishes that the Phase 2A command did not expose or use them.
