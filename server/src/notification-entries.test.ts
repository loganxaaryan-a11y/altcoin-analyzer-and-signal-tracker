import { describe, expect, test } from "bun:test";
import {
candidateKeyFromPaperEventKey,
collapseNotificationEntries,
predictionEntryKey,
type NotificationHistorySource,
} from "./notification-entries";

// ── 2026-10-28 single-entry notification view acceptance ────────────────
// One entry per prediction (discovery run + candidate), timestamped
// append-only status history inside it, stored rows never rewritten.

type Row = NotificationHistorySource & { title: string };

function paperRow(partial: Partial<Row> & { id: number }): Row {
  return {
    store: "paper_alert",
    dedupKey: "paper-pilot-v2.1.7:paper-pilot-v2.1.7:handoff:212:avalanche-2:setup-pending",
    coinId: null,
    sourceRef: "pending_903",
    eventType: "SETUP_PENDING",
    eventAt: "2026-10-28T07:05:51.649Z",
    storedAt: "2026-10-28T07:05:51.649Z",
    group: "lifecycle",
    read: false,
    readAt: null,
    title: "AVAX · SETUP PENDING",
    ...partial,
  };
}

describe("single-entry key", () => {
  test("paper candidate key is recovered from both lifecycle event keys", () => {
    expect(candidateKeyFromPaperEventKey("paper-pilot-v2.1.7:paper-pilot-v2.1.7:handoff:212:avalanche-2:setup-pending"))
      .toBe("paper-pilot-v2.1.7:paper-pilot-v2.1.7:handoff:212:avalanche-2");
    expect(candidateKeyFromPaperEventKey("paper-pilot-v2.1.7:paper-pilot-v2.1.7:handoff:212:avalanche-2:ENTRY_CONFIRMED:v1"))
      .toBe("paper-pilot-v2.1.7:paper-pilot-v2.1.7:handoff:212:avalanche-2");
  });

  test("the key is run + candidate: same symbol in different runs stays separate", () => {
    const run212 = paperRow({ id: 1 });
    const run213 = paperRow({
      id: 2,
      dedupKey: "paper-pilot-v2.1.7:paper-pilot-v2.1.7:handoff:213:avalanche-2:setup-pending",
    });
    expect(predictionEntryKey(run212)).toBe("prediction:212:avalanche-2");
    expect(predictionEntryKey(run213)).toBe("prediction:213:avalanche-2");
    expect(predictionEntryKey(run212)).not.toBe(predictionEntryKey(run213));
  });

  test("a discovery row and a paper row for the same run + candidate share one key", () => {
    const discovery: Row = {
      store: "discovery", id: 901, dedupKey: "discovery:901", coinId: "avalanche-2",
      sourceRef: "discovery_run:212", eventType: "AWAITING_ISSUANCE",
      eventAt: "2026-10-28T07:00:00.000Z", storedAt: "2026-10-28T07:00:00.000Z",
      group: "lifecycle", read: false, readAt: null, title: "AVAX · awaiting issuance",
    };
    expect(predictionEntryKey(discovery)).toBe("prediction:212:avalanche-2");
    expect(predictionEntryKey(discovery)).toBe(predictionEntryKey(paperRow({ id: 3 })));
  });

  test("engine hits are not predictions and keep their own entry", () => {
    const hit: Row = {
      store: "engine_hit", id: 7, dedupKey: "engine_hit:7", coinId: null,
      sourceRef: "engine_hit:42", eventType: "THEORY_HIT",
      eventAt: "2026-10-28T07:00:00.000Z", storedAt: "2026-10-28T07:00:00.000Z",
      group: "actionable", read: false, readAt: null, title: "Theory hit",
    };
    expect(predictionEntryKey(hit)).toBe("entry:engine-hit:7");
  });
});

describe("collapsed single entry", () => {
  const setup = paperRow({ id: 173 });
  const confirmed = paperRow({
    id: 174,
    dedupKey: "paper-pilot-v2.1.7:paper-pilot-v2.1.7:handoff:212:avalanche-2:ENTRY_CONFIRMED:v1",
    sourceRef: "paper_cea2224c2b1b08259f1f7a77",
    eventType: "ENTRY_CONFIRMED",
    eventAt: "2026-10-28T07:05:52.047Z",
    storedAt: "2026-10-28T07:05:52.047Z",
    title: "AVAX · ENTRY CONFIRMED",
  });

  test("setup-pending + entry-confirmed collapse to ONE entry with a timestamped history", () => {
    // Input arrives newest-first, as the read builds it.
    const collapsed = collapseNotificationEntries([confirmed, setup]);
    expect(collapsed).toHaveLength(1);
    const entry = collapsed[0]!;
    expect(entry.entryKey).toBe("prediction:212:avalanche-2");
    expect(entry.updateCount).toBe(2);
    // Current fields come from the latest stored row.
    expect(entry.id).toBe(174);
    expect(entry.eventType).toBe("ENTRY_CONFIRMED");
    // History is append-only order: oldest first, each with its timestamp
    // and its own (store, id) identity preserved.
    expect(entry.statusHistory).toEqual([
      { store: "paper_alert", id: 173, eventType: "SETUP_PENDING", at: "2026-10-28T07:05:51.649Z", storedAt: "2026-10-28T07:05:51.649Z", group: "lifecycle", read: false },
      { store: "paper_alert", id: 174, eventType: "ENTRY_CONFIRMED", at: "2026-10-28T07:05:52.047Z", storedAt: "2026-10-28T07:05:52.047Z", group: "lifecycle", read: false },
    ]);
    expect(entry.firstStoredAt).toBe("2026-10-28T07:05:51.649Z");
    expect(entry.lastStoredAt).toBe("2026-10-28T07:05:52.047Z");
  });

  test("collapsing never mutates or rewrites the stored rows it presents", () => {
    const rows = [confirmed, setup];
    const snapshot = JSON.stringify(rows);
    collapseNotificationEntries(rows);
    expect(JSON.stringify(rows)).toBe(snapshot);
  });

  test("the entry is read only when every row inside it is read", () => {
    const halfRead = collapseNotificationEntries([{ ...confirmed, read: true, readAt: "2026-10-28T08:00:00.000Z" }, setup]);
    expect(halfRead[0]!.read).toBe(false);
    expect(halfRead[0]!.readAt).toBeNull();
    const allRead = collapseNotificationEntries([
      { ...confirmed, read: true, readAt: "2026-10-28T08:00:00.000Z" },
      { ...setup, read: true, readAt: "2026-10-28T07:30:00.000Z" },
    ]);
    expect(allRead[0]!.read).toBe(true);
    expect(allRead[0]!.readAt).toBe("2026-10-28T08:00:00.000Z");
  });

  test("different predictions never merge, even for the same symbol", () => {
    const other = paperRow({
      id: 200,
      dedupKey: "paper-pilot-v2.1.7:paper-pilot-v2.1.7:handoff:213:avalanche-2:setup-pending",
      storedAt: "2026-10-28T11:05:51.649Z",
      eventAt: "2026-10-28T11:05:51.649Z",
    });
    const collapsed = collapseNotificationEntries([other, confirmed, setup]);
    expect(collapsed).toHaveLength(2);
    expect(collapsed.map((entry) => entry.entryKey).sort()).toEqual([
      "prediction:212:avalanche-2",
      "prediction:213:avalanche-2",
    ]);
  });
});
