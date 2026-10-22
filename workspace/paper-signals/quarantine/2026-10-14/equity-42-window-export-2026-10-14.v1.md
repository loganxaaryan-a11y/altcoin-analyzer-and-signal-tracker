# Equity-42 window export + expiry evaluation — v1 (2026-10-14)

**Evaluated:** 2026-10-14T09:00:10Z (05:00:10 EDT) · **Evaluator:** paper-signals quarantine pass, no prediction-weight or strategy changes.
**Companion machine-readable file:** `equity-42-window-export-2026-10-14.v1.csv` (this directory).
**Quarantine:** remains ACTIVE per `quarantine-record-equity-42.md` — all 42 stay quarantined from every live performance claim regardless of window status.

## Rule applied
- Per-setup ORIGINAL entry window: `2026-10-14T13:30:00.000Z → 2026-10-14T20:00:00.000Z` (identical on all 42 rows; taken from `reclass-42-longs-2026-10-14.v2.csv`, column `entry_window_UTC`).
- `evaluation_time < window_open` → **STILL-PENDING**, no reason code, stays in quarantine.
- `evaluation_time > window_close` → **EXPIRED** with reason code `entry-window-lapsed` (never rolled forward, never extended — per rule).
- Windows are fixed at the original terms; no re-qualification run was performed here.

## Result
- **42 → STILL-PENDING** (all 42 windows are in the future at evaluation time: window opens 2026-10-14T13:30:00Z, now 2026-10-14T09:00:10Z).
- **0 → EXPIRED** (`entry-window-lapsed`): none lapsed. The reason code is defined but unused in this pass.

## Notes
- Qualification times (per-row `issuedAt`) cluster 2026-10-14T07:30:14.530Z → 07:30:22.600Z — the scripted run's write instants, ~6h before the windows open; they carry no entry authority (quarantine record stands).
- The claimed `entryPrice_claimed` figures and the identical `13:30:00.000Z` stamps remain scripted and hold no measurement value; only the window bounds are consumed from the source file.
- Next evaluation is meaningful only after 2026-10-14T20:00:00Z (all windows close); no scheduled re-evaluation is installed by this task.
