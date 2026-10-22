export const PAPER_INTAKE_REPAIR_ACTIVATED_AT = new Date("2026-10-16T15:13:00.000Z");
export const PAPER_INTAKE_MAX_ITEMS_PER_INVOCATION = 200;
export const PAPER_INTAKE_LEASE_MS = 2 * 60_000;

export type PaperIntakeStatus =
  | "queued"
  | "processing"
  | "processed"
  | "retryable_failure"
  | "overflow_deferred"
  | "processing_expired"
  | "missed_processing";

export type IntakeWorkItem<T> = {
  key: string;
  expiresAt: Date;
  value: T;
};

export type IntakeDisposition = {
  status: PaperIntakeStatus;
  leaseExpiresAt: Date | null;
};

export type IntakeProcessResult = {
  outcome: string;
  reasonCode: string | null;
  reason: string | null;
};

export type IntakeRunResult = {
  processed: number;
  expired: number;
  failed: number;
  overflow: number;
  skippedTerminal: number;
  skippedClaimed: number;
};

export function boundedBatches<T>(items: readonly T[], batchSize: number): T[][] {
  const size = Math.max(1, Math.floor(batchSize));
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) batches.push(items.slice(index, index + size));
  return batches;
}

export function isTerminalIntakeStatus(status: PaperIntakeStatus): boolean {
  return status === "processed" || status === "processing_expired" || status === "missed_processing";
}

/**
 * Runs every non-terminal item in bounded batches. Durable state is delegated
 * to callbacks so retries can resume after a process or invocation failure.
 * Completed items never call process again; an expired lease is reclaimable.
 */
export async function runDurableIntake<T>(input: {
  items: readonly IntakeWorkItem<T>[];
  batchSize: number;
  maxItems: number;
  clock: () => Date;
  load: (item: IntakeWorkItem<T>) => Promise<IntakeDisposition>;
  claim: (item: IntakeWorkItem<T>, now: Date, leaseExpiresAt: Date) => Promise<boolean>;
  handleItem: (item: IntakeWorkItem<T>) => Promise<IntakeProcessResult>;
  complete: (item: IntakeWorkItem<T>, result: IntakeProcessResult, now: Date) => Promise<void>;
  expire: (item: IntakeWorkItem<T>, now: Date) => Promise<void>;
  fail: (item: IntakeWorkItem<T>, error: unknown, now: Date) => Promise<void>;
  overflow: (item: IntakeWorkItem<T>, now: Date) => Promise<void>;
}): Promise<IntakeRunResult> {
  const result: IntakeRunResult = { processed: 0, expired: 0, failed: 0, overflow: 0, skippedTerminal: 0, skippedClaimed: 0 };
  let admitted = 0;
  for (const batch of boundedBatches(input.items, input.batchSize)) {
    for (const item of batch) {
      const disposition = await input.load(item);
      if (isTerminalIntakeStatus(disposition.status)) {
        result.skippedTerminal++;
        continue;
      }
      const now = input.clock();
      if (disposition.status === "processing" && disposition.leaseExpiresAt && disposition.leaseExpiresAt.getTime() > now.getTime()) {
        result.skippedClaimed++;
        continue;
      }
      if (now.getTime() > item.expiresAt.getTime()) {
        await input.expire(item, now);
        result.expired++;
        continue;
      }
      if (admitted >= Math.max(1, Math.floor(input.maxItems))) {
        await input.overflow(item, now);
        result.overflow++;
        continue;
      }
      const claimed = await input.claim(item, now, new Date(now.getTime() + PAPER_INTAKE_LEASE_MS));
      if (!claimed) {
        result.skippedClaimed++;
        continue;
      }
      admitted++;
      try {
        const processed = await input.handleItem(item);
        await input.complete(item, processed, input.clock());
        result.processed++;
      } catch (error) {
        await input.fail(item, error, input.clock());
        result.failed++;
      }
    }
  }
  return result;
}
