# Chat-routing reconciliation — paper-signal alerts, 2026-10-14

PAPER ONLY. Resolves the apparent discrepancy between the deployed
artifact's `delivery.configured: false` and the earlier "chat delivery is
wired" claims. Verdict: **there is no contradiction — the two claims are
about two different delivery layers.** One wording in the artifact is stale;
one field in the workspace config is stale. Neither requires a redeploy fix.

## What the deployed artifact actually claims

From a real `getpaperpilotstatus` invocation on
`altcoin-analyzer-and-signal-tracker`, captured verbatim by the delivery
worker and saved at
`pilot/delivery/worker-runs/status-2026-10-14T18-05-47Z.json` (run at
2026-10-14T18:05:47Z / 14:05:47 EDT):

```json
"delivery": {
  "configured": false,
  "missingCapability": "No chosen alert destination or acknowledged delivery action is configured. Enqueue persistence is shown separately and is not called delivery."
}
```

The payload also carries `data.alerts: []` (no alerts pending), and its
frozen provenance: `paper-pilot-v2.1.0`, freeze hash
`a7d354a4f8ad9b0af7d3d61986b049f822ee918d28f26f335401d72d24669f84`.

Scope of this claim, read carefully: **in-artifact** chat delivery. The
artifact is saying "the artifact itself has no chat action and no
in-artifact destination configured." That is a true statement about the
artifact's own executable. It is NOT saying "nobody will ever get a chat
message about a paper alert" — chat delivery was never architected to live
inside the artifact.

## What the workspace layer actually does

Delivery is owned by the workspace layer, by design (see
AUTO-DELIVERY-WIRING-2026-10-14.md, "What each side owns"):

1. **Agent cron `paper-signal-alert-delivery`** — interval 15m,
   `America/Toronto`, verified registered AND enabled live via `cron.list`
   on 2026-10-14 (`schedule_key: interval@15m`, owner
   `goal:research-terminal`). Live run logs today (latest
   `run-2026-10-14T18-05-47Z.json`) show the worker executing its real
   loop: load config+ledger → invoke `getpaperpilotstatus` → ack sweep →
   send sweep → QUIET when nothing is due.
2. **Runtime delivery subsystem** — when an alert is due, the worker's run
   output is posted automatically to the research side chat
   `a685c3e7-c8be-4137-8900-4e899008bca7` (the cron's registered
   `delivery` target). Same mechanism as `terminal-morning-brief`,
   `paste-trade-watch`, `signal-accuracy-test-week1`, `x-smart-sweep`.
3. **Ledger** — `pilot/delivery/alert-delivery-ledger.json` is the book of
   record for chat delivery (empty at 2026-10-14: zero alerts have existed,
   so zero sends is correct behavior, not a failure).
4. **Ack standard** — `delivered` requires the run's `delivery_key` at
   `state='delivered'` in `scheduler.delivery_outbox`. No simulated acks.

So: the artifact owns issuance and exposes alert rows via
`getpaperpilotstatus`; the workspace cron sweeps those rows and the runtime
delivers to chat. Two layers, one pipeline. `configured: false` in-artifact
is the designed state, not a bug.

## Were the earlier "delivery wired" claims true?

Yes — **with the workspace-cron scope, they were true, and they are still
true.** The workspace records never claimed in-artifact delivery:

- `delivery-config.json`: `auto_delivery.status` = "armed — test-proven,
  auto-unproven"; routing test was manually channel-acked (Logan's 👍 at
  2026-10-14T05:12:26Z); no automatic alert had flowed yet because the
  deployed paper tables held 0 alerts. Nothing manufactured, nothing
  overstated.
- `AUTO-DELIVERY-WIRING-2026-10-14.md`: "in-artifact delivery
  `configured: false` — the artifact itself has no chat action and never
  claims otherwise" and "No artifact changes needed: the worker only READS
  getpaperpilotstatus. The in-artifact `delivery.configured: false` stays
  as-is (truthful)."

The "discrepancy" is therefore a reading error, not a system error: someone
read the artifact's self-scoped `configured:false` as a statement about the
whole pipeline. The workspace docs had already disambiguated it — but the
artifact's own wording makes the misreading easy (see "stale wording"
below).

## Two genuinely stale statements to correct (both documentary, no redeploy)

1. **`delivery.configured` itself — leave as-is.** Do NOT "fix" it to
   `true` in a redeploy. That would be a false statement (the artifact
   genuinely has no chat action) AND it would mean touching the frozen
   `paper-pilot-v2.1.0` executable mid-measurement — a freeze violation for
   a cosmetic gain. The correct fix is prose, not code: future readers need
   to know this field means "artifact-owned delivery," not "delivery
   anywhere in the system."
2. **Artifact `missingCapability` wording is stale.** "No chosen alert
   destination ... is configured" is no longer accurate: Logan CHOSE the
   destination on 2026-10-14 (research side chat
   `a685c3e7-c8be-4137-8900-4e899008bca7`); it is just implemented in the
   workspace layer, not in-artifact. This string predates his routing
   decision. It should be reworded at the next legitimate rebuild
   (post-freeze), e.g. "Artifact-owned alert delivery is not configured;
   alert exposure is via getpaperpilotstatus for external delivery layers."
   Until then, this reconciliation doc stands as the annotation.
3. **`delivery-config.json` `auto_delivery.worker_cron.registered: false`
   is now wrong.** Verified live on 2026-10-14: the
   `paper-signal-alert-delivery` cron is registered and enabled (every 15m,
   America/Toronto). The wiring pass's "STAGED — register via cron.add" was
   completed afterward; the config field was never updated. Correction is
   a one-line config edit (`registered: true` + registration timestamp) —
   config-only, no freeze impact. Left for the parent to apply rather than
   done here.

## Recommendation (crisp)

**Do not change the deployed artifact.** Its `configured: false` is
truthful within its scope and changing it would violate the v2.1.0 freeze.
The earlier "delivery wired" claims were true about the workspace-cron
path, which is registered, enabled, running on schedule, and correctly
QUIET with zero alerts pending. The honest work is documentary: (a) correct
`registered: false` → `true` in `delivery-config.json`; (b) annotate the
artifact's `missingCapability` string as pre-dating Logan's 2026-10-14
routing decision, to be reworded at the next post-freeze rebuild; (c) going
forward, every "delivery" claim names its layer — artifact-owned or
workspace-cron-owned — so the two scopes can never be conflated again.

## Evidence index (all 2026-10-14, real records, no hand-writing)

- Deployed claim: `pilot/delivery/worker-runs/status-2026-10-14T18-05-47Z.json`
  (raw `getpaperpilotstatus` payload; `delivery.configured: false`)
- Live worker: `pilot/delivery/worker-runs/run-2026-10-14T18-05-47Z.json`
  (QUIET — nothing due; worker loop fully executed)
- Cron registration: `cron.list` 2026-10-14 → `paper-signal-alert-delivery`,
  enabled, `interval@15m`, America/Toronto, owner `goal:research-terminal`
- Routing proof: `delivery-config.json` → `routing_test` (manual TEST
  message `assistant-msg-630a9f81-e589-1734-6ca4-040ba466fe2b`,
  channel-acked via Logan's 👍 reaction at 2026-10-14T05:12:26Z)
- Ledger: `pilot/delivery/alert-delivery-ledger.json` (empty — 0 alerts
  have ever existed, so 0 sends is correct)

Note: the artifact action was not invoked from this session (no artifact
tools available to this subagent); the deployed payload above comes from
the worker's saved raw snapshots of its own real invocations, which is
deployed evidence either way.
