# Original versus repaired Phase 2A

The original Phase 2A files are retained under `research/phase2a/original/`. Their timestamps and claims are not rewritten. The original frozen rule and no-selection outcome remain the historical result.

| Surface | Original | Repaired version |
|---|---|---|
| Strategy parameters | trend: SMA-200 + 20-bar return; breakout: 20-bar range + 1.5× median volume + SMA-200 | unchanged |
| Horizons | 5 and 30 elapsed UTC days | unchanged |
| Costs | 18/36 bps round trip | unchanged |
| Selection rule | sample gates + positive central-net + positive lower bound vs best matched directional baseline | unchanged |
| Missing expected endpoint | index-plus-horizon and contiguity rejection | exact expected UTC entry/exit lookup; missing endpoint is excluded, never shifted |
| Matched baseline fields | central-net values exposed without explicit basis labels | gross, central-net and stressed-net values exported separately; like-for-like differences |
| Uncertainty calendar | blocks built from emitted decision dates, with short tail counted | complete scheduled UTC-date grid; short tail excluded and disclosed |
| Holdout protection | command refused evaluation but pure engine accepted holdout-dated inputs for feature counts | engine rejects holdout-dated input before all feature/label/report work |
| Executable freeze | spec hash only | engine and embedded-spec hashes verified by CLI |
| Synthetic controls | absent | separate cohort/report; positive must pass, fixed-seed negatives report false qualifications |
| Result | no candidate selected | no candidate selected retained; repaired report is a new version, not an unseen confirmation |

The matched-SMA identity is expected: the two frozen hypotheses only emit long above SMA-200 and short below it. Equal directions, entries, exits and costs produce equal per-event returns. That sanity test passes, but it means the frozen success rule cannot identify timing value. No revised timing test has been executed.
