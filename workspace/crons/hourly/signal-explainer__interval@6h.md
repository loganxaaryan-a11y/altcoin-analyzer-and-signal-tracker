---
id: signal-explainer
title: Signal explainer alerts (human-readable new-signal alerts)
enabled: false
owner: goal:research-terminal
mode: task
schedule:
  kind: interval
  timezone: America/Toronto
  at: 2026-10-20T08:23:49
  every: 6h
timeout_secs: 600
delivery:
  - chat_id: 7b75e732-f527-4d53-b40d-4aa036201d9b
metadata:
  tags: [cron:automatic-interval-anchor]
  originating_chat_context_json: '{"chat_id":"a685c3e7-c8be-4137-8900-4e899008bca7","origin_provider":"main","chat_kind":"direct","event_kind":"message","require_mention":false,"device_id":"d8c63a1c-801b-497b-a9fe-cd2681d2185d"}'
  presentation_locale: en-US
---
# Signal explainer alerts (PAPER — human-readable new-signal explanations)

PAPER ONLY. Additive, read-only layer. NEVER changes strategy, the paper pipeline, frozen methodology, holdouts, or any in-flight expert repair. You read the trackers and explain; you do not issue, suppress, veto, or re-score anything.

EVIDENCE REUSE (binding — see hidden_files/evidence-reuse/SPEC.md): this job reuses the one-read mirrors instead of re-pulling the trackers. Invoke terminal actions ONLY for signals not yet in the mirror, or when the mirror is >2h stale.

Your output, when you emit explanations, IS the chat message: the runtime posts your run output to the research side chat automatically. When no new signals since last check, stay silent — emit no chat-facing output.

## Paths
- Mirrors (PRIMARY evidence): ~/workspace/goals/research-terminal/hidden_files/terminal-state/crypto-state.json and equity-state.json — open_signals rows, theories, market_read, discovery. Note generated_at and each section's as_of.
- Ledger (book of record): ~/workspace/goals/research-terminal/paper-signals/signal-explainer/explained.json — keyed <terminal>:<signal_id>; each signal explained exactly once. Contract: README.md in the same directory.
- Run logs: ~/workspace/goals/research-terminal/paper-signals/signal-explainer/runs/ (keep last 20 files).
- X-sweep calls: ~/workspace/x-sweep/v2/calls.md (contradictions input).
- Quality bands: newest ~/workspace/goals/research-terminal/hidden_files/signal-accuracy/signal-accuracy-YYYY-MM-DD.md (band + direction hit rates for the QUALITY READ).
- Receipt schema: ~/workspace/goals/research-terminal/hidden_files/receipt-provenance/RECEIPT-SCHEMA.md

## 1. Time budget (BOUNDED)
Note start time (UTC). ALL file writes complete by start+20:00; run log done, end by start+25:00. Do NOT start a terminal action call after start+15:00 — log `terminal_fetch: deferred — budget` and end. NEVER write files after producing the final output message.

## 2. Load the ledger + mirrors
Read explained.json. Note last_check_utc and existing keys. Read both mirrors; note generated_at and the open_signals/discovery/theories sections' as_of. If a mirror is >2h stale, label it stale in the run log and (only then) you may invoke getsignaltracker/getmarketread for that side as the exception path — log which exception fired and why.

## 3. Determine new signals (mirror-first, no re-pull)
- New = open_signals/discovery rows with created (fallback signalDate) strictly after the ledger's last_check_utc AND no ledger key for <terminal>:<signal_id>.
- A signal that already closed before this run is still explained once — lead the explanation with the outcome (hit target / stopped), plainly.
- If a row carries a replay/fixture marker, explain it once like any other row but name the marker in the explanation.
- EXCEPTION (only): a signal you know was issued but is NOT in the mirror (issued after the last mirror build) — then and only then invoke getsignaltracker for that signal alone (targeted read, never a full re-pull), and log the exception.
- Never fabricate rows, never explain from memory. If a terminal action fails: log it in the run log and stay silent on that side.

## 4. Regime + theories (mirror-first)
Use each mirror's market_read section for the REGIME lines (timestamped with its as_of). Use each mirror's theories section for the theories contradiction input. Invoke getmarketread or listtheories ONLY if that mirror section is missing or >2h stale.

## 5. Contradiction inputs (per new signal)
- Discovery agreement score vs dossier confidence: compare the row's agreementScore and dossierConfidence (or equivalents) if both present; name the gap plainly. If either is absent, say so in one clause.
- X-sweep: read ~/workspace/x-sweep/v2/calls.md; use rows from the last 7 days. If a recent call's implied direction on the same asset — or on the broad market for market-correlated assets — opposes the signal, name it (handle, time, call).
- Theories: from the mirror theories section; if any live (non-expired, non-invalidated) theory points the opposite direction on the same asset, name it.
- Internal tension: a factor whose reading cuts against the signal direction, or the row's own reliability kill flag — name it.

## 6. Compose the explanation
Voice: explaining to Logan in chat. Short paragraphs, no machine dump, no schema jargon. One block per signal:

**PAPER — SIGNAL EXPLAINER — <ASSET> <direction> (<terminal>, signal <id>, issued <createdAt>)**

WHAT — direction, asset, entry, invalidation, target(s), plain language. Include distance to invalidation and to target 1 as percentages and the implied R-multiple to target 1 (reward ÷ risk). Already-closed signals lead with the outcome.

WHY — top 3–4 factors by |contribution| with nonzero weight, in words: "<label> scored <score>: <reading in plain language>". If the mirror row lacks factor detail for a new signal, you may do ONE targeted terminal read for that signal only — otherwise say which factor reads were unavailable. Skip NO_DATA factors silently unless every factor is NO_DATA (then say the signal fired with no live factor reads).

REGIME — one or two lines from the mirror market_read, timestamped with its as_of: composite direction, breadth, fear/greed, funding regime (crypto); index trend + breadth (equity).

CONTRADICTIONS — name each disagreement plainly, or "none found" with what was checked.

QUALITY READ — honest calibration. The row's reliability block first (band, hit rate, sample size, kill flag, status); supplement with the latest signal-accuracy report's band + direction hit rates. Never inflate: n<20 is "small sample"; uncalibrated/n=0 is "no basis yet"; a kill flag is named, never buried.

Trailer: `explained: <terminal>/<signal_id>`

## 7. Emit with ledger pre-commit
1. Decide the final due set.
2. PRE-COMMIT FIRST: for each due key write {signal_id, terminal, asset, direction, created_at, explained_at_utc (now)} into explained.json and advance last_check_utc to now. ONE write call.
3. Write the run log runs/run-<UTC-ts>.json as the two-field receipt envelope (RECEIPT-SCHEMA.md):
   - `invocation_completed`: run_ts_utc, started_utc, finished_utc, status (succeeded | failed | incomplete), rows seen per terminal, new keys, explained keys, skipped+why, mirror as_of timestamps, exception-path invocations + why, action failures. This proves THIS run ran — nothing about who started it.
   - `scheduler_provenance`: `origin_unverified` (DEFAULT — write this), `manual` (write ONLY when this run was started by an explicit manual invocation whose reason begins with `manual:` or is a documented repair/test run), NEVER `verified:<execution-id>` (reserved for the external reconciliation pass — `hidden_files/receipt-provenance/RECONCILIATION.md`). You cannot self-certify a scheduled origin from inside the run.
   Prune runs/ to last 20.
4. NOW compose the final output message: one §6 block per new signal. This rendered text IS the send. Produce it as your final message and stop.

If you are killed after step 2 but before 4, the ledger already holds the keys — the next run skips them. At worst an explanation is lost, never duplicated.

## 8. Quiet
No new signals and nothing to surface: stay silent — emit no chat-facing output.
