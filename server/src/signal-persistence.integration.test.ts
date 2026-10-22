import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { getTableName } from "drizzle-orm";
import * as productionSchema from "./schema";
import { persistSignalIssuanceBundle } from "./issuance-persistence";

const snapshotTable = getTableName(productionSchema.signalInputSnapshots);
const contractTable = getTableName(productionSchema.signalContracts);
const generatedTable = getTableName(productionSchema.generatedSignals);
const paths: string[] = [];
afterEach(() => { for (const path of paths.splice(0)) { try { rmSync(path); rmSync(`${path}-wal`); rmSync(`${path}-shm`); } catch { /* already removed */ } } });

function isolatedPath() {
  const path = `/tmp/crypto-final-signoff-${randomUUID()}.sqlite`;
  paths.push(path);
  const db = new Database(path, { create: true });
  db.run("PRAGMA journal_mode=WAL");
  db.run("PRAGMA busy_timeout=5000");
  // Production table names and persistence columns are taken from server/src/schema.ts.
  db.run(`CREATE TABLE ${snapshotTable}(id INTEGER PRIMARY KEY, snapshot_hash TEXT NOT NULL UNIQUE, payload_json TEXT NOT NULL)`);
  db.run(`CREATE TABLE ${contractTable}(signal_id TEXT PRIMARY KEY, idempotency_key TEXT NOT NULL UNIQUE, input_snapshot_id INTEGER NOT NULL REFERENCES ${snapshotTable}(id), legacy_signal_id INTEGER, issuance_state TEXT NOT NULL CHECK(issuance_state IN ('pending','complete','failed')))`);
  db.run(`CREATE TABLE ${generatedTable}(id INTEGER PRIMARY KEY AUTOINCREMENT, issuance_key TEXT NOT NULL UNIQUE, entry REAL NOT NULL)`);
  db.close();
  return path;
}

function connection(path: string) {
  const db = new Database(path);
  db.run("PRAGMA busy_timeout=5000");
  return db;
}

type Accepted = { signalId: string; issuanceState: string; inputSnapshotId: number; legacySignalId: number | null; snapshotHash: string };
function persistenceAdapter(db: Database, args: { issuanceKey: string; snapshotId: number; snapshotHash: string; failAfter?: 1 | 2 | 3 | 4 | 5; beforeAtomic?: () => Promise<void> }) {
  const readAccepted = async (): Promise<Accepted | null> => {
    const row = db.query(`SELECT c.signal_id,c.issuance_state,c.input_snapshot_id,c.legacy_signal_id,s.snapshot_hash FROM ${contractTable} c JOIN ${snapshotTable} s ON s.id=c.input_snapshot_id WHERE c.idempotency_key=?`).get(args.issuanceKey) as Record<string, unknown> | null;
    return row ? { signalId: String(row.signal_id), issuanceState: String(row.issuance_state), inputSnapshotId: Number(row.input_snapshot_id), legacySignalId: row.legacy_signal_id === null ? null : Number(row.legacy_signal_id), snapshotHash: String(row.snapshot_hash) } : null;
  };
  const atomicWrite = async () => {
    await args.beforeAtomic?.();
    db.transaction(() => {
      db.run(`INSERT OR IGNORE INTO ${snapshotTable}(id,snapshot_hash,payload_json) VALUES(?,?,?)`, [args.snapshotId, args.snapshotHash, JSON.stringify({ syntheticFixture: true, hash: args.snapshotHash })]);
      if (args.failAfter === 1) throw new Error("injected-after-snapshot");
      db.run(`INSERT OR IGNORE INTO ${contractTable}(signal_id,idempotency_key,input_snapshot_id,issuance_state) VALUES(?,?,?,'pending')`, [`sig-${args.issuanceKey}`, args.issuanceKey, args.snapshotId]);
      if (args.failAfter === 2) throw new Error("injected-after-contract");
      db.run(`INSERT OR IGNORE INTO ${generatedTable}(issuance_key,entry) VALUES(?,100)`, [args.issuanceKey]);
      if (args.failAfter === 3) throw new Error("injected-after-generated");
      db.run(`UPDATE ${contractTable} SET legacy_signal_id=(SELECT id FROM ${generatedTable} WHERE issuance_key=?), issuance_state='complete' WHERE idempotency_key=? AND EXISTS(SELECT 1 FROM ${generatedTable} WHERE issuance_key=?)`, [args.issuanceKey, args.issuanceKey, args.issuanceKey]);
      if (args.failAfter === 4) throw new Error("injected-after-link");
      db.run(`DELETE FROM ${snapshotTable} WHERE id=? AND NOT EXISTS(SELECT 1 FROM ${contractTable} WHERE input_snapshot_id=?)`, [args.snapshotId, args.snapshotId]);
      if (args.failAfter === 5) throw new Error("injected-after-loser-cleanup");
    })();
  };
  return { atomicWrite, readAccepted };
}

function counts(db: Database) {
  return db.query(`SELECT (SELECT count(*) FROM ${snapshotTable}) snapshots,(SELECT count(*) FROM ${contractTable}) contracts,(SELECT count(*) FROM ${generatedTable}) generated,(SELECT count(*) FROM ${contractTable} WHERE issuance_state='complete' AND legacy_signal_id IS NOT NULL) complete`).get() as { snapshots: number; contracts: number; generated: number; complete: number };
}

function barrier(participants: number) {
  let arrived = 0; let release!: () => void;
  const open = new Promise<void>((resolve) => { release = resolve; });
  return async () => { arrived += 1; if (arrived === participants) release(); await open; };
}

describe("final signoff production persistence boundary", () => {
  for (const boundary of [1, 2, 3, 4, 5] as const) test(`fault after production write boundary ${boundary} rolls back and retry returns one accepted bundle`, async () => {
    const path = isolatedPath(); const db = connection(path);
    await expect(persistSignalIssuanceBundle(persistenceAdapter(db, { issuanceKey: "same", snapshotId: 1, snapshotHash: "accepted", failAfter: boundary }))).rejects.toThrow();
    expect(counts(db)).toEqual({ snapshots: 0, contracts: 0, generated: 0, complete: 0 });
    const accepted = await persistSignalIssuanceBundle(persistenceAdapter(db, { issuanceKey: "same", snapshotId: 1, snapshotHash: "accepted" }));
    expect(accepted).toMatchObject({ issuanceState: "complete", inputSnapshotId: 1, snapshotHash: "accepted" });
    expect(counts(db)).toEqual({ snapshots: 1, contracts: 1, generated: 1, complete: 1 });
    db.close();
  });

  test("independently interleaved identical requests on separate connections return the same bundle", async () => {
    const path = isolatedPath(); const left = connection(path); const right = connection(path); const meet = barrier(2);
    const [a, b] = await Promise.all([
      persistSignalIssuanceBundle(persistenceAdapter(left, { issuanceKey: "same", snapshotId: 1, snapshotHash: "accepted", beforeAtomic: meet })),
      persistSignalIssuanceBundle(persistenceAdapter(right, { issuanceKey: "same", snapshotId: 1, snapshotHash: "accepted", beforeAtomic: meet })),
    ]);
    expect(a).toEqual(b);
    expect(counts(left)).toEqual({ snapshots: 1, contracts: 1, generated: 1, complete: 1 });
    left.close(); right.close();
  });

  test("interleaved competing snapshots return the original accepted linkage and remove loser snapshot", async () => {
    const path = isolatedPath(); const first = connection(path); const second = connection(path); const meet = barrier(2);
    const [a, b] = await Promise.all([
      persistSignalIssuanceBundle(persistenceAdapter(first, { issuanceKey: "same", snapshotId: 1, snapshotHash: "accepted", beforeAtomic: meet })),
      persistSignalIssuanceBundle(persistenceAdapter(second, { issuanceKey: "same", snapshotId: 2, snapshotHash: "competing", beforeAtomic: meet })),
    ]);
    expect(a.inputSnapshotId).toBe(b.inputSnapshotId);
    expect(a.snapshotHash).toBe(b.snapshotHash);
    expect(["accepted", "competing"]).toContain(a.snapshotHash);
    expect(counts(first)).toEqual({ snapshots: 1, contracts: 1, generated: 1, complete: 1 });
    first.close(); second.close();
  });
});
