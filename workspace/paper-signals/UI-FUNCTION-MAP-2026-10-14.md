# UI/function map — crypto terminal paper surfaces (`altcoin-analyzer-and-signal-tracker`)

**Date:** 2026-10-14 · **Scope:** paper signals only. **MAP ONLY — no implementation, no build.**
The broad UI implementation is QUEUED until the live integration passes.

**Grounding:**
- Deployed action inventory verified live today via `artifact.list_actions` (94 actions; the paper actions `runpapersignalcycle` and `getpaperpilotstatus` are deployed).
- Labeling rules (binding): `pilot/delivery/LABELING-SPEC-2026-10-14.md`.
- Engine reality: `comparison/DOSSIER-VS-PAPER-ENGINE-2026-10-14.md`.
- Paper mechanics: `implementation-spec-2026-10-13.md` §1.2; alert contract: `pilot/delivery/ALERT-SCHEMA-2026-10-14.md`.
- Code-level action behavior: workspace source export `hidden_files/source-export-2026-10-13/crypto/server/src/actions.ts`
  (2026-10-13 copy — deployed parity of legacy action internals unverifiable from this seat; treat internals as best-available, not deployed proof).
- Deployed paper state today: `comparison/live-paper-status-2026-10-14T1744Z.json` (pre-deploy snapshot 18:05 UTC) +
  `DEPLOYED-REPAIR-VERIFICATION-2026-10-14.md` (build `c698a58b-c607-49d6-9297-bbdc1803405e` succeeded 18:44 UTC).

**Caveat (stated plainly):** nothing below is deployed UI. The labeling spec explicitly says the artifact's
tracker/alert feed rendering is post-freeze work and "not done here". Any UI surface named below is the
surface that *must* satisfy the spec once built.

---

## (1) Paper pipeline surfaces

### 1.1 `runpapersignalcycle` — paper issuance cycle

**What it does:** The deployed paper issuance action. Reads the latest `runMarketDiscovery` radar run's
candidates (consumed verbatim — never recomputed), runs each through the v2.1.9 handoff
(`processIntegratedCandidate`: expiry → vacuous min-score floor → 30-min freshness deferral →
retained short-regime gate → issuance veto → 24h duplicate suppression → qualification commit),
then observes entry on the venue feed (first post-decision Binance spot trade print inside the 15-min
window, drift ≤ 1.5%, first-print fidelity, history-coverage attestation, venue-trade-id identity),
then runs the decision→entry waiting-interval veto and post-entry invalidation check, then commits
the outcome atomically. Does NOT delegate to legacy `analyzeCoin` or `issueGeneratedSignalCandidate`.
**No brokerage, no fill — a pending contract never carries a fill.**

**What paper-relevant data it shows today:** Deployed record is 6 runs (ids 1–6), all `complete`,
all `0 candidates / 0 issued / 0 abstained / 0 deferred` — discovery runs 56/57/58 emitted 0 radar
candidates, so the paper gates evaluated nothing. Run 6 (`discoveryRunId=58`) summary:
*"No directional discovery candidate was available for the explicit paper path; no signal was manufactured."*
Run rows carry: id, runKey (`paper-pilot-v2.1.0:manual:5973301`), discoveryRunId, startedAt/completedAt,
status, counts, freezeVersion, trigger label, summary.

**Where the labels go:**
- Every run row header must read **PAPER** with the frozen strategy version (`paper-pilot-v2.1.0`,
  contract `actionable-entry-v1`, handler version once deployed — v2.1.9).
- The issuance counts (issued/abstained/deferred/failed) belong to the **prospective-paper population**
  only; they must never be rendered next to dossier tracker counts without cohort headers.
- **Trigger-label quirk (must be annotated):** deployed rows label cron-dispatched runs `"manual"`
  (the artifact labels `invoke_action` calls manual; only artifact-scheduler runs say `scheduled`).
  The surface must render this as `scheduled (cron-dispatched; artifact labels invoke_action calls "manual")`
  or the provenance story is wrong at a glance.

**What's missing for labels to be complete:**
- The deployed `getpaperpilotstatus` pre-deploy snapshot had **no issuance-handler version field** —
  the surface must show `paper-pilot-v2.1.0 / actionable-entry-v1 / handler v2.1.9` once the
  post-deploy snapshot is verified (build succeeded 18:44 UTC; worker snapshot pending).
- Run rows must never be mixed with dossier tracker rows in one denominator.
- Zero-issued runs must render as *"no signal manufactured — not an abstention"* (abstention is a
  recorded candidate decision, not an empty feed).

### 1.2 `getpaperpilotstatus` — the paper dashboard payload

**What it does:** The single status read for the paper pilot. Today's deployed payload exposes:
- `freeze`: version `paper-pilot-v2.1.0`, `frozenAt` 2026-10-14T04:54:12.629Z, freeze/production/challenger hashes.
- `runs`: the 6 deployed paper runs (all complete, 0/0/0/0).
- `candidates`, `signals`: empty today (`[]`).
- `alerts`: empty today (`[]`) — the **paper alert stream** (`SETUP_PENDING` / `ENTRY_CONFIRMED`), distinct from the user alert workspace (see 1.4).
- `delivery`: `configured: false`, `missingCapability: "No chosen alert destination or acknowledged delivery action is configured."`
- `segregation`: `legacyTable = "generated_signals"` (34 rows), `paperTable = "paper_signals"`, note: *"The paper action never writes generated_signals or signal_contracts."*
- `cohortRules`: prospective / retrospective / primary-economics / secondary comparison rules.
- `comparisons`: empty today.

**What paper-relevant data it shows today:** the frozen identity, the run history, the cohort rules,
and the segregation proof — all paper. The alert and signal arrays are empty on the deployed artifact;
the only issued paper contract on record is the workspace-local BTC long
`sig_53bb2a86d2e0fee1f3664812` (manual/demo path, 2026-10-14T02:50:15Z, kill-tested mid-hold, resumed,
entry observed on a real print, veto passed, alert delivered — the canonical PAPER example).

**Where the labels go (per the spec — required fields, every display, every alert):**
- Frozen strategy version: `paper-pilot-v2.1.0 / actionable-entry-v1 (+ handler vX.Y.Z)`.
- Contract ID: the `ct_…` id (and linked `sig_…` id).
- State: exactly one of **`awaiting entry` / `entered` / `expired` / `voided`** — voided carries its
  named reason (`void_expired`, `non-entry:first-print-unverifiable`, `non-entry:first-print-missed`,
  `void_no_quote`, …).
- Alert renderings open with `PAPER — SETUP PENDING` or `PAPER — ENTRY CONFIRMED` and must include:
  schema_version, signal_id, asset, direction, setup_reason, entry_rule, entry_price, invalidation
  {price, rule}, targets {t1, t2}, horizon, data_timestamp (venue time, never generation wall clock),
  issued_at, destinations, plus `entry_observed_at` / `venue_print_ts` / `waiting_interval_veto: "pass"` /
  `post_entry_check` on ENTRY_CONFIRMED only. A SETUP_PENDING must never carry entry-observed fields;
  an ENTRY_CONFIRMED must never be labeled pending anywhere.

**What's missing for labels to be complete:**
- Handler-version field absent from the pre-deploy payload — surface must show it post-verification.
- `delivery.configured: false` — the chosen destination (research side chat + terminal) lives only in the
  workspace `pilot/delivery/delivery-config.json`; it is not yet an artifact delivery capability.
  Until wired, every paper-alert surface must show delivery as unconfigured rather than implying delivery.
- No paper outcomes exist yet to render a paper track record (prospective file empty — prediction
  improvement not yet measured). The surface must show "collecting" rather than zeros that read as results.

### 1.3 `getsuppressedsignalcandidates` — suppression / abstention log

**What it does:** Reads `schema.suppressedSignalCandidates` (latest first, limit up to 500), returning
rows with parsed metadata + ISO timestamps. This table is **shared across paths**:
- Dossier-path rows carry `source: "dossier"` (e.g. born-dead suppression from `issueGeneratedSignalCandidate`).
- Paper-path rows are named `sup_<candidateId>_<gate>` with verbatim gate reasons:
  `min-score, stale-inputs, short-regime, issuance-veto, duplicate, expiry, entry-expired,
  waiting-interval-invalidation, entry-drift, entry-no-quote, first-print-missed,
  first-print-unverifiable, post-entry-invalidation`.

**What paper-relevant data it shows today:** per the v2.1.0 consolidation semantics, recorded
suppression = abstention (missing score alone ≠ abstention). Today the deployed paper path shows
0 abstentions on all 6 runs (empty candidate feed, not abstentions).

**Where the labels go:** every row must carry its path/cohort label — `DOSSIER (source: dossier)` or
`PAPER (gate: <reason>)`. The surface must expose the gate taxonomy as the paper population's
abstention ledger; terminal-only abstentions + compact daily chat summary per Logan's routing spec.

**What's missing for labels to be complete:**
- The action returns rows with no path label in the payload itself — the surface must derive it
  (`source` field / `sup_` prefix + gate name); nothing in the code marks rows as DOSSIER vs PAPER.
- Mixed-population totals are forbidden: dossier suppression and paper gate rows must never share
  one denominator; each population reports its own N.
- Named non-entries (the four contract void states) and gate rejections must not be conflated in one
  "rejected" bucket — the vocabulary differs on purpose.

### 1.4 `listalertsworkspace` + `addalert` — the user alert workspace (DOSSIER-side, NOT the paper stream)

**What they do:** `addalert` inserts a user monitoring alert (`alerts` table: coinId, symbol,
type ∈ {entry, funding, oi, whale, unlock}, threshold, wallet, enabled). `listalertsworkspace`
reads the `alerts` + `alertHits` tables (500 each, newest first) — the user's alert workspace UI.
These are **informational dossier-side monitors; none trigger issuance.**

**What paper-relevant data they show today:** none, and that is the point. Paper contract alerts
(`SETUP_PENDING` / `ENTRY_CONFIRMED`) do NOT flow through these actions — they are exposed via
`getpaperpilotstatus.data.alerts` and delivered by the `paper-signal-alert-delivery` worker
(enqueue → deliver → ack; dedup key `(signal_id, alert_type)`; abstentions terminal-only).

**Where the labels go:** the alert workspace surface must be headed **DOSSIER — monitoring alerts
(research context only)** and must carry the rule that **dossier rows are never emitted as alerts**:
a dossier signal surfacing in chat carries the DOSSIER label and the entry-verification field —
never a call to act. The paper alert stream (1.2) must be a visually and logically separate surface.

**What's missing for labels to be complete:**
- The name collision is the hazard: `listalertsworkspace`/`addalert` sound like they should carry
  paper alerts. UI copy must disambiguate permanently ("User alert workspace" vs "Paper alert stream").
- Paper alert rows must never be insertable through `addalert`'s entry/funding/oi/whale/unlock types —
  the paper stream is written only by the paper pipeline's alert commits.

---

## (2) Dossier surfaces

### 2.1 `getsignaltracker` — the dossier tracker

**What it does:** Reads `schema.generatedSignals` (latest 1000) + interim snapshots + daily briefs +
evaluation revisions + signal contracts. Returns: `signals` (paginated tracked rows), `stats`
(tracker stats including band reliability graded as *"dossier signal · authoritative 30D trade setup"*,
with the prospective-cohort filter `contractMatchesProspectiveCohort`), and `latestBrief`
(morning-brief reads). Read-only on issuance; writes no new issuance.

**What paper-relevant data it shows today:** the dossier cohort — 34 legacy/dossier tracked rows on
the deployed artifact (e.g. the 2026-10-14 09:00 ET longs BTC id43 @ 82,805, ETH id42 @ 2,479.76,
SUI id41 @ 1.032, all confidence 52, `entryRule: "first-post-decision-provider-quote"` — the frozen
CoinGecko-quote reference, **not an entry**). These three were issued through the dossier path only;
negative checks verified they never entered the paper pipeline (no radar candidate, no alert,
no pending contract, no venue-stamped print).

**Where the labels go (per the spec — required fields, every dossier display):**
- Label: **DOSSIER — research/setup**.
- Decision time: the frozen `createdAt` (UTC). Never "now", never refreshed.
- Horizon: 30 elapsed days; checkpoints d5 / d14 / d30.
- Evidence timestamp: the row's `sourceAsOf`.
- Actionable entry verified? **YES/NO** — YES only with a paper contract id and a venue-stamped
  entry print; otherwise NO, stated plainly.
- A dossier row must NOT render paper-path fields (no contract id, no awaiting/entered state) and
  must NOT be phrased as an entry ("entered at", "filled at") — the frozen price is a measurement
  reference.

**What's missing for labels to be complete:**
- The `actionable entry verified` field does not exist in `getSignalTracker` rows today — it must be
  computed (join to paper contracts by asset + overlapping window; no contract → NO) and displayed
  verbatim. This is the single most important missing label on the dossier surface.
- Cohort header must state the population explicitly and never pool with paper/fixtures/retrospective rows.
- The confidence score is a factor-agreement score, not a win probability — already in code strings;
  the surface must keep that caveat attached.

### 2.2 `getdossiertrackrecord` — dossier track record

**What it does:** Takes `coinId`; reads `generatedSignals` (2000) + evaluation revisions +
contracts; computes `authoritativeEvaluationObservations` and returns `{coin, system}` where each is
`{n, hitRate, averageR, wilsonLow, wilsonHigh, methodVersion, cohort}`, with the cohort string:
*"Current accepted 30 elapsed-day trade-setup revisions; positive net R after modeled 18 bps counts as a win."*

**What paper-relevant data it shows today:** this is the dossier-cohort track record — it reads only
`generatedSignals` (segregation intact: the paper action never writes this table). The 2026-10-13
signal-accuracy report derives from this population: combined first-touch 20.0% (12/60),
high-conviction shorts 0/10 — the baseline against the signal-accuracy verdict rule
("if new signals print ~40% or worse, the strategy itself is broken and gets rebuilt").

**Where the labels go:** header **DOSSIER — 30d elapsed-day trade-setup track record** with the
required DOSSIER row fields wherever individual signals are shown. System-wide hit rate and R must
carry N and the 95% interval (Wilson) — the code already computes them; the surface must not drop them.

**What's missing for labels to be complete:**
- The cohort string is generic — it must gain an explicit DOSSIER label plus the four required
  dossier fields (decision-time basis, horizon, evidence-timestamp basis, entry-verification status).
- The paper cohort has no track record yet (prospective file empty) — a separate **PAPER track
  record surface** is needed for later (frozen v2.1.x rules, 30d crypto closes, equity maturity
  = 30 XNYS sessions post-entry), and it must never reuse this action's rows or denominators.
- The spec's cohort discipline (separate N / hit rate / R per population; link overlapping
  asset/window records, never double-count) must be visible in the header, not implied.

### 2.3 `checkentry` — planned-entry timing check (DOSSIER-side; name collision hazard)

**What it does:** Takes symbol/direction/planned entryPrice/invalidation/target; scores *planned-entry
timing* on live CoinGecko 120d chart + 30d OHLC + OKX positioning + cross-venue derivatives +
news: crowding/cross-venue funding, dead-on-arrival validation (planned entry beyond stored
invalidation), entry gap vs spot vs ATR, RSI/volatility, funding/OI, open-signal alignment
(against the latest `generatedSignals` row), the hard 5:1 defined-risk gate, and event/news
proximity. Verdict: `good` / `caution` / `bad` ("GOOD TIMING · CAUTION · BAD TIMING"), explicitly
"a timing read, never a guarantee or probability". Feeds `logActualEntry` → `journalTrades`
with `setupType: "checkentry"` (the trading journal, scored by `getSelfTest` verdict buckets).

**What paper-relevant data it shows today:** none — this action is entirely dossier-path. Its
`latestSignal` lookups read the dossier tracker; its "entry" is a planned-entry sanity check,
not an observed entry.

**Where the labels go:** **DOSSIER — research/setup**; verdicts stay timing verdicts, never entries.
The surface must never place this action on the paper entry-status path.

**What's missing for labels to be complete:**
- A hard UI rule: **the paper entry-evidence gate (`checkEntryEvidenceComplete`, internal to the
  paper handler — venue trade id + observedAt + receivedAt + price) must never be rendered through,
  or confused with, the `checkentry` action.** The shared name is the highest confusion risk in the
  whole inventory; consider renaming in the UI layer only ("Timing check" vs "Entry evidence").
- `logActualEntry`/`closeActualEntry` journal trades are real-paper journaling of the dossier
  timing check, not paper contracts — the journal surface must keep that separation.

### 2.4 `verifysignalissuancecontrols` — issuance-control self-check (diagnostic)

**What it does:** Manual diagnostic, **not production issuance** (in-code issuance path:
`"verifySignalIssuanceControls → issueGeneratedSignalCandidate"`). Loads a real CoinGecko BTC
signal-day candle, feeds two function drafts through the dossier issuance path — a long whose
invalidation equals the day's low and a short whose invalidation equals the day's high — and
asserts both are **suppressed** with reasons starting `"born-dead LONG:"` / `"born-dead SHORT:"`,
and that neither lands in `generatedSignals`. Returns pass/fail per check (source grading-series,
long, short). The intent is a stop-market sanity check: never publish a setup already stopped out.

**What paper-relevant data it shows today:** proves the born-dead veto governs the dossier issuance
path; the paper path's analogous gates (issuance veto, waiting-interval veto, post-entry
invalidation) are proven separately in the workspace handoff/orchestrator tests.

**Where the labels go:** the surface must render this as **DIAGNOSTIC — issuance control proof
(dossier path)**, pass/fail checks, never as signals. Its suppression rows (named
`"Born-dead pipeline proof LONG/SHORT <day>"`, metadata `verificationRun: true`) must be
labeled diagnostic and excludable from any cohort.

**What's missing for labels to be complete:**
- The action's output carries no "diagnostic" marker in the response shape — the surface must
  derive it from the row naming/metadata (`verificationRun: true`).
- Guardrail needed: verification-run rows must never leak into `getSignalTracker` or
  `getDossierTrackRecord` denominators (today they are named distinctly; the UI must keep that filter).

---

## (3) Shared / measurement surfaces

### 3.1 `getmeasurementrun` — measurement-run reconciliation

**What it does:** Takes optional `runId` (default: latest); reads `measurementRuns` +
`measurementRunItems`; reconciles the frozen snapshot membership against graded rows and returns:
run meta (runId, status, cursor, batchSize, signalsInScope, expected/retrieved/eligibleDue/
evaluated/pending/ambiguous/unverified/excluded/failed/retryPending counts), the reconciliation
accounting (`accounted, balanced, identityBalanced, missingIds, unexpectedIds, duplicateIds,
ordinalViolations, equation`, open/settled/unknown trade counts), timestamps
(startedAt, evaluationCutoffAt, completedAt, lastSuccessfulCompleteAt), per-item grading
(signalId, legacySignalId, gradingState, gradingReason, tradeState, tradeStateReason, attemptCount,
evaluatedAt), and `measurementAcceptanceTrace()`.

**What paper-relevant data it shows today:** the measurement layer that must keep the populations
in separate vessels (dossier / prospective-paper / fixtures-replays / the 356-row retrospective
cohort: 10 crypto issued + 296 suppressed retrospective + 50 equity production-only). The
reconciliation equation (accounted/balanced/identityBalanced, missing/unexpected/duplicate ids)
is the anti-double-counting machinery.

**Where the labels go:** the surface must head every run with its **population membership**
(which cohort the frozen snapshot belongs to) and render the cohort-rules from
`getpaperpilotstatus.cohortRules` alongside: prospective = only rows whose discovery decision
occurred after the v2.1.0 executable freeze; retrospective = outside pilot statistics;
primary-economics denominator; secondary = both-issued paired comparison only.

**What's missing for labels to be complete:**
- The run payload does not carry an explicit cohort/population label on the frozen membership —
  the surface must attach it (DOSSIER cohort vs prospective-paper vs fixtures/replays vs
  retrospective) before rendering any counts.
- The reconciliation equation must be displayed verbatim (it's the proof nothing was silently
  promoted or double-counted); today it exists only in the API payload.
- No paper measurement rows exist yet (prospective file empty; crypto close 2027-01-30,
  equity maturity readout by 2027-02-24) — the surface must render "collecting", not zeros.

### 3.2 `getpaperpilotstatus.cohortRules / .comparisons / .segregation` — cohort-discipline block

**What it does (in the status payload):** carries the cohort rules, the (empty) comparisons array,
and the segregation proof (`legacyTable`/`paperTable`, 34 legacy rows, "the paper action never
writes generated_signals or signal_contracts").

**Where the labels go:** this block is the header material for *every* measurement surface:
performance cohorts stay separate (each population: own N, own hit rate, own R); overlapping
asset/window records are linked, never double-counted; no silent promotion (a dossier row entering
the paper cohort must be explicit, labeled `cross-population: dossier→paper`, with its own new
contract id and entry window — id reuse across populations is forbidden as an issuance mechanism).

**What's missing for labels to be complete:**
- No UI renders this block yet. The cross-population link UI (link dossier row ↔ paper contract
  by asset + window, count once per population) does not exist as a surface — only the collector
  applies the rule at collection time.

---

## QUEUED implementation checklist

Ordered. Nothing in the blocked group starts until the live integration passes.

**Ready (can be done now — spec/copy/design, no deployed dependency):**

1. [READY] This map (`UI-FUNCTION-MAP-2026-10-14.md`) — done; the single reference for the build.
2. [READY] Name-collision copy rules (finalize wording, no code): `checkentry` → UI "Timing check
   (dossier)" vs paper "Entry evidence"; `listalertsworkspace`/`addalert` → "User alert workspace
   (dossier)" vs "Paper alert stream"; `verifysignalissuancecontrols` → "Issuance-control diagnostic".
3. [READY] Label-block templates: the exact DOSSIER block (decision time · horizon 30d d5/d14/d30 ·
   evidence-as-of · actionable-entry-verified YES/NO) and PAPER block (frozen version · contract id ·
   state + named void reason) from `LABELING-SPEC-2026-10-14.md`, ready to hand to builders.
4. [READY] Derivation rule for `actionable entry verified` on dossier rows: YES iff a paper contract
   exists for the same asset in an overlapping window with a venue-stamped entry print; else NO
   stated plainly. Design is fixed; only the implementation is queued.
5. [READY] Paper track-record surface spec: frozen v2.1.x rules, 30d crypto closes (close 2027-01-30),
   equity 30 XNYS sessions post-entry (readout by 2027-02-24), separate N / hit rate / R with
   95% intervals per cohort, silence graded — mirrors the dossier surface, never shares its rows.

**Blocked on live integration (do not start):**

6. [BLOCKED] Terminal tracker surface renders DOSSIER labels on `getsignaltracker` rows (item 2.1),
   including the computed actionable-entry-verified field.
7. [BLOCKED] Paper pipeline surface: `getpaperpilotstatus` rendering — freeze version + handler
   version (pending post-deploy worker-snapshot verification), contract IDs, the four states with
   named void reasons, and the `data.alerts` paper alert stream (item 1.2).
8. [BLOCKED] Alert delivery wiring: `delivery.configured` → true with research-side-chat + terminal
   destinations; SETUP_PENDING / ENTRY_CONFIRMED renderings; deduped, delivered-on-ack; abstentions
   terminal-only + compact daily chat summary (Logan's routing spec).
9. [BLOCKED] Contract lifecycle view: per-contract awaiting entry → entered / expired / voided(+reason)
   transitions, driven by the deployed paper state (never by `checkentry`).
10. [BLOCKED] Suppression ledger surface (`getsuppressedsignalcandidates`) with per-row DOSSIER/PAPER
    labels and separate-population denominators.
11. [BLOCKED] User alert workspace surface with the DOSSIER-monitoring header and the
    never-emitted-as-alerts rule; paper stream kept visually and logically separate.
12. [BLOCKED] Dossier track-record surface (`getdossiertrackrecord`) with DOSSIER cohort header +
    N and Wilson intervals; the future paper track-record surface stays separate.
13. [BLOCKED] Measurement surface (`getmeasurementrun`) with per-run population labels and the
    reconciliation equation rendered verbatim; "collecting" until outcomes mature.
14. [BLOCKED] Issuance-control diagnostic surface with pass/fail rendering and the diagnostic-row
    exclusion filter (never in tracker/track-record denominators).
15. [BLOCKED] Cross-population link UI: link overlapping dossier/paper asset-window records,
    count once per population, explicit `cross-population: dossier→paper` labeling when used.

**Explicit non-goals (carried over):** no new alert type for dossier signals; no change to any
frozen contract, freeze version, or evaluator; C-2 stays shadow-only (no promotion through this path);
no brokerage anywhere — paper only.
