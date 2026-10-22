import { z } from "@hatch/space-sdk";
import type { PaperAlertReadRow } from "./paper-alert-read-model";
import { runBoundedCoalescedPoll, type BoundedPaperPollResult, type PaperPollLeaseStore } from "./paper-poll-concurrency";

export const paperDeliveryPayloadSchema = z.object({
  signal_id: z.string().min(1),
  alert_type: z.enum(["SETUP_PENDING", "ENTRY_CONFIRMED"]),
  issued_at: z.string().datetime(),
  test: z.boolean(),
}).passthrough();

export type PaperDeliveryPayload = z.infer<typeof paperDeliveryPayloadSchema>;
export type PaperDeliveryScope = "production" | "test";
export type PaperDeliveryState = "committed" | "delivered" | "unknown";
export type PaperDeliveryDecisionKind = "send" | "suppress" | "skip";

export type PaperDeliveryLedgerRecord = {
  signal_id: string;
  alert_type: PaperDeliveryPayload["alert_type"];
  issued_at: string;
  sent_at_utc: string | null;
  scope: PaperDeliveryScope;
  state: PaperDeliveryState;
  acknowledged_at_utc: string | null;
  unknown_surfaced_at_utc: string | null;
  owner_token?: string | null;
  lease_expires_at_utc?: string | null;
};

export type PaperDeliveryDecision = {
  decision: PaperDeliveryDecisionKind;
  reason:
    | "ready"
    | "invalid_schema"
    | "identity_mismatch"
    | "lifecycle_mismatch"
    | "expired"
    | "scope_mismatch"
    | "already_committed"
    | "recoverable_commit"
    | "sent_unacknowledged"
    | "already_delivered"
    | "unknown_not_retryable";
  key: string | null;
  payload: PaperDeliveryPayload | null;
  ledger: PaperDeliveryLedgerRecord | null;
  surfaceUnknown: boolean;
};

export type PaperDeliveryEvaluationContext = {
  now: Date;
  scope: PaperDeliveryScope;
  maxAgeMsByAlertType: Record<PaperDeliveryPayload["alert_type"], number>;
  ledger: readonly PaperDeliveryLedgerRecord[];
};

function payloadFromRow(row: Pick<PaperAlertReadRow, "payloadJson">): PaperDeliveryPayload | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.payloadJson);
  } catch {
    return null;
  }
  const validated = paperDeliveryPayloadSchema.safeParse(parsed);
  return validated.success ? validated.data : null;
}

export function paperDeliveryKey(payload: PaperDeliveryPayload, scope: PaperDeliveryScope): string {
  return `${scope}:${payload.signal_id}:${payload.alert_type}`;
}

/**
 * The polling worker's complete delivery decision. It deliberately depends only
 * on fields returned by getpaperpilotalerts plus the durable delivery ledger.
 */
export function evaluatePaperDeliveryDecision(
  row: Pick<PaperAlertReadRow, "paperSignalId" | "eventType" | "payloadJson">,
  context: PaperDeliveryEvaluationContext,
): PaperDeliveryDecision {
  const payload = payloadFromRow(row);
  if (!payload) return { decision: "skip", reason: "invalid_schema", key: null, payload: null, ledger: null, surfaceUnknown: false };

  const key = paperDeliveryKey(payload, context.scope);
  if (row.paperSignalId !== payload.signal_id) {
    return { decision: "skip", reason: "identity_mismatch", key, payload, ledger: null, surfaceUnknown: false };
  }
  if (row.eventType !== payload.alert_type) {
    return { decision: "skip", reason: "lifecycle_mismatch", key, payload, ledger: null, surfaceUnknown: false };
  }
  const payloadScope: PaperDeliveryScope = payload.test ? "test" : "production";
  if (payloadScope !== context.scope) {
    return { decision: "skip", reason: "scope_mismatch", key, payload, ledger: null, surfaceUnknown: false };
  }

  const ageMs = context.now.getTime() - Date.parse(payload.issued_at);
  const maxAgeMs = context.maxAgeMsByAlertType[payload.alert_type];
  if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > maxAgeMs) {
    return { decision: "skip", reason: "expired", key, payload, ledger: null, surfaceUnknown: false };
  }

  const existing = context.ledger.find((item) =>
    item.scope === context.scope
    && item.signal_id === payload.signal_id
    && item.alert_type === payload.alert_type
  ) ?? null;
  if (existing?.state === "delivered") {
    return { decision: "suppress", reason: "already_delivered", key, payload, ledger: existing, surfaceUnknown: false };
  }
  if (existing?.state === "unknown") {
    return { decision: "suppress", reason: "unknown_not_retryable", key, payload, ledger: existing, surfaceUnknown: existing.unknown_surfaced_at_utc === null };
  }
  if (existing?.state === "committed") {
    if (existing.sent_at_utc !== null) {
      return { decision: "suppress", reason: "sent_unacknowledged", key, payload, ledger: existing, surfaceUnknown: existing.unknown_surfaced_at_utc === null };
    }
    const leaseExpiresAt = existing.lease_expires_at_utc ? Date.parse(existing.lease_expires_at_utc) : Number.NaN;
    if (Number.isFinite(leaseExpiresAt) && leaseExpiresAt <= context.now.getTime()) {
      return { decision: "send", reason: "recoverable_commit", key, payload, ledger: existing, surfaceUnknown: false };
    }
    return { decision: "suppress", reason: "already_committed", key, payload, ledger: existing, surfaceUnknown: false };
  }
  return { decision: "send", reason: "ready", key, payload, ledger: null, surfaceUnknown: false };
}

export type PaperDeliveryOutboxResult =
  | { state: "delivered"; acknowledgedAtUtc: string }
  | { state: "ambiguous" };

export function reconcilePaperDeliveryAttempt(
  record: PaperDeliveryLedgerRecord,
  result: PaperDeliveryOutboxResult,
): PaperDeliveryLedgerRecord {
  if (result.state === "delivered") {
    return { ...record, state: "delivered", acknowledged_at_utc: result.acknowledgedAtUtc };
  }
  return { ...record, state: "unknown", acknowledged_at_utc: null };
}

export type PaperDeliveryExecutionDeps = {
  workerToken: string;
  leaseMs: number;
  // Must be a durable compare-and-set: insert when expected is null, otherwise
  // replace only that exact expired pre-send claim. This is the send mutex.
  claimLedger: (record: PaperDeliveryLedgerRecord, expected: PaperDeliveryLedgerRecord | null) => Promise<boolean>;
  writeLedger: (record: PaperDeliveryLedgerRecord, workerToken: string) => Promise<void>;
  render: (payload: PaperDeliveryPayload) => Promise<string>;
  send: (rendered: string) => Promise<PaperDeliveryOutboxResult>;
  now: () => Date;
};

/**
 * Executes one SEND decision with durable ordering:
 * 1) commit identity before rendering, 2) persist sent_at_utc before the
 * transport call, 3) reconcile the outbox acknowledgement. An ambiguous send
 * becomes UNKNOWN and is never selected for automatic retry by the evaluator.
 */
export async function executePaperDelivery(
  decision: PaperDeliveryDecision,
  scope: PaperDeliveryScope,
  deps: PaperDeliveryExecutionDeps,
): Promise<PaperDeliveryLedgerRecord | null> {
  if (decision.decision !== "send" || !decision.payload) return decision.ledger;

  const claimedAt = deps.now();
  const base: PaperDeliveryLedgerRecord = {
    signal_id: decision.payload.signal_id,
    alert_type: decision.payload.alert_type,
    issued_at: decision.payload.issued_at,
    sent_at_utc: null,
    scope,
    state: "committed",
    acknowledged_at_utc: null,
    unknown_surfaced_at_utc: null,
    owner_token: deps.workerToken,
    lease_expires_at_utc: new Date(claimedAt.getTime() + deps.leaseMs).toISOString(),
  };
  const claimed = await deps.claimLedger(base, decision.ledger);
  if (!claimed) return decision.ledger;
  const rendered = await deps.render(decision.payload);
  const sent: PaperDeliveryLedgerRecord = { ...base, sent_at_utc: deps.now().toISOString() };
  await deps.writeLedger(sent, deps.workerToken);

  let outbox: PaperDeliveryOutboxResult;
  try {
    outbox = await deps.send(rendered);
  } catch {
    outbox = { state: "ambiguous" };
  }
  const reconciled = reconcilePaperDeliveryAttempt(sent, outbox);
  await deps.writeLedger(reconciled, deps.workerToken);
  return reconciled;
}

export type PaperDeliveryPollResult = {
  examined: number;
  sent: number;
  suppressed: number;
  skipped: number;
};

/**
 * The delivery worker entry point. One durable delivery_worker lease owns the
 * poll, every pass is finite, and overlapping invocations coalesce to one
 * bounded follow-up. Per-alert compare-and-set claims remain the final send
 * mutex, so lease expiry cannot duplicate a notification.
 */
export function executePaperDeliveryPoll(
  store: PaperPollLeaseStore<PaperDeliveryPollResult>,
  rows: readonly Pick<PaperAlertReadRow, "paperSignalId" | "eventType" | "payloadJson">[],
  context: PaperDeliveryEvaluationContext,
  deps: PaperDeliveryExecutionDeps,
  maxItems = 100,
  maxPasses = 2,
): Promise<BoundedPaperPollResult<PaperDeliveryPollResult>> {
  if (!Number.isInteger(maxItems) || maxItems < 1 || maxItems > 100) throw new Error("maxItems must be an integer from 1 through 100.");
  return runBoundedCoalescedPoll(store, async () => {
    let sent = 0;
    let suppressed = 0;
    let skipped = 0;
    const boundedRows = rows.slice(0, maxItems);
    for (const row of boundedRows) {
      const decision = evaluatePaperDeliveryDecision(row, context);
      if (decision.decision === "send") {
        const result = await executePaperDelivery(decision, context.scope, deps);
        if (result?.owner_token === deps.workerToken) sent += 1;
        else suppressed += 1;
      } else if (decision.decision === "suppress") {
        suppressed += 1;
      } else {
        skipped += 1;
      }
    }
    return { examined: boundedRows.length, sent, suppressed, skipped };
  }, maxPasses);
}
