// Q3 bounded fetch/checkpoint timing records (expert direction
// 2026-10-25).
//
// Every fetch and checkpoint in discovery and in the per-candidate
// evidence path records: operation name, startedAt, durationMs,
// timeoutMs, outcome, and whether the underlying work was actually
// cancelled. Cancellation is verified where the transport supports it
// (AbortSignal): settleFeedWithAbort passes an AbortSignal into the
// work factory and, on timeout, aborts and verifies the work observed
// the abort. Where a transport ignores the signal, the record says so
// explicitly (cancellation: "unsupported") instead of claiming a cancel
// that never happened.
//
// Late writes: a run-scoped write must check the budget/lease state
// before writing. guardedWrite does that check, skips the write when
// the budget has fired or the lease is fenced, and records the skip —
// it never writes into a fenced run.

export type TimingOutcome = "available" | "unavailable" | "timeout" | "completed" | "skipped_late_write";
export type CancellationState = "verified" | "unsupported" | "not_needed";

export type TimingRecord = {
  operation: string;
  startedAt: string;
  durationMs: number;
  timeoutMs: number;
  outcome: TimingOutcome;
  /** True only when the underlying work was actually cancelled. */
  cancelled: boolean;
  cancellation: CancellationState;
  cancellationNote: string | null;
};

export class TimingRecorder {
  readonly records: TimingRecord[] = [];
  constructor(private readonly maxRecords = 500) {}
  add(record: TimingRecord): void {
    this.records.push(record);
    if (this.records.length > this.maxRecords) this.records.splice(0, this.records.length - this.maxRecords);
  }
  record(args: Omit<TimingRecord, "startedAt" | "durationMs"> & { startedAtMs: number; endedAtMs: number }): TimingRecord {
    const record: TimingRecord = {
      operation: args.operation,
      startedAt: new Date(args.startedAtMs).toISOString(),
      durationMs: Math.max(0, args.endedAtMs - args.startedAtMs),
      timeoutMs: args.timeoutMs,
      outcome: args.outcome,
      cancelled: args.cancelled,
      cancellation: args.cancellation,
      cancellationNote: args.cancellationNote,
    };
    this.add(record);
    return record;
  }
}

export type AbortSettlement<T> =
  | { status: "available"; value: T; timing: TimingRecord }
  | { status: "unavailable"; reason: string; timing: TimingRecord };

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError" || /abort/i.test(error.message));
}

/**
 * Settle work against a hard deadline WITH cancellation. The factory
 * receives an AbortSignal; on timeout the signal is aborted and the
 * settlement waits a short verification window: if the work then
 * settles by rejecting with an abort error (or resolving because it
 * stopped early), cancellation is verified. If the work ignores the
 * signal entirely, the record states cancellation is unsupported for
 * this transport and why — the await is still bounded either way.
 * NEVER throws.
 */
export async function settleFeedWithAbort<T>(
  operation: string,
  timeoutMs: number,
  factory: (signal: AbortSignal) => Promise<T>,
  recorder?: TimingRecorder,
  opts: { verifyWindowMs?: number; now?: () => number } = {},
): Promise<AbortSettlement<T>> {
  const now = opts.now ?? Date.now;
  const startedAtMs = now();
  const controller = new AbortController();
  let work: Promise<T>;
  try {
    work = factory(controller.signal);
  } catch (error) {
    const timing = (recorder ?? new TimingRecorder()).record({
      operation, startedAtMs, endedAtMs: now(), timeoutMs,
      outcome: "unavailable", cancelled: false, cancellation: "not_needed", cancellationNote: null,
    });
    if (!recorder) { /* timing still returned on the settlement */ }
    return { status: "unavailable", reason: error instanceof Error ? error.message.slice(0, 220) : `${operation} failed`, timing };
  }
  // Observe the work's settlement without ever leaving an unhandled
  // rejection behind when the deadline wins the race.
  let settled: { ok: true; value: T } | { ok: false; error: unknown } | null = null;
  const observed = work.then(
    (value) => { settled = { ok: true, value }; },
    (error: unknown) => { settled = { ok: false, error }; },
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<"timeout">((resolve) => { timer = setTimeout(() => resolve("timeout"), timeoutMs); });
  const finished = observed.then(() => "settled" as const);
  const race = await Promise.race([finished, deadline]);
  if (timer !== undefined) clearTimeout(timer);
  if (race === "settled" && settled !== null) {
    const outcome = settled as { ok: true; value: T } | { ok: false; error: unknown };
    const timing = (recorder ?? new TimingRecorder()).record({
      operation, startedAtMs, endedAtMs: now(), timeoutMs,
      outcome: outcome.ok ? "available" : "unavailable", cancelled: false, cancellation: "not_needed", cancellationNote: null,
    });
    if (outcome.ok) return { status: "available", value: outcome.value, timing };
    return { status: "unavailable", reason: outcome.error instanceof Error ? outcome.error.message.slice(0, 220) : `${operation} failed`, timing };
  }
  // Deadline fired: abort and verify whether the work actually stops.
  controller.abort();
  const verifyWindowMs = opts.verifyWindowMs ?? Math.min(250, Math.max(10, timeoutMs));
  let verifyTimer: ReturnType<typeof setTimeout> | undefined;
  const verifyDeadline = new Promise<"window">((resolve) => { verifyTimer = setTimeout(() => resolve("window"), verifyWindowMs); });
  const verifyRace = await Promise.race([observed.then(() => "settled" as const), verifyDeadline]);
  if (verifyTimer !== undefined) clearTimeout(verifyTimer);
  const verified = verifyRace === "settled" && settled !== null && (!(settled as { ok: boolean }).ok ? isAbortError((settled as { ok: false; error: unknown }).error) : true);
  const timing = (recorder ?? new TimingRecorder()).record({
    operation, startedAtMs, endedAtMs: now(), timeoutMs,
    outcome: "timeout",
    cancelled: verified,
    cancellation: verified ? "verified" : "unsupported",
    cancellationNote: verified
      ? null
      : "transport ignored the AbortSignal: the underlying work did not settle after abort within the verification window, so cancellation is unsupported for this transport; only the await was bounded.",
  });
  return { status: "unavailable", reason: `timeout: ${operation} exceeded ${Math.round(timeoutMs / 1000)}s`, timing };
}

// ── Late-write guard ──────────────────────────────────────────────────

export type WriteGuardState = {
  /** True once the stage budget has fired. */
  budgetFired: boolean;
  /** True once the run's lease is fenced/expired. */
  leaseFenced: boolean;
};

/**
 * Run a run-scoped write only while the budget and lease are live.
 * When either has fired, the write is SKIPPED, the skip is recorded in
 * the timing recorder, and { written: false } is returned — a late
 * worker never writes into a fenced run.
 */
export async function guardedWrite(
  recorder: TimingRecorder,
  args: { operation: string; timeoutMs: number; state: WriteGuardState; nowMs?: number },
  write: () => Promise<void>,
): Promise<{ written: boolean; skipReason: string | null }> {
  const nowMs = args.nowMs ?? Date.now();
  if (args.state.budgetFired || args.state.leaseFenced) {
    const skipReason = args.state.budgetFired
      ? "skipped — stage budget already fired; late write refused"
      : "skipped — run lease fenced/expired; late write refused";
    recorder.record({
      operation: args.operation, startedAtMs: nowMs, endedAtMs: nowMs, timeoutMs: args.timeoutMs,
      outcome: "skipped_late_write", cancelled: false, cancellation: "not_needed", cancellationNote: skipReason,
    });
    return { written: false, skipReason };
  }
  await write();
  return { written: true, skipReason: null };
}
