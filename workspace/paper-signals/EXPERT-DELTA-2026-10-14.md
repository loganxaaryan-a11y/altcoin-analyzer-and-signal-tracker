# Expert loop — status delta since last exchange (2026-10-14)

Only what's new since your last direction. Operational closeout omitted.

## 1. Direction diagnosis — paired result

On your "diagnose the direction model" thread: paired inverted-minus-original on the exact same IDs (n=42, both arms known):

- All: +0.429 hit-diff, **+1.071 R**
- Crypto: +0.588, **+1.471 R**
- Equity: +0.320, **+0.800 R**

Per-arm unresolved states exported across all 70 opportunities. Language corrected per your standard: "inversion outperformed in this small retrospective sample; persistence and cause remain unproven." The "selection/timing/construction ruled out" claims are withdrawn — zero post-stop recoveries don't test earlier entries or alternative stops.

Caveat we won't hide: 70 rows span 7 signal dates (36 on Oct 1). ~7 market draws, not 70.

`comparison/PAIRED-INVERSION-RETROSPECTIVE-2026-10-14.md`

## 2. Direction shadow A/B — frozen, collecting

Dual-arm shadow capture inside the dossier collector: both arms from the same decision instant, mirrored levels (identical stop/target prices can't serve opposite directions), one five-day endpoint, 18 bps roundtrip modeled. Collection 2026-10-15 → 2027-02-15, readout 2027-02-25. Three outcomes per arm (gross direction, net horizon return, barrier). Hypothetical shorts labeled; unknowns stay unknown.

Pre-registered read rule: ≥+0.25 R paired gap with block interval excluding zero → "warrants further testing." Success does not establish a permanent sign error and does not authorize live inversion.

Question for you: does this read rule satisfy your bar, or does it need tightening before February?

`comparison/dossier-cohort-v1/SHADOW-COMPARISON-PROTOCOL-v1.md`

## 3. Challenger A — built, v4 amended, open questions

Detector + shadow collector built from the reconciled spec; 126/126 regressions pass. Three amendments applied after your corrections: first-print identity preserved (stale → named non-entry), single 720h endpoint for barriers and time-exit, decision-week blocks replacing the perverse cluster rule.

Open questions logged in the spec for you:
- Spec C: θ defaults, guidance-takes-precedence vs abstain-on-multi-event, thin-expectation coverage acceptability
- Specs A/B: the pre-2026-10-01 warm-up exception — strike it for a harder line or keep?
- The two flagged discrepancies: spec worker's looser first-qualifiable dates vs the feasibility computation (tighter governs); feasibility's same-venue-bar-open entry recommendation vs v2's entry convention

`challengers/SPEC-A-CHART-SETUP-v3-2026-10-14.md`, `challengers/SPEC-A-CHART-SETUP-v4-AMENDMENT-2026-10-14.md`

## 4. Deployment — integration gate now exists

After the v2.1.9 deploy regressed row exposure, every future deploy passes a reusable gate: versioned row exposure, worker consumption, TEST through the real transport, callable evaluator on a fixture, legacy untouched. The TEST probe traversed the deployed transport with a real channel ack (enqueue→ack 17m28s). BAT wired (delisting-risk flagged), unfired.

No action needed — informational.

## Decisions that remain Logan's (not yours)

H-2 and the direction-model rebuild under his 40% rule. Noting so you don't spend time on them.
