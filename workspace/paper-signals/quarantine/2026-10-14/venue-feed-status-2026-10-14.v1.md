# Venue feed status — v1 (2026-10-14, 09:00Z)

**Verdict: NOT WIRED — no genuine opening-print venue feed exists for equity entries.**

## Evidence checked
- `entry-v1/src/feed.ts`: `VenueFeed` is an injectable interface ("sandbox only — no production changes"); the ONLY implementation in the codebase is `ScriptedFeed` ("Deterministic in-memory venue feed for tests ... NOT for production use").
- `equity-discovery/README.md` (paper handoff): "Equity entry semantics: entry-v1 `next-xnys-regular-session-open-print` (consolidated tape). **Sandbox venue is a `ScriptedFeed`** — the contract's equity entry rule is the production rule; only the venue is scripted."
- `quarantine-record-equity-42.md`: no genuine venue print was ever observed — the 42 `entered` stamps were ScriptedFeed artifacts, which is why the cohort was quarantined.
- Repository-wide search for any other `VenueFeed` implementation, a live opening-print observer, or a consolidated-tape wiring found none. The equity entry rule names the required venue ("next XNYS regular-session open print on the consolidated tape"), but no production feed substitutes the scripted one.

## What's missing
- A genuine opening-print feed for equity: an observer that reads the consolidated tape and emits the first regular-session open print (per `entry-v1` entry semantics), wired into the entry path instead of `ScriptedFeed`. Building/deploying that is out of this task's bounded scope and is not wired anywhere today.

**Gate condition (b): NOT MET.**
