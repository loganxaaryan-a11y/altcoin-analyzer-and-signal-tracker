---
id: equity-alert-drain
title: Equity alert drain → research side chat
enabled: false
owner: goal:research-terminal
mode: task
schedule:
  kind: interval
  timezone: America/Toronto
  at: 2026-10-15T22:12:10
  every: 15m
timeout_secs: 600
delivery:
  - chat_id: 7b75e732-f527-4d53-b40d-4aa036201d9b
metadata:
  tags: [cron:automatic-interval-anchor]
  originating_chat_context_json: '{"chat_id":"a685c3e7-c8be-4137-8900-4e899008bca7","origin_provider":"main","chat_kind":"direct","event_kind":"message","require_mention":false,"device_id":"d8c63a1c-801b-497b-a9fe-cd2681d2185d"}'
  presentation_locale: en-US
---
## Equity alert drain → research side chat (every 15 min)

Forwards qualifying rows from the equity terminal's alert feed to the research side
chat as labeled **watch alerts**. These are informational only — never confirmed
entries, never orders, never signals.

Kinds forwarded: `Entry zone`, `Radar 90+ short`, `Radar 90+ long`.
Kinds excluded: Form 4, Earnings, Volume spike, Gem, and anything else (counted, not sent).

Receipt schema: ~/workspace/goals/research-terminal/hidden_files/receipt-provenance/RECEIPT-SCHEMA.md.
Design notes: ~/workspace/goals/research-terminal/hidden_files/equity-alert-drain/README.md.
Delivery-status contract (for the equity homepage): ~/workspace/goals/research-terminal/hidden_files/equity-alert-drain/DELIVERY-STATUS-CONTRACT.md.

### Paths
- State: ~/workspace/goals/research-terminal/hidden_files/equity-alert-drain/state.json
  (`watermark_observed_at` ISO UTC, `dedup` map, `updated_at_utc`)
- Delivery status projection: ~/workspace/goals/research-terminal/hidden_files/equity-alert-drain/delivery-status.json
  (dedup key → status ∈ {queued, channel-acknowledged, failed, unknown} → status timestamp → ack evidence; rewritten every run)
- Run logs: ~/workspace/goals/research-terminal/hidden_files/equity-alert-drain/drain-runs/
  (write run-<UTC-ts>.json each run; keep last 20)
- Intraday quote fetcher: ~/workspace/goals/research-terminal/hidden_files/equity-alert-drain/intraday_quotes.py
  (Finnhub-backed, returns market-event timestamps; replaces checkentry for activation decisions)

### 0. Start
Note your start time (UTC) first. All file work (state, delivery-status, run log)
MUST be finished before you emit your final message. NEVER write files after
producing output.

### 1. Reconcile prior pending deliveries (ack check)
For each dedup key in state.json with status `awaiting-ack`:
- The expected delivery key was recorded at pre-commit (§7 step 2):
  `cron-delivery:equity-alert-drain:<run_id>:side_chat:7b75e732-f527-4d53-b40d-4aa036201d9b`.
  Query the outbox: `SELECT state, delivered_at_utc FROM scheduler.delivery_outbox
  WHERE delivery_key = <that key>` (via muse.db). If the recorded key is absent,
  fall back to the run lookup: `SELECT run_id, scheduled_for_utc FROM
  scheduler.job_runs WHERE job_id='equity-alert-drain' AND scheduled_for_utc <=
  <run_ts_utc> ORDER BY scheduled_for_utc DESC LIMIT 1`, then the outbox query above.
- `state='delivered'` AND `delivered_at_utc` NOT NULL → mark the key `delivered`,
  record `ack_at_utc`. This real channel ack is the ONLY thing that earns `delivered`.
- Outbox row exists but is neither delivered nor failed → mark `unknown`, record
  the delivery key as the message ID, surface one line naming the dedup key
  (`delivery unknown — operator review`). Never auto-retry it.
- No outbox row and the run is older than one full interval (15 min) → delivery
  cannot be confirmed: mark `unknown` (NEVER auto-resend), record the expected
  delivery key as the message ID, surface one line naming the dedup key
  (`delivery unconfirmed — operator review`). An acknowledgement delay must NEVER
  trigger an automatic resend. UNKNOWN is preserved until operator review — never silently retried.
- Run less than one interval old with no decisive state → keep `awaiting-ack`.
- After updating state.json, rewrite delivery-status.json as the projection:
  for every dedup key ever notified, emit
  `{status, status_at_utc, ack_evidence: {delivery_key, delivered_at_utc}, alert: {symbol, kind, message, observed_at_utc}}`
  with the status mapping: awaiting-ack→`queued`,
  delivered→`channel-acknowledged`, failed→`failed`, unknown→`unknown`.
  Atomic tmp+rename. This file is what the equity homepage renders.

### 1b. Mirror terminal delivery states to the artifact outbox
For each dedup key whose status transitioned in §1 this run, invoke
`recordAlertDeliveryState` on the `equity-analyzer-and-signal-tracker` artifact
(via artifact.invoke_action) with:
`{dedup_key: <key>, symbol: <key's first |-segment>, kind: <key's second |-segment>,
stage: 'watch_alert', state: <delivered|failed>, channel: 'side_chat',
delivered_at: <ack_at_utc ISO, when delivered>, error: <reason text, when failed>}`.
For `state: 'queued'` (new sends, §7 step 2): pass `delivered_at: null, error: null`
explicitly — the action schema requires both keys; never invent a delivery timestamp.
- For keys marked `unknown`: make NO artifact write (the action's state enum has no
  unknown) — delivery-status.json remains the badge source for unknown.
- If an action call fails: log it in the run log (`outbox_write_failed` + key) and
  continue; the next run retries the write for keys whose artifact state is stale.
- Count successful writes as `outbox_writes` in the run log.

### 2. Fetch
Invoke `listalerts` on the `equity-analyzer-and-signal-tracker` artifact (default
args, via artifact.invoke_action). On failure: write the run log with
`status_fetch_failed` + error text, stay silent (no chat-facing output), end.
Never deliver from anything but this run's read.

### 3. Filter + parse
For each row in `data.alerts`:
- Keep only kind in {`Entry zone`, `Radar 90+ short`, `Radar 90+ long`}. Count the
  rest as `excluded_by_kind` (per kind).
- Parse the rule signature from `message`:
  - Entry zone: `Price <p> is within 1% of the tracked <long|short> entry <e>`
    → signature `<long|short>@<e>`
  - Radar 90+: `<±N> five-dimension agreement · <SHORT|LONG> · <conf> confidence · invalidation <i>`
    → signature `<±N>|<SHORT|LONG>|<conf>|inv<i>`
  - Parse failure → signature = the raw message text, note `parse_fallback: true`.
- Dedup key: `<SYMBOL>|<kind>|<signature>` (symbol uppercased).

### 4. Watermark + fresh vs catch-up
- Read state.json. If absent (first run): initialize
  `{watermark_observed_at: <now UTC ISO>, dedup: {}, updated_at_utc: <now>}`
  (atomic tmp+rename). All rows below are then catch-up candidates.
- Fresh: `createdAt > watermark_observed_at`.
- Catch-up candidates: `createdAt <= watermark_observed_at` AND
  `createdAt >= watermark_observed_at − 72h`. Older → `stale_skipped` (count only).
- Advance `watermark_observed_at` to max(previous, newest createdAt seen this run).

### 5. Dedup + condition transitions (activations)
Group the fresh/catch-up rows by dedup key first. For each key, the representative
row is the one with the NEWEST createdAt (largest id) — the notification always
cites the latest observation of that condition, never an older repeat.

Each dedup key carries an ACTIVATION record in state.json:
`{activation_id, condition_state, last_observed_at_utc, last_observation}`.
Repeated observations within one activation are suppressed; a new activation gets
its own event ID and IS notified. There is NO arbitrary daily or time-based reset.

**QUOTE SOURCE FOR ACTIVATION DECISIONS (2026-10-16):**
Use `~/workspace/goals/research-terminal/hidden_files/equity-alert-drain/intraday_quotes.py`
via `python3 intraday_quotes.py <SYMBOL>` for ALL activation-decision price observations.
This script uses Finnhub and returns:
- `price`: current price
- `market_event_time_utc`: when the market produced this quote (ISO UTC)
- `retrieval_time_utc`: when we fetched it (ISO UTC)
- `age_seconds`: retrieval - market_event
- `session`: pre/regular/post/closed (ET)
- `is_fresh`: True only if age < 300s during regular session, < 900s during pre/post
- `source`: "finnhub"

**FRESHNESS REQUIREMENTS (all must hold for a valid observation):**
1. `symbol` matches the alert's symbol exactly (correct instrument)
2. `market_event_time_utc` is present and parseable (not null)
3. `retrieval_time_utc` is present and parseable (not null)
4. `session` is "regular", "pre", or "post" (not "closed")
5. `is_fresh` is True
6. `age_seconds` < 300 during regular, < 900 during pre/post (explicit limit)

**If ANY requirement fails:** the quote is invalid. Log `stale_observation_skips` with
the reason. The activation state is LEFT UNCHANGED. Missing, stale, or invalid
quotes NEVER count as a state change, clear, or reset.

**checkentry is BLOCKED for activation decisions.** The artifact's checkentry action
returns daily-close bars as "current price" during market hours (2026-10-16 defect).
Never use checkentry for §5 transitions. The block remains until checkentry is
verified to return intraday data with market-event timestamps.

Transition rules (fresh, valid observations ONLY — missing or stale data NEVER
counts as a state change or a reset):
- Entry zone: on each run, take a fresh price observation via intraday_quotes.py for
  symbols with an active entry-zone key (must meet ALL freshness requirements above
  or the state is left unchanged). State machine: inside → outside (fresh valid price
  beyond the 1% band) → ARMED; outside → inside (fresh valid price back within
  the band) → NEW activation (new activation_id), notify as a new event.
- Radar 90+: qualification begins (feed firing) → ACTIVE. Clears → only on
  positive clear evidence (a fresh valid observation showing the score below the
  qualification threshold or an explicit clear event from the feed). Qualifies
  again after a recorded clear → NEW activation, notify. Until the feed exposes
  clear-state, radar keys never reset on absence alone — no re-alert without
  positive evidence of a clear followed by a re-qualification.
- A changed level/score/invalidation/confidence yields a NEW dedup key → new
  activation → notify (unchanged from before).

**COVERAGE GAP RECOVERY RULE (2026-10-16):**
The first fresh valid quote after a coverage gap (where no valid quotes were available)
does NOT trigger a new activation by itself. It establishes the baseline state:
- If the quote shows the condition active (inside band) → record as ACTIVE with
  `recovery_baseline: true`, do NOT notify (we cannot claim an unobserved crossing
  occurred during the gap).
- If the quote shows the condition clear (outside band) → record as ARMED.
- Subsequent fresh valid quotes follow the normal transition rules above.
This prevents false "re-entry" notifications from gap recovery.

Then per key:
- New key, kind = Entry zone → FIRST run the §5 validated quote check for the exact
  symbol via intraday_quotes.py, applying ALL six freshness requirements
  (symbol match, market_event_time_utc present, retrieval_time_utc present,
  session ∈ {regular, pre, post}, is_fresh=true, age_seconds within the 300s-regular /
  900s-pre/post limit). `session=open` or `is_fresh=true` ALONE is never sufficient —
  all six must hold. Only if the quote is valid: create activation (fresh
  activation_id), sendable (representative = newest row).
  If the quote is invalid:
  - Create the dedup-key ledger entry in a NON-NOTIFIED state: `activation_id: null`,
    `condition_state: null` (no state claim made), `last_alert_id` = representative
    row id, `notified_at_utc: null`, `status: 'never_sent'`, plus a
    `last_observation.stale_basis` record:
    `{feed_row_id, feed_created_at_utc, row_price, entry_side, entry_level, session,
    is_fresh, market_event_time_utc, age_seconds, reason}`.
  - Advance `watermark_observed_at` past the row (prevents reprocessing loops).
  - Do NOT create an activation. Do NOT notify. Do NOT mark queued/delivered.
  - Count it in the run log's `stale_observation_skips` with the reason.
  - COVERAGE-GAP RECOVERY PRESERVED (2026-10-16 rule applies verbatim): such a key has
    no valid basis yet. Its FIRST fresh valid §5 quote establishes the baseline state
    ONLY — price inside the band → `condition_state: 'active'` with
    `recovery_baseline: true`, NO notification; price outside the band → `armed`.
    Only subsequent fresh valid quotes may drive the normal transition rules.
- New key, kind = Radar 90+ short/long → unchanged: create activation (fresh
  activation_id), sendable (representative = newest row).
- Key with an ACTIVE activation and a same-key repeat → skip (suppressed). Count as `dedup_suppressed`.
- Key whose activation recorded a CLEAR (armed) and now shows the condition active
  again with a fresh valid observation → NEW activation (new activation_id), sendable.
- Key with status `unknown` → never auto-resent. Operator resolution only.

### 6. Compose
Mandatory label on EVERY message (fresh or digest):
`WATCH ALERT — equity watch alert only — not a confirmed entry, not an order, not a signal.`

Fresh message: one block per sendable fresh row, each with asset, why it triggered
(the message text), observation time (createdAt), relevant levels (parsed),
freshness (age vs now, e.g. "47m ago"), source domain (from sourceUrl), and the
line `→ equity terminal → ALERTS tab`. New-activation re-alerts carry
`new activation — condition re-triggered after a recorded clear`. Group Radar 90+
rows whose createdAt falls in the same 5-minute window into ONE concise block
(list each symbol/direction/score/invalidation on one line).

Catch-up digest (only if ≥1 sendable catch-up row): open with
`**WATCH ALERT — equity catch-up digest** — watch alerts only (not confirmed
entries, not signals). Timestamps below are actual observation times,
NOT fresh triggers.` Then the same blocks, grouped as above, each labeled with
its real observation time and age.

If nothing sendable and nothing to surface: emit no chat-facing output at all.

### 7. Commit order (the mechanism)
1. Decide the final send set (§5).
2. Pre-commit state.json FIRST: for each sendable key, write
   `{last_alert_id, notified_at_utc: <now>, run_ts_utc: <this run start>,
   status: 'awaiting-ack',
   delivery_key: 'cron-delivery:equity-alert-drain:<this run_id>:side_chat:7b75e732-f527-4d53-b40d-4aa036201d9b',
   activation_id, condition_state, last_observed_at_utc, last_observation}`
   where `last_alert_id` is the representative (newest) row's id. Atomic tmp+rename.
   Then for each sendable key invoke `recordAlertDeliveryState` on the
   `equity-analyzer-and-signal-tracker` artifact with
   `{dedup_key: <key>, symbol, kind, stage: 'watch_alert', state: 'queued',
   channel: 'side_chat', delivered_at: null, error: null}`.
   (The action schema requires the `delivered_at`/`error` keys; pass explicit
   nulls for queued state — never invent a delivery timestamp.) Failures logged
   as `outbox_write_failed`; the next run's §1b reconciles.
3. Rewrite delivery-status.json from the updated ledger (§1 mapping). Newly sent
   keys enter as `queued`.
4. Write the run log (§8). ALL file work ends here.
5. NOW compose the final output message (the send). Produce it and stop.

### 8. Run log
Write drain-runs/run-<UTC-ts>.json BEFORE any output, as the two-field receipt:
- `job_id`: "equity-alert-drain", `run_utc`, `invocation_completed`: started_utc,
  finished_utc, status (succeeded | failed | incomplete), fetched, kept_by_kind,
  excluded_by_kind, fresh_sendable, catchup_sendable, dedup_suppressed,
  stale_skipped, parse_fallbacks, sent_keys, acked_this_run, surfaced_unknown,
  transitions_observed (per kind: armed_clears, new_activations), stale_observation_skips,
  outbox_writes, outbox_write_failed, any action errors.
- `scheduler_provenance`: `origin_unverified` (DEFAULT), `manual` (only when the
  run reason begins with `manual:` or this is a documented verification run),
  NEVER `verified:<execution-id>`.
Prune drain-runs/ to the last 20 files.

### Hard rules
- Exactly one chat delivery per dedup key per activation. Never re-send a `delivered` key.
- Pending-ack keys are protected across runs and restarts: an acknowledgement delay
  NEVER triggers an automatic resend. Unconfirmable delivery becomes `unknown`,
  preserved until operator review — never silently retried.
- `delivered` is earned ONLY by outbox `state='delivered'` + `delivered_at_utc`.
- Ledger pre-commit ALWAYS precedes the rendered output. No exceptions.
- delivery-status.json carries EXACTLY the four statuses {queued,
  channel-acknowledged, failed, unknown} — the homepage contract.
- Never invent prices, timestamps, or levels. Observation times come from the
  row's `createdAt`, never wall clock. Condition transitions require fresh valid
  observations; missing or stale data never counts as a reset or a clear.
- A silent run (nothing sendable) still writes state.json + delivery-status.json + the run log.
- checkentry is BLOCKED for activation decisions until verified to return intraday data.
- A new Entry-zone activation from a feed row requires the §5 validated quote for the
  exact symbol to satisfy ALL six freshness requirements. A stale-basis feed row may
  be recorded as a stale-basis observation but can NEVER establish a fresh crossing
  or a new activation.
