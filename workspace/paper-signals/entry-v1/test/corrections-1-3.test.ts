/**
 * actionable-entry-v1 — corrections 1–3 regression tests (sandbox).
 * Run: compile with tsc, then `node dist/test/corrections-1-3.test.js`.
 *
 * Correction 1 (3 tests): enterContract rejects at the API boundary —
 *   (a) evidence "unavailable" carrying a fill price (anti-fabrication),
 *   (b) receipt-before-observation (causality violation),
 *   (c) entry observation timestamped before the contract was issued.
 * Correction 2 (5 tests): qualification/entry separation —
 *   pending contract carries no entry fields; observation before
 *   pending-contract creation is rejected; happy path pending → entered;
 *   expiry path; drift-invalidation path.
 * Correction 3 (4 tests): actual decision time —
 *   late-running scans record the scan time (not the bar close) as
 *   decisionAt; an entry print predating decisionAt is rejected with
 *   reason "entry-before-decision".
 */
import assert from "node:assert";
import {
  ContractError,
  ENTRY_REJECTION_REASON,
  buildContract,
  enterContract,
} from "../src/contract.js";
import type { ContractInput, EntryObservation } from "../src/contract.js";
import { issueCryptoEntryContract, issueEquityEntryContract } from "../src/entry-rules.js";
import {
  buildPendingContract,
  observeEntry,
} from "../src/pending.js";
import type { CandidateIdentity, PendingQualification } from "../src/pending.js";

let passed = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`ok - ${name}`);
  } catch (e) {
    console.error(`FAIL - ${name}`);
    console.error(e);
    process.exitCode = 1;
  }
}

function expectRejectionCode(fn: () => void, code: string) {
  assert.throws(
    fn,
    (e: unknown) => e instanceof ContractError && e.reasonCode === code,
    `expected rejection with reasonCode ${code}`,
  );
}

// ---------------------------------------------------------------- fixtures
const T0 = "2026-10-13T09:00:00.000Z";
const t0ms = Date.parse(T0);
const iso = (ms: number) => new Date(ms).toISOString();

function cryptoContractInput(decisionAt: string, signalId: string | number = "C-1"): ContractInput {
  return {
    terminal: "crypto",
    signalId,
    strategyId: "crypto-dossier-factor-agreement",
    strategyVersion: "frozen-2026-10-12",
    parameterHash: "sha256:test",
    decisionAt,
    decisionClock: "server-utc",
    decisionPrice: 100,
    sourceObservedAt: T0, // the source bar close — distinct from a late decision instant
    sourceObservationWindow: null,
    entryRule: "first-post-decision-binance-spot-trade",
    entryVenue: "binance-spot",
    entryWindowOpensAt: decisionAt,
    entryWindowExpiresAt: iso(Date.parse(decisionAt) + 15 * 60_000),
    invalidationPrice: 93.75,
    target1Price: 109.375,
    target2Price: 115.625,
    riskPerUnit: 6.25,
    horizonUnit: "elapsed_days",
    primaryHorizon: 30,
    evaluatorCompatibility: "test",
    issuedBy: "test",
    issuedAt: iso(Date.parse(decisionAt) + 5_000),
    driftCapPct: 1.5,
  };
}

function cryptoQualification(decisionAt: string): {
  candidate: CandidateIdentity;
  qualification: PendingQualification;
} {
  return {
    candidate: { candidateId: "cand-1", terminal: "crypto", symbol: "BTC" },
    qualification: {
      decisionAt,
      qualificationReason: "test qualification",
      contractInput: cryptoContractInput(decisionAt),
    },
  };
}

function validCryptoObs(decisionAt: string, price = 100.4): EntryObservation {
  const dms = Date.parse(decisionAt);
  return {
    entryObservedAt: iso(dms + 60_000),
    entryReceivedAt: iso(dms + 65_000),
    entryPrice: price,
    evidence: "venue-trade",
  };
}

// ============================================================ correction 1
test("C1(a): evidence 'unavailable' carrying a fill price is rejected at the boundary", () => {
  const c = buildContract(cryptoContractInput(T0));
  const obs = validCryptoObs(T0);
  const fabricated = { ...obs, evidence: "unavailable" as unknown as "venue-trade" };
  expectRejectionCode(
    () => enterContract(c, fabricated),
    ENTRY_REJECTION_REASON.evidenceUnavailableWithFill,
  );
  // The contract itself is untouched by the rejected attempt.
  assert.equal(c.entryState, "pending");
  assert.equal(c.entryPrice, null);
});

test("C1(b): receipt-before-observation (causality violation) is rejected", () => {
  const c = buildContract(cryptoContractInput(T0));
  const obs: EntryObservation = {
    entryObservedAt: iso(t0ms + 60_000),
    entryReceivedAt: iso(t0ms + 30_000), // received BEFORE observed — impossible
    entryPrice: 100.4,
    evidence: "venue-trade",
  };
  expectRejectionCode(
    () => enterContract(c, obs),
    ENTRY_REJECTION_REASON.receiptBeforeObservation,
  );
});

test("C1(c): entry observation timestamped before the contract was issued is rejected", () => {
  const c = buildContract(cryptoContractInput(T0)); // issuedAt = T0 + 5s
  const obs: EntryObservation = {
    entryObservedAt: iso(t0ms + 3_000), // after decision, before issuance
    entryReceivedAt: iso(t0ms + 10_000),
    entryPrice: 100.4,
    evidence: "venue-trade",
  };
  expectRejectionCode(
    () => enterContract(c, obs),
    ENTRY_REJECTION_REASON.observationBeforeIssuance,
  );
});

// ============================================================ correction 2
test("C2: pending contract carries no entry fields — entry explicitly unset", () => {
  const { candidate, qualification } = cryptoQualification(T0);
  const pending = buildPendingContract(candidate, qualification);
  assert.equal(pending.entryState, "pending");
  assert.equal(pending.entryPrice, null);
  assert.equal(pending.entryObservedAt, null);
  assert.equal(pending.entryReceivedAt, null);
  assert.equal(pending.driftObservedPct, null);
  assert.equal(pending.entryEvidence, "unavailable");
  assert.ok(Object.isFrozen(pending));
});

test("C2: entry observation before pending-contract creation is rejected", () => {
  // DURABILITY (2026-10-13): the in-memory pending registry is gone. A
  // contract with entryState "pending" and entry fields explicitly empty is
  // observable even when it was never registered in this process — that is
  // exactly the post-restart case (parsed back from the persisted DB row).
  const unregistered = buildContract(cryptoContractInput(T0, "C-2"));
  assert.equal(unregistered.entryState, "pending");
  const event = observeEntry(unregistered, validCryptoObs(T0), () => iso(t0ms + 120_000));
  assert.equal(event.outcome, "entered");
});

test("C2: a contract claiming pending but carrying entry fields is rejected", () => {
  // Structural invariant: "pending" + non-empty entry fields is incoherent.
  const { candidate, qualification } = cryptoQualification(T0);
  const pending = buildPendingContract(candidate, qualification);
  const tampered = { ...pending, entryPrice: 100.4 }; // entryState still "pending"
  expectRejectionCode(
    () => observeEntry(tampered, validCryptoObs(T0), () => iso(t0ms + 120_000)),
    "pending-carries-fill",
  );
});

test("C2: a terminal (non-pending) contract is rejected", () => {
  const { candidate, qualification } = cryptoQualification(T0);
  const pending = buildPendingContract(candidate, qualification);
  const entered = observeEntry(pending, validCryptoObs(T0), () => iso(t0ms + 120_000)).resultingContract;
  assert.equal(entered.entryState, "entered");
  expectRejectionCode(
    () => observeEntry(entered, validCryptoObs(T0), () => iso(t0ms + 120_000)),
    "contract-not-pending",
  );
});

test("C2: full happy path — qualify → pending → observe → entered (distinct event timestamp)", () => {
  const { candidate, qualification } = cryptoQualification(T0);
  const pending = buildPendingContract(candidate, qualification);
  const recordedAt = iso(t0ms + 120_000);
  const event = observeEntry(pending, validCryptoObs(T0), () => recordedAt);

  assert.equal(event.outcome, "entered");
  assert.equal(event.resultingContract.entryState, "entered");
  assert.equal(event.resultingContract.entryPrice, 100.4);
  assert.equal(event.resultingContract.entryEvidence, "venue-trade");
  // The observation event is distinct from the venue print: own timestamp.
  assert.equal(event.eventRecordedAt, recordedAt);
  assert.notEqual(event.eventRecordedAt, event.entryObservedAt);
  assert.equal(event.entryObservedAt, iso(t0ms + 60_000));
  assert.equal(event.voidReason, null);
});

test("C2: expiry path — print after the window expires → expired, never a fill", () => {
  const { candidate, qualification } = cryptoQualification(T0);
  const pending = buildPendingContract(candidate, qualification);
  const lateObs: EntryObservation = {
    entryObservedAt: iso(t0ms + 20 * 60_000), // window is 15 min
    entryReceivedAt: iso(t0ms + 20 * 60_000 + 5_000),
    entryPrice: 100.4,
    evidence: "venue-trade",
  };
  const event = observeEntry(pending, lateObs, () => iso(t0ms + 21 * 60_000));
  assert.equal(event.outcome, "expired");
  assert.equal(event.resultingContract.entryState, "void_expired");
  assert.equal(event.resultingContract.entryPrice, null); // no fill fabricated
  assert.ok(event.voidReason!.length > 0);
});

test("C2: drift path — print outside the cap → invalidated (void_drift)", () => {
  const { candidate, qualification } = cryptoQualification(T0);
  const pending = buildPendingContract(candidate, qualification);
  const event = observeEntry(pending, validCryptoObs(T0, 103.0), () => iso(t0ms + 120_000)); // +3% > 1.5%
  assert.equal(event.outcome, "invalidated");
  assert.equal(event.resultingContract.entryState, "void_drift");
  assert.equal(event.resultingContract.entryPrice, null);
});

// ============================================================ correction 3
test("C3: equity late scan — decisionAt is the scan time, not the bar close", () => {
  // Session close (source bar): 2026-10-09 16:00 EDT = 20:00Z. Scan ran 45 min later.
  const scanTime = "2026-10-09T20:45:00.000Z";
  const { contract, nextSession } = issueEquityEntryContract({
    signalId: "EQ-C3",
    strategyId: "equity-factor-agreement",
    strategyVersion: "v",
    parameterHash: "h",
    signalDate: "2026-10-09",
    decisionAt: scanTime, // the actual decision instant
    decisionPrice: 100,
    invalidationPrice: 96,
    target1Price: 106,
    target2Price: 110,
    riskPerUnit: 4,
    issuedBy: "b",
    issuedAt: "2026-10-09T21:00:00Z",
  });
  assert.equal(contract.decisionAt, scanTime); // NOT the 20:00Z bar close
  assert.equal(contract.sourceObservedAt, "2026-10-09T20:00:00.000Z"); // the bar close stays the source observation
  assert.notEqual(contract.decisionAt, contract.sourceObservedAt);
  assert.equal(nextSession, "2026-10-12"); // entry window unchanged (Monday open)
});

test("C3: crypto late scan — decisionAt is the scan time, source bar close stays separate", () => {
  const barClose = "2026-10-13T09:00:00.000Z";
  const scanTime = iso(Date.parse(barClose) + 45 * 60_000); // scan ran 45 min after bar close
  const c = issueCryptoEntryContract({
    signalId: 77,
    strategyId: "crypto-dossier-factor-agreement",
    strategyVersion: "v",
    parameterHash: "h",
    decisionAt: scanTime,
    decisionPrice: 100,
    decisionSourceObservedAt: barClose,
    invalidationPrice: 93.75,
    target1Price: null,
    target2Price: null,
    riskPerUnit: 6.25,
    issuedBy: "b",
    issuedAt: iso(Date.parse(scanTime) + 5_000),
  });
  assert.equal(c.decisionAt, scanTime);
  assert.equal(c.sourceObservedAt, barClose);
  assert.notEqual(c.decisionAt, c.sourceObservedAt);
});

test("C3: entry print predating decisionAt is rejected with reason 'entry-before-decision'", () => {
  // Late scan decided at 09:45; the only available print is the 09:31 opening
  // print that already happened — it cannot be claimed as this contract's entry.
  const decisionAt = iso(t0ms + 45 * 60_000);
  const { candidate, qualification } = cryptoQualification(decisionAt);
  const pending = buildPendingContract(candidate, qualification);
  const staleObs: EntryObservation = {
    entryObservedAt: iso(t0ms + 31 * 60_000), // before decisionAt
    entryReceivedAt: iso(t0ms + 46 * 60_000),
    entryPrice: 100.4,
    evidence: "venue-trade",
  };
  // Boundary rejection …
  expectRejectionCode(
    () => enterContract(pending, staleObs),
    ENTRY_REJECTION_REASON.entryBeforeDecision,
  );
  // … and observeEntry propagates it (never recorded as a business outcome).
  expectRejectionCode(
    () => observeEntry(pending, staleObs, () => iso(t0ms + 47 * 60_000)),
    ENTRY_REJECTION_REASON.entryBeforeDecision,
  );
});

test("C3: equity decisionAt is bounded — not before the bar close, not at/after the entry open", () => {
  const base = {
    signalId: "EQ-C3B", strategyId: "equity-factor-agreement", strategyVersion: "v",
    parameterHash: "h", signalDate: "2026-10-09", decisionPrice: 100,
    invalidationPrice: 96, target1Price: null, target2Price: null, riskPerUnit: 4,
    issuedBy: "b", issuedAt: "2026-10-13T13:40:00Z",
  };
  // Before the session close (20:00Z): the close does not exist yet.
  assert.throws(
    () => issueEquityEntryContract({ ...base, decisionAt: "2026-10-09T19:30:00.000Z" }),
    /precedes the session close/,
  );
  // At/after the next session open (2026-10-12T13:30:00Z): the decision must precede any entry print.
  assert.throws(
    () => issueEquityEntryContract({ ...base, decisionAt: "2026-10-12T13:30:00.000Z" }),
    /precede any entry print/,
  );
  // Omitted decisionAt keeps the legacy fallback (session-bounds end).
  const { contract } = issueEquityEntryContract(base);
  assert.equal(contract.decisionAt, "2026-10-09T20:00:00.000Z");
});

console.log(`\n${passed} tests passed${process.exitCode ? " (WITH FAILURES)" : ""}`);
