import { createHash } from "node:crypto";

/** Deterministic JSON: recursively sorts object keys so content hashes are stable. */
export function stableJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** Content hash mirroring production's `contentHash` usage for idempotency keys. */
export function contentHash(value: unknown): string {
  return sha256Hex(stableJson(value));
}

export function round6(value: number): number {
  return Math.round(value * 1e6) / 1e6;
}

export function isoMs(iso: string): number {
  return Date.parse(iso);
}
