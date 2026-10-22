# Manual relay lifecycle guard (2026-10-17)

Standing rule for the main agent when manually relaying paper alerts to chat
(worker-to-chat hop broken; relay is the fallback path).

Authority: Codex review 2026-10-17; Logan instruction 2026-10-17T17:10:08Z.
Scope: PAPER ONLY. No strategy/weight/threshold/gate/holdout change.

## Eligibility — same as worker sends

Before relaying ANY alert key manually, verify ALL of:

1. **Lifecycle state**: the key is not terminal in the production ledger
   (`delivered`, `suppressed`, `failed`, `unknown`) and not already
   channel-acknowledged under a shared per-key delivery claim.
2. **Entered/expired/voided**:
   - Never relay a SETUP_PENDING whose entry is already confirmed
     (a qualified ENTRY_CONFIRMED for the same setup supersedes it).
   - Never relay a key whose entry window has expired at relay time —
     use the FROZEN observation window from the alert payload, never a
     recomputed issued_at+15min deadline.
   - Never relay a voided or duplicate-suppressed key.
3. **Uncertain eligibility defers**: if lifecycle state cannot be verified
   (ledger unreadable, window ambiguous), DO NOT SEND. Defer and note it.
   Uncertain sends are never blindly retried.

## Accounting — worker completion vs channel acknowledgement

- Record the worker's sent mark and the manual relay as SEPARATE facts.
- Every manual relay is labeled `unattended=false`, `delivery_route=manual-relay`,
  with the real channel ack time — never the worker's internal timestamp.
- A manually delivered genuine paper entry keeps its genuine entry identity;
  it is not evidence of unattended delivery reliability.

## What this does not authorize

- No replay of expired candidates. No deadline extension. No UNKNOWN-key
  resends. No authoritative persistence cutover. No merge/deployment.

## History

- 2026-10-17 ~19:14Z: pending_121/SETUP_PENDING was relayed AFTER its entry
  confirmed (19:03:14.643Z). Predates this guard; annotated as superseded in
  entry-to-delivery-log-CORRECTIONS-2026-10-17.jsonl (corr-004). Not repeated.
