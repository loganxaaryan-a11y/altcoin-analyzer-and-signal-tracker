import { describe, expect, test } from "bun:test";
import { paperAlertReadRow, paperAlertsOnlyRead, type StoredPaperAlertRow } from "./paper-alert-read-model";
import {
evaluatePaperDeliveryDecision,
executePaperDelivery,
type PaperDeliveryEvaluationContext,
type PaperDeliveryLedgerRecord,
} from "./paper-delivery-worker";

const NOW = new Date("2026-10-16T16:00:00.000Z");
const MAX_AGE = { SETUP_PENDING: 15 * 60_000, ENTRY_CONFIRMED: 60 * 60_000 } as const;

function alertRow(args: {
  id: number;
  signalId: string;
  alertType: "SETUP_PENDING" | "ENTRY_CONFIRMED";
  issuedAt: string;
  test?: boolean;
  payloadOverride?: string;
  eventTypeOverride?: string;
}): StoredPaperAlertRow {
  const date = new Date(args.issuedAt);
  return {
    id: args.id,
    eventKey: `${args.signalId}:${args.alertType}:v1`,
    paperSignalId: args.signalId,
    contractId: `candidate-${args.id}`,
    eventType: args.eventTypeOverride ?? args.alertType,
    eventVersion: 1,
    status: "enqueued",
    transport: "workspace-cron-read-model",
    destinationLabel: "research-side-chat",
    payloadJson: args.payloadOverride ?? JSON.stringify({
      signal_id: args.signalId,
      alert_type: args.alertType,
      issued_at: args.issuedAt,
      test: args.test ?? false,
    }),
    enqueuedAt: date,
    acknowledgedAt: null,
    attemptCount: 0,
    lastError: null,
    createdAt: date,
    updatedAt: date,
  };
}

function context(ledger: readonly PaperDeliveryLedgerRecord[] = [], scope: "production" | "test" = "production"): PaperDeliveryEvaluationContext {
  return { now: NOW, scope, maxAgeMsByAlertType: MAX_AGE, ledger };
}

function decisions(rows: ReturnType<typeof paperAlertReadRow>[], state: PaperDeliveryEvaluationContext) {
  return rows.map((row) => {
    const decision = evaluatePaperDeliveryDecision(row, state);
    return { decision: decision.decision, reason: decision.reason, key: decision.key, surfaceUnknown: decision.surfaceUnknown };
  });
}

describe("slim paper delivery worker contract", () => {
  test("slim and full status projections produce identical send/suppress/skip decisions", () => {
    const fresh = alertRow({ id: 1, signalId: "sig_fresh", alertType: "ENTRY_CONFIRMED", issuedAt: "2026-10-16T15:55:00.000Z" });
    const duplicate = alertRow({ id: 2, signalId: "sig_delivered", alertType: "SETUP_PENDING", issuedAt: "2026-10-16T15:50:00.000Z" });
    const expired = alertRow({ id: 3, signalId: "sig_expired", alertType: "SETUP_PENDING", issuedAt: "2026-10-16T15:40:00.000Z" });
    const invalid = alertRow({ id: 4, signalId: "sig_invalid", alertType: "ENTRY_CONFIRMED", issuedAt: "2026-10-16T15:58:00.000Z", payloadOverride: "{not-json" });
    const testOnly = alertRow({ id: 5, signalId: "sig_test", alertType: "ENTRY_CONFIRMED", issuedAt: "2026-10-16T15:58:00.000Z", test: true });
    const stored = [fresh, duplicate, expired, invalid, testOnly];
    const ledger: PaperDeliveryLedgerRecord[] = [{
      signal_id: "sig_delivered",
      alert_type: "SETUP_PENDING",
      issued_at: "2026-10-16T15:50:00.000Z",
      sent_at_utc: "2026-10-16T15:50:04.000Z",
      scope: "production",
      state: "delivered",
      acknowledged_at_utc: "2026-10-16T15:50:06.000Z",
      unknown_surfaced_at_utc: null,
    }];

    const fullStatusAlerts = stored.map(paperAlertReadRow);
    const slimAlerts = paperAlertsOnlyRead(stored).alerts;
    const state = context(ledger);
    const expected: ReturnType<typeof decisions> = [
      { decision: "send", reason: "ready", key: "production:sig_fresh:ENTRY_CONFIRMED", surfaceUnknown: false },
      { decision: "suppress", reason: "already_delivered", key: "production:sig_delivered:SETUP_PENDING", surfaceUnknown: false },
      { decision: "skip", reason: "expired", key: "production:sig_expired:SETUP_PENDING", surfaceUnknown: false },
      { decision: "skip", reason: "invalid_schema", key: null, surfaceUnknown: false },
      { decision: "skip", reason: "scope_mismatch", key: "production:sig_test:ENTRY_CONFIRMED", surfaceUnknown: false },
    ];

    expect(decisions(fullStatusAlerts, state)).toEqual(expected);
    expect(decisions(slimAlerts, state)).toEqual(expected);
  });

  test("pre-commits the ledger before render and records sent_at_utc before transport", async () => {
    const row = paperAlertReadRow(alertRow({ id: 6, signalId: "sig_order", alertType: "ENTRY_CONFIRMED", issuedAt: "2026-10-16T15:59:00.000Z" }));
    const decision = evaluatePaperDeliveryDecision(row, context());
    const events: string[] = [];
    const writes: PaperDeliveryLedgerRecord[] = [];
    const result = await executePaperDelivery(decision, "production", {
      workerToken: "worker-order",
      leaseMs: 60_000,
      async claimLedger(record) { writes.push({ ...record }); events.push(`ledger:${record.state}:${record.sent_at_utc ?? "unset"}`); return true; },
      async writeLedger(record) {
        writes.push({ ...record });
        events.push(`ledger:${record.state}:${record.sent_at_utc ?? "unset"}`);
      },
      async render(payload) {
        events.push(`render:${payload.signal_id}`);
        return "rendered alert";
      },
      async send() {
        events.push("send");
        return { state: "delivered", acknowledgedAtUtc: "2026-10-16T16:00:03.000Z" };
      },
      now: () => new Date("2026-10-16T16:00:02.000Z"),
    });

    expect(events).toEqual([
      "ledger:committed:unset",
      "render:sig_order",
      "ledger:committed:2026-10-16T16:00:02.000Z",
      "send",
      "ledger:delivered:2026-10-16T16:00:02.000Z",
    ]);
    expect(writes[0]?.issued_at).toBe("2026-10-16T15:59:00.000Z");
    expect(writes[0]?.signal_id).toBe("sig_order");
    expect(writes[0]?.alert_type).toBe("ENTRY_CONFIRMED");
    expect(result?.state).toBe("delivered");
    expect(result?.acknowledged_at_utc).toBe("2026-10-16T16:00:03.000Z");
  });

  test("ambiguous sends become UNKNOWN, surface once, and never auto-retry", async () => {
    const row = paperAlertReadRow(alertRow({ id: 7, signalId: "sig_unknown", alertType: "ENTRY_CONFIRMED", issuedAt: "2026-10-16T15:59:00.000Z" }));
    const first = evaluatePaperDeliveryDecision(row, context());
    const writes: PaperDeliveryLedgerRecord[] = [];
    const unknown = await executePaperDelivery(first, "production", {
      workerToken: "worker-unknown",
      leaseMs: 60_000,
      async claimLedger(record) { writes.push({ ...record }); return true; },
      async writeLedger(record) { writes.push({ ...record }); },
      async render() { return "rendered alert"; },
      async send() { return { state: "ambiguous" }; },
      now: () => new Date("2026-10-16T16:00:02.000Z"),
    });
    expect(unknown?.state).toBe("unknown");
    expect(unknown?.sent_at_utc).toBe("2026-10-16T16:00:02.000Z");

    const unresolved = evaluatePaperDeliveryDecision(row, context(unknown ? [unknown] : []));
    expect(unresolved.decision).toBe("suppress");
    expect(unresolved.reason).toBe("unknown_not_retryable");
    expect(unresolved.surfaceUnknown).toBe(true);

    const surfaced = unknown ? { ...unknown, unknown_surfaced_at_utc: "2026-10-16T16:01:00.000Z" } : null;
    const repeated = evaluatePaperDeliveryDecision(row, context(surfaced ? [surfaced] : []));
    expect(repeated.decision).toBe("suppress");
    expect(repeated.surfaceUnknown).toBe(false);
    expect(writes.map((item) => item.state)).toEqual(["committed", "committed", "unknown"]);
  });

  test("production and test identities are isolated in separate ledger scopes", () => {
    const productionRow = paperAlertReadRow(alertRow({ id: 8, signalId: "sig_same", alertType: "SETUP_PENDING", issuedAt: "2026-10-16T15:55:00.000Z" }));
    const testRow = paperAlertReadRow(alertRow({ id: 9, signalId: "sig_same", alertType: "SETUP_PENDING", issuedAt: "2026-10-16T15:55:00.000Z", test: true }));
    const productionLedger: PaperDeliveryLedgerRecord = {
      signal_id: "sig_same",
      alert_type: "SETUP_PENDING",
      issued_at: "2026-10-16T15:55:00.000Z",
      sent_at_utc: "2026-10-16T15:55:01.000Z",
      scope: "production",
      state: "delivered",
      acknowledged_at_utc: "2026-10-16T15:55:02.000Z",
      unknown_surfaced_at_utc: null,
    };

    expect(evaluatePaperDeliveryDecision(productionRow, context([productionLedger], "production")).reason).toBe("already_delivered");
    expect(evaluatePaperDeliveryDecision(testRow, context([productionLedger], "test")).decision).toBe("send");
    expect(evaluatePaperDeliveryDecision(testRow, context([productionLedger], "production")).reason).toBe("scope_mismatch");
  });
});
