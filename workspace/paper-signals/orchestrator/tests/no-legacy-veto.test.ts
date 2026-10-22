/**
 * OLD-VETO GUARD (static) — spec §1.3, task workstream A.
 *
 * The historical-extreme (born-dead) veto must NOT be on the integrated
 * issuance path. This test scans the integrated handler's module graph
 * starting from src/issuance/handler.ts and FAILS if:
 *
 *  (a) the crypto old veto `evaluateBornDead` is reachable as an imported
 *      name (it lives vendored in gates/crypto-gates.ts, which the handler
 *      DOES import — but only for the retained `evaluateShortRegimeGate`;
 *      reachability is name-precise, not file-precise);
 *  (b) the equity born-dead branch `signalIssuanceDecision` — or the
 *      decomposed `evaluateEquityBornDead` — is reachable (the handler keeps
 *      only `evaluateEquityShortRegime`, imported from the separate
 *      decomposition module);
 *  (c) the handler references the legacy issuer doubles or the legacy
 *      orchestrator module (both re-validate with the old veto), or the
 *      "born-dead" reason-string literal appears in the handler's own source.
 *
 * The ONE allowlisted emitter of "born-dead ..." strings on this path is
 * veto/src/veto.ts itself (checkSetupInvalidation's post-decision breach
 * reason: "born-dead LONG: post-decision extreme crossed the final published
 * stop ...") — the corrected veto's own vocabulary, not the legacy veto.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
// At runtime `here` is <paper-signals>/orchestrator/dist/paper-signals/orchestrator/tests;
// the paper-signals/ source root is five levels up.
const PROJECT_ROOT = resolve(here, "..", "..", "..", "..", "..");
const HANDLER = resolve(PROJECT_ROOT, "orchestrator", "src", "issuance", "handler.ts");
const VETO_MODULE = resolve(PROJECT_ROOT, "veto", "src", "veto.ts");

interface ImportEdge {
  names: string[];
  spec: string;
}

/** Parse value imports (`import ... from "spec"`); `import type` is erased at compile and skipped. */
function parseImports(src: string): ImportEdge[] {
  const edges: ImportEdge[] = [];
  const re = /import\s+(type\s+)?([^;]*?)\s+from\s+["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    if (m[1]) continue; // import type — erased, not a runtime edge
    const clause = m[2].trim();
    const spec = m[3];
    const names: string[] = [];
    const ns = clause.match(/^\*\s+as\s+(\w+)/);
    if (ns) {
      names.push("*");
    } else {
      const named = clause.match(/\{([^}]*)\}/);
      if (named) {
        for (const part of named[1].split(",")) {
          const t = part.trim();
          if (!t) continue;
          const orig = t.split(/\s+as\s+/)[0].trim();
          if (orig) names.push(orig);
        }
      } else if (/^[A-Za-z_$][\w$]*$/.test(clause)) {
        names.push("default");
      }
    }
    edges.push({ names, spec });
  }
  return edges;
}

/** Exported value-names of a module (fallback for namespace imports). */
function exportedNames(src: string): string[] {
  const names: string[] = [];
  const re = /export\s+(?:async\s+)?(?:function|const|class)\s+([A-Za-z_$][\w$]*)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) names.push(m[1]);
  return names;
}

function resolveImport(fromFile: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null; // node builtin or package — not part of the sandbox graph
  const base = resolve(dirname(fromFile), spec);
  const candidates = [base, base.replace(/\.js$/, ".ts"), `${base}.ts`];
  for (const c of candidates) {
    try {
      readFileSync(c, "utf8");
      return c;
    } catch {
      /* try next */
    }
  }
  return null;
}

/** Walk the value-import graph; returns every reachable "file::importedName". */
function reachableImportedNames(entry: string): Set<string> {
  const seen = new Set<string>();
  const names = new Set<string>();
  const queue: string[] = [entry];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    const src = readFileSync(file, "utf8");
    for (const edge of parseImports(src)) {
      const target = resolveImport(file, edge.spec);
      if (!target) continue;
      let edgeNames = edge.names;
      if (edgeNames.includes("*")) {
        edgeNames = exportedNames(readFileSync(target, "utf8"));
      }
      for (const n of edgeNames) names.add(`${target}::${n}`);
      if (!seen.has(target)) queue.push(target);
    }
  }
  return names;
}

describe("old-veto guard (static): the legacy born-dead veto is not on the integrated path", () => {
  it("handler.ts exists and the veto module is the only born-dead emitter in the tree", () => {
    readFileSync(HANDLER, "utf8"); // throws if missing
    const vetoSrc = readFileSync(VETO_MODULE, "utf8");
    assert.ok(vetoSrc.includes("born-dead"), "veto.ts must carry the corrected veto's own reason vocabulary");
  });

  it("neither old veto function is reachable from the integrated handler", () => {
    const names = reachableImportedNames(HANDLER);
    const forbidden = ["evaluateBornDead", "signalIssuanceDecision", "evaluateEquityBornDead"];
    const hits: string[] = [];
    for (const key of names) {
      const name = key.split("::")[1];
      if (forbidden.includes(name)) hits.push(key);
    }
    assert.deepEqual(hits, [], `old veto reachable from integrated handler: ${hits.join(", ")}`);
  });

  it("the retained regime gates ARE reachable (the guard must not nuke them)", () => {
    const names = reachableImportedNames(HANDLER);
    const imported = [...names].map((k) => k.split("::")[1]);
    assert.ok(imported.includes("evaluateEquityShortRegime"), "retained equity short-regime gate must be on the path");
    assert.ok(imported.includes("evaluateShortRegimeGate"), "retained crypto short-regime gate must be on the path");
    // The corrected veto on this path after the 2026-10-13 expert-mandated
    // split: runQualificationChecks at step 5 (setup-history filter +
    // pipeline-order + entry-zone) and checkWaitingInterval at step 9b (the
    // genuine decision→entry veto). runIssuanceChecks stays exported from
    // veto.ts for its own unit tests but is no longer on the issuance path.
    assert.ok(imported.includes("runQualificationChecks"), "qualification veto must be on the path");
    assert.ok(imported.includes("checkWaitingInterval"), "waiting-interval veto must be on the path");
    assert.ok(imported.includes("buildPendingContract"), "pending contract builder must be on the path");
    assert.ok(imported.includes("observeEntry"), "entry observation must be on the path");
    assert.ok(imported.includes("checkPostEntryInvalidation"), "post-entry invalidation must be on the path");
  });

  it("handler.ts references no legacy issuance capability and no born-dead literal", () => {
    const src = readFileSync(HANDLER, "utf8");
    const forbiddenTokens = [
      "issuers/equity-issuer",
      "issuers/crypto-issuer",
      "sandboxRecordSignal",
      "sandboxIssueGeneratedSignalCandidate",
      "../orchestrator.js",
      "./orchestrator.js",
      "evaluateBornDead",
      "signalIssuanceDecision",
      "evaluateEquityBornDead",
      "born-dead",
      "BORN_DEAD_REASON_PREFIX",
    ];
    for (const token of forbiddenTokens) {
      assert.ok(!src.includes(token), `handler.ts must not reference legacy veto/issuer capability: ${token}`);
    }
  });
});
