/**
 * Post-build fixup: the terminal source tree has no `"type": "module"`, so tsc
 * compiles measurement.ts as CommonJS. Under this package's `"type": "module"`,
 * Node refuses to load CJS syntax from a `.js` file, so rename the emitted
 * file to `.cjs` (imported-gates.ts requires the `.cjs` path).
 */
import { existsSync, renameSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const js = resolve(root, "dist", "hidden_files", "source-export-2026-10-13", "equity", "server", "src", "measurement.js");
const cjs = js.replace(/\.js$/, ".cjs");
if (existsSync(js)) {
  renameSync(js, cjs);
  console.log(`postbuild: renamed to ${cjs}`);
} else {
  console.log("postbuild: measurement.js not found (clean build not run?)");
}
