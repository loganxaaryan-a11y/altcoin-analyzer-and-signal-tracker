---
id: paper-discovery-handoff
title: Paper-signal discovery → qualification handoff (crypto, every 6h)
enabled: false
owner: goal:research-terminal
mode: task
schedule:
  kind: interval
  timezone: America/Toronto
  at: 2026-10-01T23:09:23
  every: 6h
timeout_secs: 7200
delivery:
  - chat_id: a685c3e7-c8be-4137-8900-4e899008bca7
metadata:
  originating_chat_context_json: '{"chat_id":"a685c3e7-c8be-4137-8900-4e899008bca7","origin_provider":"main","chat_kind":"direct","event_kind":"message","require_mention":false,"device_id":"d8c63a1c-801b-497b-a9fe-cd2681d2185d"}'
  presentation_locale: en-US
---
Paper-signal discovery → paper qualification handoff (automatic, paper only, no brokerage).

Context: the crypto discovery schedule `crypto-market-discovery` (every 6h, radar-only) just ran ~45 min ago. Your job is to hand its fresh radar candidates to the repaired paper qualification path — never the legacy issuer — using the handoff implementation at ~/workspace/goals/research-terminal/paper-signals/handoff/ (read its README.md first; it is the spec).

Steps:
1. Check the latest `crypto-market-discovery` run (artifact `altcoin-analyzer-and-signal-tracker`, action `runmarketdiscovery`, run history). If that run FAILED or its radar-candidate output is unreachable, SKIP the handoff, say so plainly in your report, and stop. Never fabricate candidates, never reuse a previous run's file silently.
2. Write the run's radar candidates VERBATIM to `paper-signals/handoff/inbox/discovery-<ISO8601 UTC>.json` in the handoff's DiscoveryRun schema (runId, source "crypto-market-discovery", completedAt, freezeVersion "v2.1.5", candidates[] with symbol/direction/score/entryPrice/invalidation/target1/target2/signalDate/detectedAt/factorLedger/decisionEvidence). Carry every field discovery emitted; omit nothing; invent nothing. If discovery emits no candidates, still write the file (empty candidates array) and continue.
3. From `paper-signals/handoff/`, run: `node src/handoff-run.ts --feed binance --run <the file you just wrote>`. NEVER use `--feed scripted` outside a labeled demo. The CLI persists each candidate's factor ledger BEFORE qualification, routes through the repaired integrated handler (via "automatic"), and records one outcome per candidate (qualified/abstained/deferred/failed + reason code). The runtime no-legacy-issuer guard runs first; if it throws, stop and report.
4. Report briefly: discovery run id + completion time, counts (qualified/abstained/deferred/failed), and any non-qualified candidate's symbol + reason code. Escalate (say so loudly) only on: failed outcomes, stale-discovery-run refusals, zero-candidate anomalies, guard throws, or CLI errors.

Keep the run cheap: no extra research, no rebuilds, no terminal questions. The handoff report is written to `paper-signals/handoff/evidence/handoff-report-<runId>.json` by the CLI — reference its path, don't paste it whole.
