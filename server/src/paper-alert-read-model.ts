export type StoredPaperAlertRow = {
  id: number;
  eventKey: string;
  paperSignalId: string;
  contractId: string | null;
  eventType: string | null;
  eventVersion: number | null;
  status: "enqueued" | "delivered" | "simulated_ack" | "failed" | "unconfigured";
  transport: string;
  destinationLabel: string | null;
  payloadJson: string;
  enqueuedAt: Date;
  acknowledgedAt: Date | null;
  attemptCount: number;
  lastError: string | null;
  createdAt: Date;
  updatedAt: Date;
  // Terminal-first delivery fields (migration 0064). Optional so rows read
  // from pre-migration fixtures still project; absent means never recorded.
  readAt?: Date | null;
  chatSentAt?: Date | null;
  expiresAt?: Date | null;
};

export type PaperAlertReadRow = Omit<StoredPaperAlertRow, "status" | "enqueuedAt" | "acknowledgedAt" | "createdAt" | "updatedAt" | "readAt" | "chatSentAt" | "expiresAt"> & {
  status: "queued" | "delivered" | "simulated_ack" | "failed" | "unconfigured";
  enqueuedAt: string;
  acknowledgedAt: string | null;
  createdAt: string;
  updatedAt: string;
  readAt: string | null;
  chatSentAt: string | null;
  expiresAt: string | null;
};

/**
 * Canonical read-model projection for persisted paper alerts.
 *
 * Both the full diagnostic status action and the alerts-only watcher action use
 * this projection so the watcher sees the exact same alert rows without paying
 * to load unrelated pilot state.
 */
export function paperAlertReadRow(row: StoredPaperAlertRow): PaperAlertReadRow {
  return {
    ...row,
    status: row.status === "enqueued" ? "queued" : row.status,
    enqueuedAt: row.enqueuedAt.toISOString(),
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null,
    chatSentAt: row.chatSentAt?.toISOString() ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
  };
}

export function paperAlertsOnlyRead(rows: readonly StoredPaperAlertRow[]): { alerts: PaperAlertReadRow[] } {
  return { alerts: rows.map(paperAlertReadRow) };
}
