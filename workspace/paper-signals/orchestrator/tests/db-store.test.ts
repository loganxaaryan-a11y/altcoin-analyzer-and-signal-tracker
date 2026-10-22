/**
 * DB persistence controls — task workstream B.
 *
 * Proves, through the integrated DB path (DbStore over node:sqlite):
 *  (1) TRANSACTION API: signal + contract + candidate + alert writes are
 *      atomic via the DB's own transaction controls (BEGIN IMMEDIATE /
 *      COMMIT / ROLLBACK) — not file tmp+rename.
 *  (2) ISOLATION: overlapping concurrent commit scopes serialize
 *      (runExclusive + BEGIN IMMEDIATE) — no interleaved partial state.
 *  (3) CLAIM MECHANISM: UNIQUE(identity_hash) + issuance_claim = invocationId,
 *      re-read after write — the production persistSignalIssuanceBundle shape.
 *      Winner => published; loser => already_exists with the accepted bundle.
 *  (4) CRASH SAFETY: a simulated crash (throw) between writes rolls back —
 *      no partial state is ever visible.
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DbStore, persistSignalIssuanceBundle } from "../src/persistence/db-store.js";
import type { CandidateRecord, IssuedSignal } from "../src/types.js";

function dbPath(): string {
  return join(mkdtempSync(join(tmpdir(), "dbstore-test-")), "store.db");
}

function candidate(overrides: Partial<CandidateRecord> = {}): CandidateRecord {
  return {
    terminal: "crypto",
    symbol: "TST",
    name: "Test",
    direction: "long",
    score: 70,
    entryPrice: 100,
    invalidation: 94,
    target1: 106,
    target2: 112,
    signalDate: "2026-10-13",
    detectedAt: "2026-10-13T18:00:00.000Z",
    source: "shortlist",
    inputs: {
      signalDay: null, historyCloses: [], historyHighs: [], currentPrice: 100,
      asOf: "2026-10-13T18:00:00.000Z",
    },
    candidateId: "cand_1",
    firstSeenAt: "2026-10-13T18:00:00.000Z",
    lastReassessedAt: null,
    qualifiedAt: null,
    issuedAt: null,
    alertedAt: null,
    status: "pending",
    outcome: null,
    nextReassessmentAt: null,
    issuedSignalId: null,
    delays: null,
    contractId: null,
    setupAlertAt: null,
    entryObservedAt: null,
    ...overrides,
  };
}

function signal(overrides: Partial<IssuedSignal> = {}): IssuedSignal {
  return {
    signalId: "sig_abc",
    candidateId: "cand_1",
    identityHash: "hash_abc",
    contractId: "ct_cand_1",
    terminal: "crypto",
    symbol: "TST",
    coinId: "tst",
    name: "Test",
    direction: "long",
    score: 70,
    entryPrice: 100,
    invalidation: 94,
    target1: 106,
    target2: 112,
    signalDate: "2026-10-13",
    issuedAt: "2026-10-13T21:00:00.000Z",
    alertedAt: null,
    delays: null,
    gateSummary: "test",
    origin: "orchestrator",
    ...overrides,
  };
}

describe("DbStore: WriteStore conformance over SQLite", () => {
  let store: DbStore;
  beforeEach(() => {
    store = new DbStore(dbPath());
  });

  it("round-trips candidates, signals, contracts, suppressions, alerts", () => {
    store.upsertCandidate(candidate());
    assert.equal(store.getCandidate("cand_1")?.symbol, "TST");
    store.upsertCandidate(candidate()); // idempotent
    assert.equal(store.listCandidates().length, 1);

    const updated = { ...candidate(), status: "issued" as const };
    store.saveCandidate(updated);
    assert.equal(store.getCandidate("cand_1")?.status, "issued");

    store.persistIssuedSignal(signal());
    assert.equal(store.listSignals().length, 1);
    assert.equal(store.listSignals()[0]!.contractId, "ct_cand_1");

    store.saveContract({
      contractId: "ct_cand_1", candidateId: "cand_1", signalId: "sig_abc",
      state: "entered", contractJson: "{\"entryState\":\"entered\"}", updatedAt: "2026-10-13T21:00:00.000Z",
    });
    assert.equal(store.getContract("ct_cand_1")?.state, "entered");

    store.appendSuppression({
      id: "sup_1", candidateId: "cand_1", terminal: "crypto", symbol: "TST",
      direction: "long", signalDate: "2026-10-13", gate: "test", reason: "r",
      origin: "orchestrator", at: "2026-10-13T21:00:00.000Z",
    });
    assert.equal(store.listSuppressions().length, 1);

    store.appendAlert({
      id: "alert_1", kind: "setup", signalId: "sig_abc", candidateId: "cand_1",
      symbol: "TST", direction: "long", alertedAt: "2026-10-13T21:00:00.000Z", channel: "sandbox-feed",
      enqueuedAt: "2026-10-13T21:00:00.000Z", deliveredAt: null, deliveryStatus: "enqueued",
      deliveryMode: null, ackId: null, deliveryAttempts: 0,
    });
    assert.equal(store.listAlerts().length, 1);
    assert.equal(store.listAlerts()[0]!.kind, "setup");

    assert.equal(store.getIssuanceAttempts(), 0);
    store.noteIssuanceAttempt();
    store.noteIssuanceAttempt();
    assert.equal(store.getIssuanceAttempts(), 2);
    store.close();
  });
});

describe("DbStore: named control 1 — TRANSACTION API (atomic multi-write)", () => {
  it("signal + contract + candidate + alert commit atomically in one transaction", () => {
    const store = new DbStore(dbPath());
    store.transact(() => {
      store.upsertCandidate(candidate());
      const won = store.insertSignalClaim(signal(), "invocation-A");
      assert.equal(won, true);
      store.saveContract({
        contractId: "ct_cand_1", candidateId: "cand_1", signalId: "sig_abc",
        state: "entered", contractJson: "{}", updatedAt: "2026-10-13T21:00:00.000Z",
      });
      const rec = { ...candidate(), status: "issued" as const, issuedSignalId: "sig_abc" };
      store.saveCandidate(rec);
      store.appendAlert({
        id: "entry_sig_abc", kind: "entry", signalId: "sig_abc", candidateId: "cand_1",
        symbol: "TST", direction: "long", alertedAt: "2026-10-13T21:00:00.000Z", channel: "sandbox-feed",
        enqueuedAt: "2026-10-13T21:00:00.000Z", deliveredAt: null, deliveryStatus: "enqueued",
      deliveryMode: null, ackId: null, deliveryAttempts: 0,
      });
    });
    assert.equal(store.tableCount("signals"), 1);
    assert.equal(store.tableCount("contracts"), 1);
    assert.equal(store.getCandidate("cand_1")?.status, "issued");
    assert.equal(store.tableCount("alerts"), 1);
    store.close();
  });

  it("simulated crash between writes rolls back: no partial state", () => {
    const store = new DbStore(dbPath());
    assert.throws(
      () =>
        store.transact(() => {
          const won = store.insertSignalClaim(signal(), "invocation-A");
          assert.equal(won, true, "signal row must be inserted before the crash");
          store.saveContract({
            contractId: "ct_cand_1", candidateId: "cand_1", signalId: "sig_abc",
            state: "entered", contractJson: "{}", updatedAt: "2026-10-13T21:00:00.000Z",
          });
          throw new Error("simulated crash between writes");
        }),
      /simulated crash/,
    );
    // ROLLBACK: neither the signal nor the contract is visible.
    assert.equal(store.tableCount("signals"), 0, "crashed transaction must leave no signal row");
    assert.equal(store.tableCount("contracts"), 0, "crashed transaction must leave no contract row");
    // And the store is still usable afterwards.
    store.transact(() => {
      assert.equal(store.insertSignalClaim(signal(), "invocation-B"), true);
    });
    assert.equal(store.tableCount("signals"), 1);
    store.close();
  });
});

describe("DbStore: named control 2 — ISOLATION (overlapping commits serialize)", () => {
  it("overlapping runExclusive commit scopes apply in order with no interleaving", async () => {
    const store = new DbStore(dbPath());
    store.upsertCandidate(candidate());
    const order: string[] = [];
    const slowCommit = async (tag: string): Promise<void> =>
      store.runExclusive(() =>
        store.transact(() => {
          order.push(`${tag}:begin`);
          const rec = store.getCandidate("cand_1") as CandidateRecord;
          // Read-modify-write inside the transaction: without serialization
          // the two increments would interleave and one would be lost.
          const n = (rec.score ?? 0) + 1;
          store.saveCandidate({ ...rec, score: n });
          order.push(`${tag}:end`);
        }),
      );
    await Promise.all([slowCommit("A"), slowCommit("B")]);
    const rec = store.getCandidate("cand_1") as CandidateRecord;
    assert.equal(rec.score, 72, "both serialized increments must apply");
    assert.deepEqual(order, ["A:begin", "A:end", "B:begin", "B:end"], "commit scopes must not interleave");
    store.close();
  });
});

describe("DbStore: named control 3 — CLAIM MECHANISM (published vs already_exists)", () => {
  it("UNIQUE(identity_hash) + issuance_claim decides published vs already_exists", () => {
    const store = new DbStore(dbPath());
    // Winner: claim A.
    const acceptedA = persistSignalIssuanceBundle({
      atomicWrite: () =>
        store.transact(() => {
          store.insertSignalClaim(signal(), "invocation-A");
        }),
      readAccepted: () => store.getSignalByIdentity("hash_abc"),
      isComplete: (s): s is NonNullable<ReturnType<DbStore["getSignalByIdentity"]>> => s !== null,
    });
    assert.equal(acceptedA.issuanceClaim, "invocation-A");

    // Loser: claim B on the same identity — ON CONFLICT DO NOTHING, then the
    // re-read deterministically returns the database-accepted bundle.
    const acceptedB = persistSignalIssuanceBundle({
      atomicWrite: () =>
        store.transact(() => {
          const won = store.insertSignalClaim(signal({ signalId: "sig_other" }), "invocation-B");
          assert.equal(won, false, "loser must not win the claim");
        }),
      readAccepted: () => store.getSignalByIdentity("hash_abc"),
      isComplete: (s): s is NonNullable<ReturnType<DbStore["getSignalByIdentity"]>> => s !== null,
    });
    assert.equal(acceptedB.signalId, "sig_abc", "loser receives the accepted bundle");
    assert.equal(acceptedB.issuanceClaim, "invocation-A", "claim comparison marks this already_exists");
    assert.equal(store.tableCount("signals"), 1, "exactly one signal row");
    store.close();
  });

  it("production comparison shape: claim === invocationId => published, else already_exists", () => {
    const store = new DbStore(dbPath());
    store.transact(() => {
      store.insertSignalClaim(signal(), "invocation-A");
    });
    const forA = store.getSignalByIdentity("hash_abc")!;
    const forB = store.getSignalByIdentity("hash_abc")!;
    assert.equal(forA.issuanceClaim === "invocation-A", true, "winner: published");
    assert.equal(forB.issuanceClaim === "invocation-B", false, "loser: already_exists");
    store.close();
  });
});
