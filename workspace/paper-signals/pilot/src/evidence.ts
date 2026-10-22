/** Append-only JSONL evidence log for the paper pilot cycle. One JSON object per line. */
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export class EvidenceLog {
  private readonly path: string;
  constructor(path: string) {
    this.path = resolve(path);
    mkdirSync(dirname(this.path), { recursive: true });
  }
  log(entry: Record<string, unknown>): void {
    appendFileSync(this.path, JSON.stringify({ ts: new Date().toISOString(), paper: true, ...entry }) + "\n");
  }
  get file(): string {
    return this.path;
  }
}

export function utcStamp(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19) + "Z";
}
