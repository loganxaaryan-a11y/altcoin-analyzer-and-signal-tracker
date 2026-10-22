# Dossier Prospective Collection — Config v1

**Cohort:** `dossier-cohort-v1` · **Config version:** 1 · **Written:** 2026-10-14 ~16:00 ET
**Companion spec:** `SPEC-2026-10-14.md` (inclusion, outcome settlement, cost, cross-population rules).
This config is the **collection-side operational spec**: what gets captured, when, from
where, and in what shape. It changes nothing about the cohort spec — any change to
inclusion rules, outcome settlement, cost treatment, or entry semantics requires a new
cohort version (v2+), per the spec's versioning rule.

Paper signals only. No brokerage. No model tuning. No frozen-trial contact.

---

## 1. Capture trigger

A cohort row is written when **all** of the following hold:

1. The crypto terminal's `analyzeCoin` action produces a dossier verdict that is
   persisted via the dossier path as a `generated_signals` row
   (the `issueGeneratedSignalCandidate` issuance step) — i.e. a **dossier
   recommendation** with a terminal-assigned `generated_signals.id`.
2. The recommendation's **decision instant** (`decision_at_utc`) is **at or after
   2026-10-14 14:35 ET (2026-10-14T18:35:00Z)** — the cohort cutoff.
3. The row has not already been captured (dedupe on `dossier_signal_id`; see §6).

**Decision instant convention:** `decision_at_utc` is the terminal's persisted decision
time. Where the terminal persists only issuance time (`created_at`), issuance is the
decision instant and `decision_time_verified=True` with a note (this is how the three
2026-10-14 09:00 ET seed rows were recorded). Where a separate dossier decision time is
persisted, it takes precedence and the note records the source field.

**What does NOT trigger capture:** paper-trial candidate rows (`paper_signal_candidates`
/ `paper_signals` — the frozen paper cohort), equity-terminal dossier rows
(population is crypto-terminal only), abstentions/no-call outputs (nothing actionable
was issued), replays/fixtures.

## 2. What gets captured for every row

Every captured recommendation carries decision-time evidence exactly as it stood when
the dossier committed — never reconstructed, never backfilled:

| Captured element | Source field(s) | Rule |
|---|---|---|
| Decision timestamp | `decision_at_utc` (+ `decision_time_verified`, `decision_time_note`) | Persisted terminal time; derived only if the terminal persisted nothing, flagged as such |
| Evidence timestamp | `source_as_of_utc`, per-factor `asOf` in `factor_ledger_json` | Evidence cutoff as the terminal recorded it; factors missing `asOf` are kept with `asOf: null`, never invented |
| Horizon | `outcome_rule` | The dossier publishes no explicit holding horizon. Settlement is the cohort's documented choice: first-touch 5D/14D/30D vs invalidation/target1, net of 18 bps, identical to the frozen paper trial (spec § Outcome-settlement rule) |
| Full 11-factor evidence | `factor_ledger_available`, `factor_ledger_json` | The terminal's 11-factor dossier ledger as committed: per factor label, score, contribution, weight, quality (`live`/`no_data`), `asOf`, source, value/reading. Verbatim; anything the terminal did not persist is `UNAVAILABLE`, never invented |
| Executable entry conditions | `entry`, `entry_rule`, `window_start_utc`, `window_end_utc` | The dossier's stated entry level under the frozen `actionable-entry-v1` entry contract: `entryWindowOpensAt = decisionAt`, `entryWindowExpiresAt = decisionAt + 15 min` (crypto), `void_expired` on prints after window end, drift cap 1.50, 5-min observation-age limit |
| Invalidation + targets | `invalidation`, `target1`, `target2`, `atr14`, `risk_multiplier`, `risk_method` | The dossier's published levels; invalidation is the standing per-call invalidation for first-touch grading |
| Whether an actionable entry is verified | `entry_status_at_record`, `disposition_reason` | `entered` only on an observed entry print inside the window (venue + timestamps as evidence); otherwise `expired_non_entry` (window closed, no entry), `void_drift`, or `void_no_quote` per the frozen terminal states. Expired/voided rows are excluded from the accuracy cohort but never deleted |
| Cost model | `costs_bps_paper = 18` | Frozen 18 bps round-trip, net on every graded outcome |

**Outcome columns** (`outcome_5/14/30`, `return_5/14/30`) are `not-graded` until their
checkpoint elapses. Never scored as 0, never silently dropped.

## 3. Row schema (v1)

The rows file is `rows/dossier-cohort-v1.csv`. Column order is fixed at v1; new columns
require a config version bump and are appended (never inserted mid-row).

**Identity:** `dossier_row_id` (`dossier-v1:crypto:<generated_signals.id>`),
`cohort_id` (`dossier-cohort-v1`), `cohort_version` (`1`), `terminal` (`crypto`),
`symbol`, `coin_id`, `dossier_signal_id` (the terminal's `generated_signals` id; empty
only for chat-sent rows with no persisted terminal row — see §4).

**Timing:** `decision_at_utc`, `issued_at_utc`, `source_as_of_utc`,
`decision_time_verified` (True/False), `decision_time_note`.

**The call:** `direction` (`long`/`short`), `confidence`, `setup_type`, `entry`,
`invalidation`, `target1`, `target2`, `atr14`, `risk_multiplier`, `risk_method`.

**Entry contract:** `entry_rule` (entry-contract semantics text), `window_start_utc`,
`window_end_utc`, `entry_status_at_record`
(`entered` / `expired_non_entry` / `void_drift` / `void_no_quote`),
`disposition_reason` (free text with evidence references).

**Evidence:** `factor_ledger_available` (True/False), `factor_ledger_json`
(the full 11-factor ledger, verbatim JSON).

**Cost + settlement:** `costs_bps_paper` (`18`), `outcome_rule`
(`first-touch 5D/14D/30D vs invalidation/target1, net of 18 bps; same convention as
frozen paper trial`), `outcome_5`, `outcome_14`, `outcome_30`
(`not-graded` / `HIT` / `MISS`), `return_5`, `return_14`, `return_30` (net returns;
empty until graded), `outcome_note`.

**Linkage + provenance:** `cross_population_link` (paper-trial row id if the same call
also appears in the paper cohort; join key only — never read counts across it),
`chat_sent` (`sent` / `unsent` / `unverified` — see §4), `recorded_at_utc`,
`recorded_by`, `notes` (provenance caveats: missing factor asOf, unlabeled inputs,
NO_DATA factors).

## 4. Chat-sent recommendations — capture process

Any dossier recommendation **sent to chat** — Logan's alerts (research side chat),
side-chat posts, terminal notifications — is a recommendation he could act on and must
be captured, whether or not the terminal persisted it.

**Process:**
1. When a chat-sent dossier recommendation is observed (alert delivery logs, chat
   transcript review, notification outbox), match it to its `generated_signals` row by
   `(symbol, direction, entry, created_at within ±15 min of the chat timestamp)`.
2. **Matched:** set `chat_sent=sent` on the existing cohort row and append the delivery
   evidence (channel, timestamp, alert id) to `notes`. Do not write a second row.
3. **Unmatched (no persisted terminal row):** write a full cohort row anyway with
   `dossier_signal_id` empty, `decision_time_verified=False`, and `notes` recording
   the chat evidence as the sole provenance. The spec's "must not be missed" rule
   overrides the terminal-persistence requirement. `factor_ledger_json` carries
   `UNAVAILABLE` for anything not in the chat message — never reconstructed.
4. **Inconclusive:** `chat_sent=unverified` with the reason in `notes` (this is the
   status of the three 09:00 ET seed rows).

The collecting agent reviews chat delivery surfaces once per collection run. A run that
finds no chat-sent recommendations records `chat_sent=unverified` only where delivery
could not be checked — never assumed `unsent` without evidence.

## 5. Collection runs

- A collection run reads the terminal's `generated_signals` (workspace DB copy,
  read-only) for rows with `created_at >= 2026-10-14T18:35:00Z` not already in the
  cohort, applies the §1 trigger, appends rows per the §3 schema, and writes a run
  note (see `collection-check-*.md`).
- **Append-only.** Existing rows are never edited, re-scored, or deleted. Corrections
  to a recorded row are made by appending a superseding note file, never by mutating
  the CSV.
- A run with nothing new appends nothing and records an honest zero in its run note.
  Zero is a result, not a failure.

## 6. Dedupe

- Primary key: `dossier_row_id`. A second capture attempt for the same
  `dossier_signal_id` is dropped and noted in the run note.
- Chat-sent matching (§4) never creates a duplicate of an already-captured terminal
  row; it annotates it.

## 7. What this config does not do

- It does not grade outcomes (that's the settlement process, per the spec).
- It does not attribute failures (that's the directional-failure ledger,
  `directional-failure-ledger/LEDGER-PROCESS-v1.md`).
- It does not compare against any baseline (see `BASELINE-REFERENCE-2026-10-14.md`).
- It does not touch the frozen paper trial, the holdout, or any frozen model.
