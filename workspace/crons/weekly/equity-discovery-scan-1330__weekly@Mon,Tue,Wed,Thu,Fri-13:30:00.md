---
id: equity-discovery-scan-1330
title: Equity discovery scan 13:30 ET (workspace batch lane)
enabled: false
owner: goal:research-terminal
mode: task
schedule:
  kind: weekly
  timezone: America/Toronto
  time: 13:30:00
  dow: [Mon, Tue, Wed, Thu, Fri]
timeout_secs: 600
metadata:
  originating_chat_context_json: '{"chat_id":"a685c3e7-c8be-4137-8900-4e899008bca7","origin_provider":"main","chat_kind":"direct","event_kind":"message","require_mention":false,"device_id":"d8c63a1c-801b-497b-a9fe-cd2681d2185d"}'
  presentation_locale: en-US
---
Run the next pending batch of the workspace batch lane equity discovery scan. This lane is a labeled BACKUP — not a substitute for the deployed discovery repair.

Step 0 — budget governor pre-flight. Run:
  python3 ~/workspace/goals/research-terminal/hidden_files/budget-governor/pace_check.py --provider yahoo --slot daytime
The equity lane uses free Yahoo Finance data only (no metered APIs); the governor returns allow. If it ever returns degrade/skip, note it in the report and continue — never fail the run for budget. Finnhub/Alpha Vantage stay on-demand only: zero scheduled calls; this step does not change that.

Step 1 — market-open check. This job fires Mon–Fri by schedule; check whether today is a NYSE trading day (NYSE holiday calendar, e.g. https://www.nyse.com/markets/hours-calendars). If today is a NYSE market holiday: end the run here WITHOUT running scan_batch and WITHOUT advancing the cycle; report "market holiday — skipped, cycle unchanged."

Step 2 — resolve the cycle (cycle-auto). An 8-batch cycle needs 8 market-hours runs = 2 trading days, so REUSE the latest incomplete cycle in ../state instead of starting a fresh date cycle every day:
  CYCLE=$(python3 -c "
import json, glob, os
TERMINAL={'scored','qualified','failed','skipped'}
best=None
for f in sorted(glob.glob(os.path.expanduser('~/workspace/goals/research-terminal/paper-signals/equity-discovery/state/scan-state-*.json'))):
    d=json.load(open(f))
    if any(v.get('status') not in TERMINAL for v in d.get('symbols',{}).values()):
        best=d.get('cycle')
if best: print(best)
else:
    from datetime import datetime, timezone
    print(datetime.now(timezone.utc).strftime('%Y-%m-%d'))
")
  Report the resolved CYCLE value.

Step 3 — run the next batch:
  cd ~/workspace/goals/research-terminal/paper-signals/equity-discovery/scan
  python3 scan_batch.py --state-dir ../state --cycle $CYCLE --batches 8 --batch-index next
  (picks the lowest batch index with non-terminal symbols; exits ok with allTerminal:true when the cycle is complete)

Step 4 — consolidate:
  python3 consolidate.py --state-dir ../state --cycle $CYCLE
  If it exits 0 (every universe symbol terminal), run the paper handoff for this cycle's qualified candidates per the handoff/README section of the ops doc (build_inputs.mjs + run_handoff.mjs with cycle-specific output names). If consolidate exits non-zero, stop and report the missing batches.

Step 5 — report per-symbol accounting from the run record in ../state/runs/ for this cycle (attempted/alreadyTerminal/counts by status, mean+max elapsed ms), plus the resolved CYCLE.

Boundaries: this is the workspace batch lane repair for the deployed discovery (equity-theory-discovery) 120s timeouts. Label all results as workspace batch lane explicitly — a labeled backup, NOT a substitute for the deployed discovery repair, which remains necessary. Paper signals only; no brokerage. Do not touch the deployed artifact, the crypto pipeline, or any frozen methodology (7-factor weights 6/8/8/20/8/20/20, Wilder RSI-14, ATR-14, issuance gates stay as ported). Report the full stdout summary plus the accounting file path.
