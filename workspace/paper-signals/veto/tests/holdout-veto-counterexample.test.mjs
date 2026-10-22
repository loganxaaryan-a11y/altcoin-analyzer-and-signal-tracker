// VETO-AUDIT counterexample harness (re-runnable: `node veto-counterexample.test.mjs`).
// The veto functions below are VERBATIM copies from the 2026-10-13 source export —
// not reimplementations — so "fires/doesn't fire" is what the actual code does.
//   - crypto evaluateBornDead  <- crypto/server/src/actions.ts:1219-1224
//   - equity signalIssuanceDecision + helpers
//       <- equity/server/src/actions.ts:402-416 (recentLowerHighs :388-401, average :103, round :109)
// No production code touched; no imports from the terminals (their actions.ts modules
// need DB/ctx scaffolding, so the pure veto functions are extracted verbatim instead).

// ---------- VERBATIM: crypto/server/src/actions.ts:1194,1219-1224 ----------
const BORN_DEAD_REASON_PREFIX = "born-dead";
function evaluateBornDead(direction, invalidation, candle) {
  if (!candle || candle.high === null || candle.low === null) return { publish: false, reason: "issuance-validation unavailable: completed signal-day OHLC missing" };
  if (direction === "long" && candle.low <= invalidation) return { publish: false, reason: `${BORN_DEAD_REASON_PREFIX} LONG: signal-day low ${candle.low} <= invalidation ${invalidation}` };
  if (direction === "short" && candle.high >= invalidation) return { publish: false, reason: `${BORN_DEAD_REASON_PREFIX} SHORT: signal-day high ${candle.high} >= invalidation ${invalidation}` };
  return { publish: true, reason: null };
}

// ---------- VERBATIM: equity helpers equity/server/src/actions.ts:103,109,388-401 ----------
function average(values) { return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null; }
function round(value, places = 2) { const f = 10 ** places; return Math.round(value * f) / f; }
function recentLowerHighs(points) {
  const recent = points.slice(-35); if (recent.length < 12) return null;
  const peaks = [];
  for (let index = 2; index < recent.length - 2; index++) {
    const row = recent[index]; const currentHigh = row?.high; if (currentHigh == null) continue;
    const neighbors = [recent[index - 2]?.high, recent[index - 1]?.high, recent[index + 1]?.high, recent[index + 2]?.high];
    const measuredNeighbors = neighbors.filter((value) => value != null);
    if (measuredNeighbors.length === neighbors.length && measuredNeighbors.every((value) => currentHigh >= value)) peaks.push(currentHigh);
  }
  if (peaks.length >= 2) return (peaks.at(-1) ?? Infinity) < (peaks.at(-2) ?? -Infinity);
  const recentHighs = recent.slice(-5).map((row) => row.high).filter((value) => value != null);
  const priorHighs = recent.slice(-10, -5).map((row) => row.high).filter((value) => value != null);
  return recentHighs.length === 5 && priorHighs.length === 5 ? Math.max(...recentHighs) < Math.max(...priorHighs) : null;
}
// ---------- VERBATIM: equity/server/src/actions.ts:402-416 ----------
function signalIssuanceDecision(direction, invalidation, signalDay, history) {
  if (!signalDay || signalDay.open == null || signalDay.low == null || signalDay.high == null) return { allowed: false, reason: `issuance-check unavailable: exact completed signal-day OHLC was not available for ${signalDay?.date ?? "the requested date"}`, belowSma50: null, lowerHighs: null, trend20Negative: null };
  const breached = direction === "long" ? signalDay.low <= invalidation : signalDay.high >= invalidation;
  if (breached) {
    const reason = direction === "long" ? `born-dead LONG: signal-day low ${round(signalDay.low, 4)} <= invalidation ${round(invalidation, 4)}` : `born-dead SHORT: signal-day high ${round(signalDay.high, 4)} >= invalidation ${round(invalidation, 4)}`;
    return { allowed: false, reason, belowSma50: null, lowerHighs: null, trend20Negative: null };
  }
  if (direction === "long") return { allowed: true, reason: null, belowSma50: null, lowerHighs: null, trend20Negative: null };
  const signalIndex = history.findIndex((row) => row.date === signalDay.date); const throughSignalDay = signalIndex >= 0 ? history.slice(0, signalIndex + 1) : history.filter((row) => row.date <= signalDay.date);
  const mean50 = average(throughSignalDay.slice(-50).map((row) => row.close)); const close20Ago = throughSignalDay.at(-21)?.close;
  const belowSma50 = mean50 == null ? null : signalDay.close < mean50;
  const lowerHighs = recentLowerHighs(throughSignalDay);
  const trend20Negative = close20Ago == null ? null : signalDay.close < close20Ago;
  const bearishStructure = belowSma50 === true && (lowerHighs === true || trend20Negative === true);
  return bearishStructure ? { allowed: true, reason: null, belowSma50, lowerHighs, trend20Negative } : { allowed: false, reason: `short-regime: bearish daily structure gate not met on ${signalDay.date}`, belowSma50, lowerHighs, trend20Negative };
}

// ---------- PROPOSED CORRECTED RULE (spec implementation, for contrast only) ----------
// Vetoes only post-decision extremes (strictly after decisionAt) against the FINAL
// published stop. Pre-decision candles can never veto. Same-bar ambiguity: conservative
// (crossed => veto), matching the Phase-1 evaluator's pessimistic same-bar ordering.
function evaluateBornDeadCorrected({ direction, finalStop, decisionAtMs, postDecisionBars }) {
  const usable = (postDecisionBars ?? []).filter((b) => b.ts > decisionAtMs && b.high != null && b.low != null);
  if (!usable.length) return { publish: false, reason: "corrected: no post-decision OHLC evidence; issuance-validation unavailable" };
  const breached = direction === "long"
    ? usable.some((b) => b.low <= finalStop)
    : usable.some((b) => b.high >= finalStop);
  return breached
    ? { publish: false, reason: `corrected born-dead ${direction.toUpperCase()}: post-decision extreme crossed final stop ${finalStop}` }
    : { publish: true, reason: null };
}

// ================= FIXTURES =================
const results = [];
const check = (name, actual, expectedVetoFires, verdict) => {
  const fires = !(actual.publish ?? actual.allowed);
  const ok = fires === expectedVetoFires;
  results.push({ name, fired: fires, reason: actual.reason, expectedToFire: expectedVetoFires, ok, verdict });
};

// --- Case 1 (crypto): yesterday's session crosses the proposed stop, NEW setup forms after ---
// Timeline: yesterday (2026-10-12 UTC) session dips to low 95. Decision made TODAY
// 2026-10-13T09:00Z on full knowledge of yesterday's candle: price recovered to 100,
// fresh dossier factors, draft stop = 100 - 1.25*1.6 = 98. Entry set post-decision via quote.
const c1 = evaluateBornDead("long", 98, { day: "2026-10-12", open: 96, high: 104, low: 95, close: 99, source: "CoinGecko OHLC" });
check("crypto LONG: yesterday's low 95 <= stop 98, setup decided TODAY after the candle completed",
  c1, true, "VETO FIRES on the actual code. Under a correct rule it should NOT fire: the extreme is pre-decision, already observed by the decision factors. This is pre-entry movement (detection delay), not setup invalidation.");

// --- Case 2 (crypto): short-side mirror ---
const c2 = evaluateBornDead("short", 102, { day: "2026-10-12", open: 100, high: 104, low: 97, close: 101, source: "CoinGecko OHLC" });
check("crypto SHORT: yesterday's high 104 >= stop 102, setup decided TODAY after the candle completed",
  c2, true, "VETO FIRES on the actual code. Should NOT: same pre-decision double-count.");

// --- Case 3 (crypto, corrected rule): genuine post-decision breach SHOULD veto ---
// Same setup as Case 1, but an hourly bar AFTER the decision (09:30Z) prints low 97.4 < stop 98.
const decisionAtMs = Date.parse("2026-10-13T09:00:00.000Z");
const c3 = evaluateBornDeadCorrected({
  direction: "long", finalStop: 98, decisionAtMs,
  postDecisionBars: [{ ts: Date.parse("2026-10-13T09:00:00.000Z"), high: 101, low: 99.5 }, { ts: Date.parse("2026-10-13T09:30:00.000Z"), high: 99.8, low: 97.4 }],
});
check("CORRECTED rule: post-decision 09:30Z bar low 97.4 <= final stop 98",
  c3, true, "VETO FIRES — correctly: this is genuine setup invalidation, movement strictly after the decision crossed the actual published stop.");

// --- Case 4 (crypto, corrected rule): Case 1's pre-decision candle does NOT veto ---
const c4 = evaluateBornDeadCorrected({
  direction: "long", finalStop: 98, decisionAtMs,
  postDecisionBars: [{ ts: Date.parse("2026-10-13T09:00:00.000Z"), high: 101, low: 99.5 }, { ts: Date.parse("2026-10-13T09:30:00.000Z"), high: 100.6, low: 99.2 }],
});
check("CORRECTED rule: yesterday's low 95 excluded (pre-decision); post-decision bars hold",
  c4, false, "VETO DOES NOT FIRE — correctly: the completed signal-day candle (strictly before decisionAt) is excluded from the extreme check.");

// --- Case 5 (equity): signal-day bar itself crosses the stop ---
// Equity entry = signal-day close (100). Same-bar low 95 <= stop 98. The extreme happened
// BEFORE any fill could occur at the close — it is pre-entry movement within the entry bar.
const hist = Array.from({ length: 60 }, (_, i) => ({ date: `2026-07-${String(i + 1).padStart(2, "0")}`, open: 100, high: 103, low: 97, close: 100 }));
hist.push({ date: "2026-10-09", open: 99, high: 102, low: 95, close: 100 }); // signal day
const signalDay = hist.at(-1);
const c5 = signalIssuanceDecision("long", 98, signalDay, hist);
check("equity LONG: signal-day (entry-bar) low 95 <= stop 98, entry = that bar's close",
  c5, true, "VETO FIRES on the actual code. Should NOT fire as a stop-out: the crossing is pre-entry (intraday, before the close fill) — and the entry contract explicitly disclaims executability ('paper execution is not claimed'). Genuine check would be post-entry sessions only.");

// ================= REPORT =================
let fails = 0;
for (const r of results) {
  console.log(`\n### ${r.name}`);
  console.log(`  veto fired: ${r.fired}  |  reason: ${r.reason}`);
  console.log(`  verdict: ${r.verdict}`);
  if (!r.ok) { fails++; console.log("  !!! UNEXPECTED outcome vs harness expectation"); }
}
console.log(`\n${results.length - fails}/${results.length} harness expectations held as analyzed.`);
if (fails) process.exitCode = 1;
