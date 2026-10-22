import { eq, sql } from "drizzle-orm";
import * as schema from "./schema";
import type { BandGateRead, BandIssuanceState, GateAuditRow, IssuanceGateStore } from "./issuance-gate";

type GateReadRow = { state: "WARNING" | "ISSUANCE_DISABLED" | null; reason: string | null; set_by: string | null; set_at: string | null; revision: number | null };

// SpaceDb is schema-generic and its batch tuple type is intentionally strict.
// The concrete object is supplied by ctx.db<typeof schema>(); explicit `any`
// here keeps the store reusable while every statement remains schema-bound.
export function createDrizzleIssuanceGateStore(db: any): IssuanceGateStore {
  return {
    async readBandGate(band): Promise<BandGateRead> {
      const row = await db.get(sql`
        SELECT s.state, s.reason, s.set_by, s.set_at, COALESCE(r.revision, 0) AS revision
        FROM (SELECT 1) seed
        LEFT JOIN issuance_band_states s ON s.band = ${band}
        LEFT JOIN issuance_band_revisions r ON r.band = ${band}
        LIMIT 1
      `) as GateReadRow | undefined;
      const explicit = row?.state && row.reason && row.set_by && row.set_at
        ? { band, state: row.state, reason: row.reason, setBy: row.set_by, setAt: new Date(row.set_at) }
        : null;
      return { explicit, revision: Number(row?.revision ?? 0) };
    },

    async setBandState(input): Promise<{ state: BandIssuanceState; revision: number }> {
      const now = new Date().toISOString();
      const history = db.insert(schema.issuanceBandStateHistory).values({ band: input.band, fromState: sql`(SELECT state FROM issuance_band_states WHERE band = ${input.band})`, toState: input.state, reason: input.reason, expectancyR: input.expectancyR ?? null, sampleSize: input.sampleSize ?? null, setBy: input.setBy, setAt: now });
      const mutation = input.state === "NORMAL"
        ? db.delete(schema.issuanceBandStates).where(eq(schema.issuanceBandStates.band, input.band))
        : db.insert(schema.issuanceBandStates).values({ band: input.band, state: input.state, reason: input.reason, expectancyR: input.expectancyR ?? null, sampleSize: input.sampleSize ?? null, setBy: input.setBy, setAt: now, updatedAt: now }).onConflictDoUpdate({ target: schema.issuanceBandStates.band, set: { state: input.state, reason: input.reason, expectancyR: input.expectancyR ?? null, sampleSize: input.sampleSize ?? null, setBy: input.setBy, setAt: now, updatedAt: now } });
      const bump = db.insert(schema.issuanceBandRevisions).values({ band: input.band, revision: 1 }).onConflictDoUpdate({ target: schema.issuanceBandRevisions.band, set: { revision: sql`${schema.issuanceBandRevisions.revision} + 1` } });
      await db.batch([history, mutation, bump]);
      const read = await this.readBandGate(input.band);
      return { state: input.state, revision: read.revision };
    },

    async insertGateAudit(row: GateAuditRow): Promise<void> {
      await db.insert(schema.issuanceGateAudits).values({ id: row.id, createdAt: row.createdAt.toISOString(), path: row.path, score: row.score, band: row.band, bandState: row.bandState, decision: row.decision, reason: row.reason, isTest: row.isTest, signalIdentity: row.signalIdentity });
    },

    async listGateAudits(input = {}) {
      const limit = Math.max(1, Math.min(500, input.limit ?? 100));
      const rows = input.band
        ? await db.select().from(schema.issuanceGateAudits).where(eq(schema.issuanceGateAudits.band, input.band)).orderBy(sql`${schema.issuanceGateAudits.createdAt} DESC`).limit(limit)
        : await db.select().from(schema.issuanceGateAudits).orderBy(sql`${schema.issuanceGateAudits.createdAt} DESC`).limit(limit);
      return rows.map((row: typeof schema.issuanceGateAudits.$inferSelect) => ({ ...row, isTest: row.isTest ? 1 : 0 }));
    },

    async listBandStateHistory(band) {
      return band
        ? db.select().from(schema.issuanceBandStateHistory).where(eq(schema.issuanceBandStateHistory.band, band)).orderBy(sql`${schema.issuanceBandStateHistory.id} DESC`)
        : db.select().from(schema.issuanceBandStateHistory).orderBy(sql`${schema.issuanceBandStateHistory.id} DESC`);
    },
  };
}

/** First statement in an atomic SpaceDb batch. On mismatch it deliberately
 * violates revision>=0, causing SQLite to abort every issuance write. */
export function revisionFenceStatement(db: any, band: string, expectedRevision: number): any {
  return db.insert(schema.issuanceBandRevisions).select(sql`SELECT ${band} AS band, -1 AS revision WHERE COALESCE((SELECT revision FROM issuance_band_revisions WHERE band = ${band}), 0) <> ${expectedRevision}`);
}
