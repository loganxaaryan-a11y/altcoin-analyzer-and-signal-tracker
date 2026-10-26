import { describe, expect, test } from "bun:test";
import { boundErrorText, buildWriteFailureCaptureValues, captureThenRethrow, clearFallbackWriteFailures, fullErrorText, getFallbackWriteFailures, MAX_CAPTURE_ERROR_TEXT_CHARS, pruneCountFor, recordWriteFailure, redactSecrets, WRITE_FAILURE_SCHEMA_VERSION, type WriteFailureCaptureValues } from "./write-failure-capture";

// Mocked ctx.db insert surface: captures the values handed to the insert.
function mockCaptureDb(failInsert = false) {
  const rows: WriteFailureCaptureValues[] = [];
  const insert = async (values: WriteFailureCaptureValues): Promise<void> => {
    if (failInsert) throw new Error("capture table unavailable");
    rows.push(values);
  };
  return { rows, insert };
}

const longMessage = `UNIQUE constraint failed: scheduler_invocation_receipts.run_id — driver detail ${"x".repeat(400)} end-of-detail`;

describe("write-failure capture", () => {
  test("capture row holds >220-char verbatim text (message + stack + cause chain), uncapped", async () => {
    const cause = new Error("driver cause: connection reset by peer while writing page 42");
    const error = new Error(longMessage, { cause });
    const { rows, insert } = mockCaptureDb();
    const result = await recordWriteFailure(insert, { lane: "scheduler_receipt", tableName: "scheduler_invocation_receipts", statementKind: "insert", runId: "run-1", attemptedKey: "run-1", error });
    expect(result).toEqual({ captured: true });
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.errorText.length).toBeGreaterThan(220);
    expect(row.errorText).toContain(longMessage);
    expect(row.errorText).toContain("driver cause: connection reset by peer");
    expect(row.errorText).toContain("caused by:");
    expect(row.errorKind).toBe("Error");
    expect(fullErrorText(error).length).toBeGreaterThan(220);
  });

  test("capture inserts carry no id (AUTOINCREMENT assigns it)", async () => {
    const values = buildWriteFailureCaptureValues({ lane: "discovery", tableName: "scan_operations", statementKind: "insert", error: new Error("boom") });
    expect("id" in values).toBe(false);
    expect((values as Record<string, unknown>).id).toBeUndefined();
    const { rows, insert } = mockCaptureDb();
    await recordWriteFailure(insert, { lane: "discovery", tableName: "scan_operations", statementKind: "insert", error: new Error("boom") });
    expect(rows).toHaveLength(1);
    expect("id" in rows[0]!).toBe(false);
  });

  test("capture failure doesn't mask the original error", async () => {
    const original = new Error("original write failed: the real fault");
    const { insert } = mockCaptureDb(true);
    const direct = await recordWriteFailure(insert, { lane: "paper_intake", tableName: "paper_candidate_intake", statementKind: "insert", error: original });
    expect(direct).toEqual({ captured: false });
    let thrown: unknown = null;
    try {
      await captureThenRethrow(insert, { lane: "paper_intake", tableName: "paper_candidate_intake", statementKind: "insert" }, async () => { throw original; });
    } catch (e) { thrown = e; }
    expect(thrown).toBe(original);
  });

  test("captureThenRethrow captures after the work fails and rethrows the original; decision payload unchanged on success", async () => {
    const { rows, insert } = mockCaptureDb();
    const payload = { decision: "processed_new", issued: 3, abstained: 1 };
    const ok = await captureThenRethrow(insert, { lane: "paper_intake", tableName: "paper_candidate_intake", statementKind: "update" }, async () => payload);
    expect(ok).toBe(payload);
    expect(rows).toHaveLength(0);
    const original = new Error("update failed after retry exhausted");
    let thrown: unknown = null;
    try {
      await captureThenRethrow(insert, { lane: "paper_intake", tableName: "paper_candidate_intake", statementKind: "update", attemptedKey: "k1" }, async () => { throw original; });
    } catch (e) { thrown = e; }
    expect(thrown).toBe(original);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.attemptedKey).toBe("k1");
    // The successful decision payload object is untouched by capture.
    expect(payload).toEqual({ decision: "processed_new", issued: 3, abstained: 1 });
  });
});

// Q6 hardening (expert direction 2026-10-25): bounded storage, secrets
// redacted, operation + schema version recorded, and an independent
// fallback reached when the capture insert itself fails — with the
// caller still rethrowing the ORIGINAL error unchanged. Fix-neutral:
// the original driver error and cause chain are preserved verbatim
// subject only to the bound and the redaction; no replacement ids are
// ever generated (the no-id test above still applies to every row).
describe("Q6 write-failure capture hardening", () => {
  test("capture is bounded: stored error text is capped with an explicit truncation marker, and rotation prunes the oldest rows", () => {
    const huge = new Error(`driver failure ${"y".repeat(MAX_CAPTURE_ERROR_TEXT_CHARS * 2)}`);
    const values = buildWriteFailureCaptureValues({ lane: "discovery", tableName: "scan_operations", statementKind: "insert", error: huge });
    expect(values.errorText.length).toBeLessThanOrEqual(MAX_CAPTURE_ERROR_TEXT_CHARS);
    expect(values.errorText).toContain("[truncated");
    expect(values.errorText).toContain("driver failure");
    // Under the cap, text passes through untouched.
    expect(boundErrorText("short error")).toBe("short error");
    // Rotation: only the overflow is pruned, oldest first by the caller.
    expect(pruneCountFor(500)).toBe(0);
    expect(pruneCountFor(501)).toBe(1);
    expect(pruneCountFor(640)).toBe(140);
  });

  test("secrets are redacted — keys, tokens, passwords, authorization headers, and URL credentials are never stored, even partially", async () => {
    const secret = "sk-live-9f8e7d6c5b4a";
    const error = new Error(`write failed: api_key=${secret} token: hunter2 password="p@ssw0rd!" Authorization: Bearer abcdefgh12345678 url=https://dbuser:dbpass@db.internal:5432/app`, {
      cause: new Error("driver cause: connection refused"),
    });
    const { rows, insert } = mockCaptureDb();
    await recordWriteFailure(insert, { lane: "discovery", tableName: "scan_operations", statementKind: "insert", error, context: { apiKey: secret, note: "context" } });
    const row = rows[0]!;
    for (const text of [row.errorText, row.contextJson ?? ""]) {
      expect(text).not.toContain(secret);
      expect(text).not.toContain("hunter2");
      expect(text).not.toContain("p@ssw0rd!");
      expect(text).not.toContain("abcdefgh12345678");
      expect(text).not.toContain("dbuser:dbpass");
      expect(text).not.toContain("dbpass");
    }
    expect(row.errorText).toContain("[redacted]");
    // The non-secret substance — the original driver error and its cause
    // chain — survives redaction verbatim.
    expect(row.errorText).toContain("write failed:");
    expect(row.errorText).toContain("driver cause: connection refused");
    expect(redactSecrets("plain failure, no secrets")).toBe("plain failure, no secrets");
  });

  test("capture records the operation, the table, and the schema version", async () => {
    const { rows, insert } = mockCaptureDb();
    await recordWriteFailure(insert, { lane: "paper_intake", tableName: "paper_candidate_intake", statementKind: "update", operation: "paper-intake:finalize", schemaVersion: "0069", error: new Error("boom") });
    const row = rows[0]!;
    expect(row.operation).toBe("paper-intake:finalize");
    expect(row.tableName).toBe("paper_candidate_intake");
    expect(row.schemaVersion).toBe("0069");
    // Defaults: operation derives from lane+statement, schema version
    // defaults to the capture table's own version constant.
    const defaulted = buildWriteFailureCaptureValues({ lane: "discovery", tableName: "scan_operations", statementKind: "insert", error: new Error("boom") });
    expect(defaulted.operation).toBe("discovery:insert");
    expect(defaulted.schemaVersion).toBe(WRITE_FAILURE_SCHEMA_VERSION);
  });

  test("fallback is reached when the capture insert itself fails: the redacted failure lands in the independent buffer and the caller still rethrows the ORIGINAL error", async () => {
    clearFallbackWriteFailures();
    const original = new Error("original write failed: token=fallbacksecret123");
    const { insert } = mockCaptureDb(true); // the capture insert itself fails (app.db cannot record it)
    let thrown: unknown = null;
    try {
      await captureThenRethrow(insert, { lane: "history_cache", tableName: "history_cache_state", statementKind: "upsert" }, async () => { throw original; });
    } catch (e) { thrown = e; }
    // The ORIGINAL error object, unchanged — not the capture error.
    expect(thrown).toBe(original);
    const fallback = getFallbackWriteFailures();
    expect(fallback).toHaveLength(1);
    expect(fallback[0]?.tableName).toBe("history_cache_state");
    expect(fallback[0]?.captureErrorKind).toBe("Error");
    // The fallback copy is redacted too — the sink never leaks secrets.
    expect(fallback[0]?.errorText).toContain("original write failed");
    expect(fallback[0]?.errorText).not.toContain("fallbacksecret123");
    clearFallbackWriteFailures();
    expect(getFallbackWriteFailures()).toHaveLength(0);
  });
});
