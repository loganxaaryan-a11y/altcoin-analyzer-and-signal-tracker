# paper-pilot-v2.1.7 — admission pilot preparation (ACTIVATED 2026-10-26)

Status: APPROVED as a bounded prospective admission pilot (Logan,
2026-10-25), with amendments, and **ACTIVATED prospectively on
2026-10-26** under that approval once the repair build's preflight
passed (see the activation addendum at the end of this document). The
production freeze is now paper-pilot-v2.1.7, superseding v2.1.6, which
remains the rollback point and comparison arm. The sections below are
the original preparation record, preserved as written.

## The one change

Keep T1 and velocity discovery exactly as they are. Add ONE scoring
path alongside them: a supported Binance Spot asset present in the
catalog may enter full scoring. Everything downstream is unchanged:
venue gate first, production threshold ≥ 60 with ≤ 1 severe fail among
the first five dimensions, PAPER_MIN_SCORE floor, frozen levels and
entry contract, the 900,000 ms first-print receipt bound, the
15-minute entry window, monitoring requirements, challenger ≥ 45 never
gating issuance, prospective only, no backfill, MEXC research-only.

## "Supported" — precise definition (amendment 1)

An asset qualifies for the added path iff ALL of:

1. Canonical asset identity (CoinGecko id anchored, never ticker-only).
2. A verified Binance Spot instrument (non-empty pair) for that
   identity.
3. A working evidence path (venue trade history / first-print
   verification for the entry contract).
4. A working monitoring path (the position could be monitored and
   settled honestly after entry).

A mapping row with an EMPTY instrument does not qualify. The reported
HYPE row is the known case: it stays research-visible and does NOT
enter via this path.

Count discipline: the run-177 map showed 30 in-catalog Binance assets;
minus HYPE = **29 provisional**. That is NOT an acceptance target. Each
of the 29 must be verified per-asset (identity, instrument, evidence
path, monitoring path) before activation, and the verified count —
whatever it lands at — is the pilot universe. Assets with no catalog
row (iostoken, mon-protocol, osmosis, pha in the run-177 comparison)
do not enter; the lane never invents catalog membership. All MEXC
assets remain research-only.

Population labels (kept explicit, per Logan's reconciliation note):

- "2 mapped evaluated" = janction + verified-emeralds (both MEXC,
  production abstain) from the 50-asset supported universe.
- "All 9 evaluated abstained" = all run-177/134 candidates: those 2
  plus 7 unmapped venue-excluded (cap-4, irys, ore, moolah, yellow,
  dappos, acurast), all production abstain.

These are different populations and are never interchanged in reports.

## Freshness — explicit per input (amendment 2)

Before activation, every input to scoring for the added path must
record: source time, fetch time, and its applicable freshness rule.

- Reuse existing valid freshness checks where they exist (e.g. the
  market-freshness quote bounds, the history-cache freshness evaluator
  in `server/src/history-cache-freshness.ts`).
- Where no check exists, define and TEST a source-appropriate maximum
  age before activation.
- Weekly fundamentals and current prices must NOT share one cutoff.
- A snapshot belonging to the current run does not automatically make
  its contents fresh; freshness is proven per input, not inherited
  from the run.

Treatment of inputs:

- Stale or missing OPTIONAL factors: explicitly unavailable under the
  existing scoring treatment (contribution 0, never estimated).
- Missing REQUIRED price or level-construction inputs: the candidate
  does not qualify. No exceptions.
- No score normalization, no weight changes in this pilot.

## Work fit (amendment 3)

Before activation, measure the expanded set against the discovery
execution budget: runtime and provider calls for the added Binance set
vs the current run. Fetched data is reused; no asset is scored twice.
Incomplete processing must REPORT which assets were not evaluated —
it must never be indistinguishable from model abstention.

## Release separation (amendment 4)

Activation is gated on the issuance repairs, in this order:

1. Handoff-selection repair — DONE (previous build).
2. Starvation-prevention repair (unexpired-first, bounded expired
   dispositions, grouped coverage) — this build.
3. That repair's tests pass AND its natural-run processing proof
   lands (the next eligible natural handoff processed in-window; a
   legitimate model abstention counts as successful processing).
4. Per-asset verification of the provisional 29 completes.
5. Freshness rules (above) defined and tested for every input.
6. Budget verification (above) passes.

Only then does v2.1.7 activate as its OWN release, with its own freeze
record (superseding v2.1.6) and a rollback point to v2.1.6. The
admission change never rides along inside a bug-repair build.

## First-three-runs review

After activation, review the first three completed natural runs:
eligible assets, actually evaluated, unavailable inputs, production
decisions, runtime, and any resulting entries. Zero entries is
acceptable when the model genuinely evaluated and rejected the
candidates. Unexplained omissions are not acceptable.

## What this pilot does NOT claim

It tests broader evaluation and operational reliability. It does not
establish improved trading performance, and it is not guaranteed to
produce entries: on run-177 inputs every evaluated candidate abstained
on production. The supported-universe comparison behind the proposal
was incomplete (only 2 of 50 evaluated), so the version is not
described as already justified.

## Activation addendum (2026-10-26)

Preflight, as verified by the repair build before activation:

- Discovery certification normalizes the producer's "complete" to
  "completed" at the consumer boundary; unknown statuses stay
  unverified.
- Notification 621 is resolved as coverage-gap/expired-unissued,
  linked to run 191; the original event is preserved and no entry was
  fabricated.
- Live workload rehearsal (production scorer + provider adapters,
  production writes disabled, isolated cache): 22 evaluated / 6
  deferred in 28,903 ms total, 4 ms pure scoring, against the
  120,000 ms scoring budget; 57 external calls counted separately from
  28 stored reads; evidence loading counted inside the scoring scope.
- The paper-path freshness gate is unit-tested in isolation for
  missing, future, stale and boundary timestamps, with cache
  preservation (cache retention is not decision freshness).
- The misleading "Provider calls" label is renamed "Stored evidence
  reads" (typed RPC fields and stored reports unchanged).

Activated shape:

- Freeze: paper-pilot-v2.1.7 (own freeze record, supersedes v2.1.6;
  rollback = restore v2.1.6). Handler version unchanged.
- Universe: the verified, currently present Binance set — **28** in
  catalog at verification. BEAMX (beam-2) is NOT in the set: it was
  absent from the catalog, and 28 is a recorded count, not the
  provisional target of 29. The frozen list lives in
  `server/src/pilot-v217.ts` (PILOT_V217_BINANCE_UNIVERSE) and is
  recorded on every run (migration 0072:
  market_discovery_runs.admission_version / pilot_universe_json /
  pilot_lane_status). It does not change mid-review.
- Separate changes, explicitly not part of this admission set: the
  quant-network MEXC Spot mapping (its own versioned mapping change);
  grass was not mapped (identity unproven).
- Unchanged from v2.1.6: source-age rules, score threshold, severe-fail
  treatment, first-print selection, receipt deadline, drift bound,
  frozen-level validation. Nothing was altered to produce signals.
- First-three-runs review: the first three completed natural runs
  stamped paper-pilot-v2.1.7 are reviewed per PILOT_V217_REVIEW_PLAN
  (served live by getV217ActivationStatus): eligible, actually
  evaluated, explicitly deferred, unavailable inputs, production
  decisions, runtime, entries. Zero entries is acceptable when every
  admitted candidate was evaluated or explicitly deferred; unexplained
  omissions fail the review. First-entry enrollment and first
  settlement are post-activation checks, pending by name; no entry is
  manufactured and no expired window is reopened.
