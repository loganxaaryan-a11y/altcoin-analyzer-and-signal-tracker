import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { desc } from "drizzle-orm";
import type { Ctx } from "@hatch/space-sdk";
import { readPaperPilotAlerts } from "./actions";
import { paperAlertReadRow } from "./paper-alert-read-model";
import * as schema from "./schema";

const databases: Database[] = [];
afterEach(() => { while (databases.length) databases.pop()?.close(); });

function fixture() {
  const sqlite = new Database(":memory:");
  databases.push(sqlite);
  sqlite.exec(`
    CREATE TABLE paper_alert_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_key TEXT NOT NULL UNIQUE,
      paper_signal_id TEXT NOT NULL,
      contract_id TEXT,
      event_type TEXT,
      event_version INTEGER,
      status TEXT NOT NULL,
      transport TEXT NOT NULL,
      destination_label TEXT,
      payload_json TEXT NOT NULL,
      enqueued_at INTEGER NOT NULL,
      acknowledged_at INTEGER,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      read_at INTEGER,
      chat_sent_at INTEGER,
      expires_at INTEGER
    );
  `);
  const db = drizzle(sqlite);
  const ctx = { db: () => db, invalidateQueries: () => { throw new Error("read action must not invalidate queries"); } } as unknown as Ctx;
  return { sqlite, db, ctx };
}

function payload(signalId: string, alertType: "ENTRY_CONFIRMED" | "SETUP_PENDING", issuedAt: string, test: boolean): string {
  return JSON.stringify({ signal_id: signalId, alert_type: alertType, issued_at: issuedAt, test });
}

describe("paper alerts-only watcher read", () => {
  test("returns the same persisted alert rows as the full status alerts projection without writes", async () => {
    const { sqlite, db, ctx } = fixture();
    const firstAt = new Date("2026-10-16T14:01:00.000Z");
    const secondAt = new Date("2026-10-16T14:02:00.000Z");
    await db.insert(schema.paperAlertEvents).values([
      {
        eventKey: "candidate-1:ENTRY_CONFIRMED:v1",
        paperSignalId: "paper_signal_1",
        contractId: "candidate-1",
        eventType: "ENTRY_CONFIRMED",
        eventVersion: 1,
        status: "enqueued",
        transport: "workspace-cron-read-model",
        destinationLabel: "research-side-chat",
        payloadJson: payload("paper_signal_1", "ENTRY_CONFIRMED", firstAt.toISOString(), false),
        enqueuedAt: firstAt,
        acknowledgedAt: null,
        attemptCount: 0,
        lastError: null,
        createdAt: firstAt,
        updatedAt: firstAt,
        readAt: null,
        chatSentAt: null,
        expiresAt: new Date(firstAt.getTime() + 15 * 60_000),
      },
      {
        eventKey: "candidate-2:SETUP_PENDING:v1",
        paperSignalId: "paper_setup_2",
        contractId: "candidate-2",
        eventType: "SETUP_PENDING",
        eventVersion: 1,
        status: "delivered",
        transport: "workspace-cron-read-model",
        destinationLabel: "research-side-chat",
        payloadJson: payload("paper_setup_2", "SETUP_PENDING", secondAt.toISOString(), true),
        enqueuedAt: secondAt,
        acknowledgedAt: new Date(secondAt.getTime() + 5_000),
        attemptCount: 1,
        lastError: null,
        createdAt: secondAt,
        updatedAt: new Date(secondAt.getTime() + 5_000),
        readAt: new Date(secondAt.getTime() + 60_000),
        chatSentAt: null,
        expiresAt: null,
      },
    ]);

    const before = sqlite.query("SELECT * FROM paper_alert_events ORDER BY id").all();
    const underlying = await db.select().from(schema.paperAlertEvents).orderBy(desc(schema.paperAlertEvents.enqueuedAt)).limit(100);
    const fullStatusAlerts = underlying.map(paperAlertReadRow);
    const slim = await readPaperPilotAlerts(ctx);
    const after = sqlite.query("SELECT * FROM paper_alert_events ORDER BY id").all();

    expect(Object.keys(slim)).toEqual(["alerts"]);
    expect(slim.alerts).toEqual(fullStatusAlerts);
    // Stored "enqueued" is projected as "queued" in the read model only.
    expect(slim.alerts.find((row) => row.paperSignalId === "paper_signal_1")?.status).toEqual("queued");
    expect(slim.alerts.find((row) => row.paperSignalId === "paper_setup_2")?.status).toEqual("delivered");
    expect(after).toEqual(before);
    expect(slim.alerts.map((row) => {
      const parsed = JSON.parse(row.payloadJson) as Record<string, unknown>;
      return { signal_id: parsed.signal_id, alert_type: parsed.alert_type, issued_at: parsed.issued_at, test: parsed.test };
    })).toEqual([
      { signal_id: "paper_setup_2", alert_type: "SETUP_PENDING", issued_at: secondAt.toISOString(), test: true },
      { signal_id: "paper_signal_1", alert_type: "ENTRY_CONFIRMED", issued_at: firstAt.toISOString(), test: false },
    ]);
  });
});
