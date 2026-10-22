# Builder update since send-4 — 2026-10-21 (evening, EDT)

From Muse's own work tonight. PAPER ONLY. Detail docs live in the workstream folder (50, 51, 52) and the two amended files named below.

## 1. Production drift capture — DEMONSTRATED (closes send-4's open decision)
Diagnosis: the capture was the system's only bare fetch — single attempt, hard 5s abort, no retry, no User-Agent — while the route's healthy latency (Binance Vision aggTrades, 900s window) measures 1.6–4.2s. The cap sat inside the route's normal variance; run 141's total loss was a timeout artifact, not a venue or mechanism failure (run 143, identical code, succeeded 7/7 the same evening).
Bounded repair shipped (one function + call site): 8s per attempt, one retry on abort/timeout/429/5xx, 45s whole-block budget (unattempted candidates record `budget_exceeded`, never fetched), standard UA, additive diagnostics (`attempts`, `fetchStartedAt`). Worst case ≈53s only when the venue is already failing; typical cost unchanged.
**Production proof:** discovery run 144 (post-deploy, decisionAt 2026-10-21T23:25:34.176Z) — all 7 Binance-mapped candidates (ZEC, NEAR, PUMP, ZRO, COMP, CVX, ALT) persisted full captures, receipts **19.4–23.0s before the decision instant**, each with venueTradeId + responseHash. Fetch durations 3.1–4.2s — exactly the band the old cap killed. Live-capture accrual for the v3 scorer starts from run 144's population. Run-141 records and the 357/351 prints were not touched or relabeled.

## 2. Lease safety — verified, all four cases, no defect
Takeover while the older worker is still executing (stale completion writes nothing), stale release of a successor's lease (fenced on lane + ownerToken + generation), idempotent repeated completions, and empty-field acquisition (empty token / TTL 0, −5, NaN, +∞ all throw before any write, byte-identical state). Evidence: isolated harness 7/7 + existing suite 10/10 on current source. Production hashes unchanged. (Doc 51.)

## 3. NEW FINDING — settlements have no scheduled settler (needs a design call)
The 30-minute venue monitor observes touches and is explicitly barred from settling; every settlement record in outcomes.jsonl was appended by a discrete directed pass. Two settlements are DUE and unrecorded:
- Legacy BTC paper_00e4b771: clean target-1 touch, bar 2026-10-21T14:51Z, observed 15:10Z, contract (frozen v2.1.0) settles on target1-first with no waiting condition; gap-free coverage, no invalidation touch, ~2.6 days into its 30-day cap. Still formally OPEN, not counted as a win.
- PHA (run 111): target 1 bar 22:04Z, target 2 bar 22:06Z, no prior invalidation touch. Due since 22:04Z.
The observation half of the chain works; the append half exists only as a manual act. **Builder's recommendation: a small standing settlement pass under the frozen rules (append-only, same ambiguous/gap contract), so due settlements record on the monitor's cadence rather than on someone remembering to ask.** Awaiting Logan's/expert's call before building it — it changes what the system does unattended, so I did not fold it into the authorized repairs.

## 4. Equity timing — confirmed, one day behind by construction
Only scheduled pass for the fill-rule population: daily postmortem 06:46 ET. Thu 06:46 pass cannot fill (Thu bar doesn't exist yet; Wed's open precedes issuance). Thu fills at Thu's open are recorded by the **Fri 06:46 ET** pass, together with any Thu same-session first-touch settlement. Covered, ~14¾h after Thu's close; no evening pass exists and none was created. (Doc 52.)

## 5. Digest gating — research decoupled from issuance
Logan corrected my first fix (it made an issuance verdict the gate for research visibility). Amended to three states: source run unfinished → PROVISIONAL; run completed, issuance pending → research-visible, labeled "issuance assessment pending"; verdict present → qualification shown beside the research item. One named store limit: a run completed but never observed as latest by any digest build, absent from coverageGaps, with verdict-less rows, is indistinguishable from unfinished — its rows carry a distinct "completion not yet confirmed" provisional label that asserts neither state and re-classifies via carry-over. (Doc 50.)

## 6. Reporting corrections (files amended, history preserved)
- **Derived net R** added to the performance table: net = gross − (0.0018 × entry)/|entry − invalidation|, formula shown, labeled derived (reporting-layer, not a stored field), gross preserved. Resolved: BAT legacy +1.415, BTC legacy −1.313, BAT run-88 −1.076; totals gross −0.50R / derived net −0.974R over 3 resolved, 9 open.
- **Abstain sample relabeled** "initial retrospectively selected sample" (decisions 01:48–06:58Z predate the sampler's 18:06Z run). Outcome-blindness demonstrated by criterion construction (decision fields only; zero outcome records existed at sampling) and stated with its limit: blindness by construction corroborated by the empty ledger, not an independent audit of that execution. Reported as two unique assets / five episodes, with the caveat that two assets are not automatically two independent observations. Future additions follow the recorded rule prospectively.

## Questions for the expert
1. Item 3: standing settlement pass under frozen rules — sound, or do you want settlements to remain directed acts? If standing, is the monitor's 30-minute cadence the right trigger, or should settlement append only after a second confirming observation?
2. Item 1: does run 144's demonstration close the capture item, and should the v3 funnel's "live-capture class" start counting from run 144's population (my current treatment)?
3. Item 5's collapse case: acceptable labeling, or should the digest suppress verdict-less rows from unobserved runs entirely until completion is positively known?
