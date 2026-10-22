import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { reconcileMeasurement, selectMeasurementBatch, type ReconciliationItem } from "./measurement-recovery";

function database() {
  const db = new Database(":memory:", { strict: true });
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE runs(run_id TEXT PRIMARY KEY, cursor INTEGER NOT NULL, checkpoint_version INTEGER NOT NULL DEFAULT 0, lease_token TEXT, lease_expires_at INTEGER, snapshot_json TEXT NOT NULL);
    CREATE TABLE items(run_id TEXT NOT NULL, signal_id TEXT NOT NULL, ordinal INTEGER NOT NULL, status TEXT NOT NULL, evidence_hash TEXT, history_hash TEXT, PRIMARY KEY(run_id, signal_id), UNIQUE(run_id, ordinal));
    CREATE TABLE revisions(id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, signal_id TEXT NOT NULL, evidence_hash TEXT NOT NULL, payload TEXT NOT NULL, UNIQUE(run_id, signal_id, evidence_hash));
  `);
  return db;
}

const frozen = ["legacy_10", "legacy_11", "legacy_12", "legacy_13"];
const rows = (): ReconciliationItem[] => frozen.map((signalId, membershipOrdinal) => ({ signalId, membershipOrdinal, gradingState: "evaluated", gradingReason: "resolved", tradeState: "open", tradeStateReason: "no terminal trade result" }));

describe("persistent measurement recovery", () => {
  test("unknown explicit run ID is not replaced", () => {
    const db = database();
    const found = db.query("SELECT run_id FROM runs WHERE run_id=?").get("missing");
    expect(found).toBeNull();
    expect(db.query("SELECT COUNT(*) AS n FROM runs").get() as { n: number }).toEqual({ n: 0 });
  });

  test("database uniqueness rejects duplicate IDs and ordinals", () => {
    const db = database();
    db.query("INSERT INTO runs(run_id,cursor,snapshot_json) VALUES (?,?,?)").run("r1", 0, JSON.stringify(frozen));
    db.query("INSERT INTO items(run_id,signal_id,ordinal,status) VALUES (?,?,?,?)").run("r1", "legacy_10", 0, "pending");
    expect(() => db.query("INSERT INTO items(run_id,signal_id,ordinal,status) VALUES (?,?,?,?)").run("r1", "legacy_10", 1, "pending")).toThrow();
    expect(() => db.query("INSERT INTO items(run_id,signal_id,ordinal,status) VALUES (?,?,?,?)").run("r1", "legacy_11", 0, "pending")).toThrow();
  });

  test("interruption after writes before cursor commit retries without revisions or rewrites", () => {
    const db = database();
    db.query("INSERT INTO runs(run_id,cursor,snapshot_json) VALUES (?,?,?)").run("r1", 0, JSON.stringify(frozen));
    const batch = selectMeasurementBatch(frozen, 0, 2, []);
    for (const [ordinal, signalId] of batch.signalIds.entries()) {
      const payload = JSON.stringify({ signalId, verdict: "target", source: "owned OHLC" });
      db.query("INSERT OR IGNORE INTO items(run_id,signal_id,ordinal,status,evidence_hash,history_hash) VALUES (?,?,?,?,?,?)").run("r1", signalId, ordinal, "evaluated", `h-${signalId}`, `immutable-${signalId}`);
      db.query("INSERT OR IGNORE INTO revisions(run_id,signal_id,evidence_hash,payload) VALUES (?,?,?,?)").run("r1", signalId, `h-${signalId}`, payload);
    }
    const before = db.query("SELECT signal_id,evidence_hash,history_hash FROM items ORDER BY signal_id").all();
    const revisionBefore = (db.query("SELECT COUNT(*) AS n FROM revisions").get() as { n: number }).n;
    // Fresh worker sees durable cursor 0 and repeats the same selected IDs.
    const retry = selectMeasurementBatch(frozen, (db.query("SELECT cursor FROM runs WHERE run_id='r1'").get() as { cursor: number }).cursor, 2, []);
    for (const [ordinal, signalId] of retry.signalIds.entries()) {
      const payload = JSON.stringify({ signalId, verdict: "target", source: "owned OHLC" });
      db.query("INSERT OR IGNORE INTO items(run_id,signal_id,ordinal,status,evidence_hash,history_hash) VALUES (?,?,?,?,?,?)").run("r1", signalId, ordinal, "evaluated", `h-${signalId}`, `immutable-${signalId}`);
      db.query("INSERT OR IGNORE INTO revisions(run_id,signal_id,evidence_hash,payload) VALUES (?,?,?,?)").run("r1", signalId, `h-${signalId}`, payload);
    }
    const committed = db.query("UPDATE runs SET cursor=?, checkpoint_version=checkpoint_version+1 WHERE run_id=? AND cursor=? RETURNING cursor").get(retry.nextCursor, "r1", retry.startCursor);
    expect(committed).toEqual({ cursor: 2 });
    expect(db.query("SELECT signal_id,evidence_hash,history_hash FROM items ORDER BY signal_id").all()).toEqual(before);
    expect((db.query("SELECT COUNT(*) AS n FROM revisions").get() as { n: number }).n).toBe(revisionBefore);
  });

  test("lease compare-and-swap serializes independent concurrent triggers and stale cursor commits", () => {
    const db = database();
    db.query("INSERT INTO runs(run_id,cursor,snapshot_json) VALUES (?,?,?)").run("r1", 0, JSON.stringify(frozen));
    const claim = db.query("UPDATE runs SET lease_token=?, lease_expires_at=?, checkpoint_version=checkpoint_version+1 WHERE run_id=? AND checkpoint_version=? AND (lease_token IS NULL OR lease_expires_at < ?) RETURNING checkpoint_version");
    expect(claim.get("worker-a", 2000, "r1", 0, 1000)).toEqual({ checkpoint_version: 1 });
    expect(claim.get("worker-b", 2000, "r1", 0, 1000)).toBeNull();
    expect(db.query("UPDATE runs SET cursor=2, lease_token=NULL WHERE run_id=? AND lease_token=? AND cursor=? RETURNING cursor").get("r1", "worker-a", 0)).toEqual({ cursor: 2 });
    expect(db.query("UPDATE runs SET cursor=2 WHERE run_id=? AND cursor=? RETURNING cursor").get("r1", 0)).toBeNull();
  });

  test("missing, unexpected, duplicate, rolling-window loss, failure, and exclusions remain explicit", () => {
    const expected = frozen.map((signalId, ordinal) => ({ signalId, ordinal }));
    const partial = reconcileMeasurement(expected, rows().slice(0, 3));
    expect(partial.missingIds).toEqual(["legacy_13"]);
    expect(partial.balanced).toBe(false);
    const operational = rows();
    operational[0] = { ...operational[0]!, gradingState: "failed", gradingReason: "provider failed" };
    operational[1] = { ...operational[1]!, gradingState: "excluded", gradingReason: "contract unavailable", tradeState: "unknown" };
    const honest = reconcileMeasurement(expected, operational);
    expect(honest.counts.failed).toBe(1);
    expect(honest.counts.excluded).toBe(1);
    expect(honest.balanced).toBe(true);
    // A selected frozen ID absent from a rolling source read holds the cursor.
    const selected = selectMeasurementBatch(frozen, 2, 2, []);
    const rollingRead = new Set(["legacy_10", "legacy_11", "legacy_12"]);
    const missingSelected = selected.signalIds.filter((id) => !rollingRead.has(id));
    const committedCursor = missingSelected.length ? selected.startCursor : selected.nextCursor;
    expect(missingSelected).toEqual(["legacy_13"]);
    expect(committedCursor).toBe(2);
  });
});
