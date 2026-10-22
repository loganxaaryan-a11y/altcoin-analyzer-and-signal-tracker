/**
 * actionable-entry-v1 — test suite (sandbox).
 * Run: compile with tsc, then `node dist/test/entry-v1.test.js`.
 */
import assert from "node:assert";
import {
  CONTRACT_VERSION,
  ContractError,
  buildContract,
  deriveCohortId,
  enterContract,
  markEvidenceUnavailable,
  voidContract,
} from "../src/contract.js";
import {
  DEFAULT_UNGROUNDED_PARAMS,
  etWallToUtcIso,
  isXnysSession,
  issueCryptoEntryContract,
  issueEquityEntryContract,
  nextXnysSession,
  resolveCryptoEntry,
  resolveCryptoEntryDegraded,
  resolveEquityEntry,
  xnysSessionBounds,
} from "../src/entry-rules.js";
import {
  auditVetoStopAlignment,
  buildAtrLevels,
  derivePublishedLevels,
  publishDecisionLevels,
  validatePublishedLevels,
  withRefreshedQuote,
} from "../src/levels.js";
import {
  LEGACY_EQUITY_ENTRY_RULE_RE,
  assertLegacyUntouched,
  freezeLegacy,
  isLegacyEquityEntryRule,
  refuseBackfill,
} from "../src/legacy.js";

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

// ---------------------------------------------------------------- contract
test("contract construction: equity pending contract carries all frozen fields", () => {
  const { contract, nextSession } = issueEquityEntryContract({
    signalId: "EQ-1",
    strategyId: "equity-factor-agreement",
    strategyVersion: "frozen-2026-10-12",
    parameterHash: "sha256:abc",
    signalDate: "2026-10-09", // Friday
    decisionPrice: 100,
    invalidationPrice: 96,
    target1Price: 106,
    target2Price: 110,
    riskPerUnit: 4,
    issuedBy: "sandbox-build-1",
    issuedAt: "2026-10-09T21:00:00Z",
  });
  assert.equal(contract.contractVersion, CONTRACT_VERSION);
  assert.equal(contract.contractVersion, "actionable-entry-v1");
  assert.equal(contract.entryState, "pending");
  assert.equal(contract.supersedes, null);
  assert.equal(contract.entryPrice, null);
  assert.equal(contract.driftObservedPct, null);
  assert.equal(contract.observationDegraded, false);
  assert.equal(contract.entryRule, "next-xnys-regular-session-open-print");
  assert.equal(contract.decisionClock, "xnys-session-close");
  assert.equal(contract.driftCapPct, 0.5);
  assert.equal(contract.horizonUnit, "trading_sessions");
  assert.equal(contract.cohortId, "actionable-entry-v1:equity:trading_sessions:30");
  assert.equal(contract.entryEvidence, "unavailable");
  assert.ok(Object.isFrozen(contract));
  assert.equal(nextSession, "2026-10-12"); // Friday decision -> Monday entry
});

test("equity decisionAt uses session-bounds end (16:00 EDT Friday)", () => {
  const { contract } = issueEquityEntryContract({
    signalId: "EQ-2", strategyId: "equity-factor-agreement", strategyVersion: "v",
    parameterHash: "h", signalDate: "2026-10-09", decisionPrice: 100,
    invalidationPrice: 96, target1Price: 106, target2Price: 110, riskPerUnit: 4,
    issuedBy: "b", issuedAt: "2026-10-09T21:00:00Z",
  });
  assert.equal(contract.decisionAt, "2026-10-09T20:00:00.000Z"); // 16:00 EDT
  assert.equal(contract.entryWindowOpensAt, "2026-10-12T13:30:00.000Z"); // Mon 09:30 EDT
  assert.equal(contract.sourceObservationWindow!.start, "2026-10-09T13:30:00.000Z");
});

test("equity early-close fix: 13:00 ET decision, not hardcoded 16:00", () => {
  const bounds = xnysSessionBounds("2025-11-28"); // day after Thanksgiving
  assert.equal(bounds.earlyClose, true);
  assert.equal(bounds.end, "2025-11-28T18:00:00.000Z"); // 13:00 EST
  const { contract } = issueEquityEntryContract({
    signalId: "EQ-3", strategyId: "equity-factor-agreement", strategyVersion: "v",
    parameterHash: "h", signalDate: "2025-11-28", decisionPrice: 50,
    invalidationPrice: 48, target1Price: 53, target2Price: 55, riskPerUnit: 2,
    issuedBy: "b", issuedAt: "2025-11-28T19:00:00Z",
  });
  assert.equal(contract.decisionAt, "2025-11-28T18:00:00.000Z");
});

test("equity entry: open print at session-open boundary inside drift -> entered", () => {
  const { contract } = issueEquityEntryContract({
    signalId: "EQ-4", strategyId: "equity-factor-agreement", strategyVersion: "v",
    parameterHash: "h", signalDate: "2026-10-09", decisionPrice: 100,
    invalidationPrice: 96, target1Price: 106, target2Price: 110, riskPerUnit: 4,
    issuedBy: "b", issuedAt: "2026-10-09T21:00:00Z",
  });
  const done = resolveEquityEntry(contract, {
    price: 100.3, // +0.30% inside 0.50% cap
    observedAt: contract.entryWindowOpensAt,
    receivedAt: "2026-10-12T13:31:00Z",
    extendedHours: false,
  });
  assert.equal(done.entryState, "entered");
  assert.equal(done.entryPrice, 100.3);
  assert.ok(Math.abs(done.driftObservedPct! - 0.3) < 1e-9);
  assert.equal(done.entryEvidence, "venue-trade");
  // invalidation frozen at decision through entry
  assert.equal(done.invalidationPrice, 96);
});

test("equity drift beyond cap -> void_drift, never scored as a fill", () => {
  const { contract } = issueEquityEntryContract({
    signalId: "EQ-5", strategyId: "equity-factor-agreement", strategyVersion: "v",
    parameterHash: "h", signalDate: "2026-10-09", decisionPrice: 100,
    invalidationPrice: 96, target1Price: 106, target2Price: 110, riskPerUnit: 4,
    issuedBy: "b", issuedAt: "2026-10-09T21:00:00Z",
  });
  const done = resolveEquityEntry(contract, {
    price: 101.2, // +1.2% > 0.50% cap
    observedAt: contract.entryWindowOpensAt,
    receivedAt: "2026-10-12T13:31:00Z",
    extendedHours: false,
  });
  assert.equal(done.entryState, "void_drift");
  assert.equal(done.entryPrice, null); // no fill fabricated
  assert.ok(done.voidReason!.includes("void_drift") || done.voidReason!.length > 0);
  assert.equal(done.entryEvidence, "unavailable");
});

test("equity after-hours print excluded -> void_no_quote", () => {
  const { contract } = issueEquityEntryContract({
    signalId: "EQ-6", strategyId: "equity-factor-agreement", strategyVersion: "v",
    parameterHash: "h", signalDate: "2026-10-09", decisionPrice: 100,
    invalidationPrice: 96, target1Price: null, target2Price: null, riskPerUnit: 4,
    issuedBy: "b", issuedAt: "2026-10-09T21:00:00Z",
  });
  const done = resolveEquityEntry(contract, {
    price: 100.1,
    observedAt: contract.entryWindowOpensAt,
    receivedAt: "2026-10-12T13:31:00Z",
    extendedHours: true,
  });
  assert.equal(done.entryState, "void_no_quote");
});

test("equity new entryRule does not trip the legacy research-only evaluator regex", () => {
  assert.ok(!LEGACY_EQUITY_ENTRY_RULE_RE.test("next-xnys-regular-session-open-print"));
  assert.ok(isLegacyEquityEntryRule("prior close — research reference only, paper execution not claimed"));
});

// ---------------------------------------------------------------- crypto
const CRYPTO_DECISION = "2026-10-13T09:00:00.000Z";

function cryptoContract() {
  return issueCryptoEntryContract({
    signalId: 42,
    strategyId: "crypto-dossier-factor-agreement",
    strategyVersion: "frozen-2026-10-12",
    parameterHash: "sha256:def",
    decisionAt: CRYPTO_DECISION,
    decisionPrice: 100,
    decisionSourceObservedAt: "2026-10-13T08:59:50.000Z",
    invalidationPrice: 93.75, // 100 - 1.25*5
    target1Price: 109.375,
    target2Price: 115.625,
    riskPerUnit: 6.25,
    issuedBy: "sandbox-build-1",
    issuedAt: "2026-10-13T09:00:05.000Z",
  });
}

test("crypto contract: 15-min window, venue clock, cohort marker", () => {
  const c = cryptoContract();
  assert.equal(c.entryRule, "first-post-decision-binance-spot-trade");
  assert.equal(c.entryVenue, "binance-spot");
  assert.equal(c.entryWindowOpensAt, CRYPTO_DECISION);
  assert.equal(c.entryWindowExpiresAt, "2026-10-13T09:15:00.000Z");
  assert.equal(c.decisionClock, "server-utc");
  assert.equal(c.driftCapPct, 1.5);
  assert.equal(c.cohortId, "actionable-entry-v1:crypto:elapsed_days:30");
  assert.equal(c.sourceObservationWindow, null);
  assert.equal(c.observationDegraded, false);
});

test("crypto entry: first venue print >= decisionAt (pre-decision prints ignored)", () => {
  const c = cryptoContract();
  const t0 = Date.parse(CRYPTO_DECISION);
  const done = resolveCryptoEntry(c, [
    { price: 99.0, venueTimeMs: t0 - 60_000, receivedAt: "2026-10-13T09:00:01Z" }, // pre-decision: ignored
    { price: 100.8, venueTimeMs: t0 + 42_000, receivedAt: "2026-10-13T09:00:45Z" }, // first eligible
    { price: 101.5, venueTimeMs: t0 + 90_000, receivedAt: "2026-10-13T09:01:35Z" },
  ]);
  assert.equal(done.entryState, "entered");
  assert.equal(done.entryPrice, 100.8); // the FIRST post-decision print, not the later one
  assert.equal(done.entryObservedAt, new Date(t0 + 42_000).toISOString());
  assert.equal(done.entryEvidence, "venue-trade");
});

test("crypto entry: no venue print in window -> void_expired", () => {
  const c = cryptoContract();
  const t0 = Date.parse(CRYPTO_DECISION);
  const done = resolveCryptoEntry(c, [
    { price: 100.1, venueTimeMs: t0 + 16 * 60_000, receivedAt: "2026-10-13T09:16:05Z" }, // after window
  ]);
  assert.equal(done.entryState, "void_expired");
  assert.equal(done.entryPrice, null);
});

test("crypto entry: drift beyond 1.5% -> void_drift", () => {
  const c = cryptoContract();
  const t0 = Date.parse(CRYPTO_DECISION);
  const done = resolveCryptoEntry(c, [
    { price: 102.0, venueTimeMs: t0 + 30_000, receivedAt: "2026-10-13T09:00:35Z" }, // +2%
  ]);
  assert.equal(done.entryState, "void_drift");
  assert.equal(done.entryPrice, null);
});

test("crypto degraded path: null venue time flags observation_degraded, never invents one", () => {
  const c = cryptoContract();
  const done = resolveCryptoEntryDegraded(c, {
    price: 100.5,
    lastUpdated: null, // provider gave no timestamp
    receivedAt: "2026-10-13T09:02:00.000Z",
  });
  assert.equal(done.entryState, "entered");
  assert.equal(done.observationDegraded, true);
  assert.equal(done.entryObservedAt, "2026-10-13T09:02:00.000Z"); // receipt, explicitly degraded
  assert.ok(done.entryEvidenceReason!.includes("degraded"));
});

// ---------------------------------------------------------------- levels
const DECISION_LEVELS = publishDecisionLevels({
  direction: "long",
  basisPrice: 100,
  invalidationPrice: 93.75,
  target1Price: 109.375,
  target2Price: 115.625,
  riskPerUnit: 6.25,
  atr14: 5,
  riskMultiplier: 1.25,
});

test("levels: decision-time invalidation immutable under quote refresh", () => {
  const pkg = { quotePrice: 100, quoteObservedAt: CRYPTO_DECISION, levels: DECISION_LEVELS };
  const refreshed = withRefreshedQuote(pkg, 104.2, "2026-10-13T09:05:00.000Z");
  assert.equal(refreshed.quotePrice, 104.2);
  assert.equal(refreshed.levels.invalidationPrice, 93.75); // quote moved; stop did not
  assert.ok(refreshed.levels === DECISION_LEVELS); // same frozen reference
  assert.ok(Object.isFrozen(refreshed.levels));
  assert.throws(() => {
    "use strict";
    (refreshed.levels as { invalidationPrice: number }).invalidationPrice = 99;
  }, TypeError);
});

test("levels: freeze-at-decision validator passes when published == decision", () => {
  const published = derivePublishedLevels("freeze-at-decision", DECISION_LEVELS, 101.0);
  validatePublishedLevels("freeze-at-decision", DECISION_LEVELS, published, 101.0);
});

test("levels: validator fails loudly on silent rebuild (the crypto bug)", () => {
  // Simulates the VETO-AUDIT finding: veto tested draft stop 93.75 (basis 100),
  // but the ledger published a stop rebuilt around the post-decision quote 101.
  const silentRebuild = buildAtrLevels("long", 101, 5, 1.25); // stop = 94.75
  const published = {
    invalidationPrice: silentRebuild.stop,
    target1Price: silentRebuild.target,
    target2Price: silentRebuild.target2,
    riskPerUnit: silentRebuild.riskPerUnit,
    basisPrice: 101,
    rebuildPolicy: "freeze-at-decision" as const,
  };
  assert.throws(
    () => validatePublishedLevels("freeze-at-decision", DECISION_LEVELS, published, 101),
    (e: unknown) => e instanceof Error && /published invalidationPrice/.test(e.message),
  );
  // And the veto-alignment audit catches tested-stop != published-stop directly.
  assert.throws(
    () => auditVetoStopAlignment(93.75, silentRebuild.stop),
    /did not test the published stop/,
  );
});

test("levels: explicit rebuild-around-entry policy validates when rule is followed", () => {
  const published = derivePublishedLevels("rebuild-around-entry", DECISION_LEVELS, 101.0);
  assert.equal(published.invalidationPrice, 101 - 6.25);
  validatePublishedLevels("rebuild-around-entry", DECISION_LEVELS, published, 101.0);
  // veto must then test the REBUILT stop — audit passes when aligned.
  auditVetoStopAlignment(published.invalidationPrice, published.invalidationPrice);
});

test("levels: validator rejects policy label mismatch", () => {
  const published = derivePublishedLevels("rebuild-around-entry", DECISION_LEVELS, 101.0);
  assert.throws(
    () => validatePublishedLevels("freeze-at-decision", DECISION_LEVELS, published, 101.0),
    /declared rebuild policy/,
  );
});

// ---------------------------------------------------------------- evidence
test("evidence: unavailable marking records reason, keeps entryPrice null, never fabricates", () => {
  const c = cryptoContract();
  const marked = markEvidenceUnavailable(c, "venue feed down during entry window; no trade observed");
  assert.equal(marked.entryEvidence, "unavailable");
  assert.equal(marked.entryEvidenceReason, "venue feed down during entry window; no trade observed");
  assert.equal(marked.entryPrice, null);
  assert.equal(marked.entryState, "pending");
  assert.throws(() => markEvidenceUnavailable(c, ""), /reason is required/);
});

test("evidence: voided contract never carries a fabricated fill price", () => {
  const c = cryptoContract();
  const v = voidContract(c, { entryState: "void_no_quote", voidReason: "no fill evidence available" });
  assert.equal(v.entryPrice, null);
  assert.equal(v.entryEvidence, "unavailable");
  assert.ok(v.entryEvidenceReason!.includes("void_no_quote"));
});

// ---------------------------------------------------------------- state machine
test("state machine: terminal states are final", () => {
  const c = cryptoContract();
  const t0 = Date.parse(CRYPTO_DECISION);
  const entered = resolveCryptoEntry(c, [
    { price: 100.2, venueTimeMs: t0 + 10_000, receivedAt: "2026-10-13T09:00:15Z" },
  ]);
  assert.equal(entered.entryState, "entered");
  assert.throws(() => enterContract(entered, {
    entryObservedAt: CRYPTO_DECISION, entryReceivedAt: CRYPTO_DECISION,
    entryPrice: 100.2, evidence: "venue-trade",
  }), /terminal/);
  assert.throws(() => voidContract(entered, {
    entryState: "void_expired", voidReason: "x",
  }), /terminal/);

  const v = voidContract(cryptoContract(), { entryState: "void_expired", voidReason: "no quote" });
  assert.throws(() => enterContract(v, {
    entryObservedAt: CRYPTO_DECISION, entryReceivedAt: CRYPTO_DECISION,
    entryPrice: 100.2, evidence: "venue-trade",
  }), /terminal/);
});

test("contract guards: bad inputs rejected at construction", () => {
  assert.throws(() => buildContract({
    terminal: "equity", signalId: 1, strategyId: "s", strategyVersion: "v", parameterHash: "h",
    decisionAt: "2026-10-09T20:00:00Z", decisionClock: "server-utc", // wrong clock for equity
    decisionPrice: 100, sourceObservedAt: "2026-10-09T20:00:00Z",
    sourceObservationWindow: null, entryRule: "next-xnys-regular-session-open-print",
    entryVenue: "x", entryWindowOpensAt: "2026-10-12T13:30:00Z",
    entryWindowExpiresAt: "2026-10-12T20:00:00Z", invalidationPrice: 96,
    target1Price: null, target2Price: null, riskPerUnit: 4,
    horizonUnit: "trading_sessions", primaryHorizon: 30, evaluatorCompatibility: "e",
    issuedBy: "b", issuedAt: "2026-10-09T21:00:00Z", driftCapPct: 0.5,
  }), /decisionClock mismatch/);
  assert.throws(() => voidContract(cryptoContract(), {
    entryState: "void_drift", voidReason: "   ", // empty reason rejected
  }), /voidReason is required/);
});

// ---------------------------------------------------------------- legacy
test("legacy: research records untouched, backfill refused, no silent conversion", () => {
  const legacy = freezeLegacy({
    id: "EQ-OLD-7",
    entryRule: "prior completed adjusted close — research reference only, paper execution not claimed",
    entry: 88.4,
  });
  const snapshot = JSON.parse(JSON.stringify(legacy));
  // Run the full new-path machinery; the legacy record is never an input to it.
  const { contract } = issueEquityEntryContract({
    signalId: "EQ-NEW-1", strategyId: "equity-factor-agreement", strategyVersion: "v",
    parameterHash: "h", signalDate: "2026-10-09", decisionPrice: 100,
    invalidationPrice: 96, target1Price: 106, target2Price: 110, riskPerUnit: 4,
    issuedBy: "b", issuedAt: "2026-10-09T21:00:00Z",
  });
  void contract;
  assertLegacyUntouched(snapshot, legacy, "legacy equity row");
  assert.ok(isLegacyEquityEntryRule(legacy.entryRule)); // still classified legacy
  assert.throws(() => refuseBackfill(legacy.id), /refusing backfill/);
  // New contracts never claim to supersede legacy rows.
  const { contract: c2 } = issueEquityEntryContract({
    signalId: "EQ-NEW-2", strategyId: "equity-factor-agreement", strategyVersion: "v",
    parameterHash: "h", signalDate: "2026-10-09", decisionPrice: 100,
    invalidationPrice: 96, target1Price: null, target2Price: null, riskPerUnit: 4,
    issuedBy: "b", issuedAt: "2026-10-09T21:00:00Z",
  });
  assert.equal(c2.supersedes, null);
  assert.equal(
    deriveCohortId("equity", "trading_sessions", 30),
    "actionable-entry-v1:equity:trading_sessions:30",
  );
});

test("calendar: weekends and holidays are not sessions; out-of-range refuses to guess", () => {
  assert.equal(isXnysSession("2026-10-10"), false); // Saturday
  assert.equal(isXnysSession("2026-10-12"), true); // Monday
  assert.equal(isXnysSession("2026-11-26"), false); // Thanksgiving
  assert.equal(nextXnysSession("2026-10-09"), "2026-10-12");
  assert.equal(nextXnysSession("2026-11-25"), "2026-11-27"); // Thanksgiving -> Friday
  assert.throws(() => isXnysSession("2028-01-03"), /refusing to guess/);
  assert.equal(etWallToUtcIso("2026-10-12", "09:30"), "2026-10-12T13:30:00.000Z");
});

test("ungrounded params are explicit and tunable (not hidden constants)", () => {
  assert.equal(DEFAULT_UNGROUNDED_PARAMS.equityDriftCapPct, 0.5);
  assert.equal(DEFAULT_UNGROUNDED_PARAMS.cryptoDriftCapPct, 1.5);
  assert.equal(DEFAULT_UNGROUNDED_PARAMS.cryptoEntryWindowMinutes, 15);
  const custom = { ...DEFAULT_UNGROUNDED_PARAMS, cryptoEntryWindowMinutes: 5 };
  const c = issueCryptoEntryContract({
    signalId: 9, strategyId: "crypto-dossier-factor-agreement", strategyVersion: "v",
    parameterHash: "h", decisionAt: CRYPTO_DECISION, decisionPrice: 100,
    decisionSourceObservedAt: null, invalidationPrice: 93.75,
    target1Price: null, target2Price: null, riskPerUnit: 6.25,
    issuedBy: "b", issuedAt: "2026-10-13T09:00:05Z", params: custom,
  });
  assert.equal(c.entryWindowExpiresAt, "2026-10-13T09:05:00.000Z"); // 5-min window honored
  assert.equal(c.observationDegraded, true); // null sourceObservedAt -> degraded flag
});

console.log(`\n${passed} tests passed${process.exitCode ? " (WITH FAILURES)" : ""}`);
