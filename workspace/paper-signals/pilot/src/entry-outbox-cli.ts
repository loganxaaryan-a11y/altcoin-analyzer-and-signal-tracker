/**
 * CLI for the shared entry-transition outbox (paper pilot).
 *
 * PAPER ONLY. Ops + test harness. Never touches the production ledger.
 *
 *   node dist/entry-outbox-cli.js attempt --db <path> --contract <id>
 *       --signal <sid> --candidate <cid> --observed-by <wrapper|watcher>
 *       --observed-at <ISO> [--type ENTRY_CONFIRMED] [--version v1]
 *       [--hold-ms N] [--crash-after-attempt] [--payload-json <json>]
 *
 *   node dist/entry-outbox-cli.js dispatch --db <path>
 *       --sender-mode <ack|noack|throw|crash-after-send> --sends-log <path>
 *
 *   node dist/entry-outbox-cli.js reconcile --db <path> --ack-store <path>
 *       (ack-store: JSON file {event_id: {acked, simulated?, ackId?, ackAt?}}; missing = no evidence)
 *
 *   node dist/entry-outbox-cli.js status --db <path>
 *
 * All commands print JSON to stdout. Exit 0 on success; exit 1 on handled
 * errors (e.g. --crash-after-attempt); exit 137 on crash-after-send.
 */
import { appendFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import {
  attemptEntryConfirmed, dispatchPending, reconcileAfterRestart, outboxCounts,
  listEvents, ENTRY_EVENT_TYPE, ENTRY_EVENT_VERSION,
  type SendFn, type SendOutcome,
} from "./entry-outbox.js";

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) { out[key] = true; continue; }
    out[key] = next;
    i++;
  }
  return out;
}

function str(args: Record<string, string | boolean>, key: string, def?: string): string {
  const v = args[key];
  if (typeof v === "string") return v;
  if (def !== undefined) return def;
  throw new Error(`missing --${key}`);
}

function readAckStore(path: string | undefined): Record<string, { acked: boolean; simulated?: boolean; ackId?: string | null; ackAt?: string | null }> {
  if (!path || !existsSync(path)) return {};
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Record<string, { acked: boolean }>;
  } catch {
    return {};
  }
}

function makeTestSender(mode: string, sendsLog: string): SendFn {
  return (event): SendOutcome => {
    const record = {
      event_id: event.event_id,
      dedup_key: event.dedup_key,
      idempotency_key: event.idempotency_key,
      contract_id: event.contract_id,
      event_type: event.event_type,
      sent_at: new Date().toISOString(),
      claim_id: event.claim_id,
      attempt_n: event.send_count,
      sender_mode: mode,
    };
    if (mode === "crash-after-send") {
      // The send is durably recorded, then the process dies BEFORE any ack
      // processing — the restart test's crash injection.
      mkdirSync(dirname(sendsLog), { recursive: true });
      appendFileSync(sendsLog, JSON.stringify(record) + "\n");
      process.stderr.write(`[test-sender] send recorded for ${event.event_id}; crashing before ack\n`);
      process.exit(137);
    }
    if (mode === "throw") {
      throw new Error("test transport failure (sender-mode=throw)");
    }
    mkdirSync(dirname(sendsLog), { recursive: true });
    appendFileSync(sendsLog, JSON.stringify(record) + "\n");
    if (mode === "ack") {
      return {
        acked: true, simulated: true,
        ackId: `sim-${event.event_id}-n${event.send_count}`,
        transportNote: "SIMULATED acknowledgement — test sender (mode=ack); labeled, never real",
      };
    }
    // noack
    return { acked: false, transportNote: "no ack evidence — test sender (mode=noack)" };
  };
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  if (cmd === "attempt") {
    const dbPath = str(args, "db");
    const holdMs = args["hold-ms"] ? Number(args["hold-ms"]) : 0;
    const result = attemptEntryConfirmed(dbPath, {
      contractId: str(args, "contract"),
      eventType: typeof args.type === "string" ? args.type : ENTRY_EVENT_TYPE,
      eventVersion: typeof args.version === "string" ? args.version : ENTRY_EVENT_VERSION,
      signalId: str(args, "signal"),
      candidateId: str(args, "candidate"),
      observedAt: str(args, "observed-at"),
      observedBy: str(args, "observed-by"),
      payloadJson: typeof args["payload-json"] === "string" ? String(args["payload-json"]) : undefined,
    }, { holdMs });
    console.log(JSON.stringify(result));
    if (args["crash-after-attempt"]) {
      process.stderr.write(`[test] transition accepted=${result.accepted}; crashing before dispatch\n`);
      process.exit(1);
    }
    return;
  }
  if (cmd === "dispatch") {
    const dbPath = str(args, "db");
    const senderMode = str(args, "sender-mode", "ack");
    const sendsLog = str(args, "sends-log");
    const report = await dispatchPending(dbPath, makeTestSender(senderMode, sendsLog));
    console.log(JSON.stringify(report));
    return;
  }
  if (cmd === "reconcile") {
    const dbPath = str(args, "db");
    const store = readAckStore(typeof args["ack-store"] === "string" ? String(args["ack-store"]) : undefined);
    const report = reconcileAfterRestart(dbPath, (event) => {
      const hit = store[event.event_id];
      return hit ? { acked: !!hit.acked, simulated: hit.simulated, ackId: hit.ackId ?? null, ackAt: hit.ackAt ?? null } : null;
    });
    console.log(JSON.stringify(report));
    return;
  }
  if (cmd === "status") {
    const dbPath = str(args, "db");
    console.log(JSON.stringify({ counts: outboxCounts(dbPath), events: listEvents(dbPath) }));
    return;
  }
  console.error("usage: entry-outbox-cli.js <attempt|dispatch|reconcile|status> [flags]");
  process.exit(2);
}

main().catch((err) => {
  console.error(JSON.stringify({ fatal: String(err?.stack ?? err) }));
  process.exit(1);
});
