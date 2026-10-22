# QUARANTINE RECORD — 42 scripted equity-discovery entries (2026-10-14)

**Quarantine issued:** 2026-10-14 ~08:50 UTC · **Status:** ACTIVE — these records are barred from any live performance claim.
**Scope:** all 42 contracts in `equity-discovery/handoff/handoff-store-2026-10-14.db` (source read-only; originals untouched; copies below are quarantine by reference).

## Reason
The records claim `entryState: entered` with `entryEvidence: venue-trade`, but the entry evidence is fabricated:
- `entryObservedAt` is **identically `2026-10-14T13:30:00.000Z` on all 42 rows** (ScriptedFeed-style scripted open-print stamp).
- `entryReceivedAt` spans `13:30:14.530Z` → `13:30:15.1xxZ` — the run-time write instants, ~6h before the entry window (13:30→20:00Z) opened.
- No genuine venue print was ever observed; the "entered" state was stamped by a scripted handoff run, not by the entry-observation contract.

## Reclassification (v2, evaluated 2026-10-14 ~08:45 UTC)
All 42 entry windows are `2026-10-14T13:30:00Z → 2026-10-14T20:00:00Z` — entirely in the future at audit time.
- **42 → STILL-PENDING** (window valid, may still enter on a genuine opening print once the live path exists)
- **0 → expired** (`entry-window-lapsed`); none lapsed at audit time
- Updated reclassification: `reclass-42-longs-2026-10-14.v2.csv` (original `reclass-42-longs-2026-10-14.csv` preserved untouched)

## Measurement bar
- None of the 42 may be counted as entered in any performance measurement. They are on the exclusion list: `audit/exclusion-first-print-fidelity-2026-10-14.csv`.
- The only document claiming them as "issued" — `equity-discovery/handoff/handoff-report-2026-10-14.md` ("Outcome mix: issued:42") — is **superseded by this record**. Any measurement harness reading that report must treat those 42 as STILL-PENDING (quarantined), never entered.

## Explicit gate
**NO live equity entry may be claimed until BOTH:**
- (a) the resumable scan is deployed on the live artifact, AND
- (b) a genuine opening-print venue feed is wired.

Until both hold, any equity "entry" produced without a real opening-print venue feed is fabrication by construction and belongs in quarantine, not in results.

## Contents
- `quarantine-equity-42-rows.json` — full copies of the 42 contract rows with provenance (`source_store`, `copied_at`, `original_untouched: true`)
- `equity-42-id-table.csv` — symbol / signal_id / contract_id / window / quarantined status for all 42
- `quarantine-excluded-rows.jsonl` — also contains these 42 alongside the other excluded entries

### All 42 quarantined entries
Full machine-readable list (symbol / signal_id / contract_id / window / status) in `equity-42-id-table.csv` and `reclass-42-longs-2026-10-14.v2.csv`.
