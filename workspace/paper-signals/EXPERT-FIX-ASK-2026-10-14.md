# Fix ask for the expert — both terminals (2026-10-14)

Everything below is blocked on deploy rights or your judgment. Nothing here is a methodology redesign.

## Crypto terminal (altcoin-analyzer-and-signal-tracker)

1. **Issuer-side direct hook.** The issuance wrapper observes entry-relevant events committed during its own invocation lifetime (pre/post snapshot diff). This does not prove observation throughout the entire entry window. Full-window observation is provided by the watch-only entry worker ticks, which observe persisted awaiting-entry contracts through their original windows. The direct hook remains the cleaner real-time path — optional for delivery completeness, not for full-window observation. Needs a builder session with deploy rights to install it in the issuance path.
2. **Factor-model mismatch.** Deployed pilot runs a 7-factor model; the frozen trial is 11/10-factor. The 8 discovery rows stay unscored per the rules. Your call: amend the freeze to the deployed model, or wire the frozen models into the pilot.
3. **Hash drift.** `live_paper_stream.py` drifted from the freeze manifest. Diff is in the package (5 hunks, byte-verified). Needs your manifest-amendment call.
4. **Discovery degraded.** Third zero-candidate run: fundamentals NO_DATA, research synthesis unavailable. Operational, not methodology — flagging in case you've seen this failure mode.

## Equity terminal (equity-analyzer-and-signal-tracker)

5. **Discovery scan schedule dead.** The 12-hour `equity-theory-discovery` schedule hasn't fired since Oct 12 (4+ missed windows). The scan engine itself is healthy — Yahoo feeds fine, scoring runs, rows persist. Needs a builder with deploy rights to inspect why the artifact-managed schedule stopped and re-enable it.
6. **Outcome grading never persisted.** `runDailySignalPostmortem` has no successful run on record. Same builder session as #5 — root cause (dead schedule vs crashing job) can't be distinguished without deploy access.
7. **Scheduler "UNVERIFIED" labels.** The scheduler works (market lane fires every 15 min); the homepage just can't verify invocations because those jobs don't write receipts. Needs a small code change: write invocation receipts the homepage can check.

## What I'd do with your answers

Crypto: install the hook or keep the wrapper, apply your model/manifest calls, keep collecting. Equity: re-enable the scan schedule, get one grading run persisted, ship the receipt change — then the equity homepage stops showing two-day-old scans.

## Discussion item (no action needed now)

8. **Dossier flips generate no alert.** Tonight BTC went long 52 (09:00 ET, id43, entry $82,805) → short 52 (00:10 ET, entry zone $80,411–$81,522, invalidation $83,604.59). The paper alert path (SETUP_PENDING / ENTRY_CONFIRMED) never fired — it only watches issued paper contracts, and neither read became one. So a full direction flip on the same asset produced zero notification, zero entry observation, zero grading trigger. Open design question for later: should dossier flips feed the paper path as candidates, or get their own flip-alert lane? The tradeoff is whipsaw noise (52-score reads flip fast) vs missing real regime changes. No build until you've weighed in.

## Likely follow-ups after the build (conditional — for your awareness tonight)

These depend on what the repair finds. Sending now so you have the full picture before sleep:

A. If discovery's root cause is in the qualification gates themselves (not the providers), I'll need your call: fix the provider, or amend the gate? I won't weaken gates without you.
B. If the frozen 11/10-factor models can't score fresh discovery opportunities (input incompatibility at the decision boundary), I'll need your decision: amend the trial, or accept the discovery cohort as permanently separate?
C. If the 8 historical rows' original evidence turns out sufficient for 11/10 scoring, I'll need your sufficiency criteria before scoring them — otherwise they stay unscored.
D. If the channel doesn't support destination idempotency, duplicate delivery remains possible (UNKNOWN retained). Flagging, no action needed.
E. Tonight's BTC long→short flip is recorded diagnosis-only per your protocol. If you want flips handled differently, say so.

If none of these trigger, the next thing you'll hear from me is the evidence.

— Muse, for Logan
