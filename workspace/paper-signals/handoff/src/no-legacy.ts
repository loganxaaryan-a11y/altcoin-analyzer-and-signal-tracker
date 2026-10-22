/**
 * RUNTIME GUARD: the legacy issuer must never be on the handoff path.
 *
 * Banned on this path (described, never named — the literal identifiers
 * would trip this very guard):
 *   - the legacy crypto issuer's production interface name, and its sandbox
 *     double's name,
 *   - the historical born-dead veto's evaluator name and its reason-prefix
 *     constant,
 *   - the legacy equity born-dead issuance branch name,
 *   - the legacy orchestrator module (superseded by issuance/handler.ts),
 *   - the legacy issuer double modules under issuers/.
 *
 * assertNoLegacyIssuer() reads every handoff source file at startup and
 * THROWS LegacyIssuerBlockedError if any banned identifier appears.
 * The static twin (tests/no-legacy-issuer.test.ts) walks the full import
 * graph and asserts the same property for every transitively reachable
 * handoff module.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export class LegacyIssuerBlockedError extends Error {
  constructor(detail: string) {
    super(`LEGACY ISSUER BLOCKED: ${detail}`);
    this.name = "LegacyIssuerBlockedError";
  }
}

/** Build a banned pattern from fragments so the guard's own source never contains the literal. */
function rx(...parts: string[]): RegExp {
  return new RegExp(parts.join(""), "i");
}

/** Reassemble a banned identifier at runtime (never written literally in source). */
export function bannedName(...parts: string[]): string {
  return parts.join("");
}

/** Banned identifier -> why it is banned. Patterns are fragment-built (see rx). */
export const BANNED: Array<[RegExp, string]> = [
  [rx("issue", "Gener", "atedSignal", "Candidate"), "legacy crypto issuer (production interface)"],
  [rx("sandbox", "Issue", "Gener", "atedSignal", "Candidate"), "legacy crypto issuer sandbox double"],
  [rx("evalu", "ateBorn", "Dead"), "historical born-dead veto"],
  [rx("BORN", "_DEAD_REASON", "_PREFIX"), "born-dead veto vocabulary"],
  [rx("sign", "alIssuance", "Decision"), "legacy equity born-dead issuance branch"],
  [rx("issuers", "/crypto", "-issuer"), "legacy-issuer double module"],
  [rx("issuers", "/equity", "-issuer"), "legacy equity issuer double module"],
  [rx("from\\s+[\"'][^\"']*orchestrator/", "src/orch", "estrator\\.js[\"']"), "legacy orchestrator module (superseded by issuance/handler.ts)"],
  [rx("from\\s+[\"'][^\"']*/", "src/orch", "estrator\\.js[\"']"), "legacy orchestrator module (superseded by issuance/handler.ts)"],
];

/** The banned export names, reassembled at runtime (for the path-identity check). */
export const BANNED_EXPORTS: string[] = [
  bannedName("issue", "Gener", "atedSignal", "Candidate"),
  bannedName("sandbox", "Issue", "Gener", "atedSignal", "Candidate"),
  bannedName("evalu", "ateBorn", "Dead"),
  bannedName("sign", "alIssuance", "Decision"),
];

const here = dirname(fileURLToPath(import.meta.url));

/** Scan one source file for banned identifiers; returns the hits. */
export function scanSourceForLegacy(src: string): string[] {
  const hits: string[] = [];
  for (const [re, why] of BANNED) {
    if (re.test(src)) hits.push(`${re} (${why})`);
  }
  return hits;
}

/**
 * Startup self-check: every handoff source file must be free of banned
 * identifiers. Throws LegacyIssuerBlockedError on the first violation.
 */
export function assertNoLegacyIssuer(srcDir: string = here): void {
  const files = readdirSync(srcDir).filter((f) => f.endsWith(".ts"));
  for (const f of files) {
    const src = readFileSync(join(srcDir, f), "utf8");
    const hits = scanSourceForLegacy(src);
    if (hits.length > 0) {
      throw new LegacyIssuerBlockedError(
        `banned legacy-issuer identifier in handoff source ${f}: ${hits.join("; ")}`,
      );
    }
  }
}

/**
 * Issuance-path identity check: the ONLY issuance entry the handoff may call
 * is processIntegratedCandidate from the repaired integrated handler
 * (orchestrator/src/issuance/handler.ts, compiled). Throws if the resolved
 * module does not export it.
 */
export async function assertRepairedPathIdentity(
  handlerModuleUrl: string = resolveSrc("..", "..", "orchestrator", "dist", "paper-signals", "orchestrator", "src", "issuance", "handler.js"),
): Promise<{ processIntegratedCandidate: Function }> {
  const mod = await import(handlerModuleUrl) as Record<string, unknown>;
  const fn = mod["processIntegratedCandidate"];
  if (typeof fn !== "function") {
    throw new LegacyIssuerBlockedError(
      `repaired issuance path identity failed: ${handlerModuleUrl} does not export processIntegratedCandidate`,
    );
  }
  for (const banned of BANNED_EXPORTS) {
    if (typeof (mod as Record<string, unknown>)[banned] === "function") {
      throw new LegacyIssuerBlockedError(`repaired handler unexpectedly exports banned export ${banned.slice(0, 6)}…`);
    }
  }
  return { processIntegratedCandidate: fn as Function };
}

function resolveSrc(...parts: string[]): string {
  return resolve(here, ...parts);
}
