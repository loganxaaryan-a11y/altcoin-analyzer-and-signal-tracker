/**
 * Sandbox alert transport (paper pilot).
 *
 * Implements the handler's `deliverAlert` hook: enqueue is the store's
 * appendAlert (inside the outcome transaction); this hook runs afterwards and
 * the handler then marks the alert delivered via markAlertDelivered — enqueue
 * and delivery carry separate timestamps by construction.
 *
 * The transport writes the alert payload to a local outbox file and produces
 * a SIMULATED acknowledgement. The ack is labeled simulated in the payload
 * itself and in the evidence log — it proves the enqueue/deliver/mark
 * sequence ran; it is NOT a real delivery channel.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type { AlertRow } from "./shims.js";
import type { EvidenceLog } from "./evidence.js";

export interface TransportAck {
  alertId: string;
  status: "acknowledged";
  /** Always true: this transport simulates acknowledgement. Labeled, never real. */
  simulated: true;
  transport: "sandbox-file-outbox";
  note: string;
  at: string;
}

export function makeSandboxTransport(outboxDir: string, ev: EvidenceLog) {
  const dir = resolve(outboxDir);
  mkdirSync(dir, { recursive: true });
  return async (alert: AlertRow): Promise<void> => {
    const payload = {
      paper: true,
      transport: "sandbox-file-outbox",
      enqueuedAt: alert.enqueuedAt,
      alert,
      writtenAt: new Date().toISOString(),
    };
    writeFileSync(join(dir, `${alert.id}.json`), JSON.stringify(payload, null, 2));
    const ack: TransportAck = {
      alertId: alert.id,
      status: "acknowledged",
      simulated: true,
      transport: "sandbox-file-outbox",
      note: "SIMULATED acknowledgement — sandbox file outbox; no real delivery channel exists in the paper pilot",
      at: new Date().toISOString(),
    };
    writeFileSync(join(dir, `${alert.id}.ack.json`), JSON.stringify(ack, null, 2));
    ev.log({ step: "alert-delivered", alertId: alert.id, kind: alert.kind, signalId: alert.signalId, candidateId: alert.candidateId, ackSimulated: true, transport: "sandbox-file-outbox" });
  };
}
