/**
 * REAL IMPORT — not vendored. These are the live equity measurement functions,
 * imported directly from the terminal source tree via relative import.
 *
 * Source: ~/workspace/goals/research-terminal/hidden_files/source-export-2026-10-13/
 *         equity/server/src/measurement.ts  (zero imports; DB-free, importable cleanly)
 *
 *   reconstructAndValidateEquityCandidate   measurement.ts:304
 *   evaluateEquityIssuanceGate              measurement.ts:291
 *   computeEquityDecisionFromRawInputs      measurement.ts:236
 *
 * Loading note: the source tree carries no `"type": "module"` package.json,
 * so TypeScript compiles measurement.ts as CommonJS. This module therefore
 * loads it via createRequire (types still come from the real source through
 * `typeof import(...)`, so there is no `any` leakage and no copied logic).
 *
 * Because this is a live import (not a copy), drift is impossible at runtime —
 * whatever the source says is what runs. The sandbox equity issuer uses
 * reconstructAndValidateEquityCandidate exactly as production recordSignal does
 * (equity/server/src/actions.ts:448-458): rebuild the candidate from the
 * evidence window, then let evaluateEquityIssuanceGate (born-dead veto, then
 * short-regime bearish-structure gate) decide.
 */
import { createRequire } from "node:module";

const MEASUREMENT_PATH = "../../../../hidden_files/source-export-2026-10-13/equity/server/src/measurement.cjs";
type MeasurementModule = typeof import("../../../../hidden_files/source-export-2026-10-13/equity/server/src/measurement.js");

const require = createRequire(import.meta.url);
const measurement = require(MEASUREMENT_PATH) as MeasurementModule;

export const reconstructAndValidateEquityCandidate = measurement.reconstructAndValidateEquityCandidate;
export const evaluateEquityIssuanceGate = measurement.evaluateEquityIssuanceGate;
export const computeEquityDecisionFromRawInputs = measurement.computeEquityDecisionFromRawInputs;
export type { DailyEvidenceBar } from "../../../../hidden_files/source-export-2026-10-13/equity/server/src/measurement.js";
