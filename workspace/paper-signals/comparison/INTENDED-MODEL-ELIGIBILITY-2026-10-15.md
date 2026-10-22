# Intended-model eligibility accounting — 2026-10-15

**Scope:** paper only. No brokerage. No model tuning, no gate changes, frozen
trial v2.1.5 untouched. Read-only audit: no vessel was written, no row was
re-scored, no input was backfilled.

**Gate applied:** `dossier_model_collector.check_frozen_eligibility` — the
frozen trial's eligibility rules BEFORE admission as a FRESH intended-model
evaluation:
1. issuance key binds a frozen intended model
   (`crypto-dossier-factor-agreement|2.0.0-measurement-contract` /
   `equity-factor-agreement|3.1.0-measurement-closure`);
2. decision instant at/after the frozen dossier cutoff
   **2026-10-14T18:35:00Z** (`dossier-cohort-v1/COLLECTION-CONFIG-v1.md` §1);
3. a v3 canonical decision-time input snapshot is linked (never reconstructed);
4. the frozen factor ledger is complete per RULE 3
   (`decision_time_store.ledger_completeness`: 11 crypto / 10 C-2 / 7 equity).

The deployed 7-factor result is carried only in the separately labeled
`deployed_seven_factor` evidence field — never substituted into the frozen
production/C-2 arms (population boundary rule 2).

## Result: 0 admitted FRESH, 21 in separate labeled cohorts

| Population | n | Admitted FRESH | Cohort / disposition | Reason |
|---|---|---|---|---|
| Dossier-path 2.0.0 issuances (signals 31–43) | 13 | 0 | `historical-reproduction` | all 13 decision_at < 2026-10-14T18:35:00Z (latest: id43 2026-10-14T13:00:21Z). 12 captured as model-evaluation evidence (re-labeled REPLAY/REPRODUCTION, see CAPTURE-CORRECTION-2026-10-15.md); id43 is the accepted REPLAY/REPRODUCTION demo + genuine-inputs replay |
| Discovery run 60 (deployed paper-pilot 7-factor stream) | 8 | 0 | `incompatible:incomplete-factor-ledger` — separate population, UNSCORED | deployed ledger carries 7 labels (Trend, Momentum, Volatility, Volume, Positioning / funding, Network fundamentals, Supply overhang); only "Momentum" overlaps the frozen 11. RULE 3 completeness fails for prod (10/11 missing) and C-2 (10/10 missing) on all 8. Never forced into the frozen models; never re-scored |
| Equity dossier-path issuances | 0 | 0 | — | equity workspace DB copy holds zero `signal_input_snapshots` rows; branch wired and ready |

**Eligibility accounting:** admitted 0 · rejected-as-historical 13 ·
rejected-as-incompatible 8. Zero rows entered any vessel (dossier captures
are model-evaluation evidence by design).

## Notes

- The ledger-completeness check on the 8 discovery rows used their ORIGINAL
  decision-time evidence (`factorLedgerJson` from
  `live-paper-status-2026-10-14T2340Z.json`, mapped verbatim name→label) —
  no backfill, no reconstruction. They stay UNSCORED per the never-backfill
  rule.
- Signals 31–42 were re-labeled from FRESH to REPLAY/REPRODUCTION on
  2026-10-15 (capture correction): their captures postdate the cutoff but
  their decisions predate it. See CAPTURE-CORRECTION-2026-10-15.md.
- The automatic scan (`collect_pilot_rows.py --dossier-capture` /
  `dossier_model_collector.py --scan`) currently finds 0 new issuances in
  the workspace DB copy (max signal id 43, 2026-10-14T13:00:21Z) — an honest
  zero, not a failure. The capture path is wired and proven by
  synthetic-but-labeled validation runs through the real code path
  (`tests/test_dossier_model_collector.py`: TestCutoffClassification,
  TestCaptureDecisionSeparation, TestDeployedSevenFactorField — 178/178 pass).
