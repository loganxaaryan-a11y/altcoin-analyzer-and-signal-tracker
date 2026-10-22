/**
 * Vendor bridge to the compiled paper-signals sandbox modules.
 *
 * The sandbox build ships plain JS with no .d.ts, so these three imports are
 * intentionally untyped (@ts-ignore). They are re-exported here behind the
 * local interface shapes in shims.d.ts — the pilot never redefines
 * handler/store behavior, it only wires deps (feed, transport, evidence).
 * The modules themselves are untouched (read-only use).
 */
// @ts-ignore - compiled sandbox JS ships without type declarations
import { DbStore as DbStoreUntyped } from "../../orchestrator/dist/paper-signals/orchestrator/src/persistence/db-store.js";
// @ts-ignore - compiled sandbox JS ships without type declarations
import { systemClock as systemClockUntyped } from "../../orchestrator/dist/paper-signals/orchestrator/src/clock.js";
// @ts-ignore - compiled sandbox JS ships without type declarations
import { ingestIntegratedCandidate as ingestIntegratedCandidateUntyped, integratedTick as integratedTickUntyped } from "../../orchestrator/dist/paper-signals/orchestrator/src/issuance/handler.js";
import type {
  CandidateRecord, Clock, DbStoreIface, IntegratedDeps, PaperCandidateInput, TickReport,
} from "./shims.js";

export const DbStore: new (filePath: string) => DbStoreIface = DbStoreUntyped;
export const systemClock: () => Clock = systemClockUntyped;
export const ingestIntegratedCandidate: (deps: IntegratedDeps, input: PaperCandidateInput) => Promise<CandidateRecord> = ingestIntegratedCandidateUntyped;
export const integratedTick: (deps: IntegratedDeps) => Promise<TickReport> = integratedTickUntyped;
