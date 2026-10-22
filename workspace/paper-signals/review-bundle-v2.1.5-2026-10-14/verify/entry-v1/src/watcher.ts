/**
 * watcher.ts — entry watcher (CORRECTION 4: cadence mismatch). Sandbox only.
 *
 * Problem: a 30-minute scheduler tick can miss a 15-minute crypto entry
 * window entirely. A tick at T+30 observing window [T, T+15] sees only
 * history; any in-window print fetched then is a historical reconstruction,
 * not a timely actionable alert — no position could have been taken at a
 * price 15 minutes in the past.
 *
 * Mechanism: once a pending contract exists, an EntryWatcher polls the venue
 * feed (VenueFeed, injectable — see feed.ts) at a cadence STRICTLY FINER than
 * the entry window and captures the FIRST qualifying print as the entry
 * observation, via the frozen entry-contract API only:
 *   pending contract → entry observation → entered | expired | void_drift
 * (enterContract / voidContract from contract.ts; contract.ts itself is
 * untouched — v1 semantics are frozen.)
 *
 * CADENCE (chosen): 60-second polls inside the 15-minute crypto entry window.
 * Why 60s:
 *  - Strictly finer than the window: ~15 observation chances per window. A
 *    30-minute scheduler tick gives ~0 — the window can open AND close between
 *    two ticks, which is exactly the miss this correction closes.
 *  - Max undetected entry latency ≈ one poll interval + feed latency (~1 min),
 *    well inside the window, so the entry alert is timely and actionable.
 *  - Cost: ~15 lightweight print fetches per contract lifecycle — trivial
 *    against the API budget (spec §3.4 caps quote refreshes at 50/tick).
 *  - Finer (e.g. 10s) would not change the entry outcome: the entry rule is
 *    "first qualifying print" and prints are discrete events — sub-minute
 *    polling burns budget for no additional actionability.
 *  - The cadence is configurable (WatcherConfig.pollIntervalMs), but the
 *    constructor ENFORCES pollIntervalMs < window length structurally: a
 *    cadence coarser than the window cannot observe inside it, so it throws.
 *
 * LIVE vs RECONSTRUCTION (the anti-fabrication boundary):
 *  - LIVE: check() runs while the window is open (nowMs <= entryWindowExpiresAt)
 *    and finds an in-window print observable at poll time → enterContract with
 *    a real EntryObservation. Actionable.
 *  - RECONSTRUCTION: any fetch of in-window prints AFTER the window closed
 *    (nowMs > entryWindowExpiresAt) → reconstruct() labels the result
 *    { kind: "reconstruction", actionable: false }. It is a research record
 *    only: it NEVER calls enterContract, and the contract is void_expired,
 *    never entered from a past print.
 *
 * ALERT DELAYS (persisted fields on EntryWatchRecord):
 *  - setupAlertDelayMs  = setupAlertDeliveredAt - decisionAt
 *  - entryAlertDelayMs  = entryAlertDeliveredAt - entryObservedAt (VENUE ts)
 * The watcher records delivery instants supplied by the alerting layer
 * (markSetupAlertDelivered / buildWatchRecord) and computes the delays; the
 * orchestrator persists the record alongside the contract.
 */

import {
  ActionableEntryContract,
  ContractError,
  Terminal,
  enterContract,
  voidContract,
  type EntryObservation,
} from "./contract.js";
import type { TradePrint, VenueFeed, WatchClock } from "./feed.js";

export interface WatcherConfig {
  /** Poll cadence in ms. Must be strictly finer than the entry window. */
  pollIntervalMs: number;
}

/** Default: 60s polls inside the 15-minute crypto window (see CADENCE above). */
export const DEFAULT_POLL_INTERVAL_MS = 60_000;

export type WatcherCheckResult =
  | {
      status: "entered";
      contract: ActionableEntryContract;
      observation: EntryObservation;
      polls: number;
    }
  | { status: "waiting"; polls: number }
  | { status: "expired"; contract: ActionableEntryContract; polls: number }
  | { status: "drift_void"; contract: ActionableEntryContract; polls: number };

export interface ReconstructionRecord {
  kind: "reconstruction";
  /**
   * Always false AT THE TYPE LEVEL: a reconstruction is never an actionable
   * entry. Any code path that tries to treat it as one fails to typecheck.
   */
  actionable: false;
  signalId: string | number;
  terminal: Terminal;
  /** The (closed) entry window the prints belong to, ISO-8601. */
  windowStart: string;
  windowEnd: string;
  /** Server time of the late fetch, ISO-8601. */
  fetchedAt: string;
  /** In-window historical prints — research record only. */
  prints: TradePrint[];
  reason: string;
}

export type WatchOutcome =
  | "pending"
  | "entered"
  | "expired_no_print"
  | "void_drift"
  | "void_no_quote"
  | "reconstruction";

/**
 * Persisted watch record. The orchestrator stores this alongside the contract;
 * the two delay fields are the correction-4 measurement requirement.
 */
export interface EntryWatchRecord {
  signalId: string | number;
  terminal: Terminal;
  decisionAt: string;
  setupAlertDeliveredAt: string | null;
  /**
   * PERSISTED: setupAlertDeliveredAt - decisionAt (ms).
   * Null until the setup-alert delivery instant is recorded.
   */
  setupAlertDelayMs: number | null;
  /** Venue timestamp of the entry print (null unless entered). */
  entryObservedAt: string | null;
  /** Server receipt time of the entry print (null unless entered). */
  entryReceivedAt: string | null;
  entryAlertDeliveredAt: string | null;
  /**
   * PERSISTED: entryAlertDeliveredAt - entryObservedAt (ms), measured from the
   * VENUE timestamp of the entry print. Null until both instants exist.
   */
  entryAlertDelayMs: number | null;
  /** Watcher polls performed over the contract's life. */
  polls: number;
  outcome: WatchOutcome;
  reconstruction: ReconstructionRecord | null;
  finalizedAt: string;
}

function observationFromContract(
  c: ActionableEntryContract,
): EntryObservation {
  if (
    c.entryState !== "entered" ||
    c.entryObservedAt === null ||
    c.entryReceivedAt === null ||
    c.entryPrice === null
  ) {
    throw new ContractError("observationFromContract: contract is not entered");
  }
  if (c.entryEvidence === "unavailable") {
    throw new ContractError(
      "observationFromContract: entered contract with unavailable evidence",
    );
  }
  return {
    entryObservedAt: c.entryObservedAt,
    entryReceivedAt: c.entryReceivedAt,
    entryPrice: c.entryPrice,
    evidence: c.entryEvidence,
  };
}

export class EntryWatcher {
  private contract: ActionableEntryContract;
  private readonly feed: VenueFeed;
  private readonly clock: WatchClock;
  private readonly pollIntervalMs: number;
  private polls = 0;
  private setupAlertDeliveredAtMs: number | null = null;
  private lastReconstruction: ReconstructionRecord | null = null;

  constructor(
    contract: ActionableEntryContract,
    feed: VenueFeed,
    clock: WatchClock,
    config: Partial<WatcherConfig> = {},
  ) {
    if (contract.entryState !== "pending") {
      throw new ContractError(
        `EntryWatcher requires a pending contract, got ${contract.entryState}`,
      );
    }
    const pollIntervalMs = config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    if (!Number.isFinite(pollIntervalMs) || !(pollIntervalMs > 0)) {
      throw new ContractError(
        `pollIntervalMs must be a finite number > 0, got ${pollIntervalMs}`,
      );
    }
    const windowMs =
      Date.parse(contract.entryWindowExpiresAt) -
      Date.parse(contract.entryWindowOpensAt);
    if (!(pollIntervalMs < windowMs)) {
      throw new ContractError(
        `pollIntervalMs (${pollIntervalMs}ms) must be strictly finer than the entry window ` +
          `(${windowMs}ms): a cadence coarser than the window cannot observe inside it ` +
          `(correction 4 — a 30-minute tick misses a 15-minute window).`,
      );
    }
    this.contract = contract;
    this.feed = feed;
    this.clock = clock;
    this.pollIntervalMs = pollIntervalMs;
  }

  get currentContract(): ActionableEntryContract {
    return this.contract;
  }

  get pollCount(): number {
    return this.polls;
  }

  get cadenceMs(): number {
    return this.pollIntervalMs;
  }

  /**
   * One poll at the current clock time. Idempotent: once the contract reaches
   * a terminal state, further check() calls re-report that state instead of
   * re-entering or re-voiding (scheduler-friendly; terminal states are final
   * per the contract state machine).
   *
   * Live-observation rule: an entry is captured ONLY while the window is open
   * (nowMs <= entryWindowExpiresAt). A poll after the window closed voids the
   * contract as void_expired — it never enters from a past print.
   */
  async check(): Promise<WatcherCheckResult> {
    this.polls += 1;
    const c = this.contract;

    if (c.entryState === "entered") {
      return {
        status: "entered",
        contract: c,
        observation: observationFromContract(c),
        polls: this.polls,
      };
    }
    if (c.entryState !== "pending") {
      return {
        status: c.entryState === "void_drift" ? "drift_void" : "expired",
        contract: c,
        polls: this.polls,
      };
    }

    const nowMs = this.clock.nowMs();
    const opensMs = Date.parse(c.entryWindowOpensAt);
    const expiresMs = Date.parse(c.entryWindowExpiresAt);
    const decisionMs = Date.parse(c.decisionAt);

    if (nowMs > expiresMs) {
      // The window closed with no live entry observation. Any in-window print
      // is now history — void, never enter from a past print. The caller may
      // still call reconstruct() for the research record.
      const voided = voidContract(c, {
        entryState: "void_expired",
        voidReason:
          `entry window [${c.entryWindowOpensAt}, ${c.entryWindowExpiresAt}] closed ` +
          `with no qualifying print observed after ${this.polls} poll(s); a later ` +
          `fetch of an in-window print is historical reconstruction, not an actionable entry.`,
      });
      this.contract = voided;
      return { status: "expired", contract: voided, polls: this.polls };
    }

    const earliestTs = Math.max(decisionMs, opensMs);
    const prints = await this.feed.latestPrints(decisionMs - 1);
    for (const p of prints) {
      // The feed promises ts > sinceTs ascending, but the watcher re-filters:
      // only prints inside [max(decisionAt, windowOpensAt), windowExpiresAt]
      // can qualify, and only prints observable at poll time are served.
      if (!(p.ts >= earliestTs) || p.ts > expiresMs) continue;
      if (
        typeof p.price !== "number" ||
        !Number.isFinite(p.price) ||
        !(p.price > 0)
      ) {
        continue;
      }
      const driftPct =
        ((p.price - c.decisionPrice) / c.decisionPrice) * 100;
      if (Math.abs(driftPct) > c.driftCapPct) {
        // Spec §2.1 state machine: a print outside the drift cap invalidates
        // the contract (void_drift) — favorable-drift fills outside the band
        // are voided (anti-selection-bias), not kept, and not waited out.
        const voided = voidContract(c, {
          entryState: "void_drift",
          voidReason:
            `first in-window print at ${new Date(p.ts).toISOString()} priced ${p.price} ` +
            `drifted ${driftPct.toFixed(4)}% from decision ${c.decisionPrice}, beyond the ` +
            `${c.driftCapPct}% cap.`,
          driftedPrice: p.price,
        });
        this.contract = voided;
        return { status: "drift_void", contract: voided, polls: this.polls };
      }
      const observation: EntryObservation = {
        entryObservedAt: new Date(p.ts).toISOString(),
        entryReceivedAt: new Date(nowMs).toISOString(),
        entryPrice: p.price,
        evidence: "venue-trade",
      };
      const entered = enterContract(c, observation);
      this.contract = entered;
      return {
        status: "entered",
        contract: entered,
        observation,
        polls: this.polls,
      };
    }
    return { status: "waiting", polls: this.polls };
  }

  /**
   * LATE FETCH of in-window prints AFTER the window closed.
   *
   * Labels the result "reconstruction" (research record only — NEVER an
   * actionable entry: no position could have been taken at a past print).
   * This function NEVER calls enterContract; that is enforced by construction
   * (there is no code path from here to enterContract) and by the
   * `actionable: false` literal type on the returned record.
   *
   * If the contract is still pending, it is voided as void_expired — the
   * window lapsed with no live observation. Throws if the window is still
   * open: a fetch inside the window is a live observation, use check().
   */
  reconstruct(
    prints: TradePrint[],
    fetchedAtMs?: number,
  ): ReconstructionRecord {
    const c = this.contract;
    const nowMs = fetchedAtMs ?? this.clock.nowMs();
    const opensMs = Date.parse(c.entryWindowOpensAt);
    const expiresMs = Date.parse(c.entryWindowExpiresAt);
    const decisionMs = Date.parse(c.decisionAt);
    if (nowMs <= expiresMs) {
      throw new ContractError(
        "reconstruct() is for post-window late fetches only: the entry window " +
          "is still open — use check() to observe live.",
      );
    }
    const earliestTs = Math.max(decisionMs, opensMs);
    const inWindow = prints
      .filter(
        (p) =>
          p.ts >= earliestTs &&
          p.ts <= expiresMs &&
          typeof p.price === "number" &&
          Number.isFinite(p.price) &&
          p.price > 0,
      )
      .sort((a, b) => a.ts - b.ts)
      .map(({ ts, price, venue }) => ({ ts, price, venue }));
    const firstTs =
      inWindow.length > 0 ? new Date(inWindow[0].ts).toISOString() : null;
    const record: ReconstructionRecord = {
      kind: "reconstruction",
      actionable: false,
      signalId: c.signalId,
      terminal: c.terminal,
      windowStart: c.entryWindowOpensAt,
      windowEnd: c.entryWindowExpiresAt,
      fetchedAt: new Date(nowMs).toISOString(),
      prints: inWindow,
      reason:
        `late fetch at ${new Date(nowMs).toISOString()}: ${inWindow.length} ` +
        `in-window historical print(s)` +
        (firstTs ? ` (first ${firstTs})` : "") +
        `; entry window closed at ${c.entryWindowExpiresAt} — historical ` +
        `reconstruction for research records, NEVER an actionable entry ` +
        `(no position could have been taken at a past print).`,
    };
    if (c.entryState === "pending") {
      this.contract = voidContract(c, {
        entryState: "void_expired",
        voidReason:
          "entry window closed with no live entry observation; late fetch " +
          "labeled reconstruction (research record only, not an actionable entry).",
      });
    }
    this.lastReconstruction = record;
    return record;
  }

  /**
   * Record the setup-alert delivery instant (supplied by the alerting layer).
   * Feeds the persisted setupAlertDelayMs = deliveredAt - decisionAt.
   */
  markSetupAlertDelivered(atMs: number): void {
    const decisionMs = Date.parse(this.contract.decisionAt);
    if (!Number.isFinite(atMs) || atMs < decisionMs) {
      throw new ContractError(
        `setup alert delivery time must be >= decisionAt (${this.contract.decisionAt}), got ${atMs}`,
      );
    }
    this.setupAlertDeliveredAtMs = atMs;
  }

  /**
   * Build the persisted watch record with both alert-delay measurements:
   *   setupAlertDelayMs = setupAlertDeliveredAt - decisionAt
   *   entryAlertDelayMs = entryAlertDeliveredAt - entryObservedAt (VENUE ts)
   * Either delay is null until both of its instants are known — a delay is
   * never fabricated.
   */
  buildWatchRecord(
    opts: { entryAlertDeliveredAtMs?: number | null } = {},
  ): EntryWatchRecord {
    const c = this.contract;
    const decisionMs = Date.parse(c.decisionAt);
    const setupAtMs = this.setupAlertDeliveredAtMs;
    const entryAlertAtMs = opts.entryAlertDeliveredAtMs ?? null;
    const entryObservedMs =
      c.entryObservedAt !== null ? Date.parse(c.entryObservedAt) : null;

    let outcome: WatchOutcome;
    if (this.lastReconstruction !== null) outcome = "reconstruction";
    else if (c.entryState === "entered") outcome = "entered";
    else if (c.entryState === "void_expired") outcome = "expired_no_print";
    else if (c.entryState === "void_drift") outcome = "void_drift";
    else if (c.entryState === "void_no_quote") outcome = "void_no_quote";
    else outcome = "pending";

    return {
      signalId: c.signalId,
      terminal: c.terminal,
      decisionAt: c.decisionAt,
      setupAlertDeliveredAt:
        setupAtMs !== null ? new Date(setupAtMs).toISOString() : null,
      setupAlertDelayMs: setupAtMs !== null ? setupAtMs - decisionMs : null,
      entryObservedAt: c.entryObservedAt,
      entryReceivedAt: c.entryReceivedAt,
      entryAlertDeliveredAt:
        entryAlertAtMs !== null ? new Date(entryAlertAtMs).toISOString() : null,
      entryAlertDelayMs:
        entryAlertAtMs !== null && entryObservedMs !== null
          ? entryAlertAtMs - entryObservedMs
          : null,
      polls: this.polls,
      outcome,
      reconstruction: this.lastReconstruction,
      finalizedAt: new Date(this.clock.nowMs()).toISOString(),
    };
  }
}
