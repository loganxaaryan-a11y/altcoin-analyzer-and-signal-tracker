// Write-failure capture (fix-neutral; Q6 hardening 2026-10-25).
//
// compactError slices every error to 220 chars, which is why verbatim error
// text was missing from receipts, discovery summaries, theory summaries, and
// intake reasons. This module captures the FULL underlying error — message
// + stack + driver cause chain — into write_failure_captures, subject only
// to the two Q6 bounds below. It is fix-neutral: the capture preserves the
// original driver error so the repair layer can be chosen from evidence.
// It never assumes the null shown in SQL for an autoincrement id is the
// cause, and it never generates replacement ids in artifact code.
//
// Q6 contract:
// - Bounded storage: stored error text is capped at
//   MAX_CAPTURE_ERROR_TEXT_CHARS (with an explicit truncation marker) and
//   the table is pruned to the newest MAX_CAPTURE_ROWS rows by the caller
//   (pruneCountFor decides how many oldest rows to delete), so capture
//   storage cannot grow unbounded.
// - Secrets redacted: API keys, tokens, passwords, authorization headers,
//   and credentials embedded in URLs are redacted BEFORE storage — never
//   stored, even partially. Redaction applies to the error text and the
//   serialized context alike.
// - Operation + schema version: every capture records the operation, the
//   table, and the schema version (the migration level the write ran
//   against) alongside the lane/statement kind.
// - Independent logging fallback: if the capture insert itself fails, the
//   full REDACTED error reaches a sink that does not depend on app.db —
//   a structured server log line plus a bounded in-memory buffer readable
//   via getFallbackWriteFailures() (surfaced by getWriteFailureCaptures) —
//   and the caller still rethrows the ORIGINAL error unchanged.
// - recordWriteFailure performs a SINGLE insert in its own try/catch. It
//   never throws, never runs in a transaction, and never guards on lease
//   or row status. Capture values NEVER carry an id: the table's
//   AUTOINCREMENT assigns it. Capture bypasses compactError entirely.

export const MAX_CAPTURE_ERROR_TEXT_CHARS = 8_000;
export const MAX_CAPTURE_ROWS = 500;
export const MAX_FALLBACK_CAPTURES = 50;
/** Schema version recorded on captures: the migration level of the
 * write_failure_captures table itself (0069 added operation +
 * schema_version). Bump when the capture table's schema changes. */
export const WRITE_FAILURE_SCHEMA_VERSION = "0069";

export type WriteFailureInput = {
  lane: string;
  tableName: string;
  statementKind: string;
  /** Operation name (defaults to `${lane}:${statementKind}`). */
  operation?: string;
  /** Schema version the failed write ran against (defaults to the
   * capture table's own version constant). */
  schemaVersion?: string;
  runId?: string | number | null;
  attemptedKey?: string | null;
  error: unknown;
  context?: Record<string, unknown> | null;
};

export type WriteFailureCaptureValues = {
  occurredAt: Date;
  lane: string;
  tableName: string;
  statementKind: string;
  operation: string;
  schemaVersion: string;
  runId: string | null;
  attemptedKey: string | null;
  errorText: string;
  errorKind: string;
  contextJson: string | null;
};

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  // Authorization / cookie headers, quoted or bare.
  [/(authorization\s*[:=]\s*(?:bearer|basic|token)\s+)[^\s"',;]+/gi, "$1[redacted]"],
  [/(authorization\s*[:=]\s*)[^\s"',;]+/gi, "$1[redacted]"],
  [/((?:set-)?cookie\s*[:=]\s*)[^\n;]+/gi, "$1[redacted]"],
  // Credentials embedded in URLs: scheme://user:pass@host → scheme://[redacted]@host.
  [/([a-z][a-z0-9+.-]*:\/\/)[^/@\s:'"]+:[^/@\s'"]+@/gi, "$1[redacted]@"],
  // Key/value secrets in text, query strings, and JSON-ish payloads.
  [/((?:api[_-]?key|apikey|access[_-]?token|auth[_-]?token|token|secret|password|passwd|pwd|credential|private[_-]?key)\s*["']?\s*[:=]\s*["']?)[^"'\s,;&}]+/gi, "$1[redacted]"],
  // Standalone bearer tokens.
  [/(bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi, "$1[redacted]"],
];

/** Redact secrets from text destined for storage or logs. A credential
 * value is never stored even partially: the whole value is replaced. */
export function redactSecrets(text: string): string {
  let out = text;
  for (const [pattern, replacement] of SECRET_PATTERNS) out = out.replace(pattern, replacement);
  return out;
}

/** Bound stored error text: cap with an explicit truncation marker so a
 * truncated capture is never mistaken for a complete one. */
export function boundErrorText(text: string, cap = MAX_CAPTURE_ERROR_TEXT_CHARS): string {
  if (text.length <= cap) return text;
  const marker = `…[truncated ${text.length - cap} chars at the ${cap}-char capture bound]`;
  return text.slice(0, Math.max(0, cap - marker.length)) + marker;
}

/** Full verbatim error text: message + stack + the whole cause chain.
 * Uncapped at this layer; bounding + redaction happen at storage time
 * in buildWriteFailureCaptureValues. */
export function fullErrorText(error: unknown): string {
  const parts: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;
  let depth = 0;
  while (current !== undefined && current !== null && !seen.has(current) && depth < 16) {
    seen.add(current);
    depth++;
    if (current instanceof Error) {
      parts.push(current.stack ?? `${current.name}: ${current.message}`);
      current = (current as { cause?: unknown }).cause;
    } else if (typeof current === "string") {
      parts.push(current);
      current = undefined;
    } else {
      try { parts.push(JSON.stringify(current)); } catch { parts.push(String(current)); }
      current = undefined;
    }
  }
  return parts.join("\ncaused by: ");
}

export function errorKindOf(error: unknown): string {
  if (error instanceof Error) return error.name || "Error";
  return typeof error;
}

export function buildWriteFailureCaptureValues(input: WriteFailureInput, occurredAt: Date = new Date()): WriteFailureCaptureValues {
  // Deliberately no `id` key: AUTOINCREMENT assigns it on insert.
  const contextJson = input.context ? JSON.stringify(input.context) : null;
  return {
    occurredAt,
    lane: input.lane,
    tableName: input.tableName,
    statementKind: input.statementKind,
    operation: input.operation ?? `${input.lane}:${input.statementKind}`,
    schemaVersion: input.schemaVersion ?? WRITE_FAILURE_SCHEMA_VERSION,
    runId: input.runId === undefined || input.runId === null ? null : String(input.runId),
    attemptedKey: input.attemptedKey ?? null,
    errorText: boundErrorText(redactSecrets(fullErrorText(input.error))),
    errorKind: errorKindOf(input.error),
    contextJson: contextJson ? boundErrorText(redactSecrets(contextJson)) : null,
  };
}

/** Rotation decision: how many OLDEST rows to delete so the table holds
 * at most maxRows after a new insert. Pure — the caller runs the delete. */
export function pruneCountFor(totalRows: number, maxRows = MAX_CAPTURE_ROWS): number {
  return Math.max(0, totalRows - maxRows);
}

// ── Independent fallback sink (does not depend on app.db) ─────────────

export type FallbackWriteFailure = WriteFailureCaptureValues & { captureErrorKind: string };

const fallbackBuffer: FallbackWriteFailure[] = [];

/** Bounded in-memory fallback, newest first. Read by
 * getWriteFailureCaptures so a failure is not lost when the database
 * itself cannot record it. */
export function getFallbackWriteFailures(): FallbackWriteFailure[] {
  return [...fallbackBuffer].reverse();
}

export function clearFallbackWriteFailures(): void {
  fallbackBuffer.length = 0;
}

function pushFallback(values: WriteFailureCaptureValues, captureError: unknown): void {
  fallbackBuffer.push({ ...values, captureErrorKind: errorKindOf(captureError) });
  if (fallbackBuffer.length > MAX_FALLBACK_CAPTURES) fallbackBuffer.splice(0, fallbackBuffer.length - MAX_FALLBACK_CAPTURES);
  // Structured server log line — the sink of last resort.
  console.error(JSON.stringify({ kind: "write_failure_capture_fallback", ...values, occurredAt: values.occurredAt.toISOString(), captureError: boundErrorText(redactSecrets(fullErrorText(captureError))) }));
}

export type CaptureInsertFn = (values: WriteFailureCaptureValues) => Promise<void>;

/**
 * Single capture insert, isolated in its own try/catch. Never throws.
 * Returns { captured: false } when the capture insert itself fails — in
 * that case the redacted capture is pushed to the independent fallback
 * sink (log line + in-memory buffer) so the failure is not lost, and
 * the caller can propagate the ORIGINAL error unchanged.
 */
export async function recordWriteFailure(insert: CaptureInsertFn, input: WriteFailureInput): Promise<{ captured: boolean }> {
  const values = buildWriteFailureCaptureValues(input);
  try {
    await insert(values);
    return { captured: true };
  } catch (captureError) {
    pushFallback(values, captureError);
    return { captured: false };
  }
}

/**
 * Run a write; on failure (after any retry the caller already applied, so
 * exactly one capture row per occurrence) capture the full error, then
 * rethrow the ORIGINAL error — even if the capture itself failed.
 */
export async function captureThenRethrow<T>(insert: CaptureInsertFn, input: Omit<WriteFailureInput, "error">, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    await recordWriteFailure(insert, { ...input, error });
    throw error;
  }
}
