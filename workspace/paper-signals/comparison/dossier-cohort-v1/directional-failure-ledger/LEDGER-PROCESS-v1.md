# Directional-Failure Investigation Ledger — Process v1

**Ledger version:** 1 · **Written:** 2026-10-14 ~16:00 ET
**Cohort:** `dossier-cohort-v1` · **Companion:** `COLLECTION-CONFIG-v1.md`
**Location:** `directional-failure-ledger/ledger.csv` (created on first entry)

Paper signals only. No brokerage. No model tuning. No frozen-trial contact.

## 1. Purpose

For every `dossier-cohort-v1` row that reaches a graded outcome (or expires as a
non-entry), record **why the call failed** — or confirm it didn't — as a single
attributed failure mode. The ledger turns the dossier stream into a running failure
taxonomy: when the machine is wrong, is it wrong about **direction**, about **entry
timing**, or about **exit framing**?

This runs **on the dossier stream, independently**. It does not block on Challenger A's
maturation and does not wait for any challenger result. When Challenger A (chart-setup
breakout, `~/workspace/goals/research-terminal/challengers/SPEC-A-CHART-SETUP-v3-2026-10-14.md`)
reaches evaluation, it joins against this ledger by `dossier_row_id` — the ledger is
the labeled failure data, not a dependency.

## 2. When a ledger entry is written

- **Entered rows:** one ledger entry per outcome checkpoint as outcomes grade —
  at 5D, updated at 14D, final at 30D. The 30D entry is the terminal attribution;
  earlier checkpoints are interim (field `checkpoint` distinguishes them).
- **Non-entry rows** (`expired_non_entry` / `void_drift` / `void_no_quote`): one
  ledger entry at record time, attributed under `entry_timing_wrong` with the
  matching subtype. A dead window is data, not a skip.
- **Never edits the cohort CSV.** The ledger is a separate file keyed by
  `dossier_row_id`. Attribution disputes are resolved by appending a superseding
  ledger row (higher `ledger_version_row`), never by mutating.

## 3. Attribution taxonomy (v1)

Exactly one `primary_attribution` per ledger row, plus an optional
`attribution_subtype`. Definitions are operational, not interpretive:

| `primary_attribution` | Meaning | Applies to |
|---|---|---|
| `direction_wrong` | Entered row graded MISS on first touch: invalidation touched before target1. The directional call was wrong at the called levels. | entered rows |
| `entry_timing_wrong` | The call's level/those were unusable in time. Subtypes: `window_expired` (15-min window closed, no entry print — level never traded or window too tight); `level_never_printed` (price never reached the entry level within the horizon even outside the window); `immediate_stop` (entered, then invalidation touched within the first N bars while the directional thesis later played out — evidence required in `evidence_note`). | entered + non-entry rows |
| `exit_framing_wrong` | The direction was right but the exits were wrong. Subtypes: `stop_too_tight` (invalidation touched first, price subsequently reached target1 within the horizon); `target_too_ambitious` (direction right, invalidation held, target1 never reached — the move didn't pay the framed target). | entered rows |
| `no_failure` | Entered row graded HIT (target1 touched first). | entered rows |
| `unattributable` | Insufficient market data to grade, or the checkpoint evidence is ambiguous. Never used to hide a miss — the reason goes in `evidence_note`. | any |

**Attribution precedence:** if both `entry_timing_wrong/immediate_stop` and
`exit_framing_wrong/stop_too_tight` fit, `exit_framing_wrong` takes precedence
(the stop placement is the framing error); the timing read goes in `evidence_note`.

## 4. Challenger A relationship

Challenger A is the trend-and-consolidation breakout challenger (SPEC-A v3, frozen).
Its mechanism — volatility compression → range expansion with a completed-breakout-bar
entry trigger and a structural stop at the opposite range extreme — is a candidate fix
specifically for `entry_timing_wrong` and `exit_framing_wrong` failures (executable
trigger replaces the dossier's level-and-window entry; structural stop replaces the
ATR-derived invalidation).

Each ledger row carries `challenger_a_relevance` (`yes` / `no` / `unassessed`) and an
optional `challenger_a_note` (e.g. "breakout trigger would have entered 3 bars later;
structural stop 1.2× wider"). This is **annotation, not evaluation** — it does not
score Challenger A, and Challenger A's own evaluation protocol (SPEC-A §10) is
untouched. The field exists so that when A matures, its authors can filter the ledger
for the failure modes it claims to fix.

## 5. Ledger row schema (v1)

`ledger_row_id`, `dossier_row_id`, `cohort_version`, `checkpoint`
(`5D` / `14D` / `30D` / `expiry`), `graded_outcome` (`HIT` / `MISS` /
`not-applicable` for non-entries), `return_net` (graded net return where applicable),
`entry_status` (copied from the cohort row: `entered` / `expired_non_entry` /
`void_drift` / `void_no_quote`), `primary_attribution`, `attribution_subtype`,
`challenger_a_relevance` (`yes` / `no` / `unassessed`), `challenger_a_note`,
`evidence_note` (first-touch timestamps, adverse-touch bar evidence, analyst reasoning),
`graded_at_utc`, `graded_by`.

Template with one clearly-marked EXAMPLE row (not real data):
`directional-failure-ledger/ledger-template.csv`.

## 6. Reading the ledger

- The ledger is a failure-mode census, not a verdict. Its honest outputs are counts by
  `primary_attribution` (and subtype) over graded entered rows — e.g. "of N graded
  dossier entries, X% direction_wrong, Y% entry_timing_wrong, Z% exit_framing_wrong."
- **No comparative claim against any baseline until N ≥ 20 graded entered rows**
  (same discipline as Logan's no-probability-below-20 rule).
- The ledger never re-scores a cohort row and never feeds a model. It measures;
  it does not train.

## 7. Versioning

Taxonomy changes (new attribution values, new subtypes, changed precedence) require
ledger v2 with a new process doc; rows carry `cohort_version` and the ledger file
carries the ledger version. Superseded versions are preserved, never edited.
