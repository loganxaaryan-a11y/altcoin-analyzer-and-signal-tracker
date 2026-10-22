# v2.1.0 acceptance run — log

[identity] handler.ts sha256 (runtime recompute): b43a788047ebb234d3c996595a9612cda60f1acd69adba25eb8bf8d8746b393b
[identity] manifest v2.1.0 records:               b43a788047ebb234d3c996595a9612cda60f1acd69adba25eb8bf8d8746b393b
[identity] MATCH — the repaired issuance path is the frozen source.

[candidate] crypto:31 — BTC long (strategy crypto-dossier-factor-agreement 2.0.0-measurement-contract)
[candidate] decision_at=2026-10-10T01:51:23.436000+00:00 | provenance=RETROSPECTIVE: decided before any freeze existed (all decisions 2026-10-10 -> 2026-10-14T02:23:07Z, before v1.0.0 2026-10-14T02:42:57Z and v2.0.0 2026-10-14T04:09:32Z); freeze_version=2.0.0 is a collection-time backfill, not prospective provenance; prospective provenance cannot be established (MEASUREMENT-GAPS-2026-10-14.md verdict (a)) (none-predates-freeze) | cohort=pilot-60-backfill
[candidate] recorded: score=56/44 entry=82636.0 invalidation=79834.46627839624 target1=86838.30058240565 target2=89639.8343040094 atr14=2241.2269772830105

[model] FULL frozen production crypto model run on the real ledger:
[model] long_score=56 short_score=44 direction=long (weighted_net=2.5, total_weight=17, factors_used=11)
[model] REPRODUCED: direction and score match the real recorded signal (prod_reproduced=True).

[input] signal-day (real, 2026-10-09): O=81754.45 H=83527.68 L=81623.77 C=82638.53
[input] history: 8 daily closes/highs through the signal day (real)
[input] vetoBars: 59 pre-decision 1m bars (real; setup-history features)

[run] integrated issuance path: ingest -> min-score -> freshness -> retained regime gate -> runQualificationChecks (repaired veto) -> contract build -> entry observation -> checkWaitingInterval (repaired) -> post-entry -> outcome commit

[outcome] status=issued
[outcome] DECIDING GATE: (none)
[outcome] reason: issued via integrated crypto path; entered 2026-10-10T01:52:09.514Z; entry alert appended to sandbox-feed
[outcome] detail keys: vetoSummary, contractId, entryEventId, polls, postEntryInvalidation, postEntryReason
[gate-check] the deciding gate "issued (all repaired gates passed)" is one of the REPAIRED gates — the superseded historical veto decided nothing.

[delivery] alerts enqueued: 2
[delivery] alerts persisted in the DB: 2
[delivery]   setup alert setup_d19df4ddba2acbf45dc1ab57a7497600 (signal sig_d19df4ddba2acbf45dc1ab57) enqueuedAt=2026-10-10T01:51:23.436Z destination=awaiting-user-choice
[delivery]   entry alert entry_sig_d19df4ddba2acbf45dc1ab57 (signal sig_d19df4ddba2acbf45dc1ab57) enqueuedAt=2026-10-10T01:52:23.436Z destination=awaiting-user-choice
[delivery] ARMED: every enqueued alert carries destination "awaiting-user-choice" (Logan has not chosen a destination; none invented).

[tracker] issued signals persisted: 1; signalId=sig_d19df4ddba2acbf45dc1ab57 issuedAt=2026-10-10T01:52:23.436Z
