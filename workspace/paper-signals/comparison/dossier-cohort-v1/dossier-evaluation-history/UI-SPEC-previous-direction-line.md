# UI SPEC — "previous direction" line on the dossier card

**Scope:** bounded UI work, dossier card only. Paper only. Diagnosis-only
display — NOT an alert lane, NOT a flip threshold, NOT a notification.

**Status:** record layer complete; deploy-side application NOT applied —
see "Blocker" below.

## Placement

File: `client/src/App.tsx`, in the `DossierView` pinned-dossier-verdict
section (currently the `<section className={`dossier-pin ${v.side}`}`
with `aria-label="Pinned dossier verdict"`), directly beneath the existing
`Source as of …` line. Render only when a dossier read is displayed
(`d`/`v` defined).

## Data source (hard requirement)

The line is drawn **only** from the history store
(`comparison/dossier-cohort-v1/dossier-evaluation-history/history.jsonl`) via
a read-only lookup equivalent to `get_previous_evaluation(symbol,
before_decision_at)`:

- `symbol` = the displayed dossier asset's symbol (e.g. `BTC`)
- `before_decision_at` = the CURRENT dossier read's `decision_at` (the
  terminal's dossier decision instant, not the page-load time)
- Selection: latest record with the same `symbol` and `decision_at` strictly
  earlier than the current read
- **Never inferred, never reconstructed.** If the lookup returns null, the
  fallback renders. No client-side derivation from current prices, levels, or
  any other state.

## Server field contract (new dossier action)

The client must call a new server action (name left to the builder, e.g.
`getDossierPreviousEvaluation({ coinId, beforeDecisionAt })`) returning:

```
{
  "evaluation_id":  "dossier-btc-id43-2026-10-14",   // string
  "direction":      "LONG" | "SHORT",                // enum
  "score":          52 | null,                       // number|null
  "decision_at":    "2026-10-14T13:00:21Z",          // UTC ISO
  "diagnostic_note":"optional string or null"
}
```

or `null` when no prior evaluation exists.

## Exact render

Primary line (format):
```
Previously LONG 52 · 2026-10-14 09:00 ET
```
- `Previously {direction} {score} · {decision_at formatted}`
- `direction` uppercase as stored; `score` omitted with no trailing space
  when null: `Previously LONG · 2026-10-14 09:00 ET`
- Date/time format: `YYYY-MM-DD HH:MM ET` (24h, America/Toronto — the same
  convention the terminal already uses for card timestamps)

Mandatory companion microcopy (same muted styling as existing
`score-disclaimer` lines):
```
Diagnostic only · uncalibrated read — not an alert, not an entry.
```

## Fallback (no prior evaluation exists)

When the lookup returns null, render:
```
No previous evaluation on record.
```
Muted styling. No placeholder values, no backfilled estimates — an empty
store state stays visibly empty.

## Explicit non-goals (do not build)

- No alert, toast, push, or chat notification on direction change
- No whipsaw threshold or cooldown counter
- No auto-entry, no paper contract creation, no link to any issuance path
- The line must not appear on confirmed-entry signal cards — dossier card only

## Blocker

Applying this change to the deployed terminal requires deploy rights on the
deployed artifact (`altcoin-analyzer-and-signal-tracker`, live at
diverge.grok.me). This subagent has no deploy/publish capability for that
artifact, and per standing rules no terminal UI edit ships without Logan's /
the parent orchestrator's explicit go-ahead. Deliverable for the builder:
this spec plus the seeded history store. A builder with terminal write +
deploy rights applies the change exactly as specified above; the only
expected deviation is the server action name.
