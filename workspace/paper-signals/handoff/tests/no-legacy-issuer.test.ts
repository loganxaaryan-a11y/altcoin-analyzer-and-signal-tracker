/**
 * NO-LEGACY-ISSUER GUARD (static) — discovery->paper handoff.
 *
 * The repaired paper path is processIntegratedCandidate from
 * orchestrator/src/issuance/handler.ts (entry-v1 + waiting-interval veto +
 * venue mapping). This test walks the handoff's module graph starting from
 * src/qualify.ts and src/handoff-run.ts and FAILS if:
 *
 *  (a) any reachable handoff source contains a banned legacy identifier
 *      (issueGeneratedSignalCandidate, sandboxIssueGeneratedSignalCandidate,
 *      evaluateBornDead, BORN_DEAD_REASON_PREFIX, signalIssuanceDecision);
 *  (b) any import edge (static or dynamic-literal) resolves to a banned
 *      module: the legacy orchestrator (src/orchestrator.ts, compiled or
 *      not), the legacy issuer doubles (issuers/crypto-issuer,
 *      issuers/equity-issuer, issuers/sandbox-store);
 *  (c) any resolved import target is outside the explicit allowlist.
 *
 * Allowlisted external targets (frozen repaired executables + read-only
 * venue adapter + node builtins):
 *   orchestrator/dist/.../issuance/handler.js   (the repaired path)
 *   orchestrator/dist/.../persistence/db-store.js (DbStore)
 *   orchestrator/dist/.../clock.js                (manualClock/systemClock)
 *   orchestrator/dist/.../entry-v1/src/feed.js    (ScriptedFeed)
 *   pilot/src/binance.ts                          (read-only Binance.US adapter)
 *   node:* builtins
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { scanSourceForLegacy, BANNED } from "../src/no-legacy.ts";

const BANNED_PATTERNS = BANNED;

const here = dirname(fileURLToPath(import.meta.url));
const HANDOFF_SRC = resolve(here, "..", "src");
const PS = resolve(here, "..", "..");

const ENTRY_POINTS = ["qualify.ts", "handoff-run.ts", "feeds.ts", "ledger-store.ts", "map-candidate.ts", "discovery-types.ts", "no-legacy.ts"];

/** Module targets the handoff may import, relative to paper-signals/. */
const ALLOWLIST = new Set([
  "orchestrator/dist/paper-signals/orchestrator/src/issuance/handler.js",
  "orchestrator/dist/paper-signals/orchestrator/src/persistence/db-store.js",
  "orchestrator/dist/paper-signals/orchestrator/src/clock.js",
  "orchestrator/dist/paper-signals/entry-v1/src/feed.js",
  "pilot/src/binance.ts",
]);

/** Banned module substrings — the legacy issuer and its doubles. */
const BANNED_MODULES = [
  "issuers/crypto-issuer",
  "issuers/equity-issuer",
  "issuers/sandbox-store",
  "src/orchestrator.js", // legacy orchestrator module (source or compiled)
  "gates/crypto-gates",  // vendored born-dead lives here (retained regime gate comes via handler)
  "gates/equity-gates",
];

function rel(p: string): string {
  return relative(PS, p).replace(/\\/g, "/");
}

/** Extract import targets: static `from "..."` and dynamic `import("...")` / `import(resolve(PS, "..."))`. */
function importTargets(src: string): string[] {
  const targets: string[] = [];
  const staticRe = /import\s+(?:type\s+)?[^;]*?\sfrom\s+["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = staticRe.exec(src)) !== null) targets.push(m[1]!);
  // dynamic-literal: import(resolve(PS, "a/b.js")) and import("a/b.js")
  const dynRe = /import\(\s*(?:resolve\([^,]+,\s*)?["']([^"']+)["']/g;
  while ((m = dynRe.exec(src)) !== null) targets.push(m[1]!);
  return targets;
}

function resolveTarget(fromFile: string, spec: string): string | null {
  if (spec.startsWith("node:")) return null; // builtin — fine
  if (spec.startsWith(".") || spec.startsWith("/")) {
    const abs = resolve(dirname(fromFile), spec);
    // type-stripping style: "./x.js" may mean x.ts on disk
    const candidates = [abs, abs.replace(/\.js$/, ".ts"), abs + ".ts"];
    for (const c of candidates) if (existsSync(c)) return c;
    return abs;
  }
  // dynamic-literal PS-relative: import(resolve(PS, "orchestrator/dist/..."))
  if (/^(orchestrator|pilot|veto|entry-v1|comparison)\//.test(spec)) {
    const abs = resolve(PS, spec);
    if (existsSync(abs)) return abs;
    return abs;
  }
  return `BARE:${spec}`;
}

describe("handoff: no legacy issuer on the discovery->paper path (static)", () => {
  it("every handoff source is free of banned legacy identifiers", () => {
    const files = readdirSync(HANDOFF_SRC).filter((f) => f.endsWith(".ts"));
    assert.ok(files.length > 0, "handoff src should not be empty");
    for (const f of files) {
      const src = readFileSync(resolve(HANDOFF_SRC, f), "utf8");
      const hits = scanSourceForLegacy(src);
      assert.deepEqual(hits, [], `${f} contains banned legacy-issuer identifiers: ${hits.join("; ")}`);
    }
  });

  it("no import edge reaches a banned legacy module; all targets allowlisted", () => {
    const seen = new Set<string>();
    const queue = ENTRY_POINTS.map((f) => resolve(HANDOFF_SRC, f));
    const violations: string[] = [];
    while (queue.length > 0) {
      const file = queue.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      if (!existsSync(file)) {
        violations.push(`entry target missing: ${rel(file)}`);
        continue;
      }
      const src = readFileSync(file, "utf8");
      for (const spec of importTargets(src)) {
        if (spec.startsWith("node:")) continue;
        const r = rel(file);
        for (const banned of BANNED_MODULES) {
          if (spec.includes(banned)) {
            violations.push(`${r} imports banned module ${spec} (matches ${banned})`);
          }
        }
        const resolved = resolveTarget(file, spec);
        if (resolved === null) continue;
        if (resolved.startsWith("BARE:")) {
          violations.push(`${r} uses bare specifier ${spec}`);
          continue;
        }
        const rr = rel(resolved);
        if (rr.startsWith("handoff/src/")) {
          queue.push(resolved); // walk the handoff graph
          continue;
        }
        if (!ALLOWLIST.has(rr)) {
          violations.push(`${r} imports non-allowlisted target ${spec} -> ${rr}`);
        }
      }
    }
    assert.deepEqual(violations, [], `import-graph violations:\n${violations.join("\n")}`);
  });

  it("the repaired issuance entry is the only issuance function referenced", () => {
    const qualifySrc = readFileSync(resolve(HANDOFF_SRC, "qualify.ts"), "utf8");
    assert.match(qualifySrc, /processIntegratedCandidate/, "must route through processIntegratedCandidate");
    assert.match(qualifySrc, /issuance\/handler\.js/, "must resolve the repaired integrated handler");
    for (const [re, why] of BANNED_PATTERNS) {
      assert.doesNotMatch(qualifySrc, re, `legacy reference must not appear (${why})`);
    }
  });
});
