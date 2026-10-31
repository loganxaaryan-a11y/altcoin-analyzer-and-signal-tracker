import { describe, expect, test } from "bun:test";
import { persistResearchShortlistSnapshot } from "./research-shortlist-snapshot";
import { recordWriteFailure, type WriteFailureCaptureValues } from "./write-failure-capture";

// Mocked getResearchShortlist snapshot tail: an in-memory
// research_shortlist_snapshots store with independently failable insert
// and payload-update steps, plus the real recordWriteFailure wired to a
// mocked capture insert — the same wiring the action handler uses, with
// ctx.db replaced by in-memory steps. `runHandlerTail` mirrors the
// handler: assign snapshotId from the persist result, append the existing
// note when the snapshot could not be stored, return the payload.
function mockShortlistPersistence(opts: { failInsert?: boolean; failUpdate?: boolean; failCapture?: boolean; insertError?: Error } = {}) {
  const state = {
    snapshots: [] as Array<{ id: number; version: string; payloadJson: string }>,
    captures: [] as WriteFailureCaptureValues[],
    invalidated: 0,
    order: [] as string[],
  };
  const payload = {
    version: "research-shortlist-v0.1",
    computedAt: "2026-10-25T00:35:53.000Z",
    snapshotId: null as number | null,
    rows: [{ symbol: "BTC", priority: 6 }, { symbol: "HYPE", priority: 5 }],
    notes: [] as string[],
  };
  const captureInsert = async (values: WriteFailureCaptureValues): Promise<void> => {
    if (opts.failCapture) throw new Error("capture table unavailable");
    state.captures.push(values);
  };
  const runHandlerTail = async () => {
    const persisted = await persistResearchShortlistSnapshot({
      insertSnapshot: async () => {
        state.order.push("insert");
        if (opts.failInsert) throw opts.insertError ?? new Error("snapshot insert failed: database is locked");
        const id = 101;
        state.snapshots.push({ id, version: payload.version, payloadJson: JSON.stringify(payload) });
        return id;
      },
      updatePayload: async (snapshotId) => {
        state.order.push("update");
        if (opts.failUpdate) throw new Error("payload update failed: database disk image is malformed");
        const row = state.snapshots.find((r) => r.id === snapshotId)!;
        row.payloadJson = JSON.stringify({ ...payload, snapshotId });
        state.invalidated += 1;
      },
      capture: async (error, statementKind, snapshotId) => recordWriteFailure(captureInsert, { lane: "research_shortlist", tableName: "research_shortlist_snapshots", statementKind, attemptedKey: snapshotId === null ? payload.computedAt : String(snapshotId), error, context: { version: payload.version } }),
    });
    payload.snapshotId = persisted.snapshotId;
    if (!persisted.stored) payload.notes.push(`Shortlist snapshot could not be stored: ${persisted.error instanceof Error ? persisted.error.message.slice(0, 220) : "snapshot insert failed"} — the computed ranking is returned unsaved.`);
    return payload;
  };
  return { state, payload, runHandlerTail };
}

const longInsertMessage = `insert into "research_shortlist_snapshots" failed — driver detail ${"z".repeat(400)} end-of-detail`;

describe("research shortlist snapshot persistence capture", () => {
  test("insert failure → capture row with verbatim error; ranking still returned with snapshotId null and the note present", async () => {
    const cause = new Error("driver cause: SQLITE_BUSY — database table is locked while writing page 9");
    const insertError = new Error(longInsertMessage, { cause });
    const { state, runHandlerTail } = mockShortlistPersistence({ failInsert: true, insertError });
    const payload = await runHandlerTail();
    // Ranking flow unchanged: computed rows returned, snapshotId null, note present.
    expect(payload.rows).toHaveLength(2);
    expect(payload.snapshotId).toBeNull();
    expect(payload.notes).toHaveLength(1);
    expect(payload.notes[0]).toContain("Shortlist snapshot could not be stored");
    expect(payload.notes[0]).toContain("the computed ranking is returned unsaved");
    expect(state.snapshots).toHaveLength(0);
    expect(state.order).toEqual(["insert"]);
    // Exactly one capture row, verbatim (>220 chars, message + stack + cause chain), no id.
    expect(state.captures).toHaveLength(1);
    const row = state.captures[0]!;
    expect(row.lane).toBe("research_shortlist");
    expect(row.tableName).toBe("research_shortlist_snapshots");
    expect(row.statementKind).toBe("insert");
    expect(row.attemptedKey).toBe(payload.computedAt);
    expect(row.errorText.length).toBeGreaterThan(220);
    expect(row.errorText).toContain(longInsertMessage);
    expect(row.errorText).toContain("driver cause: SQLITE_BUSY");
    expect(row.errorText).toContain("caused by:");
    expect("id" in row).toBe(false);
  });

  test("capture-helper failure does not change the ranking flow", async () => {
    const { state, runHandlerTail } = mockShortlistPersistence({ failInsert: true, failCapture: true });
    const payload = await runHandlerTail();
    expect(payload.rows).toHaveLength(2);
    expect(payload.snapshotId).toBeNull();
    expect(payload.notes).toHaveLength(1);
    expect(payload.notes[0]).toContain("the computed ranking is returned unsaved");
    // The capture insert failed, so no row landed — and nothing else changed.
    expect(state.captures).toHaveLength(0);
    expect(state.snapshots).toHaveLength(0);
  });

  test("payload-update failure → capture row with statementKind update; snapshotId stays assigned and the note is appended", async () => {
    const { state, runHandlerTail } = mockShortlistPersistence({ failUpdate: true });
    const payload = await runHandlerTail();
    expect(payload.snapshotId).toBe(101);
    expect(payload.notes).toHaveLength(1);
    expect(payload.notes[0]).toContain("Shortlist snapshot could not be stored");
    expect(state.order).toEqual(["insert", "update"]);
    expect(state.invalidated).toBe(0);
    expect(state.captures).toHaveLength(1);
    const row = state.captures[0]!;
    expect(row.lane).toBe("research_shortlist");
    expect(row.tableName).toBe("research_shortlist_snapshots");
    expect(row.statementKind).toBe("update");
    expect(row.attemptedKey).toBe("101");
    expect(row.errorText).toContain("payload update failed");
    // The stored row still holds the first-write payload (snapshotId null inside).
    expect(JSON.parse(state.snapshots[0]!.payloadJson).snapshotId).toBeNull();
  });

  test("clean path: insert + update commit, stored payload embeds the snapshotId, no captures, no note", async () => {
    const { state, runHandlerTail } = mockShortlistPersistence();
    const payload = await runHandlerTail();
    expect(payload.snapshotId).toBe(101);
    expect(payload.notes).toHaveLength(0);
    expect(state.order).toEqual(["insert", "update"]);
    expect(state.invalidated).toBe(1);
    expect(state.captures).toHaveLength(0);
    expect(state.snapshots).toHaveLength(1);
    expect(JSON.parse(state.snapshots[0]!.payloadJson).snapshotId).toBe(101);
  });
});
