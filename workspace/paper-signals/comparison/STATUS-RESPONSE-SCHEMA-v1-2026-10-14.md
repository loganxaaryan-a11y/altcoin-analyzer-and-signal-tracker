# getpaperpilotstatus response schema — versioned spec v1 — 2026-10-14

Paper only. No brokerage. This spec governs the SHAPE of the deployed
`getpaperpilotstatus` response on `altcoin-analyzer-and-signal-tracker` — the
contract between the producer (deployed artifact) and its two consumers (the
`paper-signal-alert-delivery` worker and the comparison collector's
`live_paper_stream.py` adapter).

## 0. Why this spec exists (evidence)

On 2026-10-14 the deployed response had NO version field (`schema_version`
absent in every captured payload) and several SHAPE hazards were observed
across the day's snapshots:

- `runs` appeared as an ARRAY of run records in current snapshots but as a
  bare INT count (`"runs": 6`) in the 17:03 UTC snapshot (pre-rebuild
  deployed code — superseded, but proof the shape has changed before).
- `candidates` was present in some snapshots (16:31, 17:52, 18:05, 18:35,
  19:16 UTC) and ABSENT in others (17:03, 19:31 UTC).
- `comparisons` was present in some snapshots, absent in others.
- `checkpoints`, `handoff`, `handoffRuns` appeared in NO saved snapshot;
  the coordinator's live call ~19:32 UTC reported them present
  (`checkpoints:[]`, `handoff:null`, `handoffRuns:[]`).
- All row arrays have been EMPTY in every observation to date; row SHAPES
  remain unproven on the deployed side.

(Envelope note, corrected: the artifact platform wraps every action result
in `{ok, data}` — that part is stable. The 17:30 UTC `status`-keyed and
18:57 UTC `summary` snapshots were worker-generated snapshot formats saved
next to the raw captures, not endpoint envelopes. The raw endpoint payload
is the action's return object under the platform's `data` key.)

A consumer that treats "array absent" as "no alerts/candidates/signals" will
silently misread a malformed response as a quiet pipeline. §5 makes that
impossible by construction.

## 1. schema_version (REQUIRED, top level)

The response MUST carry a top-level `schema_version` string identifying this
document's schema. Until the producer adds it, every consumer treats the
response as **unversioned** and applies the strict parser (§5) against the
v1 field set below.

- Current value: `"paper-status/1"` (this spec).
- The value is a plain string, compared exactly (`==`). No semver
  interpretation, no prefix matching: an unknown `schema_version` is a schema
  error, not a best-effort parse.
- The schema changelog (§7) is the append-only record of every change.
  Bumping the version REQUIRES a changelog entry; a changelog entry without a
  version bump is not permitted.

Producer action (deployed artifact): add `"schema_version": "paper-status/1"`
to the `getpaperpilotstatus` response. See the execution plan in
`pilot/delivery/TEST-PATH-DESIGN-2026-10-14.md` §E for the exact edit spec.

## 2. Envelope (one canonical form)

Canonical envelope (artifact platform + action return):

```json
{
  "ok": true,
  "schema_version": "paper-status/1",
  "data": {
    "handler_version": "2.1.9",
    "alerts": [], "candidates": [], "checkpoints": [],
    "signals": [], "comparisons": [],
    "handoff": null, "handoffRuns": [],
    "runs": [],
    "freeze": {}, "handler": {},
    "segregation": {}, "delivery": {}, "cohortRules": {}
  }
}
```

Rules:

- The artifact platform wraps the action result as `{ok, data}` — the
  action's return object lives under `data`. Consumers parse
  `raw.data.<array>`. (The `schema_version` is carried at the top level of
  the platform envelope AND mirrored inside `data` during transition; the
  parser tolerates either location, §5.)
- Worker-generated summaries (counts, `fetched_at_utc`, `summary`) are a
  DIFFERENT document: they MUST be labeled `"kind": "worker-summary"` and
  MUST NEVER be saved where a raw response is expected
  (`worker-runs/status-<ts>.json` holds raw responses only). A summary is
  never a substitute for the raw payload.
- `runs` is ALWAYS an array of run records, never a bare count. A bare int
  is a schema error.
- JSON types are strict: an array field carrying `null` or an object is a
  schema error, not an empty array.

## 3. Required top-level arrays (always present, always arrays)

These keys MUST be present in `data` on every response. Presence of the key
with an empty array is a truthful "nothing to report" ONLY when the pipeline
genuinely has nothing (e.g. 0 candidates across completed runs).

| Key | Type | Null allowed? | Meaning when empty |
|---|---|---|---|
| `alerts` | array | NO | no alert rows durably enqueued |
| `candidates` | array | NO | no paper candidates in the reporting window |
| `checkpoints` | array | NO | no entry-observation recovery checkpoints persisted |
| `signals` | array | NO | no issued paper signals in the reporting window |
| `comparisons` | array | NO | no comparison rows ready for readout |
| `handoff` | object | YES (null) | no handoff run consumed in the reporting window |
| `handoffRuns` | array | NO | no recent handoff runs |
| `runs` | array | NO | no `runpapersignalcycle` executions recorded |

`freeze`, `handler`, `segregation`, `delivery`, `cohortRules` are required
objects carrying the freeze identity, handler version/provenance, table
segregation, delivery capability declaration, and cohort rules. They are
metadata, not row evidence; their absence is a schema error but does not
imply "no alerts".

## 4. Row shapes — the full evidence fields each row type MUST carry

Row shapes below are inferred from the sandbox source the deployed build
matches hash-for-hash (DEPLOYED-REPAIR-VERIFICATION-2026-10-14.md):
`orchestrator/src/issuance/handler.ts` (+ `entry-v1/`, `veto/`), and
`handoff/src/*.ts`. All row arrays have been empty on the deployed side, so
these shapes are the SANDBOX-PROVEN contract the deployed serializer must
honor — a deployed row missing a REQUIRED field is a schema error on that
row (the row is rejected with its id named; the rest of the response still
parses — see §5).

Field-name tolerance: the collector adapter tolerates camelCase persisted
names and snake_case serializer aliases (`live_paper_stream._pick`). The
REQUIREMENT is semantic presence, not spelling; a row carrying neither
spelling of a required field is incomplete.

### 4a. candidates[] — paper candidates (delivery + collection evidence)

One row per paper candidate evaluated by the issuance path (qualified,
awaiting-entry, issued, suppressed, rejected, expired, invalidated,
deferred). Source: `orchestrator/src/types.ts` CandidateRecord +
handoff outcome linkage.

REQUIRED per row:

- Identity/linkage: `candidateId` (deterministic content-hash identity),
  `candidateKey` (handoff identity: sha256 of runId+symbol+coinId+
  direction+signalDate+detectedAt), `symbol`, `coinId`/`asset_id` (nullable),
  `direction` ("long"|"short"), `terminal` ("crypto"), `signalDate`,
  `detectedAt`, `discoveryRunId` (the handoff discovery run that produced
  it — the discovery-run linkage), `runId` of the paper cycle that
  evaluated it.
- Factor ledger: `factors`/`factor_ledger` — the COMPLETE decision-time
  factor ledger (array of {label, score, weight, contribution}) or explicit
  null (absent ⇒ cannot qualify; recorded as failed, never fabricated).
  `totalWeight`, `factors_asof`/`asOf`.
- Per-candidate reason codes: `status` (pending|deferred|awaiting-entry|
  issued|rejected|expired|invalidated|entry-expired), `outcome` object
  {kind, gate, reason, via, detail} — the recorded reason code per gate
  (suppression rows: id `sup_<candidateId>_<gate>` linkage), `gateSummary`.
- Contract linkage: `contractId` (`ct_<candidateId>`, null until the veto
  passes and the contract is built), `issuedSignalId` (null until issued).
- Alert timestamps: `setupAlertAt` (ISO, qualification instant),
  `entryObservedAt` (ISO, null unless entered), `alertedAt`.
- Levels: `entryPrice`, `invalidation`, `target1`, `target2` (decision-time
  frozen levels).
- Handoff outcome (when the candidate came through the handoff):
  `handoffOutcome` {outcome: qualified|abstained|deferred|failed,
  reasonCode, reason, gate, ledgerHash, recordedAt}.

### 4b. signals[] — issued paper signals / contracts (collection evidence)

One row per issued paper signal, carrying the frozen contract and the
entry-observation evidence chain. Source: `orchestrator/src/types.ts`
IssuedSignal/StoredSignal + `handler.ts` contract/checkpoint shapes +
`entry-v1/src/contract.ts` + `entry-v1/src/feed.ts`.

REQUIRED per row:

- Identity: `signalId` (`sig_<identityHash24>`), `candidateId`,
  `identityHash`, `contractId`, `terminal`, `symbol`, `direction`,
  `signalDate`, `decision_at`/`decisionAt`, `issued_at`/`issuedAt`.
- Contract (frozen, `contractVersion: "actionable-entry-v1"`): `strategyId`,
  `strategyVersion`, `parameterHash`, `decisionClock`, `decisionPrice`,
  `sourceObservedAt`, `entryRule`, `entryVenue`, `entryWindowOpensAt`,
  `entryWindowExpiresAt`, `driftCapPct`, `horizonUnit`, `primaryHorizon`,
  `issuedBy`, `issuedAt`, `cohortId`, frozen levels (invalidation/targets/
  riskPerUnit), `entryState` (pending|entered|void_*), `voidReason`.
- Venue trade evidence (the v2.1.9 identity chain — NEVER synthesized):
  `venueTradeId` (the REAL venue-assigned id, verbatim from the feed),
  `venueSeq` (venue's monotonic ordering field), `entryObservedAt`
  (observation time = venue print ts), `entryReceivedAt` (receipt time),
  `entryPrice` (observed print price). First-print identity: the alerted
  entry's `venueTradeId` + ts MUST match the checkpoint's first-print.
- Recovery checkpoint: `observationCheckpoint` {v, `highWaterTs` (highest
  durably-observed print ts), `firstPrint` {venueTradeId, ts, price, venue,
  venueSeq} | null, `lastReceiptAt`, `polls`, `coverageEvidence`}.
- History-coverage evidence: `coverageEvidence`/`historyCoverage` bound to
  the served response {venue, symbol, requested sinceTs→toTs, receipt
  timestamp, raw-response hash, pagination/completeness limits} — the
  handler's proof it CHECKED coverage (adapter-established, not
  venue-attested).
- Gate/qualification evidence: `vetoSummary`, outcome `detail` {checks,
  waitingInterval {verdict, reason, checks}, postEntry…}, `gateSummary`.
- `state`: the candidate/contract state at report time (qualified →
  awaiting-entry → entered | expired | invalidated) — collection's
  issuance-outcome ground truth.

### 4c. checkpoints[] — entry-observation recovery checkpoints

One row per contract with a persisted observation checkpoint (entered,
pending, and voided contracts all carry it). REQUIRED per row:
`contractId`, `candidateId`, `signalId`, `highWaterTs`,
`firstPrint` {venueTradeId, ts, price, venue, venueSeq} | null,
`lastReceiptAt`, `polls`, `coverageEvidence` (response-bound, see §4b),
`checkpointVersion` (1). This array lets a resumed run — and the collector —
verify exactly which coverage its predecessors proved.

### 4d. alerts[] — alert rows (delivery evidence)

One row per enqueued alert (setup + entry), read from the deployed
`paper_alert_events` table. The chat-facing RENDERING of an alert
additionally satisfies `pilot/delivery/ALERT-SCHEMA-2026-10-14.md` /
`alert-schema.json` (schema_version "2026-10-14", paper:true, label PAPER,
test flag, type-specific required fields); the rendering fields live in the
row's `payloadJson`. The DEPLOYED ROW (what the endpoint exposes for the
worker to render) carries the table columns (timestamps ISO-stringified by
the serializer):

REQUIRED per row:

- `id` (integer PK), `eventKey` (unique — the dedup-adjacent key),
  `paperSignalId` (links to the paper signal; the ALERT-SCHEMA `signal_id`
  lives in `payloadJson`).
- `payloadJson` — the full ALERT-SCHEMA payload (string or parsed object):
  schema_version, paper, label, alert_type, signal_id, asset, direction,
  setup_reason, entry_rule, entry_price, invalidation {price, rule},
  targets {t1, t2}, horizon, data_timestamp (venue time, never
  alert-generation wall clock), issued_at, destinations, `test` (boolean —
  REQUIRED; true ONLY for labeled test notifications), plus the
  type-specific fields (SETUP_PENDING: status pending, observation_window,
  qualification_evidence; ENTRY_CONFIRMED: status confirmed,
  entry_observed_at, venue_print_ts, waiting_interval_veto=pass,
  post_entry_check).
- `status` ("enqueued"|"delivered"|"simulated_ack"|"failed"|
  "unconfigured"), `transport`, `destinationLabel`.
- `enqueuedAt` (the instant the row was written — enqueue),
  `acknowledgedAt` (null until acknowledged — the two are distinct
  timestamps by construction), `attemptCount`, `lastError` (nullable),
  `createdAt`, `updatedAt`.

The worker renders from `payloadJson` and reconciles delivery from
`status`/`acknowledgedAt`/`attemptCount`; it MUST NOT invent fields the
row does not carry.

### 4e. handoff / handoffRuns[] — discovery→paper handoff evidence

`handoff` (object|null): the most recent handoff run report —
`HandoffRunReport` (`handoff/src/qualify.ts`): `runId`, `source`,
`completedAt`, `freezeVersion`, `counts` {qualified, abstained, deferred,
failed}, per-candidate `CandidateResult` {candidateKey, symbol, direction,
outcome, reasonCode, reason}, `staleRun` flag. Null when no handoff run was
consumed in the reporting window.

`handoffRuns[]`: recent handoff run summaries (same shape, compact):
`runId`, `source`, `completedAt`, `freezeVersion`, `demo` flag, counts,
candidate outcomes with reason codes. Lets the collector verify the
discovery→paper linkage per discovery run (discoveryRunIds 56/57/58 seen
on runs 1–6).

### 4f. comparisons[] — comparison rows for readout

Comparison-series rows (per VERSION-MAPPING-2026-10-14.md comparison
series) pairing production vs challenger dispositions per candidate:
`candidateId`, `applicable_freeze`, `prod_disposition`, `c2_disposition`,
`prod_direction`, `c2_direction`, decision-time verification flags. Empty
until the readout path produces them; never synthesized by the endpoint.

### 4g. runs[] — runpapersignalcycle execution records

One record per executed paper cycle. REQUIRED per record: `id`, `runKey`,
`trigger` ("manual"|"automatic"|…), `status` ("complete"|…), `createdAt`,
`startedAt`, `completedAt`, `freezeVersion`, `freezeHash`,
`discoveryRunId`, `candidateCount`, `issuedCount`, `abstainedCount`,
`deferredCount`, `summary` (human sentence; "no signal was manufactured"
when 0). ALWAYS an array — never a bare count.

## 5. Consumer-side STRICT parser rule (binding on both consumers)

This rule is binding on the alert-delivery worker and on
`live_paper_stream.py` / `collect_pilot_rows.py`. It exists because a
missing array is AMBIGUOUS: it can mean "nothing to report" or "the
producer dropped the rows". The parser MUST NOT guess.

```
parse_status(raw):
  1. ENVELOPE: raw must be an object with ok == true and a "data" object.
     Otherwise → SCHEMA ERROR (not "no alerts").
  2. VERSION: read data.schema_version (tolerate top-level schema_version
     during transition). If absent → proceed as UNVERSIONED against this
     v1 field set, and FLAG "unversioned-response" in the run/collection
     log (visible, never silent). If present and != "paper-status/1" →
     SCHEMA ERROR (unknown version; never best-effort parse).
  3. REQUIRED ARRAYS: for each of alerts, candidates, checkpoints, signals,
     comparisons, handoffRuns, runs:
       - key ABSENT → SCHEMA ERROR naming the key. NEVER treat as empty.
       - value is null or not an array → SCHEMA ERROR naming the key and
         the actual type. NEVER coerce null → [].
       - key present and an array (possibly empty) → OK; empty means
         "nothing to report" for that row type.
     handoff: must be present; null or object. Absent or any other type →
     SCHEMA ERROR.
  4. ROW VALIDATION: each row is validated against §4's required fields.
     A row missing a REQUIRED field → ROW ERROR naming row id + field.
     Row errors REJECT THE ROW, never the response: the rest of the
     response still parses; the rejected row is logged with its id.
     (Delivery: an unrenderable alert row becomes a one-line blocker per
     WORKER-SPEC-v2.2 §6 — never partial, never invented.)
  5. RUNS SHAPE: runs must be an array of objects. A bare int (the 17:03
     UTC anomaly) → SCHEMA ERROR.
  6. On ANY schema error: the consumer STAYS SILENT toward the user for
     that poll cycle except for ONE operator-visible line naming the
     failing key(s) (worker run log / collector stderr). It MUST NOT emit
     alerts, MUST NOT append collection rows, and MUST NOT record "0
     alerts" as a measurement. The error is retried on the next cycle;
     three consecutive schema errors escalate to the daily summary.
```

Corollaries (already true in the worker spec, restated as parser law):

- The collector's `data.get("signals") or []` pattern is FORBIDDEN under
  this rule: it must become an explicit presence check that raises on
  absence (see the regression for the patched adapter behavior).
- The worker's §6 "for each row in data.alerts" MUST be preceded by the
  §5 presence check: no `alerts` key → schema error, not "nothing due".
- An empty array is a legitimate quiet cycle (all arrays have been empty
  since the pilot began — 6 completed runs, 0 candidates each). A missing
  array is never a quiet cycle.

## 6. Test rows and quarantine (parser-level)

- Alert rows with `test: true` are TEST rows. The worker's normal delivery
  path skips them (WORKER-SPEC-v2.2 §6); the supported test path is defined
  in `pilot/delivery/TEST-PATH-DESIGN-2026-10-14.md`.
- The collector MUST refuse test rows: any candidate derived from a row
  with `test: true` (or `row_origin != "pilot"`) raises QuarantineError and
  NOTHING is written. Test rows never enter any cohort, prospective or
  retrospective.
- The parser validates test rows against the SAME row shape (§4d) — a
  malformed test row is still a row error, not a silent skip.

## 7. Schema changelog (append-only)

| schema_version | date | change |
|---|---|---|
| paper-status/1 | 2026-10-14 | Initial versioned spec. Requires: `schema_version` top-level; canonical platform `{ok, data}` envelope with the action's return object under `data`; required arrays (alerts, candidates, checkpoints, signals, comparisons, handoffRuns, runs) always present as arrays; `handoff` object\|null always present; `runs` always an array of records; §4 row evidence fields per row type (§4d grounded on the deployed `paper_alert_events` table shape: eventKey/payloadJson/acknowledgedAt/attemptCount); §5 strict-parser rule (missing array → explicit schema error); §6 test-row quarantine. Documents observed pre-v1 shape hazards (runs-as-int on pre-rebuild code, intermittent array presence) as schema errors under v1. |

## 8. Status of this spec

- SPEC-ONLY on 2026-10-14: no deployed change made by this seat (no
  artifact.* at this depth). Producer action (add `schema_version`,
  stabilize the envelope, guarantee array presence) is specified for the
  coordinator in `pilot/delivery/TEST-PATH-DESIGN-2026-10-14.md` §E.
- Until the producer adds `schema_version`, consumers apply §5 as
  UNVERSIONED with the "unversioned-response" flag — the strictness does
  not wait for the version field.
